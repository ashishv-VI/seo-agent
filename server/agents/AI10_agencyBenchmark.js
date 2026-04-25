/**
 * AI10 — Agency Benchmark Intelligence
 *
 * Compares each client's SEO performance against:
 *  1. Other clients in the same agency (internal benchmark)
 *  2. Industry averages (niche benchmark)
 *  3. Their own historical best (personal best)
 *
 * This answers: "Are we doing well for THIS type of business?"
 * Turns raw scores into percentile rankings.
 *
 * Outputs:
 *  - benchmarkScore: percentile rank within agency
 *  - industryPercentile: vs industry average
 *  - personalBest: their own peak and current gap
 *  - competitive position: leader/average/lagging
 */
const { db }              = require("../config/firebase");
const { getState, saveState } = require("../shared-state/stateManager");
const { getLatestScore, getScoreHistory } = require("../utils/scoreCalculator");
const { callLLM, parseJSON }  = require("../utils/llm");

// Industry average SEO scores by business type (research-based estimates)
const INDUSTRY_BENCHMARKS = {
  ecommerce:    { avgScore: 62, avgCtr: 0.04, avgPosition: 18, leaderScore: 82 },
  legal:        { avgScore: 45, avgCtr: 0.03, avgPosition: 22, leaderScore: 72 },
  healthcare:   { avgScore: 48, avgCtr: 0.035, avgPosition: 20, leaderScore: 75 },
  restaurant:   { avgScore: 52, avgCtr: 0.05, avgPosition: 15, leaderScore: 78 },
  tradeservice: { avgScore: 38, avgCtr: 0.025, avgPosition: 28, leaderScore: 65 },
  saas:         { avgScore: 58, avgCtr: 0.045, avgPosition: 16, leaderScore: 85 },
  realestate:   { avgScore: 50, avgCtr: 0.038, avgPosition: 19, leaderScore: 76 },
  finance:      { avgScore: 44, avgCtr: 0.028, avgPosition: 24, leaderScore: 70 },
  default:      { avgScore: 48, avgCtr: 0.033, avgPosition: 21, leaderScore: 73 },
};

function detectIndustry(brief) {
  const text = [
    brief.businessName || "",
    ...[].concat(brief.services || []),
  ].join(" ").toLowerCase();

  if (/shop|store|product|ecommerce/.test(text)) return "ecommerce";
  if (/lawyer|solicitor|legal|law firm/.test(text)) return "legal";
  if (/doctor|dentist|clinic|health|medical/.test(text)) return "healthcare";
  if (/restaurant|cafe|food|catering/.test(text)) return "restaurant";
  if (/plumber|electrician|roofer|builder|tradesman|hvac/.test(text)) return "tradeservice";
  if (/software|saas|app|platform|tech/.test(text)) return "saas";
  if (/property|real estate|estate agent/.test(text)) return "realestate";
  if (/finance|insurance|mortgage|investment/.test(text)) return "finance";
  return "default";
}

