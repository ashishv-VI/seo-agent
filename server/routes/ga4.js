/**
 * GA4 Routes — Per-Client Google Analytics 4 OAuth
 *
 * Each client connects their own Google Analytics account.
 * Stores refresh token in clients/{clientId}.ga4Integration
 *
 * Endpoints:
 *   GET  /api/ga4/auth-url/:clientId        — Get OAuth URL
 *   GET  /api/ga4/oauth/callback            — OAuth callback (unprotected)
 *   GET  /api/ga4/:clientId/status          — Connection status
 *   GET  /api/ga4/:clientId/properties      — List accessible GA4 properties
 *   GET  /api/ga4/:clientId/analytics       — Full analytics report
 *   GET  /api/ga4/:clientId/realtime        — Active users right now
 *   GET  /api/ga4/:clientId/pages           — Per-page breakdown (all pages)
 *   GET  /api/ga4/:clientId/journey         — User journey (landing → exit)
 *   POST /api/ga4/:clientId/verify-tracking — Check if GA4/GTM is on a URL
 *   POST /api/ga4/:clientId/property        — Set/update property ID
 *   DELETE /api/ga4/:clientId              — Disconnect
 *
 * Add to Render env:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, BACKEND_URL, FRONTEND_URL
 *
 * Add redirect URI in Google Cloud Console:
 *   https://seo-agent-backend-8mfz.onrender.com/api/ga4/oauth/callback
 */

const express         = require("express");
const router          = express.Router();
const { db }          = require("../config/firebase");
const { verifyToken } = require("../middleware/auth");
const ga4 = require("../utils/ga4Client");

const FRONTEND_URL = (process.env.FRONTEND_URL || "https://seo-agent-6jrv.onrender.com").replace(/\/+$/, "");

// ── Helper ────────────────────────────────────────────────────────────────────
async function getClientDoc(clientId, uid) {
  const doc = await db.collection("clients").doc(clientId).get();
  if (!doc.exists)                throw { code: 404, message: "Client not found" };
  if (doc.data().ownerId !== uid) throw { code: 403, message: "Access denied" };
  return doc;
}

// ── GET: Generate OAuth URL ───────────────────────────────────────────────────
router.get("/auth-url/:clientId", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);

    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(500).json({
        error: "Google OAuth not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to environment variables.",
      });
    }

    const authUrl = ga4.buildAuthUrl(req.params.clientId, req.uid);
    return res.json({ authUrl });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── GET: OAuth callback (unprotected — Google redirects here) ─────────────────
router.get("/oauth/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`${FRONTEND_URL}?ga4_error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return res.redirect(`${FRONTEND_URL}?ga4_error=missing_code`);
  }

  let clientId, uid;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    clientId = decoded.clientId;
    uid      = decoded.uid;
  } catch {
    return res.redirect(`${FRONTEND_URL}?ga4_error=invalid_state`);
  }

  try {
    const { accessToken, refreshToken, expiresIn } = await ga4.exchangeCode(code);

    if (!refreshToken) {
      return res.redirect(`${FRONTEND_URL}?ga4_error=no_refresh_token&clientId=${clientId}`);
    }

    const email      = await ga4.getGoogleEmail(accessToken);
    const properties = await ga4.listGA4Properties(accessToken);

    await db.collection("clients").doc(clientId).update({
      ga4Integration: {
        connected:    true,
        accessToken,
        refreshToken,
        tokenExpiry:  Date.now() + expiresIn * 1000,
        email,
        properties,        // list of accessible GA4 properties
        propertyId:   null, // user selects which property to use
        connectedAt:  new Date().toISOString(),
        lastRefreshed: new Date().toISOString(),
      },
    });

    return res.redirect(`${FRONTEND_URL}?ga4_connected=${encodeURIComponent(clientId)}`);
  } catch (e) {
    console.error("[GA4 callback error]", e.message);
    return res.redirect(`${FRONTEND_URL}?ga4_error=${encodeURIComponent(e.message)}&clientId=${clientId}`);
  }
});

