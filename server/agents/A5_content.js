const { saveState, getState } = require("../shared-state/stateManager");
const { callLLM, parseJSON }  = require("../utils/llm");
const { db, FieldValue }      = require("../config/firebase");
const { emitToolSuggestion }  = require("../utils/toolBridge");
const { getSERP }             = require("../crawler/serpScraper");

/**
 * A5 — Content Optimisation Agent
 * Generates title/meta/heading rewrites + content briefs
 * All output goes to approval queue — human gate before anything goes live
 */

// ── SERP Research: fetch top results + scrape each page ──────────────────────
// Returns data-driven content intelligence for a keyword
async function fetchSerpIntelligence(keyword) {
  try {
    const serpData = await getSERP(keyword, { num: 5 });
    const topUrls  = (serpData.results || []).slice(0, 5).map(r => r.url).filter(Boolean);

    // Scrape each result page for content signals
    const pageData = await Promise.allSettled(
      topUrls.map(url => scrapePageForBrief(url))
    );

    const pages = pageData
      .filter(r => r.status === "fulfilled" && r.value)
      .map(r => r.value);

    if (pages.length === 0) return null;

    // Aggregate signals
    const avgWordCount    = Math.round(pages.reduce((s, p) => s + (p.wordCount || 0), 0) / pages.length);
    const allH2s          = pages.flatMap(p => p.h2s || []);
    const schemaTypes     = [...new Set(pages.flatMap(p => p.schemas || []))].slice(0, 5);
    // Most common H2 phrases (normalised)
    const h2Freq = {};
    for (const h2 of allH2s) {
      const normalised = h2.toLowerCase().trim().slice(0, 50);
      if (normalised.length > 3) h2Freq[normalised] = (h2Freq[normalised] || 0) + 1;
    }
    const topH2s = Object.entries(h2Freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([h2, count]) => ({ h2, appearsIn: count }));

    return {
      keyword,
      topResults: topUrls.length,
      avgWordCount,
      topH2Headings: topH2s,
      commonSchemas: schemaTypes,
      serpSnippets:  (serpData.results || []).slice(0, 3).map(r => r.snippet || "").filter(Boolean),
    };
  } catch {
    return null;
  }
}

// ── Scrape a single page for content signals (word count, H2s, schema) ───────
async function scrapePageForBrief(url) {
  try {
    const res = await fetch(url, {
      signal:  AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SEOBot/1.0)", "Accept": "text/html" },
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Word count — strip tags, count words in body
    const bodyText = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const wordCount = bodyText.split(" ").filter(w => w.length > 2).length;

    // H2 headings
    const h2Matches = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)];
    const h2s = h2Matches
      .map(m => m[1].replace(/<[^>]+>/g, "").trim())
      .filter(h => h.length > 3 && h.length < 100)
      .slice(0, 10);

    // Schema types (from @type in JSON-LD)
    const schemaMatches = [...html.matchAll(/"@type"\s*:\s*"([^"]+)"/gi)];
    const schemas = [...new Set(schemaMatches.map(m => m[1]))].slice(0, 5);

    return { url, wordCount, h2s, schemas };
  } catch {
    return null;
  }
}

// ── Build SERP intelligence section for LLM prompt ────────────────────────────
function buildSerpSection(serpIntel) {
  if (!serpIntel) return "";
  const lines = [
    `\n## Real SERP Analysis for "${serpIntel.keyword}" (${serpIntel.topResults} top results scraped)`,
    `- Average word count of top pages: ${serpIntel.avgWordCount || "unknown"} words`,
  ];
  if (serpIntel.topH2Headings?.length > 0) {
    lines.push(`- Common H2 headings used by top-ranking pages:`);
    for (const h of serpIntel.topH2Headings.slice(0, 6)) {
      lines.push(`  • "${h.h2}" (${h.appearsIn}/${serpIntel.topResults} pages)`);
    }
  }
  if (serpIntel.commonSchemas?.length > 0) {
    lines.push(`- Schema types used: ${serpIntel.commonSchemas.join(", ")}`);
  }
  if (serpIntel.serpSnippets?.length > 0) {
    lines.push(`- Top 3 SERP snippets (what Google shows for this query):`);
    serpIntel.serpSnippets.forEach((s, i) => lines.push(`  ${i+1}. "${s.slice(0, 120)}"`));
  }
  lines.push(`\nUse this real SERP data to make the content brief data-driven. Match or beat the avg word count. Cover the common H2 topics. Add recommended schema types.`);
  return lines.join("\n");
}

