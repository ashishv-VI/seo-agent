import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { makeTheme } from "../theme/theme";
import { Button, EmptyState } from "./ui";
import { ExecutiveCard, HealthGauge, TrendCard, InsightCard, MiniTimeline } from "./ExecutiveWidgets";

// Business Intelligence panel (M10.3) — executive BI over existing metrics.
// Reads /business-intelligence (+ /history). Reuses M10.1 primitives + widgets.

const TONE = { positive: "#059669", negative: "#DC2626", warning: "#D97706", neutral: "#0891B2" };

export default function BusinessIntelligencePanel({ dark, clientId }) {
  const { user, API } = useAuth();
  const [bi, setBi] = useState(null);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const t = makeTheme(dark);

  async function load() {
    setLoading(true); setError("");
    try {
      const token = await user.getIdToken();
      const [r1, r2] = await Promise.all([
        fetch(`${API}/api/agents/${clientId}/business-intelligence`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/api/agents/${clientId}/business-intelligence/history`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const j1 = await r1.json();
      if (r1.ok) setBi(j1); else setError(j1.error || "Failed to load");
      if (r2.ok) setHistory(await r2.json());
    } catch (e) { setError(e.message); }
    setLoading(false);
  }
  useEffect(() => { if (clientId) load(); }, [clientId]);

  const label = { ...t.type.caption, color: t.color.muted };
  if (loading) {
    return <div style={{ background: t.color.surface, border: `1px solid ${t.color.border}`, borderRadius: t.radius.lg, padding: 18, textAlign: "center", color: t.color.muted }}>
      <div style={{ fontSize: 22, marginBottom: 8 }}>📊</div>Loading business intelligence…</div>;
  }
  if (error) {
    return <div style={{ background: t.color.surface, border: "1px solid #DC2626", borderRadius: t.radius.lg, padding: 18, color: "#DC2626" }}>{error}</div>;
  }

  const hasData = bi && (bi.businessImpact > 0 || (bi.trends?.score?.series || []).length > 0);
  if (!hasData) {
    return <EmptyState t={t} icon="📊" title="No business intelligence yet"
      description="Run the pipeline and scans over a few cycles so the platform can compute growth, ROI, risk, and trend analytics."
      action={<Button t={t} onClick={load}>Refresh</Button>} />;
  }

  const kpiColor = (k) => k.invert
    ? (k.value >= 60 ? "#DC2626" : k.value >= 35 ? "#D97706" : "#059669")   // risk: lower is better
    : (k.value >= 70 ? "#059669" : k.value >= 45 ? "#D97706" : "#DC2626");

  return (
    <div style={{ padding: "0 0 24px", display: "grid", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ ...t.type.h2, color: t.color.text, margin: 0 }}>Business Intelligence</h2>
          <div style={{ ...t.type.small, color: t.color.muted, marginTop: 2 }}>{bi.executiveSummary}</div>
        </div>
        <Button t={t} variant="secondary" onClick={load}>↻ Refresh</Button>
      </div>

      {/* Executive KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        {bi.kpis.map(k => (
          <ExecutiveCard key={k.key} t={t} label={k.label} value={k.value} unit={k.unit}
            accent={kpiColor(k)} sub={k.trend ? `trend: ${k.trend}` : undefined} />
        ))}
      </div>

      {/* Historical score chart + trend cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
        <MiniTimeline t={t} points={(bi.trends?.score?.series || []).map(v => ({ overall: v }))} />
        <div style={{ display: "grid", gap: 12 }}>
          <TrendCard t={t} label="Growth Momentum" value={bi.growthScore} trend={bi.trends?.score} />
          <TrendCard t={t} label="AI Visibility" value={bi.aiVisibilityScore} trend={bi.trends?.visibility} />
        </div>
      </div>

      {/* Health gauges */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        <HealthGauge t={t} label="Technical Health" score={bi.technicalHealth} />
        <HealthGauge t={t} label="Content Velocity" score={bi.contentVelocity} />
        <HealthGauge t={t} label="Pipeline Efficiency" score={bi.pipelineEfficiency} />
        <HealthGauge t={t} label="Forecast Confidence" score={bi.forecastConfidence} />
        <HealthGauge t={t} label="Opportunity" score={bi.opportunityScore} />
      </div>

      {/* Risk matrix + ROI */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <div style={{ background: t.color.surface, border: `1px solid ${t.color.border}`, borderRadius: t.radius.lg, padding: "16px 18px" }}>
          <div style={{ ...label, marginBottom: 10 }}>Risk Matrix</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 30, fontWeight: 800, color: bi.riskScore >= 50 ? "#DC2626" : bi.riskScore >= 30 ? "#D97706" : "#059669" }}>{bi.riskScore}</span>
            <span style={{ ...t.type.small, color: t.color.muted }}>/100 risk</span>
          </div>
          <div style={{ ...t.type.small, color: t.color.muted, marginTop: 6 }}>
            {bi.riskScore >= 50 ? "Multiple negative signals converging — act now." : bi.riskScore >= 30 ? "Some risk signals present." : "Low risk — signals healthy."}
          </div>
        </div>
        <div style={{ background: t.color.surface, border: `1px solid ${t.color.border}`, borderRadius: t.radius.lg, padding: "16px 18px" }}>
          <div style={{ ...label, marginBottom: 10 }}>ROI</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 30, fontWeight: 800, color: "#059669" }}>{bi.roiScore}</span>
            <span style={{ ...t.type.small, color: t.color.muted }}>/100</span>
          </div>
          <div style={{ ...t.type.small, color: t.color.muted, marginTop: 6 }}>Conversions vs LLM spend.</div>
        </div>
        {(bi.correlations || []).length > 0 && (
          <div style={{ background: t.color.surface, border: `1px solid ${t.color.border}`, borderRadius: t.radius.lg, padding: "16px 18px" }}>
            <div style={{ ...label, marginBottom: 10 }}>Correlations</div>
            {bi.correlations.map((c, i) => (
              <div key={i} style={{ ...t.type.small, color: t.color.text, marginBottom: 4 }}>
                <b>{c.pair}</b>: {c.coefficient} <span style={{ color: t.color.muted }}>— {c.note}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Executive insights */}
      <div style={{ display: "grid", gap: 10 }}>
        <div style={label}>Executive Insights</div>
        {(bi.insights || []).map((ins, i) => <InsightCard key={i} t={t} insight={ins} />)}
      </div>

      <div style={{ ...t.type.small, color: t.color.muted }}>
        {bi.generatedAt ? `Generated ${new Date(bi.generatedAt).toLocaleString()}` : ""}
        {history?.snapshots?.length ? ` · ${history.snapshots.length} historical snapshots` : ""}
      </div>
    </div>
  );
}
