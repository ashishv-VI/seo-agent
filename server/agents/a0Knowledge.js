/**
 * A0 Live Knowledge Engine — extracted from A0_orchestrator.js (Sprint 1, Story M4).
 *
 * LAYER 2 — the live SEO knowledge cache used by the orchestrator:
 *   - getEmbeddedKnowledge2025()  — static embedded fallback snapshot
 *   - loadLiveKnowledge()         — read cached knowledge, refresh if stale (7-day TTL)
 *   - refreshLiveKnowledge()      — fetch fresh knowledge via LLM, cache it
 *   - checkKnowledgeFreshness()   — report cache age / staleness
 *   - buildMasterSystemPrompt()   — compose the SEO-Director system prompt
 *
 * Knowledge auto-refreshes every 7 days. Cache lives in Firestore
 * `system_knowledge/seo_head_knowledge_v4`.
 *
 * Moved verbatim from A0_orchestrator.js — behaviour, prompts, Firestore access,
 * and LLM calls are unchanged.
 */

"use strict";

// ══════════════════════════════════════════════════════════════════════════════
// LAYER 2 — LIVE KNOWLEDGE ENGINE CONSTANTS
// Knowledge auto-refreshes every 7 days from latest SEO news/updates
// ══════════════════════════════════════════════════════════════════════════════
const KNOWLEDGE_CACHE_KEY  = "seo_head_knowledge_v4";
const KNOWLEDGE_TTL_MS     = 7 * 24 * 60 * 60 * 1000; // 7 days
const KNOWLEDGE_CACHE_COLL = "system_knowledge";

const { db }       = require("../config/firebase");
const { callLLM }  = require("../utils/llm");

// ══════════════════════════════════════════════════════════════════════════════
// LAYER 2 — LIVE KNOWLEDGE FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

function getEmbeddedKnowledge2025() {
  return `SEO KNOWLEDGE SNAPSHOT — 2025 (Embedded Fallback)

RECENT ALGORITHM UPDATES:
- March 2025 Core Update: AI-thin content further devalued. First-hand experience rewarded. Forum/Reddit content (UGC) ranking more prominently than ever.
- Helpful Content System: Now fully integrated into core ranking. "Would a user feel satisfied or cheated?" is the key test.
- INP replaced FID (March 2024): Interaction to Next Paint < 200ms is the CWV metric now. FID is dead.
- AI Overviews / SGE: 40%+ of informational queries show AI-generated answers above organic. Zero-click risk is real.
- Link Spam Update (May 2024): Parasite SEO, scaled guest posts, PBNs penalised hard.

WHAT IS WORKING IN 2025:
- Topical Authority Architecture: Deep content hubs beating broad thin sites.
- EEAT Signals: Author bios, credentials, first-hand experience content.
- Reddit/Forum Presence: Google surfacing UGC heavily — brands must be present.
- Digital PR: Original research/data studies = best link magnet in 2025.
- Schema Markup: FAQ, HowTo, Review, Article, Speakable schema = extra SERP real estate.
- Video + Blog pairing: YouTube + written content = double indexing surface.
- GEO (Generative Engine Optimisation): ChatGPT/Perplexity/Gemini visibility via structured, quotable content.
- AEO: Q&A format, FAQ schema, speakable schema for featured snippets.
- Internal Linking: Most underused tactic with highest ROI per hour.

AI SEARCH LANDSCAPE:
- ChatGPT (Bing-powered): Cite Bing-indexed authoritative sources.
- Perplexity: Fresh, clearly factual, well-structured content gets cited.
- Gemini: Google index + brand signals.
- To appear in AI answers: Write clear quotable statements. Be THE primary source on your topic.

WHAT IS DYING:
- AI content published without expert editing or first-hand experience.
- Exact match anchor text in bulk — manual action risk.
- Low-quality guest posts purely for links.
- Thin affiliate pages without real product experience.
- Keyword stuffing in titles, H1s, meta descriptions.
- FID as a CWV metric — it was retired March 2024.

SERP CHANGES:
- Featured snippets still valuable for brand visibility even on zero-click queries.
- INP < 200ms = Good. 200-500ms = Needs work. > 500ms = Poor. Mobile INP usually 3x worse than desktop.
- Core Web Vitals: LCP + INP + CLS are the 3 metrics. Not LCP + FID + CLS.`;
}

