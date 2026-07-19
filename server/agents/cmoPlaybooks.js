/**
 * CMO Playbook Helpers — extracted from CMO_agent.js (Sprint 1, Story M2).
 *
 * Pure, self-contained playbook/pattern intelligence used by runCMO():
 *   - FIX_TO_PLAYBOOK / AGENT_TO_PLAYBOOK  — static fix/agent → playbook maps
 *   - computePlaybookStats()               — win-rate rollup per playbook
 *   - buildPatternStats()                  — structured stats for veto + UI
 *   - buildPatternSummary()                — human-readable summary for the LLM prompt
 *   - identifyFailingPlaybooks()           — per-client + industry failing-playbook set
 *   - filterAllowedAgents()                — invert failing set → allowed agents
 *   - vetoFailingPlaybooks()               — strip next-agents on failing playbooks
 *
 * No I/O, no LLM, no Firestore — behaviour is identical to the original inline
 * definitions. Moved verbatim; nothing about the logic changed.
 */

const FIX_TO_PLAYBOOK = {
  seo_title: "on_page", meta_description: "on_page", missing_title: "on_page",
  missing_meta_desc: "on_page", short_title: "on_page", long_title: "on_page",
  missing_h1: "on_page", multiple_h1: "on_page", title_tag: "on_page", meta_desc: "on_page",
  missing_canonical: "technical", canonical_tag: "technical", no_viewport: "technical",
  slow_response_time: "technical", redirect_chain: "technical", missing_ssl: "technical",
  slow_ttfb: "technical", mixed_content: "technical",
  missing_schema: "schema", schema_tag: "schema",
  thin_content: "content", content_gap: "content", keyword_cannibalization: "content",
  content_refresh: "content", blog_post: "content",
  low_internal_links: "linking", broken_internal_link: "linking",
  link_building: "linking", backlink: "linking",
  citation_missing: "local", gmb_not_optimized: "local", nap_inconsistent: "local",
};
const AGENT_TO_PLAYBOOK = {
  A5: "content", A6: "on_page", A7: "technical",
  A8: "local",   A11: "linking", A14: "content",
};

function computePlaybookStats(patterns) {
  const byPlaybook = {};
  for (const p of patterns) {
    const pb = FIX_TO_PLAYBOOK[p.fixType] || "other";
    if (!byPlaybook[pb]) byPlaybook[pb] = { improved: 0, total: 0 };
    byPlaybook[pb].total++;
    if (p.outcome === "improved") byPlaybook[pb].improved++;
  }
  return Object.entries(byPlaybook).map(([playbook, c]) => ({
    playbook,
    winRate: Math.round((c.improved / c.total) * 100),
    sample:  c.total,
    verdict: c.total >= 5 && (c.improved / c.total) < 0.4 ? "failing"
           : c.total >= 3 && (c.improved / c.total) >= 0.7 ? "winning"
           : "neutral",
  }));
}

// Remove next-agents whose playbook is proven to fail in this industry.
// Returns { kept: [...], abandoned: [{ agent, playbook, winRate, sample }] }.
function vetoFailingPlaybooks(nextAgents, patternStats) {
  const result = { kept: [], abandoned: [] };
  const failing = identifyFailingPlaybooks(patternStats);
  const allStats = [
    ...((patternStats.playbooks?.thisClient) || []),
    ...((patternStats.playbooks?.crossAgency) || []),
    ...((patternStats.playbooks?.ownAgency)   || []),
  ];

  for (const agent of nextAgents) {
    const playbook = AGENT_TO_PLAYBOOK[agent];
    if (playbook && failing.has(playbook)) {
      const stat = allStats.find(s => s.playbook === playbook);
      result.abandoned.push({ agent, playbook, winRate: stat?.winRate, sample: stat?.sample });
    } else {
      result.kept.push(agent);
    }
  }
  return result;
}

