/**
 * CMO Decision Helpers — extracted from CMO_agent.js (Sprint 1, Story M3).
 *
 * Pure, self-contained helpers used by runCMO():
 *   - reweightConfidence()  — blend LLM confidence with historical win rates
 *   - buildCMOPrompt()      — build the revenue-first LLM decision prompt
 *   - ruleBasedDecision()   — deterministic fallback when the LLM is unavailable
 *
 * No I/O, no LLM, no Firestore — behaviour is identical to the original inline
 * definitions. Moved verbatim; nothing about the logic changed.
 */

function reweightConfidence(decision, patternStats, recentVerifications = []) {
  const llmConf = Math.max(0, Math.min(1, decision.confidence || 0.7));
  const decisionText = (decision.decision || "").toLowerCase();

  // Map decision keywords → fix types we track in global_patterns
  const fixTypeMap = [
    { kw: ["meta", "title", "ctr"],          fixType: "meta_title" },
    { kw: ["content", "refresh", "rewrite"], fixType: "content_refresh" },
    { kw: ["link", "backlink", "outreach"],  fixType: "link_building" },
    { kw: ["schema", "structured"],          fixType: "schema" },
    { kw: ["cwv", "pagespeed", "performance", "speed"], fixType: "technical_speed" },
    { kw: ["h1", "heading"],                 fixType: "on_page" },
  ];
  const matched = fixTypeMap.find(m => m.kw.some(k => decisionText.includes(k)));
  const fixType = matched?.fixType;

  if (!fixType) {
    return { confidence: llmConf, reasoning: "LLM confidence (no historical match)" };
  }

  // Fresh fix_verification signal — takes precedence over everything else
  // because it's the most recent, un-aggregated truth for THIS client.
  const recentForType = recentVerifications.filter(v =>
    v.field && v.field.toLowerCase().includes(fixType.split("_")[0])
  );
  if (recentForType.length >= 2) {
    const improved = recentForType.filter(v => v.outcome === "improved").length;
    const clientRate = improved / recentForType.length;
    // If this client has recent direct evidence, anchor confidence to it heavily.
    const blended = (llmConf * 0.3) + (clientRate * 0.7);
    return {
      confidence: Math.round(blended * 100) / 100,
      reasoning: `Blended with this client's recent ${Math.round(clientRate * 100)}% win rate on ${fixType} (n=${recentForType.length}, from fix_verification)`,
    };
  }

  // Look up win rate in ownAgency first, then crossAgency
  const all = [...(patternStats.ownAgency || []), ...(patternStats.crossAgency || [])];
  const match = all.find(p => p.fixType === fixType);

  // Check this client's own failure list
  const failedHere = (patternStats.thisClient?.failed || []).some(f =>
    f && f.toLowerCase().includes(fixType.split("_")[0])
  );

  if (failedHere) {
    return {
      confidence: Math.max(0.35, llmConf - 0.25),
      reasoning: `Downweighted: ${fixType} previously failed for this client`,
    };
  }

  if (match && match.sample >= 3) {
    const histRate = match.winRate / 100;
    // Blend LLM confidence with historical rate (weighted by sample size)
    const weight = Math.min(1, match.sample / 10);
    const blended = (llmConf * (1 - weight)) + (histRate * weight);
    return {
      confidence: Math.round(blended * 100) / 100,
      reasoning: `Blended with ${match.winRate}% historical win rate (n=${match.sample})`,
    };
  }

  return { confidence: llmConf, reasoning: "LLM confidence (insufficient history)" };
}

