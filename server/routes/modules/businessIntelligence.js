/**
 * Business Intelligence routes (M10.3).
 *
 * Composes existing metrics into business-level KPIs/trends/correlations via the
 * pure buildBusinessIntelligence() engine, reusing the M9.6 executive summary as
 * an input (no duplicated health calculations). Mounted by agents.js at the same
 * base so paths are /api/agents/:clientId/business-intelligence*.
 *
 *   GET /:clientId/business-intelligence          — current BI snapshot (live)
 *   GET /:clientId/business-intelligence/history   — score/portal history series
 *   GET /:clientId/business-intelligence/trends     — trend deltas only (light)
 *
 * Reuses verifyToken + getClientDoc + getState + score/task helpers + the M9.6
 * executive engine. No LLM, no writes, no new indexes (single-doc + existing
 * indexed queries only).
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
const { buildBusinessIntelligence } = require("../../utils/businessIntelligence");

// Shared gather — the analytics sources, fetched once.
async function gather(clientId) {
  const [
    scoreObj, scoreHistory, topTasks, audit, keywords, clientDoc,
    llmVisDoc, answerOptDoc, taskCenterDoc, alertsSnap, pmSnap, convSnap,
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
    db.collection("pipeline_metrics").where("clientId", "==", clientId).limit(30).get().catch(() => null),
    db.collection("conversions").where("clientId", "==", clientId).limit(200).get().catch(() => null),
  ]);

  const client = clientDoc?.exists ? clientDoc.data() : {};
  const llmVis = llmVisDoc?.exists ? llmVisDoc.data() : null;
  const answerOpt = answerOptDoc?.exists ? answerOptDoc.data() : null;
  const taskCenter = taskCenterDoc?.exists ? (taskCenterDoc.data().summary || null) : null;
  const alerts = (alertsSnap?.docs || []).map(d => d.data()).filter(a => !a.resolved).slice(0, 20);
  const pipelineMetrics = (pmSnap?.docs || []).map(d => d.data());
  const conversions = (convSnap?.docs || []).map(d => d.data());
  const forecast = generateForecast(topTasks, scoreObj?.overall || 0);

  const llmVisibility = llmVis ? {
    visibilityScore: llmVis.visibilityScore, grade: llmVis.grade, trend: llmVis.trend,
  } : null;
  const answerOptimization = answerOpt ? {
    optimizationScore: answerOpt.optimizationScore, criticalCount: answerOpt.criticalCount,
    expectedVisibilityGain: answerOpt.expectedVisibilityGain, quickWins: answerOpt.quickWins,
  } : null;

  // Reuse M9.6 executive engine for the component healths (input, not re-derived).
  const executive = buildExecutiveSummary({
    score: scoreObj, forecast, audit, keywords, llmVisibility, answerOptimization,
    taskCenter, alerts, pipeline: { pipelineStatus: client.pipelineStatus }, scoreHistory,
  });

  return {
    executive, scoreHistory, rankHistory: [], llmVisibility, answerOptimization,
    taskCenter, pipelineMetrics, conversions, forecast, score: scoreObj,
    _client: client,
  };
}

// GET main BI snapshot.
router.get("/:clientId/business-intelligence", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const g = await gather(req.params.clientId);
    const bi = buildBusinessIntelligence(g);
    return res.json({ ...bi, generatedAt: new Date().toISOString() });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// GET history — score history series + portal snapshots (already-collected).
router.get("/:clientId/business-intelligence/history", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const clientId = req.params.clientId;
    const [scoreHistory, portalSnap] = await Promise.all([
      getScoreHistory(clientId, 24).catch(() => []),
      db.collection("portal_snapshots").where("clientId", "==", clientId).limit(24).get().catch(() => null),
    ]);
    const snapshots = (portalSnap?.docs || [])
      .map(d => d.data())
      .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
    return res.json({
      scoreHistory: scoreHistory.map(s => ({ overall: s.overall, at: s.capturedAt || s.date || null })),
      snapshots: snapshots.map(s => ({ date: s.date, seoScore: s.seoScore, totalKeywords: s.totalKeywords, crawledPages: s.crawledPages })),
    });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// GET trends — lightweight trend deltas only.
router.get("/:clientId/business-intelligence/trends", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const g = await gather(req.params.clientId);
    const bi = buildBusinessIntelligence(g);
    return res.json({ trends: bi.trends, correlations: bi.correlations, authorityTrend: bi.authorityTrend });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

module.exports = router;
