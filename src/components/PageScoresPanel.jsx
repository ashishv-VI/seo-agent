import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

export default function PageScoresPanel({ dark, clientId, bg2, bg3, bdr, txt, txt2 }) {
  const { user, API } = useAuth();
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [filter,    setFilter]    = useState("all"); // all | F | D | C | B | A
  const [sortBy,    setSortBy]    = useState("score_asc");
  const [expanded,  setExpanded]  = useState(null);
  const B     = "#443DCB";
  const green = "#059669";
  const amber = "#D97706";
  const red   = "#DC2626";
  const cyan  = "#0891B2";

  async function load(refresh = false) {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const token = await user.getIdToken();
      const res   = await fetch(`${API}/api/agents/${clientId}/A2/page-scores${refresh ? "?refresh=true" : ""}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (res.ok) setData(json);
    } catch (e) { console.error(e); }
    setLoading(false); setRefreshing(false);
  }

  useEffect(() => { load(); }, [clientId]);

  function gradeColor(grade) {
    if (grade === "A") return green;
    if (grade === "B") return cyan;
    if (grade === "C") return amber;
    if (grade === "D") return "#D97706";
    return red;
  }

  function scoreBg(score) {
    if (score >= 85) return green;
    if (score >= 70) return cyan;
    if (score >= 55) return amber;
    if (score >= 40) return "#D97706";
    return red;
  }

  function dimLabel(key) {
    const m = { title: "Title", metaDescription: "Meta", h1: "H1", content: "Content", speed: "Speed", schema: "Schema", internalLinks: "Int. Links", technical: "Technical" };
    return m[key] || key;
  }

  const pages = data?.pages || [];
  const filtered = pages.filter(p => filter === "all" || p.grade === filter);
  const sorted   = [...filtered].sort((a, b) => {
    if (sortBy === "score_asc")  return a.score - b.score;
    if (sortBy === "score_desc") return b.score - a.score;
    if (sortBy === "url")        return (a.url || "").localeCompare(b.url || "");
    return 0;
  });

  if (loading) return (
    <div style={{ padding: 40, textAlign: "center", color: txt2 }}>
      <div style={{ fontSize: 28, marginBottom: 12 }}>📊</div>
      Loading page scores...
    </div>
  );

  if (!data || pages.length === 0) return (
    <div style={{ padding: 40, textAlign: "center", color: txt2 }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
      <div style={{ fontSize: 15, color: txt, fontWeight: 600, marginBottom: 8 }}>No page scores yet</div>
      <div style={{ fontSize: 13, color: txt2 }}>Run the Technical Audit (A2) first to generate per-page scores.</div>
    </div>
  );

  const { summary } = data;
  const grades = summary?.gradeDistribution || {};

  return (
    <div style={{ padding: "0 0 32px" }}>

      {/* ── Summary row ── */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {/* Avg Score */}
        <div style={{ flex: 1, minWidth: 120, background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, padding: "14px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 11, color: txt2, textTransform: "uppercase", letterSpacing: 1 }}>Avg Score</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: scoreBg(summary?.avgScore || 0), marginTop: 4 }}>{summary?.avgScore || 0}</div>
          <div style={{ fontSize: 11, color: txt2 }}>out of 100</div>
        </div>
        {/* Total pages */}
        <div style={{ flex: 1, minWidth: 120, background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, padding: "14px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 11, color: txt2, textTransform: "uppercase", letterSpacing: 1 }}>Pages Scored</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: txt, marginTop: 4 }}>{summary?.total || 0}</div>
          <div style={{ fontSize: 11, color: txt2 }}>total pages</div>
        </div>
        {/* Grade Distribution */}
        {["A","B","C","D","F"].map(g => (
          <div key={g} onClick={() => setFilter(filter === g ? "all" : g)}
            style={{ flex: 1, minWidth: 70, background: filter === g ? gradeColor(g) : bg2, border: `1px solid ${filter === g ? gradeColor(g) : bdr}`, borderRadius: 10, padding: "14px 12px", textAlign: "center", cursor: "pointer", transition: "all .15s" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: filter === g ? "#fff" : gradeColor(g) }}>Grade {g}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: filter === g ? "#fff" : txt }}>{grades[g] || 0}</div>
            <div style={{ fontSize: 11, color: filter === g ? "rgba(255,255,255,0.8)" : txt2 }}>pages</div>
          </div>
        ))}
      </div>

      {/* ── Patterns / site-wide issues ── */}
      {(data.patterns || []).length > 0 && (
        <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: txt, marginBottom: 12 }}>🔍 Site-Wide Patterns</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {data.patterns.slice(0, 6).map((p, i) => (
              <div key={i} style={{ background: bg3, border: `1px solid ${bdr}`, borderRadius: 8, padding: "10px 14px", flex: "1 1 260px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, background: p.severity === "critical" ? red : p.severity === "high" ? amber : cyan, color: "#fff", borderRadius: 4, padding: "2px 6px", textTransform: "uppercase" }}>{p.severity}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: txt }}>{p.count} pages ({p.pct}%)</span>
                </div>
                <div style={{ fontSize: 12, color: txt2 }}>{p.message}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Controls ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: txt, flex: 1 }}>
          {filter === "all" ? `All ${pages.length} pages` : `Grade ${filter} — ${filtered.length} pages`}
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          style={{ background: bg3, border: `1px solid ${bdr}`, borderRadius: 6, color: txt, padding: "6px 10px", fontSize: 12 }}>
          <option value="score_asc">Worst first</option>
          <option value="score_desc">Best first</option>
          <option value="url">URL A-Z</option>
        </select>
        <button onClick={() => load(true)} disabled={refreshing}
          style={{ background: B, color: "#fff", border: "none", borderRadius: 6, padding: "7px 14px", fontSize: 12, cursor: "pointer", opacity: refreshing ? 0.6 : 1 }}>
          {refreshing ? "Refreshing..." : "↻ Refresh"}
        </button>
      </div>

      {/* ── Page list ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {sorted.slice(0, 100).map((page, i) => {
          const isExp = expanded === i;
          const dims  = page.dimensions || {};
          return (
            <div key={i} style={{ background: bg2, border: `1px solid ${isExp ? B : bdr}`, borderRadius: 10, overflow: "hidden", transition: "border .15s" }}>
              {/* Row */}
              <div onClick={() => setExpanded(isExp ? null : i)}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: "pointer" }}>
                {/* Score circle */}
                <div style={{ width: 44, height: 44, borderRadius: "50%", background: scoreBg(page.score), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ color: "#fff", fontWeight: 800, fontSize: 14 }}>{page.score}</span>
                </div>
                {/* Grade badge */}
                <div style={{ width: 28, height: 28, borderRadius: 6, background: gradeColor(page.grade), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ color: "#fff", fontWeight: 800, fontSize: 13 }}>{page.grade}</span>
                </div>
                {/* URL */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: txt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {page.url?.replace(/^https?:\/\/[^/]+/, "") || "/"}
                  </div>
                  {page.title && <div style={{ fontSize: 11, color: txt2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{page.title}</div>}
                </div>
                {/* Dimension mini-bars */}
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  {Object.entries(dims).map(([k, d]) => (
                    <div key={k} title={`${dimLabel(k)}: ${d.score}/${d.max}`}
                      style={{ width: 8, borderRadius: 2, height: 28, background: d.score >= d.max * 0.8 ? green : d.score >= d.max * 0.5 ? amber : red, opacity: 0.85 }} />
                  ))}
                </div>
                {/* Issues count */}
                {(page.recommendations?.length > 0) && (
                  <div style={{ fontSize: 11, color: red, fontWeight: 700, flexShrink: 0 }}>
                    {page.recommendations.length} fix{page.recommendations.length > 1 ? "es" : ""}
                  </div>
                )}
                <div style={{ color: txt2, fontSize: 12 }}>{isExp ? "▲" : "▼"}</div>
              </div>

              {/* Expanded detail */}
              {isExp && (
                <div style={{ borderTop: `1px solid ${bdr}`, padding: "16px" }}>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                    {/* Dimension breakdown */}
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: txt, marginBottom: 10 }}>Score Breakdown</div>
                      {Object.entries(dims).map(([k, d]) => (
                        <div key={k} style={{ marginBottom: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                            <span style={{ fontSize: 12, color: txt }}>{dimLabel(k)}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: d.score >= d.max * 0.8 ? green : d.score >= d.max * 0.5 ? amber : red }}>{d.score}/{d.max}</span>
                          </div>
                          <div style={{ height: 5, background: bg3, borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${Math.round((d.score / d.max) * 100)}%`, background: d.score >= d.max * 0.8 ? green : d.score >= d.max * 0.5 ? amber : red, borderRadius: 3 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Recommendations */}
                    {(page.recommendations || []).length > 0 && (
                      <div style={{ flex: 1, minWidth: 220 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: txt, marginBottom: 10 }}>Fixes Needed</div>
                        {page.recommendations.map((r, ri) => (
                          <div key={ri} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
                            <span style={{ fontSize: 10, fontWeight: 700, background: r.priority === "critical" ? red : r.priority === "high" ? amber : cyan, color: "#fff", borderRadius: 4, padding: "2px 6px", flexShrink: 0, marginTop: 1 }}>{r.priority}</span>
                            <span style={{ fontSize: 12, color: txt2 }}>{r.fix}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {sorted.length > 100 && (
        <div style={{ textAlign: "center", marginTop: 16, color: txt2, fontSize: 13 }}>
          Showing first 100 of {sorted.length} pages
        </div>
      )}
    </div>
  );
}
