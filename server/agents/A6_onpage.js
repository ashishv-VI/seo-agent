const { saveState, getState } = require("../shared-state/stateManager");
const { callLLM, parseJSON }  = require("../utils/llm");

/**
 * A6 — On-Page & Tag Management Agent
 * Runs in parallel with A5 — no dependency on content
 * Produces implementation specs for HTML + tracking fixes
 */
async function runA6(clientId, keys) {
  const brief   = await getState(clientId, "A1_brief");
  const audit   = await getState(clientId, "A2_audit");
  const content = await getState(clientId, "A5_content"); // optional — A6 runs in parallel with A5

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

  // ── LLM: Schema markup + tracking recommendations ─
  const prompt = `You are an SEO technical specialist. Based on this site info, provide schema and tracking recommendations.

Business: ${brief.businessName}
Website: ${siteUrl}
Services: ${(brief.services || []).join(", ")}
Locations: ${(brief.targetLocations || []).join(", ")}
Issues found: ${[...issues.p1, ...issues.p2].map(i => i.type).join(", ")}

Return ONLY valid JSON:
{
  "schemaMarkup": [
    {
      "type": "Organization|LocalBusiness|Service|FAQPage|BreadcrumbList",
      "page": "/page",
      "reason": "why this schema",
      "implementation": "key properties to include"
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

  const result = {
    status:          "complete",
    fixQueue,
    recommendations,
    totalFixes:      fixQueue.length,
    summary: {
      p1Fixes:       fixQueue.filter(f => f.priority === "p1").length,
      p2Fixes:       fixQueue.filter(f => f.priority === "p2").length,
      p3Fixes:       fixQueue.filter(f => f.priority === "p3").length,
      schemaNeeded:  recommendations.schemaMarkup?.length || 0,
    },
    generatedAt: new Date().toISOString(),
  };

  await saveState(clientId, "A6_onpage", result);
  return { success: true, onpage: result };
}

module.exports = { runA6 };
