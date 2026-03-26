const express       = require("express");
const router        = express.Router();
const { db, FieldValue } = require("../config/firebase");
const { verifyToken }        = require("../middleware/auth");
const { getUserKeys }        = require("../utils/getUserKeys");
const { canRunAgent, getPipelineStatus, handleFailure, runFullPipeline } = require("../agents/A0_orchestrator");
const { runA3 }              = require("../agents/A3_keywords");
const { runA4 }              = require("../agents/A4_competitor");
const { runA5 }              = require("../agents/A5_content");
const { runA6 }              = require("../agents/A6_onpage");
const { runA7 }              = require("../agents/A7_technical");
const { runA8 }              = require("../agents/A8_geo");
const { generateReport, checkAlerts } = require("../agents/A9_monitoring");

// ── Helper: check client ownership ────────────────
async function getClientDoc(clientId, uid) {
  const doc = await db.collection("clients").doc(clientId).get();
  if (!doc.exists)                   throw { code: 404, message: "Client not found" };
  if (doc.data().ownerId !== uid)    throw { code: 403, message: "Access denied" };
  return doc;
}

// ── Generic agent runner ───────────────────────────
async function runAgent(clientId, agentId, runFn, keys, res) {
  const { canRun, reason } = await canRunAgent(clientId, agentId);
  if (!canRun) return res.status(400).json({ error: reason });

  await db.collection("clients").doc(clientId).update({ [`agents.${agentId}`]: "running" });

  try {
    const result = await runFn(clientId, keys);
    if (!result.success) {
      const failure = await handleFailure(clientId, agentId, result.error);
      return res.status(400).json({ error: result.error, ...failure });
    }
    await db.collection("clients").doc(clientId).update({ [`agents.${agentId}`]: "complete" });
    return res.json(result);
  } catch (err) {
    await handleFailure(clientId, agentId, err.message);
    return res.status(500).json({ error: err.message });
  }
}

// ── POST Run Full Pipeline (fire-and-forget) ───────
router.post("/:clientId/run-pipeline", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const keys = await getUserKeys(req.uid);

    // Reset all downstream agents to pending so frontend shows fresh state
    await db.collection("clients").doc(req.params.clientId).update({
      "agents.A2": "pending",
      "agents.A3": "pending",
      "agents.A4": "pending",
      "agents.A5": "pending",
      "agents.A6": "pending",
      "agents.A7": "pending",
      "agents.A8": "pending",
      "agents.A9": "pending",
      pipelineStatus:    "running",
      pipelineStartedAt: new Date().toISOString(),
      pipelineError:     null,
    });

    // Fire-and-forget: respond immediately so HTTP doesn't timeout on Render free tier
    // Pipeline continues running in the background and updates Firestore as each agent completes
    runFullPipeline(req.params.clientId, keys).catch(err => {
      console.error(`[run-pipeline] Background error for ${req.params.clientId}:`, err.message);
    });

    return res.json({
      started:   true,
      clientId:  req.params.clientId,
      message:   "Full SEO analysis pipeline started — poll /pipeline for live status",
    });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── GET Pipeline Status (A0) ───────────────────────
router.get("/:clientId/pipeline", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const status = await getPipelineStatus(req.params.clientId);
    return res.json(status);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── Run A3: Keyword Research ───────────────────────
router.post("/:clientId/A3/run", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const keys = await getUserKeys(req.uid);
    return await runAgent(req.params.clientId, "A3", (id, k) => runA3(id, k), keys, res);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── Run A4: Competitor Intelligence ───────────────
router.post("/:clientId/A4/run", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const keys = await getUserKeys(req.uid);
    return await runAgent(req.params.clientId, "A4", (id, k) => runA4(id, k), keys, res);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── Run A5: Content Optimisation ──────────────────
router.post("/:clientId/A5/run", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const keys = await getUserKeys(req.uid);
    return await runAgent(req.params.clientId, "A5", (id, k) => runA5(id, k), keys, res);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── Run A6: On-Page & Tags ─────────────────────────
router.post("/:clientId/A6/run", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const keys = await getUserKeys(req.uid);
    return await runAgent(req.params.clientId, "A6", (id, k) => runA6(id, k), keys, res);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── Run A7: Technical SEO & CWV ───────────────────
router.post("/:clientId/A7/run", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const keys = await getUserKeys(req.uid);
    return await runAgent(req.params.clientId, "A7", (id, k) => runA7(id, k), keys, res);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── Run A8: GEO & Off-Page ────────────────────────
router.post("/:clientId/A8/run", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const keys = await getUserKeys(req.uid);
    return await runAgent(req.params.clientId, "A8", (id, k) => runA8(id, k), keys, res);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

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

// ── Run A9: Check Alerts ───────────────────────────
router.post("/:clientId/A9/alerts", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const keys   = await getUserKeys(req.uid);
    const result = await checkAlerts(req.params.clientId, keys);
    return res.json(result);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── GET Alerts for client ──────────────────────────
router.get("/:clientId/alerts", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const snap = await db.collection("alerts")
      .where("clientId", "==", req.params.clientId)
      .get();
    const alerts = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?._seconds || 0) - (a.createdAt?._seconds || 0))
      .slice(0, 50);
    return res.json({ alerts });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── GET Approval Queue for client ─────────────────
router.get("/:clientId/approvals", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const snap = await db.collection("approval_queue")
      .where("clientId", "==", req.params.clientId)
      .get();
    const items = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?._seconds || 0) - (a.createdAt?._seconds || 0));
    return res.json({ items });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── Approve / Reject item ─────────────────────────
router.post("/:clientId/approvals/:itemId", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { action, notes } = req.body; // action: "approve" | "reject"
    await db.collection("approval_queue").doc(req.params.itemId).update({
      status:     action === "approve" ? "approved" : "rejected",
      reviewedAt: FieldValue.serverTimestamp(),
      reviewNotes: notes || "",
    });
    return res.json({ message: `Item ${action}d successfully` });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── Resolve alert ─────────────────────────────────
router.post("/:clientId/alerts/:alertId/resolve", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    await db.collection("alerts").doc(req.params.alertId).update({
      resolved:   true,
      resolvedAt: FieldValue.serverTimestamp(),
    });
    return res.json({ message: "Alert resolved" });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── Request revision on approval item ─────────────
router.post("/:clientId/approvals/:itemId/revision", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { feedback } = req.body;
    await db.collection("approval_queue").doc(req.params.itemId).update({
      status:      "revision_requested",
      feedback:    feedback || "",
      revisedAt:   FieldValue.serverTimestamp(),
    });
    return res.json({ message: "Revision requested" });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── Get rank history for client ────────────────────
router.get("/:clientId/rank-history", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const snap = await db.collection("rank_history")
      .where("clientId", "==", req.params.clientId)
      .orderBy("date", "desc")
      .limit(12)
      .get();
    const history = snap.docs.map(d => d.data());
    return res.json({ history });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

module.exports = router;
