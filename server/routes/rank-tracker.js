/**
 * Rank Tracker — uses SE Ranking to get live keyword positions
 */
const express  = require("express");
const router   = express.Router();
const { db }   = require("../config/firebase");
const { verifyToken }   = require("../middleware/auth");
const { getUserKeys }   = require("../utils/getUserKeys");
const { getDomainKeywords, getKeywordMetrics, checkBulkPositions } = require("../utils/seranking");
const { checkBulkPositionsDFS, verifyDFSCredentials }              = require("../utils/dataforseo");
const { checkBulkPositionsSerp }                                   = require("../utils/serprank");
const { getSERP }       = require("../crawler/serpScraper");
const { getState }      = require("../shared-state/stateManager");
const { sendRankingAlert } = require("../utils/emailer");

// ── Free DDG rank checker (no API key needed) ─────────────────────────────
// Uses DuckDuckGo/Bing HTML scraper already in the codebase.
// Returns { "keyword lower": { position, url } }
async function checkPositionsDDG(domain, keywords, country) {
  const cleanDomain = domain
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "")
    .toLowerCase();

  const loc = country === "GB" ? "uk"
            : country === "IN" ? "in"
            : country === "AU" ? "au"
            : country === "CA" ? "ca" : "us";

  const results = {};
  for (const kw of keywords) {
    try {
      const serp  = await getSERP(kw, { location: loc });
      const found = (serp.results || []).findIndex(r => {
        const u = (r.url || r.link || "").toLowerCase();
        return u.includes(cleanDomain);
      });
      results[kw.toLowerCase()] = {
        position: found >= 0 ? found + 1 : null,
        url:      found >= 0 ? (serp.results[found].url || serp.results[found].link || null) : null,
      };
    } catch {
      results[kw.toLowerCase()] = { position: null, url: null };
    }
    // Respectful delay — DDG rate-limits aggressive scrapers
    await new Promise(r => setTimeout(r, 900));
  }
  return results;
}

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

