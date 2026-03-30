/**
 * Client AI Memory Utility — Level 3 (Learn)
 *
 * Stores and retrieves per-client AI context memory.
 * Used by A12, A14, A16 to make smarter decisions over time.
 *
 * Firestore collection: client_memory
 * Document ID: clientId
 *
 * Structure:
 * {
 *   clientId,
 *   industry,
 *   businessContext: { services, locations, competitors, audience },
 *   seoProgress: { lastScore, scoreHistory, topIssuesFixed, keywordsRanking },
 *   contentMemory: { topicsPublished, topicsPerforming, topicsToAvoid },
 *   fixOutcomes: [{ fixType, appliedAt, rankingBefore, rankingAfter, worked }],
 *   competitorContext: { lastChecked, newPagesFound, contentGaps },
 *   preferences: { tone, contentLength, focusAreas },
 *   updatedAt
 * }
 */
const { db, FieldValue } = require("../config/firebase");

const COLLECTION = "client_memory";

/**
 * Get memory for a client
 * Returns null if no memory exists yet
 */
async function getMemory(clientId) {
  const doc = await db.collection(COLLECTION).doc(clientId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

/**
 * Initialize memory from A1 brief and A2 audit on first pipeline run
 * Called by A16_memory agent
 */
async function initMemory(clientId, brief, audit, keywords) {
  const existing = await getMemory(clientId);
  if (existing) return existing; // Already initialized

  const memory = {
    clientId,
    industry:        brief?.industry        || "general",
    businessContext: {
      name:        brief?.businessName      || null,
      website:     brief?.websiteUrl        || null,
      services:    brief?.services          || [],
      locations:   brief?.targetLocations   || [],
      competitors: brief?.competitors       || [],
      audience:    brief?.targetAudience    || [],
    },
    seoProgress: {
      initialScore:  audit?.score           || null,
      lastScore:     audit?.score           || null,
      scoreHistory:  audit?.score ? [{ score: audit.score, date: new Date().toISOString() }] : [],
      topIssuesFixed: [],
      totalIssuesFound: (audit?.issues || []).length,
    },
    contentMemory: {
      topicsPublished:   [],
      topicsPerforming:  [],
      topicsToAvoid:     [],
      totalKeywords:     keywords?.keywordMap?.length || 0,
    },
    fixOutcomes:         [],   // populated as fixes are pushed and results tracked
    competitorContext: {
      lastChecked:  null,
      competitors:  brief?.competitors || [],
      newPagesFound:[],
      contentGaps:  [],
    },
    preferences: {
      tone:          "professional",
      contentLength: "medium",  // short | medium | long
      focusAreas:    [],
    },
    createdAt:   new Date().toISOString(),
    updatedAt:   new Date().toISOString(),
  };

  await db.collection(COLLECTION).doc(clientId).set(memory);
  return memory;
}

/**
 * Update a specific memory section (merge, not overwrite)
 * @param {string} clientId
 * @param {string} section — e.g. "seoProgress", "contentMemory"
 * @param {object} updates — partial updates to merge into the section
 */
async function updateMemorySection(clientId, section, updates) {
  const ref     = db.collection(COLLECTION).doc(clientId);
  const doc     = await ref.get();
  const current = doc.exists ? (doc.data()[section] || {}) : {};
  const merged  = { ...current, ...updates };

  await ref.set({
    [section]:  merged,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}

/**
 * Record the outcome of a pushed fix (for learning + ROI)
 * Called when A10 ranking tracker detects changes after a fix
 *
 * @param {string} clientId
 * @param {object} outcome — { fixType, appliedAt, rankingBefore, rankingAfter, keyword, worked }
 */
async function recordFixOutcome(clientId, outcome) {
  const ref = db.collection(COLLECTION).doc(clientId);
  await ref.set({
    fixOutcomes: FieldValue.arrayUnion({
      ...outcome,
      recordedAt: new Date().toISOString(),
    }),
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}

/**
 * Add a published content topic to memory
 * Prevents A14 from generating duplicate content
 */
async function recordPublishedTopic(clientId, topic, keyword, wpPostId) {
  const ref = db.collection(COLLECTION).doc(clientId);
  await ref.set({
    "contentMemory.topicsPublished": FieldValue.arrayUnion({
      topic,
      keyword,
      wpPostId: wpPostId || null,
      date:     new Date().toISOString(),
    }),
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}

/**
 * Build a context string for LLM prompts
 * Summarizes what the AI knows about this client
 * Used by A12, A14 to make better decisions
 */
async function buildContextPrompt(clientId) {
  const mem = await getMemory(clientId);
  if (!mem) return "";

  const fixSuccesses = (mem.fixOutcomes || []).filter(o => o.worked === true);
  const topicsPublished = (mem.contentMemory?.topicsPublished || []).slice(-10).map(t => t.topic).join(", ");

  return `
CONTEXT FROM PREVIOUS SEO WORK FOR THIS CLIENT:
- Business: ${mem.businessContext?.name || "N/A"} (${mem.industry})
- Services: ${(mem.businessContext?.services || []).join(", ") || "N/A"}
- Locations: ${(mem.businessContext?.locations || []).join(", ") || "N/A"}
- Current SEO score: ${mem.seoProgress?.lastScore || "N/A"}/100
- Total issues fixed so far: ${(mem.seoProgress?.topIssuesFixed || []).length}
- Content already published: ${topicsPublished || "none yet"}
- Successful fix patterns: ${fixSuccesses.slice(-5).map(f => f.fixType).join(", ") || "none recorded yet"}
- Preferred tone: ${mem.preferences?.tone || "professional"}
`.trim();
}

module.exports = {
  getMemory,
  initMemory,
  updateMemorySection,
  recordFixOutcome,
  recordPublishedTopic,
  buildContextPrompt,
};
