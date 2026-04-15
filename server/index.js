require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const { db }  = require("./config/firebase");

// Load rate limiters — graceful fallback if express-rate-limit not yet installed
let authLimiter, agentLimiter, chatLimiter, apiLimiter;
try {
  ({ authLimiter, agentLimiter, chatLimiter, apiLimiter } = require("./middleware/rateLimiter"));
} catch (e) {
  console.warn("[index] rateLimiter unavailable — using passthrough:", e.message);
  const passthrough = (req, res, next) => next();
  authLimiter = agentLimiter = chatLimiter = apiLimiter = passthrough;
}

const authRoutes    = require("./routes/auth");
const keysRoutes    = require("./routes/keys");
const clientsRoutes = require("./routes/clients");
const agentsRoutes  = require("./routes/agents");
const chatRoutes    = require("./routes/chat");
const rankTrackerRoutes = require("./routes/rank-tracker");
const adminRoutes        = require("./routes/admin");
const portalRoutes       = require("./routes/portal");
const integrationsRoutes = require("./routes/integrations");
const gscRoutes          = require("./routes/gsc");
const ga4Routes          = require("./routes/ga4");
const backlinksRoutes    = require("./routes/backlinks");
const toolsRoutes        = require("./routes/tools");
const crawlerRoutes      = require("./routes/crawlerRoutes");
const controlRoomRoutes  = require("./routes/controlRoom");
const agencyRoutes       = require("./routes/agency");
const attributionRoutes  = require("./routes/attribution");
const rulesEngineRoutes  = require("./routes/rulesEngine");

const app  = express();
const PORT = process.env.PORT || 5000;

// ── CORS ────────────────────────────────────────────
const corsOptions = {
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    // Allow all onrender.com subdomains + localhost
    if (
      origin.endsWith(".onrender.com") ||
      origin === process.env.FRONTEND_URL ||
      origin.startsWith("http://localhost")
    ) {
      return callback(null, true);
    }
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
};

// CORS middleware — handles preflight (OPTIONS) and normal requests
app.use(cors(corsOptions));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ── A21 Pre-Sales Audit (public — no auth required) ─
// Used for sales demos: pass ?url=https://example.com, get instant audit
app.get("/api/presales/audit", async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: "url query param required" });

    // SSRF protection: block private/internal IPs and metadata endpoints
    const { isPrivateUrl } = require("./utils/urlSafety");
    const normalizedUrl = url.startsWith("http") ? url : `https://${url}`;
    if (isPrivateUrl(normalizedUrl)) {
      return res.status(400).json({ error: "URL points to a private or internal address" });
    }

    const { runPreSalesAudit } = require("./agents/A21_preSales");
    const result = await runPreSalesAudit(url);
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

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

// /test-db endpoint removed — was a debug route that wrote to Firestore with no auth

