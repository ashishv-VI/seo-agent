import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import ApprovalQueue from "./ApprovalQueue";
import AlertCenter from "./AlertCenter";

const ALL_AGENTS = [
  { id:"A1", label:"Client Brief",       icon:"📋", phase:1 },
  { id:"A2", label:"Technical Audit",    icon:"🏥", phase:1 },
  { id:"A3", label:"Keyword Research",   icon:"🔍", phase:2 },
  { id:"A4", label:"Competitor Intel",   icon:"🕵️", phase:2 },
  { id:"A5", label:"Content",            icon:"✍️", phase:3 },
  { id:"A6", label:"On-Page & Tags",     icon:"🏷️", phase:3 },
  { id:"A7", label:"Technical/CWV",      icon:"⚡", phase:3 },
  { id:"A8", label:"GEO & Off-Page",     icon:"🌍", phase:3 },
  { id:"A9", label:"Reports",            icon:"📊", phase:4 },
];

export default function AgentPipeline({ dark, clientId, onBack }) {
  const { user, API, googleToken } = useAuth();
  const [client,   setClient]   = useState(null);
  const [state,    setState]    = useState({});
  const [pipeline, setPipeline] = useState({});
  const [loading,  setLoading]  = useState(true);
  const [running,  setRunning]  = useState(null);
  const [error,    setError]    = useState("");
  const [activeTab, setActiveTab] = useState("pipeline");
  const [expandedAgent, setExpandedAgent] = useState(null);
  const [alertCount,    setAlertCount]    = useState(0);

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const txt3 = dark ? "#444"    : "#bbb";

  async function getToken() { return user?.getIdToken?.() || ""; }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      const [clientRes, pipelineRes, alertsRes] = await Promise.all([
        fetch(`${API}/api/clients/${clientId}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/api/agents/${clientId}/pipeline`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/api/agents/${clientId}/alerts`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const clientData   = await clientRes.json();
      const pipelineData = await pipelineRes.json();
      const alertsData   = await alertsRes.json();
      if (!clientRes.ok)   throw new Error(clientData.error || "Failed to load client");
      setClient(clientData.client);
      setState(clientData.state || {});
      setPipeline(pipelineData.pipeline || {});
      setAlertCount((alertsData.alerts || []).filter(a => !a.resolved).length);
    } catch (e) { setError(e.message || "Failed to load pipeline"); }
    setLoading(false);
  }

  useEffect(() => { load(); }, [clientId]);

  async function signOff() {
    setRunning("signoff"); setError("");
    const token = await getToken();
    const res   = await fetch(`${API}/api/clients/${clientId}/signoff`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) setError(data.error);
    else { await load(); setExpandedAgent("A2"); }
    setRunning(null);
  }

  async function runAudit() {
    setRunning("A2"); setError("");
    const token = await getToken();
    const res   = await fetch(`${API}/api/clients/${clientId}/audit`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) setError(data.error || "Audit failed");
    else { await load(); setExpandedAgent("A3"); }
    setRunning(null);
  }

  async function runAgent(agentId) {
    setRunning(agentId); setError("");
    const token = await getToken();
    let url, body;
    if (agentId === "A9") {
      url  = `${API}/api/agents/${clientId}/A9/report`;
      body = JSON.stringify({ gscToken: googleToken || null });
    } else {
      url  = `${API}/api/agents/${clientId}/${agentId}/run`;
      body = "{}";
    }
    const res  = await fetch(url, { method:"POST", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}` }, body });
    const data = await res.json();
    if (!res.ok) setError(data.error || `${agentId} failed`);
    else { await load(); }
    setRunning(null);
  }

  const agentStatus = (id) => client?.agents?.[id] || "pending";
  const isComplete  = (id) => ["complete","signed_off"].includes(agentStatus(id));
  const canRun      = (id) => pipeline[id]?.canRun && !running;

  const statusColor = s => ({
    complete:"#059669", signed_off:"#059669", running:"#D97706",
    pending:txt3, failed:"#DC2626", incomplete:"#D97706", updated:"#0891B2",
  }[s] || txt3);

  const statusIcon = s => ({
    complete:"✅", signed_off:"✅", running:"⏳", pending:"⬜",
    failed:"❌", incomplete:"⚠️", updated:"🔄",
  }[s] || "⬜");

  const s = {
    wrap:  { flex:1, overflowY:"auto", padding:24, background:bg },
    card:  { background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:12 },
    tab:   (a) => ({ padding:"6px 16px", borderRadius:20, fontSize:12, cursor:"pointer", fontWeight:a?600:400, background:a?"#7C3AED22":"transparent", color:a?"#A78BFA":txt2, border:`1px solid ${a?"#7C3AED44":bdr}` }),
    btn:   (c="#7C3AED", dis=false) => ({ padding:"8px 18px", borderRadius:8, border:"none", background:dis?bdr:c, color:dis?txt3:"#fff", fontWeight:600, fontSize:12, cursor:dis?"not-allowed":"pointer" }),
    agentRow: (active) => ({ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 16px", borderRadius:10, marginBottom:8, background:active?`#7C3AED11`:bg3, border:`1px solid ${active?"#7C3AED44":bdr}`, cursor:"pointer" }),
  };

  if (loading) return <div style={{...s.wrap, display:"flex", alignItems:"center", justifyContent:"center", color:txt3}}>Loading pipeline...</div>;

  const brief       = state.A1_brief  || {};
  const briefDone   = brief.signedOff === true || agentStatus("A1") === "signed_off";

  // Count pending approvals
  const approvalCount = Object.values(state).filter(v => v?.approvalItemIds?.length > 0).reduce((a,v) => a + (v.approvalItemIds?.length || 0), 0);

  return (
    <div style={s.wrap}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <button onClick={onBack} style={{ background:"none", border:`1px solid ${bdr}`, color:txt2, cursor:"pointer", borderRadius:8, padding:"6px 12px", fontSize:12 }}>← Back</button>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:16, fontWeight:700, color:txt }}>{client?.name}</div>
          <div style={{ fontSize:11, color:txt2 }}>{client?.website}</div>
        </div>
        {running && <div style={{ fontSize:12, color:"#D97706" }}>⏳ {running} running...</div>}
      </div>

      {error && <div style={{ padding:"10px 14px", borderRadius:8, background:"#DC262611", color:"#DC2626", fontSize:12, marginBottom:14 }}>{error}<button onClick={()=>setError("")} style={{ marginLeft:10, background:"none", border:"none", color:"#DC2626", cursor:"pointer" }}>×</button></div>}

      {/* Tabs */}
      <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" }}>
        {(isComplete("A2") || isComplete("A3")) && <div style={{...s.tab(activeTab==="actionplan"), background: activeTab==="actionplan"?"#059669":"transparent", color: activeTab==="actionplan"?"#fff":txt2, border:`1px solid ${activeTab==="actionplan"?"#059669":bdr}`}} onClick={()=>setActiveTab("actionplan")}>🎯 Action Plan</div>}
        <div style={s.tab(activeTab==="pipeline")} onClick={()=>setActiveTab("pipeline")}>🔗 Pipeline</div>
        <div style={s.tab(activeTab==="approvals")} onClick={()=>setActiveTab("approvals")}>
          ✅ Approvals {approvalCount > 0 && <span style={{ marginLeft:4, background:"#D97706", color:"#fff", borderRadius:10, fontSize:9, padding:"1px 5px" }}>{approvalCount}</span>}
        </div>
        <div style={s.tab(activeTab==="alerts")} onClick={()=>setActiveTab("alerts")}>
          🚨 Alerts {alertCount > 0 && <span style={{ marginLeft:4, background:"#DC2626", color:"#fff", borderRadius:10, fontSize:9, padding:"1px 5px" }}>{alertCount}</span>}
        </div>
        {isComplete("A2") && <div style={s.tab(activeTab==="audit")} onClick={()=>setActiveTab("audit")}>🏥 Audit</div>}
        {isComplete("A3") && <div style={s.tab(activeTab==="keywords")} onClick={()=>setActiveTab("keywords")}>🔍 Keywords</div>}
        {isComplete("A4") && <div style={s.tab(activeTab==="competitor")} onClick={()=>setActiveTab("competitor")}>🕵️ Competitor</div>}
        {isComplete("A6") && <div style={s.tab(activeTab==="onpage")} onClick={()=>setActiveTab("onpage")}>🏷️ On-Page</div>}
        {isComplete("A7") && <div style={s.tab(activeTab==="technical")} onClick={()=>setActiveTab("technical")}>⚡ CWV</div>}
        {isComplete("A8") && <div style={s.tab(activeTab==="geo")} onClick={()=>setActiveTab("geo")}>🌍 GEO</div>}
      </div>

      {/* Pipeline Tab */}
      {activeTab==="pipeline" && (
        <>
          {/* Visual Pipeline */}
          <div style={s.card}>
            <div style={{ fontSize:12, fontWeight:600, color:txt, marginBottom:12 }}>Agent Status Overview</div>
            <div style={{ display:"flex", alignItems:"center", overflowX:"auto", gap:0, paddingBottom:4 }}>
              {ALL_AGENTS.map((ag, i) => {
                const status = agentStatus(ag.id);
                const color  = statusColor(status);
                return (
                  <div key={ag.id} style={{ display:"flex", alignItems:"center" }}>
                    <div style={{ textAlign:"center", minWidth:72 }}>
                      <div style={{ fontSize:18 }}>{ag.icon}</div>
                      <div style={{ fontSize:9, fontWeight:700, color, marginTop:2 }}>{ag.id}</div>
                      <div style={{ fontSize:8, color:txt2, maxWidth:68, lineHeight:1.3 }}>{ag.label}</div>
                      <div style={{ fontSize:11, marginTop:2 }}>{statusIcon(status)}</div>
                    </div>
                    {i < ALL_AGENTS.length-1 && <div style={{ width:20, height:2, background:isComplete(ag.id)?"#059669":bdr, flexShrink:0, marginBottom:10 }} />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Agent Rows */}
          {ALL_AGENTS.map(ag => {
            const status  = agentStatus(ag.id);
            const pipeInfo = pipeline[ag.id] || {};
            const isOpen  = expandedAgent === ag.id;
            const stateData = state[`${ag.id}_${getStateSuffix(ag.id)}`];

            return (
              <div key={ag.id}>
                <div style={s.agentRow(isOpen)} onClick={() => setExpandedAgent(isOpen ? null : ag.id)}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ fontSize:18 }}>{ag.icon}</span>
                    <div>
                      <div style={{ fontSize:12, fontWeight:600, color:txt }}>{ag.id} — {ag.label}</div>
                      <div style={{ fontSize:10, color:statusColor(status) }}>
                        {statusIcon(status)} {status}
                        {!pipeInfo.canRun && status === "pending" && <span style={{ color:txt3, marginLeft:6 }}>— {pipeInfo.reason || "waiting for dependencies"}</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    {/* A1 special actions */}
                    {ag.id === "A1" && !briefDone && isComplete("A1") && (
                      <button onClick={e=>{e.stopPropagation(); signOff();}} disabled={running==="signoff"}
                        style={s.btn("#059669", running==="signoff")}>
                        {running==="signoff" ? "..." : "✅ Sign Off"}
                      </button>
                    )}
                    {/* A2 special action */}
                    {ag.id === "A2" && briefDone && !isComplete("A2") && (
                      <button onClick={e=>{e.stopPropagation(); runAudit();}} disabled={!!running}
                        style={s.btn("#7C3AED", !!running)}>
                        {running==="A2" ? "⏳ Running..." : "▶ Run Audit"}
                      </button>
                    )}
                    {/* A3-A9 run buttons */}
                    {["A3","A4","A5","A6","A7","A8","A9"].includes(ag.id) && !isComplete(ag.id) && (
                      <button onClick={e=>{e.stopPropagation(); runAgent(ag.id);}}
                        disabled={!canRun(ag.id)}
                        style={s.btn("#7C3AED", !canRun(ag.id))}>
                        {running===ag.id ? "⏳ Running..." : `▶ Run ${ag.id}`}
                      </button>
                    )}
                    {isComplete(ag.id) && ag.id !== "A1" && (
                      <button onClick={e=>{e.stopPropagation(); ag.id === "A2" ? runAudit() : runAgent(ag.id);}}
                        disabled={!!running}
                        style={{ padding:"6px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:"transparent", color:txt2, fontSize:11, cursor:"pointer" }}>
                        🔄 Re-run
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded agent detail */}
                {isOpen && stateData && (
                  <div style={{ background:bg3, borderRadius:10, padding:16, marginBottom:8, marginTop:-4 }}>
                    {ag.id === "A1" && <BriefDetail brief={stateData} txt={txt} txt2={txt2} bg2={bg2} bdr={bdr} />}
                    {ag.id === "A2" && <AuditSummary audit={stateData} txt={txt} txt2={txt2} bg2={bg2} />}
                    {ag.id === "A3" && <KeywordSummary kw={stateData} txt={txt} txt2={txt2} bg2={bg2} />}
                    {ag.id === "A4" && <CompetitorSummary comp={stateData} txt={txt} txt2={txt2} bg2={bg2} />}
                    {ag.id === "A5" && <ContentSummary content={stateData} txt={txt} txt2={txt2} />}
                    {ag.id === "A6" && <OnPageSummary op={stateData} txt={txt} txt2={txt2} bg2={bg2} />}
                    {ag.id === "A7" && <TechnicalSummary tech={stateData} txt={txt} txt2={txt2} bg2={bg2} />}
                    {ag.id === "A8" && <GeoSummary geo={stateData} txt={txt} txt2={txt2} />}
                    {ag.id === "A9" && <ReportSummary report={stateData} txt={txt} txt2={txt2} />}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {activeTab==="actionplan" && <ActionPlanView state={state} dark={dark} bg2={bg2} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2} txt3={txt3} />}
      {activeTab==="approvals" && <ApprovalQueue dark={dark} clientId={clientId} />}
      {activeTab==="alerts"    && <AlertCenter   dark={dark} clientId={clientId} />}

      {/* Audit Tab */}
      {activeTab==="audit" && state.A2_audit && (
        <FullAuditView audit={state.A2_audit} dark={dark} bg2={bg2} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2} />
      )}

      {/* Keywords Tab */}
      {activeTab==="keywords" && state.A3_keywords && (
        <FullKeywordsView kw={state.A3_keywords} dark={dark} bg2={bg2} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2} />
      )}

      {/* Competitor Tab */}
      {activeTab==="competitor" && state.A4_competitor && (
        <FullCompetitorView comp={state.A4_competitor} dark={dark} bg2={bg2} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2} />
      )}

      {/* On-Page Tab */}
      {activeTab==="onpage" && state.A6_onpage && (
        <FullOnPageView op={state.A6_onpage} dark={dark} bg2={bg2} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2} />
      )}

      {/* Technical Tab */}
      {activeTab==="technical" && state.A7_technical && (
        <FullTechnicalView tech={state.A7_technical} dark={dark} bg2={bg2} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2} />
      )}

      {/* GEO Tab */}
      {activeTab==="geo" && state.A8_geo && (
        <FullGeoView geo={state.A8_geo} dark={dark} bg2={bg2} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2} />
      )}
    </div>
  );
}

function getStateSuffix(id) {
  return { A1:"brief", A2:"audit", A3:"keywords", A4:"competitor", A5:"content", A6:"onpage", A7:"technical", A8:"geo", A9:"report" }[id] || id;
}

// ── Action Plan View ───────────────────────────────
function ActionPlanView({ state, bg2, bg3, bdr, txt, txt2, txt3 }) {
  const audit    = state.A2_audit    || {};
  const keywords = state.A3_keywords || {};
  const comp     = state.A4_competitor || {};
  const onpage   = state.A6_onpage   || {};
  const geo      = state.A8_geo      || {};
  const report   = state.A9_report   || {};

  const p1Issues   = audit.issues?.p1 || [];
  const p2Issues   = audit.issues?.p2 || [];
  const topKws     = [...(keywords.clusters?.generic||[]), ...(keywords.clusters?.longtail||[])].filter(k=>k.priority==="high").slice(0,5);
  const quickWins  = comp.analysis?.quickWins || [];
  const gaps       = keywords.gaps || [];
  const geoActions = geo.offPage?.citationTargets || [];
  const next3      = report.reportData?.next3Actions || [];

  // Build priority task list
  const tasks = [];
  p1Issues.slice(0,3).forEach(i => tasks.push({ priority:"🔴 Critical", label: i.detail, fix: i.fix, type:"technical" }));
  quickWins.slice(0,3).forEach(w => tasks.push({ priority:"🟡 Quick Win", label: `Rank for "${w.keyword}"`, fix: w.action, type:"seo" }));
  gaps.slice(0,2).forEach(g => tasks.push({ priority:"🔵 Content", label: `Create content: "${g.keyword}"`, fix: g.recommendedAction, type:"content" }));
  p2Issues.slice(0,2).forEach(i => tasks.push({ priority:"⚪ Important", label: i.detail, fix: i.fix, type:"technical" }));

  const Card = ({ children, style }) => (
    <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:16, marginBottom:12, ...style }}>{children}</div>
  );
  const SectionTitle = ({ icon, title, color="#7C3AED" }) => (
    <div style={{ fontSize:12, fontWeight:700, color, textTransform:"uppercase", letterSpacing:1, marginBottom:10, display:"flex", alignItems:"center", gap:6 }}>
      <span>{icon}</span>{title}
    </div>
  );

  return (
    <div>
      {/* Health Score Bar */}
      {audit.healthScore && (
        <Card>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <div style={{ fontSize:14, fontWeight:700, color:txt }}>Site Health Score</div>
            <div style={{ fontSize:28, fontWeight:800, color: audit.healthScore>=80?"#059669":audit.healthScore>=50?"#D97706":"#DC2626" }}>
              {audit.healthScore}<span style={{ fontSize:14, color:txt2 }}>/100</span>
            </div>
          </div>
          <div style={{ background:bg3, borderRadius:20, height:8, overflow:"hidden" }}>
            <div style={{ width:`${audit.healthScore}%`, height:"100%", borderRadius:20, background: audit.healthScore>=80?"#059669":audit.healthScore>=50?"#D97706":"#DC2626", transition:"width 0.5s" }} />
          </div>
          <div style={{ display:"flex", gap:16, marginTop:10 }}>
            {[{l:"P1 Critical",v:audit.summary?.p1Count||0,c:"#DC2626"},{l:"P2 Important",v:audit.summary?.p2Count||0,c:"#D97706"},{l:"P3 Minor",v:audit.summary?.p3Count||0,c:"#6B7280"},{l:"Keywords",v:(keywords.totalKeywords||0),c:"#7C3AED"},{l:"Competitors",v:comp.summary?.keywordsChecked||0,c:"#0891B2"}].map(i=>(
              <div key={i.l} style={{ textAlign:"center" }}>
                <div style={{ fontSize:18, fontWeight:700, color:i.c }}>{i.v}</div>
                <div style={{ fontSize:10, color:txt2 }}>{i.l}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* A9 Verdict */}
      {report.reportData?.verdict && (
        <Card style={{ borderLeft:"4px solid #7C3AED" }}>
          <SectionTitle icon="📊" title="SEO Verdict" />
          <div style={{ fontSize:13, color:txt, lineHeight:1.6 }}>{report.reportData.verdict}</div>
        </Card>
      )}

      {/* This Week's Priority Actions */}
      {tasks.length > 0 && (
        <Card>
          <SectionTitle icon="🎯" title="This Week's Action Plan" color="#059669" />
          {tasks.map((t,i) => (
            <div key={i} style={{ display:"flex", gap:10, padding:"10px 0", borderBottom:`1px solid ${bdr}` }}>
              <div style={{ fontSize:18, lineHeight:1, marginTop:2 }}>{["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣"][i]||"•"}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12, fontWeight:600, color:txt, marginBottom:3 }}>{t.label}</div>
                <div style={{ fontSize:11, color:txt2 }}>→ {t.fix}</div>
              </div>
              <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:bg3, color:txt2, whiteSpace:"nowrap", alignSelf:"flex-start" }}>{t.priority}</span>
            </div>
          ))}
        </Card>
      )}

      {/* Next 3 Actions from A9 */}
      {next3.length > 0 && (
        <Card>
          <SectionTitle icon="🚀" title="Top 3 SEO Priorities (AI Analysis)" color="#0891B2" />
          {next3.map((a,i) => (
            <div key={i} style={{ padding:"10px 12px", background:bg3, borderRadius:8, marginBottom:8 }}>
              <div style={{ fontSize:13, fontWeight:700, color:txt, marginBottom:4 }}>{i+1}. {a.action}</div>
              <div style={{ fontSize:12, color:txt2 }}>{a.why}</div>
              {a.how && <div style={{ fontSize:11, color:"#0891B2", marginTop:4 }}>How: {a.how}</div>}
            </div>
          ))}
        </Card>
      )}

      {/* Critical Technical Issues */}
      {p1Issues.length > 0 && (
        <Card>
          <SectionTitle icon="🔴" title={`Critical Issues — Fix First (${p1Issues.length})`} color="#DC2626" />
          {p1Issues.map((issue,i) => (
            <div key={i} style={{ padding:"10px 12px", borderRadius:8, marginBottom:6, background:bg3, borderLeft:"3px solid #DC2626" }}>
              <div style={{ fontSize:12, fontWeight:600, color:txt, marginBottom:4 }}>{issue.detail}</div>
              <div style={{ fontSize:11, color:"#059669" }}>✅ Fix: {issue.fix}</div>
            </div>
          ))}
        </Card>
      )}

      {/* Top Keyword Opportunities */}
      {topKws.length > 0 && (
        <Card>
          <SectionTitle icon="🔍" title="Top Keyword Opportunities" color="#7C3AED" />
          {topKws.map((k,i) => (
            <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 10px", background:bg3, borderRadius:8, marginBottom:6 }}>
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:txt }}>{k.keyword}</div>
                <div style={{ fontSize:11, color:txt2 }}>Page: {k.suggestedPage} · {k.notes}</div>
              </div>
              <div style={{ display:"flex", gap:6 }}>
                <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:"#7C3AED22", color:"#A78BFA" }}>{k.difficulty}</span>
                <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:"#05966922", color:"#059669" }}>{k.intent}</span>
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Competitor Quick Wins */}
      {quickWins.length > 0 && (
        <Card>
          <SectionTitle icon="🏆" title="Competitor Quick Wins" color="#D97706" />
          {quickWins.map((w,i) => (
            <div key={i} style={{ padding:"10px 12px", background:bg3, borderRadius:8, marginBottom:6 }}>
              <div style={{ fontSize:12, fontWeight:600, color:txt, marginBottom:3 }}>Keyword: "{w.keyword}"</div>
              <div style={{ fontSize:12, color:"#059669", marginBottom:2 }}>→ {w.action}</div>
              <div style={{ fontSize:11, color:txt2 }}>Expected: {w.expectedOutcome}</div>
            </div>
          ))}
        </Card>
      )}

      {/* Content Gaps */}
      {gaps.length > 0 && (
        <Card>
          <SectionTitle icon="📝" title={`Content to Create (${gaps.length} gaps)`} color="#0891B2" />
          {gaps.slice(0,5).map((g,i) => (
            <div key={i} style={{ padding:"8px 12px", background:bg3, borderRadius:8, marginBottom:6 }}>
              <div style={{ fontSize:12, fontWeight:600, color:txt }}>{g.keyword}</div>
              <div style={{ fontSize:11, color:txt2 }}>{g.reason}</div>
              <div style={{ fontSize:11, color:"#0891B2" }}>Action: {g.recommendedAction}</div>
            </div>
          ))}
        </Card>
      )}

      {/* Local SEO */}
      {geoActions.length > 0 && (
        <Card>
          <SectionTitle icon="🌍" title="Local SEO — Citation Targets" color="#059669" />
          {geoActions.slice(0,5).map((c,i) => (
            <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"8px 10px", background:bg3, borderRadius:8, marginBottom:6 }}>
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:txt }}>{c.directory}</div>
                <div style={{ fontSize:11, color:txt2 }}>{c.url}</div>
              </div>
              <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:"#05966922", color:"#059669" }}>{c.priority}</span>
            </div>
          ))}
        </Card>
      )}

      {tasks.length === 0 && !audit.healthScore && (
        <div style={{ textAlign:"center", padding:60, color:txt3 }}>
          <div style={{ fontSize:32, marginBottom:12 }}>📊</div>
          <div style={{ color:txt2 }}>Run A2 Audit and A3 Keywords to see your action plan</div>
        </div>
      )}
    </div>
  );
}

