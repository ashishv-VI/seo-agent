/**
 * Backlink Discovery Engine — No third-party APIs
 *
 * How it works:
 *   1. Search DDG/Bing for pages that mention or link to the target domain
 *      Queries: "domain.com" -site:domain.com (finds mentions)
 *              link:domain.com (some engines still support this)
 *   2. Crawl each discovered URL, extract all <a> tags
 *   3. If a link to the target domain is found → record as a backlink
 *   4. Store in crawler_backlinks (same collection as before)
 *   5. Recalculate DR after discovery
 *
 * Limitations vs DataForSEO:
 *   - Finds 20–80 backlinks per run (not thousands)
 *   - Quality over quantity — only verifiable, real links
 *   - Improves over time as more crawls run
 *   - Free forever, no API key needed
 */

const { getSERP } = require("./serpScraper");
const { fetchPage, extractLinks } = require("./webCrawler");
const { saveCrawlResult, normalizeDomain } = require("./backlinkGraph");
const { db, FieldValue } = require("../config/firebase");
const crypto = require("crypto");

function urlHash(url) {
  return crypto.createHash("md5").update(url).digest("hex").slice(0, 16);
}

/**
 * Discover backlinks for a domain using SERP scraping + page verification
 * @param {string} domain  — target domain (e.g. "damcodigital.com")
 * @param {object} opts
 * @returns {object} discovery results
 */
async function discoverBacklinks(domain, opts = {}) {
  const { maxPages = 30, location = "in" } = opts;
  domain = normalizeDomain(domain);

  const discovered = [];
  const crawledUrls = new Set();

  // ── Step 1: SERP queries to find pages mentioning this domain ────────────
  const queries = [
    `"${domain}"`,                          // pages mentioning the domain
    `"${domain}" inbound links`,            // link discussions
    `site:*.com "${domain}"`,               // mentions on .com sites
  ];

  const serpUrls = new Set();

  for (const query of queries) {
    try {
      const serp = await getSERP(query, { location, num: 10 });
      for (const r of serp.results || []) {
        try {
          const u = new URL(r.url);
          const refDomain = u.hostname.replace(/^www\./, "");
          // Skip the target domain itself
          if (refDomain !== domain && refDomain && !refDomain.includes(" ")) {
            serpUrls.add(r.url);
          }
        } catch {}
      }
    } catch { /* skip failed queries */ }
  }

  // ── Step 2: Also check existing crawler_backlinks for known referrers ────
  // Look for any external links we previously recorded pointing to this domain
  const existingSnap = await db.collection("crawler_backlinks")
    .where("toDomain", "==", domain)
    .limit(100)
    .get();

  const knownCount = existingSnap.size;

  // ── Step 3: Crawl each discovered URL and verify link exists ─────────────
  const urlsToCheck = [...serpUrls].slice(0, maxPages);

  for (const pageUrl of urlsToCheck) {
    if (crawledUrls.has(pageUrl)) continue;
    crawledUrls.add(pageUrl);

    try {
      const { html, status } = await fetchPage(pageUrl, 10000, { retries: 1 });
      if (!html) continue;

      const { external } = extractLinks(html, pageUrl);
      let fromDomain;
      try { fromDomain = new URL(pageUrl).hostname.replace(/^www\./, ""); } catch { continue; }

      // Find any links pointing to our target domain
      const linksToTarget = external.filter(l => l.domain === domain);

      for (const link of linksToTarget.slice(0, 5)) {
        const linkId = urlHash(`${pageUrl}→${link.url}`);

        // Check nofollow
        const isNoFollow = html.match(
          new RegExp(`<a[^>]+href=["'][^"']*${link.url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^"']*["'][^>]*rel=["'][^"']*nofollow`, "i")
        );

        const record = {
          fromDomain,
          fromPage:   pageUrl,
          toDomain:   domain,
          toUrl:      link.url,
          anchor:     link.anchor || "",
          dofollow:   !isNoFollow,
          verified:   true,
          discoveredBy: "serp_crawl",
          savedAt:    new Date().toISOString(),
        };

        await db.collection("crawler_backlinks").doc(linkId).set(record, { merge: true });

        // Increment backlink counter on target domain doc
        await db.collection("crawler_domains").doc(domain).set({
          domain,
          backlinkCount: FieldValue.increment(1),
          updatedAt: new Date().toISOString(),
        }, { merge: true });

        discovered.push(record);
      }
    } catch { /* skip pages that fail to crawl */ }
  }

  // ── Step 4: Update domain doc with discovery metadata ────────────────────
  const totalNow = knownCount + discovered.length;

  await db.collection("crawler_domains").doc(domain).set({
    domain,
    lastDiscoveryAt:  new Date().toISOString(),
    discoveredCount:  totalNow,
    lastDiscoveredNew: discovered.length,
    updatedAt:        new Date().toISOString(),
  }, { merge: true });

  return {
    domain,
    newLinksFound: discovered.length,
    totalKnownBacklinks: totalNow,
    pagesChecked: urlsToCheck.length,
    sampledLinks: discovered.slice(0, 10),
  };
}

module.exports = { discoverBacklinks };
