/**
 * Traffic Estimator
 *
 * Formula: Traffic = Keyword_Volume × CTR(position) × Intent_Modifier
 *
 * CTR Curve: Industry standard (Advanced Web Ranking 2024 data)
 * Intent modifier: Featured snippets steal clicks, local packs redirect
 *
 * Also calculates Share of Voice (SoV) for a domain across keywords.
 */

// Industry standard CTR by position (desktop, no featured snippet)
const CTR_CURVE = {
  1:  0.285,
  2:  0.157,
  3:  0.110,
  4:  0.080,
  5:  0.072,
  6:  0.051,
  7:  0.040,
  8:  0.032,
  9:  0.028,
  10: 0.025,
  11: 0.015,
  12: 0.012,
  13: 0.010,
  14: 0.008,
  15: 0.007,
  20: 0.004,
};

// SERP feature CTR modifiers (featured snippet steals from position 1)
const FEATURE_MODIFIERS = {
  featured_snippet: 0.65, // reduces position 1 CTR by 35%
  people_also_ask:  0.90, // reduces CTR by 10%
  local_pack:       0.80, // reduces CTR by 20%
  shopping_ads:     0.85, // reduces organic CTR by 15%
  news:             0.92,
  image_pack:       0.95,
};

// ── Get CTR for a position ────────────────────────────────────────────────
function getCTR(position, serpFeatures = []) {
  const pos = Math.round(position);
  let ctr = CTR_CURVE[pos] || CTR_CURVE[20] || 0.002;

  // Apply feature modifiers
  for (const feature of serpFeatures) {
    const modifier = FEATURE_MODIFIERS[feature];
    if (modifier) ctr *= modifier;
  }

  return ctr;
}

// ── Estimate monthly traffic for one keyword-position pair ────────────────
function estimateKeywordTraffic(volumeMidpoint, position, serpFeatures = []) {
  if (!position || position > 100) return 0;

  const ctr     = getCTR(position, serpFeatures);
  const traffic = Math.round(volumeMidpoint * ctr);
  return traffic;
}

// ── Estimate total domain traffic from all ranking keywords ──────────────
function estimateDomainTraffic(rankings, volumeData = {}) {
  let totalTraffic = 0;
  const breakdown  = [];

  for (const ranking of rankings) {
    const { keyword, position } = ranking;
    if (!position || position > 100) continue;

    const volData = volumeData[keyword] || {};
    const volume  = volData.volumeMidpoint || 500; // default if unknown

    const traffic = estimateKeywordTraffic(volume, position);
    totalTraffic += traffic;

    breakdown.push({
      keyword,
      position,
      estimatedVolume: volume,
      estimatedTraffic: traffic,
      ctr: (getCTR(position) * 100).toFixed(1) + "%",
    });
  }

  return {
    totalEstimatedTraffic: totalTraffic,
    breakdown: breakdown.sort((a, b) => b.estimatedTraffic - a.estimatedTraffic).slice(0, 50),
    confidence: rankings.length > 10 ? "Medium" : "Low",
    note: "Traffic estimates based on position × CTR model. Actual traffic may vary ±40%.",
  };
}

// ── Share of Voice calculation ────────────────────────────────────────────
function calculateShareOfVoice(domainRankings, allVolumeData = {}, totalMarketKeywords = []) {
  let domainTraffic = 0;
  let marketTraffic = 0;

  for (const { keyword, position } of domainRankings) {
    const vol = allVolumeData[keyword]?.volumeMidpoint || 500;
    domainTraffic += estimateKeywordTraffic(vol, position);
  }

  // Total market = sum of all keyword volumes × position 1 CTR
  for (const keyword of totalMarketKeywords) {
    const vol = allVolumeData[keyword]?.volumeMidpoint || 500;
    marketTraffic += Math.round(vol * CTR_CURVE[1]);
  }

  const sov = marketTraffic > 0
    ? ((domainTraffic / marketTraffic) * 100).toFixed(2)
    : 0;

  return {
    domainTrafficEstimate: domainTraffic,
    marketTrafficEstimate: marketTraffic,
    shareOfVoice:          parseFloat(sov),
    shareOfVoiceLabel:     getSOVLabel(parseFloat(sov)),
  };
}

function getSOVLabel(sov) {
  if (sov >= 20) return "Market Leader";
  if (sov >= 10) return "Strong Presence";
  if (sov >= 5)  return "Growing";
  if (sov >= 1)  return "Low Visibility";
  return "Minimal";
}

// ── Traffic trend (month-over-month) ──────────────────────────────────────
function calculateTrafficTrend(currentTraffic, previousTraffic) {
  if (!previousTraffic || previousTraffic === 0) return { change: 0, percent: 0, trend: "new" };

  const change  = currentTraffic - previousTraffic;
  const percent = ((change / previousTraffic) * 100).toFixed(1);
  const trend   = change > 0 ? "up" : change < 0 ? "down" : "stable";

  return { change, percent: parseFloat(percent), trend };
}

module.exports = {
  estimateKeywordTraffic,
  estimateDomainTraffic,
  calculateShareOfVoice,
  calculateTrafficTrend,
  getCTR,
  CTR_CURVE,
};
