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
const { getTasks, getTopTasks, updateTask, clearTasks } = require("../utils/taskQueue");
const { calculateScore, saveScoreHistory, getLatestScore, getScoreHistory, generateForecast, calculateRevenue } = require("../utils/scoreCalculator");
const { getState, saveState } = require("../shared-state/stateManager");
const { translateAlert, SEVERITY_LABELS } = require("../utils/alertTranslator");

// ── Notification routes (extracted Sprint 1, M6.1) ──
// Mounted at the same base ("/") so paths remain /api/agents/notifications*.
// Uses its own verifyToken + db; no dependency on helpers in this file.
const notificationsRouter = require("./modules/notifications");
router.use("/", notificationsRouter);

// ── Report routes (extracted Sprint 1, M6.2) ──
// Mounted at the same base ("/") so paths remain /api/agents/:clientId/A9/report
// and /api/agents/:clientId/A20/impact-report. Reuses the shared getClientDoc.
const reportsRouter = require("./modules/reports");
router.use("/", reportsRouter);

// ── Analysis routes (extracted Sprint 1, M6.3) ──
// Read-only audit/SEO analysis retrieval. Mounted at the same base ("/") so
// paths remain /api/agents/:clientId/{intent-analysis,A2/patterns,A2/crawl-status,A2/page-scores}.
// Reuses the shared getClientDoc.
const analysisRouter = require("./modules/analysis");
router.use("/", analysisRouter);

// ── Scanner results routes (extracted Sprint 1, M6.4) ──
// Read-only GET retrieval of persisted scanner output. Mounted at the same base
// ("/") so paths remain /api/agents/:clientId/{A25,aio,ai-citations,serp-features,local-citations}/results.
// Reuses the shared getClientDoc. POST scan routes stay in this file.
const resultsRouter = require("./modules/results");
router.use("/", resultsRouter);

// ── Agent execution routes (extracted Sprint 1, M6.6) ──
// Per-agent "run" endpoints (A3–A8, A11). Mounted at the same base ("/") so
// paths remain /api/agents/:clientId/{A3..A8,A11}/run. Reuses the shared
// getClientDoc + runAgent. Pipeline/scan/other execution endpoints stay here.
const executionRouter = require("./modules/execution");
router.use("/", executionRouter);

// ── ROI / Revenue routes (extracted Sprint 1, M6.7) ──
// Mounted at the same base ("/") so paths remain /api/agents/:clientId/{revenue,roi,roi/history,roi/settings}.
// Reuses the shared getClientDoc.
const roiRouter = require("./modules/roi");
router.use("/", roiRouter);

// ── Learning / Memory routes (extracted Sprint 1, M6.8) ──
// Mounted at the same base ("/") so paths remain /api/agents/:clientId/{learning/record,learning,memory}.
// Reuses the shared getClientDoc.
const learningRouter = require("./modules/learning");
router.use("/", learningRouter);

// ── Rankings routes (extracted Sprint 1, M6.9) ──
// Read-only ranking retrieval. Mounted at the same base ("/") so paths remain
// /api/agents/:clientId/{rank-history,A10/rankings,rankings,rank-comparison}.
// Reuses the shared getClientDoc. A11/state stays in this file (link-building, not rankings).
const rankingsRouter = require("./modules/rankings");
router.use("/", rankingsRouter);

// ── Monitoring / Alerts routes (extracted Sprint 1, M6.10) ──
// Mounted at the same base ("/") so paths remain /api/agents/:clientId/{A9/alerts,alerts,alerts/:id/resolve,cwv-history,fix-verification}.
// Reuses the shared getClientDoc.
const monitoringRouter = require("./modules/monitoring");
router.use("/", monitoringRouter);

