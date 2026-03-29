/**
 * Emailer — Nodemailer wrapper for SEO Agent notifications
 * Supports Gmail SMTP + any generic SMTP (host/port/user/pass)
 * All calls are fire-and-forget — never throws to caller
 */
const nodemailer = require("nodemailer");

function createTransport() {
  // Support Gmail OAuth-app password OR generic SMTP
  if (process.env.EMAIL_HOST) {
    return nodemailer.createTransport({
      host:   process.env.EMAIL_HOST,
      port:   parseInt(process.env.EMAIL_PORT || "587"),
      secure: process.env.EMAIL_PORT === "465",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }
  // Gmail shorthand
  if (process.env.GMAIL_USER && process.env.GMAIL_PASS) {
    return nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS },
    });
  }
  return null;
}

const FROM = process.env.EMAIL_FROM || process.env.GMAIL_USER || "noreply@seo-agent.ai";

// ── Templates ────────────────────────────────────────

function pipelineCompleteHtml({ clientName, websiteUrl, score, topIssues, agentUrl }) {
  const issueRows = (topIssues || []).slice(0, 5).map(i =>
    `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:13px;color:#374151">${i.title || i}</td></tr>`
  ).join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">

    <!-- Header -->
    <div style="background:#443DCB;padding:28px 32px">
      <div style="color:#fff;font-size:20px;font-weight:700">SEO Analysis Complete</div>
      <div style="color:#a5b4fc;font-size:13px;margin-top:4px">${websiteUrl}</div>
    </div>

    <!-- Body -->
    <div style="padding:28px 32px">
      <p style="font-size:15px;color:#111827;margin:0 0 20px">Hi,</p>
      <p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 20px">
        The full SEO pipeline for <strong>${clientName}</strong> has completed successfully.
        Here's a quick summary:
      </p>

      <!-- Score Card -->
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:20px;margin-bottom:20px;text-align:center">
        <div style="font-size:13px;color:#6b7280;margin-bottom:6px">Overall SEO Score</div>
        <div style="font-size:48px;font-weight:800;color:${score >= 70 ? '#059669' : score >= 40 ? '#D97706' : '#DC2626'}">${score || '–'}</div>
        <div style="font-size:12px;color:#9ca3af">/100</div>
      </div>

      <!-- Top Issues -->
      ${issueRows ? `
      <div style="margin-bottom:20px">
        <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:8px">Top Issues to Fix</div>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
          ${issueRows}
        </table>
      </div>` : ""}

      <!-- CTA -->
      ${agentUrl ? `
      <div style="text-align:center;margin:24px 0">
        <a href="${agentUrl}" style="display:inline-block;background:#443DCB;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600">
          View Full Report →
        </a>
      </div>` : ""}

      <p style="font-size:12px;color:#9ca3af;margin-top:24px;border-top:1px solid #f3f4f6;padding-top:16px">
        This email was sent automatically by SEO Agent. All 9 AI agents have completed their analysis.
      </p>
    </div>
  </div>
</body>
</html>`;
}

function welcomeHtml({ name, loginUrl }) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
    <div style="background:#443DCB;padding:28px 32px">
      <div style="color:#fff;font-size:20px;font-weight:700">Welcome to SEO Agent</div>
      <div style="color:#a5b4fc;font-size:13px;margin-top:4px">AI-Powered SEO for Agencies</div>
    </div>
    <div style="padding:28px 32px">
      <p style="font-size:15px;color:#111827;margin:0 0 16px">Hi ${name || "there"},</p>
      <p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 20px">
        Your account has been created successfully. You can now:
      </p>
      <ul style="font-size:14px;color:#374151;line-height:2;padding-left:20px;margin:0 0 24px">
        <li>Add your first client</li>
        <li>Run the full 9-agent AI SEO pipeline</li>
        <li>Get prioritised fix recommendations</li>
        <li>Export white-label PDF reports</li>
      </ul>
      ${loginUrl ? `
      <div style="text-align:center">
        <a href="${loginUrl}" style="display:inline-block;background:#443DCB;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600">
          Go to Dashboard →
        </a>
      </div>` : ""}
      <p style="font-size:12px;color:#9ca3af;margin-top:24px;border-top:1px solid #f3f4f6;padding-top:16px">
        If you didn't create this account, you can ignore this email.
      </p>
    </div>
  </div>
</body>
</html>`;
}

