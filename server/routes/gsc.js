/**
 * GSC Routes — Per-Client Google Search Console OAuth
 *
 * Each client (damcodigital.com, etc.) connects their own Google account once.
 * We store their refresh token in Firestore — the agency never needs to
 * verify or add each site to their own Google account.
 *
 * Flow:
 *   1. Agency clicks "Connect Search Console" for a client
 *   2. Opens OAuth URL → client logs in with their Google account
 *   3. Callback stores refresh token in clients/{clientId}.gscIntegration
 *   4. All future GSC queries use stored tokens (auto-refreshed)
 *
 * Env vars required (add to Render environment):
 *   GOOGLE_CLIENT_ID      — OAuth client ID from Google Cloud Console
 *   GOOGLE_CLIENT_SECRET  — OAuth client secret
 *   BACKEND_URL           — https://seo-agent-backend-8m1z.onrender.com
 *   FRONTEND_URL          — https://seo-agent-6jrv.onrender.com
 *
 * You also need to add this redirect URI to your Google OAuth client:
 *   https://seo-agent-backend-8m1z.onrender.com/api/gsc/oauth/callback
 */

const express        = require("express");
const router         = express.Router();
const { db }         = require("../config/firebase");
const { verifyToken } = require("../middleware/auth");
const gsc = require("../utils/gscClient");

const FRONTEND_URL = (process.env.FRONTEND_URL || "https://seo-agent-6jrv.onrender.com").replace(/\/+$/, "");

// ── Helper ─────────────────────────────────────────────────────────────────
async function getClientDoc(clientId, uid) {
  const doc = await db.collection("clients").doc(clientId).get();
  if (!doc.exists)               throw { code: 404, message: "Client not found" };
  if (doc.data().ownerId !== uid) throw { code: 403, message: "Access denied" };
  return doc;
}

// ── GET: Debug — shows exact redirect URI being used (temporary) ─────────────
router.get("/debug-config", (req, res) => {
  const backendUrl = (process.env.BACKEND_URL || "https://seo-agent-backend-8m1z.onrender.com").replace(/\/+$/, "");
  res.json({
    backendUrl,
    redirectUri:      backendUrl + "/api/gsc/oauth/callback",
    ga4RedirectUri:   backendUrl + "/api/ga4/oauth/callback",
    googleClientId:   process.env.GOOGLE_CLIENT_ID ? process.env.GOOGLE_CLIENT_ID.slice(0, 20) + "..." : "NOT SET",
    googleSecret:     process.env.GOOGLE_CLIENT_SECRET ? "SET ✓" : "NOT SET",
    backendUrlEnvVar: process.env.BACKEND_URL || "(using hardcoded default)",
  });
});

// ── GET: Generate OAuth URL for connecting a client's Search Console ────────
// Call from frontend: GET /api/gsc/auth-url/:clientId
router.get("/auth-url/:clientId", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);

    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(500).json({
        error: "Google OAuth not configured on server. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to environment variables.",
      });
    }

    const authUrl = gsc.buildAuthUrl(req.params.clientId, req.uid);
    return res.json({ authUrl });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── GET: OAuth callback — Google redirects here after user grants access ───
// This is an UNPROTECTED endpoint (no verifyToken) — Google redirects here
router.get("/oauth/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`${FRONTEND_URL}?gsc_error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return res.redirect(`${FRONTEND_URL}?gsc_error=missing_code`);
  }

  let clientId, uid;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    clientId = decoded.clientId;
    uid      = decoded.uid;
  } catch {
    return res.redirect(`${FRONTEND_URL}?gsc_error=invalid_state`);
  }

  try {
    // Exchange code for tokens
    const { accessToken, refreshToken, expiresIn } = await gsc.exchangeCode(code);

    if (!refreshToken) {
      return res.redirect(`${FRONTEND_URL}?gsc_error=no_refresh_token&clientId=${clientId}`);
    }

    // Get the connected Google account email
    const email = await gsc.getGoogleEmail(accessToken);

    // Get list of accessible sites to show the user
    let sites = [];
    try { sites = await gsc.listSites(accessToken); } catch { /* non-blocking */ }

    // Store in Firestore
    await db.collection("clients").doc(clientId).update({
      gscIntegration: {
        connected:    true,
        accessToken,
        refreshToken,
        tokenExpiry:  Date.now() + expiresIn * 1000,
        email,
        sites,
        connectedAt:  new Date().toISOString(),
        lastRefreshed: new Date().toISOString(),
      },
    });

    // Redirect back to frontend with success
    return res.redirect(`${FRONTEND_URL}?gsc_connected=${encodeURIComponent(clientId)}`);
  } catch (e) {
    console.error("[GSC callback error]", e.message);
    return res.redirect(`${FRONTEND_URL}?gsc_error=${encodeURIComponent(e.message)}&clientId=${clientId}`);
  }
});

