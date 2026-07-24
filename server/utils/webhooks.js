/**
 * webhooks.js — Outbound webhook engine (M10.6).
 *
 * Lets external systems subscribe to platform events. Deliveries are HMAC-signed
 * (X-SEO-Signature), retried with backoff, and logged. Non-blocking: a failed
 * delivery never affects the triggering workflow.
 *
 * Storage:
 *   webhooks/{id} = { id, ownerId, url, events[], secret, active, createdAt, ... }
 *   webhook_deliveries/{id} = { webhookId, event, status, attempts, at, responseCode }
 *
 * Events: pipeline.completed | pipeline.failed | task.created | approval.required |
 *   report.generated | ranking.changed | llm.visibility.changed |
 *   answer.optimization.updated
 */
const crypto = require("crypto");
const { db } = require("../config/firebase");

const EVENTS = [
  "pipeline.completed", "pipeline.failed", "task.created", "approval.required",
  "report.generated", "ranking.changed", "llm.visibility.changed", "answer.optimization.updated",
];

function sign(secret, body) {
  return crypto.createHmac("sha256", String(secret)).update(body).digest("hex");
}

function sanitizeEvents(events) {
  if (!Array.isArray(events)) return [];
  return [...new Set(events.filter(e => EVENTS.includes(e)))];
}

// ── Management ──
async function createWebhook(ownerId, { url, events }) {
  if (!/^https:\/\//.test(String(url || ""))) return { ok: false, error: "Webhook URL must be https://" };
  const clean = sanitizeEvents(events);
  if (!clean.length) return { ok: false, error: `events must include at least one of: ${EVENTS.join(", ")}` };
  const id = crypto.randomBytes(8).toString("hex");
  const secret = `whsec_${crypto.randomBytes(20).toString("base64url")}`;
  const rec = { id, ownerId, url, events: clean, secret, active: true, createdAt: new Date().toISOString(), lastDeliveryAt: null, failureCount: 0 };
  await db.collection("webhooks").doc(id).set(rec);
  return { ok: true, webhook: rec }; // secret shown once here (owner-only context)
}

async function listWebhooks(ownerId) {
  const snap = await db.collection("webhooks").where("ownerId", "==", ownerId).limit(100).get().catch(() => null);
  return (snap?.docs || []).map(d => { const w = d.data(); return { ...w, secret: w.secret ? w.secret.slice(0, 12) + "…" : null }; });
}

async function deleteWebhook(ownerId, id) {
  const ref = db.collection("webhooks").doc(id);
  const doc = await ref.get();
  if (!doc.exists || doc.data().ownerId !== ownerId) return { ok: false, error: "Webhook not found" };
  await ref.delete();
  return { ok: true };
}

// ── Delivery (non-blocking, retried) ──
async function deliver(webhook, event, payload, attempt = 1) {
  const body = JSON.stringify({ event, data: payload, at: new Date().toISOString() });
  const signature = sign(webhook.secret, body);
  const delId = crypto.randomBytes(8).toString("hex");
  try {
    const res = await fetch(webhook.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-SEO-Signature": signature, "X-SEO-Event": event },
      body, signal: AbortSignal.timeout(8000),
    });
    await db.collection("webhook_deliveries").doc(delId).set({
      webhookId: webhook.id, event, status: res.ok ? "delivered" : "failed",
      responseCode: res.status, attempts: attempt, at: new Date().toISOString(),
    }).catch(() => {});
    if (!res.ok && attempt < 3) return retry(webhook, event, payload, attempt);
    await db.collection("webhooks").doc(webhook.id).set({ lastDeliveryAt: new Date().toISOString() }, { merge: true }).catch(() => {});
  } catch (e) {
    await db.collection("webhook_deliveries").doc(delId).set({
      webhookId: webhook.id, event, status: "error", error: e.message, attempts: attempt, at: new Date().toISOString(),
    }).catch(() => {});
    if (attempt < 3) return retry(webhook, event, payload, attempt);
    await db.collection("webhooks").doc(webhook.id).set({ failureCount: (webhook.failureCount || 0) + 1 }, { merge: true }).catch(() => {});
  }
}
function retry(webhook, event, payload, attempt) {
  const delayMs = attempt * 2000; // simple backoff
  setTimeout(() => deliver(webhook, event, payload, attempt + 1).catch(() => {}), delayMs);
}

/**
 * Trigger an event for an owner — fans out to all their active subscriptions.
 * Best-effort + fire-and-forget; safe to call from any workflow.
 */
async function trigger(ownerId, event, payload) {
  try {
    if (!EVENTS.includes(event) || !ownerId) return;
    const snap = await db.collection("webhooks")
      .where("ownerId", "==", ownerId).where("active", "==", true).limit(50).get().catch(() => null);
    for (const d of (snap?.docs || [])) {
      const w = d.data();
      if (Array.isArray(w.events) && w.events.includes(event)) deliver(w, event, payload).catch(() => {});
    }
  } catch { /* never break the caller */ }
}

module.exports = { EVENTS, sign, sanitizeEvents, createWebhook, listWebhooks, deleteWebhook, trigger };
