const { saveState, getState } = require("../shared-state/stateManager");
const { emitTasks, clearTasks } = require("../utils/taskQueue");
const { emitToolSuggestion }    = require("../utils/toolBridge");
const { renderPage, isJSRendered } = require("../utils/jsRenderer");

/**
 * A2 — Technical & On-Page Audit Agent
 * Runs after A1 brief is signed off
 * Checks: SSL, robots.txt, sitemap, meta tags, redirects, response time
 */
async function runA2(clientId) {
  // Get brief from A1
  const brief = await getState(clientId, "A1_brief");
  if (!brief) {
    return { success: false, error: "A1 brief not found — run onboarding first" };
  }
  if (!brief.signedOff) {
    return { success: false, error: "A1 brief not signed off — human approval required before audit" };
  }

  const siteUrl = brief.websiteUrl;
  const issues  = { p1: [], p2: [], p3: [] };
  const checks  = {};

  // ── 0. Redirect Chain Detection ───────────────────
  // Checks before main fetch — follows redirects manually to detect chains
  try {
    let current = siteUrl;
    const chain = [];
    for (let hop = 0; hop < 6; hop++) {
      const r = await fetch(current, { redirect:"manual", signal: AbortSignal.timeout(5000), headers:{ "User-Agent":"SEO-Agent-Audit/1.0" } });
      if (r.status >= 300 && r.status < 400) {
        const loc = r.headers.get("location");
        if (!loc) break;
        const next = new URL(loc, current).href;
        chain.push({ from: current, to: next, status: r.status });
        current = next;
      } else { break; }
    }
    checks.redirectChain = { depth: chain.length, chain };
    if (chain.length >= 3) {
      issues.p2.push({
        type:   "redirect_chain",
        detail: `${chain.length}-hop redirect chain: ${chain.map(c=>c.status).join("→")} (${chain[0].from} → … → ${chain[chain.length-1].to})`,
        fix:    "Shorten to a single 301 redirect — each hop loses ~15% of PageRank",
      });
    }
  } catch { checks.redirectChain = { depth: 0, chain: [] }; }

  // ── 1. Accessibility & Response Time ──────────────
  const startTime = Date.now();
  try {
    const res = await fetch(siteUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "SEO-Agent-Audit/1.0" },
    });
    checks.httpStatus   = res.status;
    checks.finalUrl     = res.url;
    checks.responseTime = Date.now() - startTime;
    checks.isAccessible = res.ok;

    // Redirect check
    if (res.url !== siteUrl && res.url !== siteUrl + "/") {
      issues.p2.push({
        type:   "redirect",
        detail: `Site redirects from ${siteUrl} → ${res.url}`,
        fix:    "Ensure canonical URL is consistent across all references",
      });
    }

    // Response time
    if (checks.responseTime > 2000) {
      issues.p1.push({
        type:   "slow_ttfb",
        detail: `Server response time: ${checks.responseTime}ms (target: <600ms)`,
        fix:    "Check server hosting, enable caching, consider CDN",
      });
    } else if (checks.responseTime > 800) {
      issues.p2.push({
        type:   "ttfb_warning",
        detail: `Server response time: ${checks.responseTime}ms (target: <600ms)`,
        fix:    "Optimize server response, enable caching",
      });
    }

    // Parse HTML for on-page checks
    // If page appears JS-rendered (blank body), try Puppeteer for real content
    let rawHtml = await res.text();
    checks.isJSRendered = isJSRendered(rawHtml);
    if (checks.isJSRendered) {
      console.log(`[A2] JS-rendered page detected at ${siteUrl} → trying Puppeteer`);
      const { html: renderedHtml, rendered } = await renderPage(siteUrl, 20000);
      if (renderedHtml && renderedHtml.length > rawHtml.length) {
        rawHtml = renderedHtml;
        checks.jsRenderingUsed = rendered; // true = Puppeteer, false = fetch fallback
      }
    }
    const html = rawHtml;
    checks._homepageHtml = html; // used by multi-page crawler below
    const onPage = parseOnPage(html, res.url, clientId);
    Object.assign(checks, onPage.checks);
    onPage.issues.p1.forEach(i => issues.p1.push(i));
    onPage.issues.p2.forEach(i => issues.p2.push(i));
    onPage.issues.p3.forEach(i => issues.p3.push(i));

  } catch (err) {
    checks.isAccessible = false;
    issues.p1.push({
      type:   "site_unreachable",
      detail: `Site could not be reached: ${err.message}`,
      fix:    "Check if site is live and accessible",
    });
  }

  // ── 2. SSL Check ───────────────────────────────────
  checks.hasSSL = siteUrl.startsWith("https://");
  if (!checks.hasSSL) {
    issues.p1.push({
      type:   "no_ssl",
      detail: "Site is not using HTTPS",
      fix:    "Install SSL certificate and redirect all HTTP → HTTPS",
    });
  }

  // ── 3. Robots.txt ──────────────────────────────────
  try {
    const robotsUrl = new URL("/robots.txt", siteUrl).href;
    const robotsRes = await fetch(robotsUrl, { signal: AbortSignal.timeout(5000) });
    checks.robotsTxt = {
      exists:  robotsRes.ok,
      status:  robotsRes.status,
    };
    if (robotsRes.ok) {
      const robotsText = await robotsRes.text();
      checks.robotsTxt.content = robotsText.slice(0, 800);
      // Extract sitemap URL from robots.txt
      const sitemapInRobots = robotsText.match(/^Sitemap:\s*(.+)$/im);
      checks.robotsTxt.sitemapInRobots = sitemapInRobots ? sitemapInRobots[1].trim() : null;
      // Check for broad blocking
      const disallowLines = robotsText.match(/^Disallow:\s*.+$/gim) || [];
      const blocksRoot = disallowLines.some(l => l.match(/Disallow:\s*\/\s*$/));
      if (blocksRoot) {
        issues.p1.push({
          type:   "robots_blocking_all",
          detail: "robots.txt has 'Disallow: /' — entire site may be blocked from Google",
          fix:    "Remove 'Disallow: /' or restrict only specific paths like /wp-admin/",
        });
      } else if (robotsText.includes("Disallow: /") && !robotsText.includes("Disallow: /wp-admin")) {
        issues.p2.push({
          type:   "robots_blocking",
          detail: "robots.txt may be blocking important pages from crawling",
          fix:    "Review robots.txt — ensure key pages are crawlable",
        });
      }
    } else {
      issues.p3.push({
        type:   "no_robots_txt",
        detail: "No robots.txt file found",
        fix:    "Create a robots.txt file to guide search engine crawlers",
      });
    }
  } catch {
    checks.robotsTxt = { exists: false, error: "Could not fetch" };
  }

  // ── 4. XML Sitemap ─────────────────────────────────
  try {
    const sitemapUrl = new URL("/sitemap.xml", siteUrl).href;
    const sitemapRes = await fetch(sitemapUrl, { signal: AbortSignal.timeout(5000) });
    checks.sitemap = {
      exists: sitemapRes.ok,
      url:    sitemapUrl,
      status: sitemapRes.status,
    };
    if (!sitemapRes.ok) {
      issues.p2.push({
        type:   "no_sitemap",
        detail: "No XML sitemap found at /sitemap.xml",
        fix:    "Create and submit an XML sitemap to Google Search Console",
      });
    }
  } catch {
    checks.sitemap = { exists: false, error: "Could not fetch" };
  }

  // ── 5. Multi-Page Crawler ──────────────────────────
  const pageAudits    = [];
  const brokenLinks   = [];
  const internalLinks = checks.internalLinks || [];
  let   discoveredUrls = [];

  // Skip non-HTML resources and WordPress system paths
  const SKIP_EXTENSIONS = /\.(css|js|ico|png|jpg|jpeg|gif|svg|webp|woff|woff2|ttf|eot|pdf|zip|xml|json|txt|mp4|mp3|wav|avi|mov|map|gz|tar|rar|exe|dmg)(\?.*)?$/i;
  const SKIP_PATTERNS = [
    /\/wp-content\/themes\//i,
    /\/wp-content\/plugins\//i,
    /\/wp-content\/uploads\//i,
    /\/wp-json\//i,
    /\/feed\/?(\?.*)?$/i,
    /\/oembed/i,
    /\/xmlrpc\.php/i,
    /\/wp-admin\//i,
    /\/wp-login\.php/i,
    /\/wp-cron\.php/i,
    /\?replytocom=/i,
    /\/tag\//i,
    /\/author\//i,
    /\/page\/\d+/i,
    /\/(cdn-cgi|__webpack|_next\/static)\//i,
  ];

  if (checks.isAccessible) {
    try {
      const domain = new URL(siteUrl).hostname;

      // ── Sprint 1: Sitemap-first URL discovery ────────────────────────────
      // Try sitemap.xml (and sitemap index) to discover all URLs before
      // falling back to homepage link extraction. This allows 500+ page sites.
      const sitemapUrls = await discoverFromSitemap(siteUrl, domain, SKIP_EXTENSIONS, SKIP_PATTERNS);
      checks.sitemapPagesFound = sitemapUrls.length;

      // Fallback: extract links from homepage HTML if sitemap gave nothing
      const homepageHtml = checks._homepageHtml || "";
      const foundLinks   = new Set(sitemapUrls);
      if (foundLinks.size === 0) {
        const linkMatches = homepageHtml.matchAll(/href=["']([^"'#?][^"']*)["']/gi);
        for (const m of linkMatches) {
          try {
            const abs = new URL(m[1], siteUrl).href;
            if (
              new URL(abs).hostname === domain &&
              abs !== siteUrl &&
              !SKIP_EXTENSIONS.test(abs) &&
              !SKIP_PATTERNS.some(p => p.test(abs))
            ) {
              foundLinks.add(abs);
            }
          } catch { /* skip malformed */ }
        }
      }

      // If still thin (< 15 pages), augment with depth-2 link crawl
      let allPagesToCrawl = [...foundLinks].filter(u => u !== siteUrl);
      if (allPagesToCrawl.length < 15) {
        const depth2Links = new Set(foundLinks);
        const depth1Sample = allPagesToCrawl.slice(0, 10);
        await Promise.allSettled(
          depth1Sample.map(async innerUrl => {
            try {
              const r = await fetch(innerUrl, { redirect:"follow", signal: AbortSignal.timeout(5000), headers:{ "User-Agent":"SEO-Agent-Audit/1.0" } });
              if (!r.ok) return;
              const h = await r.text();
              for (const m of h.matchAll(/href=["']([^"'#?][^"']*)["']/gi)) {
                try {
                  const a = new URL(m[1], innerUrl).href;
                  if (new URL(a).hostname === domain && !depth2Links.has(a) &&
                      !SKIP_EXTENSIONS.test(a) && !SKIP_PATTERNS.some(p => p.test(a))) {
                    depth2Links.add(a);
                    if (depth2Links.size >= 80) return;
                  }
                } catch { /* skip */ }
              }
            } catch { /* skip */ }
          })
        );
        allPagesToCrawl = [...new Set([...allPagesToCrawl, ...[...depth2Links].filter(u => !foundLinks.has(u))])];
      }

      // Cap at 500 pages for audit (Firestore 1MB doc limit safety)
      allPagesToCrawl = allPagesToCrawl.slice(0, 500);
      checks.internalLinksFound = allPagesToCrawl.length;
      discoveredUrls = allPagesToCrawl;

      // Crawl all discovered pages in parallel (with timeout)
      const crawlResults = await Promise.allSettled(
        allPagesToCrawl.map(async url => {
          const t0  = Date.now();
          const res = await fetch(url, { redirect:"follow", signal: AbortSignal.timeout(7000), headers:{ "User-Agent":"SEO-Agent-Audit/1.0" } });
          const responseTime = Date.now() - t0;
          if (!res.ok) return { url, status: res.status, broken: true };
          const html     = await res.text();
          // JS detection — flag blank pages for user awareness
          const isBlank  = html.length < 800 && (html.includes("__NEXT_DATA__") || html.includes("window.__INITIAL_STATE__") || html.includes("data-reactroot"));
          if (isBlank) return { url, status: res.status, broken: false, jsRendered: true, responseTime };
          const onPage   = parseOnPage(html, url, clientId);
          return { url, status: res.status, broken: false, responseTime, checks: onPage.checks, issues: onPage.issues };
        })
      );

      for (const r of crawlResults) {
        if (r.status === "fulfilled" && r.value) {
          const pg = r.value;
          if (pg.broken) {
            brokenLinks.push({ url: pg.url, status: pg.status });
          } else if (pg.jsRendered) {
            // JS-rendered page — flag it but don't audit (content not available via fetch)
            pageAudits.push({
              url:          pg.url,
              title:        "(JS-rendered — content not accessible via fetch)",
              jsRendered:   true,
              crawlDepth:   foundLinks.has(pg.url) ? 1 : 2,
              responseTime: pg.responseTime || null,
              issues:       [{ type: "js_rendered", label: "Page uses client-side JS rendering — audit incomplete", severity: "info" }],
              issueCount:   1,
            });
          } else {
            const pgIssues = [
              ...(pg.issues?.p1||[]).map(i => ({ ...i, severity: "critical" })),
              ...(pg.issues?.p2||[]).map(i => ({ ...i, severity: "warning" })),
            ];
            pageAudits.push({
              url:             pg.url,
              title:           pg.checks?.title?.value || "(missing)",
              titleLength:     pg.checks?.title?.length || 0,
              metaDescription: pg.checks?.metaDescription?.value || "",
              hasH1:           (pg.checks?.h1?.count || 0) > 0,
              h1:              pg.checks?.h1?.value || null,
              h2Count:         pg.checks?.h2Count || 0,
              h3Count:         pg.checks?.h3Count || 0,
              hasMeta:         pg.checks?.metaDescription?.exists || false,
              hasCanonical:    pg.checks?.canonical?.exists || false,
              hasSchema:       (pg.checks?.schemaTypes?.length || 0) > 0,
              schemas:         pg.checks?.schemaTypes || [],
              noindex:         pg.checks?.robotsMeta?.value?.includes("noindex") || false,
              altMissing:      pg.checks?.altTextAudit?.missingAlt || 0,
              wordCount:       pg.checks?.wordCount || 0,
              freshness:       pg.checks?.contentFreshness?.freshnessSignal || "unknown",
              crawlDepth:      foundLinks.has(pg.url) ? 1 : 2,
              responseTime:    pg.responseTime || null,
              issues:          pgIssues,
              issueCount:      pgIssues.length,
            });
          }
        }
      }

      // Check all href links for broken status (sampled — exclude already crawled)
      const allHrefs = [...foundLinks].filter(u => !pagesToCrawl.includes(u)).slice(0, 12);
      const brokenChecks = await Promise.allSettled(
        allHrefs.map(async url => {
          const res = await fetch(url, { method:"HEAD", signal: AbortSignal.timeout(5000), redirect:"follow" });
          return { url, status: res.status, ok: res.ok };
        })
      );
      for (const r of brokenChecks) {
        if (r.status === "fulfilled" && !r.value.ok) {
          if (!brokenLinks.find(b => b.url === r.value.url))
            brokenLinks.push({ url: r.value.url, status: r.value.status });
        }
      }

      if (brokenLinks.length > 0) {
        issues.p1.push({
          type:   "broken_links",
          detail: `${brokenLinks.length} broken link(s) found on the site`,
          fix:    "Fix or remove all broken links — they hurt crawlability and UX",
          urls:   brokenLinks.map(b => `${b.url} [${b.status}]`).slice(0, 10),
        });
      }

      // Pages missing titles
      const noTitle = pageAudits.filter(p => p.title === "(missing)");
      if (noTitle.length > 0) {
        issues.p2.push({
          type:   "inner_pages_no_title",
          detail: `${noTitle.length} inner page(s) have no title tag`,
          fix:    "Add unique, keyword-rich title tags to every page",
          urls:   noTitle.map(p => p.url),
        });
      }

      // Pages missing H1
      const noH1 = pageAudits.filter(p => !p.hasH1);
      if (noH1.length > 0) {
        issues.p2.push({
          type:   "inner_pages_no_h1",
          detail: `${noH1.length} inner page(s) missing H1 tag`,
          fix:    "Add one keyword-optimised H1 to every page",
          urls:   noH1.map(p => p.url),
        });
      }

      // ── Duplicate Title Detection ──────────────────
      // Pages sharing the same title tag — Google picks one to rank, others lose value
      const titlesAll = pageAudits.filter(p => p.title && p.title !== "(missing)");
      const titleMap  = {};
      for (const p of titlesAll) {
        const t = p.title.trim().toLowerCase();
        if (!titleMap[t]) titleMap[t] = [];
        titleMap[t].push(p.url);
      }
      const dupTitles = Object.entries(titleMap).filter(([, urls]) => urls.length > 1);
      if (dupTitles.length > 0) {
        issues.p2.push({
          type:   "duplicate_titles",
          detail: `${dupTitles.length} duplicate title tag(s) across pages — Google cannot distinguish these pages`,
          fix:    "Give every page a unique, descriptive title tag (50-60 chars) with its own target keyword",
          examples: dupTitles.slice(0, 5).map(([t, urls]) => `"${t}" used on: ${urls.join(", ")}`),
        });
      }

      // ── Duplicate Meta Description Detection ──────
      const metasAll = pageAudits.filter(p => p.metaDescription && p.metaDescription !== "");
      const metaMap  = {};
      for (const p of metasAll) {
        const m = (p.metaDescription || "").trim().toLowerCase();
        if (!m) continue;
        if (!metaMap[m]) metaMap[m] = [];
        metaMap[m].push(p.url);
      }
      const dupMetas = Object.entries(metaMap).filter(([, urls]) => urls.length > 1);
      if (dupMetas.length > 0) {
        issues.p3.push({
          type:   "duplicate_meta_desc",
          detail: `${dupMetas.length} duplicate meta description(s) found — hurts CTR as every result looks the same`,
          fix:    "Write a unique, compelling meta description (140-155 chars) for every page",
          examples: dupMetas.slice(0, 3).map(([m, urls]) => `"${m.slice(0, 60)}..." on: ${urls.join(", ")}`),
        });
      }
    } catch { /* multi-page crawl failed silently */ }
  }

  checks.pageAudits  = pageAudits;
  checks.brokenLinks = brokenLinks;

  // ── 6. E-E-A-T Signals Audit ──────────────────────
  // Google's "Experience, Expertise, Authoritativeness, Trustworthiness" — critical post-HCU
  if (checks._homepageHtml) {
    const h = checks._homepageHtml;
    const eeat = {
      hasAboutPage:     /href=["'][^"']*\/about(?:-us|team|company)?[/"']/i.test(h),
      hasContactPage:   /href=["'][^"']*\/contact(?:-us)?[/"']/i.test(h),
      hasPrivacyPolicy: /href=["'][^"']*\/privacy(?:-policy)?[/"']/i.test(h),
      hasAuthorBio:     /<[^>]*class=["'][^"']*(?:author|byline)[^"']*["']/i.test(h),
      hasSchemaOrg:     /"@context"\s*:\s*"https?:\/\/schema\.org"/i.test(h),
      hasBreadcrumb:    /(?:breadcrumb|BreadcrumbList)/i.test(h),
      hasTestimonials:  /<[^>]*class=["'][^"']*(?:testimonial|review|rating)[^"']*["']/i.test(h),
      hasSocialLinks:   /href=["'][^"']*(?:linkedin|twitter|facebook|instagram)\.com/i.test(h),
    };
    eeat.score    = Object.values(eeat).filter(Boolean).length;
    eeat.maxScore = 8;
    checks.eeat   = eeat;

    const missing = [];
    if (!eeat.hasAboutPage)     missing.push("About/Team page");
    if (!eeat.hasContactPage)   missing.push("Contact page");
    if (!eeat.hasPrivacyPolicy) missing.push("Privacy Policy");
    if (!eeat.hasSchemaOrg)     missing.push("Schema.org structured data");

    if (missing.length >= 3) {
      issues.p2.push({
        type:   "weak_eeat",
        detail: `E-E-A-T signals weak (${eeat.score}/8) — missing: ${missing.join(", ")}`,
        fix:    "Add About, Contact, Privacy Policy pages and Schema.org markup to build Google trust",
      });
    } else if (missing.length > 0) {
      issues.p3.push({
        type:   "eeat_improvements",
        detail: `E-E-A-T score ${eeat.score}/8 — could improve: ${missing.join(", ")}`,
        fix:    "Strengthen trust signals to improve E-E-A-T and Google's confidence in site authority",
      });
    }
  }

  delete checks._homepageHtml;

  // ── Build Result ───────────────────────────────────
  const totalIssues = issues.p1.length + issues.p2.length + issues.p3.length;
  const healthScore = Math.min(92, Math.max(8, 100 - (issues.p1.length * 30) - (issues.p2.length * 12) - (issues.p3.length * 4)));

  const auditResult = {
    status:      "complete",
    siteUrl,
    healthScore,
    totalIssues,
    issues,
    checks,
    pages: discoveredUrls.slice(0, 50).map(url => ({ url, discovered: "crawl" })),
    summary: {
      p1Count:       issues.p1.length,
      p2Count:       issues.p2.length,
      p3Count:       issues.p3.length,
      pagesCrawled:  pageAudits.length + 1,
      brokenLinks:   brokenLinks.length,
      redirectDepth: checks.redirectChain?.depth || 0,
      eeatScore:     checks.eeat?.score || 0,
      thinPages:     pageAudits.filter(p => p.wordCount < 300).length,
      message:  issues.p1.length > 0
        ? `${issues.p1.length} critical issue(s) blocking rankings — fix immediately`
        : issues.p2.length > 0
          ? `No critical issues. ${issues.p2.length} issues hurting rankings`
          : "Site looks technically healthy",
    },
    auditedAt: new Date().toISOString(),
  };

  // ── Remove large pageAudits array from doc before saving ─────────────────
  // Firestore 1MB doc limit: store per-page data in subcollection instead
  // Keep only the count so downstream agents can check if data exists
  const pageAuditsCount = pageAudits.length;
  delete auditResult.checks.pageAudits; // remove from doc — stored in subcollection below
  auditResult.checks.pageAuditCount = pageAuditsCount;

  // Save to shared state
  await saveState(clientId, "A2_audit", auditResult);

  // ── Write per-page docs to subcollection (non-blocking) ──────────────────
  // Each URL gets its own Firestore doc: audits/{clientId}/pages/{urlHash}
  // This enables site-wide pattern detection without hitting the 1MB doc limit
  if (pageAudits.length > 5) {
    const { db: fdb } = require("../config/firebase");
    const crawledAt = new Date().toISOString();
    const batch = fdb.batch();
    let batchCount = 0;

    for (const page of pageAudits) {
      const urlHash = Buffer.from(page.url || "").toString("base64").replace(/[/+=]/g, "_").slice(0, 50);
      const ref = fdb.collection("audits").doc(clientId).collection("pages").doc(urlHash);
      batch.set(ref, {
        url:             page.url,
        title:           page.title   || null,
        metaDescription: page.metaDescription || null,
        h1:              page.h1       || null,
        hasH1:           !!page.hasH1,
        hasMeta:         !!(page.hasMeta || page.metaDescription),
        hasCanonical:    !!page.hasCanonical,
        hasSchema:       !!page.hasSchema,
        wordCount:       page.wordCount || 0,
        altMissing:      page.altMissing || 0,
        responseTime:    page.responseTime || null,
        statusCode:      page.statusCode || 200,
        h2Count:         page.h2Count  || 0,
        h3Count:         page.h3Count  || 0,
        schemas:         page.schemas  || page.schemaTypes || [],
        noindex:         !!page.noindex,
        freshness:       page.freshness || null,
        issueCount:      (page.issues || []).length,
        issues:          (page.issues || []).slice(0, 10), // cap to stay under 1MB per doc
        clientId,
        crawledAt,
      });
      batchCount++;
      // Firestore batch limit is 500
      if (batchCount >= 490) break;
    }

    batch.commit().then(async () => {
      const { saveState: ss } = require("../shared-state/stateManager");

      // Run pattern detection and cache it
      try {
        const { detectSitePatterns } = require("../utils/auditPatterns");
        const patterns = await detectSitePatterns(clientId);
        await ss(clientId, "A2_patterns", patterns);
      } catch { /* non-blocking */ }

      // Run per-page scoring and cache it
      try {
        const { scoreAllPages } = require("../utils/pageScorer");
        const brief = await require("../shared-state/stateManager").getState(clientId, "A1_brief").catch(() => null);
        const targetKeywords = (brief?.primaryKeywords || []).slice(0, 5);
        const pageScores = await scoreAllPages(clientId, targetKeywords);
        await ss(clientId, "A2_page_scores", pageScores);
        console.log(`[A2] Page scoring complete: ${pageScores.pages?.length} pages, avg score ${pageScores.summary?.avgScore}`);
      } catch { /* non-blocking */ }

    }).catch(() => {});
  }

  // Emit tool suggestion for missing sitemap (non-blocking)
  if (!checks.sitemap?.exists) {
    emitToolSuggestion(clientId, "no_sitemap", {}, {
      pages: (auditResult.pages || []).map(p => p.url).filter(Boolean),
    }).catch(() => {});
  }

  return { success: true, audit: auditResult };
}

// ── HTML Parser ────────────────────────────────────
function parseOnPage(html, pageUrl, clientId) {
  const checks = {};
  const issues = { p1: [], p2: [], p3: [] };

  // Title tag
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : null;
  checks.title = { exists: !!title, value: title, length: title?.length || 0 };

  let pageLabel = "/";
  try { pageLabel = new URL(pageUrl).pathname || "/"; } catch { pageLabel = "/"; }
  if (!title) {
    issues.p1.push({ type: "missing_title", detail: `Page ${pageLabel} has no title tag`, fix: "Add a keyword-optimised title tag (50-60 characters)" });
  } else if (title.length < 10) {
    issues.p2.push({ type: "short_title", detail: `Title too short on ${pageLabel}: "${title}" (${title.length} chars)`, fix: "Expand title to 50-60 characters with primary keyword" });
  } else if (title.length > 70) {
    issues.p2.push({ type: "long_title", detail: `Title too long on ${pageLabel}: ${title.length} chars (max 60)`, fix: "Shorten title to under 60 characters" });
  }

  // Meta description
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)
                 || html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
  const desc = descMatch ? descMatch[1].trim() : null;
  checks.metaDescription = { exists: !!desc, value: desc, length: desc?.length || 0 };

  if (!desc) {
    issues.p2.push({ type: "missing_meta_desc", detail: `No meta description on ${pageLabel}`, fix: "Add a compelling meta description (140-155 characters)" });
  } else if (desc.length > 165) {
    issues.p3.push({ type: "long_meta_desc", detail: `Meta description too long: ${desc.length} chars`, fix: "Shorten to 140-155 characters" });
  }

  // H1 tag
  const h1Matches = html.match(/<h1[^>]*>(.*?)<\/h1>/gis) || [];
  const h1Count   = h1Matches.length;
  const h1Text    = h1Matches[0] ? h1Matches[0].replace(/<[^>]+>/g, "").trim() : null;
  checks.h1 = { count: h1Count, value: h1Text };

  if (h1Count === 0) {
    issues.p1.push({ type: "missing_h1", detail: `No H1 tag found on ${pageLabel}`, fix: "Add one H1 tag with the primary keyword" });
  } else if (h1Count > 1) {
    issues.p2.push({ type: "multiple_h1", detail: `${h1Count} H1 tags on ${pageLabel} — should be exactly 1`, fix: "Keep only one H1 per page" });
  }

  // H2 / H3 heading counts (for pageScorer + content structure)
  const h2Matches_ = html.match(/<h2[^>]*>[\s\S]*?<\/h2>/gi) || [];
  const h3Matches_ = html.match(/<h3[^>]*>[\s\S]*?<\/h3>/gi) || [];
  checks.h2Count = h2Matches_.length;
  checks.h3Count = h3Matches_.length;

  // Canonical tag
  const canonicalMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["']/i);
  checks.canonical = { exists: !!canonicalMatch, value: canonicalMatch?.[1] || null };
  if (!canonicalMatch) {
    issues.p3.push({ type: "missing_canonical", detail: "No canonical tag found", fix: "Add a self-referencing canonical tag to all pages" });
  }

  // Viewport (mobile)
  const viewportMatch = html.match(/<meta[^>]*name=["']viewport["']/i);
  checks.viewport = { exists: !!viewportMatch };
  if (!viewportMatch) {
    issues.p2.push({ type: "no_viewport", detail: "No viewport meta tag — poor mobile experience", fix: "Add <meta name='viewport' content='width=device-width, initial-scale=1'>" });
  }

  // ── Noindex detection — invisible ranking killer ──
  const robotsMetaMatch = html.match(/<meta[^>]*name=["']robots["'][^>]*content=["']([^"']*)["']/i)
                       || html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']robots["']/i);
  const robotsContent   = robotsMetaMatch?.[1]?.toLowerCase() || "";
  checks.robotsMeta = { value: robotsContent || null };
  if (robotsContent.includes("noindex")) {
    issues.p1.push({
      type:   "noindex_detected",
      detail: `Page ${pageLabel} has <meta name="robots" content="${robotsContent}"> — Google will NOT index this page`,
      fix:    "Remove 'noindex' from the robots meta tag or change to 'index, follow'",
    });
  }

  // ── Thin Content Detection ───────────────────────
  const strippedText = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ").trim();
  const wordCount = strippedText.split(/\s+/).filter(w => w.length > 2).length;
  checks.wordCount = wordCount;
  if (wordCount < 300) {
    issues.p2.push({
      type:   "thin_content",
      detail: `${pageLabel} has only ~${wordCount} words — may be flagged as thin content`,
      fix:    "Expand to at least 500 words with genuinely useful information for the user",
    });
  } else if (wordCount < 500) {
    issues.p3.push({
      type:   "low_content",
      detail: `${pageLabel} has ~${wordCount} words — consider expanding`,
      fix:    "Add more depth to support keyword targeting and satisfy user intent",
    });
  }

  // ── Content Freshness ────────────────────────────
  let publishedDate = null;
  const jsonLdBlocks = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const block of jsonLdBlocks) {
    try {
      const inner = block.replace(/<script[^>]*>/, "").replace(/<\/script>/i, "");
      const jld = JSON.parse(inner);
      const d = jld.dateModified || jld.datePublished || jld.date;
      if (d) { publishedDate = d; break; }
    } catch { /* skip */ }
  }
  if (!publishedDate) {
    const metaD = html.match(/<meta[^>]*(?:name|property)=["'](?:article:modified_time|article:published_time|date)["'][^>]*content=["']([^"']*)["']/i);
    if (metaD) publishedDate = metaD[1];
  }
  if (!publishedDate) {
    const urlYear = pageUrl.match(/\/(20\d{2})\//);
    if (urlYear) publishedDate = urlYear[1] + "-01-01";
  }
  let freshnessSignal = "unknown", ageYears = null;
  if (publishedDate) {
    ageYears = Math.round((Date.now() - new Date(publishedDate).getTime()) / (1000*60*60*24*365) * 10) / 10;
    freshnessSignal = ageYears < 0.5 ? "fresh" : ageYears < 1 ? "recent" : ageYears < 2 ? "aging" : "stale";
    if (ageYears > 2 && ageYears < 50) {
      issues.p3.push({
        type:   "stale_content",
        detail: `${pageLabel} content appears ${Math.round(ageYears)} year(s) old`,
        fix:    "Refresh with updated stats, current year references, and new insights",
      });
    }
  }
  checks.contentFreshness = { publishedDate, freshnessSignal, ageYears };

  // ── Alt Text Audit ──────────────────────────────
  const imgMatches = html.match(/<img[^>]*>/gi) || [];
  const imgsNoAlt  = imgMatches.filter(img => !img.match(/alt=["'][^"']+["']/i));
  checks.altTextAudit = {
    totalImages: imgMatches.length,
    missingAlt:  imgsNoAlt.length,
    missingUrls: imgsNoAlt.slice(0, 20).map(img => {
      const srcMatch = img.match(/src=["']([^"']*)["']/i);
      return srcMatch ? srcMatch[1] : "(no src)";
    }),
  };
  if (imgsNoAlt.length > 5) {
    issues.p2.push({
      type:   "missing_alt_text",
      detail: `${imgsNoAlt.length} of ${imgMatches.length} images missing alt text`,
      fix:    "Add keyword-rich descriptive alt text to all images",
    });
  } else if (imgsNoAlt.length > 0) {
    issues.p3.push({
      type:   "missing_alt_text",
      detail: `${imgsNoAlt.length} image(s) missing alt text`,
      fix:    "Add descriptive alt text to all images",
    });
  }

  // ── Image Optimization ──────────────────────────
  const nonWebp = imgMatches.filter(img => {
    const s = (img.match(/src=["']([^"']*)["']/i)||[])[1]?.toLowerCase()||"";
    return (s.endsWith(".jpg")||s.endsWith(".jpeg")||s.endsWith(".png")||s.endsWith(".gif")) && !s.startsWith("data:");
  });
  const missingDims = imgMatches.filter(img => !img.match(/width=/i) || !img.match(/height=/i));
  checks.imageOptimization = {
    totalImages:       imgMatches.length,
    nonWebpImages:     nonWebp.length,
    missingDimensions: missingDims.length,
  };
  if (nonWebp.length > 3) {
    issues.p3.push({
      type:   "non_webp_images",
      detail: `${nonWebp.length} images using old format (JPG/PNG) — WebP is 30% smaller`,
      fix:    "Convert images to WebP format to improve page load speed",
    });
  }
  if (missingDims.length > 5) {
    issues.p2.push({
      type:   "missing_image_dimensions",
      detail: `${missingDims.length} images missing width/height — causes Cumulative Layout Shift (CLS)`,
      fix:    "Add explicit width and height attributes to all <img> tags",
    });
  }

  // ── Open Graph Tags ─────────────────────────────
  const ogTags = {};
  const ogPattern1 = /<meta[^>]*property=["']og:([^"']*)["'][^>]*content=["']([^"']*)["']/gi;
  const ogPattern2 = /<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:([^"']*)["']/gi;
  let m;
  while ((m = ogPattern1.exec(html)) !== null) ogTags[m[1]] = m[2];
  while ((m = ogPattern2.exec(html)) !== null) ogTags[m[2]] = m[1];
  checks.ogTags = ogTags;
  const missingOg = ["title", "description", "image"].filter(t => !ogTags[t]);
  if (missingOg.length > 0) {
    issues.p2.push({
      type:   "missing_og_tags",
      detail: `Missing Open Graph tags: og:${missingOg.join(", og:")}`,
      fix:    "Add og:title, og:description, og:image for proper social sharing previews",
    });
  }

  // ── HTTP Request Analyzer ───────────────────────
  const scriptCount = (html.match(/<script[^>]*src=["']/gi) || []).length;
  const cssCount    = (html.match(/<link[^>]*rel=["']stylesheet["']/gi) || []).length;
  const totalRequests = scriptCount + cssCount + imgMatches.length;
  checks.httpRequests = {
    total:       totalRequests,
    scripts:     scriptCount,
    stylesheets: cssCount,
    images:      imgMatches.length,
  };
  if (totalRequests > 60) {
    issues.p1.push({
      type:   "too_many_requests",
      detail: `${totalRequests} HTTP requests (${imgMatches.length} images, ${scriptCount} JS, ${cssCount} CSS) — limit is 20`,
      fix:    "Minify & combine CSS/JS files, lazy-load images, use a CDN",
    });
  } else if (totalRequests > 30) {
    issues.p2.push({
      type:   "high_request_count",
      detail: `${totalRequests} HTTP requests detected — recommended max: 20`,
      fix:    "Combine CSS/JS files and optimise image loading",
    });
  }

  // ── Minification check ──────────────────────────
  const unminJS  = (html.match(/src=["'][^"']*(?<!\.min)\.js["']/gi) || []).slice(0, 5).map(s => s.match(/src=["']([^"']*)["']/i)?.[1]);
  const unminCSS = (html.match(/href=["'][^"']*(?<!\.min)\.css["']/gi) || []).slice(0, 5).map(s => s.match(/href=["']([^"']*)["']/i)?.[1]);
  checks.minification = { unminifiedJS: unminJS.filter(Boolean), unminifiedCSS: unminCSS.filter(Boolean) };
  if (unminJS.length > 0 || unminCSS.length > 0) {
    issues.p3.push({
      type:   "unminified_assets",
      detail: `${unminJS.length} JS and ${unminCSS.length} CSS files appear unminified`,
      fix:    "Minify JS and CSS files to reduce page load time",
    });
  }

  // ── SERP Preview data ───────────────────────────
  checks.serpPreview = {
    title:       title || "(No title)",
    titleLength: title?.length || 0,
    description: desc || "(No description)",
    descLength:  desc?.length || 0,
    url:         pageUrl,
    titleTruncated: title && title.length > 60,
    descTruncated:  desc && desc.length > 155,
  };

  // Emit tasks to task queue (non-blocking — won't break audit if this fails)
  Promise.allSettled([
    emitTasks(clientId, issues.p1, "p1", "A2"),
    emitTasks(clientId, issues.p2, "p2", "A2"),
    emitTasks(clientId, issues.p3, "p3", "A2"),
  ]).catch(() => {});

  // Emit tool suggestions for actionable on-page issues (non-blocking)
  if (clientId) {
    const pageData = { url: pageUrl, title: checks.title?.value, h1: checks.h1?.value, metaDesc: checks.metaDescription?.value };
    const toolEmits = [];
    if (!checks.title?.exists || checks.title?.length < 10)       toolEmits.push(emitToolSuggestion(clientId, "missing_title",           { url: pageUrl }, pageData));
    if (!checks.metaDescription?.exists)                           toolEmits.push(emitToolSuggestion(clientId, "missing_meta_description", { url: pageUrl }, pageData));
    if (checks.h1?.count === 0)                                    toolEmits.push(emitToolSuggestion(clientId, "missing_h1",              { url: pageUrl }, pageData));
    if (jsonLdBlocks.length === 0)                                 toolEmits.push(emitToolSuggestion(clientId, "missing_schema",          { url: pageUrl }, pageData));
    Promise.allSettled(toolEmits).catch(() => {});
  }

  return { checks, issues };
}

/**
 * Sprint 1 — Sitemap-based URL discovery.
 * Supports sitemap index files (nested sitemaps) and standard sitemaps.
 * Returns up to 500 filtered, same-domain URLs.
 */
async function discoverFromSitemap(siteUrl, domain, skipExt, skipPatterns) {
  const urls = new Set();

  async function parseSitemap(xmlUrl, depth = 0) {
    if (depth > 2) return; // prevent infinite recursion on malformed sitemap indices
    try {
      const res = await fetch(xmlUrl, { signal: AbortSignal.timeout(10000), headers: { "User-Agent": "SEO-Agent-Audit/1.0" } });
      if (!res.ok) return;
      const xml = await res.text();

      // Sitemap index — contains <sitemap><loc> pointing to child sitemaps
      if (xml.includes("<sitemapindex")) {
        const children = [...xml.matchAll(/<loc>\s*(https?:\/\/[^<]+)\s*<\/loc>/gi)].map(m => m[1].trim());
        await Promise.allSettled(children.slice(0, 20).map(child => parseSitemap(child, depth + 1)));
        return;
      }

      // Standard sitemap — contains <url><loc>
      const locs = [...xml.matchAll(/<loc>\s*(https?:\/\/[^<]+)\s*<\/loc>/gi)].map(m => m[1].trim());
      for (const loc of locs) {
        try {
          const u = new URL(loc);
          if (
            u.hostname === domain &&
            !skipExt.test(loc) &&
            !skipPatterns.some(p => p.test(loc))
          ) {
            urls.add(loc.split("?")[0]); // strip query strings
            if (urls.size >= 500) return;
          }
        } catch { /* skip malformed */ }
      }
    } catch { /* non-blocking — sitemap unavailable */ }
  }

  // Try the three most common sitemap locations
  const candidates = [
    new URL("/sitemap.xml",       siteUrl).href,
    new URL("/sitemap_index.xml", siteUrl).href,
    new URL("/sitemap.xml.gz",    siteUrl).href, // some WP installs
  ];

  await Promise.allSettled(candidates.map(c => parseSitemap(c)));

  // Remove the root URL itself — it's the homepage, already audited separately
  urls.delete(siteUrl);
  urls.delete(siteUrl.replace(/\/$/, ""));
  urls.delete(siteUrl.endsWith("/") ? siteUrl : siteUrl + "/");

  return [...urls];
}

module.exports = { runA2 };
