/**
 * Portal Routes — White-label client-facing read-only SEO report
 * No auth required for GET /:token (public share link)
 * POST routes require owner auth to generate/disable
 */
const express   = require("express");
const router    = express.Router();
const crypto    = require("crypto");
const { db, FieldValue } = require("../config/firebase");
const { verifyToken }    = require("../middleware/auth");
const { getClientState } = require("../shared-state/stateManager");

// ── Generate portal share link ─────────────────────────────────
router.post("/generate/:clientId", verifyToken, async (req, res) => {
  try {
    const doc = await db.collection("clients").doc(req.params.clientId).get();
    if (!doc.exists) return res.status(404).json({ error: "Client not found" });
    if (doc.data().ownerId !== req.uid) return res.status(403).json({ error: "Access denied" });

    // Reuse existing token if already generated; generate new one otherwise
    const existing = doc.data().portalToken;
    const token    = existing || crypto.randomBytes(24).toString("hex");

    await db.collection("clients").doc(req.params.clientId).update({
      portalToken:     token,
      portalEnabled:   true,
      portalCreatedAt: new Date().toISOString(),
    });

    const appUrl = process.env.APP_URL || "https://seo-agent-6jrv.onrender.com";
    return res.json({ token, url: `${appUrl}/?portal=${token}` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Regenerate (rotate) portal token ───────────────────────────
router.post("/regenerate/:clientId", verifyToken, async (req, res) => {
  try {
    const doc = await db.collection("clients").doc(req.params.clientId).get();
    if (!doc.exists) return res.status(404).json({ error: "Client not found" });
    if (doc.data().ownerId !== req.uid) return res.status(403).json({ error: "Access denied" });

    const token = crypto.randomBytes(24).toString("hex");
    await db.collection("clients").doc(req.params.clientId).update({
      portalToken:     token,
      portalEnabled:   true,
      portalCreatedAt: new Date().toISOString(),
    });

    const appUrl = process.env.APP_URL || "https://seo-agent-6jrv.onrender.com";
    return res.json({ token, url: `${appUrl}/?portal=${token}` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Disable portal ─────────────────────────────────────────────
router.post("/disable/:clientId", verifyToken, async (req, res) => {
  try {
    const doc = await db.collection("clients").doc(req.params.clientId).get();
    if (!doc.exists) return res.status(404).json({ error: "Client not found" });
    if (doc.data().ownerId !== req.uid) return res.status(403).json({ error: "Access denied" });

    await db.collection("clients").doc(req.params.clientId).update({ portalEnabled: false });
    return res.json({ message: "Portal disabled" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Public: load portal data by token ─────────────────────────
router.get("/:token", async (req, res) => {
  try {
    const snap = await db.collection("clients")
      .where("portalToken",   "==", req.params.token)
      .where("portalEnabled", "==", true)
      .limit(1)
      .get();

    if (snap.empty) return res.status(404).json({ error: "Portal not found or disabled" });

    const doc      = snap.docs[0];
    const client   = doc.data();
    const clientId = doc.id;

    // Owner's agency branding
    const ownerDoc = await db.collection("users").doc(client.ownerId).get().catch(() => null);
    const owner    = ownerDoc?.data() || {};

    const state     = await getClientState(clientId);
    const audit     = state.A2_audit    || null;
    const keywords  = state.A3_keywords || null;
    const report    = state.A9_report   || null;
    const rankings  = state.A10_rankings || null;
    const technical = state.A7_technical || null;
    const geo       = state.A8_geo      || null;

    return res.json({
      client: {
        name:                client.name,
        website:             client.website,
        pipelineStatus:      client.pipelineStatus || "pending",
        pipelineCompletedAt: client.pipelineCompletedAt || null,
        seoScore:            client.seoScore || null,
        agents:              client.agents   || {},
      },
      agency: {
        name:  owner.agencyName || owner.company || owner.name || "SEO Agency",
        email: owner.agencyEmail || owner.email || null,
        logo:  owner.agencyLogo || null,
      },
      data: {
        // A9 report highlights
        summary:         report?.summary         || null,
        healthScore:     report?.healthScore      || client.seoScore || null,
        keyFindings:     (report?.keyFindings     || []).slice(0, 5),
        recommendations: (report?.recommendations || []).slice(0, 8),

        // Technical audit
        techScore: audit?.score || null,
        topIssues: (audit?.issues || [])
          .filter(i => i.severity === "critical" || i.severity === "high")
          .slice(0, 6)
          .map(i => ({ type: i.type, description: i.description || i.detail, severity: i.severity })),
        crawledPages: (audit?.pages || []).length,

        // Performance (CWV)
        mobileScore:  technical?.mobile?.score  || null,
        desktopScore: technical?.desktop?.score || null,
        lcp:  technical?.mobile?.metrics?.lcp  || null,
        fcp:  technical?.mobile?.metrics?.fcp  || null,
        cls:  technical?.mobile?.metrics?.cls  || null,
        ttfb: technical?.mobile?.metrics?.ttfb || null,

        // Keywords
        totalKeywords: keywords?.keywordMap?.length || 0,
        topKeywords: (keywords?.keywordMap || [])
          .filter(k => k.priority === "high")
          .slice(0, 10)
          .map(k => ({ keyword: k.keyword, intent: k.intent, difficulty: k.difficulty })),

        // Rankings
        rankingsSource: rankings?.source     || null,
        top10Count:     rankings?.top10Count || 0,
        totalTracked:   rankings?.totalTracked || 0,
        rankDrops:      (rankings?.drops  || []).slice(0, 5),
        rankGains:      (rankings?.gains  || []).slice(0, 5),

        // GEO / Local
        localPresence: geo?.localPresenceScore || null,
        hasGBP:        geo?.hasGBP             || false,

        reportDate: report?.generatedAt || client.pipelineCompletedAt || null,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
