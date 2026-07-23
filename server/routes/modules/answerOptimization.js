/**
 * Answer Optimization routes (M9.3).
 *
 * Turns the LLM Visibility signal + existing scan/content/audit data into
 * prioritized, categorized optimization opportunities via the pure
 * calculateAnswerOptimization() engine. Mounted by agents.js at the same base
 * ("/") so paths are /api/agents/:clientId/answer-optimization*.
 *
 *   GET  /:clientId/answer-optimization             — latest (computes live if none)
 *   POST /:clientId/answer-optimization/recalculate — recompute + persist
 *
 * Reuses shared verifyToken + getClientDoc + getState. No LLM calls, no
 * scanning, no duplicated recommendation logic (consumes the M9.2 visibility
 * snapshot as an input signal).
 *
 * Persistence: answer_optimization/{clientId} (+ history subcollection).
 */
const express       = require("express");
const router        = express.Router();
const { db }        = require("../../config/firebase");
const { verifyToken } = require("../../middleware/auth");
const { getState }  = require("../../shared-state/stateManager");
const { getClientDoc } = require("../shared/clientOwnership");
const { calculateAnswerOptimization } = require("../../utils/answerOptimization");

// Gather engine inputs from already-collected sources. Best-effort throughout.
async function gatherInputs(clientId) {
  const [visDoc, citeDoc, aioDoc, serpDoc, content, audit, rankings, knowledgeDoc] = await Promise.all([
    db.collection("llm_visibility").doc(clientId).get().catch(() => null),
    db.collection("ai_citations").doc(clientId).get().catch(() => null),
    db.collection("aio_tracker").doc(clientId).get().catch(() => null),
    db.collection("serp_features").doc(clientId).get().catch(() => null),
    getState(clientId, "A5_content").catch(() => null),
    getState(clientId, "A2_audit").catch(() => null),
    getState(clientId, "A10_rankings").catch(() => null),
    db.collection("seo_knowledge_cache").doc("global").get().catch(() => null),
  ]);
  // Knowledge freshness: consider fresh if cache doc exists + updated within 8 days.
  let knowledge = null;
  try {
    if (knowledgeDoc?.exists) {
      const u = knowledgeDoc.data().updatedAt;
      const ageDays = u ? (Date.now() - Date.parse(u)) / 86400000 : Infinity;
      knowledge = { fresh: ageDays <= 8 };
    } else {
      knowledge = { fresh: false };
    }
  } catch { knowledge = null; }

  return {
    visibility: visDoc?.exists  ? visDoc.data()  : null,
    citations:  citeDoc?.exists ? citeDoc.data().summary : null,
    aio:        aioDoc?.exists  ? aioDoc.data().summary  : null,
    serp:       serpDoc?.exists ? serpDoc.data().summary : null,
    content:    content || null,
    audit:      audit || null,
    rankings:   rankings || null,
    knowledge,
  };
}

// GET latest — stored if present, else computed live (no write).
router.get("/:clientId/answer-optimization", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const clientId = req.params.clientId;

    const stored = await db.collection("answer_optimization").doc(clientId).get().catch(() => null);
    if (stored?.exists) return res.json({ ...stored.data(), source: "stored" });

    const inputs = await gatherInputs(clientId);
    const result = calculateAnswerOptimization(inputs);
    return res.json({ ...result, lastRun: null, source: "live" });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// POST recalculate — recompute + persist snapshot + history.
router.post("/:clientId/answer-optimization/recalculate", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const clientId = req.params.clientId;

    const inputs = await gatherInputs(clientId);
    const result = calculateAnswerOptimization(inputs);
    const lastRun = new Date().toISOString();
    const snapshot = { clientId, ...result, lastRun };

    await db.collection("answer_optimization").doc(clientId).set(snapshot, { merge: true });
    await db.collection("answer_optimization").doc(clientId)
      .collection("history").doc(lastRun.replace(/[:.]/g, "-"))
      .set({ optimizationScore: result.optimizationScore, grade: result.grade, criticalCount: result.criticalCount, capturedAt: lastRun })
      .catch(() => {});

    return res.json({ ...snapshot, source: "recalculated" });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

module.exports = router;
