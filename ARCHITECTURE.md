# SEO AI Agent — Full System Architecture
**Version:** 2.0 (Agent-Based Execution System)
**Date:** March 2026
**Status:** Blueprint for Implementation

---

## CURRENT STATE vs TARGET STATE

| Dimension | Current (v1) | Target (v2) |
|---|---|---|
| Mode | Manual report | Autonomous agent execution |
| Keyword data | LLM-generated only | GSC + SerpAPI + volume/difficulty |
| Issue handling | Suggest + copy | Detect → Assign → Execute → Track |
| SEO Score | Single number | 4-dimension breakdown with reasoning |
| Task priority | Static badges | Formula-based with impact prediction |
| Feedback | None | Before/after ranking comparison |
| Automation | Off | Manual / Semi-Auto / Full-Auto modes |
| Client view | Pipeline tabs | Unified client dashboard |
| Alerts | Technical strings | Business language with action steps |

---

## SYSTEM ARCHITECTURE DIAGRAM

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SEO AI AGENT — v2 ARCHITECTURE                      │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────┐
                              │   FRONTEND  │
                              │  React SPA  │
                              └──────┬──────┘
                                     │ REST API (JWT Auth)
                        ┌────────────▼────────────┐
                        │      API GATEWAY         │
                        │   Express.js + Firebase  │
                        └────────────┬────────────┘
                                     │
          ┌──────────────────────────┼──────────────────────────┐
          │                          │                           │
   ┌──────▼──────┐          ┌────────▼───────┐         ┌────────▼────────┐
   │  DATA LAYER │          │  AGENT ENGINE  │         │ EXECUTION LAYER │
   │             │          │                │         │                 │
   │ • Firestore │          │ A0 Orchestrat. │         │ TaskQueue       │
   │ • GSC API   │◄────────►│ A1 Onboarding  │────────►│ AutoFix Engine  │
   │ • SerpAPI   │          │ A2 TechAudit   │         │ ApprovalGate    │
   │ • PageSpeed │          │ A3 Keywords    │         │ CMS Hooks       │
   │             │          │ A4 Competitor  │         │                 │
   └──────┬──────┘          │ A5 Content     │         └────────┬────────┘
          │                 │ A6 OnPage      │                  │
          │                 │ A7 CWV/Tech    │         ┌────────▼────────┐
          │                 │ A8 GEO/Local   │         │  FEEDBACK LOOP  │
          │                 │ A9 Strategy    │         │                 │
          │                 │ A10 Rankings★  │         │ Rank Snapshots  │
          │                 │ A11 Feedback★  │◄────────│ Before/After    │
          │                 │ A12 AutoExec★  │         │ Score History   │
          │                 └────────────────┘         │ Growth Forecast │
          │                                            └─────────────────┘
          │
   ┌──────▼──────────────────────────────────────────────────────┐
   │                    FIRESTORE COLLECTIONS                     │
   │                                                              │
   │  clients │ shared_state │ task_queue★ │ ranking_snapshots★  │
   │  approvals │ alerts │ score_history★ │ execution_log★       │
   │  automation_config★ │ users │ feedback_loop★                │
   └──────────────────────────────────────────────────────────────┘

