# CLAUDE.md — SEO AI Agent Platform
**Damco Digital · Internal · April 2026**

---

## Platform Vision

An AI-powered SEO Operating System — not just an audit tool, but a system that:
1. **Senses** — Collects data from GSC, GA4, crawler, rank tracker
2. **Decides** — CMO Agent sees all data → decides what to fix (Sprint 3 goal)
3. **Acts** — Pushes fixes automatically (WP autopush working)
4. **Learns** — Tracks what worked, cross-client pattern learning (Sprint 5)

**Current state**: Platform is 60% AI Agent, 40% advanced automation. SENSE + ACT + partial LEARN work. DECIDE step (CMO Agent) is Sprint 3.

**3 User Types:**
| User | Need | Platform Delivers |
|------|------|-------------------|
| SEO Executive | Manage 20 clients without missing anything | Auto-alerts, approval queue, weekly briefings |
| Client | Proof that money is working, show growth | Control room, before/after, lead attribution |
| Agency Head (HoM) | Scale without adding headcount | Agency dashboard, ROI per client, renewal reports |

---

## Deployment

This project is **live on Render** — there is no local development setup.

- **Frontend (Static Site)**: Deployed on Render, built with `npm run build` (Vite → `dist/`)
- **Backend (Web Service)**: Deployed on Render from `server/`, runs `node index.js`
- **Auto-deploy**: Every push to `main` branch triggers both services to redeploy automatically
- **Environment variables**: Set directly in Render dashboard (not in `.env` files)

**To deploy a change**: commit + push to `main` — Render handles the rest.

```bash
git add .
git commit -m "feat: description"
git push origin main
```

---

## Complete Agent Architecture (21 Agents)

### STRATEGY LAYER
| Agent | Type | Purpose | Status |
|-------|------|---------|--------|
| **CMO Agent** | Strategy | Sees all data → decides: focus on Traffic or Conversion → auto-triggers next agent | **Build (Sprint 3)** |
| **A17 Reviewer** | Quality | Quality gate — confidence score 0–1 per agent output | **Build (Sprint 4)** |
| **A19 Conversion** | Revenue | Traffic coming but no leads? Analyses CTA, forms, landing pages | **Build (Sprint 4)** |

### DISCOVERY LAYER
| Agent | Type | Purpose | Status |
|-------|------|---------|--------|
| **A1** `A1_onboarding.js` | Input | Client brief: business info, goals, keywords, competitors, KPI selection → `A1_brief` | **Exists** |
| **A2** `A2_audit.js` | Technical | 50–80 pages crawl, depth-2, JS rendering, 34 issue types → `A2_audit` | **Partial** (500+ page sitemap crawl in Sprint 1) |
| **A3** `A3_keywords.js` | Research | 4 clusters: intent, difficulty, priority, suggestedPage → `A3_keywords` | **Exists** |
| **A4** `A4_competitor.js` | Research | Auto-discover competitors from SERP, crawl, live positions, content gaps → `A4_competitor` | **Exists** |
| **A21 Pre-Sales** | Sales | 60-second demo audit for sales meetings. No login needed. | **Build (Sprint 4)** |

### EXECUTION LAYER
| Agent | Type | Purpose | Status |
|-------|------|---------|--------|
| **A5** `A5_content.js` | Content | Homepage briefs, page plan, content gaps → `A5_content` | **Exists** |
| **A6** `A6_onpage.js` | Technical | Schema, title, meta, internal links, OG tags → `A6_onpage` | **Exists** |
| **A7** `A7_technical.js` | Technical | Real PageSpeed API — LCP, CLS, FCP, TTFB → `A7_technical` | **Exists** |
| **A8** `A8_geo.js` | Local | GBP, NAP, Knowledge Graph, AI search visibility → `A8_geo` | **Exists** |
| **A14** `A14_contentAutopilot.js` | Automation | AI writes blog posts, pushes as WordPress draft | **Exists** |

