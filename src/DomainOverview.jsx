import { useState } from "react";

const API = import.meta.env.VITE_API_URL || "https://seo-agent-backend-8m1z.onrender.com";

export default function DomainOverview({ dark, getToken }) {
  const [domain,  setDomain]  = useState("");
  const [loading, setLoading] = useState(false);
  const [data,    setData]    = useState(null);
  const [error,   setError]   = useState("");
  const [tab,     setTab]     = useState("overview");

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const B    = "#443DCB";

  async function analyze() {
    const d = domain.trim();
    if (!d) return;
    setLoading(true); setData(null); setError(""); setTab("overview");
    try {
      const token = getToken ? await getToken() : null;
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res  = await fetch(`${API}/api/backlinks/analyze`, {
        method: "POST", headers, body: JSON.stringify({ domain: d }),
      });
      const json = await res.json();
      if (json.error) setError(json.error);
      else setData(json);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  const drColor = data ? getDRColor(data.drScore) : "#888";
  const totalLinks = data ? (data.followLinks + data.nofollowLinks) : 0;

  return (
    <div style={{ padding: 24, background: bg, minHeight: "100vh", color: txt }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Domain Overview</h2>
      <p style={{ color: txt2, fontSize: 13, marginBottom: 20 }}>
        Real backlink data — DR score, referring domains, anchor analysis — powered by DataForSEO
      </p>

      {/* Input */}
      <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
        <input
          value={domain}
          onChange={e => setDomain(e.target.value)}
          onKeyDown={e => e.key === "Enter" && analyze()}
          placeholder="Enter domain (e.g. ahrefs.com)"
          style={{
            flex: 1, padding: "10px 14px", borderRadius: 8,
            border: `1px solid ${bdr}`, background: bg2, color: txt, fontSize: 14,
          }}
        />
        <button onClick={analyze} disabled={loading || !domain.trim()} style={{
          padding: "10px 22px", borderRadius: 8, border: "none", cursor: "pointer",
          background: loading ? "#444" : B, color: "#fff", fontSize: 14, fontWeight: 600,
          opacity: loading || !domain.trim() ? 0.6 : 1,
        }}>
          {loading ? "Analyzing..." : "Analyze"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: "14px 16px", background: "#DC262611", border: "1px solid #DC262633", borderRadius: 10, color: "#DC2626", marginBottom: 20, fontSize: 13 }}>
          <div style={{ fontWeight: 700, marginBottom: error.includes("DataForSEO") ? 8 : 0 }}>{error}</div>
          {error.includes("DataForSEO") && (
            <div style={{ color: txt2, lineHeight: 1.8 }}>
              <strong style={{ color: txt }}>How to fix:</strong><br />
              1. Sign up at <strong>dataforseo.com</strong> (free trial available)<br />
              2. Copy your <strong>login:password</strong> API credentials<br />
              3. Go to <strong>Settings → API Keys</strong> → paste in DataForSEO field → Save<br />
              4. Come back and click Analyze again
            </div>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: 60, color: txt2 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Fetching real backlink data...</div>
          <div style={{ fontSize: 12 }}>Querying DataForSEO — usually takes 3–8 seconds</div>
        </div>
      )}

      {data && (
        <>
          {/* KPI Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 20 }}>
            <div style={{ padding: "14px 16px", background: bg2, border: `2px solid ${drColor}22`, borderRadius: 12, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: txt2, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Domain Rank</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: drColor, lineHeight: 1 }}>{data.drScore ?? "0"}</div>
              <div style={{ fontSize: 11, color: drColor, fontWeight: 600, marginTop: 4 }}>{data.drLabel || "—"}</div>
            </div>
            {[
              { label: "Backlinks",        value: (data.backlinks || 0).toLocaleString(),        color: B },
              { label: "Referring Domains",value: (data.referringDomains || 0).toLocaleString(), color: "#0891B2" },
              { label: "Referring IPs",    value: (data.referringIPs || 0).toLocaleString(),     color: "#9333EA" },
              { label: "Spam Score",       value: `${data.spamScore || 0}%`,                     color: (data.spamScore || 0) > 30 ? "#DC2626" : "#059669" },
              { label: "New (30d)",        value: `+${data.newBacklinks || 0}`,                  color: "#059669" },
              { label: "Lost (30d)",       value: `-${data.lostBacklinks || 0}`,                 color: "#DC2626" },
            ].map(k => (
              <div key={k.label} style={{ padding: "14px 16px", background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, textAlign: "center" }}>
                <div style={{ fontSize: 10, color: txt2, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{k.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: k.color, lineHeight: 1 }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* DoFollow bar */}
          {totalLinks > 0 && (
            <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 8 }}>Do-Follow vs No-Follow</div>
              <div style={{ height: 8, borderRadius: 4, background: bdr, overflow: "hidden", marginBottom: 6 }}>
                <div style={{ height: "100%", width: `${Math.round((data.followLinks / totalLinks) * 100)}%`, background: "#059669", borderRadius: 4 }} />
              </div>
              <div style={{ display: "flex", gap: 20, fontSize: 12 }}>
                <span style={{ color: txt2 }}>✅ DoFollow: <strong style={{ color: txt }}>{(data.followLinks || 0).toLocaleString()}</strong></span>
                <span style={{ color: txt2 }}>⚠️ NoFollow: <strong style={{ color: txt }}>{(data.nofollowLinks || 0).toLocaleString()}</strong></span>
                <span style={{ color: txt2, marginLeft: "auto" }}>{Math.round((data.followLinks / totalLinks) * 100)}% DoFollow</span>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: `1px solid ${bdr}` }}>
            {[
              { key: "overview",  label: "Overview" },
              { key: "referring", label: `Referring Domains (${data.referringDomainsData?.length || 0})` },
              { key: "anchors",   label: `Anchor Texts (${data.topAnchors?.length || 0})` },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                padding: "8px 16px", border: "none", cursor: "pointer", fontSize: 13, background: "none",
                color: tab === t.key ? B : txt2, fontWeight: tab === t.key ? 700 : 400,
                borderBottom: tab === t.key ? `2px solid ${B}` : "2px solid transparent", marginBottom: -1,
              }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Overview tab */}
          {tab === "overview" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* DR gauge */}
              <div style={{ padding: 20, background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, textAlign: "center" }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Domain Rank</div>
                <div style={{
                  width: 100, height: 100, borderRadius: "50%",
                  border: `6px solid ${drColor}`,
                  background: drColor + "22",
                  margin: "0 auto 12px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: drColor }}>{data.drScore ?? 0}</div>
                    <div style={{ fontSize: 10, color: txt2 }}>/ 100</div>
                  </div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: drColor }}>{data.drLabel}</div>
                <div style={{ fontSize: 12, color: txt2, marginTop: 4 }}>Based on backlink graph</div>
              </div>

              {/* Link profile */}
              <div style={{ padding: 20, background: bg2, border: `1px solid ${bdr}`, borderRadius: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Link Profile</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {[
                    { label: "Referring Domains",  value: data.referringDomains || 0,  color: "#0891B2" },
                    { label: "Total Backlinks",     value: data.backlinks || 0,          color: B },
                    { label: "Broken Backlinks",    value: data.brokenBacklinks || 0,    color: "#DC2626" },
                  ].map(s => (
                    <div key={s.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 13, color: txt2 }}>{s.label}</span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: s.color }}>{s.value.toLocaleString()}</span>
                    </div>
                  ))}
                  <div style={{ borderTop: `1px solid ${bdr}`, paddingTop: 10, fontSize: 12, color: txt2 }}>
                    Ratio: {data.referringDomains > 0 ? (data.backlinks / data.referringDomains).toFixed(1) : "—"} links / domain
                  </div>
                </div>
              </div>

              {/* Spam warning */}
              {(data.spamScore || 0) > 30 && (
                <div style={{ padding: 16, background: "#DC262611", border: "1px solid #DC262633", borderRadius: 10, gridColumn: "1 / -1" }}>
                  <div style={{ fontWeight: 700, color: "#DC2626", marginBottom: 4 }}>⚠️ High Spam Score: {data.spamScore}%</div>
                  <div style={{ fontSize: 12, color: txt2 }}>
                    A spam score above 30% suggests many low-quality or spammy referring domains.
                    Consider a link audit and disavow file submission via Google Search Console.
                  </div>
                </div>
              )}

              {/* New vs lost */}
              <div style={{ padding: 16, background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, gridColumn: "1 / -1" }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12 }}>Last 30 Days</div>
                <div style={{ display: "flex", gap: 24 }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#059669" }}>+{(data.newBacklinks || 0).toLocaleString()}</div>
                    <div style={{ fontSize: 11, color: txt2 }}>New backlinks</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#DC2626" }}>-{(data.lostBacklinks || 0).toLocaleString()}</div>
                    <div style={{ fontSize: 11, color: txt2 }}>Lost backlinks</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: (data.newBacklinks||0) >= (data.lostBacklinks||0) ? "#059669" : "#DC2626" }}>
                      {(data.newBacklinks||0) >= (data.lostBacklinks||0) ? "+" : ""}{(data.newBacklinks||0) - (data.lostBacklinks||0)}
                    </div>
                    <div style={{ fontSize: 11, color: txt2 }}>Net change</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Referring Domains tab */}
          {tab === "referring" && (
            <div>
              {data.referringDomainsData?.length > 0 ? (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${bdr}` }}>
                      {["Referring Domain", "Rank", "Backlinks", "DoFollow", "First Seen", "Spam"].map(h => (
                        <th key={h} style={{ textAlign: h === "Referring Domain" ? "left" : "center", padding: "8px 10px", color: txt2, fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.referringDomainsData.map((d, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${bdr}22` }}>
                        <td style={{ padding: "8px 10px", color: B, fontWeight: 500 }}>{d.domain}</td>
                        <td style={{ padding: "8px 10px", textAlign: "center" }}>{d.rank}</td>
                        <td style={{ padding: "8px 10px", textAlign: "center" }}>{(d.backlinks || 0).toLocaleString()}</td>
                        <td style={{ padding: "8px 10px", textAlign: "center", color: d.dofollow ? "#059669" : txt2 }}>
                          {d.dofollow ? "✅" : "—"}
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "center", color: txt2, fontSize: 12 }}>
                          {d.firstSeen ? new Date(d.firstSeen).toLocaleDateString() : "—"}
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "center", color: (d.spamScore || 0) > 30 ? "#DC2626" : txt2 }}>
                          {d.spamScore || 0}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ textAlign: "center", padding: 40, color: txt2, fontSize: 13 }}>
                  No referring domain data found for this domain.
                </div>
              )}
            </div>
          )}

          {/* Anchor Texts tab */}
          {tab === "anchors" && (
            <div>
              {data.topAnchors?.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {data.topAnchors.map((a, i) => {
                    const maxCount = data.topAnchors[0]?.count || 1;
                    return (
                      <div key={i} style={{ padding: "10px 16px", background: bg2, border: `1px solid ${bdr}`, borderRadius: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
                          <div style={{ width: 22, height: 22, borderRadius: "50%", background: `${B}22`, color: B, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                            {i + 1}
                          </div>
                          <div style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{a.text || "(no text)"}</div>
                          <div style={{ fontSize: 12, color: txt2 }}>{a.count} links · {a.domains} domains</div>
                          <div style={{ fontSize: 11, color: a.dofollow ? "#059669" : txt2 }}>{a.dofollow ? "DoFollow" : "NoFollow"}</div>
                        </div>
                        <div style={{ height: 4, borderRadius: 2, background: bdr, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.round((a.count / maxCount) * 100)}%`, background: B, borderRadius: 2 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: 40, color: txt2, fontSize: 13 }}>
                  No anchor text data found for this domain.
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: 20, fontSize: 11, color: txt2, textAlign: "right" }}>
            Data source: DataForSEO Backlinks API · Analyzed: {data.domain}
          </div>
        </>
      )}

      {!data && !loading && !error && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: txt2 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔗</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: txt, marginBottom: 8 }}>Analyze any domain's backlink profile</div>
          <div style={{ fontSize: 13 }}>Enter a domain above to see DR score, referring domains, backlinks, and anchor texts from DataForSEO.</div>
          <div style={{ fontSize: 12, marginTop: 16, padding: "10px 16px", background: bg2, border: `1px solid ${bdr}`, borderRadius: 8, display: "inline-block" }}>
            Requires DataForSEO API key in <strong>Settings → API Keys</strong>
          </div>
        </div>
      )}
    </div>
  );
}

function getDRColor(dr) {
  if (!dr && dr !== 0) return "#888";
  if (dr >= 70) return "#059669";
  if (dr >= 50) return "#D97706";
  if (dr >= 30) return "#EA580C";
  return "#DC2626";
}
