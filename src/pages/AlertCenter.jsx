import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

/* ── Contextual Why/How per alert pattern ─────────────── */
function getAlertContext(alert) {
  const msg = (alert.message || "").toLowerCase();
  const src = (alert.source || "").toUpperCase();

  if (msg.includes("llm") || msg.includes("no llm key") || msg.includes("groq") || msg.includes("gemini")) {
    return {
      why: "AI keyword research, content generation and reports cannot run without an LLM key. Your action plan will be incomplete.",
      how: [
        "Go to Settings (⚙️ top-right)",
        "Add a free Groq API key (groq.com) or Gemini API key (aistudio.google.com)",
        "Re-run the full pipeline from the Pipeline tab",
      ],
      link: null,
    };
  }
  if (msg.includes("undefined") || msg.includes("firestore") || msg.includes("invalid")) {
    return {
      why: "An internal data validation error prevented one agent from saving its results. Other agents completed normally.",
      how: [
        "This is a known schema bug that has been patched",
        "Re-run the full pipeline — the error will not recur",
        "Check the Pipeline tab to see which agent failed",
      ],
      link: null,
    };
  }
  if (src === "A3" || msg.includes("keyword")) {
    return {
      why: "Without keyword data, the system cannot build your target list, identify gaps, or generate content briefs.",
      how: [
        "Ensure A2 (Technical Audit) completed successfully first",
        "Add a Groq or Gemini API key in Settings",
        "Re-run A3 from the Pipeline tab",
      ],
      link: null,
    };
  }
  if (src === "A8" || msg.includes("geo")) {
    return {
      why: "Local SEO analysis could not complete — citation targets and local pack ranking data are missing from your report.",
      how: [
        "Add an LLM key in Settings (Groq or Gemini)",
        "Re-run A8 from the Pipeline tab",
      ],
      link: null,
    };
  }
  if (src === "A9" || msg.includes("report")) {
    return {
      why: "Your strategy report and monthly recommendations could not be generated. The approval queue will be empty.",
      how: [
        "Add an LLM key in Settings",
        "Ensure A2–A8 all show ✅ Complete in the Pipeline tab",
        "Re-run A9 from the Pipeline tab",
      ],
      link: null,
    };
  }
  if (msg.includes("http") || msg.includes("request")) {
    return {
      why: "Too many HTTP requests slow page load time, increasing bounce rate and reducing Google rankings.",
      how: ["Minify and combine CSS/JS files", "Enable lazy loading for images", "Use a CDN to reduce request count"],
      link: null,
    };
  }
  if (msg.includes("ranking") || msg.includes("not ranking")) {
    return {
      why: "Most of your target keywords are not appearing in Google's top 100, meaning potential customers can't find you.",
      how: ["Focus on the Quick Wins in your Action Plan", "Fix technical issues first (P1 critical)", "Build 3–5 new optimised pages for gap keywords"],
      link: null,
    };
  }
  // Generic fallback
  return {
    why: "This issue may affect your SEO performance or the completeness of your analysis.",
    how: [alert.fix || "Check the Pipeline tab and re-run the affected agent"],
    link: null,
  };
}

const TIER_CONFIG = {
  P1: { color: "#DC2626", bg: "#DC262608", border: "#DC262633", label: "P1 · Critical", dot: "#DC2626", badge: "#DC262622" },
  P2: { color: "#D97706", bg: "#D9770608", border: "#D9770633", label: "P2 · Important", dot: "#D97706", badge: "#D9770622" },
  P3: { color: "#6B7280", bg: "#6B728008", border: "#6B728033", label: "P3 · Minor",     dot: "#6B7280", badge: "#6B728022" },
};

function openSettingsModal() { window.dispatchEvent(new CustomEvent("seo:openSettings")); }

