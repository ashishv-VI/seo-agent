import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

export default function AIOTrackerPanel({ dark, clientId }) {
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
      const r = await fetch(`${API}/api/agents/${clientId}/aio/results`, {
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
      const r = await fetch(`${API}/api/agents/${clientId}/aio/scan`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      const json = await r.json();
      if (!r.ok) { setError(json.error || "Scan failed"); }
      else setData(json);
    } catch (e) { setError(e.message); }
    setScanning(false);
  }

  useEffect(() => { if (clientId) load(); }, [clientId]);

  const summary = data?.summary || {};
  const keywords = data?.keywords || [];

  return (
    <div style={{ padding: "0 0 24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: txt }}>AI Overview Tracker</div>
          <div style={{ fontSize: 11, color: txt2, marginTop: 2 }}>
            Monitors which of your keywords trigger Google/Bing AI Overviews — and whether your site is cited
          </div>
        </div>
        <button
          onClick={scan}
          disabled={scanning}
          style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: B, color: "#fff", fontSize: 12, fontWeight: 700, cursor: scanning ? "not-allowed" : "pointer", opacity: scanning ? 0.7 : 1 }}
        >
          {scanning ? "Scanning…" : "Scan Now"}
        </button>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", background: "#DC262611", border: "1px solid #DC262633", borderRadius: 8, color: "#DC2626", fontSize: 12, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: txt2, fontSize: 13, padding: 24, textAlign: "center" }}>Loading…</div>
      ) : !data ? (
        <div style={{ padding: 32, textAlign: "center", background: bg3, borderRadius: 10, border: `1px solid ${bdr}` }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🤖</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: txt, marginBottom: 6 }}>No AIO Data Yet</div>
          <div style={{ fontSize: 12, color: txt2, marginBottom: 16 }}>Click "Scan Now" to check which of your keywords appear in AI Overviews</div>
          <button onClick={scan} disabled={scanning} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: B, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {scanning ? "Scanning…" : "Start Scan"}
          </button>
        </div>
      ) : (
        <>
          {/* Summary stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 20 }}>
            {[
              { label: "Keywords Checked", value: summary.totalChecked || 0, color: txt },
              { label: "AI Overviews Found", value: summary.aioPresent || 0, color: "#D97706" },
              { label: "Your Site Cited", value: summary.clientInAIO || 0, color: "#059669" },
              { label: "Featured Snippets", value: summary.featuredSnippets || 0, color: B },
            ].map(s => (
              <div key={s.label} style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 10, color: txt2, marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* AIO opportunity: your site NOT cited but AIO exists */}
          {keywords.filter(k => k.aioPresent && !k.clientInAIO).length > 0 && (
            <div style={{ background: "#D9770611", border: "1px solid #D9770633", borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#D97706", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>
                AIO Opportunity — Your Site Not Cited Yet
              </div>
              <div style={{ fontSize: 11, color: txt2, marginBottom: 10 }}>
                These keywords trigger AI Overviews but your site is not cited. Add FAQ schema + direct answer sections to compete.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {keywords.filter(k => k.aioPresent && !k.clientInAIO).map((k, i) => (
                  <span key={i} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, background: "#D9770618", border: "1px solid #D9770644", color: "#D97706", fontWeight: 600 }}>
                    {k.keyword}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Keywords where you ARE cited */}
          {keywords.filter(k => k.clientInAIO).length > 0 && (
            <div style={{ background: "#05966911", border: "1px solid #05966933", borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#059669", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>
                Cited in AI Overview
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {keywords.filter(k => k.clientInAIO).map((k, i) => (
                  <span key={i} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, background: "#05966918", border: "1px solid #05966944", color: "#059669", fontWeight: 600 }}>
                    {k.keyword}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Full keyword table */}
          <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", borderBottom: `1px solid ${bdr}`, fontSize: 11, fontWeight: 700, color: txt2, display: "grid", gridTemplateColumns: "1fr 80px 80px 80px" }}>
              <span>Keyword</span>
              <span style={{ textAlign: "center" }}>AI Overview</span>
              <span style={{ textAlign: "center" }}>You Cited</span>
              <span style={{ textAlign: "center" }}>Feat. Snippet</span>
            </div>
            {keywords.map((k, i) => (
              <div key={i} style={{ padding: "9px 14px", borderBottom: i < keywords.length - 1 ? `1px solid ${bdr}` : "none", display: "grid", gridTemplateColumns: "1fr 80px 80px 80px", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: txt }}>{k.keyword}</div>
                  {k.paaQuestions?.length > 0 && (
                    <div style={{ fontSize: 10, color: txt2, marginTop: 2 }}>PAA: {k.paaQuestions[0]}</div>
                  )}
                  {k.error && <div style={{ fontSize: 10, color: "#DC2626" }}>{k.error}</div>}
                </div>
                <div style={{ textAlign: "center", fontSize: 14 }}>{k.aioPresent ? "✅" : "—"}</div>
                <div style={{ textAlign: "center", fontSize: 14 }}>{k.clientInAIO ? "🏆" : k.aioPresent ? "❌" : "—"}</div>
                <div style={{ textAlign: "center", fontSize: 14 }}>{k.featuredSnippet ? "⭐" : "—"}</div>
              </div>
            ))}
          </div>

          {data.updatedAt && (
            <div style={{ fontSize: 10, color: txt2, marginTop: 8, textAlign: "right" }}>
              Last scanned: {new Date(data.updatedAt).toLocaleString()}
            </div>
          )}
        </>
      )}
    </div>
  );
}
