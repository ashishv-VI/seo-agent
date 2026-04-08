/**
 * Domain Rating (DR) Score Algorithm
 * PageRank-style calculation: DR = Σ(DR_referrer / outlinks_of_referrer)
 * Normalized to 0–100 log scale (like Ahrefs DR)
 *
 * Usage:
 *   const { computeDR, normalizeDR } = require("./drScore");
 *   const dr = await computeDR(domain, backlinkGraph);
 */

/**
 * Iterative PageRank-style DR computation
 * @param {string} targetDomain - domain to score
 * @param {Array}  backlinks    - [{from, fromDR, outlinksCount}]
 * @param {Object} opts
 * @returns {number} DR 0–100
 */
function computeDR(targetDomain, backlinks = [], opts = {}) {
  const {
    dampingFactor = 0.85,
    iterations    = 10,
    defaultDR     = 20,  // assumed DR of unknown referring domains
  } = opts;

  if (!backlinks || backlinks.length === 0) return 0;

  // Filter valid backlinks (no self-links, no spam signals)
  const validLinks = backlinks.filter(b => {
    if (!b || !b.from) return false;
    const fromClean = (b.from || "").replace(/^www\./, "").toLowerCase();
    const toClean   = (targetDomain || "").replace(/^www\./, "").toLowerCase();
    return fromClean !== toClean;
  });

  if (validLinks.length === 0) return 0;

  // Iterative PageRank accumulation
  let score = 0;
  for (let i = 0; i < iterations; i++) {
    let iterScore = 0;
    for (const link of validLinks) {
      const referrerDR    = typeof link.fromDR === "number" ? link.fromDR : defaultDR;
      const outlinksCount = Math.max(1, link.outlinksCount || 10);
      // Each link passes: dampingFactor * (referrerDR / outlinksCount)
      const passed = dampingFactor * (referrerDR / outlinksCount);
      iterScore += passed;
    }
    // Converge toward stable score
    score = (score * 0.3) + (iterScore * 0.7);
  }

  return normalizeDR(score);
}

/**
 * Normalize raw PageRank score to 0–100 log scale
 * Similar to Ahrefs: small sites 1-20, authority sites 40-70, big brands 80+
 */
function normalizeDR(rawScore) {
  if (!rawScore || rawScore <= 0) return 0;
  // Log scale: ln(rawScore + 1) / ln(maxExpectedRaw + 1) * 100
  const maxExpectedRaw = 5000; // top-tier sites
  const normalized = (Math.log(rawScore + 1) / Math.log(maxExpectedRaw + 1)) * 100;
  return Math.min(100, Math.max(0, Math.round(normalized * 10) / 10));
}

/**
 * Estimate DR from backlink count alone (quick approximation)
 * Useful when we don't have per-referrer DR data
 * @param {number} backlinkCount  - total referring domains
 * @param {number} avgReferrerDR  - average DR of referring domains (default 25)
 */
function estimateDRFromCount(backlinkCount, avgReferrerDR = 25) {
  if (!backlinkCount || backlinkCount <= 0) return 0;
  // Rough model: DR grows with sqrt of link count × avg referrer quality
  const rawScore = Math.sqrt(backlinkCount) * (avgReferrerDR / 10);
  return normalizeDR(rawScore);
}

/**
 * Interpret DR score
 */
function drLabel(dr) {
  if (dr >= 70) return { label: "Very High Authority", color: "#059669" };
  if (dr >= 50) return { label: "High Authority",      color: "#0891B2" };
  if (dr >= 30) return { label: "Medium Authority",    color: "#D97706" };
  if (dr >= 10) return { label: "Low Authority",       color: "#DC2626" };
  return             { label: "New / No Data",         color: "#888"    };
}

module.exports = { computeDR, normalizeDR, estimateDRFromCount, drLabel };
