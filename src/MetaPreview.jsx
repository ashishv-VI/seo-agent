import { useState } from "react";

const PREVIEW_TABS = [
  { id:"google",   icon:"🔵", label:"Google Search" },
  { id:"mobile",   icon:"📱", label:"Google Mobile" },
  { id:"twitter",  icon:"🐦", label:"Twitter/X Card" },
  { id:"facebook", icon:"👤", label:"Facebook OG" },
  { id:"linkedin", icon:"💼", label:"LinkedIn" },
];

const CHAR_LIMITS = {
  title:       { min:50, max:60,  warn:70 },
  description: { min:120, max:160, warn:170 },
  ogTitle:     { min:40, max:60,  warn:80 },
  ogDesc:      { min:100, max:200, warn:250 },
};

export default function MetaPreview({ dark, keys, model }) {
  const [activeTab, setActiveTab] = useState("google");
  const [aiLoading, setAiLoading] = useState(false);
  const [topic, setTopic]         = useState("");

  const [meta, setMeta] = useState({
    title:       "",
    description: "",
    url:         "https://yoursite.com/page",
    siteName:    "Your Site Name",
    ogTitle:     "",
    ogDesc:      "",
    ogImage:     "https://via.placeholder.com/1200x630/7C3AED/ffffff?text=OG+Image",
    twitterCard: "summary_large_image",
    twitterSite: "@yourhandle",
    favicon:     "🌐",
    keyword:     "",
  });

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const txt3 = dark ? "#444"    : "#bbb";

  const upd = (k, v) => setMeta(m => ({ ...m, [k]: v }));

  // Auto-sync og fields if empty
  const ogTitle = meta.ogTitle || meta.title;
  const ogDesc  = meta.ogDesc  || meta.description;

  // Char count color
  const charColor = (val, field) => {
    const l = val.length;
    const lim = CHAR_LIMITS[field];
    if (!lim) return "#059669";
    if (l > lim.warn) return "#DC2626";
    if (l > lim.max)  return "#D97706";
    if (l < lim.min)  return "#D97706";
    return "#059669";
  };

  const charMsg = (val, field) => {
    const l = val.length;
    const lim = CHAR_LIMITS[field];
    if (!lim) return "";
    if (l > lim.warn) return "Too long!";
    if (l > lim.max)  return "Slightly long";
    if (l < lim.min)  return "Too short";
    return "✅ Perfect";
  };

  // Truncate helper
  const trunc = (str, n) => str.length > n ? str.slice(0, n) + "..." : str;

  // AI Generate
  async function generateWithAI() {
    if (!topic.trim()) return;
    const key = model === "groq" ? keys?.groq : keys?.gemini;
    if (!key) return;
    setAiLoading(true);

    const prompt = `You are an expert SEO meta tag specialist. Generate optimized meta tags for:
Topic/Page: "${topic}"

Respond EXACTLY in this format (no extra text):
TITLE: [50-60 char SEO title with keyword near front]
DESCRIPTION: [140-155 char compelling meta description with CTA]
OG_TITLE: [55-65 char Open Graph title]
OG_DESC: [100-150 char OG description]
KEYWORD: [primary target keyword]
SITE_NAME: [brand/site name]

Rules:
- Title: keyword first, power word, under 60 chars
- Description: include keyword, value prop, CTA, under 155 chars
- No quotes around values`;

    try {
      let text = "";
      if (model === "groq") {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
          body: JSON.stringify({ model: "llama-3.1-8b-instant", max_tokens: 400, messages: [{ role: "user", content: prompt }] })
        });
        const d = await res.json();
        text = d.choices?.[0]?.message?.content || "";
      } else {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const d = await res.json();
        text = d.candidates?.[0]?.content?.parts?.[0]?.text || "";
      }

      const get = (k) => {
        const m = text.match(new RegExp(`${k}:\\s*(.+)`));
        return m ? m[1].trim() : "";
      };

      setMeta(m => ({
        ...m,
        title:       get("TITLE")     || m.title,
        description: get("DESCRIPTION") || m.description,
        ogTitle:     get("OG_TITLE")  || m.ogTitle,
        ogDesc:      get("OG_DESC")   || m.ogDesc,
        keyword:     get("KEYWORD")   || m.keyword,
        siteName:    get("SITE_NAME") || m.siteName,
      }));
    } catch(e) { console.error(e); }
    setAiLoading(false);
  }

  // Export HTML code
  function exportCode() {
    const code = `<!-- Primary Meta Tags -->
<title>${meta.title}</title>
<meta name="title" content="${meta.title}">
<meta name="description" content="${meta.description}">
${meta.keyword ? `<meta name="keywords" content="${meta.keyword}">` : ""}

<!-- Open Graph / Facebook -->
<meta property="og:type" content="website">
<meta property="og:url" content="${meta.url}">
<meta property="og:title" content="${ogTitle}">
<meta property="og:description" content="${ogDesc}">
<meta property="og:image" content="${meta.ogImage}">
<meta property="og:site_name" content="${meta.siteName}">

<!-- Twitter -->
<meta property="twitter:card" content="${meta.twitterCard}">
<meta property="twitter:url" content="${meta.url}">
<meta property="twitter:title" content="${ogTitle}">
<meta property="twitter:description" content="${ogDesc}">
<meta property="twitter:image" content="${meta.ogImage}">
${meta.twitterSite ? `<meta property="twitter:site" content="${meta.twitterSite}">` : ""}`;
    navigator.clipboard.writeText(code);
  }

  const tabStyle = (a, color = "#7C3AED") => ({
    padding: "6px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer",
    fontWeight: a ? 600 : 400, background: a ? color + "22" : "transparent",
    color: a ? color : txt2, border: `1px solid ${a ? color + "44" : bdr}`,
    whiteSpace: "nowrap",
  });

  const inp = {
    width: "100%", padding: "9px 12px", borderRadius: 8,
    border: `1px solid ${bdr}`, background: bg3, color: txt,
    fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
  };

  // ── Score bar ──
  const scores = [
    { label: "Title",       val: meta.title,       field: "title" },
    { label: "Description", val: meta.description, field: "description" },
    { label: "OG Title",    val: ogTitle,           field: "ogTitle" },
    { label: "OG Desc",     val: ogDesc,            field: "ogDesc" },
  ];
  const scoreTotal = scores.filter(s => {
    const l = s.val.length;
    const lim = CHAR_LIMITS[s.field];
    return lim && l >= lim.min && l <= lim.max;
  }).length;
  const overallScore = Math.round((scoreTotal / scores.length) * 100);
  const scoreColor = overallScore >= 75 ? "#059669" : overallScore >= 50 ? "#D97706" : "#DC2626";

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 24, background: bg }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: txt, marginBottom: 4 }}>🏷️ Meta Tag Previewer</div>
        <div style={{ fontSize: 13, color: txt2, marginBottom: 20 }}>
          Live preview — Google · Twitter · Facebook · LinkedIn · AI generator
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

          {/* ── LEFT: Inputs ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* AI Generator */}
            <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: txt, marginBottom: 8 }}>🤖 AI Generator</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={topic} onChange={e => setTopic(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && generateWithAI()}
                  placeholder="Enter page topic or keyword..."
                  style={{ ...inp, flex: 1 }} />
                <button onClick={generateWithAI} disabled={aiLoading || !topic.trim()}
                  style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: aiLoading || !topic.trim() ? "#333" : "#7C3AED", color: aiLoading || !topic.trim() ? txt3 : "#fff", fontWeight: 600, fontSize: 12, cursor: aiLoading || !topic.trim() ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>
                  {aiLoading ? "..." : "✨ Generate"}
                </button>
              </div>
            </div>

            {/* Score Card */}
            <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: txt }}>📊 Meta Score</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: scoreColor }}>{overallScore}%</div>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: bg3, overflow: "hidden", marginBottom: 10 }}>
                <div style={{ height: "100%", width: `${overallScore}%`, background: scoreColor, borderRadius: 3, transition: "width 0.3s" }} />
              </div>
              {scores.map(s => (
                <div key={s.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                  <span style={{ color: txt2 }}>{s.label}</span>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ color: txt3 }}>{s.val.length} chars</span>
                    <span style={{ color: charColor(s.val, s.field), fontWeight: 600 }}>{charMsg(s.val, s.field)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Primary Meta */}
            <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: txt, marginBottom: 12 }}>🔵 Primary Meta Tags</div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: txt2, marginBottom: 4 }}>
                  <span>Title Tag</span>
                  <span style={{ color: charColor(meta.title, "title") }}>{meta.title.length}/60 · {charMsg(meta.title, "title")}</span>
                </div>
                <input value={meta.title} onChange={e => upd("title", e.target.value)}
                  placeholder="SEO Title (50-60 chars)" style={inp} />
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: txt2, marginBottom: 4 }}>
                  <span>Meta Description</span>
                  <span style={{ color: charColor(meta.description, "description") }}>{meta.description.length}/160 · {charMsg(meta.description, "description")}</span>
                </div>
                <textarea value={meta.description} onChange={e => upd("description", e.target.value)}
                  placeholder="Meta description (120-160 chars)..." rows={3}
                  style={{ ...inp, resize: "none" }} />
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: txt2, marginBottom: 4 }}>URL</div>
                <input value={meta.url} onChange={e => upd("url", e.target.value)}
                  placeholder="https://yoursite.com/page" style={inp} />
              </div>

              <div>
                <div style={{ fontSize: 11, color: txt2, marginBottom: 4 }}>Target Keyword</div>
                <input value={meta.keyword} onChange={e => upd("keyword", e.target.value)}
                  placeholder="primary keyword" style={inp} />
              </div>
            </div>

            {/* OG / Social */}
            <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: txt, marginBottom: 12 }}>📱 Open Graph / Social</div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: txt2, marginBottom: 4 }}>Site Name</div>
                <input value={meta.siteName} onChange={e => upd("siteName", e.target.value)}
                  placeholder="Your Brand Name" style={inp} />
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: txt2, marginBottom: 4 }}>
                  <span>OG Title (leave blank to use Title)</span>
                  <span style={{ color: charColor(ogTitle, "ogTitle") }}>{ogTitle.length} chars</span>
                </div>
                <input value={meta.ogTitle} onChange={e => upd("ogTitle", e.target.value)}
                  placeholder="Override for social (optional)" style={inp} />
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: txt2, marginBottom: 4 }}>
                  <span>OG Description (leave blank to use Description)</span>
                  <span style={{ color: charColor(ogDesc, "ogDesc") }}>{ogDesc.length} chars</span>
                </div>
                <textarea value={meta.ogDesc} onChange={e => upd("ogDesc", e.target.value)}
                  placeholder="Override for social (optional)..." rows={2}
                  style={{ ...inp, resize: "none" }} />
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: txt2, marginBottom: 4 }}>OG Image URL</div>
                <input value={meta.ogImage} onChange={e => upd("ogImage", e.target.value)}
                  placeholder="https://yoursite.com/og-image.jpg (1200×630)" style={inp} />
              </div>

              <div>
                <div style={{ fontSize: 11, color: txt2, marginBottom: 4 }}>Twitter Handle</div>
                <input value={meta.twitterSite} onChange={e => upd("twitterSite", e.target.value)}
                  placeholder="@yourhandle" style={inp} />
              </div>
            </div>

            {/* Export */}
            <button onClick={exportCode}
              style={{ padding: "11px", borderRadius: 10, border: "none", background: "#7C3AED", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              📋 Copy HTML Code
            </button>
          </div>

          {/* ── RIGHT: Previews ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Tab Switcher */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {PREVIEW_TABS.map(t => (
                <div key={t.id} style={tabStyle(activeTab === t.id)} onClick={() => setActiveTab(t.id)}>
                  {t.icon} {t.label}
                </div>
              ))}
            </div>

            {/* ── Google Desktop Preview ── */}
            {activeTab === "google" && (
              <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 11, color: txt2, marginBottom: 14, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Google Search Result Preview</div>
                <div style={{ background: dark ? "#1a1a1a" : "#fff", borderRadius: 10, padding: "16px 20px", border: `1px solid ${bdr}` }}>
                  {/* Favicon + URL */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#7C3AED22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>
                      {meta.favicon}
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: dark ? "#bbb" : "#202124" }}>{meta.siteName || "Your Site"}</div>
                      <div style={{ fontSize: 11, color: dark ? "#888" : "#4d5156" }}>{trunc(meta.url, 60)}</div>
                    </div>
                  </div>
                  {/* Title */}
                  <div style={{ fontSize: 20, color: dark ? "#8ab4f8" : "#1a0dab", cursor: "pointer", marginBottom: 4, lineHeight: 1.3, fontWeight: 400 }}>
                    {meta.title ? trunc(meta.title, 60) : <span style={{ color: txt3, fontStyle: "italic" }}>Enter title above...</span>}
                  </div>
                  {/* Description */}
                  <div style={{ fontSize: 13, color: dark ? "#bdc1c6" : "#4d5156", lineHeight: 1.58 }}>
                    {meta.description ? trunc(meta.description, 160) : <span style={{ color: txt3, fontStyle: "italic" }}>Enter description above...</span>}
                  </div>
                </div>

                {/* Keyword check */}
                {meta.keyword && (
                  <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                    <div style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: meta.title.toLowerCase().includes(meta.keyword.toLowerCase()) ? "#05966922" : "#DC262622", color: meta.title.toLowerCase().includes(meta.keyword.toLowerCase()) ? "#059669" : "#DC2626" }}>
                      Title: {meta.title.toLowerCase().includes(meta.keyword.toLowerCase()) ? "✅ Keyword found" : "❌ Keyword missing"}
                    </div>
                    <div style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: meta.description.toLowerCase().includes(meta.keyword.toLowerCase()) ? "#05966922" : "#DC262622", color: meta.description.toLowerCase().includes(meta.keyword.toLowerCase()) ? "#059669" : "#DC2626" }}>
                      Desc: {meta.description.toLowerCase().includes(meta.keyword.toLowerCase()) ? "✅ Keyword found" : "❌ Keyword missing"}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Google Mobile Preview ── */}
            {activeTab === "mobile" && (
              <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 20, display: "flex", justifyContent: "center" }}>
                <div style={{ width: 320, background: dark ? "#1a1a1a" : "#fff", borderRadius: 16, padding: 16, border: `1px solid ${bdr}`, boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}>
                  <div style={{ fontSize: 10, color: dark ? "#888" : "#70757a", marginBottom: 8 }}>Google Search · Mobile</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#7C3AED22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9 }}>{meta.favicon}</div>
                    <div style={{ fontSize: 11, color: dark ? "#bbb" : "#202124" }}>{meta.siteName || "Your Site"}</div>
                  </div>
                  <div style={{ fontSize: 16, color: dark ? "#8ab4f8" : "#1a0dab", marginBottom: 4, lineHeight: 1.3, fontWeight: 400 }}>
                    {meta.title ? trunc(meta.title, 55) : <span style={{ color: txt3, fontStyle: "italic" }}>Enter title...</span>}
                  </div>
                  <div style={{ fontSize: 12, color: dark ? "#bdc1c6" : "#4d5156", lineHeight: 1.5 }}>
                    {meta.description ? trunc(meta.description, 120) : <span style={{ color: txt3, fontStyle: "italic" }}>Enter description...</span>}
                  </div>
                </div>
              </div>
            )}

            {/* ── Twitter Preview ── */}
            {activeTab === "twitter" && (
              <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 11, color: txt2, marginBottom: 14, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Twitter/X Card Preview</div>
                <div style={{ background: dark ? "#15202b" : "#fff", borderRadius: 16, overflow: "hidden", border: `1px solid ${dark ? "#2f3336" : "#e1e8ed"}`, maxWidth: 440 }}>
                  <div style={{ height: 220, background: `linear-gradient(135deg, #7C3AED, #4F46E5)`, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                    {meta.ogImage && meta.ogImage.startsWith("http") ? (
                      <img src={meta.ogImage} alt="OG" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => e.target.style.display = "none"} />
                    ) : (
                      <span style={{ fontSize: 40 }}>🖼️</span>
                    )}
                  </div>
                  <div style={{ padding: "12px 16px 14px" }}>
                    <div style={{ fontSize: 12, color: dark ? "#8b98a5" : "#8899a6", marginBottom: 4 }}>{new URL(meta.url.startsWith("http") ? meta.url : "https://" + meta.url).hostname}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: dark ? "#e7e9ea" : "#14171a", marginBottom: 4, lineHeight: 1.3 }}>
                      {ogTitle ? trunc(ogTitle, 70) : <span style={{ color: txt3, fontStyle: "italic" }}>Title preview...</span>}
                    </div>
                    <div style={{ fontSize: 13, color: dark ? "#8b98a5" : "#657786", lineHeight: 1.4 }}>
                      {ogDesc ? trunc(ogDesc, 100) : <span style={{ color: txt3, fontStyle: "italic" }}>Description preview...</span>}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Facebook Preview ── */}
            {activeTab === "facebook" && (
              <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 11, color: txt2, marginBottom: 14, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Facebook OG Preview</div>
                <div style={{ background: dark ? "#242526" : "#f0f2f5", borderRadius: 8, overflow: "hidden", border: `1px solid ${dark ? "#3a3b3c" : "#dddfe2"}`, maxWidth: 440 }}>
                  <div style={{ height: 230, background: `linear-gradient(135deg, #4285F4, #7C3AED)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {meta.ogImage && meta.ogImage.startsWith("http") ? (
                      <img src={meta.ogImage} alt="OG" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => e.target.style.display = "none"} />
                    ) : (
                      <span style={{ fontSize: 40 }}>🖼️</span>
                    )}
                  </div>
                  <div style={{ padding: "10px 12px 12px", background: dark ? "#3a3b3c" : "#f0f2f5" }}>
                    <div style={{ fontSize: 11, color: dark ? "#b0b3b8" : "#606770", textTransform: "uppercase", marginBottom: 4, letterSpacing: "0.04em" }}>
                      {new URL(meta.url.startsWith("http") ? meta.url : "https://" + meta.url).hostname}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: dark ? "#e4e6eb" : "#1c1e21", marginBottom: 4, lineHeight: 1.3 }}>
                      {ogTitle ? trunc(ogTitle, 80) : <span style={{ color: txt3, fontStyle: "italic" }}>Title preview...</span>}
                    </div>
                    <div style={{ fontSize: 13, color: dark ? "#b0b3b8" : "#606770", lineHeight: 1.4 }}>
                      {ogDesc ? trunc(ogDesc, 110) : <span style={{ color: txt3, fontStyle: "italic" }}>Description preview...</span>}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── LinkedIn Preview ── */}
            {activeTab === "linkedin" && (
              <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 11, color: txt2, marginBottom: 14, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>LinkedIn Preview</div>
                <div style={{ background: dark ? "#1b1f23" : "#fff", borderRadius: 8, overflow: "hidden", border: `1px solid ${dark ? "#30363d" : "#dce6f0"}`, maxWidth: 440 }}>
                  <div style={{ height: 220, background: `linear-gradient(135deg, #0077b5, #00a0dc)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {meta.ogImage && meta.ogImage.startsWith("http") ? (
                      <img src={meta.ogImage} alt="OG" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => e.target.style.display = "none"} />
                    ) : (
                      <span style={{ fontSize: 40 }}>🖼️</span>
                    )}
                  </div>
                  <div style={{ padding: "12px 16px 14px" }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: dark ? "#e6edf3" : "#000", marginBottom: 4, lineHeight: 1.3 }}>
                      {ogTitle ? trunc(ogTitle, 70) : <span style={{ color: txt3, fontStyle: "italic" }}>Title preview...</span>}
                    </div>
                    <div style={{ fontSize: 12, color: dark ? "#8b949e" : "#666", lineHeight: 1.4, marginBottom: 6 }}>
                      {ogDesc ? trunc(ogDesc, 100) : <span style={{ color: txt3, fontStyle: "italic" }}>Description preview...</span>}
                    </div>
                    <div style={{ fontSize: 11, color: dark ? "#0a85d1" : "#0077b5" }}>
                      {new URL(meta.url.startsWith("http") ? meta.url : "https://" + meta.url).hostname}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* HTML Code Preview */}
            <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "10px 16px", borderBottom: `1px solid ${bdr}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: bg3 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: txt }}>💻 HTML Code</div>
                <button onClick={exportCode} style={{ padding: "4px 12px", borderRadius: 6, border: "none", background: "#7C3AED", color: "#fff", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>📋 Copy</button>
              </div>
              <div style={{ padding: "12px 16px", overflowX: "auto" }}>
                <pre style={{ fontSize: 11, color: "#A78BFA", fontFamily: "monospace", lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap" }}>
{`<title>${meta.title || "Your Title"}</title>
<meta name="description" content="${meta.description || "Your description"}">
<meta property="og:title" content="${ogTitle || "Your OG Title"}">
<meta property="og:description" content="${ogDesc || "Your OG description"}">
<meta property="og:image" content="${meta.ogImage}">
<meta property="twitter:card" content="${meta.twitterCard}">`}
                </pre>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}