/**
 * Google Analytics 4 Data API Client — Per-Client OAuth
 *
 * Each client connects their own Google account via OAuth.
 * Stores refresh token in clients/{clientId}.ga4Integration
 *
 * Scopes:
 *   - https://www.googleapis.com/auth/analytics.readonly
 *   - https://www.googleapis.com/auth/userinfo.email
 */

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GA4_DATA_API     = "https://analyticsdata.googleapis.com/v1beta/properties";
const GA4_ADMIN_API    = "https://analyticsadmin.googleapis.com/v1beta";

function getClientId()     { return process.env.GOOGLE_CLIENT_ID     || ""; }
function getClientSecret() { return process.env.GOOGLE_CLIENT_SECRET  || ""; }
function getBackendUrl()   { return (process.env.BACKEND_URL || "https://seo-agent-backend-8mfz.onrender.com").replace(/\/+$/, ""); }

const CALLBACK_PATH = "/api/ga4/oauth/callback";

/**
 * Build the Google OAuth consent URL for GA4 access
 */
function buildAuthUrl(clientId, uid) {
  const state       = Buffer.from(JSON.stringify({ clientId, uid })).toString("base64url");
  const redirectUri = getBackendUrl() + CALLBACK_PATH;

  const scopes = [
    "https://www.googleapis.com/auth/analytics.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
  ].join(" ");

  const params = new URLSearchParams({
    client_id:     getClientId(),
    redirect_uri:  redirectUri,
    response_type: "code",
    scope:         scopes,
    access_type:   "offline",
    prompt:        "consent",
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
 * Refresh an expired access token
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
 * Get email address for the connected Google account
 */
async function getGoogleEmail(accessToken) {
  try {
    const res  = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    return data.email || null;
  } catch {
    return null;
  }
}

/**
 * Get a valid access token (refreshes if expired), updates Firestore
 */
async function getValidToken(ga4Int, clientId, db) {
  const now = Date.now();

  if (ga4Int.accessToken && ga4Int.tokenExpiry && (ga4Int.tokenExpiry - 60000) > now) {
    return ga4Int.accessToken;
  }

  if (!ga4Int.refreshToken) {
    throw new Error("No refresh token — client must reconnect Google Analytics");
  }

  const { accessToken, expiresIn } = await refreshAccessToken(ga4Int.refreshToken);
  const tokenExpiry = now + expiresIn * 1000;

  await db.collection("clients").doc(clientId).update({
    "ga4Integration.accessToken":  accessToken,
    "ga4Integration.tokenExpiry":  tokenExpiry,
    "ga4Integration.lastRefreshed": new Date().toISOString(),
  });

  return accessToken;
}

/**
 * List all GA4 properties accessible to this token via Account Summaries API
 */
async function listGA4Properties(accessToken) {
  try {
    const res  = await fetch(`${GA4_ADMIN_API}/accountSummaries`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "Could not list GA4 properties");

    const properties = [];
    for (const account of data.accountSummaries || []) {
      for (const prop of account.propertySummaries || []) {
        properties.push({
          accountName:  account.displayName,
          propertyId:   prop.property.replace("properties/", ""),
          propertyName: prop.displayName,
        });
      }
    }
    return properties;
  } catch {
    return [];
  }
}

/**
 * Run a GA4 Data API report
 *
 * @param {string} propertyId  — numeric GA4 property ID (e.g. "123456789")
 * @param {string} accessToken
 * @param {object} body        — GA4 RunReportRequest body
 */
async function runReport(propertyId, accessToken, body) {
  const url = `${GA4_DATA_API}/${propertyId}:runReport`;

  const res = await fetch(url, {
    method:  "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:  `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    const msg = data.error?.message || data.error || `GA4 API error (${res.status})`;
    throw new Error(msg);
  }

  return data;
}

/**
 * Run a GA4 Realtime report (active users in last 30 min)
 */
async function runRealtimeReport(propertyId, accessToken, body) {
  const url = `${GA4_DATA_API}/${propertyId}:runRealtimeReport`;

  const res = await fetch(url, {
    method:  "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:  `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || `GA4 Realtime API error (${res.status})`);
  }

  return data;
}

/**
 * Parse GA4 report rows into flat objects
 * GA4 returns dimension/metric values as separate arrays
 */
function parseRows(report) {
  if (!report.rows || report.rows.length === 0) return [];

  const dimHeaders = (report.dimensionHeaders || []).map(h => h.name);
  const metHeaders = (report.metricHeaders   || []).map(h => h.name);

  return report.rows.map(row => {
    const obj = {};
    (row.dimensionValues || []).forEach((v, i) => { obj[dimHeaders[i]] = v.value; });
    (row.metricValues    || []).forEach((v, i) => { obj[metHeaders[i]] = parseFloat(v.value) || 0; });
    return obj;
  });
}

module.exports = {
  buildAuthUrl,
  exchangeCode,
  getGoogleEmail,
  getValidToken,
  listGA4Properties,
  runReport,
  runRealtimeReport,
  parseRows,
};