★ = NEW collections/agents to be added
```

---

## 1. DATABASE SCHEMA

### Existing Collections (keep as-is)
- `clients` — client records + agent statuses
- `shared_state` — all agent outputs (A1_brief, A2_audit, etc.)
- `approvals` — pending/reviewed approval items
- `alerts` — system alerts per client

---

### NEW Collection: `task_queue`

```js
// /task_queue/{clientId}/tasks/{taskId}
{
  taskId:        "t_abc123",
  clientId:      "cl_xyz",
  createdAt:     Timestamp,
  updatedAt:     Timestamp,

  // Issue details
  title:         "Fix missing title tag on /services page",
  category:      "on_page",          // technical | on_page | content | linking | local
  issueType:     "missing_title_tag", // specific issue code
  sourceAgent:   "A2",               // which agent detected it

  // Assignment
  assignedAgent: "OnPageAgent",      // TechnicalAgent | ContentAgent | OnPageAgent | LinkingAgent
  assignedTo:    null,               // human user uid (optional)

  // Priority scoring
  priorityScore: 87,
  rankingImpact: 90,    // 0-100
  trafficPotential: 80, // 0-100
  effort:        "easy", // easy | medium | hard

  // Impact prediction
  impact:        "High",
  impactColor:   "#DC2626",
  expectedScoreGain: 8,   // +8 SEO score points if fixed
  expectedRankGain:  "2-5 positions",

  // Execution
  status:        "pending", // pending | in_progress | completed | auto_fixed | rejected
  mode:          "manual",  // manual | auto
  fixSuggestion: "Add <title>Your Business | City | Service</title> to the page head",
  fixCode:       "<title>{{businessName}} | {{city}} | {{service}}</title>",
  autoFixable:   true,
  autoFixScript: "update_title_tag",

  // Tracking
  completedAt:   null,
  completedBy:   null,  // "auto" | uid
  verifiedAt:    null,
  rankBefore:    null,
  rankAfter:     null,
}
```

---

### NEW Collection: `ranking_snapshots`

```js
// /ranking_snapshots/{clientId}/snapshots/{snapshotId}
{
  snapshotId:  "snap_20260301",
  clientId:    "cl_xyz",
  takenAt:     Timestamp,
  source:      "gsc",  // gsc | serpapi | manual

  keywords: [
    {
      keyword:    "digital marketing agency delhi",
      position:   14,
      url:        "https://example.com/services",
      clicks:     45,
      impressions: 820,
      ctr:        0.055,
      volume:     2400,       // monthly search volume
      difficulty: 62,         // 0-100
      intent:     "commercial",
      location:   "Delhi, India",
      device:     "mobile",
    }
  ],

  summary: {
    totalKeywords:    142,
    top3:             8,
    top10:            24,
    top30:            67,
    avgPosition:      18.4,
    totalClicks:      1240,
    totalImpressions: 28000,
    avgCTR:           0.044,
  }
}
```

---

### NEW Collection: `score_history`

```js
// /score_history/{clientId}/scores/{scoreId}
{
  scoreId:    "score_20260301",
  clientId:   "cl_xyz",
  recordedAt: Timestamp,

  overall:    72,

  breakdown: {
    technical: { score: 68, weight: 0.30, points: 20.4,
      factors: [
        { name:"SSL", score:100, weight:0.15 },
        { name:"Page Speed", score:55, weight:0.20 },
        { name:"Core Web Vitals", score:48, weight:0.25 },
        { name:"Crawlability", score:90, weight:0.20 },
        { name:"Mobile Friendly", score:72, weight:0.10 },
        { name:"Structured Data", score:40, weight:0.10 },
      ]
    },
    content: { score: 76, weight: 0.40, points: 30.4,
      factors: [
        { name:"Title Tags", score:65, weight:0.20 },
        { name:"Meta Descriptions", score:70, weight:0.15 },
        { name:"H1 Coverage", score:80, weight:0.15 },
        { name:"Content Depth", score:72, weight:0.25 },
        { name:"Keyword Coverage", score:88, weight:0.15 },
        { name:"Internal Linking", score:55, weight:0.10 },
      ]
    },
    authority: { score: 58, weight: 0.20, points: 11.6,
      factors: [
        { name:"E-E-A-T Signals", score:62, weight:0.30 },
        { name:"Backlink Profile", score:45, weight:0.40 },
        { name:"Brand Mentions", score:70, weight:0.20 },
        { name:"Social Signals", score:55, weight:0.10 },
      ]
    },
    geo: { score: 74, weight: 0.10, points: 7.4,
      factors: [
        { name:"Local Citations", score:80, weight:0.30 },
        { name:"GMB Optimisation", score:65, weight:0.35 },
        { name:"AI Visibility", score:72, weight:0.20 },
        { name:"Location Pages", score:80, weight:0.15 },
      ]
    },
  },

  delta: {               // vs previous snapshot
    overall:    +4,
    technical:  +2,
    content:    +6,
    authority:  +0,
    geo:        +1,
  }
}
```

---

### NEW Collection: `automation_config`

```js
// /automation_config/{clientId}
{
  clientId:   "cl_xyz",
  updatedAt:  Timestamp,
  updatedBy:  "uid_admin",

  mode: "semi_auto",  // manual | semi_auto | full_auto

  rules: {
    // What can auto-execute without approval
    autoFix: {
      title_tags:       true,
      meta_descriptions:true,
      alt_text:         true,
      schema_markup:    false,  // needs approval
      content_rewrites: false,  // always manual
      redirects:        false,  // always manual (risky)
    },
    // Notification settings
    notifyOnAutoFix:  true,
    notifyOnComplete: true,
    weeklyDigest:     true,
  },

  schedule: {
    weeklyAudit:     true,
    auditDay:        "monday",
    auditTime:       "09:00",
    rankingSnapshot: "daily",
  }
}
```

---

### NEW Collection: `execution_log`

```js
// /execution_log/{clientId}/logs/{logId}
{
  logId:       "log_abc",
  clientId:    "cl_xyz",
  executedAt:  Timestamp,
  taskId:      "t_abc123",
  agentId:     "OnPageAgent",
  action:      "auto_fix_title_tag",
  mode:        "auto",             // auto | manual | approved
  status:      "success",          // success | failed | pending_approval
  inputData:   { page: "/services", oldTitle: "Services" },
  outputData:  { newTitle: "Digital Marketing Services | Damco Digital | Delhi" },
  approvedBy:  null,
  notes:       "Auto-fixed via OnPageAgent",
}
```

---

### NEW Collection: `feedback_loop`

```js
// /feedback_loop/{clientId}
{
  clientId:   "cl_xyz",
  updatedAt:  Timestamp,

  fixes: [
    {
      fixId:       "fix_001",
      taskId:      "t_abc123",
      fixedAt:     "2026-03-01",
      description: "Fixed title tags on 12 pages",
      agentId:     "OnPageAgent",

      ranking: {
        keywordsBefore: 24,   // in top 10
        keywordsAfter:  31,   // in top 10
        avgPositionBefore: 18.4,
        avgPositionAfter:  15.1,
        improvement:       "+7 keywords in top 10",
      },
      traffic: {
        clicksBefore:  840,
        clicksAfter:   1240,
        growth:        "+47.6%",
      },
      scoreBefore: 68,
      scoreAfter:  76,
      scoreDelta:  "+8",
      verdict:     "Confirmed positive impact",
    }
  ]
}
```

---

## 2. AGENT ARCHITECTURE

### Existing Agents (A1–A9) — Keep + Upgrade

| Agent | Current | Upgrade Needed |
|---|---|---|
| A0 | Orchestrator | Add task assignment after each agent |
| A1 | Onboarding | No change |
| A2 | Technical Audit | Emit typed tasks to task_queue |
| A3 | Keywords | Add volume/difficulty from SerpAPI |
| A4 | Competitor | Add quick win task generation |
| A5 | Content | Emit content tasks |
| A6 | On-Page | Emit on-page tasks with autoFixable flag |
| A7 | CWV/Tech | Emit technical tasks |
| A8 | GEO/Local | Emit local tasks |
| A9 | Strategy | Generate score breakdown + growth forecast |

---

### NEW Agents

```
A10 — RankingTrackerAgent
  Purpose:  Fetch current keyword positions from GSC + SerpAPI
  Trigger:  After A3 completes + daily cron
  Output:   ranking_snapshots collection
  APIs:     Google Search Console API, SerpAPI (optional)

