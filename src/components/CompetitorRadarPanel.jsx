import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

export default function CompetitorRadarPanel({ dark, clientId, bg2, bg3, bdr, txt, txt2, B }) {
  const { user, API } = useAuth();
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");
  const [approving, setApproving] = useState({});
  const [view,      setView]      = useState("threats"); // threats | counter | landscape

  async function getToken() { return user?.getIdToken?.() || ""; }

  useEffect(() => {
    if (!clientId) return;
    (async () => {
      setLoading(true);
      try {
        const token = await getToken();
        const res   = await fetch(`${API}/api/control-room/${clientId}/competitor-radar`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json  = await res.json();
        if (!res.ok) { setError(json.error || "Failed"); return; }
        setData(json);
      } catch (e) { setError(e.message); }
      setLoading(false);
    })();
  }, [clientId]);

  async function approveCounterContent(itemId) {
    setApproving(p => ({ ...p, [itemId]: true }));
    try {
      const token = await getToken();
      await fetch(`${API}/api/agents/${clientId}/approval-queue/${itemId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "approve" }),
      });
      setData(d => ({
        ...d,
        pendingActions: (d.pendingActions || []).filter(a => a.id !== itemId),
      }));
    } catch { /* non-blocking */ }
    setApproving(p => ({ ...p, [itemId]: false }));
  }

  if (loading) return <div style={{ padding:40, textAlign:"center", color:txt2, fontSize:13 }}>Loading Competitor Radar...</div>;
  if (error)   return <div style={{ padding:20, color:"#DC2626", background:"#DC262611", borderRadius:10, fontSize:13 }}>{error}</div>;
  if (!data)   return null;

  const hasThreats    = data.threats?.length > 0;
  const hasActions    = data.pendingActions?.length > 0;
  const totalAlerts   = data.activeAlerts?.length || 0;

  return (
    <div>
      {/* ── Header stats ── */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:10, marginBottom:20 }}>
        <StatTile label="Competitors Monitored" value={data.competitorsChecked || "—"} color={B}        bg2={bg2} bdr={bdr} txt={txt} txt2={txt2} />
        <StatTile label="New Pages (24h)"       value={data.totalNewPages || 0}        color="#D97706"  bg2={bg2} bdr={bdr} txt={txt} txt2={txt2} />
        <StatTile label="High Threats"          value={data.totalHighThreat || 0}      color={data.totalHighThreat > 0 ? "#DC2626" : "#059669"} bg2={bg2} bdr={bdr} txt={txt} txt2={txt2}
          sub={data.totalHighThreat > 0 ? "targeting your keywords" : "no direct threats"} />
        <StatTile label="Counter-Content Ready" value={data.pendingActions?.length || 0} color="#059669" bg2={bg2} bdr={bdr} txt={txt} txt2={txt2}
          sub={hasActions ? "awaiting approval" : "all clear"} />
      </div>

      {/* ── High-threat alert banner ── */}
      {hasThreats && (
        <div style={{ marginBottom:16, padding:"12px 16px", background:"#DC262611", border:"1px solid #DC262633", borderLeft:"3px solid #DC2626", borderRadius:10 }}>
          <div style={{ fontSize:12, fontWeight:800, color:"#DC2626", marginBottom:4 }}>
            COMPETITOR THREAT DETECTED
          </div>
          <div style={{ fontSize:12, color:txt }}>
            {data.threats.length} competitor page(s) directly targeting your high-priority keywords.
            {hasActions ? " Counter-content is queued — approve below to publish." : " Counter-content suggestions available."}
          </div>
        </div>
      )}

      {/* ── View tabs ── */}
      <div style={{ display:"flex", gap:4, marginBottom:16, borderBottom:`1px solid ${bdr}` }}>
        {[
          ["threats",   `Threats${data.totalHighThreat > 0 ? ` (${data.totalHighThreat})` : ""}`],
          ["counter",   `Counter-Content${hasActions ? ` (${data.pendingActions.length})` : ""}`],
          ["landscape", "Competitor Landscape"],
        ].map(([id, label]) => (
          <button key={id} onClick={() => setView(id)}
            style={{ padding:"7px 14px", borderRadius:"8px 8px 0 0", border:"none", cursor:"pointer",
              fontSize:12, fontWeight:600,
              background: view === id ? bg2 : "transparent",
              color:      view === id ? B : txt2,
              borderBottom: view === id ? `2px solid ${B}` : "2px solid transparent",
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Threats view ── */}
      {view === "threats" && (
        <div>
          {data.results?.length > 0 ? (
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {data.results.map((r, i) => (
                <div key={i} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"14px 16px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                    <div>
                      <div style={{ fontSize:12, fontWeight:800, color:txt, marginBottom:2 }}>
                        {r.url?.replace(/^https?:\/\//, "")}
                      </div>
                      <div style={{ fontSize:11, color:txt2 }}>
                        {r.totalPages} pages total · {r.newPages || 0} new · Checked {r.checkedAt ? new Date(r.checkedAt).toLocaleDateString() : "recently"}
                      </div>
                    </div>
                    {r.highThreatCount > 0 && (
                      <span style={{ fontSize:10, padding:"3px 8px", borderRadius:6, background:"#DC262618", color:"#DC2626", fontWeight:800 }}>
                        {r.highThreatCount} HIGH THREAT
                      </span>
                    )}
                  </div>

                  {r.strategicInsight && (
                    <div style={{ fontSize:11, color:txt2, padding:"8px 12px", background:dark?"#ffffff08":"#f5f5f0", borderRadius:8, marginBottom:8 }}>
                      <span style={{ color:B, fontWeight:700 }}>Strategy: </span>{r.strategicInsight}
                    </div>
                  )}

                  {r.windowOfOpportunity && (
                    <div style={{ fontSize:11, color:"#D97706", fontWeight:700, marginBottom:8 }}>
                      Window: {r.windowOfOpportunity}
                    </div>
                  )}

                  {r.newUrlsWithThreat?.length > 0 && (
                    <div>
                      <div style={{ fontSize:10, color:txt2, fontWeight:700, textTransform:"uppercase", letterSpacing:0.5, marginBottom:6 }}>New Pages</div>
                      <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                        {r.newUrlsWithThreat.slice(0, 5).map((u, j) => (
                          <div key={j} style={{ display:"flex", alignItems:"center", gap:8, fontSize:11 }}>
                            <span style={{
                              fontSize:9, padding:"2px 6px", borderRadius:4, fontWeight:800,
                              background: u.threatLevel === "high" ? "#DC262618" : u.threatLevel === "medium" ? "#D9770618" : "#05966918",
                              color:      u.threatLevel === "high" ? "#DC2626"   : u.threatLevel === "medium" ? "#D97706"   : "#059669",
                            }}>{u.threatLevel.toUpperCase()}</span>
                            <span style={{ color:txt2, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                              {u.url.replace(/^https?:\/\/[^/]+/, "")}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon="🔍" title="No competitor activity detected" sub="A15 runs daily. Results appear after the first monitoring cycle." txt={txt} txt2={txt2} bg2={bg2} bdr={bdr} />
          )}

          {/* Active alerts */}
          {totalAlerts > 0 && (
            <div style={{ marginTop:16 }}>
              <div style={{ fontSize:12, fontWeight:800, color:txt, marginBottom:8 }}>Active Competitor Alerts</div>
              {data.activeAlerts.slice(0, 5).map((a, i) => (
                <div key={i} style={{ padding:"10px 14px", background:bg2, border:`1px solid ${a.tier === "P1" ? "#DC262644" : bdr}`, borderLeft:`3px solid ${a.tier === "P1" ? "#DC2626" : "#D97706"}`, borderRadius:8, marginBottom:6, fontSize:12 }}>
                  <span style={{ color: a.tier === "P1" ? "#DC2626" : "#D97706", fontWeight:800 }}>{a.tier} </span>
                  <span style={{ color:txt }}>{a.message}</span>
                  <div style={{ color:txt2, fontSize:11, marginTop:3 }}>{a.fix}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Counter-content view ── */}
      {view === "counter" && (
        <div>
          {hasActions ? (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {data.pendingActions.map((item) => (
                <div key={item.id} style={{ background:bg2, border:`1px solid ${B}33`, borderLeft:`3px solid ${B}`, borderRadius:10, padding:"14px 16px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:800, color:txt, marginBottom:6 }}>{item.title}</div>
                      <div style={{ fontSize:11, color:txt2, marginBottom:4 }}>{item.suggestedAction}</div>
                      {item.targetKeyword && (
                        <span style={{ fontSize:11, padding:"2px 8px", borderRadius:6, background:B+"18", color:B, fontWeight:700 }}>
                          {item.targetKeyword}
                        </span>
                      )}
                      {item.estimatedImpact && (
                        <div style={{ fontSize:11, color:"#059669", fontWeight:600, marginTop:6 }}>
                          Impact: {item.estimatedImpact}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => approveCounterContent(item.id)}
                      disabled={approving[item.id]}
                      style={{ padding:"8px 16px", borderRadius:8, border:"none", background:B, color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap", opacity:approving[item.id]?0.6:1 }}>
                      {approving[item.id] ? "Queuing…" : "Publish Counter"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div>
              {data.counterContent?.length > 0 ? (
                <div>
                  <div style={{ fontSize:12, color:txt2, marginBottom:12 }}>Counter-content suggestions from last scan (no pending approvals)</div>
                  {data.counterContent.slice(0, 5).map((c, i) => (
                    <div key={i} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"12px 14px", marginBottom:8 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:txt, marginBottom:4 }}>{c.suggestedTitle}</div>
                      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:4 }}>
                        {c.targetKeyword && <span style={{ fontSize:10, padding:"2px 7px", borderRadius:5, background:B+"18", color:B, fontWeight:700 }}>{c.targetKeyword}</span>}
                        {c.priority && <span style={{ fontSize:10, padding:"2px 7px", borderRadius:5, background: c.priority==="high"?"#DC262618":"#D9770618", color: c.priority==="high"?"#DC2626":"#D97706", fontWeight:700 }}>{c.priority}</span>}
                        {c.urgency && <span style={{ fontSize:10, color:"#D97706" }}>{c.urgency}</span>}
                      </div>
                      <div style={{ fontSize:11, color:txt2 }}>{c.ourAngle}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon="✍️" title="No counter-content pending" sub="A15 will auto-queue counter-content briefs when competitor threats are detected." txt={txt} txt2={txt2} bg2={bg2} bdr={bdr} />
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Competitor landscape view ── */}
      {view === "landscape" && (
        <div>
          {data.knownCompetitors?.length > 0 ? (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:10 }}>
              {data.knownCompetitors.map((c, i) => {
                const domain = typeof c === "string" ? c : (c.url || c.domain || "");
                const name   = typeof c === "object" ? (c.name || c.domain || domain) : domain;
                return (
                  <div key={i} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"12px 14px" }}>
                    <div style={{ fontSize:12, fontWeight:700, color:txt, marginBottom:4 }}>{name?.replace(/^https?:\/\//, "")}</div>
                    {typeof c === "object" && c.rankingKeywords != null && (
                      <div style={{ fontSize:11, color:txt2 }}>Rankings: {c.rankingKeywords} keywords</div>
                    )}
                    {typeof c === "object" && c.overlap != null && (
                      <div style={{ fontSize:11, color:"#D97706" }}>Overlap: {c.overlap} shared keywords</div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState icon="🌐" title="No competitor landscape data" sub="Run the A4 Competitor Analysis to populate this view." txt={txt} txt2={txt2} bg2={bg2} bdr={bdr} />
          )}
        </div>
      )}

      {data.checkedAt && (
        <div style={{ marginTop:16, fontSize:10, color:txt2, textAlign:"right" }}>
          Last checked: {new Date(data.checkedAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, sub, color, bg2, bdr, txt, txt2 }) {
  return (
    <div style={{ background:bg2, border:`1px solid ${bdr}`, borderTop:`3px solid ${color}`, borderRadius:10, padding:"12px 14px" }}>
      <div style={{ fontSize:20, fontWeight:800, color }}>{value}</div>
      <div style={{ fontSize:11, color:txt2, marginTop:2 }}>{label}</div>
      {sub && <div style={{ fontSize:10, color:txt2, marginTop:1 }}>{sub}</div>}
    </div>
  );
}

function EmptyState({ icon, title, sub, txt, txt2, bg2, bdr }) {
  return (
    <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:40, textAlign:"center" }}>
      <div style={{ fontSize:28, marginBottom:10 }}>{icon}</div>
      <div style={{ fontSize:13, fontWeight:700, color:txt, marginBottom:6 }}>{title}</div>
      <div style={{ fontSize:11, color:txt2 }}>{sub}</div>
    </div>
  );
}
