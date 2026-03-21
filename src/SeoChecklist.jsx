import { useState, useEffect } from "react";

const CHECKLIST = [
  {
    cat: "Technical SEO", color: "#047857", icon: "⚙️",
    items: [
      { id:"t1",  text:"HTTPS enabled on all pages",                      priority:"Critical", impact:"High" },
      { id:"t2",  text:"XML sitemap created and submitted to GSC",         priority:"Critical", impact:"High" },
      { id:"t3",  text:"Robots.txt file properly configured",              priority:"Critical", impact:"High" },
      { id:"t4",  text:"Site loads under 3 seconds (mobile)",              priority:"Critical", impact:"High" },
      { id:"t5",  text:"Mobile-friendly / responsive design",              priority:"Critical", impact:"High" },
      { id:"t6",  text:"No broken links (404 errors)",                     priority:"High",     impact:"Medium" },
      { id:"t7",  text:"Canonical tags on duplicate content pages",        priority:"High",     impact:"High" },
      { id:"t8",  text:"Proper 301 redirects for old URLs",                priority:"High",     impact:"Medium" },
      { id:"t9",  text:"Core Web Vitals passing (LCP, CLS, INP)",         priority:"High",     impact:"High" },
      { id:"t10", text:"Structured data / Schema markup implemented",      priority:"Medium",   impact:"Medium" },
      { id:"t11", text:"Hreflang tags for multi-language sites",           priority:"Medium",   impact:"Medium" },
      { id:"t12", text:"Page speed optimized (images, CSS, JS minified)",  priority:"High",     impact:"High" },
    ]
  },
  {
    cat: "On-Page SEO", color: "#7C3AED", icon: "📝",
    items: [
      { id:"o1",  text:"Unique title tag on every page (50-60 chars)",     priority:"Critical", impact:"High" },
      { id:"o2",  text:"Unique meta description on every page (150-160 chars)", priority:"Critical", impact:"Medium" },
      { id:"o3",  text:"One H1 tag per page with target keyword",          priority:"Critical", impact:"High" },
      { id:"o4",  text:"Header hierarchy (H1 → H2 → H3) properly used",   priority:"High",     impact:"Medium" },
      { id:"o5",  text:"Target keyword in first 100 words",                priority:"High",     impact:"High" },
      { id:"o6",  text:"Keyword density natural (1-2%)",                   priority:"Medium",   impact:"Medium" },
      { id:"o7",  text:"Internal links to relevant pages",                 priority:"High",     impact:"High" },
      { id:"o8",  text:"External links to authoritative sources",          priority:"Medium",   impact:"Low" },
      { id:"o9",  text:"Images have descriptive alt text",                 priority:"High",     impact:"Medium" },
      { id:"o10", text:"URL slugs are short, keyword-rich, hyphenated",    priority:"High",     impact:"Medium" },
      { id:"o11", text:"Content is 1000+ words for competitive keywords",  priority:"Medium",   impact:"High" },
      { id:"o12", text:"FAQ section included for featured snippet targets", priority:"Medium",   impact:"Medium" },
    ]
  },
  {
    cat: "Content Quality", color: "#0891B2", icon: "✍️",
    items: [
      { id:"c1",  text:"Content is original (no duplicate content)",       priority:"Critical", impact:"High" },
      { id:"c2",  text:"E-E-A-T signals present (author bio, expertise)",  priority:"High",     impact:"High" },
      { id:"c3",  text:"Content updated regularly (freshness signals)",    priority:"High",     impact:"Medium" },
      { id:"c4",  text:"Covers search intent fully (informational/transactional)", priority:"Critical", impact:"High" },
      { id:"c5",  text:"Table of contents for long articles",              priority:"Medium",   impact:"Low" },
      { id:"c6",  text:"Images, videos, charts used to break up text",    priority:"Medium",   impact:"Medium" },
      { id:"c7",  text:"No thin content pages (under 300 words)",          priority:"High",     impact:"High" },
      { id:"c8",  text:"Content answers People Also Ask questions",        priority:"Medium",   impact:"Medium" },
    ]
  },
  {
    cat: "Keyword Research", color: "#B45309", icon: "🔍",
    items: [
      { id:"k1",  text:"Primary keyword identified for each page",         priority:"Critical", impact:"High" },
      { id:"k2",  text:"Long-tail keywords included in content",           priority:"High",     impact:"High" },
      { id:"k3",  text:"LSI / semantic keywords used naturally",           priority:"High",     impact:"Medium" },
      { id:"k4",  text:"Search intent matched for target keywords",        priority:"Critical", impact:"High" },
      { id:"k5",  text:"Keyword cannibalization avoided",                  priority:"High",     impact:"High" },
      { id:"k6",  text:"Competitor keywords gap analyzed",                 priority:"Medium",   impact:"High" },
    ]
  },
  {
    cat: "Link Building", color: "#1E40AF", icon: "🔗",
    items: [
      { id:"l1",  text:"Backlinks from relevant, authoritative sites",     priority:"High",     impact:"High" },
      { id:"l2",  text:"No toxic/spammy backlinks",                        priority:"High",     impact:"High" },
      { id:"l3",  text:"Anchor text is natural and varied",                priority:"High",     impact:"Medium" },
      { id:"l4",  text:"Guest posting strategy in place",                  priority:"Medium",   impact:"High" },
      { id:"l5",  text:"Internal linking structure is logical (silos)",    priority:"High",     impact:"High" },
      { id:"l6",  text:"Broken link building opportunities explored",      priority:"Low",      impact:"Medium" },
    ]
  },
  {
    cat: "Local SEO", color: "#059669", icon: "📍",
    items: [
      { id:"loc1", text:"Google Business Profile fully optimized",         priority:"Critical", impact:"High" },
      { id:"loc2", text:"NAP (Name, Address, Phone) consistent everywhere", priority:"Critical", impact:"High" },
      { id:"loc3", text:"Listed in top 20 local directories",              priority:"High",     impact:"Medium" },
      { id:"loc4", text:"Reviews generation strategy active",              priority:"High",     impact:"High" },
      { id:"loc5", text:"Local schema markup on website",                  priority:"Medium",   impact:"Medium" },
      { id:"loc6", text:"Location-specific landing pages created",         priority:"Medium",   impact:"High" },
    ]
  },
  {
    cat: "Analytics & Tracking", color: "#9333EA", icon: "📊",
    items: [
      { id:"a1",  text:"Google Analytics 4 installed and working",        priority:"Critical", impact:"High" },
      { id:"a2",  text:"Google Search Console verified and monitored",    priority:"Critical", impact:"High" },
      { id:"a3",  text:"Goal/conversion tracking set up in GA4",          priority:"High",     impact:"High" },
      { id:"a4",  text:"Core Web Vitals monitored monthly",               priority:"High",     impact:"Medium" },
      { id:"a5",  text:"Rank tracking set up for target keywords",        priority:"High",     impact:"High" },
      { id:"a6",  text:"Monthly SEO reporting in place",                  priority:"Medium",   impact:"Medium" },
    ]
  },
];

