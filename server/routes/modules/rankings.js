/**
 * Rankings routes — extracted from routes/agents.js (Sprint 1, Story M6.9).
 *
 * Read-only ranking retrieval endpoints. Mounted by agents.js under the same
 * base path (/api/agents), so the public endpoints are unchanged:
 *   GET /api/agents/:clientId/rank-history     — last 12 ranking snapshots
 *   GET /api/agents/:clientId/A10/rankings     — latest A10 rankings state
 *   GET /api/agents/:clientId/rankings         — most-recent ranking snapshot
 *   GET /api/agents/:clientId/rank-comparison  — latest vs previous snapshot diff
 *
 * Routes moved verbatim, in original order. Middleware (verifyToken), ownership
 * (getClientDoc), Firestore reads (rank_history), state reads, the client-side
 * sort, validation, status codes, error messages, and response formats are
 * identical to the originals. GET /:clientId/A11/state is intentionally NOT here
 * (it exposes A11 link-building state, not ranking data).
 */
const express       = require("express");
const router        = express.Router();
const { db }        = require("../../config/firebase");
const { verifyToken } = require("../../middleware/auth");
const { getState }    = require("../../shared-state/stateManager");
const { getClientDoc } = require("../shared/clientOwnership");

router.get("/:clientId/rank-history", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    // No composite index — single where, sort client-side
    const snap = await db.collection("rank_history")
      .where("clientId", "==", req.params.clientId)
      .limit(30)
      .get();
    const history = snap.docs.map(d => d.data()).sort((a,b)=>(b.date||"").localeCompare(a.date||"")).slice(0,12);
    return res.json({ history });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

router.get("/:clientId/A10/rankings", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const data = await getState(req.params.clientId, "A10_rankings");
    return res.json(data || {});
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

router.get("/:clientId/rankings", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    // No composite index — single where, sort client-side
    const snap = await db.collection("rank_history")
      .where("clientId", "==", req.params.clientId)
      .limit(30)
      .get();
    if (snap.empty) return res.json({ rankings: [], source: null });
    const sorted = snap.docs.map(d => d.data()).sort((a, b) => (b.date||"").localeCompare(a.date||""));
    return res.json(sorted[0]);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

router.get("/:clientId/rank-comparison", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const clientId = req.params.clientId;
    const snap = await db.collection("rank_history")
      .where("clientId", "==", clientId).limit(30).get();
    if (snap.empty) return res.json({ comparison: null, message: "No ranking data yet — run pipeline" });

    const sorted = snap.docs.map(d => d.data()).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    if (sorted.length < 2) return res.json({ comparison: null, message: "Need at least 2 ranking snapshots (run pipeline twice)" });

    const latest   = sorted[0];
    const previous = sorted[1];

    const prevMap = {};
    (previous.keywords || []).forEach(k => { prevMap[k.keyword] = k.position; });

    const comparison = (latest.keywords || []).map(k => {
      const prev   = prevMap[k.keyword] || null;
      const curr   = k.position;
      const change = (prev && curr) ? prev - curr : null; // positive = moved up (improved)
      return {
        keyword:  k.keyword,
        current:  curr,
        previous: prev,
        change,
        trend:    change === null ? "new" : change > 0 ? "up" : change < 0 ? "down" : "stable",
        category: k.category,
      };
    }).sort((a, b) => (b.change || 0) - (a.change || 0));

    const gained = comparison.filter(k => k.trend === "up").length;
    const lost   = comparison.filter(k => k.trend === "down").length;

    return res.json({
      comparison,
      latestDate:   latest.date,
      previousDate: previous.date,
      summary: { gained, lost, stable: comparison.length - gained - lost, total: comparison.length },
      healthScoreChange: (latest.healthScore || 0) - (previous.healthScore || 0),
    });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

module.exports = router;
