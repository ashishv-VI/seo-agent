/**
 * rateLimiter.js — Brute-force & abuse protection
 * Applied per route type — auth gets tightest limits
 */

const rateLimit = require("express-rate-limit");

// ── Auth routes: login, register, password reset ─────────────────────────────
// 10 attempts per 15 min per IP — blocks brute-force credential stuffing
const authLimiter = rateLimit({
  windowMs:         15 * 60 * 1000, // 15 minutes
  max:              10,
  standardHeaders:  true,
  legacyHeaders:    false,
  message:          { error: "Too many auth attempts. Try again in 15 minutes." },
  skipSuccessfulRequests: true,     // only count failed attempts
});

// ── Agent/pipeline routes: AI runs that cost money ───────────────────────────
// 20 runs per 10 min per IP — prevents runaway pipeline triggers
const agentLimiter = rateLimit({
  windowMs:         10 * 60 * 1000, // 10 minutes
  max:              20,
  standardHeaders:  true,
  legacyHeaders:    false,
  message:          { error: "Too many agent requests. Slow down." },
});

// ── Chat routes: LLM chat ────────────────────────────────────────────────────
// 60 messages per minute per IP
const chatLimiter = rateLimit({
  windowMs:         60 * 1000, // 1 minute
  max:              60,
  standardHeaders:  true,
  legacyHeaders:    false,
  message:          { error: "Chat rate limit reached. Wait a moment." },
});

// ── API routes: general data reads/writes ────────────────────────────────────
// 200 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs:         60 * 1000, // 1 minute
  max:              200,
  standardHeaders:  true,
  legacyHeaders:    false,
  message:          { error: "Too many requests. Slow down." },
});

module.exports = { authLimiter, agentLimiter, chatLimiter, apiLimiter };
