/**
 * chatContext — builds rich context string for AI chat from all agent states
 */
const { db } = require("../config/firebase");
const { getState } = require("../shared-state/stateManager");

async function buildChatContext(clientId) {
  const clientDoc = await db.collection("clients").doc(clientId).get();
  const client = clientDoc.data() || {};

  const stateNames = ["A1_brief","A2_audit","A3_keywords","A4_competitor","A5_content","A6_onpage","A7_technical","A8_geo","A9_report"];
  const states = {};
  for (const name of stateNames) {
    try { states[name] = await getState(clientId, name) || {}; } catch { states[name] = {}; }
  }

  const audit    = states.A2_audit    || {};
  const keywords = states.A3_keywords || {};
  const onpage   = states.A6_onpage   || {};
  const report   = states.A9_report   || {};
  const brief    = states.A1_brief    || {};

  return {
    business: {
      name:      client.name      || brief.businessName || "Unknown",
      website:   client.website   || brief.websiteUrl   || "Unknown",
      industry:  client.industry  || brief.industry     || "Unknown",
      location:  (client.targetLocations || brief.targetLocations || []).join(", ") || "Unknown",
      services:  (client.services || brief.services || []).join(", ") || "Unknown",
    },
    pipeline: {
      status: client.pipelineStatus || "idle",
      agents: client.agents || {},
    },
    seo: {
      healthScore:    audit.healthScore || 0,
      p1Count:        (audit.issues?.p1 || []).length,
      p2Count:        (audit.issues?.p2 || []).length,
      p3Count:        (audit.issues?.p3 || []).length,
      p1Issues:       (audit.issues?.p1 || []).slice(0,5).map(i => i.detail).filter(Boolean),
      topKeywords:    (keywords.keywordMap || []).slice(0,8).map(k => `${k.keyword} (${k.intent||"—"}, ${k.difficulty||"—"})`),
      contentGaps:    (keywords.gaps || []).slice(0,5).map(g => g.keyword),
      cannibalization:(keywords.cannibalization || []).length,
      titleTag:       onpage.serpPreview?.title || "Not set",
      metaDesc:       onpage.serpPreview?.desc  || "Not set",
      fixQueueCount:  (onpage.fixQueue || []).length,
      brokenLinks:    (audit.checks?.brokenLinks || []).length,
      internalLinks:  (onpage.internalLinks || []).length,
    },
    report: {
      verdict:     report.reportData?.verdict || null,
      next3Actions:(report.reportData?.next3Actions || []).map(a => a.action),
    },
  };
}

module.exports = { buildChatContext };