async function runA5(clientId, keys, masterPrompt) {
  try {
  const brief      = await getState(clientId, "A1_brief");
  const audit      = await getState(clientId, "A2_audit");
  const keywords   = await getState(clientId, "A3_keywords");
  const competitor = await getState(clientId, "A4_competitor");

  if (!brief?.signedOff) return { success: false, error: "A1 brief not signed off" };
  if (!keywords?.keywordMap && !keywords?.clusters) return { success: false, error: "A3 keywords must complete first" };

  const topKeywords = (keywords.keywordMap || [])
    .filter(k => k.priority === "high")
    .slice(0, 8);

  const contentGaps  = competitor?.analysis?.contentGaps || [];
  const quickWins    = competitor?.analysis?.quickWins   || [];
  const currentTitle = audit?.checks?.title?.value || "";
  const currentH1    = audit?.checks?.h1?.value    || "";
  const currentDesc  = audit?.checks?.metaDescription?.value || "";

  // ── SERP Intelligence — scrape top 5 results for primary keyword ─────────
  const primaryKeyword = topKeywords[0]?.keyword || brief.businessName;
  let serpIntel = null;
  try {
    console.log(`[A5] Fetching SERP intelligence for "${primaryKeyword}"...`);
    serpIntel = await fetchSerpIntelligence(primaryKeyword);
    if (serpIntel) console.log(`[A5] SERP: avgWordCount=${serpIntel.avgWordCount}, H2s=${serpIntel.topH2Headings?.length}`);
  } catch { /* non-blocking — degrade gracefully */ }

  // ── LLM: Generate optimised on-page content ────────
  const serpSection = buildSerpSection(serpIntel);

  const prompt = `You are a world-class SEO content strategist with deep 2025 algorithm knowledge.

Client: ${brief.businessName}
Website: ${brief.websiteUrl}
Business: ${brief.businessDescription}
Target Audience: ${brief.targetAudience}
Conversion Goal: ${brief.conversionGoal || "not specified"}

Current Homepage:
- Title: "${currentTitle}"
- Meta Description: "${currentDesc}"
- H1: "${currentH1}"

Top Target Keywords: ${topKeywords.map(k => `${k.keyword} (AI risk: ${k.aiOverviewRisk || "unknown"}, intent: ${k.intent || "unknown"})`).join(", ")}
Content Gaps: ${contentGaps.slice(0,3).map(g => g.topic || g.keyword).join(", ")}
Topical Hubs: ${(keywords?.topicalHubs || []).slice(0,3).map(h => h.hubName).join(", ") || "not mapped yet"}
Zero-click risk: ${keywords?.zeroClickRiskPct || 0}% of keywords at high AI Overview risk
${serpSection}

2025 CONTENT STANDARDS — every brief MUST apply these:

PEOPLE-FIRST TEST (Google HCU 2022-2025):
- Does this content show ORIGINAL angle no one else has?
- Does the author have FIRST-HAND EXPERIENCE with this topic?
- Does it have UNIQUE DATA, case studies, or real examples?
- Would a user feel SATISFIED (not cheated) after reading?

E-E-A-T SIGNALS (must include in every brief):
- Author credentials relevant to this topic
- First-hand experience signals to add
- Data or research to cite
- Trust signals (reviews, case studies, credentials)

AI OVERVIEW DEFENCE:
- For HIGH-risk informational keywords: add transactional hook so content survives zero-click
- For LOW-risk transactional keywords: these are priority — optimise aggressively
- For each brief: specify if target is traffic OR brand visibility + featured snippet

TOPICAL AUTHORITY ARCHITECTURE:
- Plan content as HUBS not random posts
- Each brief should show which pillar it belongs to
- Identify if this is a PILLAR page (broad) or CLUSTER page (specific)

Return ONLY valid JSON:
{
  "homepageOptimisation": {
    "titleTag": { "current": "${currentTitle}", "recommended": "", "characterCount": 0, "rationale": "" },
    "metaDescription": { "current": "${currentDesc}", "recommended": "", "characterCount": 0, "rationale": "" },
    "h1Tag": { "current": "${currentH1}", "recommended": "", "rationale": "" },
    "h2Suggestions": ["", "", ""],
    "internalLinkSuggestions": [{ "anchorText": "", "targetPage": "/", "reason": "" }]
  },
  "newPageBriefs": [
    {
      "title": "",
      "targetKeyword": "",
      "secondaryKeywords": ["", ""],
      "intent": "transactional|informational|commercial",
      "aiOverviewRisk": "high|medium|low",
      "contentGoal": "traffic|featured_snippet|brand_visibility|geo_citation",
      "topicalHub": "which hub this belongs to",
      "pageType": "pillar|cluster",
      "recommendedWordCount": 1200,
      "headingStructure": ["H1: ", "H2: ", "H2: "],
      "contentOutline": ["", "", ""],
      "peoplefirstChecklist": {
        "originalAngle": "what unique angle/data does this page have?",
        "experienceSignal": "what first-hand experience should the author show?",
        "eeeatElements": ["author bio with credentials", "case study or real example", "original data point"],
        "aiOverviewDefence": "how does this page survive zero-click? what transactional hook exists?"
      },
      "competitorBenchmark": "",
      "schemaMarkup": ["Article", "FAQPage"],
      "urgency": "high|medium|low"
    }
  ],
  "faqContent": [{ "question": "", "answer": "", "targetPage": "/" }],
  "contentRefreshFlags": [{ "page": "/", "issue": "", "action": "" }],
  "topicalAuthorityPlan": {
    "hubs": [{ "hubName": "", "pillarPage": "/", "clusterPages": ["/", "/"], "priority": "high" }],
    "recommendation": "overall topical authority strategy for this business"
  },
  "aiOverviewStrategy": "how to protect and grow traffic given current AI Overview landscape for this business"
}`;

  let contentData;
  try {
    const response = await callLLM(clientId, keys, prompt, {system: masterPrompt || undefined,  maxTokens: 4000, temperature: 0.4 });
    contentData = parseJSON(response);
  } catch (e) {
    console.warn(`[A5] LLM failed — using rule-based content fallback: ${e.message}`);
    // Rule-based fallback so the pipeline continues without LLM
    contentData = {
      homepageOptimisation: {
        suggestedTitle:       `${brief.businessName} — ${(brief.services || [])[0] || "Professional Services"}`,
        suggestedDescription: `${brief.businessName} provides ${(brief.services || []).slice(0,2).join(" and ")} in ${(brief.targetLocations || []).join(", ") || "your area"}. Contact us today.`,
        suggestedH1:          brief.businessName,
        keywordTargets:       topKeywords.slice(0, 3).map(k => k.keyword),
      },
      newPageBriefs: topKeywords.slice(0, 3).map(kw => ({
        title:          kw.keyword,
        targetKeyword:  kw.keyword,
        suggestedUrl:   kw.suggestedPage || "/services",
        wordCount:      800,
        intent:         kw.intent || "informational",
        headingStructure: [`H1: ${kw.keyword}`, "H2: Overview", "H2: Benefits", "H2: FAQ"],
        contentOutline: ["Introduction", "Key benefits", "How it works", "FAQ"],
        urgency:        kw.priority || "medium",
      })),
      faqContent: [],
      contentRefreshFlags: [],
      generatedBy: "rule-engine",
    };
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
      createdAt: FieldValue.serverTimestamp(),
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
      createdAt: FieldValue.serverTimestamp(),
    });
    approvalItems.push(ref.id);
  }

  const result = {
    status:             "complete",
    contentData,
    approvalItemsCount: approvalItems.length,
    approvalItemIds:    approvalItems,
    serpIntelligence:   serpIntel || null,
    summary: {
      homepageOptimised:  !!contentData.homepageOptimisation,
      newPageBriefs:      contentData.newPageBriefs?.length || 0,
      faqItems:           contentData.faqContent?.length || 0,
      refreshFlags:       contentData.contentRefreshFlags?.length || 0,
      serpDataUsed:       serpIntel != null,
      avgWordCountTarget: serpIntel?.avgWordCount || null,
    },
    generatedAt: new Date().toISOString(),
  };

  await saveState(clientId, "A5_content", result);

  // Emit Blog Generator suggestion for any content gaps identified
  try {
    const gaps = result.contentData?.contentGaps || [];
    if (gaps.length > 0) {
      emitToolSuggestion(clientId, "thin_content", { keyword: gaps[0].keyword || gaps[0].topic || "" }, {
        topic:   gaps[0].keyword || gaps[0].topic || "",
        keyword: gaps[0].keyword || "",
      }).catch(() => {});
    }
  } catch { /* non-blocking */ }

  return { success: true, content: result };
  } catch (e) {
    console.error(`[A5] Content agent failed for ${clientId}:`, e.message);
    return { success: false, error: e.message };
  }
}

module.exports = { runA5 };
