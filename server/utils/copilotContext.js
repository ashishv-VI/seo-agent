/**
 * copilotContext.js — SEO Copilot context aggregator (M9.5).
 *
 * Collects ONLY existing data into one normalized object for the Copilot engine.
 * Reuses the existing buildChatContext() (business/pipeline/seo/report from
 * A1–A9) as the base and augments it with the M9.2–M9.4 product surfaces
 * (LLM Visibility, Answer Optimization, Task Center) + score/forecast +
 * notifications + health. It does NOT re-query the A1–A9 states that
 * buildChatContext already loads — those are reused, not duplicated.
 *
 * No LLM calls here. No recommendation logic (that lives in the existing
 * engines). Pure aggregation over existing helpers + collections.
 */
const { db } = require("../config/firebase");
const { buildChatContext } = require("../agents/chatContext");
const { getLatestScore } = require("./scoreCalculator");

async function buildCopilotContext(clientId) {
  // ── Base context (reuses existing A1–A9 aggregation) ──
  const base = await buildChatContext(clientId).catch(() => ({}));

  // ── Augment with product surfaces already persisted by M9.2–M9.4 + score ──
  const [scoreObj, llmVisDoc, answerOptDoc, taskCenterDoc, clientDoc] = await Promise.all([
    getLatestScore(clientId).catch(() => null),
    db.collection("llm_visibility").doc(clientId).get().catch(() => null),
    db.collection("answer_optimization").doc(clientId).get().catch(() => null),
    db.collection("task_center").doc(clientId).get().catch(() => null),
    db.collection("clients").doc(clientId).get().catch(() => null),
  ]);

  // Notifications: fetch by clientId (unread, recent).
  let notifications = [];
  try {
    const nSnap = await db.collection("notifications").where("clientId", "==", clientId).limit(20).get();
    notifications = (nSnap.docs || [])
      .map(d => d.data())
      .filter(n => !n.read)
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .slice(0, 5)
      .map(n => ({ type: n.type, title: n.title || n.message, at: n.createdAt }));
  } catch { /* best-effort */ }

  const client = clientDoc?.exists ? clientDoc.data() : {};

  const llmVis = llmVisDoc?.exists ? llmVisDoc.data() : null;
  const answerOpt = answerOptDoc?.exists ? answerOptDoc.data() : null;
  const taskCenter = taskCenterDoc?.exists ? (taskCenterDoc.data().summary || null) : null;

  // ── Health status (mirror of what /health cares about, at client level) ──
  const health = {
    pipelineStatus: client.pipelineStatus || "idle",
    pipelineError:  client.pipelineError || null,
    lastCompleted:  client.pipelineCompletedAt || null,
    seoScore:       client.seoScore ?? scoreObj?.overall ?? null,
  };

  return {
    business:  base.business || null,
    pipeline:  base.pipeline || null,
    seo:       base.seo || null,
    report:    base.report || null,
    score:     scoreObj ? { overall: scoreObj.overall, breakdown: scoreObj.breakdown || null } : null,
    forecast:  client.forecast || null,
    llmVisibility: llmVis ? {
      visibilityScore: llmVis.visibilityScore, grade: llmVis.grade,
      shareOfVoice: llmVis.shareOfVoice, citationRate: llmVis.citationRate,
      topRecommendation: llmVis.recommendations?.[0]?.action || null,
    } : null,
    answerOptimization: answerOpt ? {
      optimizationScore: answerOpt.optimizationScore, grade: answerOpt.grade,
      criticalCount: answerOpt.criticalCount,
      topOpportunities: (answerOpt.opportunities || []).slice(0, 3).map(o => ({ category: o.category, title: o.title, priority: o.priority })),
    } : null,
    tasks: taskCenter ? {
      total: taskCenter.total, open: taskCenter.open,
      critical: taskCenter.criticalTasks, quickWins: taskCenter.quickWins,
      completionRate: taskCenter.completionRate,
    } : null,
    notifications,
    health,
  };
}

// Compact the context into a token-efficient string for the LLM prompt.
function contextToPrompt(ctx) {
  const b = ctx.business || {};
  const seo = ctx.seo || {};
  const lines = [];
  lines.push(`BUSINESS: ${b.name || "Unknown"} | ${b.website || ""} | industry: ${b.industry || "?"} | location: ${b.location || "?"}`);
  if (ctx.health) lines.push(`PIPELINE: ${ctx.health.pipelineStatus}${ctx.health.pipelineError ? " (error: " + ctx.health.pipelineError + ")" : ""} | SEO score: ${ctx.health.seoScore ?? "?"}`);
  lines.push(`SEO HEALTH: score ${seo.healthScore ?? "?"} | P1 ${seo.p1Count ?? 0}, P2 ${seo.p2Count ?? 0}, P3 ${seo.p3Count ?? 0}`);
  if (seo.p1Issues?.length) lines.push(`TOP ISSUES: ${seo.p1Issues.join("; ")}`);
  if (seo.topKeywords?.length) lines.push(`KEYWORDS: ${seo.topKeywords.join("; ")}`);
  if (seo.contentGaps?.length) lines.push(`CONTENT GAPS: ${seo.contentGaps.join(", ")}`);
  if (ctx.llmVisibility) lines.push(`LLM VISIBILITY: ${ctx.llmVisibility.visibilityScore}/100 (${ctx.llmVisibility.grade}) | share-of-voice ${ctx.llmVisibility.shareOfVoice}% | citation rate ${ctx.llmVisibility.citationRate}%`);
  if (ctx.answerOptimization) lines.push(`ANSWER OPTIMIZATION: score ${ctx.answerOptimization.optimizationScore} (${ctx.answerOptimization.grade}), ${ctx.answerOptimization.criticalCount} critical. Top: ${(ctx.answerOptimization.topOpportunities || []).map(o => o.title).join("; ")}`);
  if (ctx.tasks) lines.push(`TASKS: ${ctx.tasks.open}/${ctx.tasks.total} open, ${ctx.tasks.critical} critical, ${ctx.tasks.quickWins} quick wins, ${ctx.tasks.completionRate}% done`);
  if (ctx.report?.verdict) lines.push(`LATEST REPORT VERDICT: ${ctx.report.verdict}`);
  if (ctx.report?.next3Actions?.length) lines.push(`RECOMMENDED NEXT ACTIONS: ${ctx.report.next3Actions.join("; ")}`);
  if (ctx.notifications?.length) lines.push(`RECENT ALERTS: ${ctx.notifications.map(n => n.title).join("; ")}`);
  return lines.join("\n");
}

module.exports = { buildCopilotContext, contextToPrompt };
