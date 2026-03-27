import { useState, useEffect } from "react";
import { TOOLS, CATS } from "./tools";

const CAT_ICONS = {
  Content:"✍️", Technical:"⚙️", Research:"🔍",
  GEO:"🌐", Local:"📍", Backlinks:"🔗", Tools:"🛠️"
};

const CAT_COLORS = {
  Content:"#443DCB", Technical:"#047857", Research:"#0891B2",
  GEO:"#0F766E", Local:"#B45309", Backlinks:"#1E40AF", Tools:"#9333EA"
};

const QUICK_PAGES = [
  { id:"promptcontent",  icon:"⚡", label:"Prompt-to-Content",  color:"#F59E0B", desc:"Topic → Full SEO page" },
  { id:"competitorgap",  icon:"🕵️", label:"Competitor Gap",     color:"#443DCB", desc:"Find what they have, you don't" },
  { id:"serpsimulator",  icon:"🔎", label:"SERP Simulator",     color:"#EA4335", desc:"Google SERP preview" },
  { id:"metapreview",    icon:"🏷️", label:"Meta Previewer",     color:"#D97706", desc:"Live social preview" },
  { id:"readability",    icon:"📖", label:"Readability Checker", color:"#059669", desc:"Flesch score + fixes" },
  { id:"backlink",       icon:"🔗", label:"Backlink Analyzer",  color:"#1E40AF", desc:"DA + opportunities" },
  { id:"sitemap",        icon:"🗺️", label:"Sitemap Generator",  color:"#D97706", desc:"XML sitemap builder" },
  { id:"aimode",         icon:"🤖", label:"AI Mode Optimizer",  color:"#4285F4", desc:"Google AI Mode & Overview" },
  { id:"aeo",            icon:"🎯", label:"AEO Optimizer",      color:"#443DCB", desc:"Answer engine optimization" },
  { id:"gsc",            icon:"📈", label:"Search Console",     color:"#059669", desc:"GSC clicks & impressions" },
  { id:"audit",          icon:"🏥", label:"Site Audit",         color:"#DC2626", desc:"Technical SEO check" },
  { id:"report",         icon:"📄", label:"Report Generator",   color:"#9333EA", desc:"PDF client reports" },
];

