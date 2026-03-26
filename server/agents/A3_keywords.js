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

  // ── Keyword Cannibalization Detection ─────────────
  // Group keywords by suggestedPage — if 3+ different intent/cluster keywords
  // target the same page, flag cannibalization risk
  const pageKeywordMap = {};
  for (const kw of allKeywords) {
    const page = kw.suggestedPage || "/";
    if (!pageKeywordMap[page]) pageKeywordMap[page] = [];
    pageKeywordMap[page].push({ keyword: kw.keyword, intent: kw.intent, cluster: kw.cluster, difficulty: kw.difficulty });
  }

  const cannibalization = [];
  for (const [page, kws] of Object.entries(pageKeywordMap)) {
    if (kws.length < 3) continue;
    // Multiple intents on same page = cannibalization risk
    const intents = [...new Set(kws.map(k => k.intent))];
    const clusters = [...new Set(kws.map(k => k.cluster))];
    if (intents.length >= 2 || kws.length >= 4) {
      cannibalization.push({
        page,
        keywords:     kws.map(k => k.keyword),
        keywordCount: kws.length,
        intents,
        risk:         kws.length >= 5 ? "high" : "medium",
        fix:          `Split keywords across dedicated pages. Keep only 1-2 primary keywords per page. Create separate pages for: ${kws.slice(0,2).map(k=>k.keyword).join(", ")}`,
      });
    }
  }

  // ── Topical Authority Map ──────────────────────────
  // Group by topic clusters to show coverage gaps
  const topicClusters = {};
  for (const kw of allKeywords) {
    const topic = kw.notes?.split(" ")[0] || kw.cluster;
    if (!topicClusters[topic]) topicClusters[topic] = [];
    topicClusters[topic].push(kw.keyword);
  }

  // ── Featured Snippet Opportunities ──────────────────
  // Questions + "how to" + "best" + "vs" keywords are snippet candidates
  const snippetTriggers = /^(what|how|why|when|where|who|which|is|are|can|does|best|top|vs\.?|difference|compare)/i;
  const snippetOpps = allKeywords
    .filter(kw => snippetTriggers.test(kw.keyword))
    .slice(0, 8)
    .map(kw => ({
      keyword:       kw.keyword,
      snippetType:   /^how/i.test(kw.keyword) ? "how_to" : /^(what|why|when|where|who|is|are|can|does)/i.test(kw.keyword) ? "definition" : "list",
      targetPage:    kw.suggestedPage || "/",
      strategy:      /^how/i.test(kw.keyword)
        ? "Use numbered steps format (1. 2. 3.) under an H2 matching the question"
        : /^(what|why)/i.test(kw.keyword)
        ? "Answer directly in 40-60 words in the first paragraph under the H2 that matches the question"
        : "Use a bulleted or numbered list of 5-8 items under the matching H2",
      priority:      kw.priority || "medium",
    }));

  const result = {
    status:         "complete",
    totalKeywords:  allKeywords.length,
    clusters:       keywordData,
    keywordMap:     allKeywords,
    gaps:           keywordData.gaps || [],
    serpData,
    hasSerpData:    Object.keys(serpData).length > 0,
    cannibalization,
    hasCannibalization: cannibalization.length > 0,
    snippetOpportunities: snippetOpps,
    hasSnippetOpps: snippetOpps.length > 0,
    pageKeywordMap,
    summary: {
      totalKeywords:   allKeywords.length,
      cannibalization: cannibalization.length,
      snippetOpps:     snippetOpps.length,
    },
    generatedAt:    new Date().toISOString(),
  };

  await saveState(clientId, "A3_keywords", result);
  return { success: true, keywords: result };
}

module.exports = { runA3 };
