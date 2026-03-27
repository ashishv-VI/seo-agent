import { useState } from "react";

const PAGE_TYPES = [
  { id:"blog",        icon:"✍️", label:"Blog Post",           desc:"Full SEO article 1500+ words" },
  { id:"landing",     icon:"🚀", label:"Landing Page",        desc:"Conversion-focused copy" },
  { id:"product",     icon:"🛒", label:"Product Page",        desc:"E-commerce product copy" },
  { id:"service",     icon:"🔧", label:"Service Page",        desc:"Local/agency service page" },
  { id:"pillar",      icon:"🏛️", label:"Pillar Page",         desc:"Comprehensive topic hub" },
  { id:"comparison",  icon:"⚔️", label:"Comparison Page",     desc:"X vs Y comparison" },
  { id:"howto",       icon:"📋", label:"How-To Guide",        desc:"Step-by-step tutorial" },
  { id:"listicle",    icon:"📝", label:"Listicle",            desc:"Top 10 / Best X list" },
];

const TONES = ["Professional","Conversational","Authoritative","Friendly","Persuasive","Educational"];
const AUDIENCES = ["Beginners","Professionals","Small Business Owners","Marketers","Developers","General Public"];
const WORD_COUNTS = ["800-1000","1000-1500","1500-2000","2000-3000","3000+"];

