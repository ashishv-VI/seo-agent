/**
 * businessIntelligence.js — Business Intelligence engine (M10.3).
 *
 * PURE, DETERMINISTIC. No Firestore, no LLM, no I/O. Turns already-collected
 * metrics into business-level composite KPIs, trends, and correlations. It
 * consumes the M9.6 executive component-healths as INPUTS (does not re-derive
 * them) and adds the business layer M9.6 doesn't compute: Growth/ROI/Risk/
 * Execution/Opportunity/Business-Impact scores, trends over time, forecast
 * confidence, pipeline efficiency, and rule-based executive insights.
 *
 * Input (route supplies already-fetched data):
 *   { executive,        // M9.6 summary: {executiveScore, *Health, ...}
 *     scoreHistory,     // [{overall, capturedAt|date}]
 *     rankHistory,      // [{...}] snapshots (length/recency used for trend)
 *     llmVisibility,    // snapshot
 *     answerOptimization,
 *     taskCenter,       // summary
 *     pipelineMetrics,  // [{status, durationMs, agentFailureCount, estCostUsd}]
 *     conversions,      // [{...}] for ROI/attribution
 *     forecast, score }
 *
 * Output: { kpis, growthScore, roiScore, riskScore, executionScore,
 *   aiVisibilityScore, technicalHealth, contentVelocity, authorityTrend,
 *   forecastConfidence, pipelineEfficiency, opportunityScore, businessImpact,
 *   trends, correlations, insights, executiveSummary }
 */

function clamp(n, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, Math.round(Number(n) || 0))); }
function num(v) { return Number(v) || 0; }

// Linear trend direction + slope from a numeric series.
function seriesTrend(series = []) {
  const vals = series.map(num).filter(v => !Number.isNaN(v));
  if (vals.length < 2) return { direction: "flat", delta: 0, slope: 0, points: vals };
  const first = vals[0], last = vals[vals.length - 1];
  const delta = last - first;
  const slope = delta / (vals.length - 1);
  return { direction: delta > 1 ? "up" : delta < -1 ? "down" : "flat", delta: Math.round(delta), slope: Math.round(slope * 10) / 10, points: vals };
}

function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const x = xs.slice(0, n), y = ys.slice(0, n);
  const mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
  let num2 = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { const a = x[i] - mx, b = y[i] - my; num2 += a * b; dx += a * a; dy += b * b; }
  if (dx === 0 || dy === 0) return null;
  return Math.round((num2 / Math.sqrt(dx * dy)) * 100) / 100;
}

