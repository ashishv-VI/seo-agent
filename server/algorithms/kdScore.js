/**
 * Keyword Difficulty (KD) Score Algorithm
 * Weighted SERP signal model:
 *   DA 40% + Backlinks 30% + Content Quality 20% + SERP Features 10%
 *
 * Usage:
 *   const { computeKD, interpretKD } = require("./kdScore");
 *   const kd = computeKD(serpResults);
 */

/**
 * Compute keyword difficulty from SERP result data
 * @param {Array}  serpResults  - top 10 results [{url, da, backlinks, wordCount, hasSchema, hasFeaturedSnippet}]
 * @param {Object} opts
 * @returns {number} KD 0–100
 */
function computeKD(serpResults = [], opts = {}) {
  const {
    topN = 10, // how many results to analyse
  } = opts;

  if (!serpResults || serpResults.length === 0) return 50; // unknown → medium difficulty

  const results = serpResults.slice(0, topN);

  // ── Signal 1: Domain Authority (40% weight) ────────────────────────────────
  const avgDA = avg(results.map(r => normalizeDA(r.da || r.domainAuthority || 0)));

  // ── Signal 2: Backlinks (30% weight) ──────────────────────────────────────
  // Log-scale backlink count: 0 links = 0, 1000+ links → approaching 100
  const avgBLScore = avg(results.map(r => {
    const bl = r.backlinks || r.backlinkCount || 0;
    return Math.min(100, (Math.log10(bl + 1) / Math.log10(10001)) * 100);
  }));

  // ── Signal 3: Content Quality (20% weight) ────────────────────────────────
  // Proxy: word count + schema presence
  const avgContentScore = avg(results.map(r => {
    const wcScore     = Math.min(100, ((r.wordCount || 0) / 2000) * 100);
    const schemaBonus = r.hasSchema || r.schemaTypes?.length > 0 ? 15 : 0;
    return Math.min(100, wcScore + schemaBonus);
  }));

  // ── Signal 4: SERP Features (10% weight) ──────────────────────────────────
  // Featured snippets, PAA, video results — harder to displace
  const featuredSnippetPresent = results.some(r => r.hasFeaturedSnippet || r.featuredSnippet);
  const paaPresent             = results.some(r => r.hasPAA || r.peopleAlsoAsk?.length > 0);
  const videoPresent           = results.some(r => r.hasVideo || r.type === "video");
  const serpFeatureScore       = ((featuredSnippetPresent ? 40 : 0) + (paaPresent ? 30 : 0) + (videoPresent ? 30 : 0));

  // ── Weighted Final Score ───────────────────────────────────────────────────
  const kd = (
    (avgDA          * 0.40) +
    (avgBLScore     * 0.30) +
    (avgContentScore * 0.20) +
    (serpFeatureScore * 0.10)
  );

  return Math.min(100, Math.max(0, Math.round(kd)));
}

/**
 * Compute KD from minimal data (just avg DA + result count)
 * Quick approximation when full SERP data not available
 */
function estimateKD(avgDomainAuthority, resultCount = 10, hasFeaturedSnippet = false) {
  const daScore = normalizeDA(avgDomainAuthority) * 0.60;
  const densityScore = Math.min(40, (resultCount / 10) * 40) * 0.30;
  const snippetScore = hasFeaturedSnippet ? 10 : 0;
  return Math.min(100, Math.max(0, Math.round(daScore + densityScore + snippetScore)));
}

/**
 * Normalize DA (0–100) to difficulty contribution
 * DA 50 = moderate, DA 80+ = very hard
 */
function normalizeDA(da) {
  if (!da || da <= 0) return 0;
  return Math.min(100, da); // DA is already 0-100
}

function avg(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((s, v) => s + (v || 0), 0) / arr.length;
}

/**
 * Interpret KD score for UI display
 */
function interpretKD(kd) {
  if (kd <= 20) return { label: "Easy",        color: "#059669", description: "Low competition — target immediately" };
  if (kd <= 40) return { label: "Medium",       color: "#0891B2", description: "Achievable with good content" };
  if (kd <= 60) return { label: "Hard",         color: "#D97706", description: "Needs backlinks + authority" };
  if (kd <= 80) return { label: "Very Hard",    color: "#DC2626", description: "Long-term play — 6–12 months" };
  return             { label: "Extremely Hard", color: "#7C3AED", description: "Requires significant authority" };
}

/**
 * Opportunity score: high volume + low KD = best targets
 * @param {number} volume - monthly search volume
 * @param {number} kd     - keyword difficulty 0–100
 * @returns {number} opportunity 0–100
 */
function opportunityScore(volume, kd) {
  const volScore = Math.min(100, (Math.log10((volume || 0) + 1) / Math.log10(100001)) * 100);
  const easeScore = 100 - (kd || 50);
  return Math.round((volScore * 0.5) + (easeScore * 0.5));
}

module.exports = { computeKD, estimateKD, interpretKD, opportunityScore };
