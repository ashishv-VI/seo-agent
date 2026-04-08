/**
 * Search Volume Estimator
 * 5 signals: autocomplete rank + ad count + SERP result count + related queries + trends proxy
 *
 * Does NOT require paid API. Uses free signals from DDG autocomplete + SERP analysis.
 *
 * Usage:
 *   const { estimateVolume } = require("./volumeEstimator");
 *   const vol = await estimateVolume("plumber london");
 */

/**
 * Estimate monthly search volume for a keyword using 5 free signals
 * @param {string} keyword
 * @param {Object} serpData - optional pre-fetched SERP data { results, resultCount, adCount, relatedSearches }
 * @returns {Object} { volume, confidence, signals, tier }
 */
async function estimateVolume(keyword, serpData = null) {
  const signals = {};
  let score = 0;
  let signalCount = 0;

  // ── Signal 1: Autocomplete rank ──────────────────────────────────────────
  // If a keyword appears as the first suggestion, it's high volume
  try {
    const autocompleteRank = await getAutocompleteRank(keyword);
    signals.autocompleteRank = autocompleteRank;
    if (autocompleteRank === 1)      score += 100;
    else if (autocompleteRank <= 3)  score += 70;
    else if (autocompleteRank <= 5)  score += 40;
    else if (autocompleteRank > 0)   score += 20;
    else                             score += 5;
    signalCount++;
  } catch {
    signals.autocompleteRank = null;
  }

  // ── Signal 2: SERP organic result count (total results) ──────────────────
  // "About 45,000,000 results" → higher count = more content = more searches
  if (serpData?.resultCount) {
    signals.resultCount = serpData.resultCount;
    const rc = serpData.resultCount;
    if (rc > 10_000_000) score += 80;
    else if (rc > 1_000_000) score += 60;
    else if (rc > 100_000)   score += 40;
    else if (rc > 10_000)    score += 20;
    else                     score += 5;
    signalCount++;
  }

  // ── Signal 3: Ad count (Google Ads advertisers = commercial volume) ────────
  // More advertisers = more searches = higher commercial value
  if (serpData?.adCount !== undefined) {
    signals.adCount = serpData.adCount;
    const ads = serpData.adCount;
    if (ads >= 4)      score += 90;
    else if (ads >= 2) score += 60;
    else if (ads >= 1) score += 35;
    else               score += 10;
    signalCount++;
  }

  // ── Signal 4: Related searches count ─────────────────────────────────────
  if (serpData?.relatedSearches?.length) {
    signals.relatedCount = serpData.relatedSearches.length;
    const rel = serpData.relatedSearches.length;
    if (rel >= 8)     score += 70;
    else if (rel >= 5) score += 50;
    else if (rel >= 3) score += 30;
    else              score += 10;
    signalCount++;
  }

  // ── Signal 5: Keyword length heuristic ───────────────────────────────────
  // Short keywords generally have higher volume; long-tail = lower volume
  const wordCount = keyword.trim().split(/\s+/).length;
  signals.wordCount = wordCount;
  if (wordCount === 1)     score += 80;
  else if (wordCount === 2) score += 60;
  else if (wordCount === 3) score += 35;
  else if (wordCount <= 5)  score += 15;
  else                      score += 5;
  signalCount++;

  // ── Aggregate signal score → volume tier ─────────────────────────────────
  const avgScore = signalCount > 0 ? score / signalCount : 30;
  const { volume, tier } = scoreToVolume(avgScore, wordCount);

  // Confidence: more signals = higher confidence
  const confidence = Math.min(1, (signalCount / 4) * 0.8 + 0.2);

  return {
    keyword,
    volume,
    tier,
    confidence: Math.round(confidence * 100) / 100,
    signals,
    avgScore: Math.round(avgScore),
    estimatedAt: new Date().toISOString(),
  };
}

/**
 * Estimate volume for multiple keywords in parallel
 * @param {string[]} keywords
 * @param {Object}   serpDataMap - { [keyword]: serpData } optional
 * @returns {Array} sorted by estimated volume desc
 */
async function estimateVolumesBatch(keywords = [], serpDataMap = {}) {
  const results = await Promise.allSettled(
    keywords.map(kw => estimateVolume(kw, serpDataMap[kw] || null))
  );
  return results
    .filter(r => r.status === "fulfilled")
    .map(r => r.value)
    .sort((a, b) => b.volume - a.volume);
}

/**
 * Get autocomplete rank for a keyword (DDG autocomplete API)
 * Returns 0 if not found, 1 if first suggestion
 */
async function getAutocompleteRank(keyword) {
  try {
    const encoded = encodeURIComponent(keyword);
    const url     = `https://duckduckgo.com/ac/?q=${encoded}&type=list`;
    const res     = await fetch(url, {
      signal:  AbortSignal.timeout(5000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SEOBot/1.0)" },
    });
    if (!res.ok) return 0;
    const data = await res.json();
    // DDG autocomplete returns [query, [suggestions]]
    const suggestions = Array.isArray(data) && Array.isArray(data[1]) ? data[1] : [];
    const kwLower     = keyword.toLowerCase().trim();
    const idx         = suggestions.findIndex(s => (s || "").toLowerCase().trim() === kwLower);
    return idx >= 0 ? idx + 1 : 0;
  } catch {
    return 0;
  }
}

/**
 * Convert aggregate signal score to volume estimate
 * Tiers: massive (100k+), high (10k-100k), medium (1k-10k), low (100-1k), minimal (<100)
 */
function scoreToVolume(avgScore, wordCount = 2) {
  // Long-tail keywords get volume scaled down
  const longtailPenalty = wordCount >= 4 ? 0.3 : wordCount === 3 ? 0.6 : 1.0;

  let tier, baseVolume;
  if (avgScore >= 80)      { tier = "massive"; baseVolume = 100000; }
  else if (avgScore >= 65) { tier = "high";    baseVolume = 30000;  }
  else if (avgScore >= 50) { tier = "medium";  baseVolume = 8000;   }
  else if (avgScore >= 35) { tier = "low";     baseVolume = 2000;   }
  else if (avgScore >= 20) { tier = "minimal"; baseVolume = 400;    }
  else                     { tier = "trace";   baseVolume = 50;     }

  const volume = Math.round(baseVolume * longtailPenalty);
  return { volume, tier };
}

/**
 * Volume tier label + color for UI
 */
function volumeLabel(tier) {
  const map = {
    massive: { label: "100k+/mo",  color: "#059669" },
    high:    { label: "10k-100k",  color: "#0891B2" },
    medium:  { label: "1k-10k",    color: "#443DCB" },
    low:     { label: "100-1k",    color: "#D97706" },
    minimal: { label: "<100/mo",   color: "#888"    },
    trace:   { label: "Very Low",  color: "#ccc"    },
  };
  return map[tier] || map.trace;
}

module.exports = { estimateVolume, estimateVolumesBatch, getAutocompleteRank, scoreToVolume, volumeLabel };