function buildBusinessIntelligence(inputs = {}) {
  const {
    executive = {}, scoreHistory = [], rankHistory = [], llmVisibility, answerOptimization,
    taskCenter, pipelineMetrics = [], conversions = [], forecast, score,
  } = inputs;

  // ── Reuse M9.6 healths as inputs (do not recompute) ──
  const technicalHealth = clamp(executive.technicalHealth ?? 0);
  const aiVisibilityScore = clamp(executive.visibilityHealth ?? llmVisibility?.visibilityScore ?? 0);
  const executionBase = clamp(executive.clientHealth ?? 0);

  // ── Trends over time (the business layer M9.6 lacks) ──
  const scoreSeries = scoreHistory.map(s => num(s.overall));
  const scoreTrend = seriesTrend(scoreSeries);

  // ── Growth score: current score momentum + forecast direction ──
  const currentScore = num(score?.overall ?? (scoreSeries.length ? scoreSeries[scoreSeries.length - 1] : 0));
  const projected = num(forecast?.projectedScore);
  const growthMomentum = scoreTrend.slope;                 // per-period slope
  const growthScore = clamp(50 + growthMomentum * 4 + (projected > currentScore ? 15 : projected && projected < currentScore ? -15 : 0));

  // ── ROI score: conversions volume + forecasted value vs LLM spend ──
  const convCount = conversions.length;
  const totalSpend = pipelineMetrics.reduce((s, m) => s + num(m.estCostUsd), 0);
  const roiScore = clamp(
    (convCount > 0 ? 50 + Math.min(40, convCount * 2) : 30) - (totalSpend > 5 ? 10 : 0)
  );

  // ── Pipeline efficiency: success rate + failure load + duration ──
  const runs = pipelineMetrics.length;
  const completed = pipelineMetrics.filter(m => m.status === "complete").length;
  const failures = pipelineMetrics.reduce((s, m) => s + num(m.agentFailureCount), 0);
  const successRate = runs > 0 ? completed / runs : 0;
  const pipelineEfficiency = clamp(runs > 0 ? (successRate * 100) - Math.min(30, failures * 3) : 50);

  // ── Execution score: task completion + pipeline efficiency ──
  const completion = num(taskCenter?.completionRate);
  const critical = num(taskCenter?.criticalTasks);
  const executionScore = clamp((executionBase * 0.4) + (completion * 0.4) + (pipelineEfficiency * 0.2) - (critical * 5));

  // ── Risk score (0 = safe, 100 = high risk) ──
  const riskScore = clamp(
    (scoreTrend.direction === "down" ? 25 : 0) +
    (llmVisibility?.trend?.direction === "down" ? 20 : 0) +
    (critical * 8) +
    (num(answerOptimization?.criticalCount) * 6) +
    (failures > 0 ? 10 : 0) +
    (pipelineEfficiency < 40 ? 15 : 0)
  );

  // ── Content velocity: answer-opt activity + optimization score movement ──
  const contentVelocity = clamp(num(answerOptimization?.optimizationScore) * 0.6 + (num(answerOptimization?.quickWins?.length ?? answerOptimization?.quickWins) * 8));

  // ── Authority trend: from visibility trend + score trend ──
  const authorityTrend = llmVisibility?.trend?.direction || (scoreTrend.direction);

  // ── Forecast confidence: series length + variance stability ──
  let forecastConfidence = 30;
  if (scoreSeries.length >= 6) forecastConfidence = 80;
  else if (scoreSeries.length >= 3) forecastConfidence = 60;
  if (scoreTrend.direction === "flat" && scoreSeries.length >= 3) forecastConfidence = Math.min(90, forecastConfidence + 10);
  forecastConfidence = clamp(forecastConfidence);

  // ── Opportunity score: answer-opt gain potential + visibility headroom ──
  const gainPotential = num(answerOptimization?.expectedVisibilityGain);
  const visHeadroom = 100 - aiVisibilityScore;
  const opportunityScore = clamp(gainPotential * 1.5 + visHeadroom * 0.3);

  // ── Business Impact: weighted top-line composite ──
  const businessImpact = clamp(
    growthScore * 0.25 + roiScore * 0.20 + executionScore * 0.20 +
    aiVisibilityScore * 0.20 + (100 - riskScore) * 0.15
  );

  // ── Correlations (only when enough history) ──
  const correlations = [];
  const rankSeries = rankHistory.map((r, i) => num(r.avgPosition ?? r.overall ?? i)).filter(v => !Number.isNaN(v));
  const sr = pearson(scoreSeries, rankSeries);
  if (sr != null) correlations.push({ pair: "SEO score ↔ ranking", coefficient: sr, note: sr < -0.3 ? "score gains track with better ranks" : sr > 0.3 ? "unexpected positive correlation — investigate" : "weak correlation" });

  // ── Executive KPI set ──
  const kpis = [
    { key: "businessImpact", label: "Business Impact", value: businessImpact, unit: "/100" },
    { key: "growth",         label: "Growth",          value: growthScore,    unit: "/100", trend: scoreTrend.direction },
    { key: "roi",            label: "ROI",             value: roiScore,       unit: "/100" },
    { key: "risk",           label: "Risk",            value: riskScore,      unit: "/100", invert: true },
    { key: "execution",      label: "Execution",       value: executionScore, unit: "/100" },
    { key: "visibility",     label: "AI Visibility",   value: aiVisibilityScore, unit: "/100", trend: llmVisibility?.trend?.direction },
    { key: "opportunity",    label: "Opportunity",     value: opportunityScore, unit: "/100" },
    { key: "pipelineEff",    label: "Pipeline Eff.",   value: pipelineEfficiency, unit: "%" },
  ];

  // ── Trends payload for charts ──
  const trends = {
    score: { series: scoreSeries, ...scoreTrend },
    visibility: llmVisibility?.trend || { direction: "flat", delta: 0 },
    completionRate: completion,
  };

  // ── Deterministic executive insights (Phase 5) ──
  const insights = [];
  const push = (kind, tone, text) => insights.push({ kind, tone, text });
  if (scoreTrend.direction === "up") push("growth", "positive", `SEO score trending up (+${scoreTrend.delta} over ${scoreSeries.length} snapshots).`);
  if (scoreTrend.direction === "down") push("growth", "negative", `SEO score declining (${scoreTrend.delta}) — traffic risk building.`);
  if (llmVisibility?.trend?.direction === "down") push("visibility", "negative", "AI visibility falling — losing ground in AI answers.");
  if (llmVisibility?.trend?.direction === "up") push("authority", "positive", "Authority improving — AI visibility on the rise.");
  if (contentVelocity < 40) push("content", "warning", "Content velocity slowing — fewer answer-shaped assets shipping.");
  if (technicalHealth >= 80) push("technical", "positive", `Technical health strong (${technicalHealth}/100).`);
  if (forecastConfidence < 45) push("forecast", "warning", "Forecast confidence low — need more history for reliable projection.");
  if (pipelineEfficiency < 40) push("pipeline", "negative", `Pipeline efficiency low (${pipelineEfficiency}%) — failures/duration hurting throughput.`);
  if (executionScore < 40) push("execution", "warning", "Execution slowing — task completion + pipeline throughput below target.");
  if (roiScore >= 65) push("roi", "positive", "ROI improving — conversions outpacing spend.");
  if (riskScore >= 50) push("risk", "negative", `Elevated risk score (${riskScore}) — multiple negative signals converging.`);
  if (opportunityScore >= 60) push("opportunity", "positive", `High opportunity score (${opportunityScore}) — clear headroom to capture.`);
  if (!insights.length) push("status", "neutral", "Metrics stable. Maintain the plan and keep monitoring.");

  const executiveSummary =
    `Business impact ${businessImpact}/100. Growth ${scoreTrend.direction} (${growthScore}), ` +
    `ROI ${roiScore}, risk ${riskScore}, execution ${executionScore}, AI visibility ${aiVisibilityScore}. ` +
    `Forecast confidence ${forecastConfidence}%.`;

  return {
    kpis,
    growthScore, roiScore, riskScore, executionScore, aiVisibilityScore,
    technicalHealth, contentVelocity, authorityTrend, forecastConfidence,
    pipelineEfficiency, opportunityScore, businessImpact,
    trends, correlations,
    insights: insights.slice(0, 10),
    executiveSummary,
  };
}

module.exports = { buildBusinessIntelligence, seriesTrend };
