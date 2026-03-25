import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

export default function AlertCenter({ dark, clientId }) {
  const { user, API } = useAuth();
  const [alerts,  setAlerts]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(null);

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const txt3 = dark ? "#444"    : "#bbb";

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

  const tierColor = { P1:"#DC2626", P2:"#D97706", P3:"#6B7280" };
  const tierBg    = { P1:"#DC262611", P2:"#D9770611", P3:"#6B728011" };

  const open     = alerts.filter(a => !a.resolved);
  const resolved = alerts.filter(a => a.resolved);

  const s = {
    wrap: { padding:24, background:bg },
    card: (tier) => ({ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:16, marginBottom:10, borderLeft:`3px solid ${tierColor[tier] || "#6B7280"}` }),
  };

  if (loading) return <div style={{...s.wrap, color:txt3}}>Loading alerts...</div>;

  return (
    <div style={s.wrap}>
      <div style={{ fontSize:15, fontWeight:700, color:txt, marginBottom:4 }}>🚨 Alert Center</div>
      <div style={{ fontSize:12, color:txt2, marginBottom:20 }}>P1 = immediate · P2 = next business day · P3 = weekly</div>

      {open.length === 0 && (
        <div style={{ textAlign:"center", padding:40, color:txt3 }}>
          <div style={{ fontSize:32, marginBottom:8 }}>✅</div>
          <div>No open alerts</div>
        </div>
      )}

      {open.length > 0 && (
        <>
          <div style={{ fontSize:11, fontWeight:700, color:"#DC2626", marginBottom:10, textTransform:"uppercase" }}>Open Alerts ({open.length})</div>
          {open.map(alert => (
            <div key={alert.id} style={s.card(alert.tier)}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                    <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:tierBg[alert.tier], color:tierColor[alert.tier], fontWeight:700 }}>{alert.tier}</span>
                    <span style={{ fontSize:10, color:txt2 }}>Source: {alert.source}</span>
                  </div>
                  <div style={{ fontSize:12, color:txt, fontWeight:600, marginBottom:4 }}>{alert.message}</div>
                  <div style={{ fontSize:11, color:txt2 }}>Fix: {alert.fix}</div>
                </div>
                <button onClick={() => resolve(alert.id)} disabled={resolving === alert.id}
                  style={{ padding:"5px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:"transparent", color:txt2, fontSize:11, cursor:"pointer", flexShrink:0, marginLeft:12 }}>
                  {resolving === alert.id ? "..." : "Resolve"}
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {resolved.length > 0 && (
        <>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, marginBottom:10, marginTop:20, textTransform:"uppercase" }}>Resolved ({resolved.length})</div>
          {resolved.map(alert => (
            <div key={alert.id} style={{ ...s.card(alert.tier), opacity:0.5 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:tierBg[alert.tier], color:tierColor[alert.tier], fontWeight:700 }}>{alert.tier}</span>
                <span style={{ fontSize:12, color:txt }}>{alert.message}</span>
                <span style={{ fontSize:11, color:"#059669", marginLeft:"auto" }}>✅ Resolved</span>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
