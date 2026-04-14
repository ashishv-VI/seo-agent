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
  try {
  const [brief, audit, report, keywords, technical] = await Promise.all([
    getState(clientId, "A1_brief").catch(() => null),
    getState(clientId, "A2_audit").catch(() => null),
    getState(clientId, "A3_keywords").catch(() => null),
    getState(clientId, "A9_report").catch(() => null),
    getState(clientId, "A7_technical").catch(() => null),
  ]);

  if (!brief) return { success: false, error: "No brief found — run A1 first" };

  const siteUrl = brief.websiteUrl;
  const kpis    = [].concat(brief.kpiSelection || ["Lead Generation"]);

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
- Above-fold CTA: ${croSignals.hasAboveFoldCTA}${croSignals.heroCtaText ? ` ("${croSignals.heroCtaText}")` : ""}
- Above-fold text-heavy: ${croSignals.aboveFoldTextHeavy}
- Form: ${croSignals.hasForm ? `${croSignals.formFieldCount} fields (${croSignals.formFields.join(", ") || "n/a"})` : "none"}
- Multi-step form: ${croSignals.formHasMultiStep}
- Click-to-call phone: ${croSignals.hasClickToCall}
- WhatsApp contact: ${croSignals.hasWhatsApp}
- Trust signals (density): ${croSignals.trustSignalCount} occurrences
- Reviews widget / client logos: ${croSignals.hasReviewsWidget} / ${croSignals.hasClientLogos}
- Testimonial count: ${croSignals.testimonialCount}
- Security badge: ${croSignals.hasSecurityBadge}
- Tap target score: ${croSignals.tapTargetScore ?? "n/a"}/100
- Chat widget: ${croSignals.hasChatWidget}
- Mobile viewport: ${croSignals.hasMobileViewport}
- Page load score: ${technical?.summary?.mobileScore || "Unknown"}/100
- Word count (homepage): ${croSignals.wordCount}

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

  const { a19CROAnalysis } = require("../utils/ruleBasedFallbacks");
  const ruleAnalysis = a19CROAnalysis(audit, brief, keywords);

  // Merge rule-based audit findings with deep signal-derived blockers
  const signalBlockers = buildSignalBlockers(croSignals);
  const mergedBlockers = [...signalBlockers, ...(ruleAnalysis.issues || [])]
    .filter((b, i, arr) => arr.findIndex(x => x.issue === b.issue) === i)
    .sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return (order[a.impact] || 3) - (order[b.impact] || 3);
    });

  let analysis = {
    overallCRO:         mergedBlockers.filter(b => b.impact === "high").length >= 3 ? "weak"
                      : mergedBlockers.length >= 5 ? "average"
                      : "strong",
    conversionBlockers: mergedBlockers,
    quickWins:          [...new Set([...mergedBlockers.slice(0, 3).map(b => b.fix), ...(ruleAnalysis.quickWins || [])])].slice(0, 5),
    landingPageAudit:   { verdict: `${mergedBlockers.length} conversion blockers found (${mergedBlockers.filter(b => b.impact === "high").length} high-impact)`, topFix: mergedBlockers[0]?.fix || "Site looks conversion-ready" },
    estimatedCRLift:    mergedBlockers.filter(b => b.impact === "high").length >= 3 ? "+2–4% CR if top fixes applied"
                      : mergedBlockers.length > 3 ? "+1.5–3% CR if top fixes applied"
                      : "+0.5–1% CR if fixes applied",
    generatedBy:        "rule-engine",
  };
  try {
    const raw     = await callLLM(prompt, keys, { maxTokens: 2000, temperature: 0.3 });
    const llmData = parseJSON(raw);
    if (llmData.conversionBlockers?.length > 0) {
      analysis = { ...analysis, ...llmData, generatedBy: "llm+rules" };
    }
  } catch {
    // Rule-based output already set
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
  } catch (e) {
    console.error(`[A19] CRO analysis failed for ${clientId}:`, e.message);
    return { success: false, error: e.message };
  }
}

