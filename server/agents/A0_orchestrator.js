const { getClientState, saveState } = require("../shared-state/stateManager");
const { db }                         = require("../config/firebase");

/**
 * A0 — Orchestrator
 * Manages agent status, enforces dependency chain, detects failures
 * Dependency chain: A1 → A2 → A3 → A4 → A5+A6+A7 (parallel) → A8 → A9
 */

const DEPENDENCY_CHAIN = {
  A1: [],
  A2: ["A1"],
  A3: ["A1", "A2"],
  A4: ["A3"],
  A5: ["A4"],
  A6: ["A2"],
  A7: ["A2"],
  A8: ["A2"],
  A9: ["A2"],
};

const TIER = {
  A0: 1, A1: 1, A2: 1, A3: 1, A4: 2, A5: 2, A6: 2, A7: 2, A8: 2, A9: 2,
};

// Check if an agent can run based on its dependencies
async function canRunAgent(clientId, agentId) {
  const client = await db.collection("clients").doc(clientId).get();
  if (!client.exists) return { canRun: false, reason: "Client not found" };

  const agents = client.data().agents || {};
  const deps   = DEPENDENCY_CHAIN[agentId] || [];
  const state  = await getClientState(clientId);

  for (const dep of deps) {
    const depState = state[`${dep}_${getStateSuffix(dep)}`];

    if (dep === "A1" && !depState?.signedOff) {
      return { canRun: false, reason: "A1 brief must be signed off first (human gate)" };
    }
    if (["A2","A3","A4","A5","A6","A7","A8"].includes(dep) && depState?.status !== "complete") {
      const labels = { A2:"Technical Audit", A3:"Keyword Research", A4:"Competitor Analysis", A5:"Content Optimisation", A6:"On-Page", A7:"Technical/CWV", A8:"GEO" };
      return { canRun: false, reason: `${labels[dep] || dep} must complete before this agent can run` };
    }
  }

  return { canRun: true };
}

function getStateSuffix(agentId) {
  const map = { A1:"brief", A2:"audit", A3:"keywords", A4:"competitor", A5:"content", A6:"onpage", A7:"technical", A8:"geo", A9:"report" };
  return map[agentId] || agentId.toLowerCase();
}

// Get full pipeline status for a client
async function getPipelineStatus(clientId) {
  const client = await db.collection("clients").doc(clientId).get();
  if (!client.exists) return null;

  const agents  = client.data().agents || {};
  const state   = await getClientState(clientId);

  const pipeline = {};
  for (const [agentId, deps] of Object.entries(DEPENDENCY_CHAIN)) {
    const agentStatus = agents[agentId] || "pending";
    const { canRun }  = await canRunAgent(clientId, agentId);
    const stateKey    = `${agentId}_${getStateSuffix(agentId)}`;

    pipeline[agentId] = {
      status:    agentStatus,
      canRun,
      tier:      TIER[agentId] || 2,
      deps,
      hasData:   !!state[stateKey],
      lastRun:   state[stateKey]?.generatedAt || state[stateKey]?.auditedAt || null,
    };
  }

  return { pipeline, clientName: client.data().name, website: client.data().website };
}

// Handle agent failure
async function handleFailure(clientId, agentId, error) {
  const tier = TIER[agentId];

  if (tier === 1) {
    // Hard block — downstream agents must pause
    await db.collection("clients").doc(clientId).update({
      [`agents.${agentId}`]: "failed",
      orchestratorAlert: `TIER 1 FAILURE: ${agentId} failed — ${error}. Human intervention required.`,
    });
    // Save alert
    await db.collection("alerts").add({
      clientId,
      tier:     "P1",
      type:     `agent_failure_${agentId}`,
      message:  `${agentId} failed (Tier 1 — hard block): ${error}`,
      fix:      `Fix the underlying issue and re-run ${agentId}`,
      source:   "A0",
      resolved: false,
      createdAt: new Date().toISOString(),
    });
    return { blocked: true, message: `Tier 1 failure in ${agentId} — chain blocked` };
  } else {
    // Degraded mode — flag raised, chain continues
    await db.collection("clients").doc(clientId).update({
      [`agents.${agentId}`]: "failed",
    });
    await db.collection("alerts").add({
      clientId,
      tier:     "P2",
      type:     `agent_failure_${agentId}`,
      message:  `${agentId} failed (Tier 2 — degraded mode): ${error}`,
      fix:      `Re-run ${agentId} when issue is resolved`,
      source:   "A0",
      resolved: false,
      createdAt: new Date().toISOString(),
    });
    return { blocked: false, message: `Tier 2 failure in ${agentId} — continuing with degraded data` };
  }
}

module.exports = { canRunAgent, getPipelineStatus, handleFailure, DEPENDENCY_CHAIN };