async function runAI10(clientId, keys) {
  try {
    const brief    = await getState(clientId, "A1_brief");
    const rankings = await getState(clientId, "A10_rankings");

    if (!brief?.websiteUrl) return { success: false, error: "A1 brief not found" };

    // ── Get this client's score history ───────────────────────────────────
    const [latestScore, scoreHistory] = await Promise.all([
      getLatestScore(clientId).catch(() => null),
      getScoreHistory(clientId, 6).catch(() => []),
    ]);

    const currentScore  = latestScore?.overall || latestScore?.seoScore || 0;
    const personalBest  = Math.max(...scoreHistory.map(s => s.overall || s.score || 0), currentScore);
    const personalWorst = Math.min(...scoreHistory.filter(s => (s.overall || 0) > 0).map(s => s.overall || 100), currentScore);

    // ── Get agency-wide scores for percentile rank ─────────────────────────
    const ownerId      = (await db.collection("clients").doc(clientId).get()).data()?.ownerId;
    const agencySnap   = await db.collection("clients")
      .where("ownerId", "==", ownerId)
      .limit(50)
      .get()
      .catch(() => ({ docs: [] }));

    const agencyScores = [];
    for (const doc of agencySnap.docs) {
      if (doc.id === clientId) continue;
      const s = await getLatestScore(doc.id).catch(() => null);
      if (s?.overall) agencyScores.push(s.overall);
    }
    agencyScores.push(currentScore);
    agencyScores.sort((a, b) => a - b);

    const myRank       = agencyScores.indexOf(currentScore) + 1;
    const percentile   = Math.round((myRank / agencyScores.length) * 100);
    const agencyAvg    = agencyScores.reduce((s, v) => s + v, 0) / agencyScores.length;

    // ── Industry benchmark ────────────────────────────────────────────────
    const industry     = detectIndustry(brief);
    const benchmark    = INDUSTRY_BENCHMARKS[industry];
    const vsIndustry   = currentScore - benchmark.avgScore;
    const industryPct  = Math.round((currentScore / benchmark.avgScore) * 100);

    // ── GSC metrics ───────────────────────────────────────────────────────
    const avgCtr      = rankings?.avgCtr      || 0;
    const avgPosition = rankings?.avgPosition || 50;
    const vsAvgCtr    = avgCtr - benchmark.avgCtr;
    const vsAvgPos    = benchmark.avgPosition - avgPosition; // positive = better than average

    // ── LLM: competitive position analysis ───────────────────────────────
    let analysis = {};
    if ((keys?.groq || keys?.gemini)) {
      try {
        const prompt = `You are an SEO benchmark analyst.

Client: ${brief.businessName}
Industry: ${industry}
Current SEO score: ${currentScore}/100
Industry average: ${benchmark.avgScore}/100
Agency percentile: ${percentile}th (rank ${myRank} of ${agencyScores.length} clients)
Personal best: ${personalBest}/100 (currently ${personalBest - currentScore} points below peak)
Avg CTR: ${(avgCtr*100).toFixed(2)}% vs industry avg ${(benchmark.avgCtr*100).toFixed(2)}%
Avg position: ${avgPosition} vs industry avg ${benchmark.avgPosition}

Return ONLY valid JSON:
{
  "competitivePosition": "leader|above_average|average|below_average|lagging",
  "positionLabel": "short label like 'Top 20% of your industry'",
  "strengths": ["strength1", "strength2"],
  "gaps": ["gap1", "gap2"],
  "toReachLeader": "what it would take to reach ${benchmark.leaderScore} (industry leader score)",
  "monthsToLeader": "estimated months with consistent effort",
  "keyInsight": "1 sentence that would impress a client in a meeting",
  "reportHeadline": "headline for the client report: eg 'You outrank 73% of competitors in your area'"
}`;

        const response = await callLLM(prompt, keys, { maxTokens: 800, temperature: 0.3, clientId });
        analysis       = parseJSON(response) || {};
      } catch { /* non-blocking */ }
    }

    const result = {
      success:              true,
      scannedAt:            new Date().toISOString(),
      currentScore,
      industry,
      agencyPercentile:     percentile,
      agencyRank:           myRank,
      agencyTotal:          agencyScores.length,
      agencyAverage:        Math.round(agencyAvg),
      industryAverage:      benchmark.avgScore,
      industryLeaderScore:  benchmark.leaderScore,
      vsIndustry,
      industryPercentile:   industryPct,
      personalBest,
      personalWorst,
      gapToPersonalBest:    personalBest - currentScore,
      gapToIndustryLeader:  benchmark.leaderScore - currentScore,
      avgCtr:               parseFloat((avgCtr * 100).toFixed(2)),
      vsAvgCtr:             parseFloat((vsAvgCtr * 100).toFixed(2)),
      avgPosition:          parseFloat(avgPosition.toFixed(1)),
      vsAvgPosition:        parseFloat(vsAvgPos.toFixed(1)),
      competitivePosition:  analysis.competitivePosition || (currentScore >= benchmark.leaderScore * 0.9 ? "leader" : currentScore >= benchmark.avgScore ? "above_average" : "below_average"),
      positionLabel:        analysis.positionLabel        || `Score: ${currentScore}/100`,
      strengths:            analysis.strengths            || [],
      gaps:                 analysis.gaps                 || [],
      toReachLeader:        analysis.toReachLeader        || null,
      monthsToLeader:       analysis.monthsToLeader       || null,
      keyInsight:           analysis.keyInsight           || null,
      reportHeadline:       analysis.reportHeadline       || null,
      scoreHistory:         scoreHistory.slice(0, 6),
    };

    await saveState(clientId, "AI10_agencyBenchmark", result);
    return result;

  } catch (e) {
    console.error(`[AI10] Agency benchmark failed for ${clientId}:`, e.message);
    return { success: false, error: e.message };
  }
}

module.exports = { runAI10 };
