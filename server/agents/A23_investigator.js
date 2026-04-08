/**
 * A23 — Alert Investigator Agent
 *
 * When a P1 alert is detected (by A9 or the daily cron), this agent:
 *   1. Loads all relevant pipeline states
 *   2. Diagnoses root cause: technical change? competitor? CWV? content gap?
 *   3. Proposes a specific fix (not just "run A2 again")
 *   4. Creates an approval_queue item with the proposed fix + one-click approve
 *   5. Sends a notification via A18 (email/in-app): "Page dropped — here's why + fix. Approve?"
 *
 * Called from: server/index.js daily cron after checkAlerts(), or on-demand via API.
 * Returns: { success, investigation[], approvalIds[] }
 */

const { saveState, getState } = require("../shared-state/stateManager");
const { callLLM, parseJSON }  = require("../utils/llm");
const { db, FieldValue }      = require("../config/firebase");

async function runA23(clientId, keys, { alertIds = null } = {}) {
  const brief      = await getState(clientId, "A1_brief").catch(() => null);
  if (!brief) return { success: false, error: "No brief — run A1 first" };

  // ── Load all relevant data in parallel ─────────────
  const [audit, technical, rankings, competitor, report, onpage] = await Promise.all([
    getState(clientId, "A2_audit").catch(() => null),
    getState(clientId, "A7_technical").catch(() => null),
    getState(clientId, "A10_rankings").catch(() => null),
    getState(clientId, "A4_competitor").catch(() => null),
    getState(clientId, "A9_report").catch(() => null),
    getState(clientId, "A6_onpage").catch(() => null),
  ]);

  // ── Fetch unresolved P1 alerts (or specific ones) ──
  let alertQuery = db.collection("alerts")
    .where("clientId", "==", clientId)
    .where("resolved", "==", false)
    .where("tier", "==", "P1");

  const alertSnap = await alertQuery.limit(10).get().catch(() => null);
  if (!alertSnap || alertSnap.empty) {
    return { success: true, investigation: [], message: "No unresolved P1 alerts" };
  }

  const p1Alerts = alertSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const investigations = [];
  const approvalIds    = [];

  for (const alert of p1Alerts) {
    // Skip if already being investigated (has an approval queue item)
    const existing = await db.collection("approval_queue")
      .where("clientId", "==", clientId)
      .where("alertId", "==", alert.id)
      .limit(1).get().catch(() => null);
    if (existing && !existing.empty) continue;

    // ── Diagnose root cause ────────────────────────────
    const diagnosis = await diagnoseAlert(alert, { audit, technical, rankings, competitor, report, onpage, brief });

    // ── Build proposed fix ─────────────────────────────
    const proposedFix = buildProposedFix(alert, diagnosis);

    // ── Create approval queue item ─────────────────────
    const approvalRef = db.collection("approval_queue").doc();
    await approvalRef.set({
      id:          approvalRef.id,
      clientId,
      alertId:     alert.id,
      type:        "investigation_fix",
      agent:       "A23",
      status:      "pending",
      priority:    "high",
      alert: {
        tier:    alert.tier,
        type:    alert.type,
        message: alert.message,
      },
      diagnosis: {
        rootCause:    diagnosis.rootCause,
        confidence:   diagnosis.confidence,
        evidence:     diagnosis.evidence,
        category:     diagnosis.category,
      },
      proposedFix: {
        action:          proposedFix.action,
        agent:           proposedFix.agent,
        rationale:       proposedFix.rationale,
        urgency:         proposedFix.urgency,
        estimatedImpact: proposedFix.estimatedImpact,
      },
      createdAt: new Date().toISOString(),
    });
    approvalIds.push(approvalRef.id);

    // ── Create in-app notification ─────────────────────
    await db.collection("notifications").add({
      clientId,
      ownerId:   brief.ownerId || null,
      type:      "investigation",
      title:     `P1 Alert Diagnosed — Action Required`,
      body:      `${alert.type.replace(/_/g, " ")}: ${diagnosis.rootCause}`,
      fix:       proposedFix.action,
      approvalId: approvalRef.id,
      read:      false,
      createdAt: new Date().toISOString(),
    }).catch(() => {});

    // ── Notify via email (A18) — non-blocking ──────────
    try {
      const { notifyInvestigationFix } = require("./A18_clientNotifier");
      await notifyInvestigationFix(clientId, {
        alert,
        rootCause: diagnosis.rootCause,
        fix:       proposedFix.action,
        approvalId: approvalRef.id,
      });
    } catch { /* A18 is non-blocking */ }

    investigations.push({
      alertId:     alert.id,
      alertType:   alert.type,
      rootCause:   diagnosis.rootCause,
      confidence:  diagnosis.confidence,
      category:    diagnosis.category,
      proposedFix: proposedFix.action,
      approvalId:  approvalRef.id,
    });
  }

  const result = {
    success:      true,
    investigated: investigations.length,
    investigation: investigations,
    approvalIds,
    investigatedAt: new Date().toISOString(),
  };

  await saveState(clientId, "A23_investigation", result);
  return result;
}

