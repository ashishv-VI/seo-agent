/**
 * Remaining Agent Execution / State routes — extracted from routes/agents.js
 * (Sprint 1, Story M6.23).
 *
 * The per-agent run endpoints + state reads that were NOT part of the earlier
 * M6.6 execution extraction (A3–A8, A11 run), plus the generic AI1–AI10
 * scan/results handlers. Mounted by agents.js under the same base path
 * (/api/agents), so the public endpoints are unchanged:
 *   GET  /api/agents/:clientId/A8/data
 *   POST /api/agents/:clientId/run-a10
 *   GET  /api/agents/:clientId/A11/state
 *   POST /api/agents/:clientId/run-a12
 *   POST /api/agents/:clientId/run-a13
 *   POST /api/agents/:clientId/run-a14
 *   POST /api/agents/:clientId/run-a15
 *   POST /api/agents/:clientId/run-a16
 *   POST /api/agents/:clientId/A17/run
 *   GET  /api/agents/:clientId/A17/review
 *   POST /api/agents/:clientId/A19/run
 *   GET  /api/agents/:clientId/A19/state
 *   POST /api/agents/:clientId/A22/run
 *   GET  /api/agents/:clientId/A22/forecast
 *   POST /api/agents/:clientId/:AIX/scan   (AI1–AI10)
 *   GET  /api/agents/:clientId/:AIX/results (AI1–AI10)
 *
 * Routes moved verbatim, in original order. Middleware (verifyToken), ownership
 * (getClientDoc), getUserKeys/getState usage, agent-status Firestore writes, the
 * lazy per-agent requires, the AI_AGENTS config map, the inline stateMap, status
 * codes, error handling, and response JSON are identical to the originals. The
 * only adjustment is relative require depth (../agents/... → ../../agents/...),
 * including the string module paths inside AI_AGENTS.
 */
const express       = require("express");
const router        = express.Router();
const { db }        = require("../../config/firebase");
const { verifyToken } = require("../../middleware/auth");
const { getUserKeys } = require("../../utils/getUserKeys");
const { getState }  = require("../../shared-state/stateManager");
const { getClientDoc } = require("../shared/clientOwnership");