// ── Mini summary components ────────────────────────
function BriefDetail({ brief, txt, txt2, bg2, bdr }) {
  return (
    <div style={{ fontSize:12 }}>
      {brief.signedOff && <div style={{ color:"#059669", marginBottom:8, fontWeight:600 }}>✅ Signed off</div>}
      {brief.missingFields?.length > 0 && <div style={{ color:"#D97706", marginBottom:8 }}>⚠️ Missing: {brief.missingFields.join(", ")}</div>}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8 }}>
        {[["Business", brief.businessName], ["Audience", brief.targetAudience], ["Goals", (brief.goals||[]).join(", ")], ["Conversion", brief.conversionGoal]].map(([k,v]) => v && (
          <div key={k} style={{ background:bg2, borderRadius:6, padding:"8px 10px" }}>
            <div style={{ fontSize:10, color:txt2, marginBottom:2 }}>{k}</div>
            <div style={{ color:txt }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AuditSummary({ audit, txt, txt2, bg2 }) {
  return (
    <div style={{ display:"flex", gap:12, fontSize:12 }}>
      <div style={{ background:bg2, borderRadius:8, padding:"10px 16px", textAlign:"center" }}>
        <div style={{ fontSize:22, fontWeight:800, color: audit.healthScore>=80?"#059669":audit.healthScore>=50?"#D97706":"#DC2626" }}>{audit.healthScore}</div>
        <div style={{ color:txt2, fontSize:10 }}>Health Score</div>
      </div>
      <div style={{ flex:1, color:txt2, fontSize:11 }}>{audit.summary?.message}</div>
    </div>
  );
}

function KeywordSummary({ kw, txt, txt2 }) {
  return <div style={{ fontSize:12, color:txt2 }}>{kw.totalKeywords} keywords mapped · {kw.gaps?.length || 0} gaps identified · SerpAPI data: {kw.hasSerpData ? "✅" : "❌ (add SerpAPI key)"}</div>;
}

function CompetitorSummary({ comp, txt, txt2 }) {
  return <div style={{ fontSize:12, color:txt2 }}>{comp.summary?.keywordsChecked} keywords checked · {comp.summary?.notRanking} not ranking · {comp.summary?.contentGapsFound} content gaps</div>;
}

function ContentSummary({ content, txt, txt2 }) {
  return <div style={{ fontSize:12, color:txt2 }}>{content.summary?.newPageBriefs} page briefs · {content.summary?.faqItems} FAQ items · {content.approvalItemsCount} items waiting approval</div>;
}

function OnPageSummary({ op, txt, txt2, bg2 }) {
  return (
    <div style={{ fontSize:12, color:txt2 }}>
      {op.totalFixes} fixes · P1: {op.summary?.p1Fixes} · P2: {op.summary?.p2Fixes}
      {op.summary?.altMissing > 0 && <span style={{ color:"#D97706", marginLeft:8 }}>· {op.summary.altMissing} imgs no alt</span>}
      {op.summary?.ogMissing > 0  && <span style={{ color:"#D97706", marginLeft:8 }}>· {op.summary.ogMissing} OG missing</span>}
      <span style={{ marginLeft:8 }}>· Schema: {op.summary?.schemaNeeded} types</span>
    </div>
  );
}

function TechnicalSummary({ tech, txt, txt2 }) {
  return (
    <div style={{ fontSize:12, color:txt2 }}>
      Mobile: {tech.summary?.mobileScore || "N/A"}/100 · Desktop: {tech.summary?.desktopScore || "N/A"}/100 · {tech.hasRealCWVData ? "Real PageSpeed data ✅" : "No Google key — add for real CWV data"}
    </div>
  );
}

function GeoSummary({ geo, txt, txt2 }) {
  return <div style={{ fontSize:12, color:txt2 }}>{geo.summary?.citationTargets} citation targets · {geo.summary?.quickWinLinks} link opportunities · Local Pack: {geo.summary?.localPackOpportunity}</div>;
}

function ReportSummary({ report, txt, txt2 }) {
  return <div style={{ fontSize:12, color:txt2 }}>{report.reportData?.verdict} — Approval ID: {report.approvalId}</div>;
}

// ── Full view components ────────────────────────────
function FullAuditView({ audit, bg2, bg3, bdr, txt, txt2 }) {
  const issueColor = { p1:"#DC2626", p2:"#D97706", p3:"#6B7280" };
  const c = audit.checks || {};
  const alt = c.altTextAudit || {};
  const og  = c.ogTags || {};
  const req = c.httpRequests || {};
  const serp = c.serpPreview || {};
  const robots = c.robotsTxt || {};
  const sitemap = c.sitemap || {};
  const [showAltUrls, setShowAltUrls] = useState(false);
  const [copiedSchema, setCopiedSchema] = useState(null);

  const statusBadge = (ok, okText, failText) => (
    <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background: ok?"#05966922":"#DC262611", color: ok?"#059669":"#DC2626" }}>
      {ok ? `✅ ${okText}` : `❌ ${failText}`}
    </span>
  );

  return (
    <div>
      {/* Score Cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:16 }}>
        {[{ l:"Health", v:audit.healthScore+"/100", c:"#7C3AED" },{ l:"P1 Critical",v:audit.summary?.p1Count,c:"#DC2626" },{ l:"P2 Important",v:audit.summary?.p2Count,c:"#D97706" },{ l:"P3 Minor",v:audit.summary?.p3Count,c:"#6B7280" }].map(i=>(
          <div key={i.l} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"12px 10px", textAlign:"center", borderTop:`2px solid ${i.c}` }}>
            <div style={{ fontSize:20, fontWeight:700, color:i.c }}>{i.v}</div>
            <div style={{ fontSize:10, color:txt2 }}>{i.l}</div>
          </div>
        ))}
      </div>

      {/* SERP Preview */}
      {serp.title && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:16, marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>🔍 Google SERP Preview</div>
          <div style={{ background:"#fff", border:"1px solid #e0e0e0", borderRadius:8, padding:"14px 16px" }}>
            <div style={{ fontSize:12, color:"#006621", marginBottom:2 }}>{serp.url?.replace(/^https?:\/\//,"")}</div>
            <div style={{ fontSize:18, color:"#1a0dab", fontWeight:400, marginBottom:4, fontFamily:"Arial,sans-serif",
              borderBottom: serp.titleLength > 60 ? "2px dashed #DC2626" : "none" }}>
              {serp.title?.slice(0,60)}{serp.titleLength > 60 ? <span style={{color:"#DC2626"}}>... ✂️ cut off</span> : ""}
            </div>
            <div style={{ fontSize:13, color:"#545454", lineHeight:1.5, fontFamily:"Arial,sans-serif" }}>
              {serp.description?.slice(0,155)}{serp.descLength > 155 ? <span style={{color:"#DC2626"}}>... ✂️ cut off</span> : ""}
            </div>
          </div>
          <div style={{ display:"flex", gap:12, marginTop:10 }}>
            <div style={{ fontSize:11, color: serp.titleLength>60||serp.titleLength<30 ? "#DC2626":"#059669" }}>
              Title: {serp.titleLength} chars {serp.titleLength>60?"(too long — will be cut)":serp.titleLength<30?"(too short)":"✅"}
            </div>
            <div style={{ fontSize:11, color: serp.descLength>155||serp.descLength<70 ? "#D97706":"#059669" }}>
              Description: {serp.descLength} chars {serp.descLength>155?"(will be cut)":serp.descLength<70?"(too short)":"✅"}
            </div>
          </div>
        </div>
      )}

      {/* Technical Checks Grid */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10, marginBottom:12 }}>
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:14 }}>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, marginBottom:8 }}>📊 HTTP Requests</div>
          <div style={{ fontSize:22, fontWeight:800, color: req.total>60?"#DC2626":req.total>30?"#D97706":"#059669" }}>{req.total || 0}</div>
          <div style={{ fontSize:10, color:txt2, marginTop:4 }}>Images: {req.images||0} · JS: {req.scripts||0} · CSS: {req.stylesheets||0}</div>
          <div style={{ fontSize:10, color:txt2 }}>Limit: 20 · {req.total>60?"🔴 Critical":req.total>30?"🟡 High":"✅ OK"}</div>
        </div>
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:14 }}>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, marginBottom:8 }}>🖼️ Alt Text Audit</div>
          <div style={{ fontSize:22, fontWeight:800, color: alt.missingAlt>5?"#DC2626":alt.missingAlt>0?"#D97706":"#059669" }}>{alt.missingAlt||0}</div>
          <div style={{ fontSize:10, color:txt2, marginTop:4 }}>Missing of {alt.totalImages||0} total images</div>
          <div style={{ fontSize:10, color:"#0891B2", cursor:"pointer", marginTop:4 }} onClick={()=>setShowAltUrls(v=>!v)}>
            {alt.missingAlt>0 ? (showAltUrls?"Hide URLs ▲":"Show URLs ▼") : "✅ All good"}
          </div>
        </div>
      </div>

      {/* Alt text URL list */}
      {showAltUrls && (alt.missingUrls||[]).length > 0 && (
        <div style={{ background:bg3, borderRadius:8, padding:12, marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:600, color:"#D97706", marginBottom:8 }}>Images missing alt text:</div>
          {alt.missingUrls.map((url,i) => (
            <div key={i} style={{ fontSize:10, color:txt2, padding:"3px 0", borderBottom:`1px solid ${bdr}`, wordBreak:"break-all" }}>{url}</div>
          ))}
        </div>
      )}

      {/* OG Tags + robots/sitemap row */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:12 }}>
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:14 }}>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, marginBottom:8 }}>📢 Open Graph</div>
          {["title","description","image","url"].map(tag => (
            <div key={tag} style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
              <span style={{ fontSize:10, color:txt2 }}>og:{tag}</span>
              {statusBadge(!!og[tag], "set", "missing")}
            </div>
          ))}
        </div>
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:14 }}>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, marginBottom:8 }}>🤖 Robots.txt</div>
          {statusBadge(robots.exists, "Found", "Missing")}
          {robots.sitemapInRobots && <div style={{ fontSize:10, color:"#059669", marginTop:6 }}>Sitemap: ✅ declared</div>}
          {robots.content && <div style={{ fontSize:9, color:txt2, marginTop:6, fontFamily:"monospace", background:bg3, padding:6, borderRadius:4, maxHeight:60, overflow:"hidden" }}>{robots.content.slice(0,150)}</div>}
        </div>
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:14 }}>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, marginBottom:8 }}>🗺️ XML Sitemap</div>
          {statusBadge(sitemap.exists, "Found", "Missing")}
          {sitemap.url && <div style={{ fontSize:9, color:txt2, marginTop:6, wordBreak:"break-all" }}>{sitemap.url}</div>}
        </div>
      </div>

      {/* Issues by Priority */}
      {["p1","p2","p3"].map(tier => (
        <div key={tier} style={{ marginBottom:14 }}>
          {(audit.issues?.[tier]||[]).map((issue,i)=>(
            <div key={i} style={{ padding:"10px 14px", borderRadius:8, marginBottom:6, background:bg3, borderLeft:`3px solid ${issueColor[tier]}` }}>
              <div style={{ fontSize:12, color:txt, fontWeight:600 }}>{issue.detail}</div>
              <div style={{ fontSize:11, color:"#059669" }}>→ Fix: {issue.fix}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function FullKeywordsView({ kw, bg2, bg3, bdr, txt, txt2 }) {
  const clusters = kw.clusters || {};
  const intentColor = { transactional:"#059669", informational:"#0891B2", commercial:"#7C3AED", navigational:"#D97706", local:"#DC2626" };
  return (
    <div>
      {Object.entries(clusters).filter(([k])=>k!=="gaps").map(([cluster, items]) => (
        <div key={cluster} style={{ marginBottom:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", marginBottom:8 }}>{cluster} ({(items||[]).length})</div>
          {(items||[]).map((kw_,i)=>(
            <div key={i} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:8, padding:"8px 12px", marginBottom:6, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:12, color:txt, fontWeight:500 }}>{kw_.keyword}</span>
              <div style={{ display:"flex", gap:6 }}>
                <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:(intentColor[kw_.intent]||"#6B7280")+"22", color:intentColor[kw_.intent]||"#6B7280" }}>{kw_.intent}</span>
                <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:bg3, color:txt2 }}>{kw_.difficulty}</span>
                <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:bg3, color:txt2 }}>{kw_.suggestedPage}</span>
              </div>
            </div>
          ))}
        </div>
      ))}
      {(kw.gaps||[]).length > 0 && (
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:"#DC2626", textTransform:"uppercase", marginBottom:8 }}>Content Gaps ({kw.gaps.length})</div>
          {kw.gaps.map((g,i)=>(
            <div key={i} style={{ background:bg3, borderRadius:8, padding:"8px 12px", marginBottom:6 }}>
              <div style={{ fontSize:12, color:txt, fontWeight:500 }}>{g.keyword}</div>
              <div style={{ fontSize:11, color:txt2 }}>{g.reason} → {g.recommendedAction}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FullCompetitorView({ comp, bg2, bg3, bdr, txt, txt2 }) {
  const opp = { not_ranking:"#DC2626", top_3:"#059669", page_1:"#D97706", below_fold:"#6B7280" };
  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:16 }}>
        {[{ l:"Not Ranking",v:comp.summary?.notRanking,c:"#DC2626" },{ l:"Top 3",v:comp.summary?.rankingTop3,c:"#059669" },{ l:"Content Gaps",v:comp.summary?.contentGapsFound,c:"#7C3AED" }].map(i=>(
          <div key={i.l} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"12px 10px", textAlign:"center", borderTop:`2px solid ${i.c}` }}>
            <div style={{ fontSize:20, fontWeight:700, color:i.c }}>{i.v}</div>
            <div style={{ fontSize:10, color:txt2 }}>{i.l}</div>
          </div>
        ))}
      </div>
      {comp.analysis?.strategicSummary && (
        <div style={{ background:bg3, borderRadius:8, padding:12, marginBottom:16, fontSize:12, color:txt2 }}>{comp.analysis.strategicSummary}</div>
      )}
      {(comp.analysis?.quickWins||[]).map((w,i)=>(
        <div key={i} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:8, padding:"10px 12px", marginBottom:8 }}>
          <div style={{ fontSize:12, color:txt, fontWeight:600 }}>{w.action}</div>
          <div style={{ fontSize:11, color:txt2 }}>{w.keyword} → {w.expectedOutcome}</div>
        </div>
      ))}
      {(comp.rankingMatrix||[]).slice(0,8).map((r,i)=>(
        <div key={i} style={{ background:bg3, borderRadius:8, padding:"8px 12px", marginBottom:6, display:"flex", justifyContent:"space-between" }}>
          <span style={{ fontSize:12, color:txt }}>{r.keyword}</span>
          <span style={{ fontSize:11, color:opp[r.opportunity]||txt2 }}>{r.opportunity?.replace("_"," ")}</span>
        </div>
      ))}
    </div>
  );
}

