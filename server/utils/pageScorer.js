/**
 * Per-Page SEO Scorer
 * Scores each page 0-100 across 8 dimensions:
 *   1. Title (15pts)       — exists, length, keyword presence
 *   2. Meta Desc (10pts)   — exists, length, CTA presence
 *   3. H1 (15pts)          — exactly one, keyword, not empty
 *   4. Content (20pts)     — word count, headings structure, freshness
 *   5. Speed (15pts)       — response time, image optimisation
 *   6. Schema (10pts)      — structured data types present
 *   7. Internal Links (10pts) — has inbound links, no orphan
 *   8. Technical (5pts)    — canonical, viewport, no noindex
 *
 * Usage:
 *   const { scorePage, scoreAllPages } = require("./pageScorer");
 *   const score = scorePage(pageData);
 */

/**
 * Score a single page
 * @param {Object} page - page data from A2 audit subcollection or crawl result
 * @param {Object} opts
 * @param {string[]} opts.targetKeywords - primary keywords to check presence
 * @param {number}   opts.inboundLinkCount - how many internal links point to this page
 * @returns {Object} { score, dimensions, recommendations }
 */
function scorePage(page = {}, opts = {}) {
  const { targetKeywords = [], inboundLinkCount = 0 } = opts;
  const dimensions = {};
  const recommendations = [];

  // ── 1. Title (15 points) ────────────────────────────────────────────────
  let titleScore = 0;
  const title       = page.title || "";
  const titleLength = title.length;
  if (title && title !== "(missing)") {
    titleScore += 5;  // exists
    if (titleLength >= 40 && titleLength <= 65) titleScore += 5;  // optimal length
    else if (titleLength >= 20 && titleLength <= 75) titleScore += 2;  // acceptable
    // keyword presence
    if (targetKeywords.length > 0) {
      const titleLower = title.toLowerCase();
      const hasKw = targetKeywords.some(kw => titleLower.includes((kw || "").toLowerCase()));
      if (hasKw) titleScore += 5;
    } else {
      titleScore += 3; // no keywords to check — give partial credit
    }
  } else {
    recommendations.push({ type: "missing_title", priority: "critical", fix: "Add a title tag (50-60 chars) with your primary keyword" });
  }
  if (titleLength > 70) recommendations.push({ type: "long_title", priority: "medium", fix: `Shorten title from ${titleLength} to under 65 chars` });
  dimensions.title = { score: Math.min(15, titleScore), max: 15 };

  // ── 2. Meta Description (10 points) ─────────────────────────────────────
  let metaScore = 0;
  const meta       = page.metaDescription || page.meta_description || "";
  const metaLength = meta.length;
  if (meta) {
    metaScore += 4;  // exists
    if (metaLength >= 120 && metaLength <= 160) metaScore += 4;  // optimal
    else if (metaLength >= 80)  metaScore += 2;
    // CTA presence (rough check)
    const ctaWords = ["learn", "discover", "get", "find", "contact", "call", "book", "try", "start", "shop"];
    if (ctaWords.some(w => meta.toLowerCase().includes(w))) metaScore += 2;
  } else {
    recommendations.push({ type: "missing_meta", priority: "high", fix: "Write a meta description (140-155 chars) with a call to action" });
  }
  dimensions.metaDescription = { score: Math.min(10, metaScore), max: 10 };

  // ── 3. H1 (15 points) ────────────────────────────────────────────────────
  let h1Score = 0;
  const hasH1     = page.hasH1 || !!(page.h1 && page.h1 !== "(missing)");
  const h1Text    = page.h1 || "";
  const h1Count   = page.h1Count || (hasH1 ? 1 : 0);
  if (hasH1) {
    h1Score += 7;  // exists
    if (h1Count === 1) h1Score += 3;  // exactly one
    else if (h1Count > 1) recommendations.push({ type: "multiple_h1", priority: "medium", fix: `Remove extra H1 tags — only one per page` });
    // keyword in H1
    if (targetKeywords.length > 0) {
      const h1Lower = h1Text.toLowerCase();
      if (targetKeywords.some(kw => h1Lower.includes((kw || "").toLowerCase()))) h1Score += 5;
    } else {
      h1Score += 3;
    }
  } else {
    recommendations.push({ type: "missing_h1", priority: "critical", fix: "Add one H1 tag with your primary keyword" });
  }
  dimensions.h1 = { score: Math.min(15, h1Score), max: 15 };

  // ── 4. Content (20 points) ───────────────────────────────────────────────
  let contentScore = 0;
  const wordCount = page.wordCount || 0;
  if (wordCount >= 800)       contentScore += 10;
  else if (wordCount >= 500)  contentScore += 7;
  else if (wordCount >= 300)  contentScore += 4;
  else if (wordCount >= 100)  contentScore += 2;
  else recommendations.push({ type: "thin_content", priority: "high", fix: `Page has only ${wordCount} words — expand to 500+ words` });

  // Heading structure (H2s present)
  const h2Count = page.h2Count || 0;
  if (h2Count >= 3)     contentScore += 5;
  else if (h2Count >= 1) contentScore += 3;
  else                   recommendations.push({ type: "no_h2", priority: "medium", fix: "Add H2 subheadings to structure your content" });

  // Freshness signal
  const freshness = page.freshness || page.contentFreshness?.freshnessSignal || "unknown";
  if (freshness === "fresh" || freshness === "recent")    contentScore += 5;
  else if (freshness === "aging")                          contentScore += 2;
  else if (freshness === "stale")
    recommendations.push({ type: "stale_content", priority: "low", fix: "Update content — appears over 2 years old" });

  dimensions.content = { score: Math.min(20, contentScore), max: 20 };

  // ── 5. Speed (15 points) ─────────────────────────────────────────────────
  let speedScore = 0;
  const responseTime = page.responseTime || 0;
  if (responseTime > 0 && responseTime <= 400)       speedScore += 10;
  else if (responseTime <= 800)                       speedScore += 7;
  else if (responseTime <= 1500)                      speedScore += 4;
  else if (responseTime <= 3000)                      speedScore += 2;
  else if (responseTime > 3000)
    recommendations.push({ type: "slow_page", priority: "high", fix: `Page loads in ${responseTime}ms — target under 800ms` });

  // Image optimization
  const altMissing = page.altMissing || 0;
  const totalImages = page.totalImages || 0;
  if (altMissing === 0 && totalImages > 0) speedScore += 5;
  else if (altMissing === 0)               speedScore += 3;  // no images — no penalty
  else if (altMissing <= 2)               speedScore += 2;
  else recommendations.push({ type: "missing_alt", priority: "medium", fix: `${altMissing} images missing alt text` });

  dimensions.speed = { score: Math.min(15, speedScore), max: 15 };

  // ── 6. Schema (10 points) ────────────────────────────────────────────────
  let schemaScore = 0;
  const schemas = page.schemas || page.schemaTypes || [];
  if (schemas.length >= 3)  schemaScore = 10;
  else if (schemas.length === 2) schemaScore = 7;
  else if (schemas.length === 1) schemaScore = 4;
  else recommendations.push({ type: "no_schema", priority: "medium", fix: "Add structured data (Organization, WebPage, BreadcrumbList) to help Google understand your content" });
  dimensions.schema = { score: Math.min(10, schemaScore), max: 10 };

  // ── 7. Internal Links (10 points) ────────────────────────────────────────
  let linksScore = 0;
  if (inboundLinkCount >= 5)      linksScore = 10;
  else if (inboundLinkCount >= 3) linksScore = 7;
  else if (inboundLinkCount >= 1) linksScore = 4;
  else {
    linksScore = 0;
    recommendations.push({ type: "orphan_page", priority: "high", fix: "No internal links point to this page — add links from relevant pages" });
  }
  dimensions.internalLinks = { score: Math.min(10, linksScore), max: 10 };

  // ── 8. Technical (5 points) ──────────────────────────────────────────────
  let techScore = 0;
  if (page.hasCanonical || page.canonical)  techScore += 2;
  else recommendations.push({ type: "no_canonical", priority: "low", fix: "Add a self-referencing canonical tag" });
  if (!page.noindex)                         techScore += 2;
  else recommendations.push({ type: "noindex", priority: "critical", fix: "Page is set to noindex — remove this tag to allow Google to index it" });
  if (page.statusCode === 200 || !page.statusCode) techScore += 1;
  dimensions.technical = { score: Math.min(5, techScore), max: 5 };

  // ── Total Score ───────────────────────────────────────────────────────────
  const totalScore = Object.values(dimensions).reduce((s, d) => s + d.score, 0);
  const maxScore   = Object.values(dimensions).reduce((s, d) => s + d.max, 0); // 100

  return {
    url:             page.url,
    score:           Math.min(100, Math.round(totalScore)),
    maxScore,
    grade:           scoreToGrade(totalScore),
    dimensions,
    recommendations: recommendations.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]),
    wordCount,
    title,
    targetKeywords,
  };
}

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function scoreToGrade(score) {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

/**
 * Score all pages from A2 audit subcollection
 * @param {string}   clientId
 * @param {string[]} targetKeywords
 * @returns {Object} { pages, summary, patterns }
 */
async function scoreAllPages(clientId, targetKeywords = []) {
  const { db } = require("../config/firebase");

  // Build inbound link map: how many internal links point to each page
  const inboundMap = {};
  let pagesSnap;
  try {
    pagesSnap = await db.collection("audits").doc(clientId).collection("pages").limit(500).get();
  } catch {
    return { pages: [], summary: { total: 0 }, patterns: [] };
  }

  if (pagesSnap.empty) return { pages: [], summary: { total: 0 }, patterns: [] };

  // First pass: build inbound link counts from outbound link data
  for (const doc of pagesSnap.docs) {
    const data = doc.data();
    if (data.internalLinksTo) {
      for (const linkedUrl of (data.internalLinksTo || [])) {
        inboundMap[linkedUrl] = (inboundMap[linkedUrl] || 0) + 1;
      }
    }
  }

  // Second pass: score each page
  const scored = [];
  for (const doc of pagesSnap.docs) {
    const page  = doc.data();
    const score = scorePage(page, {
      targetKeywords,
      inboundLinkCount: inboundMap[page.url] || 0,
    });
    scored.push(score);
  }

  // Sort by score ascending (worst first — most important to fix)
  scored.sort((a, b) => a.score - b.score);

  // ── Summary ───────────────────────────────────────────────────────────────
  const avgScore   = scored.length > 0 ? Math.round(scored.reduce((s, p) => s + p.score, 0) / scored.length) : 0;
  const gradeDistrib = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const p of scored) gradeDistrib[p.grade]++;

  const patterns = detectScoringPatterns(scored);

  return {
    pages: scored,
    summary: {
      total:           scored.length,
      avgScore,
      gradeDistribution: gradeDistrib,
      lowestScoring:   scored.slice(0, 5).map(p => ({ url: p.url, score: p.score, grade: p.grade })),
      highestScoring:  [...scored].reverse().slice(0, 5).map(p => ({ url: p.url, score: p.score, grade: p.grade })),
    },
    patterns,
    scoredAt: new Date().toISOString(),
  };
}

