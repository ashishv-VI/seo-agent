import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

export default function ControlRoom({ dark, clientId, clientName }) {
  const { user, API } = useAuth();
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");
  const [tab,       setTab]       = useState("overview");
  const [approving, setApproving] = useState(false);
  const [approved,  setApproved]  = useState(false);

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const B    = "#443DCB";

  async function getToken() { return user?.getIdToken?.() || ""; }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      const res   = await fetch(`${API}/api/control-room/${clientId}/control-room`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Failed to load"); setLoading(false); return; }
      setData(json);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  // Queue the CMO's nextAgents via the approval endpoint
  async function approveCMO() {
    if (!data?.cmo?.nextAgents?.length) return;
    setApproving(true);
    try {
      const token = await getToken();
      // Find the latest pending CMO queue decision to approve
      const qRes  = await fetch(`${API}/api/agents/${clientId}/cmo-decisions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const qData = await qRes.json();
      const pending = (qData.decisions || []).find(d => d.status === "pending");
      if (pending) {
        await fetch(`${API}/api/agents/${clientId}/cmo-decisions/${pending.id}`, {
          method:  "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ action: "approve" }),
        });
        setApproved(true);
      }
    } catch (_) {}
    setApproving(false);
  }

  useEffect(() => { if (clientId) load(); }, [clientId]);

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:300, color:txt2, fontSize:14 }}>
      Loading Control Room...
    </div>
  );
  if (error) return (
    <div style={{ padding:24, color:"#DC2626", background:"#DC262611", borderRadius:10, fontSize:13 }}>{error}</div>
  );
  if (!data) return null;

  const cmo = data.cmo;
  const hasCMO = !!cmo?.decision;

  const TABS = [
    { id:"overview",    label:"Overview"        },
    { id:"decision",    label:"Agent Decision"  },
    { id:"health",      label:"Site Health"     },
    { id:"suggestions", label:"AI Suggestions"  },
    { id:"beforeafter", label:"Before/After"    },
  ];

  return (
    <div style={{ background:bg, minHeight:"100%", padding:24 }}>

      {/* Header */}
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>
          Client Control Room
        </div>
        <div style={{ fontSize:22, fontWeight:800, color:txt, marginBottom:4 }}>
          {data.clientName || clientName}
        </div>
        <div style={{ fontSize:12, color:txt2 }}>{data.websiteUrl}</div>
        {data.kpis?.length > 0 && (
          <div style={{ display:"flex", gap:6, marginTop:8, flexWrap:"wrap" }}>
            {[].concat(data.kpis).map(k => (
              <span key={k} style={{ fontSize:11, padding:"3px 10px", borderRadius:10, background:B+"18", color:B, fontWeight:600 }}>
                {k === "Organic Traffic Growth" ? "📈" : k === "Lead Generation" ? "🎯" : k === "Online Sales / E-commerce" ? "🛒" : "📍"} {k}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── CMO Decision Banner — action-oriented: THIS → WHY → FIX → ASK ── */}
      {hasCMO && (
        <div style={{
          marginBottom: 20,
          background: dark ? "#1a1630" : "#f0efff",
          border:     `1px solid ${B}44`,
          borderLeft: `4px solid ${B}`,
          borderRadius: 12,
          padding: "18px 22px",
        }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:16 }}>
            <div style={{ flex:1, minWidth:0 }}>
              {/* Badge row */}
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                <span style={{ fontSize:10, fontWeight:800, color:"#fff", background:B, textTransform:"uppercase", letterSpacing:1, padding:"3px 8px", borderRadius:4 }}>
                  🧠 AI Agent Recommendation
                </span>
                {cmo.confidence != null && (
                  <span style={{ fontSize:10, color:txt2, fontWeight:600 }}>
                    {Math.round(cmo.confidence * 100)}% confidence
                  </span>
                )}
                {cmo.decidedAt && (
                  <span style={{ fontSize:10, color:txt2 }}>· {new Date(cmo.decidedAt).toLocaleDateString()}</span>
                )}
              </div>

              {/* WHAT to do — the headline action */}
              <div style={{ fontSize:16, fontWeight:800, color:txt, marginBottom:8, lineHeight:1.4 }}>
                → {cmo.decision}
              </div>

              {/* WHY it matters — the proof */}
              <div style={{ fontSize:12, color:txt2, lineHeight:1.65, marginBottom:12 }}>
                <span style={{ color:txt, fontWeight:700 }}>Why: </span>{cmo.reasoning}
              </div>

              {/* EXPECTED IMPACT — what changes if we do this */}
              {cmo.kpiImpact?.length > 0 && (
                <div style={{ marginBottom:12 }}>
                  <div style={{ fontSize:10, color:txt2, fontWeight:700, textTransform:"uppercase", letterSpacing:0.8, marginBottom:6 }}>Expected Impact</div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    {cmo.kpiImpact.map((k, i) => (
                      <div key={i} style={{ fontSize:11, padding:"5px 11px", borderRadius:8, background:"#05966918", border:"1px solid #05966933" }}>
                        <span style={{ color:"#059669", fontWeight:800 }}>{k.kpi}</span>
                        <span style={{ color:txt2 }}> → </span>
                        <span style={{ color:txt, fontWeight:700 }}>{k.expectedLift}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* HOW the agent will execute — transparency */}
              {cmo.nextAgents?.length > 0 && (
                <div style={{ fontSize:11, color:txt2, display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                  <span style={{ fontWeight:700 }}>The agent will run:</span>
                  {cmo.nextAgents.map((a, i) => (
                    <span key={a} style={{ fontSize:11, padding:"2px 9px", borderRadius:6, background:B+"18", color:B, fontWeight:700 }}>
                      {a}{i < cmo.nextAgents.length - 1 ? " →" : ""}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* THE ASK — one-click approve */}
            {cmo.nextAgents?.length > 0 && (
              <div style={{ flexShrink:0, display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
                {approved ? (
                  <div style={{ fontSize:12, color:"#059669", fontWeight:800, padding:"12px 18px", background:"#05966914", border:"1px solid #05966933", borderRadius:10 }}>
                    ✓ Executing
                  </div>
                ) : (
                  <>
                    <button onClick={approveCMO} disabled={approving} style={{
                      padding:"12px 22px", borderRadius:10, border:"none", background:B,
                      color:"#fff", fontSize:13, fontWeight:800, cursor:approving?"not-allowed":"pointer",
                      opacity:approving?0.7:1, whiteSpace:"nowrap",
                      boxShadow: `0 2px 8px ${B}44`,
                    }}>
                      {approving ? "Queuing…" : "✓ Approve & Execute"}
                    </button>
                    <div style={{ fontSize:9, color:txt2, textAlign:"center" }}>
                      or review in Decision tab
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Score tiles */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:10, marginBottom:24 }}>
        <ScoreTile label="SEO Score"    value={data.siteHealth.seoScore}    unit="/100"   color={scoreColor(data.siteHealth.seoScore)}    bg2={bg2} bdr={bdr} txt={txt} txt2={txt2} />
        <ScoreTile label="Health Score" value={data.siteHealth.healthScore} unit="/100"   color={scoreColor(data.siteHealth.healthScore)} bg2={bg2} bdr={bdr} txt={txt} txt2={txt2} />
        <ScoreTile label="P1 Issues"    value={data.siteHealth.p1Issues}    unit=" critical" color={data.siteHealth.p1Issues > 0 ? "#DC2626" : "#059669"} bg2={bg2} bdr={bdr} txt={txt} txt2={txt2} />
        <ScoreTile label="Pages Audited" value={data.siteHealth.pagesAudited} unit=" pages" color={B} bg2={bg2} bdr={bdr} txt={txt} txt2={txt2} />
        {data.thisWeek.hasData && <>
          <ScoreTile label="Clicks (GSC)"       value={data.thisWeek.totalClicks}      unit=""  color={B}        bg2={bg2} bdr={bdr} txt={txt} txt2={txt2} />
          <ScoreTile label="Impressions"        value={data.thisWeek.totalImpressions} unit=""  color="#0891B2"  bg2={bg2} bdr={bdr} txt={txt} txt2={txt2} />
          <ScoreTile label="Avg Position (GSC)" value={data.thisWeek.avgPosition}      unit=""  color="#059669"  bg2={bg2} bdr={bdr} txt={txt} txt2={txt2} />
          <ScoreTile label="Avg CTR"            value={data.thisWeek.avgCtr}           unit=""  color="#D97706"  bg2={bg2} bdr={bdr} txt={txt} txt2={txt2} />
        </>}
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", gap:4, marginBottom:20, borderBottom:`1px solid ${bdr}`, flexWrap:"wrap" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding:"8px 16px", borderRadius:"8px 8px 0 0", border:"none", cursor:"pointer", fontSize:13, fontWeight:600,
              background: tab===t.id ? bg2 : "transparent",
              color:      tab===t.id ? (t.id === "decision" ? B : B) : txt2,
              borderBottom: tab===t.id ? `2px solid ${B}` : "2px solid transparent",
            }}>
            {t.id === "decision" && hasCMO ? "🧠 " : ""}{t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview"    && <OverviewTab    data={data} dark={dark} bg2={bg2} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2} B={B} />}
      {tab === "decision"    && <DecisionTab    data={data} dark={dark} bg2={bg2} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2} B={B}
                                  approving={approving} approved={approved} onApprove={approveCMO} />}
      {tab === "health"      && <HealthTab      data={data} dark={dark} bg2={bg2} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2} B={B} />}
      {tab === "suggestions" && <SuggestionsTab data={data} dark={dark} bg2={bg2} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2} B={B} />}
      {tab === "beforeafter" && <BeforeAfterTab data={data} dark={dark} bg2={bg2} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2} B={B} />}
    </div>
  );
}

// ── Score tile ────────────────────────────────────
function ScoreTile({ label, value, unit, color, bg2, bdr, txt, txt2 }) {
  return (
    <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"14px 16px", borderTop:`3px solid ${color}` }}>
      <div style={{ fontSize:22, fontWeight:800, color }}>{value ?? "—"}{value != null ? unit : ""}</div>
      <div style={{ fontSize:11, color:txt2, marginTop:3 }}>{label}</div>
    </div>
  );
}

function scoreColor(v) {
  if (v == null) return "#666";
  return v >= 75 ? "#059669" : v >= 50 ? "#D97706" : "#DC2626";
}

// ── Decision tab — full CMO analysis ─────────────
function DecisionTab({ data, bg2, bg3, bdr, txt, txt2, B, approving, approved, onApprove }) {
  const cmo = data.cmo;
  if (!cmo) {
    return (
      <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:40, textAlign:"center" }}>
        <div style={{ fontSize:32, marginBottom:12 }}>🧠</div>
        <div style={{ fontSize:14, fontWeight:700, color:txt, marginBottom:6 }}>No CMO decision yet</div>
        <div style={{ fontSize:12, color:txt2 }}>Run the full pipeline to get the CMO Agent's strategic recommendation.</div>
      </div>
    );
  }

  const confColor = cmo.confidence >= 0.8 ? "#059669" : cmo.confidence >= 0.6 ? "#D97706" : "#DC2626";
  const signals   = cmo.signals || {};

  const AGENT_NAMES = { A2:"Re-audit", A5:"Title/Meta Rewrite", A6:"On-Page Fix", A7:"Speed Fix", A11:"Link Building", A14:"Content Creation" };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

      {/* Main decision card */}
      <div style={{ background:bg2, border:`1px solid ${B}44`, borderRadius:12, padding:24 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
          <div>
            <div style={{ fontSize:11, color:B, fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>
              Strategic Focus
            </div>
            <div style={{ fontSize:18, fontWeight:800, color:txt, lineHeight:1.4 }}>{cmo.decision}</div>
          </div>
          <div style={{ textAlign:"center", padding:"10px 16px", background:confColor+"14", border:`1px solid ${confColor}33`, borderRadius:10, flexShrink:0 }}>
            <div style={{ fontSize:22, fontWeight:800, color:confColor }}>{Math.round((cmo.confidence || 0.7) * 100)}%</div>
            <div style={{ fontSize:10, color:txt2 }}>Confidence</div>
          </div>
        </div>

        <div style={{ fontSize:13, color:txt2, lineHeight:1.7, marginBottom:16, padding:"12px 16px", background:bg3, borderRadius:8 }}>
          {cmo.reasoning}
        </div>

        {/* KPI Impact */}
        {cmo.kpiImpact?.length > 0 && (
          <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:0.5 }}>Expected Impact</div>
            {cmo.kpiImpact.map((k, i) => (
              <div key={i} style={{ display:"flex", gap:12, padding:"10px 14px", background:"#05966910", border:"1px solid #05966930", borderRadius:8, alignItems:"center" }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:"#059669" }}>{k.expectedLift}</div>
                  <div style={{ fontSize:11, color:txt2 }}>{k.kpi} · {k.mechanism}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Next agents to run */}
        {cmo.nextAgents?.length > 0 && (
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:0.5, marginBottom:10 }}>Agents to Execute</div>
            <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
              {cmo.nextAgents.map(a => (
                <div key={a} style={{ padding:"10px 16px", background:B+"14", border:`1px solid ${B}33`, borderRadius:10 }}>
                  <div style={{ fontSize:14, fontWeight:800, color:B }}>{a}</div>
                  <div style={{ fontSize:11, color:txt2 }}>{AGENT_NAMES[a] || a}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          {approved ? (
            <div style={{ fontSize:13, color:"#059669", fontWeight:700, padding:"10px 18px", background:"#05966914", border:"1px solid #05966930", borderRadius:8 }}>
              ✓ Agents queued — running in background
            </div>
          ) : (
            <button onClick={onApprove} disabled={approving || !cmo.nextAgents?.length}
              style={{ padding:"11px 24px", borderRadius:8, border:"none", background:B, color:"#fff", fontSize:13, fontWeight:700,
                cursor: (approving || !cmo.nextAgents?.length) ? "not-allowed" : "pointer",
                opacity: (approving || !cmo.nextAgents?.length) ? 0.7 : 1 }}>
              {approving ? "Queuing..." : "Approve & Execute Agents"}
            </button>
          )}
          {cmo.decidedAt && (
            <div style={{ fontSize:11, color:txt2 }}>
              Decided {new Date(cmo.decidedAt).toLocaleString()}
            </div>
          )}
        </div>
      </div>

      {/* Signal breakdown */}
      <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20 }}>
        <div style={{ fontSize:12, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:14 }}>
          Signal Breakdown (why this decision was made)
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:10 }}>
          {[
            { label:"Critical P1 Issues",         value: signals.p1IssuesCount ?? "—",  flag: signals.hasCriticalIssues,  red: true  },
            { label:"Health Score",                value: signals.healthPoor ? "POOR" : "OK",  flag: signals.healthPoor, red: true },
            { label:"Keywords on Page 2",          value: signals.page2Count ?? "—",     flag: signals.hasPage2Kws,        red: false },
            { label:"Ranking Drops",               value: signals.droppingKws ?? "—",    flag: signals.hasDrops,           red: true  },
            { label:"CTR vs Expected",             value: signals.ctrLow ? "LOW" : "OK", flag: signals.ctrLow,             red: true  },
            { label:"Content Gaps",                value: signals.contentGaps ?? "—",    flag: signals.hasContentGaps,     red: false },
          ].map(sig => (
            <div key={sig.label} style={{ padding:"10px 14px", background:bg3, borderRadius:8 }}>
              <div style={{ fontSize:10, color:txt2, marginBottom:3 }}>{sig.label}</div>
              <div style={{ fontSize:14, fontWeight:700, color: sig.flag ? (sig.red ? "#DC2626" : "#D97706") : "#059669" }}>
                {String(sig.value)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Overview tab ──────────────────────────────────
function OverviewTab({ data, bg2, bg3, bdr, txt, txt2, B }) {
  const gsc   = data.thisWeek;
  const leads = data.leads || {};

  function DeltaBadge({ delta, invert }) {
    if (delta == null) return null;
    // For position: lower is better, so invert the color logic
    const positive = invert ? delta < 0 : delta > 0;
    const color = positive ? "#059669" : delta === 0 ? txt2 : "#DC2626";
    const sign  = delta > 0 ? "+" : "";
    return (
      <span style={{ fontSize:10, fontWeight:700, color, marginLeft:6, padding:"1px 6px", background: color+"14", borderRadius:5 }}>
        {sign}{delta}%
      </span>
    );
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>

        {/* This Week — GSC with deltas */}
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20 }}>
          <div style={{ fontSize:12, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:14 }}>📈 This Week — Search Performance</div>
          {!gsc.hasData ? (
            <div style={{ color:txt2, fontSize:13 }}>No GSC data yet — connect Google Search Console or run A9 Report.</div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {gsc.topKeyword && (
                <div style={{ background:bg3, borderRadius:8, padding:"10px 14px" }}>
                  <div style={{ fontSize:10, color:txt2, marginBottom:3 }}>TOP KEYWORD</div>
                  <div style={{ fontSize:14, fontWeight:700, color:txt }}>{gsc.topKeyword.keyword || gsc.topKeyword.query}</div>
                  <div style={{ fontSize:12, color:txt2, marginTop:2 }}>
                    {gsc.topKeyword.clicks} clicks · pos {gsc.topKeyword.position?.toFixed(1) || gsc.topKeyword.avgPosition?.toFixed(1)}
                  </div>
                </div>
              )}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                {[
                  { l:"Clicks",       v:gsc.totalClicks,      delta:gsc.deltaClicks },
                  { l:"Impressions",  v:gsc.totalImpressions, delta:gsc.deltaImpressions },
                  { l:"Avg CTR",      v:gsc.avgCtr,            delta:null },
                  { l:"Avg Position", v:gsc.avgPosition,       delta:gsc.deltaPosition, invert:true, isDelta:true },
                ].map(({ l, v, delta, invert, isDelta }) => (
                  <div key={l} style={{ background:bg3, borderRadius:8, padding:"8px 12px" }}>
                    <div style={{ display:"flex", alignItems:"center", flexWrap:"wrap" }}>
                      <span style={{ fontSize:17, fontWeight:800, color:txt }}>{v ?? "—"}</span>
                      {isDelta && delta != null ? (
                        <span style={{ fontSize:10, fontWeight:700, color: delta < 0 ? "#059669" : "#DC2626", marginLeft:6 }}>
                          {delta > 0 ? "+" : ""}{delta}
                        </span>
                      ) : (
                        <DeltaBadge delta={delta} invert={invert} />
                      )}
                    </div>
                    <div style={{ fontSize:10, color:txt2 }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Leads — form conversions */}
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20 }}>
          <div style={{ fontSize:12, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:14 }}>🎯 Leads (Last 30 Days)</div>
          {!leads.hasData ? (
            <div style={{ color:txt2, fontSize:13 }}>
              No conversions tracked yet. Install the tracking snippet (Attribution tab) to capture form fills.
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                <div style={{ background:bg3, borderRadius:8, padding:"10px 14px" }}>
                  <div style={{ fontSize:22, fontWeight:800, color:"#059669" }}>{leads.total30d}</div>
                  <div style={{ fontSize:10, color:txt2 }}>Leads this month</div>
                </div>
                <div style={{ background:bg3, borderRadius:8, padding:"10px 14px" }}>
                  <div style={{ fontSize:22, fontWeight:800, color:B }}>{leads.totalAllTime}</div>
                  <div style={{ fontSize:10, color:txt2 }}>All-time leads</div>
                </div>
              </div>
              {leads.estimatedRevenue30d != null && leads.estimatedRevenue30d > 0 && (
                <div style={{ background:"#05966911", border:"1px solid #05966933", borderRadius:8, padding:"10px 14px" }}>
                  <div style={{ fontSize:10, color:"#059669", marginBottom:3, fontWeight:700 }}>ESTIMATED REVENUE (30D)</div>
                  <div style={{ fontSize:20, fontWeight:800, color:"#059669" }}>₹{leads.estimatedRevenue30d.toLocaleString()}</div>
                  <div style={{ fontSize:10, color:txt2, marginTop:2 }}>{leads.total30d} leads × ₹{leads.aov.toLocaleString()} avg order value</div>
                </div>
              )}
              {leads.keywordLeadBreakdown?.length > 0 && (
                <div>
                  <div style={{ fontSize:10, color:txt2, marginBottom:6, textTransform:"uppercase", letterSpacing:0.5 }}>Keywords → Leads → Revenue</div>
                  {leads.keywordLeadBreakdown.map((k, i) => (
                    <div key={i} style={{ padding:"8px 10px", background:bg3, borderRadius:6, marginBottom:4 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                        <span style={{ fontSize:12, fontWeight:700, color:txt, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{k.keyword}</span>
                        <span style={{ fontSize:11, color:"#059669", fontWeight:700, marginLeft:8 }}>{k.leads} lead{k.leads !== 1 ? "s" : ""}</span>
                      </div>
                      <div style={{ height:3, background:bdr, borderRadius:2, overflow:"hidden", marginBottom:3 }}>
                        <div style={{ height:"100%", width:`${k.percentOfLeads}%`, background:"#059669" }} />
                      </div>
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:txt2 }}>
                        <span>{k.percentOfLeads}% of leads</span>
                        {k.estimatedRevenue != null && <span style={{ color:"#059669", fontWeight:700 }}>₹{k.estimatedRevenue.toLocaleString()}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {leads.recentConversions?.length > 0 && (
                <div>
                  <div style={{ fontSize:10, color:txt2, marginBottom:6, textTransform:"uppercase", letterSpacing:0.5 }}>Recent</div>
                  {leads.recentConversions.slice(0, 3).map((c, i) => (
                    <div key={i} style={{ fontSize:11, padding:"5px 8px", background:bg3, borderRadius:6, marginBottom:4, display:"flex", justifyContent:"space-between" }}>
                      <span style={{ color:txt, fontWeight:600 }}>{c.keyword}</span>
                      <span style={{ color:txt2 }}>{c.source} · {c.date ? new Date(c.date).toLocaleDateString() : "—"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* AI Suggestions preview */}
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20 }}>
          <div style={{ fontSize:12, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:14 }}>🤖 Top AI Suggestions</div>
          {data.suggestions.length === 0 ? (
            <div style={{ color:txt2, fontSize:13 }}>Run the pipeline to get AI-powered suggestions.</div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {data.suggestions.slice(0, 3).map((s, i) => (
                <div key={i} style={{ background:bg3, borderRadius:8, padding:"10px 14px" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
                    <span style={{ fontSize:10, fontWeight:700, padding:"2px 6px", borderRadius:6,
                      background: s.priority==="high" ? "#DC262618" : "#D9770618",
                      color:      s.priority==="high" ? "#DC2626"   : "#D97706" }}>
                      {s.priority === "high" ? "HIGH" : "MED"}
                    </span>
                    <span style={{ fontSize:12, fontWeight:600, color:txt }}>{s.action}</span>
                  </div>
                  {s.expectedOutcome && <div style={{ fontSize:11, color:"#0891B2" }}>→ {s.expectedOutcome}</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Before/After snapshot */}
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20 }}>
          <div style={{ fontSize:12, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:14 }}>📊 Score History</div>
          {data.beforeAfter.scoreHistory?.length > 0 ? (
            <MiniChart scores={data.beforeAfter.scoreHistory} B={B} txt={txt} txt2={txt2} />
          ) : (
            <div style={{ color:txt2, fontSize:13 }}>No score history yet — run the pipeline to start tracking.</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Health tab ────────────────────────────────────
function HealthTab({ data, bg2, bg3, bdr, txt, txt2, B }) {
  const h = data.siteHealth;
  const issues = [
    { level:"P1", count: h.p1Issues, color:"#DC2626", label:"Critical — blocks rankings" },
    { level:"P2", count: h.p2Issues, color:"#D97706", label:"Warning — hurts rankings"   },
    { level:"P3", count: h.p3Issues, color:"#6B7280", label:"Minor improvements"         },
  ];
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
        {issues.map(is => (
          <div key={is.level} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, textAlign:"center", borderTop:`3px solid ${is.color}` }}>
            <div style={{ fontSize:36, fontWeight:800, color:is.color }}>{is.count}</div>
            <div style={{ fontSize:13, fontWeight:700, color:txt, marginTop:4 }}>{is.level} Issues</div>
            <div style={{ fontSize:11, color:txt2, marginTop:4 }}>{is.label}</div>
          </div>
        ))}
      </div>
      <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20 }}>
        <div style={{ fontSize:12, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:14 }}>Audit Overview</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
          {[
            ["Pages Audited",  h.pagesAudited || "—"],
            ["SEO Score",      h.seoScore != null ? h.seoScore + "/100" : "—"],
            ["Health Score",   h.healthScore != null ? h.healthScore + "/100" : "—"],
            ["Last Audit",     h.lastAuditAt ? new Date(h.lastAuditAt).toLocaleDateString() : "Never"],
          ].map(([l, v]) => (
            <div key={l} style={{ background:bg3, borderRadius:8, padding:"10px 14px" }}>
              <div style={{ fontSize:10, color:txt2, marginBottom:2 }}>{l}</div>
              <div style={{ fontSize:15, fontWeight:700, color:txt }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Suggestions tab ───────────────────────────────
function SuggestionsTab({ data, bg2, bg3, bdr, txt, txt2, B }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      {data.suggestions.length === 0 ? (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:40, textAlign:"center", color:txt2 }}>
          Run the full pipeline to get AI-powered recommendations.
        </div>
      ) : (
        data.suggestions.map((s, i) => (
          <div key={i} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20 }}>
            <div style={{ display:"flex", alignItems:"flex-start", gap:12 }}>
              <div style={{ width:32, height:32, borderRadius:"50%", background: s.priority==="high" ? "#DC262618" : "#443DCB18",
                color: s.priority==="high" ? "#DC2626" : B, fontSize:14, fontWeight:800,
                display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                {s.rank || i+1}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                  <span style={{ fontSize:13, fontWeight:700, color:txt }}>{s.action}</span>
                  <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:6,
                    background: s.priority==="high" ? "#DC262618" : "#D9770618",
                    color:      s.priority==="high" ? "#DC2626"   : "#D97706" }}>
                    {s.priority?.toUpperCase()}
                  </span>
                </div>
                {s.why && <div style={{ fontSize:12, color:txt2, marginBottom:s.expectedOutcome?4:0 }}>{s.why}</div>}
                {s.expectedOutcome && <div style={{ fontSize:12, color:"#0891B2" }}>→ Expected: {s.expectedOutcome}</div>}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ── Before/After tab ─────────────────────────────
function BeforeAfterTab({ data, bg2, bg3, bdr, txt, txt2, B }) {
  const ba = data.beforeAfter;
  if (!ba.hasBaseline) {
    return (
      <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:40, textAlign:"center" }}>
        <div style={{ fontSize:32, marginBottom:12 }}>📸</div>
        <div style={{ fontSize:14, fontWeight:700, color:txt, marginBottom:6 }}>No baseline yet</div>
        <div style={{ fontSize:12, color:txt2 }}>A baseline is saved automatically when a client is added. Run the pipeline to record Day 1 scores.</div>
      </div>
    );
  }

  const deltaColor = d => d == null ? txt2 : d > 0 ? "#059669" : d < 0 ? "#DC2626" : txt2;
  const deltaSign  = d => d == null ? "—" : d > 0 ? `+${d}` : String(d);

  const rows = [
    { label:"SEO Score",    before: ba.before.seoScore,    now: ba.now.seoScore,    delta: ba.delta.seoScore,    unit:"/100" },
    { label:"Health Score", before: ba.before.healthScore, now: ba.now.healthScore, delta: ba.delta.healthScore, unit:"/100" },
    { label:"Keywords Mapped", before: ba.before.keywordsRanking, now: ba.now.keywordsRanking,
      delta: ba.now.keywordsRanking != null && ba.before.keywordsRanking != null ? ba.now.keywordsRanking - ba.before.keywordsRanking : null, unit:"" },
  ];

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20 }}>
        <div style={{ fontSize:12, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>Baseline</div>
        <div style={{ fontSize:11, color:txt2, marginBottom:16 }}>
          Day 1: {ba.capturedAt ? new Date(ba.capturedAt).toLocaleDateString() : "—"}
          {ba.firstPipelineAt && ` · First pipeline: ${new Date(ba.firstPipelineAt).toLocaleDateString()}`}
        </div>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr>
              {["Metric","Day 1","Now","Change"].map(h => (
                <th key={h} style={{ padding:"8px 12px", textAlign:"left", fontSize:11, fontWeight:700, color:txt2, borderBottom:`1px solid ${bdr}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label}>
                <td style={{ padding:"10px 12px", fontSize:13, fontWeight:600, color:txt, borderBottom:`1px solid ${bdr}` }}>{r.label}</td>
                <td style={{ padding:"10px 12px", fontSize:13, color:txt2, borderBottom:`1px solid ${bdr}` }}>{r.before != null ? r.before + r.unit : "—"}</td>
                <td style={{ padding:"10px 12px", fontSize:13, fontWeight:700, color:txt, borderBottom:`1px solid ${bdr}` }}>{r.now != null ? r.now + r.unit : "—"}</td>
                <td style={{ padding:"10px 12px", fontSize:13, fontWeight:700, color:deltaColor(r.delta), borderBottom:`1px solid ${bdr}` }}>{deltaSign(r.delta)}{r.delta != null ? r.unit : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {ba.scoreHistory?.length > 0 && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20 }}>
          <div style={{ fontSize:12, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:14 }}>Score Trend</div>
          <MiniChart scores={ba.scoreHistory} B={B} txt={txt} txt2={txt2} />
        </div>
      )}
    </div>
  );
}

// ── Mini score chart (pure CSS/div bars) ─────────
function MiniChart({ scores, B, txt, txt2 }) {
  if (!scores?.length) return null;
  const max    = Math.max(...scores.map(s => s.overall || 0), 100);
  const recent = scores.slice(-12);
  return (
    <div style={{ display:"flex", alignItems:"flex-end", gap:4, height:80 }}>
      {recent.map((s, i) => {
        const pct = ((s.overall || 0) / max) * 100;
        const color = s.overall >= 75 ? "#059669" : s.overall >= 50 ? "#D97706" : "#DC2626";
        return (
          <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
            <div style={{ width:"100%", height:`${pct}%`, minHeight:4, background:color, borderRadius:"3px 3px 0 0", transition:"height 0.3s" }} title={`${s.overall}/100 — ${s.date || ""}`} />
            <div style={{ fontSize:8, color:txt2, transform:"rotate(-45deg)", transformOrigin:"top center", whiteSpace:"nowrap" }}>
              {s.date ? s.date.slice(5) : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}