function FullOnPageView({ op, bg2, bg3, bdr, txt, txt2 }) {
  const [copiedIdx, setCopiedIdx] = useState(null);
  const serpPrev = op.serpPreview || {};
  const h1       = op.h1Analysis  || {};
  const schema   = op.recommendations?.schemaMarkup || [];
  const tracking = op.recommendations?.trackingSetup || {};
  const fixQueue = op.fixQueue || [];

  const priColor = { p1:"#DC2626", p2:"#D97706", p3:"#6B7280" };

  function copySchema(json, idx) {
    navigator.clipboard?.writeText(json);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }

  return (
    <div>
      {/* SERP Preview */}
      {serpPrev.title && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:16, marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>🔍 Google SERP Preview</div>
          <div style={{ background:"#fff", border:"1px solid #e0e0e0", borderRadius:8, padding:"14px 16px" }}>
            <div style={{ fontSize:12, color:"#006621", marginBottom:2 }}>{serpPrev.urlDisplay}</div>
            <div style={{ fontSize:18, color:"#1a0dab", fontWeight:400, marginBottom:4, fontFamily:"Arial,sans-serif" }}>
              {serpPrev.titleDisplay}
              {serpPrev.titleStatus==="too_long" && <span style={{ color:"#DC2626", fontSize:13 }}> ✂️</span>}
            </div>
            <div style={{ fontSize:13, color:"#545454", lineHeight:1.5, fontFamily:"Arial,sans-serif" }}>
              {serpPrev.descDisplay}
              {serpPrev.descStatus==="too_long" && <span style={{ color:"#D97706", fontSize:12 }}> ✂️</span>}
            </div>
          </div>
          <div style={{ display:"flex", gap:16, marginTop:8 }}>
            <span style={{ fontSize:11, color: serpPrev.titleStatus==="good"?"#059669":"#DC2626" }}>Title: {serpPrev.titleLength} chars {serpPrev.titleStatus==="too_long"?"(cut off)":serpPrev.titleStatus==="too_short"?"(too short)":"✅"}</span>
            <span style={{ fontSize:11, color: serpPrev.descStatus==="good"?"#059669":"#D97706" }}>Desc: {serpPrev.descLength} chars {serpPrev.descStatus==="too_long"?"(cut off)":serpPrev.descStatus==="too_short"?"(too short)":"✅"}</span>
          </div>
        </div>
      )}

      {/* H1 Keyword Analysis */}
      {h1.current && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:16, marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>📝 H1 Keyword Analysis</div>
          <div style={{ fontSize:13, color:txt, fontStyle:"italic", marginBottom:8 }}>"{h1.current}"</div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {h1.matchedKeywords?.length > 0
              ? h1.matchedKeywords.map((k,i) => <span key={i} style={{ fontSize:10, padding:"2px 10px", borderRadius:10, background:"#05966922", color:"#059669" }}>✅ {k}</span>)
              : <span style={{ fontSize:11, color:"#DC2626" }}>❌ No target keywords found in H1</span>}
          </div>
          {h1.missingKeywords?.length > 0 && (
            <div style={{ marginTop:8 }}>
              <span style={{ fontSize:10, color:txt2 }}>Should include: </span>
              {h1.missingKeywords.map((k,i) => <span key={i} style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:"#DC262611", color:"#DC2626", marginLeft:4 }}>🔴 {k}</span>)}
            </div>
          )}
        </div>
      )}

      {/* Fix Queue */}
      {fixQueue.length > 0 && (
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>🔧 Fix Queue ({fixQueue.length} items)</div>
          {fixQueue.map((fix,i) => (
            <div key={i} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:8, padding:"12px 14px", marginBottom:8, borderLeft:`3px solid ${priColor[fix.priority]||"#6B7280"}` }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                <span style={{ fontSize:12, fontWeight:600, color:txt }}>{fix.type?.replace(/_/g," ").toUpperCase()}</span>
                <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:bg3, color:txt2 }}>{fix.page} · {fix.priority?.toUpperCase()}</span>
              </div>
              <div style={{ fontSize:11, color:txt2, marginBottom:4 }}>Current: <span style={{ color:"#DC2626" }}>{fix.current}</span></div>
              <div style={{ fontSize:11, color:"#059669" }}>→ {fix.recommended}</div>
              {fix.affectedUrls?.length > 0 && (
                <div style={{ marginTop:6 }}>
                  {fix.affectedUrls.slice(0,3).map((u,j) => <div key={j} style={{ fontSize:9, color:txt2, wordBreak:"break-all" }}>{u}</div>)}
                  {fix.affectedUrls.length > 3 && <div style={{ fontSize:9, color:txt2 }}>+{fix.affectedUrls.length - 3} more</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Schema Markup with JSON-LD */}
      {schema.length > 0 && (
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>🏗️ Schema Markup — Copy-Paste Ready</div>
          {schema.map((s,i) => (
            <div key={i} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:8, padding:"12px 14px", marginBottom:8 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                <span style={{ fontSize:12, fontWeight:600, color:"#7C3AED" }}>{s.type} — {s.page}</span>
                {s.jsonLd && (
                  <button onClick={() => copySchema(s.jsonLd, i)} style={{ fontSize:10, padding:"3px 10px", borderRadius:6, border:`1px solid ${bdr}`, background: copiedIdx===i?"#059669":"transparent", color: copiedIdx===i?"#fff":txt2, cursor:"pointer" }}>
                    {copiedIdx===i ? "✅ Copied!" : "📋 Copy JSON-LD"}
                  </button>
                )}
              </div>
              <div style={{ fontSize:11, color:txt2, marginBottom:s.jsonLd?8:0 }}>{s.reason}</div>
              {s.jsonLd && (
                <div style={{ background:bg3, borderRadius:6, padding:10, fontSize:10, fontFamily:"monospace", color:"#0891B2", overflowX:"auto", whiteSpace:"pre-wrap", maxHeight:120, overflow:"hidden" }}>
                  {s.jsonLd}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Tracking Setup */}
      {Object.keys(tracking).length > 0 && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>📈 Tracking Setup Checklist</div>
          {Object.entries(tracking).map(([tool, data]) => (
            <div key={tool} style={{ display:"flex", gap:10, padding:"8px 0", borderBottom:`1px solid ${bdr}` }}>
              <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background: data.status==="check"?"#05966922":"#DC262611", color: data.status==="check"?"#059669":"#DC2626", whiteSpace:"nowrap" }}>
                {tool.toUpperCase()} {data.status==="check"?"✅":"⚠️"}
              </span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:11, color:txt }}>{data.notes}</div>
              </div>
              <span style={{ fontSize:10, color: data.priority==="high"?"#DC2626":"#D97706" }}>{data.priority}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FullTechnicalView({ tech, bg2, bg3, bdr, txt, txt2 }) {
  const strategies = [["mobile","📱 Mobile"], ["desktop","🖥️ Desktop"]];
  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
        {strategies.map(([strat, label]) => {
          const d = tech.cwvData?.[strat];
          if (!d) return <div key={strat} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:16 }}><div style={{ fontSize:12, color:txt2 }}>{label}: No data (add Google API key)</div></div>;
          return (
            <div key={strat} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:16 }}>
              <div style={{ fontSize:13, fontWeight:700, color:txt, marginBottom:10 }}>{label}</div>
              <div style={{ fontSize:28, fontWeight:800, color:d.scores?.performance>=80?"#059669":d.scores?.performance>=50?"#D97706":"#DC2626", marginBottom:8 }}>{d.scores?.performance || "N/A"}</div>
              {d.metrics && Object.entries(d.metrics).map(([k,v])=>(
                <div key={k} style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:4 }}>
                  <span style={{ color:txt2, textTransform:"uppercase" }}>{k}</span>
                  <span style={{ color:txt, fontWeight:600 }}>{v}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {(tech.techRecs?.priorityFixes||[]).map((f,i)=>(
        <div key={i} style={{ background:bg3, borderRadius:8, padding:"10px 12px", marginBottom:8 }}>
          <div style={{ fontSize:12, color:txt, fontWeight:600 }}>{f.issue} <span style={{ fontSize:10, color:f.impact==="high"?"#DC2626":"#D97706" }}>({f.impact})</span></div>
          <div style={{ fontSize:11, color:txt2 }}>{f.fix}</div>
        </div>
      ))}
    </div>
  );
}

function FullGeoView({ geo, bg2, bg3, bdr, txt, txt2 }) {
  const prioColor = { high:"#DC2626", medium:"#D97706", low:"#059669" };
  return (
    <div>
      {geo.geoData?.geoAudit && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:16, marginBottom:12 }}>
          <div style={{ fontSize:12, fontWeight:700, color:txt, marginBottom:8 }}>Local Pack Opportunity: <span style={{ color:geo.geoData.geoAudit.localPackOpportunity==="high"?"#059669":"#D97706" }}>{geo.geoData.geoAudit.localPackOpportunity}</span></div>
          <div style={{ fontSize:11, color:txt2 }}>{geo.geoData.geoAudit.localPackReason}</div>
        </div>
      )}
      <div style={{ fontSize:11, fontWeight:700, color:txt2, marginBottom:8, textTransform:"uppercase" }}>Citation Targets</div>
      {(geo.geoData?.citationTargets||[]).map((c,i)=>(
        <div key={i} style={{ background:bg3, borderRadius:8, padding:"10px 12px", marginBottom:6, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontSize:12, color:txt, fontWeight:500 }}>{c.directory}</div>
            <div style={{ fontSize:11, color:txt2 }}>{c.relevance}</div>
          </div>
          <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:(prioColor[c.priority]||"#6B7280")+"22", color:prioColor[c.priority]||"#6B7280", fontWeight:600 }}>{c.priority}</span>
        </div>
      ))}
      {(geo.geoData?.backlinkStrategy?.quickWinOpportunities||[]).map((w,i)=>(
        <div key={i} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:8, padding:"10px 12px", marginBottom:6 }}>
          <div style={{ fontSize:12, color:txt, fontWeight:500 }}>{w.type?.replace("_"," ")}</div>
          <div style={{ fontSize:11, color:txt2 }}>{w.target} — {w.approach}</div>
        </div>
      ))}
    </div>
  );
}
