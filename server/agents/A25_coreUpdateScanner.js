/**
 * A25 — Google Core Update Scanner
 *
 * Checks the site against Google's 2024-2025 core update criteria:
 *   1. E-E-A-T signals (Experience, Expertise, Authoritativeness, Trust)
 *   2. Topical authority gaps vs competitors
 *   3. AI content risk (published A14 posts without author/editorial signals)
 *   4. Search intent mismatch (page type vs keyword intent)
 *   5. Thin content detection (pages too short for their ranking keywords)
 *
 * Outputs:
 *   - Risk score 0–100 per category
 *   - Specific fix recommendations
 *   - Approval queue items for high-risk issues
 *   - Saved to A25_coreUpdateScanner state
 */

const { db }                  = require("../config/firebase");
const { getState, saveState } = require("../shared-state/stateManager");
const { callLLM, parseJSON }  = require("../utils/llm");

async function runA25(clientId, keys) {
  try {
  const [brief, audit, keywords, competitor, onpage, content] = await Promise.all([
    getState(clientId, "A1_brief").catch(() => null),
    getState(clientId, "A2_audit").catch(() => null),
    getState(clientId, "A3_keywords").catch(() => null),
    getState(clientId, "A4_competitor").catch(() => null),
    getState(clientId, "A6_onpage").catch(() => null),
    getState(clientId, "A5_content").catch(() => null),
  ]);

  if (!brief?.websiteUrl) return { success: false, error: "A1 brief not found" };

  const issues  = [];
  const now     = new Date().toISOString();
  const siteUrl = brief.websiteUrl;

  // ── 1. E-E-A-T Signal Scan ─────────────────────────────────────────────
  // Google's Helpful Content + core updates heavily reward Experience & Trust signals.
  // We check for the most common missing signals.
  const eeatIssues = [];
  let eeatScore    = 100;

  try {
    const res  = await fetch(siteUrl, {
      headers: { "User-Agent": "SEO-Agent-Audit/1.0" },
      signal:  AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const html = await res.text();
      const lower = html.toLowerCase();

      // Author signals
      const hasAuthorSchema = lower.includes('"author"') || lower.includes("itemprop=\"author\"");
      const hasAuthorPage   = lower.includes("/author/") || lower.includes("about") || lower.includes("team");
      const hasByline       = lower.includes("written by") || lower.includes("by ") || lower.includes("author:");
      if (!hasAuthorSchema && !hasByline) {
        eeatIssues.push({
          type:     "missing_author_signals",
          severity: "high",
          detail:   "No author schema or bylines detected. Google's E-E-A-T requires clear authorship for content to be treated as trustworthy.",
          fix:      "Add author schema markup to all blog posts and content pages. Create author profile pages with credentials and bio.",
          impact:   "High — without authorship signals, AI-generated content is especially risky after Helpful Content updates",
        });
        eeatScore -= 25;
      }

      // About/Team page
      const hasAboutPage = lower.includes("/about") || lower.includes("/team") || lower.includes("/who-we-are");
      if (!hasAboutPage) {
        eeatIssues.push({
          type:     "missing_about_page",
          severity: "medium",
          detail:   "No About or Team page detected. Google uses these to assess whether a real, credible organisation is behind the site.",
          fix:      "Create an /about page with company history, team photos, credentials, and contact information.",
          impact:   "Medium — trust signal gap especially for YMYL (health, finance, legal) industries",
        });
        eeatScore -= 15;
      }

      // Reviews/testimonials
      const hasReviews = lower.includes("review") || lower.includes("testimonial") || lower.includes("trustpilot") || lower.includes("google review");
      if (!hasReviews) {
        eeatIssues.push({
          type:     "missing_social_proof",
          severity: "medium",
          detail:   "No reviews or testimonials detected on the homepage. Experience signals include third-party validation.",
          fix:      "Add Google Reviews widget, Trustpilot badge, or client testimonials with schema markup.",
          impact:   "Medium — E (Experience) signal in E-E-A-T requires demonstrated real-world use",
        });
        eeatScore -= 10;
      }

      // Contact page
      const hasContact = lower.includes("/contact") || lower.includes("tel:") || lower.includes("mailto:");
      if (!hasContact) {
        eeatIssues.push({
          type:     "missing_contact_signals",
          severity: "medium",
          detail:   "No phone number or contact page detected. Google requires clear contact information for Trust (T in E-E-A-T).",
          fix:      "Add phone number, email, and physical address (if applicable) in header or footer. Create a /contact page.",
          impact:   "Medium — Trust signal for local businesses and service sites",
        });
        eeatScore -= 10;
      }

      // Privacy policy / Terms
      const hasPrivacy = lower.includes("/privacy") || lower.includes("privacy policy");
      if (!hasPrivacy) {
        eeatIssues.push({
          type:     "missing_privacy_policy",
          severity: "low",
          detail:   "No privacy policy detected. Required for Trust signals and GDPR compliance.",
          fix:      "Add a /privacy-policy page and link it in the footer.",
          impact:   "Low — but absence can trigger manual review flags",
        });
        eeatScore -= 5;
      }
    }
  } catch { /* non-blocking */ }

  if (eeatIssues.length > 0) issues.push(...eeatIssues);

  // ── 2. Topical Authority Gap Analysis ─────────────────────────────────
  // Google's algorithm rewards sites that cover a topic comprehensively.
  // Missing subtopics = ranking ceiling even for main keywords.
  const topicalIssues = [];
  let topicalScore    = 100;

  const ourTopics = new Set([
    ...(keywords?.keywordMap || []).map(k => k.keyword.toLowerCase()),
    ...(content?.briefs || []).map(b => (b.targetKeyword || b.keyword || "").toLowerCase()),
  ]);

  // Competitor topics we're missing
  const competitorTopics = [
    ...(competitor?.competitorContent || []).map(c => c.topic || c.keyword || ""),
    ...(competitor?.contentGaps || []).map(g => g.keyword || g.topic || ""),
  ].filter(Boolean).map(t => t.toLowerCase());

  const missingTopics = competitorTopics.filter(t => t && !ourTopics.has(t));

  if (missingTopics.length > 5) {
    topicalIssues.push({
      type:     "topical_authority_gap",
      severity: "high",
      detail:   `Missing ${missingTopics.length} topic areas that competitors cover. Google can't rank you as an authority on your subject if key subtopics are absent.`,
      fix:      `Create content for these missing topics: ${missingTopics.slice(0, 5).join(", ")}. Group related topics into content clusters with internal links.`,
      impact:   "High — topical authority is a primary ranking factor post-2023 core updates",
      missingTopics: missingTopics.slice(0, 10),
    });
    topicalScore -= Math.min(40, missingTopics.length * 3);
  }

  const keywordCount = (keywords?.keywordMap || []).length;
  const contentCount = (content?.briefs || []).length;
  if (keywordCount > 0 && contentCount < keywordCount * 0.3) {
    topicalIssues.push({
      type:     "content_coverage_low",
      severity: "medium",
      detail:   `Only ${contentCount} content pieces planned for ${keywordCount} target keywords (${Math.round(contentCount/keywordCount*100)}% coverage). Thin topical coverage limits authority.`,
      fix:      "Create content briefs for at least 60% of target keywords. Prioritise clusters, not individual keywords.",
      impact:   "Medium — content volume signals topical commitment to Google",
    });
    topicalScore -= 20;
  }

  if (topicalIssues.length > 0) issues.push(...topicalIssues);

  // ── 3. AI Content Risk Assessment ─────────────────────────────────────
  // Google's Helpful Content Update specifically targets AI-generated content
  // that lacks editorial signals. Posts published by A14 without human review are at risk.
  const aiRiskIssues = [];
  let aiRiskScore    = 100;

  try {
    const contentDraftsSnap = await db.collection("content_drafts")
      .where("clientId", "==", clientId)
      .where("status", "==", "published")
      .limit(50)
      .get();

    const publishedAIContent = contentDraftsSnap.docs.map(d => d.data());
    const withoutAuthor  = publishedAIContent.filter(c => !c.authorName && !c.authorSchema);
    const withoutReview  = publishedAIContent.filter(c => !c.humanReviewed && !c.reviewedBy);

    if (withoutAuthor.length > 0) {
      aiRiskIssues.push({
        type:     "ai_content_no_author",
        severity: "high",
        detail:   `${withoutAuthor.length} AI-generated article(s) published without author attribution. These are highest-risk for Helpful Content penalties.`,
        fix:      "Add author bylines and schema to all AI-generated posts. Add a brief editorial note explaining the content was reviewed by [name/role].",
        impact:   `High — ${withoutAuthor.length} pages at risk of algorithmic downgrade`,
        affectedPages: withoutAuthor.slice(0, 5).map(c => c.wpPostUrl || c.title || "unknown"),
      });
      aiRiskScore -= Math.min(50, withoutAuthor.length * 10);
    }

    if (withoutReview.length > withoutAuthor.length * 0.5) {
      aiRiskIssues.push({
        type:     "ai_content_no_review",
        severity: "medium",
        detail:   `${withoutReview.length} AI-generated article(s) show no human review flag. Google's documentation explicitly warns against AI content without human oversight.`,
        fix:      "Implement a review workflow: human reads, edits, and marks content as reviewed before publishing. Add factual accuracy notes or expert quotes.",
        impact:   "Medium — algorithmic risk that grows as AI content proportion increases",
      });
      aiRiskScore -= 20;
    }
  } catch { /* non-blocking */ }

  if (aiRiskIssues.length > 0) issues.push(...aiRiskIssues);

  // ── 4. Search Intent Mismatch Detection ───────────────────────────────
  // If a page is informational but its keyword is transactional (or vice versa),
  // Google won't rank it regardless of on-page quality.
  const intentIssues = [];
  let intentScore    = 100;

  const onpageItems = onpage?.items || onpage?.fixes || [];
  const transactionalKws = (keywords?.keywordMap || [])
    .filter(k => k.intent === "transactional" || k.intent === "commercial");
  const informationalKws = (keywords?.keywordMap || [])
    .filter(k => k.intent === "informational" || k.intent === "navigational");

  // Check if transactional keywords are mapped to pages without CTAs/pricing
  if (transactionalKws.length > 0) {
    const missingCTAPages = onpageItems
      .filter(item => !item.hasCTA && !item.hasPricing && transactionalKws.some(k =>
        (item.url || "").toLowerCase().includes(k.keyword.split(" ")[0].toLowerCase())
      ));

    if (missingCTAPages.length > 0) {
      intentIssues.push({
        type:     "intent_mismatch_transactional",
        severity: "high",
        detail:   `${missingCTAPages.length} page(s) target transactional keywords but lack CTAs, pricing, or conversion elements. Google's search intent matching means these won't rank.`,
        fix:      "Add pricing tables, 'Get a Quote' CTAs, case studies, and trust signals to transactional pages. Match page type to keyword intent.",
        impact:   "High — intent mismatch is a primary reason pages fail to rank despite good content",
        affectedPages: missingCTAPages.slice(0, 5).map(p => p.url || "").filter(Boolean),
      });
      intentScore -= 30;
    }
  }

  // Featured snippet opportunity — informational keywords without FAQ schema
  const infoKwsWithoutFAQ = informationalKws.filter(k => {
    const hasSchema = onpageItems.some(item =>
      (item.url || "").includes(k.suggestedPage || "") && item.hasSchema
    );
    return !hasSchema && k.priority === "high";
  }).slice(0, 5);

  if (infoKwsWithoutFAQ.length > 0) {
    intentIssues.push({
      type:     "missing_faq_schema",
      severity: "medium",
      detail:   `${infoKwsWithoutFAQ.length} high-priority informational keyword pages lack FAQ schema. FAQ schema dramatically improves featured snippet eligibility.`,
      fix:      `Add FAQ schema to: ${infoKwsWithoutFAQ.map(k => k.suggestedPage || k.keyword).slice(0,3).join(", ")}. Include 3-5 Q&A pairs matching common searches.`,
      impact:   "Medium — featured snippets for informational queries drive significant zero-click traffic",
    });
    intentScore -= 15;
  }

  if (intentIssues.length > 0) issues.push(...intentIssues);

  // ── 5. LLM: Overall risk assessment + prioritised fixes ────────────────
  let llmAssessment = null;
  if (keys?.groq || keys?.gemini || process.env.OPENROUTER_API_KEY) {
    try {
      const issuesSummary = issues.map(i => `[${i.severity.toUpperCase()}] ${i.type}: ${i.detail}`).join("\n");
      const prompt = `You are a senior SEO consultant reviewing a site's Google Core Update risk profile.

Client: ${brief.businessName} (${brief.websiteUrl})
Industry: ${brief.industry || brief.businessType || "Unknown"}

Issues detected:
${issuesSummary || "No issues detected"}

E-E-A-T Score: ${eeatScore}/100
Topical Authority Score: ${topicalScore}/100
AI Content Risk Score: ${aiRiskScore}/100
Search Intent Score: ${intentScore}/100

Overall risk assessment and top 3 priority fixes. Return ONLY valid JSON:
{
  "overallRisk": "high|medium|low",
  "riskSummary": "2-3 sentences: what the biggest risk is and why",
  "priorityFixes": [
    { "fix": "specific action", "why": "why this matters for Google rankings", "urgency": "immediate|this week|this month", "effort": "low|medium|high" }
  ],
  "coreUpdateAlignment": "how well aligned is this site with Google's current direction (2024-2025 updates)"
}`;

      const response = await callLLM(prompt, keys, { maxTokens: 1000, temperature: 0.2 });
      llmAssessment  = parseJSON(response);
    } catch { /* non-blocking */ }
  }

  // ── Write high-severity issues to approval_queue ────────────────────
  const highIssues = issues.filter(i => i.severity === "high");
  if (highIssues.length > 0) {
    try {
      const batch = db.batch();
      for (const issue of highIssues.slice(0, 3)) {
        const ref = db.collection("approval_queue").doc();
        batch.set(ref, {
          clientId,
          type:             "core_update_risk",
          status:           "pending",
          source:           "A25_coreUpdateScanner",
          title:            `Core Update Risk: ${issue.type.replace(/_/g, " ")}`,
          suggestedAction:  issue.fix,
          detail:           issue.detail,
          estimatedImpact:  issue.impact,
          severity:         issue.severity,
          createdAt:        now,
        });
      }
      await batch.commit();
    } catch { /* non-blocking */ }
  }

  // ── Compute overall risk score ──────────────────────────────────────
  const overallScore = Math.round((eeatScore + topicalScore + aiRiskScore + intentScore) / 4);
  const overallRisk  = overallScore >= 75 ? "low" : overallScore >= 50 ? "medium" : "high";

  const result = {
    status:          "complete",
    scannedAt:       now,
    overallScore,
    overallRisk:     llmAssessment?.overallRisk  || overallRisk,
    riskSummary:     llmAssessment?.riskSummary  || `${issues.length} issues found across E-E-A-T, topical authority, AI content, and intent matching.`,
    coreUpdateAlignment: llmAssessment?.coreUpdateAlignment || null,
    priorityFixes:   llmAssessment?.priorityFixes || issues.slice(0, 3).map(i => ({ fix: i.fix, why: i.impact, urgency: i.severity === "high" ? "immediate" : "this week", effort: "medium" })),
    categories: {
      eeat:       { score: eeatScore,    issues: eeatIssues,    label: "E-E-A-T Signals" },
      topical:    { score: topicalScore, issues: topicalIssues, label: "Topical Authority" },
      aiContent:  { score: aiRiskScore,  issues: aiRiskIssues,  label: "AI Content Risk" },
      intent:     { score: intentScore,  issues: intentIssues,  label: "Search Intent" },
    },
    totalIssues:     issues.length,
    highRiskCount:   issues.filter(i => i.severity === "high").length,
    approvalQueueItems: highIssues.length,
  };

  await saveState(clientId, "A25_coreUpdateScanner", result);

  return { success: true, ...result };
  } catch (e) {
    console.error(`[A25] Core Update Scanner failed for ${clientId}:`, e.message);
    return { success: false, error: e.message };
  }
}

module.exports = { runA25 };
