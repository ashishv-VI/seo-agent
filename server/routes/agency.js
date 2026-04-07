const express    = require("express");
const router     = express.Router();
const { db }     = require("../config/firebase");
const { verifyToken } = require("../middleware/auth");
const { getLatestScore, getScoreHistory } = require("../utils/scoreCalculator");

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

    // Fetch latest score + alert count per client in parallel
    const enriched = await Promise.all(clients.map(async client => {
      const [latestScore, alertSnap, pushSnap] = await Promise.all([
        getLatestScore(client.id).catch(() => null),
        db.collection("alerts").where("clientId","==",client.id).where("resolved","==",false).limit(20).get().catch(() => null),
        db.collection("wp_push_log").where("clientId","==",client.id).limit(100).get().catch(() => null),
      ]);

      const openAlerts = alertSnap ? alertSnap.size : 0;
      const fixesPushed = pushSnap ? pushSnap.size : 0;
      const score = latestScore?.overall || client.seoScore || null;

      return {
        id:           client.id,
        name:         client.name,
        website:      client.website,
        seoScore:     score,
        pipelineStatus: client.pipelineStatus,
        openAlerts,
        fixesPushed,
        lastPipeline: client.pipelineCompletedAt || null,
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
    };

    // Score history for each client (last 8 weeks for sparklines)
    const trends = await Promise.all(
      enriched.slice(0, 10).map(async c => {
        const hist = await getScoreHistory(c.id, 8).catch(() => []);
        return { clientId: c.id, name: c.name, history: hist };
      })
    );

    return res.json({
      clients:  enriched.sort((a, b) => (a.seoScore || 0) - (b.seoScore || 0)), // worst first
      summary,
      trends,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

module.exports = router;
