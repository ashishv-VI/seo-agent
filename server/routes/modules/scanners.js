/**
 * Scanner (POST) routes — extracted from routes/agents.js (Sprint 1, Story M6.16).
 *
 * On-demand POST /scan endpoints that run each scanner and persist output.
 * Mounted by agents.js under the same base path (/api/agents), so the public
 * endpoints are unchanged:
 *   POST /api/agents/:clientId/A25/scan             — Core Update Scanner
 *   POST /api/agents/:clientId/aio/scan             — AI Overview tracker
 *   POST /api/agents/:clientId/ai-citations/scan    — AI citation tracker
 *   POST /api/agents/:clientId/serp-features/scan   — SERP feature tracker
 *   POST /api/agents/:clientId/local-citations/scan — local citation audit
 *
 * Routes moved verbatim, in original order. Middleware (verifyToken), ownership
 * (getClientDoc), the inline runA25 require, getState/getUserKeys usage, fetch +
 * AbortSignal.timeout logic, Firestore collection names + writes, status codes,
 * and response JSON are identical to the originals. The matching GET /results
 * routes were already extracted to ./modules/results (M6.4) and are untouched.
 */
const express       = require("express");
const router        = express.Router();
const { db }        = require("../../config/firebase");
const { verifyToken } = require("../../middleware/auth");
const { getUserKeys } = require("../../utils/getUserKeys");
const { getState }  = require("../../shared-state/stateManager");
const { getClientDoc } = require("../shared/clientOwnership");

