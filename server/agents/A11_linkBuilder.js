/**
 * A11 — Link Building & Off-Page SEO Agent
 * Manual-only: runs after A4 (Competitor Analysis) completes
 *
 * What it does:
 *  1. Reads competitor data from A4
 *  2. Uses LLM to find 15 link-building opportunities (directories, guest posts, PR, etc.)
 *  3. Scores each by difficulty and priority
 *  4. Saves opportunities to Firestore + task_queue for the client
 */

const { saveState, getState }   = require("../shared-state/stateManager");
const { callLLM, parseJSON }    = require("../utils/llm");
const { db, FieldValue }        = require("../config/firebase");

async function runA11(clientId, keys, masterPrompt) {
  try {
  // ── Dependency checks ─────────────────────────────
  const brief      = await getState(clientId, "A1_brief");
  const competitor = await getState(clientId, "A4_competitor");

  if (!brief?.signedOff) {
    return { success: false, error: "A1 brief not signed off — run onboarding first" };
  }
  if (!competitor || competitor.status !== "complete") {
    return { success: false, error: "A4 Competitor Analysis must complete before link building" };
  }

  const businessName = brief.businessName  || "the business";
  const websiteUrl   = brief.websiteUrl    || "";
  const industry     = brief.industry      || [].concat(brief.services || []).join(", ") || "general";
  const locations    = (brief.targetLocations || []).join(", ") || "UK";

  const competitorDomains = (competitor.competitors || [])
    .slice(0, 5)
    .map(c => c.domain || c.url || c)
    .filter(Boolean);

  // ── LLM: Identify link-building opportunities ─────
  let opportunities = [];
  let quickWins     = [];
  let summary       = "";

  if (keys?.groq || keys?.gemini || keys?.openrouter) {
    try {
      const prompt = `You are a world-class off-page SEO specialist with deep 2025 algorithm knowledge.

Business: ${businessName}
Website: ${websiteUrl}
Industry: ${industry}
Target Locations: ${locations}
Competitor Domains: ${competitorDomains.join(", ") || "not available"}

2025 LINK BUILDING REALITY:
- Google's May 2024 Link Spam Update targeted SCALED guest post schemes — bulk guest posts = penalty risk
- Links must be EARNED through genuine value, not manufactured through schemes
- Digital PR (original research, data studies) = highest ROI link tactic in 2025
- Brand mentions + unlinked citations are now tracked as authority signals
- HARO/Qwoted (expert quotes in publications) = passive, compound link building
- Broken link building still works and is still underused

WHAT TO AVOID (will be penalised):
- Bulk guest post services
- Paid link schemes
- Low-quality directory spam
- Exact match anchor text in bulk
- PBNs or expired domain schemes

Generate exactly 15 link-building opportunities across THESE 2025 categories:
- digital_pr (original research, data studies, newsworthy angles)
- haro_expert (HARO/Qwoted expert quote opportunities)
- broken_link (find broken links on relevant pages and offer replacement)
- unlinked_mention (brand mentioned without link — convert to backlink)
- resource_page (genuine resource pages relevant to industry)
- podcast_appearance (podcast guest appearance — brand + show notes link)
- local_citation (Google Business Profile, Bing Places, industry directories)
- partnership (genuine business partnerships, sponsorships, community)

Return ONLY valid JSON:
{
  "opportunities": [
    {
      "type": "digital_pr|haro_expert|broken_link|unlinked_mention|resource_page|podcast_appearance|local_citation|partnership",
      "target": "specific target platform, publication, or approach",
      "url": "target URL if known, else empty string",
      "domainAuthority": "low|medium|high",
      "difficulty": "easy|medium|hard",
      "priority": "high|medium|low",
      "approach": "exact outreach approach — specific and actionable",
      "emailSubjectLine": "ready-to-use subject line",
      "estimatedTimeToSecure": "1-2 weeks|1 month|2-3 months",
      "linkType": "editorial|citation|mention",
      "why2025": "why this tactic is safe and effective in 2025"
    }
  ],
  "quickWins": ["3 easiest links to get in next 30 days — be specific"],
  "digitalPRAngles": ["3 original research/data angles this business could create to earn links naturally"],
  "unlinkedMentionStrategy": "how to find and convert unlinked brand mentions",
  "summary": "2-sentence 2025 link strategy overview"
}`;

      const raw    = await callLLM(clientId, keys, prompt, {system: masterPrompt || undefined,  maxTokens: 2500, temperature: 0.3, systemPrompt: "You are an expert SEO link-building strategist. Return only valid JSON." });
      const parsed = parseJSON(raw);
      opportunities = parsed.opportunities || [];
      quickWins     = parsed.quickWins     || [];
      summary       = parsed.summary       || "";
    } catch (e) {
      console.warn("[A11] LLM parse failed:", e.message);
    }
  }

  // ── Fallback: generic opportunities if LLM unavailable ──
  if (!opportunities.length) {
    opportunities = [
      { type:"local_citation",    target:"Google Business Profile",  url:"business.google.com",      domainAuthority:"high",   difficulty:"easy",   priority:"high",   approach:"Claim or optimise existing listing",  emailSubjectLine:"N/A — self-serve",  estimatedTimeToSecure:"1-2 weeks" },
      { type:"local_citation",    target:"Bing Places",              url:"bingplaces.com",            domainAuthority:"high",   difficulty:"easy",   priority:"high",   approach:"Claim listing and add full business details", emailSubjectLine:"N/A — self-serve", estimatedTimeToSecure:"1-2 weeks" },
      { type:"haro_expert",       target:"HARO / Qwoted",            url:"qwoted.com",                domainAuthority:"high",   difficulty:"medium", priority:"high",   approach:"Sign up as expert source. Respond to journalist queries in your industry", emailSubjectLine:"Expert response: [expertise]", estimatedTimeToSecure:"1-4 weeks" },
      { type:"unlinked_mention",  target:"Brand mention monitoring", url:"",                          domainAuthority:"medium", difficulty:"easy",   priority:"high",   approach:"Set up Google Alerts for brand. Contact sites mentioning you without a link", emailSubjectLine:"Quick question about your mention of [brand]", estimatedTimeToSecure:"1-2 weeks" },
      { type:"pr",           target:"HARO (Help A Reporter Out)",url:"helpareporter.com",         domainAuthority:"high",   difficulty:"medium", priority:"high",   approach:"Sign up as a source and respond to relevant queries",    emailSubjectLine:"Expert source for your story on [topic]", estimatedTimeToSecure:"1 month"   },
      { type:"digital_pr",      target:"Original research angle",  url:"",                          domainAuthority:"high",   difficulty:"hard",   priority:"high",   approach:"Create original data study. Pitch to industry publications for editorial links", emailSubjectLine:"Exclusive data story: [finding]", estimatedTimeToSecure:"2-3 months" },
      { type:"resource_page",target:"Local council / chamber",  url:"",                          domainAuthority:"medium", difficulty:"easy",   priority:"medium", approach:"Contact local business associations for directory links", emailSubjectLine:"Request to be listed on your resources page", estimatedTimeToSecure:"2-3 months"},
    ];
    quickWins = ["Claim Google Business Profile", "Submit to Bing Places", "Sign up to HARO as an expert source"];
    summary   = "No LLM key available — add a Groq or Gemini key for AI-powered analysis. Fallback opportunities shown.";
  }

  // ── Sort by priority ───────────────────────────────
  const priorityScore = { high: 3, medium: 2, low: 1 };
  opportunities.sort((a, b) => (priorityScore[b.priority] || 0) - (priorityScore[a.priority] || 0));

  // ── Write top opportunities to task_queue ──────────
  // Note: We write directly because these are non-standard tasks
  // (no ISSUE_METADATA mapping — link building has its own metadata structure)
  try {
    const col   = db.collection("task_queue").doc(clientId).collection("tasks");
    const batch = db.batch();
    const now   = FieldValue.serverTimestamp();

    const effortColor = { easy:"#059669", medium:"#D97706", hard:"#DC2626" };
    const impactColor = { high:"#DC2626", medium:"#D97706", low:"#6B7280" };

    for (const opp of opportunities.slice(0, 10)) {
      const ref = col.doc();
      batch.set(ref, {
        taskId:          ref.id,
        clientId,
        createdAt:       now,
        updatedAt:       now,
        sourceAgent:     "A11",
        tier:            "p2",

        title:           `Build link from ${opp.target}`,
        issueType:       "link_building",
        fixSuggestion:   opp.approach || "",

        assignedAgent:   "LinkBuildingAgent",
        assignedTo:      null,

        priorityScore:   priorityScore[opp.priority] * 30 || 30,
        rankingImpact:   opp.priority === "high" ? 70 : opp.priority === "medium" ? 50 : 30,
        trafficPotential:opp.priority === "high" ? 65 : opp.priority === "medium" ? 45 : 25,
        effort:          opp.difficulty || "medium",

        impact:          opp.priority === "high" ? "High" : opp.priority === "medium" ? "Medium" : "Low",
        impactColor:     impactColor[opp.priority] || "#6B7280",
        effortColor:     effortColor[opp.difficulty] || "#D97706",
        expectedScoreGain: opp.priority === "high" ? 6 : opp.priority === "medium" ? 3 : 1,
        expectedRankGain:  opp.priority === "high" ? "2-4 positions" : "1-2 positions",

        status:          "pending",
        mode:            "manual",
        autoFixable:     false,

        completedAt:     null,
        completedBy:     null,

        // Link-building specific
        linkTarget:      opp.target || "",
        linkUrl:         opp.url    || "",
        linkType:        opp.type   || "directory",
        domainAuthority: opp.domainAuthority || "medium",
        emailSubjectLine:opp.emailSubjectLine || "",
        estimatedTimeToSecure: opp.estimatedTimeToSecure || "1 month",
      });
    }
    await batch.commit();
  } catch (e) {
    console.error("[A11] Task queue write failed:", e.message);
    // Non-blocking — still save state below
  }

  // ── Save state ─────────────────────────────────────
  const result = {
    status:       "complete",
    opportunities,
    quickWins,
    summary,
    totalFound:   opportunities.length,
    highPriority: opportunities.filter(o => o.priority === "high").length,
    generatedAt:  new Date().toISOString(),
  };

  await saveState(clientId, "A11_linkbuilding", result);

  return {
    success:      true,
    message:      `Found ${opportunities.length} link-building opportunities (${result.highPriority} high priority)`,
    totalFound:   opportunities.length,
    highPriority: result.highPriority,
    quickWins,
  };
  } catch (e) {
    console.error(`[A11] Link builder failed for ${clientId}:`, e.message);
    return { success: false, error: e.message };
  }
}

module.exports = { runA11 };
