import { useState } from "react";

const TEMPLATES = [
  { id:"blog",       icon:"✍️", label:"Blog Post",          desc:"Full SEO blog article" },
  { id:"meta",       icon:"🏷️", label:"Meta Tags",           desc:"Title + description" },
  { id:"product",    icon:"🛒", label:"Product Description", desc:"E-commerce copy" },
  { id:"social",     icon:"📱", label:"Social Media Post",   desc:"LinkedIn/Twitter/Instagram" },
  { id:"email",      icon:"📧", label:"Email Newsletter",    desc:"SEO content email" },
  { id:"intro",      icon:"🎯", label:"Page Introduction",   desc:"Hook + keyword placement" },
  { id:"faq",        icon:"❓", label:"FAQ Section",         desc:"PAA-optimized Q&As" },
  { id:"cta",        icon:"📣", label:"Call to Action",      desc:"Conversion-focused copy" },
  { id:"title",      icon:"📰", label:"Title Variations",    desc:"10 SEO title options" },
  { id:"rewrite",    icon:"🔄", label:"Rewrite & Improve",   desc:"Enhance existing content" },
  { id:"summary",    icon:"📋", label:"Content Summary",     desc:"TL;DR + key points" },
  { id:"outline",    icon:"📐", label:"Article Outline",     desc:"Full content structure" },
];

const TONES   = ["Professional","Conversational","Authoritative","Friendly","Persuasive","Educational","Witty"];
const LENGTHS = ["Short (200-400 words)","Medium (400-800 words)","Long (800-1500 words)","Comprehensive (1500+ words)"];

