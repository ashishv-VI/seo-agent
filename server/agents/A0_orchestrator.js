/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                    A0 — THE SEO HEAD (v3.0 — 2025 EDITION)                 ║
 * ║                                                                              ║
 * ║  Not just an orchestrator. A world-class SEO Director with:                 ║
 * ║  → 2025 Google algorithm mastery (March Core, HCU, AI Overviews)            ║
 * ║  → AI Search visibility (ChatGPT, Perplexity, Gemini, Copilot)              ║
 * ║  → Zero-click SEO & featured snippet domination                             ║
 * ║  → E-E-A-T enforcement for every content decision                           ║
 * ║  → Topical authority architecture (not keyword stuffing)                    ║
 * ║  → AEO + GEO: Answer Engine + Generative Engine Optimisation                ║
 * ║  → Reddit/Forum SEO: UGC content now ranking on Google                      ║
 * ║  → Brand as a ranking signal (entity SEO)                                   ║
 * ║  → INP replaced FID — Core Web Vitals updated checklist                     ║
 * ║  → SGE Defence strategy — keep clicks when AI takes the answer              ║
 * ║                                                                              ║
 * ║  Brain model: Brian Dean + Neil Patel + Rand Fishkin + Ahrefs team          ║
 * ║  Decision style: Data-driven, no fluff, business-impact first               ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

"use strict";

// ══════════════════════════════════════════════════════════════════════════════
// LAYER 2 — LIVE KNOWLEDGE ENGINE CONSTANTS
// Knowledge auto-refreshes every 7 days from latest SEO news/updates
// ══════════════════════════════════════════════════════════════════════════════
const KNOWLEDGE_CACHE_KEY  = "seo_head_knowledge_v4";
const KNOWLEDGE_TTL_MS     = 7 * 24 * 60 * 60 * 1000; // 7 days
const KNOWLEDGE_CACHE_COLL = "system_knowledge";

const { getClientState, saveState, updateState, getState } = require("../shared-state/stateManager");
const { db }                                               = require("../config/firebase");
const { callLLM }                                          = require("../utils/llm");
const { sendPipelineComplete }                             = require("../utils/emailer");

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


