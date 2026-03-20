import { useState } from "react";

const TOOLS = [
  { id: "keyword",    icon: "🔍", label: "Keyword Research",    color: "#7C3AED", ph: "Enter topic, niche or URL...",
    prompt: i => `You are an expert SEO keyword research specialist. For: "${i}", provide:
1. 10 primary keywords with search intent (informational/navigational/transactional/commercial)
2. 10 long-tail keyword variations
3. 5 semantic/LSI keywords
4. Keyword difficulty (Low/Medium/High) for each
5. Recommended content angle
Be specific and actionable.` },
  { id: "meta",       icon: "🏷️", label: "Meta Tags Generator",  color: "#2563EB", ph: "Enter page topic or URL...",
    prompt: i => `You are an expert SEO meta tag specialist. For: "${i}", generate:
1. 3 title tag variations (50-60 chars) with primary keyword near front
2. 3 meta description variations (150-160 chars) with CTA
3. 5 focus keywords
4. Open Graph title and description
5. Why each title works
Format clearly with sections.` },
  { id: "onpage",     icon: "📋", label: "On-Page SEO Audit",    color: "#059669", ph: "Paste content or enter URL...",
    prompt: i => `You are an expert on-page SEO auditor. Analyze: "${i}".
1. Overall SEO score (0-100) with reasoning
2. Title tag & heading structure analysis
3. Keyword density & placement advice
4. Content length recommendation
5. Internal linking suggestions
6. Top 5 quick wins to improve ranking
7. Top 3 critical issues to fix immediately
Be specific and actionable.` },
  { id: "content",    icon: "✍️", label: "Content Optimizer",    color: "#D97706", ph: "Paste your content or topic...",
    prompt: i => `You are an expert SEO content strategist. Optimize: "${i}".
1. Readability score & improvements
2. Content gap analysis — what is missing
3. Semantic keyword suggestions to add
4. Recommended full content structure
5. Featured snippet optimization tips
6. E-E-A-T improvement suggestions
7. Word count recommendation
8. 3 content upgrade ideas
Be specific and actionable.` },
  { id: "topic",      icon: "💡", label: "Topic Research",       color: "#CA8A04", ph: "Enter your niche or topic...",
    prompt: i => `You are an expert SEO content strategist. For niche: "${i}":
1. 10 content pillar ideas with search intent
2. 15 SEO-optimized blog post title ideas
3. 5 content cluster topics
4. People Also Ask questions to target
5. Trending angles and content gaps
6. 4-week content calendar
Be specific and actionable.` },
  { id: "competitor", icon: "🏆", label: "Competitor Analysis",  color: "#DC2626", ph: "Enter competitor URL or niche...",
    prompt: i => `You are an expert SEO competitive analyst. For: "${i}":
1. Likely competitor content strategy
2. Content gaps they are missing
3. Keywords they are probably targeting
4. Link building strategies to outrank them
5. Unique differentiation angle
6. 5 quick wins to compete today
7. Best content types to beat them
Be strategic and specific.` },
  { id: "schema",     icon: "🧩", label: "Schema Markup",        color: "#0891B2", ph: "Describe your page or business...",
    prompt: i => `You are an expert structured data specialist. For: "${i}":
1. Recommended schema types and why
2. Complete JSON-LD schema markup (ready to copy-paste)
3. FAQ schema with 5 relevant Q&As
4. Breadcrumb schema example
5. How each schema type boosts SEO
Provide actual working code.` },
  { id: "airank",     icon: "🤖", label: "AI Rank Check",        color: "#7C3AED", ph: "Enter keyword or URL...",
    prompt: i => `You are an expert SEO ranking analyst. For: "${i}":
1. Ranking difficulty score (0-100) with breakdown
2. Top 5 factors affecting ranking
3. Realistic time to reach page 1
4. Content quality requirements for page 1
5. Backlink profile needed
6. SERP features likely to appear
7. 30/60/90 day step-by-step action plan
Be realistic and specific.` },
];

const MODELS = {
  groq:   { name: "Groq",   subtitle: "Fast · Llama 3.1", color: "#F97316" },
  gemini: { name: "Gemini", subtitle: "Smart · Google",   color: "#2563EB" },
};