### AUTOMATION LAYER
| Agent | Type | Purpose | Status |
|-------|------|---------|--------|
| **A13** `A13_autopush.js` | Push | Backup → Push → Log. Rollback. Human gate required. | **Exists** |
| **A10** `A10_rankingTracker.js` | Monitor | GSC real + DDG free fallback. History + alerts. | **Exists** |
| **A11** `A11_linkBuilder.js` | Backlinks | 15 link prospects + outreach email drafts | **Exists** |
| **A15** `A15_competitorMonitor.js` | Monitor | Daily sitemap diff. New competitor pages → alert. | **Exists** |
| **A18 Client Notifier** | Comms | Fix pushed → email. Monthly report auto-send. | **Build (Sprint 2)** |

### INTELLIGENCE LAYER
| Agent | Type | Purpose | Status |
|-------|------|---------|--------|
| **A9** `A9_monitoring.js` | Report | 8-section synthesis. GSC data. Forecast. → `A9_report` | **Exists** |
| **A16** `A16_memory.js` | Learn | Score history, fix log, what worked tracking → `client_memory` | **Exists** |
| **ROI Attribution** | Revenue | Fix → rank → traffic → revenue chain | **Build (Sprint 3)** |
| **A20 Impact Report** | Renewal | 6-month PDF. Before vs after. Renewal weapon. | **Build (Sprint 4)** |
| **A12** `A12_autoExec.js` | Automation | CMO decision → schedules next agent run | **Exists** |

### Pipeline Dependency Order (A0 Orchestrator)
```
A1 (Brief) → A2 (Audit) + A7 (CWV)  → A3 (Keywords) → A4 (Competitor)
           → A5 (Content) + A11 (Links) → A6 (On-Page) + A8 (GEO)
           → A9 (Report) + A10 (Rankings)
```
Every agent returns: `{ success: boolean, error?: string, ...data }`

---

## SEO KPIs — What the Platform Tracks

The platform measures: **1) Current state → 2) Benchmark → 3) Agent decision if gap exists**

| KPI | Metric | Agent | Data Source | Success | Agent Decision if Below |
|-----|--------|-------|-------------|---------|------------------------|
| **KPI 1** | Keyword Rankings | A3 + A10 | GSC + DDG | Pos 1–10 = green, 11–20 = amber, 21+ = red | Keyword on page 2 → A11 backlinks. Drop → A2 re-run. |
| **KPI 2** | Organic Traffic | A10 + GA4 | GSC + GA4 Free | Month 1: baseline, Month 3: +20–40%, Month 6: +80–150% | CTR low despite ranking → A5 title rewrite. High impressions, low clicks → meta optimize. |
| **KPI 3** | Click-Through Rate | A5 + A6 | GSC Free | Pos 1: 25%+, Pos 3: 10%+, Pos 10: 2%+ | CTR 1.5% at pos 6 → title tag rewrite. Analyse competitor titles. |
| **KPI 4** | Backlinks / DA | A11 + DataForSEO | DataForSEO (paid) | Month 1–3: 2–5 quality links, Month 6: DR +5–10 | DR stuck → A11 high-authority prospects priority. |
| **KPI 5** | Technical Health | A2 + A7 | PageSpeed + Crawler | P1 issues: 0 target. LCP < 2.5s. Score 80+ | Score plateau → deeper crawl. Technical done → content layer focus. |
| **KPI 6** | Content Performance | A5 + A14 | GSC + GA4 | Month 1: 2–3 new pages, Month 3: 30% pages get impressions | Blog no impressions after 3 months → refresh. Competitor ranking → update + depth add. |
| **KPI 7** | Conversion Rate | A19 (Build) | GA4 + GTM | E-comm: 1–3%, Lead gen: 3–8%, Services: 2–5% | 500 traffic, 2 leads = 0.4% CR → landing page problem. CTA fix needed. |

---

## Client Control Room — Complete Plan

**Concept**: When a client is added → automatically generate a live intelligence dashboard.