// ── API Routes ─────────────────────────────────────
app.use("/api/auth",         authLimiter,  authRoutes);
app.use("/api/keys",         apiLimiter,   keysRoutes);
app.use("/api/clients",      apiLimiter,   clientsRoutes);
app.use("/api/agents",       agentLimiter, agentsRoutes);
app.use("/api/chat",         chatLimiter,  chatRoutes);
app.use("/api/rank-tracker", apiLimiter,   rankTrackerRoutes);
app.use("/api/admin",        apiLimiter,   adminRoutes);
app.use("/api/portal",       apiLimiter,   portalRoutes);
app.use("/api/integrations", apiLimiter,   integrationsRoutes);
app.use("/api/gsc",          apiLimiter,   gscRoutes);
app.use("/api/ga4",          apiLimiter,   ga4Routes);
app.use("/api/backlinks",    apiLimiter,   backlinksRoutes);
app.use("/api/tools",        agentLimiter, toolsRoutes);
app.use("/api/crawler",      apiLimiter,   crawlerRoutes);
app.use("/api/control-room", apiLimiter,   controlRoomRoutes);
app.use("/api/agency",       apiLimiter,   agencyRoutes);
app.use("/api/attribution",  apiLimiter,   attributionRoutes);
app.use("/api/rules-engine", agentLimiter, rulesEngineRoutes);

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

        // A23: investigate any new P1 alerts — diagnose root cause, propose fix, notify
        if (alertResult?.alertsCreated > 0) {
          try {
            const { runA23 } = require("./agents/A23_investigator");
            const inv = await runA23(doc.id, keys);
            if (inv?.investigated > 0) {
              console.log(`[daily-monitor] A23: ${inv.investigated} P1 alert(s) investigated for ${data.name}`);
            }
          } catch { /* non-blocking */ }
        }

        // Rules Engine: evaluate all IFTTT automation rules
        try {
          const { evaluateRules } = require("./routes/rulesEngine");
          const ruleResult = await evaluateRules(doc.id, data.ownerId);
          if (ruleResult?.fired > 0) {
            console.log(`[daily-monitor] Rules engine: ${ruleResult.fired} rule(s) fired for ${data.name}`);
          }
        } catch { /* non-blocking */ }

        // A16: update client AI memory after daily check
        await runA16(doc.id, keys).catch(() => {});

        // CMO: daily self-scheduled wake-up — reads current state + memory,
        // decides if any action is needed today (re-audit, new content, fix push, etc).
        // This is what makes the agent "wake up and decide" instead of waiting for a human.
        try {
          const { runCMO } = require("./agents/CMO_agent");
          const cmoResult = await runCMO(doc.id, keys);
          if (cmoResult?.decision?.nextAgents?.length > 0) {
            console.log(`[daily-monitor] CMO: queued ${cmoResult.decision.nextAgents.length} action(s) for ${data.name}: ${cmoResult.decision.nextAgents.join(", ")}`);
            await db.collection("notifications").add({
              clientId:  doc.id,
              ownerId:   data.ownerId,
              type:      "cmo_daily_decision",
              message:   `CMO daily check: ${cmoResult.decision.reasoning || "action plan ready"}`,
              read:      false,
              createdAt: new Date().toISOString(),
            }).catch(() => {});
          }
        } catch (cmoErr) {
          console.error(`[daily-monitor] CMO error for ${data.name}:`, cmoErr.message);
        }

      } catch { /* skip client on error */ }
    }
  } catch (err) {
    console.error("[daily-monitor] Error:", err.message);
  }
}, 24 * 60 * 60 * 1000); // every 24 hours

