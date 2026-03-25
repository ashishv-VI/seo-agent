const { saveState, getState } = require("../shared-state/stateManager");
const { callLLM, parseJSON }  = require("../utils/llm");
const { db, FieldValue }      = require("../config/firebase");

/**
 * A9 — Reporting & Monitoring Agent
 * Two modes:
 * 1. generateReport() — produces full 8-step narrative report → approval queue
 * 2. checkAlerts()    — detects anomalies and stores alerts
 */

// ── Generate Full Report ───────────────────────────
async function generateReport(clientId, keys, gscToken = null) {
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
    const response = await callLLM(prompt, keys, { maxTokens: 4000, temperature: 0.5 });
    reportData = parseJSON(response);
  } catch (e) {
    return { success: false, error: `Report generation failed: ${e.message}` };
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

  const result = {
    status:       "complete",
    reportData,
    gscSummary,
    approvalId:   ref.id,
    humanGateNote:"Report draft saved — human must review, add relationship context, and trigger send.",
    generatedAt:  new Date().toISOString(),
  };

  await saveState(clientId, "A9_report", result);
  return { success: true, report: result };
}

// ── Check Alerts (lightweight monitoring) ─────────
async function checkAlerts(clientId, keys) {
  const brief   = await getState(clientId, "A1_brief");
  const audit   = await getState(clientId, "A2_audit");
  const techData = await getState(clientId, "A7_technical");

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

  // Save alerts to Firestore
  const saved = [];
  for (const alert of alerts) {
    const ref = db.collection("alerts").doc();
    await ref.set({ id: ref.id, ...alert });
    saved.push(ref.id);
  }

  return { success: true, alertsCreated: saved.length, alerts };
}

module.exports = { generateReport, checkAlerts };
