/**
 * Keyword Difficulty (KD) Algorithm
 *
 * Reverse-engineered from Ahrefs/Semrush methodology.
 *
 * Formula:
 *   KD = weighted average of top-10 SERP page signals:
 *   - Domain Rating of each page's domain (40% weight)
 *   - Estimated backlinks to that specific page (30% weight)
 *   - Content depth/word count signal (20% weight)
 *   - SERP features presence (10% weight)
 *
 * Scale: 0-100
 *   0-20  = Easy (new sites can rank)
 *   21-40 = Medium-Easy
 *   41-60 = Medium
 *   61-80 = Hard
 *   81-100 = Very Hard (huge authority sites dominating)
 */

const { getDRScore } = require("./drScore");
const { normalizeDomain } = require("../backlinkGraph");

// ── Calculate KD from SERP results ────────────────────────────────────────
async function calculateKD(serpResults, keyword = "") {
  if (!serpResults || serpResults.length === 0) {
    return { keyword, kd: 0, label: "Unknown", reason: "no SERP data" };
  }

  const top10 = serpResults.slice(0, 10);
  let weightedScore = 0;
  let totalWeight   = 0;

  for (let i = 0; i < top10.length; i++) {
    const page = top10[i];

    // Weight by position (top results matter more)
    const positionWeight = 1 / (i + 1);

    // 1. Domain Rating signal (40%)
    let drSignal = 0;
    try {
      const drData = await getDRScore(page.domain);
      drSignal = drData.dr || estimateDRFromUrl(page.url, page.domain);
    } catch {
      drSignal = estimateDRFromUrl(page.url, page.domain);
    }
    const drScore = (drSignal / 100) * 40;

    // 2. Backlink signal — estimated from domain authority (30%)
    // We don't have exact page-level backlinks yet, use DR as proxy
    const blScore = (drSignal / 100) * 30;

    // 3. Content depth signal (20%) — estimated from snippet length
    const contentSignal = estimateContentSignal(page.snippet || "", page.title || "");
    const contentScore  = contentSignal * 20;

    // 4. SERP features (10%) — features make it harder to rank
    const featureScore = 0; // Added in caller if features are present

    const pageScore = (drScore + blScore + contentScore + featureScore) * positionWeight;
    weightedScore  += pageScore;
    totalWeight    += positionWeight;
  }

  const rawKD = totalWeight > 0 ? weightedScore / totalWeight : 0;

  // Normalize and clamp to 0-100
  let kd = Math.round(Math.min(100, Math.max(0, rawKD)));

  // Adjust for number of results (fewer results = easier)
  if (top10.length < 5)  kd = Math.max(0, kd - 15);
  if (top10.length < 3)  kd = Math.max(0, kd - 25);

  return {
    keyword,
    kd,
    label:          getKDLabel(kd),
    color:          getKDColor(kd),
    topDomains:     top10.slice(0, 5).map(p => p.domain),
    analysedPages:  top10.length,
  };
}

// ── Estimate content signal from snippet ─────────────────────────────────
function estimateContentSignal(snippet, title) {
  let score = 0.3; // base

  // Longer snippets = more content
  if (snippet.length > 200) score += 0.2;
  if (snippet.length > 400) score += 0.2;

  // Structured content signals in snippet
  if (/\d+\s*(steps?|tips?|ways?|methods?)/i.test(snippet + title)) score += 0.1;
  if (/how to|guide|complete|ultimate/i.test(title)) score += 0.1;
  if (snippet.includes("...")) score += 0.1; // truncated = long content

  return Math.min(1, score);
}

// ── Estimate DR from well-known domains (when DB doesn't have data) ────────
function estimateDRFromUrl(url, domain) {
  // High-authority domains we know
  const HIGH_DR = [
    "wikipedia.org", "youtube.com", "amazon.com", "reddit.com",
    "linkedin.com", "twitter.com", "facebook.com", "instagram.com",
    "forbes.com", "hubspot.com", "neil patel.com", "moz.com",
    "search engine journal", "semrush.com", "ahrefs.com",
    "gov", "edu", "nhs.uk", "bbc.co.uk", "nytimes.com",
  ];
  const MED_DR = [
    "medium.com", "quora.com", "wordpress.com", "blogger.com",
    "shopify.com", "wix.com", "squarespace.com",
  ];

  const d = (domain || url || "").toLowerCase();
  if (HIGH_DR.some(h => d.includes(h)) || d.endsWith(".gov") || d.endsWith(".edu")) return 80;
  if (MED_DR.some(m => d.includes(m))) return 50;

  return 25; // default for unknown domains
}

// ── KD label ──────────────────────────────────────────────────────────────
function getKDLabel(kd) {
  if (kd <= 10) return "Easy";
  if (kd <= 25) return "Low";
  if (kd <= 45) return "Medium";
  if (kd <= 65) return "Hard";
  if (kd <= 80) return "Very Hard";
  return "Super Hard";
}

function getKDColor(kd) {
  if (kd <= 25) return "#059669"; // green
  if (kd <= 45) return "#D97706"; // yellow
  if (kd <= 65) return "#EA580C"; // orange
  return "#DC2626";               // red
}

// ── Quick KD estimate without SERP data ───────────────────────────────────
function estimateKDFromCompetition(adCount = 0, resultCount = 0, suggestionCount = 0) {
  let kd = 20; // base

  // More ads = commercial keyword = usually harder to rank
  kd += Math.min(30, adCount * 8);

  // More results = more competition
  if (resultCount > 1000000) kd += 20;
  else if (resultCount > 100000) kd += 10;

  // More autocomplete suggestions = more competition usually
  kd += Math.min(15, suggestionCount * 1.5);

  return Math.min(95, Math.round(kd));
}

module.exports = { calculateKD, getKDLabel, getKDColor, estimateKDFromCompetition };
