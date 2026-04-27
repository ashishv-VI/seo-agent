const { saveState, getState } = require("../shared-state/stateManager");
const { emitTasks, clearTasks } = require("../utils/taskQueue");
const { emitToolSuggestion }    = require("../utils/toolBridge");
const { smartAudit }            = require("../crawler/smartCrawler");

/**
 * A2 — Technical & On-Page Audit Agent (Smart Crawler 2025)
 * 12 audit layers: HTTP, Crawlability, Indexability, On-Page, Content Quality,
 * Internal Links, Media, Core Web Vitals (INP 2024), Schema 2025,
 * E-E-A-T, AEO/GEO/AI readiness, Security.
 * Cloudflare bypass: sitemap-first → GSC → Common Crawl → direct crawl.
 */
async function runA2(clientId, keys, masterPrompt) {
  try {
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
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });
    checks.httpStatus   = res.status;
    checks.finalUrl     = res.url;
    checks.responseTime = Date.now() - startTime;

    // If blocked (403/406/429) — site has Cloudflare/Sucuri blocking cloud IPs
    // Mark as accessible (site IS up) but note the block
    if (res.status === 403 || res.status === 406 || res.status === 429) {
      console.log(`[A2] Site returned ${res.status} — Cloudflare/firewall blocking crawler IPs. Continuing with available data.`);
      checks.isAccessible = true; // site IS live — just blocks crawlers
      checks.isFirewallBlocked = true;
      checks.firewallStatus = res.status;
      issues.p2.push({
        type: "crawler_blocked",
        detail: `Site returns HTTP ${res.status} to crawler IPs (Cloudflare/Sucuri protection). Some audit checks limited.`,
        fix: "This is not an SEO issue — site is live. Whitelist SEO crawler IPs if full technical audit needed.",
      });
    } else {
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
    let rawHtml = await res.text();

    // JS-render fallback — lazy-loaded with hard 15s timeout (Puppeteer unavailable on Render free tier)
    try {
      const { isJSRendered: isJSR, renderPage: rp } = require("../utils/jsRenderer");
      checks.isJSRendered = isJSR(rawHtml);
      if (checks.isJSRendered) {
        console.log(`[A2] JS-rendered page detected at ${siteUrl} → trying Puppeteer`);
        const renderResult = await Promise.race([
          rp(siteUrl, 12000),
          new Promise((_, reject) => setTimeout(() => reject(new Error("renderPage timeout")), 15000)),
        ]);
        if (renderResult?.html && renderResult.html.length > rawHtml.length) {
          rawHtml = renderResult.html;
          checks.jsRenderingUsed = renderResult.rendered;
        }
      }
    } catch (renderErr) {
      console.warn(`[A2] renderPage failed (${renderErr?.message}) — using fetch HTML`);
      checks.isJSRendered = false;
    }

    const html = rawHtml;
    checks._homepageHtml = html;
    const onPage = parseOnPage(html, res.url, clientId);
    Object.assign(checks, onPage.checks);
    onPage.issues.p1.forEach(i => issues.p1.push(i));
    onPage.issues.p2.forEach(i => issues.p2.push(i));
    onPage.issues.p3.forEach(i => issues.p3.push(i));
    } // close else (not firewall-blocked)

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

  // ── 5. Smart Audit — 12 layers, Cloudflare bypass, 2025 SEO rules ───────────
  const pageAudits    = [];
  const brokenLinks   = [];
  let   discoveredUrls = [];

  // Skip crawl if site is firewall-blocked — all pages will return 403
  if (checks.isAccessible && !checks.isFirewallBlocked) {
    try {
      // Pull GSC page list from A10 state if available (helps bypass Cloudflare)
      let gscPages = null;
      try {
        const a10 = await getState(clientId, "A10_rankings");
        if (a10?.rankings) gscPages = a10.rankings.map(r => r.page || r.url).filter(Boolean);
      } catch { /* skip */ }

      const crawlResult = await smartAudit(siteUrl, {
        maxPages:    60,
        concurrency: 4,
        delayMs:     250,
        gscPages,
        clientId,
        onProgress: (done, total, phase) => {
          if (done % 10 === 0 || phase === "discovered") {
            console.log(`[A2] ${phase}: ${done}/${total}`);
          }
        },
      });

      const crawledPages = crawlResult.pages || [];
      checks.internalLinksFound  = crawledPages.length;
      checks.sitemapPagesFound   = crawlResult.urlsDiscovered || 0;
      checks.isCloudflareProtected = crawlResult.isCloudflareProtected || false;
      discoveredUrls = crawledPages.map(p => p.url);

      // Convert smart audit page results → pageAudits format
      for (const cp of crawledPages) {
        const pgIssues = (cp.issues || []).map(i => ({
          type:     i.type,
          severity: i.severity || "p3",
          detail:   i.detail || "",
          fix:      i.fix || "",
        }));

        pageAudits.push({
          url:             cp.url,
          title:           cp.title || "(missing)",
          titleLength:     cp.titleLength || 0,
          metaDescription: cp.metaDescription || "",
          hasH1:           !!(cp.h1),
          h1:              cp.h1 || null,
          h2Count:         cp.h2Count || 0,
          h3Count:         cp.h3Count || 0,
          hasMeta:         !!(cp.metaDescription),
          hasCanonical:    !!(cp.canonical),
          hasSchema:       (cp.schemaTypes?.length || 0) > 0,
          schemas:         cp.schemaTypes || [],
          noindex:         !!cp.noindex,
          altMissing:      cp.imgMissingAlt || 0,
          wordCount:       cp.wordCount || 0,
          contentRatio:    cp.contentRatio || 0,
          freshnessSignal: cp.freshnessSignal || "unknown",
          crawlDepth:      1,
          responseTime:    cp.responseTime || null,
          pageScore:       cp.pageScore || 70,
          eeat:            cp.eeat || null,
          aeo:             cp.aeo || null,
          geo:             cp.geo || null,
          aiContentRisk:   cp.aiContentRisk || null,
          securityHeaders: cp.securityHeaders || {},
          schemaTypes:     cp.schemaTypes || [],
          hasFAQSchema:    cp.hasFAQSchema || false,
          hasHowToSchema:  cp.hasHowToSchema || false,
          hasLocalSchema:  cp.hasLocalSchema || false,
          hasBreadcrumb:   cp.hasBreadcrumb || false,
          hasViewport:     cp.hasViewport || false,
          hasMobileCSS:    cp.hasMobileCSS || false,
          ogTags:          cp.ogTags || {},
          renderBlockingJS: cp.renderBlockingJS || 0,
          issues:          pgIssues,
          issueCount:      pgIssues.length,
        });
      }

      // ── Merge global issues from smart audit ──────────────────────────────
      const gi = crawlResult.globalIssues || { p1: [], p2: [], p3: [] };
      for (const issue of gi.p1) issues.p1.push(issue);
      for (const issue of gi.p2) issues.p2.push(issue);
      for (const issue of gi.p3) issues.p3.push(issue);

      // Broken pages
      for (const bp of (crawlResult.brokenPages || [])) {
        brokenLinks.push({ url: bp.url, status: bp.status });
      }

      const analysis = crawlResult.analysis || {};
      checks.crawlAnalysis = {
        orphanCount:            analysis.orphanCount || 0,
        cannibalizationCount:   analysis.cannibalization?.length || 0,
        dupTitleCount:          analysis.dupTitles?.length || 0,
        avgResponseTime:        analysis.avgResponseTime || 0,
        slowPagesCount:         analysis.slowPages?.length || 0,
        thinCount:              analysis.thinCount || 0,
        noSchemaCount:          analysis.noSchemaCount || 0,
        isCloudflareProtected:  crawlResult.isCloudflareProtected || false,
      };

      // E-E-A-T from homepage
      if (crawlResult.eeat) checks.eeat = crawlResult.eeat;
      // AEO/GEO from homepage
      if (crawlResult.aeo) checks.aeo = crawlResult.aeo;
      if (crawlResult.geo) checks.geo = crawlResult.geo;

      // Infrastructure
      checks.sitemap = crawlResult.infrastructure?.sitemap || checks.sitemap;
      checks.robotsTxt = crawlResult.infrastructure?.robots || checks.robotsTxt;
      checks.redirectChain = crawlResult.infrastructure?.redirects || checks.redirectChain;

    } catch (e) {
      console.error("[A2] Smart audit error:", e.message);
    }
  }

  checks.pageAudits  = pageAudits;
  checks.brokenLinks = brokenLinks;

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
      p1Count:        issues.p1.length,
      p2Count:        issues.p2.length,
      p3Count:        issues.p3.length,
      pagesCrawled:   pageAudits.length + 1,
      brokenLinks:    brokenLinks.length,
      redirectDepth:  checks.redirectChain?.depth || 0,
      eeatScore:      checks.eeat?.score || 0,
      eeatMaxScore:   checks.eeat?.maxScore || 12,
      aeoScore:       checks.aeo?.score || 0,
      aeoMaxScore:    checks.aeo?.maxScore || 12,
      geoScore:       checks.geo?.score || 0,
      thinPages:      pageAudits.filter(p => p.wordCount < 300).length,
      noSchemaPages:  pageAudits.filter(p => !p.hasSchema).length,
      isCloudflareProtected: checks.crawlAnalysis?.isCloudflareProtected || false,
      message: issues.p1.length > 0
        ? `${issues.p1.length} critical issue(s) blocking rankings — fix immediately`
        : issues.p2.length > 0
          ? `No critical issues. ${issues.p2.length} issues hurting rankings`
          : "Site looks technically healthy",
    },
    eeat:      checks.eeat  || null,
    aeo:       checks.aeo   || null,
    geo:       checks.geo   || null,
    auditedAt: new Date().toISOString(),
  };

  // ── Trim doc before saving — Firestore 1MB limit ─────────────────────────
  const pageAuditsCount = pageAudits.length;
  delete auditResult.checks.pageAudits;
  auditResult.checks.pageAuditCount = pageAuditsCount;

  // Cap issues arrays to 30 items each to stay well under 1MB
  auditResult.issues.p1 = (auditResult.issues.p1 || []).slice(0, 30);
  auditResult.issues.p2 = (auditResult.issues.p2 || []).slice(0, 30);
  auditResult.issues.p3 = (auditResult.issues.p3 || []).slice(0, 30);
  // Cap pages array (only used for display, not pipeline logic)
  auditResult.pages = (auditResult.pages || []).slice(0, 30);
  // Remove checks.brokenLinks from top-level checks (already in brokenLinks summary)
  delete auditResult.checks.brokenLinks;

  // Save to shared state — wrapped so a Firestore error can't fail the whole agent
  try {
    await saveState(clientId, "A2_audit", auditResult);
  } catch (saveErr) {
    console.error("[A2] saveState failed:", saveErr.message, "— retrying with minimal payload");
    // Retry with a minimal payload so downstream agents still have something to read
    await saveState(clientId, "A2_audit", {
      status:      auditResult.status,
      siteUrl:     auditResult.siteUrl,
      healthScore: auditResult.healthScore,
      totalIssues: auditResult.totalIssues,
      summary:     auditResult.summary,
      issues:      { p1: auditResult.issues.p1.slice(0, 5), p2: auditResult.issues.p2.slice(0, 5), p3: [] },
      auditedAt:   auditResult.auditedAt,
    });
  }

  // ── Write per-page docs to subcollection (non-blocking) ──────────────────
  // Skip if >20 pages to avoid burning Firestore write quota on Blaze plan.
  // Site Patterns panel uses this data but is non-critical for the main pipeline.
  if (pageAudits.length > 5 && pageAudits.length <= 20) {
    const { db: fdb } = require("../config/firebase");
    const crawledAt = new Date().toISOString();
    const BATCH_SIZE = 490; // Firestore batch limit is 500

    // First, clear any stale pages from a previous crawl that aren't in the new set
    // (avoids pattern detection seeing deleted pages as still-broken)
    const newUrlHashes = new Set(
      pageAudits.map(p => Buffer.from(p.url || "").toString("base64").replace(/[/+=]/g, "_").slice(0, 50))
    );

    (async () => {
      try {
        // Delete stale pages (those present in subcollection but not in this crawl)
        try {
          const existing = await fdb.collection("audits").doc(clientId).collection("pages").get();
          const staleDocs = existing.docs.filter(d => !newUrlHashes.has(d.id));
          if (staleDocs.length > 0) {
            for (let i = 0; i < staleDocs.length; i += BATCH_SIZE) {
              const deleteBatch = fdb.batch();
              staleDocs.slice(i, i + BATCH_SIZE).forEach(d => deleteBatch.delete(d.ref));
              await deleteBatch.commit();
            }
            console.log(`[A2] Cleared ${staleDocs.length} stale page docs for ${clientId}`);
          }
        } catch (e) {
          console.warn(`[A2] Stale cleanup failed for ${clientId}:`, e.message);
        }

        // Chunk writes — handles 500+ pages
        let written = 0;
        for (let i = 0; i < pageAudits.length; i += BATCH_SIZE) {
          const chunk = pageAudits.slice(i, i + BATCH_SIZE);
          const batch = fdb.batch();
          for (const page of chunk) {
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
          }
          await batch.commit();
          written += chunk.length;
        }
        console.log(`[A2] Wrote ${written}/${pageAudits.length} page docs to subcollection for ${clientId}`);

        // Run pattern detection across ALL stored pages (not just top 80)
        const { saveState: ss } = require("../shared-state/stateManager");
        try {
          const { detectSitePatterns } = require("../utils/auditPatterns");
          const patterns = await detectSitePatterns(clientId);
          await ss(clientId, "A2_patterns", patterns);
        } catch (e) {
          console.warn(`[A2] Pattern detection failed for ${clientId}:`, e.message);
        }

        // Run per-page scoring and cache it
        try {
          const { scoreAllPages } = require("../utils/pageScorer");
          const brief = await require("../shared-state/stateManager").getState(clientId, "A1_brief").catch(() => null);
          const targetKeywords = (brief?.primaryKeywords || []).slice(0, 5);
          const pageScores = await scoreAllPages(clientId, targetKeywords);
          await ss(clientId, "A2_page_scores", pageScores);
          console.log(`[A2] Page scoring complete: ${pageScores.pages?.length} pages, avg score ${pageScores.summary?.avgScore}`);
        } catch { /* non-blocking */ }
      } catch (e) {
        console.error(`[A2] Subcollection write failed for ${clientId}:`, e.message);
      }
    })();
  }

  // Emit tool suggestion for missing sitemap (non-blocking)
  if (!checks.sitemap?.exists) {
    emitToolSuggestion(clientId, "no_sitemap", {}, {
      pages: (auditResult.pages || []).map(p => p.url).filter(Boolean),
    }).catch(() => {});
  }

  return { success: true, audit: auditResult };
  } catch (e) {
    console.error(`[A2] Audit failed for ${clientId}:`, e.message);
    return { success: false, error: e.message };
  }
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
        // Limit children + add timeout to prevent hang on large sitemap indices
        await Promise.race([
          Promise.allSettled(children.slice(0, 5).map(child => parseSitemap(child, depth + 1))),
          new Promise(resolve => setTimeout(resolve, 15000)), // 15s max for all children
        ]);
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
