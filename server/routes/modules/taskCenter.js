/**
 * Task Center routes (M9.4).
 *
 * Unified execution queue merging existing sources — task_queue (audit tasks),
 * approval_queue (approvals), answer_optimization (opportunities) — into one
 * canonical, prioritized view via the pure buildTaskCenter() engine. Mounted by
 * agents.js at the same base ("/") so paths are /api/agents/:clientId/task-center*.
 *
 *   GET   /:clientId/task-center             — unified view (live merge + overrides)
 *   POST  /:clientId/task-center/rebuild     — recompute + persist snapshot
 *   PATCH /:clientId/task-center/:taskId      — apply an override (status/priority/assignee/notes)
 *
 * Reuses verifyToken + getClientDoc + getTasks (from taskQueue). No second task
 * system: task_queue stays the source of truth; user edits are stored as
 * overrides keyed by canonical id and never mutate the underlying sources.
 *
 * Persistence: task_center/{clientId} (snapshot) + task_center_overrides/{clientId}/items/{taskId}.
 */
const express       = require("express");
const router        = express.Router();
const { db, FieldValue } = require("../../config/firebase");
const { verifyToken } = require("../../middleware/auth");
const { getClientDoc } = require("../shared/clientOwnership");
const { getTasks }  = require("../../utils/taskQueue");
const { buildTaskCenter } = require("../../utils/taskCenter");

// Gather work items + overrides from existing sources. Best-effort throughout.
async function gather(clientId) {
  const [taskQueue, apprSnap, aoDoc, ovSnap] = await Promise.all([
    getTasks(clientId).catch(() => []),
    db.collection("approval_queue").where("clientId", "==", clientId).limit(100).get().catch(() => null),
    db.collection("answer_optimization").doc(clientId).get().catch(() => null),
    db.collection("task_center_overrides").doc(clientId).collection("items").get().catch(() => null),
  ]);

  const approvals = (apprSnap?.docs || []).map(d => ({ id: d.id, ...d.data() }));
  const opportunities = (aoDoc?.exists && Array.isArray(aoDoc.data().opportunities)) ? aoDoc.data().opportunities : [];
  const overrides = {};
  (ovSnap?.docs || []).forEach(d => { overrides[d.id] = d.data(); });

  return { sources: { taskQueue, approvals, opportunities }, overrides };
}

// GET unified view.
router.get("/:clientId/task-center", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const clientId = req.params.clientId;
    const { sources, overrides } = await gather(clientId);
    const result = buildTaskCenter(sources, overrides, new Date().toISOString());
    return res.json({ ...result, source: "live" });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// POST rebuild — recompute + persist a lightweight snapshot (summary only; tasks stay derived).
router.post("/:clientId/task-center/rebuild", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const clientId = req.params.clientId;
    const { sources, overrides } = await gather(clientId);
    const result = buildTaskCenter(sources, overrides, new Date().toISOString());
    const builtAt = new Date().toISOString();

    // Persist only the summary snapshot (the full task list is always derived live to stay fresh).
    await db.collection("task_center").doc(clientId)
      .set({ clientId, summary: result.summary, builtAt }, { merge: true });

    return res.json({ ...result, builtAt, source: "rebuilt" });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// PATCH one task — write an override. Never mutates the underlying source.
router.patch("/:clientId/task-center/:taskId", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const clientId = req.params.clientId;
    const taskId   = req.params.taskId;
    const { status, priority, assignee, notes } = req.body;

    // Whitelist + validate.
    const allowedStatus   = ["pending", "in_progress", "blocked", "done", "cancelled"];
    const allowedPriority = ["critical", "high", "medium", "low"];
    const patch = { updatedAt: new Date().toISOString() };
    if (status !== undefined) {
      if (!allowedStatus.includes(status)) return res.status(400).json({ error: `Invalid status. Allowed: ${allowedStatus.join(", ")}` });
      patch.status = status;
      if (status === "done") patch.completedAt = new Date().toISOString();
    }
    if (priority !== undefined) {
      if (!allowedPriority.includes(priority)) return res.status(400).json({ error: `Invalid priority. Allowed: ${allowedPriority.join(", ")}` });
      patch.priority = priority;
    }
    if (assignee !== undefined) patch.assignee = assignee;
    if (notes !== undefined)    patch.notes = notes;

    // Append to history + persist the override document (keyed by canonical task id).
    const ref = db.collection("task_center_overrides").doc(clientId).collection("items").doc(taskId);
    await ref.set({
      ...patch,
      history: FieldValue.arrayUnion({ ...patch, at: new Date().toISOString() }),
    }, { merge: true });

    return res.json({ taskId, ...patch, updated: true });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

module.exports = router;
