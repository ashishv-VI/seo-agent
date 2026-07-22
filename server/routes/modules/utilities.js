/**
 * Utilities / State routes — extracted from routes/agents.js (Sprint 1, Story M6.20).
 *
 * Small stateful helpers that don't run agents. Mounted by agents.js under the
 * same base path (/api/agents), so the public endpoints are unchanged:
 *   PUT  /api/agents/:clientId/automation-mode — set automation mode
 *   POST /api/agents/:clientId/recalculate     — recompute score + re-emit tasks
 *   GET  /api/agents/:clientId/wp-push-log      — read WordPress push audit trail
 *
 * Routes moved verbatim, in original order. Middleware (verifyToken), ownership
 * (getClientDoc), getState usage, score/task utilities (calculateScore,
 * saveScoreHistory, generateForecast, getTopTasks), the inline emitTasks/clearTasks
 * require, Firestore collections (clients, score_history via util, tasks via util,
 * wp_push_log), status codes, and response JSON are identical to the originals.
 * recalculate invokes NO runA* agent — it is a pure recompute-and-re-emit.
 */
const express       = require("express");
const router        = express.Router();
const { db }        = require("../../config/firebase");
const { verifyToken } = require("../../middleware/auth");
const { getClientDoc } = require("../shared/clientOwnership");
const { getState }  = require("../../shared-state/stateManager");
const { calculateScore, saveScoreHistory, generateForecast } = require("../../utils/scoreCalculator");
const { getTopTasks } = require("../../utils/taskQueue");

// ────────────────────────────────────────────────────
// AUTOMATION MODE
// ────────────────────────────────────────────────────

router.put("/:clientId/automation-mode", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { mode } = req.body; // "manual" | "semi" | "full"
    if (!["manual","semi","full"].includes(mode)) return res.status(400).json({ error: "Invalid mode" });
    await db.collection("clients").doc(req.params.clientId).update({ automationMode: mode });
    return res.json({ message: `Automation mode set to ${mode}`, mode });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── POST Recalculate score + re-emit tasks ─────────
// Called when pipeline already ran but data isn't showing (Firestore race condition)
router.post("/:clientId/recalculate", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const clientId = req.params.clientId;
    const { emitTasks: emit, clearTasks } = require("../../utils/taskQueue");

    const [audit, keywords, geo, onpage, technical] = await Promise.all([
      getState(clientId, "A2_audit"),
      getState(clientId, "A3_keywords"),
      getState(clientId, "A8_geo"),
      getState(clientId, "A6_onpage"),
      getState(clientId, "A7_technical"),
    ]);

    if (!audit) return res.status(400).json({ error: "Run the pipeline first — no audit data found" });

    // Recalculate 4D score
    const score    = calculateScore(audit, keywords, geo, onpage, technical);
    const scoreId  = await saveScoreHistory(clientId, { ...score });

    // Re-emit all tasks from audit issues
    await clearTasks(clientId);
    await Promise.allSettled([
      emit(clientId, audit.issues?.p1 || [], "p1", "A2"),
      emit(clientId, audit.issues?.p2 || [], "p2", "A2"),
      emit(clientId, audit.issues?.p3 || [], "p3", "A2"),
    ]);

    // Save score to client doc for list view
    await db.collection("clients").doc(clientId).update({ seoScore: score.overall }).catch(() => {});

    const tasks    = await getTopTasks(clientId, 5);
    const forecast = generateForecast(tasks, score.overall);

    return res.json({ score, forecast, scoreId, tasksEmitted: (audit.issues?.p1?.length||0)+(audit.issues?.p2?.length||0)+(audit.issues?.p3?.length||0), message: "Score recalculated and tasks regenerated" });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// GET: Get wp_push_log for client (all pushes made to WordPress)
router.get("/:clientId/wp-push-log", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const snap = await db.collection("wp_push_log")
      .where("clientId", "==", req.params.clientId)
      .get();
    const logs = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => new Date(b.pushedAt || 0) - new Date(a.pushedAt || 0))
      .slice(0, 50);
    return res.json({ logs, total: logs.length });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

module.exports = router;