export default function PromptToContent({ dark, keys, model }) {
  const [topic, setTopic]         = useState("");
  const [keyword, setKeyword]     = useState("");
  const [pageType, setPageType]   = useState("blog");
  const [tone, setTone]           = useState("Professional");
  const [audience, setAudience]   = useState("Beginners");
  const [wordCount, setWordCount] = useState("1500-2000");
  const [loading, setLoading]     = useState(false);
  const [output, setOutput]       = useState(null);
  const [activeTab, setActiveTab] = useState("content");
  const [copied, setCopied]       = useState(null);
  const [step, setStep]           = useState(1); // 1=config, 2=generating, 3=result

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
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
        body: JSON.stringify({ model: "llama-3.1-8b-instant", max_tokens: 3000, messages: [{ role: "user", content: prompt }] })
      });
      const d = await res.json();
      return d.choices?.[0]?.message?.content || null;
    } else {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${keys?.gemini}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const d = await res.json();
      return d.candidates?.[0]?.content?.parts?.[0]?.text || null;
    }
  }

  async function generate() {
    if (!topic.trim()) return;
    setLoading(true); setStep(2); setOutput(null);

    const pt = PAGE_TYPES.find(p => p.id === pageType);

    // Run content + meta in parallel
    const contentPrompt = `You are an expert SEO content writer. Write a complete, publish-ready ${pt.label} for:

Topic: "${topic}"
Primary Keyword: "${keyword || topic}"
Tone: ${tone}
Target Audience: ${audience}
Word Count: ${wordCount} words

Requirements:
- Start with a direct answer/hook in first 40-60 words
- SEO-optimized H1 title (include keyword)
- Clear H2 and H3 structure
- Natural keyword placement (1-2% density)
- E-E-A-T signals (stats, expert tone, sources mentioned)
- Internal linking suggestions [marked as {{INTERNAL LINK: topic}}]
- FAQ section at end (5 Q&As, each answer 40-60 words)
- Strong conclusion with CTA
- Write ${wordCount} words minimum

Write the FULL content now. Do not truncate.`;

    const metaPrompt = `You are an SEO meta tag expert. Generate for:
Topic: "${topic}"
Keyword: "${keyword || topic}"
Page Type: ${pt.label}

Respond EXACTLY in this format:
TITLE: [50-60 char SEO title]
META_DESC: [140-155 char meta description with CTA]
SLUG: [url-friendly-slug]
OG_TITLE: [60 char social title]
OG_DESC: [120 char social description]
SCHEMA_TYPE: [Article/Product/HowTo/FAQPage]
READING_TIME: [estimated minutes]
WORD_COUNT_EST: [estimated word count]
FOCUS_KEYWORD: [primary keyword]
SECONDARY_KEYWORDS: [3 secondary keywords comma separated]
INTERNAL_LINKS: [3 suggested internal link topics]
EXTERNAL_LINKS: [2 authoritative sources to cite]`;

    const schemaPrompt = `Generate complete JSON-LD schema markup for:
Topic: "${topic}"
Page Type: ${pt.label}
Keyword: "${keyword || topic}"

Include:
1. ${pt.id === "howto" ? "HowTo" : pt.id === "blog" ? "Article" : pt.id === "product" ? "Product" : "WebPage"} schema
2. FAQPage schema (3 Q&As)
3. BreadcrumbList schema

Return only valid JSON-LD code blocks, ready to paste.`;

    try {
      const [contentText, metaText, schemaText] = await Promise.all([
        callAI(contentPrompt),
        callAI(metaPrompt),
        callAI(schemaPrompt),
      ]);

      const getMeta = (k) => {
        const m = metaText?.match(new RegExp(`${k}:\\s*(.+)`));
        return m ? m[1].trim() : "";
      };

      const wordCountActual = contentText ? contentText.split(/\s+/).length : 0;
      const readTime = Math.ceil(wordCountActual / 200);

      setOutput({
        content:    contentText || "",
        title:      getMeta("TITLE"),
        metaDesc:   getMeta("META_DESC"),
        slug:       getMeta("SLUG"),
        ogTitle:    getMeta("OG_TITLE"),
        ogDesc:     getMeta("OG_DESC"),
        schemaType: getMeta("SCHEMA_TYPE"),
        focusKw:    getMeta("FOCUS_KEYWORD"),
        secondaryKw:getMeta("SECONDARY_KEYWORDS"),
        internalLinks: getMeta("INTERNAL_LINKS"),
        externalLinks: getMeta("EXTERNAL_LINKS"),
        schema:     schemaText || "",
        wordCount:  wordCountActual,
        readTime,
        topic, keyword: keyword || topic, pageType: pt.label, tone, audience,
      });
      setStep(3);
      setActiveTab("content");
    } catch(e) { console.error(e); setStep(1); }
    setLoading(false);
  }

  function copyText(text, id) {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  function downloadTxt(content, filename) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
    a.download = filename; a.click();
  }

  function exportFullPackage() {
    if (!output) return;
    const full = `SEO CONTENT PACKAGE
${"=".repeat(60)}
Topic: ${output.topic}
Keyword: ${output.keyword}
Page Type: ${output.pageType}
Generated: ${new Date().toLocaleDateString()}
${"=".repeat(60)}

META TAGS
---------
Title: ${output.title}
Meta Description: ${output.metaDesc}
URL Slug: /${output.slug}
OG Title: ${output.ogTitle}
OG Description: ${output.ogDesc}
Focus Keyword: ${output.focusKw}
Secondary Keywords: ${output.secondaryKw}

CONTENT STATS
-------------
Word Count: ${output.wordCount} words
Reading Time: ${output.readTime} min

${"=".repeat(60)}
MAIN CONTENT
${"=".repeat(60)}

${output.content}

${"=".repeat(60)}
SCHEMA MARKUP
${"=".repeat(60)}

${output.schema}`;
    downloadTxt(full, `${output.slug || "content"}-seo-package.txt`);
  }

  function exportPDF() {
    if (!output) return;
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${output.title}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a18; }
.cover { background: linear-gradient(135deg, #443DCB, #4F46E5); color: #fff; padding: 60px 50px; }
.cover h1 { font-size: 28px; font-weight: 700; margin-bottom: 10px; }
.cover p { font-size: 14px; opacity: 0.8; }
.meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 30px 50px; background: #f8f5ff; }
.meta-item { background: #fff; border-radius: 8px; padding: 12px 16px; border-left: 3px solid #443DCB; }
.meta-label { font-size: 10px; text-transform: uppercase; color: #888; letter-spacing: 0.08em; margin-bottom: 4px; }
.meta-value { font-size: 13px; font-weight: 500; color: #1a1a18; }
.content-body { padding: 40px 50px; max-width: 800px; }
.content-body h1, .content-body h2, .content-body h3 { color: #443DCB; margin: 20px 0 10px; }
.content-body p { line-height: 1.8; margin-bottom: 14px; font-size: 14px; }
.schema-section { padding: 20px 50px; background: #f0f0ea; }
.schema-section pre { font-size: 11px; background: #fff; padding: 16px; border-radius: 8px; overflow-x: auto; white-space: pre-wrap; }
.footer { text-align: center; padding: 20px; font-size: 11px; color: #888; border-top: 1px solid #eee; }
@media print { @page { margin: 0; } }
</style></head><body>
<div class="cover">
  <h1>${output.title || output.topic}</h1>
  <p>${output.pageType} · ${output.wordCount} words · ${output.readTime} min read · Generated ${new Date().toLocaleDateString()}</p>
</div>
<div class="meta-grid">
  <div class="meta-item"><div class="meta-label">Meta Description</div><div class="meta-value">${output.metaDesc}</div></div>
  <div class="meta-item"><div class="meta-label">URL Slug</div><div class="meta-value">/${output.slug}</div></div>
  <div class="meta-item"><div class="meta-label">Focus Keyword</div><div class="meta-value">${output.focusKw}</div></div>
  <div class="meta-item"><div class="meta-label">Secondary Keywords</div><div class="meta-value">${output.secondaryKw}</div></div>
</div>
<div class="content-body"><pre style="white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.8">${output.content.replace(/</g,"&lt;")}</pre></div>
<div class="schema-section"><h3 style="margin-bottom:12px;color:#443DCB">Schema Markup</h3><pre>${output.schema.replace(/</g,"&lt;")}</pre></div>
<div class="footer">Generated by SEO Agent · ${new Date().toLocaleDateString()}</div>
</body></html>`;
    const win = window.open("", "_blank", "width=900,height=700");
    win.document.write(html); win.document.close();
    win.onload = () => setTimeout(() => win.print(), 500);
  }

  const tabStyle = (a, color = "#443DCB") => ({
    padding: "6px 16px", borderRadius: 20, fontSize: 12, cursor: "pointer",
    fontWeight: a ? 600 : 400, background: a ? color + "22" : "transparent",
    color: a ? color : txt2, border: `1px solid ${a ? color + "44" : bdr}`,
    whiteSpace: "nowrap",
  });

  const inp = {
    width: "100%", padding: "9px 12px", borderRadius: 8,
    border: `1px solid ${bdr}`, background: bg3, color: txt,
    fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 24, background: bg }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: txt, marginBottom: 4 }}>⚡ AI Prompt-to-Content Generator</div>
        <div style={{ fontSize: 13, color: txt2, marginBottom: 20 }}>
          Topic dalo → AI poora SEO page banata hai — Content + Meta Tags + Schema sab ek saath
        </div>

        {/* ── STEP 1: Config ── */}
        {step === 1 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

            {/* Left */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: txt, marginBottom: 16 }}>📝 Content Details</div>

                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: txt2, marginBottom: 6 }}>Topic / Title <span style={{ color: "#DC2626" }}>*</span></div>
                  <input value={topic} onChange={e => setTopic(e.target.value)}
                    placeholder="e.g. How to do keyword research for beginners"
                    style={inp} />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: txt2, marginBottom: 6 }}>Primary Keyword</div>
                  <input value={keyword} onChange={e => setKeyword(e.target.value)}
                    placeholder="e.g. keyword research (leave blank to auto-detect)"
                    style={inp} />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: txt2, marginBottom: 8 }}>Target Audience</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {AUDIENCES.map(a => (
                      <div key={a} onClick={() => setAudience(a)}
                        style={{ padding: "4px 12px", borderRadius: 20, fontSize: 11, cursor: "pointer", fontWeight: audience === a ? 600 : 400, background: audience === a ? "#443DCB22" : bg3, color: audience === a ? "#6B62E8" : txt2, border: `1px solid ${audience === a ? "#443DCB44" : bdr}` }}>
                        {a}
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: txt2, marginBottom: 8 }}>Tone</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {TONES.map(t => (
                      <div key={t} onClick={() => setTone(t)}
                        style={{ padding: "4px 12px", borderRadius: 20, fontSize: 11, cursor: "pointer", fontWeight: tone === t ? 600 : 400, background: tone === t ? "#0891B222" : bg3, color: tone === t ? "#0891B2" : txt2, border: `1px solid ${tone === t ? "#0891B244" : bdr}` }}>
                        {t}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, color: txt2, marginBottom: 8 }}>Word Count</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {WORD_COUNTS.map(w => (
                      <div key={w} onClick={() => setWordCount(w)}
                        style={{ padding: "4px 12px", borderRadius: 20, fontSize: 11, cursor: "pointer", fontWeight: wordCount === w ? 600 : 400, background: wordCount === w ? "#05966922" : bg3, color: wordCount === w ? "#059669" : txt2, border: `1px solid ${wordCount === w ? "#05966944" : bdr}` }}>
                        {w}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Right */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: txt, marginBottom: 16 }}>📄 Page Type</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {PAGE_TYPES.map(pt => (
                    <div key={pt.id} onClick={() => setPageType(pt.id)}
                      style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${pageType === pt.id ? "#443DCB44" : bdr}`, background: pageType === pt.id ? "#443DCB11" : bg3, cursor: "pointer" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                        <span style={{ fontSize: 16 }}>{pt.icon}</span>
                        <span style={{ fontSize: 12, fontWeight: pageType === pt.id ? 600 : 400, color: pageType === pt.id ? "#6B62E8" : txt }}>{pt.label}</span>
                      </div>
                      <div style={{ fontSize: 10, color: txt2 }}>{pt.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* What AI will generate */}
              <div style={{ background: "#443DCB11", border: "1px solid #443DCB33", borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#6B62E8", marginBottom: 10 }}>⚡ AI will generate:</div>
                {[
                  `📝 Full ${PAGE_TYPES.find(p=>p.id===pageType)?.label} (${wordCount} words)`,
                  "🏷️ Title tag + Meta description",
                  "🔗 URL slug suggestion",
                  "📱 OG tags for social media",
                  "🧩 JSON-LD Schema markup",
                  "🔑 Focus + secondary keywords",
                  "🔗 Internal + external link suggestions",
                  "❓ FAQ section (5 Q&As)",
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, padding: "5px 0", fontSize: 12, color: txt }}>
                    <span style={{ color: "#059669" }}>✓</span>{item}
                  </div>
                ))}
              </div>

              <button onClick={generate} disabled={loading || !topic.trim()}
                style={{ padding: "14px", borderRadius: 12, border: "none", background: loading || !topic.trim() ? "#333" : "linear-gradient(135deg, #443DCB, #4F46E5)", color: loading || !topic.trim() ? txt3 : "#fff", fontWeight: 700, fontSize: 15, cursor: loading || !topic.trim() ? "not-allowed" : "pointer" }}>
                ⚡ Generate Full SEO Page
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Generating ── */}
        {step === 2 && (
          <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 60, textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 20 }}>⚡</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: txt, marginBottom: 8 }}>Generating your SEO page...</div>
            <div style={{ fontSize: 13, color: txt2, marginBottom: 30 }}>AI is writing content + meta tags + schema all at once</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 320, margin: "0 auto" }}>
              {[
                { label: "Writing full content", color: "#443DCB" },
                { label: "Generating meta tags", color: "#4285F4" },
                { label: "Creating schema markup", color: "#059669" },
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, animation: "pulse 1s infinite" }} />
                  <div style={{ flex: 1, height: 4, borderRadius: 2, background: bg3, overflow: "hidden" }}>
                    <div style={{ height: "100%", background: item.color, borderRadius: 2, width: "60%", animation: "loading 1.5s ease-in-out infinite" }} />
                  </div>
                  <span style={{ fontSize: 11, color: txt2 }}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── STEP 3: Results ── */}
        {step === 3 && output && (
          <>
            {/* Stats Bar */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, marginBottom: 16 }}>
              {[
                { label: "Words",       value: output.wordCount,    color: "#443DCB" },
                { label: "Read Time",   value: `${output.readTime} min`, color: "#0891B2" },
                { label: "Page Type",   value: output.pageType,     color: "#059669" },
                { label: "Tone",        value: output.tone,         color: "#D97706" },
                { label: "Audience",    value: output.audience,     color: "#EA4335" },
              ].map(s => (
                <div key={s.label} style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, padding: "12px 14px", textAlign: "center", borderTop: `3px solid ${s.color}` }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: s.color, marginBottom: 2 }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: txt2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              <button onClick={() => { setStep(1); setOutput(null); }}
                style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${bdr}`, background: "transparent", color: txt2, fontSize: 12, cursor: "pointer" }}>
                ← New Page
              </button>
              <button onClick={() => copyText(output.content, "content")}
                style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${bdr}`, background: "transparent", color: copied === "content" ? "#059669" : txt2, fontSize: 12, cursor: "pointer" }}>
                {copied === "content" ? "✅ Copied!" : "📋 Copy Content"}
              </button>
              <button onClick={exportFullPackage}
                style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #059669aa", background: "#05966911", color: "#059669", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                ⬇️ Download Package
              </button>
              <button onClick={exportPDF}
                style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#443DCB", color: "#fff", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                📥 Export PDF
              </button>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              <div style={tabStyle(activeTab === "content")} onClick={() => setActiveTab("content")}>📝 Content</div>
              <div style={tabStyle(activeTab === "meta", "#4285F4")} onClick={() => setActiveTab("meta")}>🏷️ Meta Tags</div>
              <div style={tabStyle(activeTab === "schema", "#059669")} onClick={() => setActiveTab("schema")}>🧩 Schema</div>
              <div style={tabStyle(activeTab === "links", "#D97706")} onClick={() => setActiveTab("links")}>🔗 Links</div>
            </div>

            {/* Content Tab */}
            {activeTab === "content" && (
              <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", borderBottom: `1px solid ${bdr}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: bg3 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: txt }}>📝 Full Content — {output.wordCount} words</div>
                  <button onClick={() => copyText(output.content, "content")}
                    style={{ padding: "5px 12px", borderRadius: 8, border: `1px solid ${bdr}`, background: "transparent", color: copied === "content" ? "#059669" : txt2, fontSize: 11, cursor: "pointer" }}>
                    {copied === "content" ? "✅ Copied" : "📋 Copy"}
                  </button>
                </div>
                <div style={{ padding: 20 }}>
                  <textarea value={output.content} onChange={e => setOutput(o => ({ ...o, content: e.target.value }))}
                    style={{ width: "100%", minHeight: 500, padding: 0, border: "none", background: "transparent", color: txt, fontSize: 13, lineHeight: 1.9, outline: "none", fontFamily: "inherit", resize: "none", boxSizing: "border-box" }} />
                </div>
              </div>
            )}

            {/* Meta Tags Tab */}
            {activeTab === "meta" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { label: "Title Tag",          value: output.title,      id: "title",  tip: `${output.title?.length || 0} chars` },
                  { label: "Meta Description",   value: output.metaDesc,   id: "desc",   tip: `${output.metaDesc?.length || 0} chars` },
                  { label: "URL Slug",           value: `/${output.slug}`, id: "slug",   tip: "Copy and use as URL" },
                  { label: "OG Title",           value: output.ogTitle,    id: "ogtitle",tip: "For social sharing" },
                  { label: "OG Description",     value: output.ogDesc,     id: "ogdesc", tip: "For social sharing" },
                  { label: "Focus Keyword",      value: output.focusKw,    id: "fkw",    tip: "Primary target" },
                  { label: "Secondary Keywords", value: output.secondaryKw,id: "skw",    tip: "Also target these" },
                ].map(item => (
                  <div key={item.id} style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, padding: "12px 16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: txt }}>{item.label}</span>
                        <span style={{ fontSize: 10, color: txt3, background: bg3, padding: "1px 6px", borderRadius: 4 }}>{item.tip}</span>
                      </div>
                      <button onClick={() => copyText(item.value, item.id)}
                        style={{ padding: "3px 10px", borderRadius: 6, border: `1px solid ${bdr}`, background: "transparent", color: copied === item.id ? "#059669" : txt2, fontSize: 11, cursor: "pointer" }}>
                        {copied === item.id ? "✅" : "📋"}
                      </button>
                    </div>
                    <div style={{ fontSize: 13, color: txt, background: bg3, padding: "8px 12px", borderRadius: 8 }}>
                      {item.value || <span style={{ color: txt3, fontStyle: "italic" }}>Not generated</span>}
                    </div>
                  </div>
                ))}

                {/* HTML Meta Code */}
                <div style={{ background: bg2, border: "1px solid #443DCB44", borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ padding: "10px 16px", background: "#443DCB11", borderBottom: "1px solid #443DCB22", display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#6B62E8" }}>💻 Ready-to-use HTML</span>
                    <button onClick={() => copyText(`<title>${output.title}</title>\n<meta name="description" content="${output.metaDesc}">\n<meta property="og:title" content="${output.ogTitle}">\n<meta property="og:description" content="${output.ogDesc}">`, "html")}
                      style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid #443DCB44", background: "transparent", color: copied === "html" ? "#059669" : "#6B62E8", fontSize: 11, cursor: "pointer" }}>
                      {copied === "html" ? "✅" : "📋 Copy"}
                    </button>
                  </div>
                  <div style={{ padding: "12px 16px" }}>
                    <pre style={{ fontSize: 11, color: "#6B62E8", fontFamily: "monospace", lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap" }}>
{`<title>${output.title}</title>
<meta name="description" content="${output.metaDesc}">
<link rel="canonical" href="https://yoursite.com/${output.slug}">
<meta property="og:title" content="${output.ogTitle}">
<meta property="og:description" content="${output.ogDesc}">`}
                    </pre>
                  </div>
                </div>
              </div>
            )}

            {/* Schema Tab */}
            {activeTab === "schema" && (
              <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", borderBottom: `1px solid ${bdr}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: bg3 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: txt }}>🧩 JSON-LD Schema Markup</div>
                  <button onClick={() => copyText(output.schema, "schema")}
                    style={{ padding: "5px 12px", borderRadius: 8, border: `1px solid ${bdr}`, background: "transparent", color: copied === "schema" ? "#059669" : txt2, fontSize: 11, cursor: "pointer" }}>
                    {copied === "schema" ? "✅ Copied" : "📋 Copy"}
                  </button>
                </div>
                <div style={{ padding: 20 }}>
                  <pre style={{ fontSize: 12, color: txt, fontFamily: "monospace", lineHeight: 1.7, whiteSpace: "pre-wrap", margin: 0 }}>
                    {output.schema || "Schema not generated"}
                  </pre>
                </div>
              </div>
            )}

            {/* Links Tab */}
            {activeTab === "links" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: txt, marginBottom: 14 }}>🔗 Internal Link Suggestions</div>
                  {output.internalLinks.split(",").map((link, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: `1px solid ${bdr}22` }}>
                      <span style={{ color: "#443DCB", flexShrink: 0 }}>→</span>
                      <span style={{ fontSize: 13, color: txt }}>{link.trim()}</span>
                    </div>
                  ))}
                </div>
                <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: txt, marginBottom: 14 }}>🌐 External Link Suggestions</div>
                  {output.externalLinks.split(",").map((link, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: `1px solid ${bdr}22` }}>
                      <span style={{ color: "#059669", flexShrink: 0 }}>↗</span>
                      <span style={{ fontSize: 13, color: txt }}>{link.trim()}</span>
                    </div>
                  ))}
                </div>
                <div style={{ background: "#05966911", border: "1px solid #05966933", borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#059669", marginBottom: 8 }}>💡 Pro Tip</div>
                  <div style={{ fontSize: 12, color: txt2, lineHeight: 1.6 }}>
                    Content mein <code style={{ background: bg3, padding: "1px 6px", borderRadius: 4, fontSize: 11 }}>{"{{INTERNAL LINK: topic}}"}</code> markers hain — inhein apne actual page URLs se replace karo.
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Empty State */}
        {step === 1 && !output && (
          <div style={{ textAlign: "center", padding: "30px 0 0", color: txt3 }}>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 10 }}>
              {["How to start a blog in 2026","Best CRM software for small business","10 ways to improve website speed","What is technical SEO"].map(ex => (
                <div key={ex} onClick={() => setTopic(ex)}
                  style={{ padding: "6px 14px", borderRadius: 20, border: `1px solid ${bdr}`, color: txt2, fontSize: 12, cursor: "pointer" }}>
                  {ex}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}