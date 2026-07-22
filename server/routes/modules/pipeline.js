/**
 * Pipeline routes — extracted from routes/agents.js (Sprint 1, Story M6.24).
 *
 * The pipeline lifecycle endpoints (final routing extraction). Mounted by
 * agents.js under the same base path (/api/agents), so the public endpoints are
 * unchanged:
 *   POST /api/agents/:clientId/run-pipeline   — fire-and-forget full pipeline
 *   POST /api/agents/:clientId/reset-pipeline  — hard reset agent statuses + state
 *   GET  /api/agents/:clientId/pipeline        — pipeline status (A0)
 *
 * Routes moved verbatim, in original order. Middleware (verifyToken), ownership
 * (getClientDoc), getUserKeys usage, the LLM-key gate (400), the double-trigger
 * guard (409), agent-status resets, the fire-and-forget runFullPipeline(...).catch
 * background execution + console.error logging, the inline deleteState require,
 * getPipelineStatus, status codes, and response JSON are identical to the
 * originals. The only adjustment is the inline require depth for the reset
 * handler's deleteState (../shared-state/... → ../../shared-state/...).
 */
const express       = require("express");
const router        = express.Router();
const { db }        = require("../../config/firebase");
const { verifyToken } = require("../../middleware/auth");
const { getUserKeys } = require("../../utils/getUserKeys");
const { getPipelineStatus, runFullPipeline } = require("../../agents/A0_orchestrator");
const { getClientDoc } = require("../shared/clientOwnership");

// ── POST Run Full Pipeline (fire-and-forget) ───────
router.post("/:clientId/run-pipeline", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const keys = await getUserKeys(req.uid);
    const { googleToken } = req.body;

    // ── Gate: require at least one LLM key before starting ────────────────
    // A3, A4, A5, A6, A8 all call callLLM() — without a key they silently
    // fail but the pipeline still shows "complete" with empty data.
    // Server-level OPENROUTER_API_KEY counts as a valid fallback.
    const hasLLM = keys.groq || keys.gemini || keys.openrouter || process.env.OPENROUTER_API_KEY;
    if (!hasLLM) {
      return res.status(400).json({
        error: "No LLM key configured. Add a Groq, Gemini, or OpenRouter API key in Settings before running the pipeline.",
        missingKey: "llm",
      });
    }

    // ── Guard: prevent double-trigger ─────────────────────────────────────
    // If pipeline is already running (started < 20 min ago), reject the request
    const clientDoc = await db.collection("clients").doc(req.params.clientId).get();
    const clientData = clientDoc.data() || {};
    if (clientData.pipelineStatus === "running" && clientData.pipelineStartedAt) {
      const runningFor = Date.now() - new Date(clientData.pipelineStartedAt).getTime();
      if (runningFor < 20 * 60 * 1000) { // 20 minutes
        return res.status(409).json({
          error: `Pipeline already running (started ${Math.round(runningFor / 60000)} min ago). Wait for it to complete or use Hard Reset first.`,
          alreadyRunning: true,
        });
      }
    }

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
    runFullPipeline(req.params.clientId, keys, googleToken || null).catch(err => {
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

// ── POST Hard Reset Pipeline ───────────────────────
// Clears all agent statuses + shared state so the pipeline can start fresh.
// Only available to the client owner. Safe to call at any time.
router.post("/:clientId/reset-pipeline", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const clientId = req.params.clientId;

    // Reset all agent statuses to pending in the client doc
    await db.collection("clients").doc(clientId).update({
      "agents.A1": "pending",
      "agents.A2": "pending",
      "agents.A3": "pending",
      "agents.A4": "pending",
      "agents.A5": "pending",
      "agents.A6": "pending",
      "agents.A7": "pending",
      "agents.A8": "pending",
      "agents.A9": "pending",
      "agents.A10": "pending",
      "agents.A11": "pending",
      "agents.A12": "pending",
      pipelineStatus:      "idle",
      pipelineError:       null,
      pipelineStartedAt:   null,
      pipelineCompletedAt: null,
      pipelineHeartbeat:   null,
    });

    // Delete agent output states — keep A1_brief (onboarding data needed by A23/alerts)
    const stateKeys = ["A2_audit", "A3_keywords", "A4_competitor",
                       "A5_content", "A6_onpage", "A7_technical", "A8_geo",
                       "A9_report", "A10_rankings"];
    const { deleteState } = require("../../shared-state/stateManager");
    await Promise.allSettled(stateKeys.map(k => deleteState(clientId, k)));

    return res.json({ success: true, message: "Pipeline reset — all agents cleared to pending" });
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

module.exports = router;
