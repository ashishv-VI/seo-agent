const express       = require("express");
const router        = express.Router();
const { db, FieldValue } = require("../config/firebase");
const { verifyToken } = require("../middleware/auth");
const { runA1 }     = require("../agents/A1_onboarding");
const { runA2 }     = require("../agents/A2_audit");
const { getClientState, saveState, updateState, deleteClientState } = require("../shared-state/stateManager");

// ── Create Client + Run A1 ─────────────────────────
router.post("/", verifyToken, async (req, res) => {
  try {
    const clientRef = db.collection("clients").doc();
    const clientId  = clientRef.id;

    // Run A1 agent to structure the brief
    const a1Result = await runA1(clientId, req.body);

    // Auto sign-off: the brief is built from the onboarding form — no separate human review
    // needed to start the technical audit. This unblocks the automated pipeline immediately.
    if (a1Result.success) {
      a1Result.brief.signedOff    = true;
      a1Result.brief.autoSignedOff = true;
      a1Result.brief.signedOffAt  = new Date().toISOString();
      await saveState(clientId, "A1_brief", a1Result.brief);

      // Sprint 1 — Save Day 1 baseline snapshot so before/after comparison is always possible.
      // Scores (SEO, traffic, rankings) are added later when A2/A7/A9 complete for the first time.
      await saveState(clientId, "baseline", {
        capturedAt:    new Date().toISOString(),
        briefSnapshot: {
          businessName:   a1Result.brief.businessName,
          websiteUrl:     a1Result.brief.websiteUrl,
          kpiSelection:   a1Result.brief.kpiSelection || [],
          goals:          a1Result.brief.goals || [],
          competitors:    a1Result.brief.competitors || [],
          primaryKeywords: a1Result.brief.primaryKeywords || [],
          pastSeoHistory: a1Result.brief.pastSeoHistory || null,
          avgOrderValue:  a1Result.brief.avgOrderValue || null,
        },
        // These will be filled in by A9 on first pipeline completion:
        seoScore:       null,
        healthScore:    null,
        keywordsRanking: null,
        topIssues:      null,
        firstPipelineAt: null,
      });
    }

    // Save client record
    await clientRef.set({
      clientId,
      ownerId:   req.uid,
      createdAt: FieldValue.serverTimestamp(),
      status:    a1Result.brief.status,
      name:      req.body.businessName || "Unnamed Client",
      website:   a1Result.brief.websiteUrl || "",
      agents: {
        A1: a1Result.brief.status === "complete" ? "signed_off" : a1Result.brief.status,
        A2: "pending",
        A3: "pending",
        A4: "pending",
        A5: "pending",
        A6: "pending",
        A7: "pending",
        A8: "pending",
        A9: "pending",
      },
    });

    return res.status(201).json({
      message:  "Client created",
      clientId,
      a1Result,
    });
  } catch (err) {
    console.error("Create client error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── List All Clients for User ──────────────────────
router.get("/", verifyToken, async (req, res) => {
  try {
    const snap = await db.collection("clients")
      .where("ownerId", "==", req.uid)
      .get();

    const clients = snap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => (b.createdAt?._seconds || 0) - (a.createdAt?._seconds || 0));
    return res.json({ clients });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Get Single Client + Full State ────────────────
router.get("/:clientId", verifyToken, async (req, res) => {
  try {
    const doc = await db.collection("clients").doc(req.params.clientId).get();
    if (!doc.exists) return res.status(404).json({ error: "Client not found" });
    if (doc.data().ownerId !== req.uid) return res.status(403).json({ error: "Access denied" });

    const state = await getClientState(req.params.clientId);
    return res.json({ client: { id: doc.id, ...doc.data() }, state });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Sign Off Brief (Human Gate for A1) ────────────
router.post("/:clientId/signoff", verifyToken, async (req, res) => {
  try {
    const doc = await db.collection("clients").doc(req.params.clientId).get();
    if (!doc.exists) return res.status(404).json({ error: "Client not found" });
    if (doc.data().ownerId !== req.uid) return res.status(403).json({ error: "Access denied" });

    // Update brief signoff — use updateState to preserve existing brief data
    await updateState(req.params.clientId, "A1_brief", { signedOff: true, signedOffAt: new Date().toISOString() });

    // Update client status
    await db.collection("clients").doc(req.params.clientId).update({
      "agents.A1": "signed_off",
    });

    return res.json({ message: "Brief signed off — A2 audit can now begin" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Run A2 Audit ───────────────────────────────────
router.post("/:clientId/audit", verifyToken, async (req, res) => {
  try {
    const doc = await db.collection("clients").doc(req.params.clientId).get();
    if (!doc.exists) return res.status(404).json({ error: "Client not found" });
    if (doc.data().ownerId !== req.uid) return res.status(403).json({ error: "Access denied" });

    // Update status to running
    await db.collection("clients").doc(req.params.clientId).update({ "agents.A2": "running" });

    const a2Result = await runA2(req.params.clientId);

    // Update status
    await db.collection("clients").doc(req.params.clientId).update({
      "agents.A2": a2Result.success ? "complete" : "failed",
    });

    return res.json(a2Result);
  } catch (err) {
    await db.collection("clients").doc(req.params.clientId).update({ "agents.A2": "failed" });
    return res.status(500).json({ error: err.message });
  }
});

// ── Update Client Brief (A1 re-run) ───────────────
router.put("/:clientId", verifyToken, async (req, res) => {
  try {
    const doc = await db.collection("clients").doc(req.params.clientId).get();
    if (!doc.exists) return res.status(404).json({ error: "Client not found" });
    if (doc.data().ownerId !== req.uid) return res.status(403).json({ error: "Access denied" });

    const a1Result = await runA1(req.params.clientId, req.body);
    await db.collection("clients").doc(req.params.clientId).update({
      name:      req.body.businessName || doc.data().name,
      website:   a1Result.brief.websiteUrl || doc.data().website,
      status:    a1Result.brief.status,
      "agents.A1": "updated",
      updatedAt: FieldValue.serverTimestamp(),
    });

    return res.json({ message: "Client updated", a1Result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Delete Client ──────────────────────────────────
router.delete("/:clientId", verifyToken, async (req, res) => {
  try {
    const doc = await db.collection("clients").doc(req.params.clientId).get();
    if (!doc.exists) return res.status(404).json({ error: "Client not found" });
    if (doc.data().ownerId !== req.uid) return res.status(403).json({ error: "Access denied" });

    await db.collection("clients").doc(req.params.clientId).delete();
    await deleteClientState(req.params.clientId);

    return res.json({ message: "Client deleted" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
