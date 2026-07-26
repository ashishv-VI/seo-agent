/**
 * organization.js — Enterprise organizations, roles & permissions (M10.7).
 *
 * Layers a team model ON TOP of the existing flat ownerId ownership — it does
 * not replace it. Backward-compatible by design: a user with no organization is
 * treated as a solo org of one (themselves), so every existing single-owner user
 * keeps working with ZERO migration.
 *
 * Storage:
 *   organizations/{orgId} = { orgId, name, ownerId, members: { uid: {role, addedAt} },
 *                             createdAt, updatedAt }
 *   org_invites/{token}   = { token, orgId, email, role, invitedBy, createdAt, accepted }
 *   org_audit/{id}        = { orgId, actorUid, action, target, at }
 *
 * db is passed into the DB ops so this module stays firebase-free + testable.
 */
const crypto = require("crypto");

// ── Roles (ordered, higher index = more privilege) ──
const ROLES = ["viewer", "editor", "admin", "owner"];
const ROLE_RANK = { viewer: 0, editor: 1, admin: 2, owner: 3 };

// ── Permissions per role (least privilege). Higher roles inherit lower. ──
const PERMISSIONS = {
  "clients:read":   "viewer",
  "reports:read":   "viewer",
  "dashboard:read": "viewer",
  "copilot:use":    "editor",
  "pipeline:run":   "editor",
  "tasks:write":    "editor",
  "approvals:act":  "editor",
  "clients:write":  "editor",
  "branding:edit":  "admin",
  "apikeys:manage": "admin",
  "webhooks:manage":"admin",
  "members:manage": "admin",
  "org:edit":       "owner",
  "org:delete":     "owner",
};

function roleAtLeast(role, min) { return (ROLE_RANK[role] ?? -1) >= (ROLE_RANK[min] ?? 99); }
function can(role, permission) {
  const need = PERMISSIONS[permission];
  if (!need) return false;
  return roleAtLeast(role, need);
}

// ── Resolve the caller's org + role. Returns solo-org fallback if none. ──
// This is the function getClientDoc consults to allow same-org access.
async function resolveMembership(db, uid) {
  try {
    // Org the user owns takes precedence.
    const owned = await db.collection("organizations").where("ownerId", "==", uid).limit(1).get().catch(() => null);
    if (owned && !owned.empty) {
      const org = owned.docs[0].data();
      return { orgId: org.orgId, role: "owner", org, solo: false };
    }
    // Otherwise, an org that lists the user as a member.
    const memberOf = await db.collection("organizations").where(`memberUids`, "array-contains", uid).limit(1).get().catch(() => null);
    if (memberOf && !memberOf.empty) {
      const org = memberOf.docs[0].data();
      const role = org.members?.[uid]?.role || "viewer";
      return { orgId: org.orgId, role, org, solo: false };
    }
  } catch { /* fall through to solo */ }
  // Backward-compatible solo org: the user is their own org, role owner.
  return { orgId: `solo:${uid}`, role: "owner", org: null, solo: true };
}

// Given a client's ownerId and a caller uid, are they in the same org?
// Used by getClientDoc to widen access from "ownerId === uid" to "same org".
async function sameOrg(db, ownerUid, callerUid) {
  if (ownerUid === callerUid) return true;
  const [a, b] = await Promise.all([resolveMembership(db, ownerUid), resolveMembership(db, callerUid)]);
  if (a.solo || b.solo) return false;      // solo orgs never share
  return a.orgId === b.orgId;
}

// ── Org lifecycle ──
async function createOrg(db, uid, name) {
  // One owned org per user.
  const existing = await db.collection("organizations").where("ownerId", "==", uid).limit(1).get().catch(() => null);
  if (existing && !existing.empty) return { ok: false, error: "You already own an organization." };
  const orgId = crypto.randomBytes(8).toString("hex");
  const now = new Date().toISOString();
  const rec = {
    orgId, name: String(name || "My Agency").slice(0, 80), ownerId: uid,
    members: { [uid]: { role: "owner", addedAt: now } },
    memberUids: [uid], createdAt: now, updatedAt: now,
  };
  await db.collection("organizations").doc(orgId).set(rec);
  await audit(db, orgId, uid, "org.created", orgId);
  return { ok: true, org: rec };
}

async function getOrg(db, orgId) {
  const doc = await db.collection("organizations").doc(orgId).get().catch(() => null);
  return doc?.exists ? doc.data() : null;
}

async function updateOrg(db, orgId, uid, patch) {
  const org = await getOrg(db, orgId);
  if (!org) return { ok: false, error: "Organization not found" };
  if (!can(org.members?.[uid]?.role, "org:edit")) return { ok: false, error: "Insufficient permissions" };
  const update = {};
  if (patch.name !== undefined) update.name = String(patch.name).slice(0, 80);
  update.updatedAt = new Date().toISOString();
  await db.collection("organizations").doc(orgId).set(update, { merge: true });
  await audit(db, orgId, uid, "org.updated", orgId);
  return { ok: true };
}