async function loadLiveKnowledge(keys) {
  try {
    const doc = await db.collection(KNOWLEDGE_CACHE_COLL).doc(KNOWLEDGE_CACHE_KEY).get();
    if (doc.exists) {
      const data = doc.data();
      const age  = Date.now() - new Date(data.updatedAt).getTime();
      if (age < KNOWLEDGE_TTL_MS) {
        console.log(`[A0-L2] Cached SEO knowledge (${Math.round(age / 3600000)}h old) — using`);
        return data.knowledge;
      }
      console.log(`[A0-L2] Knowledge stale (${Math.round(age / 86400000)}d old) — refreshing...`);
    }
  } catch (e) {
    console.warn(`[A0-L2] Cache read failed: ${e.message}`);
  }
  return await refreshLiveKnowledge(keys);
}

async function refreshLiveKnowledge(keys) {
  console.log(`[A0-L2] Fetching fresh SEO knowledge...`);
  try {
    const prompt = `You are the world's most current SEO expert. Today: ${new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })}.

Provide a current SEO knowledge update covering:
1. Latest Google algorithm updates (last 90 days) — names, dates, main impact
2. What is working right now — top 5 tactics with measurable results
3. What is declining — tactics losing effectiveness
4. AI search landscape (ChatGPT/Perplexity/Gemini) — what content gets cited
5. SERP changes — new features, zero-click trends, INP thresholds

Be specific with dates and names. Flag if uncertain vs confirmed.`;

    const result = await callLLM("system_knowledge", keys, prompt, {
      system: "You are the world's most current SEO knowledge base. Specific, actionable, up-to-date only.",
      maxTokens: 1000,
    });

    const knowledge = result?.content || "";
    if (knowledge.length > 200) {
      await db.collection(KNOWLEDGE_CACHE_COLL).doc(KNOWLEDGE_CACHE_KEY).set({
        knowledge,
        updatedAt: new Date().toISOString(),
        version: "v4",
      }).catch(e => console.warn(`[A0-L2] Cache save failed: ${e.message}`));
      console.log(`[A0-L2] Fresh knowledge fetched and cached (${knowledge.length} chars)`);
      return knowledge;
    }
  } catch (e) {
    console.warn(`[A0-L2] Fetch failed: ${e.message} — using embedded fallback`);
  }
  return getEmbeddedKnowledge2025();
}

function buildMasterSystemPrompt(liveKnowledge) {
  return `You are the world's most experienced and up-to-date SEO Director in ${new Date().getFullYear()}.

Your knowledge combines Brian Dean (Backlinko), Neil Patel, Rand Fishkin, and John Mueller awareness.

TIMELESS PRINCIPLES:
- People-first content: Write for humans, not search engines.
- E-E-A-T: Experience + Expertise + Authoritativeness + Trustworthiness.
- Topical Authority: Be the #1 resource on fewer topics, not mediocre on many.
- Technical Foundation: If Google can't crawl/index it, nothing else matters.
- Intent Match: Rank for what users MEAN, not just what they type.
- Internal Linking: Most underused tactic with highest ROI per hour.
- Data Over Opinion: Every decision backed by metrics.

CURRENT LIVE KNOWLEDGE (${new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })}):
${liveKnowledge}

Always prioritise by BUSINESS IMPACT. Be direct. Be specific. No generic advice.`;
}

async function checkKnowledgeFreshness() {
  try {
    const doc = await db.collection(KNOWLEDGE_CACHE_COLL).doc(KNOWLEDGE_CACHE_KEY).get();
    if (!doc.exists) return { fresh: false, ageHours: null, needsRefresh: true };
    const age = Date.now() - new Date(doc.data().updatedAt).getTime();
    return {
      fresh: age < KNOWLEDGE_TTL_MS,
      ageHours: Math.round(age / 3600000),
      needsRefresh: age >= KNOWLEDGE_TTL_MS,
      updatedAt: doc.data().updatedAt,
    };
  } catch {
    return { fresh: false, ageHours: null, needsRefresh: true };
  }
}

module.exports = {
  getEmbeddedKnowledge2025,
  loadLiveKnowledge,
  refreshLiveKnowledge,
  checkKnowledgeFreshness,
  buildMasterSystemPrompt,
};