// ── CMO routes (extracted Sprint 1, M6.11) ──
// Mounted at the same base ("/") so paths remain /api/agents/:clientId/{cmo/run,cmo/decision,cmo/queue,cmo-decisions,cmo-decisions/:id}.
// Reuses the shared getClientDoc.
const cmoRouter = require("./modules/cmo");
router.use("/", cmoRouter);

// ── Tasks routes (extracted Sprint 1, M6.12) ──
// Mounted at the same base ("/") so paths remain /api/agents/:clientId/{generate-fix,tasks,tasks/today,tasks/:taskId,tasks/:taskId/execute,tasks/bulk}.
// Reuses the shared getClientDoc.
const tasksRouter = require("./modules/tasks");
router.use("/", tasksRouter);

// ── Content routes (extracted Sprint 1, M6.13) ──
// Mounted at the same base ("/") so paths remain /api/agents/:clientId/{content-briefs,content-drafts,content-drafts/:id/publish,content-calendar/generate,content-calendar/results,content-calendar/:itemId/status}.
// Reuses the shared getClientDoc.
const contentRouter = require("./modules/content");
router.use("/", contentRouter);

// ── Investigation routes (extracted Sprint 1, M6.14) ──
// Mounted at the same base ("/") so paths remain /api/agents/:clientId/{A23/investigate,A23/investigations}.
// Reuses the shared getClientDoc.
const investigationRouter = require("./modules/investigation");
router.use("/", investigationRouter);

// ── Scanner (POST) routes (extracted Sprint 1, M6.16) ──
// Mounted at the same base ("/") so paths remain /api/agents/:clientId/{A25/scan,aio/scan,ai-citations/scan,serp-features/scan,local-citations/scan}.
// Reuses the shared getClientDoc. The matching GET /results routes are in ./modules/results (M6.4).
const scannersRouter = require("./modules/scanners");
router.use("/", scannersRouter);

// ── Approvals routes (extracted Sprint 1, M6.18) ──
// Mounted at the same base ("/") so paths remain /api/agents/:clientId/{approvals,approvals/:itemId,approvals/:itemId/revision,approvals/:itemId/push-to-wp}.
// Reuses the shared getClientDoc. push-to-wp keeps the A13 pushSingleFix require inline.
const approvalsRouter = require("./modules/approvals");
router.use("/", approvalsRouter);

// ── Utilities / State routes (extracted Sprint 1, M6.20) ──
// Mounted at the same base ("/") so paths remain /api/agents/:clientId/{automation-mode,recalculate,wp-push-log}.
// Reuses the shared getClientDoc + score/task utilities. recalculate keeps the inline emitTasks/clearTasks require.
const utilitiesRouter = require("./modules/utilities");
router.use("/", utilitiesRouter);

// ── Dashboard / Forecast / Score routes (extracted Sprint 1, M6.22) ──
// Mounted at the same base ("/") so paths remain /api/agents/:clientId/{score,score/history,forecast,dashboard,pages,attribution,gtm-guide}.
// Reuses the shared getClientDoc + score/task/alert utilities.
const dashboardRouter = require("./modules/dashboard");
router.use("/", dashboardRouter);

// ── Remaining Agent Execution routes (extracted Sprint 1, M6.23) ──
// Mounted at the same base ("/") so paths remain /api/agents/:clientId/{A8/data,run-a10,A11/state,run-a12..a16,A17/run,A17/review,A19/run,A19/state,A22/run,A22/forecast,AIx/scan,AIx/results}.
// Reuses the shared getClientDoc. AI_AGENTS + stateMap consts and all lazy agent requires moved with the module.
const execution2Router = require("./modules/execution2");
router.use("/", execution2Router);

// ── Helper: check client ownership ────────────────
// Extracted verbatim to ./shared/clientOwnership (Sprint 1, M6.1.5) so the
// ownership check has a single source of truth. Imported here; all call sites
// below are unchanged.
const { getClientDoc } = require("./shared/clientOwnership");

