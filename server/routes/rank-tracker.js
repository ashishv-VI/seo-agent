/**
 * Rank Tracker — uses SE Ranking to get live keyword positions
 */
const express  = require("express");
const router   = express.Router();
const { db }   = require("../config/firebase");
const { verifyToken }   = require("../middleware/auth");
const { getUserKeys }   = require("../utils/getUserKeys");
const { getDomainKeywords, getKeywordMetrics, checkBulkPositions } = require("../utils/seranking");
const { getState }      = require("../shared-state/stateManager");

// ── DEBUG: Test SE Ranking API endpoints (temporary) ─────────────────────────
router.get("/debug-seranking", verifyToken, async (req, res) => {
  try {
    const keys    = await getUserKeys(req.uid);
    const apiKey  = keys.seranking;
    if (!apiKey) return res.status(400).json({ error: "No SE Ranking API key set" });

    const keyword = req.query.keyword || "school photography in uk";
    const country = req.query.country || "GB";
    const domain  = req.query.domain  || "imagophotography.co.uk";
    const SE_BASE = "https://api4.seranking.com";

    const endpoints = [
      `${SE_BASE}/research/keywords/competitors?keyword=${encodeURIComponent(keyword)}&country=${country}&limit=10`,
      `${SE_BASE}/research/keyword/competitors?keyword=${encodeURIComponent(keyword)}&country=${country}&limit=10`,
      `${SE_BASE}/research/keyword/organic?keyword=${encodeURIComponent(keyword)}&country=${country}&limit=10`,
      `${SE_BASE}/research/keywords/organic?keyword=${encodeURIComponent(keyword)}&country=${country}&limit=10`,
      `${SE_BASE}/research/domain/organic/keywords?domain=${encodeURIComponent(domain)}&country=${country}&limit=5`,
    ];

    const results = [];
    for (const url of endpoints) {
      try {
        const r    = await fetch(url, { headers: { "Authorization": `Token ${apiKey}` }, signal: AbortSignal.timeout(8000) });
        const text = await r.text();
        let body;
        try { body = JSON.parse(text); } catch { body = text.slice(0, 300); }
        results.push({ url, status: r.status, body: typeof body === "object" ? JSON.stringify(body).slice(0, 500) : body });
      } catch (e) {
        results.push({ url, error: e.message });
      }
    }

    return res.json({ keyword, country, domain, results });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

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

// ─────────────────────────────────────────────────────────────────────────────
// TRACKED KEYWORDS — CRUD + Geo Position Checking
// Stored in: clients/{clientId}/tracked_keywords (subcollection)
// ─────────────────────────────────────────────────────────────────────────────

// POST — add keywords in bulk (100+)
// Body: { keywords: ["kw1","kw2",...], category, location: { country, countryName, city }, targetUrl }
router.post("/:clientId/tracked-keywords", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { keywords = [], category = "General", location = { country: "US", countryName: "United States", city: "" }, targetUrl = "" } = req.body;

    if (!keywords.length) return res.status(400).json({ error: "keywords array required" });

    const col   = db.collection("clients").doc(req.params.clientId).collection("tracked_keywords");
    const batch = db.batch();
    const now   = new Date().toISOString();
    let added   = 0;

    // Deduplicate against existing
    const existing = await col.get();
    const existingKeys = new Set(existing.docs.map(d => `${d.data().keyword?.toLowerCase()}__${d.data().location?.country}`));

    for (const kw of keywords) {
      const keyword = kw.trim();
      if (!keyword) continue;
      const key = `${keyword.toLowerCase()}__${location.country}`;
      if (existingKeys.has(key)) continue; // skip duplicate

      const ref = col.doc();
      batch.set(ref, {
        keyword,
        category,
        location,
        targetUrl,
        addedAt:         now,
        lastChecked:     null,
        currentPosition: null,
        previousPosition:null,
        change:          null,
        rankingUrl:      null,
        volume:          0,
        difficulty:      0,
        history:         [],
      });
      added++;
    }

    await batch.commit();
    return res.json({ success: true, added, skipped: keywords.length - added });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// GET — list all tracked keywords (with optional category/location filters)
router.get("/:clientId/tracked-keywords", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { category, country } = req.query;

    let query = db.collection("clients").doc(req.params.clientId).collection("tracked_keywords");
    const snap = await query.get();

    let keywords = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Filter client-side (Firestore subcollection composite index not set up)
    if (category && category !== "all") keywords = keywords.filter(k => k.category === category);
    if (country  && country  !== "all") keywords = keywords.filter(k => k.location?.country === country);

    // Get unique categories and countries for filter options
    const categories = [...new Set(keywords.map(k => k.category).filter(Boolean))];
    const countries  = [...new Set(keywords.map(k => k.location?.country).filter(Boolean))];

    return res.json({ keywords, categories, countries, total: keywords.length });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// DELETE — remove a tracked keyword
router.delete("/:clientId/tracked-keywords/:kwId", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    await db.collection("clients").doc(req.params.clientId)
      .collection("tracked_keywords").doc(req.params.kwId).delete();
    return res.json({ deleted: true });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// PATCH — update category or targetUrl for a keyword
router.patch("/:clientId/tracked-keywords/:kwId", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { category, targetUrl, location } = req.body;
    const update = {};
    if (category  !== undefined) update.category  = category;
    if (targetUrl !== undefined) update.targetUrl = targetUrl;
    if (location  !== undefined) update.location  = location;

    await db.collection("clients").doc(req.params.clientId)
      .collection("tracked_keywords").doc(req.params.kwId).update(update);
    return res.json({ updated: true });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// DELETE ALL — bulk delete all tracked keywords
router.delete("/:clientId/tracked-keywords", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const snap = await db.collection("clients").doc(req.params.clientId)
      .collection("tracked_keywords").get();
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    return res.json({ deleted: snap.size });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// POST — check positions for ALL tracked keywords (grouped by country)
// This is the main "refresh rankings" endpoint
router.post("/:clientId/check-positions", verifyToken, async (req, res) => {
  try {
    const doc    = await getClientDoc(req.params.clientId, req.uid);
    const keys   = await getUserKeys(req.uid);
    const brief  = await getState(req.params.clientId, "A1_brief") || {};
    const domain = brief.websiteUrl || doc.data().website || "";

    if (!keys.seranking) {
      return res.status(400).json({ error: "SE Ranking API key not configured. Add it in Settings." });
    }
    if (!domain) {
      return res.status(400).json({ error: "No website URL found for this client" });
    }

    const kwCol  = db.collection("clients").doc(req.params.clientId).collection("tracked_keywords");
    const snap   = await kwCol.get();
    if (snap.empty) return res.json({ checked: 0, message: "No tracked keywords found" });

    const kwDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Group keywords by country for efficient batching (1 API call per country)
    const byCountry = {};
    for (const kw of kwDocs) {
      const country = kw.location?.country || "US";
      if (!byCountry[country]) byCountry[country] = [];
      byCountry[country].push(kw);
    }

    const now   = new Date().toISOString();
    const today = now.split("T")[0];
    let   checked = 0;
    const batch   = db.batch();

    for (const [country, kwGroup] of Object.entries(byCountry)) {
      const keywordStrings = kwGroup.map(k => k.keyword);
      const positions      = await checkBulkPositions(domain, keywordStrings, keys.seranking, country);

      for (const kw of kwGroup) {
        const key      = kw.keyword.toLowerCase();
        const result   = positions[key] || { position: null, url: null, volume: 0, difficulty: 0 };
        const prevPos  = kw.currentPosition;
        const newPos   = result.position;
        const change   = (prevPos !== null && newPos !== null) ? prevPos - newPos : null; // positive = improved

        // Append to history (keep last 90 entries)
        const history  = (kw.history || []).slice(-89);
        history.push({ date: today, position: newPos, url: result.url });

        const ref = kwCol.doc(kw.id);
        batch.update(ref, {
          currentPosition:  newPos,
          previousPosition: prevPos,
          change,
          rankingUrl:       result.url || null,
          volume:           result.volume     || kw.volume     || 0,
          difficulty:       result.difficulty || kw.difficulty || 0,
          lastChecked:      now,
          history,
        });
        checked++;
      }
    }

    await batch.commit();

    // Enrich with keyword metrics (volume/difficulty) for any that are missing
    const allKws = kwDocs.map(k => k.keyword);
    const primaryCountry = kwDocs[0]?.location?.country || "US";
    try {
      const metrics = await getKeywordMetrics(allKws.slice(0, 100), keys.seranking, primaryCountry);
      const metricBatch = db.batch();
      for (const kw of kwDocs) {
        const m = metrics[kw.keyword.toLowerCase()];
        if (m && (!kw.volume || kw.volume === 0)) {
          metricBatch.update(kwCol.doc(kw.id), { volume: m.volume, difficulty: m.difficulty, cpc: m.cpc });
        }
      }
      await metricBatch.commit();
    } catch { /* non-blocking */ }

    return res.json({ success: true, checked, domain, countries: Object.keys(byCountry) });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

module.exports = router;
