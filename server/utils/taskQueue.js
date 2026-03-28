/**
 * Task Queue Utility
 * Emits prioritised tasks to Firestore task_queue after agents detect issues
 */
const { db, FieldValue } = require("../config/firebase");

// ── Issue → Agent Mapping ──────────────────────────
const ISSUE_AGENT_MAP = {
  // On-Page Agent
  missing_title:           "OnPageAgent",
  short_title:             "OnPageAgent",
  long_title:              "OnPageAgent",
  missing_meta_desc:       "OnPageAgent",
  long_meta_desc:          "OnPageAgent",
  missing_h1:              "OnPageAgent",
  multiple_h1:             "OnPageAgent",
  missing_canonical:       "OnPageAgent",
  no_viewport:             "OnPageAgent",
  og_tags_missing:         "OnPageAgent",
  missing_alt_text:        "OnPageAgent",
  missing_alt:             "OnPageAgent",

  // Technical Agent
  slow_response_time:      "TechnicalAgent",
  too_many_requests:       "TechnicalAgent",
  high_request_count:      "TechnicalAgent",
  redirect_chain:          "TechnicalAgent",
  missing_sitemap:         "TechnicalAgent",
  robots_disallow:         "TechnicalAgent",
  no_ssl:                  "TechnicalAgent",
  unminified_assets:       "TechnicalAgent",
  cwv_lcp_fail:            "TechnicalAgent",
  cwv_cls_fail:            "TechnicalAgent",
  cwv_fcp_fail:            "TechnicalAgent",
  poor_mobile_performance: "TechnicalAgent",
  low_mobile_performance:  "TechnicalAgent",
  image_not_optimized:     "TechnicalAgent",

  // Content Agent
  thin_content:            "ContentAgent",
  keyword_cannibalization: "ContentAgent",
  content_gap:             "ContentAgent",
  missing_schema:          "ContentAgent",
  no_faq:                  "ContentAgent",
  low_keyword_visibility:  "ContentAgent",

  // Linking Agent
  orphan_page:             "LinkingAgent",
  broken_internal_link:    "LinkingAgent",
  low_internal_links:      "LinkingAgent",
  anchor_text_generic:     "LinkingAgent",

  // Local Agent
  citation_missing:        "LocalAgent",
  gmb_not_optimized:       "LocalAgent",
  no_location_page:        "LocalAgent",
};

// ── Impact & Effort per issue type ────────────────
const ISSUE_METADATA = {
  missing_title:           { impact:"High",   effort:"easy",  rankImpact:90, trafficPot:80, scoreGain:8,  rankGain:"3-6 positions",   autoFixable:true  },
  short_title:             { impact:"Medium", effort:"easy",  rankImpact:65, trafficPot:55, scoreGain:4,  rankGain:"1-3 positions",   autoFixable:true  },
  long_title:              { impact:"Medium", effort:"easy",  rankImpact:60, trafficPot:50, scoreGain:3,  rankGain:"1-2 positions",   autoFixable:true  },
  missing_meta_desc:       { impact:"Medium", effort:"easy",  rankImpact:60, trafficPot:65, scoreGain:5,  rankGain:"1-3 positions",   autoFixable:true  },
  long_meta_desc:          { impact:"Low",    effort:"easy",  rankImpact:40, trafficPot:40, scoreGain:2,  rankGain:"0-1 positions",   autoFixable:true  },
  missing_h1:              { impact:"High",   effort:"easy",  rankImpact:85, trafficPot:75, scoreGain:7,  rankGain:"2-5 positions",   autoFixable:false },
  multiple_h1:             { impact:"Medium", effort:"easy",  rankImpact:55, trafficPot:45, scoreGain:3,  rankGain:"1-2 positions",   autoFixable:false },
  missing_canonical:       { impact:"Medium", effort:"easy",  rankImpact:55, trafficPot:40, scoreGain:4,  rankGain:"1-3 positions",   autoFixable:true  },
  no_viewport:             { impact:"High",   effort:"easy",  rankImpact:80, trafficPot:70, scoreGain:6,  rankGain:"2-4 positions",   autoFixable:true  },
  missing_alt:             { impact:"Low",    effort:"easy",  rankImpact:45, trafficPot:35, scoreGain:3,  rankGain:"0-2 positions",   autoFixable:true  },
  missing_alt_text:        { impact:"Low",    effort:"easy",  rankImpact:45, trafficPot:35, scoreGain:3,  rankGain:"0-2 positions",   autoFixable:true  },
  redirect_chain:          { impact:"High",   effort:"medium",rankImpact:82, trafficPot:70, scoreGain:6,  rankGain:"2-4 positions",   autoFixable:false },
  slow_response_time:      { impact:"High",   effort:"hard",  rankImpact:88, trafficPot:78, scoreGain:10, rankGain:"3-6 positions",   autoFixable:false },
  too_many_requests:       { impact:"High",   effort:"hard",  rankImpact:80, trafficPot:72, scoreGain:9,  rankGain:"2-5 positions",   autoFixable:false },
  high_request_count:      { impact:"Medium", effort:"medium",rankImpact:65, trafficPot:55, scoreGain:5,  rankGain:"1-3 positions",   autoFixable:false },
  missing_sitemap:         { impact:"High",   effort:"easy",  rankImpact:78, trafficPot:65, scoreGain:8,  rankGain:"2-4 positions",   autoFixable:true  },
  unminified_assets:       { impact:"Medium", effort:"medium",rankImpact:60, trafficPot:50, scoreGain:4,  rankGain:"1-2 positions",   autoFixable:false },
  thin_content:            { impact:"High",   effort:"hard",  rankImpact:88, trafficPot:85, scoreGain:15, rankGain:"5-10 positions",  autoFixable:false },
  keyword_cannibalization: { impact:"Medium", effort:"hard",  rankImpact:72, trafficPot:65, scoreGain:8,  rankGain:"3-6 positions",   autoFixable:false },
  content_gap:             { impact:"High",   effort:"hard",  rankImpact:82, trafficPot:90, scoreGain:12, rankGain:"New ranking",     autoFixable:false },
  missing_schema:          { impact:"Medium", effort:"medium",rankImpact:60, trafficPot:55, scoreGain:4,  rankGain:"Rich result opp", autoFixable:true  },
  low_internal_links:      { impact:"Medium", effort:"medium",rankImpact:65, trafficPot:55, scoreGain:5,  rankGain:"2-4 positions",   autoFixable:false },
  low_keyword_visibility:  { impact:"High",   effort:"hard",  rankImpact:88, trafficPot:88, scoreGain:14, rankGain:"5-15 positions",  autoFixable:false },
  poor_mobile_performance: { impact:"High",   effort:"hard",  rankImpact:90, trafficPot:80, scoreGain:12, rankGain:"3-7 positions",   autoFixable:false },
  low_mobile_performance:  { impact:"Medium", effort:"medium",rankImpact:70, trafficPot:60, scoreGain:6,  rankGain:"2-4 positions",   autoFixable:false },
};

