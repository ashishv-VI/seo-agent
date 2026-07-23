import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

// LLM Visibility panel (M9.2) — synthesizes existing AI-citation / AI-overview /
// SERP scans into a single visibility product view. Reads the backend synthesis
// endpoints; does no scanning itself. Matches the existing panel conventions
// (useAuth {user, API}, dark+clientId props, bg2/bg3/bdr/txt/txt2/B palette).

const GRADE_COLOR = {
  A: "#059669", B: "#10b981", C: "#D97706", D: "#ea580c", F: "#DC2626",
};
const ENGINE_META = {
  citationRate:   { label: "AI Citations",   icon: "🤖" },
  answerPresence: { label: "AI Overviews",   icon: "🔍" },
  ownedSnippets:  { label: "Owned Snippets", icon: "⭐" },
  engineBreadth:  { label: "Engine Breadth", icon: "🌐" },
};

export default function LLMVisibilityPanel({ dark, clientId }) {
  const { user, API } = useAuth();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [recalc,  setRecalc]  = useState(false);
  const [error,   setError]   = useState("");

  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const B    = "#443DCB";

  async function load() {
    setLoading(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const r = await fetch(`${API}/api/agents/${clientId}/llm-visibility`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await r.json();
      if (r.ok) setData(json);
      else setError(json.error || "Failed to load");
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  async function recalculate() {
    setRecalc(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const r = await fetch(`${API}/api/agents/${clientId}/llm-visibility/recalculate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      const json = await r.json();
      if (r.ok) setData(json);
      else setError(json.error || "Recalculate failed");
    } catch (e) { setError(e.message); }
    setRecalc(false);
  }

  useEffect(() => { if (clientId) load(); }, [clientId]);

  const card = { background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: "16px 18px" };
  const label = { fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: txt2 };

  // ── Loading state ──
  if (loading) {
    return (
      <div style={{ padding: "0 0 24px" }}>
        <div style={{ ...card, textAlign: "center", color: txt2 }}>
          <div style={{ fontSize: 22, marginBottom: 8 }}>📡</div>
          Loading LLM visibility…
        </div>
      </div>
    );
  }

  const score = data?.visibilityScore ?? 0;
  const grade = data?.grade || "F";
  const trend = data?.trend || { direction: "flat", delta: 0 };
  const comps = data?.components || {};
  const recs  = data?.recommendations || [];
  const competitors = data?.competitors || [];
  const hasData = (data?.topPrompts || 0) > 0 || (data?.source === "stored" || data?.source === "recalculated");

  const trendColor = trend.direction === "up" ? "#059669" : trend.direction === "down" ? "#DC2626" : txt2;
  const trendArrow = trend.direction === "up" ? "▲" : trend.direction === "down" ? "▼" : "▬";

  return (
    <div style={{ padding: "0 0 24px", display: "grid", gap: 16 }}>
      {/* Header + action */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: txt, letterSpacing: "-.01em" }}>LLM Visibility</h2>
          <div style={{ fontSize: 13, color: txt2, marginTop: 2 }}>
            How visible you are inside AI answers — ChatGPT, Gemini, Perplexity, Google AI Overviews.
          </div>
        </div>
        <button
          onClick={recalculate} disabled={recalc}
          style={{ background: B, color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px",
                   fontSize: 13, fontWeight: 700, cursor: recalc ? "wait" : "pointer", opacity: recalc ? .7 : 1 }}>
          {recalc ? "Recalculating…" : "↻ Recalculate"}
        </button>
      </div>

      {error && (
        <div style={{ ...card, borderColor: "#DC2626", color: "#DC2626", fontSize: 13 }}>{error}</div>
      )}

      {/* Empty state */}
      {!hasData && !error && (
        <div style={{ ...card, textAlign: "center", padding: "36px 18px" }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>🛰️</div>
          <div style={{ fontWeight: 700, color: txt, marginBottom: 6 }}>No visibility data yet</div>
          <div style={{ fontSize: 13.5, color: txt2, maxWidth: 460, margin: "0 auto 16px", lineHeight: 1.6 }}>
            Run the AI Citation and AI Overview scans first, then recalculate to see your
            LLM visibility score, share of voice, and citation coverage.
          </div>
          <button onClick={recalculate} disabled={recalc}
            style={{ background: B, color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px",
                     fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Calculate now
          </button>
        </div>
      )}

      {hasData && (
        <>
          {/* Hero KPI */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
            <div style={{ ...card, background: dark ? "#14121f" : "#f5f3ff", borderColor: B }}>
              <div style={label}>Visibility Score</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 6 }}>
                <div style={{ fontSize: 40, fontWeight: 800, color: B, lineHeight: 1 }}>{score}</div>
                <div style={{ fontSize: 14, color: txt2, fontWeight: 600 }}>/100</div>
                <div style={{ marginLeft: "auto", fontSize: 24, fontWeight: 800, color: GRADE_COLOR[grade] }}>{grade}</div>
              </div>
              <div style={{ marginTop: 10, height: 6, background: bg3, borderRadius: 99, overflow: "hidden" }}>
                <div style={{ width: `${score}%`, height: "100%", background: B, borderRadius: 99 }} />
              </div>
            </div>
            <div style={card}>
              <div style={label}>Share of Voice</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: txt, marginTop: 6 }}>{data.shareOfVoice ?? 0}<span style={{ fontSize: 14, color: txt2 }}>%</span></div>
              <div style={{ fontSize: 12, color: txt2, marginTop: 2 }}>vs contested AI answers</div>
            </div>
            <div style={card}>
              <div style={label}>Trend</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: trendColor, marginTop: 8 }}>
                {trendArrow} {trend.delta > 0 ? "+" : ""}{trend.delta}
              </div>
              <div style={{ fontSize: 12, color: txt2, marginTop: 2 }}>vs last scan</div>
            </div>
            <div style={card}>
              <div style={label}>Prompt Coverage</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: txt, marginTop: 6 }}>{data.topPrompts ?? 0}</div>
              <div style={{ fontSize: 12, color: txt2, marginTop: 2 }}>
                prompts checked · confidence {Math.round((data.confidence ?? 0) * 100)}%
              </div>
            </div>
          </div>

          {/* Citation / component breakdown chart */}
          <div style={card}>
            <div style={{ ...label, marginBottom: 12 }}>Score Breakdown</div>
            <div style={{ display: "grid", gap: 10 }}>
              {Object.keys(ENGINE_META).map((k) => {
                const val = comps[k] ?? 0;
                const w = comps.weights?.[k] ? Math.round(comps.weights[k] * 100) : null;
                return (
                  <div key={k} style={{ display: "grid", gridTemplateColumns: "150px 1fr 48px", alignItems: "center", gap: 10 }}>
                    <div style={{ fontSize: 13, color: txt }}>
                      <span style={{ marginRight: 6 }}>{ENGINE_META[k].icon}</span>{ENGINE_META[k].label}
                      {w != null && <span style={{ fontSize: 10.5, color: txt2, marginLeft: 5 }}>·{w}%</span>}
                    </div>
                    <div style={{ height: 8, background: bg3, borderRadius: 99, overflow: "hidden" }}>
                      <div style={{ width: `${val}%`, height: "100%", background: B, borderRadius: 99 }} />
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: txt, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{val}%</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Competitor comparison */}
          {competitors.length > 0 && (
            <div style={card}>
              <div style={{ ...label, marginBottom: 12 }}>Competitors in the AI answer space</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {competitors.map((c, i) => (
                  <span key={i} style={{ fontSize: 12.5, fontWeight: 600, color: txt, background: bg3,
                    border: `1px solid ${bdr}`, borderRadius: 8, padding: "5px 10px" }}>{c}</span>
                ))}
              </div>
              <div style={{ fontSize: 12, color: txt2, marginTop: 10 }}>
                Track whether these brands are cited for your target prompts — earning citations against them lifts share of voice.
              </div>
            </div>
          )}

          {/* Recommendations */}
          <div style={card}>
            <div style={{ ...label, marginBottom: 12 }}>Recommendations</div>
            <div style={{ display: "grid", gap: 10 }}>
              {recs.map((r, i) => {
                const pc = r.priority === "high" ? "#DC2626" : r.priority === "medium" ? "#D97706" : "#0891B2";
                return (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em",
                      color: pc, background: bg3, borderRadius: 5, padding: "3px 7px", whiteSpace: "nowrap", marginTop: 1 }}>
                      {r.priority}
                    </span>
                    <span style={{ fontSize: 13.5, color: txt, lineHeight: 1.55 }}>{r.action}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ fontSize: 11.5, color: txt2 }}>
            {data.lastScan ? `Last recalculated ${new Date(data.lastScan).toLocaleString()}` : "Computed live (not yet saved — hit Recalculate to persist history)"}
            {data.source ? ` · ${data.source}` : ""}
          </div>
        </>
      )}
    </div>
  );
}
