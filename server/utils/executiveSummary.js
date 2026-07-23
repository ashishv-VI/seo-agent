/**
 * executiveSummary.js — Executive Command Center engine (M9.6).
 *
 * PURE AGGREGATION LAYER. No Firestore, no LLM, no I/O. Composes the snapshots
 * already produced by other engines (score, forecast, audit, LLM Visibility,
 * Answer Optimization, Task Center, notifications) into one executive rollup +
 * deterministic AI insights. Reuses those summaries — it does NOT recompute any
 * score or re-derive any recommendation.
 *
 * Input: one object with the already-fetched pieces (route does the reads):
 *   { score, forecast, audit, keywords, llmVisibility, answerOptimization,
 *     taskCenter, alerts, pipeline, scoreHistory }
 *
 * Output: { executiveScore, overallHealth, criticalAlerts, topWins, topRisks,
 *   quickWins, expectedGrowth, pipelineHealth, clientHealth, visibilityHealth,
 *   contentHealth, technicalHealth, businessSummary, insights, recommendedActions }
 */

function clamp(n, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, Math.round(Number(n) || 0))); }
function healthBand(score) {
  if (score >= 80) return "excellent";
  if (score >= 65) return "good";
  if (score >= 45) return "fair";
  if (score >= 25) return "poor";
  return "critical";
}

