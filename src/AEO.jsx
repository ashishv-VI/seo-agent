import { useState } from "react";
import { callAIBackend } from "./utils/callAI";

const AEO_PLATFORMS = [
  { id:"google",     name:"Google AI Overview", icon:"🔵", color:"#4285F4", desc:"Google's AI-generated answers" },
  { id:"chatgpt",    name:"ChatGPT Search",     icon:"🤖", color:"#10A37F", desc:"OpenAI's search experience" },
  { id:"perplexity", name:"Perplexity AI",      icon:"🔮", color:"#443DCB", desc:"AI-powered search engine" },
  { id:"bing",       name:"Bing Copilot",       icon:"🪟", color:"#0078D4", desc:"Microsoft's AI search" },
  { id:"gemini",     name:"Google Gemini",      icon:"✨", color:"#DB4437", desc:"Google's conversational AI" },
];

const CONTENT_TYPES = [
  { id:"faq",         icon:"❓", label:"FAQ Optimization",      desc:"Optimize for People Also Ask" },
  { id:"featured",    icon:"⭐", label:"Featured Snippet",      desc:"Position zero optimization" },
  { id:"howto",       icon:"📋", label:"How-To Content",        desc:"Step-by-step answer format" },
  { id:"definition",  icon:"📖", label:"Definition/What is",   desc:"Concise definition format" },
  { id:"comparison",  icon:"⚔️", label:"Comparison Content",   desc:"Best X vs Y format" },
  { id:"listicle",    icon:"📝", label:"List/Roundup",          desc:"Numbered list optimization" },
];

