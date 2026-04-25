/**
 * AI7 — Content Decay Detector
 *
 * Finds pages losing clicks/impressions/rankings over time.
 * Compares current 28-day GSC window vs prior 28-day window.
 * Also checks rank_history for position drift on each page.
 *
 * Outputs:
 *  - decayingPages: pages with significant traffic drop
 *  - refreshQueue: top pages auto-queued in content_drafts for refresh
 *  - approval_queue items for high-decay pages
 */
const { db, FieldValue } = require("../config/firebase");
const { getState, saveState } = require("../shared-state/stateManager");
const { callLLM, parseJSON } = require("../utils/llm");

async function runAI7(clientId, keys) {
  try {
    const brief    = await getState(clientId, "A1_brief");
    const keywords = await getState(clientId, "A3_keywords");
    const rankings = await getState(clientId, "A10_rankings");

    if (!brief?.websiteUrl) return { success: false, error: "A1 brief not found" };

    const now     = Date.now();
    const gscDelay = 3 * 24 * 60 * 60 * 1000;

    // ── Pull GSC page-level data for current + prior period ───────────────
    const gscToken = keys?.gscToken || keys?.googleToken || null;
    let pageData = {};

    if (gscToken) {
      const endDate   = new Date(now - gscDelay).toISOString().split("T")[0];
      const startDate = new Date(now - gscDelay - 28*24*60*60*1000).toISOString().split("T")[0];
      const prevEnd   = new Date(now - gscDelay - 29*24*60*60*1000).toISOString().split("T")[0];
      const prevStart = new Date(now - gscDelay - 57*24*60*60*1000).toISOString().split("T")[0];

      const siteUrl = brief.websiteUrl;
      const baseUrl = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${gscToken}` };

      const [curRes, prevRes] = await Promise.all([
        fetch(baseUrl, {
          method: "POST", headers,
          body: JSON.stringify({ startDate, endDate, dimensions: ["page"], rowLimit: 100 }),
          signal: AbortSignal.timeout(20000),
        }).then(r => r.json()).catch(() => ({})),
        fetch(baseUrl, {
          method: "POST", headers,
          body: JSON.stringify({ startDate: prevStart, endDate: prevEnd, dimensions: ["page"], rowLimit: 100 }),
          signal: AbortSignal.timeout(20000),
        }).then(r => r.json()).catch(() => ({})),
      ]);

      const curMap  = {};
      const prevMap = {};
      (curRes.rows  || []).forEach(r => { curMap[r.keys[0]]  = r; });
      (prevRes.rows || []).forEach(r => { prevMap[r.keys[0]] = r; });

      const allPages = new Set([...Object.keys(curMap), ...Object.keys(prevMap)]);
      allPages.forEach(page => {
        const cur  = curMap[page]  || { clicks: 0, impressions: 0, position: 100, ctr: 0 };
        const prev = prevMap[page] || { clicks: 0, impressions: 0, position: 100, ctr: 0 };
        pageData[page] = {
          page,
          curClicks:        cur.clicks       || 0,
          prevClicks:       prev.clicks      || 0,
          curImpressions:   cur.impressions  || 0,
          prevImpressions:  prev.impressions || 0,
          curPosition:      parseFloat((cur.position  || 100).toFixed(1)),
          prevPosition:     parseFloat((prev.position || 100).toFixed(1)),
          clicksDelta:      (cur.clicks || 0) - (prev.clicks || 0),
          impressionsDelta: (cur.impressions || 0) - (prev.impressions || 0),
          positionDelta:    parseFloat(((prev.position || 100) - (cur.position || 100)).toFixed(1)), // positive = improved
        };
      });
    }

    // ── Also use A10 ranking data if GSC not available ─────────────────────
    if (Object.keys(pageData).length === 0 && rankings?.rankings?.length > 0) {
      rankings.rankings.forEach(r => {
        const page = r.page || r.url || "";
        if (!page) return;
        pageData[page] = {
          page,
          curClicks:       r.clicks || 0,
          prevClicks:      0,
          curImpressions:  r.impressions || 0,
          prevImpressions: 0,
          curPosition:     r.position || 50,
          prevPosition:    r.position || 50,
          clicksDelta:     0,
          impressionsDelta: 0,
          positionDelta:   0,
        };
      });
    }

    // ── Detect decaying pages ─────────────────────────────────────────────
    // A page is "decaying" if:
    //  - clicks dropped >20% OR
    //  - impressions dropped >20% OR
    //  - position worsened >3 spots
    const decayingPages = Object.values(pageData)
      .filter(p => {
        const clickDrop       = p.prevClicks > 5  && p.clicksDelta < -(p.prevClicks * 0.2);
        const impressionDrop  = p.prevImpressions > 20 && p.impressionsDelta < -(p.prevImpressions * 0.2);
        const positionWorsen  = p.positionDelta < -3;
        return clickDrop || impressionDrop || positionWorsen;
      })
      .map(p => {
        const clickDropPct = p.prevClicks > 0
          ? Math.round(((p.prevClicks - p.curClicks) / p.prevClicks) * 100)
          : 0;
        const severity = clickDropPct > 50 || p.positionDelta < -10
          ? "high"
          : clickDropPct > 25 || p.positionDelta < -5
          ? "medium"
          : "low";
        return { ...p, clickDropPct, severity };
      })
      .sort((a, b) => b.clickDropPct - a.clickDropPct)
      .slice(0, 20);

    // ── LLM: diagnose why + suggest refresh actions ───────────────────────
    let aiAnalysis = {};
    if (decayingPages.length > 0 && (keys?.groq || keys?.gemini)) {
      try {
        const topKeywords = (keywords?.keywordMap || [])
          .filter(k => k.priority === "high").slice(0, 10).map(k => k.keyword);

        const prompt = `You are an SEO content strategist. These pages are losing organic traffic.

Client: ${brief.businessName}
Website: ${brief.websiteUrl}
Target keywords: ${topKeywords.join(", ")}

Decaying pages (sorted by click drop %):
${decayingPages.slice(0, 10).map(p =>
  `- ${p.page.replace(/^https?:\/\/[^/]+/, "") || "/"}: -${p.clickDropPct}% clicks, position ${p.prevPosition}→${p.curPosition}`
).join("\n")}

For each page, diagnose why it's decaying and suggest a specific refresh action.
Return ONLY valid JSON:
{
  "diagnoses": [
    {
      "page": "/slug",
      "likelyReason": "why it dropped (content outdated / competitor outranked / intent shift / thin content / etc)",
      "refreshAction": "specific action: update stats, add FAQ, expand word count, rewrite intro, etc",
      "targetKeyword": "primary keyword to optimise for",
      "estimatedRecoveryTime": "X weeks after refresh",
      "priorityScore": 1-10
    }
  ],
  "overallPattern": "1-2 sentence pattern across all decaying pages",
  "urgency": "high|medium|low"
}`;

        const response = await callLLM(prompt, keys, { maxTokens: 1500, temperature: 0.3, clientId });
        aiAnalysis = parseJSON(response) || {};
      } catch { /* non-blocking */ }
    }

    // Merge AI diagnoses into decaying pages
    const diagMap = {};
    (aiAnalysis.diagnoses || []).forEach(d => { diagMap[d.page] = d; });

    const enrichedPages = decayingPages.map(p => {
      const slug = p.page.replace(/^https?:\/\/[^/]+/, "") || "/";
      const diag = diagMap[slug] || diagMap[p.page] || {};
      return { ...p, ...diag };
    });

    // ── Auto-queue high-decay pages for content refresh ───────────────────
    const highDecay = enrichedPages.filter(p => p.severity === "high").slice(0, 3);
    let queued = 0;
    if (highDecay.length > 0) {
      const batch  = db.batch();
      const aqBatch = db.batch();
      let aqItems = 0;

      for (const page of highDecay) {
        const existing = await db.collection("content_drafts")
          .where("clientId", "==", clientId)
          .where("sourceUrl", "==", page.page)
          .where("intent", "==", "content_refresh")
          .limit(1).get();
        if (!existing.empty) continue;

        const ref = db.collection("content_drafts").doc();
        batch.set(ref, {
          id:          ref.id,
          clientId,
          keyword:     page.targetKeyword || "",
          title:       `Refresh: ${page.page.replace(/^https?:\/\/[^/]+/, "") || "/"}`,
          intent:      "content_refresh",
          sourceAgent: "AI7_contentDecay",
          sourceUrl:   page.page,
          reason:      page.likelyReason || `Traffic dropped ${page.clickDropPct}%`,
          refreshAction: page.refreshAction || "Update content, add FAQ section",
          severity:    page.severity,
          status:      "queued",
          createdAt:   FieldValue.serverTimestamp(),
        });
        queued++;

        const aqRef = db.collection("approval_queue").doc();
        aqBatch.set(aqRef, {
          clientId,
          type:            "content_decay_refresh",
          status:          "pending",
          source:          "AI7_contentDecay",
          title:           `Content Decay: ${page.page.replace(/^https?:\/\/[^/]+/, "") || "/"}`,
          suggestedAction: page.refreshAction || "Refresh this page — traffic is declining",
          detail:          `Clicks dropped ${page.clickDropPct}% (${page.prevClicks}→${page.curClicks}). ${page.likelyReason || ""}`,
          targetKeyword:   page.targetKeyword || "",
          estimatedImpact: `Recover ~${page.prevClicks} clicks/month after refresh`,
          severity:        page.severity,
          createdAt:       new Date().toISOString(),
        });
        aqItems++;
      }

      if (queued > 0)  await batch.commit();
      if (aqItems > 0) await aqBatch.commit();
    }

    const result = {
      success:       true,
      scannedAt:     new Date().toISOString(),
      totalPages:    Object.keys(pageData).length,
      decayCount:    enrichedPages.length,
      highDecay:     enrichedPages.filter(p => p.severity === "high").length,
      decayingPages: enrichedPages,
      overallPattern: aiAnalysis.overallPattern || null,
      urgency:       aiAnalysis.urgency || (enrichedPages.length > 5 ? "high" : "medium"),
      refreshQueued: queued,
      dataSource:    gscToken ? "gsc" : "rankings",
    };

    await saveState(clientId, "AI7_contentDecay", result);
    return result;

  } catch (e) {
    console.error(`[AI7] Content decay scan failed for ${clientId}:`, e.message);
    return { success: false, error: e.message };
  }
}

module.exports = { runAI7 };
