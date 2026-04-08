import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

const B = "#443DCB";

export default function AttributionDashboard({ dark, clientId, bg2, bg3, bdr, txt, txt2 }) {
  const { user, API } = useAuth();
  const [data,       setData]       = useState(null);
  const [ga4Data,    setGa4Data]    = useState(null);
  const [snippet,    setSnippet]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [ga4Loading, setGa4Loading] = useState(false);
  const [activeView, setActiveView] = useState("funnel"); // funnel | ga4 | snippet
  const [copied,     setCopied]     = useState(false);

  async function getToken() { return user?.getIdToken?.() || ""; }

  async function load() {
    setLoading(true);
    const token = await getToken();
    const [dataRes, snippetRes] = await Promise.all([
      fetch(`${API}/api/attribution/${clientId}/data`,    { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API}/api/attribution/${clientId}/snippet`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    const d = await dataRes.json().catch(() => ({}));
    const s = await snippetRes.json().catch(() => ({}));
    setData(d);
    setSnippet(s.snippet || null);
    setLoading(false);
  }

  async function loadGA4() {
    setGa4Loading(true);
    try {
      const token = await getToken();
      const res   = await fetch(`${API}/api/attribution/${clientId}/ga4-conversions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json().catch(() => ({}));
      setGa4Data(d);
    } catch (_) {
      setGa4Data({ error: "Failed to load GA4 data" });
    }
    setGa4Loading(false);
  }

  useEffect(() => { load(); }, [clientId]);

  // Auto-load GA4 when tab opens
  useEffect(() => {
    if (activeView === "ga4" && !ga4Data && !ga4Loading) {
      loadGA4();
    }
  }, [activeView]);

  function copySnippet() {
    if (snippet) {
      navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (loading) return <div style={{ padding: 24, color: txt2 }}>Loading attribution data...</div>;

  const total      = data?.total || 0;
  const keyFunnel  = data?.keywordFunnel || [];
  const srcFunnel  = data?.sourceFunnel  || [];
  const conversions = data?.conversions  || [];
  const maxKwCount = keyFunnel[0]?.conversions || 1;

  const VIEWS = [
    { id: "funnel", label: "Form Tracking" },
    { id: "ga4",    label: "GA4 Conversion Join" },
    { id: "snippet",label: "Tracking Snippet" },
  ];

  return (
    <div style={{ padding: 24 }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: txt, marginBottom: 4 }}>Keyword → Lead Attribution</div>
        <div style={{ fontSize: 12, color: txt2 }}>Which keywords bring leads — not just clicks. Powered by form tracking + GA4 real data.</div>
      </div>

      {/* Tab nav */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: `1px solid ${bdr}` }}>
        {VIEWS.map(v => (
          <button key={v.id} onClick={() => setActiveView(v.id)} style={{
            padding: "8px 14px", border: "none", borderRadius: "6px 6px 0 0",
            background: activeView === v.id ? bg2 : "transparent",
            color: activeView === v.id ? B : txt2,
            fontWeight: activeView === v.id ? 700 : 400,
            fontSize: 12, cursor: "pointer",
            borderBottom: activeView === v.id ? `2px solid ${B}` : "2px solid transparent",
          }}>{v.label}</button>
        ))}
      </div>

      {/* ── Form Tracking tab ────────────────────────── */}
      {activeView === "funnel" && (
        <>
          {total === 0 ? (
            <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 40, textAlign: "center" }}>
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
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
                {[
                  { label: "Total Form Fills",  value: total,                                                      color: B        },
                  { label: "Keywords w/ Leads", value: keyFunnel.filter(k => k.keyword !== "(not set)").length,    color: "#059669" },
                  { label: "Top Keyword",       value: keyFunnel[0]?.keyword || "—",                               color: "#D97706" },
                ].map(s => (
                  <div key={s.label} style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, padding: "14px 16px" }}>
                    <div style={{ fontSize: s.label === "Top Keyword" ? 13 : 22, fontWeight: 700, color: s.color, marginBottom: 2, wordBreak: "break-word" }}>{s.value}</div>
                    <div style={{ fontSize: 10, color: txt2 }}>{s.label}</div>
                  </div>
                ))}
              </div>

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

              <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: txt, marginBottom: 14 }}>Recent Form Fills</div>
                {conversions.slice(0, 10).map((c, i) => (
                  <div key={i} style={{ padding: "10px 0", borderBottom: i < 9 ? `1px solid ${bdr}` : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: txt }}>{c.gscKeyword || c.utmTerm || "(organic — no keyword)"}</div>
                      <div style={{ fontSize: 10, color: txt2 }}>{c.submittedAt ? new Date(c.submittedAt).toLocaleDateString() : "—"}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {c.utmSource   && <span style={{ fontSize: 10, color: txt2 }}>Source: <span style={{ color: B }}>{c.utmSource}</span></span>}
                      {c.utmMedium   && <span style={{ fontSize: 10, color: txt2 }}>Medium: <span style={{ color: B }}>{c.utmMedium}</span></span>}
                      {c.landingPage && <span style={{ fontSize: 10, color: txt2 }}>Page: <span style={{ color: txt }}>{c.landingPage.replace(/^https?:\/\/[^/]+/, "").slice(0, 40)}</span></span>}
                      {c.gscPosition && <span style={{ fontSize: 10, color: txt2 }}>Ranked: <span style={{ color: "#059669" }}>pos {c.gscPosition}</span></span>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* ── GA4 Conversion Join tab ───────────────────── */}
      {activeView === "ga4" && (
        <GA4ConversionView
          ga4Data={ga4Data} ga4Loading={ga4Loading} onRefresh={loadGA4}
          dark={dark} bg2={bg2} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2}
        />
      )}

      {/* ── Snippet tab ──────────────────────────────── */}
      {activeView === "snippet" && (
        <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: txt, marginBottom: 8 }}>Install Tracking Snippet</div>
          <div style={{ fontSize: 12, color: txt2, marginBottom: 16, lineHeight: 1.6 }}>
            Paste before <code style={{ background: bg3, padding: "1px 4px", borderRadius: 4 }}>&lt;/body&gt;</code> on every page, or add via Google Tag Manager as a Custom HTML tag.
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
              1. On page load: captures UTM params into session storage<br/>
              2. On form submit: fires a beacon with session + form data<br/>
              3. Backend joins with GSC rankings to identify the lead-driving keyword<br/>
              4. Attribution appears in this dashboard within minutes
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── GA4 Conversion Join view ──────────────────────
function GA4ConversionView({ ga4Data, ga4Loading, onRefresh, bg2, bg3, bdr, txt, txt2 }) {
  if (ga4Loading) return <div style={{ padding: 24, color: txt2, fontSize: 13 }}>Loading GA4 data...</div>;

  const hasError  = ga4Data?.error && !ga4Data?.keywordJoin?.length;
  const isNoSetup = ga4Data?.source === "none";

  if (!ga4Data || isNoSetup || hasError) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {(isNoSetup || hasError) && (
          <div style={{ padding: 16, background: "#D9770610", border: "1px solid #D9770633", borderRadius: 10, fontSize: 12, color: "#D97706" }}>
            {ga4Data?.error || "Connect GA4 in Settings to see real conversion data joined with keyword rankings."}
          </div>
        )}
        <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📈</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: txt, marginBottom: 8 }}>GA4 Conversion Join</div>
          <div style={{ fontSize: 12, color: txt2, maxWidth: 460, margin: "0 auto 20px", lineHeight: 1.6 }}>
            Connect your GA4 property to see which keywords drive real conversions — not just clicks. This uses the GA4 Data API to join session source data with your GSC keyword rankings.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 340, margin: "0 auto 20px", textAlign: "left" }}>
            {[
              "1. Sign in with Google in Settings",
              "2. Add your GA4 Property ID (e.g. 123456789)",
              "3. Come back here and click Refresh",
            ].map((s, i) => (
              <div key={i} style={{ fontSize: 12, color: txt2, padding: "8px 12px", background: bg2, border: `1px solid ${bdr}`, borderRadius: 8 }}>{s}</div>
            ))}
          </div>
          <button onClick={onRefresh} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: B, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const total    = ga4Data.totalConversions || 0;
  const sessions = ga4Data.totalSessions    || 0;
  const organic  = ga4Data.organicKeywordLeaders || [];
  const sources  = ga4Data.sourceSummary    || [];
  const joined   = ga4Data.keywordJoin      || [];
  const maxCon   = sources[0]?.conversions  || 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header stats */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontSize: 11, color: txt2 }}>
          GA4 Property: <span style={{ fontWeight: 700, color: txt }}>{ga4Data.ga4PropertyId}</span>
          <span style={{ marginLeft: 12 }}>{ga4Data.dateRange}</span>
        </div>
        <button onClick={onRefresh} style={{ padding: "6px 14px", borderRadius: 7, border: `1px solid ${bdr}`, background: "transparent", color: txt2, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
          ↻ Refresh
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {[
          { label: "Conversions (30d)", value: total,    color: B        },
          { label: "Sessions (30d)",    value: sessions,  color: "#0891B2" },
          { label: "Organic Leaders",   value: organic.length, color: "#059669" },
        ].map(s => (
          <div key={s.label} style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color, marginBottom: 2 }}>{s.value}</div>
            <div style={{ fontSize: 10, color: txt2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Organic keyword leaders — the star of this panel */}
      {organic.length > 0 && (
        <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: txt, marginBottom: 4 }}>Organic Keywords → Conversions</div>
          <div style={{ fontSize: 11, color: txt2, marginBottom: 14 }}>These organic search keywords drove real GA4 conversion events in the last 30 days.</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {["Keyword (GSC)", "Position", "Landing Page", "Conversions", "Conv. Rate", "GSC Clicks"].map(h => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, color: txt2, borderBottom: `1px solid ${bdr}`, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {organic.map((r, i) => (
                  <tr key={i}>
                    <td style={{ padding: "10px 12px", fontWeight: 700, color: txt, borderBottom: `1px solid ${bdr}` }}>{r.gscKeyword || "(not matched)"}</td>
                    <td style={{ padding: "10px 12px", color: r.gscPosition <= 3 ? "#059669" : r.gscPosition <= 10 ? "#D97706" : txt2, borderBottom: `1px solid ${bdr}`, fontWeight: 700 }}>
                      {r.gscPosition ? `#${r.gscPosition}` : "—"}
                    </td>
                    <td style={{ padding: "10px 12px", color: txt2, fontSize: 11, borderBottom: `1px solid ${bdr}`, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.landingPage.replace(/^https?:\/\/[^/]+/, "").slice(0, 35) || "/"}
                    </td>
                    <td style={{ padding: "10px 12px", color: B, fontWeight: 700, borderBottom: `1px solid ${bdr}` }}>{r.conversions}</td>
                    <td style={{ padding: "10px 12px", color: r.conversionRate > 3 ? "#059669" : txt2, borderBottom: `1px solid ${bdr}` }}>
                      {r.conversionRate != null ? `${r.conversionRate}%` : "—"}
                    </td>
                    <td style={{ padding: "10px 12px", color: txt2, borderBottom: `1px solid ${bdr}` }}>
                      {r.gscClicks != null ? r.gscClicks.toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Source summary */}
      {sources.length > 0 && (
        <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: txt, marginBottom: 14 }}>Conversions by Source / Medium</div>
          {sources.slice(0, 8).map((s, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ fontSize: 11, color: txt }}>{s.source} / {s.medium}</span>
                <span style={{ fontSize: 11, color: B, fontWeight: 700 }}>{s.conversions}</span>
              </div>
              <div style={{ height: 5, background: bdr, borderRadius: 3 }}>
                <div style={{ height: 5, background: s.medium === "organic" ? "#059669" : B, borderRadius: 3, width: `${Math.round((s.conversions / maxCon) * 100)}%`, transition: "width 0.3s" }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