// ── Generic agent runner ───────────────────────────
// Extracted verbatim to ./shared/agentRunner (Sprint 1, M6.5). Imported here;
// all runAgent(...) call sites below are unchanged.
const { runAgent } = require("./shared/agentRunner");

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
    const { deleteState } = require("../shared-state/stateManager");
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

// ── Run A3–A8 ───────────────────────────────────────
// POST /:clientId/{A3,A4,A5,A6,A7,A8}/run extracted verbatim to
// ./modules/execution (Sprint 1, M6.6) and mounted near the top of this file.
// Behaviour and paths are unchanged.

// ── GET A8: GEO data ──────────────────────────────
// GET /:clientId/A8/data extracted verbatim to ./modules/execution2 (Sprint 1,
// M6.23) and mounted near the top of this file. Behaviour and path are unchanged.

// ── Run A9: Generate Report ────────────────────────
// POST /:clientId/A9/report extracted verbatim to ./modules/reports (Sprint 1,
// M6.2) and mounted near the top of this file. Behaviour and path are unchanged.

// ── Run A9: Check Alerts ───────────────────────────
// POST /:clientId/A9/alerts extracted verbatim to ./modules/monitoring
// (Sprint 1, M6.10) and mounted near the top of this file. Behaviour and path
// are unchanged.

// ── GET Approval Queue for client ─────────────────
// GET /:clientId/approvals extracted verbatim to ./modules/approvals (Sprint 1,
// M6.18) and mounted near the top of this file. Behaviour and path are unchanged.

// ── Approve / Reject item ─────────────────────────
// POST /:clientId/approvals/:itemId extracted verbatim to ./modules/approvals
// (Sprint 1, M6.18) and mounted near the top of this file. Behaviour and path
// are unchanged.

// ── Resolve alert ─────────────────────────────────
// POST /:clientId/alerts/:alertId/resolve extracted verbatim to
// ./modules/monitoring (Sprint 1, M6.10) and mounted near the top of this file.
// Behaviour and path are unchanged.

// ── Request revision on approval item ─────────────
// POST /:clientId/approvals/:itemId/revision extracted verbatim to
// ./modules/approvals (Sprint 1, M6.18) and mounted near the top of this file.
// Behaviour and path are unchanged.

// ── AI Generate Fix for a specific issue ──────────
// POST /:clientId/generate-fix extracted verbatim to ./modules/tasks (Sprint 1,
// M6.12) and mounted near the top of this file. Behaviour and path are unchanged.

// ── Get rank history for client ────────────────────
// GET /:clientId/rank-history extracted verbatim to ./modules/rankings (Sprint 1,
// M6.9) and mounted near the top of this file. Behaviour and path are unchanged.

// ────────────────────────────────────────────────────
// TASK QUEUE ENDPOINTS
// ────────────────────────────────────────────────────

// GET all tasks sorted by priority
// GET /:clientId/tasks, GET /:clientId/tasks/today, PUT /:clientId/tasks/:taskId,
// and POST /:clientId/tasks/:taskId/execute extracted verbatim to ./modules/tasks
// (Sprint 1, M6.12) and mounted near the top of this file. Behaviour and paths
// are unchanged.

// ────────────────────────────────────────────────────
// SCORE ENDPOINTS
// ────────────────────────────────────────────────────

// GET current 4-dimension score breakdown
// GET /:clientId/score extracted verbatim to ./modules/dashboard (Sprint 1,
// M6.22) and mounted near the top of this file. Behaviour and path are unchanged.

// GET score history for chart (last 12)
// GET /:clientId/score/history extracted verbatim to ./modules/dashboard
// (Sprint 1, M6.22) and mounted near the top of this file. Behaviour and path
// are unchanged.

// GET growth forecast
// GET /:clientId/forecast extracted verbatim to ./modules/dashboard (Sprint 1,
// M6.22) and mounted near the top of this file. Behaviour and path are unchanged.

