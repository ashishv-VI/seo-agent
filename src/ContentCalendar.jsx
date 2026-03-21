import { useState } from "react";

const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const CONTENT_TYPES = ["Blog Post","Social Media","Video","Email","Infographic","Case Study","Podcast","Webinar"];
const COLORS = { "Blog Post":"#7C3AED","Social Media":"#0891B2","Video":"#DC2626","Email":"#D97706","Infographic":"#059669","Case Study":"#9333EA","Podcast":"#0F766E","Webinar":"#B45309" };

export default function ContentCalendar({ dark, keys, model }) {
  const [niche, setNiche]     = useState("");
  const [weeks, setWeeks]     = useState(4);
  const [loading, setLoading] = useState(false);
  const [calendar, setCalendar] = useState(null);
  const [view, setView]       = useState("calendar");
  const [selectedItem, setSelectedItem] = useState(null);

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const txt3 = dark ? "#444"    : "#bbb";

  async function generateCalendar() {
    const key = model === "groq" ? keys.groq : keys.gemini;
    if (!key || !niche.trim()) return;
    setLoading(true); setCalendar(null);

    const prompt = `You are an expert content strategist. Create a ${weeks}-week SEO content calendar for: "${niche}"

Generate exactly ${weeks * 5} content pieces (5 per week, Monday-Friday only).
For each piece provide:
- TITLE: [SEO-optimized title]
- TYPE: [exactly one of: Blog Post, Social Media, Video, Email, Infographic, Case Study, Podcast, Webinar]
- KEYWORD: [target keyword]
- INTENT: [Informational/Navigational/Transactional/Commercial]
- PRIORITY: [High/Medium/Low]
- NOTES: [1 sentence publishing tip]

Format EXACTLY like this for each item (no extra text between items):
ITEM_START
WEEK: [1-${weeks}]
DAY: [Monday/Tuesday/Wednesday/Thursday/Friday]
TITLE: [title]
TYPE: [type]
KEYWORD: [keyword]
INTENT: [intent]
PRIORITY: [priority]
NOTES: [notes]
ITEM_END

Generate all ${weeks * 5} items now.`;

    try {
      let text = "";
      if (model === "groq") {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
          body: JSON.stringify({ model: "llama-3.1-8b-instant", max_tokens: 3000, messages: [{ role: "user", content: prompt }] })
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

      const items = [];
      const blocks = text.split("ITEM_START").filter(b => b.includes("ITEM_END"));
      blocks.forEach(block => {
        const get = (k) => { const m = block.match(new RegExp(`${k}:\\s*(.+)`)); return m ? m[1].trim() : ""; };
        const week = parseInt(get("WEEK")) || 1;
        const day  = get("DAY") || "Monday";
        if (get("TITLE")) {
          items.push({ id: Date.now() + Math.random(), week, day, title: get("TITLE"), type: get("TYPE") || "Blog Post", keyword: get("KEYWORD"), intent: get("INTENT"), priority: get("PRIORITY"), notes: get("NOTES"), done: false });
        }
      });

      if (items.length > 0) {
        setCalendar({ niche, weeks, items });
      } else {
        const lines = text.split("\n").filter(l => l.trim().length > 10);
        const fallbackItems = [];
        for (let w = 1; w <= weeks; w++) {
          const dayNames = ["Monday","Tuesday","Wednesday","Thursday","Friday"];
          dayNames.forEach((day, di) => {
            const line = lines[(w-1)*5+di] || `${niche} content week ${w} day ${di+1}`;
            fallbackItems.push({ id: Date.now()+Math.random(), week:w, day, title: line.replace(/^[-*•\d.]+\s*/,"").slice(0,80), type: CONTENT_TYPES[di%CONTENT_TYPES.length], keyword: niche, intent:"Informational", priority:di===0?"High":"Medium", notes:"Publish at optimal time", done:false });
          });
        }
        setCalendar({ niche, weeks, items: fallbackItems });
      }
    } catch(e) { console.error(e); }
    setLoading(false);
  }

  function toggleDone(id) {
    setCalendar(c => ({ ...c, items: c.items.map(i => i.id===id ? {...i, done:!i.done} : i) }));
  }

  function downloadCSV() {
    if (!calendar) return;
    const header = "Week,Day,Title,Type,Keyword,Intent,Priority,Notes,Done";
    const rows = calendar.items.map(i => `${i.week},${i.day},"${i.title}","${i.type}","${i.keyword}","${i.intent}","${i.priority}","${i.notes}",${i.done?"Yes":"No"}`);
    const blob = new Blob([header+"\n"+rows.join("\n")], { type:"text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=`content-calendar-${niche.replace(/\s+/g,"-")}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const priorityColor = p => p==="High"?"#DC2626":p==="Medium"?"#D97706":"#059669";
  const intentColor   = i => i==="Transactional"?"#059669":i==="Commercial"?"#7C3AED":i==="Navigational"?"#0891B2":"#888";

  return (
    <div style={{ flex:1, overflowY:"auto", padding:24, background:bg }}>
      <div style={{ maxWidth:1000, margin:"0 auto" }}>
        <div style={{ fontSize:18, fontWeight:700, color:txt, marginBottom:4 }}>📅 Content Calendar Planner</div>
        <div style={{ fontSize:13, color:txt2, marginBottom:20 }}>AI-generated SEO content calendar — ready to execute</div>

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
        </div>

        {calendar && (
          <>
            {/* Stats + Actions */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:10 }}>
              <div style={{ display:"flex", gap:10 }}>
                {[
                  { label:"Total", value: calendar.items.length, color:"#7C3AED" },
                  { label:"Done", value: calendar.items.filter(i=>i.done).length, color:"#059669" },
                  { label:"Pending", value: calendar.items.filter(i=>!i.done).length, color:"#D97706" },
                  { label:"High Priority", value: calendar.items.filter(i=>i.priority==="High").length, color:"#DC2626" },
                ].map(s => (
                  <div key={s.label} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:8, padding:"8px 14px", textAlign:"center" }}>
                    <div style={{ fontSize:16, fontWeight:700, color:s.color }}>{s.value}</div>
                    <div style={{ fontSize:10, color:txt2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <div style={{ display:"flex", gap:4, background:bg3, borderRadius:8, padding:3 }}>
                  {["calendar","list"].map(v => (
                    <button key={v} onClick={()=>setView(v)} style={{ padding:"5px 12px", borderRadius:6, border:"none", background:view===v?bg2:"transparent", color:view===v?txt:txt2, fontSize:12, cursor:"pointer", fontWeight:view===v?600:400 }}>
                      {v==="calendar"?"📅 Calendar":"📋 List"}
                    </button>
                  ))}
                </div>
                <button onClick={downloadCSV} style={{ padding:"6px 14px", borderRadius:8, border:"1px solid #0F766E44", background:"#0F766E11", color:"#0F766E", fontSize:12, cursor:"pointer" }}>
                  ⬇️ Export CSV
                </button>
              </div>
            </div>

            {/* Progress bar */}
            <div style={{ background:bg3, borderRadius:20, height:6, marginBottom:20, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${(calendar.items.filter(i=>i.done).length/calendar.items.length)*100}%`, background:"#059669", borderRadius:20, transition:"width 0.3s" }} />
            </div>

            {/* Calendar View */}
            {view === "calendar" && (
              <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                {Array.from({ length:calendar.weeks }, (_,wi) => (
                  <div key={wi} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, overflow:"hidden" }}>
                    <div style={{ padding:"10px 16px", background:bg3, borderBottom:`1px solid ${bdr}`, fontSize:13, fontWeight:600, color:txt }}>
                      Week {wi+1}
                      <span style={{ fontSize:11, color:txt2, fontWeight:400, marginLeft:8 }}>
                        {calendar.items.filter(i=>i.week===wi+1&&i.done).length}/{calendar.items.filter(i=>i.week===wi+1).length} done
                      </span>
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:1, background:bdr }}>
                      {["Monday","Tuesday","Wednesday","Thursday","Friday"].map(day => {
                        const item = calendar.items.find(i=>i.week===wi+1&&i.day===day);
                        return (
                          <div key={day} style={{ background:bg2, padding:10, minHeight:100 }}>
                            <div style={{ fontSize:10, color:txt3, marginBottom:6, fontWeight:600 }}>{day.slice(0,3).toUpperCase()}</div>
                            {item ? (
                              <div onClick={()=>setSelectedItem(item)} style={{ cursor:"pointer", opacity: item.done?0.5:1 }}>
                                <div style={{ display:"inline-block", fontSize:9, padding:"2px 6px", borderRadius:4, background:`${COLORS[item.type]||"#7C3AED"}22`, color:COLORS[item.type]||"#7C3AED", marginBottom:4, fontWeight:600 }}>{item.type}</div>
                                <div style={{ fontSize:11, color:item.done?txt3:txt, lineHeight:1.4, marginBottom:6, textDecoration:item.done?"line-through":"none" }}>{item.title}</div>
                                <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                                  <span style={{ fontSize:9, padding:"1px 5px", borderRadius:3, background:`${priorityColor(item.priority)}22`, color:priorityColor(item.priority) }}>{item.priority}</span>
                                </div>
                                <button onClick={e=>{e.stopPropagation();toggleDone(item.id);}} style={{ marginTop:6, padding:"2px 8px", borderRadius:4, border:`1px solid ${item.done?"#059669":bdr}`, background:item.done?"#05966922":"transparent", color:item.done?"#059669":txt3, fontSize:9, cursor:"pointer" }}>
                                  {item.done?"✅ Done":"Mark Done"}
                                </button>
                              </div>
                            ) : (
                              <div style={{ fontSize:11, color:txt3, fontStyle:"italic" }}>—</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* List View */}
            {view === "list" && (
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {calendar.items.map(item => (
                  <div key={item.id} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"12px 16px", display:"flex", alignItems:"center", gap:12, opacity:item.done?0.6:1 }}>
                    <button onClick={()=>toggleDone(item.id)} style={{ width:20, height:20, borderRadius:"50%", border:`2px solid ${item.done?"#059669":bdr}`, background:item.done?"#059669":"transparent", color:"#fff", fontSize:11, cursor:"pointer", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                      {item.done?"✓":""}
                    </button>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:500, color:item.done?txt3:txt, textDecoration:item.done?"line-through":"none", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.title}</div>
                      <div style={{ fontSize:11, color:txt2, marginTop:2 }}>Week {item.week} · {item.day} · {item.keyword}</div>
                    </div>
                    <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                      <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:`${COLORS[item.type]||"#7C3AED"}22`, color:COLORS[item.type]||"#7C3AED" }}>{item.type}</span>
                      <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:`${priorityColor(item.priority)}22`, color:priorityColor(item.priority) }}>{item.priority}</span>
                      <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:`${intentColor(item.intent)}22`, color:intentColor(item.intent) }}>{item.intent}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Item Detail Modal */}
        {selectedItem && (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 }} onClick={()=>setSelectedItem(null)}>
            <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:16, padding:24, width:480, maxWidth:"92vw" }} onClick={e=>e.stopPropagation()}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:16 }}>
                <div style={{ fontSize:14, fontWeight:700, color:txt }}>Content Details</div>
                <button onClick={()=>setSelectedItem(null)} style={{ background:"none", border:"none", color:txt2, cursor:"pointer", fontSize:18 }}>✕</button>
              </div>
              <div style={{ fontSize:15, fontWeight:600, color:txt, marginBottom:12 }}>{selectedItem.title}</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
                {[
                  { label:"Type", value:selectedItem.type, color:COLORS[selectedItem.type]||"#7C3AED" },
                  { label:"Priority", value:selectedItem.priority, color:priorityColor(selectedItem.priority) },
                  { label:"Intent", value:selectedItem.intent, color:intentColor(selectedItem.intent) },
                  { label:"Schedule", value:`Week ${selectedItem.week} · ${selectedItem.day}`, color:txt2 },
                ].map(f => (
                  <div key={f.label} style={{ background:bg3, borderRadius:8, padding:"10px 12px" }}>
                    <div style={{ fontSize:10, color:txt2, marginBottom:2 }}>{f.label}</div>
                    <div style={{ fontSize:13, fontWeight:500, color:f.color }}>{f.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ background:bg3, borderRadius:8, padding:12, marginBottom:12 }}>
                <div style={{ fontSize:11, color:txt2, marginBottom:4 }}>Target Keyword</div>
                <div style={{ fontSize:13, color:"#A78BFA", fontWeight:500 }}>{selectedItem.keyword}</div>
              </div>
              {selectedItem.notes && (
                <div style={{ background:bg3, borderRadius:8, padding:12, marginBottom:16 }}>
                  <div style={{ fontSize:11, color:txt2, marginBottom:4 }}>Publishing Notes</div>
                  <div style={{ fontSize:13, color:txt, lineHeight:1.6 }}>{selectedItem.notes}</div>
                </div>
              )}
              <button onClick={()=>{toggleDone(selectedItem.id);setSelectedItem(null);}} style={{ width:"100%", padding:"10px", borderRadius:10, border:"none", background:selectedItem.done?"#333":"#059669", color:"#fff", fontWeight:600, fontSize:13, cursor:"pointer" }}>
                {selectedItem.done?"Mark as Pending":"✅ Mark as Done"}
              </button>
            </div>
          </div>
        )}

        {!calendar && !loading && (
          <div style={{ textAlign:"center", padding:60, color:txt3 }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📅</div>
            <div style={{ fontSize:15, color:txt2 }}>Enter your niche to generate a content calendar</div>
            <div style={{ fontSize:12, color:txt3, marginTop:8 }}>AI creates a complete {weeks}-week SEO content plan</div>
          </div>
        )}
      </div>
    </div>
  );
}