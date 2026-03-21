import { useState } from "react";
import { TOOLS } from "./tools";

export default function History({ msgs, onToolSelect }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");

  const allMsgs = Object.entries(msgs).flatMap(([toolId, messages]) => {
    const tool = TOOLS.find(t => t.id === toolId);
    if (!tool) return [];
    const pairs = [];
    for (let i = 0; i < messages.length; i += 2) {
      if (messages[i] && messages[i+1]) {
        pairs.push({ tool, query: messages[i].text, response: messages[i+1].text, idx: i });
      }
    }
    return pairs;
  });

  const filtered = allMsgs.filter(m => {
    const matchSearch = !search || m.query.toLowerCase().includes(search.toLowerCase()) || m.response.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "All" || m.tool.cat === filter;
    return matchSearch && matchFilter;
  });

  function download(query, response, toolName) {
    const content = `SEO Agent Export\n${"=".repeat(50)}\nTool: ${toolName}\nQuery: ${query}\n\n${"=".repeat(50)}\nResponse:\n\n${response}`;
    const blob = new Blob([content], { type:"text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `seo-${toolName.toLowerCase().replace(/\s+/g,"-")}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const cats = ["All", ...new Set(TOOLS.map(t => t.cat))];

  const s = {
    wrap:   { flex:1, overflowY:"auto", padding:"24px", background:"#0a0a0a" },
    top:    { marginBottom:20 },
    title:  { fontSize:20, fontWeight:700, color:"#fff", marginBottom:4 },
    sub:    { fontSize:13, color:"#555" },
    controls: { display:"flex", gap:10, marginBottom:20, flexWrap:"wrap" },
    search: { flex:1, minWidth:200, padding:"8px 12px", borderRadius:8, border:"1px solid #222", background:"#111", color:"#e8e8e8", fontSize:13, outline:"none" },
    filterBtn: a => ({ padding:"6px 14px", borderRadius:20, border:"1px solid", fontSize:12, cursor:"pointer", fontWeight:a?600:400, background:a?"#7C3AED22":"transparent", color:a?"#A78BFA":"#555", borderColor:a?"#7C3AED44":"#222" }),
    empty:  { textAlign:"center", padding:60, color:"#333" },
    card:   { background:"#111", border:"1px solid #222", borderRadius:12, padding:"16px", marginBottom:12 },
    cardTop:{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10, gap:10 },
    toolBadge: (color) => ({ display:"flex", alignItems:"center", gap:6, fontSize:12, color, fontWeight:600 }),
    query:  { fontSize:13, color:"#ccc", background:"#1a1a1a", padding:"8px 12px", borderRadius:8, marginBottom:10, border:"1px solid #222" },
    response: { fontSize:12, color:"#666", lineHeight:1.6, maxHeight:80, overflow:"hidden", textOverflow:"ellipsis" },
    btnRow: { display:"flex", gap:8, marginTop:12 },
    btn:    (color) => ({ padding:"5px 12px", borderRadius:6, border:`1px solid ${color}33`, background:`${color}11`, color, fontSize:11, cursor:"pointer", fontWeight:500 }),
  };

  return (
    <div style={s.wrap}>
      <div style={s.top}>
        <div style={s.title}>📚 Analysis History</div>
        <div style={s.sub}>{allMsgs.length} total analyses saved this session</div>
      </div>

      <div style={s.controls}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search analyses..." style={s.search} />
        {cats.map(c => <div key={c} style={s.filterBtn(filter===c)} onClick={()=>setFilter(c)}>{c}</div>)}
      </div>

      {filtered.length === 0 ? (
        <div style={s.empty}>
          <div style={{ fontSize:40, marginBottom:12 }}>📭</div>
          <div style={{ fontSize:15, color:"#555" }}>{allMsgs.length === 0 ? "No analyses yet — run some tools first!" : "No results found"}</div>
        </div>
      ) : (
        filtered.map((item, i) => (
          <div key={i} style={s.card}>
            <div style={s.cardTop}>
              <div style={s.toolBadge(item.tool.color)}>
                <span style={{ fontSize:16 }}>{item.tool.icon}</span>
                <span>{item.tool.label}</span>
                <span style={{ fontSize:10, color:"#444", fontWeight:400 }}>· {item.tool.cat}</span>
              </div>
            </div>
            <div style={s.query}>🔍 {item.query}</div>
            <div style={s.response}>{item.response.slice(0, 200)}...</div>
            <div style={s.btnRow}>
              <button onClick={()=>download(item.query, item.response, item.tool.label)} style={s.btn("#0F766E")}>
                ⬇️ Download
              </button>
              <button onClick={()=>onToolSelect(item.tool)} style={s.btn(item.tool.color)}>
                🔄 Run Again
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}