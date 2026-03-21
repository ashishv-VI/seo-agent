import { useState, useEffect } from "react";

const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday"];
const CONTENT_TYPES = ["Blog Post","Social Media","Video","Email","Infographic","Case Study","Podcast","Webinar"];
const COLORS = { "Blog Post":"#7C3AED","Social Media":"#0891B2","Video":"#DC2626","Email":"#D97706","Infographic":"#059669","Case Study":"#9333EA","Podcast":"#0F766E","Webinar":"#B45309" };
const TYPE_ICONS = { "Blog Post":"✍️","Social Media":"📱","Video":"🎥","Email":"📧","Infographic":"📊","Case Study":"📋","Podcast":"🎙️","Webinar":"💻" };

export default function ContentCalendar({ dark, keys, model }) {
  const [niche, setNiche]       = useState("");
  const [weeks, setWeeks]       = useState(4);
  const [loading, setLoading]   = useState(false);
  const [calendar, setCalendar] = useState(null);
  const [view, setView]         = useState("calendar");
  const [selectedItem, setSelectedItem] = useState(null);
  const [filterType, setFilterType]     = useState("All");
  const [filterPriority, setFilterPriority] = useState("All");
  const [currentWeek, setCurrentWeek]   = useState(1);

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const txt3 = dark ? "#444"    : "#bbb";

  // Load saved calendar
  useEffect(() => {
    try {
      const saved = localStorage.getItem("seo_calendar");
      if (saved) setCalendar(JSON.parse(saved));
    } catch(e) {}
  }, []);

  function saveCalendar(cal) {
    setCalendar(cal);
    try { localStorage.setItem("seo_calendar", JSON.stringify(cal)); } catch(e) {}
  }

  async function callAI(prompt) {
    const key = model === "groq" ? keys.groq : keys.gemini;
    if (!key) return null;
    if (model === "groq") {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method:"POST", headers:{ "Content-Type":"application/json", "Authorization":`Bearer ${key}` },
        body: JSON.stringify({ model:"llama-3.1-8b-instant", max_tokens:3000, messages:[{ role:"user", content:prompt }] })
      });
      const d = await res.json();
      return d.choices?.[0]?.message?.content || null;
    } else {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${keys.gemini}`, {
        method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ contents:[{ parts:[{ text:prompt }] }] })
      });
      const d = await res.json();
      return d.candidates?.[0]?.content?.parts?.[0]?.text || null;
    }
  }

  async function generateCalendar() {
    if (!niche.trim()) return;
    setLoading(true);

    const prompt = `You are an expert content strategist. Create a ${weeks}-week SEO content calendar for: "${niche}"

Generate exactly ${weeks * 5} content pieces (5 per week, Monday-Friday only).

Format EXACTLY like this for each item:
ITEM_START
WEEK: [1-${weeks}]
DAY: [Monday/Tuesday/Wednesday/Thursday/Friday]
TITLE: [SEO-optimized title, 50-60 chars]
TYPE: [Blog Post/Social Media/Video/Email/Infographic/Case Study/Podcast/Webinar]
KEYWORD: [target keyword]
INTENT: [Informational/Navigational/Transactional/Commercial]
PRIORITY: [High/Medium/Low]
NOTES: [1 sentence publishing tip]
ITEM_END

Generate all ${weeks * 5} items now. No extra text.`;

    try {
      const text = await callAI(prompt);
      if (!text) return;

      const items = [];
      const blocks = text.split("ITEM_START").filter(b => b.includes("ITEM_END"));
      blocks.forEach(block => {
        const get = (k) => { const m = block.match(new RegExp(`${k}:\\s*(.+)`)); return m ? m[1].trim() : ""; };
        const week = parseInt(get("WEEK")) || 1;
        const day  = get("DAY") || "Monday";
        if (get("TITLE")) {
          items.push({
            id: Date.now() + Math.random(),
            week, day,
            title:   get("TITLE"),
            type:    get("TYPE") || "Blog Post",
            keyword: get("KEYWORD"),
            intent:  get("INTENT"),
            priority:get("PRIORITY"),
            notes:   get("NOTES"),
            done: false,
            createdAt: new Date().toLocaleDateString(),
          });
        }
      });

      // Fallback if parsing fails
      const finalItems = items.length > 0 ? items : Array.from({ length: weeks * 5 }, (_, idx) => {
        const w = Math.floor(idx / 5) + 1;
        const d = DAYS[idx % 5];
        return { id: Date.now()+idx, week:w, day:d, title:`${niche} content - Week ${w} ${d}`, type:CONTENT_TYPES[idx%CONTENT_TYPES.length], keyword:niche, intent:"Informational", priority:idx%5===0?"High":"Medium", notes:"Publish at peak engagement time", done:false, createdAt:new Date().toLocaleDateString() };
      });

      saveCalendar({ niche, weeks, items: finalItems, createdAt: new Date().toLocaleDateString() });
      setCurrentWeek(1);
    } catch(e) { console.error(e); }
    setLoading(false);
  }

  function toggleDone(id) {
    const updated = { ...calendar, items: calendar.items.map(i => i.id===id ? {...i, done:!i.done} : i) };
    saveCalendar(updated);
    if (selectedItem?.id === id) setSelectedItem(prev => ({...prev, done:!prev.done}));
  }

  function deleteItem(id) {
    const updated = { ...calendar, items: calendar.items.filter(i => i.id !== id) };
    saveCalendar(updated);
    setSelectedItem(null);
  }

  function downloadCSV() {
    if (!calendar) return;
    const header = "Week,Day,Title,Type,Keyword,Intent,Priority,Notes,Done";
    const rows = calendar.items.map(i => `${i.week},${i.day},"${i.title}","${i.type}","${i.keyword}","${i.intent}","${i.priority}","${i.notes}",${i.done?"Yes":"No"}`);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([header+"\n"+rows.join("\n")],{type:"text/csv"}));
    a.download = `content-calendar-${(calendar.niche||"seo").replace(/\s+/g,"-")}.csv`; a.click();
  }

  function exportMarkdown() {
    if (!calendar) return;
    let md = `# Content Calendar — ${calendar.niche}\n\nCreated: ${calendar.createdAt}\n\n`;
    for (let w = 1; w <= calendar.weeks; w++) {
      md += `## Week ${w}\n\n`;
      DAYS.forEach(day => {
        const item = calendar.items.find(i=>i.week===w&&i.day===day);
        if (item) md += `**${day}** — ${item.title}\n- Type: ${item.type} | Keyword: ${item.keyword} | Priority: ${item.priority}\n- ${item.notes}\n\n`;
      });
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([md],{type:"text/markdown"}));
    a.download = `content-calendar-${(calendar.niche||"seo").replace(/\s+/g,"-")}.md`; a.click();
  }

  const priorityColor = p => p==="High"?"#DC2626":p==="Medium"?"#D97706":"#059669";
  const intentColor   = i => ({ Transactional:"#059669", Commercial:"#7C3AED", Navigational:"#0891B2", Informational:"#888" }[i] || "#888");

  const filteredItems = calendar?.items.filter(i => {
    const matchType     = filterType==="All"     || i.type===filterType;
    const matchPriority = filterPriority==="All" || i.priority===filterPriority;
    return matchType && matchPriority;
  }) || [];

  const doneCount    = calendar?.items.filter(i=>i.done).length || 0;
  const totalCount   = calendar?.items.length || 0;
  const progress     = totalCount ? Math.round((doneCount/totalCount)*100) : 0;
  const tabStyle     = (a) => ({ padding:"6px 14px", borderRadius:20, fontSize:12, cursor:"pointer", fontWeight:a?600:400, background:a?"#7C3AED22":"transparent", color:a?"#A78BFA":txt2, border:`1px solid ${a?"#7C3AED44":bdr}` });

  return (
    <div style={{ flex:1, overflowY:"auto", padding:24, background:bg }}>
      <div style={{ maxWidth:1060, margin:"0 auto" }}>
        <div style={{ fontSize:18, fontWeight:700, color:txt, marginBottom:4 }}>📅 Content Calendar Planner</div>
        <div style={{ fontSize:13, color:txt2, marginBottom:20 }}>AI-generated SEO content calendar · Auto-saved · CSV + Markdown export</div>

        {/* Input */}
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:20 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr auto auto", gap:12, alignItems:"end" }}>
            <div>
              <div style={{ fontSize:12, color:txt2, marginBottom:6 }}>Your niche or topic</div>
              <input value={niche} onChange={e=>setNiche(e.target.value)} onKeyDown={e=>e.key==="Enter"&&generateCalendar()}
                placeholder="digital marketing agency, fitness blog, SaaS tool..."
                style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", boxSizing:"border-box" }} />
            </div>
            <div>
              <div style={{ fontSize:12, color:txt2, marginBottom:6 }}>Weeks</div>
              <select value={weeks} onChange={e=>setWeeks(parseInt(e.target.value))}
                style={{ padding:"10px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", cursor:"pointer" }}>
                {[2,4,6,8].map(w => <option key={w} value={w}>{w} weeks</option>)}
              </select>
            </div>
            <button onClick={generateCalendar} disabled={loading||!niche.trim()}
              style={{ padding:"10px 20px", borderRadius:10, border:"none", background:loading||!niche.trim()?"#333":"#7C3AED", color:loading||!niche.trim()?txt3:"#fff", fontWeight:600, fontSize:13, cursor:loading||!niche.trim()?"not-allowed":"pointer" }}>
              {loading?"Generating...":"📅 Generate"}
            </button>
          </div>
          {calendar && <div style={{ fontSize:11, color:"#059669", marginTop:8 }}>✅ Calendar auto-saved — will persist on refresh</div>}
        </div>

        {calendar && (
          <>
            {/* Stats */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10, marginBottom:16 }}>
              {[
                { label:"Total",        value:totalCount,                                              color:"#7C3AED" },
                { label:"Done",         value:doneCount,                                               color:"#059669" },
                { label:"Pending",      value:totalCount-doneCount,                                    color:"#D97706" },
                { label:"High Priority",value:calendar.items.filter(i=>i.priority==="High").length,    color:"#DC2626" },
                { label:"Progress",     value:`${progress}%`,                                          color:progress>=70?"#059669":progress>=40?"#D97706":"#DC2626" },
              ].map(s => (
                <div key={s.label} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"12px 14px", textAlign:"center", borderTop:`3px solid ${s.color}` }}>
                  <div style={{ fontSize:20, fontWeight:800, color:s.color }}>{s.value}</div>
                  <div style={{ fontSize:10, color:txt2, marginTop:2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Progress Bar */}
            <div style={{ background:bg3, borderRadius:20, height:8, marginBottom:16, overflow:"hidden", position:"relative" }}>
              <div style={{ height:"100%", width:`${progress}%`, background:progress>=70?"#059669":progress>=40?"#D97706":"#7C3AED", borderRadius:20, transition:"width 0.5s" }} />
              <div style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", fontSize:10, color:txt2 }}>{progress}% complete</div>
            </div>

            {/* Toolbar */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:10 }}>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                <div style={{ display:"flex", gap:4, background:bg3, borderRadius:8, padding:3 }}>
                  {["calendar","list","stats"].map(v => (
                    <button key={v} onClick={()=>setView(v)} style={{ padding:"5px 12px", borderRadius:6, border:"none", background:view===v?bg2:"transparent", color:view===v?txt:txt2, fontSize:12, cursor:"pointer", fontWeight:view===v?600:400 }}>
                      {v==="calendar"?"📅 Calendar":v==="list"?"📋 List":"📊 Stats"}
                    </button>
                  ))}
                </div>
                <select value={filterType} onChange={e=>setFilterType(e.target.value)}
                  style={{ padding:"6px 10px", borderRadius:8, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:11, cursor:"pointer", outline:"none" }}>
                  <option value="All">All Types</option>
                  {CONTENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={filterPriority} onChange={e=>setFilterPriority(e.target.value)}
                  style={{ padding:"6px 10px", borderRadius:8, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:11, cursor:"pointer", outline:"none" }}>
                  <option value="All">All Priorities</option>
                  {["High","Medium","Low"].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={downloadCSV} style={{ padding:"6px 12px", borderRadius:8, border:"1px solid #059669aa", background:"#05966911", color:"#059669", fontSize:11, cursor:"pointer", fontWeight:600 }}>⬇️ CSV</button>
                <button onClick={exportMarkdown} style={{ padding:"6px 12px", borderRadius:8, border:"1px solid #7C3AED44", background:"#7C3AED11", color:"#A78BFA", fontSize:11, cursor:"pointer", fontWeight:600 }}>📝 Markdown</button>
                <button onClick={()=>{ if(confirm("Clear saved calendar?")){ localStorage.removeItem("seo_calendar"); setCalendar(null); }}} style={{ padding:"6px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:"transparent", color:txt3, fontSize:11, cursor:"pointer" }}>🗑️ Clear</button>
              </div>
            </div>

            {/* ── CALENDAR VIEW ── */}
            {view==="calendar" && (
              <div>
                {/* Week Navigator */}
                <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap" }}>
                  {Array.from({length:calendar.weeks},(_,i) => {
                    const wDone = calendar.items.filter(x=>x.week===i+1&&x.done).length;
                    const wTotal= calendar.items.filter(x=>x.week===i+1).length;
                    return (
                      <div key={i} onClick={()=>setCurrentWeek(i+1)} style={tabStyle(currentWeek===i+1)}>
                        Week {i+1} <span style={{ fontSize:10, opacity:0.7 }}>({wDone}/{wTotal})</span>
                      </div>
                    );
                  })}
                </div>

                {/* Week Grid */}
                <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, overflow:"hidden" }}>
                  {/* Day Headers */}
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", background:bg3, borderBottom:`1px solid ${bdr}` }}>
                    {DAYS.map(d => (
                      <div key={d} style={{ padding:"10px 12px", fontSize:11, fontWeight:700, color:txt2, textAlign:"center", textTransform:"uppercase", letterSpacing:"0.06em" }}>{d.slice(0,3)}</div>
                    ))}
                  </div>
                  {/* Day Cells */}
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:1, background:bdr }}>
                    {DAYS.map(day => {
                      const item = calendar.items.find(i=>i.week===currentWeek&&i.day===day);
                      return (
                        <div key={day} style={{ background:bg2, padding:12, minHeight:140 }}>
                          {item ? (
                            <div onClick={()=>setSelectedItem(item)} style={{ cursor:"pointer", opacity:item.done?0.55:1, height:"100%" }}>
                              <div style={{ display:"flex", alignItems:"center", gap:4, marginBottom:6 }}>
                                <span style={{ fontSize:14 }}>{TYPE_ICONS[item.type]||"📝"}</span>
                                <span style={{ fontSize:9, padding:"2px 6px", borderRadius:4, background:`${COLORS[item.type]||"#7C3AED"}22`, color:COLORS[item.type]||"#7C3AED", fontWeight:600 }}>{item.type}</span>
                              </div>
                              <div style={{ fontSize:12, color:item.done?txt3:txt, lineHeight:1.4, marginBottom:8, textDecoration:item.done?"line-through":"none", fontWeight:500 }}>{item.title}</div>
                              <div style={{ fontSize:10, color:txt2, marginBottom:6, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>🔑 {item.keyword}</div>
                              <div style={{ display:"flex", gap:4, marginBottom:8 }}>
                                <span style={{ fontSize:9, padding:"1px 6px", borderRadius:3, background:`${priorityColor(item.priority)}22`, color:priorityColor(item.priority) }}>{item.priority}</span>
                                <span style={{ fontSize:9, padding:"1px 6px", borderRadius:3, background:`${intentColor(item.intent)}22`, color:intentColor(item.intent) }}>{item.intent?.slice(0,5)}</span>
                              </div>
                              <button onClick={e=>{e.stopPropagation();toggleDone(item.id);}}
                                style={{ padding:"3px 10px", borderRadius:6, border:`1px solid ${item.done?"#059669":bdr}`, background:item.done?"#059669":"transparent", color:item.done?"#fff":txt3, fontSize:10, cursor:"pointer", width:"100%" }}>
                                {item.done?"✅ Done":"Mark Done"}
                              </button>
                            </div>
                          ) : (
                            <div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, color:txt3, fontStyle:"italic" }}>—</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ── LIST VIEW ── */}
            {view==="list" && (
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {filteredItems.length === 0 && (
                  <div style={{ textAlign:"center", padding:30, color:txt2, fontSize:13 }}>No items match the current filter</div>
                )}
                {filteredItems.map(item => (
                  <div key={item.id} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"12px 16px", display:"flex", alignItems:"center", gap:12, opacity:item.done?0.6:1 }}>
                    <button onClick={()=>toggleDone(item.id)}
                      style={{ width:22, height:22, borderRadius:"50%", border:`2px solid ${item.done?"#059669":bdr}`, background:item.done?"#059669":"transparent", color:"#fff", fontSize:12, cursor:"pointer", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                      {item.done?"✓":""}
                    </button>
                    <span style={{ fontSize:16, flexShrink:0 }}>{TYPE_ICONS[item.type]||"📝"}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:500, color:item.done?txt3:txt, textDecoration:item.done?"line-through":"none", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.title}</div>
                      <div style={{ fontSize:11, color:txt2, marginTop:2 }}>Week {item.week} · {item.day} · 🔑 {item.keyword}</div>
                    </div>
                    <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                      <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:`${COLORS[item.type]||"#7C3AED"}22`, color:COLORS[item.type]||"#7C3AED" }}>{item.type}</span>
                      <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:`${priorityColor(item.priority)}22`, color:priorityColor(item.priority) }}>{item.priority}</span>
                      <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:`${intentColor(item.intent)}22`, color:intentColor(item.intent) }}>{item.intent}</span>
                    </div>
                    <button onClick={()=>setSelectedItem(item)} style={{ padding:"4px 10px", borderRadius:6, border:`1px solid ${bdr}`, background:"transparent", color:txt2, fontSize:11, cursor:"pointer", flexShrink:0 }}>Details</button>
                  </div>
                ))}
              </div>
            )}

            {/* ── STATS VIEW ── */}
            {view==="stats" && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                {/* By Type */}
                <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:txt, marginBottom:14 }}>By Content Type</div>
                  {CONTENT_TYPES.map(type => {
                    const count = calendar.items.filter(i=>i.type===type).length;
                    const done  = calendar.items.filter(i=>i.type===type&&i.done).length;
                    if (!count) return null;
                    return (
                      <div key={type} style={{ marginBottom:12 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:4 }}>
                          <span style={{ color:txt }}>{TYPE_ICONS[type]} {type}</span>
                          <span style={{ color:COLORS[type], fontWeight:600 }}>{done}/{count}</span>
                        </div>
                        <div style={{ height:6, borderRadius:3, background:bg3, overflow:"hidden" }}>
                          <div style={{ height:"100%", width:`${count?(done/count)*100:0}%`, background:COLORS[type], borderRadius:3 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* By Priority */}
                <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:txt, marginBottom:14 }}>By Priority</div>
                  {["High","Medium","Low"].map(p => {
                    const total = calendar.items.filter(i=>i.priority===p).length;
                    const done  = calendar.items.filter(i=>i.priority===p&&i.done).length;
                    const color = priorityColor(p);
                    return (
                      <div key={p} style={{ background:bg3, borderRadius:10, padding:"14px 16px", marginBottom:10 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                          <span style={{ fontSize:13, fontWeight:600, color }}>{p} Priority</span>
                          <span style={{ fontSize:13, color, fontWeight:700 }}>{done}/{total}</span>
                        </div>
                        <div style={{ height:6, borderRadius:3, background:bg2, overflow:"hidden" }}>
                          <div style={{ height:"100%", width:`${total?(done/total)*100:0}%`, background:color, borderRadius:3 }} />
                        </div>
                        <div style={{ fontSize:10, color:txt2, marginTop:4 }}>{total?(Math.round((done/total)*100)):0}% complete</div>
                      </div>
                    );
                  })}
                </div>

                {/* Weekly Progress */}
                <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, gridColumn:"1/-1" }}>
                  <div style={{ fontSize:13, fontWeight:600, color:txt, marginBottom:14 }}>Weekly Progress</div>
                  <div style={{ display:"grid", gridTemplateColumns:`repeat(${calendar.weeks},1fr)`, gap:8 }}>
                    {Array.from({length:calendar.weeks},(_,wi) => {
                      const wItems = calendar.items.filter(i=>i.week===wi+1);
                      const wDone  = wItems.filter(i=>i.done).length;
                      const pct    = wItems.length ? Math.round((wDone/wItems.length)*100) : 0;
                      return (
                        <div key={wi} style={{ textAlign:"center" }}>
                          <div style={{ height:80, background:bg3, borderRadius:8, overflow:"hidden", display:"flex", alignItems:"flex-end", marginBottom:6 }}>
                            <div style={{ width:"100%", height:`${pct}%`, background:pct>=80?"#059669":pct>=50?"#D97706":"#7C3AED", transition:"height 0.5s", minHeight:pct>0?4:0 }} />
                          </div>
                          <div style={{ fontSize:11, fontWeight:600, color:txt }}>W{wi+1}</div>
                          <div style={{ fontSize:10, color:txt2 }}>{wDone}/{wItems.length}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── DETAIL MODAL ── */}
        {selectedItem && (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 }} onClick={()=>setSelectedItem(null)}>
            <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:16, padding:24, width:500, maxWidth:"92vw" }} onClick={e=>e.stopPropagation()}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:20 }}>{TYPE_ICONS[selectedItem.type]||"📝"}</span>
                  <span style={{ fontSize:14, fontWeight:700, color:txt }}>Content Details</span>
                </div>
                <button onClick={()=>setSelectedItem(null)} style={{ background:"none", border:"none", color:txt2, cursor:"pointer", fontSize:18, lineHeight:1 }}>✕</button>
              </div>

              <div style={{ fontSize:15, fontWeight:600, color:txt, marginBottom:14, lineHeight:1.4 }}>{selectedItem.title}</div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
                {[
                  { label:"Type",     value:selectedItem.type,              color:COLORS[selectedItem.type]||"#7C3AED" },
                  { label:"Priority", value:selectedItem.priority,          color:priorityColor(selectedItem.priority) },
                  { label:"Intent",   value:selectedItem.intent,            color:intentColor(selectedItem.intent) },
                  { label:"Schedule", value:`Week ${selectedItem.week} · ${selectedItem.day}`, color:txt2 },
                ].map(f => (
                  <div key={f.label} style={{ background:bg3, borderRadius:8, padding:"10px 12px" }}>
                    <div style={{ fontSize:10, color:txt2, marginBottom:2 }}>{f.label}</div>
                    <div style={{ fontSize:13, fontWeight:500, color:f.color }}>{f.value}</div>
                  </div>
                ))}
              </div>

              <div style={{ background:bg3, borderRadius:8, padding:12, marginBottom:10 }}>
                <div style={{ fontSize:10, color:txt2, marginBottom:4 }}>🔑 Target Keyword</div>
                <div style={{ fontSize:13, color:"#A78BFA", fontWeight:500 }}>{selectedItem.keyword}</div>
              </div>

              {selectedItem.notes && (
                <div style={{ background:bg3, borderRadius:8, padding:12, marginBottom:16 }}>
                  <div style={{ fontSize:10, color:txt2, marginBottom:4 }}>📌 Publishing Notes</div>
                  <div style={{ fontSize:13, color:txt, lineHeight:1.6 }}>{selectedItem.notes}</div>
                </div>
              )}

              <div style={{ display:"flex", gap:8 }}>
                <button onClick={()=>toggleDone(selectedItem.id)}
                  style={{ flex:1, padding:"10px", borderRadius:10, border:"none", background:selectedItem.done?"#333":"#059669", color:"#fff", fontWeight:600, fontSize:13, cursor:"pointer" }}>
                  {selectedItem.done?"↩️ Mark Pending":"✅ Mark Done"}
                </button>
                <button onClick={()=>deleteItem(selectedItem.id)}
                  style={{ padding:"10px 16px", borderRadius:10, border:"1px solid #DC262633", background:"#DC262611", color:"#DC2626", fontWeight:600, fontSize:13, cursor:"pointer" }}>
                  🗑️
                </button>
              </div>
            </div>
          </div>
        )}

        {!calendar && !loading && (
          <div style={{ textAlign:"center", padding:60, color:txt3 }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📅</div>
            <div style={{ fontSize:15, color:txt2 }}>Enter your niche to generate a content calendar</div>
            <div style={{ fontSize:12, color:txt3, marginTop:8 }}>AI creates a complete {weeks}-week SEO content plan · Auto-saved!</div>
          </div>
        )}
      </div>
    </div>
  );
}