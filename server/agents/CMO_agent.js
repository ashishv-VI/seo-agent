const { saveState, getState } = require("../shared-state/stateManager");
const { callLLM, parseJSON }  = require("../utils/llm");
const { db }                  = require("../config/firebase");

/**
 * CMO Agent — Autonomous Decision Layer (Sprint 3)
 *
 * Sees all pipeline data → decides what to fix next → auto-queues next agent.
 *
 * Decision logic:
 *   CTR low despite good position  → A5 title/meta rewrite
 *   Keywords on page 2 (11–20)     → A11 link building
 *   Ranking drops detected         → A2 re-audit
 *   Traffic good, leads low (<1%)  → A19 conversion (Sprint 4)
 *   Technical score poor (<60)     → A7 re-run
 *   Content gap found              → A14 content autopilot
 *
 * Returns: { decision, reasoning, nextAgents[], confidence, kpiImpact }
 */
async function runCMO(clientId, keys) {
  try {
  // Load all available pipeline data
  const [brief, audit, keywords, competitor, onpage, technical, geo, report, rankings] = await Promise.all([
    getState(clientId, "A1_brief").catch(() => null),
    getState(clientId, "A2_audit").catch(() => null),
    getState(clientId, "A3_keywords").catch(() => null),
    getState(clientId, "A4_competitor").catch(() => null),
    getState(clientId, "A6_onpage").catch(() => null),
    getState(clientId, "A7_technical").catch(() => null),
    getState(clientId, "A8_geo").catch(() => null),
    getState(clientId, "A9_report").catch(() => null),
    getState(clientId, "A10_rankings").catch(() => null),
  ]);

  if (!brief) return { success: false, error: "No brief — run A1 first" };

  // ── Load client fix history (A16 memory) ─────────
  const clientMemory = await db.collection("client_memory").doc(clientId).get()
    .then(d => d.exists ? d.data() : null).catch(() => null);

  // ── Load fresh fix_verification outcomes (the real feedback loop) ──
  // A16 writes to client_memory.fixOutcomes on a cadence, but the source of
  // truth is the fix_verification collection. Pull the last 50 checked docs
  // directly so CMO always sees the most recent win/fail signal.
  let recentVerifications = [];
  try {
    const verifySnap = await db.collection("fix_verification")
      .where("clientId", "==", clientId)
      .where("status",   "==", "checked")
      .orderBy("checkedAt", "desc")
      .limit(50)
      .get();
    recentVerifications = verifySnap.docs.map(d => d.data());
  } catch { /* non-blocking — index may not exist yet */ }

  // ── Load cross-client global patterns ──────────────
  // 1. Same-owner patterns: what worked across this agency's clients
  // 2. Same-businessType patterns: what worked for similar industries
  const clientDoc   = await db.collection("clients").doc(clientId).get().catch(() => null);
  const clientData  = clientDoc?.data() || {};
  const ownerId     = clientData.ownerId || null;
  const businessType = (brief?.businessType || brief?.industry || "").toLowerCase().trim();

  let globalPatterns = [];

  // Own-agency patterns (skip query only if truly no ownerId)
  const ownPatterns = ownerId
    ? await db.collection("global_patterns")
        .where("ownerId", "==", ownerId)
        .limit(30)
        .get()
        .then(s => s.docs.map(d => d.data()))
        .catch(() => [])
    : [];

  // Cross-agency similar-business patterns — normalize to lowercase for fuzzy match
  let similarPatterns = [];
  if (businessType) {
    similarPatterns = await db.collection("global_patterns")
      .where("businessType", "==", businessType)
      .limit(20)
      .get()
      .then(s => s.docs.map(d => d.data()).filter(p => p.ownerId !== ownerId))
      .catch(() => []);
  }

  // Mark cross-agency, then merge deduplicated
  const seen = new Set();
  for (const p of ownPatterns) {
    const key = `${p.fixType}:${p.ownerId}:${p.recordedAt}`;
    if (!seen.has(key)) { seen.add(key); globalPatterns.push(p); }
  }
  for (const p of similarPatterns) {
    const key = `${p.fixType}:${p.ownerId}:${p.recordedAt}`;
    if (!seen.has(key)) { seen.add(key); globalPatterns.push({ ...p, _crossAgency: true }); }
  }

  // Summarise patterns into a prompt-friendly string
  const patternSummary = buildPatternSummary(globalPatterns, clientMemory, businessType);

  // Structured pattern stats for the UI (separate from LLM prompt text)
  // Includes per-client playbook stats built from the fresh fix_verification pull
  // so the veto can check personal win rate, not just industry aggregate.
  const patternStats = buildPatternStats(globalPatterns, clientMemory, businessType, recentVerifications);

  // ── Pre-filter: identify playbooks that are failing for this client ─────
  // Done BEFORE the LLM sees the prompt so we can tell it which agents to avoid.
  // This is the "closed feedback loop" — historical outcomes directly shape the
  // decision space the LLM is allowed to propose from.
  const failingPlaybooks = identifyFailingPlaybooks(patternStats);
  const allowedAgents    = filterAllowedAgents(failingPlaybooks);

  // ── Rule-based signal extraction ─────────────────
  const signals = extractSignals({ brief, audit, keywords, competitor, onpage, technical, geo, report, rankings });

  // ── LLM decision ──────────────────────────────────
  // Prompt now tells the LLM which playbooks are proven to fail for this client
  // + industry, so it stops proposing them in the first place.
  const prompt = buildCMOPrompt(brief, signals, patternSummary, { failingPlaybooks, allowedAgents });
  let decision;
  try {
    const raw = await callLLM(prompt, keys, { maxTokens: 2000, temperature: 0.2 });
    decision  = parseJSON(raw);
  } catch (e) {
    // Fallback: use rule-based decision if LLM fails
    decision = ruleBasedDecision(signals, brief);
  }

  // ── Reweight confidence based on historical outcomes ──
  // If the LLM proposes an action that has historical data, blend its confidence
  // with the actual win rate from global_patterns + client_memory + fresh verifications.
  const confidenceAdjustment = reweightConfidence(decision, patternStats, recentVerifications);
  decision.confidence = confidenceAdjustment.confidence;
  decision.confidenceReasoning = confidenceAdjustment.reasoning;

  // ── Playbook meta-learning veto (safety net) ──
  // Pre-filter should already have handled this, but the LLM can still ignore
  // instructions — this is the backstop that enforces the rule regardless.
  const playbookVeto = vetoFailingPlaybooks(decision.nextAgents || [], patternStats);
  if (playbookVeto.abandoned.length > 0) {
    decision.nextAgents = playbookVeto.kept;
    decision.playbookAbandoned = playbookVeto.abandoned;
    decision.reasoning = `${decision.reasoning || ""} [Abandoned playbooks: ${playbookVeto.abandoned.map(p => p.playbook).join(", ")} — historical win rate too low]`;
    console.log(`[CMO] Abandoned ${playbookVeto.abandoned.length} failing playbook(s) for ${clientId}`);
  }

  // ── Schedule next agents ──────────────────────────
  const nextAgents = (decision.nextAgents || []).slice(0, 3);
  if (nextAgents.length > 0) {
    await db.collection("cmo_queue").add({
      clientId,
      decision:    decision.decision,
      reasoning:   decision.reasoning,
      nextAgents,
      confidence:  decision.confidence || 0.7,
      kpiImpact:   decision.kpiImpact  || [],
      status:      "pending",
      createdAt:   new Date().toISOString(),
    });
  }

  const result = {
    decision:    decision.decision    || "Monitor & maintain current strategy",
    reasoning:   decision.reasoning   || "Insufficient data for a specific recommendation",
    nextAgents,
    confidence:  decision.confidence  || 0.7,
    confidenceReasoning: decision.confidenceReasoning || null,
    kpiImpact:   decision.kpiImpact   || [],
    signals,
    patternStats,
    decidedAt:   new Date().toISOString(),
  };

  await saveState(clientId, "CMO_decision", result);
  return { success: true, cmo: result };
  } catch (e) {
    console.error(`[CMO] Decision failed for ${clientId}:`, e.message);
    return { success: false, error: e.message };
  }
}

