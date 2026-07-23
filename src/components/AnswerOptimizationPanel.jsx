import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { makeTheme } from "../theme/theme";
import { Button, EmptyState } from "./ui";

// Answer Optimization panel (M9.3) — turns LLM visibility + scan data into
// prioritized, categorized actions. Reads the backend synthesis endpoints; does
// no scanning/LLM itself. Matches existing panel conventions (useAuth {user,API},
// dark+clientId props, bg2/bg3/bdr/txt/txt2/B palette).

const PRIORITY_COLOR = { critical: "#DC2626", high: "#ea580c", medium: "#D97706", low: "#0891B2" };
const IMPACT_RANK = { high: 3, medium: 2, low: 1 };
const DIFF_RANK   = { low: 1, medium: 2, high: 3 };

export default function AnswerOptimizationPanel({ dark, clientId }) {
  const { user, API } = useAuth();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [recalc,  setRecalc]  = useState(false);
  const [error,   setError]   = useState("");

  // M10.1 design-system theme — same surface/text values as before (aliased).
  const th = makeTheme(dark);
  const { bg2, bg3, bdr, txt, txt2, B } = th;

  async function load() {
    setLoading(true); setError("");
    try {
      const token = await user.getIdToken();
      const r = await fetch(`${API}/api/agents/${clientId}/answer-optimization`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await r.json();
      if (r.ok) setData(json); else setError(json.error || "Failed to load");
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  async function recalculate() {
    setRecalc(true); setError("");
    try {
      const token = await user.getIdToken();
      const r = await fetch(`${API}/api/agents/${clientId}/answer-optimization/recalculate`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      const json = await r.json();
      if (r.ok) setData(json); else setError(json.error || "Recalculate failed");
    } catch (e) { setError(e.message); }
    setRecalc(false);
  }

  useEffect(() => { if (clientId) load(); }, [clientId]);

  const card  = { background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: "16px 18px" };
  const label = { fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: txt2 };

  if (loading) {
    return <div style={{ padding: "0 0 24px" }}><div style={{ ...card, textAlign: "center", color: txt2 }}>
      <div style={{ fontSize: 22, marginBottom: 8 }}>🎯</div>Loading optimization opportunities…</div></div>;
  }

  const opps  = data?.opportunities || [];
  const score = data?.optimizationScore ?? 0;
  const grade = data?.grade || "F";
  const cats  = data?.categoryBreakdown || {};
  const quick = data?.quickWins || [];
  const longW = data?.longTermWins || [];
  const hasData = opps.length > 0 || data?.source === "stored" || data?.source === "recalculated";

  return (
    <div style={{ padding: "0 0 24px", display: "grid", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: txt, letterSpacing: "-.01em" }}>Answer Optimization</h2>
          <div style={{ fontSize: 13, color: txt2, marginTop: 2 }}>Prioritized actions to improve your visibility inside AI answers.</div>
        </div>
        <button onClick={recalculate} disabled={recalc}
          style={{ background: B, color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px",
                   fontSize: 13, fontWeight: 700, cursor: recalc ? "wait" : "pointer", opacity: recalc ? .7 : 1 }}>
          {recalc ? "Recalculating…" : "↻ Recalculate"}
        </button>
      </div>

      {error && <div style={{ ...card, borderColor: "#DC2626", color: "#DC2626", fontSize: 13 }}>{error}</div>}

      {/* Empty state */}
      {!hasData && !error && (
        <EmptyState t={th} icon="🧭" title="No optimization data yet"
          description="Compute LLM Visibility first, then recalculate to generate prioritized, categorized actions with impact and effort estimates."
          action={<Button t={th} onClick={recalculate} loading={recalc}>Generate opportunities</Button>} />
      )}

      {hasData && (
        <>
          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
            <div style={{ ...card, background: dark ? "#14121f" : "#f5f3ff", borderColor: B }}>
              <div style={label}>Optimization Score</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 6 }}>
                <div style={{ fontSize: 38, fontWeight: 800, color: B, lineHeight: 1 }}>{score}</div>
                <div style={{ fontSize: 13, color: txt2, fontWeight: 600 }}>/100</div>
                <div style={{ marginLeft: "auto", fontSize: 22, fontWeight: 800, color: PRIORITY_COLOR[grade === "A" || grade === "B" ? "low" : grade === "C" ? "medium" : "high"] }}>{grade}</div>
              </div>
              <div style={{ marginTop: 10, height: 6, background: bg3, borderRadius: 99, overflow: "hidden" }}>
                <div style={{ width: `${score}%`, height: "100%", background: B, borderRadius: 99 }} />
              </div>
            </div>
            <div style={card}><div style={label}>Critical Actions</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: data.criticalCount ? "#DC2626" : txt, marginTop: 6 }}>{data.criticalCount ?? 0}</div>
              <div style={{ fontSize: 12, color: txt2, marginTop: 2 }}>need attention now</div></div>
            <div style={card}><div style={label}>Expected Gain</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: "#059669", marginTop: 6 }}>+{data.expectedVisibilityGain ?? 0}</div>
              <div style={{ fontSize: 12, color: txt2, marginTop: 2 }}>visibility points if all done</div></div>
            <div style={card}><div style={label}>Opportunities</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: txt, marginTop: 6 }}>{opps.length}</div>
              <div style={{ fontSize: 12, color: txt2, marginTop: 2 }}>{quick.length} quick · {longW.length} long-term</div></div>
          </div>

          {/* Priority matrix (impact × effort) */}
          <div style={card}>
            <div style={{ ...label, marginBottom: 12 }}>Impact vs Effort</div>
            <div style={{ display: "grid", gridTemplateColumns: "auto repeat(3, 1fr)", gap: 6, fontSize: 12 }}>
              <div></div>
              {["Low effort", "Medium effort", "High effort"].map(h => <div key={h} style={{ color: txt2, fontWeight: 600, textAlign: "center", paddingBottom: 4 }}>{h}</div>)}
              {["high", "medium", "low"].map(imp => (
                <>
                  <div key={imp} style={{ color: txt2, fontWeight: 600, alignSelf: "center", textTransform: "capitalize" }}>{imp} impact</div>
                  {["low", "medium", "high"].map(diff => {
                    const cell = opps.filter(o => o.impact === imp && o.difficulty === diff);
                    const isQuadQuickWin = imp !== "low" && diff === "low";
                    return (
                      <div key={imp + diff} style={{ minHeight: 42, borderRadius: 8, border: `1px solid ${bdr}`,
                        background: cell.length ? (isQuadQuickWin ? (dark ? "#0e2a1e" : "#e0f2e9") : bg3) : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: 3, padding: 4 }}>
                        {cell.map((o, i) => <span key={i} title={o.title}
                          style={{ width: 9, height: 9, borderRadius: 3, background: PRIORITY_COLOR[o.priority] }} />)}
                      </div>
                    );
                  })}
                </>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: txt2, marginTop: 10 }}>Top-left (high impact · low effort) = quick wins. Each dot is one opportunity, colored by priority.</div>
          </div>

          {/* Category breakdown */}
          {Object.keys(cats).length > 0 && (
            <div style={card}>
              <div style={{ ...label, marginBottom: 12 }}>By Category</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {Object.entries(cats).map(([c, v]) => (
                  <span key={c} style={{ fontSize: 12.5, color: txt, background: bg3, border: `1px solid ${bdr}`,
                    borderRadius: 8, padding: "6px 11px", fontWeight: 600 }}>
                    {c} <span style={{ color: txt2 }}>· {v.count}</span> <span style={{ color: "#059669" }}>+{v.gain}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Opportunity cards */}
          <div style={{ display: "grid", gap: 12 }}>
            {opps.map((o, i) => (
              <div key={i} style={{ ...card, borderLeft: `3px solid ${PRIORITY_COLOR[o.priority]}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em",
                    color: PRIORITY_COLOR[o.priority], background: bg3, borderRadius: 5, padding: "3px 7px" }}>{o.priority}</span>
                  <span style={{ fontSize: 11, color: txt2, fontWeight: 600 }}>{o.category}</span>
                  <span style={{ marginLeft: "auto", fontSize: 11.5, color: "#059669", fontWeight: 700 }}>+{o.expectedVisibilityGain} pts</span>
                </div>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: txt, marginBottom: 4 }}>{o.title}</div>
                <div style={{ fontSize: 13, color: txt2, lineHeight: 1.55 }}>{o.detail}</div>
                <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 11.5, color: txt2, flexWrap: "wrap" }}>
                  <span>Impact: <b style={{ color: txt }}>{o.impact}</b></span>
                  <span>Effort: <b style={{ color: txt }}>{o.difficulty}</b></span>
                  <span>~{o.estimatedTime}</span>
                  <span>Confidence: <b style={{ color: txt }}>{Math.round((o.confidence ?? 0) * 100)}%</b></span>
                </div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 11.5, color: txt2 }}>
            {data.lastRun ? `Last recalculated ${new Date(data.lastRun).toLocaleString()}` : "Computed live (hit Recalculate to persist history)"}
            {data.source ? ` · ${data.source}` : ""}
          </div>
        </>
      )}
    </div>
  );
}
