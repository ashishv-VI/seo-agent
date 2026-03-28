# SEO AI Agent — Use Case Document
**Project:** SEO Agent Platform
**Version:** 16.0
**Prepared by:** Damco Digital
**Date:** March 2026

---

## 1. Executive Summary

SEO AI Agent is a full-stack AI-powered SEO execution platform built for digital marketing agencies. It replaces a traditional team of SEO specialists by running 9 intelligent AI agents in sequence — performing technical audits, keyword research, competitor analysis, content planning, on-page fixes, local SEO, and strategy reporting — all from a single dashboard. The platform is designed to reduce manual SEO work by 80% while improving client result delivery speed.

---

## 2. Problem Statement

| Current Pain Point | Impact |
|---|---|
| Manual SEO audits take 8–12 hours per client | High cost, slow delivery |
| Keyword research and competitor analysis done separately | Missed opportunities, inconsistency |
| SEO fixes tracked in spreadsheets | No prioritisation, tasks get lost |
| Client reports written manually each month | 2–3 hours per report |
| No visibility into which fixes have the highest ROI | Team works on low-impact tasks |
| Password resets and user issues handled ad-hoc | Time-consuming admin overhead |

---

## 3. Actors (Who Uses the System)

| Actor | Role |
|---|---|
| **Agency Admin** | Manages all users, blocks/unblocks access, resets passwords, oversees all client accounts |
| **SEO Manager** | Creates client profiles, runs AI pipeline, reviews action plans, approves AI-generated content |
| **SEO Executive** | Executes Fix Now tasks from the action plan, monitors pipeline status |
| **Client** | Receives approved PDF reports and summary emails (indirect actor) |

---

## 4. System Overview

```
┌─────────────────────────────────────────────────────────┐
│                   SEO AI Agent Platform                  │
├──────────────┬──────────────────┬───────────────────────┤
│  Agency Side │   AI Pipeline    │    SEO Tools (34)     │
│  Client Mgr  │  A1 → A9 Agents │  Content / Technical  │
│  User Mgmt   │  Action Plan     │  Research / GEO       │
│  Approvals   │  Audit Accordion │  Local / Backlinks    │
│  AI Chatbot  │  PDF Reports     │  Analytics            │
└──────────────┴──────────────────┴───────────────────────┘
```

---

## 5. Use Cases — Detailed

---

### UC-01: Add a New Client

**Actor:** SEO Manager
**Trigger:** Agency wins a new client or onboards a new website
**Precondition:** User is logged in

**Main Flow:**
1. User navigates to **Client Manager**
2. Clicks **Add New Client**
3. Fills onboarding form: business name, website URL, industry, location, target audience, goals, services
4. System runs **Agent A1 (Onboarding)** — structures the client brief automatically
5. Client is created with all 9 agents set to `pending`
6. User is taken to the client's pipeline dashboard

**Outcome:** Client record created, AI brief structured, pipeline ready to run
**Alternative Flow:** If A1 fails → error shown, user can retry

---

### UC-02: Run Full AI SEO Pipeline

**Actor:** SEO Manager / SEO Executive
**Trigger:** New client added OR monthly re-analysis due
**Precondition:** Client brief exists

**Main Flow:**
1. User opens client → Pipeline tab
2. Clicks **🚀 Run Full SEO Analysis**
3. System runs 9 AI agents in sequence:

| Agent | Task | Output |
|---|---|---|
| **A1** | Client Onboarding | Business brief, goals, target audience |
| **A2** | Technical Audit | Health score, P1/P2/P3 issues, SERP preview, E-E-A-T, robots, sitemap |
| **A3** | Keyword Research | Keyword clusters, content gaps, cannibalization risks, snippet opportunities |
| **A4** | Competitor Intelligence | Competitor rankings, quick wins, content gaps, strategic summary |
| **A5** | Content Planning | New page briefs, FAQ content, homepage optimisation |
| **A6** | On-Page & Tags | Title/meta/H1 fixes, schema markup, fix queue |
| **A7** | Technical / CWV | PageSpeed scores, Core Web Vitals, mobile/desktop performance |
| **A8** | GEO & Off-Page | Local citations, link opportunities, AI search visibility |
| **A9** | Strategy Report | AI verdict, health score, top 3 action recommendations |

4. Live progress shows on screen — each agent ticks ✅ as it completes
5. On completion → auto-navigates to **🎯 Action Plan** tab

**Outcome:** Full SEO analysis complete across all 9 dimensions
**Auto-schedule:** System re-runs pipeline every 30 days automatically

---

### UC-03: Review the AI Action Plan

**Actor:** SEO Manager
**Trigger:** Pipeline completes
**Precondition:** At least A2 or A3 complete

**Main Flow:**
1. User opens **Action Plan** tab
2. Sees:
   - **SEO Health Score** (SVG ring, 0–100)
   - **Stats:** Critical / Important / Quick Wins / Completed
   - **AI Verdict** from the strategy report
   - **Progress bar** — tasks completed vs total
