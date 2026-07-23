/**
 * Executive Command Center route (M9.6).
 *
 * One aggregated read that composes the snapshots other engines already produced
 * (score, forecast, audit, LLM Visibility, Answer Optimization, Task Center,
 * alerts, pipeline) into an executive rollup + deterministic insights via the
 * pure buildExecutiveSummary() engine. Mounted by agents.js at the same base so
 * the path is /api/agents/:clientId/executive-dashboard.
 *
 *   GET /:clientId/executive-dashboard
 *
 * Reuses verifyToken + getClientDoc + getState + score/task helpers. No LLM, no
 * recompute of any score or recommendation — it reads existing snapshots.
 */
const express       = require("express");
const router        = express.Router();
const { db }        = require("../../config/firebase");
const { verifyToken } = require("../../middleware/auth");
const { getState }  = require("../../shared-state/stateManager");
const { getClientDoc } = require("../shared/clientOwnership");
const { getLatestScore, getScoreHistory, generateForecast } = require("../../utils/scoreCalculator");
const { getTopTasks } = require("../../utils/taskQueue");
const { buildExecutiveSummary } = require("../../utils/executiveSummary");

router.get("/:clientId/executive-dashboard", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const clientId = req.params.clientId;

    // One parallel gather over existing sources (no duplicate queries).
    const [
      scoreObj, scoreHistory, topTasks, audit, keywords, clientDoc,
      llmVisDoc, answerOptDoc, taskCenterDoc, alertsSnap, reportState,
    ] = await Promise.all([
      getLatestScore(clientId).catch(() => null),
      getScoreHistory(clientId, 12).catch(() => []),
      getTopTasks(clientId, 5).catch(() => []),
      getState(clientId, "A2_audit").catch(() => null),
      getState(clientId, "A3_keywords").catch(() => null),
      db.collection("clients").doc(clientId).get().catch(() => null),
      db.collection("llm_visibility").doc(clientId).get().catch(() => null),
      db.collection("answer_optimization").doc(clientId).get().catch(() => null),
      db.collection("task_center").doc(clientId).get().catch(() => null),
      db.collection("alerts").where("clientId", "==", clientId).limit(50).get().catch(() => null),
      getState(clientId, "A9_report").catch(() => null),
    ]);

    const client = clientDoc?.exists ? clientDoc.data() : {};
    const llmVis = llmVisDoc?.exists ? llmVisDoc.data() : null;
    const answerOpt = answerOptDoc?.exists ? answerOptDoc.data() : null;
    const taskCenter = taskCenterDoc?.exists ? (taskCenterDoc.data().summary || null) : null;

    const alerts = (alertsSnap?.docs || [])
      .map(d => d.data())
      .filter(a => !a.resolved)
      .slice(0, 20);

    const forecast = generateForecast(topTasks, scoreObj?.overall || 0);

    // Compose LLM Visibility + Answer Optimization into the shapes the engine expects.
    const llmVisibility = llmVis ? {
      visibilityScore: llmVis.visibilityScore, grade: llmVis.grade,
      trend: llmVis.trend, topRecommendation: llmVis.recommendations?.[0]?.action || null,
    } : null;
    const answerOptimization = answerOpt ? {
      optimizationScore: answerOpt.optimizationScore, grade: answerOpt.grade,
      criticalCount: answerOpt.criticalCount, expectedVisibilityGain: answerOpt.expectedVisibilityGain,
      quickWins: answerOpt.quickWins, topOpportunities: (answerOpt.opportunities || []).slice(0, 3).map(o => ({ title: o.title, priority: o.priority })),
    } : null;

    const summary = buildExecutiveSummary({
      score: scoreObj, forecast, audit,
      keywords, llmVisibility, answerOptimization,
      taskCenter, alerts, pipeline: { pipelineStatus: client.pipelineStatus },
      scoreHistory,
    });

    // Executive dashboard payload — summary + light context blocks for the UI.
    return res.json({
      ...summary,
      context: {
        business: { name: client.name, website: client.website },
        pipelineStatus: client.pipelineStatus || "idle",
        score: scoreObj || null,
        scoreHistory,
        forecast,
        topTasks,
        taskCenter,
        llmVisibility,
        answerOptimization,
        reportReady: !!reportState,
        notificationsPreview: alerts.slice(0, 5).map(a => ({ title: a.title || a.message || a.type, at: a.createdAt })),
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

module.exports = router;
