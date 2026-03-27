const express       = require("express");
const router        = express.Router();
const { auth, db }  = require("../config/firebase");
const { verifyAdmin } = require("../middleware/adminAuth");

// ── List all users ─────────────────────────────────
// GET /api/admin/users
router.get("/users", verifyAdmin, async (req, res) => {
  try {
    const listResult = await auth.listUsers(1000);
    const firebaseUsers = listResult.users;

    // Get Firestore user docs in parallel for extra info (plan, clients count)
    const uids = firebaseUsers.map(u => u.uid);
    const userDocs = await Promise.all(
      uids.map(uid => db.collection("users").doc(uid).get().catch(() => null))
    );

    // Count clients per user
    const clientSnap = await db.collection("clients").get();
    const clientsPerUser = {};
    clientSnap.docs.forEach(doc => {
      const oid = doc.data().ownerId;
      if (oid) clientsPerUser[oid] = (clientsPerUser[oid] || 0) + 1;
    });

    const users = firebaseUsers.map((u, i) => {
      const fsDoc   = userDocs[i]?.data() || {};
      return {
        uid:          u.uid,
        email:        u.email || "",
        name:         u.displayName || fsDoc.name || u.email?.split("@")[0] || "Unknown",
        plan:         fsDoc.plan || "free",
        disabled:     u.disabled || false,
        createdAt:    u.metadata?.creationTime || null,
        lastSignIn:   u.metadata?.lastSignInTime || null,
        provider:     u.providerData?.[0]?.providerId || "email",
        clientCount:  clientsPerUser[u.uid] || 0,
        photoURL:     u.photoURL || null,
      };
    });

    // Sort: newest first
    users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return res.json({ users, total: users.length });
  } catch (err) {
    console.error("[admin] list users:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── Send password reset email ──────────────────────
// POST /api/admin/users/:uid/reset-password
router.post("/users/:uid/reset-password", verifyAdmin, async (req, res) => {
  try {
    const userRecord = await auth.getUser(req.params.uid);
    if (!userRecord.email) {
      return res.status(400).json({ error: "User has no email address" });
    }
    if (userRecord.providerData?.[0]?.providerId === "google.com") {
      return res.status(400).json({ error: "This user logs in with Google — password reset not applicable" });
    }

    // Generate password reset link (Firebase sends email via its own system)
    const resetLink = await auth.generatePasswordResetLink(userRecord.email);

    // Log the action
    console.log(`[admin] Password reset link generated for ${userRecord.email} by admin`);

    return res.json({
      message: `Password reset link generated for ${userRecord.email}`,
      resetLink,
      email: userRecord.email,
    });
  } catch (err) {
    console.error("[admin] reset-password:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── Block user ─────────────────────────────────────
// POST /api/admin/users/:uid/block
router.post("/users/:uid/block", verifyAdmin, async (req, res) => {
  try {
    if (req.params.uid === req.uid) {
      return res.status(400).json({ error: "You cannot block yourself" });
    }
    await auth.updateUser(req.params.uid, { disabled: true });
    await db.collection("users").doc(req.params.uid).set(
      { blocked: true, blockedAt: new Date().toISOString(), blockedBy: req.uid },
      { merge: true }
    );
    console.log(`[admin] User ${req.params.uid} BLOCKED by admin`);
    return res.json({ message: "User blocked — they cannot log in until unblocked" });
  } catch (err) {
    console.error("[admin] block:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── Unblock user ───────────────────────────────────
// POST /api/admin/users/:uid/unblock
router.post("/users/:uid/unblock", verifyAdmin, async (req, res) => {
  try {
    await auth.updateUser(req.params.uid, { disabled: false });
    await db.collection("users").doc(req.params.uid).set(
      { blocked: false, unblockedAt: new Date().toISOString() },
      { merge: true }
    );
    console.log(`[admin] User ${req.params.uid} UNBLOCKED by admin`);
    return res.json({ message: "User unblocked — they can now log in again" });
  } catch (err) {
    console.error("[admin] unblock:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── Delete user completely ─────────────────────────
// DELETE /api/admin/users/:uid
router.delete("/users/:uid", verifyAdmin, async (req, res) => {
  try {
    if (req.params.uid === req.uid) {
      return res.status(400).json({ error: "You cannot delete your own account" });
    }
    // Delete from Firebase Auth
    await auth.deleteUser(req.params.uid);
    // Delete from Firestore users collection
    await db.collection("users").doc(req.params.uid).delete();
    console.log(`[admin] User ${req.params.uid} DELETED by admin`);
    return res.json({ message: "User deleted permanently from Auth and Firestore" });
  } catch (err) {
    console.error("[admin] delete:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── Get stats summary ──────────────────────────────
// GET /api/admin/stats
router.get("/stats", verifyAdmin, async (req, res) => {
  try {
    const [listResult, clientSnap, userSnap] = await Promise.all([
      auth.listUsers(1000),
      db.collection("clients").get(),
      db.collection("users").get(),
    ]);
    const users    = listResult.users;
    const blocked  = users.filter(u => u.disabled).length;
    const google   = users.filter(u => u.providerData?.[0]?.providerId === "google.com").length;
    const email    = users.length - google;
    return res.json({
      totalUsers:   users.length,
      activeUsers:  users.length - blocked,
      blockedUsers: blocked,
      googleUsers:  google,
      emailUsers:   email,
      totalClients: clientSnap.size,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
