/**
 * Branding routes (M10.5) — white-label agency branding.
 *
 * Agency-level branding exposed via a client-scoped path (matches spec + reuses
 * portal.js's owner-branding pattern). GET/POST resolve the client's owner and
 * read/write users/{ownerId}.brand — ONE source of truth, no per-client fork.
 * Mounted by agents.js at the same base so paths are /api/agents/:clientId/branding.
 *
 *   GET  /:clientId/branding   — resolved brand (defaults merged over stored)
 *   POST /:clientId/branding   — update the owning agency's brand (sanitized)
 *
 * Reuses verifyToken + getClientDoc. Validation via the pure branding engine
 * (no duplicated validation). Writes stay on the existing users/{ownerId}.brand
 * object so the legacy settings modal + portal keep working unchanged.
 */
const express       = require("express");
const router        = express.Router();
const { db }        = require("../../config/firebase");
const { verifyToken } = require("../../middleware/auth");
const { getClientDoc } = require("../shared/clientOwnership");
const { resolveBrand, sanitizeBrand } = require("../../utils/branding");

// GET resolved brand for the client's owning agency.
router.get("/:clientId/branding", verifyToken, async (req, res) => {
  try {
    const clientDoc = await getClientDoc(req.params.clientId, req.uid); // throws 404/403
    const ownerId = clientDoc.data().ownerId;
    const ownerDoc = await db.collection("users").doc(ownerId).get().catch(() => null);
    const stored = (ownerDoc?.exists && ownerDoc.data().brand) || {};
    return res.json({ branding: resolveBrand(stored), source: ownerDoc?.exists ? "stored" : "default" });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// POST update the owning agency's brand.
router.post("/:clientId/branding", verifyToken, async (req, res) => {
  try {
    const clientDoc = await getClientDoc(req.params.clientId, req.uid);
    const ownerId = clientDoc.data().ownerId;

    // Only the owning agency may edit its own brand.
    if (ownerId !== req.uid) return res.status(403).json({ error: "Only the owning agency can edit branding." });

    const { ok, value, error } = sanitizeBrand(req.body?.branding || req.body || {});
    if (!ok) return res.status(400).json({ error });

    // Merge onto the existing brand object (preserves untouched fields + legacy shape).
    const ownerRef = db.collection("users").doc(ownerId);
    const ownerDoc = await ownerRef.get().catch(() => null);
    const current = (ownerDoc?.exists && ownerDoc.data().brand) || {};
    const merged = { ...current, ...value };
    await ownerRef.set({ brand: merged }, { merge: true });

    return res.json({ branding: resolveBrand(merged), saved: true });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

module.exports = router;
