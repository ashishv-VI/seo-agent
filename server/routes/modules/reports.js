/**
 * Report routes — extracted from routes/agents.js (Sprint 1, Story M6.2).
 *
 * Mounted by agents.js under the same base path (/api/agents), so the public
 * endpoints are unchanged:
 *   POST /api/agents/:clientId/A9/report            — generate the A9 strategy report
 *   GET  /api/agents/:clientId/A20/impact-report    — retrieve the A20 6-month impact report
 *
 * Routes moved verbatim. Middleware (verifyToken), ownership check (getClientDoc),
 * Firestore access, agent calls, validation, status codes, error messages, and
 * response formats are identical to the originals.
 */
const express       = require("express");
const router        = express.Router();
const { db }        = require("../../config/firebase");
const { verifyToken } = require("../../middleware/auth");
const { getUserKeys } = require("../../utils/getUserKeys");
const { canRunAgent } = require("../../agents/A0_orchestrator");
const { generateReport } = require("../../agents/A9_monitoring");
const { getClientDoc } = require("../shared/clientOwnership");

// ── Run A9: Generate Report ────────────────────────
router.post("/:clientId/A9/report", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const keys      = await getUserKeys(req.uid);
    const gscToken  = req.body.gscToken || null;
    const { canRun, reason } = await canRunAgent(req.params.clientId, "A9");
    if (!canRun) return res.status(400).json({ error: reason });

    await db.collection("clients").doc(req.params.clientId).update({ "agents.A9": "running" });
    const result = await generateReport(req.params.clientId, keys, gscToken);
    await db.collection("clients").doc(req.params.clientId).update({ "agents.A9": result.success ? "complete" : "failed" });
    return res.json(result);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────
// SPRINT 4 — A20 Impact Report
// ────────────────────────────────────────────────────
router.get("/:clientId/A20/impact-report", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { buildImpactReport } = require("../../agents/A20_impactReport");
    const report = await buildImpactReport(req.params.clientId);
    return res.json({ report });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

module.exports = router;
