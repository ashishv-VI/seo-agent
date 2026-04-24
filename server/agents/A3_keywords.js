const { saveState, getState } = require("../shared-state/stateManager");
const { callLLM, parseJSON }  = require("../utils/llm");
const { emitToolSuggestion }  = require("../utils/toolBridge");
const { db }                  = require("../config/firebase");

/**
 * A3 — Keyword Research & Mapping Agent
 * Blocked until A2 audit is complete
 * Uses Groq/Gemini for keyword expansion + SerpAPI for live data
 */
async function runA3(clientId, keys) {
  try {
  const brief = await getState(clientId, "A1_brief");
  const audit = await getState(clientId, "A2_audit");

  if (!brief?.signedOff) return { success: false, error: "A1 brief not signed off" };
  if (!audit || audit.status !== "complete") return { success: false, error: "A2 audit must complete before keyword research" };

  const seedKeywords  = [].concat(brief.primaryKeywords  || []);
  const services      = [].concat(brief.services         || []);
  const audience      = brief.targetAudience || "";
  const locations     = [].concat(brief.targetLocations  || []);
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

  // Build rule-based seed clusters from brief data — works even with no LLM
  const seedClusters = buildSeedClusters(brief);

  // Save minimal seed state immediately so downstream agents (A4) always
  // find an A3_keywords doc even if LLM/SerpAPI timeout kills this agent mid-run
  await saveState(clientId, "A3_keywords", {
    status:        "complete",
    totalKeywords: (seedClusters.brand?.length || 0) + (seedClusters.generic?.length || 0) + (seedClusters.longtail?.length || 0),
    clusters:      seedClusters,
    keywordMap:    [
      ...(seedClusters.brand         || []).map(k => ({ ...k, cluster: "brand" })),
      ...(seedClusters.generic       || []).map(k => ({ ...k, cluster: "generic" })),
      ...(seedClusters.longtail      || []).map(k => ({ ...k, cluster: "longtail" })),
      ...(seedClusters.informational || []).map(k => ({ ...k, cluster: "informational" })),
    ],
    gaps:          [],
    serpData:      {},
    hasSerpData:   false,
    generatedAt:   new Date().toISOString(),
    seedOnly:      true,
  });

  let keywordData = seedClusters; // always have something
  try {
    const response = await callLLM(prompt, keys, { maxTokens: 4000, temperature: 0.4 });
    const llmData  = parseJSON(response);
    // LLM wins if it returned real clusters
    if (llmData.generic?.length > 0 || llmData.longtail?.length > 0) {
      keywordData = llmData;
    }
  } catch {
    console.warn("[A3] LLM unavailable — using rule-based keyword seed clusters");
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
        const locationStr = [].concat(brief.targetLocations || []).join(" ").toLowerCase();
        const gl = locationStr.includes("uk") || locationStr.includes("united kingdom") ? "gb"
                 : locationStr.includes("australia") ? "au"
                 : locationStr.includes("canada") ? "ca"
                 : locationStr.includes("india") ? "in"
                 : "us";
        const url  = `https://serpapi.com/search.json?q=${encodeURIComponent(kw.keyword)}&api_key=${keys.serpapi}&num=10&gl=${gl}&hl=en`;
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

  // ── SE Ranking: Enrich keywords with real volume + difficulty ──
  const seMetrics = {};
  if (keys.seranking) {
    const { getKeywordMetrics, getDomainKeywords } = require("../utils/seranking");
    const allKws = [
      ...(keywordData.brand        || []),
      ...(keywordData.generic      || []),
      ...(keywordData.longtail     || []),
      ...(keywordData.informational|| []),
    ].map(k => k.keyword).filter(Boolean);

    // Detect country from locations
    const locationStr = [].concat(brief.targetLocations || []).join(" ").toLowerCase();
    const country = locationStr.includes("uk") || locationStr.includes("united kingdom") ? "GB"
                  : locationStr.includes("australia") ? "AU"
                  : locationStr.includes("canada") ? "CA"
                  : locationStr.includes("india") ? "IN"
                  : "US";

    const [metrics, domainKws] = await Promise.all([
      getKeywordMetrics(allKws, keys.seranking, country),
      getDomainKeywords(brief.websiteUrl, keys.seranking, country),
    ]);

    Object.assign(seMetrics, metrics);

    // Enrich each keyword cluster with real data
    ["brand","generic","longtail","informational"].forEach(cluster => {
      (keywordData[cluster] || []).forEach(kw => {
        const m = seMetrics[(kw.keyword || "").toLowerCase()];
        if (m) {
          kw.searchVolume  = m.volume;
          kw.realDifficulty= m.difficulty;
          kw.cpc           = m.cpc;
          // Override difficulty label based on real data
          if (m.difficulty >= 70) kw.difficulty = "high";
          else if (m.difficulty >= 40) kw.difficulty = "medium";
          else kw.difficulty = "low";
        }
      });
    });

    // Store domain's current rankings
    if (domainKws.length > 0) {
      keywordData.currentRankings = domainKws.slice(0, 30);
      // Find keywords we rank for that are in our keyword map
      keywordData.rankingKeywords = domainKws.filter(dk =>
        allKws.some(k => (k || "").toLowerCase().includes((dk.keyword || "").toLowerCase()))
      );
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
    seRankingData: Object.keys(seMetrics).length > 0 ? {
      enriched: true,
      keywordsEnriched: Object.keys(seMetrics).length,
      currentRankings: keywordData.currentRankings || [],
    } : null,
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

  // ── Kill-signal: deprioritize keywords that produced 0 leads in 90 days ──
  // If a keyword has been ranking but hasn't converted, it's dead weight.
  // Only applies to keywords that have existed for 90+ days AND have attribution data.
  try {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    // Simple single-field query to avoid composite index requirement
    const convSnap = await db.collection("conversions")
      .where("clientId", "==", clientId)
      .get();

    const leadsByKeyword = {};
    convSnap.docs.forEach(d => {
      const data = d.data();
      // Filter by date in memory — avoids composite index requirement
      if (data.submittedAt && data.submittedAt >= ninetyDaysAgo) {
        const kw = (data.gscKeyword || "").toLowerCase();
        if (kw) leadsByKeyword[kw] = (leadsByKeyword[kw] || 0) + 1;
      }
    });

    // Check historical rankings — if keyword has had rankings for 90+ days with 0 leads, deprioritize
    const rankings = await getState(clientId, "A10_rankings") || {};
    const rankedKeywords = (rankings.keywords || []).map(r => (r.keyword || "").toLowerCase());
    let deprioritized = 0;

    for (const kw of result.keywordMap) {
      const normalized = (kw.keyword || "").toLowerCase();
      const isRanked   = rankedKeywords.includes(normalized);
      const leadCount  = leadsByKeyword[normalized] || 0;
      // Mark dead keywords: ranked for 90+ days, 0 leads, and wasn't already low priority
      if (isRanked && leadCount === 0 && kw.priority !== "low") {
        kw.priority      = "low";
        kw.deprioritized = true;
        kw.killReason    = "0 leads in 90 days despite rankings";
        deprioritized++;
      }
    }
    if (deprioritized > 0) {
      console.log(`[A3] Deprioritized ${deprioritized} keyword(s) for ${clientId} — 0 leads in 90 days`);
      result.killSignals = { deprioritized, reason: "no_conversions_90d" };
    }
  } catch (e) {
    console.error(`[A3] Kill-signal check failed:`, e.message);
  }

  await saveState(clientId, "A3_keywords", result);

  // Emit tool suggestions: content brief for top keywords, AEO for question keywords
  try {
    const topKws = (result.keywordMap || []).slice(0, 10).map(k => k.keyword);
    if (topKws.length > 0) {
      emitToolSuggestion(clientId, "keywords_ready", {}, {
        keywords:     topKws,
        businessName: brief.businessName || "",
        url:          brief.websiteUrl   || "",
      }).catch(() => {});
    }
    // AEO suggestion for any question-format keywords
    const questionKw = (result.snippetOpportunities || []).find(k => /^(what|how|why|when|where|which)/i.test(k.keyword));
    if (questionKw) {
      emitToolSuggestion(clientId, "aeo_opportunity", { keyword: questionKw.keyword, topic: questionKw.cluster || "" }, {}).catch(() => {});
    }
  } catch { /* non-blocking */ }

  return { success: true, keywords: result };
  } catch (e) {
    console.error(`[A3] Keyword research failed for ${clientId}:`, e.message);
    return { success: false, error: e.message };
  }
}

// ── Rule-based keyword seed builder (no LLM required) ────────────────────────
function buildSeedClusters(brief) {
  const name       = (brief?.businessName || "").toString();
  const services   = [].concat(brief?.services || []).filter(s => s && typeof s === "string");
  const locations  = [].concat(brief?.targetLocations || (brief?.targetLocation ? [brief.targetLocation] : [])).filter(Boolean);
  const desc       = (brief?.businessDescription || "").toString();
  const keywords   = [].concat(brief?.primaryKeywords || []).filter(k => k && typeof k === "string");

  // Brand cluster
  const brand = [
    { keyword: name.toLowerCase(), intent: "navigational", difficulty: "low", priority: "high", suggestedPage: "/" },
    ...keywords.map(k => ({ keyword: k, intent: "navigational", difficulty: "low", priority: "high", suggestedPage: "/" })),
  ].slice(0, 5);

  // Generic / commercial cluster
  const generic = services.slice(0, 6).map(s => ({
    keyword: s.toLowerCase(), intent: "transactional", difficulty: "medium", priority: "high", suggestedPage: "/services",
  }));
  if (generic.length === 0 && desc) {
    const words = desc.toLowerCase().split(/\s+/).filter(w => w.length > 4).slice(0, 6);
    words.forEach(w => generic.push({ keyword: w, intent: "transactional", difficulty: "medium", priority: "medium", suggestedPage: "/services" }));
  }

  // Long-tail cluster
  const longtail = services.slice(0, 4).map(s => ({
    keyword: `best ${s.toLowerCase()}`, intent: "commercial", difficulty: "medium", priority: "medium", suggestedPage: "/services",
  }));

  // Local variants
  const localVariants = [];
  for (const loc of locations.slice(0, 3)) {
    for (const svc of services.slice(0, 2)) {
      localVariants.push({ keyword: `${svc.toLowerCase()} ${loc.toLowerCase()}`, location: loc, intent: "transactional", difficulty: "low" });
    }
  }

  // Informational cluster
  const informational = services.slice(0, 3).map(s => ({
    keyword: `how to choose ${s.toLowerCase()}`, intent: "informational", difficulty: "low", priority: "low", suggestedPage: "/blog",
  }));

  return { brand, generic, longtail, localVariants, informational, gaps: [], generatedBy: "rule-engine" };
}

module.exports = { runA3 };
