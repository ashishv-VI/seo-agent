/**
 * apiKeys.js — API key lifecycle engine (M10.6).
 *
 * PURE-ish helper (crypto + db passed in by caller for the DB ops). NEVER stores
 * a plaintext key: only the SHA-256 hash + a short display prefix are persisted.
 * The full secret is returned exactly once, at creation.
 *
 * Storage: api_keys/{keyId} = {
 *   keyId, ownerId, name, hash, prefix, scopes[], createdAt, expiresAt,
 *   lastUsedAt, usageCount, revoked
 * }
 *
 * Scopes gate what a key can do (least privilege). "*" is a superset.
 */
const crypto = require("crypto");

const VALID_SCOPES = [
  "clients:read", "clients:write",
  "pipeline:run",
  "dashboard:read", "analytics:read", "tasks:read",
  "visibility:read", "optimization:read", "rankings:read", "reports:read",
  "copilot:chat",
  "*",
];

function hashKey(plain) { return crypto.createHash("sha256").update(String(plain)).digest("hex"); }

// Generate a new key: returns { plaintext, record } — persist record, show plaintext once.
function generateKey({ ownerId, name = "API key", scopes = ["dashboard:read"], expiresInDays = null }) {
  const raw = crypto.randomBytes(24).toString("base64url");     // ~32 chars, url-safe
  const plaintext = `sk_${raw}`;
  const keyId = crypto.randomBytes(8).toString("hex");
  const prefix = plaintext.slice(0, 10);                        // e.g. "sk_Abc123" for display
  const cleanScopes = sanitizeScopes(scopes);
  const now = new Date().toISOString();
  const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 86400000).toISOString() : null;
  const record = {
    keyId, ownerId, name: String(name).slice(0, 60),
    hash: hashKey(plaintext), prefix,
    scopes: cleanScopes, createdAt: now, expiresAt,
    lastUsedAt: null, usageCount: 0, revoked: false,
  };
  return { plaintext, record };
}

function sanitizeScopes(scopes) {
  if (!Array.isArray(scopes)) return ["dashboard:read"];
  const clean = scopes.filter(s => VALID_SCOPES.includes(s));
  return clean.length ? [...new Set(clean)] : ["dashboard:read"];
}

// Does a key record grant a required scope?
function hasScope(record, required) {
  if (!record || record.revoked) return false;
  if (record.scopes.includes("*")) return true;
  return record.scopes.includes(required);
}

function isExpired(record) {
  return !!(record?.expiresAt && Date.parse(record.expiresAt) < Date.now());
}

// ── DB ops (db passed in so the module stays firebase-free + testable) ──

async function createKey(db, params) {
  const { plaintext, record } = generateKey(params);
  await db.collection("api_keys").doc(record.keyId).set(record);
  return { plaintext, key: publicView(record) };
}

async function revokeKey(db, keyId, ownerId) {
  const ref = db.collection("api_keys").doc(keyId);
  const doc = await ref.get();
  if (!doc.exists || doc.data().ownerId !== ownerId) return { ok: false, error: "Key not found" };
  await ref.set({ revoked: true, revokedAt: new Date().toISOString() }, { merge: true });
  return { ok: true };
}

// Rotate = revoke old + issue new with the same name/scopes.
async function rotateKey(db, keyId, ownerId) {
  const ref = db.collection("api_keys").doc(keyId);
  const doc = await ref.get();
  if (!doc.exists || doc.data().ownerId !== ownerId) return { ok: false, error: "Key not found" };
  const old = doc.data();
  await ref.set({ revoked: true, revokedAt: new Date().toISOString() }, { merge: true });
  const created = await createKey(db, { ownerId, name: old.name, scopes: old.scopes });
  return { ok: true, ...created };
}

async function listKeys(db, ownerId) {
  const snap = await db.collection("api_keys").where("ownerId", "==", ownerId).limit(100).get().catch(() => null);
  return (snap?.docs || []).map(d => publicView(d.data()))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

// Look up a key by its plaintext (hashes, matches, validates). Records usage.
async function verifyKey(db, plaintext) {
  if (!plaintext || !String(plaintext).startsWith("sk_")) return null;
  const hash = hashKey(plaintext);
  const snap = await db.collection("api_keys").where("hash", "==", hash).limit(1).get().catch(() => null);
  if (!snap || snap.empty) return null;
  const doc = snap.docs[0];
  const rec = doc.data();
  if (rec.revoked || isExpired(rec)) return null;
  // Best-effort usage tracking (non-blocking).
  doc.ref.set({ lastUsedAt: new Date().toISOString(), usageCount: (rec.usageCount || 0) + 1 }, { merge: true }).catch(() => {});
  return rec;
}

// Never expose hash; expose prefix + metadata only.
function publicView(rec) {
  return {
    keyId: rec.keyId, name: rec.name, prefix: rec.prefix, scopes: rec.scopes,
    createdAt: rec.createdAt, expiresAt: rec.expiresAt, lastUsedAt: rec.lastUsedAt,
    usageCount: rec.usageCount || 0, revoked: !!rec.revoked,
  };
}

module.exports = {
  VALID_SCOPES, hashKey, generateKey, sanitizeScopes, hasScope, isExpired,
  createKey, revokeKey, rotateKey, listKeys, verifyKey, publicView,
};
