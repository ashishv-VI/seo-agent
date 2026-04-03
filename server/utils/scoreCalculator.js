/**
 * SEO Score Calculator — 4-Dimension Breakdown
 * Technical(30%) + Content(40%) + Authority(20%) + GEO(10%)
 */
const { db, FieldValue } = require("../config/firebase");

function weightedAvg(factors, weights) {
  return Object.keys(weights).reduce((sum, key) =>
    sum + ((factors[key] ?? 50) * (weights[key] ?? 0)), 0);
}

function clamp(v, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(v)));
}

function scoreFromMs(ms, thresholds) {
  if (!ms) return 60;
  if (ms <= thresholds[0]) return 100;
  if (ms <= thresholds[1]) return 55;
  return 20;
}

function scoreFromVal(val, thresholds) {
  if (val == null) return 60;
  if (val <= thresholds[0]) return 100;
  if (val <= thresholds[1]) return 55;
  return 20;
}

function estimateBacklinkScore(audit) {
  const eeat = audit?.checks?.eeat;
  if (!eeat) return 40;
  let score = 30;
  if (eeat.hasAboutPage)     score += 12;
  if (eeat.hasContactPage)   score += 10;
  if (eeat.hasPrivacyPolicy) score += 8;
  if (eeat.hasAuthorBio)     score += 15;
  if (eeat.hasSocialLinks)   score += 15;
  if (eeat.hasSchemaOrg)     score += 10;
  return clamp(score);
}

/**
 * Calculate full 4-dimension SEO score from agent data
 */
