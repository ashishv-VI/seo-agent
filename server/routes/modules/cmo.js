/**
 * CMO routes — extracted from routes/agents.js (Sprint 1, Story M6.11).
 *
 * Mounted by agents.js under the same base path (/api/agents), so the public
 * endpoints are unchanged:
 *   POST /api/agents/:clientId/cmo/run                    — run the CMO decision layer
 *   GET  /api/agents/:clientId/cmo/decision              — latest stored CMO decision
 *   GET  /api/agents/:clientId/cmo/queue                 — pending CMO queue items
 *   GET  /api/agents/:clientId/cmo-decisions             — all CMO decisions
 *   POST /api/agents/:clientId/cmo-decisions/:decisionId — approve/reject (may trigger agents)
 *
 * Routes moved verbatim, in original file order. Middleware (verifyToken),
 * ownership (getClientDoc), Firestore access, agent execution (runCMO /
 * runAgentById via inline require), queue processing, validation, status codes,
 * error messages, and response formats are identical to the originals.
 */
const express       = require("express");
const router        = express.Router();
const { db }        = require("../../config/firebase");
const { verifyToken } = require("../../middleware/auth");
const { getUserKeys } = require("../../utils/getUserKeys");
const { getState }    = require("../../shared-state/stateManager");
const { getClientDoc } = require("../shared/clientOwnership");

router.post("/:clientId/cmo/run", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { runCMO } = require("../../agents/CMO_agent");
    const keys = await getUserKeys(req.uid);
    const result = await runCMO(req.params.clientId, keys);
    return res.json(result);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

router.get("/:clientId/cmo/decision", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const data = await getState(req.params.clientId, "CMO_decision");
    return res.json(data || {});
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── GET CMO queue (scheduled next actions) ─────────
router.get("/:clientId/cmo/queue", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const snap = await db.collection("cmo_queue")
      .where("clientId", "==", req.params.clientId)
      .limit(10)
      .get();
    const queue = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(d => d.status === "pending")
      .slice(0, 5);
    return res.json({ queue });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// GET all CMO decisions for client
router.get("/:clientId/cmo-decisions", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const snap = await db.collection("cmo_queue")
      .where("clientId", "==", req.params.clientId)
      .limit(20)
      .get();
    const decisions = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    return res.json({ decisions });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// POST approve/reject a CMO decision (optionally trigger agents)
router.post("/:clientId/cmo-decisions/:decisionId", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { action } = req.body; // "approve" | "reject"
    if (!["approve", "reject"].includes(action)) return res.status(400).json({ error: "action must be approve or reject" });

    await db.collection("cmo_queue").doc(req.params.decisionId).update({
      status:     action === "approve" ? "approved" : "rejected",
      reviewedAt: new Date().toISOString(),
      reviewedBy: req.uid,
    });

    // If approved, trigger the listed agents in the background.
    // Uses the central agentRunner so every agent (including A2/A8/A10/A19/A23)
    // can be auto-triggered. The old inline RUNNABLE map was missing half of
    // them, so A24 lead-gen/traffic/local pivots silently dropped agents.
    if (action === "approve") {
      const decSnap  = await db.collection("cmo_queue").doc(req.params.decisionId).get();
      const decision = decSnap.data() || {};
      const agentsToRun = (decision.nextAgents || []).slice(0, 3);

      const { runAgentById } = require("../../agents/agentRunner");
      const keys = await getUserKeys(req.uid);

      for (const agentId of agentsToRun) {
        runAgentById(agentId, req.params.clientId, keys).then(result => {
          console.log(`[cmo-decision] ${agentId} auto-triggered → ${result.success ? "ok" : result.error}`);
        }).catch(e => {
          console.error(`[cmo-decision] ${agentId} failed:`, e.message);
        });
      }
    }

    return res.json({ message: `Decision ${action}d`, triggeredAgents: action === "approve" ? (await db.collection("cmo_queue").doc(req.params.decisionId).get()).data()?.nextAgents || [] : [] });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

module.exports = router;
