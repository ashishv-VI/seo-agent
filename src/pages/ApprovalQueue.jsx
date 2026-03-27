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
  const [items,       setItems]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [acting,      setActing]      = useState(null);
  const [expanded,    setExpanded]    = useState(null);   // item id for content expand
  const [showOutcome, setShowOutcome] = useState({});      // itemId → bool: show "what happens next"
  const [showStatus,  setShowStatus]  = useState(null);    // itemId for status explanation
  const [revising,    setRevising]    = useState(null);
  const [feedback,    setFeedback]    = useState({});
  const [undoQueue,   setUndoQueue]   = useState({});      // itemId → countdown seconds
  const [selected,    setSelected]    = useState(new Set()); // for batch approve
  const [justApproved, setJustApproved] = useState({});    // itemId → outcome to show

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
    const res   = await fetch(`${API}/api/agents/${clientId}/approvals`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setItems(data.items || []);
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

  const typeLabel = { homepage_optimisation: "Homepage Optimisation", new_page_brief: "New Page Brief", client_report: "Client Report" };
  const typeIcon  = { homepage_optimisation: "🏠", new_page_brief: "📄", client_report: "📊" };

  const pending  = items.filter(i => ["pending", "revision_requested"].includes(i.status));
  const reviewed = items.filter(i => !["pending", "revision_requested"].includes(i.status));

  if (loading) return <div style={{ padding: 24, color: txt3 }}>Loading approvals...</div>;

  return (
    <div style={{ padding: 24, background: bg }}>

      {/* ── Header ────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: txt, marginBottom: 4 }}>✅ Approval Queue</div>
        <div style={{ fontSize: 12, color: txt2 }}>
          Review AI-generated changes before anything goes live on your website. Nothing deploys without your approval.
        </div>
      </div>

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
    </div>
  );
}
