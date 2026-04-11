/**
 * Crawler API Routes
 *
 * POST /api/crawler/domain-overview      — Full domain analysis (DR, backlinks, traffic)
 * POST /api/crawler/keyword-research     — Keyword research (volume, KD, SERP, PAA)
 * POST /api/crawler/backlinks            — Backlink profile for a domain
 * POST /api/crawler/link-intersect       — Domains linking to competitors but not us
 * POST /api/crawler/batch-analysis       — Bulk domain DR/backlink check
 * POST /api/crawler/shopping-ads         — PLA / Google Shopping research
 * POST /api/crawler/crawl-domain         — Start crawling a domain
 * GET  /api/crawler/crawl-status/:domain — Check last crawl result
 */

const express     = require("express");
const router      = express.Router();
const { verifyToken } = require("../middleware/auth");

const { crawlDomain }               = require("../crawler/webCrawler");
const { getSERP, scrapeGoogleShopping, scrapeAutocomplete } = require("../crawler/serpScraper");
const {
  saveCrawlResult, getBacklinksForDomain, getDomainInfo,
  getLinkIntersect, batchDomainAnalysis, queueDomainCrawl, normalizeDomain,
} = require("../crawler/backlinkGraph");
const { calculateDR, getDRScore, batchCalculateDR } = require("../crawler/algorithms/drScore");
const { calculateKD, estimateKDFromCompetition }    = require("../crawler/algorithms/kdScore");
const { estimateVolume, batchEstimateVolume }        = require("../crawler/algorithms/volumeEstimator");
const { estimateDomainTraffic, calculateShareOfVoice } = require("../crawler/algorithms/trafficEstimator");
const { discoverBacklinks }         = require("../crawler/backlinkDiscovery");

// ── Auth middleware ───────────────────────────────────────────────────────
router.use(verifyToken);