// POST /:clientId/A25/scan — run Core Update Scanner on-demand
router.post("/:clientId/A25/scan", verifyToken, async (req, res) => {
  try {
    await getClientDoc(req.params.clientId, req.uid);
    const { runA25 } = require("../../agents/A25_coreUpdateScanner");
    const keys = await getUserKeys(req.uid);
    const result = await runA25(req.params.clientId, keys);
    return res.json(result);
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// GET /:clientId/A25/results — latest Core Update Scanner results
// GET /:clientId/A25/results extracted verbatim to ./modules/results (Sprint 1,
// M6.4) and mounted near the top of this file. Behaviour and path are unchanged.

// ── AIO Tracker — Google AI Overview monitoring ─────────────────────────────
// Checks whether each tracked keyword appears in an AI Overview box on Bing/Google
// by scraping the SERP HTML and detecting AI answer box patterns.
// Stores results in aio_tracker/{clientId} Firestore doc.

router.post("/:clientId/aio/scan", verifyToken, async (req, res) => {
  try {
    const { clientId } = req.params;
    await getClientDoc(clientId, req.uid);

    const keywords = await getState(clientId, "A3_keywords");
    const brief    = await getState(clientId, "A1_brief");
    if (!keywords?.keywordMap?.length) return res.status(400).json({ error: "Run A3 keywords first" });

    const kws = keywords.keywordMap.slice(0, 15).map(k => k.keyword);
    const domain = brief?.websiteUrl ? new URL(brief.websiteUrl).hostname.replace("www.", "") : null;

    const results = [];
    for (const kw of kws) {
      try {
        // Bing SERP — AI overview box appears as data-tag="RelaxedQuery" or .b_ans
        const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(kw)}&mkt=en-IN`;
        const r = await fetch(bingUrl, {
          signal: AbortSignal.timeout(12000),
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept": "text/html",
          },
        });
        if (!r.ok) { results.push({ keyword: kw, aioPresent: false, error: `HTTP ${r.status}` }); continue; }
        const html = await r.text();

        // Detect AI Overview / Copilot answer box
        const hasAIO = /class=["'][^"']*b_codeSnippet|CopilotAnswer|b_wbAns|ai-answer|sydney-answer|ai_feedback/i.test(html)
          || /data-tag=["']Copilot|AIAnswer|ai-generated/i.test(html)
          || /(?:AI-generated|Generative AI|Based on sources)/i.test(html);

        // Check if client domain appears in AIO sources
        const clientInAIO = domain && hasAIO && html.includes(domain);

        // Featured snippet (position 0)
        const hasFeaturedSnippet = /class=["'][^"']*b_ans\b|b_algoSlim\b/i.test(html);

        // PAA boxes
        const paaMatches = [...html.matchAll(/class=["'][^"']*b_sugexp[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi)];
        const paaQuestions = paaMatches.slice(0, 4).map(m => m[1].replace(/<[^>]+>/g, "").trim()).filter(Boolean);

        results.push({
          keyword:       kw,
          aioPresent:    hasAIO,
          clientInAIO:   clientInAIO,
          featuredSnippet: hasFeaturedSnippet,
          paaQuestions:  paaQuestions,
          checkedAt:     new Date().toISOString(),
        });

        await new Promise(r2 => setTimeout(r2, 800)); // polite delay
      } catch (e) {
        results.push({ keyword: kw, aioPresent: false, error: e.message });
      }
    }

    const summary = {
      totalChecked:   results.length,
      aioPresent:     results.filter(r => r.aioPresent).length,
      clientInAIO:    results.filter(r => r.clientInAIO).length,
      featuredSnippets: results.filter(r => r.featuredSnippet).length,
      checkedAt:      new Date().toISOString(),
    };

    await db.collection("aio_tracker").doc(clientId).set({ clientId, keywords: results, summary, updatedAt: new Date().toISOString() });

    return res.json({ success: true, summary, keywords: results });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// GET /:clientId/aio/results extracted verbatim to ./modules/results (Sprint 1,
// M6.4) and mounted near the top of this file. Behaviour and path are unchanged.

// ── AI Citation Tracker — ChatGPT / Perplexity / Gemini ────────────────────
// Strategy (zero paid API):
//   1. Bing AI answers (Copilot) — scrape Bing SERP for Copilot citation boxes
//   2. Perplexity — if perplexityKey in user keys, call Perplexity API
//   3. Gemini suggestions — scrape Google "AI Overviews" sources from SERP
// Stores results in ai_citations/{clientId} Firestore doc.

router.post("/:clientId/ai-citations/scan", verifyToken, async (req, res) => {
  try {
    const { clientId } = req.params;
    await getClientDoc(clientId, req.uid);

    const keys     = await getUserKeys(req.uid);
    const keywords = await getState(clientId, "A3_keywords");
    const brief    = await getState(clientId, "A1_brief");
    if (!keywords?.keywordMap?.length) return res.status(400).json({ error: "Run A3 keywords first" });

    const domain  = brief?.websiteUrl ? new URL(brief.websiteUrl).hostname.replace("www.", "") : null;
    const kws     = keywords.keywordMap.slice(0, 10).map(k => k.keyword);
    const results = [];

    for (const kw of kws) {
      const entry = { keyword: kw, sources: [], citedBy: [], checkedAt: new Date().toISOString() };

      // ── Bing Copilot citation check ─────────────────────────────────────────
      try {
        const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(kw)}&setlang=en`;
        const r = await fetch(bingUrl, {
          signal: AbortSignal.timeout(12000),
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
          },
        });
        if (r.ok) {
          const html = await r.text();
          // Bing Copilot citations appear in .b_codeSnippet, .b_wbAns, .sydney-citation
          const hasCopilot = /sydney-citation|CopilotAnswer|b_codeSnippet|b_wbAns/i.test(html);
          if (hasCopilot) {
            entry.citedBy.push("Bing Copilot");
            // Extract cited source URLs from Copilot answer
            const citationUrls = [...html.matchAll(/sydney-citation[^>]*href=["']([^"']+)["']/gi)].map(m => m[1]);
            entry.sources.push(...citationUrls.slice(0, 5));
          }
          // Is our domain in the Copilot citations?
          entry.bingCopilotCited = hasCopilot && domain && entry.sources.some(s => s.includes(domain));
          entry.bingCopilotPresent = hasCopilot;
        }
      } catch { /* skip */ }

      // ── Perplexity API (if key configured) ─────────────────────────────────
      if (keys?.perplexityKey) {
        try {
          const prxRes = await fetch("https://api.perplexity.ai/chat/completions", {
            method: "POST",
            signal: AbortSignal.timeout(15000),
            headers: {
              "Authorization": `Bearer ${keys.perplexityKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "sonar",
              messages: [{ role: "user", content: `${kw}` }],
              return_citations: true,
              max_tokens: 400,
            }),
          });
          if (prxRes.ok) {
            const prxData = await prxRes.json();
            const citations = prxData?.citations || [];
            entry.sources.push(...citations);
            const domainCited = domain && citations.some(c => c.includes(domain));
            entry.perplexityCited = domainCited;
            entry.perplexityPresent = citations.length > 0;
            if (domainCited) entry.citedBy.push("Perplexity");
          }
        } catch { /* skip */ }
      }

      // ── Google AI Overview source check ─────────────────────────────────────
      try {
        const gUrl = `https://www.google.com/search?q=${encodeURIComponent(kw)}&hl=en`;
        const gRes = await fetch(gUrl, {
          signal: AbortSignal.timeout(12000),
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
            "Accept-Language": "en-US",
          },
        });
        if (gRes.ok) {
          const gHtml = await gRes.text();
          const hasAIO = /data-attrid=["']AIOverview\b|class=["'][^"']*ai-overview/i.test(gHtml)
            || /AI-generated content|Based on sources/i.test(gHtml);
          entry.googleAIOPresent = hasAIO;
          entry.googleAIOCited   = hasAIO && domain && gHtml.includes(domain);
          if (entry.googleAIOCited) entry.citedBy.push("Google AI Overview");
        }
      } catch { /* skip */ }

      entry.anyCitation = entry.citedBy.length > 0;
      results.push(entry);
      await new Promise(r2 => setTimeout(r2, 1000));
    }

    const summary = {
      totalChecked:     results.length,
      bingCopilotCited: results.filter(r => r.bingCopilotCited).length,
      perplexityCited:  results.filter(r => r.perplexityCited).length,
      googleAIOCited:   results.filter(r => r.googleAIOCited).length,
      anyCitation:      results.filter(r => r.anyCitation).length,
      hasPerplexityKey: !!keys?.perplexityKey,
      checkedAt:        new Date().toISOString(),
    };

    await db.collection("ai_citations").doc(clientId).set({ clientId, keywords: results, summary, updatedAt: new Date().toISOString() });
    return res.json({ success: true, summary, keywords: results });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// GET /:clientId/ai-citations/results extracted verbatim to ./modules/results
// (Sprint 1, M6.4) and mounted near the top of this file. Behaviour and path
// are unchanged.

// ── SERP Feature Tracker — Featured Snippet, PAA, Knowledge Panel, Image Pack ─
// Scrapes Bing SERP HTML for each keyword and detects which SERP features fire.
// Zero paid APIs — pure HTML scraping with feature fingerprinting.
// Stores results in serp_features/{clientId} Firestore doc.

router.post("/:clientId/serp-features/scan", verifyToken, async (req, res) => {
  try {
    const { clientId } = req.params;
    await getClientDoc(clientId, req.uid);

    const keywords = await getState(clientId, "A3_keywords");
    const brief    = await getState(clientId, "A1_brief");
    if (!keywords?.keywordMap?.length) return res.status(400).json({ error: "Run A3 keywords first" });

    const domain = brief?.websiteUrl ? new URL(brief.websiteUrl).hostname.replace("www.", "") : null;
    const kws    = keywords.keywordMap.slice(0, 15).map(k => k.keyword);
    const results = [];

    for (const kw of kws) {
      try {
        const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(kw)}&setlang=en&cc=US`;
        const r = await fetch(bingUrl, {
          signal: AbortSignal.timeout(12000),
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
          },
        });

        if (!r.ok) { results.push({ keyword: kw, error: `HTTP ${r.status}` }); continue; }
        const html = await r.text();

        // ── SERP feature detection fingerprints ────────────────────────────
        // Featured Snippet (answer box)
        const featuredSnippet = /class=["'][^"']*b_ans\b[^"']*["']|b_algoSlim|b_answerCard/i.test(html);
        // Check if client is in featured snippet
        const featuredSnippetOwned = featuredSnippet && domain && html.substring(0, html.indexOf("b_results") || html.length).includes(domain);

        // PAA (People Also Ask)
        const paaPresent = /b_paa|b_accordion|people.also.ask|related.questions/i.test(html);
        const paaMatches = [...html.matchAll(/<div[^>]+class=["'][^"']*b_accordion[^"']*["'][^>]*>[\s\S]*?<div[^>]+class=["'][^"']*b_title[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)]
          .map(m => m[1].replace(/<[^>]+>/g, "").trim()).filter(Boolean).slice(0, 5);

        // Knowledge Panel
        const knowledgePanel = /b_entityTP|b_entity_side|entity_sidebar|b_entitySlider/i.test(html);

        // Image Pack
        const imagePack = /b_imgSerpCite|b_imageSerpCite|b_imgResult|image.pack/i.test(html);

        // Video results
        const videoPack = /b_videoResult|b_onPageEntity.*video|b_videoSerpCite/i.test(html);

        // Local Pack (maps / local results)
        const localPack = /b_localResults|b_lstItem|localOneBox|maps\.bing\.com/i.test(html);

        // Shopping ads / product listing
        const shoppingPack = /b_sideImages|bing\.com\/shop|productSerpCard/i.test(html);

        // Sitelinks
        const sitelinks = /b_deep|b_deeplinks|b_sitelinks/i.test(html);

        // Top stories
        const topStories = /b_newsResult|b_nwsResult|TopStories/i.test(html);

        const features = [];
        if (featuredSnippet)  features.push({ type: "featured_snippet", owned: featuredSnippetOwned });
        if (paaPresent)       features.push({ type: "people_also_ask",  questions: paaMatches });
        if (knowledgePanel)   features.push({ type: "knowledge_panel" });
        if (imagePack)        features.push({ type: "image_pack" });
        if (videoPack)        features.push({ type: "video_pack" });
        if (localPack)        features.push({ type: "local_pack" });
        if (shoppingPack)     features.push({ type: "shopping" });
        if (sitelinks)        features.push({ type: "sitelinks" });
        if (topStories)       features.push({ type: "top_stories" });

        results.push({
          keyword:            kw,
          features,
          featureCount:       features.length,
          hasOpportunity:     featuredSnippet && !featuredSnippetOwned,
          checkedAt:          new Date().toISOString(),
        });

        await new Promise(r2 => setTimeout(r2, 700));
      } catch (e) {
        results.push({ keyword: kw, features: [], error: e.message });
      }
    }

    const summary = {
      totalChecked:      results.length,
      withFeatures:      results.filter(r => r.featureCount > 0).length,
      featuredSnippets:  results.filter(r => r.features?.some(f => f.type === "featured_snippet")).length,
      ownedSnippets:     results.filter(r => r.features?.some(f => f.type === "featured_snippet" && f.owned)).length,
      paaPresent:        results.filter(r => r.features?.some(f => f.type === "people_also_ask")).length,
      localPacks:        results.filter(r => r.features?.some(f => f.type === "local_pack")).length,
      opportunities:     results.filter(r => r.hasOpportunity).length,
      checkedAt:         new Date().toISOString(),
    };

    await db.collection("serp_features").doc(clientId).set({ clientId, keywords: results, summary, updatedAt: new Date().toISOString() });
    return res.json({ success: true, summary, keywords: results });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// GET /:clientId/serp-features/results extracted verbatim to ./modules/results
// (Sprint 1, M6.4) and mounted near the top of this file. Behaviour and path
// are unchanged.

// ── Content Calendar AI — 30-day automated content schedule ─────────────────
// Uses A3 keywords + A4 competitor gaps + A5 content briefs to generate a
// prioritised 30-day calendar. LLM assigns topic, keyword, format, publish date.
// Stores in content_calendar/{clientId} Firestore doc.

// POST /:clientId/content-calendar/generate, GET /:clientId/content-calendar/results,
// and PATCH /:clientId/content-calendar/:itemId/status extracted verbatim to
// ./modules/content (Sprint 1, M6.13) and mounted near the top of this file.
// Behaviour and paths are unchanged.

// ── Local Citation Audit — JustDial, Sulekha, IndiaMart, Google Maps ─────────
// Checks if the business appears on key Indian directories by searching them
// and comparing NAP (Name, Address, Phone) consistency.
// Stores results in local_citations/{clientId} Firestore doc.

router.post("/:clientId/local-citations/scan", verifyToken, async (req, res) => {
  try {
    const { clientId } = req.params;
    await getClientDoc(clientId, req.uid);

    const brief = await getState(clientId, "A1_brief");
    if (!brief?.businessName) return res.status(400).json({ error: "Run A1 onboarding first" });

    const bizName = brief.businessName;
    const city    = brief.city || brief.location || "";
    const phone   = brief.phone || "";
    const address = brief.address || "";

    const DIRECTORIES = [
      {
        id:       "justdial",
        name:     "JustDial",
        url:      `https://www.justdial.com/${encodeURIComponent(city || "india")}/${encodeURIComponent(bizName.replace(/\s+/g, "-"))}`,
        searchUrl: `https://www.justdial.com/search?q=${encodeURIComponent(bizName)}&city=${encodeURIComponent(city)}`,
        icon:     "📱",
        priority: "high",
      },
      {
        id:       "sulekha",
        name:     "Sulekha",
        url:      `https://www.sulekha.com/${encodeURIComponent(city || "india")}/${encodeURIComponent(bizName.replace(/\s+/g, "-"))}`,
        searchUrl: `https://www.sulekha.com/search?q=${encodeURIComponent(bizName)}`,
        icon:     "🔍",
        priority: "high",
      },
      {
        id:       "indiamart",
        name:     "IndiaMart",
        url:      `https://dir.indiamart.com/search.mp?ss=${encodeURIComponent(bizName)}`,
        searchUrl: `https://dir.indiamart.com/search.mp?ss=${encodeURIComponent(bizName)}`,
        icon:     "🏭",
        priority: "medium",
      },
      {
        id:       "google_maps",
        name:     "Google Maps",
        url:      `https://maps.google.com/?q=${encodeURIComponent(bizName + (city ? " " + city : ""))}`,
        searchUrl: `https://www.google.com/search?q=${encodeURIComponent(bizName + " " + city + " google maps")}`,
        icon:     "🗺️",
        priority: "high",
      },
      {
        id:       "yelp",
        name:     "Yelp",
        searchUrl: `https://www.yelp.com/search?find_desc=${encodeURIComponent(bizName)}&find_loc=${encodeURIComponent(city)}`,
        icon:     "⭐",
        priority: "medium",
      },
      {
        id:       "facebook",
        name:     "Facebook Business",
        searchUrl: `https://www.facebook.com/search/pages/?q=${encodeURIComponent(bizName)}`,
        icon:     "👥",
        priority: "medium",
      },
    ];

    const results = [];

    for (const dir of DIRECTORIES) {
      let status = "unknown";
      let napConsistent = null;
      let foundName = null;
      let foundPhone = null;
      let listingUrl = null;

      try {
        const searchRes = await fetch(dir.searchUrl, {
          signal: AbortSignal.timeout(10000),
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
            "Accept":     "text/html",
            "Accept-Language": "en-IN,en;q=0.9",
          },
          redirect: "follow",
        });

        if (searchRes.ok) {
          const html = await searchRes.text();
          // Check if business name appears in results
          const nameRegex = new RegExp(bizName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").split(" ").slice(0, 2).join("\\s*"), "i");
          const hasListing = nameRegex.test(html);

          if (hasListing) {
            status = "listed";
            foundName = bizName;

            // NAP check — look for phone number if provided
            if (phone) {
              const phoneDigits = phone.replace(/\D/g, "").slice(-10);
              napConsistent = html.includes(phoneDigits);
            }

            // Extract first matching URL
            const urlMatch = html.match(new RegExp(`href=["']((?:[^"']*?)(?:${encodeURIComponent(bizName.split(" ")[0]).toLowerCase()}|${bizName.split(" ")[0].toLowerCase()})[^"']*)["']`, "i"));
            if (urlMatch) listingUrl = urlMatch[1];
          } else {
            status = "not_found";
          }
        } else {
          status = "check_manually";
        }
      } catch {
        status = "check_manually";
      }

      results.push({
        directoryId:   dir.id,
        directoryName: dir.name,
        icon:          dir.icon,
        priority:      dir.priority,
        status,
        napConsistent,
        listingUrl:    listingUrl || dir.url,
        searchUrl:     dir.searchUrl,
        foundName,
        foundPhone,
        checkedAt:     new Date().toISOString(),
      });

      await new Promise(r => setTimeout(r, 600));
    }

    const summary = {
      totalChecked:    results.length,
      listed:          results.filter(r => r.status === "listed").length,
      notFound:        results.filter(r => r.status === "not_found").length,
      checkManually:   results.filter(r => r.status === "check_manually").length,
      napIssues:       results.filter(r => r.napConsistent === false).length,
      coverageScore:   Math.round((results.filter(r => r.status === "listed").length / results.length) * 100),
      checkedAt:       new Date().toISOString(),
    };

    await db.collection("local_citations").doc(clientId).set({
      clientId, businessName: bizName, city, results, summary, updatedAt: new Date().toISOString(),
    });
    return res.json({ success: true, summary, results });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message });
  }
});

// GET /:clientId/local-citations/results extracted verbatim to ./modules/results
// (Sprint 1, M6.4) and mounted near the top of this file. Behaviour and path
// are unchanged.

module.exports = router;
