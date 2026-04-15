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
      // ── Self-healing: block retries that exceed max attempts ──
      if (task.isRetry && (task.retryCount || 0) >= (task.maxRetries || 3)) {
        await updateTask(clientId, task.id, { status: "abandoned", abandonReason: "max retries exceeded" });
        errors.push({ taskId: task.id, error: `Abandoned after ${task.retryCount} failed attempts` });
        continue;
      }

      // Retry attempts vary the approach: higher temperature + explicit instruction to try differently
      const isRetry = !!task.isRetry;
      const retryNote = isRetry
        ? `\n\nIMPORTANT: Previous attempt failed with: "${task.lastError || "unknown error"}". Try a DIFFERENT approach this time — different wording, different structure, or a more conservative fix.`
        : "";

      const prompt = `You are a senior SEO consultant. Generate an exact, ready-to-implement fix.

Business: ${brief.businessName || "N/A"}
Website: ${brief.websiteUrl || "N/A"}
Services: ${(brief.services || []).join(", ") || "N/A"}
Issue: ${task.issueType}
Detail: ${task.title}${retryNote}

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
          // Retries use higher temperature to force variation
          const llmOpts = isRetry
            ? { maxTokens: 500, temperature: 0.8 }
            : { maxTokens: 500, temperature: 0.3 };
          const response = await callLLM(prompt, keys, llmOpts);
          const llmResult = parseJSON(response);
          if (llmResult.suggestedFix) result = { ...ruleResult, ...llmResult, generatedBy: "llm" };
        } catch {
          // Rule-based result already set
        }
      }

      // ── Tiered auto-approve: every fix type has a risk level + threshold ──
      // LOW:    text-only, fully reversible → 70% win rate + 0.85 confidence
      // MEDIUM: structural but reversible → 80% win rate + 0.90 confidence
      // HIGH:   irreversible / schema / redirects → never auto-approve
      const RISK_TIERS = {
        low: new Set([
          "seo_title", "meta_description", "missing_title", "missing_meta_desc",
          "short_title", "short_meta", "long_title", "long_meta", "title_tag", "meta_desc",
          "missing_alt_text", "missing_og_tags", "missing_twitter_card",
        ]),
        medium: new Set([
          "missing_h1", "multiple_h1", "missing_canonical", "canonical_tag",
          "missing_schema", "no_viewport", "missing_lang", "missing_robots",
          "low_internal_links", "orphan_page",
        ]),
        high: new Set([
          "redirect_chain", "broken_internal_link", "mixed_content",
          "missing_ssl", "slow_ttfb", "slow_response_time", "thin_content",
          "keyword_cannibalization",
        ]),
      };
      const getRiskTier = (type) => {
        if (RISK_TIERS.low.has(type))    return "low";
        if (RISK_TIERS.medium.has(type)) return "medium";
        if (RISK_TIERS.high.has(type))   return "high";
        return "unknown";
      };
      const THRESHOLDS = {
        low:    { minWinRate: 70, minConfidence: 0.85, minSamples: 2 },
        medium: { minWinRate: 80, minConfidence: 0.90, minSamples: 3 },
        high:   { minWinRate: 101, minConfidence: 2,   minSamples: 999 }, // never auto-approve
        unknown:{ minWinRate: 101, minConfidence: 2,   minSamples: 999 },
      };

      const riskTier  = getRiskTier(task.issueType);
      const threshold = THRESHOLDS[riskTier];

      // Check win rate from client_memory for this specific fix type
      let winRate = 0;
      let samples = 0;
      try {
        const memSnap = await db.collection("client_memory").doc(clientId).get();
        const fixOutcomes = memSnap.exists ? (memSnap.data().fixOutcomes || []) : [];
        // Match by exact issue type OR by risk tier (pooled learning within the tier)
        const tierSet = RISK_TIERS[riskTier] || new Set();
        const relevant = fixOutcomes.filter(f => {
          const field = f.field || f.issueType;
          return field === task.issueType || tierSet.has(field);
        });
        samples = relevant.length;
        if (samples >= threshold.minSamples) {
          const improved = relevant.filter(f => f.outcome === "improved").length;
          winRate = Math.round((improved / samples) * 100);
        }
      } catch { /* non-blocking — default to manual approval */ }

      const autoApprove = winRate >= threshold.minWinRate
                       && (task.confidence || 0.7) >= threshold.minConfidence
                       && samples >= threshold.minSamples;
      const status = autoApprove ? "approved" : "pending";

      // Push to approval queue
      const ref = db.collection("approval_queue").doc();
      await ref.set({
        id:          ref.id,
        clientId,
        type:        "auto_fix",
        agent:       "A12",
        status,
        taskId:      task.id,
        issueType:   task.issueType,
        autoApproved: autoApprove,
        data: {
          taskTitle:    task.title,
          suggestedFix: result.suggestedFix || "",
          explanation:  result.explanation  || "",
          implementation: result.implementation || [],
          codeSnippet:  result.codeSnippet  || null,
          estimatedImpact: result.estimatedImpact || `+${task.expectedScoreGain || 3} score pts`,
          currentValue: task.currentValue   || null,
          ...(autoApprove && { autoApproveReason: `${riskTier.toUpperCase()}-risk fix (${task.issueType}), ${winRate}% win rate across ${samples} samples, confidence ${task.confidence || 0.7}` }),
          riskTier,
        },
        createdAt:   FieldValue.serverTimestamp(),
      });

      if (autoApprove) console.log(`[A12] Auto-approved: ${task.issueType} for ${clientId} (win rate ${winRate}%)`);

      // Mark task as "in_review" or "approved"
      await updateTask(clientId, task.id, { status: autoApprove ? "approved" : "in_review" });

      fixes.push({ taskId: task.id, approvalId: ref.id, issue: task.issueType, autoApproved: autoApprove });
    } catch (e) {
      errors.push({ taskId: task.id, error: e.message });
    }
  }

  const autoApprovedCount = fixes.filter(f => f.autoApproved).length;
  return {
    success:     true,
    generated:   fixes.length,
    autoApproved: autoApprovedCount,
    errors:      errors.length,
    fixes,
    message:     autoApprovedCount > 0
      ? `Generated ${fixes.length} fixes — ${autoApprovedCount} auto-approved (low-risk + high confidence), ${fixes.length - autoApprovedCount} need review`
      : `Generated ${fixes.length} auto-fixes — review in Approvals tab`,
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
