# CLAUDE.md — SEO AI Agent Platform
**Damco Digital · Internal · April 2026**

---

## What We Are Building

A **true SEO AI Agent** — not a dashboard, not a report tool.
The difference: it senses data, decides what to fix, acts autonomously, verifies results, and learns over time.

```
SENSE → DECIDE → ACT → VERIFY → LEARN → repeat forever
```

**Current honest state**: SENSE ✅ ACT ✅ DECIDE ✅ VERIFY ✅ LEARN ⚠️ (CMO reads memory, not yet fully cross-client)
The loop is mostly closed. Alert→Investigate→Fix chain built. Remaining: cross-client learning depth.

**3 User Types:**
| User | Need | Platform Delivers |
|------|------|-------------------|
| SEO Executive | Manage 20 clients without missing anything | Auto-alerts, approval queue, weekly briefings |
| Client | Proof that SEO is bringing money | Control room, keyword→lead attribution, before/after |
| Agency Head | Scale without adding headcount | Agency dashboard, ROI per client, renewal reports |

---

## Deployment

Live on Render — no local dev setup.

- **Frontend**: Render Static Site — `npm run build` (Vite → `dist/`)
- **Backend**: Render Web Service — `server/`, `node index.js`
- **Deploy**: push to `main` → auto-deploy both services

```bash
git add <files>
git commit -m "feat: description"
git push origin main
```

---

## Agent Architecture — All 24 Agents

### STRATEGY LAYER
| Agent | File | Purpose | Status |
|-------|------|---------|--------|
| **CMO Agent** | `CMO_agent.js` | Sees all data → decides what to fix → queues next agents | ✅ Built — reads A16 memory + cross-client patterns |
| **A17 Reviewer** | `A17_reviewer.js` | Quality gate — confidence score 0–1 per agent output | ✅ Built |
| **A19 Conversion** | `A19_conversion.js` | CRO: CTA gaps, form issues, landing page blockers | ✅ Built |
| **A22 Predictive** | `A22_predictive.js` | 90-day traffic forecast (linear regression) + keyword opportunity scoring | ✅ Built |
| **A23 Investigator** | `A23_investigator.js` | Alert → root cause diagnosis → proposed fix → approval queue + notification | ✅ Built |

### DISCOVERY LAYER
| Agent | File | Purpose | Status |
|-------|------|---------|--------|
| **A1** | `A1_onboarding.js` | Client brief, KPI selection, avg order value, social links | ✅ Built |
| **A2** | `A2_audit.js` | Sitemap-first crawl (500+ pages), 34 issue types, JS rendering | ✅ Built — stores per-page data in shared_state (cap 80 in doc, full in subcollection needed) |
| **A3** | `A3_keywords.js` | 4 clusters: intent, difficulty, priority, suggestedPage | ✅ Built |
| **A4** | `A4_competitor.js` | SERP auto-discovery, homepage crawl, ranking matrix, LLM analysis | ✅ Built — LLM fallback to suggested competitors if SERP fails |
| **A21** | `A21_preSales.js` | 60-second public audit for sales demos. No login. `/audit` route | ✅ Built |

### EXECUTION LAYER
| Agent | File | Purpose | Status |
|-------|------|---------|--------|
| **A5** | `A5_content.js` | Content briefs, page plan, content gaps | ✅ Built |
| **A6** | `A6_onpage.js` | Schema, title, meta, internal links, OG tags | ✅ Built |
| **A7** | `A7_technical.js` | Real PageSpeed API — LCP, CLS, FCP, TTFB | ✅ Built |
| **A8** | `A8_geo.js` | GBP, NAP, Knowledge Graph, local SEO | ✅ Built |
| **A14** | `A14_contentAutopilot.js` | AI writes blog posts, pushes as WordPress draft | ✅ Built |