### Data Sources
| Source | Data | Cost | Setup |
|--------|------|------|-------|
| Google Search Console | Keyword positions, clicks, CTR, impressions, top pages | FREE | OAuth connect (1 time) |
| Google Analytics 4 | Sessions, organic traffic, top landing pages, bounce rate, conversions | FREE | OAuth connect (1 time) |
| GTM Custom Events | Form fills, phone clicks, WhatsApp clicks, CTA button clicks, scroll depth | FREE | GTM setup (1 time per client) |
| Our Web Crawler | Page health, broken links, title/meta issues, speed changes, new pages | FREE | Auto runs in pipeline |
| DataForSEO | Backlinks, referring domains, domain rating | PAID | Optional — only for backlink data |

### Control Room Sections
1. **This Week (GSC Data)** — Top performing page, best keyword, new keywords ranking, CTR, impressions. Week-over-week delta.
2. **Traffic (GA4)** — Organic visitors, top landing pages, session duration, bounce rate, new vs returning.
3. **Lead Tracking (GTM)** — Form fills count, top lead source page, phone clicks, WhatsApp clicks, keyword→lead attribution.
4. **Site Health** — Overall score, critical issues, fixes pushed this month, competitor new pages alert.
5. **Agent Suggestions** — CMO agent analyses all data → 3–5 priority suggestions with reasoning and expected impact.
6. **Before/After Compare** — Day 1 vs today. Score, rankings, traffic, leads, fixes. 6-month trend graphs.

### Lead + Call Tracking (All Free via GTM)
| Track | How | Code Needed |
|-------|-----|-------------|
| Form fills | GTM → `form_submit` event → GA4 conversion | 1 GTM trigger |
| Phone clicks | GTM → `tel:` link click → GA4 event | 1 GTM trigger |
| WhatsApp clicks | GTM → outbound click (`wa.me`) → GA4 | 1 GTM trigger |
| CTA button clicks | GTM → click element → GA4 event | 1 GTM trigger per CTA |
| Keyword → Lead | GSC keyword + GA4 landing page + GA4 conversion join | Backend API join |
| Scroll engagement | GA4 enhanced measurement ON | Zero — auto-track |
| UTM attribution | Add UTM links to blog posts | URL parameter |

---

## API Strategy — Free Stack

**Goal**: 80% capability runs FREE. Only DataForSEO (backlinks) needs paid API.

| Feature | Old (Paid) | Free Alternative | Quality |
|---------|-----------|-----------------|---------|
| LLM Analysis | Groq (rate limited) | Gemini 1.5 Flash — generous free tier (already added) | Same quality |
| Rank Tracking | SerpAPI | GSC (best!) + DDG scraper (built) | GSC better than SerpAPI |
| Traffic Data | None | GA4 free API | 100% accurate |
| Technical Audit | None | Our crawler + PageSpeed free API | Accurate |
| SERP Data | SerpAPI | DDG scraper (built) | 70–80% accurate |
| Keyword Volume | SE Ranking | DDG SERP signals estimate | ~60% accurate |
| Backlinks | DataForSEO | No good free option | Need paid for accuracy |
| Competitor Data | None | A4 uses DDG SERP + our crawler | Sufficient |

**Free Stack**: GSC + GA4 + PageSpeed + DDG + Gemini = complete platform at zero cost.

---

## Build Roadmap — Sprint by Sprint

### Sprint 1 — Week 1–2
- [ ] Add 3 missing onboarding fields: avg order value, social links, past SEO history
- [ ] Baseline snapshot at onboarding — save Day 1 state for before/after
- [ ] KPI selection in A1 brief — client chooses: Traffic / Leads / Sales / Local
- [ ] Full site audit — sitemap.xml parsing for 500+ pages (instead of 50–80)

### Sprint 2 — Week 3–4
- [ ] Weekly GSC + GA4 auto-pull job — every Monday: fetch + store + calculate delta
- [ ] Control Room dashboard page — new React page: GSC, GA4, Health, Suggestions
- [ ] A18: Fix pushed → client email notification
- [ ] Monthly auto-report email — auto-send to client every 1st of month

