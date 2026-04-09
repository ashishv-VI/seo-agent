import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

const TRIGGER_LABELS = {
  keyword_position_change: "Keyword Position Drop",
  keyword_position_range:  "Keyword Position Range",
  gsc_ctr:                 "Low CTR (GSC)",
  competitor_activity:     "Competitor Activity",
  traffic_change:          "Traffic Change",
  technical_issue:         "Technical Issue",
  keyword_new_ranking:     "New Keyword Ranking",
};

const ACTION_LABELS = {
  create_alert:        "Create Alert",
  create_notification: "Send Notification",
  queue_agent:         "Queue Agent",
  log_event:           "Log Event",
};

const SEVERITY_COLORS = { P1: "#DC2626", P2: "#D97706", P3: "#0891B2" };

export default function RulesEnginePanel({ dark, clientId, bg2, bg3, bdr, txt, txt2 }) {
  const { user, API } = useAuth();
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [toggling,   setToggling]   = useState(null); // ruleId being toggled
  const [tab,        setTab]        = useState("rules"); // rules | log | new
  const [evalResult, setEvalResult] = useState(null);
  const [newRule,    setNewRule]    = useState({ name: "", description: "", triggerType: "keyword_position_change", actions: [] });
  const [saving,     setSaving]     = useState(false);
  const [saveError,  setSaveError]  = useState(null);

  const B     = "#443DCB";
  const green = "#059669";
  const amber = "#D97706";
  const red   = "#DC2626";
  const cyan  = "#0891B2";

  async function load() {
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res   = await fetch(`${API}/api/rules-engine/${clientId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (res.ok) setData(json);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function loadLog() {
    try {
      const token = await user.getIdToken();
      const res   = await fetch(`${API}/api/rules-engine/${clientId}/log`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (res.ok) setData(prev => ({ ...prev, fullLog: json.log }));
    } catch (e) { console.error(e); }
  }

  useEffect(() => { load(); }, [clientId]);
  useEffect(() => { if (tab === "log") loadLog(); }, [tab]);

  async function handleToggle(rule) {
    setToggling(rule.id);
    try {
      const token = await user.getIdToken();
      await fetch(`${API}/api/rules-engine/${clientId}/rules/${rule.id}`, {
        method:  "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body:    JSON.stringify({ enabled: !rule.enabled }),
      });
      // Optimistic update
      setData(prev => ({
        ...prev,
        rules: prev.rules.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r),
      }));
    } catch (e) { console.error(e); }
    setToggling(null);
  }

  async function handleEvaluate() {
    setEvaluating(true);
    setEvalResult(null);
    try {
      const token = await user.getIdToken();
      const res   = await fetch(`${API}/api/rules-engine/${clientId}/evaluate`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setEvalResult(json);
      if (json.success) load(); // refresh fire times
    } catch (e) { setEvalResult({ error: e.message }); }
    setEvaluating(false);
  }

  async function handleSaveRule() {
    if (!newRule.name || !newRule.triggerType) {
      setSaveError("Name and trigger type are required.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const token = await user.getIdToken();
      const res   = await fetch(`${API}/api/rules-engine/${clientId}/rules`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body:    JSON.stringify({
          name:        newRule.name,
          description: newRule.description,
          trigger:     { type: newRule.triggerType },
          actions:     [{ type: "create_alert", severity: "P3", message: newRule.name + " triggered" }],
          enabled:     true,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setNewRule({ name: "", description: "", triggerType: "keyword_position_change", actions: [] });
        setTab("rules");
        load();
      } else {
        setSaveError(json.error || "Failed to save rule");
      }
    } catch (e) { setSaveError(e.message); }
    setSaving(false);
  }

  function firedAgo(rule) {
    const fires = (data?.recentFires || []).filter(f => f.ruleId === rule.id);
    if (!fires.length) return null;
    const latest = fires[0];
    if (!latest.firedAt?.seconds) return "Recently";
    const diff = Date.now() / 1000 - latest.firedAt.seconds;
    if (diff < 3600)  return `${Math.round(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
    return `${Math.round(diff / 86400)}d ago`;
  }

  if (loading) return (
    <div style={{ padding: 40, textAlign: "center", color: txt2 }}>
      <div style={{ fontSize: 28, marginBottom: 12 }}>⚙️</div>
      Loading rules engine...
    </div>
  );

  const rules     = data?.rules || [];
  const fullLog   = data?.fullLog || data?.recentFires || [];
  const activeCount   = rules.filter(r => r.enabled).length;
  const defaultCount  = rules.filter(r => r.source === "default").length;
  const customCount   = rules.filter(r => r.source === "custom").length;

  return (
    <div style={{ padding: "0 0 32px" }}>

      {/* ── Header row ── */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 120, background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, padding: "14px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 11, color: txt2, textTransform: "uppercase", letterSpacing: 1 }}>Active Rules</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: green, marginTop: 4 }}>{activeCount}</div>
          <div style={{ fontSize: 11, color: txt2 }}>of {rules.length} total</div>
        </div>
        <div style={{ flex: 1, minWidth: 120, background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, padding: "14px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 11, color: txt2, textTransform: "uppercase", letterSpacing: 1 }}>Default</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: txt, marginTop: 4 }}>{defaultCount}</div>
          <div style={{ fontSize: 11, color: txt2 }}>built-in rules</div>
        </div>
        <div style={{ flex: 1, minWidth: 120, background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, padding: "14px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 11, color: txt2, textTransform: "uppercase", letterSpacing: 1 }}>Custom</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: B, marginTop: 4 }}>{customCount}</div>
          <div style={{ fontSize: 11, color: txt2 }}>your rules</div>
        </div>
        <div style={{ flex: 1, minWidth: 120, background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, padding: "14px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 11, color: txt2, textTransform: "uppercase", letterSpacing: 1 }}>Fires (7d)</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: amber, marginTop: 4 }}>{(data?.recentFires || []).length}</div>
          <div style={{ fontSize: 11, color: txt2 }}>rule triggers</div>
        </div>
      </div>

      {/* ── Evaluate button + result ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
        <button onClick={handleEvaluate} disabled={evaluating}
          style={{ background: B, color: "#fff", border: "none", borderRadius: 6, padding: "8px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: evaluating ? 0.6 : 1 }}>
          {evaluating ? "Evaluating..." : "▶ Run Rules Now"}
        </button>
        {evalResult && !evalResult.error && (
          <div style={{ fontSize: 12, color: evalResult.fired > 0 ? amber : green, fontWeight: 600 }}>
            {evalResult.evaluated} rules checked — {evalResult.fired} fired
            {evalResult.fired > 0 && ` (${evalResult.firedRules?.map(r => r.ruleName).join(", ")})`}
          </div>
        )}
        {evalResult?.error && (
          <div style={{ fontSize: 12, color: red }}>{evalResult.error}</div>
        )}
      </div>

      {/* ── Tab bar ── */}
      <div style={{ display: "flex", gap: 2, marginBottom: 16, background: bg2, border: `1px solid ${bdr}`, borderRadius: 8, padding: 4, width: "fit-content" }}>
        {[["rules", "Rules"], ["log", "Fire Log"], ["new", "+ New Rule"]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ background: tab === key ? B : "transparent", color: tab === key ? "#fff" : txt2, border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Rules tab ── */}
      {tab === "rules" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rules.map(rule => {
            const lastFired = firedAgo(rule);
            const isToggling = toggling === rule.id;
            return (
              <div key={rule.id} style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  {/* Toggle */}
                  <button onClick={() => handleToggle(rule)} disabled={isToggling}
                    style={{ width: 38, height: 22, borderRadius: 11, border: "none", cursor: "pointer", flexShrink: 0, marginTop: 2,
                      background: rule.enabled ? green : (dark ? "#333" : "#ccc"), opacity: isToggling ? 0.5 : 1, transition: "background .2s", position: "relative" }}>
                    <span style={{ position: "absolute", top: 3, left: rule.enabled ? 18 : 4, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
                  </button>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: txt }}>{rule.name}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, background: rule.source === "custom" ? B : (dark ? "#222" : "#e8e8e8"), color: rule.source === "custom" ? "#fff" : txt2, borderRadius: 4, padding: "2px 6px" }}>
                        {rule.source === "custom" ? "CUSTOM" : "DEFAULT"}
                      </span>
                      {!rule.enabled && (
                        <span style={{ fontSize: 10, fontWeight: 700, background: dark ? "#222" : "#f0f0ea", color: txt2, borderRadius: 4, padding: "2px 6px" }}>DISABLED</span>
                      )}
                      {lastFired && (
                        <span style={{ fontSize: 11, color: amber }}>⚡ {lastFired}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: txt2, marginTop: 3 }}>{rule.description}</div>

                    {/* Trigger + actions summary */}
                    <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, background: dark ? "#1a1a2e" : "#ede9ff", color: B, borderRadius: 4, padding: "3px 8px" }}>
                        IF: {TRIGGER_LABELS[rule.trigger?.type] || rule.trigger?.type}
                      </span>
                      {rule.actions?.map((a, ai) => (
                        <span key={ai} style={{ fontSize: 11, background: bg3, color: txt2, borderRadius: 4, padding: "3px 8px" }}>
                          THEN: {ACTION_LABELS[a.type] || a.type}
                          {a.agent ? ` (${a.agent})` : ""}
                          {a.severity ? ` ${a.severity}` : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {rules.length === 0 && (
            <div style={{ textAlign: "center", color: txt2, padding: 32, fontSize: 13 }}>No rules found. Add a custom rule to get started.</div>
          )}
        </div>
      )}

      {/* ── Log tab ── */}
      {tab === "log" && (
        <div>
          {fullLog.length === 0 ? (
            <div style={{ textAlign: "center", color: txt2, padding: 32, fontSize: 13 }}>No rules have fired yet. Run evaluation to check rules against current data.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {fullLog.map((entry, i) => {
                const ts = entry.firedAt?.seconds
                  ? new Date(entry.firedAt.seconds * 1000).toLocaleString()
                  : "Unknown time";
                return (
                  <div key={i} style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 8, padding: "12px 14px", display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>⚡</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: txt }}>{entry.ruleName}</div>
                      {entry.message && <div style={{ fontSize: 12, color: txt2, marginTop: 2 }}>{entry.message}</div>}
                      {entry.context && (
                        <div style={{ fontSize: 11, color: txt2, marginTop: 4, fontFamily: "monospace", background: bg3, borderRadius: 4, padding: "4px 8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {JSON.stringify(entry.context)}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: txt2, flexShrink: 0 }}>{ts}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── New Rule tab ── */}
      {tab === "new" && (
        <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, padding: 20, maxWidth: 600 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: txt, marginBottom: 16 }}>Create Custom Rule</div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: txt, marginBottom: 6 }}>Rule Name *</div>
            <input value={newRule.name} onChange={e => setNewRule(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Alert when bounce rate is high"
              style={{ width: "100%", background: bg3, border: `1px solid ${bdr}`, borderRadius: 6, color: txt, padding: "8px 12px", fontSize: 13, boxSizing: "border-box" }} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: txt, marginBottom: 6 }}>Description</div>
            <input value={newRule.description} onChange={e => setNewRule(p => ({ ...p, description: e.target.value }))}
              placeholder="What does this rule do?"
              style={{ width: "100%", background: bg3, border: `1px solid ${bdr}`, borderRadius: 6, color: txt, padding: "8px 12px", fontSize: 13, boxSizing: "border-box" }} />
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: txt, marginBottom: 6 }}>Trigger Type *</div>
            <select value={newRule.triggerType} onChange={e => setNewRule(p => ({ ...p, triggerType: e.target.value }))}
              style={{ width: "100%", background: bg3, border: `1px solid ${bdr}`, borderRadius: 6, color: txt, padding: "8px 12px", fontSize: 13 }}>
              {Object.entries(TRIGGER_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div style={{ fontSize: 11, color: txt2, marginBottom: 16, background: bg3, border: `1px solid ${bdr}`, borderRadius: 6, padding: "10px 12px" }}>
            The rule will be created with a default "Create P3 Alert" action. You can build more complex rules by using the API directly.
          </div>

          {saveError && (
            <div style={{ fontSize: 12, color: red, marginBottom: 12 }}>{saveError}</div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={handleSaveRule} disabled={saving}
              style={{ background: B, color: "#fff", border: "none", borderRadius: 6, padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving..." : "Create Rule"}
            </button>
            <button onClick={() => { setTab("rules"); setSaveError(null); }}
              style={{ background: bg3, color: txt2, border: `1px solid ${bdr}`, borderRadius: 6, padding: "9px 16px", fontSize: 13, cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
