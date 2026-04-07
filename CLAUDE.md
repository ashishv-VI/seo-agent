# CLAUDE.md — SEO AI Agent Platform

## Project Overview

A full-stack, multi-agent SEO automation platform that mirrors real agency workflows.
- **Frontend**: React 18 + Vite (inline styles, no CSS framework)
- **Backend**: Express 5 + Firebase Firestore + Firebase Auth
- **Agents**: A0–A16 pipeline with dependency management
- **LLM**: Groq → Gemini → OpenRouter (3-provider fallback chain)
- **Deployment**: Render (backend at `onrender.com`), Vite build (frontend)

---

## Running the Project

```bash
# Frontend (http://localhost:5173)
npm run dev

# Backend (http://localhost:5000)
cd server && npm run dev

# Production build
npm run build
```

---

## Architecture

### Agent Pipeline (A0–A16)

Agents run in dependency order managed by `server/agents/A0_orchestrator.js`:

```
A1 (Brief) → A2 (Audit) + A7 (CWV) → A3 (Keywords) → A4 (Competitor)
           → A5 (Content) + A11 (Links) → A6 (On-Page) + A8 (GEO)
           → A9 (Report) + A10 (Rankings)
```

| Agent | File | Purpose |
|-------|------|---------|
| A0 | `A0_orchestrator.js` | Pipeline runner, dependency checker |
| A1 | `A1_onboarding.js` | Structures client brief → `A1_brief` |
| A2 | `A2_audit.js` | Technical SEO audit, depth-2 crawl, JS rendering → `A2_audit` |
| A3 | `A3_keywords.js` | Keyword research + clustering → `A3_keywords` |
| A4 | `A4_competitor.js` | Auto-discover competitors from SERP, crawl, analyse → `A4_competitor` |
| A5 | `A5_content.js` | Content briefs + meta rewrites → `A5_content` |
| A6 | `A6_onpage.js` | On-page fix queue (titles, schema, meta) → `A6_onpage` |
| A7 | `A7_technical.js` | PageSpeed Insights / Core Web Vitals → `A7_technical` |
| A8 | `A8_geo.js` | Local SEO, GBP, Knowledge Graph → `A8_geo` |
| A9 | `A9_monitoring.js` | 8-step LLM report + GSC summary → `A9_report` |
| A10 | `A10_rankingTracker.js` | Keyword position snapshots |
| A11 | `A11_linkBuilder.js` | 15 link-building opportunities |
| A12 | `A12_autoExec.js` | AI-generates fix implementations (Level 2) |
| A13 | `A13_autopush.js` | Auto-pushes approved fixes to WordPress (Level 2) |
| A14 | `A14_contentAutopilot.js` | Writes full articles for content gaps (Level 2) |
| A15 | `A15_competitorMonitor.js` | Daily competitor sitemap monitoring (Level 3) |
| A16 | `A16_memory.js` | Client AI memory enrichment (Level 3) |

**Every agent returns:** `{ success: boolean, error?: string, ...data }`

**Shared state pattern** (all agent state persisted in Firestore):
```js
const { saveState, getState } = require("../shared-state/stateManager");

// Save
await saveState(clientId, "A2_audit", result);

// Read in another agent
const audit = await getState(clientId, "A2_audit");
```

---

### Shared State (Firestore)

Collection: `shared_state`, document ID = `clientId`

Fields: `A1_brief`, `A2_audit`, `A3_keywords`, `A4_competitor`, `A5_content`, `A6_onpage`, `A7_technical`, `A8_geo`, `A9_report`

Other Firestore collections: `users`, `clients`, `tasks`, `approval_queue`, `alerts`, `notifications`, `portal_snapshots`, `content_drafts`, `wp_push_log`, `client_memory`, `score_history`, `rank_history`, `cwv_history`

---

### LLM Utility (`server/utils/llm.js`)

3-provider fallback chain. **Always use `callLLM()` — never call providers directly.**

```js
const { callLLM, parseJSON } = require("../utils/llm");

const response = await callLLM(prompt, keys, { maxTokens: 4000, temperature: 0.3 });
const data = parseJSON(response); // safe JSON parse with fallback
```

