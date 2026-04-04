/**
 * LLM Utility — Groq → Gemini → OpenRouter (3-provider fallback)
 * Each provider retries once on timeout before falling to the next.
 */

const RETRY_DELAY_MS    = 1500;
const RATE_LIMIT_WAIT_MS = 60000; // 60 seconds — standard Groq/Gemini rate-limit window

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Single provider call with one retry on timeout or rate-limit ─────────────
async function callWithRetry(fn, providerName) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (e) {
      const isTimeout   = e.name === "TimeoutError"   || e.message?.includes("timeout");
      const isRateLimit = e.name === "RateLimitError" || e.message?.includes("429");
      if (attempt === 1 && isRateLimit) {
        console.warn(`[llm] ${providerName} rate-limited (429) — waiting 60s before retry`);
        await sleep(RATE_LIMIT_WAIT_MS);
        continue;
      }
      if (attempt === 1 && isTimeout) {
        console.warn(`[llm] ${providerName} timeout on attempt 1 — retrying in ${RETRY_DELAY_MS}ms`);
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      console.warn(`[llm] ${providerName} failed (attempt ${attempt}):`, e.message);
    }
  }
  return null;
}

async function callLLM(prompt, keys, options = {}) {
  const messages = [
    ...(options.systemPrompt ? [{ role: "system", content: options.systemPrompt }] : []),
    { role: "user", content: prompt },
  ];
  const maxTokens  = options.maxTokens  || 3000;
  const temperature = options.temperature || 0.3;

  // ── 1. Groq ───────────────────────────────────────────────────────────────
  if (keys.groq) {
    const result = await callWithRetry(async () => {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method:  "POST",
        headers: { Authorization: `Bearer ${keys.groq}`, "Content-Type": "application/json" },
        body:    JSON.stringify({
          model:       "llama-3.1-8b-instant",
          messages,
          max_tokens:  maxTokens,
          temperature,
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (res.status === 429) throw Object.assign(new Error("429 rate limit"), { name: "RateLimitError" });
      const data = await res.json();
      return data.choices?.[0]?.message?.content || null;
    }, "Groq");
    if (result) return result;
  }

  // ── 2. Gemini ─────────────────────────────────────────────────────────────
  if (keys.gemini) {
    const result = await callWithRetry(async () => {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${keys.gemini}`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(options.systemPrompt ? { systemInstruction: { parts: [{ text: options.systemPrompt }] } } : {}),
            contents:         [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: maxTokens, temperature },
          }),
          signal: AbortSignal.timeout(30000),
        }
      );
      if (res.status === 429) throw Object.assign(new Error("429 rate limit"), { name: "RateLimitError" });
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
    }, "Gemini");
    if (result) return result;
  }

  // ── 3. OpenRouter (3rd fallback) ──────────────────────────────────────────
  if (keys.openrouter) {
    const result = await callWithRetry(async () => {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method:  "POST",
        headers: {
          Authorization:  `Bearer ${keys.openrouter}`,
          "Content-Type": "application/json",
          "HTTP-Referer":  process.env.APP_URL || "https://seo-agent.onrender.com",
          "X-Title":       "SEO Agent",
        },
        body: JSON.stringify({
          model:       "meta-llama/llama-3.1-8b-instruct:free",
          messages,
          max_tokens:  maxTokens,
          temperature,
        }),
        signal: AbortSignal.timeout(35000),
      });
      if (res.status === 429) throw Object.assign(new Error("429 rate limit"), { name: "RateLimitError" });
      const data = await res.json();
      return data.choices?.[0]?.message?.content || null;
    }, "OpenRouter");
    if (result) return result;
  }

  throw new Error("All LLM providers failed — add Groq, Gemini, or OpenRouter key in Settings");
}

/**
 * Parse JSON from LLM response (handles markdown code blocks)
 */
function parseJSON(text) {
  try {
    const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(clean);
  } catch {
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Could not parse LLM response as JSON");
  }
}

module.exports = { callLLM, parseJSON };
