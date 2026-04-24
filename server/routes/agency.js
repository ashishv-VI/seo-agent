const express    = require("express");
const router     = express.Router();
const { db }     = require("../config/firebase");
const { verifyToken } = require("../middleware/auth");
const { getLatestScore, getScoreHistory } = require("../utils/scoreCalculator");
const { calculateROI } = require("../utils/roiTracker");

/**
 * Agency Dashboard API (Sprint 5)
 * Aggregates data across ALL clients for the agency head view.
 * Shows: total traffic, revenue, score trends, alerts, ROI per client.
 */

// GET /api/agency/dashboard
router.get("/dashboard", verifyToken, async (req, res) => {
  try {
    const snap = await db.collection("clients")
      .where("ownerId", "==", req.uid)
      .get();

    const clients = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (clients.length === 0) return res.json({ clients: [], summary: {}, trends: [] });

    // Fetch latest score + alert count + ROI per client in parallel
    const enriched = await Promise.all(clients.map(async client => {
      const [latestScore, alertSnap, pushSnap, roi] = await Promise.all([
        getLatestScore(client.id).catch(() => null),
        db.collection("alerts").where("clientId","==",client.id).where("resolved","==",false).limit(20).get().catch(() => null),
        db.collection("wp_push_log").where("clientId","==",client.id).limit(100).get().catch(() => null),
        calculateROI(client.id).catch(() => null),
      ]);

      const openAlerts = alertSnap ? alertSnap.size : 0;
      const fixesPushed = pushSnap ? pushSnap.size : 0;
      const score = latestScore?.overall || client.seoScore || null;
      const scoreDate = latestScore?.date || client.pipelineCompletedAt || null;
      const scoreAgeDays = scoreDate
        ? Math.floor((Date.now() - new Date(scoreDate).getTime()) / (24 * 60 * 60 * 1000))
        : null;
      const scoreStale = scoreAgeDays !== null && scoreAgeDays > 7;

      return {
        id:           client.id,
        name:         client.name,
        website:      client.website,
        seoScore:     score,
        scoreDate,
        scoreAgeDays,
        scoreStale,
        pipelineStatus: client.pipelineStatus,
        openAlerts,
        fixesPushed,
        lastPipeline: client.pipelineCompletedAt || null,
        // ROI fields for agency head view
        monthlyRevenueEstimate: roi?.revenue?.currentMonthlyEstimate || 0,
        revenueGainedFromFixes: roi?.revenue?.gainedFromFixes || 0,
        monthlyTrafficEstimate: roi?.traffic?.currentMonthlyEstimate || 0,
        currency:               roi?.currency || "GBP",
        status: score == null ? "no-data"
              : score >= 75 ? "healthy"
              : score >= 50 ? "needs-attention"
              : "critical",
      };
    }));

    // Summary totals
    const withScores = enriched.filter(c => c.seoScore != null);
    const avgScore   = withScores.length
      ? Math.round(withScores.reduce((s, c) => s + c.seoScore, 0) / withScores.length)
      : null;

    const summary = {
      totalClients:    enriched.length,
      avgSeoScore:     avgScore,
      healthy:         enriched.filter(c => c.status === "healthy").length,
      needsAttention:  enriched.filter(c => c.status === "needs-attention").length,
      critical:        enriched.filter(c => c.status === "critical").length,
      totalOpenAlerts: enriched.reduce((s, c) => s + c.openAlerts, 0),
      totalFixesPushed:enriched.reduce((s, c) => s + c.fixesPushed, 0),
      pipelineComplete:enriched.filter(c => c.pipelineStatus === "complete").length,
      // ROI roll-up across all clients
      totalMonthlyRevenue:  enriched.reduce((s, c) => s + (c.monthlyRevenueEstimate || 0), 0),
      totalRevenueGained:   enriched.reduce((s, c) => s + (c.revenueGainedFromFixes || 0), 0),
      totalMonthlyTraffic:  enriched.reduce((s, c) => s + (c.monthlyTrafficEstimate || 0), 0),
      currency:             enriched.find(c => c.currency)?.currency || "GBP",
    };

    // Score history for each client (last 8 weeks for sparklines)
    const trends = await Promise.all(
      enriched.slice(0, 10).map(async c => {
        const hist = await getScoreHistory(c.id, 8).catch(() => []);
        return { clientId: c.id, name: c.name, history: hist };
      })
    );

    // ── Cross-client pattern stats (proves the agent learns) ─────────
    // Aggregates global_patterns filtered to this agency owner → win rate per fixType
    let globalPatterns = [];
    try {
      const patSnap = await db.collection("global_patterns")
        .where("ownerId", "==", req.uid)
        .limit(500).get();
      const patterns = patSnap.docs.map(d => d.data());
      const byType = {};
      const clientsByType = {};
      for (const p of patterns) {
        const t = p.fixType || "other";
        if (!byType[t]) { byType[t] = { improved: 0, total: 0 }; clientsByType[t] = new Set(); }
        byType[t].total++;
        if (p.outcome === "improved") byType[t].improved++;
        if (p.clientId) clientsByType[t].add(p.clientId);
      }
      globalPatterns = Object.entries(byType)
        .filter(([, c]) => c.total >= 2)
        .map(([fixType, c]) => ({
          fixType,
          winRate: Math.round((c.improved / c.total) * 100),
          sample: c.total,
          clientCount: clientsByType[fixType].size,
        }))
        .sort((a, b) => b.winRate - a.winRate)
        .slice(0, 6);
    } catch (e) {
      console.warn("[agency/dashboard] globalPatterns aggregation failed:", e.message);
    }

    return res.json({
      clients:  enriched.sort((a, b) => (a.seoScore || 0) - (b.seoScore || 0)), // worst first
      summary,
      trends,
      globalPatterns,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

module.exports = router;
