# Deployment Architecture

**Damco Digital — SEO AI Agent backend.**
Status as of M8.4a. Read this before changing anything about how the backend is hosted or scaled.

---

## TL;DR

> **The backend runs as exactly ONE web instance. Do NOT enable horizontal scaling or set the instance count above 1.** Scheduled jobs and the SEO pipeline run in-process; a second instance duplicates all of them. Scaling is only safe after the dedicated worker service (**M8.4b**) is built.

---

## Current architecture

Two Render services (see `render.yaml`):

| Service | Type | Responsibility |
|---|---|---|
| `seo-agent-backend` | `web` (Node) | Serves the API **and** runs all scheduled jobs + background pipeline **in the same process** |
| `seo-agent-frontend` | `static` | React SPA (safe to scale — stateless static hosting) |

The frontend is stateless and unaffected by this document. **The constraint applies to the `web` backend only.**

### Scheduled jobs run in-process

The backend starts **9 `setInterval` cron loops** inside `server/index.js`, plus `runFullPipeline` (`server/agents/A0_orchestrator.js`) which is invoked fire-and-forget from `POST /api/agents/:clientId/run-pipeline` and from the monthly scheduler. All of this executes **in the web process** — there is no separate worker.

`setInterval` timers exist per Node process. With one instance there is exactly one of each timer. **With N instances there are N of each**, all firing against the same shared Firestore with no coordination.

### Background execution inventory (audited in M8.4)

| Job | `index.js` | Frequency | Cross-instance guard |
|---|---|---|---|
| daily-monitor (alerts, A15/A16/A23/A25/AI3/AI6/AI7, CMO auto-exec) | `:142` | 24h | **none** |
| weekly GSC/GA4 pull | `:339` | Mon 06:00 UTC | day/hour window only |
| monthly pipeline scheduler | `:465` | hourly (runs if 30d elapsed) | pipeline 409 guard (non-atomic) |
| CMO signal scan | `:518` | 6h | **none** |
| monthly report email | `:594` | 1st of month | `cron_flags` (non-atomic) |
| content-verify | `:627` | daily | `cron_flags` (non-atomic) |
| fix-verify (21-day loop) | `:787` | daily | `cron_flags` (non-atomic) |
| cmo_queue consumer (auto-runs agents) | `:978` | 30 min | **none** (per-item status only) |
| monday-briefing | `:1046` | daily/weekly | `cron_flags` (non-atomic) |
| `runFullPipeline` | `A0_orchestrator.js:577` | on trigger | 409 double-trigger guard + 25-min timeout + 4-min heartbeat |

**None of the guards is a true distributed lock.** The `cron_flags` guard is a non-atomic read-then-write (`.get()` → `if exists return` → `.set()`), and the pipeline 409 guard reads client status then writes — both have a race window between read and write. They are safe on **one** instance (timers don't overlap, single actor) and fail under two.

---

## Why horizontal scaling is currently UNSUPPORTED

Running ≥2 web instances would cause, per audited job:

- **Duplicate notifications & alerts** — daily-monitor and CMO scan both `notifications.add` / `alerts.add` with no dedup.
- **Doubled LLM spend** — A16/A23/A25/CMO run twice per cycle; cost-tracker increments twice.
- **Double-executed agents** — the cmo_queue consumer: both instances read the same `status:"pending"` item and both call `runAgentById`.
- **Concurrent/duplicate pipelines** — two instances can both pass the 409 guard for the same client and both start `runFullPipeline`, interleaving agent-state writes and doubling cost.
- **Task duplication/loss** — concurrent `clearTasks` + `emitTasks` interleave.
- **Duplicate emails/briefings/verifications** — the `cron_flags` race lets both instances pass.

There is **no** distributed lock, lease document, TTL lock, transaction-based mutex, or generation-ID/CAS anywhere in the scheduling or pipeline code. The heartbeat and 25-minute timeout provide **liveness/recovery**, not mutual exclusion.

---

## Operational guidance

- **Instance count:** exactly **1** for `seo-agent-backend`. Render's default (no `numInstances` set, no autoscaling) already gives this — leave it that way.
- **Do NOT** add `numInstances > 1`, enable autoscaling, or run a second copy of `node index.js` (locally or in CI) against the **production** Firestore project — it will double all scheduled work.
- **Restarts/redeploys are fine** — a single instance restarting re-arms its timers; no duplication.
- **Cold starts (free tier):** the process sleeping after 15 min idle means crons pause while asleep and resume on next wake. This is a known free-tier trait, unrelated to the scaling constraint.
- **Firestore indexes:** unrelated but adjacent — see `FIRESTORE_INDEXES.md` (M8.3) for the composite indexes these jobs' queries require.

---

## Future Worker Architecture (M8.4b)

The chosen scaling path (M8.4 recommendation: **Option C — dedicated worker service**). Not yet implemented. When scaling is actually needed, split responsibilities:

### Target topology

| Service | Type | Instances | Owns |
|---|---|---|---|
| `seo-agent-backend` | `web` | **N (scalable)** | HTTP API only — auth, CRUD, reads, **enqueue** pipeline runs |
| `seo-agent-worker` | `worker` | **exactly 1** | All 9 cron loops · `runFullPipeline` execution · `cmo_queue` consumer |
| `seo-agent-frontend` | `static` | N | SPA |

### Ownership after M8.4b

- **Cron ownership → worker.** The 9 `setInterval` loops move out of `index.js` into `server/worker.js`. Only the single worker instance runs them, so "exactly one scheduler" holds by construction — no distributed lock required.
- **Pipeline ownership → worker.** `runFullPipeline` executes in the worker, off the request path (resolves M8.1 Risk #3: pipelines no longer contend with request handling).
- **Queue-consumer ownership → worker.** The `cmo_queue` consumer runs only in the worker.
- **Web responsibilities → API only.** `POST /run-pipeline` stops calling `runFullPipeline` directly and instead **writes a job document** (e.g. `pipeline_jobs`) that the worker drains. Web must preserve the existing 409 "already running" semantics and the status shape the frontend polls via `GET /pipeline`.
- **Scaling strategy:** scale `web` freely to N; pin `worker` at 1. If the worker ever needs to scale, that is a further step requiring a transactional queue (Option D) — out of scope for M8.4b.

### Migration checklist for M8.4b

- [ ] Add `seo-agent-worker` (`type: worker`, same repo/rootDir, `startCommand: node worker.js`) to `render.yaml`.
- [ ] Create `server/worker.js`; move the 9 `setInterval` blocks + the fire-and-forget `runFullPipeline` invocation into it.
- [ ] Remove those `setInterval` blocks from `server/index.js` (web no longer schedules).
- [ ] Change `POST /api/agents/:clientId/run-pipeline` (`routes/modules/pipeline.js`) to **enqueue** a `pipeline_jobs` doc instead of invoking `runFullPipeline`; preserve the 409 guard + response shape.
- [ ] Add a worker-side consumer that drains `pipeline_jobs` and calls `runFullPipeline`.
- [ ] Verify exactly-once: run one full pipeline and one daily-monitor cycle; confirm no duplicate notifications/alerts/agent runs.
- [ ] Confirm `GET /pipeline` status polling still reflects worker-driven runs unchanged.
- [ ] Only then: raise web `numInstances` / enable autoscaling. Update the `render.yaml` warning + this document.
- [ ] Rollback path documented: re-enable intervals in `index.js`, revert pipeline trigger to direct invoke, scale worker to 0.

---

## Change log

- **M8.4a** — documented single-instance constraint (this file) + `render.yaml` warning comment. Documentation only; no runtime or deployment-behavior change.