function buildExecutiveSummary(inputs = {}) {
  const {
    score, forecast, audit, keywords, llmVisibility, answerOptimization,
    taskCenter, alerts, pipeline, scoreHistory,
  } = inputs;

  // ── Component health scores (each 0–100, reusing existing metrics) ──
  const technicalHealth = clamp(audit?.healthScore ?? score?.overall ?? 0);
  const visibilityHealth = clamp(llmVisibility?.visibilityScore ?? 0);
  const contentHealth = clamp(
    answerOptimization?.optimizationScore != null ? answerOptimization.optimizationScore
      : (keywords?.keywordMap?.length ? 55 : 0)
  );
  const pipelineStatus = pipeline?.pipelineStatus || "idle";
  const pipelineHealth = pipelineStatus === "complete" ? 100
    : pipelineStatus === "running" ? 60
    : pipelineStatus === "failed" ? 20 : 40;

  // Task execution health from completion rate + critical load.
  const completion = taskCenter?.completionRate ?? 0;
  const critical = taskCenter?.criticalTasks ?? 0;
  const clientHealth = clamp(completion - (critical * 8) + 40);

  // ── Executive score: weighted blend of the component healths ──
  const executiveScore = clamp(
    technicalHealth * 0.25 +
    visibilityHealth * 0.25 +
    contentHealth * 0.20 +
    clientHealth * 0.15 +
    pipelineHealth * 0.15
  );
  const overallHealth = healthBand(executiveScore);

  // ── Critical alerts (already-computed alerts, filtered to high severity) ──
  const criticalAlerts = (alerts || [])
    .filter(a => (a.severity === "critical" || a.tier === "P1" || a.tier === "P0"))
    .slice(0, 5)
    .map(a => ({ title: a.title || a.message || a.type, severity: a.severity || a.tier || "critical" }));

  // ── Top wins / risks (deterministic, from metric deltas) ──
  const topWins = [];
  const topRisks = [];

  // Score trend from history.
  if (Array.isArray(scoreHistory) && scoreHistory.length >= 2) {
    const first = scoreHistory[0]?.overall ?? 0;
    const last = scoreHistory[scoreHistory.length - 1]?.overall ?? 0;
    const delta = last - first;
    if (delta >= 3) topWins.push(`SEO score up ${delta} points over the tracked period`);
    else if (delta <= -3) topRisks.push(`SEO score down ${Math.abs(delta)} points — investigate recent changes`);
  }
  if (llmVisibility?.trend?.direction === "up") topWins.push(`AI visibility trending up (+${llmVisibility.trend.delta})`);
  if (llmVisibility?.trend?.direction === "down") topRisks.push(`AI visibility trending down (${llmVisibility.trend.delta})`);
  if (visibilityHealth >= 70) topWins.push(`Strong AI visibility (${visibilityHealth}/100, grade ${llmVisibility?.grade || "—"})`);
  if (visibilityHealth > 0 && visibilityHealth < 40) topRisks.push(`Low AI visibility (${visibilityHealth}/100) — you're largely invisible in AI answers`);
  if (technicalHealth >= 80) topWins.push(`Technically healthy site (${technicalHealth}/100)`);
  if ((audit?.p1 ?? 0) > 0 || (audit?.issues?.p1?.length ?? 0) > 0) {
    const p1 = audit?.p1 ?? audit?.issues?.p1?.length ?? 0;
    topRisks.push(`${p1} critical (P1) technical issue(s) blocking rankings`);
  }
  if (critical > 0) topRisks.push(`${critical} critical task(s) awaiting action`);
  if (completion >= 70) topWins.push(`High task completion rate (${completion}%)`);

  // ── Quick wins (reuse Task Center + Answer Optimization) ──
  const quickWins = clamp(taskCenter?.quickWins ?? answerOptimization?.quickWins?.length ?? 0, 0, 999);

  // ── Expected growth (reuse forecast + answer optimization gain) ──
  const expectedGrowth = {
    forecastAvailable: !!forecast,
    projectedScore: forecast?.projectedScore ?? null,
    visibilityGainPotential: answerOptimization?.expectedVisibilityGain ?? 0,
  };

  // ── Business summary (one-liner, deterministic) ──
  const businessSummary =
    `${overallHealth === "excellent" || overallHealth === "good" ? "On track" : overallHealth === "fair" ? "Needs attention" : "At risk"}: ` +
    `executive score ${executiveScore}/100. ` +
    `${criticalAlerts.length} critical alert(s), ${critical} critical task(s), AI visibility ${visibilityHealth}/100.`;

  // ── Deterministic AI insights (Phase 5) — NO LLM ──
  const insights = [];
  const pushInsight = (kind, tone, text) => insights.push({ kind, tone, text });

  if (Array.isArray(scoreHistory) && scoreHistory.length >= 2) {
    const d = (scoreHistory[scoreHistory.length - 1]?.overall ?? 0) - (scoreHistory[0]?.overall ?? 0);
    if (d >= 3) pushInsight("traffic", "positive", `SEO score improving (+${d}) — momentum is building.`);
    if (d <= -3) pushInsight("traffic", "negative", `SEO score declining (${d}) — review recent changes and re-audit.`);
  }
  if (llmVisibility?.trend?.direction === "down") pushInsight("visibility", "negative", "AI visibility is dropping — competitors may be winning citations you're losing.");
  if (llmVisibility?.trend?.direction === "up") pushInsight("authority", "positive", "AI authority is improving — keep publishing quotable, structured content.");
  if (pipelineStatus === "failed") pushInsight("pipeline", "negative", "Pipeline stalled (failed) — re-run to refresh intelligence.");
  else if (pipelineStatus === "idle" && executiveScore < 40) pushInsight("pipeline", "warning", "Pipeline hasn't run recently — data may be stale. Run it to get current signals.");
  if ((taskCenter?.overdue ?? 0) > 0) pushInsight("priority", "negative", `${taskCenter.overdue} task(s) overdue — escalate to protect momentum.`);
  if (critical >= 3) pushInsight("priority", "warning", `${critical} critical tasks pending — prioritize these before new work.`);
  if ((answerOptimization?.criticalCount ?? 0) > 0) pushInsight("visibility", "warning", `${answerOptimization.criticalCount} critical answer-optimization action(s) could lift AI visibility fast.`);
  if (contentHealth > 0 && contentHealth < 40) pushInsight("content", "warning", "Content velocity is low — answer-shaped content is what AI engines cite.");
  if (forecast?.projectedScore && score?.overall && forecast.projectedScore > score.overall) pushInsight("forecast", "positive", `Forecast is positive — projected score ${forecast.projectedScore} if the current plan is executed.`);
  if (!insights.length) pushInsight("status", "neutral", "No urgent signals. Keep executing the plan and re-scan regularly.");

  // ── Recommended actions (reuse the highest-priority items already computed) ──
  const recommendedActions = [];
  (answerOptimization?.topOpportunities || []).slice(0, 2).forEach(o =>
    recommendedActions.push({ source: "Answer Optimization", action: o.title, priority: o.priority || "medium" }));
  if (llmVisibility?.topRecommendation) recommendedActions.push({ source: "LLM Visibility", action: llmVisibility.topRecommendation, priority: "high" });
  if (critical > 0) recommendedActions.push({ source: "Task Center", action: `Clear ${critical} critical task(s)`, priority: "high" });
  if (pipelineStatus === "failed") recommendedActions.push({ source: "Pipeline", action: "Re-run the pipeline to refresh data", priority: "high" });

  return {
    executiveScore,
    overallHealth,
    criticalAlerts,
    topWins: topWins.slice(0, 5),
    topRisks: topRisks.slice(0, 5),
    quickWins,
    expectedGrowth,
    pipelineHealth,
    clientHealth,
    visibilityHealth,
    contentHealth,
    technicalHealth,
    businessSummary,
    insights: insights.slice(0, 8),
    recommendedActions: recommendedActions.slice(0, 6),
  };
}

module.exports = { buildExecutiveSummary, healthBand };