function calculateScore(audit, keywords, geo, onpage, technical) {
  const p1 = (audit?.issues?.p1 || []).length;
  const p2 = (audit?.issues?.p2 || []).length;
  const p3 = (audit?.issues?.p3 || []).length;
  const checks = audit?.checks || {};

  // ── TECHNICAL (30%) ──────────────────────────────
  const techScore = clamp(weightedAvg({
    ssl:            checks.isAccessible && checks.finalUrl?.startsWith("https") ? 100 : 30,
    pageSpeed:      checks.responseTime < 1000 ? 100 : checks.responseTime < 2500 ? 70 : checks.responseTime < 4000 ? 45 : 20,
    cwvLCP:         scoreFromMs(technical?.summary?.lcpMs ?? technical?.cwvData?.mobile?.rawMetrics?.lcp?.ms, [2500, 4000]),
    cwvCLS:         scoreFromVal(technical?.summary?.clsValue ?? technical?.cwvData?.mobile?.rawMetrics?.cls?.value, [0.1, 0.25]),
    crawlability:   checks.robotsTxt?.exists ? (checks.robotsTxt?.hasDisallow ? 70 : 95) : 50,
    mobileFriendly: technical?.summary?.mobileScore ?? (checks.viewport?.exists ? 75 : 35),
    structuredData: checks.schema?.length > 0 ? 85 : 30,
    redirectChain:  checks.redirectChain?.depth === 0 ? 100 : checks.redirectChain?.depth < 3 ? 65 : 20,
    requests:       (checks.httpRequests?.total || 0) < 20 ? 100 : (checks.httpRequests?.total || 0) < 50 ? 60 : 25,
  }, {
    ssl:0.12, pageSpeed:0.18, cwvLCP:0.18, cwvCLS:0.08,
    crawlability:0.14, mobileFriendly:0.12, structuredData:0.08, redirectChain:0.06, requests:0.04,
  }));

  const techFactors = [
    { name:"SSL / HTTPS",       score: checks.finalUrl?.startsWith("https") ? 100 : 30,  weight:0.12 },
    { name:"Page Response Time",score: checks.responseTime < 1000 ? 100 : checks.responseTime < 2500 ? 70 : 35, weight:0.18 },
    { name:"Core Web Vitals",   score: scoreFromMs(technical?.summary?.lcpMs ?? technical?.cwvData?.mobile?.rawMetrics?.lcp?.ms, [2500, 4000]), weight:0.18 },
    { name:"Crawlability",      score: checks.robotsTxt?.exists ? 90 : 50,               weight:0.14 },
    { name:"Mobile Friendly",   score: technical?.summary?.mobileScore ?? 60,             weight:0.12 },
    { name:"Structured Data",   score: checks.schema?.length > 0 ? 85 : 30,             weight:0.08 },
    { name:"Redirect Chain",    score: checks.redirectChain?.depth === 0 ? 100 : checks.redirectChain?.depth < 3 ? 60 : 20, weight:0.06 },
    { name:"HTTP Requests",     score: (checks.httpRequests?.total || 0) < 20 ? 100 : 55, weight:0.04 },
    { name:"XML Sitemap",       score: checks.sitemap?.exists ? 90 : 30,                 weight:0.08 },
  ];

  // ── CONTENT (40%) ─────────────────────────────────
  const titleScore   = p1 === 0 ? 90 : clamp(90 - p1 * 20);
  const metaScore    = checks.serpPreview?.description?.length > 50 ? 82 : 30;
  const h1Score      = (audit?.issues?.p1||[]).some(i=>i.type==="missing_h1") ? 15 : 85;
  const kwScore      = keywords?.totalKeywords > 30 ? 88 : keywords?.totalKeywords > 15 ? 68 : keywords?.totalKeywords > 5 ? 48 : 25;
  const eeatRaw      = checks.eeat?.score ?? 0;
  const eeatMax      = checks.eeat?.maxScore ?? 8;
  const eeatScore    = clamp((eeatRaw / eeatMax) * 100);
  const gapPenalty   = Math.min((keywords?.gaps?.length || 0) * 4, 40);
  const contentDepth = clamp(70 - gapPenalty);
  const intLinks     = clamp(100 - ((p2 + p3) * 3));

  const contentScore = clamp(weightedAvg({
    titleTags:       titleScore,
    metaDesc:        metaScore,
    h1Coverage:      h1Score,
    contentDepth,
    keywordCoverage: kwScore,
    internalLinking: intLinks,
    eeAtScore:       eeatScore,
  }, {
    titleTags:0.20, metaDesc:0.15, h1Coverage:0.15,
    contentDepth:0.20, keywordCoverage:0.15, internalLinking:0.10, eeAtScore:0.05,
  }));

  const contentFactors = [
    { name:"Title Tags",        score: titleScore,   weight:0.20 },
    { name:"Meta Descriptions", score: metaScore,    weight:0.15 },
    { name:"H1 Coverage",       score: h1Score,      weight:0.15 },
    { name:"Content Depth",     score: contentDepth, weight:0.20 },
    { name:"Keyword Coverage",  score: kwScore,      weight:0.15 },
    { name:"Internal Linking",  score: intLinks,     weight:0.10 },
    { name:"E-E-A-T Signals",   score: eeatScore,    weight:0.05 },
  ];

  // ── AUTHORITY (20%) ───────────────────────────────
  const backlinkEst    = estimateBacklinkScore(audit);
  const socialScore    = checks.eeat?.hasSocialLinks ? 65 : 30;
  const brandScore     = checks.eeat?.hasAboutPage ? 70 : 40;

  const authorityScore = clamp(weightedAvg({
    eeAtSignals:  eeatScore,
    backlinkEst,
    brandMentions:brandScore,
    socialSignals:socialScore,
  }, { eeAtSignals:0.35, backlinkEst:0.40, brandMentions:0.15, socialSignals:0.10 }));

  const authorityFactors = [
    { name:"E-E-A-T Signals",    score: eeatScore,    weight:0.35 },
    { name:"Backlink Profile",   score: backlinkEst,  weight:0.40 },
    { name:"Brand Presence",     score: brandScore,   weight:0.15 },
    { name:"Social Signals",     score: socialScore,  weight:0.10 },
  ];

  // ── GEO (10%) ─────────────────────────────────────
  const citations    = clamp(Math.min((geo?.offPage?.citationTargets?.length || 0) * 12, 90));
  const gmbScore     = geo?.gmb?.isOptimized ? 80 : 38;
  const aiViz        = geo?.aiVisibility?.score ?? 50;
  const locPages     = geo?.hasLocationPages ? 82 : 40;

  const geoScore = clamp(weightedAvg({
    localCitations: citations,
    gmbOptimized:   gmbScore,
    aiVisibility:   aiViz,
    locationPages:  locPages,
  }, { localCitations:0.30, gmbOptimized:0.35, aiVisibility:0.20, locationPages:0.15 }));

  const geoFactors = [
    { name:"Local Citations",   score: citations,  weight:0.30 },
    { name:"GMB Optimisation",  score: gmbScore,   weight:0.35 },
    { name:"AI Visibility",     score: aiViz,      weight:0.20 },
    { name:"Location Pages",    score: locPages,   weight:0.15 },
  ];

  // ── OVERALL ───────────────────────────────────────
  const overall = clamp(
    (techScore    * 0.30) +
    (contentScore * 0.40) +
    (authorityScore * 0.20) +
    (geoScore     * 0.10)
  );

  return {
    overall,
    breakdown: {
      technical: { score: techScore,     weight: 0.30, label:"Technical",  color:"#0891B2", factors: techFactors },
      content:   { score: contentScore,  weight: 0.40, label:"Content",    color:"#443DCB", factors: contentFactors },
      authority: { score: authorityScore,weight: 0.20, label:"Authority",  color:"#D97706", factors: authorityFactors },
      geo:       { score: geoScore,      weight: 0.10, label:"GEO / Local",color:"#059669", factors: geoFactors },
    }
  };
}

/**
 * Generate growth forecast: "If top 5 issues fixed → traffic increases by X%"
 */
