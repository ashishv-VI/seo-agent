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
router.get("/:clientId/A8/data", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const data = await getState(req.params.clientId, "A8_geo");
    return res.json(data || {});
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── Run A9: Generate Report ────────────────────────
// POST /:clientId/A9/report extracted verbatim to ./modules/reports (Sprint 1,
// M6.2) and mounted near the top of this file. Behaviour and path are unchanged.

// ── Run A9: Check Alerts ───────────────────────────
// POST /:clientId/A9/alerts extracted verbatim to ./modules/monitoring
// (Sprint 1, M6.10) and mounted near the top of this file. Behaviour and path
// are unchanged.

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
// POST /:clientId/alerts/:alertId/resolve extracted verbatim to
// ./modules/monitoring (Sprint 1, M6.10) and mounted near the top of this file.
// Behaviour and path are unchanged.

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
router.get("/:clientId/score", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const clientId = req.params.clientId;

    // Try latest stored snapshot first
    const stored = await getLatestScore(clientId);
    if (stored) return res.json({ score: stored, source: "cached" });

    // Fallback: calculate live from agent states
    const [audit, keywords, geo, onpage, technical] = await Promise.all([
      getState(clientId, "A2_audit"),
      getState(clientId, "A3_keywords"),
      getState(clientId, "A8_geo"),
      getState(clientId, "A6_onpage"),
      getState(clientId, "A7_technical"),
    ]);
    const score = calculateScore(audit, keywords, geo, onpage, technical);
    return res.json({ score, source: "live" });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// GET score history for chart (last 12)
router.get("/:clientId/score/history", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const history = await getScoreHistory(req.params.clientId, 12);
    return res.json({ history });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// GET growth forecast
router.get("/:clientId/forecast", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const clientId = req.params.clientId;
    const [tasks, stored] = await Promise.all([
      getTopTasks(clientId, 5),
      getLatestScore(clientId),
    ]);
    const currentScore = stored?.overall || 0;
    const forecast = generateForecast(tasks, currentScore);
    return res.json({ forecast, currentScore });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────
// UNIFIED DASHBOARD ENDPOINT
// ────────────────────────────────────────────────────

router.get("/:clientId/dashboard", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const clientId = req.params.clientId;

    // Run all queries independently so one failure doesn't crash the whole dashboard
    const [tasks, scoreHistory, brief, audit, report, alertsSnap, keywords] = await Promise.all([
      getTopTasks(clientId, 5).catch(() => []),
      getScoreHistory(clientId, 12).catch(() => []),
      getState(clientId, "A1_brief").catch(() => null),
      getState(clientId, "A2_audit").catch(() => null),
      getState(clientId, "A9_report").catch(() => null),
      // No composite index — fetch by clientId only, filter+sort client-side
      db.collection("alerts").where("clientId","==",clientId).limit(50).get().catch(() => null),
      getState(clientId, "A3_keywords").catch(() => null),
    ]);

    // Filter resolved + sort by date client-side (no composite index needed)
    const alerts = (alertsSnap?.docs || [])
      .map(d => {
        const a = d.data();
        const translated = translateAlert(a.message, a.type);
        return { id: d.id, ...a, ...translated, severityLabel: SEVERITY_LABELS[translated.severity] || SEVERITY_LABELS.info };
      })
      .filter(a => !a.resolved)
      .sort((a, b) => ((b.createdAt?._seconds || b.createdAt?.seconds || 0) - (a.createdAt?._seconds || a.createdAt?.seconds || 0)))
      .slice(0, 10);

    // If no stored score, calculate live from state
    let latestScore = scoreHistory.length ? scoreHistory[scoreHistory.length - 1] : null;
    if (!latestScore && audit) {
      try {
        const [geo, onpage, technical] = await Promise.all([
          getState(clientId, "A8_geo").catch(() => null),
          getState(clientId, "A6_onpage").catch(() => null),
          getState(clientId, "A7_technical").catch(() => null),
        ]);
        latestScore = calculateScore(audit, keywords, geo, onpage, technical);
        // Save it so next time it's cached
        await saveScoreHistory(clientId, { ...latestScore }).catch(() => {});
        await db.collection("clients").doc(clientId).update({ seoScore: latestScore.overall }).catch(() => {});
      } catch { /* noop */ }
    }

    const forecast = generateForecast(tasks, latestScore?.overall || 0);

    return res.json({
      brief:        brief ? { businessName: brief.businessName, websiteUrl: brief.websiteUrl, goals: brief.goals } : null,
      score:        latestScore,
      scoreHistory,
      forecast,
      topTasks:     tasks,
      alerts,
      auditSummary: audit ? {
        healthScore: audit.healthScore,
        p1: (audit.issues?.p1||[]).length,
        p2: (audit.issues?.p2||[]).length,
        p3: (audit.issues?.p3||[]).length,
        pagesCrawled: audit.checks?.pagesCrawled || 1,
      } : null,
      keywordSummary: keywords ? {
        total: keywords.totalKeywords || 0,
        gaps:  (keywords.gaps||[]).length,
        highPriority: (keywords.keywordMap||[]).filter(k=>k.priority==="high").length,
      } : null,
      reportReady: !!report,
    });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── GET translated alerts for client ──────────────
// GET /:clientId/alerts extracted verbatim to ./modules/monitoring (Sprint 1,
// M6.10) and mounted near the top of this file. Behaviour and path are unchanged.

// ────────────────────────────────────────────────────
// AUTOMATION MODE
// ────────────────────────────────────────────────────

router.put("/:clientId/automation-mode", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { mode } = req.body; // "manual" | "semi" | "full"
    if (!["manual","semi","full"].includes(mode)) return res.status(400).json({ error: "Invalid mode" });
    await db.collection("clients").doc(req.params.clientId).update({ automationMode: mode });
    return res.json({ message: `Automation mode set to ${mode}`, mode });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── A10 Ranking Tracker ────────────────────────────
router.post("/:clientId/run-a10", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { runA10 } = require("../agents/A10_rankingTracker");
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

// GET A10 pipeline rankings (used by RankTrackerPanel for auto-import)
// GET /:clientId/A10/rankings extracted verbatim to ./modules/rankings
// (Sprint 1, M6.9) and mounted near the top of this file. Behaviour and path
// are unchanged.

// ── A11 Link Builder ───────────────────────────────
// POST /:clientId/A11/run extracted verbatim to ./modules/execution (Sprint 1,
// M6.6) and mounted near the top of this file. Behaviour and path are unchanged.

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
    const { runA12 } = require("../agents/A12_autoExec");
    const keys = await getUserKeys(req.uid);
    await db.collection("clients").doc(req.params.clientId).update({ "agents.A12": "running" });
    const result = await runA12(req.params.clientId, keys);
    await db.collection("clients").doc(req.params.clientId).update({ "agents.A12": result.success ? "complete" : "failed" });
    return res.json(result);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── GET Rankings for client ────────────────────────
// GET /:clientId/rankings extracted verbatim to ./modules/rankings (Sprint 1,
// M6.9) and mounted near the top of this file. Behaviour and path are unchanged.

// ── POST Recalculate score + re-emit tasks ─────────
// Called when pipeline already ran but data isn't showing (Firestore race condition)
router.post("/:clientId/recalculate", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const clientId = req.params.clientId;
    const { emitTasks: emit, clearTasks } = require("../utils/taskQueue");

    const [audit, keywords, geo, onpage, technical] = await Promise.all([
      getState(clientId, "A2_audit"),
      getState(clientId, "A3_keywords"),
      getState(clientId, "A8_geo"),
      getState(clientId, "A6_onpage"),
      getState(clientId, "A7_technical"),
    ]);

    if (!audit) return res.status(400).json({ error: "Run the pipeline first — no audit data found" });

    // Recalculate 4D score
    const score    = calculateScore(audit, keywords, geo, onpage, technical);
    const scoreId  = await saveScoreHistory(clientId, { ...score });

    // Re-emit all tasks from audit issues
    await clearTasks(clientId);
    await Promise.allSettled([
      emit(clientId, audit.issues?.p1 || [], "p1", "A2"),
      emit(clientId, audit.issues?.p2 || [], "p2", "A2"),
      emit(clientId, audit.issues?.p3 || [], "p3", "A2"),
    ]);

    // Save score to client doc for list view
    await db.collection("clients").doc(clientId).update({ seoScore: score.overall }).catch(() => {});

    const tasks    = await getTopTasks(clientId, 5);
    const forecast = generateForecast(tasks, score.overall);

    return res.json({ score, forecast, scoreId, tasksEmitted: (audit.issues?.p1?.length||0)+(audit.issues?.p2?.length||0)+(audit.issues?.p3?.length||0), message: "Score recalculated and tasks regenerated" });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── GET Page-Level SEO breakdown from A2 audit ─────
router.get("/:clientId/pages", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const clientId = req.params.clientId;

    const [audit, keywords] = await Promise.all([
      getState(clientId, "A2_audit"),
      getState(clientId, "A3_keywords"),
    ]);

    if (!audit) return res.json({ pages: [] });

    // Global issue list (for homepage entry)
    const allIssues = [
      ...(audit.issues?.p1||[]).map(i => ({ ...i, severity:"critical" })),
      ...(audit.issues?.p2||[]).map(i => ({ ...i, severity:"warning" })),
      ...(audit.issues?.p3||[]).map(i => ({ ...i, severity:"info"     })),
    ];

    // ── Load per-page data from subcollection (pageAudits is deleted from shared_state doc before save)
    let pageAudits = [];
    try {
      const subSnap = await db.collection("audits").doc(req.params.clientId).collection("pages").get();
      pageAudits = subSnap.docs.map(d => d.data());
    } catch { /* fallback to empty — handled below */ }

    // Homepage as separate entry with its own on-page data
    const homepage = {
      url:             audit.checks?.finalUrl || "",
      title:           audit.checks?.title?.value || "",
      titleLength:     audit.checks?.title?.length || 0,
      metaDescription: audit.checks?.metaDescription?.value || "",
      hasH1:           (audit.checks?.h1?.count || 0) >= 1,
      hasMeta:         !!audit.checks?.metaDescription?.exists,
      hasCanonical:    !!audit.checks?.canonical?.exists,
      wordCount:       audit.checks?.wordCount || 0,
      altMissing:      audit.checks?.altTextAudit?.missingAlt || 0,
      isHomepage:      true,
      crawlDepth:      0,
    };

    // Combine: homepage first + inner pages, deduplicate
    let allPages = [homepage, ...pageAudits].filter((p, i, arr) =>
      p.url && arr.findIndex(x => x.url === p.url) === i
    );

    // Fallback for old data without pageAudits
    if (allPages.length <= 1) {
      const fallback = (audit?.pages || []).slice(0, 30).map(p => ({
        url: typeof p === "string" ? p : p.url,
        title: "", hasH1: false, hasMeta: false, hasCanonical: false,
      }));
      allPages = [homepage, ...fallback];
    }

    // Map keywords to page paths
    const kwMap = {};
    (keywords?.keywordMap || []).forEach(k => {
      if (k.suggestedPage) {
        if (!kwMap[k.suggestedPage]) kwMap[k.suggestedPage] = [];
        kwMap[k.suggestedPage].push(k);
      }
    });

    // Score each page from actual on-page signals (not from global issue list)
    const pages = allPages.slice(0, 50).map(page => {
      let urlPath = "/";
      try { urlPath = page.url ? new URL(page.url).pathname : "/"; } catch { urlPath = page.url || "/"; }

      let score = 100;
      const pg_issues = [];

      if (!page.title || page.title === "(missing)" || page.title === "") {
        score -= 20;
        pg_issues.push({ type:"missing_title",      label:"No title tag",                        severity:"critical" });
      } else if ((page.titleLength||0) > 60) {
        score -= 5;
        pg_issues.push({ type:"long_title",         label:`Title too long (${page.titleLength} chars)`, severity:"warning" });
      }
      if (!page.hasMeta && !page.metaDescription) {
        score -= 15;
        pg_issues.push({ type:"missing_meta",       label:"No meta description",                 severity:"warning" });
      }
      if (!page.hasH1) {
        score -= 15;
        pg_issues.push({ type:"missing_h1",         label:"No H1 tag",                           severity:"warning" });
      }
      if (!page.hasCanonical) {
        score -= 8;
        pg_issues.push({ type:"missing_canonical",  label:"No canonical tag",                    severity:"info"    });
      }
      if ((page.wordCount||0) > 0 && page.wordCount < 300) {
        score -= 15;
        pg_issues.push({ type:"thin_content",       label:`Thin content (${page.wordCount} words)`, severity:"warning" });
      }
      if ((page.altMissing||0) > 0) {
        score -= 5;
        pg_issues.push({ type:"missing_alt",        label:`${page.altMissing} images missing alt`, severity:"info"  });
      }

      // For homepage: merge global site-level issues (sitemap, robots, redirect chains etc.)
      // For inner pages: merge A2's full per-page issues (schema, dup titles, CWV notes etc.)
      let mergedIssues;
      if (page.isHomepage) {
        mergedIssues = [...pg_issues, ...allIssues.filter(i => !pg_issues.find(p => p.type === i.type)).slice(0, 8)];
      } else {
        // page.issues comes from A2 auditPage() — has detail + fix fields
        const a2Issues = (page.issues || []).filter(i => !pg_issues.find(p => p.type === i.type));
        mergedIssues = [...pg_issues, ...a2Issues];
      }

      score = Math.max(0, Math.min(100, score));

      return {
        url:             page.url,
        path:            urlPath,
        title:           (page.title && page.title !== "(missing)") ? page.title : null,
        titleLength:     page.titleLength || 0,
        metaDescription: page.metaDescription || null,
        h1:              page.h1 || null,
        score,
        issues:          mergedIssues,
        issueCount:      mergedIssues.length,
        targetKeywords:  kwMap[urlPath] || [],
        hasTitle:        !!(page.title && page.title !== "(missing)"),
        hasMeta:         !!(page.hasMeta || page.metaDescription),
        hasH1:           !!page.hasH1,
        hasCanonical:    !!page.hasCanonical,
        wordCount:       page.wordCount || 0,
        altMissing:      page.altMissing || 0,
        responseTime:    page.responseTime || null,
        statusCode:      page.statusCode || 200,
        crawlDepth:      page.crawlDepth || (page.isHomepage ? 0 : 1),
        isHomepage:      !!page.isHomepage,
      };
    });

    return res.json({ pages: pages.sort((a, b) => a.score - b.score) });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

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
router.post("/:clientId/run-a13", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { runA13 } = require("../agents/A13_autopush");
    const keys = await getUserKeys(req.uid);
    await db.collection("clients").doc(req.params.clientId).update({ "agents.A13": "running" });
    const result = await runA13(req.params.clientId, keys);
    await db.collection("clients").doc(req.params.clientId).update({ "agents.A13": result.success ? "complete" : "failed" });
    return res.json(result);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// POST: Push a single approval item to WordPress
router.post("/:clientId/approvals/:itemId/push-to-wp", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { pushSingleFix } = require("../agents/A13_autopush");
    const result = await pushSingleFix(req.params.clientId, req.params.itemId);
    return res.json(result);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────
// LEVEL 2 — ACT: A14 Content Autopilot
// ────────────────────────────────────────────────────

// POST: Run content autopilot — generate articles for keyword gaps
router.post("/:clientId/run-a14", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { runA14 } = require("../agents/A14_contentAutopilot");
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

// GET /:clientId/content-drafts and POST /:clientId/content-drafts/:draftId/publish
// extracted verbatim to ./modules/content (Sprint 1, M6.13) and mounted near the
// top of this file. Behaviour and paths are unchanged.

// ────────────────────────────────────────────────────
// LEVEL 3 — LEARN: A15 Competitor Monitor
// ────────────────────────────────────────────────────

// POST: Run competitor monitoring
router.post("/:clientId/run-a15", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { runA15 } = require("../agents/A15_competitorMonitor");
    const keys = await getUserKeys(req.uid);
    await db.collection("clients").doc(req.params.clientId).update({ "agents.A15": "running" });
    const result = await runA15(req.params.clientId, keys);
    await db.collection("clients").doc(req.params.clientId).update({ "agents.A15": result.success ? "complete" : "failed" });
    return res.json(result);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────
// LEVEL 3 — LEARN: A16 Client Memory
// ────────────────────────────────────────────────────

// POST: Run memory update
router.post("/:clientId/run-a16", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { runA16 } = require("../agents/A16_memory");
    const keys = await getUserKeys(req.uid);
    const result = await runA16(req.params.clientId, keys);
    return res.json(result);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

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
router.get("/:clientId/wp-push-log", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const snap = await db.collection("wp_push_log")
      .where("clientId", "==", req.params.clientId)
      .get();
    const logs = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => new Date(b.pushedAt || 0) - new Date(a.pushedAt || 0))
      .slice(0, 50);
    return res.json({ logs, total: logs.length });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// GET: CWV performance history (for trend charts in Technical tab)
// GET /:clientId/cwv-history extracted verbatim to ./modules/monitoring
// (Sprint 1, M6.10) and mounted near the top of this file. Behaviour and path
// are unchanged.

// ────────────────────────────────────────────────────
// SPRINT 4 — A17 Reviewer Agent
// ────────────────────────────────────────────────────
router.post("/:clientId/A17/run", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { runA17 } = require("../agents/A17_reviewer");
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
    const { runA19 } = require("../agents/A19_conversion");
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

router.get("/:clientId/attribution", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const clientId = req.params.clientId;

    const [brief, keywords, report] = await Promise.all([
      getState(clientId, "A1_brief"),
      getState(clientId, "A3_keywords"),
      getState(clientId, "A9_report"),
    ]);

    if (!keywords) return res.json({ attribution: [], message: "Run keyword research first" });

    // Build keyword → estimated traffic → estimated leads chain
    const gsc    = report?.gscSummary || {};
    const avgCtr = gsc.avgCtr || 0.03;
    const avgPos = gsc.avgPos || 10;

    // CTR curve by position
    const ctrByPos = p => p <= 1 ? 0.25 : p <= 3 ? 0.12 : p <= 5 ? 0.06 : p <= 10 ? 0.02 : 0.005;

    const allKw = Object.values(keywords.clusters || {}).flat().slice(0, 50);
    const convRate = 0.03; // 3% default — improved with GA4 data

    const attribution = allKw
      .filter(k => k.searchVolume || k.volume)
      .map(k => {
        const vol  = k.searchVolume || k.volume || 0;
        const pos  = k.currentPosition || k.difficulty || 15;
        const ctr  = ctrByPos(pos);
        const monthlyClicks = Math.round(vol * ctr);
        const estLeads = Math.round(monthlyClicks * convRate);
        return {
          keyword:       k.keyword,
          searchVolume:  vol,
          position:      pos,
          estimatedCtr:  (ctr * 100).toFixed(1) + "%",
          monthlyClicks,
          estimatedLeads: estLeads,
          kpiContribution: estLeads > 5 ? "high" : estLeads > 1 ? "medium" : "low",
        };
      })
      .sort((a, b) => b.estimatedLeads - a.estimatedLeads);

    const totalEstLeads = attribution.reduce((s, k) => s + k.estimatedLeads, 0);
    const avgOrderValue = parseFloat((brief?.avgOrderValue || "0").replace(/[^0-9.]/g, "")) || 0;

    return res.json({
      attribution: attribution.slice(0, 30),
      summary: {
        totalKeywords:    attribution.length,
        totalEstLeads,
        avgOrderValue,
        estimatedRevenue: avgOrderValue > 0 ? Math.round(totalEstLeads * avgOrderValue) : null,
        conversionRate:   (convRate * 100).toFixed(1) + "%",
        note:             "Estimates based on GSC CTR data + industry benchmarks. Connect GA4 for real conversion data.",
      },
    });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────
// SPRINT 3 — GTM Setup Guide Generator
// ────────────────────────────────────────────────────

router.get("/:clientId/gtm-guide", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const brief = await getState(req.params.clientId, "A1_brief");
    const kpis  = brief?.kpiSelection || ["Organic Traffic Growth"];
    const conversionGoal = brief?.conversionGoal || "";

    const triggers = [];

    // Always include form submissions
    triggers.push({
      name:     "Form Submission",
      type:     "Trigger",
      config:   "Trigger Type: Form Submission\nEnable: All Forms\nFire On: Forms",
      ga4Event: "form_submit",
      useCase:  "Track lead form fills — primary conversion event",
    });

    // Phone clicks (if lead gen or local)
    if (kpis.some(k => k.includes("Lead") || k.includes("Local"))) {
      triggers.push({
        name:     "Phone Click",
        type:     "Trigger",
        config:   "Trigger Type: Click – Just Links\nThis trigger fires on: Some Link Clicks\nClick URL contains: tel:",
        ga4Event: "phone_click",
        useCase:  "Track phone calls from organic search — critical for lead gen",
      });
    }

    // WhatsApp clicks
    triggers.push({
      name:     "WhatsApp Click",
      type:     "Trigger",
      config:   "Trigger Type: Click – Just Links\nThis trigger fires on: Some Link Clicks\nClick URL contains: wa.me",
      ga4Event: "whatsapp_click",
      useCase:  "Track WhatsApp enquiries — common mobile conversion",
    });

    // CTA button clicks
    triggers.push({
      name:     "CTA Button Click",
      type:     "Trigger",
      config:   "Trigger Type: All Elements\nThis trigger fires on: Some Clicks\nClick Text contains: Get Quote, Book Now, Contact Us, Buy Now (adjust to your CTAs)",
      ga4Event: "cta_click",
      useCase:  "Track primary CTA buttons — shows intent without form fill",
    });

    // E-commerce
    if (kpis.some(k => k.includes("Sales") || k.includes("E-commerce"))) {
      triggers.push({
        name:     "Purchase / Thank You Page",
        type:     "Trigger",
        config:   "Trigger Type: Page View\nThis trigger fires on: Some Page Views\nPage URL contains: /thank-you, /order-confirmation, /checkout/complete",
        ga4Event: "purchase",
        useCase:  "Track completed sales — required for ROI calculation",
      });
    }

    // Scroll depth
    triggers.push({
      name:     "Scroll Depth (75%)",
      type:     "Trigger (Built-in)",
      config:   "Enable Scroll Depth in GA4 Enhanced Measurement — no GTM needed",
      ga4Event: "scroll",
      useCase:  "Measure content engagement — identifies high-value pages",
    });

    const guide = {
      clientName:  brief?.businessName,
      websiteUrl:  brief?.websiteUrl,
      kpis,
      gtmSteps: [
        "Create GTM account at tagmanager.google.com",
        "Install GTM snippet in <head> and <body> of website",
        "Create GA4 Configuration Tag: Tag Type = Google Analytics: GA4 Configuration. Add your Measurement ID.",
        "Create event tags below, each firing on the corresponding trigger",
        "Test in Preview mode before publishing",
        "Publish container when all events verified in GA4 DebugView",
      ],
      triggers,
      conversionEvents: triggers.filter(t => ["form_submit","phone_click","purchase"].includes(t.ga4Event)).map(t => ({
        event: t.ga4Event,
        markAsConversion: true,
        ga4Path: "GA4 → Admin → Events → Mark as conversion",
      })),
    };

    return res.json({ guide });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

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

router.post("/:clientId/A22/run", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { runA22 } = require("../agents/A22_predictive");
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
const AI_AGENTS = {
  AI1:  { module: "../agents/AI1_intentDrift",        fn: "runAI1"  },
  AI2:  { module: "../agents/AI2_topicalAuthority",   fn: "runAI2"  },
  AI3:  { module: "../agents/AI3_serpVolatility",     fn: "runAI3"  },
  AI4:  { module: "../agents/AI4_leadQualityScore",   fn: "runAI4"  },
  AI5:  { module: "../agents/AI5_seasonalOpportunity",fn: "runAI5"  },
  AI6:  { module: "../agents/AI6_negativeSeoShield",  fn: "runAI6"  },
  AI7:  { module: "../agents/AI7_contentDecay",       fn: "runAI7"  },
  AI8:  { module: "../agents/AI8_voiceSearch",        fn: "runAI8"  },
  AI9:  { module: "../agents/AI9_zeroClick",          fn: "runAI9"  },
  AI10: { module: "../agents/AI10_agencyBenchmark",   fn: "runAI10" },
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

// POST /:clientId/A25/scan — run Core Update Scanner on-demand
router.post("/:clientId/A25/scan", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { runA25 } = require("../agents/A25_coreUpdateScanner");
    const keys = await getUserKeys(req.uid);
    const result = await runA25(req.params.clientId, keys);
    return res.json(result);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// GET /:clientId/A25/results — latest Core Update Scanner results
// GET /:clientId/A25/results extracted verbatim to ./modules/results (Sprint 1,
// M6.4) and mounted near the top of this file. Behaviour and path are unchanged.

// ── AIO Tracker — Google AI Overview monitoring ─────────────────────────────
// Checks whether each tracked keyword appears in an AI Overview box on Bing/Google
// by scraping the SERP HTML and detecting AI answer box patterns.
// Stores results in aio_tracker/{clientId} Firestore doc.

router.post("/:clientId/aio/scan", verifyToken, async (req, res) => {
  try {
    const { clientId } = req.params;
    await getClientDoc(clientId, req.uid);

    const keywords = await getState(clientId, "A3_keywords");
    const brief    = await getState(clientId, "A1_brief");
    if (!keywords?.keywordMap?.length) return res.status(400).json({ error: "Run A3 keywords first" });

    const kws = keywords.keywordMap.slice(0, 15).map(k => k.keyword);
    const domain = brief?.websiteUrl ? new URL(brief.websiteUrl).hostname.replace("www.", "") : null;

    const results = [];
    for (const kw of kws) {
      try {
        // Bing SERP — AI overview box appears as data-tag="RelaxedQuery" or .b_ans
        const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(kw)}&mkt=en-IN`;
        const r = await fetch(bingUrl, {
          signal: AbortSignal.timeout(12000),
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept": "text/html",
          },
        });
        if (!r.ok) { results.push({ keyword: kw, aioPresent: false, error: `HTTP ${r.status}` }); continue; }
        const html = await r.text();

        // Detect AI Overview / Copilot answer box
        const hasAIO = /class=["'][^"']*b_codeSnippet|CopilotAnswer|b_wbAns|ai-answer|sydney-answer|ai_feedback/i.test(html)
          || /data-tag=["']Copilot|AIAnswer|ai-generated/i.test(html)
          || /(?:AI-generated|Generative AI|Based on sources)/i.test(html);

        // Check if client domain appears in AIO sources
        const clientInAIO = domain && hasAIO && html.includes(domain);

        // Featured snippet (position 0)
        const hasFeaturedSnippet = /class=["'][^"']*b_ans\b|b_algoSlim\b/i.test(html);

        // PAA boxes
        const paaMatches = [...html.matchAll(/class=["'][^"']*b_sugexp[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi)];
        const paaQuestions = paaMatches.slice(0, 4).map(m => m[1].replace(/<[^>]+>/g, "").trim()).filter(Boolean);

        results.push({
          keyword:       kw,
          aioPresent:    hasAIO,
          clientInAIO:   clientInAIO,
          featuredSnippet: hasFeaturedSnippet,
          paaQuestions:  paaQuestions,
          checkedAt:     new Date().toISOString(),
        });

        await new Promise(r2 => setTimeout(r2, 800)); // polite delay
      } catch (e) {
        results.push({ keyword: kw, aioPresent: false, error: e.message });
      }
    }

    const summary = {
      totalChecked:   results.length,
      aioPresent:     results.filter(r => r.aioPresent).length,
      clientInAIO:    results.filter(r => r.clientInAIO).length,
      featuredSnippets: results.filter(r => r.featuredSnippet).length,
      checkedAt:      new Date().toISOString(),
    };

    await db.collection("aio_tracker").doc(clientId).set({ clientId, keywords: results, summary, updatedAt: new Date().toISOString() });

    return res.json({ success: true, summary, keywords: results });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// GET /:clientId/aio/results extracted verbatim to ./modules/results (Sprint 1,
// M6.4) and mounted near the top of this file. Behaviour and path are unchanged.

// ── AI Citation Tracker — ChatGPT / Perplexity / Gemini ────────────────────
// Strategy (zero paid API):
//   1. Bing AI answers (Copilot) — scrape Bing SERP for Copilot citation boxes
//   2. Perplexity — if perplexityKey in user keys, call Perplexity API
//   3. Gemini suggestions — scrape Google "AI Overviews" sources from SERP
// Stores results in ai_citations/{clientId} Firestore doc.

router.post("/:clientId/ai-citations/scan", verifyToken, async (req, res) => {
  try {
    const { clientId } = req.params;
    await getClientDoc(clientId, req.uid);

    const keys     = await getUserKeys(req.uid);
    const keywords = await getState(clientId, "A3_keywords");
    const brief    = await getState(clientId, "A1_brief");
    if (!keywords?.keywordMap?.length) return res.status(400).json({ error: "Run A3 keywords first" });

    const domain  = brief?.websiteUrl ? new URL(brief.websiteUrl).hostname.replace("www.", "") : null;
    const kws     = keywords.keywordMap.slice(0, 10).map(k => k.keyword);
    const results = [];

    for (const kw of kws) {
      const entry = { keyword: kw, sources: [], citedBy: [], checkedAt: new Date().toISOString() };

      // ── Bing Copilot citation check ─────────────────────────────────────────
      try {
        const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(kw)}&setlang=en`;
        const r = await fetch(bingUrl, {
          signal: AbortSignal.timeout(12000),
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
          },
        });
        if (r.ok) {
          const html = await r.text();
          // Bing Copilot citations appear in .b_codeSnippet, .b_wbAns, .sydney-citation
          const hasCopilot = /sydney-citation|CopilotAnswer|b_codeSnippet|b_wbAns/i.test(html);
          if (hasCopilot) {
            entry.citedBy.push("Bing Copilot");
            // Extract cited source URLs from Copilot answer
            const citationUrls = [...html.matchAll(/sydney-citation[^>]*href=["']([^"']+)["']/gi)].map(m => m[1]);
            entry.sources.push(...citationUrls.slice(0, 5));
          }
          // Is our domain in the Copilot citations?
          entry.bingCopilotCited = hasCopilot && domain && entry.sources.some(s => s.includes(domain));
          entry.bingCopilotPresent = hasCopilot;
        }
      } catch { /* skip */ }

      // ── Perplexity API (if key configured) ─────────────────────────────────
      if (keys?.perplexityKey) {
        try {
          const prxRes = await fetch("https://api.perplexity.ai/chat/completions", {
            method: "POST",
            signal: AbortSignal.timeout(15000),
            headers: {
              "Authorization": `Bearer ${keys.perplexityKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "sonar",
              messages: [{ role: "user", content: `${kw}` }],
              return_citations: true,
              max_tokens: 400,
            }),
          });
          if (prxRes.ok) {
            const prxData = await prxRes.json();
            const citations = prxData?.citations || [];
            entry.sources.push(...citations);
            const domainCited = domain && citations.some(c => c.includes(domain));
            entry.perplexityCited = domainCited;
            entry.perplexityPresent = citations.length > 0;
            if (domainCited) entry.citedBy.push("Perplexity");
          }
        } catch { /* skip */ }
      }

      // ── Google AI Overview source check ─────────────────────────────────────
      try {
        const gUrl = `https://www.google.com/search?q=${encodeURIComponent(kw)}&hl=en`;
        const gRes = await fetch(gUrl, {
          signal: AbortSignal.timeout(12000),
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
            "Accept-Language": "en-US",
          },
        });
        if (gRes.ok) {
          const gHtml = await gRes.text();
          const hasAIO = /data-attrid=["']AIOverview\b|class=["'][^"']*ai-overview/i.test(gHtml)
            || /AI-generated content|Based on sources/i.test(gHtml);
          entry.googleAIOPresent = hasAIO;
          entry.googleAIOCited   = hasAIO && domain && gHtml.includes(domain);
          if (entry.googleAIOCited) entry.citedBy.push("Google AI Overview");
        }
      } catch { /* skip */ }

      entry.anyCitation = entry.citedBy.length > 0;
      results.push(entry);
      await new Promise(r2 => setTimeout(r2, 1000));
    }

    const summary = {
      totalChecked:     results.length,
      bingCopilotCited: results.filter(r => r.bingCopilotCited).length,
      perplexityCited:  results.filter(r => r.perplexityCited).length,
      googleAIOCited:   results.filter(r => r.googleAIOCited).length,
      anyCitation:      results.filter(r => r.anyCitation).length,
      hasPerplexityKey: !!keys?.perplexityKey,
      checkedAt:        new Date().toISOString(),
    };

    await db.collection("ai_citations").doc(clientId).set({ clientId, keywords: results, summary, updatedAt: new Date().toISOString() });
    return res.json({ success: true, summary, keywords: results });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// GET /:clientId/ai-citations/results extracted verbatim to ./modules/results
// (Sprint 1, M6.4) and mounted near the top of this file. Behaviour and path
// are unchanged.

// ── SERP Feature Tracker — Featured Snippet, PAA, Knowledge Panel, Image Pack ─
// Scrapes Bing SERP HTML for each keyword and detects which SERP features fire.
// Zero paid APIs — pure HTML scraping with feature fingerprinting.
// Stores results in serp_features/{clientId} Firestore doc.

router.post("/:clientId/serp-features/scan", verifyToken, async (req, res) => {
  try {
    const { clientId } = req.params;
    await getClientDoc(clientId, req.uid);

    const keywords = await getState(clientId, "A3_keywords");
    const brief    = await getState(clientId, "A1_brief");
    if (!keywords?.keywordMap?.length) return res.status(400).json({ error: "Run A3 keywords first" });

    const domain = brief?.websiteUrl ? new URL(brief.websiteUrl).hostname.replace("www.", "") : null;
    const kws    = keywords.keywordMap.slice(0, 15).map(k => k.keyword);
    const results = [];

    for (const kw of kws) {
      try {
        const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(kw)}&setlang=en&cc=US`;
        const r = await fetch(bingUrl, {
          signal: AbortSignal.timeout(12000),
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
          },
        });

        if (!r.ok) { results.push({ keyword: kw, error: `HTTP ${r.status}` }); continue; }
        const html = await r.text();

        // ── SERP feature detection fingerprints ────────────────────────────
        // Featured Snippet (answer box)
        const featuredSnippet = /class=["'][^"']*b_ans\b[^"']*["']|b_algoSlim|b_answerCard/i.test(html);
        // Check if client is in featured snippet
        const featuredSnippetOwned = featuredSnippet && domain && html.substring(0, html.indexOf("b_results") || html.length).includes(domain);

        // PAA (People Also Ask)
        const paaPresent = /b_paa|b_accordion|people.also.ask|related.questions/i.test(html);
        const paaMatches = [...html.matchAll(/<div[^>]+class=["'][^"']*b_accordion[^"']*["'][^>]*>[\s\S]*?<div[^>]+class=["'][^"']*b_title[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)]
          .map(m => m[1].replace(/<[^>]+>/g, "").trim()).filter(Boolean).slice(0, 5);

        // Knowledge Panel
        const knowledgePanel = /b_entityTP|b_entity_side|entity_sidebar|b_entitySlider/i.test(html);

        // Image Pack
        const imagePack = /b_imgSerpCite|b_imageSerpCite|b_imgResult|image.pack/i.test(html);

        // Video results
        const videoPack = /b_videoResult|b_onPageEntity.*video|b_videoSerpCite/i.test(html);

        // Local Pack (maps / local results)
        const localPack = /b_localResults|b_lstItem|localOneBox|maps\.bing\.com/i.test(html);

        // Shopping ads / product listing
        const shoppingPack = /b_sideImages|bing\.com\/shop|productSerpCard/i.test(html);

        // Sitelinks
        const sitelinks = /b_deep|b_deeplinks|b_sitelinks/i.test(html);

        // Top stories
        const topStories = /b_newsResult|b_nwsResult|TopStories/i.test(html);

        const features = [];
        if (featuredSnippet)  features.push({ type: "featured_snippet", owned: featuredSnippetOwned });
        if (paaPresent)       features.push({ type: "people_also_ask",  questions: paaMatches });
        if (knowledgePanel)   features.push({ type: "knowledge_panel" });
        if (imagePack)        features.push({ type: "image_pack" });
        if (videoPack)        features.push({ type: "video_pack" });
        if (localPack)        features.push({ type: "local_pack" });
        if (shoppingPack)     features.push({ type: "shopping" });
        if (sitelinks)        features.push({ type: "sitelinks" });
        if (topStories)       features.push({ type: "top_stories" });

        results.push({
          keyword:            kw,
          features,
          featureCount:       features.length,
          hasOpportunity:     featuredSnippet && !featuredSnippetOwned,
          checkedAt:          new Date().toISOString(),
        });

        await new Promise(r2 => setTimeout(r2, 700));
      } catch (e) {
        results.push({ keyword: kw, features: [], error: e.message });
      }
    }

    const summary = {
      totalChecked:      results.length,
      withFeatures:      results.filter(r => r.featureCount > 0).length,
      featuredSnippets:  results.filter(r => r.features?.some(f => f.type === "featured_snippet")).length,
      ownedSnippets:     results.filter(r => r.features?.some(f => f.type === "featured_snippet" && f.owned)).length,
      paaPresent:        results.filter(r => r.features?.some(f => f.type === "people_also_ask")).length,
      localPacks:        results.filter(r => r.features?.some(f => f.type === "local_pack")).length,
      opportunities:     results.filter(r => r.hasOpportunity).length,
      checkedAt:         new Date().toISOString(),
    };

    await db.collection("serp_features").doc(clientId).set({ clientId, keywords: results, summary, updatedAt: new Date().toISOString() });
    return res.json({ success: true, summary, keywords: results });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

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
// Checks if the business appears on key Indian directories by searching them
// and comparing NAP (Name, Address, Phone) consistency.
// Stores results in local_citations/{clientId} Firestore doc.

router.post("/:clientId/local-citations/scan", verifyToken, async (req, res) => {
  try {
    const { clientId } = req.params;
    await getClientDoc(clientId, req.uid);

    const brief = await getState(clientId, "A1_brief");
    if (!brief?.businessName) return res.status(400).json({ error: "Run A1 onboarding first" });

    const bizName = brief.businessName;
    const city    = brief.city || brief.location || "";
    const phone   = brief.phone || "";
    const address = brief.address || "";

    const DIRECTORIES = [
      {
        id:       "justdial",
        name:     "JustDial",
        url:      `https://www.justdial.com/${encodeURIComponent(city || "india")}/${encodeURIComponent(bizName.replace(/\s+/g, "-"))}`,
        searchUrl: `https://www.justdial.com/search?q=${encodeURIComponent(bizName)}&city=${encodeURIComponent(city)}`,
        icon:     "📱",
        priority: "high",
      },
      {
        id:       "sulekha",
        name:     "Sulekha",
        url:      `https://www.sulekha.com/${encodeURIComponent(city || "india")}/${encodeURIComponent(bizName.replace(/\s+/g, "-"))}`,
        searchUrl: `https://www.sulekha.com/search?q=${encodeURIComponent(bizName)}`,
        icon:     "🔍",
        priority: "high",
      },
      {
        id:       "indiamart",
        name:     "IndiaMart",
        url:      `https://dir.indiamart.com/search.mp?ss=${encodeURIComponent(bizName)}`,
        searchUrl: `https://dir.indiamart.com/search.mp?ss=${encodeURIComponent(bizName)}`,
        icon:     "🏭",
        priority: "medium",
      },
      {
        id:       "google_maps",
        name:     "Google Maps",
        url:      `https://maps.google.com/?q=${encodeURIComponent(bizName + (city ? " " + city : ""))}`,
        searchUrl: `https://www.google.com/search?q=${encodeURIComponent(bizName + " " + city + " google maps")}`,
        icon:     "🗺️",
        priority: "high",
      },
      {
        id:       "yelp",
        name:     "Yelp",
        searchUrl: `https://www.yelp.com/search?find_desc=${encodeURIComponent(bizName)}&find_loc=${encodeURIComponent(city)}`,
        icon:     "⭐",
        priority: "medium",
      },
      {
        id:       "facebook",
        name:     "Facebook Business",
        searchUrl: `https://www.facebook.com/search/pages/?q=${encodeURIComponent(bizName)}`,
        icon:     "👥",
        priority: "medium",
      },
    ];

    const results = [];

    for (const dir of DIRECTORIES) {
      let status = "unknown";
      let napConsistent = null;
      let foundName = null;
      let foundPhone = null;
      let listingUrl = null;

      try {
        const searchRes = await fetch(dir.searchUrl, {
          signal: AbortSignal.timeout(10000),
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
            "Accept":     "text/html",
            "Accept-Language": "en-IN,en;q=0.9",
          },
          redirect: "follow",
        });

        if (searchRes.ok) {
          const html = await searchRes.text();
          // Check if business name appears in results
          const nameRegex = new RegExp(bizName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").split(" ").slice(0, 2).join("\\s*"), "i");
          const hasListing = nameRegex.test(html);

          if (hasListing) {
            status = "listed";
            foundName = bizName;

            // NAP check — look for phone number if provided
            if (phone) {
              const phoneDigits = phone.replace(/\D/g, "").slice(-10);
              napConsistent = html.includes(phoneDigits);
            }

            // Extract first matching URL
            const urlMatch = html.match(new RegExp(`href=["']((?:[^"']*?)(?:${encodeURIComponent(bizName.split(" ")[0]).toLowerCase()}|${bizName.split(" ")[0].toLowerCase()})[^"']*)["']`, "i"));
            if (urlMatch) listingUrl = urlMatch[1];
          } else {
            status = "not_found";
          }
        } else {
          status = "check_manually";
        }
      } catch {
        status = "check_manually";
      }

      results.push({
        directoryId:   dir.id,
        directoryName: dir.name,
        icon:          dir.icon,
        priority:      dir.priority,
        status,
        napConsistent,
        listingUrl:    listingUrl || dir.url,
        searchUrl:     dir.searchUrl,
        foundName,
        foundPhone,
        checkedAt:     new Date().toISOString(),
      });

      await new Promise(r => setTimeout(r, 600));
    }

    const summary = {
      totalChecked:    results.length,
      listed:          results.filter(r => r.status === "listed").length,
      notFound:        results.filter(r => r.status === "not_found").length,
      checkManually:   results.filter(r => r.status === "check_manually").length,
      napIssues:       results.filter(r => r.napConsistent === false).length,
      coverageScore:   Math.round((results.filter(r => r.status === "listed").length / results.length) * 100),
      checkedAt:       new Date().toISOString(),
    };

    await db.collection("local_citations").doc(clientId).set({
      clientId, businessName: bizName, city, results, summary, updatedAt: new Date().toISOString(),
    });
    return res.json({ success: true, summary, results });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// GET /:clientId/local-citations/results extracted verbatim to ./modules/results
// (Sprint 1, M6.4) and mounted near the top of this file. Behaviour and path
// are unchanged.

module.exports = router;
