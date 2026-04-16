/**
 * Cost Tracker — tracks estimated LLM spend per client per month
 *
 * Why: the agent needs cost awareness to make economic decisions.
 * Without it, an autonomous agent can burn unlimited API spend on
 * low-value fixes.
 *
 * How: every callLLM() records token estimate + cost to Firestore
 * collection `llm_usage` keyed by clientId_YYYY-MM. Agents check
 * budget before expensive calls.
 */
const { db, FieldValue } = require("../config/firebase");

// Rough per-1M-token cost estimates (USD) — used for budget planning only.
// Actual cost depends on provider; these are conservative "worst case" values.
const PRICING = {
  groq:       { input: 0.05,  output: 0.08  }, // llama-3.1-8b-instant
  gemini:     { input: 0.10,  output: 0.40  }, // gemini-2.0-flash
  openrouter: { input: 0.00,  output: 0.00  }, // free tier model
};

// Default monthly budget per client (USD). Overridable per client via `clients/{id}.llmBudgetUsd`.
const DEFAULT_MONTHLY_BUDGET_USD = 5.00;

function getMonthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Rough token estimator: 1 token ≈ 4 chars of English text.
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(String(text).length / 4);
}

function calcCost(provider, inputTokens, outputTokens) {
  const p = PRICING[provider] || PRICING.groq;
  return ((inputTokens / 1e6) * p.input) + ((outputTokens / 1e6) * p.output);
}

/**
 * Record usage after an LLM call.
 * Non-blocking — failures must never break agent execution.
 */
async function recordUsage(clientId, provider, inputText, outputText) {
  if (!clientId) return; // skip tracking for system-level calls
  try {
    const inputTokens  = estimateTokens(inputText);
    const outputTokens = estimateTokens(outputText);
    const cost         = calcCost(provider, inputTokens, outputTokens);
    const monthKey     = getMonthKey();
    const docId        = `${clientId}_${monthKey}`;

    await db.collection("llm_usage").doc(docId).set({
      clientId,
      monthKey,
      totalInputTokens:  FieldValue.increment(inputTokens),
      totalOutputTokens: FieldValue.increment(outputTokens),
      totalCostUsd:      FieldValue.increment(cost),
      callCount:         FieldValue.increment(1),
      lastCallAt:        new Date().toISOString(),
      [`byProvider.${provider}.inputTokens`]:  FieldValue.increment(inputTokens),
      [`byProvider.${provider}.outputTokens`]: FieldValue.increment(outputTokens),
      [`byProvider.${provider}.costUsd`]:      FieldValue.increment(cost),
      [`byProvider.${provider}.callCount`]:    FieldValue.increment(1),
    }, { merge: true });
  } catch { /* non-blocking */ }
}

/**
 * Check if a client has budget remaining this month.
 * Returns { allowed: boolean, reason?: string, spent: number, budget: number }.
 */
async function checkBudget(clientId) {
  if (!clientId) return { allowed: true, spent: 0, budget: Infinity };
  try {
    const clientDoc = await db.collection("clients").doc(clientId).get();
    const budget    = (clientDoc.exists && clientDoc.data().llmBudgetUsd) || DEFAULT_MONTHLY_BUDGET_USD;

    const monthKey = getMonthKey();
    const usageDoc = await db.collection("llm_usage").doc(`${clientId}_${monthKey}`).get();
    const spent    = usageDoc.exists ? (usageDoc.data().totalCostUsd || 0) : 0;

    if (spent >= budget) {
      // Notify owner once per month when budget is blown
      try {
        const monthKey = getMonthKey();
        const notifId  = `budget_exceeded_${clientId}_${monthKey}`;
        const existing = await db.collection("notifications").doc(notifId).get();
        if (!existing.exists) {
          const clientSnap = await db.collection("clients").doc(clientId).get();
          const clientName = clientSnap.data()?.name || "Unnamed";
          const ownerId    = clientSnap.data()?.ownerId || null;
          await db.collection("notifications").doc(notifId).set({
            clientId,
            ownerId,
            type:      "budget_exceeded",
            title:     `LLM budget exceeded — ${clientName}`,
            message:   `Monthly AI budget of $${budget.toFixed(2)} exceeded ($${spent.toFixed(2)} spent). Agent runs are paused until next month or budget is increased.`,
            read:      false,
            createdAt: new Date().toISOString(),
          });
        }
      } catch { /* notification is best-effort */ }
      return { allowed: false, reason: `Monthly LLM budget exceeded ($${spent.toFixed(4)}/$${budget.toFixed(2)})`, spent, budget };
    }
    // Warn at 80%
    if (spent >= budget * 0.8) {
      // Notify owner once at 80% threshold
      try {
        const monthKey  = getMonthKey();
        const warnNotifId = `budget_warning_${clientId}_${monthKey}`;
        const existing = await db.collection("notifications").doc(warnNotifId).get();
        if (!existing.exists) {
          const clientSnap = await db.collection("clients").doc(clientId).get();
          const clientName = clientSnap.data()?.name || "Unnamed";
          const ownerId    = clientSnap.data()?.ownerId || null;
          await db.collection("notifications").doc(warnNotifId).set({
            clientId,
            ownerId,
            type:      "budget_warning",
            title:     `LLM budget warning — ${clientName}`,
            message:   `AI spend is at ${Math.round((spent/budget)*100)}% of the $${budget.toFixed(2)} monthly budget ($${spent.toFixed(2)} used). Consider increasing the budget or the agent may pause soon.`,
            read:      false,
            createdAt: new Date().toISOString(),
          });
        }
      } catch { /* notification is best-effort */ }
      return { allowed: true, warning: `LLM budget at ${Math.round((spent/budget)*100)}%`, spent, budget };
    }
    return { allowed: true, spent, budget };
  } catch {
    return { allowed: true, spent: 0, budget: DEFAULT_MONTHLY_BUDGET_USD };
  }
}

/**
 * Read monthly spend for a client (used by the dashboard + CMO).
 */
async function getMonthlySpend(clientId, monthKey = getMonthKey()) {
  try {
    const doc = await db.collection("llm_usage").doc(`${clientId}_${monthKey}`).get();
    if (!doc.exists) return { spent: 0, calls: 0, inputTokens: 0, outputTokens: 0, byProvider: {} };
    const d = doc.data();
    return {
      spent:        d.totalCostUsd      || 0,
      calls:        d.callCount         || 0,
      inputTokens:  d.totalInputTokens  || 0,
      outputTokens: d.totalOutputTokens || 0,
      byProvider:   d.byProvider        || {},
    };
  } catch {
    return { spent: 0, calls: 0, inputTokens: 0, outputTokens: 0, byProvider: {} };
  }
}

module.exports = {
  recordUsage,
  checkBudget,
  getMonthlySpend,
  estimateTokens,
  calcCost,
  DEFAULT_MONTHLY_BUDGET_USD,
};
