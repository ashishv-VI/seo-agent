/**
 * rbac.js — Role-based access control middleware (M10.7).
 *
 * LAYERS ON TOP of verifyToken — never replaces authentication. Use after
 * verifyToken (which sets req.uid). Each middleware resolves the caller's
 * organization membership, attaches it to req.org, and enforces a role /
 * permission / org requirement. Backward-compatible: a user with no org is a
 * solo org of one with role "owner", so single-user flows are never blocked.
 */
const { db } = require("../config/firebase");
const org = require("../utils/organization");

// Attach req.org = { orgId, role, solo } (idempotent). Always resolves.
async function attachOrg(req) {
  if (!req.org) req.org = await org.resolveMembership(db, req.uid);
  return req.org;
}

// Require the caller to hold at least `minRole` in their org.
function requireRole(minRole) {
  return async (req, res, next) => {
    try {
      if (!req.uid) return res.status(401).json({ error: "Not authenticated." });
      const m = await attachOrg(req);
      if (!org.roleAtLeast(m.role, minRole)) return res.status(403).json({ error: `Requires role: ${minRole}` });
      next();
    } catch (e) { return res.status(500).json({ error: e.message }); }
  };
}

// Require a specific permission (mapped to a role in organization.PERMISSIONS).
function requirePermission(permission) {
  return async (req, res, next) => {
    try {
      if (!req.uid) return res.status(401).json({ error: "Not authenticated." });
      const m = await attachOrg(req);
      if (!org.can(m.role, permission)) return res.status(403).json({ error: `Missing permission: ${permission}` });
      next();
    } catch (e) { return res.status(500).json({ error: e.message }); }
  };
}

// Require the caller to belong to a real (non-solo) organization.
function requireOrganization() {
  return async (req, res, next) => {
    try {
      if (!req.uid) return res.status(401).json({ error: "Not authenticated." });
      const m = await attachOrg(req);
      if (m.solo) return res.status(403).json({ error: "This action requires an organization. Create one first." });
      next();
    } catch (e) { return res.status(500).json({ error: e.message }); }
  };
}

module.exports = { attachOrg, requireRole, requirePermission, requireOrganization };
