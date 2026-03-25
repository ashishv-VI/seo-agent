const express              = require("express");
const router               = express.Router();
const { auth, db, FieldValue } = require("../config/firebase");
const { verifyToken }      = require("../middleware/auth");

router.post("/register", async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !name) return res.status(400).json({ error: "Email and name required" });

    let uid;
    // Try to create new Firebase Auth user (email/password registration)
    if (password && !password.startsWith("google-oauth-")) {
      const userRecord = await auth.createUser({ email, password, displayName: name });
      uid = userRecord.uid;
    } else {
      // Google OAuth — get uid from token
      const header = req.headers.authorization;
      if (header?.startsWith("Bearer ")) {
        const decoded = await auth.verifyIdToken(header.split("Bearer ")[1]);
        uid = decoded.uid;
      } else {
        return res.status(400).json({ error: "No token for Google user" });
      }
    }

    // Upsert user document (set with merge — safe for new and existing users)
    await db.collection("users").doc(uid).set({
      uid, email, name,
      plan: "free", createdAt: FieldValue.serverTimestamp(), apiKeys: {}, clients: [],
    }, { merge: true });

    return res.status(201).json({ message: "User ready", uid });
  } catch (err) {
    console.error("Register error:", err.message);
    return res.status(400).json({ error: err.message });
  }
});

router.get("/me", verifyToken, async (req, res) => {
  try {
    const doc = await db.collection("users").doc(req.uid).get();
    if (!doc.exists) return res.status(404).json({ error: "User not found" });
    return res.json({ user: doc.data() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.put("/me", verifyToken, async (req, res) => {
  try {
    const { name, company } = req.body;
    await db.collection("users").doc(req.uid).update({
      ...(name    && { name }),
      ...(company && { company }),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return res.json({ message: "Profile updated" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

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