// ── Signal extraction (rule-based, no LLM) ────────
function extractSignals({ brief, audit, keywords, competitor, onpage, technical, geo, report, rankings }) {
  const signals = {};

  // Technical health
  const techScore   = technical?.summary?.mobileScore || technical?.summary?.desktopScore || null;
  const healthScore = audit?.healthScore || null;
  signals.technicalPoor    = techScore != null && techScore < 60;
  signals.healthPoor       = healthScore != null && healthScore < 50;
  signals.p1IssuesCount    = (audit?.issues?.p1 || []).length;
  signals.hasCriticalIssues = signals.p1IssuesCount > 0;

  // Keyword / ranking signals
  const rankData   = keywords?.clusters || {};
  const allKw      = Object.values(rankData).flat();
  const page2Kws   = allKw.filter(k => k.currentPosition && k.currentPosition >= 11 && k.currentPosition <= 30);
  const droppingKws = (rankings?.drops || []).length;
  signals.page2Count   = page2Kws.length;
  signals.hasPage2Kws  = page2Kws.length > 0;
  signals.hasDrops     = droppingKws > 0;
  signals.droppingKws  = droppingKws;

  // CTR signals (from report gscSummary)
  const gsc = report?.gscSummary;
  if (gsc) {
    const avgPos = gsc.avgPos || 10;
    const avgCtr = gsc.avgCtr || 0;
    // Expected CTR at pos 5 is ~5%, at pos 1 is ~25%
    const expectedCtr = avgPos <= 3 ? 0.15 : avgPos <= 5 ? 0.07 : avgPos <= 10 ? 0.025 : 0.01;
    signals.ctrLow    = avgCtr < expectedCtr * 0.7; // CTR is < 70% of expected
    signals.avgCtr    = avgCtr;
    signals.avgPos    = avgPos;
  }

  // Content gaps
  signals.contentGaps = (keywords?.gaps || []).length + (competitor?.analysis?.contentGaps?.length || 0);
  signals.hasContentGaps = signals.contentGaps > 2;

  // KPI selection
  signals.kpi = [].concat(brief?.kpiSelection || ["Organic Traffic Growth"]);

  return signals;
}