A11 — FeedbackLoopAgent
  Purpose:  Compare current rankings vs baseline after fixes
  Trigger:  Weekly cron OR after task marked complete
  Output:   feedback_loop collection, score delta
  Logic:    snapshot(now) - snapshot(before_fix) = improvement

A12 — AutoExecAgent
  Purpose:  Execute approved/auto-approved fixes
  Trigger:  Task created with autoFixable=true + mode=auto
  Output:   execution_log, updated task status
  Actions:  Apply title/meta/alt text fixes via CMS API or output patch
```

---

### Task Assignment Logic (Issue → Agent Mapping)

```js
const ISSUE_AGENT_MAP = {
  // On-Page Agent
  "missing_title":         "OnPageAgent",
  "title_too_long":        "OnPageAgent",
  "missing_meta":          "OnPageAgent",
  "duplicate_title":       "OnPageAgent",
  "missing_h1":            "OnPageAgent",
  "missing_alt_text":      "OnPageAgent",
  "og_tags_missing":       "OnPageAgent",

  // Technical Agent
  "slow_page_speed":       "TechnicalAgent",
  "redirect_chain":        "TechnicalAgent",
  "missing_sitemap":       "TechnicalAgent",
  "robots_error":          "TechnicalAgent",
  "cwv_lcp_fail":          "TechnicalAgent",
  "cwv_cls_fail":          "TechnicalAgent",
  "no_ssl":                "TechnicalAgent",
  "response_time_slow":    "TechnicalAgent",

  // Content Agent
  "thin_content":          "ContentAgent",
  "keyword_cannibalization":"ContentAgent",
  "content_gap":           "ContentAgent",
  "no_faq":                "ContentAgent",
  "missing_schema":        "ContentAgent",

  // Linking Agent
  "orphan_page":           "LinkingAgent",
  "broken_internal_link":  "LinkingAgent",
  "low_internal_links":    "LinkingAgent",
  "anchor_text_generic":   "LinkingAgent",

  // Local Agent
  "citation_missing":      "LocalAgent",
  "gmb_not_optimized":     "LocalAgent",
  "no_location_page":      "LocalAgent",
};
```

---

## 3. API STRUCTURE

### Existing Endpoints (keep)
```
POST   /api/clients                          — create client
GET    /api/clients                          — list clients
GET    /api/clients/:id                      — get client + state
POST   /api/agents/:id/run-pipeline          — run full pipeline
GET    /api/agents/:id/approvals             — list approvals
POST   /api/agents/:id/approvals/:aid        — approve/reject
GET    /api/agents/:id/alerts                — list alerts
POST   /api/chat/:id/chat                    — AI chatbot
GET    /api/admin/users                      — admin user list
```

### NEW Endpoints (add)

```
─── TASK QUEUE ─────────────────────────────────────────────
GET    /api/agents/:clientId/tasks           — get task queue
GET    /api/agents/:clientId/tasks/today     — top 5 priority tasks
PUT    /api/agents/:clientId/tasks/:taskId   — update task status
POST   /api/agents/:clientId/tasks/:taskId/execute — auto-execute fix
POST   /api/agents/:clientId/tasks/:taskId/assign  — assign to human