3. **TODAY section** — top 5 highest-priority tasks shown first
4. Each task shows:
   - Category badge (Critical / Quick Win / Content Gap / Important / Local SEO)
   - Impact badge (High / Medium / Low)
   - Effort badge (Easy / Medium / Hard)
   - Priority Score — calculated as: `(Ranking Impact × 0.4) + (Traffic Potential × 0.3) − (Effort × 0.3)`
   - "Why it matters" explanation
   - Suggested fix
5. User can:
   - **📋 Fix Now** — copies fix to clipboard
   - **🤖 Auto Fix** — AI generates detailed fix with code snippet
   - **✅ Mark Done** — marks task complete, updates progress bar
6. Category accordion below — expands by category (Critical / Quick Wins / Content / Important / Local SEO)

**Outcome:** Team has a clear, prioritised, data-backed action list for the week

---

### UC-04: Approve AI-Generated Content

**Actor:** SEO Manager
**Trigger:** A5 (Content) or A9 (Report) agent completes
**Precondition:** Items exist in the approval queue

**Main Flow:**
1. User opens **Approvals** tab
2. Sees pending items with:
   - **Impact badge** — High / Medium / Reporting
   - **Before vs After diff** — current text (red) vs proposed text (green), always visible
   - **"🤔 What happens if I approve this?"** panel — step-by-step outcome + timeline
3. User can:
   - **✅ Approve & Deploy** — change goes live immediately
   - **✏️ Request Changes** — sends specific feedback to AI for regeneration
   - **❌ Reject** — discards the item
4. After approving:
   - **5-minute undo countdown** appears
   - Outcome confirmation shown (e.g. "Google re-crawls in 3–14 days, CTR improves in 2–4 weeks")
5. Reviewed history shows actual outcomes, not just labels
6. Any status badge is clickable — explains what it means + what to do next

**Outcome:** Only reviewed, approved content goes live — no accidental deployments

**Approval Item Types:**

| Type | What It Approves |
|---|---|
| Homepage Optimisation | Title tag, meta description, H1 heading |
| New Page Brief | Content brief for writer, target keyword, outline |
| Client Report | AI verdict, health score, top 3 actions |

---

### UC-05: View Technical Audit Results

**Actor:** SEO Manager / SEO Executive
**Trigger:** A2 agent complete

**Main Flow:**
1. User opens **Audit** tab
2. Views score cards: Health Score / P1 Critical / P2 Important / P3 Minor
3. SERP Preview — see exactly how the site appears in Google search results
4. Technical checks: HTTP requests, alt text, OG tags, robots.txt, XML sitemap, E-E-A-T score, redirect chain, image optimisation
5. **Issues Accordion** — collapses by priority:
   - 🔴 **Critical Issues** — blocking crawling, immediate action needed
   - 🟡 **Important Fixes** — affecting rankings
   - ⚪ **Minor Issues** — quality signals
   - 💡 **Opportunities** — untapped improvements
6. Each issue shows: Why it matters + Suggested fix + **📋 Fix Now** button

**Outcome:** Team knows exactly what to fix, in what order, and why

---

### UC-06: Export Client PDF Report

**Actor:** SEO Manager
**Trigger:** Client presentation or monthly reporting
**Precondition:** A9 report complete and approved

**Main Flow:**
1. User opens **Action Plan** tab
2. Clicks **📄 Export PDF**
3. System renders full white-label report in new window
4. Browser print dialog opens — save as PDF
5. Report includes: cover page, table of contents, health score ring, SERP preview, issues list, keyword data, competitor analysis, recommendations

**Outcome:** Professional PDF report ready to send to client

---

### UC-07: Chat with AI SEO Expert

**Actor:** SEO Manager / SEO Executive
**Trigger:** User has a question about a specific client
**Precondition:** Client pipeline has run

**Main Flow:**
1. Click the **🤖 floating chatbot** button (bottom-right)
2. AI greets with client context already loaded
3. User asks questions in natural language:
   - "What is my current health score?"
   - "Show my top critical issues"
   - "What should I fix first this week?"
   - "Write a meta description for my homepage"
   - "Run full SEO analysis now"
4. AI responds using real client data — never generic answers
5. If user asks to run pipeline — AI triggers it in background
6. All responses in professional English regardless of input language

**Outcome:** Instant expert answers grounded in actual client data

---

### UC-08: Use SEO Tools (34 Tools)

**Actor:** Any logged-in user
**Trigger:** User needs a specific SEO task done quickly

**Available Tool Categories:**

