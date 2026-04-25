import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

export default function CoreUpdateScannerPanel({ dark, clientId, bg2, bg3, bdr, txt, txt2, B }) {
  const { user, API } = useAuth();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error,   setError]   = useState("");
  const [view,    setView]    = useState("overview"); // overview | eeat | topical | ai | intent

  async function getToken() { return user?.getIdToken?.() || ""; }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      const res   = await fetch(`${API}/api/agents/${clientId}/A25/results`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Failed to load"); setLoading(false); return; }
      setData(json);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  async function runScan() {
    setRunning(true);
    setError("");
    try {
      const token = await getToken();
      const res   = await fetch(`${API}/api/agents/${clientId}/A25/scan`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Scan failed"); setRunning(false); return; }
      setData(json);
    } catch (e) { setError(e.message); }
    setRunning(false);
  }

  useEffect(() => { if (clientId) load(); }, [clientId]);

  const riskColor = (r) =>
    r === "high" ? "#DC2626" : r === "medium" ? "#D97706" : r === "low" ? "#059669" : "#0891B2";

  const scoreColor = (s) =>
    s >= 75 ? "#059669" : s >= 50 ? "#D97706" : "#DC2626";

  if (loading) return (
    <div style={{ padding:40, textAlign:"center", color:txt2, fontSize:13 }}>Loading Core Update Scanner...</div>
  );

  if (error) return (
    <div style={{ padding:20, color:"#DC2626", background:"#DC262611", borderRadius:10, fontSize:13 }}>{error}</div>
  );

  if (!data || data.notRun) return (
    <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:40, textAlign:"center" }}>
      <div style={{ fontSize:32, marginBottom:12 }}>🛡️</div>
      <div style={{ fontSize:16, fontWeight:800, color:txt, marginBottom:8 }}>Google Core Update Scanner</div>
      <div style={{ fontSize:12, color:txt2, marginBottom:20, maxWidth:480, margin:"0 auto 20px" }}>
        Scans your site against Google's latest core update criteria: E-E-A-T signals, topical authority gaps,
        AI content risk, and search intent mismatches. Runs automatically every morning.
      </div>
      <button onClick={runScan} disabled={running} style={{
        padding:"12px 28px", borderRadius:10, border:"none", background:B, color:"#fff",
        fontSize:14, fontWeight:700, cursor:running?"not-allowed":"pointer", opacity:running?0.7:1,
      }}>
        {running ? "Scanning…" : "Run Core Update Scan Now"}
      </button>
    </div>
  );

  const cats    = data.categories || {};
  const overall = data.overallRisk || "unknown";

  const VIEWS = [
    ["overview", "Overview"],
    ["eeat",     `E-E-A-T (${cats.eeat?.score ?? "—"})`],
    ["topical",  `Topical (${cats.topical?.score ?? "—"})`],
    ["ai",       `AI Content (${cats.aiContent?.score ?? "—"})`],
    ["intent",   `Intent (${cats.intent?.score ?? "—"})`],
  ];

  return (
    <div>
      {/* ── Header: overall risk + run button ── */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, gap:16, flexWrap:"wrap" }}>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>
            Google Core Update Scanner
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ fontSize:28, fontWeight:800, color:riskColor(overall) }}>
              {overall.toUpperCase()} RISK
            </div>
            <div style={{ fontSize:12, color:txt2 }}>
              {data.totalIssues || 0} issues · {data.highRiskCount || 0} high severity
            </div>
          </div>
          {data.overallScore != null && (
            <div style={{ fontSize:12, color:txt2, marginTop:4 }}>
              Overall score: <span style={{ fontWeight:700, color:scoreColor(data.overallScore) }}>{data.overallScore}/100</span>
            </div>
          )}
        </div>
        <button onClick={runScan} disabled={running} style={{
          padding:"9px 18px", borderRadius:8, border:`1px solid ${B}`, background:"transparent",
          color:B, fontSize:12, fontWeight:700, cursor:running?"not-allowed":"pointer", opacity:running?0.6:1,
        }}>
          {running ? "Scanning…" : "↺ Re-scan"}
        </button>
      </div>

      {/* ── Risk summary banner ── */}
      {data.riskSummary && (
        <div style={{
          marginBottom:16, padding:"12px 16px",
          background: overall === "high" ? "#DC262611" : overall === "medium" ? "#D9770611" : "#05966911",
          border: `1px solid ${riskColor(overall)}33`,
          borderLeft: `3px solid ${riskColor(overall)}`,
          borderRadius:10,
        }}>
          <div style={{ fontSize:12, fontWeight:700, color:riskColor(overall), marginBottom:4 }}>
            {overall === "high" ? "⚠ HIGH RISK" : overall === "medium" ? "⚡ MEDIUM RISK" : "✓ LOW RISK"} — Core Update Alignment
          </div>
          <div style={{ fontSize:12, color:txt }}>{data.riskSummary}</div>
        </div>
      )}

      {/* ── 4-category score tiles ── */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:10, marginBottom:20 }}>
        <CatTile label="E-E-A-T"          cat={cats.eeat}      color={scoreColor(cats.eeat?.score)}      bg2={bg2} bdr={bdr} txt={txt} txt2={txt2} />
        <CatTile label="Topical Authority" cat={cats.topical}   color={scoreColor(cats.topical?.score)}   bg2={bg2} bdr={bdr} txt={txt} txt2={txt2} />
        <CatTile label="AI Content Risk"   cat={cats.aiContent} color={scoreColor(cats.aiContent?.score)} bg2={bg2} bdr={bdr} txt={txt} txt2={txt2} invertRisk />
        <CatTile label="Search Intent"     cat={cats.intent}    color={scoreColor(cats.intent?.score)}    bg2={bg2} bdr={bdr} txt={txt} txt2={txt2} />
      </div>

      {/* ── Priority fixes ── */}
      {data.priorityFixes?.length > 0 && (
        <div style={{ marginBottom:20, background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"14px 16px" }}>
          <div style={{ fontSize:11, fontWeight:800, color:txt, textTransform:"uppercase", letterSpacing:0.8, marginBottom:10 }}>
            Priority Fixes (from AI Analysis)
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {data.priorityFixes.map((fix, i) => (
              <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start", fontSize:12 }}>
                <span style={{
                  flexShrink:0, fontSize:9, fontWeight:800, padding:"3px 7px", borderRadius:5,
                  background: fix.severity === "high" ? "#DC262618" : fix.severity === "medium" ? "#D9770618" : "#05966918",
                  color:      fix.severity === "high" ? "#DC2626"   : fix.severity === "medium" ? "#D97706"   : "#059669",
                }}>
                  {(fix.severity || "low").toUpperCase()}
                </span>
                <div>
                  <div style={{ color:txt, fontWeight:600 }}>{fix.issue}</div>
                  {fix.fix && <div style={{ color:txt2, marginTop:2 }}>{fix.fix}</div>}
                  {fix.impact && <div style={{ color:"#059669", fontSize:11, marginTop:2 }}>Impact: {fix.impact}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Category tabs ── */}
      <div style={{ display:"flex", gap:4, marginBottom:16, borderBottom:`1px solid ${bdr}`, flexWrap:"wrap" }}>
        {VIEWS.map(([id, label]) => (
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

      {/* ── Category detail views ── */}
      {view === "overview" && <OverviewIssues data={data} bg2={bg2} bdr={bdr} txt={txt} txt2={txt2} B={B} />}
      {view === "eeat"     && <CategoryDetail cat={cats.eeat}      name="E-E-A-T"          bg2={bg2} bdr={bdr} txt={txt} txt2={txt2} B={B} />}
      {view === "topical"  && <CategoryDetail cat={cats.topical}   name="Topical Authority" bg2={bg2} bdr={bdr} txt={txt} txt2={txt2} B={B} />}
      {view === "ai"       && <CategoryDetail cat={cats.aiContent} name="AI Content Risk"   bg2={bg2} bdr={bdr} txt={txt} txt2={txt2} B={B} />}
      {view === "intent"   && <CategoryDetail cat={cats.intent}    name="Search Intent"     bg2={bg2} bdr={bdr} txt={txt} txt2={txt2} B={B} />}

      {data.scannedAt && (
        <div style={{ marginTop:16, fontSize:10, color:txt2, textAlign:"right" }}>
          Last scanned: {new Date(data.scannedAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}

function CatTile({ label, cat, color, bg2, bdr, txt, txt2, invertRisk }) {
  const score   = cat?.score ?? null;
  const issues  = cat?.issues?.length || 0;
  return (
    <div style={{ background:bg2, border:`1px solid ${bdr}`, borderTop:`3px solid ${color}`, borderRadius:10, padding:"12px 14px" }}>
      <div style={{ fontSize:20, fontWeight:800, color }}>{score ?? "—"}{score != null ? "/100" : ""}</div>
      <div style={{ fontSize:11, color:txt2, marginTop:2 }}>{label}</div>
      {issues > 0 && (
        <div style={{ fontSize:10, color: issues > 2 ? "#DC2626" : "#D97706", marginTop:3 }}>
          {issues} issue{issues !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}

function OverviewIssues({ data, bg2, bdr, txt, txt2, B }) {
  const allIssues = [
    ...(data.categories?.eeat?.issues || []).map(i => ({ ...i, cat: "E-E-A-T" })),
    ...(data.categories?.topical?.issues || []).map(i => ({ ...i, cat: "Topical" })),
    ...(data.categories?.aiContent?.issues || []).map(i => ({ ...i, cat: "AI Content" })),
    ...(data.categories?.intent?.issues || []).map(i => ({ ...i, cat: "Intent" })),
  ].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
  });

  if (allIssues.length === 0) return (
    <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:40, textAlign:"center" }}>
      <div style={{ fontSize:28, marginBottom:10 }}>✅</div>
      <div style={{ fontSize:13, fontWeight:700, color:txt, marginBottom:6 }}>No Core Update Issues Found</div>
      <div style={{ fontSize:11, color:txt2 }}>Your site aligns well with Google's core update criteria.</div>
    </div>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
      {allIssues.map((issue, i) => (
        <div key={i} style={{
          background:bg2, border:`1px solid ${bdr}`,
          borderLeft: `3px solid ${issue.severity === "high" ? "#DC2626" : issue.severity === "medium" ? "#D97706" : "#059669"}`,
          borderRadius:8, padding:"12px 14px",
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
            <span style={{
              fontSize:9, fontWeight:800, padding:"2px 6px", borderRadius:4,
              background: issue.severity === "high" ? "#DC262618" : issue.severity === "medium" ? "#D9770618" : "#05966918",
              color:      issue.severity === "high" ? "#DC2626"   : issue.severity === "medium" ? "#D97706"   : "#059669",
            }}>
              {(issue.severity || "low").toUpperCase()}
            </span>
            <span style={{ fontSize:10, padding:"2px 6px", borderRadius:4, background:B+"18", color:B, fontWeight:600 }}>
              {issue.cat}
            </span>
          </div>
          <div style={{ fontSize:12, fontWeight:600, color:txt }}>{issue.issue || issue.description}</div>
          {issue.fix && <div style={{ fontSize:11, color:txt2, marginTop:4 }}>{issue.fix}</div>}
        </div>
      ))}
    </div>
  );
}

function CategoryDetail({ cat, name, bg2, bdr, txt, txt2, B }) {
  if (!cat) return (
    <div style={{ padding:24, textAlign:"center", color:txt2, fontSize:13 }}>No data for {name}</div>
  );

  return (
    <div>
      {cat.summary && (
        <div style={{ marginBottom:14, padding:"12px 16px", background:bg2, border:`1px solid ${bdr}`, borderRadius:10 }}>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:0.8, marginBottom:4 }}>Summary</div>
          <div style={{ fontSize:12, color:txt }}>{cat.summary}</div>
        </div>
      )}

      {cat.issues?.length > 0 ? (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {cat.issues.map((issue, i) => (
            <div key={i} style={{
              background:bg2, border:`1px solid ${bdr}`,
              borderLeft: `3px solid ${issue.severity === "high" ? "#DC2626" : issue.severity === "medium" ? "#D97706" : "#059669"}`,
              borderRadius:8, padding:"12px 14px",
            }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                <span style={{
                  fontSize:9, fontWeight:800, padding:"2px 6px", borderRadius:4,
                  background: issue.severity === "high" ? "#DC262618" : issue.severity === "medium" ? "#D9770618" : "#05966918",
                  color:      issue.severity === "high" ? "#DC2626"   : issue.severity === "medium" ? "#D97706"   : "#059669",
                }}>
                  {(issue.severity || "low").toUpperCase()}
                </span>
              </div>
              <div style={{ fontSize:12, fontWeight:600, color:txt }}>{issue.issue || issue.description}</div>
              {issue.detail && <div style={{ fontSize:11, color:txt2, marginTop:4 }}>{issue.detail}</div>}
              {issue.fix && (
                <div style={{ fontSize:11, color:"#059669", marginTop:6, fontWeight:600 }}>
                  Fix: {issue.fix}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:24, textAlign:"center" }}>
          <div style={{ fontSize:13, fontWeight:600, color:txt2 }}>No issues in this category</div>
        </div>
      )}

      {cat.passedChecks?.length > 0 && (
        <div style={{ marginTop:14 }}>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:0.8, marginBottom:8 }}>
            Passing Checks ✓
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
            {cat.passedChecks.map((c, i) => (
              <div key={i} style={{ fontSize:11, color:"#059669", padding:"6px 10px", background:"#05966910", borderRadius:6 }}>
                ✓ {c}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