### AUTOMATION LAYER
| Agent | File | Purpose | Status |
|-------|------|---------|--------|
| **A13** | `A13_autopush.js` | Backup → Push → Log. Rollback. Triggers A18 on push. | ✅ Built |
| **A10** | `A10_rankingTracker.js` | GSC → SerpAPI → DDG fallback. Rankings + drop alerts. | ✅ Built |
| **A11** | `A11_linkBuilder.js` | 15 link prospects + outreach email drafts | ✅ Built |
| **A15** | `A15_competitorMonitor.js` | Daily sitemap diff → new competitor pages → alert | ✅ Built |
| **A18** | `A18_clientNotifier.js` | Email on fix push / report ready / P1 alert (SendGrid) | ✅ Built |

### INTELLIGENCE LAYER
| Agent | File | Purpose | Status |
|-------|------|---------|--------|
| **A9** | `A9_monitoring.js` | 8-section synthesis, GSC data, forecast, triggers A18 | ✅ Built |
| **A16** | `A16_memory.js` | Score history, fix log, what worked tracking | ✅ Built — data stored, not yet read by CMO |
| **A12** | `A12_autoExec.js` | CMO decision → schedules next agent run | ✅ Built |
| **A20** | `A20_impactReport.js` | 6-month before/after report, work completed, ROI | ✅ Built |

### Pipeline Dependency Order (A0 Orchestrator)
```
A1 (Brief) → A2 (Audit) + A7 (CWV) → A3 (Keywords) → A4 (Competitor)
           → A5 (Content) + A11 (Links) → A6 (On-Page) + A8 (GEO)
           → A9 (Report) + A10 (Rankings)
```
Every agent returns: `{ success: boolean, error?: string, ...data }`

---

## True AI Agent — What's Still Missing

This is our north star. These are the gaps between what we have and a real autonomous agent.

### GAP 1: Verification Loop ✅ BUILT
After A13 pushes a fix, we never check if it worked.
```
Fix pushed (meta title rewrite on /services)
→ Schedule check in 21 days (Firestore scheduled doc)
→ Pull GSC: did CTR/position improve for that page?
→ Yes → A16: mark fix "confirmed" + store: "meta rewrites work for service pages"
→ No  → A16: mark fix "failed" → CMO tries different approach next time
```
**Without this, the agent acts but never learns. It's the most important thing to build.**

### GAP 2: CMO Reads A16 Memory ✅ BUILT
CMO loads client_memory + global_patterns before deciding. Fix:
```
CMO load order:
1. Load all 9 agent states (already done)
2. Load A16 client_memory → what fixes worked / failed
3. Load cross-client patterns → what worked for similar businesses
4. Decision = signals + memory + patterns (not just signals)
```

### GAP 3: Keyword → Lead Attribution ✅ BUILT (form tracking + GA4 API join)
```
GSC keyword → landing page → GA4 session → GA4 conversion (form_submit)
= "This keyword brought 3 leads this month"
```
Join query: `/api/attribution/:clientId` — GSC + GA4 API join. Currently not built.

### GAP 4: Whole-Site Pattern Audit (not per-page)
A2 crawls 500 pages but stores only 80 in the Firestore doc (1MB limit).
Need: each page as its own subcollection doc → then detect patterns:
`"47 service pages all missing H1"` not `"page /services missing H1"`.

### GAP 5: Content from Real SERP Analysis ✅ BUILT
A5 now scrapes top 5 SERP results before generating briefs:
- Average word count of top 3
- Common H2 headings competitors use
- PAA questions
- Schema types used
Then brief = data-driven, not LLM-guessed.

### GAP 6: Cross-Client Pattern Learning
You manage N clients. What works for one should inform others.
`client_memory` collection has the data. Need a cross-client read layer in CMO:
`"Meta rewrites worked for 4/5 similar businesses — high confidence for this client too."`

### GAP 7: Alert → Investigate → Fix Chain ✅ BUILT (A23 Investigator)
A23 runs after A9.checkAlerts → diagnoses root cause → proposes fix → approval queue + notification.
```
P1 alert detected (A9)
→ A23 investigates: competitor new page? CWV degraded? Technical change?
→ Diagnoses root cause (confidence-scored)
→ Creates approval_queue item with specific fix
→ In-app notification + SendGrid email: "Issue diagnosed. Fix ready. Approve?"
→ One-click approve in Approvals → Investigations tab
```

---

## Build Priority Order (Next Sprints)

