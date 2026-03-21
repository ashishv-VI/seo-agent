import { useState, useEffect, useRef } from "react";
import { TOOLS, CATS, MODELS } from "./tools";
import Dashboard from "./Dashboard";

export default function App() {
  const [tool, setTool]     = useState(null);
  const [input, setInput]   = useState("");
  const [msgs, setMsgs]     = useState({});
  const [loading, setLoading] = useState(false);
  const [model, setModel]   = useState("groq");
  const [cat, setCat]       = useState("All");
  const [sideOpen, setSideOpen] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [count, setCount]   = useState(0);
  const [keys, setKeys]     = useState({ groq:"", gemini:"", google:"" });
  const [tmpKeys, setTmpKeys] = useState({ groq:"", gemini:"", google:"" });
  const [copied, setCopied] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    const saved = localStorage.getItem("seo_keys");
    if (saved) { const k = JSON.parse(saved); setKeys(k); setTmpKeys(k); }
    const savedCount = localStorage.getItem("seo_count");
    if (savedCount) setCount(parseInt(savedCount));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [msgs, loading]);

  const curMsgs = tool ? (msgs[tool.id] || []) : [];
  const filtered = cat === "All" ? TOOLS : TOOLS.filter(t => t.cat === cat);
  const catGroups = [...new Set(filtered.map(t => t.cat))];

  function saveKeys() {
    localStorage.setItem("seo_keys", JSON.stringify(tmpKeys));
    setKeys(tmpKeys);
    setShowSettings(false);
  }

  function copyText(text, id) {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  function addMsg(toolId, msg) {
    setMsgs(m => ({ ...m, [toolId]: [...(m[toolId]||[]), msg] }));
  }

  function selectTool(t) {
    setTool(t);
    setInput("");
  }

  async function runPageSpeed(url) {
    if (!keys.google) { setShowSettings(true); return; }
    addMsg(tool.id, { role:"user", text: url });
    setLoading(true);
    setInput("");
    try {
      const [mob, desk] = await Promise.all([
        fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${keys.google}&strategy=mobile`).then(r=>r.json()),
        fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${keys.google}&strategy=desktop`).then(r=>r.json()),
      ]);
      const score = (d,k) => Math.round((d.lighthouseResult?.categories?.[k]?.score||0)*100);
      const val   = (d,k) => d.lighthouseResult?.audits?.[k]?.displayValue || "N/A";
      const grade = s => s>=90?"✅ Good":s>=50?"⚠️ Needs Work":"❌ Poor";
      const text = `⚡ PAGE SPEED REPORT
━━━━━━━━━━━━━━━━━━━━━━━━
URL: ${url}

📱 MOBILE SCORES
Performance:    ${score(mob,"performance")}/100  ${grade(score(mob,"performance"))}
SEO:            ${score(mob,"seo")}/100  ${grade(score(mob,"seo"))}
Accessibility:  ${score(mob,"accessibility")}/100  ${grade(score(mob,"accessibility"))}
Best Practices: ${score(mob,"best-practices")}/100  ${grade(score(mob,"best-practices"))}

🖥️ DESKTOP SCORES
Performance:    ${score(desk,"performance")}/100  ${grade(score(desk,"performance"))}
SEO:            ${score(desk,"seo")}/100  ${grade(score(desk,"seo"))}
Accessibility:  ${score(desk,"accessibility")}/100  ${grade(score(desk,"accessibility"))}
Best Practices: ${score(desk,"best-practices")}/100  ${grade(score(desk,"best-practices"))}

📊 CORE WEB VITALS (Mobile)
LCP:  ${val(mob,"largest-contentful-paint")}  (target: <2.5s)
TBT:  ${val(mob,"total-blocking-time")}  (target: <100ms)
CLS:  ${val(mob,"cumulative-layout-shift")}  (target: <0.1)
FCP:  ${val(mob,"first-contentful-paint")}
TTFB: ${val(mob,"server-response-time")}

💡 TOP RECOMMENDATIONS
${(mob.lighthouseResult?.audits?.["render-blocking-resources"]?.score||1)<1?"• Fix render-blocking resources\n":""}${(mob.lighthouseResult?.audits?.["uses-optimized-images"]?.score||1)<1?"• Optimize images\n":""}${(mob.lighthouseResult?.audits?.["unused-javascript"]?.score||1)<1?"• Remove unused JavaScript\n":""}${(mob.lighthouseResult?.audits?.["unused-css-rules"]?.score||1)<1?"• Remove unused CSS\n":""}${(mob.lighthouseResult?.audits?.["uses-text-compression"]?.score||1)<1?"• Enable text compression\n":""}`;
      addMsg(tool.id, { role:"assistant", text });
      const nc = count+1; setCount(nc); localStorage.setItem("seo_count", nc);
    } catch(e) { addMsg(tool.id, { role:"assistant", text:"Error: "+e.message }); }
    setLoading(false);
  }

  async function run() {
    const q = input.trim();
    if (!q || loading || !tool) return;
    if (tool.isApi && tool.apiType==="pagespeed") { runPageSpeed(q); return; }
    const key = model==="groq" ? keys.groq : keys.gemini;
    if (!key) { setShowSettings(true); return; }
    addMsg(tool.id, { role:"user", text: q });
    setInput("");
    setLoading(true);
    try {
      let text = "";
      if (model==="groq") {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method:"POST",
          headers:{ "Content-Type":"application/json", "Authorization":`Bearer ${key}` },
          body: JSON.stringify({ model:"llama-3.1-8b-instant", max_tokens:2000,
            messages:[{ role:"user", content: tool.prompt(q) }] })
        });
        const d = await res.json();
        text = d.choices?.[0]?.message?.content || JSON.stringify(d);
      } else {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          body: JSON.stringify({ contents:[{ parts:[{ text: tool.prompt(q) }] }] })
        });
        const d = await res.json();
        text = d.candidates?.[0]?.content?.parts?.[0]?.text || JSON.stringify(d);
      }
      addMsg(tool.id, { role:"assistant", text });
      const nc = count+1; setCount(nc); localStorage.setItem("seo_count", nc);
    } catch(e) { addMsg(tool.id, { role:"assistant", text:"Error: "+e.message }); }
    setLoading(false);
  }

  const s = {
    app:    { fontFamily:"Inter,system-ui,sans-serif", display:"flex", height:"100vh", background:"#0a0a0a", color:"#e8e8e8", overflow:"hidden" },
    side:   { width:sideOpen?240:0, minWidth:sideOpen?240:0, background:"#111", borderRight:"1px solid #222", display:"flex", flexDirection:"column", transition:"all 0.2s", overflow:"hidden", flexShrink:0 },
    logo:   { padding:"14px 16px", borderBottom:"1px solid #222", display:"flex", alignItems:"center", gap:10, flexShrink:0 },
    badge:  { width:32, height:32, borderRadius:8, background:"#7C3AED", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:14, color:"#fff", flexShrink:0 },
    nav:    { flex:1, overflowY:"auto", padding:"6px" },
    catRow: { display:"flex", flexWrap:"wrap", gap:4, padding:"8px 4px 4px" },
    catBtn: a => ({ padding:"3px 9px", borderRadius:20, fontSize:11, fontWeight:a?600:400, cursor:"pointer", border:"1px solid", background:a?"#7C3AED22":"transparent", color:a?"#A78BFA":"#555", borderColor:a?"#7C3AED44":"#222" }),
    secLabel: { fontSize:10, color:"#333", padding:"8px 8px 3px", textTransform:"uppercase", letterSpacing:"0.08em" },
    navItem: (a,color) => ({ display:"flex", alignItems:"center", gap:8, padding:"7px 10px", borderRadius:8, marginBottom:1, cursor:"pointer", fontSize:12, fontWeight:a?600:400, background:a?color+"22":"transparent", color:a?color:"#666", border:a?`1px solid ${color}33`:"1px solid transparent", whiteSpace:"nowrap" }),
    main:   { flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0 },
    header: { padding:"10px 16px", borderBottom:"1px solid #222", background:"#111", display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, flexShrink:0 },
    msgs:   { flex:1, overflowY:"auto", padding:"20px", display:"flex", flexDirection:"column", gap:14 },
    uBub:   { alignSelf:"flex-end", background:"#7C3AED", color:"#fff", padding:"10px 14px", borderRadius:"12px 12px 4px 12px", maxWidth:"75%", fontSize:13, lineHeight:1.6, whiteSpace:"pre-wrap" },
    aBub:   { alignSelf:"flex-start", background:"#1a1a1a", border:"1px solid #2a2a2a", color:"#e8e8e8", padding:"12px 14px", borderRadius:"4px 12px 12px 12px", maxWidth:"88%", fontSize:13, lineHeight:1.75, whiteSpace:"pre-wrap" },
    inputArea: { padding:"12px 16px", borderTop:"1px solid #222", background:"#111", flexShrink:0 },
    textarea:  { flex:1, padding:"10px 14px", borderRadius:10, border:"1px solid #2a2a2a", background:"#1a1a1a", color:"#e8e8e8", fontSize:13, resize:"none", outline:"none", fontFamily:"inherit", lineHeight:1.5 },
    runBtn: ok => ({ padding:"0 18px", borderRadius:10, border:"none", background:ok?"#7C3AED":"#222", color:ok?"#fff":"#444", fontWeight:600, fontSize:13, cursor:ok?"pointer":"not-allowed", flexShrink:0, minWidth:64 }),
    overlay:{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 },
    modal:  { background:"#1a1a1a", border:"1px solid #333", borderRadius:16, padding:28, width:440, maxWidth:"92vw" },
    label:  { fontSize:12, color:"#888", marginBottom:4, display:"block", marginTop:12 },
    inp:    { width:"100%", padding:"9px 12px", borderRadius:8, border:"1px solid #333", background:"#111", color:"#e8e8e8", fontSize:13, outline:"none", boxSizing:"border-box" },
    saveBtn:{ width:"100%", padding:11, borderRadius:8, border:"none", background:"#7C3AED", color:"#fff", fontWeight:600, fontSize:14, cursor:"pointer", marginTop:16 },
  };

  return (
    <div style={s.app}>
      {/* Sidebar */}
      <div style={s.side}>
        <div style={s.logo}>
          <div style={s.badge}>S</div>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:"#fff" }}>SEO Agent</div>
            <div style={{ fontSize:10, color:"#444" }}>v4.0 · {TOOLS.length} tools</div>
          </div>
        </div>
        <div style={s.nav}>
          {/* Dashboard link */}
          <div style={{ padding:"6px 4px 4px" }}>
            <div onClick={()=>setTool(null)} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 10px", borderRadius:8, cursor:"pointer", fontSize:12, fontWeight:!tool?600:400, background:!tool?"#7C3AED22":"transparent", color:!tool?"#A78BFA":"#666", border:!tool?"1px solid #7C3AED33":"1px solid transparent" }}>
              🏠 <span>Dashboard</span>
            </div>
          </div>
          <div style={s.catRow}>
            {CATS.map(c => <div key={c} style={s.catBtn(cat===c)} onClick={()=>setCat(c)}>{c}</div>)}
          </div>
          {catGroups.map(c => (
            <div key={c}>
              <div style={s.secLabel}>{c}</div>
              {filtered.filter(t=>t.cat===c).map(t => (
                <div key={t.id} style={s.navItem(tool?.id===t.id, t.color)} onClick={()=>selectTool(t)}>
                  <span style={{ fontSize:14, flexShrink:0 }}>{t.icon}</span>
                  <span style={{ overflow:"hidden", textOverflow:"ellipsis" }}>{t.label}</span>
                  {t.isApi && <span style={{ fontSize:9, background:"#0F766E22", color:"#0F766E", padding:"1px 5px", borderRadius:4, marginLeft:"auto", flexShrink:0 }}>API</span>}
                  {(msgs[t.id]||[]).length > 0 && <span style={{ width:6, height:6, borderRadius:"50%", background:t.color, marginLeft:"auto", flexShrink:0 }} />}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ padding:8, borderTop:"1px solid #222", flexShrink:0 }}>
          <div style={{ padding:"6px 8px", fontSize:11, color:"#444", display:"flex", justifyContent:"space-between" }}>
            <span>Total analyses</span>
            <span style={{ color:"#7C3AED", fontWeight:600 }}>{count}</span>
          </div>
          <div onClick={()=>{ setTmpKeys({...keys}); setShowSettings(true); }} style={{ padding:"8px 10px", borderRadius:8, cursor:"pointer", fontSize:12, color:"#555", display:"flex", alignItems:"center", gap:8 }}>
            ⚙️ <span>Settings & Keys</span>
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={s.main}>
        {/* Header */}
        <div style={s.header}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <button onClick={()=>setSideOpen(o=>!o)} style={{ background:"none", border:"none", color:"#555", cursor:"pointer", fontSize:18, padding:"2px 6px", lineHeight:1 }}>☰</button>
            <div>
              <div style={{ fontWeight:700, fontSize:14, color:"#fff" }}>
                {tool ? `${tool.icon} ${tool.label}` : "🏠 Dashboard"}
              </div>
              <div style={{ fontSize:10, color:"#444" }}>
                {tool ? `${tool.cat} · ${curMsgs.filter(m=>m.role==="user").length} queries` : `${TOOLS.length} tools · ${count} analyses`}
              </div>
            </div>
          </div>
          <div style={{ display:"flex", gap:6, alignItems:"center" }}>
            {tool && !tool.isApi && Object.entries(MODELS).map(([k,v]) => (
              <div key={k} onClick={()=>setModel(k)} style={{ padding:"4px 12px", borderRadius:20, cursor:"pointer", fontSize:12, fontWeight:model===k?700:400, background:model===k?v.color+"22":"transparent", color:model===k?v.color:"#444", border:`1px solid ${model===k?v.color+"55":"#222"}` }}>
                {v.name}
              </div>
            ))}
            {tool && curMsgs.length > 0 && (
              <button onClick={()=>setMsgs(m=>({...m,[tool.id]:[]}))} style={{ padding:"4px 10px", borderRadius:20, border:"1px solid #222", background:"transparent", color:"#555", fontSize:12, cursor:"pointer" }}>
                Clear
              </button>
            )}
            <div onClick={()=>{ setTmpKeys({...keys}); setShowSettings(true); }} style={{ padding:"4px 10px", borderRadius:20, cursor:"pointer", fontSize:12, color:"#444", border:"1px solid #222" }}>⚙️</div>
          </div>
        </div>

        {/* Dashboard or Tool */}
        {!tool ? (
          <Dashboard onToolSelect={selectTool} count={count} keys={keys} />
        ) : (
          <>
            <div style={s.msgs}>
              {curMsgs.length === 0 && (
                <div style={{ margin:"auto", textAlign:"center", color:"#333", padding:40 }}>
                  <div style={{ fontSize:44, marginBottom:14 }}>{tool.icon}</div>
                  <div style={{ fontSize:17, fontWeight:700, color:"#ccc", marginBottom:8 }}>{tool.label}</div>
                  <div style={{ fontSize:13, color:"#555", marginBottom:20 }}>{tool.ph}</div>
                  {tool.cat==="GEO" && <div style={{ fontSize:11, color:"#0F766E", background:"#0F766E11", border:"1px solid #0F766E33", borderRadius:8, padding:"6px 14px", display:"inline-block", marginBottom:16 }}>🌐 2026 Feature — AI Search Visibility</div>}
                  {tool.isApi && <div style={{ fontSize:11, color:"#D97706", background:"#D9770611", border:"1px solid #D9770633", borderRadius:8, padding:"6px 14px", display:"inline-block", marginBottom:16 }}>⚡ Requires Google API Key in Settings</div>}
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8, justifyContent:"center" }}>
                    {["digital marketing agency","e-commerce store","SaaS productivity tool","local restaurant"].map(ex => (
                      <div key={ex} onClick={()=>setInput(ex)} style={{ padding:"6px 14px", borderRadius:20, border:"1px solid #222", color:"#555", fontSize:12, cursor:"pointer" }}>{ex}</div>
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
                      <div style={s.aBub}>{m.text}</div>
                      <div style={{ display:"flex", gap:6, paddingLeft:4 }}>
                        <button onClick={()=>copyText(m.text,i)} style={{ padding:"3px 10px", borderRadius:6, border:"1px solid #222", background:"transparent", color:copied===i?"#0F766E":"#555", fontSize:11, cursor:"pointer" }}>
                          {copied===i?"✅ Copied!":"📋 Copy"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div style={{ display:"flex", justifyContent:"flex-start" }}>
                  <div style={{ ...s.aBub, color:"#444" }}>
                    {tool.isApi?"⚡ Fetching data...":`🤔 Analyzing with ${MODELS[model]?.name}...`}
                  </div>
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
              <div style={{ fontSize:11, color:"#333", marginTop:5 }}>
                Enter to run · Shift+Enter new line · {tool.isApi?"Google API":`Model: ${MODELS[model]?.name}`}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Settings */}
      {showSettings && (
        <div style={s.overlay} onClick={()=>setShowSettings(false)}>
          <div style={s.modal} onClick={e=>e.stopPropagation()}>
            <div style={{ fontWeight:700, fontSize:17, color:"#fff" }}>⚙️ API Keys</div>
            <div style={{ fontSize:12, color:"#555", marginTop:4 }}>Saved in browser — persist across sessions</div>
            <label style={s.label}>Groq API Key (gsk_...)</label>
            <input type="password" value={tmpKeys.groq} onChange={e=>setTmpKeys(k=>({...k,groq:e.target.value}))} placeholder="gsk_xxxxxxxxxxxx" style={s.inp} />
            <label style={s.label}>Gemini API Key (AIza...)</label>
            <input type="password" value={tmpKeys.gemini} onChange={e=>setTmpKeys(k=>({...k,gemini:e.target.value}))} placeholder="AIzaxxxxxxxxxx" style={s.inp} />
            <label style={s.label}>Google APIs Key — PageSpeed</label>
            <input type="password" value={tmpKeys.google} onChange={e=>setTmpKeys(k=>({...k,google:e.target.value}))} placeholder="AIzaxxxxxxxxxx" style={s.inp} />
            <button onClick={saveKeys} style={s.saveBtn}>💾 Save Keys</button>
            <div style={{ fontSize:11, color:"#333", marginTop:10, textAlign:"center" }}>
              Groq: console.groq.com · Gemini: aistudio.google.com
            </div>
          </div>
        </div>
      )}
    </div>
  );
}