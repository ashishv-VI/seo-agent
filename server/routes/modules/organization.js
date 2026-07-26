/**
 * Organization routes (M10.7) — enterprise teams + RBAC.
 *
 * All routes use the existing verifyToken (auth) then layer RBAC via the rbac
 * middleware. Mounted by agents.js at the same base so paths are
 * /api/agents/organization*. Delegates to the pure organization engine.
 * Reuses existing users (members are uids); no auth replacement.
 *
 *   GET    /organization                  — the caller's org (or solo view)
 *   POST   /organization                  — create an org (become owner)
 *   PATCH  /organization                  — edit org (owner)
 *   POST   /organization/invite           — invite a member (admin+)
 *   POST   /organization/accept           — accept an invite (any authed user)
 *   GET    /organization/members          — list members
 *   PATCH  /organization/member/:id       — change a member's role (admin+)
 *   DELETE /organization/member/:id       — remove a member (admin+)
 *   GET    /organization/audit            — audit log (admin+)
 */
const express = require("express");
const router  = express.Router();
const { db }  = require("../../config/firebase");
const { verifyToken } = require("../../middleware/auth");
const { requireRole, requireOrganization, attachOrg } = require("../../middleware/rbac");
const org = require("../../utils/organization");

// GET current org (always resolves — solo view for users without one).
router.get("/organization", verifyToken, async (req, res) => {
  try {
    const m = await attachOrg(req);
    const full = m.org || null;
    return res.json({
      orgId: m.orgId, role: m.role, solo: m.solo,
      organization: full ? { orgId: full.orgId, name: full.name, ownerId: full.ownerId, memberCount: (full.memberUids || []).length, createdAt: full.createdAt } : null,
    });
  } catch (e) { return res.status(e.code || 500).json({ error: e.message }); }
});

// POST create org.
router.post("/organization", verifyToken, async (req, res) => {
  try {
    const r = await org.createOrg(db, req.uid, req.body?.name);
    return r.ok ? res.json({ organization: r.org }) : res.status(400).json(r);
  } catch (e) { return res.status(e.code || 500).json({ error: e.message }); }
});

// PATCH edit org (owner).
router.patch("/organization", verifyToken, requireRole("owner"), async (req, res) => {
  try {
    const m = await attachOrg(req);
    if (m.solo) return res.status(400).json({ error: "No organization to edit." });
    const r = await org.updateOrg(db, m.orgId, req.uid, req.body || {});
    return r.ok ? res.json({ updated: true }) : res.status(400).json(r);
  } catch (e) { return res.status(e.code || 500).json({ error: e.message }); }
});

// POST invite (admin+).
router.post("/organization/invite", verifyToken, requireOrganization(), requireRole("admin"), async (req, res) => {
  try {
    const m = await attachOrg(req);
    const { email, role } = req.body || {};
    if (!email) return res.status(400).json({ error: "email is required." });
    const r = await org.invite(db, m.orgId, req.uid, email, role);
    return r.ok ? res.json({ token: r.token, role: r.role, warning: "Share this invite token with the invitee." }) : res.status(400).json(r);
  } catch (e) { return res.status(e.code || 500).json({ error: e.message }); }
});

// POST accept invite (any authenticated user).
router.post("/organization/accept", verifyToken, async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: "token is required." });
    const r = await org.acceptInvite(db, token, req.uid);
    return r.ok ? res.json({ orgId: r.orgId, role: r.role, joined: true }) : res.status(400).json(r);
  } catch (e) { return res.status(e.code || 500).json({ error: e.message }); }
});

// GET members.
router.get("/organization/members", verifyToken, requireOrganization(), async (req, res) => {
  try {
    const m = await attachOrg(req);
    return res.json({ members: await org.listMembers(db, m.orgId) });
  } catch (e) { return res.status(e.code || 500).json({ error: e.message }); }
});

// PATCH member role (admin+).
router.patch("/organization/member/:id", verifyToken, requireOrganization(), requireRole("admin"), async (req, res) => {
  try {
    const m = await attachOrg(req);
    const r = await org.updateMember(db, m.orgId, req.uid, req.params.id, req.body?.role);
    return r.ok ? res.json({ updated: true }) : res.status(400).json(r);
  } catch (e) { return res.status(e.code || 500).json({ error: e.message }); }
});

// DELETE member (admin+).
router.delete("/organization/member/:id", verifyToken, requireOrganization(), requireRole("admin"), async (req, res) => {
  try {
    const m = await attachOrg(req);
    const r = await org.removeMember(db, m.orgId, req.uid, req.params.id);
    return r.ok ? res.json({ removed: true }) : res.status(400).json(r);
  } catch (e) { return res.status(e.code || 500).json({ error: e.message }); }
});

// GET audit log (admin+).
router.get("/organization/audit", verifyToken, requireOrganization(), requireRole("admin"), async (req, res) => {
  try {
    const m = await attachOrg(req);
    return res.json({ audit: await org.listAudit(db, m.orgId, 50) });
  } catch (e) { return res.status(e.code || 500).json({ error: e.message }); }
});

module.exports = router;
