import { useState } from "react";

const TOOLS = [
  { id: "keyword",    icon: "🔍", label: "Keyword Research",       color: "#7C3AED", cat: "Content", ph: "Enter topic, niche or URL...",
    prompt: i => `You are an expert SEO keyword research specialist. For: "${i}", provide:
1. 10 primary keywords with search intent (informational/navigational/transactional/commercial)
2. 10 long-tail keyword variations
3. 5 semantic/LSI keywords
4. Keyword difficulty (Low/Medium/High) for each
5. Recommended content angle
Be specific and actionable.` },

  { id: "cluster",    icon: "🗂️", label: "Keyword Clustering",      color: "#6D28D9", cat: "Content", ph: "Enter topic or keyword list...",
    prompt: i => `You are an expert SEO topical authority specialist. For: "${i}", provide:
1. Group keywords into 5-7 topical clusters with cluster names
2. For each cluster: 5-8 related keywords
3. Pillar page recommendation for each cluster
4. Content hierarchy (pillar → supporting pages)
5. Internal linking strategy between clusters
6. Which cluster to target first and why
Be specific and actionable.` },

  { id: "brief",      icon: "📝", label: "Content Brief",            color: "#2563EB", cat: "Content", ph: "Enter target keyword or topic...",
    prompt: i => `You are an expert SEO content strategist. Create a detailed content brief for: "${i}".
Include:
1. Target keyword + secondary keywords (10)
2. Search intent analysis
3. Recommended title (3 variations)
4. Meta description (2 variations)
5. Full article outline (H1, H2, H3 structure)
6. NLP/semantic terms to include (15 terms)
7. Competitor content gaps to fill
8. Word count recommendation
9. Internal linking opportunities
10. E-E-A-T signals to include
Be detailed and ready to use.` },

  { id: "blog",       icon: "✍️", label: "Auto Blog Generator",      color: "#0891B2", cat: "Content", ph: "Enter topic or keyword...",
    prompt: i => `You are an expert SEO content writer. Write a complete, publish-ready SEO blog post for: "${i}".
Structure:
1. SEO-optimized H1 title
2. Meta description (155 chars)
3. Introduction (hook + keyword naturally placed)
4. 5-7 H2 sections with detailed content
5. H3 subsections where needed
6. Natural keyword integration throughout
7. FAQ section (5 Q&As)
8. Conclusion with CTA
Requirements: E-E-A-T optimized, conversational tone, 1500+ words equivalent outline, ready to publish.` },

  { id: "internal",   icon: "🔗", label: "Internal Linking",         color: "#059669", cat: "Content", ph: "Describe your website + page...",
    prompt: i => `You are an expert SEO internal linking specialist. For: "${i}", provide:
1. Internal linking strategy overview
2. Hub pages to create (topic clusters)
3. 10 specific internal link suggestions with anchor text
4. Link equity flow diagram (in text)
5. Orphan page identification advice
6. Silo structure recommendation
7. Priority pages to link to/from
8. Anchor text diversity guidelines
Be specific with actual page/URL examples.` },

  { id: "meta",       icon: "🏷️", label: "Meta Tags Generator",      color: "#1D4ED8", cat: "Technical", ph: "Enter page topic or URL...",
    prompt: i => `You are an expert SEO meta tag specialist. For: "${i}", generate:
1. 3 title tag variations (50-60 chars) with primary keyword near front
2. 3 meta description variations (150-160 chars) with CTA
3. 5 focus keywords
4. Open Graph title and description
5. Twitter Card meta tags
6. Why each title works
Format clearly with sections.` },

  { id: "onpage",     icon: "📋", label: "On-Page SEO Audit",        color: "#047857", cat: "Technical", ph: "Paste content or enter URL...",
    prompt: i => `You are an expert on-page SEO auditor. Analyze: "${i}".
1. Overall SEO score (0-100) with reasoning
2. Title tag & heading structure analysis
3. Keyword density & placement advice
4. Content length recommendation
5. Internal linking suggestions
6. Top 5 quick wins to improve ranking
7. Top 3 critical issues to fix immediately
Be specific and actionable.` },

  { id: "schema",     icon: "🧩", label: "Schema Markup",            color: "#0369A1", cat: "Technical", ph: "Describe your page or business...",
    prompt: i => `You are an expert structured data specialist. For: "${i}":
1. Recommended schema types and why
2. Complete JSON-LD schema markup (ready to copy-paste)
3. FAQ schema with 5 relevant Q&As
4. Breadcrumb schema example
5. How each schema type boosts SEO
Provide actual working code.` },

  { id: "competitor", icon: "🏆", label: "Competitor Analysis",      color: "#DC2626", cat: "Research", ph: "Enter competitor URL or niche...",
    prompt: i => `You are an expert SEO competitive analyst. For: "${i}":
1. Likely competitor content strategy
2. Content gaps they are missing
3. Keywords they are probably targeting
4. Link building strategies to outrank them
5. Unique differentiation angle
6. 5 quick wins to compete today
7. Best content types to beat them
Be strategic and specific.` },

  { id: "topic",      icon: "💡", label: "Topic Research",           color: "#CA8A04", cat: "Research", ph: "Enter your niche or topic...",
    prompt: i => `You are an expert SEO content strategist. For niche: "${i}":
1. 10 content pillar ideas with search intent
2. 15 SEO-optimized blog post title ideas
3. 5 content cluster topics
4. People Also Ask questions to target
5. Trending angles and content gaps
6. 4-week content calendar
Be specific and actionable.` },

  { id: "airank",     icon: "🤖", label: "AI Rank Check",            color: "#7C3AED", cat: "Research", ph: "Enter keyword or URL...",
    prompt: i => `You are an expert SEO ranking analyst. For: "${i}":
1. Ranking difficulty score (0-100) with breakdown
2. Top 5 factors affecting ranking
3. Realistic time to reach page 1
4. Content quality requirements for page 1
5. Backlink profile needed
6. SERP features likely to appear
7. 30/60/90 day step-by-step action plan
Be realistic and specific.` },

  { id: "geo",        icon: "🌐", label: "GEO — AI Visibility",      color: "#0F766E", cat: "GEO", ph: "Enter brand name or topic...",
    prompt: i => `You are an expert in Generative Engine Optimization (GEO) for 2026. For: "${i}", provide:
1. AI Search Visibility Score (0-100) estimate
2. How to appear in ChatGPT answers for this topic
3. How to appear in Google Gemini responses
4. How to appear in Perplexity citations
5. Content structure for AI citations (E-E-A-T signals)
6. Structured answer formatting recommendations
7. Entity building strategy for AI visibility
8. Top 10 prompts users ask AI about this topic
9. How to optimize content for each prompt
10. 30-day GEO action plan
This is cutting-edge 2026 SEO — be specific and forward-thinking.` },

  { id: "geoprompt",  icon: "💬", label: "Prompt Optimizer",         color: "#0D9488", cat: "GEO", ph: "Enter your content topic...",
    prompt: i => `You are an expert in AI prompt optimization for GEO (Generative Engine Optimization). For: "${i}":
1. List 15 prompts users ask ChatGPT/Gemini/Perplexity about this topic
2. For each prompt: how to optimize your content to be cited
3. Answer format recommendations (lists vs paragraphs vs tables)
4. Authority signals to include
5. Source credibility factors for AI citation
6. Content structure that AI models prefer
7. Example optimized content snippet for top 3 prompts
This is the future of SEO — be specific.` },

  { id: "pagespeed",  icon: "⚡", label: "Page Speed Analyzer",      color: "#D97706", cat: "Tools", ph: "Enter full URL (https://...)...",
    isApi: true, apiType: "pagespeed" },

  { id: "backlink",   icon: "🔗", label: "Backlink AI Analyzer",     color: "#B45309", cat: "Tools", ph: "Enter domain or URL...",
    prompt: i => `You are an expert backlink and link building specialist. For: "${i}":
1. Link building strategy overview
2. 15 specific backlink opportunity types for this niche
3. Guest posting targets (types of sites to approach)
4. Broken link building opportunities
5. Resource page link building approach
6. AI-generated outreach email template
7. Link quality criteria to follow
8. Toxic link warning signs
9. 60-day link building action plan
10. Expected domain authority growth timeline
Be specific and actionable.` },

  { id: "outreach",   icon: "📧", label: "Outreach Email Generator", color: "#92400E", cat: "Tools", ph: "Enter target site + your content...",
    prompt: i => `You are an expert link building outreach specialist. For: "${i}":
Generate 3 different outreach email templates:
1. Guest post pitch (personalized, value-first)
2. Broken link replacement pitch
3. Resource/roundup inclusion pitch
For each email:
- Subject line (3 variations)
- Full email body (personalized, not spammy)
- Follow-up email (1 week later)
Keep it natural, human, and conversion-focused.` },
];

