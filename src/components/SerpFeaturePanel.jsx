import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

const FEATURE_META = {
  featured_snippet: { label: "Featured Snippet",   icon: "⭐", color: "#D97706" },
  people_also_ask:  { label: "People Also Ask",    icon: "❓", color: "#0891B2" },
  knowledge_panel:  { label: "Knowledge Panel",    icon: "🧠", color: "#6B46C1" },
  image_pack:       { label: "Image Pack",         icon: "🖼️", color: "#059669" },
  video_pack:       { label: "Video Pack",         icon: "🎥", color: "#DC2626" },
  local_pack:       { label: "Local Pack",         icon: "📍", color: "#059669" },
  shopping:         { label: "Shopping",           icon: "🛒", color: "#D97706" },
  sitelinks:        { label: "Sitelinks",          icon: "🔗", color: "#443DCB" },
  top_stories:      { label: "Top Stories",        icon: "📰", color: "#374151" },
};

export default function SerpFeaturePanel({ dark, clientId }) {
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
      const r = await fetch(`${API}/api/agents/${clientId}/serp-features/results`, {
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
      const r = await fetch(`${API}/api/agents/${clientId}/serp-features/scan`, {
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
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, gap: 8, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: txt }}>SERP Feature Tracker</div>
          <div style={{ fontSize: 11, color: txt2, marginTop: 2 }}>
            Detects Featured Snippets, PAA, Knowledge Panels, Image/Video Packs and Local Packs per keyword
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
          <div style={{ fontSize: 32, marginBottom: 8 }}>⭐</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: txt, marginBottom: 6 }}>No SERP Feature Data Yet</div>
          <div style={{ fontSize: 12, color: txt2, marginBottom: 16 }}>Scan to see which SERP features appear for your keywords — and which you can win</div>
          <button onClick={scan} disabled={scanning} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: B, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Start Scan
          </button>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10, marginBottom: 20 }}>
            {[
              { label: "Keywords",        value: summary.totalChecked || 0,    color: txt },
              { label: "Feat. Snippets",  value: summary.featuredSnippets || 0, color: "#D97706" },
              { label: "You Own Snippet", value: summary.ownedSnippets || 0,   color: "#059669" },
              { label: "PAA Present",     value: summary.paaPresent || 0,      color: "#0891B2" },
              { label: "Local Packs",     value: summary.localPacks || 0,      color: "#059669" },
              { label: "Opportunities",   value: summary.opportunities || 0,   color: "#DC2626" },
            ].map(s => (
              <div key={s.label} style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 10, color: txt2, marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Opportunities — snippet present but NOT ours */}
          {summary.opportunities > 0 && (
            <div style={{ background: "#D9770611", border: "1px solid #D9770633", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#D97706", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>
                Featured Snippet Opportunities
              </div>
              <div style={{ fontSize: 11, color: txt2, marginBottom: 8 }}>
                These keywords have a Featured Snippet box but your site doesn't own it. Add a concise direct-answer paragraph + FAQ schema to compete.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {keywords.filter(k => k.hasOpportunity).map((k, i) => (
                  <span key={i} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, background: "#D9770618", border: "1px solid #D9770644", color: "#D97706", fontWeight: 600 }}>
                    {k.keyword}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Keyword detail table */}
          <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, overflow: "hidden" }}>
            {keywords.map((k, i) => (
              <div key={i} style={{ padding: "10px 14px", borderBottom: i < keywords.length - 1 ? `1px solid ${bdr}` : "none" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: k.features?.length > 0 ? 6 : 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: txt }}>{k.keyword}</div>
                  {k.featureCount > 0 ? (
                    <span style={{ fontSize: 10, color: B, fontWeight: 700, background: B + "18", padding: "2px 8px", borderRadius: 6 }}>
                      {k.featureCount} feature{k.featureCount > 1 ? "s" : ""}
                    </span>
                  ) : (
                    <span style={{ fontSize: 10, color: txt2 }}>No rich features</span>
                  )}
                </div>
                {k.features?.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {k.features.map((f, j) => {
                      const meta = FEATURE_META[f.type] || { icon: "•", color: txt2, label: f.type };
                      return (
                        <span key={j} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 6, background: meta.color + "18", border: `1px solid ${meta.color}44`, color: meta.color, fontWeight: 600 }}>
                          {meta.icon} {meta.label}
                          {f.type === "featured_snippet" && f.owned && " ✓ Yours"}
                          {f.type === "featured_snippet" && !f.owned && " — Win this"}
                        </span>
                      );
                    })}
                  </div>
                )}
                {k.features?.find(f => f.type === "people_also_ask")?.questions?.length > 0 && (
                  <div style={{ marginTop: 5, fontSize: 10, color: txt2 }}>
                    PAA: {k.features.find(f => f.type === "people_also_ask").questions.slice(0, 2).join(" · ")}
                  </div>
                )}
                {k.error && <div style={{ fontSize: 10, color: "#DC2626" }}>{k.error}</div>}
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
