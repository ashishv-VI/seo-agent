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

  // ── Rule-based signal extraction — now with 9 new data sources ─────────
  const signals = extractSignals({
    brief, audit, keywords, competitor, onpage, technical, geo, report, rankings,
    a0Strategy, a15Competitor, a22Predictive, a24Strategist, a25CoreUpdate,
    ai3Volatility, ai5Seasonal, ai7Decay, ai9ZeroClick,
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
  const { failingPlaybooks = new Set(), allowedAgents = null, lowQualityAgents = [] } = vetoContext;
  const allAgents = ["A2", "A5", "A6", "A7", "A11", "A14", "A12", "A13", "A23", "A25", "AI7", "AI9"];
  const pickFrom  = allowedAgents && allowedAgents.length > 0
    ? allowedAgents.filter(a => allAgents.includes(a))
    : allAgents;

  const vetoBlock = failingPlaybooks.size > 0
    ? `\n## DO NOT PROPOSE THESE PLAYBOOKS\nThe following playbooks have been proven to FAIL (either for this client or this industry):\n${[...failingPlaybooks].map(p => `- ${p}`).join("\n")}\nDo NOT propose any agent that belongs to these playbooks. Pick a different approach.\n`
    : "";

  const qualityWarning = lowQualityAgents.length > 0
    ? `\n## LOW QUALITY DATA WARNING\nA17 Reviewer flagged these agent outputs as low quality (score <0.5). Treat signals from them as directional hints only — do NOT make high-confidence decisions based solely on: ${lowQualityAgents.join(", ")}.\n`
    : "";

  const aov = Number(brief?.avgOrderValue) || 0;
  const currency = brief?.currency === "GBP" ? "£" : brief?.currency === "USD" ? "$" : "₹";
  const revenueContext = aov > 0
    ? `Average order value: ${currency}${aov.toLocaleString()}. ALWAYS translate improvements into leads and ${currency} revenue in your reasoning and kpiImpact — e.g. "+2 leads/month × ${currency}${aov.toLocaleString()} = ${currency}${(2*aov).toLocaleString()} added monthly revenue".`
    : "No AOV configured — express impact as leads and traffic, not revenue.";

  const topPageActions = (signals.topPageActions || []).slice(0, 8);
  const pageActionsBlock = topPageActions.length > 0
    ? `\n## Specific Pages Needing Action RIGHT NOW\n${topPageActions.map((p, i) =>
        `${i+1}. URL: ${p.url || "unknown"}\n   Issue: ${p.issue} — ${p.detail}\n   Impact: ${p.impact}\n   Action: ${p.action}`
      ).join("\n")}\n`
    : "";

  return `You are the CMO Agent for an SEO AI platform. You make revenue-first decisions.

RULE: Never speak in SEO jargon to the user. Every insight must answer "what does this mean for revenue or leads?"
- "CTR improved 2%" → "est. +${aov > 0 ? Math.round(signals.monthlyClicks * 0.02 * 0.03) + " extra leads/month" : "more clicks → more leads"}"
- "Position 14→9 on primary keyword" → "moving from page 2 to page 1 — this keyword starts generating leads"
- "3 P1 issues" → "3 issues blocking the site from ranking — fixing them unblocks organic revenue"

Client: ${brief.businessName} (${brief.websiteUrl})
Primary goal: ${[].concat(brief.kpiSelection || ["Organic Traffic Growth"]).join(", ")}
${revenueContext}

## Current Situation
- Technical health: ${signals.healthPoor ? "POOR — site has ranking blockers" : "OK"}
- Critical issues blocking rankings: ${signals.p1IssuesCount}
- Mobile PageSpeed: ${signals.technicalPoor ? "POOR — losing mobile traffic" : "OK"}
- Keywords on page 2 (positions 11-30): ${signals.page2Count} ${signals.page2Count > 0 ? "— one good backlink away from page 1 traffic" : ""}
- Ranking drops: ${signals.droppingKws} ${signals.droppingKws > 0 ? "— investigate before traffic disappears" : ""}
- CTR below expected: ${signals.ctrLow ? `YES — getting ${((signals.avgCtr || 0)*100).toFixed(1)}% clicks at position ${(signals.avgPos||0).toFixed(1)} (should be higher)` : "NO"}
- Content gaps: ${signals.contentGaps} ${signals.contentGaps > 0 ? "keywords with no page targeting them — missing traffic" : ""}
${signals.hasKilledKeywords ? `- WASTED EFFORT WARNING: ${signals.killedKeywordCount} keywords have ranked 90+ days with ZERO leads. Stop targeting these. Reallocate budget to converting keywords.` : ""}
${pageActionsBlock}
## 2025/2026 Intelligence (connected agents data)
${signals.a0TopPriority ? `- SEO Head top priority: "${signals.a0TopPriority}"` : ""}
${signals.a0AiSearchStrategy ? `- AI search strategy: ${signals.a0AiSearchStrategy}` : ""}
${signals.a0CriticalWarnings?.length > 0 ? `- Critical warnings: ${signals.a0CriticalWarnings.join(", ")}` : ""}
- AI Overview zero-click risk: ${signals.zeroClickRiskPct || 0}% keywords at HIGH risk${signals.zeroClickHigh ? " — URGENT strategy shift needed" : ""}
- Topical hubs incomplete: ${signals.topicalHubsGap || 0}
- GEO opportunities: ${signals.geoOpportunities || 0} keywords can appear in ChatGPT/Perplexity
- Competitor moved: ${signals.competitorMoved ? `YES — ${signals.competitorMoveCount} new page(s) in 7 days` : "No recent moves"}
- Traffic forecast: ${signals.forecastTrend || "unknown"}${signals.forecastDeclining ? " — DECLINING — URGENT" : ""}
- Algorithm risk: ${signals.algorithmRisk || "LOW"}${signals.eeAtGap ? " + EEAT gap" : ""}${signals.aiContentRisk ? " + AI content risk" : ""}
- Content decay: ${signals.contentDecaying || 0} pages losing rankings
- SERP volatility: ${signals.serpVolatility || "stable"}${signals.serpHighVolatility ? " — HOLD major changes" : ""}
${signals.seasonalOpportunity ? `- SEASONAL: "${signals.upcomingSeasonalPeak?.keyword}" peaks in ${signals.upcomingSeasonalPeak?.weeksAway} weeks — create content NOW` : ""}
${signals.kpiOnTrack === false ? `- KPI OFF TRACK: ${signals.kpiProgress || "behind goal"} — escalate all urgency` : ""}

## Available Actions (pick ONLY from this list)
${pickFrom.map(a => {
  const labels = {
    A2:   "Re-audit — find what's blocking rankings",
    A5:   "Rewrite titles/metas or generate new content briefs",
    A6:   "On-page fixes — improve content relevance signals",
    A7:   "Fix Core Web Vitals — stop losing mobile traffic",
    A11:  "Build backlinks — push page-2 keywords to page 1",
    A14:  "Create and publish content — capture keyword demand",
    A12:  "Auto-fix engine — apply quick technical fixes automatically",
    A13:  "WordPress push — publish approved content to site",
    A23:  "Investigate alerts — deep-dive into ranking drops or anomalies",
    A25:  "Core update scanner — check EEAT, HCU, AI content risk",
    AI7:  "Content decay refresh — update pages losing rankings",
    AI9:  "Zero-click capture — win featured snippets and PAA boxes",
  };
  return `- ${a}: ${labels[a] || a}`;
}).join("\n")}
${vetoBlock}${qualityWarning}${patternSummary ? `\n## What Has Worked Previously\n${patternSummary}\n` : ""}
Return ONLY valid JSON. Use plain language a business owner understands — no SEO jargon:
{
  "decision": "one sentence: what we're doing and why it matters for revenue/leads",
  "reasoning": "2-3 sentences in plain English: what the data shows → what we do → what revenue impact to expect",
  "nextAgents": ["A5"],
  "confidence": 0.85,
  "kpiImpact": [
    { "kpi": "Lead Generation", "expectedLift": "+3-5 leads/month", "mechanism": "higher CTR → more site visits → more conversions", "revenueEstimate": "${aov > 0 ? `+${currency}${(4*aov).toLocaleString()}/month` : "depends on conversion rate"}" }
  ],
  "pageActions": [
    { "url": "https://example.com/services", "fix": "rewrite title tag — current title is too generic", "expectedImpact": "CTR +2-3% on this page", "priority": 1 }
  ]
}`;
}

// ── Rule-based fallback ───────────────────────────
function ruleBasedDecision(signals, brief) {
  const kpi  = [].concat(brief?.kpiSelection || ["Organic Traffic Growth"])[0];
  const aov  = Number(brief?.avgOrderValue) || 0;
  const cur  = brief?.currency === "GBP" ? "£" : brief?.currency === "USD" ? "$" : "₹";
  const rev  = (leads) => aov > 0 ? ` = ${cur}${(leads * aov).toLocaleString()}/month added revenue` : "";

  if (signals.hasCriticalIssues || signals.healthPoor) {
    return {
      decision:   `Fix ${signals.p1IssuesCount} critical issues that are blocking organic rankings`,
      reasoning:  `The site has ${signals.p1IssuesCount} critical technical issues preventing Google from indexing pages correctly. Until these are fixed, no other SEO work generates revenue — these blockers suppress all organic traffic.`,
      nextAgents: ["A2", "A6"],
      confidence: 0.95,
      kpiImpact:  [{ kpi, expectedLift: "Unblocks organic indexing", mechanism: "Remove technical barriers", revenueEstimate: "Unlocks existing ranking potential" }],
    };
  }
  if (signals.ctrLow) {
    const extraClicks = Math.round((signals.monthlyClicks || 200) * 0.25);
    const extraLeads  = Math.round(extraClicks * 0.03);
    return {
      decision:   `Rewrite title tags and meta descriptions — the site ranks but users aren't clicking`,
      reasoning:  `CTR is ${((signals.avgCtr || 0)*100).toFixed(1)}% at position ${(signals.avgPos||0).toFixed(1)} — well below industry average. Getting to average CTR would add ~${extraClicks} extra clicks/month → ~${extraLeads} extra leads${rev(extraLeads)}. Title rewrites are the fastest way to get there.`,
      nextAgents: ["A5", "A6"],
      confidence: 0.88,
      kpiImpact:  [{ kpi, expectedLift: `+${extraLeads} leads/month`, mechanism: "Higher CTR → more visits from existing rankings", revenueEstimate: aov > 0 ? `+${cur}${(extraLeads * aov).toLocaleString()}/month` : null }],
    };
  }
  if (signals.hasPage2Kws) {
    const extraLeads = Math.round(signals.page2Count * 0.5);
    return {
      decision:   `Push ${signals.page2Count} page-2 keywords to page 1 with targeted backlinks`,
      reasoning:  `${signals.page2Count} keywords are ranking positions 11-30 — page 2, generating almost zero traffic. Moving even half of them to page 1 adds ~${extraLeads} extra leads/month${rev(extraLeads)}. One targeted backlink per keyword is typically enough to cross the page-1 threshold.`,
      nextAgents: ["A11"],
      confidence: 0.82,
      kpiImpact:  [{ kpi, expectedLift: `+${extraLeads} leads/month`, mechanism: "Page 2 → Page 1 ranking jump", revenueEstimate: aov > 0 ? `+${cur}${(extraLeads * aov).toLocaleString()}/month` : null }],
    };
  }
  if (signals.hasContentGaps && !signals.hasKilledKeywords) {
    const gapLeads = Math.round(signals.contentGaps * 0.8);
    return {
      decision:   `Create content for ${signals.contentGaps} keyword gaps competitors already rank for`,
      reasoning:  `Competitors are getting traffic from ${signals.contentGaps} topics this site has no content on. Each piece of content captures a new audience segment — estimated +${gapLeads} leads/month when pages rank${rev(gapLeads)}.`,
      nextAgents: ["A14", "A5"],
      confidence: 0.78,
      kpiImpact:  [{ kpi, expectedLift: `+${gapLeads} leads/month`, mechanism: "New content → captures currently missed search demand", revenueEstimate: aov > 0 ? `+${cur}${(gapLeads * aov).toLocaleString()}/month` : null }],
    };
  }
  if (signals.hasContentGaps && signals.hasKilledKeywords) {
    return {
      decision:   `Stop investing in ${signals.killedKeywordCount} dead keywords — shift budget to converting pages`,
      reasoning:  `${signals.killedKeywordCount} keywords have ranked for 90+ days but generated zero leads. These are not converting regardless of ranking. Moving the same effort to CRO on pages that do get leads will produce faster revenue results.`,
      nextAgents: ["A19", "A6"],
      confidence: 0.80,
      kpiImpact:  [{ kpi, expectedLift: "+15-30% conversion rate on existing traffic", mechanism: "CRO on converting pages instead of dead keyword expansion", revenueEstimate: aov > 0 ? `Reallocate ${cur}${(signals.killedKeywordCount * aov * 0.1).toLocaleString()}/month wasted effort` : null }],
    };
  }

  // ── NEW: 7 world-class decisions using connected agents ───────────────────

  // 1. Algorithm risk: EEAT / HCU issues detected by A25
  if (signals.algorithmRisk === "HIGH" || signals.eeAtGap || signals.aiContentRisk) {
    return {
      decision:   "Algorithm penalty risk detected — fix EEAT signals before any other SEO work",
      reasoning:  `A25 core update scanner detected ${signals.eeAtGap ? "EEAT gaps" : ""}${signals.aiContentRisk ? " and AI content without expertise signals" : ""}. Post March 2024-2025 core updates, these are active penalty triggers. Fixing trust signals first protects all existing rankings.`,
      nextAgents: ["A25", "A6", "A5"],
      confidence: 0.92,
      kpiImpact:  [{ kpi, expectedLift: "Protects existing rankings from penalty", mechanism: "EEAT compliance → penalty risk removed", revenueEstimate: "Avoids potential 30-60% traffic loss from core update" }],
    };
  }

  // 2. Zero-click defence: >40% of keywords at AI Overview risk
  if (signals.zeroClickHigh) {
    return {
      decision:   `${signals.zeroClickRiskPct}% of keywords are at HIGH AI Overview risk — shift strategy to transactional content`,
      reasoning:  `Google AI Overviews are now answering ${signals.zeroClickRiskPct}% of this site's target keywords directly — meaning zero clicks. Informational content investment is shrinking returns. Shifting 30% of content effort to transactional and commercial keywords protects revenue.`,
      nextAgents: ["A5", "A3"],
      confidence: 0.88,
      kpiImpact:  [{ kpi, expectedLift: "Protect click traffic from AI Overview threat", mechanism: "Transactional keywords send clicks — AI Overview cannot replace buying intent", revenueEstimate: aov > 0 ? `Defending ${cur}${Math.round(signals.monthlyClicks * 0.3 * 0.03 * aov).toLocaleString()}/month at risk` : "Protects existing traffic revenue" }],
    };
  }

  // 3. Competitor counter-move: competitor published new page in last 7 days
  if (signals.competitorMoved) {
    const move = signals.latestCompetitorMove;
    return {
      decision:   `Competitor published ${signals.competitorMoveCount} new page(s) targeting your keywords — counter-content brief ready`,
      reasoning:  `${move?.domain || "A competitor"} published a new page${move?.keyword ? ` targeting "${move.keyword}"` : ""} in the last 7 days. Without a counter-content response, they will rank above you within 30-60 days. A targeted content brief now is the fastest way to defend.`,
      nextAgents: ["A5", "A4"],
      confidence: 0.85,
      kpiImpact:  [{ kpi, expectedLift: "Defend existing keyword positions", mechanism: "Counter-content published before competitor ranks solidly", revenueEstimate: "Prevents estimated traffic loss to competitor" }],
    };
  }

  // 4. Forecast declining: A22 shows traffic trending down
  if (signals.forecastDeclining) {
    return {
      decision:   "Traffic forecast is declining — urgent intervention needed across all channels",
      reasoning:  `A22 predictive agent forecasts a declining traffic trend over the next 90 days. Projected: ${signals.projectedClicks90d ? signals.projectedClicks90d + " clicks" : "below current baseline"}. This requires a comprehensive response: technical fixes, content refresh, and link building simultaneously.`,
      nextAgents: ["A2", "A5", "A11"],
      confidence: 0.87,
      kpiImpact:  [{ kpi, expectedLift: "Reverse declining traffic trend", mechanism: "Multi-front intervention: technical + content + links", revenueEstimate: aov > 0 ? `Prevents estimated ${cur}${Math.round((signals.monthlyClicks||100) * 0.02 * aov).toLocaleString()}/month revenue decline` : "Protects existing traffic" }],
    };
  }

  // 5. Content decay: 3+ pages losing rankings (AI7)
  if (signals.hasContentDecay) {
    return {
      decision:   `${signals.contentDecaying} pages are steadily losing rankings — refresh them before traffic disappears`,
      reasoning:  `AI7 content decay scanner detected ${signals.contentDecaying} pages with consistent month-on-month ranking drops. Content decay happens when pages become outdated or competitors publish fresher content. Refreshing with updated data, people-first signals, and improved internal links reverses the trend.`,
      nextAgents: ["A5", "A6"],
      confidence: 0.84,
      kpiImpact:  [{ kpi, expectedLift: `Recover rankings on ${signals.contentDecaying} decaying pages`, mechanism: "Content refresh → relevance restored → rankings recover", revenueEstimate: aov > 0 ? `Est. recover ${cur}${Math.round(signals.contentDecaying * 0.5 * aov).toLocaleString()}/month in declining traffic value` : "Stabilise declining traffic" }],
    };
  }

  // 6. Seasonal opportunity: peak within 8 weeks (AI5)
  if (signals.seasonalOpportunity && signals.upcomingSeasonalPeak) {
    const peak = signals.upcomingSeasonalPeak;
    return {
      decision:   `Seasonal traffic peak in ${peak.weeksAway || "a few"} weeks — create content now before the window closes`,
      reasoning:  `AI5 seasonal intelligence detected an upcoming peak for "${peak.keyword || "target keywords"}" in ${peak.weeksAway || "a few"} weeks. Content published now has time to index and rank before the peak. Publishing during the peak is already too late.`,
      nextAgents: ["A14", "A5"],
      confidence: 0.83,
      kpiImpact:  [{ kpi, expectedLift: `Capture seasonal traffic spike`, mechanism: "Content indexed before peak → captures surge demand", revenueEstimate: aov > 0 ? `Seasonal peaks typically 2-3x normal traffic → significant revenue opportunity` : "Seasonal traffic capture" }],
    };
  }

  // 7. GEO + topical hub gap: content strategy opportunity
  if (signals.topicalHubsGap > 1 || signals.geoOpportunities > 2) {
    return {
      decision:   `${signals.topicalHubsGap} topical hubs incomplete${signals.geoOpportunities > 2 ? ` and ${signals.geoOpportunities} GEO citation opportunities` : ""} — build content authority now`,
      reasoning:  `Topical authority requires complete content hubs (pillar + cluster pages). ${signals.topicalHubsGap} hubs are currently incomplete — leaving keyword clusters unranked. ${signals.geoOpportunities > 2 ? `Additionally, ${signals.geoOpportunities} keywords can appear in ChatGPT/Perplexity answers with proper content restructuring.` : ""}`,
      nextAgents: ["A14", "A5"],
      confidence: 0.80,
      kpiImpact:  [{ kpi, expectedLift: "Build topical authority", mechanism: "Complete hubs → Google recognises expertise → cluster rankings improve", revenueEstimate: aov > 0 ? `Topical authority typically lifts cluster traffic 40-60%` : "Authority-driven traffic growth" }],
    };
  }

  return {
    decision:   "Site is healthy — focus on maintaining rankings and monitoring for drops",
    reasoning:  "No urgent signals detected. The site is in a stable state. The agent will continue monitoring for ranking drops, competitor moves, and new opportunities.",
    nextAgents: [],
    confidence: 0.6,
    kpiImpact:  [],
  };
}

module.exports = { runCMO };
