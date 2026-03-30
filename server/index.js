require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const { db }  = require("./config/firebase");

const authRoutes    = require("./routes/auth");
const keysRoutes    = require("./routes/keys");
const clientsRoutes = require("./routes/clients");
const agentsRoutes  = require("./routes/agents");
const chatRoutes    = require("./routes/chat");
const rankTrackerRoutes = require("./routes/rank-tracker");
const adminRoutes        = require("./routes/admin");
const portalRoutes       = require("./routes/portal");
const integrationsRoutes = require("./routes/integrations");

const app  = express();
const PORT = process.env.PORT || 5000;

// ── CORS — Production URLs ─────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "https://seo-agent-6jrv.onrender.com",
  "http://localhost:5173",
  "http://localhost:3000",
].filter(Boolean);

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ── Health Check ───────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    status:  "✅ SEO Agent Backend Running",
    version: "1.0.0",
    env:     process.env.NODE_ENV || "production",
    time:    new Date().toISOString(),
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// ── Firestore Test (temporary debug) ───────────────
app.get("/test-db", async (req, res) => {
  try {
    const { db } = require("./config/firebase");
    await db.collection("_test").doc("ping").set({ ping: true, t: new Date().toISOString() });
    res.json({ status: "✅ Firestore working!" });
  } catch (e) {
    res.json({ status: "❌ Firestore FAILED", error: e.message, code: e.code });
  }
});

// ── API Routes ─────────────────────────────────────
app.use("/api/auth",    authRoutes);
app.use("/api/keys",    keysRoutes);
app.use("/api/clients", clientsRoutes);
app.use("/api/agents",  agentsRoutes);
app.use("/api/chat",   chatRoutes);
app.use("/api/rank-tracker", rankTrackerRoutes);
app.use("/api/admin",        adminRoutes);
app.use("/api/portal",       portalRoutes);
app.use("/api/integrations", integrationsRoutes);

// ── Daily alert monitoring ─────────────────────────
// Runs A9.checkAlerts for every active client — detects new technical issues,
// performance drops, keyword visibility problems. Creates in-app notifications.
setInterval(async () => {
  try {
    const snap = await db.collection("clients").where("pipelineStatus", "==", "complete").get();
    for (const doc of snap.docs) {
      const data = doc.data();
      try {
        const { getUserKeys }  = require("./utils/getUserKeys");
        const { checkAlerts }  = require("./agents/A9_monitoring");
        const { runA15 }       = require("./agents/A15_competitorMonitor");
        const { runA16 }       = require("./agents/A16_memory");
        const keys = await getUserKeys(data.ownerId).catch(() => null);
        if (!keys) continue;

        // A9: check for new technical SEO alerts
        const alertResult = await checkAlerts(doc.id, keys);
        if (alertResult?.alertsCreated > 0) {
          console.log(`[daily-monitor] ${alertResult.alertsCreated} new alert(s) for ${data.name}`);
          await db.collection("notifications").add({
            clientId:  doc.id,
            ownerId:   data.ownerId,
            type:      "new_alerts",
            count:     alertResult.alertsCreated,
            message:   `${alertResult.alertsCreated} new SEO issue(s) detected for ${data.name}`,
            read:      false,
            createdAt: new Date().toISOString(),
          }).catch(() => {});
        }

        // A15: competitor monitoring — detect new competitor content
        try {
          const compResult = await runA15(doc.id, keys);
          if (compResult?.alertsCreated > 0) {
            console.log(`[daily-monitor] A15: ${compResult.alertsCreated} competitor alert(s) for ${data.name}`);
            await db.collection("notifications").add({
              clientId:  doc.id,
              ownerId:   data.ownerId,
              type:      "competitor_activity",
              count:     compResult.alertsCreated,
              message:   `Competitor published new content — counter-content opportunities detected for ${data.name}`,
              read:      false,
              createdAt: new Date().toISOString(),
            }).catch(() => {});
          }
        } catch { /* non-blocking */ }

        // A16: update client AI memory after daily check
        runA16(doc.id, keys).catch(() => {});

      } catch { /* skip client on error */ }
    }
  } catch (err) {
    console.error("[daily-monitor] Error:", err.message);
  }
}, 24 * 60 * 60 * 1000); // every 24 hours

// ── Monthly pipeline scheduler ────────────────────
// Checks once per hour — runs pipeline for clients whose last run was 30+ days ago
setInterval(async () => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const snap = await db.collection("clients")
      .where("pipelineStatus", "==", "complete")
      .get();

    for (const doc of snap.docs) {
      const data = doc.data();
      if (data.pipelineCompletedAt && data.pipelineCompletedAt < thirtyDaysAgo) {
        const { getUserKeys }      = require("./utils/getUserKeys");
        const { runFullPipeline }  = require("./agents/A0_orchestrator");
        const keys = await getUserKeys(data.ownerId).catch(() => null);
        if (!keys) continue;

        await db.collection("clients").doc(doc.id).update({
          pipelineStatus:    "running",
          pipelineStartedAt: new Date().toISOString(),
          pipelineError:     null,
        });

        runFullPipeline(doc.id, keys).catch(err => {
          console.error(`[scheduler] Re-run failed for ${doc.id}:`, err.message);
        });

        console.log(`[scheduler] Started monthly re-run for ${data.name} (${doc.id})`);
      }
    }
  } catch (err) {
    console.error("[scheduler] Error:", err.message);
  }
}, 60 * 60 * 1000); // every hour

// ── 404 Handler ────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ── Error Handler ──────────────────────────────────
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ── Start ──────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 SEO Agent Backend running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || "production"}`);
  console.log(`📡 Frontend URL: ${process.env.FRONTEND_URL}`);
});

module.exports = app;