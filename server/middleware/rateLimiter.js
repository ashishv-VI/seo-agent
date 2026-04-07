/**
 * rateLimiter.js — Brute-force & abuse protection
 * Applied per route type — auth gets tightest limits
 *
 * Key design decisions:
 * - Auth: per IP (pre-auth, no UID available)
 * - Agent RUN: per UID (extracted from Bearer token) — prevents one user burning the LLM budget
 * - Data GETs: use apiLimiter (200/min) — these are cheap reads, not AI runs
 * - Chat: per UID
 */

const rateLimit = require("express-rate-limit");

// ── Extract Firebase UID from Authorization header ────────────────────────────
// Falls back to IP so the limiter still works if token is missing/malformed
function uidOrIp(req) {
  try {
    const auth = req.headers.authorization || "";
    if (auth.startsWith("Bearer ")) {
      // Decode the JWT payload (middle segment) without verifying — just for rate-limit keying
      const payload = JSON.parse(
        Buffer.from(auth.split(".")[1], "base64url").toString("utf8")
      );
      if (payload.user_id || payload.sub) return payload.user_id || payload.sub;
    }
  } catch { /* fall through */ }
  return req.ip;
}

// ── Auth routes: login, register, password reset ─────────────────────────────
// 10 attempts per 15 min per IP
const authLimiter = rateLimit({
  windowMs:               15 * 60 * 1000,
  max:                    10,
  standardHeaders:        true,
  legacyHeaders:          false,
  message:                { error: "Too many auth attempts. Try again in 15 minutes." },
  skipSuccessfulRequests: true,
});

// ── Agent RUN routes: AI pipeline/agent triggers (POST only) ─────────────────
// 60 AI runs per 10 min per USER — allows normal use, blocks runaway triggers
// GET data reads on /api/agents/* are NOT subject to this — use apiLimiter instead
const agentLimiter = rateLimit({
  windowMs:      10 * 60 * 1000, // 10 minutes
  max:           60,
  keyGenerator:  uidOrIp,
  standardHeaders: true,
  legacyHeaders:   false,
  skip:          (req) => req.method === "GET", // GETs are cheap reads — never rate-limit them here
  message:       { error: "Too many agent requests. Slow down." },
});

// ── Chat routes: LLM chat ────────────────────────────────────────────────────
// 60 messages per minute per user
const chatLimiter = rateLimit({
  windowMs:      60 * 1000,
  max:           60,
  keyGenerator:  uidOrIp,
  standardHeaders: true,
  legacyHeaders:   false,
  message:       { error: "Chat rate limit reached. Wait a moment." },
});

// ── API routes: general data reads/writes ────────────────────────────────────
// 300 requests per minute per user
const apiLimiter = rateLimit({
  windowMs:      60 * 1000,
  max:           300,
  keyGenerator:  uidOrIp,
  standardHeaders: true,
  legacyHeaders:   false,
  message:       { error: "Too many requests. Slow down." },
});

module.exports = { authLimiter, agentLimiter, chatLimiter, apiLimiter };
