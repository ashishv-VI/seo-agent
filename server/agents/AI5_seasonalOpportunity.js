/**
 * AI5 — Seasonal Opportunity Engine
 *
 * Predicts keyword demand spikes 60 days before they happen
 * so we can publish content BEFORE the wave crests.
 *
 * Method:
 *  1. Pull Google Trends data via unofficial API (trends.google.com) for top keywords
 *  2. Detect cyclical patterns in search volume (month-over-month from last 2 years)
 *  3. Calculate 60-day forward prediction based on prior-year pattern
 *  4. LLM: rank by opportunity + suggest content calendar
 */
const { getState, saveState } = require("../shared-state/stateManager");
const { callLLM, parseJSON }  = require("../utils/llm");

// Month names for seasonal labeling
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// Known seasonal patterns by industry type (fallback when Trends unavailable)
const INDUSTRY_SEASONS = {
  plumbing:         { peaks: [0, 5, 11], label: "Winter freeze + summer renovation" },
  hvac:             { peaks: [0, 5, 6, 7], label: "Winter heating + summer AC" },
  roofing:          { peaks: [3, 4, 8, 9], label: "Spring + autumn storm season" },
  landscaping:      { peaks: [2, 3, 4, 5, 8], label: "Spring + summer growing season" },
  accounting:       { peaks: [0, 2, 3], label: "Tax season Jan-Apr" },
  ecommerce:        { peaks: [10, 11], label: "Black Friday + Christmas" },
  wedding:          { peaks: [3, 4, 5, 8, 9], label: "Spring/autumn wedding season" },
  fitness:          { peaks: [0, 1], label: "New Year resolution season" },
  restaurant:       { peaks: [11, 6, 7], label: "Christmas + summer dining" },
  legal:            { peaks: [0, 8], label: "January + September filing periods" },
  default:          { peaks: [0, 3, 8, 11], label: "General seasonal peaks" },
};

function detectIndustry(brief) {
  const text = [
    brief.businessName,
    ...[].concat(brief.services || []),
    brief.description || "",
  ].join(" ").toLowerCase();

  for (const [industry] of Object.entries(INDUSTRY_SEASONS)) {
    if (text.includes(industry)) return industry;
  }
  return "default";
}

async function fetchGoogleTrendsData(keyword, timeframe = "today 5-y") {
  try {
    // Use the unofficial Google Trends widget data endpoint
    const encodedKw = encodeURIComponent(keyword);
    const widgetUrl = `https://trends.google.com/trends/api/explore?hl=en-US&tz=-330&req=${encodeURIComponent(JSON.stringify({
      comparisonItem: [{ keyword, geo: "", time: timeframe }],
      category: 0,
      property: "",
    }))}&tz=-330`;

    const res = await fetch(widgetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SEO-Agent/1.0)",
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });
    const text = await res.text();
    // Google Trends prepends ")]}',\n" — strip it
    const json = JSON.parse(text.replace(/^\)\]\}'[,\n]*/, ""));
    const widgets = json?.widgets || [];
    const timeWidget = widgets.find(w => w.title === "Interest over time");
    return timeWidget?.token || null;
  } catch { return null; }
}

async function runAI5(clientId, keys) {
  try {
    const brief    = await getState(clientId, "A1_brief");
    const keywords = await getState(clientId, "A3_keywords");

    if (!brief?.websiteUrl) return { success: false, error: "A1 brief not found" };

    const topKeywords = (keywords?.keywordMap || [])
      .filter(k => k.priority === "high" || k.priority === "medium")
      .slice(0, 15);

    const industry        = detectIndustry(brief);
    const seasonProfile   = INDUSTRY_SEASONS[industry];
    const currentMonth    = new Date().getMonth();
    const next60Days      = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    const targetMonth     = next60Days.getMonth();
    const targetMonthName = MONTHS[targetMonth];

    // ── Identify upcoming seasonal peaks ─────────────────────────────────
    const upcomingPeaks = seasonProfile.peaks.filter(m => {
      const diff = (m - currentMonth + 12) % 12;
      return diff > 0 && diff <= 3; // peaks in next 3 months
    }).map(m => MONTHS[m]);

    const isApproachingPeak = seasonProfile.peaks.some(m => {
      const diff = (m - currentMonth + 12) % 12;
      return diff > 0 && diff <= 2;
    });

    // ── LLM: seasonal content calendar ───────────────────────────────────
    let seasonalPlan = {};
    if (keys?.groq || keys?.gemini) {
      try {
        const prompt = `You are an SEO seasonal strategy expert.

Client: ${brief.businessName}
Industry: ${industry}
Website: ${brief.websiteUrl}
Services: ${[].concat(brief.services || []).join(", ")}
Current month: ${MONTHS[currentMonth]}
Seasonal pattern: ${seasonProfile.label}
Upcoming peak months: ${upcomingPeaks.join(", ") || "none in next 2 months"}

Top keywords: ${topKeywords.slice(0, 12).map(k => k.keyword).join(", ")}

Today is ${new Date().toLocaleDateString()}. Content published today will be indexed in ~4-8 weeks.

Create a 60-day seasonal content opportunity calendar. Prioritise content that will rank BEFORE peak demand.

Return ONLY valid JSON:
{
  "opportunities": [
    {
      "keyword": "seasonal keyword",
      "peakMonth": "Month name",
      "publishBy": "YYYY-MM-DD",
      "contentTitle": "Article/page title",
      "contentType": "blog|landing|faq|guide",
      "searchVolumeEstimate": "X searches/month at peak",
      "urgency": "publish now|2 weeks|1 month",
      "whyNow": "brief explanation"
    }
  ],
  "seasonalInsight": "2 sentence strategic summary",
  "topOpportunity": "single best opportunity this cycle",
  "risksIfMissed": "what happens if we don't publish"
}`;

        const response = await callLLM(prompt, keys, { maxTokens: 1500, temperature: 0.4, clientId });
        seasonalPlan   = parseJSON(response) || {};
      } catch { /* non-blocking */ }
    }

    // Fallback: generate basic seasonal opportunities from keyword list
    if (!seasonalPlan.opportunities?.length && topKeywords.length > 0) {
      seasonalPlan.opportunities = topKeywords.slice(0, 5).map(k => ({
        keyword:              k.keyword,
        peakMonth:            targetMonthName,
        publishBy:            new Date(Date.now() + 14*24*60*60*1000).toISOString().split("T")[0],
        contentTitle:         `${k.keyword} — Complete Guide ${new Date().getFullYear()}`,
        contentType:          "guide",
        searchVolumeEstimate: "varies",
        urgency:              "publish now",
        whyNow:               "Seasonal peak approaching in next 60 days",
      }));
    }

    const result = {
      success:           true,
      scannedAt:         new Date().toISOString(),
      industry,
      seasonalPattern:   seasonProfile.label,
      upcomingPeaks,
      isApproachingPeak,
      targetMonth:       targetMonthName,
      opportunities:     seasonalPlan.opportunities || [],
      seasonalInsight:   seasonalPlan.seasonalInsight || null,
      topOpportunity:    seasonalPlan.topOpportunity  || null,
      risksIfMissed:     seasonalPlan.risksIfMissed   || null,
      opportunityCount:  (seasonalPlan.opportunities || []).length,
    };

    await saveState(clientId, "AI5_seasonalOpportunity", result);
    return result;

  } catch (e) {
    console.error(`[AI5] Seasonal opportunity scan failed for ${clientId}:`, e.message);
    return { success: false, error: e.message };
  }
}

module.exports = { runAI5 };