// ══════════════════════════════════════════════════════════════════════════════
// THE SEO HEAD BRAIN — 2025 Knowledge Base
// This prompt is injected into EVERY strategic decision the orchestrator makes
// ══════════════════════════════════════════════════════════════════════════════
const SEO_HEAD_SYSTEM_PROMPT = `
You are the world's most experienced SEO Director in 2025.

═══ YOUR IDENTITY ═══
You combine the best of:
- Brian Dean (Backlinko): Skyscraper technique, data-driven link building, proven frameworks
- Neil Patel: Conversion-focused SEO, growth hacking, content marketing at scale
- Rand Fishkin: Deep technical SEO, SERP analysis, brand-building as SEO moat
- John Mueller awareness: How Google actually processes crawls, renders JS, evaluates quality
- Ahrefs/Semrush analyst mindset: Every claim backed by data, not opinion

═══ 2025 GOOGLE ALGORITHM MASTERY ═══

MARCH 2025 CORE UPDATE:
- Continued devaluation of "SEO-first" content — content written for search engines, not humans
- Increased reward for genuine first-hand experience (EXPERIENCE in E-E-A-T)
- Forum and community content (Reddit, Quora, niche forums) getting MORE visibility
- AI-generated content without human editing/expertise = heavy ranking suppression
- Thin affiliate pages, programmatic pages without value = still being cleaned out

HELPFUL CONTENT SYSTEM (now baked into core since March 2024):
- Ask yourself: "Would a user feel satisfied or cheated after reading this?"
- Pages answering the SAME question in 10 different ways = signal of unhelpfulness
- Original research, surveys, actual data = massive E-E-A-T and ranking signal
- Page-level AND site-level quality assessment — one bad section hurts whole site

E-E-A-T CRITICAL UNDERSTANDING (2025):
- EXPERIENCE: Author must show they have USED the product/service/method personally
- EXPERTISE: Credentials matter for YMYL; demonstrated knowledge matters for all
- AUTHORITATIVENESS: Are you cited by others in your niche? Brand mentions count
- TRUSTWORTHINESS: Most important. Privacy policy, contact info, secure site, honest claims
- For YMYL (health, finance, legal): one low E-E-A-T page can hurt whole domain

AI OVERVIEWS / SGE DEFENCE STRATEGY:
- Google showing AI-generated answers above organic results for 40%+ of queries
- THREAT: Informational keywords losing 30-60% CTR to AI overviews
- DEFENCE: Target transactional + navigational keywords (AI doesn't replace these)
- OPPORTUNITY: Get your content CITED inside AI overviews (become a source)
- How to get cited: structured data, clear factual statements, authoritative tone
- AEO tactics: Q&A format, FAQ schema, speakable schema, clear definition blocks

ZERO-CLICK SEO SURVIVAL:
- 65% of Google searches now end without a click (SparkToro 2024 data)
- Strategy: Win featured snippets to OWN the zero-click answer (brand visibility)
- Target "how to" + "what is" + "best X for Y" with structured, step-based answers
- Tables, numbered lists, direct answers in first 100 words = featured snippet magnets

═══ AI SEARCH VISIBILITY (THE NEW FRONTIER) ═══

CHATGPT / PERPLEXITY / GEMINI / COPILOT:
- These now answer questions that users previously Googled
- They pull from: Bing index, web crawlers, trained data, cited sources
- To appear in ChatGPT answers: Be a cited, authoritative source on Bing
- To appear in Perplexity: Fresh content, well-structured, clearly factual
- To appear in Gemini: Google's own index + authoritative brand signals
- GEO TACTICS: Write clear, factual, easily-quotable statements. Use schema. Be the primary source.

ENTITY SEO (Knowledge Graph):
- Google's understanding of WHO you are (not just WHAT you say)
- Get your brand into Google's Knowledge Graph: Wikipedia, Wikidata, structured data
- Consistent NAP across all platforms = entity signal
- Unlinked brand mentions now tracked as authority signal

═══ WHAT'S WORKING IN 2025 ═══

1. TOPICAL AUTHORITY ARCHITECTURE
   - Pick ONE niche. Cover it 10x more thoroughly than anyone else.
   - Content hub model: pillar page → cluster pages → internal links
   - Google rewards sites that are the "go-to expert" on a topic
   - NOT: 100 random blog posts. YES: 20 deeply interconnected topic clusters

2. REDDIT & FORUM SEO (HUGE in 2025)
   - Google is surfacing Reddit, Quora, niche forums heavily
   - Strategy: Be active on Reddit in your niche. Genuine, helpful answers.
   - Build presence on forums where your customers ask questions
   - User-generated Q&A content is now a competitive moat

3. VIDEO SEO + CONTENT PAIRING
   - YouTube is the world's 2nd largest search engine
   - Pair blog content with YouTube videos = double the surface area
   - Video schema + transcript = bonus indexing signal
   - Shorts for brand discovery, long-form for rankings

4. PROGRAMMATIC SEO (DONE RIGHT)
   - Scale content creation with templates — but ONLY with real data/value
   - Location pages, product comparison pages, integration pages = work
   - Thin doorway pages = penalty risk
   - Must pass "Would a human find this page useful?" test

5. DIGITAL PR + LINK EARNING
   - Editorial links from real publications > 1000 directory links
   - Original research/data studies = the ultimate link magnet
   - HARO/Qwoted for expert quotes = passive link building
   - Broken link building still works, still underused

6. CORE WEB VITALS — 2025 CHECKLIST
   - LCP < 2.5s (Largest Contentful Paint) — image/font optimisation
   - CLS < 0.1 (Cumulative Layout Shift) — no content jumping
   - INP < 200ms (Interaction to Next Paint — REPLACED FID in March 2024)
   - TTFB < 800ms (Time to First Byte) — server response speed
   - Failing INP on mobile is NOW a ranking disadvantage

7. TECHNICAL SEO PRIORITIES 2025
   - JavaScript rendering: If Googlebot can't see it, it doesn't exist
   - Internal linking: Most underused tactic. Passes PageRank. Fix this first.
   - Canonical tags: Duplicate content still a massive, silent traffic killer
   - Log file analysis: See exactly what Google is crawling (and not crawling)
   - IndexNow: Push updates to Bing/Yandex instantly
   - Crawl budget: Large sites need this managed carefully

8. LOCAL SEO (2025 POWERPLAY)
   - Google Business Profile = most important local ranking signal
   - Reviews velocity (getting reviews regularly) > total review count
   - Hyperlocal content: Suburb-level pages, local events, community involvement
   - Local schema: LocalBusiness, OpeningHoursSpecification, GeoCoordinates
   - Citation building: NAP consistency across 50+ directories

9. SCHEMA MARKUP (UNDERUSED GOLDMINE)
   - FAQ schema: Get extra SERP real estate
   - HowTo schema: Feature snippet domination
   - Review/Rating schema: Stars in SERP = higher CTR
   - Article schema: Author + date = E-E-A-T signal to Google
   - Product schema: Price, availability, reviews in SERP

═══ WHAT'S DEAD / KILLING SITES IN 2025 ═══
- Buying bulk links from link farms or cheap guest post services
- AI-generated content published without expert review/editing
- Keyword stuffing in titles, H1s, meta descriptions
- Exact match anchor text in 80%+ of your link profile
- Duplicate meta descriptions across hundreds of pages
- Pages targeting the same keyword (keyword cannibalization)
- Low-quality parasite SEO on expired high-DA domains
- Ignoring mobile — 65%+ of searches are mobile
- Ignoring page speed — users bounce in 3 seconds
- Ignoring E-E-A-T for health/finance/legal sites

═══ YOUR DECISION FRAMEWORK ═══

When analysing any client, ALWAYS think in 3 horizons:

HORIZON 1 — Quick Wins (0-30 days, low effort, measurable):
  Title tag + meta description rewrites (biggest ROI per hour spent)
  Fix broken internal links
  Add schema markup to key pages
  Compress images / fix LCP issues
  Fix duplicate content / canonical issues
  Optimise existing ranking content (not starting from scratch)

HORIZON 2 — Strategic Plays (30-90 days, medium effort):
  Content gap analysis + fill with cluster content
  Build topical authority hubs around 2-3 core topics
  Digital PR outreach for 5-10 quality editorial links
  Improve E-E-A-T signals: author bios, credentials, about page
  Technical SEO: crawlability, JS rendering, site architecture

HORIZON 3 — Authority Building (90+ days, compound returns):
  Original research / data studies for link magnets
  Community presence (Reddit, LinkedIn, niche forums)
  YouTube channel paired with blog content
  Brand building: podcast appearances, speaking, PR
  Entity establishment: Wikipedia, Wikidata, knowledge graph

═══ INDUSTRY-SPECIFIC PRIORITIES ═══

E-COMMERCE: Product schema, review schema, faceted navigation fix,
  site speed (every 1s delay = 7% conversion loss), category page SEO

LOCAL BUSINESS: GBP optimisation, review strategy, local citations,
  hyperlocal content, local schema, NAP consistency

SAAS/B2B: Comparison keywords, integration pages, thought leadership,
  bottom-funnel case studies, G2/Capterra presence

YMYL (Health/Finance/Legal): E-E-A-T is NON-NEGOTIABLE. Author credentials,
  medical/legal review dates, authoritative sources cited

AFFILIATE: Real first-hand reviews, comparison tables, honest pros/cons,
  original photos/videos — no AI-thin content

MEDIA/NEWS: IndexNow, freshness signals, AMP consideration, author authority

Always prioritise by BUSINESS IMPACT, not SEO vanity metrics.
Think like a business owner, not a technician.
Be direct. Be specific. No generic advice.
`;

