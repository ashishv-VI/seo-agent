/**
 * Rule-Based Fallbacks — Zero API dependency
 * Replaces LLM calls in agents where the output is deterministic from the input data.
 *
 * Agents covered:
 *   - A7  technical recs  (CWV numbers → specific fixes)
 *   - A6  on-page recs    (audit checks → title/meta/schema fixes)
 *   - A12 auto-exec       (CMO decision → next agent pick)
 *   - A19 conversion      (audit + brief → CRO issues)
 *   - A23 investigator    (already has diagnoseAlert — this adds proposedFix)
 *   - A3  keywords        (SERP data → keyword clusters, priority tiers)
 *   - A8  geo             (checks → local SEO recs)
 */

// ─────────────────────────────────────────────────────────────────────────────
// A7 — Technical SEO & CWV recommendations
// Input: cwvData (PageSpeed result), audit (A2), brief
// ─────────────────────────────────────────────────────────────────────────────
function a7TechRecs(cwvData, audit) {
  const mobile       = cwvData?.mobile || {};
  const rawMetrics   = mobile.rawMetrics || {};
  const scores       = mobile.scores || {};
  const responseTime = audit?.checks?.responseTime || 0;
  const hasSSL       = audit?.checks?.hasSSL !== false;
  const brokenLinks  = audit?.checks?.brokenLinks?.length || 0;

  const priorityFixes = [];
  const infraRecs     = [];
  const mobileChecklist = [];

  // ── LCP (Largest Contentful Paint) ───────────────────────────────────────
  const lcpMs = rawMetrics.lcp?.ms || 0;
  if (lcpMs > 4000) {
    priorityFixes.push({
      issue: "LCP Critical — " + (rawMetrics.lcp?.display || lcpMs + "ms"),
      impact: "high", effort: "dev",
      fix: "Preload hero image with <link rel='preload'>. Serve images in WebP. Use a CDN. Remove render-blocking resources above the fold.",
      expectedImprovement: "LCP under 2.5s improves Core Web Vitals to 'Good', reduces bounce rate",
    });
    infraRecs.push({ type: "cdn", recommendation: "Add a CDN (Cloudflare free tier)", reason: "Serve static assets from edge nodes — fastest single LCP improvement" });
  } else if (lcpMs > 2500) {
    priorityFixes.push({
      issue: "LCP Needs Improvement — " + (rawMetrics.lcp?.display || lcpMs + "ms"),
      impact: "medium", effort: "cms",
      fix: "Optimise hero image: convert to WebP, add width/height, enable lazy loading for below-fold images only.",
      expectedImprovement: "Reduce LCP to under 2.5s",
    });
  }

  // ── CLS (Cumulative Layout Shift) ────────────────────────────────────────
  const clsVal = rawMetrics.cls?.value ?? null;
  if (clsVal !== null && clsVal > 0.25) {
    priorityFixes.push({
      issue: "CLS Poor — " + clsVal.toFixed(3),
      impact: "high", effort: "dev",
      fix: "Add explicit width and height to all images and iframes. Avoid inserting content above existing content after load. Pre-reserve space for ads/embeds.",
      expectedImprovement: "CLS under 0.1 — no more layout jumps for users",
    });
  } else if (clsVal !== null && clsVal > 0.1) {
    priorityFixes.push({
      issue: "CLS Needs Improvement — " + clsVal.toFixed(3),
      impact: "medium", effort: "cms",
      fix: "Find and fix elements that shift on load — check font loading (use font-display: swap) and banner/ad positions.",
      expectedImprovement: "CLS under 0.1",
    });
  }

  // ── TTFB / Response Time ──────────────────────────────────────────────────
  const ttfbMs = rawMetrics.ttfb?.ms || responseTime || 0;
  if (ttfbMs > 2000) {
    priorityFixes.push({
      issue: "TTFB Critical — " + ttfbMs + "ms (target: <600ms)",
      impact: "high", effort: "hosting",
      fix: "Upgrade to a faster host. Enable server-side caching (Redis/Varnish). Optimise database queries. Consider serverless or edge hosting.",
      expectedImprovement: "TTFB under 600ms — immediate improvement in all CWV metrics",
    });
    infraRecs.push({ type: "hosting", recommendation: "Upgrade hosting tier or switch to faster provider", reason: `${ttfbMs}ms TTFB is blocking all other optimisations` });
  } else if (ttfbMs > 800) {
    priorityFixes.push({
      issue: "TTFB Slow — " + ttfbMs + "ms",
      impact: "medium", effort: "config",
      fix: "Enable caching at the server level (WP: W3 Total Cache / WP Rocket). Enable gzip/brotli compression. Minimise server-side processing.",
      expectedImprovement: "TTFB under 800ms",
    });
    infraRecs.push({ type: "caching", recommendation: "Enable full-page caching", reason: "Most effective TTFB fix without changing infrastructure" });
  }

  // ── Performance score ────────────────────────────────────────────────────
  const perfScore = scores.performance ?? null;
  if (perfScore !== null && perfScore < 50) {
    priorityFixes.push({
      issue: "Mobile Performance Score " + perfScore + "/100",
      impact: "high", effort: "dev",
      fix: "Eliminate render-blocking JS/CSS. Defer non-critical scripts. Minify JS, CSS, HTML. Remove unused JavaScript.",
      expectedImprovement: "Performance 70+ — Google ranks fast pages higher",
    });
    infraRecs.push({ type: "compression", recommendation: "Enable Brotli/gzip compression for all text assets", reason: "Reduces asset size 60-80% — instant score improvement" });
  } else if (perfScore !== null && perfScore < 70) {
    priorityFixes.push({
      issue: "Mobile Performance Score " + perfScore + "/100",
      impact: "medium", effort: "plugin",
      fix: "Install a performance plugin (WP Rocket / Nitropack / NitroPack). Enable lazy loading. Defer non-essential third-party scripts.",
      expectedImprovement: "Performance 70+",
    });
  }

  // ── SSL ──────────────────────────────────────────────────────────────────
  if (!hasSSL) {
    priorityFixes.push({
      issue: "No HTTPS / SSL certificate",
      impact: "high", effort: "hosting",
      fix: "Install a free Let's Encrypt SSL certificate. Force HTTPS redirect in .htaccess or server config.",
      expectedImprovement: "HTTPS is a confirmed Google ranking signal. Removes 'Not Secure' browser warning.",
    });
  }

  // ── Broken links ─────────────────────────────────────────────────────────
  if (brokenLinks > 0) {
    priorityFixes.push({
      issue: brokenLinks + " broken link(s) detected",
      impact: brokenLinks > 5 ? "high" : "medium", effort: "cms",
      fix: "Fix or redirect all broken links. Use a redirect plugin for URLs that have moved permanently.",
      expectedImprovement: "Better crawlability, no PageRank leaking to 404 pages",
    });
  }

  // ── PageSpeed opportunities from Lighthouse (if available) ────────────────
  const lightOpps = mobile.opportunities || [];
  for (const opp of lightOpps.slice(0, 3)) {
    if (!priorityFixes.find(f => f.issue.toLowerCase().includes(opp.title?.toLowerCase().slice(0, 20) || ""))) {
      priorityFixes.push({
        issue:               opp.title,
        impact:              opp.score < 0.5 ? "high" : "medium",
        effort:              "dev",
        fix:                 opp.description || "Follow Google PageSpeed recommendation",
        expectedImprovement: opp.savings || "Improved performance score",
      });
    }
  }

  // ── Mobile checklist ─────────────────────────────────────────────────────
  mobileChecklist.push(
    { item: "Viewport meta tag",        status: audit?.checks?.viewport?.exists ? "pass" : "fail",   action: "Add <meta name='viewport' content='width=device-width, initial-scale=1'>" },
    { item: "HTTPS / SSL",              status: hasSSL ? "pass" : "fail",                              action: "Install SSL certificate" },
    { item: "Mobile perf score 70+",    status: perfScore >= 70 ? "pass" : perfScore >= 50 ? "check" : "fail", action: "Run PageSpeed and fix top opportunities" },
    { item: "LCP under 2.5s",           status: lcpMs <= 2500 && lcpMs > 0 ? "pass" : lcpMs === 0 ? "check" : "fail", action: "Optimise largest image/text element" },
    { item: "CLS under 0.1",            status: clsVal !== null && clsVal <= 0.1 ? "pass" : clsVal === null ? "check" : "fail", action: "Fix layout shift elements" },
    { item: "No render-blocking JS",    status: perfScore >= 80 ? "pass" : "check",                   action: "Defer non-critical scripts" },
    { item: "Images have alt text",     status: (audit?.checks?.altTextAudit?.missingAlt || 0) === 0 ? "pass" : "fail", action: "Add alt text to all images" },
    { item: "No broken links",          status: brokenLinks === 0 ? "pass" : "fail",                  action: "Fix or redirect broken URLs" }
  );

  // ── CWV status summary ────────────────────────────────────────────────────
  const cwvStatus = {
    lcp: lcpMs === 0 ? "unknown" : lcpMs <= 2500 ? "good" : lcpMs <= 4000 ? "needs_improvement" : "poor",
    inp: rawMetrics.inp?.ms === 0 ? "unknown" : (rawMetrics.inp?.ms || 0) <= 200 ? "good" : (rawMetrics.inp?.ms || 0) <= 500 ? "needs_improvement" : "poor",
    cls: clsVal === null ? "unknown" : clsVal <= 0.1 ? "good" : clsVal <= 0.25 ? "needs_improvement" : "poor",
    overallAssessment: buildCWVSummary(perfScore, lcpMs, clsVal, ttfbMs),
  };

  return {
    priorityFixes: priorityFixes.slice(0, 8),
    infrastructureRecommendations: infraRecs,
    mobileChecklist,
    cwvStatus,
    generatedBy: "rule-engine",
  };
}

