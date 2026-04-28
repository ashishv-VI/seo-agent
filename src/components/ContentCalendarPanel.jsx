import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

const STATUS_META = {
  planned:     { label: "Planned",     color: "#888",     bg: "#88888818" },
  in_progress: { label: "In Progress", color: "#D97706",  bg: "#D9770618" },
  written:     { label: "Written",     color: "#0891B2",  bg: "#0891B218" },
  published:   { label: "Published",   color: "#059669",  bg: "#05966918" },
};

const FORMAT_ICON = {
  blog_post:    "📝",
  how_to:       "🔧",
  listicle:     "📋",
  comparison:   "⚖️",
  service_page: "💼",
  local_page:   "📍",
};

const INTENT_COLOR = {
  informational: "#0891B2",
  commercial:    "#D97706",
  transactional: "#059669",
  navigational:  "#443DCB",
};

export default function ContentCalendarPanel({ dark, clientId }) {
  const { user, API } = useAuth();
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error,      setError]      = useState("");
  const [expanded,   setExpanded]   = useState(null);

  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const B    = "#443DCB";

  async function load() {
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const r = await fetch(`${API}/api/agents/${clientId}/content-calendar/results`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await r.json();
      if (!json.notRun) setData(json);
    } catch { /* silent */ }
    setLoading(false);
  }

  async function generate() {
    setGenerating(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const r = await fetch(`${API}/api/agents/${clientId}/content-calendar/generate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      const json = await r.json();
      if (!r.ok) setError(json.error || "Generation failed");
      else setData(json);
    } catch (e) { setError(e.message); }
    setGenerating(false);
  }

  async function updateStatus(itemId, status) {
    try {
      const token = await user.getIdToken();
      await fetch(`${API}/api/agents/${clientId}/content-calendar/${itemId}/status`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setData(prev => prev ? {
        ...prev,
        calendar: prev.calendar.map(item => item.id === itemId ? { ...item, status } : item),
      } : prev);
    } catch { /* non-blocking */ }
  }

  useEffect(() => { if (clientId) load(); }, [clientId]);

  const calendar = data?.calendar || [];
  const published = calendar.filter(i => i.status === "published").length;
  const written   = calendar.filter(i => i.status === "written").length;
  const inProg    = calendar.filter(i => i.status === "in_progress").length;

  return (
    <div style={{ padding: "0 0 24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, gap: 8, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: txt }}>Content Calendar AI</div>
          <div style={{ fontSize: 11, color: txt2, marginTop: 2 }}>
            30-day AI-generated content plan based on your keywords, gaps, and competitor research
          </div>
        </div>
        <button onClick={generate} disabled={generating}
          style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: B, color: "#fff", fontSize: 12, fontWeight: 700, cursor: generating ? "not-allowed" : "pointer", opacity: generating ? 0.7 : 1, flexShrink: 0 }}>
          {generating ? "Generating…" : data ? "Regenerate" : "Generate Calendar"}
        </button>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", background: "#DC262611", borderRadius: 8, color: "#DC2626", fontSize: 12, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: txt2, fontSize: 13, padding: 24, textAlign: "center" }}>Loading…</div>
      ) : !data ? (
        <div style={{ padding: 32, textAlign: "center", background: bg3, borderRadius: 10, border: `1px solid ${bdr}` }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📅</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: txt, marginBottom: 6 }}>No Content Calendar Yet</div>
          <div style={{ fontSize: 12, color: txt2, marginBottom: 16 }}>
            Generate a 30-day AI content plan based on your keywords and competitor gaps. Requires A3 keywords to be run first.
          </div>
          <button onClick={generate} disabled={generating} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: B, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {generating ? "Generating…" : "Generate Calendar"}
          </button>
        </div>
      ) : (
        <>
          {/* Strategy note */}
          {data.strategy && (
            <div style={{ padding: "12px 14px", background: B + "12", border: `1px solid ${B}33`, borderRadius: 10, fontSize: 12, color: txt, marginBottom: 16 }}>
              <span style={{ fontWeight: 700, color: B }}>Strategy: </span>{data.strategy}
            </div>
          )}

          {/* Progress tracker */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: 10, marginBottom: 20 }}>
            {[
              { label: "Total",       value: calendar.length, color: txt },
              { label: "Published",   value: published,       color: "#059669" },
              { label: "Written",     value: written,         color: "#0891B2" },
              { label: "In Progress", value: inProg,          color: "#D97706" },
              { label: "Planned",     value: calendar.length - published - written - inProg, color: txt2 },
            ].map(s => (
              <div key={s.label} style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 10, color: txt2, marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Calendar list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {calendar.map((item, i) => {
              const sm = STATUS_META[item.status] || STATUS_META.planned;
              const isOpen = expanded === item.id;
              return (
                <div key={item.id || i} style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, overflow: "hidden" }}>
                  {/* Row */}
                  <div
                    onClick={() => setExpanded(isOpen ? null : item.id)}
                    style={{ display: "grid", gridTemplateColumns: "36px 1fr auto auto", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer" }}
                  >
                    {/* Day badge */}
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: B + "18", border: `1px solid ${B}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: B, flexShrink: 0 }}>
                      {item.day || i + 1}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: txt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {FORMAT_ICON[item.format] || "📄"} {item.title}
                      </div>
                      <div style={{ fontSize: 10, color: txt2, marginTop: 1, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <span>{item.keyword}</span>
                        {item.publishDate && <span>· {item.publishDate}</span>}
                        {item.wordCountTarget && <span>· {item.wordCountTarget.toLocaleString()} words</span>}
                        {item.intent && <span style={{ color: INTENT_COLOR[item.intent] || txt2 }}>· {item.intent}</span>}
                      </div>
                    </div>
                    {/* Status badge */}
                    <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 6, background: sm.bg, color: sm.color, fontWeight: 700, flexShrink: 0, whiteSpace: "nowrap" }}>
                      {sm.label}
                    </span>
                    <span style={{ color: txt2, fontSize: 12 }}>{isOpen ? "▲" : "▼"}</span>
                  </div>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${bdr}` }}>
                      {/* Outline */}
                      {item.outline?.length > 0 && (
                        <div style={{ marginTop: 10, marginBottom: 10 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: txt2, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>Article Outline</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            {item.outline.map((h, j) => (
                              <div key={j} style={{ fontSize: 11, color: txt, padding: "3px 8px", background: bg3, borderRadius: 6, borderLeft: `3px solid ${B}` }}>
                                {h}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Revenue angle */}
                      {item.revenueAngle && (
                        <div style={{ fontSize: 11, color: "#059669", padding: "6px 10px", background: "#05966911", borderRadius: 6, marginBottom: 10 }}>
                          <span style={{ fontWeight: 700 }}>Revenue angle: </span>{item.revenueAngle}
                        </div>
                      )}

                      {/* Status controls */}
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {Object.entries(STATUS_META).map(([key, meta]) => (
                          <button
                            key={key}
                            onClick={() => updateStatus(item.id, key)}
                            style={{
                              padding: "4px 10px", borderRadius: 6, border: `1px solid ${meta.color}44`,
                              background: item.status === key ? meta.bg : "transparent",
                              color: item.status === key ? meta.color : txt2,
                              fontSize: 10, fontWeight: item.status === key ? 700 : 400, cursor: "pointer",
                            }}
                          >
                            {meta.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {data.generatedAt && (
            <div style={{ fontSize: 10, color: txt2, marginTop: 8, textAlign: "right" }}>
              Generated: {new Date(data.generatedAt).toLocaleString()}
            </div>
          )}
        </>
      )}
    </div>
  );
}