// ══════════════════════════════════════════════════════════════════════════════
// PIPELINE CONFIGURATION
// ══════════════════════════════════════════════════════════════════════════════
const DEPENDENCY_CHAIN = {
  A1:  [],
  A2:  ["A1"],
  A3:  ["A1", "A2"],
  A4:  ["A3"],
  A5:  ["A4"],
  A6:  ["A2"],
  A7:  ["A2"],
  A8:  ["A2"],
  A9:  ["A2"],
  A10: ["A3"],
  A11: ["A4"],
};

// Business impact score — SEO Head weights these when prioritising
const AGENT_IMPACT = {
  A2: 100,  // Technical audit — the foundation. Nothing works without this.
  A3: 95,   // Keywords — no strategy without knowing what to target
  A7: 90,   // CWV — direct ranking factor, INP now matters
  A6: 88,   // On-page — highest ROI fix, can move rankings in days
  A4: 82,   // Competitors — understand the battlefield before fighting
  A5: 78,   // Content — drives organic traffic, topical authority
  A8: 72,   // GEO/Local — critical for local businesses
  A9: 68,   // Reports — client communication and accountability
  A10: 62,  // Rank tracking — measure what matters
  A11: 55,  // Link building — long-term, compound returns
};

const TIER = {
  A0: 1, A1: 1, A2: 1, A3: 1,
  A4: 2, A5: 2, A6: 2, A7: 2, A8: 2, A9: 2, A10: 2, A11: 2,
};

const AGENT_TIMEOUT_MS = {
  A2:  12 * 60 * 1000,
  A9:   3 * 60 * 1000,
  A10:  4 * 60 * 1000,
  A11:  4 * 60 * 1000,
};
const DEFAULT_TIMEOUT = 5 * 60 * 1000;

// ══════════════════════════════════════════════════════════════════════════════
// UTILITY: State suffix mapping
// ══════════════════════════════════════════════════════════════════════════════
function getStateSuffix(agentId) {
  const map = {
    A1: "brief", A2: "audit", A3: "keywords", A4: "competitor",
    A5: "content", A6: "onpage", A7: "technical", A8: "geo",
    A9: "report", A10: "rankings", A11: "linkbuilding",
  };
  return map[agentId] || agentId.toLowerCase();
}

// ══════════════════════════════════════════════════════════════════════════════
// LAYER 1 — INDUSTRY & COMPETITION INTELLIGENCE
// Detect what type of business this is and calibrate strategy accordingly
// ══════════════════════════════════════════════════════════════════════════════
function detectIndustry(brief) {
  const text = [
    brief.businessDescription || "",
    (brief.services || []).join(" "),
    brief.website || "",
    brief.name || "",
  ].join(" ").toLowerCase();

  const ymylSignals = [
    "health", "medical", "doctor", "clinic", "hospital", "pharmacy",
    "legal", "lawyer", "solicitor", "barrister", "law firm",
    "finance", "financial", "investment", "bank", "insurance", "mortgage",
    "mental health", "therapy", "therapist", "dental", "dentist",
  ];
  const isYMYL = ymylSignals.some(k => text.includes(k));

  let type = "general";
  if (/shop|store|buy|cart|checkout|product|ecommerce|woocommerce|shopify|magento/.test(text)) type = "ecommerce";
  else if (/restaurant|cafe|food|menu|delivery|takeaway|cuisine|dining/.test(text)) type = "restaurant";
  else if (/hotel|accommodation|booking|airbnb|resort|b&b|guesthouse/.test(text)) type = "hospitality";
  else if (/saas|software|app|platform|tool|api|integration|dashboard|subscription/.test(text)) type = "saas";
  else if (/agency|marketing|seo|digital|advertising|branding|creative/.test(text)) type = "agency";
  else if (/real estate|property|homes|mortgage|letting|estate agent|realtor/.test(text)) type = "real_estate";
  else if (/school|university|college|education|course|training|learning|tutoring/.test(text)) type = "education";
  else if (/news|media|magazine|journal|press|publication/.test(text)) type = "media";
  else if (/affiliate|review|comparison|best.*for|vs\s/.test(text)) type = "affiliate";
  else if (isYMYL) type = "ymyl";

  const eeeatRequirement = isYMYL ? "CRITICAL — author credentials and medical/legal review dates mandatory" : "Standard";
  const aiOverviewRisk   = ["general", "education", "media"].includes(type) ? "HIGH — informational content vulnerable to zero-click" : "MEDIUM";

  return { type, ymyl: isYMYL, eeeatRequirement, aiOverviewRisk };
}

