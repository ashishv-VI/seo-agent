/**
 * A21 — Pre-Sales Audit (Sprint 4)
 *
 * 60-second lightweight audit for sales meetings.
 * No login required — runs on any URL.
 * Returns a "hook" report: 3 critical issues + quick score estimate.
 *
 * Used by: A21 public API route (no auth) + Pre-Sales page in frontend.
 */

const SKIP_EXTENSIONS = /\.(css|js|ico|png|jpg|jpeg|gif|svg|webp|woff|woff2|ttf|pdf|zip|xml|json|mp4)(\?.*)?$/i;

async function runPreSalesAudit(url) {
  if (!url) throw new Error("URL required");
  const siteUrl = url.startsWith("http") ? url : `https://${url}`;

  const issues  = [];
  const checks  = {};
  const t0      = Date.now();

  // Run all checks in parallel for speed
  await Promise.allSettled([
    checkAccessibility(siteUrl, checks, issues),
    checkSSL(siteUrl, checks, issues),
    checkRobots(siteUrl, checks, issues),
    checkSitemap(siteUrl, checks, issues),
    checkMobile(checks, issues),
  ]);

  // Fetch homepage once for on-page checks (shared)
  try {
    const res  = await fetch(siteUrl, { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "SEO-Presales/1.0" } });
    const html = await res.text();
    checkOnPage(html, siteUrl, checks, issues);
  } catch { /* if fetch already done above, ignore */ }

  const auditTime = Date.now() - t0;

  // Score estimate: start at 100, deduct per issue
  let score = 100;
  for (const i of issues) {
    if (i.severity === "critical") score -= 15;
    else if (i.severity === "warning") score -= 5;
    else score -= 2;
  }
  score = Math.max(0, Math.min(100, score));

  // Top 3 issues for the hook
  const top3 = issues.filter(i => i.severity === "critical").slice(0, 3);
  if (top3.length < 3) {
    top3.push(...issues.filter(i => i.severity === "warning").slice(0, 3 - top3.length));
  }

  return {
    url: siteUrl,
    estimatedScore: score,
    grade: score >= 80 ? "B+" : score >= 60 ? "C" : score >= 40 ? "D" : "F",
    totalIssues: issues.length,
    criticalIssues: issues.filter(i => i.severity === "critical").length,
    top3Issues: top3,
    allIssues: issues,
    checks,
    auditTimeMs: auditTime,
    hook: buildHook(score, top3, siteUrl),
    cta: "Run full 8-agent AI pipeline to get a complete 50-page audit with fix plan →",
  };
}

async function checkAccessibility(siteUrl, checks, issues) {
  try {
    const t  = Date.now();
    const r  = await fetch(siteUrl, { redirect:"follow", signal: AbortSignal.timeout(6000) });
    checks.httpStatus    = r.status;
    checks.responseTime  = Date.now() - t;
    checks.isAccessible  = r.ok;
    if (!r.ok) issues.push({ type:"site_unreachable", severity:"critical", detail:`Site returned ${r.status}`, fix:"Check site hosting and DNS" });
    if (checks.responseTime > 2000) issues.push({ type:"slow_ttfb", severity:"critical", detail:`Server response: ${checks.responseTime}ms (target <600ms)`, fix:"Upgrade hosting or add caching" });
    else if (checks.responseTime > 800) issues.push({ type:"ttfb_warning", severity:"warning", detail:`Response time: ${checks.responseTime}ms`, fix:"Enable caching and compression" });
  } catch (e) {
    checks.isAccessible = false;
    issues.push({ type:"site_unreachable", severity:"critical", detail:`Cannot reach site: ${e.message}`, fix:"Check if site is live" });
  }
}

function checkSSL(siteUrl, checks, issues) {
  checks.hasSSL = siteUrl.startsWith("https://");
  if (!checks.hasSSL) issues.push({ type:"no_ssl", severity:"critical", detail:"Site not using HTTPS — Google ranks HTTPS sites higher", fix:"Install SSL certificate (free via Let's Encrypt)" });
}

