/**
 * Agent Runner — central dispatcher used by the CMO approve/execute path,
 * daily CMO self-wake-up, and rulesEngine auto-actions.
 *
 * Why this exists: before this file, the approve endpoint had a RUNNABLE
 * map that was missing A2, A8, A10, A19, A23. That meant A24's lead-gen
 * pivot ["A19","A6","A14"], traffic pivot ["A2","A10","A23"], and local
 * pivot ["A8","A11"] silently dropped half their agents. User clicked
 * Approve & Execute and nothing ran.
 *
 * This runner is the single source of truth. Adding a new agent to the
 * pipeline just means adding one line here.
 */
const { getUserKeys } = require("../utils/getUserKeys");
const { db }          = require("../config/firebase");

// Agent ID → { loader, argsFn }
// loader: returns the runX function
// argsFn: builds the argument list the agent actually expects (not all agents
//         take the same shape — A2 takes only clientId, A8/A10 take googleToken)
const AGENTS = {
  A2: {
    load: () => require("./A2_audit").runA2,
    args: (clientId/*, keys*/) => [clientId],
  },
  A3: {
    load: () => require("./A3_keywords").runA3,
    args: (clientId, keys) => [clientId, keys],
  },
  A5: {
    load: () => require("./A5_content").runA5,
    args: (clientId, keys) => [clientId, keys],
  },
  A6: {
    load: () => require("./A6_onpage").runA6,
    args: (clientId, keys) => [clientId, keys],
  },
  A7: {
    load: () => require("./A7_technical").runA7,
    args: (clientId, keys) => [clientId, keys],
  },
  A8: {
    load: () => require("./A8_geo").runA8,
    args: (clientId, keys) => [clientId, keys, keys?.googleToken || keys?.gscToken || null],
  },
  A10: {
    load: () => require("./A10_rankingTracker").runA10,
    args: (clientId, keys) => [clientId, keys, keys?.gscToken || null],
  },
  A11: {
    load: () => require("./A11_linkBuilder").runA11,
    args: (clientId, keys) => [clientId, keys],
  },
  A14: {
    load: () => require("./A14_contentAutopilot").runA14,
    args: (clientId, keys) => [clientId, keys],
  },
  A19: {
    load: () => require("./A19_conversion").runA19,
    args: (clientId, keys) => [clientId, keys],
  },
  A23: {
    load: () => require("./A23_investigator").runA23,
    args: (clientId, keys) => [clientId, keys],
  },
  A24: {
    load: () => require("./A24_strategist").runA24,
    args: (clientId, keys) => [clientId, keys],
  },
  A25: {
    load: () => require("./A25_coreUpdateScanner").runA25,
    args: (clientId, keys) => [clientId, keys],
  },
  A15: {
    load: () => require("./A15_competitorMonitor").runA15,
    args: (clientId, keys) => [clientId, keys],
  },
};

/**
 * Run an agent by ID. Returns the agent's result shape: { success, ...data }.
 * Never throws — always resolves to { success: false, error } on failure.
 */
async function runAgentById(agentId, clientId, keys) {
  const entry = AGENTS[agentId];
  if (!entry) {
    return { success: false, error: `Unknown agent id: ${agentId}` };
  }
  try {
    const fn   = entry.load();
    const args = entry.args(clientId, keys);
    const res  = await fn(...args);
    return res || { success: true };
  } catch (e) {
    console.error(`[agentRunner] ${agentId} failed for ${clientId}:`, e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Approve & Execute helper — given a cmo_queue decision doc, run every
 * agent in its nextAgents array in parallel. Used by the approve endpoint
 * and by the daily CMO auto-exec path.
 */
async function executeCMODecision(decisionDoc, clientId, keys) {
  const agents = (decisionDoc.nextAgents || []).slice(0, 3);
  const results = [];
  for (const id of agents) {
    const r = await runAgentById(id, clientId, keys);
    results.push({ agent: id, ...r });
  }
  return results;
}

module.exports = { runAgentById, executeCMODecision, AGENTS };