| Category | Tools |
|---|---|
| **Content** | Keyword Research, Keyword Clustering, Content Brief, Auto Blog Generator, Content Refresh, Internal Linking, FAQ Generator, Programmatic SEO |
| **Technical** | Meta Tags Generator, On-Page SEO Audit, Schema Markup, Robots.txt + Sitemap, Core Web Vitals Fix, Page Speed Check |
| **Research** | Competitor Analysis, SERP Analysis, Topic Research, Trend Predictor, AI Rank Check |
| **GEO** | GEO — AI Visibility, AI Search Tracker, Prompt Optimizer, Entity SEO Builder |
| **Local** | Local SEO Optimizer, GMB Post Generator, YouTube SEO |
| **Backlinks** | Backlink Strategy, Link Prospect Finder, Outreach Generator |
| **Tools** | Site Health Audit, Content Gap Finder, E-commerce SEO, AI Content Humanizer, Voice Search SEO |
| **Analytics** | Search Console, GA4 Analytics, Rank Tracker, Brand Tracker |

**Main Flow:**
1. User selects a tool from sidebar
2. Enters input (keyword, URL, topic, or content)
3. Selects AI model (Groq / Gemini / DeepSeek / Mistral)
4. AI returns structured, actionable output
5. User can copy, download, or save to history

**Outcome:** Specific SEO task completed in seconds with AI assistance

---

### UC-09: Manage Users (Admin Only)

**Actor:** Agency Admin
**Trigger:** User needs password help, or a user needs to be blocked/removed
**Precondition:** Admin UID configured in system

**Main Flow:**

**Scenario A — Password Reset:**
1. Admin opens **👥 User Management** from sidebar
2. Finds user by name or email using search
3. Clicks **🔑 Reset Password**
4. System generates a Firebase password reset link
5. Admin copies the link and sends it to the user via email/WhatsApp
6. User clicks the link → sets a new password

**Scenario B — Block a User:**
1. Admin finds the user
2. Clicks **🚫 Block**
3. Confirmation dialog appears: "They will immediately be unable to log in"
4. Admin confirms → user is disabled in Firebase Auth instantly
5. User sees "Account disabled" if they try to log in
6. Admin can **✅ Unblock** at any time to restore access

**Scenario C — Delete a User:**
1. Admin clicks **🗑️ Delete** on a user card
2. Confirmation warning: "Permanently deletes from Firebase Auth AND Firestore"
3. Admin confirms → user removed completely
4. Action is irreversible

**Non-Admin Access:**
- Any user who is not the admin sees a **🔒 Admin Access Only** screen
- No user data is visible to non-admins

**Outcome:** Admin has full control over who can access the platform

---

## 6. Non-Functional Requirements

| Requirement | Detail |
|---|---|
| **Authentication** | Firebase Auth — Email/Password + Google OAuth |
| **Security** | JWT token verification on every API call, admin-only middleware |
| **Real-time** | Pipeline polling every 4 seconds during analysis |
| **Auto-scheduling** | Monthly re-run for all clients (checks every hour) |
| **Dark/Light Mode** | Full theme support across all screens |
| **PDF Export** | Print-quality white-label report via browser |
| **Hosting** | Frontend + Backend on Render, Firestore on Firebase |
| **AI Models** | Claude (primary), Groq, Gemini, DeepSeek, Mistral |

---

## 7. Data Flow Diagram

```
User Login
    ↓
Firebase Auth (JWT Token)
    ↓
Client Created → A1 Brief
    ↓
Run Pipeline Button
    ↓
A0 Orchestrator (coordinates all agents)
    ↓
A2 Audit → A3 Keywords → A4 Competitor
    ↓                    ↓
A5 Content          A6 On-Page + A7 CWV + A8 GEO
    ↓
A9 Strategy Report
    ↓
Action Plan (Priority Scored Tasks)
    ↓
Approval Queue → Admin Reviews → Approved → Live
    ↓
PDF Report → Client
```

---

## 8. Key Business Benefits

| Benefit | Metric |
|---|---|
| SEO audit time | 8–12 hours → **under 5 minutes** |
| Client onboarding | 1 week → **same day** |
| Monthly reporting | 2–3 hours → **1 click** |
| Task prioritisation | Manual judgement → **AI priority score** |
| Content generation | Writer starts from scratch → **AI brief ready** |
| User management | Ad-hoc → **centralised admin panel** |

---

## 9. Assumptions & Constraints

- User must have valid API keys configured (Groq / Gemini / OpenRouter / Google PageSpeed)
- Admin must set `ADMIN_UID` environment variable in Render for User Management to activate
- Password reset is only available for email/password users — Google OAuth users manage passwords via Google
- Pipeline re-run auto-scheduler runs every 30 days per client (checks hourly)
- PDF export requires browser to allow pop-ups

---

## 10. Future Scope (Suggested)

| Feature | Priority |
|---|---|
| White-label client portal (clients log in and see their own report) | High |
| Automated email delivery of PDF reports | High |
| Slack/WhatsApp notifications on pipeline completion | Medium |
| Team collaboration — multiple users per agency account | Medium |
| Pro plan billing and payment integration | High |
| API access for enterprise clients | Low |

---

*Document prepared for internal review. All features described are implemented and live on Render.*
