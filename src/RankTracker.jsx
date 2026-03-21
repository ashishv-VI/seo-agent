import { useState } from "react";

export default function RankTracker({ dark, keys, model }) {
  const [keyword, setKeyword]   = useState("");
  const [website, setWebsite]   = useState("");
  const [loading, setLoading]   = useState(false);
  const [tracked, setTracked]   = useState([]);
  const [analyzing, setAnalyzing] = useState(false);

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const txt3 = dark ? "#444"    : "#bbb";

  async function analyzeRank() {
    if (!keyword.trim() || !website.trim()) return;
    const key = model === "groq" ? keys.groq : keys.gemini;
    if (!key) return;
    setAnalyzing(true);
    const prompt = `You are an SEO rank analysis expert. Analyze ranking potential for:
Keyword: "${keyword}"
Website: "${website}"

Provide a detailed ranking analysis:
1. Estimated current rank potential (1-100 scale, where 1 = top ranking)
2. Ranking difficulty (0-100)
3. Search intent match score (0-100)
4. Content quality needed (Low/Medium/High/Expert)
5. Estimated monthly searches (rough estimate)
6. Competition level (Low/Medium/High/Very High)
7. Time to rank page 1 (realistic estimate)
8. Top 3 quick wins to improve ranking NOW
9. Overall ranking opportunity score (0-100)

Format your response as:
RANK_POTENTIAL: [number 1-100]
DIFFICULTY: [number 0-100]
INTENT_MATCH: [number 0-100]
CONTENT_QUALITY: [Low/Medium/High/Expert]
MONTHLY_SEARCHES: [estimate like "1K-10K"]
COMPETITION: [Low/Medium/High/Very High]
TIME_TO_RANK: [like "3-6 months"]
OPPORTUNITY_SCORE: [number 0-100]
QUICK_WIN_1: [specific action]
QUICK_WIN_2: [specific action]
QUICK_WIN_3: [specific action]
SUMMARY: [2-3 sentence analysis]`;

    try {
      let text = "";
      if (model === "groq") {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
          body: JSON.stringify({ model: "llama-3.1-8b-instant", max_tokens: 800, messages: [{ role: "user", content: prompt }] })
        });
        const d = await res.json();
        text = d.choices?.[0]?.message?.content || "";
      } else {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const d = await res.json();
        text = d.candidates?.[0]?.content?.parts?.[0]?.text || "";
      }

      const parse = (key) => {
        const match = text.match(new RegExp(`${key}:\\s*(.+)`));
        return match ? match[1].trim() : "N/A";
      };

      const entry = {
        id: Date.now(),
        keyword,
        website,
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }),
        rankPotential:  parse("RANK_POTENTIAL"),
        difficulty:     parse("DIFFICULTY"),
        intentMatch:    parse("INTENT_MATCH"),
        contentQuality: parse("CONTENT_QUALITY"),
        monthlySearches:parse("MONTHLY_SEARCHES"),
        competition:    parse("COMPETITION"),
        timeToRank:     parse("TIME_TO_RANK"),
        opportunityScore: parse("OPPORTUNITY_SCORE"),
        quickWin1:      parse("QUICK_WIN_1"),
        quickWin2:      parse("QUICK_WIN_2"),
        quickWin3:      parse("QUICK_WIN_3"),
        summary:        parse("SUMMARY"),
        raw: text,
      };

      setTracked(t => [entry, ...t]);
      setKeyword("");
    } catch(e) { console.error(e); }
    setAnalyzing(false);
  }

  function removeEntry(id) {
    setTracked(t => t.filter(e => e.id !== id));
  }

  function downloadAll() {
    const content = tracked.map(e => `
KEYWORD: ${e.keyword}
WEBSITE: ${e.website}
DATE: ${e.date} ${e.time}
━━━━━━━━━━━━━━━━━━━━
Rank Potential: ${e.rankPotential}/100
Difficulty: ${e.difficulty}/100
Opportunity Score: ${e.opportunityScore}/100
Monthly Searches: ${e.monthlySearches}
Competition: ${e.competition}
Time to Rank: ${e.timeToRank}
Content Needed: ${e.contentQuality}

Quick Wins:
1. ${e.quickWin1}
2. ${e.quickWin2}
3. ${e.quickWin3}

Summary: ${e.summary}
`).join("\n" + "=".repeat(50) + "\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `rank-tracker-${Date.now()}.txt`; a.click();
    URL.revokeObjectURL(url);
  }

  const scoreColor = s => {
    const n = parseInt(s);
    if (isNaN(n)) return txt2;
    return n >= 70 ? "#059669" : n >= 40 ? "#D97706" : "#DC2626";
  };

  const diffColor = s => {
    const n = parseInt(s);
    if (isNaN(n)) return txt2;
    return n <= 30 ? "#059669" : n <= 60 ? "#D97706" : "#DC2626";
  };

  return (
    <div style={{ flex:1, overflowY:"auto", padding:24, background:bg }}>
      <div style={{ maxWidth:800, margin:"0 auto" }}>
        <div style={{ fontSize:18, fontWeight:700, color:txt, marginBottom:4 }}>📡 AI Rank Tracker</div>
        <div style={{ fontSize:13, color:txt2, marginBottom:20 }}>Track keyword ranking potential with AI analysis</div>

        {/* Input */}
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:20 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
            <div>
              <div style={{ fontSize:12, color:txt2, marginBottom:6 }}>Keyword to track</div>
              <input value={keyword} onChange={e=>setKeyword(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&analyzeRank()}
                placeholder="best seo tools 2026" style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", boxSizing:"border-box" }} />
            </div>
            <div>
              <div style={{ fontSize:12, color:txt2, marginBottom:6 }}>Your website</div>
              <input value={website} onChange={e=>setWebsite(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&analyzeRank()}
                placeholder="yourdomain.com" style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", boxSizing:"border-box" }} />
            </div>
          </div>
          <button onClick={analyzeRank} disabled={analyzing||!keyword.trim()||!website.trim()}
            style={{ width:"100%", padding:"10px", borderRadius:10, border:"none", background:analyzing||!keyword.trim()||!website.trim()?"#333":"#7C3AED", color:analyzing||!keyword.trim()||!website.trim()?txt3:"#fff", fontWeight:600, fontSize:13, cursor:analyzing||!keyword.trim()||!website.trim()?"not-allowed":"pointer" }}>
            {analyzing ? "🔍 Analyzing..." : "📡 Analyze Ranking Potential"}
          </button>
        </div>

        {/* Stats */}
        {tracked.length > 0 && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:20 }}>
              {[
                { label:"Tracked", value: tracked.length, color:"#7C3AED" },
                { label:"Avg Opportunity", value: Math.round(tracked.reduce((a,e)=>a+(parseInt(e.opportunityScore)||0),0)/tracked.length)+"%", color:"#059669" },
                { label:"Avg Difficulty", value: Math.round(tracked.reduce((a,e)=>a+(parseInt(e.difficulty)||0),0)/tracked.length)+"/100", color:"#D97706" },
                { label:"Easy Wins", value: tracked.filter(e=>(parseInt(e.difficulty)||0)<=40).length, color:"#0891B2" },
              ].map(s => (
                <div key={s.label} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:14, textAlign:"center", borderTop:`3px solid ${s.color}` }}>
                  <div style={{ fontSize:20, fontWeight:700, color:s.color }}>{s.value}</div>
                  <div style={{ fontSize:11, color:txt2, marginTop:2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <div style={{ fontSize:13, fontWeight:600, color:txt }}>Tracked Keywords ({tracked.length})</div>
              <button onClick={downloadAll} style={{ padding:"6px 14px", borderRadius:8, border:"1px solid #0F766E44", background:"#0F766E11", color:"#0F766E", fontSize:12, cursor:"pointer" }}>
                ⬇️ Export All
              </button>
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {tracked.map(e => (
                <div key={e.id} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:18 }}>
                  {/* Header */}
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
                    <div>
                      <div style={{ fontSize:14, fontWeight:700, color:txt }}>{e.keyword}</div>
                      <div style={{ fontSize:11, color:txt2, marginTop:2 }}>{e.website} · {e.date} {e.time}</div>
                    </div>
                    <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                      <div style={{ textAlign:"center", background:`${scoreColor(e.opportunityScore)}22`, border:`1px solid ${scoreColor(e.opportunityScore)}44`, borderRadius:8, padding:"6px 12px" }}>
                        <div style={{ fontSize:18, fontWeight:800, color:scoreColor(e.opportunityScore) }}>{e.opportunityScore}</div>
                        <div style={{ fontSize:9, color:txt2 }}>OPPORTUNITY</div>
                      </div>
                      <button onClick={()=>removeEntry(e.id)} style={{ padding:"4px 8px", borderRadius:6, border:`1px solid ${bdr}`, background:"transparent", color:txt3, fontSize:11, cursor:"pointer" }}>✕</button>
                    </div>
                  </div>

                  {/* Metrics grid */}
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:14 }}>
                    {[
                      { label:"Difficulty", value:e.difficulty+"/100", color:diffColor(e.difficulty) },
                      { label:"Intent Match", value:e.intentMatch+"%", color:scoreColor(e.intentMatch) },
                      { label:"Monthly Searches", value:e.monthlySearches, color:txt },
                      { label:"Time to Rank", value:e.timeToRank, color:txt },
                    ].map(m => (
                      <div key={m.label} style={{ background:bg3, borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
                        <div style={{ fontSize:13, fontWeight:700, color:m.color }}>{m.value}</div>
                        <div style={{ fontSize:10, color:txt2, marginTop:2 }}>{m.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Badges */}
                  <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
                    <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, background:"#7C3AED22", color:"#A78BFA" }}>Competition: {e.competition}</span>
                    <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, background:"#0891B222", color:"#0891B2" }}>Content: {e.contentQuality}</span>
                  </div>

                  {/* Quick Wins */}
                  <div style={{ background:bg3, borderRadius:8, padding:12, marginBottom:10 }}>
                    <div style={{ fontSize:11, fontWeight:600, color:txt, marginBottom:8 }}>⚡ Quick Wins</div>
                    {[e.quickWin1, e.quickWin2, e.quickWin3].filter(w=>w&&w!=="N/A").map((w,i) => (
                      <div key={i} style={{ display:"flex", gap:8, padding:"4px 0", fontSize:12, color:txt2 }}>
                        <span style={{ color:"#059669", flexShrink:0 }}>{i+1}.</span>
                        <span>{w}</span>
                      </div>
                    ))}
                  </div>

                  {/* Summary */}
                  {e.summary && e.summary !== "N/A" && (
                    <div style={{ fontSize:12, color:txt2, lineHeight:1.6, fontStyle:"italic" }}>"{e.summary}"</div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {tracked.length === 0 && !analyzing && (
          <div style={{ textAlign:"center", padding:60, color:txt3 }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📡</div>
            <div style={{ fontSize:15, color:txt2 }}>Enter a keyword + website to start tracking</div>
            <div style={{ fontSize:12, color:txt3, marginTop:8 }}>AI-powered ranking analysis — no paid APIs needed!</div>
          </div>
        )}
      </div>
    </div>
  );
}