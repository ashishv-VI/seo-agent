import { useState } from "react";

export default function GA4Dashboard({ dark, googleKey }) {
  const [propertyId, setPropertyId] = useState("");
  const [loading, setLoading]       = useState(false);
  const [data, setData]             = useState(null);
  const [error, setError]           = useState("");
  const [activeTab, setActiveTab]   = useState("overview");
  const [days, setDays]             = useState(28);

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const txt3 = dark ? "#444"    : "#bbb";

  async function fetchGA4() {
    if (!propertyId.trim()) return;
    if (!googleKey) { setError("Google API Key needed — add in Settings!"); return; }
    setLoading(true); setError(""); setData(null);

    const endDate   = "today";
    const startDate = `${days}daysAgo`;
    const pid       = propertyId.replace("properties/","");
    const url       = `https://analyticsdata.googleapis.com/v1beta/properties/${pid}:runReport?key=${googleKey}`;
    const headers   = { "Content-Type":"application/json" };

    try {
      const [overviewRes, pagesRes, sourcesRes, devicesRes, countriesRes] = await Promise.all([
        // Overview metrics
        fetch(url, { method:"POST", headers, body: JSON.stringify({
          dateRanges:[{ startDate, endDate }],
          metrics:[
            { name:"sessions" }, { name:"totalUsers" }, { name:"newUsers" },
            { name:"bounceRate" }, { name:"averageSessionDuration" }, { name:"screenPageViews" }
          ]
        })}).then(r=>r.json()),

        // Top pages
        fetch(url, { method:"POST", headers, body: JSON.stringify({
          dateRanges:[{ startDate, endDate }],
          dimensions:[{ name:"pagePath" }],
          metrics:[{ name:"screenPageViews" },{ name:"sessions" },{ name:"bounceRate" }],
          orderBys:[{ metric:{ metricName:"screenPageViews" }, desc:true }],
          limit: 10
        })}).then(r=>r.json()),

        // Traffic sources
        fetch(url, { method:"POST", headers, body: JSON.stringify({
          dateRanges:[{ startDate, endDate }],
          dimensions:[{ name:"sessionDefaultChannelGroup" }],
          metrics:[{ name:"sessions" },{ name:"totalUsers" },{ name:"bounceRate" }],
          orderBys:[{ metric:{ metricName:"sessions" }, desc:true }],
          limit: 8
        })}).then(r=>r.json()),

        // Devices
        fetch(url, { method:"POST", headers, body: JSON.stringify({
          dateRanges:[{ startDate, endDate }],
          dimensions:[{ name:"deviceCategory" }],
          metrics:[{ name:"sessions" },{ name:"totalUsers" }],
          limit: 5
        })}).then(r=>r.json()),

        // Countries
        fetch(url, { method:"POST", headers, body: JSON.stringify({
          dateRanges:[{ startDate, endDate }],
          dimensions:[{ name:"country" }],
          metrics:[{ name:"sessions" },{ name:"totalUsers" }],
          orderBys:[{ metric:{ metricName:"sessions" }, desc:true }],
          limit: 8
        })}).then(r=>r.json()),
      ]);

      if (overviewRes.error) {
        setError(overviewRes.error.message || "GA4 API Error — check property ID and API key");
        setLoading(false); return;
      }

      const getMetric = (res, idx) => res.rows?.[0]?.metricValues?.[idx]?.value || "0";

      const sessions  = parseInt(getMetric(overviewRes, 0));
      const users     = parseInt(getMetric(overviewRes, 1));
      const newUsers  = parseInt(getMetric(overviewRes, 2));
      const bounce    = (parseFloat(getMetric(overviewRes, 3))*100).toFixed(1);
      const avgDur    = parseInt(getMetric(overviewRes, 4));
      const pageviews = parseInt(getMetric(overviewRes, 5));

      const fmt = s => {
        const m = Math.floor(s/60), sec = s%60;
        return `${m}m ${sec}s`;
      };

      const parsePages = (res) => res.rows?.map(r => ({
        page: r.dimensionValues[0].value,
        views: parseInt(r.metricValues[0].value),
        sessions: parseInt(r.metricValues[1].value),
        bounce: (parseFloat(r.metricValues[2].value)*100).toFixed(1),
      })) || [];

      const parseSources = (res) => res.rows?.map(r => ({
        channel: r.dimensionValues[0].value,
        sessions: parseInt(r.metricValues[0].value),
        users: parseInt(r.metricValues[1].value),
        bounce: (parseFloat(r.metricValues[2].value)*100).toFixed(1),
      })) || [];

      const parseDevices = (res) => res.rows?.map(r => ({
        device: r.dimensionValues[0].value,
        sessions: parseInt(r.metricValues[0].value),
        users: parseInt(r.metricValues[1].value),
      })) || [];

      const parseCountries = (res) => res.rows?.map(r => ({
        country: r.dimensionValues[0].value,
        sessions: parseInt(r.metricValues[0].value),
        users: parseInt(r.metricValues[1].value),
      })) || [];

      setData({
        sessions, users, newUsers, bounce,
        avgDur: fmt(avgDur), pageviews,
        pages:     parsePages(pagesRes),
        sources:   parseSources(sourcesRes),
        devices:   parseDevices(devicesRes),
        countries: parseCountries(countriesRes),
      });

    } catch(e) { setError("Error: " + e.message); }
    setLoading(false);
  }

  function exportCSV(rows, filename) {
    if (!rows?.length) return;
    const keys = Object.keys(rows[0]);
    const csv = [keys.join(","), ...rows.map(r => keys.map(k=>`"${r[k]}"`).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    a.download = filename; a.click();
  }

  const s = {
    wrap:  { flex:1, overflowY:"auto", padding:24, background:bg },
    card:  { background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:"16px 20px", marginBottom:16 },
    grid4: { display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:16 },
    grid6: { display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:20 },
    stat:  (color) => ({ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:16, textAlign:"center", borderTop:`3px solid ${color}` }),
    statN: { fontSize:22, fontWeight:700, color:txt, marginBottom:4 },
    statL: { fontSize:11, color:txt2 },
    tabRow:{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" },
    tab:   (a) => ({ padding:"6px 16px", borderRadius:20, fontSize:12, cursor:"pointer", fontWeight:a?600:400, background:a?"#7C3AED22":"transparent", color:a?"#A78BFA":txt2, border:`1px solid ${a?"#7C3AED44":bdr}` }),
    table: { width:"100%", borderCollapse:"collapse" },
    th:    { textAlign:"left", padding:"8px 12px", fontSize:11, color:txt2, fontWeight:500, borderBottom:`1px solid ${bdr}`, textTransform:"uppercase", letterSpacing:"0.05em" },
    td:    { padding:"10px 12px", fontSize:12, color:txt, borderBottom:`1px solid ${bdr}33` },
    inp:   { flex:1, padding:"10px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", fontFamily:"inherit" },
    btn:   (ok) => ({ padding:"10px 20px", borderRadius:10, border:"none", background:ok?"#7C3AED":bdr, color:ok?"#fff":txt3, fontWeight:600, fontSize:13, cursor:ok?"pointer":"not-allowed" }),
    sel:   { padding:"8px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:12, outline:"none", cursor:"pointer" },
  };

  const channelColors = {
    "Organic Search":"#7C3AED", "Direct":"#0891B2", "Referral":"#059669",
    "Organic Social":"#D97706", "Email":"#DC2626", "Paid Search":"#9333EA",
    "Paid Social":"#0369A1", "Display":"#B45309",
  };

  const maxSessions = data?.sources?.length ? Math.max(...data.sources.map(r=>r.sessions),1) : 1;
  const maxViews    = data?.pages?.length   ? Math.max(...data.pages.map(r=>r.views),1)    : 1;

  return (
    <div style={s.wrap}>
      <div style={{ fontSize:18, fontWeight:700, color:txt, marginBottom:4 }}>📈 GA4 Traffic Dashboard</div>
      <div style={{ fontSize:13, color:txt2, marginBottom:20 }}>Real Google Analytics 4 data — sessions, users, conversions</div>

      {/* Input */}
      <div style={s.card}>
        <div style={{ fontSize:12, color:txt2, marginBottom:8 }}>Enter your GA4 Property ID:</div>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          <input value={propertyId} onChange={e=>setPropertyId(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&fetchGA4()}
            placeholder="123456789 (numbers only)" style={s.inp} />
          <select value={days} onChange={e=>setDays(Number(e.target.value))} style={s.sel}>
            <option value={7}>Last 7 days</option>
            <option value={28}>Last 28 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button onClick={fetchGA4} disabled={loading||!propertyId.trim()} style={s.btn(!loading&&!!propertyId.trim())}>
            {loading ? "Loading..." : "Fetch Data"}
          </button>
        </div>
        {error && <div style={{ fontSize:12, color:"#DC2626", marginTop:8, padding:"8px 12px", background:"#DC262611", borderRadius:8 }}>{error}</div>}
        <div style={{ fontSize:11, color:txt3, marginTop:8 }}>
          📍 Find Property ID: GA4 → Admin → Property Settings · Google Analytics Data API must be enabled
        </div>
      </div>

      {data && (
        <>
          {/* Stats Grid */}
          <div style={s.grid6}>
            {[
              { label:"Sessions",    val:data.sessions.toLocaleString(),  color:"#7C3AED" },
              { label:"Total Users", val:data.users.toLocaleString(),     color:"#0891B2" },
              { label:"New Users",   val:data.newUsers.toLocaleString(),  color:"#059669" },
              { label:"Pageviews",   val:data.pageviews.toLocaleString(), color:"#9333EA" },
              { label:"Bounce Rate", val:data.bounce+"%",                 color:"#D97706" },
              { label:"Avg Duration",val:data.avgDur,                     color:"#DC2626" },
            ].map(s2 => (
              <div key={s2.label} style={s.stat(s2.color)}>
                <div style={s.statN}>{s2.val}</div>
                <div style={s.statL}>{s2.label}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={s.tabRow}>
            {["overview","pages","sources","devices","countries"].map(t => (
              <div key={t} style={s.tab(activeTab===t)} onClick={()=>setActiveTab(t)}>
                {t.charAt(0).toUpperCase()+t.slice(1)}
              </div>
            ))}
          </div>

          {/* Overview */}
          {activeTab==="overview" && (
            <div style={s.card}>
              <div style={{ fontSize:13, fontWeight:600, color:txt, marginBottom:16 }}>Traffic Sources Overview</div>
              {data.sources.map((r,i) => {
                const color = channelColors[r.channel] || "#7C3AED";
                const pct   = (r.sessions/maxSessions)*100;
                return (
                  <div key={i} style={{ marginBottom:14 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:4 }}>
                      <span style={{ color:txt, fontWeight:500 }}>{r.channel}</span>
                      <div style={{ display:"flex", gap:12 }}>
                        <span style={{ color, fontWeight:600 }}>{r.sessions.toLocaleString()} sessions</span>
                        <span style={{ color:txt2 }}>{r.users.toLocaleString()} users</span>
                      </div>
                    </div>
                    <div style={{ height:6, borderRadius:3, background:bg3, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${pct}%`, background:color, borderRadius:3, transition:"width 0.6s" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pages */}
          {activeTab==="pages" && (
            <div style={s.card}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                <div style={{ fontSize:13, fontWeight:600, color:txt }}>Top Pages</div>
                <button onClick={()=>exportCSV(data.pages,"ga4-pages.csv")} style={{ padding:"4px 12px", borderRadius:6, border:`1px solid #059669aa`, background:"#05966911", color:"#059669", fontSize:11, cursor:"pointer" }}>⬇️ CSV</button>
              </div>
              <table style={s.table}>
                <thead><tr>
                  {["Page","Views","Sessions","Bounce Rate"].map(h=><th key={h} style={s.th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {data.pages.map((r,i) => (
                    <tr key={i}>
                      <td style={s.td}>
                        <div style={{ fontSize:11, color:txt, maxWidth:320, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.page}</div>
                        <div style={{ height:3, borderRadius:2, background:"#7C3AED33", marginTop:4, overflow:"hidden" }}>
                          <div style={{ height:"100%", width:`${(r.views/maxViews)*100}%`, background:"#7C3AED", borderRadius:2 }} />
                        </div>
                      </td>
                      <td style={{ ...s.td, color:"#7C3AED", fontWeight:600 }}>{r.views.toLocaleString()}</td>
                      <td style={s.td}>{r.sessions.toLocaleString()}</td>
                      <td style={{ ...s.td, color: parseFloat(r.bounce)>60?"#DC2626":parseFloat(r.bounce)>40?"#D97706":"#059669" }}>{r.bounce}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Sources */}
          {activeTab==="sources" && (
            <div style={s.card}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                <div style={{ fontSize:13, fontWeight:600, color:txt }}>Traffic Sources</div>
                <button onClick={()=>exportCSV(data.sources,"ga4-sources.csv")} style={{ padding:"4px 12px", borderRadius:6, border:`1px solid #059669aa`, background:"#05966911", color:"#059669", fontSize:11, cursor:"pointer" }}>⬇️ CSV</button>
              </div>
              <table style={s.table}>
                <thead><tr>
                  {["Channel","Sessions","Users","Bounce Rate"].map(h=><th key={h} style={s.th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {data.sources.map((r,i) => {
                    const color = channelColors[r.channel] || "#7C3AED";
                    return (
                      <tr key={i}>
                        <td style={s.td}>
                          <span style={{ padding:"2px 8px", borderRadius:6, fontSize:11, background:color+"22", color }}>{r.channel}</span>
                        </td>
                        <td style={{ ...s.td, color, fontWeight:600 }}>{r.sessions.toLocaleString()}</td>
                        <td style={s.td}>{r.users.toLocaleString()}</td>
                        <td style={{ ...s.td, color: parseFloat(r.bounce)>60?"#DC2626":"#059669" }}>{r.bounce}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Devices */}
          {activeTab==="devices" && (
            <div style={s.card}>
              <div style={{ fontSize:13, fontWeight:600, color:txt, marginBottom:16 }}>Device Breakdown</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
                {data.devices.map((r,i) => {
                  const icons   = { mobile:"📱", desktop:"🖥️", tablet:"📟" };
                  const colors  = { mobile:"#7C3AED", desktop:"#0891B2", tablet:"#059669" };
                  const total   = data.devices.reduce((a,d)=>a+d.sessions,0);
                  const pct     = total ? ((r.sessions/total)*100).toFixed(1) : 0;
                  const color   = colors[r.device] || "#7C3AED";
                  return (
                    <div key={i} style={{ background:bg3, border:`1px solid ${bdr}`, borderRadius:10, padding:20, textAlign:"center" }}>
                      <div style={{ fontSize:32, marginBottom:8 }}>{icons[r.device]||"📱"}</div>
                      <div style={{ fontSize:13, fontWeight:600, color:txt, textTransform:"capitalize", marginBottom:4 }}>{r.device}</div>
                      <div style={{ fontSize:22, fontWeight:700, color, marginBottom:4 }}>{pct}%</div>
                      <div style={{ fontSize:11, color:txt2 }}>{r.sessions.toLocaleString()} sessions</div>
                      <div style={{ height:4, borderRadius:2, background:bg2, marginTop:12, overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${pct}%`, background:color, borderRadius:2 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Countries */}
          {activeTab==="countries" && (
            <div style={s.card}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                <div style={{ fontSize:13, fontWeight:600, color:txt }}>Top Countries</div>
                <button onClick={()=>exportCSV(data.countries,"ga4-countries.csv")} style={{ padding:"4px 12px", borderRadius:6, border:`1px solid #059669aa`, background:"#05966911", color:"#059669", fontSize:11, cursor:"pointer" }}>⬇️ CSV</button>
              </div>
              <table style={s.table}>
                <thead><tr>
                  {["Country","Sessions","Users"].map(h=><th key={h} style={s.th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {data.countries.map((r,i) => {
                    const maxS = Math.max(...data.countries.map(c=>c.sessions),1);
                    return (
                      <tr key={i}>
                        <td style={s.td}>
                          <div style={{ fontWeight:500 }}>{r.country}</div>
                          <div style={{ height:3, borderRadius:2, background:"#0891B233", marginTop:4, overflow:"hidden" }}>
                            <div style={{ height:"100%", width:`${(r.sessions/maxS)*100}%`, background:"#0891B2", borderRadius:2 }} />
                          </div>
                        </td>
                        <td style={{ ...s.td, color:"#0891B2", fontWeight:600 }}>{r.sessions.toLocaleString()}</td>
                        <td style={s.td}>{r.users.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {!data && !loading && !error && (
        <div style={{ textAlign:"center", padding:60, color:txt3 }}>
          <div style={{ fontSize:40, marginBottom:12 }}>📈</div>
          <div style={{ fontSize:15, color:txt2, marginBottom:8 }}>Enter your GA4 Property ID to fetch traffic data</div>
          <div style={{ fontSize:12, color:txt3, marginBottom:20 }}>Sessions · Users · Pageviews · Traffic Sources · Devices · Countries</div>
          <div style={{ fontSize:11, color:txt3, background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"12px 20px", display:"inline-block", textAlign:"left" }}>
            <div style={{ fontWeight:600, marginBottom:6, color:txt2 }}>How to find Property ID:</div>
            <div>1. Go to analytics.google.com</div>
            <div>2. Admin → Property Settings</div>
            <div>3. Copy the Property ID (numbers only)</div>
            <div style={{ marginTop:6, color:"#D97706" }}>⚠️ Enable "Google Analytics Data API" in Google Cloud Console</div>
          </div>
        </div>
      )}
    </div>
  );
}