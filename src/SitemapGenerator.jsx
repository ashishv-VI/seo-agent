import { useState } from "react";

const PAGE_TYPES = [
  { id:"homepage",  icon:"🏠", label:"Homepage",        priority:"1.0", freq:"daily"  },
  { id:"blog",      icon:"✍️", label:"Blog Posts",      priority:"0.8", freq:"weekly" },
  { id:"product",   icon:"🛒", label:"Product Pages",   priority:"0.9", freq:"weekly" },
  { id:"category",  icon:"📂", label:"Category Pages",  priority:"0.7", freq:"weekly" },
  { id:"service",   icon:"🔧", label:"Service Pages",   priority:"0.8", freq:"monthly"},
  { id:"about",     icon:"ℹ️", label:"About/Contact",   priority:"0.5", freq:"monthly"},
  { id:"landing",   icon:"🚀", label:"Landing Pages",   priority:"0.9", freq:"weekly" },
  { id:"location",  icon:"📍", label:"Location Pages",  priority:"0.7", freq:"monthly"},
];

const FREQ_OPTIONS = ["always","hourly","daily","weekly","monthly","yearly","never"];
const PRIORITY_OPTIONS = ["1.0","0.9","0.8","0.7","0.6","0.5","0.4","0.3","0.2","0.1"];

