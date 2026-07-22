/**
 * Approvals routes — extracted from routes/agents.js (Sprint 1, Story M6.18).
 *
 * Human-gate CRUD over the approval_queue collection, plus the single-item
 * WordPress push. Mounted by agents.js under the same base path (/api/agents),
 * so the public endpoints are unchanged:
 *   GET  /api/agents/:clientId/approvals                     — list queue
 *   POST /api/agents/:clientId/approvals/:itemId             — approve / reject
 *   POST /api/agents/:clientId/approvals/:itemId/revision    — request revision
 *   POST /api/agents/:clientId/approvals/:itemId/push-to-wp  — push one item via A13
 *
 * Routes moved verbatim, in original order. Middleware (verifyToken), ownership
 * (getClientDoc), FieldValue.serverTimestamp usage, the inline A13 pushSingleFix
 * require, Firestore collection (approval_queue), status codes, and response JSON
 * are identical to the originals. The A13 require stays inline (lazy, request-time)
 * with its relative depth adjusted for the module location.
 */
const express       = require("express");
const router        = express.Router();
const { db, FieldValue } = require("../../config/firebase");
const { verifyToken } = require("../../middleware/auth");
const { getClientDoc } = require("../shared/clientOwnership");

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

// POST: Push a single approval item to WordPress
router.post("/:clientId/approvals/:itemId/push-to-wp", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { pushSingleFix } = require("../../agents/A13_autopush");
    const result = await pushSingleFix(req.params.clientId, req.params.itemId);
    return res.json(result);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

module.exports = router;
