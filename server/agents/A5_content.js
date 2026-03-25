const { saveState, getState } = require("../shared-state/stateManager");
const { callLLM, parseJSON }  = require("../utils/llm");
const { db, admin }           = require("../config/firebase");

/**
 * A5 — Content Optimisation Agent
 * Generates title/meta/heading rewrites + content briefs
 * All output goes to approval queue — human gate before anything goes live
 */
async function runA5(clientId, keys) {
  const brief      = await getState(clientId, "A1_brief");
  const audit      = await getState(clientId, "A2_audit");
  const keywords   = await getState(clientId, "A3_keywords");
  const competitor = await getState(clientId, "A4_competitor");

  if (!brief?.signedOff) return { success: false, error: "A1 brief not signed off" };
  if (!keywords?.status) return { success: false, error: "A3 keywords must complete first" };

  const topKeywords = (keywords.keywordMap || [])
    .filter(k => k.priority === "high")
    .slice(0, 8);

  const contentGaps  = competitor?.analysis?.contentGaps || [];
  const quickWins    = competitor?.analysis?.quickWins   || [];
  const currentTitle = audit?.checks?.title?.value || "";
  const currentH1    = audit?.checks?.h1?.value    || "";
  const currentDesc  = audit?.checks?.metaDescription?.value || "";

  // ── LLM: Generate optimised on-page content ────────
  const prompt = `You are an expert SEO content strategist.

Client: ${brief.businessName}
Website: ${brief.websiteUrl}
Business: ${brief.businessDescription}
Target Audience: ${brief.targetAudience}
Conversion Goal: ${brief.conversionGoal || "not specified"}

Current Homepage:
- Title: "${currentTitle}"
- Meta Description: "${currentDesc}"
- H1: "${currentH1}"

Top Target Keywords: ${topKeywords.map(k => k.keyword).join(", ")}
Content Gaps to Fill: ${contentGaps.slice(0,3).map(g => g.topic).join(", ")}

Generate optimised content recommendations. Return ONLY valid JSON:

{
  "homepageOptimisation": {
    "titleTag": {
      "current": "${currentTitle}",
      "recommended": "optimised title (50-60 chars with primary keyword)",
      "characterCount": 0,
      "rationale": "why this title"
    },
    "metaDescription": {
      "current": "${currentDesc}",
      "recommended": "optimised meta description (140-155 chars with keyword + CTA)",
      "characterCount": 0,
      "rationale": "why this description"
    },
    "h1Tag": {
      "current": "${currentH1}",
      "recommended": "optimised H1 with primary keyword",
      "rationale": "why this H1"
    },
    "h2Suggestions": ["h2 subheading 1", "h2 subheading 2", "h2 subheading 3"],
    "internalLinkSuggestions": [
      { "anchorText": "anchor text", "targetPage": "/page-path", "reason": "why link here" }
    ]
  },
  "newPageBriefs": [
    {
      "title": "page title",
      "targetKeyword": "primary keyword",
      "secondaryKeywords": ["kw2", "kw3"],
      "intent": "transactional|informational|commercial",
      "recommendedWordCount": 1200,
      "headingStructure": ["H1: main heading", "H2: section 1", "H2: section 2"],
      "contentOutline": ["point 1", "point 2", "point 3"],
      "competitorBenchmark": "what competitors do on this topic",
      "urgency": "high|medium|low"
    }
  ],
  "faqContent": [
    { "question": "question text", "answer": "answer text (2-3 sentences)", "targetPage": "/" }
  ],
  "contentRefreshFlags": [
    { "page": "/existing-page", "issue": "why it needs refresh", "action": "what to update" }
  ]
}`;

  let contentData;
  try {
    const response = await callLLM(prompt, keys, { maxTokens: 4000, temperature: 0.4 });
    contentData = parseJSON(response);
  } catch (e) {
    return { success: false, error: `Content generation failed: ${e.message}` };
  }

  // ── Save to approval queue ─────────────────────────
  const approvalItems = [];

  // Homepage optimisation needs approval
  if (contentData.homepageOptimisation) {
    const ref = db.collection("approval_queue").doc();
    const item = {
      id:        ref.id,
      clientId,
      type:      "homepage_optimisation",
      agent:     "A5",
      status:    "pending",
      data:      contentData.homepageOptimisation,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await ref.set(item);
    approvalItems.push(ref.id);
  }

  // Each new page brief needs approval
  for (const brief_ of (contentData.newPageBriefs || [])) {
    const ref = db.collection("approval_queue").doc();
    await ref.set({
      id:        ref.id,
      clientId,
      type:      "new_page_brief",
      agent:     "A5",
      status:    "pending",
      data:      brief_,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    approvalItems.push(ref.id);
  }

  const result = {
    status:             "complete",
    contentData,
    approvalItemsCount: approvalItems.length,
    approvalItemIds:    approvalItems,
    summary: {
      homepageOptimised:  !!contentData.homepageOptimisation,
      newPageBriefs:      contentData.newPageBriefs?.length || 0,
      faqItems:           contentData.faqContent?.length || 0,
      refreshFlags:       contentData.contentRefreshFlags?.length || 0,
    },
    generatedAt: new Date().toISOString(),
  };

  await saveState(clientId, "A5_content", result);
  return { success: true, content: result };
}

module.exports = { runA5 };
