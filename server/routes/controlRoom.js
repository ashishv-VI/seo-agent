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
    await getClientDoc(req.params.clientId, req.uid);
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

    const clientDoc = await db.collection("clients").doc(clientId).get();
    const client    = clientDoc.data();

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
      avgCtr:           gsc?.avgCtr           ? (gsc.avgCtr * 100).toFixed(1) + "%" : (thisSnapW?.avgCtr ? (thisSnapW.avgCtr * 100).toFixed(1) + "%" : "N/A"),
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
    const topConvKeyword = Object.entries(kwConvMap).sort((a, b) => b[1] - a[1])[0];

    const leads = {
      total30d:          conversions30d.length,
      totalAllTime:      allConversions.length,
      topKeyword:        topConvKeyword ? topConvKeyword[0] : null,
      topKeywordCount:   topConvKeyword ? topConvKeyword[1] : 0,
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
      decision:   cmoDecision.decision,
      reasoning:  cmoDecision.reasoning,
      nextAgents: cmoDecision.nextAgents || [],
      confidence: cmoDecision.confidence,
      kpiImpact:  cmoDecision.kpiImpact  || [],
      signals:    cmoDecision.signals    || {},
      decidedAt:  cmoDecision.decidedAt  || null,
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

module.exports = router;
