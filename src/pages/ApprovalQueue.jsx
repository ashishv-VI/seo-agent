import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

export default function ApprovalQueue({ dark, clientId, clientName }) {
  const { user, API } = useAuth();
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting,  setActing]  = useState(null);
  const [expanded, setExpanded] = useState(null);

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const txt3 = dark ? "#444"    : "#bbb";

  async function getToken() { return user?.getIdToken?.() || ""; }

  async function load() {
    setLoading(true);
    const token = await getToken();
    const res   = await fetch(`${API}/api/agents/${clientId}/approvals`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setItems(data.items || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [clientId]);

  async function act(itemId, action) {
    setActing(itemId);
    const token = await getToken();
    await fetch(`${API}/api/agents/${clientId}/approvals/${itemId}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ action }),
    });
    await load();
    setActing(null);
  }

  const typeLabel = { homepage_optimisation:"Homepage Optimisation", new_page_brief:"New Page Brief", client_report:"Client Report" };
  const typeIcon  = { homepage_optimisation:"🏠", new_page_brief:"📄", client_report:"📊" };

  const pending  = items.filter(i => i.status === "pending");
  const reviewed = items.filter(i => i.status !== "pending");

  const s = {
    wrap:  { padding:24, background:bg },
    card:  { background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:12 },
    btn:   (c) => ({ padding:"6px 14px", borderRadius:8, border:"none", background:c, color:"#fff", fontWeight:600, fontSize:12, cursor:"pointer" }),
  };

  if (loading) return <div style={{...s.wrap, color:txt3}}>Loading...</div>;

  return (
    <div style={s.wrap}>
      <div style={{ fontSize:15, fontWeight:700, color:txt, marginBottom:4 }}>✅ Approval Queue</div>
      <div style={{ fontSize:12, color:txt2, marginBottom:20 }}>Review all A5/A9 outputs before they go live</div>

      {pending.length === 0 && reviewed.length === 0 && (
        <div style={{ textAlign:"center", padding:40, color:txt3 }}>No items in queue — run A5 or A9 first</div>
      )}

      {pending.length > 0 && (
        <>
          <div style={{ fontSize:11, fontWeight:700, color:"#D97706", marginBottom:10, textTransform:"uppercase" }}>⏳ Pending Review ({pending.length})</div>
          {pending.map(item => (
            <div key={item.id} style={s.card}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                <div>
                  <span style={{ fontSize:16, marginRight:8 }}>{typeIcon[item.type] || "📋"}</span>
                  <span style={{ fontSize:13, fontWeight:700, color:txt }}>{typeLabel[item.type] || item.type}</span>
                  <span style={{ fontSize:10, color:txt2, marginLeft:10 }}>Agent: {item.agent}</span>
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                    style={{ padding:"5px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:"transparent", color:txt2, fontSize:11, cursor:"pointer" }}>
                    {expanded === item.id ? "Hide" : "View"}
                  </button>
                  <button onClick={() => act(item.id, "reject")} disabled={acting === item.id}
                    style={s.btn("#DC2626")}>Reject</button>
                  <button onClick={() => act(item.id, "approve")} disabled={acting === item.id}
                    style={s.btn("#059669")}>{acting === item.id ? "..." : "Approve"}</button>
                </div>
              </div>

              {expanded === item.id && item.data && (
                <div style={{ background:bg3, borderRadius:8, padding:16, fontSize:12 }}>
                  {item.type === "homepage_optimisation" && (
                    <div>
                      {item.data.titleTag && (
                        <div style={{ marginBottom:12 }}>
                          <div style={{ fontSize:10, fontWeight:700, color:txt2, marginBottom:6 }}>TITLE TAG</div>
                          <div style={{ color:"#DC2626", marginBottom:4 }}>Current: {item.data.titleTag.current}</div>
                          <div style={{ color:"#059669", marginBottom:4 }}>Recommended: {item.data.titleTag.recommended}</div>
                          <div style={{ color:txt2 }}>Rationale: {item.data.titleTag.rationale}</div>
                        </div>
                      )}
                      {item.data.metaDescription && (
                        <div style={{ marginBottom:12 }}>
                          <div style={{ fontSize:10, fontWeight:700, color:txt2, marginBottom:6 }}>META DESCRIPTION</div>
                          <div style={{ color:"#DC2626", marginBottom:4 }}>Current: {item.data.metaDescription.current}</div>
                          <div style={{ color:"#059669", marginBottom:4 }}>Recommended: {item.data.metaDescription.recommended}</div>
                        </div>
                      )}
                      {item.data.h1Tag && (
                        <div>
                          <div style={{ fontSize:10, fontWeight:700, color:txt2, marginBottom:6 }}>H1 TAG</div>
                          <div style={{ color:"#DC2626", marginBottom:4 }}>Current: {item.data.h1Tag.current}</div>
                          <div style={{ color:"#059669" }}>Recommended: {item.data.h1Tag.recommended}</div>
                        </div>
                      )}
                    </div>
                  )}
                  {item.type === "new_page_brief" && (
                    <div>
                      <div style={{ fontWeight:700, color:txt, marginBottom:8 }}>{item.data.title}</div>
                      <div style={{ color:txt2, marginBottom:4 }}>Target Keyword: <span style={{ color:"#A78BFA" }}>{item.data.targetKeyword}</span></div>
                      <div style={{ color:txt2, marginBottom:4 }}>Word Count: {item.data.recommendedWordCount}</div>
                      <div style={{ color:txt2, marginBottom:4 }}>Intent: {item.data.intent}</div>
                      {item.data.contentOutline && (
                        <div style={{ marginTop:8 }}>
                          <div style={{ fontSize:10, fontWeight:700, color:txt2, marginBottom:4 }}>OUTLINE</div>
                          {item.data.contentOutline.map((p,i) => <div key={i} style={{ color:txt, marginBottom:2 }}>• {p}</div>)}
                        </div>
                      )}
                    </div>
                  )}
                  {item.type === "client_report" && item.data.reportData && (
                    <div>
                      <div style={{ fontWeight:700, color:txt, marginBottom:8 }}>Verdict</div>
                      <div style={{ color:txt2, marginBottom:12 }}>{item.data.reportData.verdict}</div>
                      <div style={{ fontWeight:700, color:txt, marginBottom:6 }}>Next 3 Actions</div>
                      {(item.data.reportData.next3Actions || []).map((a,i) => (
                        <div key={i} style={{ marginBottom:6, padding:"8px 10px", background:bg2, borderRadius:6 }}>
                          <div style={{ color:txt, fontWeight:600 }}>{i+1}. {a.action}</div>
                          <div style={{ color:txt2, fontSize:11 }}>{a.why}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {reviewed.length > 0 && (
        <>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, marginBottom:10, marginTop:20, textTransform:"uppercase" }}>Reviewed ({reviewed.length})</div>
          {reviewed.map(item => (
            <div key={item.id} style={{ ...s.card, opacity:0.6 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <span style={{ fontSize:14, marginRight:8 }}>{typeIcon[item.type] || "📋"}</span>
                  <span style={{ fontSize:12, color:txt }}>{typeLabel[item.type] || item.type}</span>
                </div>
                <span style={{ fontSize:11, padding:"3px 10px", borderRadius:10, background: item.status==="approved" ? "#05966922":"#DC262622", color: item.status==="approved"?"#059669":"#DC2626", fontWeight:600 }}>
                  {item.status}
                </span>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