// ── Cross-client pattern summary for CMO prompt ───
// Reweight LLM confidence using historical win rates + this client's past failures.
// recentVerifications = fresh fix_verification rows that may not yet be in client_memory.
function reweightConfidence(decision, patternStats, recentVerifications = []) {
  const llmConf = Math.max(0, Math.min(1, decision.confidence || 0.7));
  const decisionText = (decision.decision || "").toLowerCase();

  // Map decision keywords → fix types we track in global_patterns
  const fixTypeMap = [
    { kw: ["meta", "title", "ctr"],          fixType: "meta_title" },
    { kw: ["content", "refresh", "rewrite"], fixType: "content_refresh" },
    { kw: ["link", "backlink", "outreach"],  fixType: "link_building" },
    { kw: ["schema", "structured"],          fixType: "schema" },
    { kw: ["cwv", "pagespeed", "performance", "speed"], fixType: "technical_speed" },
    { kw: ["h1", "heading"],                 fixType: "on_page" },
  ];
  const matched = fixTypeMap.find(m => m.kw.some(k => decisionText.includes(k)));
  const fixType = matched?.fixType;

  if (!fixType) {
    return { confidence: llmConf, reasoning: "LLM confidence (no historical match)" };
  }

  // Fresh fix_verification signal — takes precedence over everything else
  // because it's the most recent, un-aggregated truth for THIS client.
  const recentForType = recentVerifications.filter(v =>
    v.field && v.field.toLowerCase().includes(fixType.split("_")[0])
  );
  if (recentForType.length >= 2) {
    const improved = recentForType.filter(v => v.outcome === "improved").length;
    const clientRate = improved / recentForType.length;
    // If this client has recent direct evidence, anchor confidence to it heavily.
    const blended = (llmConf * 0.3) + (clientRate * 0.7);
    return {
      confidence: Math.round(blended * 100) / 100,
      reasoning: `Blended with this client's recent ${Math.round(clientRate * 100)}% win rate on ${fixType} (n=${recentForType.length}, from fix_verification)`,
    };
  }

  // Look up win rate in ownAgency first, then crossAgency
  const all = [...(patternStats.ownAgency || []), ...(patternStats.crossAgency || [])];
  const match = all.find(p => p.fixType === fixType);

  // Check this client's own failure list
  const failedHere = (patternStats.thisClient?.failed || []).some(f =>
    f && f.toLowerCase().includes(fixType.split("_")[0])
  );

  if (failedHere) {
    return {
      confidence: Math.max(0.35, llmConf - 0.25),
      reasoning: `Downweighted: ${fixType} previously failed for this client`,
    };
  }

  if (match && match.sample >= 3) {
    const histRate = match.winRate / 100;
    // Blend LLM confidence with historical rate (weighted by sample size)
    const weight = Math.min(1, match.sample / 10);
    const blended = (llmConf * (1 - weight)) + (histRate * weight);
    return {
      confidence: Math.round(blended * 100) / 100,
      reasoning: `Blended with ${match.winRate}% historical win rate (n=${match.sample})`,
    };
  }

  return { confidence: llmConf, reasoning: "LLM confidence (insufficient history)" };
}

