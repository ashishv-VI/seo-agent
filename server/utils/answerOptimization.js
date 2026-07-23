/**
 * answerOptimization.js — Answer Optimization Engine (M9.3).
 *
 * PURE ENGINE. No Firestore writes, no LLM calls, no I/O. Turns the LLM
 * Visibility signal (M9.2) + existing scan/content/audit data into a set of
 * prioritized, categorized, execution-ready optimization opportunities.
 *
 * Design boundary vs M9.2: llmVisibility.js emits short *diagnostic* prose tied
 * to the score ("citation rate is low"). This engine emits *structured work
 * items* — each with category, impact, difficulty, estimated time, confidence,
 * expected visibility gain, and an approval/task-compatible shape — so the loop
 * can feed Approvals / Content Calendar / (future) Task Center. It consumes the
 * visibility output as an input rather than re-deriving the same recommendations.
 *
 * Inputs (all optional; engine degrades as data is missing):
 *   visibility — llm_visibility snapshot { visibilityScore, components, citationRate, answerPresence, competitors }
 *   citations  — ai_citations summary
 *   aio        — aio_tracker summary
 *   serp       — serp_features summary
 *   content    — A5_content state { summary, contentData }
 *   audit      — A2_audit state   { issues, pages }
 *   rankings   — A10_rankings state
 *   knowledge  — seo_knowledge_cache freshness (bool/age)
 *
 * Output: { optimizationScore, grade, opportunities[], categoryBreakdown,
 *           quickWins[], longTermWins[], expectedVisibilityGain, criticalCount, confidence }
 */

const CATEGORIES = [
  "Content", "Schema", "Authority", "Internal Linking", "Technical",
  "Entity Coverage", "Freshness", "Prompt Coverage", "Citation Coverage", "Knowledge Gaps",
];

// Difficulty → rough estimated time (human-facing).
const TIME_BY_DIFFICULTY = { low: "1–2 hrs", medium: "0.5–1 day", high: "2–5 days" };

function num(v) { return Number(v) || 0; }
function pctOf(part, whole) { const w = num(whole); return w > 0 ? Math.max(0, Math.min(1, num(part) / w)) : 0; }

// Priority is derived from impact × (inverse difficulty) so quick high-impact wins float up.
function priorityFor(impact, difficulty) {
  const impW = impact === "high" ? 3 : impact === "medium" ? 2 : 1;
  const diffPenalty = difficulty === "high" ? 2 : difficulty === "medium" ? 1 : 0;
  const s = impW - diffPenalty;
  if (s >= 3) return "critical";
  if (s >= 2) return "high";
  if (s >= 1) return "medium";
  return "low";
}

// Build one opportunity with a stable, approval/task-compatible shape.
function opp({ category, title, detail, impact, difficulty, confidence, visibilityGain, taskType }) {
  return {
    category,
    title,
    detail,
    impact,                                   // low | medium | high
    difficulty,                               // low | medium | high
    priority: priorityFor(impact, difficulty),
    estimatedTime: TIME_BY_DIFFICULTY[difficulty] || "—",
    confidence,                               // 0..1
    expectedVisibilityGain: visibilityGain,   // estimated points on the 0–100 visibility scale
    // Forward-compatible shapes (consumed by Approvals / Calendar / future Task Center):
    taskType,                                 // stable machine key
    approvalCompatible: true,
  };
}