// ── Invitations ──
async function invite(db, orgId, actorUid, email, role) {
  const org = await getOrg(db, orgId);
  if (!org) return { ok: false, error: "Organization not found" };
  if (!can(org.members?.[actorUid]?.role, "members:manage")) return { ok: false, error: "Insufficient permissions" };
  const cleanRole = ROLES.includes(role) && role !== "owner" ? role : "viewer";
  const token = crypto.randomBytes(16).toString("base64url");
  await db.collection("org_invites").doc(token).set({
    token, orgId, email: String(email || "").toLowerCase().slice(0, 120),
    role: cleanRole, invitedBy: actorUid, createdAt: new Date().toISOString(), accepted: false,
  });
  await audit(db, orgId, actorUid, "member.invited", email);
  return { ok: true, token, role: cleanRole };
}

async function acceptInvite(db, token, uid) {
  const ref = db.collection("org_invites").doc(token);
  const doc = await ref.get().catch(() => null);
  if (!doc?.exists) return { ok: false, error: "Invite not found or expired" };
  const inv = doc.data();
  if (inv.accepted) return { ok: false, error: "Invite already used" };
  const orgRef = db.collection("organizations").doc(inv.orgId);
  const org = (await orgRef.get()).data();
  if (!org) return { ok: false, error: "Organization no longer exists" };
  const now = new Date().toISOString();
  await orgRef.set({
    [`members.${uid}`]: { role: inv.role, addedAt: now },
    memberUids: Array.from(new Set([...(org.memberUids || []), uid])),
    updatedAt: now,
  }, { merge: true });
  await ref.set({ accepted: true, acceptedBy: uid, acceptedAt: now }, { merge: true });
  await audit(db, inv.orgId, uid, "member.joined", uid);
  return { ok: true, orgId: inv.orgId, role: inv.role };
}

// ── Members ──
async function listMembers(db, orgId) {
  const org = await getOrg(db, orgId);
  if (!org) return [];
  return Object.entries(org.members || {}).map(([uid, m]) => ({ uid, role: m.role, addedAt: m.addedAt }));
}

async function updateMember(db, orgId, actorUid, targetUid, role) {
  const org = await getOrg(db, orgId);
  if (!org) return { ok: false, error: "Organization not found" };
  if (!can(org.members?.[actorUid]?.role, "members:manage")) return { ok: false, error: "Insufficient permissions" };
  if (targetUid === org.ownerId) return { ok: false, error: "Cannot change the owner's role" };
  if (!ROLES.includes(role) || role === "owner") return { ok: false, error: "Invalid role" };
  await db.collection("organizations").doc(orgId).set({ [`members.${targetUid}`]: { role, addedAt: org.members?.[targetUid]?.addedAt || new Date().toISOString() }, updatedAt: new Date().toISOString() }, { merge: true });
  await audit(db, orgId, actorUid, "member.role_changed", `${targetUid}=${role}`);
  return { ok: true };
}

async function removeMember(db, orgId, actorUid, targetUid) {
  const org = await getOrg(db, orgId);
  if (!org) return { ok: false, error: "Organization not found" };
  if (!can(org.members?.[actorUid]?.role, "members:manage")) return { ok: false, error: "Insufficient permissions" };
  if (targetUid === org.ownerId) return { ok: false, error: "Cannot remove the owner" };
  const { FieldValue } = require("../config/firebase");
  await db.collection("organizations").doc(orgId).set({
    [`members.${targetUid}`]: FieldValue.delete(),
    memberUids: (org.memberUids || []).filter(u => u !== targetUid),
    updatedAt: new Date().toISOString(),
  }, { merge: true });
  await audit(db, orgId, actorUid, "member.removed", targetUid);
  return { ok: true };
}

// ── Audit log ──
async function audit(db, orgId, actorUid, action, target) {
  try {
    const id = crypto.randomBytes(8).toString("hex");
    await db.collection("org_audit").doc(id).set({ id, orgId, actorUid, action, target: String(target || ""), at: new Date().toISOString() });
  } catch { /* best-effort */ }
}
async function listAudit(db, orgId, limit = 50) {
  const snap = await db.collection("org_audit").where("orgId", "==", orgId).limit(limit).get().catch(() => null);
  return (snap?.docs || []).map(d => d.data()).sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

module.exports = {
  ROLES, ROLE_RANK, PERMISSIONS, roleAtLeast, can,
  resolveMembership, sameOrg,
  createOrg, getOrg, updateOrg,
  invite, acceptInvite,
  listMembers, updateMember, removeMember,
  audit, listAudit,
};
