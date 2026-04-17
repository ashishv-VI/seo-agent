# QA Error List - SEO AI Agent

Date: 2026-04-17
Tester: Codex QA audit pass
Last updated: 2026-04-17

## Summary

React + Vite frontend with Express/Firebase backend. The main functional QA issues are fixed, and frontend AI provider calls now route through the backend proxy.

Verification:
- Frontend build: PASS with `npm run build`
- Backend syntax: PASS with `npm run test:backend` outside the sandbox
- Backend syntax result: 87 server files passed
- Main bundle improvement: about 1,483 kB -> about 417 kB after lazy-loading split
- AI provider URL scan: PASS, no direct Groq/Gemini/OpenRouter browser calls found in `src`
- Remaining large chunk: ClientManager is about 575 kB

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

Status: FIXED / FOLLOW-UP REMAINS

- `src/App.jsx`: large page/tool components now use `React.lazy()` and `Suspense`.
- Main JS chunk reduced from about 1,483 kB to about 417 kB.
- Follow-up: `ClientManager` chunk is still about 575 kB and should be split further later.

---

## Error 5 - E2E Tests Are Hardcoded To Production Render

Status: FIXED / SAFER DEFAULTS RECOMMENDED

- `tests/live-browser-test.cjs`: now supports `FRONTEND_URL`, `BACKEND_URL`, and `HEADLESS`.
- `tests/e2e-full-journey.cjs`: now supports `FRONTEND_URL`, `BACKEND_URL`, and `HEADLESS`.
- Remaining recommendation: defaults still point to Render. Local/CI defaults should ideally be localhost or require explicit production opt-in.

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

Status: LOW PRIORITY / STILL PRESENT IN SOME COMMENTS AND DOCS

Corrupted characters still appear in some comments/docs. This does not currently block production behavior, but it should be cleaned when touching those files.

---

## Overall Risk: Low-Medium

The core functional issues are fixed, build/backend syntax checks pass, and frontend AI provider calls no longer expose user keys. Remaining follow-ups are performance/polish: split the large ClientManager chunk and clean mojibake in comments/docs.