// ── Playbook meta-learning ─────────────────────────
// Maps raw fix types to high-level playbooks. If an entire playbook is failing
// in an industry, CMO should try a different playbook instead of retrying.
const FIX_TO_PLAYBOOK = {
  seo_title: "on_page", meta_description: "on_page", missing_title: "on_page",
  missing_meta_desc: "on_page", short_title: "on_page", long_title: "on_page",
  missing_h1: "on_page", multiple_h1: "on_page", title_tag: "on_page", meta_desc: "on_page",
  missing_canonical: "technical", canonical_tag: "technical", no_viewport: "technical",
  slow_response_time: "technical", redirect_chain: "technical", missing_ssl: "technical",
  slow_ttfb: "technical", mixed_content: "technical",
  missing_schema: "schema", schema_tag: "schema",
  thin_content: "content", content_gap: "content", keyword_cannibalization: "content",
  content_refresh: "content", blog_post: "content",
  low_internal_links: "linking", broken_internal_link: "linking",
  link_building: "linking", backlink: "linking",
  citation_missing: "local", gmb_not_optimized: "local", nap_inconsistent: "local",
};
const AGENT_TO_PLAYBOOK = {
  A5: "content", A6: "on_page", A7: "technical",
  A8: "local",   A11: "linking", A14: "content",
};

function computePlaybookStats(patterns) {
  const byPlaybook = {};
  for (const p of patterns) {
    const pb = FIX_TO_PLAYBOOK[p.fixType] || "other";
    if (!byPlaybook[pb]) byPlaybook[pb] = { improved: 0, total: 0 };
    byPlaybook[pb].total++;
    if (p.outcome === "improved") byPlaybook[pb].improved++;
  }
  return Object.entries(byPlaybook).map(([playbook, c]) => ({
    playbook,
    winRate: Math.round((c.improved / c.total) * 100),
    sample:  c.total,
    verdict: c.total >= 5 && (c.improved / c.total) < 0.4 ? "failing"
           : c.total >= 3 && (c.improved / c.total) >= 0.7 ? "winning"
           : "neutral",
  }));
}

// Remove next-agents whose playbook is proven to fail in this industry.
// Returns { kept: [...], abandoned: [{ agent, playbook, winRate, sample }] }.
function vetoFailingPlaybooks(nextAgents, patternStats) {
  const result = { kept: [], abandoned: [] };
  const failing = identifyFailingPlaybooks(patternStats);
  const allStats = [
    ...((patternStats.playbooks?.thisClient) || []),
    ...((patternStats.playbooks?.crossAgency) || []),
    ...((patternStats.playbooks?.ownAgency)   || []),
  ];

  for (const agent of nextAgents) {
    const playbook = AGENT_TO_PLAYBOOK[agent];
    if (playbook && failing.has(playbook)) {
      const stat = allStats.find(s => s.playbook === playbook);
      result.abandoned.push({ agent, playbook, winRate: stat?.winRate, sample: stat?.sample });
    } else {
      result.kept.push(agent);
    }
  }
  return result;
}

// ── Per-client + industry playbook veto identification ───────────────
// Per-client data wins over industry data — a client that actually succeeds with
// a playbook should keep using it even if the industry average is bad.
// Returns a Set of playbook names that should be abandoned.
function identifyFailingPlaybooks(patternStats) {
  const failing = new Set();

  // 1. Per-client playbook stats take precedence. If this specific client has
  //    ≥3 samples of a playbook and <40% win rate, veto it immediately.
  for (const s of (patternStats.playbooks?.thisClient || [])) {
    if (s.sample >= 3 && s.winRate < 40) failing.add(s.playbook);
  }

  // 2. Industry-wide signal — only applied if per-client has no opinion.
  //    (If per-client says it works, don't let the global aggregate override.)
  const perClientPlaybooks = new Set((patternStats.playbooks?.thisClient || [])
    .filter(s => s.sample >= 3)
    .map(s => s.playbook));

  const industryStats = [
    ...((patternStats.playbooks?.crossAgency) || []),
    ...((patternStats.playbooks?.ownAgency)   || []),
  ];
  for (const s of industryStats) {
    if (perClientPlaybooks.has(s.playbook)) continue; // client data trumps industry
    if (s.verdict === "failing") failing.add(s.playbook);
  }

  return failing;
}

