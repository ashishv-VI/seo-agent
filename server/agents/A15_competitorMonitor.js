/**
 * A15 — Competitor Monitor Agent — Level 3 (Learn)
 *
 * Runs daily (via scheduler) or on-demand.
 * Monitors competitor sites for new content, ranking changes, and strategy shifts.
 *
 * What it detects:
 *   1. New pages/posts on competitor sites (via sitemap diff)
 *   2. Competitor keyword changes (via SerpAPI if available)
 *   3. New content topics not covered by this client
 *   4. Competitor backlink momentum (via client's existing data)
 *
 * Outputs:
 *   - Alerts in Firestore alerts collection
 *   - Counter-content suggestions in A15_competitor_monitor state
 *   - Updates to client_memory.competitorContext
 */
const { db, FieldValue }      = require("../config/firebase");
const { getState, saveState } = require("../shared-state/stateManager");
const { callLLM, parseJSON }  = require("../utils/llm");
const { updateMemorySection } = require("../utils/memory");

/**
 * Fetch a competitor's sitemap and extract URLs
 * Tries sitemap.xml, sitemap_index.xml, and robots.txt sitemap directive
 */
async function fetchCompetitorUrls(competitorUrl) {
  const base = competitorUrl.replace(/\/+$/, "");
  const urls = new Set();

  const sitemapUrls = [
    `${base}/sitemap.xml`,
    `${base}/sitemap_index.xml`,
    `${base}/post-sitemap.xml`,
    `${base}/page-sitemap.xml`,
  ];

  for (const sitemapUrl of sitemapUrls) {
    try {
      const res = await fetch(sitemapUrl, {
        headers: { "User-Agent": "SEO-Agent-Monitor/1.0" },
        signal:  AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const text = await res.text();

      // Extract <loc> URLs from sitemap XML
      const matches = text.match(/<loc>(https?[^<]+)<\/loc>/gi) || [];
      matches.forEach(m => {
        const url = m.replace(/<\/?loc>/gi, "").trim();
        if (url.startsWith("http") && !url.endsWith(".xml")) {
          urls.add(url);
        }
      });

      if (urls.size > 0) break; // Found sitemap with content
    } catch { continue; }
  }

  // Fallback: scrape homepage for internal links
  if (urls.size === 0) {
    try {
      const res  = await fetch(base, {
        headers: { "User-Agent": "SEO-Agent-Monitor/1.0" },
        signal:  AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const html    = await res.text();
        const matches = html.match(/href=["'](https?[^"']+)["']/gi) || [];
        matches.forEach(m => {
          const url = m.replace(/href=["']/i, "").replace(/["']$/, "").trim();
          if (url.startsWith(base) && !url.match(/\.(jpg|png|gif|svg|css|js|pdf)$/i)) {
            urls.add(url);
          }
        });
      }
    } catch { /* skip */ }
  }

  return [...urls].slice(0, 200); // cap at 200 URLs
}

/**
 * Run A15 competitor monitoring for a client
 *
 * @param {string} clientId
 * @param {object} keys — user API keys (LLM required for counter-content suggestions)
 */
async function runA15(clientId, keys) {
  try {
  const brief      = await getState(clientId, "A1_brief");
  const competitor = await getState(clientId, "A4_competitor");
  const keywords   = await getState(clientId, "A3_keywords");

  if (!brief?.websiteUrl) return { success: false, error: "A1 brief not found" };

  // Get competitor list from brief + A4 data
  const competitorList = [
    ...[].concat(brief.competitors || []),
    ...[].concat(competitor?.competitors?.map(c => c.url || c.domain) || []),
  ]
    .filter(Boolean)
    .filter(c => typeof c === "string" && c.startsWith("http"))
    .slice(0, 5); // max 5 competitors to avoid rate limiting

  if (competitorList.length === 0) {
    return {
      success: true,
      checked: 0,
      message: "No competitor URLs configured — add competitor URLs in the client brief",
    };
  }

  // Load previous snapshot to detect new content
  const prevState = await getState(clientId, "A15_competitorMonitor");
  const prevUrlSets = prevState?.competitorSnapshots || {};

  const now        = new Date().toISOString();
  const results    = [];
  const newAlerts  = [];
  const allNewUrls = [];

  for (const competitorUrl of competitorList) {
    try {
      const currentUrls = await fetchCompetitorUrls(competitorUrl);
      const prevUrls    = new Set(prevUrlSets[competitorUrl] || []);

      // Find URLs that are new since last check
      const newUrls = currentUrls.filter(url => !prevUrls.has(url));

      results.push({
        url:        competitorUrl,
        totalPages: currentUrls.length,
        newPages:   newUrls.length,
        newUrls:    newUrls.slice(0, 20),
        checkedAt:  now,
      });

      if (newUrls.length > 0) {
        allNewUrls.push(...newUrls.slice(0, 10));

        // Create alert for significant new content
        if (newUrls.length >= 2 || prevUrls.size > 0) {
          const alertRef = db.collection("alerts").doc();
          newAlerts.push({
            id: alertRef.id,
            ref: alertRef,
            data: {
              clientId,
              type:      "competitor_new_content",
              tier:      "P2",
              source:    "A15",
              message:   `${competitorUrl} published ${newUrls.length} new page(s) since last check`,
              detail:    newUrls.slice(0, 5).join(", "),
              fix:       "Review competitor content and create counter-content for relevant topics",
              resolved:  false,
              createdAt: now,
            },
          });
        }
      }
    } catch (e) {
      results.push({ url: competitorUrl, error: e.message, checkedAt: now });
    }
  }

  // ── Generate counter-content suggestions with AI ───────────────────────
  let counterContentSuggestions = [];
  if (allNewUrls.length > 0 && (keys?.groq || keys?.gemini)) {
    try {
      const topKeywords = (keywords?.keywordMap || [])
        .filter(k => k.priority === "high")
        .slice(0, 10)
        .map(k => k.keyword);

      const prompt = `You are an SEO strategist. A competitor has published new content. Suggest counter-content for our client.

Client: ${brief.businessName}
Website: ${brief.websiteUrl}
Services: ${[].concat(brief.services || []).join(", ")}
Our target keywords: ${[].concat(topKeywords || []).join(", ")}

Competitor new pages/URLs:
${allNewUrls.slice(0, 10).join("\n")}

Analyze these URLs and suggest counter-content. Return ONLY valid JSON:
{
  "counterContent": [
    {
      "competitorUrl": "their URL",
      "topic": "the topic they covered",
      "ourAngle": "how we cover it better / differently",
      "suggestedTitle": "our article title",
      "targetKeyword": "main keyword to target",
      "priority": "high|medium|low",
      "reason": "why this matters for our SEO"
    }
  ],
  "strategicInsight": "1-2 sentence summary of what this competitor is doing"
}`;

      const response = await callLLM(prompt, keys, { maxTokens: 1500, temperature: 0.3 });
      const parsed   = parseJSON(response);
      counterContentSuggestions = parsed.counterContent || [];

      // Add strategic insight to results
      if (parsed.strategicInsight) {
        results.forEach(r => { r.strategicInsight = parsed.strategicInsight; });
      }
    } catch { /* non-blocking — suggestions are optional */ }
  }

  // Write alerts to Firestore
  if (newAlerts.length > 0) {
    const batch = db.batch();
    newAlerts.forEach(a => batch.set(a.ref, a.data));
    await batch.commit();
  }

  // ── Auto-queue high-priority counter-content as pending content_drafts ──
  // A14 checks content_drafts for status="queued" items and generates articles
  // for them on its next run. Without this bridge, A15's counter-content
  // suggestions were just stored in state — nobody acted on them.
  if (counterContentSuggestions.length > 0) {
    try {
      const qBatch = db.batch();
      let queued = 0;
      for (const suggestion of counterContentSuggestions.filter(s => s.priority === "high").slice(0, 3)) {
        // Check if we already queued this keyword to avoid duplicates
        const existing = await db.collection("content_drafts")
          .where("clientId", "==", clientId)
          .where("keyword", "==", suggestion.targetKeyword)
          .limit(1)
          .get();
        if (!existing.empty) continue;

        const ref = db.collection("content_drafts").doc();
        qBatch.set(ref, {
          id:              ref.id,
          clientId,
          keyword:         suggestion.targetKeyword,
          title:           suggestion.suggestedTitle,
          intent:          "competitive_response",
          sourceAgent:     "A15_competitorMonitor",
          competitorUrl:   suggestion.competitorUrl,
          ourAngle:        suggestion.ourAngle,
          reason:          suggestion.reason,
          status:          "queued",
          generatedBy:     null,
          createdAt:       FieldValue.serverTimestamp(),
        });
        queued++;
      }
      if (queued > 0) {
        await qBatch.commit();
        console.log(`[A15] Auto-queued ${queued} counter-content brief(s) for ${clientId}`);
      }
    } catch { /* non-blocking */ }
  }

  // Build new snapshots map (current state)
  const newSnapshots = { ...prevUrlSets };
  results.forEach(r => {
    if (r.newUrls) {
      const combined = new Set([...(prevUrlSets[r.url] || []), ...(r.newUrls || [])]);
      newSnapshots[r.url] = [...combined].slice(0, 500); // keep last 500 per competitor
    }
  });

  // Update client memory
  await updateMemorySection(clientId, "competitorContext", {
    lastChecked:   now,
    competitors:   competitorList,
    newPagesFound: allNewUrls.slice(0, 20),
    contentGaps:   counterContentSuggestions.slice(0, 5).map(s => s.suggestedTitle),
  });

  const output = {
    status:                  "complete",
    checkedAt:               now,
    competitorsChecked:      results.filter(r => !r.error).length,
    totalNewPages:           results.reduce((sum, r) => sum + (r.newPages || 0), 0),
    alertsCreated:           newAlerts.length,
    results,
    counterContentSuggestions,
    competitorSnapshots:     newSnapshots,
    summary: `Monitored ${competitorList.length} competitors. Found ${allNewUrls.length} new pages. Created ${newAlerts.length} alert(s).`,
  };

  await saveState(clientId, "A15_competitorMonitor", output);

  return {
    success:           true,
    checkedAt:         now,
    competitorResults: results,
    counterContent:    counterContentSuggestions,
    alertsCreated:     newAlerts.length,
    message:           output.summary,
  };
  } catch (e) {
    console.error(`[A15] Competitor monitor failed for ${clientId}:`, e.message);
    return { success: false, error: e.message };
  }
}

module.exports = { runA15 };
