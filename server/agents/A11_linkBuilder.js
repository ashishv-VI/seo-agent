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
      const prompt = `You are a senior off-page SEO specialist. Generate link-building opportunities for this business.

Business: ${businessName}
Website: ${websiteUrl}
Industry: ${industry}
Target Locations: ${locations}
Competitor Domains: ${competitorDomains.join(", ") || "not available"}

Generate exactly 15 link-building opportunities across these categories:
- Directory listings (industry-specific + local)
- Guest post targets (relevant blogs/publications)
- Resource page inclusions
- Broken link replacements
- PR / HARO opportunities
- Partnership / sponsorship links

Return ONLY valid JSON (no markdown, no explanation):
{
  "opportunities": [
    {
      "type": "directory|guest_post|resource_page|broken_link|pr|partnership",
      "target": "website or platform name",
      "url": "target URL if known, else empty string",
      "domainAuthority": "low|medium|high",
      "difficulty": "easy|medium|hard",
      "priority": "high|medium|low",
      "approach": "exact outreach approach in 1 sentence",
      "emailSubjectLine": "ready-to-use email subject line",
      "estimatedTimeToSecure": "1-2 weeks|1 month|2-3 months"
    }
  ],
  "quickWins": ["3 easiest links to get in next 30 days"],
  "summary": "2-sentence strategy overview"
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
      { type:"directory",    target:"Google Business Profile",  url:"business.google.com",      domainAuthority:"high",   difficulty:"easy",   priority:"high",   approach:"Claim or optimise existing listing",                     emailSubjectLine:"N/A — self-serve",                       estimatedTimeToSecure:"1-2 weeks" },
      { type:"directory",    target:"Bing Places",              url:"bingplaces.com",            domainAuthority:"high",   difficulty:"easy",   priority:"high",   approach:"Claim listing and add full business details",            emailSubjectLine:"N/A — self-serve",                       estimatedTimeToSecure:"1-2 weeks" },
      { type:"directory",    target:"Yell.com",                 url:"yell.com",                  domainAuthority:"medium", difficulty:"easy",   priority:"medium", approach:"Submit free basic listing",                             emailSubjectLine:"N/A — self-serve",                       estimatedTimeToSecure:"1-2 weeks" },
      { type:"directory",    target:"Thomson Local",            url:"thomsonlocal.com",           domainAuthority:"medium", difficulty:"easy",   priority:"medium", approach:"Submit business details for free",                      emailSubjectLine:"N/A — self-serve",                       estimatedTimeToSecure:"1-2 weeks" },
      { type:"pr",           target:"HARO (Help A Reporter Out)",url:"helpareporter.com",         domainAuthority:"high",   difficulty:"medium", priority:"high",   approach:"Sign up as a source and respond to relevant queries",    emailSubjectLine:"Expert source for your story on [topic]", estimatedTimeToSecure:"1 month"   },
      { type:"guest_post",   target:"Industry blog",            url:"",                          domainAuthority:"medium", difficulty:"medium", priority:"medium", approach:"Pitch a unique data-driven article to relevant blogs",   emailSubjectLine:"Guest post pitch: [topic] for [blog]",    estimatedTimeToSecure:"1 month"   },
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