export default function SitemapGenerator({ dark, keys, model }) {
  const [domain, setDomain]       = useState("");
  const [urls, setUrls]           = useState([{ id:1, loc:"", priority:"0.8", freq:"weekly", lastmod:new Date().toISOString().split("T")[0] }]);
  const [aiNiche, setAiNiche]     = useState("");
  const [aiPages, setAiPages]     = useState("20");
  const [aiLoading, setAiLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("manual");
  const [output, setOutput]       = useState("");
  const [copied, setCopied]       = useState(false);
  const [selectedTypes, setSelectedTypes] = useState(["homepage","blog","product","service"]);

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const txt3 = dark ? "#444"    : "#bbb";

  const addUrl = () => {
    setUrls(u => [...u, { id: Date.now(), loc: "", priority: "0.8", freq: "weekly", lastmod: new Date().toISOString().split("T")[0] }]);
  };

  const removeUrl = (id) => setUrls(u => u.filter(x => x.id !== id));

  const updateUrl = (id, field, value) => {
    setUrls(u => u.map(x => x.id === id ? { ...x, [field]: value } : x));
  };

  async function callAI(prompt) {
    const key = model === "groq" ? keys?.groq : keys?.gemini;
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
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${keys?.gemini}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const d = await res.json();
      return d.candidates?.[0]?.content?.parts?.[0]?.text || null;
    }
  }

  async function generateWithAI() {
    if (!domain.trim() || !aiNiche.trim()) return;
    setAiLoading(true);

    const types = PAGE_TYPES.filter(p => selectedTypes.includes(p.id));
    const prompt = `You are an XML sitemap expert. Generate ${aiPages} realistic URL slugs for:

Domain: "${domain}"
Niche/Business: "${aiNiche}"
Page Types needed: ${types.map(t => t.label).join(", ")}

Respond ONLY in this EXACT format, one URL per line:
SLUG: /slug-here | PRIORITY: 0.8 | FREQ: weekly | TYPE: blog

Rules:
- Slugs must be SEO-friendly (lowercase, hyphens, no trailing slash except homepage)
- Homepage = /
- Be specific to the "${aiNiche}" niche
- Generate exactly ${aiPages} URLs
- Vary priorities: homepage=1.0, products/services=0.9, blog=0.8, categories=0.7, about=0.5
- Vary frequencies: homepage=daily, products=weekly, blog=weekly, about=monthly

Generate all ${aiPages} URLs now.`;

    const text = await callAI(prompt);
    if (text) {
      const lines = text.split("\n").filter(l => l.includes("SLUG:"));
      const parsed = lines.map((line, i) => {
        const slug     = line.match(/SLUG:\s*([^\s|]+)/)?.[1] || `/page-${i + 1}`;
        const priority = line.match(/PRIORITY:\s*([\d.]+)/)?.[1] || "0.8";
        const freq     = line.match(/FREQ:\s*(\w+)/)?.[1] || "weekly";
        const fullUrl  = domain.startsWith("http") ? domain.replace(/\/$/, "") + slug : `https://${domain.replace(/\/$/, "")}${slug}`;
        return {
          id: Date.now() + i,
          loc: fullUrl,
          priority,
          freq,
          lastmod: new Date().toISOString().split("T")[0],
        };
      });
      if (parsed.length > 0) {
        setUrls(parsed);
        setActiveTab("manual");
        generateXML(parsed);
      }
    }
    setAiLoading(false);
  }

  function generateXML(urlList = urls) {
    const validUrls = urlList.filter(u => u.loc.trim());
    if (!validUrls.length) return;

    const fullDomain = domain.startsWith("http") ? domain.replace(/\/$/, "") : domain ? `https://${domain.replace(/\/$/, "")}` : "";

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
${validUrls.map(u => {
  const loc = u.loc.startsWith("http") ? u.loc : `${fullDomain}${u.loc.startsWith("/") ? "" : "/"}${u.loc}`;
  return `  <url>
    <loc>${loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.freq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`;
}).join("\n")}
</urlset>`;
    setOutput(xml);
  }

  function downloadXML() {
    if (!output) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([output], { type: "application/xml" }));
    a.download = "sitemap.xml"; a.click();
  }

  function importURLs(text) {
    const lines = text.split("\n").map(l => l.trim()).filter(l => l.startsWith("http") || l.startsWith("/"));
    const parsed = lines.map((loc, i) => ({
      id: Date.now() + i, loc,
      priority: "0.8", freq: "weekly",
      lastmod: new Date().toISOString().split("T")[0],
    }));
    if (parsed.length) setUrls(parsed);
  }

  const tabStyle = (a, color = "#443DCB") => ({
    padding: "6px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer",
    fontWeight: a ? 600 : 400, background: a ? color + "22" : "transparent",
    color: a ? color : txt2, border: `1px solid ${a ? color + "44" : bdr}`, whiteSpace: "nowrap",
  });

  const inp = {
    padding: "7px 10px", borderRadius: 7,
    border: `1px solid ${bdr}`, background: bg3, color: txt,
    fontSize: 12, outline: "none", fontFamily: "inherit",
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 24, background: bg }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: txt, marginBottom: 4 }}>🗺️ XML Sitemap Generator</div>
        <div style={{ fontSize: 13, color: txt2, marginBottom: 20 }}>
          Manual builder · AI auto-generate · Import URLs · Download ready XML
        </div>

        {/* Domain + Tabs */}
        <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 12, color: txt2, marginBottom: 6, fontWeight: 600 }}>Your Domain <span style={{ color: "#DC2626" }}>*</span></div>
              <input value={domain} onChange={e => setDomain(e.target.value)}
                placeholder="https://yoursite.com"
                style={{ ...inp, width: "100%", boxSizing: "border-box", padding: "10px 14px", borderRadius: 10, fontSize: 13 }} />
            </div>
            <div style={{ fontSize: 11, color: txt2, textAlign: "center", marginTop: 20 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#443DCB" }}>{urls.filter(u => u.loc.trim()).length}</div>
              <div>URLs</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <div style={tabStyle(activeTab === "manual")} onClick={() => setActiveTab("manual")}>📝 Manual Builder</div>
          <div style={tabStyle(activeTab === "ai", "#059669")} onClick={() => setActiveTab("ai")}>🤖 AI Generator</div>
          <div style={tabStyle(activeTab === "import", "#D97706")} onClick={() => setActiveTab("import")}>📥 Import URLs</div>
          {output && <div style={tabStyle(activeTab === "xml", "#EA4335")} onClick={() => setActiveTab("xml")}>📄 XML Output</div>}
        </div>

        {/* Manual Builder */}
        {activeTab === "manual" && (
          <div>
            <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, overflow: "hidden", marginBottom: 12 }}>
              <div style={{ padding: "10px 16px", background: bg3, borderBottom: `1px solid ${bdr}`, display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: 8 }}>
                {["URL / Slug", "Priority", "Change Freq", "Last Modified", ""].map((h, i) => (
                  <div key={i} style={{ fontSize: 10, color: txt2, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</div>
                ))}
              </div>
              <div style={{ maxHeight: 400, overflowY: "auto" }}>
                {urls.map((url, i) => (
                  <div key={url.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: 8, padding: "8px 16px", borderBottom: `1px solid ${bdr}22`, alignItems: "center" }}>
                    <input value={url.loc} onChange={e => updateUrl(url.id, "loc", e.target.value)}
                      placeholder={i === 0 ? "https://yoursite.com" : "/page-slug"}
                      style={{ ...inp, width: "100%", boxSizing: "border-box" }} />
                    <select value={url.priority} onChange={e => updateUrl(url.id, "priority", e.target.value)} style={inp}>
                      {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <select value={url.freq} onChange={e => updateUrl(url.id, "freq", e.target.value)} style={inp}>
                      {FREQ_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <input type="date" value={url.lastmod} onChange={e => updateUrl(url.id, "lastmod", e.target.value)} style={inp} />
                    <button onClick={() => removeUrl(url.id)}
                      style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${bdr}`, background: "transparent", color: "#DC2626", fontSize: 13, cursor: "pointer" }}>✕</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Bulk add with page type */}
            <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: txt2, marginBottom: 10, fontWeight: 600 }}>⚡ Quick Add by Page Type</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {PAGE_TYPES.map(pt => (
                  <div key={pt.id} onClick={() => {
                    setUrls(u => [...u, {
                      id: Date.now() + Math.random(),
                      loc: pt.id === "homepage" ? (domain || "https://yoursite.com") : "",
                      priority: pt.priority, freq: pt.freq,
                      lastmod: new Date().toISOString().split("T")[0],
                    }]);
                  }}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 8, border: `1px solid ${bdr}`, background: bg3, cursor: "pointer", fontSize: 11, color: txt2 }}>
                    <span>{pt.icon}</span><span>{pt.label}</span>
                    <span style={{ fontSize: 9, color: "#059669" }}>p:{pt.priority}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={addUrl}
                style={{ padding: "9px 20px", borderRadius: 10, border: `1px solid ${bdr}`, background: "transparent", color: txt2, fontSize: 13, cursor: "pointer" }}>
                + Add URL
              </button>
              <button onClick={() => generateXML()}
                style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "#443DCB", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                🗺️ Generate Sitemap XML
              </button>
            </div>
          </div>
        )}

        {/* AI Generator */}
        {activeTab === "ai" && (
          <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 12, color: txt2, marginBottom: 6, fontWeight: 600 }}>Business / Niche <span style={{ color: "#DC2626" }}>*</span></div>
                <input value={aiNiche} onChange={e => setAiNiche(e.target.value)}
                  placeholder="e.g. digital marketing agency, online shoe store"
                  style={{ ...inp, width: "100%", boxSizing: "border-box", padding: "10px 14px", borderRadius: 10, fontSize: 13 }} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: txt2, marginBottom: 6, fontWeight: 600 }}>Number of URLs to Generate</div>
                <select value={aiPages} onChange={e => setAiPages(e.target.value)}
                  style={{ ...inp, width: "100%", padding: "10px 14px", borderRadius: 10, fontSize: 13 }}>
                  {["10","15","20","30","50"].map(n => <option key={n} value={n}>{n} URLs</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: txt2, marginBottom: 8, fontWeight: 600 }}>Page Types to Include</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {PAGE_TYPES.map(pt => {
                  const sel = selectedTypes.includes(pt.id);
                  return (
                    <div key={pt.id} onClick={() => setSelectedTypes(s => sel ? s.filter(x => x !== pt.id) : [...s, pt.id])}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 20, border: `1px solid ${sel ? "#05966944" : bdr}`, background: sel ? "#05966911" : bg3, cursor: "pointer", fontSize: 11, color: sel ? "#059669" : txt2, fontWeight: sel ? 600 : 400 }}>
                      {pt.icon} {pt.label} {sel && "✓"}
                    </div>
                  );
                })}
              </div>
            </div>

            <button onClick={generateWithAI} disabled={aiLoading || !domain.trim() || !aiNiche.trim()}
              style={{ width: "100%", padding: "11px", borderRadius: 10, border: "none", background: aiLoading || !domain.trim() || !aiNiche.trim() ? "#333" : "#059669", color: aiLoading || !domain.trim() || !aiNiche.trim() ? txt3 : "#fff", fontWeight: 700, fontSize: 14, cursor: aiLoading || !domain.trim() || !aiNiche.trim() ? "not-allowed" : "pointer" }}>
              {aiLoading ? `🤖 Generating ${aiPages} URLs...` : `🤖 AI Generate ${aiPages} Sitemap URLs`}
            </button>
          </div>
        )}

        {/* Import */}
        {activeTab === "import" && (
          <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: txt, marginBottom: 8 }}>📥 Bulk Import URLs</div>
            <div style={{ fontSize: 12, color: txt2, marginBottom: 12 }}>Paste URLs one per line (full URLs or /slugs)</div>
            <textarea
              placeholder={"https://yoursite.com\nhttps://yoursite.com/blog\n/about\n/contact\n/products"}
              rows={10}
              onChange={e => importURLs(e.target.value)}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${bdr}`, background: bg3, color: txt, fontSize: 13, outline: "none", resize: "vertical", fontFamily: "monospace", boxSizing: "border-box", marginBottom: 12 }} />
            <button onClick={() => generateXML()}
              style={{ width: "100%", padding: "10px", borderRadius: 10, border: "none", background: "#D97706", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              🗺️ Generate Sitemap from Imported URLs
            </button>
          </div>
        )}

        {/* XML Output */}
        {output && (
          <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, overflow: "hidden", marginTop: 16 }}>
            <div style={{ padding: "12px 16px", background: bg3, borderBottom: `1px solid ${bdr}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: txt }}>📄 sitemap.xml — Ready to Use</div>
                <div style={{ fontSize: 11, color: txt2 }}>{urls.filter(u => u.loc.trim()).length} URLs · {output.length} bytes</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { navigator.clipboard.writeText(output); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                  style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${bdr}`, background: "transparent", color: copied ? "#059669" : txt2, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                  {copied ? "✅ Copied!" : "📋 Copy XML"}
                </button>
                <button onClick={downloadXML}
                  style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#443DCB", color: "#fff", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                  ⬇️ Download sitemap.xml
                </button>
              </div>
            </div>
            <div style={{ padding: 20, maxHeight: 400, overflowY: "auto" }}>
              <pre style={{ fontSize: 11, color: txt, fontFamily: "monospace", lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap" }}>{output}</pre>
            </div>

            {/* Submission Guide */}
            <div style={{ padding: 16, borderTop: `1px solid ${bdr}`, background: "#443DCB11" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#6B62E8", marginBottom: 8 }}>📋 Next Steps</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  "Upload sitemap.xml to your domain root",
                  "Add to robots.txt: Sitemap: https://yoursite.com/sitemap.xml",
                  "Submit in Google Search Console → Sitemaps",
                  "Submit in Bing Webmaster Tools",
                ].map((step, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: txt }}>
                    <span style={{ color: "#443DCB", fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>{step}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {!output && (
          <div style={{ textAlign: "center", padding: 40, color: txt3 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🗺️</div>
            <div style={{ fontSize: 14, color: txt2 }}>Add URLs above and click Generate to create your sitemap</div>
          </div>
        )}
      </div>
    </div>
  );
}