| Priority | What | Why |
|---|---|---|
| **1** | Verification loop (21-day fix checker) | Closes the loop. Nothing learns without this. |
| **2** | Keyword → Lead attribution join | Agencies justify invoices with leads, not rankings |
| **3** | CMO reads A16 memory | Decisions improve over time |
| **4** | Per-page Firestore subcollection for A2 | Enables pattern detection across 500 pages |
| **5** | Content brief from real SERP data | Content that actually ranks |
| **6** | Cross-client pattern matching | Unique competitive moat |
| **7** | Alert → investigate → fix chain | True autonomous operation |

---

## Known Bugs & Fixes Applied

| Bug | Root Cause | Fix Applied |
|-----|-----------|-------------|
| A10 + A4 returning empty rankings | DDG returns `//duckduckgo.com/l/?uddg=` protocol-relative URLs — `new URL("//...")` throws, every result skipped | Fixed: prepend `https:` before parsing, `decodeURIComponent(uddg)` |
| Rate limiter blocking all users | IP-based key on Render = all users share one IP, 20 req/10min hit instantly | Fixed: UID-based keying from JWT, skip GETs entirely, raised to 60/10min |
| Rank Tracker always empty | A10 pipeline data never imported into manual tracker tab | Fixed: auto-import on first load if tracker empty |
| "No rank checking API" red error | UI showed error even though DDG free fallback was active | Fixed: changed to cyan info banner |
| A4 auto-discovery returns 0 | SERP blocked → `competitorDomains = []` | Fixed: LLM suggests competitors from brief as final fallback |

---

## SERP Scraper — Priority Chain

`server/crawler/serpScraper.js` — `getSERP(keyword, options)`

```
1. DuckDuckGo HTML (html.duckduckgo.com) — primary
2. Bing HTML — fallback if DDG < 5 results
3. Yahoo Search HTML — fallback if Bing < 5 results
```

**Critical**: DDG wraps URLs as `//duckduckgo.com/l/?uddg=encoded_url` (protocol-relative).
Always parse as `new URL("https:" + rawUrl)` — never `new URL(rawUrl)` directly.

---

## Rate Limiter Design

`server/middleware/rateLimiter.js`

- **Key**: Firebase UID extracted from JWT payload (not IP — Render reverse proxy breaks IP-based limits)
- **agentLimiter**: 60 per 10min per user, **skips GET requests** (reads are free, only POST AI runs count)
- **apiLimiter**: 300 per min per user
- **authLimiter**: 10 per 15min per IP (pre-auth, no UID available)

---

## Control Room Vision

Currently: shows data (dashboard).
Goal: **speaks in decisions, not data.**

```
Current: "Organic traffic down 12%"
Goal:    "Traffic down 12% because 3 pages dropped position 8→15.
          Fix: refresh content on these pages + build 1 link each.
          A13 can push the on-page fixes tonight. Approve?"
```

Control Room sections needed:
1. **This Week** — GSC delta (impressions, clicks, CTR, position changes)
2. **Leads** — Form fills, phone clicks, WhatsApp clicks, source attribution
3. **Keyword → Lead** — Which keywords brought leads this month
4. **Site Health** — Score, P1 issues, fixes pushed, competitor alerts
5. **Agent Decision** — CMO: here's what to focus on this week + why
6. **Before/After** — Day 1 vs today across all KPIs

---

## KPIs the Platform Tracks

| KPI | Source | Target | Agent if Below |
|-----|--------|--------|----------------|
| Keyword Rankings | GSC + DDG | Pos 1–10 | A11 backlinks if page 2, A2 re-audit if dropped |
| Organic Traffic | GSC + GA4 | +20% M3, +80% M6 | A5 title rewrite if CTR low |
| Click-Through Rate | GSC | 25% pos1, 10% pos3 | A6 meta/title rewrite |
| Backlinks / DA | DataForSEO | +5 links/month | A11 outreach |
| Technical Health | A2 + PageSpeed | 0 P1 issues, LCP<2.5s | A13 autopush |
| Content Performance | A5 + A14 | 30% pages indexed M3 | A14 content refresh |
| Conversion Rate | GA4 + GTM | 3–8% lead gen | A19 CRO analysis |