// ────────────────────────────────────────────────────
// UNIFIED DASHBOARD ENDPOINT
// ────────────────────────────────────────────────────

// GET /:clientId/dashboard extracted verbatim to ./modules/dashboard (Sprint 1,
// M6.22) and mounted near the top of this file. Behaviour and path are unchanged.

// ── GET translated alerts for client ──────────────
// GET /:clientId/alerts extracted verbatim to ./modules/monitoring (Sprint 1,
// M6.10) and mounted near the top of this file. Behaviour and path are unchanged.

// ────────────────────────────────────────────────────
// AUTOMATION MODE
// ────────────────────────────────────────────────────

// PUT /:clientId/automation-mode extracted verbatim to ./modules/utilities
// (Sprint 1, M6.20) and mounted near the top of this file. Behaviour and path
// are unchanged.

// ── A10 Ranking Tracker ────────────────────────────
// POST /:clientId/run-a10 extracted verbatim to ./modules/execution2 (Sprint 1,
// M6.23) and mounted near the top of this file. Behaviour and path are unchanged.

// GET A10 pipeline rankings (used by RankTrackerPanel for auto-import)
// GET /:clientId/A10/rankings extracted verbatim to ./modules/rankings
// (Sprint 1, M6.9) and mounted near the top of this file. Behaviour and path
// are unchanged.

// ── A11 Link Builder ───────────────────────────────
// POST /:clientId/A11/run extracted verbatim to ./modules/execution (Sprint 1,
// M6.6) and mounted near the top of this file. Behaviour and path are unchanged.

// GET A11 link-building state
// GET /:clientId/A11/state extracted verbatim to ./modules/execution2 (Sprint 1,
// M6.23) and mounted near the top of this file. Behaviour and path are unchanged.

// ── A12 Auto-Exec ──────────────────────────────────
// POST /:clientId/run-a12 extracted verbatim to ./modules/execution2 (Sprint 1,
// M6.23) and mounted near the top of this file. Behaviour and path are unchanged.

// ── GET Rankings for client ────────────────────────
// GET /:clientId/rankings extracted verbatim to ./modules/rankings (Sprint 1,
// M6.9) and mounted near the top of this file. Behaviour and path are unchanged.

// ── POST Recalculate score + re-emit tasks ─────────
// POST /:clientId/recalculate extracted verbatim to ./modules/utilities (Sprint 1,
// M6.20) and mounted near the top of this file. Behaviour and path are unchanged.

// ── GET Page-Level SEO breakdown from A2 audit ─────
// GET /:clientId/pages extracted verbatim to ./modules/dashboard (Sprint 1,
// M6.22) and mounted near the top of this file. Behaviour and path are unchanged.

// ────────────────────────────────────────────────────
// REVENUE IMPACT
// ────────────────────────────────────────────────────

// GET keyword → traffic → revenue impact calculation
// GET /:clientId/revenue extracted verbatim to ./modules/roi (Sprint 1, M6.7)
// and mounted near the top of this file. Behaviour and path are unchanged.

// ────────────────────────────────────────────────────
// BULK ACTIONS
// ────────────────────────────────────────────────────

// POST bulk task action: complete-all | generate-fixes
// POST /:clientId/tasks/bulk extracted verbatim to ./modules/tasks (Sprint 1,
// M6.12) and mounted near the top of this file. Behaviour and path are unchanged.

// ────────────────────────────────────────────────────
// BEFORE/AFTER RANKING COMPARISON
// ────────────────────────────────────────────────────

// GET compare two most recent rank history snapshots
// GET /:clientId/rank-comparison extracted verbatim to ./modules/rankings
// (Sprint 1, M6.9) and mounted near the top of this file. Behaviour and path
// are unchanged.

// ────────────────────────────────────────────────────
// LEARNING SYSTEM — track fix → outcome
// ────────────────────────────────────────────────────

