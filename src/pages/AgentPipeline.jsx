import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import ApprovalQueue from "./ApprovalQueue";
import AlertCenter from "./AlertCenter";
import PrintReport from "./PrintReport";
import AIChatBot from "../components/AIChatBot";
import IntegrationsPanel from "../components/IntegrationsPanel";
import ContentAutopilotPanel from "../components/ContentAutopilotPanel";
import ROIDashboard from "../components/ROIDashboard";
import GA4Panel from "../components/GA4Panel";
import TrackingVerifier from "../components/TrackingVerifier";
import RankTrackerPanel from "../components/RankTrackerPanel";
import ControlRoom from "./ControlRoom";
import AttributionDashboard from "../components/AttributionDashboard";
import PredictiveForecastPanel from "../components/PredictiveForecastPanel";
import AuditPatternsPanel from "../components/AuditPatternsPanel";
import PageScoresPanel from "../components/PageScoresPanel";
import RulesEnginePanel from "../components/RulesEnginePanel";

// ── Backend Health Gate ─────────────────────────────────────────────────────
// Render free tier sleeps after 15min idle. Cold-start returns 502 without
// CORS headers, which the browser reports as "missing Access-Control-Allow-Origin".
// Problem: polling loops (4s pipeline + 3s crawl) fire multi-request bursts every
// tick, amplifying a single cold-start into hundreds of blocked requests.
// Fix: a shared gate that pauses ALL polling when /health fails, with exponential
// backoff. Polling tick early-exits if backend is "cold"; a background waker
// re-probes /health and resumes only when it's actually up.
const _healthGate = {
  cold: false,           // true = skip all fetches, backend is dead
  nextProbe: 0,          // earliest timestamp to retry /health
  consecutiveFailures: 0,
};
async function probeBackend(API) {
  try {
    const r = await fetch(`${API}/health`, { signal: AbortSignal.timeout(8000) });
    if (r.ok) {
      _healthGate.cold = false;
      _healthGate.consecutiveFailures = 0;
      _healthGate.nextProbe = 0;
      return true;
    }
    throw new Error("not ok");
  } catch {
    _healthGate.cold = true;
    _healthGate.consecutiveFailures += 1;
    // Exponential backoff: 3s → 6s → 12s → 20s → 30s (cap)
    const delays = [3000, 6000, 12000, 20000, 30000];
    const delay  = delays[Math.min(_healthGate.consecutiveFailures - 1, delays.length - 1)];
    _healthGate.nextProbe = Date.now() + delay;
    return false;
  }
}
// Callers use this before firing any request burst. Returns true when backend
// is alive; false means "skip this tick, backend is warming up."
async function ensureBackendUp(API) {
  if (!_healthGate.cold) return true;
  if (Date.now() < _healthGate.nextProbe) return false;
  return probeBackend(API);
}
// ────────────────────────────────────────────────────────────────────────────

