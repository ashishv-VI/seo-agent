/**
 * publicApi.js — Versioned developer API (M10.6). Mounted at /api/v1.
 *
 * Authenticated by API key (apiAuth) — which sets req.uid = key owner — so every
 * handler REUSES the same getClientDoc(clientId, req.uid) ownership check as the
 * app. Data is produced by the SAME engines/snapshots the internal modules use
 * (buildBusinessIntelligence, buildExecutiveSummary, buildTaskCenter, calculate*,
 * askCopilot) — no duplicated business logic. Scopes enforce least privilege.
 */
const express = require("express");
const router  = express.Router();
const { db }  = require("../../config/firebase");
const { apiAuth, requireScope } = require("../../middleware/apiAuth");
const { getClientDoc } = require("../shared/clientOwnership");
const { getUserKeys } = require("../../utils/getUserKeys");
const { getState } = require("../../shared-state/stateManager");
const { getLatestScore, getScoreHistory, generateForecast } = require("../../utils/scoreCalculator");
const { getTopTasks, getTasks } = require("../../utils/taskQueue");
const { buildExecutiveSummary } = require("../../utils/executiveSummary");
const { buildBusinessIntelligence } = require("../../utils/businessIntelligence");
const { buildTaskCenter } = require("../../utils/taskCenter");
const { buildCopilotContext } = require("../../utils/copilotContext");
const { askCopilot } = require("../../utils/copilot");
const { runFullPipeline } = require("../../agents/A0_orchestrator");

// All v1 routes require a valid API key.
router.use(apiAuth);

// Small helper: ownership-checked client access, reused everywhere.
async function ownClient(req) { return getClientDoc(req.params.id || req.params.clientId, req.uid); }

// ── Clients ──
router.get("/clients", requireScope("clients:read"), async (req, res) => {
  try {
    const snap = await db.collection("clients").where("ownerId", "==", req.uid).limit(200).get();
    const clients = snap.docs.map(d => ({ id: d.id, name: d.data().name, website: d.data().website, pipelineStatus: d.data().pipelineStatus || "idle", seoScore: d.data().seoScore ?? null }));
    return res.json({ clients });
  } catch (e) { return res.status(e.code || 500).json({ error: e.message }); }
});
router.get("/clients/:id", requireScope("clients:read"), async (req, res) => {
  try {
    const doc = await ownClient(req);
    const d = doc.data();
    return res.json({ id: doc.id, name: d.name, website: d.website, industry: d.industry || null, pipelineStatus: d.pipelineStatus || "idle", seoScore: d.seoScore ?? null });
  } catch (e) { return res.status(e.code || 500).json({ error: e.message }); }
});
router.post("/clients", requireScope("clients:write"), async (req, res) => {
  try {
    const { name, website, industry } = req.body || {};
    if (!name || !website) return res.status(400).json({ error: "name and website are required." });
    const ref = db.collection("clients").doc();
    await ref.set({ name: String(name).slice(0, 120), website: String(website).slice(0, 300), industry: industry || null,
      ownerId: req.uid, pipelineStatus: "idle", createdAt: new Date().toISOString(), agents: {} });
    return res.json({ id: ref.id, created: true });
  } catch (e) { return res.status(e.code || 500).json({ error: e.message }); }
});

// ── Pipeline ──
router.post("/pipeline/run", requireScope("pipeline:run"), async (req, res) => {
  try {
    const clientId = req.body?.clientId;
    if (!clientId) return res.status(400).json({ error: "clientId is required." });
    req.params.id = clientId; await ownClient(req);
    const keys = await getUserKeys(req.uid);
    const hasLLM = keys.groq || keys.gemini || keys.openrouter || process.env.OPENROUTER_API_KEY;
    if (!hasLLM) return res.status(400).json({ error: "No LLM key configured for this account." });
    await db.collection("clients").doc(clientId).update({ pipelineStatus: "running", pipelineStartedAt: new Date().toISOString(), pipelineError: null });
    runFullPipeline(clientId, keys, null).catch(err => console.error("[v1 pipeline] bg error:", err.message));
    return res.json({ started: true, clientId });
  } catch (e) { return res.status(e.code || 500).json({ error: e.message }); }
});

// ── Read snapshots (reuse persisted docs the internal modules write) ──
function snapshotRoute(path, scope, coll) {
  router.get(path, requireScope(scope), async (req, res) => {
    try {
      req.params.id = req.query.clientId; await ownClient(req);
      const doc = await db.collection(coll).doc(req.query.clientId).get().catch(() => null);
      return res.json(doc?.exists ? doc.data() : { notComputed: true });
    } catch (e) { return res.status(e.code || 500).json({ error: e.message }); }
  });
}
snapshotRoute("/llm-visibility",      "visibility:read",   "llm_visibility");
snapshotRoute("/answer-optimization", "optimization:read", "answer_optimization");

