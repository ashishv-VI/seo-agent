/**
 * Learning / Memory routes — extracted from routes/agents.js (Sprint 1, M6.8).
 *
 * Mounted by agents.js under the same base path (/api/agents), so the public
 * endpoints are unchanged:
 *   POST /api/agents/:clientId/learning/record — log an applied fix for outcome tracking
 *   GET  /api/agents/:clientId/learning         — learning history for a client
 *   GET  /api/agents/:clientId/memory           — client AI memory (A16)
 *
 * Routes moved verbatim, in original order. Middleware (verifyToken), ownership
 * (getClientDoc), Firestore access (learning_log, FieldValue), the inline memory
 * util require, validation, status codes, error messages, and response formats
 * are identical to the originals.
 */
const express       = require("express");
const router        = express.Router();
const { db, FieldValue } = require("../../config/firebase");
const { verifyToken } = require("../../middleware/auth");
const { getClientDoc } = require("../shared/clientOwnership");

// POST record a fix that was applied (for tracking outcome later)
router.post("/:clientId/learning/record", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { taskId, issueType, fixDescription, keywords } = req.body;
    const ref = await db.collection("learning_log").add({
      clientId:       req.params.clientId,
      taskId:         taskId  || null,
      issueType:      issueType || "unknown",
      fixDescription: fixDescription || "",
      keywords:       keywords || [],
      fixedAt:        FieldValue.serverTimestamp(),
      fixedBy:        req.uid,
      rankingsBefore: null,
      rankingsAfter:  null,
      outcome:        null,
      status:         "pending_validation",
    });
    return res.json({ id: ref.id, message: "Fix logged for outcome tracking" });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// GET learning history for a client
router.get("/:clientId/learning", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const snap = await db.collection("learning_log")
      .where("clientId", "==", req.params.clientId).limit(30).get();
    const logs = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.fixedAt?._seconds || 0) - (a.fixedAt?._seconds || 0));
    return res.json({ logs });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// GET: Get client memory
router.get("/:clientId/memory", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { getMemory } = require("../../utils/memory");
    const memory = await getMemory(req.params.clientId);
    return res.json({ memory });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

module.exports = router;
