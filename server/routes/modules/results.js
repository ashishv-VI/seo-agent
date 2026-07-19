/**
 * Scanner results routes — extracted from routes/agents.js (Sprint 1, Story M6.4).
 *
 * Read-only GET endpoints that return already-persisted scanner output. Mounted
 * by agents.js under the same base path (/api/agents), so the public endpoints
 * are unchanged:
 *   GET /api/agents/:clientId/A25/results             — core-update scan results
 *   GET /api/agents/:clientId/aio/results             — AI Overview tracker results
 *   GET /api/agents/:clientId/ai-citations/results    — AI citation tracker results
 *   GET /api/agents/:clientId/serp-features/results   — SERP feature tracker results
 *   GET /api/agents/:clientId/local-citations/results — local citation results
 *
 * Routes moved verbatim, in original order. Middleware (verifyToken), ownership
 * check (getClientDoc), Firestore reads, the `{ notRun: true }` empty response,
 * status codes, and error messages are identical to the originals. POST scan
 * routes were NOT moved — they remain in agents.js.
 */
const express       = require("express");
const router        = express.Router();
const { db }        = require("../../config/firebase");
const { verifyToken } = require("../../middleware/auth");
const { getClientDoc } = require("../shared/clientOwnership");

router.get("/:clientId/A25/results", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { getState } = require("../../shared-state/stateManager");
    const result = await getState(req.params.clientId, "A25_coreUpdateScanner");
    if (!result) return res.json({ notRun: true });
    return res.json(result);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

router.get("/:clientId/aio/results", verifyToken, async (req, res) => {
  try {
    const { clientId } = req.params;
    await getClientDoc(clientId, req.uid);
    const doc = await db.collection("aio_tracker").doc(clientId).get();
    if (!doc.exists) return res.json({ notRun: true });
    return res.json(doc.data());
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

router.get("/:clientId/ai-citations/results", verifyToken, async (req, res) => {
  try {
    const { clientId } = req.params;
    await getClientDoc(clientId, req.uid);
    const doc = await db.collection("ai_citations").doc(clientId).get();
    if (!doc.exists) return res.json({ notRun: true });
    return res.json(doc.data());
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

router.get("/:clientId/serp-features/results", verifyToken, async (req, res) => {
  try {
    const { clientId } = req.params;
    await getClientDoc(clientId, req.uid);
    const doc = await db.collection("serp_features").doc(clientId).get();
    if (!doc.exists) return res.json({ notRun: true });
    return res.json(doc.data());
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

router.get("/:clientId/local-citations/results", verifyToken, async (req, res) => {
  try {
    const { clientId } = req.params;
    await getClientDoc(clientId, req.uid);
    const doc = await db.collection("local_citations").doc(clientId).get();
    if (!doc.exists) return res.json({ notRun: true });
    return res.json(doc.data());
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

module.exports = router;