- **Groq** (primary): `llama-3.1-8b-instant`
- **Gemini** (fallback 1): `gemini-2.0-flash`
- **OpenRouter** (fallback 2): multi-model
- **Retry logic**: 2 attempts per provider; 429 → wait 60s then retry; timeout → retry after 1.5s
- **`keys`** object comes from `getUserKeys(uid)` — user's own Firestore keys with env var fallback

---

### Authentication

**Backend middleware** (`server/middleware/auth.js`):
```js
const { verifyToken } = require("../middleware/auth");
router.get("/route", verifyToken, async (req, res) => {
  const uid = req.uid; // Firebase UID
});
```
- Validates Firebase ID token from `Authorization: Bearer <token>`
- Always use `verifyToken` on protected routes

**Frontend** (`src/context/AuthContext.jsx`):
```js
const { user, getToken } = useAuth();
const token = await getToken(); // Firebase ID token (auto-refreshed)
// Use in fetch: Authorization: `Bearer ${token}`
```

---

## Frontend Conventions

### Dark/Light Mode Color System

All components receive and use these props — **never hardcode colors**:

```js
// Standard props pattern
function MyComponent({ dark, bg2, bg3, bdr, txt, txt2 }) { ... }

// Color definitions (from App.jsx / AgentPipeline.jsx)
const bg   = dark ? "#0a0a0a"  : "#f5f5f0";  // Page background
const bg2  = dark ? "#111"     : "#ffffff";  // Card background
const bg3  = dark ? "#1a1a1a"  : "#f0f0ea";  // Input / secondary background
const bdr  = dark ? "#222"     : "#e0e0d8";  // Border color
const txt  = dark ? "#e8e8e8"  : "#1a1a18";  // Primary text
const txt2 = dark ? "#666"     : "#888";     // Secondary / muted text
const B    = "#443DCB";                      // Brand blue (buttons, accents)
```

### Inline Styles — Required Pattern

All styles are **inline only**. No CSS modules, no Tailwind, no external classes.

```jsx
// Correct
<div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, padding: "12px 16px" }}>

// Wrong — never do this
<div className="card p-4 bg-white">
```

Standard values used across the codebase:
- `borderRadius`: 8, 10, 12, 14 (for cards), 6 (small), 4 (badges/tags)
- `fontSize`: 10 (tiny labels), 11 (secondary), 12 (body), 13 (default), 14–16 (headings)
- `fontWeight`: 400 (normal), 600 (semibold), 700 (bold), 800 (display)
- Status colors: `#059669` (green/success), `#D97706` (amber/warn), `#DC2626` (red/critical), `#443DCB` (brand blue), `#0891B2` (cyan/info)

### Issue Severity Colors

```js
const sevColor = {
  critical: "#DC2626", // P1
  warning:  "#D97706", // P2
  info:     "#6B7280", // P3
};
```

### Component Props Naming

Consistent across the entire codebase:
- `dark` — boolean dark mode flag
- `bg2`, `bg3`, `bdr`, `txt`, `txt2` — color tokens
- `clientId` — Firestore client document ID
- `getToken` — async function returning Firebase ID token
- `API` — backend base URL (from env/state)
- `onTabSwitch(tabId)` — callback for tab navigation

---

## Backend Conventions

### Route Structure

```js
const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/auth");

router.get("/:clientId/something", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid); // ownership check
    // ... logic
    return res.json({ data });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});
```

Always:
1. Use `verifyToken` middleware
2. Call `getClientDoc(clientId, uid)` to verify ownership
3. Wrap in try/catch, return `{ error: e.message }` on failure
4. Use `AbortSignal.timeout(N)` on all external `fetch()` calls

### Error Handling

```js
// External fetch calls — always add timeout
const res = await fetch(url, { signal: AbortSignal.timeout(10000) });

// 429 handling in LLM (already in llm.js — don't re-implement)
if (res.status === 429) throw Object.assign(new Error("429 rate limit"), { name: "RateLimitError" });
```

### Agent Output Pattern

