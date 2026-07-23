# Production Launch Checklist

**SEO AI Agent backend — M9.1 launch hardening.**
Run through this before promoting `development` to production. Cross-references `DEPLOYMENT.md` (single-instance constraint) and `FIRESTORE_INDEXES.md` (index shapes).

---

## 1. Firestore indexes (required — queries 500 without them)

12 composite indexes are declared in `firestore.indexes.json` and validated (M9.1 Phase 4: 0 missing, 0 unused, 0 duplicate). Deploy once from a Firebase-CLI-authenticated machine:

```bash
# from repo root (firebase.json lives here)
firebase deploy --only firestore:indexes --project <FIREBASE_PROJECT_ID>
```

- [ ] Indexes deployed; Firestore console → Indexes shows all 12 **Enabled** (not Building).
- [ ] Reconcile prompt reviewed — the deploy is idempotent for creates but offers to **delete** console-only indexes; do not drop anything still in use (see `FIRESTORE_INDEXES.md`).

## 2. Environment variables (Render → backend service → Environment)

**Required (backend will not function without these):**
- [ ] `FIREBASE_PROJECT_ID`
- [ ] `FIREBASE_PRIVATE_KEY_ID`
- [ ] `FIREBASE_PRIVATE_KEY`  *(paste with `\n` for newlines)*
- [ ] `FIREBASE_CLIENT_EMAIL`
- [ ] `FIREBASE_CLIENT_ID`
- [ ] `FIREBASE_CLIENT_CERT_URL`
- [ ] `JWT_SECRET`
- [ ] `NODE_ENV=production`

**Recommended:**
- [ ] `OPENROUTER_API_KEY` — server-level LLM fallback so agents work out-of-the-box.
- [ ] `GMAIL_USER` + `GMAIL_PASS` (app password) — pipeline/alert emails.
- [ ] `APP_URL` / `FRONTEND_URL` — used in emails + CORS.

**Observability (optional — Sentry is a no-op if unset):**
- [ ] `SENTRY_DSN` — enables error monitoring. **Never commit this; set it only in the Render dashboard.**
- [ ] `SENTRY_ENVIRONMENT` — defaults to `NODE_ENV`.
- [ ] `SENTRY_TRACES_SAMPLE_RATE` — defaults to `0` (errors only; no perf tracing).

## 3. Sentry / error monitoring

- [ ] `@sentry/node` present in `server/package.json` (added M9.1).
- [ ] `SENTRY_DSN` set in Render → boot log shows `[observability] Sentry initialized.`
      (Without a DSN it logs `error monitoring disabled (no-op)` — safe, but blind.)
- [ ] Trigger a test error (e.g. a deliberate 500) and confirm it appears in the Sentry project.
- [ ] Captured sources: `unhandledRejection`, `uncaughtException`, and the Express error handler.

## 4. Health endpoint

`GET /health` now returns lightweight diagnostics (M9.1):

- [ ] Returns `200` with `status:"ok"` (existing uptime monitors still pass).
- [ ] `firestore` reports `connected`.
- [ ] `sentry` reports `enabled` (once DSN is set).
- [ ] `commit` shows the deployed SHA (set `RENDER_GIT_COMMIT` — Render provides this automatically on most plans).
- [ ] `indexesDeclared` shows `12`.
- [ ] Point Render's health check / an uptime monitor (UptimeRobot, etc.) at `/health`.

## 5. Deployment assumptions (see DEPLOYMENT.md)

- [ ] Backend is **one instance only** — do NOT set `numInstances > 1` or enable autoscaling (crons + pipeline run in-process; no distributed lock until M8.4b worker split).
- [ ] Express runtime version reconciled (`server/package.json` pins `^4.21.2`; verify installed major matches expectations — flagged in M8.6).

## 6. Smoke tests (post-deploy)

- [ ] `GET /health` → 200, `firestore:"connected"`.
- [ ] `GET /` → backend banner JSON.
- [ ] Login (Firebase auth) succeeds; a `verifyToken`-protected route returns data with a valid token, 401 without.
- [ ] Run one full pipeline on a test client → `pipelineStatus` transitions running → complete; a `pipeline_metrics` doc is written with duration + outcome.
- [ ] Dashboard, rankings, approvals load without console errors.
- [ ] A composite-index-backed query path works (e.g. CMO decision / control-room fix timeline) — no `FAILED_PRECONDITION`.

## 7. Monitoring (ongoing)

- [ ] Sentry alerts configured (email/Slack) for new error groups.
- [ ] Uptime monitor on `/health`.
- [ ] Watch `pipeline_metrics` for failed-run spikes and rising `estCostUsd`.
- [ ] Watch `llm_usage` for clients approaching monthly budget (auto-notifies at 80%/100%).

## 8. Rollback

- **App code:** `git revert <sha>` on `development` and redeploy; Render auto-deploys on push. Each M-story is one revertible commit.
- **Indexes:** additive — leaving them deployed after a code rollback is harmless. Only delete an index if a rollback removed the query that needed it.
- **Sentry:** unset `SENTRY_DSN` to instantly disable monitoring with no code change.
- **Metrics/health:** purely additive (new collection + expanded endpoint); reverting the M9.1 commit restores the prior `/health` and removes instrumentation with no data migration.

---

## M9.1 change log

- Added optional Sentry error monitoring (`utils/observability.js`, env-driven, no-op without DSN).
- Added pipeline run telemetry (`utils/pipelineMetrics.js` → `pipeline_metrics` collection; best-effort, non-blocking).
- Expanded `GET /health` with uptime, memory, node, commit, firestore connectivity, pipeline/queue snapshot, declared-index count.
- Validated `firestore.indexes.json` against live queries (0 missing / 0 unused / 0 duplicate).
- No route changes, no API-breaking changes, no response-format changes to existing endpoints.
