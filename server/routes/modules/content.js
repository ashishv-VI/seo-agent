/**
 * Content routes — extracted from routes/agents.js (Sprint 1, Story M6.13).
 *
 * Mounted by agents.js under the same base path (/api/agents), so the public
 * endpoints are unchanged:
 *   GET   /api/agents/:clientId/content-briefs                — content briefs from A5/A3/A4 state
 *   GET   /api/agents/:clientId/content-drafts                — A14 draft list
 *   POST  /api/agents/:clientId/content-drafts/:draftId/publish — mark a draft published (status only)
 *   POST  /api/agents/:clientId/content-calendar/generate     — LLM 30-day content calendar
 *   GET   /api/agents/:clientId/content-calendar/results      — read the stored calendar
 *   PATCH /api/agents/:clientId/content-calendar/:itemId/status — update a calendar item's status
 *
 * Routes moved verbatim, in original file order. Middleware (verifyToken),
 * ownership (getClientDoc), state reads, inline A14 / LLM requires, the LLM
 * prompt, the rule-based fallback, validation, status codes, error messages, and
 * response formats are identical to the originals. `publish` records a status via
 * A14's markDraftPublished (no WordPress internals); calendar generation uses an
 * inline callLLM (no agent runner).
 */
const express       = require("express");
const router        = express.Router();
const { db }        = require("../../config/firebase");
const { verifyToken } = require("../../middleware/auth");
const { getUserKeys } = require("../../utils/getUserKeys");
const { getState }    = require("../../shared-state/stateManager");
const { getClientDoc } = require("../shared/clientOwnership");

