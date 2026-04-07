const { getState, saveState } = require("../shared-state/stateManager");
const { callLLM, parseJSON }  = require("../utils/llm");

/**
 * A19 — Conversion Agent (Sprint 4)
 *
 * Triggered when: traffic is good but leads/sales are low.
 * Analyses: CTAs, landing pages, forms, page structure, trust signals.
 * Output: specific conversion rate optimisation (CRO) fixes.
 */
async function runA19(clientId, keys) {
  const [brief, audit, report, keywords, technical] = await Promise.all([
    getState(clientId, "A1_brief").catch(() => null),
    getState(clientId, "A2_audit").catch(() => null),
    getState(clientId, "A3_keywords").catch(() => null),
    getState(clientId, "A9_report").catch(() => null),
    getState(clientId, "A7_technical").catch(() => null),
  ]);

  if (!brief) return { success: false, error: "No brief found — run A1 first" };

  const siteUrl = brief.websiteUrl;
  const kpis    = brief.kpiSelection || ["Lead Generation"];

  // ── Crawl homepage for CRO signals ─────────────────
  const croSignals = await crawlForCRO(siteUrl);

  // ── LLM analysis ───────────────────────────────────
  const gsc = report?.gscSummary;
  const traffic = gsc?.totalClicks || 0;

  const prompt = `You are a Conversion Rate Optimisation (CRO) specialist. Analyse this website and identify why visitors aren't converting.

Website: ${siteUrl}
Business: ${brief.businessName}
Primary KPIs: ${kpis.join(", ")}
Conversion Goal: ${brief.conversionGoal || "Not specified"}
Monthly Traffic (GSC): ${traffic} clicks
Average Position: ${gsc?.avgPos?.toFixed(1) || "Unknown"}

## Page Signals Detected
- Has H1: ${croSignals.hasH1}
- CTA buttons found: ${croSignals.ctaCount} (texts: ${croSignals.ctaTexts.slice(0,5).join(", ") || "none"})
- Phone number visible: ${croSignals.hasPhone}
- Trust signals (reviews/awards): ${croSignals.hasTrustSignals}
- Form detected: ${croSignals.hasForm}
- Above-fold CTA: ${croSignals.hasAboveFoldCTA}
- Mobile viewport: ${croSignals.hasMobileViewport}
- Page load score: ${technical?.summary?.mobileScore || "Unknown"}/100
- Word count (homepage): ${croSignals.wordCount}
- Social proof mentions: ${croSignals.hasSocialProof}

Return ONLY valid JSON:
{
  "overallCRO": "weak|average|strong",
  "conversionBlockers": [
    { "issue": "No above-fold CTA", "impact": "high", "fix": "Add a clear CTA button in the hero section", "example": "Get a Free Quote →" }
  ],
  "quickWins": ["specific 1-line action items that can be implemented today"],
  "landingPageAudit": { "verdict": "one sentence", "topFix": "most impactful single change" },
  "estimatedCRLift": "e.g. +0.5–1.5% CR improvement if top 3 fixes applied"
}`;

  let analysis;
  try {
    const raw  = await callLLM(prompt, keys, { maxTokens: 2000, temperature: 0.3 });
    analysis   = parseJSON(raw);
  } catch {
    analysis = buildFallbackCRO(croSignals, brief);
  }

  const result = {
    siteUrl,
    croSignals,
    overallCRO:          analysis.overallCRO || "unknown",
    conversionBlockers:  analysis.conversionBlockers || [],
    quickWins:           analysis.quickWins || [],
    landingPageAudit:    analysis.landingPageAudit || {},
    estimatedCRLift:     analysis.estimatedCRLift || null,
    traffic,
    kpis,
    analysedAt: new Date().toISOString(),
  };

  await saveState(clientId, "A19_conversion", result);
  return { success: true, conversion: result };
}

