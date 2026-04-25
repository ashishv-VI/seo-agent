const { saveState, getState }  = require("../shared-state/stateManager");
const { callLLM, parseJSON }   = require("../utils/llm");
const { emitToolSuggestion }   = require("../utils/toolBridge");
const { db }                   = require("../config/firebase");

/**
 * A3 — Keyword Research & Mapping Agent (v2.0 — 2025 Edition)
 *
 * New in v2:
 * - Intent classification per keyword
 * - AI Overview risk scoring (HIGH/MEDIUM/LOW)
 * - Zero-click probability estimate
 * - GEO keyword identification (ChatGPT/Perplexity/Gemini citation)
 * - Topical authority hub planning (pillar + cluster)
 * - Featured snippet opportunities
 * - Keyword cannibalization detection
 * - Kill-signal: zero-conversion keywords deprioritized
 */
async function runA3(clientId, keys, masterPrompt) {
  try {
    const brief = await getState(clientId, "A1_brief");
    const audit = await getState(clientId, "A2_audit");

    if (!brief?.signedOff)
      return { success: false, error: "A1 brief not signed off" };
    if (!audit || audit.status !== "complete")
      return { success: false, error: "A2 audit must complete before keyword research" };

    const seedKeywords = [].concat(brief.primaryKeywords  || []);
    const services     = [].concat(brief.services         || []);
    const audience     = brief.targetAudience || "";
    const locations    = [].concat(brief.targetLocations  || []);
    const businessDesc = brief.businessDescription || "";
    const websiteUrl   = brief.websiteUrl || "";

    const locationStr = locations.join(" ").toLowerCase();
    const country = locationStr.includes("uk") || locationStr.includes("united kingdom") ? "GB"
                  : locationStr.includes("australia") ? "AU"
                  : locationStr.includes("canada") ? "CA"
                  : locationStr.includes("india") ? "IN" : "US";
    const gl = { GB:"gb", AU:"au", CA:"ca", IN:"in" }[country] || "us";

    // Save seed state immediately so A4 never blocks on missing A3 state
    const seedClusters = buildSeedClusters(brief);
    await saveState(clientId, "A3_keywords", {
      status: "complete", totalKeywords: flattenClusters(seedClusters).length,
      clusters: seedClusters, keywordMap: flattenClusters(seedClusters),
      gaps: [], serpData: {}, hasSerpData: false,
      generatedAt: new Date().toISOString(), seedOnly: true,
    });

    // ── LLM: 2025 keyword map with AI Overview risk ──────────────────────────
    const llmPrompt = `You are a world-class SEO keyword researcher with deep 2025 algorithm knowledge.

Business: ${brief.businessName}
Description: ${businessDesc}
Services: ${services.join(", ")}
Target Audience: ${audience}
Locations: ${locations.join(", ")}
Seed Keywords: ${seedKeywords.join(", ")}

2025 CRITICAL CONTEXT:
- AI Overviews appear for 40%+ of informational queries — zero-click is real
- Transactional/local keywords still send clicks — these are priority
- Topical authority (content hubs) beats random keyword targeting
- GEO: informational keywords can be structured for ChatGPT/Perplexity citation

For EVERY keyword include:
- intent: "informational"|"commercial"|"transactional"|"navigational"|"local"
- aiOverviewRisk: "high" (AI will answer, zero clicks) | "medium" | "low" (safe, clicks expected)
- zeroClickProbability: 0-100
- geoOpportunity: true/false (can rank in AI answer citations)
- topicalHub: which authority cluster does this belong to
- difficulty: "low"|"medium"|"high"
- priority: "high"|"medium"|"low"
- suggestedPage: URL path
- notes: brief explanation

Return ONLY valid JSON:
{
  "brand": [{"keyword":"","intent":"navigational","aiOverviewRisk":"low","zeroClickProbability":5,"geoOpportunity":false,"topicalHub":"","difficulty":"low","priority":"high","suggestedPage":"/","notes":""}],
  "generic": [...],
  "longtail": [...],
  "informational": [{"keyword":"","intent":"informational","aiOverviewRisk":"high","zeroClickProbability":70,"geoOpportunity":true,"topicalHub":"","difficulty":"low","priority":"medium","suggestedPage":"/blog/","notes":"High AI risk — target for featured snippet + GEO citation"}],
  "transactional": [{"keyword":"","intent":"transactional","aiOverviewRisk":"low","zeroClickProbability":10,"geoOpportunity":false,"topicalHub":"","difficulty":"medium","priority":"high","suggestedPage":"/","notes":"Safe from AI — prioritise for traffic"}],
  "local": [{"keyword":"","intent":"local","location":"","aiOverviewRisk":"low","zeroClickProbability":8,"geoOpportunity":false,"topicalHub":"","difficulty":"low","priority":"high","suggestedPage":"/","notes":""}],
  "gaps": [{"keyword":"","reason":"","recommendedAction":"","estimatedTrafficOpportunity":"high"}],
  "topicalHubs": [{"hubName":"","pillarPage":"/","clusterPages":["/","/"],"keywords":["",""],"priority":"high","rationale":""}]
}
5-8 keywords per cluster. Realistic and specific to this business.`;

    let keywordData = seedClusters;
    try {
      const response = await callLLM(clientId, keys, llmPrompt, {
        system: masterPrompt, maxTokens: 4000, temperature: 0.3,
      });
      const llmData = parseJSON(response);
      if (llmData?.generic?.length > 0 || llmData?.longtail?.length > 0) {
        keywordData = llmData;
        console.log(`[A3] LLM generated ${flattenClustersAll(llmData).length} keywords`);
      }
    } catch (e) {
      console.warn(`[A3] LLM unavailable — using rule-based seed clusters: ${e.message}`);
    }

    // ── SerpAPI: Live SERP data + AI Overview detection ─────────────────────
    const serpData = {};
    const serpKey = keys.serpapi || keys.serp;
    if (serpKey) {
      const checkKws = [
        ...(keywordData.generic      || []),
        ...(keywordData.transactional|| []),
        ...(keywordData.longtail     || []),
      ].slice(0, 8);

      for (const kw of checkKws) {
        try {
          const url  = `https://serpapi.com/search.json?q=${encodeURIComponent(kw.keyword)}&api_key=${serpKey}&num=10&gl=${gl}&hl=en`;
          const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
          const data = await res.json();
          if (data.organic_results) {
            const hasAiOverview = !!(data.ai_overview);
            serpData[kw.keyword] = {
              topDomains: data.organic_results.slice(0, 5).map(r => ({
                position: r.position,
                domain: r.displayed_link?.split("/")[0] || "",
                title: r.title,
              })),
              hasAiOverview,
              hasFeaturedSnippet: !!(data.answer_box),
              hasLocalPack:       !!(data.local_results),
              paaQuestions:    (data.related_questions || []).slice(0, 4).map(q => q.question),
              relatedSearches: (data.related_searches  || []).slice(0, 4).map(r => r.query),
            };
            // Update risk based on real SERP
            if (hasAiOverview) {
              kw.aiOverviewRisk = "high";
              kw.zeroClickProbability = Math.max(kw.zeroClickProbability || 50, 65);
              kw.aiOverviewConfirmed = true;
            }
          }
        } catch { /* skip */ }
      }
    }

    // ── SE Ranking: Real volume + difficulty ─────────────────────────────────
    const seMetrics = {};
    if (keys.seranking) {
      try {
        const { getKeywordMetrics, getDomainKeywords } = require("../utils/seranking");
        const allKwStrs = getAllKwStrings(keywordData);
        const [metrics, domainKws] = await Promise.all([
          getKeywordMetrics(allKwStrs, keys.seranking, country),
          getDomainKeywords(websiteUrl, keys.seranking, country),
        ]);
        Object.assign(seMetrics, metrics);
        ["brand","generic","longtail","informational","transactional","local"].forEach(c => {
          (keywordData[c] || []).forEach(kw => {
            const m = seMetrics[(kw.keyword || "").toLowerCase()];
            if (m) {
              kw.searchVolume = m.volume; kw.realDifficulty = m.difficulty; kw.cpc = m.cpc;
              kw.difficulty = m.difficulty >= 70 ? "high" : m.difficulty >= 40 ? "medium" : "low";
            }
          });
        });
        if (domainKws.length > 0) {
          keywordData.currentRankings = domainKws.slice(0, 30);
          keywordData.rankingKeywords = domainKws.filter(dk =>
            allKwStrs.some(k => (k||"").toLowerCase().includes((dk.keyword||"").toLowerCase()))
          );
        }
      } catch (e) {
        console.warn(`[A3] SE Ranking failed: ${e.message}`);
      }
    }

    // ── Build full keyword map ───────────────────────────────────────────────
    const allKeywords = flattenClustersAll(keywordData);

    // ── AI Overview risk summary ─────────────────────────────────────────────
    const aiRiskSummary = {
      high:      allKeywords.filter(k => k.aiOverviewRisk === "high").length,
      medium:    allKeywords.filter(k => k.aiOverviewRisk === "medium").length,
      low:       allKeywords.filter(k => k.aiOverviewRisk === "low").length,
      confirmed: allKeywords.filter(k => k.aiOverviewConfirmed).length,
    };
    const zeroClickRiskPct = allKeywords.length > 0
      ? Math.round(aiRiskSummary.high / allKeywords.length * 100) : 0;

    // ── GEO keywords (for AI answer citation) ────────────────────────────────
    const geoKeywords = allKeywords
      .filter(k => k.geoOpportunity === true || k.intent === "informational")
      .slice(0, 10)
      .map(k => ({
        keyword: k.keyword, intent: k.intent,
        geoStrategy: k.intent === "informational"
          ? "Structure as clear Q&A with definitive answer in first 50 words. Add FAQ schema. Authoritative, quotable language."
          : "Create definitive resource page with unique data and clear statements.",
      }));

    // ── Topical authority hubs ───────────────────────────────────────────────
    const topicalHubs = Array.isArray(keywordData.topicalHubs) && keywordData.topicalHubs.length > 0
      ? keywordData.topicalHubs
      : buildTopicalHubs(allKeywords);

    // ── Featured snippet opportunities ───────────────────────────────────────
    const snippetTriggers = /^(what|how|why|when|where|who|which|is|are|can|does|best|top|vs\.?|difference|compare)/i;
    const snippetOpportunities = allKeywords
      .filter(k => snippetTriggers.test(k.keyword))
      .slice(0, 10)
      .map(k => ({
        keyword: k.keyword,
        snippetType: /^how/i.test(k.keyword) ? "how_to" : /^(what|why|when|where|who|is|are)/i.test(k.keyword) ? "definition" : "list",
        targetPage: k.suggestedPage || "/",
        strategy: /^how/i.test(k.keyword)
          ? "Numbered steps (1. 2. 3.) under H2 matching question exactly"
          : /^(what|why)/i.test(k.keyword)
          ? "Answer in 40-60 words in first paragraph. H2 must match question."
          : "Bulleted/numbered list of 5-8 items under matching H2",
        aiOverviewRisk: k.aiOverviewRisk || "medium",
        priority: k.priority || "medium",
      }));

    // ── Cannibalization ──────────────────────────────────────────────────────
    const cannibalization = detectCannibalization(allKeywords);

    // ── Kill signals ─────────────────────────────────────────────────────────
    let killSignals = null;
    try {
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const convSnap = await db.collection("conversions").where("clientId","==",clientId).get();
      const leadsByKw = {};
      convSnap.docs.forEach(d => {
        const data = d.data();
        if (data.submittedAt >= ninetyDaysAgo) {
          const kw = (data.gscKeyword || "").toLowerCase();
          if (kw) leadsByKw[kw] = (leadsByKw[kw] || 0) + 1;
        }
      });
      const rankings = await getState(clientId, "A10_rankings") || {};
      const rankedKws = (rankings.keywords || []).map(r => (r.keyword || "").toLowerCase());
      let deprioritized = 0;
      for (const kw of allKeywords) {
        const norm = (kw.keyword || "").toLowerCase();
        if (rankedKws.includes(norm) && !leadsByKw[norm] && kw.priority !== "low") {
          kw.priority = "low"; kw.deprioritized = true;
          kw.killReason = "0 leads in 90 days despite rankings"; deprioritized++;
        }
      }
      if (deprioritized > 0) killSignals = { deprioritized, reason: "no_conversions_90d" };
    } catch (e) {
      console.warn(`[A3] Kill-signal check failed: ${e.message}`);
    }

    // ── AI Overview defence strategy (only if high risk) ────────────────────
    let aiOverviewDefence = null;
    if (zeroClickRiskPct > 30) {
      try {
        const defencePrompt = `Our keyword portfolio has ${zeroClickRiskPct}% at HIGH AI Overview risk.
High-risk: ${allKeywords.filter(k=>k.aiOverviewRisk==="high").slice(0,5).map(k=>k.keyword).join(", ")}
Safe: ${allKeywords.filter(k=>k.aiOverviewRisk==="low").slice(0,5).map(k=>k.keyword).join(", ")}

As SEO Head, give a zero-click defence strategy in 3 sentences:
1. Which safe keywords to prioritise for traffic
2. How to handle high-risk keywords (featured snippet + GEO)
3. What content type survives AI Overview for this business`;

        const d = await callLLM(clientId, keys, defencePrompt, {
          system: masterPrompt, maxTokens: 300, temperature: 0.3,
        });
        aiOverviewDefence = d?.content || d;
      } catch { /* non-blocking */ }
    }

    const result = {
      status:           "complete",
      totalKeywords:    allKeywords.length,
      clusters:         keywordData,
      keywordMap:       allKeywords,
      gaps:             keywordData.gaps || [],
      serpData,
      hasSerpData:      Object.keys(serpData).length > 0,
      seRankingData:    Object.keys(seMetrics).length > 0
        ? { enriched:true, keywordsEnriched:Object.keys(seMetrics).length, currentRankings:keywordData.currentRankings||[] }
        : null,
      // 2025 intelligence
      aiRiskSummary,
      zeroClickRiskPct,
      aiOverviewDefence,
      geoKeywords,
      topicalHubs,
      snippetOpportunities,
      hasSnippetOpps:   snippetOpportunities.length > 0,
      cannibalization,
      hasCannibalization: cannibalization.length > 0,
      killSignals,
      summary: {
        totalKeywords: allKeywords.length,
        highAIRisk:    aiRiskSummary.high,
        lowAIRisk:     aiRiskSummary.low,
        zeroClickRiskPct,
        topicalHubs:   topicalHubs.length,
        snippetOpps:   snippetOpportunities.length,
        geoOpps:       geoKeywords.length,
      },
      generatedAt: new Date().toISOString(),
    };

    await saveState(clientId, "A3_keywords", result);

    try {
      const safePriority = allKeywords.filter(k => k.aiOverviewRisk==="low" && k.priority==="high").slice(0,10).map(k=>k.keyword);
      if (safePriority.length > 0) {
        emitToolSuggestion(clientId, "keywords_ready", {}, { keywords:safePriority, businessName:brief.businessName||"", url:websiteUrl }).catch(()=>{});
      }
      if (geoKeywords[0]) emitToolSuggestion(clientId, "geo_opportunity", { keyword:geoKeywords[0].keyword }, {}).catch(()=>{});
    } catch { /* non-blocking */ }

    console.log(`[A3] ✅ ${allKeywords.length} keywords | AI risk: ${zeroClickRiskPct}% high | ${topicalHubs.length} hubs | ${geoKeywords.length} GEO opps`);
    return { success: true, keywords: result };

  } catch (e) {
    console.error(`[A3] Keyword research failed for ${clientId}:`, e.message);
    return { success: false, error: e.message };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getAllKwStrings(kd) {
  return ["brand","generic","longtail","informational","transactional","local"]
    .flatMap(c => (kd[c]||[]).map(k=>k.keyword)).filter(Boolean);
}
function flattenClusters(clusters) {
  return ["brand","generic","longtail","informational","local"]
    .flatMap(c => (clusters[c]||[]).map(k=>({...k,cluster:c})));
}
function flattenClustersAll(kd) {
  return ["brand","generic","longtail","informational","transactional","local"]
    .flatMap(c => (kd[c]||[]).map(k=>({...k,cluster:c})));
}
function buildTopicalHubs(allKws) {
  const hubMap = {};
  for (const kw of allKws) {
    const hub = kw.topicalHub || kw.cluster || "general";
    if (!hubMap[hub]) hubMap[hub] = { hubName:hub, keywords:[], clusterPages:[] };
    hubMap[hub].keywords.push(kw.keyword);
    if (kw.suggestedPage && !hubMap[hub].clusterPages.includes(kw.suggestedPage))
      hubMap[hub].clusterPages.push(kw.suggestedPage);
  }
  return Object.values(hubMap).filter(h=>h.keywords.length>=2).map(h=>({
    hubName: h.hubName, pillarPage: h.clusterPages[0]||"/",
    clusterPages: h.clusterPages.slice(1,5), keywords: h.keywords.slice(0,8),
    priority: h.keywords.length>=5?"high":"medium",
  }));
}
function detectCannibalization(allKws) {
  const pageMap = {};
  for (const kw of allKws) {
    const page = kw.suggestedPage || "/";
    if (!pageMap[page]) pageMap[page] = [];
    pageMap[page].push(kw);
  }
  return Object.entries(pageMap).filter(([,kws])=>kws.length>=3).map(([page,kws])=>{
    const intents = [...new Set(kws.map(k=>k.intent))];
    if (intents.length<2 && kws.length<4) return null;
    return { page, keywords:kws.map(k=>k.keyword), keywordCount:kws.length, intents,
      risk: kws.length>=5?"high":"medium",
      fix: `Split into ${intents.length} separate pages — one per intent.` };
  }).filter(Boolean);
}
function buildSeedClusters(brief) {
  const name     = (brief?.businessName||"").toString();
  const services = [].concat(brief?.services||[]).filter(s=>s&&typeof s==="string");
  const locs     = [].concat(brief?.targetLocations||(brief?.targetLocation?[brief.targetLocation]:[])).filter(Boolean);
  const keywords = [].concat(brief?.primaryKeywords||[]).filter(k=>k&&typeof k==="string");
  const brand = [
    {keyword:name.toLowerCase(),intent:"navigational",aiOverviewRisk:"low",zeroClickProbability:5,difficulty:"low",priority:"high",suggestedPage:"/"},
    ...keywords.map(k=>({keyword:k,intent:"navigational",aiOverviewRisk:"low",zeroClickProbability:5,difficulty:"low",priority:"high",suggestedPage:"/"})),
  ].slice(0,5);
  const generic = services.slice(0,6).map(s=>({keyword:s.toLowerCase(),intent:"transactional",aiOverviewRisk:"low",zeroClickProbability:10,difficulty:"medium",priority:"high",suggestedPage:"/services"}));
  const longtail = services.slice(0,4).map(s=>({keyword:`best ${s.toLowerCase()}`,intent:"commercial",aiOverviewRisk:"medium",zeroClickProbability:30,difficulty:"medium",priority:"medium",suggestedPage:"/services"}));
  const local = locs.slice(0,3).flatMap(loc=>services.slice(0,2).map(s=>({keyword:`${s.toLowerCase()} ${loc.toLowerCase()}`,location:loc,intent:"local",aiOverviewRisk:"low",zeroClickProbability:8,difficulty:"low",priority:"high",suggestedPage:"/services"})));
  const informational = services.slice(0,3).map(s=>({keyword:`how to choose ${s.toLowerCase()}`,intent:"informational",aiOverviewRisk:"high",zeroClickProbability:70,geoOpportunity:true,difficulty:"low",priority:"medium",suggestedPage:"/blog",notes:"High AI risk — optimise for snippet + GEO"}));
  return { brand, generic, longtail, local, informational, gaps:[], topicalHubs:[], generatedBy:"rule-engine" };
}

module.exports = { runA3 };