// POST — check positions for ALL tracked keywords
// Uses DataForSEO (preferred) or SE Ranking Research API fallback
router.post("/:clientId/check-positions", verifyToken, async (req, res) => {
  try {
    const doc    = await getClientDoc(req.params.clientId, req.uid);
    const keys   = await getUserKeys(req.uid);
    const brief  = await getState(req.params.clientId, "A1_brief") || {};
    const domain = brief.websiteUrl || doc.data().website || "";

    if (!domain) {
      return res.status(400).json({ error: "No website URL found for this client" });
    }

    const kwCol  = db.collection("clients").doc(req.params.clientId).collection("tracked_keywords");
    const snap   = await kwCol.get();
    if (snap.empty) return res.json({ checked: 0, message: "No tracked keywords found" });

    const kwDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Group keywords by country
    const byCountry = {};
    for (const kw of kwDocs) {
      const country = kw.location?.country || "US";
      if (!byCountry[country]) byCountry[country] = [];
      byCountry[country].push(kw);
    }

    const now    = new Date().toISOString();
    const today  = now.split("T")[0];
    let   checked = 0;
    const batch   = db.batch();

    // Engine priority: DataForSEO → SerpAPI → SE Ranking → DuckDuckGo (free, no API needed)
    const engine = keys.dataforseo ? "dataforseo"
                 : keys.serp       ? "serpapi"
                 : keys.seranking  ? "seranking"
                 : "ddg";

    for (const [country, kwGroup] of Object.entries(byCountry)) {
      const keywordStrings = kwGroup.map(k => k.keyword);
      let   positions      = {};

      if (engine === "dataforseo") {
        positions = await checkBulkPositionsDFS(domain, keywordStrings, keys.dataforseo, country);
      } else if (engine === "serpapi") {
        positions = await checkBulkPositionsSerp(domain, keywordStrings, keys.serp, country);
      } else if (engine === "seranking") {
        positions = await checkBulkPositions(domain, keywordStrings, keys.seranking, country);
      } else {
        // Free DDG fallback — no API key needed, uses DuckDuckGo/Bing HTML scraper
        positions = await checkPositionsDDG(domain, keywordStrings, country);
      }

      for (const kw of kwGroup) {
        const key     = kw.keyword.toLowerCase();
        const result  = positions[key] || { position: null, url: null };
        const prevPos = kw.currentPosition;
        const newPos  = result.position;
        const change  = (prevPos !== null && newPos !== null) ? prevPos - newPos : null;

        // Store new position on the in-memory object for drop detection below
        kw._newPos  = newPos;
        kw._change  = change;

        const history = (kw.history || []).slice(-89);
        history.push({ date: today, position: newPos, url: result.url || null });

        batch.update(kwCol.doc(kw.id), {
          currentPosition:  newPos,
          previousPosition: prevPos,
          change,
          rankingUrl:       result.url || null,
          lastChecked:      now,
          history,
          serpFeatures:         result.serpFeatures         || [],
          ownsFeaturedSnippet:  result.ownsFeaturedSnippet  || false,
        });
        checked++;
      }
    }

    await batch.commit();

    // ── Fire alerts for significant ranking drops (non-blocking) ──────────
    // Build a flat map of all new positions from the batch update above
    const newPositionMap = {};
    for (const kw of kwDocs) {
      newPositionMap[kw.id] = kw._newPos ?? null;
    }

    const drops = [];
    for (const kw of kwDocs) {
      // Use the live _change computed during this check-positions run (not the stale stored value)
      const liveChange = kw._change ?? kw.change;
      const prevPos    = kw.currentPosition; // was the position before this run
      if (liveChange !== null && liveChange < -4 && prevPos !== null) {
        drops.push({ kw, prevChange: liveChange, prevPos });
      }
    }
    if (drops.length > 0) {
      const alertBatch = db.batch();
      for (const { kw, prevChange, prevPos } of drops) {
        const severity = prevChange <= -10 ? "P1" : "P2";
        alertBatch.set(db.collection("alerts").doc(), {
          clientId:  req.params.clientId,
          type:      "ranking_drop",
          message:   `"${kw.keyword}" dropped ${Math.abs(prevChange)} positions (was #${prevPos})`,
          severity,
          source:    "rank_tracker",
          keyword:   kw.keyword,
          drop:      Math.abs(prevChange),
          country:   kw.location?.country || "US",
          resolved:  false,
          createdAt: new Date(),
        });
      }
      await alertBatch.commit().catch(() => {});

      // ── Send email alert (non-blocking) ────────────────────────────────
      try {
        const ownerDoc  = await db.collection("users").doc(req.uid).get();
        const ownerData = ownerDoc.data() || {};
        const toEmail   = ownerData.email || null;
        const clientDoc = await db.collection("clients").doc(req.params.clientId).get();
        const clientData = clientDoc.data() || {};
        const brief = await getState(req.params.clientId, "A1_brief") || {};
        if (toEmail) {
          sendRankingAlert({
            to:          toEmail,
            clientName:  clientData.name || brief.businessName || "Client",
            websiteUrl:  domain,
            drops:       drops.map(({ kw, prevChange, prevPos }) => ({
              keyword:          kw.keyword,
              drop:             Math.abs(prevChange),
              previousPosition: prevPos,
              position:         prevPos + prevChange,
            })),
            agentUrl: process.env.APP_URL || "https://seo-agent-6jrv.onrender.com",
          });
        }
      } catch { /* email failure must not break the response */ }
    }

    // Enrich volume/difficulty via SE Ranking keyword metrics (non-blocking)
    if (keys.seranking) {
      const allKws         = kwDocs.map(k => k.keyword);
      const primaryCountry = kwDocs[0]?.location?.country || "US";
      try {
        const metrics     = await getKeywordMetrics(allKws.slice(0, 100), keys.seranking, primaryCountry);
        const metricBatch = db.batch();
        for (const kw of kwDocs) {
          const m = metrics[kw.keyword.toLowerCase()];
          if (m && (!kw.volume || kw.volume === 0)) {
            metricBatch.update(kwCol.doc(kw.id), { volume: m.volume || 0, difficulty: m.difficulty || 0, cpc: m.cpc || 0 });
          }
        }
        await metricBatch.commit();
      } catch { /* non-blocking */ }
    }

    return res.json({
      success: true,
      checked,
      domain,
      engine,
      countries: Object.keys(byCountry),
    });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// POST — verify DataForSEO credentials and check balance
router.post("/:clientId/verify-dataforseo", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { auth } = req.body;
    if (!auth) return res.status(400).json({ error: "auth (login:password) required" });
    const result = await verifyDFSCredentials(auth);
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// POST — keyword ideas / research via DataForSEO Labs
router.post("/:clientId/keyword-ideas", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const keys = await getUserKeys(req.uid);

    if (!keys.dataforseo) {
      return res.status(400).json({ error: "DataForSEO key required for keyword research. Add login:password in Settings." });
    }

    const { keywords = [], country = "US", limit = 50 } = req.body;
    if (!keywords.length) return res.status(400).json({ error: "keywords array required" });

    const LOCATION_CODES = { US:2840, GB:2826, IN:2356, AU:2036, CA:2124, AE:9041334, SG:1062822, DE:2276, FR:2250 };
    const locationCode = LOCATION_CODES[country] || 2840;

    const authHeader = `Basic ${Buffer.from(keys.dataforseo).toString("base64")}`;
    const apiRes = await fetch("https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_ideas/live", {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify([{
        keywords,
        language_name: "English",
        location_code: locationCode,
        limit,
        include_serp_info: false,
      }]),
      signal: AbortSignal.timeout(30000),
    });

    const data = await apiRes.json();
    const items = data?.tasks?.[0]?.result?.[0]?.items || [];

    return res.json({
      ideas: items.map(i => ({
        keyword:    i.keyword,
        volume:     i.keyword_info?.search_volume     || 0,
        difficulty: i.keyword_properties?.keyword_difficulty || 0,
        cpc:        +(i.keyword_info?.cpc             || 0).toFixed(2),
        competition:i.keyword_info?.competition_level || "—",
        intent:     i.search_intent_info?.main_intent || "informational",
        trend:      (i.keyword_info?.monthly_searches || []).slice(-6).map(m => m?.search_volume || 0),
      })),
      total: items.length,
      country,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;
