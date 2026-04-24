const { saveState, getState }                          = require("../shared-state/stateManager");
const { callLLM, parseJSON }                           = require("../utils/llm");
const { db, FieldValue }                               = require("../config/firebase");
const { calculateScore, saveScoreHistory, generateForecast } = require("../utils/scoreCalculator");
const { getTopTasks }                                  = require("../utils/taskQueue");

/**
 * A9 — Reporting & Monitoring Agent
 * Two modes:
 * 1. generateReport() — produces full 8-step narrative report → approval queue
 * 2. checkAlerts()    — detects anomalies and stores alerts
 */

// ── Generate Full Report ───────────────────────────
async function generateReport(clientId, keys, gscToken = null) {
  try {
  const brief      = await getState(clientId, "A1_brief");
  const audit      = await getState(clientId, "A2_audit");
  const keywords   = await getState(clientId, "A3_keywords");
  const competitor = await getState(clientId, "A4_competitor");
  const content    = await getState(clientId, "A5_content");
  const onpage     = await getState(clientId, "A6_onpage");
  const technical  = await getState(clientId, "A7_technical");
  const geo        = await getState(clientId, "A8_geo");

  if (!brief?.signedOff) return { success: false, error: "A1 brief not signed off" };

  // ── GSC Data (if token available) ─────────────────
  let gscSummary = null;
  if (gscToken && brief.websiteUrl) {
    try {
      const endDate   = new Date().toISOString().split("T")[0];
      const startDate = new Date(Date.now() - 28*24*60*60*1000).toISOString().split("T")[0];
      const apiUrl    = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(brief.websiteUrl)}/searchAnalytics/query`;
      const res = await fetch(apiUrl, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${gscToken}` },
        body:    JSON.stringify({ startDate, endDate, dimensions: ["query"], rowLimit: 10 }),
        signal:  AbortSignal.timeout(20000),
      });
      const data = await res.json();
      if (data.rows) {
        const rows          = data.rows;
        const totalClicks   = rows.reduce((a, r) => a + r.clicks, 0);
        const totalImpress  = rows.reduce((a, r) => a + r.impressions, 0);
        const avgCTR        = rows.length ? (rows.reduce((a,r) => a+r.ctr, 0)/rows.length*100).toFixed(1) : 0;
        const avgPos        = rows.length ? (rows.reduce((a,r) => a+r.position, 0)/rows.length).toFixed(1) : 0;
        gscSummary = { totalClicks, totalImpress, avgCTR, avgPos, topKeywords: rows.slice(0,5).map(r=>({ keyword: r.keys[0], clicks: r.clicks, position: r.position.toFixed(1) })), period: `${startDate} → ${endDate}` };
      }
    } catch { /* skip */ }
  }

  // ── LLM: Generate 8-step narrative report ─────────
  const auditSummary = audit ? `Health Score: ${audit.healthScore}/100. Issues: ${audit.summary?.p1Count} P1, ${audit.summary?.p2Count} P2, ${audit.summary?.p3Count} P3.` : "Audit not run";
  const kwSummary    = keywords ? `${keywords.totalKeywords} keywords mapped across ${Object.keys(keywords.clusters || {}).length} clusters.` : "Not run";
  const compSummary  = competitor ? `${competitor.summary?.notRanking} keywords not ranking, ${competitor.summary?.rankingTop3} in top 3. ${competitor.summary?.contentGapsFound} content gaps.` : "Not run";

  const prompt = `You are a senior SEO account manager writing a client report.

Client: ${brief.businessName} (${brief.websiteUrl})
Period: Last 28 days
Goals: ${(brief.goals || []).join(", ")}

Data available:
- Technical Audit: ${auditSummary}
- Keywords: ${kwSummary}
- Competitor: ${compSummary}
- On-Page Fixes: ${onpage ? onpage.totalFixes + " fixes identified" : "Not run"}
- Technical/CWV: ${technical ? `Mobile score: ${technical.summary?.mobileScore || "N/A"}/100` : "Not run"}
- GEO/Off-Page: ${geo ? `${geo.summary?.citationTargets} citation targets, ${geo.summary?.quickWinLinks} link opportunities` : "Not run"}
- GSC Data: ${gscSummary ? `${gscSummary.totalClicks} clicks, ${gscSummary.totalImpress} impressions, avg position ${gscSummary.avgPos}` : "Not connected"}

Write an 8-step SEO report. Return ONLY valid JSON:
{
  "verdict": "1-2 sentence executive summary — strong/mixed/needs attention and why",
  "kpiScorecard": [
    { "metric": "metric name", "value": "value", "vs": "vs target or prior", "status": "green|amber|red", "notes": "brief context" }
  ],
  "whyItHappened": "Context paragraph explaining key movements — seasonality, updates, competitor changes",
  "whatWorked": [
    { "item": "what worked", "impact": "quantified or described impact", "keepDoing": "recommended action" }
  ],
  "whatDidnt": [
    { "item": "what didn't work", "hypothesis": "why it didn't work", "action": "recommended fix" }
  ],
  "technicalHealthSummary": "Plain language 2-3 sentence summary of technical state for client",
  "next3Actions": [
    { "action": "specific action", "why": "business reason", "expectedOutcome": "what will improve", "priority": 1 }
  ],
  "offPageSummary": "Backlink and citation status summary in plain language"
}`;

  let reportData;
  try {
    const response = await callLLM(clientId, keys, prompt, {system: masterPrompt || undefined,  maxTokens: 4000, temperature: 0.5 });
    reportData = parseJSON(response);
  } catch (e) {
    console.warn(`[A9] LLM failed — using rule-based report fallback: ${e.message}`);
    const p1Count = (audit?.issues?.p1 || []).length;
    const p2Count = (audit?.issues?.p2 || []).length;
    const topKws  = (keywords?.keywordMap || []).slice(0, 3).map(k => k.keyword).join(", ");
    reportData = {
      executiveSummary: `${brief.businessName} has ${p1Count} critical and ${p2Count} high-priority SEO issues. Top keyword targets: ${topKws || "not yet identified"}.`,
      healthScore:      audit?.score || 50,
      wins:             [],
      opportunities:    (audit?.issues?.p1 || []).slice(0, 3).map(i => ({ item: i.detail || i.type, impact: "high" })),
      whatWorked:       [],
      whatDidnt:        [],
      technicalHealthSummary: `Site has ${p1Count} critical issues and ${p2Count} warnings. Full technical audit complete.`,
      next3Actions:     [
        { action: "Fix critical SEO issues", why: "Blocks rankings", expectedOutcome: "Improved crawlability", priority: 1 },
        { action: "Optimise top keyword pages", why: "Increase organic traffic", expectedOutcome: "Higher rankings", priority: 2 },
        { action: "Build internal links", why: "Spread page authority", expectedOutcome: "Better indexation", priority: 3 },
      ],
      offPageSummary: "Backlink analysis pending — run A11 link builder for details.",
      generatedBy: "rule-engine",
    };
  }

  // ── Save to approval queue (human gate) ───────────
  const ref = db.collection("approval_queue").doc();
  await ref.set({
    id:         ref.id,
    clientId,
    type:       "client_report",
    agent:      "A9",
    status:     "pending",
    data:       { reportData, gscSummary, generatedAt: new Date().toISOString() },
    createdAt:  FieldValue.serverTimestamp(),
  });

  // ── Save rank snapshot to history (for trend tracking) ──
  if (competitor?.rankingMatrix?.length > 0) {
    const snapshot = {
      clientId,
      date:     new Date().toISOString().split("T")[0],
      keywords: competitor.rankingMatrix.slice(0, 20).map(r => ({
        keyword:  r.keyword,
        position: r.clientRank || null,
        category: r.opportunity,
      })),
      healthScore:   audit?.healthScore || null,
      mobileScore:   technical?.summary?.mobileScore || null,
      gscClicks:     gscSummary?.totalClicks || null,
      gscImpressions:gscSummary?.totalImpress || null,
      gscAvgPos:     gscSummary?.avgPos || null,
      createdAt:     new Date().toISOString(),
    };
    // Use clientId + date as doc ID so re-running same day overwrites instead of duplicating
    await db.collection("rank_history").doc(`${clientId}_${snapshot.date}`).set(snapshot);
  }

  // ── Calculate 4-dimension SEO score and save snapshot ──
  let scoreData = null;
  let forecast  = null;
  try {
    scoreData = calculateScore(audit, keywords, geo, onpage, technical);
    const topTasks = await getTopTasks(clientId, 5);
    forecast  = generateForecast(topTasks, scoreData.overall);
    await saveScoreHistory(clientId, {
      ...scoreData,
      gscClicks:      gscSummary?.totalClicks || null,
      gscImpressions: gscSummary?.totalImpress || null,
      gscAvgPos:      gscSummary?.avgPos || null,
      healthScore:    audit?.healthScore || null,
    });
    // Save score to client doc for list view display
    await db.collection("clients").doc(clientId).update({ seoScore: scoreData.overall }).catch(() => {});

    // Sprint 1 — Fill in baseline snapshot on first pipeline completion (once only)
    try {
      const baseline = await getState(clientId, "baseline");
      if (baseline && !baseline.firstPipelineAt) {
        await saveState(clientId, "baseline", {
          ...baseline,
          seoScore:        scoreData.overall,
          healthScore:     audit?.healthScore || null,
          keywordsRanking: keywords?.totalKeywords || null,
          topIssues:       audit?.summary ? { p1: audit.summary.p1Count, p2: audit.summary.p2Count, p3: audit.summary.p3Count } : null,
          firstPipelineAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.error("[A9] Baseline snapshot update error:", e.message);
    }
  } catch (e) {
    console.error("[A9] Score calculation error:", e.message);
  }

  const result = {
    status:       "complete",
    reportData,
    gscSummary,
    scoreBreakdown: scoreData,
    forecast,
    approvalId:   ref.id,
    rankSnapshotSaved: competitor?.rankingMatrix?.length > 0,
    humanGateNote:"Report draft saved — human must review, add relationship context, and trigger send.",
    generatedAt:  new Date().toISOString(),
  };

  await saveState(clientId, "A9_report", result);

  // Sprint 2 — A18: notify that report is ready (non-blocking)
  try {
    const { notifyReportReady } = require("./A18_clientNotifier");
    await notifyReportReady(clientId);
  } catch { /* non-blocking */ }

  return { success: true, report: result };
  } catch (e) {
    console.error(`[A9] Report generation failed for ${clientId}:`, e.message);
    return { success: false, error: e.message };
  }
}

// ── Check Alerts (lightweight monitoring) ─────────
async function checkAlerts(clientId, keys) {
  try {
  const brief      = await getState(clientId, "A1_brief");
  const audit      = await getState(clientId, "A2_audit");
  const techData   = await getState(clientId, "A7_technical");
  const competitor = await getState(clientId, "A4_competitor");

  if (!brief) return { success: false, error: "No brief found" };

  const alerts = [];

  // Check for P1 issues from A2
  if (audit?.issues?.p1?.length > 0) {
    for (const issue of audit.issues.p1) {
      alerts.push({
        clientId,
        tier:     "P1",
        type:     issue.type,
        message:  issue.detail,
        fix:      issue.fix,
        source:   "A2",
        resolved: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  }

  // Check for poor mobile performance
  const mobileScore = techData?.summary?.mobileScore;
  if (mobileScore !== null && mobileScore < 50) {
    alerts.push({
      clientId,
      tier:    "P1",
      type:    "poor_mobile_performance",
      message: `Mobile PageSpeed score is ${mobileScore}/100 — below 50 impacts rankings`,
      fix:     "Run A7 for detailed speed fix recommendations",
      source:  "A7",
      resolved: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  } else if (mobileScore !== null && mobileScore < 70) {
    alerts.push({
      clientId,
      tier:    "P2",
      type:    "low_mobile_performance",
      message: `Mobile PageSpeed score is ${mobileScore}/100 — needs improvement`,
      fix:     "Review A7 speed fix recommendations",
      source:  "A7",
      resolved: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  // Check A4 competitor data — if >70% of checked keywords are not ranking, flag P2
  if (competitor?.rankingMatrix?.length > 0) {
    const total       = competitor.rankingMatrix.length;
    const notRanking  = competitor.rankingMatrix.filter(r => !r.clientRank || r.clientRank > 100).length;
    if (notRanking / total > 0.7) {
      alerts.push({
        clientId,
        tier:    "P2",
        type:    "low_keyword_visibility",
        message: `${notRanking} of ${total} tracked keywords (${Math.round(notRanking/total*100)}%) are not ranking in top 100`,
        fix:     "Review A4 competitor gaps and prioritise content creation for unranked keywords",
        source:  "A4",
        resolved: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  }

  // Save alerts to Firestore
  const saved = [];
  for (const alert of alerts) {
    const ref = db.collection("alerts").doc();
    await ref.set({ id: ref.id, ...alert });
    saved.push(ref.id);
  }

  // Auto-trigger A23 investigator if new P1 alerts were created
  const newP1Count = alerts.filter(a => a.tier === "P1").length;
  if (newP1Count > 0) {
    try {
      const { runA23 } = require("./A23_investigator");
      const inv = await runA23(clientId, keys);
      if (inv?.success) {
        console.log(`[A9→A23] Investigated ${inv.investigated} P1 alert(s) for ${clientId}`);
      }
    } catch (e) {
      console.warn(`[A9→A23] Auto-investigation failed for ${clientId}:`, e.message);
    }
  }

  return { success: true, alertsCreated: saved.length, alerts };
  } catch (e) {
    console.error(`[A9] checkAlerts failed for ${clientId}:`, e.message);
    return { success: false, error: e.message };
  }
}

module.exports = { generateReport, checkAlerts };