// ── Weekly GSC + GA4 data pull (Sprint 2) ─────────
// Every Monday at ~06:00 UTC: fetch fresh GSC/GA4 data, store delta, trigger notifications
setInterval(async () => {
  const now = new Date();
  if (now.getUTCDay() !== 1) return; // Monday only
  const hour = now.getUTCHours();
  if (hour < 6 || hour > 7) return;  // 06:00–06:59 UTC window

  console.log("[weekly-pull] Starting weekly GSC+GA4 data pull...");
  try {
    const snap = await db.collection("clients").where("pipelineStatus", "==", "complete").get();
    for (const doc of snap.docs) {
      const data = doc.data();
      try {
        const { getUserKeys } = require("./utils/getUserKeys");
        const keys = await getUserKeys(data.ownerId).catch(() => null);
        if (!keys) continue;

        const { getState } = require("./shared-state/stateManager");
        const brief = await getState(doc.id, "A1_brief").catch(() => null);
        if (!brief?.websiteUrl) continue;

        const weekLabel = `${now.getUTCFullYear()}-W${String(Math.ceil((now.getUTCDate() - now.getUTCDay() + 1) / 7)).padStart(2,"0")}`;
        const gscToken  = keys?.gscToken || null;
        const ga4Id     = keys?.gaPropertyId || null;

        let gscData = null;
        let ga4Data = null;

        // ── Pull GSC data ─────────────────────────────────
        if (gscToken && brief.websiteUrl) {
          try {
            const endDate   = new Date().toISOString().split("T")[0];
            const startDate = new Date(Date.now() - 7*24*60*60*1000).toISOString().split("T")[0];
            const gscUrl    = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(brief.websiteUrl)}/searchAnalytics/query`;
            const gscRes    = await fetch(gscUrl, {
              method:  "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${gscToken}` },
              body:    JSON.stringify({ startDate, endDate, dimensions: ["query","page"], rowLimit: 25 }),
              signal:  AbortSignal.timeout(20000),
            });
            const gscJson = await gscRes.json();
            if (gscJson.rows?.length) {
              const rows = gscJson.rows;
              gscData = {
                totalClicks:   rows.reduce((s, r) => s + r.clicks, 0),
                totalImpress:  rows.reduce((s, r) => s + r.impressions, 0),
                avgCtr:        rows.length ? (rows.reduce((s,r) => s + r.ctr, 0) / rows.length) : 0,
                avgPos:        rows.length ? (rows.reduce((s,r) => s + r.position, 0) / rows.length) : 0,
                topKeywords:   rows.slice(0, 10).map(r => ({ keyword: r.keys[0], page: r.keys[1], clicks: r.clicks, position: parseFloat(r.position.toFixed(1)) })),
                period:        `${startDate} → ${endDate}`,
              };
            }
          } catch (e) { console.error(`[weekly-pull] GSC error for ${doc.id}:`, e.message); }
        }

        // ── Pull GA4 data ─────────────────────────────────
        if (ga4Id && gscToken) {
          try {
            const endDate   = new Date().toISOString().split("T")[0];
            const startDate = new Date(Date.now() - 7*24*60*60*1000).toISOString().split("T")[0];
            const ga4Url    = `https://analyticsdata.googleapis.com/v1beta/properties/${ga4Id}:runReport`;
            const ga4Res    = await fetch(ga4Url, {
              method:  "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${gscToken}` },
              body:    JSON.stringify({
                dateRanges: [{ startDate, endDate }],
                dimensions: [{ name: "sessionDefaultChannelGroup" }],
                metrics: [
                  { name: "sessions" },
                  { name: "activeUsers" },
                  { name: "bounceRate" },
                  { name: "averageSessionDuration" },
                ],
              }),
              signal: AbortSignal.timeout(20000),
            });
            const ga4Json = await ga4Res.json();
            if (ga4Json.rows?.length) {
              const organicRow = ga4Json.rows.find(r => (r.dimensionValues[0]?.value || "").toLowerCase().includes("organic"));
              ga4Data = {
                organicSessions:  organicRow ? parseInt(organicRow.metricValues[0]?.value || 0) : 0,
                organicUsers:     organicRow ? parseInt(organicRow.metricValues[1]?.value || 0) : 0,
                bounceRate:       organicRow ? parseFloat(organicRow.metricValues[2]?.value || 0) : 0,
                avgSessionSec:    organicRow ? parseFloat(organicRow.metricValues[3]?.value || 0) : 0,
                period:           `${startDate} → ${endDate}`,
              };
            }
          } catch (e) { console.error(`[weekly-pull] GA4 error for ${doc.id}:`, e.message); }
        }

        // ── Store weekly snapshot ─────────────────────────
        const snapDoc = {
          clientId:  doc.id,
          ownerId:   data.ownerId,
          week:      weekLabel,
          pulledAt:  new Date().toISOString(),
          gsc:       gscData,
          ga4:       ga4Data,
          hasData:   !!(gscData || ga4Data),
        };
        await db.collection("weekly_snapshots").doc(`${doc.id}_${weekLabel}`).set(snapDoc);
        // Legacy compat: also write to weekly_pulls
        await db.collection("weekly_pulls").add({ clientId: doc.id, ownerId: data.ownerId, pulledAt: snapDoc.pulledAt, week: weekLabel });

        console.log(`[weekly-pull] Done for ${data.name} — GSC: ${gscData ? "ok" : "skip"}, GA4: ${ga4Data ? "ok" : "skip"}`);
      } catch { /* skip client */ }
    }

    // ── Weekly Brief — send Monday intelligence email to agency exec ─────
    try {
      const { sendWeeklyBriefs, sendAgencyExecDigests } = require("./utils/weeklyBrief");
      const briefResult = await sendWeeklyBriefs();
      console.log(`[weekly-pull] Weekly briefs sent: ${briefResult.sent}, errors: ${briefResult.errors}`);
      // Agency exec digest — one aggregated email per agency owner
      const digestResult = await sendAgencyExecDigests();
      console.log(`[weekly-pull] Agency exec digests sent: ${digestResult.sent}, errors: ${digestResult.errors}`);
    } catch (e) {
      console.error("[weekly-pull] Weekly brief error:", e.message);
    }

  } catch (err) {
    console.error("[weekly-pull] Error:", err.message);
  }
}, 60 * 60 * 1000); // check every hour

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

