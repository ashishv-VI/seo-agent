import { useState, useRef } from "react";

const COUNTRY_EMOJIS = {
  "India":"🇮🇳","United States":"🇺🇸","United Kingdom":"🇬🇧","Canada":"🇨🇦",
  "Australia":"🇦🇺","Germany":"🇩🇪","France":"🇫🇷","Japan":"🇯🇵","Brazil":"🇧🇷",
  "Pakistan":"🇵🇰","Bangladesh":"🇧🇩","Singapore":"🇸🇬","UAE":"🇦🇪","Saudi Arabia":"🇸🇦",
  "Netherlands":"🇳🇱","Indonesia":"🇮🇩","Mexico":"🇲🇽","Italy":"🇮🇹","Spain":"🇪🇸",
  "South Korea":"🇰🇷","Russia":"🇷🇺","Turkey":"🇹🇷","Philippines":"🇵🇭","Thailand":"🇹🇭",
};

export default function GA4Dashboard({ dark, googleKey, keys, model }) {
  const [activeTab, setActiveTab]   = useState("import");
  const [datasets, setDatasets]     = useState({});
  const [activeDs, setActiveDs]     = useState(null);
  const [csvText, setCsvText]       = useState("");
  const [dsName, setDsName]         = useState("Main Report");
  const [aiAnalysis, setAiAnalysis] = useState("");
  const [aiLoading, setAiLoading]   = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [compareDs, setCompareDs]   = useState(null);
  const [analysisType, setAnalysisType] = useState("general");
  const [dragOver, setDragOver]     = useState(false);
  const fileRef = useRef(null);

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const txt3 = dark ? "#444"    : "#bbb";

  function parseCSV(text) {
    const lines = text.trim().split("\n").filter(l => l.trim());
    if (lines.length < 2) return null;
    const headers = lines[0].split(",").map(h => h.replace(/"/g,"").trim());
    const rows = lines.slice(1).map(line => {
      const vals = []; let cur = ""; let inQ = false;
      for (let c of line) {
        if (c==='"') inQ=!inQ;
        else if (c==="," && !inQ) { vals.push(cur.trim()); cur=""; }
        else cur += c;
      }
      vals.push(cur.trim());
      const obj = {};
      headers.forEach((h,i) => obj[h] = (vals[i]||"").replace(/"/g,"").trim());
      return obj;
    }).filter(r => Object.values(r).some(v=>v));
    return { headers, rows, imported: new Date().toLocaleString() };
  }

  function detectColumns(parsed) {
    if (!parsed) return {};
    const h = parsed.headers.map(x=>x.toLowerCase());
    const find = (...keys) => h.findIndex(x => keys.some(k=>x.includes(k)));
    return {
      country:  find("country","region","location","city"),
      sessions: find("session"),
      users:    find("user","active user"),
      newUsers: find("new user"),
      pageviews:find("pageview","screen","view"),
      bounce:   find("bounce","engagement"),
      duration: find("duration","time"),
      source:   find("source","channel","medium"),
      keyword:  find("keyword","query","search term"),
      page:     find("page","url","path"),
      device:   find("device","platform"),
      revenue:  find("revenue","conversion","goal"),
    };
  }

  function handleFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target.result;
      setCsvText(text);
      const parsed = parseCSV(text);
      if (parsed) {
        const name = file.name.replace(".csv","") || dsName;
        const cols = detectColumns(parsed);
        setDatasets(d => ({ ...d, [name]: { ...parsed, cols, name } }));
        setActiveDs(name);
        setActiveTab("overview");
        setAiAnalysis("");
      }
    };
    reader.readAsText(file);
  }

  function handlePaste() {
    const parsed = parseCSV(csvText);
    if (!parsed) return;
    const cols = detectColumns(parsed);
    const name = dsName || "Dataset " + (Object.keys(datasets).length+1);
    setDatasets(d => ({ ...d, [name]: { ...parsed, cols, name } }));
    setActiveDs(name);
    setActiveTab("overview");
    setAiAnalysis("");
    setCsvText("");
  }

  function handleDrop(e) {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith(".csv")) handleFile(file);
  }

  const ds  = activeDs ? datasets[activeDs] : null;
  const ds2 = compareDs ? datasets[compareDs] : null;

  function getColData(d, colIdx) {
    if (!d || colIdx < 0) return [];
    return d.rows.map(r => parseFloat(r[d.headers[colIdx]])||0);
  }

  function sumCol(d, colIdx) {
    return getColData(d, colIdx).reduce((a,v)=>a+v, 0);
  }

  function getCountryData(d) {
    if (!d || d.cols.country < 0) return [];
    const countryCol  = d.headers[d.cols.country];
    const sessionsCol = d.cols.sessions >= 0 ? d.headers[d.cols.sessions] : null;
    const usersCol    = d.cols.users >= 0 ? d.headers[d.cols.users] : null;
    const map = {};
    d.rows.forEach(r => {
      const country = r[countryCol];
      if (!country) return;
      if (!map[country]) map[country] = { country, sessions:0, users:0, rows:0 };
      map[country].sessions += sessionsCol ? (parseFloat(r[sessionsCol])||0) : 0;
      map[country].users    += usersCol    ? (parseFloat(r[usersCol])||0)    : 0;
      map[country].rows++;
    });
    return Object.values(map).sort((a,b)=>b.sessions||b.rows - a.sessions||a.rows).slice(0,20);
  }

  function getTopRows(d, sortColIdx, limit=10) {
    if (!d || sortColIdx < 0) return d?.rows.slice(0,limit) || [];
    return [...d.rows].sort((a,b) => (parseFloat(b[d.headers[sortColIdx]])||0) - (parseFloat(a[d.headers[sortColIdx]])||0)).slice(0,limit);
  }

  async function runAiAnalysis() {
    if (!ds) return;
    const key = model === "groq" ? keys?.groq : keys?.gemini;
    if (!key) return;
    setAiLoading(true);

    const sample = ds.rows.slice(0,25).map(r => ds.headers.map(h=>r[h]).join(" | ")).join("\n");
    const countryData = getCountryData(ds);
    const countryInfo = countryData.length > 0 ? `\nTop Countries:\n${countryData.slice(0,10).map(c=>`${c.country}: ${c.sessions||c.rows} sessions`).join("\n")}` : "";
    const compareInfo = ds2 ? `\nComparison Dataset (${compareDs}):\n${ds2.rows.slice(0,10).map(r=>ds2.headers.map(h=>r[h]).join(" | ")).join("\n")}` : "";

    const prompts = {
      general: `You are an expert Google Analytics 4 analyst. Analyze this GA4 data comprehensively:

Dataset: ${ds.name}
Headers: ${ds.headers.join(", ")}
Total rows: ${ds.rows.length}
${countryInfo}
Sample data (first 25 rows):
${sample}
${compareInfo}

Provide a detailed analysis:
1. EXECUTIVE SUMMARY — Overall performance (3-4 sentences with specific numbers)
2. KEY METRICS — Most important numbers from this data
3. GEOGRAPHIC INSIGHTS — Which countries/regions are performing best and why
4. TRAFFIC PATTERNS — Peak times, trends, anomalies
5. TOP PERFORMERS — Best pages/sources/campaigns
6. PROBLEM AREAS — Pages with high bounce, low engagement, declining traffic
7. GROWTH OPPORTUNITIES — 5 specific actions to improve performance
8. LOCATION-BASED STRATEGY — How to target top countries better
9. ANOMALY DETECTION — Any unusual spikes or drops in data
10. 30-DAY ACTION PLAN — Prioritized steps with expected impact

Be very specific with numbers. Make every insight actionable.`,

      country: `You are an expert international SEO and GA4 analyst. Focus on geographic analysis:

Dataset: ${ds.name}
Headers: ${ds.headers.join(", ")}
${countryInfo}
Full data sample:
${sample}

Provide deep geographic analysis:
1. TOP COUNTRIES BREAKDOWN — Performance metrics per country
2. COUNTRY-WISE KEYWORD OPPORTUNITIES — What keywords to target per country
3. LANGUAGE & LOCALIZATION needs per market
4. TIMEZONE-BASED PUBLISHING STRATEGY — Best times to publish for each country
5. COUNTRY-SPECIFIC CONTENT GAPS — What each market needs
6. UNTAPPED MARKETS — Countries with potential but low traffic
7. BUDGET ALLOCATION — Which countries to invest more in
8. LOCAL SEO RECOMMENDATIONS per top country
9. CULTURAL CONSIDERATIONS for top markets
10. INTERNATIONAL EXPANSION ROADMAP — Step by step

Be specific with country names and actionable recommendations.`,

      anomaly: `You are an expert data analyst specializing in traffic anomaly detection for GA4:

Dataset: ${ds.name}
Headers: ${ds.headers.join(", ")}
Total rows: ${ds.rows.length}
Data:
${sample}

Find and explain:
1. TRAFFIC ANOMALIES — Unusual spikes or drops with exact dates/values
2. BOUNCE RATE ANOMALIES — Pages with abnormally high/low bounce rates
3. SESSION DURATION ANOMALIES — Unusually short or long sessions
4. GEOGRAPHIC ANOMALIES — Unexpected traffic from certain countries
5. DEVICE ANOMALIES — Unusual device distribution changes
6. POSSIBLE CAUSES — For each anomaly, list likely causes
7. IMPACT ASSESSMENT — How each anomaly affects overall performance
8. IMMEDIATE ACTIONS — What to do about each anomaly
9. MONITORING RECOMMENDATIONS — What to watch going forward
10. PREVENTION STRATEGIES — How to avoid negative anomalies

Be specific with numbers and dates from the data.`,

      compare: ds2 ? `You are an expert GA4 analyst doing period-over-period comparison:

Period 1 (${ds.name}):
Headers: ${ds.headers.join(", ")}
Rows: ${ds.rows.length}
Sample: ${sample}

Period 2 (${compareDs}):
Headers: ${ds2.headers.join(", ")}
Rows: ${ds2.rows.length}
Sample: ${ds2.rows.slice(0,15).map(r=>ds2.headers.map(h=>r[h]).join(" | ")).join("\n")}

Provide comparison analysis:
1. OVERALL PERFORMANCE CHANGE — Key metrics up/down with percentages
2. TRAFFIC SOURCE CHANGES — Which channels grew/declined
3. GEOGRAPHIC CHANGES — Country-level performance shifts
4. PAGE PERFORMANCE CHANGES — Top/bottom movers
5. USER BEHAVIOR CHANGES — Engagement metrics comparison
6. SEASONAL FACTORS — Any calendar-related explanations
7. WINNERS & LOSERS — What improved vs declined
8. ROOT CAUSE ANALYSIS — Why did changes happen
9. FORECAST — Where are metrics heading based on trends
10. RECOMMENDATIONS — Actions based on comparison insights` : "",
    };

    const prompt = prompts[analysisType] || prompts.general;

    try {
      let text = "";
      if (model === "groq") {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method:"POST",
          headers:{ "Content-Type":"application/json", "Authorization":`Bearer ${key}` },
          body: JSON.stringify({ model:"llama-3.1-8b-instant", max_tokens:2500, messages:[{ role:"user", content:prompt }] })
        });
        const d = await res.json();
        text = d.choices?.[0]?.message?.content || "";
      } else {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${keys.gemini}`, {
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          body: JSON.stringify({ contents:[{ parts:[{ text:prompt }] }] })
        });
        const d = await res.json();
        text = d.candidates?.[0]?.content?.parts?.[0]?.text || "";
      }
      setAiAnalysis(text);
      setActiveTab("ai");
    } catch(e) { console.error(e); }
    setAiLoading(false);
  }

  function exportPDF() {
    if (!aiAnalysis || !ds) return;
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>GA4 Analysis — ${ds.name}</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;color:#333;line-height:1.7;}
h1{color:#443DCB;border-bottom:3px solid #443DCB;padding-bottom:10px;}
.meta{background:#f8f5ff;padding:16px;border-radius:8px;margin-bottom:24px;font-size:14px;}
pre{white-space:pre-wrap;font-family:Arial;font-size:13px;}
.footer{margin-top:30px;text-align:center;font-size:11px;color:#888;border-top:1px solid #eee;padding-top:16px;}
</style></head><body>
<h1>📈 GA4 Analysis Report</h1>
<div class="meta">
<strong>Dataset:</strong> ${ds.name} &nbsp;|&nbsp;
<strong>Rows:</strong> ${ds.rows.length} &nbsp;|&nbsp;
<strong>Analysis Type:</strong> ${analysisType} &nbsp;|&nbsp;
<strong>Generated:</strong> ${new Date().toLocaleDateString()}
</div>
<pre>${aiAnalysis.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</pre>
<div class="footer">Generated by SEO Agent GA4 Dashboard · ${new Date().toLocaleDateString()}</div>
</body></html>`;
    const win = window.open("","_blank","width=900,height=700");
    win.document.write(html); win.document.close();
    win.onload = () => setTimeout(() => win.print(), 500);
  }

  const tabStyle = (a, color="#443DCB") => ({
    padding:"6px 14px", borderRadius:20, fontSize:12, cursor:"pointer",
    fontWeight:a?600:400, background:a?color+"22":"transparent",
    color:a?color:txt2, border:`1px solid ${a?color+"44":bdr}`,
    whiteSpace:"nowrap"
  });

  const countryData = ds ? getCountryData(ds) : [];
  const maxCountrySessions = countryData.length ? Math.max(...countryData.map(c=>c.sessions||c.rows),1) : 1;

  return (
    <div style={{ flex:1, overflowY:"auto", padding:24, background:bg }}>
      <div style={{ maxWidth:960, margin:"0 auto" }}>
        <div style={{ fontSize:18, fontWeight:700, color:txt, marginBottom:4 }}>📈 GA4 Analytics Dashboard</div>
        <div style={{ fontSize:13, color:txt2, marginBottom:20 }}>Import GA4 CSV → Country analysis → AI insights → PDF report</div>

        {/* Dataset Switcher */}
        {Object.keys(datasets).length > 0 && (
          <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
            <span style={{ fontSize:11, color:txt2 }}>Datasets:</span>
            {Object.keys(datasets).map(name => (
              <div key={name} style={tabStyle(activeDs===name)}
                onClick={()=>{ setActiveDs(name); setActiveTab("overview"); setAiAnalysis(""); }}>
                📊 {name} <span style={{ opacity:0.6, fontSize:10 }}>({datasets[name].rows.length})</span>
              </div>
            ))}
            <div style={tabStyle(false)} onClick={()=>setActiveTab("import")}>+ Add Dataset</div>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" }}>
          <div style={tabStyle(activeTab==="import")}    onClick={()=>setActiveTab("import")}>📥 Import</div>
          {ds && <div style={tabStyle(activeTab==="overview")}  onClick={()=>setActiveTab("overview")}>📊 Overview</div>}
          {ds && countryData.length>0 && <div style={tabStyle(activeTab==="countries","#059669")} onClick={()=>setActiveTab("countries")}>🌍 Countries</div>}
          {ds && <div style={tabStyle(activeTab==="table")}     onClick={()=>setActiveTab("table")}>📋 Table</div>}
          {ds && <div style={tabStyle(activeTab==="ai","#10A37F")} onClick={()=>setActiveTab("ai")}>🤖 AI Analysis</div>}
        </div>

        {/* ── IMPORT TAB ── */}
        {activeTab==="import" && (
          <div>
            <div style={{ background:"#443DCB11", border:"1px solid #443DCB33", borderRadius:10, padding:"12px 16px", marginBottom:16 }}>
              <div style={{ fontSize:12, fontWeight:600, color:"#6B62E8", marginBottom:8 }}>📥 How to export GA4 CSV:</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
                {["Go to analytics.google.com","Reports → choose any report","Click ⬇️ Download → Download CSV","Upload below or paste data"].map((t,i) => (
                  <div key={i} style={{ display:"flex", gap:6 }}>
                    <div style={{ width:18,height:18,borderRadius:"50%",background:"#443DCB",color:"#fff",fontSize:10,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>{i+1}</div>
                    <div style={{ fontSize:11, color:txt2 }}>{t}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop:10, fontSize:11, color:"#6B62E8" }}>
                💡 Export these reports for best analysis: Traffic Acquisition · Pages · Geography · Tech (Device)
              </div>
            </div>

            {/* Drop Zone */}
            <div
              onDrop={handleDrop} onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)}
              onClick={()=>fileRef.current?.click()}
              style={{ border:`2px dashed ${dragOver?"#443DCB":bdr}`, borderRadius:16, padding:"40px 24px", textAlign:"center", cursor:"pointer", background:dragOver?"#443DCB08":bg2, marginBottom:16 }}>
              <div style={{ fontSize:36, marginBottom:10 }}>📂</div>
              <div style={{ fontSize:14, fontWeight:600, color:txt, marginBottom:4 }}>Drop GA4 CSV here</div>
              <div style={{ fontSize:11, color:txt2 }}>Supports Traffic, Geography, Pages, Device reports</div>
              <input ref={fileRef} type="file" accept=".csv" style={{ display:"none" }} onChange={e=>handleFile(e.target.files[0])} />
            </div>

            <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20 }}>
              <div style={{ display:"flex", gap:10, marginBottom:10 }}>
                <input value={dsName} onChange={e=>setDsName(e.target.value)}
                  placeholder="Dataset name (e.g. Jan 2026, Traffic Report)"
                  style={{ flex:1, padding:"9px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none" }} />
              </div>
              <textarea value={csvText} onChange={e=>setCsvText(e.target.value)}
                placeholder={"Paste CSV data here...\nDate,Country,Sessions,Users,New Users\n2026-01-01,India,1234,987,456\n..."}
                rows={7}
                style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:12, outline:"none", resize:"none", fontFamily:"monospace", boxSizing:"border-box", marginBottom:12 }} />
              <button onClick={handlePaste} disabled={!csvText.trim()}
                style={{ padding:"10px 24px", borderRadius:10, border:"none", background:csvText.trim()?"#443DCB":"#333", color:csvText.trim()?"#fff":txt3, fontWeight:600, fontSize:13, cursor:csvText.trim()?"pointer":"not-allowed" }}>
                📊 Import & Analyze
              </button>
            </div>
          </div>
        )}

        {/* ── OVERVIEW TAB ── */}
        {activeTab==="overview" && ds && (
          <div>
            {/* Stats */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20 }}>
              {[
                { label:"Data Rows",   val:ds.rows.length.toLocaleString(),                                              color:"#443DCB" },
                { label:"Sessions",    val:ds.cols.sessions>=0 ? Math.round(sumCol(ds,ds.cols.sessions)).toLocaleString():"—", color:"#0891B2" },
                { label:"Users",       val:ds.cols.users>=0    ? Math.round(sumCol(ds,ds.cols.users)).toLocaleString():"—",    color:"#059669" },
                { label:"Countries",   val:countryData.length > 0 ? countryData.length : ds.cols.country>=0?"See table":"—",   color:"#D97706" },
              ].map(s => (
                <div key={s.label} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:16, textAlign:"center", borderTop:`3px solid ${s.color}` }}>
                  <div style={{ fontSize:20, fontWeight:700, color:s.color, marginBottom:4 }}>{s.val}</div>
                  <div style={{ fontSize:11, color:txt2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Columns */}
            <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:16, marginBottom:16 }}>
              <div style={{ fontSize:12, fontWeight:600, color:txt, marginBottom:8 }}>📋 Detected Columns</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {ds.headers.map((h,i) => {
                  const isDetected = Object.values(ds.cols).includes(i);
                  return <span key={i} style={{ padding:"2px 10px", borderRadius:20, fontSize:11, background:isDetected?"#443DCB22":"transparent", color:isDetected?"#6B62E8":txt2, border:`1px solid ${isDetected?"#443DCB44":bdr}` }}>{h}</span>;
                })}
              </div>
            </div>

            {/* Compare mode */}
            {Object.keys(datasets).length > 1 && (
              <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:16, marginBottom:16 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <input type="checkbox" checked={compareMode} onChange={e=>setCompareMode(e.target.checked)} style={{ cursor:"pointer" }} />
                  <span style={{ fontSize:12, color:txt, fontWeight:500 }}>Compare with another dataset</span>
                  {compareMode && (
                    <select value={compareDs||""} onChange={e=>setCompareDs(e.target.value)}
                      style={{ padding:"5px 10px", borderRadius:8, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:12, cursor:"pointer", outline:"none" }}>
                      <option value="">Select dataset...</option>
                      {Object.keys(datasets).filter(n=>n!==activeDs).map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  )}
                </div>
              </div>
            )}

            {/* AI Analysis Options */}
            <div style={{ background:"#05966911", border:"1px solid #05966933", borderRadius:12, padding:20 }}>
              <div style={{ fontSize:13, fontWeight:600, color:txt, marginBottom:12 }}>🤖 AI Analysis Type</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8, marginBottom:16 }}>
                {[
                  { id:"general",  icon:"📊", label:"General Analysis",          desc:"Full performance overview + insights" },
                  { id:"country",  icon:"🌍", label:"Country/Location Analysis",  desc:"Geographic deep dive + local SEO tips" },
                  { id:"anomaly",  icon:"🔍", label:"Anomaly Detection",          desc:"Find traffic spikes, drops, outliers" },
                  { id:"compare",  icon:"⚔️", label:"Period Comparison",          desc:"Compare two datasets side by side", disabled:!compareMode||!compareDs },
                ].map(opt => (
                  <div key={opt.id} onClick={()=>!opt.disabled&&setAnalysisType(opt.id)}
                    style={{ padding:"12px 14px", borderRadius:10, border:`1px solid ${analysisType===opt.id?"#443DCB44":bdr}`, background:analysisType===opt.id?"#443DCB11":bg3, cursor:opt.disabled?"not-allowed":"pointer", opacity:opt.disabled?0.4:1 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                      <span style={{ fontSize:16 }}>{opt.icon}</span>
                      <span style={{ fontSize:12, fontWeight:600, color:analysisType===opt.id?"#6B62E8":txt }}>{opt.label}</span>
                    </div>
                    <div style={{ fontSize:11, color:txt2 }}>{opt.desc}</div>
                  </div>
                ))}
              </div>
              <button onClick={runAiAnalysis} disabled={aiLoading||(!keys?.groq&&!keys?.gemini)}
                style={{ width:"100%", padding:"11px", borderRadius:10, border:"none", background:aiLoading?"#333":"#059669", color:"#fff", fontWeight:700, fontSize:14, cursor:aiLoading?"not-allowed":"pointer" }}>
                {aiLoading ? "🤖 Analyzing..." : `🚀 Run ${analysisType==="country"?"Country":analysisType==="anomaly"?"Anomaly":analysisType==="compare"?"Comparison":"Full"} Analysis`}
              </button>
              {!keys?.groq && !keys?.gemini && <div style={{ fontSize:11, color:"#D97706", marginTop:8, textAlign:"center" }}>⚠️ Add API key in Settings</div>}
            </div>
          </div>
        )}

        {/* ── COUNTRIES TAB ── */}
        {activeTab==="countries" && ds && (
          <div>
            <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color:txt, marginBottom:16 }}>🌍 Traffic by Country ({countryData.length})</div>
              {countryData.map((c,i) => {
                const pct = Math.round(((c.sessions||c.rows)/maxCountrySessions)*100);
                const flag = COUNTRY_EMOJIS[c.country] || "🌐";
                return (
                  <div key={i} style={{ marginBottom:14 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:12, marginBottom:5 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <span style={{ fontSize:16 }}>{flag}</span>
                        <span style={{ fontWeight:600, color:txt }}>{c.country}</span>
                        <span style={{ fontSize:10, padding:"1px 6px", borderRadius:10, background:"#443DCB22", color:"#6B62E8" }}>#{i+1}</span>
                      </div>
                      <div style={{ display:"flex", gap:12 }}>
                        {c.sessions > 0 && <span style={{ color:"#443DCB", fontWeight:600 }}>{c.sessions.toLocaleString()} sessions</span>}
                        {c.users > 0    && <span style={{ color:txt2 }}>{c.users.toLocaleString()} users</span>}
                        {!c.sessions && <span style={{ color:"#443DCB", fontWeight:600 }}>{c.rows} rows</span>}
                      </div>
                    </div>
                    <div style={{ height:8, borderRadius:4, background:bg3, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${pct}%`, background: i===0?"#443DCB":i===1?"#0891B2":i===2?"#059669":"#6B62E866", borderRadius:4, transition:"width 0.6s" }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Country AI Analysis */}
            <div style={{ background:"#05966911", border:"1px solid #05966933", borderRadius:12, padding:16, textAlign:"center" }}>
              <div style={{ fontSize:13, fontWeight:600, color:txt, marginBottom:6 }}>Get Location-Based Keyword & SEO Strategy</div>
              <div style={{ fontSize:11, color:txt2, marginBottom:12 }}>AI will suggest keywords, content and SEO strategy for each country</div>
              <button onClick={()=>{ setAnalysisType("country"); runAiAnalysis(); }}
                disabled={aiLoading||(!keys?.groq&&!keys?.gemini)}
                style={{ padding:"10px 24px", borderRadius:10, border:"none", background:"#059669", color:"#fff", fontWeight:600, fontSize:13, cursor:"pointer" }}>
                🌍 Run Country Strategy Analysis
              </button>
            </div>
          </div>
        )}

        {/* ── TABLE TAB ── */}
        {activeTab==="table" && ds && (
          <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, overflow:"hidden" }}>
            <div style={{ padding:"12px 16px", borderBottom:`1px solid ${bdr}`, display:"flex", justifyContent:"space-between" }}>
              <div style={{ fontSize:13, fontWeight:600, color:txt }}>{ds.name} — {ds.rows.length} rows</div>
              <div style={{ fontSize:11, color:txt2 }}>Imported: {ds.imported}</div>
            </div>
            <div style={{ overflowX:"auto", maxHeight:500 }}>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead>
                  <tr style={{ background:bg3, position:"sticky", top:0 }}>
                    {ds.headers.map((h,i) => (
                      <th key={i} style={{ textAlign:"left", padding:"10px 12px", fontSize:11, color:txt2, fontWeight:600, borderBottom:`1px solid ${bdr}`, whiteSpace:"nowrap", textTransform:"uppercase", letterSpacing:"0.04em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ds.rows.slice(0,200).map((row,i) => (
                    <tr key={i} style={{ borderBottom:`1px solid ${bdr}22` }}>
                      {ds.headers.map((h,j) => (
                        <td key={j} style={{ padding:"8px 12px", fontSize:12, color:txt, whiteSpace:"nowrap" }}>{row[h]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {ds.rows.length > 200 && <div style={{ padding:"10px 16px", fontSize:11, color:txt3, textAlign:"center" }}>Showing 200 of {ds.rows.length} rows</div>}
            </div>
          </div>
        )}

        {/* ── AI ANALYSIS TAB ── */}
        {activeTab==="ai" && (
          <div>
            {aiAnalysis ? (
              <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:24 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:8 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:txt }}>
                    🤖 {analysisType==="country"?"Country/Location":analysisType==="anomaly"?"Anomaly Detection":analysisType==="compare"?"Period Comparison":"Full"} Analysis
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={()=>navigator.clipboard.writeText(aiAnalysis)} style={{ padding:"5px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:"transparent", color:txt2, fontSize:11, cursor:"pointer" }}>📋 Copy</button>
                    <button onClick={()=>{ const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([aiAnalysis],{type:"text/plain"})); a.download="ga4-analysis.txt"; a.click(); }} style={{ padding:"5px 12px", borderRadius:8, border:"1px solid #059669aa", background:"#05966911", color:"#059669", fontSize:11, cursor:"pointer" }}>⬇️ TXT</button>
                    <button onClick={exportPDF} style={{ padding:"5px 12px", borderRadius:8, border:"none", background:"#443DCB", color:"#fff", fontSize:11, cursor:"pointer", fontWeight:600 }}>📥 PDF</button>
                    <button onClick={runAiAnalysis} disabled={aiLoading} style={{ padding:"5px 12px", borderRadius:8, border:"1px solid #443DCB44", background:"#443DCB11", color:"#6B62E8", fontSize:11, cursor:"pointer" }}>🔄 Re-run</button>
                  </div>
                </div>
                <div style={{ fontSize:13, color:txt, lineHeight:1.9, whiteSpace:"pre-wrap" }}>{aiAnalysis}</div>
              </div>
            ) : (
              <div style={{ textAlign:"center", padding:60, color:txt3 }}>
                <div style={{ fontSize:40, marginBottom:12 }}>🤖</div>
                <div style={{ fontSize:14, color:txt2, marginBottom:16 }}>Run AI Analysis from Overview tab</div>
                <button onClick={()=>setActiveTab("overview")} style={{ padding:"10px 24px", borderRadius:10, border:"none", background:"#443DCB", color:"#fff", fontWeight:600, fontSize:13, cursor:"pointer" }}>Go to Overview →</button>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {!ds && activeTab!=="import" && (
          <div style={{ textAlign:"center", padding:60, color:txt3 }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📂</div>
            <div style={{ fontSize:14, color:txt2 }}>Import a CSV file first</div>
            <button onClick={()=>setActiveTab("import")} style={{ marginTop:12, padding:"8px 20px", borderRadius:10, border:"none", background:"#443DCB", color:"#fff", fontWeight:600, fontSize:13, cursor:"pointer" }}>Import CSV →</button>
          </div>
        )}
      </div>
    </div>
  );
}