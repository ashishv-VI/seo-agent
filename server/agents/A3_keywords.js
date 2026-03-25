const { saveState, getState } = require("../shared-state/stateManager");
const { callLLM, parseJSON }  = require("../utils/llm");

/**
 * A3 — Keyword Research & Mapping Agent
 * Blocked until A2 audit is complete
 * Uses Groq/Gemini for keyword expansion + SerpAPI for live data
 */
async function runA3(clientId, keys) {
  const brief = await getState(clientId, "A1_brief");
  const audit = await getState(clientId, "A2_audit");

  if (!brief?.signedOff) return { success: false, error: "A1 brief not signed off" };
  if (!audit || audit.status !== "complete") return { success: false, error: "A2 audit must complete before keyword research" };

  const seedKeywords  = brief.primaryKeywords || [];
  const services      = brief.services || [];
  const audience      = brief.targetAudience || "";
  const locations     = brief.targetLocations || [];
  const businessDesc  = brief.businessDescription || "";

  // ── LLM: Expand keywords into clusters ────────────
  const prompt = `You are an expert SEO keyword researcher. Based on this business information, generate a comprehensive keyword map.

Business: ${brief.businessName}
Description: ${businessDesc}
Services: ${services.join(", ")}
Target Audience: ${audience}
Target Locations: ${locations.join(", ")}
Seed Keywords: ${seedKeywords.join(", ")}

Generate a keyword map with exactly these 4 clusters. Return ONLY valid JSON, no explanation:

{
  "brand": [
    { "keyword": "keyword here", "intent": "navigational", "difficulty": "low|medium|high", "priority": "high|medium|low", "suggestedPage": "/page-path", "notes": "why this keyword" }
  ],
  "generic": [
    { "keyword": "keyword here", "intent": "transactional", "difficulty": "low|medium|high", "priority": "high|medium|low", "suggestedPage": "/page-path", "notes": "why this keyword" }
  ],
  "longtail": [
    { "keyword": "keyword here", "intent": "commercial", "difficulty": "low|medium|high", "priority": "high|medium|low", "suggestedPage": "/page-path", "notes": "why this keyword" }
  ],
  "informational": [
    { "keyword": "keyword here", "intent": "informational", "difficulty": "low|medium|high", "priority": "high|medium|low", "suggestedPage": "/blog/slug", "notes": "why this keyword" }
  ],
  "gaps": [
    { "keyword": "keyword here", "reason": "high volume, no page exists", "recommendedAction": "create new page" }
  ],
  "localVariants": [
    { "keyword": "keyword + location", "location": "city/region", "intent": "transactional", "difficulty": "low" }
  ]
}

Generate 5-8 keywords per cluster. Make them realistic and specific to the business.`;

  let keywordData;
  try {
    const response = await callLLM(prompt, keys, { maxTokens: 4000, temperature: 0.4 });
    keywordData = parseJSON(response);
  } catch (e) {
    return { success: false, error: `LLM keyword generation failed: ${e.message}` };
  }

  // ── SerpAPI: Get live SERP data ────────────────────
  const serpData = {};
  if (keys.serpapi) {
    const allKeywords = [
      ...(keywordData.generic || []),
      ...(keywordData.longtail || []),
    ].slice(0, 8); // limit API calls

    for (const kw of allKeywords) {
      try {
        const url  = `https://serpapi.com/search.json?q=${encodeURIComponent(kw.keyword)}&api_key=${keys.serpapi}&num=10&gl=in&hl=en`;
        const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
        const data = await res.json();
        if (data.organic_results) {
          serpData[kw.keyword] = {
            topDomains: data.organic_results.slice(0, 5).map(r => ({
              position: r.position,
              domain:   new URL(r.link).hostname,
              title:    r.title,
            })),
            relatedSearches: data.related_searches?.slice(0, 3).map(r => r.query) || [],
          };
        }
      } catch { /* skip on error */ }
    }
  }

  // ── Build keyword map ──────────────────────────────
  const allKeywords = [
    ...(keywordData.brand         || []).map(k => ({ ...k, cluster: "brand" })),
    ...(keywordData.generic       || []).map(k => ({ ...k, cluster: "generic" })),
    ...(keywordData.longtail      || []).map(k => ({ ...k, cluster: "longtail" })),
    ...(keywordData.informational || []).map(k => ({ ...k, cluster: "informational" })),
    ...(keywordData.localVariants || []).map(k => ({ ...k, cluster: "local" })),
  ];

  const result = {
    status:       "complete",
    totalKeywords: allKeywords.length,
    clusters:     keywordData,
    keywordMap:   allKeywords,
    gaps:         keywordData.gaps || [],
    serpData,
    hasSerpData:  Object.keys(serpData).length > 0,
    generatedAt:  new Date().toISOString(),
  };

  await saveState(clientId, "A3_keywords", result);
  return { success: true, keywords: result };
}

module.exports = { runA3 };
