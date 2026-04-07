import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

const B = "#443DCB";

// ── Inline SVG line chart — no chart library ──────────────────────────────────
function SparkLine({ data, width = 300, height = 80, color = B }) {
  if (!data || data.length < 2) return <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "#888", fontSize: 11 }}>Not enough data</div>;

  const maxY = Math.max(...data);
  const minY = Math.min(...data);
  const range = maxY - minY || 1;
  const pts   = data.map((y, i) => {
    const x = (i / (data.length - 1)) * (width - 20) + 10;
    const yv = height - 10 - ((y - minY) / range) * (height - 20);
    return `${x},${yv}`;
  });

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <defs>
        <linearGradient id="fg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {/* Fill area */}
      <polygon
        points={`10,${height - 10} ${pts.join(" ")} ${(data.length - 1) / (data.length - 1) * (width - 20) + 10},${height - 10}`}
        fill="url(#fg)"
      />
      {/* Line */}
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      {/* Last point dot */}
      {pts.length > 0 && (() => {
        const [lx, ly] = pts[pts.length - 1].split(",");
        return <circle cx={lx} cy={ly} r="4" fill={color} />;
      })()}
    </svg>
  );
}

export default function PredictiveForecastPanel({ dark, clientId, bg2, bg3, bdr, txt, txt2 }) {
  const { user, API }   = useAuth();
  const [data,   setData]   = useState(null);
  const [loading,setLoading]= useState(true);
  const [running,setRunning]= useState(false);
  const [error,  setError]  = useState(null);
  const [view,   setView]   = useState("forecast"); // forecast | opportunities | score

  async function getToken() { return user?.getIdToken?.() || ""; }

  async function load() {
    setLoading(true);
    setError(null);
    const token = await getToken();
    const res   = await fetch(`${API}/api/agents/${clientId}/A22/forecast`, { headers: { Authorization: `Bearer ${token}` } });
    const d     = await res.json().catch(() => ({}));
    setData(d?.status === "complete" ? d : null);
    setLoading(false);
  }

  async function run() {
    setRunning(true);
    setError(null);
    const token = await getToken();
    const res   = await fetch(`${API}/api/agents/${clientId}/A22/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    const d = await res.json().catch(() => ({}));
    if (d.success && d.forecast) {
      setData(d.forecast);
    } else {
      setError(d.error || "Prediction failed — run the full pipeline first to build data history");
    }
    setRunning(false);
  }

  useEffect(() => { load(); }, [clientId]);

  if (loading) return <div style={{ padding: 24, color: txt2 }}>Loading forecast...</div>;

  const tf  = data?.trafficForecast;
  const sp  = data?.scoreProjection;
  const ops = data?.opportunities || [];
  const sum = data?.summary || {};

  const trendColor = tf?.trend === "growing" ? "#059669" : tf?.trend === "declining" ? "#DC2626" : "#D97706";
  const forecastWeeks = tf?.weeks || [];
  const chartData = [...(tf?.dataPoints > 0 ? [tf.currentWeeklyClicks] : []), ...forecastWeeks.map(w => w.predicted)];

  return (
    <div style={{ padding: 24 }}>

      {/* ── Header ──────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: txt, marginBottom: 4 }}>Predictive Intelligence</div>
          <div style={{ fontSize: 12, color: txt2 }}>90-day traffic forecast + keyword opportunity ranking</div>
        </div>
        <button onClick={run} disabled={running}
          style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: B, color: "#fff", fontSize: 12, fontWeight: 700, cursor: running ? "not-allowed" : "pointer", opacity: running ? 0.7 : 1 }}>
          {running ? "⏳ Running..." : data ? "↻ Refresh Forecast" : "Run Forecast"}
        </button>
      </div>

      {error && (
        <div style={{ padding: 14, background: "#DC262608", border: "1px solid #DC262633", borderRadius: 10, color: "#DC2626", fontSize: 12, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {!data && !error && (
        <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔮</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: txt, marginBottom: 8 }}>No forecast yet</div>
          <div style={{ fontSize: 12, color: txt2 }}>Click "Run Forecast" to generate a 90-day traffic prediction and keyword opportunity scores.</div>
        </div>
      )}

      {data && (
        <>
          {/* ── Tab nav ─────────────────────────────────── */}
          <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: `1px solid ${bdr}` }}>
            {[
              { id: "forecast",      label: "Traffic Forecast" },
              { id: "opportunities", label: `Keyword Opportunities (${ops.length})` },
              { id: "score",         label: "Score Projection" },
            ].map(t => (
              <button key={t.id} onClick={() => setView(t.id)} style={{
                padding: "8px 14px", border: "none", borderRadius: "6px 6px 0 0",
                background: view === t.id ? bg2 : "transparent",
                color: view === t.id ? B : txt2,
                fontWeight: view === t.id ? 700 : 400,
                fontSize: 12, cursor: "pointer",
                borderBottom: view === t.id ? `2px solid ${B}` : "2px solid transparent",
              }}>{t.label}</button>
            ))}
          </div>

          {/* ── Traffic Forecast ─────────────────────── */}
          {view === "forecast" && tf && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 20 }}>
                {[
                  { label: "Current Weekly Clicks", value: tf.currentWeeklyClicks != null ? tf.currentWeeklyClicks.toLocaleString() : "—", color: txt },
                  { label: "Predicted in 90 Days",  value: tf.predicted90dClicks != null ? tf.predicted90dClicks.toLocaleString() : tf.predicted90dPct || "—", color: trendColor },
                  { label: "Trend",                 value: tf.trend ? (tf.trend[0].toUpperCase() + tf.trend.slice(1)) : "—", color: trendColor },
                ].map(s => (
                  <div key={s.label} style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, padding: "14px 16px" }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: s.color, marginBottom: 2 }}>{s.value}</div>
                    <div style={{ fontSize: 10, color: txt2 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Chart */}
              {chartData.length > 2 && (
                <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: txt }}>90-Day Traffic Projection</div>
                    <div style={{ fontSize: 10, color: txt2 }}>Confidence: <span style={{ color: tf.confidence === "high" ? "#059669" : tf.confidence === "medium" ? "#D97706" : "#DC2626", fontWeight: 700 }}>{tf.confidence}</span>{tf.rSquared != null && ` (R²=${tf.rSquared})`}</div>
                  </div>
                  <SparkLine data={chartData} width={500} height={100} color={trendColor} />
                  <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
                    {forecastWeeks.slice(-1).map(w => (
                      <div key={w.weekLabel} style={{ fontSize: 11, color: txt2 }}>
                        Week 13: <span style={{ color: trendColor, fontWeight: 700 }}>{w.predicted.toLocaleString()}</span> clicks
                        <span style={{ marginLeft: 8, color: txt2 }}>({w.low.toLocaleString()}–{w.high.toLocaleString()} range)</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {tf.note && (
                <div style={{ fontSize: 11, color: txt2, padding: 12, background: bg3, borderRadius: 8, border: `1px solid ${bdr}` }}>
                  ℹ️ {tf.note}
                </div>
              )}
            </>
          )}

          {/* ── Keyword Opportunities ─────────────────── */}
          {view === "opportunities" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
                {[
                  { label: "Opportunities", value: ops.length, color: B },
                  { label: "Weekly Traffic Potential", value: `+${(sum.weeklyTrafficPotential || 0).toLocaleString()} clicks`, color: "#059669" },
                  { label: "Monthly Potential", value: `+${(sum.monthlyTrafficPotential || 0).toLocaleString()} clicks`, color: "#D97706" },
                ].map(s => (
                  <div key={s.label} style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, padding: "12px 16px" }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 10, color: txt2 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1.5fr", padding: "10px 16px", background: bg3, borderBottom: `1px solid ${bdr}` }}>
                  {["Keyword", "Volume", "Position", "Opp. Score", "Action"].map(h => (
                    <div key={h} style={{ fontSize: 10, fontWeight: 700, color: txt2, textTransform: "uppercase" }}>{h}</div>
                  ))}
                </div>
                {ops.slice(0, 20).map((k, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1.5fr", padding: "12px 16px", borderBottom: i < 19 ? `1px solid ${bdr}` : "none", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: txt }}>{k.keyword}</div>
                      <div style={{ fontSize: 10, color: txt2 }}>{k.cluster} · {k.intent}</div>
                    </div>
                    <div style={{ fontSize: 12, color: txt2 }}>{k.searchVolume ? k.searchVolume.toLocaleString() : "—"}</div>
                    <div style={{ fontSize: 12, color: k.currentPosition && k.currentPosition <= 3 ? "#059669" : k.currentPosition && k.currentPosition <= 10 ? "#D97706" : "#DC2626" }}>
                      {k.currentPosition ? `#${k.currentPosition}` : "—"}
                      {k.targetPosition && k.currentPosition && k.targetPosition < k.currentPosition && (
                        <span style={{ fontSize: 10, color: "#059669", marginLeft: 4 }}>→#{k.targetPosition}</span>
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: k.opportunityScore > 50 ? B : txt }}>{k.opportunityScore}</div>
                      <div style={{ fontSize: 9, color: txt2 }}>+{k.weeklyTrafficGain}/wk</div>
                    </div>
                    <div style={{ fontSize: 10, color: txt2, lineHeight: 1.4 }}>{k.action}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── Score Projection ──────────────────────── */}
          {view === "score" && (
            <div>
              {sp ? (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 20 }}>
                    {[
                      { label: "Current SEO Score", value: sp.current != null ? `${sp.current}/100` : "—", color: txt },
                      { label: "Projected in 90 Days", value: sp.in90Days != null ? `${sp.in90Days}/100` : "—", color: sp.delta > 0 ? "#059669" : sp.delta < 0 ? "#DC2626" : txt },
                      { label: "Trend", value: sp.trend ? (sp.trend[0].toUpperCase() + sp.trend.slice(1)) : "—", color: sp.trend === "improving" ? "#059669" : sp.trend === "declining" ? "#DC2626" : "#D97706" },
                    ].map(s => (
                      <div key={s.label} style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, padding: "14px 16px" }}>
                        <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                        <div style={{ fontSize: 10, color: txt2 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                  {sp.delta != null && (
                    <div style={{ padding: 16, background: sp.delta >= 0 ? "#05966908" : "#DC262608", border: `1px solid ${sp.delta >= 0 ? "#05966930" : "#DC262630"}`, borderRadius: 10, fontSize: 12, color: txt }}>
                      {sp.delta >= 0
                        ? `At current trajectory, SEO score will improve by ${sp.delta} points over the next 90 days.`
                        : `Score is trending down by ${Math.abs(sp.delta)} points. Prioritise fixing P1 issues and run CMO Agent for strategy.`}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ padding: 24, textAlign: "center", color: txt2, fontSize: 12 }}>
                  Not enough score history (need 4+ weeks). Score projection will appear after more pipeline runs.
                </div>
              )}
            </div>
          )}

          <div style={{ fontSize: 10, color: txt2, marginTop: 16, textAlign: "right" }}>
            Generated: {data.generatedAt ? new Date(data.generatedAt).toLocaleString() : "—"} · Method: {data.forecastMethod}
          </div>
        </>
      )}
    </div>
  );
}
