const { getState, saveState } = require("../shared-state/stateManager");

/**
 * A17 — Quality Gate / Reviewer Agent (Sprint 4)
 *
 * Computes a confidence score (0–1) for each agent output.
 * Score reflects data completeness, consistency, and signal strength.
 *
 * Used by CMO Agent to weight decisions and flag low-quality outputs
 * that need re-running before trust.
 */
async function runA17(clientId) {
  try {
  const agents = ["A1_brief","A2_audit","A3_keywords","A4_competitor","A5_content","A6_onpage","A7_technical","A8_geo","A9_report"];

  const reviews = await Promise.all(agents.map(async key => {
    const data = await getState(clientId, key).catch(() => null);
    if (!data) return { agent: key, confidence: 0, reason: "No data — agent not run", status: "missing" };
    return reviewAgent(key, data);
  }));

  // Overall pipeline confidence = weighted average
  const weights = { A1_brief:1, A2_audit:2, A3_keywords:2, A4_competitor:1.5, A5_content:1, A6_onpage:1.5, A7_technical:2, A8_geo:1, A9_report:2 };
  let totalWeight = 0, weightedSum = 0;
  for (const r of reviews) {
    const w = weights[r.agent] || 1;
    totalWeight  += w;
    weightedSum  += r.confidence * w;
  }
  const overallConfidence = Math.round((weightedSum / totalWeight) * 100) / 100;

  const result = {
    overallConfidence,
    grade: overallConfidence >= 0.8 ? "A" : overallConfidence >= 0.65 ? "B" : overallConfidence >= 0.5 ? "C" : "D",
    reviews,
    lowConfidenceAgents: reviews.filter(r => r.confidence < 0.6).map(r => r.agent),
    reviewedAt: new Date().toISOString(),
  };

  await saveState(clientId, "A17_review", result);
  return { success: true, review: result };
  } catch (e) {
    console.error(`[A17] Review failed for ${clientId}:`, e.message);
    return { success: false, error: e.message };
  }
}

function reviewAgent(key, data) {
  let score = 1.0;
  const flags = [];

  if (key === "A1_brief") {
    if (!data.businessName)        { score -= 0.2; flags.push("Missing business name"); }
    if (!data.websiteUrl)          { score -= 0.3; flags.push("Missing website URL"); }
    if (!data.goals?.length)       { score -= 0.1; flags.push("No goals set"); }
    if (!data.kpiSelection?.length){ score -= 0.1; flags.push("No KPI selected"); }
    if (!data.primaryKeywords?.length) { score -= 0.15; flags.push("No seed keywords"); }
  }

  if (key === "A2_audit") {
    if (!data.healthScore)               { score -= 0.3; flags.push("No health score"); }
    if (!data.checks?.title?.exists)     { score -= 0.15; flags.push("Title check missing"); }
    if (!data.pageAudits?.length)        { score -= 0.2; flags.push("No inner pages audited"); }
    else if (data.pageAudits.length < 5) { score -= 0.1; flags.push("Fewer than 5 pages audited"); }
    if (data.checks?.sitemapPagesFound === 0) { score -= 0.1; flags.push("No sitemap pages found"); }
  }

  if (key === "A3_keywords") {
    if (!data.totalKeywords || data.totalKeywords < 5) { score -= 0.3; flags.push("Too few keywords (<5)"); }
    if (!data.clusters || Object.keys(data.clusters).length < 2) { score -= 0.2; flags.push("Fewer than 2 keyword clusters"); }
    if (!data.gaps?.length) { score -= 0.1; flags.push("No keyword gaps identified"); }
  }

  if (key === "A4_competitor") {
    if (!data.topCompetitors?.length)        { score -= 0.25; flags.push("No competitors identified"); }
    if (!data.analysis?.contentGaps?.length) { score -= 0.2;  flags.push("No content gaps found"); }
    if (!data.autoDiscovered && !data.discoveredCompetitors?.length) { score -= 0.1; flags.push("Manual competitor list not provided"); }
  }

  if (key === "A7_technical") {
    if (!data.hasRealCWVData) { score -= 0.3; flags.push("No real PageSpeed data — add Google API key"); }
    if (!data.summary?.mobileScore) { score -= 0.2; flags.push("No mobile score"); }
  }

  if (key === "A9_report") {
    if (!data.reportData?.verdict)           { score -= 0.3; flags.push("No LLM verdict"); }
    if (!data.reportData?.next3Actions?.length) { score -= 0.2; flags.push("No recommended actions"); }
    if (!data.gscSummary)                    { score -= 0.15; flags.push("No GSC data in report"); }
    if (!data.scoreBreakdown?.overall)       { score -= 0.1;  flags.push("No SEO score"); }
  }

  const confidence = Math.max(0, Math.min(1, score));
  return {
    agent:      key,
    confidence: Math.round(confidence * 100) / 100,
    status:     confidence >= 0.8 ? "good" : confidence >= 0.6 ? "ok" : "weak",
    flags,
    reason:     flags.length ? flags.join("; ") : "All key checks passed",
  };
}

module.exports = { runA17 };
