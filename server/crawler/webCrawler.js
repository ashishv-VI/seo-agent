/**
 * Web Crawler — Core Engine
 * Crawls websites, extracts all links + metadata
 * Uses Node.js built-in fetch (Node 18+) — zero new packages
 */

const { URL } = require("url");

// ── Fetch a single page ───────────────────────────────────────────────────
async function fetchPage(url, timeoutMs = 12000) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SEOAgentBot/1.0)",
        "Accept":     "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });

    if (!res.ok) return { html: null, status: res.status, finalUrl: res.url };

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      return { html: null, status: res.status, finalUrl: res.url, skip: true };
    }

    const html     = await res.text();
    const finalUrl = res.url;
    return { html, status: res.status, finalUrl };
  } catch (e) {
    return { html: null, status: 0, error: e.message };
  }
}

// ── Extract all links from HTML ───────────────────────────────────────────
function extractLinks(html, pageUrl) {
  if (!html) return { internal: [], external: [] };

  let baseDomain;
  try {
    baseDomain = new URL(pageUrl).hostname.replace(/^www\./, "");
  } catch { return { internal: [], external: [] }; }

  const internal = [];
  const external = [];

  // Match <a href="...">anchor</a>
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

    // Remove query strings + fragments for deduplication
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

// ── Extract page metadata ─────────────────────────────────────────────────
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

  // ── H2 / H3 / H4 heading extraction (keyword hierarchy) ─────────────────
  const h2Matches = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)];
  const h3Matches = [...html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/gi)];
  const h4Matches = [...html.matchAll(/<h4[^>]*>([\s\S]*?)<\/h4>/gi)];
  const h2s = h2Matches.map(m => m[1].replace(/<[^>]+>/g, "").trim()).filter(h => h.length > 2 && h.length < 200).slice(0, 20);
  const h3s = h3Matches.map(m => m[1].replace(/<[^>]+>/g, "").trim()).filter(h => h.length > 2 && h.length < 200).slice(0, 20);
  const h4s = h4Matches.map(m => m[1].replace(/<[^>]+>/g, "").trim()).filter(h => h.length > 2 && h.length < 200).slice(0, 10);

  // ── Image alt text audit ─────────────────────────────────────────────────
  const imgMatches  = [...html.matchAll(/<img[^>]*>/gi)];
  const imgsNoAlt   = imgMatches.filter(m => !m[0].match(/alt=["'][^"']+["']/i));
  const imgAlt = {
    total:      imgMatches.length,
    missingAlt: imgsNoAlt.length,
    missingUrls: imgsNoAlt.slice(0, 10).map(m => {
      const srcM = m[0].match(/src=["']([^"']*)["']/i);
      return srcM ? srcM[1] : "(no src)";
    }),
  };

  // ── Estimate word count from text content ────────────────────────────────
  const text      = html.replace(/<style[\s\S]*?<\/style>/gi, "")
                        .replace(/<script[\s\S]*?<\/script>/gi, "")
                        .replace(/<[^>]+>/g, " ")
                        .replace(/\s+/g, " ").trim();
  const wordCount = text.split(" ").filter(w => w.length > 2).length;

  // ── Thin content signals ─────────────────────────────────────────────────
  const htmlLength   = html.length;
  const contentRatio = htmlLength > 0 ? Math.round((text.length / htmlLength) * 100) : 0;
  const hasFAQ       = /<[^>]*(?:faq|question|answer)[^>]*>/i.test(html) ||
                       /(?:frequently asked|FAQ|common question)/i.test(html);
  const hasMedia     = /<(?:video|iframe|audio)[^>]*>/i.test(html);
  const thinContent  = {
    wordCount,
    contentRatio,   // text-to-code ratio (%)
    hasFAQ,
    hasMedia,
    isThin: wordCount < 300 || contentRatio < 15,
  };

  // Check HTTPS
  const isHttps = url.startsWith("https://");

  // Check noindex
  const noindex = robots?.toLowerCase().includes("noindex") || false;

  return {
    url, title, description, h1, canonical,
    robots, noindex, ogTitle, schemaTypes,
    wordCount, isHttps,
    h2s, h3s, h4s,
    h2Count: h2s.length,
    h3Count: h3s.length,
    h4Count: h4s.length,
    imgAlt,
    thinContent,
  };
}

