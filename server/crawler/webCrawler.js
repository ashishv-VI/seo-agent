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

  // Estimate word count from text content
  const text      = html.replace(/<style[\s\S]*?<\/style>/gi, "")
                        .replace(/<script[\s\S]*?<\/script>/gi, "")
                        .replace(/<[^>]+>/g, " ")
                        .replace(/\s+/g, " ").trim();
  const wordCount = text.split(" ").filter(w => w.length > 2).length;

  // Check HTTPS
  const isHttps = url.startsWith("https://");

  // Check noindex
  const noindex = robots?.toLowerCase().includes("noindex") || false;

  return {
    url, title, description, h1, canonical,
    robots, noindex, ogTitle, schemaTypes,
    wordCount, isHttps,
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
  const backlinksFound = []; // external links found = these domains have link TO us potential
  const externalLinksOut = []; // links from this domain TO other domains

  while (queue.length > 0 && pages.length < maxPages) {
    const { url, depth } = queue.shift();

    const cleanUrl = url.split("?")[0].split("#")[0];
    if (visited.has(cleanUrl)) continue;
    visited.add(cleanUrl);

    // Skip non-HTML resources
    if (/\.(pdf|jpg|jpeg|png|gif|svg|webp|mp4|zip|css|js|xml|json)(\?|$)/i.test(url)) continue;

    const { html, status, finalUrl, error } = await fetchPage(url);
    if (!html) continue;

    const meta  = extractMeta(html, finalUrl || url);
    const links = extractLinks(html, finalUrl || url);

    const pageData = {
      ...meta,
      depth,
      crawledAt:    new Date().toISOString(),
      internalLinks: links.internal.length,
      externalLinks: links.external.length,
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

    // Collect outbound links (these are potential backlinks for other domains)
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

    // Polite delay
    if (queue.length > 0) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  return {
    domain:   rootDomain,
    pagesFound: pages.length,
    pages,
    externalLinksOut,
    crawledAt: new Date().toISOString(),
  };
}

module.exports = { fetchPage, extractLinks, extractMeta, crawlDomain };
