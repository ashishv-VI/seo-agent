/**
 * ClientPortal — White-label read-only SEO report for end clients
 * Loaded when URL has ?portal=<token>. No login required.
 */
import { useState, useEffect } from "react";

const API = import.meta.env.VITE_API_URL || "https://seo-agent-backend-8mfz.onrender.com";
const B   = "#443DCB";

function ScoreRing({ score, size = 100 }) {
  const r   = (size / 2) - 8;
  const circ = 2 * Math.PI * r;
  const pct  = Math.min(Math.max(score || 0, 0), 100);
  const dash = (pct / 100) * circ;
  const color = pct >= 70 ? "#059669" : pct >= 40 ? "#D97706" : "#DC2626";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={7}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={7}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}/>
      <text x={size/2} y={size/2 + 5} textAnchor="middle" fontSize={size * 0.22}
        fontWeight="800" fill={color}>{score ?? "–"}</text>
    </svg>
  );
}

function MetricCard({ label, value, unit, color, icon, delta }) {
  return (
    <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:"16px 18px", textAlign:"center" }}>
      {icon && <div style={{ fontSize:22, marginBottom:6 }}>{icon}</div>}
      <div style={{ fontSize:24, fontWeight:800, color: color || "#111827" }}>
        {value ?? "–"}{unit && <span style={{ fontSize:14, fontWeight:500, color:"#9ca3af" }}> {unit}</span>}
      </div>
      {delta !== null && delta !== undefined && (
        <div style={{ fontSize:11, fontWeight:600, color: delta >= 0 ? "#059669" : "#DC2626", marginTop:2 }}>
          {delta > 0 ? "▲" : "▼"} {Math.abs(delta)} vs last month
        </div>
      )}
      <div style={{ fontSize:12, color:"#6b7280", marginTop:2 }}>{label}</div>
    </div>
  );
}

function SeverityBadge({ sev }) {
  const map = { critical:["#DC2626","#FEF2F2"], high:["#D97706","#FFFBEB"], medium:["#2563EB","#EFF6FF"] };
  const [c, bg] = map[sev] || ["#6b7280","#f3f4f6"];
  return (
    <span style={{ background:bg, color:c, fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:20, textTransform:"uppercase", letterSpacing:"0.05em" }}>
      {sev}
    </span>
  );
}

function ProgressBar({ value, max = 100, color = B }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ background:"#f3f4f6", borderRadius:99, height:6, overflow:"hidden" }}>
      <div style={{ width:`${pct}%`, height:"100%", background:color, borderRadius:99, transition:"width 0.6s ease" }}/>
    </div>
  );
}

function AgentBadge({ label, status }) {
  const map = {
    complete:   ["#059669","#ECFDF5","✓"],
    signed_off: ["#059669","#ECFDF5","✓"],
    running:    ["#2563EB","#EFF6FF","⟳"],
    failed:     ["#DC2626","#FEF2F2","✗"],
    pending:    ["#9ca3af","#f3f4f6","·"],
  };
  const [c, bg, icon] = map[status] || map.pending;
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:4, background:bg, color:c, fontSize:11, fontWeight:600, padding:"3px 9px", borderRadius:20, border:`1px solid ${c}33` }}>
      <span>{icon}</span>{label}
    </span>
  );
}

