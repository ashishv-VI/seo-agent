import { useState } from "react";

export default function GscDashboard({ dark, gscToken }) {
  const [siteUrl, setSiteUrl]     = useState("");
  const [loading, setLoading]     = useState(false);
  const [data, setData]           = useState(null);
  const [error, setError]         = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [days, setDays]           = useState(28);
  const [device, setDevice]       = useState("all");

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const txt3 = dark ? "#444"    : "#bbb";

  async function fetchGSC() {
    if (!siteUrl.trim()) return;
    if (!gscToken) { setError("Google login required — please sign out and login again with Google to use Search Console."); return; }
    setLoading(true); setError(""); setData(null);

    const url       = siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`;
    const endDate   = new Date().toISOString().split("T")[0];
    const startDate = new Date(Date.now() - days*24*60*60*1000).toISOString().split("T")[0];

    const makeBody = (dimensions) => {
      const body = { startDate, endDate, dimensions, rowLimit: 20 };
      if (device !== "all") body.dimensionFilterGroups = [{ filters:[{ dimension:"device", operator:"equals", expression: device }] }];
      return JSON.stringify(body);
    };

    const apiUrl = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(url)}/searchAnalytics/query`;
    const headers = { "Content-Type":"application/json", "Authorization": `Bearer ${gscToken}` };

    try {
      const [queryRes, pageRes, countryRes, deviceRes, dateRes] = await Promise.all([
        fetch(apiUrl, { method:"POST", headers, body: makeBody(["query"]) }).then(r=>r.json()),
        fetch(apiUrl, { method:"POST", headers, body: makeBody(["page"]) }).then(r=>r.json()),
        fetch(apiUrl, { method:"POST", headers, body: makeBody(["country"]) }).then(r=>r.json()),
        fetch(apiUrl, { method:"POST", headers, body: JSON.stringify({ startDate, endDate, dimensions:["device"], rowLimit:10 }) }).then(r=>r.json()),
        fetch(apiUrl, { method:"POST", headers, body: makeBody(["date"]) }).then(r=>r.json()),
      ]);

      if (queryRes.error) {
        setError(queryRes.error.message || "GSC API Error — make sure site is verified in Search Console");
        setLoading(false); return;
      }

      const rows = queryRes.rows || [];
      const totalClicks      = rows.reduce((a,r)=>a+r.clicks, 0);
      const totalImpressions = rows.reduce((a,r)=>a+r.impressions, 0);
      const avgCTR           = rows.length ? (rows.reduce((a,r)=>a+r.ctr,0)/rows.length*100).toFixed(1) : 0;
      const avgPosition      = rows.length ? (rows.reduce((a,r)=>a+r.position,0)/rows.length).toFixed(1) : 0;

      setData({
        queries:   queryRes.rows||[],
        pages:     pageRes.rows||[],
        countries: countryRes.rows||[],
        devices:   deviceRes.rows||[],
        dates:     dateRes.rows||[],
        totalClicks, totalImpressions, avgCTR, avgPosition,
        startDate, endDate
      });
    } catch(e) { setError("Error: "+e.message); }
    setLoading(false);
  }

  function exportCSV(rows, filename) {
    if (!rows?.length) return;
    const keys = Object.keys(rows[0]);
    const csv = [
      keys.join(","),
      ...rows.map(r => keys.map(k => {
        const v = Array.isArray(r[k]) ? r[k].join("|") : r[k];
        return `"${String(v).replace(/"/g,'""')}"`;
      }).join(","))
    ].join("\n");
    const blob = new Blob([csv], { type:"text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename; a.click();
  }

  function exportAllCSV() {
    if (!data) return;
    const rows = data.queries.map(r => ({
      keyword: r.keys[0], clicks: r.clicks,
      impressions: r.impressions,
      ctr: (r.ctr*100).toFixed(2)+"%",
      position: r.position.toFixed(1)
    }));
    exportCSV(rows, `gsc-keywords-${data.startDate}.csv`);
  }

  const tabs = ["overview","queries","pages","countries","devices"];

  const s = {
    wrap:   { flex:1, overflowY:"auto", padding:24, background:bg },
    card:   { background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:"16px 20px", marginBottom:16 },
    statGrid: { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20 },
    stat:   (color) => ({ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:16, textAlign:"center", borderTop:`3px solid ${color}` }),
    statNum:{ fontSize:24, fontWeight:700, color:txt, marginBottom:4 },
    statLbl:{ fontSize:11, color:txt2 },
    tabRow: { display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" },
    tab:    (a) => ({ padding:"6px 16px", borderRadius:20, fontSize:12, cursor:"pointer", fontWeight:a?600:400, background:a?"#443DCB22":"transparent", color:a?"#6B62E8":txt2, border:`1px solid ${a?"#443DCB44":bdr}` }),
    table:  { width:"100%", borderCollapse:"collapse" },
    th:     { textAlign:"left", padding:"8px 12px", fontSize:11, color:txt2, fontWeight:500, borderBottom:`1px solid ${bdr}`, textTransform:"uppercase", letterSpacing:"0.05em" },
    td:     { padding:"10px 12px", fontSize:12, color:txt, borderBottom:`1px solid ${bdr}33` },
    inp:    { flex:1, padding:"10px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", fontFamily:"inherit" },
    btn:    (ok,color="#443DCB") => ({ padding:"10px 20px", borderRadius:10, border:"none", background:ok?color:bdr, color:ok?"#fff":txt3, fontWeight:600, fontSize:13, cursor:ok?"pointer":"not-allowed" }),
    sel:    { padding:"8px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:12, cursor:"pointer", outline:"none" },
    bar:    { height:4, borderRadius:2, background:"#443DCB33", marginTop:4, overflow:"hidden" },
    barFill:(pct) => ({ height:"100%", width:`${Math.min(pct,100)}%`, background:"#443DCB", borderRadius:2 }),
  };

  const maxClicks = data?.queries?.length ? Math.max(...data.queries.map(r=>r.clicks),1) : 1;
  const posColor  = p => p<=3?"#059669":p<=10?"#D97706":"#DC2626";
  const ctrColor  = c => c>0.05?"#059669":"#D97706";

  return (
    <div style={s.wrap}>
      <div style={{ fontSize:18, fontWeight:700, color:txt, marginBottom:4 }}>📊 Search Console Dashboard</div>
      <div style={{ fontSize:13, color:txt2, marginBottom:20 }}>Real GSC data — live from Google Search Console</div>

      {/* Input + Filters */}
      <div style={s.card}>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:10 }}>
          <input value={siteUrl} onChange={e=>setSiteUrl(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&fetchGSC()}
            placeholder="https://yourdomain.com" style={s.inp} />
          <select value={days} onChange={e=>setDays(Number(e.target.value))} style={s.sel}>
            <option value={7}>Last 7 days</option>
            <option value={28}>Last 28 days</option>
            <option value={90}>Last 90 days</option>
            <option value={180}>Last 6 months</option>
          </select>
          <select value={device} onChange={e=>setDevice(e.target.value)} style={s.sel}>
            <option value="all">All Devices</option>
            <option value="mobile">Mobile</option>
            <option value="desktop">Desktop</option>
            <option value="tablet">Tablet</option>
          </select>
          <button onClick={fetchGSC} disabled={loading||!siteUrl.trim()} style={s.btn(!loading&&!!siteUrl.trim())}>
            {loading ? "Loading..." : "Fetch Data"}
          </button>
        </div>
        {error && <div style={{ fontSize:12, color:"#DC2626", padding:"8px 12px", background:"#DC262611", borderRadius:8 }}>{error}</div>}
        <div style={{ fontSize:11, color:txt3 }}>⚠️ Site must be verified in Google Search Console · GSC API must be enabled</div>
      </div>

      {data && (
        <>
          {/* Stats */}
          <div style={s.statGrid}>
            {[
              { label:"Total Clicks", val:data.totalClicks.toLocaleString(), color:"#443DCB" },
              { label:"Impressions",  val:data.totalImpressions.toLocaleString(), color:"#0891B2" },
              { label:"Avg CTR",      val:data.avgCTR+"%", color:"#059669" },
              { label:"Avg Position", val:"#"+data.avgPosition, color:"#D97706" },
            ].map(s2 => (
              <div key={s2.label} style={s.stat(s2.color)}>
                <div style={s.statNum}>{s2.val}</div>
                <div style={s.statLbl}>{s2.label}</div>
              </div>
            ))}
          </div>

          {/* Date + Export */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <div style={{ fontSize:12, color:txt2 }}>📅 {data.startDate} → {data.endDate} · {device==="all"?"All devices":device}</div>
            <button onClick={exportAllCSV} style={{ padding:"6px 14px", borderRadius:8, border:`1px solid #059669aa`, background:"#05966911", color:"#059669", fontSize:12, cursor:"pointer", fontWeight:600 }}>
              ⬇️ Export CSV
            </button>
          </div>

          {/* Tabs */}
          <div style={s.tabRow}>
            {tabs.map(t => <div key={t} style={s.tab(activeTab===t)} onClick={()=>setActiveTab(t)}>{t.charAt(0).toUpperCase()+t.slice(1)}</div>)}
          </div>

          {/* Overview */}
          {activeTab==="overview" && (
            <div style={s.card}>
              <div style={{ fontSize:13, fontWeight:600, color:txt, marginBottom:16 }}>Performance Overview</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                <div>
                  <div style={{ fontSize:12, color:txt2, marginBottom:8, fontWeight:600 }}>🔍 Top Keywords</div>
                  {data.queries.slice(0,8).map((r,i) => (
                    <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:`1px solid ${bdr}33`, fontSize:12 }}>
                      <span style={{ color:txt, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:"65%" }}>{r.keys[0]}</span>
                      <div style={{ display:"flex", gap:8, flexShrink:0 }}>
                        <span style={{ color:"#443DCB", fontWeight:600 }}>{r.clicks}</span>
                        <span style={{ color:posColor(r.position), fontSize:11 }}>#{r.position.toFixed(0)}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize:12, color:txt2, marginBottom:8, fontWeight:600 }}>📄 Top Pages</div>
                  {data.pages.slice(0,8).map((r,i) => (
                    <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:`1px solid ${bdr}33`, fontSize:12 }}>
                      <span style={{ color:txt, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:"65%" }}>{r.keys[0].replace(/^https?:\/\/[^/]+/,"")||"/"}</span>
                      <span style={{ color:"#0891B2", fontWeight:600, flexShrink:0 }}>{r.clicks} clicks</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Queries */}
          {activeTab==="queries" && (
            <div style={s.card}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                <div style={{ fontSize:13, fontWeight:600, color:txt }}>Top Keywords (20)</div>
                <button onClick={exportAllCSV} style={{ padding:"4px 12px", borderRadius:6, border:`1px solid #059669aa`, background:"#05966911", color:"#059669", fontSize:11, cursor:"pointer" }}>⬇️ CSV</button>
              </div>
              <table style={s.table}>
                <thead><tr>
                  {["Keyword","Clicks","Impressions","CTR","Position"].map(h=><th key={h} style={s.th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {data.queries.map((r,i) => (
                    <tr key={i}>
                      <td style={s.td}>
                        <div style={{ fontWeight:500 }}>{r.keys[0]}</div>
                        <div style={s.bar}><div style={s.barFill((r.clicks/maxClicks)*100)} /></div>
                      </td>
                      <td style={{ ...s.td, color:"#443DCB", fontWeight:600 }}>{r.clicks}</td>
                      <td style={s.td}>{r.impressions.toLocaleString()}</td>
                      <td style={{ ...s.td, color:ctrColor(r.ctr) }}>{(r.ctr*100).toFixed(1)}%</td>
                      <td style={{ ...s.td, color:posColor(r.position), fontWeight:600 }}>#{r.position.toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pages */}
          {activeTab==="pages" && (
            <div style={s.card}>
              <div style={{ fontSize:13, fontWeight:600, color:txt, marginBottom:12 }}>Top Pages (20)</div>
              <table style={s.table}>
                <thead><tr>
                  {["Page","Clicks","Impressions","CTR","Position"].map(h=><th key={h} style={s.th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {data.pages.map((r,i) => (
                    <tr key={i}>
                      <td style={s.td}>
                        <div style={{ fontSize:11, color:txt2, maxWidth:320, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          {r.keys[0].replace(/^https?:\/\/[^/]+/,"")||"/"}
                        </div>
                      </td>
                      <td style={{ ...s.td, color:"#443DCB", fontWeight:600 }}>{r.clicks}</td>
                      <td style={s.td}>{r.impressions.toLocaleString()}</td>
                      <td style={{ ...s.td, color:ctrColor(r.ctr) }}>{(r.ctr*100).toFixed(1)}%</td>
                      <td style={{ ...s.td, color:posColor(r.position), fontWeight:600 }}>#{r.position.toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Countries */}
          {activeTab==="countries" && (
            <div style={s.card}>
              <div style={{ fontSize:13, fontWeight:600, color:txt, marginBottom:12 }}>Top Countries</div>
              <table style={s.table}>
                <thead><tr>
                  {["Country","Clicks","Impressions","CTR","Position"].map(h=><th key={h} style={s.th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {data.countries.map((r,i) => (
                    <tr key={i}>
                      <td style={{ ...s.td, fontWeight:500, textTransform:"uppercase" }}>{r.keys[0]}</td>
                      <td style={{ ...s.td, color:"#443DCB", fontWeight:600 }}>{r.clicks}</td>
                      <td style={s.td}>{r.impressions.toLocaleString()}</td>
                      <td style={{ ...s.td, color:ctrColor(r.ctr) }}>{(r.ctr*100).toFixed(1)}%</td>
                      <td style={{ ...s.td, color:posColor(r.position), fontWeight:600 }}>#{r.position.toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Devices */}
          {activeTab==="devices" && (
            <div style={s.card}>
              <div style={{ fontSize:13, fontWeight:600, color:txt, marginBottom:12 }}>Device Breakdown</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
                {data.devices.map((r,i) => {
                  const icons = { mobile:"📱", desktop:"🖥️", tablet:"📟" };
                  const colors = { mobile:"#443DCB", desktop:"#0891B2", tablet:"#059669" };
                  const dev = r.keys[0];
                  return (
                    <div key={i} style={{ background:bg3, border:`1px solid ${bdr}`, borderRadius:10, padding:16, textAlign:"center" }}>
                      <div style={{ fontSize:28, marginBottom:8 }}>{icons[dev]||"📱"}</div>
                      <div style={{ fontSize:13, fontWeight:600, color:txt, textTransform:"capitalize", marginBottom:12 }}>{dev}</div>
                      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", fontSize:12 }}>
                          <span style={{ color:txt2 }}>Clicks</span>
                          <span style={{ color:colors[dev]||"#443DCB", fontWeight:600 }}>{r.clicks}</span>
                        </div>
                        <div style={{ display:"flex", justifyContent:"space-between", fontSize:12 }}>
                          <span style={{ color:txt2 }}>Impressions</span>
                          <span style={{ color:txt, fontWeight:600 }}>{r.impressions.toLocaleString()}</span>
                        </div>
                        <div style={{ display:"flex", justifyContent:"space-between", fontSize:12 }}>
                          <span style={{ color:txt2 }}>CTR</span>
                          <span style={{ color:ctrColor(r.ctr) }}>{(r.ctr*100).toFixed(1)}%</span>
                        </div>
                        <div style={{ display:"flex", justifyContent:"space-between", fontSize:12 }}>
                          <span style={{ color:txt2 }}>Position</span>
                          <span style={{ color:posColor(r.position), fontWeight:600 }}>#{r.position.toFixed(0)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {!data && !loading && !error && (
        <div style={{ textAlign:"center", padding:60, color:txt3 }}>
          <div style={{ fontSize:40, marginBottom:12 }}>📊</div>
          <div style={{ fontSize:15, color:txt2, marginBottom:8 }}>Enter your site URL above to fetch real GSC data</div>
          <div style={{ fontSize:12, color:txt3 }}>Clicks · Impressions · CTR · Position · Device breakdown · CSV export</div>
        </div>
      )}
    </div>
  );
}