─── RANKING TRACKER ────────────────────────────────────────
GET    /api/agents/:clientId/rankings        — latest ranking snapshot
GET    /api/agents/:clientId/rankings/history — all snapshots
POST   /api/agents/:clientId/rankings/fetch  — trigger new snapshot from GSC/SerpAPI

─── SCORE BREAKDOWN ────────────────────────────────────────
GET    /api/agents/:clientId/score           — current score breakdown
GET    /api/agents/:clientId/score/history   — score over time (chart data)

─── FEEDBACK LOOP ──────────────────────────────────────────
GET    /api/agents/:clientId/feedback        — compare before/after
POST   /api/agents/:clientId/feedback/record — record a fix baseline

─── AUTOMATION ─────────────────────────────────────────────
GET    /api/agents/:clientId/automation      — get automation config
PUT    /api/agents/:clientId/automation      — update mode / rules
GET    /api/agents/:clientId/execution-log   — see what was auto-fixed

─── GROWTH FORECAST ────────────────────────────────────────
GET    /api/agents/:clientId/forecast        — traffic growth prediction

─── BUSINESS IMPACT ────────────────────────────────────────
GET    /api/agents/:clientId/business-impact — keyword → traffic → revenue map

─── CLIENT DASHBOARD ───────────────────────────────────────
GET    /api/agents/:clientId/dashboard       — all-in-one summary endpoint
  Returns: { score, rankings, tasks, recentFixes, alerts, forecast }
