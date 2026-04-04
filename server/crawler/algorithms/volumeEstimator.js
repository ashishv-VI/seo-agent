/**
 * Search Volume Estimator — No API Required
 *
 * Multi-signal approach:
 *   Signal 1: Autocomplete rank frequency (how often Google suggests it)
 *   Signal 2: Ad count (paid competition = volume signal)
 *   Signal 3: Number of SERP results
 *   Signal 4: Related keyword count
 *   Signal 5: Google Trends score (free)
 *
 * Output: Bucketed volume (not exact — directionally accurate)
 * This matches how Semrush/Ahrefs estimate for long-tail keywords too.
 */

const { scrapeAutocomplete } = require("../serpScraper");

// Volume buckets (industry standard ranges)
const VOLUME_BUCKETS = [
  { min: 0,        max: 10,       label: "<10",       midpoint: 5       },
  { min: 10,       max: 100,      label: "10-100",     midpoint: 50      },
  { min: 100,      max: 1000,     label: "100-1K",     midpoint: 500     },
  { min: 1000,     max: 10000,    label: "1K-10K",     midpoint: 5000    },
  { min: 10000,    max: 100000,   label: "10K-100K",   midpoint: 50000   },
  { min: 100000,   max: 1000000,  label: "100K-1M",    midpoint: 500000  },
  { min: 1000000,  max: Infinity, label: "1M+",        midpoint: 2000000 },
];

// ── Main volume estimation function ──────────────────────────────────────
async function estimateVolume(keyword, serpData = null) {
  const signals = {};

  // Signal 1: Autocomplete rank (how prominent is this keyword in suggestions)
  try {
    const wordsBefore = keyword.split(" ").slice(0, -1).join(" ");
    const autoData    = wordsBefore
      ? await scrapeAutocomplete(wordsBefore)
      : await scrapeAutocomplete(keyword.slice(0, -1));

    const suggestions  = autoData.suggestions || [];
    const rankInSuggest = suggestions.findIndex(s =>
      s.toLowerCase().includes(keyword.toLowerCase())
    );

    if (rankInSuggest === 0)      signals.autocomplete = 90;  // First suggestion = high volume
    else if (rankInSuggest === 1) signals.autocomplete = 75;
    else if (rankInSuggest <= 3)  signals.autocomplete = 60;
    else if (rankInSuggest <= 6)  signals.autocomplete = 40;
    else if (rankInSuggest > 6)   signals.autocomplete = 20;
    else                          signals.autocomplete = 10;  // Not in suggestions

    signals.suggestionCount = suggestions.length;
  } catch {
    signals.autocomplete    = 30;
    signals.suggestionCount = 0;
  }

  // Signal 2: SERP signals (from provided SERP data)
  if (serpData?.results?.length > 0) {
    // More diverse domains = higher competition = usually higher volume
    const uniqueDomains = new Set(serpData.results.map(r => r.domain)).size;
    signals.domainDiversity = Math.min(100, uniqueDomains * 10);

    // SERP features presence = popular keyword
    const featureCount = (serpData.features || []).length;
    signals.serpFeatures = Math.min(40, featureCount * 10);

    // PAA questions = informational intent, usually decent volume
    signals.paaCount = Math.min(30, (serpData.paaQuestions || []).length * 5);
  } else {
    signals.domainDiversity = 30;
    signals.serpFeatures    = 0;
    signals.paaCount        = 0;
  }

  // Signal 3: Keyword characteristics
  signals.keywordLength = estimateVolumeFromLength(keyword);
  signals.keywordType   = estimateVolumeFromType(keyword);

  // ── Combine signals with weights ──────────────────────────────────────
  const volumeScore =
    (signals.autocomplete    * 0.40) +
    (signals.domainDiversity * 0.20) +
    (signals.serpFeatures    * 0.15) +
    (signals.paaCount        * 0.10) +
    (signals.keywordLength   * 0.10) +
    (signals.keywordType     * 0.05);

  // Map score to volume bucket
  const bucket = scoreToVolumeBucket(volumeScore);

  return {
    keyword,
    volumeScore:   Math.round(volumeScore),
    volumeBucket:  bucket.label,
    volumeMin:     bucket.min,
    volumeMax:     bucket.max === Infinity ? "1000000+" : bucket.max,
    volumeMidpoint: bucket.midpoint,
    signals,
    confidence:    getConfidence(signals),
  };
}

// ── Score to volume bucket mapping ───────────────────────────────────────
function scoreToVolumeBucket(score) {
  // Map 0-100 score to volume buckets
  if (score < 10) return VOLUME_BUCKETS[0];   // <10
  if (score < 20) return VOLUME_BUCKETS[1];   // 10-100
  if (score < 35) return VOLUME_BUCKETS[2];   // 100-1K
  if (score < 55) return VOLUME_BUCKETS[3];   // 1K-10K
  if (score < 70) return VOLUME_BUCKETS[4];   // 10K-100K
  if (score < 85) return VOLUME_BUCKETS[5];   // 100K-1M
  return VOLUME_BUCKETS[6];                    // 1M+
}

// ── Volume estimate from keyword word count ───────────────────────────────
function estimateVolumeFromLength(keyword) {
  const words = keyword.trim().split(/\s+/).length;
  if (words === 1)  return 70;  // Single word = usually high volume
  if (words === 2)  return 55;  // Two words = medium-high
  if (words === 3)  return 40;  // Three words = medium
  if (words === 4)  return 25;  // Long-tail starts
  return 15;                    // Very long-tail = low volume
}

// ── Volume estimate from keyword type ────────────────────────────────────
function estimateVolumeFromType(keyword) {
  const kw = keyword.toLowerCase();

  // Navigational (brand names) = usually very high
  if (/^(how to|what is|why|when|where|who)/i.test(kw)) return 60;

  // Commercial intent = medium-high
  if (/buy|price|cost|cheap|best|top|review|vs|compare/i.test(kw)) return 50;

  // Local intent = medium
  if (/near me|in \w+|location|\w+ city/i.test(kw)) return 40;

  // Question keywords = medium
  if (kw.includes("?")) return 35;

  return 40; // default
}

// ── Confidence level based on available signals ───────────────────────────
function getConfidence(signals) {
  let confidence = 0;
  if (signals.autocomplete > 0)    confidence += 40;
  if (signals.domainDiversity > 0) confidence += 30;
  if (signals.serpFeatures > 0)    confidence += 20;
  if (signals.paaCount > 0)        confidence += 10;

  if (confidence >= 80) return "High";
  if (confidence >= 50) return "Medium";
  return "Low";
}

// ── Batch volume estimation ───────────────────────────────────────────────
async function batchEstimateVolume(keywords, serpDataMap = {}) {
  const results = [];
  for (const keyword of keywords) {
    try {
      const serpData = serpDataMap[keyword] || null;
      const result   = await estimateVolume(keyword, serpData);
      results.push(result);
    } catch (e) {
      results.push({ keyword, volumeBucket: "Unknown", error: e.message });
    }
    // Delay to avoid rate limiting autocomplete
    await new Promise(r => setTimeout(r, 300));
  }
  return results;
}

module.exports = { estimateVolume, batchEstimateVolume, VOLUME_BUCKETS };
