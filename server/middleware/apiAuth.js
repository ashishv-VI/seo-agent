/**
 * apiAuth.js — Public API authentication (M10.6).
 *
 * Authenticates external callers via `Authorization: Bearer sk_...` API keys
 * (distinct from the Firebase-JWT verifyToken used by the app). On success it
 * sets req.apiKey (the key record) AND req.uid = ownerId — so every downstream
 * handler reuses the SAME getClientDoc(clientId, req.uid) ownership check with
 * ZERO duplicated ownership logic and no bypass.
 *
 * requireScope(scope) returns a middleware that enforces least-privilege scopes.
 */
const { db } = require("../config/firebase");
const { verifyKey, hasScope } = require("../utils/apiKeys");

async function apiAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    if (!header.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing API key. Use: Authorization: Bearer sk_..." });
    }
    const plaintext = header.slice("Bearer ".length).trim();
    const record = await verifyKey(db, plaintext);
    if (!record) return res.status(401).json({ error: "Invalid, revoked, or expired API key." });

    // Bridge to the existing ownership model: the key's owner IS the user.
    req.apiKey = record;
    req.uid = record.ownerId;
    req.email = null;
    return next();
  } catch (err) {
    console.error("[apiAuth] error:", err.message);
    return res.status(401).json({ error: "API authentication failed." });
  }
}

// Scope guard — use after apiAuth. e.g. requireScope("pipeline:run").
function requireScope(scope) {
  return (req, res, next) => {
    if (!req.apiKey) return res.status(401).json({ error: "Not authenticated." });
    if (!hasScope(req.apiKey, scope)) {
      return res.status(403).json({ error: `API key lacks required scope: ${scope}` });
    }
    next();
  };
}

module.exports = { apiAuth, requireScope };
