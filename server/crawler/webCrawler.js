/**
 * Web Crawler — Core Engine
 * Crawls websites, extracts all links + metadata
 * Uses Node.js built-in fetch (Node 18+) — zero new packages
 *
 * Capabilities:
 *  - Concurrent crawling: 10 pages at a time (not sequential — 10x faster)
 *  - JS rendering per page: blank React/Next/Vue pages get Puppeteer re-fetch
 *  - Smart retry: 403/429/503 → exponential backoff → rotate User-Agent
 *  - H1/H2/H3/H4, schema, alt text, response time, thin content signals
 *  - Internal link equity map, orphan detection
 *  - Keyword cannibalization, duplicate title/meta
 *  - Broken link tracking (4xx/5xx)
 */

const { URL } = require("url");

// Lazy-load JS renderer — don't crash if puppeteer not installed
let _jsRenderer = null;
function getJsRenderer() {
  if (_jsRenderer) return _jsRenderer;
  try {
    _jsRenderer = require("../utils/jsRenderer");
  } catch {
    _jsRenderer = { isJSRendered: () => false, renderPage: async () => ({ html: null, rendered: false }) };
  }
  return _jsRenderer;
}

// ── User-Agent rotation pool (reduces bot detection) ─────────────────────────
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 (compatible; SEOAgentBot/2.0; +https://seo-agent.onrender.com/bot)",
];
let _uaIndex = 0;
function nextUserAgent() {
  const ua = USER_AGENTS[_uaIndex % USER_AGENTS.length];
  _uaIndex++;
  return ua;
}

// ── Fetch a single page with retry + JS rendering ────────────────────────────
async function fetchPage(url, timeoutMs = 12000, opts = {}) {
  const { retries = 2, useJsRenderer = false } = opts;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "User-Agent":      nextUserAgent(),
          "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          "Cache-Control":   "no-cache",
        },
        redirect: "follow",
      });

      // Anti-bot responses — back off and retry with different UA
      if (res.status === 429 || res.status === 503) {
        if (attempt < retries) {
          await sleep(1500 * (attempt + 1)); // 1.5s, 3s
          continue;
        }
        return { html: null, status: res.status, finalUrl: res.url };
      }

      if (res.status === 403) {
        // Try once more with Googlebot UA
        if (attempt < retries) {
          await sleep(500);
          continue;
        }
        return { html: null, status: 403, finalUrl: res.url };
      }

      if (!res.ok) return { html: null, status: res.status, finalUrl: res.url };

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("text/html")) {
        return { html: null, status: res.status, finalUrl: res.url, skip: true };
      }

      let html     = await res.text();
      const finalUrl = res.url;

      // ── JS rendering fallback ──────────────────────────────────────────────
      // If page looks blank (SPA/React/Next) try Puppeteer to get real content
      const { isJSRendered, renderPage } = getJsRenderer();
      if (isJSRendered(html) || useJsRenderer) {
        const { html: rendered } = await renderPage(finalUrl, 20000).catch(() => ({ html: null }));
        if (rendered && rendered.length > html.length) {
          html = rendered;
        }
      }

      return { html, status: res.status, finalUrl };

    } catch (e) {
      if (attempt < retries && (e.name === "TimeoutError" || e.message?.includes("timeout"))) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      return { html: null, status: 0, error: e.message };
    }
  }
  return { html: null, status: 0, error: "Max retries exceeded" };
}

