import { useState } from "react";

const CHECKLIST = [
  {
    cat: "Technical SEO", color: "#DC2626", items: [
      { id:"t1", text:"HTTPS enabled (SSL certificate active)", priority:"Critical" },
      { id:"t2", text:"XML Sitemap created and submitted to GSC", priority:"Critical" },
      { id:"t3", text:"Robots.txt properly configured", priority:"Critical" },
      { id:"t4", text:"No broken links (404 errors)", priority:"High" },
      { id:"t5", text:"Canonical tags on all pages", priority:"High" },
      { id:"t6", text:"Page speed score 90+ (mobile)", priority:"High" },
      { id:"t7", text:"Core Web Vitals passing (LCP, FID, CLS)", priority:"High" },
      { id:"t8", text:"Mobile-friendly / responsive design", priority:"Critical" },
      { id:"t9", text:"Schema markup implemented", priority:"Medium" },
      { id:"t10", text:"No duplicate content issues", priority:"High" },
      { id:"t11", text:"Hreflang tags (if multilingual)", priority:"Medium" },
      { id:"t12", text:"301 redirects for old/moved pages", priority:"High" },
    ]
  },
  {
    cat: "On-Page SEO", color: "#7C3AED", items: [
      { id:"o1", text:"Unique title tags on every page (50-60 chars)", priority:"Critical" },
      { id:"o2", text:"Meta descriptions on all pages (150-160 chars)", priority:"Critical" },
      { id:"o3", text:"One H1 tag per page with target keyword", priority:"Critical" },
      { id:"o4", text:"H2/H3 heading structure logical and keyword-rich", priority:"High" },
      { id:"o5", text:"Target keyword in first 100 words", priority:"High" },
      { id:"o6", text:"Images have descriptive alt text", priority:"High" },
      { id:"o7", text:"Internal links to relevant pages", priority:"High" },
      { id:"o8", text:"External links to authoritative sources", priority:"Medium" },
      { id:"o9", text:"URL slugs are short and keyword-focused", priority:"High" },
      { id:"o10", text:"Content length matches search intent (1000+ for blogs)", priority:"Medium" },
      { id:"o11", text:"Keyword density 1-2% (not stuffed)", priority:"Medium" },
      { id:"o12", text:"FAQ section added where relevant", priority:"Medium" },
    ]
  },
  {
    cat: "Content Quality", color: "#059669", items: [
      { id:"c1", text:"Content addresses search intent fully", priority:"Critical" },
      { id:"c2", text:"E-E-A-T signals present (author bio, sources)", priority:"High" },
      { id:"c3", text:"Content updated in last 12 months", priority:"High" },
      { id:"c4", text:"No thin content pages (< 300 words)", priority:"High" },
      { id:"c5", text:"Original research or unique value added", priority:"Medium" },
      { id:"c6", text:"Grammar and spelling checked", priority:"High" },
      { id:"c7", text:"Readability score good (Flesch-Kincaid 60+)", priority:"Medium" },
      { id:"c8", text:"Content cluster / topic authority built", priority:"Medium" },
    ]
  },
  {
    cat: "Local SEO", color: "#B45309", items: [
      { id:"l1", text:"Google Business Profile claimed and verified", priority:"Critical" },
      { id:"l2", text:"NAP (Name, Address, Phone) consistent everywhere", priority:"Critical" },
      { id:"l3", text:"Listed in top 20 local directories", priority:"High" },
      { id:"l4", text:"Reviews strategy in place (Google, Yelp)", priority:"High" },
      { id:"l5", text:"Local schema markup added", priority:"Medium" },
      { id:"l6", text:"Location pages created for each service area", priority:"Medium" },
    ]
  },
  {
    cat: "Backlinks", color: "#1E40AF", items: [
      { id:"b1", text:"No toxic/spammy backlinks", priority:"High" },
      { id:"b2", text:"Disavow file submitted if needed", priority:"Medium" },
      { id:"b3", text:"Active link building strategy running", priority:"High" },
      { id:"b4", text:"Guest posting on relevant sites", priority:"Medium" },
      { id:"b5", text:"Brand mentions monitored and converted to links", priority:"Medium" },
    ]
  },
  {
    cat: "Analytics & Tracking", color: "#0891B2", items: [
      { id:"a1", text:"Google Analytics 4 installed and tracking", priority:"Critical" },
      { id:"a2", text:"Google Search Console verified and active", priority:"Critical" },
      { id:"a3", text:"Goal / conversion tracking configured in GA4", priority:"High" },
      { id:"a4", text:"Core Web Vitals monitored monthly", priority:"High" },
      { id:"a5", text:"Monthly SEO reports generated", priority:"Medium" },
      { id:"a6", text:"Rank tracking set up for target keywords", priority:"High" },
    ]
  },
  {
    cat: "GEO — AI Search", color: "#0F766E", items: [
      { id:"g1", text:"Content optimized for AI citations (ChatGPT, Gemini)", priority:"High" },
      { id:"g2", text:"Structured answer format used (lists, tables)", priority:"High" },
      { id:"g3", text:"Entity/brand mentions on authoritative sites", priority:"High" },
      { id:"g4", text:"FAQ content matches AI query patterns", priority:"Medium" },
      { id:"g5", text:"Knowledge Graph entity established", priority:"Medium" },
    ]
  },
];

