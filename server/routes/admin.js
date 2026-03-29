const express       = require("express");
const router        = express.Router();
const { auth, db }  = require("../config/firebase");
const { verifyAdmin } = require("../middleware/adminAuth");
const { verifyToken } = require("../middleware/auth");

// ── List all users ─────────────────────────────────
router.get("/users", verifyAdmin, async (req, res) => {
  try {
    const listResult = await auth.listUsers(1000);
    const firebaseUsers = listResult.users;

    const uids = firebaseUsers.map(u => u.uid);

    // Fetch Firestore user docs + clients count + login events count in parallel
    const [userDocs, clientSnap, loginSnap] = await Promise.all([
      Promise.all(uids.map(uid => db.collection("users").doc(uid).get().catch(() => null))),
      db.collection("clients").get(),
      db.collection("login_events").limit(2000).get().catch(() => null),
    ]);

    // Count clients per user
    const clientsPerUser = {};
    clientSnap.docs.forEach(doc => {
      const oid = doc.data().ownerId;
      if (oid) clientsPerUser[oid] = (clientsPerUser[oid] || 0) + 1;
    });

    // Count login events per user
    const loginsPerUser = {};
    (loginSnap?.docs || []).forEach(doc => {
      const uid = doc.data().uid;
      if (uid) loginsPerUser[uid] = (loginsPerUser[uid] || 0) + 1;
    });

    // Count pipelines run per user (clients with pipelineStatus=complete)
    const pipelinesPerUser = {};
    clientSnap.docs.forEach(doc => {
      const d = doc.data();
      if (d.ownerId && d.pipelineStatus === "complete") {
        pipelinesPerUser[d.ownerId] = (pipelinesPerUser[d.ownerId] || 0) + 1;
      }
    });

    const now = Date.now();
    const users = firebaseUsers.map((u, i) => {
      const fsDoc = userDocs[i]?.data() || {};
      const createdMs = u.metadata?.creationTime ? new Date(u.metadata.creationTime).getTime() : 0;
      const daysSince = Math.floor((now - createdMs) / 86400000);
      return {
        uid:            u.uid,
        email:          u.email || "",
        name:           u.displayName || fsDoc.name || u.email?.split("@")[0] || "Unknown",
        plan:           fsDoc.plan || "free",
        role:           fsDoc.role || "user",
        notes:          fsDoc.notes || "",
        disabled:       u.disabled || false,
        createdAt:      u.metadata?.creationTime || null,
        lastSignIn:     u.metadata?.lastSignInTime || null,
        provider:       u.providerData?.[0]?.providerId || "email",
        clientCount:    clientsPerUser[u.uid] || 0,
        loginCount:     loginsPerUser[u.uid] || 0,
        pipelineCount:  pipelinesPerUser[u.uid] || 0,
        photoURL:       u.photoURL || null,
        isNew:          daysSince <= 7,
        daysSinceJoin:  daysSince,
        // API keys status from Firestore user doc
        hasGroq:        !!(fsDoc.keys?.groq || fsDoc.groqKey),
        hasSerpApi:     !!(fsDoc.keys?.serpapi || fsDoc.serpApiKey),
        hasSeRanking:   !!(fsDoc.keys?.seranking || fsDoc.seRankingKey),
        hasGoogle:      !!(fsDoc.keys?.google || fsDoc.googleKey),
      };
    });

    users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return res.json({ users, total: users.length });
  } catch (err) {
    console.error("[admin] list users:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── User Detail (full profile) ─────────────────────
// GET /api/admin/users/:uid/detail
router.get("/users/:uid/detail", verifyAdmin, async (req, res) => {
  try {
    const uid = req.params.uid;
    const [userRecord, fsDoc, clientSnap, loginSnap, keyDoc] = await Promise.all([
      auth.getUser(uid),
      db.collection("users").doc(uid).get().catch(() => null),
      db.collection("clients").where("ownerId", "==", uid).get().catch(() => ({ docs: [] })),
      db.collection("login_events").where("uid", "==", uid).limit(20).get().catch(() => null),
      db.collection("user_keys").doc(uid).get().catch(() => null),
    ]);

    const fsData  = fsDoc?.data() || {};
    const keyData = keyDoc?.data() || {};

    // Login activity sorted newest first
    const loginActivity = (loginSnap?.docs || [])
      .map(d => d.data())
      .sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""))
      .slice(0, 10);

    // Client details
    const clients = clientSnap.docs.map(d => ({
      id:             d.id,
      name:           d.data().name,
      website:        d.data().website,
      pipelineStatus: d.data().pipelineStatus || "idle",
      seoScore:       d.data().seoScore || null,
      lastRun:        d.data().pipelineCompletedAt || null,
    }));

    // Onboarding checklist
    const hasAnyKey   = !!(keyData.groqKey || keyData.serpApiKey || keyData.seRankingKey || keyData.googleKey || fsData.groqKey || fsData.serpApiKey);
    const hasClients  = clients.length > 0;
    const hasRun      = clients.some(c => c.pipelineStatus === "complete");
    const onboarding  = {
      createdAccount: true,
      addedApiKey:    hasAnyKey,
      addedClient:    hasClients,
      ranPipeline:    hasRun,
      viewedReport:   hasRun, // proxy — if pipeline ran, they likely viewed it
    };
    const onboardingPct = Math.round((Object.values(onboarding).filter(Boolean).length / Object.keys(onboarding).length) * 100);

    // API keys connected
    const apiKeys = {
      groq:      !!(keyData.groqKey || fsData.groqKey),
      serpapi:   !!(keyData.serpApiKey || fsData.serpApiKey),
      seranking: !!(keyData.seRankingKey || fsData.seRankingKey),
      google:    !!(keyData.googleKey || fsData.googleKey || keyData.googleApiKey),
    };

    return res.json({
      uid,
      email:        userRecord.email,
      name:         userRecord.displayName || fsData.name || "",
      plan:         fsData.plan || "free",
      role:         fsData.role || "user",
      notes:        fsData.notes || "",
      disabled:     userRecord.disabled,
      createdAt:    userRecord.metadata?.creationTime,
      lastSignIn:   userRecord.metadata?.lastSignInTime,
      provider:     userRecord.providerData?.[0]?.providerId || "email",
      clients,
      loginActivity,
      onboarding,
      onboardingPct,
      apiKeys,
      clientCount:    clients.length,
      loginCount:     loginActivity.length,
      pipelineCount:  clients.filter(c => c.pipelineStatus === "complete").length,
    });
  } catch (err) {
    console.error("[admin] user detail:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── Update user plan / role / notes ───────────────
// PUT /api/admin/users/:uid
router.put("/users/:uid", verifyAdmin, async (req, res) => {
  try {
    const uid = req.params.uid;
    const { plan, role, notes } = req.body;
    const allowed = ["free", "pro", "agency"];
    if (plan && !allowed.includes(plan)) {
      return res.status(400).json({ error: "Invalid plan. Use: free | pro | agency" });
    }
    const update = {};
    if (plan  !== undefined) update.plan  = plan;
    if (role  !== undefined) update.role  = role;
    if (notes !== undefined) update.notes = notes;
    update.updatedAt  = new Date().toISOString();
    update.updatedBy  = req.uid;

    await db.collection("users").doc(uid).set(update, { merge: true });
    console.log(`[admin] User ${uid} updated plan=${plan} role=${role} by admin`);
    return res.json({ message: "User updated", uid, ...update });
  } catch (err) {
    console.error("[admin] update user:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── Send password reset ────────────────────────────
router.post("/users/:uid/reset-password", verifyAdmin, async (req, res) => {
  try {
    const userRecord = await auth.getUser(req.params.uid);
    if (!userRecord.email) {
      return res.status(400).json({ error: "User has no email address" });
    }
    if (userRecord.providerData?.[0]?.providerId === "google.com") {
      return res.status(400).json({ error: "This user logs in with Google — password reset not applicable" });
    }
    const resetLink = await auth.generatePasswordResetLink(userRecord.email);
    console.log(`[admin] Password reset link generated for ${userRecord.email} by admin`);
    return res.json({ message: `Password reset link generated for ${userRecord.email}`, resetLink, email: userRecord.email });
  } catch (err) {
    console.error("[admin] reset-password:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── Block user ─────────────────────────────────────
router.post("/users/:uid/block", verifyAdmin, async (req, res) => {
  try {
    if (req.params.uid === req.uid) return res.status(400).json({ error: "You cannot block yourself" });
    await auth.updateUser(req.params.uid, { disabled: true });
    await db.collection("users").doc(req.params.uid).set(
      { blocked: true, blockedAt: new Date().toISOString(), blockedBy: req.uid }, { merge: true }
    );
    console.log(`[admin] User ${req.params.uid} BLOCKED by admin`);
    return res.json({ message: "User blocked" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Unblock user ───────────────────────────────────
router.post("/users/:uid/unblock", verifyAdmin, async (req, res) => {
  try {
    await auth.updateUser(req.params.uid, { disabled: false });
    await db.collection("users").doc(req.params.uid).set(
      { blocked: false, unblockedAt: new Date().toISOString() }, { merge: true }
    );
    console.log(`[admin] User ${req.params.uid} UNBLOCKED by admin`);
    return res.json({ message: "User unblocked" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Delete user ────────────────────────────────────
router.delete("/users/:uid", verifyAdmin, async (req, res) => {
  try {
    if (req.params.uid === req.uid) return res.status(400).json({ error: "You cannot delete your own account" });
    await auth.deleteUser(req.params.uid);
    await db.collection("users").doc(req.params.uid).delete();
    console.log(`[admin] User ${req.params.uid} DELETED by admin`);
    return res.json({ message: "User deleted permanently" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Bulk actions ───────────────────────────────────
// POST /api/admin/users/bulk  body: { uids:[], action:"block"|"unblock"|"delete"|"plan", plan? }
router.post("/users/bulk", verifyAdmin, async (req, res) => {
  try {
    const { uids, action, plan } = req.body;
    if (!Array.isArray(uids) || uids.length === 0) return res.status(400).json({ error: "No UIDs provided" });

    const results = { success: 0, failed: 0 };
    for (const uid of uids) {
      if (uid === req.uid) { results.failed++; continue; } // never self-act
      try {
        if (action === "block") {
          await auth.updateUser(uid, { disabled: true });
          await db.collection("users").doc(uid).set({ blocked: true, blockedAt: new Date().toISOString() }, { merge: true });
        } else if (action === "unblock") {
          await auth.updateUser(uid, { disabled: false });
          await db.collection("users").doc(uid).set({ blocked: false }, { merge: true });
        } else if (action === "delete") {
          await auth.deleteUser(uid);
          await db.collection("users").doc(uid).delete();
        } else if (action === "plan" && plan) {
          await db.collection("users").doc(uid).set({ plan, updatedBy: req.uid, updatedAt: new Date().toISOString() }, { merge: true });
        } else {
          results.failed++;
          continue;
        }
        results.success++;
      } catch { results.failed++; }
    }
    console.log(`[admin] Bulk ${action}: ${results.success} succeeded, ${results.failed} failed`);
    return res.json({ message: `Bulk ${action} complete`, ...results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Export users as CSV ────────────────────────────
// GET /api/admin/users/export
router.get("/users/export", verifyAdmin, async (req, res) => {
  try {
    const listResult = await auth.listUsers(1000);
    const users = listResult.users;
    const uids  = users.map(u => u.uid);
    const userDocs = await Promise.all(uids.map(uid => db.collection("users").doc(uid).get().catch(() => null)));
    const clientSnap = await db.collection("clients").get();
    const clientsPerUser = {};
    clientSnap.docs.forEach(d => {
      if (d.data().ownerId) clientsPerUser[d.data().ownerId] = (clientsPerUser[d.data().ownerId] || 0) + 1;
    });

    const header = ["Name","Email","Plan","Role","Provider","Status","Clients","Joined","LastLogin"];
    const rows = users.map((u, i) => {
      const fs = userDocs[i]?.data() || {};
      return [
        `"${(u.displayName || fs.name || "").replace(/"/g,'')}"`,
        `"${u.email || ""}"`,
        fs.plan || "free",
        fs.role || "user",
        u.providerData?.[0]?.providerId || "email",
        u.disabled ? "blocked" : "active",
        clientsPerUser[u.uid] || 0,
        u.metadata?.creationTime ? new Date(u.metadata.creationTime).toISOString().split("T")[0] : "",
        u.metadata?.lastSignInTime ? new Date(u.metadata.lastSignInTime).toISOString().split("T")[0] : "",
      ].join(",");
    });

    const csv = [header.join(","), ...rows].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="users-${new Date().toISOString().split("T")[0]}.csv"`);
    return res.send(csv);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Record login event (called from frontend on each login) ──
// POST /api/admin/login-event  — uses verifyToken (not admin) so any user can call it
router.post("/login-event", verifyToken, async (req, res) => {
  try {
    const { provider, method } = req.body; // "google" | "email", "login" | "register"
    await db.collection("login_events").add({
      uid:       req.uid,
      email:     req.email || "",
      provider:  provider || "email",
      method:    method   || "login",
      timestamp: new Date().toISOString(),
      userAgent: req.headers["user-agent"]?.slice(0, 120) || "",
    });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Enhanced Stats ─────────────────────────────────
router.get("/stats", verifyAdmin, async (req, res) => {
  try {
    const now    = new Date();
    const d7     = new Date(now - 7 * 86400000).toISOString();
    const d30    = new Date(now - 30 * 86400000).toISOString();
    const today  = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    const [listResult, clientSnap, loginSnap] = await Promise.all([
      auth.listUsers(1000),
      db.collection("clients").get(),
      db.collection("login_events").limit(2000).get().catch(() => null),
    ]);

    const users   = listResult.users;
    const blocked = users.filter(u => u.disabled).length;
    const google  = users.filter(u => u.providerData?.[0]?.providerId === "google.com").length;

    // New signups timeline
    const newToday = users.filter(u => u.metadata?.creationTime && u.metadata.creationTime >= today).length;
    const newWeek  = users.filter(u => u.metadata?.creationTime && u.metadata.creationTime >= d7).length;
    const newMonth = users.filter(u => u.metadata?.creationTime && u.metadata.creationTime >= d30).length;

    // Pipeline stats
    const pipelinesRun = clientSnap.docs.filter(d => d.data().pipelineStatus === "complete").length;

    // Login stats
    const allLogins  = (loginSnap?.docs || []).map(d => d.data());
    const loginsToday = allLogins.filter(l => l.timestamp >= today).length;
    const loginsWeek  = allLogins.filter(l => l.timestamp >= d7).length;

    return res.json({
      totalUsers:    users.length,
      activeUsers:   users.length - blocked,
      blockedUsers:  blocked,
      googleUsers:   google,
      emailUsers:    users.length - google,
      totalClients:  clientSnap.size,
      pipelinesRun,
      newToday,
      newWeek,
      newMonth,
      loginsToday,
      loginsWeek,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