---

## Architecture & Tech Stack

- **Frontend**: React 18 + Vite — inline styles only, no CSS framework
- **Backend**: Express + Firebase Firestore + Firebase Auth
- **LLM**: Groq (primary) → Gemini 2.0 Flash (fallback) → OpenRouter (last resort)
- **SERP**: DDG → Bing → Yahoo (all free, no API key needed)
- **Deployment**: Render (frontend static site + backend web service)
- **Auth**: Firebase Auth — email/password + Google OAuth (GSC/GA4/GBP scopes)

---

## Shared State Pattern

All agent outputs in Firestore. **Always `saveState`/`getState` — never pass state directly.**

```js
const { saveState, getState } = require("../shared-state/stateManager");
await saveState(clientId, "A2_audit", result);
const audit = await getState(clientId, "A2_audit");
```

State keys: `A1_brief`, `A2_audit`, `A3_keywords`, `A4_competitor`, `A5_content`,
`A6_onpage`, `A7_technical`, `A8_geo`, `A9_report`, `A10_rankings`,
`A17_review`, `A19_conversion`, `CMO_decision`

---

## LLM Utility

**Always `callLLM()` — never call providers directly.**

```js
const { callLLM, parseJSON } = require("../utils/llm");
const response = await callLLM(prompt, keys, { maxTokens: 4000, temperature: 0.3 });
const data = parseJSON(response); // handles markdown code blocks around JSON
```

- Groq: `llama-3.1-8b-instant` — fast, free
- Gemini: `gemini-2.0-flash` — generous free tier
- Retry: 2 attempts per provider; 429 → wait 60s; timeout → retry 1.5s

---

## Frontend Conventions

### Color System — never hardcode
```js
const bg   = dark ? "#0a0a0a" : "#f5f5f0";  // page bg
const bg2  = dark ? "#111"    : "#ffffff";  // card bg
const bg3  = dark ? "#1a1a1a" : "#f0f0ea";  // input/secondary bg
const bdr  = dark ? "#222"    : "#e0e0d8";  // border
const txt  = dark ? "#e8e8e8" : "#1a1a18";  // primary text
const txt2 = dark ? "#666"    : "#888";     // muted text
const B    = "#443DCB";                     // brand blue
```
Status colors: `#059669` green · `#D97706` amber · `#DC2626` red · `#0891B2` cyan

### Inline styles only — no Tailwind, no CSS classes
```jsx
<div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, padding: "12px 16px" }}>
```

---

## Backend Conventions

```js
router.get("/:clientId/something", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid); // ownership check always
    return res.json({ data });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});
```

Always: `verifyToken` → ownership check → try/catch → `AbortSignal.timeout(N)` on all fetch.
Issue severity: `p1` = blocks rankings · `p2` = hurts rankings · `p3` = minor

---

## Firestore Collections

| Collection | Key | Purpose |
|------------|-----|---------|
| `users` | uid | Profile + apiKeys |
| `clients` | clientId | Client data, pipelineStatus, seoScore |
| `shared_state` | clientId | All agent outputs |
| `tasks` | auto | Task queue |
| `approval_queue` | auto | Human gate for fixes |
| `alerts` | auto | P1/P2/P3 issues |
| `score_history` | `clientId_date` | SEO score time series |
| `rank_history` | `clientId_date` | Keyword position snapshots |
| `cwv_history` | auto | Core Web Vitals |
| `content_drafts` | auto | A14 article drafts |
| `wp_push_log` | auto | A13 push audit trail |
| `client_memory` | clientId | A16 memory (fix history, what worked) |
| `cmo_queue` | auto | CMO-scheduled next agent runs |
| `notifications` | auto | In-app notifications |
| `portal_snapshots` | auto | Monthly white-label snapshots |
| `fix_verification` | auto | **NEEDED** — 21-day fix outcome tracker |

---

## Common Gotchas

