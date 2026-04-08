/**
 * Rules Engine — IFTTT-style SEO Automation
 * 7 default rules pre-built. Custom rules via API.
 *
 * Default rules:
 *   1. keyword_drop_5     — keyword drops 5+ positions → queue A11 + A5
 *   2. page_2_keyword     — keyword on page 2 (11-20) → queue content + links
 *   3. low_ctr            — CTR <2% with 100+ impressions → queue title/meta rewrite
 *   4. competitor_new_page— competitor publishes new page → alert + A5
 *   5. traffic_drop_20    — organic traffic drops 20%+ week-over-week → A23 investigator
 *   6. noindex_detected   — page accidentally set to noindex → P1 alert + notification
 *   7. new_ranking        — new keyword enters top 50 → log + nurture opportunity
 *
 * Routes:
 *   GET  /api/rules-engine/:clientId          — list active rules + last fire times
 *   POST /api/rules-engine/:clientId/evaluate — manually trigger evaluation
 *   POST /api/rules-engine/:clientId/rules    — create custom rule
 *   PUT  /api/rules-engine/:clientId/rules/:ruleId — update rule (enable/disable)
 *   GET  /api/rules-engine/:clientId/log      — rule fire history
 */

const express  = require("express");
const router   = express.Router();
const { db, FieldValue } = require("../config/firebase");
const { verifyToken }    = require("../middleware/auth");
const { getState }       = require("../shared-state/stateManager");

// ── Default rules shipped with every new client ───────────────────────────────
const DEFAULT_RULES = [
  {
    id:          "keyword_drop_5",
    name:        "Keyword Drop Alert",
    description: "Triggers when any keyword drops 5+ positions",
    trigger:     { type: "keyword_position_change", threshold: -5, comparison: "lte" },
    actions:     [
      { type: "create_alert",   severity: "P2", message: "Keyword {{keyword}} dropped from {{from}} to {{to}}" },
      { type: "queue_agent",    agent: "A11", reason: "Build links to recover dropping keyword" },
      { type: "queue_agent",    agent: "A5",  reason: "Refresh content for dropping keyword page" },
    ],
    enabled:     true,
    default:     true,
  },
  {
    id:          "page_2_keyword",
    name:        "Page 2 Keyword Opportunity",
    description: "Keywords ranking 11-20 — one push can get to page 1",
    trigger:     { type: "keyword_position_range", min: 11, max: 20 },
    actions:     [
      { type: "create_alert",  severity: "P3", message: "{{count}} keywords on page 2 — quick win opportunity" },
      { type: "queue_agent",   agent: "A6",   reason: "On-page optimisation for page 2 keywords" },
      { type: "queue_agent",   agent: "A11",  reason: "1-2 targeted backlinks can push to page 1" },
    ],
    enabled:     true,
    default:     true,
  },
  {
    id:          "low_ctr",
    name:        "Low CTR Opportunity",
    description: "Keywords with 100+ impressions but CTR under 2%",
    trigger:     { type: "gsc_ctr", maxCtr: 0.02, minImpressions: 100 },
    actions:     [
      { type: "create_alert",  severity: "P3", message: "{{count}} keywords have low CTR (<2%) — title/meta rewrites needed" },
      { type: "queue_agent",   agent: "A6",   reason: "Rewrite title tags and meta descriptions for low-CTR keywords" },
      { type: "queue_agent",   agent: "A5",   reason: "Generate optimised meta descriptions" },
    ],
    enabled:     true,
    default:     true,
  },
  {
    id:          "competitor_new_page",
    name:        "Competitor New Page",
    description: "A monitored competitor publishes a new page",
    trigger:     { type: "competitor_activity", activityType: "new_page" },
    actions:     [
      { type: "create_alert",  severity: "P2", message: "Competitor {{competitor}} published new page: {{url}}" },
      { type: "create_notification", title: "Competitor Alert", body: "{{competitor}} has a new page targeting keywords you rank for" },
      { type: "queue_agent",   agent: "A5",   reason: "Create competing content to defend keyword rankings" },
    ],
    enabled:     true,
    default:     true,
  },
  {
    id:          "traffic_drop_20",
    name:        "Traffic Drop Investigation",
    description: "Organic traffic drops 20%+ week-over-week",
    trigger:     { type: "traffic_change", threshold: -20, comparison: "lte", window: "week" },
    actions:     [
      { type: "create_alert",  severity: "P1", message: "Organic traffic dropped {{pct}}% this week — investigation needed" },
      { type: "queue_agent",   agent: "A23",  reason: "Investigate root cause of traffic drop" },
      { type: "create_notification", title: "Traffic Drop Detected", body: "Traffic down {{pct}}% — A23 is investigating" },
    ],
    enabled:     true,
    default:     true,
  },
  {
    id:          "noindex_detected",
    name:        "Accidental Noindex",
    description: "A page is found with noindex tag — invisible to Google",
    trigger:     { type: "technical_issue", issueType: "noindex_detected" },
    actions:     [
      { type: "create_alert",  severity: "P1", message: "Page {{url}} has noindex — Google cannot index it" },
      { type: "create_notification", title: "Noindex Detected", body: "{{url}} is accidentally blocked from Google" },
      { type: "queue_agent",   agent: "A13",  reason: "Push noindex removal fix" },
    ],
    enabled:     true,
    default:     true,
  },
  {
    id:          "new_ranking",
    name:        "New Keyword Ranking",
    description: "A new keyword enters top 50 — nurture the opportunity",
    trigger:     { type: "keyword_new_ranking", maxPosition: 50 },
    actions:     [
      { type: "log_event",     message: "New keyword ranking: {{keyword}} at position {{position}}" },
      { type: "create_notification", title: "New Keyword Ranking", body: "{{keyword}} now ranks at position {{position}}" },
    ],
    enabled:     true,
    default:     true,
  },
];

