import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

const B = "#443DCB";

// ── What happens after approval — per item type ────────────────────────
const OUTCOMES = {
  homepage_optimisation: {
    icon: "🏠",
    title: "Homepage will be optimised",
    steps: [
      { icon: "⚡", text: "Title tag, meta description & H1 update immediately on your website" },
      { icon: "🤖", text: "Google re-crawls your homepage within 3–14 days" },
      { icon: "📈", text: "CTR improvement visible in Search Console within 2–4 weeks" },
      { icon: "🎯", text: "Your target keywords appear in the most visible parts of your page" },
    ],
    nextStep: "Monitor Google Search Console → Performance after 2 weeks to track CTR change.",
    timeline: "Live in minutes · Results in 2–4 weeks",
    timelineColor: "#059669",
  },
  new_page_brief: {
    icon: "📄",
    title: "New page brief goes to content queue",
    steps: [
      { icon: "📝", text: "Brief is queued for your content writer with full SEO instructions" },
      { icon: "🔍", text: "New page will target the approved keyword with optimised structure" },
      { icon: "🚀", text: "Once published, Google indexes the page within 1–7 days" },
      { icon: "📊", text: "New ranking opportunity — keyword visibility starts building after 4–8 weeks" },
    ],
    nextStep: "Review the draft when submitted, then publish. Track rankings in Rank Tracker after 4 weeks.",
    timeline: "Draft in 3–5 days · Rankings in 4–8 weeks",
    timelineColor: "#0891B2",
  },
  client_report: {
    icon: "📊",
    title: "Report is finalised and ready to share",
    steps: [
      { icon: "✅", text: "Report is locked — verdict and action plan are confirmed" },
      { icon: "📄", text: "Export as PDF from the Report tab and share with your client" },
      { icon: "💬", text: "Client sees health score, issues summary, and top 3 priority actions" },
      { icon: "🔄", text: "Next auto-analysis scheduled in 30 days to track progress" },
    ],
    nextStep: "Go to Report tab → Export PDF → Send to client.",
    timeline: "Available immediately as PDF",
    timelineColor: "#443DCB",
  },
};

// ── Error / status explanation map ────────────────────────────────────
const STATUS_INFO = {
  revision_requested: {
    icon: "✏️",
    label: "Revision Requested",
    color: "#D97706",
    explanation: "You sent feedback to the AI. It will regenerate this item with your instructions applied.",
    actions: ["The AI will produce a new version within ~30 seconds of re-processing.", "Once the new version is ready, it will appear back here as Pending Review.", "If you don't see a new version, re-run the agent from the Pipeline tab."],
  },
  rejected: {
    icon: "❌",
    label: "Rejected",
    color: "#DC2626",
    explanation: "This item was rejected and will NOT be deployed to your website.",
    actions: ["To get a new version, go to Pipeline tab → find the agent (A5 or A9) → click Re-run.", "The AI will generate a completely fresh version for review.", "Your original content on the website is unchanged — nothing was modified."],
  },
  approved: {
    icon: "✅",
    label: "Approved & Live",
    color: "#059669",
    explanation: "This was approved and the changes are now live on your website.",
    actions: ["Check your website to confirm the changes are visible.", "Allow 3–14 days for Google to re-crawl and index the updated content.", "Monitor performance in Google Search Console → Performance tab."],
  },
};

// ── Impact badges per type ─────────────────────────────────────────────
function getImpact(type) {
  return {
    homepage_optimisation: { label: "High Impact", color: "#DC2626", desc: "Affects every visitor and Google's first impression" },
    new_page_brief:        { label: "Medium Impact", color: "#D97706", desc: "Creates a new ranking opportunity for a target keyword" },
    client_report:         { label: "Reporting",  color: B,          desc: "No site changes — documentation and strategy only" },
  }[type] || { label: "Unknown", color: "#6B7280", desc: "" };
}

