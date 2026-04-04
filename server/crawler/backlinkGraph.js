/**
 * Backlink Graph — Firestore Storage Layer
 *
 * Collections:
 *   crawler_backlinks/{domain}      — backlink profile per domain
 *   crawler_pages/{urlHash}         — crawled page data
 *   crawler_domains/{domain}        — domain metadata + DR score
 *   crawler_queue/{domain}          — crawl job queue
 */

const { db, FieldValue } = require("../config/firebase");
const crypto = require("crypto");

function urlHash(url) {
  return crypto.createHash("md5").update(url).digest("hex").slice(0, 16);
}

function normalizeDomain(input) {
  try {
    const url = input.startsWith("http") ? input : "https://" + input;
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch { return input.toLowerCase().replace(/^www\./, ""); }
}

// ── Save crawl results for a domain ──────────────────────────────────────
async function saveCrawlResult(crawlData) {
  const { domain, pages, externalLinksOut, crawledAt } = crawlData;

  // Save domain record
  await db.collection("crawler_domains").doc(domain).set({
    domain,
    lastCrawledAt:   crawledAt,
    pagesCrawled:    pages.length,
    externalLinks:   externalLinksOut.length,
    updatedAt:       new Date().toISOString(),
  }, { merge: true });

  // Save individual pages (batch)
  const BATCH_SIZE = 400;
  for (let i = 0; i < pages.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const page of pages.slice(i, i + BATCH_SIZE)) {
      const hash = urlHash(page.url);
      batch.set(db.collection("crawler_pages").doc(hash), {
        ...page,
        domain,
        savedAt: new Date().toISOString(),
      }, { merge: true });
    }
    await batch.commit().catch(() => {});
  }

  // Save outbound links = these are backlinks for target domains
  for (let i = 0; i < externalLinksOut.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const link of externalLinksOut.slice(i, i + BATCH_SIZE)) {
      const linkId = urlHash(`${link.fromPage}→${link.toUrl}`);
      batch.set(db.collection("crawler_backlinks").doc(linkId), {
        ...link,
        savedAt: new Date().toISOString(),
      }, { merge: true });

      // Increment backlink counter for target domain
      const targetRef = db.collection("crawler_domains").doc(link.toDomain);
      batch.set(targetRef, {
        domain:        link.toDomain,
        backlinkCount: FieldValue.increment(1),
        updatedAt:     new Date().toISOString(),
      }, { merge: true });
    }
    await batch.commit().catch(() => {});
  }

  return { saved: pages.length, linksRecorded: externalLinksOut.length };
}

// ── Get backlinks FOR a domain (who links to it) ─────────────────────────
async function getBacklinksForDomain(domain, limit = 100) {
  domain = normalizeDomain(domain);

  const snap = await db.collection("crawler_backlinks")
    .where("toDomain", "==", domain)
    .limit(limit)
    .get();

  const backlinks = snap.docs.map(d => d.data());

  // Group by referring domain
  const byDomain = {};
  for (const bl of backlinks) {
    if (!byDomain[bl.fromDomain]) {
      byDomain[bl.fromDomain] = { domain: bl.fromDomain, links: [], anchorTexts: [] };
    }
    byDomain[bl.fromDomain].links.push(bl.fromPage);
    if (bl.anchor) byDomain[bl.fromDomain].anchorTexts.push(bl.anchor);
  }

  const referringDomains = Object.values(byDomain);

  // Anchor text analysis
  const allAnchors = backlinks.map(b => b.anchor).filter(Boolean);
  const anchorMap  = {};
  for (const a of allAnchors) {
    const key = a.toLowerCase().slice(0, 50);
    anchorMap[key] = (anchorMap[key] || 0) + 1;
  }
  const topAnchors = Object.entries(anchorMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([text, count]) => ({ text, count }));

  // Lost & new backlinks (compare with 30 days ago)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const newSnap = await db.collection("crawler_backlinks")
    .where("toDomain", "==", domain)
    .where("savedAt", ">=", thirtyDaysAgo)
    .limit(50)
    .get();
  const newBacklinks = newSnap.docs.map(d => d.data());

  return {
    domain,
    totalBacklinks:      backlinks.length,
    referringDomains:    referringDomains.length,
    referringDomainsData: referringDomains.slice(0, 50),
    topAnchors,
    newBacklinks:        newBacklinks.slice(0, 20),
    backlinks:           backlinks.slice(0, 100),
  };
}

