/**
 * toolBridge.js — Tool-Aware Agent Bridge
 *
 * Maps SEO issue types (detected by agents) to frontend tools that can fix them.
 * When an agent finds an issue, it calls emitToolSuggestion() — this writes a
 * structured suggestion into the approval_queue as type "tool_suggestion".
 * The frontend renders these as one-click tool launchers in the task list.
 *
 * Tool chains: some tools feed into others (e.g. blog → humanizer → serpsimulator).
 * After a tool runs, its output is stored and the next tool in the chain is offered.
 */

const { db, FieldValue } = require("../config/firebase");

// ── Issue type → tool mapping ────────────────────────────────────────────────
// Each entry defines which tool can fix the issue, how confident we are,
// what context to pass, and what the user-facing message should say.
const TOOL_MAP = {
  missing_title: {
    toolId:       "meta",
    confidence:   0.95,
    whyMessage:   "Missing or weak title tag — Meta Generator can write an optimised one in seconds",
    impact:       "high",
    estimatedTime: "2 min",
    contextBuilder: (issue, pageData) => ({
      url:         pageData?.url || issue.url || "",
      h1:          pageData?.h1 || "",
      existing:    pageData?.title || "",
      description: pageData?.metaDesc || "",
    }),
  },

  weak_title: {
    toolId:       "meta",
    confidence:   0.9,
    whyMessage:   "Title tag is too short or missing the primary keyword — Meta Generator will rewrite it",
    impact:       "high",
    estimatedTime: "2 min",
    contextBuilder: (issue, pageData) => ({
      url:      pageData?.url || issue.url || "",
      h1:       pageData?.h1 || "",
      existing: pageData?.title || "",
      keyword:  issue.keyword || "",
    }),
  },

  missing_meta_description: {
    toolId:       "meta",
    confidence:   0.92,
    whyMessage:   "No meta description — hurts CTR. Meta Generator will produce a compelling snippet.",
    impact:       "medium",
    estimatedTime: "2 min",
    contextBuilder: (issue, pageData) => ({
      url:     pageData?.url || issue.url || "",
      title:   pageData?.title || "",
      h1:      pageData?.h1 || "",
      content: pageData?.bodyText?.slice(0, 500) || "",
    }),
  },

  no_sitemap: {
    toolId:       "sitemap",
    confidence:   0.98,
    whyMessage:   "No sitemap.xml found — Sitemap Generator will create one from your crawled pages",
    impact:       "high",
    estimatedTime: "1 min",
    contextBuilder: (issue, pageData, auditData) => ({
      pages: (auditData?.pages || []).map(p => p.url).filter(Boolean),
    }),
  },

  missing_schema: {
    toolId:       "schema",
    confidence:   0.88,
    whyMessage:   "No structured data detected — Schema Generator will add the right schema type for this page",
    impact:       "high",
    estimatedTime: "3 min",
    contextBuilder: (issue, pageData) => ({
      url:      pageData?.url || issue.url || "",
      pageType: issue.pageType || "webpage",
      title:    pageData?.title || "",
      h1:       pageData?.h1 || "",
    }),
  },

  thin_content: {
    toolId:       "blog",
    confidence:   0.82,
    whyMessage:   "Page has thin content (<300 words) — Blog Generator can expand it with SEO-optimised copy",
    impact:       "high",
    estimatedTime: "5 min",
    contextBuilder: (issue, pageData) => ({
      url:     pageData?.url || issue.url || "",
      topic:   pageData?.h1 || pageData?.title || "",
      keyword: issue.keyword || "",
      wordCount: issue.wordCount || 0,
    }),
  },

  weak_eeat: {
    toolId:       "eeat",
    confidence:   0.78,
    whyMessage:   "Page lacks E-E-A-T signals — E-E-A-T Optimizer will suggest author bios, citations, and trust signals",
    impact:       "medium",
    estimatedTime: "5 min",
    contextBuilder: (issue, pageData) => ({
      url:     pageData?.url || issue.url || "",
      content: pageData?.bodyText?.slice(0, 1000) || "",
    }),
  },

  missing_h1: {
    toolId:       "onpage",
    confidence:   0.9,
    whyMessage:   "No H1 tag found — On-Page Optimizer will generate the correct heading structure",
    impact:       "high",
    estimatedTime: "3 min",
    contextBuilder: (issue, pageData) => ({
      url:     pageData?.url || issue.url || "",
      title:   pageData?.title || "",
      keyword: issue.keyword || "",
    }),
  },

  slow_cwv: {
    toolId:       "cwv",
    confidence:   0.85,
    whyMessage:   "Poor Core Web Vitals score — CWV Advisor will generate a prioritised fix checklist",
    impact:       "high",
    estimatedTime: "10 min",
    contextBuilder: (issue, pageData) => ({
      url:    pageData?.url || issue.url || "",
      lcp:    issue.lcp || null,
      fid:    issue.fid || null,
      cls:    issue.cls || null,
    }),
  },

  no_local_schema: {
    toolId:       "local",
    confidence:   0.87,
    whyMessage:   "Missing LocalBusiness schema — Local SEO tool will generate NAP-consistent structured data",
    impact:       "high",
    estimatedTime: "3 min",
    contextBuilder: (issue, pageData, auditData, brief) => ({
      businessName: brief?.businessName || "",
      address:      brief?.address || "",
      phone:        brief?.phone || "",
      url:          pageData?.url || issue.url || "",
    }),
  },

  keyword_gap: {
    toolId:       "contentgap",
    confidence:   0.8,
    whyMessage:   "Competitor ranking for keywords you're missing — Content Gap tool will identify opportunities",
    impact:       "medium",
    estimatedTime: "5 min",
    contextBuilder: (issue, pageData, auditData, brief) => ({
      keyword:    issue.keyword || "",
      competitor: issue.competitor || "",
      url:        brief?.websiteUrl || "",
    }),
  },

  keywords_ready: {
    toolId:       "brief",
    confidence:   0.75,
    whyMessage:   "Keyword research complete — Brief Generator can turn these into a full content brief",
    impact:       "medium",
    estimatedTime: "5 min",
    contextBuilder: (issue, pageData, auditData, brief, keywords) => ({
      keywords:    (keywords?.keywordMap || []).slice(0, 10).map(k => k.keyword),
      businessName: brief?.businessName || "",
      url:          brief?.websiteUrl || "",
    }),
  },

  outreach_needed: {
    toolId:       "outreach",
    confidence:   0.78,
    whyMessage:   "Link-building opportunity identified — Outreach Email Generator will write the pitch",
    impact:       "medium",
    estimatedTime: "3 min",
    contextBuilder: (issue) => ({
      target:   issue.target || "",
      type:     issue.linkType || "guest_post",
      keyword:  issue.keyword || "",
    }),
  },

  meta_fix_ready: {
    toolId:       "metapreview",
    confidence:   0.85,
    whyMessage:   "Meta tags updated — preview how this page will look in Google search results",
    impact:       "low",
    estimatedTime: "1 min",
    contextBuilder: (issue, pageData) => ({
      title:       pageData?.title || "",
      description: pageData?.metaDesc || "",
      url:         pageData?.url || issue.url || "",
    }),
  },

  aeo_opportunity: {
    toolId:       "aeo",
    confidence:   0.76,
    whyMessage:   "Question-format keyword detected — AEO Optimizer will generate a featured snippet answer block",
    impact:       "medium",
    estimatedTime: "5 min",
    contextBuilder: (issue) => ({
      question: issue.keyword || "",
      topic:    issue.topic || "",
    }),
  },
};

