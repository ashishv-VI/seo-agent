const express    = require("express");
const router     = express.Router();
const { db }     = require("../config/firebase");
const { verifyToken }   = require("../middleware/auth");
const { getUserKeys }   = require("../utils/getUserKeys");
const { callLLM }       = require("../utils/llm");
const { buildChatContext } = require("../agents/chatContext");

// POST /api/chat/general — no client context, expert SEO consultant
router.post("/general", verifyToken, async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message) return res.status(400).json({ error: "Message required" });

    const keys = await getUserKeys(req.uid);

    const systemPrompt = `You are an expert SEO consultant with 15+ years of experience working with digital marketing agencies.

You help with:
- Technical SEO: Core Web Vitals, crawlability, site speed, indexing, schema markup, JSON-LD
- Keyword strategy: research, clustering, content gaps, cannibalization, intent mapping
- On-page SEO: title tags, meta descriptions, heading structure, internal linking
- Off-page SEO: backlinks, Google Business Profile, local citations, reviews
- Analytics: Google Search Console, GA4, rank tracking, SEO scoring

PLATFORM TOOLS AVAILABLE (suggest these when relevant):
- "Backlink Analyzer" — analyze backlink profiles
- "Rank Tracker" — track keyword positions
- "Competitor Gap" — find competitor keyword gaps
- "Site Audit" — full technical audit
- "SERP Simulator" — preview search result snippets
- "Meta Previewer" — preview title/meta in search
- "AI Writer" — generate SEO content
- "AEO Optimizer" — optimize for AI/answer engines
- "Sitemap Generator" — create XML sitemaps
- "Content Calendar" — plan content schedule

INSTRUCTIONS:
1. Always respond in professional English regardless of what language user writes
2. Be specific and actionable — give exact steps, not generic advice
3. When writing code (JSON-LD, meta tags, etc.) use markdown code blocks
4. Format lists with bullet points
5. Reference specific tools from the platform when relevant
6. At the end of EVERY response, add exactly 3 follow-up suggestions in this format:
[FOLLOWUPS:["question 1?","question 2?","question 3?"]]`;

    const historyStr = history.slice(-6)
      .map(h => `${h.role === "user" ? "User" : "Assistant"}: ${h.content}`)
      .join("\n");
    const fullPrompt = historyStr ? `${historyStr}\nUser: ${message}` : message;

    const raw = await callLLM(fullPrompt, keys, { systemPrompt, maxTokens: 1000, temperature: 0.4 });

    let response = raw;
    let followUps = [];

    // Extract follow-up questions
    const fuMatch = raw.match(/\[FOLLOWUPS:\[([^\]]*(?:"[^"]*"[^\]]*)*)\]\]/);
    if (fuMatch) {
      try { followUps = JSON.parse(`[${fuMatch[1]}]`); } catch {
        try { followUps = JSON.parse(fuMatch[0].replace("[FOLLOWUPS:", "").replace("]", "")); } catch {}
      }
      response = raw.replace(/\[FOLLOWUPS:.*?\]\]?/s, "").trim();
    }

    return res.json({ response, followUps });
  } catch (e) {
    console.error("[chat/general]", e.message);
    return res.status(500).json({ error: e.message });
  }
});