// Invert: given the failing set, return the list of agents CMO IS allowed
// to propose. Used to shape the LLM prompt up-front.
function filterAllowedAgents(failingPlaybooks) {
  return Object.entries(AGENT_TO_PLAYBOOK)
    .filter(([_agent, playbook]) => !failingPlaybooks.has(playbook))
    .map(([agent]) => agent);
}

// Structured stats for the UI — returns { ownAgency: [], crossAgency: [], thisClient: {} }
// recentVerifications = fresh rows from fix_verification collection for *this* client.
// These build per-client playbook stats so the veto can trust personal history.
function buildPatternStats(globalPatterns, clientMemory, businessType = "", recentVerifications = []) {
  const stats = { ownAgency: [], crossAgency: [], thisClient: { worked: [], failed: [] }, businessType };
  if (!globalPatterns.length && !clientMemory?.fixOutcomes?.length && !recentVerifications.length) return stats;

  const own   = globalPatterns.filter(p => !p._crossAgency);
  const cross = globalPatterns.filter(p => p._crossAgency);

  const aggregate = (arr) => {
    const byType = {};
    for (const p of arr) {
      if (!byType[p.fixType]) byType[p.fixType] = { improved: 0, total: 0 };
      byType[p.fixType].total++;
      if (p.outcome === "improved") byType[p.fixType].improved++;
    }
    return Object.entries(byType)
      .map(([fixType, c]) => ({
        fixType,
        winRate: Math.round((c.improved / c.total) * 100),
        sample: c.total,
      }))
      .sort((a, b) => b.winRate - a.winRate)
      .slice(0, 5);
  };

  stats.ownAgency   = aggregate(own);
  stats.crossAgency = aggregate(cross);

  // Per-client playbook stats — built from both A16 memory AND the fresh
  // fix_verification pull. These are normalised into the same shape that
  // computePlaybookStats produces for agency/cross-agency data.
  const thisClientPatterns = [];
  for (const v of recentVerifications) {
    if (v.field && v.outcome && v.outcome !== "no_data") {
      thisClientPatterns.push({ fixType: v.field, outcome: v.outcome });
    }
  }
  for (const f of (clientMemory?.fixOutcomes || [])) {
    if (f.field && f.outcome && f.outcome !== "no_data") {
      thisClientPatterns.push({ fixType: f.field, outcome: f.outcome });
    }
  }

  // Playbook-level rollup for meta-learning
  stats.playbooks = {
    ownAgency:   computePlaybookStats(own),
    crossAgency: computePlaybookStats(cross),
    thisClient:  computePlaybookStats(thisClientPatterns),
  };

  const fixOutcomes = clientMemory?.fixOutcomes || [];
  const recent = fixOutcomes.slice(-10);
  stats.thisClient.worked = [...new Set(recent.filter(f => f.outcome === "improved").map(f => f.field))];
  stats.thisClient.failed = [...new Set(recent.filter(f => f.outcome === "degraded" || f.outcome === "no_change").map(f => f.field))];

  return stats;
}

