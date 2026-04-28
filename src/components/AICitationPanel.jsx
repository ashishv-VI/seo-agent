import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

const SOURCE_ICONS = {
  "Bing Copilot":       { icon: "🤖", color: "#0078D4" },
  "Perplexity":         { icon: "⚡", color: "#6B46C1" },
  "Google AI Overview": { icon: "🔍", color: "#4285F4" },
};

export default function AICitationPanel({ dark, clientId }) {
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
      const r = await fetch(`${API}/api/agents/${clientId}/ai-citations/results`, {
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
      const r = await fetch(`${API}/api/agents/${clientId}/ai-citations/scan`, {
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

  const summary  = data?.summary  || {};
  const keywords = data?.keywords || [];

  return (
    <div style={{ padding: "0 0 24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, gap: 8, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: txt }}>AI Citation Tracker</div>
          <div style={{ fontSize: 11, color: txt2, marginTop: 2 }}>
            Tracks whether your site is cited by Bing Copilot, Google AI Overviews, and Perplexity for your target keywords
          </div>
        </div>
        <button onClick={scan} disabled={scanning}
          style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: B, color: "#fff", fontSize: 12, fontWeight: 700, cursor: scanning ? "not-allowed" : "pointer", opacity: scanning ? 0.7 : 1, flexShrink: 0 }}>
          {scanning ? "Scanning…" : "Scan Now"}
        </button>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", background: "#DC262611", border: "1px solid #DC262633", borderRadius: 8, color: "#DC2626", fontSize: 12, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {!summary.hasPerplexityKey && data && (
        <div style={{ padding: "10px 14px", background: "#D9770611", border: "1px solid #D9770633", borderRadius: 8, fontSize: 11, color: "#D97706", marginBottom: 14 }}>
          <strong>Tip:</strong> Add a Perplexity API key in Settings to enable Perplexity citation tracking.
        </div>
      )}

      {loading ? (
        <div style={{ color: txt2, fontSize: 13, padding: 24, textAlign: "center" }}>Loading…</div>
      ) : !data ? (
        <div style={{ padding: 32, textAlign: "center", background: bg3, borderRadius: 10, border: `1px solid ${bdr}` }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⚡</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: txt, marginBottom: 6 }}>No Citation Data Yet</div>
          <div style={{ fontSize: 12, color: txt2, marginBottom: 16 }}>Click "Scan Now" to check if your site is cited by AI assistants for your keywords</div>
          <button onClick={scan} disabled={scanning} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: B, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {scanning ? "Scanning…" : "Start Scan"}
          </button>
        </div>
      ) : (
        <>
          {/* Summary grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10, marginBottom: 20 }}>
            {[
              { label: "Checked", value: summary.totalChecked || 0, color: txt },
              { label: "Bing Copilot", value: summary.bingCopilotCited || 0, color: "#0078D4" },
              { label: "Google AIO", value: summary.googleAIOCited || 0, color: "#4285F4" },
              { label: "Perplexity", value: summary.perplexityCited || 0, color: "#6B46C1" },
              { label: "Any AI", value: summary.anyCitation || 0, color: "#059669" },
            ].map(s => (
              <div key={s.label} style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 10, color: txt2, marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Keywords where you ARE cited */}
          {keywords.filter(k => k.anyCitation).length > 0 && (
            <div style={{ background: "#05966911", border: "1px solid #05966933", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#059669", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>
                Your Site Cited by AI
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {keywords.filter(k => k.anyCitation).map((k, i) => (
                  <div key={i} style={{ fontSize: 11, padding: "5px 10px", borderRadius: 8, background: bg3, border: `1px solid ${bdr}` }}>
                    <span style={{ fontWeight: 700, color: txt }}>{k.keyword}</span>
                    <div style={{ display: "flex", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
                      {(k.citedBy || []).map(src => {
                        const s = SOURCE_ICONS[src] || { icon: "🤖", color: B };
                        return (
                          <span key={src} style={{ fontSize: 10, color: s.color, fontWeight: 600 }}>{s.icon} {src}</span>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Keywords NOT cited — opportunity */}
          {keywords.filter(k => !k.anyCitation).length > 0 && (
            <div style={{ background: "#D9770611", border: "1px solid #D9770633", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#D97706", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>
                Not Cited — Opportunity
              </div>
              <div style={{ fontSize: 11, color: txt2, marginBottom: 8 }}>
                Add FAQ schema + Q&A-style content sections to increase AI citation probability.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {keywords.filter(k => !k.anyCitation).map((k, i) => (
                  <span key={i} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, background: bg3, border: `1px solid ${bdr}`, color: txt2 }}>
                    {k.keyword}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Full detail table */}
          <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", borderBottom: `1px solid ${bdr}`, fontSize: 11, fontWeight: 700, color: txt2, display: "grid", gridTemplateColumns: "1fr 80px 80px 80px" }}>
              <span>Keyword</span>
              <span style={{ textAlign: "center" }}>Bing AI</span>
              <span style={{ textAlign: "center" }}>Google AIO</span>
              <span style={{ textAlign: "center" }}>Perplexity</span>
            </div>
            {keywords.map((k, i) => (
              <div key={i} style={{ padding: "9px 14px", borderBottom: i < keywords.length - 1 ? `1px solid ${bdr}` : "none", display: "grid", gridTemplateColumns: "1fr 80px 80px 80px", alignItems: "center" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: txt }}>{k.keyword}</div>
                <div style={{ textAlign: "center", fontSize: 12 }}>
                  {k.bingCopilotPresent ? (k.bingCopilotCited ? "🏆" : "📭") : "—"}
                </div>
                <div style={{ textAlign: "center", fontSize: 12 }}>
                  {k.googleAIOPresent ? (k.googleAIOCited ? "🏆" : "📭") : "—"}
                </div>
                <div style={{ textAlign: "center", fontSize: 12 }}>
                  {k.perplexityPresent ? (k.perplexityCited ? "🏆" : "📭") : (summary.hasPerplexityKey ? "—" : "🔑")}
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10, color: txt2, marginTop: 6 }}>🏆 = your site cited · 📭 = AI present but not citing you · 🔑 = needs Perplexity API key</div>

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
