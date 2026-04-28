import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

export default function AgencyDashboard({ dark, onClientSelect }) {
  const { user, API } = useAuth();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [bulkRunning,  setBulkRunning]  = useState(false);
  const [bulkResult,   setBulkResult]   = useState(null);
  const [sort,    setSort]    = useState("score");

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const B    = "#443DCB";

  async function getToken() { return user?.getIdToken?.() || ""; }

  async function runBulkPipeline() {
    setBulkRunning(true);
    setBulkResult(null);
    try {
      const token = await getToken();
      const r = await fetch(`${API}/api/agency/bulk-pipeline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      const json = await r.json();
      if (!r.ok) setBulkResult({ error: json.error || "Failed" });
      else setBulkResult(json);
    } catch (e) { setBulkResult({ error: e.message }); }
    setBulkRunning(false);
  }

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        const res   = await fetch(`${API}/api/agency/dashboard`, { headers: { Authorization: `Bearer ${token}` } });
        const json  = await res.json();
        if (!res.ok) throw new Error(json.error);
        setData(json);
      } catch (e) { setError(e.message); }
      setLoading(false);
    })();
  }, []);

  if (loading) return <div style={{ padding:40, textAlign:"center", color:txt2 }}>Loading agency dashboard...</div>;
  if (error)   return <div style={{ padding:24, color:"#DC2626", fontSize:13 }}>{error}</div>;
  if (!data)   return null;

  const { summary, clients, trends, globalPatterns = [] } = data;

  const currencySymbol = (cur) => ({ GBP: "£", USD: "$", EUR: "€", INR: "₹" }[cur] || cur + " ");
  const fmtMoney = (v, cur = "GBP") => {
    if (v == null || v === 0) return "—";
    const sym = currencySymbol(cur);
    if (v >= 1_000_000) return `${sym}${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000)     return `${sym}${(v / 1_000).toFixed(1)}k`;
    return `${sym}${v.toLocaleString()}`;
  };

  const fixTypeLabel = (t) => ({
    meta_title:       "Meta / Title rewrites",
    content_refresh:  "Content refreshes",
    link_building:    "Link building",
    schema:           "Schema markup",
    technical_speed:  "Technical / Speed",
    on_page:          "On-page fixes",
    other:            "Other fixes",
  }[t] || t);

  const sorted = [...(clients || [])].sort((a, b) => {
    if (sort === "score")   return (a.seoScore || 0) - (b.seoScore || 0);
    if (sort === "alerts")  return (b.openAlerts || 0) - (a.openAlerts || 0);
    if (sort === "fixes")   return (b.fixesPushed || 0) - (a.fixesPushed || 0);
    if (sort === "revenue") return (b.monthlyRevenueEstimate || 0) - (a.monthlyRevenueEstimate || 0);
    return a.name?.localeCompare(b.name);
  });

  const statusColor = s => ({ healthy:"#059669", "needs-attention":"#D97706", critical:"#DC2626", "no-data":txt2 }[s] || txt2);
  const statusLabel = s => ({ healthy:"Healthy", "needs-attention":"Needs Attention", critical:"Critical", "no-data":"No Data" }[s] || s);
  const scoreColor  = v => v == null ? txt2 : v >= 75 ? "#059669" : v >= 50 ? "#D97706" : "#DC2626";

  return (
    <div style={{ background:bg, minHeight:"100%", padding:24 }}>

      {/* Header */}
      <div style={{ marginBottom:24, display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>Agency Dashboard</div>
          <div style={{ fontSize:22, fontWeight:800, color:txt }}>All Clients Overview</div>
          <div style={{ fontSize:12, color:txt2, marginTop:2 }}>{summary.totalClients} clients{data.generatedAt ? ` · Updated ${new Date(data.generatedAt).toLocaleString()}` : ""}</div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6 }}>
          <button
            onClick={runBulkPipeline}
            disabled={bulkRunning}
            style={{ padding:"10px 18px", borderRadius:10, border:"none", background:B, color:"#fff", fontSize:13, fontWeight:800, cursor:bulkRunning?"not-allowed":"pointer", opacity:bulkRunning?0.7:1, whiteSpace:"nowrap", boxShadow:`0 2px 8px ${B}44` }}
          >
            {bulkRunning ? "Queuing…" : "⚡ Run All Pipelines"}
          </button>
          {bulkResult && !bulkResult.error && (
            <div style={{ fontSize:11, color:"#059669", fontWeight:600 }}>
              ✓ {bulkResult.totalClients} pipeline(s) queued · starts now
            </div>
          )}
          {bulkResult?.error && (
            <div style={{ fontSize:11, color:"#DC2626" }}>{bulkResult.error}</div>
          )}
        </div>
      </div>

      {/* Summary tiles */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:10, marginBottom:28 }}>
        {[
          { l:"Total Clients",     v: summary.totalClients,     c: B         },
          { l:"Avg SEO Score",     v: summary.avgSeoScore != null ? summary.avgSeoScore + "/100" : "—", c: scoreColor(summary.avgSeoScore) },
          { l:"Healthy",           v: summary.healthy,          c:"#059669"  },
          { l:"Needs Attention",   v: summary.needsAttention,   c:"#D97706"  },
          { l:"Critical",          v: summary.critical,         c:"#DC2626"  },
          { l:"Open Alerts",       v: summary.totalOpenAlerts,  c: summary.totalOpenAlerts > 0 ? "#DC2626" : "#059669" },
          { l:"Fixes Pushed",      v: summary.totalFixesPushed, c:"#059669"  },
          { l:"Monthly Revenue",   v: fmtMoney(summary.totalMonthlyRevenue, summary.currency), c:"#059669"  },
          { l:"Gained from Fixes", v: fmtMoney(summary.totalRevenueGained, summary.currency), c: B },
          { l:"Pipeline Complete", v: summary.pipelineComplete, c: B         },
        ].map(s => (
          <div key={s.l} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"12px 14px", borderTop:`3px solid ${s.c}` }}>
            <div style={{ fontSize:22, fontWeight:800, color:s.c }}>{s.v}</div>
            <div style={{ fontSize:11, color:txt2, marginTop:2 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Score distribution bar */}
      {summary.totalClients > 0 && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:20 }}>
          <div style={{ fontSize:12, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:12 }}>Score Distribution</div>
          <div style={{ display:"flex", height:12, borderRadius:8, overflow:"hidden", gap:1 }}>
            {[["#059669", summary.healthy], ["#D97706", summary.needsAttention], ["#DC2626", summary.critical], [txt2, summary.totalClients - summary.healthy - summary.needsAttention - summary.critical]].map(([color, count], i) => (
              count > 0 ? <div key={i} style={{ background:color, flex:count, transition:"flex 0.3s" }} title={`${count} clients`} /> : null
            ))}
          </div>
          <div style={{ display:"flex", gap:16, marginTop:8 }}>
            {[["#059669","Healthy (75+)"], ["#D97706","Warning (50–74)"], ["#DC2626","Critical (<50)"]].map(([c,l]) => (
              <div key={l} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:txt2 }}>
                <div style={{ width:8, height:8, borderRadius:2, background:c }} />{l}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cross-client learning — proves the agent learns */}
      {globalPatterns.length > 0 && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:20 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
            <div style={{ fontSize:12, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1 }}>
              Agent Learning — Fix Success Rates
            </div>
            <div style={{ fontSize:10, color:txt2, background:bg3, padding:"3px 8px", borderRadius:6 }}>
              Across your {summary.totalClients} clients
            </div>
          </div>
          <div style={{ fontSize:12, color:txt2, marginBottom:14 }}>
            Historical win rates from verified fixes — the CMO agent uses these to weight new decisions.
          </div>
          <div style={{ display:"grid", gap:10 }}>
            {globalPatterns.map(p => {
              const color = p.winRate >= 70 ? "#059669" : p.winRate >= 50 ? "#D97706" : "#DC2626";
              return (
                <div key={p.fixType} style={{ display:"grid", gridTemplateColumns:"1fr 60px", gap:12, alignItems:"center" }}>
                  <div>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:4 }}>
                      <span style={{ color:txt, fontWeight:600 }}>{fixTypeLabel(p.fixType)}</span>
                      <span style={{ color:txt2 }}>
                        {p.sample} fix{p.sample === 1 ? "" : "es"} · {p.clientCount} client{p.clientCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div style={{ height:6, background:bg3, borderRadius:3, overflow:"hidden" }}>
                      <div style={{ width:`${p.winRate}%`, height:"100%", background:color, transition:"width 0.4s" }} />
                    </div>
                  </div>
                  <div style={{ fontSize:16, fontWeight:800, color, textAlign:"right" }}>{p.winRate}%</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Client table */}
      <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, overflow:"hidden", marginBottom:20 }}>
        {/* Table header with sort */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 80px 90px 80px 80px 100px 100px", gap:0, padding:"10px 16px", borderBottom:`1px solid ${bdr}`, background:bg3 }}>
          {[["name","Client"], ["score","Score"], ["status","Status"], ["alerts","Alerts"], ["fixes","Fixes"], ["revenue","Revenue/mo"], ["pipeline","Pipeline"]].map(([key, label]) => (
            <div key={key} onClick={() => setSort(key)}
              style={{ fontSize:11, fontWeight:700, color: sort===key ? B : txt2, textTransform:"uppercase", letterSpacing:0.8, cursor:"pointer", userSelect:"none" }}>
              {label} {sort===key ? "↑" : ""}
            </div>
          ))}
        </div>

        {sorted.length === 0 ? (
          <div style={{ padding:"40px 16px", textAlign:"center", color:txt2, fontSize:13 }}>No clients found.</div>
        ) : (
          sorted.map((client, i) => (
            <div key={client.id}
              onClick={() => onClientSelect?.(client.id)}
              style={{ display:"grid", gridTemplateColumns:"1fr 80px 90px 80px 80px 100px 100px", gap:0,
                padding:"12px 16px", borderBottom: i < sorted.length-1 ? `1px solid ${bdr}` : "none",
                cursor: onClientSelect ? "pointer" : "default",
                transition:"background 0.1s" }}
              onMouseEnter={e => { if (onClientSelect) e.currentTarget.style.background = bg3; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>

              <div>
                <div style={{ fontSize:13, fontWeight:600, color:txt }}>{client.name}</div>
                <div style={{ fontSize:11, color:txt2 }}>{client.website?.replace(/^https?:\/\//, "")}</div>
              </div>

              <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                <span style={{ fontSize:15, fontWeight:800, color:scoreColor(client.seoScore) }}>
                  {client.seoScore ?? "—"}
                </span>
                {client.seoScore && <span style={{ fontSize:10, color:txt2 }}>/100</span>}
                {client.scoreStale && (
                  <span title={`Score last updated ${client.scoreAgeDays} days ago`}
                    style={{ fontSize:9, padding:"2px 5px", borderRadius:6, background:"#D9770618", color:"#D97706", fontWeight:700, marginLeft:2 }}>
                    {client.scoreAgeDays}d old
                  </span>
                )}
              </div>

              <div style={{ display:"flex", alignItems:"center" }}>
                <span style={{ fontSize:11, padding:"3px 8px", borderRadius:8,
                  background: statusColor(client.status) + "18",
                  color:      statusColor(client.status), fontWeight:700 }}>
                  {statusLabel(client.status)}
                </span>
              </div>

              <div style={{ display:"flex", alignItems:"center" }}>
                <span style={{ fontSize:13, fontWeight:700, color: client.openAlerts > 0 ? "#DC2626" : "#059669" }}>
                  {client.openAlerts > 0 ? `🚨 ${client.openAlerts}` : "✅ 0"}
                </span>
              </div>

              <div style={{ display:"flex", alignItems:"center" }}>
                <span style={{ fontSize:13, fontWeight:600, color:txt }}>
                  {client.fixesPushed > 0 ? `✅ ${client.fixesPushed}` : "—"}
                </span>
              </div>

              <div style={{ display:"flex", flexDirection:"column", justifyContent:"center" }}>
                <span style={{ fontSize:13, fontWeight:700, color:"#059669" }}>
                  {fmtMoney(client.monthlyRevenueEstimate, client.currency)}
                </span>
                {client.revenueGainedFromFixes > 0 && (
                  <span style={{ fontSize:10, color: B, fontWeight:600 }}>
                    +{fmtMoney(client.revenueGainedFromFixes, client.currency)} gained
                  </span>
                )}
              </div>

              <div style={{ display:"flex", alignItems:"center" }}>
                <span style={{ fontSize:11, color: client.pipelineStatus === "complete" ? "#059669" : txt2 }}>
                  {client.pipelineStatus === "complete" ? "✅ Done"
                   : client.pipelineStatus === "running"  ? "⏳ Running"
                   : client.pipelineStatus === "failed"   ? "❌ Failed"
                   : "Pending"}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Sparklines */}
      {trends?.length > 0 && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20 }}>
          <div style={{ fontSize:12, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:16 }}>Score Trends (last 8 weeks)</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:16 }}>
            {trends.filter(t => t.history?.length > 1).map(client => (
              <div key={client.clientId} style={{ background:bg3, borderRadius:10, padding:14 }}>
                <div style={{ fontSize:12, fontWeight:600, color:txt, marginBottom:8 }}>{client.name}</div>
                <Sparkline data={client.history} txt2={txt2} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Sparkline({ data, txt2 = "#888" }) {
  if (!data?.length) return null;
  const vals  = data.map(d => d.overall || 0);
  const max   = Math.max(...vals, 100);
  const last  = vals[vals.length - 1];
  const first = vals[0];
  const trend = last - first;
  const color = last >= 75 ? "#059669" : last >= 50 ? "#D97706" : "#DC2626";

  return (
    <div>
      <div style={{ display:"flex", alignItems:"flex-end", gap:2, height:36 }}>
        {vals.map((v, i) => (
          <div key={i} style={{ flex:1, background: i === vals.length-1 ? color : color+"55", borderRadius:"2px 2px 0 0", height:`${(v/max)*100}%`, minHeight:2, transition:"height 0.3s" }} />
        ))}
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", marginTop:6, fontSize:11 }}>
        <span style={{ color:txt2 }}>{first}/100</span>
        <span style={{ color: trend > 0 ? "#059669" : trend < 0 ? "#DC2626" : txt2, fontWeight:700 }}>
          {trend > 0 ? `+${trend}` : trend < 0 ? String(trend) : "="} → {last}/100
        </span>
      </div>
    </div>
  );
}
