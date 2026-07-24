/**
 * branding.js — White-label brand configuration engine (M10.5).
 *
 * PURE HELPER. No UI, no routing, no I/O. Defines the canonical agency brand
 * schema + platform defaults, merges a stored brand over the defaults, and
 * sanitizes input. Single source of truth for what a "brand" is.
 *
 * Storage model (agency-level, reusing the EXISTING store): the brand object
 * lives on users/{ownerId}.brand — one brand per agency, applied across all of
 * that agency's clients (mirrors portal.js's existing owner-branding read). The
 * route resolves a client's owner and reads/writes that owner's brand, so there
 * is no per-client fork and no second branding system.
 *
 * Backwards-compatible: the pre-existing fields (agencyName, primaryColor,
 * logoUrl) are preserved; new M10.5 fields are additive with safe defaults.
 */

// Platform defaults — what a brand looks like before any agency customizes it.
const DEFAULT_BRAND = {
  companyName:     "SEO Agent",
  logo:            "",            // URL or data URI
  favicon:        "",
  primaryColor:    "#443DCB",
  secondaryColor:  "#3730b8",
  accentColor:     "#0e8fa8",
  emailFrom:       "",            // falls back to server EMAIL_FROM when empty
  supportEmail:    "",
  website:         "",
  footer:          "",
  copyright:       "",
  pdfLogo:         "",            // separate logo for PDF/report headers
  loginBackground: "",
  portalTheme:     "light",       // "light" | "dark"
};

// Fields that must be short strings (defensive caps to avoid oversized docs).
const STRING_CAPS = {
  companyName: 80, emailFrom: 120, supportEmail: 120, website: 200,
  footer: 300, copyright: 200, portalTheme: 12,
};
// Colors must look like a hex value.
const COLOR_FIELDS = ["primaryColor", "secondaryColor", "accentColor"];
// URL/data-URI fields (logo/favicon/etc.) — capped larger to allow small data URIs.
const ASSET_FIELDS = ["logo", "favicon", "pdfLogo", "loginBackground"];
const ASSET_CAP = 500000; // ~500KB data URI ceiling

function isHex(v) { return typeof v === "string" && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v.trim()); }

/**
 * Merge a stored brand (possibly the legacy {agencyName, primaryColor, logoUrl}
 * shape) over defaults into the canonical schema. Never throws.
 */
function resolveBrand(stored = {}) {
  const s = stored || {};
  return {
    ...DEFAULT_BRAND,
    ...pickKnown(s),
    // Legacy-field bridge: old shape → canonical fields (only if new absent).
    companyName:  s.companyName  || s.agencyName || DEFAULT_BRAND.companyName,
    logo:         s.logo         || s.logoUrl    || DEFAULT_BRAND.logo,
    primaryColor: isHex(s.primaryColor) ? s.primaryColor : DEFAULT_BRAND.primaryColor,
  };
}

function pickKnown(obj) {
  const out = {};
  for (const k of Object.keys(DEFAULT_BRAND)) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

/**
 * Validate + sanitize an incoming brand patch. Returns { ok, value, error }.
 * Only known fields survive; unknown keys are dropped. Never throws.
 */
function sanitizeBrand(input = {}) {
  if (typeof input !== "object" || input === null) return { ok: false, error: "Brand must be an object." };
  const out = {};
  for (const k of Object.keys(DEFAULT_BRAND)) {
    if (input[k] === undefined) continue;
    let v = input[k];
    if (COLOR_FIELDS.includes(k)) {
      if (v && !isHex(v)) return { ok: false, error: `${k} must be a hex color (e.g. #443DCB).` };
      out[k] = v || DEFAULT_BRAND[k];
    } else if (ASSET_FIELDS.includes(k)) {
      if (typeof v !== "string") return { ok: false, error: `${k} must be a string (URL or data URI).` };
      if (v.length > ASSET_CAP) return { ok: false, error: `${k} is too large (max ~500KB). Host the asset and use a URL.` };
      out[k] = v;
    } else {
      if (typeof v !== "string") v = String(v ?? "");
      const cap = STRING_CAPS[k] || 200;
      out[k] = v.slice(0, cap);
    }
  }
  // Keep legacy fields written too, so the old settings modal + portal keep working.
  if (out.companyName !== undefined) out.agencyName = out.companyName;
  if (out.logo !== undefined) out.logoUrl = out.logo;
  return { ok: true, value: out };
}

module.exports = { DEFAULT_BRAND, resolveBrand, sanitizeBrand, isHex };
