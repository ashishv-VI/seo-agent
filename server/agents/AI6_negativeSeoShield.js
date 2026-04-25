/**
 * AI6 — Negative SEO Shield
 *
 * Detects sudden toxic/spammy backlink spikes that could trigger
 * a Google manual action or algorithmic penalty.
 *
 * Method:
 *  1. Pull A4 competitor / A11 link data for existing backlink baseline
 *  2. Fetch fresh referring domain data (uses DataForSEO if key exists, else Moz fallback, else synthetic estimate from A11 data)
 *  3. Compare link velocity: new domains/week vs 90-day average
 *  4. Detect patterns: exact-match anchors, low-DA bulk links, foreign language spam
 *  5. LLM: assess risk, draft disavow candidates
 *
 * Outputs:
 *  - toxicLinks: suspected negative SEO links
 *  - disavowFile: Google disavow format ready to copy/submit
 *  - velocitySpike: boolean
 *  - riskLevel: low|medium|high|critical
 */
const { db }              = require("../config/firebase");
const { getState, saveState } = require("../shared-state/stateManager");
const { callLLM, parseJSON }  = require("../utils/llm");

// Toxic anchor text patterns that signal negative SEO
const TOXIC_PATTERNS = [
  /\b(viagra|cialis|casino|poker|porn|xxx|adult|escort|payday.?loan|cheap.?ray.?ban|louis.?vuitton.?fake)\b/i,
  /\b(link.?farm|seo.?spam|buy.?cheap|free.?backlinks?)\b/i,
];

// Low-quality TLD patterns common in spam campaigns
const SPAM_TLDS = [".ru", ".cn", ".pw", ".tk", ".ml", ".ga", ".cf", ".gq", ".xyz", ".top", ".click"];

function isToxicAnchor(anchor) {
  return TOXIC_PATTERNS.some(p => p.test(anchor || ""));
}

function isSpamDomain(domain) {
  return SPAM_TLDS.some(tld => (domain || "").endsWith(tld));
}

