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
 * Send HTML brief email — tries SendGrid first, falls back to Nodemailer (Gmail/SMTP)
 */
async function sendBriefEmail(to, briefData, client) {
  const html    = buildBriefHtml(briefData);
  const subject = `📊 Weekly SEO Brief — ${briefData.clientName} | ${briefData.weekOf}`;

  // Try SendGrid first (production preference)
  const sgApiKey = process.env.SENDGRID_API_KEY;
  if (sgApiKey) {
    try {
      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method:  "POST",
        headers: { "Authorization": `Bearer ${sgApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from:             { email: process.env.SENDGRID_FROM || "reports@seodamco.com", name: "SEO AI Agent" },
          subject, content: [{ type: "text/html", value: html }],
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) return;
      console.warn(`[weeklyBrief] SendGrid failed (${res.status}) — falling back to nodemailer`);
    } catch (e) {
      console.warn(`[weeklyBrief] SendGrid error — falling back to nodemailer:`, e.message);
    }
  }

  // Fallback: nodemailer (Gmail/SMTP) via shared emailer
  try {
    const nodemailer = require("nodemailer");
    let transport = null;
    if (process.env.EMAIL_HOST) {
      transport = nodemailer.createTransport({
        host:   process.env.EMAIL_HOST,
        port:   parseInt(process.env.EMAIL_PORT || "587"),
        secure: process.env.EMAIL_PORT === "465",
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      });
    } else if (process.env.GMAIL_USER && process.env.GMAIL_PASS) {
      transport = nodemailer.createTransport({
        service: "gmail",
        auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS },
      });
    }
    if (!transport) {
      console.warn("[weeklyBrief] No email transport configured — brief saved to Firestore only");
      return;
    }
    await transport.sendMail({
      from: `"SEO AI Agent" <${process.env.EMAIL_FROM || process.env.GMAIL_USER || "noreply@seo-agent.ai"}>`,
      to, subject, html,
    });
  } catch (e) {
    console.error("[weeklyBrief] Nodemailer send failed:", e.message);
  }
}

/**
 * Agency Exec Digest — one email per agency owner aggregating ALL their clients.
 * Different from the per-client brief above. This is for the agency head view.
 */
async function sendAgencyExecDigests() {
  let sent = 0, errors = 0;
  try {
    const clientsSnap = await db.collection("clients").get();
    if (clientsSnap.empty) return { sent: 0, errors: 0 };

    // Group clients by ownerId
    const byOwner = {};
    for (const d of clientsSnap.docs) {
      const c = d.data();
      if (!c.ownerId) continue;
      if (!byOwner[c.ownerId]) byOwner[c.ownerId] = [];
      byOwner[c.ownerId].push({ id: d.id, ...c });
    }

    for (const [ownerId, clients] of Object.entries(byOwner)) {
      try {
        // Resolve owner email
        const userDoc = await db.collection("users").doc(ownerId).get();
        const ownerEmail = userDoc.data()?.email;
        if (!ownerEmail) continue;

        // Aggregate per client
        const perClient = [];
        let totalP1 = 0, totalFixes = 0, totalAlerts = 0;
        for (const c of clients) {
          const [audit, report, alertSnap, pushSnap, cmo] = await Promise.all([
            getState(c.id, "A2_audit").catch(() => null),
            getState(c.id, "A9_report").catch(() => null),
            db.collection("alerts").where("clientId","==",c.id).where("resolved","==",false).limit(20).get().catch(() => null),
            db.collection("wp_push_log").where("clientId","==",c.id).limit(100).get().catch(() => null),
            getState(c.id, "CMO_decision").catch(() => null),
          ]);
          const p1 = audit?.issues?.p1?.length || 0;
          const fixes = pushSnap ? pushSnap.size : 0;
          const open = alertSnap ? alertSnap.size : 0;
          totalP1 += p1; totalFixes += fixes; totalAlerts += open;
          perClient.push({
            name: c.name,
            websiteUrl: c.website || c.websiteUrl,
            seoScore: c.seoScore || null,
            p1Count: p1,
            openAlerts: open,
            fixesPushed: fixes,
            topAction: cmo?.decision || report?.reportData?.next3Actions?.[0]?.action || null,
            clicks7d: report?.gscSummary?.totalClicks || null,
          });
        }

        // Cross-client pattern win rates
        let patternSummary = [];
        try {
          const patSnap = await db.collection("global_patterns")
            .where("ownerId","==",ownerId).limit(500).get();
          const byType = {};
          for (const p of patSnap.docs.map(d => d.data())) {
            const t = p.fixType || "other";
            if (!byType[t]) byType[t] = { improved: 0, total: 0 };
            byType[t].total++;
            if (p.outcome === "improved") byType[t].improved++;
          }
          patternSummary = Object.entries(byType)
            .filter(([, c]) => c.total >= 2)
            .map(([fixType, c]) => ({ fixType, winRate: Math.round((c.improved/c.total)*100), sample: c.total }))
            .sort((a, b) => b.winRate - a.winRate)
            .slice(0, 4);
        } catch { /* non-blocking */ }

        const html = buildAgencyDigestHtml({
          weekOf: getWeekLabel(),
          clientCount: clients.length,
          totalP1, totalFixes, totalAlerts,
          perClient: perClient.sort((a, b) => (a.seoScore || 0) - (b.seoScore || 0)),
          patternSummary,
        });

        // Save to Firestore
        try {
          await db.collection("agency_digests").add({
            ownerId, ownerEmail, weekOf: getWeekLabel(),
            clientCount: clients.length,
            totalP1, totalFixes, totalAlerts,
            createdAt: FieldValue.serverTimestamp(),
          });
        } catch { /* non-blocking */ }

        // Send email (SendGrid → nodemailer fallback)
        await sendDigestEmail(ownerEmail, html, getWeekLabel(), clients.length);
        sent++;
      } catch (e) {
        console.error(`[agencyDigest] Failed for owner ${ownerId}:`, e.message);
        errors++;
      }
    }
  } catch (e) {
    console.error("[agencyDigest] Fatal:", e.message);
  }
  return { sent, errors };
}

async function sendDigestEmail(to, html, weekOf, clientCount) {
  const subject = `📈 Agency Weekly Digest — ${clientCount} clients | ${weekOf}`;
  const sgApiKey = process.env.SENDGRID_API_KEY;
  if (sgApiKey) {
    try {
      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: { "Authorization": `Bearer ${sgApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: process.env.SENDGRID_FROM || "reports@seodamco.com", name: "SEO AI Agent" },
          subject, content: [{ type: "text/html", value: html }],
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) return;
    } catch { /* fall through */ }
  }
  try {
    const nodemailer = require("nodemailer");
    let transport = null;
    if (process.env.EMAIL_HOST) {
      transport = nodemailer.createTransport({
        host: process.env.EMAIL_HOST, port: parseInt(process.env.EMAIL_PORT || "587"),
        secure: process.env.EMAIL_PORT === "465",
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      });
    } else if (process.env.GMAIL_USER && process.env.GMAIL_PASS) {
      transport = nodemailer.createTransport({
        service: "gmail",
        auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS },
      });
    }
    if (!transport) return;
    await transport.sendMail({
      from: `"SEO AI Agent" <${process.env.EMAIL_FROM || process.env.GMAIL_USER || "noreply@seo-agent.ai"}>`,
      to, subject, html,
    });
  } catch (e) {
    console.error("[agencyDigest] send failed:", e.message);
  }
}

