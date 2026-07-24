/**
 * Copilot Actions routes (M10.4).
 *
 * Makes the Copilot an operator. Delegates every action to existing helpers via
 * the copilotActions orchestration engine — no duplicated task/approval/pipeline
 * logic. Mounted by agents.js at the same base so paths are
 * /api/agents/:clientId/copilot/action|actions|suggestions.
 *
 *   POST /:clientId/copilot/action       — execute one action
 *   GET  /:clientId/copilot/actions      — the action catalog
 *   GET  /:clientId/copilot/suggestions  — deterministic, state-derived suggestions
 *
 * Reuses verifyToken + getClientDoc + getUserKeys + A0 orchestrator + stateManager.
 * No LLM. No new collections beyond those the delegated systems already own.
 */
const express       = require("express");
const router        = express.Router();
const { db }        = require("../../config/firebase");
const { verifyToken } = require("../../middleware/auth");
const { getUserKeys } = require("../../utils/getUserKeys");
const { getClientDoc } = require("../shared/clientOwnership");
const { runFullPipeline } = require("../../agents/A0_orchestrator");
const { deleteState } = require("../../shared-state/stateManager");
const { executeAction, ACTIONS } = require("../../utils/copilotActions");

// POST execute an action.
router.post("/:clientId/copilot/action", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { actionId, params } = req.body || {};
    if (!actionId) return res.status(400).json({ error: "actionId is required" });
    const out = await executeAction(actionId, params || {}, {
      db, clientId: req.params.clientId, uid: req.uid,
      getUserKeys, runFullPipeline, deleteState,
    });
    return res.json(out);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// GET the action catalog (for the UI to render buttons/labels).
router.get("/:clientId/copilot/actions", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const actions = Object.entries(ACTIONS).map(([id, a]) => ({ id, ...a }));
    return res.json({ actions });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// GET deterministic suggestions derived from current platform state. No LLM.
router.get("/:clientId/copilot/suggestions", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const clientId = req.params.clientId;

    const [clientDoc, apprSnap, taskCenterDoc, llmVisDoc, answerOptDoc, draftsSnap] = await Promise.all([
      db.collection("clients").doc(clientId).get().catch(() => null),
      db.collection("approval_queue").where("clientId", "==", clientId).limit(50).get().catch(() => null),
      db.collection("task_center").doc(clientId).get().catch(() => null),
      db.collection("llm_visibility").doc(clientId).get().catch(() => null),
      db.collection("answer_optimization").doc(clientId).get().catch(() => null),
      db.collection("content_drafts").where("clientId", "==", clientId).limit(20).get().catch(() => null),
    ]);

    const client = clientDoc?.exists ? clientDoc.data() : {};
    const pendingApprovals = (apprSnap?.docs || []).map(d => d.data()).filter(a => a.status === "pending").length;
    const approvedDrafts = (draftsSnap?.docs || []).map(d => d.data()).filter(d => d.status === "approved").length;
    const taskSummary = taskCenterDoc?.exists ? (taskCenterDoc.data().summary || {}) : {};
    const hasVis = !!(llmVisDoc?.exists);
    const hasAnswerOpt = !!(answerOptDoc?.exists);

    const suggestions = [];
    const add = (actionId, label, reason, priority = "medium", params = {}) => suggestions.push({ actionId, label, reason, priority, params });

    // Rule-based, ordered by urgency.
    if (client.pipelineStatus === "failed") add("run_pipeline", "Re-run Pipeline", "The last pipeline run failed.", "high");
    else if (!client.pipelineStatus || client.pipelineStatus === "idle") add("run_pipeline", "Run Pipeline", "No recent pipeline run — refresh intelligence.", "high");
    if ((taskSummary.criticalTasks || 0) > 0) add("navigate", "Review Critical Tasks", `${taskSummary.criticalTasks} critical task(s) pending.`, "high", { tab: "taskcenter" });
    if (pendingApprovals > 0) add("navigate", "Review Pending Approvals", `${pendingApprovals} item(s) awaiting approval.`, "high", { tab: "overview" });
    if (approvedDrafts > 0) add("navigate", "Publish Approved Articles", `${approvedDrafts} approved draft(s) ready to push.`, "medium", { tab: "overview" });
    if (!hasVis) add("recalc_llm_visibility", "Run LLM Visibility", "No AI-visibility snapshot yet.", "medium");
    if (!hasAnswerOpt) add("recalc_answer_opt", "Run Answer Optimization", "No optimization plan yet.", "medium");
    if (hasVis && hasAnswerOpt) add("rebuild_task_center", "Rebuild Task Center", "Merge the latest signals into the task queue.", "low");
    add("open_business_intelligence", "View Business Intelligence", "See executive KPIs, trends, and risk.", "low");
    if (client.pipelineStatus === "complete") add("summarize_dashboard", "Open Command Center", "Review the executive summary.", "low");

    return res.json({ suggestions: suggestions.slice(0, 8) });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

module.exports = router;
