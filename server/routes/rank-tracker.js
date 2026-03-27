/**
 * Rank Tracker — uses SE Ranking to get live keyword positions
 */
const express  = require("express");
const router   = express.Router();
const { db }   = require("../config/firebase");
const { verifyToken }   = require("../middleware/auth");
const { getUserKeys }   = require("../utils/getUserKeys");
const { getDomainKeywords, getKeywordMetrics } = require("../utils/seranking");
const { getState }      = require("../shared-state/stateManager");

// Helper: verify client ownership
async function getClientDoc(clientId, uid) {
  const doc = await db.collection("clients").doc(clientId).get();
  if (!doc.exists)                   throw { code: 404, message: "Client not found" };
  if (doc.data().ownerId !== uid)    throw { code: 403, message: "Access denied" };
  return doc;
}

// GET live rankings for a client
router.get("/:clientId/rankings", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const keys  = await getUserKeys(req.uid);

    if (!keys.seranking) {
      return res.status(400).json({ error: "SE Ranking API key not configured. Add it in Settings." });
    }

    const brief    = await getState(req.params.clientId, "A1_brief") || {};
    const keywords = await getState(req.params.clientId, "A3_keywords") || {};
    const siteUrl  = brief.websiteUrl || "";

    const locationStr = (brief.targetLocations || []).join(" ").toLowerCase();
    const country = locationStr.includes("uk") ? "GB"
                  : locationStr.includes("australia") ? "AU"
                  : locationStr.includes("canada") ? "CA"
                  : locationStr.includes("india") ? "IN"
                  : "US";

    // Get domain's current keyword rankings
    const rankings = await getDomainKeywords(siteUrl, keys.seranking, country);

    // Also enrich top keywords from our keyword map with live metrics
    const topKws = (keywords.keywordMap || [])
      .filter(k => k.priority === "high")
      .slice(0, 20)
      .map(k => k.keyword);

    const metrics = topKws.length > 0
      ? await getKeywordMetrics(topKws, keys.seranking, country)
      : {};

    // Save to rank_history
    if (rankings.length > 0) {
      await db.collection("rank_history").add({
        clientId: req.params.clientId,
        date:     new Date().toISOString().split("T")[0],
        rankings: rankings.slice(0, 50),
        topKeywordMetrics: metrics,
        createdAt: new Date(),
      });
    }

    return res.json({
      success:      true,
      domain:       siteUrl,
      country,
      rankingsCount:rankings.length,
      rankings:     rankings.slice(0, 50),
      keywordMetrics: metrics,
      message:      rankings.length > 0
        ? `Found ${rankings.length} keywords ranking for ${siteUrl}`
        : "No rankings found yet — site may be new or not indexed",
    });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// GET keyword research for specific keywords
router.post("/:clientId/keyword-research", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const keys = await getUserKeys(req.uid);

    if (!keys.seranking) {
      return res.status(400).json({ error: "SE Ranking API key not configured." });
    }

    const { keywords = [], country = "US" } = req.body;
    if (!keywords.length) return res.status(400).json({ error: "Keywords array required" });

    const metrics = await getKeywordMetrics(keywords, keys.seranking, country);
    return res.json({ success: true, metrics, count: Object.keys(metrics).length });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// GET competitor analysis
router.get("/:clientId/competitors", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const keys  = await getUserKeys(req.uid);

    if (!keys.seranking) {
      return res.status(400).json({ error: "SE Ranking API key not configured." });
    }

    const brief  = await getState(req.params.clientId, "A1_brief") || {};
    const { getDomainCompetitors } = require("../utils/seranking");

    const locationStr = (brief.targetLocations || []).join(" ").toLowerCase();
    const country = locationStr.includes("uk") ? "GB" : locationStr.includes("india") ? "IN" : "US";

    const competitors = await getDomainCompetitors(brief.websiteUrl, keys.seranking, country);
    return res.json({ success: true, competitors, domain: brief.websiteUrl });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

module.exports = router;
