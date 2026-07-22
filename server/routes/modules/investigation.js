/**
 * Investigation routes — extracted from routes/agents.js (Sprint 1, Story M6.14).
 *
 * Mounted by agents.js under the same base path (/api/agents), so the public
 * endpoints are unchanged:
 *   POST /api/agents/:clientId/A23/investigate    — run the A23 investigator
 *   GET  /api/agents/:clientId/A23/investigations — list investigation fixes
 *
 * Routes moved verbatim, in original order. Middleware (verifyToken), ownership
 * (getClientDoc), the inline runA23 require, Firestore reads, validation, status
 * codes, error messages, and response formats are identical to the originals.
 * Execution (investigate) writes only through A23's own logic; history reads only
 * approval_queue; the two communicate solely through persisted state.
 */
const express       = require("express");
const router        = express.Router();
const { db }        = require("../../config/firebase");
const { verifyToken } = require("../../middleware/auth");
const { getUserKeys } = require("../../utils/getUserKeys");
const { getClientDoc } = require("../shared/clientOwnership");

router.post("/:clientId/A23/investigate", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { runA23 } = require("../../agents/A23_investigator");
    const keys = await getUserKeys(req.uid);
    const result = await runA23(req.params.clientId, keys);
    return res.json(result);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// GET /:clientId/A23/investigations — latest investigation results
router.get("/:clientId/A23/investigations", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    // Return from approval_queue type=investigation_fix
    const snap = await db.collection("approval_queue")
      .where("clientId", "==", req.params.clientId)
      .where("type", "==", "investigation_fix")
      .limit(20)
      .get();
    const investigations = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    return res.json({ investigations });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

module.exports = router;