/**
 * Detect site-wide patterns from page scores
 */
function detectScoringPatterns(scored) {
  const patterns = [];
  const total = scored.length;
  if (total === 0) return patterns;

  // Orphan pages
  const orphans = scored.filter(p => p.dimensions.internalLinks.score === 0);
  if (orphans.length > 0) {
    patterns.push({
      type:     "orphan_pages",
      severity: orphans.length / total > 0.3 ? "critical" : "high",
      count:    orphans.length,
      pct:      Math.round((orphans.length / total) * 100),
      message:  `${orphans.length} pages have no internal links pointing to them`,
      fix:      "Add internal links to orphan pages from relevant content",
      urls:     orphans.slice(0, 10).map(p => p.url),
    });
  }

  // Missing title
  const noTitle = scored.filter(p => p.dimensions.title.score < 5);
  if (noTitle.length > 0) {
    patterns.push({
      type:     "pages_no_title",
      severity: "critical",
      count:    noTitle.length,
      pct:      Math.round((noTitle.length / total) * 100),
      message:  `${noTitle.length} pages have missing or poor title tags`,
      fix:      "Add keyword-optimised titles to all pages",
      urls:     noTitle.slice(0, 10).map(p => p.url),
    });
  }

  // Thin content
  const thinContent = scored.filter(p => p.wordCount > 0 && p.wordCount < 300);
  if (thinContent.length > 2) {
    patterns.push({
      type:     "thin_content_pages",
      severity: thinContent.length / total > 0.3 ? "high" : "medium",
      count:    thinContent.length,
      pct:      Math.round((thinContent.length / total) * 100),
      message:  `${thinContent.length} pages have fewer than 300 words`,
      fix:      "Expand thin pages with useful, relevant content",
      urls:     thinContent.slice(0, 10).map(p => p.url),
    });
  }

  // No schema
  const noSchema = scored.filter(p => p.dimensions.schema.score === 0);
  if (noSchema.length > 3) {
    patterns.push({
      type:     "no_schema",
      severity: "medium",
      count:    noSchema.length,
      pct:      Math.round((noSchema.length / total) * 100),
      message:  `${noSchema.length} pages have no structured data`,
      fix:      "Add Schema.org markup to pages to improve rich results eligibility",
      urls:     noSchema.slice(0, 10).map(p => p.url),
    });
  }

  // Low content score across the site
  const avgContent = scored.reduce((s, p) => s + p.dimensions.content.score, 0) / total;
  if (avgContent < 8) {
    patterns.push({
      type:     "site_wide_thin_content",
      severity: "high",
      count:    total,
      pct:      100,
      message:  `Average content score is ${Math.round(avgContent)}/20 across the site`,
      fix:      "Invest in content depth — most pages need more words and better heading structure",
      urls:     [],
    });
  }

  return patterns;
}

module.exports = { scorePage, scoreAllPages, detectScoringPatterns, scoreToGrade };
