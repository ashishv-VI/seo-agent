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
 * Sections: GSC, GA4, Site Health, Agent Suggestions, Before/After, Lead Tracking
 */
router.get("/:clientId/control-room", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const clientId = req.params.clientId;

    // Fetch all data in parallel — one failure should not crash the room
    const [
      brief, audit, report, keywords, competitor,
      baseline, scoreHistory, latestScore, weeklyPulls,
    ] = await Promise.all([
      getState(clientId, "A1_brief").catch(() => null),
      getState(clientId, "A2_audit").catch(() => null),
      getState(clientId, "A9_report").catch(() => null),
      getState(clientId, "A3_keywords").catch(() => null),
      getState(clientId, "A4_competitor").catch(() => null),
      getState(clientId, "baseline").catch(() => null),
      getScoreHistory(clientId, 12).catch(() => []),
      getLatestScore(clientId).catch(() => null),
      db.collection("weekly_pulls").where("clientId","==",clientId).orderBy && false
        ? [] // skip if no composite index
        : db.collection("weekly_pulls").where("clientId","==",clientId).limit(4).get()
            .then(s => s.docs.map(d => d.data())).catch(() => []),
    ]);

    const clientDoc = await db.collection("clients").doc(clientId).get();
    const client    = clientDoc.data();

    // ── This Week (GSC signals from A9/A10) ─────────
    const gsc = report?.gscSummary || null;
    const thisWeek = gsc ? {
      totalClicks:      gsc.totalClicks      || 0,
      totalImpressions: gsc.totalImpress     || 0,
      avgCtr:           gsc.avgCtr           ? (gsc.avgCtr * 100).toFixed(1) + "%" : "N/A",
      avgPosition:      gsc.avgPos           ? gsc.avgPos.toFixed(1) : "N/A",
      topPage:          gsc.topPages?.[0]    || null,
      topKeyword:       gsc.topKeywords?.[0] || null,
      hasData:          true,
    } : { hasData: false };

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
    const kpis = brief?.kpiSelection || [];

    return res.json({
      clientName:  client?.name || brief?.businessName,
      websiteUrl:  brief?.websiteUrl,
      kpis,
      thisWeek,
      siteHealth,
      suggestions: allSuggestions,
      beforeAfter,
      competitorCount,
      weeklyPulls: Array.isArray(weeklyPulls) ? weeklyPulls.slice(0, 4) : [],
      lastUpdated: new Date().toISOString(),
    });

  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

module.exports = router;
