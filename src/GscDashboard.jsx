import { useState } from "react";

export default function GscDashboard({ dark, googleKey }) {
  const [siteUrl, setSiteUrl]     = useState("");
  const [loading, setLoading]     = useState(false);
  const [data, setData]           = useState(null);
  const [error, setError]         = useState("");
  const [activeTab, setActiveTab] = useState("overview");

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const txt3 = dark ? "#444"    : "#bbb";

  async function fetchGSC() {
    if (!siteUrl.trim()) return;
    if (!googleKey) { setError("Google API Key needed — add in Settings!"); return; }
    setLoading(true); setError(""); setData(null);

    const url = siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`;
    const endDate   = new Date().toISOString().split("T")[0];
    const startDate = new Date(Date.now() - 28*24*60*60*1000).toISOString().split("T")[0];

    try {
      const [queryRes, pageRes, countryRes] = await Promise.all([
        fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(url)}/searchAnalytics/query?key=${googleKey}`, {
          method:"POST", headers:{ "Content-Type":"application/json" },
          body: JSON.stringify({ startDate, endDate, dimensions:["query"], rowLimit:10 })
        }).then(r=>r.json()),
        fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(url)}/searchAnalytics/query?key=${googleKey}`, {
          method:"POST", headers:{ "Content-Type":"application/json" },
          body: JSON.stringify({ startDate, endDate, dimensions:["page"], rowLimit:10 })
        }).then(r=>r.json()),
        fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(url)}/searchAnalytics/query?key=${googleKey}`, {
          method:"POST", headers:{ "Content-Type":"application/json" },
          body: JSON.stringify({ startDate, endDate, dimensions:["country"], rowLimit:5 })
        }).then(r=>r.json()),
      ]);

      if (queryRes.error) { setError(queryRes.error.message || "GSC API Error — make sure site is verified in Search Console"); setLoading(false); return; }

      const totalClicks      = queryRes.rows?.reduce((a,r)=>a+r.clicks,0) || 0;
      const totalImpressions = queryRes.rows?.reduce((a,r)=>a+r.impressions,0) || 0;
      const avgCTR           = queryRes.rows?.length ? (queryRes.rows.reduce((a,r)=>a+r.ctr,0)/queryRes.rows.length*100).toFixed(1) : 0;
      const avgPosition      = queryRes.rows?.length ? (queryRes.rows.reduce((a,r)=>a+r.position,0)/queryRes.rows.length).toFixed(1) : 0;

      setData({ queries: queryRes.rows||[], pages: pageRes.rows||[], countries: countryRes.rows||[], totalClicks, totalImpressions, avgCTR, avgPosition, startDate, endDate });
    } catch(e) { setError("Error: "+e.message); }
    setLoading(false);
  }

  const tabs = ["overview","queries","pages","countries"];

  const s = {
    wrap:   { flex:1, overflowY:"auto", padding:24, background:bg },
    card:   { background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:"16px 20px", marginBottom:16 },
    statGrid: { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20 },
    stat:   (color) => ({ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:16, textAlign:"center", borderTop:`3px solid ${color}` }),
    statNum:{ fontSize:24, fontWeight:700, color:txt, marginBottom:4 },
    statLbl:{ fontSize:11, color:txt2 },
    tabRow: { display:"flex", gap:8, marginBottom:16 },
    tab:    (a) => ({ padding:"6px 16px", borderRadius:20, fontSize:12, cursor:"pointer", fontWeight:a?600:400, background:a?"#7C3AED22":"transparent", color:a?"#A78BFA":txt2, border:`1px solid ${a?"#7C3AED44":bdr}` }),
    table:  { width:"100%", borderCollapse:"collapse" },
    th:     { textAlign:"left", padding:"8px 12px", fontSize:11, color:txt2, fontWeight:500, borderBottom:`1px solid ${bdr}`, textTransform:"uppercase", letterSpacing:"0.05em" },
    td:     { padding:"10px 12px", fontSize:12, color:txt, borderBottom:`1px solid ${bdr}33` },
    bar:    (pct, color) => ({ height:4, borderRadius:2, background:`${color}33`, position:"relative", overflow:"hidden", marginTop:4 }),
    barFill:(pct, color) => ({ height:"100%", width:`${Math.min(pct,100)}%`, background:color, borderRadius:2 }),
    inp:    { flex:1, padding:"10px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", fontFamily:"inherit" },
    btn:    (ok) => ({ padding:"10px 20px", borderRadius:10, border:"none", background:ok?"#7C3AED":bdr, color:ok?"#fff":txt3, fontWeight:600, fontSize:13, cursor:ok?"pointer":"not-allowed" }),
  };

  const maxClicks = data?.queries?.length ? Math.max(...data.queries.map(r=>r.clicks)) : 1;

  return (
    <div style={s.wrap}>
      <div style={{ fontSize:18, fontWeight:700, color:txt, marginBottom:4 }}>📊 Search Console Dashboard</div>
      <div style={{ fontSize:13, color:txt2, marginBottom:20 }}>Real GSC data — last 28 days</div>

      {/* Input */}
      <div style={s.card}>
        <div style={{ fontSize:12, color:txt2, marginBottom:8 }}>Enter your verified site URL:</div>
        <div style={{ display:"flex", gap:10 }}>
          <input value={siteUrl} onChange={e=>setSiteUrl(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&fetchGSC()}
            placeholder="https://yourdomain.com" style={s.inp} />
          <button onClick={fetchGSC} disabled={loading||!siteUrl.trim()} style={s.btn(!loading&&!!siteUrl.trim())}>
            {loading ? "Loading..." : "Fetch Data"}
          </button>
        </div>
        {error && <div style={{ fontSize:12, color:"#DC2626", marginTop:8, padding:"8px 12px", background:"#DC262611", borderRadius:8 }}>{error}</div>}
        <div style={{ fontSize:11, color:txt3, marginTop:8 }}>
          ⚠️ Site must be verified in Google Search Console + GSC API must be enabled in Google Cloud Console
        </div>
      </div>

      {data && (
        <>
          {/* Stats */}
          <div style={s.statGrid}>
            <div style={s.stat("#7C3AED")}>
              <div style={s.statNum}>{data.totalClicks.toLocaleString()}</div>
              <div style={s.statLbl}>Total Clicks</div>
            </div>
            <div style={s.stat("#0891B2")}>
              <div style={s.statNum}>{data.totalImpressions.toLocaleString()}</div>
              <div style={s.statLbl}>Impressions</div>
            </div>
            <div style={s.stat("#059669")}>
              <div style={s.statNum}>{data.avgCTR}%</div>
              <div style={s.statLbl}>Avg CTR</div>
            </div>
            <div style={s.stat("#D97706")}>
              <div style={s.statNum}>#{data.avgPosition}</div>
              <div style={s.statLbl}>Avg Position</div>
            </div>
          </div>

          <div style={{ fontSize:12, color:txt2, marginBottom:16 }}>
            📅 Data: {data.startDate} → {data.endDate}
          </div>

          {/* Tabs */}
          <div style={s.tabRow}>
            {tabs.map(t => <div key={t} style={s.tab(activeTab===t)} onClick={()=>setActiveTab(t)}>{t.charAt(0).toUpperCase()+t.slice(1)}</div>)}
          </div>

          {/* Queries */}
          {activeTab==="queries" && (
            <div style={s.card}>
              <div style={{ fontSize:13, fontWeight:600, color:txt, marginBottom:12 }}>Top 10 Keywords</div>
              <table style={s.table}>
                <thead><tr>
                  <th style={s.th}>Keyword</th>
                  <th style={s.th}>Clicks</th>
                  <th style={s.th}>Impressions</th>
                  <th style={s.th}>CTR</th>
                  <th style={s.th}>Position</th>
                </tr></thead>
                <tbody>
                  {data.queries.map((r,i) => (
                    <tr key={i}>
                      <td style={s.td}>
                        <div style={{ fontWeight:500 }}>{r.keys[0]}</div>
                        <div style={s.bar((r.clicks/maxClicks)*100,"#7C3AED")}>
                          <div style={s.barFill((r.clicks/maxClicks)*100,"#7C3AED")} />
                        </div>
                      </td>
                      <td style={{ ...s.td, color:"#7C3AED", fontWeight:600 }}>{r.clicks}</td>
                      <td style={s.td}>{r.impressions.toLocaleString()}</td>
                      <td style={{ ...s.td, color: r.ctr>0.05?"#059669":"#D97706" }}>{(r.ctr*100).toFixed(1)}%</td>
                      <td style={{ ...s.td, color: r.position<=3?"#059669":r.position<=10?"#D97706":"#DC2626", fontWeight:600 }}>#{r.position.toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pages */}
          {activeTab==="pages" && (
            <div style={s.card}>
              <div style={{ fontSize:13, fontWeight:600, color:txt, marginBottom:12 }}>Top 10 Pages</div>
              <table style={s.table}>
                <thead><tr>
                  <th style={s.th}>Page</th>
                  <th style={s.th}>Clicks</th>
                  <th style={s.th}>Impressions</th>
                  <th style={s.th}>CTR</th>
                  <th style={s.th}>Position</th>
                </tr></thead>
                <tbody>
                  {data.pages.map((r,i) => (
                    <tr key={i}>
                      <td style={s.td}>
                        <div style={{ fontSize:11, color:txt2, maxWidth:300, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          {r.keys[0].replace(/^https?:\/\/[^/]+/,"")||"/"}
                        </div>
                      </td>
                      <td style={{ ...s.td, color:"#7C3AED", fontWeight:600 }}>{r.clicks}</td>
                      <td style={s.td}>{r.impressions.toLocaleString()}</td>
                      <td style={{ ...s.td, color: r.ctr>0.05?"#059669":"#D97706" }}>{(r.ctr*100).toFixed(1)}%</td>
                      <td style={{ ...s.td, color: r.position<=3?"#059669":r.position<=10?"#D97706":"#DC2626", fontWeight:600 }}>#{r.position.toFixed(0)}</td>
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
                  <th style={s.th}>Country</th>
                  <th style={s.th}>Clicks</th>
                  <th style={s.th}>Impressions</th>
                  <th style={s.th}>CTR</th>
                </tr></thead>
                <tbody>
                  {data.countries.map((r,i) => (
                    <tr key={i}>
                      <td style={{ ...s.td, fontWeight:500, textTransform:"uppercase" }}>{r.keys[0]}</td>
                      <td style={{ ...s.td, color:"#7C3AED", fontWeight:600 }}>{r.clicks}</td>
                      <td style={s.td}>{r.impressions.toLocaleString()}</td>
                      <td style={s.td}>{(r.ctr*100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Overview */}
          {activeTab==="overview" && (
            <div style={s.card}>
              <div style={{ fontSize:13, fontWeight:600, color:txt, marginBottom:12 }}>Performance Overview</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                <div>
                  <div style={{ fontSize:12, color:txt2, marginBottom:8 }}>🔍 Top Keywords</div>
                  {data.queries.slice(0,5).map((r,i) => (
                    <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:`1px solid ${bdr}33`, fontSize:12 }}>
                      <span style={{ color:txt, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:"70%" }}>{r.keys[0]}</span>
                      <span style={{ color:"#7C3AED", fontWeight:600, flexShrink:0 }}>{r.clicks} clicks</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize:12, color:txt2, marginBottom:8 }}>📄 Top Pages</div>
                  {data.pages.slice(0,5).map((r,i) => (
                    <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:`1px solid ${bdr}33`, fontSize:12 }}>
                      <span style={{ color:txt, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:"70%" }}>{r.keys[0].replace(/^https?:\/\/[^/]+/,"")||"/"}</span>
                      <span style={{ color:"#0891B2", fontWeight:600, flexShrink:0 }}>{r.clicks} clicks</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {!data && !loading && !error && (
        <div style={{ textAlign:"center", padding:60, color:txt3 }}>
          <div style={{ fontSize:40, marginBottom:12 }}>📊</div>
          <div style={{ fontSize:15, color:txt2, marginBottom:8 }}>Enter your site URL above to fetch GSC data</div>
          <div style={{ fontSize:12, color:txt3 }}>Shows last 28 days of search performance data</div>
        </div>
      )}
    </div>
  );
}