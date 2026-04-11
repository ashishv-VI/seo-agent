/**
 * Google Search Console API Client — Per-Client OAuth
 *
 * Each client connects their own Google account via OAuth.
 * We store their refresh token in Firestore and use it to get fresh access tokens.
 *
 * Token storage: clients/{clientId}.gscIntegration = {
 *   accessToken, refreshToken, tokenExpiry, email, connectedAt, connected
 * }
 */

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GSC_API_BASE     = "https://searchconsole.googleapis.com";

function getClientId()     { return process.env.GOOGLE_CLIENT_ID     || ""; }
function getClientSecret() { return process.env.GOOGLE_CLIENT_SECRET  || ""; }
function getBackendUrl()   { return (process.env.BACKEND_URL || "https://seo-agent-backend-8m1z.onrender.com").replace(/\/+$/, ""); }

const CALLBACK_PATH = "/api/gsc/oauth/callback";

/**
 * Build the Google OAuth consent URL for a client connection
 */
function buildAuthUrl(clientId, uid) {
  const state       = Buffer.from(JSON.stringify({ clientId, uid })).toString("base64url");
  const redirectUri = getBackendUrl() + CALLBACK_PATH;
  const scopes      = [
    "https://www.googleapis.com/auth/webmasters.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
  ].join(" ");

  const params = new URLSearchParams({
    client_id:     getClientId(),
    redirect_uri:  redirectUri,
    response_type: "code",
    scope:         scopes,
    access_type:   "offline",
    prompt:        "consent",   // always get refresh token
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchange authorization code for access + refresh tokens
 */
async function exchangeCode(code) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams({
      code,
      client_id:     getClientId(),
      client_secret: getClientSecret(),
      redirect_uri:  getBackendUrl() + CALLBACK_PATH,
      grant_type:    "authorization_code",
    }).toString(),
    signal:  AbortSignal.timeout(15000),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error_description || data.error || `Token exchange failed (${res.status})`);
  }

  return {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token || null,
    expiresIn:    data.expires_in || 3600,
  };
}

/**
 * Refresh an expired access token using the stored refresh token
 */
async function refreshAccessToken(refreshToken) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams({
      refresh_token: refreshToken,
      client_id:     getClientId(),
      client_secret: getClientSecret(),
      grant_type:    "refresh_token",
    }).toString(),
    signal:  AbortSignal.timeout(15000),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error_description || data.error || "Token refresh failed");
  }

  return {
    accessToken: data.access_token,
    expiresIn:   data.expires_in || 3600,
  };
}

/**
 * Get email address for the Google account
 */
async function getGoogleEmail(accessToken) {
  try {
    const res  = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal:  AbortSignal.timeout(10000),
    });
    const data = await res.json();
    return data.email || null;
  } catch {
    return null;
  }
}

/**
 * Get a valid access token for a client (refreshes if expired)
 * Updates Firestore with the new token
 *
 * @param {object} gscInt — the gscIntegration object from Firestore
 * @param {string} clientId — for updating Firestore
 * @param {object} db — Firestore instance
 * @returns {string} valid access token
 */
async function getValidToken(gscInt, clientId, db) {
  const now = Date.now();

  // Still valid (with 60s buffer)
  if (gscInt.accessToken && gscInt.tokenExpiry && (gscInt.tokenExpiry - 60000) > now) {
    return gscInt.accessToken;
  }

  if (!gscInt.refreshToken) {
    throw new Error("No refresh token stored — client must reconnect Search Console");
  }

  // Refresh
  const { accessToken, expiresIn } = await refreshAccessToken(gscInt.refreshToken);
  const tokenExpiry = now + expiresIn * 1000;

  // Update in Firestore
  await db.collection("clients").doc(clientId).update({
    "gscIntegration.accessToken":  accessToken,
    "gscIntegration.tokenExpiry":  tokenExpiry,
    "gscIntegration.lastRefreshed": new Date().toISOString(),
  });

  return accessToken;
}

/**
 * Query Search Console analytics
 *
 * @param {string} siteUrl      — e.g. "https://example.com/"
 * @param {string} accessToken  — valid Google OAuth access token
 * @param {object} queryBody    — { startDate, endDate, dimensions, rowLimit, ... }
 * @returns {object} GSC response
 */
async function querySearchConsole(siteUrl, accessToken, queryBody) {
  const encoded = encodeURIComponent(siteUrl);
  const url     = `${GSC_API_BASE}/webmasters/v3/sites/${encoded}/searchAnalytics/query`;

  const res = await fetch(url, {
    method:  "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:  `Bearer ${accessToken}`,
    },
    body:   JSON.stringify(queryBody),
    signal: AbortSignal.timeout(20000),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    const msg = data.error?.message || data.error || `GSC API error (${res.status})`;
    throw new Error(msg);
  }

  return data;
}

/**
 * List all Search Console sites accessible to this token
 */
async function listSites(accessToken) {
  const res = await fetch(`${GSC_API_BASE}/webmasters/v3/sites`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal:  AbortSignal.timeout(15000),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Could not list sites");
  return (data.siteEntry || []).map(s => ({ url: s.siteUrl, permissionLevel: s.permissionLevel }));
}

module.exports = {
  buildAuthUrl,
  exchangeCode,
  getGoogleEmail,
  getValidToken,
  querySearchConsole,
  listSites,
};
