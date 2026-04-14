const { saveState, getState } = require("../shared-state/stateManager");
const { callLLM, parseJSON }  = require("../utils/llm");

/**
 * A8 — GEO & Off-Page Agent
 * Analysis only — NO automated submissions (human gate on everything)
 * Runs in parallel with A5/A6/A7
 */
async function runA8(clientId, keys, googleToken) {
  try {
  const brief      = await getState(clientId, "A1_brief");
  const audit      = await getState(clientId, "A2_audit");
  const competitor = await getState(clientId, "A4_competitor");

  if (!brief?.signedOff) return { success: false, error: "A1 brief not signed off" };
  if (!audit?.status)    return { success: false, error: "A2 audit must complete first" };

  const siteUrl   = brief.websiteUrl;
  const locations = [].concat(brief.targetLocations || []);
  const services  = [].concat(brief.services        || []);
  const business  = brief.businessName;

  // ── Real Google API data enrichment ──────────────
  const realData = { knowledgeGraph: null, gbpAccounts: null, gbpPerformance: null, analytics: null };

  // ── Knowledge Graph (API key) ──────────────────────
  if (keys.google) {
    try {
      const kgUrl = `https://kgsearch.googleapis.com/v1/entities:search?query=${encodeURIComponent(business)}&key=${keys.google}&limit=3&types=LocalBusiness`;
      const kgRes = await fetch(kgUrl, { signal: AbortSignal.timeout(10000) });
      const kgData = await kgRes.json();
      if (kgData.itemListElement?.length > 0) {
        const entity = kgData.itemListElement[0].result;
        realData.knowledgeGraph = {
          name:        entity.name,
          description: entity.description || entity.detailedDescription?.articleBody,
          url:         entity.url,
          types:       entity["@type"] || [],
          score:       kgData.itemListElement[0].resultScore,
        };
      }
    } catch (e) { /* non-blocking */ }
  }

  // ── Google Business Profile ─────────────────────────
  if (googleToken) {
    try {
      // Step 1: Get accounts
      const acctRes = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", {
        headers: { Authorization: `Bearer ${googleToken}` },
        signal: AbortSignal.timeout(15000),
      });
      const acctData = await acctRes.json();
      const accounts = acctData.accounts || [];

      if (accounts.length > 0) {
        realData.gbpAccounts = accounts.map(a => ({ name: a.name, accountName: a.accountName, type: a.type }));
        const accountName = accounts[0].name; // use first account

        // Step 2: Get locations
        const locRes = await fetch(
          `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations?readMask=name,title,storefrontAddress,websiteUri,regularHours,categories,metadata,profile`,
          { headers: { Authorization: `Bearer ${googleToken}` }, signal: AbortSignal.timeout(15000) }
        );
        const locData = await locRes.json();
        const locations_gbp = locData.locations || [];

        if (locations_gbp.length > 0) {
          realData.gbpLocations = locations_gbp.map(loc => ({
            name:       loc.name,
            title:      loc.title,
            address:    loc.storefrontAddress,
            website:    loc.websiteUri,
            categories: loc.categories,
            metadata:   loc.metadata,
          }));

          // Step 3: Get performance for first location
          const locName = locations_gbp[0].name;
          const endDate = new Date();
          const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
          const perfRes = await fetch(
            `https://businessprofileperformance.googleapis.com/v1/${locName}:getDailyMetricsTimeSeries?` +
            `dailyMetric=BUSINESS_IMPRESSIONS_DESKTOP_MAPS&dailyMetric=BUSINESS_IMPRESSIONS_MOBILE_MAPS&` +
            `dailyMetric=CALL_CLICKS&dailyMetric=WEBSITE_CLICKS&dailyMetric=BUSINESS_DIRECTION_REQUESTS&` +
            `dailyRange.startDate.year=${startDate.getFullYear()}&dailyRange.startDate.month=${startDate.getMonth()+1}&dailyRange.startDate.day=${startDate.getDate()}&` +
            `dailyRange.endDate.year=${endDate.getFullYear()}&dailyRange.endDate.month=${endDate.getMonth()+1}&dailyRange.endDate.day=${endDate.getDate()}`,
            { headers: { Authorization: `Bearer ${googleToken}` }, signal: AbortSignal.timeout(15000) }
          );
          const perfData = await perfRes.json();
          if (!perfData.error) {
            const sumMetric = (series) => (series?.datedValues || []).reduce((s, d) => s + (parseInt(d.value) || 0), 0);
            realData.gbpPerformance = {
              desktopMapViews:   sumMetric(perfData.desktopMapsImpressions),
              mobileMapViews:    sumMetric(perfData.mobileMapsImpressions),
              callClicks:        sumMetric(perfData.callClicks),
              websiteClicks:     sumMetric(perfData.websiteClicks),
              directionRequests: sumMetric(perfData.directionRequests),
              period: "90 days",
            };
          }
        }
      }
    } catch (e) { realData.gbpError = e.message; }
  }

  // ── Google Analytics ────────────────────────────────
  if (googleToken && keys.gaPropertyId) {
    try {
      const gaRes = await fetch(
        `https://analyticsdata.googleapis.com/v1beta/properties/${keys.gaPropertyId}:runReport`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${googleToken}`, "Content-Type": "application/json" },
          signal: AbortSignal.timeout(15000),
          body: JSON.stringify({
            dateRanges: [{ startDate: "90daysAgo", endDate: "today" }],
            dimensions: [{ name: "sessionDefaultChannelGrouping" }],
            metrics: [
              { name: "sessions" }, { name: "users" }, { name: "bounceRate" },
              { name: "averageSessionDuration" }, { name: "screenPageViewsPerSession" },
            ],
          }),
        }
      );
      const gaData = await gaRes.json();
      if (gaData.rows) {
        const organic = gaData.rows.find(r => r.dimensionValues?.[0]?.value === "Organic Search");
        realData.analytics = {
          organicSessions:     parseInt(organic?.metricValues?.[0]?.value || 0),
          organicUsers:        parseInt(organic?.metricValues?.[1]?.value || 0),
          bounceRate:          parseFloat(organic?.metricValues?.[2]?.value || 0).toFixed(1),
          avgSessionDuration:  parseFloat(organic?.metricValues?.[3]?.value || 0).toFixed(0),
          pagesPerSession:     parseFloat(organic?.metricValues?.[4]?.value || 0).toFixed(1),
          allChannels: gaData.rows.map(r => ({
            channel:  r.dimensionValues[0].value,
            sessions: parseInt(r.metricValues[0].value),
            users:    parseInt(r.metricValues[1].value),
          })),
          period: "90 days",
        };
      }
    } catch (e) { realData.analyticsError = e.message; }
  }

  // ── LLM: Full GEO + Backlink Analysis ─────────────
  const prompt = `You are a local SEO and off-page SEO specialist.

Business: ${business}
Website: ${siteUrl}
Services: ${services.join(", ")}
Target Locations: ${locations.join(", ")}
Competitors: ${[].concat(brief.competitors || []).join(", ")}

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

  const { a8GeoRecs } = require("../utils/ruleBasedFallbacks");
  const ruleGeo = a8GeoRecs(brief, audit);

  let geoData = ruleGeo; // always have output
  try {
    const response  = await callLLM(prompt, keys, { maxTokens: 4000, temperature: 0.3 });
    const llmGeo    = parseJSON(response);
    if (llmGeo.napStatus || llmGeo.gbpStatus || llmGeo.recommendations?.length > 0) {
      geoData = { ...ruleGeo, ...llmGeo, generatedBy: "llm+rules" };
    }
  } catch {
    console.warn("[A8] LLM unavailable — using rule-based GEO analysis");
  }

  const result = {
    status:    "complete",
    siteUrl,
    locations,
    geoData,
    realData,
    hasRealGBPData: !!(realData.gbpLocations?.length),
    hasAnalytics:   !!(realData.analytics),
    hasKG:          !!(realData.knowledgeGraph),
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
  } catch (e) {
    console.error(`[A8] GEO analysis failed for ${clientId}:`, e.message);
    return { success: false, error: e.message };
  }
}

module.exports = { runA8 };
