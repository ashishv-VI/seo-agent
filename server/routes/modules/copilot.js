/**
 * SEO Copilot routes (M9.5).
 *
 * Central AI workspace: answers questions with full business context by
 * aggregating existing platform data (copilotContext) and reasoning over it
 * (copilot engine → reuses callLLM + parseJSON). Persists conversations to
 * copilot_sessions. Mounted by agents.js at the same base ("/") so paths are
 * /api/agents/:clientId/copilot*.
 *
 *   POST   /:clientId/copilot/chat                 — ask a question (in a session)
 *   GET    /:clientId/copilot/sessions             — list sessions
 *   GET    /:clientId/copilot/session/:sessionId   — get one session
 *   DELETE /:clientId/copilot/session/:sessionId   — delete a session
 *
 * Reuses verifyToken + getClientDoc + getUserKeys + callLLM (via engine). No
 * duplicated auth, no duplicated LLM wrapper, no duplicated recommendation logic.
 *
 * Firestore: copilot_sessions/{sessionId} with a messages array.
 */
const express       = require("express");
const router        = express.Router();
const { db, FieldValue } = require("../../config/firebase");
const { verifyToken } = require("../../middleware/auth");
const { getUserKeys } = require("../../utils/getUserKeys");
const { getClientDoc } = require("../shared/clientOwnership");
const { buildCopilotContext } = require("../../utils/copilotContext");
const { askCopilot } = require("../../utils/copilot");
const { calcCost } = require("../../utils/costTracker");

// POST chat — answer a question, persist to a session (new or existing).
router.post("/:clientId/copilot/chat", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const clientId = req.params.clientId;
    const { question, sessionId, history = [] } = req.body;
    if (!question || !String(question).trim()) {
      return res.status(400).json({ error: "A question is required." });
    }

    const keys = await getUserKeys(req.uid);
    const context = await buildCopilotContext(clientId);
    const result = await askCopilot({ clientId, keys, question, context, history });

    // Persist to session (create if none). Session id is stable per conversation.
    const now = new Date().toISOString();
    const sid = sessionId || db.collection("copilot_sessions").doc().id;
    const ref = db.collection("copilot_sessions").doc(sid);
    const existing = await ref.get().catch(() => null);

    const userMsg = { role: "user", content: question, at: now };
    const botMsg  = { role: "assistant", content: result.answer, meta: {
      confidence: result.confidence, citations: result.citations,
      recommendedActions: result.recommendedActions, relatedTasks: result.relatedTasks,
      relatedPages: result.relatedPages, relatedReports: result.relatedReports,
      followUpQuestions: result.followUpQuestions,
    }, at: now };

    const estCost = calcCost("groq", result.tokensEstimate || 0, 0); // rough; provider unknown at this layer
    if (existing?.exists) {
      await ref.set({
        updatedAt: now, lastActivity: now,
        messages: FieldValue.arrayUnion(userMsg, botMsg),
        tokenUsage: FieldValue.increment(result.tokensEstimate || 0),
        estimatedCost: FieldValue.increment(estCost),
      }, { merge: true });
    } else {
      await ref.set({
        sessionId: sid, clientId, userId: req.uid,
        title: String(question).slice(0, 60),
        createdAt: now, updatedAt: now, lastActivity: now,
        messages: [userMsg, botMsg],
        tokenUsage: result.tokensEstimate || 0,
        estimatedCost: estCost,
        conversationSummary: null,
      }, { merge: true });
    }

    return res.json({ sessionId: sid, ...result });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// GET sessions — list (metadata only, newest first).
router.get("/:clientId/copilot/sessions", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const snap = await db.collection("copilot_sessions")
      .where("clientId", "==", req.params.clientId)
      .where("userId", "==", req.uid)
      .limit(100).get().catch(() => null);
    const sessions = (snap?.docs || [])
      .map(d => { const s = d.data(); return {
        sessionId: s.sessionId || d.id, title: s.title || "Untitled",
        createdAt: s.createdAt, updatedAt: s.updatedAt, lastActivity: s.lastActivity,
        messageCount: (s.messages || []).length, tokenUsage: s.tokenUsage || 0,
      }; })
      .sort((a, b) => String(b.lastActivity || "").localeCompare(String(a.lastActivity || "")));
    return res.json({ sessions });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// GET one session (full messages).
router.get("/:clientId/copilot/session/:sessionId", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const doc = await db.collection("copilot_sessions").doc(req.params.sessionId).get();
    if (!doc.exists) return res.status(404).json({ error: "Session not found" });
    const s = doc.data();
    // Ownership: session must belong to this client + user.
    if (s.clientId !== req.params.clientId || s.userId !== req.uid) {
      return res.status(403).json({ error: "Access denied" });
    }
    return res.json(s);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// DELETE a session.
router.delete("/:clientId/copilot/session/:sessionId", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const ref = db.collection("copilot_sessions").doc(req.params.sessionId);
    const doc = await ref.get();
    if (!doc.exists) return res.json({ deleted: true }); // already gone
    const s = doc.data();
    if (s.clientId !== req.params.clientId || s.userId !== req.uid) {
      return res.status(403).json({ error: "Access denied" });
    }
    await ref.delete();
    return res.json({ deleted: true, sessionId: req.params.sessionId });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

module.exports = router;
