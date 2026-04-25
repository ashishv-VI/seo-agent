require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const { db }  = require("./config/firebase");

// ── Process-level safety net ──────────────────────
// Any unhandled rejection or uncaught exception anywhere in the 25 agents /
// dozen routes / 4 cron loops would otherwise crash the Node process. On
// Render free tier that causes a restart → next request trips a new crash →
// crash loop → the frontend sees a mix of 200s and 502s ("flapping").
// Log loudly and keep the server alive so one bad async doesn't take it down.
process.on("unhandledRejection", (reason, promise) => {
  console.error("[fatal] Unhandled promise rejection:", reason?.stack || reason);
});
process.on("uncaughtException", (err) => {
  console.error("[fatal] Uncaught exception:", err?.stack || err);
});

// Load rate limiters — graceful fallback if express-rate-limit not yet installed
let authLimiter, agentLimiter, chatLimiter, apiLimiter;
try {
  ({ authLimiter, agentLimiter, chatLimiter, apiLimiter, presalesLimiter } = require("./middleware/rateLimiter"));
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
const aiChatRoutes       = require("./routes/aiChat");

const app  = express();
const PORT = process.env.PORT || 5000;

function isAllowedOrigin(origin) {
  return (
    !origin ||
    origin.endsWith(".onrender.com") ||
    origin === process.env.FRONTEND_URL ||
    origin.startsWith("http://localhost") ||
    origin.startsWith("http://127.0.0.1")
  );
}

// ── CORS ────────────────────────────────────────────
const corsOptions = {
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (isAllowedOrigin(origin)) {
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
app.get("/api/presales/audit", presalesLimiter, async (req, res) => {
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
app.use("/api/ai",          apiLimiter,   aiChatRoutes);

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
        const { checkBudget }  = require("./utils/costTracker");
        const { checkAlerts }  = require("./agents/A9_monitoring");
        const { runA15 }       = require("./agents/A15_competitorMonitor");
        const { runA16 }       = require("./agents/A16_memory");
        const keys = await getUserKeys(data.ownerId).catch(() => null);
        if (!keys) continue;

        // ── Rule-based monitoring ALWAYS runs regardless of budget ──
        // A9 (alerts) and A15 (competitor sitemap diff) are rule-based — they
        // don't call LLM for detection. Must never be paused by budget gate.
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

        // ── Budget gate: skip LLM-heavy agent runs below this line ──
        // A23/rulesEngine/A16/CMO all call the LLM. If the monthly budget is
        // blown, pause those — but monitoring above still ran.
        const budgetStatus = await checkBudget(doc.id);
        if (!budgetStatus.allowed) {
          console.log(`[daily-monitor] Skipping LLM agents for ${data.name} — budget exceeded ($${budgetStatus.spent.toFixed(2)}/$${budgetStatus.budget.toFixed(2)})`);
          continue;
        }

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

        // A25: Core Update Scanner — runs daily after A9 alerts, checks E-E-A-T + AI content risk
        try {
          const { runA25 } = require("./agents/A25_coreUpdateScanner");
          const cuResult = await runA25(doc.id, keys);
          if (cuResult?.highRiskCount > 0) {
            console.log(`[daily-monitor] A25: ${cuResult.highRiskCount} high-risk core update issue(s) for ${data.name}`);
            await db.collection("notifications").add({
              clientId:  doc.id,
              ownerId:   data.ownerId,
              type:      "core_update_risk",
              title:     "Google Core Update Risk Detected",
              message:   `${cuResult.highRiskCount} high-risk issue(s) found: ${cuResult.overallRisk} risk level. Check Core Update tab in Control Room.`,
              read:      false,
              createdAt: new Date().toISOString(),
            }).catch(() => {});
          }
        } catch { /* non-blocking */ }

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

        // CMO: daily self-scheduled wake-up — skip if pipeline is currently running
        // to avoid making decisions on half-complete data (e.g. A2 still crawling).
        const freshClientSnap = await db.collection("clients").doc(doc.id).get().catch(() => null);
        const freshStatus = freshClientSnap?.data()?.pipelineStatus;
        if (freshStatus === "running") {
          console.log(`[daily-monitor] Skipping CMO for ${data.name} — pipeline is running`);
          continue;
        }

        try {
          const { runCMO } = require("./agents/CMO_agent");
          const cmoResult = await runCMO(doc.id, keys);
          // runCMO returns { success, cmo: { decision, reasoning, nextAgents, confidence } }
          // The previous code read cmoResult.decision.nextAgents which was always
          // undefined — the whole daily wake-up block silently no-op'd.
          const cmoDecision = cmoResult?.cmo;
          if (cmoDecision?.nextAgents?.length > 0) {
            console.log(`[daily-monitor] CMO: queued ${cmoDecision.nextAgents.length} action(s) for ${data.name}: ${cmoDecision.nextAgents.join(", ")} (conf ${cmoDecision.confidence})`);
            await db.collection("notifications").add({
              clientId:  doc.id,
              ownerId:   data.ownerId,
              type:      "cmo_daily_decision",
              title:     `Daily CMO decision — ${data.name}`,
              message:   `${cmoDecision.decision}. ${cmoDecision.reasoning || ""}`.slice(0, 400),
              read:      false,
              createdAt: new Date().toISOString(),
            }).catch(() => {});

            // Auto-execute if confidence is high enough AND playbook veto already ran.
            // The cmo_queue item was already written by runCMO with status="pending".
            // For high-confidence (≥0.85) decisions we fire the agents directly so the
            // agent actually acts on its own — not just "wakes up and files a ticket".
            if ((cmoDecision.confidence || 0) >= 0.85) {
              const { runAgentById } = require("./agents/agentRunner");
              for (const agentId of cmoDecision.nextAgents.slice(0, 3)) {
                runAgentById(agentId, doc.id, keys).then(r => {
                  console.log(`[daily-monitor] auto-exec ${agentId} for ${data.name} → ${r?.success ? "ok" : r?.error || "skip"}`);
                }).catch(e => {
                  console.error(`[daily-monitor] auto-exec ${agentId} failed:`, e.message);
                });
              }
            }
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

        // A24: check if KPI goals are on track after the re-run completes
        // Runs in background — doesn't block the pipeline
        setTimeout(async () => {
          try {
            const { runA24 } = require("./agents/A24_strategist");
            const strategyResult = await runA24(doc.id, keys);
            if (strategyResult?.success && !strategyResult.onTrack) {
              console.log(`[scheduler] A24: ${data.name} is OFF TRACK — ${strategyResult.verdict}`);
            }
          } catch (e) {
            console.error(`[scheduler] A24 error for ${data.name}:`, e.message);
          }
        }, 60 * 60 * 1000); // wait 1 hour for the pipeline to finish first
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
            // Auto-run CMO to re-assess strategy, then auto-execute high-confidence decisions.
            // Mirrors the daily-monitor pattern: watchdog previously fired CMO but never ran
            // the agents it proposed, so a score drop just filed a ticket nobody actioned.
            try {
              const { runCMO }        = require("./agents/CMO_agent");
              const { runAgentById }  = require("./agents/agentRunner");
              const cmoResult = await runCMO(doc.id, keys);
              const cmoDecision = cmoResult?.cmo;
              if (cmoDecision?.nextAgents?.length > 0 && (cmoDecision.confidence || 0) >= 0.85) {
                for (const agentId of cmoDecision.nextAgents.slice(0, 3)) {
                  runAgentById(agentId, doc.id, keys).then(r => {
                    console.log(`[watchdog] auto-exec ${agentId} for ${data.name} → ${r?.success ? "ok" : r?.error || "skip"}`);
                  }).catch(e => {
                    console.error(`[watchdog] auto-exec ${agentId} failed:`, e.message);
                  });
                }
              }
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
// Checks every hour. Uses a Firestore flag to ensure it runs exactly once per month
// even if Render cold-starts outside the original 08:00-09:00 UTC window.
setInterval(async () => {
  const now = new Date();
  if (now.getUTCDate() !== 1) return;       // 1st of month only

  const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  try {
    const flagRef = db.collection("cron_flags").doc(`monthly_report_${monthKey}`);
    const flag    = await flagRef.get();
    if (flag.exists) return; // already ran this month
    await flagRef.set({ ranAt: now.toISOString() });
  } catch { return; }

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

// ── Content Verification — runs daily at 04:00 UTC ──────────────────────────
// Checks published A14 content drafts that are 14+ days old:
//   1. Pings Google "site:url" to check indexing
//   2. Pulls GSC data for the target keyword to check ranking
//   3. Writes outcome to content_drafts doc + client_memory
// Without this, A14 pushes content and the agent never learns if it worked.
setInterval(async () => {
  const now = new Date();
  // Run once per day — Firestore flag survives cold-starts.
  const dayKey = now.toISOString().split("T")[0];
  try {
    const flagRef = db.collection("cron_flags").doc(`content_verify_${dayKey}`);
    const flag    = await flagRef.get();
    if (flag.exists) return;
    await flagRef.set({ ranAt: now.toISOString() });
  } catch { return; }

  console.log("[content-verify] Starting daily content verification...");
  try {
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const snap = await db.collection("content_drafts")
      .where("status", "==", "published")
      .where("verificationStatus", "==", null)
      .limit(30)
      .get();

    // Fallback: also pick up published items that have never been verified
    // (verificationStatus field might not exist on older docs)
    let docs = snap.docs.filter(d => {
      const data = d.data();
      const pub = data.publishedAt?._seconds
        ? new Date(data.publishedAt._seconds * 1000).toISOString()
        : data.publishedAt || data.createdAt?._seconds
          ? new Date((data.createdAt?._seconds || 0) * 1000).toISOString()
          : null;
      return pub && pub <= fourteenDaysAgo && !data.verificationStatus;
    });

    if (docs.length === 0) {
      // Try broader query for docs missing the field entirely
      const broadSnap = await db.collection("content_drafts")
        .where("status", "==", "published")
        .limit(30)
        .get();
      docs = broadSnap.docs.filter(d => {
        const data = d.data();
        if (data.verificationStatus) return false;
        const pub = data.publishedAt?._seconds
          ? new Date(data.publishedAt._seconds * 1000).toISOString()
          : null;
        return pub && pub <= fourteenDaysAgo;
      });
    }

    console.log(`[content-verify] ${docs.length} draft(s) due for verification`);

    for (const doc of docs) {
      const draft = doc.data();
      try {
        const { getUserKeys } = require("./utils/getUserKeys");
        const clientDoc = await db.collection("clients").doc(draft.clientId).get();
        if (!clientDoc.exists) continue;
        const ownerId = clientDoc.data().ownerId;
        const keys    = await getUserKeys(ownerId).catch(() => null);
        const gscToken = keys?.gscToken || null;

        let indexed = false;
        let ranking = null;

        // Check indexing via GSC URL Inspection (or fallback: check GSC page data)
        if (gscToken && draft.wpEditUrl) {
          try {
            const siteUrl   = clientDoc.data().websiteUrl || "";
            const slug      = draft.slug || "";
            const pageUrl   = slug ? `${siteUrl.replace(/\/+$/, "")}/${slug}` : draft.wpEditUrl;
            const gscBase   = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
            const afterStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
            const afterEnd   = now.toISOString().split("T")[0];

            const res = await fetch(gscBase, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${gscToken}` },
              body: JSON.stringify({
                startDate: afterStart,
                endDate:   afterEnd,
                dimensions: ["page"],
                rowLimit:   5,
                dimensionFilterGroups: [{ filters: [{ dimension: "page", operator: "contains", expression: slug || pageUrl.replace(/^https?:\/\/[^/]+/, "") }] }],
              }),
              signal: AbortSignal.timeout(15000),
            });

            const gscData = await res.json();
            const row = gscData.rows?.[0];
            if (row) {
              indexed = true;
              ranking = {
                impressions: row.impressions || 0,
                clicks:      row.clicks      || 0,
                ctr:         row.ctr         || 0,
                position:    row.position    || null,
              };
            }
          } catch { /* GSC check failed — mark as no_data */ }
        }

        const outcome = indexed
          ? (ranking?.position && ranking.position <= 20 ? "ranking" : "indexed_not_ranking")
          : "not_indexed";

        await db.collection("content_drafts").doc(doc.id).update({
          verificationStatus: outcome,
          verifiedAt:         now.toISOString(),
          gscRanking:         ranking,
          indexed,
        });

        // Write to client_memory so CMO learns which content types work
        try {
          const memRef  = db.collection("client_memory").doc(draft.clientId);
          const memSnap = await memRef.get();
          const mem     = memSnap.exists ? memSnap.data() : {};
          const contentLog = mem.contentOutcomes || [];
          contentLog.push({
            keyword:    draft.focusKeyphrase || draft.keyword,
            title:      draft.title,
            outcome,
            ranking:    ranking?.position || null,
            verifiedAt: now.toISOString(),
          });
          await memRef.set({ ...mem, contentOutcomes: contentLog.slice(-30), lastUpdated: now.toISOString() }, { merge: true });
        } catch { /* non-blocking */ }

        // Write to global_patterns for cross-client content learning
        if (outcome !== "not_indexed") {
          try {
            await db.collection("global_patterns").add({
              clientId:   draft.clientId,
              fixType:    "content_creation",
              issueType:  draft.intent || "informational",
              outcome:    outcome === "ranking" ? "improved" : "no_change",
              confidence: outcome === "ranking" ? 0.9 : 0.5,
              ownerId,
              industry:   clientDoc.data().industry || null,
              createdAt:  now.toISOString(),
            });
          } catch { /* non-blocking */ }
        }

        console.log(`[content-verify] "${draft.title}" → ${outcome}`);
      } catch (e) {
        console.error(`[content-verify] Error on ${doc.id}:`, e.message);
      }
    }
  } catch (err) {
    console.error("[content-verify] Error:", err.message);
  }
}, 60 * 60 * 1000); // hourly, guarded to 04:00 UTC

// ── Fix Verification Loop — runs daily at 03:00 UTC ───────────────────────────
// For each pending fix_verification doc where checkAfter < now:
//   1. Pull GSC data for the specific URL (before vs after)
//   2. Compare CTR / position
//   3. Mark outcome: improved | no_change | degraded | no_data
//   4. Write to client_memory so CMO learns what works
//   5. Write to global_patterns for cross-client intelligence
setInterval(async () => {
  const now = new Date();
  // Run once per day — Firestore flag survives cold-starts.
  const dayKey = now.toISOString().split("T")[0];
  try {
    const flagRef = db.collection("cron_flags").doc(`fix_verify_${dayKey}`);
    const flag    = await flagRef.get();
    if (flag.exists) return;
    await flagRef.set({ ranAt: now.toISOString() });
  } catch { return; }

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
          fixLog.push({
            field:          fix.field,
            issueType:      fix.issueType,
            outcome,
            checkedAt:      now.toISOString(),
            url:            fix.wpPostUrl,
            // Retry attribution: carry retry metadata so CMO's reweightConfidence
            // can tell "direct success" from "succeeded on attempt 2" when reading
            // fixOutcomes for this issue type.
            isRetry:        !!fix.isRetry,
            retryCount:     fix.retryCount || 0,
            originalTaskId: fix.originalTaskId || null,
          });
          await memRef.set({ ...mem, fixOutcomes: fixLog.slice(-50), lastUpdated: now.toISOString() }, { merge: true });
        } catch { /* non-blocking */ }

        // ── If this was a retry, mark the ORIGINAL task with the final outcome ──
        // Otherwise the original task stays "failed" forever and CMO can't tell
        // the fix type eventually worked — it just sees two failed tasks for
        // the same page and assumes the playbook is broken.
        if (fix.isRetry && fix.originalTaskId && outcome !== "no_data") {
          try {
            await db.collection("task_queue").doc(fix.clientId).collection("tasks").doc(fix.originalTaskId).update({
              retryOutcome:       outcome,
              retryOutcomeAt:     now.toISOString(),
              retryAttempts:      fix.retryCount || 1,
              finalStatus:        outcome === "improved" ? "resolved_via_retry" : "retry_failed",
            }).catch(() => {});
          } catch { /* non-blocking */ }
        }

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

// ── CMO Queue Consumer — runs every 30 min ──────────────────────────────────
// A23 (investigator), A24 (strategist), watchdog, rulesEngine, and CMO itself
// all write decisions to `cmo_queue` with status="pending". Before this cron,
// those items just sat there — only a manual click in the UI ran them. For
// an autonomous agent that's a dead-end: the agent files a ticket and waits.
//
// This consumer picks up pending items with confidence ≥0.85 and auto-runs
// their nextAgents. Lower-confidence items remain "pending" for human approval.
setInterval(async () => {
  try {
    const snap = await db.collection("cmo_queue")
      .where("status", "==", "pending")
      .limit(25)
      .get();
    if (snap.empty) return;

    const { runAgentById } = require("./agents/agentRunner");
    const { getUserKeys }  = require("./utils/getUserKeys");

    for (const queueDoc of snap.docs) {
      const item = queueDoc.data();
      const confidence = item.confidence || 0;
      if (confidence < 0.85) continue; // leave for human review
      if (!item.clientId || !Array.isArray(item.nextAgents) || item.nextAgents.length === 0) {
        await queueDoc.ref.update({ status: "skipped", skippedReason: "no nextAgents", skippedAt: new Date().toISOString() }).catch(() => {});
        continue;
      }

      try {
        const clientSnap = await db.collection("clients").doc(item.clientId).get();
        if (!clientSnap.exists) {
          await queueDoc.ref.update({ status: "skipped", skippedReason: "client gone", skippedAt: new Date().toISOString() }).catch(() => {});
          continue;
        }
        const ownerId = clientSnap.data().ownerId;
        const keys    = await getUserKeys(ownerId).catch(() => null);
        if (!keys) {
          await queueDoc.ref.update({ status: "skipped", skippedReason: "no keys", skippedAt: new Date().toISOString() }).catch(() => {});
          continue;
        }

        // Mark in-flight first so a slow run doesn't get picked up twice
        await queueDoc.ref.update({ status: "executing", executingAt: new Date().toISOString() });

        const results = [];
        for (const agentId of item.nextAgents.slice(0, 3)) {
          const r = await runAgentById(agentId, item.clientId, keys);
          results.push({ agent: agentId, success: !!r?.success, error: r?.error || null });
          console.log(`[cmo-queue] auto-exec ${agentId} for ${item.clientId} → ${r?.success ? "ok" : r?.error || "skip"}`);
        }

        await queueDoc.ref.update({
          status:       "auto_executed",
          executedAt:   new Date().toISOString(),
          executedBy:   "cmo_queue_consumer",
          executeResults: results,
        });
      } catch (e) {
        console.error(`[cmo-queue] Failed to process ${queueDoc.id}:`, e.message);
        await queueDoc.ref.update({ status: "failed", failedReason: e.message, failedAt: new Date().toISOString() }).catch(() => {});
      }
    }
  } catch (err) {
    console.error("[cmo-queue] Consumer error:", err.message);
  }
}, 30 * 60 * 1000); // every 30 min

// ── Monday Morning Briefing — fires every Monday 08:00 UTC ───────────────────
// Sends one proactive notification per client: 3 opportunities + 1 threat + one action.
// The goal: agency opens Monday and already knows exactly what to do this week.
setInterval(async () => {
  const now = new Date();
  // Only Monday (day 1) between 08:00–09:00 UTC
  if (now.getUTCDay() !== 1 || now.getUTCHours() !== 8) return;

  const dayKey = now.toISOString().split("T")[0];
  try {
    const flagRef = db.collection("cron_flags").doc(`monday_briefing_${dayKey}`);
    const flag    = await flagRef.get();
    if (flag.exists) return;
    await flagRef.set({ ranAt: now.toISOString() });
  } catch { return; }

  console.log("[monday-briefing] Sending weekly briefings...");
  try {
    const snap = await db.collection("clients")
      .where("pipelineStatus", "==", "complete")
      .get();

    const { getUserKeys }  = require("./utils/getUserKeys");
    const { getState }     = require("./shared-state/stateManager");

    for (const doc of snap.docs) {
      const data = doc.data();
      try {
        const clientId = doc.id;
        const keys     = await getUserKeys(data.ownerId).catch(() => null);
        if (!keys) continue;

        const [cmoDecision, alertsSnap, competitors, brief] = await Promise.all([
          getState(clientId, "CMO_decision").catch(() => null),
          db.collection("alerts").where("clientId","==",clientId).where("resolved","==",false).limit(10).get().catch(() => null),
          getState(clientId, "A4_competitor").catch(() => null),
          getState(clientId, "A1_brief").catch(() => null),
        ]);

        const p1Alerts   = alertsSnap ? alertsSnap.docs.map(d=>d.data()).filter(a=>a.severity==="p1") : [];
        const cmo        = cmoDecision;
        const aov        = Number(brief?.avgOrderValue) || 0;
        const cur        = brief?.currency === "GBP" ? "£" : brief?.currency === "USD" ? "$" : "₹";

        // Build briefing lines
        const lines = [];

        // Opportunity 1 — CMO decision
        if (cmo?.decision) {
          lines.push(`Opportunity: ${cmo.decision}`);
        }
        // Opportunity 2 — CMO KPI impact
        if (cmo?.kpiImpact?.[0]) {
          const k = cmo.kpiImpact[0];
          const rev = k.revenueEstimate ? ` (${k.revenueEstimate})` : "";
          lines.push(`Expected: ${k.expectedLift}${rev} — ${k.mechanism}`);
        }
        // Threat — P1 alert or competitor
        if (p1Alerts.length > 0) {
          lines.push(`Threat: ${p1Alerts[0].title || p1Alerts[0].type} — ${p1Alerts[0].detail || "needs attention"}`);
        } else if (competitors?.newPages?.length > 0) {
          lines.push(`Competitor alert: ${competitors.newPages[0].domain || "competitor"} published new content on your keywords`);
        }
        // Action
        if (cmo?.nextAgents?.length > 0) {
          lines.push(`Action ready: ${cmo.nextAgents.join(" + ")} queued — approve in Control Room`);
        }

        if (lines.length === 0) continue;

        const message = lines.join(" · ");
        const confText = cmo?.confidence ? ` (${Math.round(cmo.confidence * 100)}% confidence)` : "";

        await db.collection("notifications").add({
          clientId,
          ownerId:   data.ownerId,
          type:      "monday_briefing",
          title:     `Monday Briefing — ${data.name || brief?.businessName}${confText}`,
          message,
          meta: {
            cmoDecision: cmo?.decision || null,
            nextAgents:  cmo?.nextAgents || [],
            p1Count:     p1Alerts.length,
            aov,
          },
          read:      false,
          createdAt: now.toISOString(),
        });
        console.log(`[monday-briefing] Sent briefing for ${data.name || clientId}`);
      } catch (e) {
        console.error(`[monday-briefing] Error for ${doc.id}:`, e.message);
      }
    }
  } catch (err) {
    console.error("[monday-briefing] Error:", err.message);
  }
}, 60 * 60 * 1000); // check every hour, fires only on Monday 08:00 UTC

// ── 404 Handler ────────────────────────────────────
app.use((req, res) => {
  const origin = req.headers.origin || "";
  if (isAllowedOrigin(origin)) {
    res.header("Access-Control-Allow-Origin", origin || "*");
    res.header("Access-Control-Allow-Credentials", "true");
  }
  res.status(404).json({ error: "Route not found" });
});

// ── Error Handler ──────────────────────────────────
// Must set CORS headers here too — otherwise 500 errors look like CORS errors in the browser
app.use((err, req, res, next) => {
  const origin = req.headers.origin || "";
  if (isAllowedOrigin(origin)) {
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
