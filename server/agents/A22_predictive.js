/**
 * A22 — Predictive Intelligence Agent
 *
 * Reads score_history + rank_history + weekly_snapshots
 * to produce:
 *   1. 90-day traffic forecast (linear regression on weekly clicks)
 *   2. Opportunity scoring per keyword: (CTR at target pos × search volume) - current traffic
 *   3. Ranked opportunity list for CMO / agency reviews
 *
 * Pure JS — no external ML library. Linear regression ~15 lines.
 * Falls back to scoreCalculator.generateForecast() when data is too sparse (<6 weeks).
 */

const { saveState, getState } = require("../shared-state/stateManager");
const { db }                  = require("../config/firebase");
const { getScoreHistory, generateForecast } = require("../utils/scoreCalculator");

// CTR by SERP position (industry averages)
const CTR_BY_POSITION = {
  1: 0.278, 2: 0.152, 3: 0.111, 4: 0.079, 5: 0.057,
  6: 0.042, 7: 0.032, 8: 0.025, 9: 0.020, 10: 0.016,
};
function ctrAtPosition(pos) {
  if (!pos || pos < 1) return 0;
  const rounded = Math.round(pos);
  if (rounded <= 1)  return CTR_BY_POSITION[1];
  if (rounded >= 10) return CTR_BY_POSITION[10] * (1 / (rounded - 8));
  return CTR_BY_POSITION[rounded] || 0.005;
}

// ── Simple least-squares linear regression ────────────────────────────────────
// x: week index (0, 1, 2 ...), y: weekly clicks
// Returns { slope, intercept, r2 }
function linearRegression(data) {
  const n = data.length;
  if (n < 2) return { slope: 0, intercept: data[0]?.y || 0, r2: 0 };

  const sumX  = data.reduce((s, p, i) => s + i, 0);
  const sumY  = data.reduce((s, p)    => s + p.y, 0);
  const sumX2 = data.reduce((s, p, i) => s + i * i, 0);
  const sumXY = data.reduce((s, p, i) => s + i * p.y, 0);

  const slope     = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // R² — goodness of fit
  const meanY = sumY / n;
  const ssTot = data.reduce((s, p) => s + (p.y - meanY) ** 2, 0);
  const ssRes = data.reduce((s, p, i) => s + (p.y - (slope * i + intercept)) ** 2, 0);
  const r2    = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return { slope, intercept, r2 };
}

