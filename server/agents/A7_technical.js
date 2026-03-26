const { saveState, getState } = require("../shared-state/stateManager");
const { callLLM, parseJSON }  = require("../utils/llm");

/**
 * A7 — Technical SEO & Core Web Vitals Agent
 * Uses Google PageSpeed Insights API for real CWV data
 * Runs in parallel with A5/A6
 */
async function runA7(clientId, keys) {
  const brief = await getState(clientId, "A1_brief");
  const audit = await getState(clientId, "A2_audit");

  if (!brief?.signedOff) return { success: false, error: "A1 brief not signed off" };
  if (!audit?.status)    return { success: false, error: "A2 audit must complete first" };

  const siteUrl = brief.websiteUrl;
  const cwvData = { mobile: null, desktop: null };

  // ── PageSpeed Insights API ─────────────────────────
  if (keys.google) {
    for (const strategy of ["mobile", "desktop"]) {
      try {
        const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(siteUrl)}&strategy=${strategy}&key=${keys.google}&category=performance&category=seo&category=accessibility`;
        const res    = await fetch(apiUrl, { signal: AbortSignal.timeout(30000) });
        const data   = await res.json();

        if (data.lighthouseResult) {
          const lh  = data.lighthouseResult;
          const cats = lh.categories || {};
          const aud  = lh.audits || {};

          cwvData[strategy] = {
            scores: {
              performance:   Math.round((cats.performance?.score   || 0) * 100),
              seo:           Math.round((cats.seo?.score           || 0) * 100),
              accessibility: Math.round((cats.accessibility?.score || 0) * 100),
            },
            metrics: {
              lcp:  aud["largest-contentful-paint"]?.displayValue  || "N/A",
              inp:  aud["experimental-interaction-to-next-paint"]?.displayValue || aud["total-blocking-time"]?.displayValue || "N/A",
              cls:  aud["cumulative-layout-shift"]?.displayValue    || "N/A",
              fcp:  aud["first-contentful-paint"]?.displayValue     || "N/A",
              ttfb: aud["server-response-time"]?.displayValue       || "N/A",
              si:   aud["speed-index"]?.displayValue                || "N/A",
            },
            rawMetrics: {
              lcp: {
                display: aud["largest-contentful-paint"]?.displayValue || "N/A",
                ms:      Math.round(aud["largest-contentful-paint"]?.numericValue || 0),
                score:   aud["largest-contentful-paint"]?.score ?? null,
              },
              inp: {
                display: aud["experimental-interaction-to-next-paint"]?.displayValue || aud["total-blocking-time"]?.displayValue || "N/A",
                ms:      Math.round(aud["experimental-interaction-to-next-paint"]?.numericValue || aud["total-blocking-time"]?.numericValue || 0),
                score:   aud["experimental-interaction-to-next-paint"]?.score ?? aud["total-blocking-time"]?.score ?? null,
              },
              cls: {
                display: aud["cumulative-layout-shift"]?.displayValue || "N/A",
                value:   aud["cumulative-layout-shift"]?.numericValue ?? null,
                score:   aud["cumulative-layout-shift"]?.score ?? null,
              },
              fcp: {
                display: aud["first-contentful-paint"]?.displayValue || "N/A",
                ms:      Math.round(aud["first-contentful-paint"]?.numericValue || 0),
                score:   aud["first-contentful-paint"]?.score ?? null,
              },
              ttfb: {
                display: aud["server-response-time"]?.displayValue || "N/A",
                ms:      Math.round(aud["server-response-time"]?.numericValue || 0),
                score:   aud["server-response-time"]?.score ?? null,
              },
              si: {
                display: aud["speed-index"]?.displayValue || "N/A",
                ms:      Math.round(aud["speed-index"]?.numericValue || 0),
                score:   aud["speed-index"]?.score ?? null,
              },
            },
            opportunities: Object.values(aud)
              .filter(a => a.score !== null && a.score < 0.9 && a.details?.type === "opportunity")
              .slice(0, 8)
              .map(a => ({
                title:       a.title,
                description: a.description,
                savings:     a.displayValue,
                score:       a.score,
              })),
            passed: Object.values(aud)
              .filter(a => a.score === 1)
              .slice(0, 5)
              .map(a => a.title),
          };
        }
      } catch (e) {
        cwvData[strategy] = { error: e.message };
      }
    }
  }

  // ── LLM: Speed fix recommendations ────────────────
  const responseTime = audit.checks?.responseTime || 0;
  const hasSSL       = audit.checks?.hasSSL || false;
  const mobilePerfScore = cwvData.mobile?.scores?.performance;

  const prompt = `You are a Core Web Vitals and technical SEO specialist.

Site: ${siteUrl}
Response Time: ${responseTime}ms
HTTPS: ${hasSSL ? "Yes" : "No"}
Mobile Performance Score: ${mobilePerfScore || "unknown"}/100
Mobile LCP: ${cwvData.mobile?.metrics?.lcp || "unknown"}
Mobile CLS: ${cwvData.mobile?.metrics?.cls || "unknown"}
Mobile TBT: ${cwvData.mobile?.metrics?.inp || "unknown"}

Provide technical fix recommendations. Return ONLY valid JSON:
{
  "priorityFixes": [
    {
      "issue": "issue name",
      "impact": "high|medium|low",
      "effort": "dev|cms|plugin|config",
      "fix": "specific action to take",
      "expectedImprovement": "what will improve"
    }
  ],
  "infrastructureRecommendations": [
    { "type": "cdn|caching|hosting|compression", "recommendation": "what to do", "reason": "why" }
  ],
  "mobileChecklist": [
    { "item": "check item", "status": "pass|fail|check", "action": "what to do if fail" }
  ],
  "cwvStatus": {
    "lcp": "good|needs_improvement|poor",
    "inp": "good|needs_improvement|poor",
    "cls": "good|needs_improvement|poor",
    "overallAssessment": "1-2 sentence summary"
  }
}`;

  let techRecs;
  try {
    const response = await callLLM(prompt, keys, { maxTokens: 2500 });
    techRecs = parseJSON(response);
  } catch {
    techRecs = { priorityFixes: [], infrastructureRecommendations: [], mobileChecklist: [], cwvStatus: {} };
  }

  const result = {
    status:       "complete",
    siteUrl,
    cwvData,
    hasRealCWVData: !!keys.google && (!!cwvData.mobile?.scores || !!cwvData.desktop?.scores),
    techRecs,
    summary: {
      mobileScore:  cwvData.mobile?.scores?.performance || null,
      desktopScore: cwvData.desktop?.scores?.performance || null,
      highImpactFixes: techRecs.priorityFixes?.filter(f => f.impact === "high").length || 0,
      responseTime,
      lcpMs:    cwvData.mobile?.rawMetrics?.lcp?.ms    ?? null,
      clsValue: cwvData.mobile?.rawMetrics?.cls?.value ?? null,
      ttfbMs:   cwvData.mobile?.rawMetrics?.ttfb?.ms   ?? null,
    },
    generatedAt: new Date().toISOString(),
  };

  await saveState(clientId, "A7_technical", result);
  return { success: true, technical: result };
}

module.exports = { runA7 };