// ── Evaluate all rules for a client ──────────────────────────────────────────
async function evaluateRules(clientId, uid) {
  const [report, audit, keywords, rankHistory, weeklySnaps] = await Promise.all([
    getState(clientId, "A9_report").catch(() => null),
    getState(clientId, "A2_audit").catch(() => null),
    getState(clientId, "A3_keywords").catch(() => null),
    db.collection("rank_history").where("clientId", "==", clientId).limit(2).get()
      .then(s => s.docs.map(d => d.data()).sort((a, b) => (b.date || "").localeCompare(a.date || "")))
      .catch(() => []),
    db.collection("weekly_snapshots").where("clientId", "==", clientId).limit(2).get()
      .then(s => s.docs.map(d => d.data()).sort((a, b) => (b.week || "").localeCompare(a.week || "")))
      .catch(() => []),
  ]);

  // Get client's active rules (defaults + custom)
  const rulesSnap = await db.collection("client_rules")
    .where("clientId", "==", clientId)
    .where("enabled", "==", true)
    .get().catch(() => null);

  // Merge: defaults + any custom/overridden rules from Firestore
  const customRules    = rulesSnap ? rulesSnap.docs.map(d => d.data()) : [];
  const customIds      = new Set(customRules.map(r => r.id));
  const effectiveRules = [
    ...DEFAULT_RULES.filter(r => !customIds.has(r.id)), // defaults not overridden
    ...customRules,
  ].filter(r => r.enabled !== false);

  const fired = [];

  for (const rule of effectiveRules) {
    try {
      const result = await evaluateRule(rule, { clientId, report, audit, keywords, rankHistory, weeklySnaps });
      if (result.triggered) {
        await executeRuleActions(rule, result.context, clientId, uid);
        fired.push({ ruleId: rule.id, ruleName: rule.name, context: result.context });
        // Log rule fire
        await db.collection("rule_fire_log").add({
          clientId, ruleId: rule.id, ruleName: rule.name,
          context: result.context, firedAt: FieldValue.serverTimestamp(),
        }).catch(() => {});
      }
    } catch (e) {
      console.error(`[rulesEngine] Rule ${rule.id} error:`, e.message);
    }
  }

  return { evaluated: effectiveRules.length, fired: fired.length, firedRules: fired };
}

