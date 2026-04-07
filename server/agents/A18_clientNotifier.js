const { getState } = require("../shared-state/stateManager");
const { db }       = require("../config/firebase");

/**
 * A18 — Client Notifier (Sprint 2)
 * Sends in-app notifications when:
 *   1. A fix is pushed to WordPress (A13 trigger)
 *   2. Monthly report is ready (A9 trigger)
 *   3. New P1 issue detected (A9 alert trigger)
 *
 * Email sending requires SENDGRID_API_KEY or SMTP env vars.
 * Falls back to in-app notification only if no email config.
 */

async function notifyFixPushed(clientId, fixDetails = {}) {
  const brief  = await getState(clientId, "A1_brief").catch(() => null);
  const name   = brief?.businessName || "Client";
  const url    = brief?.websiteUrl   || "";

  const message = fixDetails.fixes?.length
    ? `${fixDetails.fixes.length} SEO fix(es) pushed to ${url}: ${fixDetails.fixes.map(f => f.type || f.title).slice(0, 3).join(", ")}${fixDetails.fixes.length > 3 ? " ..." : ""}`
    : `SEO fix pushed to ${url}`;

  await createNotification(clientId, "fix_pushed", `✅ Fix Pushed — ${name}`, message, {
    fixCount: fixDetails.fixes?.length || 1,
    fixes:    fixDetails.fixes?.slice(0, 5) || [],
  });

  await sendEmail(clientId, {
    subject: `✅ SEO Fix Applied — ${name}`,
    body:    buildFixEmail(name, url, fixDetails.fixes || []),
  });

  return { success: true, notified: true };
}

async function notifyReportReady(clientId) {
  const brief  = await getState(clientId, "A1_brief").catch(() => null);
  const report = await getState(clientId, "A9_report").catch(() => null);
  const name   = brief?.businessName || "Client";

  const score = report?.scoreBreakdown?.overall;
  const scoreText = score != null ? ` — SEO Score: ${score}/100` : "";

  await createNotification(clientId, "report_ready", `📊 Monthly Report Ready — ${name}`,
    `Your monthly SEO report is ready for review${scoreText}`, { score });

  await sendEmail(clientId, {
    subject: `📊 Monthly SEO Report — ${name}`,
    body:    buildReportEmail(name, score, report?.reportData),
  });

  return { success: true, notified: true };
}

async function notifyP1Alert(clientId, alerts = []) {
  if (!alerts.length) return { success: true, notified: false };
  const brief = await getState(clientId, "A1_brief").catch(() => null);
  const name  = brief?.businessName || "Client";

  await createNotification(clientId, "p1_alert",
    `🚨 Critical SEO Issue — ${name}`,
    `${alerts.length} critical issue(s) detected: ${alerts.map(a => a.title || a.type).slice(0, 2).join(", ")}`,
    { alerts: alerts.slice(0, 5) });

  await sendEmail(clientId, {
    subject: `🚨 Action Required: Critical SEO Issue for ${name}`,
    body:    buildAlertEmail(name, alerts),
  });

  return { success: true, notified: true };
}

// ── In-app notification ────────────────────────────
async function createNotification(clientId, type, title, message, meta = {}) {
  try {
    const clientDoc = await db.collection("clients").doc(clientId).get();
    const ownerId   = clientDoc.data()?.ownerId;
    await db.collection("notifications").add({
      clientId, ownerId, type, title, message,
      meta,
      read:      false,
      createdAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[A18] createNotification error:", e.message);
  }
}

// ── Email dispatch (SendGrid or SMTP) ─────────────
async function sendEmail(clientId, { subject, body }) {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) return; // no email config — in-app only

  try {
    const clientDoc = await db.collection("clients").doc(clientId).get();
    const ownerId   = clientDoc.data()?.ownerId;
    if (!ownerId) return;

    const userDoc  = await db.collection("users").doc(ownerId).get();
    const toEmail  = userDoc.data()?.email || userDoc.data()?.notificationEmail;
    if (!toEmail) return;

    await fetch("https://api.sendgrid.com/v3/mail/send", {
      method:  "POST",
      signal:  AbortSignal.timeout(10000),
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: toEmail }] }],
        from:    { email: process.env.FROM_EMAIL || "noreply@damcodigital.com", name: "SEO AI Platform" },
        subject,
        content: [{ type: "text/html", value: body }],
      }),
    });
  } catch (e) {
    console.error("[A18] sendEmail error:", e.message);
  }
}

