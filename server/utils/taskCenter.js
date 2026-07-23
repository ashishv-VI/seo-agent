/**
 * taskCenter.js — Unified Task Center engine (M9.4).
 *
 * PURE CALCULATION LAYER. No Firestore, no LLM, no I/O. Merges work items from
 * every existing source into ONE canonical task model, deduplicates, normalizes
 * priority/severity, scores, sorts, and buckets (quick wins / critical / overdue
 * / completed). The route module does all reads/writes and passes plain arrays in.
 *
 * DESIGN — no second task system: the existing `task_queue/{clientId}/tasks`
 * subcollection stays the source of truth for audit-derived tasks. This engine
 * READS it (via the route) and additionally surfaces items from newer sources
 * that don't write to task_queue (Approvals, Answer Optimization). It does not
 * regenerate or duplicate those into task_queue. User edits (status/priority/
 * assignee/notes) are applied as OVERRIDES keyed by canonical id, so the
 * underlying sources are never mutated.
 *
 * Canonical task fields:
 *   id, title, description, category, sourceAgent, taskType, priority, severity,
 *   impact, effort, confidence, expectedGain, status, assignee, dueDate, tags,
 *   approvalRequired, approvalCompatible, relatedEntity, createdAt, updatedAt,
 *   completedAt, history
 */

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const SEVERITY_BY_PRIORITY = { critical: "critical", high: "high", medium: "warning", low: "info" };

function normImpact(v) {
  const s = String(v || "").toLowerCase();
  if (s === "high") return "high";
  if (s === "medium") return "medium";
  if (s === "low") return "low";
  return "medium";
}
function normEffort(v) {
  const s = String(v || "").toLowerCase();
  if (s === "easy" || s === "low") return "low";
  if (s === "hard" || s === "high") return "high";
  return "medium";
}
// Derive a normalized priority from impact + effort (quick high-impact floats up).
function derivePriority(impact, effort) {
  const imp = { high: 3, medium: 2, low: 1 }[normImpact(impact)] || 2;
  const eff = { low: 0, medium: 1, high: 2 }[normEffort(effort)] || 1;
  const s = imp - eff;
  if (s >= 3) return "critical";
  if (s >= 2) return "high";
  if (s >= 1) return "medium";
  return "low";
}

// Numeric score for sorting: priority band + expected gain, minus age penalty handled at sort.
function scoreOf(t) {
  const band = (4 - (PRIORITY_ORDER[t.priority] ?? 2)) * 100;
  return band + (Number(t.expectedGain) || 0);
}

function toIso(v) {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (v._seconds) return new Date(v._seconds * 1000).toISOString();
  if (v.seconds) return new Date(v.seconds * 1000).toISOString();
  try { return new Date(v).toISOString(); } catch { return null; }
}

// ── Source normalizers → canonical task ──

// task_queue/{clientId}/tasks docs (audit-derived).
function fromTaskQueue(t) {
  const impact = normImpact(t.impact);
  const effort = normEffort(t.effort);
  const priority = derivePriority(impact, effort);
  return {
    id: `tq:${t.taskId || t.id}`,
    title: t.title || t.issueType || "Untitled task",
    description: t.fixSuggestion || "",
    category: "SEO Fix",
    sourceAgent: t.sourceAgent || t.assignedAgent || "A2",
    taskType: t.issueType || "seo_fix",
    priority,
    severity: SEVERITY_BY_PRIORITY[priority],
    impact, effort,
    confidence: 0.8,
    expectedGain: Number(t.expectedScoreGain) || 0,
    status: t.status || "pending",
    assignee: t.assignedTo || null,
    dueDate: null,
    tags: [t.tier].filter(Boolean),
    approvalRequired: false,
    approvalCompatible: !!t.autoFixable,
    relatedEntity: { kind: "task_queue", id: t.taskId || t.id },
    createdAt: toIso(t.createdAt),
    updatedAt: toIso(t.updatedAt),
    completedAt: toIso(t.completedAt),
    history: [],
  };
}

// approval_queue docs.
function fromApproval(a) {
  const priority = a.status === "revision_requested" ? "high" : "medium";
  return {
    id: `ap:${a.id}`,
    title: a.title || `${a.type || "Fix"} — approval`,
    description: a.detail || a.message || "Awaiting human approval.",
    category: "Approval",
    sourceAgent: a.agentId || a.source || "A23",
    taskType: a.type || "approval",
    priority,
    severity: SEVERITY_BY_PRIORITY[priority],
    impact: "medium", effort: "low",
    confidence: 0.7,
    expectedGain: 0,
    status: a.status === "approved" ? "done" : a.status === "rejected" ? "cancelled" : "pending",
    assignee: null,
    dueDate: null,
    tags: ["approval", a.category].filter(Boolean),
    approvalRequired: true,
    approvalCompatible: true,
    relatedEntity: { kind: "approval_queue", id: a.id },
    createdAt: toIso(a.createdAt),
    updatedAt: toIso(a.reviewedAt || a.revisedAt || a.createdAt),
    completedAt: a.status === "approved" ? toIso(a.reviewedAt) : null,
    history: [],
  };
}