async function checkRobots(siteUrl, checks, issues) {
  try {
    const r = await fetch(new URL("/robots.txt", siteUrl).href, { signal: AbortSignal.timeout(4000) });
    checks.hasRobots = r.ok;
    if (r.ok) {
      const txt = await r.text();
      if (txt.match(/Disallow:\s*\/\s*$/im)) issues.push({ type:"robots_blocking", severity:"critical", detail:"robots.txt blocks Google from crawling the entire site", fix:"Remove 'Disallow: /' from robots.txt" });
    } else {
      issues.push({ type:"no_robots", severity:"warning", detail:"No robots.txt found", fix:"Create a robots.txt file" });
    }
  } catch { checks.hasRobots = false; }
}

async function checkSitemap(siteUrl, checks, issues) {
  try {
    const r = await fetch(new URL("/sitemap.xml", siteUrl).href, { signal: AbortSignal.timeout(4000) });
    checks.hasSitemap = r.ok;
    if (!r.ok) issues.push({ type:"no_sitemap", severity:"warning", detail:"No XML sitemap — Google can't discover all pages", fix:"Create and submit sitemap.xml to Google Search Console" });
  } catch { checks.hasSitemap = false; }
}

function checkMobile(checks, issues) {
  // Will be filled by on-page check below
  checks.mobileReady = null;
}

function checkOnPage(html, siteUrl, checks, issues) {
  // Title
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();
  checks.title = title;
  if (!title) issues.push({ type:"missing_title", severity:"critical", detail:"No title tag — Google can't understand what this page is about", fix:"Add a keyword-rich title tag (50–60 characters)" });
  else if (title.length > 70) issues.push({ type:"long_title", severity:"warning", detail:`Title too long: ${title.length} chars (max 60)`, fix:"Shorten title to under 60 characters" });

  // Meta description
  const desc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1]?.trim();
  checks.metaDesc = desc;
  if (!desc) issues.push({ type:"no_meta_desc", severity:"warning", detail:"No meta description — missed opportunity to drive clicks from search results", fix:"Add compelling 140–155 character meta description" });

  // H1
  const h1 = (html.match(/<h1[^>]*>/gi) || []).length;
  checks.h1Count = h1;
  if (h1 === 0) issues.push({ type:"no_h1", severity:"critical", detail:"No H1 tag — Google uses H1 to understand page topic", fix:"Add one H1 with primary keyword" });
  else if (h1 > 1) issues.push({ type:"multiple_h1", severity:"warning", detail:`${h1} H1 tags — should be exactly 1`, fix:"Keep only one H1 per page" });

  // Viewport (mobile)
  const hasViewport = /<meta[^>]*name=["']viewport["']/i.test(html);
  checks.mobileReady = hasViewport;
  if (!hasViewport) issues.push({ type:"not_mobile_ready", severity:"critical", detail:"No mobile viewport tag — site fails Google's mobile-first indexing", fix:"Add <meta name='viewport' content='width=device-width, initial-scale=1'>" });

  // Schema
  const hasSchema = /<script[^>]*type=["']application\/ld\+json["']/i.test(html);
  checks.hasSchema = hasSchema;
  if (!hasSchema) issues.push({ type:"no_schema", severity:"warning", detail:"No structured data — missing rich result eligibility", fix:"Add LocalBusiness or Organization schema" });

  // Images without alt
  const imgs     = [...html.matchAll(/<img[^>]+>/gi)];
  const noAlt    = imgs.filter(m => !/alt=["'][^"']+["']/i.test(m[0])).length;
  checks.imagesNoAlt = noAlt;
  if (noAlt > 3) issues.push({ type:"images_no_alt", severity:"warning", detail:`${noAlt} images missing alt text — accessibility and image SEO issue`, fix:"Add descriptive alt text to all images" });

  // Canonical
  const hasCanonical = /<link[^>]*rel=["']canonical["']/i.test(html);
  checks.hasCanonical = hasCanonical;
  if (!hasCanonical) issues.push({ type:"no_canonical", severity:"warning", detail:"No canonical tag — risk of duplicate content penalties", fix:"Add self-referencing canonical tag to all pages" });
}

function buildHook(score, top3Issues, url) {
  const domain = (() => { try { return new URL(url).hostname; } catch { return url; } })();
  if (score < 40) return `${domain} has serious SEO problems. ${top3Issues[0]?.detail || "Critical issues"} is costing you rankings right now.`;
  if (score < 65) return `${domain} is missing key ranking opportunities. ${top3Issues.length} issues found that competitors are exploiting.`;
  return `${domain} has a solid foundation with ${top3Issues.length} quick wins available to boost rankings.`;
}

module.exports = { runPreSalesAudit };