// ── GET A8: GEO data ──────────────────────────────
router.get("/:clientId/A8/data", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const data = await getState(req.params.clientId, "A8_geo");
    return res.json(data || {});
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── A10 Ranking Tracker ────────────────────────────
router.post("/:clientId/run-a10", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { runA10 } = require("../../agents/A10_rankingTracker");
    const { googleToken } = req.body;
    const keys = await getUserKeys(req.uid);
    await db.collection("clients").doc(req.params.clientId).update({ "agents.A10": "running" });
    const result = await runA10(req.params.clientId, keys, googleToken || null);
    await db.collection("clients").doc(req.params.clientId).update({ "agents.A10": result.success ? "complete" : "failed" });
    return res.json(result);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// GET A11 link-building state
router.get("/:clientId/A11/state", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const data = await getState(req.params.clientId, "A11_linkbuilding");
    return res.json(data || {});
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── A12 Auto-Exec ──────────────────────────────────
router.post("/:clientId/run-a12", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { runA12 } = require("../../agents/A12_autoExec");
    const keys = await getUserKeys(req.uid);
    await db.collection("clients").doc(req.params.clientId).update({ "agents.A12": "running" });
    const result = await runA12(req.params.clientId, keys);
    await db.collection("clients").doc(req.params.clientId).update({ "agents.A12": result.success ? "complete" : "failed" });
    return res.json(result);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// POST: Push all approved fixes to WordPress
router.post("/:clientId/run-a13", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { runA13 } = require("../../agents/A13_autopush");
    const keys = await getUserKeys(req.uid);
    await db.collection("clients").doc(req.params.clientId).update({ "agents.A13": "running" });
    const result = await runA13(req.params.clientId, keys);
    await db.collection("clients").doc(req.params.clientId).update({ "agents.A13": result.success ? "complete" : "failed" });
    return res.json(result);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// POST: Run content autopilot — generate articles for keyword gaps
router.post("/:clientId/run-a14", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { runA14 } = require("../../agents/A14_contentAutopilot");
    const keys       = await getUserKeys(req.uid);
    const maxArticles = parseInt(req.body.maxArticles || "3", 10);
    await db.collection("clients").doc(req.params.clientId).update({ "agents.A14": "running" });
    const result = await runA14(req.params.clientId, keys, maxArticles);
    await db.collection("clients").doc(req.params.clientId).update({ "agents.A14": result.success ? "complete" : "failed" });
    return res.json(result);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// POST: Run competitor monitoring
router.post("/:clientId/run-a15", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { runA15 } = require("../../agents/A15_competitorMonitor");
    const keys = await getUserKeys(req.uid);
    await db.collection("clients").doc(req.params.clientId).update({ "agents.A15": "running" });
    const result = await runA15(req.params.clientId, keys);
    await db.collection("clients").doc(req.params.clientId).update({ "agents.A15": result.success ? "complete" : "failed" });
    return res.json(result);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// POST: Run memory update
router.post("/:clientId/run-a16", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { runA16 } = require("../../agents/A16_memory");
    const keys = await getUserKeys(req.uid);
    const result = await runA16(req.params.clientId, keys);
    return res.json(result);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────
// SPRINT 4 — A17 Reviewer Agent
// ────────────────────────────────────────────────────
router.post("/:clientId/A17/run", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { runA17 } = require("../../agents/A17_reviewer");
    const result = await runA17(req.params.clientId);
    return res.json(result);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

router.get("/:clientId/A17/review", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const data = await getState(req.params.clientId, "A17_review");
    return res.json(data || {});
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────
// SPRINT 4 — A19 Conversion Agent
// ────────────────────────────────────────────────────
router.post("/:clientId/A19/run", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { runA19 } = require("../../agents/A19_conversion");
    const keys = await getUserKeys(req.uid);
    const result = await runA19(req.params.clientId, keys);
    return res.json(result);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

router.get("/:clientId/A19/state", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const data = await getState(req.params.clientId, "A19_conversion");
    return res.json(data || {});
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────
// SPRINT 6 — A22 PREDICTIVE INTELLIGENCE
// ────────────────────────────────────────────────────

router.post("/:clientId/A22/run", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { runA22 } = require("../../agents/A22_predictive");
    const keys = await getUserKeys(req.uid);
    await db.collection("clients").doc(req.params.clientId).update({ "agents.A22": "running" });
    const result = await runA22(req.params.clientId, keys);
    await db.collection("clients").doc(req.params.clientId).update({ "agents.A22": result.success ? "complete" : "failed" });
    return res.json(result);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

router.get("/:clientId/A22/forecast", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const data = await getState(req.params.clientId, "A22_predictive");
    return res.json(data || {});
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── Intelligence Agents (AI1–AI10) — on-demand scan + results ────────────────
const AI_AGENTS = {
  AI1:  { module: "../../agents/AI1_intentDrift",        fn: "runAI1"  },
  AI2:  { module: "../../agents/AI2_topicalAuthority",   fn: "runAI2"  },
  AI3:  { module: "../../agents/AI3_serpVolatility",     fn: "runAI3"  },
  AI4:  { module: "../../agents/AI4_leadQualityScore",   fn: "runAI4"  },
  AI5:  { module: "../../agents/AI5_seasonalOpportunity",fn: "runAI5"  },
  AI6:  { module: "../../agents/AI6_negativeSeoShield",  fn: "runAI6"  },
  AI7:  { module: "../../agents/AI7_contentDecay",       fn: "runAI7"  },
  AI8:  { module: "../../agents/AI8_voiceSearch",        fn: "runAI8"  },
  AI9:  { module: "../../agents/AI9_zeroClick",          fn: "runAI9"  },
  AI10: { module: "../../agents/AI10_agencyBenchmark",   fn: "runAI10" },
};

// POST /:clientId/AIX/scan + GET /:clientId/AIX/results — generic handler
Object.entries(AI_AGENTS).forEach(([id, cfg]) => {
  router.post(`/:clientId/${id}/scan`, verifyToken, async (req, res) => {
    try {
      await getClientDoc(req.params.clientId, req.uid);
      const agentFn = require(cfg.module)[cfg.fn];
      const keys    = await getUserKeys(req.uid);
      const result  = await agentFn(req.params.clientId, keys);
      return res.json(result);
    } catch (e) {
      return res.status(e.code || 500).json({ error: e.message });
    }
  });

  router.get(`/:clientId/${id}/results`, verifyToken, async (req, res) => {
    try {
      await getClientDoc(req.params.clientId, req.uid);
      const stateKey = `${id}_${cfg.fn.replace("run", "")}`;
      // Map agent ID to state key
      const stateMap = {
        AI1: "AI1_intentDrift", AI2: "AI2_topicalAuthority", AI3: "AI3_serpVolatility",
        AI4: "AI4_leadQualityScore", AI5: "AI5_seasonalOpportunity", AI6: "AI6_negativeSeoShield",
        AI7: "AI7_contentDecay", AI8: "AI8_voiceSearch", AI9: "AI9_zeroClick", AI10: "AI10_agencyBenchmark",
      };
      const result = await getState(req.params.clientId, stateMap[id] || stateKey);
      if (!result) return res.json({ notRun: true });
      return res.json(result);
    } catch (e) {
      return res.status(e.code || 500).json({ error: e.message });
    }
  });
});

module.exports = router;
