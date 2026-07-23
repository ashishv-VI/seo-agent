/**
 * pipelineMetrics.js — lightweight pipeline run telemetry (M9.1).
 *
 * Writes one document per pipeline run to the `pipeline_metrics` collection so
 * we can see started/completed/failed counts, durations, agent failures, and
 * (best-effort) LLM call + token + cost estimates for the run.
 *
 * Design: fully non-blocking and best-effort. Every function swallows its own
 * errors — telemetry must NEVER break or slow the pipeline. Does not change any
 * existing response format; runFullPipeline's return value is untouched.
 *
 * A run is identified by `runId` (clientId + start ISO). recordStart creates the
 * doc; recordComplete / recordFail finalize it with outcome + duration.
 */
const { db, FieldValue } = require("../config/firebase");

const COLL = "pipeline_metrics";

function makeRunId(clientId, startedAtIso) {
  // Deterministic per run; safe as a Firestore doc id.
  return `${clientId}_${startedAtIso.replace(/[:.]/g, "-")}`;
}

/**
 * Record the start of a pipeline run. Returns a handle { runId, startedAt }
 * to pass into recordComplete/recordFail. Never throws.
 */
async function recordStart(clientId, startedAtIso) {
  const runId = makeRunId(clientId, startedAtIso);
  try {
    await db.collection(COLL).doc(runId).set({
      runId,
      clientId,
      status:      "running",
      startedAt:   startedAtIso,
      agentFailures: [],
      llmCalls:    0,
      inputTokens: 0,
      outputTokens: 0,
      estCostUsd:  0,
    }, { merge: true });
  } catch { /* best-effort */ }
  return { runId, startedAt: startedAtIso };
}

/** Append an agent failure to the run. Never throws. */
async function recordAgentFailure(handle, agentId, error) {
  if (!handle?.runId) return;
  try {
    await db.collection(COLL).doc(handle.runId).set({
      agentFailures: FieldValue.arrayUnion({ agentId, error: String(error || "").slice(0, 300), at: new Date().toISOString() }),
    }, { merge: true });
  } catch { /* best-effort */ }
}

/**
 * Attach LLM usage totals for the run (best-effort). Reads the client's monthly
 * llm_usage snapshot deltas are not attempted here — callers may pass known
 * per-run figures; if omitted we simply record 0 (the monthly costTracker
 * remains the source of truth for billing).
 */
async function recordUsage(handle, { llmCalls = 0, inputTokens = 0, outputTokens = 0, estCostUsd = 0 } = {}) {
  if (!handle?.runId) return;
  try {
    await db.collection(COLL).doc(handle.runId).set({
      llmCalls:     FieldValue.increment(llmCalls),
      inputTokens:  FieldValue.increment(inputTokens),
      outputTokens: FieldValue.increment(outputTokens),
      estCostUsd:   FieldValue.increment(estCostUsd),
    }, { merge: true });
  } catch { /* best-effort */ }
}

function _finalize(handle, status, extra = {}) {
  if (!handle?.runId) return Promise.resolve();
  const completedAt = new Date().toISOString();
  let durationMs = null;
  try { durationMs = Date.parse(completedAt) - Date.parse(handle.startedAt); } catch { /* noop */ }
  return db.collection(COLL).doc(handle.runId).set({
    status,
    completedAt,
    durationMs,
    ...extra,
  }, { merge: true }).catch(() => {});
}

/** Finalize a run as complete. Never throws. */
async function recordComplete(handle, extra = {}) {
  try { await _finalize(handle, "complete", extra); } catch { /* best-effort */ }
}

/** Finalize a run as failed. Never throws. */
async function recordFail(handle, error, extra = {}) {
  try { await _finalize(handle, "failed", { error: String(error || "").slice(0, 500), ...extra }); } catch { /* best-effort */ }
}

module.exports = {
  recordStart,
  recordAgentFailure,
  recordUsage,
  recordComplete,
  recordFail,
  COLLECTION: COLL,
};
