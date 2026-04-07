/**
 * auditPatterns.js — Site-wide pattern detection across all crawled pages
 *
 * Reads from: audits/{clientId}/pages subcollection (written by A2_audit.js)
 * Returns: array of { pattern, count, severity, affectedUrls[], fix }
 *
 * This turns A2 from a list of per-page issues into site-level intelligence:
 *   "47 of 120 service pages are missing H1" — pattern
 * vs
 *   "/services/accounting is missing H1" — per-page issue
 */

const { db } = require("../config/firebase");

/**
 * Detect site-wide patterns from per-page audit subcollection
 * @param {string} clientId
 * @returns {Promise<{patterns: Array, totalPages: number, analyzedAt: string}>}
 */
async function detectSitePatterns(clientId) {
  const snap = await db.collection("audits").doc(clientId).collection("pages").get();

  if (snap.empty) {
    return { patterns: [], totalPages: 0, analyzedAt: new Date().toISOString(), message: "No page data — run the full audit first" };
  }

  const pages = snap.docs.map(d => d.data());
  const total = pages.length;

  // ── Aggregate per-issue counts ─────────────────────────────────
  const missingH1       = pages.filter(p => !p.hasH1);
  const missingMeta     = pages.filter(p => !p.hasMeta && !p.metaDescription);
  const missingTitle    = pages.filter(p => !p.title || p.title === "(missing)");
  const missingCanon    = pages.filter(p => !p.hasCanonical);
  const thinContent     = pages.filter(p => (p.wordCount || 0) > 0 && p.wordCount < 300);
  const missingAlt      = pages.filter(p => (p.altMissing || 0) > 0);
  const dupTitles       = findDuplicates(pages, "title");
  const dupMeta         = findDuplicates(pages, "metaDescription");
  const slowPages       = pages.filter(p => (p.responseTime || 0) > 2000); // >2s
  const errorPages      = pages.filter(p => (p.statusCode || 200) >= 400);
  const noSchema        = pages.filter(p => !p.hasSchema);

  // ── Categorize pages by type (heuristic from URL) ─────────────
  const servicePages  = pages.filter(p => /\/service|\/product|\/solution/i.test(p.url || ""));
  const blogPages     = pages.filter(p => /\/blog|\/post|\/article/i.test(p.url || ""));
  const locationPages = pages.filter(p => /\/location|\/area|\/city|\/region/i.test(p.url || ""));

  const patterns = [];

  // Helper to add a pattern only if it affects ≥2 pages
  function addPattern(label, affectedPages, severity, fix, icon = "⚠️") {
    if (affectedPages.length < 2) return;
    patterns.push({
      pattern:      label,
      count:        affectedPages.length,
      totalPages:   total,
      pct:          Math.round((affectedPages.length / total) * 100),
      severity,
      fix,
      icon,
      affectedUrls: affectedPages.slice(0, 10).map(p => p.url).filter(Boolean),
    });
  }

  addPattern(
    `${missingH1.length} pages missing H1 tag`,
    missingH1, "critical",
    "Add a descriptive H1 tag to each page matching the target keyword. H1 is the strongest on-page ranking signal.",
    "🔴"
  );

  addPattern(
    `${missingMeta.length} pages missing meta description`,
    missingMeta, "high",
    "Write a unique 140–160 character meta description for each page. Directly impacts CTR in search results.",
    "🟠"
  );

  addPattern(
    `${missingTitle.length} pages missing title tag`,
    missingTitle, "critical",
    "Every page needs a unique title tag (50–60 chars) with the primary keyword near the start.",
    "🔴"
  );

  addPattern(
    `${missingCanon.length} pages missing canonical tag`,
    missingCanon, "medium",
    "Add <link rel='canonical'> to prevent duplicate content dilution, especially for paginated or filtered URLs.",
    "🟡"
  );

  addPattern(
    `${thinContent.length} pages with thin content (<300 words)`,
    thinContent, "high",
    "Expand thin pages to at least 600 words covering the topic comprehensively. Thin content ranks poorly.",
    "🟠"
  );

  addPattern(
    `${missingAlt.length} pages with images missing alt text`,
    missingAlt, "medium",
    "Add descriptive alt text to all images. Important for accessibility and image search rankings.",
    "🟡"
  );

  if (dupTitles.length >= 2) {
    patterns.push({
      pattern:      `${dupTitles.length} duplicate title tags detected`,
      count:        dupTitles.length,
      totalPages:   total,
      pct:          Math.round((dupTitles.length / total) * 100),
      severity:     "critical",
      fix:          "Every page must have a unique title tag. Duplicate titles split ranking authority.",
      icon:         "🔴",
      affectedUrls: dupTitles.slice(0, 10).map(p => p.url).filter(Boolean),
    });
  }

  if (dupMeta.length >= 2) {
    patterns.push({
      pattern:      `${dupMeta.length} duplicate meta descriptions`,
      count:        dupMeta.length,
      totalPages:   total,
      pct:          Math.round((dupMeta.length / total) * 100),
      severity:     "medium",
      fix:          "Write unique meta descriptions per page. Duplicate meta descriptions reduce CTR differentiation.",
      icon:         "🟡",
      affectedUrls: dupMeta.slice(0, 10).map(p => p.url).filter(Boolean),
    });
  }

  addPattern(
    `${slowPages.length} pages load slower than 2 seconds`,
    slowPages, "high",
    "Investigate and fix slow pages — compress images, enable caching, reduce redirects.",
    "🟠"
  );

  addPattern(
    `${errorPages.length} pages returning error status codes`,
    errorPages, "critical",
    "Fix or redirect pages returning 4xx/5xx errors. These bleed link equity and harm crawl budget.",
    "🔴"
  );

  addPattern(
    `${noSchema.length} pages with no structured data`,
    noSchema, "medium",
    "Add JSON-LD schema (Organization, Product, FAQPage, LocalBusiness) to improve rich result eligibility.",
    "🟡"
  );

  // ── Category-level patterns ─────────────────────────
  if (servicePages.length > 3) {
    const spMissingH1 = servicePages.filter(p => !p.hasH1);
    if (spMissingH1.length > 1) {
      addPattern(
        `${spMissingH1.length} of ${servicePages.length} service pages missing H1`,
        spMissingH1, "critical",
        "Service pages are your highest-intent landing pages. All should have clear H1 tags with service + location keywords.",
        "🔴"
      );
    }
  }

  if (blogPages.length > 3) {
    const blogThin = blogPages.filter(p => (p.wordCount || 0) < 600);
    if (blogThin.length > 1) {
      addPattern(
        `${blogThin.length} of ${blogPages.length} blog posts under 600 words`,
        blogThin, "high",
        "Blog posts under 600 words rarely rank. Expand with supporting detail, FAQs, and internal links.",
        "🟠"
      );
    }
  }

  // Sort by severity then count
  const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
  patterns.sort((a, b) => (SEVERITY_ORDER[a.severity] || 3) - (SEVERITY_ORDER[b.severity] || 3) || b.count - a.count);

  return {
    patterns,
    totalPages:  total,
    patternCount: patterns.length,
    criticalCount: patterns.filter(p => p.severity === "critical").length,
    analyzedAt:  new Date().toISOString(),
  };
}

// ── Find pages with duplicate values for a field ──────────────────────────────
function findDuplicates(pages, field) {
  const seen = {};
  const dups = [];
  for (const p of pages) {
    const val = p[field];
    if (!val || val === "(missing)") continue;
    if (seen[val]) dups.push(p);
    seen[val] = true;
  }
  return dups;
}

module.exports = { detectSitePatterns };