function buildSystemPrompt(ctx) {
  return `You are an expert SEO consultant and AI assistant for an SEO agency platform. You are direct, practical, and always back recommendations with data.

CLIENT DATA:
- Business: ${ctx.business.name}
- Website: ${ctx.business.website}
- Industry: ${ctx.business.industry}
- Location: ${ctx.business.location}
- Services: ${ctx.business.services}

CURRENT SEO STATUS:
- Health Score: ${ctx.seo.healthScore}/100
- Pipeline: ${ctx.pipeline.status}
- Critical Issues (P1): ${ctx.seo.p1Count}
- Important Issues (P2): ${ctx.seo.p2Count}
- Minor Issues (P3): ${ctx.seo.p3Count}
- Broken Links: ${ctx.seo.brokenLinks}
- Fix Queue: ${ctx.seo.fixQueueCount} items

TOP CRITICAL ISSUES:
${ctx.seo.p1Issues.map((i,n) => `${n+1}. ${i}`).join("\n") || "None identified yet"}

KEYWORDS:
${ctx.seo.topKeywords.join("\n") || "Pipeline not run yet"}

CONTENT GAPS:
${ctx.seo.contentGaps.join(", ") || "None identified"}

TITLE TAG: ${ctx.seo.titleTag}
META DESCRIPTION: ${ctx.seo.metaDesc}

IMMEDIATE ACTIONS:
${ctx.report.next3Actions.join("\n") || "Run pipeline first to get recommendations"}

AI VERDICT: ${ctx.report.verdict || "Pipeline has not been run yet"}

INSTRUCTIONS:
1. Always respond in professional English regardless of what language the user writes in
2. Always reference actual client data — never give generic answers
3. Be concise and actionable — like a senior SEO consultant
4. Format with bullet points when listing multiple items
5. If user asks to run pipeline, respond with [ACTION:run_pipeline] at the very end
6. If user asks to generate a fix, respond with [ACTION:generate_fix] at the very end
7. If health score is 0 or pipeline is idle, tell user to run pipeline first
8. At the end of EVERY response, add 3 follow-up question suggestions:
[FOLLOWUPS:["q1?","q2?","q3?"]]`;
}

router.post("/:clientId/chat", verifyToken, async (req, res) => {
  try {
    const clientDoc = await db.collection("clients").doc(req.params.clientId).get();
    if (!clientDoc.exists)                      return res.status(404).json({ error: "Client not found" });
    if (clientDoc.data().ownerId !== req.uid)   return res.status(403).json({ error: "Access denied" });

    const { message, history = [] } = req.body;
    if (!message) return res.status(400).json({ error: "Message required" });

    const keys = await getUserKeys(req.uid);
    const ctx  = await buildChatContext(req.params.clientId);
    const systemPrompt = buildSystemPrompt(ctx);

    // Build conversation string from history (last 6 turns)
    const historyStr = history.slice(-6)
      .map(h => `${h.role === "user" ? "User" : "Assistant"}: ${h.content}`)
      .join("\n");
    const fullPrompt = historyStr ? `${historyStr}\nUser: ${message}` : message;

    const raw = await callLLM(fullPrompt, keys, { systemPrompt, maxTokens: 800, temperature: 0.5 });

    let followUps = [];
    const fuMatch = raw.match(/\[FOLLOWUPS:\[([^\]]*(?:"[^"]*"[^\]]*)*)\]\]/);
    if (fuMatch) {
      try { followUps = JSON.parse(`[${fuMatch[1]}]`); } catch {}
      // don't strip from raw yet — action parsing happens on raw
    }

    // Parse action tag
    let action = null;
    let response = raw;
    const match = raw.match(/\[ACTION:([^\]]+)\]/);
    if (match) {
      const parts = match[1].split(":");
      action   = { type: parts[0], params: parts.slice(1) };
      response = raw.replace(/\[ACTION:[^\]]+\]/g, "").trim();
    }

    // Strip follow-up tag from response
    response = response.replace(/\[FOLLOWUPS:.*?\]\]?/s, "").trim();

    // Execute action
    if (action?.type === "run_pipeline") {
      try {
        const { runFullPipeline }  = require("../agents/A0_orchestrator");
        const { getUserKeys: gk }  = require("../utils/getUserKeys");
        await db.collection("clients").doc(req.params.clientId).update({
          pipelineStatus: "running",
          "agents.A2": "pending","agents.A3": "pending","agents.A4": "pending",
          "agents.A5": "pending","agents.A6": "pending","agents.A7": "pending",
          "agents.A8": "pending","agents.A9": "pending",
        });
        runFullPipeline(req.params.clientId, keys).catch(e => console.error("[chat pipeline]", e.message));
      } catch (e) { console.error("[chat run_pipeline]", e.message); }
    }

    return res.json({
      response,
      action,
      followUps,
      meta: { healthScore: ctx.seo.healthScore, pipelineStatus: ctx.pipeline.status },
    });
  } catch (e) {
    console.error("[chat route]", e.message);
    return res.status(500).json({ error: e.message || "Chat failed" });
  }
});

module.exports = router;
