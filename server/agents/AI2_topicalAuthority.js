/**
 * AI2 — Topical Authority Map
 *
 * Builds a visual map of topic clusters and identifies coverage gaps
 * vs competitors — one of the strongest Google E-E-A-T ranking signals.
 *
 * Method:
 *  1. Extract all current keywords → group into topic clusters by semantic similarity
 *  2. Map which topics have 0, 1, 2, or 3+ pages (coverage depth)
 *  3. Compare against competitor topics from A4
 *  4. LLM: identify the 5 biggest topical authority gaps
 *
 * Outputs:
 *  - topicClusters: [{topic, keywords[], coverage, competitorCoverage, gap}]
 *  - authorityScore: 0-100
 *  - topGaps: prioritized list of missing topic coverage
 *  - contentPlan: suggested articles to close gaps
 */
const { getState, saveState } = require("../shared-state/stateManager");
const { callLLM, parseJSON }  = require("../utils/llm");

async function runAI2(clientId, keys) {
  try {
    const brief      = await getState(clientId, "A1_brief");
    const keywords   = await getState(clientId, "A3_keywords");
    const competitor = await getState(clientId, "A4_competitor");
    const content    = await getState(clientId, "A5_content");

    if (!brief?.websiteUrl) return { success: false, error: "A1 brief not found" };

    const kwList = (keywords?.keywordMap || []).slice(0, 60);
    if (kwList.length === 0) return { success: false, error: "No keywords found — run A3 first" };

    // ── Simple semantic clustering: group by shared root words ────────────
    const clusters = {};
    kwList.forEach(kw => {
      const words = kw.keyword.toLowerCase().split(/\s+/);
      // Use the most distinctive 1-2 word stem as cluster key
      const key = words.slice(0, 2).join(" ");
      if (!clusters[key]) clusters[key] = { topic: key, keywords: [], priority: 0 };
      clusters[key].keywords.push(kw);
      if (kw.priority === "high") clusters[key].priority += 3;
      else if (kw.priority === "medium") clusters[key].priority += 1;
    });

    // Merge tiny clusters (< 2 keywords) into "other"
    const finalClusters = Object.values(clusters).filter(c => c.keywords.length >= 1);

    // ── Competitor topic coverage from A4 ─────────────────────────────────
    const compTopics = new Set(
      (competitor?.competitorTopics || competitor?.topicGaps || []).map(t => t.toLowerCase())
    );
    const ourPages = (content?.contentPlan || content?.pages || []).map(p =>
      (p.targetKeyword || p.keyword || p.title || "").toLowerCase()
    );

    // ── LLM: deep topical authority analysis ─────────────────────────────
    let topicAnalysis = {};
    if (keys?.groq || keys?.gemini) {
      try {
        const kwSample = kwList.slice(0, 40).map(k => `${k.keyword} (${k.priority})`).join(", ");
        const compData = competitor?.competitors?.slice(0, 3).map(c =>
          `${c.domain || c.url}: ${(c.topicsCovered || []).join(", ")}`
        ).join("\n") || "No competitor topic data";

        const prompt = `You are an SEO topical authority strategist.

Client: ${brief.businessName}
Website: ${brief.websiteUrl}
Services: ${[].concat(brief.services || []).join(", ")}

Current keywords: ${kwSample}

Our published pages: ${ourPages.slice(0, 15).join(", ") || "none yet"}

Competitor topics covered:
${compData}

Analyse topical authority. Group keywords into topic clusters. For each cluster:
1. Rate our coverage (0 = no content, 1 = thin, 2 = moderate, 3 = comprehensive)
2. Rate competitor coverage
3. Identify if this is a gap

Return ONLY valid JSON:
{
  "topicClusters": [
    {
      "topic": "cluster name",
      "subtopics": ["subtopic1", "subtopic2"],
      "ourCoverage": 0-3,
      "competitorCoverage": 0-3,
      "isGap": true/false,
      "priority": "high|medium|low",
      "suggestedPages": ["title1", "title2"]
    }
  ],
  "authorityScore": 0-100,
  "topGaps": [
    {
      "topic": "gap topic",
      "why": "why this matters for rankings",
      "suggestedArticles": ["article title 1", "article title 2"],
      "estimatedTrafficPotential": "X visits/month"
    }
  ],
  "strengthAreas": ["topic1", "topic2"],
  "summary": "2-sentence topical authority assessment"
}`;

        const response = await callLLM(prompt, keys, { maxTokens: 2000, temperature: 0.3, clientId });
        topicAnalysis  = parseJSON(response) || {};
      } catch { /* non-blocking */ }
    }

    const result = {
      success:         true,
      scannedAt:       new Date().toISOString(),
      topicClusters:   topicAnalysis.topicClusters   || finalClusters.slice(0, 20).map(c => ({
        topic:              c.topic,
        subtopics:          c.keywords.map(k => k.keyword).slice(0, 5),
        ourCoverage:        ourPages.filter(p => p.includes(c.topic)).length > 0 ? 1 : 0,
        competitorCoverage: compTopics.has(c.topic) ? 2 : 0,
        isGap:              ourPages.filter(p => p.includes(c.topic)).length === 0,
        priority:           c.priority >= 3 ? "high" : c.priority >= 1 ? "medium" : "low",
        suggestedPages:     [],
      })),
      authorityScore:  topicAnalysis.authorityScore  || 30,
      topGaps:         topicAnalysis.topGaps          || [],
      strengthAreas:   topicAnalysis.strengthAreas   || [],
      summary:         topicAnalysis.summary          || null,
      totalClusters:   finalClusters.length,
      gapCount:        (topicAnalysis.topicClusters || []).filter(c => c.isGap).length,
    };

    await saveState(clientId, "AI2_topicalAuthority", result);
    return result;

  } catch (e) {
    console.error(`[AI2] Topical authority map failed for ${clientId}:`, e.message);
    return { success: false, error: e.message };
  }
}

module.exports = { runAI2 };
