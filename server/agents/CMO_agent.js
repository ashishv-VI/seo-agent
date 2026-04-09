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

  // ── Load cross-client global patterns ──────────────
  // 1. Same-owner patterns: what worked across this agency's clients
  // 2. Same-businessType patterns: what worked for similar industries
  const clientDoc   = await db.collection("clients").doc(clientId).get().catch(() => null);
  const clientData  = clientDoc?.data() || {};
  const ownerId     = clientData.ownerId || null;
  const businessType = (brief?.businessType || brief?.industry || "").toLowerCase().trim();

  let globalPatterns = [];
  if (ownerId) {
    // Own-agency patterns
    const ownPatterns = await db.collection("global_patterns")
      .where("ownerId", "==", ownerId)
      .limit(30)
      .get()
      .then(s => s.docs.map(d => d.data()))
      .catch(() => []);

    // Cross-agency similar-business patterns (no ownerId filter — any agency, same business type)
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
  }

  // Summarise patterns into a prompt-friendly string
  const patternSummary = buildPatternSummary(globalPatterns, clientMemory, businessType);

  // ── Rule-based signal extraction ─────────────────
  const signals = extractSignals({ brief, audit, keywords, competitor, onpage, technical, geo, report, rankings });

  // ── LLM decision ──────────────────────────────────
  const prompt = buildCMOPrompt(brief, signals, patternSummary);
  let decision;
  try {
    const raw = await callLLM(prompt, keys, { maxTokens: 2000, temperature: 0.2 });
    decision  = parseJSON(raw);
  } catch (e) {
    // Fallback: use rule-based decision if LLM fails
    decision = ruleBasedDecision(signals, brief);
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
    kpiImpact:   decision.kpiImpact   || [],
    signals,
    decidedAt:   new Date().toISOString(),
  };

  await saveState(clientId, "CMO_decision", result);
  return { success: true, cmo: result };
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
function buildPatternSummary(globalPatterns, clientMemory, businessType = "") {
  if (!globalPatterns.length && !clientMemory?.fixOutcomes?.length) return null;

  const lines = [];

  if (globalPatterns.length > 0) {
    // Split by source: same-owner vs same-businessType (different agency)
    const ownAgency   = globalPatterns.filter(p => !p._crossAgency);
    const crossAgency = globalPatterns.filter(p => p._crossAgency);

    // Same-owner aggregate
    if (ownAgency.length > 0) {
      const byType = {};
      for (const p of ownAgency) {
        if (!byType[p.fixType]) byType[p.fixType] = { improved: 0, total: 0 };
        byType[p.fixType].total++;
        if (p.outcome === "improved") byType[p.fixType].improved++;
      }
      const sorted = Object.entries(byType).sort((a, b) => (b[1].improved / b[1].total) - (a[1].improved / a[1].total));
      lines.push("Fix success rates across your clients:");
      for (const [fixType, counts] of sorted.slice(0, 5)) {
        const rate = Math.round((counts.improved / counts.total) * 100);
        lines.push(`  - ${fixType}: ${rate}% success (${counts.improved}/${counts.total})`);
      }
    }

    // Cross-agency same-business-type
    if (crossAgency.length > 0 && businessType) {
      const byType = {};
      for (const p of crossAgency) {
        if (!byType[p.fixType]) byType[p.fixType] = { improved: 0, total: 0 };
        byType[p.fixType].total++;
        if (p.outcome === "improved") byType[p.fixType].improved++;
      }
      const sorted = Object.entries(byType).sort((a, b) => (b[1].improved / b[1].total) - (a[1].improved / a[1].total));
      lines.push(`Industry benchmarks for "${businessType}" businesses:`);
      for (const [fixType, counts] of sorted.slice(0, 3)) {
        const rate = Math.round((counts.improved / counts.total) * 100);
        lines.push(`  - ${fixType}: ${rate}% success across ${counts.total} similar sites`);
      }
    }
  }

  // This client's own fix history
  const fixOutcomes = clientMemory?.fixOutcomes || [];
  if (fixOutcomes.length > 0) {
    const recent = fixOutcomes.slice(-10);
    const worked = recent.filter(f => f.outcome === "improved").map(f => f.field);
    const failed = recent.filter(f => f.outcome === "degraded" || f.outcome === "no_change").map(f => f.field);
    if (worked.length > 0) lines.push(`This client — fixes that worked: ${[...new Set(worked)].join(", ")}`);
    if (failed.length > 0) lines.push(`This client — fixes that didn't work: ${[...new Set(failed)].join(", ")}`);
  }

  return lines.length > 0 ? lines.join("\n") : null;
}

// ── LLM prompt ────────────────────────────────────
function buildCMOPrompt(brief, signals, patternSummary = null) {
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

## Available Agents to Trigger
- A2: Re-audit (if critical issues or drops)
- A5: Title/meta rewrite (if CTR is low)
- A6: On-page optimisation (if on-page issues)
- A7: Technical/speed fix (if PageSpeed poor)
- A11: Link building (if keywords stuck on page 2)
- A14: Content creation (if content gaps found)
${patternSummary ? `\n## Learning — What Has Worked (use this to improve confidence)\n${patternSummary}\n` : ""}
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