function buildAgencyDigestHtml(d) {
  const B = "#443DCB", green = "#059669", red = "#DC2626", amber = "#D97706";
  const scoreColor = v => v == null ? "#888" : v >= 75 ? green : v >= 50 ? amber : red;

  const clientRows = d.perClient.map(c => `
    <tr style="border-bottom:1px solid #f0f0ea">
      <td style="padding:10px 12px">
        <div style="font-size:13px;font-weight:600;color:#1a1a18">${escHtml(c.name)}</div>
        <div style="font-size:11px;color:#888">${escHtml((c.websiteUrl || "").replace(/^https?:\/\//, ""))}</div>
      </td>
      <td style="padding:10px 12px;text-align:center">
        <span style="font-size:16px;font-weight:800;color:${scoreColor(c.seoScore)}">${c.seoScore ?? "—"}</span>
      </td>
      <td style="padding:10px 12px;text-align:center;color:${c.p1Count > 0 ? red : "#888"};font-weight:${c.p1Count > 0 ? 700 : 400}">${c.p1Count}</td>
      <td style="padding:10px 12px;text-align:center;color:${c.openAlerts > 0 ? amber : "#888"}">${c.openAlerts}</td>
      <td style="padding:10px 12px;text-align:center;color:${green}">${c.fixesPushed}</td>
    </tr>
    ${c.topAction ? `<tr><td colspan="5" style="padding:0 12px 10px;font-size:12px;color:#555;border-bottom:1px solid #f0f0ea"><strong style="color:${B}">→ Next:</strong> ${escHtml(c.topAction.slice(0, 140))}${c.topAction.length > 140 ? "…" : ""}</td></tr>` : ""}
  `).join("");

  const patternRows = d.patternSummary.length ? d.patternSummary.map(p => {
    const color = p.winRate >= 70 ? green : p.winRate >= 50 ? amber : red;
    return `<li style="margin-bottom:6px"><strong style="color:${color}">${p.winRate}% win rate</strong> — ${escHtml(p.fixType.replace(/_/g, " "))} <span style="color:#888">(${p.sample} fixes)</span></li>`;
  }).join("") : `<li style="color:#888">No verified fix history yet — run pipeline + wait 21 days for learning data</li>`;

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:-apple-system,Arial,sans-serif">
<div style="max-width:680px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
  <div style="background:${B};padding:28px 32px">
    <h1 style="color:#fff;margin:0;font-size:22px">📈 Agency Weekly Digest</h1>
    <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:13px">${escHtml(d.weekOf)} · ${d.clientCount} clients</p>
  </div>
  <div style="padding:28px 32px">

    <!-- Summary tiles -->
    <div style="display:flex;gap:12px;margin-bottom:24px">
      <div style="flex:1;background:#f5f5f0;border-radius:8px;padding:14px;text-align:center">
        <div style="font-size:11px;color:#888;text-transform:uppercase">Clients</div>
        <div style="font-size:24px;font-weight:800;color:${B};margin-top:4px">${d.clientCount}</div>
      </div>
      <div style="flex:1;background:#f5f5f0;border-radius:8px;padding:14px;text-align:center">
        <div style="font-size:11px;color:#888;text-transform:uppercase">P1 Issues</div>
        <div style="font-size:24px;font-weight:800;color:${d.totalP1 > 0 ? red : green};margin-top:4px">${d.totalP1}</div>
      </div>
      <div style="flex:1;background:#f5f5f0;border-radius:8px;padding:14px;text-align:center">
        <div style="font-size:11px;color:#888;text-transform:uppercase">Open Alerts</div>
        <div style="font-size:24px;font-weight:800;color:${d.totalAlerts > 0 ? amber : green};margin-top:4px">${d.totalAlerts}</div>
      </div>
      <div style="flex:1;background:#f5f5f0;border-radius:8px;padding:14px;text-align:center">
        <div style="font-size:11px;color:#888;text-transform:uppercase">Fixes Pushed</div>
        <div style="font-size:24px;font-weight:800;color:${green};margin-top:4px">${d.totalFixes}</div>
      </div>
    </div>

    <!-- Client table -->
    <h2 style="font-size:15px;color:#1a1a18;border-bottom:2px solid #f0f0ea;padding-bottom:8px;margin-top:0">Clients (worst first)</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:12px">
      <tr style="background:#f0f0ea">
        <th style="padding:8px 12px;text-align:left;color:#555">Client</th>
        <th style="padding:8px 12px;text-align:center;color:#555">Score</th>
        <th style="padding:8px 12px;text-align:center;color:#555">P1</th>
        <th style="padding:8px 12px;text-align:center;color:#555">Alerts</th>
        <th style="padding:8px 12px;text-align:center;color:#555">Fixes</th>
      </tr>
      ${clientRows || `<tr><td colspan="5" style="padding:16px;text-align:center;color:#888">No clients</td></tr>`}
    </table>

    <!-- Cross-client learning -->
    <h2 style="font-size:15px;color:#1a1a18;border-bottom:2px solid #f0f0ea;padding-bottom:8px">🧠 Agent Learning — Fix Win Rates</h2>
    <p style="font-size:12px;color:#666;margin-top:8px">What's working across your client base:</p>
    <ul style="font-size:13px;color:#1a1a18;padding-left:20px;margin-bottom:24px">${patternRows}</ul>

    <div style="border-top:1px solid #f0f0ea;padding-top:20px;font-size:12px;color:#888">
      <p style="margin:0">Generated by SEO AI Agent · Weekly digest delivered every Monday</p>
    </div>
  </div>
</div>
</body></html>`;
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

module.exports = { generateWeeklyBrief, sendWeeklyBriefs, sendAgencyExecDigests, buildBriefHtml, buildAgencyDigestHtml };