### Sprint 3 — Week 5–6
- [ ] **CMO Agent** — decision layer: CTR low → fix titles, page 2 → backlinks, no leads → conversion
- [ ] ROI attribution wire-up — fix → ranking → traffic → revenue chain properly connected
- [ ] Keyword → Lead attribution API — `/api/attribution/:clientId` — GSC + GA4 join
- [ ] GTM setup guide generator — auto-generate GTM instructions per client

### Sprint 4 — Week 7–8
- [ ] **A17 Reviewer Agent** — quality gate with confidence score per agent output
- [ ] **A19 Conversion Agent** — landing page, CTA, form optimization analysis
- [ ] **A20 Impact Report** — 6-month PDF, one click, renewal weapon
- [ ] **A21 Pre-Sales Audit** — 60-second demo audit for sales meetings, no login

### Sprint 5 — Week 9–10
- [ ] Continuous monitoring loop — 24/7 watchdog: rank drop → auto-investigate → suggest fix
- [ ] Cross-client pattern learning — what worked for client A → suggest for client B
- [ ] Agency dashboard — all clients: total traffic, revenue, score trends
- [ ] LLM reduction — replace LLM calls with rule-based logic where possible

---

## The 4-Step AI Agent Loop

| Step | Name | Current State | Goal |
|------|------|--------------|------|
| 1 | **SENSE** | GSC, GA4, crawler, rank tracker collect data | All KPI data in one place, real-time |
| 2 | **DECIDE** | Human decides manually | CMO Agent sees pattern and decides autonomously |
| 3 | **ACT** | Fixes pushed via WP autopush | Auto-trigger next agent based on decision |
| 4 | **LEARN** | A16 stores basic score history | Cross-client learning — what worked where |

### Milestones to "Real AI Agent"
- **Milestone 1** (Sprint 3): CMO Agent built and making autonomous decisions
- **Milestone 2** (Sprint 3): Platform suggests a fix with no human trigger — data proves it worked
- **Milestone 3** (Sprint 3): Keyword → Lead attribution chain complete (GSC → GA4)
- **Milestone 4** (Sprint 4): Client says "I can see SEO is bringing money"
- **Milestone 5** (Sprint 5): Agency acquires new client using pre-sales audit tool

---

## Architecture & Tech Stack

- **Frontend**: React 18 + Vite (inline styles, no CSS framework)
- **Backend**: Express + Firebase Firestore + Firebase Auth
- **LLM**: Groq → Gemini → OpenRouter (3-provider fallback chain)
- **Deployment**: Render (both frontend static site + backend web service)
- **Database**: Firebase Firestore (no SQL)
- **Auth**: Firebase Auth (email/password + Google OAuth for GSC/GA4/GBP)

---

## Shared State Pattern

All agent outputs are persisted in Firestore. **Always use `saveState`/`getState` — never pass state between agents directly.**

```js
const { saveState, getState } = require("../shared-state/stateManager");

// Save agent output
await saveState(clientId, "A2_audit", result);

// Read in another agent
const audit = await getState(clientId, "A2_audit");
```

**Firestore collection**: `shared_state`, document ID = `clientId`
**Fields**: `A1_brief`, `A2_audit`, `A3_keywords`, `A4_competitor`, `A5_content`, `A6_onpage`, `A7_technical`, `A8_geo`, `A9_report`

---

## LLM Utility (`server/utils/llm.js`)

**Always use `callLLM()` — never call providers directly.**

```js
const { callLLM, parseJSON } = require("../utils/llm");

const response = await callLLM(prompt, keys, { maxTokens: 4000, temperature: 0.3 });
const data = parseJSON(response); // safe — handles markdown code blocks around JSON
```

- **Groq** (primary): `llama-3.1-8b-instant` — fast, free tier
- **Gemini** (fallback 1): `gemini-2.0-flash` — generous free tier
- **OpenRouter** (fallback 2): multi-model, last resort
- **Retry**: 2 attempts per provider; 429 → wait 60s then retry; timeout → retry after 1.5s
- `keys` object from `getUserKeys(uid)` — user's Firestore keys, env vars as fallback

