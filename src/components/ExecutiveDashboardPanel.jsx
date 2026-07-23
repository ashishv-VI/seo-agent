import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { makeTheme } from "../theme/theme";
import { Button, EmptyState } from "./ui";
import {
  ExecutiveCard, HealthGauge, TrendCard, PriorityList, InsightCard,
  AlertBanner, QuickActionCard, MiniTimeline, ActivityFeed,
} from "./ExecutiveWidgets";

// AI Executive Command Center (M9.6) — mission control that aggregates every
// intelligence surface. Reads the single /executive-dashboard endpoint (all
// aggregation server-side). Reuses the ExecutiveWidgets library.

const HEALTH_COLOR = { excellent: "#059669", good: "#10b981", fair: "#D97706", poor: "#ea580c", critical: "#DC2626" };

export default function ExecutiveDashboardPanel({ dark, clientId, onNavigate }) {
  const { user, API } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Theme from the M10.1 design system (provides bg2/bg3/bdr/txt/txt2/B aliases
  // that the ExecutiveWidgets consume — visually identical to before).
  const t = makeTheme(dark);

  async function load() {
    setLoading(true); setError("");
    try {
      const token = await user.getIdToken();
      const r = await fetch(`${API}/api/agents/${clientId}/executive-dashboard`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await r.json();
      if (r.ok) setData(json); else setError(json.error || "Failed to load");
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  useEffect(() => { if (clientId) load(); }, [clientId]);

  const go = (tab) => { if (typeof onNavigate === "function") onNavigate(tab); };

  if (loading) {
    return <div style={{ ...cardStyle(t), textAlign: "center", color: t.txt2, margin: "0 0 24px" }}>
      <div style={{ fontSize: 24, marginBottom: 8 }}>🛰️</div>Loading Command Center…</div>;
  }
  if (error) {
    return <div style={{ ...cardStyle(t), borderColor: "#DC2626", color: "#DC2626", margin: "0 0 24px" }}>{error}</div>;
  }

  const ctx = data?.context || {};
  const health = data?.overallHealth || "critical";
  const hasData = (ctx.pipelineStatus && ctx.pipelineStatus !== "idle") || (data?.executiveScore ?? 0) > 0;

  if (!hasData) {
    return (
      <div style={{ margin: "0 0 24px" }}>
        <EmptyState t={t} icon="🚀" title="Command Center is ready"
          description="Run the pipeline and the visibility/optimization scans to populate mission control with live intelligence."
          action={<Button t={t} onClick={() => go("overview")}>Go to pipeline</Button>} />
      </div>
    );
  }

  const label = { fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: t.txt2 };

  return (
    <div style={{ padding: "0 0 24px", display: "grid", gap: 16 }}>
      {/* Executive Hero */}
      <div style={{ ...cardStyle(t), background: dark ? "linear-gradient(150deg,#14121f,#111 70%)" : "linear-gradient(150deg,#f5f3ff,#fff 70%)",
        borderColor: t.B, display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 52, fontWeight: 800, color: HEALTH_COLOR[health], lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{data.executiveScore}</div>
          <div style={{ fontSize: 12, color: t.txt2, marginTop: 4 }}>Executive Score</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: HEALTH_COLOR[health], textTransform: "capitalize", marginTop: 2 }}>{health}</div>
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: t.txt, letterSpacing: "-.01em" }}>{ctx.business?.name || "Command Center"}</div>
          <div style={{ fontSize: 13.5, color: t.txt2, marginTop: 6, lineHeight: 1.55 }}>{data.businessSummary}</div>
        </div>
      </div>

      {/* Critical alert banner */}
      <AlertBanner t={t} alerts={data.criticalAlerts || []} />

      {/* Client health gauges */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <HealthGauge t={t} label="Technical" score={data.technicalHealth} />
        <HealthGauge t={t} label="AI Visibility" score={data.visibilityHealth} />
        <HealthGauge t={t} label="Content / Answers" score={data.contentHealth} />
        <HealthGauge t={t} label="Execution" score={data.clientHealth} />
        <HealthGauge t={t} label="Pipeline" score={data.pipelineHealth} band={ctx.pipelineStatus === "complete" ? "excellent" : ctx.pipelineStatus === "failed" ? "critical" : "fair"} />
      </div>

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <ExecutiveCard t={t} label="SEO Score" value={ctx.score?.overall ?? "—"} unit="/100" accent={t.B} />
        {ctx.llmVisibility && <TrendCard t={t} label="AI Visibility" value={`${ctx.llmVisibility.visibilityScore}`} trend={ctx.llmVisibility.trend} />}
        {ctx.answerOptimization && <ExecutiveCard t={t} label="Optimization" value={ctx.answerOptimization.optimizationScore} unit={`/100 · ${ctx.answerOptimization.grade}`} />}
        {ctx.taskCenter && <ExecutiveCard t={t} label="Open Tasks" value={ctx.taskCenter.open ?? 0} sub={`${ctx.taskCenter.criticalTasks ?? 0} critical`} accent={ctx.taskCenter.criticalTasks ? "#DC2626" : undefined} />}
        <ExecutiveCard t={t} label="Quick Wins" value={data.quickWins} sub="low effort · high value" accent="#059669" />
        {data.expectedGrowth?.visibilityGainPotential > 0 && <ExecutiveCard t={t} label="Growth Potential" value={`+${data.expectedGrowth.visibilityGainPotential}`} sub="visibility points" accent="#059669" />}
      </div>

      {/* Two-column: priorities + insights */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        <PriorityList t={t} title="Today's Priorities · Recommended Actions" items={data.recommendedActions} emptyText="No urgent actions — keep executing." />
        <div style={{ display: "grid", gap: 10 }}>
          <div style={label}>AI Insights</div>
          {(data.insights || []).map((ins, i) => <InsightCard key={i} t={t} insight={ins} />)}
        </div>
      </div>

      {/* Wins + Risks + Trend */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        <PriorityList t={t} title="Top Wins" items={(data.topWins || []).map(w => ({ title: w }))} emptyText="No standout wins yet." />
        <PriorityList t={t} title="Top Risks" items={(data.topRisks || []).map(r => ({ title: r }))} emptyText="No major risks flagged." />
        <MiniTimeline t={t} points={ctx.scoreHistory || []} />
      </div>

      {/* Recent activity + Quick launch */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
        <ActivityFeed t={t} items={ctx.notificationsPreview || []} />
        <div>
          <div style={{ ...label, marginBottom: 10 }}>Quick Launch</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: 10 }}>
            <QuickActionCard t={t} icon="📊" label="Business Intel" onClick={() => go("bi")} />
            <QuickActionCard t={t} icon="🛰️" label="LLM Visibility" onClick={() => go("llmvisibility")} />
            <QuickActionCard t={t} icon="🎯" label="Answer Opt" onClick={() => go("answeropt")} />
            <QuickActionCard t={t} icon="🗂️" label="Task Center" onClick={() => go("taskcenter")} />
            <QuickActionCard t={t} icon="💬" label="Copilot" onClick={() => go("copilot")} />
          </div>
        </div>
      </div>

      <div style={{ fontSize: 11.5, color: t.txt2 }}>
        {data.generatedAt ? `Generated ${new Date(data.generatedAt).toLocaleString()}` : ""}
        {ctx.reportReady ? " · report ready" : ""} · pipeline {ctx.pipelineStatus}
      </div>
    </div>
  );
}

function cardStyle(t) {
  return { background: t.bg2, border: `1px solid ${t.bdr}`, borderRadius: 12, padding: "18px 20px" };
}