```

---

## 4. SEO SCORE BREAKDOWN ALGORITHM

```js
function calculateSEOScore(auditData, keywordData, geoData, onPageData) {

  // ── TECHNICAL SCORE (30% of total) ────────────────
  const technicalFactors = {
    ssl:            auditData.checks.https ? 100 : 0,
    pageSpeed:      Math.min(auditData.checks.responseTime < 1000 ? 100 :
                    auditData.checks.responseTime < 3000 ? 60 : 20, 100),
    cwvLCP:         scoreFromMs(auditData.checks.cwv?.lcp, [2500, 4000]),
    cwvCLS:         scoreFromVal(auditData.checks.cwv?.cls, [0.1, 0.25]),
    crawlability:   auditData.checks.robotsTxt?.exists ? 90 : 50,
    mobileFriendly: auditData.checks.mobile?.score || 70,
    structuredData: auditData.checks.schema?.exists ? 80 : 30,
    redirectChain:  auditData.checks.redirectChain?.depth === 0 ? 100 :
                    auditData.checks.redirectChain?.depth < 3 ? 60 : 20,
  };
  const technicalWeights = { ssl:0.15, pageSpeed:0.20, cwvLCP:0.20, cwvCLS:0.10,
    crawlability:0.15, mobileFriendly:0.10, structuredData:0.05, redirectChain:0.05 };
  const technicalScore = weightedAvg(technicalFactors, technicalWeights);

  // ── CONTENT SCORE (40% of total) ──────────────────
  const p1Count = auditData.issues?.p1?.length || 0;
  const p2Count = auditData.issues?.p2?.length || 0;
  const contentFactors = {
    titleTags:      100 - Math.min(p1Count * 15 + p2Count * 8, 80),
    metaDesc:       auditData.checks.metaDescription?.exists ? 80 : 30,
    h1Coverage:     auditData.checks.h1?.present ? 85 : 20,
    contentDepth:   scoreFromWordCount(auditData.checks.wordCount),
    keywordCoverage:keywordData?.totalKeywords > 20 ? 85 :
                    keywordData?.totalKeywords > 10 ? 65 : 40,
    internalLinking:auditData.checks.internalLinks?.count > 5 ? 80 : 40,
    eeAtScore:      ((auditData.checks.eeat?.score || 0) / 8) * 100,
  };
  const contentWeights = { titleTags:0.20, metaDesc:0.15, h1Coverage:0.15,
    contentDepth:0.20, keywordCoverage:0.15, internalLinking:0.10, eeAtScore:0.05 };
  const contentScore = weightedAvg(contentFactors, contentWeights);

  // ── AUTHORITY SCORE (20% of total) ────────────────
  const authorityFactors = {
    eeAtSignals:   ((auditData.checks.eeat?.score || 0) / 8) * 100,
    backlinkEst:   estimateBacklinkScore(auditData),
    brandMentions: auditData.checks.socialLinks?.count > 2 ? 70 : 40,
    socialSignals: auditData.checks.socialLinks?.hasSocial ? 60 : 30,
  };
  const authorityWeights = { eeAtSignals:0.35, backlinkEst:0.40,
    brandMentions:0.15, socialSignals:0.10 };
  const authorityScore = weightedAvg(authorityFactors, authorityWeights);

  // ── GEO SCORE (10% of total) ──────────────────────
  const geoFactors = {
    localCitations: Math.min((geoData?.offPage?.citationTargets?.length || 0) * 10, 90),
    gmbOptimized:   geoData?.gmb?.isOptimized ? 80 : 30,
    aiVisibility:   geoData?.aiVisibility?.score || 50,
    locationPages:  geoData?.hasLocationPages ? 80 : 40,
  };
  const geoWeights = { localCitations:0.30, gmbOptimized:0.35,
    aiVisibility:0.20, locationPages:0.15 };
  const geoScore = weightedAvg(geoFactors, geoWeights);

  // ── TOTAL ──────────────────────────────────────────
  const overall = Math.round(
    (technicalScore * 0.30) +
    (contentScore   * 0.40) +
    (authorityScore * 0.20) +
    (geoScore       * 0.10)
  );

  return {
    overall,
    breakdown: {
      technical: { score: Math.round(technicalScore), weight: 0.30, factors: technicalFactors },
      content:   { score: Math.round(contentScore),   weight: 0.40, factors: contentFactors },
      authority: { score: Math.round(authorityScore), weight: 0.20, factors: authorityFactors },
      geo:       { score: Math.round(geoScore),        weight: 0.10, factors: geoFactors },
    }
  };
}