// ── Rule-based root cause diagnosis ──────────────────
function diagnoseAlert(alert, { audit, technical, rankings, competitor, report, brief }) {
  const type = alert.type || "";

  // ── Ranking drop alerts ────────────────────────────
  if (type === "ranking_drop" || type.includes("drop")) {
    const drops = rankings?.drops || [];
    const technical_degraded = technical?.summary?.mobileScore != null && technical.summary.mobileScore < 50;
    const newCompetitorPages = competitor?.monitorSummary?.newPagesFound > 0;
    const recentAuditIssues  = (audit?.issues?.p1 || []).length > 0;

    if (technical_degraded) {
      return {
        rootCause:  "CWV / PageSpeed degradation — mobile score below 50 is likely causing Google to demote pages in mobile-first indexing.",
        confidence: 0.85,
        category:   "technical",
        evidence:   [`Mobile score: ${technical.summary.mobileScore}/100`, "Below Google's 50-point threshold for mobile-first ranking"],
      };
    }
    if (newCompetitorPages) {
      return {
        rootCause:  `Competitor added ${competitor.monitorSummary.newPagesFound} new page(s) targeting overlapping keywords, pushing your pages down.`,
        confidence: 0.78,
        category:   "competitor",
        evidence:   [`${competitor.monitorSummary.newPagesFound} new competitor pages detected`, "Likely targeting same keywords"],
      };
    }
    if (recentAuditIssues) {
      return {
        rootCause:  `${(audit.issues.p1 || []).length} critical technical issues found in last audit — these may be blocking proper indexing.`,
        confidence: 0.9,
        category:   "technical",
        evidence:   (audit.issues.p1 || []).slice(0, 3).map(i => i.type),
      };
    }
    return {
      rootCause:  "Ranking drop detected — no single technical cause identified. May be an algorithm update or temporary fluctuation.",
      confidence: 0.5,
      category:   "algorithm",
      evidence:   drops.slice(0, 3).map(d => `${d.keyword}: pos ${d.prevPosition} → ${d.currentPosition}`),
    };
  }

  // ── Technical / performance alerts ────────────────
  if (type === "poor_mobile_performance" || type.includes("speed") || type.includes("cwv")) {
    const mobileScore = technical?.summary?.mobileScore;
    const lcp = technical?.metrics?.LCP || technical?.summary?.lcp;
    const cls = technical?.metrics?.CLS || technical?.summary?.cls;
    return {
      rootCause:  `PageSpeed is critically low (${mobileScore || "unknown"}/100). ${lcp ? `LCP: ${lcp}s` : ""}${cls ? `, CLS: ${cls}` : ""}. This directly impacts Core Web Vitals ranking factor.`,
      confidence: 0.95,
      category:   "technical",
      evidence:   [
        mobileScore ? `Mobile score: ${mobileScore}/100` : "Mobile score unavailable",
        lcp         ? `LCP: ${lcp}s (target <2.5s)` : null,
        cls         ? `CLS: ${cls} (target <0.1)` : null,
      ].filter(Boolean),
    };
  }

  // ── Missing critical on-page elements ─────────────
  if (type.includes("h1") || type.includes("title") || type.includes("meta") || type.includes("canonical")) {
    const affectedPages = (audit?.issues?.p1 || []).filter(i => i.type === type).length;
    return {
      rootCause:  `${affectedPages || "Multiple"} page(s) missing critical on-page element: ${type.replace(/_/g, " ")}. Affects how Google understands page content.`,
      confidence: 0.88,
      category:   "on_page",
      evidence:   [`Issue type: ${type}`, `Found in A2 audit as P1`, `Direct impact on keyword relevance signals`],
    };
  }

  // ── Low keyword visibility ─────────────────────────
  if (type === "low_keyword_visibility") {
    const notRanking = competitor?.summary?.notRanking || 0;
    const total      = (competitor?.rankingMatrix || []).length;
    return {
      rootCause:  `${notRanking} of ${total} tracked keywords not ranking. Site lacks content pages or authority for target keywords.`,
      confidence: 0.75,
      category:   "content_gap",
      evidence:   [`${notRanking}/${total} keywords unranked`, "Competitor analysis shows content gaps", "New pages or link building needed"],
    };
  }

  // ── Default ───────────────────────────────────────
  return {
    rootCause:  alert.message || "Issue detected — manual investigation recommended.",
    confidence: 0.5,
    category:   "unknown",
    evidence:   [alert.fix || "See original alert for suggested fix"],
  };
}