// ── Email templates ───────────────────────────────
function buildFixEmail(name, url, fixes) {
  const rows = fixes.slice(0, 10).map(f =>
    `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee">${f.type || f.title || "Fix"}</td>
     <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#059669">✅ Applied</td></tr>`
  ).join("");
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a18">
      <div style="background:#443DCB;padding:24px;border-radius:8px 8px 0 0">
        <h2 style="color:#fff;margin:0">✅ SEO Fix Applied</h2>
        <p style="color:#ffffff99;margin:8px 0 0">Damco Digital SEO Platform</p>
      </div>
      <div style="background:#fff;padding:24px;border:1px solid #e0e0d8;border-top:none;border-radius:0 0 8px 8px">
        <p>Hi ${name},</p>
        <p>We've applied ${fixes.length} SEO fix(es) to <strong>${url}</strong>.</p>
        ${rows ? `<table style="width:100%;border-collapse:collapse;margin:16px 0"><thead>
          <tr style="background:#f5f5f0"><th style="padding:8px 12px;text-align:left">Fix</th><th style="padding:8px 12px;text-align:left">Status</th></tr>
        </thead><tbody>${rows}</tbody></table>` : ""}
        <p style="color:#666;font-size:13px">Login to your dashboard to see the full details and track impact.</p>
      </div>
    </div>`;
}

function buildReportEmail(name, score, reportData) {
  const verdict = reportData?.verdict ? `<p><em>"${reportData.verdict}"</em></p>` : "";
  const scoreColor = score >= 75 ? "#059669" : score >= 50 ? "#D97706" : "#DC2626";
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a18">
      <div style="background:#443DCB;padding:24px;border-radius:8px 8px 0 0">
        <h2 style="color:#fff;margin:0">📊 Monthly SEO Report</h2>
        <p style="color:#ffffff99;margin:8px 0 0">Damco Digital SEO Platform</p>
      </div>
      <div style="background:#fff;padding:24px;border:1px solid #e0e0d8;border-top:none;border-radius:0 0 8px 8px">
        <p>Hi ${name},</p>
        <p>Your monthly SEO report is ready.</p>
        ${score != null ? `<div style="text-align:center;margin:24px 0">
          <div style="font-size:48px;font-weight:800;color:${scoreColor}">${score}</div>
          <div style="color:#666;font-size:14px">SEO Health Score / 100</div>
        </div>` : ""}
        ${verdict}
        <p style="color:#666;font-size:13px">Login to your dashboard to read the full report and approve recommendations.</p>
      </div>
    </div>`;
}

function buildAlertEmail(name, alerts) {
  const rows = alerts.slice(0, 5).map(a =>
    `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#DC2626">🚨 ${a.type || "Issue"}</td>
     <td style="padding:8px 12px;border-bottom:1px solid #eee">${a.detail || a.message || ""}</td></tr>`
  ).join("");
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a18">
      <div style="background:#DC2626;padding:24px;border-radius:8px 8px 0 0">
        <h2 style="color:#fff;margin:0">🚨 Action Required</h2>
        <p style="color:#ffffff99;margin:8px 0 0">Critical SEO Issue Detected</p>
      </div>
      <div style="background:#fff;padding:24px;border:1px solid #e0e0d8;border-top:none;border-radius:0 0 8px 8px">
        <p>Hi ${name},</p>
        <p><strong>${alerts.length} critical SEO issue(s)</strong> have been detected that need immediate attention.</p>
        ${rows ? `<table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tbody>${rows}</tbody></table>` : ""}
        <p style="color:#666;font-size:13px">Login to your dashboard to review and fix these issues.</p>
      </div>
    </div>`;
}

module.exports = { notifyFixPushed, notifyReportReady, notifyP1Alert };