// ── Per-client + industry playbook veto identification ───────────────
// Per-client data wins over industry data — a client that actually succeeds with
// a playbook should keep using it even if the industry average is bad.
// Returns a Set of playbook names that should be abandoned.
function identifyFailingPlaybooks(patternStats) {
  const failing = new Set();

  // 1. Per-client playbook stats take precedence. If this specific client has
  //    ≥3 samples of a playbook and <40% win rate, veto it immediately.
  for (const s of (patternStats.playbooks?.thisClient || [])) {
    if (s.sample >= 3 && s.winRate < 40) failing.add(s.playbook);
  }

  // 2. Industry-wide signal — only applied if per-client has no opinion.
  //    (If per-client says it works, don't let the global aggregate override.)
  const perClientPlaybooks = new Set((patternStats.playbooks?.thisClient || [])
    .filter(s => s.sample >= 3)
    .map(s => s.playbook));

  const industryStats = [
    ...((patternStats.playbooks?.crossAgency) || []),
    ...((patternStats.playbooks?.ownAgency)   || []),
  ];
  for (const s of industryStats) {
    if (perClientPlaybooks.has(s.playbook)) continue; // client data trumps industry
    if (s.verdict === "failing") failing.add(s.playbook);
  }

  return failing;
}

// Invert: given the failing set, return the list of agents CMO IS allowed
// to propose. Used to shape the LLM prompt up-front.
function filterAllowedAgents(failingPlaybooks) {
  return Object.entries(AGENT_TO_PLAYBOOK)
    .filter(([_agent, playbook]) => !failingPlaybooks.has(playbook))
    .map(([agent]) => agent);
}

// Structured stats for the UI — returns { ownAgency: [], crossAgency: [], thisClient: {} }
// recentVerifications = fresh rows from fix_verification collection for *this* client.
// These build per-client playbook stats so the veto can trust personal history.
function buildPatternStats(globalPatterns, clientMemory, businessType = "", recentVerifications = []) {
  const stats = { ownAgency: [], crossAgency: [], thisClient: { worked: [], failed: [] }, businessType };
  if (!globalPatterns.length && !clientMemory?.fixOutcomes?.length && !recentVerifications.length) return stats;

  const own   = globalPatterns.filter(p => !p._crossAgency);
  const cross = globalPatterns.filter(p => p._crossAgency);

  const aggregate = (arr) => {
    const byType = {};
    for (const p of arr) {
      if (!byType[p.fixType]) byType[p.fixType] = { improved: 0, total: 0 };
      byType[p.fixType].total++;
      if (p.outcome === "improved") byType[p.fixType].improved++;
    }
    return Object.entries(byType)
      .map(([fixType, c]) => ({
        fixType,
        winRate: Math.round((c.improved / c.total) * 100),
        sample: c.total,
      }))
      .sort((a, b) => b.winRate - a.winRate)
      .slice(0, 5);
  };

  stats.ownAgency   = aggregate(own);
  stats.crossAgency = aggregate(cross);

  // Per-client playbook stats — built from both A16 memory AND the fresh
  // fix_verification pull. These are normalised into the same shape that
  // computePlaybookStats produces for agency/cross-agency data.
  const thisClientPatterns = [];
  for (const v of recentVerifications) {
    if (v.field && v.outcome && v.outcome !== "no_data") {
      thisClientPatterns.push({ fixType: v.field, outcome: v.outcome });
    }
  }
  for (const f of (clientMemory?.fixOutcomes || [])) {
    if (f.field && f.outcome && f.outcome !== "no_data") {
      thisClientPatterns.push({ fixType: f.field, outcome: f.outcome });
    }
  }

  // Playbook-level rollup for meta-learning
  stats.playbooks = {
    ownAgency:   computePlaybookStats(own),
    crossAgency: computePlaybookStats(cross),
    thisClient:  computePlaybookStats(thisClientPatterns),
  };

  const fixOutcomes = clientMemory?.fixOutcomes || [];
  const recent = fixOutcomes.slice(-10);
  stats.thisClient.worked = [...new Set(recent.filter(f => f.outcome === "improved").map(f => f.field))];
  stats.thisClient.failed = [...new Set(recent.filter(f => f.outcome === "degraded" || f.outcome === "no_change").map(f => f.field))];

  return stats;
}

