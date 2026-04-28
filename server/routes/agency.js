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

// ── Bulk Pipeline — queue full pipeline for all clients ───────────────────
// Enqueues a pipeline run for every client the owner has.
// Respects a 2-minute stagger so all clients don't hit the LLM simultaneously.
// Returns a batch job ID that the UI can poll.

router.post("/bulk-pipeline", verifyToken, async (req, res) => {
  try {
    const snap = await db.collection("clients")
      .where("ownerId", "==", req.uid)
      .get();

    if (snap.empty) return res.status(400).json({ error: "No clients found" });

    const clients = snap.docs.map(d => ({ id: d.id, name: d.data().name || d.data().businessName || d.id }));
    const batchId = `bulk_${req.uid}_${Date.now()}`;
    const now = new Date();

    const jobs = clients.map((client, idx) => ({
      batchId,
      clientId:  client.id,
      clientName: client.name,
      status:    "queued",
      queuedAt:  now.toISOString(),
      // Stagger: 2 minutes between each client to avoid hammering LLM
      scheduledFor: new Date(now.getTime() + idx * 2 * 60 * 1000).toISOString(),
    }));

    // Write all jobs to Firestore
    const batch = db.batch();
    for (const job of jobs) {
      const ref = db.collection("bulk_pipeline_jobs").doc();
      batch.set(ref, { id: ref.id, ...job });
    }
    await batch.commit();

    // Fire first client immediately (don't wait), rest via staggered queue
    // The daily-monitor cron will pick up pending bulk jobs automatically
    try {
      const { runFullPipeline } = require("../agents/A0_orchestrator");
      const { getUserKeys }     = require("../utils/getUserKeys");
      const keys = await getUserKeys(req.uid).catch(() => ({}));
      // Run first client immediately (non-blocking)
      if (clients[0]) {
        runFullPipeline(clients[0].id, keys).catch(e =>
          console.warn(`[bulk-pipeline] ${clients[0].id} error:`, e.message)
        );
        await db.collection("bulk_pipeline_jobs")
          .where("batchId", "==", batchId)
          .where("clientId", "==", clients[0].id)
          .get()
          .then(s => s.docs[0]?.ref.update({ status: "running", startedAt: new Date().toISOString() }))
          .catch(() => {});
      }
    } catch { /* non-blocking */ }

    return res.json({
      success:    true,
      batchId,
      totalClients: clients.length,
      jobs: jobs.map(j => ({ clientId: j.clientId, clientName: j.clientName, scheduledFor: j.scheduledFor })),
      message:    `Pipeline queued for ${clients.length} client(s). First starts immediately, others staggered every 2 minutes.`,
    });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

router.get("/bulk-pipeline/:batchId", verifyToken, async (req, res) => {
  try {
    const snap = await db.collection("bulk_pipeline_jobs")
      .where("batchId", "==", req.params.batchId)
      .get();
    if (snap.empty) return res.status(404).json({ error: "Batch not found" });
    const jobs = snap.docs.map(d => d.data());
    const summary = {
      total:     jobs.length,
      queued:    jobs.filter(j => j.status === "queued").length,
      running:   jobs.filter(j => j.status === "running").length,
      complete:  jobs.filter(j => j.status === "complete").length,
      failed:    jobs.filter(j => j.status === "failed").length,
    };
    return res.json({ batchId: req.params.batchId, summary, jobs });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

module.exports = router;
