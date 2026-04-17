const { saveState, getState }    = require("../shared-state/stateManager");
const { callLLM, parseJSON }     = require("../utils/llm");
const { getSERP }                = require("../crawler/serpScraper");

/**
 * A4 — Competitor Intelligence Agent
 *
 * Two paths:
 *  A) Competitors provided in brief → use them directly
 *  B) No competitors → auto-discover from SERP (top domains ranking for your keywords)
 *
 * After discovery: quick-crawl each competitor homepage for real SEO factors
 * (title, meta, H1, word-count estimate, HTTPS, schema, page speed hint)
 * then feed all real data to LLM for deep analysis.
 */

// ── Quick crawl: extract key SEO signals from a URL ────────────────────────
async function crawlCompetitorPage(url) {
  try {
    const res = await fetch(url.startsWith("http") ? url : `https://${url}`, {
      signal:  AbortSignal.timeout(10000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SEOBot/1.0)" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Title
    const titleM = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title  = titleM ? titleM[1].replace(/\s+/g, " ").trim() : "";

    // Meta description
    const metaM = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,300})["']/i)
                || html.match(/<meta[^>]+content=["']([^"']{1,300})["'][^>]+name=["']description["']/i);
    const meta  = metaM ? metaM[1].trim() : "";

    // H1
    const h1M = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const h1  = h1M ? h1M[1].replace(/<[^>]+>/g, "").trim() : "";

    // H2s (first 3)
    const h2s = [];
    const h2Re = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
    let m;
    while ((m = h2Re.exec(html)) !== null && h2s.length < 3) {
      h2s.push(m[1].replace(/<[^>]+>/g, "").trim());
    }

    // Schema types
    const schemaTypes = [];
    const schemaRe = /"@type"\s*:\s*"([^"]+)"/g;
    while ((m = schemaRe.exec(html)) !== null && schemaTypes.length < 5) {
      if (!schemaTypes.includes(m[1])) schemaTypes.push(m[1]);
    }

    // Rough word count (strip tags)
    const text      = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const wordCount = Math.round(text.split(" ").filter(w => w.length > 3).length / 1.3);

    // HTTPS
    const isHttps = url.startsWith("https://") || res.url?.startsWith("https://");

    // Has canonical
    const hasCanonical = /<link[^>]+rel=["']canonical["']/i.test(html);

    // Has OG image
    const hasOG = /<meta[^>]+property=["']og:image["']/i.test(html);

    return {
      title,
      titleLen:   title.length,
      meta,
      metaLen:    meta.length,
      h1,
      h2s,
      schemaTypes,
      wordCount:  Math.min(wordCount, 9999),
      isHttps:    !!isHttps,
      hasCanonical,
      hasOG,
    };
  } catch {
    return null;
  }
}

// ── Discover competitors from SERP results ─────────────────────────────────
async function discoverCompetitorsFromSERP(keywords, targetDomain, location = "in") {
  const domainCount = {};   // domain → { count, positions, snippets, titles }

  // Check top 5 keywords via SERP
  const checkKws = keywords.slice(0, 5);
  for (const kw of checkKws) {
    try {
      const serpResult = await getSERP(kw.keyword, { location });
      for (const r of serpResult.results || []) {
        if (!r.domain || r.domain === targetDomain) continue;
        if (!domainCount[r.domain]) {
          domainCount[r.domain] = { count: 0, positions: [], titles: [], snippets: [] };
        }
        domainCount[r.domain].count++;
        domainCount[r.domain].positions.push(r.position);
        if (r.title)   domainCount[r.domain].titles.push(r.title);
        if (r.snippet) domainCount[r.domain].snippets.push(r.snippet);
      }
    } catch { /* skip */ }
  }

  // Sort by frequency (most appearing = most competitive)
  return Object.entries(domainCount)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6)
    .map(([domain, data]) => ({
      domain,
      serpCount:   data.count,
      avgPosition: data.positions.length
        ? Math.round(data.positions.reduce((a, b) => a + b, 0) / data.positions.length)
        : null,
      titles:   data.titles.slice(0, 3),
      snippets: data.snippets.slice(0, 2),
    }));
}

// ── Main A4 function ───────────────────────────────────────────────────────
async function runA4(clientId, keys) {
  try {
  const brief    = await getState(clientId, "A1_brief");
  const keywords = await getState(clientId, "A3_keywords");

  if (!brief?.signedOff)  return { success: false, error: "A1 brief not signed off" };
  if (!keywords?.keywordMap && !keywords?.clusters)  return { success: false, error: "A3 keyword research must complete first" };

  const manualCompetitors = brief.competitors || [];
  const targetDomain      = new URL(brief.websiteUrl).hostname.replace("www.", "");
  const keywordMap        = keywords.keywordMap || [];

  // Geo: pick SERP location from brief
  const locationStr = (brief.targetLocations || []).join(" ").toLowerCase();
  const location    = locationStr.includes("uk") || locationStr.includes("united kingdom") ? "uk"
                    : locationStr.includes("australia") ? "au"
                    : locationStr.includes("canada") ? "ca"
                    : locationStr.includes("us") || locationStr.includes("united states") ? "us"
                    : "in";

  const checkKeywords = keywordMap
    .filter(k => k.priority === "high" || k.cluster === "generic")
    .slice(0, 10);

  // ── STEP 1: Build competitor list (manual OR auto-discovered) ─────────────
  let autoDiscovered  = false;
  let competitorDomains = manualCompetitors.map(c =>
    c.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase()
  ).filter(Boolean);

  let serpDiscoveredProfiles = []; // enriched SERP profiles for auto-discovered

  if (competitorDomains.length === 0) {
    // Auto-discover from SERP
    console.log("[A4] No competitors provided — auto-discovering from SERP...");
    serpDiscoveredProfiles = await discoverCompetitorsFromSERP(checkKeywords, targetDomain, location);
    competitorDomains = serpDiscoveredProfiles.map(p => p.domain);
    autoDiscovered = true;
    console.log(`[A4] Discovered ${competitorDomains.length} competitors: ${competitorDomains.join(", ")}`);

    // If SERP scraping returned nothing, ask LLM to suggest competitors
    if (competitorDomains.length === 0 && checkKeywords.length > 0) {
      console.log("[A4] SERP returned 0 — using LLM to suggest competitors...");
      try {
        const suggestPrompt = `You are an SEO expert. Given:
Business: ${brief.businessName} — ${brief.businessDescription || ""}
Website: ${brief.websiteUrl}
Target keywords: ${checkKeywords.slice(0,5).map(k=>k.keyword).join(", ")}
Location: ${location}

List the top 5 most likely competitor domains (just domains, no https://, no www). Return ONLY valid JSON array of strings:
["competitor1.com","competitor2.com","competitor3.com","competitor4.com","competitor5.com"]`;
        const resp = await callLLM(suggestPrompt, keys, { maxTokens: 200, temperature: 0.2 });
        const suggested = parseJSON(resp);
        if (Array.isArray(suggested) && suggested.length > 0) {
          competitorDomains = suggested.map(d =>
            d.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase()
          ).filter(Boolean).slice(0, 5);
          serpDiscoveredProfiles = competitorDomains.map(d => ({ domain: d, serpCount: null, avgPosition: null, titles: [], snippets: [] }));
          console.log(`[A4] LLM suggested ${competitorDomains.length} competitors: ${competitorDomains.join(", ")}`);
        }
      } catch { /* non-blocking — proceed with empty list */ }
    }
  }

  // ── STEP 2: SERP keyword ranking matrix (SerpAPI if available, else free SERP) ─
  const rankingMatrix = [];

  if (keys.serpapi && checkKeywords.length > 0) {
    // Paid SerpAPI path
    for (const kw of checkKeywords) {
      try {
        const gl  = location === "uk" ? "gb" : location === "au" ? "au" : location === "ca" ? "ca" : location === "us" ? "us" : "in";
        const url = `https://serpapi.com/search.json?q=${encodeURIComponent(kw.keyword)}&api_key=${keys.serpapi}&num=20&gl=${gl}&hl=en`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        const data = await res.json();
        if (data.organic_results) {
          const results    = data.organic_results.slice(0, 15);
          const clientPos  = results.findIndex(r => r.link?.includes(targetDomain));
          const compPositions = competitorDomains.map(dom => {
            const pos = results.findIndex(r => r.link?.includes(dom));
            return { competitor: dom, position: pos >= 0 ? pos + 1 : null, url: pos >= 0 ? results[pos].link : null, title: pos >= 0 ? results[pos].title : null };
          });
          rankingMatrix.push({
            keyword:    kw.keyword,
            cluster:    kw.cluster,
            clientRank: clientPos >= 0 ? clientPos + 1 : null,
            competitors: compPositions,
            topResult:  { url: results[0]?.link, title: results[0]?.title, domain: results[0]?.link ? new URL(results[0].link).hostname.replace("www.","") : null },
            opportunity: clientPos < 0 ? "not_ranking" : clientPos < 3 ? "top_3" : clientPos < 10 ? "page_1" : "below_fold",
          });
        }
      } catch { /* skip */ }
    }
  } else {
    // Free SERP path — use getSERP (DDG → Bing fallback)
    for (const kw of checkKeywords) {
      try {
        const serpResult = await getSERP(kw.keyword, { location });
        const results    = serpResult.results || [];
        const clientPos  = results.findIndex(r => (r.domain || "").includes(targetDomain));
        const compPositions = competitorDomains.map(dom => {
          const pos = results.findIndex(r => (r.domain || "").includes(dom));
          return {
            competitor: dom,
            position:   pos >= 0 ? pos + 1 : null,
            url:        pos >= 0 ? results[pos].url : null,
            title:      pos >= 0 ? results[pos].title : null,
          };
        });
        rankingMatrix.push({
          keyword:    kw.keyword,
          cluster:    kw.cluster,
          clientRank: clientPos >= 0 ? clientPos + 1 : null,
          competitors: compPositions,
          topResult:  results[0] ? { url: results[0].url, title: results[0].title, domain: results[0].domain } : null,
          opportunity: clientPos < 0 ? "not_ranking" : clientPos < 3 ? "top_3" : clientPos < 10 ? "page_1" : "below_fold",
        });
      } catch { /* skip */ }
    }
  }

  // ── STEP 3: Crawl each competitor's homepage for real SEO factors ─────────
  console.log(`[A4] Crawling ${competitorDomains.slice(0, 5).length} competitor homepages...`);
  const crawlResults = await Promise.allSettled(
    competitorDomains.slice(0, 5).map(async dom => {
      const data = await crawlCompetitorPage(`https://${dom}`);
      return { domain: dom, crawl: data };
    })
  );

  const discoveredCompetitors = competitorDomains.slice(0, 5).map((dom, i) => {
    const crawl   = crawlResults[i]?.status === "fulfilled" ? crawlResults[i].value?.crawl : null;
    const profile = serpDiscoveredProfiles.find(p => p.domain === dom) || {};
    return {
      domain:      dom,
      serpCount:   profile.serpCount   || null,
      avgPosition: profile.avgPosition || null,
      serpTitles:  profile.titles      || [],
      crawl:       crawl || null,
    };
  });

  // ── STEP 4: Build rich LLM context ────────────────────────────────────────
  const competitorContext = discoveredCompetitors.map(c => {
    const lines = [`Domain: ${c.domain}`];
    if (c.serpCount)   lines.push(`SERP appearances (top ${checkKeywords.length} keywords): ${c.serpCount}`);
    if (c.avgPosition) lines.push(`Average position: #${c.avgPosition}`);
    if (c.crawl) {
      if (c.crawl.title)       lines.push(`Title (${c.crawl.titleLen} chars): "${c.crawl.title}"`);
      if (c.crawl.meta)        lines.push(`Meta (${c.crawl.metaLen} chars): "${c.crawl.meta}"`);
      if (c.crawl.h1)          lines.push(`H1: "${c.crawl.h1}"`);
      if (c.crawl.h2s?.length) lines.push(`H2s: ${c.crawl.h2s.join(" | ")}`);
      if (c.crawl.schemaTypes?.length) lines.push(`Schema: ${c.crawl.schemaTypes.join(", ")}`);
      lines.push(`HTTPS: ${c.crawl.isHttps ? "Yes" : "No"} | Canonical: ${c.crawl.hasCanonical ? "Yes" : "No"} | OG: ${c.crawl.hasOG ? "Yes" : "No"}`);
      lines.push(`Approx word count: ${c.crawl.wordCount}`);
    }
    return lines.join("\n");
  }).join("\n\n---\n\n");

  const rankContext = rankingMatrix.slice(0, 8).map(r =>
    `"${r.keyword}": client=#${r.clientRank || "NR"}, ` +
    r.competitors.map(c => `${c.competitor}=#${c.position || "NR"}`).join(", ")
  ).join("\n");

  const prompt = `You are an expert SEO competitive intelligence analyst with access to REAL data.

Client: ${brief.businessName} (${brief.websiteUrl})
Client Domain: ${targetDomain}
Auto-discovered competitors: ${autoDiscovered ? "Yes (SERP-based)" : "No (manually provided)"}

COMPETITOR PROFILES (real crawl data):
${competitorContext || "(no crawl data)"}

LIVE KEYWORD RANKINGS:
${rankContext || "(no ranking data)"}

Target Keywords: ${checkKeywords.map(k => k.keyword).join(", ")}
Business: ${brief.businessDescription || brief.businessName}

Based on this REAL data, provide deep competitive analysis. Return ONLY valid JSON:
{
  "topCompetitors": [
    {
      "domain": "competitor.com",
      "threat": "high|medium|low",
      "strengths": ["strength 1", "strength 2"],
      "weaknesses": ["weakness 1", "weakness 2"],
      "contentFocus": "what topics/keywords they focus on",
      "seoTechnique": "what SEO tactics they use (schema, long-form, local SEO etc)",
      "serpVisibility": "how often they appear vs you",
      "titleStrategy": "pattern observed in their titles",
      "keyTakeaway": "the #1 thing we can learn or exploit from this competitor"
    }
  ],
  "competitorStrengths": [
    { "competitor": "domain.com", "strength": "what they do well", "threat": "high|medium|low" }
  ],
  "contentGaps": [
    {
      "topic": "topic/keyword",
      "description": "why this is a gap",
      "recommendedAction": "what page/content to create",
      "estimatedDifficulty": "low|medium|high",
      "competitorsCovering": ["domain1.com", "domain2.com"]
    }
  ],
  "quickWins": [
    { "action": "specific action to take", "keyword": "target keyword", "expectedOutcome": "expected result", "effort": "low|medium|high" }
  ],
  "contentFormats": [
    { "format": "guide|listicle|tool|comparison|local", "keyword": "keyword", "whyItWorks": "evidence from competitor data" }
  ],
  "keywordOpportunities": [
    { "keyword": "keyword", "reason": "why it's winnable", "currentLeader": "who ranks top", "approach": "how to beat them" }
  ],
  "strategicSummary": "3-4 sentence competitive positioning summary with specific actionable insight based on the real data above"
}`;

  let analysis;
  try {
    const response = await callLLM(prompt, keys, { maxTokens: 4000, temperature: 0.3 });
    analysis = parseJSON(response);
  } catch (e) {
    analysis = {
      topCompetitors:      discoveredCompetitors.map(c => ({ domain: c.domain, threat: "medium", strengths: [], weaknesses: [], contentFocus: "", seoTechnique: "", serpVisibility: "", titleStrategy: "", keyTakeaway: "" })),
      competitorStrengths: [],
      contentGaps:         [],
      quickWins:           [],
      contentFormats:      [],
      keywordOpportunities:[],
      strategicSummary:    `Competitor analysis completed with ${discoveredCompetitors.length} competitors. LLM analysis failed: ${e.message}`,
    };
  }

  // ── STEP 5: Assemble result ────────────────────────────────────────────────
  const notRankingCount = rankingMatrix.filter(r => r.opportunity === "not_ranking").length;
  const top3Count       = rankingMatrix.filter(r => r.opportunity === "top_3").length;

  const result = {
    status:    "complete",
    targetDomain,
    autoDiscovered,
    competitors:            manualCompetitors,
    discoveredCompetitors,                    // enriched profiles with crawl + SERP data
    rankingMatrix,
    hasSerpData:            rankingMatrix.length > 0,
    serpDataUsed:           true,             // always true now — free SERP always runs
    analysis,
    summary: {
      keywordsChecked:      rankingMatrix.length,
      notRanking:           notRankingCount,
      rankingTop3:          top3Count,
      rankingPage1:         rankingMatrix.filter(r => r.opportunity === "page_1").length,
      contentGapsFound:     analysis.contentGaps?.length          || 0,
      quickWinsFound:       analysis.quickWins?.length            || 0,
      competitorsAnalysed:  discoveredCompetitors.length,
      keywordOpportunities: analysis.keywordOpportunities?.length || 0,
    },
    generatedAt: new Date().toISOString(),
  };

  await saveState(clientId, "A4_competitor", result);
  return { success: true, competitor: result };
  } catch (e) {
    console.error(`[A4] Competitor analysis failed for ${clientId}:`, e.message);
    return { success: false, error: e.message };
  }
}

module.exports = { runA4 };
