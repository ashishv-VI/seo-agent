/**
 * copilot.js — SEO Copilot conversation engine (M9.5).
 *
 * Answers a question using the aggregated client context + conversation history.
 * Reuses the existing LLM helper (callLLM + parseJSON) — introduces NO new LLM
 * abstraction. Does not re-implement any recommendation engine; it reasons over
 * the context object those engines already produced.
 *
 * askCopilot({ clientId, keys, question, context, history }) →
 *   { answer, confidence, citations, recommendedActions, relatedTasks,
 *     relatedPages, relatedReports, followUpQuestions, tokensEstimate }
 */
const { callLLM, parseJSON } = require("./llm");
const { contextToPrompt } = require("./copilotContext");
const { estimateTokens } = require("./costTracker");

const SYSTEM_PROMPT = `You are the SEO Copilot — an expert SEO strategist embedded in an AI SEO platform.
You answer questions about ONE client using the structured context provided.

Rules:
- Ground every answer in the provided context. If the context lacks the data, say so and suggest which scan/agent to run.
- Be specific and business-focused: name the page, keyword, issue, or metric. No generic SEO fluff.
- Prefer action over description. When you recommend something, make it concrete.
- Never invent numbers not present in the context.

Return STRICT JSON only, no preamble:
{
  "answer": "markdown answer to the user's question, grounded in context",
  "confidence": 0.0-1.0,
  "citations": ["short labels for the context sources you used, e.g. 'LLM Visibility', 'A2 Audit', 'Task Center'"],
  "recommendedActions": [{ "action": "specific next step", "priority": "high|medium|low" }],
  "relatedTasks": ["task titles from the Task/Answer-Optimization context that relate to this answer"],
  "relatedPages": ["page paths/URLs referenced, if any"],
  "relatedReports": ["report/section names referenced, if any"],
  "followUpQuestions": ["2-3 natural follow-up questions the user might ask next"]
}`;

function buildHistoryString(history = []) {
  return history.slice(-6)
    .map(m => `${m.role === "user" ? "User" : "Copilot"}: ${typeof m.content === "string" ? m.content : (m.answer || "")}`)
    .join("\n");
}

async function askCopilot({ clientId, keys, question, context, history = [] }) {
  const ctxStr = contextToPrompt(context || {});
  const histStr = buildHistoryString(history);

  const prompt = [
    `CLIENT CONTEXT:\n${ctxStr}`,
    histStr ? `\nCONVERSATION SO FAR:\n${histStr}` : "",
    `\nUSER QUESTION: ${question}`,
    `\nAnswer as the SEO Copilot in the strict JSON format specified.`,
  ].join("\n");

  // Reuse the existing LLM helper (returns a string) + parseJSON. No new wrapper.
  const raw = await callLLM(clientId, keys, prompt, {
    system: SYSTEM_PROMPT,
    maxTokens: 1200,
    temperature: 0.3,
  });

  let parsed = null;
  try { parsed = parseJSON(raw); } catch { /* fall back to raw text */ }

  const tokensEstimate = estimateTokens(prompt) + estimateTokens(raw || "");

  if (!parsed || typeof parsed.answer !== "string") {
    // Graceful fallback: return the raw text as the answer so the user still gets a reply.
    return {
      answer: (raw && String(raw).trim()) || "I couldn't generate an answer from the available context. Try running the pipeline or scans first.",
      confidence: 0.4,
      citations: [],
      recommendedActions: [],
      relatedTasks: [],
      relatedPages: [],
      relatedReports: [],
      followUpQuestions: [],
      tokensEstimate,
    };
  }

  return {
    answer:            parsed.answer,
    confidence:        typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.6,
    citations:         Array.isArray(parsed.citations) ? parsed.citations.slice(0, 8) : [],
    recommendedActions: Array.isArray(parsed.recommendedActions) ? parsed.recommendedActions.slice(0, 6) : [],
    relatedTasks:      Array.isArray(parsed.relatedTasks) ? parsed.relatedTasks.slice(0, 6) : [],
    relatedPages:      Array.isArray(parsed.relatedPages) ? parsed.relatedPages.slice(0, 6) : [],
    relatedReports:    Array.isArray(parsed.relatedReports) ? parsed.relatedReports.slice(0, 6) : [],
    followUpQuestions: Array.isArray(parsed.followUpQuestions) ? parsed.followUpQuestions.slice(0, 3) : [],
    tokensEstimate,
  };
}

module.exports = { askCopilot, SYSTEM_PROMPT };
