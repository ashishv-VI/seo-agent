/**
 * POST /api/ai/chat
 * Proxies AI tool calls from the frontend so provider keys never leave the server.
 * Uses the user's saved keys from Firestore (getUserKeys), falling back to
 * server-level env vars (already wired in getUserKeys).
 */
const express       = require("express");
const router        = express.Router();
const { verifyToken }  = require("../middleware/auth");
const { getUserKeys }  = require("../utils/getUserKeys");

// Model → provider + model-id mapping
const MODEL_MAP = {
  groq:     { provider: "groq",       modelId: "llama-3.1-8b-instant" },
  gemini:   { provider: "gemini",     modelId: "gemini-2.0-flash" },
  deepseek: { provider: "openrouter", modelId: "deepseek/deepseek-r1:free" },
  mistral:  { provider: "openrouter", modelId: "mistralai/mistral-7b-instruct:free" },
};

router.post("/chat", verifyToken, async (req, res) => {
  try {
    const { model = "groq", prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "prompt required" });

    const mapping = MODEL_MAP[model];
    if (!mapping) return res.status(400).json({ error: `Unknown model: ${model}` });

    const keys = await getUserKeys(req.uid);
    const { provider, modelId } = mapping;

    let text = null;

    if (provider === "groq") {
      const key = keys.groq;
      if (!key) return res.status(400).json({ error: "Groq API key not configured. Add it in Settings." });
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: modelId, max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
        signal: AbortSignal.timeout(30000),
      });
      if (!r.ok) throw new Error(`Groq error ${r.status}`);
      const d = await r.json();
      text = d.choices?.[0]?.message?.content || null;

    } else if (provider === "gemini") {
      const key = keys.gemini;
      if (!key) return res.status(400).json({ error: "Gemini API key not configured. Add it in Settings." });
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          signal: AbortSignal.timeout(30000),
        }
      );
      if (!r.ok) throw new Error(`Gemini error ${r.status}`);
      const d = await r.json();
      text = d.candidates?.[0]?.content?.parts?.[0]?.text || null;

    } else if (provider === "openrouter") {
      const key = keys.openrouter;
      if (!key) return res.status(400).json({ error: "OpenRouter API key not configured. Add it in Settings." });
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
          "HTTP-Referer": process.env.APP_URL || "https://seo-agent.onrender.com",
          "X-Title": "SEO Agent",
        },
        body: JSON.stringify({ model: modelId, max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
        signal: AbortSignal.timeout(45000),
      });
      if (!r.ok) throw new Error(`OpenRouter error ${r.status}`);
      const d = await r.json();
      text = d.choices?.[0]?.message?.content || null;
    }

    if (!text) return res.status(502).json({ error: "AI provider returned empty response" });
    return res.json({ text });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;
