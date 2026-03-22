import { useState } from "react";

const LINK_TYPES = [
  { id:"guest",    icon:"✍️", label:"Guest Posts",       color:"#7C3AED" },
  { id:"resource", icon:"📚", label:"Resource Pages",    color:"#0891B2" },
  { id:"broken",   icon:"🔗", label:"Broken Link Build", color:"#D97706" },
  { id:"pr",       icon:"📰", label:"Digital PR",        color:"#059669" },
  { id:"directory",icon:"📂", label:"Directories",       color:"#EA4335" },
  { id:"social",   icon:"📱", label:"Social Profiles",   color:"#10A37F" },
];

export default function BacklinkAnalyzer({ dark, keys, model }) {
  const [domain, setDomain]       = useState("");
  const [niche, setNiche]         = useState("");
  const [competitor, setComp]     = useState("");
  const [loading, setLoading]     = useState(false);
  const [results, setResults]     = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [copied, setCopied]       = useState(null);

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const txt3 = dark ? "#444"    : "#bbb";

  async function callAI(prompt) {
    const key = model === "groq" ? keys?.groq : keys?.gemini;
    if (!key) return null;
    if (model === "groq") {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
        body: JSON.stringify({ model: "llama-3.1-8b-instant", max_tokens: 3000, messages: [{ role: "user", content: prompt }] })
      });
      const d = await res.json();
      return d.choices?.[0]?.message?.content || null;
    } else {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${keys?.gemini}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const d = await res.json();
      return d.candidates?.[0]?.content?.parts?.[0]?.text || null;
    }
  }

  async function analyze() {
    if (!domain.trim()) return;
    setLoading(true); setResults(null);

    const prompt = `You are an expert SEO backlink analyst. Analyze the backlink profile for:

Domain: "${domain}"
Niche: "${niche || "general"}"
Competitor to compare: "${competitor || "top competitors in niche"}"

Provide a comprehensive backlink analysis in EXACTLY this format:

DOMAIN_AUTHORITY: [estimated DA 0-100]
TRUST_SCORE: [0-100]
TOTAL_BACKLINKS_EST: [estimated number]
REFERRING_DOMAINS_EST: [estimated number]
DOFOLLOW_PCT: [percentage 0-100]
NOFOLLOW_PCT: [percentage 0-100]
LINK_QUALITY: [Excellent/Good/Average/Poor]
ANCHOR_TEXT_DIVERSITY: [Good/Needs Work/Poor]
TOXIC_LINKS_RISK: [High/Medium/Low]

LINK_PROFILE_ANALYSIS:
[3-4 sentences analyzing the likely backlink profile for this domain/niche]

TOP_LINK_SOURCES:
SRC_1: [type of site] | Example: [example domain type] | Quality: [High/Med/Low] | Count est: [number]
SRC_2: [type of site] | Example: [example domain type] | Quality: [High/Med/Low] | Count est: [number]
SRC_3: [type of site] | Example: [example domain type] | Quality: [High/Med/Low] | Count est: [number]
SRC_4: [type of site] | Example: [example domain type] | Quality: [High/Med/Low] | Count est: [number]
SRC_5: [type of site] | Example: [example domain type] | Quality: [High/Med/Low] | Count est: [number]

ANCHOR_TEXT_DISTRIBUTION:
ANC_1: [anchor text type] | Percentage: [%] | Assessment: [Good/Over-optimized/Natural]
ANC_2: [anchor text type] | Percentage: [%] | Assessment: [type]
ANC_3: [anchor text type] | Percentage: [%] | Assessment: [type]
ANC_4: [anchor text type] | Percentage: [%] | Assessment: [type]
ANC_5: [anchor text type] | Percentage: [%] | Assessment: [type]

LINK_BUILDING_OPPORTUNITIES:
OPP_1: [opportunity type] | Difficulty: [Easy/Medium/Hard] | Impact: [High/Med/Low] | Action: [specific action]
OPP_2: [opportunity] | Difficulty: [level] | Impact: [level] | Action: [action]
OPP_3: [opportunity] | Difficulty: [level] | Impact: [level] | Action: [action]
OPP_4: [opportunity] | Difficulty: [level] | Impact: [level] | Action: [action]
OPP_5: [opportunity] | Difficulty: [level] | Impact: [level] | Action: [action]
OPP_6: [opportunity] | Difficulty: [level] | Impact: [level] | Action: [action]

COMPETITOR_COMPARISON:
COMP_DA: [estimated competitor DA]
COMP_BACKLINKS: [estimated competitor backlinks]
GAP_ANALYSIS: [2-3 sentences on how your link profile compares]

OUTREACH_TEMPLATES:
GUEST_POST: [2-sentence personalized guest post pitch for this niche]
RESOURCE_PAGE: [2-sentence resource page outreach for this niche]
BROKEN_LINK: [2-sentence broken link replacement pitch]

ACTION_PLAN:
WEEK_1: [specific link building action for week 1]
WEEK_2: [specific action for week 2]
MONTH_2: [specific action for month 2]
MONTH_3: [specific action for month 3]

TOXIC_WARNING: [specific toxic link types to avoid in this niche]`;

    const text = await callAI(prompt);
    if (text) {
      const get = (k) => { const m = text.match(new RegExp(`${k}:\\s*(.+)`)); return m ? m[1].trim() : ""; };
      const parseRows = (prefix, count) => {
        const rows = [];
        for (let i = 1; i <= count; i++) {
          const line = get(`${prefix}_${i}`);
          if (line) rows.push(line);
        }
        return rows;
      };

      setResults({
        da:              parseInt(get("DOMAIN_AUTHORITY")) || 0,
        trust:           parseInt(get("TRUST_SCORE")) || 0,
        totalBL:         get("TOTAL_BACKLINKS_EST"),
        refDomains:      get("REFERRING_DOMAINS_EST"),
        dofollowPct:     parseInt(get("DOFOLLOW_PCT")) || 60,
        nofollowPct:     parseInt(get("NOFOLLOW_PCT")) || 40,
        linkQuality:     get("LINK_QUALITY"),
        anchorDiversity: get("ANCHOR_TEXT_DIVERSITY"),
        toxicRisk:       get("TOXIC_LINKS_RISK"),
        analysis:        get("LINK_PROFILE_ANALYSIS"),
        sources:         parseRows("SRC", 5),
        anchors:         parseRows("ANC", 5),
        opportunities:   parseRows("OPP", 6),
        compDA:          get("COMP_DA"),
        compBL:          get("COMP_BACKLINKS"),
        gapAnalysis:     get("GAP_ANALYSIS"),
        guestPitch:      get("GUEST_POST"),
        resourcePitch:   get("RESOURCE_PAGE"),
        brokenPitch:     get("BROKEN_LINK"),
        week1:           get("WEEK_1"),
        week2:           get("WEEK_2"),
        month2:          get("MONTH_2"),
        month3:          get("MONTH_3"),
        toxicWarning:    get("TOXIC_WARNING"),
        domain, niche, competitor,
      });
      setActiveTab("overview");
    }
    setLoading(false);
  }

  function copyText(text, id) {
    navigator.clipboard.writeText(text);
    setCopied(id); setTimeout(() => setCopied(null), 2000);
  }

  function exportReport() {
    if (!results) return;
    const report = `BACKLINK ANALYSIS REPORT\n${"=".repeat(50)}\nDomain: ${results.domain}\nNiche: ${results.niche}\nGenerated: ${new Date().toLocaleDateString()}\n\nDomain Authority: ${results.da}/100\nTrust Score: ${results.trust}/100\nEstimated Backlinks: ${results.totalBL}\nReferring Domains: ${results.refDomains}\nLink Quality: ${results.linkQuality}\nToxic Risk: ${results.toxicRisk}\n\nANALYSIS:\n${results.analysis}\n\nOPPORTUNITIES:\n${results.opportunities.map((o, i) => `${i+1}. ${o}`).join("\n")}\n\nACTION PLAN:\nWeek 1: ${results.week1}\nWeek 2: ${results.week2}\nMonth 2: ${results.month2}\nMonth 3: ${results.month3}`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([report], { type: "text/plain" }));
    a.download = `backlink-analysis-${domain.replace(/[^a-z0-9]/gi, "-")}.txt`; a.click();
  }

  const scoreColor  = s => s >= 60 ? "#059669" : s >= 40 ? "#D97706" : "#DC2626";
  const qualColor   = q => q === "Excellent" || q === "Good" ? "#059669" : q === "Average" ? "#D97706" : "#DC2626";
  const riskColor   = r => r === "Low" ? "#059669" : r === "Medium" ? "#D97706" : "#DC2626";
  const impactColor = i => i?.toLowerCase().includes("high") ? "#DC2626" : i?.toLowerCase().includes("med") ? "#D97706" : "#059669";
  const diffColor   = d => d === "Easy" ? "#059669" : d === "Medium" ? "#D97706" : "#DC2626";

  const tabStyle = (a, color = "#7C3AED") => ({
    padding: "6px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer",
    fontWeight: a ? 600 : 400, background: a ? color + "22" : "transparent",
    color: a ? color : txt2, border: `1px solid ${a ? color + "44" : bdr}`, whiteSpace: "nowrap",
  });

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 24, background: bg }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: txt, marginBottom: 4 }}>🔗 Backlink Analyzer</div>
        <div style={{ fontSize: 13, color: txt2, marginBottom: 20 }}>
          Domain Authority · Link Profile · Opportunities · Outreach Templates · Action Plan
        </div>

        {/* Input */}
        <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 12, color: txt2, marginBottom: 6, fontWeight: 600 }}>Your Domain <span style={{ color: "#DC2626" }}>*</span></div>
              <input value={domain} onChange={e => setDomain(e.target.value)}
                placeholder="yoursite.com"
                style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${bdr}`, background: bg3, color: txt, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: txt2, marginBottom: 6, fontWeight: 600 }}>Niche / Industry</div>
              <input value={niche} onChange={e => setNiche(e.target.value)}
                placeholder="e.g. SEO, fitness, finance"
                style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${bdr}`, background: bg3, color: txt, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: txt2, marginBottom: 6, fontWeight: 600 }}>Competitor Domain</div>
              <input value={competitor} onChange={e => setComp(e.target.value)}
                placeholder="competitor.com (optional)"
                style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${bdr}`, background: bg3, color: txt, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>
          <button onClick={analyze} disabled={loading || !domain.trim()}
            style={{ width: "100%", padding: "11px", borderRadius: 10, border: "none", background: loading || !domain.trim() ? "#333" : "#1E40AF", color: loading || !domain.trim() ? txt3 : "#fff", fontWeight: 700, fontSize: 14, cursor: loading || !domain.trim() ? "not-allowed" : "pointer" }}>
            {loading ? "🔗 Analyzing backlinks..." : "🔗 Analyze Backlink Profile"}
          </button>
          <div style={{ fontSize: 11, color: txt3, marginTop: 8, textAlign: "center" }}>
            ⚠️ AI estimates based on domain/niche — for exact data use Ahrefs/Semrush
          </div>
        </div>

        {results && (
          <>
            {/* Score Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
              {[
                { label: "Domain Authority", value: `${results.da}/100`,   color: scoreColor(results.da) },
                { label: "Trust Score",      value: `${results.trust}/100`,color: scoreColor(results.trust) },
                { label: "Link Quality",     value: results.linkQuality,   color: qualColor(results.linkQuality) },
                { label: "Toxic Risk",       value: results.toxicRisk,     color: riskColor(results.toxicRisk) },
              ].map(s => (
                <div key={s.label} style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16, textAlign: "center", borderTop: `3px solid ${s.color}` }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: txt2, marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* DoFollow / NoFollow Bar */}
            <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 8 }}>
                <span style={{ color: "#059669", fontWeight: 600 }}>DoFollow {results.dofollowPct}%</span>
                <span style={{ color: txt2 }}>Est. {results.totalBL} backlinks · {results.refDomains} domains</span>
                <span style={{ color: "#D97706", fontWeight: 600 }}>NoFollow {results.nofollowPct}%</span>
              </div>
              <div style={{ height: 12, borderRadius: 6, background: bg3, overflow: "hidden" }}>
                <div style={{ height: "100%", display: "flex" }}>
                  <div style={{ width: `${results.dofollowPct}%`, background: "#059669", transition: "width 0.5s" }} />
                  <div style={{ flex: 1, background: "#D97706" }} />
                </div>
              </div>
            </div>

            {/* Export */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <button onClick={exportReport}
                style={{ padding: "7px 16px", borderRadius: 8, border: "1px solid #059669aa", background: "#05966911", color: "#059669", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                ⬇️ Export Report
              </button>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              {[
                { id: "overview",      label: "📊 Overview" },
                { id: "opportunities", label: "🎯 Opportunities" },
                { id: "anchors",       label: "⚓ Anchor Text" },
                { id: "outreach",      label: "📧 Outreach" },
                { id: "plan",          label: "🗺️ Action Plan" },
              ].map(t => (
                <div key={t.id} style={tabStyle(activeTab === t.id)} onClick={() => setActiveTab(t.id)}>{t.label}</div>
              ))}
            </div>

            {/* Overview */}
            {activeTab === "overview" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {results.analysis && (
                  <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: txt, marginBottom: 10 }}>📊 Link Profile Analysis</div>
                    <div style={{ fontSize: 13, color: txt, lineHeight: 1.8 }}>{results.analysis}</div>
                  </div>
                )}
                <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: txt, marginBottom: 12 }}>🔗 Top Link Sources</div>
                  {results.sources.map((src, i) => {
                    const parts   = src.split("|").map(p => p.trim());
                    const type    = parts[0] || src;
                    const example = parts[1]?.replace("Example:", "").trim() || "";
                    const quality = parts[2]?.replace("Quality:", "").trim() || "";
                    const count   = parts[3]?.replace("Count est:", "").trim() || "";
                    return (
                      <div key={i} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: `1px solid ${bdr}22`, alignItems: "center" }}>
                        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#1E40AF22", color: "#1E40AF", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: txt }}>{type}</div>
                          {example && <div style={{ fontSize: 11, color: txt2 }}>{example}</div>}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          {count && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: bg3, color: txt2 }}>{count}</span>}
                          {quality && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: qualColor(quality) + "22", color: qualColor(quality), fontWeight: 600 }}>{quality}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {competitor && (
                  <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: txt, marginBottom: 12 }}>⚔️ vs Competitor</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                      <div style={{ background: "#7C3AED11", borderRadius: 8, padding: 12, textAlign: "center" }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: "#7C3AED" }}>{results.da}</div>
                        <div style={{ fontSize: 11, color: txt2 }}>Your DA</div>
                      </div>
                      <div style={{ background: "#DC262611", borderRadius: 8, padding: 12, textAlign: "center" }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: "#DC2626" }}>{results.compDA}</div>
                        <div style={{ fontSize: 11, color: txt2 }}>Competitor DA</div>
                      </div>
                    </div>
                    {results.gapAnalysis && <div style={{ fontSize: 13, color: txt, lineHeight: 1.7 }}>{results.gapAnalysis}</div>}
                  </div>
                )}
                {results.toxicWarning && (
                  <div style={{ background: "#DC262611", border: "1px solid #DC262633", borderRadius: 12, padding: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#DC2626", marginBottom: 6 }}>⚠️ Toxic Links to Avoid</div>
                    <div style={{ fontSize: 12, color: txt, lineHeight: 1.7 }}>{results.toxicWarning}</div>
                  </div>
                )}
              </div>
            )}

            {/* Opportunities */}
            {activeTab === "opportunities" && (
              <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", background: bg3, borderBottom: `1px solid ${bdr}` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: txt }}>🎯 Link Building Opportunities</div>
                </div>
                {results.opportunities.map((opp, i) => {
                  const parts  = opp.split("|").map(p => p.trim());
                  const type   = parts[0] || opp;
                  const diff   = parts[1]?.replace("Difficulty:", "").trim() || "";
                  const impact = parts[2]?.replace("Impact:", "").trim() || "";
                  const action = parts[3]?.replace("Action:", "").trim() || "";
                  return (
                    <div key={i} style={{ padding: "14px 16px", borderBottom: `1px solid ${bdr}22`, display: "flex", gap: 12 }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#1E40AF22", color: "#1E40AF", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: txt, marginBottom: 6 }}>{type}</div>
                        <div style={{ display: "flex", gap: 8, marginBottom: action ? 6 : 0 }}>
                          {diff && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: diffColor(diff) + "22", color: diffColor(diff) }}>{diff}</span>}
                          {impact && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: impactColor(impact) + "22", color: impactColor(impact), fontWeight: 600 }}>{impact} Impact</span>}
                        </div>
                        {action && <div style={{ fontSize: 12, color: "#059669" }}>→ {action}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Anchor Text */}
            {activeTab === "anchors" && (
              <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", background: bg3, borderBottom: `1px solid ${bdr}` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: txt }}>⚓ Anchor Text Distribution</div>
                  <div style={{ fontSize: 11, color: txt2, marginTop: 2 }}>Diversity: {results.anchorDiversity}</div>
                </div>
                {results.anchors.map((anc, i) => {
                  const parts      = anc.split("|").map(p => p.trim());
                  const type       = parts[0] || anc;
                  const pct        = parts[1]?.replace("Percentage:", "").trim() || "";
                  const assessment = parts[2]?.replace("Assessment:", "").trim() || "";
                  return (
                    <div key={i} style={{ padding: "12px 16px", borderBottom: `1px solid ${bdr}22` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <div style={{ fontSize: 13, color: txt, fontWeight: 500 }}>{type}</div>
                        <div style={{ display: "flex", gap: 8 }}>
                          {pct && <span style={{ fontSize: 12, color: "#7C3AED", fontWeight: 700 }}>{pct}</span>}
                          {assessment && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: assessment === "Good" || assessment === "Natural" ? "#05966922" : "#DC262622", color: assessment === "Good" || assessment === "Natural" ? "#059669" : "#DC2626" }}>{assessment}</span>}
                        </div>
                      </div>
                      {pct && (
                        <div style={{ height: 4, borderRadius: 2, background: bg3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: pct, background: "#7C3AED", borderRadius: 2 }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Outreach Templates */}
            {activeTab === "outreach" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  { label: "✍️ Guest Post Pitch", text: results.guestPitch, id: "guest" },
                  { label: "📚 Resource Page Outreach", text: results.resourcePitch, id: "resource" },
                  { label: "🔗 Broken Link Replacement", text: results.brokenPitch, id: "broken" },
                ].map(t => (
                  <div key={t.id} style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ padding: "10px 16px", background: bg3, borderBottom: `1px solid ${bdr}`, display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: txt }}>{t.label}</span>
                      <button onClick={() => copyText(t.text, t.id)}
                        style={{ padding: "3px 10px", borderRadius: 6, border: `1px solid ${bdr}`, background: "transparent", color: copied === t.id ? "#059669" : txt2, fontSize: 11, cursor: "pointer" }}>
                        {copied === t.id ? "✅" : "📋 Copy"}
                      </button>
                    </div>
                    <div style={{ padding: 16 }}>
                      <div style={{ fontSize: 13, color: txt, lineHeight: 1.8 }}>{t.text || "Not generated"}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Action Plan */}
            {activeTab === "plan" && (
              <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: txt, marginBottom: 16 }}>🗺️ Link Building Action Plan</div>
                {[
                  { label: "Week 1", text: results.week1, color: "#059669" },
                  { label: "Week 2", text: results.week2, color: "#0891B2" },
                  { label: "Month 2", text: results.month2, color: "#7C3AED" },
                  { label: "Month 3", text: results.month3, color: "#D97706" },
                ].map((step, i) => (
                  <div key={i} style={{ display: "flex", gap: 14, marginBottom: 16 }}>
                    <div style={{ width: 70, height: 30, borderRadius: 20, background: step.color + "22", color: step.color, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{step.label}</div>
                    <div style={{ fontSize: 13, color: txt, lineHeight: 1.7, flex: 1 }}>{step.text || "—"}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {!results && !loading && (
          <div style={{ textAlign: "center", padding: 60, color: txt3 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
            <div style={{ fontSize: 16, color: txt, fontWeight: 600, marginBottom: 8 }}>Analyze Your Backlink Profile</div>
            <div style={{ fontSize: 13, color: txt2 }}>Get DA estimate, link opportunities, anchor text analysis + outreach templates</div>
          </div>
        )}
      </div>
    </div>
  );
}