const CATS = ["All", "Content", "Technical", "Research", "GEO", "Tools"];
const MODELS = {
  groq:   { name: "Groq",   color: "#F97316", api: "groq" },
  gemini: { name: "Gemini", color: "#2563EB", api: "gemini" },
};

export default function App() {
  const [tool, setTool]       = useState(TOOLS[0]);
  const [input, setInput]     = useState("");
  const [msgs, setMsgs]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [model, setModel]     = useState("groq");
  const [count, setCount]     = useState(0);
  const [cat, setCat]         = useState("All");
  const [showSettings, setShowSettings] = useState(false);
  const [sideOpen, setSideOpen] = useState(true);
  const [keys, setKeys]       = useState({ groq: "", gemini: "", google: "" });
  const [tmpKeys, setTmpKeys] = useState({ groq: "", gemini: "", google: "" });

  const filtered = cat === "All" ? TOOLS : TOOLS.filter(t => t.cat === cat);

  async function runPageSpeed(url) {
    if (!keys.google) { alert("Google API key needed! Add in Settings."); return; }
    setLoading(true);
    setMsgs(m => [...m, { role: "user", text: url }]);
    try {
      const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${keys.google}&strategy=mobile`);
      const d = await res.json();
      const cats = d.lighthouseResult?.categories;
      const perf  = Math.round((cats?.performance?.score || 0) * 100);
      const seo   = Math.round((cats?.seo?.score || 0) * 100);
      const acc   = Math.round((cats?.accessibility?.score || 0) * 100);
      const bp    = Math.round((cats?.["best-practices"]?.score || 0) * 100);
      const lcp   = d.lighthouseResult?.audits?.["largest-contentful-paint"]?.displayValue || "N/A";
      const fid   = d.lighthouseResult?.audits?.["total-blocking-time"]?.displayValue || "N/A";
      const cls   = d.lighthouseResult?.audits?.["cumulative-layout-shift"]?.displayValue || "N/A";
      const fcp   = d.lighthouseResult?.audits?.["first-contentful-paint"]?.displayValue || "N/A";
      const text = `📊 PAGE SPEED REPORT
━━━━━━━━━━━━━━━━━━━━
URL: ${url}

SCORES (Mobile)
⚡ Performance:   ${perf}/100  ${perf >= 90 ? "✅ Good" : perf >= 50 ? "⚠️ Needs Work" : "❌ Poor"}
🔍 SEO:          ${seo}/100  ${seo >= 90 ? "✅ Good" : seo >= 50 ? "⚠️ Needs Work" : "❌ Poor"}
♿ Accessibility: ${acc}/100  ${acc >= 90 ? "✅ Good" : acc >= 50 ? "⚠️ Needs Work" : "❌ Poor"}
✨ Best Practices: ${bp}/100  ${bp >= 90 ? "✅ Good" : bp >= 50 ? "⚠️ Needs Work" : "❌ Poor"}

CORE WEB VITALS
🎯 LCP (Load):   ${lcp}
⏱️ TBT (Input):  ${fid}
📐 CLS (Visual): ${cls}
🎨 FCP (Paint):  ${fcp}

${perf < 50 ? "❌ CRITICAL: Performance score is very low. Major optimization needed!" : perf < 90 ? "⚠️ Performance can be improved. Check image sizes and unused JS." : "✅ Great performance! Keep it up."}`;
      setMsgs(m => [...m, { role: "assistant", text }]);
      setCount(c => c + 1);
    } catch(e) {
      setMsgs(m => [...m, { role: "assistant", text: "Error: " + e.message }]);
    }
    setLoading(false);
    setInput("");
  }

  async function run() {
    const q = input.trim();
    if (!q || loading) return;
    if (tool.isApi && tool.apiType === "pagespeed") { runPageSpeed(q); return; }
    const key = model === "groq" ? keys.groq : keys.gemini;
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
          body: JSON.stringify({ model: "llama-3.1-8b-instant", max_tokens: 2000,
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
    setKeys(tmpKeys);
    setShowSettings(false);
  }

  const s = {
    app:    { fontFamily: "Inter, system-ui, sans-serif", display: "flex", height: "100vh", background: "#0a0a0a", color: "#e8e8e8", overflow: "hidden" },
    side:   { width: sideOpen ? 240 : 0, minWidth: sideOpen ? 240 : 0, background: "#111", borderRight: "1px solid #222", display: "flex", flexDirection: "column", transition: "all 0.2s", overflow: "hidden", flexShrink: 0 },
    logo:   { padding: "16px", borderBottom: "1px solid #222", display: "flex", alignItems: "center", gap: 10 },
    logoBadge: { width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg,#7C3AED,#2563EB)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, color: "#fff", flexShrink: 0 },
    nav:    { flex: 1, overflowY: "auto", padding: "8px 6px" },
    catRow: { display: "flex", flexWrap: "wrap", gap: 4, padding: "8px 6px 4px" },
    catBtn: (active) => ({ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: active ? 600 : 400, cursor: "pointer", border: "1px solid", background: active ? "#7C3AED22" : "transparent", color: active ? "#A78BFA" : "#555", borderColor: active ? "#7C3AED44" : "#222" }),
    navItem:(active, color) => ({ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 8, marginBottom: 1, cursor: "pointer", fontSize: 12, fontWeight: active ? 600 : 400, background: active ? color+"22" : "transparent", color: active ? color : "#777", border: active ? `1px solid ${color}33` : "1px solid transparent", whiteSpace: "nowrap", transition: "all 0.1s" }),
    catLabel: { fontSize: 10, color: "#333", padding: "8px 10px 3px", textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" },
    main:   { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 },
    header: { padding: "10px 16px", borderBottom: "1px solid #222", background: "#111", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexShrink: 0 },
    msgs:   { flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: 14 },
    uBubble:{ alignSelf: "flex-end", background: "#7C3AED", color: "#fff", padding: "10px 14px", borderRadius: "12px 12px 4px 12px", maxWidth: "75%", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" },
    aBubble:{ alignSelf: "flex-start", background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#e8e8e8", padding: "12px 14px", borderRadius: "4px 12px 12px 12px", maxWidth: "88%", fontSize: 13, lineHeight: 1.75, whiteSpace: "pre-wrap" },
    inputArea: { padding: "12px 16px", borderTop: "1px solid #222", background: "#111", flexShrink: 0 },
    textarea:  { flex: 1, padding: "10px 14px", borderRadius: 10, border: "1px solid #2a2a2a", background: "#1a1a1a", color: "#e8e8e8", fontSize: 13, resize: "none", outline: "none", fontFamily: "inherit", lineHeight: 1.5 },
    sendBtn:(ok) => ({ padding: "0 18px", borderRadius: 10, border: "none", background: ok ? "#7C3AED" : "#222", color: ok ? "#fff" : "#444", fontWeight: 600, fontSize: 13, cursor: ok ? "pointer" : "not-allowed", flexShrink: 0, minWidth: 64 }),
    overlay:{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 },
    modal:  { background: "#1a1a1a", border: "1px solid #333", borderRadius: 16, padding: 28, width: 440, maxWidth: "92vw" },
    label:  { fontSize: 12, color: "#888", marginBottom: 4, display: "block" },
    inp:    { width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#e8e8e8", fontSize: 13, outline: "none", marginBottom: 14, boxSizing: "border-box" },
    saveBtn:{ width: "100%", padding: "11px", borderRadius: 8, border: "none", background: "#7C3AED", color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer" },
  };

  const cats = [...new Set(TOOLS.map(t => t.cat))];

  return (
    <div style={s.app}>
      <div style={s.side}>
        <div style={s.logo}>
          <div style={s.logoBadge}>S</div>
          <div><div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>SEO Agent</div><div style={{ fontSize: 10, color: "#444" }}>v2.0 · AI Powered</div></div>
        </div>
        <div style={s.nav}>
          <div style={s.catRow}>
            {CATS.map(c => <div key={c} style={s.catBtn(cat===c)} onClick={() => setCat(c)}>{c}</div>)}
          </div>
          {cats.filter(c => cat === "All" || c === cat).map(c => (
            <div key={c}>
              <div style={s.catLabel}>{c}</div>
              {filtered.filter(t => t.cat === c).map(t => (
                <div key={t.id} style={s.navItem(tool.id===t.id, t.color)} onClick={() => { setTool(t); setMsgs([]); }}>
                  <span style={{ fontSize: 14 }}>{t.icon}</span>
                  <span>{t.label}</span>
                  {t.isApi && <span style={{ fontSize: 9, background: "#1a3a2a", color: "#4ade80", padding: "1px 5px", borderRadius: 4, marginLeft: "auto" }}>API</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ padding: "8px", borderTop: "1px solid #222" }}>
          <div onClick={() => setShowSettings(true)} style={{ padding: "8px 10px", borderRadius: 8, cursor: "pointer", fontSize: 12, color: "#555", display: "flex", alignItems: "center", gap: 8 }}>
            ⚙️ <span>Settings & API Keys</span>
          </div>
        </div>
      </div>

      <div style={s.main}>
        <div style={s.header}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => setSideOpen(o => !o)} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 18, padding: "2px 4px" }}>☰</button>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#fff" }}>{tool.icon} {tool.label}</div>
              <div style={{ fontSize: 10, color: "#444" }}>{count} analyses · {tool.cat}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {!tool.isApi && Object.entries(MODELS).map(([k, v]) => (
              <div key={k} onClick={() => setModel(k)} style={{ padding: "4px 12px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontWeight: model===k ? 700 : 400, background: model===k ? v.color+"22" : "transparent", color: model===k ? v.color : "#444", border: `1px solid ${model===k ? v.color+"55" : "#222"}` }}>
                {v.name}
              </div>
            ))}
            <div onClick={() => setShowSettings(true)} style={{ padding: "4px 10px", borderRadius: 20, cursor: "pointer", fontSize: 12, color: "#444", border: "1px solid #222" }}>⚙️</div>
          </div>
        </div>

        <div style={s.msgs}>
          {msgs.length === 0 && (
            <div style={{ margin: "auto", textAlign: "center", color: "#333", padding: 40 }}>
              <div style={{ fontSize: 44, marginBottom: 14 }}>{tool.icon}</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#ccc", marginBottom: 8 }}>{tool.label}</div>
              <div style={{ fontSize: 13, color: "#444", marginBottom: 6 }}>{tool.ph}</div>
              {tool.cat === "GEO" && <div style={{ fontSize: 11, color: "#0F766E", background: "#0F766E11", border: "1px solid #0F766E33", borderRadius: 8, padding: "6px 14px", display: "inline-block", marginBottom: 16 }}>🌐 2026 Feature — AI Search Visibility</div>}
              {tool.isApi && <div style={{ fontSize: 11, color: "#D97706", background: "#D9770611", border: "1px solid #D9770633", borderRadius: 8, padding: "6px 14px", display: "inline-block", marginBottom: 16 }}>⚡ Requires Google API Key in Settings</div>}
            </div>
          )}
          {msgs.map((m, i) => <div key={i} style={m.role==="user" ? s.uBubble : s.aBubble}>{m.text}</div>)}
          {loading && <div style={{ ...s.aBubble, color: "#444" }}>Analyzing{tool.isApi ? " with Google API" : ` with ${MODELS[model]?.name}`}...</div>}
        </div>

        <div style={s.inputArea}>
          <div style={{ display: "flex", gap: 8 }}>
            <textarea value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();run();} }}
              placeholder={tool.ph} rows={2} style={s.textarea} />
            <button onClick={run} disabled={loading||!input.trim()} style={s.sendBtn(!loading&&!!input.trim())}>
              {loading ? "..." : "Run ▶"}
            </button>
          </div>
          <div style={{ fontSize: 11, color: "#333", marginTop: 5 }}>Enter to run · Shift+Enter new line · {tool.isApi ? "Google API" : `Model: ${MODELS[model]?.name}`} · {TOOLS.length} tools total</div>
        </div>
      </div>

      {showSettings && (
        <div style={s.overlay} onClick={() => setShowSettings(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 17, color: "#fff", marginBottom: 4 }}>⚙️ API Keys</div>
            <div style={{ fontSize: 12, color: "#555", marginBottom: 20 }}>Stored in browser memory only</div>
            <label style={s.label}>Groq API Key (gsk_...)</label>
            <input type="password" value={tmpKeys.groq} onChange={e => setTmpKeys(k=>({...k,groq:e.target.value}))} placeholder="gsk_xxxxxxxxxxxx" style={s.inp} />
            <label style={s.label}>Gemini API Key (AIza...)</label>
            <input type="password" value={tmpKeys.gemini} onChange={e => setTmpKeys(k=>({...k,gemini:e.target.value}))} placeholder="AIzaxxxxxxxxxx" style={s.inp} />
            <label style={s.label}>Google APIs Key (AIza...) — for PageSpeed</label>
            <input type="password" value={tmpKeys.google} onChange={e => setTmpKeys(k=>({...k,google:e.target.value}))} placeholder="AIzaxxxxxxxxxx" style={s.inp} />
            <button onClick={saveKeys} style={s.saveBtn}>Save & Close</button>
            <div style={{ fontSize: 11, color: "#333", marginTop: 10, textAlign: "center" }}>Groq: console.groq.com · Gemini: aistudio.google.com · Google: console.cloud.google.com</div>
          </div>
        </div>
      )}
    </div>
  );
}
