/**
 * LLM Utility — Groq → Gemini → OpenRouter (3-provider fallback)
 * Each provider retries once on timeout before falling to the next.
 * Records usage via costTracker when options.clientId is provided.
 *
 * Server-level OpenRouter key: process.env.OPENROUTER_API_KEY is used as
 * a guaranteed last-resort so agents work out-of-the-box without users
 * needing to configure their own LLM key. User key (keys.openrouter) takes
 * priority over the server key when both are present.
 */
const { recordUsage, checkBudget } = require("./costTracker");

// Server-level OpenRouter key — set OPENROUTER_API_KEY in Render env vars.
const SERVER_OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || null;

const RETRY_DELAY_MS     = 1500;
const RATE_LIMIT_WAIT_MS = 60000; // 60s — standard rate-limit window
const OVERLOAD_WAIT_MS   = 8000;  // 8s — overloaded (529) is usually transient

// ── Global rate limit cooldown tracker ────────────────────────────────────────
// Prevents parallel agents all hammering the same provider at once.
// When one agent hits 429, all other agents respect the same cooldown.
const providerCooldown = { groq: 0, gemini: 0, openrouter: 0 };

function markRateLimited(provider) {
  providerCooldown[provider] = Date.now() + RATE_LIMIT_WAIT_MS;
}

async function waitIfCoolingDown(provider) {
  const coolUntil = providerCooldown[provider] || 0;
  const remaining = coolUntil - Date.now();
  if (remaining > 0) {
    console.log(`[llm] ${provider} cooling down — waiting ${Math.round(remaining/1000)}s`);
    await sleep(remaining);
  }
}

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

async function callLLM(clientIdOrPrompt, keysOrOptions, promptOrOptions = {}, options = {}) {
  // Support both calling conventions:
  // Old: callLLM(prompt, keys, options)
  // New: callLLM(clientId, keys, prompt, { system, maxTokens })
  let clientId, keys, prompt, opts;

  if (typeof keysOrOptions === "object" && keysOrOptions !== null && 
      (keysOrOptions.groq !== undefined || keysOrOptions.gemini !== undefined || 
       keysOrOptions.openrouter !== undefined || keysOrOptions.serpApi !== undefined ||
       Object.keys(keysOrOptions).length === 0)) {
    // New convention: callLLM(clientId, keys, prompt, options)
    clientId = clientIdOrPrompt;
    keys     = keysOrOptions;
    prompt   = promptOrOptions;
    opts     = options;
  } else {
    // Old convention: callLLM(prompt, keys, options)
    prompt   = clientIdOrPrompt;
    keys     = keysOrOptions;
    opts     = promptOrOptions;
    clientId = opts.clientId || null;
  }

  // Normalise options — support both {system} and {systemPrompt}
  const systemPrompt = opts.system || opts.systemPrompt || null;
  const maxTokens    = opts.maxTokens  || 3000;
  const temperature  = opts.temperature || 0.3;

  const messages = [
    ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
    { role: "user", content: String(prompt || "") },
  ];

  // ── Budget gate: block expensive calls if monthly budget exceeded ──
  // Callers can pass skipBudgetCheck=true for critical system calls.
  if (clientId && !opts.skipBudgetCheck) {
    const budget = await checkBudget(clientId);
    if (!budget.allowed) {
      throw new Error(`LLM call blocked: ${budget.reason}`);
    }
  }

  // ── 1. Groq ───────────────────────────────────────────────────────────────
  if (keys.groq) {
    await waitIfCoolingDown("groq");
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
      if (res.status === 429) { markRateLimited("groq"); throw Object.assign(new Error("429 rate limit"), { name: "RateLimitError" }); }
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
    await waitIfCoolingDown("gemini");
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
      if (res.status === 429) { markRateLimited("gemini"); throw Object.assign(new Error("429 rate limit"), { name: "RateLimitError" }); }
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

  // ── 3. OpenRouter — user key first, then server-level env key ────────────
  const openrouterKey = keys.openrouter || SERVER_OPENROUTER_KEY;
  if (openrouterKey) {
    await waitIfCoolingDown("openrouter");
    const result = await callWithRetry(async () => {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method:  "POST",
        headers: {
          Authorization:  `Bearer ${openrouterKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer":  process.env.APP_URL || "https://seo-agent.onrender.com",
          "X-Title":       "SEO Agent",
        },
        body: JSON.stringify({
          // Use a capable free model; falls back gracefully on OpenRouter if unavailable
          model:       "meta-llama/llama-3.3-70b-instruct:free",
          messages,
          max_tokens:  maxTokens,
          temperature,
        }),
        signal: AbortSignal.timeout(45000),
      });
      if (res.status === 429) { markRateLimited("openrouter"); throw Object.assign(new Error("429 rate limit"), { name: "RateLimitError" }); }
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

  throw new Error("All LLM providers failed — add Groq, Gemini, or OpenRouter key in Settings, or set OPENROUTER_API_KEY env var on the server");
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
