import { useState, useEffect } from "react";

/**
 * ROIDashboard — Level 4 (ROI)
 *
 * Shows:
 *  - Traffic + revenue summary cards
 *  - Attributed fixes (which WP changes drove ranking improvements)
 *  - WP push log history
 *  - ROI settings (conversion rate, avg order value)
 *  - Historical ROI snapshots
 */
export default function ROIDashboard({ dark, clientId, getToken, API }) {
  const bg   = dark ? "#111"    : "#ffffff";
  const bg2  = dark ? "#1a1a1a" : "#f8f8f4";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#888"    : "#666";
  const txt3 = dark ? "#444"    : "#bbb";

  const [roi,          setRoi]          = useState(null);
  const [history,      setHistory]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [error,        setError]        = useState("");
  const [activeSection,setActiveSection]= useState("overview"); // overview | fixes | pushlog | settings
  const [settings,     setSettings]     = useState({ conversionRate:0.02, avgOrderValue:100, currency:"GBP" });
  const [savingSettings,setSavingSettings]=useState(false);
  const [settingsMsg,  setSettingsMsg]  = useState("");

  async function loadROI(silent = false) {
    if (!silent) setLoading(true);
    try {
      const token  = await getToken();
      const [roiRes, histRes] = await Promise.all([
        fetch(`${API}/api/agents/${clientId}/roi`,         { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/api/agents/${clientId}/roi/history`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const roiData  = await roiRes.json();
      const histData = await histRes.json();
      if (!roiRes.ok) throw new Error(roiData.error || "Failed to load ROI data");
      setRoi(roiData.roi || roiData);
      setHistory(histData.history || []);
      setSettings({
        conversionRate: roiData.revenue?.conversionRate || 0.02,
        avgOrderValue:  roiData.revenue?.avgOrderValue  || 100,
        currency:       roiData.currency                || "GBP",
      });
    } catch (e) {
      setError(e.message);
    }
    if (!silent) setLoading(false);
  }

  useEffect(() => { loadROI(); }, [clientId]);

  async function refreshROI() {
    setRefreshing(true);
    await loadROI(true);
    setRefreshing(false);
  }

  async function saveSettings() {
    setSavingSettings(true);
    setSettingsMsg("");
    try {
      const token = await getToken();
      const res   = await fetch(`${API}/api/agents/${clientId}/roi/settings`, {
        method:  "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body:    JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("Failed to save settings");
      setSettingsMsg("Settings saved — refresh ROI to recalculate");
    } catch (e) {
      setSettingsMsg(e.message);
    }
    setSavingSettings(false);
  }

  const currencySymbol = settings.currency === "GBP" ? "£" : settings.currency === "EUR" ? "€" : "$";
  const fmt = (n) => n >= 1000 ? `${(n/1000).toFixed(1)}k` : String(n || 0);
  const fmtCurrency = (n) => `${currencySymbol}${fmt(n || 0)}`;

  const sections = [
    { id:"overview", label:"📊 Overview" },
    { id:"fixes",    label:"🔧 Attributed Fixes" },
    { id:"pushlog",  label:"📋 Push Log" },
    { id:"settings", label:"⚙️ Settings" },
  ];

  if (loading) {
    return (
      <div style={{ textAlign:"center", padding:"48px 0", color:txt2, fontSize:13 }}>
        Calculating ROI data…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding:"14px 18px", borderRadius:10, background:"#DC262611", border:"1px solid #DC262633", color:"#DC2626", fontSize:13 }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{ marginTop:16 }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16, flexWrap:"wrap", gap:10 }}>
        <div>
          <div style={{ fontSize:17, fontWeight:800, color:txt }}>📈 ROI Dashboard</div>
          <div style={{ fontSize:12, color:txt2, marginTop:3 }}>
            Traffic & revenue impact from SEO fixes. Based on ranking changes + estimated CTR model.
          </div>
        </div>
        <button
          onClick={refreshROI}
          disabled={refreshing}
          style={{ padding:"7px 16px", borderRadius:8, border:`1px solid ${bdr}`, background:"transparent", color:txt2, fontSize:12, cursor: refreshing ? "not-allowed" : "pointer" }}>
          {refreshing ? "⏳ Refreshing…" : "🔄 Refresh"}
        </button>
      </div>

      {/* Section Tabs */}
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:18 }}>
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            style={{ padding:"6px 14px", borderRadius:20, fontSize:12, cursor:"pointer", fontWeight: activeSection===s.id?700:400, background: activeSection===s.id?"#443DCB22":"transparent", color: activeSection===s.id?"#6B62E8":txt2, border:`1px solid ${activeSection===s.id?"#443DCB44":bdr}` }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {activeSection === "overview" && roi && (
        <>
          {/* Summary Cards */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(160px,1fr))", gap:12, marginBottom:20 }}>
            <SummaryCard title="Monthly Traffic Est." value={fmt(roi.traffic?.currentMonthlyEstimate)} unit="visits/mo" color="#443DCB" bg2={bg2} bdr={bdr} txt={txt} txt2={txt2} />
            <SummaryCard title="Traffic Gained" value={`+${fmt(roi.traffic?.gainedThisPeriod)}`} unit="this period" color="#059669" bg2={bg2} bdr={bdr} txt={txt} txt2={txt2} />
            <SummaryCard title="Monthly Revenue Est." value={fmtCurrency(roi.revenue?.currentMonthlyEstimate)} unit="/month" color="#D97706" bg2={bg2} bdr={bdr} txt={txt} txt2={txt2} />
            <SummaryCard title="Revenue from Fixes" value={`+${fmtCurrency(roi.revenue?.gainedFromFixes)}`} unit="attributed" color="#7C3AED" bg2={bg2} bdr={bdr} txt={txt} txt2={txt2} />
            <SummaryCard title="Fixes Pushed" value={roi.summary?.totalFixesPushed || 0} unit="to WordPress" color="#0891B2" bg2={bg2} bdr={bdr} txt={txt} txt2={txt2} />
            <SummaryCard title="Keywords in Top 10" value={roi.summary?.keywordsTop10 || 0} unit={`of ${roi.summary?.keywordsTracked||0} tracked`} color="#059669" bg2={bg2} bdr={bdr} txt={txt} txt2={txt2} />
          </div>

          {/* Net traffic direction */}
          {roi.traffic && (
            <div style={{ padding:"14px 18px", borderRadius:10, background: roi.traffic.netChange >= 0 ? "#05966911" : "#DC262611", border:`1px solid ${roi.traffic.netChange >= 0 ? "#05966933" : "#DC262633"}`, marginBottom:20 }}>
              <div style={{ fontSize:13, fontWeight:700, color: roi.traffic.netChange >= 0 ? "#059669" : "#DC2626", marginBottom:4 }}>
                {roi.traffic.netChange >= 0 ? "▲" : "▼"} Net Traffic Change: {roi.traffic.netChange >= 0 ? "+" : ""}{fmt(roi.traffic.netChange)} visits/month
              </div>
              <div style={{ fontSize:12, color:txt2 }}>
                Gained {fmt(roi.traffic.gainedThisPeriod)} · Lost {fmt(roi.traffic.lostThisPeriod)} from ranking movements
              </div>
            </div>
          )}

          {/* Fixes breakdown */}
          {roi.fixesByType && Object.keys(roi.fixesByType).length > 0 && (
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:13, fontWeight:700, color:txt, marginBottom:10 }}>Fixes Pushed by Type</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                {Object.entries(roi.fixesByType).map(([type, count]) => (
                  <div key={type} style={{ padding:"6px 12px", borderRadius:8, background:bg2, border:`1px solid ${bdr}`, fontSize:12 }}>
                    <span style={{ fontWeight:700, color:txt }}>{count}×</span>
                    <span style={{ color:txt2, marginLeft:5 }}>{type.replace(/_/g," ")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Historical snapshots mini-chart */}
          {history.length > 1 && (
            <div style={{ padding:"14px 16px", borderRadius:10, background:bg2, border:`1px solid ${bdr}` }}>
              <div style={{ fontSize:13, fontWeight:700, color:txt, marginBottom:10 }}>Traffic Trend (Last {history.length} Snapshots)</div>
              <div style={{ display:"flex", alignItems:"flex-end", gap:6, height:60 }}>
                {history.slice().reverse().map((snap, i) => {
                  const maxVal = Math.max(...history.map(h => h.traffic?.currentMonthlyEstimate || 0), 1);
                  const h = Math.max(4, ((snap.traffic?.currentMonthlyEstimate || 0) / maxVal) * 56);
                  return (
                    <div key={i} title={`${new Date(snap.calculatedAt).toLocaleDateString()}: ${fmt(snap.traffic?.currentMonthlyEstimate)} visits`}
                      style={{ flex:1, height:h, background:"#443DCB88", borderRadius:"3px 3px 0 0", cursor:"default", transition:"height 0.3s" }} />
                  );
                })}
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:txt3, marginTop:4 }}>
                <span>{history.length > 0 ? new Date(history[history.length-1].calculatedAt).toLocaleDateString() : ""}</span>
                <span>Latest</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── ATTRIBUTED FIXES ── */}
      {activeSection === "fixes" && (
        <div>
          <div style={{ fontSize:13, color:txt2, marginBottom:14, lineHeight:1.5 }}>
            These are keyword ranking improvements that occurred within 30 days of a WordPress fix being pushed.
            Attributed traffic and revenue are estimated using industry-standard CTR curves by position.
          </div>
          {(!roi?.attributedFixes || roi.attributedFixes.length === 0) ? (
            <div style={{ padding:"24px", borderRadius:10, background:bg2, border:`1px dashed ${bdr}`, textAlign:"center", color:txt2, fontSize:12 }}>
              No attributed fixes yet. Push fixes to WordPress and run the Rank Tracker — improvements will appear here.
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {roi.attributedFixes.map((fix, i) => (
                <div key={i} style={{ padding:"14px 16px", borderRadius:10, background:bg2, border:`1px solid ${bdr}` }}>
                  <div style={{ display:"flex", justifyContent:"space-between", flexWrap:"wrap", gap:8, marginBottom:8 }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:txt }}>{fix.keyword}</div>
                      <div style={{ fontSize:11, color:txt2, marginTop:2 }}>
                        Fix: <span style={{ color:txt }}>{fix.fix?.replace(/_/g," ")}</span>
                        {fix.pushedAt && ` · Pushed ${new Date(fix.pushedAt).toLocaleDateString()}`}
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                      <PositionBadge before={fix.positionBefore} after={fix.positionAfter} />
                      {fix.attributed && (
                        <span style={{ padding:"3px 8px", borderRadius:10, background:"#05966922", color:"#059669", fontSize:11, fontWeight:700 }}>✅ Attributed</span>
                      )}
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
                    <Metric label="Traffic Before" value={`${fix.trafficBefore}/mo`} txt={txt} txt2={txt2} />
                    <Metric label="Traffic After"  value={`${fix.trafficAfter}/mo`}  txt={txt} txt2={txt2} color="#059669" />
                    <Metric label="Traffic Gain"   value={`+${fix.trafficGain}/mo`}  txt={txt} txt2={txt2} color="#059669" />
                    <Metric label="Revenue Gain"   value={fmtCurrency(fix.revenueGain)} txt={txt} txt2={txt2} color="#D97706" />
                    <Metric label="Search Volume"  value={`${fix.searchVolume || 0}/mo`} txt={txt} txt2={txt2} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── PUSH LOG ── */}
      {activeSection === "pushlog" && (
        <div>
          <div style={{ fontSize:13, color:txt2, marginBottom:14 }}>
            Full history of SEO fixes pushed to WordPress by this client.
          </div>
          {(!roi?.recentPushes || roi.recentPushes.length === 0) ? (
            <div style={{ padding:"24px", borderRadius:10, background:bg2, border:`1px dashed ${bdr}`, textAlign:"center", color:txt2, fontSize:12 }}>
              No fixes have been pushed to WordPress yet. Approve fixes in the Approval Queue and connect WordPress to start.
            </div>
          ) : (
            <div style={{ borderRadius:10, overflow:"hidden", border:`1px solid ${bdr}` }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr auto", gap:0, background:bg2, padding:"10px 16px", borderBottom:`1px solid ${bdr}` }}>
                {["Fix Type","Page","Pushed","By"].map(h => (
                  <div key={h} style={{ fontSize:11, fontWeight:700, color:txt2 }}>{h}</div>
                ))}
              </div>
              {roi.recentPushes.map((push, i) => (
                <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr auto", gap:0, padding:"10px 16px", borderBottom: i < roi.recentPushes.length-1 ? `1px solid ${bdr}` : "none", background: i%2===0 ? "transparent" : bg2 }}>
                  <div style={{ fontSize:12, color:txt }}>{push.field?.replace(/_/g," ") || "—"}</div>
                  <div style={{ fontSize:12, color:txt2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{push.page || "—"}</div>
                  <div style={{ fontSize:11, color:txt2 }}>{push.pushedAt ? new Date(push.pushedAt).toLocaleString() : "—"}</div>
                  <div style={{ fontSize:11, color:txt3 }}>{push.pushedBy || "auto"}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── SETTINGS ── */}
      {activeSection === "settings" && (
        <div style={{ maxWidth:480 }}>
          <div style={{ fontSize:13, color:txt2, marginBottom:20, lineHeight:1.6 }}>
            Configure your client's revenue assumptions. These are used to estimate monthly revenue from organic traffic.
            <br/><span style={{ fontSize:11, color:txt3 }}>Revenue = Monthly Traffic × Conversion Rate × Avg Order Value</span>
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <SettingField
              label="Conversion Rate"
              hint="What % of visitors convert to customers (e.g. 0.02 = 2%)"
              type="number" step="0.001" min="0" max="1"
              value={settings.conversionRate}
              onChange={v => setSettings(s => ({ ...s, conversionRate: parseFloat(v) || 0.02 }))}
              bg={bg} bg2={bg2} bdr={bdr} txt={txt} txt2={txt2}
            />
            <SettingField
              label={`Avg Order Value (${currencySymbol})`}
              hint="Average revenue per conversion"
              type="number" step="1" min="1"
              value={settings.avgOrderValue}
              onChange={v => setSettings(s => ({ ...s, avgOrderValue: parseFloat(v) || 100 }))}
              bg={bg} bg2={bg2} bdr={bdr} txt={txt} txt2={txt2}
            />
            <div>
              <div style={{ fontSize:12, fontWeight:600, color:txt, marginBottom:5 }}>Currency</div>
              <select
                value={settings.currency}
                onChange={e => setSettings(s => ({ ...s, currency: e.target.value }))}
                style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:bg2, color:txt, fontSize:13 }}>
                {["GBP","USD","EUR","AUD","CAD"].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginTop:20, display:"flex", alignItems:"center", gap:12 }}>
            <button
              onClick={saveSettings}
              disabled={savingSettings}
              style={{ padding:"10px 24px", borderRadius:8, background: savingSettings ? "#666" : "#443DCB", color:"#fff", fontWeight:700, fontSize:13, cursor: savingSettings ? "not-allowed" : "pointer", border:"none" }}>
              {savingSettings ? "Saving…" : "Save Settings"}
            </button>
            {settingsMsg && (
              <span style={{ fontSize:12, color: settingsMsg.startsWith("Settings") ? "#059669" : "#DC2626" }}>{settingsMsg}</span>
            )}
          </div>

          <div style={{ marginTop:24, padding:"12px 14px", borderRadius:10, background:bg2, border:`1px solid ${bdr}` }}>
            <div style={{ fontSize:11, fontWeight:700, color:txt2, marginBottom:6 }}>ESTIMATED MONTHLY REVENUE PREVIEW</div>
            <div style={{ fontSize:22, fontWeight:800, color:"#443DCB" }}>
              {currencySymbol}{(( roi?.traffic?.currentMonthlyEstimate || 0 ) * settings.conversionRate * settings.avgOrderValue).toFixed(0)}
            </div>
            <div style={{ fontSize:11, color:txt2, marginTop:2 }}>
              Based on {fmt(roi?.traffic?.currentMonthlyEstimate || 0)} visits × {(settings.conversionRate*100).toFixed(1)}% × {currencySymbol}{settings.avgOrderValue}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ title, value, unit, color, bg2, bdr, txt, txt2 }) {
  return (
    <div style={{ padding:"16px", borderRadius:10, background:bg2, border:`1px solid ${bdr}` }}>
      <div style={{ fontSize:11, color:txt2, marginBottom:6, fontWeight:600 }}>{title.toUpperCase()}</div>
      <div style={{ fontSize:24, fontWeight:800, color }}>{value}</div>
      <div style={{ fontSize:11, color:txt2, marginTop:3 }}>{unit}</div>
    </div>
  );
}

function PositionBadge({ before, after }) {
  const improved = after < before;
  const diff     = before - after;
  return (
    <div style={{ textAlign:"center" }}>
      <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:12 }}>
        <span style={{ color:"#888" }}>#{before}</span>
        <span style={{ color:"#888" }}>→</span>
        <span style={{ color: improved ? "#059669" : "#DC2626", fontWeight:700 }}>#{after}</span>
      </div>
      <div style={{ fontSize:10, color: improved ? "#059669" : "#DC2626" }}>
        {improved ? `▲ +${diff}` : `▼ ${diff}`}
      </div>
    </div>
  );
}

function Metric({ label, value, color, txt, txt2 }) {
  return (
    <div style={{ minWidth:80 }}>
      <div style={{ fontSize:10, color:txt2, marginBottom:2 }}>{label}</div>
      <div style={{ fontSize:12, fontWeight:700, color: color || txt }}>{value}</div>
    </div>
  );
}

function SettingField({ label, hint, type, step, min, max, value, onChange, bg, bg2, bdr, txt, txt2 }) {
  return (
    <div>
      <div style={{ fontSize:12, fontWeight:600, color:txt, marginBottom:4 }}>{label}</div>
      {hint && <div style={{ fontSize:11, color:txt2, marginBottom:6 }}>{hint}</div>}
      <input
        type={type}
        step={step}
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:bg2, color:txt, fontSize:13, boxSizing:"border-box" }}
      />
    </div>
  );
}
