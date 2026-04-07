import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

const B = "#443DCB";

export default function AttributionDashboard({ dark, clientId, bg2, bg3, bdr, txt, txt2 }) {
  const { user, API } = useAuth();
  const [data,         setData]         = useState(null);
  const [snippet,      setSnippet]      = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [showSnippet,  setShowSnippet]  = useState(false);
  const [copied,       setCopied]       = useState(false);
  const [activeView,   setActiveView]   = useState("funnel"); // funnel | timeline | snippet

  async function getToken() { return user?.getIdToken?.() || ""; }

  async function load() {
    setLoading(true);
    const token = await getToken();
    const [dataRes, snippetRes] = await Promise.all([
      fetch(`${API}/api/attribution/${clientId}/data`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API}/api/attribution/${clientId}/snippet`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    const d = await dataRes.json().catch(() => ({}));
    const s = await snippetRes.json().catch(() => ({}));
    setData(d);
    setSnippet(s.snippet || null);
    setLoading(false);
  }

  useEffect(() => { load(); }, [clientId]);

  function copySnippet() {
    if (snippet) {
      navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (loading) return <div style={{ padding: 24, color: txt2 }}>Loading attribution data...</div>;

  const total        = data?.total || 0;
  const keyFunnel    = data?.keywordFunnel || [];
  const srcFunnel    = data?.sourceFunnel  || [];
  const conversions  = data?.conversions   || [];
  const maxKwCount   = keyFunnel[0]?.conversions || 1;

  return (
    <div style={{ padding: 24 }}>

      {/* ── Header ──────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: txt, marginBottom: 4 }}>Keyword → Lead Attribution</div>
          <div style={{ fontSize: 12, color: txt2 }}>Which keywords are bringing leads — not just clicks.</div>
        </div>
        <button onClick={() => setActiveView(activeView === "snippet" ? "funnel" : "snippet")}
          style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${B}`, background: "transparent", color: B, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          {activeView === "snippet" ? "← Back to Data" : "Get Tracking Snippet"}
        </button>
      </div>

      {/* ── No data empty state ─────────────────────────── */}
      {total === 0 && activeView !== "snippet" && (
        <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 40, textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: txt, marginBottom: 8 }}>No conversions tracked yet</div>
          <div style={{ fontSize: 12, color: txt2, maxWidth: 400, margin: "0 auto 16px" }}>
            Install the tracking snippet on your website to start capturing form submissions with UTM attribution.
          </div>
          <button onClick={() => setActiveView("snippet")}
            style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: B, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            Get Tracking Snippet
          </button>
        </div>
      )}

      {/* ── Snippet panel ───────────────────────────────── */}
      {activeView === "snippet" && (
        <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: txt, marginBottom: 8 }}>Install Tracking Snippet</div>
          <div style={{ fontSize: 12, color: txt2, marginBottom: 16, lineHeight: 1.6 }}>
            Paste this snippet before the <code style={{ background: bg3, padding: "1px 4px", borderRadius: 4 }}>&lt;/body&gt;</code> tag on every page of your website (or add via Google Tag Manager as a Custom HTML tag).
          </div>
          <div style={{ position: "relative" }}>
            <pre style={{ background: "#0a0a0a", color: "#e8e8e8", borderRadius: 10, padding: 16, fontSize: 11, overflowX: "auto", lineHeight: 1.6, maxHeight: 300, overflow: "auto" }}>
              {snippet || "Loading snippet..."}
            </pre>
            <button onClick={copySnippet}
              style={{ position: "absolute", top: 10, right: 10, padding: "5px 12px", borderRadius: 6, border: "none", background: copied ? "#059669" : B, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              {copied ? "✅ Copied!" : "Copy"}
            </button>
          </div>
          <div style={{ marginTop: 16, padding: 12, background: `${B}0a`, borderRadius: 8, border: `1px solid ${B}28` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: B, marginBottom: 6 }}>How it works</div>
            <div style={{ fontSize: 11, color: txt2, lineHeight: 1.7 }}>
              1. On page load: captures UTM params (utm_source, utm_medium, utm_campaign, utm_term) into session storage<br/>
              2. On form submit: fires a beacon to your SEO platform with all session data<br/>
              3. Backend joins the form event with GSC keyword rankings to identify which keyword drove the lead<br/>
              4. Attribution appears in this dashboard within minutes
            </div>
          </div>
        </div>
      )}

      {/* ── Stats summary ───────────────────────────────── */}
      {total > 0 && activeView !== "snippet" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
            {[
              { label: "Total Form Fills", value: total, color: B },
              { label: "Keywords w/ Leads", value: keyFunnel.filter(k => k.keyword !== "(not set)").length, color: "#059669" },
              { label: "Top Keyword", value: keyFunnel[0]?.keyword || "—", color: "#D97706" },
            ].map(s => (
              <div key={s.label} style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ fontSize: s.label === "Top Keyword" ? 13 : 22, fontWeight: 700, color: s.color, marginBottom: 2, wordBreak: "break-word" }}>{s.value}</div>
                <div style={{ fontSize: 10, color: txt2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* ── Keyword funnel bars ─────────────────────── */}
          <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: txt, marginBottom: 16 }}>Keyword → Lead Funnel</div>
            {keyFunnel.slice(0, 15).map((k, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <div style={{ fontSize: 11, color: txt, fontWeight: i === 0 ? 700 : 400 }}>{k.keyword}</div>
                  <div style={{ fontSize: 11, color: B, fontWeight: 700 }}>{k.conversions} lead{k.conversions !== 1 ? "s" : ""}</div>
                </div>
                <div style={{ height: 6, background: bdr, borderRadius: 3 }}>
                  <div style={{ height: 6, background: i === 0 ? B : `${B}88`, borderRadius: 3, width: `${Math.round((k.conversions / maxKwCount) * 100)}%`, transition: "width 0.3s" }} />
                </div>
              </div>
            ))}
          </div>

          {/* ── Source breakdown ────────────────────────── */}
          <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: txt, marginBottom: 14 }}>Traffic Source Breakdown</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {srcFunnel.slice(0, 10).map((s, i) => (
                <div key={i} style={{ background: bg3, border: `1px solid ${bdr}`, borderRadius: 8, padding: "8px 14px", display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ fontSize: 12, color: txt, fontWeight: 600 }}>{s.source || "direct"}</div>
                  <div style={{ fontSize: 12, color: B, fontWeight: 700 }}>{s.conversions}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Recent conversions ──────────────────────── */}
          <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: txt, marginBottom: 14 }}>Recent Form Fills</div>
            {conversions.slice(0, 10).map((c, i) => (
              <div key={i} style={{ padding: "10px 0", borderBottom: i < 9 ? `1px solid ${bdr}` : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: txt }}>{c.gscKeyword || c.utmTerm || "(organic — no keyword)"}</div>
                  <div style={{ fontSize: 10, color: txt2 }}>{c.submittedAt ? new Date(c.submittedAt).toLocaleDateString() : "—"}</div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {c.utmSource && <span style={{ fontSize: 10, color: txt2 }}>Source: <span style={{ color: B }}>{c.utmSource}</span></span>}
                  {c.utmMedium && <span style={{ fontSize: 10, color: txt2 }}>Medium: <span style={{ color: B }}>{c.utmMedium}</span></span>}
                  {c.landingPage && <span style={{ fontSize: 10, color: txt2 }}>Page: <span style={{ color: txt }}>{c.landingPage.replace(/^https?:\/\/[^/]+/, "").slice(0, 40)}</span></span>}
                  {c.gscPosition && <span style={{ fontSize: 10, color: txt2 }}>Ranked: <span style={{ color: "#059669" }}>pos {c.gscPosition}</span></span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
