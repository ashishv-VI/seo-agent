const { saveState, getState } = require("../shared-state/stateManager");
const { callLLM, parseJSON }  = require("../utils/llm");
const { emitToolSuggestion }  = require("../utils/toolBridge");

// Deep-sanitize object before writing to Firestore — removes all undefined values
function sanitize(obj) {
  if (obj === undefined || obj === null) return null;
  if (typeof obj !== "object")           return obj;
  if (Array.isArray(obj))                return obj.map(sanitize);
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, sanitize(v)])
  );
}

/**
 * A6 — On-Page & Tag Management Agent
 * Runs in parallel with A5 — no dependency on content
 * Produces implementation specs for HTML + tracking fixes
 */
async function runA6(clientId, keys) {
  const brief    = await getState(clientId, "A1_brief");
  const audit    = await getState(clientId, "A2_audit");
  const keywords = await getState(clientId, "A3_keywords");
  const content  = await getState(clientId, "A5_content"); // optional — A6 runs in parallel with A5

  if (!brief?.signedOff) return { success: false, error: "A1 brief not signed off" };
  if (!audit?.status)    return { success: false, error: "A2 audit must complete first" };

  const issues   = audit.issues || { p1:[], p2:[], p3:[] };
  const checks   = audit.checks || {};
  const siteUrl  = brief.websiteUrl;

  // ── Build on-page fix queue from A2 issues ─────────
  const fixQueue = [];

  // Title fix
  if (!checks.title?.exists || checks.title?.length > 70 || checks.title?.length < 10) {
    const recommended = content?.contentData?.homepageOptimisation?.titleTag?.recommended;
    fixQueue.push({
      type:        "title_tag",
      page:        "/",
      priority:    "p1",
      current:     checks.title?.value || "(missing)",
      recommended: recommended || "See A5 content recommendations",
      implementation: "Update <title> tag in page <head>",
      status:      "pending",
    });
  }

  // Meta description fix
  if (!checks.metaDescription?.exists) {
    const recommended = content?.contentData?.homepageOptimisation?.metaDescription?.recommended;
    fixQueue.push({
      type:        "meta_description",
      page:        "/",
      priority:    "p2",
      current:     "(missing)",
      recommended: recommended || "See A5 content recommendations",
      implementation: `Add <meta name="description" content="..."> in page <head>`,
      status:      "pending",
    });
  }

  // H1 fix
  if (checks.h1?.count !== 1) {
    fixQueue.push({
      type:        "h1_tag",
      page:        "/",
      priority:    checks.h1?.count === 0 ? "p1" : "p2",
      current:     `${checks.h1?.count || 0} H1 tags found`,
      recommended: content?.contentData?.homepageOptimisation?.h1Tag?.recommended || "Add one H1 with primary keyword",
      implementation: checks.h1?.count === 0 ? "Add one <h1> tag with primary keyword" : "Remove duplicate <h1> tags, keep only one",
      status:      "pending",
    });
  }

  // Canonical fix
  if (!checks.canonical?.exists) {
    fixQueue.push({
      type:        "canonical_tag",
      page:        "/",
      priority:    "p3",
      current:     "(missing)",
      recommended: `<link rel="canonical" href="${siteUrl}/">`,
      implementation: "Add canonical tag to <head> of every page",
      status:      "pending",
    });
  }

  // Viewport fix
  if (!checks.viewport?.exists) {
    fixQueue.push({
      type:        "viewport_meta",
      page:        "all",
      priority:    "p2",
      current:     "(missing)",
      recommended: `<meta name="viewport" content="width=device-width, initial-scale=1">`,
      implementation: "Add viewport meta tag to <head> of all pages",
      status:      "pending",
    });
  }

  // ── H1 Keyword Match ────────────────────────────
  const h1Text     = checks.h1?.value || "";
  const topKeywords = [
    ...(keywords?.clusters?.generic   || []),
    ...(keywords?.clusters?.longtail  || []),
  ].slice(0, 10).map(k => k.keyword?.toLowerCase());
  const h1Lower    = h1Text.toLowerCase();
  const h1KeywordMatches = topKeywords.filter(k => k && h1Lower.includes(k));
  const h1KeywordMiss    = topKeywords.slice(0, 3).filter(k => k && !h1Lower.includes(k));
  const h1Analysis = {
    current:        h1Text,
    matchedKeywords: h1KeywordMatches,
    missingKeywords: h1KeywordMiss,
    score:           h1KeywordMatches.length > 0 ? "good" : h1Text ? "needs_keywords" : "missing",
  };
  if (h1Analysis.score === "needs_keywords") {
    fixQueue.push({
      type:        "h1_keyword_gap",
      page:        "/",
      priority:    "p2",
      current:     h1Text,
      recommended: `Include primary keyword — e.g. "${topKeywords[0] || brief.services?.[0] || "your main service"}"`,
      implementation: "Rewrite H1 to naturally include your primary target keyword",
      status:      "pending",
    });
  }

  // ── Alt Text Fix Queue ───────────────────────────
  const altAudit = checks.altTextAudit || {};
  if (altAudit.missingAlt > 0) {
    fixQueue.push({
      type:        "alt_text",
      page:        "homepage",
      priority:    altAudit.missingAlt > 5 ? "p2" : "p3",
      current:     `${altAudit.missingAlt} images missing alt text`,
      recommended: "Add descriptive alt text with relevant keywords",
      implementation: "For each <img> tag, add alt='[descriptive keyword-rich text]'",
      affectedUrls: altAudit.missingUrls || [],
      status:      "pending",
    });
  }

  // ── OG Tags Fix Queue ────────────────────────────
  const ogTags   = checks.ogTags || {};
  const missingOg = ["title", "description", "image"].filter(t => !ogTags[t]);
  if (missingOg.length > 0) {
    fixQueue.push({
      type:        "open_graph",
      page:        "all key pages",
      priority:    "p2",
      current:     `Missing: og:${missingOg.join(", og:")}`,
      recommended: `Add og:title="${checks.title?.value || brief.businessName}", og:description="...", og:image="[hero image URL]"`,
      implementation: "Add Open Graph meta tags in <head> of every public page",
      status:      "pending",
    });
  }

  // ── SERP Preview ─────────────────────────────────
  const serpData = checks.serpPreview || {};
  const titleStr = serpData.title || "";
  const descStr  = serpData.description || "";
  const serpPreview = {
    title:           titleStr,
    titleDisplay:    titleStr.slice(0, 60) + (titleStr.length > 60 ? "..." : ""),
    titleLength:     titleStr.length,
    titleStatus:     titleStr.length > 60 ? "too_long" : titleStr.length > 0 && titleStr.length < 30 ? "too_short" : titleStr.length === 0 ? "missing" : "good",
    description:     descStr,
    descDisplay:     descStr.slice(0, 155) + (descStr.length > 155 ? "..." : ""),
    descLength:      descStr.length,
    descStatus:      descStr.length > 155 ? "too_long" : descStr.length > 0 && descStr.length < 70 ? "too_short" : descStr.length === 0 ? "missing" : "good",
    url:             serpData.url || siteUrl,
    urlDisplay:      (serpData.url || siteUrl).replace(/^https?:\/\//, ""),
  };

  // ── Internal Link Opportunities ─────────────────
  const pageAudits   = audit.checks?.pageAudits || [];
  const keywordMap   = keywords?.keywordMap || [];
  const internalLinkOpps = [];

  // Build page → primary keyword mapping
  const pageKwMap = {};
  for (const kw of keywordMap) {
    const page = kw.suggestedPage || "/";
    if (!pageKwMap[page]) pageKwMap[page] = kw.keyword;
  }

  // For each crawled inner page, suggest links to other pages
  const knownPages = ["/", ...pageAudits.map(p => {
    try { return new URL(p.url).pathname; } catch { return null; }
  }).filter(Boolean)];

  for (let i = 0; i < Math.min(knownPages.length, 5); i++) {
    for (let j = 0; j < Math.min(knownPages.length, 5); j++) {
      if (i === j) continue;
      const fromPage = knownPages[i];
      const toPage   = knownPages[j];
      const anchor   = pageKwMap[toPage];
      if (anchor && fromPage !== toPage) {
        internalLinkOpps.push({
          fromPage,
          toPage,
          anchorText:  anchor,
          why:         `${fromPage} page should link to ${toPage} using "${anchor}" — passes authority and helps Google understand site structure`,
        });
        if (internalLinkOpps.length >= 8) break;
      }
    }
    if (internalLinkOpps.length >= 8) break;
  }

  // ── Pre-built correct JSON-LD schemas (always generated, no LLM required) ──
  const prebuiltSchemas = [];

  // Organization schema — always correct for any business
  const orgSchema = {
    "@context": "https://schema.org",
    "@type": brief.targetLocations?.length > 0 ? "LocalBusiness" : "Organization",
    "name": brief.businessName || "",
    "url": siteUrl || "",
    "description": brief.businessDescription || "",
    "address": brief.targetLocations?.[0] ? { "@type": "PostalAddress", "addressLocality": brief.targetLocations[0] } : undefined,
    "telephone": "",
    "sameAs": [],
  };
  // Remove undefined keys
  Object.keys(orgSchema).forEach(k => orgSchema[k] === undefined && delete orgSchema[k]);

  prebuiltSchemas.push({
    type:   orgSchema["@type"],
    page:   "/",
    reason: "Identifies your business to Google — enables Knowledge Panel and local pack eligibility",
    jsonLd: JSON.stringify(orgSchema),
    valid:  true,
    prebuilt: true,
    parsedFields: { type: orgSchema["@type"], name: orgSchema.name, hasUrl: true },
  });

  // FAQ schema — if keyword questions exist
  const faqKeywords = [
    ...(keywords?.clusters?.informational || []),
    ...(keywords?.keywordMap || []).filter(k => /^(what|how|why|when|where|is|are|can|does)/i.test(k.keyword)),
  ].slice(0, 5);
  if (faqKeywords.length >= 2) {
    const faqSchema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": faqKeywords.map(k => ({
        "@type": "Question",
        "name": k.keyword,
        "acceptedAnswer": { "@type": "Answer", "text": `Learn about ${k.keyword} from ${brief.businessName}.` },
      })),
    };
    prebuiltSchemas.push({
      type:    "FAQPage",
      page:    "/faq",
      reason:  "FAQ schema enables rich results with expandable Q&A in Google search — increases CTR by 20-30%",
      jsonLd:  JSON.stringify(faqSchema),
      valid:   true,
      prebuilt: true,
      parsedFields: { type: "FAQPage", name: brief.businessName, hasUrl: false },
    });
  }

  // BreadcrumbList schema
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": siteUrl },
      ...pageAudits.slice(0, 3).map((p, i) => {
        try {
          const u = new URL(p.url);
          const name = u.pathname.split("/").filter(Boolean).pop() || "Page";
          return { "@type": "ListItem", "position": i + 2, "name": name.replace(/-/g, " "), "item": p.url };
        } catch { return null; }
      }).filter(Boolean),
    ],
  };
  prebuiltSchemas.push({
    type:    "BreadcrumbList",
    page:    "all pages",
    reason:  "Breadcrumb schema shows site structure in search results — reduces bounce rate and improves CTR",
    jsonLd:  JSON.stringify(breadcrumbSchema),
    valid:   true,
    prebuilt: true,
    parsedFields: { type: "BreadcrumbList", name: brief.businessName, hasUrl: true },
  });

  // ── LLM: Schema markup + tracking + JSON-LD ──────
  const crawledPageList = pageAudits.map(p => p.url).join(", ") || "(only homepage)";
  const prompt = `You are an SEO technical specialist. Based on this site, provide schema markup with ready-to-use JSON-LD code and internal linking suggestions.

Business: ${brief.businessName}
Website: ${siteUrl}
Services: ${(brief.services || []).join(", ")}
Locations: ${(brief.targetLocations || []).join(", ")}
H1: ${h1Text || "(missing)"}
Pages found: ${crawledPageList}
Issues: ${[...issues.p1, ...issues.p2].map(i => i.type).join(", ")}

Return ONLY valid JSON:
{
  "schemaMarkup": [
    {
      "type": "Organization|LocalBusiness|Service|FAQPage|BreadcrumbList",
      "page": "/page",
      "reason": "why this schema will help rankings",
      "jsonLd": "{\"@context\":\"https://schema.org\",\"@type\":\"...\",\"name\":\"...\"}"
    }
  ],
  "internalLinkSuggestions": [
    {
      "fromPage": "/page-that-should-have-link",
      "toPage": "/page-to-link-to",
      "anchorText": "exact anchor text to use",
      "placement": "where in the content to place it",
      "why": "SEO reason"
    }
  ],
  "trackingSetup": {
    "gtm": { "status": "check|setup_needed", "priority": "high|medium", "notes": "what to check or setup" },
    "gsc": { "status": "check|setup_needed", "priority": "high|medium", "notes": "what to verify" },
    "ga4": { "status": "check|setup_needed", "priority": "high|medium", "notes": "key events to configure" }
  },
  "openGraph": {
    "needed": true,
    "tags": ["og:title", "og:description", "og:image", "og:url"]
  }
}`;

  let recommendations;
  try {
    const response = await callLLM(prompt, keys, { maxTokens: 2000 });
    recommendations = parseJSON(response);
  } catch {
    recommendations = { schemaMarkup: [], trackingSetup: {}, openGraph: { needed: true, tags: [] } };
  }

  // ── Validate JSON-LD schemas from LLM ─────────────
  // LLMs sometimes produce malformed JSON-LD — validate and repair before saving
  const validatedSchema = (recommendations.schemaMarkup || []).map(schema => {
    if (!schema.jsonLd) return { ...schema, valid: false, validationError: "No JSON-LD provided" };
    try {
      const parsed = JSON.parse(schema.jsonLd);
      const hasContext = parsed["@context"] && (parsed["@context"].includes("schema.org") || parsed["@context"] === "https://schema.org");
      const hasType    = !!parsed["@type"];
      const hasName    = !!parsed.name;
      return {
        ...schema,
        valid:           hasContext && hasType,
        validationError: !hasContext ? "Missing @context: schema.org" : !hasType ? "Missing @type" : null,
        parsedFields:    { type: parsed["@type"] || null, name: parsed.name || null, hasUrl: !!parsed.url },
      };
    } catch (e) {
      // Try to salvage — strip trailing commas and retry
      try {
        const fixed  = schema.jsonLd.replace(/,\s*([}\]])/g, "$1");
        const parsed = JSON.parse(fixed);
        return { ...schema, jsonLd: fixed, valid: true, validationError: null, autoFixed: true, parsedFields: { type: parsed["@type"] || null } };
      } catch {
        return { ...schema, valid: false, validationError: `Parse error: ${e.message}` };
      }
    }
  });
  // Merge prebuilt (always correct) + LLM schemas, prebuilt first
  recommendations.schemaMarkup = [...prebuiltSchemas, ...validatedSchema];

  // ── Internal PageRank Flow (link authority scoring) ──
  // Score each page by how many internal links it receives
  const allInternalLinks = [
    ...internalLinkOpps,
    ...(recommendations.internalLinkSuggestions || []),
  ].slice(0, 10);

  const pageAuthorityMap = {};
  for (const link of allInternalLinks) {
    if (link.toPage) {
      pageAuthorityMap[link.toPage] = (pageAuthorityMap[link.toPage] || 0) + 1;
    }
  }
  const pageAuthority = Object.entries(pageAuthorityMap)
    .sort((a, b) => b[1] - a[1])
    .map(([page, inboundLinks]) => ({ page, inboundLinks, signal: inboundLinks >= 3 ? "strong" : inboundLinks >= 2 ? "medium" : "weak" }));

  const result = {
    status:          "complete",
    fixQueue,
    recommendations,
    serpPreview,
    h1Analysis,
    internalLinks:   allInternalLinks,
    pageAuthority,
    totalFixes:      fixQueue.length,
    summary: {
      p1Fixes:       fixQueue.filter(f => f.priority === "p1").length,
      p2Fixes:       fixQueue.filter(f => f.priority === "p2").length,
      p3Fixes:       fixQueue.filter(f => f.priority === "p3").length,
      schemaNeeded:  validatedSchema.length,
      schemaValid:   validatedSchema.filter(s => s.valid).length,
      altMissing:    altAudit.missingAlt || 0,
      ogMissing:     missingOg.length,
    },
    generatedAt: new Date().toISOString(),
  };

  await saveState(clientId, "A6_onpage", sanitize(result));

  // Emit tool suggestions for on-page fixes (non-blocking)
  try {
    const pageData = { url: siteUrl, title: checks.title?.value, h1: checks.h1?.value, metaDesc: checks.metaDescription?.value };
    const emits = [];
    if (!checks.title?.exists || checks.title?.length < 10 || checks.title?.length > 70)
      emits.push(emitToolSuggestion(clientId, "missing_title",           { url: siteUrl }, pageData));
    if (!checks.metaDescription?.exists)
      emits.push(emitToolSuggestion(clientId, "missing_meta_description", { url: siteUrl }, pageData));
    if (checks.h1?.count === 0)
      emits.push(emitToolSuggestion(clientId, "missing_h1",              { url: siteUrl }, pageData));
    if (!checks.eeat?.hasSchemaOrg)
      emits.push(emitToolSuggestion(clientId, "missing_schema",          { url: siteUrl, pageType: "webpage" }, pageData));
    // After on-page fixes, suggest SERP preview
    if (checks.title?.exists && checks.metaDescription?.exists)
      emits.push(emitToolSuggestion(clientId, "meta_fix_ready",          { url: siteUrl }, pageData));
    Promise.allSettled(emits).catch(() => {});
  } catch { /* non-blocking */ }

  return { success: true, onpage: result };
}

module.exports = { runA6 };
