import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

const STATUS_META = {
  listed:         { label: "Listed",          color: "#059669", bg: "#05966918", icon: "✅" },
  not_found:      { label: "Not Listed",       color: "#DC2626", bg: "#DC262611", icon: "❌" },
  check_manually: { label: "Check Manually",   color: "#D97706", bg: "#D9770611", icon: "⚠️" },
  unknown:        { label: "Unknown",          color: "#888",    bg: "#88888811", icon: "?" },
};

export default function LocalCitationPanel({ dark, clientId }) {
  const { user, API } = useAuth();
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error,    setError]    = useState("");

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
      const r = await fetch(`${API}/api/agents/${clientId}/local-citations/results`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await r.json();
      if (!json.notRun) setData(json);
    } catch { /* silent */ }
    setLoading(false);
  }

  async function scan() {
    setScanning(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const r = await fetch(`${API}/api/agents/${clientId}/local-citations/scan`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      const json = await r.json();
      if (!r.ok) setError(json.error || "Scan failed");
      else setData(json);
    } catch (e) { setError(e.message); }
    setScanning(false);
  }

  useEffect(() => { if (clientId) load(); }, [clientId]);

  const summary = data?.summary || {};
  const results = data?.results || [];

  return (
    <div style={{ padding: "0 0 24px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, gap: 8, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: txt }}>Local Citation Audit</div>
          <div style={{ fontSize: 11, color: txt2, marginTop: 2 }}>
            Checks your business listing on JustDial, Sulekha, IndiaMart, Google Maps and more. Flags missing listings and NAP inconsistencies.
          </div>
        </div>
        <button onClick={scan} disabled={scanning}
          style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: B, color: "#fff", fontSize: 12, fontWeight: 700, cursor: scanning ? "not-allowed" : "pointer", opacity: scanning ? 0.7 : 1, flexShrink: 0 }}>
          {scanning ? "Scanning…" : "Scan Now"}
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
          <div style={{ fontSize: 32, marginBottom: 8 }}>📍</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: txt, marginBottom: 6 }}>No Citation Data Yet</div>
          <div style={{ fontSize: 12, color: txt2, marginBottom: 16 }}>
            Scan to check if your business is listed on key Indian directories. Requires A1 onboarding with business name.
          </div>
          <button onClick={scan} disabled={scanning} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: B, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Start Scan
          </button>
        </div>
      ) : (
        <>
          {/* Business info */}
          {data.businessName && (
            <div style={{ fontSize: 11, color: txt2, marginBottom: 12 }}>
              Scanning: <strong style={{ color: txt }}>{data.businessName}</strong>
              {data.city && <span> · {data.city}</span>}
            </div>
          )}

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 10, marginBottom: 20 }}>
            {[
              { label: "Coverage Score",  value: (summary.coverageScore || 0) + "%", color: summary.coverageScore >= 70 ? "#059669" : summary.coverageScore >= 40 ? "#D97706" : "#DC2626" },
              { label: "Listed",          value: summary.listed || 0,       color: "#059669" },
              { label: "Not Found",       value: summary.notFound || 0,     color: "#DC2626" },
              { label: "NAP Issues",      value: summary.napIssues || 0,    color: summary.napIssues > 0 ? "#D97706" : "#059669" },
              { label: "Manual Check",    value: summary.checkManually || 0,color: "#888" },
            ].map(s => (
              <div key={s.label} style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 10, color: txt2, marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Missing listings — actionable */}
          {results.filter(r => r.status === "not_found").length > 0 && (
            <div style={{ background: "#DC262611", border: "1px solid #DC262633", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#DC2626", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>
                Missing Listings — Create These Now
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {results.filter(r => r.status === "not_found").map((r, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 12, color: txt }}>{r.icon} {r.directoryName}</span>
                    <a href={r.searchUrl} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 11, color: B, fontWeight: 600, textDecoration: "none", padding: "3px 8px", background: B + "18", borderRadius: 6 }}>
                      Create Listing →
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* NAP inconsistencies */}
          {results.filter(r => r.napConsistent === false).length > 0 && (
            <div style={{ background: "#D9770611", border: "1px solid #D9770633", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#D97706", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>
                NAP Inconsistency
              </div>
              <div style={{ fontSize: 11, color: txt2 }}>
                Phone number doesn't match in: {results.filter(r => r.napConsistent === false).map(r => r.directoryName).join(", ")}.
                Inconsistent NAP hurts local SEO rankings.
              </div>
            </div>
          )}

          {/* Full directory list */}
          <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, overflow: "hidden" }}>
            {results.map((r, i) => {
              const sm = STATUS_META[r.status] || STATUS_META.unknown;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: i < results.length - 1 ? `1px solid ${bdr}` : "none" }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{r.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: txt }}>{r.directoryName}</div>
                    {r.napConsistent === false && (
                      <div style={{ fontSize: 10, color: "#D97706" }}>Phone number mismatch — update listing</div>
                    )}
                    {r.napConsistent === true && (
                      <div style={{ fontSize: 10, color: "#059669" }}>NAP consistent</div>
                    )}
                  </div>
                  <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 6, background: sm.bg, color: sm.color, fontWeight: 700, flexShrink: 0, whiteSpace: "nowrap" }}>
                    {sm.icon} {sm.label}
                  </span>
                  {r.status === "listed" && r.listingUrl && (
                    <a href={r.listingUrl} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 11, color: B, flexShrink: 0, textDecoration: "none" }}>
                      View →
                    </a>
                  )}
                  {(r.status === "not_found" || r.status === "check_manually") && (
                    <a href={r.searchUrl} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 11, color: txt2, flexShrink: 0, textDecoration: "none" }}>
                      Check →
                    </a>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: 10, color: txt2, marginTop: 8 }}>
            Note: "Check Manually" means the directory blocked automated checks — visit the link to verify manually.
          </div>

          {data.updatedAt && (
            <div style={{ fontSize: 10, color: txt2, marginTop: 6, textAlign: "right" }}>
              Last scanned: {new Date(data.updatedAt).toLocaleString()}
            </div>
          )}
        </>
      )}
    </div>
  );
}
