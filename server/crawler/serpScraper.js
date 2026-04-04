/**
 * SERP Scraper — Free, No API Required
 *
 * Primary:  DuckDuckGo HTML (scraper-friendly, powered by Bing, very reliable)
 * Fallback: Bing direct HTML
 * Shopping: Google Shopping HTML (for PLA research)
 * PAA:      People Also Ask extraction
 *
 * Zero paid APIs needed.
 */

const { URL } = require("url");

// ── DuckDuckGo HTML scraper (Primary) ─────────────────────────────────────
async function scrapeDDG(keyword, options = {}) {
  const { location = "in", num = 10 } = options;

  const params = new URLSearchParams({
    q:  keyword,
    kl: location === "us" ? "us-en" : location === "uk" ? "uk-en" : "in-en",
    kp: "-2", // safe search off
  });

  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?${params}`, {
      signal: AbortSignal.timeout(15000),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0",
        "Accept":     "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer":    "https://duckduckgo.com/",
      },
    });

    if (!res.ok) return { results: [], source: "ddg", error: `HTTP ${res.status}` };

    const html = await res.text();
    return parseDDGResults(html, keyword);
  } catch (e) {
    return { results: [], source: "ddg", error: e.message };
  }
}

function parseDDGResults(html, keyword) {
  const results = [];

  // DDG result block pattern
  const blockRegex = /<div class="result[^"]*"[\s\S]*?(?=<div class="result|<\/div>\s*<\/div>\s*<\/div>\s*$)/gi;
  const urlRegex   = /<a[^>]+href=["']([^"']+)["'][^>]*class=["'][^"']*result__url[^"']*["']/i;
  const titleRegex = /<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]*>([\s\S]*?)<\/a>/i;
  const snippetRegex = /<a[^>]+class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/a>/i;

  // Simpler approach: extract all result links
  const linkPattern = /<h2[^>]*class=["'][^"']*result__title[^"']*["'][^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const snippetPattern = /<a[^>]+class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;

  const snippets = [];
  let sm;
  while ((sm = snippetPattern.exec(html)) !== null) {
    snippets.push(sm[1].replace(/<[^>]+>/g, "").trim());
  }

  let position = 0;
  let lm;
  while ((lm = linkPattern.exec(html)) !== null && position < 10) {
    const rawUrl  = lm[1];
    const rawTitle = lm[2].replace(/<[^>]+>/g, "").trim();

    // DDG wraps URLs — extract the actual URL
    let url = rawUrl;
    try {
      const parsed = new URL(rawUrl);
      if (parsed.hostname.includes("duckduckgo")) {
        url = parsed.searchParams.get("uddg") || rawUrl;
      }
    } catch { /* keep rawUrl */ }

    if (!url || url.startsWith("//duckduckgo") || url.includes("duckduckgo.com")) continue;

    let domain = "";
    try { domain = new URL(url.startsWith("http") ? url : "https://" + url).hostname; } catch { }

    position++;
    results.push({
      position,
      url,
      domain: domain.replace(/^www\./, ""),
      title:   rawTitle,
      snippet: snippets[position - 1] || "",
    });
  }

  // Extract SERP features from HTML
  const features = [];
  if (html.includes("result--more")) features.push("more_results");
  if (html.toLowerCase().includes("people also ask") || html.includes("alsoAsk")) features.push("people_also_ask");
  if (html.includes("result--news")) features.push("news");
  if (html.includes("result--video")) features.push("video");

  // Extract PAA questions
  const paaQuestions = extractPAA(html);

  // Extract related searches
  const relatedSearches = extractRelated(html);

  return {
    keyword,
    results: results.slice(0, 10),
    features,
    paaQuestions,
    relatedSearches,
    source:  "duckduckgo",
    scrapedAt: new Date().toISOString(),
  };
}

// ── Bing Scraper (Fallback) ───────────────────────────────────────────────
async function scrapeBing(keyword, options = {}) {
  const { location = "in", num = 10 } = options;

  const params = new URLSearchParams({
    q:     keyword,
    count: num,
    mkt:   location === "us" ? "en-US" : location === "uk" ? "en-GB" : "en-IN",
    setlang: "en",
  });

  try {
    const res = await fetch(`https://www.bing.com/search?${params}`, {
      signal: AbortSignal.timeout(15000),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Accept":     "text/html",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!res.ok) return { results: [], source: "bing", error: `HTTP ${res.status}` };

    const html = await res.text();
    return parseBingResults(html, keyword);
  } catch (e) {
    return { results: [], source: "bing", error: e.message };
  }
}

