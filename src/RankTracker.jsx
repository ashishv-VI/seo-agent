import { useState } from "react";
import { callAIBackend } from "./utils/callAI";

export default function RankTracker({ dark, keys, model, getToken }) {
  const [activeTab, setActiveTab] = useState("tracker");

  // Rank Tracker state
  const [keyword, setKeyword]     = useState("");
  const [website, setWebsite]     = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [tracked, setTracked]     = useState([]);

  // Keyword Volume state
  const [volKeywords, setVolKeywords] = useState("");
  const [volLoading, setVolLoading]   = useState(false);
  const [volResults, setVolResults]   = useState([]);
  const [volNiche, setVolNiche]       = useState("");

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const txt3 = dark ? "#444"    : "#bbb";

  async function callAI(prompt) {
    if (!getToken) return null;
    return callAIBackend(prompt, model, getToken);
  }

  async function analyzeRank() {
    if (!keyword.trim() || !website.trim()) return;
    setAnalyzing(true);
    const prompt = `You are an SEO rank analysis expert. Analyze ranking potential for:
Keyword: "${keyword}"
Website: "${website}"

Provide a detailed ranking analysis:
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
      const text = await callAI(prompt);
      if (!text) return;
      const parse = (k) => { const m = text.match(new RegExp(`${k}:\\s*(.+)`)); return m ? m[1].trim() : "N/A"; };
      setTracked(t => [{
        id: Date.now(), keyword, website,
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }),
        rankPotential:   parse("RANK_POTENTIAL"),
        difficulty:      parse("DIFFICULTY"),
        intentMatch:     parse("INTENT_MATCH"),
        contentQuality:  parse("CONTENT_QUALITY"),
        monthlySearches: parse("MONTHLY_SEARCHES"),
        competition:     parse("COMPETITION"),
        timeToRank:      parse("TIME_TO_RANK"),
        opportunityScore:parse("OPPORTUNITY_SCORE"),
        quickWin1:       parse("QUICK_WIN_1"),
        quickWin2:       parse("QUICK_WIN_2"),
        quickWin3:       parse("QUICK_WIN_3"),
        summary:         parse("SUMMARY"),
      }, ...t]);
      setKeyword("");
    } catch(e) { console.error(e); }
    setAnalyzing(false);
  }

  async function analyzeKeywordVolume() {
    const kwList = volKeywords.split("\n").map(k=>k.trim()).filter(Boolean);
    if (!kwList.length) return;
    setVolLoading(true); setVolResults([]);

    const prompt = `You are an expert SEO keyword research specialist with deep knowledge of Google search volumes and CPC data.

Analyze these ${kwList.length} keywords for the "${volNiche || "general"}" niche:
${kwList.map((k,i) => `${i+1}. ${k}`).join("\n")}

For EACH keyword provide realistic estimates based on your training data. Respond ONLY in this exact format, one line per keyword:

KEYWORD|VOLUME|CPC|DIFFICULTY|INTENT|TREND|COMPETITION
${kwList.map(k => `${k}|[monthly volume like 1000-5000]|[CPC in USD like $2.50]|[0-100]|[informational/navigational/transactional/commercial]|[growing/stable/declining]|[low/medium/high]`).join("\n")}

Rules:
- Volume: realistic monthly search estimates (use ranges like 100-500, 1K-5K, 10K-50K)
- CPC: realistic USD cost per click
- Be specific, not generic
- Base estimates on real market knowledge`;

    try {
      const text = await callAI(prompt);
      if (!text) return;

      const lines = text.split("\n").filter(l => l.includes("|") && !l.startsWith("KEYWORD"));
      const parsed = lines.map(line => {
        const parts = line.split("|").map(p => p.trim());
        return {
          keyword:    parts[0] || "",
          volume:     parts[1] || "N/A",
          cpc:        parts[2] || "N/A",
          difficulty: parts[3] || "N/A",
          intent:     parts[4] || "N/A",
          trend:      parts[5] || "stable",
          competition:parts[6] || "N/A",
        };
      }).filter(r => r.keyword && kwList.some(k => r.keyword.toLowerCase().includes(k.toLowerCase().slice(0,10))));

      // Fallback: if parsing fails, create basic results
      if (parsed.length === 0) {
        const fallback = kwList.map(k => ({ keyword: k, volume: "N/A", cpc: "N/A", difficulty: "N/A", intent: "N/A", trend: "stable", competition: "N/A" }));
        setVolResults(fallback);
      } else {
        setVolResults(parsed);
      }
    } catch(e) { console.error(e); }
    setVolLoading(false);
  }

  function exportVolCSV() {
    if (!volResults.length) return;
    const csv = ["Keyword,Monthly Volume,CPC,Difficulty,Intent,Trend,Competition",
      ...volResults.map(r => `"${r.keyword}","${r.volume}","${r.cpc}","${r.difficulty}","${r.intent}","${r.trend}","${r.competition}"`)
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    a.download = "keyword-volume-cpc.csv"; a.click();
  }

  function downloadAll() {
    const content = tracked.map(e => `KEYWORD: ${e.keyword}\nWEBSITE: ${e.website}\nOPPORTUNITY: ${e.opportunityScore}/100\nDIFFICULTY: ${e.difficulty}/100\nMONTHLY SEARCHES: ${e.monthlySearches}\nTIME TO RANK: ${e.timeToRank}\n\nQUICK WINS:\n1. ${e.quickWin1}\n2. ${e.quickWin2}\n3. ${e.quickWin3}\n\n${e.summary}`).join("\n\n" + "=".repeat(50) + "\n\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content],{type:"text/plain"}));
    a.download = `rank-tracker-${Date.now()}.txt`; a.click();
  }

  const scoreColor = s => { const n=parseInt(s); if(isNaN(n)) return txt2; return n>=70?"#059669":n>=40?"#D97706":"#DC2626"; };
  const diffColor  = s => { const n=parseInt(s); if(isNaN(n)) return txt2; return n<=30?"#059669":n<=60?"#D97706":"#DC2626"; };
  const trendIcon  = t => t==="growing"?"📈":t==="declining"?"📉":"➡️";
  const trendColor = t => t==="growing"?"#059669":t==="declining"?"#DC2626":"#D97706";
  const intentColor= i => ({ informational:"#0891B2", navigational:"#443DCB", transactional:"#059669", commercial:"#D97706" }[i?.toLowerCase()] || txt2);
  const tabStyle   = (a) => ({ padding:"7px 16px", borderRadius:20, fontSize:12, cursor:"pointer", fontWeight:a?600:400, background:a?"#443DCB22":"transparent", color:a?"#6B62E8":txt2, border:`1px solid ${a?"#443DCB44":bdr}` });

  return (
    <div style={{ flex:1, overflowY:"auto", padding:24, background:bg }}>
      <div style={{ maxWidth:860, margin:"0 auto" }}>
        <div style={{ fontSize:18, fontWeight:700, color:txt, marginBottom:4 }}>📡 Rank Tracker + Keyword Intelligence</div>
        <div style={{ fontSize:13, color:txt2, marginBottom:20 }}>AI rank analysis · Keyword volume · CPC estimates</div>

        {/* Tabs */}
        <div style={{ display:"flex", gap:8, marginBottom:20 }}>
          <div style={tabStyle(activeTab==="tracker")} onClick={()=>setActiveTab("tracker")}>📡 Rank Tracker</div>
          <div style={tabStyle(activeTab==="volume")}  onClick={()=>setActiveTab("volume")}>📊 Keyword Volume + CPC</div>
        </div>

        {/* ── RANK TRACKER TAB ── */}
        {activeTab==="tracker" && (
          <>
            <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:20 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
                <div>
                  <div style={{ fontSize:12, color:txt2, marginBottom:6 }}>Keyword to track</div>
                  <input value={keyword} onChange={e=>setKeyword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&analyzeRank()}
                    placeholder="best seo tools 2026"
                    style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", boxSizing:"border-box" }} />
                </div>
                <div>
                  <div style={{ fontSize:12, color:txt2, marginBottom:6 }}>Your website</div>
                  <input value={website} onChange={e=>setWebsite(e.target.value)} onKeyDown={e=>e.key==="Enter"&&analyzeRank()}
                    placeholder="yourdomain.com"
                    style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", boxSizing:"border-box" }} />
                </div>
              </div>
              <button onClick={analyzeRank} disabled={analyzing||!keyword.trim()||!website.trim()}
                style={{ width:"100%", padding:"10px", borderRadius:10, border:"none", background:analyzing||!keyword.trim()||!website.trim()?"#333":"#443DCB", color:analyzing||!keyword.trim()||!website.trim()?txt3:"#fff", fontWeight:600, fontSize:13, cursor:analyzing||!keyword.trim()||!website.trim()?"not-allowed":"pointer" }}>
                {analyzing ? "🔍 Analyzing..." : "📡 Analyze Ranking Potential"}
              </button>
            </div>

            {tracked.length > 0 && (
              <>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:20 }}>
                  {[
                    { label:"Tracked",       value: tracked.length,                                                                                          color:"#443DCB" },
                    { label:"Avg Opportunity",value: Math.round(tracked.reduce((a,e)=>a+(parseInt(e.opportunityScore)||0),0)/tracked.length)+"%",            color:"#059669" },
                    { label:"Avg Difficulty", value: Math.round(tracked.reduce((a,e)=>a+(parseInt(e.difficulty)||0),0)/tracked.length)+"/100",               color:"#D97706" },
                    { label:"Easy Wins",      value: tracked.filter(e=>(parseInt(e.difficulty)||0)<=40).length,                                              color:"#0891B2" },
                  ].map(s => (
                    <div key={s.label} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:14, textAlign:"center", borderTop:`3px solid ${s.color}` }}>
                      <div style={{ fontSize:20, fontWeight:700, color:s.color }}>{s.value}</div>
                      <div style={{ fontSize:11, color:txt2, marginTop:2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:txt }}>Tracked Keywords ({tracked.length})</div>
                  <button onClick={downloadAll} style={{ padding:"6px 14px", borderRadius:8, border:"1px solid #0F766E44", background:"#0F766E11", color:"#0F766E", fontSize:12, cursor:"pointer" }}>⬇️ Export All</button>
                </div>

                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  {tracked.map(e => (
                    <div key={e.id} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:18 }}>
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
                          <button onClick={()=>setTracked(t=>t.filter(x=>x.id!==e.id))} style={{ padding:"4px 8px", borderRadius:6, border:`1px solid ${bdr}`, background:"transparent", color:txt3, fontSize:11, cursor:"pointer" }}>✕</button>
                        </div>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:14 }}>
                        {[
                          { label:"Difficulty",       value:e.difficulty+"/100",    color:diffColor(e.difficulty) },
                          { label:"Intent Match",     value:e.intentMatch+"%",      color:scoreColor(e.intentMatch) },
                          { label:"Monthly Searches", value:e.monthlySearches,      color:txt },
                          { label:"Time to Rank",     value:e.timeToRank,           color:txt },
                        ].map(m => (
                          <div key={m.label} style={{ background:bg3, borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
                            <div style={{ fontSize:13, fontWeight:700, color:m.color }}>{m.value}</div>
                            <div style={{ fontSize:10, color:txt2, marginTop:2 }}>{m.label}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
                        <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, background:"#443DCB22", color:"#6B62E8" }}>Competition: {e.competition}</span>
                        <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, background:"#0891B222", color:"#0891B2" }}>Content: {e.contentQuality}</span>
                      </div>
                      <div style={{ background:bg3, borderRadius:8, padding:12, marginBottom:10 }}>
                        <div style={{ fontSize:11, fontWeight:600, color:txt, marginBottom:8 }}>⚡ Quick Wins</div>
                        {[e.quickWin1, e.quickWin2, e.quickWin3].filter(w=>w&&w!=="N/A").map((w,i) => (
                          <div key={i} style={{ display:"flex", gap:8, padding:"4px 0", fontSize:12, color:txt2 }}>
                            <span style={{ color:"#059669", flexShrink:0 }}>{i+1}.</span><span>{w}</span>
                          </div>
                        ))}
                      </div>
                      {e.summary && e.summary!=="N/A" && (
                        <div style={{ fontSize:12, color:txt2, lineHeight:1.6, fontStyle:"italic" }}>"{e.summary}"</div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {tracked.length===0 && !analyzing && (
              <div style={{ textAlign:"center", padding:60, color:txt3 }}>
                <div style={{ fontSize:40, marginBottom:12 }}>📡</div>
                <div style={{ fontSize:15, color:txt2 }}>Enter a keyword + website to start tracking</div>
                <div style={{ fontSize:12, color:txt3, marginTop:8 }}>AI-powered ranking analysis — no paid APIs needed!</div>
              </div>
            )}
          </>
        )}

        {/* ── KEYWORD VOLUME + CPC TAB ── */}
        {activeTab==="volume" && (
          <>
            <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:20 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
                <div>
                  <div style={{ fontSize:12, color:txt2, marginBottom:6 }}>Keywords (one per line, max 15)</div>
                  <textarea value={volKeywords} onChange={e=>setVolKeywords(e.target.value)}
                    placeholder={"seo tools\nkeyword research software\nbest rank tracker\nsite audit tool"}
                    rows={8}
                    style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", resize:"none", fontFamily:"inherit", boxSizing:"border-box" }} />
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  <div>
                    <div style={{ fontSize:12, color:txt2, marginBottom:6 }}>Niche / Industry (optional)</div>
                    <input value={volNiche} onChange={e=>setVolNiche(e.target.value)}
                      placeholder="e.g. SaaS, e-commerce, finance"
                      style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", boxSizing:"border-box" }} />
                  </div>
                  <div style={{ background:bg3, borderRadius:10, padding:14, flex:1 }}>
                    <div style={{ fontSize:12, fontWeight:600, color:txt, marginBottom:8 }}>📊 What you'll get:</div>
                    {["Monthly search volume estimate","CPC (cost per click) in USD","Keyword difficulty score","Search intent classification","Trend direction (growing/stable/declining)","Competition level"].map((item,i) => (
                      <div key={i} style={{ fontSize:11, color:txt2, padding:"3px 0", display:"flex", gap:6 }}>
                        <span style={{ color:"#059669" }}>✓</span>{item}
                      </div>
                    ))}
                    <div style={{ fontSize:10, color:txt3, marginTop:10, padding:"6px 8px", background:bg2, borderRadius:6 }}>
                      ⚠️ AI estimates based on training data. For exact data use Google Keyword Planner.
                    </div>
                  </div>
                  <button onClick={analyzeKeywordVolume} disabled={volLoading||!volKeywords.trim()}
                    style={{ padding:"11px", borderRadius:10, border:"none", background:volLoading||!volKeywords.trim()?"#333":"#443DCB", color:volLoading||!volKeywords.trim()?txt3:"#fff", fontWeight:700, fontSize:14, cursor:volLoading||!volKeywords.trim()?"not-allowed":"pointer" }}>
                    {volLoading ? "📊 Analyzing..." : "📊 Get Volume + CPC"}
                  </button>
                </div>
              </div>
            </div>

            {volResults.length > 0 && (
              <>
                {/* Summary stats */}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:16 }}>
                  {[
                    { label:"Keywords", value: volResults.length, color:"#443DCB" },
                    { label:"Growing", value: volResults.filter(r=>r.trend==="growing").length, color:"#059669" },
                    { label:"Low Difficulty", value: volResults.filter(r=>parseInt(r.difficulty)<=40).length, color:"#0891B2" },
                    { label:"Transactional", value: volResults.filter(r=>r.intent?.toLowerCase().includes("transactional")).length, color:"#D97706" },
                  ].map(s => (
                    <div key={s.label} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:14, textAlign:"center", borderTop:`3px solid ${s.color}` }}>
                      <div style={{ fontSize:20, fontWeight:700, color:s.color }}>{s.value}</div>
                      <div style={{ fontSize:11, color:txt2, marginTop:2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Table */}
                <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, overflow:"hidden", marginBottom:12 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 16px", borderBottom:`1px solid ${bdr}` }}>
                    <div style={{ fontSize:13, fontWeight:600, color:txt }}>Keyword Intelligence ({volResults.length})</div>
                    <button onClick={exportVolCSV} style={{ padding:"5px 14px", borderRadius:8, border:"1px solid #059669aa", background:"#05966911", color:"#059669", fontSize:12, cursor:"pointer", fontWeight:600 }}>⬇️ Export CSV</button>
                  </div>
                  <div style={{ overflowX:"auto" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse" }}>
                      <thead>
                        <tr>
                          {["Keyword","Volume","CPC","Difficulty","Intent","Trend","Competition"].map(h => (
                            <th key={h} style={{ textAlign:"left", padding:"10px 14px", fontSize:11, color:txt2, fontWeight:500, borderBottom:`1px solid ${bdr}`, textTransform:"uppercase", letterSpacing:"0.05em", whiteSpace:"nowrap", background:bg3 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {volResults.map((r,i) => (
                          <tr key={i} style={{ borderBottom:`1px solid ${bdr}33` }}>
                            <td style={{ padding:"12px 14px", fontSize:13, color:txt, fontWeight:500 }}>{r.keyword}</td>
                            <td style={{ padding:"12px 14px", fontSize:13, color:"#443DCB", fontWeight:600 }}>{r.volume}</td>
                            <td style={{ padding:"12px 14px", fontSize:13, color:"#059669", fontWeight:600 }}>{r.cpc}</td>
                            <td style={{ padding:"12px 14px" }}>
                              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                                <div style={{ width:40, height:4, borderRadius:2, background:bg3, overflow:"hidden" }}>
                                  <div style={{ height:"100%", width:`${Math.min(parseInt(r.difficulty)||0,100)}%`, background:diffColor(r.difficulty), borderRadius:2 }} />
                                </div>
                                <span style={{ fontSize:12, color:diffColor(r.difficulty), fontWeight:600 }}>{r.difficulty}</span>
                              </div>
                            </td>
                            <td style={{ padding:"12px 14px" }}>
                              <span style={{ fontSize:11, padding:"2px 8px", borderRadius:20, background:intentColor(r.intent)+"22", color:intentColor(r.intent), textTransform:"capitalize" }}>
                                {r.intent}
                              </span>
                            </td>
                            <td style={{ padding:"12px 14px" }}>
                              <span style={{ fontSize:12, color:trendColor(r.trend) }}>{trendIcon(r.trend)} {r.trend}</span>
                            </td>
                            <td style={{ padding:"12px 14px" }}>
                              <span style={{ fontSize:11, padding:"2px 8px", borderRadius:6, background:bg3, color:txt2, textTransform:"capitalize" }}>{r.competition}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {volResults.length===0 && !volLoading && (
              <div style={{ textAlign:"center", padding:60, color:txt3 }}>
                <div style={{ fontSize:40, marginBottom:12 }}>📊</div>
                <div style={{ fontSize:15, color:txt2 }}>Paste keywords to get volume + CPC estimates</div>
                <div style={{ fontSize:12, color:txt3, marginTop:8 }}>AI-powered estimates — no paid API needed!</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}