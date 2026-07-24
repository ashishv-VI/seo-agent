/**
 * copilotActions.js — Copilot action orchestration layer (M10.4).
 *
 * PURE ORCHESTRATION. Turns the Copilot from an assistant into an operator by
 * delegating to EXISTING helpers/engines. It does NOT re-implement any workflow:
 *   - task create/update  → taskQueue helpers + task_center_overrides (Task Center's own store)
 *   - approve / reject / revision / push-to-wp → same approval_queue writes the
 *     Approvals routes perform (+ A13 pushSingleFix require, unchanged)
 *   - run/reset pipeline  → A0 runFullPipeline / deleteState (same as Pipeline routes)
 *   - recalc LLM Vis / Answer Opt / rebuild Task Center → these have their own
 *     gather+persist endpoints; the engine returns a `redirect` telling the caller
 *     to invoke the existing endpoint rather than duplicating that logic.
 *   - open report / navigate / summarize / open BI → navigation redirects only.
 *
 * Standardized result: { success, title, message, entity, redirect, metadata }.
 *
 * db + agent helpers are passed in by the route (so this module stays free of a
 * hard firebase import and is unit-testable). No LLM. No new collections beyond
 * the ones the delegated systems already own.
 */

const { FieldValue } = require("../config/firebase");

// Canonical action catalog — id → { label, kind, needsConfirm }
const ACTIONS = {
  create_task:            { label: "Create Task",                 kind: "mutation", needsConfirm: false },
  update_task:            { label: "Update Task",                 kind: "mutation", needsConfirm: false },
  approve_item:           { label: "Approve Item",                kind: "mutation", needsConfirm: true },
  reject_item:            { label: "Reject Item",                 kind: "mutation", needsConfirm: true },
  request_revision:       { label: "Request Revision",            kind: "mutation", needsConfirm: false },
  push_to_wordpress:      { label: "Push to WordPress",           kind: "mutation", needsConfirm: true },
  run_pipeline:           { label: "Run Pipeline",                kind: "job",      needsConfirm: true },
  reset_pipeline:         { label: "Reset Pipeline",              kind: "job",      needsConfirm: true },
  recalc_llm_visibility:  { label: "Recalculate LLM Visibility",  kind: "redirect", needsConfirm: false },
  recalc_answer_opt:      { label: "Recalculate Answer Optimization", kind: "redirect", needsConfirm: false },
  rebuild_task_center:    { label: "Rebuild Task Center",         kind: "redirect", needsConfirm: false },
  open_report:            { label: "Open Report",                 kind: "navigate", needsConfirm: false },
  navigate:               { label: "Navigate",                    kind: "navigate", needsConfirm: false },
  summarize_dashboard:    { label: "Summarize Executive Dashboard", kind: "navigate", needsConfirm: false },
  open_business_intelligence: { label: "Open Business Intelligence", kind: "navigate", needsConfirm: false },
};

function result({ success = true, title, message, entity = null, redirect = null, metadata = {} }) {
  return { success, title, message, entity, redirect, metadata };
}

/**
 * Execute an action. `ctx` supplies the environment the route owns:
 *   { db, clientId, uid, getUserKeys, runFullPipeline, deleteState }
 * `params` are action-specific.
 */
