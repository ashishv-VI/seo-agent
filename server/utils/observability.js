/**
 * observability.js — optional Sentry error monitoring (M9.1).
 *
 * Environment-driven and fully optional: if @sentry/node is not installed OR
 * SENTRY_DSN is not set, every export is a safe no-op and the server runs
 * exactly as before. Never hardcodes a DSN. Mirrors the resilient
 * optional-require pattern used for express-rate-limit in index.js.
 *
 *   SENTRY_DSN           — enables Sentry when present (required to activate)
 *   SENTRY_ENVIRONMENT   — optional, defaults to NODE_ENV || "production"
 *   SENTRY_TRACES_SAMPLE_RATE — optional float, defaults to 0 (errors only)
 */
let Sentry = null;
let enabled = false;

function initObservability() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log("[observability] SENTRY_DSN not set — error monitoring disabled (no-op).");
    return { enabled: false };
  }
  try {
    Sentry = require("@sentry/node");
    Sentry.init({
      dsn,
      environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "production",
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || "0") || 0,
      // Keep it lightweight — errors first. Release tag if Render provides the commit.
      release: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || undefined,
    });
    enabled = true;
    console.log("[observability] Sentry initialized.");
    return { enabled: true };
  } catch (e) {
    console.warn("[observability] @sentry/node unavailable — error monitoring disabled:", e.message);
    Sentry = null;
    enabled = false;
    return { enabled: false };
  }
}

// Capture an exception if Sentry is active; always safe to call.
function captureException(err, context) {
  if (!enabled || !Sentry) return;
  try {
    if (context) Sentry.captureException(err, { extra: context });
    else Sentry.captureException(err);
  } catch { /* never let monitoring break the caller */ }
}

// Capture a message (used for pipeline failures, etc.).
function captureMessage(message, level = "info") {
  if (!enabled || !Sentry) return;
  try { Sentry.captureMessage(message, level); } catch { /* noop */ }
}

// Attach the Express error handler if Sentry is active (v8+ API). No-op otherwise.
function setupExpressErrorHandler(app) {
  if (!enabled || !Sentry) return;
  try {
    if (typeof Sentry.setupExpressErrorHandler === "function") {
      Sentry.setupExpressErrorHandler(app);
    }
  } catch (e) {
    console.warn("[observability] Sentry express handler setup failed:", e.message);
  }
}

function isEnabled() { return enabled; }

module.exports = {
  initObservability,
  captureException,
  captureMessage,
  setupExpressErrorHandler,
  isEnabled,
};