// ── Tool chains: after tool X completes, suggest tool Y ─────────────────────
const TOOL_CHAINS = {
  blog:  { nextToolId: "humanizer",    nextReason: "Humanize the AI-generated copy to pass AI detection" },
  meta:  { nextToolId: "serpsimulator", nextReason: "Simulate how your updated meta will look in Google" },
  humanizer: { nextToolId: "serpsimulator", nextReason: "Preview your final copy in SERP format" },
};

// ── Deduplication: don't suggest the same tool for the same issue twice ──────
async function isDuplicateSuggestion(clientId, toolId, issueKey) {
  try {
    const snap = await db.collection("approval_queue")
      .where("clientId", "==", clientId)
      .where("type", "==", "tool_suggestion")
      .where("toolId", "==", toolId)
      .where("issueKey", "==", issueKey)
      .where("status", "==", "pending")
      .limit(1)
      .get();
    return !snap.empty;
  } catch {
    return false; // if check fails, allow suggestion
  }
}

// ── Main: emit a tool suggestion into the approval queue ────────────────────
async function emitToolSuggestion(clientId, issueType, issueData = {}, contextOverrides = {}) {
  const mapping = TOOL_MAP[issueType];
  if (!mapping) return; // no tool mapped for this issue type

  // Enforce minimum confidence threshold
  if (mapping.confidence < 0.70) return;

  const issueKey = `${issueType}__${issueData.url || issueData.keyword || "global"}`;

  // Dedup check — don't spam the queue
  const isDupe = await isDuplicateSuggestion(clientId, mapping.toolId, issueKey);
  if (isDupe) return;

  // Expire old suggestions (7 days) — non-blocking
  db.collection("approval_queue")
    .where("clientId", "==", clientId)
    .where("type", "==", "tool_suggestion")
    .where("toolId", "==", mapping.toolId)
    .where("issueKey", "==", issueKey)
    .where("status", "==", "expired")
    .get()
    .then(snap => snap.forEach(d => d.ref.delete()))
    .catch(() => {});

  // Build context for the tool
  const context = { ...contextOverrides };

  try {
    await db.collection("approval_queue").add({
      clientId,
      type:         "tool_suggestion",
      toolId:       mapping.toolId,
      issueType,
      issueKey,
      whyMessage:   mapping.whyMessage,
      impact:       mapping.impact,
      estimatedTime: mapping.estimatedTime,
      confidence:   mapping.confidence,
      context,
      status:       "pending",
      chainNext:    TOOL_CHAINS[mapping.toolId] || null,
      createdAt:    FieldValue.serverTimestamp(),
      expiresAt:    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
  } catch (e) {
    console.warn(`[toolBridge] Failed to emit suggestion for ${issueType}:`, e.message);
  }
}

module.exports = { emitToolSuggestion, TOOL_MAP, TOOL_CHAINS };