// answer_optimization opportunities (M9.3).
function fromOpportunity(o, i) {
  const impact = normImpact(o.impact);
  const effort = normEffort(o.difficulty);
  const priority = o.priority || derivePriority(impact, effort);
  return {
    id: `ao:${o.taskType || i}`,
    title: o.title || "Optimization opportunity",
    description: o.detail || "",
    category: o.category || "Optimization",
    sourceAgent: "AnswerOptimization",
    taskType: o.taskType || "optimization",
    priority,
    severity: SEVERITY_BY_PRIORITY[priority] || "info",
    impact, effort,
    confidence: typeof o.confidence === "number" ? o.confidence : 0.6,
    expectedGain: Number(o.expectedVisibilityGain) || 0,
    status: "pending",
    assignee: null,
    dueDate: null,
    tags: ["ai-visibility", o.category].filter(Boolean),
    approvalRequired: false,
    approvalCompatible: !!o.approvalCompatible,
    relatedEntity: { kind: "answer_optimization", id: o.taskType || String(i) },
    createdAt: null,
    updatedAt: null,
    completedAt: null,
    history: [],
  };
}

/**
 * Build the unified task list.
 * @param {object} sources { taskQueue:[], approvals:[], opportunities:[] }
 * @param {object} overrides  map of canonicalId → { status?, priority?, assignee?, notes?, updatedAt?, completedAt?, history? }
 * @param {string} nowIso     current time (passed in — engine is pure/deterministic)
 */
function buildTaskCenter(sources = {}, overrides = {}, nowIso = null) {
  const raw = [
    ...(sources.taskQueue || []).map(fromTaskQueue),
    ...(sources.approvals || []).map(fromApproval),
    ...(sources.opportunities || []).map(fromOpportunity),
  ];

  // ── Deduplicate: prefer distinct canonical id; if two tasks share title+taskType, keep the higher-priority one.
  const byId = new Map();
  for (const t of raw) {
    if (!byId.has(t.id)) { byId.set(t.id, t); continue; }
    const existing = byId.get(t.id);
    if (PRIORITY_ORDER[t.priority] < PRIORITY_ORDER[existing.priority]) byId.set(t.id, t);
  }
  // second pass: collapse title+taskType duplicates across sources
  const seen = new Map();
  const deduped = [];
  for (const t of byId.values()) {
    const key = `${t.title}::${t.taskType}`;
    if (seen.has(key)) {
      const ex = seen.get(key);
      if (PRIORITY_ORDER[t.priority] < PRIORITY_ORDER[ex.priority]) {
        const idx = deduped.indexOf(ex);
        deduped[idx] = t; seen.set(key, t);
      }
      continue;
    }
    seen.set(key, t); deduped.push(t);
  }

  // ── Apply overrides (user edits) — never mutate sources, just layer on top.
  const now = nowIso ? Date.parse(nowIso) : null;
  const tasks = deduped.map(t => {
    const ov = overrides[t.id];
    const merged = ov ? {
      ...t,
      status:   ov.status   ?? t.status,
      priority: ov.priority ?? t.priority,
      assignee: ov.assignee ?? t.assignee,
      notes:    ov.notes    ?? t.notes,
      updatedAt: ov.updatedAt ?? t.updatedAt,
      completedAt: ov.completedAt ?? t.completedAt,
      history: ov.history || t.history,
    } : t;
    // keep severity consistent if priority was overridden
    merged.severity = SEVERITY_BY_PRIORITY[merged.priority] || merged.severity;
    // aging (days since created) — informational
    const created = merged.createdAt ? Date.parse(merged.createdAt) : null;
    merged.ageDays = (now && created) ? Math.max(0, Math.round((now - created) / 86400000)) : null;
    return merged;
  });

  // ── Sort: open tasks by score desc, done/cancelled to the bottom.
  const isClosed = s => s === "done" || s === "cancelled";
  tasks.sort((a, b) => {
    if (isClosed(a.status) !== isClosed(b.status)) return isClosed(a.status) ? 1 : -1;
    return scoreOf(b) - scoreOf(a);
  });

  // ── Buckets + summary.
  const open = tasks.filter(t => !isClosed(t.status));
  const critical = open.filter(t => t.priority === "critical");
  const quickWins = open.filter(t => t.effort === "low" && (t.impact === "high" || t.impact === "medium"));
  const blocked = open.filter(t => t.status === "blocked");
  const overdue = open.filter(t => t.dueDate && now && Date.parse(t.dueDate) < now);
  const completed = tasks.filter(t => t.status === "done");
  const completedToday = completed.filter(t => {
    if (!t.completedAt || !now) return false;
    return (now - Date.parse(t.completedAt)) < 86400000;
  });

  const total = tasks.length;
  const completionRate = total > 0 ? Math.round((completed.length / total) * 100) : 0;

  return {
    tasks,
    summary: {
      total,
      open: open.length,
      criticalTasks: critical.length,
      quickWins: quickWins.length,
      blocked: blocked.length,
      overdue: overdue.length,
      completed: completed.length,
      completedToday: completedToday.length,
      completionRate,
    },
    buckets: {
      critical: critical.slice(0, 20),
      quickWins: quickWins.slice(0, 20),
      blocked: blocked.slice(0, 20),
      overdue: overdue.slice(0, 20),
    },
  };
}

module.exports = { buildTaskCenter, derivePriority, PRIORITY_ORDER };
