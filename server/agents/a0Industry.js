/**
 * A0 Industry & Competition Intelligence — extracted from A0_orchestrator.js
 * (Sprint 1, Story M5).
 *
 * LAYER 1 — pure helpers that classify the client before any agent runs:
 *   - detectIndustry(brief)                 — business type, YMYL flag, E-E-A-T + AI-Overview risk
 *   - estimateCompetition(brief, auditState) — competition posture from audit score
 *
 * Both are pure functions: no I/O, no LLM, no Firestore, no module-level state —
 * they read only their arguments. Moved verbatim from A0_orchestrator.js;
 * behaviour is unchanged.
 */

"use strict";

// ══════════════════════════════════════════════════════════════════════════════
// LAYER 1 — INDUSTRY & COMPETITION INTELLIGENCE
// Detect what type of business this is and calibrate strategy accordingly
// ══════════════════════════════════════════════════════════════════════════════
function detectIndustry(brief) {
  const text = [
    brief.businessDescription || "",
    (brief.services || []).join(" "),
    brief.website || "",
    brief.name || "",
  ].join(" ").toLowerCase();

  const ymylSignals = [
    "health", "medical", "doctor", "clinic", "hospital", "pharmacy",
    "legal", "lawyer", "solicitor", "barrister", "law firm",
    "finance", "financial", "investment", "bank", "insurance", "mortgage",
    "mental health", "therapy", "therapist", "dental", "dentist",
  ];
  const isYMYL = ymylSignals.some(k => text.includes(k));

  let type = "general";
  if (/shop|store|buy|cart|checkout|product|ecommerce|woocommerce|shopify|magento/.test(text)) type = "ecommerce";
  else if (/restaurant|cafe|food|menu|delivery|takeaway|cuisine|dining/.test(text)) type = "restaurant";
  else if (/hotel|accommodation|booking|airbnb|resort|b&b|guesthouse/.test(text)) type = "hospitality";
  else if (/saas|software|app|platform|tool|api|integration|dashboard|subscription/.test(text)) type = "saas";
  else if (/agency|marketing|seo|digital|advertising|branding|creative/.test(text)) type = "agency";
  else if (/real estate|property|homes|mortgage|letting|estate agent|realtor/.test(text)) type = "real_estate";
  else if (/school|university|college|education|course|training|learning|tutoring/.test(text)) type = "education";
  else if (/news|media|magazine|journal|press|publication/.test(text)) type = "media";
  else if (/affiliate|review|comparison|best.*for|vs\s/.test(text)) type = "affiliate";
  else if (isYMYL) type = "ymyl";

  const eeeatRequirement = isYMYL ? "CRITICAL — author credentials and medical/legal review dates mandatory" : "Standard";
  const aiOverviewRisk   = ["general", "education", "media"].includes(type) ? "HIGH — informational content vulnerable to zero-click" : "MEDIUM";

  return { type, ymyl: isYMYL, eeeatRequirement, aiOverviewRisk };
}

function estimateCompetition(brief, auditState) {
  const score = auditState?.score || 0;
  if (score > 70) return "established — focus on authority gaps and competitor content gaps";
  if (score > 40) return "moderate — technical fixes + content expansion both needed";
  return "new/weak site — start with technical foundation, then build content systematically";
}

module.exports = {
  detectIndustry,
  estimateCompetition,
};
