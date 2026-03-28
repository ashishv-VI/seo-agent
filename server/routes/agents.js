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
const { calculateScore, saveScoreHistory, getLatestScore, getScoreHistory, generateForecast } = require("../utils/scoreCalculator");
const { getState } = require("../shared-state/stateManager");
const { translateAlert, SEVERITY_LABELS } = require("../utils/alertTranslator");

// ── Helper: check client ownership ────────────────
async function getClientDoc(clientId, uid) {
  const doc = await db.collection("clients").doc(clientId).get();
  if (!doc.exists)                   throw { code: 404, message: "Client not found" };
  if (doc.data().ownerId !== uid)    throw { code: 403, message: "Access denied" };
  return doc;
}

// ── Generic agent runner ───────────────────────────
async function runAgent(clientId, agentId, runFn, keys, res) {
  const { canRun, reason } = await canRunAgent(clientId, agentId);
  if (!canRun) return res.status(400).json({ error: reason });

  await db.collection("clients").doc(clientId).update({ [`agents.${agentId}`]: "running" });

  try {
    const result = await runFn(clientId, keys);
    if (!result.success) {
      const failure = await handleFailure(clientId, agentId, result.error);
      return res.status(400).json({ error: result.error, ...failure });
    }
    await db.collection("clients").doc(clientId).update({ [`agents.${agentId}`]: "complete" });
    return res.json(result);
  } catch (err) {
    await handleFailure(clientId, agentId, err.message);
    return res.status(500).json({ error: err.message });
  }
}