// ── Task Center (live merge via engine) ──
router.get("/task-center", requireScope("tasks:read"), async (req, res) => {
  try {
    req.params.id = req.query.clientId; await ownClient(req);
    const clientId = req.query.clientId;
    const [taskQueue, apprSnap, aoDoc] = await Promise.all([
      getTasks(clientId).catch(() => []),
      db.collection("approval_queue").where("clientId", "==", clientId).limit(100).get().catch(() => null),
      db.collection("answer_optimization").doc(clientId).get().catch(() => null),
    ]);
    const approvals = (apprSnap?.docs || []).map(d => ({ id: d.id, ...d.data() }));
    const opportunities = (aoDoc?.exists && Array.isArray(aoDoc.data().opportunities)) ? aoDoc.data().opportunities : [];
    const result = buildTaskCenter({ taskQueue, approvals, opportunities }, {}, new Date().toISOString());
    return res.json({ summary: result.summary, tasks: result.tasks.slice(0, 100) });
  } catch (e) { return res.status(e.code || 500).json({ error: e.message }); }
});

// ── Dashboard / Executive + Business Intelligence (reuse engines) ──
async function gatherExec(clientId, clientData) {
  const [scoreObj, scoreHistory, topTasks, audit, keywords, llmVisDoc, answerOptDoc, taskCenterDoc, alertsSnap] = await Promise.all([
    getLatestScore(clientId).catch(() => null), getScoreHistory(clientId, 12).catch(() => []),
    getTopTasks(clientId, 5).catch(() => []), getState(clientId, "A2_audit").catch(() => null),
    getState(clientId, "A3_keywords").catch(() => null),
    db.collection("llm_visibility").doc(clientId).get().catch(() => null),
    db.collection("answer_optimization").doc(clientId).get().catch(() => null),
    db.collection("task_center").doc(clientId).get().catch(() => null),
    db.collection("alerts").where("clientId", "==", clientId).limit(50).get().catch(() => null),
  ]);
  const llmVis = llmVisDoc?.exists ? llmVisDoc.data() : null;
  const answerOpt = answerOptDoc?.exists ? answerOptDoc.data() : null;
  const taskCenter = taskCenterDoc?.exists ? (taskCenterDoc.data().summary || null) : null;
  const alerts = (alertsSnap?.docs || []).map(d => d.data()).filter(a => !a.resolved).slice(0, 20);
  const forecast = generateForecast(topTasks, scoreObj?.overall || 0);
  const llmVisibility = llmVis ? { visibilityScore: llmVis.visibilityScore, grade: llmVis.grade, trend: llmVis.trend } : null;
  const answerOptimization = answerOpt ? { optimizationScore: answerOpt.optimizationScore, criticalCount: answerOpt.criticalCount, expectedVisibilityGain: answerOpt.expectedVisibilityGain, quickWins: answerOpt.quickWins } : null;
  const executive = buildExecutiveSummary({ score: scoreObj, forecast, audit, keywords, llmVisibility, answerOptimization, taskCenter, alerts, pipeline: { pipelineStatus: clientData.pipelineStatus }, scoreHistory });
  return { executive, scoreObj, scoreHistory, llmVisibility, answerOptimization, taskCenter, forecast, alerts };
}
router.get("/dashboard", requireScope("dashboard:read"), async (req, res) => {
  try {
    req.params.id = req.query.clientId; const doc = await ownClient(req);
    const g = await gatherExec(req.query.clientId, doc.data());
    return res.json({ executiveScore: g.executive.executiveScore, overallHealth: g.executive.overallHealth,
      score: g.scoreObj, insights: g.executive.insights, recommendedActions: g.executive.recommendedActions });
  } catch (e) { return res.status(e.code || 500).json({ error: e.message }); }
});
router.get("/business-intelligence", requireScope("analytics:read"), async (req, res) => {
  try {
    req.params.id = req.query.clientId; const doc = await ownClient(req);
    const g = await gatherExec(req.query.clientId, doc.data());
    const bi = buildBusinessIntelligence({ executive: g.executive, scoreHistory: g.scoreHistory, rankHistory: [],
      llmVisibility: g.llmVisibility, answerOptimization: g.answerOptimization, taskCenter: g.taskCenter,
      pipelineMetrics: [], conversions: [], forecast: g.forecast, score: g.scoreObj });
    return res.json(bi);
  } catch (e) { return res.status(e.code || 500).json({ error: e.message }); }
});

// ── Rankings + Reports (read persisted state) ──
router.get("/rankings", requireScope("rankings:read"), async (req, res) => {
  try {
    req.params.id = req.query.clientId; await ownClient(req);
    const r = await getState(req.query.clientId, "A10_rankings").catch(() => null);
    return res.json(r || { notComputed: true });
  } catch (e) { return res.status(e.code || 500).json({ error: e.message }); }
});
router.get("/reports", requireScope("reports:read"), async (req, res) => {
  try {
    req.params.id = req.query.clientId; await ownClient(req);
    const r = await getState(req.query.clientId, "A9_report").catch(() => null);
    return res.json(r || { notComputed: true });
  } catch (e) { return res.status(e.code || 500).json({ error: e.message }); }
});

// ── Copilot chat (reuse context + engine) ──
router.post("/copilot/chat", requireScope("copilot:chat"), async (req, res) => {
  try {
    const { clientId, question, history = [] } = req.body || {};
    if (!clientId || !question) return res.status(400).json({ error: "clientId and question are required." });
    req.params.id = clientId; await ownClient(req);
    const keys = await getUserKeys(req.uid);
    const context = await buildCopilotContext(clientId);
    const answer = await askCopilot({ clientId, keys, question, context, history });
    return res.json(answer);
  } catch (e) { return res.status(e.code || 500).json({ error: e.message }); }
});

module.exports = router;