// ── Build specific proposed fix ───────────────────────
function buildProposedFix(alert, diagnosis) {
  const cat = diagnosis.category;

  if (cat === "technical") {
    if (alert.type === "poor_mobile_performance" || alert.type?.includes("speed")) {
      return {
        action:          "Run A7 Technical Agent to get exact speed fixes (image compression, render-blocking scripts, server response). Then use A13 to push fixes.",
        agent:           "A7",
        rationale:       diagnosis.rootCause,
        urgency:         "critical",
        estimatedImpact: "+10-30% mobile traffic in 4-8 weeks after fixes applied",
      };
    }
    return {
      action:          "Re-run A2 Technical Audit to get fresh issue list, then A6 On-Page to fix critical elements. Use A13 to autopush approved fixes.",
      agent:           "A2",
      rationale:       diagnosis.rootCause,
      urgency:         "critical",
      estimatedImpact: "Unlock indexing + ranking recovery within 2-4 weeks",
    };
  }

  if (cat === "competitor") {
    return {
      action:          "Run A11 Link Building Agent to find link opportunities for the affected pages. Also run A5 to refresh content on pages that competitors are outranking.",
      agent:           "A11",
      rationale:       diagnosis.rootCause,
      urgency:         "high",
      estimatedImpact: "+5-15 position improvement within 4-8 weeks with 3+ new links",
    };
  }

  if (cat === "on_page") {
    return {
      action:          "Run A6 On-Page Agent to fix missing tags, then use A13 to push approved fixes to WordPress automatically.",
      agent:           "A6",
      rationale:       diagnosis.rootCause,
      urgency:         "high",
      estimatedImpact: "Improved keyword relevance signals — ranking improvement in 2-4 weeks",
    };
  }

  if (cat === "content_gap") {
    return {
      action:          "Run A5 Content Agent + A14 Content Autopilot to create pages targeting unranked keywords. Focus on the top 5 opportunity keywords first.",
      agent:           "A14",
      rationale:       diagnosis.rootCause,
      urgency:         "medium",
      estimatedImpact: "New keyword rankings in 6-12 weeks after content published",
    };
  }

  return {
    action:          alert.fix || "Run full pipeline re-analysis to identify root cause.",
    agent:           "A2",
    rationale:       "No clear root cause identified — full re-analysis recommended.",
    urgency:         "medium",
    estimatedImpact: "Diagnostic output will guide next steps",
  };
}

module.exports = { runA23 };