// POST /:clientId/learning/record and GET /:clientId/learning extracted verbatim
// to ./modules/learning (Sprint 1, M6.8) and mounted near the top of this file.
// Behaviour and paths are unchanged.

// ────────────────────────────────────────────────────
// NOTIFICATIONS
// ────────────────────────────────────────────────────
// The /notifications, /notifications/:notifId/read, and /notifications/read-all
// routes were extracted verbatim to ./modules/notifications (Sprint 1, M6.1)
// and are mounted near the top of this file. Behaviour and paths are unchanged.

// ────────────────────────────────────────────────────
// INTENT MATCH ENGINE
// ────────────────────────────────────────────────────

// GET intent mismatch analysis: compares keyword intent vs page content signals
// Extracted verbatim to ./modules/analysis (Sprint 1, M6.3) and mounted near the
// top of this file. Behaviour and path are unchanged.

// ────────────────────────────────────────────────────
// CONTENT BRIEFS (from A5 data)
// ────────────────────────────────────────────────────

// GET structured content briefs
// GET /:clientId/content-briefs extracted verbatim to ./modules/content
// (Sprint 1, M6.13) and mounted near the top of this file. Behaviour and path
// are unchanged.

// ────────────────────────────────────────────────────
// LEVEL 2 — ACT: A13 Auto-Push to WordPress
// ────────────────────────────────────────────────────

// POST: Push all approved fixes to WordPress
// POST /:clientId/run-a13 extracted verbatim to ./modules/execution2 (Sprint 1,
// M6.23) and mounted near the top of this file. Behaviour and path are unchanged.

// POST: Push a single approval item to WordPress
// POST /:clientId/approvals/:itemId/push-to-wp extracted verbatim to
// ./modules/approvals (Sprint 1, M6.18) and mounted near the top of this file.
// Behaviour and path are unchanged.

// ────────────────────────────────────────────────────
// LEVEL 2 — ACT: A14 Content Autopilot
// ────────────────────────────────────────────────────

// POST: Run content autopilot — generate articles for keyword gaps
// POST /:clientId/run-a14 extracted verbatim to ./modules/execution2 (Sprint 1,
// M6.23) and mounted near the top of this file. Behaviour and path are unchanged.

// GET /:clientId/content-drafts and POST /:clientId/content-drafts/:draftId/publish
// extracted verbatim to ./modules/content (Sprint 1, M6.13) and mounted near the
// top of this file. Behaviour and paths are unchanged.

// ────────────────────────────────────────────────────
// LEVEL 3 — LEARN: A15 Competitor Monitor
// ────────────────────────────────────────────────────

// POST: Run competitor monitoring
// POST /:clientId/run-a15 extracted verbatim to ./modules/execution2 (Sprint 1,
// M6.23) and mounted near the top of this file. Behaviour and path are unchanged.

// ────────────────────────────────────────────────────
// LEVEL 3 — LEARN: A16 Client Memory
// ────────────────────────────────────────────────────

// POST: Run memory update
// POST /:clientId/run-a16 extracted verbatim to ./modules/execution2 (Sprint 1,
// M6.23) and mounted near the top of this file. Behaviour and path are unchanged.

// GET: Get client memory
// GET /:clientId/memory extracted verbatim to ./modules/learning (Sprint 1,
// M6.8) and mounted near the top of this file. Behaviour and path are unchanged.

// ────────────────────────────────────────────────────
// LEVEL 4 — ROI: ROI Tracker
// ────────────────────────────────────────────────────

// GET: Get full ROI report for a client
// GET /:clientId/roi, /:clientId/roi/history, and PUT /:clientId/roi/settings
// extracted verbatim to ./modules/roi (Sprint 1, M6.7) and mounted near the top
// of this file. Behaviour and paths are unchanged.

// GET: Get wp_push_log for client (all pushes made to WordPress)
// GET /:clientId/wp-push-log extracted verbatim to ./modules/utilities (Sprint 1,
// M6.20) and mounted near the top of this file. Behaviour and path are unchanged.

