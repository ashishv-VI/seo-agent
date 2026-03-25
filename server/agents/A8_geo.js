const { saveState, getState } = require("../shared-state/stateManager");
const { callLLM, parseJSON }  = require("../utils/llm");

/**
 * A8 — GEO & Off-Page Agent
 * Analysis only — NO automated submissions (human gate on everything)
 * Runs in parallel with A5/A6/A7
 */
async function runA8(clientId, keys) {
  const brief      = await getState(clientId, "A1_brief");
  const audit      = await getState(clientId, "A2_audit");
  const competitor = await getState(clientId, "A4_competitor");

  if (!brief?.signedOff) return { success: false, error: "A1 brief not signed off" };
  if (!audit?.status)    return { success: false, error: "A2 audit must complete first" };

  const siteUrl   = brief.websiteUrl;
  const locations = brief.targetLocations || [];
  const services  = brief.services || [];
  const business  = brief.businessName;

  // ── LLM: Full GEO + Backlink Analysis ─────────────
  const prompt = `You are a local SEO and off-page SEO specialist.

Business: ${business}
Website: ${siteUrl}
Services: ${services.join(", ")}
Target Locations: ${locations.join(", ")}
Competitors: ${(brief.competitors || []).join(", ")}

Provide a comprehensive GEO and off-page analysis. Return ONLY valid JSON:
{
  "geoAudit": {
    "gbpStatus": "likely_exists|likely_missing|check_required",
    "gbpCompletionChecklist": [
      { "item": "category", "importance": "critical|high|medium", "action": "what to add/check" }
    ],
    "napConsistencyRisks": ["risk 1", "risk 2"],
    "localPackOpportunity": "high|medium|low",
    "localPackReason": "why this opportunity level"
  },
  "citationTargets": [
    {
      "directory": "directory name",
      "url": "directory URL",
      "priority": "high|medium|low",
      "relevance": "why relevant for this business",
      "submissionNotes": "what info to prepare"
    }
  ],
  "backlinkStrategy": {
    "currentProfileAssessment": "what to expect for a site at this stage",
    "quickWinOpportunities": [
      { "type": "guest_post|resource_page|directory|local_news|partner", "target": "type of site to target", "approach": "how to approach" }
    ],
    "anchorTextStrategy": "recommendation for anchor text diversity",
    "competitorLinkGaps": ["type of sites competitors likely have links from"]
  },
  "reviewStrategy": {
    "platforms": ["Google Business Profile", "other relevant platforms"],
    "requestApproach": "how to ask for reviews",
    "responseGuidelines": "how to respond to reviews"
  },
  "localSchemaRecommendations": [
    { "type": "LocalBusiness|GeoCoordinates|ServiceArea", "implementation": "key fields to include" }
  ],
  "monthlyOffPagePlan": [
    { "week": 1, "action": "what to do", "effort": "hours estimate" }
  ]
}`;

  let geoData;
  try {
    const response = await callLLM(prompt, keys, { maxTokens: 4000, temperature: 0.3 });
    geoData = parseJSON(response);
  } catch (e) {
    return { success: false, error: `GEO analysis failed: ${e.message}` };
  }

  const result = {
    status:    "complete",
    siteUrl,
    locations,
    geoData,
    summary: {
      citationTargets:    geoData.citationTargets?.length || 0,
      highPriorityCitations: geoData.citationTargets?.filter(c => c.priority === "high").length || 0,
      quickWinLinks:      geoData.backlinkStrategy?.quickWinOpportunities?.length || 0,
      localPackOpportunity: geoData.geoAudit?.localPackOpportunity || "unknown",
    },
    humanGateNote: "All directory submissions and outreach require human approval before execution. A8 prepares content only.",
    generatedAt: new Date().toISOString(),
  };

  await saveState(clientId, "A8_geo", result);
  return { success: true, geo: result };
}

module.exports = { runA8 };
