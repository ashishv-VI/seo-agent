import { TOOLS, CATS } from "./tools";

const CAT_COLORS = {
  Content:   "#7C3AED",
  Technical: "#047857",
  Research:  "#0891B2",
  GEO:       "#0F766E",
  Local:     "#B45309",
  Backlinks: "#1E40AF",
  Tools:     "#9333EA",
};

export default function Dashboard({ onToolSelect, count, keys }) {
  const hasGroq   = !!keys?.groq;
  const hasGemini = !!keys?.gemini;
  const hasGoogle = !!keys?.google;

  const catCounts = CATS.filter(c => c !== "All").map(c => ({
    name: c,
    count: TOOLS.filter(t => t.cat === c).length,
    color: CAT_COLORS[c] || "#7C3AED",
  }));

  const s = {
    wrap:   { flex:1, overflowY:"auto", padding:"24px", background:"#0a0a0a" },
    hero:   { marginBottom:24 },
    title:  { fontSize:22, fontWeight:700, color:"#fff", marginBottom:4 },
    sub:    { fontSize:13, color:"#555" },
    grid:   { display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:12, marginBottom:24 },
    card:   (color) => ({ background:"#111", border:`1px solid ${color}33`, borderRadius:12, padding:"16px", cursor:"pointer", transition:"border-color 0.2s" }),
    statGrid: { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:24 },
    stat:   (color) => ({ background:"#111", border:"1px solid #222", borderRadius:12, padding:"16px", textAlign:"center", borderTop:`3px solid ${color}` }),
    statNum:  { fontSize:26, fontWeight:700, color:"#fff", marginBottom:4 },
    statLabel:{ fontSize:11, color:"#555" },
    secTitle: { fontSize:13, fontWeight:600, color:"#888", marginBottom:12, textTransform:"uppercase", letterSpacing:"0.08em" },
    keyStatus:{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:24 },
    keyCard:  (ok) => ({ background:"#111", border:`1px solid ${ok?"#0F766E44":"#DC262644"}`, borderRadius:10, padding:"12px 16px", display:"flex", alignItems:"center", gap:10 }),
    keyDot:   (ok) => ({ width:8, height:8, borderRadius:"50%", background: ok?"#0F766E":"#DC2626", flexShrink:0 }),
    keyName:  { fontSize:12, fontWeight:500, color:"#ccc" },
    keyState: (ok) => ({ fontSize:11, color: ok?"#0F766E":"#DC2626", marginTop:2 }),
    toolGrid: { display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:8 },
    toolCard: (color) => ({ background:"#111", border:"1px solid #222", borderRadius:10, padding:"12px", cursor:"pointer", display:"flex", flexDirection:"column", gap:6, transition:"border-color 0.15s" }),
    toolIcon: { fontSize:20 },
    toolName: { fontSize:12, fontWeight:500, color:"#ccc", lineHeight:1.3 },
    toolCat:  (color) => ({ fontSize:10, color, fontWeight:500 }),
  };

  return (
    <div style={s.wrap}>
      {/* Hero */}
      <div style={s.hero}>
        <div style={s.title}>🚀 SEO Agent Dashboard</div>
        <div style={s.sub}>Your complete SEO Operating System · v3.0 · {TOOLS.length} tools ready</div>
      </div>

      {/* Stats */}
      <div style={s.statGrid}>
        <div style={s.stat("#7C3AED")}>
          <div style={s.statNum}>{TOOLS.length}</div>
          <div style={s.statLabel}>Total Tools</div>
        </div>
        <div style={s.stat("#0F766E")}>
          <div style={s.statNum}>{count}</div>
          <div style={s.statLabel}>Analyses Done</div>
        </div>
        <div style={s.stat("#0891B2")}>
          <div style={s.statNum}>{CATS.length - 1}</div>
          <div style={s.statLabel}>Categories</div>
        </div>
        <div style={s.stat("#D97706")}>
          <div style={s.statNum}>{[hasGroq, hasGemini, hasGoogle].filter(Boolean).length}/3</div>
          <div style={s.statLabel}>APIs Connected</div>
        </div>
      </div>

      {/* API Key Status */}
      <div style={s.secTitle}>API Status</div>
      <div style={s.keyStatus}>
        <div style={s.keyCard(hasGroq)}>
          <div style={s.keyDot(hasGroq)} />
          <div>
            <div style={s.keyName}>Groq API</div>
            <div style={s.keyState(hasGroq)}>{hasGroq ? "Connected" : "Not connected"}</div>
          </div>
        </div>
        <div style={s.keyCard(hasGemini)}>
          <div style={s.keyDot(hasGemini)} />
          <div>
            <div style={s.keyName}>Gemini API</div>
            <div style={s.keyState(hasGemini)}>{hasGemini ? "Connected" : "Not connected"}</div>
          </div>
        </div>
        <div style={s.keyCard(hasGoogle)}>
          <div style={s.keyDot(hasGoogle)} />
          <div>
            <div style={s.keyName}>Google API</div>
            <div style={s.keyState(hasGoogle)}>{hasGoogle ? "Connected" : "Not connected"}</div>
          </div>
        </div>
      </div>

      {/* Categories */}
      <div style={s.secTitle}>Categories</div>
      <div style={s.grid}>
        {catCounts.map(c => (
          <div key={c.name} style={s.card(c.color)}
            onMouseEnter={e => e.currentTarget.style.borderColor = c.color+"66"}
            onMouseLeave={e => e.currentTarget.style.borderColor = c.color+"33"}>
            <div style={{ fontSize:18, marginBottom:6 }}>
              {c.name==="Content"?"✍️":c.name==="Technical"?"⚙️":c.name==="Research"?"🔍":c.name==="GEO"?"🌐":c.name==="Local"?"📍":c.name==="Backlinks"?"🔗":"🛠️"}
            </div>
            <div style={{ fontSize:13, fontWeight:600, color:"#fff", marginBottom:2 }}>{c.name}</div>
            <div style={{ fontSize:11, color:"#555" }}>{c.count} tools</div>
          </div>
        ))}
      </div>

      {/* All Tools */}
      <div style={s.secTitle}>All Tools — Click to use</div>
      <div style={s.toolGrid}>
        {TOOLS.map(t => (
          <div key={t.id} style={s.toolCard(t.color)}
            onClick={() => onToolSelect(t)}
            onMouseEnter={e => e.currentTarget.style.borderColor = t.color+"55"}
            onMouseLeave={e => e.currentTarget.style.borderColor = "#222"}>
            <div style={s.toolIcon}>{t.icon}</div>
            <div style={s.toolName}>{t.label}</div>
            <div style={s.toolCat(t.color)}>{t.cat}</div>
          </div>
        ))}
      </div>
    </div>
  );
}