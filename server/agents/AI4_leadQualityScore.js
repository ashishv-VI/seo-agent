/**
 * AI4 — Lead Quality Score
 *
 * Scores each traffic source / keyword by the quality of leads it generates
 * — not just raw conversion count, but intent signals + revenue potential.
 *
 * Method:
 *  1. Pull conversion data (form fills, phone clicks, WhatsApp) from `conversions` collection
 *  2. Join with GSC keyword data to get keyword → landing page → conversion
 *  3. Score each keyword/source: clicks-to-lead rate × estimated AOV × intent multiplier
 *  4. Identify "zombie traffic" — high clicks, zero leads
 *  5. LLM: "which traffic sources actually make money?"
 */
const { db }              = require("../config/firebase");
const { getState, saveState } = require("../shared-state/stateManager");
const { callLLM, parseJSON }  = require("../utils/llm");

async function runAI4(clientId, keys) {
  try {
    const brief    = await getState(clientId, "A1_brief");
    const rankings = await getState(clientId, "A10_rankings");
    const keywords = await getState(clientId, "A3_keywords");

    if (!brief?.websiteUrl) return { success: false, error: "A1 brief not found" };

    const aov = brief.avgOrderValue || brief.averageOrderValue || 500;

    // ── Pull 90-day conversions ────────────────────────────────────────────
    const ninetyDaysAgo = new Date(Date.now() - 90*24*60*60*1000).toISOString();
    const convSnap = await db.collection("conversions")
      .where("clientId", "==", clientId)
      .where("createdAt", ">=", ninetyDaysAgo)
      .limit(500)
      .get()
      .catch(() => ({ docs: [] }));

    const conversions = convSnap.docs.map(d => d.data());

    // ── Build page → conversion map ───────────────────────────────────────
    const pageConversions = {};
    conversions.forEach(c => {
      const page = c.page || c.url || c.landingPage || "";
      if (!page) return;
      if (!pageConversions[page]) pageConversions[page] = { total: 0, types: {} };
      pageConversions[page].total++;
      const type = c.type || c.eventType || "form";
      pageConversions[page].types[type] = (pageConversions[page].types[type] || 0) + 1;
    });

    // ── Score keywords by quality ─────────────────────────────────────────
    const kwScores = [];
    const kwByPage = {};
    (rankings?.rankings || []).forEach(r => {
      const page = r.page || r.url;
      if (!page) return;
      if (!kwByPage[page]) kwByPage[page] = [];
      kwByPage[page].push(r);
    });

    for (const [page, pageRankings] of Object.entries(kwByPage)) {
      const convData = pageConversions[page] || { total: 0, types: {} };
      const totalClicks = pageRankings.reduce((s, r) => s + (r.clicks || 0), 0);

      pageRankings.forEach(r => {
        const kwMeta = (keywords?.keywordMap || []).find(k =>
          k.keyword.toLowerCase() === (r.keyword || "").toLowerCase()
        );

        // Intent multiplier: transactional > commercial > informational
        const intent = kwMeta?.intent || "informational";
        const intentMultiplier = intent === "transactional" ? 3 : intent === "commercial" ? 2 : 1;

        // Click share this keyword contributes to the page
        const clickShare  = totalClicks > 0 ? (r.clicks || 0) / totalClicks : 0;
        const kwConvShare = convData.total * clickShare;
        const convRate    = (r.clicks || 0) > 0 ? kwConvShare / (r.clicks || 1) : 0;

        // Quality score: conv rate × intent multiplier × position bonus
        const positionBonus = r.position <= 3 ? 1.5 : r.position <= 10 ? 1.2 : 0.8;
        const qualityScore  = Math.min(100, Math.round(
          (convRate * 100 * intentMultiplier * positionBonus)
        ));

        const revenueAttributed = Math.round(kwConvShare * aov);
        const isZombieTraffic   = (r.clicks || 0) > 20 && kwConvShare < 0.1;

        kwScores.push({
          keyword:           r.keyword,
          page:              page.replace(/^https?:\/\/[^/]+/, "") || "/",
          clicks:            r.clicks || 0,
          position:          r.position || 50,
          conversions:       parseFloat(kwConvShare.toFixed(2)),
          conversionRate:    parseFloat((convRate * 100).toFixed(2)),
          intent,
          qualityScore,
          revenueAttributed,
          isZombieTraffic,
          priority:          kwMeta?.priority || "low",
        });
      });
    }

    kwScores.sort((a, b) => b.qualityScore - a.qualityScore);

    const zombieKeywords  = kwScores.filter(k => k.isZombieTraffic);
    const topPerformers   = kwScores.filter(k => k.qualityScore >= 50).slice(0, 10);
    const totalRevenue    = kwScores.reduce((s, k) => s + k.revenueAttributed, 0);

    // ── LLM: strategic analysis ───────────────────────────────────────────
    let analysis = {};
    if (kwScores.length > 0 && (keys?.groq || keys?.gemini)) {
      try {
        const prompt = `You are an SEO revenue analyst.

Client: ${brief.businessName}
AOV: £${aov}
Total organic conversions (90 days): ${conversions.length}
Total attributed revenue: £${totalRevenue.toLocaleString()}

Top performing keywords:
${topPerformers.slice(0, 8).map(k =>
  `- "${k.keyword}": score ${k.qualityScore}/100, ${k.conversions} convs, £${k.revenueAttributed} revenue, pos ${k.position}`
).join("\n")}

Zombie traffic (high clicks, zero leads):
${zombieKeywords.slice(0, 5).map(k =>
  `- "${k.keyword}": ${k.clicks} clicks, 0 leads (intent: ${k.intent})`
).join("\n") || "none detected"}

Return ONLY valid JSON:
{
  "insight": "2-3 sentence revenue-first insight",
  "doubleDownKeywords": ["kw1", "kw2"],
  "deprioritiseKeywords": ["kw1", "kw2"],
  "revenueGrowthPlay": "single most impactful action to increase lead quality",
  "zombieReason": "why zombie keywords get clicks but no leads",
  "projectedMonthlyRevenue": "£X if top keywords improved to pos 3"
}`;

        const response = await callLLM(prompt, keys, { maxTokens: 800, temperature: 0.3, clientId });
        analysis       = parseJSON(response) || {};
      } catch { /* non-blocking */ }
    }

    const result = {
      success:                 true,
      scannedAt:               new Date().toISOString(),
      totalKeywordsScored:     kwScores.length,
      totalConversions:        conversions.length,
      totalRevenueAttributed:  totalRevenue,
      avgOrderValue:           aov,
      topPerformers:           kwScores.slice(0, 20),
      zombieKeywords:          zombieKeywords.slice(0, 10),
      zombieCount:             zombieKeywords.length,
      insight:                 analysis.insight                 || null,
      doubleDownKeywords:      analysis.doubleDownKeywords      || topPerformers.slice(0, 3).map(k => k.keyword),
      deprioritiseKeywords:    analysis.deprioritiseKeywords    || zombieKeywords.slice(0, 3).map(k => k.keyword),
      revenueGrowthPlay:       analysis.revenueGrowthPlay       || null,
      projectedMonthlyRevenue: analysis.projectedMonthlyRevenue || null,
      dataSource:              conversions.length > 0 ? "live_conversions" : "estimated",
    };

    await saveState(clientId, "AI4_leadQualityScore", result);
    return result;

  } catch (e) {
    console.error(`[AI4] Lead quality score failed for ${clientId}:`, e.message);
    return { success: false, error: e.message };
  }
}

module.exports = { runAI4 };
