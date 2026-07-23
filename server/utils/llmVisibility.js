/**
 * llmVisibility.js — LLM Visibility scoring engine (M9.2).
 *
 * PURE CALCULATION LAYER. Does NOT call an LLM, does NOT do I/O. It synthesizes
 * data already collected by existing scanners into a single visibility product
 * metric. The route module does the Firestore reads/writes and passes plain
 * objects in.
 *
 * Inputs (all optional — engine degrades gracefully as data is missing):
 *   aio        — aio_tracker/{clientId}.summary  { totalChecked, aioPresent, clientInAIO, featuredSnippets }
 *   citations  — ai_citations/{clientId}.summary { totalChecked, bingCopilotCited, perplexityCited, googleAIOCited, anyCitation, hasPerplexityKey }
 *   serp       — serp_features/{clientId}.summary { totalChecked, withFeatures, featuredSnippets, ownedSnippets, opportunities }
 *   keywords   — A3_keywords state             { keywordMap, competitors, clusters }
 *   coreUpdate — A25_coreUpdateScanner state    { overallRisk, highRiskCount }
 *
 * Output: { visibilityScore, grade, shareOfVoice, citationRate, answerPresence,
 *           components, trend, recommendations, confidence, topPrompts, competitors }
 */

// ── Component weights (sum = 1.0). Tunable; documented so scores are explainable.
const WEIGHTS = {
  citationRate:   0.40, // are we cited by AI engines at all? (the core signal)
  answerPresence: 0.25, // do AI Overviews / answer boxes appear for our keywords?
  ownedSnippets:  0.20, // do we own the featured snippet that feeds AI answers?
  engineBreadth:  0.15, // across how many distinct engines are we cited?
};

function pct(part, whole) {
  const p = Number(part) || 0, w = Number(whole) || 0;
  if (w <= 0) return 0;
  return Math.max(0, Math.min(1, p / w));
}

