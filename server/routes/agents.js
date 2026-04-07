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
    const { googleToken } = req.body;

    // ── Gate: require at least one LLM key before starting ────────────────
    // A3, A4, A5, A6, A8 all call callLLM() — without a key they silently
    // fail but the pipeline still shows "complete" with empty data.
    if (!keys.groq && !keys.gemini) {
      return res.status(400).json({
        error: "No LLM key configured. Add a Groq or Gemini API key in Settings before running the pipeline.",
        missingKey: "llm",
      });
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
    const { googleToken } = req.body;
    return await runAgent(req.params.clientId, "A8", (id, k) => runA8(id, k, googleToken), keys, res);
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

// ── A11 Link Builder ───────────────────────────────
router.post("/:clientId/A11/run", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const keys = await getUserKeys(req.uid);
    const { runA11 } = require("../agents/A11_linkBuilder");
    return runAgent(req.params.clientId, "A11", runA11, keys, res);
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

    // Global issue list (for homepage entry)
    const allIssues = [
      ...(audit.issues?.p1||[]).map(i => ({ ...i, severity:"critical" })),
      ...(audit.issues?.p2||[]).map(i => ({ ...i, severity:"warning" })),
      ...(audit.issues?.p3||[]).map(i => ({ ...i, severity:"info"     })),
    ];

    // ── Use rich pageAudits from A2 (real per-page data: title, meta, h1, wordCount)
    const pageAudits = audit.checks?.pageAudits || [];

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

// ────────────────────────────────────────────────────
// BULK ACTIONS
// ────────────────────────────────────────────────────

// POST bulk task action: complete-all | generate-fixes
router.post("/:clientId/tasks/bulk", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const clientId = req.params.clientId;
    const { action } = req.body;

    if (action === "complete-all") {
      const tasks   = await getTasks(clientId);
      const pending = tasks.filter(t => t.status === "pending");
      for (const t of pending) {
        await updateTask(clientId, t.id, {
          status: "complete",
          completedAt: FieldValue.serverTimestamp(),
          completedBy: req.uid,
          outcome: "Bulk marked complete",
        });
      }
      return res.json({ message: `Marked ${pending.length} tasks as complete`, count: pending.length });
    }

    if (action === "generate-fixes") {
      const { runA12 } = require("../agents/A12_autoExec");
      const keys = await getUserKeys(req.uid);
      const result = await runA12(clientId, keys);
      return res.json(result);
    }

    if (action === "clear-completed") {
      const tasks     = await getTasks(clientId);
      const completed = tasks.filter(t => t.status === "complete");
      for (const t of completed) {
        await db.collection("task_queue").doc(clientId).collection("tasks").doc(t.id).delete();
      }
      return res.json({ message: `Cleared ${completed.length} completed tasks`, count: completed.length });
    }

    return res.status(400).json({ error: "Unknown action. Use: complete-all | generate-fixes | clear-completed" });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────
// BEFORE/AFTER RANKING COMPARISON
// ────────────────────────────────────────────────────

// GET compare two most recent rank history snapshots
router.get("/:clientId/rank-comparison", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const clientId = req.params.clientId;
    const snap = await db.collection("rank_history")
      .where("clientId", "==", clientId).limit(30).get();
    if (snap.empty) return res.json({ comparison: null, message: "No ranking data yet — run pipeline" });

    const sorted = snap.docs.map(d => d.data()).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    if (sorted.length < 2) return res.json({ comparison: null, message: "Need at least 2 ranking snapshots (run pipeline twice)" });

    const latest   = sorted[0];
    const previous = sorted[1];

    const prevMap = {};
    (previous.keywords || []).forEach(k => { prevMap[k.keyword] = k.position; });

    const comparison = (latest.keywords || []).map(k => {
      const prev   = prevMap[k.keyword] || null;
      const curr   = k.position;
      const change = (prev && curr) ? prev - curr : null; // positive = moved up (improved)
      return {
        keyword:  k.keyword,
        current:  curr,
        previous: prev,
        change,
        trend:    change === null ? "new" : change > 0 ? "up" : change < 0 ? "down" : "stable",
        category: k.category,
      };
    }).sort((a, b) => (b.change || 0) - (a.change || 0));

    const gained = comparison.filter(k => k.trend === "up").length;
    const lost   = comparison.filter(k => k.trend === "down").length;

    return res.json({
      comparison,
      latestDate:   latest.date,
      previousDate: previous.date,
      summary: { gained, lost, stable: comparison.length - gained - lost, total: comparison.length },
      healthScoreChange: (latest.healthScore || 0) - (previous.healthScore || 0),
    });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────
// LEARNING SYSTEM — track fix → outcome
// ────────────────────────────────────────────────────

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

// ────────────────────────────────────────────────────
// NOTIFICATIONS
// ────────────────────────────────────────────────────

// GET unread notifications for this user
router.get("/notifications", verifyToken, async (req, res) => {
  try {
    // Single where clause only — no composite index needed; filter client-side
    const snap = await db.collection("notifications")
      .where("ownerId", "==", req.uid).limit(40).get();
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(n => !n.read)
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
      .slice(0, 20);
    return res.json({ notifications: items, unread: items.length });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// POST mark notification as read
router.post("/notifications/:notifId/read", verifyToken, async (req, res) => {
  try {
    await db.collection("notifications").doc(req.params.notifId).update({ read: true });
    return res.json({ message: "Marked as read" });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────
// INTENT MATCH ENGINE
// ────────────────────────────────────────────────────

// GET intent mismatch analysis: compares keyword intent vs page content signals
router.get("/:clientId/intent-analysis", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const clientId = req.params.clientId;
    const [keywords, audit] = await Promise.all([
      getState(clientId, "A3_keywords"),
      getState(clientId, "A2_audit"),
    ]);
    if (!keywords) return res.json({ mismatches: [] });

    const pageSignals = {};
    const allIssues = [
      ...(audit?.issues?.p1 || []),
      ...(audit?.issues?.p2 || []),
      ...(audit?.issues?.p3 || []),
    ];
    allIssues.forEach(i => {
      if (i.page) {
        if (!pageSignals[i.page]) pageSignals[i.page] = [];
        pageSignals[i.page].push(i.type);
      }
    });

    // Detect intent mismatches: transactional keyword → page lacks CTA signals
    const mismatches = [];
    const kwMap = keywords.keywordMap || [];
    const intentRules = {
      transactional: ["missing_cta", "thin_content", "missing_schema"],
      informational: ["missing_h1", "thin_content"],
      navigational:  ["redirect_chain", "missing_canonical"],
      commercial:    ["missing_meta_desc", "missing_schema"],
    };

    for (const kw of kwMap) {
      if (!kw.suggestedPage || !kw.intent) continue;
      const pageIssues = pageSignals[kw.suggestedPage] || [];
      const conflictRules = intentRules[kw.intent] || [];
      const conflicts = conflictRules.filter(r => pageIssues.includes(r));
      if (conflicts.length > 0 || (kw.intent === "transactional" && (kw.priority === "high"))) {
        const severity = kw.priority === "high" ? "critical" : "warning";
        mismatches.push({
          keyword:      kw.keyword,
          intent:       kw.intent,
          page:         kw.suggestedPage,
          conflicts,
          severity,
          fix: kw.intent === "transactional"
            ? `Add clear CTA, pricing, and conversion elements to ${kw.suggestedPage}`
            : `Align content structure on ${kw.suggestedPage} to match ${kw.intent} user intent`,
        });
      }
    }

    return res.json({ mismatches, total: mismatches.length });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────
// CONTENT BRIEFS (from A5 data)
// ────────────────────────────────────────────────────

// GET structured content briefs
router.get("/:clientId/content-briefs", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const clientId = req.params.clientId;
    const [content, keywords, competitor] = await Promise.all([
      getState(clientId, "A5_content"),
      getState(clientId, "A3_keywords"),
      getState(clientId, "A4_competitor"),
    ]);

    if (!content) return res.json({ briefs: [] });

    // Extract content briefs from A5 data
    const gaps    = keywords?.gaps || [];
    const compGap = competitor?.analysis?.contentGaps || [];
    const briefs  = [
      ...(content?.contentBriefs || []),
      ...gaps.slice(0, 3).map(g => ({
        title:       g.keyword || g.topic,
        type:        "new_page",
        priority:    "high",
        reason:      g.reason || "Content gap identified",
        targetKws:   [g.keyword],
        wordCount:   800,
        sections:    ["Introduction", "Main content", "FAQ", "Conclusion"],
      })),
      ...compGap.slice(0, 3).map(g => ({
        title:       g.topic,
        type:        "competitor_gap",
        priority:    "medium",
        reason:      `Competitor ranking for "${g.topic}" — you're not`,
        targetKws:   [],
        wordCount:   1200,
        sections:    ["Introduction", g.topic, "How it works", "Why choose us", "FAQ"],
      })),
    ];

    return res.json({ briefs });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

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

// GET: Get content drafts for a client
router.get("/:clientId/content-drafts", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { getContentDrafts } = require("../agents/A14_contentAutopilot");
    const drafts = await getContentDrafts(req.params.clientId);
    return res.json({ drafts, total: drafts.length });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// POST: Mark a content draft as published
router.post("/:clientId/content-drafts/:draftId/publish", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { markDraftPublished } = require("../agents/A14_contentAutopilot");
    await markDraftPublished(req.params.draftId, req.body.wpPostId || null);
    return res.json({ message: "Draft marked as published" });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

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
router.get("/:clientId/memory", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { getMemory } = require("../utils/memory");
    const memory = await getMemory(req.params.clientId);
    return res.json({ memory });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────
// LEVEL 4 — ROI: ROI Tracker
// ────────────────────────────────────────────────────

// GET: Get full ROI report for a client
router.get("/:clientId/roi", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { calculateROI, saveROISnapshot } = require("../utils/roiTracker");
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
    const { getROIHistory } = require("../utils/roiTracker");
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
    const { updateROISettings } = require("../utils/roiTracker");
    await updateROISettings(req.params.clientId, req.body);
    return res.json({ message: "ROI settings updated" });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

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
router.get("/:clientId/cwv-history", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const snap = await db.collection("cwv_history")
      .where("clientId", "==", req.params.clientId)
      .orderBy("createdAt", "asc")
      .limit(24)
      .get();
    const history = snap.docs.map(d => {
      const data = d.data();
      return { id: d.id, ...data, createdAt: data.createdAt?.toDate?.()?.toISOString() };
    });
    return res.json({ history, total: history.length });
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
router.get("/:clientId/A20/impact-report", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { buildImpactReport } = require("../agents/A20_impactReport");
    const report = await buildImpactReport(req.params.clientId);
    return res.json({ report });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────
// SPRINT 3 — CMO Agent (autonomous decision layer)
// ────────────────────────────────────────────────────

router.post("/:clientId/cmo/run", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { runCMO } = require("../agents/CMO_agent");
    const keys = await getUserKeys(req.uid);
    const result = await runCMO(req.params.clientId, keys);
    return res.json(result);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

router.get("/:clientId/cmo/decision", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const data = await getState(req.params.clientId, "CMO_decision");
    return res.json(data || {});
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── GET CMO queue (scheduled next actions) ─────────
router.get("/:clientId/cmo/queue", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const snap = await db.collection("cmo_queue")
      .where("clientId", "==", req.params.clientId)
      .where("status", "==", "pending")
      .limit(5)
      .get();
    const queue = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return res.json({ queue });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

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

module.exports = router;
