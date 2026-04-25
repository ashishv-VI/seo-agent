/**
 * AI3 — SERP Volatility Monitor
 *
 * Detects when Google is reshuffling rankings in your niche —
 * a strong signal that a core update is rolling out or targeting your sector.
 *
 * Method:
 *  1. Pull last 60 days of rank_history for this client
 *  2. Calculate standard deviation of positions per keyword
 *  3. High SD = volatile SERP for that keyword
 *  4. Correlate with known core update dates
 *  5. LLM: "is this normal churn or update signal?"
 *
 * Outputs:
 *  - volatileKeywords: keywords with high position variance
 *  - volatilityScore: 0-100 overall SERP stability
 *  - updateSignal: boolean — looks like core update targeting this niche
 *  - alerts + notifications if score spikes
 */
const { db }              = require("../config/firebase");
const { getState, saveState } = require("../shared-state/stateManager");
const { callLLM, parseJSON }  = require("../utils/llm");

// Known major Google core update periods (approximate windows)
const CORE_UPDATE_WINDOWS = [
  { name: "March 2024 Core Update",       start: "2024-03-05", end: "2024-04-19" },
  { name: "August 2024 Core Update",      start: "2024-08-15", end: "2024-09-03" },
  { name: "November 2024 Core Update",    start: "2024-11-11", end: "2024-12-05" },
  { name: "March 2025 Core Update",       start: "2025-03-13", end: "2025-03-27" },
  { name: "Helpful Content (ongoing)",    start: "2023-09-14", end: "2099-01-01" },
];

function stdDev(arr) {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  const sq   = arr.map(v => (v - mean) ** 2);
  return Math.sqrt(sq.reduce((s, v) => s + v, 0) / arr.length);
}