1. **DDG URLs are protocol-relative** — `//duckduckgo.com/l/?uddg=...` — always `new URL("https:" + rawUrl)`.
2. **`parseJSON` always** — never `JSON.parse()` directly. LLM wraps JSON in markdown blocks.
3. **AbortSignal.timeout on every fetch** — 10s crawl, 20s PageSpeed, 30s SERP, 8s quick checks.
4. **Firestore 1MB doc limit** — A2 audit caps at 80 pages per doc. Full crawl needs subcollection.
5. **Rate limiter key = UID not IP** — Render reverse proxy makes all users share one IP.
6. **agentLimiter skips GETs** — only POST AI runs count against the limit.
7. **Color props in child components** — always receive `bg2`, `bg3`, `bdr`, `txt`, `txt2` as props, never recompute.
8. **A9 field names** — LLM returns `expectedOutcome` (not `how`) in `next3Actions`.
9. **CMO reads A16** — wired. CMO loads `client_memory` + `global_patterns` filtered by ownerId before deciding.
10. **Render cold-start** — free tier sleeps after 15min, first request ~30s. Paid plan = always-on.
11. **A5 SERP scrape is non-blocking** — `fetchSerpIntelligence()` failures are caught silently. Brief still generates with LLM even if SERP fails.
12. **GA4 conversion join** — `GET /api/attribution/:clientId/ga4-conversions` requires `gaPropertyId` in user keys + valid Google access token. Returns `{ source: "none" }` if not configured.
13. **A23 investigator** — runs automatically after checkAlerts finds P1 alerts. Also callable on-demand via `POST /api/agents/:clientId/A23/investigate`. Results appear in ApprovalQueue → Investigations tab.
14. **ControlRoom CMO banner** — CMO decision shown as a persistent banner at top of Control Room (above tabs). "Approve & Execute" button queues nextAgents via cmo-decisions endpoint.

---

## Key Files

| File | Purpose |
|------|---------|
| `src/App.jsx` | Main router, nav, dark mode, presales route |
| `src/pages/AgentPipeline.jsx` | Full pipeline UI, all tabs including CMO/Conversion/Impact |
| `src/pages/ControlRoom.jsx` | Client intelligence dashboard (4 tabs) |
| `src/pages/AgencyDashboard.jsx` | Cross-client overview, sparklines, score distribution |
| `src/pages/PreSalesAudit.jsx` | Public demo audit page (`/audit`, no login) |
| `src/components/RankTrackerPanel.jsx` | Manual rank tracker, auto-imports A10 data on first load |
| `server/index.js` | Entry point, all cron schedulers (daily/weekly/monthly/watchdog) |
| `server/agents/A0_orchestrator.js` | Pipeline runner, 25-min timeout, dependency chain |
| `server/agents/CMO_agent.js` | Strategy: signal extraction → LLM/rule decision → cmo_queue. Reads A16 memory + global_patterns |
| `server/agents/A22_predictive.js` | 90-day traffic forecast (linear regression) + keyword opportunity scoring |
| `server/agents/A23_investigator.js` | P1 alert → root cause diagnosis → approval queue + email notification |
| `server/routes/agents.js` | All agent run + data GET endpoints |
| `server/routes/controlRoom.js` | Control Room data aggregation. Now includes CMO decision in response |
| `server/routes/attribution.js` | Form tracking events + GA4 conversion join (real API) + tracking snippet |
| `server/utils/auditPatterns.js` | Reads per-page subcollection → detects site-wide patterns (missing H1 on 47 pages etc) |
| `src/components/AuditPatternsPanel.jsx` | Site-wide pattern analysis UI — severity bars, affected URLs, fix suggestions |
| `src/components/AttributionDashboard.jsx` | Form tracking + GA4 conversion join + tracking snippet installer |
| `src/components/PredictiveForecastPanel.jsx` | 90-day traffic forecast + keyword opportunities + score projection |
| `server/routes/agency.js` | Agency dashboard aggregation |
| `server/crawler/serpScraper.js` | Free SERP: DDG → Bing → Yahoo |
| `server/utils/llm.js` | LLM fallback chain + 429 retry |
| `server/utils/scoreCalculator.js` | 4-dimension SEO score + forecast |
| `server/middleware/rateLimiter.js` | UID-based rate limiting, skips GETs |
