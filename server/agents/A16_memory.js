/**
 * A16 — Client AI Memory Agent — Level 3 (Learn)
 *
 * Builds and maintains a per-client AI memory that improves over time.
 * Runs after each pipeline completion and after each fix push.
 *
 * What it does:
 *   1. Initializes memory from brief + audit on first run
 *   2. Updates memory with latest SEO score and issue resolution progress
 *   3. Records what content has been published (prevents duplicate briefs)
 *   4. Enriches A12 fix generation with historical context
 *   5. Tracks which fix types actually improved rankings (from push log)
 *
 * The memory is used by:
 *   - A12 (auto-fix): better contextual fixes based on business history
 *   - A14 (content): avoids duplicate topics, uses correct tone
 *   - A15 (competitor): enriches counter-content with business context
 *   - ROI Tracker: correlates fixes with ranking changes
 */
const { db, FieldValue }  = require("../config/firebase");
const { getState, saveState } = require("../shared-state/stateManager");
const {
  getMemory,
  initMemory,
  updateMemorySection,
  recordFixOutcome,
} = require("../utils/memory");

/**
 * Run A16 memory update for a client
 * Called after pipeline completes and after each fix push
 *
 * @param {string} clientId
 * @param {object} keys — not used directly, but part of standard agent signature
 */
