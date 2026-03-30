const { getClientState, saveState, updateState, getState } = require("../shared-state/stateManager");
const { db }                                     = require("../config/firebase");
const { sendPipelineComplete }                   = require("../utils/emailer");

/**
 * A0 — Orchestrator
 * Manages agent status, enforces dependency chain, detects failures
 *
 * Automated pipeline execution order (mirrors how real SEO agencies work):
 *   Stage 0: A1 auto sign-off (brief data comes from onboarding form)
 *   Stage 1: A2 (Technical Audit) + A7 (CWV/Performance) — parallel, both just need URL
 *   Stage 2: A3 (Keyword Intelligence) — needs A2 audit findings to map keywords → pages
 *   Stage 3: A4 (Competitor) + A5 (Content) — parallel, both need A3 keyword targets
 *   Stage 4: A6 (On-Page Fixes) + A8 (Local/GEO) — parallel, A6 needs A2+A3, A8 needs A2
 *   Stage 5: A9 (Strategy Report) — synthesises all agent outputs
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

// ── Check if an agent can run based on its dependencies ──────────────────────
async function canRunAgent(clientId, agentId) {
  const client = await db.collection("clients").doc(clientId).get();
  if (!client.exists) return { canRun: false, reason: "Client not found" };

  const deps  = DEPENDENCY_CHAIN[agentId] || [];
  const state = await getClientState(clientId);

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

// ── Get full pipeline status for a client ────────────────────────────────────
async function getPipelineStatus(clientId) {
  const client = await db.collection("clients").doc(clientId).get();
  if (!client.exists) return null;

  const agents  = client.data().agents || {};
  const state   = await getClientState(clientId);

  const pipeline = {};
  for (const [agentId, deps] of Object.entries(DEPENDENCY_CHAIN)) {
    const agentStatus = agents[agentId] || "pending";
    const { canRun, reason } = await canRunAgent(clientId, agentId);
    const stateKey    = `${agentId}_${getStateSuffix(agentId)}`;
    pipeline[agentId] = {
      status:    agentStatus,
      canRun,
      reason:    reason || null,
      tier:      TIER[agentId] || 2,
      deps,
      hasData:   !!state[stateKey],
      lastRun:   state[stateKey]?.generatedAt || state[stateKey]?.auditedAt || null,
    };
  }

  const data = client.data();
  return {
    pipeline,
    clientName:          data.name,
    website:             data.website,
    pipelineStatus:      data.pipelineStatus || "idle",
    pipelineStartedAt:   data.pipelineStartedAt || null,
    pipelineCompletedAt: data.pipelineCompletedAt || null,
    pipelineError:       data.pipelineError || null,
  };
}

// ── Handle agent failure ─────────────────────────────────────────────────────
async function handleFailure(clientId, agentId, error) {
  const tier = TIER[agentId];

  if (tier === 1) {
    await db.collection("clients").doc(clientId).update({
      [`agents.${agentId}`]: "failed",
      orchestratorAlert: `TIER 1 FAILURE: ${agentId} failed — ${error}. Human intervention required.`,
    });
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

// ── Full automated pipeline ──────────────────────────────────────────────────
// Uses lazy requires to avoid circular dependency issues.
// Called fire-and-forget from the /run-pipeline route — does NOT block the HTTP response.
async function runFullPipeline(clientId, keys, googleToken = null) {
  // Clear previous task queue so we start fresh
  try {
    const { clearTasks } = require("../utils/taskQueue");
    await clearTasks(clientId);
  } catch { /* non-blocking */ }

  // Lazy-load agent runners to avoid circular dependency
  const { runA2 }          = require("./A2_audit");
  const { runA3 }          = require("./A3_keywords");
  const { runA4 }          = require("./A4_competitor");
  const { runA5 }          = require("./A5_content");
  const { runA6 }          = require("./A6_onpage");
  const { runA7 }          = require("./A7_technical");
  const { runA8 }          = require("./A8_geo");
  const { generateReport } = require("./A9_monitoring");
  const { runA10 }         = require("./A10_rankingTracker");
  const { runA12 }         = require("./A12_autoExec");
  const { runA16 }         = require("./A16_memory");

  const mark = async (agentId, status) => {
    await db.collection("clients").doc(clientId).update({ [`agents.${agentId}`]: status });
  };

  // Wrapper: mark running → call agent fn → mark complete/failed
  // Returns true on success, false on failure (pipeline continues for non-critical agents)
  const exec = async (agentId, fn) => {
    try {
      await mark(agentId, "running");
      const result = await fn(clientId, keys);
      if (!result.success) {
        await handleFailure(clientId, agentId, result.error || "Agent returned failure");
        return false;
      }
      await mark(agentId, "complete");
      return true;
    } catch (err) {
      await handleFailure(clientId, agentId, err.message);
      return false;
    }
  };

  try {
    // ── Stage 0: Auto sign-off A1 ─────────────────────────────────────────
    // The brief was structured from the onboarding form — no human review needed
    // to start the technical audit. Sign-off unblocks all downstream agents.
    await updateState(clientId, "A1_brief", { signedOff: true, autoSignedOff: true, signedOffAt: new Date().toISOString() });
    await mark("A1", "signed_off");

    // ── Stage 1: Technical foundation (parallel) ──────────────────────────
    // A2 = full technical audit (crawl, broken links, on-page checks)
    // A7 = Core Web Vitals & performance (PageSpeed API)
    // Both only need the website URL — can run simultaneously
    const [a2ok] = await Promise.all([
      exec("A2", runA2),
      exec("A7", runA7),
    ]);

    // A2 is critical — keyword mapping depends on knowing what pages exist
    // and what technical issues need fixing. Abort if it fails.
    if (!a2ok) {
      await db.collection("clients").doc(clientId).update({
        pipelineStatus: "failed",
        pipelineError:  "Technical Audit (A2) failed — cannot proceed without site data",
        pipelineCompletedAt: new Date().toISOString(),
      });
      return;
    }

    // ── Stage 2: Keyword Intelligence ─────────────────────────────────────
    // A3 uses A2 audit findings (crawled pages, existing on-page signals)
    // to map target keywords to the right pages — avoids cannibalization
    await exec("A3", runA3);

    // ── Stage 3: Competitive intelligence + Content strategy (parallel) ───
    // A4 = competitor gap analysis (uses A3 keyword targets)
    // A5 = content optimisation recommendations (uses A3 keyword clusters)
    // Both need A3 data but are independent of each other
    await Promise.all([
      exec("A4", runA4),
      exec("A5", runA5),
    ]);

    // ── Stage 4: On-page fixes + Local/GEO signals (parallel) ────────────
    // A6 = on-page tag fixes, schema markup, internal link map (uses A2+A3+A5)
    // A8 = local SEO, citations, Google Business Profile (uses A2 + brief)
    // Independent of each other — parallelise for speed
    await Promise.all([
      exec("A6", runA6),
      exec("A8", (id, k) => runA8(id, k, googleToken)),
    ]);

    // ── Stage 5: Strategy Report + Ranking Tracker (parallel) ────────────
    // A9 synthesises all agent outputs; A10 captures keyword position baseline
    await Promise.all([
      exec("A9",  (id, k) => generateReport(id, k, null)),
      exec("A10", (id, k) => runA10(id, k, googleToken)),
    ]);

    await db.collection("clients").doc(clientId).update({
      pipelineStatus:      "complete",
      pipelineCompletedAt: new Date().toISOString(),
      pipelineError:       null,
    });

    // ── Auto-save SEO score after pipeline completes ───────────────────────
    try {
      const { calculateScore, saveScoreHistory } = require("../utils/scoreCalculator");
      const [audit, keywords, geo, onpage, technical] = await Promise.all([
        getState(clientId, "A2_audit").catch(() => null),
        getState(clientId, "A3_keywords").catch(() => null),
        getState(clientId, "A8_geo").catch(() => null),
        getState(clientId, "A6_onpage").catch(() => null),
        getState(clientId, "A7_technical").catch(() => null),
      ]);
      if (audit) {
        const score = calculateScore(audit, keywords, geo, onpage, technical);
        await saveScoreHistory(clientId, score);
        await db.collection("clients").doc(clientId).update({ seoScore: score.overall });
        console.log(`[A0] seoScore ${score.overall} saved for ${clientId}`);
      }
    } catch (e) { console.error("[A0] Score save failed:", e.message); }

    // ── Stage 6: Send pipeline complete email ──────────────────────────────
    try {
      const [clientDoc, ownerDoc, reportState, auditState] = await Promise.all([
        db.collection("clients").doc(clientId).get(),
        null, // resolved below
        getState(clientId, "A9_report").catch(() => null),
        getState(clientId, "A2_audit").catch(() => null),
      ]);
      const cData = clientDoc.data() || {};
      const ownerSnap = await db.collection("users").doc(cData.ownerId).get().catch(() => null);
      const ownerEmail = ownerSnap?.data()?.email;
      const { auth }   = require("../config/firebase");
      const fbUser     = await auth.getUser(cData.ownerId).catch(() => null);
      const toEmail    = ownerEmail || fbUser?.email;
      if (toEmail) {
        const topIssues = (auditState?.issues || []).filter(i => i.severity === "critical").slice(0, 5).map(i => ({ title: i.description || i.detail }));
        const score = reportState?.healthScore || auditState?.score || null;
        const appUrl = process.env.APP_URL || "https://seo-agent.onrender.com";
        sendPipelineComplete({
          to:         toEmail,
          clientName: cData.name || cData.website || clientId,
          websiteUrl: cData.website || "",
          score,
          topIssues,
          agentUrl:   `${appUrl}`,
        }); // fire-and-forget
      }
    } catch { /* non-blocking */ }

    // ── Stage 7: Auto-fix generation (semi / full automation mode) ────────
    // If client has enabled semi or full automation, auto-generate AI fixes
    // for all autoFixable pending tasks and push them to the approval queue
    try {
      const clientDoc    = await db.collection("clients").doc(clientId).get();
      const autoMode     = clientDoc.data()?.automationMode || "manual";
      if (autoMode === "semi" || autoMode === "full") {
        await exec("A12", runA12);
        console.log(`[A0] Auto-fix (A12) triggered for ${clientId} — mode: ${autoMode}`);
      }
    } catch { /* non-blocking */ }

    // ── Stage 8: Initialize/update client AI memory (Level 3) ────────────
    // Runs after every pipeline so memory is always current
    try {
      await runA16(clientId, keys);
      console.log(`[A0] A16 memory updated for ${clientId}`);
    } catch { /* non-blocking */ }

  } catch (err) {
    console.error(`[A0] Pipeline fatal error for ${clientId}:`, err.message);
    await db.collection("clients").doc(clientId).update({
      pipelineStatus:      "failed",
      pipelineError:       `Fatal error: ${err.message}`,
      pipelineCompletedAt: new Date().toISOString(),
    });
  }
}

module.exports = { canRunAgent, getPipelineStatus, handleFailure, runFullPipeline, DEPENDENCY_CHAIN };