// ── POST Run Full Pipeline (fire-and-forget) ───────
router.post("/:clientId/run-pipeline", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const keys = await getUserKeys(req.uid);

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
    runFullPipeline(req.params.clientId, keys).catch(err => {
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
    return await runAgent(req.params.clientId, "A8", (id, k) => runA8(id, k), keys, res);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── Run A9: Generate Report ────────────────────────
router.post("/:clientId/A9/report", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const keys      = await getUserKeys(req.uid);
    const gscToken  = req.body.gscToken || null;
    const { canRun, reason } = await canRunAgent(req.params.clientId, "A9");
    if (!canRun) return res.status(400).json({ error: reason });

    await db.collection("clients").doc(req.params.clientId).update({ "agents.A9": "running" });
    const result = await generateReport(req.params.clientId, keys, gscToken);
    await db.collection("clients").doc(req.params.clientId).update({ "agents.A9": result.success ? "complete" : "failed" });
    return res.json(result);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── Run A9: Check Alerts ───────────────────────────
router.post("/:clientId/A9/alerts", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const keys   = await getUserKeys(req.uid);
    const result = await checkAlerts(req.params.clientId, keys);
    return res.json(result);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── GET Alerts for client ──────────────────────────
router.get("/:clientId/alerts", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const snap = await db.collection("alerts")
      .where("clientId", "==", req.params.clientId)
      .get();
    const alerts = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?._seconds || 0) - (a.createdAt?._seconds || 0))
      .slice(0, 50);
    return res.json({ alerts });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

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
router.post("/:clientId/alerts/:alertId/resolve", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    await db.collection("alerts").doc(req.params.alertId).update({
      resolved:   true,
      resolvedAt: FieldValue.serverTimestamp(),
    });
    return res.json({ message: "Alert resolved" });
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

// ── AI Generate Fix for a specific issue ──────────
router.post("/:clientId/generate-fix", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const keys    = await getUserKeys(req.uid);
    const { callLLM, parseJSON } = require("../utils/llm");
    const { getState } = require("../shared-state/stateManager");

    const { type, detail, current, context } = req.body;
    const brief = context || await getState(req.params.clientId, "A1_brief") || {};

    const prompt = `You are a senior SEO consultant. Generate an exact, ready-to-implement fix for this issue.

Business: ${brief.businessName || "N/A"}
Website: ${brief.websiteUrl || "N/A"}
Services: ${(brief.services || []).join(", ") || "N/A"}
Issue Type: ${type}
Issue: ${detail}
Current Value: ${current || "N/A"}

Return ONLY valid JSON (no markdown):
{
  "fix": "concise exact fix instruction (1-2 sentences)",
  "explanation": "why this fix improves SEO",
  "implementation": "step-by-step how to apply (2-4 steps)",
  "codeSnippet": "ready-to-paste HTML/code or null"
}`;

    const response = await callLLM(prompt, keys, { maxTokens: 600 });
    const result   = parseJSON(response);
    return res.json({
      success:        true,
      fix:            result.fix            || detail,
      explanation:    result.explanation    || "",
      implementation: result.implementation || "",
      codeSnippet:    result.codeSnippet    || null,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Fix generation failed" });
  }
});

// ── Get rank history for client ────────────────────
router.get("/:clientId/rank-history", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    // No composite index — single where, sort client-side
    const snap = await db.collection("rank_history")
      .where("clientId", "==", req.params.clientId)
      .limit(30)
      .get();
    const history = snap.docs.map(d => d.data()).sort((a,b)=>(b.date||"").localeCompare(a.date||"")).slice(0,12);
    return res.json({ history });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────
// TASK QUEUE ENDPOINTS
// ────────────────────────────────────────────────────

// GET all tasks sorted by priority
router.get("/:clientId/tasks", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const tasks = await getTasks(req.params.clientId);
    return res.json({ tasks, total: tasks.length });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// GET top 5 pending tasks
router.get("/:clientId/tasks/today", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const tasks = await getTopTasks(req.params.clientId, 5);
    return res.json({ tasks });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// PUT update task status
router.put("/:clientId/tasks/:taskId", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { status, completedBy, notes } = req.body;
    const updates = { status };
    if (status === "complete") {
      updates.completedAt = FieldValue.serverTimestamp();
      updates.completedBy = completedBy || req.uid;
    }
    if (notes) updates.notes = notes;
    await updateTask(req.params.clientId, req.params.taskId, updates);
    return res.json({ message: "Task updated" });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// POST mark task as executed (quick-win auto-fix record)
router.post("/:clientId/tasks/:taskId/execute", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { outcome } = req.body;
    await updateTask(req.params.clientId, req.params.taskId, {
      status:      "complete",
      completedAt: FieldValue.serverTimestamp(),
      completedBy: req.uid,
      outcome:     outcome || "Manually resolved",
    });
    return res.json({ message: "Task marked as executed" });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

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
router.get("/:clientId/alerts", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    // No composite index — single where clause, filter+sort client-side
    const snap = await db.collection("alerts")
      .where("clientId", "==", req.params.clientId)
      .limit(60)
      .get();

    const alerts = snap.docs
      .map(d => {
        const a = d.data();
        const translated = translateAlert(a.message, a.type);
        return {
          id: d.id,
          ...a,
          ...translated,
          severityLabel: SEVERITY_LABELS[translated.severity] || SEVERITY_LABELS.info,
        };
      })
      .sort((a, b) => ((b.createdAt?._seconds || b.createdAt?.seconds || 0) - (a.createdAt?._seconds || a.createdAt?.seconds || 0)));

    return res.json({ alerts });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

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
router.get("/:clientId/rankings", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    // No composite index — single where, sort client-side
    const snap = await db.collection("rank_history")
      .where("clientId", "==", req.params.clientId)
      .limit(30)
      .get();
    if (snap.empty) return res.json({ rankings: [], source: null });
    const sorted = snap.docs.map(d => d.data()).sort((a, b) => (b.date||"").localeCompare(a.date||""));
    return res.json(sorted[0]);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

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

    // Build per-page issue map from audit issues
    const pageMap = {};
    const allIssues = [
      ...(audit.issues?.p1||[]).map(i => ({ ...i, severity:"critical" })),
      ...(audit.issues?.p2||[]).map(i => ({ ...i, severity:"warning" })),
      ...(audit.issues?.p3||[]).map(i => ({ ...i, severity:"info" })),
    ];

    // Use pages crawled from checks, fallback to homepage
    const crawledPages = audit.checks?.pages || [{ url: audit.checks?.finalUrl || "", title: audit.checks?.serpPreview?.title || "", issues: [] }];

    // Map keywords to pages
    const kwMap = {};
    (keywords?.keywordMap || []).forEach(k => {
      if (k.suggestedPage) {
        if (!kwMap[k.suggestedPage]) kwMap[k.suggestedPage] = [];
        kwMap[k.suggestedPage].push(k);
      }
    });

    // Score each page
    const pages = crawledPages.slice(0, 20).map(page => {
      const pageIssues = allIssues.filter(i => i.page === page.url || !i.page);
      const p1Count = pageIssues.filter(i=>i.severity==="critical").length;
      const p2Count = pageIssues.filter(i=>i.severity==="warning").length;
      const pageScore = Math.max(0, 100 - (p1Count * 20) - (p2Count * 8));
      const urlPath = page.url ? new URL(page.url).pathname : "/";
      return {
        url:          page.url,
        path:         urlPath,
        title:        page.title || "(No title)",
        score:        pageScore,
        issues:       pageIssues.slice(0, 5),
        issueCount:   pageIssues.length,
        targetKeywords: kwMap[urlPath] || [],
        hasTitle:     !!page.title,
        hasMeta:      !!page.meta,
        hasH1:        !!page.h1,
        statusCode:   page.statusCode || 200,
      };
    });

    return res.json({ pages: pages.sort((a, b) => a.score - b.score) });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

module.exports = router;