async function runA16(clientId, keys) {
  try {
  const brief    = await getState(clientId, "A1_brief");
  const audit    = await getState(clientId, "A2_audit");
  const keywords = await getState(clientId, "A3_keywords");
  const onpage   = await getState(clientId, "A6_onpage");
  const rankings = await getState(clientId, "A10_rankings");

  if (!brief?.websiteUrl) return { success: false, error: "A1 brief not found" };

  // ── Step 1: Initialize memory if this is the first run ───────────────────
  let memory = await getMemory(clientId);
  if (!memory) {
    memory = await initMemory(clientId, brief, audit, keywords);
  }

  // ── Step 2: Update SEO progress ──────────────────────────────────────────
  const clientDoc  = await db.collection("clients").doc(clientId).get();
  const clientData = clientDoc.exists ? clientDoc.data() : {};
  const currentScore = clientData.seoScore || audit?.score || null;

  if (currentScore !== null) {
    const scoreHistory = memory.seoProgress?.scoreHistory || [];
    const lastEntry    = scoreHistory[scoreHistory.length - 1];

    // Only add if score changed or no history exists
    if (!lastEntry || lastEntry.score !== currentScore) {
      await updateMemorySection(clientId, "seoProgress", {
        lastScore:    currentScore,
        scoreHistory: [...scoreHistory, { score: currentScore, date: new Date().toISOString() }].slice(-20), // keep last 20
        totalIssuesFound: (audit?.issues?.p1?.length || 0) + (audit?.issues?.p2?.length || 0) + (audit?.issues?.p3?.length || 0),
      });
    }
  }

  // ── Step 3: Record completed fixes from approval_queue ───────────────────
  const pushedSnap = await db.collection("approval_queue")
    .where("clientId", "==", clientId)
    .where("status",   "==", "pushed")
    .get();

  const pushedFixes = pushedSnap.docs.map(d => d.data());
  const fixTypes    = [...new Set(pushedFixes.map(f => f.issueType).filter(Boolean))];

  if (fixTypes.length > 0) {
    const existing = memory.seoProgress?.topIssuesFixed || [];
    const combined = [...new Set([...existing, ...fixTypes])];
    await updateMemorySection(clientId, "seoProgress", {
      topIssuesFixed: combined.slice(-50), // keep last 50
    });
  }

  // ── Step 4: Import GSC-verified outcomes from fix_verification ──────
  // The daily cron (index.js) checks GSC 21 days after each push.
  // A16 reads those verified outcomes and records them to client_memory.
  // This replaces the old heuristic (A10 ranking gains).
  try {
    const verifiedSnap = await db.collection("fix_verification")
      .where("clientId", "==", clientId)
      .where("status", "==", "checked")
      .limit(50)
      .get();

    const memRef  = db.collection("client_memory").doc(clientId);
    const memSnap = await memRef.get();
    const existingOutcomes = memSnap.exists ? (memSnap.data().fixOutcomes || []) : [];
    const recordedUrls = new Set(existingOutcomes.map(o => `${o.field}:${o.url}:${o.checkedAt}`));

    let newOutcomes = 0;
    for (const doc of verifiedSnap.docs) {
      const v = doc.data();
      const key = `${v.field}:${v.wpPostUrl}:${v.checkedAt}`;
      if (recordedUrls.has(key)) continue; // already imported

      await recordFixOutcome(clientId, {
        field:     v.field      || v.issueType,
        issueType: v.issueType  || v.field,
        outcome:   v.outcome,
        url:       v.wpPostUrl  || null,
        checkedAt: v.checkedAt,
      });
      newOutcomes++;

      // Also update wp_push_log if approval matches
      if (v.approvalId) {
        try {
          const logSnap = await db.collection("wp_push_log")
            .where("clientId", "==", clientId)
            .where("approvalId", "==", v.approvalId)
            .limit(1)
            .get();
          if (!logSnap.empty) {
            await db.collection("wp_push_log").doc(logSnap.docs[0].id).update({
              rankingAfter: v.outcome,
              outcomeAssessedAt: v.checkedAt,
            });
          }
        } catch { /* non-blocking */ }
      }
    }
    if (newOutcomes > 0) console.log(`[A16] Imported ${newOutcomes} verified fix outcomes for ${clientId}`);
  } catch (e) {
    console.error(`[A16] Fix verification import error:`, e.message);
  }

  // ── Step 5: Update content memory with published drafts ──────────────────
  const publishedDrafts = await db.collection("content_drafts")
    .where("clientId", "==", clientId)
    .where("status",   "==", "published")
    .get();

  if (publishedDrafts.size > 0) {
    const topics = publishedDrafts.docs.map(d => ({
      topic:   d.data().title,
      keyword: d.data().keyword,
      date:    d.data().publishedAt?.toDate?.()?.toISOString?.() || null,
    }));

    await updateMemorySection(clientId, "contentMemory", {
      topicsPublished: topics.slice(-30),
    });
  }

  // ── Step 6: Update preferences based on patterns ─────────────────────────
  // If client has approved many fixes in a specific area, learn that focus preference
  const approvedTypes = pushedFixes.map(f => f.issueType);
  const focusAreaCounts = approvedTypes.reduce((acc, t) => {
    const area = getFixArea(t);
    acc[area] = (acc[area] || 0) + 1;
    return acc;
  }, {});

  const topFocusAreas = Object.entries(focusAreaCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([area]) => area);

  if (topFocusAreas.length > 0) {
    await updateMemorySection(clientId, "preferences", {
      focusAreas: topFocusAreas,
    });
  }

  const result = {
    status:          "complete",
    memoryUpdated:   true,
    fixesTracked:    fixTypes.length,
    draftsTracked:   publishedDrafts.size,
    currentScore,
    updatedAt:       new Date().toISOString(),
    summary:         `Memory updated. Score: ${currentScore}/100. ${fixTypes.length} fix type(s) recorded. Focus: ${topFocusAreas.join(", ") || "general"}.`,
  };

  await saveState(clientId, "A16_memory", result);
  return { success: true, ...result };
  } catch (e) {
    console.error(`[A16] Memory update failed for ${clientId}:`, e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Map issue types to high-level focus areas for learning
 */
function getFixArea(issueType) {
  const map = {
    title_tag: "on-page", missing_title: "on-page", short_title: "on-page", long_title: "on-page",
    meta_description: "on-page", missing_meta_desc: "on-page",
    missing_h1: "on-page", multiple_h1: "on-page",
    missing_canonical: "technical", canonical_tag: "technical",
    no_viewport: "technical", slow_response_time: "technical", redirect_chain: "technical",
    missing_schema: "schema", missing_sitemap: "technical",
    thin_content: "content", content_gap: "content", keyword_cannibalization: "content",
    low_internal_links: "linking", broken_internal_link: "linking",
    citation_missing: "local", gmb_not_optimized: "local",
  };
  return map[issueType] || "general";
}

module.exports = { runA16 };
