import { useState } from "react";

const SERP_FEATURES = [
  { id:"ads",      label:"Ads (Top)",        icon:"📢", default:true  },
  { id:"featured", label:"Featured Snippet", icon:"⭐", default:true  },
  { id:"paa",      label:"People Also Ask",  icon:"❓", default:true  },
  { id:"local",    label:"Local Pack",       icon:"📍", default:false },
  { id:"images",   label:"Image Pack",       icon:"🖼️", default:false },
  { id:"video",    label:"Video Carousel",   icon:"▶️", default:false },
  { id:"news",     label:"Top Stories",      icon:"📰", default:false },
  { id:"shopping", label:"Shopping",         icon:"🛒", default:false },
];

const MOCK_COMPETITORS = [
  { domain:"semrush.com",    title:"", desc:"", position:1 },
  { domain:"ahrefs.com",     title:"", desc:"", position:2 },
  { domain:"moz.com",        title:"", desc:"", position:3 },
  { domain:"backlinko.com",  title:"", desc:"", position:4 },
  { domain:"neilpatel.com",  title:"", desc:"", position:5 },
];

export default function SerpSimulator({ dark, keys, model }) {
  const [keyword, setKeyword]     = useState("");
  const [myUrl, setMyUrl]         = useState("");
  const [myTitle, setMyTitle]     = useState("");
  const [myDesc, setMyDesc]       = useState("");
  const [loading, setLoading]     = useState(false);
  const [serpData, setSerpData]   = useState(null);
  const [features, setFeatures]   = useState(
    Object.fromEntries(SERP_FEATURES.map(f => [f.id, f.default]))
  );
  const [paaOpen, setPaaOpen]     = useState({});
  const [myPosition, setMyPosition] = useState(1);

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const txt3 = dark ? "#444"    : "#bbb";

  // Google-like colors
  const gBlue  = dark ? "#8ab4f8" : "#1a0dab";
  const gGreen = dark ? "#81c995" : "#006621";
  const gGray  = dark ? "#bdc1c6" : "#4d5156";
  const gBg    = dark ? "#202124" : "#ffffff";
  const gBdr   = dark ? "#3c4043" : "#dfe1e5";

  async function callAI(prompt) {
    const key = model === "groq" ? keys?.groq : keys?.gemini;
    if (!key) return null;
    if (model === "groq") {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
        body: JSON.stringify({ model: "llama-3.1-8b-instant", max_tokens: 4000, messages: [{ role: "user", content: prompt }] })
      });
      const d = await res.json();
      return d.choices?.[0]?.message?.content || null;
    } else {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const d = await res.json();
      return d.candidates?.[0]?.content?.parts?.[0]?.text || null;
    }
  }

  async function generateSERP() {
    if (!keyword.trim()) return;
    setLoading(true); setSerpData(null);

    const prompt = `You are a Google SERP expert. Simulate a realistic Google SERP for keyword: "${keyword}"

Generate EXACTLY in this format:

INTENT: [informational/transactional/commercial/navigational]
DIFFICULTY: [0-100]
MONTHLY_SEARCHES: [estimate like 10K-100K]
AD_TITLE_1: [realistic Google Ad title, 30 chars max]
AD_DESC_1: [ad description, 90 chars max]
AD_URL_1: [advertiser domain]
AD_TITLE_2: [realistic Google Ad title]
AD_DESC_2: [ad description]
AD_URL_2: [advertiser domain]
FEATURED_TITLE: [featured snippet page title]
FEATURED_URL: [domain that would win featured snippet]
FEATURED_TEXT: [40-60 word direct answer for featured snippet]
PAA_1: [People Also Ask question 1]
PAA_ANS_1: [30-40 word answer]
PAA_2: [People Also Ask question 2]
PAA_ANS_2: [30-40 word answer]
PAA_3: [People Also Ask question 3]
PAA_ANS_3: [30-40 word answer]
PAA_4: [People Also Ask question 4]
PAA_ANS_4: [30-40 word answer]
RESULT_1_TITLE: [organic result 1 title, 55 chars]
RESULT_1_URL: [domain]
RESULT_1_DESC: [meta description, 140 chars]
RESULT_2_TITLE: [organic result 2 title]
RESULT_2_URL: [domain]
RESULT_2_DESC: [meta description]
RESULT_3_TITLE: [organic result 3 title]
RESULT_3_URL: [domain]
RESULT_3_DESC: [meta description]
RESULT_4_TITLE: [organic result 4 title]
RESULT_4_URL: [domain]
RESULT_4_DESC: [meta description]
RESULT_5_TITLE: [organic result 5 title]
RESULT_5_URL: [domain]
RESULT_5_DESC: [meta description]
LOCAL_1: [local business name if applicable]
LOCAL_ADDR_1: [address]
LOCAL_RATING_1: [rating like 4.5]
LOCAL_2: [local business name]
LOCAL_ADDR_2: [address]
LOCAL_RATING_2: [rating]
LOCAL_3: [local business name]
LOCAL_ADDR_3: [address]
LOCAL_RATING_3: [rating]
RANKING_TIPS: [3 specific tips to rank for this keyword, separated by |]`;

    const text = await callAI(prompt);
    if (text) {
      const get = (k) => {
        const m = text.match(new RegExp(`${k}:\\s*(.+)`));
        return m ? m[1].trim() : "";
      };
      setSerpData({
        keyword,
        intent:    get("INTENT"),
        difficulty:parseInt(get("DIFFICULTY")) || 50,
        searches:  get("MONTHLY_SEARCHES"),
        ads: [
          { title: get("AD_TITLE_1"), desc: get("AD_DESC_1"), url: get("AD_URL_1") },
          { title: get("AD_TITLE_2"), desc: get("AD_DESC_2"), url: get("AD_URL_2") },
        ].filter(a => a.title),
        featured: {
          title: get("FEATURED_TITLE"),
          url:   get("FEATURED_URL"),
          text:  get("FEATURED_TEXT"),
        },
        paa: [1,2,3,4].map(i => ({
          q: get(`PAA_${i}`),
          a: get(`PAA_ANS_${i}`),
        })).filter(p => p.q),
        results: [1,2,3,4,5].map(i => ({
          title: get(`RESULT_${i}_TITLE`),
          url:   get(`RESULT_${i}_URL`),
          desc:  get(`RESULT_${i}_DESC`),
        })).filter(r => r.title),
        local: [1,2,3].map(i => ({
          name:   get(`LOCAL_${i}`),
          addr:   get(`LOCAL_ADDR_${i}`),
          rating: parseFloat(get(`LOCAL_RATING_${i}`)) || 4.2,
        })).filter(l => l.name),
        tips: get("RANKING_TIPS").split("|").map(t => t.trim()).filter(Boolean),
      });
    }
    setLoading(false);
  }

  const trunc = (s, n) => s && s.length > n ? s.slice(0, n) + "..." : s || "";
  const diffColor = d => d <= 30 ? "#059669" : d <= 60 ? "#D97706" : "#DC2626";
  const intentColor = i => ({ informational:"#0891B2", transactional:"#059669", commercial:"#D97706", navigational:"#443DCB" }[i?.toLowerCase()] || "#888");

  const tabStyle = (a) => ({
    padding: "5px 12px", borderRadius: 20, fontSize: 11, cursor: "pointer",
    fontWeight: a ? 600 : 400, background: a ? "#4285F422" : "transparent",
    color: a ? "#4285F4" : txt2, border: `1px solid ${a ? "#4285F444" : bdr}`,
  });

  // Stars render
  const Stars = ({ rating }) => {
    const full = Math.floor(rating);
    const half = rating % 1 >= 0.5;
    return (
      <span style={{ color: "#f9ab00", fontSize: 12 }}>
        {"★".repeat(full)}{half ? "½" : ""}{"☆".repeat(5 - full - (half ? 1 : 0))}
        <span style={{ color: txt2, fontSize: 11, marginLeft: 4 }}>{rating}</span>
      </span>
    );
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 24, background: bg }}>
      <div style={{ maxWidth: 1060, margin: "0 auto" }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: txt, marginBottom: 4 }}>🔎 SERP Simulator</div>
        <div style={{ fontSize: 13, color: txt2, marginBottom: 20 }}>
          AI-powered Google SERP preview — Ads · Featured Snippet · PAA · Local Pack · Organic Results
        </div>

        {/* ── Input Panel ── */}
        <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 12, color: txt2, marginBottom: 6, fontWeight: 600 }}>Target Keyword <span style={{ color: "#DC2626" }}>*</span></div>
              <input value={keyword} onChange={e => setKeyword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && generateSERP()}
                placeholder="e.g. best seo tools 2026"
                style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${bdr}`, background: bg3, color: txt, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: txt2, marginBottom: 6, fontWeight: 600 }}>Your Position to Simulate</div>
              <select value={myPosition} onChange={e => setMyPosition(parseInt(e.target.value))}
                style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${bdr}`, background: bg3, color: txt, fontSize: 13, outline: "none", cursor: "pointer" }}>
                {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>Position #{n}</option>)}
              </select>
            </div>
          </div>

          {/* My listing inputs */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: txt2, marginBottom: 4 }}>Your Title (optional)</div>
              <input value={myTitle} onChange={e => setMyTitle(e.target.value)}
                placeholder="Your page title..."
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${bdr}`, background: bg3, color: txt, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: txt2, marginBottom: 4 }}>Your URL (optional)</div>
              <input value={myUrl} onChange={e => setMyUrl(e.target.value)}
                placeholder="yoursite.com/page"
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${bdr}`, background: bg3, color: txt, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: txt2, marginBottom: 4 }}>Your Description (optional)</div>
              <input value={myDesc} onChange={e => setMyDesc(e.target.value)}
                placeholder="Your meta description..."
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${bdr}`, background: bg3, color: txt, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>

          {/* SERP Features toggles */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: txt2, marginBottom: 8, fontWeight: 600 }}>SERP Features to Show</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {SERP_FEATURES.map(f => (
                <div key={f.id} onClick={() => setFeatures(p => ({ ...p, [f.id]: !p[f.id] }))}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 20, cursor: "pointer", border: `1px solid ${features[f.id] ? "#4285F444" : bdr}`, background: features[f.id] ? "#4285F411" : "transparent", fontSize: 11, color: features[f.id] ? "#4285F4" : txt2 }}>
                  <span>{f.icon}</span>
                  <span style={{ fontWeight: features[f.id] ? 600 : 400 }}>{f.label}</span>
                  {features[f.id] && <span style={{ color: "#4285F4" }}>✓</span>}
                </div>
              ))}
            </div>
          </div>

          <button onClick={generateSERP} disabled={loading || !keyword.trim()}
            style={{ width: "100%", padding: "11px", borderRadius: 10, border: "none", background: loading || !keyword.trim() ? "#333" : "#4285F4", color: loading || !keyword.trim() ? txt3 : "#fff", fontWeight: 700, fontSize: 14, cursor: loading || !keyword.trim() ? "not-allowed" : "pointer" }}>
            {loading ? "🔎 Generating SERP..." : "🔎 Simulate Google SERP"}
          </button>
        </div>

        {serpData && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20 }}>

            {/* ── LEFT: SERP Preview ── */}
            <div>
              {/* Google Search Bar */}
              <div style={{ background: gBg, border: `1px solid ${gBdr}`, borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: -1 }}>
                    <span style={{ color: "#4285F4" }}>G</span>
                    <span style={{ color: "#EA4335" }}>o</span>
                    <span style={{ color: "#FBBC05" }}>o</span>
                    <span style={{ color: "#4285F4" }}>g</span>
                    <span style={{ color: "#34A853" }}>l</span>
                    <span style={{ color: "#EA4335" }}>e</span>
                  </span>
                  <div style={{ flex: 1, background: dark ? "#303134" : "#fff", border: `1px solid ${gBdr}`, borderRadius: 24, padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 14, color: dark ? "#e8e8e8" : "#202124" }}>{serpData.keyword}</span>
                    <span style={{ fontSize: 16, color: "#4285F4" }}>🔍</span>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: gGray }}>
                  About {(Math.random() * 500 + 100).toFixed(0)}M results (0.{Math.floor(Math.random()*9)+1}{Math.floor(Math.random()*9)} seconds)
                </div>
              </div>

              {/* ── ADS ── */}
              {features.ads && serpData.ads.length > 0 && (
                <div style={{ background: gBg, border: `1px solid ${gBdr}`, borderRadius: 10, padding: "12px 16px", marginBottom: 12 }}>
                  {serpData.ads.map((ad, i) => (
                    <div key={i} style={{ paddingBottom: i < serpData.ads.length - 1 ? 12 : 0, marginBottom: i < serpData.ads.length - 1 ? 12 : 0, borderBottom: i < serpData.ads.length - 1 ? `1px solid ${gBdr}` : "none" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                        <span style={{ fontSize: 9, border: `1px solid ${gGray}`, borderRadius: 3, padding: "1px 4px", color: gGray }}>Sponsored</span>
                        <span style={{ fontSize: 13, color: gGreen }}>{ad.url}</span>
                      </div>
                      <div style={{ fontSize: 18, color: gBlue, marginBottom: 3, cursor: "pointer" }}>{ad.title}</div>
                      <div style={{ fontSize: 13, color: gGray }}>{ad.desc}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── FEATURED SNIPPET ── */}
              {features.featured && serpData.featured?.text && (
                <div style={{ background: gBg, border: `2px solid ${dark ? "#3c4043" : "#dfe1e5"}`, borderRadius: 10, padding: "14px 16px", marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: gGray, marginBottom: 8 }}>⭐ Featured Snippet</div>
                  <div style={{ fontSize: 14, color: dark ? "#e8e8e8" : "#202124", lineHeight: 1.7, marginBottom: 12 }}>
                    {serpData.featured.text}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#4285F422", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9 }}>🌐</div>
                    <div>
                      <div style={{ fontSize: 12, color: gGreen }}>{serpData.featured.url}</div>
                      <div style={{ fontSize: 14, color: gBlue, cursor: "pointer" }}>{serpData.featured.title}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── IMAGE PACK ── */}
              {features.images && (
                <div style={{ background: gBg, border: `1px solid ${gBdr}`, borderRadius: 10, padding: "12px 16px", marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: gGray, marginBottom: 10 }}>🖼️ Images for <em>{serpData.keyword}</em></div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {["#443DCB","#4285F4","#EA4335","#34A853","#FBBC05"].map((c, i) => (
                      <div key={i} style={{ flex: 1, height: 80, borderRadius: 6, background: c + "33", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🖼️</div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── VIDEO CAROUSEL ── */}
              {features.video && (
                <div style={{ background: gBg, border: `1px solid ${gBdr}`, borderRadius: 10, padding: "12px 16px", marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: gGray, marginBottom: 10 }}>▶️ Videos</div>
                  <div style={{ display: "flex", gap: 10, overflowX: "auto" }}>
                    {["YouTube","Vimeo","YouTube"].map((src, i) => (
                      <div key={i} style={{ minWidth: 160, background: bg3, borderRadius: 8, overflow: "hidden", flexShrink: 0 }}>
                        <div style={{ height: 90, background: `linear-gradient(135deg, #${["DC2626","4285F4","7C3AED"][i]}, #000)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ fontSize: 28 }}>▶️</span>
                        </div>
                        <div style={{ padding: "6px 8px" }}>
                          <div style={{ fontSize: 11, color: txt, fontWeight: 500, lineHeight: 1.3 }}>{serpData.keyword} - Complete Guide {i + 1}</div>
                          <div style={{ fontSize: 10, color: txt2, marginTop: 3 }}>{src} · {Math.floor(Math.random() * 20) + 2}:{Math.floor(Math.random() * 59).toString().padStart(2, "0")}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── ORGANIC RESULTS (with MY listing) ── */}
              <div style={{ background: gBg, border: `1px solid ${gBdr}`, borderRadius: 10, padding: "12px 16px", marginBottom: 12 }}>
                {(() => {
                  const myListing = {
                    title: myTitle || `${serpData.keyword} — Best Guide ${new Date().getFullYear()}`,
                    url:   myUrl   || "yoursite.com",
                    desc:  myDesc  || `Everything you need to know about ${serpData.keyword}. Expert tips, strategies and actionable advice to get results fast.`,
                    isMine: true,
                  };
                  const results = [...serpData.results];
                  results.splice(myPosition - 1, 0, myListing);
                  return results.slice(0, 6).map((r, i) => (
                    <div key={i} style={{ paddingBottom: 14, marginBottom: 14, borderBottom: i < 5 ? `1px solid ${gBdr}` : "none", background: r.isMine ? (dark ? "#443DCB11" : "#f5f0ff") : "transparent", borderRadius: r.isMine ? 8 : 0, padding: r.isMine ? "10px 12px" : "0 0 14px", marginLeft: r.isMine ? -4 : 0, position: "relative" }}>
                      {r.isMine && (
                        <div style={{ position: "absolute", top: 6, right: 8, fontSize: 9, padding: "2px 6px", borderRadius: 10, background: "#443DCB", color: "#fff", fontWeight: 600 }}>YOUR SITE</div>
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                        <div style={{ width: 16, height: 16, borderRadius: "50%", background: r.isMine ? "#443DCB33" : "#4285F422", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9 }}>
                          {r.isMine ? "⭐" : "🌐"}
                        </div>
                        <div>
                          <div style={{ fontSize: 12, color: r.isMine ? "#6B62E8" : gGreen }}>{r.url}</div>
                        </div>
                        <span style={{ fontSize: 10, color: txt3, marginLeft: "auto" }}>#{i + 1}</span>
                      </div>
                      <div style={{ fontSize: 18, color: r.isMine ? (dark ? "#c4b5fd" : "#6d28d9") : gBlue, marginBottom: 4, cursor: "pointer", lineHeight: 1.3, fontWeight: r.isMine ? 500 : 400 }}>
                        {trunc(r.title, 60)}
                      </div>
                      <div style={{ fontSize: 13, color: gGray, lineHeight: 1.58 }}>
                        {trunc(r.desc, 155)}
                      </div>
                    </div>
                  ));
                })()}
              </div>

              {/* ── PAA ── */}
              {features.paa && serpData.paa.length > 0 && (
                <div style={{ background: gBg, border: `1px solid ${gBdr}`, borderRadius: 10, padding: "12px 16px", marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: dark ? "#e8e8e8" : "#202124", marginBottom: 12 }}>People also ask</div>
                  {serpData.paa.map((p, i) => (
                    <div key={i} style={{ borderBottom: `1px solid ${gBdr}`, lastChild: { borderBottom: "none" } }}>
                      <div onClick={() => setPaaOpen(o => ({ ...o, [i]: !o[i] }))}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", cursor: "pointer" }}>
                        <span style={{ fontSize: 14, color: dark ? "#e8e8e8" : "#202124" }}>{p.q}</span>
                        <span style={{ fontSize: 12, color: gGray, marginLeft: 10 }}>{paaOpen[i] ? "▲" : "▼"}</span>
                      </div>
                      {paaOpen[i] && (
                        <div style={{ padding: "0 0 12px", fontSize: 13, color: gGray, lineHeight: 1.7 }}>{p.a}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* ── LOCAL PACK ── */}
              {features.local && serpData.local.length > 0 && (
                <div style={{ background: gBg, border: `1px solid ${gBdr}`, borderRadius: 10, padding: "12px 16px", marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: dark ? "#e8e8e8" : "#202124", marginBottom: 12 }}>📍 Local Results</div>
                  <div style={{ background: bg3, borderRadius: 8, height: 120, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12, fontSize: 13, color: txt2 }}>
                    🗺️ Google Maps Preview
                  </div>
                  {serpData.local.map((l, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderBottom: i < serpData.local.length - 1 ? `1px solid ${gBdr}` : "none" }}>
                      <span style={{ fontSize: 14, color: "#EA4335", flexShrink: 0 }}>📍</span>
                      <div>
                        <div style={{ fontSize: 14, color: gBlue, cursor: "pointer", marginBottom: 2 }}>{l.name}</div>
                        <Stars rating={l.rating} />
                        <div style={{ fontSize: 12, color: gGray, marginTop: 2 }}>{l.addr}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── NEWS ── */}
              {features.news && (
                <div style={{ background: gBg, border: `1px solid ${gBdr}`, borderRadius: 10, padding: "12px 16px", marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: dark ? "#e8e8e8" : "#202124", marginBottom: 12 }}>📰 Top Stories</div>
                  {["TechCrunch","Forbes","Search Engine Journal"].map((src, i) => (
                    <div key={i} style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: i < 2 ? `1px solid ${gBdr}` : "none", alignItems: "center" }}>
                      <div style={{ width: 80, height: 52, borderRadius: 6, background: `linear-gradient(135deg, #${["4285F4","EA4335","34A853"][i]}44, #00000044)`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>📰</div>
                      <div>
                        <div style={{ fontSize: 13, color: dark ? "#e8e8e8" : "#202124", fontWeight: 500, lineHeight: 1.3, marginBottom: 4 }}>{serpData.keyword} — Latest Updates {i + 1}</div>
                        <div style={{ fontSize: 11, color: gGray }}>{src} · {Math.floor(Math.random() * 12) + 1}h ago</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── SHOPPING ── */}
              {features.shopping && (
                <div style={{ background: gBg, border: `1px solid ${gBdr}`, borderRadius: 10, padding: "12px 16px", marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: dark ? "#e8e8e8" : "#202124", marginBottom: 12 }}>🛒 Shopping</div>
                  <div style={{ display: "flex", gap: 10, overflowX: "auto" }}>
                    {["$29.99","$49.00","$19.95","$39.99"].map((price, i) => (
                      <div key={i} style={{ minWidth: 120, background: bg3, borderRadius: 8, overflow: "hidden", flexShrink: 0 }}>
                        <div style={{ height: 80, background: `linear-gradient(135deg, #${["7C3AED","4285F4","EA4335","34A853"][i]}33, #00000011)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>🛍️</div>
                        <div style={{ padding: "6px 8px" }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: txt }}>{price}</div>
                          <div style={{ fontSize: 10, color: txt2 }}>Shop {["Amazon","eBay","Walmart","Best Buy"][i]}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── RIGHT: Analysis Panel ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

              {/* SERP Stats */}
              <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: txt, marginBottom: 12 }}>📊 SERP Analysis</div>
                {[
                  { label: "Keyword Difficulty", value: `${serpData.difficulty}/100`, color: diffColor(serpData.difficulty) },
                  { label: "Monthly Searches",   value: serpData.searches,            color: "#443DCB" },
                  { label: "Search Intent",      value: serpData.intent,              color: intentColor(serpData.intent) },
                  { label: "Your Position",      value: `#${myPosition}`,             color: myPosition <= 3 ? "#059669" : myPosition <= 7 ? "#D97706" : "#DC2626" },
                ].map(s => (
                  <div key={s.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${bdr}33` }}>
                    <span style={{ fontSize: 12, color: txt2 }}>{s.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: s.color, textTransform: "capitalize" }}>{s.value}</span>
                  </div>
                ))}
              </div>

              {/* Difficulty Meter */}
              <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: txt, marginBottom: 10 }}>🎯 Ranking Difficulty</div>
                <div style={{ height: 10, borderRadius: 5, background: bg3, overflow: "hidden", marginBottom: 8 }}>
                  <div style={{ height: "100%", width: `${serpData.difficulty}%`, background: `linear-gradient(90deg, #059669, #D97706, #DC2626)`, borderRadius: 5 }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: txt3 }}>
                  <span>Easy</span><span>Medium</span><span>Hard</span>
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: diffColor(serpData.difficulty), fontWeight: 600, textAlign: "center" }}>
                  {serpData.difficulty <= 30 ? "🟢 Low Competition — Great opportunity!" : serpData.difficulty <= 60 ? "🟡 Medium — Doable with quality content" : "🔴 High — Needs strong backlinks + authority"}
                </div>
              </div>

              {/* SERP Features Present */}
              <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: txt, marginBottom: 10 }}>⚡ Active SERP Features</div>
                {SERP_FEATURES.filter(f => features[f.id]).map(f => (
                  <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
                    <span style={{ fontSize: 13 }}>{f.icon}</span>
                    <span style={{ fontSize: 12, color: txt }}>{f.label}</span>
                    <span style={{ marginLeft: "auto", fontSize: 10, color: "#059669" }}>✅</span>
                  </div>
                ))}
              </div>

              {/* Ranking Tips */}
              {serpData.tips?.length > 0 && (
                <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: txt, marginBottom: 10 }}>💡 Ranking Tips</div>
                  {serpData.tips.map((tip, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, padding: "8px 0", borderBottom: i < serpData.tips.length - 1 ? `1px solid ${bdr}33` : "none" }}>
                      <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#4285F422", color: "#4285F4", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</div>
                      <span style={{ fontSize: 12, color: txt2, lineHeight: 1.5 }}>{tip}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* CTR Estimator */}
              <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: txt, marginBottom: 10 }}>📈 CTR Estimator</div>
                {[
                  { pos: 1, ctr: "28.5%" }, { pos: 2, ctr: "15.7%" },
                  { pos: 3, ctr: "11.0%" }, { pos: 4, ctr: "8.0%"  },
                  { pos: 5, ctr: "7.2%"  },
                ].map(r => (
                  <div key={r.pos} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: r.pos === myPosition ? "#4285F4" : txt3, width: 20, fontWeight: r.pos === myPosition ? 700 : 400 }}>#{r.pos}</span>
                    <div style={{ flex: 1, height: 6, borderRadius: 3, background: bg3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: r.ctr, background: r.pos === myPosition ? "#4285F4" : bg3.replace ? "#443DCB66" : "#443DCB44", borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 11, color: r.pos === myPosition ? "#4285F4" : txt2, fontWeight: r.pos === myPosition ? 700 : 400, width: 36, textAlign: "right" }}>{r.ctr}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {!serpData && !loading && (
          <div style={{ textAlign: "center", padding: 60, color: txt3 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔎</div>
            <div style={{ fontSize: 16, color: txt, fontWeight: 600, marginBottom: 8 }}>Simulate Any Google SERP</div>
            <div style={{ fontSize: 13, color: txt2, marginBottom: 24 }}>Enter a keyword to see AI-generated Google results with all SERP features</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              {["best seo tools 2026","how to lose weight fast","plumber near me","buy running shoes"].map(ex => (
                <div key={ex} onClick={() => setKeyword(ex)}
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