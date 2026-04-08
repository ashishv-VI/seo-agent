import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

const B = "#443DCB";

const SEVERITY_COLOR = {
  critical: "#DC2626",
  high:     "#D97706",
  medium:   "#0891B2",
  low:      "#6B7280",
};

const SEVERITY_BG = {
  critical: "#DC262610",
  high:     "#D9770610",
  medium:   "#0891B210",
  low:      "#6B728010",
};

function PctBar({ pct, color }) {
  return (
    <div style={{ background: "#e5e7eb33", borderRadius: 4, height: 6, width: "100%", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.min(100, pct)}%`, background: color, borderRadius: 4, transition: "width 0.4s" }} />
    </div>
  );
}

export default function AuditPatternsPanel({ dark, clientId, bg2, bg3, bdr, txt, txt2 }) {
  const { user, API } = useAuth();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error,   setError]   = useState(null);
  const [expanded, setExpanded] = useState(null); // pattern index

  async function getToken() { return user?.getIdToken?.() || ""; }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res   = await fetch(`${API}/api/agents/${clientId}/A2/patterns`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      if (res.ok && d.patterns) {
        setData(d);
      } else {
        setData(null);
      }
    } catch (e) {
      setError("Could not load audit patterns");
    }
    setLoading(false);
  }

  async function runAnalysis() {
    setRunning(true);
    setError(null);
    try {
      const token = await getToken();
      // Re-run the A2 audit which will trigger pattern detection, or call patterns directly
      const res = await fetch(`${API}/api/agents/${clientId}/A2/patterns?refresh=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      if (res.ok && d.patterns) {
        setData(d);
      } else {
        setError(d.error || "Pattern analysis failed — run A2 Technical Audit first");
      }
    } catch (e) {
      setError("Failed to run pattern analysis");
    }
    setRunning(false);
  }

  useEffect(() => { load(); }, [clientId]);

  if (loading) return (
    <div style={{ padding: 24, color: txt2, fontSize: 13 }}>Loading site-wide patterns...</div>
  );

  const patterns   = data?.patterns || [];
  const critical   = patterns.filter(p => p.severity === "critical");
  const high       = patterns.filter(p => p.severity === "high");
  const medium     = patterns.filter(p => p.severity === "medium");
  const totalPages = data?.totalPages || 0;

  return (
    <div style={{ padding: 24 }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: txt, marginBottom: 4 }}>Site-Wide Pattern Analysis</div>
          <div style={{ fontSize: 12, color: txt2 }}>
            Patterns detected across {totalPages.toLocaleString()} pages
            {data?.analyzedAt && ` · Analyzed ${new Date(data.analyzedAt).toLocaleDateString()}`}
          </div>
        </div>
        <button onClick={runAnalysis} disabled={running}
          style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: B, color: "#fff", fontSize: 12, fontWeight: 700, cursor: running ? "not-allowed" : "pointer", opacity: running ? 0.7 : 1 }}>
          {running ? "⏳ Analyzing..." : data ? "↻ Re-analyze" : "Run Analysis"}
        </button>
      </div>

      {error && (
        <div style={{ padding: 14, background: "#DC262608", border: "1px solid #DC262633", borderRadius: 10, color: "#DC2626", fontSize: 12, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {!data && !error && (
        <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: txt, marginBottom: 8 }}>No pattern data yet</div>
          <div style={{ fontSize: 12, color: txt2 }}>Run A2 Technical Audit first, then click "Run Analysis" to detect site-wide patterns.</div>
        </div>
      )}

      {data && patterns.length === 0 && (
        <div style={{ background: "#05966910", border: "1px solid #05966930", borderRadius: 12, padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#059669", marginBottom: 4 }}>No site-wide patterns found</div>
          <div style={{ fontSize: 12, color: txt2 }}>All {totalPages} pages look healthy. No recurring issues detected.</div>
        </div>
      )}

      {data && patterns.length > 0 && (
        <>
          {/* Summary stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 20 }}>
            {[
              { label: "Pages Analyzed",  value: totalPages.toLocaleString(),     color: txt },
              { label: "Patterns Found",  value: data.patternCount || patterns.length, color: B },
              { label: "Critical Issues", value: critical.length,                 color: critical.length > 0 ? "#DC2626" : "#059669" },
              { label: "High Priority",   value: high.length,                     color: high.length > 0 ? "#D97706" : txt2 },
            ].map(s => (
              <div key={s.label} style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 10, color: txt2, marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Pattern list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {patterns.map((p, i) => {
              const sColor = SEVERITY_COLOR[p.severity] || "#6B7280";
              const sBg    = SEVERITY_BG[p.severity]    || "#6B728010";
              const isOpen = expanded === i;
              return (
                <div key={i} style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, overflow: "hidden" }}>

                  {/* Pattern header — clickable */}
                  <div
                    onClick={() => setExpanded(isOpen ? null : i)}
                    style={{ padding: "16px 20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}
                  >
                    <div style={{ fontSize: 20, flexShrink: 0 }}>{p.icon || "⚠️"}</div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: txt }}>{p.pattern}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: sBg, color: sColor, textTransform: "uppercase" }}>
                          {p.severity}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontSize: 12, color: sColor, fontWeight: 700 }}>
                          {p.count} {p.count === 1 ? "page" : "pages"}
                          {totalPages > 0 && <span style={{ fontSize: 11, color: txt2, fontWeight: 400 }}> ({p.pct}%)</span>}
                        </span>
                        {p.fix && (
                          <span style={{ fontSize: 11, color: txt2 }}>Fix: {p.fix}</span>
                        )}
                      </div>
                    </div>

                    {/* Percentage bar */}
                    <div style={{ width: 100, flexShrink: 0 }}>
                      <PctBar pct={p.pct} color={sColor} />
                      <div style={{ fontSize: 10, color: txt2, marginTop: 3, textAlign: "right" }}>{p.pct}% of site</div>
                    </div>

                    <div style={{ color: txt2, fontSize: 14, flexShrink: 0 }}>{isOpen ? "▲" : "▼"}</div>
                  </div>

                  {/* Expanded: affected URLs */}
                  {isOpen && (
                    <div style={{ borderTop: `1px solid ${bdr}`, padding: "14px 20px", background: bg3 }}>
                      {p.fix && (
                        <div style={{ marginBottom: 12, padding: "10px 14px", background: "#05966910", border: "1px solid #05966930", borderRadius: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#059669" }}>Recommended Fix: </span>
                          <span style={{ fontSize: 11, color: txt }}>{p.fix}</span>
                        </div>
                      )}
                      <div style={{ fontSize: 11, fontWeight: 700, color: txt2, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
                        Affected URLs (showing up to 10)
                      </div>
                      {(p.affectedUrls || []).length === 0 ? (
                        <div style={{ fontSize: 12, color: txt2 }}>No URLs available</div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {p.affectedUrls.map((url, j) => (
                            <div key={j} style={{ fontSize: 11, color: B, wordBreak: "break-all", padding: "4px 8px", background: bg2, borderRadius: 6 }}>
                              {url}
                            </div>
                          ))}
                          {p.count > (p.affectedUrls || []).length && (
                            <div style={{ fontSize: 11, color: txt2, padding: "4px 8px" }}>
                              ... and {p.count - (p.affectedUrls || []).length} more pages
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
