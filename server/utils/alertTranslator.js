/**
 * Alert Translator — converts technical messages to business language
 */

const TRANSLATIONS = {
  // LLM / AI
  "LLM key missing":         { msg:"AI content generation is paused — your SEO automation is incomplete", severity:"warning", action:"Go to Settings → Add your Groq or Gemini API key to resume" },
  "No LLM key available":    { msg:"AI content generation is paused — your SEO automation is incomplete", severity:"warning", action:"Go to Settings → Add your Groq or Gemini API key to resume" },
  "SerpAPI key missing":     { msg:"Live keyword ranking data is unavailable — we cannot track your Google positions", severity:"warning", action:"Go to Settings → Add your SerpAPI key to enable rank tracking" },
  "PageSpeed API key missing":{ msg:"Detailed page speed analysis is limited — Core Web Vitals data may be incomplete", severity:"info", action:"Go to Settings → Add your Google PageSpeed API key for real CWV data" },
  "Google key not provided":  { msg:"Google services are not connected — some analytics and speed data is unavailable", severity:"info", action:"Go to Settings → Add your Google API key" },

  // GSC
  "GSC not connected":       { msg:"Google Search Console not connected — we cannot see your actual search traffic data", severity:"warning", action:"Connect Google Search Console from the Search Console tab" },
  "No GSC data":             { msg:"No search traffic data available yet — Google Search Console needs to be connected", severity:"info", action:"Connect Google Search Console to see clicks, impressions, and ranking keywords" },

  // Pipeline / Agents
  "A2 failed":               { msg:"Technical SEO health check failed — your website may be blocking our scanner", severity:"critical", action:"Check your website is live and accessible, then re-run the analysis" },
  "A3 failed":               { msg:"Keyword research incomplete — some action plan items may be missing", severity:"warning", action:"Re-run keyword research from the Pipeline tab" },
  "A4 failed":               { msg:"Competitor analysis could not complete — quick win opportunities may be missed", severity:"info", action:"Re-run competitor analysis from the Pipeline tab" },
  "A9 failed":               { msg:"Strategy report generation failed — your action plan may be incomplete", severity:"warning", action:"Re-run the report from the Pipeline tab" },
  "Audit failed":            { msg:"SEO health check failed — your website may be down or blocking our scanner", severity:"critical", action:"Verify your website is accessible and re-run the full analysis" },
  "Pipeline failed":         { msg:"Full SEO analysis stopped midway — some sections may show incomplete data", severity:"warning", action:"Re-run the full analysis from the top of the Pipeline tab" },

  // Rankings / Traffic
  "No ranking data":         { msg:"No keyword ranking baseline recorded yet — we cannot measure your Google position improvements", severity:"info", action:"Connect Google Search Console or run a full analysis to establish your baseline" },
  "low_keyword_visibility":  { msg:"Most of your target keywords are not ranking on Google — you are invisible to potential customers", severity:"critical", action:"Review your Content Gaps in the Action Plan and create targeted content pages" },
  "poor_mobile_performance": { msg:"Your website loads slowly on mobile — Google is penalising your rankings because of this", severity:"critical", action:"Check the Action Plan → Technical section for specific speed fixes" },
  "low_mobile_performance":  { msg:"Your website's mobile speed needs improvement — this is reducing your Google rankings", severity:"warning", action:"Review the CWV tab for specific performance improvements" },

  // SEO Issues
  "missing_title":           { msg:"Some pages have no page title — Google cannot understand what those pages are about", severity:"critical", action:"Go to Action Plan → Fix the 'Missing title tag' tasks" },
  "redirect_chain":          { msg:"Your website has unnecessary page redirects — this slows down your site and reduces ranking power", severity:"warning", action:"Fix the redirect chain from the Technical tab" },
  "missing_sitemap":         { msg:"Google cannot find your full sitemap — some pages may not be indexed in search results", severity:"warning", action:"Generate and submit your XML sitemap from the Sitemap Generator tool" },
  "thin_content":            { msg:"Some pages have too little content — Google considers them low quality and ranks them poorly", severity:"critical", action:"Go to Action Plan → Content section and expand thin pages with valuable content" },
  "no_ssl":                  { msg:"Your website does not use HTTPS — Google marks it as 'Not Secure' and ranks it lower", severity:"critical", action:"Enable SSL/HTTPS on your website immediately — contact your hosting provider" },
};

/**
 * Translate a technical alert to business language
 * @param {string} message — raw technical alert message
 * @param {string} type    — issue type code
 * @returns {{ businessMessage, severity, businessAction }}
 */
function translateAlert(message, type) {
  // Try exact match on type first, then message
  const match = TRANSLATIONS[type] || TRANSLATIONS[message] ||
    Object.entries(TRANSLATIONS).find(([k]) =>
      message?.toLowerCase().includes(k.toLowerCase())
    )?.[1];

  if (match) {
    return {
      businessMessage: match.msg,
      severity:        match.severity || "info",
      businessAction:  match.action   || "Review your pipeline settings",
      originalMessage: message,
    };
  }

  // Fallback: clean up technical language
  return {
    businessMessage: cleanTechnicalMessage(message),
    severity:        "info",
    businessAction:  "Review your SEO pipeline for details",
    originalMessage: message,
  };
}

function cleanTechnicalMessage(msg) {
  if (!msg) return "An SEO issue was detected";
  return msg
    .replace(/A[0-9]+/g, "SEO Analysis")
    .replace(/Firestore|Firebase|LLM|API|JSON|HTTP/gi, "service")
    .replace(/null|undefined/gi, "not available")
    .replace(/_/g, " ")
    .replace(/\b[A-Z]{2,}\b/g, w => w.charAt(0) + w.slice(1).toLowerCase());
}

const SEVERITY_LABELS = {
  critical: { label:"🔴 Critical — Blocking SEO Growth",   color:"#DC2626", bg:"#DC262610" },
  warning:  { label:"🟡 Important — Reducing Effectiveness",color:"#D97706", bg:"#D9770610" },
  info:     { label:"🔵 Informational",                    color:"#0891B2", bg:"#0891B210" },
};

module.exports = { translateAlert, SEVERITY_LABELS };
