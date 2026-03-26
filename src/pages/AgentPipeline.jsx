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
  return <div style={{ fontSize:12, color:txt2 }}>{op.totalFixes} fixes identified · P1: {op.summary?.p1Fixes} · P2: {op.summary?.p2Fixes} · Schema: {op.summary?.schemaNeeded} types needed</div>;
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
  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:16 }}>
        {[{ l:"Health", v:audit.healthScore+"/100", c:"#7C3AED" },{ l:"P1",v:audit.summary?.p1Count,c:"#DC2626" },{ l:"P2",v:audit.summary?.p2Count,c:"#D97706" },{ l:"P3",v:audit.summary?.p3Count,c:"#6B7280" }].map(i=>(
          <div key={i.l} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"12px 10px", textAlign:"center", borderTop:`2px solid ${i.c}` }}>
            <div style={{ fontSize:20, fontWeight:700, color:i.c }}>{i.v}</div>
            <div style={{ fontSize:10, color:txt2 }}>{i.l}</div>
          </div>
        ))}
      </div>
      {["p1","p2","p3"].map(tier => (
        <div key={tier} style={{ marginBottom:14 }}>
          {(audit.issues?.[tier]||[]).map((issue,i)=>(
            <div key={i} style={{ padding:"10px 14px", borderRadius:8, marginBottom:6, background:bg3, borderLeft:`3px solid ${issueColor[tier]}` }}>
              <div style={{ fontSize:12, color:txt, fontWeight:600 }}>{issue.detail}</div>
              <div style={{ fontSize:11, color:txt2 }}>Fix: {issue.fix}</div>
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
