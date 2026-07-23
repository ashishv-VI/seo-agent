/**
 * LLM Visibility routes (M9.2).
 *
 * Synthesizes existing scanner data (aio_tracker, ai_citations, serp_features)
 * + A3 keywords + A25 core-update state into a single LLM Visibility product
 * metric via the pure calculateLLMVisibility() engine. Mounted by agents.js at
 * the same base ("/") so paths are /api/agents/:clientId/llm-visibility*.
 *
 *   GET  /:clientId/llm-visibility             — latest snapshot (computes live if none)
 *   POST /:clientId/llm-visibility/recalculate — recompute from current scans + persist
 *
 * Reuses shared verifyToken + getClientDoc + getState. No scanning here — pure
 * synthesis over data other agents already collected. No LLM calls.
 *
 * Persistence: llm_visibility/{clientId} (latest) + llm_visibility/{clientId}/history/{ts}.
 */
const express       = require("express");
const router        = express.Router();
const { db }        = require("../../config/firebase");
const { verifyToken } = require("../../middleware/auth");
const { getState }  = require("../../shared-state/stateManager");
const { getClientDoc } = require("../shared/clientOwnership");
const { calculateLLMVisibility } = require("../../utils/llmVisibility");

// Gather the inputs the engine needs from already-collected sources. Best-effort:
// any missing source degrades the score's confidence rather than failing.
async function gatherInputs(clientId, previous) {
  const [aioDoc, citeDoc, serpDoc, keywords, coreUpdate] = await Promise.all([
    db.collection("aio_tracker").doc(clientId).get().catch(() => null),
    db.collection("ai_citations").doc(clientId).get().catch(() => null),
    db.collection("serp_features").doc(clientId).get().catch(() => null),
    getState(clientId, "A3_keywords").catch(() => null),
    getState(clientId, "A25_coreUpdateScanner").catch(() => null),
  ]);
  return {
    aio:        aioDoc?.exists  ? aioDoc.data().summary  : null,
    citations:  citeDoc?.exists ? citeDoc.data().summary : null,
    serp:       serpDoc?.exists ? serpDoc.data().summary : null,
    keywords:   keywords || null,
    coreUpdate: coreUpdate || null,
    previous:   previous || null,
  };
}

// GET latest snapshot — return stored if present, else compute live (no write).
router.get("/:clientId/llm-visibility", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const clientId = req.params.clientId;

    const stored = await db.collection("llm_visibility").doc(clientId).get().catch(() => null);
    if (stored?.exists) {
      return res.json({ ...stored.data(), source: "stored" });
    }

    // No snapshot yet — compute live from current scans (does not persist).
    const inputs = await gatherInputs(clientId, null);
    const result = calculateLLMVisibility(inputs);
    return res.json({ ...result, lastScan: null, source: "live" });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// POST recalculate — recompute from current scans, persist snapshot + history.
router.post("/:clientId/llm-visibility/recalculate", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const clientId = req.params.clientId;

    // Load previous snapshot for trend, then recompute.
    const prevDoc = await db.collection("llm_visibility").doc(clientId).get().catch(() => null);
    const previous = prevDoc?.exists ? prevDoc.data() : null;

    const inputs = await gatherInputs(clientId, previous);
    const result = calculateLLMVisibility(inputs);
    const lastScan = new Date().toISOString();
    const snapshot = { clientId, ...result, lastScan };

    // Persist latest + append to history subcollection (best-effort history).
    await db.collection("llm_visibility").doc(clientId).set(snapshot, { merge: true });
    await db.collection("llm_visibility").doc(clientId)
      .collection("history").doc(lastScan.replace(/[:.]/g, "-"))
      .set({ visibilityScore: result.visibilityScore, grade: result.grade, shareOfVoice: result.shareOfVoice, capturedAt: lastScan })
      .catch(() => {});

    return res.json({ ...snapshot, source: "recalculated" });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

module.exports = router;
