const express        = require("express");
const router         = express.Router();
const { admin, db }  = require("../config/firebase");
const { verifyToken} = require("../middleware/auth");

// ── Save API Keys ──────────────────────────────────
router.post("/save", verifyToken, async (req, res) => {
  try {
    const { groq, gemini, google, openrouter, serpapi, perplexity } = req.body;
    await db.collection("users").doc(req.uid).update({
      apiKeys: {
        ...(groq        && { groq }),
        ...(gemini      && { gemini }),
        ...(google      && { google }),
        ...(openrouter  && { openrouter }),
        ...(serpapi     && { serpapi }),
        ...(perplexity  && { perplexity }),
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return res.json({ message: "API keys saved securely" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Get API Keys ───────────────────────────────────
router.get("/get", verifyToken, async (req, res) => {
  try {
    const doc = await db.collection("users").doc(req.uid).get();
    if (!doc.exists) {
      return res.status(404).json({ error: "User not found" });
    }
    const { apiKeys = {} } = doc.data();
    return res.json({ keys: apiKeys });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Delete Key ─────────────────────────────────────
router.delete("/:keyName", verifyToken, async (req, res) => {
  try {
    const { keyName } = req.params;
    await db.collection("users").doc(req.uid).update({
      [`apiKeys.${keyName}`]: admin.firestore.FieldValue.delete(),
    });
    return res.json({ message: `${keyName} key deleted` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;