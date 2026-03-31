import { useState, useEffect, useRef } from "react";
import { TOOLS, CATS, MODELS } from "./tools";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import Dashboard from "./Dashboard";
import History from "./History";
import Markdown from "./Markdown";
import GscDashboard from "./GscDashboard";
import ClientManager from "./pages/ClientManager";
import GA4Dashboard from "./GA4Dashboard";
import SiteAudit from "./SiteAudit";
import Compare from "./Compare";
import ReportGenerator from "./ReportGenerator";
import RankTracker from "./RankTracker";
import ContentCalendar from "./ContentCalendar";
import SeoChecklist from "./SeoChecklist";
import AiWriter from "./AiWriter";
import BrandTracker from "./BrandTracker";
import LocationKeywords from "./LocationKeywords";
import AEO from "./AEO";
import AIMode from "./AIMode";
import MetaPreview from "./MetaPreview";
import SerpSimulator from "./SerpSimulator";
import PromptToContent from "./PromptToContent";
import CompetitorGap from "./CompetitorGap";
import ReadabilityChecker from "./ReadabilityChecker";
import BacklinkAnalyzer from "./BacklinkAnalyzer";
import SitemapGenerator from "./SitemapGenerator";
import UserPanel from "./pages/UserPanel";
import GlobalChat from "./GlobalChat";
import ClientPortal from "./pages/ClientPortal";

// ── URL param detection — no auth needed ──────────
const _params      = new URLSearchParams(window.location.search);
const portalToken  = _params.get("portal");
const gscConnected = _params.get("gsc_connected"); // clientId returned after GSC OAuth
const gscError     = _params.get("gsc_error");
const ga4Connected = _params.get("ga4_connected"); // clientId returned after GA4 OAuth
const ga4Error     = _params.get("ga4_error");

// ── Main App wrapped with Auth ─────────────────────
export default function App() {
  // White-label portal: bypass login entirely
  if (portalToken) return <ClientPortal token={portalToken} />;

  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}

// ── Inner App — Auth check hoga yahan ─────────────
function AppInner() {
  const { user, logout } = useAuth();

  // Agar user login nahi hai — Login page dikhao
  if (!user) {
    return <Login />;
  }

  // User login hai — main app dikhao
  return <MainApp onLogout={logout} />;
}

