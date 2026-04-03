const { saveState, getState } = require("../shared-state/stateManager");
const { callLLM, parseJSON }  = require("../utils/llm");

/**
 * A4 — Competitor Intelligence Agent
 * Checks LIVE SERP rankings via SerpAPI
 * Blocked until A3 keyword research is complete
 */
async function runA4(clientId, keys) {
  const brief    = await getState(clientId, "A1_brief");
  const keywords = await getState(clientId, "A3_keywords");

  if (!brief?.signedOff)  return { success: false, error: "A1 brief not signed off" };
  if (!keywords?.status)  return { success: false, error: "A3 keyword research must complete first" };

  const competitors   = brief.competitors || [];
  const targetDomain  = new URL(brief.websiteUrl).hostname.replace("www.", "");
  const keywordMap    = keywords.keywordMap || [];

  // ── SerpAPI: Check live rankings ──────────────────
  const rankingMatrix = [];
  const checkKeywords = keywordMap
    .filter(k => k.priority === "high" || k.cluster === "generic")
    .slice(0, 10);

  if (keys.serpapi && checkKeywords.length > 0) {
    for (const kw of checkKeywords) {
      try {
        const locationStr = (brief.targetLocations || []).join(" ").toLowerCase();
        const gl = locationStr.includes("uk") || locationStr.includes("united kingdom") ? "gb"
                 : locationStr.includes("australia") ? "au"
                 : locationStr.includes("canada") ? "ca"
                 : locationStr.includes("india") ? "in"
                 : "us";
        const url  = `https://serpapi.com/search.json?q=${encodeURIComponent(kw.keyword)}&api_key=${keys.serpapi}&num=20&gl=${gl}&hl=en`;
        const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
        const data = await res.json();

        if (data.organic_results) {
          const results = data.organic_results.slice(0, 15);

          // Check client's position
          const clientPos = results.findIndex(r =>
            r.link?.includes(targetDomain)
          );

          // Check competitor positions
          const competitorPositions = competitors.map(comp => {
            const compDomain = comp.replace(/^https?:\/\//, "").replace("www.", "").split("/")[0];
            const pos = results.findIndex(r => r.link?.includes(compDomain));
            return {
              competitor: compDomain,
              position:   pos >= 0 ? pos + 1 : null,
              url:        pos >= 0 ? results[pos].link : null,
              title:      pos >= 0 ? results[pos].title : null,
            };
          });

          rankingMatrix.push({
            keyword:    kw.keyword,
            cluster:    kw.cluster,
            clientRank: clientPos >= 0 ? clientPos + 1 : null,
            competitors: competitorPositions,
            topResult:  { url: results[0]?.link, title: results[0]?.title, domain: results[0]?.link ? new URL(results[0].link).hostname : null },
            opportunity: clientPos < 0 ? "not_ranking" : clientPos < 3 ? "top_3" : clientPos < 10 ? "page_1" : "below_fold",
          });
        }
      } catch { /* skip */ }
    }
  }

  // ── LLM: Competitor analysis + content gaps ────────
  const competitorList = competitors.length > 0 ? competitors : ["(no competitors provided)"];
  const prompt = `You are an SEO competitive intelligence analyst.

Client: ${brief.businessName} (${brief.websiteUrl})
Competitors: ${competitorList.join(", ")}
Target Keywords: ${checkKeywords.map(k => k.keyword).join(", ")}
Business: ${brief.businessDescription || brief.businessName}

Analyse these competitors and identify opportunities. Return ONLY valid JSON:

{
  "competitorStrengths": [
    { "competitor": "domain.com", "strength": "what they do well", "threat": "high|medium|low" }
  ],
  "contentGaps": [
    { "topic": "topic/keyword", "reason": "competitors rank but client doesn't", "opportunity": "create a new page targeting this", "estimatedDifficulty": "low|medium|high" }
  ],
  "quickWins": [
    { "action": "what to do", "keyword": "target keyword", "expectedOutcome": "expected result" }
  ],
  "contentFormats": [
    { "format": "guide|listicle|tool|comparison", "keyword": "keyword", "whyItWorks": "reason based on competitor analysis" }
  ],
  "strategicSummary": "2-3 sentence competitive positioning summary"
}`;

  let analysis;
  try {
    const response = await callLLM(prompt, keys, { maxTokens: 3000 });
    analysis = parseJSON(response);
  } catch (e) {
    analysis = {
      competitorStrengths: [],
      contentGaps: [],
      quickWins: [],
      contentFormats: [],
      strategicSummary: `Competitor analysis requires manual review. ${e.message}`,
    };
  }

  // ── Build result ───────────────────────────────────
  const notRankingCount = rankingMatrix.filter(r => r.opportunity === "not_ranking").length;
  const top3Count       = rankingMatrix.filter(r => r.opportunity === "top_3").length;

  const result = {
    status:       "complete",
    targetDomain,
    competitors,
    rankingMatrix,
    hasSerpData:  rankingMatrix.length > 0,
    analysis,
    summary: {
      keywordsChecked:    rankingMatrix.length,
      notRanking:         notRankingCount,
      rankingTop3:        top3Count,
      rankingPage1:       rankingMatrix.filter(r => r.opportunity === "page_1").length,
      contentGapsFound:   analysis.contentGaps?.length || 0,
      quickWinsFound:     analysis.quickWins?.length || 0,
    },
    generatedAt: new Date().toISOString(),
  };

  await saveState(clientId, "A4_competitor", result);
  return { success: true, competitor: result };
}

module.exports = { runA4 };