// ── Get outbound links FROM a domain ─────────────────────────────────────
async function getOutboundLinks(domain, limit = 100) {
  domain = normalizeDomain(domain);

  const snap = await db.collection("crawler_backlinks")
    .where("fromDomain", "==", domain)
    .limit(limit)
    .get();

  return snap.docs.map(d => d.data());
}

// ── Get domain info ───────────────────────────────────────────────────────
async function getDomainInfo(domain) {
  domain = normalizeDomain(domain);
  const doc = await db.collection("crawler_domains").doc(domain).get();
  return doc.exists ? doc.data() : null;
}

// ── Link Intersect — domains that link to competitors but not to us ───────
async function getLinkIntersect(ourDomain, competitorDomains) {
  ourDomain = normalizeDomain(ourDomain);
  const ourBacklinkSnap = await db.collection("crawler_backlinks")
    .where("toDomain", "==", ourDomain)
    .limit(500)
    .get();
  const ourReferrers = new Set(ourBacklinkSnap.docs.map(d => d.data().fromDomain));

  const opportunities = [];
  for (const comp of competitorDomains) {
    const compDomain = normalizeDomain(comp);
    const compSnap   = await db.collection("crawler_backlinks")
      .where("toDomain", "==", compDomain)
      .limit(200)
      .get();

    for (const doc of compSnap.docs) {
      const { fromDomain, fromPage, anchor } = doc.data();
      if (!ourReferrers.has(fromDomain) && fromDomain !== ourDomain) {
        opportunities.push({
          linkingDomain: fromDomain,
          linkingPage:   fromPage,
          anchor,
          linksToCompetitor: compDomain,
        });
      }
    }
  }

  // Deduplicate by linking domain
  const seen = new Set();
  return opportunities.filter(o => {
    if (seen.has(o.linkingDomain)) return false;
    seen.add(o.linkingDomain);
    return true;
  }).slice(0, 100);
}

// ── Batch analysis — multiple domains at once ────────────────────────────
async function batchDomainAnalysis(domains) {
  const results = [];
  for (const domain of domains.slice(0, 200)) {
    const norm  = normalizeDomain(domain);
    const info  = await getDomainInfo(norm).catch(() => null);
    results.push({
      domain:       norm,
      backlinkCount: info?.backlinkCount || 0,
      pagesCrawled:  info?.pagesCrawled  || 0,
      lastCrawled:   info?.lastCrawledAt || null,
      drScore:       info?.drScore       || null,
    });
  }
  return results;
}

// ── Queue a domain for crawling ───────────────────────────────────────────
async function queueDomainCrawl(domain, priority = "normal") {
  domain = normalizeDomain(domain);
  await db.collection("crawler_queue").doc(domain).set({
    domain,
    priority,
    status:    "queued",
    queuedAt:  new Date().toISOString(),
    attempts:  0,
  }, { merge: true });
}

// ── Get next domain from queue ────────────────────────────────────────────
async function getNextFromQueue() {
  const snap = await db.collection("crawler_queue")
    .where("status", "==", "queued")
    .orderBy("queuedAt", "asc")
    .limit(1)
    .get();

  if (snap.empty) return null;

  const doc  = snap.docs[0];
  const data = { id: doc.id, ...doc.data() };

  await doc.ref.update({ status: "processing", startedAt: new Date().toISOString() });
  return data;
}

module.exports = {
  saveCrawlResult,
  getBacklinksForDomain,
  getOutboundLinks,
  getDomainInfo,
  getLinkIntersect,
  batchDomainAnalysis,
  queueDomainCrawl,
  getNextFromQueue,
  normalizeDomain,
};