// ── Main App ───────────────────────────────────────
function MainApp({ onLogout }) {
  const { user, googleToken } = useAuth();
  const [tool, setTool]       = useState(null);
  const [page, setPage]       = useState("dashboard");
  const [gscBanner, setGscBanner] = useState(
    gscConnected ? "success" : gscError ? "error" : null
  );
  const [ga4Banner, setGa4Banner] = useState(
    ga4Connected ? "success" : ga4Error ? "error" : null
  );
  const [input, setInput]     = useState("");
  const [msgs, setMsgs]       = useState({});
  const [loading, setLoading] = useState(false);
  const [model, setModel]     = useState("groq");
  const [cat, setCat]         = useState("All");
  const [sideOpen, setSideOpen] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [count, setCount]     = useState(0);
  const [dark, setDark]       = useState(true);
  const [keys, setKeys]       = useState({ groq:"", gemini:"", google:"", openrouter:"", gaPropertyId:"", seranking:"", serpapi:"", semrush:"", dataforseo:"" });
  const [tmpKeys, setTmpKeys] = useState({ groq:"", gemini:"", google:"", openrouter:"", gaPropertyId:"", seranking:"", serpapi:"", semrush:"", dataforseo:"" });
  const [copied, setCopied]   = useState(null);
  const [bulkInput, setBulkInput]     = useState("");
  const [bulkResults, setBulkResults] = useState([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    const saved = localStorage.getItem("seo_keys");
    if (saved) { const k = JSON.parse(saved); setKeys(k); setTmpKeys(k); }
    const savedCount = localStorage.getItem("seo_count");
    if (savedCount) setCount(parseInt(savedCount));
    const savedDark = localStorage.getItem("seo_dark");
    if (savedDark !== null) setDark(savedDark === "true");
    // Load backend keys (seranking, serpapi, etc.) into settings
    if (user) loadBackendKeys();
  }, []);

  async function loadBackendKeys() {
    try {
      const token = await user.getIdToken();
      const res   = await fetch("https://seo-agent-backend-8m1z.onrender.com/api/keys/get", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const k    = data.keys || {};
      setTmpKeys(prev => ({
        ...prev,
        seranking:  k.seranking  ? "••••••••" : "",
        serpapi:    k.serpapi    ? "••••••••" : "",
        semrush:    k.semrush    ? "••••••••" : "",
        dataforseo: k.dataforseo ? "••••••••" : "",
      }));
    } catch { /* silent */ }
  }

  useEffect(() => {
    document.body.style.background = dark ? "#0a0a0a" : "#f5f5f0";
    document.body.style.color = dark ? "#e8e8e8" : "#1a1a18";
  }, [dark]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, loading]);

  const curMsgs = tool ? (msgs[tool.id] || []) : [];
  const filtered = cat === "All" ? TOOLS : TOOLS.filter(t => t.cat === cat);
  const catGroups = [...new Set(filtered.map(t => t.cat))];
  const totalHistory = Object.values(msgs).reduce((a, m) => a + Math.floor(m.length / 2), 0);

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const txt3 = dark ? "#444"    : "#bbb";

  function toggleDark() {
    const nd = !dark; setDark(nd);
    localStorage.setItem("seo_dark", nd);
  }

  async function saveKeys() {
    localStorage.setItem("seo_keys", JSON.stringify(tmpKeys));
    setKeys(tmpKeys);
    // Also save backend-specific keys to Firestore
    try {
      const token   = await user.getIdToken();
      const payload = {};
      if (tmpKeys.seranking  && tmpKeys.seranking  !== "••••••••") payload.seranking  = tmpKeys.seranking;
      if (tmpKeys.serpapi    && tmpKeys.serpapi    !== "••••••••") payload.serpapi    = tmpKeys.serpapi;
      if (tmpKeys.semrush    && tmpKeys.semrush    !== "••••••••") payload.semrush    = tmpKeys.semrush;
      if (tmpKeys.dataforseo && tmpKeys.dataforseo !== "••••••••") payload.dataforseo = tmpKeys.dataforseo;
      if (Object.keys(payload).length > 0) {
        await fetch("https://seo-agent-backend-8m1z.onrender.com/api/keys/save", {
          method:  "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body:    JSON.stringify(payload),
        });
      }
    } catch { /* silent — localStorage save already done */ }
    setShowSettings(false);
  }

  function copyText(text, id) {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  function addMsg(toolId, msg) {
    setMsgs(m => ({ ...m, [toolId]: [...(m[toolId] || []), msg] }));
  }

  function selectTool(t) {
    setTool(t); setPage("tool"); setInput("");
  }

  function downloadText(text, filename) {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  async function callAI(prompt) {
    if (model === "groq") {
      if (!keys.groq) return null;
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${keys.groq}` },
        body: JSON.stringify({ model: "llama-3.1-8b-instant", max_tokens: 2000, messages: [{ role: "user", content: prompt }] })
      });
      const d = await res.json();
      return d.choices?.[0]?.message?.content || null;
    } else if (model === "gemini") {
      if (!keys.gemini) return null;
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${keys.gemini}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const d = await res.json();
      return d.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } else if (model === "deepseek") {
      if (!keys.openrouter) return null;
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${keys.openrouter}` },
        body: JSON.stringify({ model: "deepseek/deepseek-r1:free", max_tokens: 2000, messages: [{ role: "user", content: prompt }] })
      });
      const d = await res.json();
      return d.choices?.[0]?.message?.content || null;
    } else if (model === "mistral") {
      if (!keys.openrouter) return null;
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${keys.openrouter}` },
        body: JSON.stringify({ model: "mistralai/mistral-7b-instruct:free", max_tokens: 2000, messages: [{ role: "user", content: prompt }] })
      });
      const d = await res.json();
      return d.choices?.[0]?.message?.content || null;
    }
    return null;
  }

  async function runBulkKeywords() {
    const keywords = bulkInput.split("\n").map(k => k.trim()).filter(Boolean);
    if (!keywords.length) return;
    if (!keys.groq && !keys.gemini && !keys.openrouter) { setShowSettings(true); return; }
    setBulkLoading(true); setBulkResults([]);
    for (const kw of keywords.slice(0, 10)) {
      const prompt = `Analyze this SEO keyword: "${kw}". Give: 1) Search intent (1 word) 2) Difficulty (Low/Med/High) 3) One content angle. Format: Intent: X | Difficulty: X | Angle: X`;
      const result = await callAI(prompt);
      setBulkResults(r => [...r, { keyword: kw, result: result || "Error" }]);
    }
    setBulkLoading(false);
  }

  async function runPageSpeed(url) {
    if (!keys.google) { setShowSettings(true); return; }
    addMsg(tool.id, { role: "user", text: url });
    setLoading(true); setInput("");
    try {
      const [mob, desk] = await Promise.all([
        fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${keys.google}&strategy=mobile`).then(r => r.json()),
        fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${keys.google}&strategy=desktop`).then(r => r.json()),
      ]);
      const score = (d, k) => Math.round((d.lighthouseResult?.categories?.[k]?.score || 0) * 100);
      const val   = (d, k) => d.lighthouseResult?.audits?.[k]?.displayValue || "N/A";
      const grade = s => s >= 90 ? "✅ Good" : s >= 50 ? "⚠️ Needs Work" : "❌ Poor";
      const text = `## ⚡ Page Speed Report\n\n**URL:** ${url}\n\n### 📱 Mobile\n- **Performance:** ${score(mob,"performance")}/100 ${grade(score(mob,"performance"))}\n- **SEO:** ${score(mob,"seo")}/100 ${grade(score(mob,"seo"))}\n- **Accessibility:** ${score(mob,"accessibility")}/100\n- **Best Practices:** ${score(mob,"best-practices")}/100\n\n### 🖥️ Desktop\n- **Performance:** ${score(desk,"performance")}/100 ${grade(score(desk,"performance"))}\n- **SEO:** ${score(desk,"seo")}/100\n\n### 📊 Core Web Vitals\n- **LCP:** ${val(mob,"largest-contentful-paint")} *(target: <2.5s)*\n- **TBT:** ${val(mob,"total-blocking-time")} *(target: <100ms)*\n- **CLS:** ${val(mob,"cumulative-layout-shift")} *(target: <0.1)*\n- **FCP:** ${val(mob,"first-contentful-paint")}\n- **TTFB:** ${val(mob,"server-response-time")}`;
      addMsg(tool.id, { role: "assistant", text });
      const nc = count + 1; setCount(nc); localStorage.setItem("seo_count", nc);
    } catch(e) { addMsg(tool.id, { role: "assistant", text: "Error: " + e.message }); }
    setLoading(false);
  }

  async function run() {
    const q = input.trim();
    if (!q || loading || !tool) return;
    if (tool.isApi && tool.apiType === "pagespeed") { runPageSpeed(q); return; }
    const hasKey = keys.groq || keys.gemini || keys.openrouter;
    if (!hasKey) { setShowSettings(true); return; }
    addMsg(tool.id, { role: "user", text: q });
    setInput(""); setLoading(true);
    try {
      const text = await callAI(tool.prompt(q));
      addMsg(tool.id, { role: "assistant", text: text || "No response. Check your API key in Settings." });
      const nc = count + 1; setCount(nc); localStorage.setItem("seo_count", nc);
    } catch(e) { addMsg(tool.id, { role: "assistant", text: "Error: " + e.message }); }
    setLoading(false);
  }

  const s = {
    app:     { fontFamily:"Inter,system-ui,sans-serif", display:"flex", height:"100vh", background:bg, color:txt, overflow:"hidden" },
    side:    { width:sideOpen?260:0, minWidth:sideOpen?260:0, background:bg2, borderRight:`1px solid ${bdr}`, display:"flex", flexDirection:"column", transition:"all 0.2s", overflow:"hidden", flexShrink:0 },
    logo:    { padding:"16px 18px", borderBottom:`1px solid ${bdr}`, display:"flex", alignItems:"center", gap:12, flexShrink:0 },
    badge:   { width:36, height:36, borderRadius:10, background:"linear-gradient(135deg,#443DCB,#3730b8)", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:16, color:"#fff", flexShrink:0, boxShadow:"0 2px 8px #443DCB44" },
    nav:     { flex:1, overflowY:"auto", padding:"8px 8px 4px", scrollbarWidth:"thin" },
    catRow:  { display:"flex", flexWrap:"wrap", gap:4, padding:"8px 4px 4px" },
    catBtn:  a => ({ padding:"4px 11px", borderRadius:20, fontSize:11, fontWeight:a?700:400, cursor:"pointer", border:"1px solid", background:a?"#443DCB22":"transparent", color:a?"#443DCB":txt2, borderColor:a?"#443DCB55":bdr }),
    secLabel:{ fontSize:10, fontWeight:700, color:txt3, padding:"14px 6px 5px", textTransform:"uppercase", letterSpacing:"0.1em" },
    navItem: (a, color) => ({
      display:"flex", alignItems:"center", gap:10, padding:"9px 12px",
      borderRadius:9, marginBottom:2, cursor:"pointer",
      fontSize:13, fontWeight:a?600:400,
      background: a ? `${color}18` : "transparent",
      color: a ? color : txt2,
      borderLeft: a ? `3px solid ${color}` : "3px solid transparent",
      transition:"background 0.15s, color 0.15s",
      whiteSpace:"nowrap",
    }),
    main:    { flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0 },
    header:  { padding:"11px 18px", borderBottom:`1px solid ${bdr}`, background:bg2, display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, flexShrink:0 },
    msgs:    { flex:1, overflowY:"auto", padding:"20px", display:"flex", flexDirection:"column", gap:14 },
    uBub:    { alignSelf:"flex-end", background:"#443DCB", color:"#fff", padding:"10px 14px", borderRadius:"12px 12px 4px 12px", maxWidth:"75%", fontSize:13, lineHeight:1.6, whiteSpace:"pre-wrap" },
    aBub:    { alignSelf:"flex-start", background:bg3, border:`1px solid ${bdr}`, color:txt, padding:"14px 16px", borderRadius:"4px 12px 12px 12px", maxWidth:"88%", fontSize:13 },
    inputArea:{ padding:"12px 16px", borderTop:`1px solid ${bdr}`, background:bg2, flexShrink:0 },
    textarea: { flex:1, padding:"10px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, resize:"none", outline:"none", fontFamily:"inherit", lineHeight:1.5 },
    runBtn:  ok => ({ padding:"0 18px", borderRadius:10, border:"none", background:ok?"#443DCB":bdr, color:ok?"#fff":txt3, fontWeight:600, fontSize:13, cursor:ok?"pointer":"not-allowed", flexShrink:0, minWidth:64 }),
    overlay: { position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 },
    modal:   { background:bg2, border:`1px solid ${bdr}`, borderRadius:16, padding:28, width:440, maxWidth:"92vw" },
    label:   { fontSize:12, color:txt2, marginBottom:4, display:"block", marginTop:12 },
    inp:     { width:"100%", padding:"9px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", boxSizing:"border-box" },
    saveBtn: { width:"100%", padding:11, borderRadius:8, border:"none", background:"#443DCB", color:"#fff", fontWeight:600, fontSize:14, cursor:"pointer", marginTop:16 },
  };

  const pageLabels = {
    dashboard:"🏠 Dashboard", history:"📚 History", bulk:"📊 Bulk Keywords",
    gsc:"📈 Search Console", ga4:"📊 GA4 Analytics", audit:"🏥 Site Audit",
    compare:"⚔️ Compare Sites", report:"📄 Report Generator", ranktracker:"📡 Rank Tracker",
    calendar:"📅 Content Calendar", checklist:"✅ SEO Checklist", writer:"✍️ AI Writer",
    brandtracker:"🔍 Brand Tracker", location:"🌍 Location Keywords",
    aeo:"🎯 AEO Optimizer", aimode:"🤖 AI Mode Optimizer",
    metapreview:"🏷️ Meta Tag Previewer", serpsimulator:"🔎 SERP Simulator",
    promptcontent:"⚡ Prompt-to-Content", competitorgap:"🕵️ Competitor Gap",
    readability:"📖 Readability Checker", backlink:"🔗 Backlink Analyzer",
    sitemap:"🗺️ Sitemap Generator",
  };

  const headerSubs = {
    dashboard:`${TOOLS.length} tools · ${count} analyses`,
    history:`${totalHistory} saved`,
    bulk:"10 keywords at once", gsc:"Last 28 days",
    ga4:"Sessions · Users · Traffic Sources",
    audit:"Technical SEO + AI + Indexing",
    compare:"Side-by-side · Up to 3 sites",
    report:"Client-ready reports + PDF",
    ranktracker:"AI rank + Keyword Volume + CPC",
    calendar:"Plan your content", checklist:"48 items · 7 categories",
    writer:"12 templates + Image SEO",
    brandtracker:"ChatGPT · Gemini · Perplexity · Claude",
    location:"20 countries · AI keyword research",
    aeo:"Google AI Overview · ChatGPT · Perplexity",
    aimode:"AI Overview · AI Mode · Featured Snippets · PAA",
    metapreview:"Live Google · Twitter · Facebook · LinkedIn preview",
    serpsimulator:"AI Google SERP · Ads · Featured · PAA · Local",
    promptcontent:"Topic → Full SEO Page · Content + Meta + Schema",
    competitorgap:"Keyword · Content · Backlink · Technical gaps",
    readability:"Flesch score · Passive voice · Keyword density",
    backlink:"DA estimate · Opportunities · Outreach templates",
    sitemap:"Manual · AI generator · Import · XML download",
  };

  const headerTitle = page==="tool"&&tool ? `${tool.icon} ${tool.label}` : pageLabels[page] || "🏠 Dashboard";
  const headerSub   = page==="tool"&&tool ? `${tool.cat} · ${curMsgs.filter(m=>m.role==="user").length} queries` : headerSubs[page] || "";

  return (
    <div style={s.app}>
      {/* ── GSC OAuth return banner ── */}
      {gscBanner === "success" && (
        <div style={{ position:"fixed", top:16, left:"50%", transform:"translateX(-50%)", zIndex:9999, padding:"12px 24px", borderRadius:10, background:"#059669", color:"#fff", fontWeight:600, fontSize:13, boxShadow:"0 4px 20px #0005", display:"flex", gap:12, alignItems:"center" }}>
          ✅ Search Console connected! Go to the client's 🔌 Integrations tab to see connected sites.
          <button onClick={() => { setGscBanner(null); window.history.replaceState({}, "", window.location.pathname); }} style={{ background:"none", border:"none", color:"#fff", fontSize:16, cursor:"pointer", lineHeight:1 }}>×</button>
        </div>
      )}
      {gscBanner === "error" && (
        <div style={{ position:"fixed", top:16, left:"50%", transform:"translateX(-50%)", zIndex:9999, padding:"12px 24px", borderRadius:10, background:"#DC2626", color:"#fff", fontWeight:600, fontSize:13, boxShadow:"0 4px 20px #0005", display:"flex", gap:12, alignItems:"center" }}>
          ❌ Search Console connection failed: {decodeURIComponent(gscError || "unknown error")}
          <button onClick={() => { setGscBanner(null); window.history.replaceState({}, "", window.location.pathname); }} style={{ background:"none", border:"none", color:"#fff", fontSize:16, cursor:"pointer", lineHeight:1 }}>×</button>
        </div>
      )}
      {/* ── GA4 OAuth return banner ── */}
      {ga4Banner === "success" && (
        <div style={{ position:"fixed", top:ga4Banner&&gscBanner?56:16, left:"50%", transform:"translateX(-50%)", zIndex:9999, padding:"12px 24px", borderRadius:10, background:"#059669", color:"#fff", fontWeight:600, fontSize:13, boxShadow:"0 4px 20px #0005", display:"flex", gap:12, alignItems:"center" }}>
          ✅ Google Analytics 4 connected! Go to the client's 📊 Analytics tab to select your property.
          <button onClick={() => { setGa4Banner(null); window.history.replaceState({}, "", window.location.pathname); }} style={{ background:"none", border:"none", color:"#fff", fontSize:16, cursor:"pointer", lineHeight:1 }}>×</button>
        </div>
      )}
      {ga4Banner === "error" && (
        <div style={{ position:"fixed", top:ga4Banner&&gscBanner?56:16, left:"50%", transform:"translateX(-50%)", zIndex:9999, padding:"12px 24px", borderRadius:10, background:"#DC2626", color:"#fff", fontWeight:600, fontSize:13, boxShadow:"0 4px 20px #0005", display:"flex", gap:12, alignItems:"center" }}>
          ❌ GA4 connection failed: {decodeURIComponent(ga4Error || "unknown error")}
          <button onClick={() => { setGa4Banner(null); window.history.replaceState({}, "", window.location.pathname); }} style={{ background:"none", border:"none", color:"#fff", fontSize:16, cursor:"pointer", lineHeight:1 }}>×</button>
        </div>
      )}
      {/* ── Sidebar ── */}
      <div style={s.side}>
        <div style={s.logo}>
          <div style={s.badge}>S</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:15, fontWeight:800, color:txt, letterSpacing:"-0.3px" }}>SEO Agent</div>
            <div style={{ fontSize:11, color:txt3, marginTop:1 }}>v16.0 · {TOOLS.length} tools</div>
          </div>
        </div>

        <div style={s.nav}>
          <div style={{ padding:"6px 4px 2px" }}>

            {/* User Info */}
            <div style={{ padding:"10px 12px", marginBottom:8, background:bg3, borderRadius:10, display:"flex", alignItems:"center", gap:10, border:`1px solid ${bdr}` }}>
              <div style={{ width:34, height:34, borderRadius:"50%", background:"linear-gradient(135deg,#443DCB,#3730b8)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, color:"#fff", fontWeight:800, flexShrink:0, boxShadow:"0 2px 6px #443DCB44" }}>
                {user?.displayName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "U"}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:700, color:txt, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {user?.displayName || user?.email?.split("@")[0] || "User"}
                </div>
                <div style={{ fontSize:10, color:"#6B62E8", fontWeight:600, marginTop:1 }}>Free Plan</div>
              </div>
              <div onClick={onLogout} title="Logout"
                style={{ fontSize:15, cursor:"pointer", color:txt3, padding:4 }}>🚪</div>
            </div>

            <div style={s.secLabel}>Agency</div>
            <div onClick={()=>setPage("clients")} style={s.navItem(page==="clients", "#443DCB")}>🏢 <span>Client Manager</span></div>
            <div onClick={()=>setPage("users")} style={s.navItem(page==="users", "#DC2626")}>👥 <span>User Management</span></div>

            <div style={s.secLabel}>Main</div>
            <div onClick={()=>setPage("dashboard")}     style={s.navItem(page==="dashboard",     "#443DCB")}>🏠 <span>Dashboard</span></div>
            <div onClick={()=>setPage("promptcontent")} style={s.navItem(page==="promptcontent", "#F59E0B")}>⚡ <span>Prompt-to-Content</span></div>
            <div onClick={()=>setPage("writer")}        style={s.navItem(page==="writer",        "#443DCB")}>✍️ <span>AI Writer</span></div>

            <div style={s.secLabel}>Analytics</div>
            <div onClick={()=>setPage("gsc")}           style={s.navItem(page==="gsc",           "#059669")}>📈 <span>Search Console</span></div>
            <div onClick={()=>setPage("ga4")}           style={s.navItem(page==="ga4",           "#DC2626")}>📊 <span>GA4 Analytics</span></div>
            <div onClick={()=>setPage("ranktracker")}   style={s.navItem(page==="ranktracker",   "#059669")}>📡 <span>Rank Tracker</span></div>
            <div onClick={()=>setPage("brandtracker")}  style={s.navItem(page==="brandtracker",  "#10A37F")}>🔍 <span>Brand Tracker</span></div>

            <div style={s.secLabel}>SEO Tools</div>
            <div onClick={()=>setPage("audit")}         style={s.navItem(page==="audit",         "#DC2626")}>🏥 <span>Site Audit</span></div>
            <div onClick={()=>setPage("compare")}       style={s.navItem(page==="compare",       "#0891B2")}>⚔️ <span>Compare Sites</span></div>
            <div onClick={()=>setPage("competitorgap")} style={s.navItem(page==="competitorgap", "#443DCB")}>🕵️ <span>Competitor Gap</span></div>
            <div onClick={()=>setPage("backlink")}      style={s.navItem(page==="backlink",      "#1E40AF")}>🔗 <span>Backlink Analyzer</span></div>
            <div onClick={()=>setPage("readability")}   style={s.navItem(page==="readability",   "#059669")}>📖 <span>Readability Checker</span></div>
            <div onClick={()=>setPage("sitemap")}       style={s.navItem(page==="sitemap",       "#D97706")}>🗺️ <span>Sitemap Generator</span></div>

            <div style={s.secLabel}>AI Optimization</div>
            <div onClick={()=>setPage("aeo")}           style={s.navItem(page==="aeo",           "#443DCB")}>🎯 <span>AEO Optimizer</span></div>
            <div onClick={()=>setPage("aimode")}        style={s.navItem(page==="aimode",        "#4285F4")}>🤖 <span>AI Mode Optimizer</span></div>
            <div onClick={()=>setPage("location")}      style={s.navItem(page==="location",      "#059669")}>🌍 <span>Location Keywords</span></div>
            <div onClick={()=>setPage("serpsimulator")} style={s.navItem(page==="serpsimulator", "#EA4335")}>🔎 <span>SERP Simulator</span></div>
            <div onClick={()=>setPage("metapreview")}   style={s.navItem(page==="metapreview",   "#D97706")}>🏷️ <span>Meta Previewer</span></div>

            <div style={s.secLabel}>Planning</div>
            <div onClick={()=>setPage("calendar")}      style={s.navItem(page==="calendar",      "#B45309")}>📅 <span>Content Calendar</span></div>
            <div onClick={()=>setPage("checklist")}     style={s.navItem(page==="checklist",     "#059669")}>✅ <span>SEO Checklist</span></div>
            <div onClick={()=>setPage("bulk")}          style={s.navItem(page==="bulk",          "#CA8A04")}>📊 <span>Bulk Keywords</span></div>
            <div onClick={()=>setPage("report")}        style={s.navItem(page==="report",        "#9333EA")}>📄 <span>Report Generator</span></div>
            <div onClick={()=>setPage("history")}       style={s.navItem(page==="history",       "#D97706")}>
              📚 <span>History</span>
              {totalHistory>0 && <span style={{ marginLeft:"auto", fontSize:10, background:"#D9770622", color:"#D97706", padding:"1px 6px", borderRadius:10, flexShrink:0 }}>{totalHistory}</span>}
            </div>
          </div>

          <div style={s.catRow}>
            {CATS.map(c => <div key={c} style={s.catBtn(cat===c)} onClick={()=>setCat(c)}>{c}</div>)}
          </div>

          {catGroups.map(c => (
            <div key={c}>
              <div style={s.secLabel}>{c}</div>
              {filtered.filter(t=>t.cat===c).map(t => (
                <div key={t.id} style={s.navItem(page==="tool"&&tool?.id===t.id, t.color)} onClick={()=>selectTool(t)}>
                  <span style={{ fontSize:14, flexShrink:0 }}>{t.icon}</span>
                  <span style={{ overflow:"hidden", textOverflow:"ellipsis" }}>{t.label}</span>
                  {t.isApi && <span style={{ fontSize:9, background:"#0F766E22", color:"#0F766E", padding:"1px 5px", borderRadius:4, marginLeft:"auto", flexShrink:0 }}>API</span>}
                  {(msgs[t.id]||[]).length>0 && <span style={{ width:6, height:6, borderRadius:"50%", background:t.color, marginLeft:"auto", flexShrink:0 }} />}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div style={{ padding:"8px 10px 10px", borderTop:`1px solid ${bdr}`, flexShrink:0 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 8px 8px" }}>
            <span style={{ fontSize:12, color:txt3 }}>Total analyses</span>
            <span style={{ fontSize:13, color:"#443DCB", fontWeight:700 }}>{count}</span>
          </div>
          <div onClick={()=>{ setTmpKeys({...keys}); setShowSettings(true); }}
            style={{ padding:"9px 12px", borderRadius:9, cursor:"pointer", fontSize:13, color:txt2, display:"flex", alignItems:"center", gap:10, background:bg3, border:`1px solid ${bdr}` }}>
            ⚙️ <span style={{ fontWeight:500 }}>Settings & API Keys</span>
          </div>
        </div>
      </div>

      {/* ── Main Area ── */}
      <div style={s.main}>
        <div style={s.header}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <button onClick={()=>setSideOpen(o=>!o)} style={{ background:"none", border:"none", color:txt2, cursor:"pointer", fontSize:18, padding:"2px 6px", lineHeight:1 }}>☰</button>
            <div>
              <div style={{ fontWeight:700, fontSize:14, color:txt }}>{headerTitle}</div>
              <div style={{ fontSize:10, color:txt3 }}>{headerSub}</div>
            </div>
          </div>
          <div style={{ display:"flex", gap:6, alignItems:"center" }}>
            {page==="tool" && tool && !tool.isApi && Object.entries(MODELS).map(([k,v]) => (
              <div key={k} onClick={()=>setModel(k)}
                style={{ padding:"4px 12px", borderRadius:20, cursor:"pointer", fontSize:12, fontWeight:model===k?700:400, background:model===k?v.color+"22":"transparent", color:model===k?v.color:txt2, border:`1px solid ${model===k?v.color+"55":bdr}` }}>
                {v.name}
              </div>
            ))}
            {page==="tool" && curMsgs.length>0 && (
              <button onClick={()=>setMsgs(m=>({...m,[tool.id]:[]}))}
                style={{ padding:"4px 10px", borderRadius:20, border:`1px solid ${bdr}`, background:"transparent", color:txt2, fontSize:12, cursor:"pointer" }}>Clear</button>
            )}
            <button onClick={toggleDark}
              style={{ padding:"4px 10px", borderRadius:20, border:`1px solid ${bdr}`, background:"transparent", color:txt2, fontSize:12, cursor:"pointer" }}>
              {dark?"☀️":"🌙"}
            </button>
            <div onClick={()=>{ setTmpKeys({...keys}); setShowSettings(true); }}
              style={{ padding:"4px 10px", borderRadius:20, cursor:"pointer", fontSize:12, color:txt2, border:`1px solid ${bdr}` }}>⚙️</div>
            <div onClick={onLogout}
              style={{ padding:"4px 10px", borderRadius:20, cursor:"pointer", fontSize:12, color:"#DC2626", border:"1px solid #DC262633" }}>🚪 Logout</div>
          </div>
        </div>

        {/* ── Pages ── */}
        {page==="clients"       && <ClientManager dark={dark} />}
        {page==="users"         && <UserPanel dark={dark} />}
        {page==="dashboard"     && <Dashboard onToolSelect={selectTool} count={count} keys={keys} dark={dark} onPageSelect={setPage} />}
        {page==="promptcontent" && <PromptToContent dark={dark} keys={keys} model={model} />}
        {page==="writer"        && <AiWriter dark={dark} keys={keys} model={model} />}
        {page==="gsc"           && <GscDashboard dark={dark} gscToken={googleToken} />}
        {page==="ga4"           && <GA4Dashboard dark={dark} googleKey={keys.google} keys={keys} model={model} />}
        {page==="audit"         && <SiteAudit dark={dark} googleKey={keys.google} groqKey={keys.groq} geminiKey={keys.gemini} model={model} />}
        {page==="compare"       && <Compare dark={dark} googleKey={keys.google} />}
        {page==="ranktracker"   && <RankTracker dark={dark} keys={keys} model={model} />}
        {page==="brandtracker"  && <BrandTracker dark={dark} keys={keys} model={model} />}
        {page==="location"      && <LocationKeywords dark={dark} keys={keys} model={model} />}
        {page==="aeo"           && <AEO dark={dark} keys={keys} model={model} />}
        {page==="aimode"        && <AIMode dark={dark} keys={keys} model={model} />}
        {page==="metapreview"   && <MetaPreview dark={dark} keys={keys} model={model} />}
        {page==="serpsimulator" && <SerpSimulator dark={dark} keys={keys} model={model} />}
        {page==="competitorgap" && <CompetitorGap dark={dark} keys={keys} model={model} />}
        {page==="readability"   && <ReadabilityChecker dark={dark} keys={keys} model={model} />}
        {page==="backlink"      && <BacklinkAnalyzer dark={dark} keys={keys} model={model} />}
        {page==="sitemap"       && <SitemapGenerator dark={dark} keys={keys} model={model} />}
        {page==="calendar"      && <ContentCalendar dark={dark} keys={keys} model={model} />}
        {page==="checklist"     && <SeoChecklist dark={dark} />}
        {page==="report"        && <ReportGenerator dark={dark} keys={keys} model={model} msgs={msgs} />}
        {page==="history"       && <History msgs={msgs} onToolSelect={selectTool} dark={dark} />}

        {page==="bulk" && (
          <div style={{ flex:1, overflowY:"auto", padding:24, background:bg }}>
            <div style={{ maxWidth:700, margin:"0 auto" }}>
              <div style={{ fontSize:18, fontWeight:700, color:txt, marginBottom:4 }}>📊 Bulk Keyword Analyzer</div>
              <div style={{ fontSize:13, color:txt2, marginBottom:20 }}>Enter up to 10 keywords (one per line)</div>
              <textarea value={bulkInput} onChange={e=>setBulkInput(e.target.value)}
                placeholder={"digital marketing\nseo tools 2025\nbest keyword research tool"}
                rows={8} style={{ ...s.textarea, width:"100%", marginBottom:12, borderRadius:10 }} />
              <button onClick={runBulkKeywords} disabled={bulkLoading||!bulkInput.trim()}
                style={{ ...s.runBtn(!bulkLoading&&!!bulkInput.trim()), padding:"10px 24px", borderRadius:10, marginBottom:20 }}>
                {bulkLoading?"Analyzing...":"▶ Analyze All"}
              </button>
              {bulkResults.length>0 && (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {bulkResults.map((r,i) => (
                    <div key={i} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"12px 16px" }}>
                      <div style={{ fontWeight:600, color:"#443DCB", fontSize:13, marginBottom:6 }}>🔍 {r.keyword}</div>
                      <div style={{ fontSize:12, color:txt2, lineHeight:1.7 }}>{r.result}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {page==="tool" && tool && (
          <>
            <div style={s.msgs}>
              {curMsgs.length===0 && (
                <div style={{ margin:"auto", textAlign:"center", color:txt3, padding:40 }}>
                  <div style={{ fontSize:44, marginBottom:14 }}>{tool.icon}</div>
                  <div style={{ fontSize:17, fontWeight:700, color:txt, marginBottom:8 }}>{tool.label}</div>
                  <div style={{ fontSize:13, color:txt2, marginBottom:20 }}>{tool.ph}</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8, justifyContent:"center" }}>
                    {["digital marketing agency","e-commerce store","SaaS tool","local restaurant"].map(ex => (
                      <div key={ex} onClick={()=>setInput(ex)}
                        style={{ padding:"6px 14px", borderRadius:20, border:`1px solid ${bdr}`, color:txt2, fontSize:12, cursor:"pointer" }}>{ex}</div>
                    ))}
                  </div>
                </div>
              )}
              {curMsgs.map((m,i) => (
                <div key={i} style={{ display:"flex", justifyContent:m.role==="user"?"flex-end":"flex-start" }}>
                  {m.role==="user" ? (
                    <div style={s.uBub}>{m.text}</div>
                  ) : (
                    <div style={{ maxWidth:"88%", display:"flex", flexDirection:"column", gap:4 }}>
                      <div style={s.aBub}><Markdown text={m.text} dark={dark} /></div>
                      <div style={{ display:"flex", gap:6, paddingLeft:4 }}>
                        <button onClick={()=>copyText(m.text,i)}
                          style={{ padding:"3px 10px", borderRadius:6, border:`1px solid ${bdr}`, background:"transparent", color:copied===i?"#0F766E":txt2, fontSize:11, cursor:"pointer" }}>
                          {copied===i?"✅ Copied!":"📋 Copy"}
                        </button>
                        <button onClick={()=>downloadText(m.text,`seo-${tool.id}-${Date.now()}.txt`)}
                          style={{ padding:"3px 10px", borderRadius:6, border:`1px solid ${bdr}`, background:"transparent", color:txt2, fontSize:11, cursor:"pointer" }}>
                          ⬇️ Download
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div style={{ display:"flex", justifyContent:"flex-start" }}>
                  <div style={{ ...s.aBub, color:txt3 }}>{tool.isApi?"⚡ Fetching...":`🤔 Analyzing with ${MODELS[model]?.name}...`}</div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
            <div style={s.inputArea}>
              <div style={{ display:"flex", gap:8 }}>
                <textarea value={input} onChange={e=>setInput(e.target.value)}
                  onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();run();} }}
                  placeholder={tool.ph} rows={2} style={s.textarea} />
                <button onClick={run} disabled={loading||!input.trim()} style={s.runBtn(!loading&&!!input.trim())}>
                  {loading?"...":"Run ▶"}
                </button>
              </div>
              <div style={{ fontSize:11, color:txt3, marginTop:5 }}>
                Enter to run · Shift+Enter new line · {tool.isApi?"Google API":`Model: ${MODELS[model]?.name}`}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Settings Modal ── */}
      {showSettings && (
        <div style={s.overlay} onClick={()=>setShowSettings(false)}>
          <div style={s.modal} onClick={e=>e.stopPropagation()}>
            <div style={{ fontWeight:700, fontSize:17, color:txt }}>⚙️ API Keys</div>
            <div style={{ fontSize:12, color:txt2, marginTop:4 }}>Saved in browser · persist across sessions</div>
            <label style={s.label}>Groq API Key (gsk_...)</label>
            <input type="password" value={tmpKeys.groq} onChange={e=>setTmpKeys(k=>({...k,groq:e.target.value}))} placeholder="gsk_xxxxxxxxxxxx" style={s.inp} />
            <label style={s.label}>Gemini API Key (AIza...)</label>
            <input type="password" value={tmpKeys.gemini} onChange={e=>setTmpKeys(k=>({...k,gemini:e.target.value}))} placeholder="AIzaxxxxxxxxxx" style={s.inp} />
            <label style={s.label}>Google APIs Key — PageSpeed + GSC + GA4</label>
            <input type="password" value={tmpKeys.google} onChange={e=>setTmpKeys(k=>({...k,google:e.target.value}))} placeholder="AIzaxxxxxxxxxx" style={s.inp} />
            <label style={s.label}>OpenRouter Key — DeepSeek + Mistral (Free)</label>
            <input type="password" value={tmpKeys.openrouter} onChange={e=>setTmpKeys(k=>({...k,openrouter:e.target.value}))} placeholder="sk-or-xxxxxxxxxxxx" style={s.inp} />
            <label style={s.label}>GA Property ID — Google Analytics Data API</label>
            <input type="text" value={tmpKeys.gaPropertyId} onChange={e=>setTmpKeys(k=>({...k,gaPropertyId:e.target.value}))} placeholder="properties/123456789" style={s.inp} />
            <div style={{ borderTop:`1px solid ${dark?"#222":"#e5e5e5"}`, margin:"14px 0 10px", paddingTop:10 }}>
              <div style={{ fontSize:12, fontWeight:700, color:txt, marginBottom:6 }}>📍 Rank Tracker Keys</div>
              <div style={{ fontSize:11, color:txt2, marginBottom:8 }}>Required for live Google position checking</div>
            </div>
            <label style={s.label}>SerpAPI Key — Live rank checking (100 free/month · serpapi.com)</label>
            <input type="password" value={tmpKeys.serpapi} onChange={e=>setTmpKeys(k=>({...k,serpapi:e.target.value}))} placeholder="Paste your SerpAPI key" style={s.inp} />
            <label style={s.label}>SE Ranking API Key — Keyword metrics: volume, KD, CPC (seranking.com)</label>
            <input type="password" value={tmpKeys.seranking} onChange={e=>setTmpKeys(k=>({...k,seranking:e.target.value}))} placeholder="Paste your SE Ranking API key" style={s.inp} />
            <label style={s.label}>Semrush API Key — Keyword research + competitor analysis (semrush.com)</label>
            <input type="password" value={tmpKeys.semrush} onChange={e=>setTmpKeys(k=>({...k,semrush:e.target.value}))} placeholder="Paste your Semrush API key" style={s.inp} />
            <label style={s.label}>DataForSEO — login:password (bulk SERP · ~$0.001/keyword · dataforseo.com)</label>
            <input type="text" value={tmpKeys.dataforseo} onChange={e=>setTmpKeys(k=>({...k,dataforseo:e.target.value}))} placeholder="yourlogin@email.com:password" style={s.inp} />
            <div style={{ borderTop:`1px solid ${dark?"#222":"#e5e5e5"}`, margin:"16px 0 12px", paddingTop:12 }}>
              <div style={{ fontSize:12, fontWeight:700, color:txt, marginBottom:6 }}>📧 Email Notifications</div>
              <div style={{ fontSize:11, color:txt2, marginBottom:8, lineHeight:1.5 }}>Set these in <strong>Render Environment Variables</strong>. Pipeline complete + ranking drop alerts will be emailed automatically.</div>
              <div style={{ background:dark?"#1a1a1a":"#f0f0ea", borderRadius:8, padding:"10px 12px", fontSize:11, color:txt2, fontFamily:"monospace", lineHeight:2 }}>
                GMAIL_USER=you@gmail.com<br/>
                GMAIL_PASS=xxxx-xxxx-xxxx-xxxx<br/>
                APP_URL=https://your-app.onrender.com
              </div>
              <div style={{ fontSize:11, color:"#D97706", marginTop:6 }}>Gmail: use App Password — Google Account → Security → App Passwords</div>
            </div>
            <button onClick={saveKeys} style={s.saveBtn}>💾 Save Keys</button>
            <div style={{ fontSize:11, color:txt3, marginTop:10, textAlign:"center" }}>
              Groq: console.groq.com · Gemini: aistudio.google.com · OpenRouter: openrouter.ai
            </div>
          </div>
        </div>
      )}

      {/* ── Global AI Chatbot ── */}
      <GlobalChat
        dark={dark}
        currentPage={page}
        onNavigate={setPage}
      />
    </div>
  );
}