export default function App() {
  const [tool, setTool]       = useState(TOOLS[0]);
  const [input, setInput]     = useState("");
  const [msgs, setMsgs]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [model, setModel]     = useState("groq");
  const [count, setCount]     = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [groqKey, setGroqKey]     = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [savedKeys, setSavedKeys] = useState({ groq: "", gemini: "" });
  const [sidebarOpen, setSidebarOpen] = useState(true);

  async function run() {
    const q = input.trim();
    if (!q || loading) return;
    const key = model === "groq" ? savedKeys.groq : savedKeys.gemini;
    if (!key) { setShowSettings(true); return; }
    setMsgs(m => [...m, { role: "user", text: q }]);
    setInput("");
    setLoading(true);
    try {
      let text = "";
      if (model === "groq") {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
          body: JSON.stringify({ model: "llama-3.1-8b-instant", max_tokens: 1500,
            messages: [{ role: "user", content: tool.prompt(q) }] })
        });
        const d = await res.json();
        text = d.choices?.[0]?.message?.content || "No response.";
      } else {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: tool.prompt(q) }] }] })
        });
        const d = await res.json();
        text = d.candidates?.[0]?.content?.parts?.[0]?.text || "No response.";
      }
      setMsgs(m => [...m, { role: "assistant", text }]);
      setCount(c => c + 1);
    } catch(e) {
      setMsgs(m => [...m, { role: "assistant", text: "Error: " + e.message }]);
    }
    setLoading(false);
  }

  function saveKeys() {
    setSavedKeys({ groq: groqKey, gemini: geminiKey });
    setShowSettings(false);
  }

  const s = {
    app:     { fontFamily: "Inter, system-ui, sans-serif", display: "flex", height: "100vh", background: "#0f0f0f", color: "#e8e8e8", overflow: "hidden" },
    side:    { width: sidebarOpen ? 220 : 0, minWidth: sidebarOpen ? 220 : 0, background: "#161616", borderRight: "1px solid #2a2a2a", display: "flex", flexDirection: "column", transition: "all 0.2s", overflow: "hidden" },
    logo:    { padding: "16px", borderBottom: "1px solid #2a2a2a", display: "flex", alignItems: "center", gap: 10, whiteSpace: "nowrap" },
    logoBadge: { width: 32, height: 32, borderRadius: 8, background: "#7C3AED", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, color: "#fff", flexShrink: 0 },
    nav:     { flex: 1, overflowY: "auto", padding: "8px" },
    navItem: (active, color) => ({ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, marginBottom: 2, cursor: "pointer", fontSize: 13, fontWeight: active ? 600 : 400, background: active ? color+"22" : "transparent", color: active ? color : "#999", border: active ? `1px solid ${color}44` : "1px solid transparent", whiteSpace: "nowrap", transition: "all 0.15s" }),
    main:    { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 },
    header:  { padding: "12px 20px", borderBottom: "1px solid #2a2a2a", background: "#161616", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexShrink: 0 },
    msgs:    { flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: 14 },
    empty:   { margin: "auto", textAlign: "center", color: "#555", padding: 40 },
    uBubble: { alignSelf: "flex-end", background: "#7C3AED", color: "#fff", padding: "10px 14px", borderRadius: "12px 12px 4px 12px", maxWidth: "75%", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" },
    aBubble: { alignSelf: "flex-start", background: "#1e1e1e", border: "1px solid #2a2a2a", color: "#e8e8e8", padding: "12px 14px", borderRadius: "4px 12px 12px 12px", maxWidth: "85%", fontSize: 13, lineHeight: 1.75, whiteSpace: "pre-wrap" },
    inputArea: { padding: "12px 16px", borderTop: "1px solid #2a2a2a", background: "#161616", flexShrink: 0 },
    inputRow:  { display: "flex", gap: 8 },
    textarea:  { flex: 1, padding: "10px 14px", borderRadius: 10, border: "1px solid #2a2a2a", background: "#1e1e1e", color: "#e8e8e8", fontSize: 13, resize: "none", outline: "none", fontFamily: "inherit", lineHeight: 1.5 },
    sendBtn: (ok) => ({ padding: "0 18px", borderRadius: 10, border: "none", background: ok ? "#7C3AED" : "#2a2a2a", color: ok ? "#fff" : "#555", fontWeight: 600, fontSize: 13, cursor: ok ? "pointer" : "not-allowed", flexShrink: 0 }),
    overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 },
    modal:   { background: "#1e1e1e", border: "1px solid #333", borderRadius: 16, padding: 28, width: 420, maxWidth: "92vw" },
    label:   { fontSize: 12, color: "#888", marginBottom: 4, display: "block" },
    inp:     { width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #333", background: "#161616", color: "#e8e8e8", fontSize: 13, outline: "none", marginBottom: 14, boxSizing: "border-box" },
    saveBtn: { width: "100%", padding: "11px", borderRadius: 8, border: "none", background: "#7C3AED", color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer" },
  };

  return (
    <div style={s.app}>
      {/* Sidebar */}
      <div style={s.side}>
        <div style={s.logo}>
          <div style={s.logoBadge}>S</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>SEO Agent</div>
            <div style={{ fontSize: 11, color: "#555" }}>AI Powered</div>
          </div>
        </div>
        <div style={s.nav}>
          <div style={{ fontSize: 10, color: "#444", padding: "10px 10px 4px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Tools</div>
          {TOOLS.map(t => (
            <div key={t.id} style={s.navItem(tool.id === t.id, t.color)} onClick={() => { setTool(t); setMsgs([]); }}>
              <span style={{ fontSize: 15 }}>{t.icon}</span>
              <span>{t.label}</span>
            </div>
          ))}
        </div>
        <div style={{ padding: 10, borderTop: "1px solid #2a2a2a" }}>
          <div onClick={() => setShowSettings(true)} style={{ padding: "8px 10px", borderRadius: 8, cursor: "pointer", fontSize: 13, color: "#666", display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
            ⚙️ <span>Settings & Keys</span>
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={s.main}>
        {/* Header */}
        <div style={s.header}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => setSidebarOpen(o => !o)} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 18, padding: "2px 6px" }}>☰</button>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: "#fff" }}>{tool.icon} {tool.label}</div>
              <div style={{ fontSize: 11, color: "#555" }}>{count} analyses this session</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {Object.entries(MODELS).map(([k, v]) => (
              <div key={k} onClick={() => setModel(k)} style={{ padding: "5px 12px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontWeight: model === k ? 600 : 400, background: model === k ? v.color+"22" : "transparent", color: model === k ? v.color : "#555", border: `1px solid ${model === k ? v.color+"55" : "#2a2a2a"}`, whiteSpace: "nowrap" }}>
                {v.name}
              </div>
            ))}
            <div onClick={() => setShowSettings(true)} style={{ padding: "5px 10px", borderRadius: 20, cursor: "pointer", fontSize: 12, color: "#555", border: "1px solid #2a2a2a" }}>⚙️</div>
          </div>
        </div>

        {/* Messages */}
        <div style={s.msgs}>
          {msgs.length === 0 && (
            <div style={s.empty}>
              <div style={{ fontSize: 42, marginBottom: 14 }}>{tool.icon}</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#ccc", marginBottom: 8 }}>{tool.label}</div>
              <div style={{ fontSize: 13, color: "#555", marginBottom: 24 }}>{tool.ph}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                {["digital marketing", "e-commerce store", "SaaS tool", "local restaurant"].map(ex => (
                  <div key={ex} onClick={() => setInput(ex)} style={{ padding: "6px 14px", borderRadius: 20, border: "1px solid #2a2a2a", color: "#666", fontSize: 12, cursor: "pointer" }}>{ex}</div>
                ))}
              </div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} style={m.role === "user" ? s.uBubble : s.aBubble}>{m.text}</div>
          ))}
          {loading && (
            <div style={{ ...s.aBubble, color: "#555" }}>
              Analyzing with {MODELS[model].name}...
            </div>
          )}
        </div>

        {/* Input */}
        <div style={s.inputArea}>
          <div style={s.inputRow}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); run(); } }}
              placeholder={tool.ph}
              rows={2}
              style={s.textarea}
            />
            <button onClick={run} disabled={loading || !input.trim()} style={s.sendBtn(!loading && !!input.trim())}>
              {loading ? "..." : "Run ▶"}
            </button>
          </div>
          <div style={{ fontSize: 11, color: "#333", marginTop: 6 }}>
            Enter to run · Shift+Enter for new line · Model: {MODELS[model].name}
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div style={s.overlay} onClick={() => setShowSettings(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 17, color: "#fff", marginBottom: 4 }}>⚙️ API Keys</div>
            <div style={{ fontSize: 12, color: "#555", marginBottom: 20 }}>Keys are saved in browser memory only — never stored anywhere</div>
            <label style={s.label}>Groq API Key (gsk_...)</label>
            <input type="password" value={groqKey} onChange={e => setGroqKey(e.target.value)} placeholder="gsk_xxxxxxxxxxxx" style={s.inp} />
            <label style={s.label}>Gemini API Key (AIza...)</label>
            <input type="password" value={geminiKey} onChange={e => setGeminiKey(e.target.value)} placeholder="AIzaxxxxxxxxxx" style={s.inp} />
            <button onClick={saveKeys} style={s.saveBtn}>Save & Close</button>
            <div style={{ fontSize: 11, color: "#444", marginTop: 12, textAlign: "center" }}>
              Groq: console.groq.com · Gemini: aistudio.google.com
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
