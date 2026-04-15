/**
 * LLM Utility — Groq → Gemini → OpenRouter (3-provider fallback)
 * Each provider retries once on timeout before falling to the next.
 * Records usage via costTracker when options.clientId is provided.
 */
const { recordUsage, checkBudget } = require("./costTracker");

const RETRY_DELAY_MS     = 1500;
const RATE_LIMIT_WAIT_MS = 60000; // 60s — standard rate-limit window
const OVERLOAD_WAIT_MS   = 8000;  // 8s — overloaded (529) is usually transient

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Single provider call with one retry on timeout / rate-limit / overload ───
async function callWithRetry(fn, providerName) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (e) {
      const isTimeout   = e.name === "TimeoutError"   || e.message?.includes("timeout");
      const isRateLimit = e.name === "RateLimitError" || e.message?.includes("429");
      const isOverloaded = e.name === "OverloadedError" || e.message?.includes("529") || e.message?.includes("overload");
      if (attempt === 1 && (isRateLimit || isOverloaded)) {
        const waitMs = isOverloaded ? OVERLOAD_WAIT_MS : RATE_LIMIT_WAIT_MS;
        console.warn(`[llm] ${providerName} ${isOverloaded ? "overloaded (529)" : "rate-limited (429)"} — waiting ${waitMs / 1000}s before retry`);
        await sleep(waitMs);
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
  const clientId   = options.clientId || null;

  // ── Budget gate: block expensive calls if monthly budget exceeded ──
  // Callers can pass skipBudgetCheck=true for critical system calls.
  if (clientId && !options.skipBudgetCheck) {
    const budget = await checkBudget(clientId);
    if (!budget.allowed) {
      throw new Error(`LLM call blocked: ${budget.reason}`);
    }
  }

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
      if (res.status === 529) throw Object.assign(new Error("529 overloaded"), { name: "OverloadedError" });
      if (!res.ok) throw new Error(`Groq HTTP ${res.status}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content || null;
    }, "Groq");
    if (result) {
      recordUsage(clientId, "groq", prompt, result).catch(() => {});
      return result;
    }
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
      if (res.status === 529) throw Object.assign(new Error("529 overloaded"), { name: "OverloadedError" });
      if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
    }, "Gemini");
    if (result) {
      recordUsage(clientId, "gemini", prompt, result).catch(() => {});
      return result;
    }
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
      if (res.status === 529) throw Object.assign(new Error("529 overloaded"), { name: "OverloadedError" });
      if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content || null;
    }, "OpenRouter");
    if (result) {
      recordUsage(clientId, "openrouter", prompt, result).catch(() => {});
      return result;
    }
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
