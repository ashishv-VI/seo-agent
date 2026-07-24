/**
 * apiManagement.js — Developer-portal management routes (M10.6).
 *
 * Agencies manage their API keys + webhooks FROM THE APP, so these routes use
 * the existing Firebase-JWT verifyToken (NOT API-key auth) and are agency-scoped
 * by req.uid. Mounted by agents.js at the same base:
 *   /api/agents/dev/keys            GET (list) · POST (create)
 *   /api/agents/dev/keys/:keyId     DELETE (revoke) · POST .../rotate
 *   /api/agents/dev/webhooks        GET (list) · POST (create)
 *   /api/agents/dev/webhooks/:id    DELETE
 *   /api/agents/dev/scopes          GET (available scopes + events)
 *
 * Delegates to the pure apiKeys + webhooks engines. Plaintext key + webhook
 * secret are returned ONCE at creation and never stored/returned again.
 */
const express = require("express");
const router  = express.Router();
const { db }  = require("../../config/firebase");
const { verifyToken } = require("../../middleware/auth");
const keys = require("../../utils/apiKeys");
const hooks = require("../../utils/webhooks");

// ── API keys ──
router.get("/dev/keys", verifyToken, async (req, res) => {
  try { return res.json({ keys: await keys.listKeys(db, req.uid) }); }
  catch (e) { return res.status(e.code || 500).json({ error: e.message }); }
});
router.post("/dev/keys", verifyToken, async (req, res) => {
  try {
    const { name, scopes, expiresInDays } = req.body || {};
    const created = await keys.createKey(db, { ownerId: req.uid, name, scopes, expiresInDays });
    // plaintext returned once — client must copy it now.
    return res.json({ ...created, warning: "Copy this key now — it will not be shown again." });
  } catch (e) { return res.status(e.code || 500).json({ error: e.message }); }
});
router.delete("/dev/keys/:keyId", verifyToken, async (req, res) => {
  try { const r = await keys.revokeKey(db, req.params.keyId, req.uid); return r.ok ? res.json({ revoked: true }) : res.status(404).json(r); }
  catch (e) { return res.status(e.code || 500).json({ error: e.message }); }
});
router.post("/dev/keys/:keyId/rotate", verifyToken, async (req, res) => {
  try { const r = await keys.rotateKey(db, req.params.keyId, req.uid); return r.ok ? res.json(r) : res.status(404).json(r); }
  catch (e) { return res.status(e.code || 500).json({ error: e.message }); }
});

// ── Webhooks ──
router.get("/dev/webhooks", verifyToken, async (req, res) => {
  try { return res.json({ webhooks: await hooks.listWebhooks(req.uid) }); }
  catch (e) { return res.status(e.code || 500).json({ error: e.message }); }
});
router.post("/dev/webhooks", verifyToken, async (req, res) => {
  try {
    const { url, events } = req.body || {};
    const r = await hooks.createWebhook(req.uid, { url, events });
    return r.ok ? res.json({ webhook: r.webhook, warning: "Copy the signing secret now." }) : res.status(400).json(r);
  } catch (e) { return res.status(e.code || 500).json({ error: e.message }); }
});
router.delete("/dev/webhooks/:id", verifyToken, async (req, res) => {
  try { const r = await hooks.deleteWebhook(req.uid, req.params.id); return r.ok ? res.json({ deleted: true }) : res.status(404).json(r); }
  catch (e) { return res.status(e.code || 500).json({ error: e.message }); }
});

// ── Metadata: available scopes + webhook events (for the portal UI) ──
router.get("/dev/scopes", verifyToken, async (req, res) => {
  return res.json({ scopes: keys.VALID_SCOPES, events: hooks.EVENTS });
});

module.exports = router;