router.get("/:clientId/content-briefs", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const clientId = req.params.clientId;
    const [content, keywords, competitor] = await Promise.all([
      getState(clientId, "A5_content"),
      getState(clientId, "A3_keywords"),
      getState(clientId, "A4_competitor"),
    ]);

    if (!content) return res.json({ briefs: [] });

    // Extract content briefs from A5 data
    const gaps    = keywords?.gaps || [];
    const compGap = competitor?.analysis?.contentGaps || [];
    const briefs  = [
      ...(content?.contentBriefs || []),
      ...gaps.slice(0, 3).map(g => ({
        title:       g.keyword || g.topic,
        type:        "new_page",
        priority:    "high",
        reason:      g.reason || "Content gap identified",
        targetKws:   [g.keyword],
        wordCount:   800,
        sections:    ["Introduction", "Main content", "FAQ", "Conclusion"],
      })),
      ...compGap.slice(0, 3).map(g => ({
        title:       g.topic,
        type:        "competitor_gap",
        priority:    "medium",
        reason:      `Competitor ranking for "${g.topic}" — you're not`,
        targetKws:   [],
        wordCount:   1200,
        sections:    ["Introduction", g.topic, "How it works", "Why choose us", "FAQ"],
      })),
    ];

    return res.json({ briefs });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// GET: Get content drafts for a client
router.get("/:clientId/content-drafts", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { getContentDrafts } = require("../../agents/A14_contentAutopilot");
    const drafts = await getContentDrafts(req.params.clientId);
    return res.json({ drafts, total: drafts.length });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// POST: Mark a content draft as published
router.post("/:clientId/content-drafts/:draftId/publish", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { markDraftPublished } = require("../../agents/A14_contentAutopilot");
    await markDraftPublished(req.params.draftId, req.body.wpPostId || null);
    return res.json({ message: "Draft marked as published" });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

router.post("/:clientId/content-calendar/generate", verifyToken, async (req, res) => {
  try {
    const { clientId } = req.params;
    await getClientDoc(clientId, req.uid);

    const keys      = await getUserKeys(req.uid);
    const brief     = await getState(clientId, "A1_brief");
    const keywords  = await getState(clientId, "A3_keywords");
    const competitor = await getState(clientId, "A4_competitor");
    const content    = await getState(clientId, "A5_content");

    if (!brief?.websiteUrl) return res.status(400).json({ error: "Run A1 onboarding first" });
    if (!keywords?.keywordMap?.length) return res.status(400).json({ error: "Run A3 keywords first" });

    const { callLLM, parseJSON } = require("../../utils/llm");

    // Build input data for LLM
    const topKws     = (keywords.keywordMap || []).slice(0, 20).map(k => `${k.keyword} (priority: ${k.priority || "medium"})`);
    const gaps       = (competitor?.analysis?.contentGaps || keywords?.gaps || []).slice(0, 10);
    const published  = (content?.pages || []).map(p => p.topic || p.title).filter(Boolean).slice(0, 10);
    const aov        = Number(brief.avgOrderValue) || 0;
    const currency   = brief.currency === "GBP" ? "£" : brief.currency === "USD" ? "$" : "₹";

    const prompt = `You are a content strategist. Create a 30-day SEO content calendar.

Business: ${brief.businessName}
Website: ${brief.websiteUrl}
Industry: ${brief.businessType || brief.industry || "general"}
Goals: ${(brief.goals || brief.kpiSelection || []).join(", ")}
${aov > 0 ? `Average order value: ${currency}${aov} — prioritise content that attracts buyers not just visitors` : ""}

Top keywords to target:
${topKws.join("\n")}

Content gaps competitors rank for but we don't:
${gaps.length > 0 ? gaps.join("\n") : "None identified yet"}

Already published (avoid duplicates):
${published.length > 0 ? published.join("\n") : "Nothing yet"}

Create 12 content pieces spread across 30 days (roughly every 2-3 days).
Mix of: blog posts (long-form), how-to guides, listicles, comparison pages, local/service pages.

Return ONLY valid JSON:
{
  "calendar": [
    {
      "day": 1,
      "publishDate": "YYYY-MM-DD",
      "title": "exact article/page title",
      "keyword": "primary keyword to target",
      "format": "blog_post|how_to|listicle|comparison|service_page|local_page",
      "wordCountTarget": 1200,
      "outline": ["H2 section 1", "H2 section 2", "H2 section 3"],
      "intent": "informational|commercial|transactional|navigational",
      "expectedTraffic": "low|medium|high",
      "revenueAngle": "one sentence on how this drives leads or sales"
    }
  ],
  "strategy": "2-3 sentence overview of the calendar strategy and why this mix works"
}`;

    let calendarData;
    try {
      const raw = await callLLM(clientId, keys, prompt, { maxTokens: 3000, temperature: 0.4 });
      calendarData = parseJSON(raw);
    } catch (e) {
      // Rule-based fallback
      const now = new Date();
      calendarData = {
        calendar: topKws.slice(0, 12).map((kw, i) => {
          const d = new Date(now);
          d.setDate(d.getDate() + (i + 1) * 2 + 1);
          return {
            day: (i + 1) * 2 + 1,
            publishDate: d.toISOString().split("T")[0],
            title: `Complete Guide to ${kw.split(" (")[0]}`,
            keyword: kw.split(" (")[0],
            format: i % 3 === 0 ? "how_to" : i % 3 === 1 ? "blog_post" : "listicle",
            wordCountTarget: 1200,
            outline: ["Introduction", "What You Need to Know", "Step-by-Step Guide", "FAQ", "Conclusion"],
            intent: "informational",
            expectedTraffic: "medium",
            revenueAngle: "Educates potential buyers and drives inbound leads",
          };
        }),
        strategy: `Content calendar targeting ${topKws.length} keywords with a mix of how-to guides, blog posts, and listicles to capture different intent levels across the funnel.`,
      };
    }

    // Add status tracking fields
    const items = (calendarData.calendar || []).map((item, idx) => ({
      ...item,
      id:     `${clientId}_cal_${idx}`,
      status: "planned",
      createdAt: new Date().toISOString(),
    }));

    const result = {
      clientId,
      calendar: items,
      strategy: calendarData.strategy || "",
      generatedAt: new Date().toISOString(),
      totalItems:  items.length,
    };

    await db.collection("content_calendar").doc(clientId).set(result);
    return res.json({ success: true, ...result });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

router.get("/:clientId/content-calendar/results", verifyToken, async (req, res) => {
  try {
    const { clientId } = req.params;
    await getClientDoc(clientId, req.uid);
    const doc = await db.collection("content_calendar").doc(clientId).get();
    if (!doc.exists) return res.json({ notRun: true });
    return res.json(doc.data());
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

router.patch("/:clientId/content-calendar/:itemId/status", verifyToken, async (req, res) => {
  try {
    const { clientId, itemId } = req.params;
    const { status } = req.body;
    await getClientDoc(clientId, req.uid);
    if (!["planned", "in_progress", "written", "published"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    const doc = await db.collection("content_calendar").doc(clientId).get();
    if (!doc.exists) return res.status(404).json({ error: "Calendar not found" });
    const data = doc.data();
    const calendar = (data.calendar || []).map(item =>
      item.id === itemId ? { ...item, status, updatedAt: new Date().toISOString() } : item
    );
    await db.collection("content_calendar").doc(clientId).update({ calendar });
    return res.json({ success: true });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

module.exports = router;