export default function ApprovalQueue({ dark, clientId }) {
  const { user, API } = useAuth();
  const [items,        setItems]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [acting,       setActing]       = useState(null);
  const [expanded,     setExpanded]     = useState(null);
  const [showOutcome,  setShowOutcome]  = useState({});
  const [showStatus,   setShowStatus]   = useState(null);
  const [revising,     setRevising]     = useState(null);
  const [feedback,     setFeedback]     = useState({});
  const [undoQueue,    setUndoQueue]    = useState({});
  const [selected,     setSelected]     = useState(new Set());
  const [justApproved, setJustApproved] = useState({});
  // CMO decisions
  const [decisions,    setDecisions]    = useState([]);
  const [actingDec,    setActingDec]    = useState(null);
  const [activeTab,    setActiveTab]    = useState("approvals"); // "approvals" | "cmo" | "verification"
  // Fix verification
  const [verifications, setVerifications] = useState([]);
  const [verifyStats,   setVerifyStats]   = useState(null);
  // A23 Investigations
  const [investigations, setInvestigations] = useState([]);
  const [approvingInv,   setApprovingInv]   = useState(null);

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
    const token = await getToken();
    const [appRes, decRes, verRes, invRes] = await Promise.all([
      fetch(`${API}/api/agents/${clientId}/approvals`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API}/api/agents/${clientId}/cmo-decisions`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API}/api/agents/${clientId}/fix-verification`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API}/api/agents/${clientId}/A23/investigations`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
    ]);
    const appData = await appRes.json();
    const decData = await decRes.json().catch(() => ({}));
    const verData = await verRes.json().catch(() => ({}));
    const invData = invRes ? await invRes.json().catch(() => ({})) : {};
    setItems(appData.items || []);
    setDecisions(decData.decisions || []);
    setVerifications(verData.fixes || []);
    setVerifyStats(verData.stats || null);
    setInvestigations(invData.investigations || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [clientId]);

  async function act(itemId, action, type) {
    setActing(itemId);
    const token = await getToken();
    await fetch(`${API}/api/agents/${clientId}/approvals/${itemId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action }),
    });
    if (action === "approve") {
      // Show post-approval outcome immediately
      setJustApproved(prev => ({ ...prev, [itemId]: OUTCOMES[type] || OUTCOMES.client_report }));
      // 5-minute undo window countdown
      let sec = 300;
      setUndoQueue(prev => ({ ...prev, [itemId]: sec }));
      const timer = setInterval(() => {
        sec--;
        setUndoQueue(prev => ({ ...prev, [itemId]: sec }));
        if (sec <= 0) { clearInterval(timer); setUndoQueue(prev => { const n={...prev}; delete n[itemId]; return n; }); }
      }, 1000);
    }
    await load();
    setActing(null);
    setSelected(prev => { const n = new Set(prev); n.delete(itemId); return n; });
  }

  async function batchApprove() {
    for (const id of selected) {
      const item = items.find(i => i.id === id);
      if (item) await act(id, "approve", item.type);
    }
    setSelected(new Set());
  }

  async function requestRevision(itemId) {
    setActing(itemId);
    const token = await getToken();
    await fetch(`${API}/api/agents/${clientId}/approvals/${itemId}/revision`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ feedback: feedback[itemId] || "" }),
    });
    setRevising(null);
    setFeedback(f => ({ ...f, [itemId]: "" }));
    await load();
    setActing(null);
  }

  async function actOnDecision(decisionId, action) {
    setActingDec(decisionId);
    const token = await getToken();
    await fetch(`${API}/api/agents/${clientId}/cmo-decisions/${decisionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action }),
    });
    await load();
    setActingDec(null);
  }

  const typeLabel = { homepage_optimisation: "Homepage Optimisation", new_page_brief: "New Page Brief", client_report: "Client Report" };
  const typeIcon  = { homepage_optimisation: "🏠", new_page_brief: "📄", client_report: "📊" };

  const pending  = items.filter(i => ["pending", "revision_requested"].includes(i.status));
  const reviewed = items.filter(i => !["pending", "revision_requested"].includes(i.status));

  const pendingDecisions = decisions.filter(d => d.status === "pending");
  const reviewedDecisions = decisions.filter(d => d.status !== "pending");

  if (loading) return <div style={{ padding: 24, color: txt3 }}>Loading approvals...</div>;

  return (
    <div style={{ padding: 24, background: bg }}>

      {/* ── Header ────────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: txt, marginBottom: 4 }}>✅ Approval Queue</div>
        <div style={{ fontSize: 12, color: txt2 }}>
          Review AI-generated changes, CMO strategic decisions, and verify past fix outcomes.
        </div>
      </div>

      {/* ── Tabs ──────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: `1px solid ${bdr}`, paddingBottom: 0 }}>
        {[
          { id: "approvals",       label: `Content Approvals (${pending.length})` },
          { id: "cmo",             label: `CMO Decisions (${pendingDecisions.length})` },
          { id: "investigations",  label: `🔍 Investigations (${investigations.filter(i => i.status === "pending").length})` },
          { id: "verification",    label: `Fix Outcomes${verifyStats ? ` (${verifyStats.successRate ?? "?"}% success)` : ""}` },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: "8px 16px", border: "none", borderRadius: "8px 8px 0 0",
            background: activeTab === t.id ? bg2 : "transparent",
            color: activeTab === t.id ? B : txt2,
            fontWeight: activeTab === t.id ? 700 : 400,
            fontSize: 12, cursor: "pointer",
            borderBottom: activeTab === t.id ? `2px solid ${B}` : "2px solid transparent",
          }}>{t.label}</button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════
          TAB: CMO DECISIONS
          ════════════════════════════════════════════════════ */}
      {activeTab === "cmo" && (
        <div>
          {pendingDecisions.length === 0 && reviewedDecisions.length === 0 && (
            <div style={{ textAlign: "center", padding: 48, background: bg2, border: `1px solid ${bdr}`, borderRadius: 12 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🧠</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: txt, marginBottom: 8 }}>No CMO decisions yet</div>
              <div style={{ fontSize: 12, color: txt2 }}>Run the CMO Agent from the Pipeline tab to generate strategic decisions.</div>
            </div>
          )}

          {pendingDecisions.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#D97706", marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>
                Awaiting Your Approval ({pendingDecisions.length})
              </div>
              {pendingDecisions.map(dec => (
                <div key={dec.id} style={{ background: bg2, border: `1px solid ${bdr}`, borderLeft: `4px solid ${B}`, borderRadius: 12, padding: 20, marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: txt, marginBottom: 6 }}>🧠 {dec.decision}</div>
                      <div style={{ fontSize: 11, color: txt2, lineHeight: 1.6, marginBottom: 10 }}>{dec.reasoning}</div>
                    </div>
                    <div style={{ fontSize: 11, padding: "3px 10px", borderRadius: 10, background: `${B}18`, color: B, fontWeight: 700, flexShrink: 0, marginLeft: 12 }}>
                      {Math.round((dec.confidence || 0) * 100)}% confidence
                    </div>
                  </div>

                  {/* Agents to trigger */}
                  {(dec.nextAgents || []).length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 10, color: txt2, fontWeight: 700, marginBottom: 6 }}>WILL TRIGGER</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {dec.nextAgents.map(a => (
                          <span key={a} style={{ fontSize: 11, padding: "3px 10px", background: "#05966918", color: "#059669", borderRadius: 8, fontWeight: 700 }}>{a}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* KPI impact */}
                  {(dec.kpiImpact || []).map((k, i) => (
                    <div key={i} style={{ fontSize: 11, color: txt2, padding: "6px 10px", background: bg3, borderRadius: 8, marginBottom: 6, borderLeft: `3px solid ${B}` }}>
                      <span style={{ color: B, fontWeight: 700 }}>{k.kpi}: </span>
                      <span style={{ color: "#059669", fontWeight: 700 }}>{k.expectedLift}</span>
                      {k.mechanism && <span> — {k.mechanism}</span>}
                    </div>
                  ))}

                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button onClick={() => actOnDecision(dec.id, "reject")} disabled={actingDec === dec.id}
                      style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#DC2626", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      ❌ Reject
                    </button>
                    <button onClick={() => actOnDecision(dec.id, "approve")} disabled={actingDec === dec.id}
                      style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#059669,#047857)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", boxShadow: "0 2px 8px #05966944" }}>
                      {actingDec === dec.id ? "⏳ Triggering..." : "✅ Approve & Run Agents"}
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}

          {reviewedDecisions.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: txt2, marginBottom: 12, marginTop: 28, textTransform: "uppercase", letterSpacing: 1 }}>
                Past Decisions ({reviewedDecisions.length})
              </div>
              {reviewedDecisions.map(dec => (
                <div key={dec.id} style={{ background: bg2, border: `1px solid ${bdr}`, borderLeft: `4px solid ${dec.status === "approved" ? "#059669" : "#DC2626"}`, borderRadius: 10, padding: 14, marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 12, color: txt, fontWeight: 600 }}>{dec.decision}</div>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: dec.status === "approved" ? "#05966918" : "#DC262618", color: dec.status === "approved" ? "#059669" : "#DC2626", fontWeight: 700 }}>
                      {dec.status === "approved" ? "✅ Approved" : "❌ Rejected"}
                    </span>
                  </div>
                  {(dec.nextAgents || []).length > 0 && dec.status === "approved" && (
                    <div style={{ fontSize: 11, color: txt2, marginTop: 4 }}>Triggered: {dec.nextAgents.join(", ")}</div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════
          TAB: A23 INVESTIGATIONS
          ════════════════════════════════════════════════════ */}
      {activeTab === "investigations" && (
        <div>
          {investigations.length === 0 ? (
            <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 40, textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: txt, marginBottom: 6 }}>No investigations yet</div>
              <div style={{ fontSize: 12, color: txt2 }}>When P1 alerts are detected, the Investigation Agent automatically diagnoses the root cause and proposes a fix here.</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {investigations.map((inv, i) => {
                const diag     = inv.diagnosis     || {};
                const fix      = inv.proposedFix   || {};
                const alertInv = inv.alert         || {};
                const urgColor = fix.urgency === "critical" ? "#DC2626" : fix.urgency === "high" ? "#D97706" : "#0891B2";
                const catColor = diag.category === "technical" ? "#DC2626" : diag.category === "competitor" ? "#D97706" : diag.category === "on_page" ? "#0891B2" : "#6B7280";

                return (
                  <div key={inv.id || i} style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, overflow: "hidden" }}>
                    {/* Alert header */}
                    <div style={{ padding: "14px 20px", background: urgColor + "0c", borderBottom: `1px solid ${bdr}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: urgColor + "18", color: urgColor, textTransform: "uppercase" }}>
                            {alertInv.tier || "P1"} · {fix.urgency || "high"}
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: catColor + "18", color: catColor, textTransform: "uppercase" }}>
                            {diag.category || "unknown"}
                          </span>
                          <span style={{ fontSize: 10, color: txt2 }}>
                            {inv.status === "pending" ? "Awaiting approval" : inv.status}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: txt }}>{(alertInv.type || "").replace(/_/g, " ")}</div>
                      </div>
                      {inv.createdAt && (
                        <div style={{ fontSize: 10, color: txt2, flexShrink: 0 }}>
                          {new Date(inv.createdAt).toLocaleDateString()}
                        </div>
                      )}
                    </div>

                    <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
                      {/* Root cause */}
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: txt2, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Root Cause</div>
                        <div style={{ fontSize: 12, color: txt, lineHeight: 1.6, padding: "10px 14px", background: bg3, borderRadius: 8 }}>
                          {diag.rootCause || "Investigating..."}
                        </div>
                        {diag.evidence?.length > 0 && (
                          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                            {diag.evidence.slice(0, 4).map((e, j) => (
                              <span key={j} style={{ fontSize: 10, padding: "2px 8px", background: bg3, border: `1px solid ${bdr}`, borderRadius: 6, color: txt2 }}>{e}</span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Proposed fix */}
                      <div style={{ padding: "12px 16px", background: "#05966910", border: "1px solid #05966930", borderRadius: 8 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#059669", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                          Proposed Fix — {fix.agent ? `Run ${fix.agent}` : ""}
                        </div>
                        <div style={{ fontSize: 12, color: txt, lineHeight: 1.6 }}>{fix.action || "See alert for suggested fix."}</div>
                        {fix.estimatedImpact && (
                          <div style={{ fontSize: 11, color: "#059669", marginTop: 6, fontWeight: 600 }}>→ {fix.estimatedImpact}</div>
                        )}
                      </div>

                      {/* Confidence */}
                      {diag.confidence != null && (
                        <div style={{ fontSize: 11, color: txt2 }}>
                          Diagnosis confidence: <span style={{ fontWeight: 700, color: diag.confidence > 0.8 ? "#059669" : "#D97706" }}>{Math.round(diag.confidence * 100)}%</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════
          TAB: FIX VERIFICATION OUTCOMES
          ════════════════════════════════════════════════════ */}
      {activeTab === "verification" && (
        <div>
          {/* Stats bar */}
          {verifyStats && verifyStats.total > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 20 }}>
              {[
                { label: "Total Fixes Tracked", value: verifyStats.total, color: txt },
                { label: "Pending Check (21d)", value: verifyStats.pending, color: "#D97706" },
                { label: "Confirmed Improved", value: verifyStats.improved, color: "#059669" },
                { label: "Success Rate",        value: verifyStats.successRate != null ? `${verifyStats.successRate}%` : "—", color: B },
              ].map(s => (
                <div key={s.label} style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: txt2, marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {verifications.length === 0 && (
            <div style={{ textAlign: "center", padding: 48, background: bg2, border: `1px solid ${bdr}`, borderRadius: 12 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🔬</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: txt, marginBottom: 8 }}>No fixes tracked yet</div>
              <div style={{ fontSize: 12, color: txt2 }}>When fixes are pushed to WordPress via A13, they are automatically queued for a 21-day outcome check. Results appear here.</div>
            </div>
          )}

          {verifications.map(fix => {
            const outcomeColor = fix.outcome === "improved" ? "#059669" : fix.outcome === "degraded" ? "#DC2626" : fix.outcome === "no_change" ? "#D97706" : txt2;
            const outcomeIcon  = fix.outcome === "improved" ? "📈" : fix.outcome === "degraded" ? "📉" : fix.outcome === "no_change" ? "➡️" : "⏳";
            const outcomeLabel = fix.outcome === "improved" ? "Improved" : fix.outcome === "degraded" ? "Degraded" : fix.outcome === "no_change" ? "No Change" : `Check due ${new Date(fix.checkAfter).toLocaleDateString()}`;

            return (
              <div key={fix.id} style={{ background: bg2, border: `1px solid ${bdr}`, borderLeft: `4px solid ${outcomeColor}`, borderRadius: 10, padding: 14, marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: txt, marginBottom: 4 }}>{fix.field} — {fix.wpPostTitle || fix.wpPostUrl}</div>
                    <div style={{ fontSize: 11, color: txt2, marginBottom: 6 }}>
                      Pushed: {fix.pushedAt ? new Date(fix.pushedAt).toLocaleDateString() : "—"} · Issue: {fix.issueType}
                    </div>
                    {fix.oldValue && fix.newValue && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
                        <div style={{ fontSize: 10, padding: "4px 8px", background: "#DC262608", borderRadius: 6, color: txt2 }}>
                          <span style={{ color: "#DC2626", fontWeight: 700 }}>Before: </span>{String(fix.oldValue).slice(0, 80)}
                        </div>
                        <div style={{ fontSize: 10, padding: "4px 8px", background: "#05966908", borderRadius: 6, color: txt2 }}>
                          <span style={{ color: "#059669", fontWeight: 700 }}>After: </span>{String(fix.newValue).slice(0, 80)}
                        </div>
                      </div>
                    )}
                    {fix.gscResult && (
                      <div style={{ fontSize: 11, color: txt2 }}>
                        CTR: {(fix.gscResult.ctrBefore * 100).toFixed(1)}% → {(fix.gscResult.ctrAfter * 100).toFixed(1)}%
                        {fix.gscResult.posBefore && ` · Position: ${fix.gscResult.posBefore?.toFixed(1)} → ${fix.gscResult.posAfter?.toFixed(1)}`}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 12, padding: "4px 12px", borderRadius: 8, background: `${outcomeColor}18`, color: outcomeColor, fontWeight: 700, flexShrink: 0, marginLeft: 12 }}>
                    {outcomeIcon} {outcomeLabel}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ════════════════════════════════════════════════════
          TAB: CONTENT APPROVALS (original)
          ════════════════════════════════════════════════════ */}
      {activeTab === "approvals" && <>

      {/* ── Empty state ───────────────────────────────────── */}
      {pending.length === 0 && reviewed.length === 0 && (
        <div style={{ textAlign: "center", padding: 48, background: bg2, border: `1px solid ${bdr}`, borderRadius: 12 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: txt, marginBottom: 8 }}>No items waiting for review</div>
          <div style={{ fontSize: 12, color: txt2, maxWidth: 360, margin: "0 auto" }}>
            Items appear here after AI agents A5 (Content) and A9 (Report) complete. Run the full pipeline to generate content for review.
          </div>
        </div>
      )}

      {/* ── Batch Approve bar ─────────────────────────────── */}
      {selected.size > 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: `${B}12`, border: `1px solid ${B}44`, borderRadius: 10, marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: B, fontWeight: 700 }}>{selected.size} item{selected.size > 1 ? "s" : ""} selected</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setSelected(new Set())} style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${bdr}`, background: "transparent", color: txt2, fontSize: 11, cursor: "pointer" }}>Clear</button>
            <button onClick={batchApprove} style={{ padding: "6px 16px", borderRadius: 8, border: "none", background: "#059669", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              ✅ Approve All Selected
            </button>
          </div>
        </div>
      )}

      {/* ── Pending items ─────────────────────────────────── */}
      {pending.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#D97706", marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>
            ⏳ Waiting for Your Review ({pending.length})
          </div>

          {pending.map(item => {
            const outcome = OUTCOMES[item.type] || OUTCOMES.client_report;
            const impact  = getImpact(item.type);
            const isShowingOutcome = showOutcome[item.id];
            const statusMeta = STATUS_INFO[item.status];
            const isSelected = selected.has(item.id);

            return (
              <div key={item.id} style={{
                background: bg2, border: `1px solid ${isSelected ? B : bdr}`,
                borderLeft: `4px solid ${isSelected ? B : "#D97706"}`,
                borderRadius: 12, padding: 20, marginBottom: 14,
                boxShadow: isSelected ? `0 0 0 2px ${B}33` : "none",
              }}>

                {/* ── Item header ─────────────────────────── */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    {/* Checkbox for batch */}
                    <input type="checkbox" checked={isSelected}
                      onChange={() => setSelected(prev => { const n = new Set(prev); n.has(item.id) ? n.delete(item.id) : n.add(item.id); return n; })}
                      style={{ marginTop: 2, cursor: "pointer", accentColor: B }} />
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 15 }}>{typeIcon[item.type] || "📋"}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: txt }}>{typeLabel[item.type] || item.type}</span>
                        <span style={{ fontSize: 10, color: txt2 }}>Agent: {item.agent}</span>
                        {/* Impact badge */}
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: `${impact.color}18`, color: impact.color, fontWeight: 700 }}>{impact.label}</span>
                        {/* Status badge — clickable for explanation */}
                        {item.status === "revision_requested" && (
                          <span
                            onClick={() => setShowStatus(showStatus === item.id ? null : item.id)}
                            title="Click to understand what this means"
                            style={{ fontSize: 10, padding: "2px 10px", borderRadius: 10, background: "#D9770622", color: "#D97706", fontWeight: 700, cursor: "pointer", textDecoration: "underline dotted" }}>
                            ✏️ Revision Requested — what does this mean? ▾
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: txt2, marginTop: 4 }}>{impact.desc}</div>
                      {item.feedback && (
                        <div style={{ fontSize: 11, color: "#D97706", marginTop: 6, padding: "4px 10px", background: "#D9770611", borderRadius: 6 }}>
                          📝 Your feedback: "{item.feedback}"
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Status explanation panel (click to expand) ── */}
                {showStatus === item.id && statusMeta && (
                  <div style={{ background: `${statusMeta.color}0f`, border: `1px solid ${statusMeta.color}40`, borderRadius: 10, padding: 14, marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: statusMeta.color, marginBottom: 8 }}>{statusMeta.icon} {statusMeta.explanation}</div>
                    <div style={{ fontSize: 11, color: txt, fontWeight: 600, marginBottom: 6 }}>What to do next:</div>
                    {statusMeta.actions.map((a, i) => (
                      <div key={i} style={{ fontSize: 11, color: txt2, marginBottom: 4, display: "flex", gap: 8 }}>
                        <span style={{ color: statusMeta.color, fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>{a}
                      </div>
                    ))}
                  </div>
                )}

                {/* ── "What happens if I approve?" panel ─────── */}
                <div
                  onClick={() => setShowOutcome(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: `${B}0a`, border: `1px solid ${B}28`, borderRadius: 8, cursor: "pointer", marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: B, fontWeight: 700 }}>🤔 What happens if I approve this?</div>
                  <span style={{ fontSize: 11, color: B }}>{isShowingOutcome ? "▲ Hide" : "▼ Show"}</span>
                </div>

                {isShowingOutcome && (
                  <div style={{ background: "#05966908", border: "1px solid #05966930", borderRadius: 10, padding: 16, marginBottom: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#059669", marginBottom: 12 }}>{outcome.icon} {outcome.title}</div>
                    {outcome.steps.map((step, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
                        <span style={{ fontSize: 14, flexShrink: 0 }}>{step.icon}</span>
                        <div style={{ fontSize: 12, color: txt, lineHeight: 1.5 }}>{step.text}</div>
                      </div>
                    ))}
                    <div style={{ marginTop: 12, padding: "8px 12px", background: `${outcome.timelineColor}18`, borderRadius: 8, borderLeft: `3px solid ${outcome.timelineColor}` }}>
                      <div style={{ fontSize: 10, color: outcome.timelineColor, fontWeight: 700, marginBottom: 3 }}>⏱ TIMELINE</div>
                      <div style={{ fontSize: 12, color: txt }}>{outcome.timeline}</div>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 11, color: txt2 }}>
                      <span style={{ fontWeight: 700, color: B }}>Next step after approving: </span>{outcome.nextStep}
                    </div>
                  </div>
                )}

                {/* ── Before/After diff (always visible, no click needed) ── */}
                {item.type === "homepage_optimisation" && item.data && (
                  <div style={{ background: bg3, borderRadius: 10, padding: 14, marginBottom: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: txt2, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Before vs After — What changes on your site</div>
                    {[
                      { label: "Title Tag",        curr: item.data.titleTag?.current,       next: item.data.titleTag?.recommended,       rationale: item.data.titleTag?.rationale },
                      { label: "Meta Description", curr: item.data.metaDescription?.current, next: item.data.metaDescription?.recommended, rationale: null },
                      { label: "H1 Heading",       curr: item.data.h1Tag?.current,          next: item.data.h1Tag?.recommended,           rationale: null },
                    ].filter(r => r.curr || r.next).map((row, i) => (
                      <div key={i} style={{ marginBottom: 10, padding: "10px 12px", background: bg2, borderRadius: 8, border: `1px solid ${bdr}` }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: txt2, marginBottom: 6 }}>{row.label}</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <div style={{ padding: "6px 10px", background: "#DC262608", borderRadius: 6, border: "1px solid #DC262630" }}>
                            <div style={{ fontSize: 9, color: "#DC2626", fontWeight: 700, marginBottom: 3 }}>CURRENT</div>
                            <div style={{ fontSize: 11, color: txt, lineHeight: 1.4 }}>{row.curr || "—"}</div>
                          </div>
                          <div style={{ padding: "6px 10px", background: "#05966908", borderRadius: 6, border: "1px solid #05966930" }}>
                            <div style={{ fontSize: 9, color: "#059669", fontWeight: 700, marginBottom: 3 }}>AFTER APPROVAL →</div>
                            <div style={{ fontSize: 11, color: txt, lineHeight: 1.4 }}>{row.next || "—"}</div>
                          </div>
                        </div>
                        {row.rationale && <div style={{ fontSize: 10, color: txt2, marginTop: 6 }}>💡 Why: {row.rationale}</div>}
                      </div>
                    ))}
                  </div>
                )}

                {/* New page brief preview */}
                {item.type === "new_page_brief" && item.data && (
                  <div style={{ background: bg3, borderRadius: 10, padding: 14, marginBottom: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: txt2, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>What will be created</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 10 }}>
                      {[
                        { l: "Target Keyword", v: item.data.targetKeyword, c: B },
                        { l: "Word Count", v: item.data.recommendedWordCount ? `~${item.data.recommendedWordCount} words` : "—", c: "#059669" },
                        { l: "Search Intent", v: item.data.intent, c: "#0891B2" },
                      ].map(b => (
                        <div key={b.l} style={{ background: bg2, borderRadius: 8, padding: "8px 10px", border: `1px solid ${bdr}` }}>
                          <div style={{ fontSize: 9, color: txt2, marginBottom: 3 }}>{b.l}</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: b.c }}>{b.v || "—"}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: txt, marginBottom: 6 }}>{item.data.title}</div>
                    {item.data.contentOutline && (
                      <div>
                        <div style={{ fontSize: 10, color: txt2, marginBottom: 6 }}>Page outline:</div>
                        {item.data.contentOutline.map((p, i) => (
                          <div key={i} style={{ fontSize: 11, color: txt2, marginBottom: 3, display: "flex", gap: 8 }}>
                            <span style={{ color: B, fontWeight: 700 }}>{i + 1}.</span>{p}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Client report preview */}
                {item.type === "client_report" && item.data?.reportData && (
                  <div style={{ background: bg3, borderRadius: 10, padding: 14, marginBottom: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: txt2, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Report contents — what client will see</div>
                    <div style={{ fontSize: 12, color: txt, marginBottom: 10, padding: "8px 12px", background: bg2, borderRadius: 8, borderLeft: `3px solid ${B}` }}>
                      <span style={{ fontWeight: 700, color: B }}>AI Verdict: </span>{item.data.reportData.verdict}
                    </div>
                    {(item.data.reportData.next3Actions || []).map((a, i) => (
                      <div key={i} style={{ fontSize: 11, color: txt2, padding: "6px 10px", background: bg2, borderRadius: 6, marginBottom: 6 }}>
                        <span style={{ color: "#059669", fontWeight: 700 }}>{i + 1}. </span>
                        <span style={{ color: txt, fontWeight: 600 }}>{a.action}</span>
                        {a.why && <span style={{ display: "block", marginTop: 2, paddingLeft: 14 }}>{a.why}</span>}
                      </div>
                    ))}
                  </div>
                )}

                {/* ── Revision input ─────────────────────── */}
                {revising === item.id && (
                  <div style={{ background: "#D9770611", border: "1px solid #D9770633", borderRadius: 10, padding: 14, marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#D97706", marginBottom: 4 }}>✏️ What should the AI change?</div>
                    <div style={{ fontSize: 11, color: txt2, marginBottom: 8 }}>Be specific — the AI will regenerate this item with your feedback applied.</div>
                    <textarea
                      value={feedback[item.id] || ""}
                      onChange={e => setFeedback(f => ({ ...f, [item.id]: e.target.value }))}
                      placeholder="e.g. Make the title shorter and include the city name. Tone should be more professional."
                      style={{ width: "100%", minHeight: 64, borderRadius: 8, border: "1px solid #D97706", padding: "8px 10px", fontSize: 12, background: bg3, color: txt, resize: "vertical", boxSizing: "border-box", outline: "none" }}
                    />
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button onClick={() => requestRevision(item.id)} disabled={acting === item.id}
                        style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: "#D97706", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                        {acting === item.id ? "⏳ Sending..." : "📤 Send for Revision"}
                      </button>
                      <button onClick={() => setRevising(null)}
                        style={{ padding: "7px 16px", borderRadius: 8, border: `1px solid ${bdr}`, background: "transparent", color: txt2, fontSize: 12, cursor: "pointer" }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Action buttons ─────────────────────── */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <button onClick={() => setRevising(revising === item.id ? null : item.id)}
                    style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #D97706", background: "transparent", color: "#D97706", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    ✏️ Request Changes
                  </button>
                  <button onClick={() => act(item.id, "reject", item.type)} disabled={acting === item.id}
                    style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#DC2626", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    ❌ Reject
                  </button>
                  <button onClick={() => act(item.id, "approve", item.type)} disabled={acting === item.id}
                    style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#059669,#047857)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", boxShadow: "0 2px 8px #05966944" }}>
                    {acting === item.id ? "⏳ Processing..." : "✅ Approve & Deploy"}
                  </button>
                  {/* Undo countdown */}
                  {undoQueue[item.id] !== undefined && (
                    <div style={{ fontSize: 11, color: "#D97706", padding: "6px 12px", background: "#D9770611", borderRadius: 8, border: "1px solid #D9770633" }}>
                      ↩️ Undo within {Math.floor(undoQueue[item.id] / 60)}:{String(undoQueue[item.id] % 60).padStart(2, "0")}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* ── Reviewed items ────────────────────────────────── */}
      {reviewed.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: txt2, marginBottom: 12, marginTop: 28, textTransform: "uppercase", letterSpacing: 1 }}>
            History — Reviewed Items ({reviewed.length})
          </div>

          {reviewed.map(item => {
            const outcome     = OUTCOMES[item.type] || OUTCOMES.client_report;
            const statusMeta  = STATUS_INFO[item.status] || STATUS_INFO.approved;
            const isShowingSt = showStatus === `rev_${item.id}`;
            const postOutcome = justApproved[item.id];

            return (
              <div key={item.id} style={{
                background: bg2, border: `1px solid ${bdr}`,
                borderLeft: `4px solid ${statusMeta.color}`,
                borderRadius: 12, padding: 16, marginBottom: 10,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 14 }}>{typeIcon[item.type] || "📋"}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: txt }}>{typeLabel[item.type] || item.type}</span>
                      {/* Status badge — click for explanation */}
                      <span
                        onClick={() => setShowStatus(isShowingSt ? null : `rev_${item.id}`)}
                        title="Click to understand what happened"
                        style={{ fontSize: 10, padding: "2px 10px", borderRadius: 10, background: `${statusMeta.color}22`, color: statusMeta.color, fontWeight: 700, cursor: "pointer", textDecoration: "underline dotted" }}>
                        {statusMeta.icon} {statusMeta.label} — what happened? ▾
                      </span>
                    </div>
                    {/* Approved → show what actually happened + next step */}
                    {item.status === "approved" && (
                      <div style={{ fontSize: 11, color: txt2, marginTop: 4 }}>
                        <span style={{ color: "#059669", fontWeight: 700 }}>Outcome: </span>
                        {outcome.title}
                        <span style={{ marginLeft: 8, color: outcome.timelineColor }}> · {outcome.timeline}</span>
                      </div>
                    )}
                    {item.status === "rejected" && (
                      <div style={{ fontSize: 11, color: "#DC2626", marginTop: 4 }}>
                        Not deployed — your website was not changed.
                      </div>
                    )}
                  </div>
                </div>

                {/* Status explanation (click to expand) */}
                {isShowingSt && (
                  <div style={{ background: `${statusMeta.color}0f`, border: `1px solid ${statusMeta.color}40`, borderRadius: 10, padding: 14, marginTop: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: statusMeta.color, marginBottom: 8 }}>{statusMeta.explanation}</div>
                    <div style={{ fontSize: 11, color: txt, fontWeight: 600, marginBottom: 6 }}>What to do next:</div>
                    {statusMeta.actions.map((a, i) => (
                      <div key={i} style={{ fontSize: 11, color: txt2, marginBottom: 4, display: "flex", gap: 8 }}>
                        <span style={{ color: statusMeta.color, fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>{a}
                      </div>
                    ))}
                    {/* Approved: show full outcome steps */}
                    {item.status === "approved" && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#059669", marginBottom: 8 }}>✅ What is happening right now:</div>
                        {outcome.steps.map((step, i) => (
                          <div key={i} style={{ display: "flex", gap: 10, marginBottom: 6 }}>
                            <span style={{ fontSize: 13, flexShrink: 0 }}>{step.icon}</span>
                            <div style={{ fontSize: 11, color: txt2 }}>{step.text}</div>
                          </div>
                        ))}
                        <div style={{ marginTop: 10, padding: "8px 12px", background: `${outcome.timelineColor}12`, borderRadius: 8, borderLeft: `3px solid ${outcome.timelineColor}` }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: outcome.timelineColor }}>Next step: </span>
                          <span style={{ fontSize: 11, color: txt }}>{outcome.nextStep}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      </> /* end activeTab === "approvals" */}
    </div>
  );
}