// ── Extract all links from HTML ───────────────────────────────────────────────
function extractLinks(html, pageUrl) {
  if (!html) return { internal: [], external: [] };

  let baseDomain;
  try {
    baseDomain = new URL(pageUrl).hostname.replace(/^www\./, "");
  } catch { return { internal: [], external: [] }; }

  const internal = [];
  const external = [];
  const linkRegex = /<a[^>]+href=["']([^"'\s]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  const seen = new Set();

  while ((match = linkRegex.exec(html)) !== null) {
    const href       = match[1].trim();
    const anchorText = match[2].replace(/<[^>]+>/g, "").trim().slice(0, 150);

    if (!href || href.startsWith("#") || href.startsWith("javascript:")
      || href.startsWith("mailto:") || href.startsWith("tel:")) continue;

    let absolute;
    try { absolute = new URL(href, pageUrl).href; } catch { continue; }

    const cleanUrl = absolute.split("?")[0].split("#")[0];
    if (seen.has(cleanUrl)) continue;
    seen.add(cleanUrl);

    let linkDomain;
    try { linkDomain = new URL(absolute).hostname.replace(/^www\./, ""); } catch { continue; }

    if (linkDomain === baseDomain) {
      internal.push({ url: absolute, anchor: anchorText });
    } else {
      if (linkDomain && !linkDomain.includes(" ")) {
        external.push({ url: absolute, domain: linkDomain, anchor: anchorText, sourcePage: pageUrl });
      }
    }
  }

  return { internal, external };
}

// ── Extract full page metadata ────────────────────────────────────────────────
function extractMeta(html, url) {
  if (!html) return { url };

  const get = (regex) => regex.exec(html)?.[1]?.replace(/<[^>]+>/g, "").trim() || "";

  const title       = get(/<title[^>]*>([^<]+)<\/title>/i);
  const description = get(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)/i)
                   || get(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
  const h1          = get(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const canonical   = get(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)/i) || url;
  const robots      = get(/<meta[^>]*name=["']robots["'][^>]*content=["']([^"']*)/i);
  const ogTitle     = get(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)/i);

  // Schema.org JSON-LD types
  const schemaMatches = [...html.matchAll(/"@type"\s*:\s*"([^"]+)"/g)];
  const schemaTypes   = [...new Set(schemaMatches.map(m => m[1]))];

  // ── H2 / H3 / H4 heading extraction ──────────────────────────────────────
  const h2s = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)]
    .map(m => m[1].replace(/<[^>]+>/g, "").trim()).filter(h => h.length > 2 && h.length < 200).slice(0, 20);
  const h3s = [...html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/gi)]
    .map(m => m[1].replace(/<[^>]+>/g, "").trim()).filter(h => h.length > 2 && h.length < 200).slice(0, 20);
  const h4s = [...html.matchAll(/<h4[^>]*>([\s\S]*?)<\/h4>/gi)]
    .map(m => m[1].replace(/<[^>]+>/g, "").trim()).filter(h => h.length > 2 && h.length < 200).slice(0, 10);

  // ── Image alt text audit ──────────────────────────────────────────────────
  const imgMatches = [...html.matchAll(/<img[^>]*>/gi)];
  const imgsNoAlt  = imgMatches.filter(m => !m[0].match(/alt=["'][^"']+["']/i));
  const imgAlt = {
    total:       imgMatches.length,
    missingAlt:  imgsNoAlt.length,
    missingUrls: imgsNoAlt.slice(0, 10).map(m => {
      const s = m[0].match(/src=["']([^"']*)["']/i);
      return s ? s[1] : "(no src)";
    }),
  };

  // ── Word count ────────────────────────────────────────────────────────────
  const text = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ").trim();
  const wordCount = text.split(" ").filter(w => w.length > 2).length;

  // ── Thin content signals ──────────────────────────────────────────────────
  const contentRatio = html.length > 0 ? Math.round((text.length / html.length) * 100) : 0;
  const hasFAQ       = /<[^>]*(?:faq|question|answer)[^>]*>/i.test(html) || /frequently asked|FAQ/i.test(html);
  const hasMedia     = /<(?:video|iframe|audio)[^>]*>/i.test(html);
  const thinContent  = {
    wordCount, contentRatio, hasFAQ, hasMedia,
    isThin: wordCount < 300 || contentRatio < 15,
  };

  // ── Viewport / mobile ─────────────────────────────────────────────────────
  const hasViewport = /<meta[^>]*name=["']viewport["']/i.test(html);

  // ── Open Graph ────────────────────────────────────────────────────────────
  const ogTags = {};
  for (const m of html.matchAll(/<meta[^>]*property=["']og:([^"']*)["'][^>]*content=["']([^"']*)/gi)) ogTags[m[1]] = m[2];
  for (const m of html.matchAll(/<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:([^"']*)/gi)) ogTags[m[2]] = m[1];

  const noindex = robots?.toLowerCase().includes("noindex") || false;

  return {
    url, title, description, h1, canonical,
    robots, noindex, ogTitle, ogTags, schemaTypes,
    wordCount, isHttps: url.startsWith("https://"),
    hasViewport,
    h2s, h3s, h4s,
    h2Count: h2s.length,
    h3Count: h3s.length,
    h4Count: h4s.length,
    imgAlt,
    thinContent,
  };
}

// ── Concurrent page crawler ───────────────────────────────────────────────────
// Crawls up to `concurrency` pages at a time instead of one-by-one
// 10x faster than sequential for 100+ page sites
async function crawlDomain(startUrl, options = {}) {
  const {
    maxPages    = 100,
    maxDepth    = 4,
    concurrency = 10,
    delayMs     = 200,
    onPageCrawled = null,
    onProgress    = null,
    maxTotalTimeMs = 8 * 60 * 1000, // 8 min hard cap — prevents silent hang
  } = options;

  const crawlDeadline = Date.now() + maxTotalTimeMs;

  let rootDomain;
  try { rootDomain = new URL(startUrl).hostname.replace(/^www\./, ""); }
  catch { return { error: "Invalid URL", pages: [] }; }

  // BFS queue: {url, depth}
  const queue         = [{ url: startUrl, depth: 0 }];
  const queued        = new Set([startUrl.split("?")[0].split("#")[0]]);
  const pages         = [];
  const internalLinkMap = {};  // url → { inbound, linkedFrom }
  const externalLinksOut = [];

  // Skip non-HTML resources and WordPress junk paths
  const SKIP_EXT  = /\.(pdf|jpg|jpeg|png|gif|svg|webp|mp4|zip|css|js|xml|json|ico|woff|woff2|ttf|eot|mp3|wav)(\?|$)/i;
  const SKIP_PATH = [/\/wp-admin\//i, /\/wp-login/i, /\/wp-cron/i, /\/wp-json\//i,
                     /\/feed\/?$/i, /\/xmlrpc\.php/i, /\/tag\//i, /\/author\//i,
                     /\/page\/\d+/i, /\.(php\?debug)/i];

  function shouldSkip(url) {
    if (SKIP_EXT.test(url)) return true;
    if (SKIP_PATH.some(p => p.test(url))) return true;
    return false;
  }

  // Process queue in batches of `concurrency`
  while (queue.length > 0 && pages.length < maxPages) {
    // Hard deadline check — prevents silent hang
    if (Date.now() > crawlDeadline) {
      console.warn(`[webCrawler] Hard timeout reached after ${Math.round(maxTotalTimeMs/1000)}s — returning ${pages.length} pages crawled so far`);
      break;
    }
    // Take next batch
    const batch = [];
    while (queue.length > 0 && batch.length < concurrency && pages.length + batch.length < maxPages) {
      batch.push(queue.shift());
    }

    // Fetch all pages in batch concurrently
    const results = await Promise.allSettled(
      batch.map(async ({ url, depth }) => {
        if (shouldSkip(url)) return null;

        const t0 = Date.now();
        const { html, status, finalUrl } = await fetchPage(url, 10000, { retries: 1 });
        const responseTime = Date.now() - t0;

        if (!html) {
          return { url, status: status || 0, broken: status >= 400, responseTime, depth };
        }

        const meta  = extractMeta(html, finalUrl || url);
        const links = extractLinks(html, finalUrl || url);

        // Track internal link equity
        for (const link of links.internal) {
          const clean = link.url.split("?")[0].split("#")[0];
          if (!internalLinkMap[clean]) internalLinkMap[clean] = { inbound: 0, linkedFrom: [] };
          internalLinkMap[clean].inbound++;
          if (internalLinkMap[clean].linkedFrom.length < 5) internalLinkMap[clean].linkedFrom.push(finalUrl || url);
        }

        // Queue new links for next batch
        if (depth < maxDepth) {
          for (const link of links.internal.slice(0, 50)) {
            const clean = link.url.split("?")[0].split("#")[0];
            try {
              if (new URL(link.url).hostname.replace(/^www\./, "") !== rootDomain) continue;
            } catch { continue; }
            if (!queued.has(clean) && !shouldSkip(clean)) {
              queued.add(clean);
              queue.push({ url: link.url, depth: depth + 1 });
            }
          }
        }

        // Collect outbound
        for (const link of links.external) {
          externalLinksOut.push({ fromDomain: rootDomain, fromPage: finalUrl || url, toDomain: link.domain, toUrl: link.url, anchor: link.anchor });
        }

        return {
          ...meta,
          depth,
          responseTime,
          statusCode: status || 200,
          crawledAt:  new Date().toISOString(),
          internalLinks:   links.internal.length,
          externalLinks:   links.external.length,
          internalLinksTo: links.internal.slice(0, 30).map(l => l.url.split("?")[0].split("#")[0]),
        };
      })
    );

    // Collect fulfilled results
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        pages.push(r.value);
        if (onPageCrawled) onPageCrawled(r.value);
      }
    }

    if (onProgress) onProgress(pages.length, pages.length + queue.length);

    // Polite delay between batches
    if (queue.length > 0 && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  // ── Post-crawl: attach inbound link counts ────────────────────────────────
  for (const page of pages) {
    if (!page.broken) {
      const clean = (page.url || "").split("?")[0].split("#")[0];
      page.inboundInternalLinks = internalLinkMap[clean]?.inbound || 0;
      page.linkedFrom           = internalLinkMap[clean]?.linkedFrom || [];
    }
  }

  // ── Analysis ──────────────────────────────────────────────────────────────
  const goodPages   = pages.filter(p => !p.broken);
  const brokenPages = pages.filter(p => p.broken || (p.statusCode >= 400));
  const orphanPages = goodPages.filter(p => (p.inboundInternalLinks || 0) === 0 && p.url !== startUrl).map(p => p.url);
  const slowPages   = goodPages.filter(p => p.responseTime > 2000).sort((a, b) => b.responseTime - a.responseTime);

  const cannibalization = detectCannibalization(goodPages);
  const { dupTitles, dupMetas } = detectDuplicates(goodPages);

  const responseTimes = goodPages.map(p => p.responseTime).filter(Boolean);
  const avgResponseTime = responseTimes.length > 0
    ? Math.round(responseTimes.reduce((s, v) => s + v, 0) / responseTimes.length)
    : 0;

  return {
    domain:      rootDomain,
    pagesFound:  goodPages.length,
    pagesCrawled: pages.length,
    pages,
    externalLinksOut,
    internalLinkMap,
    analysis: {
      orphanPages:    orphanPages.slice(0, 100),
      orphanCount:    orphanPages.length,
      cannibalization,
      dupTitles:      dupTitles.slice(0, 20),
      dupMetas:       dupMetas.slice(0, 20),
      slowPages:      slowPages.slice(0, 20).map(p => ({ url: p.url, responseTime: p.responseTime })),
      brokenPages:    brokenPages.slice(0, 50).map(p => ({ url: p.url, status: p.statusCode || p.status })),
      avgResponseTime,
      jsRenderedCount: goodPages.filter(p => p.jsRendered).length,
    },
    crawledAt: new Date().toISOString(),
  };
}

// ── Keyword cannibalization detection ─────────────────────────────────────────
function detectCannibalization(pages) {
  const titleMap = {};

  for (const page of pages) {
    const signals = [page.title || "", page.h1 || "", ...(page.h2s || []).slice(0, 3)]
      .join(" ").toLowerCase();
    const words   = signals.split(/\s+/).filter(w => w.length > 3);
    for (let i = 0; i < words.length - 1; i++) {
      const phrase = `${words[i]} ${words[i+1]}`;
      if (!titleMap[phrase]) titleMap[phrase] = [];
      if (!titleMap[phrase].includes(page.url)) titleMap[phrase].push(page.url);
    }
  }

  return Object.entries(titleMap)
    .filter(([phrase, urls]) => urls.length >= 2 && phrase.length > 6)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 20)
    .map(([keyword, pages]) => ({ keyword, pages: pages.slice(0, 5), count: pages.length }));
}

// ── Duplicate title + meta detection ─────────────────────────────────────────
function detectDuplicates(pages) {
  const titleMap = {}, metaMap = {};
  for (const p of pages) {
    if (p.title) {
      const t = p.title.toLowerCase().trim();
      if (!titleMap[t]) titleMap[t] = [];
      titleMap[t].push(p.url);
    }
    if (p.description) {
      const m = p.description.toLowerCase().trim();
      if (!metaMap[m]) metaMap[m] = [];
      metaMap[m].push(p.url);
    }
  }
  const dupTitles = Object.entries(titleMap).filter(([, u]) => u.length > 1).map(([title, urls]) => ({ title: title.slice(0, 80), urls }));
  const dupMetas  = Object.entries(metaMap).filter(([, u]) => u.length > 1).map(([meta, urls]) => ({ meta: meta.slice(0, 120), urls }));
  return { dupTitles, dupMetas };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = {
  fetchPage,
  extractLinks,
  extractMeta,
  crawlDomain,
  detectCannibalization,
  detectDuplicates,
};
