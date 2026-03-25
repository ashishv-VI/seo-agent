require("dotenv").config();
const express = require("express");
const cors    = require("cors");

const authRoutes    = require("./routes/auth");
const keysRoutes    = require("./routes/keys");
const clientsRoutes = require("./routes/clients");
const agentsRoutes  = require("./routes/agents");

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