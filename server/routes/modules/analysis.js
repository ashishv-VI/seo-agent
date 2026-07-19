/**
 * Analysis routes — extracted from routes/agents.js (Sprint 1, Story M6.3).
 *
 * Read-only audit / SEO analysis retrieval endpoints. Mounted by agents.js under
 * the same base path (/api/agents), so the public endpoints are unchanged:
 *   GET /api/agents/:clientId/intent-analysis   — keyword-intent vs page-content mismatch analysis
 *   GET /api/agents/:clientId/A2/patterns        — site-wide audit pattern analysis
 *   GET /api/agents/:clientId/A2/crawl-status     — real-time crawl progress
 *   GET /api/agents/:clientId/A2/page-scores      — per-page SEO scores
 *
 * Routes moved verbatim. Middleware (verifyToken), ownership check (getClientDoc),
 * Firestore/state access, inline agent-util requires, validation, status codes,
 * error messages, and response formats are identical to the originals.
 */
const express       = require("express");
const router        = express.Router();
const { db }        = require("../../config/firebase");
const { verifyToken } = require("../../middleware/auth");
const { getState, saveState } = require("../../shared-state/stateManager");
const { getClientDoc } = require("../shared/clientOwnership");

// GET intent mismatch analysis: compares keyword intent vs page content signals
router.get("/:clientId/intent-analysis", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const clientId = req.params.clientId;
    const [keywords, audit] = await Promise.all([
      getState(clientId, "A3_keywords"),
      getState(clientId, "A2_audit"),
    ]);
    if (!keywords) return res.json({ mismatches: [] });

    const pageSignals = {};
    const allIssues = [
      ...(audit?.issues?.p1 || []),
      ...(audit?.issues?.p2 || []),
      ...(audit?.issues?.p3 || []),
    ];
    allIssues.forEach(i => {
      if (i.page) {
        if (!pageSignals[i.page]) pageSignals[i.page] = [];
        pageSignals[i.page].push(i.type);
      }
    });

    // Detect intent mismatches: transactional keyword → page lacks CTA signals
    const mismatches = [];
    const kwMap = keywords.keywordMap || [];
    const intentRules = {
      transactional: ["missing_cta", "thin_content", "missing_schema"],
      informational: ["missing_h1", "thin_content"],
      navigational:  ["redirect_chain", "missing_canonical"],
      commercial:    ["missing_meta_desc", "missing_schema"],
    };

    for (const kw of kwMap) {
      if (!kw.suggestedPage || !kw.intent) continue;
      const pageIssues = pageSignals[kw.suggestedPage] || [];
      const conflictRules = intentRules[kw.intent] || [];
      const conflicts = conflictRules.filter(r => pageIssues.includes(r));
      if (conflicts.length > 0 || (kw.intent === "transactional" && (kw.priority === "high"))) {
        const severity = kw.priority === "high" ? "critical" : "warning";
        mismatches.push({
          keyword:      kw.keyword,
          intent:       kw.intent,
          page:         kw.suggestedPage,
          conflicts,
          severity,
          fix: kw.intent === "transactional"
            ? `Add clear CTA, pricing, and conversion elements to ${kw.suggestedPage}`
            : `Align content structure on ${kw.suggestedPage} to match ${kw.intent} user intent`,
        });
      }
    }

    return res.json({ mismatches, total: mismatches.length });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────
// SPRINT 6 — AUDIT PATTERNS (A2 site-wide patterns)
// ────────────────────────────────────────────────────

router.get("/:clientId/A2/patterns", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const refresh = req.query.refresh === "true";

    // Return cached unless refresh=true
    if (!refresh) {
      const cached = await getState(req.params.clientId, "A2_patterns");
      if (cached) return res.json(cached);
    }

    // Compute live from subcollection and cache
    const { detectSitePatterns } = require("../../utils/auditPatterns");
    const patterns = await detectSitePatterns(req.params.clientId);
    await saveState(req.params.clientId, "A2_patterns", patterns).catch(() => {});
    return res.json(patterns);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// GET /:clientId/A2/crawl-status — real-time crawl progress (polling)
router.get("/:clientId/A2/crawl-status", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const clientId = req.params.clientId;

    // Read from clients doc — A2 writes progress here during crawl
    const clientDoc = await db.collection("clients").doc(clientId).get();
    const data      = clientDoc.data() || {};
    const audit     = await getState(clientId, "A2_audit").catch(() => null);

    return res.json({
      status:        data.agents?.A2 || "idle",
      crawlProgress: data.crawlProgress || null,  // { crawled, total, pct }
      lastAuditAt:   audit?.auditedAt || null,
      pagesCrawled:  audit?.checks?.pageAuditCount || audit?.checks?.internalLinksFound || 0,
      healthScore:   audit?.healthScore || null,
      p1Count:       audit?.issues?.p1?.length || 0,
      p2Count:       audit?.issues?.p2?.length || 0,
    });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// GET /:clientId/A2/page-scores — per-page SEO scores from pageScorer
router.get("/:clientId/A2/page-scores", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const clientId = req.params.clientId;
    const refresh  = req.query.refresh === "true";

    if (!refresh) {
      const cached = await getState(clientId, "A2_page_scores");
      if (cached) return res.json(cached);
    }

    const brief          = await getState(clientId, "A1_brief").catch(() => null);
    const targetKeywords = (brief?.primaryKeywords || []).slice(0, 5);
    const { scoreAllPages } = require("../../utils/pageScorer");
    const scores = await scoreAllPages(clientId, targetKeywords);
    return res.json(scores);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

module.exports = router;