---

## Authentication

**Backend** (`server/middleware/auth.js`):
```js
const { verifyToken } = require("../middleware/auth");
router.get("/route", verifyToken, async (req, res) => {
  const uid = req.uid; // Firebase UID
  await getClientDoc(req.params.clientId, req.uid); // always verify ownership
});
```

**Frontend** (`src/context/AuthContext.jsx`):
```js
const { getToken } = useAuth();
const token = await getToken(); // auto-refreshed Firebase ID token
// Headers: { Authorization: `Bearer ${token}` }
```

---

## Frontend Conventions

### Dark/Light Mode Color System — Never hardcode colors

```js
// Always receive these as props
function MyComponent({ dark, bg2, bg3, bdr, txt, txt2 }) { ... }

const bg   = dark ? "#0a0a0a"  : "#f5f5f0";  // Page background
const bg2  = dark ? "#111"     : "#ffffff";  // Card background
const bg3  = dark ? "#1a1a1a"  : "#f0f0ea";  // Input/secondary background
const bdr  = dark ? "#222"     : "#e0e0d8";  // Border
const txt  = dark ? "#e8e8e8"  : "#1a1a18";  // Primary text
const txt2 = dark ? "#666"     : "#888";     // Muted text
const B    = "#443DCB";                      // Brand blue
```

### Inline Styles Only — No CSS classes, no Tailwind

```jsx
// Correct
<div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, padding: "12px 16px" }}>

// Wrong — never
<div className="card p-4 bg-white">
```

**Standard values**: borderRadius 8/10/12/14, fontSize 10–16, status colors: `#059669` green, `#D97706` amber, `#DC2626` red, `#443DCB` brand, `#0891B2` cyan.

---

## Backend Conventions

### Route Structure
```js
router.get("/:clientId/something", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    // logic
    return res.json({ data });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});
```

Always: (1) `verifyToken`, (2) ownership check, (3) try/catch, (4) `AbortSignal.timeout(N)` on all external fetch calls.

### Agent Output Pattern
```js
await saveState(clientId, "AX_key", result);  // always save first
return { success: true, agentKey: result };   // then return
```

