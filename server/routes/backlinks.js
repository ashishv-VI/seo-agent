/**
 * Backlinks Routes — DataForSEO Backlinks API
 * Provides domain backlink summary, referring domains, anchor analysis
 */
const express      = require("express");
const router       = express.Router();
const { db }       = require("../config/firebase");
const { verifyToken }   = require("../middleware/auth");
const { getUserKeys }   = require("../utils/getUserKeys");
const { getState }      = require("../shared-state/stateManager");

async function getClientDoc(clientId, uid) {
  const doc = await db.collection("clients").doc(clientId).get();
  if (!doc.exists)               throw { code: 404, message: "Client not found" };
  if (doc.data().ownerId !== uid) throw { code: 403, message: "Access denied" };
  return doc;
}

function cleanDomain(raw) {
  return (raw || "").replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0].trim();
}

async function dfsPost(endpoint, body, auth) {
  const res = await fetch(`https://api.dataforseo.com${endpoint}`, {
    method:  "POST",
    headers: {
      Authorization:   `Basic ${Buffer.from(auth).toString("base64")}`,
      "Content-Type":  "application/json",
    },
    body:   JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`DataForSEO returned HTTP ${res.status}`);
  return res.json();
}

// ── GET /:clientId/summary ─────────────────────────────────────────────────────
router.get("/:clientId/summary", verifyToken, async (req, res) => {
  try {
    const doc   = await getClientDoc(req.params.clientId, req.uid);
    const keys  = await getUserKeys(req.uid);
    const brief = await getState(req.params.clientId, "A1_brief") || {};

    const domain = cleanDomain(req.query.domain || brief.websiteUrl || doc.data().website || "");
    if (!domain) return res.status(400).json({ error: "No domain found for this client" });

    if (!keys.dataforseo) {
      return res.status(400).json({ error: "DataForSEO key required. Add login:password in Settings → DataForSEO." });
    }

    const data   = await dfsPost("/v3/backlinks/summary/live",
      [{ target: domain, include_subdomains: true }],
      keys.dataforseo
    );

    const r = data?.tasks?.[0]?.result?.[0];
    if (!r) return res.status(500).json({ error: data?.tasks?.[0]?.status_message || "No data from DataForSEO" });

    return res.json({
      domain,
      domainRank:        r.rank                               || 0,
      backlinks:         r.backlinks                          || 0,
      referringDomains:  r.referring_domains                  || 0,
      referringIPs:      r.referring_ips                      || 0,
      spamScore:         r.spam_score                         || 0,
      newBacklinks:      r.new_backlinks                      || 0,
      lostBacklinks:     r.lost_backlinks                     || 0,
      brokenBacklinks:   r.broken_backlinks                   || 0,
      followLinks:       r.referring_links_types?.follow      || 0,
      nofollowLinks:     r.referring_links_types?.nofollow    || 0,
      textLinks:         r.referring_links_platform_types?.web|| 0,
    });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── GET /:clientId/referring-domains ──────────────────────────────────────────
router.get("/:clientId/referring-domains", verifyToken, async (req, res) => {
  try {
    const doc   = await getClientDoc(req.params.clientId, req.uid);
    const keys  = await getUserKeys(req.uid);
    const brief = await getState(req.params.clientId, "A1_brief") || {};

    const domain = cleanDomain(req.query.domain || brief.websiteUrl || doc.data().website || "");
    if (!keys.dataforseo) return res.status(400).json({ error: "DataForSEO key required" });

    const data = await dfsPost("/v3/backlinks/referring_domains/live",
      [{ target: domain, limit: 50, order_by: ["rank,desc"], include_subdomains: true }],
      keys.dataforseo
    );

    const items = data?.tasks?.[0]?.result?.[0]?.items || [];
    return res.json({
      domain,
      total: data?.tasks?.[0]?.result?.[0]?.total_count || items.length,
      items: items.map(d => ({
        domain:     d.domain,
        rank:       d.rank       || 0,
        backlinks:  d.backlinks  || 0,
        dofollow:   d.dofollow   || false,
        firstSeen:  d.first_seen || null,
        spamScore:  d.spam_score || 0,
      })),
    });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── GET /:clientId/anchors ─────────────────────────────────────────────────────
router.get("/:clientId/anchors", verifyToken, async (req, res) => {
  try {
    const doc   = await getClientDoc(req.params.clientId, req.uid);
    const keys  = await getUserKeys(req.uid);
    const brief = await getState(req.params.clientId, "A1_brief") || {};

    const domain = cleanDomain(req.query.domain || brief.websiteUrl || doc.data().website || "");
    if (!keys.dataforseo) return res.status(400).json({ error: "DataForSEO key required" });

    const data = await dfsPost("/v3/backlinks/anchors/live",
      [{ target: domain, limit: 20, order_by: ["backlinks,desc"], include_subdomains: true }],
      keys.dataforseo
    );

    const items = data?.tasks?.[0]?.result?.[0]?.items || [];
    return res.json({
      anchors: items.map(a => ({
        anchor:   a.anchor              || "(no text)",
        backlinks:a.backlinks           || 0,
        domains:  a.referring_domains   || 0,
        dofollow: a.dofollow            || false,
      })),
    });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── POST /analyze — Free domain lookup (no clientId needed) ──────────────────
// Used by Domain Overview standalone tool — looks up ANY domain using logged-in user's DataForSEO key
router.post("/analyze", verifyToken, async (req, res) => {
  try {
    const { domain } = req.body;
    if (!domain) return res.status(400).json({ error: "domain required" });

    const keys = await getUserKeys(req.uid);
    if (!keys.dataforseo) {
      return res.status(400).json({ error: "DataForSEO key required. Go to Settings → API Keys → paste your DataForSEO login:password → Save." });
    }

    const norm = cleanDomain(domain);

    const [summaryRes, domainsRes, anchorsRes] = await Promise.allSettled([
      dfsPost("/v3/backlinks/summary/live",
        [{ target: norm, include_subdomains: true }], keys.dataforseo),
      dfsPost("/v3/backlinks/referring_domains/live",
        [{ target: norm, limit: 50, order_by: ["rank,desc"], include_subdomains: true }], keys.dataforseo),
      dfsPost("/v3/backlinks/anchors/live",
        [{ target: norm, limit: 20, order_by: ["backlinks,desc"], include_subdomains: true }], keys.dataforseo),
    ]);

    const r  = summaryRes.status === "fulfilled" ? summaryRes.value?.tasks?.[0]?.result?.[0] : null;
    const rd = domainsRes.status === "fulfilled" ? domainsRes.value?.tasks?.[0]?.result?.[0]?.items || [] : [];
    const an = anchorsRes.status === "fulfilled" ? anchorsRes.value?.tasks?.[0]?.result?.[0]?.items || [] : [];

    if (!r) {
      const msg = summaryRes.reason?.message || summaryRes.value?.tasks?.[0]?.status_message || "No data from DataForSEO";
      return res.status(500).json({ error: msg });
    }

    const drRaw = r.rank || 0;
    const drLabel = drRaw >= 70 ? "Strong" : drRaw >= 50 ? "Good" : drRaw >= 30 ? "Moderate" : drRaw > 0 ? "Weak" : "New";

    return res.json({
      domain:           norm,
      drScore:          drRaw,
      drLabel,
      backlinks:        r.backlinks             || 0,
      referringDomains: r.referring_domains     || 0,
      referringIPs:     r.referring_ips         || 0,
      spamScore:        r.spam_score            || 0,
      newBacklinks:     r.new_backlinks         || 0,
      lostBacklinks:    r.lost_backlinks        || 0,
      brokenBacklinks:  r.broken_backlinks      || 0,
      followLinks:      r.referring_links_types?.follow   || 0,
      nofollowLinks:    r.referring_links_types?.nofollow || 0,
      referringDomainsData: rd.map(d => ({
        domain:    d.domain,
        rank:      d.rank      || 0,
        backlinks: d.backlinks || 0,
        dofollow:  d.dofollow  || false,
        firstSeen: d.first_seen || null,
        spamScore: d.spam_score || 0,
      })),
      topAnchors: an.map(a => ({
        text:      a.anchor || "(no text)",
        count:     a.backlinks || 0,
        domains:   a.referring_domains || 0,
        dofollow:  a.dofollow || false,
      })),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;