// ── LLM prompt ────────────────────────────────────
function buildCMOPrompt(brief, signals, patternSummary = null, vetoContext = {}) {
  const { failingPlaybooks = new Set(), allowedAgents = null, lowQualityAgents = [] } = vetoContext;
  const allAgents = ["A2", "A5", "A6", "A7", "A11", "A14", "A12", "A13", "A23", "A25", "AI7", "AI9"];
  const pickFrom  = allowedAgents && allowedAgents.length > 0
    ? allowedAgents.filter(a => allAgents.includes(a))
    : allAgents;

  const vetoBlock = failingPlaybooks.size > 0
    ? `\n## DO NOT PROPOSE THESE PLAYBOOKS\nThe following playbooks have been proven to FAIL (either for this client or this industry):\n${[...failingPlaybooks].map(p => `- ${p}`).join("\n")}\nDo NOT propose any agent that belongs to these playbooks. Pick a different approach.\n`
    : "";

  const qualityWarning = lowQualityAgents.length > 0
    ? `\n## LOW QUALITY DATA WARNING\nA17 Reviewer flagged these agent outputs as low quality (score <0.5). Treat signals from them as directional hints only — do NOT make high-confidence decisions based solely on: ${lowQualityAgents.join(", ")}.\n`
    : "";

  const aov = Number(brief?.avgOrderValue) || 0;
  const currency = brief?.currency === "GBP" ? "£" : brief?.currency === "USD" ? "$" : "₹";
  const revenueContext = aov > 0
    ? `Average order value: ${currency}${aov.toLocaleString()}. ALWAYS translate improvements into leads and ${currency} revenue in your reasoning and kpiImpact — e.g. "+2 leads/month × ${currency}${aov.toLocaleString()} = ${currency}${(2*aov).toLocaleString()} added monthly revenue".`
    : "No AOV configured — express impact as leads and traffic, not revenue.";

  const topPageActions = (signals.topPageActions || []).slice(0, 8);
  const pageActionsBlock = topPageActions.length > 0
    ? `\n## Specific Pages Needing Action RIGHT NOW\n${topPageActions.map((p, i) =>
        `${i+1}. URL: ${p.url || "unknown"}\n   Issue: ${p.issue} — ${p.detail}\n   Impact: ${p.impact}\n   Action: ${p.action}`
      ).join("\n")}\n`
    : "";

  // Revenue / lead attribution block — only shown when real conversion data exists
  const revenueBlock = signals.hasLeadData
    ? `\n## Real Revenue Signals (from actual form submissions / conversions)\n` +
      `- Leads last 30 days: ${signals.totalLeads30d}\n` +
      `- Leads last 90 days: ${signals.totalLeads90d}\n` +
      (signals.topLeadKeywords.length > 0
        ? `- Top converting keywords: ${signals.topLeadKeywords.map(k => `"${k.keyword}" (${k.leads} leads)`).join(", ")}\n`
        : "") +
      (signals.hasZeroLeadKws
        ? `- ZERO-LEAD KEYWORDS (90 days): ${signals.zeroLeadKeywords.slice(0, 5).join(", ")} — stop investing here, they don't convert\n`
        : "") +
      (signals.lowLeadRate
        ? `- WARNING: High traffic (${signals.monthlyClicks} clicks/month) but almost no leads (${signals.totalLeads30d} in 30 days). This is a CONVERSION problem, not an SEO problem. Recommend CRO (A19) before more SEO work.\n`
        : "")
    : "";

  return `You are the CMO Agent for an SEO AI platform. You make revenue-first decisions.

RULE: Never speak in SEO jargon to the user. Every insight must answer "what does this mean for revenue or leads?"
- "CTR improved 2%" → "est. +${aov > 0 ? Math.round(signals.monthlyClicks * 0.02 * 0.03) + " extra leads/month" : "more clicks → more leads"}"
- "Position 14→9 on primary keyword" → "moving from page 2 to page 1 — this keyword starts generating leads"
- "3 P1 issues" → "3 issues blocking the site from ranking — fixing them unblocks organic revenue"

Client: ${brief.businessName} (${brief.websiteUrl})
Primary goal: ${[].concat(brief.kpiSelection || ["Organic Traffic Growth"]).join(", ")}
${revenueContext}

## Current Situation
- Technical health: ${signals.healthPoor ? "POOR — site has ranking blockers" : "OK"}
- Critical issues blocking rankings: ${signals.p1IssuesCount}
- Mobile PageSpeed: ${signals.technicalPoor ? "POOR — losing mobile traffic" : "OK"}
- Keywords on page 2 (positions 11-30): ${signals.page2Count} ${signals.page2Count > 0 ? "— one good backlink away from page 1 traffic" : ""}
- Ranking drops: ${signals.droppingKws} ${signals.droppingKws > 0 ? "— investigate before traffic disappears" : ""}
- CTR below expected: ${signals.ctrLow ? `YES — getting ${((signals.avgCtr || 0)*100).toFixed(1)}% clicks at position ${(signals.avgPos||0).toFixed(1)} (should be higher)` : "NO"}
- Content gaps: ${signals.contentGaps} ${signals.contentGaps > 0 ? "keywords with no page targeting them — missing traffic" : ""}
${signals.hasKilledKeywords ? `- WASTED EFFORT WARNING: ${signals.killedKeywordCount} keywords have ranked 90+ days with ZERO leads. Stop targeting these. Reallocate budget to converting keywords.` : ""}
${revenueBlock}${pageActionsBlock}
## 2025/2026 Intelligence (connected agents data)
${signals.a0TopPriority ? `- SEO Head top priority: "${signals.a0TopPriority}"` : ""}
${signals.a0AiSearchStrategy ? `- AI search strategy: ${signals.a0AiSearchStrategy}` : ""}
${signals.a0CriticalWarnings?.length > 0 ? `- Critical warnings: ${signals.a0CriticalWarnings.join(", ")}` : ""}
- AI Overview zero-click risk: ${signals.zeroClickRiskPct || 0}% keywords at HIGH risk${signals.zeroClickHigh ? " — URGENT strategy shift needed" : ""}
- Topical hubs incomplete: ${signals.topicalHubsGap || 0}
- GEO opportunities: ${signals.geoOpportunities || 0} keywords can appear in ChatGPT/Perplexity
- Competitor moved: ${signals.competitorMoved ? `YES — ${signals.competitorMoveCount} new page(s) in 7 days` : "No recent moves"}
- Traffic forecast: ${signals.forecastTrend || "unknown"}${signals.forecastDeclining ? " — DECLINING — URGENT" : ""}
- Algorithm risk: ${signals.algorithmRisk || "LOW"}${signals.eeAtGap ? " + EEAT gap" : ""}${signals.aiContentRisk ? " + AI content risk" : ""}
- Content decay: ${signals.contentDecaying || 0} pages losing rankings
- SERP volatility: ${signals.serpVolatility || "stable"}${signals.serpHighVolatility ? " — HOLD major changes" : ""}
${signals.seasonalOpportunity ? `- SEASONAL: "${signals.upcomingSeasonalPeak?.keyword}" peaks in ${signals.upcomingSeasonalPeak?.weeksAway} weeks — create content NOW` : ""}
${signals.kpiOnTrack === false ? `- KPI OFF TRACK: ${signals.kpiProgress || "behind goal"} — escalate all urgency` : ""}

## Available Actions (pick ONLY from this list)
${pickFrom.map(a => {
  const labels = {
    A2:   "Re-audit — find what's blocking rankings",
    A5:   "Rewrite titles/metas or generate new content briefs",
    A6:   "On-page fixes — improve content relevance signals",
    A7:   "Fix Core Web Vitals — stop losing mobile traffic",
    A11:  "Build backlinks — push page-2 keywords to page 1",
    A14:  "Create and publish content — capture keyword demand",
    A12:  "Auto-fix engine — apply quick technical fixes automatically",
    A13:  "WordPress push — publish approved content to site",
    A23:  "Investigate alerts — deep-dive into ranking drops or anomalies",
    A25:  "Core update scanner — check EEAT, HCU, AI content risk",
    AI7:  "Content decay refresh — update pages losing rankings",
    AI9:  "Zero-click capture — win featured snippets and PAA boxes",
  };
  return `- ${a}: ${labels[a] || a}`;
}).join("\n")}
${vetoBlock}${qualityWarning}${patternSummary ? `\n## What Has Worked Previously\n${patternSummary}\n` : ""}
Return ONLY valid JSON. Use plain language a business owner understands — no SEO jargon:
{
  "decision": "one sentence: what we're doing and why it matters for revenue/leads",
  "reasoning": "2-3 sentences in plain English: what the data shows → what we do → what revenue impact to expect",
  "nextAgents": ["A5"],
  "confidence": 0.85,
  "kpiImpact": [
    { "kpi": "Lead Generation", "expectedLift": "+3-5 leads/month", "mechanism": "higher CTR → more site visits → more conversions", "revenueEstimate": "${aov > 0 ? `+${currency}${(4*aov).toLocaleString()}/month` : "depends on conversion rate"}" }
  ],
  "pageActions": [
    { "url": "https://example.com/services", "fix": "rewrite title tag — current title is too generic", "expectedImpact": "CTR +2-3% on this page", "priority": 1 }
  ]
}`;
}

// ── Rule-based fallback ───────────────────────────
function ruleBasedDecision(signals, brief) {
  const kpi  = [].concat(brief?.kpiSelection || ["Organic Traffic Growth"])[0];
  const aov  = Number(brief?.avgOrderValue) || 0;
  const cur  = brief?.currency === "GBP" ? "£" : brief?.currency === "USD" ? "$" : "₹";
  const rev  = (leads) => aov > 0 ? ` = ${cur}${(leads * aov).toLocaleString()}/month added revenue` : "";

  if (signals.hasCriticalIssues || signals.healthPoor) {
    return {
      decision:   `Fix ${signals.p1IssuesCount} critical issues that are blocking organic rankings`,
      reasoning:  `The site has ${signals.p1IssuesCount} critical technical issues preventing Google from indexing pages correctly. Until these are fixed, no other SEO work generates revenue — these blockers suppress all organic traffic.`,
      nextAgents: ["A2", "A6"],
      confidence: 0.95,
      kpiImpact:  [{ kpi, expectedLift: "Unblocks organic indexing", mechanism: "Remove technical barriers", revenueEstimate: "Unlocks existing ranking potential" }],
    };
  }
  if (signals.ctrLow) {
    const extraClicks = Math.round((signals.monthlyClicks || 200) * 0.25);
    const extraLeads  = Math.round(extraClicks * 0.03);
    return {
      decision:   `Rewrite title tags and meta descriptions — the site ranks but users aren't clicking`,
      reasoning:  `CTR is ${((signals.avgCtr || 0)*100).toFixed(1)}% at position ${(signals.avgPos||0).toFixed(1)} — well below industry average. Getting to average CTR would add ~${extraClicks} extra clicks/month → ~${extraLeads} extra leads${rev(extraLeads)}. Title rewrites are the fastest way to get there.`,
      nextAgents: ["A5", "A6"],
      confidence: 0.88,
      kpiImpact:  [{ kpi, expectedLift: `+${extraLeads} leads/month`, mechanism: "Higher CTR → more visits from existing rankings", revenueEstimate: aov > 0 ? `+${cur}${(extraLeads * aov).toLocaleString()}/month` : null }],
    };
  }
  if (signals.hasPage2Kws) {
    const extraLeads = Math.round(signals.page2Count * 0.5);
    return {
      decision:   `Push ${signals.page2Count} page-2 keywords to page 1 with targeted backlinks`,
      reasoning:  `${signals.page2Count} keywords are ranking positions 11-30 — page 2, generating almost zero traffic. Moving even half of them to page 1 adds ~${extraLeads} extra leads/month${rev(extraLeads)}. One targeted backlink per keyword is typically enough to cross the page-1 threshold.`,
      nextAgents: ["A11"],
      confidence: 0.82,
      kpiImpact:  [{ kpi, expectedLift: `+${extraLeads} leads/month`, mechanism: "Page 2 → Page 1 ranking jump", revenueEstimate: aov > 0 ? `+${cur}${(extraLeads * aov).toLocaleString()}/month` : null }],
    };
  }
  if (signals.lowLeadRate) {
    const extraLeads = Math.round((signals.monthlyClicks || 500) * 0.005);
    return {
      decision:   `High traffic but almost no leads — this is a conversion problem, not an SEO problem`,
      reasoning:  `The site gets ${signals.monthlyClicks} clicks/month but only ${signals.totalLeads30d} leads in the last 30 days. That's a <0.5% conversion rate. More SEO work adds traffic to a leaky bucket — fixing the conversion funnel first (CTAs, forms, landing pages) will generate leads${rev(extraLeads)} without needing more rankings.`,
      nextAgents: ["A19", "A6"],
      confidence: 0.88,
      kpiImpact:  [{ kpi, expectedLift: `+${extraLeads} leads/month from existing traffic`, mechanism: "CRO — fix CTAs and landing pages to convert existing visitors", revenueEstimate: aov > 0 ? `+${cur}${(extraLeads * aov).toLocaleString()}/month` : null }],
    };
  }
  if (signals.hasContentGaps && !signals.hasKilledKeywords) {
    const gapLeads = Math.round(signals.contentGaps * 0.8);
    return {
      decision:   `Create content for ${signals.contentGaps} keyword gaps competitors already rank for`,
      reasoning:  `Competitors are getting traffic from ${signals.contentGaps} topics this site has no content on. Each piece of content captures a new audience segment — estimated +${gapLeads} leads/month when pages rank${rev(gapLeads)}.`,
      nextAgents: ["A14", "A5"],
      confidence: 0.78,
      kpiImpact:  [{ kpi, expectedLift: `+${gapLeads} leads/month`, mechanism: "New content → captures currently missed search demand", revenueEstimate: aov > 0 ? `+${cur}${(gapLeads * aov).toLocaleString()}/month` : null }],
    };
  }
  if (signals.hasContentGaps && signals.hasKilledKeywords) {
    return {
      decision:   `Stop investing in ${signals.killedKeywordCount} dead keywords — shift budget to converting pages`,
      reasoning:  `${signals.killedKeywordCount} keywords have ranked for 90+ days but generated zero leads. These are not converting regardless of ranking. Moving the same effort to CRO on pages that do get leads will produce faster revenue results.`,
      nextAgents: ["A19", "A6"],
      confidence: 0.80,
      kpiImpact:  [{ kpi, expectedLift: "+15-30% conversion rate on existing traffic", mechanism: "CRO on converting pages instead of dead keyword expansion", revenueEstimate: aov > 0 ? `Reallocate ${cur}${(signals.killedKeywordCount * aov * 0.1).toLocaleString()}/month wasted effort` : null }],
    };
  }

  // ── NEW: 7 world-class decisions using connected agents ───────────────────

  // 1. Algorithm risk: EEAT / HCU issues detected by A25
  if (signals.algorithmRisk === "HIGH" || signals.eeAtGap || signals.aiContentRisk) {
    return {
      decision:   "Algorithm penalty risk detected — fix EEAT signals before any other SEO work",
      reasoning:  `A25 core update scanner detected ${signals.eeAtGap ? "EEAT gaps" : ""}${signals.aiContentRisk ? " and AI content without expertise signals" : ""}. Post March 2024-2025 core updates, these are active penalty triggers. Fixing trust signals first protects all existing rankings.`,
      nextAgents: ["A25", "A6", "A5"],
      confidence: 0.92,
      kpiImpact:  [{ kpi, expectedLift: "Protects existing rankings from penalty", mechanism: "EEAT compliance → penalty risk removed", revenueEstimate: "Avoids potential 30-60% traffic loss from core update" }],
    };
  }

  // 2. Zero-click defence: >40% of keywords at AI Overview risk
  if (signals.zeroClickHigh) {
    return {
      decision:   `${signals.zeroClickRiskPct}% of keywords are at HIGH AI Overview risk — shift strategy to transactional content`,
      reasoning:  `Google AI Overviews are now answering ${signals.zeroClickRiskPct}% of this site's target keywords directly — meaning zero clicks. Informational content investment is shrinking returns. Shifting 30% of content effort to transactional and commercial keywords protects revenue.`,
      nextAgents: ["A5", "A3"],
      confidence: 0.88,
      kpiImpact:  [{ kpi, expectedLift: "Protect click traffic from AI Overview threat", mechanism: "Transactional keywords send clicks — AI Overview cannot replace buying intent", revenueEstimate: aov > 0 ? `Defending ${cur}${Math.round(signals.monthlyClicks * 0.3 * 0.03 * aov).toLocaleString()}/month at risk` : "Protects existing traffic revenue" }],
    };
  }

  // 3. Competitor counter-move: competitor published new page in last 7 days
  if (signals.competitorMoved) {
    const move = signals.latestCompetitorMove;
    return {
      decision:   `Competitor published ${signals.competitorMoveCount} new page(s) targeting your keywords — counter-content brief ready`,
      reasoning:  `${move?.domain || "A competitor"} published a new page${move?.keyword ? ` targeting "${move.keyword}"` : ""} in the last 7 days. Without a counter-content response, they will rank above you within 30-60 days. A targeted content brief now is the fastest way to defend.`,
      nextAgents: ["A5", "A4"],
      confidence: 0.85,
      kpiImpact:  [{ kpi, expectedLift: "Defend existing keyword positions", mechanism: "Counter-content published before competitor ranks solidly", revenueEstimate: "Prevents estimated traffic loss to competitor" }],
    };
  }

  // 4. Forecast declining: A22 shows traffic trending down
  if (signals.forecastDeclining) {
    return {
      decision:   "Traffic forecast is declining — urgent intervention needed across all channels",
      reasoning:  `A22 predictive agent forecasts a declining traffic trend over the next 90 days. Projected: ${signals.projectedClicks90d ? signals.projectedClicks90d + " clicks" : "below current baseline"}. This requires a comprehensive response: technical fixes, content refresh, and link building simultaneously.`,
      nextAgents: ["A2", "A5", "A11"],
      confidence: 0.87,
      kpiImpact:  [{ kpi, expectedLift: "Reverse declining traffic trend", mechanism: "Multi-front intervention: technical + content + links", revenueEstimate: aov > 0 ? `Prevents estimated ${cur}${Math.round((signals.monthlyClicks||100) * 0.02 * aov).toLocaleString()}/month revenue decline` : "Protects existing traffic" }],
    };
  }

  // 5. Content decay: 3+ pages losing rankings (AI7)
  if (signals.hasContentDecay) {
    return {
      decision:   `${signals.contentDecaying} pages are steadily losing rankings — refresh them before traffic disappears`,
      reasoning:  `AI7 content decay scanner detected ${signals.contentDecaying} pages with consistent month-on-month ranking drops. Content decay happens when pages become outdated or competitors publish fresher content. Refreshing with updated data, people-first signals, and improved internal links reverses the trend.`,
      nextAgents: ["A5", "A6"],
      confidence: 0.84,
      kpiImpact:  [{ kpi, expectedLift: `Recover rankings on ${signals.contentDecaying} decaying pages`, mechanism: "Content refresh → relevance restored → rankings recover", revenueEstimate: aov > 0 ? `Est. recover ${cur}${Math.round(signals.contentDecaying * 0.5 * aov).toLocaleString()}/month in declining traffic value` : "Stabilise declining traffic" }],
    };
  }

  // 6. Seasonal opportunity: peak within 8 weeks (AI5)
  if (signals.seasonalOpportunity && signals.upcomingSeasonalPeak) {
    const peak = signals.upcomingSeasonalPeak;
    return {
      decision:   `Seasonal traffic peak in ${peak.weeksAway || "a few"} weeks — create content now before the window closes`,
      reasoning:  `AI5 seasonal intelligence detected an upcoming peak for "${peak.keyword || "target keywords"}" in ${peak.weeksAway || "a few"} weeks. Content published now has time to index and rank before the peak. Publishing during the peak is already too late.`,
      nextAgents: ["A14", "A5"],
      confidence: 0.83,
      kpiImpact:  [{ kpi, expectedLift: `Capture seasonal traffic spike`, mechanism: "Content indexed before peak → captures surge demand", revenueEstimate: aov > 0 ? `Seasonal peaks typically 2-3x normal traffic → significant revenue opportunity` : "Seasonal traffic capture" }],
    };
  }

  // 7. GEO + topical hub gap: content strategy opportunity
  if (signals.topicalHubsGap > 1 || signals.geoOpportunities > 2) {
    return {
      decision:   `${signals.topicalHubsGap} topical hubs incomplete${signals.geoOpportunities > 2 ? ` and ${signals.geoOpportunities} GEO citation opportunities` : ""} — build content authority now`,
      reasoning:  `Topical authority requires complete content hubs (pillar + cluster pages). ${signals.topicalHubsGap} hubs are currently incomplete — leaving keyword clusters unranked. ${signals.geoOpportunities > 2 ? `Additionally, ${signals.geoOpportunities} keywords can appear in ChatGPT/Perplexity answers with proper content restructuring.` : ""}`,
      nextAgents: ["A14", "A5"],
      confidence: 0.80,
      kpiImpact:  [{ kpi, expectedLift: "Build topical authority", mechanism: "Complete hubs → Google recognises expertise → cluster rankings improve", revenueEstimate: aov > 0 ? `Topical authority typically lifts cluster traffic 40-60%` : "Authority-driven traffic growth" }],
    };
  }

  return {
    decision:   "Site is healthy — focus on maintaining rankings and monitoring for drops",
    reasoning:  "No urgent signals detected. The site is in a stable state. The agent will continue monitoring for ranking drops, competitor moves, and new opportunities.",
    nextAgents: [],
    confidence: 0.6,
    kpiImpact:  [],
  };
}

module.exports = {
  reweightConfidence,
  buildCMOPrompt,
  ruleBasedDecision,
};