function weightedAvg(factors, weights) {
  return Object.keys(weights).reduce((sum, key) =>
    sum + (factors[key] || 0) * weights[key], 0);
}

// Impact prediction per issue type
const ISSUE_SCORE_IMPACT = {
  "missing_title":          { scoreGain: 8,  rankGain: "3-6 positions" },
  "slow_page_speed":        { scoreGain: 12, rankGain: "2-5 positions" },
  "cwv_lcp_fail":           { scoreGain: 10, rankGain: "2-4 positions" },
  "missing_meta":           { scoreGain: 5,  rankGain: "1-3 positions" },
  "redirect_chain":         { scoreGain: 6,  rankGain: "1-3 positions" },
  "thin_content":           { scoreGain: 15, rankGain: "5-10 positions" },
  "missing_schema":         { scoreGain: 4,  rankGain: "0-2 positions" },
  "low_internal_links":     { scoreGain: 5,  rankGain: "2-4 positions" },
  "missing_alt_text":       { scoreGain: 3,  rankGain: "0-2 positions" },
  "no_ssl":                 { scoreGain: 20, rankGain: "major impact"  },
};
```

---

## 5. TASK PRIORITY FORMULA

```js
// Priority Score = (Ranking Impact × 0.4) + (Traffic Potential × 0.3) − (Effort × 0.3)

const EFFORT_COST = { easy: 10, medium: 30, hard: 60 };

function calcPriority(rankingImpact, trafficPotential, effort) {
  const effortCost = EFFORT_COST[effort] || 30;
  return Math.round(
    (rankingImpact * 0.4) +
    (trafficPotential * 0.3) -
    (effortCost * 0.3)
  );
}

// Auto-classify effort per issue type
const ISSUE_EFFORT = {
  missing_title:          "easy",   // 5 minutes
  missing_meta:           "easy",   // 5 minutes
  missing_alt_text:       "easy",   // 15 minutes
  add_schema_markup:      "medium", // 30 minutes
  page_speed_fix:         "hard",   // 2-4 hours
  content_rewrite:        "hard",   // 3-5 hours
  redirect_fix:           "medium", // 30 minutes
  internal_linking:       "medium", // 1 hour
};
```

---

## 6. AUTOMATION WORKFLOW

```
MANUAL MODE:
  Issue Detected → Task Created (pending)
       ↓
  User sees in Action Plan
       ↓
  User clicks "Fix Now" → copies fix → implements manually
       ↓
  User marks "Done" → FeedbackAgent runs in 7 days

SEMI-AUTO MODE:
  Issue Detected → Task Created
       ↓
  AutoFix Agent checks: is autoFixable = true?
       ↓ YES                        ↓ NO
  Generate fix code           Add to Action Plan
       ↓                      User fixes manually
  Send to Approval Queue
       ↓
  User reviews Before/After
       ↓
  Approve → Execute → Log
       ↓
  FeedbackAgent tracks ranking changes

FULL-AUTO MODE:
  Issue Detected → Task Created
       ↓
  AutoFix Agent checks: is autoFixable = true?
       ↓ YES                        ↓ NO
  Execute immediately         Send to Approval Queue
       ↓                      (these always need human eyes)
  Log in execution_log
       ↓
  Send notification to admin
       ↓
  FeedbackAgent tracks results
  (7 days later: before/after comparison shown)
```

---

## 7. EXAMPLE DATA FLOW — "Client Added → Results Tracked"

```
Step 1: Client Added
  POST /api/clients
  → A1 runs: structures brief, auto signs off
  → Client record created in Firestore

Step 2: Pipeline Triggered
  POST /api/agents/:id/run-pipeline
  → A0 orchestrator starts parallel execution

