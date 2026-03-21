import { useState } from "react";

const AI_FEATURES = [
  { id:"overview",  icon:"🔵", name:"Google AI Overview",    color:"#4285F4", desc:"AI-generated summaries above search results" },
  { id:"aimode",    icon:"🤖", name:"Google AI Mode",        color:"#DB4437", desc:"Full AI-powered search experience" },
  { id:"sge",       icon:"✨", name:"Search Generative Exp.", color:"#0F9D58", desc:"Google's generative search experience" },
  { id:"featured",  icon:"⭐", name:"Featured Snippets",     color:"#F4B400", desc:"Position zero rich results" },
  { id:"knowledge", icon:"🧠", name:"Knowledge Panel",       color:"#7C3AED", desc:"Entity knowledge cards" },
  { id:"paa",       icon:"❓", name:"People Also Ask",       color:"#0891B2", desc:"Expandable question boxes" },
];

const QUERY_INTENTS = [
  { id:"informational", label:"Informational", icon:"📚", color:"#0891B2", desc:"How, What, Why questions" },
  { id:"transactional", label:"Transactional",  icon:"🛒", color:"#059669", desc:"Buy, Get, Download" },
  { id:"navigational",  label:"Navigational",   icon:"🧭", color:"#D97706", desc:"Brand/site searches" },
  { id:"commercial",    label:"Commercial",      icon:"💼", color:"#7C3AED", desc:"Best, Top, Compare" },
  { id:"local",         label:"Local",           icon:"📍", color:"#DC2626", desc:"Near me, location-based" },
];

