import { useState } from "react";

const GAP_CATEGORIES = [
  { id:"keywords",  icon:"🔍", label:"Keyword Gaps" },
  { id:"content",   icon:"📝", label:"Content Gaps" },
  { id:"backlinks", icon:"🔗", label:"Backlink Gaps" },
  { id:"technical", icon:"⚙️", label:"Technical Gaps" },
  { id:"social",    icon:"📱", label:"Social Gaps" },
];

export default function CompetitorGap({ dark, keys, model }) {
  const [mysite, setMysite]       = useState("");
  const [comp1, setComp1]         = useState("");
  const [comp2, setComp2]         = useState("");
  const [comp3, setComp3]         = useState("");
  const [niche, setNiche]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [results, setResults]     = useState(null);
  const [activeTab, setActiveTab] = useState("keywords");
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
    if (!mysite.trim() || !comp1.trim()) return;
    setLoading(true); setResults(null);

    const competitors = [comp1, comp2, comp3].filter(Boolean);

    const prompt = `You are an expert SEO competitive gap analyst. Analyze gaps between:

My Site: "${mysite}"
Niche: "${niche || "general"}"
Competitors: ${competitors.join(", ")}

Provide a DETAILED gap analysis in EXACTLY this format:

OVERALL_GAP_SCORE: [0-100, how much gap exists — higher = more opportunity]
URGENCY: [High/Medium/Low]

KEYWORD_GAPS:
KW_GAP_1: [keyword] | Volume: [est] | Difficulty: [0-100] | Why they rank: [reason] | Your action: [action]
KW_GAP_2: [keyword] | Volume: [est] | Difficulty: [0-100] | Why they rank: [reason] | Your action: [action]
KW_GAP_3: [keyword] | Volume: [est] | Difficulty: [0-100] | Why they rank: [reason] | Your action: [action]
KW_GAP_4: [keyword] | Volume: [est] | Difficulty: [0-100] | Why they rank: [reason] | Your action: [action]
KW_GAP_5: [keyword] | Volume: [est] | Difficulty: [0-100] | Why they rank: [reason] | Your action: [action]
KW_GAP_6: [keyword] | Volume: [est] | Difficulty: [0-100] | Why they rank: [reason] | Your action: [action]
KW_GAP_7: [keyword] | Volume: [est] | Difficulty: [0-100] | Why they rank: [reason] | Your action: [action]
KW_GAP_8: [keyword] | Volume: [est] | Difficulty: [0-100] | Why they rank: [reason] | Your action: [action]

CONTENT_GAPS:
CG_1: [content topic missing from your site] | Format: [blog/video/tool/guide] | Priority: [High/Med/Low] | Est traffic: [est]
CG_2: [content topic] | Format: [type] | Priority: [level] | Est traffic: [est]
CG_3: [content topic] | Format: [type] | Priority: [level] | Est traffic: [est]
CG_4: [content topic] | Format: [type] | Priority: [level] | Est traffic: [est]
CG_5: [content topic] | Format: [type] | Priority: [level] | Est traffic: [est]
CG_6: [content topic] | Format: [type] | Priority: [level] | Est traffic: [est]

BACKLINK_GAPS:
BL_GAP_1: [link source type] | Action: [how to get it] | Impact: [High/Med/Low]
BL_GAP_2: [link source type] | Action: [how to get it] | Impact: [High/Med/Low]
BL_GAP_3: [link source type] | Action: [how to get it] | Impact: [High/Med/Low]
BL_GAP_4: [link source type] | Action: [how to get it] | Impact: [High/Med/Low]
BL_GAP_5: [link source type] | Action: [how to get it] | Impact: [High/Med/Low]

TECHNICAL_GAPS:
TG_1: [technical issue competitor solved that you likely haven't] | Fix: [how to fix] | Impact: [High/Med/Low]
TG_2: [technical issue] | Fix: [fix] | Impact: [level]
TG_3: [technical issue] | Fix: [fix] | Impact: [level]
TG_4: [technical issue] | Fix: [fix] | Impact: [level]

SOCIAL_GAPS:
SG_1: [social platform/strategy gap] | Action: [what to do] | Impact: [High/Med/Low]
SG_2: [social gap] | Action: [action] | Impact: [level]
SG_3: [social gap] | Action: [action] | Impact: [level]

QUICK_WINS:
QW_1: [actionable win you can do this week] | Time: [hours] | Impact: [High/Med/Low]
QW_2: [quick win] | Time: [hours] | Impact: [level]
QW_3: [quick win] | Time: [hours] | Impact: [level]
QW_4: [quick win] | Time: [hours] | Impact: [level]
QW_5: [quick win] | Time: [hours] | Impact: [level]

ACTION_PLAN_30: [30-day action plan in 3-4 sentences]
ACTION_PLAN_90: [90-day action plan in 3-4 sentences]
BIGGEST_OPPORTUNITY: [single most important gap to close first and why]`;

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
        overallScore: parseInt(get("OVERALL_GAP_SCORE")) || 0,
        urgency:      get("URGENCY"),
        kwGaps:       parseRows("KW_GAP", 8),
        contentGaps:  parseRows("CG", 6),
        blGaps:       parseRows("BL_GAP", 5),
        techGaps:     parseRows("TG", 4),
        socialGaps:   parseRows("SG", 3),
        quickWins:    parseRows("QW", 5),
        plan30:       get("ACTION_PLAN_30"),
        plan90:       get("ACTION_PLAN_90"),
        bigOpportunity: get("BIGGEST_OPPORTUNITY"),
        mysite, competitors,
      });
      setActiveTab("keywords");
    }
    setLoading(false);
  }

  function copyText(text, id) {
    navigator.clipboard.writeText(text);
    setCopied(id); setTimeout(() => setCopied(null), 2000);
  }

  function exportReport() {
    if (!results) return;
    let report = `COMPETITOR GAP ANALYSIS REPORT\n${"=".repeat(50)}\nMy Site: ${results.mysite}\nCompetitors: ${results.competitors.join(", ")}\nGenerated: ${new Date().toLocaleDateString()}\n\nOverall Gap Score: ${results.overallScore}/100\nUrgency: ${results.urgency}\n\n`;
    report += `BIGGEST OPPORTUNITY:\n${results.bigOpportunity}\n\n`;
    report += `KEYWORD GAPS:\n${results.kwGaps.map((g,i) => `${i+1}. ${g}`).join("\n")}\n\n`;
    report += `CONTENT GAPS:\n${results.contentGaps.map((g,i) => `${i+1}. ${g}`).join("\n")}\n\n`;
    report += `QUICK WINS:\n${results.quickWins.map((g,i) => `${i+1}. ${g}`).join("\n")}\n\n`;
    report += `30-DAY PLAN:\n${results.plan30}\n\n90-DAY PLAN:\n${results.plan90}`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([report], { type: "text/plain" }));
    a.download = `competitor-gap-${mysite.replace(/[^a-z0-9]/gi,"-")}.txt`; a.click();
  }

  const scoreColor  = s => s >= 70 ? "#DC2626" : s >= 40 ? "#D97706" : "#059669";
  const scoreLabel  = s => s >= 70 ? "Large Gap — Big Opportunity!" : s >= 40 ? "Medium Gap — Act Soon" : "Small Gap — You're Doing Well";
  const impactColor = i => i?.toLowerCase().includes("high") ? "#DC2626" : i?.toLowerCase().includes("med") ? "#D97706" : "#059669";
  const prioColor   = p => p?.toLowerCase().includes("high") ? "#DC2626" : p?.toLowerCase().includes("med") ? "#D97706" : "#059669";

  const tabStyle = (a, color = "#7C3AED") => ({
    padding: "6px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer",
    fontWeight: a ? 600 : 400, background: a ? color + "22" : "transparent",
    color: a ? color : txt2, border: `1px solid ${a ? color + "44" : bdr}`, whiteSpace: "nowrap",
  });

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 24, background: bg }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: txt, marginBottom: 4 }}>🕵️ Competitor Gap Analyzer</div>
        <div style={{ fontSize: 13, color: txt2, marginBottom: 20 }}>
          Keyword · Content · Backlink · Technical · Social gaps — sabka analysis ek jagah
        </div>

        {/* Input */}
        <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: txt2, marginBottom: 6, fontWeight: 600 }}>Your Site <span style={{ color: "#DC2626" }}>*</span></div>
              <input value={mysite} onChange={e => setMysite(e.target.value)}
                placeholder="yoursite.com"
                style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${bdr}`, background: bg3, color: txt, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: txt2, marginBottom: 6, fontWeight: 600 }}>Your Niche / Industry</div>
              <input value={niche} onChange={e => setNiche(e.target.value)}
                placeholder="e.g. SEO tools, fitness, e-commerce"
                style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${bdr}`, background: bg3, color: txt, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
            {[
              { val: comp1, set: setComp1, label: "Competitor 1", color: "#DC2626", req: true },
              { val: comp2, set: setComp2, label: "Competitor 2", color: "#D97706", req: false },
              { val: comp3, set: setComp3, label: "Competitor 3", color: "#059669", req: false },
            ].map((c, i) => (
              <div key={i}>
                <div style={{ fontSize: 12, color: c.color, marginBottom: 6, fontWeight: 600 }}>
                  {c.label} {c.req && <span style={{ color: "#DC2626" }}>*</span>}
                </div>
                <input value={c.val} onChange={e => c.set(e.target.value)}
                  placeholder={`competitor${i + 1}.com`}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${c.color}33`, background: bg3, color: txt, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
            ))}
          </div>
          <button onClick={analyze} disabled={loading || !mysite.trim() || !comp1.trim()}
            style={{ width: "100%", padding: "11px", borderRadius: 10, border: "none", background: loading || !mysite.trim() || !comp1.trim() ? "#333" : "#7C3AED", color: loading || !mysite.trim() || !comp1.trim() ? txt3 : "#fff", fontWeight: 700, fontSize: 14, cursor: loading || !mysite.trim() || !comp1.trim() ? "not-allowed" : "pointer" }}>
            {loading ? "🕵️ Analyzing gaps..." : "🕵️ Analyze Competitor Gaps"}
          </button>
        </div>

        {results && (
          <>
            {/* Score Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 16 }}>
              <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16, textAlign: "center", borderTop: `3px solid ${scoreColor(results.overallScore)}` }}>
                <div style={{ fontSize: 36, fontWeight: 800, color: scoreColor(results.overallScore) }}>{results.overallScore}</div>
                <div style={{ fontSize: 11, color: txt2, marginTop: 2 }}>Gap Score / 100</div>
                <div style={{ fontSize: 11, color: scoreColor(results.overallScore), fontWeight: 600, marginTop: 4 }}>{scoreLabel(results.overallScore)}</div>
              </div>
              <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16, textAlign: "center", borderTop: `3px solid ${impactColor(results.urgency)}` }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: impactColor(results.urgency) }}>{results.urgency}</div>
                <div style={{ fontSize: 11, color: txt2, marginTop: 2 }}>Urgency Level</div>
              </div>
              <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16, textAlign: "center", borderTop: "3px solid #7C3AED" }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: "#A78BFA" }}>{results.competitors.length}</div>
                <div style={{ fontSize: 11, color: txt2, marginTop: 2 }}>Competitors Analyzed</div>
              </div>
            </div>

            {/* Biggest Opportunity */}
            {results.bigOpportunity && (
              <div style={{ background: "#7C3AED11", border: "1px solid #7C3AED33", borderRadius: 12, padding: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#A78BFA", marginBottom: 6 }}>🎯 Biggest Opportunity</div>
                <div style={{ fontSize: 13, color: txt, lineHeight: 1.7 }}>{results.bigOpportunity}</div>
              </div>
            )}

            {/* Export */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <button onClick={exportReport}
                style={{ padding: "7px 16px", borderRadius: 8, border: "1px solid #059669aa", background: "#05966911", color: "#059669", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                ⬇️ Export Report
              </button>
              <button onClick={() => copyText(results.bigOpportunity, "opp")}
                style={{ padding: "7px 16px", borderRadius: 8, border: `1px solid ${bdr}`, background: "transparent", color: copied === "opp" ? "#059669" : txt2, fontSize: 12, cursor: "pointer" }}>
                {copied === "opp" ? "✅ Copied" : "📋 Copy Opportunity"}
              </button>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              {GAP_CATEGORIES.map(gc => (
                <div key={gc.id} style={tabStyle(activeTab === gc.id)} onClick={() => setActiveTab(gc.id)}>
                  {gc.icon} {gc.label}
                </div>
              ))}
              <div style={tabStyle(activeTab === "quickwins", "#059669")} onClick={() => setActiveTab("quickwins")}>⚡ Quick Wins</div>
              <div style={tabStyle(activeTab === "plan", "#D97706")} onClick={() => setActiveTab("plan")}>🗺️ Action Plan</div>
            </div>

            {/* Keyword Gaps */}
            {activeTab === "keywords" && (
              <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", background: bg3, borderBottom: `1px solid ${bdr}` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: txt }}>🔍 Keyword Gaps ({results.kwGaps.length})</div>
                  <div style={{ fontSize: 11, color: txt2, marginTop: 2 }}>Keywords competitors rank for but you don't</div>
                </div>
                {results.kwGaps.map((gap, i) => {
                  const parts = gap.split("|").map(p => p.trim());
                  const kw       = parts[0] || gap;
                  const volume   = parts[1]?.replace("Volume:", "").trim() || "";
                  const diff     = parts[2]?.replace("Difficulty:", "").trim() || "";
                  const why      = parts[3]?.replace("Why they rank:", "").trim() || "";
                  const action   = parts[4]?.replace("Your action:", "").trim() || "";
                  return (
                    <div key={i} style={{ padding: "14px 16px", borderBottom: `1px solid ${bdr}22`, display: "flex", gap: 14, alignItems: "flex-start" }}>
                      <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#7C3AED22", color: "#A78BFA", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: txt, marginBottom: 6 }}>{kw}</div>
                        <div style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                          {volume && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "#7C3AED22", color: "#A78BFA" }}>{volume}</span>}
                          {diff && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: parseInt(diff) <= 40 ? "#05966922" : "#DC262622", color: parseInt(diff) <= 40 ? "#059669" : "#DC2626" }}>Difficulty: {diff}</span>}
                        </div>
                        {why && <div style={{ fontSize: 12, color: txt2, marginBottom: 4 }}>💡 Why they rank: {why}</div>}
                        {action && <div style={{ fontSize: 12, color: "#059669", fontWeight: 500 }}>→ {action}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Content Gaps */}
            {activeTab === "content" && (
              <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", background: bg3, borderBottom: `1px solid ${bdr}` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: txt }}>📝 Content Gaps ({results.contentGaps.length})</div>
                  <div style={{ fontSize: 11, color: txt2, marginTop: 2 }}>Topics they cover that you're missing</div>
                </div>
                {results.contentGaps.map((gap, i) => {
                  const parts  = gap.split("|").map(p => p.trim());
                  const topic  = parts[0] || gap;
                  const format = parts[1]?.replace("Format:", "").trim() || "";
                  const prio   = parts[2]?.replace("Priority:", "").trim() || "";
                  const traffic= parts[3]?.replace("Est traffic:", "").trim() || "";
                  return (
                    <div key={i} style={{ padding: "14px 16px", borderBottom: `1px solid ${bdr}22`, display: "flex", gap: 14, alignItems: "flex-start" }}>
                      <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#0891B222", color: "#0891B2", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: txt, marginBottom: 6 }}>{topic}</div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {format && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "#0891B222", color: "#0891B2" }}>{format}</span>}
                          {prio && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: prioColor(prio) + "22", color: prioColor(prio), fontWeight: 600 }}>{prio} Priority</span>}
                          {traffic && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: bg3, color: txt2 }}>Est: {traffic}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Backlink Gaps */}
            {activeTab === "backlinks" && (
              <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", background: bg3, borderBottom: `1px solid ${bdr}` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: txt }}>🔗 Backlink Gaps ({results.blGaps.length})</div>
                </div>
                {results.blGaps.map((gap, i) => {
                  const parts  = gap.split("|").map(p => p.trim());
                  const source = parts[0] || gap;
                  const action = parts[1]?.replace("Action:", "").trim() || "";
                  const impact = parts[2]?.replace("Impact:", "").trim() || "";
                  return (
                    <div key={i} style={{ padding: "14px 16px", borderBottom: `1px solid ${bdr}22` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: txt }}>{source}</div>
                        {impact && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: impactColor(impact) + "22", color: impactColor(impact), fontWeight: 600, flexShrink: 0 }}>{impact}</span>}
                      </div>
                      {action && <div style={{ fontSize: 12, color: "#059669" }}>→ {action}</div>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Technical Gaps */}
            {activeTab === "technical" && (
              <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", background: bg3, borderBottom: `1px solid ${bdr}` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: txt }}>⚙️ Technical Gaps ({results.techGaps.length})</div>
                </div>
                {results.techGaps.map((gap, i) => {
                  const parts  = gap.split("|").map(p => p.trim());
                  const issue  = parts[0] || gap;
                  const fix    = parts[1]?.replace("Fix:", "").trim() || "";
                  const impact = parts[2]?.replace("Impact:", "").trim() || "";
                  return (
                    <div key={i} style={{ padding: "14px 16px", borderBottom: `1px solid ${bdr}22` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: txt }}>{issue}</div>
                        {impact && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: impactColor(impact) + "22", color: impactColor(impact), fontWeight: 600 }}>{impact}</span>}
                      </div>
                      {fix && <div style={{ fontSize: 12, color: "#D97706" }}>🔧 Fix: {fix}</div>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Social Gaps */}
            {activeTab === "social" && (
              <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", background: bg3, borderBottom: `1px solid ${bdr}` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: txt }}>📱 Social Gaps ({results.socialGaps.length})</div>
                </div>
                {results.socialGaps.map((gap, i) => {
                  const parts  = gap.split("|").map(p => p.trim());
                  const issue  = parts[0] || gap;
                  const action = parts[1]?.replace("Action:", "").trim() || "";
                  const impact = parts[2]?.replace("Impact:", "").trim() || "";
                  return (
                    <div key={i} style={{ padding: "14px 16px", borderBottom: `1px solid ${bdr}22` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: txt }}>{issue}</div>
                        {impact && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: impactColor(impact) + "22", color: impactColor(impact), fontWeight: 600 }}>{impact}</span>}
                      </div>
                      {action && <div style={{ fontSize: 12, color: "#0891B2" }}>→ {action}</div>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Quick Wins */}
            {activeTab === "quickwins" && (
              <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", background: bg3, borderBottom: `1px solid ${bdr}` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: txt }}>⚡ Quick Wins — Do This Week</div>
                </div>
                {results.quickWins.map((win, i) => {
                  const parts  = win.split("|").map(p => p.trim());
                  const action = parts[0] || win;
                  const time   = parts[1]?.replace("Time:", "").trim() || "";
                  const impact = parts[2]?.replace("Impact:", "").trim() || "";
                  return (
                    <div key={i} style={{ padding: "14px 16px", borderBottom: `1px solid ${bdr}22`, display: "flex", gap: 12, alignItems: "flex-start" }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#059669", color: "#fff", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, color: txt, lineHeight: 1.5, marginBottom: 6 }}>{action}</div>
                        <div style={{ display: "flex", gap: 8 }}>
                          {time && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: bg3, color: txt2 }}>⏱ {time}</span>}
                          {impact && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: impactColor(impact) + "22", color: impactColor(impact), fontWeight: 600 }}>{impact} Impact</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Action Plan */}
            {activeTab === "plan" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  { title: "📅 30-Day Action Plan", text: results.plan30, color: "#7C3AED" },
                  { title: "🗓️ 90-Day Action Plan", text: results.plan90, color: "#0891B2" },
                ].map((plan, i) => (
                  <div key={i} style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: plan.color, marginBottom: 12 }}>{plan.title}</div>
                    <div style={{ fontSize: 13, color: txt, lineHeight: 1.8 }}>{plan.text}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {!results && !loading && (
          <div style={{ textAlign: "center", padding: 60, color: txt3 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🕵️</div>
            <div style={{ fontSize: 16, color: txt, fontWeight: 600, marginBottom: 8 }}>Find What Your Competitors Have That You Don't</div>
            <div style={{ fontSize: 13, color: txt2 }}>Enter your site + competitor URLs to see full gap analysis</div>
          </div>
        )}
      </div>
    </div>
  );
}