// ── Sprint 5: Continuous monitoring watchdog ──────────
// Runs every 6 hours. For each complete client:
//   - Check if SEO score dropped >5 pts since last check
//   - Check if P1 issue count increased
//   - Auto-trigger CMO Agent if a signal threshold is crossed
//   - Create alert + notification if action needed
setInterval(async () => {
  try {
    const snap = await db.collection("clients").where("pipelineStatus","==","complete").get();
    for (const doc of snap.docs) {
      const data = doc.data();
      try {
        const { getUserKeys }    = require("./utils/getUserKeys");
        const { getLatestScore } = require("./utils/scoreCalculator");
        const keys = await getUserKeys(data.ownerId).catch(() => null);
        if (!keys) continue;

        const latestScore = await getLatestScore(doc.id).catch(() => null);
        const prevScore   = data.lastWatchdogScore || null;

        // Score drop detection
        if (latestScore?.overall != null && prevScore != null) {
          const drop = prevScore - latestScore.overall;
          if (drop >= 5) {
            // Auto-run CMO to re-assess strategy
            try {
              const { runCMO } = require("./agents/CMO_agent");
              await runCMO(doc.id, keys);
            } catch { /* non-blocking */ }

            await db.collection("notifications").add({
              clientId:  doc.id,
              ownerId:   data.ownerId,
              type:      "score_drop",
              title:     `⚠️ SEO Score Drop — ${data.name}`,
              message:   `Score dropped ${drop} points (${prevScore} → ${latestScore.overall}). CMO Agent re-assessed strategy.`,
              read:      false,
              createdAt: new Date().toISOString(),
            }).catch(() => {});

            console.log(`[watchdog] Score drop ${drop}pts for ${data.name} — CMO triggered`);
          }
        }

        // Update last watchdog score
        await db.collection("clients").doc(doc.id).update({
          lastWatchdogScore: latestScore?.overall || data.seoScore || null,
          lastWatchdogAt:    new Date().toISOString(),
        }).catch(() => {});

      } catch { /* skip client */ }
    }
  } catch (err) {
    console.error("[watchdog] Error:", err.message);
  }
}, 6 * 60 * 60 * 1000); // every 6 hours

// ── Monthly report auto-send (1st of month, Sprint 2) ─
// Checks every hour — sends report email for clients whose last report was 30+ days ago
setInterval(async () => {
  const now = new Date();
  if (now.getUTCDate() !== 1) return;       // 1st of month only
  if (now.getUTCHours() < 8 || now.getUTCHours() > 9) return; // 08:00–08:59 UTC

  console.log("[monthly-report] Running auto-report email send...");
  try {
    const snap = await db.collection("clients").where("pipelineStatus", "==", "complete").get();
    for (const doc of snap.docs) {
      try {
        const { notifyReportReady } = require("./agents/A18_clientNotifier");
        await notifyReportReady(doc.id);
        console.log(`[monthly-report] Sent to ${doc.data().name}`);
      } catch { /* skip client */ }
    }
  } catch (err) {
    console.error("[monthly-report] Error:", err.message);
  }
}, 60 * 60 * 1000);

