/**
 * AI1 — Intent Drift Detector
 *
 * Detects when a page's actual ranking keywords no longer match
 * the page's content intent — a major cause of ranking decline
 * after Google's Helpful Content and core updates.
 *
 * Example: /services/plumbing ranks for "how to fix leaky tap" (informational)
 * but the page is transactional — intent mismatch → poor UX signals → ranking drop
 *
 * Method:
 *  1. For each ranked page, extract the intent of top queries (informational/transactional/navigational/commercial)
 *  2. Scrape the page briefly to assess its actual content intent
 *  3. Compare: if query intent ≠ page intent → intent drift detected
 *  4. LLM: diagnose + recommend fix (redirect, rewrite, new page)
 */
const { getState, saveState } = require("../shared-state/stateManager");
const { callLLM, parseJSON }  = require("../utils/llm");

// Simple intent classifier from query text
function classifyQueryIntent(query) {
  const q = (query || "").toLowerCase();
  if (/\b(buy|price|cost|hire|book|quote|deal|cheap|near me|service|shop|order|get)\b/.test(q)) return "transactional";
  if (/\b(how|what|why|when|who|guide|tutorial|tips|explain|meaning|definition|vs|best)\b/.test(q)) return "informational";
  if (/\b(review|compare|vs|comparison|alternative|best .+for|top \d)\b/.test(q)) return "commercial";
  return "navigational";
}

function classifyPageIntent(html) {
  if (!html) return "unknown";
  const h = html.toLowerCase();
  const ctaScore  = (h.match(/\b(contact us|call now|get quote|book|hire|buy|order|enquire|request)\b/g) || []).length;
  const infoScore = (h.match(/\b(how to|guide|tutorial|learn|tips|step|article|blog)\b/g) || []).length;
  const revScore  = (h.match(/\b(review|compare|vs|best|rating|star|pros cons)\b/g) || []).length;
  if (ctaScore > infoScore && ctaScore > revScore) return "transactional";
  if (revScore > infoScore) return "commercial";
  if (infoScore > 2) return "informational";
  return "navigational";
}

async function runAI1(clientId, keys) {
  try {
    const brief    = await getState(clientId, "A1_brief");
    const rankings = await getState(clientId, "A10_rankings");
    const keywords = await getState(clientId, "A3_keywords");

    if (!brief?.websiteUrl) return { success: false, error: "A1 brief not found" };

    // ── Group GSC rows by page ────────────────────────────────────────────
    const pageQueries = {};
    (rankings?.rankings || []).forEach(r => {
      const page = r.page || r.url;
      if (!page) return;
      if (!pageQueries[page]) pageQueries[page] = [];
      pageQueries[page].push({ keyword: r.keyword, clicks: r.clicks || 0, position: r.position || 50 });
    });

    const pages = Object.entries(pageQueries)
      .filter(([, queries]) => queries.some(q => q.clicks > 0))
      .slice(0, 20);

    const driftResults = [];

    for (const [pageUrl, queries] of pages) {
      // Determine dominant query intent
      const intentCounts = { transactional: 0, informational: 0, commercial: 0, navigational: 0 };
      queries.forEach(q => {
        const intent = classifyQueryIntent(q.keyword);
        intentCounts[intent] += (q.clicks || 0) + 1;
      });
      const queryIntent = Object.entries(intentCounts).sort((a, b) => b[1] - a[1])[0][0];
      const topQueries  = queries.sort((a, b) => b.clicks - a.clicks).slice(0, 5);

      // Quick page fetch for content intent
      let pageIntent = "unknown";
      try {
        const res = await fetch(pageUrl, {
          headers: { "User-Agent": "SEO-Agent-IntentChecker/1.0" },
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const html = await res.text();
          pageIntent = classifyPageIntent(html.slice(0, 5000));
        }
      } catch { /* skip — non-blocking */ }

      const hasDrift = queryIntent !== pageIntent && pageIntent !== "unknown";
      const severity = hasDrift
        ? (topQueries[0]?.clicks > 50 ? "high" : topQueries[0]?.clicks > 10 ? "medium" : "low")
        : "none";

      driftResults.push({
        page:        pageUrl,
        queryIntent,
        pageIntent,
        hasDrift,
        severity,
        topQueries,
        totalClicks: queries.reduce((s, q) => s + q.clicks, 0),
      });
    }

    const driftPages = driftResults.filter(r => r.hasDrift);

    // ── LLM: diagnose drift + recommend fix ──────────────────────────────
    let aiDiagnoses = [];
    if (driftPages.length > 0 && (keys?.groq || keys?.gemini)) {
      try {
        const prompt = `You are an SEO strategist specialising in search intent optimisation.

Client: ${brief.businessName} — ${brief.websiteUrl}
Services: ${[].concat(brief.services || []).join(", ")}

Pages with search intent mismatch (query intent ≠ page content type):
${driftPages.slice(0, 8).map(p =>
  `- ${p.page.replace(/^https?:\/\/[^/]+/, "") || "/"}: users search with ${p.queryIntent} intent but page delivers ${p.pageIntent} content. Top query: "${p.topQueries[0]?.keyword}" (${p.totalClicks} clicks)`
).join("\n")}

For each page, recommend the best fix:
1. Rewrite page to match query intent
2. Create a NEW page targeting the query and redirect/link from this page
3. Add a section to bridge the gap
4. Target different keywords on this page

Return ONLY valid JSON:
{
  "diagnoses": [
    {
      "page": "/slug",
      "rootCause": "why this mismatch hurts rankings",
      "fix": "specific fix",
      "fixType": "rewrite|new_page|add_section|retarget",
      "effort": "low|medium|high",
      "impact": "high|medium|low",
      "newKeywordTarget": "better keyword if retargeting"
    }
  ],
  "summary": "Overall pattern across drift pages"
}`;

        const response = await callLLM(prompt, keys, { maxTokens: 1200, temperature: 0.3, clientId });
        const parsed   = parseJSON(response) || {};
        aiDiagnoses    = parsed.diagnoses || [];

        // Merge into drift pages
        const diagMap = {};
        aiDiagnoses.forEach(d => { diagMap[d.page] = d; });
        driftPages.forEach(p => {
          const slug = p.page.replace(/^https?:\/\/[^/]+/, "") || "/";
          Object.assign(p, diagMap[slug] || diagMap[p.page] || {});
        });
      } catch { /* non-blocking */ }
    }

    const result = {
      success:      true,
      scannedAt:    new Date().toISOString(),
      pagesScanned: pages.length,
      driftCount:   driftPages.length,
      highDrift:    driftPages.filter(p => p.severity === "high").length,
      driftPages:   driftPages,
      allPages:     driftResults,
    };

    await saveState(clientId, "AI1_intentDrift", result);
    return result;

  } catch (e) {
    console.error(`[AI1] Intent drift scan failed for ${clientId}:`, e.message);
    return { success: false, error: e.message };
  }
}

module.exports = { runAI1 };