function buildPatternSummary(globalPatterns, clientMemory, businessType = "") {
  if (!globalPatterns.length && !clientMemory?.fixOutcomes?.length) return null;

  const lines = [];

  if (globalPatterns.length > 0) {
    const ownAgency   = globalPatterns.filter(p => !p._crossAgency);
    const crossAgency = globalPatterns.filter(p => p._crossAgency);

    // Aggregate with unique client counts and avg CTR delta
    const deepAggregate = (arr) => {
      const byType = {};
      for (const p of arr) {
        if (!byType[p.fixType]) byType[p.fixType] = { improved: 0, total: 0, clients: new Set(), ctrDeltas: [] };
        byType[p.fixType].total++;
        if (p.outcome === "improved") byType[p.fixType].improved++;
        if (p.clientId) byType[p.fixType].clients.add(p.clientId);
        if (p.ctrBefore != null && p.ctrAfter != null) {
          byType[p.fixType].ctrDeltas.push(p.ctrAfter - p.ctrBefore);
        }
      }
      return Object.entries(byType)
        .map(([fixType, c]) => {
          const winRate = Math.round((c.improved / c.total) * 100);
          const avgCtrDelta = c.ctrDeltas.length > 0
            ? (c.ctrDeltas.reduce((a, b) => a + b, 0) / c.ctrDeltas.length * 100).toFixed(1)
            : null;
          return { fixType, winRate, improved: c.improved, total: c.total, clientCount: c.clients.size, avgCtrDelta };
        })
        .sort((a, b) => b.winRate - a.winRate);
    };

    // Own-agency: deep aggregate with confidence language
    if (ownAgency.length > 0) {
      const agg = deepAggregate(ownAgency);
      lines.push("Fix success rates across your clients:");
      for (const a of agg.slice(0, 5)) {
        const conf = a.winRate >= 80 && a.total >= 3 ? "HIGH CONFIDENCE" : a.winRate >= 60 ? "MODERATE" : "LOW";
        const ctr = a.avgCtrDelta ? `, avg CTR change: ${a.avgCtrDelta > 0 ? "+" : ""}${a.avgCtrDelta}%` : "";
        const clients = a.clientCount > 1 ? ` across ${a.clientCount} clients` : "";
        lines.push(`  - ${a.fixType}: ${a.winRate}% success (${a.improved}/${a.total}${clients}${ctr}) → ${conf}`);
      }
    }

    // Cross-agency: reasoning about similar businesses
    if (crossAgency.length > 0 && businessType) {
      const agg = deepAggregate(crossAgency);
      lines.push(`\nIndustry intelligence for "${businessType}" businesses (from other agencies):`);
      for (const a of agg.slice(0, 3)) {
        const ctr = a.avgCtrDelta ? ` (avg ${a.avgCtrDelta > 0 ? "+" : ""}${a.avgCtrDelta}% CTR)` : "";
        if (a.winRate >= 70 && a.total >= 2) {
          lines.push(`  - ${a.fixType}: worked for ${a.improved}/${a.total} similar ${businessType} sites${ctr} — RECOMMEND for this client`);
        } else if (a.winRate < 40) {
          lines.push(`  - ${a.fixType}: only ${a.winRate}% success for ${businessType} sites — AVOID or try different approach`);
        } else {
          lines.push(`  - ${a.fixType}: ${a.winRate}% success (${a.total} data points)${ctr}`);
        }
      }
    }
  }

  // This client's own fix history — with recency
  const fixOutcomes = clientMemory?.fixOutcomes || [];
  if (fixOutcomes.length > 0) {
    const recent = fixOutcomes.slice(-10);
    const worked = [...new Set(recent.filter(f => f.outcome === "improved").map(f => f.field))];
    const failed = [...new Set(recent.filter(f => f.outcome === "degraded" || f.outcome === "no_change").map(f => f.field))];
    if (worked.length > 0) lines.push(`\nThis client — fixes that WORKED: ${worked.join(", ")} (repeat these)`);
    if (failed.length > 0) lines.push(`This client — fixes that FAILED: ${failed.join(", ")} (try different approach)`);
  }

  return lines.length > 0 ? lines.join("\n") : null;
}

module.exports = {
  FIX_TO_PLAYBOOK,
  AGENT_TO_PLAYBOOK,
  computePlaybookStats,
  vetoFailingPlaybooks,
  identifyFailingPlaybooks,
  filterAllowedAgents,
  buildPatternStats,
  buildPatternSummary,
};