```js
// Success
return { success: true, agentKey: result };

// Failure
return { success: false, error: "Human-readable reason" };

// Always save before returning
await saveState(clientId, "AX_key", result);
```

---

## Key Files Reference

### Frontend
| File | Purpose |
|------|---------|
| `src/App.jsx` | Main router, onboarding, API key setup, tool navigation |
| `src/pages/AgentPipeline.jsx` | Full pipeline UI — all agent views, tabs, task cards |
| `src/pages/PrintReport.jsx` | White-label PDF report (print-CSS, no Tailwind) |
| `src/pages/ApprovalQueue.jsx` | Human gate for A5/A6/A12 fixes |
| `src/context/AuthContext.jsx` | Firebase Auth + Google OAuth (GSC/GA4/GBP scopes) |
| `src/config/firebase.js` | Firebase client SDK init |
| `src/tools.js` | 60+ tool definitions with prompts, icons, categories |

### Backend
| File | Purpose |
|------|---------|
| `server/index.js` | Express entry point, daily/monthly schedulers |
| `server/routes/agents.js` | All agent run + data endpoints |
| `server/utils/llm.js` | LLM fallback chain + retry logic |
| `server/utils/getUserKeys.js` | Per-user API key fetching |
| `server/utils/jsRenderer.js` | Puppeteer JS rendering with graceful fallback |
| `server/utils/scoreCalculator.js` | 4-dimension SEO score + forecast |
| `server/crawler/serpScraper.js` | Free SERP scraping (DDG → Bing, 30 results) |
| `server/crawler/webCrawler.js` | Multi-page site crawler |
| `server/shared-state/stateManager.js` | Firestore agent state CRUD |

---

## Environment Variables

Copy `.env.example` to `.env` in both root and `server/`.

**Required for core functionality:**
```
# Frontend (.env in root)
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_API_URL=http://localhost:5000

# Backend (server/.env)
FIREBASE_PROJECT_ID=
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}  # JSON string
JWT_SECRET=minimum-32-character-secret-key
PORT=5000
FRONTEND_URL=http://localhost:5173
```

**LLM (at least one required):**
```
GROQ_API_KEY=
GEMINI_API_KEY=
OPENROUTER_API_KEY=
```

**Google integrations (for GSC/GA4/GBP):**
```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_API_KEY=
```

**Optional SEO data:**
```
SERPAPI_KEY=          # Live SERP data (free SERP fallback works without it)
SERANKING_API_KEY=
DATAFORSEO_KEY=
```

---

## Important Patterns to Follow

### Adding a New Agent Tab in AgentPipeline.jsx

1. Add tab trigger: `{isComplete("AX") && <div style={s.tab(activeTab==="mytab")} onClick={()=>setActiveTab("mytab")}>🔧 My Tab</div>}`
2. Add tab content: `{activeTab==="mytab" && state.AX_key && (<MyView data={state.AX_key} dark={dark} bg2={bg2} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2} />)}`
3. Add mini-summary component: `function MySummary({ data, txt, txt2 }) { return <div style={{ fontSize:12, color:txt2 }}>...</div>; }`
4. Add full view component with the standard color prop pattern

### Adding a New API Route

```js
// server/routes/agents.js or new file
router.get("/:clientId/my-data", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const data = await getState(req.params.clientId, "AX_key");
    if (!data) return res.json({ myData: [] });
    return res.json({ myData: data.something || [] });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});
```

### Calling the LLM with Structured Output

```js
const prompt = `You are an SEO expert. Analyse X. Return ONLY valid JSON:
{
  "field1": "value",
  "field2": ["item1", "item2"],
  "field3": 42
}`;

const response = await callLLM(prompt, keys, { maxTokens: 3000, temperature: 0.3 });
const parsed   = parseJSON(response);
// parseJSON always returns an object (empty {} on failure)
```

### SERP Scraping (Free — No API Key)

```js
const { getSERP } = require("../crawler/serpScraper");

const result = await getSERP("target keyword", { location: "in", num: 30 });
// result.results = [{ title, url, domain, position, snippet }]
// DDG first → Bing fallback → always returns up to 30 results
```

### Competitor Auto-Discovery (A4 Pattern)

