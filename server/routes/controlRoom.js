const express    = require("express");
const router     = express.Router();
const { db }     = require("../config/firebase");
const { verifyToken } = require("../middleware/auth");
const { getState }    = require("../shared-state/stateManager");
const { getScoreHistory, getLatestScore } = require("../utils/scoreCalculator");

async function getClientDoc(clientId, uid) {
  const doc = await db.collection("clients").doc(clientId).get();
  if (!doc.exists)             throw { code: 404, message: "Client not found" };
  if (doc.data().ownerId !== uid) throw { code: 403, message: "Access denied" };
  return doc;
}

/**
 * GET /:clientId/control-room
 * Returns all data needed for the Client Control Room dashboard in one call.
 * Sections: GSC delta, Leads, Site Health, Agent Suggestions, Before/After, CMO Decision
 */
router.get("/:clientId/control-room", verifyToken, async (req, res) => {
  try {
    const clientDocResult = await getClientDoc(req.params.clientId, req.uid);
    const clientId = req.params.clientId;

    // Fetch all data in parallel — one failure should not crash the room
    const [
      brief, audit, report, keywords, competitor,
      baseline, scoreHistory, latestScore, weeklySnaps, reviewerData, cmoDecision,
    ] = await Promise.all([
      getState(clientId, "A1_brief").catch(() => null),
      getState(clientId, "A2_audit").catch(() => null),
      getState(clientId, "A9_report").catch(() => null),
      getState(clientId, "A3_keywords").catch(() => null),
      getState(clientId, "A4_competitor").catch(() => null),
      getState(clientId, "baseline").catch(() => null),
      getScoreHistory(clientId, 12).catch(() => []),
      getLatestScore(clientId).catch(() => null),
      // Get last 4 weeks of snapshots for delta calculation (sort in JS — no Firestore index needed)
      db.collection("weekly_snapshots").where("clientId","==",clientId).limit(4).get()
        .then(s => s.docs.map(d => d.data()).sort((a, b) => (b.week || "").localeCompare(a.week || "")))
        .catch(() => db.collection("weekly_pulls").where("clientId","==",clientId).limit(4).get()
          .then(s => s.docs.map(d => d.data())).catch(() => [])),
      getState(clientId, "A17_review").catch(() => null),
      getState(clientId, "CMO_decision").catch(() => null),
    ]);

    const client = clientDocResult.data();

    // Guard: if A1 brief is missing the entire aggregation will crash on undefined reads
    if (!brief?.websiteUrl) {
      return res.json({ setupRequired: true, message: "Run onboarding (A1) first to populate Control Room." });
    }

    // ── This Week (GSC signals + week-over-week delta) ─────────────────────
    const gsc        = report?.gscSummary || null;
    const thisSnapW  = weeklySnaps?.[0]?.gsc || null;  // latest weekly snapshot
    const prevSnapW  = weeklySnaps?.[1]?.gsc || null;  // prior week

    // Compute delta helper — null-safe
    function delta(curr, prev) {
      if (curr == null || prev == null || prev === 0) return null;
      return Math.round(((curr - prev) / prev) * 100);
    }

    const thisWeek = (gsc || thisSnapW) ? {
      totalClicks:      gsc?.totalClicks      || thisSnapW?.totalClicks      || 0,
      totalImpressions: gsc?.totalImpress     || thisSnapW?.totalImpressions || 0,
      avgCtr:           gsc?.avgCTR != null   ? gsc.avgCTR + "%" : (thisSnapW?.avgCtr ? (thisSnapW.avgCtr * 100).toFixed(1) + "%" : "N/A"),
      avgPosition:      gsc?.avgPos           ? gsc.avgPos.toFixed(1) : (thisSnapW?.avgPosition?.toFixed(1) || "N/A"),
      topPage:          gsc?.topPages?.[0]    || thisSnapW?.topPages?.[0] || null,
      topKeyword:       gsc?.topKeywords?.[0] || thisSnapW?.topKeywords?.[0] || null,
      // Week-over-week deltas (%)
      deltaClicks:      prevSnapW ? delta(thisSnapW?.totalClicks, prevSnapW?.totalClicks) : null,
      deltaImpressions: prevSnapW ? delta(thisSnapW?.totalImpressions, prevSnapW?.totalImpressions) : null,
      deltaPosition:    prevSnapW && thisSnapW?.avgPosition && prevSnapW?.avgPosition
                          ? parseFloat((thisSnapW.avgPosition - prevSnapW.avgPosition).toFixed(1)) : null,
      hasData: true,
    } : { hasData: false };

    // ── Leads (from conversions collection) ─────────────────────────────────
    const convSnap = await db.collection("conversions")
      .where("clientId", "==", clientId)
      .limit(50)
      .get()
      .catch(() => null);
    // Sort in JS — avoids needing a Firestore composite index

    const allConversions = convSnap ? convSnap.docs.map(d => d.data()).sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || "")) : [];
    const now30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const conversions30d = allConversions.filter(c => (c.submittedAt || "") >= now30);

    // Top keyword by conversions (last 30d)
    const kwConvMap = {};
    for (const c of conversions30d) {
      const kw = c.gscKeyword || c.utmTerm || "(direct)";
      kwConvMap[kw] = (kwConvMap[kw] || 0) + 1;
    }
    const sortedKwConv = Object.entries(kwConvMap).sort((a, b) => b[1] - a[1]);
    const topConvKeyword = sortedKwConv[0];

    // Pull AOV from brief for revenue projection
    const aov = Number(brief?.avgOrderValue) || 0;

    // Build top-5 keyword → lead → revenue breakdown
    const keywordLeadBreakdown = sortedKwConv.slice(0, 5).map(([keyword, count]) => ({
      keyword,
      leads:            count,
      estimatedRevenue: aov > 0 ? Math.round(count * aov) : null,
      percentOfLeads:   conversions30d.length > 0 ? Math.round((count / conversions30d.length) * 100) : 0,
    }));

    const leads = {
      total30d:          conversions30d.length,
      totalAllTime:      allConversions.length,
      topKeyword:        topConvKeyword ? topConvKeyword[0] : null,
      topKeywordCount:   topConvKeyword ? topConvKeyword[1] : 0,
      keywordLeadBreakdown,
      estimatedRevenue30d: aov > 0 ? Math.round(conversions30d.length * aov) : null,
      aov,
      recentConversions: conversions30d.slice(0, 5).map(c => ({
        keyword:   c.gscKeyword || c.utmTerm || "(direct)",
        source:    c.utmSource  || "direct",
        page:      c.landingPage || null,
        date:      c.submittedAt || null,
      })),
      hasData: allConversions.length > 0,
    };

    // ── Site Health ──────────────────────────────────
    const siteHealth = {
      seoScore:    latestScore?.overall    || null,
      healthScore: audit?.healthScore      || null,
      p1Issues:    audit?.issues?.p1?.length || 0,
      p2Issues:    audit?.issues?.p2?.length || 0,
      p3Issues:    audit?.issues?.p3?.length || 0,
      pagesAudited: audit?.checks?.internalLinksFound || 0,
      lastAuditAt: audit?.auditedAt        || null,
    };

    // ── Agent Suggestions (from A9 report) ──────────
    const suggestions = report?.reportData?.next3Actions?.map((a, i) => ({
      rank:           i + 1,
      action:         a.action,
      why:            a.why,
      expectedOutcome:a.expectedOutcome,
      priority:       i === 0 ? "high" : "medium",
    })) || [];

    // Add keyword quick wins
    const quickWins = keywords?.quickWins?.slice(0, 3).map(k => ({
      rank:     0,
      action:   `Target "${k.keyword}" — currently position ${k.currentPosition || "unranked"}`,
      why:      k.opportunity || "High search volume, low competition",
      priority: "high",
    })) || [];

    const allSuggestions = [...suggestions, ...quickWins].slice(0, 6);

    // ── Before / After comparison ────────────────────
    const beforeAfter = baseline ? {
      hasBaseline:     true,
      capturedAt:      baseline.capturedAt,
      firstPipelineAt: baseline.firstPipelineAt,
      before: {
        seoScore:    baseline.seoScore,
        healthScore: baseline.healthScore,
        keywordsRanking: baseline.keywordsRanking,
        topIssues:   baseline.topIssues,
        keywords:    baseline.briefSnapshot?.primaryKeywords || [],
      },
      now: {
        seoScore:    latestScore?.overall,
        healthScore: audit?.healthScore,
        keywordsRanking: keywords?.totalKeywords,
        topIssues: audit?.summary ? { p1: audit.summary.p1Count, p2: audit.summary.p2Count, p3: audit.summary.p3Count } : null,
      },
      delta: {
        seoScore:    latestScore?.overall != null && baseline.seoScore != null
                       ? latestScore.overall - baseline.seoScore : null,
        healthScore: audit?.healthScore != null && baseline.healthScore != null
                       ? audit.healthScore - baseline.healthScore : null,
      },
      scoreHistory,
    } : { hasBaseline: false, scoreHistory };

    // ── Competitors ───────────────────────────────────
    const competitorCount = competitor?.discoveredCompetitors?.length
      || competitor?.topCompetitors?.length || 0;

    // ── KPI selection from brief ─────────────────────
    const kpis = [].concat(brief?.kpiSelection || []);

    // ── CMO Decision ─────────────────────────────────
    const cmo = cmoDecision ? {
      decision:            cmoDecision.decision,
      reasoning:           cmoDecision.reasoning,
      nextAgents:          cmoDecision.nextAgents || [],
      confidence:          cmoDecision.confidence,
      confidenceReasoning: cmoDecision.confidenceReasoning || null,
      kpiImpact:           cmoDecision.kpiImpact  || [],
      pageActions:         cmoDecision.pageActions || [],
      signals:             cmoDecision.signals    || {},
      patternStats:        cmoDecision.patternStats || null,
      decidedAt:           cmoDecision.decidedAt  || null,
    } : null;

    return res.json({
      clientName:  client?.name || brief?.businessName,
      websiteUrl:  brief?.websiteUrl,
      kpis,
      thisWeek,
      leads,
      siteHealth,
      suggestions: allSuggestions,
      beforeAfter,
      competitorCount,
      weeklyPulls: Array.isArray(weeklySnaps) ? weeklySnaps.slice(0, 4) : [],
      reviewerScore: reviewerData ? {
        overallConfidence: reviewerData.overallConfidence,
        grade:             reviewerData.grade,
        lowConfidence:     (reviewerData.agentScores || []).filter(a => a.confidence < 0.6).map(a => a.agent),
      } : null,
      cmo,
      lastUpdated: new Date().toISOString(),
    });

  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

/**
 * GET /:clientId/war-room
 * Powers the War Room: weekly / monthly / compare views.
 * Returns timeline data, fix history with outcomes, GSC trend, leads, revenue.
 */
router.get("/:clientId/war-room", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const clientId = req.params.clientId;

    const [brief, scoreHistory, pushLog, convSnap, cmoDecision] = await Promise.all([
      getState(clientId, "A1_brief").catch(() => null),
      getScoreHistory(clientId, 26).catch(() => []),   // 26 weeks = ~6 months
      db.collection("wp_push_log").where("clientId","==",clientId).orderBy("pushedAt","desc").limit(100).get().catch(() => null),
      db.collection("conversions").where("clientId","==",clientId).limit(200).get().catch(() => null),
      getState(clientId, "CMO_decision").catch(() => null),
    ]);

    const aov = Number(brief?.avgOrderValue) || 0;
    const now  = Date.now();

    // ── Build fix timeline from wp_push_log ──────────
    const fixes = pushLog ? pushLog.docs.map(d => {
      const f = d.data();
      return {
        id:        d.id,
        type:      f.issueType || f.field || "fix",
        page:      f.wpPostUrl || f.pageUrl || null,
        pushedAt:  f.pushedAt  || null,
        outcome:   f.outcome   || f.rankingAfter || null,  // set by fix_verification
        isRetry:   !!f.isRetry,
      };
    }) : [];

    // ── Weekly buckets (last 12 weeks) ───────────────
    const weeks = [];
    for (let w = 11; w >= 0; w--) {
      const weekStart = new Date(now - (w + 1) * 7 * 24 * 60 * 60 * 1000);
      const weekEnd   = new Date(now - w * 7 * 24 * 60 * 60 * 1000);
      const wLabel    = weekStart.toISOString().split("T")[0];

      const weekFixes = fixes.filter(f => f.pushedAt >= weekStart.toISOString() && f.pushedAt < weekEnd.toISOString());
      const weekLeads = convSnap ? convSnap.docs
        .map(d => d.data())
        .filter(c => (c.submittedAt || "") >= weekStart.toISOString() && (c.submittedAt || "") < weekEnd.toISOString())
        .length : 0;

      // Score for this week from score_history
      const weekScore = scoreHistory.find(s => s.date >= wLabel && s.date < weekEnd.toISOString().split("T")[0]);

      weeks.push({
        week:       wLabel,
        weekLabel:  `W${12 - w}`,
        fixes:      weekFixes.length,
        confirmedWins: weekFixes.filter(f => f.outcome === "improved").length,
        leads:      weekLeads,
        revenue:    aov > 0 ? weekLeads * aov : null,
        score:      weekScore?.overall || null,
      });
    }

    // ── Monthly buckets (last 6 months) ──────────────
    const months = [];
    for (let m = 5; m >= 0; m--) {
      const d = new Date();
      d.setMonth(d.getMonth() - m);
      const mLabel = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

      const mFixes = fixes.filter(f => (f.pushedAt || "").startsWith(mLabel));
      const mLeads = convSnap ? convSnap.docs
        .map(d2 => d2.data())
        .filter(c => (c.submittedAt || "").startsWith(mLabel))
        .length : 0;

      const mScores = scoreHistory.filter(s => (s.date || "").startsWith(mLabel));
      const avgScore = mScores.length
        ? Math.round(mScores.reduce((a, s) => a + (s.overall || 0), 0) / mScores.length)
        : null;

      months.push({
        month:      mLabel,
        monthLabel: d.toLocaleString("default", { month:"short", year:"2-digit" }),
        fixes:      mFixes.length,
        confirmedWins: mFixes.filter(f => f.outcome === "improved").length,
        leads:      mLeads,
        revenue:    aov > 0 ? mLeads * aov : null,
        score:      avgScore,
      });
    }

    // ── Compare: current month vs last month ─────────
    const current = months[months.length - 1] || {};
    const prior   = months[months.length - 2] || {};
    function pct(a, b) { return b > 0 ? Math.round(((a - b) / b) * 100) : null; }

    const compare = {
      fixes:        { current: current.fixes,         prior: prior.fixes,         delta: pct(current.fixes, prior.fixes) },
      confirmedWins:{ current: current.confirmedWins, prior: prior.confirmedWins, delta: pct(current.confirmedWins, prior.confirmedWins) },
      leads:        { current: current.leads,         prior: prior.leads,         delta: pct(current.leads, prior.leads) },
      revenue:      { current: current.revenue,       prior: prior.revenue,       delta: pct(current.revenue, prior.revenue) },
      score:        { current: current.score,         prior: prior.score,         delta: current.score != null && prior.score != null ? current.score - prior.score : null },
    };

    // ── Proof Engine: fixes with confirmed outcomes ──
    const provenFixes = fixes.filter(f => f.outcome === "improved").slice(0, 10);
    const totalWins   = fixes.filter(f => f.outcome === "improved").length;
    const totalFixes  = fixes.length;
    const winRate     = totalFixes > 0 ? Math.round((totalWins / totalFixes) * 100) : null;
    const allLeads    = convSnap ? convSnap.docs.length : 0;
    const totalRevenue = aov > 0 ? allLeads * aov : null;

    // ── CMO summary for War Room header ─────────────
    const cmoSummary = cmoDecision ? {
      decision:    cmoDecision.decision,
      reasoning:   cmoDecision.reasoning,
      confidence:  cmoDecision.confidence,
      nextAgents:  cmoDecision.nextAgents || [],
      kpiImpact:   cmoDecision.kpiImpact  || [],
      pageActions: cmoDecision.pageActions || [],
    } : null;

    // ── Revenue projection: if win rate continues ────
    const last30Wins = fixes.filter(f => {
      const d = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
      return f.pushedAt >= d && f.outcome === "improved";
    }).length;
    const projectedLeadsNext30 = winRate && last30Wins > 0 && aov > 0
      ? Math.round(last30Wins * 0.3)   // each win generates ~0.3 leads on average
      : null;

    return res.json({
      weeks,
      months,
      compare,
      proofEngine: {
        totalFixes,
        totalWins,
        winRate,
        totalLeads: allLeads,
        totalRevenue,
        provenFixes,
        projectedLeadsNext30,
        projectedRevenueNext30: projectedLeadsNext30 && aov > 0 ? projectedLeadsNext30 * aov : null,
        aov,
      },
      cmo: cmoSummary,
      aov,
      currency: brief?.currency || "INR",
    });

  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

/**
 * GET /:clientId/competitor-radar
 * Real-time competitor threat intelligence for the Competitor Radar panel.
 */
router.get("/:clientId/competitor-radar", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const clientId = req.params.clientId;

    const [competitorState, a4State, approvalSnap, alertsSnap] = await Promise.all([
      getState(clientId, "A15_competitorMonitor").catch(() => null),
      getState(clientId, "A4_competitor").catch(() => null),
      db.collection("approval_queue")
        .where("clientId", "==", clientId)
        .where("type", "==", "competitor_counter_content")
        .where("status", "==", "pending")
        .limit(10)
        .get().catch(() => null),
      db.collection("alerts")
        .where("clientId", "==", clientId)
        .where("source", "==", "A15")
        .where("resolved", "==", false)
        .limit(20)
        .get().catch(() => null),
    ]);

    const threats = competitorState?.highThreatUrls || [];
    const results = competitorState?.results || [];
    const counterContent = competitorState?.counterContentSuggestions || [];
    const pendingActions = approvalSnap ? approvalSnap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
    const activeAlerts   = alertsSnap   ? alertsSnap.docs.map(d => ({ id: d.id, ...d.data() }))   : [];

    // Competitor landscape from A4
    const knownCompetitors = [
      ...[].concat(a4State?.competitors || []),
      ...[].concat(a4State?.discoveredCompetitors || []),
    ].slice(0, 8);

    return res.json({
      checkedAt:         competitorState?.checkedAt || null,
      competitorsChecked: competitorState?.competitorsChecked || 0,
      totalNewPages:     competitorState?.totalNewPages || 0,
      totalHighThreat:   competitorState?.totalHighThreatPages || 0,
      threats,
      results,
      counterContent,
      pendingActions,
      activeAlerts,
      knownCompetitors,
      hasData: !!competitorState?.checkedAt,
    });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

module.exports = router;