// GET: CWV performance history (for trend charts in Technical tab)
// GET /:clientId/cwv-history extracted verbatim to ./modules/monitoring
// (Sprint 1, M6.10) and mounted near the top of this file. Behaviour and path
// are unchanged.

// ────────────────────────────────────────────────────
// SPRINT 4 — A17 Reviewer Agent
// ────────────────────────────────────────────────────
// POST /:clientId/A17/run and GET /:clientId/A17/review extracted verbatim to
// ./modules/execution2 (Sprint 1, M6.23) and mounted near the top of this file.
// Behaviour and paths are unchanged.

// ────────────────────────────────────────────────────
// SPRINT 4 — A19 Conversion Agent
// ────────────────────────────────────────────────────
// POST /:clientId/A19/run and GET /:clientId/A19/state extracted verbatim to
// ./modules/execution2 (Sprint 1, M6.23) and mounted near the top of this file.
// Behaviour and paths are unchanged.

// ────────────────────────────────────────────────────
// SPRINT 4 — A20 Impact Report
// ────────────────────────────────────────────────────
// GET /:clientId/A20/impact-report extracted verbatim to ./modules/reports
// (Sprint 1, M6.2) and mounted near the top of this file. Behaviour and path
// are unchanged.

// ────────────────────────────────────────────────────
// SPRINT 3 — CMO Agent (autonomous decision layer)
// ────────────────────────────────────────────────────

// POST /:clientId/cmo/run, GET /:clientId/cmo/decision, and
// GET /:clientId/cmo/queue extracted verbatim to ./modules/cmo (Sprint 1, M6.11)
// and mounted near the top of this file. Behaviour and paths are unchanged.

// ────────────────────────────────────────────────────
// SPRINT 3 — Keyword → Lead Attribution
// ────────────────────────────────────────────────────

// GET /:clientId/attribution extracted verbatim to ./modules/dashboard (Sprint 1,
// M6.22) and mounted near the top of this file. Behaviour and path are unchanged.

// ────────────────────────────────────────────────────
// SPRINT 3 — GTM Setup Guide Generator
// ────────────────────────────────────────────────────

// GET /:clientId/gtm-guide extracted verbatim to ./modules/dashboard (Sprint 1,
// M6.22) and mounted near the top of this file. Behaviour and path are unchanged.

// ────────────────────────────────────────────────────
// SPRINT 6 — CMO DECISIONS (approval-queue style)
// ────────────────────────────────────────────────────

// GET /:clientId/cmo-decisions and POST /:clientId/cmo-decisions/:decisionId
// extracted verbatim to ./modules/cmo (Sprint 1, M6.11) and mounted near the top
// of this file. Behaviour and paths are unchanged.

// ────────────────────────────────────────────────────
// SPRINT 6 — FIX VERIFICATION HISTORY
// ────────────────────────────────────────────────────

// GET fix verification docs for a client — shows outcome of past fixes
// GET /:clientId/fix-verification extracted verbatim to ./modules/monitoring
// (Sprint 1, M6.10) and mounted near the top of this file. Behaviour and path
// are unchanged.

// ────────────────────────────────────────────────────
// SPRINT 6 — A22 PREDICTIVE INTELLIGENCE
// ────────────────────────────────────────────────────

// POST /:clientId/A22/run and GET /:clientId/A22/forecast extracted verbatim to
// ./modules/execution2 (Sprint 1, M6.23) and mounted near the top of this file.
// Behaviour and paths are unchanged.

// ────────────────────────────────────────────────────
// SPRINT 6 — AUDIT PATTERNS (A2 site-wide patterns)
// ────────────────────────────────────────────────────

// GET /:clientId/A2/patterns, /:clientId/A2/crawl-status, and
// /:clientId/A2/page-scores were extracted verbatim to ./modules/analysis
// (Sprint 1, M6.3) and mounted near the top of this file. Behaviour and paths
// are unchanged.