// ── Deep CRO crawl: form fields, tap targets, hero CTA, trust density, friction ──
async function crawlForCRO(siteUrl) {
  const signals = {
    // Basic
    hasH1: false, hasMobileViewport: false, wordCount: 0,
    // CTAs
    ctaCount: 0, ctaTexts: [], hasAboveFoldCTA: false, heroCtaText: null,
    // Forms
    hasForm: false, formFieldCount: 0, formFields: [], formHasRequiredEmailOnly: false,
    formHasMultiStep: false,
    // Contact
    hasPhone: false, hasClickToCall: false, hasWhatsApp: false, hasEmail: false,
    // Trust
    hasTrustSignals: false, trustSignalCount: 0,
    hasSocialProof: false, testimonialCount: 0,
    hasReviewsWidget: false, hasClientLogos: false, hasSecurityBadge: false,
    // Friction / accessibility
    tapTargetScore: null, tapTargetWarnings: [],
    hasExitIntentPopup: false, hasChatWidget: false,
    aboveFoldTextHeavy: false,
    hasPrivacyLink: false,
  };

  try {
    const res = await fetch(siteUrl, { signal: AbortSignal.timeout(12000), headers: { "User-Agent": "SEO-Agent-Audit/1.0" } });
    if (!res.ok) return signals;
    const html = await res.text();

    // ── Basic ─────────────────────────────────────────
    signals.hasH1             = /<h1[^>]*>/i.test(html);
    signals.hasMobileViewport = /<meta[^>]*name=["']viewport["']/i.test(html);
    const stripped = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    signals.wordCount = stripped.split(" ").filter(w => w.length > 2).length;

    // ── Forms: extract fields, count, detect friction ─
    const formMatches = [...html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/gi)];
    if (formMatches.length > 0) {
      signals.hasForm = true;
      // Use the largest form (usually the lead form, not search)
      const biggest = formMatches.sort((a, b) => b[1].length - a[1].length)[0][1];
      const inputMatches = [...biggest.matchAll(/<(?:input|textarea|select)[^>]*\bname=["']([^"']+)["'][^>]*>/gi)];
      const uniqueFields = [...new Set(inputMatches.map(m => m[1].toLowerCase()).filter(n => !/csrf|token|honeypot|hidden/.test(n)))];
      signals.formFieldCount = uniqueFields.length;
      signals.formFields = uniqueFields.slice(0, 10);
      signals.formHasRequiredEmailOnly = uniqueFields.length === 1 && uniqueFields.some(f => /email/.test(f));
      signals.formHasMultiStep = /step-?\d|multi-?step|wizard|data-step/i.test(biggest);
    }

    // ── Contact methods ───────────────────────────────
    signals.hasPhone       = /tel:|(?:\+\d{1,3}[-\s]?)?\(?\d{3}\)?[-\s]?\d{3}[-\s]?\d{4}/.test(html);
    signals.hasClickToCall = /href=["']tel:/i.test(html);
    signals.hasWhatsApp    = /wa\.me\/|api\.whatsapp\.com|whatsapp:\/\//i.test(html);
    signals.hasEmail       = /mailto:|[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(html);

    // ── Trust density (count, not just boolean) ───────
    const trustKeywords = /\b(?:review|award|accredit|certif|trusted|iso[\s-]?\d|rated|verified|guaranteed|secure)\b/gi;
    signals.trustSignalCount = (html.match(trustKeywords) || []).length;
    signals.hasTrustSignals  = signals.trustSignalCount > 0;

    const socialProofKeywords = /\b(?:testimonial|case[\s-]study|client[\s-]story|success[\s-]story|join\s+\d+\s+(?:customers|clients)|trusted[\s-]by)\b/gi;
    const testimonialMatches = html.match(socialProofKeywords) || [];
    signals.testimonialCount = testimonialMatches.length;
    signals.hasSocialProof   = signals.testimonialCount > 0;

    signals.hasReviewsWidget = /google[\s-]?reviews|trustpilot|yotpo|reviews\.io|feefo/i.test(html);
    signals.hasClientLogos   = /<img[^>]*(?:logo|partner|client)/i.test(html) || /class=["'][^"']*(?:logos?|partners?|clients?)[^"']*["']/i.test(html);
    signals.hasSecurityBadge = /norton|mcafee|trustwave|ssl[\s-]?seal|verisign|geotrust|paypal[\s-]?verified/i.test(html);

    // ── CTAs (enhanced) ───────────────────────────────
    const ctaMatches  = [...html.matchAll(/<(?:button|a)[^>]*>([^<]{3,60})<\/(?:button|a)>/gi)];
    signals.ctaTexts  = ctaMatches.map(m => m[1].replace(/\s+/g, " ").trim()).filter(t => /\b(?:get|book|start|buy|contact|quote|demo|free|call|sign\s*up|try|request|download|enquire|submit)\b/i.test(t)).slice(0, 5);
    signals.ctaCount  = signals.ctaTexts.length;

    // ── Hero / above-fold analysis (first 4000 chars, skipping head) ─
    const bodyStart  = html.search(/<body/i);
    const hero       = html.slice(bodyStart >= 0 ? bodyStart : 0, (bodyStart >= 0 ? bodyStart : 0) + 4000);
    const heroCtaMatch = hero.match(/<(?:button|a)[^>]*>\s*([^<]{3,50})\s*<\/(?:button|a)>/i);
    if (heroCtaMatch && /\b(?:get|book|start|buy|contact|quote|demo|free|call|enquire|request)\b/i.test(heroCtaMatch[1])) {
      signals.hasAboveFoldCTA = true;
      signals.heroCtaText = heroCtaMatch[1].replace(/\s+/g, " ").trim();
    }
    // Above-fold text heaviness — more than 300 visible words in first 4000 chars = wall of text
    const heroStripped = hero.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const heroWords = heroStripped.split(" ").filter(w => w.length > 2).length;
    signals.aboveFoldTextHeavy = heroWords > 300;

    // ── Tap target heuristic (inline button/link padding) ─
    // Look for inline styles or Tailwind-style classes suggesting small touch targets
    const buttonStyles = [...html.matchAll(/<(?:button|a)[^>]*class=["']([^"']*)["']/gi)].map(m => m[1]);
    const smallIndicators = buttonStyles.filter(c => /\btext-xs|py-0|py-1|h-[1-5]\b|min-h-[0-4]/.test(c)).length;
    signals.tapTargetScore   = buttonStyles.length > 0 ? Math.round(100 - (smallIndicators / buttonStyles.length) * 100) : null;
    if (smallIndicators > 2) signals.tapTargetWarnings.push(`${smallIndicators} button/link(s) appear too small for mobile tap targets`);

    // ── Friction / engagement widgets ─────────────────
    signals.hasExitIntentPopup = /exit[-\s]?intent|on[-\s]?exit|mouseleave|popupmaker|sumo|optin|leadpages/i.test(html);
    signals.hasChatWidget      = /tawk|intercom|crisp|livechat|zendesk[-\s]?chat|hubspot[-\s]?chat|drift|freshchat|messenger/i.test(html);
    signals.hasPrivacyLink     = /privacy[-\s]?policy|gdpr/i.test(html);

  } catch { /* non-blocking */ }

  return signals;
}

// Additional CRO blockers derived from enriched signals
function buildSignalBlockers(s) {
  const blockers = [];
  if (!s.hasAboveFoldCTA) blockers.push({ issue: "No above-fold CTA", impact: "high", fix: "Add a prominent CTA button in the hero section within the first viewport", example: "Get a Free Quote →" });
  if (s.formFieldCount > 6) blockers.push({ issue: `Form has ${s.formFieldCount} fields — too many`, impact: "high", fix: "Reduce form to 3–4 essential fields. Every extra field drops conversion ~11%", example: "Name, Email, Phone, Message" });
  if (s.hasForm && s.formFieldCount === 0) blockers.push({ issue: "Form detected but no fields parsed", impact: "medium", fix: "Verify form renders server-side, not JS-only", example: "" });
  if (!s.hasClickToCall && s.hasPhone) blockers.push({ issue: "Phone number visible but not click-to-call", impact: "medium", fix: "Wrap phone in tel: link so mobile users can call in one tap", example: "<a href='tel:+911234567890'>+91 12345 67890</a>" });
  if (!s.hasWhatsApp) blockers.push({ issue: "No WhatsApp contact option", impact: "medium", fix: "Add WhatsApp click-to-chat — often 3–5× higher response rate than forms in India/MEA", example: "wa.me/911234567890" });
  if (s.trustSignalCount < 3) blockers.push({ issue: "Weak trust density", impact: "medium", fix: "Add at least 3 trust signals (reviews widget, awards, certifications) above the fold", example: "⭐ 4.9 · 250 reviews | ISO 9001 | 10+ years" });
  if (!s.hasReviewsWidget && !s.hasClientLogos) blockers.push({ issue: "No review widget or client logos", impact: "high", fix: "Embed Google Reviews widget or logo strip of named clients", example: "Google Reviews badge in footer or hero" });
  if (s.testimonialCount < 2) blockers.push({ issue: "Fewer than 2 testimonials detected", impact: "medium", fix: "Add 3 short customer testimonials with name + company + photo", example: "" });
  if (s.aboveFoldTextHeavy) blockers.push({ issue: "Above-fold is text-heavy", impact: "medium", fix: "Replace hero paragraph with a one-line value prop + CTA. Users don't read walls", example: "<h1>One sentence benefit</h1><button>Start →</button>" });
  if (s.tapTargetScore !== null && s.tapTargetScore < 70) blockers.push({ issue: "Multiple buttons/links likely too small for mobile", impact: "medium", fix: "Ensure tap targets are ≥ 44×44px (Apple) / ≥ 48×48px (Google)", example: "py-3 px-6 minimum" });
  if (!s.hasChatWidget) blockers.push({ issue: "No live chat widget", impact: "low", fix: "Add Tawk.to (free) or Intercom — chats convert 3× higher than forms for B2B", example: "tawk.to snippet" });
  if (!s.hasMobileViewport) blockers.push({ issue: "No mobile viewport meta tag", impact: "high", fix: "Add <meta name='viewport' content='width=device-width, initial-scale=1'>", example: "" });
  return blockers;
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