// ── Domain Overview ───────────────────────────────────────────────────────
// Discovers real backlinks via SERP scraping + page crawl (no API key needed)
router.post("/domain-overview", async (req, res) => {
  const { domain, forceRefresh = false } = req.body;
  if (!domain) return res.status(400).json({ error: "domain required" });

  try {
    const norm = normalizeDomain(domain);

    // Check if we have recent discovery data (last 3 days)
    const info = await getDomainInfo(norm).catch(() => null);
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const hasRecentDiscovery = info?.lastDiscoveryAt && info.lastDiscoveryAt > threeDaysAgo;

    // Run backlink discovery if no recent data or force refresh requested
    // This uses SERP scraping + page crawl — no API key needed
    if (!hasRecentDiscovery || forceRefresh) {
      await discoverBacklinks(norm, { maxPages: 25 }).catch(e => {
        console.warn(`[domain-overview] Discovery partial error for ${norm}:`, e.message);
      });
    }

    // Now read the stored data (populated by discovery above or previous runs)
    const [domainInfo, backlinkData, drResult] = await Promise.allSettled([
      getDomainInfo(norm),
      getBacklinksForDomain(norm, 50),
      calculateDR(norm),
    ]);

    const infoFresh  = domainInfo.status === "fulfilled" ? domainInfo.value : null;
    const backlinks  = backlinkData.status === "fulfilled" ? backlinkData.value : null;
    const dr         = drResult.status === "fulfilled" ? drResult.value : { dr: 0, drLabel: "Unknown" };

    // Build referring domain list with DR scores where available
    const referringDomainsData = (backlinks?.referringDomainsData || []).map(rd => ({
      domain:    rd.domain,
      linkCount: rd.links?.length || 0,
      anchors:   (rd.anchorTexts || []).slice(0, 3),
      dr:        null, // populated on next pass
      firstSeen: rd.links?.[0] ? null : null,
    }));

    const drLabel = dr.dr >= 70 ? "Strong"
                  : dr.dr >= 50 ? "Good"
                  : dr.dr >= 30 ? "Moderate"
                  : dr.dr >  0  ? "Weak"
                  : "New / Unknown";

    res.json({
      domain:            norm,
      drScore:           dr.dr || 0,
      drLabel:           dr.drLabel || drLabel,
      referringDomains:  backlinks?.referringDomains || 0,
      totalBacklinks:    backlinks?.totalBacklinks || 0,
      topAnchors:        (backlinks?.topAnchors || []).map(a => ({
        text:  a.text,
        count: a.count,
      })),
      pagesCrawled:      infoFresh?.pagesCrawled || 0,
      lastCrawled:       infoFresh?.lastDiscoveryAt || null,
      isFresh:           hasRecentDiscovery,
      newLinksFoundNow:  !hasRecentDiscovery || forceRefresh,
      referringDomainsData,
      dataSource:        "own-crawler",
      note:              backlinks?.totalBacklinks > 0
        ? `${backlinks.totalBacklinks} backlink(s) verified by crawling referring pages`
        : "Discovery complete — no external backlinks verified yet. This improves over time as more referring sites get crawled.",
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Keyword Research ──────────────────────────────────────────────────────
router.post("/keyword-research", async (req, res) => {
  const { keyword, location = "in", includeRelated = true } = req.body;
  if (!keyword) return res.status(400).json({ error: "keyword required" });

  try {
    // Get SERP data
    const serpData = await getSERP(keyword, { location });

    // Calculate KD from SERP
    const kdData = await calculateKD(serpData.results, keyword);

    // Estimate volume
    const volumeData = await estimateVolume(keyword, serpData);

    // Get autocomplete suggestions
    const autoData = await scrapeAutocomplete(keyword);

    // Related keywords with their volumes (batch, limited)
    let relatedKeywords = [];
    if (includeRelated) {
      const relatedKws = [
        ...serpData.paaQuestions.slice(0, 5),
        ...serpData.relatedSearches.slice(0, 5),
        ...autoData.suggestions.slice(0, 5),
      ].filter(Boolean);

      // Quick KD estimate for related keywords (no full SERP for speed)
      relatedKeywords = relatedKws.slice(0, 10).map(kw => ({
        keyword:      kw,
        kdEstimate:   estimateKDFromCompetition(0, 0, 5),
        volumeBucket: estimateVolumeFromLength(kw),
      }));
    }

    res.json({
      keyword,
      // SERP data
      serp: {
        results:        serpData.results,
        features:       serpData.features,
        paaQuestions:   serpData.paaQuestions,
        relatedSearches: serpData.relatedSearches,
        source:         serpData.source,
      },
      // Difficulty
      keywordDifficulty: {
        score:      kdData.kd,
        label:      kdData.label,
        color:      kdData.color,
        topDomains: kdData.topDomains,
      },
      // Volume
      searchVolume: {
        bucket:     volumeData.volumeBucket,
        min:        volumeData.volumeMin,
        max:        volumeData.volumeMax,
        midpoint:   volumeData.volumeMidpoint,
        score:      volumeData.volumeScore,
        confidence: volumeData.confidence,
      },
      // Related
      relatedKeywords,
      suggestions: autoData.suggestions.slice(0, 20),
      scrapedAt:   new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Backlink Profile ──────────────────────────────────────────────────────
router.post("/backlinks", async (req, res) => {
  const { domain, limit = 100 } = req.body;
  if (!domain) return res.status(400).json({ error: "domain required" });

  try {
    const norm   = normalizeDomain(domain);
    const [data, drData] = await Promise.all([
      getBacklinksForDomain(norm, limit),
      getDRScore(norm),
    ]);

    res.json({
      domain:           norm,
      drScore:          drData.dr,
      drLabel:          drData.drLabel,
      totalBacklinks:   data.totalBacklinks,
      referringDomains: data.referringDomains,
      topAnchors:       data.topAnchors,
      newBacklinks:     data.newBacklinks,
      backlinks:        data.backlinks,
      referringDomainsData: data.referringDomainsData,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Link Intersect ────────────────────────────────────────────────────────
router.post("/link-intersect", async (req, res) => {
  const { ourDomain, competitors } = req.body;
  if (!ourDomain || !competitors?.length) {
    return res.status(400).json({ error: "ourDomain and competitors array required" });
  }

  try {
    const opportunities = await getLinkIntersect(ourDomain, competitors.slice(0, 5));
    res.json({
      ourDomain:          normalizeDomain(ourDomain),
      competitors:        competitors.map(normalizeDomain),
      opportunities,
      opportunityCount:   opportunities.length,
      message:            `${opportunities.length} domains link to your competitors but not to you — outreach opportunities`,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Batch Domain Analysis ─────────────────────────────────────────────────
router.post("/batch-analysis", async (req, res) => {
  const { domains } = req.body;
  if (!domains?.length) return res.status(400).json({ error: "domains array required" });
  if (domains.length > 200) return res.status(400).json({ error: "Max 200 domains at once" });

  try {
    const results = await batchDomainAnalysis(domains);
    res.json({ results, count: results.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Google Shopping / PLA Research ───────────────────────────────────────
router.post("/shopping-ads", async (req, res) => {
  const { keyword, location = "in" } = req.body;
  if (!keyword) return res.status(400).json({ error: "keyword required" });

  try {
    const data = await scrapeGoogleShopping(keyword, { location });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Start Domain Crawl ────────────────────────────────────────────────────
router.post("/crawl-domain", async (req, res) => {
  const { domain, maxPages = 30, background = true } = req.body;
  if (!domain) return res.status(400).json({ error: "domain required" });

  const norm    = normalizeDomain(domain);
  const siteUrl = `https://${norm}`;

  if (background) {
    // Fire-and-forget background crawl
    res.json({ message: `Crawl started for ${norm} — check status in a few minutes`, domain: norm });

    crawlDomain(siteUrl, { maxPages: Math.min(maxPages, 100), delayMs: 1000 })
      .then(result => saveCrawlResult(result))
      .then(() => calculateDR(norm))
      .catch(e => console.error(`[crawlerRoutes] Background crawl failed for ${norm}:`, e.message));
  } else {
    // Synchronous crawl (for small sites, max 20 pages)
    try {
      const result = await crawlDomain(siteUrl, { maxPages: Math.min(maxPages, 20), delayMs: 800 });
      await saveCrawlResult(result);
      const drData = await calculateDR(norm).catch(() => ({ dr: null }));

      res.json({
        domain:       norm,
        pagesFound:   result.pagesFound,
        linksFound:   result.externalLinksOut.length,
        drScore:      drData.dr,
        crawledAt:    result.crawledAt,
        pages:        result.pages.slice(0, 20),
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
});

// ── Crawl Status ──────────────────────────────────────────────────────────
router.get("/crawl-status/:domain", async (req, res) => {
  const norm = normalizeDomain(req.params.domain);

  try {
    const [info, drData] = await Promise.all([
      getDomainInfo(norm),
      getDRScore(norm),
    ]);

    if (!info) return res.json({ domain: norm, status: "not_crawled" });

    res.json({
      domain:          norm,
      status:          "crawled",
      lastCrawledAt:   info.lastCrawledAt,
      pagesCrawled:    info.pagesCrawled,
      drScore:         drData.dr,
      drLabel:         drData.drLabel,
      referringDomains: info.referringDomains || 0,
      backlinkCount:   info.backlinkCount    || 0,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Helper: quick volume estimate from keyword length ─────────────────────
function estimateVolumeFromLength(keyword) {
  const words = keyword.trim().split(/\s+/).length;
  if (words <= 2) return "1K-10K";
  if (words <= 3) return "100-1K";
  return "10-100";
}

module.exports = router;
