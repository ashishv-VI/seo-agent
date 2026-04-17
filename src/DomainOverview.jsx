import { useState } from "react";
import { API_BASE } from "./utils/apiBase";

const API = API_BASE;

export default function DomainOverview({ dark, getToken }) {
  const [domain,   setDomain]   = useState("");
  const [loading,  setLoading]  = useState(false);
  const [data,     setData]     = useState(null);
  const [error,    setError]    = useState("");
  const [tab,      setTab]      = useState("overview");
  const [status,   setStatus]   = useState("");
  const [progress, setProgress] = useState(null); // { pagesChecked, pagesTotal, linksFound, message }

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const B    = "#443DCB";

  async function analyze(forceRefresh = false) {
    const d = domain.trim();
    if (!d) return;
    setLoading(true); setData(null); setError(""); setTab("overview");
    setProgress({ pagesChecked: 0, pagesTotal: 0, linksFound: 0, message: "Starting discovery…" });
    setStatus("Starting discovery…");

    try {
      const token = getToken ? await getToken() : null;
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      // If forceRefresh or no recent data, kick off background discovery first so we can poll progress
      if (forceRefresh) {
        await fetch(`${API}/api/crawler/domain-overview/${encodeURIComponent(d)}/start`, {
          method: "POST", headers,
          signal: AbortSignal.timeout(10000),
        }).catch(() => {});
      }

      // Poll progress in parallel with the main call
      let polling = true;
      const pollProgress = async () => {
        while (polling) {
          try {
            const p = await fetch(`${API}/api/crawler/domain-overview/${encodeURIComponent(d)}/progress`, {
              headers, signal: AbortSignal.timeout(5000),
            });
            const pj = await p.json();
            if (pj.progress) {
              setProgress(pj.progress);
              setStatus(pj.progress.message || "Discovering backlinks…");
              if (pj.progress.status === "complete") break;
            }
          } catch {}
          await new Promise(r => setTimeout(r, 2000));
        }
      };
      pollProgress();

      // Main request — waits for full result
      const res  = await fetch(`${API}/api/crawler/domain-overview`, {
        method: "POST", headers,
        body: JSON.stringify({ domain: d, forceRefresh }),
        signal: AbortSignal.timeout(90000), // discovery can take up to 60s; buffer 30s
      });
      polling = false;
      const json = await res.json();
      if (json.error) setError(json.error);
      else setData(json);
    } catch (e) {
      setError(e.name === "TimeoutError" ? "Discovery still running — click Refresh in a minute to see results" : e.message);
    }
    setLoading(false);
    setStatus("");
    setProgress(null);
  }

  const drColor = data ? getDRColor(data.drScore) : "#888";
  const totalLinks = data ? ((data.followLinks || 0) + (data.nofollowLinks || 0)) : 0;

  return (
    <div style={{ padding: 24, background: bg, minHeight: "100vh", color: txt }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Domain Overview</h2>
      <p style={{ color: txt2, fontSize: 13, marginBottom: 20 }}>
        Backlink profile — DR score, referring domains, anchor analysis — powered by our own crawler. No API key needed.
      </p>

      {/* Input */}
      <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
        <input
          value={domain}
          onChange={e => setDomain(e.target.value)}
          onKeyDown={e => e.key === "Enter" && analyze()}
          placeholder="Enter domain (e.g. damcodigital.com)"
          style={{
            flex: 1, padding: "10px 14px", borderRadius: 8,
            border: `1px solid ${bdr}`, background: bg2, color: txt, fontSize: 14,
          }}
        />
        <button onClick={() => analyze(false)} disabled={loading || !domain.trim()} style={{
          padding: "10px 22px", borderRadius: 8, border: "none", cursor: "pointer",
          background: loading ? "#555" : B, color: "#fff", fontSize: 14, fontWeight: 600,
          opacity: loading || !domain.trim() ? 0.6 : 1,
        }}>
          {loading ? "Analyzing…" : "Analyze"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: "12px 16px", background: "#DC262611", border: "1px solid #DC262633", borderRadius: 10, color: "#DC2626", marginBottom: 20, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Loading with live progress */}
      {loading && (
        <div style={{ textAlign: "center", padding: 60, color: txt2 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
          <div style={{ fontWeight: 600, color: txt, marginBottom: 12 }}>{status || "Analyzing…"}</div>

          {progress && progress.pagesTotal > 0 && (
            <>
              <div style={{ maxWidth: 440, margin: "0 auto 10px", height: 8, borderRadius: 4, background: bdr, overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${Math.min(100, Math.round((progress.pagesChecked / progress.pagesTotal) * 100))}%`,
                  background: B, borderRadius: 4, transition: "width 0.3s",
                }} />
              </div>
              <div style={{ display: "flex", justifyContent: "center", gap: 24, fontSize: 12, marginBottom: 6 }}>
                <span><strong style={{ color: txt }}>{progress.pagesChecked}</strong> / {progress.pagesTotal} pages crawled</span>
                <span><strong style={{ color: "#059669" }}>{progress.linksFound}</strong> links verified</span>
              </div>
            </>
          )}

          <div style={{ fontSize: 12 }}>Real-time crawl — live progress above</div>
        </div>
      )}

      {/* Results */}
      {data && (
        <>
          {/* Data source notice */}
          <div style={{ padding: "10px 14px", background: data.totalBacklinks > 0 ? "#05966911" : "#D9770611", border: `1px solid ${data.totalBacklinks > 0 ? "#059669" : "#D97706"}33`, borderRadius: 8, marginBottom: 16, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div style={{ fontSize: 12, color: data.totalBacklinks > 0 ? "#059669" : "#D97706", lineHeight: 1.6 }}>
              {data.note}
            </div>
            <button onClick={() => analyze(true)} style={{
              padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer",
              background: B, color: "#fff", fontSize: 11, fontWeight: 700, flexShrink: 0,
            }}>
              ↻ Refresh
            </button>
          </div>

          {/* KPI Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 20 }}>
            {/* DR card */}
            <div style={{ padding: "14px 16px", background: bg2, border: `2px solid ${drColor}33`, borderRadius: 12, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: txt2, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Domain Rating</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: drColor, lineHeight: 1 }}>{data.drScore ?? 0}</div>
              <div style={{ fontSize: 11, color: drColor, fontWeight: 600, marginTop: 4 }}>{data.drLabel}</div>
            </div>
            {[
              { label: "Referring Domains", value: (data.referringDomains || 0).toLocaleString(), color: "#0891B2" },
              { label: "Total Backlinks",   value: (data.totalBacklinks || 0).toLocaleString(),   color: B },
              { label: "Pages Crawled",     value: (data.pagesCrawled || 0).toLocaleString(),     color: "#9333EA" },
              { label: "Last Analyzed",     value: data.lastCrawled ? new Date(data.lastCrawled).toLocaleDateString() : "Just now", color: "#D97706" },
            ].map(k => (
              <div key={k.label} style={{ padding: "14px 16px", background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, textAlign: "center" }}>
                <div style={{ fontSize: 10, color: txt2, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{k.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: k.color, lineHeight: 1 }}>{k.value}</div>
              </div>
            ))}
          </div>

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

          {/* Overview */}
          {tab === "overview" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* DR Gauge */}
              <div style={{ padding: 20, background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, textAlign: "center" }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Domain Rating</div>
                <div style={{
                  width: 100, height: 100, borderRadius: "50%",
                  border: `6px solid ${drColor}`, background: drColor + "22",
                  margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: drColor }}>{data.drScore ?? 0}</div>
                    <div style={{ fontSize: 10, color: txt2 }}>/ 100</div>
                  </div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: drColor }}>{data.drLabel}</div>
                <div style={{ fontSize: 11, color: txt2, marginTop: 4 }}>PageRank-style calculation</div>
              </div>

              {/* Link Profile */}
              <div style={{ padding: 20, background: bg2, border: `1px solid ${bdr}`, borderRadius: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Link Profile</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {[
                    { label: "Referring Domains", value: data.referringDomains || 0, color: "#0891B2" },
                    { label: "Total Backlinks",   value: data.totalBacklinks || 0,   color: B },
                  ].map(s => (
                    <div key={s.label} style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 13, color: txt2 }}>{s.label}</span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: s.color }}>{s.value.toLocaleString()}</span>
                    </div>
                  ))}
                  <div style={{ borderTop: `1px solid ${bdr}`, paddingTop: 10, fontSize: 12, color: txt2 }}>
                    Ratio: {data.referringDomains > 0
                      ? (data.totalBacklinks / data.referringDomains).toFixed(1)
                      : "—"} links / domain
                  </div>
                </div>
              </div>

              {/* How it works */}
              <div style={{ padding: 16, background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, gridColumn: "1 / -1" }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>How backlinks are discovered</div>
                <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                  {[
                    { step: "1", label: "SERP search", desc: `Search DDG/Bing for pages mentioning "${data.domain}"` },
                    { step: "2", label: "Page crawl",  desc: "Crawl each found URL and extract all links" },
                    { step: "3", label: "Verify",      desc: "Only record links that actually point to this domain" },
                    { step: "4", label: "DR calc",     desc: "PageRank-style score from referring domain graph" },
                  ].map(s => (
                    <div key={s.step} style={{ display: "flex", gap: 8, alignItems: "flex-start", flex: "1 1 200px" }}>
                      <div style={{ width: 22, height: 22, borderRadius: "50%", background: `${B}22`, color: B, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{s.step}</div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700 }}>{s.label}</div>
                        <div style={{ fontSize: 11, color: txt2 }}>{s.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Referring Domains */}
          {tab === "referring" && (
            data.referringDomainsData?.length > 0 ? (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${bdr}` }}>
                    {["Referring Domain", "Links Found", "Sample Anchors"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "8px 10px", color: txt2, fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.referringDomainsData.map((d, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${bdr}22` }}>
                      <td style={{ padding: "10px 10px", color: B, fontWeight: 500 }}>{d.domain}</td>
                      <td style={{ padding: "10px 10px" }}>{d.linkCount || d.links?.length || 1}</td>
                      <td style={{ padding: "10px 10px", color: txt2, fontSize: 12 }}>
                        {(d.anchors || d.anchorTexts || []).slice(0, 3).join(", ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ textAlign: "center", padding: 40, color: txt2, fontSize: 13 }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>🔍</div>
                No referring domains verified yet for this domain.
                <div style={{ marginTop: 8, fontSize: 12 }}>Click ↻ Refresh to run a fresh discovery scan.</div>
              </div>
            )
          )}

          {/* Anchors */}
          {tab === "anchors" && (
            data.topAnchors?.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {data.topAnchors.map((a, i) => {
                  const maxCount = data.topAnchors[0]?.count || 1;
                  return (
                    <div key={i} style={{ padding: "10px 16px", background: bg2, border: `1px solid ${bdr}`, borderRadius: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                        <div style={{ width: 22, height: 22, borderRadius: "50%", background: `${B}22`, color: B, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                        <div style={{ flex: 1, fontWeight: 600 }}>{a.text || "(no text)"}</div>
                        <div style={{ fontSize: 12, color: txt2 }}>{a.count} links</div>
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
                No anchor text data yet. Run a refresh scan to discover more backlinks.
              </div>
            )
          )}

          <div style={{ marginTop: 16, fontSize: 11, color: txt2, textAlign: "right" }}>
            Powered by own crawler · {data.domain}
          </div>
        </>
      )}

      {!data && !loading && !error && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: txt2 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔗</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: txt, marginBottom: 8 }}>Analyze any domain's backlink profile</div>
          <div style={{ fontSize: 13, maxWidth: 480, margin: "0 auto" }}>
            Enter a domain to discover referring domains, DR score, and anchor texts using our own crawler — no third-party API key required.
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
