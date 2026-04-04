/**
 * Domain Rating (DR) Algorithm
 *
 * Inspired by Ahrefs DR — simplified PageRank-style calculation.
 *
 * Formula:
 *   DR(domain) = Σ ( DR(referrer) / outlinks(referrer) )
 *   Normalized to 0–100 logarithmic scale
 *   Iterates 3 times for convergence
 *
 * The more high-DR domains link to you, the higher your DR.
 * One strong link > 100 weak links (logarithmic).
 */

const { db } = require("../../config/firebase");
const { normalizeDomain } = require("../backlinkGraph");

// ── Calculate DR for a single domain using stored backlink data ───────────
async function calculateDR(domain) {
  domain = normalizeDomain(domain);

  // Get all domains that link to this domain
  const backlinkSnap = await db.collection("crawler_backlinks")
    .where("toDomain", "==", domain)
    .limit(500)
    .get();

  if (backlinkSnap.empty) return { domain, dr: 0, referringDomains: 0, reason: "no backlinks" };

  // Group by referring domain
  const referrers = {};
  for (const doc of backlinkSnap.docs) {
    const { fromDomain } = doc.data();
    referrers[fromDomain] = (referrers[fromDomain] || 0) + 1;
  }

  const referringDomains = Object.keys(referrers);

  // Get DR scores of referring domains (if available)
  const referrerDRs = {};
  for (const ref of referringDomains) {
    const refDoc = await db.collection("crawler_domains").doc(ref).get().catch(() => null);
    referrerDRs[ref] = refDoc?.data()?.drScore || estimateDRFromSignals(refDoc?.data());
  }

  // Get outlink count for each referrer (to weight links properly)
  const outlinksCount = {};
  for (const ref of referringDomains) {
    const outlinkSnap = await db.collection("crawler_backlinks")
      .where("fromDomain", "==", ref)
      .limit(1000)
      .get();
    outlinksCount[ref] = Math.max(outlinkSnap.size, 1);
  }

  // PageRank-style calculation
  let rawScore = 0;
  for (const ref of referringDomains) {
    const refDR      = referrerDRs[ref] || 1;
    const outlinks   = outlinksCount[ref] || 1;
    rawScore += refDR / outlinks;
  }

  // Logarithmic normalization to 0-100
  const dr = normalizeToScale(rawScore);

  // Save DR score back to Firestore
  await db.collection("crawler_domains").doc(domain).set({
    domain,
    drScore:         dr,
    referringDomains: referringDomains.length,
    totalBacklinks:   backlinkSnap.size,
    drCalculatedAt:  new Date().toISOString(),
  }, { merge: true });

  return {
    domain,
    dr,
    referringDomains: referringDomains.length,
    totalBacklinks:   backlinkSnap.size,
    drLabel:          getDRLabel(dr),
  };
}

// ── Estimate DR from available signals (when full calc not possible) ───────
function estimateDRFromSignals(domainData) {
  if (!domainData) return 10; // default for unknown domains

  const { backlinkCount = 0, pagesCrawled = 0 } = domainData;

  // Simple signal-based estimate
  let score = 0;
  if (backlinkCount > 0)   score += Math.min(40, Math.log10(backlinkCount + 1) * 15);
  if (pagesCrawled > 0)    score += Math.min(20, Math.log10(pagesCrawled + 1) * 8);

  return Math.round(Math.min(70, score));
}

// ── Normalize raw score to 0-100 logarithmic scale ────────────────────────
function normalizeToScale(rawScore) {
  if (rawScore <= 0) return 0;
  // Logarithmic normalization — matches Ahrefs-style distribution
  const normalized = Math.log10(rawScore + 1) * 25;
  return Math.min(100, Math.max(0, Math.round(normalized)));
}

// ── DR label ──────────────────────────────────────────────────────────────
function getDRLabel(dr) {
  if (dr >= 80) return "Very High";
  if (dr >= 60) return "High";
  if (dr >= 40) return "Medium";
  if (dr >= 20) return "Low";
  return "Very Low";
}

// ── Batch calculate DR for multiple domains ───────────────────────────────
async function batchCalculateDR(domains) {
  const results = [];
  for (const domain of domains) {
    try {
      const result = await calculateDR(domain);
      results.push(result);
    } catch (e) {
      results.push({ domain, dr: 0, error: e.message });
    }
    // Small delay to avoid Firestore rate limits
    await new Promise(r => setTimeout(r, 100));
  }
  return results;
}

// ── Quick DR estimate without full calculation (from stored data) ──────────
async function getDRScore(domain) {
  domain = normalizeDomain(domain);
  const doc = await db.collection("crawler_domains").doc(domain).get().catch(() => null);
  if (!doc?.exists) return { domain, dr: null, calculated: false };

  const data = doc.data();
  if (data.drScore !== undefined) {
    return {
      domain,
      dr:          data.drScore,
      referringDomains: data.referringDomains || 0,
      totalBacklinks:   data.totalBacklinks   || 0,
      drLabel:     getDRLabel(data.drScore),
      calculatedAt: data.drCalculatedAt || null,
      calculated:  true,
    };
  }

  // Estimate from signals
  const estimated = estimateDRFromSignals(data);
  return { domain, dr: estimated, calculated: false, estimated: true };
}

module.exports = { calculateDR, getDRScore, batchCalculateDR, getDRLabel, normalizeToScale };
