import { useState } from "react";

const API = import.meta.env.VITE_API_URL || "https://seo-agent-backend-8m1z.onrender.com";

export default function DomainOverview({ dark, getToken }) {
  const [domain,  setDomain]  = useState("");
  const [loading, setLoading] = useState(false);
  const [crawling, setCrawling] = useState(false);
  const [data,    setData]    = useState(null);
  const [error,   setError]   = useState("");
  const [tab,     setTab]     = useState("overview");

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";

  async function analyze() {
    const d = domain.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");
    if (!d) return;
    setLoading(true); setData(null); setError(""); setTab("overview");
    try {
      const token = getToken ? await getToken() : null;
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res  = await fetch(`${API}/api/crawler/domain-overview`, {
        method: "POST", headers, body: JSON.stringify({ domain: d }),
      });
      const json = await res.json();
      if (json.error) setError(json.error);
      else setData(json);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  async function startCrawl() {
    const d = domain.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");
    if (!d) return;
    setCrawling(true);
    try {
      const token = getToken ? await getToken() : null;
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      await fetch(`${API}/api/crawler/crawl-domain`, {
        method: "POST", headers, body: JSON.stringify({ domain: d, maxPages: 50, background: true }),
      });
      setTimeout(() => { setCrawling(false); analyze(); }, 2000);
    } catch { setCrawling(false); }
  }

  const drColor = getDRColor(data?.drScore);

  return (
    <div style={{ padding: 24, background: bg, minHeight: "100vh", color: txt }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Domain Overview</h2>
      <p style={{ color: txt2, fontSize: 13, marginBottom: 20 }}>
        DR score, backlinks, referring domains — powered by our own crawler
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
          background: loading ? "#444" : "#443DCB", color: "#fff", fontSize: 14, fontWeight: 600,
        }}>
          {loading ? "Loading..." : "Analyze"}
        </button>
      </div>

      {error && (
        <div style={{ padding: 12, background: "#DC262622", border: "1px solid #DC2626", borderRadius: 8, color: "#DC2626", marginBottom: 20, fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{ textAlign: "center", padding: 60, color: txt2 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🌐</div>
          <div>Loading domain data...</div>
        </div>
      )}

      {data && (
        <>
          {/* Fresh status banner */}
          {!data.isFresh && (
            <div style={{ padding: "10px 16px", background: "#D9770622", border: "1px solid #D97706", borderRadius: 8, marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, color: "#D97706" }}>
                No recent crawl data — results may be incomplete.
                {data.freshCrawlQueued ? " A fresh crawl has been queued." : ""}
              </span>
              <button onClick={startCrawl} disabled={crawling} style={{
                padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer",
                background: "#D97706", color: "#fff", fontSize: 12, fontWeight: 600,
              }}>
                {crawling ? "Queuing..." : "Crawl Now"}
              </button>
            </div>
          )}

          {/* Metric Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
            <DRCard dr={data.drScore} label={data.drLabel} dark={dark} />
            <MetricCard dark={dark} label="Referring Domains" value={data.referringDomains?.toLocaleString() || "—"} color="#059669" icon="🌐" />
            <MetricCard dark={dark} label="Total Backlinks" value={data.totalBacklinks?.toLocaleString() || "—"} color="#0891B2" icon="🔗" />
            <MetricCard dark={dark} label="Pages Crawled" value={data.pagesCrawled?.toLocaleString() || "—"} color="#9333EA" icon="📄" />
            <MetricCard dark={dark} label="Last Crawled" value={data.lastCrawled ? new Date(data.lastCrawled).toLocaleDateString() : "Never"} color="#D97706" icon="🕐" />
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: `1px solid ${bdr}` }}>
            {["overview", "backlinks", "anchors"].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: "8px 16px", border: "none", cursor: "pointer", fontSize: 13, background: "none",
                color: tab === t ? "#443DCB" : txt2, fontWeight: tab === t ? 700 : 400,
                borderBottom: tab === t ? "2px solid #443DCB" : "2px solid transparent", marginBottom: -1,
              }}>
                {t === "overview" ? "Overview" : t === "backlinks" ? "Referring Domains" : "Anchor Texts"}
              </button>
            ))}
          </div>

          {tab === "overview" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* DR Gauge */}
              <div style={{ padding: 20, background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, textAlign: "center" }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Domain Rating</div>
                <div style={{ width: 100, height: 100, borderRadius: "50%", border: `6px solid ${drColor}`, background: drColor + "22", margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: drColor }}>{data.drScore ?? "—"}</div>
                    <div style={{ fontSize: 10, color: txt2 }}>/ 100</div>
                  </div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: drColor }}>{data.drLabel || "Not calculated"}</div>
                <div style={{ fontSize: 12, color: txt2, marginTop: 4 }}>Based on backlink graph</div>
              </div>

              {/* Link Profile */}
              <div style={{ padding: 20, background: bg2, border: `1px solid ${bdr}`, borderRadius: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Link Profile</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <Stat label="Referring Domains" value={data.referringDomains || 0} color="#059669" />
                  <Stat label="Total Backlinks" value={data.totalBacklinks || 0} color="#0891B2" />
                  <div style={{ borderTop: `1px solid ${bdr}`, paddingTop: 10, fontSize: 12, color: txt2 }}>
                    Ratio: {data.referringDomains > 0 ? (data.totalBacklinks / data.referringDomains).toFixed(1) : "—"} links / domain
                  </div>
                </div>
              </div>

              {/* Crawl Info */}
              <div style={{ padding: 20, background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, gridColumn: "1 / -1" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Crawl Status</div>
                  <button onClick={startCrawl} disabled={crawling} style={{
                    padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer",
                    background: "#443DCB", color: "#fff", fontSize: 12,
                  }}>
                    {crawling ? "Starting..." : "Start Fresh Crawl"}
                  </button>
                </div>
                <div style={{ display: "flex", gap: 24, fontSize: 13, color: txt2 }}>
                  <span>Pages crawled: <b style={{ color: txt }}>{data.pagesCrawled || 0}</b></span>
                  <span>Status: <b style={{ color: data.isFresh ? "#059669" : "#D97706" }}>{data.isFresh ? "Fresh" : "Stale"}</b></span>
                  <span>Last crawl: <b style={{ color: txt }}>{data.lastCrawled ? new Date(data.lastCrawled).toLocaleString() : "Never"}</b></span>
                </div>
              </div>
            </div>
          )}

          {tab === "backlinks" && (
            <div>
              {data.referringDomainsData?.length > 0 ? (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${bdr}` }}>
                      <th style={{ textAlign: "left", padding: "8px 10px", color: txt2, fontWeight: 600 }}>Referring Domain</th>
                      <th style={{ textAlign: "center", padding: "8px 10px", color: txt2, fontWeight: 600 }}>Links</th>
                      <th style={{ textAlign: "center", padding: "8px 10px", color: txt2, fontWeight: 600 }}>DR</th>
                      <th style={{ textAlign: "left", padding: "8px 10px", color: txt2, fontWeight: 600 }}>First Seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.referringDomainsData.map((d, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${bdr}22` }}>
                        <td style={{ padding: "8px 10px", color: "#443DCB" }}>{d.domain}</td>
                        <td style={{ padding: "8px 10px", textAlign: "center" }}>{d.linkCount}</td>
                        <td style={{ padding: "8px 10px", textAlign: "center" }}>
                          <span style={{ color: getDRColor(d.dr), fontWeight: 700 }}>{d.dr ?? "—"}</span>
                        </td>
                        <td style={{ padding: "8px 10px", color: txt2, fontSize: 12 }}>
                          {d.firstSeen ? new Date(d.firstSeen).toLocaleDateString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ textAlign: "center", padding: 40, color: txt2 }}>
                  No referring domain data yet. Start a crawl to populate backlink data.
                </div>
              )}
            </div>
          )}

          {tab === "anchors" && (
            <div>
              {data.topAnchors?.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {data.topAnchors.map((a, i) => (
                    <div key={i} style={{ padding: "10px 16px", background: bg2, border: `1px solid ${bdr}`, borderRadius: 8, display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#443DCB22", color: "#443DCB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                        {i + 1}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{a.text || "(no text)"}</div>
                      </div>
                      <div style={{ fontSize: 13, color: txt2 }}>{a.count} links</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: 40, color: txt2 }}>
                  No anchor text data yet.
                </div>
              )}
            </div>
          )}
        </>
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

function DRCard({ dr, label, dark }) {
  const bg2 = dark ? "#111" : "#ffffff";
  const bdr = dark ? "#222" : "#e0e0d8";
  const txt2 = dark ? "#666" : "#888";
  const color = getDRColor(dr);
  return (
    <div style={{ padding: "16px 18px", background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, textAlign: "center" }}>
      <div style={{ fontSize: 11, color: txt2, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>Domain Rating</div>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{dr ?? "—"}</div>
      <div style={{ fontSize: 12, color, fontWeight: 600 }}>{label || "Not rated"}</div>
    </div>
  );
}

function MetricCard({ dark, label, value, color, icon }) {
  const bg2 = dark ? "#111" : "#ffffff";
  const bdr = dark ? "#222" : "#e0e0d8";
  const txt2 = dark ? "#666" : "#888";
  return (
    <div style={{ padding: "16px 18px", background: bg2, border: `1px solid ${bdr}`, borderRadius: 12 }}>
      <div style={{ fontSize: 11, color: txt2, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{icon} {value}</div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 13, color: "#888" }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 700, color }}>{value?.toLocaleString()}</span>
    </div>
  );
}