const PRIORITY_COLORS = { Critical:"#DC2626", High:"#D97706", Medium:"#0891B2", Low:"#059669" };
const IMPACT_COLORS   = { High:"#059669", Medium:"#D97706", Low:"#888" };

export default function SeoChecklist({ dark }) {
  const [checked, setChecked]     = useState({});
  const [activeCat, setActiveCat] = useState("All");
  const [filter, setFilter]       = useState("All");
  const [search, setSearch]       = useState("");

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const txt3 = dark ? "#444"    : "#bbb";

  // Load saved progress
  useEffect(() => {
    try {
      const saved = localStorage.getItem("seo_checklist");
      if (saved) setChecked(JSON.parse(saved));
    } catch(e) {}
  }, []);

  function toggle(id) {
    const updated = { ...checked, [id]: !checked[id] };
    setChecked(updated);
    try { localStorage.setItem("seo_checklist", JSON.stringify(updated)); } catch(e) {}
  }

  function resetAll() {
    if (window.confirm("Reset all checklist progress?")) {
      setChecked({});
      localStorage.removeItem("seo_checklist");
    }
  }

  const allItems   = CHECKLIST.flatMap(c => c.items);
  const totalCount = allItems.length;
  const doneCount  = allItems.filter(i => checked[i.id]).length;
  const progress   = Math.round((doneCount / totalCount) * 100);

  const criticalDone = allItems.filter(i => i.priority==="Critical" && checked[i.id]).length;
  const criticalTotal= allItems.filter(i => i.priority==="Critical").length;

  function getFilteredItems(items) {
    return items.filter(item => {
      const matchFilter = filter==="All" || item.priority===filter || (filter==="Done"&&checked[item.id]) || (filter==="Pending"&&!checked[item.id]);
      const matchSearch = !search || item.text.toLowerCase().includes(search.toLowerCase());
      return matchFilter && matchSearch;
    });
  }

  function exportCSV() {
    const rows = ["Category,Item,Priority,Impact,Status"];
    CHECKLIST.forEach(cat => {
      cat.items.forEach(item => {
        rows.push(`"${cat.cat}","${item.text}","${item.priority}","${item.impact}","${checked[item.id]?"Done":"Pending"}"`);
      });
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rows.join("\n")],{type:"text/csv"}));
    a.download = "seo-checklist.csv"; a.click();
  }

  const tabStyle = (a, color="#7C3AED") => ({
    padding:"6px 14px", borderRadius:20, fontSize:12, cursor:"pointer",
    fontWeight:a?600:400, background:a?color+"22":"transparent",
    color:a?color:txt2, border:`1px solid ${a?color+"44":bdr}`,
    whiteSpace:"nowrap"
  });

  const visibleCats = activeCat==="All" ? CHECKLIST : CHECKLIST.filter(c=>c.cat===activeCat);

  return (
    <div style={{ flex:1, overflowY:"auto", padding:24, background:bg }}>
      <div style={{ maxWidth:860, margin:"0 auto" }}>
        <div style={{ fontSize:18, fontWeight:700, color:txt, marginBottom:4 }}>✅ SEO Checklist</div>
        <div style={{ fontSize:13, color:txt2, marginBottom:20 }}>
          {totalCount} items · 7 categories · Auto-saved progress
        </div>

        {/* Stats */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20 }}>
          {[
            { label:"Total Items",    value:totalCount,        color:"#7C3AED" },
            { label:"Completed",      value:doneCount,         color:"#059669" },
            { label:"Remaining",      value:totalCount-doneCount, color:"#D97706" },
            { label:"Critical Done",  value:`${criticalDone}/${criticalTotal}`, color:criticalDone===criticalTotal?"#059669":"#DC2626" },
          ].map(s => (
            <div key={s.label} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:"14px 16px", textAlign:"center", borderTop:`3px solid ${s.color}` }}>
              <div style={{ fontSize:22, fontWeight:800, color:s.color }}>{s.value}</div>
              <div style={{ fontSize:11, color:txt2, marginTop:2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Progress Bar */}
        <div style={{ background:bg3, borderRadius:20, height:10, marginBottom:8, overflow:"hidden" }}>
          <div style={{ height:"100%", width:`${progress}%`, background:progress>=80?"#059669":progress>=50?"#D97706":"#7C3AED", borderRadius:20, transition:"width 0.4s" }} />
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:txt2, marginBottom:20 }}>
          <span>{progress}% complete</span>
          <span>{doneCount} of {totalCount} items done</span>
        </div>

        {/* Toolbar */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:10 }}>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            {/* Filter by priority */}
            {["All","Critical","High","Medium","Low","Done","Pending"].map(f => (
              <div key={f} style={tabStyle(filter===f, f==="All"?"#7C3AED":PRIORITY_COLORS[f]||"#7C3AED")} onClick={()=>setFilter(f)}>{f}</div>
            ))}
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={exportCSV} style={{ padding:"6px 12px", borderRadius:8, border:"1px solid #059669aa", background:"#05966911", color:"#059669", fontSize:11, cursor:"pointer", fontWeight:600 }}>⬇️ Export CSV</button>
            <button onClick={resetAll} style={{ padding:"6px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:"transparent", color:txt3, fontSize:11, cursor:"pointer" }}>🔄 Reset</button>
          </div>
        </div>

        {/* Search */}
        <div style={{ position:"relative", marginBottom:16 }}>
          <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:14, color:txt2 }}>🔍</span>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search checklist items..."
            style={{ width:"100%", padding:"9px 14px 9px 36px", borderRadius:10, border:`1px solid ${bdr}`, background:bg2, color:txt, fontSize:13, outline:"none", boxSizing:"border-box" }} />
        </div>

        {/* Category Tabs */}
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:16 }}>
          <div style={tabStyle(activeCat==="All")} onClick={()=>setActiveCat("All")}>All Categories</div>
          {CHECKLIST.map(c => {
            const catDone  = c.items.filter(i=>checked[i.id]).length;
            const catTotal = c.items.length;
            return (
              <div key={c.cat} style={tabStyle(activeCat===c.cat, c.color)} onClick={()=>setActiveCat(c.cat)}>
                {c.icon} {c.cat} <span style={{ opacity:0.7, fontSize:10 }}>({catDone}/{catTotal})</span>
              </div>
            );
          })}
        </div>

        {/* Checklist Categories */}
        {visibleCats.map(cat => {
          const filteredItems = getFilteredItems(cat.items);
          if (filteredItems.length === 0) return null;
          const catDone  = cat.items.filter(i=>checked[i.id]).length;
          const catTotal = cat.items.length;
          const catPct   = Math.round((catDone/catTotal)*100);

          return (
            <div key={cat.cat} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, overflow:"hidden", marginBottom:16 }}>
              {/* Category Header */}
              <div style={{ padding:"12px 16px", background:bg3, borderBottom:`1px solid ${bdr}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:16 }}>{cat.icon}</span>
                  <span style={{ fontSize:13, fontWeight:700, color:cat.color }}>{cat.cat}</span>
                  <span style={{ fontSize:11, color:txt2 }}>({catDone}/{catTotal})</span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:80, height:5, borderRadius:3, background:bg2, overflow:"hidden" }}>
                    <div style={{ height:"100%", width:`${catPct}%`, background:catPct===100?"#059669":cat.color, borderRadius:3, transition:"width 0.3s" }} />
                  </div>
                  <span style={{ fontSize:11, fontWeight:600, color:catPct===100?"#059669":cat.color }}>{catPct}%</span>
                </div>
              </div>

              {/* Items */}
              <div>
                {filteredItems.map((item, idx) => (
                  <div key={item.id}
                    onClick={()=>toggle(item.id)}
                    style={{
                      display:"flex", alignItems:"center", gap:12, padding:"12px 16px",
                      borderBottom: idx < filteredItems.length-1 ? `1px solid ${bdr}33` : "none",
                      cursor:"pointer", background: checked[item.id] ? (dark?"#0d1a0d":"#f0fff4") : "transparent",
                      transition:"background 0.15s",
                    }}
                    onMouseEnter={e=>{ if(!checked[item.id]) e.currentTarget.style.background=dark?"#161616":"#fafaf8"; }}
                    onMouseLeave={e=>{ e.currentTarget.style.background=checked[item.id]?(dark?"#0d1a0d":"#f0fff4"):"transparent"; }}
                  >
                    {/* Checkbox */}
                    <div style={{
                      width:20, height:20, borderRadius:6, border:`2px solid ${checked[item.id]?"#059669":bdr}`,
                      background: checked[item.id]?"#059669":"transparent", flexShrink:0,
                      display:"flex", alignItems:"center", justifyContent:"center", transition:"all 0.15s"
                    }}>
                      {checked[item.id] && <span style={{ color:"#fff", fontSize:12, lineHeight:1 }}>✓</span>}
                    </div>

                    {/* Text */}
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, color: checked[item.id] ? txt3 : txt, textDecoration: checked[item.id] ? "line-through" : "none", lineHeight:1.4 }}>
                        {item.text}
                      </div>
                    </div>

                    {/* Badges */}
                    <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                      <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:`${PRIORITY_COLORS[item.priority]}22`, color:PRIORITY_COLORS[item.priority], fontWeight:600 }}>
                        {item.priority}
                      </span>
                      <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:`${IMPACT_COLORS[item.impact]}22`, color:IMPACT_COLORS[item.impact] }}>
                        {item.impact} impact
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* Empty state */}
        {visibleCats.every(cat => getFilteredItems(cat.items).length === 0) && (
          <div style={{ textAlign:"center", padding:40, color:txt2 }}>
            <div style={{ fontSize:32, marginBottom:8 }}>🔍</div>
            <div>No items match "{search || filter}"</div>
          </div>
        )}

        {/* Completion Banner */}
        {progress === 100 && (
          <div style={{ background:"#05966922", border:"1px solid #05966944", borderRadius:12, padding:"20px 24px", textAlign:"center", marginTop:16 }}>
            <div style={{ fontSize:32, marginBottom:8 }}>🎉</div>
            <div style={{ fontSize:16, fontWeight:700, color:"#059669" }}>Perfect SEO Score!</div>
            <div style={{ fontSize:13, color:txt2, marginTop:4 }}>All {totalCount} items completed. Your site is fully SEO optimized!</div>
          </div>
        )}
      </div>
    </div>
  );
}