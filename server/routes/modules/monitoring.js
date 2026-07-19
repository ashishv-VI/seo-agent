/**
 * Monitoring / Alerts routes — extracted from routes/agents.js (Sprint 1, M6.10).
 *
 * Mounted by agents.js under the same base path (/api/agents), so the public
 * endpoints are unchanged:
 *   POST /api/agents/:clientId/A9/alerts               — run alert check (A9 checkAlerts)
 *   POST /api/agents/:clientId/alerts/:alertId/resolve — mark an alert resolved
 *   GET  /api/agents/:clientId/alerts                   — list alerts (business-language translated)
 *   GET  /api/agents/:clientId/cwv-history             — Core Web Vitals history
 *   GET  /api/agents/:clientId/fix-verification        — fix-verification outcomes + stats
 *
 * Routes moved verbatim, in original file order. Middleware (verifyToken),
 * ownership (getClientDoc), Firestore access, alert translation, severity labels,
 * validation, status codes, error messages, and response formats are identical
 * to the originals.
 */
const express       = require("express");
const router        = express.Router();
const { db, FieldValue } = require("../../config/firebase");
const { verifyToken } = require("../../middleware/auth");
const { getUserKeys } = require("../../utils/getUserKeys");
const { checkAlerts } = require("../../agents/A9_monitoring");
const { translateAlert, SEVERITY_LABELS } = require("../../utils/alertTranslator");
const { getClientDoc } = require("../shared/clientOwnership");

// ── Run A9: Check Alerts ───────────────────────────
router.post("/:clientId/A9/alerts", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const keys   = await getUserKeys(req.uid);
    const result = await checkAlerts(req.params.clientId, keys);
    return res.json(result);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

router.post("/:clientId/alerts/:alertId/resolve", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    await db.collection("alerts").doc(req.params.alertId).update({
      resolved:   true,
      resolvedAt: FieldValue.serverTimestamp(),
    });
    return res.json({ message: "Alert resolved" });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

router.get("/:clientId/alerts", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    // No composite index — single where clause, filter+sort client-side
    const snap = await db.collection("alerts")
      .where("clientId", "==", req.params.clientId)
      .limit(60)
      .get();

    const alerts = snap.docs
      .map(d => {
        const a = d.data();
        const translated = translateAlert(a.message, a.type);
        return {
          id: d.id,
          ...a,
          ...translated,
          severityLabel: SEVERITY_LABELS[translated.severity] || SEVERITY_LABELS.info,
        };
      })
      .sort((a, b) => ((b.createdAt?._seconds || b.createdAt?.seconds || 0) - (a.createdAt?._seconds || a.createdAt?.seconds || 0)));

    return res.json({ alerts });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

router.get("/:clientId/cwv-history", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const snap = await db.collection("cwv_history")
      .where("clientId", "==", req.params.clientId)
      .orderBy("createdAt", "asc")
      .limit(24)
      .get();
    const history = snap.docs.map(d => {
      const data = d.data();
      return { id: d.id, ...data, createdAt: data.createdAt?.toDate?.()?.toISOString() };
    });
    return res.json({ history, total: history.length });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

router.get("/:clientId/fix-verification", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const snap = await db.collection("fix_verification")
      .where("clientId", "==", req.params.clientId)
      .limit(50)
      .get();
    const fixes = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.pushedAt || "").localeCompare(a.pushedAt || ""));
    const pending  = fixes.filter(f => f.status === "pending").length;
    const improved = fixes.filter(f => f.outcome === "improved").length;
    const degraded = fixes.filter(f => f.outcome === "degraded").length;
    return res.json({ fixes, stats: { total: fixes.length, pending, improved, degraded, successRate: fixes.length > 0 ? Math.round(improved / (fixes.filter(f=>f.status==="checked").length||1) * 100) : null } });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

module.exports = router;
