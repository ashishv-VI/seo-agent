const { saveState, getState } = require("../shared-state/stateManager");
const { callLLM, parseJSON }  = require("../utils/llm");
const { db }                  = require("../config/firebase");
const {
  buildPatternStats,
  buildPatternSummary,
  identifyFailingPlaybooks,
  filterAllowedAgents,
  vetoFailingPlaybooks,
} = require("./cmoPlaybooks");
const {
  reweightConfidence,
  buildCMOPrompt,
  ruleBasedDecision,
} = require("./cmoDecision");

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
async function runCMO(clientId, keys, masterPrompt) {
  try {
  // Load all available pipeline data — 19 sources total
  const [
    brief, audit, keywords, competitor, onpage, technical, geo, report, rankings, a17Review,
    a15Competitor, a22Predictive, a24Strategist, a25CoreUpdate,
    ai3Volatility, ai5Seasonal, ai7Decay, ai9ZeroClick,
  ] = await Promise.all([
    getState(clientId, "A1_brief").catch(() => null),
    getState(clientId, "A2_audit").catch(() => null),
    getState(clientId, "A3_keywords").catch(() => null),
    getState(clientId, "A4_competitor").catch(() => null),
    getState(clientId, "A6_onpage").catch(() => null),
    getState(clientId, "A7_technical").catch(() => null),
    getState(clientId, "A8_geo").catch(() => null),
    getState(clientId, "A9_report").catch(() => null),
    getState(clientId, "A10_rankings").catch(() => null),
    getState(clientId, "A17_review").catch(() => null),
    // New: 9 more agents now connected to CMO
    getState(clientId, "A15_competitorMonitor").catch(() => null),
    getState(clientId, "A22_predictive").catch(() => null),
    getState(clientId, "A24_strategist").catch(() => null),
    getState(clientId, "A25_coreUpdateScanner").catch(() => null),
    getState(clientId, "AI3_serpVolatility").catch(() => null),
    getState(clientId, "AI5_seasonalOpportunity").catch(() => null),
    getState(clientId, "AI7_contentDecay").catch(() => null),
    getState(clientId, "AI9_zeroClick").catch(() => null),
  ]);

  if (!brief) return { success: false, error: "No brief — run A1 first" };

  // ── Revenue signals: load conversion data from Firestore ─────────────────
  // conversions collection stores form submits / phone clicks / WhatsApp clicks
  // Each record has: keyword, landingPage, submittedAt, type
  let revenueSignals = { totalLeads: 0, leadsByKeyword: {}, last30dLeads: 0, last90dLeads: 0, topLeadKeywords: [] };
  try {
    const convSnap = await db.collection("conversions")
      .where("clientId", "==", clientId)
      .orderBy("submittedAt", "desc")
      .limit(200)
      .get();
    const convs = convSnap.docs.map(d => d.data());
    const now90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const now30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    revenueSignals.totalLeads  = convs.length;
    revenueSignals.last30dLeads = convs.filter(c => (c.submittedAt || "") >= now30).length;
    revenueSignals.last90dLeads = convs.filter(c => (c.submittedAt || "") >= now90).length;

    // Group by keyword — how many leads each keyword generated
    const byKw = {};
    for (const c of convs) {
      const kw = c.keyword || c.source_keyword || null;
      if (kw) byKw[kw] = (byKw[kw] || 0) + 1;
    }
    revenueSignals.leadsByKeyword = byKw;
    revenueSignals.topLeadKeywords = Object.entries(byKw)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([kw, count]) => ({ keyword: kw, leads: count }));
    revenueSignals.zeroLeadKeywords90d = (keywords?.keywordMap || [])
      .filter(k => {
        const kLeads = byKw[k.keyword] || 0;
        return kLeads === 0;
      })
      .slice(0, 10)
      .map(k => k.keyword);
  } catch { /* non-blocking — conversions may not be set up */ }

  // ── A17 quality scores — downweight low-confidence agent data ─────────────
  // A17 scores each agent output 0–1. If an agent scored < 0.5 its data is
  // unreliable. We build a quality map so extractSignals + the LLM prompt can
  // treat low-quality outputs as directional hints rather than hard signals.
  const agentQuality = {};
  if (a17Review?.scores) {
    for (const [agentId, scoreData] of Object.entries(a17Review.scores)) {
      agentQuality[agentId] = typeof scoreData === "number" ? scoreData : (scoreData?.score ?? 1);
    }
  }
  const lowQualityAgents = Object.entries(agentQuality)
    .filter(([, score]) => score < 0.5)
    .map(([id]) => id);

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

  // ── A0 Strategy — read topPriority, quickWins, criticalWarnings, aiSearchStrategy ──
  const a0Strategy = clientData.seoHeadStrategy || null;
  const a0Summary  = clientData.seoHeadSummary  || null;

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

  // ── Rule-based signal extraction — all sources + revenue signals ─────────
  const signals = extractSignals({
    brief, audit, keywords, competitor, onpage, technical, geo, report, rankings,
    a0Strategy, a15Competitor, a22Predictive, a24Strategist, a25CoreUpdate,
    ai3Volatility, ai5Seasonal, ai7Decay, ai9ZeroClick,
    revenueSignals,
  });

  // ── LLM decision ──────────────────────────────────
  // Prompt tells the LLM which playbooks are proven to fail + which agent outputs
  // are low quality (A17 score < 0.5) so it treats them as directional only.
  const prompt = buildCMOPrompt(brief, signals, patternSummary, { failingPlaybooks, allowedAgents, lowQualityAgents });
  let decision;
  try {
    const raw = await callLLM(prompt, keys, {
      system:    masterPrompt || undefined,
      maxTokens: 2000,
      temperature: 0.2,
    });
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
  const confidence = decision.confidence || 0.7;

  if (nextAgents.length > 0) {
    await db.collection("cmo_queue").add({
      clientId,
      decision:    decision.decision,
      reasoning:   decision.reasoning,
      nextAgents,
      confidence,
      kpiImpact:   decision.kpiImpact  || [],
      status:      "pending",
      createdAt:   new Date().toISOString(),
    });

    // ── Medium-confidence (0.7–0.84): create in-app notification asking for approval.
    // Previously these items were queued but silently skipped by the cmo_queue consumer
    // (which only auto-executes ≥0.85). The user never knew a decision was waiting.
    if (confidence >= 0.7 && confidence < 0.85) {
      try {
        const clientDoc = await db.collection("clients").doc(clientId).get().catch(() => null);
        const ownerId   = clientDoc?.data()?.ownerId;
        if (ownerId) {
          await db.collection("notifications").add({
            clientId,
            ownerId,
            type:    "cmo_approval_needed",
            title:   `CMO Recommendation — Approval Needed`,
            message: `${decision.decision || "Strategic action ready"}. Confidence: ${Math.round(confidence * 100)}%. Agents: ${nextAgents.join(", ")}. Open CMO tab to approve.`,
            meta:    { confidence, nextAgents, reasoning: decision.reasoning },
            read:    false,
            createdAt: new Date().toISOString(),
          });
        }
      } catch { /* non-blocking */ }
    }

    // ── Below 0.7: flag as "needs more data" — still visible, not auto-executed
    if (confidence < 0.7) {
      decision.reasoning = `${decision.reasoning || ""} [Low confidence — more pipeline data needed before acting]`;
    }
  }

  // pageActions: prefer LLM-generated (URL + exact fix + impact),
  // fall back to rule-based topPageActions from signal extraction
  const llmPageActions = Array.isArray(decision.pageActions) ? decision.pageActions : [];
  const pageActions = llmPageActions.length > 0
    ? llmPageActions
    : (signals.topPageActions || []).map((p, idx) => ({
        url:            p.url,
        fix:            `${p.action.replace(/_/g, " ")}: ${p.detail}`,
        expectedImpact: p.impact,
        priority:       idx + 1,
        source:         p.source,
        keyword:        p.keyword || null,
      }));

  const result = {
    decision:    decision.decision    || "Monitor & maintain current strategy",
    reasoning:   decision.reasoning   || "Insufficient data for a specific recommendation",
    nextAgents,
    confidence:  decision.confidence  || 0.7,
    confidenceReasoning: decision.confidenceReasoning || null,
    kpiImpact:   decision.kpiImpact   || [],
    pageActions,
    signals,
    patternStats,
    agentQuality,
    lowQualityAgents,
    // Revenue summary — surfaced in Control Room CMO banner
    revenueSummary: {
      totalLeads30d:    revenueSignals.last30dLeads    || 0,
      totalLeads90d:    revenueSignals.last90dLeads    || 0,
      totalLeadsAllTime: revenueSignals.totalLeads     || 0,
      topLeadKeywords:  revenueSignals.topLeadKeywords || [],
      hasLeadData:      revenueSignals.totalLeads > 0,
      lowLeadRate:      signals.lowLeadRate || false,
    },
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
function extractSignals({ brief, audit, keywords, competitor, onpage, technical, geo, report, rankings,
  a0Strategy, a15Competitor, a22Predictive, a24Strategist, a25CoreUpdate,
  ai3Volatility, ai5Seasonal, ai7Decay, ai9ZeroClick,
  revenueSignals = {},
}) {
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
    signals.ctrLow       = avgCtr < expectedCtr * 0.7;
    signals.avgCtr       = avgCtr;
    signals.avgPos       = avgPos;
    signals.monthlyClicks = gsc.totalClicks || 0;
    signals.clicksDelta   = gsc.clicksDelta  || null;
    signals.impressions   = gsc.totalImpress || 0;
  }

  // Content gaps
  signals.contentGaps = (keywords?.gaps || []).length + (competitor?.analysis?.contentGaps?.length || 0);
  signals.hasContentGaps = signals.contentGaps > 2;

  // Kill-signal: keywords ranked 90+ days with 0 conversions
  // A3 marks these as deprioritized with killReason. CMO should stop investing
  // in content/links for these clusters and reallocate effort elsewhere.
  const killedKeywords = (keywords?.keywordMap || []).filter(k => k.deprioritized && k.killReason);
  signals.killedKeywordCount = killedKeywords.length;
  signals.hasKilledKeywords  = killedKeywords.length >= 3;
  signals.killedKeywords     = killedKeywords.slice(0, 10).map(k => k.keyword);

  // KPI selection
  signals.kpi = [].concat(brief?.kpiSelection || ["Organic Traffic Growth"]);

  // ── Revenue / Lead attribution signals ───────────────────────────────────
  signals.totalLeads30d    = revenueSignals.last30dLeads || 0;
  signals.totalLeads90d    = revenueSignals.last90dLeads || 0;
  signals.totalLeadsAllTime = revenueSignals.totalLeads || 0;
  signals.topLeadKeywords  = revenueSignals.topLeadKeywords || [];
  signals.hasLeadData      = revenueSignals.totalLeads > 0;
  signals.lowLeadRate      = signals.hasLeadData && signals.monthlyClicks > 500 && signals.totalLeads30d < 2;
  // Keywords with 0 leads (conversion-kill signal for CMO)
  signals.zeroLeadKeywords = revenueSignals.zeroLeadKeywords90d || [];
  signals.hasZeroLeadKws   = (revenueSignals.zeroLeadKeywords90d || []).length >= 3;

  // ── Page-level specific signals ───────────────────────────────────────────
  // Extract the most actionable page-specific opportunities so the CMO can
  // give a page-URL + exact fix + expected impact (not just "run A5").
  const pageSignals = [];

  // Pages with P1 issues from A2 audit
  const auditPages = audit?.pages || [];
  for (const pg of auditPages.slice(0, 50)) {
    const p1Issues = (pg.issues || []).filter(i => i.severity === "p1" || i.severity === "P1");
    if (p1Issues.length > 0) {
      pageSignals.push({
        url:    pg.url,
        issue:  p1Issues[0].type,
        detail: p1Issues[0].detail || p1Issues[0].fix || "",
        impact: "blocks ranking",
        action: "fix",
        source: "A2",
      });
    }
  }

  // Pages with low CTR from A6 onpage fixes
  const onpageFixes = onpage?.fixes || [];
  for (const fix of onpageFixes.slice(0, 30)) {
    if (fix.type === "title_tag" || fix.type === "meta_description" || fix.type === "missing_title") {
      pageSignals.push({
        url:    fix.url || fix.page,
        issue:  fix.type,
        detail: fix.current ? `Current: "${fix.current}"` : (fix.detail || ""),
        impact: "low CTR",
        action: "rewrite",
        source: "A6",
      });
    }
  }

  // Page-2 keywords — which specific URL needs a backlink
  const rankMatrix = competitor?.rankingMatrix || [];
  for (const kw of rankMatrix.filter(k => k.clientRank >= 11 && k.clientRank <= 30).slice(0, 10)) {
    pageSignals.push({
      url:    kw.clientPage || kw.page || null,
      keyword: kw.keyword,
      issue:  "page_2_ranking",
      detail: `Position ${kw.clientRank} — needs 1-2 backlinks to reach page 1`,
      impact: "traffic gain",
      action: "build_link",
      source: "A4",
    });
  }

  // Missing schema on key pages
  for (const fix of onpageFixes.filter(f => f.type === "missing_schema").slice(0, 5)) {
    pageSignals.push({
      url:    fix.url || fix.page,
      issue:  "missing_schema",
      detail: fix.detail || "No structured data — affects rich results eligibility",
      impact: "CTR + rich results",
      action: "add_schema",
      source: "A6",
    });
  }

  // Thin content pages (from A2)
  for (const pg of auditPages.filter(p => (p.issues || []).some(i => i.type === "thin_content")).slice(0, 5)) {
    pageSignals.push({
      url:    pg.url,
      issue:  "thin_content",
      detail: `Word count: ${pg.wordCount || "unknown"} — below 300 words`,
      impact: "low rankings",
      action: "expand_content",
      source: "A2",
    });
  }

  // Deduplicate by URL — keep highest impact per page
  const urlSeen = new Set();
  signals.topPageActions = pageSignals
    .filter(p => {
      if (!p.url) return false;
      if (urlSeen.has(p.url)) return false;
      urlSeen.add(p.url);
      return true;
    })
    .slice(0, 10);

  // ── NEW: 9 signals from connected agents ──────────────────────────────────

  // 1. A0 Strategy
  signals.a0TopPriority      = a0Strategy?.topPriority      || null;
  signals.a0QuickWins        = a0Strategy?.quickWins        || [];
  signals.a0CriticalWarnings = a0Strategy?.criticalWarnings || [];
  signals.a0AiSearchStrategy = a0Strategy?.aiSearchStrategy || null;

  // 2. AI Overview / Zero-click risk (A3 v2)
  const zeroClickPct        = keywords?.zeroClickRiskPct || 0;
  signals.zeroClickRiskPct  = zeroClickPct;
  signals.zeroClickHigh     = zeroClickPct > 40;
  signals.aiRiskHighCount   = keywords?.aiRiskSummary?.high || 0;
  signals.topicalHubsGap    = (keywords?.topicalHubs || []).filter(h => (h.clusterPages||[]).length < 2).length;
  signals.geoOpportunities  = (keywords?.geoKeywords || []).length;

  // 3. Competitor move (A15)
  const sevenDaysAgo        = new Date(Date.now() - 7*24*60*60*1000).toISOString();
  const recentMoves         = (a15Competitor?.newPages || []).filter(p => p.detectedAt >= sevenDaysAgo);
  signals.competitorMoved   = recentMoves.length > 0;
  signals.competitorMoveCount = recentMoves.length;
  signals.latestCompetitorMove = recentMoves[0] || null;

  // 4. Predictive forecast (A22)
  signals.forecastTrend     = a22Predictive?.forecastTrend || null;
  signals.forecastDeclining = a22Predictive?.forecastTrend === "DECLINING";
  signals.projectedClicks90d= a22Predictive?.projectedClicks90d || null;

  // 5. KPI on track (A24)
  signals.kpiOnTrack        = a24Strategist?.onTrack !== false;
  signals.kpiProgress       = a24Strategist?.progress || null;

  // 6. Algorithm risk (A25)
  signals.algorithmRisk     = a25CoreUpdate?.overallRisk || "LOW";
  signals.eeAtGap           = !!(a25CoreUpdate?.eeAtGap);
  signals.aiContentRisk     = !!(a25CoreUpdate?.aiContentRisk);
  signals.hcuScore          = a25CoreUpdate?.hcuScore || null;

  // 7. Content decay (AI7)
  const decayingPages       = ai7Decay?.decayingPages || [];
  signals.contentDecaying   = decayingPages.length;
  signals.hasContentDecay   = decayingPages.length > 2;
  signals.topDecayPage      = decayingPages[0] || null;

  // 8. SERP volatility (AI3)
  signals.serpVolatility    = ai3Volatility?.stability || "stable";
  signals.serpHighVolatility= ai3Volatility?.stability === "volatile";
  signals.activeUpdate      = ai3Volatility?.activeUpdate || null;

  // 9. Seasonal opportunity (AI5)
  const upcomingPeaks       = (ai5Seasonal?.upcomingPeaks || []).filter(p => (p.weeksAway||99) <= 8);
  signals.seasonalOpportunity = upcomingPeaks.length > 0;
  signals.upcomingSeasonalPeak = upcomingPeaks[0] || null;

  return signals;
}

// ── Cross-client pattern summary for CMO prompt ───
// Reweight LLM confidence using historical win rates + this client's past failures.
// recentVerifications = fresh fix_verification rows that may not yet be in client_memory.
// ── Extracted helpers (Sprint 1) ───────────────────
// - Playbook meta-learning (FIX_TO_PLAYBOOK, AGENT_TO_PLAYBOOK, computePlaybookStats,
//   vetoFailingPlaybooks, identifyFailingPlaybooks, filterAllowedAgents,
//   buildPatternStats, buildPatternSummary) → ./cmoPlaybooks (M2).
// - Decision helpers (reweightConfidence, buildCMOPrompt, ruleBasedDecision)
//   → ./cmoDecision (M3).
// All were moved verbatim and are imported at the top of this file. Behaviour is unchanged.

module.exports = { runCMO };