export default function AEO({ dark, keys, model, getToken }) {
  const [topic, setTopic]           = useState("");
  const [url, setUrl]               = useState("");
  const [content, setContent]       = useState("");
  const [activeTab, setActiveTab]   = useState("optimizer");
  const [selectedPlatforms, setSelectedPlatforms] = useState(["google","chatgpt","perplexity"]);
  const [contentType, setContentType] = useState("faq");
  const [loading, setLoading]       = useState(false);
  const [results, setResults]       = useState(null);
  const [schemaOutput, setSchemaOutput] = useState("");
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [auditResult, setAuditResult] = useState("");
  const [auditLoading, setAuditLoading] = useState(false);
  const [copied, setCopied]         = useState(null);

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const txt3 = dark ? "#444"    : "#bbb";

  async function callAI(prompt) {
    if (!getToken) return null;
    return callAIBackend(prompt, model, getToken);
  }

  async function runAEOOptimizer() {
    if (!topic.trim()) return;
    setLoading(true); setResults(null);

    const prompt = `You are an expert in Answer Engine Optimization (AEO) — optimizing content to be cited by AI systems like Google AI Overview, ChatGPT, Perplexity, and Bing Copilot.

Topic: "${topic}"
Content Type: ${contentType}
Target Platforms: ${selectedPlatforms.join(", ")}
${content ? `Existing Content:\n${content.slice(0,1000)}` : ""}

Provide comprehensive AEO optimization:

AEO_SCORE: [0-100 current AEO readiness score]
CITATION_PROBABILITY: [Low/Medium/High - chance of being cited by AI]

PLATFORM_ANALYSIS:
For each selected platform (${selectedPlatforms.join(", ")}):
- How this platform selects answers
- What format works best
- Specific optimization for this platform

OPTIMIZED_CONTENT:
Write fully optimized content for "${topic}" that is:
- Direct answer in first 40-60 words
- Uses clear heading structure
- Includes statistical data/facts
- FAQ section at end
- Structured for AI citation

ANSWER_BLOCKS:
5 ready-to-use answer blocks (40-60 words each) for common questions about "${topic}"

SCHEMA_MARKUP:
Complete JSON-LD schema for maximum AI visibility

OPTIMIZATION_CHECKLIST:
10 specific changes to make content AEO-ready

MISSING_ELEMENTS:
What's missing that AI systems look for

ACTION_PLAN:
5 immediate actions ranked by impact`;

    const text = await callAI(prompt);
    if (text) {
      const get = (k) => { const m = text.match(new RegExp(`${k}:\\s*(.+)`)); return m?m[1].trim():"N/A"; };
      setResults({
        raw: text,
        score: parseInt(get("AEO_SCORE")) || 0,
        citation: get("CITATION_PROBABILITY"),
      });
    }
    setLoading(false);
  }

  async function generateSchema() {
    if (!topic.trim()) return;
    setSchemaLoading(true);

    const prompt = `You are an expert in structured data for AEO (Answer Engine Optimization).

Topic: "${topic}"
Content Type: ${contentType}
${url ? `URL: ${url}` : ""}

Generate complete JSON-LD schema markup to maximize AI citation probability:

1. FAQPage schema (5 Q&As about "${topic}")
2. HowTo schema (if applicable)
3. Article/WebPage schema
4. Organization schema
5. BreadcrumbList schema

For each schema:
- Provide complete, copy-paste ready JSON-LD
- Explain why this schema helps AEO
- Note which AI platforms this helps most

Make all schemas specific to "${topic}". Include real-looking data.`;

    const text = await callAI(prompt);
    setSchemaOutput(text || "");
    setSchemaLoading(false);
  }

  async function runAEOAudit() {
    if (!content.trim() && !topic.trim()) return;
    setAuditLoading(true);

    const prompt = `You are an expert AEO auditor. Audit this content for Answer Engine Optimization:

Topic: "${topic}"
${content ? `Content to audit:\n${content.slice(0,2000)}` : "No content provided — analyze topic only"}

Perform comprehensive AEO audit:

OVERALL_AEO_SCORE: [0-100]

DIRECT_ANSWER_SCORE: [0-100] — Does it answer the query directly in first paragraph?
STRUCTURE_SCORE: [0-100] — Is content well-structured with headers?
AUTHORITY_SCORE: [0-100] — Does it show E-E-A-T signals?
CITATION_SCORE: [0-100] — How citable is this content?
SCHEMA_SCORE: [0-100] — Schema markup quality

STRENGTHS:
3 things content does well for AEO

CRITICAL_ISSUES:
5 specific problems preventing AI citation (with exact fixes)

GOOGLE_AI_OVERVIEW_READINESS: [Ready/Needs Work/Not Ready]
Why: [specific reason]

CHATGPT_READINESS: [Ready/Needs Work/Not Ready]
Why: [specific reason]

PERPLEXITY_READINESS: [Ready/Needs Work/Not Ready]
Why: [specific reason]

QUICK_FIXES:
5 changes to implement TODAY for better AEO

REWRITE_SUGGESTION:
Rewrite the introduction paragraph to be AEO-optimized (under 60 words, direct answer format)

PRIORITY_ACTIONS:
Ranked list of 7 improvements with estimated AEO score improvement`;

    const text = await callAI(prompt);
    setAuditResult(text || "");
    setAuditLoading(false);
  }

  function copyText(text, id) {
    navigator.clipboard.writeText(text);
    setCopied(id); setTimeout(()=>setCopied(null),2000);
  }

  function exportPDF(content2, title2) {
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title2}</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;color:#333;line-height:1.7;}
h1{color:#443DCB;}pre{white-space:pre-wrap;font-size:13px;}
.footer{margin-top:30px;text-align:center;font-size:11px;color:#888;border-top:1px solid #eee;padding-top:16px;}
</style></head><body>
<h1>🎯 ${title2}</h1>
<p><strong>Topic:</strong> ${topic} · <strong>Generated:</strong> ${new Date().toLocaleDateString()}</p>
<pre>${content2.replace(/</g,"&lt;")}</pre>
<div class="footer">Generated by SEO Agent AEO Dashboard</div>
</body></html>`;
    const win = window.open("","_blank","width=900,height=700");
    win.document.write(html); win.document.close();
    win.onload = ()=>setTimeout(()=>win.print(),500);
  }

  const scoreColor = s => s>=80?"#059669":s>=60?"#D97706":"#DC2626";
  const scoreLabel = s => s>=80?"Excellent":s>=60?"Good":s>=40?"Needs Work":"Poor";
  const tabStyle   = (a, color="#443DCB") => ({ padding:"7px 16px", borderRadius:20, fontSize:12, cursor:"pointer", fontWeight:a?600:400, background:a?color+"22":"transparent", color:a?color:txt2, border:`1px solid ${a?color+"44":bdr}`, whiteSpace:"nowrap" });

  return (
    <div style={{ flex:1, overflowY:"auto", padding:24, background:bg }}>
      <div style={{ maxWidth:980, margin:"0 auto" }}>
        <div style={{ fontSize:18, fontWeight:700, color:txt, marginBottom:4 }}>🎯 AEO — Answer Engine Optimization</div>
        <div style={{ fontSize:13, color:txt2, marginBottom:20 }}>Optimize content to be cited by Google AI Overview, ChatGPT, Perplexity & Bing Copilot</div>

        {/* What is AEO Banner */}
        <div style={{ background:"#443DCB11", border:"1px solid #443DCB33", borderRadius:10, padding:"14px 18px", marginBottom:20 }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
            {[
              { icon:"🔵", label:"Google AI Overview", desc:"Appears above search results" },
              { icon:"🤖", label:"ChatGPT Citations",  desc:"Cited in AI responses" },
              { icon:"🔮", label:"Perplexity Sources", desc:"Used as reference source" },
              { icon:"🪟", label:"Bing Copilot",       desc:"Featured in AI answers" },
            ].map(p => (
              <div key={p.label} style={{ textAlign:"center" }}>
                <div style={{ fontSize:24, marginBottom:4 }}>{p.icon}</div>
                <div style={{ fontSize:11, fontWeight:600, color:"#6B62E8" }}>{p.label}</div>
                <div style={{ fontSize:10, color:txt2 }}>{p.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" }}>
          <div style={tabStyle(activeTab==="optimizer")} onClick={()=>setActiveTab("optimizer")}>🎯 AEO Optimizer</div>
          <div style={tabStyle(activeTab==="audit","#DC2626")} onClick={()=>setActiveTab("audit")}>🔍 Content Audit</div>
          <div style={tabStyle(activeTab==="schema","#059669")} onClick={()=>setActiveTab("schema")}>🧩 Schema Generator</div>
          <div style={tabStyle(activeTab==="guide","#D97706")} onClick={()=>setActiveTab("guide")}>📚 AEO Guide</div>
        </div>

        {/* ── OPTIMIZER TAB ── */}
        {activeTab==="optimizer" && (
          <>
            <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:20 }}>
              {/* Topic Input */}
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:12, color:txt2, marginBottom:6, fontWeight:600 }}>Topic / Keyword</div>
                <input value={topic} onChange={e=>setTopic(e.target.value)}
                  placeholder="e.g. best SEO tools, how to lose weight, what is blockchain..."
                  style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", boxSizing:"border-box" }} />
              </div>

              {/* Content Type */}
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:12, color:txt2, marginBottom:8, fontWeight:600 }}>Content Format</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
                  {CONTENT_TYPES.map(ct => (
                    <div key={ct.id} onClick={()=>setContentType(ct.id)}
                      style={{ padding:"10px 12px", borderRadius:8, border:`1px solid ${contentType===ct.id?"#443DCB44":bdr}`, background:contentType===ct.id?"#443DCB11":bg3, cursor:"pointer", display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ fontSize:16 }}>{ct.icon}</span>
                      <div>
                        <div style={{ fontSize:11, fontWeight:contentType===ct.id?600:400, color:contentType===ct.id?"#6B62E8":txt }}>{ct.label}</div>
                        <div style={{ fontSize:9, color:txt2 }}>{ct.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Platforms */}
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:12, color:txt2, marginBottom:8, fontWeight:600 }}>Target Platforms</div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  {AEO_PLATFORMS.map(p => {
                    const sel = selectedPlatforms.includes(p.id);
                    return (
                      <div key={p.id} onClick={()=>setSelectedPlatforms(s=>sel?s.filter(x=>x!==p.id):[...s,p.id])}
                        style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 12px", borderRadius:20, border:`1px solid ${sel?p.color+"44":bdr}`, background:sel?p.color+"11":bg3, cursor:"pointer" }}>
                        <span style={{ fontSize:14 }}>{p.icon}</span>
                        <span style={{ fontSize:11, fontWeight:sel?600:400, color:sel?p.color:txt2 }}>{p.name}</span>
                        {sel && <span style={{ fontSize:10, color:p.color }}>✓</span>}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Optional Content */}
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:12, color:txt2, marginBottom:6, fontWeight:600 }}>Existing Content (optional — paste to optimize)</div>
                <textarea value={content} onChange={e=>setContent(e.target.value)}
                  placeholder="Paste your existing content here to get specific optimization suggestions..."
                  rows={4}
                  style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", resize:"none", fontFamily:"inherit", boxSizing:"border-box" }} />
              </div>

              <button onClick={runAEOOptimizer} disabled={loading||!topic.trim()}
                style={{ width:"100%", padding:"11px", borderRadius:10, border:"none", background:loading||!topic.trim()?"#333":"#443DCB", color:loading||!topic.trim()?txt3:"#fff", fontWeight:700, fontSize:14, cursor:loading||!topic.trim()?"not-allowed":"pointer" }}>
                {loading ? "🎯 Optimizing for AI Answers..." : "🎯 Run AEO Optimization"}
              </button>
            </div>

            {/* Results */}
            {results && (
              <>
                {/* Score Cards */}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:16 }}>
                  <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:16, textAlign:"center", borderTop:`3px solid ${scoreColor(results.score)}` }}>
                    <div style={{ fontSize:32, fontWeight:800, color:scoreColor(results.score) }}>{results.score}</div>
                    <div style={{ fontSize:11, color:txt2, marginTop:2 }}>AEO Score</div>
                    <div style={{ fontSize:11, color:scoreColor(results.score), fontWeight:600 }}>{scoreLabel(results.score)}</div>
                  </div>
                  <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:16, textAlign:"center", borderTop:`3px solid ${results.citation==="High"?"#059669":results.citation==="Medium"?"#D97706":"#DC2626"}` }}>
                    <div style={{ fontSize:28, fontWeight:800, color:results.citation==="High"?"#059669":results.citation==="Medium"?"#D97706":"#DC2626" }}>{results.citation}</div>
                    <div style={{ fontSize:11, color:txt2, marginTop:2 }}>Citation Probability</div>
                  </div>
                  <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:16, textAlign:"center", borderTop:"3px solid #443DCB" }}>
                    <div style={{ fontSize:28, fontWeight:800, color:"#6B62E8" }}>{selectedPlatforms.length}</div>
                    <div style={{ fontSize:11, color:txt2, marginTop:2 }}>Platforms Analyzed</div>
                  </div>
                </div>

                {/* Full Result */}
                <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, overflow:"hidden" }}>
                  <div style={{ padding:"12px 16px", borderBottom:`1px solid ${bdr}`, display:"flex", justifyContent:"space-between", alignItems:"center", background:bg3 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:txt }}>🎯 AEO Optimization Report</div>
                    <div style={{ display:"flex", gap:8 }}>
                      <button onClick={()=>copyText(results.raw,"optimizer")} style={{ padding:"5px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:"transparent", color:copied==="optimizer"?"#059669":txt2, fontSize:11, cursor:"pointer" }}>
                        {copied==="optimizer"?"✅ Copied":"📋 Copy"}
                      </button>
                      <button onClick={()=>exportPDF(results.raw,"AEO Optimization Report")} style={{ padding:"5px 12px", borderRadius:8, border:"none", background:"#443DCB", color:"#fff", fontSize:11, cursor:"pointer", fontWeight:600 }}>📥 PDF</button>
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
                <div style={{ fontSize:40, marginBottom:12 }}>🎯</div>
                <div style={{ fontSize:15, color:txt2, marginBottom:8 }}>Enter a topic to optimize for AI answers</div>
                <div style={{ fontSize:12, color:txt3 }}>Get optimized content, answer blocks, schema markup and more</div>
              </div>
            )}
          </>
        )}

        {/* ── AUDIT TAB ── */}
        {activeTab==="audit" && (
          <>
            <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:16 }}>
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:12, color:txt2, marginBottom:6, fontWeight:600 }}>Topic / Page URL</div>
                <input value={topic} onChange={e=>setTopic(e.target.value)}
                  placeholder="Enter topic or URL..."
                  style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", boxSizing:"border-box" }} />
              </div>
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:12, color:txt2, marginBottom:6, fontWeight:600 }}>Content to Audit <span style={{ color:txt3 }}>(paste your content)</span></div>
                <textarea value={content} onChange={e=>setContent(e.target.value)}
                  placeholder="Paste your article, blog post, or page content here for AEO audit..."
                  rows={8}
                  style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", resize:"vertical", fontFamily:"inherit", boxSizing:"border-box" }} />
              </div>
              <button onClick={runAEOAudit} disabled={auditLoading||(!content.trim()&&!topic.trim())}
                style={{ width:"100%", padding:"11px", borderRadius:10, border:"none", background:auditLoading?"#333":"#DC2626", color:"#fff", fontWeight:700, fontSize:14, cursor:auditLoading?"not-allowed":"pointer" }}>
                {auditLoading ? "🔍 Auditing..." : "🔍 Run AEO Audit"}
              </button>
            </div>

            {auditResult && (
              <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, overflow:"hidden" }}>
                <div style={{ padding:"12px 16px", borderBottom:`1px solid ${bdr}`, display:"flex", justifyContent:"space-between", background:bg3 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:txt }}>🔍 AEO Audit Report</div>
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={()=>copyText(auditResult,"audit")} style={{ padding:"5px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:"transparent", color:copied==="audit"?"#059669":txt2, fontSize:11, cursor:"pointer" }}>
                      {copied==="audit"?"✅":"📋 Copy"}
                    </button>
                    <button onClick={()=>exportPDF(auditResult,"AEO Content Audit")} style={{ padding:"5px 12px", borderRadius:8, border:"none", background:"#DC2626", color:"#fff", fontSize:11, cursor:"pointer", fontWeight:600 }}>📥 PDF</button>
                  </div>
                </div>
                <div style={{ padding:"16px 20px" }}>
                  <div style={{ fontSize:13, color:txt, lineHeight:1.9, whiteSpace:"pre-wrap" }}>{auditResult}</div>
                </div>
              </div>
            )}

            {!auditResult && !auditLoading && (
              <div style={{ textAlign:"center", padding:60, color:txt3 }}>
                <div style={{ fontSize:40, marginBottom:12 }}>🔍</div>
                <div style={{ fontSize:15, color:txt2 }}>Paste content above to audit AEO readiness</div>
              </div>
            )}
          </>
        )}

        {/* ── SCHEMA GENERATOR TAB ── */}
        {activeTab==="schema" && (
          <>
            <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:16 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                <div>
                  <div style={{ fontSize:12, color:txt2, marginBottom:6, fontWeight:600 }}>Topic / Page Title</div>
                  <input value={topic} onChange={e=>setTopic(e.target.value)}
                    placeholder="e.g. Best SEO Tools 2026"
                    style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", boxSizing:"border-box" }} />
                </div>
                <div>
                  <div style={{ fontSize:12, color:txt2, marginBottom:6, fontWeight:600 }}>Page URL (optional)</div>
                  <input value={url} onChange={e=>setUrl(e.target.value)}
                    placeholder="https://yoursite.com/page"
                    style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", boxSizing:"border-box" }} />
                </div>
              </div>
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:12, color:txt2, marginBottom:8, fontWeight:600 }}>Schema Type</div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  {CONTENT_TYPES.map(ct => (
                    <div key={ct.id} onClick={()=>setContentType(ct.id)}
                      style={tabStyle(contentType===ct.id)}>
                      {ct.icon} {ct.label}
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={generateSchema} disabled={schemaLoading||!topic.trim()}
                style={{ width:"100%", padding:"11px", borderRadius:10, border:"none", background:schemaLoading||!topic.trim()?"#333":"#059669", color:"#fff", fontWeight:700, fontSize:14, cursor:schemaLoading||!topic.trim()?"not-allowed":"pointer" }}>
                {schemaLoading ? "🧩 Generating Schema..." : "🧩 Generate AEO Schema"}
              </button>
            </div>

            {schemaOutput && (
              <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, overflow:"hidden" }}>
                <div style={{ padding:"12px 16px", borderBottom:`1px solid ${bdr}`, display:"flex", justifyContent:"space-between", background:bg3 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:txt }}>🧩 AEO Schema Markup</div>
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={()=>copyText(schemaOutput,"schema")} style={{ padding:"5px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:"transparent", color:copied==="schema"?"#059669":txt2, fontSize:11, cursor:"pointer" }}>
                      {copied==="schema"?"✅ Copied":"📋 Copy"}
                    </button>
                    <button onClick={()=>exportPDF(schemaOutput,"AEO Schema Markup")} style={{ padding:"5px 12px", borderRadius:8, border:"none", background:"#059669", color:"#fff", fontSize:11, cursor:"pointer", fontWeight:600 }}>📥 PDF</button>
                  </div>
                </div>
                <div style={{ padding:"16px 20px" }}>
                  <div style={{ fontSize:13, color:txt, lineHeight:1.9, whiteSpace:"pre-wrap", fontFamily:"monospace" }}>{schemaOutput}</div>
                </div>
              </div>
            )}

            {!schemaOutput && !schemaLoading && (
              <div style={{ textAlign:"center", padding:60, color:txt3 }}>
                <div style={{ fontSize:40, marginBottom:12 }}>🧩</div>
                <div style={{ fontSize:15, color:txt2 }}>Generate schema markup to maximize AI citation chances</div>
              </div>
            )}
          </>
        )}

        {/* ── GUIDE TAB ── */}
        {activeTab==="guide" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {[
              {
                title:"What is AEO?", icon:"🎯", color:"#443DCB",
                content:"Answer Engine Optimization (AEO) is the practice of optimizing content to be selected and cited by AI-powered answer engines like Google AI Overview, ChatGPT, Perplexity, and Bing Copilot. Unlike traditional SEO which targets search rankings, AEO targets being the source that AI systems cite when answering user questions."
              },
              {
                title:"Key AEO Ranking Factors", icon:"📊", color:"#0891B2",
                items:[
                  "Direct Answer Format — Answer the question in first 40-60 words",
                  "Structured Content — Clear H2/H3 headings, bullet points, numbered lists",
                  "E-E-A-T Signals — Experience, Expertise, Authoritativeness, Trustworthiness",
                  "Schema Markup — FAQPage, HowTo, Article structured data",
                  "Content Freshness — Updated, accurate, current information",
                  "Citation Worthiness — Statistics, studies, original research",
                  "Conversational Tone — Natural language that matches how people ask questions",
                  "Comprehensive Coverage — Covers all aspects of the topic",
                ]
              },
              {
                title:"AEO vs SEO vs GEO", icon:"⚔️", color:"#059669",
                items:[
                  "SEO: Rank in Google's 10 blue links → Target: Position 1-10",
                  "AEO: Be cited in AI answer boxes → Target: AI citation source",
                  "GEO: Appear in generative AI responses → Target: ChatGPT/Gemini mentions",
                  "All three work together — AEO content often ranks well in SEO too",
                ]
              },
              {
                title:"Content Formats That Win AEO", icon:"✍️", color:"#D97706",
                items:[
                  "FAQ Pages — 10-15 questions with direct 40-60 word answers",
                  "How-To Guides — Numbered steps, clear outcomes",
                  "Definition Pages — Concise definitions followed by detailed explanation",
                  "Comparison Articles — Clear structure, pros/cons, verdict",
                  "Statistics Pages — Original data, properly cited",
                  "Expert Roundups — Multiple expert quotes on a topic",
                ]
              },
              {
                title:"Quick AEO Wins", icon:"⚡", color:"#DC2626",
                items:[
                  "Add FAQ section to every page (use FAQPage schema)",
                  "Rewrite introductions to directly answer the page's main question",
                  "Add 'What is X' definition at the start of every article",
                  "Include statistics with source citations",
                  "Use clear, scannable formatting (bullets, numbers, tables)",
                  "Add author bio with credentials for E-E-A-T",
                  "Update content dates regularly",
                  "Add TL;DR summary at top of long articles",
                ]
              },
            ].map((section, i) => (
              <div key={i} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, overflow:"hidden" }}>
                <div style={{ padding:"12px 16px", background:bg3, borderBottom:`1px solid ${bdr}`, display:"flex", alignItems:"center", gap:8 }}>
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