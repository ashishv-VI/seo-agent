/**
 * A14 — Content Autopilot Agent — Level 2 (Act)
 *
 * Finds high-value keyword opportunities that have no existing page,
 * generates a full SEO-optimized article using AI, and creates it as a
 * WordPress draft ready for the agency to review and publish.
 *
 * Pipeline:
 *   1. Read A3 keyword map → find "content gap" keywords (no suggestedPage match in WP)
 *   2. For each gap keyword → AI writes full article (title, intro, sections, FAQs, conclusion)
 *   3. Push to WordPress as draft
 *   4. Save to `content_drafts` Firestore collection for tracking
 *   5. Notify via task queue item
 */
const { db, FieldValue }      = require("../config/firebase");
const { getState, saveState } = require("../shared-state/stateManager");
const { callLLM, parseJSON }  = require("../utils/llm");
const wp                       = require("../utils/wpConnector");

/**
 * Run A14 content autopilot
 * @param {string} clientId
 * @param {object} keys — LLM keys (Groq/Gemini required)
 * @param {number} maxArticles — max articles to generate in one run (default 3)
 */
async function runA14(clientId, keys, maxArticles = 3) {
  try {
  if (!keys?.groq && !keys?.gemini) {
    return { success: false, error: "LLM key required (Groq or Gemini) — add in Settings" };
  }

  // Load client data
  const clientDoc = await db.collection("clients").doc(clientId).get();
  if (!clientDoc.exists) return { success: false, error: "Client not found" };

  const clientData = clientDoc.data();
  const wpInt      = clientData.wpIntegration;

  if (!wpInt?.connected) {
    return { success: false, error: "WordPress not connected — connect in Integrations tab first" };
  }

  const brief    = await getState(clientId, "A1_brief");
  const keywords = await getState(clientId, "A3_keywords");

  if (!brief?.websiteUrl)  return { success: false, error: "A1 brief not found" };
  if (!keywords?.keywordMap) return { success: false, error: "A3 keywords not found — run keyword research first" };

  // Get existing WP pages to detect content gaps
  let wpPages = [];
  try {
    wpPages = await wp.getPages(wpInt.url, wpInt.username, wpInt.appPassword);
  } catch (e) {
    return { success: false, error: `Could not fetch WP pages: ${e.message}` };
  }

  // Get categories for assigning to new posts
  let categories = [];
  try {
    categories = await wp.getCategories(wpInt.url, wpInt.username, wpInt.appPassword);
  } catch { /* non-blocking */ }

  // Build set of existing content (by slug + title words)
  const existingContent = new Set();
  wpPages.forEach(p => {
    existingContent.add(p.slug.toLowerCase());
    p.title.toLowerCase().split(/\s+/).forEach(w => { if (w.length > 4) existingContent.add(w); });
  });

  // Build kill-signal set — keywords A3 flagged as 90+ days ranked, 0 leads
  const killSet = new Set(
    (keywords.keywordMap || [])
      .filter(kw => kw.killSignal === true || kw.priority === "low")
      .map(kw => kw.keyword.toLowerCase().trim())
  );

  // Find content gap keywords (high priority, no matching page, not kill-signalled)
  const gapKeywords = (keywords.keywordMap || [])
    .filter(kw => {
      if (kw.priority !== "high") return false;
      if (killSet.has(kw.keyword.toLowerCase().trim())) return false;
      const kwWords = kw.keyword.toLowerCase().split(/\s+/);
      // Check if any existing page already covers this keyword
      const covered = wpPages.some(p => {
        const pageText = (p.title + " " + p.slug).toLowerCase();
        return kwWords.every(w => pageText.includes(w));
      });
      return !covered;
    })
    .slice(0, maxArticles);

  // ── Also pull queued content_drafts from A15 counter-content ──
  // A15 writes status="queued" items when it detects high-priority competitor content.
  // These are pre-made briefs that don't need gap detection — just generation.
  let queuedBriefs = [];
  try {
    const queuedSnap = await db.collection("content_drafts")
      .where("clientId", "==", clientId)
      .where("status", "==", "queued")
      .limit(maxArticles)
      .get();
    queuedBriefs = queuedSnap.docs.map(d => ({
      docId:   d.id,
      keyword: d.data().keyword,
      intent:  d.data().intent || "informational",
      difficulty: "medium",
      source:  d.data().sourceAgent || "A15",
    }));
  } catch { /* non-blocking */ }

  // Merge: queued briefs first (they're time-sensitive competitive responses), then gap keywords
  const remainingSlots = maxArticles - queuedBriefs.length;
  const allKeywords = [
    ...queuedBriefs,
    ...(remainingSlots > 0 ? gapKeywords.slice(0, remainingSlots) : []),
  ];

  if (allKeywords.length === 0) {
    return {
      success: true,
      created: 0,
      message: "No content gaps found — all high-priority keywords already have matching pages",
    };
  }

  const created  = [];
  const failed   = [];

  for (const kwData of allKeywords) {
    const keyword = kwData.keyword;

    // Mark queued drafts as in-progress so they don't get picked up twice
    if (kwData.docId) {
      await db.collection("content_drafts").doc(kwData.docId).update({ status: "generating" }).catch(() => {});
    }

    try {
      // ── Step 1: Generate full article with AI ─────────────────────────────
      const articlePrompt = `You are a senior SEO content writer. Write a comprehensive, SEO-optimized blog post.

Business: ${brief.businessName}
Website: ${brief.websiteUrl}
Industry: ${brief.industry || "General"}
Services: ${(brief.services || []).join(", ")}
Location: ${(brief.targetLocations || []).join(", ")}
Target Keyword: "${keyword}"
Search Intent: ${kwData.intent || "informational"}
Keyword Difficulty: ${kwData.difficulty || "medium"}

Write a complete blog post that will rank for "${keyword}". Include:
1. An SEO-optimized H1 title (not the same as the focus keyword — more compelling)
2. A compelling introduction (150 words) that hooks the reader and mentions the keyword naturally
3. 4-6 main sections with H2 headings (use keyword variations and related terms)
4. Each section has 150-250 words of high-quality, specific content
5. A FAQ section with 3-4 relevant questions and answers
6. A conclusion with a call-to-action relevant to ${brief.businessName}
7. Natural keyword usage throughout (never keyword stuffing)

Return ONLY valid JSON:
{
  "title": "The H1 title (compelling, keyword-rich, under 65 chars)",
  "seoTitle": "The SEO title tag (60 chars max, keyword first)",
  "metaDescription": "The meta description (150-155 chars, includes keyword, has CTA)",
  "focusKeyphrase": "${keyword}",
  "slug": "url-friendly-slug-from-title",
  "excerpt": "2-sentence teaser for archive/social (under 160 chars)",
  "content": "Full WordPress HTML content using <h2>, <h3>, <p>, <ul>, <strong> tags",
  "estimatedWordCount": 1200,
  "targetKeywords": ["primary keyword", "secondary keyword 1", "secondary keyword 2"]
}`;

      const response = await callLLM(articlePrompt, keys, {
        maxTokens:    4000,
        temperature:  0.4,
        model:        "llama-3.1-70b-versatile", // use larger model for content
      });

      const article = parseJSON(response);

      // Validate required fields
      if (!article.title || !article.content) {
        throw new Error("AI response missing title or content");
      }

      // ── Step 2: Push to WordPress as draft ───────────────────────────────
      // Find best matching category
      const categoryId = categories.length > 0 ? [categories[0].id] : [];

      const wpResult = await wp.createPost(wpInt.url, wpInt.username, wpInt.appPassword, {
        title:           article.title,
        content:         article.content,
        excerpt:         article.excerpt        || "",
        slug:            article.slug           || "",
        metaDescription: article.metaDescription || "",
        focusKeyphrase:  article.focusKeyphrase  || keyword,
        seoTitle:        article.seoTitle        || article.title,
        categories:      categoryId,
        status:          "draft",
      });

      // ── Step 3: Save to content_drafts for tracking ──────────────────────
      // If this came from a queued A15 counter-content brief, update the
      // existing doc instead of creating a duplicate.
      const draftRef = kwData.docId
        ? db.collection("content_drafts").doc(kwData.docId)
        : db.collection("content_drafts").doc();
      const draftData = {
        id:              draftRef.id,
        clientId,
        keyword,
        intent:          kwData.intent     || "informational",
        difficulty:      kwData.difficulty || null,
        title:           article.title,
        seoTitle:        article.seoTitle  || article.title,
        metaDescription: article.metaDescription || "",
        focusKeyphrase:  keyword,
        slug:            article.slug      || "",
        excerpt:         article.excerpt   || "",
        wordCount:       article.estimatedWordCount || null,
        targetKeywords:  article.targetKeywords || [keyword],
        wpPostId:        wpResult.postId,
        wpEditUrl:       wpResult.editUrl,
        wpStatus:        "draft",
        status:          "draft",   // draft | published | archived
        generatedBy:     "A14_contentAutopilot",
        createdAt:       FieldValue.serverTimestamp(),
        publishedAt:     null,
      };
      await (kwData.docId ? draftRef.update(draftData) : draftRef.set(draftData));

      created.push({
        keyword,
        title:      article.title,
        wpPostId:   wpResult.postId,
        wpEditUrl:  wpResult.editUrl,
        draftId:    draftRef.id,
      });

    } catch (e) {
      failed.push({ keyword, error: e.message });
    }
  }

  // Save summary to state
  const summary = {
    status:    "complete",
    created:   created.length,
    failed:    failed.length,
    articles:  created,
    generatedAt: new Date().toISOString(),
  };
  await saveState(clientId, "A14_contentAutopilot", summary);

  return {
    success: true,
    created: created.length,
    failed:  failed.length,
    articles: created,
    message: `Created ${created.length} draft article(s) in WordPress`,
  };
  } catch (e) {
    console.error(`[A14] Content autopilot failed for ${clientId}:`, e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Get all content drafts for a client
 */
async function getContentDrafts(clientId) {
  const snap = await db.collection("content_drafts")
    .where("clientId", "==", clientId)
    .get();

  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?._seconds || 0) - (a.createdAt?._seconds || 0));
}

/**
 * Mark a content draft as published
 */
async function markDraftPublished(draftId, wpPostId) {
  await db.collection("content_drafts").doc(draftId).update({
    status:      "published",
    wpStatus:    "publish",
    wpPostId:    wpPostId || null,
    publishedAt: FieldValue.serverTimestamp(),
  });
}

module.exports = { runA14, getContentDrafts, markDraftPublished };
