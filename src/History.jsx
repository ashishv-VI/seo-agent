import { useState } from "react";
import { TOOLS } from "./tools";

export default function History({ msgs, onToolSelect, dark }) {
  const [search, setSearch]   = useState("");
  const [filter, setFilter]   = useState("All");
  const [sortBy, setSortBy]   = useState("recent");
  const [expanded, setExpanded] = useState({});
  const [copied, setCopied]   = useState(null);

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const txt3 = dark ? "#444"    : "#bbb";

  const allItems = Object.entries(msgs).flatMap(([toolId, messages]) => {
    const tool = TOOLS.find(t => t.id === toolId);
    if (!tool) return [];
    const pairs = [];
    for (let i = 0; i < messages.length; i += 2) {
      if (messages[i] && messages[i+1]) {
        pairs.push({ tool, query: messages[i].text, response: messages[i+1].text, idx: i, toolId });
      }
    }
    return pairs;
  });

  const cats = ["All", ...new Set(TOOLS.map(t => t.cat))];

  const filtered = allItems
    .filter(m => {
      const matchSearch = !search || m.query.toLowerCase().includes(search.toLowerCase()) || m.response.toLowerCase().includes(search.toLowerCase());
      const matchFilter = filter === "All" || m.tool.cat === filter;
      return matchSearch && matchFilter;
    })
    .sort((a, b) => sortBy === "tool" ? a.tool.label.localeCompare(b.tool.label) : b.idx - a.idx);

  function download(query, response, toolName) {
    const content = `SEO Agent Export\n${"=".repeat(50)}\nTool: ${toolName}\nQuery: ${query}\n\n${"=".repeat(50)}\nResponse:\n\n${response}`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content],{type:"text/plain"}));
    a.download = `seo-${toolName.toLowerCase().replace(/\s+/g,"-")}-${Date.now()}.txt`;
    a.click();
  }

  function copyText(text, id) {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  function downloadAll() {
    const content = filtered.map(item =>
      `TOOL: ${item.tool.label}\nQUERY: ${item.query}\n\nRESPONSE:\n${item.response}\n\n${"=".repeat(60)}\n`
    ).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content],{type:"text/plain"}));
    a.download = `seo-history-${Date.now()}.txt`; a.click();
  }

  function exportCSV() {
    const rows = ["Tool,Category,Query,Response Length"];
    filtered.forEach(item => {
      rows.push(`"${item.tool.label}","${item.tool.cat}","${item.query.replace(/"/g,'""')}","${item.response.length} chars"`);
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rows.join("\n")],{type:"text/csv"}));
    a.download = "seo-history.csv"; a.click();
  }

  // Stats
  const toolUsage = TOOLS.map(t => ({
    tool: t,
    count: Math.floor((msgs[t.id]||[]).length / 2)
  })).filter(x => x.count > 0).sort((a,b) => b.count - a.count);

  const catStats = [...new Set(TOOLS.map(t=>t.cat))].map(cat => ({
    cat,
    count: TOOLS.filter(t=>t.cat===cat).reduce((a,t) => a + Math.floor((msgs[t.id]||[]).length/2), 0)
  })).filter(x=>x.count>0);

  const tabStyle = (a, color="#7C3AED") => ({
    padding:"5px 12px", borderRadius:20, fontSize:11, cursor:"pointer",
    fontWeight:a?600:400, background:a?color+"22":"transparent",
    color:a?color:txt2, border:`1px solid ${a?color+"44":bdr}`,
    whiteSpace:"nowrap"
  });

  return (
    <div style={{ flex:1, overflowY:"auto", padding:24, background:bg }}>
      <div style={{ maxWidth:860, margin:"0 auto" }}>
        <div style={{ fontSize:18, fontWeight:700, color:txt, marginBottom:4 }}>📚 Analysis History</div>
        <div style={{ fontSize:13, color:txt2, marginBottom:20 }}>
          {allItems.length} analyses saved this session
        </div>

        {/* Stats Row */}
        {allItems.length > 0 && (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:20 }}>
            {[
              { label:"Total Analyses", value:allItems.length,                           color:"#7C3AED" },
              { label:"Tools Used",     value:toolUsage.length,                          color:"#059669" },
              { label:"Categories",     value:catStats.length,                           color:"#0891B2" },
              { label:"Most Used",      value:toolUsage[0]?.tool.label.slice(0,12)||"—", color:"#D97706" },
            ].map(s => (
              <div key={s.label} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"12px 14px", textAlign:"center", borderTop:`3px solid ${s.color}` }}>
                <div style={{ fontSize:s.label==="Most Used"?13:20, fontWeight:700, color:s.color }}>{s.value}</div>
                <div style={{ fontSize:10, color:txt2, marginTop:2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Top Tools Used */}
        {toolUsage.length > 0 && (
          <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:16, marginBottom:20 }}>
            <div style={{ fontSize:12, fontWeight:600, color:txt2, marginBottom:10, textTransform:"uppercase", letterSpacing:"0.06em" }}>Most Used Tools</div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {toolUsage.slice(0,8).map(({tool,count}) => (
                <div key={tool.id} onClick={()=>onToolSelect(tool)}
                  style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 12px", borderRadius:20, border:`1px solid ${tool.color}33`, background:tool.color+"11", cursor:"pointer" }}>
                  <span style={{ fontSize:13 }}>{tool.icon}</span>
                  <span style={{ fontSize:11, color:tool.color, fontWeight:600 }}>{tool.label}</span>
                  <span style={{ fontSize:10, background:tool.color+"22", color:tool.color, padding:"1px 6px", borderRadius:10 }}>{count}x</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
          {/* Search */}
          <div style={{ position:"relative", flex:1, minWidth:200 }}>
            <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", fontSize:13, color:txt2 }}>🔍</span>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search queries and responses..."
              style={{ width:"100%", padding:"8px 12px 8px 32px", borderRadius:8, border:`1px solid ${bdr}`, background:bg2, color:txt, fontSize:13, outline:"none", boxSizing:"border-box" }} />
          </div>
          {/* Sort */}
          <select value={sortBy} onChange={e=>setSortBy(e.target.value)}
            style={{ padding:"7px 10px", borderRadius:8, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:12, cursor:"pointer", outline:"none" }}>
            <option value="recent">Most Recent</option>
            <option value="tool">By Tool</option>
          </select>
          {/* Export */}
          {filtered.length > 0 && (
            <div style={{ display:"flex", gap:6 }}>
              <button onClick={downloadAll} style={{ padding:"6px 12px", borderRadius:8, border:"1px solid #059669aa", background:"#05966911", color:"#059669", fontSize:11, cursor:"pointer", fontWeight:600 }}>⬇️ All</button>
              <button onClick={exportCSV} style={{ padding:"6px 12px", borderRadius:8, border:"1px solid #0891B2aa", background:"#0891B211", color:"#0891B2", fontSize:11, cursor:"pointer", fontWeight:600 }}>📊 CSV</button>
            </div>
          )}
        </div>

        {/* Category Filter */}
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:16 }}>
          {cats.map(c => (
            <div key={c} style={tabStyle(filter===c)} onClick={()=>setFilter(c)}>
              {c} {c!=="All" && <span style={{ opacity:0.6, fontSize:10 }}>({catStats.find(x=>x.cat===c)?.count||0})</span>}
            </div>
          ))}
        </div>

        {/* Results count */}
        {search && (
          <div style={{ fontSize:12, color:txt2, marginBottom:12 }}>
            {filtered.length} result{filtered.length!==1?"s":""} for "{search}"
          </div>
        )}

        {/* History Cards */}
        {filtered.length === 0 ? (
          <div style={{ textAlign:"center", padding:60, color:txt2 }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📭</div>
            <div style={{ fontSize:15 }}>{allItems.length===0 ? "No analyses yet — run some tools first!" : `No results for "${search}"`}</div>
            <div style={{ fontSize:12, color:txt3, marginTop:8 }}>Use any tool from the sidebar to start</div>
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {filtered.map((item, i) => {
              const isExpanded = expanded[`${item.toolId}-${item.idx}`];
              const key = `${item.toolId}-${item.idx}`;
              return (
                <div key={i} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, overflow:"hidden" }}>
                  {/* Card Header */}
                  <div style={{ padding:"12px 16px", borderBottom:isExpanded?`1px solid ${bdr}`:"none", display:"flex", alignItems:"center", justifyContent:"space-between", gap:10 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, flex:1, minWidth:0 }}>
                      <span style={{ fontSize:18, flexShrink:0 }}>{item.tool.icon}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <span style={{ fontSize:12, fontWeight:700, color:item.tool.color }}>{item.tool.label}</span>
                          <span style={{ fontSize:10, padding:"1px 6px", borderRadius:4, background:item.tool.color+"22", color:item.tool.color }}>{item.tool.cat}</span>
                        </div>
                        <div style={{ fontSize:12, color:txt, marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          🔍 {item.query}
                        </div>
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                      <button onClick={()=>copyText(item.response, key)}
                        style={{ padding:"4px 10px", borderRadius:6, border:`1px solid ${bdr}`, background:"transparent", color:copied===key?"#059669":txt2, fontSize:11, cursor:"pointer" }}>
                        {copied===key?"✅":"📋"}
                      </button>
                      <button onClick={()=>download(item.query, item.response, item.tool.label)}
                        style={{ padding:"4px 10px", borderRadius:6, border:"1px solid #0F766E44", background:"#0F766E11", color:"#0F766E", fontSize:11, cursor:"pointer" }}>⬇️</button>
                      <button onClick={()=>onToolSelect(item.tool)}
                        style={{ padding:"4px 10px", borderRadius:6, border:`1px solid ${item.tool.color}44`, background:item.tool.color+"11", color:item.tool.color, fontSize:11, cursor:"pointer" }}>↻</button>
                      <button onClick={()=>setExpanded(e=>({...e,[key]:!e[key]}))}
                        style={{ padding:"4px 10px", borderRadius:6, border:`1px solid ${bdr}`, background:"transparent", color:txt2, fontSize:11, cursor:"pointer" }}>
                        {isExpanded?"▲":"▼"}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Response */}
                  {isExpanded && (
                    <div style={{ padding:"14px 16px" }}>
                      <div style={{ background:bg3, borderRadius:8, padding:12, marginBottom:10 }}>
                        <div style={{ fontSize:11, color:txt3, marginBottom:4 }}>Query:</div>
                        <div style={{ fontSize:12, color:txt, lineHeight:1.5 }}>{item.query}</div>
                      </div>
                      <div style={{ background:bg3, borderRadius:8, padding:12 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                          <span style={{ fontSize:11, color:txt3 }}>Response:</span>
                          <span style={{ fontSize:10, color:txt3 }}>{item.response.length} chars · {item.response.split(/\s+/).length} words</span>
                        </div>
                        <div style={{ fontSize:12, color:txt, lineHeight:1.7, whiteSpace:"pre-wrap", maxHeight:300, overflowY:"auto" }}>
                          {item.response}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Preview (collapsed) */}
                  {!isExpanded && (
                    <div onClick={()=>setExpanded(e=>({...e,[key]:true}))}
                      style={{ padding:"8px 16px 12px", cursor:"pointer" }}>
                      <div style={{ fontSize:11, color:txt3, lineHeight:1.5, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {item.response.slice(0,120)}...
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}