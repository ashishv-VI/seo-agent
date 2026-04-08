/**
 * Traffic Estimator Algorithm
 * Traffic = Volume × CTR_curve(position) × intent_modifier
 *
 * CTR curve based on real-world industry data (Advanced Web Ranking averages):
 *   Pos 1: 27.6%  Pos 2: 15.8%  Pos 3: 11.0%  Pos 4: 8.0%
 *   Pos 5: 5.7%   Pos 6: 4.7%   Pos 7: 4.0%   Pos 8: 3.5%
 *   Pos 9: 3.0%   Pos 10: 2.7% Pos 11–20: ~1%  Pos 21+: ~0.2%
 *
 * Usage:
 *   const { estimateTraffic } = require("./trafficEstimator");
 *   const traffic = estimateTraffic({ volume: 1000, position: 3, intent: "commercial" });
 */

// Industry-average CTR curve by position
const CTR_CURVE = {
  1:  0.276,
  2:  0.158,
  3:  0.110,
  4:  0.080,
  5:  0.057,
  6:  0.047,
  7:  0.040,
  8:  0.035,
  9:  0.030,
  10: 0.027,
};

// Intent modifier — different intents have different click behaviour
const INTENT_MODIFIER = {
  transactional:  1.20,  // high intent → users more likely to click
  commercial:     1.10,  // comparing options → higher CTR
  navigational:   0.90,  // looking for specific brand/site
  informational:  0.80,  // often answered by featured snippets / PAA
  local:          1.15,  // strong local intent → high click-through
};

/**
 * Estimate monthly organic traffic for a keyword at a given position
 * @param {Object} params
 * @param {number} params.volume    - monthly search volume
 * @param {number} params.position  - SERP position (1-based, can be fractional)
 * @param {string} params.intent    - transactional|commercial|informational|navigational|local
 * @param {boolean} params.hasFeaturedSnippet - reduces CTR for organic results
 * @param {boolean} params.hasPAA   - reduces CTR (answers in SERP without click)
 * @returns {Object} { clicks, ctr, intentModifier, positionCtr }
 */
function estimateTraffic({ volume = 0, position = 10, intent = "informational", hasFeaturedSnippet = false, hasPAA = false } = {}) {
  if (!volume || volume <= 0) return { clicks: 0, ctr: 0, positionCtr: 0, intentModifier: 1 };

  // Get base CTR for position
  const pos = Math.round(Math.max(1, position));
  let baseCTR;
  if (pos <= 10) {
    baseCTR = CTR_CURVE[pos] || 0.025;
  } else if (pos <= 20) {
    baseCTR = 0.010;
  } else if (pos <= 50) {
    baseCTR = 0.002;
  } else {
    baseCTR = 0.0005;
  }

  // Intent modifier
  const intentMod = INTENT_MODIFIER[intent] || 1.0;

  // SERP feature penalties — featured snippets + PAA steal clicks
  let serpPenalty = 1.0;
  if (hasFeaturedSnippet) serpPenalty *= 0.75;
  if (hasPAA)             serpPenalty *= 0.90;

  const finalCTR = baseCTR * intentMod * serpPenalty;
  const clicks   = Math.round(volume * finalCTR);

  return {
    clicks,
    ctr:            Math.round(finalCTR * 1000) / 10,  // as % (1 decimal)
    positionCtr:    Math.round(baseCTR * 1000) / 10,
    intentModifier: intentMod,
    serpPenalty:    Math.round(serpPenalty * 100),
  };
}

/**
 * Estimate total traffic for a set of keywords
 * @param {Array} keywords - [{keyword, volume, position, intent}]
 * @returns {Object} { totalClicks, byKeyword, topContributors }
 */
function estimateTotalTraffic(keywords = []) {
  let totalClicks = 0;
  const byKeyword = [];

  for (const kw of keywords) {
    const result = estimateTraffic({
      volume:   kw.volume   || kw.searchVolume || 0,
      position: kw.position || kw.currentPosition || 10,
      intent:   kw.intent   || kw.searchIntent || "informational",
    });
    totalClicks += result.clicks;
    byKeyword.push({
      keyword:  kw.keyword,
      volume:   kw.volume || kw.searchVolume || 0,
      position: kw.position || kw.currentPosition || 10,
      clicks:   result.clicks,
      ctr:      result.ctr,
    });
  }

  // Sort by traffic contribution
  byKeyword.sort((a, b) => b.clicks - a.clicks);

  return {
    totalClicks,
    keywordCount:    byKeyword.length,
    topContributors: byKeyword.slice(0, 10),
    byKeyword,
  };
}

/**
 * Project traffic if a keyword moves from currentPos → targetPos
 * @param {Object} params
 * @returns {Object} { currentClicks, projectedClicks, uplift, upliftPct }
 */
function projectTrafficUplift({ volume, currentPosition, targetPosition, intent = "informational" }) {
  const current   = estimateTraffic({ volume, position: currentPosition, intent });
  const projected = estimateTraffic({ volume, position: targetPosition,  intent });
  const uplift    = projected.clicks - current.clicks;
  const upliftPct = current.clicks > 0 ? Math.round((uplift / current.clicks) * 100) : null;
  return {
    currentClicks:   current.clicks,
    projectedClicks: projected.clicks,
    uplift,
    upliftPct,
    currentCTR:      current.ctr,
    projectedCTR:    projected.ctr,
  };
}

/**
 * Get CTR curve as array for charting
 */
function getCTRCurve() {
  return Object.entries(CTR_CURVE).map(([pos, ctr]) => ({
    position: parseInt(pos),
    ctr:      Math.round(ctr * 1000) / 10,
  }));
}

module.exports = { estimateTraffic, estimateTotalTraffic, projectTrafficUplift, getCTRCurve, CTR_CURVE, INTENT_MODIFIER };