const EFFORT_COST = { easy: 10, medium: 30, hard: 60 };

function calcPriority(rankingImpact, trafficPotential, effort) {
  const cost = EFFORT_COST[effort] || 30;
  return Math.round((rankingImpact * 0.4) + (trafficPotential * 0.3) - (cost * 0.3));
}

/**
 * Emit a batch of issues as tasks to the task_queue collection
 * @param {string} clientId
 * @param {Array}  issues   — array of { type, detail, fix, ... }
 * @param {string} tier     — "p1" | "p2" | "p3"
 * @param {string} sourceAgent — "A2" | "A6" | "A7" etc.
 */
async function emitTasks(clientId, issues, tier, sourceAgent) {
  if (!issues?.length) return;

  const batch = db.batch();
  const now   = FieldValue.serverTimestamp();

  for (const issue of issues) {
    const meta         = ISSUE_METADATA[issue.type] || { impact:"Medium", effort:"medium", rankImpact:55, trafficPot:50, scoreGain:3, rankGain:"1-3 positions", autoFixable:false };
    const assignedAgent = ISSUE_AGENT_MAP[issue.type] || "TechnicalAgent";
    const priority     = calcPriority(meta.rankImpact, meta.trafficPot, meta.effort);

    const impactColor = { High:"#DC2626", Medium:"#D97706", Low:"#6B7280" }[meta.impact] || "#6B7280";
    const effortColor = { easy:"#059669", medium:"#D97706", hard:"#DC2626" }[meta.effort] || "#D97706";

    const ref = db.collection("task_queue").doc(clientId).collection("tasks").doc();
    batch.set(ref, {
      taskId:          ref.id,
      clientId,
      createdAt:       now,
      updatedAt:       now,
      sourceAgent,
      tier,

      // Issue
      title:           issue.detail,
      issueType:       issue.type || "unknown",
      fixSuggestion:   issue.fix  || "",

      // Assignment
      assignedAgent,
      assignedTo:      null,

      // Priority
      priorityScore:   priority,
      rankingImpact:   meta.rankImpact,
      trafficPotential:meta.trafficPot,
      effort:          meta.effort,

      // Impact
      impact:          meta.impact,
      impactColor,
      effortColor,
      expectedScoreGain: meta.scoreGain,
      expectedRankGain:  meta.rankGain,

      // Execution
      status:          "pending",
      mode:            "manual",
      autoFixable:     meta.autoFixable,

      // Tracking
      completedAt:     null,
      completedBy:     null,
    });
  }

  await batch.commit();
}

/**
 * Get all tasks for a client, sorted by priority
 */
async function getTasks(clientId) {
  const snap = await db.collection("task_queue").doc(clientId).collection("tasks")
    .orderBy("priorityScore", "desc")
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Get top N pending tasks
 */
async function getTopTasks(clientId, limit = 5) {
  const snap = await db.collection("task_queue").doc(clientId).collection("tasks")
    .where("status", "==", "pending")
    .orderBy("priorityScore", "desc")
    .limit(limit)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Update a task's status
 */
async function updateTask(clientId, taskId, updates) {
  await db.collection("task_queue").doc(clientId).collection("tasks").doc(taskId)
    .update({ ...updates, updatedAt: FieldValue.serverTimestamp() });
}

/**
 * Clear all tasks for a client (called when pipeline re-runs)
 */
async function clearTasks(clientId) {
  const snap = await db.collection("task_queue").doc(clientId).collection("tasks").get();
  const batch = db.batch();
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
}

module.exports = { emitTasks, getTasks, getTopTasks, updateTask, clearTasks, calcPriority, ISSUE_METADATA };