// ── GET: Get GSC connection status for a client ────────────────────────────
router.get("/:clientId/status", verifyToken, async (req, res) => {
  try {
    const doc    = await getClientDoc(req.params.clientId, req.uid);
    const gscInt = doc.data().gscIntegration || null;

    if (!gscInt?.connected) {
      return res.json({ connected: false });
    }

    return res.json({
      connected:   true,
      email:       gscInt.email       || null,
      connectedAt: gscInt.connectedAt || null,
      sites:       gscInt.sites       || [],
    });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── POST: Query Search Console data for a client ───────────────────────────
router.post("/:clientId/query", verifyToken, async (req, res) => {
  try {
    const doc    = await getClientDoc(req.params.clientId, req.uid);
    const gscInt = doc.data().gscIntegration;

    if (!gscInt?.connected || !gscInt?.refreshToken) {
      return res.status(400).json({ error: "Search Console not connected for this client — click Connect in Integrations" });
    }

    const { siteUrl, startDate, endDate, dimensions, rowLimit, deviceFilter } = req.body;

    if (!siteUrl) return res.status(400).json({ error: "siteUrl is required" });

    // Get valid access token (auto-refresh if expired)
    const accessToken = await gsc.getValidToken(gscInt, req.params.clientId, db);

    // Build query body
    const queryBody = {
      startDate:  startDate || new Date(Date.now() - 28*24*60*60*1000).toISOString().split("T")[0],
      endDate:    endDate   || new Date().toISOString().split("T")[0],
      dimensions: dimensions || ["query"],
      rowLimit:   rowLimit  || 25,
    };

    if (deviceFilter && deviceFilter !== "all") {
      queryBody.dimensionFilterGroups = [{
        filters: [{ dimension: "device", operator: "equals", expression: deviceFilter }],
      }];
    }

    const data = await gsc.querySearchConsole(siteUrl, accessToken, queryBody);
    return res.json({ data, siteUrl });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── GET: Get all GSC data (queries + pages + countries + devices + dates) ──
// Single endpoint that fetches all dimensions in parallel
router.get("/:clientId/analytics", verifyToken, async (req, res) => {
  try {
    const doc    = await getClientDoc(req.params.clientId, req.uid);
    const gscInt = doc.data().gscIntegration;

    if (!gscInt?.connected || !gscInt?.refreshToken) {
      return res.status(400).json({ error: "Search Console not connected for this client" });
    }

    const { siteUrl, days = 28, device = "all" } = req.query;
    if (!siteUrl) return res.status(400).json({ error: "siteUrl query param required" });

    const accessToken = await gsc.getValidToken(gscInt, req.params.clientId, db);

    const endDate   = new Date().toISOString().split("T")[0];
    const startDate = new Date(Date.now() - Number(days)*24*60*60*1000).toISOString().split("T")[0];

    function makeBody(dimensions) {
      const body = { startDate, endDate, dimensions, rowLimit: 25 };
      if (device !== "all") {
        body.dimensionFilterGroups = [{ filters:[{ dimension:"device", operator:"equals", expression: device }] }];
      }
      return body;
    }

    const [queries, pages, countries, devices, dates] = await Promise.all([
      gsc.querySearchConsole(siteUrl, accessToken, makeBody(["query"])),
      gsc.querySearchConsole(siteUrl, accessToken, makeBody(["page"])),
      gsc.querySearchConsole(siteUrl, accessToken, makeBody(["country"])),
      gsc.querySearchConsole(siteUrl, accessToken, { startDate, endDate, dimensions:["device"], rowLimit:10 }),
      gsc.querySearchConsole(siteUrl, accessToken, makeBody(["date"])),
    ]);

    const rows = queries.rows || [];
    return res.json({
      queries:          rows,
      pages:            pages.rows   || [],
      countries:        countries.rows || [],
      devices:          devices.rows  || [],
      dates:            dates.rows    || [],
      totalClicks:      rows.reduce((a,r)=>a+(r.clicks||0), 0),
      totalImpressions: rows.reduce((a,r)=>a+(r.impressions||0), 0),
      avgCTR:           rows.length ? +(rows.reduce((a,r)=>a+(r.ctr||0),0)/rows.length*100).toFixed(1) : 0,
      avgPosition:      rows.length ? +(rows.reduce((a,r)=>a+(r.position||0),0)/rows.length).toFixed(1) : 0,
      startDate,
      endDate,
      siteUrl,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ── GET: List Search Console sites accessible with client's token ──────────
router.get("/:clientId/sites", verifyToken, async (req, res) => {
  try {
    const doc    = await getClientDoc(req.params.clientId, req.uid);
    const gscInt = doc.data().gscIntegration;

    if (!gscInt?.connected) {
      return res.status(400).json({ error: "Not connected" });
    }

    const accessToken = await gsc.getValidToken(gscInt, req.params.clientId, db);
    const sites       = await gsc.listSites(accessToken);

    // Cache in Firestore
    await db.collection("clients").doc(req.params.clientId).update({
      "gscIntegration.sites": sites,
    });

    return res.json({ sites });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ── DELETE: Disconnect Search Console for a client ─────────────────────────
router.delete("/:clientId", verifyToken, async (req, res) => {
  try {
    const { FieldValue } = require("../config/firebase");
    await getClientDoc(req.params.clientId, req.uid);
    await db.collection("clients").doc(req.params.clientId).update({
      gscIntegration: FieldValue.delete(),
    });
    return res.json({ disconnected: true });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

module.exports = router;
