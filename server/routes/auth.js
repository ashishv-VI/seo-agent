const express = require("express");
const router  = express.Router();
const { admin, db, auth } = require("../config/firebase");

// ── Middleware — inline define kiya ───────────────
async function verifyToken(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }
    const token   = header.split("Bearer ")[1];
    const decoded = await auth.verifyIdToken(token);
    req.user      = decoded;
    req.uid       = decoded.uid;
    req.email     = decoded.email;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ── Register new user ──────────────────────────────
router.post("/register", async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: "All fields required" });
    }
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: name,
    });
    await db.collection("users").doc(userRecord.uid).set({
      uid:       userRecord.uid,
      email,
      name,
      plan:      "free",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      apiKeys:   {},
      clients:   [],
    });
    return res.status(201).json({
      message: "User created successfully",
      uid:     userRecord.uid,
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// ── Get current user profile ───────────────────────
router.get("/me", verifyToken, async (req, res) => {
  try {
    const doc = await db.collection("users").doc(req.uid).get();
    if (!doc.exists) {
      return res.status(404).json({ error: "User not found" });
    }
    return res.json({ user: doc.data() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Update user profile ────────────────────────────
router.put("/me", verifyToken, async (req, res) => {
  try {
    const { name, company } = req.body;
    await db.collection("users").doc(req.uid).update({
      ...(name    && { name }),
      ...(company && { company }),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return res.json({ message: "Profile updated" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Delete user account ────────────────────────────
router.delete("/me", verifyToken, async (req, res) => {
  try {
    await auth.deleteUser(req.uid);
    await db.collection("users").doc(req.uid).delete();
    return res.json({ message: "Account deleted" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;