async function crawlForCRO(siteUrl) {
  const signals = {
    hasH1: false, ctaCount: 0, ctaTexts: [], hasPhone: false,
    hasTrustSignals: false, hasForm: false, hasAboveFoldCTA: false,
    hasMobileViewport: false, wordCount: 0, hasSocialProof: false,
  };

  try {
    const res = await fetch(siteUrl, { signal: AbortSignal.timeout(10000), headers: { "User-Agent": "SEO-Agent-Audit/1.0" } });
    if (!res.ok) return signals;
    const html = res.text ? await res.text() : "";

    signals.hasH1           = /<h1[^>]*>/i.test(html);
    signals.hasMobileViewport = /<meta[^>]*name=["']viewport["']/i.test(html);
    signals.hasForm         = /<form[^>]*>/i.test(html);
    signals.hasPhone        = /tel:|(?:\+\d{1,3}[-\s]?)?\(?\d{3}\)?[-\s]?\d{3}[-\s]?\d{4}/.test(html);
    signals.hasTrustSignals = /review|award|accredit|certif|trusted|5[\s-]star|rated/i.test(html);
    signals.hasSocialProof  = /customer|client|testimonial|case study|people love|join.*customers/i.test(html);

    // CTA detection
    const ctaPatterns = /(?:get|book|start|request|contact|buy|shop|order|download|sign\s*up|try|learn|view|see)[^<]{0,30}(?:free|now|today|quote|demo|trial|started|more)/gi;
    const ctaMatches  = [...html.matchAll(/<(?:button|a)[^>]*>([^<]{3,60})<\/(?:button|a)>/gi)];
    signals.ctaTexts  = ctaMatches.map(m => m[1].replace(/\s+/g, " ").trim()).filter(t => /get|book|start|buy|contact|free|quote/i.test(t)).slice(0, 5);
    signals.ctaCount  = ctaMatches.length;

    // Above-fold CTA (in first 3000 chars — rough hero section proxy)
    const hero = html.slice(0, 3000);
    signals.hasAboveFoldCTA = /<(?:button|a)[^>]*>/i.test(hero) && /get|book|start|buy|contact/i.test(hero);

    // Word count estimate
    const stripped = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    signals.wordCount = stripped.split(" ").filter(w => w.length > 2).length;

  } catch { /* non-blocking */ }

  return signals;
}

function buildFallbackCRO(signals, brief) {
  const blockers = [];
  if (!signals.hasAboveFoldCTA) blockers.push({ issue:"No above-fold CTA", impact:"high", fix:"Add a prominent CTA button in the hero section", example:"Get a Free Quote →" });
  if (!signals.hasForm)         blockers.push({ issue:"No contact form detected", impact:"high", fix:"Add a short enquiry form (Name, Email, Message) on the homepage", example:"3-field form above the fold" });
  if (!signals.hasPhone)        blockers.push({ issue:"Phone number not visible", impact:"medium", fix:"Add click-to-call phone number in the header", example:"+44 20 XXXX XXXX" });
  if (!signals.hasTrustSignals) blockers.push({ issue:"No trust signals (reviews/awards)", impact:"medium", fix:"Add Google reviews widget or client logos", example:"'⭐ 4.9 stars — 120 reviews'" });
  if (!signals.hasSocialProof)  blockers.push({ issue:"No social proof", impact:"medium", fix:"Add 2-3 client testimonials to the homepage", example:"Short quote + client name + company" });
  return {
    overallCRO: blockers.length > 3 ? "weak" : blockers.length > 1 ? "average" : "strong",
    conversionBlockers: blockers,
    quickWins: blockers.slice(0,3).map(b => b.fix),
    landingPageAudit: { verdict: `${blockers.length} conversion blockers found`, topFix: blockers[0]?.fix || "Run pipeline for analysis" },
    estimatedCRLift: "+0.5–1.5% CR if top fixes applied",
  };
}

module.exports = { runA19 };