function estimateCompetition(brief, auditState) {
  const score = auditState?.score || 0;
  if (score > 70) return "established — focus on authority gaps and competitor content gaps";
  if (score > 40) return "moderate — technical fixes + content expansion both needed";
  return "new/weak site — start with technical foundation, then build content systematically";
}

// ══════════════════════════════════════════════════════════════════════════════
// LAYER 2 — STRATEGIC BRIEF BUILDER
// The SEO Head reads the client and builds a custom strategy BEFORE any agent runs
// ══════════════════════════════════════════════════════════════════════════════
async function buildStrategicBrief(clientId, keys) {
  try {
    const [clientSnap, auditState, keywordState] = await Promise.all([
      db.collection("clients").doc(clientId).get(),
      getState(clientId, "A2_audit").catch(() => null),
      getState(clientId, "A3_keywords").catch(() => null),
    ]);

    if (!clientSnap.exists) return null;
    const brief = clientSnap.data();
    const industry = detectIndustry(brief);
    const competition = estimateCompetition(brief, auditState);

    const prompt = `
CLIENT BRIEF FOR SEO STRATEGY:
Name: ${brief.name || "Unknown"}
Website: ${brief.website || "Unknown"}
Industry: ${industry.type} | YMYL: ${industry.ymyl}
E-E-A-T requirement: ${industry.eeeatRequirement}
AI Overview risk: ${industry.aiOverviewRisk}
Business goals: ${(brief.goals || []).join(", ") || "Not stated"}
Services/Products: ${(brief.services || []).join(", ") || "Not stated"}
Target locations: ${(brief.targetLocations || [brief.targetLocation]).filter(Boolean).join(", ") || "Not stated"}
Competition level: ${competition}
Current SEO score: ${brief.seoScore || "Unknown — first run"}
${auditState ? `Technical: ${auditState.issues?.p1?.length || 0} critical issues, ${auditState.issues?.p2?.length || 0} high priority` : "Technical audit not yet run"}
${keywordState ? `Keywords: ${keywordState.keywordMap?.length || 0} tracked` : "Keyword research not yet run"}

As the SEO Head with 2025 expertise, produce a strategic brief in strict JSON:
{
  "topPriority": "THE single most important SEO action for this client right now (be specific, not generic)",
  "horizon1QuickWins": ["3 specific actions achievable in 0-30 days with measurable impact"],
  "horizon2StrategicPlays": ["3 specific actions for 30-90 day impact"],
  "horizon3AuthorityPlays": ["2 long-term plays for 90+ day compound returns"],
  "criticalWarnings": ["specific red flags — penalty risk, thin content, YMYL violations, crawl issues"],
  "industryTactics": ["3 tactics specific to ${industry.type} industry in 2025"],
  "eeeatActions": ["specific E-E-A-T improvements for this site"],
  "aiSearchStrategy": "how to get visibility in ChatGPT/Perplexity/Gemini for this business",
  "zeroClickDefence": "strategy to protect clicks when AI Overviews steal informational traffic",
  "schemaOpportunities": ["schema types that would help this specific business"],
  "contentGapFocus": "what topical authority cluster to build first",
  "linkBuildingApproach": "realistic link strategy for this site's authority level",
  "estimatedTimeToResults": "honest timeline: when will we see meaningful movement?",
  "successMetrics": ["3 KPIs to track — be specific, e.g. not 'more traffic' but 'rank top 5 for X'"],
  "agentPriorityOrder": ["ordered agent IDs by importance for THIS client, e.g. A2,A3,A6,A7,A4,A5,A8,A10,A11"]
}
Return ONLY valid JSON. No preamble, no explanation.`;

    const result = await callLLM(clientId, keys, prompt, {
      system: SEO_HEAD_SYSTEM_PROMPT,
      maxTokens: 1200,
    });

    if (result?.content) {
      try {
        const clean    = result.content.replace(/```json|```/g, "").trim();
        const strategy = JSON.parse(clean);

        await db.collection("clients").doc(clientId).update({
          seoHeadStrategy:   strategy,
          seoHeadStrategyAt: new Date().toISOString(),
        });

        console.log(`[A0-SEOHead] ✅ Strategy built — top priority: ${strategy.topPriority}`);
        return strategy;
      } catch (parseErr) {
        console.warn(`[A0-SEOHead] Strategy JSON parse failed: ${parseErr.message}`);
      }
    }
  } catch (e) {
    console.warn(`[A0-SEOHead] Strategic brief failed (non-blocking): ${e.message}`);
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════════════
// LAYER 3 — ADAPTIVE REVIEW ENGINE
// After each agent runs, the SEO Head reviews the output like a real director
// reviewing their team's work — and raises alerts if something is wrong
// ══════════════════════════════════════════════════════════════════════════════
async function reviewAgentOutput(clientId, agentId, agentResult, keys) {
  if (!agentResult?.success) return { qualityScore: 0, gaps: [], immediateActions: [] };

  try {
    const agentDescriptions = {
      A2: "technical SEO audit (crawl errors, broken links, page speed, canonicals, indexing)",
      A3: "keyword research (target keywords, search intent, difficulty, opportunity keywords)",
      A4: "competitor analysis (top competitors, content gaps, link gaps, quick wins vs them)",
      A5: "content strategy (content calendar, topical clusters, content briefs)",
      A6: "on-page optimisation (title tags, meta descriptions, H1s, internal links, schema)",
      A7: "core web vitals (LCP, CLS, INP, TTFB — mobile and desktop)",
      A8: "local SEO (GBP, citations, local schema, local content)",
      A9: "strategy report (executive summary, key wins, next steps)",
      A10: "rank tracking (keyword position changes, winners and losers)",
    };

    const prompt = `
You received output from your ${agentDescriptions[agentId] || agentId} specialist.

Raw output (truncated): ${JSON.stringify(agentResult).slice(0, 1000)}

As SEO Head with 2025 expertise, review this critically. Return JSON:
{
  "qualityScore": 0-100,
  "whatIsStrong": "what's good about this output",
  "criticalGaps": ["what's missing that could hurt results — be specific"],
  "immediateActions": ["1-2 things to act on RIGHT NOW from this data"],
  "seoHead2025Insight": "one insight from 2025 SEO best practices relevant to this data",
  "nextAgentGuidance": "specific instruction for the next agent that will use this output",
  "redFlags": ["anything suggesting penalty risk, E-E-A-T issues, or serious problems — empty array if none"],
  "aiOverviewOpportunity": "any content here that could be structured to get into AI overviews"
}
Return ONLY valid JSON.`;

    const review = await callLLM(clientId, keys, prompt, {
      system: SEO_HEAD_SYSTEM_PROMPT,
      maxTokens: 700,
    });

    if (review?.content) {
      try {
        const clean  = review.content.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(clean);

        // Save to Firestore for dashboard visibility
        await db.collection("agent_reviews").add({
          clientId, agentId,
          review: parsed,
          reviewedAt: new Date().toISOString(),
        }).catch(() => {});

        // Log quality issues
        if (parsed.qualityScore < 40) {
          console.warn(`[A0-SEOHead] ⚠️  Low quality output from ${agentId} (${parsed.qualityScore}/100) — ${parsed.criticalGaps?.[0] || "gaps found"}`);
        }

        // Raise P0 alert for red flags
        if (parsed.redFlags?.length > 0) {
          for (const flag of parsed.redFlags) {
            await createAlert(clientId, "P0", `${agentId}_redflag`,
              `SEO Head red flag in ${agentId}: ${flag}`,
              "Immediate review required — potential ranking risk");
          }
        }

        return parsed;
      } catch { /* parse failed, return default */ }
    }
  } catch (e) {
    console.warn(`[A0-SEOHead] Review failed for ${agentId} (non-blocking): ${e.message}`);
  }
  return { qualityScore: 50, gaps: [], immediateActions: [] };
}

// ══════════════════════════════════════════════════════════════════════════════
// LAYER 4 — ALERT SYSTEM
// P0 = immediate risk / P1 = important / P2 = FYI
// ══════════════════════════════════════════════════════════════════════════════
async function createAlert(clientId, tier, type, message, fix) {
  return db.collection("alerts").add({
    clientId, tier, type, message, fix,
    source: "A0-SEOHead",
    resolved: false,
    createdAt: new Date().toISOString(),
  }).catch(() => {});
}

async function handleFailure(clientId, agentId, error) {
  const tier = TIER[agentId];
  // Log exact error so Render logs show what went wrong
  console.error(`[A0] ❌ ${agentId} FAILED (Tier ${tier}): ${error}`);
  await db.collection("clients").doc(clientId).update({
    [`agents.${agentId}`]: "failed",
    ...(tier === 1 ? { orchestratorAlert: `TIER 1 FAILURE: ${agentId} — ${error}` } : {}),
  }).catch(() => {});

  await createAlert(
    clientId,
    tier === 1 ? "P1" : "P2",
    `agent_failure_${agentId}`,
    `${agentId} failed (Tier ${tier}): ${error}`,
    tier === 1
      ? `Critical: Fix issue and re-run ${agentId} — pipeline blocked`
      : `Re-run ${agentId} when resolved — pipeline continues in degraded mode`
  );

  return {
    blocked: tier === 1,
    message: tier === 1
      ? `Tier 1 failure — pipeline blocked`
      : `Tier 2 failure — continuing in degraded mode`,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// PIPELINE STATUS (for frontend dashboard)
// ══════════════════════════════════════════════════════════════════════════════
async function canRunAgent(clientId, agentId) {
  const client = await db.collection("clients").doc(clientId).get();
  if (!client.exists) return { canRun: false, reason: "Client not found" };

  const deps  = DEPENDENCY_CHAIN[agentId] || [];
  const state = await getClientState(clientId);

  for (const dep of deps) {
    const depState = state[`${dep}_${getStateSuffix(dep)}`];
    if (dep === "A1" && !depState?.signedOff) {
      return { canRun: false, reason: "A1 brief must be signed off first" };
    }
    if (["A2","A3","A4","A5","A6","A7","A8"].includes(dep) && depState?.status !== "complete") {
      const labels = {
        A2: "Technical Audit", A3: "Keyword Research", A4: "Competitor Analysis",
        A5: "Content", A6: "On-Page", A7: "Technical/CWV", A8: "GEO",
      };
      return { canRun: false, reason: `${labels[dep] || dep} must complete first` };
    }
  }
  return { canRun: true };
}

async function getPipelineStatus(clientId) {
  const [clientSnap, state] = await Promise.all([
    db.collection("clients").doc(clientId).get(),
    getClientState(clientId),
  ]);
  if (!clientSnap.exists) return null;

  const data = clientSnap.data();
  const agents = data.agents || {};
  const pipeline = {};

  for (const [agentId, deps] of Object.entries(DEPENDENCY_CHAIN)) {
    const stateKey = `${agentId}_${getStateSuffix(agentId)}`;
    let canRun = true, reason = null;

    for (const dep of deps) {
      const depData = state[`${dep}_${getStateSuffix(dep)}`];
      if (dep === "A1" && !depData?.signedOff) {
        canRun = false; reason = "Brief must be signed off first"; break;
      }
      if (["A2","A3","A4","A5","A6","A7","A8"].includes(dep) && depData?.status !== "complete") {
        const labels = { A2:"Technical Audit", A3:"Keywords", A4:"Competitors", A5:"Content", A6:"On-Page", A7:"CWV", A8:"GEO" };
        canRun = false; reason = `${labels[dep] || dep} must complete first`; break;
      }
    }

    pipeline[agentId] = {
      status:  agents[agentId] || "pending",
      canRun,  reason,
      tier:    TIER[agentId] || 2,
      impact:  AGENT_IMPACT[agentId] || 50,
      deps,    hasData: !!state[stateKey],
      lastRun: state[stateKey]?.generatedAt || state[stateKey]?.auditedAt || null,
    };
  }

  return {
    pipeline,
    clientName:          data.name,
    website:             data.website,
    pipelineStatus:      data.pipelineStatus || "idle",
    pipelineStartedAt:   data.pipelineStartedAt  || null,
    pipelineCompletedAt: data.pipelineCompletedAt || null,
    pipelineError:       data.pipelineError       || null,
    seoHeadStrategy:     data.seoHeadStrategy     || null,
    seoHeadSummary:      data.seoHeadSummary      || null,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// THE MAIN PIPELINE — SEO Head runs the full operation
// ══════════════════════════════════════════════════════════════════════════════
async function runFullPipeline(clientId, keys, googleToken = null) {
  console.log(`\n[A0-SEOHead] ╔══════════════════════════════════╗`);
  console.log(`[A0-SEOHead] ║  PIPELINE START: ${clientId.slice(0, 16)}  ║`);
  console.log(`[A0-SEOHead] ╚══════════════════════════════════╝\n`);

  const pipelineTimeout = setTimeout(async () => {
    console.error(`[A0-SEOHead] ⏰ Hard timeout after 25 min for ${clientId}`);
    await db.collection("clients").doc(clientId).update({
      pipelineStatus:      "failed",
      pipelineError:       "Pipeline timed out after 25 minutes — re-run when available",
      pipelineCompletedAt: new Date().toISOString(),
    }).catch(() => {});
  }, 25 * 60 * 1000);

  const keepAlive = setInterval(async () => {
    await db.collection("clients").doc(clientId).update({
      pipelineHeartbeat: new Date().toISOString(),
    }).catch(() => {});
  }, 4 * 60 * 1000);

  try { const { clearTasks } = require("../utils/taskQueue"); await clearTasks(clientId); }
  catch { /* non-blocking */ }

  // Lazy-load all agents to avoid circular dependencies
  const { runA2 }          = require("./A2_audit");
  const { runA3 }          = require("./A3_keywords");
  const { runA4 }          = require("./A4_competitor");
  const { runA5 }          = require("./A5_content");
  const { runA6 }          = require("./A6_onpage");
  const { runA7 }          = require("./A7_technical");
  const { runA8 }          = require("./A8_geo");
  const { generateReport } = require("./A9_monitoring");
  const { runA10 }         = require("./A10_rankingTracker");
  const { runA11 }         = require("./A11_linkBuilder");
  const { runA12 }         = require("./A12_autoExec");
  const { runA16 }         = require("./A16_memory");

  const mark = async (agentId, status) =>
    db.collection("clients").doc(clientId).update({ [`agents.${agentId}`]: status }).catch(() => {});

  // Smart exec: run agent → mark status → SEO Head reviews output
  // masterPrompt is available in closure from loadLiveKnowledge above
  const exec = async (agentId, fn, skipReview = false) => {
    const timeout = AGENT_TIMEOUT_MS[agentId] || DEFAULT_TIMEOUT;
    try {
      await mark(agentId, "running");
      const result = await Promise.race([
        fn(clientId, keys, masterPrompt),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`${agentId} timed out after ${timeout / 1000}s`)), timeout)
        ),
      ]);

      if (!result?.success) {
        await handleFailure(clientId, agentId, result?.error || "Agent returned failure");
        return false;
      }

      await mark(agentId, "complete");

      // SEO Head reviews every agent output asynchronously
      if (!skipReview) {
        reviewAgentOutput(clientId, agentId, result, keys, masterPrompt).catch(() => {});
      }

      return true;
    } catch (err) {
      await handleFailure(clientId, agentId, err.message);
      return false;
    }
  };

  try {
    // ── STEP 0: Load live SEO knowledge (L2 — auto-refreshes every 7 days) ──
    console.log(`[A0-L2] Loading live SEO knowledge...`);
    const liveKnowledge = await loadLiveKnowledge(keys);
    const masterPrompt  = buildMasterSystemPrompt(liveKnowledge);
    console.log(`[A0-L2] Knowledge ready (${liveKnowledge.length} chars)`);

    // ── PRE-PIPELINE: SEO Head strategic brief ────────────────────────────
    console.log(`[A0-SEOHead] Building strategic brief...`);
    const strategy = await buildStrategicBrief(clientId, keys);

    if (strategy?.criticalWarnings?.length > 0) {
      console.warn(`[A0-SEOHead] ⚠️  ${strategy.criticalWarnings.length} warning(s) detected pre-pipeline`);
      for (const warning of strategy.criticalWarnings) {
        await createAlert(clientId, "P1", "seo_head_warning", warning,
          "Address this before or during the pipeline run");
      }
    }

    // ── Stage 0: Sign off brief ───────────────────────────────────────────
    await updateState(clientId, "A1_brief", {
      signedOff: true, autoSignedOff: true,
      signedOffAt: new Date().toISOString(),
    });
    await mark("A1", "signed_off");

    // ── Stage 1: Technical Foundation ─────────────────────────────────────
    console.log(`[A0-SEOHead] 🔧 Stage 1: Technical audit...`);
    const a2ok = await exec("A2", runA2);

    if (!a2ok) {
      await db.collection("clients").doc(clientId).update({
        pipelineStatus:      "failed",
        pipelineError:       "Technical Audit (A2) failed — cannot proceed without site data",
        pipelineCompletedAt: new Date().toISOString(),
      });
      return;
    }

    // Run A7 CWV after A2 completes (not parallel — prevents rate limit collision)
    console.log(`[A0-SEOHead] ⚡ Stage 1b: Core Web Vitals...`);
    await exec("A7", runA7);

    // ── Stage 2: Keyword Intelligence ────────────────────────────────────
    console.log(`[A0-SEOHead] 🔍 Stage 2: Keyword research...`);
    await exec("A3", runA3);

    // ── Stage 3: Competitor Intelligence ─────────────────────────────────
    console.log(`[A0-SEOHead] 🥊 Stage 3: Competitor analysis...`);
    await exec("A4", runA4);

    // ── Stage 4: Content + Link Building ─────────────────────────────────
    console.log(`[A0-SEOHead] ✍️  Stage 4: Content strategy + link building...`);
    await Promise.allSettled([
      exec("A5",  runA5),
      exec("A11", runA11),
    ]);

    // ── Stage 5: On-page + Local SEO ─────────────────────────────────────
    console.log(`[A0-SEOHead] 🏷️  Stage 5: On-page optimisation + local SEO...`);
    await Promise.allSettled([
      exec("A6", runA6),
      exec("A8", (id, k, mp) => runA8(id, k, mp, googleToken)),
    ]);

    // ── Stage 6: Report + Rank Tracking ──────────────────────────────────
    console.log(`[A0-SEOHead] 📊 Stage 6: Strategy report + rank tracking...`);
    await Promise.allSettled([
      exec("A9",  (id, k, mp) => generateReport(id, k, mp, null), true),
      exec("A10", (id, k, mp) => runA10(id, k, mp, googleToken)),
    ]);

    // ── Mark complete ─────────────────────────────────────────────────────
    await db.collection("clients").doc(clientId).update({
      pipelineStatus:      "complete",
      pipelineCompletedAt: new Date().toISOString(),
      pipelineError:       null,
    });

    // ── Save SEO Score ────────────────────────────────────────────────────
    try {
      const { calculateScore, saveScoreHistory } = require("../utils/scoreCalculator");
      const [audit, keywords, geo, onpage, technical] = await Promise.all([
        getState(clientId, "A2_audit").catch(() => null),
        getState(clientId, "A3_keywords").catch(() => null),
        getState(clientId, "A8_geo").catch(() => null),
        getState(clientId, "A6_onpage").catch(() => null),
        getState(clientId, "A7_technical").catch(() => null),
      ]);
      if (audit) {
        const score = calculateScore(audit, keywords, geo, onpage, technical);
        await saveScoreHistory(clientId, score);
        await db.collection("clients").doc(clientId).update({ seoScore: score.overall });
        console.log(`[A0-SEOHead] 📈 SEO score saved: ${score.overall}`);
        try {
          await db.collection("portal_snapshots").add({
            clientId, date: new Date().toISOString().split("T")[0],
            seoScore: score.overall, techScore: audit?.score || null,
            mobileScore: technical?.summary?.mobileScore || null,
            desktopScore: technical?.summary?.desktopScore || null,
            totalKeywords: keywords?.keywordMap?.length || 0,
            crawledPages: (audit?.pages || []).length,
            createdAt: new Date(),
          });
        } catch { /* non-blocking */ }
      }
    } catch (e) { console.error("[A0-SEOHead] Score save failed:", e.message); }

    // ── Send email ────────────────────────────────────────────────────────
    try {
      const clientDoc = await db.collection("clients").doc(clientId).get();
      const cData     = clientDoc.data() || {};
      const { auth }  = require("../config/firebase");
      const ownerSnap = await db.collection("users").doc(cData.ownerId).get().catch(() => null);
      const fbUser    = await auth.getUser(cData.ownerId).catch(() => null);
      const toEmail   = ownerSnap?.data()?.email || fbUser?.email;
      if (toEmail) {
        const [reportState, auditState] = await Promise.all([
          getState(clientId, "A9_report").catch(() => null),
          getState(clientId, "A2_audit").catch(() => null),
        ]);
        sendPipelineComplete({
          to: toEmail,
          clientName: cData.name || cData.website || clientId,
          websiteUrl: cData.website || "",
          score: reportState?.healthScore || auditState?.score || null,
          topIssues: (auditState?.issues || []).filter(i => i.severity === "critical").slice(0, 5).map(i => ({ title: i.description || i.detail })),
          agentUrl: process.env.APP_URL || "https://seo-agent.onrender.com",
        });
      }
    } catch { /* non-blocking */ }

    // ── Auto-fix ──────────────────────────────────────────────────────────
    try {
      const clientDoc = await db.collection("clients").doc(clientId).get();
      const autoMode  = clientDoc.data()?.automationMode || "manual";
      if (autoMode === "semi" || autoMode === "full") {
        await exec("A12", runA12, true);
        console.log(`[A0-SEOHead] 🤖 Auto-fix triggered (mode: ${autoMode})`);
      }
    } catch { /* non-blocking */ }

    // ── Memory update ─────────────────────────────────────────────────────
    try {
      await runA16(clientId, keys);
      console.log(`[A0-SEOHead] 🧠 Memory updated`);
    } catch { /* non-blocking */ }

    // ── A17 Review + CMO Decision ─────────────────────────────────────────
    try {
      const { runA17 } = require("./A17_reviewer");
      const { runCMO } = require("./CMO_agent");
      await exec("A17", runA17, true);
      const cmoResult = await runCMO(clientId, keys);
      if (cmoResult?.success) console.log(`[A0-SEOHead] 🎯 CMO: ${cmoResult.cmo?.decision}`);
    } catch (e) { console.warn(`[A0-SEOHead] A17+CMO non-fatal: ${e.message}`); }

    // ── POST-PIPELINE: SEO Head executive summary ─────────────────────────
    try {
      const [audit, keywords, competitor, report] = await Promise.all([
        getState(clientId, "A2_audit").catch(() => null),
        getState(clientId, "A3_keywords").catch(() => null),
        getState(clientId, "A4_competitor").catch(() => null),
        getState(clientId, "A9_report").catch(() => null),
      ]);

      const clientSnap = await db.collection("clients").doc(clientId).get();
      const brief      = clientSnap.data() || {};
      const industry   = detectIndustry(brief);

      const summaryPrompt = `
Pipeline complete. Here's what your team found:

Client: ${brief.name || "Unknown"} | Industry: ${industry.type}
Technical issues: ${audit?.issues?.p1?.length || 0} critical, ${audit?.issues?.p2?.length || 0} high priority
Keywords tracked: ${keywords?.keywordMap?.length || 0}
Top keyword opportunities: ${(keywords?.keywordMap || []).slice(0, 5).map(k => k.keyword || k).join(", ") || "none"}
Competitors analysed: ${competitor?.competitors?.length || 0}
SEO score: ${report?.healthScore || brief.seoScore || "N/A"}
Pages crawled: ${audit?.pages?.length || 0}
${industry.ymyl ? "⚠️  YMYL site — E-E-A-T is critical" : ""}
${industry.aiOverviewRisk === "HIGH" ? "⚠️  High AI Overview risk — zero-click threat on informational keywords" : ""}

As the SEO Head, write a 4-sentence executive summary:
1. What is the client's single biggest SEO challenge right now? (specific)
2. What is the one action that will have the most impact in the next 30 days? (actionable)
3. What does the content/authority strategy need to look like for 90-day results? (strategic)
4. Any critical risk or opportunity that cannot wait? (alert or opportunity)

Be direct. Be specific. No generic advice. Sound like a world-class SEO director, not a report template.`;

      const summary = await callLLM(clientId, keys, summaryPrompt, {
        system: SEO_HEAD_SYSTEM_PROMPT,
        maxTokens: 400,
      });

      if (summary?.content) {
        await db.collection("clients").doc(clientId).update({
          seoHeadSummary:   summary.content,
          seoHeadSummaryAt: new Date().toISOString(),
        });
        console.log(`[A0-SEOHead] ✅ Executive summary saved`);
      }
    } catch (e) { console.warn(`[A0-SEOHead] Summary failed (non-blocking): ${e.message}`); }

    console.log(`\n[A0-SEOHead] ╔══════════════════════════════════╗`);
    console.log(`[A0-SEOHead] ║  ✅ PIPELINE COMPLETE             ║`);
    console.log(`[A0-SEOHead] ╚══════════════════════════════════╝\n`);

  } catch (err) {
    console.error(`[A0-SEOHead] ❌ Fatal pipeline error: ${err.message}`);
    await db.collection("clients").doc(clientId).update({
      pipelineStatus:      "failed",
      pipelineError:       `Fatal error: ${err.message}`,
      pipelineCompletedAt: new Date().toISOString(),
    });
  } finally {
    clearTimeout(pipelineTimeout);
    clearInterval(keepAlive);
  }
}

module.exports = {
  canRunAgent,
  getPipelineStatus,
  handleFailure,
  runFullPipeline,
  DEPENDENCY_CHAIN,
  SEO_HEAD_SYSTEM_PROMPT,
  buildStrategicBrief,
  reviewAgentOutput,
  detectIndustry,
  loadLiveKnowledge,
  refreshLiveKnowledge,
  checkKnowledgeFreshness,
  buildMasterSystemPrompt,
  getEmbeddedKnowledge2025,
};
