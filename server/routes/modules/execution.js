/**
 * Agent execution routes — extracted from routes/agents.js (Sprint 1, Story M6.6).
 *
 * The per-agent "run" endpoints. Mounted by agents.js under the same base path
 * (/api/agents), so the public endpoints are unchanged:
 *   POST /api/agents/:clientId/A3/run   — run A3 keyword research
 *   POST /api/agents/:clientId/A4/run   — run A4 competitor intelligence
 *   POST /api/agents/:clientId/A5/run   — run A5 content optimisation
 *   POST /api/agents/:clientId/A6/run   — run A6 on-page & tags
 *   POST /api/agents/:clientId/A7/run   — run A7 technical SEO & CWV
 *   POST /api/agents/:clientId/A8/run   — run A8 GEO & off-page (passes googleToken)
 *   POST /api/agents/:clientId/A11/run  — run A11 link builder
 *
 * Routes moved verbatim, in original order. Middleware (verifyToken), ownership
 * (getClientDoc), the generic runner (runAgent), agent invocations, validation,
 * status codes, error messages, and response formats are identical to the
 * originals.
 */
const express       = require("express");
const router        = express.Router();
const { verifyToken } = require("../../middleware/auth");
const { getUserKeys } = require("../../utils/getUserKeys");
const { runA3 }       = require("../../agents/A3_keywords");
const { runA4 }       = require("../../agents/A4_competitor");
const { runA5 }       = require("../../agents/A5_content");
const { runA6 }       = require("../../agents/A6_onpage");
const { runA7 }       = require("../../agents/A7_technical");
const { runA8 }       = require("../../agents/A8_geo");
const { getClientDoc } = require("../shared/clientOwnership");
const { runAgent }     = require("../shared/agentRunner");

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
    const { googleToken } = req.body;
    return await runAgent(req.params.clientId, "A8", (id, k) => runA8(id, k, googleToken), keys, res);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── A11 Link Builder ───────────────────────────────
router.post("/:clientId/A11/run", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const keys = await getUserKeys(req.uid);
    const { runA11 } = require("../../agents/A11_linkBuilder");
    return runAgent(req.params.clientId, "A11", runA11, keys, res);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

module.exports = router;