function generateForecast(tasks, currentScore) {
  const top5 = (tasks || []).slice(0, 5);
  if (!top5.length) return null;

  const totalScoreGain   = top5.reduce((s, t) => s + (t.expectedScoreGain || 3), 0);
  const avgPositionGain  = top5.reduce((s, t) => {
    const g = typeof t.expectedRankGain === "string"
      ? parseFloat(t.expectedRankGain.match(/\d+/)?.[0] || "2") : 2;
    return s + g;
  }, 0) / top5.length;

  const trafficBoost = Math.round(avgPositionGain * 9);

  return {
    currentScore: currentScore || 0,
    projectedScore: Math.min((currentScore || 0) + totalScoreGain, 100),
    scoreGain:    `+${totalScoreGain} points`,
    trafficGrowth:`+${trafficBoost}%`,
    timeframe:    "4–8 weeks",
    confidence:   totalScoreGain > 25 ? "High" : totalScoreGain > 12 ? "Medium" : "Low",
    tasksConsidered: top5.length,
    breakdown: top5.map(t => ({
      task:  t.title,
      agent: t.assignedAgent,
      gain:  `+${t.expectedScoreGain || 3} score · ${t.expectedRankGain || "1-3 positions"}`,
    })),
  };
}

/**
 * Save score snapshot to score_history collection
 */
async function saveScoreHistory(clientId, scoreData) {
  try {
    const ref = db.collection("score_history").doc(clientId).collection("scores").doc();
    await ref.set({
      scoreId:    ref.id,
      clientId,
      recordedAt: FieldValue.serverTimestamp(),
      ...scoreData,
    });
    return ref.id;
  } catch (e) {
    console.error("[scoreCalculator] saveScoreHistory error:", e.message);
    return null;
  }
}

/**
 * Get latest score snapshot
 */
async function getLatestScore(clientId) {
  try {
    const snap = await db.collection("score_history").doc(clientId).collection("scores")
      .orderBy("recordedAt", "desc").limit(1).get();
    if (snap.empty) return null;
    return snap.docs[0].data();
  } catch { return null; }
}

/**
 * Get score history for chart (last N snapshots)
 */
async function getScoreHistory(clientId, limit = 12) {
  try {
    const snap = await db.collection("score_history").doc(clientId).collection("scores")
      .orderBy("recordedAt", "desc").limit(limit).get();
    return snap.docs.map(d => d.data()).reverse();
  } catch { return []; }
}

/**
 * Calculate revenue impact from keyword rankings
 * keyword → monthly searches → CTR by position → visitors → revenue
 */
function calculateRevenue(keywords, brief) {
  const convRate = ((brief?.conversionRate) || 2) / 100; // %
  const aov      = (brief?.avgOrderValue)   || 150;       // £/$ per sale

  // Industry-standard CTR curve by position
  const CTR_BY_POS = { 1:0.28, 2:0.15, 3:0.11, 4:0.08, 5:0.06, 6:0.04, 7:0.03, 8:0.03, 9:0.02, 10:0.02 };

  const kwData = (keywords?.keywordMap || []).filter(k => (k.searchVolume || 0) > 0);
  if (!kwData.length) return null;

  let currentVisitors   = 0;
  let potentialVisitors = 0;
  let currentRevenue    = 0;
  let potentialRevenue  = 0;

  const breakdown = kwData.slice(0, 30).map(kw => {
    const vol        = kw.searchVolume || 0;
    const pos        = kw.currentPosition || null;
    const curCTR     = pos ? (CTR_BY_POS[pos] || 0.01) : 0.001;
    const potCTR     = CTR_BY_POS[1]; // potential if #1
    const vis        = Math.round(vol * curCTR);
    const potVis     = Math.round(vol * potCTR);
    const rev        = Math.round(vis * convRate * aov);
    const potRev     = Math.round(potVis * convRate * aov);

    currentVisitors   += vis;
    potentialVisitors += potVis;
    currentRevenue    += rev;
    potentialRevenue  += potRev;

    return { keyword: kw.keyword, volume: vol, position: pos, visitors: vis, revenue: rev, potentialRevenue: potRev, potentialPosition: 1 };
  });

  const topOpportunities = breakdown
    .sort((a, b) => (b.potentialRevenue - b.revenue) - (a.potentialRevenue - a.revenue))
    .slice(0, 5);

  return {
    currentMonthlyVisitors:   currentVisitors,
    currentMonthlyRevenue:    currentRevenue,
    potentialMonthlyVisitors: potentialVisitors,
    potentialMonthlyRevenue:  potentialRevenue,
    revenueGap:               potentialRevenue - currentRevenue,
    conversionRate:           convRate * 100,
    avgOrderValue:            aov,
    currency:                 brief?.currency || "GBP",
    topOpportunities,
    keywordsWithVolume:       kwData.length,
  };
}

module.exports = { calculateScore, generateForecast, saveScoreHistory, getLatestScore, getScoreHistory, calculateRevenue };
