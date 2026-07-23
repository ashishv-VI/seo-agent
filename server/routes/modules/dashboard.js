/**
 * Dashboard / Forecast / Score routes — extracted from routes/agents.js
 * (Sprint 1, Story M6.22).
 *
 * Read-oriented aggregation + reporting endpoints. Mounted by agents.js under the
 * same base path (/api/agents), so the public endpoints are unchanged:
 *   GET /api/agents/:clientId/score          — 4-dimension score (cached → live)
 *   GET /api/agents/:clientId/score/history   — last-12 score history
 *   GET /api/agents/:clientId/forecast        — growth forecast
 *   GET /api/agents/:clientId/dashboard       — unified dashboard aggregate
 *   GET /api/agents/:clientId/pages           — page-level SEO breakdown
 *   GET /api/agents/:clientId/attribution     — keyword → lead attribution
 *   GET /api/agents/:clientId/gtm-guide       — GTM setup guide generator
 *
 * Routes moved verbatim, in original order. Middleware (verifyToken), ownership
 * (getClientDoc), getState reads, score/task utilities, alert translation
 * (translateAlert + SEVERITY_LABELS), the dashboard's write-inside-GET cache
 * generation (saveScoreHistory + clients.update({seoScore})), the dual-field
 * alert sort + slice, the pages homepage-merge/fallback/sort, the attribution
 * calculations + "Run keyword research first" response, and the gtm-guide
 * conditional trigger generation are all identical to the originals.
 */
const express       = require("express");
const router        = express.Router();
const { db }        = require("../../config/firebase");
const { verifyToken } = require("../../middleware/auth");
const { getClientDoc } = require("../shared/clientOwnership");
const { getState }  = require("../../shared-state/stateManager");
const { getTopTasks } = require("../../utils/taskQueue");
const { calculateScore, saveScoreHistory, getLatestScore, getScoreHistory, generateForecast } = require("../../utils/scoreCalculator");
const { translateAlert, SEVERITY_LABELS } = require("../../utils/alertTranslator");

// ────────────────────────────────────────────────────
// SCORE ENDPOINTS
// ────────────────────────────────────────────────────

