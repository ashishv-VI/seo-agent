/**
 * Weekly Intelligence Brief Generator
 * Runs every Monday — generates a per-client intelligence brief:
 *   - Ranking movements (winners + losers)
 *   - CTR opportunities (high impressions, low CTR)
 *   - Competitor activity (new pages detected)
 *   - CMO recommended action with estimated impact
 *   - Sends HTML email to agency exec via SendGrid
 *
 * Usage (from index.js cron):
 *   const { generateWeeklyBrief, sendWeeklyBriefs } = require("./weeklyBrief");
 *   await sendWeeklyBriefs(); // processes all active clients
 */

const { getState }       = require("../shared-state/stateManager");
const { db, FieldValue } = require("../config/firebase");

/**
 * Generate weekly brief for a single client
 * @param {string} clientId
 * @param {Object} client   - client doc data (name, websiteUrl, etc.)
 * @param {string} ownerEmail
 * @returns {Object} brief data (also saved to Firestore)
 */
async function generateWeeklyBrief(clientId, client, ownerEmail) {
  const [
    brief, audit, report, keywords, competitor,
    rankHistory, latestWeekSnap, prevWeekSnap,
  ] = await Promise.all([
    getState(clientId, "A1_brief").catch(() => null),
    getState(clientId, "A2_audit").catch(() => null),
    getState(clientId, "A9_report").catch(() => null),
    getState(clientId, "A3_keywords").catch(() => null),
    getState(clientId, "A4_competitor").catch(() => null),
    // Last 2 rank history snapshots for movement detection
    db.collection("rank_history")
      .where("clientId", "==", clientId)
      .limit(2)
      .get()
      .then(s => s.docs.map(d => d.data()).sort((a, b) => (b.date || "").localeCompare(a.date || "")))
      .catch(() => []),
    db.collection("weekly_snapshots")
      .where("clientId", "==", clientId)
      .limit(1)
      .get()
      .then(s => s.docs[0]?.data() || null)
      .catch(() => null),
    db.collection("weekly_snapshots")
      .where("clientId", "==", clientId)
      .limit(2)
      .get()
      .then(s => {
        const docs = s.docs.map(d => d.data()).sort((a, b) => (b.week || "").localeCompare(a.week || ""));
        return docs[1] || null;
      })
      .catch(() => null),
  ]);

  const businessName = brief?.businessName || client?.name || "Your Site";
  const websiteUrl   = brief?.websiteUrl   || client?.websiteUrl || "";

  // ── 1. GSC Week-over-Week Delta ────────────────────────────────────────────
  const gsc     = report?.gscSummary || latestWeekSnap?.gsc || null;
  const prevGsc = prevWeekSnap?.gsc || null;
  const gscDelta = {
    clicks:      calcDelta(gsc?.totalClicks, prevGsc?.totalClicks),
    impressions: calcDelta(gsc?.totalImpress || gsc?.totalImpressions, prevGsc?.totalImpressions),
    ctr:         gsc?.avgCtr != null ? +(gsc.avgCtr * 100).toFixed(1) : null,
    position:    gsc?.avgPos != null ? +gsc.avgPos.toFixed(1) : null,
  };

  // ── 2. Ranking Movements ───────────────────────────────────────────────────
  const rankMovements = detectRankMovements(rankHistory);

  // ── 3. CTR Opportunities ───────────────────────────────────────────────────
  // Keywords with 100+ impressions but CTR < 3% — title/meta rewrites needed
  const gscKeywords   = report?.gscSummary?.topKeywords || [];
  const ctrOpps       = gscKeywords
    .filter(k => (k.impressions || 0) >= 100 && (k.ctr || 0) < 0.03)
    .slice(0, 5)
    .map(k => ({
      keyword:     k.keyword,
      impressions: k.impressions,
      ctr:         +((k.ctr || 0) * 100).toFixed(1),
      position:    k.position ? +k.position.toFixed(1) : null,
      opportunity: "Rewrite title/meta to improve CTR",
    }));

  // ── 4. Competitor Activity ─────────────────────────────────────────────────
  const competitorAlerts = [];
  try {
    const compSnap = await db.collection("alerts")
      .where("clientId", "==", clientId)
      .where("type", "==", "competitor_new_page")
      .limit(5)
      .get();
    for (const doc of compSnap.docs) {
      const d = doc.data();
      if ((d.createdAt || "") >= getISOWeekAgo()) {
        competitorAlerts.push({ competitor: d.competitor, page: d.url, detectedAt: d.createdAt });
      }
    }
  } catch { /* non-blocking */ }

  // ── 5. Critical Issues (P1) ────────────────────────────────────────────────
  const p1Issues = (audit?.issues?.p1 || []).slice(0, 3).map(i => ({
    type:   i.type,
    detail: i.detail,
    fix:    i.fix,
  }));

  // ── 6. CMO Recommended Action ──────────────────────────────────────────────
  const cmoDecision = await getState(clientId, "CMO_decision").catch(() => null);
  const topAction   = cmoDecision?.nextAgents?.[0] || null;
  const suggestion  = report?.reportData?.next3Actions?.[0] || null;

  const recommendedAction = {
    action:          cmoDecision?.decision || suggestion?.action || "Run full pipeline to get recommendations",
    reasoning:       cmoDecision?.reasoning || suggestion?.why || "",
    expectedImpact:  suggestion?.expectedOutcome || cmoDecision?.kpiImpact?.[0] || "",
    agent:           topAction || null,
    confidence:      cmoDecision?.confidence || null,
  };

  // ── 7. Quick Wins ──────────────────────────────────────────────────────────
  const quickWins = (keywords?.quickWins || []).slice(0, 3).map(k => ({
    keyword:    k.keyword,
    position:   k.currentPosition,
    volume:     k.searchVolume,
    action:     `Optimise content for "${k.keyword}" — currently position ${k.currentPosition || "unranked"}`,
  }));

  // ── Assemble Brief ─────────────────────────────────────────────────────────
  const brief_data = {
    clientId,
    clientName:         businessName,
    websiteUrl,
    weekOf:             getWeekLabel(),
    gscDelta,
    rankMovements,
    ctrOpportunities:   ctrOpps,
    competitorActivity: competitorAlerts,
    p1Issues,
    recommendedAction,
    quickWins,
    siteHealth: {
      healthScore: audit?.healthScore || null,
      p1Count:     audit?.issues?.p1?.length || 0,
      p2Count:     audit?.issues?.p2?.length || 0,
    },
    generatedAt: new Date().toISOString(),
  };

  // Save to Firestore
  try {
    await db.collection("weekly_briefs").add({
      ...brief_data,
      ownerEmail,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch { /* non-blocking */ }

  return brief_data;
}

/**
 * Send weekly briefs to all active clients
 * Called from Monday 8am cron
 */
async function sendWeeklyBriefs() {
  let sent = 0, errors = 0;

  try {
    // Get all active clients
    const clientsSnap = await db.collection("clients").where("active", "==", true).get();
    if (clientsSnap.empty) return { sent: 0, errors: 0 };

    for (const clientDoc of clientsSnap.docs) {
      const client   = clientDoc.data();
      const clientId = clientDoc.id;

      // Skip if no owner
      if (!client.ownerId) continue;

      // Get owner email
      let ownerEmail = null;
      try {
        const userDoc = await db.collection("users").doc(client.ownerId).get();
        ownerEmail = userDoc.data()?.email || null;
      } catch { /* skip */ }

      if (!ownerEmail) continue;

      try {
        const briefData = await generateWeeklyBrief(clientId, client, ownerEmail);
        await sendBriefEmail(ownerEmail, briefData, client);
        sent++;
      } catch (e) {
        console.error(`[weeklyBrief] Failed for client ${clientId}:`, e.message);
        errors++;
      }
    }
  } catch (e) {
    console.error("[weeklyBrief] Fatal error:", e.message);
  }

  return { sent, errors };
}

/**
 * Send HTML brief email via SendGrid
 */
async function sendBriefEmail(to, briefData, client) {
  const sgApiKey = process.env.SENDGRID_API_KEY;
  if (!sgApiKey) return; // SendGrid not configured — skip silently

  const html = buildBriefHtml(briefData);

  const payload = {
    personalizations: [{ to: [{ email: to }] }],
    from:             { email: process.env.SENDGRID_FROM || "reports@seodamco.com", name: "SEO AI Agent" },
    subject:          `📊 Weekly SEO Brief — ${briefData.clientName} | ${briefData.weekOf}`,
    content:          [{ type: "text/html", value: html }],
  };

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${sgApiKey}`,
      "Content-Type":  "application/json",
    },
    body:   JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`SendGrid error ${res.status}: ${err.slice(0, 200)}`);
  }
}

/**
 * Build HTML email template for weekly brief
 */
function buildBriefHtml(b) {
  const B    = "#443DCB";
  const green = "#059669";
  const red   = "#DC2626";
  const amber = "#D97706";

  const deltaColor = (v) => v == null ? "#888" : v > 0 ? green : v < 0 ? red : "#888";
  const deltaStr   = (v) => v == null ? "—" : (v > 0 ? `+${v}%` : `${v}%`);

  const rankWinnersHtml = (b.rankMovements?.winners || []).slice(0, 5).map(k =>
    `<tr><td style="padding:4px 8px">${escHtml(k.keyword)}</td><td style="color:${green}">▲ ${k.from} → ${k.to}</td></tr>`
  ).join("") || `<tr><td colspan="2" style="color:#888;padding:4px 8px">No movement data yet</td></tr>`;

  const rankLosersHtml = (b.rankMovements?.losers || []).slice(0, 5).map(k =>
    `<tr><td style="padding:4px 8px">${escHtml(k.keyword)}</td><td style="color:${red}">▼ ${k.from} → ${k.to}</td></tr>`
  ).join("") || "";

  const ctrOppsHtml = b.ctrOpportunities.slice(0, 5).map(k =>
    `<tr><td style="padding:4px 8px">${escHtml(k.keyword)}</td><td>${k.impressions?.toLocaleString()}</td><td style="color:${amber}">${k.ctr}%</td><td>${k.position || "—"}</td></tr>`
  ).join("") || `<tr><td colspan="4" style="color:#888;padding:4px 8px">No CTR opportunities found</td></tr>`;

  const p1Html = b.p1Issues.map(i =>
    `<li style="margin-bottom:8px"><strong style="color:${red}">${escHtml(i.type?.replace(/_/g, " "))}</strong><br><span style="color:#555">${escHtml(i.fix)}</span></li>`
  ).join("") || `<li style="color:#888">No critical issues</li>`;

  const quickWinsHtml = b.quickWins.map(k =>
    `<li style="margin-bottom:6px">${escHtml(k.action)}</li>`
  ).join("") || `<li style="color:#888">Run pipeline to discover quick wins</li>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:Arial,sans-serif">
<div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;margin-top:24px">

  <!-- Header -->
  <div style="background:${B};padding:28px 32px">
    <h1 style="color:#fff;margin:0;font-size:22px">📊 Weekly SEO Brief</h1>
    <p style="color:rgba(255,255,255,0.8);margin:6px 0 0">${escHtml(b.clientName)} · ${escHtml(b.weekOf)}</p>
  </div>

  <div style="padding:28px 32px">

    <!-- GSC Delta -->
    <h2 style="font-size:16px;color:#1a1a18;border-bottom:2px solid #f0f0ea;padding-bottom:8px">This Week vs Last Week</h2>
    <div style="display:flex;gap:16px;margin-bottom:24px">
      ${[
        ["Clicks",       deltaStr(b.gscDelta.clicks),       deltaColor(b.gscDelta.clicks)],
        ["Impressions",  deltaStr(b.gscDelta.impressions),  deltaColor(b.gscDelta.impressions)],
        ["CTR",          b.gscDelta.ctr != null ? b.gscDelta.ctr + "%" : "—", "#443DCB"],
        ["Avg Position", b.gscDelta.position != null ? b.gscDelta.position : "—", "#443DCB"],
      ].map(([label, val, color]) =>
        `<div style="flex:1;background:#f5f5f0;border-radius:8px;padding:12px;text-align:center">
          <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px">${label}</div>
          <div style="font-size:20px;font-weight:700;color:${color};margin-top:4px">${val}</div>
        </div>`
      ).join("")}
    </div>

    <!-- Ranking Movements -->
    <h2 style="font-size:16px;color:#1a1a18;border-bottom:2px solid #f0f0ea;padding-bottom:8px">Ranking Movements</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:13px">
      <tr style="background:#f0f0ea"><th style="padding:6px 8px;text-align:left">Keyword</th><th style="padding:6px 8px;text-align:left">Movement</th></tr>
      ${rankWinnersHtml}${rankLosersHtml}
    </table>

    <!-- CTR Opportunities -->
    <h2 style="font-size:16px;color:#1a1a18;border-bottom:2px solid #f0f0ea;padding-bottom:8px">CTR Opportunities</h2>
    <p style="font-size:13px;color:#666;margin-top:0">High impressions + low CTR = title/meta rewrite needed</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:13px">
      <tr style="background:#f0f0ea"><th style="padding:6px 8px;text-align:left">Keyword</th><th>Impressions</th><th>CTR</th><th>Position</th></tr>
      ${ctrOppsHtml}
    </table>

    <!-- Recommended Action -->
    <div style="background:#f0f4ff;border-left:4px solid ${B};border-radius:0 8px 8px 0;padding:16px;margin-bottom:24px">
      <h3 style="margin:0 0 8px;color:${B};font-size:14px">🤖 CMO Recommended Action</h3>
      <p style="margin:0;font-size:14px;color:#1a1a18">${escHtml(b.recommendedAction.action)}</p>
      ${b.recommendedAction.reasoning ? `<p style="margin:8px 0 0;font-size:12px;color:#555">${escHtml(b.recommendedAction.reasoning)}</p>` : ""}
      ${b.recommendedAction.expectedImpact ? `<p style="margin:6px 0 0;font-size:12px;color:${green}">Expected: ${escHtml(b.recommendedAction.expectedImpact)}</p>` : ""}
    </div>

    <!-- Quick Wins -->
    <h2 style="font-size:16px;color:#1a1a18;border-bottom:2px solid #f0f0ea;padding-bottom:8px">Quick Wins This Week</h2>
    <ul style="font-size:13px;color:#1a1a18;margin-bottom:24px;padding-left:20px">
      ${quickWinsHtml}
    </ul>

    <!-- P1 Issues -->
    <h2 style="font-size:16px;color:${red};border-bottom:2px solid #fee;padding-bottom:8px">⚠️ Critical Issues</h2>
    <ul style="font-size:13px;margin-bottom:24px;padding-left:20px">
      ${p1Html}
    </ul>

    <!-- Footer -->
    <div style="border-top:1px solid #f0f0ea;padding-top:20px;font-size:12px;color:#888">
      <p>Generated by SEO AI Agent · ${new Date().toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" })}</p>
      <p>Site: <a href="${escHtml(b.websiteUrl)}" style="color:${B}">${escHtml(b.websiteUrl)}</a></p>
    </div>

  </div>
</div>
</body></html>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcDelta(curr, prev) {
  if (curr == null || prev == null || prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 100);
}

function detectRankMovements(rankHistory) {
  if (!rankHistory || rankHistory.length < 2) return { winners: [], losers: [] };
  const latest = rankHistory[0]?.keywords || rankHistory[0]?.rankings || [];
  const prev   = rankHistory[1]?.keywords || rankHistory[1]?.rankings || [];

  if (!latest.length || !prev.length) return { winners: [], losers: [] };

  const prevMap = {};
  for (const k of prev) prevMap[k.keyword] = k.position;

  const winners = [], losers = [];
  for (const k of latest) {
    const prevPos = prevMap[k.keyword];
    if (prevPos == null || k.position == null) continue;
    const moved = prevPos - k.position; // positive = improvement
    if (moved >= 3)  winners.push({ keyword: k.keyword, from: prevPos, to: k.position, moved });
    if (moved <= -3) losers.push({ keyword:  k.keyword, from: prevPos, to: k.position, moved });
  }

  winners.sort((a, b) => b.moved - a.moved);
  losers.sort((a, b) => a.moved - b.moved);
  return { winners: winners.slice(0, 5), losers: losers.slice(0, 5) };
}

function getWeekLabel() {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay() + 1); // Monday
  return `Week of ${start.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
}

function getISOWeekAgo() {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
}

function escHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

module.exports = { generateWeeklyBrief, sendWeeklyBriefs, buildBriefHtml };
