/**
 * AI9 — Zero-Click SERP Capture
 *
 * Targets featured snippets, People Also Ask boxes, Knowledge Panels,
 * and other SERP features that get clicks WITHOUT ranking #1.
 * ~65% of Google searches end without a click — capture that space.
 *
 * Method:
 *  1. Identify keywords with high impressions but poor CTR (high position, zero-click SERP)
 *  2. Check which SERP features appear for these keywords
 *  3. Schema audit: what structured data is missing
 *  4. LLM: draft schema markup + content snippets to win each SERP feature
 */
const { getState, saveState } = require("../shared-state/stateManager");
const { callLLM, parseJSON }  = require("../utils/llm");
const { getSERP }             = require("../crawler/serpScraper");

async function runAI9(clientId, keys) {
  try {
    const brief    = await getState(clientId, "A1_brief");
    const keywords = await getState(clientId, "A3_keywords");
    const rankings = await getState(clientId, "A10_rankings");
    const onpage   = await getState(clientId, "A6_onpage");

    if (!brief?.websiteUrl) return { success: false, error: "A1 brief not found" };

    // ── Find high-impression low-CTR keywords (zero-click traps) ─────────
    const zeroClickKws = (rankings?.rankings || []).filter(r =>
      (r.impressions || 0) > 100 &&
      (r.ctr || 0) < 0.03 &&    // <3% CTR suggests SERP feature eating clicks
      (r.position || 50) <= 15
    ).sort((a, b) => (b.impressions || 0) - (a.impressions || 0)).slice(0, 15);

    // ── SERP feature check for top zero-click keywords ────────────────────
    const serpFeatures = [];
    const checkKeywords = zeroClickKws.slice(0, 5); // limit SERP fetches

    for (const kw of checkKeywords) {
      try {
        const results = await getSERP(kw.keyword, { limit: 5 });
        // Detect SERP features from result metadata
        const hasSnippet  = results.some(r => r.type === "featured_snippet" || r.position === 0);
        const hasPaa      = results.some(r => r.type === "people_also_ask");
        const hasLocal    = results.some(r => r.type === "local_pack");
        const hasKnowledge = results.some(r => r.type === "knowledge_panel");

        serpFeatures.push({
          keyword:    kw.keyword,
          impressions: kw.impressions,
          ctr:        kw.ctr,
          position:   kw.position,
          features: {
            featuredSnippet: hasSnippet,
            peopleAlsoAsk:   hasPaa,
            localPack:       hasLocal,
            knowledgePanel:  hasKnowledge,
          },
          opportunity: hasSnippet ? "featured_snippet" : hasPaa ? "paa_box" : hasLocal ? "local_pack" : "standard",
        });
      } catch { /* non-blocking */ }
    }

    // ── Schema audit from A6 data ──────────────────────────────────────────
    const existingSchema = new Set(
      (onpage?.pages || []).flatMap(p => p.schema || [])
    );
    const missingSchemas = [];
    if (!existingSchema.has("FAQPage"))         missingSchemas.push("FAQPage");
    if (!existingSchema.has("HowTo"))           missingSchemas.push("HowTo");
    if (!existingSchema.has("LocalBusiness"))   missingSchemas.push("LocalBusiness");
    if (!existingSchema.has("Review"))          missingSchemas.push("AggregateRating/Review");
    if (!existingSchema.has("BreadcrumbList"))  missingSchemas.push("BreadcrumbList");

    // ── LLM: zero-click capture strategy ─────────────────────────────────
    let captureStrategy = {};
    if ((keys?.groq || keys?.gemini)) {
      try {
        const prompt = `You are a SERP features specialist. Help this site capture zero-click real estate.

Client: ${brief.businessName} — ${brief.websiteUrl}
Services: ${[].concat(brief.services || []).join(", ")}

Zero-click keywords (high impressions, low CTR — a SERP feature is stealing our clicks):
${zeroClickKws.slice(0, 8).map(k =>
  `- "${k.keyword}": ${k.impressions} impressions, ${(k.ctr*100).toFixed(1)}% CTR, pos ${k.position}`
).join("\n")}

SERP features found for these keywords:
${serpFeatures.map(s =>
  `- "${s.keyword}": ${Object.entries(s.features).filter(([,v])=>v).map(([k])=>k).join(", ") || "standard results"}`
).join("\n") || "not checked"}

Missing schema types: ${missingSchemas.join(", ") || "none"}

For each zero-click keyword, create a capture strategy:
Return ONLY valid JSON:
{
  "captureItems": [
    {
      "keyword": "the keyword",
      "targetFeature": "featured_snippet|paa_box|local_pack|knowledge_panel",
      "contentSnippet": "40-50 word answer optimised for the SERP feature",
      "schemaType": "FAQPage|HowTo|LocalBusiness|etc",
      "pageAction": "which page to add this to and what to change",
      "estimatedCtrGain": "+X%",
      "effort": "low|medium|high"
    }
  ],
  "schemaTemplates": [
    {
      "type": "FAQPage",
      "jsonLd": "complete JSON-LD schema markup ready to copy-paste (max 3 Q&A pairs)"
    }
  ],
  "quickWins": ["immediate action 1", "immediate action 2"],
  "totalImpressionsCapturable": "X impressions/month if all implemented"
}`;

        const response    = await callLLM(prompt, keys, { maxTokens: 2000, temperature: 0.3, clientId });
        captureStrategy   = parseJSON(response) || {};
      } catch { /* non-blocking */ }
    }

    const result = {
      success:                  true,
      scannedAt:                new Date().toISOString(),
      zeroClickKeywords:        zeroClickKws,
      zeroClickCount:           zeroClickKws.length,
      totalMissedImpressions:   zeroClickKws.reduce((s, k) => s + (k.impressions || 0), 0),
      serpFeatures,
      missingSchemas,
      captureItems:             captureStrategy.captureItems             || [],
      schemaTemplates:          captureStrategy.schemaTemplates          || [],
      quickWins:                captureStrategy.quickWins                || [],
      totalImpressionsCapturable: captureStrategy.totalImpressionsCapturable || null,
    };

    await saveState(clientId, "AI9_zeroClick", result);
    return result;

  } catch (e) {
    console.error(`[AI9] Zero-click SERP scan failed for ${clientId}:`, e.message);
    return { success: false, error: e.message };
  }
}

module.exports = { runAI9 };
