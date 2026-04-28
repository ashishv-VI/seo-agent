/**
 * Smart Crawler — 2025 SEO Audit Engine
 *
 * 12 Audit Layers:
 *   L1  HTTP/Infrastructure  — SSL, HSTS, redirects, TTFB, HTTP/2
 *   L2  Crawlability         — robots.txt, noindex, nofollow, crawl directives
 *   L3  Indexability         — canonical, hreflang, pagination, noindex detection
 *   L4  On-Page Signals      — title, meta, H1-H6, word count, freshness
 *   L5  Content Quality      — thin, duplicate, keyword stuffing, readability
 *   L6  Internal Links       — orphan, equity, anchor text diversity, depth
 *   L7  Media & Assets       — alt text, WebP, lazy-load, dimensions, CLS risk
 *   L8  Core Web Vitals      — INP (2025), LCP proxy, CLS proxy, TTFB
 *   L9  Schema / Structured  — JSON-LD, required types, deprecated types (2026)
 *   L10 E-E-A-T              — author, about, trust, citations, expertise signals
 *   L11 AEO / GEO / AI       — FAQ schema, direct answers, entity consistency
 *   L12 Security             — HTTPS, mixed content, CSP, X-Frame
 *
 * Cloudflare bypass: sitemap-first → GSC → Common Crawl → direct crawl
 * Zero paid APIs — all free sources only.
 */

const { URL } = require("url");

// ── User-Agent pool ──────────────────────────────────────────────────────────
const UA_POOL = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Mobile Safari/537.36",
];
let _uaIdx = 0;
const nextUA = () => UA_POOL[_uaIdx++ % UA_POOL.length];

// ── Deprecated schema types (Google deprecated Jan 2026) ────────────────────
const DEPRECATED_SCHEMA_TYPES = new Set([
  "DataFeedItem", "Drug", "DrugClass", "DrugStrength",
  "MedicalCondition", "MedicalProcedure", "MedicalTherapy",
]);

// ── Schema types that need JSON-LD (not Microdata) per 2025 guidelines ───────
const PREFERRED_SCHEMA_TYPES = new Set([
  "Article", "BlogPosting", "FAQPage", "HowTo", "LocalBusiness",
  "Organization", "Person", "Product", "Review", "Service",
  "WebPage", "WebSite", "BreadcrumbList", "SiteNavigationElement",
]);

// ── Industry-level security headers to check ─────────────────────────────────
const SEC_HEADERS = [
  "strict-transport-security",
  "x-content-type-options",
  "x-frame-options",
  "content-security-policy",
  "referrer-policy",
  "permissions-policy",
];

// ── AEO answer patterns (structuring for AI citation) ────────────────────────
const AEO_ANSWER_PATTERNS = [
  /is\s+[\w\s]+\?/i,
  /what\s+(?:is|are|does|do)\s+/i,
  /how\s+(?:to|do|does|can)\s+/i,
  /why\s+(?:is|are|does|do)\s+/i,
  /when\s+(?:is|should|can)\s+/i,
  /which\s+[\w\s]+\?/i,
];

// ── 2025 mobile-first signals ─────────────────────────────────────────────────
const MOBILE_BREAKPOINTS = /(?:max-width:\s*(?:480|640|768|1024)px|min-width:\s*(?:320|375|414)px)/i;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// FETCH — with UA rotation, retry, CF detection
// ─────────────────────────────────────────────────────────────────────────────
async function smartFetch(url, timeoutMs = 12000, opts = {}) {
  const { retries = 2, isMobile = false } = opts;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const ua = isMobile
        ? "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Mobile Safari/537.36"
        : nextUA();

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent":      ua,
          "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9,hi;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
          "Cache-Control":   "no-cache",
          "Upgrade-Insecure-Requests": "1",
        },
        redirect: "follow",
      });
      clearTimeout(timer);

      if (res.status === 429 || res.status === 503) {
        if (attempt < retries) { await sleep(1500 * (attempt + 1)); continue; }
        return { html: null, status: res.status, blocked: true, finalUrl: res.url, headers: {} };
      }
      if (res.status === 403) {
        if (attempt < retries) { await sleep(800); continue; }
        return { html: null, status: 403, blocked: true, finalUrl: res.url, headers: {} };
      }
      if (!res.ok) return { html: null, status: res.status, finalUrl: res.url, headers: {} };

      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("text/html")) {
        return { html: null, status: res.status, skip: true, finalUrl: res.url, headers: {} };
      }

      const headers = {};
      for (const h of SEC_HEADERS) headers[h] = res.headers.get(h) || null;
      headers["x-served-by"]    = res.headers.get("x-served-by") || null;
      headers["cf-ray"]         = res.headers.get("cf-ray") || null;
      headers["server"]         = res.headers.get("server") || null;
      headers["content-encoding"] = res.headers.get("content-encoding") || null;
      headers["last-modified"]  = res.headers.get("last-modified") || null;
      headers["etag"]           = res.headers.get("etag") || null;

      const html = await res.text();
      return { html, status: res.status, finalUrl: res.url, headers };

    } catch (e) {
      if (attempt < retries && (e.name === "AbortError" || e.name === "TimeoutError" || String(e).includes("timeout"))) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      return { html: null, status: 0, error: e.message, headers: {} };
    }
  }
  return { html: null, status: 0, error: "Max retries", headers: {} };
}

