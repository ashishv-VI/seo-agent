import { useState, useEffect, useRef } from "react";
import { TOOLS, CATS, MODELS } from "./tools";
import Dashboard from "./Dashboard";
import History from "./History";
import Markdown from "./Markdown";
import GscDashboard from "./GscDashboard";
import SiteAudit from "./SiteAudit";
import Compare from "./Compare";
import ReportGenerator from "./ReportGenerator";
import RankTracker from "./RankTracker";
import ContentCalendar from "./ContentCalendar";
import SeoChecklist from "./SeoChecklist";

export default function App() {
  const [tool, setTool]       = useState(null);
  const [page, setPage]       = useState("dashboard");
  const [input, setInput]     = useState("");
  const [msgs, setMsgs]       = useState({});
  const [loading, setLoading] = useState(false);
  const [model, setModel]     = useState("groq");
  const [cat, setCat]         = useState("All");
  const [sideOpen, setSideOpen] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [count, setCount]     = useState(0);
  const [dark, setDark]       = useState(true);
  const [keys, setKeys]       = useState({ groq:"", gemini:"", google:"" });
  const [tmpKeys, setTmpKeys] = useState({ groq:"", gemini:"", google:"" });
  const [copied, setCopied]   = useState(null);
  const [bulkInput, setBulkInput]     = useState("");
  const [bulkResults, setBulkResults] = useState([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    const saved = localStorage.getItem("seo_keys");
    if (saved) { const k = JSON.parse(saved); setKeys(k); setTmpKeys(k); }
    const savedCount = localStorage.getItem("seo_count");
    if (savedCount) setCount(parseInt(savedCount));
    const savedDark = localStorage.getItem("seo_dark");
    if (savedDark !== null) setDark(savedDark === "true");
  }, []);

  useEffect(() => {
    document.body.style.background = dark ? "#0a0a0a" : "#f5f5f0";
    document.body.style.color = dark ? "#e8e8e8" : "#1a1a18";
  }, [dark]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, loading]);

  const curMsgs = tool ? (msgs[tool.id] || []) : [];
  const filtered = cat === "All" ? TOOLS : TOOLS.filter(t => t.cat === cat);
  const catGroups = [...new Set(filtered.map(t => t.cat))];
  const totalHistory = Object.values(msgs).reduce((a, m) => a + Math.floor(m.length / 2), 0);

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const txt3 = dark ? "#444"    : "#bbb";

  function toggleDark() {
    const nd = !dark; setDark(nd);
    localStorage.setItem("seo_dark", nd);
  }

  function saveKeys() {
    localStorage.setItem("seo_keys", JSON.stringify(tmpKeys));
    setKeys(tmpKeys); setShowSettings(false);
  }

  function copyText(text, id) {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  function addMsg(toolId, msg) {
    setMsgs(m => ({ ...m, [toolId]: [...(m[toolId] || []), msg] }));
  }

  function selectTool(t) {
    setTool(t); setPage("tool"); setInput("");
  }

  function downloadText(text, filename) {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  async function callAI(prompt) {
    const key = model === "groq" ? keys.groq : keys.gemini;
    if (!key) return null;
    if (model === "groq") {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
        body: JSON.stringify({ model: "llama-3.1-8b-instant", max_tokens: 2000, messages: [{ role: "user", content: prompt }] })
      });
      const d = await res.json();
      return d.choices?.[0]?.message?.content || null;
    } else {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const d = await res.json();
      return d.candidates?.[0]?.content?.parts?.[0]?.text || null;
    }
  }

  async function runBulkKeywords() {
    const keywords = bulkInput.split("\n").map(k => k.trim()).filter(Boolean);
    if (!keywords.length) return;
    if (!keys.groq && !keys.gemini) { setShowSettings(true); return; }
    setBulkLoading(true); setBulkResults([]);
    for (const kw of keywords.slice(0, 10)) {
      const prompt = `Analyze this SEO keyword: "${kw}". Give: 1) Search intent (1 word) 2) Difficulty (Low/Med/High) 3) One content angle. Format: Intent: X | Difficulty: X | Angle: X`;
      const result = await callAI(prompt);
      setBulkResults(r => [...r, { keyword: kw, result: result || "Error" }]);
    }
    setBulkLoading(false);
  }

  async function runPageSpeed(url) {
    if (!keys.google) { setShowSettings(true); return; }
    addMsg(tool.id, { role: "user", text: url });
    setLoading(true); setInput("");
    try {
      const [mob, desk] = await Promise.all([
        fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${keys.google}&strategy=mobile`).then(r => r.json()),
        fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${keys.google}&strategy=desktop`).then(r => r.json()),
      ]);
      const score = (d, k) => Math.round((d.lighthouseResult?.categories?.[k]?.score || 0) * 100);
      const val   = (d, k) => d.lighthouseResult?.audits?.[k]?.displayValue || "N/A";
      const grade = s => s >= 90 ? "✅ Good" : s >= 50 ? "⚠️ Needs Work" : "❌ Poor";
      const text = `## ⚡ Page Speed Report\n\n**URL:** ${url}\n\n### 📱 Mobile\n- **Performance:** ${score(mob,"performance")}/100 ${grade(score(mob,"performance"))}\n- **SEO:** ${score(mob,"seo")}/100 ${grade(score(mob,"seo"))}\n- **Accessibility:** ${score(mob,"accessibility")}/100\n- **Best Practices:** ${score(mob,"best-practices")}/100\n\n### 🖥️ Desktop\n- **Performance:** ${score(desk,"performance")}/100 ${grade(score(desk,"performance"))}\n- **SEO:** ${score(desk,"seo")}/100\n\n### 📊 Core Web Vitals\n- **LCP:** ${val(mob,"largest-contentful-paint")} *(target: <2.5s)*\n- **TBT:** ${val(mob,"total-blocking-time")} *(target: <100ms)*\n- **CLS:** ${val(mob,"cumulative-layout-shift")} *(target: <0.1)*\n- **FCP:** ${val(mob,"first-contentful-paint")}\n- **TTFB:** ${val(mob,"server-response-time")}`;
      addMsg(tool.id, { role: "assistant", text });
      const nc = count + 1; setCount(nc); localStorage.setItem("seo_count", nc);
    } catch(e) { addMsg(tool.id, { role: "assistant", text: "Error: " + e.message }); }
    setLoading(false);
  }

  async function run() {
    const q = input.trim();
    if (!q || loading || !tool) return;
    if (tool.isApi && tool.apiType === "pagespeed") { runPageSpeed(q); return; }
    const key = model === "groq" ? keys.groq : keys.gemini;
    if (!key) { setShowSettings(true); return; }
    addMsg(tool.id, { role: "user", text: q });
    setInput(""); setLoading(true);
    try {
      const text = await callAI(tool.prompt(q));
      addMsg(tool.id, { role: "assistant", text: text || "No response." });
      const nc = count + 1; setCount(nc); localStorage.setItem("seo_count", nc);
    } catch(e) { addMsg(tool.id, { role: "assistant", text: "Error: " + e.message }); }
    setLoading(false);
  }

  const s = {
    app:    { fontFamily:"Inter,system-ui,sans-serif", display:"flex", height:"100vh", background:bg, color:txt, overflow:"hidden" },
    side:   { width:sideOpen?240:0, minWidth:sideOpen?240:0, background:bg2, borderRight:`1px solid ${bdr}`, display:"flex", flexDirection:"column", transition:"all 0.2s", overflow:"hidden", flexShrink:0 },
    logo:   { padding:"14px 16px", borderBottom:`1px solid ${bdr}`, display:"flex", alignItems:"center", gap:10, flexShrink:0 },
    badge:  { width:32, height:32, borderRadius:8, background:"#7C3AED", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:14, color:"#fff", flexShrink:0 },
    nav:    { flex:1, overflowY:"auto", padding:"6px" },
    catRow: { display:"flex", flexWrap:"wrap", gap:4, padding:"8px 4px 4px" },
    catBtn: a => ({ padding:"3px 9px", borderRadius:20, fontSize:11, fontWeight:a?600:400, cursor:"pointer", border:"1px solid", background:a?"#7C3AED22":"transparent", color:a?"#A78BFA":txt2, borderColor:a?"#7C3AED44":bdr }),
    secLabel: { fontSize:10, color:txt3, padding:"8px 8px 3px", textTransform:"uppercase", letterSpacing:"0.08em" },
    navItem: (a, color) => ({ display:"flex", alignItems:"center", gap:8, padding:"7px 10px", borderRadius:8, marginBottom:1, cursor:"pointer", fontSize:12, fontWeight:a?600:400, background:a?color+"22":"transparent", color:a?color:txt2, border:a?`1px solid ${color}33`:"1px solid transparent", whiteSpace:"nowrap" }),
    main:   { flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0 },
    header: { padding:"10px 16px", borderBottom:`1px solid ${bdr}`, background:bg2, display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, flexShrink:0 },
    msgs:   { flex:1, overflowY:"auto", padding:"20px", display:"flex", flexDirection:"column", gap:14 },
    uBub:   { alignSelf:"flex-end", background:"#7C3AED", color:"#fff", padding:"10px 14px", borderRadius:"12px 12px 4px 12px", maxWidth:"75%", fontSize:13, lineHeight:1.6, whiteSpace:"pre-wrap" },
    aBub:   { alignSelf:"flex-start", background:bg3, border:`1px solid ${bdr}`, color:txt, padding:"14px 16px", borderRadius:"4px 12px 12px 12px", maxWidth:"88%", fontSize:13 },
    inputArea: { padding:"12px 16px", borderTop:`1px solid ${bdr}`, background:bg2, flexShrink:0 },
    textarea:  { flex:1, padding:"10px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, resize:"none", outline:"none", fontFamily:"inherit", lineHeight:1.5 },
    runBtn: ok => ({ padding:"0 18px", borderRadius:10, border:"none", background:ok?"#7C3AED":bdr, color:ok?"#fff":txt3, fontWeight:600, fontSize:13, cursor:ok?"pointer":"not-allowed", flexShrink:0, minWidth:64 }),
    overlay:{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 },
    modal:  { background:bg2, border:`1px solid ${bdr}`, borderRadius:16, padding:28, width:440, maxWidth:"92vw" },
    label:  { fontSize:12, color:txt2, marginBottom:4, display:"block", marginTop:12 },
    inp:    { width:"100%", padding:"9px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", boxSizing:"border-box" },
    saveBtn:{ width:"100%", padding:11, borderRadius:8, border:"none", background:"#7C3AED", color:"#fff", fontWeight:600, fontSize:14, cursor:"pointer", marginTop:16 },
  };

  const pageLabels = { dashboard:"🏠 Dashboard", history:"📚 History", bulk:"📊 Bulk Keywords", gsc:"📈 Search Console", audit:"🏥 Site Audit", compare:"⚔️ Compare Sites", report:"📄 Report Generator", ranktracker:"📡 Rank Tracker", calendar:"📅 Content Calendar", checklist:"✅ SEO Checklist" };
  const headerSubs  = { dashboard:`${TOOLS.length} tools · ${count} analyses`, history:`${totalHistory} saved`, bulk:"10 keywords at once", gsc:"Last 28 days", audit:"Technical SEO + AI", compare:"Side-by-side", report:"Client-ready reports", ranktracker:"AI rank analysis", calendar:"Plan your content", checklist:"48 items · 7 categories" };
  const headerTitle = page==="tool"&&tool ? `${tool.icon} ${tool.label}` : pageLabels[page] || "🏠 Dashboard";
  const headerSub   = page==="tool"&&tool ? `${tool.cat} · ${curMsgs.filter(m=>m.role==="user").length} queries` : headerSubs[page] || "";

  return (
    <div style={s.app}>
      {/* Sidebar */}
      <div style={s.side}>
        <div style={s.logo}>
          <div style={s.badge}>S</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:700, color:txt }}>SEO Agent</div>
            <div style={{ fontSize:10, color:txt3 }}>v13.0 · {TOOLS.length} tools</div>
          </div>
        </div>
        <div style={s.nav}>
          <div style={{ padding:"6px 4px 2px" }}>
            <div style={s.secLabel}>Pages</div>
            <div onClick={()=>setPage("dashboard")}   style={s.navItem(page==="dashboard","#7C3AED")}>🏠 <span>Dashboard</span></div>
            <div onClick={()=>setPage("gsc")}         style={s.navItem(page==="gsc","#059669")}>📈 <span>Search Console</span></div>
            <div onClick={()=>setPage("audit")}       style={s.navItem(page==="audit","#DC2626")}>🏥 <span>Site Audit</span></div>
            <div onClick={()=>setPage("compare")}     style={s.navItem(page==="compare","#0891B2")}>⚔️ <span>Compare Sites</span></div>
            <div onClick={()=>setPage("ranktracker")} style={s.navItem(page==="ranktracker","#059669")}>📡 <span>Rank Tracker</span></div>
            <div onClick={()=>setPage("calendar")}    style={s.navItem(page==="calendar","#B45309")}>📅 <span>Content Calendar</span></div>
            <div onClick={()=>setPage("checklist")}   style={s.navItem(page==="checklist","#059669")}>✅ <span>SEO Checklist</span></div>
            <div onClick={()=>setPage("bulk")}        style={s.navItem(page==="bulk","#CA8A04")}>📊 <span>Bulk Keywords</span></div>
            <div onClick={()=>setPage("report")}      style={s.navItem(page==="report","#9333EA")}>📄 <span>Report Generator</span></div>
            <div onClick={()=>setPage("history")}     style={s.navItem(page==="history","#D97706")}>
              📚 <span>History</span>
              {totalHistory>0 && <span style={{ marginLeft:"auto", fontSize:10, background:"#D9770622", color:"#D97706", padding:"1px 6px", borderRadius:10, flexShrink:0 }}>{totalHistory}</span>}
            </div>
          </div>

          <div style={s.catRow}>
            {CATS.map(c => <div key={c} style={s.catBtn(cat===c)} onClick={()=>setCat(c)}>{c}</div>)}
          </div>

          {catGroups.map(c => (
            <div key={c}>
              <div style={s.secLabel}>{c}</div>
              {filtered.filter(t=>t.cat===c).map(t => (
                <div key={t.id} style={s.navItem(page==="tool"&&tool?.id===t.id, t.color)} onClick={()=>selectTool(t)}>
                  <span style={{ fontSize:14, flexShrink:0 }}>{t.icon}</span>
                  <span style={{ overflow:"hidden", textOverflow:"ellipsis" }}>{t.label}</span>
                  {t.isApi && <span style={{ fontSize:9, background:"#0F766E22", color:"#0F766E", padding:"1px 5px", borderRadius:4, marginLeft:"auto", flexShrink:0 }}>API</span>}
                  {(msgs[t.id]||[]).length>0 && <span style={{ width:6, height:6, borderRadius:"50%", background:t.color, marginLeft:"auto", flexShrink:0 }} />}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div style={{ padding:8, borderTop:`1px solid ${bdr}`, flexShrink:0 }}>
          <div style={{ padding:"6px 8px", fontSize:11, color:txt3, display:"flex", justifyContent:"space-between" }}>
            <span>Total analyses</span>
            <span style={{ color:"#7C3AED", fontWeight:600 }}>{count}</span>
          </div>
          <div onClick={()=>{ setTmpKeys({...keys}); setShowSettings(true); }} style={{ padding:"8px 10px", borderRadius:8, cursor:"pointer", fontSize:12, color:txt2, display:"flex", alignItems:"center", gap:8 }}>
            ⚙️ <span>Settings & Keys</span>
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={s.main}>
        <div style={s.header}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <button onClick={()=>setSideOpen(o=>!o)} style={{ background:"none", border:"none", color:txt2, cursor:"pointer", fontSize:18, padding:"2px 6px", lineHeight:1 }}>☰</button>
            <div>
              <div style={{ fontWeight:700, fontSize:14, color:txt }}>{headerTitle}</div>
              <div style={{ fontSize:10, color:txt3 }}>{headerSub}</div>
            </div>
          </div>
          <div style={{ display:"flex", gap:6, alignItems:"center" }}>
            {page==="tool" && tool && !tool.isApi && Object.entries(MODELS).map(([k,v]) => (
              <div key={k} onClick={()=>setModel(k)} style={{ padding:"4px 12px", borderRadius:20, cursor:"pointer", fontSize:12, fontWeight:model===k?700:400, background:model===k?v.color+"22":"transparent", color:model===k?v.color:txt2, border:`1px solid ${model===k?v.color+"55":bdr}` }}>
                {v.name}
              </div>
            ))}
            {page==="tool" && curMsgs.length>0 && (
              <button onClick={()=>setMsgs(m=>({...m,[tool.id]:[]}))} style={{ padding:"4px 10px", borderRadius:20, border:`1px solid ${bdr}`, background:"transparent", color:txt2, fontSize:12, cursor:"pointer" }}>Clear</button>
            )}
            <button onClick={toggleDark} style={{ padding:"4px 10px", borderRadius:20, border:`1px solid ${bdr}`, background:"transparent", color:txt2, fontSize:12, cursor:"pointer" }}>
              {dark?"☀️":"🌙"}
            </button>
            <div onClick={()=>{ setTmpKeys({...keys}); setShowSettings(true); }} style={{ padding:"4px 10px", borderRadius:20, cursor:"pointer", fontSize:12, color:txt2, border:`1px solid ${bdr}` }}>⚙️</div>
          </div>
        </div>

        {/* Pages */}
        {page==="dashboard"   && <Dashboard onToolSelect={selectTool} count={count} keys={keys} dark={dark} />}
        {page==="gsc"         && <GscDashboard dark={dark} googleKey={keys.google} />}
        {page==="audit"       && <SiteAudit dark={dark} googleKey={keys.google} groqKey={keys.groq} geminiKey={keys.gemini} model={model} />}
        {page==="compare"     && <Compare dark={dark} googleKey={keys.google} />}
        {page==="ranktracker" && <RankTracker dark={dark} keys={keys} model={model} />}
        {page==="calendar"    && <ContentCalendar dark={dark} keys={keys} model={model} />}
        {page==="checklist"   && <SeoChecklist dark={dark} />}
        {page==="report"      && <ReportGenerator dark={dark} keys={keys} model={model} msgs={msgs} />}
        {page==="history"     && <History msgs={msgs} onToolSelect={selectTool} dark={dark} />}

        {/* Bulk */}
        {page==="bulk" && (
          <div style={{ flex:1, overflowY:"auto", padding:24, background:bg }}>
            <div style={{ maxWidth:700, margin:"0 auto" }}>
              <div style={{ fontSize:18, fontWeight:700, color:txt, marginBottom:4 }}>📊 Bulk Keyword Analyzer</div>
              <div style={{ fontSize:13, color:txt2, marginBottom:20 }}>Enter up to 10 keywords (one per line)</div>
              <textarea value={bulkInput} onChange={e=>setBulkInput(e.target.value)}
                placeholder={"digital marketing\nseo tools 2025\nbest keyword research tool"}
                rows={8} style={{ ...s.textarea, width:"100%", marginBottom:12, borderRadius:10 }} />
              <button onClick={runBulkKeywords} disabled={bulkLoading||!bulkInput.trim()}
                style={{ ...s.runBtn(!bulkLoading&&!!bulkInput.trim()), padding:"10px 24px", borderRadius:10, marginBottom:20 }}>
                {bulkLoading?"Analyzing...":"▶ Analyze All"}
              </button>
              {bulkLoading && <div style={{ color:txt3, fontSize:13, marginBottom:12 }}>⏳ Analyzing {bulkResults.length+1} of {bulkInput.split("\n").filter(Boolean).length}...</div>}
              {bulkResults.length>0 && (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {bulkResults.map((r,i) => (
                    <div key={i} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"12px 16px" }}>
                      <div style={{ fontWeight:600, color:"#7C3AED", fontSize:13, marginBottom:6 }}>🔍 {r.keyword}</div>
                      <div style={{ fontSize:12, color:txt2, lineHeight:1.7 }}>{r.result}</div>
                    </div>
                  ))}
                  <button onClick={()=>downloadText(bulkResults.map(r=>`${r.keyword}\n${r.result}`).join("\n\n---\n\n"),"bulk-keywords.txt")}
                    style={{ padding:"8px 20px", borderRadius:8, border:"1px solid #0F766E44", background:"#0F766E11", color:"#0F766E", fontSize:12, cursor:"pointer", alignSelf:"flex-start" }}>
                    ⬇️ Download All
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tool Chat */}
        {page==="tool" && tool && (
          <>
            <div style={s.msgs}>
              {curMsgs.length===0 && (
                <div style={{ margin:"auto", textAlign:"center", color:txt3, padding:40 }}>
                  <div style={{ fontSize:44, marginBottom:14 }}>{tool.icon}</div>
                  <div style={{ fontSize:17, fontWeight:700, color:txt, marginBottom:8 }}>{tool.label}</div>
                  <div style={{ fontSize:13, color:txt2, marginBottom:20 }}>{tool.ph}</div>
                  {tool.cat==="GEO" && <div style={{ fontSize:11, color:"#0F766E", background:"#0F766E11", border:"1px solid #0F766E33", borderRadius:8, padding:"6px 14px", display:"inline-block", marginBottom:16 }}>🌐 2026 Feature</div>}
                  {tool.isApi && <div style={{ fontSize:11, color:"#D97706", background:"#D9770611", border:"1px solid #D9770633", borderRadius:8, padding:"6px 14px", display:"inline-block", marginBottom:16 }}>⚡ Requires Google API Key</div>}
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8, justifyContent:"center" }}>
                    {["digital marketing agency","e-commerce store","SaaS tool","local restaurant"].map(ex => (
                      <div key={ex} onClick={()=>setInput(ex)} style={{ padding:"6px 14px", borderRadius:20, border:`1px solid ${bdr}`, color:txt2, fontSize:12, cursor:"pointer" }}>{ex}</div>
                    ))}
                  </div>
                </div>
              )}
              {curMsgs.map((m,i) => (
                <div key={i} style={{ display:"flex", justifyContent:m.role==="user"?"flex-end":"flex-start" }}>
                  {m.role==="user" ? (
                    <div style={s.uBub}>{m.text}</div>
                  ) : (
                    <div style={{ maxWidth:"88%", display:"flex", flexDirection:"column", gap:4 }}>
                      <div style={s.aBub}><Markdown text={m.text} dark={dark} /></div>
                      <div style={{ display:"flex", gap:6, paddingLeft:4 }}>
                        <button onClick={()=>copyText(m.text,i)} style={{ padding:"3px 10px", borderRadius:6, border:`1px solid ${bdr}`, background:"transparent", color:copied===i?"#0F766E":txt2, fontSize:11, cursor:"pointer" }}>
                          {copied===i?"✅ Copied!":"📋 Copy"}
                        </button>
                        <button onClick={()=>downloadText(m.text,`seo-${tool.id}-${Date.now()}.txt`)} style={{ padding:"3px 10px", borderRadius:6, border:`1px solid ${bdr}`, background:"transparent", color:txt2, fontSize:11, cursor:"pointer" }}>
                          ⬇️ Download
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div style={{ display:"flex", justifyContent:"flex-start" }}>
                  <div style={{ ...s.aBub, color:txt3 }}>{tool.isApi?"⚡ Fetching...":`🤔 Analyzing with ${MODELS[model]?.name}...`}</div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
            <div style={s.inputArea}>
              <div style={{ display:"flex", gap:8 }}>
                <textarea value={input} onChange={e=>setInput(e.target.value)}
                  onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();run();} }}
                  placeholder={tool.ph} rows={2} style={s.textarea} />
                <button onClick={run} disabled={loading||!input.trim()} style={s.runBtn(!loading&&!!input.trim())}>
                  {loading?"...":"Run ▶"}
                </button>
              </div>
              <div style={{ fontSize:11, color:txt3, marginTop:5 }}>Enter to run · Shift+Enter new line · {tool.isApi?"Google API":`Model: ${MODELS[model]?.name}`}</div>
            </div>
          </>
        )}
      </div>

      {/* Settings */}
      {showSettings && (
        <div style={s.overlay} onClick={()=>setShowSettings(false)}>
          <div style={s.modal} onClick={e=>e.stopPropagation()}>
            <div style={{ fontWeight:700, fontSize:17, color:txt }}>⚙️ API Keys</div>
            <div style={{ fontSize:12, color:txt2, marginTop:4 }}>Saved in browser · persist across sessions</div>
            <label style={s.label}>Groq API Key (gsk_...)</label>
            <input type="password" value={tmpKeys.groq} onChange={e=>setTmpKeys(k=>({...k,groq:e.target.value}))} placeholder="gsk_xxxxxxxxxxxx" style={s.inp} />
            <label style={s.label}>Gemini API Key (AIza...)</label>
            <input type="password" value={tmpKeys.gemini} onChange={e=>setTmpKeys(k=>({...k,gemini:e.target.value}))} placeholder="AIzaxxxxxxxxxx" style={s.inp} />
            <label style={s.label}>Google APIs Key — PageSpeed + GSC + Audit</label>
            <input type="password" value={tmpKeys.google} onChange={e=>setTmpKeys(k=>({...k,google:e.target.value}))} placeholder="AIzaxxxxxxxxxx" style={s.inp} />
            <button onClick={saveKeys} style={s.saveBtn}>💾 Save Keys</button>
            <div style={{ fontSize:11, color:txt3, marginTop:10, textAlign:"center" }}>
              Groq: console.groq.com · Gemini: aistudio.google.com · Google: console.cloud.google.com
            </div>
          </div>
        </div>
      )}
    </div>
  );
}