const ALL_AGENTS = [
  { id:"A1",  label:"Client Brief",       icon:"📋", phase:1 },
  { id:"A2",  label:"Technical Audit",    icon:"🏥", phase:1 },
  { id:"A3",  label:"Keyword Research",   icon:"🔍", phase:2 },
  { id:"A4",  label:"Competitor Intel",   icon:"🕵️", phase:2 },
  { id:"A5",  label:"Content",            icon:"✍️", phase:3 },
  { id:"A6",  label:"On-Page & Tags",     icon:"🏷️", phase:3 },
  { id:"A7",  label:"Technical/CWV",      icon:"⚡", phase:3 },
  { id:"A8",  label:"GEO & Off-Page",     icon:"🌍", phase:3 },
  { id:"A9",  label:"Reports",            icon:"📊", phase:4 },
  { id:"A10", label:"Rank Tracker",       icon:"📈", phase:4 },
  { id:"A11", label:"Link Building",      icon:"🔗", phase:4 },
  { id:"A12", label:"Auto-Fix Engine",    icon:"⚡", phase:4 },
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
  const [notifCount,    setNotifCount]    = useState(0);
  const [pipelineStatus, setPipelineStatus] = useState("idle"); // idle | running | complete | failed
  const [automationMode, setAutomationMode] = useState("manual"); // manual | semi | full
  const [savingMode,    setSavingMode]    = useState(false);
  const [portalUrl,     setPortalUrl]     = useState(null);
  const [showPortal,    setShowPortal]    = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [resetting,     setResetting]     = useState(false);
  const [agencyBrand,   setAgencyBrand]   = useState({ agencyName:"", primaryColor:"#443DCB", logoUrl:"" });
  const [crawlProgress, setCrawlProgress] = useState(null); // { crawled, total, pct }
  const crawlPollRef = useRef(null);
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
    // Wait for React to render the PrintReport overlay, then use browser's native print
    setTimeout(() => {
      // Inject @media print styles that hide everything except the .print-report overlay
      // This avoids popup-blocker issues entirely — no new window needed
      const style = document.createElement("style");
      style.id = "seo-pdf-print-style";
      style.innerHTML = [
        "@media print {",
        "  @page { margin: 12mm 10mm; size: A4; }",
        "  body > * { display: none !important; }",
        "  .print-report { display: block !important; position: static !important;",
        "    inset: auto !important; z-index: auto !important; overflow: visible !important; }",
        "  body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }",
        "  .page-break { page-break-before: always; }",
        "  .no-break { page-break-inside: avoid; }",
        "}",
      ].join("\n");
      document.head.appendChild(style);

      window.print();

      // Cleanup after print dialog closes (afterprint fires in all modern browsers)
      const cleanup = () => {
        const el = document.getElementById("seo-pdf-print-style");
        if (el) el.remove();
        setPrintMode(false);
        window.removeEventListener("afterprint", cleanup);
      };
      window.addEventListener("afterprint", cleanup);
      // Fallback: cleanup after 60s if afterprint never fires
      setTimeout(cleanup, 60000);
    }, 800);
  }

  async function load(silent = false, retries = 4) {
    if (!silent) setLoading(true);
    setError("");
    // ── Health gate: skip entirely if backend is cold ──
    // For silent polling ticks this is critical — otherwise 5 parallel fetches
    // fire every 4s against a dead backend and flood the console with CORS errors.
    const up = await ensureBackendUp(API);
    if (!up) {
      if (!silent) {
        setError("Backend is warming up (Render cold-start). Retrying in a few seconds…");
        // Schedule a follow-up load so the user sees data once the backend is alive
        setTimeout(() => loadLatest.current && loadLatest.current(false), 4000);
        setLoading(false);
      }
      return;
    }
    try {
      const token = await getToken();
      // During polling (silent=true) only fetch the two lightweight status endpoints.
      // Keys, alerts, and notifications only change rarely — fetch once on full load.
      // This cuts Firestore reads from ~15/tick to ~4/tick (client doc + shared_state).
      const coreFetches = [
        fetch(`${API}/api/clients/${clientId}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/api/agents/${clientId}/pipeline`, { headers: { Authorization: `Bearer ${token}` } }),
      ];
      const extraFetches = silent ? [null, null, null] : [
        fetch(`${API}/api/agents/${clientId}/alerts`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
        fetch(`${API}/api/agents/notifications`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
        fetch(`${API}/api/keys/get`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
      ];
      const [clientRes, pipelineRes, alertsRes, notifRes, keysRes] = await Promise.all([...coreFetches, ...extraFetches]);
      const clientData   = await clientRes.json();
      const pipelineData = await pipelineRes.json();
      const alertsData   = alertsRes  ? await alertsRes.json().catch(() => ({}))  : {};
      const notifData    = notifRes   ? await notifRes.json().catch(() => ({}))   : {};
      const keysData     = keysRes    ? await keysRes.json().catch(() => ({}))    : {};
      if (keysData.brand) setAgencyBrand(b => ({ ...b, ...keysData.brand }));
      if (!clientRes.ok) throw new Error(clientData.error || "Failed to load client");
      setClient(clientData.client);
      setState(clientData.state || {});
      setPipeline(pipelineData.pipeline || {});
      setAutomationMode(clientData.client?.automationMode || "manual");
      if (!silent) setAlertCount((alertsData.alerts || []).filter(a => !a.resolved).length);
      if (!silent) setNotifCount(notifData.unread || 0);

      const ps = pipelineData.pipelineStatus || clientData.client?.pipelineStatus || "idle";
      setPipelineStatus(ps);

      // Auto-resume polling if page is refreshed while pipeline is still running
      if (ps === "running" && !pollRef.current) {
        pollRef.current = setInterval(() => loadLatest.current(true), 12000);
      }
      // Stop polling when done, auto-navigate to results
      if (ps === "complete" || ps === "failed") {
        if (pollRef.current)      { clearInterval(pollRef.current);      pollRef.current      = null; }
        if (crawlPollRef.current) { clearInterval(crawlPollRef.current); crawlPollRef.current = null; }
        setCrawlProgress(null);
        if (ps === "complete") setActiveTab("dashboard");
      }
    } catch (e) {
      // Network error = backend likely cold-started mid-request.
      // Mark the gate cold so ALL polling ticks skip until health comes back,
      // instead of each tick retrying in parallel and amplifying the failure.
      const isNetworkError = e.message === "Failed to fetch" || e.name === "TypeError" || e.message?.includes("NetworkError");
      if (isNetworkError) {
        _healthGate.cold = true;
        _healthGate.consecutiveFailures = Math.max(1, _healthGate.consecutiveFailures);
        _healthGate.nextProbe = Date.now() + 3000;
        if (!silent && retries > 0) {
          // For the user-facing initial load only: wait + retry once via the gate
          await new Promise(r => setTimeout(r, 4000));
          return load(silent, retries - 1);
        }
        if (!silent) setError("Backend is warming up. The page will refresh automatically once it's ready.");
      } else if (!silent) {
        setError(e.message || "Failed to load pipeline");
      }
    }
    if (!silent) setLoading(false);
  }

  // Keep loadLatest ref up-to-date so the setInterval always calls the current version
  loadLatest.current = load;

  useEffect(() => {
    load();
    return () => {
      if (pollRef.current)      { clearInterval(pollRef.current);      pollRef.current      = null; }
      if (crawlPollRef.current) { clearInterval(crawlPollRef.current); crawlPollRef.current = null; }
    };
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
      if (!res.ok) {
        const msg = data.missingKey === "llm"
          ? "⚠️ No AI key set — go to ⚙️ Settings and add a free Groq key (groq.com) before running the pipeline."
          : data.error || "Failed to start pipeline";
        setError(msg); return;
      }

      setPipelineStatus("running");
      setActiveTab("pipeline");
      setCrawlProgress(null);

      // Poll every 12 seconds — balance responsiveness vs Firestore quota
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => loadLatest.current(true), 12000);

      // Also poll A2 crawl status every 10s while pipeline is running
      if (crawlPollRef.current) clearInterval(crawlPollRef.current);
      crawlPollRef.current = setInterval(async () => {
        // Skip tick if backend is cold — avoid piling requests on a dead service
        if (_healthGate.cold) return;
        try {
          const t = await getToken();
          const r = await fetch(`${API}/api/agents/${clientId}/A2/crawl-status`, {
            headers: { Authorization: `Bearer ${t}` },
          });
          if (r.ok) {
            const d = await r.json();
            if (d.crawlProgress) setCrawlProgress(d.crawlProgress);
            // Stop crawl polling once A2 has completed — keeps working if pipeline still runs
            if (d.status === "complete" || d.status === "signed_off") {
              if (crawlPollRef.current) { clearInterval(crawlPollRef.current); crawlPollRef.current = null; }
              setCrawlProgress(null);
            }
          }
        } catch {
          // Network error — mark cold so all polling pauses until health recovers
          _healthGate.cold = true;
          _healthGate.nextProbe = Date.now() + 3000;
        }
      }, 10000);
    } catch (e) {
      setError(e.message || "Failed to start pipeline");
    }
  }

  async function hardReset() {
    if (!window.confirm("Hard reset will clear all agent results and let you start fresh. Continue?")) return;
    setResetting(true); setError("");
    try {
      const token = await getToken();
      const res   = await fetch(`${API}/api/agents/${clientId}/reset-pipeline`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Reset failed"); return; }
      setPipelineStatus("idle");
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      if (crawlPollRef.current) { clearInterval(crawlPollRef.current); crawlPollRef.current = null; }
      setCrawlProgress(null);
      await load();
    } catch (e) { setError(e.message || "Reset failed"); }
    finally { setResetting(false); }
  }

  async function generatePortal() {
    setPortalLoading(true);
    try {
      const token = await getToken();
      const res   = await fetch(`${API}/api/portal/generate/${clientId}`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate portal");
      setPortalUrl(data.url);
      setShowPortal(true);
    } catch (e) { setError(e.message); }
    setPortalLoading(false);
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
    setRunning("A2"); setError(""); setCrawlProgress(null);
    // Poll crawl progress every 10s while audit runs
    if (crawlPollRef.current) clearInterval(crawlPollRef.current);
    crawlPollRef.current = setInterval(async () => {
      if (_healthGate.cold) return; // backend warming up, skip
      try {
        const t = await getToken();
        const r = await fetch(`${API}/api/agents/${clientId}/A2/crawl-status`, { headers: { Authorization: `Bearer ${t}` } });
        if (r.ok) { const d = await r.json(); if (d.crawlProgress) setCrawlProgress(d.crawlProgress); }
      } catch {
        _healthGate.cold = true;
        _healthGate.nextProbe = Date.now() + 3000;
      }
    }, 10000);
    const token = await getToken();
    const res   = await fetch(`${API}/api/clients/${clientId}/audit`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    clearInterval(crawlPollRef.current); crawlPollRef.current = null; setCrawlProgress(null);
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
    } else if (agentId === "A8") {
      url  = `${API}/api/agents/${clientId}/A8/run`;
      body = JSON.stringify({ googleToken: googleToken || null });
    } else if (agentId === "A11") {
      url  = `${API}/api/agents/${clientId}/A11/run`;
      body = "{}";
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
    tab:   (a) => ({ padding:"6px 16px", borderRadius:20, fontSize:12, cursor:"pointer", fontWeight:a?600:400, background:a?"#443DCB22":"transparent", color:a?"#6B62E8":txt2, border:`1px solid ${a?"#443DCB44":bdr}` }),
    btn:   (c="#443DCB", dis=false) => ({ padding:"8px 18px", borderRadius:8, border:"none", background:dis?bdr:c, color:dis?txt3:"#fff", fontWeight:600, fontSize:12, cursor:dis?"not-allowed":"pointer" }),
    agentRow: (active) => ({ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 16px", borderRadius:10, marginBottom:8, background:active?`#443DCB11`:bg3, border:`1px solid ${active?"#443DCB44":bdr}`, cursor:"pointer" }),
  };

  if (loading) return <div style={{...s.wrap, display:"flex", alignItems:"center", justifyContent:"center", color:txt3}}>Loading pipeline...</div>;

  // Print mode — show white-label report for browser print/save-as-PDF
  if (printMode) return (
    <div className="print-report" style={{ position:"fixed", inset:0, zIndex:9999, background:"#fff", overflowY:"auto" }}>
      <PrintReport client={client} state={state} brand={agencyBrand} />
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
        {/* Share Portal button */}
        <button onClick={generatePortal} disabled={portalLoading}
          style={{ padding:"8px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg2, color:txt2, fontSize:12, cursor:"pointer", fontWeight:600, display:"flex", alignItems:"center", gap:5 }}
          title="Generate a shareable read-only report link for your client">
          {portalLoading ? "⏳" : "🔗"} Share Portal
        </button>

        {/* Notification bell */}
        <div style={{ position:"relative", cursor:"pointer" }} onClick={() => setActiveTab("alerts")} title="View alerts">
          <div style={{ padding:"8px 10px", borderRadius:10, border:`1px solid ${bdr}`, background:bg2, fontSize:16 }}>🔔</div>
          {notifCount > 0 && (
            <div style={{ position:"absolute", top:-4, right:-4, background:"#DC2626", color:"#fff", borderRadius:10, fontSize:9, fontWeight:800, padding:"1px 5px", minWidth:16, textAlign:"center" }}>{notifCount}</div>
          )}
        </div>

        {pipelineStatus === "running" ? (
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 16px", borderRadius:20, background:"#D9770611", border:"1px solid #D9770644" }}>
              <span style={{ fontSize:12, color:"#D97706" }}>⏳</span>
              <span style={{ fontSize:12, color:"#D97706", fontWeight:600 }}>
                {crawlProgress && crawlProgress.crawled > 0
                  ? `Crawling ${crawlProgress.crawled}/${crawlProgress.total || "?"} pages (${crawlProgress.pct || 0}%)`
                  : "Analysing..."}
              </span>
            </div>
            <button
              onClick={hardReset}
              disabled={resetting}
              title="Pipeline stuck? Clear all agent results and start fresh."
              style={{ padding:"8px 14px", borderRadius:20, border:"1px solid #DC2626", background:"transparent", color:"#DC2626", fontWeight:700, fontSize:12, cursor:"pointer" }}
            >
              {resetting ? "Resetting…" : "⚠️ Hard Reset"}
            </button>
          </div>
        ) : (
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <button
              onClick={runFullAnalysis}
              disabled={!!running}
              style={{ padding:"10px 20px", borderRadius:20, border:"none", background:"linear-gradient(135deg,#443DCB,#059669)", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", boxShadow:"0 2px 12px #443DCB44" }}
            >
              {pipelineStatus === "complete" ? "🔄 Re-run Analysis" : "🚀 Run Full SEO Analysis"}
            </button>
            {(pipelineStatus === "failed" || Object.values(client?.agents || {}).some(s => s === "failed")) && (
              <button
                onClick={hardReset}
                disabled={resetting}
                title="Clear all stuck/failed agents and start fresh."
                style={{ padding:"10px 16px", borderRadius:20, border:"1px solid #DC2626", background:"#DC262611", color:"#DC2626", fontWeight:700, fontSize:13, cursor:"pointer" }}
              >
                {resetting ? "Resetting…" : "⚠️ Hard Reset"}
              </button>
            )}
          </div>
        )}
      </div>

      {error && <div style={{ padding:"10px 14px", borderRadius:8, background:"#DC262611", color:"#DC2626", fontSize:12, marginBottom:14 }}>{error}<button onClick={()=>setError("")} style={{ marginLeft:10, background:"none", border:"none", color:"#DC2626", cursor:"pointer" }}>×</button></div>}

      {/* Live crawl progress banner — shows during pipeline or standalone A2 run */}
      {pipelineStatus === "running" && crawlProgress && crawlProgress.total > 0 && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderLeft:"4px solid #443DCB", borderRadius:10, padding:"12px 16px", marginBottom:14 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
            <span style={{ fontSize:12, fontWeight:700, color:"#443DCB" }}>🕷️ Site Crawler (A2)</span>
            <span style={{ fontSize:11, color:txt2 }}>
              {crawlProgress.crawled} / {crawlProgress.total} pages · {crawlProgress.pct || 0}%
            </span>
          </div>
          <div style={{ height:6, background:bg3, borderRadius:3, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${crawlProgress.pct || 0}%`, background:"#443DCB", transition:"width .5s" }} />
          </div>
        </div>
      )}

      {/* Tabs — grouped to reduce overwhelm */}
      <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:20 }}>

        {/* Row 1 — Core navigation (always visible) */}
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
          <span style={{ fontSize:9, fontWeight:700, color:txt3, textTransform:"uppercase", letterSpacing:"0.08em", minWidth:38 }}>Core</span>
          <div style={s.tab(activeTab==="pipeline")} onClick={()=>setActiveTab("pipeline")}>🔗 Pipeline</div>
          {(isComplete("A2") || isComplete("A3")) && (
            <div style={{...s.tab(activeTab==="actionplan"), background:activeTab==="actionplan"?"#059669":"transparent", color:activeTab==="actionplan"?"#fff":txt2, border:`1px solid ${activeTab==="actionplan"?"#059669":bdr}`}} onClick={()=>setActiveTab("actionplan")}>🎯 Action Plan</div>
          )}
          <div style={s.tab(activeTab==="approvals")} onClick={()=>setActiveTab("approvals")}>
            ✅ Approvals {approvalCount > 0 && <span style={{ marginLeft:4, background:"#D97706", color:"#fff", borderRadius:10, fontSize:9, padding:"1px 5px" }}>{approvalCount}</span>}
          </div>
          <div style={s.tab(activeTab==="alerts")} onClick={()=>setActiveTab("alerts")}>
            🚨 Alerts {alertCount > 0 && <span style={{ marginLeft:4, background:"#DC2626", color:"#fff", borderRadius:10, fontSize:9, padding:"1px 5px" }}>{alertCount}</span>}
          </div>
          {isComplete("A2") && <div style={s.tab(activeTab==="tasks")} onClick={()=>setActiveTab("tasks")}>📋 Tasks</div>}
        </div>

        {/* Row 2 — Analysis results (shown after pipeline runs) */}
        {(isComplete("A2") || isComplete("A3") || isComplete("A9")) && (
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
            <span style={{ fontSize:9, fontWeight:700, color:txt3, textTransform:"uppercase", letterSpacing:"0.08em", minWidth:38 }}>Results</span>
            {isComplete("A2") && <div style={{...s.tab(activeTab==="dashboard"), background:activeTab==="dashboard"?"#443DCB":"transparent", color:activeTab==="dashboard"?"#fff":txt2, border:`1px solid ${activeTab==="dashboard"?"#443DCB":bdr}`}} onClick={()=>setActiveTab("dashboard")}>🎯 Dashboard</div>}
            {isComplete("A2") && <div style={s.tab(activeTab==="score")} onClick={()=>setActiveTab("score")}>🏆 Score</div>}
            {isComplete("A2") && <div style={s.tab(activeTab==="audit")} onClick={()=>setActiveTab("audit")}>🏥 Audit</div>}
            {isComplete("A3") && <div style={s.tab(activeTab==="keywords")} onClick={()=>setActiveTab("keywords")}>🔍 Keywords</div>}
            {isComplete("A4") && <div style={s.tab(activeTab==="competitor")} onClick={()=>setActiveTab("competitor")}>🕵️ Competitor</div>}
            {isComplete("A5") && <div style={s.tab(activeTab==="content")} onClick={()=>setActiveTab("content")}>✍️ Content</div>}
            {isComplete("A6") && <div style={s.tab(activeTab==="onpage")} onClick={()=>setActiveTab("onpage")}>🏷️ On-Page</div>}
            {isComplete("A7") && <div style={s.tab(activeTab==="technical")} onClick={()=>setActiveTab("technical")}>⚡ CWV</div>}
            {isComplete("A8") && <div style={s.tab(activeTab==="geo")} onClick={()=>setActiveTab("geo")}>🌍 GEO</div>}
            {isComplete("A9") && <div style={s.tab(activeTab==="report")} onClick={()=>setActiveTab("report")}>📊 Report</div>}
            {isComplete("A11") && <div style={s.tab(activeTab==="linkbuilding")} onClick={()=>setActiveTab("linkbuilding")}>🔗 Link Building</div>}
            {isComplete("A2") && <div style={s.tab(activeTab==="pages")} onClick={()=>setActiveTab("pages")}>📄 Pages</div>}
            {isComplete("A2") && <div style={s.tab(activeTab==="pagescores")} onClick={()=>setActiveTab("pagescores")}>📊 Page Scores</div>}
            {isComplete("A5") && <div style={s.tab(activeTab==="briefs")} onClick={()=>setActiveTab("briefs")}>📝 Briefs</div>}
            {isComplete("A10") && <div style={s.tab(activeTab==="comparison")} onClick={()=>setActiveTab("comparison")}>📊 Before/After</div>}
          </div>
        )}

        {/* Row 3 — Rankings */}
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
          <span style={{ fontSize:9, fontWeight:700, color:txt3, textTransform:"uppercase", letterSpacing:"0.08em", minWidth:38 }}>Rankings</span>
          <div style={s.tab(activeTab==="ranktracker")} onClick={()=>setActiveTab("ranktracker")}>📍 Rank Tracker</div>
          <div style={s.tab(activeTab==="backlinks")} onClick={()=>setActiveTab("backlinks")}>🔗 Backlinks</div>
          <div style={s.tab(activeTab==="kwresearch")} onClick={()=>setActiveTab("kwresearch")}>🔎 KW Research</div>
          <div style={{...s.tab(activeTab==="gsckeys"), background:activeTab==="gsckeys"?"#0891B2":"transparent", color:activeTab==="gsckeys"?"#fff":txt2, border:`1px solid ${activeTab==="gsckeys"?"#0891B2":bdr}`}} onClick={()=>setActiveTab("gsckeys")}>📈 GSC Keywords</div>
        </div>

        {/* Row 4 — Tools & Settings */}
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
          <span style={{ fontSize:9, fontWeight:700, color:txt3, textTransform:"uppercase", letterSpacing:"0.08em", minWidth:38 }}>Tools</span>
          <div style={{...s.tab(activeTab==="controlroom"), background:activeTab==="controlroom"?"#059669":"transparent", color:activeTab==="controlroom"?"#fff":txt2, border:`1px solid ${activeTab==="controlroom"?"#059669":bdr}`}} onClick={()=>setActiveTab("controlroom")}>🏠 Control Room</div>
          <div style={s.tab(activeTab==="localseo")} onClick={()=>setActiveTab("localseo")}>🏪 Local SEO</div>
          {isComplete("A10") && <div style={s.tab(activeTab==="roi")} onClick={()=>setActiveTab("roi")}>💰 ROI</div>}
          <div style={s.tab(activeTab==="analytics")} onClick={()=>setActiveTab("analytics")}>📊 Analytics</div>
          <div style={s.tab(activeTab==="tracking")} onClick={()=>setActiveTab("tracking")}>🔍 Tracking</div>
          {isComplete("A3") && <div style={s.tab(activeTab==="autopilot")} onClick={()=>setActiveTab("autopilot")}>📝 Autopilot</div>}
          <div style={s.tab(activeTab==="integrations")} onClick={()=>setActiveTab("integrations")}>🔌 Integrations</div>
          {isComplete("A9") && <div style={{...s.tab(activeTab==="cmo"), background:activeTab==="cmo"?"#443DCB":"transparent", color:activeTab==="cmo"?"#fff":txt2, border:`1px solid ${activeTab==="cmo"?"#443DCB":bdr}`}} onClick={()=>setActiveTab("cmo")}>🧠 CMO Agent</div>}
          {isComplete("A2") && <div style={s.tab(activeTab==="conversion")} onClick={()=>setActiveTab("conversion")}>🎯 Conversion</div>}
          {isComplete("A9") && <div style={s.tab(activeTab==="impactreport")} onClick={()=>setActiveTab("impactreport")}>📑 Impact Report</div>}
          <div style={s.tab(activeTab==="attribution")} onClick={()=>setActiveTab("attribution")}>🔗 Attribution</div>
          {isComplete("A3") && <div style={s.tab(activeTab==="forecast")} onClick={()=>setActiveTab("forecast")}>🔮 Forecast</div>}
          {isComplete("A2") && <div style={s.tab(activeTab==="patterns")} onClick={()=>setActiveTab("patterns")}>🗂️ Site Patterns</div>}
          <div style={s.tab(activeTab==="rules")} onClick={()=>setActiveTab("rules")}>⚙️ Rules</div>
        </div>

      </div>

      {/* Pipeline Tab */}
      {/* Automation Mode Panel */}
      {isComplete("A2") && (
        <AutomationModePanel
          automationMode={automationMode} setAutomationMode={setAutomationMode}
          savingMode={savingMode} setSavingMode={setSavingMode}
          clientId={clientId} getToken={getToken} API={API}
          state={state} bg2={bg2} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2}
        />
      )}

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
                style={{ padding:"12px 32px", borderRadius:24, border:"none", background:"linear-gradient(135deg,#443DCB,#059669)", color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", boxShadow:"0 4px 20px #443DCB44" }}
              >
                🚀 Run Full SEO Analysis
              </button>
            </div>
          )}

          {/* ── A0 SEO Head Strategy Panel ───────────────────────────── */}
          {client?.seoHeadStrategy && (
            <div style={{ background: dark ? "#1a1f2e" : "#EEF4FF", border: `1px solid ${dark ? "#2d3a5a" : "#B8D0F8"}`, borderLeft: "4px solid #443DCB", borderRadius: 12, padding: "14px 18px", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 18 }}>🧠</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#443DCB" }}>SEO Head Priority</span>
                </div>
                {client?.seoHeadStrategyAt && (
                  <span style={{ fontSize: 10, color: txt2 }}>Updated {new Date(client.seoHeadStrategyAt).toLocaleDateString()}</span>
                )}
              </div>
              {/* Top Priority */}
              <div style={{ fontSize: 13, fontWeight: 700, color: txt, marginBottom: 10, padding: "8px 12px", background: dark ? "#243050" : "#fff", borderRadius: 8, border: `1px solid ${dark ? "#2d3a5a" : "#D0E4FF"}` }}>
                🎯 {client.seoHeadStrategy.topPriority}
              </div>
              {/* Warnings */}
              {(client.seoHeadStrategy.criticalWarnings || []).length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  {(client.seoHeadStrategy.criticalWarnings || []).slice(0, 2).map((w, i) => (
                    <div key={i} style={{ fontSize: 11, color: "#DC2626", padding: "4px 10px", background: "#FEF2F2", borderRadius: 6, marginBottom: 4, borderLeft: "3px solid #DC2626" }}>
                      ⚠️ {w}
                    </div>
                  ))}
                </div>
              )}
              {/* Quick Wins */}
              {(client.seoHeadStrategy.quickWins || []).length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 6 }}>
                  {(client.seoHeadStrategy.quickWins || []).slice(0, 3).map((win, i) => (
                    <div key={i} style={{ fontSize: 11, color: "#059669", padding: "5px 10px", background: dark ? "#0a2a1a" : "#F0FDF4", borderRadius: 6, border: `1px solid ${dark ? "#134e2a" : "#BBF7D0"}` }}>
                      ✅ {win}
                    </div>
                  ))}
                </div>
              )}
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
                    {ag.id === "A2" && running === "A2" && crawlProgress && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#D97706" }}>⏳ Crawling pages...</span>
                          <span style={{ fontSize: 12, color: txt2 }}>{crawlProgress.crawled} / {crawlProgress.total || "?"} pages ({crawlProgress.pct || 0}%)</span>
                        </div>
                        <div style={{ height: 8, background: bg2, borderRadius: 4, overflow: "hidden", border: `1px solid ${bdr}` }}>
                          <div style={{ height: "100%", width: `${crawlProgress.pct || 0}%`, background: "#443DCB", borderRadius: 4, transition: "width .5s" }} />
                        </div>
                      </div>
                    )}
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
        <FullTechnicalView
          tech={state.A7_technical} audit={state.A2_audit} dark={dark} bg2={bg2} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2}
          clientId={clientId} API={API} getToken={getToken}
          onRefresh={async () => {
            try {
              const token = await getToken();
              setRunning("A7");
              const r = await fetch(`${API}/api/agents/${clientId}/A7/run`, { method:"POST", headers:{ Authorization:`Bearer ${token}` } });
              const d = await r.json();
              if (d.success) setState(s => ({ ...s, A7_technical: d.technical }));
              await load(true);
            } catch (e) { setError(e.message || "CWV refresh failed"); }
            setRunning(null);
          }}
        />
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
        <FullReportView report={{...state.A9_report, seoHeadSummary: client?.seoHeadSummary, seoHeadSummaryAt: client?.seoHeadSummaryAt}} dark={dark} bg2={bg2} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2} />
      )}

      {/* Link Building Tab */}
      {activeTab==="linkbuilding" && (
        <LinkBuildingView lb={state.A11_linkbuilding} dark={dark} bg2={bg2} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2} />
      )}

      {/* Dashboard Tab */}
      {activeTab==="dashboard" && (
        <DashboardView clientId={clientId} state={state} dark={dark} bg2={bg2} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2} getToken={getToken} API={API} onTabSwitch={setActiveTab} />
      )}

      {/* Rankings Tab */}
      {activeTab==="rankings" && (
        <RankingsView clientId={clientId} dark={dark} bg2={bg2} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2} getToken={getToken} API={API} googleToken={googleToken} />
      )}

      {/* Score Tab */}
      {activeTab==="score" && (
        <ScoreBreakdownView clientId={clientId} state={state} dark={dark} bg2={bg2} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2} getToken={getToken} API={API} />
      )}

      {/* Tasks Tab */}
      {activeTab==="tasks" && (
        <TaskQueueView clientId={clientId} dark={dark} bg2={bg2} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2} getToken={getToken} API={API} />
      )}

      {/* Pages Tab */}
      {activeTab==="pages" && (
        <PagesView clientId={clientId} dark={dark} bg2={bg2} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2} getToken={getToken} API={API} onTabSwitch={setActiveTab} />
      )}

      {/* Content Briefs Tab */}
      {activeTab==="briefs" && (
        <ContentBriefsView clientId={clientId} dark={dark} bg2={bg2} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2} getToken={getToken} API={API} />
      )}

      {/* Before/After Rankings Comparison Tab */}
      {activeTab==="comparison" && (
        <RankComparisonView clientId={clientId} dark={dark} bg2={bg2} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2} getToken={getToken} API={API} />
      )}

      {/* ── Control Room ── */}
      {activeTab==="controlroom" && (
        <ControlRoom dark={dark} clientId={clientId} clientName={client?.name || brief?.businessName} />
      )}

      {/* ── CMO Agent Decision Tab ── */}
      {activeTab==="cmo" && (
        <CMOAgentTab dark={dark} bg2={bg2} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2}
          clientId={clientId} getToken={getToken} API={API} />
      )}

      {/* ── A19 Conversion Analysis Tab ── */}
      {activeTab==="conversion" && (
        <ConversionTab dark={dark} bg2={bg2} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2}
          clientId={clientId} getToken={getToken} API={API} />
      )}

      {/* ── A20 Impact Report Tab ── */}
      {activeTab==="impactreport" && (
        <ImpactReportTab dark={dark} bg2={bg2} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2}
          clientId={clientId} getToken={getToken} API={API} />
      )}

      {/* ── Attribution Tab (keyword → lead tracking) ── */}
      {activeTab==="attribution" && (
        <AttributionDashboard dark={dark} bg2={bg2} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2}
          clientId={clientId} />
      )}

      {/* ── Predictive Forecast Tab ── */}
      {activeTab==="forecast" && (
        <PredictiveForecastPanel dark={dark} bg2={bg2} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2}
          clientId={clientId} />
      )}

      {/* ── Site-Wide Audit Patterns Tab ── */}
      {activeTab==="patterns" && (
        <AuditPatternsPanel dark={dark} bg2={bg2} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2}
          clientId={clientId} />
      )}

      {/* ── Page Scores Tab ── */}
      {activeTab==="pagescores" && (
        <PageScoresPanel dark={dark} bg2={bg2} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2}
          clientId={clientId} />
      )}

      {/* ── Rules Engine Tab ── */}
      {activeTab==="rules" && (
        <RulesEnginePanel dark={dark} bg2={bg2} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2}
          clientId={clientId} />
      )}

      {/* ── Level 1: WordPress Integration Tab ── */}
      {activeTab==="integrations" && (
        <IntegrationsPanel dark={dark} clientId={clientId} getToken={getToken} API={API} />
      )}

      {/* ── Level 2: Content Autopilot Tab ── */}
      {activeTab==="autopilot" && (
        <ContentAutopilotPanel dark={dark} clientId={clientId} getToken={getToken} API={API} />
      )}

      {/* ── Level 4: ROI Dashboard Tab ── */}
      {activeTab==="roi" && (
        <ROIDashboard dark={dark} clientId={clientId} getToken={getToken} API={API} />
      )}

      {/* ── Rank Tracker: Geo-specific keyword tracking ── */}
      {activeTab==="ranktracker" && (
        <RankTrackerPanel dark={dark} clientId={clientId} getToken={getToken} API={API} />
      )}

      {/* ── Analytics: Live GA4 Dashboard ── */}
      {activeTab==="analytics" && (
        <GA4Panel dark={dark} clientId={clientId} getToken={getToken} API={API} />
      )}

      {/* ── Tracking: Verifier + GTM Snippet Generator ── */}
      {activeTab==="tracking" && (
        <TrackingVerifier dark={dark} clientId={clientId} getToken={getToken} API={API} clientWebsite={client?.website} />
      )}

      {/* ── GSC Keywords: Live ranking keywords from Search Console ── */}
      {activeTab==="gsckeys" && (
        <GscKeywordsTab dark={dark} clientId={clientId} getToken={getToken} API={API} clientWebsite={client?.website} onGoToIntegrations={()=>setActiveTab("integrations")} />
      )}

      {/* ── Local SEO ── */}
      {activeTab==="localseo" && (
        <LocalSeoTab dark={dark} clientId={clientId} getToken={getToken} API={API} state={state} client={client} />
      )}

      {/* ── Backlinks: Real backlink data via DataForSEO ── */}
      {activeTab==="backlinks" && (
        <BacklinksTab dark={dark} clientId={clientId} getToken={getToken} API={API} />
      )}

      {/* ── Keyword Research: Find new keyword opportunities ── */}
      {activeTab==="kwresearch" && (
        <KwResearchTab dark={dark} clientId={clientId} getToken={getToken} API={API} state={state} />
      )}

      <AIChatBot dark={dark} clientId={clientId} getToken={getToken} API={API} />

      {/* ── Portal Share Modal ── */}
      {showPortal && portalUrl && (
        <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center" }}
          onClick={() => setShowPortal(false)}>
          <div onClick={e => e.stopPropagation()}
            style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:16, padding:28, maxWidth:480, width:"90%", boxShadow:"0 8px 40px #0004" }}>
            <div style={{ fontSize:18, fontWeight:800, color:txt, marginBottom:6 }}>🔗 Client Portal Ready</div>
            <p style={{ fontSize:13, color:txt2, lineHeight:1.6, margin:"0 0 18px" }}>
              Share this link with your client. They can view a read-only SEO report — no login required.
            </p>
            <div style={{ background:bg3, border:`1px solid ${bdr}`, borderRadius:8, padding:"10px 14px", fontSize:12, color:txt, wordBreak:"break-all", marginBottom:14, fontFamily:"monospace" }}>
              {portalUrl}
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button
                onClick={() => { navigator.clipboard.writeText(portalUrl); }}
                style={{ flex:1, padding:"10px 0", borderRadius:8, border:`1px solid #443DCB`, background:"#443DCB", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer" }}>
                📋 Copy Link
              </button>
              <button
                onClick={() => setShowPortal(false)}
                style={{ padding:"10px 18px", borderRadius:8, border:`1px solid ${bdr}`, background:"transparent", color:txt2, fontSize:13, cursor:"pointer" }}>
                Close
              </button>
            </div>
            <p style={{ fontSize:11, color:txt2, marginTop:14, borderTop:`1px solid ${bdr}`, paddingTop:12 }}>
              The link is permanent until you regenerate it. To revoke access, contact your agency admin.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── GSC Keywords Tab (full-featured) ────────────────────────────────────────
function GscKeywordsTab({ dark, clientId, getToken, API, clientWebsite, onGoToIntegrations }) {
  const [status,    setStatus]    = useState(null);
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [fetching,  setFetching]  = useState(false);
  const [error,     setError]     = useState("");
  const [days,      setDays]      = useState(28);
  const [sortBy,    setSortBy]    = useState("clicks");
  const [siteUrl,   setSiteUrl]   = useState("");
  const [filter,    setFilter]    = useState("");
  const [kwTab,     setKwTab]     = useState("all");   // all | brand | nonbrand | quickwins | questions
  const [country,   setCountry]   = useState("all");
  const [brandName, setBrandName] = useState("");

  const bg  = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2 = dark ? "#111"    : "#ffffff";
  const bg3 = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr = dark ? "#222"    : "#e0e0d8";
  const txt = dark ? "#e8e8e8" : "#1a1a18";
  const txt2= dark ? "#666"    : "#888";

  useEffect(() => {
    async function loadStatus() {
      setLoading(true);
      try {
        const token = await getToken();
        const res   = await fetch(`${API}/api/gsc/${clientId}/status`, { headers: { Authorization: `Bearer ${token}` } });
        const d     = await res.json();
        if (d.connected) {
          setStatus(d);
          // Use saved selectedSiteUrl first, then auto-detect
          if (d.selectedSiteUrl) {
            setSiteUrl(d.selectedSiteUrl);
          } else {
            const sites = (d.sites || []).map(s => s?.url || s);
            let best = sites.find(s => s.startsWith("sc-domain:")) ||
                       sites.find(s => s.startsWith("https://")) ||
                       sites[0] || "";
            if (clientWebsite) {
              const ws = clientWebsite.replace(/^https?:\/\//, "").replace(/\/$/, "");
              const match = sites.find(s => s.includes(ws));
              if (match) best = match;
            }
            setSiteUrl(best);
          }
        } else {
          setStatus({ connected: false });
        }
      } catch { setStatus({ connected: false }); }
      setLoading(false);
    }
    loadStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  // Auto-detect brand name from domain
  useEffect(() => {
    if (!brandName && clientWebsite) {
      const domain = clientWebsite.replace(/^https?:\/\//, "").replace(/\/$/, "").split(".")[0];
      setBrandName(domain);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientWebsite]);

  useEffect(() => {
    if (siteUrl && status?.connected) fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteUrl, days, country]);

  async function fetchData() {
    if (!siteUrl) return;
    setFetching(true); setError("");
    try {
      const token = await getToken();
      const url   = `${API}/api/gsc/${clientId}/analytics?siteUrl=${encodeURIComponent(siteUrl)}&days=${days}&country=${country}`;
      const res   = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const d     = await res.json();
      if (!res.ok) { setError(d.error || "Failed to load GSC data"); setFetching(false); return; }
      setData(d);
    } catch (e) { setError(e.message); }
    setFetching(false);
  }

  function exportCSV(rows) {
    const header = "Keyword,Position,Clicks,Impressions,CTR\n";
    const body   = rows.map(r => {
      const kw  = r.keys?.[0] || "";
      const pos = r.position ? r.position.toFixed(1) : "";
      const ctr = r.ctr ? (r.ctr*100).toFixed(2) : "0";
      return `"${kw}",${pos},${r.clicks||0},${r.impressions||0},${ctr}%`;
    }).join("\n");
    const blob = new Blob([header + body], { type:"text/csv" });
    const a    = document.createElement("a");
    a.href     = URL.createObjectURL(blob);
    a.download = `gsc-keywords-${days}d.csv`;
    a.click();
  }

  if (loading) return <div style={{ padding:32, color:txt2, fontSize:13, textAlign:"center" }}>Loading Search Console status...</div>;

  if (!status?.connected) return (
    <div style={{ padding:32 }}>
      <div style={{ maxWidth:480, margin:"40px auto", background:bg2, border:`1px solid ${bdr}`, borderRadius:16, padding:32, textAlign:"center" }}>
        <div style={{ fontSize:40, marginBottom:12 }}>🔍</div>
        <div style={{ fontSize:16, fontWeight:700, color:txt, marginBottom:8 }}>Search Console Not Connected</div>
        <div style={{ fontSize:13, color:txt2, lineHeight:1.7, marginBottom:20 }}>Connect Google Search Console to see ranking keywords, positions, clicks and impressions.</div>
        <button onClick={onGoToIntegrations} style={{ padding:"10px 24px", borderRadius:10, border:"none", background:"#0891B2", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer" }}>
          🔌 Go to Integrations → Connect GSC
        </button>
      </div>
    </div>
  );

  // ── Derived data ────────────────────────────────────────────────────────────
  const allRows  = data?.queries || [];
  const brand    = brandName.toLowerCase().trim();
  const QWORDS   = ["who","what","where","when","why","how","which","can","does","is","are","will"];

  function isBrand(kw)    { return brand && kw.toLowerCase().includes(brand); }
  function isQuestion(kw) { const w = kw.toLowerCase().split(" ")[0]; return QWORDS.includes(w); }
  function isQuickWin(r)  { const p = r.position||999; return p >= 4 && p <= 20 && (r.impressions||0) >= 100 && (r.ctr||0) < 0.05; }

  const tabRows = {
    all:       allRows,
    brand:     allRows.filter(r => isBrand(r.keys?.[0] || "")),
    nonbrand:  allRows.filter(r => !isBrand(r.keys?.[0] || "")),
    quickwins: allRows.filter(r => isQuickWin(r)),
    questions: allRows.filter(r => isQuestion(r.keys?.[0] || "")),
  };

  const activeRows = tabRows[kwTab] || allRows;
  const filtered   = filter ? activeRows.filter(r => (r.keys?.[0]||"").toLowerCase().includes(filter.toLowerCase())) : activeRows;
  const sorted     = [...filtered].sort((a,b) => sortBy === "position" ? (a.position||999)-(b.position||999) : (b[sortBy]||0)-(a[sortBy]||0));

  function posColor(p) { return p<=3?"#059669":p<=10?"#D97706":p<=20?"#0891B2":"#6B7280"; }
  function posBg(p)    { return p<=3?"#05966918":p<=10?"#D9770618":p<=20?"#0891B218":"#6B728018"; }

  const sites      = (status?.sites || []).map(s => s?.url || s);
  const countries  = (data?.countries || []).map(r => ({ code: r.keys?.[0]||r.country||"", name: (r.keys?.[0]||r.country||"").toUpperCase() }));

  const TAB_DEFS = [
    { id:"all",       label:`All (${allRows.length})` },
    { id:"brand",     label:`🏷 Brand (${tabRows.brand.length})` },
    { id:"nonbrand",  label:`🚀 Non-Brand (${tabRows.nonbrand.length})` },
    { id:"quickwins", label:`⚡ Quick Wins (${tabRows.quickwins.length})` },
    { id:"questions", label:`❓ Questions (${tabRows.questions.length})` },
  ];

  return (
    <div style={{ padding:24, background:bg }}>
      {/* ── Header ── */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:16, flexWrap:"wrap", gap:10 }}>
        <div>
          <div style={{ fontSize:15, fontWeight:700, color:txt }}>📈 GSC Ranking Keywords</div>
          <div style={{ fontSize:11, color:txt2 }}>Connected as {status.email} · Last {days} days{country!=="all"?` · ${country.toUpperCase()}`:""}</div>
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
          {sites.length > 1 && (
            <select value={siteUrl} onChange={e => setSiteUrl(e.target.value)}
              style={{ padding:"6px 10px", borderRadius:8, border:`1px solid ${bdr}`, background:bg2, color:txt, fontSize:11, cursor:"pointer" }}>
              {sites.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {/* Country filter */}
          {countries.length > 0 && (
            <select value={country} onChange={e => setCountry(e.target.value)}
              style={{ padding:"6px 10px", borderRadius:8, border:`1px solid ${bdr}`, background:bg2, color:txt, fontSize:11, cursor:"pointer" }}>
              <option value="all">All Countries</option>
              {countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          )}
          {[7,28,90,180].map(d => (
            <button key={d} onClick={() => setDays(d)}
              style={{ padding:"5px 10px", borderRadius:8, border:`1px solid ${days===d?"#0891B2":bdr}`, background:days===d?"#0891B2":bg2, color:days===d?"#fff":txt2, fontSize:11, cursor:"pointer", fontWeight:days===d?700:400 }}>
              {d}d
            </button>
          ))}
          <button onClick={fetchData} disabled={fetching}
            style={{ padding:"6px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:bg2, color:txt2, fontSize:11, cursor:"pointer" }}>
            {fetching ? "⏳" : "↺"}
          </button>
          {allRows.length > 0 && (
            <button onClick={() => exportCSV(sorted)}
              style={{ padding:"6px 12px", borderRadius:8, border:`1px solid #05966640`, background:"#05966611", color:"#059669", fontSize:11, cursor:"pointer", fontWeight:600 }}>
              ↓ CSV
            </button>
          )}
        </div>
      </div>

      {error && <div style={{ padding:"10px 14px", borderRadius:8, background:"#DC262611", color:"#DC2626", fontSize:12, marginBottom:12 }}>{error}</div>}

      {/* ── Brand name input ── */}
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14, padding:"10px 14px", borderRadius:10, background:bg2, border:`1px solid ${bdr}` }}>
        <span style={{ fontSize:11, color:txt2, whiteSpace:"nowrap" }}>Brand name:</span>
        <input value={brandName} onChange={e => setBrandName(e.target.value)} placeholder="e.g. damco"
          style={{ padding:"5px 10px", borderRadius:6, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:12, width:160 }} />
        <span style={{ fontSize:11, color:txt2 }}>Used to split Brand vs Non-Brand keywords automatically</span>
      </div>

      {/* ── Summary cards ── */}
      {data && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:14 }}>
          {[
            { label:"Total Keywords",     value: allRows.length,                                  color:"#443DCB" },
            { label:"Total Clicks",       value: data.totalClicks?.toLocaleString()||"0",         color:"#0891B2" },
            { label:"Total Impressions",  value: data.totalImpressions?.toLocaleString()||"0",    color:"#D97706" },
            { label:"Avg. Position",      value: data.avgPosition||"—",                           color:"#059669" },
          ].map(c => (
            <div key={c.label} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"12px 14px" }}>
              <div style={{ fontSize:10, color:txt2, marginBottom:4 }}>{c.label}</div>
              <div style={{ fontSize:20, fontWeight:800, color:c.color }}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {!data && !fetching && !error && <div style={{ textAlign:"center", padding:40, color:txt2, fontSize:13 }}>Loading keywords...</div>}
      {fetching && !data && <div style={{ textAlign:"center", padding:40, color:txt2, fontSize:13 }}>Fetching up to 1,000 keywords from Google Search Console...</div>}

      {data && allRows.length === 0 && (
        <div style={{ textAlign:"center", padding:40, background:bg2, border:`1px solid ${bdr}`, borderRadius:12, color:txt2, fontSize:13 }}>
          No keyword data found for the last {days} days.
        </div>
      )}

      {data && allRows.length > 0 && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, overflow:"hidden" }}>
          {/* ── Keyword type tabs ── */}
          <div style={{ display:"flex", gap:6, padding:"12px 16px", borderBottom:`1px solid ${bdr}`, flexWrap:"wrap" }}>
            {TAB_DEFS.map(t => (
              <button key={t.id} onClick={() => setKwTab(t.id)}
                style={{ padding:"5px 12px", borderRadius:20, border:`1px solid ${kwTab===t.id?"#0891B2":bdr}`,
                  background:kwTab===t.id?"#0891B2":bg3, color:kwTab===t.id?"#fff":txt2, fontSize:11, cursor:"pointer", fontWeight:kwTab===t.id?700:400 }}>
                {t.label}
              </button>
            ))}
            {kwTab==="quickwins" && (
              <span style={{ fontSize:10, color:"#D97706", alignSelf:"center", marginLeft:8 }}>
                Position 4–20 · High impressions · Low CTR → Easy page 1 opportunities
              </span>
            )}
          </div>

          {/* ── Controls ── */}
          <div style={{ padding:"10px 16px", borderBottom:`1px solid ${bdr}`, display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
            <input placeholder="Filter keywords…" value={filter} onChange={e => setFilter(e.target.value)}
              style={{ padding:"6px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:12, width:200 }} />
            <span style={{ fontSize:11, color:txt2, marginLeft:"auto" }}>{sorted.length} keywords</span>
            {["clicks","impressions","ctr","position"].map(col => (
              <button key={col} onClick={() => setSortBy(col)}
                style={{ padding:"4px 10px", borderRadius:6, border:`1px solid ${sortBy===col?"#0891B2":bdr}`,
                  background:sortBy===col?"#0891B2":bg3, color:sortBy===col?"#fff":txt2, fontSize:10, cursor:"pointer", fontWeight:sortBy===col?700:400 }}>
                {col==="ctr"?"CTR":col==="position"?"Position":col.charAt(0).toUpperCase()+col.slice(1)}
              </button>
            ))}
          </div>

          {/* ── Table header ── */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 90px 110px 80px 80px", padding:"8px 16px", background:bg3, fontSize:10, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:0.8 }}>
            <span>Keyword</span>
            <span style={{ textAlign:"center" }}>Position</span>
            <span style={{ textAlign:"right" }}>Impressions</span>
            <span style={{ textAlign:"right" }}>Clicks</span>
            <span style={{ textAlign:"right" }}>CTR</span>
          </div>

          {/* ── Rows ── */}
          <div style={{ maxHeight:560, overflowY:"auto" }}>
            {sorted.length === 0 ? (
              <div style={{ padding:24, textAlign:"center", color:txt2, fontSize:12 }}>No keywords match this filter.</div>
            ) : sorted.map((row, i) => {
              const kw  = row.keys?.[0] || "—";
              const pos = row.position ? +row.position.toFixed(1) : null;
              const isB = isBrand(kw);
              return (
                <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 90px 110px 80px 80px", padding:"9px 16px", borderBottom:`1px solid ${bdr}`, alignItems:"center", background:i%2===0?"transparent":(dark?"#ffffff04":"#fafaf8") }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6, overflow:"hidden" }}>
                    {isB && <span style={{ fontSize:9, padding:"1px 5px", borderRadius:4, background:"#44DCB211", color:"#059669", fontWeight:700, flexShrink:0 }}>BRAND</span>}
                    {isQuestion(kw) && <span style={{ fontSize:9, padding:"1px 5px", borderRadius:4, background:"#7C3AED11", color:"#7C3AED", fontWeight:700, flexShrink:0 }}>Q</span>}
                    <span style={{ fontSize:12, color:txt, fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={kw}>{kw}</span>
                  </div>
                  <span style={{ textAlign:"center" }}>
                    {pos!==null ? <span style={{ fontSize:12, fontWeight:700, color:posColor(pos), background:posBg(pos), padding:"2px 7px", borderRadius:6 }}>#{pos}</span> : <span style={{ color:txt2, fontSize:11 }}>—</span>}
                  </span>
                  <span style={{ textAlign:"right", fontSize:12, color:txt2 }}>{(row.impressions||0).toLocaleString()}</span>
                  <span style={{ textAlign:"right", fontSize:12, fontWeight:600, color:txt }}>{(row.clicks||0).toLocaleString()}</span>
                  <span style={{ textAlign:"right", fontSize:12, color:(row.ctr||0)>0.05?"#059669":(row.ctr||0)>0.02?"#D97706":"#DC2626" }}>
                    {row.ctr?(row.ctr*100).toFixed(1)+"%":"0%"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function getStateSuffix(id) {
  return { A1:"brief", A2:"audit", A3:"keywords", A4:"competitor", A5:"content", A6:"onpage", A7:"technical", A8:"geo", A9:"report", A11:"linkbuilding" }[id] || id;
}

// ── Automation Mode Panel ────────────────────────────
function AutomationModePanel({ automationMode, setAutomationMode, savingMode, setSavingMode, clientId, getToken, API, state, bg2, bg3, bdr, txt, txt2 }) {
  const [runningFixes, setRunningFixes] = useState(false);
  const [fixResult,    setFixResult]    = useState(null);

  const MODES = [
    {
      id: "manual", icon: "🤚", label: "Manual",
      color: "#443DCB",
      title: "You control everything",
      what: "AI detects issues and creates a prioritised task list. You decide when and how to fix each one.",
      actions: ["Review tasks in Tasks tab", "Click 'Fix Now' to copy the fix", "Click 'AI Fix' to generate exact code", "Mark as Done when implemented"],
    },
    {
      id: "semi", icon: "⚡", label: "Semi-Auto",
      color: "#D97706",
      title: "AI generates fixes, you approve",
      what: "After each pipeline run, AI automatically generates ready-to-implement fixes for all auto-fixable issues and queues them for your approval.",
      actions: ["AI writes fixes for title tags, meta descriptions, alt text, canonical URLs", "Fixes appear in Approvals tab", "You review and approve/reject each one", "Approved fixes are ready to copy-paste into your CMS"],
    },
    {
      id: "full", icon: "🤖", label: "Full-Auto",
      color: "#059669",
      title: "AI generates all fixes automatically",
      what: "AI generates fixes for every auto-fixable issue immediately after pipeline completes. All fixes go straight to Approvals — you only need to implement them.",
      actions: ["AI generates fixes for ALL auto-fixable issues", "No manual trigger needed", "Review batch in Approvals tab", "Implement fixes in your CMS"],
    },
  ];

  const autoFixCount = [
    ...(state.A2_audit?.issues?.p1 || []),
    ...(state.A2_audit?.issues?.p2 || []),
    ...(state.A2_audit?.issues?.p3 || []),
  ].filter(i => ["missing_title","missing_meta_desc","long_meta_desc","missing_canonical","no_viewport","missing_alt","missing_alt_text","missing_sitemap","missing_schema"].includes(i.type)).length;

  const currentMode = MODES.find(m => m.id === automationMode) || MODES[0];

  async function switchMode(modeId) {
    setSavingMode(true);
    const token = await getToken();
    await fetch(`${API}/api/agents/${clientId}/automation-mode`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ mode: modeId }),
    }).catch(() => {});
    setAutomationMode(modeId);
    setSavingMode(false);
  }

  async function runAIFixes() {
    setRunningFixes(true);
    setFixResult(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/agents/${clientId}/tasks/bulk`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate-fixes" }),
      });
      const data = await res.json();
      setFixResult(data.generated > 0
        ? `AI generated ${data.generated} fixes — check Approvals tab to review`
        : data.message || "No auto-fixable tasks found");
    } catch { setFixResult("Failed to generate fixes"); }
    setRunningFixes(false);
  }

  return (
    <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:14, marginBottom:16, overflow:"hidden" }}>
      {/* Mode selector row */}
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"12px 16px", borderBottom:`1px solid ${bdr}` }}>
        <span style={{ fontSize:12, fontWeight:700, color:txt, marginRight:4 }}>Automation Mode:</span>
        {MODES.map(m => (
          <button key={m.id} onClick={() => switchMode(m.id)} disabled={savingMode} style={{
            padding:"6px 14px", borderRadius:8, fontSize:11, fontWeight:700, cursor:savingMode?"not-allowed":"pointer",
            background: automationMode===m.id ? m.color : "transparent",
            color:      automationMode===m.id ? "#fff"   : txt2,
            border:     `1px solid ${automationMode===m.id ? m.color : bdr}`,
            opacity:    savingMode ? 0.6 : 1,
          }}>
            {m.icon} {m.label}
          </button>
        ))}
        <span style={{ marginLeft:"auto", fontSize:11, color: autoFixCount > 0 ? "#059669" : txt2, fontWeight: autoFixCount > 0 ? 700 : 400 }}>
          {savingMode ? "Saving..." : autoFixCount > 0 ? `✅ ${autoFixCount} auto-fixable issues ready` : "Run pipeline first to detect issues"}
        </span>
      </div>

      {/* Mode explanation */}
      <div style={{ padding:"14px 16px", display:"flex", gap:20, alignItems:"flex-start" }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:13, fontWeight:700, color:currentMode.color, marginBottom:4 }}>{currentMode.icon} {currentMode.title}</div>
          <div style={{ fontSize:12, color:txt2, lineHeight:1.6, marginBottom:10 }}>{currentMode.what}</div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            {currentMode.actions.map((a, i) => (
              <div key={i} style={{ fontSize:11, padding:"4px 10px", borderRadius:8, background:bg3, color:txt2, border:`1px solid ${bdr}` }}>
                {i+1}. {a}
              </div>
            ))}
          </div>
        </div>

        {/* Action button */}
        {automationMode !== "manual" && (
          <div style={{ flexShrink:0, display:"flex", flexDirection:"column", alignItems:"flex-end", gap:8 }}>
            {autoFixCount === 0 ? (
              <div style={{ textAlign:"right" }}>
                <div style={{ padding:"8px 16px", borderRadius:8, background:bg3, color:txt2, fontSize:12, fontWeight:600, border:`1px solid ${bdr}`, whiteSpace:"nowrap" }}>
                  ⚡ Run AI Fixes Now
                </div>
                <div style={{ fontSize:10, color:"#D97706", marginTop:6, maxWidth:200 }}>
                  Run the full pipeline first — AI will detect auto-fixable issues and enable this button.
                </div>
              </div>
            ) : (
              <>
                <button onClick={runAIFixes} disabled={runningFixes} style={{
                  padding:"8px 16px", borderRadius:8, background:currentMode.color, color:"#fff",
                  border:"none", fontSize:12, fontWeight:700, cursor:runningFixes?"not-allowed":"pointer", opacity:runningFixes?0.7:1, whiteSpace:"nowrap",
                }}>
                  {runningFixes ? "Generating..." : `⚡ Run AI Fixes (${autoFixCount})`}
                </button>
                {fixResult && (
                  <div style={{ fontSize:11, color: fixResult.includes("Generated") ? "#059669" : "#D97706", fontWeight:600, textAlign:"right", maxWidth:220 }}>
                    {fixResult}
                  </div>
                )}
                <div style={{ fontSize:10, color:txt2, textAlign:"right" }}>Fixes go to Approvals tab for review</div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── SEO Execution Engine ────────────────────────────
function ActionPlanView({ state, bg2, bg3, bdr, txt, txt2, txt3, clientId, getToken, API, exportPDF }) {
  const [done,       setDone]       = useState(new Set());
  const [copied,     setCopied]     = useState(null);
  const [generating, setGenerating] = useState(null);
  const [generated,  setGenerated]  = useState({});
  const [expanded,   setExpanded]   = useState(null);

  const B = "#443DCB";

  const audit    = state.A2_audit      || {};
  const keywords = state.A3_keywords   || {};
  const comp     = state.A4_competitor || {};
  const geo      = state.A8_geo        || {};
  const report   = state.A9_report     || {};
  const brief    = state.A1_brief      || {};

  // ── Issue-specific "Why it matters" + SEO impact map ─
  const ISSUE_WHY_MAP = {
    too_many_requests:    { why: "Excessive HTTP requests slow page load and hurt Core Web Vitals (LCP) — a confirmed Google ranking factor since 2021.",                 impact: "PageSpeed −10 to −25 pts" },
    high_request_count:   { why: "Too many requests increase time-to-interactive. Google penalises slow pages with lower rankings in mobile-first indexing.",               impact: "Mobile ranking −5 to −15 pts" },
    slow_ttfb:            { why: "Server response time is the first thing Google measures. TTFB > 600ms delays crawling and reduces crawl budget.",                        impact: "Direct PageSpeed −10 to −20 pts" },
    ttfb_warning:         { why: "Slow TTFB reduces crawl efficiency and signals poor infrastructure to Google — affecting how often your site is re-crawled.",             impact: "Crawl frequency reduced" },
    no_ssl:               { why: "HTTPS is a Google ranking signal since 2014. HTTP sites show 'Not Secure' in Chrome, increasing bounce rate by up to 23%.",              impact: "−1 to −5 ranking positions confirmed" },
    missing_title:        { why: "Title tags are one of Google's top 3 on-page ranking factors. Without one Google generates its own — usually just the URL — destroying CTR.", impact: "CTR drops 30–60%" },
    short_title:          { why: "Short titles leave keyword opportunity on the table. Google needs 50–60 chars to fully understand page intent.",                          impact: "Keyword relevance score reduced" },
    long_title:           { why: "Titles over 60 chars get truncated in SERPs. Truncated titles break the search snippet and reduce click-through rate.",                  impact: "CTR drops 10–20% from truncation" },
    missing_h1:           { why: "H1 is the primary topical signal Google uses to understand keyword relevance. Missing H1 = no clear topic signal for the page.",         impact: "Keyword ranking reduced for target terms" },
    multiple_h1:          { why: "Multiple H1s confuse Google's understanding of the page's primary topic, diluting authority across all of them.",                        impact: "Keyword focus diluted" },
    missing_meta_desc:    { why: "Meta descriptions control your SERP snippet. Google auto-generates poor ones when missing, reducing CTR by 5–10%.",                      impact: "CTR −5 to −10%" },
    missing_canonical:    { why: "Without canonicals, Google may index duplicate URL variants and split link authority across them instead of concentrating it on one URL.", impact: "Link equity diluted across duplicate URLs" },
    no_viewport:          { why: "Missing viewport tag breaks mobile rendering. Google uses mobile-first indexing — poor mobile = lower rankings for all devices.",          impact: "Mobile ranking −10 to −20 pts" },
    noindex_detected:     { why: "noindex tells Google NOT to show this page in search results. If set accidentally, the page receives zero organic traffic forever.",       impact: "100% traffic loss for this page" },
    thin_content:         { why: "Pages under 300 words are flagged as 'thin content' — a direct Google Panda trigger that can suppress an entire domain's rankings.",     impact: "Domain-wide suppression risk" },
    robots_blocking_all:  { why: "'Disallow: /' blocks ALL crawlers — your entire site becomes invisible to Google. Zero pages can be indexed.",                            impact: "Zero organic traffic — full deindex" },
    robots_blocking:      { why: "Broad robots.txt rules may block important pages. Google skips blocked pages entirely even if they have strong backlinks.",               impact: "Blocked pages get zero rankings" },
    no_sitemap:           { why: "Sitemaps tell Google which pages to crawl and how often. Without one, new content can take weeks longer to appear in search results.",    impact: "20–40% slower indexing of new pages" },
    broken_links:         { why: "Broken links waste crawl budget and create dead ends for users. Each 404 signals poor site maintenance to Google.",                       impact: "Crawl budget wasted on dead pages" },
    duplicate_titles:     { why: "Pages sharing a title cause Google to pick just one to rank — often not the one you want. The others lose all ranking potential.",        impact: "Authority diluted across duplicate pages" },
    duplicate_meta_desc:  { why: "Duplicate meta descriptions make every SERP result look identical, significantly reducing CTR across all affected pages.",               impact: "CTR reduced across all duplicate pages" },
    weak_eeat:            { why: "After Google's Helpful Content updates, E-E-A-T signals (About, Contact, Privacy, Schema) directly affect domain trust and rankings.",    impact: "Major trust gap vs. competitors" },
    eeat_improvements:    { why: "Strengthening E-E-A-T signals helps Google rank your content higher for competitive and YMYL (health, finance, legal) queries.",          impact: "Competitive trust signal gap" },
    missing_alt_text:     { why: "Alt text is the only way Google 'reads' images. Missing alt text loses image search traffic and hurts accessibility scores.",              impact: "Image search traffic lost" },
    non_webp_images:      { why: "WebP images are 25–35% smaller than JPG/PNG. Larger images slow LCP — Google's most heavily-weighted Core Web Vital.",                   impact: "LCP +0.3–1.5s slower" },
    missing_image_dimensions: { why: "Images without width/height cause Cumulative Layout Shift (CLS) as they load — CLS is a Core Web Vital that directly affects rankings.", impact: "CLS score worsened — ranking signal" },
    missing_og_tags:      { why: "Open Graph tags control how pages appear when shared on LinkedIn, Facebook, and WhatsApp. Poor previews drastically reduce social CTR.",  impact: "Social traffic CTR reduced 30–50%" },
    redirect_chain:       { why: "Each redirect hop loses ~15% of link equity (PageRank). A 3-hop chain can lose up to 40% of the authority passed to the final URL.",      impact: "Up to 40% link equity loss per chain" },
    inner_pages_no_title: { why: "Inner pages without titles cannot rank for any keywords — Google requires a title to understand page topic and keyword relevance.",        impact: "Zero ranking potential for affected pages" },
    inner_pages_no_h1:    { why: "Inner pages without H1 send no topical signal to Google, making it nearly impossible to rank those pages for competitive keywords.",      impact: "Keyword relevance score near zero" },
    redirect:             { why: "Inconsistent canonical URL signals split link equity. All external links, internal links and GSC should reference the exact same URL.",    impact: "Link equity diluted across URL variants" },
    site_unreachable:     { why: "If Google cannot reach your site, it cannot crawl or index any pages. Persistent crawl errors can trigger a complete deindex.",            impact: "Complete indexing failure" },
    unminified_assets:    { why: "Unminified JS and CSS add unnecessary bytes that slow page load. Google measures render-blocking resources as part of PageSpeed score.",   impact: "PageSpeed −5 to −15 pts" },
    stale_content:        { why: "Google's freshness algorithm favours recently-updated content for time-sensitive queries. Stale pages lose ranking over time.",            impact: "Ranking decay for time-sensitive keywords" },
  };

  // ── Priority Score Formula ─────────────────────────
  // score = (rankingImpact × 0.4) + (trafficPotential × 0.3) − (effortCost × 0.3)
  function calcPriority(ri, tp, effort) {
    const effortCost = { easy:10, medium:30, hard:60 }[effort] || 30;
    return Math.round((ri * 0.4) + (tp * 0.3) - (effortCost * 0.3));
  }

  // ── Build task list ────────────────────────────────
  const allTasks = [];

  (audit.issues?.p1 || []).forEach((issue, i) => {
    const ri   = Math.max(92 - i * 3, 78), tp = Math.max(75 - i * 3, 55);
    const meta = ISSUE_WHY_MAP[issue.type] || {};
    allTasks.push({ id:`p1_${i}`, category:"critical",
      label:issue.detail,
      why: meta.why || "This is a critical technical issue that directly blocks search engine crawling and hurts your rankings.",
      seoImpact: meta.impact || null,
      fix:issue.fix, impact:"High", effort:"Easy",
      impactColor:"#DC2626", effortColor:"#059669",
      priority:calcPriority(ri, tp, "easy"), color:"#DC2626", catLabel:"Critical" });
  });

  (comp.analysis?.quickWins || []).slice(0, 5).forEach((w, i) => {
    const ri = Math.max(78 - i * 3, 55), tp = Math.max(72 - i * 3, 48);
    allTasks.push({ id:`qw_${i}`, category:"quick_wins",
      label:`Rank for "${w.keyword}"`,
      why:`Your competitors rank for this keyword — you're losing traffic you could capture right now.`,
      fix:w.action, expectedOutcome:w.expectedOutcome,
      impact:"High", effort:"Medium", impactColor:"#059669", effortColor:"#D97706",
      priority:calcPriority(ri, tp, "medium"), color:"#D97706", catLabel:"Quick Win" });
  });

  (keywords.gaps || []).slice(0, 5).forEach((g, i) => {
    const ri = Math.max(65 - i * 3, 42), tp = Math.max(68 - i * 3, 45);
    allTasks.push({ id:`gap_${i}`, category:"content",
      label:`Create content: "${g.keyword}"`,
      why:g.reason || "No page exists for this search term — you're invisible to customers searching for it.",
      fix:g.recommendedAction,
      impact:"Medium", effort:"Medium", impactColor:"#0891B2", effortColor:"#D97706",
      priority:calcPriority(ri, tp, "medium"), color:"#0891B2", catLabel:"Content Gap" });
  });

  (audit.issues?.p2 || []).slice(0, 6).forEach((issue, i) => {
    const ri   = Math.max(58 - i * 3, 35), tp = Math.max(52 - i * 3, 30);
    const meta = ISSUE_WHY_MAP[issue.type] || {};
    allTasks.push({ id:`p2_${i}`, category:"important",
      label:issue.detail,
      why: meta.why || "An important SEO issue that affects your search visibility and page experience scores.",
      seoImpact: meta.impact || null,
      fix:issue.fix, impact:"Medium", effort:"Medium", impactColor:"#D97706", effortColor:"#D97706",
      priority:calcPriority(ri, tp, "medium"), color:"#D97706", catLabel:"Important" });
  });

  (keywords.cannibalization || []).slice(0, 3).forEach((c, i) => {
    const ri = Math.max(48 - i * 3, 28), tp = Math.max(44 - i * 3, 25);
    allTasks.push({ id:`can_${i}`, category:"important",
      label:`Fix keyword cannibalization: ${c.page}`,
      why:"Multiple pages competing for the same keyword split authority and cancel each other out in Google.",
      fix:c.fix, impact:"Medium", effort:"Hard", impactColor:"#D97706", effortColor:"#DC2626",
      priority:calcPriority(ri, tp, "hard"), color:"#D97706", catLabel:"Cannibalization" });
  });

  (geo.offPage?.citationTargets || []).slice(0, 4).forEach((c, i) => {
    const ri = Math.max(45 - i * 3, 25), tp = Math.max(48 - i * 3, 28);
    allTasks.push({ id:`geo_${i}`, category:"local",
      label:`Get listed on ${c.directory}`,
      why:"Local directory listings boost your visibility in Google Maps and local search results.",
      fix:c.url ? `Submit to ${c.directory} at ${c.url}` : `Create a listing on ${c.directory}`,
      impact:"Low", effort:"Easy", impactColor:"#6B7280", effortColor:"#059669",
      priority:calcPriority(ri, tp, "easy"), color:"#059669", catLabel:"Local SEO" });
  });

  allTasks.sort((a, b) => b.priority - a.priority);

  const hs         = audit.healthScore || 0;
  const scoreColor = hs >= 80 ? "#059669" : hs >= 50 ? "#D97706" : "#DC2626";
  const doneCount  = done.size;
  const total      = allTasks.length;
  const topTasks   = allTasks.slice(0, 5);

  // Score explanation: what's dragging the score down
  const p1Count = (audit.issues?.p1 || []).length;
  const p2Count = (audit.issues?.p2 || []).length;
  const scoreDeductions = [
    ...(audit.issues?.p1 || []).slice(0,3).map(i => ({ issue: i.detail?.slice(0,60), pts: -20, color:"#DC2626" })),
    ...(audit.issues?.p2 || []).slice(0,3).map(i => ({ issue: i.detail?.slice(0,60), pts: -8, color:"#D97706" })),
  ].filter(d => d.issue);
  const potentialGain = Math.min(p1Count*20 + p2Count*8, 100 - hs);

  const CATEGORIES = [
    { id:"critical",   icon:"🔴", label:"Critical Issues",  color:"#DC2626" },
    { id:"quick_wins", icon:"⚡", label:"Quick Wins",        color:"#D97706" },
    { id:"content",    icon:"📝", label:"Content Gaps",      color:"#0891B2" },
    { id:"important",  icon:"🟡", label:"Important Fixes",   color:"#D97706" },
    { id:"local",      icon:"🌍", label:"Local SEO",         color:"#059669" },
  ];

  async function generateFix(task, key) {
    setGenerating(key);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/agents/${clientId}/generate-fix`, {
        method:"POST", headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`},
        body:JSON.stringify({ type:task.category, detail:task.label,
          context:{ businessName:brief.businessName, websiteUrl:brief.websiteUrl, services:brief.services } }),
      });
      const data = await res.json();
      if (data.fix) setGenerated(g => ({ ...g, [key]: data }));
    } catch {}
    setGenerating(null);
  }

  function TaskCard({ task, taskKey }) {
    const isDone = done.has(task.id);
    const gen    = generated[taskKey];
    return (
      <div style={{ background:bg2, border:`1px solid ${bdr}`, borderLeft:`4px solid ${task.color}`,
        borderRadius:10, padding:16, marginBottom:10, opacity:isDone?0.45:1, transition:"opacity 0.25s" }}>
        {/* Badges row */}
        <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap", alignItems:"center" }}>
          <span style={{ fontSize:10, padding:"3px 10px", borderRadius:10, background:`${task.color}20`, color:task.color, fontWeight:700 }}>{task.catLabel}</span>
          <span style={{ fontSize:10, padding:"3px 10px", borderRadius:10, background:`${task.impactColor}18`, color:task.impactColor, fontWeight:700 }}>Impact: {task.impact}</span>
          <span style={{ fontSize:10, padding:"3px 10px", borderRadius:10, background:`${task.effortColor}18`, color:task.effortColor, fontWeight:700 }}>Effort: {task.effort}</span>
          <span style={{ fontSize:10, padding:"3px 10px", borderRadius:10, background:`${B}15`, color:B, fontWeight:700 }}>Score: {task.priority}</span>
          {isDone && <span style={{ fontSize:10, color:"#059669", fontWeight:700, marginLeft:"auto" }}>✅ Done</span>}
        </div>
        {/* Title */}
        <div style={{ fontSize:13, fontWeight:700, color:txt, marginBottom:8, lineHeight:1.4 }}>{task.label}</div>
        {/* Why it matters */}
        <div style={{ fontSize:12, color:txt2, marginBottom:10, lineHeight:1.6, padding:"8px 12px", background:bg3, borderRadius:6 }}>
          <span style={{ color:task.color, fontWeight:700 }}>Why it matters: </span>{task.why}
          {task.seoImpact && (
            <div style={{ marginTop:5, fontSize:11, fontWeight:700, color:task.color, display:"flex", alignItems:"center", gap:4 }}>
              📊 SEO Impact: <span style={{ background:`${task.color}18`, padding:"1px 8px", borderRadius:6 }}>{task.seoImpact}</span>
            </div>
          )}
        </div>
        {/* Fix suggestion */}
        {task.fix && (
          <div style={{ fontSize:12, color:txt, marginBottom:10, lineHeight:1.55 }}>
            <span style={{ fontWeight:700, color:"#059669" }}>→ Suggested fix: </span>{task.fix}
          </div>
        )}
        {task.expectedOutcome && (
          <div style={{ fontSize:11, color:"#059669", marginBottom:10 }}>📈 Expected: {task.expectedOutcome}</div>
        )}
        {/* AI generated fix */}
        {gen && (
          <div style={{ marginBottom:12, padding:"10px 12px", background:`${B}0d`, borderRadius:8, border:`1px solid ${B}30` }}>
            <div style={{ fontSize:10, color:B, fontWeight:700, marginBottom:6 }}>🤖 AI-Generated Fix</div>
            <div style={{ fontSize:12, color:txt, marginBottom:gen.codeSnippet?6:0 }}>{gen.fix}</div>
            {gen.codeSnippet && <pre style={{ fontSize:10, color:"#059669", background:bg3, borderRadius:6, padding:8, overflow:"auto", margin:"6px 0 0", whiteSpace:"pre-wrap" }}>{gen.codeSnippet}</pre>}
            {gen.implementation && <div style={{ fontSize:11, color:txt2, marginTop:6 }}>{gen.implementation}</div>}
          </div>
        )}
        {/* CTA buttons */}
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <button
            onClick={() => { navigator.clipboard?.writeText(task.fix||""); setCopied(task.id); setTimeout(()=>setCopied(null),2000); }}
            style={{ padding:"7px 16px", borderRadius:8, border:"none", background:"#059669", color:"#fff", fontSize:11, fontWeight:700, cursor:"pointer" }}>
            {copied===task.id ? "✅ Copied!" : "📋 Fix Now"}
          </button>
          <button
            onClick={() => generateFix(task, taskKey)}
            disabled={generating===taskKey}
            style={{ padding:"7px 16px", borderRadius:8, border:`1px solid ${B}`, background:"transparent", color:B, fontSize:11, fontWeight:700, cursor:generating===taskKey?"not-allowed":"pointer", opacity:generating===taskKey?0.6:1 }}>
            {generating===taskKey ? "⏳ Generating..." : "🤖 Auto Fix"}
          </button>
          <button
            onClick={() => setDone(prev => { const n=new Set(prev); n.has(task.id)?n.delete(task.id):n.add(task.id); return n; })}
            style={{ padding:"7px 16px", borderRadius:8, border:"1px solid #05966440", background:isDone?"#05966920":"transparent", color:"#059669", fontSize:11, fontWeight:700, cursor:"pointer" }}>
            {isDone ? "↩️ Undo" : "✅ Mark Done"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* ── Top Banner ─────────────────────────────────── */}
      <div style={{ background:`linear-gradient(135deg,${B}14,#05966912)`, border:`1px solid ${B}28`, borderRadius:12, padding:"16px 20px", marginBottom:20, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <div style={{ fontSize:16, fontWeight:800, color:txt, marginBottom:4 }}>🎯 Your SEO Action Plan</div>
          <div style={{ fontSize:12, color:txt2 }}>Priority Score = (Ranking Impact × 0.4) + (Traffic Potential × 0.3) − (Effort × 0.3)</div>
        </div>
        {exportPDF && (
          <button onClick={exportPDF} style={{ padding:"8px 16px", borderRadius:8, border:`1px solid ${bdr}`, background:bg2, color:txt2, fontSize:11, cursor:"pointer", fontWeight:600 }}>
            📄 Export PDF
          </button>
        )}
      </div>

      {/* ── Score + Why Explanation ─────────────────────── */}
      {hs > 0 && scoreDeductions.length > 0 && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:"14px 18px", marginBottom:16 }}>
          <div style={{ display:"flex", alignItems:"flex-start", gap:20 }}>
            {/* Score ring */}
            <div style={{ textAlign:"center", flexShrink:0 }}>
              <div style={{ position:"relative", width:72, height:72 }}>
                <svg width="72" height="72" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="32" fill="none" stroke={bg3} strokeWidth="7"/>
                  <circle cx="40" cy="40" r="32" fill="none" stroke={scoreColor} strokeWidth="7"
                    strokeDasharray={`${(hs/100)*201} 201`} strokeLinecap="round" transform="rotate(-90 40 40)"/>
                </svg>
                <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
                  <div style={{ fontSize:18, fontWeight:800, color:scoreColor, lineHeight:1 }}>{hs}</div>
                  <div style={{ fontSize:8, color:txt2 }}>/100</div>
                </div>
              </div>
              <div style={{ fontSize:9, color:txt2, marginTop:4 }}>Current Score</div>
              {potentialGain > 0 && <div style={{ fontSize:10, fontWeight:700, color:"#059669", marginTop:2 }}>+{potentialGain} possible</div>}
            </div>

            {/* Why this score */}
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, fontWeight:700, color:txt, marginBottom:8 }}>Why {hs}/100? — What's dragging your score down:</div>
              {scoreDeductions.map((d, i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0", borderBottom:`1px solid ${bdr}` }}>
                  <span style={{ fontSize:12, fontWeight:800, color:d.color, minWidth:28 }}>{d.pts}</span>
                  <span style={{ fontSize:11, color:txt2, flex:1 }}>{d.issue}</span>
                  <span style={{ fontSize:9, padding:"2px 6px", borderRadius:6, background:`${d.color}15`, color:d.color, fontWeight:600 }}>Fix → +{Math.abs(d.pts)} pts</span>
                </div>
              ))}
              <div style={{ marginTop:8, fontSize:11, color:"#059669", fontWeight:600 }}>
                Fix top {Math.min(scoreDeductions.length, 3)} issues → Score goes from {hs} to {Math.min(hs + potentialGain, 100)}/100
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Dashboard ──────────────────────────────────── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr", gap:12, marginBottom:16 }}>
        {hs === 0 && (
          <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:"16px 20px", display:"flex", flexDirection:"column", alignItems:"center" }}>
            <div style={{ fontSize:32, marginBottom:8 }}>🚀</div>
            <div style={{ fontSize:13, fontWeight:600, color:txt }}>Run the full pipeline to see your score</div>
          </div>
        )}
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          <div style={{ display:"flex", gap:8 }}>
            {[
              { l:"Critical",   v:(audit.issues?.p1||[]).length, c:"#DC2626" },
              { l:"Important",  v:(audit.issues?.p2||[]).length, c:"#D97706" },
              { l:"Quick Wins", v:(comp.analysis?.quickWins||[]).length, c:"#059669" },
              { l:"Completed",  v:doneCount, c:B },
            ].map(i => (
              <div key={i.l} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:8, padding:"10px 14px", textAlign:"center", flex:1 }}>
                <div style={{ fontSize:20, fontWeight:800, color:i.c }}>{i.v}</div>
                <div style={{ fontSize:10, color:txt2 }}>{i.l}</div>
              </div>
            ))}
          </div>
          {report.reportData?.verdict && (
            <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:8, padding:"10px 14px", borderLeft:`3px solid ${B}` }}>
              <div style={{ fontSize:10, color:B, fontWeight:700, marginBottom:4, textTransform:"uppercase", letterSpacing:0.5 }}>🤖 AI Verdict</div>
              <div style={{ fontSize:12, color:txt, lineHeight:1.6 }}>{report.reportData.verdict?.split(".").slice(0,2).join(".")+"."}</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Progress bar ────────────────────────────────── */}
      {total > 0 && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"10px 16px", marginBottom:20, display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ fontSize:12, color:txt2, whiteSpace:"nowrap" }}>Progress: {doneCount}/{total} tasks</div>
          <div style={{ flex:1, height:8, background:bg3, borderRadius:4, overflow:"hidden" }}>
            <div style={{ width:`${(doneCount/total)*100}%`, height:"100%", background:`linear-gradient(90deg,${B},#059669)`, borderRadius:4, transition:"width 0.4s" }}/>
          </div>
          <div style={{ fontSize:12, fontWeight:700, color:B, whiteSpace:"nowrap" }}>{Math.round((doneCount/total)*100)}%</div>
        </div>
      )}

      {/* ── Today's Top 5 ──────────────────────────────── */}
      {topTasks.length > 0 && (
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:13, fontWeight:800, color:txt, marginBottom:12, display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ background:B, color:"#fff", borderRadius:6, padding:"3px 12px", fontSize:11 }}>TODAY</span>
            Fix These First — Highest Priority Actions
          </div>
          {topTasks.map((task, i) => <TaskCard key={task.id} task={task} taskKey={`top_${i}`} />)}
        </div>
      )}

      {/* ── AI Strategic Recommendations ─────────────── */}
      {(report.reportData?.next3Actions||[]).length > 0 && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:"16px 20px", marginBottom:20 }}>
          <div style={{ fontSize:11, fontWeight:800, color:"#0891B2", textTransform:"uppercase", letterSpacing:1, marginBottom:14 }}>🚀 AI Strategic Recommendations</div>
          {report.reportData.next3Actions.map((a, i) => (
            <div key={i} style={{ padding:"12px 14px", background:bg3, borderRadius:8, marginBottom:8, borderLeft:"3px solid #0891B2" }}>
              <div style={{ fontSize:13, fontWeight:700, color:txt, marginBottom:4 }}>{i+1}. {a.action}</div>
              <div style={{ fontSize:12, color:txt2, marginBottom:a.expectedOutcome?4:0 }}>{a.why}</div>
              {a.expectedOutcome && <div style={{ fontSize:11, color:"#0891B2" }}>→ Expected: {a.expectedOutcome}</div>}
            </div>
          ))}
        </div>
      )}

      {/* ── Category Accordion ──────────────────────────── */}
      {allTasks.length > 0 && (
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:12 }}>All Actions by Category</div>
          {CATEGORIES.map(cat => {
            const topIds   = new Set(topTasks.map(t => t.id));
            const catTasks = allTasks.filter(t => t.category === cat.id && !topIds.has(t.id));
            const topCount = allTasks.filter(t => t.category === cat.id && topIds.has(t.id)).length;
            if (!catTasks.length && !topCount) return null;
            const isOpen  = expanded === cat.id;
            const doneCat = catTasks.filter(t => done.has(t.id)).length;
            return (
              <div key={cat.id} style={{ marginBottom:8 }}>
                <div onClick={() => setExpanded(isOpen ? null : cat.id)}
                  style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"13px 16px",
                    background:bg2, border:`1px solid ${isOpen?cat.color:bdr}`, borderLeft:`4px solid ${cat.color}`,
                    borderRadius:isOpen?"10px 10px 0 0":10, cursor:"pointer" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span>{cat.icon}</span>
                    <span style={{ fontSize:13, fontWeight:700, color:txt }}>{cat.label}</span>
                    <span style={{ fontSize:11, padding:"2px 8px", borderRadius:10, background:`${cat.color}20`, color:cat.color, fontWeight:700 }}>{catTasks.length + topCount}</span>
                    {topCount > 0 && <span style={{ fontSize:10, color:txt2 }}>({topCount} shown above)</span>}
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    {doneCat>0 && <span style={{ fontSize:11, color:"#059669", fontWeight:600 }}>✅ {doneCat}/{catTasks.length}</span>}
                    <span style={{ fontSize:12, color:txt2 }}>{isOpen?"▲":"▼"}</span>
                  </div>
                </div>
                {isOpen && (
                  <div style={{ padding:"12px 12px 2px", border:`1px solid ${cat.color}`, borderTop:"none", borderRadius:"0 0 10px 10px", background:bg3 }}>
                    {topCount > 0 && catTasks.length === 0 && (
                      <div style={{ fontSize:12, color:txt2, padding:"10px 4px", textAlign:"center" }}>All {topCount} item(s) from this category are shown in "Fix These First" above.</div>
                    )}
                    {catTasks.map((task, i) => <TaskCard key={task.id} task={task} taskKey={`cat_${cat.id}_${i}`} />)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {allTasks.length === 0 && !hs && (
        <div style={{ textAlign:"center", padding:60, color:txt2 }}>
          <div style={{ fontSize:40, marginBottom:16 }}>🚀</div>
          <div style={{ fontSize:15, fontWeight:700, color:txt, marginBottom:8 }}>Your AI SEO Employee is ready</div>
          <div style={{ fontSize:13 }}>Run the full analysis to get your prioritised action plan</div>
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
  const verdict = report.reportData?.verdict || "";
  const shortVerdict = verdict.split(".")[0] + (verdict.includes(".") ? "." : "");
  const shortId = report.approvalId ? report.approvalId.slice(0, 8).toUpperCase() : null;
  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:shortVerdict ? 4 : 0 }}>
        <span style={{ fontSize:11, padding:"2px 8px", borderRadius:8, background:"#05966918", color:"#059669", fontWeight:700 }}>
          ✅ Report Ready
        </span>
        {shortId && (
          <span style={{ fontSize:10, color:txt2 }}>#{shortId}</span>
        )}
      </div>
      {shortVerdict && <div style={{ fontSize:12, color:txt2, lineHeight:1.5 }}>{shortVerdict}</div>}
    </div>
  );
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
        {[{ l:"Health", v:audit.healthScore != null ? audit.healthScore+"/100" : "—", c:"#443DCB" },{ l:"P1 Critical",v:audit.summary?.p1Count ?? "—",c:"#DC2626" },{ l:"P2 Important",v:audit.summary?.p2Count ?? "—",c:"#D97706" },{ l:"P3 Minor",v:audit.summary?.p3Count ?? "—",c:"#6B7280" }].map(i=>(
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

      {/* Structured Data & Schema */}
      {audit.checks?.eeat && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"14px 16px", marginBottom:12 }}>
          <div style={{ fontSize:12, fontWeight:700, color:txt, marginBottom:10 }}>Structured Data & Schema</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:8 }}>
            {[
              { l:"Schema.org", ok: audit.checks.eeat.hasSchemaOrg,        detail: audit.checks.eeat.hasSchemaOrg ? "Detected" : "Missing — add LocalBusiness schema" },
              { l:"JSON-LD",    ok: (audit.checks.jsonLdSchemas?.length>0), detail: audit.checks.jsonLdSchemas?.length > 0 ? `${audit.checks.jsonLdSchemas.length} blocks found` : "No JSON-LD blocks found" },
              { l:"Open Graph", ok: audit.checks.eeat.hasOpenGraph,         detail: audit.checks.eeat.hasOpenGraph ? "Present" : "Missing og:title/og:image" },
              { l:"Twitter Cards",ok:audit.checks.eeat.hasTwitterCard,      detail: audit.checks.eeat.hasTwitterCard ? "Present" : "Add twitter:card meta" },
            ].map(item => (
              <div key={item.l} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px", background:bg3, borderRadius:8, border:`1px solid ${item.ok?"#05966930":"#DC262630"}` }}>
                <span style={{ fontSize:16 }}>{item.ok ? "✅" : "❌"}</span>
                <div>
                  <div style={{ fontSize:12, fontWeight:600, color:txt }}>{item.l}</div>
                  <div style={{ fontSize:10, color:txt2 }}>{item.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Issues Accordion */}
      <AuditIssueAccordion audit={audit} bg2={bg2} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2} />
    </div>
  );
}

function AuditIssueAccordion({ audit, bg2, bg3, bdr, txt, txt2 }) {
  const [expanded,  setExpanded]  = useState(null);
  const [copied,    setCopied]    = useState(null);

  const TIERS = [
    { id:"p1", icon:"🔴", label:"Critical Issues",   color:"#DC2626", impact:"High",   effort:"Easy",   impactColor:"#DC2626", effortColor:"#059669",
      why:"Critical technical issues that directly block search engine crawling and hurt rankings immediately." },
    { id:"p2", icon:"🟡", label:"Important Fixes",   color:"#D97706", impact:"Medium", effort:"Medium", impactColor:"#D97706", effortColor:"#D97706",
      why:"Important SEO issues affecting your search visibility and page experience scores." },
    { id:"p3", icon:"⚪", label:"Minor Issues",       color:"#6B7280", impact:"Low",    effort:"Easy",   impactColor:"#6B7280", effortColor:"#059669",
      why:"Minor improvements that accumulate over time and signal quality to search engines." },
    { id:"opp", icon:"💡", label:"Opportunities",    color:"#0891B2", impact:"High",   effort:"Medium", impactColor:"#0891B2", effortColor:"#D97706",
      why:"Untapped SEO opportunities to gain a competitive advantage in search rankings." },
  ];

  // Build "opportunities" from audit data if available
  const opportunities = [];
  if (audit.checks?.eeat?.score < 6) opportunities.push({ detail:"Improve E-E-A-T signals — add About, Author Bio, and Trust pages", fix:"Create or improve About Us, Author Bio, and Privacy Policy pages. Add Schema.org markup for organization." });
  if (audit.checks?.sitemap?.exists === false) opportunities.push({ detail:"Create and submit XML sitemap to Google Search Console", fix:"Generate sitemap.xml and submit to Google Search Console. Add sitemap URL to robots.txt." });
  if (audit.checks?.ogTags && !audit.checks.ogTags.image) opportunities.push({ detail:"Add Open Graph image for better social sharing CTR", fix:"Add og:image meta tag pointing to a 1200×630px branded image on all key pages." });

  return (
    <div style={{ marginTop:4 }}>
      <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:12 }}>Issues by Priority</div>
      {TIERS.map(tier => {
        const issues = tier.id === "opp" ? opportunities : (audit.issues?.[tier.id] || []);
        if (!issues.length) return null;
        const isOpen = expanded === tier.id;
        return (
          <div key={tier.id} style={{ marginBottom:8 }}>
            {/* Accordion header */}
            <div
              onClick={() => setExpanded(isOpen ? null : tier.id)}
              style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"13px 16px",
                background:bg2, border:`1px solid ${isOpen ? tier.color : bdr}`, borderLeft:`4px solid ${tier.color}`,
                borderRadius: isOpen ? "10px 10px 0 0" : 10, cursor:"pointer" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span>{tier.icon}</span>
                <span style={{ fontSize:13, fontWeight:700, color:txt }}>{tier.label}</span>
                <span style={{ fontSize:11, padding:"2px 8px", borderRadius:10, background:`${tier.color}20`, color:tier.color, fontWeight:700 }}>{issues.length}</span>
              </div>
              <span style={{ fontSize:12, color:txt2 }}>{isOpen ? "▲" : "▼"}</span>
            </div>
            {/* Accordion body */}
            {isOpen && (
              <div style={{ padding:"12px 12px 2px", border:`1px solid ${tier.color}`, borderTop:"none", borderRadius:"0 0 10px 10px", background:bg3 }}>
                {issues.map((issue, i) => {
                  const key = `${tier.id}_${i}`;
                  return (
                    <div key={i} style={{ background:bg2, border:`1px solid ${bdr}`, borderLeft:`4px solid ${tier.color}`,
                      borderRadius:10, padding:16, marginBottom:10 }}>
                      {/* Badges */}
                      <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap" }}>
                        <span style={{ fontSize:10, padding:"3px 10px", borderRadius:10, background:`${tier.impactColor}18`, color:tier.impactColor, fontWeight:700 }}>Impact: {tier.impact}</span>
                        <span style={{ fontSize:10, padding:"3px 10px", borderRadius:10, background:`${tier.effortColor}18`, color:tier.effortColor, fontWeight:700 }}>Effort: {tier.effort}</span>
                      </div>
                      {/* Issue description */}
                      <div style={{ fontSize:13, fontWeight:700, color:txt, marginBottom:8, lineHeight:1.4 }}>{issue.detail}</div>
                      {/* Why it matters */}
                      <div style={{ fontSize:12, color:txt2, marginBottom:10, lineHeight:1.6, padding:"8px 12px", background:bg3, borderRadius:6 }}>
                        <span style={{ color:tier.color, fontWeight:700 }}>Why it matters: </span>{tier.why}
                      </div>
                      {/* Fix suggestion */}
                      {issue.fix && (
                        <div style={{ fontSize:12, color:txt, marginBottom:12, lineHeight:1.55 }}>
                          <span style={{ fontWeight:700, color:"#059669" }}>→ Suggested fix: </span>{issue.fix}
                        </div>
                      )}
                      {/* CTAs */}
                      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                        <button
                          onClick={() => { navigator.clipboard?.writeText(issue.fix || issue.detail || ""); setCopied(key); setTimeout(() => setCopied(null), 2000); }}
                          style={{ padding:"7px 16px", borderRadius:8, border:"none", background:"#059669", color:"#fff", fontSize:11, fontWeight:700, cursor:"pointer" }}>
                          {copied === key ? "✅ Copied!" : "📋 Fix Now"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FullKeywordsView({ kw, bg2, bg3, bdr, txt, txt2 }) {
  const [activeCluster, setActiveCluster] = useState("all");
  const clusters     = kw.clusters || {};
  const keywordMap   = kw.keywordMap || [];
  const hasVolume    = keywordMap.some(k => k.searchVolume != null);
  const hasRankings  = (kw.rankingKeywords || kw.currentRankings || []).length > 0;
  const rankMap      = {};
  (kw.currentRankings || []).forEach(r => { rankMap[(r.keyword||"").toLowerCase()] = r.position || r.rank; });

  const intentColor  = { transactional:"#059669", informational:"#0891B2", commercial:"#443DCB", navigational:"#D97706", local:"#DC2626" };
  const diffColor    = { low:"#059669", medium:"#D97706", high:"#DC2626" };

  // Flatten all cluster keywords with their cluster name
  const allKws = Object.entries(clusters)
    .filter(([k]) => k !== "gaps")
    .flatMap(([cluster, items]) => (Array.isArray(items) ? items : []).map(k => ({ ...k, cluster })));

  const clusterNames = ["all", ...Object.keys(clusters).filter(k => k !== "gaps")];
  const displayed    = activeCluster === "all" ? allKws : (Array.isArray(clusters[activeCluster]) ? clusters[activeCluster] : []).map(k => ({ ...k, cluster:activeCluster }));

  // Stats bar
  const totalKws   = allKws.length;
  const highPrio   = allKws.filter(k => k.priority === "high").length;
  const avgVolume  = hasVolume ? Math.round(allKws.filter(k=>k.searchVolume).reduce((s,k)=>s+(k.searchVolume||0),0) / allKws.filter(k=>k.searchVolume).length) : null;

  return (
    <div style={{ padding:4 }}>
      {/* Current Rankings — from SE Ranking / SerpAPI */}
      {(kw.currentRankings || []).length > 0 && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:"14px 18px", marginBottom:16 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
            <div style={{ fontSize:13, fontWeight:700, color:txt }}>Your Current Rankings</div>
            <span style={{ fontSize:10, color:txt2, background:bg3, padding:"3px 8px", borderRadius:6 }}>Live from SE Ranking</span>
          </div>
          {(kw.currentRankings || []).slice(0, 15).map((r, i) => {
            const pos = r.position || r.rank;
            const posColor = pos <= 3 ? "#059669" : pos <= 10 ? "#D97706" : "#DC2626";
            const posLabel = pos <= 3 ? "Top 3" : pos <= 10 ? "Page 1" : "Page 2+";
            return (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:`1px solid ${bdr}` }}>
                <div style={{ minWidth:36, height:36, borderRadius:8, background:`${posColor}18`, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column" }}>
                  <span style={{ fontSize:13, fontWeight:800, color:posColor }}>#{pos}</span>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:txt }}>{r.keyword}</div>
                  {r.url && <div style={{ fontSize:10, color:txt2 }}>{r.url.replace(/^https?:\/\/[^/]+/, "")}</div>}
                </div>
                <div style={{ textAlign:"right" }}>
                  {r.volume != null && <div style={{ fontSize:11, color:"#059669", fontWeight:700 }}>{r.volume.toLocaleString()}/mo</div>}
                  <span style={{ fontSize:9, padding:"2px 6px", borderRadius:6, background:`${posColor}18`, color:posColor, fontWeight:600 }}>{posLabel}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Stats */}
      <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" }}>
        {[
          { label:"Total Keywords", val:totalKws,                                  color:"#443DCB" },
          { label:"High Priority",  val:highPrio,                                  color:"#DC2626" },
          { label:"Content Gaps",   val:(kw.gaps||[]).length,                      color:"#D97706" },
          { label:"Avg. Volume",    val:avgVolume ? avgVolume.toLocaleString() : "—", color:"#059669" },
          { label:"Snippet Opps",   val:(kw.snippetOpportunities||[]).length,      color:"#0891B2" },
        ].map(s => (
          <div key={s.label} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"10px 16px", textAlign:"center", minWidth:80 }}>
            <div style={{ fontSize:18, fontWeight:800, color:s.color }}>{s.val}</div>
            <div style={{ fontSize:10, color:txt2 }}>{s.label}</div>
          </div>
        ))}
        {!hasVolume && (
          <div style={{ background:"#D9770611", border:"1px solid #D9770633", borderRadius:10, padding:"10px 16px", fontSize:11, color:"#D97706", display:"flex", alignItems:"center", gap:6 }}>
            <span>⚠️</span> Add a SerpAPI or SE Ranking key in Settings to unlock real search volume, CPC &amp; competition data
          </div>
        )}
      </div>

      {/* Cluster filter tabs */}
      <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
        {clusterNames.map(c => (
          <button key={c} onClick={() => setActiveCluster(c)} style={{
            padding:"5px 12px", borderRadius:8, fontSize:11, fontWeight:600, cursor:"pointer", textTransform:"capitalize",
            background: activeCluster===c ? "#443DCB" : "transparent",
            color:      activeCluster===c ? "#fff"    : txt2,
            border:     `1px solid ${activeCluster===c ? "#443DCB" : bdr}`,
          }}>
            {c} {c !== "all" ? `(${(clusters[c]||[]).length})` : `(${totalKws})`}
          </button>
        ))}
      </div>

      {/* Table header */}
      <div style={{ display:"grid", gridTemplateColumns:"2.5fr 1fr 1fr 1fr 1fr 1.5fr", padding:"8px 12px", background:bg3, borderRadius:"8px 8px 0 0", borderBottom:`1px solid ${bdr}`, border:`1px solid ${bdr}` }}>
        {["Keyword","Volume","Difficulty","CPC","Position","Intent / AI Risk"].map(h => (
          <div key={h} style={{ fontSize:9, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:0.5 }}>{h}</div>
        ))}
      </div>

      {/* Keyword rows */}
      <div style={{ border:`1px solid ${bdr}`, borderTop:"none", borderRadius:"0 0 8px 8px", overflow:"hidden" }}>
        {displayed.map((k, i) => {
          const pos      = rankMap[k.keyword?.toLowerCase()];
          const posColor = !pos ? "#6B7280" : pos <= 3 ? "#059669" : pos <= 10 ? "#D97706" : "#DC2626";
          const dc       = diffColor[k.difficulty] || "#6B7280";
          const ic       = intentColor[k.intent] || "#6B7280";

          // Zero-click AI Overview risk — based on intent
          const aiRisk = k.aiOverviewRisk ||
            (k.intent === "informational" ? "high" :
             k.intent === "commercial"    ? "medium" :
             k.intent === "transactional" ? "low" : "medium");
          const aiRiskColor = aiRisk === "high" ? "#DC2626" : aiRisk === "low" ? "#059669" : "#D97706";
          const aiRiskLabel = aiRisk === "high" ? "⚠️ AI risk" : aiRisk === "low" ? "✅ Safe" : "~ Medium";

          return (
            <div key={i} style={{ display:"grid", gridTemplateColumns:"2.5fr 1fr 1fr 1fr 1fr 1.5fr", padding:"10px 12px", borderBottom:`1px solid ${bdr}`, background: i%2===0 ? bg2 : bg3, alignItems:"center" }}>
              {/* Keyword */}
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:txt }}>{k.keyword}</div>
                {k.notes && <div style={{ fontSize:10, color:txt2, marginTop:1 }}>{k.notes}</div>}
                {k.priority === "high" && <span style={{ fontSize:9, background:"#DC262618", color:"#DC2626", padding:"1px 6px", borderRadius:6, fontWeight:700 }}>HIGH PRIORITY</span>}
              </div>
              {/* Volume */}
              <div style={{ fontSize:12, fontWeight:700, color:k.searchVolume ? "#059669" : txt2 }}>
                {k.searchVolume ? k.searchVolume.toLocaleString() : "—"}
              </div>
              {/* Difficulty */}
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:dc }}>{k.difficulty || "—"}</div>
                {k.realDifficulty != null && (
                  <div style={{ height:3, borderRadius:2, background:bdr, marginTop:3, width:"80%" }}>
                    <div style={{ height:"100%", width:`${k.realDifficulty}%`, background:dc, borderRadius:2 }} />
                  </div>
                )}
              </div>
              {/* CPC */}
              <div style={{ fontSize:12, color:txt2 }}>
                {k.cpc ? `$${parseFloat(k.cpc).toFixed(2)}` : "—"}
              </div>
              {/* Current position */}
              <div style={{ fontSize:13, fontWeight:800, color:posColor }}>
                {pos ? `#${pos}` : "—"}
              </div>
              {/* Intent + AI Risk */}
              <div>
                <span style={{ fontSize:9, padding:"2px 7px", borderRadius:8, background:`${ic}22`, color:ic, fontWeight:600, display:"inline-block", marginBottom:3 }}>{k.intent}</span>
                <div>
                  <span style={{ fontSize:9, padding:"2px 7px", borderRadius:8, background:`${aiRiskColor}18`, color:aiRiskColor, fontWeight:600 }} title="AI Overview risk — HIGH means Google may show AI answer instead of your link">{aiRiskLabel}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Content Gaps */}
      {(kw.gaps||[]).length > 0 && (
        <div style={{ marginTop:20 }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#DC2626", textTransform:"uppercase", marginBottom:10 }}>
            🚨 Content Gaps — pages you should create ({kw.gaps.length})
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:8 }}>
            {(kw.gaps||[]).map((g,i)=>(
              <div key={i} style={{ background:bg2, border:"1px solid #DC262633", borderRadius:10, padding:"12px 14px", borderLeft:"3px solid #DC2626" }}>
                <div style={{ fontSize:12, color:txt, fontWeight:700, marginBottom:4 }}>{g.keyword}</div>
                <div style={{ fontSize:11, color:txt2, marginBottom:6 }}>{g.reason}</div>
                <div style={{ fontSize:11, color:"#059669", fontWeight:600 }}>→ {g.recommendedAction}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Snippet Opportunities */}
      {(kw.snippetOpportunities||[]).length > 0 && (
        <div style={{ marginTop:20 }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#0891B2", textTransform:"uppercase", marginBottom:10 }}>
            ⭐ Featured Snippet Opportunities ({kw.snippetOpportunities.length})
          </div>
          {(kw.snippetOpportunities||[]).map((s,i)=>(
            <div key={i} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"12px 14px", marginBottom:8 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                <span style={{ fontSize:13, color:txt, fontWeight:700 }}>{s.keyword}</span>
                <div style={{ display:"flex", gap:6 }}>
                  <span style={{ fontSize:9, padding:"2px 8px", borderRadius:8, background:"#0891B222", color:"#0891B2", fontWeight:700 }}>{s.snippetType?.replace("_"," ")}</span>
                  <span style={{ fontSize:9, padding:"2px 8px", borderRadius:8, background:bg3, color:txt2 }}>{s.priority} priority</span>
                </div>
              </div>
              <div style={{ fontSize:11, color:txt2, marginBottom:4 }}>Target page: <span style={{ color:txt, fontWeight:600 }}>{s.targetPage}</span></div>
              <div style={{ fontSize:11, color:"#059669", background:"#05966911", padding:"6px 10px", borderRadius:6 }}>{s.strategy}</div>
            </div>
          ))}
        </div>
      )}

      {/* Cannibalization alerts */}
      {((kw.cannibalization||kw.cannibalizationRisk)||[]).length > 0 && (
        <div style={{ marginTop:20 }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#D97706", textTransform:"uppercase", marginBottom:10 }}>
            ⚠️ Keyword Cannibalization Risks ({(kw.cannibalization||kw.cannibalizationRisk).length})
          </div>
          {(kw.cannibalization||kw.cannibalizationRisk).map((c,i)=>(
            <div key={i} style={{ background:"#D9770611", border:"1px solid #D9770633", borderRadius:10, padding:"12px 14px", marginBottom:8 }}>
              <div style={{ fontSize:12, color:txt, fontWeight:600, marginBottom:4 }}>Page: {c.page}</div>
              <div style={{ fontSize:11, color:txt2, marginBottom:4 }}>{c.keywordCount} keywords targeting the same page: {(c.keywords||[]).slice(0,3).join(", ")}{c.keywords?.length > 3 ? "..." : ""}</div>
              <div style={{ fontSize:11, color:"#D97706", fontWeight:600 }}>{c.fix}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FullCompetitorView({ comp, bg2, bg3, bdr, txt, txt2 }) {
  const [tab, setTab]   = useState("competitors");
  const [openComp, setOpenComp] = useState(null);
  const opp = { not_ranking:"#DC2626", top_3:"#059669", page_1:"#D97706", below_fold:"#6B7280", ranking_well:"#059669" };
  const threat = { high:"#DC2626", medium:"#D97706", low:"#059669" };

  const quickWins           = comp.analysis?.quickWins           || [];
  const contentGaps         = comp.analysis?.contentGaps         || [];
  const topCompetitors      = comp.analysis?.topCompetitors      || [];
  const keywordOpportunities= comp.analysis?.keywordOpportunities|| [];
  const discoveredComps     = comp.discoveredCompetitors         || [];
  const rankMatrix          = comp.rankingMatrix                 || [];
  const notRanking          = rankMatrix.filter(r => r.opportunity === "not_ranking");
  const ranking             = rankMatrix.filter(r => r.opportunity !== "not_ranking");

  // Merge crawl profiles with AI analysis
  const mergedCompetitors = discoveredComps.map(dc => {
    const ai = topCompetitors.find(t => t.domain === dc.domain) || {};
    return { ...dc, ...ai };
  });
  // If A4 was run with manual competitors (no crawl data), fall back to AI topCompetitors
  const displayCompetitors = mergedCompetitors.length > 0 ? mergedCompetitors : topCompetitors;

  const tabs = [
    { id:"competitors", label:`Competitors (${displayCompetitors.length || comp.summary?.competitorsAnalysed || 0})` },
    { id:"gaps",        label:`Quick Wins (${quickWins.length})` },
    { id:"content",     label:`Content Gaps (${contentGaps.length})` },
    { id:"keywords",    label:`Keyword Status (${rankMatrix.length})` },
    ...(keywordOpportunities.length > 0 ? [{ id:"opportunities", label:`Opportunities (${keywordOpportunities.length})` }] : []),
  ];

  return (
    <div>
      {/* Context banner */}
      <div style={{ background:"#443DCB0d", border:"1px solid #443DCB22", borderRadius:10, padding:"12px 16px", marginBottom:16 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:"#443DCB", marginBottom:4 }}>
              {comp.autoDiscovered ? "🔍 Competitors Auto-Discovered from SERP" : "📋 Competitor Analysis"}
            </div>
            <div style={{ fontSize:12, color:txt2, lineHeight:1.6 }}>
              {comp.autoDiscovered
                ? `No competitor list was provided — ${displayCompetitors.length} competitors were automatically discovered by scanning your target keywords in search results. Their pages were crawled for real SEO factors.`
                : "AI compared your website against your provided competitors across target keywords."}
            </div>
          </div>
          {comp.autoDiscovered && (
            <span style={{ fontSize:10, padding:"3px 10px", borderRadius:8, background:"#443DCB18", color:"#443DCB", fontWeight:700, whiteSpace:"nowrap", marginLeft:12 }}>
              AUTO-DISCOVERED
            </span>
          )}
        </div>
      </div>

      {/* Summary stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10, marginBottom:16 }}>
        {[
          { l:"Competitors",    v: comp.summary?.competitorsAnalysed || displayCompetitors.length, c:"#443DCB", desc:"analysed from SERP" },
          { l:"Not Ranking",    v: comp.summary?.notRanking || notRanking.length,    c:"#DC2626", desc:"keywords you're invisible for" },
          { l:"In Top 3",       v: comp.summary?.rankingTop3 || ranking.filter(r=>r.opportunity==="top_3").length, c:"#059669", desc:"keywords you dominate" },
          { l:"Content Gaps",   v: comp.summary?.contentGapsFound || contentGaps.length, c:"#D97706", desc:"topics competitors cover" },
          { l:"Quick Wins",     v: comp.summary?.quickWinsFound || quickWins.length, c:"#0891B2", desc:"easy wins available now" },
        ].map(i=>(
          <div key={i.l} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"12px 10px", textAlign:"center", borderTop:`3px solid ${i.c}` }}>
            <div style={{ fontSize:22, fontWeight:800, color:i.c }}>{i.v}</div>
            <div style={{ fontSize:11, color:txt, fontWeight:600 }}>{i.l}</div>
            <div style={{ fontSize:10, color:txt2, marginTop:2 }}>{i.desc}</div>
          </div>
        ))}
      </div>

      {/* Strategic summary */}
      {comp.analysis?.strategicSummary && (
        <div style={{ background:bg3, borderRadius:10, padding:"12px 16px", marginBottom:16, borderLeft:"4px solid #443DCB", fontSize:12, color:txt2, lineHeight:1.7 }}>
          <span style={{ fontWeight:700, color:"#443DCB" }}>AI Analysis: </span>{comp.analysis.strategicSummary}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding:"6px 14px", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer", border:`1px solid ${tab===t.id?"#443DCB":bdr}`, background:tab===t.id?"#443DCB":"transparent", color:tab===t.id?"#fff":txt2 }}>{t.label}</button>
        ))}
      </div>

      {/* ── Competitors Tab ── */}
      {tab === "competitors" && (
        <div>
          {displayCompetitors.length === 0 && (
            <div style={{ padding:32, textAlign:"center", background:bg2, border:`1px solid ${bdr}`, borderRadius:10, color:txt2, fontSize:12 }}>
              No competitor data yet. Re-run A4 to auto-discover competitors from SERP.
            </div>
          )}
          {displayCompetitors.map((c, i) => {
            const isOpen = openComp === i;
            const crawl  = c.crawl || null;
            const tc     = threat[c.threat] || "#6B7280";
            return (
              <div key={i} style={{ background:bg2, border:`1px solid ${isOpen ? "#443DCB" : bdr}`, borderRadius:10, marginBottom:10, overflow:"hidden" }}>
                {/* Header row */}
                <div onClick={() => setOpenComp(isOpen ? null : i)}
                  style={{ padding:"14px 16px", cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <div style={{ width:36, height:36, borderRadius:8, background:`${tc}18`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      <span style={{ fontSize:14, fontWeight:800, color:tc }}>{(c.domain||"?")[0].toUpperCase()}</span>
                    </div>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:txt }}>{c.domain}</div>
                      <div style={{ display:"flex", gap:8, marginTop:3 }}>
                        {c.serpCount != null && (
                          <span style={{ fontSize:10, color:txt2 }}>Appeared {c.serpCount}× in SERP</span>
                        )}
                        {c.avgPosition != null && (
                          <span style={{ fontSize:10, color:"#443DCB", fontWeight:600 }}>Avg position #{c.avgPosition}</span>
                        )}
                        {crawl?.wordCount && (
                          <span style={{ fontSize:10, color:txt2 }}>~{crawl.wordCount.toLocaleString()} words</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    {c.threat && (
                      <span style={{ fontSize:10, padding:"2px 10px", borderRadius:8, background:`${tc}18`, color:tc, fontWeight:700 }}>
                        {c.threat?.toUpperCase()} THREAT
                      </span>
                    )}
                    <span style={{ fontSize:12, color:txt2 }}>{isOpen ? "▲" : "▼"}</span>
                  </div>
                </div>

                {/* Expanded detail */}
                {isOpen && (
                  <div style={{ borderTop:`1px solid ${bdr}`, background:bg3, padding:"16px" }}>

                    {/* Real crawl data row */}
                    {crawl && (
                      <div style={{ marginBottom:14 }}>
                        <div style={{ fontSize:10, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>🔍 Real Page Data (crawled)</div>
                        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:8 }}>
                          {crawl.title && (
                            <div style={{ background:bg2, borderRadius:8, padding:"8px 10px" }}>
                              <div style={{ fontSize:9, color:txt2, fontWeight:700, textTransform:"uppercase", marginBottom:3 }}>Title ({crawl.titleLen} chars)</div>
                              <div style={{ fontSize:11, color:crawl.titleLen >= 30 && crawl.titleLen <= 70 ? "#059669" : "#D97706" }}>{crawl.title}</div>
                            </div>
                          )}
                          {crawl.meta && (
                            <div style={{ background:bg2, borderRadius:8, padding:"8px 10px" }}>
                              <div style={{ fontSize:9, color:txt2, fontWeight:700, textTransform:"uppercase", marginBottom:3 }}>Meta ({crawl.metaLen} chars)</div>
                              <div style={{ fontSize:11, color:txt2 }}>{crawl.meta}</div>
                            </div>
                          )}
                          {crawl.h1 && (
                            <div style={{ background:bg2, borderRadius:8, padding:"8px 10px" }}>
                              <div style={{ fontSize:9, color:txt2, fontWeight:700, textTransform:"uppercase", marginBottom:3 }}>H1</div>
                              <div style={{ fontSize:11, color:txt }}>{crawl.h1}</div>
                            </div>
                          )}
                        </div>
                        {crawl.h2s?.length > 0 && (
                          <div style={{ marginTop:8 }}>
                            <div style={{ fontSize:9, color:txt2, fontWeight:700, textTransform:"uppercase", marginBottom:4 }}>H2 Subheadings</div>
                            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                              {crawl.h2s.map((h,j) => (
                                <span key={j} style={{ fontSize:10, padding:"2px 10px", borderRadius:8, background:`${bg2}`, border:`1px solid ${bdr}`, color:txt2 }}>{h}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        <div style={{ display:"flex", gap:10, marginTop:8, flexWrap:"wrap" }}>
                          <span style={{ fontSize:10, padding:"2px 8px", borderRadius:6, background: crawl.isHttps?"#05966918":"#DC262618", color: crawl.isHttps?"#059669":"#DC2626", fontWeight:600 }}>
                            {crawl.isHttps ? "✅ HTTPS" : "❌ HTTP"}
                          </span>
                          <span style={{ fontSize:10, padding:"2px 8px", borderRadius:6, background: crawl.hasCanonical?"#05966918":"#D9770618", color: crawl.hasCanonical?"#059669":"#D97706", fontWeight:600 }}>
                            {crawl.hasCanonical ? "✅ Canonical" : "⚠️ No Canonical"}
                          </span>
                          <span style={{ fontSize:10, padding:"2px 8px", borderRadius:6, background: crawl.hasOG?"#05966918":"#D9770618", color: crawl.hasOG?"#059669":"#D97706", fontWeight:600 }}>
                            {crawl.hasOG ? "✅ OG Tags" : "⚠️ No OG Tags"}
                          </span>
                          {crawl.schemaTypes?.length > 0 && (
                            <span style={{ fontSize:10, padding:"2px 8px", borderRadius:6, background:"#443DCB18", color:"#443DCB", fontWeight:600 }}>
                              Schema: {crawl.schemaTypes.join(", ")}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* AI analysis */}
                    {(c.strengths?.length > 0 || c.weaknesses?.length > 0 || c.contentFocus || c.keyTakeaway) && (
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
                        {c.strengths?.length > 0 && (
                          <div>
                            <div style={{ fontSize:10, fontWeight:700, color:"#DC2626", textTransform:"uppercase", marginBottom:6 }}>⚠️ Their Strengths</div>
                            {c.strengths.map((s,j) => <div key={j} style={{ fontSize:11, color:txt2, padding:"3px 0", borderBottom:`1px solid ${bdr}` }}>• {s}</div>)}
                          </div>
                        )}
                        {c.weaknesses?.length > 0 && (
                          <div>
                            <div style={{ fontSize:10, fontWeight:700, color:"#059669", textTransform:"uppercase", marginBottom:6 }}>✅ Their Weaknesses (your opportunity)</div>
                            {c.weaknesses.map((w,j) => <div key={j} style={{ fontSize:11, color:txt2, padding:"3px 0", borderBottom:`1px solid ${bdr}` }}>• {w}</div>)}
                          </div>
                        )}
                      </div>
                    )}
                    {c.seoTechnique && (
                      <div style={{ fontSize:11, color:txt2, marginBottom:6 }}>
                        <span style={{ fontWeight:700, color:txt }}>SEO Approach: </span>{c.seoTechnique}
                      </div>
                    )}
                    {c.titleStrategy && (
                      <div style={{ fontSize:11, color:txt2, marginBottom:6 }}>
                        <span style={{ fontWeight:700, color:txt }}>Title Strategy: </span>{c.titleStrategy}
                      </div>
                    )}
                    {c.keyTakeaway && (
                      <div style={{ background:"#443DCB0d", border:"1px solid #443DCB22", borderRadius:8, padding:"8px 12px", marginTop:8, fontSize:12, color:"#443DCB", fontWeight:600 }}>
                        💡 Key Takeaway: {c.keyTakeaway}
                      </div>
                    )}

                    {/* Keyword positions for this competitor */}
                    {rankMatrix.filter(r => r.competitors?.some(cp => cp.competitor === c.domain && cp.position)).length > 0 && (
                      <div style={{ marginTop:12 }}>
                        <div style={{ fontSize:10, fontWeight:700, color:txt2, textTransform:"uppercase", marginBottom:6 }}>Keyword Positions vs You</div>
                        <div style={{ background:bg2, borderRadius:8, overflow:"hidden" }}>
                          <div style={{ display:"grid", gridTemplateColumns:"2fr 100px 100px", padding:"6px 10px", background:bg3, fontSize:9, fontWeight:700, color:txt2, textTransform:"uppercase" }}>
                            <span>KEYWORD</span><span style={{ textAlign:"center" }}>YOU</span><span style={{ textAlign:"center" }}>THEM</span>
                          </div>
                          {rankMatrix.slice(0,8).map((r,j) => {
                            const cp = r.competitors?.find(cp => cp.competitor === c.domain);
                            return (
                              <div key={j} style={{ display:"grid", gridTemplateColumns:"2fr 100px 100px", padding:"7px 10px", borderBottom:`1px solid ${bdr}`, alignItems:"center", background: j%2===0?bg2:bg3 }}>
                                <span style={{ fontSize:11, color:txt }}>{r.keyword}</span>
                                <span style={{ textAlign:"center", fontSize:11, fontWeight:700, color: r.clientRank?"#443DCB":"#DC2626" }}>{r.clientRank?`#${r.clientRank}`:"NR"}</span>
                                <span style={{ textAlign:"center", fontSize:11, fontWeight:700, color: cp?.position?"#D97706":"#6B7280" }}>{cp?.position?`#${cp.position}`:"NR"}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Quick Wins tab ── */}
      {tab === "gaps" && (
        <div>
          {quickWins.length === 0 && (
            <div style={{ padding:32, textAlign:"center", background:bg2, border:`1px solid ${bdr}`, borderRadius:10, color:txt2, fontSize:12 }}>
              No quick wins detected yet. Run A4 to analyse competitors and discover opportunities.
            </div>
          )}
          {quickWins.map((w, i) => (
            <div key={i} style={{ background:bg2, border:`1px solid ${bdr}`, borderLeft:"4px solid #059669", borderRadius:10, padding:"12px 16px", marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                <span style={{ fontSize:10, padding:"2px 8px", borderRadius:8, background:"#05966918", color:"#059669", fontWeight:700 }}>Quick Win #{i+1}</span>
                {w.effort && <span style={{ fontSize:10, padding:"2px 8px", borderRadius:8, background:w.effort==="low"?"#05966918":w.effort==="medium"?"#D9770618":"#DC262618", color:w.effort==="low"?"#059669":w.effort==="medium"?"#D97706":"#DC2626", fontWeight:600 }}>{w.effort} effort</span>}
              </div>
              <div style={{ fontSize:13, fontWeight:700, color:txt, marginBottom:4 }}>{w.action}</div>
              <div style={{ fontSize:12, color:txt2, marginBottom:6 }}>Target keyword: <strong style={{ color:"#443DCB" }}>{w.keyword}</strong></div>
              {w.expectedOutcome && <div style={{ fontSize:11, color:"#059669" }}>→ Expected: {w.expectedOutcome}</div>}
            </div>
          ))}
        </div>
      )}

      {/* ── Content Gaps tab ── */}
      {tab === "content" && (
        <div>
          {contentGaps.length === 0 && (
            <div style={{ padding:32, textAlign:"center", background:bg2, border:`1px solid ${bdr}`, borderRadius:10, color:txt2, fontSize:12 }}>
              No content gaps found.
            </div>
          )}
          {contentGaps.map((g, i) => (
            <div key={i} style={{ background:bg2, border:`1px solid ${bdr}`, borderLeft:"4px solid #D97706", borderRadius:10, padding:"12px 16px", marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                <div style={{ fontSize:13, fontWeight:700, color:txt }}>{g.topic}</div>
                {g.estimatedDifficulty && (
                  <span style={{ fontSize:10, padding:"2px 8px", borderRadius:8, background:g.estimatedDifficulty==="low"?"#05966918":g.estimatedDifficulty==="medium"?"#D9770618":"#DC262618", color:g.estimatedDifficulty==="low"?"#059669":g.estimatedDifficulty==="medium"?"#D97706":"#DC2626", fontWeight:600 }}>{g.estimatedDifficulty} difficulty</span>
                )}
              </div>
              <div style={{ fontSize:12, color:txt2, marginBottom:6 }}>{g.description || "Your competitors rank for this topic. You have no page for it."}</div>
              {g.competitorsCovering?.length > 0 && (
                <div style={{ fontSize:11, color:txt2, marginBottom:4 }}>Covered by: {g.competitorsCovering.join(", ")}</div>
              )}
              {g.recommendedAction && (
                <div style={{ fontSize:11, color:"#D97706", fontWeight:600 }}>→ {g.recommendedAction}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Keyword Status tab ── */}
      {tab === "keywords" && (
        <div>
          {rankMatrix.length === 0 && (
            <div style={{ padding:32, textAlign:"center", background:bg2, border:`1px solid ${bdr}`, borderRadius:10, color:txt2, fontSize:12 }}>
              No keyword ranking data yet. A4 uses free SERP data — re-run to get positions.
            </div>
          )}
          {rankMatrix.length > 0 && (
            <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, overflow:"hidden" }}>
              <div style={{ display:"grid", gridTemplateColumns:"2fr 110px 110px 1fr", padding:"8px 14px", background:bg3, borderBottom:`1px solid ${bdr}`, fontSize:10, fontWeight:700, color:txt2, textTransform:"uppercase" }}>
                <span>KEYWORD</span>
                <span style={{ textAlign:"center" }}>YOUR RANK</span>
                <span style={{ textAlign:"center" }}>STATUS</span>
                <span>TOP RESULT</span>
              </div>
              {rankMatrix.slice(0,20).map((r, i) => (
                <div key={i} style={{ display:"grid", gridTemplateColumns:"2fr 110px 110px 1fr", padding:"10px 14px", borderBottom:`1px solid ${bdr}`, alignItems:"center", background: i%2===0?bg2:bg3 }}>
                  <span style={{ fontSize:12, color:txt, fontWeight:500 }}>{r.keyword}</span>
                  <span style={{ textAlign:"center", fontSize:12, fontWeight:700, color: r.clientRank ? "#443DCB" : "#DC2626" }}>
                    {r.clientRank ? `#${r.clientRank}` : "Not ranking"}
                  </span>
                  <span style={{ textAlign:"center" }}>
                    <span style={{ fontSize:10, padding:"2px 8px", borderRadius:8, background:`${opp[r.opportunity]||"#6B7280"}18`, color:opp[r.opportunity]||"#6B7280", fontWeight:600 }}>
                      {(r.opportunity||"unknown").replace(/_/g," ")}
                    </span>
                  </span>
                  <span style={{ fontSize:10, color:txt2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {r.topResult?.domain || "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Keyword Opportunities tab ── */}
      {tab === "opportunities" && (
        <div>
          {keywordOpportunities.map((o, i) => (
            <div key={i} style={{ background:bg2, border:`1px solid ${bdr}`, borderLeft:"4px solid #443DCB", borderRadius:10, padding:"12px 16px", marginBottom:10 }}>
              <div style={{ fontSize:13, fontWeight:700, color:txt, marginBottom:4 }}>{o.keyword}</div>
              <div style={{ fontSize:12, color:txt2, marginBottom:4 }}>{o.reason}</div>
              {o.currentLeader && <div style={{ fontSize:11, color:txt2 }}>Currently led by: <strong>{o.currentLeader}</strong></div>}
              {o.approach && <div style={{ fontSize:11, color:"#443DCB", fontWeight:600, marginTop:4 }}>→ {o.approach}</div>}
            </div>
          ))}
        </div>
      )}
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
                  <span style={{ fontSize:12, fontWeight:600, color:"#443DCB" }}>{s.type} — {s.page}</span>
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

      {/* Internal Link Recommendations */}
      {(op.internalLinks||[]).length > 0 && (
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>🔗 Internal Link Recommendations</div>
          <div style={{ background:"#443DCB08", border:"1px solid #443DCB22", borderRadius:8, padding:"8px 12px", marginBottom:8, fontSize:11, color:txt2 }}>
            Internal links pass PageRank between pages and help Google understand your site structure. Add these links to improve rankings across all pages.
          </div>
          {(op.internalLinks||[]).slice(0,8).map((lk,i) => (
            <div key={i} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:8, padding:"10px 14px", marginBottom:6, display:"flex", gap:10, alignItems:"flex-start" }}>
              <div style={{ width:22, height:22, borderRadius:"50%", background:"#443DCB22", color:"#443DCB", fontSize:10, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:1 }}>{i+1}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12, color:txt, marginBottom:3 }}>
                  <span style={{ fontWeight:600, color:"#443DCB" }}>{lk.fromPage}</span>
                  <span style={{ color:txt2 }}> → </span>
                  <span style={{ fontWeight:600, color:"#059669" }}>{lk.toPage}</span>
                </div>
                <div style={{ fontSize:11, color:"#0891B2" }}>Anchor: "<em>{lk.anchorText}</em>"</div>
                {(lk.why||lk.placement) && <div style={{ fontSize:10, color:txt2, marginTop:3 }}>{lk.placement ? `Placement: ${lk.placement} · ` : ""}{lk.why}</div>}
              </div>
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

function FullTechnicalView({ tech, audit, bg2, bg3, bdr, txt, txt2, onRefresh }) {
  const [refreshing, setRefreshing] = useState(false);
  const [perfTab, setPerfTab] = useState("homepage"); // homepage | pages
  const hasMobile  = !!(tech.cwvData?.mobile?.scores);
  const hasDesktop = !!(tech.cwvData?.desktop?.scores);
  const hasAnyData = hasMobile || hasDesktop;
  const mobileError  = tech.cwvData?.mobile?.error;
  const desktopError = tech.cwvData?.desktop?.error;
  const hasError = mobileError || desktopError;

  async function doRefresh() {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  }

  const CWV_INFO = {
    lcp: { name:"LCP (Largest Contentful Paint)", good:"< 2.5s", desc:"How fast the main content loads" },
    inp: { name:"INP (Interaction to Next Paint)", good:"< 200ms", desc:"How fast the page responds to taps and clicks — replaced FID in March 2024" },
    cls: { name:"CLS (Layout Shift)", good:"< 0.1", desc:"Does content jump around while loading" },
    fcp: { name:"FCP (First Contentful Paint)", good:"< 1.8s", desc:"When the first content appears" },
    tbt: { name:"TBT (Total Blocking Time)", good:"< 200ms", desc:"How long JS blocks the browser" },
  };

  return (
    <div>
      {/* Error / Refresh banner */}
      {hasError && (
        <div style={{ background:"#DC262611", border:"1px solid #DC262633", borderRadius:10, padding:"12px 16px", marginBottom:12 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, fontWeight:700, color:"#DC2626", marginBottom:3 }}>⚠️ PageSpeed API Error</div>
              <div style={{ fontSize:11, color:txt2, marginBottom:4 }}>
                <strong>{mobileError || desktopError}</strong>
              </div>
              <div style={{ fontSize:11, color:txt2 }}>
                Fix: Go to <strong>Settings → API Keys</strong> → add your Google API key, then refresh.
              </div>
            </div>
            <button onClick={doRefresh} disabled={refreshing} style={{ flexShrink:0, padding:"7px 14px", borderRadius:8, background:"#DC2626", color:"#fff", border:"none", fontSize:11, fontWeight:700, cursor:refreshing?"not-allowed":"pointer", opacity:refreshing?0.6:1 }}>
              {refreshing ? "Refreshing…" : "🔄 Retry"}
            </button>
          </div>
          <div style={{ marginTop:10, background:"#fff1f1", borderRadius:8, padding:"10px 14px" }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#DC2626", marginBottom:6 }}>How to fix:</div>
            <ol style={{ margin:0, paddingLeft:18, fontSize:11, color:txt2, lineHeight:2 }}>
              <li>Open <strong>console.cloud.google.com</strong> → APIs &amp; Services → Enable <strong>"PageSpeed Insights API"</strong></li>
              <li>Create an API key → Credentials → Create Credentials → API key</li>
              <li><strong>Set no restrictions</strong> on the key (or allow "PageSpeed Insights API")</li>
              <li>Go to <strong>Settings → API Keys</strong> → paste the key in the <strong>Google</strong> field → Save</li>
              <li>Click <strong>Retry</strong> above</li>
            </ol>
          </div>
        </div>
      )}

      {/* Refresh banner when data is missing but no error reported */}
      {!hasError && !hasAnyData && tech.cwvData && (
        <div style={{ background:"#D9770611", border:"1px solid #D9770633", borderRadius:10, padding:"12px 16px", marginBottom:12 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, fontWeight:700, color:"#D97706", marginBottom:3 }}>📡 PageSpeed data not loaded yet</div>
              <div style={{ fontSize:11, color:txt2 }}>
                Google PageSpeed Insights API may have been rate-limited (no API key) or timed out. Click <strong>Refresh CWV</strong> to try again.
                For reliable data, add a <strong>Google API key</strong> in Settings → API Keys.
              </div>
            </div>
            <button onClick={doRefresh} disabled={refreshing} style={{ flexShrink:0, padding:"7px 14px", borderRadius:8, background:"#D97706", color:"#fff", border:"none", fontSize:11, fontWeight:700, cursor:refreshing?"not-allowed":"pointer", opacity:refreshing?0.6:1 }}>
              {refreshing ? "Refreshing…" : "🔄 Refresh CWV"}
            </button>
          </div>
        </div>
      )}

      {/* Refresh button in top-right when data is good */}
      {hasAnyData && (
        <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:8 }}>
          <button onClick={doRefresh} disabled={refreshing} style={{ padding:"6px 12px", borderRadius:8, background:bg2, border:`1px solid ${bdr}`, color:txt2, fontSize:11, cursor:refreshing?"not-allowed":"pointer", opacity:refreshing?0.6:1 }}>
            {refreshing ? "Refreshing…" : "🔄 Refresh CWV"}
          </button>
        </div>
      )}

      {/* Google API key setup card */}
      {!hasAnyData && !tech.cwvData && (
        <div style={{ background:"#D9770611", border:"1px solid #D9770633", borderRadius:12, padding:"16px 20px", marginBottom:16 }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#D97706", marginBottom:8 }}>📡 Connect Google PageSpeed API for real Core Web Vitals data</div>
          <div style={{ fontSize:12, color:txt2, lineHeight:1.7, marginBottom:12 }}>
            Without a Google API key, CWV metrics (LCP, CLS, FCP, TBT) cannot be fetched. The technical recommendations below are still based on the actual page crawl.
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
            {Object.values(CWV_INFO).map(m => (
              <div key={m.name} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:8, padding:"10px 12px" }}>
                <div style={{ fontSize:11, fontWeight:700, color:txt }}>{m.name}</div>
                <div style={{ fontSize:10, color:txt2, marginTop:2 }}>{m.desc}</div>
                <div style={{ fontSize:10, color:"#059669", marginTop:2, fontWeight:600 }}>Good: {m.good}</div>
              </div>
            ))}
          </div>
          <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:8, padding:"10px 14px" }}>
            <div style={{ fontSize:11, fontWeight:700, color:txt, marginBottom:6 }}>How to connect:</div>
            <ol style={{ margin:0, paddingLeft:18, fontSize:11, color:txt2, lineHeight:1.8 }}>
              <li>Go to <strong>Settings → API Keys</strong> in the sidebar</li>
              <li>Add your Google API key (free at console.cloud.google.com)</li>
              <li>Enable PageSpeed Insights API in Google Cloud Console</li>
              <li>Re-run the pipeline — CWV data will appear here</li>
            </ol>
          </div>
        </div>
      )}

      {/* PageSpeed scores when available */}
      {hasAnyData && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
          {[["mobile","📱 Mobile"], ["desktop","🖥️ Desktop"]].map(([strat, label]) => {
            const d = tech.cwvData?.[strat];
            if (!d) return (
              <div key={strat} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:16, opacity:0.6 }}>
                <div style={{ fontSize:12, color:txt2 }}>{label}: No data</div>
              </div>
            );
            const perf = d.scores?.performance;
            const pc = perf >= 80 ? "#059669" : perf >= 50 ? "#D97706" : "#DC2626";
            return (
              <div key={strat} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:16 }}>
                <div style={{ fontSize:13, fontWeight:700, color:txt, marginBottom:10 }}>{label}</div>
                <div style={{ fontSize:36, fontWeight:800, color:pc, marginBottom:8 }}>{perf || "N/A"}<span style={{ fontSize:14, color:txt2 }}>/100</span></div>
                <div style={{ marginBottom:10 }}>
                  <div style={{ height:8, borderRadius:4, background:bdr, overflow:"hidden" }}>
                    <div style={{ height:"100%", width:`${perf||0}%`, background:pc, borderRadius:4 }}/>
                  </div>
                </div>
                {d.metrics && Object.entries(d.metrics).map(([k,v]) => (
                  <div key={k} style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:5, padding:"4px 0", borderBottom:`1px solid ${bdr}` }}>
                    <span style={{ color:txt2 }}>{CWV_INFO[k]?.name || k.toUpperCase()}</span>
                    <span style={{ color:txt, fontWeight:700 }}>{v}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Technical issues found by crawl (always shown) */}
      {(tech.techRecs?.priorityFixes||[]).length > 0 && (
        <div>
          <div style={{ fontSize:12, fontWeight:700, color:txt, marginBottom:10 }}>Issues Found (from page crawl)</div>
          {(tech.techRecs?.priorityFixes||[]).map((f, i) => {
            const ic = f.impact === "high" ? "#DC2626" : f.impact === "medium" ? "#D97706" : "#6B7280";
            return (
              <div key={i} style={{ background:bg2, border:`1px solid ${bdr}`, borderLeft:`4px solid ${ic}`, borderRadius:10, padding:"12px 16px", marginBottom:8 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                  <span style={{ fontSize:12, fontWeight:700, color:txt }}>{f.issue}</span>
                  <span style={{ fontSize:9, padding:"2px 7px", borderRadius:8, background:`${ic}18`, color:ic, fontWeight:700 }}>{f.impact} priority</span>
                </div>
                <div style={{ fontSize:12, color:txt2, lineHeight:1.5 }}>{f.fix}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Speed summary */}
      {tech.summary && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"12px 16px", marginTop:12 }}>
          <div style={{ fontSize:12, fontWeight:700, color:txt, marginBottom:8 }}>Performance Summary</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
            {[
              { l:"Mobile Score", v: tech.summary.mobileScore != null ? `${tech.summary.mobileScore}/100` : "—", c: tech.summary.mobileScore >= 80 ? "#059669" : tech.summary.mobileScore >= 50 ? "#D97706" : "#DC2626" },
              { l:"Desktop Score", v: tech.summary.desktopScore != null ? `${tech.summary.desktopScore}/100` : "—", c: tech.summary.desktopScore >= 80 ? "#059669" : "#D97706" },
              { l:"Critical Issues", v: tech.summary.criticalIssues || 0, c:"#DC2626" },
            ].map(s => (
              <div key={s.l} style={{ textAlign:"center" }}>
                <div style={{ fontSize:18, fontWeight:800, color:s.c }}>{s.v}</div>
                <div style={{ fontSize:10, color:txt2 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Per-Page Performance Section ──────────────── */}
      {(() => {
        const pageAudits = audit?.checks?.pageAudits || [];
        if (pageAudits.length === 0) return null;

        // Pages with response time data
        const withTime  = pageAudits.filter(p => p.responseTime != null).sort((a,b) => b.responseTime - a.responseTime);
        // Pages with performance-related issues
        const perfTypes = ["cwv","lcp","cls","inp","fcp","tbt","slow","response","speed","js","css","minif","cache","redirect"];
        const withIssues = pageAudits.filter(p =>
          (p.issues||[]).some(i => perfTypes.some(t => (i.type||"").includes(t) || (i.detail||"").toLowerCase().includes(t)))
        );
        // Pages with SEO issues
        const withSEOIssues = pageAudits.filter(p => (p.issues||[]).length > 0);

        return (
          <div style={{ marginTop:16 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
              <div style={{ fontSize:13, fontWeight:700, color:txt }}>
                📄 All Crawled Pages — {pageAudits.length} pages
              </div>
              <div style={{ display:"flex", gap:6 }}>
                {[
                  { id:"seo",   label:`SEO Issues (${withSEOIssues.length})` },
                  { id:"speed", label:`Speed (${withTime.length})` },
                ].map(t => (
                  <button key={t.id} onClick={() => setPerfTab(t.id)} style={{ padding:"5px 12px", borderRadius:8, fontSize:11, fontWeight:600, cursor:"pointer", border:`1px solid ${perfTab===t.id?"#443DCB":bdr}`, background:perfTab===t.id?"#443DCB":"transparent", color:perfTab===t.id?"#fff":txt2 }}>{t.label}</button>
                ))}
              </div>
            </div>

            {/* SEO Issues per page */}
            {perfTab === "seo" && (
              <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, overflow:"hidden" }}>
                {withSEOIssues.length === 0 && (
                  <div style={{ padding:24, textAlign:"center", color:"#059669", fontSize:12, fontWeight:600 }}>✅ No issues found on crawled pages</div>
                )}
                {withSEOIssues.map((p, i) => {
                  const critCount = (p.issues||[]).filter(x => x.severity === "critical").length;
                  const warnCount = (p.issues||[]).filter(x => x.severity === "warning").length;
                  let pagePath = p.url;
                  try { pagePath = new URL(p.url).pathname; } catch {}
                  return (
                    <div key={i} style={{ padding:"10px 14px", borderBottom:`1px solid ${bdr}`, background: i%2===0?bg2:bg3 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
                        <div style={{ fontSize:12, fontWeight:600, color:txt, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", marginRight:12 }}>
                          {p.title && p.title !== "(missing)" ? p.title : pagePath}
                        </div>
                        <div style={{ display:"flex", gap:4, flexShrink:0 }}>
                          {critCount > 0 && <span style={{ fontSize:10, padding:"2px 6px", borderRadius:6, background:"#DC262618", color:"#DC2626", fontWeight:700 }}>P1 ×{critCount}</span>}
                          {warnCount > 0 && <span style={{ fontSize:10, padding:"2px 6px", borderRadius:6, background:"#D9770618", color:"#D97706", fontWeight:700 }}>P2 ×{warnCount}</span>}
                        </div>
                      </div>
                      <div style={{ fontSize:10, color:txt2, marginBottom:6 }}>{pagePath}</div>
                      <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                        {(p.issues||[]).map((iss, j) => {
                          const sc = iss.severity === "critical" ? "#DC2626" : iss.severity === "info" ? "#6B7280" : "#D97706";
                          return (
                            <div key={j} style={{ display:"flex", gap:6, alignItems:"flex-start" }}>
                              <span style={{ fontSize:9, padding:"1px 5px", borderRadius:4, background:`${sc}18`, color:sc, fontWeight:700, flexShrink:0, marginTop:1 }}>
                                {iss.severity === "critical" ? "P1" : iss.severity === "info" ? "P3" : "P2"}
                              </span>
                              <div>
                                <div style={{ fontSize:11, color:txt }}>{iss.detail || iss.label || iss.type?.replace(/_/g," ")}</div>
                                {iss.fix && <div style={{ fontSize:10, color:"#059669" }}>→ {iss.fix}</div>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Speed data per page */}
            {perfTab === "speed" && (
              <div>
                {withTime.length === 0 && (
                  <div style={{ padding:24, textAlign:"center", background:bg2, border:`1px solid ${bdr}`, borderRadius:10, color:txt2, fontSize:12 }}>
                    No response time data yet. Re-run the A2 audit to collect page speed data.
                  </div>
                )}
                {withTime.length > 0 && (
                  <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, overflow:"hidden" }}>
                    <div style={{ display:"grid", gridTemplateColumns:"2fr 100px 100px 80px", padding:"8px 14px", background:bg3, borderBottom:`1px solid ${bdr}`, fontSize:10, fontWeight:700, color:txt2, textTransform:"uppercase" }}>
                      <span>PAGE</span><span style={{ textAlign:"center" }}>RESPONSE</span><span style={{ textAlign:"center" }}>WORDS</span><span style={{ textAlign:"center" }}>ISSUES</span>
                    </div>
                    {withTime.map((p, i) => {
                      const rc = p.responseTime < 800 ? "#059669" : p.responseTime < 2000 ? "#D97706" : "#DC2626";
                      let pagePath = p.url;
                      try { pagePath = new URL(p.url).pathname; } catch {}
                      return (
                        <div key={i} style={{ display:"grid", gridTemplateColumns:"2fr 100px 100px 80px", padding:"9px 14px", borderBottom:`1px solid ${bdr}`, alignItems:"center", background: i%2===0?bg2:bg3 }}>
                          <div style={{ overflow:"hidden" }}>
                            <div style={{ fontSize:11, color:txt, fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.title && p.title !== "(missing)" ? p.title : pagePath}</div>
                            <div style={{ fontSize:9, color:txt2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{pagePath}</div>
                          </div>
                          <div style={{ textAlign:"center", fontSize:12, fontWeight:700, color:rc }}>{p.responseTime}ms</div>
                          <div style={{ textAlign:"center", fontSize:11, color: p.wordCount < 300 ? "#D97706" : txt2 }}>{p.wordCount || "—"}</div>
                          <div style={{ textAlign:"center", fontSize:11, fontWeight:700, color: (p.issues||[]).length > 0 ? "#D97706" : "#059669" }}>
                            {(p.issues||[]).length > 0 ? (p.issues||[]).length : "✅"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div style={{ marginTop:8, fontSize:11, color:txt2 }}>
                  💡 Response times are server-side — measured during the A2 audit crawl. For full CWV (LCP, INP, CLS), add a Google API key and re-run.
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

function FullGeoView({ geo, bg2, bg3, bdr, txt, txt2 }) {
  const prioColor = { high:"#DC2626", medium:"#D97706", low:"#059669" };
  const rd = geo.realData || {};
  return (
    <div>
      {/* ── Live Google Data ─────────────────────────── */}
      {(geo.hasKG || geo.hasRealGBPData || geo.hasAnalytics) && (
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#443DCB", textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>
            Live Google Data
          </div>

          {/* Knowledge Graph Card */}
          {geo.hasKG && rd.knowledgeGraph && (
            <div style={{ background:bg2, border:"1px solid #443DCB33", borderRadius:10, padding:14, marginBottom:10, borderLeft:"3px solid #443DCB" }}>
              <div style={{ fontSize:11, fontWeight:700, color:"#443DCB", marginBottom:6 }}>Knowledge Graph Match</div>
              <div style={{ fontSize:13, fontWeight:700, color:txt, marginBottom:2 }}>{rd.knowledgeGraph.name}</div>
              {rd.knowledgeGraph.description && (
                <div style={{ fontSize:11, color:txt2, lineHeight:1.5, marginBottom:6 }}>{rd.knowledgeGraph.description}</div>
              )}
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {(rd.knowledgeGraph.types||[]).map((t,i) => (
                  <span key={i} style={{ fontSize:10, padding:"2px 8px", borderRadius:8, background:"#443DCB15", color:"#443DCB", fontWeight:600 }}>{t}</span>
                ))}
                {rd.knowledgeGraph.score && (
                  <span style={{ fontSize:10, padding:"2px 8px", borderRadius:8, background:"#05966915", color:"#059669", fontWeight:600 }}>Score: {rd.knowledgeGraph.score?.toFixed(1)}</span>
                )}
              </div>
            </div>
          )}

          {/* GBP Performance Card */}
          {geo.hasRealGBPData && rd.gbpPerformance && (
            <div style={{ background:bg2, border:"1px solid #05966933", borderRadius:10, padding:14, marginBottom:10, borderLeft:"3px solid #059669" }}>
              <div style={{ fontSize:11, fontWeight:700, color:"#059669", marginBottom:8 }}>GBP Performance (last {rd.gbpPerformance.period})</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))", gap:8 }}>
                {[
                  { label:"Map Views (Desktop)", val:(rd.gbpPerformance.desktopMapViews||0).toLocaleString(), color:"#443DCB" },
                  { label:"Map Views (Mobile)",  val:(rd.gbpPerformance.mobileMapViews||0).toLocaleString(),  color:"#0891B2" },
                  { label:"Website Clicks",      val:(rd.gbpPerformance.websiteClicks||0).toLocaleString(),   color:"#059669" },
                  { label:"Call Clicks",         val:(rd.gbpPerformance.callClicks||0).toLocaleString(),      color:"#D97706" },
                  { label:"Direction Requests",  val:(rd.gbpPerformance.directionRequests||0).toLocaleString(), color:"#DC2626" },
                ].map(m => (
                  <div key={m.label} style={{ background:bg3, borderRadius:8, padding:"8px 10px", textAlign:"center" }}>
                    <div style={{ fontSize:16, fontWeight:800, color:m.color }}>{m.val}</div>
                    <div style={{ fontSize:10, color:txt2, marginTop:2 }}>{m.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Analytics Card */}
          {geo.hasAnalytics && rd.analytics && (
            <div style={{ background:bg2, border:"1px solid #0891B233", borderRadius:10, padding:14, marginBottom:10, borderLeft:"3px solid #0891B2" }}>
              <div style={{ fontSize:11, fontWeight:700, color:"#0891B2", marginBottom:8 }}>Google Analytics — Organic (last {rd.analytics.period})</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))", gap:8, marginBottom:10 }}>
                {[
                  { label:"Organic Sessions",   val:(rd.analytics.organicSessions||0).toLocaleString(),  color:"#059669" },
                  { label:"Organic Users",       val:(rd.analytics.organicUsers||0).toLocaleString(),     color:"#443DCB" },
                  { label:"Bounce Rate",         val:`${rd.analytics.bounceRate}%`,                       color: parseFloat(rd.analytics.bounceRate) > 60 ? "#DC2626" : "#059669" },
                  { label:"Avg Session (sec)",   val:rd.analytics.avgSessionDuration,                     color:"#0891B2" },
                  { label:"Pages/Session",       val:rd.analytics.pagesPerSession,                        color:"#D97706" },
                ].map(m => (
                  <div key={m.label} style={{ background:bg3, borderRadius:8, padding:"8px 10px", textAlign:"center" }}>
                    <div style={{ fontSize:16, fontWeight:800, color:m.color }}>{m.val}</div>
                    <div style={{ fontSize:10, color:txt2, marginTop:2 }}>{m.label}</div>
                  </div>
                ))}
              </div>
              {(rd.analytics.allChannels||[]).length > 0 && (
                <div>
                  <div style={{ fontSize:10, fontWeight:700, color:txt2, textTransform:"uppercase", marginBottom:6 }}>All Channels</div>
                  {rd.analytics.allChannels.map((ch,i) => (
                    <div key={i} style={{ display:"flex", justifyContent:"space-between", fontSize:11, padding:"3px 0", borderBottom:`1px solid ${bdr}` }}>
                      <span style={{ color:txt }}>{ch.channel}</span>
                      <span style={{ color:txt2 }}>{(ch.sessions||0).toLocaleString()} sessions · {(ch.users||0).toLocaleString()} users</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── AI GEO Analysis ─────────────────────────── */}
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

  const Pill = ({ text, color="#443DCB" }) => (
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
          { l:"Page Briefs",   v:briefs.length,               c:"#443DCB" },
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
                  <Pill text={b.intent} color={b.intent==="transactional"?"#059669":b.intent==="informational"?"#0891B2":"#443DCB"} />
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

  if (!report.reportData) {
    return (
      <div style={{ textAlign:"center", padding:"48px 24px", background:bg2, border:`1px solid ${bdr}`, borderRadius:14 }}>
        <div style={{ fontSize:32, marginBottom:12 }}>📊</div>
        <div style={{ fontSize:14, fontWeight:700, color:txt, marginBottom:6 }}>Report data not available</div>
        <div style={{ fontSize:12, color:txt2 }}>Re-run A9 Monitoring to regenerate the report.</div>
      </div>
    );
  }

  return (
    <div>
      {/* ── A0 SEO Head Executive Summary ─────────────────────────── */}
      {report.seoHeadSummary && (
        <div style={{ background:"#1F386411", border:"1px solid #1F386433", borderLeft:"4px solid #1F3864", borderRadius:10, padding:"14px 18px", marginBottom:14 }}>
          <div style={{ fontSize:12, fontWeight:700, color:"#1F3864", marginBottom:8 }}>🧠 SEO Head Executive Analysis</div>
          <div style={{ fontSize:13, color:txt, lineHeight:1.8 }}>{report.seoHeadSummary}</div>
          {report.seoHeadSummaryAt && (
            <div style={{ fontSize:10, color:txt2, marginTop:8 }}>Generated {new Date(report.seoHeadSummaryAt).toLocaleDateString()}</div>
          )}
        </div>
      )}

      {/* What this report is */}
      <div style={{ background:"#443DCB0d", border:"1px solid #443DCB22", borderRadius:10, padding:"12px 16px", marginBottom:14 }}>
        <div style={{ fontSize:12, fontWeight:700, color:"#443DCB", marginBottom:4 }}>What is this report?</div>
        <div style={{ fontSize:11, color:txt2, lineHeight:1.7 }}>
          This is an AI-generated SEO performance summary based on your technical audit, keyword data, competitor analysis, and GEO signals.
          {!gsc && <span style={{ color:"#D97706" }}> <strong>KPI values are AI estimates</strong> — connect Google Search Console for real clicks, impressions, and position data.</span>}
          {gsc && <span style={{ color:"#059669" }}> Real GSC data is included below.</span>}
        </div>
        {!gsc && (
          <div style={{ marginTop:10, padding:"8px 12px", background:bg2, border:`1px solid ${bdr}`, borderRadius:8, display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:14 }}>📊</span>
            <span style={{ fontSize:11, color:txt2 }}>Connect Google Search Console in Settings → API Keys to get real traffic data in this report</span>
          </div>
        )}
      </div>

      {/* Approval Status Banner */}
      <div style={{ padding:"10px 14px", borderRadius:8, background:"#D9770611", border:"1px solid #D9770633", marginBottom:14, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <div style={{ fontSize:12, fontWeight:700, color:"#D97706", marginBottom:2 }}>⏳ Pending Review — Draft Report</div>
          <div style={{ fontSize:11, color:txt2 }}>Review and add your observations before sending to the client.</div>
        </div>
        {report.approvalId && (
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:10, color:txt2 }}>Approval Ref</div>
            <div style={{ fontSize:11, fontWeight:700, color:txt, fontFamily:"monospace" }}>#{report.approvalId.slice(0,8).toUpperCase()}</div>
          </div>
        )}
      </div>

      {/* GSC Performance Card */}
      {gsc && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:16, marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:12 }}>📈 Google Search Console — {gsc.period}</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:12 }}>
            {[{l:"Clicks",v:gsc.totalClicks,c:"#059669"},{l:"Impressions",v:gsc.totalImpress,c:"#0891B2"},{l:"Avg CTR",v:gsc.avgCTR+"%",c:"#443DCB"},{l:"Avg Position",v:"#"+gsc.avgPos,c:"#D97706"}].map(i=>(
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
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:16, marginBottom:12, borderLeft:"4px solid #443DCB" }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#443DCB", textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>📊 Executive Verdict</div>
          <div style={{ fontSize:14, color:txt, lineHeight:1.6, fontWeight:500 }}>{r.verdict}</div>
        </div>
      )}

      {/* KPI Scorecard */}
      {r.kpiScorecard?.length > 0 && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:16, marginBottom:12 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
            <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1 }}>🎯 KPI Scorecard</div>
            {!gsc && <span style={{ fontSize:9, padding:"2px 8px", borderRadius:8, background:"#D9770618", color:"#D97706", fontWeight:700 }}>AI ESTIMATED — not real GSC data</span>}
            {gsc && <span style={{ fontSize:9, padding:"2px 8px", borderRadius:8, background:"#05966918", color:"#059669", fontWeight:700 }}>REAL GSC DATA</span>}
          </div>
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
                        {row.status==="green"?"✅ On Track":row.status==="amber"?"⚠️ Warning":"❌ At Risk"}
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
            <div key={i} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"12px 14px", marginBottom:8, borderLeft:"3px solid #443DCB" }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                <div style={{ fontSize:13, fontWeight:700, color:txt }}>{i+1}. {a.action}</div>
                <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:"#443DCB22", color:"#6B62E8" }}>Priority {a.priority}</span>
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

// ── Score Breakdown View ─────────────────────────────
function ScoreBreakdownView({ clientId, state, dark, bg2, bg3, bdr, txt, txt2, getToken, API }) {
  const [score,    setScore]    = useState(null);
  const [forecast, setForecast] = useState(null);
  const [tasks,    setTasks]    = useState([]);
  const [history,  setHistory]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [drill,    setDrill]    = useState(null);

  useEffect(() => {
    async function fetchScore() {
      try {
        const token = await getToken();
        const [sRes, fRes, tRes, hRes] = await Promise.all([
          fetch(`${API}/api/agents/${clientId}/score`,         { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API}/api/agents/${clientId}/forecast`,      { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API}/api/agents/${clientId}/tasks`,         { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API}/api/agents/${clientId}/score/history`,  { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        const sData = await sRes.json();
        const fData = await fRes.json();
        const tData = await tRes.json();
        const hData = hRes.ok ? await hRes.json() : {};
        setScore(sData.score);
        setForecast(fData.forecast);
        setTasks((tData.tasks || []).filter(t => t.status === "pending").slice(0, 10));
        setHistory((hData.history || []).slice(-12)); // last 12 data points
      } catch { /* noop */ }
      setLoading(false);
    }
    fetchScore();
  }, [clientId]);

  if (loading) return <div style={{ padding:40, textAlign:"center", color:txt2, fontSize:13 }}>Loading score...</div>;

  const scoreData = score || { overall: 0, breakdown: {} };
  const { overall, breakdown } = scoreData;
  const dims = breakdown ? Object.values(breakdown) : [];

  const scoreColor = overall >= 75 ? "#059669" : overall >= 50 ? "#D97706" : "#DC2626";
  const scoreLabel = overall >= 75 ? "Good" : overall >= 50 ? "Needs Work" : "Critical";

  return (
    <div style={{ padding: 24 }}>
      {/* Overall Score */}
      <div style={{ display: "flex", alignItems: "center", gap: 24, background: bg2, border: `1px solid ${bdr}`, borderRadius: 16, padding: 24, marginBottom: 20 }}>
        <div style={{ flexShrink: 0, width: 100, height: 100, borderRadius: "50%", border: `6px solid ${scoreColor}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: `${scoreColor}10` }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: scoreColor }}>{overall}</div>
          <div style={{ fontSize: 10, color: scoreColor, fontWeight: 600 }}>/100</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: txt, marginBottom: 4 }}>
            Overall SEO Score — <span style={{ color: scoreColor }}>{scoreLabel}</span>
          </div>
          <div style={{ fontSize: 13, color: txt2, marginBottom: 12 }}>
            Technical (30%) · Content (40%) · Authority (20%) · GEO (10%)
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {dims.map(d => (
              <div key={d.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: d.color }} />
                <span style={{ fontSize: 11, color: txt2 }}>{d.label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: d.color }}>{d.score}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Score History Trend Chart */}
      {history.length >= 2 && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:14, padding:20, marginBottom:20 }}>
          <div style={{ fontSize:13, fontWeight:700, color:txt, marginBottom:14 }}>📈 Score History — Last {history.length} Runs</div>
          {(() => {
            const max = Math.max(...history.map(h => h.overall || 0), 100);
            const min = Math.max(0, Math.min(...history.map(h => h.overall || 0)) - 10);
            const H = 80, W = 100;
            const pts = history.map((h, i) => {
              const x = (i / (history.length - 1)) * W;
              const y = H - ((( h.overall || 0) - min) / (max - min)) * H;
              return [x, y];
            });
            const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
            const first = history[0]?.overall || 0;
            const last  = history[history.length - 1]?.overall || 0;
            const delta = last - first;
            const deltaColor = delta >= 0 ? "#059669" : "#DC2626";
            return (
              <div style={{ display:"flex", alignItems:"flex-start", gap:24 }}>
                <div style={{ flex:1 }}>
                  <svg viewBox={`0 0 ${W} ${H + 10}`} style={{ width:"100%", height:100, overflow:"visible" }}>
                    {/* Grid lines */}
                    {[0, 0.25, 0.5, 0.75, 1].map(t => {
                      const y = H - t * H;
                      const v = Math.round(min + t * (max - min));
                      return (
                        <g key={t}>
                          <line x1="0" y1={y} x2={W} y2={y} stroke={dark?"#222":"#eee"} strokeWidth="0.5" />
                          <text x="-1" y={y + 1} fontSize="4" fill={dark?"#444":"#bbb"} textAnchor="end">{v}</text>
                        </g>
                      );
                    })}
                    {/* Area fill */}
                    <path d={`${pathD} L${W},${H} L0,${H} Z`} fill={`${last >= 50 ? "#05966918" : "#DC262618"}`} />
                    {/* Line */}
                    <path d={pathD} fill="none" stroke={last >= 75 ? "#059669" : last >= 50 ? "#D97706" : "#DC2626"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    {/* Data points */}
                    {pts.map((p, i) => (
                      <circle key={i} cx={p[0]} cy={p[1]} r="2" fill={last >= 75 ? "#059669" : last >= 50 ? "#D97706" : "#DC2626"} />
                    ))}
                    {/* Date labels on X axis */}
                    {history.map((h, i) => {
                      if (i % Math.max(1, Math.floor(history.length / 4)) !== 0 && i !== history.length - 1) return null;
                      const x = (i / (history.length - 1)) * W;
                      const label = h.date ? h.date.slice(5) : `#${i+1}`;
                      return <text key={i} x={x} y={H + 9} fontSize="3.5" fill={dark?"#444":"#bbb"} textAnchor="middle">{label}</text>;
                    })}
                  </svg>
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:10, minWidth:100 }}>
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontSize:22, fontWeight:800, color:scoreColor }}>{last}</div>
                    <div style={{ fontSize:10, color:txt2 }}>Current Score</div>
                  </div>
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontSize:16, fontWeight:700, color:deltaColor }}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}</div>
                    <div style={{ fontSize:10, color:txt2 }}>vs first run</div>
                  </div>
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontSize:14, fontWeight:700, color:txt }}>{history.length}</div>
                    <div style={{ fontSize:10, color:txt2 }}>pipeline runs</div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* 4 Dimension Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginBottom: 20 }}>
        {dims.map(d => {
          const isOpen = drill === d.label;
          return (
            <div key={d.label} onClick={() => setDrill(isOpen ? null : d.label)}
              style={{ background: bg2, border: `1px solid ${isOpen ? d.color : bdr}`, borderRadius: 14, padding: 18, cursor: "pointer" }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: txt }}>{d.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: d.color }}>{d.score}</div>
              </div>
              <div style={{ fontSize: 10, color: txt2, marginBottom: 8 }}>Weight: {Math.round(d.weight * 100)}%</div>
              <div style={{ height: 8, borderRadius: 4, background: bg3, overflow: "hidden", marginBottom: isOpen ? 16 : 0 }}>
                <div style={{ height: "100%", width: `${d.score}%`, background: d.color, borderRadius: 4, transition: "width 0.8s" }} />
              </div>
              {isOpen && d.factors?.length > 0 && (
                <div style={{ borderTop: `1px solid ${bdr}`, paddingTop: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: d.color, textTransform: "uppercase", marginBottom: 10 }}>Factor Breakdown</div>
                  {d.factors.map(f => {
                    const fc = f.score >= 75 ? "#059669" : f.score >= 50 ? "#D97706" : "#DC2626";
                    return (
                      <div key={f.name} style={{ marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                          <span style={{ fontSize: 11, color: txt }}>{f.name}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: fc }}>{f.score}</span>
                        </div>
                        <div style={{ height: 4, borderRadius: 2, background: bg3 }}>
                          <div style={{ height: "100%", width: `${f.score}%`, background: fc, borderRadius: 2 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={{ fontSize: 10, color: txt2, marginTop: 8 }}>{isOpen ? "▲ collapse" : "▼ factor breakdown"}</div>
            </div>
          );
        })}
      </div>

      {/* Fix Impact Board — THE most important section */}
      {tasks.length > 0 && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:14, padding:20, marginBottom:16 }}>
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:15, fontWeight:700, color:txt }}>🔧 Fix Impact Board</div>
            <div style={{ fontSize:12, color:txt2, marginTop:2 }}>
              Current score: <strong style={{ color:scoreColor }}>{overall}</strong> → Fix these issues to reach <strong style={{ color:"#059669" }}>{Math.min(overall + tasks.reduce((s,t) => s+(t.expectedScoreGain||3),0), 100)}</strong>
            </div>
          </div>

          {/* Score progress bar */}
          <div style={{ position:"relative", height:12, borderRadius:6, background:bg3, marginBottom:20, overflow:"hidden" }}>
            <div style={{ position:"absolute", left:0, top:0, height:"100%", width:`${overall}%`, background:scoreColor, borderRadius:6 }} />
            <div style={{ position:"absolute", left:`${overall}%`, top:0, height:"100%", width:`${Math.min(tasks.reduce((s,t)=>s+(t.expectedScoreGain||3),0), 100-overall)}%`, background:"#05966966", borderRadius:"0 6px 6px 0" }} />
            <div style={{ position:"absolute", left:`${overall}%`, top:"-2px", fontSize:10, color:"#059669", fontWeight:700, transform:"translateX(-50%)", whiteSpace:"nowrap" }}>
              {overall} now
            </div>
          </div>

          {/* Per-issue fix rows */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {tasks.map((t, i) => {
              const impC = {High:"#DC2626",Medium:"#D97706",Low:"#6B7280"}[t.impact]||"#6B7280";
              const effC = {easy:"#059669",medium:"#D97706",hard:"#DC2626"}[t.effort]||"#D97706";
              const scoreAfter = Math.min(overall + (t.expectedScoreGain||3), 100);
              return (
                <div key={t.id} style={{ background:bg3, borderRadius:10, padding:"12px 14px", borderLeft:`3px solid ${impC}` }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
                    <span style={{ fontSize:9, color:txt2, fontWeight:600 }}>#{i+1}</span>
                    <div style={{ display:"flex", gap:4 }}>
                      <span style={{ fontSize:9, padding:"1px 6px", borderRadius:6, background:`${impC}18`, color:impC, fontWeight:700 }}>{t.impact}</span>
                      <span style={{ fontSize:9, padding:"1px 6px", borderRadius:6, background:`${effC}18`, color:effC, fontWeight:700 }}>{t.effort}</span>
                    </div>
                  </div>
                  <div style={{ fontSize:12, fontWeight:600, color:txt, marginBottom:8, lineHeight:1.3 }}>{t.title}</div>
                  {/* Score gain visualization */}
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                    <span style={{ fontSize:18, fontWeight:800, color:scoreColor }}>{overall}</span>
                    <span style={{ fontSize:12, color:txt2 }}>→</span>
                    <span style={{ fontSize:18, fontWeight:800, color:"#059669" }}>{scoreAfter}</span>
                    <span style={{ fontSize:11, color:"#059669", fontWeight:600, background:"#05966911", padding:"2px 8px", borderRadius:6 }}>+{t.expectedScoreGain||3} pts</span>
                  </div>
                  <div style={{ fontSize:10, color:"#443DCB", fontWeight:600 }}>{t.expectedRankGain || "1-3 positions"} in Google</div>
                  {t.fixSuggestion && <div style={{ fontSize:10, color:txt2, marginTop:4, lineHeight:1.4 }}>{t.fixSuggestion}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Growth Forecast */}
      {forecast && (
        <div style={{ background: bg2, border: `1px solid #05966933`, borderRadius: 14, padding: 20, borderLeft: "4px solid #059669" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: txt, marginBottom: 12 }}>
            📈 Growth Forecast — fix top {forecast.tasksConsidered} issues
          </div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 14 }}>
            {[
              { val: forecast.trafficGrowth, label: "Traffic growth",    color: "#059669" },
              { val: forecast.scoreGain,     label: "Score improvement", color: "#443DCB" },
              { val: forecast.timeframe,     label: "Timeframe",          color: "#D97706" },
              { val: forecast.confidence,    label: "Confidence",
                color: forecast.confidence==="High"?"#059669":forecast.confidence==="Medium"?"#D97706":"#DC2626" },
            ].map(s => (
              <div key={s.label} style={{ textAlign: "center", minWidth: 80 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.val}</div>
                <div style={{ fontSize: 10, color: txt2 }}>{s.label}</div>
              </div>
            ))}
          </div>
          {forecast.breakdown?.map((t, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px solid ${bdr}` }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#443DCB", minWidth: 18 }}>#{i+1}</span>
              <span style={{ fontSize: 12, color: txt, flex: 1 }}>{t.task}</span>
              <span style={{ fontSize: 10, color: "#059669", background: "#05966911", padding: "2px 8px", borderRadius: 8 }}>{t.gain}</span>
            </div>
          ))}
        </div>
      )}

      {tasks.length === 0 && !forecast && (
        <div style={{ textAlign:"center", padding:40, color:txt2, background:bg2, border:`1px solid ${bdr}`, borderRadius:14 }}>
          <div style={{ fontSize:32, marginBottom:12 }}>⚙️</div>
          <div style={{ fontSize:14, fontWeight:600, color:txt, marginBottom:6 }}>Run the full pipeline to see your Fix Impact Board</div>
          <div style={{ fontSize:12 }}>After analysis, we'll show exactly which fixes will increase your score and by how much</div>
        </div>
      )}
    </div>
  );
}

// ── Task Queue View ──────────────────────────────────
function TaskQueueView({ clientId, dark, bg2, bg3, bdr, txt, txt2, getToken, API }) {
  const [tasks,      setTasks]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [filter,     setFilter]     = useState("all");
  const [updating,   setUpdating]   = useState(null);
  const [expanded,   setExpanded]   = useState(null);
  const [toast,      setToast]      = useState("");
  const [bulkBusy,   setBulkBusy]   = useState(null);
  const [copied,     setCopied]     = useState(null);   // taskId being copied
  const [generating, setGenerating] = useState(null);   // taskId being AI-generated
  const [aiFixes,    setAiFixes]    = useState({});     // taskId → { fix, codeSnippet, implementation }

  const AGENT_COLOR = {
    OnPageAgent:   { color:"#443DCB", bg:"#443DCB15", label:"On-Page"   },
    TechnicalAgent:{ color:"#0891B2", bg:"#0891B215", label:"Technical" },
    ContentAgent:  { color:"#D97706", bg:"#D9770615", label:"Content"   },
    LinkingAgent:  { color:"#059669", bg:"#05966915", label:"Linking"   },
    LocalAgent:    { color:"#7C3AED", bg:"#7C3AED15", label:"Local"     },
  };

  async function fetchTasks() {
    try {
      const token = await getToken();
      const res  = await fetch(`${API}/api/agents/${clientId}/tasks`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch { /* noop */ }
    setLoading(false);
  }

  useEffect(() => { fetchTasks(); }, [clientId]);

  async function markComplete(taskId) {
    setUpdating(taskId);
    try {
      const token = await getToken();
      await fetch(`${API}/api/agents/${clientId}/tasks/${taskId}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body:   JSON.stringify({ status: "complete", completedBy: "user" }),
      });
      setTasks(t => t.map(x => x.id === taskId ? { ...x, status: "complete" } : x));
      setToast("Task marked complete");
      setTimeout(() => setToast(""), 3000);
    } catch { /* noop */ }
    setUpdating(null);
  }

  async function bulkAction(action) {
    setBulkBusy(action);
    try {
      const token = await getToken();
      const res   = await fetch(`${API}/api/agents/${clientId}/tasks/bulk`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      setToast(data.message || data.error || "Done");
      setTimeout(() => setToast(""), 4000);
      if (action !== "generate-fixes") { setLoading(true); fetchTasks(); }
    } catch { setToast("Action failed"); setTimeout(() => setToast(""), 3000); }
    setBulkBusy(null);
  }

  async function generateAIFix(task) {
    setGenerating(task.id);
    try {
      const token = await getToken();
      const res   = await fetch(`${API}/api/agents/${clientId}/generate-fix`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ type: task.issueType, detail: task.title, current: task.fixSuggestion }),
      });
      const data = await res.json();
      if (data.fix) setAiFixes(f => ({ ...f, [task.id]: data }));
      else setToast(data.error || "AI fix generation failed");
    } catch { setToast("AI fix generation failed"); }
    setTimeout(() => setToast(""), 4000);
    setGenerating(null);
  }

  const filtered  = tasks.filter(t => filter==="all" ? true : filter==="pending" ? t.status==="pending" : t.status==="complete");
  const pending   = tasks.filter(t => t.status==="pending").length;
  const completed = tasks.filter(t => t.status==="complete").length;
  const autoFix   = tasks.filter(t => t.status==="pending" && t.autoFixable).length;

  if (loading) return <div style={{ padding:40, textAlign:"center", color:txt2, fontSize:13 }}>Loading tasks...</div>;

  return (
    <div style={{ padding: 24 }}>
      {toast && (
        <div style={{ position:"fixed", bottom:24, right:24, background:"#059669", color:"#fff", padding:"10px 18px", borderRadius:10, fontSize:13, fontWeight:600, zIndex:9999 }}>
          {toast}
        </div>
      )}

      {/* Bulk Actions Bar */}
      <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:"12px 16px", marginBottom:16, display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
        <span style={{ fontSize:12, fontWeight:700, color:txt, flex:1 }}>Bulk Actions</span>
        <button onClick={() => bulkAction("generate-fixes")} disabled={!!bulkBusy || autoFix===0}
          style={{ padding:"6px 14px", borderRadius:8, background:"#443DCB", color:"#fff", border:"none", fontSize:11, fontWeight:700, cursor: (bulkBusy || autoFix===0) ?"not-allowed":"pointer", opacity:(bulkBusy||autoFix===0)?0.6:1 }}>
          {bulkBusy==="generate-fixes" ? "Generating..." : `⚡ AI Fix All (${autoFix} auto-fixable)`}
        </button>
        <button onClick={() => bulkAction("complete-all")} disabled={!!bulkBusy || pending===0}
          style={{ padding:"6px 14px", borderRadius:8, background:"#059669", color:"#fff", border:"none", fontSize:11, fontWeight:700, cursor:(bulkBusy||pending===0)?"not-allowed":"pointer", opacity:(bulkBusy||pending===0)?0.6:1 }}>
          {bulkBusy==="complete-all" ? "Marking..." : `✅ Mark All Done (${pending})`}
        </button>
        <button onClick={() => bulkAction("clear-completed")} disabled={!!bulkBusy || completed===0}
          style={{ padding:"6px 14px", borderRadius:8, background:"transparent", border:`1px solid ${bdr}`, color:txt2, fontSize:11, fontWeight:600, cursor:(bulkBusy||completed===0)?"not-allowed":"pointer", opacity:(bulkBusy||completed===0)?0.6:1 }}>
          {bulkBusy==="clear-completed" ? "Clearing..." : `🗑 Clear Done (${completed})`}
        </button>
      </div>

      {/* Stats + filter */}
      <div style={{ display:"flex", gap:12, marginBottom:20, flexWrap:"wrap", alignItems:"center" }}>
        {[{label:"Total",val:tasks.length,color:"#443DCB"},{label:"Pending",val:pending,color:"#DC2626"},{label:"Auto-Fixable",val:autoFix,color:"#D97706"},{label:"Done",val:completed,color:"#059669"}].map(s => (
          <div key={s.label} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:"12px 20px", textAlign:"center", minWidth:90 }}>
            <div style={{ fontSize:22, fontWeight:800, color:s.color }}>{s.val}</div>
            <div style={{ fontSize:11, color:txt2 }}>{s.label}</div>
          </div>
        ))}
        <div style={{ display:"flex", gap:6, marginLeft:"auto" }}>
          {["all","pending","complete"].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding:"7px 14px", borderRadius:8, fontSize:11, fontWeight:600, cursor:"pointer",
              background: filter===f ? "#443DCB" : "transparent",
              color:      filter===f ? "#fff"    : txt2,
              border:     `1px solid ${filter===f ? "#443DCB" : bdr}`,
            }}>
              {f.charAt(0).toUpperCase()+f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {filtered.length===0 && (
        <div style={{ textAlign:"center", padding:60, color:txt2, fontSize:13 }}>
          {filter==="complete" ? "No completed tasks yet" : "No tasks — run the pipeline to generate tasks"}
        </div>
      )}

      {filtered.map((task, i) => {
        const ac        = AGENT_COLOR[task.assignedAgent] || { color:"#6B7280", bg:"#6B728015", label:task.assignedAgent };
        const impColor  = {High:"#DC2626",Medium:"#D97706",Low:"#6B7280"}[task.impact] || "#6B7280";
        const effColor  = {easy:"#059669",medium:"#D97706",hard:"#DC2626"}[task.effort] || "#D97706";
        const isOpen    = expanded===task.id;
        const isDone    = task.status==="complete";

        return (
          <div key={task.id} style={{
            background:bg2, border:`1px solid ${bdr}`, borderLeft:`4px solid ${isDone?"#059669":impColor}`,
            borderRadius:12, marginBottom:10, overflow:"hidden", opacity:isDone?0.7:1,
          }}>
            <div onClick={()=>setExpanded(isOpen?null:task.id)}
              style={{ padding:"14px 16px", cursor:"pointer", display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12 }}
            >
              <div style={{ flex:1 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap", marginBottom:7 }}>
                  <span style={{ fontSize:9, padding:"2px 8px", borderRadius:8, background:ac.bg, color:ac.color, fontWeight:700 }}>{ac.label}</span>
                  <span style={{ fontSize:9, padding:"2px 8px", borderRadius:8, background:`${impColor}18`, color:impColor, fontWeight:700 }}>{task.impact} Impact</span>
                  <span style={{ fontSize:9, padding:"2px 8px", borderRadius:8, background:`${effColor}18`, color:effColor, fontWeight:700 }}>{task.effort} effort</span>
                  {isDone && <span style={{ fontSize:9, padding:"2px 8px", borderRadius:8, background:"#05966918", color:"#059669", fontWeight:700 }}>✅ Done</span>}
                  <span style={{ fontSize:9, color:txt2, marginLeft:"auto" }}>#{i+1} · Score {task.priorityScore}</span>
                </div>
                <div style={{ fontSize:13, fontWeight:600, color:isDone?txt2:txt, textDecoration:isDone?"line-through":"none", lineHeight:1.4 }}>
                  {task.title}
                </div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
                <span style={{ fontSize:10, color:txt2 }}>{isOpen?"▲":"▼"}</span>
                {!isDone && (
                  <button onClick={e=>{e.stopPropagation();markComplete(task.id);}} disabled={updating===task.id}
                    style={{ padding:"6px 12px", borderRadius:8, border:"none", background:"#059669", color:"#fff", fontSize:11, fontWeight:700, cursor:"pointer", opacity:updating===task.id?0.5:1 }}>
                    {updating===task.id?"...":"✅ Done"}
                  </button>
                )}
              </div>
            </div>

            {isOpen && (
              <div style={{ padding:"0 16px 16px", borderTop:`1px solid ${bdr}` }}>
                {/* Impact + Fix info */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginTop:14 }}>
                  <div style={{ background:bg3, borderRadius:10, padding:"12px 14px" }}>
                    <div style={{ fontSize:10, fontWeight:700, color:"#443DCB", textTransform:"uppercase", marginBottom:8 }}>📈 Expected Impact</div>
                    <div style={{ display:"flex", gap:12 }}>
                      <div><div style={{ fontSize:16, fontWeight:800, color:"#059669" }}>+{task.expectedScoreGain||3}</div><div style={{ fontSize:10, color:txt2 }}>score pts</div></div>
                      <div><div style={{ fontSize:12, fontWeight:700, color:"#443DCB" }}>{task.expectedRankGain||"1-3 pos"}</div><div style={{ fontSize:10, color:txt2 }}>rank gain</div></div>
                    </div>
                  </div>
                  <div style={{ background:bg3, borderRadius:10, padding:"12px 14px" }}>
                    <div style={{ fontSize:10, fontWeight:700, color:"#059669", textTransform:"uppercase", marginBottom:8 }}>🔧 How to Fix</div>
                    <div style={{ fontSize:12, color:txt, lineHeight:1.5 }}>{task.fixSuggestion||"See action plan for details"}</div>
                  </div>
                </div>

                {/* AI-generated fix result */}
                {aiFixes[task.id] && (
                  <div style={{ marginTop:12, padding:"12px 14px", background:"#443DCB0d", border:"1px solid #443DCB30", borderRadius:10 }}>
                    <div style={{ fontSize:10, fontWeight:700, color:"#443DCB", textTransform:"uppercase", marginBottom:8 }}>🤖 AI-Generated Fix</div>
                    <div style={{ fontSize:13, color:txt, marginBottom:8, lineHeight:1.6 }}>{aiFixes[task.id].fix}</div>
                    {aiFixes[task.id].implementation && (
                      <div style={{ fontSize:12, color:txt2, marginBottom:8, lineHeight:1.6 }}>{aiFixes[task.id].implementation}</div>
                    )}
                    {aiFixes[task.id].codeSnippet && (
                      <pre style={{ fontSize:11, color:"#059669", background:bg3, borderRadius:8, padding:"10px 12px", overflow:"auto", whiteSpace:"pre-wrap", margin:0 }}>
                        {aiFixes[task.id].codeSnippet}
                      </pre>
                    )}
                    <button
                      onClick={() => {
                        const text = [aiFixes[task.id].fix, aiFixes[task.id].codeSnippet].filter(Boolean).join("\n\n");
                        navigator.clipboard?.writeText(text);
                        setCopied(task.id + "_ai");
                        setTimeout(() => setCopied(null), 2000);
                      }}
                      style={{ marginTop:10, padding:"6px 14px", borderRadius:8, border:"none", background:"#059669", color:"#fff", fontSize:11, fontWeight:700, cursor:"pointer" }}>
                      {copied === task.id + "_ai" ? "✅ Copied!" : "📋 Copy AI Fix"}
                    </button>
                  </div>
                )}

                {/* Action buttons */}
                <div style={{ display:"flex", gap:8, marginTop:12, flexWrap:"wrap" }}>
                  {/* Step 2 — Fix Now: copy the fix suggestion */}
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(task.fixSuggestion || task.title || "");
                      setCopied(task.id);
                      setTimeout(() => setCopied(null), 2000);
                    }}
                    style={{ padding:"8px 16px", borderRadius:8, border:"none", background:"#059669", color:"#fff", fontSize:11, fontWeight:700, cursor:"pointer" }}>
                    {copied === task.id ? "✅ Copied!" : "📋 Fix Now"}
                  </button>

                  {/* Step 3 — AI Fix: generate exact code via LLM */}
                  <button
                    onClick={() => generateAIFix(task)}
                    disabled={generating === task.id}
                    style={{ padding:"8px 16px", borderRadius:8, border:"1px solid #443DCB", background:"transparent", color:"#443DCB", fontSize:11, fontWeight:700, cursor:generating===task.id?"not-allowed":"pointer", opacity:generating===task.id?0.6:1 }}>
                    {generating === task.id ? "⏳ Generating..." : aiFixes[task.id] ? "🔄 Regenerate AI Fix" : "🤖 AI Fix"}
                  </button>

                  {/* Step 4 — Mark as Done */}
                  {!isDone && (
                    <button
                      onClick={e => { e.stopPropagation(); markComplete(task.id); }}
                      disabled={updating === task.id}
                      style={{ padding:"8px 16px", borderRadius:8, border:"1px solid #05966440", background:"transparent", color:"#059669", fontSize:11, fontWeight:700, cursor:updating===task.id?"not-allowed":"pointer", opacity:updating===task.id?0.5:1 }}>
                      {updating === task.id ? "..." : "✅ Mark Done"}
                    </button>
                  )}
                </div>

                {task.autoFixable && !aiFixes[task.id] && (
                  <div style={{ marginTop:10, padding:"7px 12px", background:"#443DCB0d", borderRadius:8, fontSize:11, color:"#443DCB", fontWeight:600 }}>
                    ⚡ Auto-fixable — click "🤖 AI Fix" to generate the exact code to paste into your CMS
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Pages View (Per-page SEO audit) ─────────────────
function PagesView({ clientId, dark, bg2, bg3, bdr, txt, txt2, getToken, API, onTabSwitch }) {
  const [pages,    setPages]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState("all"); // all | critical | good
  const [expanded, setExpanded] = useState(null);  // url of expanded row

  useEffect(() => {
    async function fetchPages() {
      try {
        const token = await getToken();
        const res   = await fetch(`${API}/api/agents/${clientId}/pages`, { headers: { Authorization: `Bearer ${token}` } });
        const data  = await res.json();
        setPages(data.pages || []);
      } catch { /* noop */ }
      setLoading(false);
    }
    fetchPages();
  }, [clientId]);

  if (loading) return <div style={{ padding:40, textAlign:"center", color:txt2, fontSize:13 }}>Loading pages...</div>;

  if (pages.length === 0) return (
    <div style={{ padding:40, textAlign:"center", color:txt2 }}>
      <div style={{ fontSize:32, marginBottom:10 }}>📄</div>
      <div style={{ fontSize:14, fontWeight:600, color:txt }}>No page data available</div>
      <div style={{ fontSize:12, marginTop:6 }}>Run the full pipeline (A2 Technical Audit) to see per-page SEO scores.</div>
    </div>
  );

  const filtered = filter === "critical" ? pages.filter(p => p.score < 50)
    : filter === "good" ? pages.filter(p => p.score >= 75)
    : pages;

  const avgScore = Math.round(pages.reduce((s, p) => s + p.score, 0) / pages.length);
  const critical = pages.filter(p => p.score < 50).length;
  const good     = pages.filter(p => p.score >= 75).length;

  return (
    <div style={{ padding:24 }}>
      {/* Summary bar */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20 }}>
        {[
          { label:"Pages Analysed", val:pages.length,  color:"#443DCB" },
          { label:"Avg Page Score",  val:`${avgScore}/100`, color: avgScore>=75?"#059669":avgScore>=50?"#D97706":"#DC2626" },
          { label:"Critical Pages",  val:critical,      color:"#DC2626" },
          { label:"Healthy Pages",   val:good,          color:"#059669" },
        ].map(s => (
          <div key={s.label} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:"14px 16px", textAlign:"center" }}>
            <div style={{ fontSize:22, fontWeight:800, color:s.color }}>{s.val}</div>
            <div style={{ fontSize:11, color:txt2, marginTop:3 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display:"flex", gap:8, marginBottom:16 }}>
        {[{id:"all",label:"All Pages"},{id:"critical",label:"Critical (<50)"},{id:"good",label:"Healthy (75+)"}].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{ padding:"6px 14px", borderRadius:8, border:`1px solid ${filter===f.id?"#443DCB":bdr}`, background:filter===f.id?"#443DCB":"transparent", color:filter===f.id?"#fff":txt2, fontSize:12, fontWeight:600, cursor:"pointer" }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Pages table */}
      <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:14, overflow:"hidden" }}>
        <div style={{ display:"grid", gridTemplateColumns:"2fr 80px 80px 100px 1fr", gap:0, padding:"10px 16px", borderBottom:`1px solid ${bdr}`, fontSize:11, fontWeight:700, color:txt2 }}>
          <span>Page</span>
          <span style={{ textAlign:"center" }}>Score</span>
          <span style={{ textAlign:"center" }}>Issues</span>
          <span style={{ textAlign:"center" }}>Status</span>
          <span>Top Keywords</span>
        </div>

        {filtered.length === 0 && (
          <div style={{ padding:24, textAlign:"center", color:txt2, fontSize:12 }}>No pages match this filter.</div>
        )}

        {filtered.map((page, i) => {
          const sc = page.score >= 75 ? "#059669" : page.score >= 50 ? "#D97706" : "#DC2626";
          const statusLabel = page.score >= 75 ? "Healthy" : page.score >= 50 ? "Needs Work" : "Critical";
          const isOpen = expanded === page.url;
          const hasIssues = page.issues?.length > 0;
          return (
            <div key={i} style={{ borderBottom:`1px solid ${bdr}` }}>
              {/* Main row */}
              <div
                onClick={() => setExpanded(isOpen ? null : page.url)}
                style={{ display:"grid", gridTemplateColumns:"2fr 80px 80px 100px 1fr", gap:0, padding:"12px 16px", alignItems:"center", cursor:"pointer", background: isOpen ? `${sc}08` : "transparent" }}
              >
                {/* Page URL + title */}
                <div>
                  <div style={{ fontSize:12, fontWeight:600, color:txt, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    <span style={{ marginRight:6, fontSize:10, color:sc }}>{isOpen ? "▼" : "▶"}</span>
                    {page.title || page.path}
                    {page.isHomepage && <span style={{ marginLeft:6, fontSize:9, padding:"1px 5px", borderRadius:4, background:"#443DCB22", color:"#443DCB", fontWeight:700 }}>Homepage</span>}
                  </div>
                  <div style={{ fontSize:10, color:txt2, marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{page.path}</div>
                  <div style={{ display:"flex", gap:4, marginTop:4, flexWrap:"wrap" }}>
                    {!page.hasTitle && <span style={{ fontSize:9, padding:"1px 5px", borderRadius:4, background:"#FEF2F2", color:"#DC2626", fontWeight:600 }}>No Title</span>}
                    {!page.hasMeta  && <span style={{ fontSize:9, padding:"1px 5px", borderRadius:4, background:"#FFF7ED", color:"#D97706", fontWeight:600 }}>No Meta</span>}
                    {!page.hasH1   && <span style={{ fontSize:9, padding:"1px 5px", borderRadius:4, background:"#FFF7ED", color:"#D97706", fontWeight:600 }}>No H1</span>}
                    {page.wordCount > 0 && page.wordCount < 300 && <span style={{ fontSize:9, padding:"1px 5px", borderRadius:4, background:"#EEF2FF", color:"#443DCB", fontWeight:600 }}>Thin ({page.wordCount}w)</span>}
                  </div>
                </div>

                {/* Score ring */}
                <div style={{ textAlign:"center" }}>
                  <div style={{ display:"inline-flex", width:42, height:42, borderRadius:"50%", border:`3px solid ${sc}`, alignItems:"center", justifyContent:"center", flexDirection:"column", background:`${sc}12` }}>
                    <span style={{ fontSize:12, fontWeight:800, color:sc }}>{page.score}</span>
                  </div>
                </div>

                {/* Issue count */}
                <div style={{ textAlign:"center", fontSize:13, fontWeight:700, color:page.issueCount>0?"#D97706":txt2 }}>
                  {page.issueCount}
                </div>

                {/* Status badge */}
                <div style={{ textAlign:"center" }}>
                  <span style={{ fontSize:10, padding:"3px 8px", borderRadius:8, background:`${sc}18`, color:sc, fontWeight:700 }}>{statusLabel}</span>
                </div>

                {/* Keywords */}
                <div style={{ fontSize:11, color:txt2 }}>
                  {page.targetKeywords?.length > 0
                    ? page.targetKeywords.slice(0,3).map(k => k.keyword || k).join(", ")
                    : <span style={{ color:txt2, fontStyle:"italic" }}>No keywords mapped</span>}
                </div>
              </div>

              {/* Expanded detail panel */}
              {isOpen && (
                <div style={{ padding:"0 16px 14px 16px", background:`${sc}06`, borderTop:`1px solid ${sc}20` }}>

                  {/* Page signals row */}
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap", padding:"10px 0 8px" }}>
                    {page.title && <div style={{ fontSize:11, background:bg2, border:`1px solid ${bdr}`, borderRadius:6, padding:"5px 10px" }}><span style={{ color:txt2 }}>Title: </span><span style={{ color:txt, fontWeight:600 }}>{page.title.slice(0,60)}{page.title.length>60?"…":""}</span><span style={{ color: page.titleLength>=50&&page.titleLength<=70?"#059669":"#D97706", marginLeft:6, fontSize:10 }}>({page.titleLength} chars)</span></div>}
                    {page.metaDescription && <div style={{ fontSize:11, background:bg2, border:`1px solid ${bdr}`, borderRadius:6, padding:"5px 10px" }}><span style={{ color:txt2 }}>Meta: </span><span style={{ color:txt }}>{page.metaDescription.slice(0,80)}{page.metaDescription.length>80?"…":""}</span></div>}
                    {page.wordCount > 0 && <div style={{ fontSize:11, background:bg2, border:`1px solid ${bdr}`, borderRadius:6, padding:"5px 10px" }}><span style={{ color:txt2 }}>Words: </span><span style={{ color: page.wordCount>=300?"#059669":"#D97706", fontWeight:600 }}>{page.wordCount}</span></div>}
                    {page.responseTime && <div style={{ fontSize:11, background:bg2, border:`1px solid ${bdr}`, borderRadius:6, padding:"5px 10px" }}><span style={{ color:txt2 }}>Response: </span><span style={{ color: page.responseTime<800?"#059669":page.responseTime<2000?"#D97706":"#DC2626", fontWeight:600 }}>{page.responseTime}ms</span></div>}
                    {page.crawlDepth > 0 && <div style={{ fontSize:10, background:bg3, border:`1px solid ${bdr}`, borderRadius:6, padding:"5px 8px", color:txt2 }}>Depth {page.crawlDepth}</div>}
                  </div>

                  {/* Issues list */}
                  {hasIssues && (
                    <>
                      <div style={{ fontSize:11, fontWeight:700, color:txt2, marginBottom:6, textTransform:"uppercase", letterSpacing:1 }}>
                        {page.issueCount} Issue{page.issueCount !== 1 ? "s" : ""} Found
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                        {page.issues.map((issue, j) => {
                          const sev = issue.severity === "critical" ? "#DC2626" : issue.severity === "info" ? "#6B7280" : "#D97706";
                          const label = issue.severity === "critical" ? "P1" : issue.severity === "info" ? "P3" : "P2";
                          return (
                            <div key={j} style={{ padding:"8px 12px", borderRadius:8, border:`1px solid ${sev}33`, background:`${sev}08` }}>
                              <div style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
                                <span style={{ fontSize:10, padding:"2px 6px", borderRadius:4, background:`${sev}22`, color:sev, fontWeight:700, flexShrink:0 }}>{label}</span>
                                <div style={{ flex:1 }}>
                                  <div style={{ fontSize:12, fontWeight:600, color:txt }}>{issue.detail || issue.label || issue.type?.replace(/_/g," ")}</div>
                                  {issue.fix && <div style={{ fontSize:11, color:"#059669", marginTop:3 }}>→ Fix: {issue.fix}</div>}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  {!hasIssues && (
                    <div style={{ fontSize:12, color:"#059669", fontWeight:600, padding:"6px 0" }}>✅ No issues found on this page</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop:12, fontSize:11, color:txt2, textAlign:"center" }}>
        Page scores calculated from A2 audit issues. Run pipeline to refresh.
      </div>
    </div>
  );
}

// ── Content Briefs View ──────────────────────────────
function ContentBriefsView({ clientId, dark, bg2, bg3, bdr, txt, txt2, getToken, API }) {
  const [briefs,  setBriefs]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [open,    setOpen]    = useState(null);

  useEffect(() => {
    async function fetchBriefs() {
      try {
        const token = await getToken();
        const res   = await fetch(`${API}/api/agents/${clientId}/content-briefs`, { headers: { Authorization: `Bearer ${token}` } });
        const data  = await res.json();
        setBriefs(data.briefs || []);
      } catch { /* noop */ }
      setLoading(false);
    }
    fetchBriefs();
  }, [clientId]);

  if (loading) return <div style={{ padding:40, textAlign:"center", color:txt2, fontSize:13 }}>Loading content briefs...</div>;

  if (!briefs.length) return (
    <div style={{ padding:40, textAlign:"center", color:txt2 }}>
      <div style={{ fontSize:32, marginBottom:10 }}>📝</div>
      <div style={{ fontSize:14, fontWeight:600, color:txt }}>No content briefs yet</div>
      <div style={{ fontSize:12, marginTop:6 }}>Complete A5 Content Optimisation to generate content briefs.</div>
    </div>
  );

  const typeColor = { new_page:"#443DCB", competitor_gap:"#D97706", optimisation:"#059669" };
  const typeLabel = { new_page:"New Page", competitor_gap:"Competitor Gap", optimisation:"Optimise" };

  return (
    <div style={{ padding:24 }}>
      <div style={{ display:"flex", gap:8, marginBottom:20 }}>
        {[
          { label:"Total Briefs",    val:briefs.length,                               color:"#443DCB" },
          { label:"New Pages",       val:briefs.filter(b=>b.type==="new_page").length, color:"#D97706" },
          { label:"Comp. Gaps",      val:briefs.filter(b=>b.type==="competitor_gap").length, color:"#DC2626" },
        ].map(s => (
          <div key={s.label} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:"12px 20px", textAlign:"center" }}>
            <div style={{ fontSize:20, fontWeight:800, color:s.color }}>{s.val}</div>
            <div style={{ fontSize:11, color:txt2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {briefs.map((brief, i) => {
        const tc = typeColor[brief.type] || "#6B7280";
        const isOpen = open === i;
        return (
          <div key={i} style={{ background:bg2, border:`1px solid ${bdr}`, borderLeft:`4px solid ${tc}`, borderRadius:12, marginBottom:10, overflow:"hidden" }}>
            <div onClick={() => setOpen(isOpen ? null : i)} style={{ padding:"14px 16px", cursor:"pointer", display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ flex:1 }}>
                <div style={{ display:"flex", gap:6, marginBottom:6 }}>
                  <span style={{ fontSize:9, padding:"2px 8px", borderRadius:8, background:`${tc}18`, color:tc, fontWeight:700 }}>{typeLabel[brief.type] || brief.type}</span>
                  <span style={{ fontSize:9, padding:"2px 8px", borderRadius:8, background: brief.priority==="high"?"#DC262618":"#D9770618", color: brief.priority==="high"?"#DC2626":"#D97706", fontWeight:700 }}>{brief.priority} priority</span>
                  {brief.wordCount && <span style={{ fontSize:9, color:txt2 }}>{brief.wordCount} words</span>}
                </div>
                <div style={{ fontSize:13, fontWeight:700, color:txt }}>{brief.title}</div>
                <div style={{ fontSize:11, color:txt2, marginTop:3 }}>{brief.reason}</div>
              </div>
              <span style={{ color:txt2, fontSize:12 }}>{isOpen?"▲":"▼"}</span>
            </div>

            {isOpen && (
              <div style={{ padding:"0 16px 16px", borderTop:`1px solid ${bdr}` }}>
                {brief.targetKws?.length > 0 && (
                  <div style={{ marginTop:12 }}>
                    <div style={{ fontSize:10, fontWeight:700, color:txt2, textTransform:"uppercase", marginBottom:6 }}>Target Keywords</div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                      {brief.targetKws.map((kw, j) => (
                        <span key={j} style={{ fontSize:11, padding:"3px 10px", borderRadius:8, background:"#443DCB18", color:"#443DCB", fontWeight:600 }}>{kw}</span>
                      ))}
                    </div>
                  </div>
                )}

                {brief.sections?.length > 0 && (
                  <div style={{ marginTop:12 }}>
                    <div style={{ fontSize:10, fontWeight:700, color:txt2, textTransform:"uppercase", marginBottom:6 }}>Recommended Sections</div>
                    <ol style={{ margin:0, paddingLeft:18 }}>
                      {brief.sections.map((s, j) => (
                        <li key={j} style={{ fontSize:12, color:txt, padding:"3px 0" }}>{s}</li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Before/After Rank Comparison View ───────────────
function RankComparisonView({ clientId, dark, bg2, bg3, bdr, txt, txt2, getToken, API }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState("all"); // all | up | down | stable

  useEffect(() => {
    async function fetchComparison() {
      try {
        const token = await getToken();
        const res   = await fetch(`${API}/api/agents/${clientId}/rank-comparison`, { headers: { Authorization: `Bearer ${token}` } });
        const d     = await res.json();
        setData(d);
      } catch { /* noop */ }
      setLoading(false);
    }
    fetchComparison();
  }, [clientId]);

  if (loading) return <div style={{ padding:40, textAlign:"center", color:txt2, fontSize:13 }}>Loading comparison...</div>;

  if (!data?.comparison) return (
    <div style={{ padding:40, textAlign:"center", color:txt2 }}>
      <div style={{ fontSize:32, marginBottom:10 }}>📊</div>
      <div style={{ fontSize:14, fontWeight:600, color:txt }}>No comparison data yet</div>
      <div style={{ fontSize:12, marginTop:6 }}>{data?.message || "Need at least 2 pipeline runs to compare rankings."}</div>
    </div>
  );

  const { comparison, summary, latestDate, previousDate, healthScoreChange } = data;
  const filtered = filter === "all" ? comparison : comparison.filter(k => k.trend === filter);

  return (
    <div style={{ padding:24 }}>
      {/* Date range + summary */}
      <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:"14px 18px", marginBottom:16 }}>
        <div style={{ fontSize:11, color:txt2, marginBottom:10 }}>{previousDate} → {latestDate}</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
          {[
            { label:"Improved",  val:summary.gained, color:"#059669", icon:"↑" },
            { label:"Dropped",   val:summary.lost,   color:"#DC2626", icon:"↓" },
            { label:"Stable",    val:summary.stable, color:"#6B7280", icon:"→" },
            { label:"Health Score Change", val: `${healthScoreChange >= 0 ? "+" : ""}${healthScoreChange || 0}`, color: healthScoreChange >= 0 ? "#059669" : "#DC2626", icon:"" },
          ].map(s => (
            <div key={s.label} style={{ textAlign:"center" }}>
              <div style={{ fontSize:22, fontWeight:800, color:s.color }}>{s.icon}{s.val}</div>
              <div style={{ fontSize:11, color:txt2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filter */}
      <div style={{ display:"flex", gap:8, marginBottom:16 }}>
        {[
          { id:"all",    label:"All Keywords", color:"#443DCB" },
          { id:"up",     label:"Improved",     color:"#059669" },
          { id:"down",   label:"Dropped",      color:"#DC2626" },
          { id:"stable", label:"Stable",       color:"#6B7280" },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{ padding:"6px 14px", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer", border:`1px solid ${filter===f.id ? f.color : bdr}`, background: filter===f.id ? f.color : "transparent", color: filter===f.id ? "#fff" : txt2 }}>
            {f.label} {filter===f.id ? "" : `(${comparison.filter(k=>f.id==="all"||k.trend===f.id).length})`}
          </button>
        ))}
      </div>

      {/* Rankings table */}
      <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:14, overflow:"hidden" }}>
        <div style={{ display:"grid", gridTemplateColumns:"2fr 100px 100px 100px", padding:"10px 16px", borderBottom:`1px solid ${bdr}`, fontSize:11, fontWeight:700, color:txt2 }}>
          <span>Keyword</span>
          <span style={{ textAlign:"center" }}>Previous</span>
          <span style={{ textAlign:"center" }}>Current</span>
          <span style={{ textAlign:"center" }}>Change</span>
        </div>
        {filtered.length === 0 && <div style={{ padding:24, textAlign:"center", color:txt2, fontSize:12 }}>No keywords match this filter.</div>}
        {filtered.map((kw, i) => {
          const changeColor = kw.trend === "up" ? "#059669" : kw.trend === "down" ? "#DC2626" : "#6B7280";
          const changeText  = kw.change === null ? "—"
            : kw.change > 0  ? `↑${kw.change} pos`
            : kw.change < 0  ? `↓${Math.abs(kw.change)} pos`
            : "→ stable";
          return (
            <div key={i} style={{ display:"grid", gridTemplateColumns:"2fr 100px 100px 100px", padding:"12px 16px", borderBottom:`1px solid ${bdr}`, alignItems:"center" }}>
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:txt }}>{kw.keyword}</div>
                {kw.category && <div style={{ fontSize:10, color:txt2, marginTop:1 }}>{kw.category}</div>}
              </div>
              <div style={{ textAlign:"center", fontSize:13, color:txt2 }}>{kw.previous || "NR"}</div>
              <div style={{ textAlign:"center", fontSize:13, fontWeight:700, color:txt }}>{kw.current || "NR"}</div>
              <div style={{ textAlign:"center" }}>
                <span style={{ fontSize:11, fontWeight:700, color:changeColor, padding:"3px 8px", borderRadius:8, background:`${changeColor}18` }}>{changeText}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Dashboard View (Unified Overview) ───────────────
function DashboardView({ clientId, state, dark, bg2, bg3, bdr, txt, txt2, getToken, API, onTabSwitch }) {
  const [dash,          setDash]          = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [recalcMsg,     setRecalcMsg]     = useState(null);
  const [revenue,       setRevenue]       = useState(null);

  async function fetchDash() {
    try {
      const token = await getToken();
      const [dashRes, revRes] = await Promise.all([
        fetch(`${API}/api/agents/${clientId}/dashboard`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/api/agents/${clientId}/revenue`,   { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const dashData = await dashRes.json();
      const revData  = await revRes.json();
      setDash(dashData);
      if (revData.revenue) setRevenue(revData.revenue);
    } catch { /* noop */ }
    setLoading(false);
  }

  useEffect(() => { fetchDash(); }, [clientId]);

  async function recalculate() {
    setRecalculating(true);
    setRecalcMsg(null);
    try {
      const token = await getToken();
      const res   = await fetch(`${API}/api/agents/${clientId}/recalculate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.score) {
        setRecalcMsg(`Score updated to ${data.score.overall}/100 · ${data.tasksEmitted} tasks generated`);
        setLoading(true);
        await fetchDash();
      } else {
        setRecalcMsg(data.error || "Recalculation failed");
      }
    } catch (e) {
      setRecalcMsg("Error: " + e.message);
    }
    setRecalculating(false);
  }

  if (loading) return <div style={{ padding:40, textAlign:"center", color:txt2, fontSize:13 }}>Loading dashboard...</div>;

  // Use API response, fall back to state prop so dashboard always shows data
  const stateAudit = state?.A2_audit;
  const stateReport = state?.A9_report;

  const score   = dash?.score || stateReport?.scoreBreakdown || null;
  const tasks   = dash?.topTasks   || [];
  const alerts  = dash?.alerts     || [];
  const forecast= dash?.forecast   || stateReport?.forecast  || null;

  // Audit summary: prefer API response, fall back to state
  const audit = dash?.auditSummary || (stateAudit ? {
    healthScore: stateAudit.healthScore,
    p1: (stateAudit.issues?.p1 || []).length,
    p2: (stateAudit.issues?.p2 || []).length,
    p3: (stateAudit.issues?.p3 || []).length,
    pagesCrawled: stateAudit.checks?.pagesCrawled || 1,
  } : null);

  // Use audit healthScore as score display when 4D score is missing
  const displayScore = score?.overall ?? stateAudit?.healthScore ?? null;
  const scoreColor = displayScore === null ? "#6B7280" : displayScore >= 75 ? "#059669" : displayScore >= 50 ? "#D97706" : "#DC2626";
  const scoreLabel = displayScore === null ? "Not scored" : displayScore >= 75 ? "Good" : displayScore >= 50 ? "Needs Work" : "Critical";

  return (
    <div style={{ padding:24 }}>

      {/* Recalculate bar — shown when score is missing or as a refresh action */}
      {(!score || tasks.length === 0) && (
        <div style={{ background: dark ? "#1a1a2e" : "#EEF2FF", border:`1px solid #443DCB33`, borderRadius:10, padding:"12px 16px", marginBottom:16, display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:"#443DCB" }}>Pipeline complete but dashboard showing zeros?</div>
            <div style={{ fontSize:11, color:txt2, marginTop:2 }}>Recalculate to sync score and tasks from audit data — no need to re-run pipeline.</div>
          </div>
          <button onClick={recalculate} disabled={recalculating} style={{ padding:"8px 16px", borderRadius:8, background:"#443DCB", color:"#fff", border:"none", fontSize:12, fontWeight:700, cursor:recalculating?"not-allowed":"pointer", opacity:recalculating?0.7:1, flexShrink:0, whiteSpace:"nowrap" }}>
            {recalculating ? "Recalculating..." : "Recalculate Score & Tasks"}
          </button>
        </div>
      )}

      {/* Recalculate success message */}
      {recalcMsg && (
        <div style={{ background: recalcMsg.startsWith("Error") ? "#FEF2F2" : "#F0FDF4", border:`1px solid ${recalcMsg.startsWith("Error") ? "#FCA5A5" : "#86EFAC"}`, borderRadius:8, padding:"10px 14px", marginBottom:14, fontSize:12, color: recalcMsg.startsWith("Error") ? "#DC2626" : "#059669", fontWeight:600 }}>
          {recalcMsg.startsWith("Error") ? "Error: " : "Done: "}{recalcMsg}
        </div>
      )}

      {/* Manual refresh button (always visible, subtle) */}
      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:12 }}>
        <button onClick={recalculate} disabled={recalculating} style={{ padding:"5px 12px", borderRadius:7, background:"transparent", border:`1px solid ${bdr}`, fontSize:11, color:txt2, cursor:recalculating?"not-allowed":"pointer", display:"flex", alignItems:"center", gap:5 }}>
          <span style={{ fontSize:12 }}>↻</span> {recalculating ? "Recalculating..." : "Recalculate"}
        </button>
      </div>

      {/* Top row: Score + Audit summary + Forecast */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14, marginBottom:20 }}>

        {/* Score card */}
        <div onClick={() => onTabSwitch("score")} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:14, padding:20, cursor:"pointer", display:"flex", alignItems:"center", gap:16 }}>
          <div style={{ width:72, height:72, borderRadius:"50%", border:`5px solid ${scoreColor}`, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:`${scoreColor}10`, flexShrink:0 }}>
            <div style={{ fontSize:20, fontWeight:800, color:scoreColor }}>{displayScore ?? "—"}</div>
            <div style={{ fontSize:9, color:scoreColor }}>/100</div>
          </div>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:txt }}>SEO Score</div>
            <div style={{ fontSize:20, fontWeight:800, color:scoreColor }}>{scoreLabel}</div>
            <div style={{ fontSize:10, color:txt2, marginTop:2 }}>Click for full breakdown →</div>
          </div>
        </div>

        {/* Audit Issues card */}
        <div onClick={() => onTabSwitch("audit")} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:14, padding:20, cursor:"pointer" }}>
          <div style={{ fontSize:13, fontWeight:700, color:txt, marginBottom:12 }}>Audit Issues</div>
          <div style={{ display:"flex", gap:12 }}>
            {[
              { label:"Critical", val:audit?.p1 || 0, color:"#DC2626" },
              { label:"Important",val:audit?.p2 || 0, color:"#D97706" },
              { label:"Minor",    val:audit?.p3 || 0, color:"#6B7280" },
            ].map(s => (
              <div key={s.label} style={{ textAlign:"center", flex:1 }}>
                <div style={{ fontSize:22, fontWeight:800, color:s.color }}>{s.val}</div>
                <div style={{ fontSize:10, color:txt2 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize:10, color:txt2, marginTop:10 }}>Click to see full audit →</div>
        </div>

        {/* Forecast card */}
        <div onClick={() => onTabSwitch("score")} style={{ background:bg2, border:`1px solid #05966933`, borderRadius:14, padding:20, cursor:"pointer", borderLeft:"4px solid #059669" }}>
          <div style={{ fontSize:13, fontWeight:700, color:txt, marginBottom:8 }}>Growth Forecast</div>
          {forecast ? (
            <>
              <div style={{ fontSize:28, fontWeight:800, color:"#059669" }}>{forecast.trafficGrowth}</div>
              <div style={{ fontSize:11, color:txt2, marginBottom:4 }}>estimated traffic growth</div>
              <div style={{ fontSize:11, color:"#443DCB", fontWeight:600 }}>{forecast.scoreGain} score · {forecast.timeframe}</div>
              <div style={{ fontSize:10, color:txt2, marginTop:6 }}>Fix top {forecast.tasksConsidered} issues</div>
            </>
          ) : (
            <div style={{ fontSize:12, color:txt2 }}>Run full pipeline to see forecast</div>
          )}
        </div>
      </div>

      {/* Middle row: Top Tasks + Alerts */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:20 }}>

        {/* Top Tasks */}
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:14, padding:20 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
            <div style={{ fontSize:13, fontWeight:700, color:txt }}>Top Priority Tasks</div>
            <button onClick={() => onTabSwitch("tasks")} style={{ fontSize:10, color:"#443DCB", background:"transparent", border:"none", cursor:"pointer", fontWeight:600 }}>See all →</button>
          </div>
          {tasks.length === 0 ? (
            <div style={{ fontSize:12, color:txt2, padding:"20px 0", textAlign:"center" }}>No tasks yet — run the pipeline</div>
          ) : tasks.slice(0,4).map((t, i) => {
            const ic = {High:"#DC2626",Medium:"#D97706",Low:"#6B7280"}[t.impact]||"#6B7280";
            return (
              <div key={t.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:`1px solid ${bdr}` }}>
                <span style={{ fontSize:11, fontWeight:800, color:"#443DCB", minWidth:16 }}>#{i+1}</span>
                <span style={{ flex:1, fontSize:12, color:txt, lineHeight:1.3 }}>{t.title}</span>
                <span style={{ fontSize:9, padding:"2px 7px", borderRadius:8, background:`${ic}18`, color:ic, fontWeight:700, flexShrink:0 }}>{t.impact}</span>
              </div>
            );
          })}
        </div>

        {/* Alerts */}
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:14, padding:20 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
            <div style={{ fontSize:13, fontWeight:700, color:txt }}>Active Alerts</div>
            <button onClick={() => onTabSwitch("alerts")} style={{ fontSize:10, color:"#DC2626", background:"transparent", border:"none", cursor:"pointer", fontWeight:600 }}>See all →</button>
          </div>
          {alerts.length === 0 ? (
            <div style={{ fontSize:12, color:txt2, padding:"20px 0", textAlign:"center" }}>
              <div style={{ fontSize:24, marginBottom:6 }}>✅</div>No active alerts
            </div>
          ) : alerts.slice(0,4).map(a => {
            const sc = a.severity==="critical"?"#DC2626":a.severity==="warning"?"#D97706":"#0891B2";
            return (
              <div key={a.id} style={{ padding:"8px 0", borderBottom:`1px solid ${bdr}` }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
                  <div style={{ width:6, height:6, borderRadius:"50%", background:sc, flexShrink:0 }} />
                  <span style={{ fontSize:11, fontWeight:600, color:sc, textTransform:"uppercase" }}>{a.severity}</span>
                </div>
                <div style={{ fontSize:12, color:txt, lineHeight:1.4 }}>{a.businessMessage || a.message}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Score dimension mini-bars */}
      {score?.breakdown && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:14, padding:20 }}>
          <div style={{ fontSize:13, fontWeight:700, color:txt, marginBottom:14 }}>Score Breakdown</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:12 }}>
            {Object.values(score.breakdown).map(d => (
              <div key={d.label}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                  <span style={{ fontSize:12, color:txt, fontWeight:600 }}>{d.label}</span>
                  <span style={{ fontSize:12, fontWeight:800, color:d.color }}>{d.score}</span>
                </div>
                <div style={{ height:6, borderRadius:3, background:bg3 }}>
                  <div style={{ height:"100%", width:`${d.score}%`, background:d.color, borderRadius:3 }} />
                </div>
                <div style={{ fontSize:10, color:txt2, marginTop:2 }}>{Math.round(d.weight*100)}% of overall</div>
              </div>
            ))}
          </div>
          <button onClick={() => onTabSwitch("score")} style={{ marginTop:14, padding:"8px 16px", borderRadius:8, border:`1px solid #443DCB`, background:"transparent", color:"#443DCB", fontSize:12, fontWeight:600, cursor:"pointer" }}>
            Full score breakdown & factor drill-down →
          </button>
        </div>
      )}

      {/* Revenue Impact Section */}
      {revenue && (
        <div style={{ background:bg2, border:`1px solid #05966933`, borderRadius:14, padding:20, marginTop:14, borderLeft:"4px solid #059669" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:txt }}>Revenue Impact</div>
              <div style={{ fontSize:11, color:txt2, marginTop:2 }}>Based on keyword rankings · {revenue.conversionRate}% conv · £{revenue.avgOrderValue} AOV</div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:10, color:txt2 }}>Revenue gap</div>
              <div style={{ fontSize:20, fontWeight:800, color:"#DC2626" }}>£{(revenue.revenueGap||0).toLocaleString()}/mo</div>
              <div style={{ fontSize:10, color:txt2 }}>missed by not ranking higher</div>
            </div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:16 }}>
            {[
              { label:"Current Monthly Visitors",   val: revenue.currentMonthlyVisitors?.toLocaleString()  || "—", color:"#443DCB" },
              { label:"Current Monthly Revenue",    val: `£${(revenue.currentMonthlyRevenue||0).toLocaleString()}`,  color:"#059669" },
              { label:"Potential Revenue (rank #1)",val: `£${(revenue.potentialMonthlyRevenue||0).toLocaleString()}`,color:"#D97706" },
            ].map(s => (
              <div key={s.label} style={{ background:bg3, borderRadius:10, padding:"12px 14px", textAlign:"center" }}>
                <div style={{ fontSize:18, fontWeight:800, color:s.color }}>{s.val}</div>
                <div style={{ fontSize:10, color:txt2, marginTop:3 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Top opportunities */}
          {revenue.topOpportunities?.length > 0 && (
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", marginBottom:8 }}>Top Revenue Opportunities</div>
              {revenue.topOpportunities.slice(0, 3).map((kw, i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 0", borderBottom:`1px solid ${bdr}` }}>
                  <span style={{ fontSize:11, fontWeight:800, color:"#443DCB", minWidth:16 }}>#{i+1}</span>
                  <span style={{ flex:1, fontSize:12, color:txt, fontWeight:600 }}>{kw.keyword}</span>
                  <span style={{ fontSize:11, color:txt2 }}>pos {kw.position || "NR"}</span>
                  <span style={{ fontSize:11, color:"#059669", fontWeight:700 }}>+£{((kw.potentialRevenue || 0) - (kw.revenue || 0)).toLocaleString()}/mo</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Rankings View ────────────────────────────────────
function RankingsView({ clientId, dark, bg2, bg3, bdr, txt, txt2, getToken, API, googleToken }) {
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [running,  setRunning]  = useState(false);
  const [filter,   setFilter]   = useState("all"); // all | top10 | notranking | drops

  async function fetchRankings() {
    try {
      const token = await getToken();
      const res = await window.fetch(`${API}/api/agents/${clientId}/rankings`, { headers: { Authorization: `Bearer ${token}` } });
      const d   = await res.json();
      setData(d);
    } catch { /* noop */ }
    setLoading(false);
  }

  async function runTracker() {
    setRunning(true);
    try {
      const token = await getToken();
      await window.fetch(`${API}/api/agents/${clientId}/run-a10`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ googleToken: googleToken || null }),
      });
      await fetchRankings();
    } catch { /* noop */ }
    setRunning(false);
  }

  useEffect(() => { fetchRankings(); }, [clientId]);

  const rankings = data?.rankings || [];
  const filtered = rankings.filter(r =>
    filter === "top10"      ? r.position && r.position <= 10 :
    filter === "notranking" ? (!r.position || r.position > 100) :
    filter === "drops"      ? (data?.drops || 0) > 0 :
    true
  );

  const top10   = rankings.filter(r => r.position && r.position <= 10).length;
  const top3    = rankings.filter(r => r.position && r.position <= 3).length;
  const notRank = rankings.filter(r => !r.position || r.position > 100).length;

  if (loading) return <div style={{ padding:40, textAlign:"center", color:txt2 }}>Loading rankings...</div>;

  return (
    <div style={{ padding:24 }}>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <div style={{ fontSize:15, fontWeight:700, color:txt }}>📈 Keyword Rankings</div>
          {data?.source && <div style={{ fontSize:11, color:txt2, marginTop:2 }}>Source: {data.source} · {data.snapshotDate || data.date || "latest"}</div>}
        </div>
        <button onClick={runTracker} disabled={running} style={{
          padding:"8px 18px", borderRadius:10, border:"none",
          background: running ? "#6B7280" : "#443DCB", color:"#fff",
          fontSize:12, fontWeight:700, cursor: running ? "not-allowed" : "pointer",
        }}>
          {running ? "Tracking..." : "🔄 Refresh Rankings"}
        </button>
      </div>

      {/* Stats */}
      <div style={{ display:"flex", gap:12, marginBottom:20, flexWrap:"wrap" }}>
        {[
          { label:"Tracked",   val:rankings.length, color:"#443DCB" },
          { label:"Top 3",     val:top3,            color:"#059669" },
          { label:"Top 10",    val:top10,            color:"#D97706" },
          { label:"Not Ranking",val:notRank,         color:"#DC2626" },
          { label:"Position Drops",val:data?.drops||0,color:"#DC2626" },
          { label:"Position Gains",val:data?.gains||0,color:"#059669" },
        ].map(s => (
          <div key={s.label} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:"12px 16px", textAlign:"center", minWidth:80 }}>
            <div style={{ fontSize:20, fontWeight:800, color:s.color }}>{s.val}</div>
            <div style={{ fontSize:10, color:txt2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display:"flex", gap:6, marginBottom:16 }}>
        {[["all","All"],["top10","Top 10"],["notranking","Not Ranking"],["drops","Drops"]].map(([f,l]) => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding:"6px 12px", borderRadius:8, fontSize:11, fontWeight:600, cursor:"pointer",
            background: filter===f ? "#443DCB" : "transparent",
            color:      filter===f ? "#fff"    : txt2,
            border:     `1px solid ${filter===f ? "#443DCB" : bdr}`,
          }}>{l}</button>
        ))}
      </div>

      {/* Rankings table */}
      {rankings.length === 0 ? (
        <div style={{ padding:"0 0 24px 0" }}>
          <div style={{ background:"#D9770611", border:"1px solid #D9770633", borderRadius:10, padding:"12px 16px", marginBottom:12 }}>
            <div style={{ fontSize:12, fontWeight:700, color:"#D97706", marginBottom:6 }}>No ranking data — here's how to fix it:</div>
            <ol style={{ margin:0, paddingLeft:18, fontSize:11, color:txt2, lineHeight:2 }}>
              <li><strong>Connect Google Search Console</strong> — Click "Connect GSC" button → Log in with Google → It will show real keyword positions</li>
              <li><strong>Add SerpAPI key</strong> — Settings → API Keys → SerpAPI key from serpapi.com (free tier: 100 searches/month)</li>
              <li><strong>Re-run A10</strong> — After adding a key, click "Refresh Rankings" to pull live data</li>
            </ol>
          </div>
          <div style={{ textAlign:"center", padding:"24px 0 0 0", color:txt2 }}>
            <div style={{ fontSize:36, marginBottom:12 }}>📊</div>
            <div style={{ fontSize:14, fontWeight:600, color:txt, marginBottom:6 }}>No ranking data yet</div>
            <div style={{ fontSize:12, marginBottom:16 }}>Connect Google Search Console or click Refresh Rankings</div>
            <button onClick={runTracker} disabled={running} style={{ padding:"10px 24px", borderRadius:10, border:"none", background:"#443DCB", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
              {running ? "Running..." : "🔄 Track Rankings Now"}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, overflow:"hidden" }}>
          {/* Table header */}
          <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr", padding:"10px 16px", background:bg3, borderBottom:`1px solid ${bdr}` }}>
            {["Keyword","Position","Clicks","CTR"].map(h => (
              <div key={h} style={{ fontSize:10, fontWeight:700, color:txt2, textTransform:"uppercase" }}>{h}</div>
            ))}
          </div>
          {filtered.slice(0,50).map((r, i) => {
            const posColor = !r.position ? "#6B7280" : r.position <= 3 ? "#059669" : r.position <= 10 ? "#D97706" : r.position <= 30 ? "#0891B2" : "#DC2626";
            return (
              <div key={i} style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr", padding:"10px 16px", borderBottom:`1px solid ${bdr}`, alignItems:"center" }}>
                <div style={{ fontSize:12, color:txt, fontWeight:500 }}>{r.keyword}</div>
                <div style={{ fontSize:13, fontWeight:800, color:posColor }}>{r.position ? `#${r.position}` : "—"}</div>
                <div style={{ fontSize:12, color:txt2 }}>{r.clicks != null ? r.clicks.toLocaleString() : "—"}</div>
                <div style={{ fontSize:12, color:txt2 }}>{r.ctr != null ? `${r.ctr}%` : "—"}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BACKLINKS TAB — Real data via DataForSEO Backlinks API
// ─────────────────────────────────────────────────────────────────────────────
function BacklinksTab({ dark, clientId, getToken, API }) {
  const [summary,   setSummary]   = useState(null);
  const [domains,   setDomains]   = useState([]);
  const [anchors,   setAnchors]   = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [activeTab, setActiveTab] = useState("overview");

  const bg2 = dark ? "#111" : "#fff";
  const bg3 = dark ? "#1a1a1a" : "#f5f5f0";
  const bdr = dark ? "#2a2a2a" : "#e0e0d8";
  const txt = dark ? "#e8e8e8" : "#1a1a18";
  const txt2= dark ? "#777"   : "#888";
  const B   = "#443DCB";

  async function load() {
    setLoading(true); setError("");
    try {
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token}` };
      const [s, d, a] = await Promise.all([
        fetch(`${API}/api/backlinks/${clientId}/summary`,            { headers }).then(r => r.json()),
        fetch(`${API}/api/backlinks/${clientId}/referring-domains`,  { headers }).then(r => r.json()),
        fetch(`${API}/api/backlinks/${clientId}/anchors`,            { headers }).then(r => r.json()),
      ]);
      if (s.error) throw new Error(s.error);
      setSummary(s);
      setDomains(d.items || []);
      setAnchors(a.anchors || []);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  useEffect(() => { load(); }, [clientId]);

  const tab = (a) => ({
    padding:"5px 14px", borderRadius:16, fontSize:12, cursor:"pointer",
    fontWeight: a?600:400,
    background: a ? `${B}22` : "transparent",
    color:      a ? "#6B62E8" : txt2,
    border:     `1px solid ${a ? `${B}44` : bdr}`,
  });

  if (loading) return <div style={{ padding:40, textAlign:"center", color:txt2 }}>Loading backlink data…</div>;

  if (error) return (
    <div style={{ background:"#DC262611", border:"1px solid #DC262633", borderRadius:10, padding:"16px 20px" }}>
      <div style={{ fontSize:13, fontWeight:700, color:"#DC2626", marginBottom:6 }}>⚠️ {error}</div>
      {error.includes("DataForSEO") && (
        <div style={{ fontSize:12, color:txt2, lineHeight:1.7 }}>
          <strong>How to fix:</strong><br/>
          1. Go to <strong>dataforseo.com</strong> → sign up (free trial available)<br/>
          2. Copy your <strong>login:password</strong> credentials<br/>
          3. Go to <strong>Settings → API Keys</strong> → paste in <strong>DataForSEO</strong> field → Save<br/>
          4. Come back and refresh this tab
        </div>
      )}
      <button onClick={load} style={{ marginTop:12, padding:"8px 16px", borderRadius:8, border:"none", background:"#DC2626", color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer" }}>
        🔄 Retry
      </button>
    </div>
  );

  if (!summary) return (
    <div style={{ textAlign:"center", padding:"40px 20px" }}>
      <button onClick={load} style={{ padding:"12px 28px", borderRadius:10, border:"none", background:B, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}>
        🔗 Load Backlink Data
      </button>
    </div>
  );

  const drColor = summary.domainRank >= 60 ? "#059669" : summary.domainRank >= 30 ? "#D97706" : "#DC2626";

  return (
    <div>
      {/* KPI Cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:10, marginBottom:20 }}>
        {[
          { label:"Domain Rank",        v: summary.domainRank,       color: drColor,   icon:"🏆" },
          { label:"Total Backlinks",    v: (summary.backlinks||0).toLocaleString(),    color:"#443DCB", icon:"🔗" },
          { label:"Referring Domains",  v: (summary.referringDomains||0).toLocaleString(), color:"#0891B2", icon:"🌐" },
          { label:"New Backlinks",      v: `+${summary.newBacklinks||0}`, color:"#059669", icon:"📈" },
          { label:"Lost Backlinks",     v: `-${summary.lostBacklinks||0}`, color:"#DC2626", icon:"📉" },
          { label:"Spam Score",         v: `${summary.spamScore||0}%`, color: (summary.spamScore||0)>30?"#DC2626":"#059669", icon:"🛡️" },
        ].map(k => (
          <div key={k.label} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"12px 14px", textAlign:"center" }}>
            <div style={{ fontSize:20, marginBottom:4 }}>{k.icon}</div>
            <div style={{ fontSize:18, fontWeight:800, color:k.color, lineHeight:1 }}>{k.v}</div>
            <div style={{ fontSize:10, color:txt2, marginTop:4 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Follow vs Nofollow */}
      {(summary.followLinks + summary.nofollowLinks) > 0 && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"12px 16px", marginBottom:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:txt, marginBottom:8 }}>Do-Follow vs No-Follow Ratio</div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ flex:1, height:10, borderRadius:5, background:bdr, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${Math.round((summary.followLinks/(summary.followLinks+summary.nofollowLinks))*100)}%`, background:"#059669", borderRadius:5 }} />
            </div>
            <span style={{ fontSize:11, color:"#059669", fontWeight:700, whiteSpace:"nowrap" }}>
              {Math.round((summary.followLinks/(summary.followLinks+summary.nofollowLinks))*100)}% DoFollow
            </span>
          </div>
          <div style={{ display:"flex", gap:16, marginTop:8 }}>
            <span style={{ fontSize:11, color:txt2 }}>✅ DoFollow: <strong style={{ color:txt }}>{(summary.followLinks||0).toLocaleString()}</strong></span>
            <span style={{ fontSize:11, color:txt2 }}>⚠️ NoFollow: <strong style={{ color:txt }}>{(summary.nofollowLinks||0).toLocaleString()}</strong></span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display:"flex", gap:6, marginBottom:14 }}>
        <div style={tab(activeTab==="overview")} onClick={()=>setActiveTab("overview")}>🌐 Referring Domains</div>
        <div style={tab(activeTab==="anchors")}  onClick={()=>setActiveTab("anchors")}>⚓ Anchor Texts</div>
      </div>

      {/* Referring Domains Table */}
      {activeTab==="overview" && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, overflow:"hidden" }}>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead>
                <tr style={{ background:bg3 }}>
                  {["Domain","Rank","Backlinks","DoFollow","First Seen","Spam"].map(h => (
                    <th key={h} style={{ padding:"9px 12px", textAlign:"left", fontSize:11, fontWeight:700, color:txt2, whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {domains.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding:"24px", textAlign:"center", color:txt2 }}>No referring domain data</td></tr>
                ) : domains.map((d, i) => (
                  <tr key={d.domain} style={{ borderTop:`1px solid ${bdr}`, background:i%2===0?"transparent":bg3 }}>
                    <td style={{ padding:"9px 12px", fontWeight:600, color:"#443DCB" }}>{d.domain}</td>
                    <td style={{ padding:"9px 12px" }}>
                      <span style={{ fontWeight:700, color: d.rank>=60?"#059669":d.rank>=30?"#D97706":"#DC2626" }}>{d.rank}</span>
                    </td>
                    <td style={{ padding:"9px 12px", color:txt }}>{(d.backlinks||0).toLocaleString()}</td>
                    <td style={{ padding:"9px 12px" }}>
                      <span style={{ padding:"2px 8px", borderRadius:8, background:d.dofollow?"#05966918":"#DC262618", color:d.dofollow?"#059669":"#DC2626", fontSize:11, fontWeight:700 }}>
                        {d.dofollow ? "✓ DoFollow" : "NoFollow"}
                      </span>
                    </td>
                    <td style={{ padding:"9px 12px", color:txt2, fontSize:11 }}>{d.firstSeen ? d.firstSeen.split("T")[0] : "—"}</td>
                    <td style={{ padding:"9px 12px" }}>
                      <span style={{ color:(d.spamScore||0)>30?"#DC2626":"#059669", fontWeight:700, fontSize:11 }}>{d.spamScore||0}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Anchor Text Table */}
      {activeTab==="anchors" && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, overflow:"hidden" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead>
              <tr style={{ background:bg3 }}>
                {["Anchor Text","Backlinks","Domains","DoFollow"].map(h => (
                  <th key={h} style={{ padding:"9px 12px", textAlign:"left", fontSize:11, fontWeight:700, color:txt2 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {anchors.length === 0 ? (
                <tr><td colSpan={4} style={{ padding:"24px", textAlign:"center", color:txt2 }}>No anchor data</td></tr>
              ) : anchors.map((a, i) => (
                <tr key={i} style={{ borderTop:`1px solid ${bdr}`, background:i%2===0?"transparent":bg3 }}>
                  <td style={{ padding:"9px 12px", fontWeight:600, color:txt }}>{a.anchor}</td>
                  <td style={{ padding:"9px 12px", color:txt }}>{(a.backlinks||0).toLocaleString()}</td>
                  <td style={{ padding:"9px 12px", color:txt2 }}>{a.domains||0}</td>
                  <td style={{ padding:"9px 12px" }}>
                    <span style={{ fontSize:11, color:a.dofollow?"#059669":"#888" }}>{a.dofollow ? "✓" : "—"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ textAlign:"right", marginTop:12 }}>
        <button onClick={load} style={{ padding:"6px 14px", borderRadius:8, border:`1px solid ${bdr}`, background:bg2, color:txt2, fontSize:11, cursor:"pointer" }}>
          🔄 Refresh
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KEYWORD RESEARCH TAB — Find new keyword opportunities via DataForSEO
// ─────────────────────────────────────────────────────────────────────────────
function KwResearchTab({ dark, clientId, getToken, API, state }) {
  const [seedInput, setSeedInput] = useState("");
  const [country,   setCountry]   = useState("US");
  const [ideas,     setIdeas]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [sortBy,    setSortBy]    = useState("volume");
  const [filterInt, setFilterInt] = useState("all");

  const bg2 = dark ? "#111" : "#fff";
  const bg3 = dark ? "#1a1a1a" : "#f5f5f0";
  const bdr = dark ? "#2a2a2a" : "#e0e0d8";
  const txt = dark ? "#e8e8e8" : "#1a1a18";
  const txt2= dark ? "#777"   : "#888";
  const B   = "#443DCB";

  // Pre-populate from A3 keywords if available
  const suggestedSeeds = (state?.A3_keywords?.keywordMap || [])
    .filter(k => k.priority === "high")
    .slice(0, 5)
    .map(k => k.keyword);

  async function research() {
    const seeds = seedInput.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    if (!seeds.length) { setError("Enter at least one seed keyword"); return; }
    setLoading(true); setError(""); setIdeas([]);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/rank-tracker/${clientId}/keyword-ideas`, {
        method: "POST",
        headers: { Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
        body: JSON.stringify({ keywords: seeds, country, limit: 50 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setIdeas(data.ideas || []);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  const filtered = ideas
    .filter(i => filterInt === "all" || i.intent === filterInt)
    .sort((a, b) => {
      if (sortBy === "volume")     return b.volume - a.volume;
      if (sortBy === "difficulty") return a.difficulty - b.difficulty;
      if (sortBy === "cpc")        return b.cpc - a.cpc;
      return 0;
    });

  const intents    = [...new Set(ideas.map(i => i.intent).filter(Boolean))];
  const COUNTRIES  = [["US","🇺🇸 USA"],["GB","🇬🇧 UK"],["IN","🇮🇳 India"],["AU","🇦🇺 Australia"],["CA","🇨🇦 Canada"],["AE","🇦🇪 UAE"],["DE","🇩🇪 Germany"],["SG","🇸🇬 Singapore"]];

  return (
    <div>
      {/* Search Box */}
      <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:"16px 20px", marginBottom:16 }}>
        <div style={{ fontSize:13, fontWeight:700, color:txt, marginBottom:10 }}>🔎 Keyword Research — Discover new keyword opportunities</div>
        {suggestedSeeds.length > 0 && (
          <div style={{ marginBottom:10 }}>
            <div style={{ fontSize:11, color:txt2, marginBottom:6 }}>Suggested from your pipeline:</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {suggestedSeeds.map(s => (
                <button key={s} onClick={() => setSeedInput(p => p ? `${p}, ${s}` : s)}
                  style={{ padding:"3px 10px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:11, cursor:"pointer" }}>
                  + {s}
                </button>
              ))}
            </div>
          </div>
        )}
        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          <textarea
            value={seedInput} onChange={e => setSeedInput(e.target.value)}
            placeholder={"Enter seed keywords (one per line or comma-separated)\ne.g. SEO services london, digital marketing agency"}
            rows={3}
            style={{ flex:1, minWidth:200, padding:"10px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:12, resize:"vertical", fontFamily:"inherit" }}
          />
          <div style={{ display:"flex", flexDirection:"column", gap:8, minWidth:140 }}>
            <select value={country} onChange={e => setCountry(e.target.value)}
              style={{ padding:"8px 10px", borderRadius:8, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:12 }}>
              {COUNTRIES.map(([c,l]) => <option key={c} value={c}>{l}</option>)}
            </select>
            <button onClick={research} disabled={loading}
              style={{ padding:"10px 16px", borderRadius:8, border:"none", background:B, color:"#fff", fontWeight:700, fontSize:13, cursor:loading?"not-allowed":"pointer", opacity:loading?0.6:1 }}>
              {loading ? "Researching…" : "🔎 Find Keywords"}
            </button>
          </div>
        </div>
        {error && <div style={{ marginTop:10, fontSize:12, color:"#DC2626" }}>{error}</div>}
      </div>

      {/* Results */}
      {ideas.length > 0 && (
        <div>
          {/* Summary bar */}
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12, flexWrap:"wrap" }}>
            <span style={{ fontSize:12, color:txt2 }}>{filtered.length} of {ideas.length} keywords</span>
            <select value={filterInt} onChange={e => setFilterInt(e.target.value)}
              style={{ padding:"5px 10px", borderRadius:6, border:`1px solid ${bdr}`, background:bg2, color:txt, fontSize:11 }}>
              <option value="all">All intents</option>
              {intents.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              style={{ padding:"5px 10px", borderRadius:6, border:`1px solid ${bdr}`, background:bg2, color:txt, fontSize:11 }}>
              <option value="volume">Sort: Volume ↓</option>
              <option value="difficulty">Sort: Difficulty ↑ (easiest first)</option>
              <option value="cpc">Sort: CPC ↓</option>
            </select>
            {/* Quick wins shortcut */}
            <button onClick={() => { setSortBy("difficulty"); setFilterInt("all"); }}
              style={{ padding:"4px 12px", borderRadius:8, border:`1px solid #05966644`, background:"#05966611", color:"#059669", fontSize:11, fontWeight:700, cursor:"pointer" }}>
              ⚡ Quick Wins (lowest difficulty)
            </button>
          </div>

          {/* Table */}
          <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, overflow:"hidden" }}>
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                <thead>
                  <tr style={{ background:bg3 }}>
                    {["Keyword","Volume","Difficulty","CPC","Competition","Intent","Trend (6mo)"].map(h => (
                      <th key={h} style={{ padding:"9px 12px", textAlign:"left", fontSize:11, fontWeight:700, color:txt2, whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((kw, i) => {
                    const diffColor = kw.difficulty > 70 ? "#DC2626" : kw.difficulty > 40 ? "#D97706" : "#059669";
                    const intentColor = { informational:"#0891B2", commercial:"#7C3AED", transactional:"#059669", navigational:"#6B7280" }[kw.intent] || "#888";
                    const maxTrend = Math.max(...(kw.trend||[1]), 1);
                    return (
                      <tr key={i} style={{ borderTop:`1px solid ${bdr}`, background:i%2===0?"transparent":bg3 }}>
                        <td style={{ padding:"9px 12px", fontWeight:600, color:txt, maxWidth:220, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{kw.keyword}</td>
                        <td style={{ padding:"9px 12px", fontWeight:700, color:"#443DCB" }}>{(kw.volume||0).toLocaleString()}</td>
                        <td style={{ padding:"9px 12px" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                            <div style={{ width:40, height:5, borderRadius:3, background:bdr, overflow:"hidden" }}>
                              <div style={{ height:"100%", width:`${kw.difficulty}%`, background:diffColor, borderRadius:3 }} />
                            </div>
                            <span style={{ fontSize:11, fontWeight:700, color:diffColor }}>{kw.difficulty}</span>
                          </div>
                        </td>
                        <td style={{ padding:"9px 12px", color:txt2 }}>{kw.cpc ? `$${kw.cpc}` : "—"}</td>
                        <td style={{ padding:"9px 12px", color:txt2, fontSize:11 }}>{kw.competition || "—"}</td>
                        <td style={{ padding:"9px 12px" }}>
                          <span style={{ padding:"2px 8px", borderRadius:8, background:`${intentColor}18`, color:intentColor, fontSize:10, fontWeight:700, textTransform:"capitalize" }}>
                            {kw.intent || "—"}
                          </span>
                        </td>
                        <td style={{ padding:"9px 12px" }}>
                          {(kw.trend||[]).length > 0 ? (
                            <svg width={60} height={18} viewBox="0 0 60 18">
                              {(kw.trend||[]).map((v, ti, arr) => {
                                if (ti === 0) return null;
                                const x1 = ((ti-1)/(arr.length-1))*60, x2 = (ti/(arr.length-1))*60;
                                const y1 = 18 - ((arr[ti-1]/maxTrend)*14) - 2;
                                const y2 = 18 - ((v/maxTrend)*14) - 2;
                                return <line key={ti} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#443DCB" strokeWidth="1.5" strokeLinecap="round"/>;
                              })}
                            </svg>
                          ) : <span style={{ color:txt2 }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {!loading && ideas.length === 0 && !error && (
        <div style={{ textAlign:"center", padding:"40px 20px", color:txt2 }}>
          <div style={{ fontSize:32, marginBottom:12 }}>🔎</div>
          <div style={{ fontSize:13, fontWeight:700, color:txt, marginBottom:8 }}>Enter seed keywords to discover opportunities</div>
          <div style={{ fontSize:12 }}>Get search volume, keyword difficulty, CPC, intent, and 6-month trends for any keyword.</div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// CMO AGENT TAB — Autonomous decision layer
// ─────────────────────────────────────────────────────────────────────────────
function CMOAgentTab({ dark, bg2, bg3, bdr, txt, txt2, clientId, getToken, API }) {
  const [decision, setDecision] = useState(null);
  const [queue,    setQueue]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [running,  setRunning]  = useState(false);
  const [error,    setError]    = useState("");
  const B = "#443DCB";

  async function load() {
    setLoading(true);
    try {
      const token = await getToken();
      const [dRes, qRes] = await Promise.all([
        fetch(`${API}/api/agents/${clientId}/cmo/decision`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/api/agents/${clientId}/cmo/queue`,    { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const [d, q] = await Promise.all([dRes.json(), qRes.json()]);
      setDecision(d?.decision ? d : null);
      setQueue(q?.queue || []);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  async function runCMO() {
    setRunning(true); setError("");
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/agents/${clientId}/cmo/run`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "CMO run failed");
      await load();
    } catch (e) { setError(e.message); }
    setRunning(false);
  }

  useEffect(() => { load(); }, [clientId]);

  const confidenceColor = c => c >= 0.8 ? "#059669" : c >= 0.5 ? "#D97706" : "#DC2626";
  const priorityColor   = p => ({ high:"#DC2626", medium:"#D97706", low:"#059669" })[p] || txt2;

  if (loading) return <div style={{ padding:40, textAlign:"center", color:txt2 }}>Loading CMO analysis...</div>;

  return (
    <div style={{ padding:24, maxWidth:900 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:3 }}>Strategy Layer</div>
          <div style={{ fontSize:20, fontWeight:800, color:txt }}>🧠 CMO Agent</div>
          <div style={{ fontSize:12, color:txt2, marginTop:2 }}>Autonomous decision engine — analyzes all signals and decides what to fix next</div>
        </div>
        <button onClick={runCMO} disabled={running}
          style={{ padding:"10px 20px", borderRadius:8, border:"none", background:B, color:"#fff", fontWeight:700, fontSize:13, cursor:running?"wait":"pointer", opacity:running?0.7:1 }}>
          {running ? "Analyzing..." : decision ? "Re-run Analysis" : "Run CMO Analysis"}
        </button>
      </div>

      {error && <div style={{ color:"#DC2626", fontSize:13, marginBottom:16 }}>{error}</div>}

      {!decision && !running && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:40, textAlign:"center" }}>
          <div style={{ fontSize:32, marginBottom:12 }}>🧠</div>
          <div style={{ fontSize:15, fontWeight:700, color:txt, marginBottom:8 }}>No CMO analysis yet</div>
          <div style={{ fontSize:13, color:txt2 }}>Click "Run CMO Analysis" to let the AI decide what to focus on next.</div>
        </div>
      )}

      {decision && (
        <>
          {/* Decision banner */}
          <div style={{ background:bg2, border:`2px solid ${B}`, borderRadius:12, padding:20, marginBottom:16 }}>
            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:16 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:11, fontWeight:700, color:B, textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Decision</div>
                <div style={{ fontSize:17, fontWeight:800, color:txt, marginBottom:8 }}>{decision.decision}</div>
                <div style={{ fontSize:13, color:txt2, lineHeight:1.6 }}>{decision.reasoning}</div>
              </div>
              <div style={{ textAlign:"center", minWidth:80 }}>
                <div style={{ fontSize:26, fontWeight:800, color:confidenceColor(decision.confidence) }}>
                  {Math.round((decision.confidence || 0) * 100)}%
                </div>
                <div style={{ fontSize:10, color:txt2 }}>Confidence</div>
              </div>
            </div>
            {decision.decidedAt && (
              <div style={{ fontSize:11, color:txt2, marginTop:10, borderTop:`1px solid ${bdr}`, paddingTop:8 }}>
                Last analyzed: {new Date(decision.decidedAt).toLocaleString()}
              </div>
            )}
          </div>

          {/* Next agents */}
          {decision.nextAgents?.length > 0 && (
            <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:16 }}>
              <div style={{ fontSize:12, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:12 }}>Recommended Next Actions</div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {decision.nextAgents.map((a, i) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background:bg3, borderRadius:8 }}>
                    <div style={{ width:22, height:22, borderRadius:"50%", background:B, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800, flexShrink:0 }}>{i+1}</div>
                    <span style={{ fontSize:13, fontWeight:600, color:txt }}>{a.agent || a}</span>
                    {a.reason && <span style={{ fontSize:12, color:txt2 }}>— {a.reason}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* KPI impact */}
          {decision.kpiImpact?.length > 0 && (
            <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:16 }}>
              <div style={{ fontSize:12, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:12 }}>Expected KPI Impact</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:10 }}>
                {decision.kpiImpact.map((k, i) => (
                  <div key={i} style={{ background:bg3, borderRadius:8, padding:"10px 14px" }}>
                    <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", marginBottom:4 }}>{k.kpi}</div>
                    <div style={{ fontSize:13, color:txt }}>{k.expectedChange || k.impact}</div>
                    {k.timeframe && <div style={{ fontSize:11, color:txt2, marginTop:2 }}>{k.timeframe}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Signals */}
          {decision.signals && (
            <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20 }}>
              <div style={{ fontSize:12, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:12 }}>Signals Analyzed</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:8 }}>
                {Object.entries(decision.signals).map(([k, v]) => (
                  <div key={k} style={{ background:bg3, borderRadius:8, padding:"8px 12px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span style={{ fontSize:12, color:txt2 }}>{k.replace(/([A-Z])/g," $1").trim()}</span>
                    <span style={{ fontSize:12, fontWeight:700, color: v === true ? "#DC2626" : v === false ? "#059669" : txt }}>
                      {typeof v === "boolean" ? (v ? "⚠️ Yes" : "✅ No") : String(v)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* CMO Queue */}
      {queue.length > 0 && (
        <div style={{ marginTop:16, background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20 }}>
          <div style={{ fontSize:12, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:12 }}>Scheduled Actions ({queue.length})</div>
          {queue.map((item, i) => (
            <div key={i} style={{ padding:"10px 0", borderBottom: i < queue.length-1 ? `1px solid ${bdr}` : "none", display:"flex", justifyContent:"space-between" }}>
              <div>
                <span style={{ fontSize:13, fontWeight:600, color:txt }}>{item.agentId}</span>
                {item.reason && <span style={{ fontSize:12, color:txt2, marginLeft:8 }}>{item.reason}</span>}
              </div>
              <span style={{ fontSize:11, color:txt2 }}>{item.scheduledFor ? new Date(item.scheduledFor).toLocaleDateString() : "Pending"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVERSION TAB — A19 CRO analysis
// ─────────────────────────────────────────────────────────────────────────────
function ConversionTab({ dark, bg2, bg3, bdr, txt, txt2, clientId, getToken, API }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error,   setError]   = useState("");
  const B = "#443DCB";

  async function load() {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/agents/${clientId}/A19/state`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (res.ok && json.overallCRO != null) setData(json);
    } catch {}
    setLoading(false);
  }

  async function runA19() {
    setRunning(true); setError("");
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/agents/${clientId}/A19/run`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "A19 run failed");
      setData(json);
    } catch (e) { setError(e.message); }
    setRunning(false);
  }

  useEffect(() => { load(); }, [clientId]);

  const croColor = s => s === "good" ? "#059669" : s === "warning" ? "#D97706" : "#DC2626";
  const sevColor = s => ({ critical:"#DC2626", high:"#DC2626", medium:"#D97706", low:"#059669", info:"#0891B2" })[s] || txt2;

  if (loading) return <div style={{ padding:40, textAlign:"center", color:txt2 }}>Loading conversion analysis...</div>;

  return (
    <div style={{ padding:24, maxWidth:900 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:3 }}>Conversion Optimization</div>
          <div style={{ fontSize:20, fontWeight:800, color:txt }}>🎯 CRO Analysis</div>
          <div style={{ fontSize:12, color:txt2, marginTop:2 }}>Landing page, CTA, and form optimization analysis</div>
        </div>
        <button onClick={runA19} disabled={running}
          style={{ padding:"10px 20px", borderRadius:8, border:"none", background:B, color:"#fff", fontWeight:700, fontSize:13, cursor:running?"wait":"pointer", opacity:running?0.7:1 }}>
          {running ? "Analyzing..." : data ? "Re-run Analysis" : "Run CRO Analysis"}
        </button>
      </div>

      {error && <div style={{ color:"#DC2626", fontSize:13, marginBottom:16 }}>{error}</div>}

      {!data && !running && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:40, textAlign:"center" }}>
          <div style={{ fontSize:32, marginBottom:12 }}>🎯</div>
          <div style={{ fontSize:15, fontWeight:700, color:txt, marginBottom:8 }}>No conversion analysis yet</div>
          <div style={{ fontSize:13, color:txt2 }}>Run the analysis to detect CTA gaps, form issues, and conversion blockers.</div>
        </div>
      )}

      {data && (
        <>
          {/* Score banner */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:10, marginBottom:16 }}>
            {[
              { l:"CRO Score",      v: data.overallCRO != null ? `${data.overallCRO}/100` : "—", c: croColor(data.overallCROStatus) },
              { l:"Est. CR Lift",   v: data.estimatedCRLift || "—",  c: "#059669" },
              { l:"Blockers",       v: data.conversionBlockers?.length || 0, c: "#DC2626" },
              { l:"Quick Wins",     v: data.quickWins?.length || 0,          c: "#D97706" },
            ].map(s => (
              <div key={s.l} style={{ background:bg2, border:`1px solid ${bdr}`, borderTop:`3px solid ${s.c}`, borderRadius:10, padding:"12px 14px" }}>
                <div style={{ fontSize:22, fontWeight:800, color:s.c }}>{s.v}</div>
                <div style={{ fontSize:11, color:txt2, marginTop:2 }}>{s.l}</div>
              </div>
            ))}
          </div>

          {/* Conversion blockers */}
          {data.conversionBlockers?.length > 0 && (
            <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:16 }}>
              <div style={{ fontSize:12, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:12 }}>Conversion Blockers</div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {data.conversionBlockers.map((b, i) => (
                  <div key={i} style={{ background:bg3, borderRadius:8, padding:"12px 14px", borderLeft:`3px solid ${sevColor(b.severity)}` }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:4 }}>
                      <span style={{ fontSize:13, fontWeight:700, color:txt }}>{b.issue || b.title}</span>
                      <span style={{ fontSize:10, fontWeight:700, color:sevColor(b.severity), background:sevColor(b.severity)+"18", padding:"2px 7px", borderRadius:6 }}>
                        {(b.severity||"").toUpperCase()}
                      </span>
                    </div>
                    {b.detail && <div style={{ fontSize:12, color:txt2, marginBottom:4 }}>{b.detail}</div>}
                    {b.fix && <div style={{ fontSize:12, color:"#059669", fontWeight:600 }}>Fix: {b.fix}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick wins */}
          {data.quickWins?.length > 0 && (
            <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:16 }}>
              <div style={{ fontSize:12, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:12 }}>Quick Wins</div>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {data.quickWins.map((w, i) => (
                  <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"8px 12px", background:bg3, borderRadius:8 }}>
                    <span style={{ color:"#059669", fontSize:14, flexShrink:0 }}>✅</span>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:txt }}>{w.win || w.title || w}</div>
                      {w.impact && <div style={{ fontSize:12, color:txt2, marginTop:2 }}>Expected impact: {w.impact}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Landing page audit */}
          {data.landingPageAudit && (
            <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20 }}>
              <div style={{ fontSize:12, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:12 }}>Landing Page Audit</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:8 }}>
                {Object.entries(data.landingPageAudit).map(([k, v]) => (
                  <div key={k} style={{ background:bg3, borderRadius:8, padding:"8px 12px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span style={{ fontSize:12, color:txt2 }}>{k.replace(/_/g," ")}</span>
                    <span style={{ fontSize:12, fontWeight:700, color: v === true ? "#059669" : v === false ? "#DC2626" : txt }}>
                      {typeof v === "boolean" ? (v ? "✅" : "❌") : String(v)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// IMPACT REPORT TAB — A20 6-month before/after report
// ─────────────────────────────────────────────────────────────────────────────
function ImpactReportTab({ dark, bg2, bg3, bdr, txt, txt2, clientId, getToken, API }) {
  const [report,  setReport]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const B = "#443DCB";

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API}/api/agents/${clientId}/A20/impact-report`, { headers: { Authorization: `Bearer ${token}` } });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setReport(json.report);
      } catch (e) { setError(e.message); }
      setLoading(false);
    })();
  }, [clientId]);

  const deltaColor = v => v > 0 ? "#059669" : v < 0 ? "#DC2626" : txt2;
  const deltaLabel = v => v > 0 ? `+${v}` : String(v);

  if (loading) return <div style={{ padding:40, textAlign:"center", color:txt2 }}>Building impact report...</div>;
  if (error)   return <div style={{ padding:24, color:"#DC2626", fontSize:13 }}>{error}</div>;
  if (!report) return <div style={{ padding:40, textAlign:"center", color:txt2 }}>No impact data yet — complete at least one pipeline run first.</div>;

  const { executiveSummary, beforeAfter, workCompleted, trafficVisibility, keywordMovement, roi, next3Months } = report;

  return (
    <div style={{ padding:24, maxWidth:900 }}>
      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:3 }}>Impact Report</div>
        <div style={{ fontSize:22, fontWeight:800, color:txt }}>📑 {executiveSummary?.clientName || "Client"} — SEO Impact</div>
        {executiveSummary?.reportPeriod && (
          <div style={{ fontSize:12, color:txt2, marginTop:4 }}>Period: {executiveSummary.reportPeriod}</div>
        )}
      </div>

      {/* Headline + key wins */}
      {executiveSummary && (
        <div style={{ background: `linear-gradient(135deg,${B}22,${B}08)`, border:`1px solid ${B}44`, borderRadius:12, padding:20, marginBottom:16 }}>
          <div style={{ fontSize:16, fontWeight:800, color:txt, marginBottom:10 }}>{executiveSummary.headline}</div>
          {executiveSummary.keyWins?.length > 0 && (
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {executiveSummary.keyWins.map((w, i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, color:txt }}>
                  <span style={{ color:"#059669" }}>✅</span>{w}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Before / After */}
      {beforeAfter && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:16 }}>
          <div style={{ fontSize:12, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:14 }}>Before vs After</div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr style={{ borderBottom:`1px solid ${bdr}` }}>
                  {["Metric","Before","After","Change"].map(h => (
                    <th key={h} style={{ textAlign:"left", padding:"6px 10px", fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(beforeAfter).map(([key, row]) => (
                  <tr key={key} style={{ borderBottom:`1px solid ${bdr}` }}>
                    <td style={{ padding:"8px 10px", color:txt, fontWeight:600 }}>{key.replace(/_/g," ")}</td>
                    <td style={{ padding:"8px 10px", color:txt2 }}>{row.before ?? "—"}</td>
                    <td style={{ padding:"8px 10px", color:txt, fontWeight:700 }}>{row.after ?? "—"}</td>
                    <td style={{ padding:"8px 10px", fontWeight:700, color: deltaColor(row.delta) }}>
                      {row.delta != null ? deltaLabel(row.delta) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Work completed */}
      {workCompleted && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:16 }}>
          <div style={{ fontSize:12, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:12 }}>Work Completed</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:10 }}>
            {[
              { l:"Fixes Pushed",     v: workCompleted.fixesPushed || 0,     c:B },
              { l:"P1 Issues Fixed",  v: workCompleted.p1Fixed || 0,         c:"#059669" },
              { l:"Content Pieces",   v: workCompleted.contentPieces || 0,   c:"#D97706" },
              { l:"Links Built",      v: workCompleted.linksBuilt || 0,      c:"#0891B2" },
              { l:"Pipeline Runs",    v: workCompleted.pipelineRuns || 0,    c:txt2 },
            ].map(s => (
              <div key={s.l} style={{ background:bg3, borderTop:`3px solid ${s.c}`, borderRadius:10, padding:"12px 14px" }}>
                <div style={{ fontSize:22, fontWeight:800, color:s.c }}>{s.v}</div>
                <div style={{ fontSize:11, color:txt2, marginTop:2 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Keyword movement */}
      {keywordMovement && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:16 }}>
          <div style={{ fontSize:12, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:12 }}>Keyword Movement</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:10 }}>
            {[
              { l:"Top 3",     v: keywordMovement.top3    || 0, c:"#059669" },
              { l:"Top 10",    v: keywordMovement.top10   || 0, c:"#D97706" },
              { l:"Top 20",    v: keywordMovement.top20   || 0, c:txt2 },
              { l:"New Rankings", v: keywordMovement.newRankings || 0, c:B },
            ].map(s => (
              <div key={s.l} style={{ background:bg3, borderTop:`3px solid ${s.c}`, borderRadius:10, padding:"12px 14px" }}>
                <div style={{ fontSize:22, fontWeight:800, color:s.c }}>{s.v}</div>
                <div style={{ fontSize:11, color:txt2, marginTop:2 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ROI */}
      {roi && (
        <div style={{ background:`linear-gradient(135deg,#05996922,#05996908)`, border:`1px solid #05996944`, borderRadius:12, padding:20, marginBottom:16 }}>
          <div style={{ fontSize:12, fontWeight:700, color:"#059669", textTransform:"uppercase", letterSpacing:1, marginBottom:12 }}>ROI Estimate</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:12 }}>
            {roi.estimatedRevenue && <div><div style={{ fontSize:22, fontWeight:800, color:"#059669" }}>{roi.estimatedRevenue}</div><div style={{ fontSize:11, color:txt2 }}>Est. Revenue Impact</div></div>}
            {roi.trafficValue     && <div><div style={{ fontSize:22, fontWeight:800, color:"#059669" }}>{roi.trafficValue}</div><div style={{ fontSize:11, color:txt2 }}>Traffic Value</div></div>}
            {roi.summary          && <div style={{ fontSize:13, color:txt, lineHeight:1.6, gridColumn:"1/-1" }}>{roi.summary}</div>}
          </div>
        </div>
      )}

      {/* Next 3 months */}
      {next3Months?.targets?.length > 0 && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20 }}>
          <div style={{ fontSize:12, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:12 }}>Next 3 Months — Targets</div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {next3Months.targets.map((t, i) => (
              <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 12px", background:bg3, borderRadius:8 }}>
                <span style={{ fontSize:13, color:txt }}>{t.kpi || t.metric}</span>
                <span style={{ fontSize:13, fontWeight:700, color:B }}>{t.target}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// LOCAL SEO TAB — NAP Checker, Schema, GBP Signals
// ─────────────────────────────────────────────────────────────────────────────
function LocalSeoTab({ dark, state, client, clientId, getToken, API }) {
  const [liveGeo,    setLiveGeo]    = useState(null);
  const [liveLoading,setLiveLoading]= useState(false);
  const [running,    setRunning]    = useState(false);

  const bg2 = dark ? "#111" : "#fff";
  const bg3 = dark ? "#1a1a1a" : "#f5f5f0";
  const bdr = dark ? "#2a2a2a" : "#e0e0d8";
  const txt = dark ? "#e8e8e8" : "#1a1a18";
  const txt2= dark ? "#777"   : "#888";
  const B   = "#443DCB";

  // Fetch fresh A8 data on mount
  useEffect(() => {
    (async () => {
      if (!clientId || !getToken || !API) return;
      setLiveLoading(true);
      try {
        const token = await getToken();
        const res = await fetch(`${API}/api/agents/${clientId}/A8/data`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) { const d = await res.json(); if (d && !d.error) setLiveGeo(d); }
      } catch {}
      setLiveLoading(false);
    })();
  }, [clientId]);

  async function runA8() {
    if (!clientId || !getToken || !API) return;
    setRunning(true);
    try {
      const token = await getToken();
      await fetch(`${API}/api/agents/${clientId}/A8/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ googleToken: null }),
      });
      // re-fetch after run
      const r2 = await fetch(`${API}/api/agents/${clientId}/A8/data`, { headers: { Authorization: `Bearer ${token}` } });
      if (r2.ok) { const d = await r2.json(); if (d && !d.error) setLiveGeo(d); }
    } catch {}
    setRunning(false);
  }

  // Use live data if available, else fall back to passed state
  const audit  = state?.A2_audit        || {};
  const geo    = liveGeo || state?.A8_geo || {};
  const brief  = state?.A1_brief        || {};

  const url  = client?.website || brief.websiteUrl || "";
  const name = client?.name || brief.businessName || "";

  // Extract signals from A2 audit
  const allIssues = [
    ...(audit.issues?.p1 || []),
    ...(audit.issues?.p2 || []),
    ...(audit.issues?.p3 || []),
  ];
  const hasSchema       = !allIssues.some(i => /schema|structured/i.test(i.type || ""));
  const hasSSL          = audit.checks?.hasSSL !== false;
  const hasMobile       = !allIssues.some(i => /mobile/i.test(i.type || ""));
  const hasLocalSchema  = (audit.checks?.schemaTypes || []).some(t => /local|business|organization|restaurant|hotel/i.test(t));
  const pageSpeed       = audit.checks?.responseTime ? audit.checks.responseTime < 1000 : null;
  const hasSitemap      = audit.checks?.hasSitemap !== false;

  // GBP / Local from A8
  const hasGBP      = geo?.hasGBP      || false;
  const localScore  = geo?.localPresenceScore || null;
  const citations   = geo?.citations   || [];
  const napStatus   = geo?.napConsistency || null;

  const checks = [
    { label:"HTTPS / SSL Certificate",         pass:hasSSL,         icon:"🔒", why:"Google requires HTTPS for all sites. Non-HTTPS sites get ranking penalty." },
    { label:"Mobile-Friendly",                 pass:hasMobile,      icon:"📱", why:"60%+ of local searches happen on mobile. Google uses mobile-first indexing." },
    { label:"Page Speed < 1 second",           pass:pageSpeed,      icon:"⚡", why:"53% of users leave if a page takes >3 seconds. Speed is a direct ranking factor." },
    { label:"XML Sitemap",                     pass:hasSitemap,     icon:"🗺️", why:"Sitemap helps Google discover and index all your pages faster." },
    { label:"Schema Markup (any)",             pass:hasSchema,      icon:"🏷️", why:"Schema tells Google what your business is, location, hours, and services." },
    { label:"LocalBusiness Schema",            pass:hasLocalSchema, icon:"🏢", why:"LocalBusiness schema directly boosts Local Pack rankings and rich snippets." },
    { label:"Google Business Profile",         pass:hasGBP,         icon:"📍", why:"GBP is the #1 factor for appearing in Google Maps and Local Pack results." },
    { label:"NAP Consistency",                 pass:!!napStatus,    icon:"📋", why:"Name, Address, Phone must be identical across all directories and your website." },
  ];

  const passCount = checks.filter(c => c.pass === true).length;
  const score     = Math.round((passCount / checks.length) * 100);
  const scoreColor= score >= 70 ? "#059669" : score >= 40 ? "#D97706" : "#DC2626";

  const LOCAL_DIRECTORIES = [
    "Google Business Profile", "Bing Places", "Apple Maps",
    "Yelp", "TripAdvisor", "Facebook Business", "Yell.com",
    "Thomson Local", "Checkatrade", "Trustpilot",
  ];

  if (liveLoading) return <div style={{ padding:40, textAlign:"center", color:txt2 }}>Loading Local SEO data...</div>;

  return (
    <div>
      {/* Run A8 banner if no geo data */}
      {!geo?.localPresenceScore && !geo?.hasGBP && !geo?.citations?.length && (
        <div style={{ background:`${B}0a`, border:`1px solid ${B}28`, borderRadius:10, padding:"14px 18px", marginBottom:16, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:B, marginBottom:3 }}>Run Local SEO Agent (A8) for live data</div>
            <div style={{ fontSize:12, color:txt2 }}>Checks Google Business Profile, NAP consistency, Knowledge Graph, and local signals.</div>
          </div>
          <button onClick={runA8} disabled={running} style={{ padding:"8px 18px", borderRadius:8, border:"none", background:B, color:"#fff", fontSize:12, fontWeight:700, cursor:running?"not-allowed":"pointer", opacity:running?0.7:1, flexShrink:0 }}>
            {running ? "⏳ Running..." : "▶ Run A8 Local Agent"}
          </button>
        </div>
      )}

      {/* Score Overview */}
      <div style={{ display:"grid", gridTemplateColumns:"auto 1fr", gap:20, background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:"20px 24px", marginBottom:20, alignItems:"center" }}>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:52, fontWeight:900, color:scoreColor, lineHeight:1 }}>{score}</div>
          <div style={{ fontSize:11, color:txt2, marginTop:4 }}>Local SEO Score</div>
          <div style={{ fontSize:11, fontWeight:700, color:scoreColor, marginTop:2 }}>{score >= 70 ? "Good" : score >= 40 ? "Needs Work" : "Poor"}</div>
        </div>
        <div>
          <div style={{ fontSize:14, fontWeight:700, color:txt, marginBottom:6, display:"flex", alignItems:"center", gap:10 }}>
            🏪 Local SEO Health Check — {name || url}
            <button onClick={runA8} disabled={running} style={{ padding:"4px 12px", borderRadius:6, border:`1px solid ${bdr}`, background:"transparent", color:txt2, fontSize:11, cursor:running?"not-allowed":"pointer", opacity:running?0.7:1 }}>
              {running ? "⏳" : "↻ Refresh"}
            </button>
          </div>
          <div style={{ fontSize:12, color:txt2, lineHeight:1.7, marginBottom:10 }}>
            {score >= 70
              ? "Your local SEO foundation is strong. Focus on building more citations and reviews."
              : score >= 40
              ? "Several important local SEO signals are missing. Address the failed checks below to improve Local Pack rankings."
              : "Critical local SEO issues detected. Without these basics, your site will struggle to appear in Google Maps or Local Pack results."}
          </div>
          <div style={{ display:"flex", gap:16 }}>
            <span style={{ fontSize:12, color:"#059669", fontWeight:700 }}>✅ {passCount} passing</span>
            <span style={{ fontSize:12, color:"#DC2626", fontWeight:700 }}>❌ {checks.length - passCount} failing</span>
          </div>
        </div>
      </div>

      {/* Checks */}
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:12, fontWeight:700, color:txt, marginBottom:10 }}>Local SEO Checks</div>
        <div style={{ display:"grid", gap:8 }}>
          {checks.map(c => {
            const statusColor = c.pass === true ? "#059669" : c.pass === false ? "#DC2626" : "#6B7280";
            const statusBg    = c.pass === true ? "#05966911" : c.pass === false ? "#DC262611" : "#6B728011";
            return (
              <div key={c.label} style={{ background:bg2, border:`1px solid ${bdr}`, borderLeft:`4px solid ${statusColor}`, borderRadius:8, padding:"10px 14px", display:"flex", alignItems:"center", gap:12 }}>
                <span style={{ fontSize:16, flexShrink:0 }}>{c.icon}</span>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:12, fontWeight:700, color:txt }}>{c.label}</span>
                    <span style={{ padding:"2px 8px", borderRadius:8, background:statusBg, color:statusColor, fontSize:10, fontWeight:700 }}>
                      {c.pass === true ? "✓ Pass" : c.pass === false ? "✗ Fail" : "? Unknown"}
                    </span>
                  </div>
                  {c.pass !== true && (
                    <div style={{ fontSize:11, color:txt2, marginTop:3 }}>{c.why}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Citation Checklist */}
      <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"16px 20px", marginBottom:16 }}>
        <div style={{ fontSize:12, fontWeight:700, color:txt, marginBottom:12 }}>📂 Local Directory Checklist</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(200px, 1fr))", gap:8 }}>
          {LOCAL_DIRECTORIES.map(d => {
            const found = citations.some(c => c.name?.toLowerCase().includes(d.toLowerCase()));
            return (
              <div key={d} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px", borderRadius:8, background:found?"#05966911":bg3, border:`1px solid ${found?"#05966933":bdr}` }}>
                <span style={{ color:found?"#059669":"#888", fontSize:14, flexShrink:0 }}>{found ? "✅" : "☐"}</span>
                <span style={{ fontSize:12, color:found?"#059669":txt2, fontWeight:found?600:400 }}>{d}</span>
              </div>
            );
          })}
        </div>
        {citations.length === 0 && (
          <div style={{ fontSize:11, color:txt2, marginTop:10 }}>
            Run the pipeline to detect your existing citations automatically. Then manually verify listings you haven't claimed yet.
          </div>
        )}
      </div>

      {/* Action Plan */}
      <div style={{ background:"#443DCB11", border:"1px solid #443DCB33", borderRadius:10, padding:"14px 18px" }}>
        <div style={{ fontSize:12, fontWeight:700, color:"#443DCB", marginBottom:10 }}>🎯 Local SEO Action Plan</div>
        <ol style={{ margin:0, paddingLeft:18, fontSize:12, color:txt, lineHeight:2 }}>
          {!hasGBP      && <li><strong>Create/claim Google Business Profile</strong> — go to business.google.com</li>}
          {!hasLocalSchema && <li><strong>Add LocalBusiness schema markup</strong> — include name, address, phone, hours, geo-coordinates</li>}
          {!hasSchema   && <li><strong>Add schema.org markup</strong> to your homepage</li>}
          {!hasMobile   && <li><strong>Fix mobile usability</strong> — use Google Search Console Mobile Usability report</li>}
          {!pageSpeed   && <li><strong>Improve page speed</strong> — aim for &lt;1 second TTFB</li>}
          <li><strong>Build citations</strong> — list in all directories above that are unchecked</li>
          <li><strong>Get reviews</strong> — ask every client to leave a Google review</li>
          <li><strong>Add NAP to footer</strong> — identical Name, Address, Phone on every page</li>
          <li><strong>Create location pages</strong> — one page per city/area you serve</li>
        </ol>
      </div>
    </div>
  );
}

// ── A11 Link Building View ────────────────────────────────────────────────────
function LinkBuildingView({ lb, dark, bg2, bg3, bdr, txt, txt2 }) {
  if (!lb) return (
    <div style={{ padding:40, textAlign:"center", color:txt2 }}>
      <div style={{ fontSize:40, marginBottom:12 }}>🔗</div>
      <div style={{ fontSize:15, fontWeight:700, color:txt, marginBottom:8 }}>No link building data yet</div>
      <div style={{ fontSize:13, color:txt2 }}>Run A11 Link Builder from the Pipeline tab to generate opportunities.</div>
    </div>
  );

  const typeColor = {
    directory:     "#443DCB",
    guest_post:    "#059669",
    resource_page: "#0891B2",
    broken_link:   "#D97706",
    pr:            "#9333EA",
    partnership:   "#DC2626",
  };
  const typeLabel = {
    directory:     "Directory",
    guest_post:    "Guest Post",
    resource_page: "Resource Page",
    broken_link:   "Broken Link",
    pr:            "PR / HARO",
    partnership:   "Partnership",
  };
  const difficultyColor = { easy:"#059669", medium:"#D97706", hard:"#DC2626" };
  const priorityBg      = { high:"#DC262611", medium:"#D9770611", low:"#6B728011" };
  const priorityColor   = { high:"#DC2626",   medium:"#D97706",   low:"#6B7280" };

  const opportunities = lb.opportunities || [];
  const quickWins     = lb.quickWins     || [];

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

      {/* Summary bar */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:10 }}>
        {[
          { label:"Total Opportunities", value: opportunities.length,                               color:"#443DCB" },
          { label:"High Priority",        value: opportunities.filter(o=>o.priority==="high").length,  color:"#DC2626" },
          { label:"Easy Wins",            value: opportunities.filter(o=>o.difficulty==="easy").length,color:"#059669" },
          { label:"Quick Wins",           value: quickWins.length,                                   color:"#D97706" },
        ].map(s => (
          <div key={s.label} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"14px 16px", textAlign:"center" }}>
            <div style={{ fontSize:26, fontWeight:800, color:s.color }}>{s.value}</div>
            <div style={{ fontSize:11, color:txt2, marginTop:2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Summary */}
      {lb.summary && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"14px 16px", fontSize:13, color:txt, lineHeight:1.6 }}>
          {lb.summary}
        </div>
      )}

      {/* Quick Wins */}
      {quickWins.length > 0 && (
        <div style={{ background:"#05966910", border:"1px solid #05966933", borderRadius:10, padding:"14px 16px" }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#059669", marginBottom:8 }}>⚡ Quick Wins — Do These First</div>
          {quickWins.map((w, i) => (
            <div key={i} style={{ fontSize:12, color:txt, padding:"4px 0", display:"flex", gap:8, alignItems:"flex-start" }}>
              <span style={{ color:"#059669", fontWeight:700, flexShrink:0 }}>{i+1}.</span>{w}
            </div>
          ))}
        </div>
      )}

      {/* Opportunities list */}
      <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, overflow:"hidden" }}>
        <div style={{ padding:"10px 16px", background:bg3, borderBottom:`1px solid ${bdr}`, fontSize:12, fontWeight:700, color:txt }}>
          All Opportunities ({opportunities.length})
        </div>
        {opportunities.map((opp, i) => (
          <div key={i} style={{ padding:"14px 16px", borderBottom:`1px solid ${bdr}22`, display:"flex", flexDirection:"column", gap:6 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
              <span style={{ fontSize:12, fontWeight:700, color:txt, flex:1 }}>{opp.target}</span>
              <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:`${typeColor[opp.type] || "#443DCB"}18`, color:typeColor[opp.type] || "#443DCB", fontWeight:600 }}>
                {typeLabel[opp.type] || opp.type}
              </span>
              <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:priorityBg[opp.priority] || "#6B728011", color:priorityColor[opp.priority] || "#6B7280", fontWeight:600 }}>
                {opp.priority} priority
              </span>
              <span style={{ fontSize:10, color:difficultyColor[opp.difficulty] || "#D97706", fontWeight:600 }}>
                {opp.difficulty}
              </span>
            </div>
            <div style={{ fontSize:12, color:txt2, lineHeight:1.5 }}>
              <strong style={{ color:txt }}>Approach:</strong> {opp.approach}
            </div>
            {opp.emailSubjectLine && opp.emailSubjectLine !== "N/A — self-serve" && (
              <div style={{ fontSize:11, color:"#443DCB", background:"#443DCB0D", borderRadius:6, padding:"5px 8px", fontFamily:"monospace" }}>
                Subject: {opp.emailSubjectLine}
              </div>
            )}
            <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
              {opp.domainAuthority && (
                <span style={{ fontSize:10, color:txt2 }}>DA: <strong style={{ color:txt }}>{opp.domainAuthority}</strong></span>
              )}
              {opp.estimatedTimeToSecure && (
                <span style={{ fontSize:10, color:txt2 }}>Time: <strong style={{ color:txt }}>{opp.estimatedTimeToSecure}</strong></span>
              )}
              {opp.url && (
                <a href={opp.url.startsWith("http") ? opp.url : `https://${opp.url}`} target="_blank" rel="noreferrer"
                  style={{ fontSize:10, color:"#443DCB", textDecoration:"none" }}>
                  🔗 Visit site
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