async function runAI3(clientId, keys) {
  try {
    const brief    = await getState(clientId, "A1_brief");
    const rankings = await getState(clientId, "A10_rankings");
    const keywords = await getState(clientId, "A3_keywords");

    if (!brief?.websiteUrl) return { success: false, error: "A1 brief not found" };

    // ── Pull rank_history snapshots (last 60 days) ────────────────────────
    const sixtyDaysAgo = new Date(Date.now() - 60*24*60*60*1000).toISOString().split("T")[0];
    const histSnap = await db.collection("rank_history")
      .where("clientId", "==", clientId)
      .where("date", ">=", sixtyDaysAgo)
      .orderBy("date", "asc")
      .limit(200)
      .get()
      .catch(() => ({ docs: [] }));

    const histDocs = histSnap.docs.map(d => d.data());

    // ── Build per-keyword position time series ────────────────────────────
    const kwSeries = {}; // keyword → [{ date, position }]
    histDocs.forEach(snap => {
      (snap.rankings || []).forEach(r => {
        if (!r.keyword || !r.position) return;
        if (!kwSeries[r.keyword]) kwSeries[r.keyword] = [];
        kwSeries[r.keyword].push({ date: snap.date, position: r.position });
      });
    });

    // Also use current rankings as the latest data point
    (rankings?.rankings || []).forEach(r => {
      if (!r.keyword || !r.position) return;
      const today = new Date().toISOString().split("T")[0];
      if (!kwSeries[r.keyword]) kwSeries[r.keyword] = [];
      // Only add if not already today
      if (!kwSeries[r.keyword].find(p => p.date === today)) {
        kwSeries[r.keyword].push({ date: today, position: r.position });
      }
    });

    // ── Calculate volatility per keyword ──────────────────────────────────
    const kwVolatility = [];
    for (const [kw, series] of Object.entries(kwSeries)) {
      if (series.length < 2) continue;
      const positions  = series.map(s => s.position);
      const sd         = stdDev(positions);
      const avgPos     = positions.reduce((s, v) => s + v, 0) / positions.length;
      const maxDrop    = Math.max(0, ...positions) - Math.min(0, ...positions);
      const recentPos  = series[series.length - 1]?.position;
      const prevPos    = series[0]?.position;
      const trend      = recentPos - prevPos; // positive = worsening

      kwVolatility.push({
        keyword:      kw,
        volatility:   parseFloat(sd.toFixed(2)),
        avgPosition:  parseFloat(avgPos.toFixed(1)),
        currentPos:   recentPos,
        startPos:     prevPos,
        trend:        parseFloat(trend.toFixed(1)),
        maxSwing:     parseFloat(maxDrop.toFixed(1)),
        dataPoints:   series.length,
        severity:     sd > 10 ? "high" : sd > 5 ? "medium" : "low",
      });
    }

    kwVolatility.sort((a, b) => b.volatility - a.volatility);

    // ── Niche-level volatility score (0 = stable, 100 = extreme churn) ────
    const highVol  = kwVolatility.filter(k => k.severity === "high").length;
    const medVol   = kwVolatility.filter(k => k.severity === "medium").length;
    const total    = kwVolatility.length || 1;
    const volScore = Math.min(100, Math.round(
      ((highVol * 3 + medVol * 1.5) / total) * 100 / 3
    ));

    // ── Check if current date falls within a known update window ──────────
    const today   = new Date().toISOString().split("T")[0];
    const activeUpdate = CORE_UPDATE_WINDOWS.find(w => today >= w.start && today <= w.end);
    const updateSignal = volScore > 40 || !!activeUpdate;

    // ── LLM: interpret the volatility pattern ─────────────────────────────
    let interpretation = {};
    if (kwVolatility.length > 0 && (keys?.groq || keys?.gemini)) {
      try {
        const topVol = kwVolatility.slice(0, 10);
        const prompt = `You are an SEO analyst. Analyse this SERP volatility data.

Client niche: ${brief.businessName} — ${[].concat(brief.services || []).join(", ")}
Overall volatility score: ${volScore}/100
${activeUpdate ? `⚠ Active Google update: ${activeUpdate.name}` : "No known active Google update"}

Most volatile keywords:
${topVol.map(k => `- "${k.keyword}": position avg ${k.avgPosition}, SD ${k.volatility}, trend ${k.trend > 0 ? "+" : ""}${k.trend} (${k.dataPoints} data points)`).join("\n")}

Return ONLY valid JSON:
{
  "interpretation": "2-3 sentence explanation of what this volatility means for this client",
  "updateRisk": "high|medium|low",
  "isUpdateSignal": true/false,
  "recommendedActions": ["action1", "action2", "action3"],
  "protectKeywords": ["kw1", "kw2"],
  "waitOrAct": "wait for update to settle|act now with content improvements"
}`;

        const response = await callLLM(prompt, keys, { maxTokens: 800, temperature: 0.2, clientId });
        interpretation = parseJSON(response) || {};
      } catch { /* non-blocking */ }
    }

    // ── Write alert if high volatility ───────────────────────────────────
    if (volScore > 50 || updateSignal) {
      await db.collection("alerts").add({
        clientId,
        type:      "serp_volatility",
        tier:      volScore > 70 ? "P1" : "P2",
        severity:  volScore > 70 ? "p1" : "p2",
        source:    "AI3_serpVolatility",
        message:   `SERP volatility score ${volScore}/100 — ${updateSignal ? "possible Google core update targeting your niche" : "rankings are unstable"}`,
        fix:       interpretation.waitOrAct || "Monitor rankings daily. Strengthen E-E-A-T signals and content quality.",
        resolved:  false,
        createdAt: new Date().toISOString(),
      }).catch(() => {});
    }

    const result = {
      success:           true,
      scannedAt:         new Date().toISOString(),
      volatilityScore:   volScore,
      updateSignal,
      activeUpdate:      activeUpdate || null,
      volatileKeywords:  kwVolatility.slice(0, 20),
      highVolatileCount: highVol,
      totalTracked:      kwVolatility.length,
      interpretation:    interpretation.interpretation    || null,
      updateRisk:        interpretation.updateRisk        || (volScore > 60 ? "high" : "medium"),
      recommendedActions: interpretation.recommendedActions || [],
      protectKeywords:   interpretation.protectKeywords   || [],
      waitOrAct:         interpretation.waitOrAct         || null,
      stability:         volScore < 20 ? "stable" : volScore < 50 ? "moderate" : "volatile",
    };

    await saveState(clientId, "AI3_serpVolatility", result);
    return result;

  } catch (e) {
    console.error(`[AI3] SERP volatility scan failed for ${clientId}:`, e.message);
    return { success: false, error: e.message };
  }
}

module.exports = { runAI3 };