### Issue Severity (A2/A6)
```js
issues.p1.push({ type: "missing_ssl",  detail: "HTTPS not enabled",    fix: "Install SSL certificate" });  // P1 — blocks rankings
issues.p2.push({ type: "missing_meta", detail: "No meta description",  fix: "Add 120–170 char desc" });    // P2 — hurts rankings
issues.p3.push({ type: "missing_alt",  detail: "3 images without alt", fix: "Add alt attributes" });       // P3 — minor
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
| `src/tools.js` | 60+ tool definitions with prompts, icons, categories |

### Backend
| File | Purpose |
|------|---------|
| `server/index.js` | Express entry point, daily/monthly schedulers |
| `server/agents/A0_orchestrator.js` | Pipeline runner, dependency chain, allSettled, 25-min timeout |
| `server/routes/agents.js` | All agent run + data endpoints |
| `server/utils/llm.js` | LLM fallback chain + 429 retry logic |
| `server/utils/jsRenderer.js` | Puppeteer JS rendering with graceful fetch() fallback |
| `server/utils/scoreCalculator.js` | 4-dimension SEO score + forecast |
| `server/utils/roiTracker.js` | ROI attribution (fix → rank → traffic → revenue) |
| `server/crawler/serpScraper.js` | Free SERP scraping (DDG → Bing, 30 results) |
| `server/shared-state/stateManager.js` | Firestore agent state CRUD |

---

## Environment Variables (Set in Render Dashboard)

**Frontend (Render Static Site → Environment):**
```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_API_URL=https://<your-backend>.onrender.com
```

**Backend (Render Web Service → Environment):**
```
FIREBASE_PROJECT_ID=
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}   # full JSON string
JWT_SECRET=minimum-32-character-secret-key
PORT=10000                                                # Render default
APP_URL=https://<your-backend>.onrender.com
FRONTEND_URL=https://<your-frontend>.onrender.com
```

**LLM (at least one required):**
```
GROQ_API_KEY=
GEMINI_API_KEY=
OPENROUTER_API_KEY=
```

**Google (for GSC/GA4/GBP/PageSpeed):**
```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_API_KEY=
```

**Optional paid SEO APIs:**
```
SERPAPI_KEY=          # Live SERP — free DDG fallback works without it
DATAFORSEO_KEY=       # Backlinks — no free alternative
SERANKING_API_KEY=    # Optional
```

---

## Render Configuration

| Service | Type | Root Dir | Build Command | Start Command |
|---------|------|----------|---------------|---------------|
| Backend | Web Service | `server/` | `npm install` | `node index.js` |
| Frontend | Static Site | `/` | `npm install && npm run build` | — (serves `dist/`) |

**CORS** in `server/index.js` allows `*.onrender.com`.

**Cold-start warning**: Render free tier spins down after 15 min inactivity. First request after sleep takes ~30s. Upgrade to paid instance for always-on.

**Deploy logs**: Render dashboard → service → "Logs" tab.

---

## Firestore Collections Quick Reference

| Collection | Key | Purpose |
|------------|-----|---------|
| `users` | uid | User profile + `apiKeys` |
| `clients` | clientId | Client data, `pipelineStatus`, `seoScore` |
| `shared_state` | clientId | All agent outputs (A1_brief → A9_report) |
| `tasks` | auto | Task queue (pending/approved/completed) |
| `approval_queue` | auto | Human review gate for A9 reports, A6 fixes |
| `alerts` | auto | P1/P2/P3 alert log from A9 `checkAlerts()` |
| `score_history` | `clientId_date` | SEO score time series |
| `rank_history` | `clientId_date` | Keyword position snapshots |
| `cwv_history` | auto | Core Web Vitals history |
| `content_drafts` | auto | A14-generated article drafts |
| `wp_push_log` | auto | A13 WordPress push audit trail |
| `client_memory` | clientId | A16 structured memory |
| `portal_snapshots` | auto | Monthly SEO score snapshots (white-label portal) |

---

## Common Gotchas

1. **Agent state is async Firestore** — always `await getState()`, never synchronous.

2. **`parseJSON` safety** — always use `parseJSON(response)` from `llm.js`, never `JSON.parse()` directly. LLM wraps JSON in markdown code blocks.

3. **AbortSignal.timeout** — add to every external `fetch()`. Standard: 10s crawl, 20s PageSpeed, 30s SERP, 8s quick checks.

4. **Rate limits** — handled in `llm.js` (60s wait + retry). Use free `getSERP()` scraper to avoid SerpAPI quota burn.

5. **Firestore doc size** — max 1MB. `A2_audit` with full crawl can be large. Cap `pageAudits` at 80 pages (enforced in A2).

6. **JS-rendered sites** — `jsRenderer.js` uses Puppeteer with fetch() fallback. Check `checks.isJSRendered` in A2 output.

7. **Color props** — never hardcode `dark ? "#111" : "#fff"` in child components. Always receive `bg2`, `bg3`, `bdr`, `txt`, `txt2` as props.

8. **Issue field names** — A2 `auditPage()` produces `{ type, detail, fix }`. Pages API `/pages` route produces `{ type, label, severity }`. UI renders `issue.detail || issue.label || issue.type`.

9. **A9 report fields** — LLM returns `expectedOutcome` (not `how`) in `next3Actions`. KPI status is `"green"|"amber"|"red"` — render as "On Track / Warning / At Risk".

10. **Accordion deduplication** — `topTasks` shown in "Fix These First". Filter from category accordions: `allTasks.filter(t => t.category === cat.id && !topIds.has(t.id))`.

11. **A4 auto-discovery** — when `brief.competitors` is empty, A4 discovers top 5–6 competitors from SERP automatically, crawls their homepages, passes real data to LLM.

12. **Render cold-start** — backend on free tier sleeps after 15 min. If pipeline seems stuck, it may be waking up. First request takes ~30s.
