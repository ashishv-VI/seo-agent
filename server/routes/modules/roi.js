/**
 * ROI / Revenue routes — extracted from routes/agents.js (Sprint 1, Story M6.7).
 *
 * Mounted by agents.js under the same base path (/api/agents), so the public
 * endpoints are unchanged:
 *   GET /api/agents/:clientId/revenue       — revenue estimate from keywords + brief
 *   GET /api/agents/:clientId/roi           — current ROI snapshot (+ saves history)
 *   GET /api/agents/:clientId/roi/history   — ROI history snapshots
 *   PUT /api/agents/:clientId/roi/settings  — update ROI revenue settings
 *
 * Routes moved verbatim. Middleware (verifyToken), ownership (getClientDoc),
 * roiTracker calls, state reads, validation, status codes, error messages, and
 * response formats are identical to the originals. (`revenue` is defined first
 * to match its original earlier position in agents.js.)
 */
const express       = require("express");
const router        = express.Router();
const { verifyToken } = require("../../middleware/auth");
const { getState }    = require("../../shared-state/stateManager");
const { calculateRevenue } = require("../../utils/scoreCalculator");
const { getClientDoc } = require("../shared/clientOwnership");

router.get("/:clientId/revenue", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const clientId = req.params.clientId;
    const [keywords, brief] = await Promise.all([
      getState(clientId, "A3_keywords"),
      getState(clientId, "A1_brief"),
    ]);
    const revenue = calculateRevenue(keywords, brief);
    if (!revenue) return res.json({ revenue: null, message: "No keyword volume data — run pipeline with SE Ranking key" });
    return res.json({ revenue });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

router.get("/:clientId/roi", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { calculateROI, saveROISnapshot } = require("../../utils/roiTracker");
    const roi = await calculateROI(req.params.clientId);
    // Save snapshot for history (fire-and-forget)
    saveROISnapshot(req.params.clientId, roi).catch(() => {});
    return res.json({ roi });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// GET: Get ROI history snapshots
router.get("/:clientId/roi/history", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { getROIHistory } = require("../../utils/roiTracker");
    const history = await getROIHistory(req.params.clientId);
    return res.json({ history });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// PUT: Update ROI revenue settings (conversion rate, avg order value)
router.put("/:clientId/roi/settings", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { updateROISettings } = require("../../utils/roiTracker");
    await updateROISettings(req.params.clientId, req.body);
    return res.json({ message: "ROI settings updated" });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

module.exports = router;
