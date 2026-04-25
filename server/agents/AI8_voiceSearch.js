/**
 * AI8 — Voice Search Optimization
 *
 * Optimises for conversational/question queries, featured snippets,
 * and voice assistant answers. Voice is 20-25% of all searches.
 *
 * Method:
 *  1. Extract question-form keywords from A3 + GSC
 *  2. Check if site has FAQ schema (A6 on-page data)
 *  3. Check for featured snippet eligibility (position 2-5, question queries)
 *  4. LLM: generate concise voice-answer-ready FAQ content
 */
const { getState, saveState } = require("../shared-state/stateManager");
const { callLLM, parseJSON }  = require("../utils/llm");

const QUESTION_WORDS = /^(how|what|where|when|why|who|which|can|do|does|is|are|will|should|best)\b/i;

async function runAI8(clientId, keys) {
  try {
    const brief    = await getState(clientId, "A1_brief");
    const keywords = await getState(clientId, "A3_keywords");
    const rankings = await getState(clientId, "A10_rankings");
    const onpage   = await getState(clientId, "A6_onpage");

    if (!brief?.websiteUrl) return { success: false, error: "A1 brief not found" };

    // ── Find question keywords ─────────────────────────────────────────────
    const allKeywords = [
      ...(keywords?.keywordMap || []).map(k => ({ keyword: k.keyword, source: "a3", priority: k.priority })),
      ...(rankings?.rankings   || []).map(r => ({ keyword: r.keyword, source: "gsc", clicks: r.clicks, position: r.position })),
    ];

    const questionKeywords = allKeywords.filter(k => QUESTION_WORDS.test(k.keyword?.trim() || ""));
    const uniqueQuestions  = [...new Map(questionKeywords.map(k => [k.keyword.toLowerCase(), k])).values()];

    // ── Featured snippet opportunities: ranked 2-10 for a question query ──
    const snippetOpportunities = (rankings?.rankings || []).filter(r =>
      QUESTION_WORDS.test(r.keyword || "") &&
      r.position >= 2 && r.position <= 10 &&
      (r.clicks || 0) > 0
    ).slice(0, 10);

    // ── Check existing FAQ schema on site ─────────────────────────────────
    const hasFaqSchema   = (onpage?.recommendations || []).some(r =>
      (r.type || "").includes("faq") || (r.description || "").toLowerCase().includes("faq")
    );
    const faqSchemaPages = (onpage?.pages || []).filter(p =>
      (p.schema || []).includes("FAQPage") || (p.hasFaq === true)
    ).length;

    // ── LLM: generate voice-optimised FAQ content ─────────────────────────
    let voiceContent = {};
    if ((keys?.groq || keys?.gemini)) {
      try {
        const topQuestions = uniqueQuestions.slice(0, 10).map(k => k.keyword);
        const prompt = `You are a voice search SEO expert. Optimise for Google Voice, Siri, Alexa.

Client: ${brief.businessName}
Website: ${brief.websiteUrl}
Services: ${[].concat(brief.services || []).join(", ")}

Question-form keywords people ask about this business:
${topQuestions.join("\n")}

Featured snippet opportunities (currently ranking 2-10):
${snippetOpportunities.slice(0, 5).map(r =>
  `- "${r.keyword}" at position ${r.position} — this page could win the snippet`
).join("\n") || "none identified"}

For voice search:
1. Answers should be 40-60 words (Google reads this length for voice)
2. Start with a direct answer, then expand
3. Use simple language — voice users want quick answers

Return ONLY valid JSON:
{
  "faqItems": [
    {
      "question": "exact question from search",
      "voiceAnswer": "40-60 word conversational answer",
      "targetPage": "/page-slug to add this FAQ to",
      "schemaReady": true,
      "snippetPotential": "high|medium|low"
    }
  ],
  "snippetStrategies": [
    {
      "keyword": "question keyword",
      "currentPosition": 3,
      "action": "what to change on the page to win the snippet",
      "format": "paragraph|list|table"
    }
  ],
  "voiceScore": 0-100,
  "quickWins": ["action1", "action2"]
}`;

        const response = await callLLM(prompt, keys, { maxTokens: 1500, temperature: 0.3, clientId });
        voiceContent   = parseJSON(response) || {};
      } catch { /* non-blocking */ }
    }

    const result = {
      success:              true,
      scannedAt:            new Date().toISOString(),
      questionKeywords:     uniqueQuestions.slice(0, 30),
      questionKeywordCount: uniqueQuestions.length,
      snippetOpportunities,
      hasFaqSchema,
      faqSchemaPages,
      faqItems:             voiceContent.faqItems          || [],
      snippetStrategies:    voiceContent.snippetStrategies || [],
      voiceScore:           voiceContent.voiceScore        || (hasFaqSchema ? 40 : 20),
      quickWins:            voiceContent.quickWins         || [],
    };

    await saveState(clientId, "AI8_voiceSearch", result);
    return result;

  } catch (e) {
    console.error(`[AI8] Voice search scan failed for ${clientId}:`, e.message);
    return { success: false, error: e.message };
  }
}

module.exports = { runAI8 };