// ── Evaluate a single rule ────────────────────────────────────────────────────
async function evaluateRule(rule, { clientId, report, audit, keywords, rankHistory, weeklySnaps }) {
  const t = rule.trigger;

  switch (t.type) {
    case "keyword_position_change": {
      if (rankHistory.length < 2) return { triggered: false };
      const latest   = rankHistory[0]?.keywords || [];
      const prev     = rankHistory[1]?.keywords || [];
      const prevMap  = Object.fromEntries(prev.map(k => [k.keyword, k.position]));
      const drops    = latest.filter(k => {
        const p = prevMap[k.keyword];
        return p != null && k.position != null && (k.position - p) >= Math.abs(t.threshold || 5);
      });
      if (drops.length === 0) return { triggered: false };
      return { triggered: true, context: { keyword: drops[0].keyword, from: prevMap[drops[0].keyword], to: drops[0].position, count: drops.length, allDropped: drops.slice(0, 5) } };
    }

    case "keyword_position_range": {
      const allKws = rankHistory[0]?.keywords || keywords?.keywordMap || [];
      const inRange = allKws.filter(k => k.position >= (t.min || 11) && k.position <= (t.max || 20));
      if (inRange.length === 0) return { triggered: false };
      return { triggered: true, context: { count: inRange.length, keywords: inRange.slice(0, 5) } };
    }

    case "gsc_ctr": {
      const gscKws = report?.gscSummary?.topKeywords || [];
      const lowCtr = gscKws.filter(k => (k.ctr || 0) < (t.maxCtr || 0.02) && (k.impressions || 0) >= (t.minImpressions || 100));
      if (lowCtr.length === 0) return { triggered: false };
      return { triggered: true, context: { count: lowCtr.length, keywords: lowCtr.slice(0, 5) } };
    }

    case "competitor_activity": {
      // Check alerts collection for recent competitor activity
      const since   = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const alertSnap = await db.collection("alerts")
        .where("clientId", "==", clientId)
        .where("type", "==", "competitor_new_page")
        .limit(5)
        .get().catch(() => null);
      if (!alertSnap || alertSnap.empty) return { triggered: false };
      const recent = alertSnap.docs.map(d => d.data()).filter(a => (a.createdAt || "") >= since);
      if (recent.length === 0) return { triggered: false };
      return { triggered: true, context: { competitor: recent[0].competitor, url: recent[0].url, count: recent.length } };
    }

    case "traffic_change": {
      if (weeklySnaps.length < 2) return { triggered: false };
      const curr = weeklySnaps[0]?.gsc?.totalClicks || 0;
      const prev = weeklySnaps[1]?.gsc?.totalClicks || 0;
      if (prev === 0) return { triggered: false };
      const pct = Math.round(((curr - prev) / prev) * 100);
      const threshold = t.threshold || -20;
      if (pct > threshold) return { triggered: false };
      return { triggered: true, context: { pct, currentClicks: curr, prevClicks: prev } };
    }

    case "technical_issue": {
      const issues = audit?.issues?.p1 || [];
      const found  = issues.filter(i => i.type === (t.issueType || "noindex_detected"));
      if (found.length === 0) return { triggered: false };
      return { triggered: true, context: { url: found[0].url || clientId, issueType: t.issueType, issues: found.slice(0, 3) } };
    }

    case "keyword_new_ranking": {
      if (rankHistory.length < 2) return { triggered: false };
      const latest  = rankHistory[0]?.keywords || [];
      const prevKws = new Set((rankHistory[1]?.keywords || []).map(k => k.keyword));
      const newKws  = latest.filter(k => !prevKws.has(k.keyword) && k.position <= (t.maxPosition || 50));
      if (newKws.length === 0) return { triggered: false };
      return { triggered: true, context: { keyword: newKws[0].keyword, position: newKws[0].position, count: newKws.length } };
    }

    default:
      return { triggered: false };
  }
}

// ── Execute rule actions ──────────────────────────────────────────────────────
async function executeRuleActions(rule, context, clientId, uid) {
  for (const action of (rule.actions || [])) {
    try {
      const msg = interpolate(action.message || action.body || "", context);

      switch (action.type) {
        case "create_alert":
          await db.collection("alerts").add({
            clientId, type: rule.id, tier: action.severity || "P3",
            message: msg, source: "rules_engine",
            ruleId: rule.id, resolved: false, createdAt: FieldValue.serverTimestamp(),
          });
          break;

        case "create_notification":
          await db.collection("notifications").add({
            clientId, uid,
            title:   interpolate(action.title || rule.name, context),
            body:    msg,
            type:    "rules_engine",
            ruleId:  rule.id,
            read:    false,
            createdAt: FieldValue.serverTimestamp(),
          });
          break;

        case "queue_agent":
          await db.collection("cmo_queue").add({
            clientId, agent: action.agent,
            reason:    interpolate(action.reason || "", context),
            source:    "rules_engine",
            ruleId:    rule.id,
            status:    "pending",
            createdAt: FieldValue.serverTimestamp(),
          });
          break;

        case "log_event":
          await db.collection("rule_fire_log").add({
            clientId, ruleId: rule.id, ruleName: rule.name,
            message: msg, firedAt: FieldValue.serverTimestamp(),
          });
          break;
      }
    } catch (e) {
      console.error(`[rulesEngine] Action ${action.type} failed:`, e.message);
    }
  }
}

