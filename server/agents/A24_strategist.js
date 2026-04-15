/**
 * A24 — Goal Revision Strategist
 *
 * Runs monthly. Checks whether the client's primary KPI is on track toward
 * their declared goals. If not, it proposes a strategy change and feeds it
 * into the CMO decision loop.
 *
 * Inputs:
 *   - A1 brief (KPI selection, primaryKeywords, conversion goals, goals[])
 *   - A9 report (historical traffic, CTR, impressions)
 *   - score_history (30/60/90-day trend)
 *   - conversions collection (actual lead count)
 *
 * Output:
 *   - { onTrack, progress%, verdict, strategyChange, nextAgents[] }
 *   - If offTrack, writes a CMO queue item with the new strategy
 */
const { db, FieldValue }  = require("../config/firebase");
const { saveState, getState } = require("../shared-state/stateManager");

async function runA24(clientId, keys) {
  try {
    const brief  = await getState(clientId, "A1_brief").catch(() => null);
    const report = await getState(clientId, "A9_report").catch(() => null);
    const baseline = await getState(clientId, "baseline").catch(() => null);

    if (!brief) return { success: false, error: "No brief" };

    const kpis = [].concat(brief.kpiSelection || ["Organic Traffic Growth"]);
    const primaryKpi = kpis[0] || "Organic Traffic Growth";

    // Pull 90 days of score history
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const scoreSnap = await db.collection("score_history")
      .where("clientId", "==", clientId)
      .where("capturedAt", ">=", ninetyDaysAgo)
      .get()
      .catch(() => ({ docs: [] }));
    const scoreHistory = scoreSnap.docs.map(d => d.data()).sort((a, b) => (a.capturedAt || "").localeCompare(b.capturedAt || ""));

    // Compute 90-day score delta
    const firstScore = scoreHistory[0]?.overall || baseline?.seoScore || null;
    const latestScore = scoreHistory[scoreHistory.length - 1]?.overall || null;
    const scoreDelta  = (firstScore != null && latestScore != null) ? latestScore - firstScore : null;

    // Pull conversions for last 90 days
    const convSnap = await db.collection("conversions")
      .where("clientId", "==", clientId)
      .where("submittedAt", ">=", ninetyDaysAgo)
      .get()
      .catch(() => ({ docs: [] }));
    const leads90d = convSnap.docs.length;

    // KPI-specific checks
    let onTrack = true;
    let progress = 0;
    let verdict  = "on track";
    let strategyChange = null;
    let nextAgents = [];

    if (primaryKpi === "Lead Generation" || primaryKpi === "Online Sales / E-commerce") {
      // Target: growing leads month-over-month
      if (leads90d < 3) {
        onTrack = false;
        verdict = `Only ${leads90d} lead(s) in 90 days — lead-gen KPI is OFF TRACK`;
        // Pivot strategy: conversion optimization + content refresh on high-intent pages
        strategyChange = "Pivot to conversion-first: run A19 CRO, refresh top 3 landing pages, build lead-magnet content";
        nextAgents = ["A19", "A6", "A14"];
      } else if (leads90d < 10) {
        progress = Math.round((leads90d / 10) * 100);
        verdict = `${leads90d} leads in 90 days — below target, but growing`;
      } else {
        progress = 100;
      }
    } else if (primaryKpi === "Organic Traffic Growth") {
      // Target: score improving by at least 5 pts every 90 days
      if (scoreDelta != null) {
        if (scoreDelta < 0) {
          onTrack = false;
          verdict = `SEO score dropped ${Math.abs(scoreDelta)} pts over 90 days — traffic KPI is OFF TRACK`;
          strategyChange = "Diagnostic reset: re-audit site, re-check rankings, investigate ranking losses";
          nextAgents = ["A2", "A10", "A23"];
        } else if (scoreDelta < 5) {
          progress = Math.round((scoreDelta / 5) * 100);
          verdict = `Score up ${scoreDelta} pts in 90 days — below 5-pt target`;
        } else {
          progress = 100;
        }
      } else {
        verdict = "Insufficient score history (need 90 days)";
      }
    } else if (primaryKpi === "Local Visibility") {
      // Target: rank tracking for local keywords
      const rankings = await getState(clientId, "A10_rankings").catch(() => null);
      const localKws = (rankings?.keywords || []).filter(k => /near me|in \w+|local/i.test(k.keyword || ""));
      const topLocal = localKws.filter(k => (k.position || 99) <= 10).length;
      if (topLocal < 3) {
        onTrack = false;
        verdict = `Only ${topLocal} local keyword(s) in top 10 — local visibility KPI is OFF TRACK`;
        strategyChange = "Focus on local signals: rebuild GBP optimization, citations audit, NAP consistency";
        nextAgents = ["A8", "A11"];
      } else {
        progress = Math.round((topLocal / 10) * 100);
      }
    }

    const result = {
      status:        "complete",
      primaryKpi,
      onTrack,
      progress,
      verdict,
      scoreDelta,
      leads90d,
      strategyChange,
      nextAgents,
      evaluatedAt:   new Date().toISOString(),
    };

    // If off-track, write a CMO queue item so the next CMO run picks up the strategy change
    if (!onTrack && nextAgents.length > 0) {
      await db.collection("cmo_queue").add({
        clientId,
        source:     "A24_strategist",
        decision:   strategyChange,
        reasoning:  verdict,
        nextAgents,
        confidence: 0.85,
        kpiImpact:  [primaryKpi],
        status:     "pending",
        createdAt:  new Date().toISOString(),
      }).catch(() => {});

      // Notify the owner
      const clientDoc = await db.collection("clients").doc(clientId).get().catch(() => null);
      const ownerId   = clientDoc?.data()?.ownerId || null;
      const name      = clientDoc?.data()?.name    || "Unnamed";
      if (ownerId) {
        await db.collection("notifications").add({
          clientId,
          ownerId,
          type:      "goal_revision",
          title:     `Strategy revision for ${name}`,
          message:   `${verdict}. Proposed change: ${strategyChange}`,
          read:      false,
          createdAt: new Date().toISOString(),
        }).catch(() => {});
      }
    }

    await saveState(clientId, "A24_strategist", result);
    return { success: true, ...result };
  } catch (e) {
    console.error(`[A24] Strategist failed for ${clientId}:`, e.message);
    return { success: false, error: e.message };
  }
}

module.exports = { runA24 };
