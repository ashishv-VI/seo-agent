import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

export default function WarRoomPanel({ dark, clientId, bg2, bg3, bdr, txt, txt2, B }) {
  const { user, API } = useAuth();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [view,    setView]    = useState("weekly"); // weekly | monthly | compare

  async function getToken() { return user?.getIdToken?.() || ""; }

  useEffect(() => {
    if (!clientId) return;
    (async () => {
      setLoading(true);
      try {
        const token = await getToken();
        const res   = await fetch(`${API}/api/control-room/${clientId}/war-room`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json  = await res.json();
        if (!res.ok) { setError(json.error || "Failed"); return; }
        setData(json);
      } catch (e) { setError(e.message); }
      setLoading(false);
    })();
  }, [clientId]);

  const currency = data?.currency === "GBP" ? "£" : data?.currency === "USD" ? "$" : "₹";

  function fmt(n) {
    if (n == null) return "—";
    if (n >= 100000) return currency + (n / 100000).toFixed(1) + "L";
    if (n >= 1000)   return currency + (n / 1000).toFixed(1) + "K";
    return currency + n;
  }

  function delta(n, suffix = "") {
    if (n == null) return null;
    const color = n > 0 ? "#059669" : n < 0 ? "#DC2626" : "#888";
    const sign  = n > 0 ? "+" : "";
    return <span style={{ fontSize:11, color, fontWeight:700 }}>{sign}{n}{suffix}</span>;
  }

  if (loading) return (
    <div style={{ padding:40, textAlign:"center", color:txt2, fontSize:13 }}>Loading War Room...</div>
  );
  if (error)   return (
    <div style={{ padding:20, color:"#DC2626", background:"#DC262611", borderRadius:10, fontSize:13 }}>{error}</div>
  );
  if (!data)   return null;

  const proof = data.proofEngine || {};

  return (
    <div>
      {/* ── Proof Engine header ── */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:10, marginBottom:20 }}>
        <StatCard label="Total Fixes Pushed"  value={proof.totalFixes ?? "—"}     sub=""                      color={B}        bg2={bg2} bdr={bdr} txt={txt} txt2={txt2} />
        <StatCard label="Confirmed Wins"      value={proof.totalWins ?? "—"}      sub={proof.winRate != null ? `${proof.winRate}% win rate` : ""} color="#059669" bg2={bg2} bdr={bdr} txt={txt} txt2={txt2} />
        <StatCard label="Leads Generated"     value={proof.totalLeads ?? "—"}     sub="all time"              color="#0891B2"  bg2={bg2} bdr={bdr} txt={txt} txt2={txt2} />
        <StatCard label="Revenue Attributed"  value={proof.totalRevenue != null ? fmt(proof.totalRevenue) : "—"} sub={data.aov > 0 ? `AOV ${fmt(data.aov)}` : "Set AOV in brief"} color="#D97706" bg2={bg2} bdr={bdr} txt={txt} txt2={txt2} />
        {proof.projectedRevenueNext30 != null && (
          <StatCard label="Projected (30d)"   value={fmt(proof.projectedRevenueNext30)} sub="if current pace holds" color="#059669" bg2={bg2} bdr={bdr} txt={txt} txt2={txt2} />
        )}
      </div>

      {/* ── CMO banner ── */}
      {data.cmo?.decision && (
        <div style={{ marginBottom:18, padding:"12px 16px", background: dark ? "#1a1630" : "#f0efff", border:`1px solid ${B}33`, borderLeft:`3px solid ${B}`, borderRadius:10, fontSize:13 }}>
          <span style={{ color:B, fontWeight:800 }}>CMO → </span>
          <span style={{ color:txt }}>{data.cmo.decision}</span>
          {data.cmo.confidence != null && (
            <span style={{ color:txt2, marginLeft:8, fontSize:11 }}>{Math.round(data.cmo.confidence * 100)}% confidence</span>
          )}
        </div>
      )}

      {/* ── View switcher ── */}
      <div style={{ display:"flex", gap:4, marginBottom:16, borderBottom:`1px solid ${bdr}` }}>
        {[["weekly","This Week (12w)"],["monthly","Monthly (6m)"],["compare","Compare"],["timeline","Proof of Work"]].map(([id, label]) => (
          <button key={id} onClick={() => setView(id)}
            style={{ padding:"7px 16px", borderRadius:"8px 8px 0 0", border:"none", cursor:"pointer",
              fontSize:12, fontWeight:600,
              background: view === id ? bg2 : "transparent",
              color:      view === id ? B : txt2,
              borderBottom: view === id ? `2px solid ${B}` : "2px solid transparent",
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Weekly view ── */}
      {view === "weekly" && (
        <div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead>
                <tr>
                  {["Week","Fixes Pushed","Wins","Leads","Revenue","SEO Score"].map(h => (
                    <th key={h} style={{ padding:"8px 12px", textAlign:"left", color:txt2, fontWeight:700, fontSize:11, borderBottom:`1px solid ${bdr}`, whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data.weeks || []).map((w, i) => (
                  <tr key={w.week} style={{ background: i % 2 === 0 ? "transparent" : (dark?"#ffffff06":"#00000004") }}>
                    <td style={{ padding:"8px 12px", color:txt2, fontWeight:600, whiteSpace:"nowrap" }}>{w.weekLabel}<span style={{ color:txt2, fontSize:10, marginLeft:4 }}>{w.week}</span></td>
                    <td style={{ padding:"8px 12px", color:txt, fontWeight: w.fixes > 0 ? 700 : 400 }}>{w.fixes || "—"}</td>
                    <td style={{ padding:"8px 12px" }}>
                      {w.confirmedWins > 0
                        ? <span style={{ color:"#059669", fontWeight:800 }}>✓ {w.confirmedWins}</span>
                        : <span style={{ color:txt2 }}>—</span>}
                    </td>
                    <td style={{ padding:"8px 12px", color: w.leads > 0 ? "#0891B2" : txt2, fontWeight: w.leads > 0 ? 700 : 400 }}>{w.leads || "—"}</td>
                    <td style={{ padding:"8px 12px", color: w.revenue > 0 ? "#D97706" : txt2, fontWeight: w.revenue > 0 ? 700 : 400 }}>{w.revenue != null && w.revenue > 0 ? fmt(w.revenue) : "—"}</td>
                    <td style={{ padding:"8px 12px" }}>
                      {w.score != null
                        ? <span style={{ color: w.score >= 75 ? "#059669" : w.score >= 50 ? "#D97706" : "#DC2626", fontWeight:700 }}>{w.score}</span>
                        : <span style={{ color:txt2 }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(!data.weeks || data.weeks.length === 0) && (
            <div style={{ textAlign:"center", padding:40, color:txt2, fontSize:13 }}>No weekly data yet. Run the pipeline to start tracking.</div>
          )}
        </div>
      )}

      {/* ── Monthly view ── */}
      {view === "monthly" && (
        <div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:10 }}>
            {(data.months || []).map((m, i) => {
              const isLatest = i === (data.months.length - 1);
              return (
                <div key={m.month} style={{
                  background: bg2, border:`1px solid ${isLatest ? B : bdr}`,
                  borderTop:`3px solid ${isLatest ? B : bdr}`,
                  borderRadius:10, padding:"14px 16px",
                }}>
                  <div style={{ fontSize:12, fontWeight:800, color: isLatest ? B : txt, marginBottom:10 }}>
                    {m.monthLabel} {isLatest && <span style={{ fontSize:10, color:B }}>← current</span>}
                  </div>
                  <Row label="Fixes"   value={m.fixes}  color={txt}      txt2={txt2} />
                  <Row label="Wins"    value={m.confirmedWins > 0 ? `✓ ${m.confirmedWins}` : "—"} color="#059669" txt2={txt2} />
                  <Row label="Leads"   value={m.leads > 0 ? m.leads : "—"} color="#0891B2" txt2={txt2} />
                  <Row label="Revenue" value={m.revenue != null && m.revenue > 0 ? fmt(m.revenue) : "—"} color="#D97706" txt2={txt2} />
                  {m.score != null && (
                    <Row label="Score" value={m.score + "/100"} color={m.score >= 75 ? "#059669" : m.score >= 50 ? "#D97706" : "#DC2626"} txt2={txt2} />
                  )}
                </div>
              );
            })}
          </div>
          {(!data.months || data.months.length === 0) && (
            <div style={{ textAlign:"center", padding:40, color:txt2, fontSize:13 }}>No monthly data yet.</div>
          )}
        </div>
      )}

      {/* ── Compare view ── */}
      {view === "compare" && data.compare && (
        <div>
          <div style={{ marginBottom:12, fontSize:12, color:txt2 }}>
            Comparing current month vs previous month
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:10 }}>
            {[
              { label:"Fixes Pushed",   key:"fixes",         color:B,         fmt:(v) => v ?? "—" },
              { label:"Confirmed Wins", key:"confirmedWins", color:"#059669", fmt:(v) => v ?? "—" },
              { label:"Leads",          key:"leads",         color:"#0891B2", fmt:(v) => v ?? "—" },
              { label:"Revenue",        key:"revenue",       color:"#D97706", fmt:(v) => v != null ? fmt(v) : "—" },
              { label:"SEO Score",      key:"score",         color:"#059669", fmt:(v) => v != null ? v + "/100" : "—" },
            ].map(({ label, key, color, fmt: fmtFn }) => {
              const c = data.compare[key] || {};
              return (
                <div key={key} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"14px 16px" }}>
                  <div style={{ fontSize:11, color:txt2, fontWeight:700, marginBottom:8, textTransform:"uppercase", letterSpacing:0.5 }}>{label}</div>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end" }}>
                    <div>
                      <div style={{ fontSize:11, color:txt2, marginBottom:2 }}>Last month</div>
                      <div style={{ fontSize:16, fontWeight:700, color:txt2 }}>{fmtFn(c.prior)}</div>
                    </div>
                    <div style={{ fontSize:16, color:txt2 }}>→</div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:11, color:txt2, marginBottom:2 }}>This month</div>
                      <div style={{ fontSize:16, fontWeight:800, color }}>{fmtFn(c.current)}</div>
                    </div>
                  </div>
                  {c.delta != null && (
                    <div style={{ marginTop:8, textAlign:"right" }}>
                      {delta(c.delta, key === "score" ? " pts" : "%")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Proof engine proven fixes */}
          {proof.provenFixes?.length > 0 && (
            <div style={{ marginTop:20 }}>
              <div style={{ fontSize:12, fontWeight:800, color:txt, marginBottom:10 }}>Confirmed Wins — Fixes That Moved Rankings</div>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {proof.provenFixes.slice(0, 5).map((f, i) => (
                  <div key={f.id || i} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", background:bg2, border:`1px solid #05966933`, borderLeft:`3px solid #059669`, borderRadius:8, fontSize:12 }}>
                    <span style={{ color:"#059669", fontWeight:800 }}>✓</span>
                    <span style={{ color:txt, fontWeight:700 }}>{f.type}</span>
                    {f.page && <span style={{ color:txt2, fontSize:11, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.page}</span>}
                    {f.pushedAt && <span style={{ color:txt2, fontSize:10, whiteSpace:"nowrap" }}>{new Date(f.pushedAt).toLocaleDateString()}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {/* ── Proof of Work Timeline ── */}
      {view === "timeline" && (
        <ProofOfWorkTimeline data={data} proof={proof} dark={dark} bg2={bg2} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2} B={B} fmt={fmt} currency={currency} />
      )}
    </div>
  );
}

// ── Proof of Work Timeline ────────────────────────────────────────────────────
// Visual vertical timeline of every fix pushed, with outcome badge and impact.
// Designed to be shown to clients as "proof of SEO work done".
function ProofOfWorkTimeline({ data, proof, dark, bg2, bg3, bdr, txt, txt2, B, fmt, currency }) {
  const fixes = proof.provenFixes || [];
  const weeks = data.weeks || [];

  // Build a unified event list: mix of fixes + weekly milestone markers
  // We use the weekly buckets to insert "milestone" rows when score or leads jump
  const milestones = weeks
    .filter(w => w.score != null || w.leads > 0)
    .map(w => ({ type: "milestone", week: w.week, weekLabel: w.weekLabel, score: w.score, leads: w.leads, fixes: w.fixes, revenue: w.revenue }));

  const OUTCOME_META = {
    improved:   { label:"Confirmed Win",     color:"#059669", bg:"#05966914", icon:"✓" },
    no_change:  { label:"No Change",         color:"#D97706", bg:"#D9770614", icon:"~" },
    degraded:   { label:"Declined",          color:"#DC2626", bg:"#DC262614", icon:"✗" },
    pending:    { label:"Awaiting Outcome",  color:"#0891B2", bg:"#0891B214", icon:"⏳" },
    null:       { label:"Outcome Unknown",   color:"#888",    bg:"#88888814", icon:"?" },
  };

  const TYPE_LABELS = {
    title_tag:        "Title Tag Rewrite",
    meta_description: "Meta Description",
    missing_h1:       "H1 Added",
    missing_schema:   "Schema Injected",
    thin_content:     "Content Expanded",
    content_refresh:  "Content Refreshed",
    link_building:    "Backlink Acquired",
    cwv_fix:          "Core Web Vitals Fix",
    redirect_fix:     "Redirect Fixed",
    internal_link:    "Internal Links Added",
    alt_text:         "Image Alt Text",
  };

  const aov = data.aov || 0;

  // Summary stats for the timeline header
  const totalFixes    = proof.totalFixes   || 0;
  const totalWins     = proof.totalWins    || 0;
  const totalLeads    = proof.totalLeads   || 0;
  const totalRevenue  = proof.totalRevenue || null;
  const winRate       = proof.winRate      || null;

  // Score delta across the tracked period
  const scoresWithData = weeks.filter(w => w.score != null);
  const firstScore = scoresWithData[0]?.score;
  const latestScore = scoresWithData[scoresWithData.length - 1]?.score;
  const scoreDelta = (firstScore != null && latestScore != null) ? latestScore - firstScore : null;

  return (
    <div>
      {/* Timeline summary header */}
      <div style={{ background: dark ? "#1a1a1a" : "#f8f8f4", border:`1px solid ${bdr}`, borderRadius:12, padding:"16px 20px", marginBottom:20 }}>
        <div style={{ fontSize:13, fontWeight:800, color:txt, marginBottom:12 }}>
          📋 Proof of Work — What We Did & What It Achieved
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:10 }}>
          {[
            { label:"Fixes Shipped",        value: totalFixes,                                    color: B           },
            { label:"Confirmed Wins",        value: `${totalWins}${winRate != null ? ` (${winRate}%)` : ""}`, color:"#059669" },
            { label:"Leads Generated",       value: totalLeads,                                    color:"#0891B2"    },
            ...(totalRevenue != null && totalRevenue > 0 ? [{ label:"Revenue Attributed", value: fmt(totalRevenue), color:"#D97706" }] : []),
            ...(scoreDelta != null ? [{ label:"SEO Score Change", value: `${scoreDelta > 0 ? "+" : ""}${scoreDelta} pts`, color: scoreDelta > 0 ? "#059669" : "#DC2626" }] : []),
          ].map(({ label, value, color }) => (
            <div key={label} style={{ textAlign:"center", padding:"10px 8px", background:bg2, border:`1px solid ${bdr}`, borderRadius:8 }}>
              <div style={{ fontSize:18, fontWeight:800, color }}>{value}</div>
              <div style={{ fontSize:10, color:txt2, marginTop:2 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Score sparkline across weeks */}
      {scoresWithData.length > 1 && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"14px 16px", marginBottom:20 }}>
          <div style={{ fontSize:11, color:txt2, fontWeight:700, textTransform:"uppercase", letterSpacing:0.8, marginBottom:10 }}>SEO Score Trend</div>
          <div style={{ display:"flex", alignItems:"flex-end", gap:3, height:48 }}>
            {scoresWithData.map((w, i) => {
              const maxS = Math.max(...scoresWithData.map(s => s.score || 0), 100);
              const pct  = ((w.score || 0) / maxS) * 100;
              const col  = w.score >= 75 ? "#059669" : w.score >= 50 ? "#D97706" : "#DC2626";
              return (
                <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
                  <div style={{ width:"100%", height:`${pct}%`, minHeight:4, background:col, borderRadius:"3px 3px 0 0" }} title={`${w.weekLabel}: ${w.score}/100`} />
                  <div style={{ fontSize:7, color:txt2, whiteSpace:"nowrap" }}>{w.weekLabel}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Vertical timeline */}
      {fixes.length === 0 && milestones.length === 0 ? (
        <div style={{ textAlign:"center", padding:40, background:bg2, border:`1px solid ${bdr}`, borderRadius:12, color:txt2, fontSize:13 }}>
          <div style={{ fontSize:32, marginBottom:12 }}>🔬</div>
          <div style={{ fontWeight:700, color:txt, marginBottom:6 }}>No fixes tracked yet</div>
          <div>Run the pipeline and approve fixes — each one appears here with its outcome.</div>
        </div>
      ) : (
        <div style={{ position:"relative" }}>
          {/* Vertical line */}
          <div style={{ position:"absolute", left:19, top:0, bottom:0, width:2, background:bdr, borderRadius:1 }} />

          <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
            {/* Mix milestone markers between fixes for timeline feel */}
            {milestones.slice().reverse().map((m, mi) => {
              // Find fixes in this week
              const weekFixes = fixes.filter(f => f.pushedAt && f.pushedAt.startsWith(m.week));
              return (
                <div key={"m" + mi}>
                  {/* Week milestone marker */}
                  <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:8, paddingLeft:0 }}>
                    <div style={{ width:12, height:12, borderRadius:"50%", background: m.score != null ? (m.score >= 75 ? "#059669" : m.score >= 50 ? "#D97706" : "#DC2626") : bdr, border:`2px solid ${bg2}`, flexShrink:0, marginLeft:7, zIndex:1, position:"relative" }} />
                    <div style={{ fontSize:11, color:txt2, fontWeight:700 }}>
                      {m.weekLabel} <span style={{ fontWeight:400 }}>· {m.week}</span>
                      {m.score != null && (
                        <span style={{ marginLeft:8, color: m.score >= 75 ? "#059669" : m.score >= 50 ? "#D97706" : "#DC2626", fontWeight:800 }}>
                          Score {m.score}
                        </span>
                      )}
                      {m.leads > 0 && (
                        <span style={{ marginLeft:8, color:"#0891B2", fontWeight:700 }}>
                          {m.leads} lead{m.leads !== 1 ? "s" : ""}
                          {aov > 0 && m.revenue != null && m.revenue > 0 && (
                            <span style={{ color:"#D97706", marginLeft:4 }}>({currency + (m.revenue >= 1000 ? (m.revenue/1000).toFixed(1) + "K" : m.revenue)})</span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Fixes in this week */}
                  {weekFixes.map((f, fi) => {
                    const om = OUTCOME_META[f.outcome] || OUTCOME_META.null;
                    const typeLabel = TYPE_LABELS[f.type] || (f.type || "Fix").replace(/_/g, " ");
                    return (
                      <div key={f.id || fi} style={{ display:"flex", gap:12, marginBottom:10, paddingLeft:28, position:"relative" }}>
                        {/* Connector dot */}
                        <div style={{ position:"absolute", left:14, top:10, width:10, height:10, borderRadius:"50%", background:om.color, border:`2px solid ${bg2}`, zIndex:1 }} />
                        <div style={{ flex:1, background:bg2, border:`1px solid ${om.color}33`, borderLeft:`3px solid ${om.color}`, borderRadius:8, padding:"10px 14px" }}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8, marginBottom:4 }}>
                            <div style={{ fontSize:12, fontWeight:800, color:txt }}>{typeLabel}</div>
                            <span style={{ fontSize:10, fontWeight:700, color:om.color, background:om.bg, padding:"2px 8px", borderRadius:5, flexShrink:0, whiteSpace:"nowrap" }}>
                              {om.icon} {om.label}
                            </span>
                          </div>
                          {f.page && (
                            <div style={{ fontSize:11, color:txt2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:360, marginBottom:2 }}>
                              {f.page.replace(/^https?:\/\/[^/]+/, "") || f.page}
                            </div>
                          )}
                          {f.pushedAt && (
                            <div style={{ fontSize:10, color:txt2 }}>{new Date(f.pushedAt).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" })}</div>
                          )}
                          {f.isRetry && (
                            <div style={{ fontSize:10, color:"#D97706", marginTop:3 }}>↻ Retry attempt</div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Fixes with no date match */}
                  {mi === milestones.length - 1 && (() => {
                    const dateless = fixes.filter(f => !f.pushedAt || !milestones.some(mm => f.pushedAt.startsWith(mm.week)));
                    return dateless.map((f, fi) => {
                      const om = OUTCOME_META[f.outcome] || OUTCOME_META.null;
                      const typeLabel = TYPE_LABELS[f.type] || (f.type || "Fix").replace(/_/g, " ");
                      return (
                        <div key={"d" + fi} style={{ display:"flex", gap:12, marginBottom:10, paddingLeft:28, position:"relative" }}>
                          <div style={{ position:"absolute", left:14, top:10, width:10, height:10, borderRadius:"50%", background:om.color, border:`2px solid ${bg2}`, zIndex:1 }} />
                          <div style={{ flex:1, background:bg2, border:`1px solid ${om.color}33`, borderLeft:`3px solid ${om.color}`, borderRadius:8, padding:"10px 14px" }}>
                            <div style={{ display:"flex", justifyContent:"space-between", gap:8 }}>
                              <div style={{ fontSize:12, fontWeight:800, color:txt }}>{typeLabel}</div>
                              <span style={{ fontSize:10, fontWeight:700, color:om.color, background:om.bg, padding:"2px 8px", borderRadius:5, flexShrink:0 }}>
                                {om.icon} {om.label}
                              </span>
                            </div>
                            {f.page && <div style={{ fontSize:11, color:txt2, marginTop:2 }}>{f.page}</div>}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              );
            })}

            {/* If no milestones but fixes exist */}
            {milestones.length === 0 && fixes.map((f, fi) => {
              const om = OUTCOME_META[f.outcome] || OUTCOME_META.null;
              const typeLabel = TYPE_LABELS[f.type] || (f.type || "Fix").replace(/_/g, " ");
              return (
                <div key={f.id || fi} style={{ display:"flex", gap:12, marginBottom:10, paddingLeft:28, position:"relative" }}>
                  <div style={{ position:"absolute", left:14, top:10, width:10, height:10, borderRadius:"50%", background:om.color, border:`2px solid ${bg2}`, zIndex:1 }} />
                  <div style={{ flex:1, background:bg2, border:`1px solid ${om.color}33`, borderLeft:`3px solid ${om.color}`, borderRadius:8, padding:"10px 14px" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", gap:8 }}>
                      <div style={{ fontSize:12, fontWeight:800, color:txt }}>{typeLabel}</div>
                      <span style={{ fontSize:10, fontWeight:700, color:om.color, background:om.bg, padding:"2px 8px", borderRadius:5, flexShrink:0 }}>
                        {om.icon} {om.label}
                      </span>
                    </div>
                    {f.page && <div style={{ fontSize:11, color:txt2, marginTop:2 }}>{f.page}</div>}
                    {f.pushedAt && <div style={{ fontSize:10, color:txt2, marginTop:2 }}>{new Date(f.pushedAt).toLocaleDateString()}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ fontSize:10, color:txt2, marginTop:16, textAlign:"center" }}>
        Outcomes are verified 21 days after each fix via GSC data. "Confirmed Win" = ranking or CTR improved on the fixed page.
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color, bg2, bdr, txt, txt2 }) {
  return (
    <div style={{ background:bg2, border:`1px solid ${bdr}`, borderTop:`3px solid ${color}`, borderRadius:10, padding:"14px 16px" }}>
      <div style={{ fontSize:22, fontWeight:800, color }}>{value}</div>
      <div style={{ fontSize:11, color:txt2, marginTop:3 }}>{label}</div>
      {sub && <div style={{ fontSize:10, color:txt2, marginTop:2 }}>{sub}</div>}
    </div>
  );
}

function Row({ label, value, color, txt2 }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
      <span style={{ fontSize:11, color:txt2 }}>{label}</span>
      <span style={{ fontSize:12, fontWeight:700, color }}>{value}</span>
    </div>
  );
}