function alertHtml({ clientName, websiteUrl, drops, agentUrl }) {
  const dropRows = (drops || []).slice(0, 5).map(d =>
    `<tr>
      <td style="padding:8px 10px;font-size:13px;color:#374151;border-bottom:1px solid #eee">${d.keyword}</td>
      <td style="padding:8px 10px;font-size:13px;color:#DC2626;font-weight:700;border-bottom:1px solid #eee">▼ ${d.drop} places</td>
      <td style="padding:8px 10px;font-size:12px;color:#9ca3af;border-bottom:1px solid #eee">#${d.previousPosition} → #${d.position}</td>
    </tr>`
  ).join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
    <div style="background:#DC2626;padding:28px 32px">
      <div style="color:#fff;font-size:20px;font-weight:700">Ranking Drop Alert</div>
      <div style="color:#fca5a5;font-size:13px;margin-top:4px">${websiteUrl}</div>
    </div>
    <div style="padding:28px 32px">
      <p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 16px">
        <strong>${clientName}</strong> has experienced keyword ranking drops in the last tracking cycle.
      </p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:20px">
        <thead>
          <tr style="background:#fef2f2">
            <th style="padding:8px 10px;font-size:12px;color:#DC2626;text-align:left">Keyword</th>
            <th style="padding:8px 10px;font-size:12px;color:#DC2626;text-align:left">Drop</th>
            <th style="padding:8px 10px;font-size:12px;color:#DC2626;text-align:left">Position</th>
          </tr>
        </thead>
        <tbody>${dropRows}</tbody>
      </table>
      ${agentUrl ? `
      <div style="text-align:center">
        <a href="${agentUrl}" style="display:inline-block;background:#DC2626;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600">
          View Rankings →
        </a>
      </div>` : ""}
    </div>
  </div>
</body>
</html>`;
}

// ── Public send functions ─────────────────────────────

async function sendPipelineComplete({ to, clientName, websiteUrl, score, topIssues, agentUrl }) {
  const transport = createTransport();
  if (!transport || !to) return;
  try {
    await transport.sendMail({
      from:    `"SEO Agent" <${FROM}>`,
      to,
      subject: `✅ SEO Analysis Complete — ${clientName}`,
      html:    pipelineCompleteHtml({ clientName, websiteUrl, score, topIssues, agentUrl }),
    });
    console.log(`[emailer] Pipeline complete email sent to ${to}`);
  } catch (e) {
    console.error("[emailer] Failed to send pipeline complete email:", e.message);
  }
}

async function sendWelcome({ to, name, loginUrl }) {
  const transport = createTransport();
  if (!transport || !to) return;
  try {
    await transport.sendMail({
      from:    `"SEO Agent" <${FROM}>`,
      to,
      subject: "Welcome to SEO Agent — Your account is ready",
      html:    welcomeHtml({ name, loginUrl }),
    });
    console.log(`[emailer] Welcome email sent to ${to}`);
  } catch (e) {
    console.error("[emailer] Failed to send welcome email:", e.message);
  }
}

async function sendRankingAlert({ to, clientName, websiteUrl, drops, agentUrl }) {
  const transport = createTransport();
  if (!transport || !to) return;
  if (!drops?.length) return;
  try {
    await transport.sendMail({
      from:    `"SEO Agent" <${FROM}>`,
      to,
      subject: `⚠️ Ranking Drop Alert — ${clientName} (${drops.length} keywords dropped)`,
      html:    alertHtml({ clientName, websiteUrl, drops, agentUrl }),
    });
    console.log(`[emailer] Ranking alert email sent to ${to}`);
  } catch (e) {
    console.error("[emailer] Failed to send ranking alert:", e.message);
  }
}

module.exports = { sendPipelineComplete, sendWelcome, sendRankingAlert };