// ── String interpolation for rule messages ────────────────────────────────────
function interpolate(template, context = {}) {
  if (!template) return "";
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = context[key];
    return val != null ? String(val) : `{{${key}}}`;
  });
}

// ── Ownership helper ─────────────────────────────────────────────────────────
async function getClientDoc(clientId, uid) {
  const doc = await db.collection("clients").doc(clientId).get();
  if (!doc.exists)              throw { code: 404, message: "Client not found" };
  if (doc.data().ownerId !== uid) throw { code: 403, message: "Access denied" };
  return doc;
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /:clientId — list rules + last fire times
router.get("/:clientId", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { clientId } = req.params;

    // Get any custom/override rules
    const customSnap = await db.collection("client_rules")
      .where("clientId", "==", clientId)
      .get().catch(() => null);
    const customRules = customSnap ? customSnap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
    const customIds   = new Set(customRules.map(r => r.id));

    // Merge defaults with custom
    const allRules = [
      ...DEFAULT_RULES.filter(r => !customIds.has(r.id)).map(r => ({ ...r, source: "default" })),
      ...customRules.map(r => ({ ...r, source: "custom" })),
    ];

    // Get last 5 fire events
    const logSnap = await db.collection("rule_fire_log")
      .where("clientId", "==", clientId)
      .limit(20)
      .get().catch(() => null);
    const recentFires = logSnap
      ? logSnap.docs.map(d => d.data()).sort((a, b) => (b.firedAt?.seconds || 0) - (a.firedAt?.seconds || 0)).slice(0, 10)
      : [];

    return res.json({ rules: allRules, recentFires, defaultRuleCount: DEFAULT_RULES.length });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// POST /:clientId/evaluate — manually trigger evaluation
router.post("/:clientId/evaluate", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const result = await evaluateRules(req.params.clientId, req.uid);
    return res.json({ success: true, ...result });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// POST /:clientId/rules — create custom rule
router.post("/:clientId/rules", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { name, description, trigger, actions } = req.body;
    if (!name || !trigger || !actions) return res.status(400).json({ error: "name, trigger, actions required" });

    const ref = db.collection("client_rules").doc();
    const rule = {
      id: ref.id, clientId: req.params.clientId,
      name, description: description || "", trigger, actions,
      enabled: true, source: "custom",
      createdAt: FieldValue.serverTimestamp(),
    };
    await ref.set(rule);
    return res.json({ success: true, rule });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// PUT /:clientId/rules/:ruleId — update rule (enable/disable/edit)
router.put("/:clientId/rules/:ruleId", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { ruleId, clientId } = req.params;
    const updates = req.body;

    // Check if it's a default rule being overridden
    const isDefault = DEFAULT_RULES.some(r => r.id === ruleId);
    if (isDefault) {
      // Create an override in client_rules
      const ref = db.collection("client_rules").doc(ruleId);
      const existing = DEFAULT_RULES.find(r => r.id === ruleId);
      await ref.set({ ...existing, ...updates, clientId, id: ruleId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    } else {
      const ref = db.collection("client_rules").doc(ruleId);
      await ref.update({ ...updates, updatedAt: FieldValue.serverTimestamp() });
    }
    return res.json({ success: true });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// GET /:clientId/log — rule fire history
router.get("/:clientId/log", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const snap = await db.collection("rule_fire_log")
      .where("clientId", "==", req.params.clientId)
      .limit(50)
      .get();
    const log = snap.docs.map(d => d.data()).sort((a, b) => (b.firedAt?.seconds || 0) - (a.firedAt?.seconds || 0));
    return res.json({ log });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

module.exports = router;
module.exports.evaluateRules = evaluateRules;
module.exports.DEFAULT_RULES = DEFAULT_RULES;