async function runA22(clientId, keys) {
  try {
  const [brief, keywords, rankHistory] = await Promise.all([
    getState(clientId, "A1_brief").catch(() => null),
    getState(clientId, "A3_keywords").catch(() => null),
    db.collection("rank_history").where("clientId", "==", clientId).limit(30).get()
      .then(s => s.docs.map(d => d.data()).sort((a, b) => (a.date || "").localeCompare(b.date || "")))
      .catch(() => []),
  ]);

  if (!brief) return { success: false, error: "No brief found — run A1 first" };

  // ── 1. Weekly clicks time series ─────────────────────────────────────────
  const weeklySnap = await db.collection("weekly_snapshots")
    .where("clientId", "==", clientId)
    .limit(24)
    .get()
    .then(s => s.docs.map(d => d.data()).sort((a, b) => (a.week || "").localeCompare(b.week || "")))
    .catch(() => []);

  const clickSeries = weeklySnap
    .filter(s => s.gsc?.totalClicks != null)
    .map((s, i) => ({ x: i, y: s.gsc.totalClicks, week: s.week }));

  const scoreHistory = await getScoreHistory(clientId, 24).catch(() => []);

  // ── 2. Traffic forecast ───────────────────────────────────────────────────
  let trafficForecast = null;
  let forecastMethod  = "none";
  let regression      = null;

  if (clickSeries.length >= 6) {
    // Enough data for regression
    regression = linearRegression(clickSeries);
    const lastIdx    = clickSeries.length - 1;
    const lastClicks = clickSeries[lastIdx].y;

    // Project 13 weeks (≈90 days) forward
    const forecastWeeks = Array.from({ length: 13 }, (_, i) => {
      const weekIdx  = lastIdx + 1 + i;
      const predicted = Math.max(0, Math.round(regression.slope * weekIdx + regression.intercept));
      return {
        weekOffset: i + 1,
        weekLabel:  `Week +${i + 1}`,
        predicted,
        low:        Math.max(0, Math.round(predicted * 0.85)),   // 15% confidence band
        high:       Math.round(predicted * 1.15),
      };
    });

    const predicted90d = forecastWeeks[forecastWeeks.length - 1].predicted;
    const uplift90d    = lastClicks > 0 ? Math.round(((predicted90d - lastClicks) / lastClicks) * 100) : null;

    trafficForecast = {
      currentWeeklyClicks: lastClicks,
      predicted90dClicks:  predicted90d,
      uplift90dPct:        uplift90d,
      trend:               regression.slope > 5 ? "growing" : regression.slope < -5 ? "declining" : "stable",
      rSquared:            parseFloat(regression.r2.toFixed(3)),
      confidence:          regression.r2 > 0.7 ? "high" : regression.r2 > 0.4 ? "medium" : "low",
      weeks:               forecastWeeks,
      dataPoints:          clickSeries.length,
    };
    forecastMethod = "linear_regression";
  } else if (scoreHistory.length >= 3) {
    // Fallback: task-based estimate
    const currentScore = scoreHistory[scoreHistory.length - 1]?.overall || 50;
    const fb = generateForecast([], currentScore);
    trafficForecast = {
      currentWeeklyClicks: null,
      predicted90dPct:     fb?.month3 ? `+${fb.month3}%` : null,
      note:                "Estimate based on SEO score trajectory — connect GSC for precision forecast",
      trend:               fb?.trend || "unknown",
      confidence:          "low",
      weeks:               [],
      dataPoints:          0,
    };
    forecastMethod = "score_estimate";
  }

  // ── 3. Keyword opportunity scoring ───────────────────────────────────────
  const keywordMap = keywords?.keywordMap || [];
  const rankMap    = {};
  if (rankHistory.length > 0) {
    const latest = rankHistory[rankHistory.length - 1];
    (latest.rankings || []).forEach(r => {
      if (r.keyword) rankMap[r.keyword.toLowerCase()] = r.position;
    });
  }

  // GSC weekly data for current traffic per keyword
  const gscKeywordData = weeklySnap.length > 0 ? (weeklySnap[weeklySnap.length - 1].gsc?.topKeywords || []) : [];
  const gscClickMap    = {};
  gscKeywordData.forEach(k => { gscClickMap[k.keyword?.toLowerCase()] = k.clicks; });

  const opportunities = keywordMap.map(kw => {
    const currentPos   = rankMap[kw.keyword?.toLowerCase()] || null;
    const targetPos    = currentPos && currentPos > 3 ? Math.max(1, currentPos - 5) : currentPos ? 1 : 5; // move up 5 spots or aim for pos 1
    const volume       = kw.searchVolume || kw.volume || 0;
    const currentCtr   = currentPos ? ctrAtPosition(currentPos) : 0;
    const targetCtr    = ctrAtPosition(targetPos);
    const currentTraffic = volume > 0 ? Math.round(volume * currentCtr / 4) : (gscClickMap[kw.keyword?.toLowerCase()] || 0); // /4 for weekly
    const targetTraffic  = volume > 0 ? Math.round(volume * targetCtr / 4) : 0;
    const trafficGain    = Math.max(0, targetTraffic - currentTraffic);

    // Opportunity score: traffic gain weighted by keyword priority
    const priorityWeight = kw.priority === "high" ? 1.5 : kw.priority === "medium" ? 1.0 : 0.6;
    const difficultyPenalty = kw.difficulty ? (1 - kw.difficulty / 150) : 1;
    const oppScore = Math.round(trafficGain * priorityWeight * difficultyPenalty);

    return {
      keyword:         kw.keyword,
      cluster:         kw.cluster         || "general",
      intent:          kw.intent          || "informational",
      priority:        kw.priority        || "medium",
      searchVolume:    volume,
      difficulty:      kw.difficulty      || null,
      currentPosition: currentPos,
      targetPosition:  targetPos,
      currentCtr:      parseFloat((currentCtr * 100).toFixed(1)),
      targetCtr:       parseFloat((targetCtr  * 100).toFixed(1)),
      weeklyTrafficGain: trafficGain,
      opportunityScore:  oppScore,
      action:          currentPos
        ? currentPos <= 3  ? "Defend — build links to protect position"
        : currentPos <= 10 ? "Push to top 3 — content refresh + 2 links"
        : currentPos <= 20 ? "Page 2 — significant content + link push needed"
        : "Not ranking — new content page needed"
        : "Not ranking — target with new page",
    };
  })
  .filter(k => k.opportunityScore > 0 || k.searchVolume > 0)
  .sort((a, b) => b.opportunityScore - a.opportunityScore)
  .slice(0, 30);

  // ── 4. Score forecast ─────────────────────────────────────────────────────
  const currentScore   = scoreHistory.length > 0 ? scoreHistory[scoreHistory.length - 1]?.overall : null;
  const scorePoints    = scoreHistory.slice(-12).map((s, i) => ({ x: i, y: s.overall || 50 }));
  const scoreRegression= scorePoints.length >= 4 ? linearRegression(scorePoints) : null;
  const scoreIn90d     = scoreRegression
    ? Math.min(100, Math.max(0, Math.round(scoreRegression.slope * (scorePoints.length + 13) + scoreRegression.intercept)))
    : null;

  // ── 5. Build output ───────────────────────────────────────────────────────
  const topOpportunity = opportunities[0];
  const totalWeeklyGain = opportunities.slice(0, 10).reduce((s, k) => s + k.weeklyTrafficGain, 0);

  const output = {
    status:     "complete",
    generatedAt: new Date().toISOString(),
    forecastMethod,

    trafficForecast,

    scoreProjection: scoreIn90d != null ? {
      current:    currentScore,
      in90Days:   scoreIn90d,
      delta:      currentScore != null ? scoreIn90d - currentScore : null,
      trend:      scoreRegression?.slope > 0.2 ? "improving" : scoreRegression?.slope < -0.2 ? "declining" : "stable",
    } : null,

    opportunities,

    summary: {
      topOpportunity:       topOpportunity?.keyword || null,
      topOpportunityAction: topOpportunity?.action  || null,
      totalOpportunities:   opportunities.length,
      weeklyTrafficPotential: totalWeeklyGain,
      monthlyTrafficPotential: totalWeeklyGain * 4,
      message: trafficForecast?.trend === "growing"
        ? `Traffic growing — ${opportunities.length} keyword opportunities identified. Top: "${topOpportunity?.keyword}"`
        : `${opportunities.length} keyword opportunities identified. Focus on "${topOpportunity?.keyword}" for biggest impact.`,
    },
  };

  await saveState(clientId, "A22_predictive", output);
  return { success: true, forecast: output };
  } catch (e) {
    console.error(`[A22] Predictive forecast failed for ${clientId}:`, e.message);
    return { success: false, error: e.message };
  }
}

module.exports = { runA22 };