function calculateAnswerOptimization(inputs = {}) {
  const { visibility, citations, aio, serp, content, audit, knowledge } = inputs;

  const opportunities = [];
  const vs = visibility || {};
  const citationRate   = typeof vs.citationRate === "number" ? vs.citationRate / 100 : pctOf(citations?.anyCitation, citations?.totalChecked);
  const answerPresence = typeof vs.answerPresence === "number" ? vs.answerPresence / 100 : pctOf(aio?.aioPresent, aio?.totalChecked);

  // ── Citation Coverage ──
  if ((citations?.totalChecked || 0) > 0 && citationRate < 0.4) {
    opportunities.push(opp({
      category: "Citation Coverage",
      title: "Increase AI citation rate",
      detail: `Only ${Math.round(citationRate * 100)}% of checked prompts cite you. Add concise, quotable factual statements near the top of target pages so LLMs can lift them directly.`,
      impact: "high", difficulty: "medium", confidence: 0.8, visibilityGain: 12, taskType: "citation_optimize",
    }));
  }

  // ── Prompt Coverage ──
  const promptsChecked = citations?.totalChecked || aio?.totalChecked || 0;
  if (promptsChecked > 0 && promptsChecked < 10) {
    opportunities.push(opp({
      category: "Prompt Coverage",
      title: "Expand tracked prompt set",
      detail: `Only ${promptsChecked} prompts are monitored. Add more buyer-intent prompts so visibility reflects the real question space.`,
      impact: "medium", difficulty: "low", confidence: 0.7, visibilityGain: 4, taskType: "prompt_expand",
    }));
  } else if (promptsChecked === 0) {
    opportunities.push(opp({
      category: "Prompt Coverage",
      title: "Establish a visibility baseline",
      detail: "No prompts monitored yet. Run the AI Citation + AI Overview scans to baseline visibility before optimizing.",
      impact: "high", difficulty: "low", confidence: 0.9, visibilityGain: 0, taskType: "prompt_baseline",
    }));
  }

  // ── Content (answer-shaped) ──
  const faqItems = content?.summary?.faqItems || 0;
  if (answerPresence > 0.3 && faqItems < 3) {
    opportunities.push(opp({
      category: "Content",
      title: "Add answer-shaped FAQ content",
      detail: "AI Overviews appear for your keywords. Publish clear Q&A/FAQ blocks that directly answer those questions — the format AI answers pull from.",
      impact: "high", difficulty: "medium", confidence: 0.75, visibilityGain: 10, taskType: "content_faq",
    }));
  }
  const refreshFlags = content?.summary?.refreshFlags || 0;
  if (refreshFlags > 0) {
    opportunities.push(opp({
      category: "Freshness",
      title: `Refresh ${refreshFlags} decaying page(s)`,
      detail: "Content flagged as decaying. Refresh with current data/dates — AI engines favor fresh, maintained sources.",
      impact: "medium", difficulty: "medium", confidence: 0.7, visibilityGain: 6, taskType: "content_refresh",
    }));
  }

  // ── Schema ──
  const pages = Array.isArray(audit?.pages) ? audit.pages : [];
  const pagesNoSchema = pages.filter(p => p && p.hasSchema === false).length;
  const schemaSignalFromSerp = (serp?.paaPresent || 0) > 0;
  if (pagesNoSchema > 0 || schemaSignalFromSerp) {
    opportunities.push(opp({
      category: "Schema",
      title: "Add structured data (FAQ / HowTo / Article schema)",
      detail: pagesNoSchema > 0
        ? `${pagesNoSchema} crawled page(s) lack schema. FAQ/HowTo/Article schema helps LLMs parse and cite your content.`
        : "PAA boxes present for your terms — FAQ schema increases the odds AI answers cite you.",
      impact: "medium", difficulty: "low", confidence: 0.72, visibilityGain: 7, taskType: "schema_inject",
    }));
  }

  // ── Internal Linking ──
  const p3 = audit?.issues?.p3 || [];
  if (p3.some(i => /link/i.test(i.type || i.description || ""))) {
    opportunities.push(opp({
      category: "Internal Linking",
      title: "Strengthen internal links to answer pages",
      detail: "Internal-link issues detected. Point authority to your best answer pages so they rank and get surfaced in AI answers.",
      impact: "medium", difficulty: "low", confidence: 0.65, visibilityGain: 4, taskType: "internal_linking",
    }));
  }

  // ── Authority / Entity / Knowledge Gaps ──
  const compCount = Array.isArray(vs.competitors) ? vs.competitors.length : 0;
  if (compCount > 0 && citationRate < 0.5) {
    opportunities.push(opp({
      category: "Authority",
      title: "Build entity authority vs competitors",
      detail: `${compCount} competitor(s) contest your AI answer space. Strengthen brand/entity signals (consistent NAP, credentials, citations) to be chosen as the trusted source.`,
      impact: "high", difficulty: "high", confidence: 0.6, visibilityGain: 9, taskType: "authority_build",
    }));
  }
  const knowledgeStale = knowledge && knowledge.fresh === false;
  if (knowledgeStale) {
    opportunities.push(opp({
      category: "Knowledge Gaps",
      title: "Refresh SEO knowledge base",
      detail: "The live SEO knowledge cache is stale. Refresh it so strategy reflects current AI-search behavior.",
      impact: "low", difficulty: "low", confidence: 0.6, visibilityGain: 2, taskType: "knowledge_refresh",
    }));
  }

  // ── Technical (owned snippets feed AI answers) ──
  const ownedRate = typeof vs.components?.ownedSnippets === "number" ? vs.components.ownedSnippets / 100 : pctOf(serp?.ownedSnippets, serp?.totalChecked);
  if ((serp?.opportunities || 0) > 0 && ownedRate < 0.3) {
    opportunities.push(opp({
      category: "Technical",
      title: `Win ${serp.opportunities} featured-snippet opportunit(ies)`,
      detail: "Featured snippets feed AI answers. Restructure these pages with tables/steps/definitions to capture position zero.",
      impact: "high", difficulty: "medium", confidence: 0.7, visibilityGain: 8, taskType: "snippet_capture",
    }));
  }

  // ── Entity Coverage (breadth of engines) ──
  const engineBreadth = typeof vs.components?.engineBreadth === "number" ? vs.components.engineBreadth / 100 : null;
  if (engineBreadth != null && engineBreadth < 0.5 && promptsChecked > 0) {
    opportunities.push(opp({
      category: "Entity Coverage",
      title: "Broaden citations across AI engines",
      detail: "You're cited by few AI engines. Diversify content formats + sources (Bing-indexed, structured, authoritative) to appear across ChatGPT/Gemini/Perplexity.",
      impact: "medium", difficulty: "high", confidence: 0.55, visibilityGain: 6, taskType: "entity_coverage",
    }));
  }

  // ── Sort by priority then expected gain ──
  const rank = { critical: 0, high: 1, medium: 2, low: 3 };
  opportunities.sort((a, b) => (rank[a.priority] - rank[b.priority]) || (b.expectedVisibilityGain - a.expectedVisibilityGain));

  // ── Optimization score: inverse of remaining opportunity, weighted by priority.
  // Fewer/lighter opportunities → higher score (closer to fully optimized).
  const penalty = opportunities.reduce((s, o) => s + (o.priority === "critical" ? 18 : o.priority === "high" ? 12 : o.priority === "medium" ? 6 : 2), 0);
  const optimizationScore = Math.max(0, Math.min(100, 100 - penalty));
  const grade = optimizationScore >= 85 ? "A" : optimizationScore >= 70 ? "B" : optimizationScore >= 55 ? "C" : optimizationScore >= 40 ? "D" : "F";

  // ── Category breakdown (count + total gain per category present) ──
  const categoryBreakdown = {};
  for (const c of CATEGORIES) {
    const inCat = opportunities.filter(o => o.category === c);
    if (inCat.length) categoryBreakdown[c] = { count: inCat.length, gain: inCat.reduce((s, o) => s + o.expectedVisibilityGain, 0) };
  }

  const quickWins    = opportunities.filter(o => o.difficulty === "low" && (o.impact === "high" || o.impact === "medium")).slice(0, 5);
  const longTermWins = opportunities.filter(o => o.difficulty === "high").slice(0, 5);
  const expectedVisibilityGain = Math.min(100, opportunities.reduce((s, o) => s + o.expectedVisibilityGain, 0));
  const criticalCount = opportunities.filter(o => o.priority === "critical").length;

  // Confidence: reuse visibility confidence if present, else derive from prompt volume.
  const confidence = typeof vs.confidence === "number" ? vs.confidence : Math.min(1, promptsChecked / 15);

  return {
    optimizationScore,
    grade,
    opportunities,
    categoryBreakdown,
    quickWins,
    longTermWins,
    expectedVisibilityGain,
    criticalCount,
    confidence: Math.round(confidence * 100) / 100,
  };
}

module.exports = { calculateAnswerOptimization, CATEGORIES };