When `brief.competitors` is empty, A4 automatically:
1. Calls `getSERP()` for the top 5 target keywords
2. Counts domain frequency in results
3. Picks the top 5–6 domains as competitors
4. Crawls each competitor homepage for real SEO signals
5. Passes real data to LLM for analysis

### Issue Severity in A2/A6

```js
// P1 — blocks rankings, urgent
issues.p1.push({ type: "missing_ssl", detail: "HTTPS not enabled", fix: "Install SSL certificate" });

// P2 — hurts rankings, important
issues.p2.push({ type: "missing_meta", detail: "No meta description on homepage", fix: "Add 120-170 char description" });

// P3 — minor improvements
issues.p3.push({ type: "missing_alt", detail: "3 images without alt text", fix: "Add descriptive alt attributes" });
```

---

## Deployment (Render)

The project is deployed on Render (see `render.yaml`):
- **Backend**: `server/` → Node web service, auto-deploy on push to `main`
- **Frontend**: Root → Vite static site build, `dist/` served

**CORS** configured in `server/index.js` — allows `localhost:5173`, `localhost:3000`, and `*.onrender.com`

Push to `main` branch triggers both deploys automatically.

---

## Firebase Collections Quick Reference

| Collection | Key | Purpose |
|------------|-----|---------|
| `users` | uid | User profile + `apiKeys` (groq, gemini, openrouter, serp, google...) |
| `clients` | clientId | Client data, `pipelineStatus`, `seoScore` |
| `shared_state` | clientId | All agent outputs (A1_brief, A2_audit, etc.) |
| `tasks` | auto | Task queue (pending/approved/completed), used by A12 |
| `approval_queue` | auto | Human review gate for A9 reports, A6 fixes |
| `alerts` | auto | P1/P2/P3 alert log from A9 checkAlerts() |
| `score_history` | `clientId_date` | SEO score time series for trend charts |
| `rank_history` | `clientId_date` | Keyword position snapshots |
| `cwv_history` | auto | Core Web Vitals history per client |
| `content_drafts` | auto | A14-generated article drafts |
| `wp_push_log` | auto | A13 WordPress push audit trail |
| `client_memory` | clientId | A16 structured memory for AI context |
| `portal_snapshots` | auto | Monthly SEO score snapshots for white-label portal |

---

## Common Gotchas

1. **Agent state access** — Always `await getState()`. State is async Firestore, never synchronous.

2. **`parseJSON` safety** — Always use `parseJSON(response)` from `llm.js`, never `JSON.parse()` directly on LLM output. LLM often wraps JSON in markdown code blocks.

3. **AbortSignal.timeout** — Add to every `fetch()` call to external services. Standard timeouts: 10s for crawl, 20s for PageSpeed, 30s for SERP, 8s for quick checks.

4. **Rate limits** — Already handled in `llm.js` (60s wait + retry). For SERP, use the free `getSERP()` scraper to avoid SerpAPI quota burn.

5. **Firestore document size** — Max 1MB per doc. `A2_audit` with full crawl data can be large. Keep `pageAudits` to 80 pages max (enforced in A2).

6. **JS-rendered sites** — `jsRenderer.js` uses Puppeteer with graceful fallback to `fetch()`. Check `checks.isJSRendered` flag in A2 output to know if Puppeteer was used.

7. **Color props** — Never use `dark ? "#111" : "#fff"` inline in child components. Always receive `bg2`, `bg3`, `bdr`, `txt`, `txt2` as props from parent.

8. **Issue field names** — A2's `auditPage()` produces `{ type, detail, fix }`. The `/pages` API route produces `{ type, label, severity }` for basic checks. The UI renders `issue.detail || issue.label || issue.type` to handle both.

9. **Accordion deduplication** — In AgentPipeline DashboardView, `topTasks` are shown in "Fix These First". Filter them out of category accordions: `const catTasks = allTasks.filter(t => t.category === cat.id && !topIds.has(t.id))`.

10. **A9 report fields** — LLM returns `expectedOutcome` (not `how`) in `next3Actions`. KPI scorecard `status` is `"green" | "amber" | "red"` — render as "On Track / Warning / At Risk".
