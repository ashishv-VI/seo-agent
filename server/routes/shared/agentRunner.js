/**
 * Shared generic agent runner — extracted from routes/agents.js (Sprint 1, M6.5).
 *
 * runAgent(clientId, agentId, runFn, keys, res) is the generic HTTP wrapper used
 * by the per-agent "run" routes: it gates on canRunAgent, marks the agent
 * "running" in Firestore, invokes runFn, then marks "complete" / delegates to
 * handleFailure and returns the appropriate JSON + status code.
 *
 * Moved verbatim from agents.js — parameters, return values, Firestore writes,
 * status codes, and error messages are unchanged. Route handlers import this
 * instead of defining a local copy.
 *
 * NOTE: distinct from server/agents/agentRunner.js (the CMO decision dispatcher);
 * different module, different responsibility.
 */
const { db } = require("../../config/firebase");
const { canRunAgent, handleFailure } = require("../../agents/A0_orchestrator");

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

module.exports = { runAgent };
