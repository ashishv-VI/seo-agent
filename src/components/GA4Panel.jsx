/**
 * GA4Panel — Live Google Analytics 4 Dashboard (Per-Client)
 *
 * Shows real multi-page analytics using GA4 Data API.
 * Tabs: Overview · Pages · Traffic Sources · User Journey · Real-time
 */
import { useState, useEffect, useCallback } from "react";

const B = "#443DCB";

export default function GA4Panel({ dark, clientId, getToken, API }) {
  const [status,      setStatus]      = useState(null);   // { connected, propertyId, properties[] }
  const [analytics,   setAnalytics]   = useState(null);
  const [journey,     setJourney]     = useState(null);
  const [realtime,    setRealtime]    = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [activeTab,   setActiveTab]   = useState("overview");
  const [days,        setDays]        = useState(30);
  const [compare,     setCompare]     = useState(false);
  const [error,       setError]       = useState("");
  const [propIdInput, setPropIdInput] = useState("");
  const [savingProp,  setSavingProp]  = useState(false);

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#2a2a2a" : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#777"    : "#888";

  const tab = (a) => ({
    padding: "5px 14px", borderRadius: 16, fontSize: 12, cursor: "pointer",
    fontWeight: a ? 600 : 400,
    background: a ? `${B}22` : "transparent",
    color:      a ? "#6B62E8" : txt2,
    border:     `1px solid ${a ? `${B}44` : bdr}`,
  });

  // ── Load status ─────────────────────────────────────────────────────────────
  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res   = await fetch(`${API}/api/ga4/${clientId}/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data  = await res.json();
      setStatus(data.connected ? data : null);
      if (data.propertyId) setPropIdInput(data.propertyId);
    } catch { setStatus(null); }
    setLoading(false);
  }, [clientId, getToken, API]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  // ── Load analytics data ──────────────────────────────────────────────────────
  const loadData = useCallback(async (daysVal, cmp) => {
    if (!status?.connected || !status?.propertyId) return;
    setDataLoading(true); setError("");
    try {
      const token = await getToken();
      const [analyticsRes, journeyRes, realtimeRes] = await Promise.all([
        fetch(`${API}/api/ga4/${clientId}/analytics?days=${daysVal}&compare=${cmp}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/api/ga4/${clientId}/journey?days=${daysVal}`,                  { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/api/ga4/${clientId}/realtime`,                                 { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
      ]);
      const analyticsData = await analyticsRes.json();
      const journeyData   = await journeyRes.json();
      const realtimeData  = realtimeRes ? await realtimeRes.json().catch(() => null) : null;

      if (!analyticsRes.ok) throw new Error(analyticsData.error || "Failed to load analytics");
      setAnalytics(analyticsData);
      setJourney(journeyData.error ? null : journeyData);
      setRealtime(realtimeData?.error ? null : realtimeData);
    } catch (e) { setError(e.message); }
    setDataLoading(false);
  }, [status, clientId, getToken, API]);

  useEffect(() => {
    if (status?.connected && status?.propertyId) {
      loadData(days, compare);
    }
  }, [status, days, compare]);

  // ── Save property ID ─────────────────────────────────────────────────────────
  async function savePropertyId() {
    if (!propIdInput.trim()) return;
    setSavingProp(true); setError("");
    try {
      const token = await getToken();
      const res   = await fetch(`${API}/api/ga4/${clientId}/property`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body:    JSON.stringify({ propertyId: propIdInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save property ID");
      await loadStatus();
    } catch (e) { setError(e.message); }
    setSavingProp(false);
  }

  // ── Helper: format numbers ───────────────────────────────────────────────────
  function fmt(n) {
    if (!n && n !== 0) return "—";
    if (n >= 1000000) return `${(n/1000000).toFixed(1)}M`;
    if (n >= 1000)    return `${(n/1000).toFixed(1)}K`;
    return Math.round(n).toLocaleString();
  }
  function fmtSec(n) {
    if (!n) return "0s";
    const m = Math.floor(n / 60);
    const s = Math.round(n % 60);
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }
  function fmtPct(n) {
    return `${(n * 100).toFixed(1)}%`;
  }

  // ── Loading state ────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ padding: 40, textAlign: "center", color: txt2, fontSize: 13 }}>
      Loading Google Analytics…
    </div>
  );

  // ── Not connected state ──────────────────────────────────────────────────────
  if (!status?.connected) return (
    <div style={{ padding: 20 }}>
      <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 14, padding: "32px 24px", textAlign: "center", maxWidth: 540, margin: "0 auto" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: txt, marginBottom: 8 }}>Connect Google Analytics 4</div>
        <div style={{ fontSize: 13, color: txt2, lineHeight: 1.6, marginBottom: 20 }}>
          Connect this client's Google Analytics account to unlock real-time multi-page analytics,
          traffic source breakdowns, user journey maps, and page-level performance tracking.
        </div>
        <div style={{ padding: "14px 16px", borderRadius: 10, background: `${B}11`, border: `1px solid ${B}33`, marginBottom: 20, textAlign: "left" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#6B62E8", marginBottom: 8 }}>To connect GA4:</div>
          {["Go to Integrations tab → click Connect Google Analytics", "Sign in with the client's Google account that has GA4 access", "Select which GA4 property to use for this client"].map((s, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", background: `${B}22`, color: "#6B62E8", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i+1}</div>
              <div style={{ fontSize: 12, color: txt2, lineHeight: 1.5 }}>{s}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── Connected but no property selected ───────────────────────────────────────
  if (status?.connected && !status?.propertyId) return (
    <div style={{ padding: 20 }}>
      <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 14, padding: "24px", maxWidth: 580, margin: "0 auto" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: txt, marginBottom: 6 }}>Select GA4 Property</div>
        <div style={{ fontSize: 12, color: txt2, marginBottom: 16 }}>
          Connected as <strong>{status.email}</strong>. Now select which GA4 property to use.
        </div>

        {error && <div style={{ padding: "10px 14px", borderRadius: 8, background: "#DC262611", color: "#DC2626", fontSize: 12, marginBottom: 14 }}>{error}</div>}

        {/* Property picker */}
        {status.properties?.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: txt2, fontWeight: 600, marginBottom: 8 }}>ACCESSIBLE PROPERTIES</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {status.properties.map(p => (
                <button key={p.propertyId} onClick={() => { setPropIdInput(p.propertyId); }}
                  style={{ padding: "10px 14px", borderRadius: 8, border: `2px solid ${propIdInput === p.propertyId ? B : bdr}`, background: propIdInput === p.propertyId ? `${B}11` : bg3, cursor: "pointer", textAlign: "left" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: txt }}>{p.propertyName}</div>
                  <div style={{ fontSize: 11, color: txt2 }}>ID: {p.propertyId} · {p.accountName}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Manual entry */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: txt2, marginBottom: 6 }}>Or enter property ID manually:</div>
          <input
            type="text"
            placeholder="123456789"
            value={propIdInput}
            onChange={e => setPropIdInput(e.target.value)}
            style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${bdr}`, background: bg2, color: txt, fontSize: 13, outline: "none", boxSizing: "border-box" }}
          />
          <div style={{ fontSize: 11, color: txt2, marginTop: 4 }}>
            Find in GA4: Admin → Property → Property ID (numeric, not G-XXXXXXXX)
          </div>
        </div>

        <button onClick={savePropertyId} disabled={savingProp || !propIdInput.trim()}
          style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: B, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          {savingProp ? "Saving…" : "Use This Property"}
        </button>
      </div>
    </div>
  );

  // ── Full dashboard ───────────────────────────────────────────────────────────
  const ov   = analytics?.overview     || {};
  const prev = analytics?.overviewPrev || {};

  function delta(key) {
    if (!analytics?.compare || !prev[key]) return null;
    const cur = ov[key] || 0;
    const pre = prev[key] || 0;
    if (pre === 0) return null;
    const pct = ((cur - pre) / pre * 100).toFixed(1);
    const up  = cur >= pre;
    return { pct, up };
  }

  return (
    <div style={{ padding: "0 0 24px" }}>
      {/* Header bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: txt }}>Google Analytics 4</div>
          <div style={{ fontSize: 11, color: txt2 }}>Property {status.propertyId} · {status.email}</div>
        </div>

        {/* Realtime badge */}
        {realtime && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 20, background: "#05966915", border: "1px solid #05966940" }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#059669", animation: "pulse 2s infinite" }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "#059669" }}>{realtime.activeUsers} active now</span>
          </div>
        )}

        {/* Days selector */}
        <select value={days} onChange={e => setDays(Number(e.target.value))}
          style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${bdr}`, background: bg2, color: txt, fontSize: 12, cursor: "pointer" }}>
          {[7, 14, 30, 60, 90].map(d => <option key={d} value={d}>Last {d} days</option>)}
        </select>

        {/* Compare toggle */}
        <button
          onClick={() => setCompare(c => !c)}
          style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${compare ? "#443DCB" : bdr}`, background: compare ? "#443DCB11" : "transparent", color: compare ? "#443DCB" : txt2, fontSize: 12, cursor: "pointer", fontWeight: compare ? 700 : 400 }}
        >
          {compare ? "✓ Compare ON" : "Compare"}
        </button>
        {compare && <span style={{ fontSize: 11, color: txt2 }}>vs prev {days}d</span>}

        <button onClick={() => loadData(days, compare)} disabled={dataLoading}
          style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${bdr}`, background: bg3, color: txt2, fontSize: 12, cursor: "pointer" }}>
          {dataLoading ? "⏳" : "↻ Refresh"}
        </button>

        {/* Change property */}
        <button onClick={() => setStatus(s => ({ ...s, propertyId: null }))}
          style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${bdr}`, background: "transparent", color: txt2, fontSize: 11, cursor: "pointer" }}>
          ⚙ Property
        </button>
      </div>

      {error && <div style={{ padding: "10px 14px", borderRadius: 8, background: "#DC262611", color: "#DC2626", fontSize: 12, marginBottom: 14 }}>{error}<button onClick={() => setError("")} style={{ marginLeft: 8, background: "none", border: "none", color: "#DC2626", cursor: "pointer" }}>×</button></div>}

      {dataLoading && <div style={{ padding: "12px 0", color: txt2, fontSize: 12, textAlign: "center" }}>Loading GA4 data…</div>}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {[["overview","📊 Overview"],["pages","📄 Pages"],["sources","🔗 Traffic"],["journey","🗺 Journey"],["realtime","🟢 Real-time"]].map(([id,label]) => (
          <div key={id} style={tab(activeTab === id)} onClick={() => setActiveTab(id)}>{label}</div>
        ))}
      </div>

      {/* ── Overview Tab ── */}
      {activeTab === "overview" && analytics && (
        <>
          {/* KPI grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginBottom: 16 }}>
            {[
              { label: "Sessions",        value: fmt(ov.sessions),                            color: B,         key: "sessions" },
              { label: "Users",           value: fmt(ov.activeUsers),                         color: "#059669", key: "activeUsers" },
              { label: "Page Views",      value: fmt(ov.screenPageViews),                     color: "#D97706", key: "screenPageViews" },
              { label: "New Users",       value: fmt(ov.newUsers),                            color: "#2563EB", key: "newUsers" },
              { label: "Bounce Rate",     value: ov.bounceRate ? fmtPct(ov.bounceRate) : "—", color: "#DC2626", key: null },
              { label: "Avg Session",     value: fmtSec(ov.averageSessionDuration),           color: "#7C3AED", key: "averageSessionDuration" },
              { label: "Engagement Rate", value: ov.engagementRate ? fmtPct(ov.engagementRate) : "—", color: "#0891B2", key: null },
            ].map(k => {
              const d = k.key ? delta(k.key) : null;
              return (
                <div key={k.label} style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: txt2, marginBottom: 4 }}>{k.label.toUpperCase()}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: k.color }}>{k.value}</div>
                  {d && (
                    <div style={{ fontSize: 11, marginTop: 4, color: d.up ? "#059669" : "#DC2626", fontWeight: 600 }}>
                      {d.up ? "↑" : "↓"} {Math.abs(d.pct)}% vs prev {days}d
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Date trend chart */}
          {analytics.dates?.length > 0 && (
            <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, padding: "14px 16px", marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: txt, marginBottom: 10 }}>Sessions Over Time</div>
              <SparkBarChart data={analytics.dates} metricKey="sessions" color={B} dark={dark} />
            </div>
          )}

          {/* Top pages quick list */}
          {analytics.pages?.length > 0 && (
            <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: txt, marginBottom: 10 }}>Top 5 Pages</div>
              {analytics.pages.slice(0, 5).map((p, i) => (
                <PageBar key={i} page={p} max={analytics.pages[0]?.screenPageViews || 1} dark={dark} txt={txt} txt2={txt2} bdr={bdr} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Pages Tab ── */}
      {activeTab === "pages" && analytics && (
        <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${bdr}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: txt }}>All Pages ({analytics.pages?.length || 0})</div>
            <div style={{ fontSize: 11, color: txt2 }}>Last {days} days</div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: bg3 }}>
                  {["Page", "Views", "Sessions", "Users", "Avg Time", "Bounce"].map(h => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: h === "Page" ? "left" : "right", color: txt2, fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(analytics.pages || []).map((p, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${bdr}`, background: i % 2 === 0 ? "transparent" : bg3 }}>
                    <td style={{ padding: "8px 12px", color: txt, maxWidth: 280 }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11 }}>{p.pagePath}</div>
                      {p.pageTitle && p.pageTitle !== p.pagePath && (
                        <div style={{ fontSize: 10, color: txt2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.pageTitle}</div>
                      )}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: B }}>{fmt(p.screenPageViews)}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", color: txt }}>{fmt(p.sessions)}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", color: txt }}>{fmt(p.activeUsers)}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", color: txt }}>{fmtSec(p.averageSessionDuration)}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", color: p.bounceRate > 0.7 ? "#DC2626" : p.bounceRate > 0.5 ? "#D97706" : "#059669" }}>
                      {p.bounceRate ? fmtPct(p.bounceRate) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Traffic Sources Tab ── */}
      {activeTab === "sources" && analytics && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12 }}>
          {/* Channel groups */}
          <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: txt, marginBottom: 12 }}>Traffic Channels</div>
            {(analytics.sources || []).map((s, i) => {
              const max = analytics.sources[0]?.sessions || 1;
              const pct = Math.round((s.sessions / max) * 100);
              const channelColor = {
                "Organic Search": "#059669", "Direct": "#2563EB", "Referral": "#D97706",
                "Organic Social": "#7C3AED", "Email": "#0891B2", "Paid Search": "#DC2626",
              }[s.sessionDefaultChannelGroup] || B;
              return (
                <div key={i} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: txt, fontWeight: 600 }}>{s.sessionDefaultChannelGroup || "Unknown"}</span>
                    <span style={{ fontSize: 12, color: channelColor, fontWeight: 700 }}>{fmt(s.sessions)}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: bg3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: channelColor, borderRadius: 3, transition: "width 0.4s" }} />
                  </div>
                  <div style={{ fontSize: 10, color: txt2, marginTop: 2 }}>{fmt(s.activeUsers)} users · {fmt(s.screenPageViews)} views</div>
                </div>
              );
            })}
          </div>

          {/* Devices */}
          <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: txt, marginBottom: 12 }}>Devices</div>
            {(analytics.devices || []).map((d, i) => {
              const icons = { desktop: "🖥️", mobile: "📱", tablet: "📲" };
              const colors = { desktop: "#2563EB", mobile: "#059669", tablet: "#D97706" };
              const total  = (analytics.devices || []).reduce((a, x) => a + x.sessions, 0) || 1;
              const pct    = Math.round((d.sessions / total) * 100);
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, padding: "8px 12px", borderRadius: 8, background: bg3 }}>
                  <div style={{ fontSize: 20 }}>{icons[d.deviceCategory] || "💻"}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: txt, textTransform: "capitalize" }}>{d.deviceCategory}</div>
                    <div style={{ height: 4, borderRadius: 2, background: bdr, marginTop: 4, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: colors[d.deviceCategory] || B }} />
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: colors[d.deviceCategory] || B }}>{pct}%</div>
                    <div style={{ fontSize: 10, color: txt2 }}>{fmt(d.sessions)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Journey Tab ── */}
      {activeTab === "journey" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12 }}>
          {/* Landing pages */}
          <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: txt, marginBottom: 4 }}>Top Landing Pages</div>
            <div style={{ fontSize: 11, color: txt2, marginBottom: 12 }}>Where users enter your site</div>
            {journey ? (journey.landingPages || []).slice(0, 15).map((p, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: i < 14 ? `1px solid ${bdr}` : "none" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: txt2, width: 20, flexShrink: 0 }}>#{i+1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: txt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.landingPage || "/"}</div>
                  <div style={{ fontSize: 10, color: "#DC2626" }}>{p.bounceRate ? `${fmtPct(p.bounceRate)} bounce` : ""}</div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#059669", flexShrink: 0 }}>{fmt(p.sessions)}</div>
              </div>
            )) : <div style={{ color: txt2, fontSize: 12 }}>No journey data</div>}
          </div>

          {/* Exit pages */}
          <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: txt, marginBottom: 4 }}>Top Exit Pages</div>
            <div style={{ fontSize: 11, color: txt2, marginBottom: 12 }}>Where users leave your site</div>
            {journey ? (journey.exitPages || []).slice(0, 15).map((p, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: i < 14 ? `1px solid ${bdr}` : "none" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: txt2, width: 20, flexShrink: 0 }}>#{i+1}</div>
                <div style={{ flex: 1, minWidth: 0, fontSize: 11, color: txt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.exitPage || "/"}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#DC2626", flexShrink: 0 }}>{fmt(p.sessions)}</div>
              </div>
            )) : <div style={{ color: txt2, fontSize: 12 }}>No journey data</div>}
          </div>

          {/* Source → Landing journey */}
          {journey?.sourceJourney?.length > 0 && (
            <div style={{ gridColumn: "1 / -1", background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: txt, marginBottom: 4 }}>Traffic Source → Landing Page</div>
              <div style={{ fontSize: 11, color: txt2, marginBottom: 12 }}>How users arrive and where they go</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: bg3 }}>
                      <th style={{ padding: "7px 10px", textAlign: "left", color: txt2 }}>Channel</th>
                      <th style={{ padding: "7px 10px", textAlign: "left", color: txt2 }}>Landing Page</th>
                      <th style={{ padding: "7px 10px", textAlign: "right", color: txt2 }}>Sessions</th>
                      <th style={{ padding: "7px 10px", textAlign: "right", color: txt2 }}>Users</th>
                    </tr>
                  </thead>
                  <tbody>
                    {journey.sourceJourney.slice(0, 20).map((r, i) => (
                      <tr key={i} style={{ borderTop: `1px solid ${bdr}` }}>
                        <td style={{ padding: "7px 10px" }}>
                          <span style={{ padding: "2px 8px", borderRadius: 10, background: `${B}11`, color: B, fontSize: 11, fontWeight: 600 }}>
                            {r.sessionDefaultChannelGroup || "Unknown"}
                          </span>
                        </td>
                        <td style={{ padding: "7px 10px", color: txt, fontSize: 11, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.landingPage || "/"}
                        </td>
                        <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 600, color: txt }}>{fmt(r.sessions)}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right", color: txt2 }}>{fmt(r.activeUsers)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Real-time Tab ── */}
      {activeTab === "realtime" && (
        <div style={{ maxWidth: 600 }}>
          <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: "20px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#059669" }} />
              <div style={{ fontSize: 15, fontWeight: 700, color: txt }}>Real-time Activity</div>
              <div style={{ fontSize: 11, color: txt2 }}>Active users in last 30 minutes</div>
            </div>

            {realtime ? (
              <>
                <div style={{ textAlign: "center", marginBottom: 20 }}>
                  <div style={{ fontSize: 52, fontWeight: 900, color: "#059669", lineHeight: 1 }}>{realtime.activeUsers}</div>
                  <div style={{ fontSize: 13, color: txt2, marginTop: 4 }}>active users right now</div>
                </div>

                {realtime.activePages?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: txt, marginBottom: 10 }}>Active Pages</div>
                    {realtime.activePages.map((p, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", borderRadius: 8, background: bg3, marginBottom: 6 }}>
                        <span style={{ fontSize: 12, color: txt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{p.unifiedScreenName || "/"}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#059669", flexShrink: 0, marginLeft: 10 }}>{Math.round(p.activeUsers)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign: "center", color: txt2, fontSize: 13, padding: "20px 0" }}>
                Real-time data unavailable. Make sure the GA4 property is receiving data.
              </div>
            )}

            <button onClick={() => loadData(days)} style={{ marginTop: 16, padding: "8px 18px", borderRadius: 8, border: `1px solid ${bdr}`, background: bg3, color: txt2, fontSize: 12, cursor: "pointer" }}>
              ↻ Refresh
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Internal: Spark bar chart for date trend ──────────────────────────────────
function SparkBarChart({ data, metricKey, color, dark }) {
  const max     = Math.max(...data.map(d => d[metricKey] || 0), 1);
  const bg3     = dark ? "#1a1a1a" : "#f0f0ea";
  const txt2    = dark ? "#777" : "#888";
  const showLabels = data.length <= 14;

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 60, overflow: "hidden" }}>
      {data.map((d, i) => {
        const h = Math.max(2, Math.round((d[metricKey] / max) * 56));
        const label = d.date ? d.date.slice(5) : ""; // MM-DD
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }} title={`${d.date}: ${Math.round(d[metricKey]).toLocaleString()}`}>
            <div style={{ flex: 1, display: "flex", alignItems: "flex-end" }}>
              <div style={{ width: "100%", height: h, background: color, borderRadius: "2px 2px 0 0", opacity: 0.8, minWidth: 3 }} />
            </div>
            {showLabels && i % 3 === 0 && (
              <div style={{ fontSize: 8, color: txt2, whiteSpace: "nowrap", marginTop: 2 }}>{label}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Internal: Page bar row ────────────────────────────────────────────────────
function PageBar({ page, max, dark, txt, txt2, bdr }) {
  const pct  = Math.round((page.screenPageViews / max) * 100);
  const B    = "#443DCB";
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 11, color: txt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: 8 }}>{page.pagePath}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: B, flexShrink: 0 }}>{Math.round(page.screenPageViews).toLocaleString()}</span>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: dark ? "#2a2a2a" : "#e8e8e0", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${B}, #059669)`, borderRadius: 3 }} />
      </div>
    </div>
  );
}