const PRIORITY_COLORS = { Critical:"#DC2626", High:"#D97706", Medium:"#059669" };

export default function SeoChecklist({ dark }) {
  const [checked, setChecked]   = useState({});
  const [filter, setFilter]     = useState("All");
  const [catFilter, setCatFilter] = useState("All");
  const [search, setSearch]     = useState("");

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const txt3 = dark ? "#444"    : "#bbb";

  const allItems = CHECKLIST.flatMap(c => c.items.map(i => ({ ...i, cat: c.cat, catColor: c.color })));
  const totalItems   = allItems.length;
  const doneItems    = Object.values(checked).filter(Boolean).length;
  const criticalDone = allItems.filter(i => i.priority==="Critical" && checked[i.id]).length;
  const criticalTotal= allItems.filter(i => i.priority==="Critical").length;
  const score = Math.round((doneItems / totalItems) * 100);

  function toggleAll(cat, items) {
    const allDone = items.every(i => checked[i.id]);
    const updates = {};
    items.forEach(i => { updates[i.id] = !allDone; });
    setChecked(c => ({ ...c, ...updates }));
  }

  function downloadChecklist() {
    const lines = ["SEO CHECKLIST AUDIT", "=".repeat(50), `Score: ${score}% (${doneItems}/${totalItems})`, `Date: ${new Date().toLocaleDateString()}`, ""];
    CHECKLIST.forEach(cat => {
      lines.push(`\n${cat.cat.toUpperCase()}`);
      lines.push("-".repeat(30));
      cat.items.forEach(item => {
        lines.push(`[${checked[item.id]?"✅":"❌"}] [${item.priority}] ${item.text}`);
      });
    });
    const blob = new Blob([lines.join("\n")], { type:"text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=`seo-checklist-${Date.now()}.txt`; a.click();
    URL.revokeObjectURL(url);
  }

  const scoreColor = score>=80?"#059669":score>=50?"#D97706":"#DC2626";

  const filteredCats = CHECKLIST.map(cat => ({
    ...cat,
    items: cat.items.filter(item => {
      const matchSearch = !search || item.text.toLowerCase().includes(search.toLowerCase());
      const matchFilter = filter==="All" || (filter==="Done"&&checked[item.id]) || (filter==="Pending"&&!checked[item.id]);
      const matchPriority = catFilter==="All" || item.priority===catFilter;
      return matchSearch && matchFilter && matchPriority;
    })
  })).filter(cat => cat.items.length > 0);

  return (
    <div style={{ flex:1, overflowY:"auto", padding:24, background:bg }}>
      <div style={{ maxWidth:800, margin:"0 auto" }}>
        <div style={{ fontSize:18, fontWeight:700, color:txt, marginBottom:4 }}>✅ SEO Checklist</div>
        <div style={{ fontSize:13, color:txt2, marginBottom:20 }}>Complete SEO audit checklist — {totalItems} items across 7 categories</div>

        {/* Score Card */}
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:20 }}>
          <div style={{ display:"grid", gridTemplateColumns:"auto 1fr", gap:20, alignItems:"center" }}>
            <div style={{ width:80, height:80, borderRadius:"50%", border:`5px solid ${scoreColor}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <div>
                <div style={{ fontSize:22, fontWeight:800, color:scoreColor, textAlign:"center" }}>{score}%</div>
                <div style={{ fontSize:9, color:txt2, textAlign:"center" }}>Score</div>
              </div>
            </div>
            <div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:12 }}>
                {[
                  { label:"Total", value:totalItems, color:"#7C3AED" },
                  { label:"Done", value:doneItems, color:"#059669" },
                  { label:"Pending", value:totalItems-doneItems, color:"#D97706" },
                  { label:"Critical Done", value:`${criticalDone}/${criticalTotal}`, color:"#DC2626" },
                ].map(s => (
                  <div key={s.label} style={{ textAlign:"center" }}>
                    <div style={{ fontSize:18, fontWeight:700, color:s.color }}>{s.value}</div>
                    <div style={{ fontSize:10, color:txt2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ background:bg3, borderRadius:20, height:8, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${score}%`, background:scoreColor, borderRadius:20, transition:"width 0.3s" }} />
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search checklist..."
            style={{ flex:1, minWidth:150, padding:"7px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:12, outline:"none" }} />
          {["All","Done","Pending"].map(f => (
            <button key={f} onClick={()=>setFilter(f)} style={{ padding:"6px 12px", borderRadius:20, border:"1px solid", fontSize:11, cursor:"pointer", fontWeight:filter===f?600:400, background:filter===f?"#7C3AED22":"transparent", color:filter===f?"#A78BFA":txt2, borderColor:filter===f?"#7C3AED44":bdr }}>
              {f}
            </button>
          ))}
          {["All","Critical","High","Medium"].map(p => (
            <button key={p} onClick={()=>setCatFilter(p)} style={{ padding:"6px 12px", borderRadius:20, border:"1px solid", fontSize:11, cursor:"pointer", fontWeight:catFilter===p?600:400, background:catFilter===p?`${PRIORITY_COLORS[p]||"#7C3AED"}22`:"transparent", color:catFilter===p?PRIORITY_COLORS[p]||"#A78BFA":txt2, borderColor:catFilter===p?`${PRIORITY_COLORS[p]||"#7C3AED"}44`:bdr }}>
              {p}
            </button>
          ))}
          <button onClick={downloadChecklist} style={{ padding:"6px 14px", borderRadius:8, border:"1px solid #0F766E44", background:"#0F766E11", color:"#0F766E", fontSize:11, cursor:"pointer" }}>
            ⬇️ Export
          </button>
        </div>

        {/* Checklist */}
        {filteredCats.map(cat => {
          const catDone = cat.items.filter(i => checked[i.id]).length;
          return (
            <div key={cat.cat} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, marginBottom:16, overflow:"hidden" }}>
              <div style={{ padding:"12px 16px", background:bg3, borderBottom:`1px solid ${bdr}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <div style={{ width:10, height:10, borderRadius:"50%", background:cat.color }} />
                  <span style={{ fontSize:13, fontWeight:600, color:txt }}>{cat.cat}</span>
                  <span style={{ fontSize:11, color:txt2 }}>{catDone}/{cat.items.length}</span>
                </div>
                <button onClick={()=>toggleAll(cat.cat, cat.items)} style={{ padding:"3px 10px", borderRadius:6, border:`1px solid ${bdr}`, background:"transparent", color:txt2, fontSize:11, cursor:"pointer" }}>
                  {cat.items.every(i=>checked[i.id])?"Uncheck All":"Check All"}
                </button>
              </div>
              <div>
                {cat.items.map((item, idx) => (
                  <div key={item.id} onClick={()=>setChecked(c=>({...c,[item.id]:!c[item.id]}))}
                    style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 16px", borderBottom: idx<cat.items.length-1?`1px solid ${bdr}33`:"none", cursor:"pointer", opacity:checked[item.id]?0.6:1, background:"transparent" }}>
                    <div style={{ width:18, height:18, borderRadius:4, border:`2px solid ${checked[item.id]?cat.color:bdr}`, background:checked[item.id]?cat.color:"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"all 0.15s" }}>
                      {checked[item.id] && <span style={{ color:"#fff", fontSize:11, lineHeight:1 }}>✓</span>}
                    </div>
                    <span style={{ flex:1, fontSize:13, color:checked[item.id]?txt3:txt, textDecoration:checked[item.id]?"line-through":"none" }}>{item.text}</span>
                    <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:`${PRIORITY_COLORS[item.priority]}22`, color:PRIORITY_COLORS[item.priority], flexShrink:0 }}>
                      {item.priority}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {filteredCats.length === 0 && (
          <div style={{ textAlign:"center", padding:40, color:txt3 }}>
            <div style={{ fontSize:30, marginBottom:8 }}>🔍</div>
            <div style={{ fontSize:13, color:txt2 }}>No items match your filter</div>
          </div>
        )}
      </div>
    </div>
  );
}