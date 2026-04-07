/**
 * A10 — Ranking Tracker Agent
 * Fetches live keyword positions via GSC or SerpAPI
 * Compares vs last snapshot, emits drop alerts
 */
const { saveState, getState } = require("../shared-state/stateManager");
const { db, FieldValue }      = require("../config/firebase");
const { emitTasks }           = require("../utils/taskQueue");
const { sendRankingAlert }    = require("../utils/emailer");

async function runA10(clientId, keys, gscToken = null) {
  const brief    = await getState(clientId, "A1_brief");
  const keywords = await getState(clientId, "A3_keywords");

  if (!brief?.websiteUrl) return { success: false, error: "No website URL in brief" };

  const siteUrl = brief.websiteUrl;
  const results = { rankings: [], source: null, drops: [], gains: [], newRankings: [] };

  // ── Try GSC first ─────────────────────────────────
  if (gscToken) {
    try {
      const endDate   = new Date().toISOString().split("T")[0];
      const startDate = new Date(Date.now() - 28*24*60*60*1000).toISOString().split("T")[0];
      const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${gscToken}` },
        body: JSON.stringify({ startDate, endDate, dimensions: ["query","page"], rowLimit: 50 }),
        signal: AbortSignal.timeout(20000),
      });
      const data = await res.json();
      if (data.rows?.length > 0) {
        results.rankings = data.rows.map(r => ({
          keyword:     r.keys[0],
          page:        r.keys[1],
          position:    parseFloat(r.position.toFixed(1)),
          clicks:      r.clicks,
          impressions: r.impressions,
          ctr:         parseFloat((r.ctr * 100).toFixed(2)),
        }));
        results.source = "GSC";
      }
    } catch { /* fall through to SerpAPI */ }
  }

  // ── Try SerpAPI if GSC not available ──────────────
  if (!results.rankings.length && keys?.serpapi) {
    const topKws = (keywords?.keywordMap || [])
      .filter(k => k.priority === "high")
      .slice(0, 15)
      .map(k => k.keyword);

    if (topKws.length > 0) {
      const rankingData = [];
      for (const kw of topKws.slice(0, 8)) { // limit API calls
        try {
          const serpUrl = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(kw)}&num=100&api_key=${keys.serpapi}`;
          const res  = await fetch(serpUrl, { signal: AbortSignal.timeout(10000) });
          const data = await res.json();
          const organic = data.organic_results || [];
          const found   = organic.findIndex(r => r.link?.includes(siteUrl.replace(/https?:\/\//, "").split("/")[0]));
          rankingData.push({
            keyword:    kw,
            position:   found >= 0 ? found + 1 : null,
            page:       found >= 0 ? organic[found].link : null,
            clicks:     null,
            impressions:null,
            source:     "SerpAPI",
          });
        } catch { /* skip */ }
        await new Promise(r => setTimeout(r, 200)); // rate limit
      }
      results.rankings = rankingData;
      results.source   = "SerpAPI";
    }
  }

  // ── FREE FALLBACK: DuckDuckGo SERP scraper (no API key) ────────────────
  // Uses getSERP() from serpScraper.js (DDG/Bing HTML) — already in the codebase.
  // Checks top keywords from A3 keyword map. Sequential to respect rate limits.
  if (!results.rankings.length) {
    try {
      const { getSERP } = require("../crawler/serpScraper");
      const cleanDomain = siteUrl
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .replace(/\/$/, "")
        .toLowerCase();
      // Also compute root domain (e.g. "example" from "example.co.uk") for fuzzy match
      const rootDomain = cleanDomain.split(".")[0];

      const topKws = (keywords?.keywordMap || [])
        .filter(k => k.priority === "high" || k.cluster === "generic")
        .slice(0, 10)
        .map(k => k.keyword);

      if (topKws.length > 0) {
        const rankingData = [];
        const locationStr = (brief.targetLocations || []).join(" ").toLowerCase();
        const loc = locationStr.includes("uk")        ? "uk"
                  : locationStr.includes("india")     ? "in"
                  : locationStr.includes("australia") ? "au" : "us";

        for (const kw of topKws) {
          try {
            const serp  = await getSERP(kw, { location: loc });
            const serpResults = serp.results || [];
            const found = serpResults.findIndex(r => {
              const u = (r.url || r.link || "").toLowerCase();
              const d = (r.domain || "").toLowerCase();
              return u.includes(cleanDomain) || d.includes(cleanDomain) ||
                     (rootDomain.length > 4 && (u.includes(rootDomain) || d.includes(rootDomain)));
            });
            rankingData.push({
              keyword:    kw,
              position:   found >= 0 ? found + 1 : null,
              page:       found >= 0 ? (serpResults[found].url || serpResults[found].link) : null,
              clicks:     null,
              impressions:null,
              source:     serp.source || "DDG",
            });
          } catch { /* skip individual keyword on error */ }
          await new Promise(r => setTimeout(r, 900));
        }

        if (rankingData.length > 0) {
          results.rankings = rankingData;
          results.source   = "DDG (free)";
        }
      }
    } catch { /* getSERP unavailable — fall through */ }
  }

  // ── Last resort: estimate from A4 competitor data ─────────────────────
  if (!results.rankings.length) {
    const competitor = await getState(clientId, "A4_competitor");
    if (competitor?.rankingMatrix?.length > 0) {
      results.rankings = competitor.rankingMatrix.slice(0, 20).map(r => ({
        keyword:  r.keyword,
        position: r.clientRank || null,
        source:   "A4_estimate",
      }));
      results.source = "estimated";
    }
  }

  if (!results.rankings.length) {
    return { success: false, error: "No ranking data available — connect GSC or add SerpAPI key" };
  }

  // ── Compare vs last snapshot ──────────────────────
  const dateKey = new Date().toISOString().split("T")[0];
  // Single where only — no composite index needed; sort client-side
  const prevSnap = await db.collection("rank_history")
    .where("clientId", "==", clientId)
    .limit(20)
    .get();
  const prevSorted = prevSnap.docs.map(d => d.data()).sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const prevData = prevSorted.length > 1 ? prevSorted[1] : null;
  const prevMap  = {};
  if (prevData?.rankings) {
    prevData.rankings.forEach(r => { prevMap[r.keyword] = r.position; });
  }

  const drops = [], gains = [], newRankings = [];
  for (const r of results.rankings) {
    const prev = prevMap[r.keyword];
    if (prev === undefined) { newRankings.push(r); continue; }
    if (r.position && prev && r.position > prev + 3) {
      drops.push({ ...r, previousPosition: prev, drop: r.position - prev });
    } else if (r.position && prev && r.position < prev - 3) {
      gains.push({ ...r, previousPosition: prev, gain: prev - r.position });
    }
  }

  results.drops       = drops;
  results.gains       = gains;
  results.newRankings = newRankings;

  // ── Save snapshot ──────────────────────────────────
  await db.collection("rank_history").doc(`${clientId}_${dateKey}`).set({
    clientId,
    date:      dateKey,
    source:    results.source,
    rankings:  results.rankings,
    drops:     drops.length,
    gains:     gains.length,
    createdAt: new Date().toISOString(),
  });

  // ── Emit drop alerts ───────────────────────────────
  if (drops.length > 0) {
    const dropAlerts = drops.map(d => ({
      type:   "keyword_drop",
      detail: `"${d.keyword}" dropped from position ${d.previousPosition} to ${d.position} (−${d.drop} places)`,
      fix:    "Review content quality and backlink profile for this keyword",
    }));
    await emitTasks(clientId, dropAlerts.slice(0, 5), "p2", "A10").catch(() => {});

    // Send ranking drop email alert
    try {
      const clientDoc = await db.collection("clients").doc(clientId).get();
      const cData     = clientDoc.data() || {};
      const { auth }  = require("../config/firebase");
      const fbUser    = cData.ownerId ? await auth.getUser(cData.ownerId).catch(() => null) : null;
      const toEmail   = fbUser?.email;
      if (toEmail && drops.length >= 3) { // only alert if 3+ drops
        sendRankingAlert({
          to:         toEmail,
          clientName: cData.name || cData.website || clientId,
          websiteUrl: brief.websiteUrl,
          drops:      drops.slice(0, 10),
          agentUrl:   process.env.APP_URL || "https://seo-agent.onrender.com",
        });
      }
    } catch { /* non-blocking */ }
  }

  const ranked     = results.rankings.filter(r => r.position && r.position <= 10).length;
  const notRanking = results.rankings.filter(r => !r.position || r.position > 100).length;

  const output = {
    status:      "complete",
    source:      results.source,
    totalTracked:results.rankings.length,
    top10Count:  ranked,
    notRanking,
    rankings:    results.rankings,
    drops,
    gains,
    newRankings,
    snapshotDate:dateKey,
    summary: `Tracking ${results.rankings.length} keywords via ${results.source}. ${ranked} in top 10. ${drops.length} drops, ${gains.length} gains.`,
  };

  await saveState(clientId, "A10_rankings", output);
  return { success: true, rankings: output };
}

module.exports = { runA10 };