function parseBingResults(html, keyword) {
  const results  = [];
  const features = [];

  // Bing result pattern: <li class="b_algo">
  const blockRegex = /<li[^>]+class=["'][^"']*b_algo[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi;
  let bm;
  let position = 0;

  while ((bm = blockRegex.exec(html)) !== null && position < 10) {
    const block   = bm[1];
    const urlM    = /<a[^>]+href=["'](https?:\/\/[^"'\s]+)["']/i.exec(block);
    const titleM  = /<a[^>]+href=["']https?[^>]+>([\s\S]*?)<\/a>/i.exec(block);
    const snippetM = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(block);

    if (!urlM) continue;

    const url   = urlM[1];
    let domain  = "";
    try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch { continue; }

    position++;
    results.push({
      position,
      url,
      domain,
      title:   titleM?.[1]?.replace(/<[^>]+>/g, "").trim() || "",
      snippet: snippetM?.[1]?.replace(/<[^>]+>/g, "").trim() || "",
    });
  }

  // Bing features
  if (html.includes("b_vPanel")) features.push("featured_snippet");
  if (html.includes("b_ans"))    features.push("direct_answer");
  if (html.includes("b_pag"))    features.push("pagination");

  return {
    keyword,
    results: results.slice(0, 10),
    features,
    paaQuestions:   extractPAA(html),
    relatedSearches: extractRelated(html),
    source: "bing",
    scrapedAt: new Date().toISOString(),
  };
}

// ── Google Shopping Scraper (PLA Research) ────────────────────────────────
async function scrapeGoogleShopping(keyword, options = {}) {
  const { location = "in" } = options;

  const params = new URLSearchParams({
    q:   keyword,
    tbm: "shop",
    hl:  "en",
    gl:  location,
    num: "20",
  });

  try {
    const res = await fetch(`https://www.google.com/search?${params}`, {
      signal: AbortSignal.timeout(15000),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0",
        "Accept":     "text/html",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!res.ok) return { products: [], keyword, error: `HTTP ${res.status}` };

    const html = await res.text();
    return parseShoppingResults(html, keyword);
  } catch (e) {
    return { products: [], keyword, error: e.message };
  }
}

function parseShoppingResults(html, keyword) {
  const products = [];

  // Google Shopping product blocks
  const productRegex = /<div[^>]+class=["'][^"']*sh-dgr__grid-result[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*(?=<div[^>]+class=["'][^"']*sh-dgr__grid-result)/gi;

  // Simpler extraction
  const titleRegex    = /aria-label=["']([^"']{5,100})["']/g;
  const priceRegex    = /<span[^>]*class=["'][^"']*a8Pemb[^"']*["'][^>]*>([^<]+)<\/span>/g;
  const merchantRegex = /<div[^>]*class=["'][^"']*aULzUe[^"']*["'][^>]*>([^<]{2,50})<\/div>/g;

  const titles    = [...html.matchAll(titleRegex)].map(m => m[1]).filter(t => t.length > 5).slice(0, 20);
  const prices    = [...html.matchAll(priceRegex)].map(m => m[1].trim()).slice(0, 20);
  const merchants = [...html.matchAll(merchantRegex)].map(m => m[1].trim()).slice(0, 20);

  for (let i = 0; i < Math.min(titles.length, 10); i++) {
    products.push({
      position: i + 1,
      title:    titles[i] || "",
      price:    prices[i] || "",
      merchant: merchants[i] || "",
    });
  }

  return {
    keyword,
    products,
    merchantCount: [...new Set(merchants)].length,
    priceRange: prices.length > 0 ? { min: prices[0], max: prices[prices.length - 1] } : null,
    source: "google_shopping",
    scrapedAt: new Date().toISOString(),
  };
}

// ── Autocomplete Scraper (Volume signal) ─────────────────────────────────
async function scrapeAutocomplete(keyword) {
  try {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(keyword)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    const suggestions = data[1] || [];
    return { keyword, suggestions, count: suggestions.length };
  } catch {
    // Fallback: DuckDuckGo autocomplete
    try {
      const url = `https://duckduckgo.com/ac/?q=${encodeURIComponent(keyword)}&type=list`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const data = await res.json();
      const suggestions = data[1] || [];
      return { keyword, suggestions, count: suggestions.length };
    } catch { return { keyword, suggestions: [], count: 0 }; }
  }
}

// ── People Also Ask extractor ─────────────────────────────────────────────
function extractPAA(html) {
  const questions = [];
  const paaRegex  = /data-q=["']([^"'?]+\?)["']/gi;
  const altRegex  = /<div[^>]+class=["'][^"']*related-question[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;

  let m;
  while ((m = paaRegex.exec(html)) !== null && questions.length < 10) {
    questions.push(m[1].trim());
  }

  // Also try jsdata attribute pattern
  const jsRegex = /"([^"]{10,150}\?)"[^}]*"type":"Question"/g;
  while ((m = jsRegex.exec(html)) !== null && questions.length < 10) {
    if (!questions.includes(m[1])) questions.push(m[1].trim());
  }

  return [...new Set(questions)].slice(0, 8);
}

// ── Related Searches extractor ────────────────────────────────────────────
function extractRelated(html) {
  const related = [];
  const relatedRegex = /<p[^>]+class=["'][^"']*nVcaUb[^"']*["'][^>]*>([\s\S]*?)<\/p>/gi;
  const bingRelated  = /<li[^>]+class=["'][^"']*b_rs_item[^"']*["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/gi;

  let m;
  while ((m = relatedRegex.exec(html)) !== null && related.length < 8) {
    related.push(m[1].replace(/<[^>]+>/g, "").trim());
  }
  while ((m = bingRelated.exec(html)) !== null && related.length < 8) {
    related.push(m[1].replace(/<[^>]+>/g, "").trim());
  }

  return [...new Set(related.filter(r => r.length > 3))].slice(0, 8);
}

// ── Main SERP function — tries DDG first, falls back to Bing ─────────────
async function getSERP(keyword, options = {}) {
  // Try DuckDuckGo first
  const ddgResult = await scrapeDDG(keyword, options);
  if (ddgResult.results.length >= 5) return ddgResult;

  // Fallback to Bing
  console.log(`[serpScraper] DDG returned ${ddgResult.results.length} results — falling back to Bing`);
  const bingResult = await scrapeBing(keyword, options);
  if (bingResult.results.length >= 3) return bingResult;

  // Return whatever we have
  return ddgResult.results.length > bingResult.results.length ? ddgResult : bingResult;
}

module.exports = {
  getSERP,
  scrapeDDG,
  scrapeBing,
  scrapeGoogleShopping,
  scrapeAutocomplete,
  extractPAA,
};
