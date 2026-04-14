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

  // ── Step 4: Record push log outcomes (did the fix improve rankings?) ──────
  const pushLogSnap = await db.collection("wp_push_log")
    .where("clientId", "==", clientId)
    .get();

  const pushLogs = pushLogSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Cross-reference with rankings to detect improvements
  if (rankings?.rankings && pushLogs.length > 0) {
    const rankMap = {};
    (rankings.rankings || []).forEach(r => { rankMap[r.keyword] = r.position; });

    for (const log of pushLogs) {
      // Only process logs that have a pushedAt date but no rankingAfter recorded yet
      if (log.rankingAfter !== null && !log.pushedAt) continue;

      // Find ranking changes for keywords related to this fix
      // We use a simple heuristic: check if any ranking improved since the push date
      const pushedDate = new Date(log.pushedAt);
      const daysSince  = (Date.now() - pushedDate.getTime()) / (1000 * 60 * 60 * 24);

      if (daysSince >= 7) { // Only assess after 7+ days
        const improvedKeywords = (rankings.gains || []).filter(g => {
          const gainDate = new Date(rankings.snapshotDate || "");
          return gainDate > pushedDate;
        });

        if (improvedKeywords.length > 0) {
          // Mark this fix as having a positive outcome
          await db.collection("wp_push_log").doc(log.id).update({
            rankingAfter:    "improved",
            outcomeAssessedAt: new Date().toISOString(),
          });

          await recordFixOutcome(clientId, {
            fixType:       log.field || log.issueType,
            appliedAt:     log.pushedAt,
            rankingBefore: log.rankingBefore,
            rankingAfter:  "improved",
            keyword:       log.keyword || null,
            worked:        true,
          });
        }
      }
    }
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