// ── Fix Verification Loop — runs daily at 03:00 UTC ───────────────────────────
// For each pending fix_verification doc where checkAfter < now:
//   1. Pull GSC data for the specific URL (before vs after)
//   2. Compare CTR / position
//   3. Mark outcome: improved | no_change | degraded | no_data
//   4. Write to client_memory so CMO learns what works
//   5. Write to global_patterns for cross-client intelligence
setInterval(async () => {
  const now = new Date();
  if (now.getUTCHours() !== 3) return; // 03:00 UTC window

  console.log("[fix-verify] Starting daily fix verification check...");
  try {
    const snap = await db.collection("fix_verification")
      .where("status", "==", "pending")
      .where("checkAfter", "<=", now.toISOString())
      .orderBy("checkAfter", "asc")
      .limit(50)
      .get();

    const dueDocs = snap.docs; // already filtered by query — all are due
    console.log(`[fix-verify] ${dueDocs.length} fix(es) due for verification`);

    for (const doc of dueDocs) {
      const fix = doc.data();
      try {
        const { getUserKeys } = require("./utils/getUserKeys");
        const keys = await getUserKeys(fix.ownerId).catch(() => null);
        const gscToken = keys?.gscToken || null;

        let outcome = "no_data";
        let gscResult = null;

        // ── Pull GSC for this specific URL ─────────────
        if (gscToken && fix.wpPostUrl) {
          try {
            const clientDoc  = await db.collection("clients").doc(fix.clientId).get();
            const siteUrl    = clientDoc.data()?.websiteUrl || fix.wpPostUrl;

            // Window 1: 28 days BEFORE the push (baseline)
            const pushDate   = new Date(fix.pushedAt);
            const beforeEnd  = new Date(pushDate.getTime() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];
            const beforeStart= new Date(pushDate.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

            // Window 2: last 28 days (after the push)
            const afterEnd   = now.toISOString().split("T")[0];
            const afterStart = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

            const gscBase = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
            const pageFilter = { dimensionFilterGroups: [{ filters: [{ dimension: "page", operator: "contains", expression: fix.wpPostUrl.replace(/^https?:\/\/[^/]+/, "") }] }] };

            const [beforeRes, afterRes] = await Promise.all([
              fetch(gscBase, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${gscToken}` },
                body: JSON.stringify({ startDate: beforeStart, endDate: beforeEnd, dimensions: ["page"], rowLimit: 5, ...pageFilter }),
                signal: AbortSignal.timeout(15000),
              }),
              fetch(gscBase, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${gscToken}` },
                body: JSON.stringify({ startDate: afterStart, endDate: afterEnd, dimensions: ["page"], rowLimit: 5, ...pageFilter }),
                signal: AbortSignal.timeout(15000),
              }),
            ]);

            const beforeData = await beforeRes.json();
            const afterData  = await afterRes.json();

            const beforeRow  = beforeData.rows?.[0];
            const afterRow   = afterData.rows?.[0];

            if (beforeRow || afterRow) {
              const ctrBefore  = beforeRow?.ctr     || 0;
              const ctrAfter   = afterRow?.ctr      || 0;
              const posBefore  = beforeRow?.position || null;
              const posAfter   = afterRow?.position  || null;
              const ctrDelta   = ctrAfter - ctrBefore;
              const posDelta   = posBefore && posAfter ? posBefore - posAfter : null; // positive = improved

              outcome = ctrDelta > 0.005 || (posDelta !== null && posDelta > 1)
                ? "improved"
                : ctrDelta < -0.005 || (posDelta !== null && posDelta < -1)
                  ? "degraded"
                  : "no_change";

              gscResult = { ctrBefore, ctrAfter, ctrDelta, posBefore, posAfter, posDelta, checkedAt: now.toISOString() };
            }
          } catch (e) {
            console.error(`[fix-verify] GSC error for ${doc.id}:`, e.message);
          }
        }

        // ── Write outcome to fix_verification ──────────
        await db.collection("fix_verification").doc(doc.id).update({
          status: "checked",
          outcome,
          gscResult,
          checkedAt: now.toISOString(),
        });

        // ── Write to client_memory (A16) ───────────────
        try {
          const memRef  = db.collection("client_memory").doc(fix.clientId);
          const memSnap = await memRef.get();
          const mem     = memSnap.exists ? memSnap.data() : {};
          const fixLog  = mem.fixOutcomes || [];
          fixLog.push({ field: fix.field, issueType: fix.issueType, outcome, checkedAt: now.toISOString(), url: fix.wpPostUrl });
          await memRef.set({ ...mem, fixOutcomes: fixLog.slice(-50), lastUpdated: now.toISOString() }, { merge: true });
        } catch { /* non-blocking */ }

        // ── Write to global_patterns (Sprint 5 — cross-client) ─
        if (outcome !== "no_data") {
          try {
            const clientDoc = await db.collection("clients").doc(fix.clientId).get();
            const cData     = clientDoc.data() || {};
            await db.collection("global_patterns").add({
              clientId:     fix.clientId,
              fixType:      fix.field,
              issueType:    fix.issueType,
              outcome,
              ownerId:      fix.ownerId,
              industry:     (cData.industry || "").toLowerCase().trim() || null,
              businessType: (cData.businessType || "").toLowerCase().trim() || null,
              ctrBefore:    gscResult?.ctrBefore  || null,
              ctrAfter:     gscResult?.ctrAfter   || null,
              posBefore:    gscResult?.posBefore  || null,
              posAfter:     gscResult?.posAfter   || null,
              recordedAt:   now.toISOString(),
            });
          } catch { /* non-blocking */ }
        }

        // ── If fix degraded → trigger CMO re-assessment ──
        if (outcome === "degraded") {
          try {
            const { getUserKeys } = require("./utils/getUserKeys");
            const cmoKeys = await getUserKeys(fix.ownerId).catch(() => ({}));
            const { runCMO } = require("./agents/CMO_agent");
            await runCMO(fix.clientId, cmoKeys);
            console.log(`[fix-verify] CMO re-triggered for ${fix.clientId} (degraded fix)`);
          } catch (cmoErr) {
            console.error(`[fix-verify] CMO re-trigger failed:`, cmoErr.message);
          }
        }

        console.log(`[fix-verify] ${fix.field} on ${fix.wpPostUrl} → ${outcome}`);
      } catch (e) {
        console.error(`[fix-verify] Error on doc ${doc.id}:`, e.message);
      }
    }
  } catch (err) {
    console.error("[fix-verify] Error:", err.message);
  }
}, 60 * 60 * 1000); // check every hour — guarded to run at 03:00 UTC only

// ── 404 Handler ────────────────────────────────────
app.use((req, res) => {
  const origin = req.headers.origin || "";
  if (!origin || origin.endsWith(".onrender.com") || origin === process.env.FRONTEND_URL || origin.startsWith("http://localhost")) {
    res.header("Access-Control-Allow-Origin", origin || "*");
    res.header("Access-Control-Allow-Credentials", "true");
  }
  res.status(404).json({ error: "Route not found" });
});

// ── Error Handler ──────────────────────────────────
// Must set CORS headers here too — otherwise 500 errors look like CORS errors in the browser
app.use((err, req, res, next) => {
  const origin = req.headers.origin || "";
  if (
    !origin ||
    origin.endsWith(".onrender.com") ||
    origin === process.env.FRONTEND_URL ||
    origin.startsWith("http://localhost")
  ) {
    res.header("Access-Control-Allow-Origin",  origin || "*");
    res.header("Access-Control-Allow-Credentials", "true");
  }
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