// ── Crawl a domain (BFS, depth-limited) ──────────────────────────────────
async function crawlDomain(startUrl, options = {}) {
  const {
    maxPages    = 50,    // Max pages to crawl per domain
    maxDepth    = 3,     // How deep to go
    delayMs     = 800,   // Delay between requests (be polite)
    onPageCrawled = null, // Callback per page
  } = options;

  let rootDomain;
  try { rootDomain = new URL(startUrl).hostname.replace(/^www\./, ""); }
  catch { return { error: "Invalid URL", pages: [], backlinksFound: [] }; }

  const queue    = [{ url: startUrl, depth: 0 }];
  const visited  = new Set();
  const pages    = [];
  const backlinksFound   = [];
  const externalLinksOut = [];
  // Internal link equity map: { [url]: { inbound: number, linkedFrom: string[] } }
  const internalLinkMap  = {};

  while (queue.length > 0 && pages.length < maxPages) {
    const { url, depth } = queue.shift();

    const cleanUrl = url.split("?")[0].split("#")[0];
    if (visited.has(cleanUrl)) continue;
    visited.add(cleanUrl);

    // Skip non-HTML resources
    if (/\.(pdf|jpg|jpeg|png|gif|svg|webp|mp4|zip|css|js|xml|json)(\?|$)/i.test(url)) continue;

    // ── Page response time tracking ──────────────────────────────────────
    const t0 = Date.now();
    const { html, status, finalUrl, error } = await fetchPage(url);
    const responseTime = Date.now() - t0;
    if (!html) {
      // Track broken pages
      if (status && status >= 400) {
        pages.push({ url, status, broken: true, responseTime, depth });
      }
      continue;
    }

    const meta  = extractMeta(html, finalUrl || url);
    const links = extractLinks(html, finalUrl || url);

    // ── Internal link equity map — track inbound links per page ─────────
    for (const link of links.internal) {
      const clean = link.url.split("?")[0].split("#")[0];
      if (!internalLinkMap[clean]) internalLinkMap[clean] = { inbound: 0, linkedFrom: [] };
      internalLinkMap[clean].inbound++;
      if (internalLinkMap[clean].linkedFrom.length < 5) {
        internalLinkMap[clean].linkedFrom.push(finalUrl || url);
      }
    }

    const pageData = {
      ...meta,
      depth,
      responseTime,
      statusCode:    status || 200,
      crawledAt:     new Date().toISOString(),
      internalLinks: links.internal.length,
      externalLinks: links.external.length,
      internalLinksTo: links.internal.slice(0, 30).map(l => l.url.split("?")[0].split("#")[0]),
    };

    pages.push(pageData);
    if (onPageCrawled) onPageCrawled(pageData);

    // Queue internal links for deeper crawl
    if (depth < maxDepth) {
      for (const link of links.internal.slice(0, 30)) {
        const clean = link.url.split("?")[0].split("#")[0];
        if (!visited.has(clean)) {
          queue.push({ url: link.url, depth: depth + 1 });
        }
      }
    }

    // Collect outbound links
    for (const link of links.external) {
      externalLinksOut.push({
        fromDomain: rootDomain,
        fromPage:   finalUrl || url,
        toDomain:   link.domain,
        toUrl:      link.url,
        anchor:     link.anchor,
        foundAt:    new Date().toISOString(),
      });
    }

    if (queue.length > 0) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  // ── Post-crawl analysis ────────────────────────────────────────────────

  // Attach inbound link count to each page
  for (const page of pages) {
    if (!page.broken) {
      const clean = (page.url || "").split("?")[0].split("#")[0];
      page.inboundInternalLinks = internalLinkMap[clean]?.inbound || 0;
      page.linkedFrom           = internalLinkMap[clean]?.linkedFrom || [];
    }
  }

  // ── Orphan page detection ─────────────────────────────────────────────
  const orphanPages = pages
    .filter(p => !p.broken && p.inboundInternalLinks === 0 && p.url !== startUrl)
    .map(p => p.url);

  // ── Keyword cannibalization detection ─────────────────────────────────
  // Pages targeting same keyword (via title + H1 overlap)
  const cannibalization = detectCannibalization(pages);

  // ── Duplicate title / meta detection ─────────────────────────────────
  const { dupTitles, dupMetas } = detectDuplicates(pages);

  // ── Slow pages ───────────────────────────────────────────────────────
  const slowPages = pages
    .filter(p => !p.broken && p.responseTime > 2000)
    .map(p => ({ url: p.url, responseTime: p.responseTime }))
    .sort((a, b) => b.responseTime - a.responseTime);

  // ── Broken pages (4xx/5xx) ───────────────────────────────────────────
  const brokenPages = pages
    .filter(p => p.broken || (p.statusCode && p.statusCode >= 400))
    .map(p => ({ url: p.url, status: p.statusCode || p.status }));

  return {
    domain:     rootDomain,
    pagesFound: pages.filter(p => !p.broken).length,
    pages,
    externalLinksOut,
    internalLinkMap,
    analysis: {
      orphanPages:       orphanPages.slice(0, 50),
      orphanCount:       orphanPages.length,
      cannibalization,
      dupTitles:         dupTitles.slice(0, 10),
      dupMetas:          dupMetas.slice(0, 10),
      slowPages:         slowPages.slice(0, 10),
      brokenPages:       brokenPages.slice(0, 20),
      avgResponseTime:   pages.length > 0
        ? Math.round(pages.filter(p => p.responseTime).reduce((s, p) => s + (p.responseTime || 0), 0) / pages.filter(p => p.responseTime).length)
        : 0,
    },
    crawledAt: new Date().toISOString(),
  };
}

// ── Keyword cannibalization: pages with overlapping title/H1/H2 terms ────────
function detectCannibalization(pages) {
  const conflicts = [];
  const titleMap  = {};  // normalised keyword → [urls]

  for (const page of pages) {
    if (page.broken) continue;
    // Extract key terms from title + H1
    const signals = [
      page.title || "",
      page.h1    || "",
      ...(page.h2s || []).slice(0, 3),
    ].join(" ").toLowerCase();

    // Extract 2-3 word phrases as target keywords
    const words  = signals.split(/\s+/).filter(w => w.length > 3);
    const bigrams = [];
    for (let i = 0; i < words.length - 1; i++) {
      bigrams.push(`${words[i]} ${words[i+1]}`);
    }
    for (const phrase of bigrams) {
      if (!titleMap[phrase]) titleMap[phrase] = [];
      if (!titleMap[phrase].includes(page.url)) titleMap[phrase].push(page.url);
    }
  }

  // Find phrases that appear in 2+ pages — potential cannibalization
  for (const [phrase, urls] of Object.entries(titleMap)) {
    if (urls.length >= 2 && phrase.length > 6) {
      conflicts.push({ keyword: phrase, pages: urls.slice(0, 5), count: urls.length });
    }
  }

  return conflicts
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
}

// ── Duplicate title + meta detection ─────────────────────────────────────────
function detectDuplicates(pages) {
  const titleMap = {}, metaMap = {};
  for (const p of pages) {
    if (p.broken) continue;
    if (p.title) {
      const t = p.title.toLowerCase().trim();
      if (!titleMap[t]) titleMap[t] = [];
      titleMap[t].push(p.url);
    }
    if (p.description) {
      const m = p.description.toLowerCase().trim();
      if (!metaMap[m])  metaMap[m] = [];
      metaMap[m].push(p.url);
    }
  }
  const dupTitles = Object.entries(titleMap)
    .filter(([, urls]) => urls.length > 1)
    .map(([title, urls]) => ({ title: title.slice(0, 80), urls }));
  const dupMetas  = Object.entries(metaMap)
    .filter(([, urls]) => urls.length > 1)
    .map(([meta, urls]) => ({ meta: meta.slice(0, 120), urls }));
  return { dupTitles, dupMetas };
}

module.exports = {
  fetchPage,
  extractLinks,
  extractMeta,
  crawlDomain,
  detectCannibalization,
  detectDuplicates,
};
