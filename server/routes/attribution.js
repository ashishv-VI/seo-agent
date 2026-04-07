/**
 * Attribution Routes
 *
 * Tracks keyword → landing page → form fill → lead pipeline.
 * The /event endpoint is PUBLIC (fires from client websites via tracking script).
 * The /data endpoint is PROTECTED (dashboard reads).
 *
 * CORS note: /event uses sendBeacon from client sites — no auth required.
 * Security: validate clientId exists before writing. Rate-limit by IP.
 */
const express       = require("express");
const router        = express.Router();
const { db }        = require("../config/firebase");
const { verifyToken }  = require("../middleware/auth");
const { getState }     = require("../shared-state/stateManager");
const crypto           = require("crypto");

// ── Helper: ownership check ────────────────────────
async function getClientDoc(clientId, uid) {
  const doc = await db.collection("clients").doc(clientId).get();
  if (!doc.exists)               throw { code: 404, message: "Client not found" };
  if (doc.data().ownerId !== uid) throw { code: 403, message: "Access denied" };
  return doc;
}

// ── POST /api/attribution/:clientId/event ─────────
// PUBLIC endpoint — receives form submit events from the tracking script.
// No auth — rate-limited by IP via apiLimiter (applied in index.js).
router.post("/:clientId/event", async (req, res) => {
  try {
    const clientId = req.params.clientId;

    // Validate client exists (access control for public endpoint)
    const clientSnap = await db.collection("clients").doc(clientId).get();
    if (!clientSnap.exists) return res.status(404).json({ error: "Client not found" });

    const {
      sessionId,
      formId,
      landingPage,
      utmSource,
      utmMedium,
      utmCampaign,
      utmTerm,
      utmContent,
      pageUrl,
      referrer,
      userAgent,
    } = req.body;

    // Join with latest A10 rankings to find matching keyword
    let gscKeyword  = utmTerm || null;
    let gscPosition = null;

    if (!gscKeyword) {
      try {
        const rankings = await getState(clientId, "A10_rankings").catch(() => null);
        const rankList = rankings?.rankings || [];
        // Try to match landing page path to a ranked keyword's page
        const lpPath = landingPage ? landingPage.replace(/^https?:\/\/[^/]+/, "").toLowerCase() : "";
        const match  = rankList.find(r => r.page && r.page.replace(/^https?:\/\/[^/]+/, "").toLowerCase() === lpPath);
        if (match) {
          gscKeyword  = match.keyword;
          gscPosition = match.position;
        }
      } catch { /* non-blocking */ }
    }

    // Hash IP for privacy-safe storage
    const rawIp   = req.ip || req.headers["x-forwarded-for"] || "unknown";
    const hashedIp = crypto.createHash("sha256").update(rawIp).digest("hex").slice(0, 16);

    await db.collection("conversions").add({
      clientId,
      sessionId:    sessionId || null,
      formId:       formId    || "unknown",
      landingPage:  landingPage || null,
      pageUrl:      pageUrl   || null,
      referrer:     referrer  || null,
      utmSource:    utmSource || null,
      utmMedium:    utmMedium || null,
      utmCampaign:  utmCampaign || null,
      utmTerm:      utmTerm   || null,
      utmContent:   utmContent || null,
      gscKeyword,
      gscPosition,
      submittedAt:  new Date().toISOString(),
      userAgent:    userAgent  || null,
      clientIp:     hashedIp,
    });

    // Update client conversion count (non-blocking)
    db.collection("clients").doc(clientId).update({
      totalConversions: db.FieldValue?.increment ? db.FieldValue.increment(1) : 0,
      lastConversionAt: new Date().toISOString(),
    }).catch(() => {});

    return res.json({ ok: true });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── GET /api/attribution/:clientId/data ───────────
// PROTECTED — dashboard reads all conversions for a client
router.get("/:clientId/data", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const clientId = req.params.clientId;

    const snap = await db.collection("conversions")
      .where("clientId", "==", clientId)
      .limit(200)
      .get();

    const conversions = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || ""));

    // Aggregate keyword → conversions
    const byKeyword = {};
    const bySource  = {};
    for (const c of conversions) {
      const kw  = c.gscKeyword || c.utmTerm || "(not set)";
      const src = c.utmSource || c.referrer || "direct";
      byKeyword[kw]  = (byKeyword[kw]  || 0) + 1;
      bySource[src]  = (bySource[src]  || 0) + 1;
    }

    const keywordFunnel = Object.entries(byKeyword)
      .map(([keyword, count]) => ({ keyword, conversions: count }))
      .sort((a, b) => b.conversions - a.conversions)
      .slice(0, 20);

    const sourceFunnel = Object.entries(bySource)
      .map(([source, count]) => ({ source, conversions: count }))
      .sort((a, b) => b.conversions - a.conversions);

    return res.json({
      conversions: conversions.slice(0, 100),
      total:       conversions.length,
      keywordFunnel,
      sourceFunnel,
    });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── GET /api/attribution/:clientId/snippet ────────
// Returns the personalised tracking script snippet for this client
router.get("/:clientId/snippet", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const clientDoc  = await db.collection("clients").doc(req.params.clientId).get();
    const backendUrl = process.env.BACKEND_URL || process.env.RENDER_EXTERNAL_URL || "https://seo-agent-backend.onrender.com";

    const snippet = `<!-- SEO Agent Conversion Tracker — paste before </body> -->
<script>
(function() {
  var _seo = { clientId: "${req.params.clientId}", api: "${backendUrl}" };
  function qs(k) { return new URLSearchParams(window.location.search).get(k); }
  var sess = JSON.parse(sessionStorage.getItem("_seo_sess") || "{}");
  if (!sess.sid) {
    sess = {
      sid:        Math.random().toString(36).slice(2),
      utmSource:  qs("utm_source") || document.referrer || null,
      utmMedium:  qs("utm_medium") || null,
      utmCampaign:qs("utm_campaign") || null,
      utmTerm:    qs("utm_term") || null,
      utmContent: qs("utm_content") || null,
      landingPage:window.location.href,
      referrer:   document.referrer || null,
    };
    sessionStorage.setItem("_seo_sess", JSON.stringify(sess));
  }
  document.addEventListener("submit", function(e) {
    var form = e.target;
    var payload = JSON.stringify({
      sessionId:   sess.sid,
      formId:      form.id || form.className || "form",
      landingPage: sess.landingPage,
      pageUrl:     window.location.href,
      referrer:    sess.referrer,
      utmSource:   sess.utmSource,
      utmMedium:   sess.utmMedium,
      utmCampaign: sess.utmCampaign,
      utmTerm:     sess.utmTerm,
      utmContent:  sess.utmContent,
      userAgent:   navigator.userAgent,
    });
    navigator.sendBeacon(_seo.api + "/api/attribution/" + _seo.clientId + "/event",
      new Blob([payload], { type: "application/json" }));
  });
})();
</script>`;

    return res.json({ snippet, clientId: req.params.clientId });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

module.exports = router;