export default function AiWriter({ dark, keys, model }) {
  const [activeTab, setActiveTab] = useState("writer");
  const [tmpl, setTmpl]       = useState(TEMPLATES[0]);
  const [keyword, setKeyword] = useState("");
  const [topic, setTopic]     = useState("");
  const [tone, setTone]       = useState("Professional");
  const [length, setLength]   = useState("Medium (400-800 words)");
  const [audience, setAudience] = useState("");
  const [loading, setLoading] = useState(false);
  const [output, setOutput]   = useState("");
  const [copied, setCopied]   = useState(false);
  const [history, setHistory] = useState([]);

  // Image SEO state
  const [imgDesc, setImgDesc]       = useState("");
  const [imgKeyword, setImgKeyword] = useState("");
  const [imgContext, setImgContext] = useState("");
  const [imgLoading, setImgLoading] = useState(false);
  const [imgResult, setImgResult]   = useState(null);
  const [imgHistory, setImgHistory] = useState([]);
  const [batchInput, setBatchInput] = useState("");
  const [batchResults, setBatchResults] = useState([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [imgCopied, setImgCopied]   = useState(null);

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const txt3 = dark ? "#444"    : "#bbb";

  async function callAI(prompt) {
    const key = model === "groq" ? keys.groq : keys.gemini;
    if (!key) return null;
    if (model === "groq") {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
        body: JSON.stringify({ model: "llama-3.1-8b-instant", max_tokens: 2500, messages: [{ role: "user", content: prompt }] })
      });
      const d = await res.json();
      return d.choices?.[0]?.message?.content || null;
    } else {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${keys.gemini}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const d = await res.json();
      return d.candidates?.[0]?.content?.parts?.[0]?.text || null;
    }
  }

  function buildPrompt() {
    const base = `You are an expert SEO content writer. Write ${tmpl.label} content.
Topic/Keyword: "${topic || keyword}"
Target Keyword: "${keyword}"
Tone: ${tone}
Target Audience: ${audience || "general audience"}
Length: ${length}`;
    const specific = {
      blog: `\nWrite a complete, publish-ready SEO blog post with:\n- SEO-optimized H1 title\n- Engaging introduction (keyword in first 100 words)\n- 5-7 H2 sections with detailed content\n- Natural keyword integration (1-2% density)\n- FAQ section (5 Q&As)\n- Strong conclusion with CTA\n- E-E-A-T signals throughout`,
      meta: `\nGenerate:\n- 5 title tag variations (50-60 chars each, keyword near front)\n- 5 meta description variations (150-160 chars each with CTA)\n- Open Graph title and description\n- Twitter Card tags\n- Explanation of why each works`,
      product: `\nWrite an SEO-optimized product description with:\n- Compelling headline\n- Key benefits (bullet points)\n- Features section\n- Social proof element\n- Strong CTA\n- Target keyword naturally placed 2-3 times`,
      social: `\nCreate social media posts for:\n1. LinkedIn (professional, 150-200 words)\n2. Twitter/X (under 280 chars, with hashtags)\n3. Instagram (engaging caption with hashtags)\n4. Facebook (conversational, with CTA)\nAll SEO-aware and keyword-rich`,
      email: `\nWrite an email newsletter with:\n- Compelling subject line (5 variations)\n- Preview text\n- Engaging body content\n- Clear CTA button text\n- P.S. line\nKeep it scannable with short paragraphs`,
      intro: `\nWrite 3 different page introduction variations:\n1. Question-based hook\n2. Statistic/data hook\n3. Story-based hook\nEach 100-150 words, keyword in first sentence, compelling enough to reduce bounce rate`,
      faq: `\nCreate 10 FAQ questions and answers:\n- Based on People Also Ask patterns\n- Each answer 40-60 words (featured snippet optimized)\n- Include target keyword naturally\n- Cover informational and transactional intent\n- Add complete JSON-LD FAQ schema at end`,
      cta: `\nCreate 10 call-to-action variations:\n- For different funnel stages (awareness/consideration/decision)\n- Button text options (2-5 words each)\n- Full CTA paragraph versions\n- Urgency-based options\n- Value-based options`,
      title: `\nGenerate 15 SEO title variations:\n- With numbers (listicles)\n- How-to format\n- Question format\n- Power word titles\n- Year-specific titles\n- Comparison titles\nFor each: explain the strategy and estimated CTR potential`,
      rewrite: `\nRewrite and improve this content for SEO:\n- Improve keyword placement\n- Enhance readability\n- Add E-E-A-T signals\n- Strengthen headlines\n- Improve sentence variety\n- Add transition phrases\nProvide before/after comparison`,
      summary: `\nCreate:\n1. TL;DR (1 sentence)\n2. Key takeaways (5 bullet points)\n3. Executive summary (100 words)\n4. Social media summary (280 chars)\n5. Email subject line version`,
      outline: `\nCreate a comprehensive article outline:\n- H1 title (3 variations)\n- Meta description\n- Introduction structure\n- 6-8 H2 sections with 3-4 H3 subsections each\n- Key points per section\n- FAQ section (5 questions)\n- Conclusion structure\n- Word count recommendation per section`,
    };
    return base + (specific[tmpl.id] || "");
  }

  async function generate() {
    if (!topic.trim()) return;
    setLoading(true); setOutput("");
    try {
      const text = await callAI(buildPrompt());
      setOutput(text || "");
      setHistory(h => [{ tmpl: tmpl.label, topic, output: text, time: new Date().toLocaleTimeString() }, ...h.slice(0, 9)]);
    } catch(e) { setOutput("Error: " + e.message); }
    setLoading(false);
  }

  async function generateAltText() {
    if (!imgDesc.trim()) return;
    setImgLoading(true); setImgResult(null);
    const prompt = `You are an expert Image SEO specialist. Generate optimized alt text and image metadata for:

Image Description: "${imgDesc}"
Target Keyword: "${imgKeyword || "not specified"}"
Page Context: "${imgContext || "general webpage"}"

Provide EXACTLY in this format:
ALT TEXT (primary): [50-125 chars, descriptive, keyword included naturally]
ALT TEXT (alt 2): [different variation]
ALT TEXT (alt 3): [another variation]
FILE NAME: [seo-friendly-filename.jpg format, use hyphens]
TITLE ATTRIBUTE: [slightly longer than alt, for tooltip]
CAPTION: [human-readable caption for below image]
STRUCTURED DATA: [ImageObject schema snippet]

Rules:
- Alt text must be descriptive, not keyword-stuffed
- File name: lowercase, hyphens only, no spaces
- Each variation should be unique
- Max 125 characters for alt text`;

    try {
      const text = await callAI(prompt);
      if (text) {
        const lines = text.split("\n").filter(Boolean);
        const get = (prefix) => {
          const line = lines.find(l => l.toLowerCase().startsWith(prefix.toLowerCase()));
          return line ? line.replace(/^[^:]+:\s*/,"").trim() : "";
        };
        setImgResult({
          raw: text,
          alt1: get("ALT TEXT (primary)"),
          alt2: get("ALT TEXT (alt 2)"),
          alt3: get("ALT TEXT (alt 3)"),
          filename: get("FILE NAME"),
          title: get("TITLE ATTRIBUTE"),
          caption: get("CAPTION"),
        });
        setImgHistory(h => [{ desc: imgDesc, keyword: imgKeyword, time: new Date().toLocaleTimeString() }, ...h.slice(0,4)]);
      }
    } catch(e) { console.error(e); }
    setImgLoading(false);
  }

  async function generateBatch() {
    const items = batchInput.split("\n").map(l=>l.trim()).filter(Boolean);
    if (!items.length) return;
    setBatchLoading(true); setBatchResults([]);
    for (const desc of items.slice(0,10)) {
      const prompt = `Generate SEO alt text for this image: "${desc}". Target keyword if mentioned after | symbol.
Respond with ONLY:
ALT: [alt text under 125 chars]
FILE: [filename.jpg]`;
      try {
        const text = await callAI(prompt);
        const alt  = text?.match(/ALT:\s*(.+)/)?.[1]?.trim() || desc.slice(0,100);
        const file = text?.match(/FILE:\s*(.+)/)?.[1]?.trim() || desc.toLowerCase().replace(/\s+/g,"-").slice(0,50)+".jpg";
        setBatchResults(r => [...r, { desc, alt, file }]);
      } catch(e) {
        setBatchResults(r => [...r, { desc, alt: desc.slice(0,100), file: "image.jpg" }]);
      }
    }
    setBatchLoading(false);
  }

  function copyImg(text, id) {
    navigator.clipboard.writeText(text);
    setImgCopied(id);
    setTimeout(()=>setImgCopied(null), 2000);
  }

  function exportBatchCSV() {
    if (!batchResults.length) return;
    const csv = ["Description,Alt Text,File Name", ...batchResults.map(r=>`"${r.desc}","${r.alt}","${r.file}"`)].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    a.download = "image-alt-text.csv"; a.click();
  }

  function copyOutput() {
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function downloadOutput() {
    const blob = new Blob([output], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${tmpl.id}-${topic.replace(/\s+/g,"-").slice(0,30)}-${Date.now()}.txt`; a.click();
    URL.revokeObjectURL(url);
  }

  const wordCount = output ? output.split(/\s+/).filter(Boolean).length : 0;
  const tabStyle = (a) => ({ padding:"7px 16px", borderRadius:20, fontSize:12, cursor:"pointer", fontWeight:a?600:400, background:a?"#443DCB22":"transparent", color:a?"#6B62E8":txt2, border:`1px solid ${a?"#443DCB44":bdr}`, whiteSpace:"nowrap" });

  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", background:bg }}>
      {/* Top Tab Bar */}
      <div style={{ padding:"10px 16px", borderBottom:`1px solid ${bdr}`, background:bg2, display:"flex", gap:8, flexShrink:0 }}>
        <div style={tabStyle(activeTab==="writer")} onClick={()=>setActiveTab("writer")}>✍️ AI Writer</div>
        <div style={tabStyle(activeTab==="imgseo")} onClick={()=>setActiveTab("imgseo")}>🖼️ Image SEO</div>
        <div style={tabStyle(activeTab==="batch")}  onClick={()=>setActiveTab("batch")}>📋 Batch Alt Text</div>
      </div>

      {/* ── AI WRITER TAB ── */}
      {activeTab==="writer" && (
        <div style={{ flex:1, display:"flex", overflow:"hidden" }}>
          {/* Left Panel */}
          <div style={{ width:280, borderRight:`1px solid ${bdr}`, display:"flex", flexDirection:"column", background:bg2, flexShrink:0, overflowY:"auto" }}>
            <div style={{ padding:"16px", borderBottom:`1px solid ${bdr}` }}>
              <div style={{ fontSize:15, fontWeight:700, color:txt, marginBottom:2 }}>✍️ AI Writer</div>
              <div style={{ fontSize:11, color:txt2 }}>SEO-optimized content generator</div>
            </div>
            <div style={{ padding:14, flex:1, overflowY:"auto" }}>
              <div style={{ fontSize:11, color:txt3, marginBottom:8, textTransform:"uppercase", letterSpacing:"0.06em" }}>Content Type</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:16 }}>
                {TEMPLATES.map(t => (
                  <div key={t.id} onClick={()=>setTmpl(t)} style={{ padding:"8px", borderRadius:8, border:`1px solid ${tmpl.id===t.id?"#443DCB44":bdr}`, background:tmpl.id===t.id?"#443DCB22":"transparent", cursor:"pointer" }}>
                    <div style={{ fontSize:14, marginBottom:2 }}>{t.icon}</div>
                    <div style={{ fontSize:11, fontWeight:tmpl.id===t.id?600:400, color:tmpl.id===t.id?"#6B62E8":txt }}>{t.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize:11, color:txt3, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.06em" }}>Topic / Title</div>
              <input value={topic} onChange={e=>setTopic(e.target.value)} placeholder="What to write about..."
                style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", marginBottom:12, boxSizing:"border-box" }} />
              <div style={{ fontSize:11, color:txt3, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.06em" }}>Target Keyword</div>
              <input value={keyword} onChange={e=>setKeyword(e.target.value)} placeholder="Primary SEO keyword..."
                style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", marginBottom:12, boxSizing:"border-box" }} />
              <div style={{ fontSize:11, color:txt3, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.06em" }}>Target Audience</div>
              <input value={audience} onChange={e=>setAudience(e.target.value)} placeholder="e.g. small business owners"
                style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", marginBottom:12, boxSizing:"border-box" }} />
              <div style={{ fontSize:11, color:txt3, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.06em" }}>Tone</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginBottom:12 }}>
                {TONES.map(t => (
                  <div key={t} onClick={()=>setTone(t)} style={{ padding:"4px 10px", borderRadius:20, fontSize:11, cursor:"pointer", fontWeight:tone===t?600:400, background:tone===t?"#443DCB22":"transparent", color:tone===t?"#6B62E8":txt2, border:`1px solid ${tone===t?"#443DCB44":bdr}` }}>{t}</div>
                ))}
              </div>
              <div style={{ fontSize:11, color:txt3, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.06em" }}>Length</div>
              <select value={length} onChange={e=>setLength(e.target.value)}
                style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:12, outline:"none", marginBottom:16, cursor:"pointer" }}>
                {LENGTHS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <button onClick={generate} disabled={loading||!topic.trim()}
                style={{ width:"100%", padding:"11px", borderRadius:10, border:"none", background:loading||!topic.trim()?"#333":"#443DCB", color:loading||!topic.trim()?txt3:"#fff", fontWeight:700, fontSize:14, cursor:loading||!topic.trim()?"not-allowed":"pointer" }}>
                {loading ? "✍️ Writing..." : `✍️ Generate ${tmpl.label}`}
              </button>
            </div>
            {history.length > 0 && (
              <div style={{ borderTop:`1px solid ${bdr}`, padding:10 }}>
                <div style={{ fontSize:10, color:txt3, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.06em" }}>Recent</div>
                {history.slice(0,4).map((h,i) => (
                  <div key={i} onClick={()=>setOutput(h.output)} style={{ padding:"6px 8px", borderRadius:6, cursor:"pointer", marginBottom:4, background:bg3 }}>
                    <div style={{ fontSize:11, fontWeight:500, color:txt, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{h.topic}</div>
                    <div style={{ fontSize:10, color:txt2 }}>{h.tmpl} · {h.time}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Panel */}
          <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0 }}>
            {output ? (
              <>
                <div style={{ padding:"10px 16px", borderBottom:`1px solid ${bdr}`, background:bg2, display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
                  <div style={{ display:"flex", gap:16, fontSize:12 }}>
                    <span style={{ color:txt2 }}>Words: <span style={{ color:txt, fontWeight:600 }}>{wordCount}</span></span>
                    <span style={{ color:txt2 }}>Chars: <span style={{ color:txt, fontWeight:600 }}>{output.length}</span></span>
                    <span style={{ color:txt2 }}>Type: <span style={{ color:"#6B62E8", fontWeight:600 }}>{tmpl.label}</span></span>
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={copyOutput} style={{ padding:"5px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:"transparent", color:copied?"#059669":txt2, fontSize:12, cursor:"pointer" }}>{copied?"✅ Copied":"📋 Copy"}</button>
                    <button onClick={downloadOutput} style={{ padding:"5px 12px", borderRadius:8, border:"1px solid #0F766E44", background:"#0F766E11", color:"#0F766E", fontSize:12, cursor:"pointer" }}>⬇️ Download</button>
                    <button onClick={generate} disabled={loading} style={{ padding:"5px 12px", borderRadius:8, border:"1px solid #443DCB44", background:"#443DCB11", color:"#6B62E8", fontSize:12, cursor:"pointer" }}>🔄 Regenerate</button>
                  </div>
                </div>
                <div style={{ flex:1, overflowY:"auto", padding:20 }}>
                  <div style={{ maxWidth:740, margin:"0 auto" }}>
                    <textarea value={output} onChange={e=>setOutput(e.target.value)}
                      style={{ width:"100%", minHeight:500, padding:0, border:"none", background:"transparent", color:txt, fontSize:14, lineHeight:1.8, outline:"none", fontFamily:"inherit", resize:"none", boxSizing:"border-box" }} />
                  </div>
                </div>
              </>
            ) : (
              <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:40 }}>
                <div style={{ textAlign:"center", color:txt3 }}>
                  <div style={{ fontSize:48, marginBottom:16 }}>{tmpl.icon}</div>
                  <div style={{ fontSize:17, fontWeight:700, color:txt, marginBottom:8 }}>{tmpl.label}</div>
                  <div style={{ fontSize:13, color:txt2, marginBottom:24 }}>{tmpl.desc}</div>
                  {loading && <div style={{ fontSize:13, color:"#6B62E8" }}>✍️ Writing your {tmpl.label}...</div>}
                  {!loading && <div style={{ fontSize:12, color:txt3 }}>Fill in the details on the left and click Generate</div>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── IMAGE SEO TAB ── */}
      {activeTab==="imgseo" && (
        <div style={{ flex:1, overflowY:"auto", padding:24, background:bg }}>
          <div style={{ maxWidth:700, margin:"0 auto" }}>
            <div style={{ fontSize:18, fontWeight:700, color:txt, marginBottom:4 }}>🖼️ Image SEO Generator</div>
            <div style={{ fontSize:13, color:txt2, marginBottom:20 }}>Generate SEO-optimized alt text, file names, and image metadata</div>

            <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:16 }}>
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                <div>
                  <div style={{ fontSize:12, color:txt2, marginBottom:6 }}>Image Description <span style={{ color:"#DC2626" }}>*</span></div>
                  <textarea value={imgDesc} onChange={e=>setImgDesc(e.target.value)}
                    placeholder="Describe what's in the image... e.g. A smiling woman using a laptop at a coffee shop"
                    rows={3}
                    style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", resize:"none", fontFamily:"inherit", boxSizing:"border-box" }} />
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                  <div>
                    <div style={{ fontSize:12, color:txt2, marginBottom:6 }}>Target Keyword</div>
                    <input value={imgKeyword} onChange={e=>setImgKeyword(e.target.value)} placeholder="e.g. remote work tips"
                      style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", boxSizing:"border-box" }} />
                  </div>
                  <div>
                    <div style={{ fontSize:12, color:txt2, marginBottom:6 }}>Page Context</div>
                    <input value={imgContext} onChange={e=>setImgContext(e.target.value)} placeholder="e.g. blog post about productivity"
                      style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", boxSizing:"border-box" }} />
                  </div>
                </div>
                <button onClick={generateAltText} disabled={imgLoading||!imgDesc.trim()}
                  style={{ padding:"11px", borderRadius:10, border:"none", background:imgLoading||!imgDesc.trim()?"#333":"#443DCB", color:imgLoading||!imgDesc.trim()?txt3:"#fff", fontWeight:700, fontSize:14, cursor:imgLoading||!imgDesc.trim()?"not-allowed":"pointer" }}>
                  {imgLoading ? "🖼️ Generating..." : "🖼️ Generate Image SEO"}
                </button>
              </div>
            </div>

            {imgResult && (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {[
                  { label:"Alt Text (Primary)", value: imgResult.alt1, id:"alt1", icon:"🏷️", tip:"Best choice — most descriptive" },
                  { label:"Alt Text (Variation 2)", value: imgResult.alt2, id:"alt2", icon:"🏷️", tip:"Use for A/B testing" },
                  { label:"Alt Text (Variation 3)", value: imgResult.alt3, id:"alt3", icon:"🏷️", tip:"Alternative option" },
                  { label:"SEO File Name", value: imgResult.filename, id:"fname", icon:"📁", tip:"Rename image before upload" },
                  { label:"Title Attribute", value: imgResult.title, id:"title", icon:"💬", tip:"Shows on hover" },
                  { label:"Image Caption", value: imgResult.caption, id:"caption", icon:"📝", tip:"Display below image" },
                ].filter(item => item.value).map(item => (
                  <div key={item.id} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"12px 16px" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <span style={{ fontSize:14 }}>{item.icon}</span>
                        <span style={{ fontSize:12, fontWeight:600, color:txt }}>{item.label}</span>
                        <span style={{ fontSize:10, color:txt3, background:bg3, padding:"1px 6px", borderRadius:4 }}>{item.tip}</span>
                      </div>
                      <button onClick={()=>copyImg(item.value, item.id)}
                        style={{ padding:"3px 10px", borderRadius:6, border:`1px solid ${bdr}`, background:"transparent", color:imgCopied===item.id?"#059669":txt2, fontSize:11, cursor:"pointer" }}>
                        {imgCopied===item.id?"✅ Copied":"📋 Copy"}
                      </button>
                    </div>
                    <div style={{ fontSize:13, color:txt, background:bg3, padding:"8px 12px", borderRadius:8, fontFamily: item.id==="fname"?"monospace":"inherit" }}>
                      {item.value}
                    </div>
                    {item.id==="alt1" && (
                      <div style={{ fontSize:11, color:item.value.length>125?"#DC2626":"#059669", marginTop:4 }}>
                        {item.value.length} chars {item.value.length>125?"⚠️ Too long (max 125)":"✅ Good length"}
                      </div>
                    )}
                  </div>
                ))}

                {/* HTML snippet */}
                <div style={{ background:bg2, border:`1px solid #443DCB44`, borderRadius:10, padding:"12px 16px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                    <span style={{ fontSize:12, fontWeight:600, color:"#6B62E8" }}>💻 Ready-to-use HTML</span>
                    <button onClick={()=>copyImg(`<img src="${imgResult.filename}" alt="${imgResult.alt1}" title="${imgResult.title}" loading="lazy">`, "html")}
                      style={{ padding:"3px 10px", borderRadius:6, border:"1px solid #443DCB44", background:"transparent", color:imgCopied==="html"?"#059669":"#6B62E8", fontSize:11, cursor:"pointer" }}>
                      {imgCopied==="html"?"✅ Copied":"📋 Copy"}
                    </button>
                  </div>
                  <div style={{ fontSize:12, color:"#6B62E8", background:bg3, padding:"10px 12px", borderRadius:8, fontFamily:"monospace", lineHeight:1.6 }}>
                    {`<img src="${imgResult.filename}" alt="${imgResult.alt1}" title="${imgResult.title || ""}" loading="lazy">`}
                  </div>
                </div>
              </div>
            )}

            {!imgResult && !imgLoading && (
              <div style={{ textAlign:"center", padding:40, color:txt3 }}>
                <div style={{ fontSize:40, marginBottom:12 }}>🖼️</div>
                <div style={{ fontSize:14, color:txt2 }}>Describe your image to generate SEO metadata</div>
                <div style={{ fontSize:12, color:txt3, marginTop:8 }}>Alt text · File name · Title attribute · Caption · HTML snippet</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── BATCH ALT TEXT TAB ── */}
      {activeTab==="batch" && (
        <div style={{ flex:1, overflowY:"auto", padding:24, background:bg }}>
          <div style={{ maxWidth:700, margin:"0 auto" }}>
            <div style={{ fontSize:18, fontWeight:700, color:txt, marginBottom:4 }}>📋 Batch Alt Text Generator</div>
            <div style={{ fontSize:13, color:txt2, marginBottom:20 }}>Generate alt text for multiple images at once</div>

            <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:16 }}>
              <div style={{ fontSize:12, color:txt2, marginBottom:8 }}>Enter image descriptions (one per line, up to 10):</div>
              <textarea value={batchInput} onChange={e=>setBatchInput(e.target.value)}
                placeholder={"Red sports car on mountain road\nWoman cooking pasta in modern kitchen\nTeam meeting in office boardroom | keyword: team collaboration\nSunset over ocean beach"}
                rows={8}
                style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", resize:"none", fontFamily:"inherit", marginBottom:12, boxSizing:"border-box" }} />
              <div style={{ fontSize:11, color:txt3, marginBottom:12 }}>💡 Tip: Add " | keyword: your-keyword" after description to include a target keyword</div>
              <button onClick={generateBatch} disabled={batchLoading||!batchInput.trim()}
                style={{ padding:"10px 24px", borderRadius:10, border:"none", background:batchLoading||!batchInput.trim()?"#333":"#443DCB", color:batchLoading||!batchInput.trim()?txt3:"#fff", fontWeight:600, fontSize:13, cursor:batchLoading||!batchInput.trim()?"not-allowed":"pointer" }}>
                {batchLoading?`Generating ${batchResults.length+1}...`:"▶ Generate All"}
              </button>
            </div>

            {batchResults.length > 0 && (
              <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:txt }}>Results ({batchResults.length})</div>
                  <button onClick={exportBatchCSV} style={{ padding:"5px 14px", borderRadius:8, border:"1px solid #059669aa", background:"#05966911", color:"#059669", fontSize:12, cursor:"pointer", fontWeight:600 }}>⬇️ Export CSV</button>
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {batchResults.map((r,i) => (
                    <div key={i} style={{ background:bg3, border:`1px solid ${bdr}`, borderRadius:8, padding:"12px 14px" }}>
                      <div style={{ fontSize:11, color:txt2, marginBottom:6 }}>📷 {r.desc}</div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:8, alignItems:"start" }}>
                        <div>
                          <div style={{ fontSize:11, color:txt3, marginBottom:2 }}>Alt Text:</div>
                          <div style={{ fontSize:12, color:txt, fontWeight:500 }}>{r.alt}</div>
                          <div style={{ fontSize:11, color:txt3, marginTop:6, marginBottom:2 }}>File Name:</div>
                          <div style={{ fontSize:11, color:"#6B62E8", fontFamily:"monospace" }}>{r.file}</div>
                        </div>
                        <button onClick={()=>copyImg(`alt="${r.alt}"`, `batch-${i}`)}
                          style={{ padding:"4px 10px", borderRadius:6, border:`1px solid ${bdr}`, background:"transparent", color:imgCopied===`batch-${i}`?"#059669":txt2, fontSize:11, cursor:"pointer", flexShrink:0 }}>
                          {imgCopied===`batch-${i}`?"✅":"📋"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {batchResults.length===0 && !batchLoading && (
              <div style={{ textAlign:"center", padding:40, color:txt3 }}>
                <div style={{ fontSize:40, marginBottom:12 }}>📋</div>
                <div style={{ fontSize:14, color:txt2 }}>Paste image descriptions to generate alt text in bulk</div>
                <div style={{ fontSize:12, color:txt3, marginTop:8 }}>Export as CSV for easy upload to CMS</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}