export default function AlertCenter({ dark, clientId }) {
  const { user, API } = useAuth();
  const [alerts,      setAlerts]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [resolving,   setResolving]   = useState(null);
  const [expanded,    setExpanded]    = useState(null);
  const [dismissingAll, setDismissingAll] = useState(false);
  const [investigating, setInvestigating] = useState(false);
  const [investigation, setInvestigation] = useState(null);

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const txt3 = dark ? "#3a3a3a" : "#ccc";

  async function getToken() { return user?.getIdToken?.() || ""; }

  async function load() {
    setLoading(true);
    const token = await getToken();
    const res   = await fetch(`${API}/api/agents/${clientId}/alerts`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setAlerts(data.alerts || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [clientId]);

  async function resolve(alertId) {
    setResolving(alertId);
    const token = await getToken();
    await fetch(`${API}/api/agents/${clientId}/alerts/${alertId}/resolve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    await load();
    setResolving(null);
  }

  async function investigate() {
    setInvestigating(true);
    setInvestigation(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/agents/${clientId}/A23/investigate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      const data = await res.json();
      setInvestigation(data);
    } catch (e) {
      setInvestigation({ error: e.message });
    }
    setInvestigating(false);
  }

  async function dismissAll() {
    setDismissingAll(true);
    const token = await getToken();
    const open  = alerts.filter(a => !a.resolved);
    await Promise.all(open.map(a =>
      fetch(`${API}/api/agents/${clientId}/alerts/${a.id}/resolve`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      })
    ));
    await load();
    setDismissingAll(false);
  }

  const open     = alerts.filter(a => !a.resolved);
  const resolved = alerts.filter(a => a.resolved);

  if (loading) return (
    <div style={{ padding: 24, background: bg, display: "flex", alignItems: "center", gap: 8, color: txt2, fontSize: 13 }}>
      <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⏳</span> Loading alerts...
    </div>
  );

  return (
    <div style={{ padding: 24, background: bg }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: txt, marginBottom: 2 }}>🚨 Alert Center</div>
          <div style={{ fontSize: 11, color: txt2 }}>P1 = fix immediately · P2 = next business day · P3 = weekly review</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {open.some(a => a.tier === "P1") && (
            <button onClick={investigate} disabled={investigating}
              style={{
                padding: "7px 16px", borderRadius: 8, border: "none",
                background: "#443DCB", color: "#fff",
                fontSize: 12, fontWeight: 700,
                cursor: investigating ? "not-allowed" : "pointer",
                opacity: investigating ? 0.7 : 1,
                boxShadow: "0 2px 8px #443DCB44",
              }}>
              {investigating ? "🔍 Diagnosing…" : "🔍 Diagnose P1 Alerts (A23)"}
            </button>
          )}
          {open.length > 1 && (
            <button onClick={dismissAll} disabled={dismissingAll}
              style={{ padding: "7px 16px", borderRadius: 8, border: `1px solid ${bdr}`, background: bg2, color: txt2, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
              {dismissingAll ? "Dismissing…" : `Dismiss All (${open.length})`}
            </button>
          )}
        </div>
      </div>

      {/* Investigation result */}
      {investigation && !investigation.error && investigation.investigated > 0 && (
        <div style={{ background: "#05966911", border: "1px solid #05966944", borderRadius: 12, padding: "14px 18px", marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#059669", marginBottom: 8 }}>
            ✓ A23 Investigator — {investigation.investigated} root cause(s) diagnosed
          </div>
          <div style={{ fontSize: 11, color: txt2, lineHeight: 1.6, marginBottom: 10 }}>
            Investigation complete. Proposed fixes have been queued in the Approval Queue.
          </div>
          {(investigation.investigation || []).slice(0, 3).map((inv, i) => (
            <div key={i} style={{ padding: "8px 12px", background: bg2, borderRadius: 8, marginBottom: 6, fontSize: 11 }}>
              <div style={{ color: txt, fontWeight: 700, marginBottom: 3 }}>{inv.alertType}</div>
              <div style={{ color: txt2, lineHeight: 1.5 }}>
                <strong>Root cause:</strong> {inv.rootCause}
              </div>
              <div style={{ color: "#059669", marginTop: 3 }}>
                → {inv.proposedFix}
              </div>
            </div>
          ))}
        </div>
      )}
      {investigation?.error && (
        <div style={{ background: "#DC262611", border: "1px solid #DC262644", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#DC2626" }}>
          Investigation failed: {investigation.error}
        </div>
      )}
      {investigation && !investigation.error && investigation.investigated === 0 && (
        <div style={{ background: "#0891B211", border: "1px solid #0891B244", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#0891B2" }}>
          No unresolved P1 alerts to investigate.
        </div>
      )}

      {/* Root-cause banner: LLM key missing */}
      {open.filter(a => (a.message||"").toLowerCase().includes("llm") || (a.message||"").toLowerCase().includes("no llm")).length > 0 && (
        <div style={{ background: "#443DCB11", border: "1px solid #443DCB44", borderRadius: 12, padding: "14px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 24 }}>🔑</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#443DCB", marginBottom: 3 }}>Root Cause: AI keys not saved to backend</div>
            <div style={{ fontSize: 12, color: txt2, lineHeight: 1.6 }}>
              Your Groq / Gemini keys are in localStorage (browser only) — the backend agents can&apos;t see them.
              Open Settings, re-enter your keys, and click Save. All LLM alerts will stop.
            </div>
          </div>
          <button onClick={openSettingsModal}
            style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: "#443DCB", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
            ⚙️ Open Settings
          </button>
        </div>
      )}

      {/* Empty state */}
      {open.length === 0 && resolved.length === 0 && (
        <div style={{ textAlign: "center", padding: 60, color: txt2 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>All clear</div>
          <div style={{ fontSize: 13 }}>No alerts — run the pipeline to generate fresh analysis</div>
        </div>
      )}

      {open.length === 0 && resolved.length > 0 && (
        <div style={{ textAlign: "center", padding: 40, background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: txt, marginBottom: 4 }}>No open alerts</div>
          <div style={{ fontSize: 12, color: txt2 }}>All issues have been resolved</div>
        </div>
      )}

      {/* Open alerts */}
      {open.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#DC2626", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
            ⏳ Open Alerts ({open.length})
          </div>

          {open.map(alert => {
            const cfg = TIER_CONFIG[alert.tier] || TIER_CONFIG.P3;
            const ctx = getAlertContext(alert);
            const isOpen = expanded === alert.id;
            const isResolving = resolving === alert.id;

            return (
              <div key={alert.id} style={{
                background: bg2,
                border: `1px solid ${bdr}`,
                borderLeft: `4px solid ${cfg.color}`,
                borderRadius: 12,
                marginBottom: 10,
                overflow: "hidden",
              }}>
                {/* Alert header — always visible */}
                <div
                  onClick={() => setExpanded(isOpen ? null : alert.id)}
                  style={{ padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}
                >
                  <div style={{ flex: 1 }}>
                    {/* Badges row */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 10, background: cfg.badge, color: cfg.color, fontWeight: 700 }}>
                        {cfg.label}
                      </span>
                      <span style={{ fontSize: 10, color: txt2 }}>Source: {alert.source}</span>
                      {alert.createdAt && (
                        <span style={{ fontSize: 10, color: txt3 }}>
                          {new Date((alert.createdAt._seconds || 0) * 1000).toLocaleDateString()}
                        </span>
                      )}
                    </div>

                    {/* What happened — business language if available */}
                    <div style={{ fontSize: 13, fontWeight: 600, color: txt, lineHeight: 1.5 }}>
                      {alert.businessMessage || alert.message}
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: txt2 }}>{isOpen ? "▲" : "▼"}</span>
                    <button
                      onClick={e => { e.stopPropagation(); resolve(alert.id); }}
                      disabled={isResolving}
                      style={{
                        padding: "6px 14px", borderRadius: 8, border: `1px solid ${cfg.color}44`,
                        background: "transparent", color: cfg.color,
                        fontSize: 11, fontWeight: 600, cursor: isResolving ? "not-allowed" : "pointer",
                        opacity: isResolving ? 0.5 : 1,
                      }}
                    >
                      {isResolving ? "..." : "Resolve →"}
                    </button>
                  </div>
                </div>

                {/* Expanded detail — Why / How */}
                {isOpen && (
                  <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${bdr}` }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>

                      {/* Why it matters */}
                      <div style={{ background: bg3, borderRadius: 10, padding: "12px 14px" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: cfg.color, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
                          ⚠️ Why it matters
                        </div>
                        <div style={{ fontSize: 12, color: txt, lineHeight: 1.6 }}>{ctx.why}</div>
                      </div>

                      {/* How to fix */}
                      <div style={{ background: bg3, borderRadius: 10, padding: "12px 14px" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#059669", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
                          🔧 How to fix
                        </div>
                        <ol style={{ margin: 0, paddingLeft: 16 }}>
                          {ctx.how.map((step, i) => (
                            <li key={i} style={{ fontSize: 12, color: txt, lineHeight: 1.7, marginBottom: 2 }}>{step}</li>
                          ))}
                        </ol>
                      </div>
                    </div>

                    {/* Business action / fix note */}
                    {(alert.businessAction || alert.fix) && (
                      <div style={{ marginTop: 10, padding: "10px 14px", background: "#05966911", borderRadius: 8, fontSize: 12, color: "#059669", display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <span>→</span>
                        <span><span style={{ fontWeight: 700 }}>Action: </span>{alert.businessAction || alert.fix}</span>
                      </div>
                    )}

                    {/* One-click resolve CTA */}
                    <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                      <button
                        onClick={() => resolve(alert.id)}
                        disabled={isResolving}
                        style={{
                          padding: "8px 18px", borderRadius: 8, border: "none",
                          background: "#059669", color: "#fff",
                          fontSize: 12, fontWeight: 700, cursor: isResolving ? "not-allowed" : "pointer",
                          opacity: isResolving ? 0.5 : 1,
                        }}
                      >
                        {isResolving ? "Resolving..." : "✅ Mark Resolved"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Resolved alerts */}
      {resolved.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: txt2, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
            ✅ Resolved ({resolved.length})
          </div>
          {resolved.map(alert => {
            const cfg = TIER_CONFIG[alert.tier] || TIER_CONFIG.P3;
            return (
              <div key={alert.id} style={{
                background: bg2, border: `1px solid ${bdr}`, borderLeft: `3px solid #059669`,
                borderRadius: 10, padding: "12px 14px", marginBottom: 8, opacity: 0.55,
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div>
                  <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: cfg.badge, color: cfg.color, fontWeight: 700, marginRight: 8 }}>{alert.tier}</span>
                  <span style={{ fontSize: 12, color: txt }}>{alert.message}</span>
                </div>
                <span style={{ fontSize: 11, color: "#059669", fontWeight: 600, flexShrink: 0, marginLeft: 12 }}>✅ Resolved</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