export default function AIMode({ dark, keys, model }) {
  const [topic, setTopic]           = useState("");
  const [content, setContent]       = useState("");
  const [activeTab, setActiveTab]   = useState("optimizer");
  const [selectedFeatures, setSelectedFeatures] = useState(["overview","aimode","featured","paa"]);
  const [queryIntent, setQueryIntent] = useState("informational");
  const [loading, setLoading]       = useState(false);
  const [results, setResults]       = useState(null);
  const [trackerResults, setTrackerResults] = useState([]);
  const [trackerLoading, setTrackerLoading] = useState(false);
  const [trackerKeywords, setTrackerKeywords] = useState("");
  const [contentLoading, setContentLoading] = useState(false);
  const [generatedContent, setGeneratedContent] = useState("");
  const [copied, setCopied]         = useState(null);

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const txt3 = dark ? "#444"    : "#bbb";

  async function callAI(prompt) {
    const key = model === "groq" ? keys?.groq : keys?.gemini;
    if (!key) return null;
    if (model === "groq") {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method:"POST",
        headers:{ "Content-Type":"application/json", "Authorization":`Bearer ${key}` },
        body: JSON.stringify({ model:"llama-3.1-8b-instant", max_tokens:2500, messages:[{ role:"user", content:prompt }] })
      });
      const d = await res.json();
      return d.choices?.[0]?.message?.content || null;
    } else {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${keys?.gemini}`, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ contents:[{ parts:[{ text:prompt }] }] })
      });
      const d = await res.json();
      return d.candidates?.[0]?.content?.parts?.[0]?.text || null;
    }
  }

  async function runOptimizer() {
    if (!topic.trim()) return;
    setLoading(true); setResults(null);

    const prompt = `You are a Google AI Mode and AI Overview optimization expert for 2026.

Topic: "${topic}"
Query Intent: ${queryIntent}
Target Features: ${selectedFeatures.join(", ")}
${content ? `Existing Content:\n${content.slice(0,1500)}` : ""}

Provide comprehensive Google AI Mode optimization:

AI_OVERVIEW_SCORE: [0-100]
FEATURED_SNIPPET_CHANCE: [0-100]
PAA_COVERAGE: [0-100]
OVERALL_VISIBILITY_SCORE: [0-100]

CURRENT_GAPS:
What's missing that prevents appearing in Google AI Mode/Overview

AI_OVERVIEW_OPTIMIZATION:
How to optimize specifically for Google AI Overview:
- Content structure needed
- Answer format required
- Length and depth requirements
- Authority signals needed

AI_MODE_STRATEGY:
How Google AI Mode works and how to rank in it:
- Query processing in AI Mode
- Source selection criteria
- Multi-step query handling
- Conversation context signals

FEATURED_SNIPPET_OPTIMIZATION:
- Exact format needed for this query
- Optimal answer length (X words)
- Best content structure
- Sample optimized paragraph

PAA_QUESTIONS:
10 People Also Ask questions for "${topic}" with optimized answers (40-60 words each)

CONTENT_BLUEPRINT:
Complete content structure blueprint optimized for AI Mode:
- H1 title
- Meta description (AI-friendly)
- Introduction format
- Section structure
- FAQ section
- Conclusion format

TECHNICAL_REQUIREMENTS:
Schema markup and technical setup needed

E_E_A_T_CHECKLIST:
Specific E-E-A-T signals to add for AI Mode

ACTION_PLAN:
7 prioritized actions to appear in Google AI Mode (ranked by impact)`;

    const text = await callAI(prompt);
    if (text) {
      const get = (k) => { const m = text.match(new RegExp(`${k}:\\s*(.+)`)); return m?m[1].trim():"N/A"; };
      setResults({
        raw: text,
        aiScore:      parseInt(get("AI_OVERVIEW_SCORE"))       || 0,
        snippetChance:parseInt(get("FEATURED_SNIPPET_CHANCE")) || 0,
        paaScore:     parseInt(get("PAA_COVERAGE"))            || 0,
        overallScore: parseInt(get("OVERALL_VISIBILITY_SCORE"))|| 0,
      });
    }
    setLoading(false);
  }

  async function runTracker() {
    const kws = trackerKeywords.split("\n").map(k=>k.trim()).filter(Boolean);
    if (!kws.length) return;
    setTrackerLoading(true); setTrackerResults([]);

    for (const kw of kws.slice(0,10)) {
      const prompt = `Analyze this keyword for Google AI Mode visibility in 2026:

Keyword: "${kw}"

Respond EXACTLY in this format:
AI_OVERVIEW: [yes/no/maybe] - chance of triggering AI Overview
FEATURED_SNIPPET: [yes/no/maybe]
PAA_BOXES: [yes/no/maybe]
KNOWLEDGE_PANEL: [yes/no/maybe]
AI_MODE_INTENT: [informational/transactional/commercial/navigational]
DIFFICULTY: [0-100]
OPPORTUNITY: [High/Medium/Low]
CONTENT_FORMAT: [best format - article/faq/howto/list/comparison]
QUICK_TIP: [one specific tip to appear in AI results for this keyword]`;

      const text = await callAI(prompt);
      if (text) {
        const get = (k) => { const m = text.match(new RegExp(`${k}:\\s*(.+)`)); return m?m[1].trim():"N/A"; };
        setTrackerResults(r => [...r, {
          keyword:       kw,
          aiOverview:    get("AI_OVERVIEW"),
          featuredSnippet:get("FEATURED_SNIPPET"),
          paaBoxes:      get("PAA_BOXES"),
          knowledgePanel:get("KNOWLEDGE_PANEL"),
          intent:        get("AI_MODE_INTENT"),
          difficulty:    get("DIFFICULTY"),
          opportunity:   get("OPPORTUNITY"),
          format:        get("CONTENT_FORMAT"),
          tip:           get("QUICK_TIP"),
        }]);
      }
    }
    setTrackerLoading(false);
  }

  async function generateAIModeContent() {
    if (!topic.trim()) return;
    setContentLoading(true); setGeneratedContent("");

    const prompt = `You are an expert content writer for Google AI Mode and AI Overview optimization in 2026.

Topic: "${topic}"
Query Intent: ${queryIntent}

Write complete, publish-ready content optimized for Google AI Mode:

Requirements:
- Direct answer in FIRST sentence (under 40 words)
- Clear H2 and H3 structure
- Every section starts with a direct answer
- Include statistics and facts
- FAQ section with 8 questions (40-60 words each answer)
- E-E-A-T signals throughout
- Schema-ready FAQ format
- Conversational but authoritative tone
- 1500+ words total

Structure:
1. AI-optimized title (includes primary keyword)
2. Meta description (155 chars, includes keyword)
3. Direct answer paragraph (first 40 words answer the query)
4. 5-6 main sections with H2 headings
5. Key statistics/data section
6. Expert tip boxes
7. FAQ section (8 Q&As)
8. Conclusion with clear takeaway

Write the complete article now. Make it ready to publish.`;

    const text = await callAI(prompt);
    setGeneratedContent(text || "");
    setContentLoading(false);
  }

  function copyText(text, id) {
    navigator.clipboard.writeText(text);
    setCopied(id); setTimeout(()=>setCopied(null),2000);
  }

  function exportPDF(content2, title2) {
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title2}</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;color:#333;line-height:1.8;}
h1{color:#4285F4;}pre{white-space:pre-wrap;font-size:13px;line-height:1.8;}
.footer{margin-top:30px;text-align:center;font-size:11px;color:#888;border-top:1px solid #eee;padding-top:16px;}
</style></head><body>
<h1>🤖 ${title2}</h1>
<p><strong>Topic:</strong> ${topic} · <strong>Generated:</strong> ${new Date().toLocaleDateString()}</p>
<pre>${content2.replace(/</g,"&lt;")}</pre>
<div class="footer">Generated by SEO Agent AI Mode Dashboard</div>
</body></html>`;
    const win = window.open("","_blank","width=900,height=700");
    win.document.write(html); win.document.close();
    win.onload = ()=>setTimeout(()=>win.print(),500);
  }

  function exportTrackerCSV() {
    if (!trackerResults.length) return;
    const rows = ["Keyword,AI Overview,Featured Snippet,PAA,Knowledge Panel,Intent,Difficulty,Opportunity,Best Format,Quick Tip"];
    trackerResults.forEach(r => rows.push(`"${r.keyword}","${r.aiOverview}","${r.featuredSnippet}","${r.paaBoxes}","${r.knowledgePanel}","${r.intent}","${r.difficulty}","${r.opportunity}","${r.format}","${r.tip}"`));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rows.join("\n")],{type:"text/csv"}));
    a.download = "ai-mode-tracker.csv"; a.click();
  }

  const scoreColor = s => s>=75?"#059669":s>=50?"#D97706":"#DC2626";
  const yesColor   = v => v?.toLowerCase().includes("yes")?"#059669":v?.toLowerCase().includes("maybe")?"#D97706":"#DC2626";
  const yesIcon    = v => v?.toLowerCase().includes("yes")?"✅":v?.toLowerCase().includes("maybe")?"⚠️":"❌";
  const oppColor   = o => o==="High"?"#059669":o==="Medium"?"#D97706":"#888";
  const tabStyle   = (a, color="#4285F4") => ({ padding:"7px 16px", borderRadius:20, fontSize:12, cursor:"pointer", fontWeight:a?600:400, background:a?color+"22":"transparent", color:a?color:txt2, border:`1px solid ${a?color+"44":bdr}`, whiteSpace:"nowrap" });

  return (
    <div style={{ flex:1, overflowY:"auto", padding:24, background:bg }}>
      <div style={{ maxWidth:1000, margin:"0 auto" }}>
        <div style={{ fontSize:18, fontWeight:700, color:txt, marginBottom:4 }}>🤖 Google AI Mode Optimizer</div>
        <div style={{ fontSize:13, color:txt2, marginBottom:20 }}>Optimize for Google AI Overview · AI Mode · Featured Snippets · PAA · Knowledge Panel</div>

        {/* Feature Cards */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:20 }}>
          {AI_FEATURES.slice(0,6).map(f => (
            <div key={f.id} onClick={()=>setSelectedFeatures(s=>s.includes(f.id)?s.filter(x=>x!==f.id):[...s,f.id])}
              style={{ background:bg2, border:`1px solid ${selectedFeatures.includes(f.id)?f.color+"44":bdr}`, borderRadius:10, padding:"12px 14px", cursor:"pointer", borderLeft:`3px solid ${selectedFeatures.includes(f.id)?f.color:bdr}` }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                <span style={{ fontSize:18 }}>{f.icon}</span>
                <span style={{ fontSize:12, fontWeight:600, color:selectedFeatures.includes(f.id)?f.color:txt }}>{f.name}</span>
                {selectedFeatures.includes(f.id) && <span style={{ marginLeft:"auto", fontSize:11, color:f.color }}>✓</span>}
              </div>
              <div style={{ fontSize:10, color:txt2 }}>{f.desc}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" }}>
          <div style={tabStyle(activeTab==="optimizer")}            onClick={()=>setActiveTab("optimizer")}>🎯 AI Mode Optimizer</div>
          <div style={tabStyle(activeTab==="tracker","#0F9D58")}    onClick={()=>setActiveTab("tracker")}>📊 Keyword Tracker</div>
          <div style={tabStyle(activeTab==="content","#7C3AED")}    onClick={()=>setActiveTab("content")}>✍️ Content Generator</div>
          <div style={tabStyle(activeTab==="guide","#D97706")}      onClick={()=>setActiveTab("guide")}>📚 AI Mode Guide</div>
        </div>

        {/* ── OPTIMIZER TAB ── */}
        {activeTab==="optimizer" && (
          <>
            <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:20 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:12, marginBottom:14 }}>
                <div>
                  <div style={{ fontSize:12, color:txt2, marginBottom:6, fontWeight:600 }}>Topic / Keyword</div>
                  <input value={topic} onChange={e=>setTopic(e.target.value)}
                    placeholder="e.g. best project management software, how to make sourdough bread..."
                    style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", boxSizing:"border-box" }} />
                </div>
                <div>
                  <div style={{ fontSize:12, color:txt2, marginBottom:6, fontWeight:600 }}>Query Intent</div>
                  <select value={queryIntent} onChange={e=>setQueryIntent(e.target.value)}
                    style={{ padding:"10px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", cursor:"pointer" }}>
                    {QUERY_INTENTS.map(i => <option key={i.id} value={i.id}>{i.icon} {i.label}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:12, color:txt2, marginBottom:6, fontWeight:600 }}>Existing Content (optional)</div>
                <textarea value={content} onChange={e=>setContent(e.target.value)}
                  placeholder="Paste existing content to get specific AI Mode optimization suggestions..."
                  rows={4}
                  style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", resize:"none", fontFamily:"inherit", boxSizing:"border-box" }} />
              </div>

              <button onClick={runOptimizer} disabled={loading||!topic.trim()}
                style={{ width:"100%", padding:"11px", borderRadius:10, border:"none", background:loading||!topic.trim()?"#333":"#4285F4", color:"#fff", fontWeight:700, fontSize:14, cursor:loading||!topic.trim()?"not-allowed":"pointer" }}>
                {loading ? "🤖 Analyzing AI Mode..." : "🤖 Optimize for Google AI Mode"}
              </button>
            </div>

            {results && (
              <>
                {/* Score Cards */}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:16 }}>
                  {[
                    { label:"AI Overview Score",    val:results.aiScore,       color:scoreColor(results.aiScore) },
                    { label:"Featured Snippet",     val:results.snippetChance+"%", color:scoreColor(results.snippetChance) },
                    { label:"PAA Coverage",         val:results.paaScore+"%",  color:scoreColor(results.paaScore) },
                    { label:"Overall Visibility",   val:results.overallScore,  color:scoreColor(results.overallScore) },
                  ].map(s => (
                    <div key={s.label} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:16, textAlign:"center", borderTop:`3px solid ${s.color}` }}>
                      <div style={{ fontSize:24, fontWeight:800, color:s.color }}>{s.val}</div>
                      <div style={{ fontSize:10, color:txt2, marginTop:2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, overflow:"hidden" }}>
                  <div style={{ padding:"12px 16px", borderBottom:`1px solid ${bdr}`, display:"flex", justifyContent:"space-between", background:bg3 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:txt }}>🤖 AI Mode Optimization Report</div>
                    <div style={{ display:"flex", gap:8 }}>
                      <button onClick={()=>copyText(results.raw,"optimizer")} style={{ padding:"5px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:"transparent", color:copied==="optimizer"?"#059669":txt2, fontSize:11, cursor:"pointer" }}>
                        {copied==="optimizer"?"✅":"📋 Copy"}
                      </button>
                      <button onClick={()=>exportPDF(results.raw,"AI Mode Optimization Report")} style={{ padding:"5px 12px", borderRadius:8, border:"none", background:"#4285F4", color:"#fff", fontSize:11, cursor:"pointer", fontWeight:600 }}>📥 PDF</button>
                    </div>
                  </div>
                  <div style={{ padding:"16px 20px" }}>
                    <div style={{ fontSize:13, color:txt, lineHeight:1.9, whiteSpace:"pre-wrap" }}>{results.raw}</div>
                  </div>
                </div>
              </>
            )}

            {!results && !loading && (
              <div style={{ textAlign:"center", padding:60, color:txt3 }}>
                <div style={{ fontSize:40, marginBottom:12 }}>🤖</div>
                <div style={{ fontSize:15, color:txt2, marginBottom:8 }}>Enter a topic to optimize for Google AI Mode</div>
                <div style={{ fontSize:12, color:txt3 }}>Get AI Overview score, Featured Snippet tips, PAA questions and full strategy</div>
              </div>
            )}
          </>
        )}

        {/* ── KEYWORD TRACKER TAB ── */}
        {activeTab==="tracker" && (
          <>
            <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:16 }}>
              <div style={{ fontSize:12, color:txt2, marginBottom:6, fontWeight:600 }}>Keywords to track (one per line, max 10)</div>
              <textarea value={trackerKeywords} onChange={e=>setTrackerKeywords(e.target.value)}
                placeholder={"best seo tools\nhow to lose weight fast\nwhat is blockchain\nbuy running shoes online\nplumber near me"}
                rows={7}
                style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", resize:"none", fontFamily:"inherit", marginBottom:12, boxSizing:"border-box" }} />
              <button onClick={runTracker} disabled={trackerLoading||!trackerKeywords.trim()}
                style={{ width:"100%", padding:"11px", borderRadius:10, border:"none", background:trackerLoading||!trackerKeywords.trim()?"#333":"#0F9D58", color:"#fff", fontWeight:700, fontSize:14, cursor:trackerLoading||!trackerKeywords.trim()?"not-allowed":"pointer" }}>
                {trackerLoading ? `Tracking ${trackerResults.length+1}...` : "📊 Track AI Mode Visibility"}
              </button>
            </div>

            {trackerResults.length > 0 && (
              <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, overflow:"hidden" }}>
                <div style={{ padding:"12px 16px", borderBottom:`1px solid ${bdr}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div style={{ fontSize:13, fontWeight:600, color:txt }}>AI Mode Visibility ({trackerResults.length} keywords)</div>
                  <button onClick={exportTrackerCSV} style={{ padding:"5px 14px", borderRadius:8, border:"1px solid #059669aa", background:"#05966911", color:"#059669", fontSize:11, cursor:"pointer", fontWeight:600 }}>⬇️ CSV</button>
                </div>
                <div style={{ overflowX:"auto" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse" }}>
                    <thead>
                      <tr style={{ background:bg3 }}>
                        {["Keyword","AI Overview","Snippet","PAA","Intent","Difficulty","Opportunity","Format"].map(h => (
                          <th key={h} style={{ textAlign:"left", padding:"10px 12px", fontSize:10, color:txt2, fontWeight:600, borderBottom:`1px solid ${bdr}`, whiteSpace:"nowrap", textTransform:"uppercase" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {trackerResults.map((r,i) => (
                        <tr key={i} style={{ borderBottom:`1px solid ${bdr}22` }}>
                          <td style={{ padding:"10px 12px", fontSize:12, color:txt, fontWeight:500, minWidth:160 }}>{r.keyword}</td>
                          <td style={{ padding:"10px 12px", fontSize:12, color:yesColor(r.aiOverview), fontWeight:600 }}>{yesIcon(r.aiOverview)} {r.aiOverview}</td>
                          <td style={{ padding:"10px 12px", fontSize:12, color:yesColor(r.featuredSnippet) }}>{yesIcon(r.featuredSnippet)}</td>
                          <td style={{ padding:"10px 12px", fontSize:12, color:yesColor(r.paaBoxes) }}>{yesIcon(r.paaBoxes)}</td>
                          <td style={{ padding:"10px 12px" }}>
                            <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:"#0891B222", color:"#0891B2", textTransform:"capitalize" }}>{r.intent}</span>
                          </td>
                          <td style={{ padding:"10px 12px", fontSize:12 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                              <div style={{ width:36, height:4, borderRadius:2, background:bg3, overflow:"hidden" }}>
                                <div style={{ height:"100%", width:`${Math.min(parseInt(r.difficulty)||0,100)}%`, background:parseInt(r.difficulty)<=40?"#059669":"#DC2626", borderRadius:2 }} />
                              </div>
                              <span style={{ fontSize:11 }}>{r.difficulty}</span>
                            </div>
                          </td>
                          <td style={{ padding:"10px 12px" }}>
                            <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:oppColor(r.opportunity)+"22", color:oppColor(r.opportunity), fontWeight:600 }}>{r.opportunity}</span>
                          </td>
                          <td style={{ padding:"10px 12px", fontSize:11, color:txt2, textTransform:"capitalize" }}>{r.format}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Tips Section */}
                <div style={{ padding:"14px 16px", borderTop:`1px solid ${bdr}` }}>
                  <div style={{ fontSize:12, fontWeight:600, color:txt, marginBottom:10 }}>💡 Quick Tips Per Keyword</div>
                  {trackerResults.map((r,i) => (
                    <div key={i} style={{ display:"flex", gap:10, padding:"8px 0", borderBottom:`1px solid ${bdr}22` }}>
                      <span style={{ fontSize:11, fontWeight:600, color:"#4285F4", flexShrink:0 }}>{r.keyword}:</span>
                      <span style={{ fontSize:11, color:txt2 }}>{r.tip}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {trackerResults.length===0 && !trackerLoading && (
              <div style={{ textAlign:"center", padding:60, color:txt3 }}>
                <div style={{ fontSize:40, marginBottom:12 }}>📊</div>
                <div style={{ fontSize:14, color:txt2 }}>Track which keywords trigger AI Mode features</div>
              </div>
            )}
          </>
        )}

        {/* ── CONTENT GENERATOR TAB ── */}
        {activeTab==="content" && (
          <>
            <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:16 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:12, marginBottom:14 }}>
                <div>
                  <div style={{ fontSize:12, color:txt2, marginBottom:6, fontWeight:600 }}>Topic / Target Keyword</div>
                  <input value={topic} onChange={e=>setTopic(e.target.value)}
                    placeholder="e.g. best CRM software for small business..."
                    style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", boxSizing:"border-box" }} />
                </div>
                <div>
                  <div style={{ fontSize:12, color:txt2, marginBottom:6, fontWeight:600 }}>Intent</div>
                  <select value={queryIntent} onChange={e=>setQueryIntent(e.target.value)}
                    style={{ padding:"10px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", cursor:"pointer" }}>
                    {QUERY_INTENTS.map(i => <option key={i.id} value={i.id}>{i.icon} {i.label}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ background:bg3, borderRadius:8, padding:12, marginBottom:14 }}>
                <div style={{ fontSize:11, color:txt2, marginBottom:6, fontWeight:600 }}>Content will be optimized for:</div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  {["Direct answer in first 40 words","FAQ section (8 Q&As)","E-E-A-T signals","Schema-ready format","1500+ words","AI citation structure"].map((f,i) => (
                    <span key={i} style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:"#4285F422", color:"#4285F4", border:"1px solid #4285F433" }}>{f}</span>
                  ))}
                </div>
              </div>

              <button onClick={generateAIModeContent} disabled={contentLoading||!topic.trim()}
                style={{ width:"100%", padding:"11px", borderRadius:10, border:"none", background:contentLoading||!topic.trim()?"#333":"#7C3AED", color:"#fff", fontWeight:700, fontSize:14, cursor:contentLoading||!topic.trim()?"not-allowed":"pointer" }}>
                {contentLoading ? "✍️ Generating AI Mode Content..." : "✍️ Generate AI Mode Content"}
              </button>
            </div>

            {generatedContent && (
              <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, overflow:"hidden" }}>
                <div style={{ padding:"12px 16px", borderBottom:`1px solid ${bdr}`, display:"flex", justifyContent:"space-between", background:bg3 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:txt }}>✍️ AI Mode Optimized Content</div>
                  <div style={{ display:"flex", gap:8 }}>
                    <span style={{ fontSize:11, color:txt2, padding:"5px 10px" }}>{generatedContent.split(/\s+/).length} words</span>
                    <button onClick={()=>copyText(generatedContent,"content")} style={{ padding:"5px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:"transparent", color:copied==="content"?"#059669":txt2, fontSize:11, cursor:"pointer" }}>
                      {copied==="content"?"✅ Copied":"📋 Copy"}
                    </button>
                    <button onClick={()=>{ const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([generatedContent],{type:"text/plain"})); a.download=`${topic.replace(/\s+/g,"-")}-ai-mode.txt`; a.click(); }} style={{ padding:"5px 12px", borderRadius:8, border:"1px solid #059669aa", background:"#05966911", color:"#059669", fontSize:11, cursor:"pointer" }}>⬇️ TXT</button>
                    <button onClick={()=>exportPDF(generatedContent,"AI Mode Content")} style={{ padding:"5px 12px", borderRadius:8, border:"none", background:"#7C3AED", color:"#fff", fontSize:11, cursor:"pointer", fontWeight:600 }}>📥 PDF</button>
                  </div>
                </div>
                <div style={{ padding:"16px 20px" }}>
                  <textarea value={generatedContent} onChange={e=>setGeneratedContent(e.target.value)}
                    style={{ width:"100%", minHeight:500, padding:0, border:"none", background:"transparent", color:txt, fontSize:13, lineHeight:1.9, outline:"none", fontFamily:"inherit", resize:"none", boxSizing:"border-box" }} />
                </div>
              </div>
            )}

            {!generatedContent && !contentLoading && (
              <div style={{ textAlign:"center", padding:60, color:txt3 }}>
                <div style={{ fontSize:40, marginBottom:12 }}>✍️</div>
                <div style={{ fontSize:14, color:txt2 }}>Generate content specifically optimized for Google AI Mode</div>
              </div>
            )}
          </>
        )}

        {/* ── GUIDE TAB ── */}
        {activeTab==="guide" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {[
              {
                title:"What is Google AI Mode?", icon:"🤖", color:"#4285F4",
                content:"Google AI Mode (2025-2026) is a new search experience that uses AI to provide comprehensive, conversational answers to complex queries. Unlike traditional search showing 10 blue links, AI Mode synthesizes information from multiple sources into a single AI-generated response. Being cited as a source in AI Mode is the new SEO goal."
              },
              {
                title:"AI Mode vs AI Overview vs SGE", icon:"🔵", color:"#0F9D58",
                items:[
                  "AI Overview: Short AI summary appearing above organic results for simple queries",
                  "AI Mode: Full AI-powered search tab for complex, multi-step queries",
                  "SGE (Search Generative Experience): The original test name — now evolved into AI Mode",
                  "All three require the same optimization strategy — content that directly answers questions",
                  "Key difference: AI Mode handles conversational follow-up queries (multi-turn)",
                ]
              },
              {
                title:"How Google Selects AI Mode Sources", icon:"📊", color:"#DB4437",
                items:[
                  "Authoritative sources — high domain authority, established credibility",
                  "Direct answers — content that clearly answers the query without fluff",
                  "Structured content — clear headings, lists, tables, FAQs",
                  "Fresh content — recently updated, current information",
                  "E-E-A-T signals — expertise, experience, authoritativeness, trustworthiness",
                  "Schema markup — structured data helps Google understand content",
                  "Citation pattern — content already cited by other authoritative sources",
                  "User engagement — content users find helpful (low bounce, high time-on-page)",
                ]
              },
              {
                title:"AI Mode Optimization Checklist", icon:"✅", color:"#F4B400",
                items:[
                  "Answer the main question in first 40-60 words of every page",
                  "Use clear H2/H3 structure — each section answers a specific sub-question",
                  "Add FAQ section with 8-10 questions using FAQPage schema",
                  "Include original statistics or data with proper citations",
                  "Add author bio with verifiable credentials (E-E-A-T)",
                  "Update content regularly — add 'Last updated' date",
                  "Use conversational headers (How, What, Why, Can, Should)",
                  "Add TL;DR summary at top for complex articles",
                  "Include expert quotes and original research",
                  "Implement HowTo schema for step-by-step content",
                ]
              },
              {
                title:"Content Formats That Win AI Mode", icon:"✍️", color:"#7C3AED",
                items:[
                  "Definitive Guides — Comprehensive coverage of a topic (2000+ words)",
                  "Comparison Articles — Structured pros/cons with clear verdict",
                  "Step-by-Step Tutorials — Numbered steps with clear outcomes",
                  "FAQ Pages — Direct 40-60 word answers to common questions",
                  "Statistics & Data Pages — Original research with visualizations",
                  "Expert Roundups — Multiple verified expert perspectives",
                  "Case Studies — Real examples with measurable results",
                ]
              },
              {
                title:"AI Mode Quick Wins (Do This Week)", icon:"⚡", color:"#DC2626",
                items:[
                  "Rewrite every page introduction to answer the main query in first sentence",
                  "Add 'What is X' definition section to every informational page",
                  "Add FAQ section with FAQPage JSON-LD schema to top 10 pages",
                  "Update 'Last reviewed' date on all major pages",
                  "Add author credentials/bio to every article page",
                  "Add statistics section with cited sources to top pages",
                  "Create a TL;DR box at top of long-form content",
                  "Use 'According to [source]' language to signal credibility",
                ]
              },
            ].map((section,i) => (
              <div key={i} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, overflow:"hidden" }}>
                <div style={{ padding:"12px 16px", background:bg3, borderBottom:`1px solid ${bdr}`, display:"flex", gap:8, alignItems:"center" }}>
                  <span style={{ fontSize:18 }}>{section.icon}</span>
                  <span style={{ fontSize:13, fontWeight:700, color:section.color }}>{section.title}</span>
                </div>
                <div style={{ padding:"14px 18px" }}>
                  {section.content && <div style={{ fontSize:13, color:txt, lineHeight:1.8 }}>{section.content}</div>}
                  {section.items && (
                    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                      {section.items.map((item,j) => (
                        <div key={j} style={{ display:"flex", gap:8, padding:"6px 0", borderBottom:`1px solid ${bdr}22` }}>
                          <span style={{ color:section.color, flexShrink:0, fontWeight:600 }}>{j+1}.</span>
                          <span style={{ fontSize:12, color:txt, lineHeight:1.5 }}>{item}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}