function buildPatternSummary(globalPatterns, clientMemory, businessType = "") {
  if (!globalPatterns.length && !clientMemory?.fixOutcomes?.length) return null;

  const lines = [];

  if (globalPatterns.length > 0) {
    const ownAgency   = globalPatterns.filter(p => !p._crossAgency);
    const crossAgency = globalPatterns.filter(p => p._crossAgency);

    // Aggregate with unique client counts and avg CTR delta
    const deepAggregate = (arr) => {
      const byType = {};
      for (const p of arr) {
        if (!byType[p.fixType]) byType[p.fixType] = { improved: 0, total: 0, clients: new Set(), ctrDeltas: [] };
        byType[p.fixType].total++;
        if (p.outcome === "improved") byType[p.fixType].improved++;
        if (p.clientId) byType[p.fixType].clients.add(p.clientId);
        if (p.ctrBefore != null && p.ctrAfter != null) {
          byType[p.fixType].ctrDeltas.push(p.ctrAfter - p.ctrBefore);
        }
      }
      return Object.entries(byType)
        .map(([fixType, c]) => {
          const winRate = Math.round((c.improved / c.total) * 100);
          const avgCtrDelta = c.ctrDeltas.length > 0
            ? (c.ctrDeltas.reduce((a, b) => a + b, 0) / c.ctrDeltas.length * 100).toFixed(1)
            : null;
          return { fixType, winRate, improved: c.improved, total: c.total, clientCount: c.clients.size, avgCtrDelta };
        })
        .sort((a, b) => b.winRate - a.winRate);
    };

    // Own-agency: deep aggregate with confidence language
    if (ownAgency.length > 0) {
      const agg = deepAggregate(ownAgency);
      lines.push("Fix success rates across your clients:");
      for (const a of agg.slice(0, 5)) {
        const conf = a.winRate >= 80 && a.total >= 3 ? "HIGH CONFIDENCE" : a.winRate >= 60 ? "MODERATE" : "LOW";
        const ctr = a.avgCtrDelta ? `, avg CTR change: ${a.avgCtrDelta > 0 ? "+" : ""}${a.avgCtrDelta}%` : "";
        const clients = a.clientCount > 1 ? ` across ${a.clientCount} clients` : "";
        lines.push(`  - ${a.fixType}: ${a.winRate}% success (${a.improved}/${a.total}${clients}${ctr}) → ${conf}`);
      }
    }

    // Cross-agency: reasoning about similar businesses
    if (crossAgency.length > 0 && businessType) {
      const agg = deepAggregate(crossAgency);
      lines.push(`\nIndustry intelligence for "${businessType}" businesses (from other agencies):`);
      for (const a of agg.slice(0, 3)) {
        const ctr = a.avgCtrDelta ? ` (avg ${a.avgCtrDelta > 0 ? "+" : ""}${a.avgCtrDelta}% CTR)` : "";
        if (a.winRate >= 70 && a.total >= 2) {
          lines.push(`  - ${a.fixType}: worked for ${a.improved}/${a.total} similar ${businessType} sites${ctr} — RECOMMEND for this client`);
        } else if (a.winRate < 40) {
          lines.push(`  - ${a.fixType}: only ${a.winRate}% success for ${businessType} sites — AVOID or try different approach`);
        } else {
          lines.push(`  - ${a.fixType}: ${a.winRate}% success (${a.total} data points)${ctr}`);
        }
      }
    }
  }

  // This client's own fix history — with recency
  const fixOutcomes = clientMemory?.fixOutcomes || [];
  if (fixOutcomes.length > 0) {
    const recent = fixOutcomes.slice(-10);
    const worked = [...new Set(recent.filter(f => f.outcome === "improved").map(f => f.field))];
    const failed = [...new Set(recent.filter(f => f.outcome === "degraded" || f.outcome === "no_change").map(f => f.field))];
    if (worked.length > 0) lines.push(`\nThis client — fixes that WORKED: ${worked.join(", ")} (repeat these)`);
    if (failed.length > 0) lines.push(`This client — fixes that FAILED: ${failed.join(", ")} (try different approach)`);
  }

  return lines.length > 0 ? lines.join("\n") : null;
}