function buildCWVSummary(perf, lcpMs, cls, ttfb) {
  if (!perf && !lcpMs) return "No CWV data available — run PageSpeed Insights to get real metrics.";
  const issues = [];
  if (lcpMs > 4000)       issues.push("LCP is critical");
  if (lcpMs > 2500)       issues.push("LCP needs improvement");
  if (cls !== null && cls > 0.25) issues.push("CLS is poor — layout shifts detected");
  if (ttfb > 2000)        issues.push("server response too slow");
  if (perf !== null && perf < 50)  issues.push("overall mobile performance is low");
  if (issues.length === 0) return `Performance score ${perf || "N/A"}/100 — Core Web Vitals are healthy.`;
  return `Performance score ${perf || "N/A"}/100. Issues: ${issues.join(", ")}. Fix in priority order above.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// A6 — On-Page SEO recommendations
// Input: audit (A2 checks), keywords (A3), brief
// ─────────────────────────────────────────────────────────────────────────────
function a6OnPageRecs(audit, keywords, brief) {
  const checks    = audit?.checks || {};
  const topKws    = (keywords?.keywordMap || []).filter(k => k.priority === "high").slice(0, 5).map(k => k.keyword);
  const primaryKw = topKws[0] || brief?.businessName || "";
  const siteUrl   = brief?.websiteUrl || "";
  const recs      = { titleOptimisations: [], metaOptimisations: [], schemaRecommendations: [], internalLinkingPlan: [], quickWins: [] };

  // ── Title tag ────────────────────────────────────────────────────────────
  const currentTitle  = checks.title?.value || "";
  const titleLen      = checks.title?.length || 0;
  const titleHasKw    = primaryKw && currentTitle.toLowerCase().includes(primaryKw.toLowerCase());
  if (!currentTitle) {
    recs.titleOptimisations.push({ issue: "Missing title tag", current: "(none)", recommended: `${primaryKw} — ${brief?.businessName || "Your Business"}`, priority: "critical" });
  } else if (!titleHasKw && primaryKw) {
    recs.titleOptimisations.push({ issue: "Title missing primary keyword", current: currentTitle, recommended: `${primaryKw} | ${brief?.businessName || ""}`.slice(0, 60), priority: "high" });
  } else if (titleLen > 65) {
    recs.titleOptimisations.push({ issue: `Title too long (${titleLen} chars)`, current: currentTitle, recommended: currentTitle.slice(0, 60) + "…", priority: "medium" });
  } else if (titleLen < 30) {
    recs.titleOptimisations.push({ issue: `Title too short (${titleLen} chars)`, current: currentTitle, recommended: `${currentTitle} — ${primaryKw || brief?.businessName || ""}`.slice(0, 60), priority: "medium" });
  }

  // ── Meta description ─────────────────────────────────────────────────────
  const currentMeta = checks.metaDescription?.value || "";
  const metaLen     = checks.metaDescription?.length || 0;
  if (!currentMeta) {
    const ctaMap = { ecommerce: "Shop now", lead_gen: "Get a free quote", saas: "Start free trial", local: "Call us today", default: "Learn more" };
    const cta    = ctaMap[brief?.businessType] || ctaMap.default;
    recs.metaOptimisations.push({ issue: "Missing meta description", current: "(none)", recommended: `${brief?.businessDescription?.slice(0, 100) || primaryKw + " services"}. ${cta} →`, priority: "high" });
  } else if (metaLen > 160) {
    recs.metaOptimisations.push({ issue: `Meta too long (${metaLen} chars)`, current: currentMeta, recommended: currentMeta.slice(0, 155) + "…", priority: "medium" });
  } else if (metaLen < 80) {
    recs.metaOptimisations.push({ issue: `Meta too short (${metaLen} chars) — expand with keyword + CTA`, current: currentMeta, recommended: `${currentMeta} — ${primaryKw || "expert services"}. Contact us today.`, priority: "medium" });
  }

  // ── Schema ────────────────────────────────────────────────────────────────
  const schemas = checks.schemaTypes || [];
  if (!schemas.includes("Organization") && !schemas.includes("LocalBusiness")) {
    recs.schemaRecommendations.push({ type: "Organization", priority: "high", reason: "Tells Google who you are — name, logo, social links, contact", template: `{"@context":"https://schema.org","@type":"Organization","name":"${brief?.businessName || ""}","url":"${siteUrl}"}` });
  }
  if (!schemas.includes("WebSite")) {
    recs.schemaRecommendations.push({ type: "WebSite", priority: "medium", reason: "Enables sitelinks search box in Google results", template: `{"@context":"https://schema.org","@type":"WebSite","url":"${siteUrl}","potentialAction":{"@type":"SearchAction","target":{"@type":"EntryPoint","urlTemplate":"${siteUrl}?q={search_term_string}"},"query-input":"required name=search_term_string"}}` });
  }
  if (!schemas.includes("BreadcrumbList")) {
    recs.schemaRecommendations.push({ type: "BreadcrumbList", priority: "medium", reason: "Shows breadcrumbs in Google results — improves CTR by 5-10%" });
  }
  if (brief?.businessType === "local" && !schemas.includes("LocalBusiness")) {
    recs.schemaRecommendations.push({ type: "LocalBusiness", priority: "high", reason: "Critical for local SEO — enables knowledge panel + map pack" });
  }
  if (!schemas.includes("FAQPage") && (checks.wordCount || 0) > 500) {
    recs.schemaRecommendations.push({ type: "FAQPage", priority: "low", reason: "FAQ schema can earn featured snippet position (position 0)" });
  }

  // ── Internal linking ──────────────────────────────────────────────────────
  const pageCount = checks.internalLinksFound || 0;
  if (pageCount > 5) {
    recs.internalLinkingPlan.push({ action: "Audit internal links with Site Patterns tab to find orphan pages", priority: "high" });
    recs.internalLinkingPlan.push({ action: `Link homepage to top ${Math.min(5, pageCount)} pages using keyword-rich anchor text: ${topKws.slice(0, 3).join(", ")}`, priority: "high" });
    recs.internalLinkingPlan.push({ action: "Add breadcrumb navigation to all inner pages", priority: "medium" });
  }

  // ── Quick wins ────────────────────────────────────────────────────────────
  const noH1Pages = (audit?.issues?.p2 || []).find(i => i.type === "inner_pages_no_h1");
  if (noH1Pages) recs.quickWins.push({ action: `Add H1 to ${noH1Pages.detail}`, effort: "15 min/page", impact: "high" });

  const dupTitles = (audit?.issues?.p2 || []).find(i => i.type === "duplicate_titles");
  if (dupTitles) recs.quickWins.push({ action: "Fix duplicate title tags — each page needs a unique title", effort: "30 min", impact: "high" });

  const missingOg = (audit?.issues?.p2 || []).find(i => i.type === "missing_og_tags");
  if (missingOg) recs.quickWins.push({ action: "Add og:title, og:description, og:image for social sharing", effort: "1 hour", impact: "medium" });

  for (const kw of topKws.slice(0, 3)) {
    recs.quickWins.push({ action: `Add "${kw}" to H2 headings on relevant pages`, effort: "10 min/page", impact: "medium" });
  }

  return { ...recs, generatedBy: "rule-engine" };
}

// ─────────────────────────────────────────────────────────────────────────────
// A3 — Keyword clusters and priority tiers (no LLM needed)
// Input: serpResults, brief, audit
// ─────────────────────────────────────────────────────────────────────────────
function a3KeywordClusters(serpKeywords, brief, audit) {
  if (!serpKeywords || serpKeywords.length === 0) return null;

  const businessName = brief?.businessName || "";
  const location     = brief?.targetLocation || brief?.location || "";
  const service      = brief?.primaryService || brief?.businessDescription?.split(" ").slice(0, 3).join(" ") || "";

  const keywordMap = serpKeywords.map(kw => {
    const keyword  = kw.keyword || kw.query || "";
    const position = kw.position || kw.rank || 50;
    const volume   = kw.impressions || kw.volume || 0;
    const ctr      = kw.ctr || 0;

    // Intent classification by keyword patterns
    let intent = "informational";
    if (/\b(buy|price|cost|cheap|best|top|review|vs|compare|hire|get|quote)\b/i.test(keyword)) intent = "commercial";
    if (/\b(how to|what is|why|guide|tutorial|learn|tips|ideas)\b/i.test(keyword)) intent = "informational";
    if (/\b(near me|in [a-z]+|[a-z]+ [a-z]+\s+services?)\b/i.test(keyword)) intent = "local";
    if (keyword.toLowerCase().includes(businessName.toLowerCase())) intent = "navigational";

    // Difficulty estimate from position (proxy: ranking well = achievable)
    let difficulty;
    if (position <= 10)      difficulty = "medium";   // already ranking — maintain
    else if (position <= 20) difficulty = "medium";   // page 2 — easy win
    else if (position <= 50) difficulty = "hard";
    else                     difficulty = "unknown";

    // Priority: page 2 keywords are the best quick wins
    let priority;
    if (position >= 11 && position <= 20 && volume > 50) priority = "high";        // page 2 quick wins
    else if (position <= 10 && ctr < 0.03 && volume > 100) priority = "high";      // ranking but low CTR
    else if (position <= 10) priority = "medium";                                    // already good
    else if (volume > 200)   priority = "medium";
    else                     priority = "low";

    // Suggested page mapping
    let suggestedPage = "/";
    if (intent === "local")         suggestedPage = "/contact";
    else if (intent === "commercial") suggestedPage = "/services";
    else if (intent === "informational") suggestedPage = "/blog";

    return { keyword, position, volume: volume || 0, ctr: Math.round((ctr || 0) * 1000) / 10, intent, difficulty, priority, suggestedPage };
  });

  // Quick wins: page 2 + high volume
  const quickWins = keywordMap
    .filter(k => k.position >= 11 && k.position <= 20)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 10);

  // Cluster by intent
  const clusters = {
    commercial:    keywordMap.filter(k => k.intent === "commercial"),
    informational: keywordMap.filter(k => k.intent === "informational"),
    local:         keywordMap.filter(k => k.intent === "local"),
    navigational:  keywordMap.filter(k => k.intent === "navigational"),
  };

  // Long-tail opportunities (lower volume, lower competition proxy)
  const longTail = keywordMap
    .filter(k => (k.keyword || "").split(" ").length >= 3 && k.position > 20)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 10);

  return {
    keywordMap,
    quickWins,
    clusters,
    longTail,
    totalKeywords:  keywordMap.length,
    highPriority:   keywordMap.filter(k => k.priority === "high").length,
    generatedBy:    "rule-engine",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// A8 — Local / GEO SEO recommendations
// ─────────────────────────────────────────────────────────────────────────────
function a8GeoRecs(brief, audit) {
  const recs    = [];
  const html    = audit?.checks?._homepageHtml || "";
  const schemas = audit?.checks?.schemaTypes || [];

  const hasLocalBizSchema = schemas.includes("LocalBusiness");
  const hasNAP            = /\b(\+\d{10,}|\(\d{3}\)\s*\d{3}[-\s]\d{4}|\d{3}[-\s]\d{3}[-\s]\d{4})\b/.test(html);
  const hasAddress        = /(street|avenue|road|lane|drive|blvd|suite|floor|\b\d{4,5}\b.*[A-Z]{2})/i.test(html);
  const hasGBPLink        = /maps\.google|google\.com\/maps|goo\.gl\/maps/i.test(html);
  const hasSocialLinks    = /linkedin|twitter|facebook|instagram/i.test(html);
  const isLocal           = brief?.businessType === "local" || brief?.targetLocation;

  const result = {
    napStatus: {
      hasPhone:   hasNAP,
      hasAddress: hasAddress,
      consistent: hasNAP && hasAddress,
      recommendations: [],
    },
    gbpStatus: {
      hasGBPLink,
      recommendations: [],
    },
    localSchemaStatus: {
      hasLocalBizSchema,
      recommendations: [],
    },
    localCitations: [],
    recommendations: recs,
    generatedBy: "rule-engine",
  };

  if (!hasNAP) {
    result.napStatus.recommendations.push({ action: "Add phone number to homepage header and footer", priority: "high", impact: "Local pack visibility + trust" });
    recs.push({ type: "nap", action: "Add phone number to homepage", priority: "high" });
  }
  if (!hasAddress) {
    result.napStatus.recommendations.push({ action: "Add full business address to homepage footer", priority: "high", impact: "NAP consistency for local SEO" });
    recs.push({ type: "nap", action: "Add physical address to footer", priority: "high" });
  }
  if (!hasGBPLink) {
    result.gbpStatus.recommendations.push({ action: "Create or claim Google Business Profile — it's free and drives local pack rankings", priority: "critical" });
    recs.push({ type: "gbp", action: "Create/claim Google Business Profile", priority: "critical" });
  }
  if (!hasLocalBizSchema && isLocal) {
    result.localSchemaStatus.recommendations.push({ action: "Add LocalBusiness schema with name, address, phone, openingHours", priority: "high", impact: "Rich results in Google + map pack eligibility" });
    recs.push({ type: "schema", action: "Add LocalBusiness structured data", priority: "high" });
  }
  if (!hasSocialLinks) {
    recs.push({ type: "eeat", action: "Add links to social profiles (LinkedIn, Facebook) — E-E-A-T trust signals", priority: "medium" });
  }

  // Citation opportunities
  const citationSites = ["Google Business Profile", "Bing Places", "Apple Maps", "Yelp", "Yellow Pages", "Foursquare", "TripAdvisor (if relevant)", "Facebook Business", "LinkedIn Company Page"];
  result.localCitations = citationSites.map(site => ({
    site,
    status: site === "Google Business Profile" && hasGBPLink ? "listed" : "check",
    action: "Ensure NAP is consistent with your website",
  }));

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// A12 — Auto-exec: determine next agent from CMO decision
// This is already deterministic — LLM is completely unnecessary here
// ─────────────────────────────────────────────────────────────────────────────
function a12NextAgent(cmoDecision, agentStates) {
  // CMO already decided — just pick the first queued agent
  const nextAgents = cmoDecision?.nextAgents || [];
  if (nextAgents.length > 0) {
    return { nextAgent: nextAgents[0], reason: cmoDecision?.reasoning || "CMO decision", confidence: cmoDecision?.confidence || 0.8 };
  }

  // Fallback: determine by what's missing
  if (!agentStates.A3_keywords?.status)   return { nextAgent: "A3", reason: "Keywords not researched yet", confidence: 0.9 };
  if (!agentStates.A5_content?.status)    return { nextAgent: "A5", reason: "Content not optimised yet", confidence: 0.8 };
  if (!agentStates.A6_onpage?.status)     return { nextAgent: "A6", reason: "On-page not optimised yet", confidence: 0.8 };
  if (!agentStates.A11_links?.status)     return { nextAgent: "A11", reason: "Link building not started", confidence: 0.7 };
  return { nextAgent: "A9", reason: "Re-run monitoring report", confidence: 0.6 };
}

// ─────────────────────────────────────────────────────────────────────────────
// A19 — Conversion optimisation issues (CRO)
// ─────────────────────────────────────────────────────────────────────────────
function a19CROAnalysis(audit, brief, keywords) {
  const html     = audit?.checks?._homepageHtml || "";
  const checks   = audit?.checks || {};
  const goalType = brief?.conversionGoal || brief?.businessType || "leads";
  const issues   = [];
  const wins     = [];

  // ── CTA detection ────────────────────────────────────────────────────────
  const hasCTA     = /<button|<a[^>]*(?:btn|button|cta|call-to-action)[^>]*>/i.test(html) || /(?:contact us|get a quote|book now|start free|sign up|buy now|shop now|get started)/i.test(html);
  const hasForm    = /<form[^>]*>/i.test(html);
  const hasPhone   = /\b(\+\d{10,}|\(\d{3}\)\s*\d{3}[-\s]\d{4})\b/.test(html);
  const hasChat    = /livechat|tawk|intercom|drift|crisp|freshchat/i.test(html);
  const hasSSL     = checks.hasSSL !== false;
  const hasSocProof = /testimonial|review|rating|stars|client|customer/i.test(html);
  const wordCount  = checks.wordCount || 0;

  if (!hasCTA) {
    issues.push({ type: "missing_cta", severity: "critical", page: "/", issue: "No clear call-to-action detected on homepage", fix: "Add a prominent CTA button above the fold: 'Get a Free Quote', 'Book Now', or 'Start Today'", estimatedUplift: "+15-30% conversion rate" });
  }
  if (!hasForm && (goalType === "leads" || goalType === "lead_gen")) {
    issues.push({ type: "no_contact_form", severity: "high", page: "/", issue: "No contact form on homepage", fix: "Add a short lead capture form (name, email, phone, message) above the fold or in a sticky sidebar", estimatedUplift: "+20% lead capture" });
  }
  if (!hasPhone) {
    issues.push({ type: "no_phone_number", severity: "high", page: "/", issue: "No phone number visible", fix: "Add phone number to header — click-to-call on mobile converts 3x better than forms", estimatedUplift: "+10% mobile conversions" });
  }
  if (!hasSocProof) {
    issues.push({ type: "no_social_proof", severity: "medium", page: "/", issue: "No testimonials, reviews, or trust indicators visible", fix: "Add 3-5 client testimonials with names/photos. Add Google review count. Add logos of clients/partners.", estimatedUplift: "+12% trust + conversion rate" });
  }
  if (!hasSSL) {
    issues.push({ type: "no_https", severity: "critical", page: "/", issue: "Site not on HTTPS — browsers show 'Not Secure'", fix: "Install SSL certificate immediately — 85% of users abandon sites marked 'Not Secure'", estimatedUplift: "Prevent conversion loss" });
  }
  if (wordCount < 200) {
    issues.push({ type: "thin_homepage", severity: "medium", page: "/", issue: `Homepage only ~${wordCount} words — insufficient to build trust or rank`, fix: "Expand homepage with: what you do, who you serve, why choose you, social proof, clear CTA", estimatedUplift: "+8% engagement" });
  }
  if (!hasChat) {
    wins.push({ action: "Add live chat widget (Tawk.to is free)", impact: "medium", effort: "low", reason: "Live chat typically increases conversions 20-45%" });
  }

  // Page speed as conversion issue
  const responseTime = checks.responseTime || 0;
  if (responseTime > 3000) {
    issues.push({ type: "page_speed_conversion", severity: "high", page: "/", issue: `Site takes ${responseTime}ms to respond — each 1s delay reduces conversions 7%`, fix: "Fix page speed (see A7 technical recommendations)", estimatedUplift: "Prevent 20%+ conversion loss" });
  }

  const conversionScore = Math.max(10, 100 - (issues.filter(i => i.severity === "critical").length * 25) - (issues.filter(i => i.severity === "high").length * 15) - (issues.filter(i => i.severity === "medium").length * 8));

  return {
    conversionScore,
    issues,
    quickWins: wins,
    summary: {
      hasCTA, hasForm, hasPhone, hasChat, hasSocProof,
      criticalCount: issues.filter(i => i.severity === "critical").length,
      highCount:     issues.filter(i => i.severity === "high").length,
    },
    generatedBy: "rule-engine",
  };
}

module.exports = {
  a7TechRecs,
  a6OnPageRecs,
  a3KeywordClusters,
  a8GeoRecs,
  a12NextAgent,
  a19CROAnalysis,
};