Step 3: Stage 1 — Technical + CWV (parallel)
  A2: Audits website
    → Finds: slow page speed (2.8s), missing title on /services
    → Emits tasks to task_queue:
        { taskId:"t1", type:"slow_page_speed", agent:"TechnicalAgent", priority:88 }
        { taskId:"t2", type:"missing_title", agent:"OnPageAgent", priority:76 }
  A7: PageSpeed API
    → LCP: 3.2s (fail), CLS: 0.08 (pass), FCP: 1.8s (pass)
    → Emits: { taskId:"t3", type:"cwv_lcp_fail", agent:"TechnicalAgent", priority:82 }

Step 4: Stage 2 — Keywords
  A3: Generates keyword clusters
    → Calls SerpAPI for volume/difficulty
    → Maps 47 keywords, finds 8 content gaps
    → Emits: { taskId:"t4", type:"content_gap", agent:"ContentAgent" }

  A10 (NEW): Ranking Snapshot
    → Fetches current positions from GSC
    → Stores baseline: avg position 21.4, 12 keywords in top 10
    → Saves to ranking_snapshots

Step 5: Stages 3-4 — Content, OnPage, Competitor, GEO
  All agents run, emit tasks to task_queue

Step 6: Stage 5 — Strategy Report
  A9: Generates score breakdown
    → Technical: 62, Content: 71, Authority: 48, GEO: 68
    → Overall: 65/100
    → Growth forecast: "+32% traffic if top 5 issues fixed"
    → Saves to score_history

Step 7: Action Plan Shown
  GET /api/agents/:id/tasks/today
  → Returns top 5 by priority score:
    1. Fix LCP (88) — TechnicalAgent
    2. Slow page speed (85) — TechnicalAgent
    3. Missing title /services (76) — OnPageAgent
    4. Content gap: "best digital marketing delhi" (74) — ContentAgent
    5. Low internal links (68) — LinkingAgent

Step 8: User Fixes Issue #3 (or Auto Mode executes)
  POST /api/agents/:id/tasks/t2/execute
  → OnPageAgent generates title: "Digital Marketing Services | Delhi | Damco"
  → Logged to execution_log
  → Approval sent (semi-auto) or applied (full-auto)

Step 9: Feedback Loop (7 days later)
  A11 runs:
  → New ranking snapshot taken
  → /services page: position 18 → position 12
  → Score: 65 → 69
  → Feedback logged: "Fixed title tag → +6 positions on /services"
  → Dashboard shows: "✅ This fix worked"
```

---

## 8. ALERT SYSTEM — BUSINESS LANGUAGE CONVERSION

```js
const ALERT_TRANSLATIONS = {
  // Technical → Business Language
  "LLM key missing":
    "⚠️ AI content generation is paused — your SEO automation is incomplete",

  "SerpAPI key missing":
    "⚠️ Keyword ranking data unavailable — we cannot track your Google positions",

  "PageSpeed API key missing":
    "⚠️ Page speed analysis is limited — Core Web Vitals may be inaccurate",

  "GSC not connected":
    "⚠️ Google Search Console not connected — we cannot see your real traffic data",

  "Audit failed":
    "⚠️ SEO health check failed — your website may be down or blocking our scanner",

  "A3 failed":
    "⚠️ Keyword research incomplete — action plan may be missing opportunities",

  "Pipeline failed":
    "⚠️ Full SEO analysis stopped — some sections may show incomplete data",

  "No ranking data":
    "📊 No ranking baseline yet — connect Google Search Console to track improvement",
};

