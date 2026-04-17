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

## Overall Risk: Low

All 8 QA errors resolved. No direct provider calls in browser, no broken routes, no broken registration, bundle is split, tests default to localhost with production opt-in guard.