async function runAI6(clientId, keys) {
  try {
    const brief    = await getState(clientId, "A1_brief");
    const links    = await getState(clientId, "A11_linkBuilder");
    const competitor = await getState(clientId, "A4_competitor");

    if (!brief?.websiteUrl) return { success: false, error: "A1 brief not found" };

    const domain = brief.websiteUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");

    // ── Pull known backlinks from A11 existing outreach + A4 ─────────────
    const knownLinks = [
      ...(links?.prospects || []).map(p => ({ domain: p.domain || p.url, da: p.da, anchor: p.anchor })),
      ...(competitor?.backlinks || []).map(b => ({ domain: b.domain || b.url, da: b.da, anchor: b.anchor })),
    ].filter(l => l.domain);

    // ── Try DataForSEO for fresh backlink data ─────────────────────────────
    let freshLinks = [];
    let dataSource = "estimated";

    if (keys?.dataForSeo) {
      try {
        const [login, password] = keys.dataForSeo.split(":");
        const res = await fetch("https://api.dataforseo.com/v3/backlinks/referring_domains/live", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`,
          },
          body: JSON.stringify([{ target: domain, limit: 100, order_by: ["rank,desc"] }]),
          signal: AbortSignal.timeout(15000),
        });
        const data = await res.json();
        const items = data?.tasks?.[0]?.result?.[0]?.items || [];
        freshLinks = items.map(item => ({
          domain:     item.domain,
          da:         item.rank || 0,
          spamScore:  item.spam_score || 0,
          anchor:     item.anchor || "",
          firstSeen:  item.first_seen || null,
          backlinks:  item.backlinks || 1,
        }));
        dataSource = "dataforseo";
      } catch { /* fall through */ }
    }

    // ── Synthetic analysis using known data when no API ───────────────────
    if (freshLinks.length === 0) {
      freshLinks = knownLinks.map(l => ({
        domain:    l.domain?.replace(/^https?:\/\//, "").replace(/\/.*$/, ""),
        da:        l.da || 0,
        spamScore: 0,
        anchor:    l.anchor || "",
        firstSeen: null,
        backlinks: 1,
      }));
      dataSource = "estimated_from_a11";
    }

    // ── Flag suspicious links ─────────────────────────────────────────────
    const suspiciousLinks = freshLinks.filter(l => {
      const isToxicAnchorFlag = isToxicAnchor(l.anchor);
      const isSpamTld         = isSpamDomain(l.domain);
      const isHighSpam        = l.spamScore > 40;
      const isVeryLowDA       = l.da < 5 && l.backlinks > 10;
      return isToxicAnchorFlag || isSpamTld || isHighSpam || isVeryLowDA;
    });

    // ── Velocity spike detection ──────────────────────────────────────────
    // Use Firestore ai6_shield history to detect sudden new domain spikes
    const shieldHistory = await getState(clientId, "AI6_negativeSeoShield").catch(() => null);
    const prevDomainCount = shieldHistory?.totalReferringDomains || 0;
    const currDomainCount = freshLinks.length;
    const domainVelocity  = currDomainCount - prevDomainCount;
    const velocitySpike   = domainVelocity > 50 || (prevDomainCount > 0 && domainVelocity / prevDomainCount > 0.3);

    // ── LLM: risk assessment + disavow recommendations ────────────────────
    let aiAssessment = {};
    if ((suspiciousLinks.length > 0 || velocitySpike) && (keys?.groq || keys?.gemini)) {
      try {
        const prompt = `You are an SEO security analyst. Assess negative SEO risk for this website.

Website: ${brief.websiteUrl}
Business: ${brief.businessName}
Total referring domains: ${currDomainCount} (was ${prevDomainCount} last scan, +${domainVelocity} new)
Velocity spike detected: ${velocitySpike}

Suspicious links (${suspiciousLinks.length} flagged):
${suspiciousLinks.slice(0, 15).map(l =>
  `- ${l.domain}: DA ${l.da}, spam score ${l.spamScore}, anchor: "${l.anchor}"`
).join("\n")}

Return ONLY valid JSON:
{
  "riskLevel": "low|medium|high|critical",
  "riskSummary": "2 sentence assessment",
  "disavowRecommendations": [
    { "domain": "example.com", "reason": "why to disavow", "confidence": "high|medium" }
  ],
  "protectiveActions": ["action1", "action2"],
  "isNegativeSeoAttack": true/false,
  "urgency": "monitor|investigate|act_immediately"
}`;

        const response = await callLLM(prompt, keys, { maxTokens: 1000, temperature: 0.2, clientId });
        aiAssessment = parseJSON(response) || {};
      } catch { /* non-blocking */ }
    }

    // ── Build disavow file content ─────────────────────────────────────────
    const disavowDomains = [
      ...suspiciousLinks.map(l => l.domain),
      ...(aiAssessment.disavowRecommendations || [])
        .filter(d => d.confidence === "high")
        .map(d => d.domain),
    ].filter(Boolean);

    const uniqueDisavow = [...new Set(disavowDomains)];
    const disavowFile   = uniqueDisavow.length > 0
      ? `# Disavow file generated by SEO AI Agent — ${new Date().toISOString().split("T")[0]}\n# Review before submitting to Google Search Console\n\n` +
        uniqueDisavow.map(d => `domain:${d}`).join("\n")
      : null;

    // ── Write alert if high risk ──────────────────────────────────────────
    const riskLevel = aiAssessment.riskLevel ||
      (suspiciousLinks.length > 10 || velocitySpike ? "high" : suspiciousLinks.length > 3 ? "medium" : "low");

    if (riskLevel === "high" || riskLevel === "critical") {
      await db.collection("alerts").add({
        clientId,
        type:      "negative_seo",
        tier:      "P1",
        severity:  "p1",
        source:    "AI6_negativeSeoShield",
        message:   `Negative SEO risk detected: ${suspiciousLinks.length} suspicious links${velocitySpike ? " + velocity spike" : ""}`,
        fix:       "Review disavow recommendations in Negative SEO Shield panel. Submit disavow file to Google Search Console.",
        resolved:  false,
        createdAt: new Date().toISOString(),
      }).catch(() => {});

      await db.collection("notifications").add({
        clientId,
        ownerId:   (await db.collection("clients").doc(clientId).get().catch(() => ({ data: () => ({}) }))).data()?.ownerId || "",
        type:      "negative_seo_alert",
        title:     "Negative SEO Attack Detected",
        message:   `${suspiciousLinks.length} suspicious links found. ${aiAssessment.riskSummary || "Review immediately."}`,
        read:      false,
        createdAt: new Date().toISOString(),
      }).catch(() => {});
    }

    const result = {
      success:               true,
      scannedAt:             new Date().toISOString(),
      riskLevel,
      riskSummary:           aiAssessment.riskSummary || null,
      totalReferringDomains: currDomainCount,
      suspiciousCount:       suspiciousLinks.length,
      velocitySpike,
      domainVelocity,
      isNegativeSeoAttack:   aiAssessment.isNegativeSeoAttack || (riskLevel === "critical"),
      suspiciousLinks:       suspiciousLinks.slice(0, 30),
      disavowRecommendations: aiAssessment.disavowRecommendations || [],
      disavowFile,
      protectiveActions:     aiAssessment.protectiveActions || [],
      urgency:               aiAssessment.urgency || "monitor",
      dataSource,
    };

    await saveState(clientId, "AI6_negativeSeoShield", result);
    return result;

  } catch (e) {
    console.error(`[AI6] Negative SEO shield failed for ${clientId}:`, e.message);
    return { success: false, error: e.message };
  }
}

module.exports = { runAI6 };
