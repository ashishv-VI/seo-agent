/**
 * Integrations Routes — Level 1 (Connect)
 *
 * Manages CMS connections per client.
 * WordPress credentials are stored on the client Firestore doc.
 * Each client has their own CMS — credentials are NOT shared across clients.
 *
 * WP credentials stored as: clients/{clientId}.wpIntegration = {
 *   url, username, appPassword, connected, connectedAt, siteInfo, hasYoast
 * }
 *
 * NOTE: appPassword is stored as plaintext in Firestore.
 * For production hardening, encrypt before write and decrypt before use.
 */
const express      = require("express");
const router       = express.Router();
const { db, FieldValue } = require("../config/firebase");
const { verifyToken }    = require("../middleware/auth");
const wp = require("../utils/wpConnector");

// ── Helper: verify client ownership ───────────────────────────────────────
async function getClientDoc(clientId, uid) {
  const doc = await db.collection("clients").doc(clientId).get();
  if (!doc.exists)               throw { code: 404, message: "Client not found" };
  if (doc.data().ownerId !== uid) throw { code: 403, message: "Access denied" };
  return doc;
}

// ── GET: Get integration status for a client ──────────────────────────────
router.get("/:clientId", verifyToken, async (req, res) => {
  try {
    const doc    = await getClientDoc(req.params.clientId, req.uid);
    const data   = doc.data();
    const wpInt  = data.wpIntegration || null;

    // Mask app password before sending to frontend
    let safeWp = null;
    if (wpInt) {
      safeWp = {
        url:          wpInt.url,
        username:     wpInt.username,
        connected:    wpInt.connected,
        connectedAt:  wpInt.connectedAt,
        siteInfo:     wpInt.siteInfo   || null,
        hasYoast:     wpInt.hasYoast   || false,
        lastSynced:   wpInt.lastSynced || null,
        pageCount:    wpInt.pageCount  || 0,
        postCount:    wpInt.postCount  || 0,
        // Mask password — only show last 4 chars so user knows it's set
        appPasswordMasked: wpInt.appPassword
          ? "••••••••••••••••••••" + wpInt.appPassword.replace(/\s/g, "").slice(-4)
          : null,
      };
    }

    return res.json({ wordpress: safeWp });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── POST: Connect WordPress (test + save credentials) ────────────────────
router.post("/:clientId/wordpress/connect", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { url, username, appPassword } = req.body;

    if (!url || !username || !appPassword) {
      return res.status(400).json({ error: "url, username, and appPassword are required" });
    }

    // Normalize URL
    const siteUrl = url.replace(/\/+$/, "");

    // Test the connection
    let siteInfo;
    try {
      siteInfo = await wp.testConnection(siteUrl, username, appPassword);
    } catch (err) {
      return res.status(400).json({ error: `Connection failed: ${err.message}` });
    }

    // Fetch page and post counts
    let pageCount = 0;
    let postCount = 0;
    try {
      const pages = await wp.getPages(siteUrl, username, appPassword);
      const posts = await wp.getPosts(siteUrl, username, appPassword, 50);
      pageCount   = pages.length;
      postCount   = posts.length;
    } catch { /* non-blocking */ }

    // Save to Firestore
    await db.collection("clients").doc(req.params.clientId).update({
      wpIntegration: {
        url:         siteUrl,
        username,
        appPassword, // stored as-is; mask on read
        connected:   true,
        connectedAt: new Date().toISOString(),
        lastSynced:  new Date().toISOString(),
        pageCount,
        postCount,
        siteInfo: {
          name:      siteInfo.siteName       || null,
          wpVersion: siteInfo.wpVersion      || null,
          userName:  siteInfo.userName       || null,
          userRoles: siteInfo.userRoles      || [],
        },
        hasYoast:    siteInfo.hasYoast || false,
      },
    });

    return res.json({
      connected: true,
      siteInfo,
      pageCount,
      postCount,
      message: `Connected to ${siteInfo.siteName || siteUrl}`,
    });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── POST: Re-test existing connection ─────────────────────────────────────
router.post("/:clientId/wordpress/test", verifyToken, async (req, res) => {
  try {
    const doc   = await getClientDoc(req.params.clientId, req.uid);
    const wpInt = doc.data().wpIntegration;

    if (!wpInt?.url || !wpInt?.username || !wpInt?.appPassword) {
      return res.status(400).json({ error: "No WordPress integration configured for this client" });
    }

    const siteInfo = await wp.testConnection(wpInt.url, wpInt.username, wpInt.appPassword);

    await db.collection("clients").doc(req.params.clientId).update({
      "wpIntegration.connected":  true,
      "wpIntegration.lastSynced": new Date().toISOString(),
      "wpIntegration.hasYoast":   siteInfo.hasYoast || false,
    });

    return res.json({ connected: true, siteInfo });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── GET: Fetch all pages from connected WP site ───────────────────────────
router.get("/:clientId/wordpress/pages", verifyToken, async (req, res) => {
  try {
    const doc   = await getClientDoc(req.params.clientId, req.uid);
    const wpInt = doc.data().wpIntegration;

    if (!wpInt?.connected) {
      return res.status(400).json({ error: "WordPress not connected for this client" });
    }

    const pages = await wp.getPages(wpInt.url, wpInt.username, wpInt.appPassword);

    // Update count in Firestore
    await db.collection("clients").doc(req.params.clientId).update({
      "wpIntegration.pageCount":  pages.length,
      "wpIntegration.lastSynced": new Date().toISOString(),
    });

    return res.json({ pages, total: pages.length });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── GET: Fetch all posts from connected WP site ───────────────────────────
router.get("/:clientId/wordpress/posts", verifyToken, async (req, res) => {
  try {
    const doc   = await getClientDoc(req.params.clientId, req.uid);
    const wpInt = doc.data().wpIntegration;

    if (!wpInt?.connected) {
      return res.status(400).json({ error: "WordPress not connected for this client" });
    }

    const posts = await wp.getPosts(wpInt.url, wpInt.username, wpInt.appPassword, 100);

    await db.collection("clients").doc(req.params.clientId).update({
      "wpIntegration.postCount":  posts.length,
      "wpIntegration.lastSynced": new Date().toISOString(),
    });

    return res.json({ posts, total: posts.length });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── GET: Fetch categories from connected WP site ──────────────────────────
router.get("/:clientId/wordpress/categories", verifyToken, async (req, res) => {
  try {
    const doc   = await getClientDoc(req.params.clientId, req.uid);
    const wpInt = doc.data().wpIntegration;

    if (!wpInt?.connected) {
      return res.status(400).json({ error: "WordPress not connected" });
    }

    const categories = await wp.getCategories(wpInt.url, wpInt.username, wpInt.appPassword);
    return res.json({ categories });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── DELETE: Disconnect WordPress ──────────────────────────────────────────
router.delete("/:clientId/wordpress", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);

    await db.collection("clients").doc(req.params.clientId).update({
      wpIntegration: FieldValue.delete(),
    });

    return res.json({ disconnected: true, message: "WordPress disconnected" });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

module.exports = router;