async function executeAction(actionId, params = {}, ctx = {}) {
  const def = ACTIONS[actionId];
  if (!def) return result({ success: false, title: "Unknown action", message: `No such action: ${actionId}` });

  const { db, clientId } = ctx;

  switch (actionId) {
    // ── Task Center: create/update via its own stores (no new task system) ──
    case "create_task": {
      // Copilot-originated tasks live in task_center_overrides as a lightweight
      // synthetic task the Task Center engine already knows how to surface.
      const id = `co:${Date.now()}`;
      await db.collection("task_center_overrides").doc(clientId).collection("items").doc(id).set({
        title: params.title || "Copilot task", notes: params.notes || "",
        status: "pending", priority: params.priority || "medium",
        source: "copilot", createdAt: new Date().toISOString(),
      }, { merge: true });
      return result({ title: "Task created", message: `Added "${params.title || "Copilot task"}" to the Task Center.`,
        entity: { kind: "task", id }, redirect: { tab: "taskcenter" } });
    }
    case "update_task": {
      if (!params.taskId) return result({ success: false, title: "Missing task", message: "taskId is required." });
      const patch = { updatedAt: new Date().toISOString() };
      if (params.status)   patch.status = params.status;
      if (params.priority) patch.priority = params.priority;
      if (params.assignee !== undefined) patch.assignee = params.assignee;
      if (params.status === "done") patch.completedAt = new Date().toISOString();
      await db.collection("task_center_overrides").doc(clientId).collection("items").doc(params.taskId)
        .set({ ...patch, history: FieldValue.arrayUnion({ ...patch, at: new Date().toISOString() }) }, { merge: true });
      return result({ title: "Task updated", message: `Task ${params.taskId} updated.`,
        entity: { kind: "task", id: params.taskId }, redirect: { tab: "taskcenter" } });
    }

    // ── Approvals: same approval_queue writes as the Approvals routes ──
    case "approve_item":
    case "reject_item": {
      if (!params.itemId) return result({ success: false, title: "Missing item", message: "itemId is required." });
      const approve = actionId === "approve_item";
      await db.collection("approval_queue").doc(params.itemId).update({
        status: approve ? "approved" : "rejected",
        reviewedAt: FieldValue.serverTimestamp(),
        reviewNotes: params.notes || "",
      });
      return result({ title: approve ? "Item approved" : "Item rejected",
        message: `Approval item ${params.itemId} ${approve ? "approved" : "rejected"}.`,
        entity: { kind: "approval", id: params.itemId }, redirect: { tab: "overview" } });
    }
    case "request_revision": {
      if (!params.itemId) return result({ success: false, title: "Missing item", message: "itemId is required." });
      await db.collection("approval_queue").doc(params.itemId).update({
        status: "revision_requested", feedback: params.feedback || "", revisedAt: FieldValue.serverTimestamp(),
      });
      return result({ title: "Revision requested", message: `Revision requested on ${params.itemId}.`,
        entity: { kind: "approval", id: params.itemId } });
    }
    case "push_to_wordpress": {
      if (!params.itemId) return result({ success: false, title: "Missing item", message: "itemId is required." });
      const { pushSingleFix } = require("../agents/A13_autopush"); // same require the Approvals route uses
      const r = await pushSingleFix(clientId, params.itemId);
      return result({ success: !!r?.success, title: r?.success ? "Pushed to WordPress" : "Push failed",
        message: r?.success ? `Item ${params.itemId} pushed.` : (r?.error || "Push failed."),
        entity: { kind: "approval", id: params.itemId }, metadata: r || {} });
    }

    // ── Pipeline: delegate to A0 (same as Pipeline routes) ──
    case "run_pipeline": {
      const keys = await ctx.getUserKeys(ctx.uid);
      const hasLLM = keys.groq || keys.gemini || keys.openrouter || process.env.OPENROUTER_API_KEY;
      if (!hasLLM) return result({ success: false, title: "No LLM key", message: "Add a Groq, Gemini, or OpenRouter key in Settings first." });
      const clientRef = db.collection("clients").doc(clientId);
      const snap = await clientRef.get();
      const data = snap.data() || {};
      if (data.pipelineStatus === "running" && data.pipelineStartedAt) {
        const mins = Math.round((Date.now() - new Date(data.pipelineStartedAt).getTime()) / 60000);
        if (mins < 20) return result({ success: false, title: "Already running", message: `Pipeline started ${mins} min ago. Wait or Hard Reset.` });
      }
      await clientRef.update({
        "agents.A2": "pending", "agents.A3": "pending", "agents.A4": "pending", "agents.A5": "pending",
        "agents.A6": "pending", "agents.A7": "pending", "agents.A8": "pending", "agents.A9": "pending",
        pipelineStatus: "running", pipelineStartedAt: new Date().toISOString(), pipelineError: null,
      });
      ctx.runFullPipeline(clientId, keys, null).catch(err => console.error(`[copilot] pipeline bg error:`, err.message));
      return result({ title: "Pipeline started", message: "Full SEO analysis pipeline started — poll for live status.",
        entity: { kind: "pipeline", id: clientId }, redirect: { tab: "command" } });
    }
    case "reset_pipeline": {
      const clientRef = db.collection("clients").doc(clientId);
      await clientRef.update({
        "agents.A1": "pending", "agents.A2": "pending", "agents.A3": "pending", "agents.A4": "pending",
        "agents.A5": "pending", "agents.A6": "pending", "agents.A7": "pending", "agents.A8": "pending",
        "agents.A9": "pending", "agents.A10": "pending", "agents.A11": "pending", "agents.A12": "pending",
        pipelineStatus: "idle", pipelineError: null, pipelineStartedAt: null, pipelineCompletedAt: null, pipelineHeartbeat: null,
      });
      const stateKeys = ["A2_audit","A3_keywords","A4_competitor","A5_content","A6_onpage","A7_technical","A8_geo","A9_report","A10_rankings"];
      await Promise.allSettled(stateKeys.map(k => ctx.deleteState(clientId, k)));
      return result({ title: "Pipeline reset", message: "All agents cleared to pending.", entity: { kind: "pipeline", id: clientId } });
    }

    // ── Recalc / rebuild: own endpoints already gather+persist — redirect, don't duplicate ──
    case "recalc_llm_visibility":
      return result({ title: "Recalculate LLM Visibility", message: "Recomputing AI visibility from current scans.",
        redirect: { tab: "llmvisibility", call: `/api/agents/${clientId}/llm-visibility/recalculate`, method: "POST" } });
    case "recalc_answer_opt":
      return result({ title: "Recalculate Answer Optimization", message: "Regenerating optimization opportunities.",
        redirect: { tab: "answeropt", call: `/api/agents/${clientId}/answer-optimization/recalculate`, method: "POST" } });
    case "rebuild_task_center":
      return result({ title: "Rebuild Task Center", message: "Rebuilding the unified task queue.",
        redirect: { tab: "taskcenter", call: `/api/agents/${clientId}/task-center/rebuild`, method: "POST" } });

    // ── Navigation-only actions ──
    case "open_report":
      return result({ title: "Open Report", message: "Opening the latest report.", redirect: { tab: "overview" } });
    case "summarize_dashboard":
      return result({ title: "Executive Dashboard", message: "Opening the Command Center.", redirect: { tab: "command" } });
    case "open_business_intelligence":
      return result({ title: "Business Intelligence", message: "Opening Business Intelligence.", redirect: { tab: "bi" } });
    case "navigate":
      return result({ title: "Navigate", message: `Navigating to ${params.tab || "command"}.`, redirect: { tab: params.tab || "command" } });

    default:
      return result({ success: false, title: "Unsupported", message: `Action ${actionId} not implemented.` });
  }
}

module.exports = { executeAction, ACTIONS };