export default function Dashboard({ onToolSelect, count, keys, dark, onPageSelect }) {
  const [activeCat, setActiveCat] = useState("All");
  const [recentTools, setRecentTools] = useState([]);
  const [search, setSearch] = useState("");

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const txt3 = dark ? "#333"    : "#ccc";

  useEffect(() => {
    try {
      const saved = localStorage.getItem("seo_recent_tools");
      if (saved) setRecentTools(JSON.parse(saved).slice(0, 6));
    } catch(e) {}
  }, []);

  function handleToolSelect(t) {
    const updated = [t, ...recentTools.filter(r => r.id !== t.id)].slice(0, 6);
    setRecentTools(updated);
    localStorage.setItem("seo_recent_tools", JSON.stringify(updated));
    onToolSelect(t);
  }

  const hasGroq       = !!keys?.groq;
  const hasGemini     = !!keys?.gemini;
  const hasGoogle     = !!keys?.google;
  const hasOpenRouter = !!keys?.openrouter;
  const apiCount      = [hasGroq, hasGemini, hasGoogle, hasOpenRouter].filter(Boolean).length;

  const filtered = TOOLS.filter(t => {
    const matchCat    = activeCat === "All" || t.cat === activeCat;
    const matchSearch = !search || t.label.toLowerCase().includes(search.toLowerCase()) || t.cat.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const catGroups = CATS.filter(c => c !== "All").map(c => ({
    name: c, color: CAT_COLORS[c], icon: CAT_ICONS[c],
    count: TOOLS.filter(t => t.cat === c).length,
  }));

  const apis = [
    { name:"Groq",       desc:"Llama 3.1 — Fast",         ok:hasGroq,       color:"#F97316" },
    { name:"Gemini",     desc:"Google AI — Smart",         ok:hasGemini,     color:"#2563EB" },
    { name:"Google API", desc:"PageSpeed + GSC + GA4",     ok:hasGoogle,     color:"#059669" },
    { name:"OpenRouter", desc:"DeepSeek + Mistral — Free", ok:hasOpenRouter, color:"#A855F7" },
  ];

  return (
    <div style={{ flex:1, overflowY:"auto", background:bg, fontFamily:"Inter, system-ui, sans-serif" }}>

      {/* ── Hero Banner ── */}
      <div style={{ background: dark?"linear-gradient(135deg,#0d0d1a,#0a0a0a)":"linear-gradient(135deg,#f0eeff,#f5f5f0)", borderBottom:`1px solid ${bdr}`, padding:"32px 28px 24px" }}>
        <div style={{ maxWidth:1100, margin:"0 auto" }}>
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:16 }}>
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                <div style={{ width:36, height:36, borderRadius:10, background:"#443DCB", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>🚀</div>
                <div>
                  <div style={{ fontSize:22, fontWeight:800, color:txt, letterSpacing:"-0.03em" }}>SEO Agent</div>
                  <div style={{ fontSize:11, color:txt2, marginTop:1 }}>v16.0 · Your complete SEO Operating System</div>
                </div>
              </div>
              <div style={{ fontSize:13, color:txt2, maxWidth:480 }}>
                {TOOLS.length} AI-powered tools · {CATS.length-1} categories · Real Google APIs · Multi-model AI
              </div>
            </div>
            <div style={{ position:"relative", minWidth:240 }}>
              <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:14, color:txt2 }}>🔍</span>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Search tools..."
                style={{ paddingLeft:36, paddingRight:14, paddingTop:9, paddingBottom:9, borderRadius:10, border:`1px solid ${bdr}`, background:bg2, color:txt, fontSize:13, outline:"none", width:"100%", boxSizing:"border-box" }} />
            </div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginTop:24 }}>
            {[
              { label:"Total Tools",    value:TOOLS.length,    color:"#443DCB", icon:"🛠️" },
              { label:"Analyses Done",  value:count,           color:"#059669", icon:"📊" },
              { label:"Categories",     value:CATS.length-1,   color:"#0891B2", icon:"📂" },
              { label:"APIs Connected", value:`${apiCount}/4`, color:apiCount>=3?"#059669":apiCount>=2?"#D97706":"#DC2626", icon:"🔑" },
            ].map(s => (
              <div key={s.label} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ width:40, height:40, borderRadius:10, background:s.color+"18", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>{s.icon}</div>
                <div>
                  <div style={{ fontSize:22, fontWeight:800, color:s.color, lineHeight:1 }}>{s.value}</div>
                  <div style={{ fontSize:11, color:txt2, marginTop:3 }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth:1100, margin:"0 auto", padding:"24px 28px" }}>

        {/* ── API Status ── */}
        <div style={{ marginBottom:28 }}>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:10 }}>API Status</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
            {apis.map(a => (
              <div key={a.name} style={{ background:bg2, border:`1px solid ${a.ok?a.color+"33":bdr}`, borderRadius:10, padding:"12px 14px", display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:8, height:8, borderRadius:"50%", background:a.ok?a.color:"#444", flexShrink:0, boxShadow:a.ok?`0 0 6px ${a.color}66`:"none" }} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:a.ok?txt:txt2 }}>{a.name}</div>
                  <div style={{ fontSize:10, color:a.ok?a.color:txt3, marginTop:1 }}>{a.ok?"Connected":a.desc}</div>
                </div>
                {a.ok && <span style={{ fontSize:14 }}>✅</span>}
              </div>
            ))}
          </div>
        </div>

        {/* ── Quick Access ── */}
        <div style={{ marginBottom:28 }}>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:10 }}>Quick Access</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
            {QUICK_PAGES.map(p => (
              <div key={p.id} onClick={()=>onPageSelect?.(p.id)}
                style={{ background:bg2, border:`1px solid ${p.color}22`, borderRadius:10, padding:"14px 16px", cursor:"pointer", display:"flex", alignItems:"center", gap:12, transition:"all 0.15s" }}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=p.color+"55";e.currentTarget.style.background=p.color+"0a"}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=p.color+"22";e.currentTarget.style.background=bg2}}>
                <div style={{ width:36, height:36, borderRadius:8, background:p.color+"18", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>{p.icon}</div>
                <div>
                  <div style={{ fontSize:12, fontWeight:600, color:txt }}>{p.label}</div>
                  <div style={{ fontSize:10, color:txt2, marginTop:1 }}>{p.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Recently Used ── */}
        {recentTools.length > 0 && (
          <div style={{ marginBottom:28 }}>
            <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:10 }}>Recently Used</div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {recentTools.map(t => (
                <div key={t.id} onClick={()=>handleToolSelect(t)}
                  style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 14px", borderRadius:20, border:`1px solid ${t.color}33`, background:bg2, cursor:"pointer", fontSize:12, color:txt }}
                  onMouseEnter={e=>{e.currentTarget.style.background=t.color+"15";e.currentTarget.style.borderColor=t.color+"55"}}
                  onMouseLeave={e=>{e.currentTarget.style.background=bg2;e.currentTarget.style.borderColor=t.color+"33"}}>
                  <span style={{ fontSize:14 }}>{t.icon}</span>
                  <span style={{ fontWeight:500 }}>{t.label}</span>
                  <span style={{ fontSize:10, color:t.color, background:t.color+"22", padding:"1px 6px", borderRadius:6 }}>{t.cat}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Category Filter ── */}
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:10 }}>
            {search ? `Search Results (${filtered.length})` : "All Tools"}
          </div>
          {!search && (
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:16 }}>
              {["All", ...CATS.filter(c=>c!=="All")].map(c => {
                const active = activeCat === c;
                const color  = c==="All" ? "#443DCB" : CAT_COLORS[c];
                return (
                  <div key={c} onClick={()=>setActiveCat(c)}
                    style={{ padding:"5px 14px", borderRadius:20, fontSize:12, cursor:"pointer", fontWeight:active?700:400, background:active?color+"22":"transparent", color:active?color:txt2, border:`1px solid ${active?color+"44":bdr}` }}>
                    {c==="All"?"All Tools":`${CAT_ICONS[c]} ${c}`}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Tools Grid ── */}
        {!search && activeCat==="All" ? (
          CATS.filter(c=>c!=="All").map(cat => (
            <div key={cat} style={{ marginBottom:24 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                <span style={{ fontSize:14 }}>{CAT_ICONS[cat]}</span>
                <span style={{ fontSize:12, fontWeight:700, color:CAT_COLORS[cat], textTransform:"uppercase", letterSpacing:"0.06em" }}>{cat}</span>
                <span style={{ fontSize:10, color:txt3, background:bg3, padding:"1px 8px", borderRadius:10 }}>{TOOLS.filter(t=>t.cat===cat).length} tools</span>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))", gap:8 }}>
                {TOOLS.filter(t=>t.cat===cat).map(t => (
                  <ToolCard key={t.id} t={t} dark={dark} bg2={bg2} bdr={bdr} txt={txt} txt2={txt2} onClick={()=>handleToolSelect(t)} />
                ))}
              </div>
            </div>
          ))
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))", gap:8 }}>
            {filtered.map(t => (
              <ToolCard key={t.id} t={t} dark={dark} bg2={bg2} bdr={bdr} txt={txt} txt2={txt2} onClick={()=>handleToolSelect(t)} />
            ))}
          </div>
        )}

        {filtered.length === 0 && (
          <div style={{ textAlign:"center", padding:40, color:txt2 }}>
            <div style={{ fontSize:32, marginBottom:8 }}>🔍</div>
            <div>No tools found for "{search}"</div>
          </div>
        )}
      </div>
    </div>
  );
}

function ToolCard({ t, dark, bg2, bdr, txt, txt2, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div onClick={onClick}
      onMouseEnter={()=>setHovered(true)}
      onMouseLeave={()=>setHovered(false)}
      style={{ background:hovered?t.color+"0f":bg2, border:`1px solid ${hovered?t.color+"55":bdr}`, borderRadius:10, padding:"12px 14px", cursor:"pointer", transition:"all 0.15s", display:"flex", flexDirection:"column", gap:6 }}>
      <div style={{ fontSize:20 }}>{t.icon}</div>
      <div style={{ fontSize:12, fontWeight:600, color:txt, lineHeight:1.3 }}>{t.label}</div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <span style={{ fontSize:10, color:t.color, background:t.color+"18", padding:"1px 6px", borderRadius:4, fontWeight:500 }}>{t.cat}</span>
        {t.isApi && <span style={{ fontSize:9, color:"#0F766E", background:"#0F766E18", padding:"1px 5px", borderRadius:4 }}>API</span>}
      </div>
    </div>
  );
}