/**
 * Tasks routes — extracted from routes/agents.js (Sprint 1, Story M6.12).
 *
 * Mounted by agents.js under the same base path (/api/agents), so the public
 * endpoints are unchanged:
 *   POST /api/agents/:clientId/generate-fix          — LLM-generated fix for an issue
 *   GET  /api/agents/:clientId/tasks                  — all tasks (priority sorted)
 *   GET  /api/agents/:clientId/tasks/today            — top 5 pending tasks
 *   PUT  /api/agents/:clientId/tasks/:taskId          — update task status
 *   POST /api/agents/:clientId/tasks/:taskId/execute  — mark task executed
 *   POST /api/agents/:clientId/tasks/bulk             — bulk task action
 *
 * Routes moved verbatim, in original file order. Middleware (verifyToken),
 * ownership (getClientDoc), taskQueue helpers, Firestore access, inline LLM /
 * agent requires, validation, status codes, error messages, and response
 * formats are identical to the originals.
 */
const express       = require("express");
const router        = express.Router();
const { db, FieldValue } = require("../../config/firebase");
const { verifyToken } = require("../../middleware/auth");
const { getUserKeys } = require("../../utils/getUserKeys");
const { getTasks, getTopTasks, updateTask } = require("../../utils/taskQueue");
const { getClientDoc } = require("../shared/clientOwnership");

router.post("/:clientId/generate-fix", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const keys    = await getUserKeys(req.uid);
    const { callLLM, parseJSON } = require("../../utils/llm");
    const { getState } = require("../../shared-state/stateManager");

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
      const { runA12 } = require("../../agents/A12_autoExec");
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

module.exports = router;
