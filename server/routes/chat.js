const express    = require("express");
const router     = express.Router();
const { db }     = require("../config/firebase");
const { verifyToken }   = require("../middleware/auth");
const { getUserKeys }   = require("../utils/getUserKeys");
const { callLLM }       = require("../utils/llm");
const { buildChatContext } = require("../agents/chatContext");

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
1. Respond in the same language the user writes (Hindi/English/Hinglish all fine)
2. Always reference actual client data — never give generic answers
3. Be concise and actionable — like a senior consultant
4. Format with bullet points when listing multiple items
5. If user asks to run pipeline, respond with [ACTION:run_pipeline] at the very end
6. If user asks to generate a fix, respond with [ACTION:generate_fix] at the very end
7. If health score is 0 or pipeline is idle, tell user to run pipeline first`;
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

    // Parse action tag
    let action = null;
    let response = raw;
    const match = raw.match(/\[ACTION:([^\]]+)\]/);
    if (match) {
      const parts = match[1].split(":");
      action   = { type: parts[0], params: parts.slice(1) };
      response = raw.replace(/\[ACTION:[^\]]+\]/g, "").trim();
    }

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
      meta: { healthScore: ctx.seo.healthScore, pipelineStatus: ctx.pipeline.status },
    });
  } catch (e) {
    console.error("[chat route]", e.message);
    return res.status(500).json({ error: e.message || "Chat failed" });
  }
});

module.exports = router;
