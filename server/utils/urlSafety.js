/**
 * URL Safety — SSRF protection for server-side fetches of user-supplied URLs.
 *
 * Blocks private IPs (RFC 1918), loopback, link-local, and cloud metadata endpoints
 * so that public-facing endpoints (presales audit, verify-tracking, crawler) cannot
 * be used to probe internal infrastructure.
 */

const { URL } = require("url");

// Private and reserved IP ranges that should never be fetched server-side
const PRIVATE_RANGES = [
  // IPv4 loopback
  /^127\./,
  // IPv4 private (RFC 1918)
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  // IPv4 link-local
  /^169\.254\./,
  // IPv4 reserved
  /^0\./,
  // IPv6 loopback and private (in bracket notation or raw)
  /^::1$/,
  /^fc00:/i,
  /^fd[0-9a-f]{2}:/i,
  /^fe80:/i,
];

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",       // GCP metadata
  "169.254.169.254",                // AWS/GCP/Azure metadata
  "metadata.google.internal.",
  "[::1]",
]);

/**
 * Returns true if the URL points to a private/internal/metadata address.
 * Pass a fully-qualified URL string (with protocol).
 */
function isPrivateUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    const hostname = parsed.hostname.toLowerCase();

    // Block known dangerous hostnames
    if (BLOCKED_HOSTNAMES.has(hostname)) return true;

    // Block private IPv4 ranges
    for (const re of PRIVATE_RANGES) {
      if (re.test(hostname)) return true;
    }

    // Block non-http(s) protocols (file://, ftp://, etc.)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return true;

    return false;
  } catch {
    // Unparseable URL — block it
    return true;
  }
}

module.exports = { isPrivateUrl };
