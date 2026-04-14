/**
 * A12 — Auto Execution Agent
 * Reads autoFixable pending tasks → generates AI fixes → pushes to approval queue
 */
const { getState }        = require("../shared-state/stateManager");
const { callLLM, parseJSON } = require("../utils/llm");
const { db, FieldValue }  = require("../config/firebase");
const { getTopTasks, updateTask } = require("../utils/taskQueue");

async function runA12(clientId, keys) {
  try {
  // A12 still works without LLM — produces template-based fixes instead of AI-written ones
  const hasLLM = !!(keys?.groq || keys?.gemini || keys?.openrouter);

  const brief       = await getState(clientId, "A1_brief") || {};
  const pendingTasks = await getTopTasks(clientId, 20);
  const autoFixable = pendingTasks.filter(t => t.autoFixable && t.status === "pending");

  if (!autoFixable.length) {
    return { success: true, message: "No auto-fixable tasks pending", generated: 0 };
  }

  const fixes  = [];
  const errors = [];

  for (const task of autoFixable.slice(0, 10)) {
    try {
      const prompt = `You are a senior SEO consultant. Generate an exact, ready-to-implement fix.

Business: ${brief.businessName || "N/A"}
Website: ${brief.websiteUrl || "N/A"}
Services: ${(brief.services || []).join(", ") || "N/A"}
Issue: ${task.issueType}
Detail: ${task.title}

Return ONLY valid JSON (no markdown):
{
  "suggestedFix": "The exact text/code fix (for title/meta: actual text to use)",
  "explanation": "Why this improves SEO in 1-2 sentences",
  "implementation": ["step 1", "step 2", "step 3"],
  "codeSnippet": "<tag>ready to paste</tag> or null",
  "estimatedImpact": "e.g. +8 score points, +3-6 positions"
}`;

      // Rule-based fix as fallback — always produces actionable output
      const ruleResult = buildRuleBasedFix(task, brief);
      let result = ruleResult;

      if (hasLLM) {
        try {
          const response = await callLLM(prompt, keys, { maxTokens: 500 });
          const llmResult = parseJSON(response);
          if (llmResult.suggestedFix) result = { ...ruleResult, ...llmResult, generatedBy: "llm" };
        } catch {
          // Rule-based result already set
        }
      }

      // Push to approval queue
      const ref = db.collection("approval_queue").doc();
      await ref.set({
        id:          ref.id,
        clientId,
        type:        "auto_fix",
        agent:       "A12",
        status:      "pending",
        taskId:      task.id,
        issueType:   task.issueType,
        data: {
          taskTitle:    task.title,
          suggestedFix: result.suggestedFix || "",
          explanation:  result.explanation  || "",
          implementation: result.implementation || [],
          codeSnippet:  result.codeSnippet  || null,
          estimatedImpact: result.estimatedImpact || `+${task.expectedScoreGain || 3} score pts`,
          currentValue: task.currentValue   || null,
        },
        createdAt:   FieldValue.serverTimestamp(),
      });

      // Mark task as "in_review"
      await updateTask(clientId, task.id, { status: "in_review" });

      fixes.push({ taskId: task.id, approvalId: ref.id, issue: task.issueType });
    } catch (e) {
      errors.push({ taskId: task.id, error: e.message });
    }
  }

  return {
    success:     true,
    generated:   fixes.length,
    errors:      errors.length,
    fixes,
    message:     `Generated ${fixes.length} auto-fixes — review in Approvals tab`,
  };
  } catch (e) {
    console.error(`[A12] Auto-execution failed for ${clientId}:`, e.message);
    return { success: false, error: e.message };
  }
}

// ── Rule-based fix templates — used when LLM is unavailable ──────────────────
function buildRuleBasedFix(task, brief) {
  const issueType = task.issueType || "";
  const name      = brief?.businessName || "Your Business";
  const url       = brief?.websiteUrl   || "";

  const fixMap = {
    missing_title:      { suggestedFix: `${name} — Professional Services | ${name}`, explanation: "Title tag with brand name and service descriptor. Update with your primary keyword.", implementation: ["Go to page settings", "Set title to the suggested fix", "Add your primary keyword before the dash"], codeSnippet: `<title>${name} — Professional Services</title>`, estimatedImpact: "+5-15 score points, +3-8 positions" },
    long_title:         { suggestedFix: task.title?.split("—")[0]?.trim()?.slice(0, 60) || `${name}`.slice(0, 60), explanation: "Shortened title to under 60 characters to prevent truncation in search results.", implementation: ["Edit page title", "Remove trailing words until under 60 chars"], codeSnippet: null, estimatedImpact: "+2-3 score points" },
    missing_meta_desc:  { suggestedFix: `${name} offers professional services. Get in touch today for a free consultation →`, explanation: "Meta description with brand name, service mention, and a CTA.", implementation: ["Go to page SEO settings", "Paste the suggested meta description", "Customise with your specific keywords"], codeSnippet: `<meta name="description" content="${name} offers professional services. Get in touch today for a free consultation →">`, estimatedImpact: "+5-10% CTR improvement" },
    missing_h1:         { suggestedFix: `${name} — Expert Services`, explanation: "H1 should contain your primary keyword and appear exactly once per page.", implementation: ["Find or create the H1 element", "Set it to your page's primary keyword phrase"], codeSnippet: `<h1>${name} — Expert Services</h1>`, estimatedImpact: "+3-8 score points" },
    missing_canonical:  { suggestedFix: url, explanation: "Self-referencing canonical prevents duplicate content issues.", implementation: ["Add canonical link to page <head>"], codeSnippet: `<link rel="canonical" href="${url}">`, estimatedImpact: "+2-3 score points, prevents duplicate content" },
    missing_alt_text:   { suggestedFix: "Descriptive alt text for each image", explanation: "Alt text helps Google understand images and improves accessibility.", implementation: ["Find all <img> tags", "Add descriptive alt attributes", "Include primary keyword naturally in hero image alt"], codeSnippet: `<img src="image.jpg" alt="${name} — service description">`, estimatedImpact: "+2-4 score points, accessibility improvement" },
    no_sitemap:         { suggestedFix: "Generate and submit XML sitemap to Google Search Console", explanation: "Sitemaps help Google discover all pages faster.", implementation: ["Install Yoast SEO or similar plugin", "Enable sitemap generation", "Submit URL to Google Search Console"], codeSnippet: null, estimatedImpact: "Faster indexing of all pages" },
    slow_ttfb:          { suggestedFix: "Enable server-side caching (WP Rocket / W3 Total Cache)", explanation: "Page caching serves pre-built HTML and dramatically reduces TTFB.", implementation: ["Install a caching plugin", "Enable full-page cache", "Test with PageSpeed Insights"], codeSnippet: null, estimatedImpact: "TTFB under 800ms, LCP improvement" },
  };

  return fixMap[issueType] || {
    suggestedFix:     task.title || "Review and fix this issue",
    explanation:      `${issueType.replace(/_/g, " ")} — follow SEO best practices`,
    implementation:   ["Review the issue details", "Apply the recommended fix", "Re-run audit to verify"],
    codeSnippet:      null,
    estimatedImpact:  "SEO score improvement",
    generatedBy:      "rule-engine",
  };
}

module.exports = { runA12 };