function gradeFor(score) {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

/**
 * confidence reflects how much real data backed the score (0–1).
 * Low when scanners haven't run / checked few prompts.
 */
function computeConfidence({ aio, citations, serp }) {
  const checks = [aio?.totalChecked, citations?.totalChecked, serp?.totalChecked].map(n => Number(n) || 0);
  const sourcesPresent = checks.filter(n => n > 0).length; // 0..3
  const volume = Math.max(...checks, 0);
  const sourceScore = sourcesPresent / 3;                  // breadth of evidence
  const volumeScore = Math.min(1, volume / 15);            // 15 prompts ≈ full confidence
  return Math.round(((sourceScore * 0.6) + (volumeScore * 0.4)) * 100) / 100;
}

function calculateLLMVisibility(inputs = {}) {
  const { aio, citations, serp, keywords, coreUpdate, previous } = inputs;

  // ── Citation rate: fraction of checked prompts where we're cited by any AI engine.
  const citationRate = pct(citations?.anyCitation, citations?.totalChecked);

  // ── Answer presence: how often an AI Overview / answer box shows for our keywords.
  const answerPresence = pct(aio?.aioPresent, aio?.totalChecked);

  // ── Owned snippets: featured snippets we own (feed AI answers) vs checked.
  const ownedSnippetRate = pct(serp?.ownedSnippets, serp?.totalChecked);

  // ── Engine breadth: distinct AI engines citing us / engines we can measure.
  const engineHits = [
    (citations?.bingCopilotCited || 0) > 0,
    (citations?.perplexityCited || 0) > 0,
    (citations?.googleAIOCited || 0) > 0,
  ].filter(Boolean).length;
  const measurableEngines = citations?.hasPerplexityKey ? 3 : 2; // Perplexity only measurable with a key
  const engineBreadth = pct(engineHits, measurableEngines);

  // ── Weighted score 0–100.
  const raw =
    citationRate   * WEIGHTS.citationRate +
    answerPresence * WEIGHTS.answerPresence +
    ownedSnippetRate * WEIGHTS.ownedSnippets +
    engineBreadth  * WEIGHTS.engineBreadth;
  const visibilityScore = Math.round(raw * 100);

  // ── Share of voice: our citations vs (our citations + competitor answer-box presence proxy).
  // We don't scrape competitor citations directly; approximate SoV as our citation rate
  // discounted by how contested the space is (AIO present but we're not cited).
  const contested = Math.max(0, (aio?.aioPresent || 0) - (aio?.clientInAIO || 0));
  const ourPresence = (citations?.anyCitation || 0) + (aio?.clientInAIO || 0);
  const shareOfVoice = Math.round(pct(ourPresence, ourPresence + contested) * 100);

  const grade = gradeFor(visibilityScore);
  const confidence = computeConfidence({ aio, citations, serp });

  // ── Trend vs previous snapshot.
  let trend = { direction: "flat", delta: 0 };
  if (previous && typeof previous.visibilityScore === "number") {
    const delta = visibilityScore - previous.visibilityScore;
    trend = { direction: delta > 1 ? "up" : delta < -1 ? "down" : "flat", delta };
  }

  // ── Recommendations: rule-based, ordered by impact. No LLM.
  const recommendations = [];
  if ((citations?.totalChecked || 0) === 0 && (aio?.totalChecked || 0) === 0) {
    recommendations.push({ priority: "high", action: "Run the AI Citation and AI Overview scans to establish a baseline — no visibility data yet." });
  }
  if (citationRate < 0.3 && (citations?.totalChecked || 0) > 0) {
    recommendations.push({ priority: "high", action: "Low AI citation rate. Add clear, quotable factual statements + FAQ/HowTo schema so LLMs can cite you as a source." });
  }
  if (answerPresence > 0.4 && (aio?.clientInAIO || 0) === 0) {
    recommendations.push({ priority: "high", action: "AI Overviews appear for your keywords but you're not in them. Target these queries with structured, direct-answer content to earn a citation." });
  }
  if (ownedSnippetRate < 0.2 && (serp?.opportunities || 0) > 0) {
    recommendations.push({ priority: "medium", action: `${serp.opportunities} featured-snippet opportunities detected. Format answers as tables/steps/definitions to win the snippet that feeds AI answers.` });
  }
  if (!citations?.hasPerplexityKey) {
    recommendations.push({ priority: "low", action: "Add a Perplexity API key in Settings to measure Perplexity citations (currently unmeasured)." });
  }
  if (coreUpdate?.overallRisk === "HIGH" || (coreUpdate?.highRiskCount || 0) > 0) {
    recommendations.push({ priority: "medium", action: "Core-update E-E-A-T risk detected — AI engines favor trusted sources. Strengthen author credentials + first-hand experience signals." });
  }
  if (!recommendations.length) {
    recommendations.push({ priority: "low", action: "Visibility is healthy. Keep publishing quotable, well-structured content and re-scan regularly to hold position." });
  }

  // ── Prompt coverage + competitor context (from what's already collected).
  const topPrompts = ((citations && citations.totalChecked) || (aio && aio.totalChecked) || 0);
  const competitors = Array.isArray(keywords?.competitors)
    ? keywords.competitors.slice(0, 5)
    : (Array.isArray(keywords?.competitorDomains) ? keywords.competitorDomains.slice(0, 5) : []);

  return {
    visibilityScore,
    grade,
    shareOfVoice,
    citationRate:   Math.round(citationRate * 100),
    answerPresence: Math.round(answerPresence * 100),
    components: {
      citationRate:   Math.round(citationRate * 100),
      answerPresence: Math.round(answerPresence * 100),
      ownedSnippets:  Math.round(ownedSnippetRate * 100),
      engineBreadth:  Math.round(engineBreadth * 100),
      weights: WEIGHTS,
    },
    trend,
    recommendations,
    confidence,
    topPrompts,
    competitors,
  };
}

module.exports = { calculateLLMVisibility, gradeFor, WEIGHTS };
