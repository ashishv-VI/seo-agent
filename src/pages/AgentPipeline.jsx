import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import ApprovalQueue from "./ApprovalQueue";
import AlertCenter from "./AlertCenter";
import PrintReport from "./PrintReport";
import AIChatBot from "../components/AIChatBot";

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
  const [pipelineStatus, setPipelineStatus] = useState("idle"); // idle | running | complete | failed
  const pollRef     = useRef(null);
  const loadLatest  = useRef(null); // always points to the latest load fn for use in setInterval

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const txt3 = dark ? "#444"    : "#bbb";

  async function getToken() { return user?.getIdToken?.() || ""; }

  const [printMode, setPrintMode] = useState(false);

  function exportPDF() {
    setPrintMode(true);
    setTimeout(() => {
      const printContent = document.querySelector(".print-report");
      if (!printContent) { setPrintMode(false); return; }
      const newWin = window.open("", "_blank", "width=900,height=700");
      newWin.document.write(`<!DOCTYPE html><html><head><title>SEO Report</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Segoe UI', Arial, sans-serif; background: #fff; color: #1a1a18; }
          @page { margin: 10mm 8mm; size: A4; }
          @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        </style>
      </head><body>${printContent.innerHTML}</body></html>`);
      newWin.document.close();
      newWin.focus();
      setTimeout(() => {
        newWin.print();
        newWin.close();
        setPrintMode(false);
      }, 800);
    }, 600);
  }

  async function load(silent = false) {
    if (!silent) setLoading(true);
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
      if (!clientRes.ok) throw new Error(clientData.error || "Failed to load client");
      setClient(clientData.client);
      setState(clientData.state || {});
      setPipeline(pipelineData.pipeline || {});
      setAlertCount((alertsData.alerts || []).filter(a => !a.resolved).length);

      const ps = pipelineData.pipelineStatus || clientData.client?.pipelineStatus || "idle";
      setPipelineStatus(ps);

      // Auto-resume polling if page is refreshed while pipeline is still running
      if (ps === "running" && !pollRef.current) {
        pollRef.current = setInterval(() => loadLatest.current(true), 4000);
      }
      // Stop polling when done, auto-navigate to results
      if (ps === "complete" || ps === "failed") {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        if (ps === "complete") setActiveTab("actionplan");
      }
    } catch (e) { setError(e.message || "Failed to load pipeline"); }
    if (!silent) setLoading(false);
  }

  // Keep loadLatest ref up-to-date so the setInterval always calls the current version
  loadLatest.current = load;

  useEffect(() => {
    load();
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function runFullAnalysis() {
    setError("");
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/agents/${clientId}/run-pipeline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to start pipeline"); return; }

      setPipelineStatus("running");
      setActiveTab("pipeline");

      // Poll every 4 seconds for live progress (always calls latest load via ref)
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => loadLatest.current(true), 4000);
    } catch (e) {
      setError(e.message || "Failed to start pipeline");
    }
  }

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

  // Print mode — show white-label report for browser print/save-as-PDF
  if (printMode) return (
    <div className="print-report" style={{ position:"fixed", inset:0, zIndex:9999, background:"#fff", overflowY:"auto" }}>
      <PrintReport client={client} state={state} />
    </div>
  );

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
        {pipelineStatus === "running" ? (
          <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 16px", borderRadius:20, background:"#D9770611", border:"1px solid #D9770644" }}>
            <span style={{ fontSize:12, color:"#D97706", animation:"spin 1s linear infinite" }}>⏳</span>
            <span style={{ fontSize:12, color:"#D97706", fontWeight:600 }}>Analysing...</span>
          </div>
        ) : (
          <button
            onClick={runFullAnalysis}
            disabled={!!running}
            style={{ padding:"10px 20px", borderRadius:20, border:"none", background:"linear-gradient(135deg,#7C3AED,#059669)", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", boxShadow:"0 2px 12px #7C3AED44" }}
          >
            {pipelineStatus === "complete" ? "🔄 Re-run Analysis" : "🚀 Run Full SEO Analysis"}
          </button>
        )}
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
        {isComplete("A5") && <div style={s.tab(activeTab==="content")} onClick={()=>setActiveTab("content")}>✍️ Content</div>}
        {isComplete("A6") && <div style={s.tab(activeTab==="onpage")} onClick={()=>setActiveTab("onpage")}>🏷️ On-Page</div>}
        {isComplete("A7") && <div style={s.tab(activeTab==="technical")} onClick={()=>setActiveTab("technical")}>⚡ CWV</div>}
        {isComplete("A8") && <div style={s.tab(activeTab==="geo")} onClick={()=>setActiveTab("geo")}>🌍 GEO</div>}
        {isComplete("A9") && <div style={s.tab(activeTab==="report")} onClick={()=>setActiveTab("report")}>📊 Report</div>}
      </div>

      {/* Pipeline Tab */}
      {activeTab==="pipeline" && (
        <>
          {/* Live Progress Banner */}
          {pipelineStatus === "running" && (
            <div style={{ padding:"14px 18px", borderRadius:10, background:"#D9770611", border:"1px solid #D9770633", marginBottom:14 }}>
              <div style={{ fontSize:13, fontWeight:700, color:"#D97706", marginBottom:8 }}>AI agents are running — results appear as each stage completes</div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {[
                  { label:"Technical Audit", agents:["A2","A7"] },
                  { label:"Keywords",        agents:["A3"] },
                  { label:"Competitor + Content", agents:["A4","A5"] },
                  { label:"On-Page + Local", agents:["A6","A8"] },
                  { label:"Strategy Report", agents:["A9"] },
                ].map(stage => {
                  const statuses = stage.agents.map(id => client?.agents?.[id] || "pending");
                  const allDone  = statuses.every(s => ["complete","failed"].includes(s));
                  const anyRun   = statuses.some(s => s === "running");
                  const color    = allDone ? "#059669" : anyRun ? "#D97706" : txt3;
                  const icon     = allDone ? "✅" : anyRun ? "⏳" : "⬜";
                  return (
                    <div key={stage.label} style={{ fontSize:11, padding:"4px 10px", borderRadius:12, background:allDone?"#05966920":anyRun?"#D9770620":bg3, color, border:`1px solid ${allDone?"#05966940":anyRun?"#D9770640":bdr}` }}>
                      {icon} {stage.label}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {pipelineStatus === "failed" && (
            <div style={{ padding:"12px 16px", borderRadius:10, background:"#DC262611", border:"1px solid #DC262633", marginBottom:14 }}>
              <div style={{ fontSize:13, fontWeight:700, color:"#DC2626" }}>Pipeline encountered an error</div>
              <div style={{ fontSize:12, color:txt2, marginTop:4 }}>Some agents may have completed. Check individual agent status below. Re-run to retry.</div>
            </div>
          )}
          {pipelineStatus === "idle" && !Object.values(client?.agents || {}).some(s => ["complete","signed_off"].includes(s)) && (
            <div style={{ padding:"24px", borderRadius:12, background:bg2, border:`2px dashed ${bdr}`, textAlign:"center", marginBottom:14 }}>
              <div style={{ fontSize:32, marginBottom:12 }}>🚀</div>
              <div style={{ fontSize:15, fontWeight:700, color:txt, marginBottom:8 }}>Ready to analyse {client?.website}</div>
              <div style={{ fontSize:13, color:txt2, marginBottom:20, maxWidth:400, margin:"0 auto 20px" }}>
                One click runs all 8 AI agents in the optimal sequence — technical audit, keywords, competitor analysis, content, on-page fixes, local SEO, and strategy report.
              </div>
              <button
                onClick={runFullAnalysis}
                style={{ padding:"12px 32px", borderRadius:24, border:"none", background:"linear-gradient(135deg,#7C3AED,#059669)", color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", boxShadow:"0 4px 20px #7C3AED44" }}
              >
                🚀 Run Full SEO Analysis
              </button>
            </div>
          )}

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
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    {/* Running spinner for active agent */}
                    {status === "running" && (
                      <span style={{ fontSize:12, color:"#D97706" }}>⏳ running</span>
                    )}
                    {/* Re-run individual agent when already complete (power user escape hatch) */}
                    {isComplete(ag.id) && ag.id !== "A1" && pipelineStatus !== "running" && (
                      <button onClick={e=>{e.stopPropagation(); ag.id === "A2" ? runAudit() : runAgent(ag.id);}}
                        disabled={!!running}
                        style={{ padding:"5px 10px", borderRadius:8, border:`1px solid ${bdr}`, background:"transparent", color:txt2, fontSize:10, cursor:"pointer" }}>
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

      {activeTab==="actionplan" && (
        <ActionPlanView
          state={state} dark={dark} bg2={bg2} bg3={bg3} bdr={bdr}
          txt={txt} txt2={txt2} txt3={txt3}
          clientId={clientId} getToken={getToken} API={API} exportPDF={exportPDF}
        />
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

      {/* Content Tab */}
      {activeTab==="content" && state.A5_content && (
        <FullContentView content={state.A5_content} dark={dark} bg2={bg2} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2} />
      )}

      {/* Report Tab */}
      {activeTab==="report" && state.A9_report && (
        <FullReportView report={state.A9_report} dark={dark} bg2={bg2} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2} />
      )}

      <AIChatBot dark={dark} clientId={clientId} getToken={getToken} API={API} />
    </div>
  );
}

function getStateSuffix(id) {
  return { A1:"brief", A2:"audit", A3:"keywords", A4:"competitor", A5:"content", A6:"onpage", A7:"technical", A8:"geo", A9:"report" }[id] || id;
}

// ── Smart SEO Command Center ───────────────────────
function ActionPlanView({ state, bg2, bg3, bdr, txt, txt2, txt3, clientId, getToken, API, exportPDF }) {
  const [viewMode,   setViewMode]   = useState("business"); // business | expert
  const [done,       setDone]       = useState(new Set());
  const [copied,     setCopied]     = useState(null);
  const [generating, setGenerating] = useState(null);
  const [generated,  setGenerated]  = useState({});

  const audit    = state.A2_audit      || {};
  const keywords = state.A3_keywords   || {};
  const comp     = state.A4_competitor || {};
  const geo      = state.A8_geo        || {};
  const report   = state.A9_report     || {};
  const brief    = state.A1_brief      || {};

  // ── Build impact-scored master task list ──────────
  const allTasks = [];

  (audit.issues?.p1 || []).forEach((issue, i) => allTasks.push({
    id: `p1_${i}`, category: "technical", tier: "critical",
    label: issue.detail,
    businessLabel: `Fix: ${issue.detail?.split("(")[0]?.trim() || issue.detail}`,
    why: "This is a critical technical issue that directly blocks search engine crawling and hurts your rankings.",
    fix: issue.fix,
    impact: Math.max(90 - i * 3, 78),
    color: "#DC2626", bgColor: "#DC262608", tierLabel: "🔴 Critical",
  }));

  (comp.analysis?.quickWins || []).slice(0, 4).forEach((w, i) => allTasks.push({
    id: `qw_${i}`, category: "seo", tier: "quick_win",
    label: `Rank for "${w.keyword}"`,
    businessLabel: `Get found when customers search "${w.keyword}"`,
    why: "Your competitors rank for this keyword — you're losing traffic you could easily capture right now.",
    fix: w.action, expectedOutcome: w.expectedOutcome,
    impact: Math.max(78 - i * 3, 60),
    color: "#D97706", bgColor: "#D9770608", tierLabel: "⚡ Quick Win",
  }));

  (keywords.gaps || []).slice(0, 3).forEach((g, i) => allTasks.push({
    id: `gap_${i}`, category: "content", tier: "content",
    label: `Create content: "${g.keyword}"`,
    businessLabel: `Write a page for "${g.keyword}"`,
    why: g.reason || "No page exists for this search term — you're invisible to customers searching for it.",
    fix: g.recommendedAction,
    impact: Math.max(62 - i * 3, 48),
    color: "#0891B2", bgColor: "#0891B208", tierLabel: "📝 Content Gap",
  }));

  (audit.issues?.p2 || []).slice(0, 4).forEach((issue, i) => allTasks.push({
    id: `p2_${i}`, category: "technical", tier: "important",
    label: issue.detail,
    businessLabel: issue.detail?.split("(")[0]?.trim() || issue.detail,
    why: "An important SEO issue that affects your search visibility and page experience scores.",
    fix: issue.fix,
    impact: Math.max(55 - i * 3, 38),
    color: "#D97706", bgColor: "#D9770608", tierLabel: "🟡 Important",
  }));

  (keywords.cannibalization || []).slice(0, 2).forEach((c, i) => allTasks.push({
    id: `can_${i}`, category: "seo", tier: "important",
    label: `Fix keyword cannibalization: ${c.page}`,
    businessLabel: "Multiple pages competing for the same searches",
    why: "When multiple pages target the same keyword they split authority and cancel each other out in Google.",
    fix: c.fix,
    impact: Math.max(44 - i * 3, 32),
    color: "#D97706", bgColor: "#D9770608", tierLabel: "⚠️ Cannibalization",
  }));

  (geo.offPage?.citationTargets || []).slice(0, 3).forEach((c, i) => allTasks.push({
    id: `geo_${i}`, category: "local", tier: "local",
    label: `List on ${c.directory}`,
    businessLabel: `Get listed on ${c.directory} to appear in local searches`,
    why: "Local directory listings boost your visibility in Google Maps and local search results.",
    fix: c.url ? `Submit to ${c.directory} at ${c.url}` : `Create a listing on ${c.directory}`,
    impact: Math.max(42 - i * 3, 28),
    color: "#059669", bgColor: "#05966908", tierLabel: "🌍 Local SEO",
  }));

  allTasks.sort((a, b) => b.impact - a.impact);

  const top3      = allTasks.slice(0, 3);
  const rest      = allTasks.slice(3);
  const remaining = rest.filter(t => !done.has(t.id));
  const doneCount = done.size;
  const total     = allTasks.length;
  const next3     = report.reportData?.next3Actions || [];

  const hs         = audit.healthScore || 0;
  const scoreColor = hs >= 80 ? "#059669" : hs >= 50 ? "#D97706" : "#DC2626";

  function copyFix(fix, id) {
    navigator.clipboard?.writeText(fix || "");
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  function toggleDone(id) {
    setDone(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function generateFix(task, key) {
    setGenerating(key);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/agents/${clientId}/generate-fix`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type: task.category, detail: task.label, current: "",
          context: { businessName: brief.businessName, websiteUrl: brief.websiteUrl, services: brief.services },
        }),
      });
      const data = await res.json();
      if (data.fix) setGenerated(g => ({ ...g, [key]: data }));
    } catch {}
    setGenerating(null);
  }

  // ── Render helpers ─────────────────────────────────
  function ImpactCard({ task, taskKey, prominent = false }) {
    const isDone = done.has(task.id);
    const gen    = generated[taskKey];
    return (
      <div style={{
        background: bg2, border: `1px solid ${bdr}`, borderLeft: `4px solid ${task.color}`,
        borderRadius: 12, padding: prominent ? 18 : 14, marginBottom: 10,
        opacity: isDone ? 0.45 : 1, transition: "opacity 0.3s",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 10, background: `${task.color}22`, color: task.color, fontWeight: 700 }}>{task.tierLabel}</span>
            <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 10, background: "#7C3AED22", color: "#A78BFA", fontWeight: 700 }}>Impact: {task.impact}</span>
          </div>
          {isDone && <span style={{ fontSize: 10, color: "#059669", fontWeight: 700 }}>✅ Done</span>}
        </div>

        <div style={{ fontSize: prominent ? 14 : 13, fontWeight: 700, color: txt, marginBottom: 6 }}>
          {viewMode === "business" ? (task.businessLabel || task.label) : task.label}
        </div>

        <div style={{ fontSize: 12, color: txt2, marginBottom: 8, lineHeight: 1.55 }}>
          <span style={{ color: task.color, fontWeight: 600 }}>Why: </span>{task.why}
        </div>

        {task.expectedOutcome && (
          <div style={{ fontSize: 11, color: "#059669", marginBottom: 8 }}>📈 Expected: {task.expectedOutcome}</div>
        )}

        <div style={{ fontSize: 12, color: txt, padding: "8px 12px", background: bg3, borderRadius: 8, marginBottom: 12 }}>
          <span style={{ fontWeight: 600, color: txt2 }}>Fix: </span>{task.fix}
        </div>

        {gen && (
          <div style={{ marginBottom: 12, padding: "10px 12px", background: "#7C3AED11", borderRadius: 8, border: "1px solid #7C3AED33" }}>
            <div style={{ fontSize: 10, color: "#A78BFA", fontWeight: 700, marginBottom: 6 }}>🤖 AI-Generated Fix</div>
            <div style={{ fontSize: 12, color: txt, marginBottom: 4 }}>{gen.fix}</div>
            {gen.codeSnippet && (
              <pre style={{ fontSize: 10, color: "#059669", background: bg3, borderRadius: 6, padding: 8, overflow: "auto", margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{gen.codeSnippet}</pre>
            )}
            {gen.implementation && (
              <div style={{ fontSize: 11, color: txt2, marginTop: 6 }}>{gen.implementation}</div>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => copyFix(task.fix, task.id)}
            style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${bdr}`, background: copied === task.id ? "#05966922" : "transparent", color: copied === task.id ? "#059669" : txt2, fontSize: 11, cursor: "pointer", fontWeight: 500 }}>
            {copied === task.id ? "✅ Copied!" : "📋 Copy Fix"}
          </button>
          <button onClick={() => generateFix(task, taskKey)} disabled={generating === taskKey}
            style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #7C3AED44", background: "transparent", color: "#A78BFA", fontSize: 11, cursor: generating === taskKey ? "not-allowed" : "pointer", fontWeight: 500 }}>
            {generating === taskKey ? "⏳ Generating..." : "🤖 AI Fix"}
          </button>
          <button onClick={() => toggleDone(task.id)}
            style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #05966444", background: isDone ? "#05966922" : "transparent", color: "#059669", fontSize: 11, cursor: "pointer", fontWeight: 500 }}>
            {isDone ? "↩️ Undo" : "✅ Mark Done"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* ── Header ───────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: txt }}>🎯 SEO Command Center</div>
          <div style={{ fontSize: 12, color: txt2, marginTop: 2 }}>AI-prioritized actions sorted by business impact</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* Business / Expert toggle */}
          <div style={{ display: "flex", background: bg3, borderRadius: 20, padding: 2, border: `1px solid ${bdr}` }}>
            {[["business", "📊 Summary"], ["expert", "⚙️ Technical"]].map(([m, label]) => (
              <button key={m} onClick={() => setViewMode(m)}
                style={{ padding: "5px 14px", borderRadius: 18, border: "none", fontSize: 11, fontWeight: 600, cursor: "pointer",
                  background: viewMode === m ? "#7C3AED" : "transparent",
                  color: viewMode === m ? "#fff" : txt2 }}>
                {label}
              </button>
            ))}
          </div>
          {exportPDF && (
            <button onClick={exportPDF}
              style={{ padding: "7px 16px", borderRadius: 8, border: `1px solid ${bdr}`, background: bg2, color: txt2, fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
              📄 PDF
            </button>
          )}
        </div>
      </div>

      {/* ── Dashboard Row ─────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, marginBottom: 14 }}>
        {/* Health Ring */}
        {hs > 0 && (
          <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: "16px 20px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div style={{
              width: 80, height: 80, borderRadius: "50%",
              background: `conic-gradient(${scoreColor} ${hs * 3.6}deg, ${bg3} 0deg)`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <div style={{ width: 62, height: 62, borderRadius: "50%", background: bg2, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: scoreColor, lineHeight: 1 }}>{hs}</div>
                <div style={{ fontSize: 8, color: txt2 }}>/ 100</div>
              </div>
            </div>
            <div style={{ fontSize: 10, color: txt2, marginTop: 8, fontWeight: 600 }}>Site Health</div>
          </div>
        )}

        {/* Stats + Verdict */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              { l: "Critical",   v: audit.summary?.p1Count || 0,    c: "#DC2626" },
              { l: "Important",  v: audit.summary?.p2Count || 0,    c: "#D97706" },
              { l: "Keywords",   v: keywords.totalKeywords || 0,    c: "#7C3AED" },
              { l: "Completed",  v: doneCount,                       c: "#059669" },
            ].map(i => (
              <div key={i.l} style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 8, padding: "8px 14px", textAlign: "center", flex: 1, minWidth: 70 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: i.c }}>{i.v}</div>
                <div style={{ fontSize: 10, color: txt2 }}>{i.l}</div>
              </div>
            ))}
          </div>
          {report.reportData?.verdict && (
            <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 8, padding: "10px 14px", borderLeft: "3px solid #7C3AED", flex: 1 }}>
              <div style={{ fontSize: 10, color: "#A78BFA", fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>🤖 AI Verdict</div>
              <div style={{ fontSize: 12, color: txt, lineHeight: 1.6 }}>
                {viewMode === "business"
                  ? (report.reportData.verdict?.split(".").slice(0, 2).join(".") + ".")
                  : report.reportData.verdict}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Progress bar ──────────────────────────────── */}
      {total > 0 && (
        <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 12, color: txt2, whiteSpace: "nowrap" }}>{doneCount} / {total} actions complete</div>
          <div style={{ flex: 1, height: 6, background: bg3, borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${total > 0 ? (doneCount / total) * 100 : 0}%`, height: "100%", background: "#059669", borderRadius: 3, transition: "width 0.4s" }} />
          </div>
          <div style={{ fontSize: 11, color: "#059669", fontWeight: 700, whiteSpace: "nowrap" }}>{total > 0 ? Math.round((doneCount / total) * 100) : 0}%</div>
        </div>
      )}

      {/* ── Top 3 Impact Actions ──────────────────────── */}
      {top3.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: txt2, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
            ⚡ Top Impact Actions — Fix These First
          </div>
          {top3.map((task, i) => <ImpactCard key={task.id} task={task} taskKey={`top_${i}`} prominent />)}
        </div>
      )}

      {/* ── A9 Strategic Priorities ───────────────────── */}
      {next3.length > 0 && (
        <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#0891B2", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>🚀 AI Strategic Priorities</div>
          {next3.map((a, i) => (
            <div key={i} style={{ padding: "10px 12px", background: bg3, borderRadius: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: txt, marginBottom: 4 }}>{i + 1}. {a.action}</div>
              <div style={{ fontSize: 12, color: txt2, marginBottom: 2 }}>{a.why}</div>
              {a.how && <div style={{ fontSize: 11, color: "#0891B2", marginTop: 4 }}>How: {a.how}</div>}
            </div>
          ))}
        </div>
      )}

      {/* ── Remaining actions ─────────────────────────── */}
      {remaining.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: txt2, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
            All Actions ({remaining.length} remaining)
          </div>
          {remaining.map((task, i) => <ImpactCard key={task.id} task={task} taskKey={`rest_${i}`} />)}
        </div>
      )}

      {allTasks.length === 0 && !hs && (
        <div style={{ textAlign: "center", padding: 60, color: txt3 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🚀</div>
          <div style={{ color: txt2 }}>Run the full AI analysis to see your prioritised command center</div>
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
  return (
    <div style={{ fontSize:12, color:txt2 }}>
      {kw.totalKeywords} keywords mapped · {kw.gaps?.length || 0} gaps
      {kw.hasCannibalization && <span style={{ color:"#D97706", marginLeft:8 }}>· ⚠️ {kw.cannibalization?.length} cannibalization risks</span>}
      <span style={{ marginLeft:8 }}>· SerpAPI: {kw.hasSerpData ? "✅" : "❌"}</span>
    </div>
  );
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

      {/* E-E-A-T + Redirect Chain + Image Optimization */}
      {(c.eeat || c.redirectChain?.depth > 0 || c.imageOptimization) && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:12 }}>
          {c.eeat && (
            <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:14 }}>
              <div style={{ fontSize:11, fontWeight:700, color:txt2, marginBottom:8 }}>🏆 E-E-A-T Score</div>
              <div style={{ fontSize:22, fontWeight:800, color: c.eeat.score>=6?"#059669":c.eeat.score>=4?"#D97706":"#DC2626" }}>{c.eeat.score}<span style={{ fontSize:13, color:txt2 }}>/{c.eeat.maxScore}</span></div>
              <div style={{ marginTop:6, display:"flex", flexWrap:"wrap", gap:3 }}>
                {[["About",c.eeat.hasAboutPage],["Contact",c.eeat.hasContactPage],["Privacy",c.eeat.hasPrivacyPolicy],["Schema",c.eeat.hasSchemaOrg],["Author",c.eeat.hasAuthorBio],["Social",c.eeat.hasSocialLinks]].map(([l,v])=>(
                  <span key={l} style={{ fontSize:9, padding:"1px 6px", borderRadius:8, background:v?"#05966922":"#DC262611", color:v?"#059669":"#DC2626" }}>{v?"✅":"❌"} {l}</span>
                ))}
              </div>
            </div>
          )}
          {c.redirectChain && (
            <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:14 }}>
              <div style={{ fontSize:11, fontWeight:700, color:txt2, marginBottom:8 }}>↪️ Redirect Chain</div>
              <div style={{ fontSize:22, fontWeight:800, color: c.redirectChain.depth>=3?"#DC2626":c.redirectChain.depth>=1?"#D97706":"#059669" }}>{c.redirectChain.depth} hops</div>
              <div style={{ fontSize:10, color:txt2, marginTop:4 }}>{c.redirectChain.depth===0?"✅ No redirects":c.redirectChain.depth>=3?"🔴 Chain too long — fix immediately":"🟡 Single redirect is acceptable"}</div>
            </div>
          )}
          {c.imageOptimization && (
            <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:14 }}>
              <div style={{ fontSize:11, fontWeight:700, color:txt2, marginBottom:8 }}>🖼️ Image Optimization</div>
              <div style={{ fontSize:11, color:c.imageOptimization.nonWebpImages>3?"#D97706":"#059669" }}>WebP: {c.imageOptimization.nonWebpImages>0?`${c.imageOptimization.nonWebpImages} old format`:"✅ Good"}</div>
              <div style={{ fontSize:11, color:c.imageOptimization.missingDimensions>5?"#DC2626":"#059669", marginTop:4 }}>Dimensions: {c.imageOptimization.missingDimensions>0?`${c.imageOptimization.missingDimensions} missing`:"✅ All set"}</div>
            </div>
          )}
        </div>
      )}

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
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#DC2626", textTransform:"uppercase", marginBottom:8 }}>Content Gaps ({kw.gaps.length})</div>
          {kw.gaps.map((g,i)=>(
            <div key={i} style={{ background:bg3, borderRadius:8, padding:"8px 12px", marginBottom:6 }}>
              <div style={{ fontSize:12, color:txt, fontWeight:500 }}>{g.keyword}</div>
              <div style={{ fontSize:11, color:txt2 }}>{g.reason} → {g.recommendedAction}</div>
            </div>
          ))}
        </div>
      )}
      {(kw.snippetOpportunities||[]).length > 0 && (
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:"#0891B2", textTransform:"uppercase", marginBottom:8 }}>⭐ Featured Snippet Opportunities ({kw.snippetOpportunities.length})</div>
          {kw.snippetOpportunities.map((s,i)=>(
            <div key={i} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:8, padding:"10px 12px", marginBottom:6 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                <span style={{ fontSize:12, color:txt, fontWeight:600 }}>{s.keyword}</span>
                <div style={{ display:"flex", gap:6 }}>
                  <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:"#0891B222", color:"#0891B2" }}>{s.snippetType?.replace("_"," ")}</span>
                  <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:bg3, color:txt2 }}>{s.targetPage}</span>
                </div>
              </div>
              <div style={{ fontSize:11, color:txt2 }}>{s.strategy}</div>
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
  const serpPrev    = op.serpPreview || {};
  const h1          = op.h1Analysis  || {};
  const schema      = op.recommendations?.schemaMarkup || [];
  const tracking    = op.recommendations?.trackingSetup || {};
  const fixQueue    = op.fixQueue || [];
  const pageAuth    = op.pageAuthority || [];

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
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:12, fontWeight:600, color:"#7C3AED" }}>{s.type} — {s.page}</span>
                  {s.valid === false
                    ? <span style={{ fontSize:9, padding:"1px 6px", borderRadius:6, background:"#DC262611", color:"#DC2626" }}>❌ Invalid JSON-LD</span>
                    : s.valid === true
                    ? <span style={{ fontSize:9, padding:"1px 6px", borderRadius:6, background:"#05966911", color:"#059669" }}>✅ Valid</span>
                    : null}
                  {s.autoFixed && <span style={{ fontSize:9, padding:"1px 6px", borderRadius:6, background:"#D9770611", color:"#D97706" }}>🔧 Auto-fixed</span>}
                </div>
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

      {/* Internal PageRank Flow */}
      {pageAuth.length > 0 && (
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>📊 Internal PageRank Flow</div>
          <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, overflow:"hidden" }}>
            {pageAuth.map((p,i)=>(
              <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"8px 14px", borderBottom:`1px solid ${bdr}` }}>
                <div style={{ width:120, fontSize:11, color:txt, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.page}</div>
                <div style={{ flex:1, height:6, background:bg3, borderRadius:3 }}>
                  <div style={{ width:`${Math.min(100,(p.inboundLinks/5)*100)}%`, height:"100%", borderRadius:3, background: p.signal==="strong"?"#059669":p.signal==="medium"?"#D97706":"#6B7280" }} />
                </div>
                <span style={{ fontSize:10, color:txt2, width:60, textAlign:"right" }}>{p.inboundLinks} links in</span>
                <span style={{ fontSize:9, padding:"1px 6px", borderRadius:6, background: p.signal==="strong"?"#05966922":p.signal==="medium"?"#D9770622":"#6B728022", color: p.signal==="strong"?"#059669":p.signal==="medium"?"#D97706":"#6B7280" }}>{p.signal}</span>
              </div>
            ))}
          </div>
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

// ── Full Content View (A5) ──────────────────────────
function FullContentView({ content, bg2, bg3, bdr, txt, txt2 }) {
  const [openBrief, setOpenBrief] = useState(null);
  const d  = content.contentData || {};
  const hp = d.homepageOptimisation || {};
  const briefs  = d.newPageBriefs    || [];
  const faqs    = d.faqContent       || [];
  const refresh = d.contentRefreshFlags || [];
  const links   = hp.internalLinkSuggestions || [];

  const Pill = ({ text, color="#7C3AED" }) => (
    <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:color+"22", color, marginRight:4 }}>{text}</span>
  );
  const Row = ({ label, before, after, char }) => (
    <div style={{ marginBottom:12 }}>
      <div style={{ fontSize:10, color:txt2, fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>{label} {char && <span style={{ color: char>160?"#DC2626":char>60?"#059669":"#D97706" }}>({char} chars)</span>}</div>
      {before && <div style={{ fontSize:11, color:"#DC2626", background:bg3, borderRadius:6, padding:"6px 10px", marginBottom:4 }}>❌ Current: {before}</div>}
      <div style={{ fontSize:12, color:"#059669", background:"#05966911", borderRadius:6, padding:"8px 10px", borderLeft:"3px solid #059669" }}>✅ Recommended: {after}</div>
      {hp[label?.toLowerCase()?.replace(" ","")]?.rationale && <div style={{ fontSize:10, color:txt2, marginTop:4 }}>Why: {hp[label?.toLowerCase()?.replace(" ","")]?.rationale}</div>}
    </div>
  );

  return (
    <div>
      {/* Summary Cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:16 }}>
        {[
          { l:"Page Briefs",   v:briefs.length,               c:"#7C3AED" },
          { l:"FAQ Items",     v:faqs.length,                  c:"#0891B2" },
          { l:"Refresh Flags", v:refresh.length,              c:"#D97706" },
          { l:"Pending Approval", v:content.approvalItemsCount||0, c:"#059669" },
        ].map(i=>(
          <div key={i.l} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"12px 10px", textAlign:"center", borderTop:`2px solid ${i.c}` }}>
            <div style={{ fontSize:22, fontWeight:700, color:i.c }}>{i.v}</div>
            <div style={{ fontSize:10, color:txt2 }}>{i.l}</div>
          </div>
        ))}
      </div>

      {/* Homepage Optimisation */}
      {(hp.titleTag || hp.metaDescription || hp.h1Tag) && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:16, marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:12 }}>🏠 Homepage Optimisation</div>
          {hp.titleTag && <Row label="Title Tag" before={hp.titleTag.current} after={hp.titleTag.recommended} char={hp.titleTag.characterCount} />}
          {hp.metaDescription && <Row label="Meta Description" before={hp.metaDescription.current} after={hp.metaDescription.recommended} char={hp.metaDescription.characterCount} />}
          {hp.h1Tag && <Row label="H1 Tag" before={hp.h1Tag.current} after={hp.h1Tag.recommended} />}
          {hp.h2Suggestions?.length > 0 && (
            <div style={{ marginTop:8 }}>
              <div style={{ fontSize:10, color:txt2, fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>H2 Subheadings</div>
              {hp.h2Suggestions.map((h,i) => (
                <div key={i} style={{ fontSize:11, color:txt, padding:"4px 10px", background:bg3, borderRadius:6, marginBottom:4 }}>H2: {h}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* New Page Briefs */}
      {briefs.length > 0 && (
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>📄 New Page Briefs ({briefs.length})</div>
          {briefs.map((b,i) => (
            <div key={i} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, marginBottom:8, overflow:"hidden" }}>
              <div style={{ padding:"12px 14px", cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center" }} onClick={()=>setOpenBrief(openBrief===i?null:i)}>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:txt }}>{b.title}</div>
                  <div style={{ fontSize:11, color:txt2, marginTop:2 }}>{b.targetKeyword} · {b.recommendedWordCount} words</div>
                </div>
                <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                  <Pill text={b.intent} color={b.intent==="transactional"?"#059669":b.intent==="informational"?"#0891B2":"#7C3AED"} />
                  <Pill text={b.urgency} color={b.urgency==="high"?"#DC2626":"#D97706"} />
                  <span style={{ fontSize:12, color:txt2 }}>{openBrief===i?"▲":"▼"}</span>
                </div>
              </div>
              {openBrief===i && (
                <div style={{ background:bg3, padding:"12px 14px", borderTop:`1px solid ${bdr}` }}>
                  {b.secondaryKeywords?.length > 0 && <div style={{ fontSize:11, color:txt2, marginBottom:8 }}>Secondary: {b.secondaryKeywords.join(", ")}</div>}
                  {b.headingStructure?.length > 0 && (
                    <div style={{ marginBottom:8 }}>
                      <div style={{ fontSize:10, color:txt2, fontWeight:700, marginBottom:4 }}>HEADING STRUCTURE</div>
                      {b.headingStructure.map((h,j)=><div key={j} style={{ fontSize:11, color:txt, padding:"2px 0" }}>{h}</div>)}
                    </div>
                  )}
                  {b.contentOutline?.length > 0 && (
                    <div style={{ marginBottom:8 }}>
                      <div style={{ fontSize:10, color:txt2, fontWeight:700, marginBottom:4 }}>CONTENT OUTLINE</div>
                      {b.contentOutline.map((p,j)=><div key={j} style={{ fontSize:11, color:txt2, padding:"2px 0" }}>• {p}</div>)}
                    </div>
                  )}
                  {b.competitorBenchmark && <div style={{ fontSize:11, color:txt2 }}>Benchmark: {b.competitorBenchmark}</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* FAQ Content */}
      {faqs.length > 0 && (
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>❓ FAQ Content — Schema Ready ({faqs.length} questions)</div>
          {faqs.map((f,i) => (
            <div key={i} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:8, padding:"10px 14px", marginBottom:8 }}>
              <div style={{ fontSize:12, fontWeight:600, color:txt, marginBottom:4 }}>Q: {f.question}</div>
              <div style={{ fontSize:11, color:txt2, lineHeight:1.5 }}>A: {f.answer}</div>
              <div style={{ fontSize:10, color:"#0891B2", marginTop:4 }}>Target page: {f.targetPage}</div>
            </div>
          ))}
        </div>
      )}

      {/* Content Refresh Flags */}
      {refresh.length > 0 && (
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>🔄 Content Refresh Needed ({refresh.length})</div>
          {refresh.map((r,i) => (
            <div key={i} style={{ background:bg3, borderRadius:8, padding:"10px 12px", marginBottom:6, borderLeft:"3px solid #D97706" }}>
              <div style={{ fontSize:11, color:txt, fontWeight:600 }}>{r.page}</div>
              <div style={{ fontSize:11, color:txt2 }}>{r.issue}</div>
              <div style={{ fontSize:11, color:"#059669" }}>→ {r.action}</div>
            </div>
          ))}
        </div>
      )}

      {/* Internal Link Suggestions */}
      {links.length > 0 && (
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>🔗 Internal Link Suggestions</div>
          {links.map((l,i) => (
            <div key={i} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:8, padding:"8px 12px", marginBottom:6, display:"flex", justifyContent:"space-between" }}>
              <div>
                <div style={{ fontSize:12, color:"#0891B2", fontWeight:600 }}>"{l.anchorText}"</div>
                <div style={{ fontSize:11, color:txt2 }}>Links to: {l.targetPage}</div>
              </div>
              <div style={{ fontSize:10, color:txt2, maxWidth:180, textAlign:"right" }}>{l.reason}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Full Report View (A9) ───────────────────────────
function FullReportView({ report, bg2, bg3, bdr, txt, txt2 }) {
  const r   = report.reportData || {};
  const gsc = report.gscSummary;
  const statusColor = { green:"#059669", amber:"#D97706", red:"#DC2626" };

  return (
    <div>
      {/* Approval Status Banner */}
      <div style={{ padding:"10px 14px", borderRadius:8, background:"#D9770611", border:"1px solid #D9770633", marginBottom:14, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ fontSize:12, color:"#D97706" }}>⏳ Report awaiting human review before sending to client</div>
        <div style={{ fontSize:10, color:txt2 }}>Approval ID: {report.approvalId}</div>
      </div>

      {/* GSC Performance Card */}
      {gsc && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:16, marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:12 }}>📈 Google Search Console — {gsc.period}</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:12 }}>
            {[{l:"Clicks",v:gsc.totalClicks,c:"#059669"},{l:"Impressions",v:gsc.totalImpress,c:"#0891B2"},{l:"Avg CTR",v:gsc.avgCTR+"%",c:"#7C3AED"},{l:"Avg Position",v:"#"+gsc.avgPos,c:"#D97706"}].map(i=>(
              <div key={i.l} style={{ textAlign:"center" }}>
                <div style={{ fontSize:22, fontWeight:700, color:i.c }}>{i.v}</div>
                <div style={{ fontSize:10, color:txt2 }}>{i.l}</div>
              </div>
            ))}
          </div>
          {gsc.topKeywords?.length > 0 && (
            <div>
              <div style={{ fontSize:10, color:txt2, fontWeight:700, textTransform:"uppercase", marginBottom:6 }}>Top Keywords</div>
              {gsc.topKeywords.map((k,i)=>(
                <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"4px 8px", background:bg3, borderRadius:6, marginBottom:4 }}>
                  <span style={{ fontSize:11, color:txt }}>{k.keyword}</span>
                  <div style={{ display:"flex", gap:12 }}>
                    <span style={{ fontSize:11, color:"#059669" }}>{k.clicks} clicks</span>
                    <span style={{ fontSize:11, color:txt2 }}>#{k.position}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Executive Verdict */}
      {r.verdict && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:16, marginBottom:12, borderLeft:"4px solid #7C3AED" }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#7C3AED", textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>📊 Executive Verdict</div>
          <div style={{ fontSize:14, color:txt, lineHeight:1.6, fontWeight:500 }}>{r.verdict}</div>
        </div>
      )}

      {/* KPI Scorecard */}
      {r.kpiScorecard?.length > 0 && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:16, marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>🎯 KPI Scorecard</div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
              <thead>
                <tr style={{ borderBottom:`1px solid ${bdr}` }}>
                  {["Metric","Value","vs Target","Status","Notes"].map(h=>(
                    <th key={h} style={{ textAlign:"left", padding:"6px 8px", color:txt2, fontWeight:600, fontSize:10, textTransform:"uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.kpiScorecard.map((row,i)=>(
                  <tr key={i} style={{ borderBottom:`1px solid ${bdr}` }}>
                    <td style={{ padding:"8px", color:txt, fontWeight:500 }}>{row.metric}</td>
                    <td style={{ padding:"8px", color:txt, fontWeight:700 }}>{row.value}</td>
                    <td style={{ padding:"8px", color:txt2 }}>{row.vs}</td>
                    <td style={{ padding:"8px" }}>
                      <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:(statusColor[row.status]||"#6B7280")+"22", color:statusColor[row.status]||"#6B7280" }}>
                        {row.status==="green"?"✅":row.status==="amber"?"⚠️":"❌"} {row.status}
                      </span>
                    </td>
                    <td style={{ padding:"8px", color:txt2, fontSize:10 }}>{row.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* What Worked / What Didn't */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
        {r.whatWorked?.length > 0 && (
          <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:14 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#059669", textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>✅ What Worked</div>
            {r.whatWorked.map((w,i)=>(
              <div key={i} style={{ padding:"8px 0", borderBottom:`1px solid ${bdr}` }}>
                <div style={{ fontSize:11, color:txt, fontWeight:600 }}>{w.item}</div>
                <div style={{ fontSize:10, color:txt2 }}>{w.impact}</div>
                <div style={{ fontSize:10, color:"#059669" }}>→ {w.keepDoing}</div>
              </div>
            ))}
          </div>
        )}
        {r.whatDidnt?.length > 0 && (
          <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:14 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#DC2626", textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>❌ What Didn't Work</div>
            {r.whatDidnt.map((w,i)=>(
              <div key={i} style={{ padding:"8px 0", borderBottom:`1px solid ${bdr}` }}>
                <div style={{ fontSize:11, color:txt, fontWeight:600 }}>{w.item}</div>
                <div style={{ fontSize:10, color:txt2 }}>{w.hypothesis}</div>
                <div style={{ fontSize:10, color:"#D97706" }}>→ Fix: {w.action}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Why It Happened */}
      {r.whyItHappened && (
        <div style={{ background:bg3, borderRadius:8, padding:14, marginBottom:12, fontSize:12, color:txt2, lineHeight:1.6, borderLeft:`3px solid #0891B2` }}>
          <div style={{ fontSize:10, fontWeight:700, color:"#0891B2", textTransform:"uppercase", marginBottom:6 }}>Context — Why It Happened</div>
          {r.whyItHappened}
        </div>
      )}

      {/* Technical Health */}
      {r.technicalHealthSummary && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:8, padding:14, marginBottom:12 }}>
          <div style={{ fontSize:10, fontWeight:700, color:txt2, textTransform:"uppercase", marginBottom:6 }}>🏥 Technical Health</div>
          <div style={{ fontSize:12, color:txt, lineHeight:1.6 }}>{r.technicalHealthSummary}</div>
        </div>
      )}

      {/* Next 3 Actions */}
      {r.next3Actions?.length > 0 && (
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>🚀 Next 3 Actions</div>
          {r.next3Actions.map((a,i)=>(
            <div key={i} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"12px 14px", marginBottom:8, borderLeft:"3px solid #7C3AED" }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                <div style={{ fontSize:13, fontWeight:700, color:txt }}>{i+1}. {a.action}</div>
                <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:"#7C3AED22", color:"#A78BFA" }}>Priority {a.priority}</span>
              </div>
              <div style={{ fontSize:11, color:txt2, marginBottom:4 }}>{a.why}</div>
              <div style={{ fontSize:11, color:"#059669" }}>Expected: {a.expectedOutcome}</div>
            </div>
          ))}
        </div>
      )}

      {/* Off-Page Summary */}
      {r.offPageSummary && (
        <div style={{ background:bg3, borderRadius:8, padding:14, fontSize:12, color:txt2, lineHeight:1.6, borderLeft:"3px solid #D97706" }}>
          <div style={{ fontSize:10, fontWeight:700, color:"#D97706", textTransform:"uppercase", marginBottom:6 }}>🔗 Off-Page & Backlinks</div>
          {r.offPageSummary}
        </div>
      )}
    </div>
  );
}
