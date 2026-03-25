const express        = require("express");
const router         = express.Router();
const { admin, db }  = require("../config/firebase");
const { verifyToken} = require("../middleware/auth");

// ── Register ───────────────────────────────────────
router.post("/register", async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: "All fields required" });
    }
    const userRecord = await admin.auth().createUser({
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
    console.error("Register error:", err.message);
    return res.status(400).json({ error: err.message });
  }
});

// ── Get Profile ────────────────────────────────────
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

// ── Update Profile ─────────────────────────────────
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

// ── Delete Account ─────────────────────────────────
router.delete("/me", verifyToken, async (req, res) => {
  try {
    await admin.auth().deleteUser(req.uid);
    await db.collection("users").doc(req.uid).delete();
    return res.json({ message: "Account deleted" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;