// Alert severity levels (business-friendly)
const ALERT_SEVERITY = {
  critical: "🔴 Blocking SEO growth",
  warning:  "🟡 Reducing effectiveness",
  info:     "🔵 Optional improvement",
};
```

---

## 9. GROWTH FORECAST ENGINE

```js
function generateForecast(tasks, currentRankings) {
  const top5Tasks = tasks.slice(0, 5);

  const totalScoreGain = top5Tasks.reduce((sum, t) =>
    sum + (ISSUE_SCORE_IMPACT[t.issueType]?.scoreGain || 3), 0);

  const avgPositionImprovement = top5Tasks.reduce((sum, t) =>
    sum + estimatePositionGain(t.issueType), 0) / top5Tasks.length;

  // Traffic model: each position improvement = ~15-30% more clicks
  const currentClicks = currentRankings?.summary?.totalClicks || 0;
  const trafficMultiplier = 1 + (avgPositionImprovement * 0.08);
  const projectedClicks = Math.round(currentClicks * trafficMultiplier);

  return {
    currentScore:     currentRankings?.overall || 0,
    projectedScore:   Math.min((currentRankings?.overall || 0) + totalScoreGain, 100),
    scoreGain:        `+${totalScoreGain} points`,
    currentClicks,
    projectedClicks,
    trafficGrowth:    `+${Math.round((trafficMultiplier - 1) * 100)}%`,
    timeframe:        "4–8 weeks",
    confidence:       "Medium",
    tasksConsidered:  top5Tasks.length,
  };
}
```

---

## 10. REACT UI COMPONENT STRUCTURE (v2)

```
src/
├── pages/
│   ├── AgentPipeline.jsx          (existing — upgrade)
│   │   ├── ActionPlanView         (existing — keep)
│   │   ├── ScoreBreakdownView     ★ NEW — 4-dimension radar chart
│   │   ├── RankingTrackerView     ★ NEW — keyword positions table + chart
│   │   ├── FeedbackLoopView       ★ NEW — before/after ranking comparison
│   │   ├── GrowthForecastView     ★ NEW — "+32% traffic if fixed" card
│   │   ├── AutomationView         ★ NEW — mode toggle + rules config
│   │   ├── ExecutionLogView       ★ NEW — what was auto-fixed
│   │   ├── FullAuditView          (existing — keep accordion)
│   │   ├── FullKeywordsView       (existing — upgrade with volume/difficulty)
│   │   └── FullCompetitorView     (existing)
│   ├── ClientDashboard.jsx        ★ NEW — unified per-client overview
│   ├── ApprovalQueue.jsx          (existing — keep)
│   ├── AlertCenter.jsx            (upgrade — add business language)
│   └── UserPanel.jsx              (existing — keep)
│
├── components/
│   ├── ScoreRing.jsx              ★ NEW — animated SVG score ring
│   ├── ScoreBreakdownBar.jsx      ★ NEW — 4 colored progress bars
│   ├── RankingTable.jsx           ★ NEW — sortable keyword position table
│   ├── FeedbackCard.jsx           ★ NEW — before/after comparison card
│   ├── ForecastCard.jsx           ★ NEW — traffic growth prediction
│   ├── AutoModeToggle.jsx         ★ NEW — Manual/Semi/Auto toggle
│   ├── TaskCard.jsx               (existing in ActionPlanView — extract)
│   └── AIChatBot.jsx              (existing — keep)
```

---

## 11. IMPLEMENTATION PRIORITY ORDER

### Phase 1 — Foundation (Week 1–2)
1. `score_history` collection + score breakdown algorithm
2. Score Breakdown UI (4-dimension bars)
3. Task Queue collection + API
4. Business-language alert conversion

### Phase 2 — Ranking Intelligence (Week 3–4)
5. A10 RankingTrackerAgent (GSC integration)
6. `ranking_snapshots` collection
7. RankingTrackerView UI (keyword positions table)
8. Daily ranking snapshot cron

### Phase 3 — Execution Layer (Week 5–6)
9. AutoFix Agent (A12) for safe fixes (title/meta/alt)
10. `execution_log` collection
11. Automation mode toggle UI
12. Semi-auto approval flow upgrade

### Phase 4 — Feedback Loop (Week 7–8)
13. A11 FeedbackLoopAgent
14. `feedback_loop` collection
15. Before/After comparison UI
16. Growth Forecast Engine

### Phase 5 — Client Dashboard (Week 9–10)
17. ClientDashboard.jsx (unified overview)
18. Business Impact Layer (keyword → revenue estimate)
19. Weekly digest notifications
20. Full-auto mode launch

---

*This architecture document covers all 12 required improvements from the product gap analysis.*
*Everything above is buildable on the existing Firebase + Node.js + React stack with no infrastructure changes.*