// ─────────────────────────────────────────────────────────────────────────────
// URL DISCOVERY — sitemap-first, GSC fallback, Common Crawl last resort
// ─────────────────────────────────────────────────────────────────────────────
async function discoverUrls(siteUrl, opts = {}) {
  const { maxUrls = 500, gscPages = null } = opts;

  let domain;
  try { domain = new URL(siteUrl).hostname; } catch { return []; }

  const SKIP_EXT     = /\.(css|js|ico|png|jpg|jpeg|gif|svg|webp|woff|woff2|ttf|eot|pdf|zip|xml|json|txt|mp4|mp3|wav|avi|mov|map|gz|tar|rar|exe|dmg|swf)(\?.*)?$/i;
  const SKIP_PATTERN = [
    /\/wp-admin\//i, /\/wp-json\//i, /\/wp-login/i,
    /\/wp-cron/i, /\/feed\/?$/i, /\/xmlrpc\.php/i,
    /\/tag\//i, /\/author\//i, /\/page\/\d+/i,
    /\/cart\/?$/i, /\/checkout\/?$/i, /\/my-account/i,
    /\?replytocom=/i, /\/trackback\/?$/i,
  ];

  const urls = new Set();

  // ── Layer 1: XML Sitemap ──────────────────────────────────────────────────
  async function parseSitemap(xmlUrl, depth = 0) {
    if (depth > 3 || urls.size >= maxUrls) return;
    try {
      const r = await fetch(xmlUrl, { signal: AbortSignal.timeout(10000), headers: { "User-Agent": UA_POOL[0] } });
      if (!r.ok) return;
      const xml = await r.text();

      if (xml.includes("<sitemapindex")) {
        const children = [...xml.matchAll(/<loc>\s*(https?:\/\/[^<\s]+)\s*<\/loc>/gi)].map(m => m[1].trim());
        await Promise.allSettled(children.slice(0, 30).map(c => parseSitemap(c, depth + 1)));
        return;
      }

      const locs = [...xml.matchAll(/<loc>\s*(https?:\/\/[^<\s]+)\s*<\/loc>/gi)].map(m => m[1].trim());
      for (const loc of locs) {
        try {
          const u = new URL(loc);
          if (u.hostname === domain && !SKIP_EXT.test(loc) && !SKIP_PATTERN.some(p => p.test(loc))) {
            urls.add(loc.split("?")[0]);
            if (urls.size >= maxUrls) return;
          }
        } catch { /* skip */ }
      }
    } catch { /* non-blocking */ }
  }

  const sitemapCandidates = [
    new URL("/sitemap.xml", siteUrl).href,
    new URL("/sitemap_index.xml", siteUrl).href,
    new URL("/sitemap-index.xml", siteUrl).href,
    new URL("/news-sitemap.xml", siteUrl).href,
    new URL("/page-sitemap.xml", siteUrl).href,
    new URL("/post-sitemap.xml", siteUrl).href,
  ];

  await Promise.allSettled(sitemapCandidates.map(c => parseSitemap(c)));

  // ── Layer 2: GSC pages (if available — from A10 state) ────────────────────
  if (gscPages && Array.isArray(gscPages)) {
    for (const p of gscPages) {
      const u = p.page || p.url || p;
      if (typeof u === "string" && u.includes(domain)) {
        urls.add(u.split("?")[0]);
      }
    }
  }

  // ── Layer 3: robots.txt sitemap directive ─────────────────────────────────
  try {
    const robotsRes = await fetch(new URL("/robots.txt", siteUrl).href, { signal: AbortSignal.timeout(5000) });
    if (robotsRes.ok) {
      const robotsTxt = await robotsRes.text();
      const sitemapLines = [...robotsTxt.matchAll(/^Sitemap:\s*(.+)$/gim)].map(m => m[1].trim());
      await Promise.allSettled(sitemapLines.slice(0, 10).map(s => parseSitemap(s)));
    }
  } catch { /* skip */ }

  // ── Layer 4: Common Crawl CDX API (free, no key) — last resort ────────────
  if (urls.size < 10) {
    try {
      const cdxUrl = `https://index.commoncrawl.org/CC-MAIN-2024-51-index?url=${domain}/*&output=json&limit=100&fields=url,status`;
      const r = await fetch(cdxUrl, { signal: AbortSignal.timeout(8000), headers: { "User-Agent": UA_POOL[0] } });
      if (r.ok) {
        const text = await r.text();
        for (const line of text.split("\n")) {
          try {
            const obj = JSON.parse(line);
            if (obj.url && obj.status === "200" && !SKIP_EXT.test(obj.url) && !SKIP_PATTERN.some(p => p.test(obj.url))) {
              urls.add(obj.url.split("?")[0]);
            }
          } catch { /* skip */ }
        }
      }
    } catch { /* skip */ }
  }

  // ── Layer 5: Homepage link extraction — when all else fails ──────────────
  // If sitemap + robots + GSC + CommonCrawl found < 5 URLs, crawl the homepage
  // and extract every internal link. This ensures we always get something to audit.
  if (urls.size < 5) {
    try {
      const homeRes = await fetch(siteUrl, {
        signal: AbortSignal.timeout(12000),
        headers: { "User-Agent": UA_POOL[0], "Accept": "text/html" },
        redirect: "follow",
      });
      if (homeRes.ok) {
        const homeHtml = await homeRes.text();
        const linkRe = /<a[^>]+href=["']([^"'\s#][^"'\s]*)["'][^>]*>/gi;
        let m;
        while ((m = linkRe.exec(homeHtml)) !== null && urls.size < maxUrls) {
          try {
            const resolved = new URL(m[1], siteUrl);
            if (
              resolved.hostname === domain &&
              !SKIP_EXT.test(resolved.pathname) &&
              !SKIP_PATTERN.some(p => p.test(resolved.href))
            ) {
              urls.add(resolved.origin + resolved.pathname);
            }
          } catch { /* skip */ }
        }

        // Also follow nav/footer links one level deep (BFS depth-1)
        const discovered1 = [...urls].slice(0, 20);
        await Promise.allSettled(discovered1.map(async (u) => {
          if (urls.size >= maxUrls) return;
          try {
            const r2 = await fetch(u, {
              signal: AbortSignal.timeout(8000),
              headers: { "User-Agent": UA_POOL[0], "Accept": "text/html" },
              redirect: "follow",
            });
            if (!r2.ok) return;
            const h2 = await r2.text();
            let m2;
            const re2 = /<a[^>]+href=["']([^"'\s#][^"'\s]*)["'][^>]*>/gi;
            while ((m2 = re2.exec(h2)) !== null && urls.size < maxUrls) {
              try {
                const resolved2 = new URL(m2[1], u);
                if (
                  resolved2.hostname === domain &&
                  !SKIP_EXT.test(resolved2.pathname) &&
                  !SKIP_PATTERN.some(p => p.test(resolved2.href))
                ) {
                  urls.add(resolved2.origin + resolved2.pathname);
                }
              } catch { /* skip */ }
            }
          } catch { /* skip */ }
        }));
      }
    } catch { /* skip */ }
  }

  // Remove root — crawled separately
  urls.delete(siteUrl);
  urls.delete(siteUrl.replace(/\/$/, ""));
  urls.delete(siteUrl.endsWith("/") ? siteUrl.slice(0, -1) : siteUrl + "/");
  return [...urls].slice(0, maxUrls);
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE ANALYSIS — all 12 audit layers in one pass
// ─────────────────────────────────────────────────────────────────────────────
function analyzePageHTML(html, pageUrl, respHeaders = {}, responseTime = 0, statusCode = 200) {
  if (!html) return { url: pageUrl, error: "no html", issues: [] };

  const issues = [];
  const signals = { url: pageUrl, statusCode, responseTime };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const get = (regex) => regex.exec(html)?.[1]?.replace(/<[^>]+>/g, "").trim() || "";

  // ── L1: HTTP / Infrastructure ─────────────────────────────────────────────
  signals.isHttps = pageUrl.startsWith("https://");
  if (!signals.isHttps) {
    issues.push({ type: "no_ssl", severity: "p1", fix: "Install SSL certificate — HTTPS is a ranking signal since 2014" });
  }

  signals.hasHSTS = !!(respHeaders["strict-transport-security"]);
  if (signals.isHttps && !signals.hasHSTS) {
    issues.push({ type: "no_hsts", severity: "p3", fix: "Add Strict-Transport-Security header to prevent protocol downgrade attacks" });
  }

  if (responseTime > 2000) {
    issues.push({ type: "slow_ttfb", severity: "p1", detail: `${responseTime}ms TTFB`, fix: "Enable server-side caching, use CDN, upgrade hosting" });
  } else if (responseTime > 800) {
    issues.push({ type: "ttfb_warning", severity: "p2", detail: `${responseTime}ms TTFB`, fix: "Optimise server response time — target <600ms" });
  }
  signals.serverSoftware = respHeaders["server"] || null;
  signals.isCompressed = !!(respHeaders["content-encoding"]);
  if (!signals.isCompressed) {
    issues.push({ type: "no_compression", severity: "p3", fix: "Enable gzip/brotli compression — reduces transfer size 60-80%" });
  }

  // ── L2: Crawlability ──────────────────────────────────────────────────────
  const robotsContent = get(/<meta[^>]*name=["']robots["'][^>]*content=["']([^"']*)/i)
                     || get(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']robots["']/i);
  signals.robotsMeta  = robotsContent || null;
  signals.noindex     = /noindex/i.test(robotsContent);
  signals.nofollow    = /nofollow/i.test(robotsContent);
  signals.nosnippet   = /nosnippet/i.test(robotsContent);

  if (signals.noindex) {
    issues.push({ type: "noindex_detected", severity: "p1", fix: "Remove noindex — this page is invisible to Google" });
  }
  if (signals.nosnippet) {
    issues.push({ type: "nosnippet", severity: "p2", fix: "nosnippet prevents Google from showing page excerpts in search results" });
  }

  // ── L3: Indexability ──────────────────────────────────────────────────────
  signals.canonical = get(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)/i) || pageUrl;
  const isCanonicalSelf = signals.canonical === pageUrl || signals.canonical === pageUrl.replace(/\/$/, "") || signals.canonical === pageUrl + "/";
  if (!get(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)/i)) {
    issues.push({ type: "missing_canonical", severity: "p2", fix: "Add self-referencing canonical tag to prevent duplicate content issues" });
  }
  if (!isCanonicalSelf && signals.canonical && !signals.canonical.includes(new URL(pageUrl).hostname)) {
    issues.push({ type: "cross_domain_canonical", severity: "p1", fix: `Canonical points to different domain: ${signals.canonical}` });
  }

  // hreflang detection
  const hreflangTags = [...html.matchAll(/<link[^>]*rel=["']alternate["'][^>]*hreflang=["']([^"']+)["'][^>]*href=["']([^"']+)["']/gi)];
  signals.hreflangCount = hreflangTags.length;
  if (hreflangTags.length > 0) {
    const hasXDefault = hreflangTags.some(m => m[1] === "x-default");
    if (!hasXDefault) {
      issues.push({ type: "hreflang_no_xdefault", severity: "p3", fix: "Add hreflang x-default for international SEO fallback" });
    }
  }

  // Pagination
  const hasPrev = /<link[^>]*rel=["']prev["']/i.test(html);
  const hasNext = /<link[^>]*rel=["']next["']/i.test(html);
  signals.hasPaginationLinks = hasPrev || hasNext;

  // ── L4: On-Page Signals ───────────────────────────────────────────────────
  signals.title = get(/<title[^>]*>([^<]+)<\/title>/i);
  signals.titleLength = signals.title.length;

  if (!signals.title) {
    issues.push({ type: "missing_title", severity: "p1", fix: "Add unique title tag with primary keyword (50-60 chars)" });
  } else if (signals.titleLength < 10) {
    issues.push({ type: "short_title", severity: "p2", detail: `${signals.titleLength} chars`, fix: "Expand title to 50-60 characters" });
  } else if (signals.titleLength > 70) {
    issues.push({ type: "long_title", severity: "p2", detail: `${signals.titleLength} chars`, fix: "Shorten to under 60 characters — Google truncates at ~600px" });
  }

  signals.metaDescription = get(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)/i)
                          || get(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
  signals.metaLength = signals.metaDescription.length;

  if (!signals.metaDescription) {
    issues.push({ type: "missing_meta_desc", severity: "p2", fix: "Add meta description 140-155 chars — improves CTR from search results" });
  } else if (signals.metaLength > 165) {
    issues.push({ type: "long_meta_desc", severity: "p3", detail: `${signals.metaLength} chars`, fix: "Shorten meta description to 140-155 characters" });
  } else if (signals.metaLength < 70 && signals.metaDescription) {
    issues.push({ type: "short_meta_desc", severity: "p3", detail: `${signals.metaLength} chars`, fix: "Expand meta description — short descriptions get auto-generated by Google" });
  }

  // H1-H6 structure
  const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => m[1].replace(/<[^>]+>/g, "").trim());
  const h2s = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map(m => m[1].replace(/<[^>]+>/g, "").trim()).filter(h => h.length > 1);
  const h3s = [...html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/gi)].map(m => m[1].replace(/<[^>]+>/g, "").trim()).filter(h => h.length > 1);
  const h4s = [...html.matchAll(/<h4[^>]*>([\s\S]*?)<\/h4>/gi)].map(m => m[1].replace(/<[^>]+>/g, "").trim()).filter(h => h.length > 1);

  signals.h1 = h1s[0] || null;
  signals.h1Count = h1s.length;
  signals.h2s = h2s.slice(0, 20);
  signals.h2Count = h2s.length;
  signals.h3Count = h3s.length;
  signals.h4Count = h4s.length;

  if (h1s.length === 0) {
    issues.push({ type: "missing_h1", severity: "p1", fix: "Add one H1 with primary keyword — critical on-page signal" });
  } else if (h1s.length > 1) {
    issues.push({ type: "multiple_h1", severity: "p2", detail: `${h1s.length} H1s found`, fix: "Only one H1 per page — extra H1s dilute the signal" });
  }

  if (h2s.length === 0 && signals.wordCount > 300) {
    issues.push({ type: "no_h2_structure", severity: "p3", fix: "Add H2 subheadings to improve content structure and keyword coverage" });
  }

  // Heading hierarchy check (H1 → H2 → H3, no skipping)
  const allHeadings = [...html.matchAll(/<h([1-6])[^>]*>/gi)].map(m => parseInt(m[1]));
  let prevLevel = 0;
  let hierarchyBroken = false;
  for (const lvl of allHeadings) {
    if (prevLevel > 0 && lvl > prevLevel + 1) { hierarchyBroken = true; break; }
    prevLevel = lvl;
  }
  if (hierarchyBroken) {
    issues.push({ type: "broken_heading_hierarchy", severity: "p3", fix: "Heading levels must not skip (e.g., H1→H3 skipping H2 confuses screen readers and crawlers)" });
  }

  // ── L5: Content Quality ───────────────────────────────────────────────────
  const bodyText = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ").trim();
  const words = bodyText.split(/\s+/).filter(w => w.length > 2);
  signals.wordCount = words.length;

  const contentRatio = html.length > 0 ? Math.round((bodyText.length / html.length) * 100) : 0;
  signals.contentRatio = contentRatio;

  if (signals.wordCount < 150) {
    issues.push({ type: "thin_content", severity: "p1", detail: `${signals.wordCount} words`, fix: "Expand to 500+ words — thin pages may be penalised by HCU/Panda" });
  } else if (signals.wordCount < 300) {
    issues.push({ type: "low_word_count", severity: "p2", detail: `${signals.wordCount} words`, fix: "Add more depth — target 600+ for informational, 300+ for service pages" });
  }

  if (contentRatio < 10) {
    issues.push({ type: "low_content_ratio", severity: "p2", detail: `${contentRatio}% text-to-HTML`, fix: "Too much code relative to content — simplify markup or add more content" });
  }

  // Keyword stuffing proxy — density of top word
  const wordFreq = {};
  for (const w of words) { const k = w.toLowerCase(); wordFreq[k] = (wordFreq[k] || 0) + 1; }
  const topWord = Object.entries(wordFreq).sort((a, b) => b[1] - a[1])[0];
  if (topWord && signals.wordCount > 100 && (topWord[1] / signals.wordCount) > 0.07) {
    issues.push({ type: "keyword_stuffing_risk", severity: "p2", detail: `"${topWord[0]}" appears ${topWord[1]} times (${Math.round(topWord[1]/signals.wordCount*100)}%)`, fix: "Keyword density above 7% may trigger SpamBrain — use natural language variation" });
  }

  // FAQ / Q&A content detection (AEO signal)
  signals.hasFAQ   = /<[^>]*(?:faq|frequently.asked|question|answer)[^>]*>/i.test(html) || /frequently asked questions/i.test(html);
  signals.hasMedia = /<(?:video|iframe|audio|embed)[^>]*>/i.test(html);

  // Content freshness
  let publishedDate = null;
  const jsonLdBlocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const block of jsonLdBlocks) {
    try {
      const inner = block[0].replace(/<script[^>]*>/, "").replace(/<\/script>/i, "");
      const jld = JSON.parse(inner);
      const d = jld.dateModified || jld.datePublished;
      if (d) { publishedDate = d; break; }
    } catch { /* skip */ }
  }
  if (!publishedDate) {
    const metaDate = html.match(/<meta[^>]*(?:name|property)=["'](?:article:modified_time|article:published_time|date|og:updated_time)["'][^>]*content=["']([^"']*)["']/i);
    if (metaDate) publishedDate = metaDate[1];
  }
  if (!publishedDate) {
    const urlYear = pageUrl.match(/\/(20\d{2})\//);
    if (urlYear) publishedDate = urlYear[1] + "-01-01";
  }
  if (!publishedDate && respHeaders["last-modified"]) {
    publishedDate = respHeaders["last-modified"];
  }

  signals.publishedDate = publishedDate || null;
  if (publishedDate) {
    const ageMs = Date.now() - new Date(publishedDate).getTime();
    const ageYears = ageMs / (1000 * 60 * 60 * 24 * 365);
    signals.contentAgeYears = Math.round(ageYears * 10) / 10;
    signals.freshnessSignal = ageYears < 0.5 ? "fresh" : ageYears < 1 ? "recent" : ageYears < 2 ? "aging" : "stale";
    if (ageYears > 2 && ageYears < 50) {
      issues.push({ type: "stale_content", severity: "p3", detail: `~${Math.round(ageYears)} year(s) old`, fix: "Refresh content with updated stats, dates, and new insights — Google favours recent content" });
    }
  }

  // ── L6: Internal Links ────────────────────────────────────────────────────
  const internalLinkMatches = [...html.matchAll(/<a[^>]+href=["']([^"'\s]+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  signals.internalLinkCount = 0;
  signals.externalLinkCount = 0;
  signals.exactMatchAnchors = 0;
  const anchors = [];
  let domain;
  try { domain = new URL(pageUrl).hostname.replace(/^www\./, ""); } catch { domain = ""; }

  for (const m of internalLinkMatches) {
    const href = m[1];
    const anchor = m[2].replace(/<[^>]+>/g, "").trim();
    if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    try {
      const u = new URL(href, pageUrl);
      const linkDomain = u.hostname.replace(/^www\./, "");
      if (linkDomain === domain) {
        signals.internalLinkCount++;
        if (anchor) anchors.push(anchor.toLowerCase());
      } else {
        signals.externalLinkCount++;
        const hasNofollow = m[0].includes('rel="nofollow"') || m[0].includes("rel='nofollow'");
        if (!hasNofollow && linkDomain.length > 0) {
          // External followed links — fine unless spammy
        }
      }
    } catch { /* skip */ }
  }

  // Check for anchor text diversity
  if (anchors.length > 5) {
    const uniqueAnchors = new Set(anchors);
    if (uniqueAnchors.size < anchors.length * 0.4) {
      issues.push({ type: "low_anchor_diversity", severity: "p3", fix: "Use varied anchor text for internal links — over-optimised anchors are a ranking risk" });
    }
  }

  if (signals.internalLinkCount === 0 && pageUrl !== "") {
    issues.push({ type: "no_internal_links", severity: "p2", fix: "Add internal links to related pages — critical for link equity distribution and crawlability" });
  }

  // External links without nofollow to low-quality domains
  const nofollowLinks = (html.match(/rel=["']nofollow["']/gi) || []).length;
  signals.nofollowExternalLinks = nofollowLinks;

  // ── L7: Media & Assets ────────────────────────────────────────────────────
  const imgMatches = [...html.matchAll(/<img[^>]*>/gi)];
  const imgsNoAlt  = imgMatches.filter(m => !m[0].match(/alt=["'][^"']+["']/i));
  const nonWebpImgs = imgMatches.filter(m => {
    const src = (m[0].match(/src=["']([^"']*)["']/i) || [])[1]?.toLowerCase() || "";
    return /\.(jpg|jpeg|png|gif|bmp)(\?|$)/.test(src) && !src.startsWith("data:");
  });
  const missingDimsImgs = imgMatches.filter(m => !m[0].match(/width=/i) || !m[0].match(/height=/i));
  const lazyLoadedImgs  = imgMatches.filter(m => m[0].includes('loading="lazy"') || m[0].includes("loading='lazy'"));

  signals.imgTotal        = imgMatches.length;
  signals.imgMissingAlt   = imgsNoAlt.length;
  signals.imgNonWebp      = nonWebpImgs.length;
  signals.imgMissingDims  = missingDimsImgs.length;
  signals.imgLazyLoaded   = lazyLoadedImgs.length;

  if (imgsNoAlt.length > 5) {
    issues.push({ type: "missing_alt_text", severity: "p2", detail: `${imgsNoAlt.length}/${imgMatches.length} images`, fix: "Add descriptive alt text to all images — required for accessibility (WCAG 2.1) and Google Images ranking" });
  } else if (imgsNoAlt.length > 0) {
    issues.push({ type: "missing_alt_text", severity: "p3", detail: `${imgsNoAlt.length} image(s)`, fix: "Add alt text to remaining images" });
  }

  if (nonWebpImgs.length > 3) {
    issues.push({ type: "non_webp_images", severity: "p3", detail: `${nonWebpImgs.length} JPG/PNG images`, fix: "Convert to WebP format — 25-35% smaller, improves LCP score" });
  }

  if (missingDimsImgs.length > 5) {
    issues.push({ type: "missing_image_dimensions", severity: "p2", detail: `${missingDimsImgs.length} images without width/height`, fix: "Add width and height attributes — prevents Cumulative Layout Shift (CLS)" });
  }

  if (imgMatches.length > 5 && lazyLoadedImgs.length < imgMatches.length * 0.5) {
    issues.push({ type: "images_not_lazy_loaded", severity: "p3", fix: "Add loading='lazy' to below-fold images — reduces initial page load and improves LCP" });
  }

  // ── L8: Core Web Vitals Proxies (2025 — INP replaces FID) ────────────────
  const scriptCount = (html.match(/<script[^>]*src=["']/gi) || []).length;
  const cssCount    = (html.match(/<link[^>]*rel=["']stylesheet["']/gi) || []).length;
  const totalAssets = scriptCount + cssCount + imgMatches.length;
  const renderBlockingCSS = (html.match(/<link[^>]*(?!media=["']print)[^>]*rel=["']stylesheet["'][^>]*>/gi) || []).length;
  const renderBlockingJS  = (html.match(/<script(?![^>]*(?:async|defer|type=["']module))[^>]*src=["'][^"']+["']/gi) || []).length;
  const hasServiceWorker  = /ServiceWorker|service.worker/i.test(html);

  signals.scriptCount       = scriptCount;
  signals.cssCount          = cssCount;
  signals.totalAssets       = totalAssets;
  signals.renderBlockingCSS = renderBlockingCSS;
  signals.renderBlockingJS  = renderBlockingJS;
  signals.hasServiceWorker  = hasServiceWorker;

  if (renderBlockingJS > 2) {
    issues.push({ type: "render_blocking_js", severity: "p2", detail: `${renderBlockingJS} render-blocking scripts`, fix: "Add async or defer to non-critical JS — reduces LCP and INP (Google's 2024 CWV metric)" });
  }
  if (renderBlockingCSS > 2) {
    issues.push({ type: "render_blocking_css", severity: "p2", detail: `${renderBlockingCSS} render-blocking stylesheets`, fix: "Inline critical CSS, load non-critical CSS asynchronously" });
  }
  if (totalAssets > 60) {
    issues.push({ type: "too_many_requests", severity: "p1", detail: `${totalAssets} resources`, fix: "Bundle CSS/JS, use sprite sheets, limit third-party scripts — target <30 requests" });
  } else if (totalAssets > 30) {
    issues.push({ type: "high_request_count", severity: "p2", detail: `${totalAssets} resources`, fix: "Combine files and lazy-load non-critical resources" });
  }

  // INP signal proxy — event listener density
  const inlineEventHandlers = (html.match(/on(?:click|keydown|keyup|input|change|touchstart)=/gi) || []).length;
  signals.inlineEventHandlers = inlineEventHandlers;
  if (inlineEventHandlers > 20) {
    issues.push({ type: "inp_risk", severity: "p3", detail: `${inlineEventHandlers} inline event handlers`, fix: "Replace inline event handlers with addEventListener — improves INP (Interaction to Next Paint, Google CWV since March 2024)" });
  }

  // ── L9: Schema / Structured Data ─────────────────────────────────────────
  const schemaBlocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const schemaTypes = [];
  const schemaIssues = [];
  let hasValidJSONLD = false;

  for (const block of schemaBlocks) {
    try {
      const inner = block[0].replace(/<script[^>]*>/, "").replace(/<\/script>/i, "");
      const jld = JSON.parse(inner);
      hasValidJSONLD = true;
      const types = Array.isArray(jld) ? jld.map(j => j["@type"]).filter(Boolean) : [jld["@type"]].filter(Boolean);
      schemaTypes.push(...types.flat());

      // Check for deprecated types (deprecated Jan 2026)
      for (const t of types.flat()) {
        if (DEPRECATED_SCHEMA_TYPES.has(t)) {
          schemaIssues.push(`Deprecated schema type: ${t} (removed January 2026)`);
        }
      }
    } catch (e) {
      schemaIssues.push("Invalid JSON-LD: " + e.message.slice(0, 80));
    }
  }

  // Check for Microdata / RDFa (less preferred per 2025 guidelines)
  const hasMicrodata = /itemtype=["'][^"']*schema\.org/i.test(html);
  const hasRDFa      = /property=["'](?:og:|dc:|schema:)/i.test(html);

  signals.schemaTypes    = [...new Set(schemaTypes)];
  signals.schemaCount    = schemaBlocks.length;
  signals.hasValidJSONLD = hasValidJSONLD;
  signals.hasMicrodata   = hasMicrodata;

  if (schemaTypes.length === 0 && !hasMicrodata) {
    issues.push({ type: "missing_schema", severity: "p2", fix: "Add JSON-LD structured data — required for rich results (FAQPage, HowTo, Review, etc.)" });
  }
  if (hasMicrodata && !hasValidJSONLD) {
    issues.push({ type: "microdata_not_jsonld", severity: "p3", fix: "Migrate Microdata to JSON-LD — Google prefers JSON-LD for structured data (easier to maintain, more reliable)" });
  }
  if (schemaIssues.length > 0) {
    issues.push({ type: "schema_errors", severity: "p2", detail: schemaIssues[0], fix: "Fix schema markup errors — invalid structured data won't generate rich results" });
  }

  // Check FAQPage schema specifically (high-value for AI snippets)
  const hasFAQSchema     = schemaTypes.includes("FAQPage");
  const hasHowToSchema   = schemaTypes.includes("HowTo");
  const hasReviewSchema  = schemaTypes.includes("Review") || schemaTypes.includes("AggregateRating");
  const hasProductSchema = schemaTypes.includes("Product");
  const hasLocalSchema   = schemaTypes.includes("LocalBusiness") || schemaTypes.includes("Organization");

  signals.hasFAQSchema    = hasFAQSchema;
  signals.hasHowToSchema  = hasHowToSchema;
  signals.hasReviewSchema = hasReviewSchema;
  signals.hasLocalSchema  = hasLocalSchema;

  if (!hasFAQSchema && signals.hasFAQ) {
    issues.push({ type: "missing_faq_schema", severity: "p2", fix: "Add FAQPage JSON-LD — FAQ content without schema loses AI Overview and rich snippet eligibility" });
  }

  // BreadcrumbList check
  const hasBreadcrumb = schemaTypes.includes("BreadcrumbList") || /breadcrumb/i.test(html);
  signals.hasBreadcrumb = hasBreadcrumb;
  if (!hasBreadcrumb) {
    issues.push({ type: "missing_breadcrumb", severity: "p3", fix: "Add BreadcrumbList schema — helps Google understand site hierarchy and enables breadcrumb rich results" });
  }

  // ── L10: E-E-A-T Signals ──────────────────────────────────────────────────
  const eeat = {
    hasAboutPage:         /href=["'][^"']*\/about(?:-us|-team|-company|-us\/)?["']/i.test(html),
    hasContactPage:       /href=["'][^"']*\/contact(?:-us)?["']/i.test(html),
    hasPrivacyPolicy:     /href=["'][^"']*\/privacy(?:-policy)?["']/i.test(html),
    hasTermsPage:         /href=["'][^"']*\/terms(?:-of-service|-and-conditions|-of-use)?["']/i.test(html),
    hasAuthorBio:         /<[^>]*class=["'][^"']*(?:author|byline|written-by|post-author)[^"']*["']/i.test(html),
    hasDatePublished:     !!(signals.publishedDate),
    hasSchemaOrg:         /"@context"\s*:\s*"https?:\/\/schema\.org"/i.test(html),
    hasSocialProof:       /<[^>]*class=["'][^"']*(?:testimonial|review|rating|award)[^"']*["']/i.test(html),
    hasSocialLinks:       /href=["'][^"']*(?:linkedin|twitter|facebook|instagram|youtube)\.com[^"']*/i.test(html),
    hasCredentials:       /<[^>]*class=["'][^"']*(?:credential|certif|award|partner|accredit)[^"']*["']/i.test(html),
    hasBreadcrumb:        hasBreadcrumb,
    hasExpertLanguage:    /(?:years of experience|certified|accredited|award-winning|licensed|registered)/i.test(html),
  };

  eeat.score    = Object.values(eeat).filter(Boolean).length;
  eeat.maxScore = Object.keys(eeat).length;
  signals.eeat  = eeat;

  const missingEEAT = [];
  if (!eeat.hasAboutPage)     missingEEAT.push("About page");
  if (!eeat.hasContactPage)   missingEEAT.push("Contact page");
  if (!eeat.hasPrivacyPolicy) missingEEAT.push("Privacy Policy");
  if (!eeat.hasSchemaOrg)     missingEEAT.push("Schema.org markup");

  if (missingEEAT.length >= 3) {
    issues.push({ type: "weak_eeat", severity: "p2", detail: `${eeat.score}/${eeat.maxScore} E-E-A-T signals. Missing: ${missingEEAT.join(", ")}`, fix: "E-E-A-T is Google's quality rater framework — add About, Contact, Privacy pages and author bios" });
  } else if (missingEEAT.length > 0) {
    issues.push({ type: "eeat_gaps", severity: "p3", detail: `Missing: ${missingEEAT.join(", ")}`, fix: "Strengthen trust signals — especially for YMYL (health, finance, legal) pages" });
  }

  // ── L11: AEO / GEO / AI Readiness ────────────────────────────────────────
  const aeo = {
    hasFAQSchema:          hasFAQSchema,
    hasHowToSchema:        hasHowToSchema,
    hasDirectAnswers:      AEO_ANSWER_PATTERNS.some(p => p.test(bodyText.slice(0, 2000))),
    hasConversationalText: /(?:you can|you should|here's how|the answer is|in short|to summarize)/i.test(bodyText),
    hasDefinitionPattern:  /(?:is defined as|refers to|means that|is a type of|is an example of)/i.test(bodyText),
    hasListFormat:         /<[ou]l[^>]*>/i.test(html),
    hasTableData:          /<table[^>]*>/i.test(html),
    hasVideoContent:       /<(?:video|iframe[^>]*youtube|iframe[^>]*vimeo)[^>]*>/i.test(html),
    hasEntityMarkup:       /"@type"\s*:\s*"(?:Person|Organization|Place|Product|Event)"/i.test(html),
    hasAuthorSchema:       /"@type"\s*:\s*"(?:Person|Author)"/i.test(html),
    hasDateModified:       /"dateModified"/i.test(html),
    hasCitationLinks:      (html.match(/<a[^>]*href=["']https?:\/\/(?!.*(?:the|this|click|here))[^"']*["'][^>]*>/gi) || []).length > 3,
  };

  aeo.score    = Object.values(aeo).filter(Boolean).length;
  aeo.maxScore = Object.keys(aeo).length;
  signals.aeo  = aeo;

  if (!aeo.hasFAQSchema && !aeo.hasHowToSchema) {
    issues.push({ type: "missing_aeo_schema", severity: "p2", fix: "Add FAQPage or HowTo JSON-LD — essential for AI Overview (Google SGE), Bing Copilot, and ChatGPT citation eligibility" });
  }

  if (!aeo.hasDirectAnswers) {
    issues.push({ type: "no_direct_answers", severity: "p3", fix: "Structure content with direct answer paragraphs early — AI engines cite pages that answer questions concisely in the first 40-60 words" });
  }

  if (!aeo.hasListFormat && signals.wordCount > 500) {
    issues.push({ type: "no_list_format", severity: "p3", fix: "Add bullet lists or numbered steps — AI engines prefer structured formats for citation extraction" });
  }

  // GEO signals (Generative Engine Optimization)
  const geo = {
    hasEntityName:     signals.hasLocalSchema || hasValidJSONLD,
    hasNAPInfo:        /(?:\+\d{1,3}[\s-]?\d{3}[\s-]?\d{3}|\d{3}[\s-]\d{3}[\s-]\d{4}|@\w+\.\w+)/i.test(bodyText),
    hasCitationReady:  hasFAQSchema || hasHowToSchema || schemaTypes.includes("Article"),
    hasTopicalDepth:   signals.wordCount > 800,
    hasMultimediaRich: signals.hasMedia,
    hasRecentContent:  signals.freshnessSignal === "fresh" || signals.freshnessSignal === "recent",
  };
  geo.score    = Object.values(geo).filter(Boolean).length;
  geo.maxScore = Object.keys(geo).length;
  signals.geo  = geo;

  // AI content risk signals (SpamBrain 2024)
  const aiRisk = {
    hasRepetitiveStructure: (signals.h2Count > 8 && signals.wordCount / Math.max(1, signals.h2Count) < 60),
    hasGenericHeadings: h2s.some(h => /^(?:introduction|conclusion|overview|summary|benefits|why choose|what is)/i.test(h.trim())),
    lacksCitations: signals.wordCount > 800 && !aeo.hasCitationLinks,
    isBoilerplate: contentRatio < 15 && signals.wordCount < 400,
    hasExcessiveKeywords: topWord && signals.wordCount > 200 && (topWord[1] / signals.wordCount) > 0.06,
  };
  signals.aiContentRisk = aiRisk;
  const aiRiskCount = Object.values(aiRisk).filter(Boolean).length;
  if (aiRiskCount >= 3) {
    issues.push({ type: "ai_content_risk", severity: "p2", detail: `${aiRiskCount} SpamBrain risk signals detected`, fix: "Content shows AI-generation patterns — add original insights, citations, author expertise, and varied structure" });
  } else if (aiRiskCount === 2) {
    issues.push({ type: "ai_content_signals", severity: "p3", fix: "Strengthen content originality — add data, citations, first-person expertise, and unique perspectives" });
  }

  // ── L12: Security Headers ─────────────────────────────────────────────────
  signals.securityHeaders = {};
  for (const h of SEC_HEADERS) {
    signals.securityHeaders[h] = respHeaders[h] || null;
  }

  const missingSecHeaders = SEC_HEADERS.filter(h => !respHeaders[h]);
  if (missingSecHeaders.includes("x-content-type-options")) {
    issues.push({ type: "missing_xcto_header", severity: "p3", fix: "Add X-Content-Type-Options: nosniff — prevents MIME-type sniffing attacks" });
  }
  if (missingSecHeaders.includes("x-frame-options") && !respHeaders["content-security-policy"]) {
    issues.push({ type: "missing_xfo_header", severity: "p3", fix: "Add X-Frame-Options: SAMEORIGIN — prevents clickjacking" });
  }

  // Mixed content check
  const mixedContent = signals.isHttps && /src=["']http:\/\//i.test(html);
  signals.mixedContent = mixedContent;
  if (mixedContent) {
    issues.push({ type: "mixed_content", severity: "p1", fix: "All resources must be loaded over HTTPS — HTTP resources on HTTPS pages block page rendering" });
  }

  // ── Mobile-first 2024 checks ──────────────────────────────────────────────
  signals.hasViewport = /<meta[^>]*name=["']viewport["']/i.test(html);
  const viewportContent = get(/<meta[^>]*name=["']viewport["'][^>]*content=["']([^"']*)/i);
  const hasResponsiveViewport = /width=device-width/i.test(viewportContent);
  const hasUserScalableNo     = /user-scalable=no/i.test(viewportContent);

  if (!signals.hasViewport) {
    issues.push({ type: "no_viewport", severity: "p1", fix: "Add viewport meta tag — required for mobile-first indexing (100% deployed July 2024)" });
  } else if (!hasResponsiveViewport) {
    issues.push({ type: "fixed_viewport", severity: "p2", fix: "Set width=device-width in viewport — fixed-width viewports hurt mobile UX and rankings" });
  }
  if (hasUserScalableNo) {
    issues.push({ type: "zoom_disabled", severity: "p3", fix: "Don't disable user scaling — it's an accessibility violation and hurts mobile UX scores" });
  }

  // Mobile CSS media queries presence
  const hasMobileCSS = MOBILE_BREAKPOINTS.test(html);
  signals.hasMobileCSS = hasMobileCSS;
  if (!hasMobileCSS && cssCount > 0) {
    issues.push({ type: "no_mobile_breakpoints", severity: "p2", fix: "No responsive CSS breakpoints detected — mobile-first indexing means Google ranks the mobile version" });
  }

  // Open Graph
  const ogTags = {};
  for (const m of html.matchAll(/<meta[^>]*property=["']og:([^"']*)["'][^>]*content=["']([^"']*)/gi)) ogTags[m[1]] = m[2];
  for (const m of html.matchAll(/<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:([^"']*)/gi)) ogTags[m[2]] = m[1];
  signals.ogTags = ogTags;
  const missingOG = ["title", "description", "image"].filter(t => !ogTags[t]);
  if (missingOG.length > 0) {
    issues.push({ type: "missing_og_tags", severity: "p2", detail: `og:${missingOG.join(", og:")} missing`, fix: "Add Open Graph tags — controls preview when shared on social media and used by some AI crawlers" });
  }

  // Twitter Card
  const hasTwitterCard = /<meta[^>]*name=["']twitter:card["']/i.test(html);
  signals.hasTwitterCard = hasTwitterCard;
  if (!hasTwitterCard) {
    issues.push({ type: "missing_twitter_card", severity: "p3", fix: "Add Twitter Card meta tags for better social sharing previews" });
  }

  // ── SERP Preview Data ─────────────────────────────────────────────────────
  signals.serpPreview = {
    title:          signals.title || "(No title)",
    titleLength:    signals.titleLength,
    description:    signals.metaDescription || "(No description)",
    descLength:     signals.metaLength,
    url:            pageUrl,
    titleTruncated: signals.titleLength > 60,
    descTruncated:  signals.metaLength > 155,
  };

  // ── Google 2024 Spam Policy Checks ───────────────────────────────────────
  // March 2024 core update targeted these specifically:
  // 1. Scaled content abuse (mass AI content without added value)
  // 2. Site reputation abuse (parasite SEO)
  // 3. Expired domain abuse
  // 4. Cloaking
  // 5. Doorway pages

  const bodyText = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  // Doorway page signals — thin page that exists only to funnel users elsewhere
  const externalLinksCount  = (html.match(/<a[^>]+href=["']https?:\/\//gi) || []).length;
  const internalLinksCount  = (html.match(/<a[^>]+href=["']\/[^"']/gi) || []).length;
  const isDoorwayPage = (
    signals.wordCount < 200 &&
    externalLinksCount > 5 &&
    externalLinksCount > internalLinksCount * 3
  );
  if (isDoorwayPage) {
    issues.push({
      type: "doorway_page",
      severity: "p1",
      fix: "Page appears to be a doorway — thin content with many outbound links. Google's 2024 spam policy penalises pages that exist only to funnel users. Add substantial original content.",
    });
  }

  // Scaled content abuse — page reads like templated bulk content
  const templatePhrases = [
    /\b(?:are you looking for|looking for a|find the best|best \w+ in \w+|top \d+ \w+ in \w+)\b/i,
    /\b(?:this article will|in this article|this blog post|in this post we will discuss)\b/i,
    /\b(?:furthermore|moreover|in conclusion|to summarize|as mentioned above)\b/i,
    /\b(?:feel free to|don't hesitate to|please note that|it's worth noting)\b/i,
  ];
  const templateHits = templatePhrases.filter(p => p.test(bodyText)).length;
  if (templateHits >= 3 && signals.wordCount < 600) {
    issues.push({
      type: "scaled_content_abuse",
      severity: "p2",
      detail: `${templateHits} templated content phrases detected`,
      fix: "Page uses formulaic/templated language that SpamBrain flags as scaled AI content. Rewrite with original observations, specific data, and unique expert perspective.",
    });
  }

  // Parasite SEO / Site reputation abuse — off-topic subfolders or subdomains
  // Detects URLs that contain coupon/deal/promo patterns on non-retail sites
  const parasitePattern = /\/(coupon|coupons|promo|deals?|voucher|discount|affiliate|casino|gambling|loan|payday|forex|crypto)\//i;
  if (parasitePattern.test(pageUrl)) {
    issues.push({
      type: "site_reputation_abuse",
      severity: "p1",
      fix: "URL path suggests third-party content hosted on this domain. Google's March 2024 update explicitly targets 'parasite SEO'. Remove or noindex these sections.",
    });
  }

  // Hidden text / cloaking signal — text with display:none containing keywords
  const hiddenTextMatch = html.match(/display\s*:\s*none[^}]*}[^<]*<[^>]*>([\w\s,]{30,})<\/[^>]*>/i);
  if (hiddenTextMatch && hiddenTextMatch[1]?.split(/\s+/).length > 5) {
    issues.push({
      type: "hidden_text",
      severity: "p1",
      fix: "Hidden text detected (display:none on keyword-rich content). Google treats this as cloaking — a manual action risk. Remove all hidden text.",
    });
  }

  // Intrusive interstitials (hurt mobile-first rankings since 2017, re-emphasised 2024)
  const hasIntrusiveInterstitial = /(?:popup|modal|overlay|interstitial)[^"']*(?:full.?screen|100vw|100vh)/i.test(html);
  if (hasIntrusiveInterstitial) {
    issues.push({
      type: "intrusive_interstitial",
      severity: "p2",
      fix: "Full-screen popup/modal detected. Google demotes pages with intrusive interstitials on mobile — use smaller, dismissible banners instead.",
    });
  }

  signals.spamPolicyChecks = {
    isDoorwayPage,
    templateHits,
    hasHiddenText: !!hiddenTextMatch,
    hasIntrusiveInterstitial,
    isPossibleParasite: parasitePattern.test(pageUrl),
  };

  // ── Overall Page Score ────────────────────────────────────────────────────
  const p1Count = issues.filter(i => i.severity === "p1").length;
  const p2Count = issues.filter(i => i.severity === "p2").length;
  const p3Count = issues.filter(i => i.severity === "p3").length;
  signals.issueCount = { p1: p1Count, p2: p2Count, p3: p3Count, total: issues.length };
  signals.pageScore  = Math.max(5, Math.min(100, 100 - p1Count * 20 - p2Count * 8 - p3Count * 3));

  return { ...signals, issues };
}

// ─────────────────────────────────────────────────────────────────────────────
// SITEMAP AUDIT — additional signals from XML
// ─────────────────────────────────────────────────────────────────────────────
async function auditSitemap(siteUrl) {
  const result = {
    exists: false, urlCount: 0, hasImages: false,
    hasNews: false, hasVideo: false, hasLastmod: false,
    issues: [],
  };

  try {
    const r = await fetch(new URL("/sitemap.xml", siteUrl).href, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) {
      result.issues.push({ type: "no_sitemap", severity: "p2", fix: "Create XML sitemap and submit to Google Search Console — essential for indexability" });
      return result;
    }

    const xml = await r.text();
    result.exists   = true;
    result.urlCount = (xml.match(/<loc>/gi) || []).length;
    result.hasImages  = /<image:image>/i.test(xml);
    result.hasNews    = /<news:news>/i.test(xml);
    result.hasVideo   = /<video:video>/i.test(xml);
    result.hasLastmod = /<lastmod>/i.test(xml);
    result.isIndex    = xml.includes("<sitemapindex");

    if (!result.hasLastmod) {
      result.issues.push({ type: "sitemap_no_lastmod", severity: "p3", fix: "Add <lastmod> to sitemap entries — helps Google prioritise crawling recently updated pages" });
    }
    if (result.urlCount > 50000) {
      result.issues.push({ type: "sitemap_too_large", severity: "p2", detail: `${result.urlCount} URLs`, fix: "Split into sitemap index — Google limits 50,000 URLs per sitemap file" });
    }
  } catch (e) {
    result.issues.push({ type: "sitemap_error", severity: "p3", fix: `Sitemap fetch failed: ${e.message.slice(0, 80)}` });
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// ROBOTS.TXT AUDIT
// ─────────────────────────────────────────────────────────────────────────────
async function auditRobots(siteUrl) {
  const result = { exists: false, blocksAll: false, hasSitemapDirective: false, content: "", issues: [] };

  try {
    const r = await fetch(new URL("/robots.txt", siteUrl).href, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) {
      result.issues.push({ type: "no_robots_txt", severity: "p3", fix: "Create robots.txt to guide crawler access — missing file means no crawl control" });
      return result;
    }

    const text = await r.text();
    result.exists  = true;
    result.content = text.slice(0, 1000);

    const disallowLines = [...text.matchAll(/^Disallow:\s*(.*)$/gim)].map(m => m[1].trim());
    result.blocksAll = disallowLines.some(l => l === "/");

    const sitemapLine = text.match(/^Sitemap:\s*(.+)$/im);
    result.hasSitemapDirective = !!sitemapLine;
    result.sitemapUrl = sitemapLine?.[1]?.trim() || null;

    if (result.blocksAll) {
      result.issues.push({ type: "robots_blocks_all", severity: "p1", fix: "robots.txt has 'Disallow: /' — entire site blocked from Google. Remove immediately." });
    }

    // Check if key pages are blocked
    const keyPaths = ["/services", "/products", "/blog", "/about", "/contact"];
    const blockedKey = keyPaths.filter(p => disallowLines.some(d => d === p || p.startsWith(d)));
    if (blockedKey.length > 0) {
      result.issues.push({ type: "robots_blocks_key_pages", severity: "p1", detail: `Blocked: ${blockedKey.join(", ")}`, fix: "Key pages are blocked from crawling — remove these Disallow rules" });
    }

    if (!result.hasSitemapDirective) {
      result.issues.push({ type: "robots_no_sitemap", severity: "p3", fix: "Add 'Sitemap: https://yourdomain.com/sitemap.xml' to robots.txt for faster discovery" });
    }

    // Check for crawl-delay abuse
    const crawlDelay = text.match(/^Crawl-delay:\s*(\d+)/im);
    if (crawlDelay && parseInt(crawlDelay[1]) > 10) {
      result.issues.push({ type: "excessive_crawl_delay", severity: "p2", detail: `Crawl-delay: ${crawlDelay[1]}s`, fix: "Crawl-delay > 10s significantly slows Google's crawl budget — lower or remove" });
    }
  } catch {
    result.issues.push({ type: "robots_fetch_error", severity: "p3", fix: "Could not fetch robots.txt — ensure it's accessible at /robots.txt" });
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// REDIRECT CHAIN AUDIT
// ─────────────────────────────────────────────────────────────────────────────
async function auditRedirects(siteUrl) {
  const result = { depth: 0, chain: [], hasWWWIssue: false, hasMixedProtocol: false, issues: [] };

  try {
    let current = siteUrl;
    for (let hop = 0; hop < 8; hop++) {
      const r = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(5000), headers: { "User-Agent": UA_POOL[0] } });
      if (r.status >= 300 && r.status < 400) {
        const loc = r.headers.get("location");
        if (!loc) break;
        const next = new URL(loc, current).href;
        result.chain.push({ from: current, to: next, status: r.status });
        current = next;
        result.depth++;
      } else break;
    }

    if (result.depth >= 3) {
      result.issues.push({ type: "redirect_chain", severity: "p2", detail: `${result.depth}-hop chain`, fix: "Shorten to single 301 redirect — each hop loses ~15% link equity" });
    }

    // Check www vs non-www consistency
    const finalUrl = result.chain.length > 0 ? result.chain[result.chain.length - 1].to : siteUrl;
    const origWww  = siteUrl.includes("://www.");
    const finalWww = finalUrl.includes("://www.");
    result.hasWWWIssue = origWww !== finalWww;

    // Check HTTP→HTTPS correctness
    const firstHop = result.chain[0];
    if (firstHop && firstHop.from.startsWith("http://") && !firstHop.to.startsWith("https://")) {
      result.issues.push({ type: "no_http_to_https_redirect", severity: "p1", fix: "HTTP should redirect to HTTPS — currently no SSL redirect detected" });
    }
  } catch { /* non-blocking */ }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// FULL SITE SMART AUDIT — main exported function
// ─────────────────────────────────────────────────────────────────────────────
async function smartAudit(siteUrl, options = {}) {
  const {
    maxPages       = 60,
    concurrency    = 4,
    delayMs        = 250,
    gscPages       = null,
    onProgress     = null,
    clientId       = null,
    maxTotalTimeMs = 9 * 60 * 1000,  // 9-min hard cap — A2 has 12 min in A0
  } = options;

  const auditStart = Date.now();
  const isTimedOut = () => Date.now() - auditStart > maxTotalTimeMs;

  // ── Phase 1: Infrastructure checks (parallel) ─────────────────────────────
  const [sitemapResult, robotsResult, redirectResult] = await Promise.all([
    auditSitemap(siteUrl),
    auditRobots(siteUrl),
    auditRedirects(siteUrl),
  ]);

  // ── Phase 2: URL Discovery ─────────────────────────────────────────────────
  const discoveredUrls = await discoverUrls(siteUrl, { maxUrls: maxPages * 3, gscPages });
  const urlsToAudit   = [siteUrl, ...discoveredUrls].slice(0, maxPages);

  if (onProgress) onProgress(0, urlsToAudit.length, "discovered");

  // ── Phase 3: Concurrent page auditing ─────────────────────────────────────
  const pageResults  = [];
  const brokenPages  = [];
  const internalLinkMap = {};
  let crawled = 0;

  // Process in batches of `concurrency`
  for (let i = 0; i < urlsToAudit.length; i += concurrency) {
    if (isTimedOut()) {
      console.warn(`[smartCrawler] 9-min timeout — stopping at ${crawled}/${urlsToAudit.length} pages`);
      break;
    }
    const batch = urlsToAudit.slice(i, i + concurrency);

    const batchResults = await Promise.allSettled(
      batch.map(async (url) => {
        const t0  = Date.now();
        const { html, status, finalUrl, headers, blocked } = await smartFetch(url, 12000, { retries: 1 });
        const responseTime = Date.now() - t0;

        if (!html) {
          if (status >= 400) brokenPages.push({ url, status });
          return { url, status, broken: true, blocked: !!blocked };
        }

        const page = analyzePageHTML(html, finalUrl || url, headers, responseTime, status);

        // Track internal links for orphan detection
        if (!internalLinkMap[url]) internalLinkMap[url] = { inbound: 0, linkedFrom: [] };
        const linkRe = /<a[^>]+href=["']([^"'\s]+)["'][^>]*>/gi;
        let lm;
        let domain2;
        try { domain2 = new URL(url).hostname.replace(/^www\./, ""); } catch { domain2 = ""; }
        while ((lm = linkRe.exec(html)) !== null) {
          try {
            const linked = new URL(lm[1], url);
            const ld = linked.hostname.replace(/^www\./, "");
            if (ld === domain2) {
              const clean = linked.href.split("?")[0].split("#")[0];
              if (!internalLinkMap[clean]) internalLinkMap[clean] = { inbound: 0, linkedFrom: [] };
              internalLinkMap[clean].inbound++;
              if (internalLinkMap[clean].linkedFrom.length < 3) internalLinkMap[clean].linkedFrom.push(url);
            }
          } catch { /* skip */ }
        }

        crawled++;
        if (onProgress) onProgress(crawled, urlsToAudit.length, "crawling");

        // Firestore progress update (non-blocking)
        if (clientId && crawled % 10 === 0) {
          try {
            const { db: fdb } = require("../config/firebase");
            fdb.collection("clients").doc(clientId).update({
              crawlProgress: { crawled, total: urlsToAudit.length, pct: Math.round(crawled / urlsToAudit.length * 100) },
            }).catch(() => {});
          } catch { /* skip */ }
        }

        return page;
      })
    );

    for (const r of batchResults) {
      if (r.status === "fulfilled" && r.value && !r.value.broken) {
        pageResults.push(r.value);
      }
    }

    if (delayMs > 0 && i + concurrency < urlsToAudit.length) {
      await sleep(delayMs);
    }
  }

  // ── Phase 4: Cross-page analysis ─────────────────────────────────────────
  // Orphan detection
  const orphanPages = pageResults
    .filter(p => p.url !== siteUrl && (internalLinkMap[p.url]?.inbound || 0) === 0)
    .map(p => p.url)
    .slice(0, 50);

  // Duplicate title detection
  const titleMap = {};
  for (const p of pageResults) {
    if (p.title) {
      const t = p.title.toLowerCase().trim();
      if (!titleMap[t]) titleMap[t] = [];
      titleMap[t].push(p.url);
    }
  }
  const dupTitles = Object.entries(titleMap).filter(([, u]) => u.length > 1).map(([title, urls]) => ({ title: title.slice(0, 80), urls }));

  // Duplicate meta description detection
  const metaMap = {};
  for (const p of pageResults) {
    if (p.metaDescription) {
      const m = p.metaDescription.toLowerCase().trim();
      if (!metaMap[m]) metaMap[m] = [];
      metaMap[m].push(p.url);
    }
  }
  const dupMetas = Object.entries(metaMap).filter(([, u]) => u.length > 1).map(([meta, urls]) => ({ meta: meta.slice(0, 120), urls }));

  // Keyword cannibalization
  const phraseMap = {};
  for (const p of pageResults) {
    const signals = [p.title || "", p.h1 || "", ...(p.h2s || []).slice(0, 3)].join(" ").toLowerCase();
    const words = signals.split(/\s+/).filter(w => w.length > 3);
    for (let j = 0; j < words.length - 1; j++) {
      const phrase = `${words[j]} ${words[j+1]}`;
      if (!phraseMap[phrase]) phraseMap[phrase] = [];
      if (!phraseMap[phrase].includes(p.url)) phraseMap[phrase].push(p.url);
    }
  }
  const cannibalization = Object.entries(phraseMap)
    .filter(([ph, urls]) => urls.length >= 2 && ph.length > 6)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 20)
    .map(([keyword, pages]) => ({ keyword, pages: pages.slice(0, 5), count: pages.length }));

  // ── Phase 5: Site-level E-E-A-T & AEO aggregation ─────────────────────────
  const homepage = pageResults.find(p => p.url === siteUrl || p.url === siteUrl + "/") || pageResults[0];
  const siteEEAT = homepage?.eeat || null;
  const siteAEO  = homepage?.aeo  || null;

  // ── Phase 6: Issue aggregation ────────────────────────────────────────────
  const globalIssues = { p1: [], p2: [], p3: [] };

  // Infrastructure issues
  for (const issue of [...sitemapResult.issues, ...robotsResult.issues, ...redirectResult.issues]) {
    const bucket = issue.severity || "p3";
    globalIssues[bucket].push(issue);
  }

  // Aggregate page-level patterns into site-level issues
  const noTitlePages  = pageResults.filter(p => !p.title || p.title === "(No title)");
  const noH1Pages     = pageResults.filter(p => !p.h1);
  const thinPages     = pageResults.filter(p => (p.wordCount || 0) < 300);
  const noIndexPages  = pageResults.filter(p => p.noindex);
  const noSchemaPages = pageResults.filter(p => !p.schemaTypes || p.schemaTypes.length === 0);
  const noCanonPages  = pageResults.filter(p => !p.canonical);
  const slowPages     = pageResults.filter(p => (p.responseTime || 0) > 2000).sort((a, b) => (b.responseTime || 0) - (a.responseTime || 0));

  if (noTitlePages.length > 0) globalIssues.p1.push({ type: "pages_missing_title", detail: `${noTitlePages.length} page(s)`, urls: noTitlePages.map(p => p.url).slice(0, 10), fix: "Add unique title tags to all pages" });
  if (noH1Pages.length > 0)    globalIssues.p2.push({ type: "pages_missing_h1",    detail: `${noH1Pages.length} page(s)`,    urls: noH1Pages.map(p => p.url).slice(0, 10),    fix: "Add H1 to every page" });
  if (thinPages.length > 2)    globalIssues.p2.push({ type: "thin_content_pages",  detail: `${thinPages.length} pages under 300 words`, urls: thinPages.map(p => p.url).slice(0, 10),   fix: "Expand thin pages — Google HCU targets low-value thin content sites" });
  if (noIndexPages.length > 0) globalIssues.p1.push({ type: "noindex_pages",       detail: `${noIndexPages.length} page(s) have noindex`, urls: noIndexPages.map(p => p.url).slice(0, 10), fix: "Review and remove noindex from pages that should rank" });
  if (noSchemaPages.length > pageResults.length * 0.7) globalIssues.p2.push({ type: "site_wide_missing_schema", detail: `${noSchemaPages.length}/${pageResults.length} pages have no schema`, fix: "Implement site-wide structured data — FAQ, Breadcrumb, Organization at minimum" });
  if (orphanPages.length > 0)  globalIssues.p2.push({ type: "orphan_pages",        detail: `${orphanPages.length} orphan page(s)`, urls: orphanPages.slice(0, 10), fix: "Add internal links to orphan pages — they receive no PageRank" });
  if (dupTitles.length > 0)    globalIssues.p2.push({ type: "duplicate_titles",    detail: `${dupTitles.length} duplicate title(s)`, examples: dupTitles.slice(0, 3).map(d => `"${d.title}"`), fix: "Every page needs a unique title tag" });
  if (brokenPages.length > 0)  globalIssues.p1.push({ type: "broken_pages",        detail: `${brokenPages.length} broken page(s)`, urls: brokenPages.map(p => `${p.url} [${p.status}]`).slice(0, 10), fix: "Fix or redirect broken URLs — they waste crawl budget and leak PageRank" });
  if (cannibalization.length > 3) globalIssues.p3.push({ type: "keyword_cannibalization", detail: `${cannibalization.length} potential conflicts`, fix: "Consolidate pages targeting the same keyword phrase" });

  // Crawl coverage issue
  const blockedCount = pageResults.filter(p => p.blocked).length;
  if (blockedCount > urlsToAudit.length * 0.3) {
    globalIssues.p2.push({ type: "cloudflare_blocking", detail: `${blockedCount} pages blocked by WAF/Cloudflare`, fix: "Bot protection is limiting audit coverage. Use GSC data + sitemap for full coverage." });
  }

  // ── Google 2024 Spam Policy — Site-level signals ──────────────────────────
  // Per-page checks are in analyzePageHTML. Here we aggregate site-wide signals.

  // Scaled content abuse — if >30% of pages have 3+ AI content signals
  const aiRiskPages = pageResults.filter(p => {
    const r = p.spamPolicyChecks || p.aiContentRisk;
    if (!r) return false;
    // check per-page spam checks first, fall back to aiContentRisk signals
    const aiRisk = p.aiContentRisk || {};
    return Object.values(aiRisk).filter(Boolean).length >= 3;
  });
  if (aiRiskPages.length >= 2 && aiRiskPages.length > pageResults.length * 0.3) {
    globalIssues.p1.push({
      type: "scaled_content_abuse",
      detail: `${aiRiskPages.length} pages show AI content patterns (SpamBrain 2024)`,
      urls: aiRiskPages.map(p => p.url).slice(0, 10),
      fix: "Google's March 2024 update targets scaled AI content. Add original data, expert insights, author bios, and citations to differentiate from mass-generated content.",
    });
  }

  // Doorway pages — site-wide pattern
  const doorwayPages = pageResults.filter(p => p.spamPolicyChecks?.isDoorwayPage);
  if (doorwayPages.length > 0) {
    globalIssues.p1.push({
      type: "doorway_pages_detected",
      detail: `${doorwayPages.length} potential doorway page(s) detected`,
      urls: doorwayPages.map(p => p.url).slice(0, 5),
      fix: "Pages appear to exist only to funnel users to other content. Google's spam policy penalises doorway pages. Add substantial original value to each page.",
    });
  }

  // Site-wide link spam signals — excessive external links ratio across pages
  const highOutboundPages = pageResults.filter(p => {
    const checks = p.spamPolicyChecks;
    return checks?.isDoorwayPage === false && p.wordCount < 400 && (p.externalLinksCount || 0) > 10;
  });
  if (highOutboundPages.length > 2) {
    globalIssues.p2.push({
      type: "link_spam_risk",
      detail: `${highOutboundPages.length} thin pages with excessive outbound links`,
      urls: highOutboundPages.map(p => p.url).slice(0, 5),
      fix: "Pages with few words but many outbound links trigger Google's link spam detection. Reduce outbound links or add substantial content.",
    });
  }

  // ── Phase 7: Scores ──────────────────────────────────────────────────────
  const avgScore = pageResults.length > 0
    ? Math.round(pageResults.reduce((s, p) => s + (p.pageScore || 70), 0) / pageResults.length)
    : 50;

  const healthScore = Math.min(95, Math.max(5,
    100
    - globalIssues.p1.length * 20
    - globalIssues.p2.length * 8
    - globalIssues.p3.length * 3
  ));

  return {
    siteUrl,
    healthScore,
    avgPageScore:    avgScore,
    pagesCrawled:    pageResults.length,
    urlsDiscovered:  discoveredUrls.length,
    isCloudflareProtected: blockedCount > 2,
    infrastructure: { sitemap: sitemapResult, robots: robotsResult, redirects: redirectResult },
    globalIssues,
    pages:           pageResults,
    brokenPages,
    analysis: {
      orphanPages,
      orphanCount:    orphanPages.length,
      dupTitles:      dupTitles.slice(0, 20),
      dupMetas:       dupMetas.slice(0, 20),
      cannibalization: cannibalization.slice(0, 20),
      slowPages:      slowPages.slice(0, 10).map(p => ({ url: p.url, responseTime: p.responseTime })),
      thinCount:      thinPages.length,
      noSchemaCount:  noSchemaPages.length,
      avgResponseTime: pageResults.length > 0
        ? Math.round(pageResults.reduce((s, p) => s + (p.responseTime || 0), 0) / pageResults.length)
        : 0,
    },
    eeat: siteEEAT,
    aeo:  siteAEO,
    crawledAt: new Date().toISOString(),
  };
}

module.exports = {
  smartAudit,
  analyzePageHTML,
  discoverUrls,
  auditSitemap,
  auditRobots,
  auditRedirects,
  smartFetch,
};