// GET current 4-dimension score breakdown
router.get("/:clientId/score", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const clientId = req.params.clientId;

    // Try latest stored snapshot first
    const stored = await getLatestScore(clientId);
    if (stored) return res.json({ score: stored, source: "cached" });

    // Fallback: calculate live from agent states
    const [audit, keywords, geo, onpage, technical] = await Promise.all([
      getState(clientId, "A2_audit"),
      getState(clientId, "A3_keywords"),
      getState(clientId, "A8_geo"),
      getState(clientId, "A6_onpage"),
      getState(clientId, "A7_technical"),
    ]);
    const score = calculateScore(audit, keywords, geo, onpage, technical);
    return res.json({ score, source: "live" });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// GET score history for chart (last 12)
router.get("/:clientId/score/history", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const history = await getScoreHistory(req.params.clientId, 12);
    return res.json({ history });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// GET growth forecast
router.get("/:clientId/forecast", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const clientId = req.params.clientId;
    const [tasks, stored] = await Promise.all([
      getTopTasks(clientId, 5),
      getLatestScore(clientId),
    ]);
    const currentScore = stored?.overall || 0;
    const forecast = generateForecast(tasks, currentScore);
    return res.json({ forecast, currentScore });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────
// UNIFIED DASHBOARD ENDPOINT
// ────────────────────────────────────────────────────

router.get("/:clientId/dashboard", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const clientId = req.params.clientId;

    // Run all queries independently so one failure doesn't crash the whole dashboard
    const [tasks, scoreHistory, brief, audit, report, alertsSnap, keywords, llmVisDoc] = await Promise.all([
      getTopTasks(clientId, 5).catch(() => []),
      getScoreHistory(clientId, 12).catch(() => []),
      getState(clientId, "A1_brief").catch(() => null),
      getState(clientId, "A2_audit").catch(() => null),
      getState(clientId, "A9_report").catch(() => null),
      // No composite index — fetch by clientId only, filter+sort client-side
      db.collection("alerts").where("clientId","==",clientId).limit(50).get().catch(() => null),
      getState(clientId, "A3_keywords").catch(() => null),
      // LLM Visibility snapshot (M9.2) — additive; null if not yet computed
      db.collection("llm_visibility").doc(clientId).get().catch(() => null),
    ]);

    // Filter resolved + sort by date client-side (no composite index needed)
    const alerts = (alertsSnap?.docs || [])
      .map(d => {
        const a = d.data();
        const translated = translateAlert(a.message, a.type);
        return { id: d.id, ...a, ...translated, severityLabel: SEVERITY_LABELS[translated.severity] || SEVERITY_LABELS.info };
      })
      .filter(a => !a.resolved)
      .sort((a, b) => ((b.createdAt?._seconds || b.createdAt?.seconds || 0) - (a.createdAt?._seconds || a.createdAt?.seconds || 0)))
      .slice(0, 10);

    // If no stored score, calculate live from state
    let latestScore = scoreHistory.length ? scoreHistory[scoreHistory.length - 1] : null;
    if (!latestScore && audit) {
      try {
        const [geo, onpage, technical] = await Promise.all([
          getState(clientId, "A8_geo").catch(() => null),
          getState(clientId, "A6_onpage").catch(() => null),
          getState(clientId, "A7_technical").catch(() => null),
        ]);
        latestScore = calculateScore(audit, keywords, geo, onpage, technical);
        // Save it so next time it's cached
        await saveScoreHistory(clientId, { ...latestScore }).catch(() => {});
        await db.collection("clients").doc(clientId).update({ seoScore: latestScore.overall }).catch(() => {});
      } catch { /* noop */ }
    }

    const forecast = generateForecast(tasks, latestScore?.overall || 0);

    return res.json({
      brief:        brief ? { businessName: brief.businessName, websiteUrl: brief.websiteUrl, goals: brief.goals } : null,
      score:        latestScore,
      scoreHistory,
      forecast,
      topTasks:     tasks,
      alerts,
      auditSummary: audit ? {
        healthScore: audit.healthScore,
        p1: (audit.issues?.p1||[]).length,
        p2: (audit.issues?.p2||[]).length,
        p3: (audit.issues?.p3||[]).length,
        pagesCrawled: audit.checks?.pagesCrawled || 1,
      } : null,
      keywordSummary: keywords ? {
        total: keywords.totalKeywords || 0,
        gaps:  (keywords.gaps||[]).length,
        highPriority: (keywords.keywordMap||[]).filter(k=>k.priority==="high").length,
      } : null,
      reportReady: !!report,
      // ── LLM Visibility summary (M9.2) — additive, backward compatible ──
      llmVisibility: (llmVisDoc && llmVisDoc.exists) ? (() => {
        const v = llmVisDoc.data();
        return {
          visibilityScore: v.visibilityScore,
          grade:           v.grade,
          trend:           v.trend || null,
          topRecommendation: v.recommendations?.[0]?.action || null,
        };
      })() : null,
    });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ── GET Page-Level SEO breakdown from A2 audit ─────
router.get("/:clientId/pages", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const clientId = req.params.clientId;

    const [audit, keywords] = await Promise.all([
      getState(clientId, "A2_audit"),
      getState(clientId, "A3_keywords"),
    ]);

    if (!audit) return res.json({ pages: [] });

    // Global issue list (for homepage entry)
    const allIssues = [
      ...(audit.issues?.p1||[]).map(i => ({ ...i, severity:"critical" })),
      ...(audit.issues?.p2||[]).map(i => ({ ...i, severity:"warning" })),
      ...(audit.issues?.p3||[]).map(i => ({ ...i, severity:"info"     })),
    ];

    // ── Load per-page data from subcollection (pageAudits is deleted from shared_state doc before save)
    let pageAudits = [];
    try {
      const subSnap = await db.collection("audits").doc(req.params.clientId).collection("pages").get();
      pageAudits = subSnap.docs.map(d => d.data());
    } catch { /* fallback to empty — handled below */ }

    // Homepage as separate entry with its own on-page data
    const homepage = {
      url:             audit.checks?.finalUrl || "",
      title:           audit.checks?.title?.value || "",
      titleLength:     audit.checks?.title?.length || 0,
      metaDescription: audit.checks?.metaDescription?.value || "",
      hasH1:           (audit.checks?.h1?.count || 0) >= 1,
      hasMeta:         !!audit.checks?.metaDescription?.exists,
      hasCanonical:    !!audit.checks?.canonical?.exists,
      wordCount:       audit.checks?.wordCount || 0,
      altMissing:      audit.checks?.altTextAudit?.missingAlt || 0,
      isHomepage:      true,
      crawlDepth:      0,
    };

    // Combine: homepage first + inner pages, deduplicate
    let allPages = [homepage, ...pageAudits].filter((p, i, arr) =>
      p.url && arr.findIndex(x => x.url === p.url) === i
    );

    // Fallback for old data without pageAudits
    if (allPages.length <= 1) {
      const fallback = (audit?.pages || []).slice(0, 30).map(p => ({
        url: typeof p === "string" ? p : p.url,
        title: "", hasH1: false, hasMeta: false, hasCanonical: false,
      }));
      allPages = [homepage, ...fallback];
    }

    // Map keywords to page paths
    const kwMap = {};
    (keywords?.keywordMap || []).forEach(k => {
      if (k.suggestedPage) {
        if (!kwMap[k.suggestedPage]) kwMap[k.suggestedPage] = [];
        kwMap[k.suggestedPage].push(k);
      }
    });

    // Score each page from actual on-page signals (not from global issue list)
    const pages = allPages.slice(0, 50).map(page => {
      let urlPath = "/";
      try { urlPath = page.url ? new URL(page.url).pathname : "/"; } catch { urlPath = page.url || "/"; }

      let score = 100;
      const pg_issues = [];

      if (!page.title || page.title === "(missing)" || page.title === "") {
        score -= 20;
        pg_issues.push({ type:"missing_title",      label:"No title tag",                        severity:"critical" });
      } else if ((page.titleLength||0) > 60) {
        score -= 5;
        pg_issues.push({ type:"long_title",         label:`Title too long (${page.titleLength} chars)`, severity:"warning" });
      }
      if (!page.hasMeta && !page.metaDescription) {
        score -= 15;
        pg_issues.push({ type:"missing_meta",       label:"No meta description",                 severity:"warning" });
      }
      if (!page.hasH1) {
        score -= 15;
        pg_issues.push({ type:"missing_h1",         label:"No H1 tag",                           severity:"warning" });
      }
      if (!page.hasCanonical) {
        score -= 8;
        pg_issues.push({ type:"missing_canonical",  label:"No canonical tag",                    severity:"info"    });
      }
      if ((page.wordCount||0) > 0 && page.wordCount < 300) {
        score -= 15;
        pg_issues.push({ type:"thin_content",       label:`Thin content (${page.wordCount} words)`, severity:"warning" });
      }
      if ((page.altMissing||0) > 0) {
        score -= 5;
        pg_issues.push({ type:"missing_alt",        label:`${page.altMissing} images missing alt`, severity:"info"  });
      }

      // For homepage: merge global site-level issues (sitemap, robots, redirect chains etc.)
      // For inner pages: merge A2's full per-page issues (schema, dup titles, CWV notes etc.)
      let mergedIssues;
      if (page.isHomepage) {
        mergedIssues = [...pg_issues, ...allIssues.filter(i => !pg_issues.find(p => p.type === i.type)).slice(0, 8)];
      } else {
        // page.issues comes from A2 auditPage() — has detail + fix fields
        const a2Issues = (page.issues || []).filter(i => !pg_issues.find(p => p.type === i.type));
        mergedIssues = [...pg_issues, ...a2Issues];
      }

      score = Math.max(0, Math.min(100, score));

      return {
        url:             page.url,
        path:            urlPath,
        title:           (page.title && page.title !== "(missing)") ? page.title : null,
        titleLength:     page.titleLength || 0,
        metaDescription: page.metaDescription || null,
        h1:              page.h1 || null,
        score,
        issues:          mergedIssues,
        issueCount:      mergedIssues.length,
        targetKeywords:  kwMap[urlPath] || [],
        hasTitle:        !!(page.title && page.title !== "(missing)"),
        hasMeta:         !!(page.hasMeta || page.metaDescription),
        hasH1:           !!page.hasH1,
        hasCanonical:    !!page.hasCanonical,
        wordCount:       page.wordCount || 0,
        altMissing:      page.altMissing || 0,
        responseTime:    page.responseTime || null,
        statusCode:      page.statusCode || 200,
        crawlDepth:      page.crawlDepth || (page.isHomepage ? 0 : 1),
        isHomepage:      !!page.isHomepage,
      };
    });

    return res.json({ pages: pages.sort((a, b) => a.score - b.score) });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────
// SPRINT 3 — Keyword → Lead Attribution
// ────────────────────────────────────────────────────

router.get("/:clientId/attribution", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const clientId = req.params.clientId;

    const [brief, keywords, report] = await Promise.all([
      getState(clientId, "A1_brief"),
      getState(clientId, "A3_keywords"),
      getState(clientId, "A9_report"),
    ]);

    if (!keywords) return res.json({ attribution: [], message: "Run keyword research first" });

    // Build keyword → estimated traffic → estimated leads chain

    // CTR curve by position
    const ctrByPos = p => p <= 1 ? 0.25 : p <= 3 ? 0.12 : p <= 5 ? 0.06 : p <= 10 ? 0.02 : 0.005;

    const allKw = Object.values(keywords.clusters || {}).flat().slice(0, 50);
    const convRate = 0.03; // 3% default — improved with GA4 data

    const attribution = allKw
      .filter(k => k.searchVolume || k.volume)
      .map(k => {
        const vol  = k.searchVolume || k.volume || 0;
        const pos  = k.currentPosition || k.difficulty || 15;
        const ctr  = ctrByPos(pos);
        const monthlyClicks = Math.round(vol * ctr);
        const estLeads = Math.round(monthlyClicks * convRate);
        return {
          keyword:       k.keyword,
          searchVolume:  vol,
          position:      pos,
          estimatedCtr:  (ctr * 100).toFixed(1) + "%",
          monthlyClicks,
          estimatedLeads: estLeads,
          kpiContribution: estLeads > 5 ? "high" : estLeads > 1 ? "medium" : "low",
        };
      })
      .sort((a, b) => b.estimatedLeads - a.estimatedLeads);

    const totalEstLeads = attribution.reduce((s, k) => s + k.estimatedLeads, 0);
    const avgOrderValue = parseFloat((brief?.avgOrderValue || "0").replace(/[^0-9.]/g, "")) || 0;

    return res.json({
      attribution: attribution.slice(0, 30),
      summary: {
        totalKeywords:    attribution.length,
        totalEstLeads,
        avgOrderValue,
        estimatedRevenue: avgOrderValue > 0 ? Math.round(totalEstLeads * avgOrderValue) : null,
        conversionRate:   (convRate * 100).toFixed(1) + "%",
        note:             "Estimates based on GSC CTR data + industry benchmarks. Connect GA4 for real conversion data.",
      },
    });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────
// SPRINT 3 — GTM Setup Guide Generator
// ────────────────────────────────────────────────────

router.get("/:clientId/gtm-guide", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const brief = await getState(req.params.clientId, "A1_brief");
    const kpis  = brief?.kpiSelection || ["Organic Traffic Growth"];

    const triggers = [];

    // Always include form submissions
    triggers.push({
      name:     "Form Submission",
      type:     "Trigger",
      config:   "Trigger Type: Form Submission\nEnable: All Forms\nFire On: Forms",
      ga4Event: "form_submit",
      useCase:  "Track lead form fills — primary conversion event",
    });

    // Phone clicks (if lead gen or local)
    if (kpis.some(k => k.includes("Lead") || k.includes("Local"))) {
      triggers.push({
        name:     "Phone Click",
        type:     "Trigger",
        config:   "Trigger Type: Click – Just Links\nThis trigger fires on: Some Link Clicks\nClick URL contains: tel:",
        ga4Event: "phone_click",
        useCase:  "Track phone calls from organic search — critical for lead gen",
      });
    }

    // WhatsApp clicks
    triggers.push({
      name:     "WhatsApp Click",
      type:     "Trigger",
      config:   "Trigger Type: Click – Just Links\nThis trigger fires on: Some Link Clicks\nClick URL contains: wa.me",
      ga4Event: "whatsapp_click",
      useCase:  "Track WhatsApp enquiries — common mobile conversion",
    });

    // CTA button clicks
    triggers.push({
      name:     "CTA Button Click",
      type:     "Trigger",
      config:   "Trigger Type: All Elements\nThis trigger fires on: Some Clicks\nClick Text contains: Get Quote, Book Now, Contact Us, Buy Now (adjust to your CTAs)",
      ga4Event: "cta_click",
      useCase:  "Track primary CTA buttons — shows intent without form fill",
    });

    // E-commerce
    if (kpis.some(k => k.includes("Sales") || k.includes("E-commerce"))) {
      triggers.push({
        name:     "Purchase / Thank You Page",
        type:     "Trigger",
        config:   "Trigger Type: Page View\nThis trigger fires on: Some Page Views\nPage URL contains: /thank-you, /order-confirmation, /checkout/complete",
        ga4Event: "purchase",
        useCase:  "Track completed sales — required for ROI calculation",
      });
    }

    // Scroll depth
    triggers.push({
      name:     "Scroll Depth (75%)",
      type:     "Trigger (Built-in)",
      config:   "Enable Scroll Depth in GA4 Enhanced Measurement — no GTM needed",
      ga4Event: "scroll",
      useCase:  "Measure content engagement — identifies high-value pages",
    });

    const guide = {
      clientName:  brief?.businessName,
      websiteUrl:  brief?.websiteUrl,
      kpis,
      gtmSteps: [
        "Create GTM account at tagmanager.google.com",
        "Install GTM snippet in <head> and <body> of website",
        "Create GA4 Configuration Tag: Tag Type = Google Analytics: GA4 Configuration. Add your Measurement ID.",
        "Create event tags below, each firing on the corresponding trigger",
        "Test in Preview mode before publishing",
        "Publish container when all events verified in GA4 DebugView",
      ],
      triggers,
      conversionEvents: triggers.filter(t => ["form_submit","phone_click","purchase"].includes(t.ga4Event)).map(t => ({
        event: t.ga4Event,
        markAsConversion: true,
        ga4Path: "GA4 → Admin → Events → Mark as conversion",
      })),
    };

    return res.json({ guide });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

module.exports = router;
