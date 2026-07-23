// Reusable executive dashboard widgets (M9.6). Each takes a `t` theme object
// { bg2, bg3, bdr, txt, txt2, B } so they work in any panel + dark mode.

const HEALTH_COLOR = { excellent: "#059669", good: "#10b981", fair: "#D97706", poor: "#ea580c", critical: "#DC2626" };
const TONE_COLOR = { positive: "#059669", negative: "#DC2626", warning: "#D97706", neutral: "#0891B2" };

export function ExecutiveCard({ t, label, value, unit, sub, accent }) {
  return (
    <div style={{ background: t.bg2, border: `1px solid ${t.bdr}`, borderRadius: 12, padding: "16px 18px",
      ...(accent ? { borderLeft: `3px solid ${accent}` } : {}) }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: t.txt2 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 6 }}>
        <span style={{ fontSize: 30, fontWeight: 800, color: accent || t.txt, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" }}>{value}</span>
        {unit && <span style={{ fontSize: 14, color: t.txt2, fontWeight: 600 }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: 12, color: t.txt2, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export function HealthGauge({ t, label, score, band }) {
  const color = band ? HEALTH_COLOR[band] : (score >= 70 ? "#059669" : score >= 45 ? "#D97706" : "#DC2626");
  return (
    <div style={{ background: t.bg2, border: `1px solid ${t.bdr}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, color: t.txt, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>{score}</span>
      </div>
      <div style={{ height: 7, background: t.bg3, borderRadius: 99, overflow: "hidden" }}>
        <div style={{ width: `${Math.max(0, Math.min(100, score))}%`, height: "100%", background: color, borderRadius: 99 }} />
      </div>
    </div>
  );
}

export function TrendCard({ t, label, value, trend }) {
  const dir = trend?.direction || "flat";
  const c = dir === "up" ? "#059669" : dir === "down" ? "#DC2626" : t.txt2;
  const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "▬";
  return (
    <div style={{ background: t.bg2, border: `1px solid ${t.bdr}`, borderRadius: 12, padding: "16px 18px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: t.txt2 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
        <span style={{ fontSize: 28, fontWeight: 800, color: t.txt }}>{value}</span>
        {trend && <span style={{ fontSize: 14, fontWeight: 700, color: c }}>{arrow} {trend.delta > 0 ? "+" : ""}{trend.delta}</span>}
      </div>
    </div>
  );
}

export function PriorityList({ t, title, items = [], emptyText = "Nothing here." }) {
  const pc = p => ({ critical: "#DC2626", high: "#ea580c", medium: "#D97706", low: "#0891B2" }[p] || t.txt2);
  return (
    <div style={{ background: t.bg2, border: `1px solid ${t.bdr}`, borderRadius: 12, padding: "16px 18px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: t.txt2, marginBottom: 12 }}>{title}</div>
      {items.length === 0 ? <div style={{ fontSize: 13, color: t.txt2 }}>{emptyText}</div> : (
        <div style={{ display: "grid", gap: 9 }}>
          {items.map((it, i) => (
            <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
              {it.priority && <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: pc(it.priority), background: t.bg3, borderRadius: 5, padding: "3px 6px", whiteSpace: "nowrap", marginTop: 1 }}>{it.priority}</span>}
              <span style={{ fontSize: 13, color: t.txt, lineHeight: 1.5 }}>{it.action || it.title || it}{it.source ? <span style={{ color: t.txt2 }}> · {it.source}</span> : null}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function InsightCard({ t, insight }) {
  const c = TONE_COLOR[insight.tone] || t.txt2;
  const icon = insight.tone === "positive" ? "↗" : insight.tone === "negative" ? "↘" : insight.tone === "warning" ? "⚠" : "•";
  return (
    <div style={{ background: t.bg2, border: `1px solid ${t.bdr}`, borderLeft: `3px solid ${c}`, borderRadius: 10, padding: "12px 14px", display: "flex", gap: 10 }}>
      <span style={{ color: c, fontWeight: 800 }}>{icon}</span>
      <span style={{ fontSize: 13, color: t.txt, lineHeight: 1.5 }}>{insight.text}</span>
    </div>
  );
}

export function AlertBanner({ t, alerts = [] }) {
  if (!alerts.length) return null;
  return (
    <div style={{ background: t.dark ? "#2e1418" : "#fbe4e7", border: "1px solid #DC2626", borderRadius: 12, padding: "12px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: alerts.length > 1 ? 6 : 0 }}>
        <span style={{ fontSize: 15 }}>🚨</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#DC2626" }}>{alerts.length} Critical Alert{alerts.length > 1 ? "s" : ""}</span>
      </div>
      <div style={{ display: "grid", gap: 3 }}>
        {alerts.map((a, i) => <div key={i} style={{ fontSize: 12.5, color: t.dark ? "#f0697b" : "#991b1b" }}>· {a.title}</div>)}
      </div>
    </div>
  );
}

export function QuickActionCard({ t, label, icon, onClick }) {
  return (
    <button onClick={onClick} style={{ background: t.bg2, border: `1px solid ${t.bdr}`, borderRadius: 12, padding: "14px 12px",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer", color: t.txt }}>
      <span style={{ fontSize: 22 }}>{icon}</span>
      <span style={{ fontSize: 12, fontWeight: 600, textAlign: "center" }}>{label}</span>
    </button>
  );
}

export function MiniTimeline({ t, points = [] }) {
  if (!points.length) return null;
  const vals = points.map(p => p.overall ?? p.value ?? 0);
  const max = Math.max(...vals, 1), min = Math.min(...vals, 0);
  const range = max - min || 1;
  return (
    <div style={{ background: t.bg2, border: `1px solid ${t.bdr}`, borderRadius: 12, padding: "16px 18px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: t.txt2, marginBottom: 12 }}>Score Trend</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 48 }}>
        {vals.map((v, i) => (
          <div key={i} title={String(v)} style={{ flex: 1, background: t.B, opacity: .4 + .6 * (i / Math.max(vals.length - 1, 1)),
            height: `${((v - min) / range) * 100}%`, minHeight: 3, borderRadius: "3px 3px 0 0" }} />
        ))}
      </div>
    </div>
  );
}

export function ActivityFeed({ t, items = [] }) {
  return (
    <div style={{ background: t.bg2, border: `1px solid ${t.bdr}`, borderRadius: 12, padding: "16px 18px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: t.txt2, marginBottom: 12 }}>Recent Activity</div>
      {items.length === 0 ? <div style={{ fontSize: 13, color: t.txt2 }}>No recent activity.</div> : (
        <div style={{ display: "grid", gap: 8 }}>
          {items.map((it, i) => (
            <div key={i} style={{ display: "flex", gap: 8, fontSize: 12.5, color: t.txt }}>
              <span style={{ color: t.txt2 }}>·</span>
              <span style={{ flex: 1 }}>{it.title}</span>
              {it.at && <span style={{ color: t.txt2, fontSize: 11 }}>{new Date(it.at).toLocaleDateString?.() || ""}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
