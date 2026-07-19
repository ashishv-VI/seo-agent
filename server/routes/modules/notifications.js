/**
 * Notifications routes — extracted from routes/agents.js (Sprint 1, Story M6.1).
 *
 * Mounted by agents.js under the same base path (/api/agents), so the public
 * endpoints are unchanged:
 *   GET  /api/agents/notifications                — unread notifications for the user
 *   POST /api/agents/notifications/:notifId/read  — mark one as read
 *   POST /api/agents/notifications/read-all        — mark all as read
 *
 * Routes moved verbatim. Middleware (verifyToken), Firestore access, validation,
 * and response formats are identical to the originals.
 */
const express       = require("express");
const router        = express.Router();
const { db }        = require("../../config/firebase");
const { verifyToken } = require("../../middleware/auth");

// ────────────────────────────────────────────────────
// NOTIFICATIONS
// ────────────────────────────────────────────────────

// GET unread notifications for this user
router.get("/notifications", verifyToken, async (req, res) => {
  try {
    // Single where clause only — no composite index needed; filter client-side
    const snap = await db.collection("notifications")
      .where("ownerId", "==", req.uid).limit(40).get();
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(n => !n.read)
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
      .slice(0, 20);
    return res.json({ notifications: items, unread: items.length });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// POST mark notification as read
router.post("/notifications/:notifId/read", verifyToken, async (req, res) => {
  try {
    await db.collection("notifications").doc(req.params.notifId).update({ read: true });
    return res.json({ message: "Marked as read" });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// POST mark ALL notifications as read for this user
router.post("/notifications/read-all", verifyToken, async (req, res) => {
  try {
    const snap = await db.collection("notifications")
      .where("ownerId", "==", req.uid)
      .where("read", "==", false)
      .limit(50)
      .get();
    const batch = db.batch();
    snap.docs.forEach(d => batch.update(d.ref, { read: true }));
    if (!snap.empty) await batch.commit();
    return res.json({ marked: snap.size });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

module.exports = router;
