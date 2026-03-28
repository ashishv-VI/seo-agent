/**
 * A12 — Auto Execution Agent
 * Reads autoFixable pending tasks → generates AI fixes → pushes to approval queue
 */
const { getState }        = require("../shared-state/stateManager");
const { callLLM, parseJSON } = require("../utils/llm");
const { db, FieldValue }  = require("../config/firebase");
const { getTopTasks, updateTask } = require("../utils/taskQueue");

async function runA12(clientId, keys) {
  if (!keys?.groq && !keys?.gemini) {
    return { success: false, error: "LLM key required for auto-fix generation" };
  }

  const brief       = await getState(clientId, "A1_brief") || {};
  const pendingTasks = await getTopTasks(clientId, 20);
  const autoFixable = pendingTasks.filter(t => t.autoFixable && t.status === "pending");

  if (!autoFixable.length) {
    return { success: true, message: "No auto-fixable tasks pending", generated: 0 };
  }

  const fixes  = [];
  const errors = [];

  for (const task of autoFixable.slice(0, 10)) {
    try {
      const prompt = `You are a senior SEO consultant. Generate an exact, ready-to-implement fix.

Business: ${brief.businessName || "N/A"}
Website: ${brief.websiteUrl || "N/A"}
Services: ${(brief.services || []).join(", ") || "N/A"}
Issue: ${task.issueType}
Detail: ${task.title}

Return ONLY valid JSON (no markdown):
{
  "suggestedFix": "The exact text/code fix (for title/meta: actual text to use)",
  "explanation": "Why this improves SEO in 1-2 sentences",
  "implementation": ["step 1", "step 2", "step 3"],
  "codeSnippet": "<tag>ready to paste</tag> or null",
  "estimatedImpact": "e.g. +8 score points, +3-6 positions"
}`;

      const response = await callLLM(prompt, keys, { maxTokens: 500 });
      const result   = parseJSON(response);

      // Push to approval queue
      const ref = db.collection("approval_queue").doc();
      await ref.set({
        id:          ref.id,
        clientId,
        type:        "auto_fix",
        agent:       "A12",
        status:      "pending",
        taskId:      task.id,
        issueType:   task.issueType,
        data: {
          taskTitle:    task.title,
          suggestedFix: result.suggestedFix || "",
          explanation:  result.explanation  || "",
          implementation: result.implementation || [],
          codeSnippet:  result.codeSnippet  || null,
          estimatedImpact: result.estimatedImpact || `+${task.expectedScoreGain || 3} score pts`,
          currentValue: task.currentValue   || null,
        },
        createdAt:   FieldValue.serverTimestamp(),
      });

      // Mark task as "in_review"
      await updateTask(clientId, task.id, { status: "in_review" });

      fixes.push({ taskId: task.id, approvalId: ref.id, issue: task.issueType });
    } catch (e) {
      errors.push({ taskId: task.id, error: e.message });
    }
  }

  return {
    success:     true,
    generated:   fixes.length,
    errors:      errors.length,
    fixes,
    message:     `Generated ${fixes.length} auto-fixes — review in Approvals tab`,
  };
}

module.exports = { runA12 };