export default function ClientPortal({ token }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/api/portal/${token}`);
        if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Portal not found"); }
        setData(await res.json());
      } catch (e) { setError(e.message); }
      setLoading(false);
    })();
  }, [token]);

  if (loading) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#f9fafb", fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ width:40, height:40, border:`3px solid ${B}33`, borderTop:`3px solid ${B}`, borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto 16px" }}/>
        <p style={{ color:"#6b7280", fontSize:14 }}>Loading your SEO report…</p>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}} .portal-no-print{display:none}`}</style>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#f9fafb", fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      <div style={{ textAlign:"center", maxWidth:400, padding:32 }}>
        <div style={{ fontSize:48, marginBottom:16 }}>🔒</div>
        <h2 style={{ fontSize:20, fontWeight:700, color:"#111827", margin:"0 0 8px" }}>Report Unavailable</h2>
        <p style={{ color:"#6b7280", fontSize:14, lineHeight:1.6 }}>{error}</p>
        <p style={{ color:"#9ca3af", fontSize:12, marginTop:16 }}>If you believe this is an error, please contact your SEO agency.</p>
      </div>
    </div>
  );

  const { client, agency, data: d } = data;
  const score  = d.healthScore || client.seoScore;
  const agents = client.agents || {};

  const agentLabels = { A1:"Brief", A2:"Audit", A3:"Keywords", A4:"Competitors", A5:"Content", A6:"On-Page", A7:"Performance", A8:"Local SEO", A9:"Report", A10:"Rankings" };

  return (
    <div style={{ minHeight:"100vh", background:"#f9fafb", fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", color:"#111827" }}>

      {/* ── Print styles ── */}
      <style>{`
        @media print {
          .portal-no-print { display:none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        @keyframes spin { to { transform:rotate(360deg) } }
      `}</style>

      {/* ── Header / Agency Brand ── */}
      <div style={{ background:`linear-gradient(135deg, ${B} 0%, #6B62E8 100%)`, padding:"24px 32px" }}>
        <div style={{ maxWidth:900, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between", gap:16, flexWrap:"wrap" }}>
          <div>
            <div style={{ color:"#fff", fontSize:22, fontWeight:800, letterSpacing:"-0.02em" }}>
              {agency.name}
            </div>
            <div style={{ color:"#a5b4fc", fontSize:13, marginTop:3 }}>SEO Performance Report</div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
            <div style={{ textAlign:"right" }}>
              <div style={{ color:"#fff", fontSize:18, fontWeight:700 }}>{client.name}</div>
              <a href={client.website} target="_blank" rel="noreferrer"
                style={{ color:"#c7d2fe", fontSize:12, textDecoration:"none" }}>{client.website}</a>
            </div>
            <button
              className="portal-no-print"
              onClick={() => window.print()}
              style={{ background:"rgba(255,255,255,0.15)", border:"1.5px solid rgba(255,255,255,0.4)", color:"#fff", fontSize:13, fontWeight:600, padding:"9px 18px", borderRadius:8, cursor:"pointer", backdropFilter:"blur(4px)", whiteSpace:"nowrap" }}
            >
              ⬇ Download PDF
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:900, margin:"0 auto", padding:"32px 24px" }}>

        {/* ── Overall Score + Pipeline ── */}
        <div style={{ display:"grid", gridTemplateColumns:"auto 1fr", gap:24, background:"#fff", borderRadius:16, padding:28, marginBottom:24, boxShadow:"0 1px 4px rgba(0,0,0,.06)", border:"1px solid #e5e7eb", alignItems:"center" }}>
          <div style={{ textAlign:"center" }}>
            <ScoreRing score={score} size={120}/>
            <div style={{ fontSize:12, color:"#6b7280", marginTop:4 }}>Overall SEO Score</div>
          </div>
          <div>
            <h2 style={{ margin:"0 0 6px", fontSize:20, fontWeight:800 }}>
              {client.pipelineStatus === "complete" ? "Analysis Complete" : client.pipelineStatus === "running" ? "Analysis In Progress" : "Analysis Pending"}
            </h2>
            {d.summary && <p style={{ fontSize:14, color:"#374151", lineHeight:1.6, margin:"0 0 16px" }}>{d.summary}</p>}
            {d.reportDate && <p style={{ fontSize:12, color:"#9ca3af", margin:0 }}>Last updated: {new Date(d.reportDate).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" })}</p>}

            {/* Agent status pills */}
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:14 }}>
              {Object.entries(agentLabels).map(([id, label]) =>
                agents[id] ? <AgentBadge key={id} label={label} status={agents[id]}/> : null
              )}
            </div>
          </div>
        </div>

        {/* ── Month-over-Month Banner ── */}
        {d.scoreDelta !== null && d.scoreDelta !== undefined && (
          <div style={{ background: d.scoreDelta >= 0 ? "#ECFDF5" : "#FEF2F2", border:`1px solid ${d.scoreDelta >= 0 ? "#059669" : "#DC2626"}33`, borderRadius:12, padding:"12px 20px", marginBottom:16, display:"flex", alignItems:"center", gap:12 }}>
            <span style={{ fontSize:22 }}>{d.scoreDelta >= 0 ? "📈" : "📉"}</span>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color: d.scoreDelta >= 0 ? "#059669" : "#DC2626" }}>
                {d.scoreDelta > 0 ? "+" : ""}{d.scoreDelta} points vs last month
              </div>
              <div style={{ fontSize:12, color:"#6b7280" }}>
                Score moved from <strong>{d.prevScore}</strong> → <strong>{score}</strong>{d.prevDate ? ` (since ${d.prevDate})` : ""}
              </div>
            </div>
          </div>
        )}

        {/* ── Key Metrics ── */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:12, marginBottom:24 }}>
          <MetricCard label="Tech Score"      value={d.techScore}    unit="/100" color={d.techScore >= 70 ? "#059669" : d.techScore >= 40 ? "#D97706" : "#DC2626"} icon="🔧"/>
          <MetricCard label="Mobile Score"    value={d.mobileScore}  unit="/100" color={d.mobileScore >= 70 ? "#059669" : "#D97706"} icon="📱"
            delta={d.mobileScoreDelta}/>
          <MetricCard label="Desktop Score"   value={d.desktopScore} unit="/100" color={d.desktopScore >= 70 ? "#059669" : "#D97706"} icon="🖥️"
            delta={d.desktopScoreDelta}/>
          <MetricCard label="Keywords Found"  value={d.totalKeywords} icon="🔑" delta={d.kwCountDelta}/>
          <MetricCard label="Top 10 Rankings" value={d.top10Count}    icon="📈"/>
          <MetricCard label="Pages Crawled"   value={d.crawledPages}  icon="🌐"/>
        </div>

        {/* ── Core Web Vitals ── */}
        {(d.lcp || d.fcp || d.cls || d.ttfb) && (
          <div style={{ background:"#fff", borderRadius:16, padding:24, marginBottom:24, boxShadow:"0 1px 4px rgba(0,0,0,.06)", border:"1px solid #e5e7eb" }}>
            <h3 style={{ fontSize:15, fontWeight:700, margin:"0 0 16px" }}>Core Web Vitals</h3>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:12 }}>
              {d.lcp  && <div style={{ background:"#f9fafb", borderRadius:10, padding:"12px 14px" }}><div style={{ fontSize:11, color:"#6b7280", marginBottom:4 }}>LCP (Largest Content)</div><div style={{ fontSize:18, fontWeight:700, color: parseFloat(d.lcp) <= 2.5 ? "#059669" : "#D97706" }}>{d.lcp}s</div></div>}
              {d.fcp  && <div style={{ background:"#f9fafb", borderRadius:10, padding:"12px 14px" }}><div style={{ fontSize:11, color:"#6b7280", marginBottom:4 }}>FCP (First Content)</div><div style={{ fontSize:18, fontWeight:700, color: parseFloat(d.fcp) <= 1.8 ? "#059669" : "#D97706" }}>{d.fcp}s</div></div>}
              {d.cls  && <div style={{ background:"#f9fafb", borderRadius:10, padding:"12px 14px" }}><div style={{ fontSize:11, color:"#6b7280", marginBottom:4 }}>CLS (Layout Shift)</div><div style={{ fontSize:18, fontWeight:700, color: parseFloat(d.cls) <= 0.1 ? "#059669" : "#D97706" }}>{d.cls}</div></div>}
              {d.ttfb && <div style={{ background:"#f9fafb", borderRadius:10, padding:"12px 14px" }}><div style={{ fontSize:11, color:"#6b7280", marginBottom:4 }}>TTFB (Time to Byte)</div><div style={{ fontSize:18, fontWeight:700, color: parseFloat(d.ttfb) <= 800 ? "#059669" : "#D97706" }}>{d.ttfb}ms</div></div>}
            </div>
          </div>
        )}

        {/* ── Top Issues ── */}
        {d.topIssues?.length > 0 && (
          <div style={{ background:"#fff", borderRadius:16, padding:24, marginBottom:24, boxShadow:"0 1px 4px rgba(0,0,0,.06)", border:"1px solid #e5e7eb" }}>
            <h3 style={{ fontSize:15, fontWeight:700, margin:"0 0 16px" }}>Issues Being Fixed</h3>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {d.topIssues.map((issue, i) => (
                <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"10px 14px", background:"#f9fafb", borderRadius:10 }}>
                  <SeverityBadge sev={issue.severity}/>
                  <span style={{ fontSize:13, color:"#374151", lineHeight:1.5 }}>{issue.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Recommendations ── */}
        {d.recommendations?.length > 0 && (
          <div style={{ background:"#fff", borderRadius:16, padding:24, marginBottom:24, boxShadow:"0 1px 4px rgba(0,0,0,.06)", border:"1px solid #e5e7eb" }}>
            <h3 style={{ fontSize:15, fontWeight:700, margin:"0 0 16px" }}>Action Plan</h3>
            <ol style={{ margin:0, paddingLeft:20, display:"flex", flexDirection:"column", gap:8 }}>
              {d.recommendations.map((rec, i) => (
                <li key={i} style={{ fontSize:13, color:"#374151", lineHeight:1.6 }}>
                  {typeof rec === "string" ? rec : rec.recommendation || rec.action || JSON.stringify(rec)}
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* ── Top Keywords ── */}
        {d.topKeywords?.length > 0 && (
          <div style={{ background:"#fff", borderRadius:16, padding:24, marginBottom:24, boxShadow:"0 1px 4px rgba(0,0,0,.06)", border:"1px solid #e5e7eb" }}>
            <h3 style={{ fontSize:15, fontWeight:700, margin:"0 0 16px" }}>Target Keywords ({d.totalKeywords} total)</h3>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {d.topKeywords.map((kw, i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <span style={{ flex:1, fontSize:13, color:"#111827", fontWeight:500 }}>{kw.keyword}</span>
                  {kw.intent && <span style={{ fontSize:11, color:"#6b7280", background:"#f3f4f6", padding:"2px 8px", borderRadius:20 }}>{kw.intent}</span>}
                  {kw.difficulty != null && (
                    <div style={{ width:80 }}>
                      <ProgressBar value={kw.difficulty} color={kw.difficulty < 40 ? "#059669" : kw.difficulty < 70 ? "#D97706" : "#DC2626"}/>
                      <div style={{ fontSize:10, color:"#9ca3af", marginTop:2, textAlign:"right" }}>KD {kw.difficulty}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Rankings ── */}
        {(d.rankDrops?.length > 0 || d.rankGains?.length > 0) && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:24 }}>
            {d.rankGains?.length > 0 && (
              <div style={{ background:"#fff", borderRadius:16, padding:20, boxShadow:"0 1px 4px rgba(0,0,0,.06)", border:"1px solid #e5e7eb" }}>
                <h3 style={{ fontSize:14, fontWeight:700, color:"#059669", margin:"0 0 12px" }}>📈 Ranking Gains</h3>
                {d.rankGains.map((r, i) => (
                  <div key={i} style={{ fontSize:12, padding:"6px 0", borderBottom:"1px solid #f3f4f6", display:"flex", justifyContent:"space-between" }}>
                    <span style={{ color:"#374151" }}>{r.keyword}</span>
                    <span style={{ color:"#059669", fontWeight:700 }}>+{r.gain} pos</span>
                  </div>
                ))}
              </div>
            )}
            {d.rankDrops?.length > 0 && (
              <div style={{ background:"#fff", borderRadius:16, padding:20, boxShadow:"0 1px 4px rgba(0,0,0,.06)", border:"1px solid #e5e7eb" }}>
                <h3 style={{ fontSize:14, fontWeight:700, color:"#DC2626", margin:"0 0 12px" }}>📉 Under Review</h3>
                {d.rankDrops.map((r, i) => (
                  <div key={i} style={{ fontSize:12, padding:"6px 0", borderBottom:"1px solid #f3f4f6", display:"flex", justifyContent:"space-between" }}>
                    <span style={{ color:"#374151" }}>{r.keyword}</span>
                    <span style={{ color:"#DC2626", fontWeight:700 }}>−{r.drop} pos</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Key Findings ── */}
        {d.keyFindings?.length > 0 && (
          <div style={{ background:"#fff", borderRadius:16, padding:24, marginBottom:24, boxShadow:"0 1px 4px rgba(0,0,0,.06)", border:"1px solid #e5e7eb" }}>
            <h3 style={{ fontSize:15, fontWeight:700, margin:"0 0 14px" }}>Key Findings</h3>
            <ul style={{ margin:0, paddingLeft:20, display:"flex", flexDirection:"column", gap:6 }}>
              {d.keyFindings.map((f, i) => (
                <li key={i} style={{ fontSize:13, color:"#374151", lineHeight:1.6 }}>
                  {typeof f === "string" ? f : f.finding || f.detail || JSON.stringify(f)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Footer ── */}
        <div style={{ textAlign:"center", padding:"24px 0", borderTop:"1px solid #e5e7eb", marginTop:8 }}>
          <p style={{ fontSize:12, color:"#9ca3af", margin:0 }}>
            This report was prepared by <strong style={{ color:"#6b7280" }}>{agency.name}</strong>.
            {agency.email && <> Questions? <a href={`mailto:${agency.email}`} style={{ color:B }}>{agency.email}</a></>}
          </p>
          <p style={{ fontSize:11, color:"#d1d5db", marginTop:6 }}>Powered by SEO Agent AI</p>
        </div>
      </div>
    </div>
  );
}