// ── GET: Connection status ────────────────────────────────────────────────────
router.get("/:clientId/status", verifyToken, async (req, res) => {
  try {
    const doc    = await getClientDoc(req.params.clientId, req.uid);
    const ga4Int = doc.data().ga4Integration || null;

    if (!ga4Int?.connected) {
      return res.json({ connected: false });
    }

    return res.json({
      connected:   true,
      email:       ga4Int.email       || null,
      propertyId:  ga4Int.propertyId  || null,
      properties:  ga4Int.properties  || [],
      connectedAt: ga4Int.connectedAt || null,
    });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── POST: Set active GA4 property ID ─────────────────────────────────────────
router.post("/:clientId/property", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { propertyId } = req.body;

    if (!propertyId) return res.status(400).json({ error: "propertyId required" });

    await db.collection("clients").doc(req.params.clientId).update({
      "ga4Integration.propertyId": String(propertyId),
    });

    return res.json({ saved: true });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── GET: List accessible GA4 properties ──────────────────────────────────────
router.get("/:clientId/properties", verifyToken, async (req, res) => {
  try {
    const doc    = await getClientDoc(req.params.clientId, req.uid);
    const ga4Int = doc.data().ga4Integration;

    if (!ga4Int?.connected) {
      return res.status(400).json({ error: "GA4 not connected" });
    }

    const accessToken = await ga4.getValidToken(ga4Int, req.params.clientId, db);
    const properties  = await ga4.listGA4Properties(accessToken);

    await db.collection("clients").doc(req.params.clientId).update({
      "ga4Integration.properties": properties,
    });

    return res.json({ properties });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ── GET: Full analytics report ────────────────────────────────────────────────
// Returns: overview metrics, top pages, traffic sources, devices, dates
router.get("/:clientId/analytics", verifyToken, async (req, res) => {
  try {
    const doc    = await getClientDoc(req.params.clientId, req.uid);
    const ga4Int = doc.data().ga4Integration;

    if (!ga4Int?.connected || !ga4Int?.refreshToken) {
      return res.status(400).json({ error: "Google Analytics 4 not connected for this client" });
    }
    if (!ga4Int?.propertyId) {
      return res.status(400).json({ error: "GA4 property not selected — go to Integrations and select a property" });
    }

    const { days = 30, compare = "false", startDate: customStart, endDate: customEnd } = req.query;
    const doCompare   = compare === "true";
    const propId      = ga4Int.propertyId;
    const accessToken = await ga4.getValidToken(ga4Int, req.params.clientId, db);

    const startDate = customStart || `${days}daysAgo`;
    const endDate   = customEnd   || "today";
    // Previous period: same duration shifted back
    const daysNum   = Number(days);
    const prevStart = customStart
      ? (() => { const d = new Date(customStart); d.setDate(d.getDate() - daysNum); return d.toISOString().split("T")[0]; })()
      : `${daysNum * 2}daysAgo`;
    const prevEnd   = customStart ? customStart : `${daysNum}daysAgo`;
    const dateRange = doCompare
      ? [{ startDate, endDate }, { startDate: prevStart, endDate: prevEnd }]
      : [{ startDate, endDate }];

    // Fire all 5 reports in parallel
    const [overviewRaw, pagesRaw, sourcesRaw, devicesRaw, datesRaw] = await Promise.all([
      // Overview — totals (metricAggregations required so totals[] is populated)
      ga4.runReport(propId, accessToken, {
        dateRanges: dateRange,
        metrics: [
          { name: "sessions" },
          { name: "activeUsers" },
          { name: "screenPageViews" },
          { name: "bounceRate" },
          { name: "averageSessionDuration" },
          { name: "newUsers" },
          { name: "engagementRate" },
        ],
        metricAggregations: ["TOTAL"],
      }),

      // Top pages breakdown
      ga4.runReport(propId, accessToken, {
        dateRanges: dateRange,
        dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
        metrics: [
          { name: "screenPageViews" },
          { name: "sessions" },
          { name: "activeUsers" },
          { name: "averageSessionDuration" },
          { name: "bounceRate" },
        ],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 50,
      }),

      // Traffic sources
      ga4.runReport(propId, accessToken, {
        dateRanges: dateRange,
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [
          { name: "sessions" },
          { name: "activeUsers" },
          { name: "screenPageViews" },
        ],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 10,
      }),

      // Devices
      ga4.runReport(propId, accessToken, {
        dateRanges: dateRange,
        dimensions: [{ name: "deviceCategory" }],
        metrics: [{ name: "sessions" }, { name: "activeUsers" }],
        limit: 5,
      }),

      // Date trend
      ga4.runReport(propId, accessToken, {
        dateRanges: dateRange,
        dimensions: [{ name: "date" }],
        metrics: [{ name: "sessions" }, { name: "activeUsers" }, { name: "screenPageViews" }],
        orderBys: [{ dimension: { dimensionName: "date" } }],
        limit: Number(days),
      }),
    ]);

    // Parse overview totals — use totals[] if available, fallback to rows[0]
    const metricNames      = (overviewRaw.metricHeaders || []).map(h => h.name);
    const currentMetrics   = overviewRaw.totals?.[0]?.metricValues || overviewRaw.rows?.[0]?.metricValues || [];
    const previousMetrics  = overviewRaw.totals?.[1]?.metricValues || [];
    const overview         = {};
    const overviewPrev     = {};
    metricNames.forEach((name, i) => {
      overview[name]     = parseFloat(currentMetrics[i]?.value  || 0);
      overviewPrev[name] = parseFloat(previousMetrics[i]?.value || 0);
    });

    return res.json({
      overview,
      overviewPrev: doCompare ? overviewPrev : null,
      pages:        ga4.parseRows(pagesRaw),
      sources:      ga4.parseRows(sourcesRaw),
      devices:      ga4.parseRows(devicesRaw),
      dates:        ga4.parseRows(datesRaw),
      days:         Number(days),
      compare:      doCompare,
      propertyId:   propId,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ── GET: Realtime — active users in last 30 min ───────────────────────────────
router.get("/:clientId/realtime", verifyToken, async (req, res) => {
  try {
    const doc    = await getClientDoc(req.params.clientId, req.uid);
    const ga4Int = doc.data().ga4Integration;

    if (!ga4Int?.connected || !ga4Int?.propertyId) {
      return res.status(400).json({ error: "GA4 not connected or no property selected" });
    }

    const accessToken = await ga4.getValidToken(ga4Int, req.params.clientId, db);

    const [activeUsersRaw, activePagesRaw] = await Promise.all([
      ga4.runRealtimeReport(ga4Int.propertyId, accessToken, {
        metrics: [{ name: "activeUsers" }],
      }),
      ga4.runRealtimeReport(ga4Int.propertyId, accessToken, {
        dimensions: [{ name: "unifiedScreenName" }],
        metrics:    [{ name: "activeUsers" }],
        orderBys:   [{ metric: { metricName: "activeUsers" }, desc: true }],
        limit: 10,
      }),
    ]);

    // Realtime: no dimensions → data in rows[0], not totals
    const activeUsers  = parseFloat(
      activeUsersRaw.rows?.[0]?.metricValues?.[0]?.value ||
      activeUsersRaw.totals?.[0]?.metricValues?.[0]?.value || 0
    );
    const activePages  = ga4.parseRows(activePagesRaw);

    return res.json({ activeUsers, activePages });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ── GET: User journey — landing pages, exit pages, navigation paths ───────────
router.get("/:clientId/journey", verifyToken, async (req, res) => {
  try {
    const doc    = await getClientDoc(req.params.clientId, req.uid);
    const ga4Int = doc.data().ga4Integration;

    if (!ga4Int?.connected || !ga4Int?.propertyId) {
      return res.status(400).json({ error: "GA4 not connected or no property selected" });
    }

    const { days = 30 } = req.query;
    const accessToken   = await ga4.getValidToken(ga4Int, req.params.clientId, db);
    const propId        = ga4Int.propertyId;
    const dateRange     = [{ startDate: `${days}daysAgo`, endDate: "today" }];

    const [landingRaw, pageRaw, sourcePageRaw] = await Promise.all([
      // Landing pages (entry points)
      ga4.runReport(propId, accessToken, {
        dateRanges: dateRange,
        dimensions: [{ name: "landingPage" }],
        metrics:    [{ name: "sessions" }, { name: "bounceRate" }, { name: "screenPageViews" }],
        orderBys:   [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 25,
      }),

      // Most visited pages
      ga4.runReport(propId, accessToken, {
        dateRanges: dateRange,
        dimensions: [{ name: "pagePath" }],
        metrics:    [{ name: "screenPageViews" }, { name: "activeUsers" }],
        orderBys:   [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 25,
      }),

      // Source + landing page combos (cross-page journey context)
      ga4.runReport(propId, accessToken, {
        dateRanges: dateRange,
        dimensions: [{ name: "sessionDefaultChannelGroup" }, { name: "landingPage" }],
        metrics:    [{ name: "sessions" }, { name: "activeUsers" }],
        orderBys:   [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 20,
      }),
    ]);

    return res.json({
      landingPages:  ga4.parseRows(landingRaw),
      exitPages:     ga4.parseRows(pageRaw),
      sourceJourney: ga4.parseRows(sourcePageRaw),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ── POST: Verify GA4/GTM tracking on a URL ────────────────────────────────────
// Fetches the URL server-side and checks for tracking snippet presence
router.post("/:clientId/verify-tracking", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);

    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "url is required" });

    // Validate URL format
    let parsedUrl;
    try { parsedUrl = new URL(url); } catch { return res.status(400).json({ error: "Invalid URL" }); }

    // Only allow http/https
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: "Only http/https URLs allowed" });
    }

    // Fetch page HTML
    let html = "";
    let fetchError = null;
    try {
      const controller = new AbortController();
      const timeout    = setTimeout(() => controller.abort(), 15000);
      const response   = await fetch(url, {
        signal:  controller.signal,
        headers: { "User-Agent": "SEO-Agent/1.0 (tracking-verifier)" },
      });
      clearTimeout(timeout);
      html = await response.text();
    } catch (e) {
      fetchError = e.message.includes("abort") ? "Request timed out (15s)" : e.message;
    }

    if (fetchError) {
      return res.json({ url, error: fetchError, checks: [] });
    }

    // Check for tracking snippets
    const checks = [
      {
        name:    "Google Analytics 4 (gtag.js)",
        type:    "ga4",
        found:   /gtag\.js\?id=G-/i.test(html) || /GA_MEASUREMENT_ID/i.test(html) || /G-[A-Z0-9]{6,}/i.test(html),
        detail:  (() => {
          const match = html.match(/G-[A-Z0-9]{7,}/);
          return match ? `Measurement ID: ${match[0]}` : null;
        })(),
      },
      {
        name:    "Google Tag Manager",
        type:    "gtm",
        found:   /GTM-[A-Z0-9]+/i.test(html) || /googletagmanager\.com\/gtm\.js/i.test(html),
        detail:  (() => {
          const match = html.match(/GTM-[A-Z0-9]+/i);
          return match ? `Container ID: ${match[0].toUpperCase()}` : null;
        })(),
      },
      {
        name:    "Google Analytics (Universal — legacy)",
        type:    "ua",
        found:   /UA-\d{6,}-\d+/i.test(html) || /analytics\.js/i.test(html),
        detail:  (() => {
          const match = html.match(/UA-\d{6,}-\d+/i);
          return match ? `Tracking ID: ${match[0]}` : null;
        })(),
      },
      {
        name:    "GA4 dataLayer push",
        type:    "datalayer",
        found:   /window\.dataLayer\s*=/.test(html) || /dataLayer\.push/.test(html),
        detail:  null,
      },
      {
        name:    "GTM noscript (body tag)",
        type:    "gtm_noscript",
        found:   /<noscript>[^<]*googletagmanager\.com\/ns\.html/i.test(html),
        detail:  null,
      },
    ];

    const hasGA4 = checks.some(c => c.type === "ga4"  && c.found);
    const hasGTM = checks.some(c => c.type === "gtm"  && c.found);
    const summary = hasGA4 && hasGTM ? "Fully tracked"
                  : hasGA4           ? "GA4 found (no GTM)"
                  : hasGTM           ? "GTM found (check GA4 inside GTM)"
                  : "No tracking found";

    return res.json({ url, summary, hasGA4, hasGTM, checks });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── GET: GEO — Country + City breakdown ──────────────────────────────────────
router.get("/:clientId/geo", verifyToken, async (req, res) => {
  try {
    const doc    = await getClientDoc(req.params.clientId, req.uid);
    const ga4Int = doc.data().ga4Integration;
    if (!ga4Int?.connected || !ga4Int?.propertyId) return res.status(400).json({ error: "GA4 not connected" });

    const { days = 30, startDate: cs, endDate: ce } = req.query;
    const startDate   = cs || `${days}daysAgo`;
    const endDate     = ce || "today";
    const accessToken = await ga4.getValidToken(ga4Int, req.params.clientId, db);
    const dateRange   = [{ startDate, endDate }];

    const [countriesRaw, citiesRaw, regionsRaw] = await Promise.all([
      ga4.runReport(ga4Int.propertyId, accessToken, {
        dateRanges: dateRange,
        dimensions: [{ name: "country" }],
        metrics:    [{ name: "sessions" }, { name: "activeUsers" }, { name: "screenPageViews" }, { name: "bounceRate" }],
        orderBys:   [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 30,
      }),
      ga4.runReport(ga4Int.propertyId, accessToken, {
        dateRanges: dateRange,
        dimensions: [{ name: "city" }],
        metrics:    [{ name: "sessions" }, { name: "activeUsers" }],
        orderBys:   [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 20,
      }),
      ga4.runReport(ga4Int.propertyId, accessToken, {
        dateRanges: dateRange,
        dimensions: [{ name: "region" }],
        metrics:    [{ name: "sessions" }, { name: "activeUsers" }],
        orderBys:   [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 20,
      }),
    ]);

    return res.json({
      countries: ga4.parseRows(countriesRaw),
      cities:    ga4.parseRows(citiesRaw),
      regions:   ga4.parseRows(regionsRaw),
    });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// ── GET: AI Traffic — referrals from AI tools ─────────────────────────────────
const AI_SOURCES = [
  "chatgpt.com","chat.openai.com","perplexity.ai","claude.ai",
  "gemini.google.com","copilot.microsoft.com","bard.google.com",
  "you.com","phind.com","bing.com","character.ai","poe.com",
];

router.get("/:clientId/ai-traffic", verifyToken, async (req, res) => {
  try {
    const doc    = await getClientDoc(req.params.clientId, req.uid);
    const ga4Int = doc.data().ga4Integration;
    if (!ga4Int?.connected || !ga4Int?.propertyId) return res.status(400).json({ error: "GA4 not connected" });

    const { days = 30, startDate: cs, endDate: ce } = req.query;
    const startDate   = cs || `${days}daysAgo`;
    const endDate     = ce || "today";
    const accessToken = await ga4.getValidToken(ga4Int, req.params.clientId, db);
    const dateRange   = [{ startDate, endDate }];

    // Get all referral sources
    const [sourcesRaw, pagesRaw, trendRaw] = await Promise.all([
      ga4.runReport(ga4Int.propertyId, accessToken, {
        dateRanges: dateRange,
        dimensions: [{ name: "sessionSource" }],
        metrics:    [{ name: "sessions" }, { name: "activeUsers" }, { name: "screenPageViews" }, { name: "bounceRate" }],
        orderBys:   [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 200,
      }),
      ga4.runReport(ga4Int.propertyId, accessToken, {
        dateRanges: dateRange,
        dimensions: [{ name: "sessionSource" }, { name: "pagePath" }],
        metrics:    [{ name: "sessions" }],
        orderBys:   [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 100,
      }),
      ga4.runReport(ga4Int.propertyId, accessToken, {
        dateRanges: dateRange,
        dimensions: [{ name: "date" }, { name: "sessionSource" }],
        metrics:    [{ name: "sessions" }],
        orderBys:   [{ dimension: { dimensionName: "date" } }],
        limit: 500,
      }),
    ]);

    const allSources = ga4.parseRows(sourcesRaw);
    const aiSources  = allSources.filter(r => {
      const src = (r.sessionSource || "").toLowerCase();
      return AI_SOURCES.some(ai => src.includes(ai.replace("www.","")));
    });

    const allPages  = ga4.parseRows(pagesRaw);
    const aiPages   = allPages.filter(r => {
      const src = (r.sessionSource || "").toLowerCase();
      return AI_SOURCES.some(ai => src.includes(ai.replace("www.","")));
    });

    const allTrend = ga4.parseRows(trendRaw);
    const aiTrend  = {};
    allTrend.forEach(r => {
      const src = (r.sessionSource || "").toLowerCase();
      if (AI_SOURCES.some(ai => src.includes(ai.replace("www.","")))) {
        aiTrend[r.date] = (aiTrend[r.date] || 0) + (r.sessions || 0);
      }
    });

    const totalAiSessions = aiSources.reduce((a,r) => a + (r.sessions||0), 0);
    const totalSessions   = allSources.reduce((a,r) => a + (r.sessions||0), 0);

    return res.json({
      sources:         aiSources,
      pages:           aiPages.slice(0, 20),
      trend:           Object.entries(aiTrend).map(([date,sessions]) => ({ date, sessions })).sort((a,b)=>a.date.localeCompare(b.date)),
      totalAiSessions,
      aiShare:         totalSessions > 0 ? +((totalAiSessions/totalSessions)*100).toFixed(2) : 0,
      totalSessions,
    });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// ── POST: AI Insights — LLM analysis of GA4+GSC data ─────────────────────────
router.post("/:clientId/insights", verifyToken, async (req, res) => {
  try {
    const doc    = await getClientDoc(req.params.clientId, req.uid);
    const ga4Int = doc.data().ga4Integration;
    if (!ga4Int?.connected || !ga4Int?.propertyId) return res.status(400).json({ error: "GA4 not connected" });

    const { analyticsData, gscData, days = 30 } = req.body;
    const { getUserKeys } = require("../utils/getUserKeys");
    const keys = await getUserKeys(req.uid);

    if (!keys.groq && !keys.gemini && !keys.openrouter) {
      return res.status(400).json({ error: "No AI key configured. Add Groq or Gemini in Settings." });
    }

    const ov  = analyticsData?.overview || {};
    const prev = analyticsData?.overviewPrev || {};

    function pctChange(cur, pre) {
      if (!pre || pre === 0) return null;
      return ((cur - pre) / pre * 100).toFixed(1);
    }

    const prompt = `You are an expert SEO and digital analytics consultant. Analyze this Google Analytics 4 data for a client and provide exactly 5 actionable insights.

PERIOD: Last ${days} days

GA4 OVERVIEW:
- Sessions: ${ov.sessions||0}${prev.sessions ? ` (prev: ${prev.sessions}, change: ${pctChange(ov.sessions,prev.sessions)}%)` : ""}
- Users: ${ov.activeUsers||0}${prev.activeUsers ? ` (prev: ${prev.activeUsers}, change: ${pctChange(ov.activeUsers,prev.activeUsers)}%)` : ""}
- Page Views: ${ov.screenPageViews||0}
- Bounce Rate: ${ov.bounceRate ? (ov.bounceRate*100).toFixed(1)+"%" : "N/A"}
- Avg Session: ${ov.averageSessionDuration ? Math.round(ov.averageSessionDuration)+"s" : "N/A"}
- Engagement Rate: ${ov.engagementRate ? (ov.engagementRate*100).toFixed(1)+"%" : "N/A"}

TOP PAGES: ${(analyticsData?.pages||[]).slice(0,5).map(p=>`${p.pagePath}(${p.screenPageViews} views)`).join(", ")||"N/A"}

TRAFFIC SOURCES: ${(analyticsData?.sources||[]).slice(0,5).map(s=>`${s.sessionDefaultChannelGroup}(${s.sessions} sessions)`).join(", ")||"N/A"}

${gscData ? `GSC KEYWORDS: Top keywords: ${(gscData.queries||[]).slice(0,5).map(q=>`"${q.keys?.[0]}"(pos:${q.position?.toFixed(1)},clicks:${q.clicks})`).join(", ")}
Total GSC Clicks: ${gscData.totalClicks||0}, Avg Position: ${gscData.avgPosition||"N/A"}` : ""}

Provide 5 specific, data-driven insights with clear actions. Format as JSON array:
[{"type":"warning|success|opportunity|info","title":"short title","insight":"what the data shows","action":"specific thing to do"}]
Return ONLY valid JSON, no markdown.`;

    let result = null;

    if (keys.groq) {
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${keys.groq}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: [{ role:"user", content: prompt }], temperature: 0.3, max_tokens: 1000 }),
      });
      const groqData = await groqRes.json();
      result = groqData.choices?.[0]?.message?.content;
    } else if (keys.gemini) {
      const gemRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${keys.gemini}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      const gemData = await gemRes.json();
      result = gemData.candidates?.[0]?.content?.parts?.[0]?.text;
    }

    if (!result) return res.status(500).json({ error: "AI failed to generate insights" });

    // Parse JSON from response
    const jsonMatch = result.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return res.status(500).json({ error: "AI response was not valid JSON", raw: result.slice(0,200) });

    const insights = JSON.parse(jsonMatch[0]);
    return res.json({ insights, generatedAt: new Date().toISOString() });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// ── DELETE: Disconnect GA4 ────────────────────────────────────────────────────
router.delete("/:clientId", verifyToken, async (req, res) => {
  try {
    const { FieldValue } = require("../config/firebase");
    await getClientDoc(req.params.clientId, req.uid);
    await db.collection("clients").doc(req.params.clientId).update({
      ga4Integration: FieldValue.delete(),
    });
    return res.json({ disconnected: true });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

module.exports = router;
