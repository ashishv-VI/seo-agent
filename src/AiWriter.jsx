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

const TONES = ["Professional","Conversational","Authoritative","Friendly","Persuasive","Educational","Witty"];
const LENGTHS = ["Short (200-400 words)","Medium (400-800 words)","Long (800-1500 words)","Comprehensive (1500+ words)"];

export default function AiWriter({ dark, keys, model }) {
  const [tmpl, setTmpl]     = useState(TEMPLATES[0]);
  const [keyword, setKeyword] = useState("");
  const [topic, setTopic]   = useState("");
  const [tone, setTone]     = useState("Professional");
  const [length, setLength] = useState("Medium (400-800 words)");
  const [audience, setAudience] = useState("");
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState("");
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState([]);

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const txt3 = dark ? "#444"    : "#bbb";

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
    const key = model === "groq" ? keys.groq : keys.gemini;
    if (!key || !topic.trim()) return;
    setLoading(true); setOutput("");

    try {
      let text = "";
      if (model === "groq") {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
          body: JSON.stringify({ model: "llama-3.1-8b-instant", max_tokens: 2500, messages: [{ role: "user", content: buildPrompt() }] })
        });
        const d = await res.json();
        text = d.choices?.[0]?.message?.content || "";
      } else {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: buildPrompt() }] }] })
        });
        const d = await res.json();
        text = d.candidates?.[0]?.content?.parts?.[0]?.text || "";
      }
      setOutput(text);
      setHistory(h => [{ tmpl: tmpl.label, topic, output: text, time: new Date().toLocaleTimeString() }, ...h.slice(0, 9)]);
    } catch(e) { setOutput("Error: " + e.message); }
    setLoading(false);
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

  return (
    <div style={{ flex:1, display:"flex", overflow:"hidden", background:bg }}>
      {/* Left Panel — Config */}
      <div style={{ width:280, borderRight:`1px solid ${bdr}`, display:"flex", flexDirection:"column", background:bg2, flexShrink:0, overflowY:"auto" }}>
        <div style={{ padding:"16px", borderBottom:`1px solid ${bdr}` }}>
          <div style={{ fontSize:15, fontWeight:700, color:txt, marginBottom:2 }}>✍️ AI Writer</div>
          <div style={{ fontSize:11, color:txt2 }}>SEO-optimized content generator</div>
        </div>

        <div style={{ padding:14, flex:1, overflowY:"auto" }}>
          {/* Templates */}
          <div style={{ fontSize:11, color:txt3, marginBottom:8, textTransform:"uppercase", letterSpacing:"0.06em" }}>Content Type</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:16 }}>
            {TEMPLATES.map(t => (
              <div key={t.id} onClick={()=>setTmpl(t)} style={{ padding:"8px", borderRadius:8, border:`1px solid ${tmpl.id===t.id?"#7C3AED44":bdr}`, background:tmpl.id===t.id?"#7C3AED22":"transparent", cursor:"pointer" }}>
                <div style={{ fontSize:14, marginBottom:2 }}>{t.icon}</div>
                <div style={{ fontSize:11, fontWeight:tmpl.id===t.id?600:400, color:tmpl.id===t.id?"#A78BFA":txt }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* Topic */}
          <div style={{ fontSize:11, color:txt3, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.06em" }}>Topic / Title</div>
          <input value={topic} onChange={e=>setTopic(e.target.value)}
            placeholder="What to write about..."
            style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", marginBottom:12, boxSizing:"border-box" }} />

          {/* Keyword */}
          <div style={{ fontSize:11, color:txt3, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.06em" }}>Target Keyword</div>
          <input value={keyword} onChange={e=>setKeyword(e.target.value)}
            placeholder="Primary SEO keyword..."
            style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", marginBottom:12, boxSizing:"border-box" }} />

          {/* Audience */}
          <div style={{ fontSize:11, color:txt3, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.06em" }}>Target Audience</div>
          <input value={audience} onChange={e=>setAudience(e.target.value)}
            placeholder="e.g. small business owners"
            style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", marginBottom:12, boxSizing:"border-box" }} />

          {/* Tone */}
          <div style={{ fontSize:11, color:txt3, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.06em" }}>Tone</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginBottom:12 }}>
            {TONES.map(t => (
              <div key={t} onClick={()=>setTone(t)} style={{ padding:"4px 10px", borderRadius:20, fontSize:11, cursor:"pointer", fontWeight:tone===t?600:400, background:tone===t?"#7C3AED22":"transparent", color:tone===t?"#A78BFA":txt2, border:`1px solid ${tone===t?"#7C3AED44":bdr}` }}>
                {t}
              </div>
            ))}
          </div>

          {/* Length */}
          <div style={{ fontSize:11, color:txt3, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.06em" }}>Length</div>
          <select value={length} onChange={e=>setLength(e.target.value)}
            style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:12, outline:"none", marginBottom:16, cursor:"pointer" }}>
            {LENGTHS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>

          <button onClick={generate} disabled={loading||!topic.trim()}
            style={{ width:"100%", padding:"11px", borderRadius:10, border:"none", background:loading||!topic.trim()?"#333":"#7C3AED", color:loading||!topic.trim()?txt3:"#fff", fontWeight:700, fontSize:14, cursor:loading||!topic.trim()?"not-allowed":"pointer" }}>
            {loading ? "✍️ Writing..." : `✍️ Generate ${tmpl.label}`}
          </button>
        </div>

        {/* History */}
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

      {/* Right Panel — Output */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0 }}>
        {output ? (
          <>
            <div style={{ padding:"10px 16px", borderBottom:`1px solid ${bdr}`, background:bg2, display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
              <div style={{ display:"flex", gap:16, fontSize:12 }}>
                <span style={{ color:txt2 }}>Words: <span style={{ color:txt, fontWeight:600 }}>{wordCount}</span></span>
                <span style={{ color:txt2 }}>Chars: <span style={{ color:txt, fontWeight:600 }}>{output.length}</span></span>
                <span style={{ color:txt2 }}>Type: <span style={{ color:"#A78BFA", fontWeight:600 }}>{tmpl.label}</span></span>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={copyOutput} style={{ padding:"5px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:"transparent", color:copied?"#059669":txt2, fontSize:12, cursor:"pointer" }}>
                  {copied?"✅ Copied":"📋 Copy"}
                </button>
                <button onClick={downloadOutput} style={{ padding:"5px 12px", borderRadius:8, border:"1px solid #0F766E44", background:"#0F766E11", color:"#0F766E", fontSize:12, cursor:"pointer" }}>
                  ⬇️ Download
                </button>
                <button onClick={generate} disabled={loading} style={{ padding:"5px 12px", borderRadius:8, border:"1px solid #7C3AED44", background:"#7C3AED11", color:"#A78BFA", fontSize:12, cursor:"pointer" }}>
                  🔄 Regenerate
                </button>
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
              {loading && (
                <div style={{ fontSize:13, color:"#A78BFA" }}>✍️ Writing your {tmpl.label}...</div>
              )}
              {!loading && (
                <div style={{ fontSize:12, color:txt3 }}>Fill in the details on the left and click Generate</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}