// ────────────────────────────────────────────────────
// A23 — ALERT INVESTIGATOR
// ────────────────────────────────────────────────────

// POST /:clientId/A23/investigate — run investigation on all unresolved P1 alerts
// POST /:clientId/A23/investigate and GET /:clientId/A23/investigations extracted
// verbatim to ./modules/investigation (Sprint 1, M6.14) and mounted near the top
// of this file. Behaviour and paths are unchanged.

// ── Intelligence Agents (AI1–AI10) — on-demand scan + results ────────────────
// POST /:clientId/:AIX/scan and GET /:clientId/:AIX/results (AI1–AI10), together
// with the AI_AGENTS config map and the inline stateMap, extracted verbatim to
// ./modules/execution2 (Sprint 1, M6.23) and mounted near the top of this file.
// Behaviour and paths are unchanged.

// POST /:clientId/A25/scan — run Core Update Scanner on-demand
// POST /:clientId/A25/scan extracted verbatim to ./modules/scanners (Sprint 1,
// M6.16) and mounted near the top of this file. Behaviour and path are unchanged.

// GET /:clientId/A25/results — latest Core Update Scanner results
// GET /:clientId/A25/results extracted verbatim to ./modules/results (Sprint 1,
// M6.4) and mounted near the top of this file. Behaviour and path are unchanged.

// ── AIO Tracker — Google AI Overview monitoring ─────────────────────────────
// POST /:clientId/aio/scan extracted verbatim to ./modules/scanners (Sprint 1,
// M6.16) and mounted near the top of this file. Behaviour and path are unchanged.

// GET /:clientId/aio/results extracted verbatim to ./modules/results (Sprint 1,
// M6.4) and mounted near the top of this file. Behaviour and path are unchanged.

// ── AI Citation Tracker — ChatGPT / Perplexity / Gemini ────────────────────
// POST /:clientId/ai-citations/scan extracted verbatim to ./modules/scanners
// (Sprint 1, M6.16) and mounted near the top of this file. Behaviour and path
// are unchanged.

// GET /:clientId/ai-citations/results extracted verbatim to ./modules/results
// (Sprint 1, M6.4) and mounted near the top of this file. Behaviour and path
// are unchanged.

// ── SERP Feature Tracker — Featured Snippet, PAA, Knowledge Panel, Image Pack ─
// POST /:clientId/serp-features/scan extracted verbatim to ./modules/scanners
// (Sprint 1, M6.16) and mounted near the top of this file. Behaviour and path
// are unchanged.

// GET /:clientId/serp-features/results extracted verbatim to ./modules/results
// (Sprint 1, M6.4) and mounted near the top of this file. Behaviour and path
// are unchanged.

// ── Content Calendar AI — 30-day automated content schedule ─────────────────
// Uses A3 keywords + A4 competitor gaps + A5 content briefs to generate a
// prioritised 30-day calendar. LLM assigns topic, keyword, format, publish date.
// Stores in content_calendar/{clientId} Firestore doc.

// POST /:clientId/content-calendar/generate, GET /:clientId/content-calendar/results,
// and PATCH /:clientId/content-calendar/:itemId/status extracted verbatim to
// ./modules/content (Sprint 1, M6.13) and mounted near the top of this file.
// Behaviour and paths are unchanged.

// ── Local Citation Audit — JustDial, Sulekha, IndiaMart, Google Maps ─────────
// POST /:clientId/local-citations/scan extracted verbatim to ./modules/scanners
// (Sprint 1, M6.16) and mounted near the top of this file. Behaviour and path
// are unchanged.

// GET /:clientId/local-citations/results extracted verbatim to ./modules/results
// (Sprint 1, M6.4) and mounted near the top of this file. Behaviour and path
// are unchanged.

module.exports = router;
