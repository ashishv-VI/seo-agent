/**
 * Shared client-ownership helper — extracted from routes/agents.js (Sprint 1, M6.1.5).
 *
 * getClientDoc(clientId, uid) loads clients/{clientId} and enforces that the
 * caller owns it: throws { code: 404 } if the client is missing, { code: 403 }
 * if it belongs to another user. Returns the Firestore document snapshot.
 *
 * Moved verbatim from agents.js — Firestore access, error codes/messages, and
 * return value are unchanged. Route handlers import this instead of defining a
 * local copy, so the ownership check has a single source of truth.
 */
const { db } = require("../../config/firebase");

// ── Helper: check client ownership ────────────────
async function getClientDoc(clientId, uid) {
  const doc = await db.collection("clients").doc(clientId).get();
  if (!doc.exists)                   throw { code: 404, message: "Client not found" };
  if (doc.data().ownerId !== uid)    throw { code: 403, message: "Access denied" };
  return doc;
}

module.exports = { getClientDoc };
