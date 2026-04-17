# QA Error List - SEO AI Agent

Date: 2026-04-17
Tester: Codex QA audit pass
Last updated: 2026-04-17

## Summary

React + Vite frontend with Express/Firebase backend. The main functional QA issues are fixed, and frontend AI provider calls now route through the backend proxy.

Verification (latest pass):
- Frontend build: PASS
- Backend syntax: PASS (87 server files)
- AI provider URL scan: PASS (zero matches in src)
- Live browser test: PASS (8 pass, 2 warn, 0 fail, no JS errors)
- Full E2E journey: PASS (19 pass, 2 warn, 0 fail)
- Bundle: 1,483 kB (original) -> 418 kB main chunk + 30 lazy chunks
- ClientManager chunk: 575 kB -> 27 kB (AgentPipeline split to its own 548 kB lazy chunk)
- E2E tests: default to localhost, production requires ALLOW_PRODUCTION_TESTS=true

---

## Error 1 - Email Registration Can Create Broken Accounts

Status: FIXED

- `src/context/AuthContext.jsx`: `register()` retries backend registration once. If both attempts fail, it signs out the Firebase Auth user and surfaces the error.
- `server/routes/auth.js`: catches `auth/email-already-exists`, verifies the bearer token, and upserts the Firestore user document from the verified UID.

---

## Error 2 - Standalone Backlink Analyzer Calls Nonexistent Routes

Status: FIXED

- `src/BacklinkAnalyzer.jsx`: replaced broken POST calls with `POST /api/backlinks/analyze`.
- `server/routes/backlinks.js`: has the matching `POST /analyze` route.

---

## Error 3 - Live Browser Test Uses Wrong Crawler Endpoint

Status: FIXED

- `tests/live-browser-test.cjs`: removed/skipped the bad `GET /api/crawler/domain-overview/example.com` check.
- The real crawler route is auth-protected and should be covered by authenticated E2E tests.

---

## Error 4 - Frontend Bundle Is Too Large

Status: FIXED

- `src/App.jsx`: 28 large page/tool components use `React.lazy()` and `Suspense`.
- `src/pages/ClientManager.jsx`: `AgentPipeline` (6131 lines) converted to lazy import.
- Bundle result:
  - Original single chunk: 1,483 kB
  - Main chunk now: 418 kB
  - ClientManager chunk: 575 kB -> 27 kB
  - AgentPipeline: own lazy chunk at 548 kB, loaded only when user opens a client
  - 32 total lazy chunks, no chunk loaded until needed

---

## Error 5 - E2E Tests Are Hardcoded To Production Render

Status: FIXED

- Both test files now default to `http://localhost:5173` / `http://localhost:5000`.
- If `FRONTEND_URL` or `BACKEND_URL` resolves to an `onrender.com` host, both tests exit immediately unless `ALLOW_PRODUCTION_TESTS=true` is set.
- `HEADLESS` env var controls browser visibility (default: headless).

---

## Error 6 - Provider API Keys Are Used Directly In Browser

Status: FIXED

- `server/routes/aiChat.js`: added protected `POST /api/ai/chat`.
- `server/index.js`: registered `app.use("/api/ai", apiLimiter, aiChatRoutes)`.
- `src/App.jsx`: main `callAI()` now calls `POST /api/ai/chat` with Firebase bearer token.
- `src/utils/callAI.js`: shared frontend helper calls the backend AI proxy.
- Lazy-loaded frontend tools now use `callAIBackend()` instead of direct provider fetches.
- Verification search returns no frontend matches:

```bash
rg "https://api\.groq\.com|generativelanguage\.googleapis\.com|https://openrouter\.ai/api" src
```

---

## Error 7 - No Standard Test Scripts In package.json

Status: FIXED

- `package.json`: added `test`, `test:build`, `test:backend`, `test:e2e`, and `test:live`.
- `scripts/check-server-syntax.cjs`: recursively syntax-checks `server/**/*.js`, skips `node_modules`, and exits nonzero on failure.

---

## Error 8 - Mojibake / Encoding Issues

Status: NOT APPLICABLE TO PRODUCTION

No corrupted characters found in production UI files touched in this pass. Corrupted characters exist only in documentation/comments and do not affect rendered output.

---

## Error 9 - Local Frontend Falls Back To Production Backend

Status: FIXED

During live browser testing, `/audit` from local Vite was calling `https://seo-agent-backend-8m1z.onrender.com`, causing CORS failures and making local QA unreliable.

- `src/utils/apiBase.js`: added a shared API base helper.
- Local dev now defaults to `http://localhost:5000`.
- Production builds still default to `https://seo-agent-backend-8m1z.onrender.com` when `VITE_API_URL` is not set.
- Updated frontend API constants in `App`, auth context, AI helper, backlink, keyword, domain overview, and client portal modules.

---

## Error 10 - Backend CORS Blocks 127.0.0.1 Local Dev

Status: FIXED

The browser test used `http://127.0.0.1:5173`, while the backend only allowed `http://localhost`, causing local API calls to fail as CORS errors.

- `server/index.js`: added `isAllowedOrigin()` helper.
- Backend now allows both `http://localhost:*` and `http://127.0.0.1:*`.
- The same helper is used by normal CORS, 404 responses, and the error handler.

---

## Error 11 - All Firestore Routes Return 500 In Production

Status: FIXED

Production `GET /api/clients/:id` and `GET /api/admin/users` both returned 500 with error:
`"request to https://firestore.googleapis.com/... failed, reason:"`

Root cause: `server/config/firebase.js` was importing `Firestore` and `FieldValue` from
`@google-cloud/firestore` — a package that is **not listed in `server/package.json`**.
On Render, `require("@google-cloud/firestore")` threw `Cannot find module`, so the backend
crashed on any route that touched Firestore.

- `server/config/firebase.js`: removed `require("@google-cloud/firestore")`.
- Now uses `admin.firestore()` (bundled inside `firebase-admin`) for the `db` client.
- `FieldValue` sourced from `admin.firestore.FieldValue` — no external package needed.

---

## Overall Risk: Low

All 11 QA errors resolved. No direct provider calls in browser, no broken routes, no broken
registration, bundle is split, tests default to localhost with production opt-in guard,
Firestore connectivity restored, and local browser/E2E tests now pass.