// ── LLM prompt ────────────────────────────────────
function buildCMOPrompt(brief, signals, patternSummary = null, vetoContext = {}) {
  const { failingPlaybooks = new Set(), allowedAgents = null } = vetoContext;
  const allAgents = ["A2", "A5", "A6", "A7", "A11", "A14"];
  const pickFrom  = allowedAgents && allowedAgents.length > 0
    ? allowedAgents.filter(a => allAgents.includes(a))
    : allAgents;

  const vetoBlock = failingPlaybooks.size > 0
    ? `\n## DO NOT PROPOSE THESE PLAYBOOKS\nThe following playbooks have been proven to FAIL (either for this client or this industry):\n${[...failingPlaybooks].map(p => `- ${p}`).join("\n")}\nDo NOT propose any agent that belongs to these playbooks. Pick a different approach.\n`
    : "";

  return `You are the CMO Agent for an SEO AI platform. Your job is to analyse the signals below and decide the single most impactful next action for this client.

Client: ${brief.businessName} (${brief.websiteUrl})
Primary KPIs: ${[].concat(brief.kpiSelection || ["Organic Traffic Growth"]).join(", ")}
Goals: ${[].concat(brief.goals || []).join(", ")}

## Current SEO Signals
- Technical health score: ${signals.healthPoor ? "POOR (<50)" : "OK"}
- P1 critical issues: ${signals.p1IssuesCount}
- Mobile PageSpeed: ${signals.technicalPoor ? "POOR (<60)" : "OK"}
- Keywords on page 2 (positions 11-30): ${signals.page2Count}
- Ranking drops detected: ${signals.droppingKws}
- CTR low vs expected: ${signals.ctrLow ? "YES" : "NO"} (CTR: ${((signals.avgCtr || 0)*100).toFixed(1)}% at pos ${(signals.avgPos||0).toFixed(1)})
- Content gaps found: ${signals.contentGaps}

## Available Agents to Trigger (pick ONLY from this list)
${pickFrom.map(a => {
  const labels = { A2: "Re-audit (if critical issues or drops)", A5: "Title/meta rewrite (if CTR is low)", A6: "On-page optimisation (if on-page issues)", A7: "Technical/speed fix (if PageSpeed poor)", A11: "Link building (if keywords stuck on page 2)", A14: "Content creation (if content gaps found)" };
  return `- ${a}: ${labels[a] || a}`;
}).join("\n")}
${vetoBlock}${patternSummary ? `\n## Learning — What Has Worked (use this to improve confidence)\n${patternSummary}\n` : ""}
Return ONLY valid JSON:
{
  "decision": "one sentence describing the strategic focus",
  "reasoning": "2-3 sentences explaining why based on the signals",
  "nextAgents": ["A5", "A11"],
  "confidence": 0.85,
  "kpiImpact": [
    { "kpi": "Organic Traffic Growth", "expectedLift": "+15-25% in 60 days", "mechanism": "title rewrites → CTR improvement" }
  ]
}`;
}

// ── Rule-based fallback ───────────────────────────
function ruleBasedDecision(signals, brief) {
  const kpi = [].concat(brief?.kpiSelection || ["Organic Traffic Growth"])[0];

  if (signals.hasCriticalIssues || signals.healthPoor) {
    return {
      decision:   "Fix critical technical issues before any other work",
      reasoning:  `${signals.p1IssuesCount} critical P1 issues are actively blocking rankings. These must be resolved first — no other SEO work has meaningful impact while the site has technical blockers.`,
      nextAgents: ["A2", "A6"],
      confidence: 0.95,
      kpiImpact:  [{ kpi, expectedLift: "Unlocks indexing", mechanism: "Remove technical blockers" }],
    };
  }
  if (signals.ctrLow) {
    return {
      decision:   "Rewrite title tags and meta descriptions to improve click-through rate",
      reasoning:  `CTR is below expected for the current ranking positions. The site is visible in search results but users aren't clicking. Title and meta rewrites are the highest-leverage action.`,
      nextAgents: ["A5", "A6"],
      confidence: 0.88,
      kpiImpact:  [{ kpi, expectedLift: "+20-35% clicks in 30 days", mechanism: "CTR improvement from compelling titles" }],
    };
  }
  if (signals.hasPage2Kws) {
    return {
      decision:   "Build backlinks to push page-2 keywords into top 10",
      reasoning:  `${signals.page2Count} keywords are on page 2 — just a few positions from generating significant organic traffic. Targeted link building is the most efficient way to close this gap.`,
      nextAgents: ["A11"],
      confidence: 0.82,
      kpiImpact:  [{ kpi, expectedLift: "+40-60% impressions in 90 days", mechanism: "Page 2 → Page 1 ranking jump" }],
    };
  }
  if (signals.hasContentGaps) {
    return {
      decision:   "Create content to fill identified keyword and topic gaps",
      reasoning:  `${signals.contentGaps} content gaps found where competitors rank but this site has no content. Creating targeted content captures currently missed traffic.`,
      nextAgents: ["A14", "A5"],
      confidence: 0.78,
      kpiImpact:  [{ kpi, expectedLift: "+25-50% impressions in 90 days", mechanism: "New content targeting uncovered keywords" }],
    };
  }

  return {
    decision:   "Maintain current strategy — focus on monitoring and content freshness",
    reasoning:  "No critical signals detected. Site is in a healthy state. Continue monitoring rankings and refresh existing content.",
    nextAgents: [],
    confidence: 0.6,
    kpiImpact:  [],
  };
}

module.exports = { runCMO };
