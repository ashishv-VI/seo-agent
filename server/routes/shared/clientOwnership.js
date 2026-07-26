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
// M10.7: ownership widened from strict ownerId===uid to "owner OR same-org
// member". Backward-compatible — a user with no org is a solo org of one, so the
// direct-owner fast path preserves the exact prior behaviour for existing users.
// Same 404/403 contract + returned snapshot. This single choke-point propagates
// org access to every client-scoped surface without touching call sites.
async function getClientDoc(clientId, uid) {
  const doc = await db.collection("clients").doc(clientId).get();
  if (!doc.exists) throw { code: 404, message: "Client not found" };
  const ownerId = doc.data().ownerId;
  if (ownerId === uid) return doc;                     // direct owner — unchanged fast path
  // Org fallback: allow if caller shares an organization with the client's owner.
  try {
    const { sameOrg } = require("../../utils/organization");
    if (await sameOrg(db, ownerId, uid)) return doc;
  } catch { /* org module unavailable → deny (fail closed) */ }
  throw { code: 403, message: "Access denied" };
}

module.exports = { getClientDoc };
