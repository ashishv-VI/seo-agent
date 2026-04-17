import { useState } from "react";
import { API_BASE } from "./utils/apiBase";

const API = API_BASE;

export default function KeywordResearch({ dark, getToken }) {
  const [keyword, setKeyword] = useState("");
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

  async function research() {
    const kw = keyword.trim();
    if (!kw) return;
    setLoading(true); setData(null); setError(""); setTab("overview");
    try {
      const token = getToken ? await getToken() : null;
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res  = await fetch(`${API}/api/crawler/keyword-research`, {
        method: "POST", headers,
        body: JSON.stringify({ keyword: kw, includeRelated: true }),
      });
      const json = await res.json();
      if (json.error) { setError(json.error); } else { setData(json); }
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  const kdColor = data?.keywordDifficulty?.color || "#888";

  const TABS = ["overview", "serp", "related", "paa"];

  return (
    <div style={{ padding: 24, background: bg, minHeight: "100vh", color: txt }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Keyword Research</h2>
      <p style={{ color: txt2, fontSize: 13, marginBottom: 20 }}>
        Volume estimates, difficulty scores, SERP analysis — no paid API needed
      </p>

      {/* Input */}
      <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
        <input
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          onKeyDown={e => e.key === "Enter" && research()}
          placeholder="Enter keyword (e.g. best seo tools)"
          style={{
            flex: 1, padding: "10px 14px", borderRadius: 8,
            border: `1px solid ${bdr}`, background: bg2, color: txt, fontSize: 14,
          }}
        />
        <button
          onClick={research}
          disabled={loading || !keyword.trim()}
          style={{
            padding: "10px 22px", borderRadius: 8, border: "none", cursor: "pointer",
            background: loading ? "#444" : "#443DCB", color: "#fff", fontSize: 14, fontWeight: 600,
          }}
        >
          {loading ? "Analyzing..." : "Research"}
        </button>
      </div>

      {error && (
        <div style={{ padding: 12, background: "#DC262622", border: "1px solid #DC2626", borderRadius: 8, color: "#DC2626", marginBottom: 20, fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{ textAlign: "center", padding: 60, color: txt2 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
          <div>Scraping SERP + estimating volume...</div>
          <div style={{ fontSize: 12, marginTop: 6, color: txt2 }}>This may take 5-10 seconds</div>
        </div>
      )}

      {data && (
        <>
          {/* Metric Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
            <MetricCard dark={dark} label="Keyword Difficulty" value={data.keywordDifficulty.score} sub={data.keywordDifficulty.label} color={kdColor} />
            <MetricCard dark={dark} label="Search Volume" value={data.searchVolume.bucket} sub={`~${data.searchVolume.midpoint?.toLocaleString()} / mo`} color="#059669" />
            <MetricCard dark={dark} label="Confidence" value={data.searchVolume.confidence} sub="volume estimate" color="#D97706" />
            <MetricCard dark={dark} label="SERP Results" value={data.serp.results?.length || 0} sub="top pages" color="#0891B2" />
            <MetricCard dark={dark} label="PAA Questions" value={data.serp.paaQuestions?.length || 0} sub="People Also Ask" color="#9333EA" />
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: `1px solid ${bdr}` }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: "8px 16px", border: "none", cursor: "pointer", fontSize: 13,
                background: "none", color: tab === t ? "#443DCB" : txt2, fontWeight: tab === t ? 700 : 400,
                borderBottom: tab === t ? "2px solid #443DCB" : "2px solid transparent",
                marginBottom: -1,
              }}>
                {t === "overview" ? "Overview" : t === "serp" ? "SERP Top 10" : t === "related" ? "Related" : "PAA"}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {tab === "overview" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* Volume Range */}
              <Card dark={dark} title="Search Volume Range">
                <VolumeBar bucket={data.searchVolume.bucket} color="#059669" />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12, color: txt2 }}>
                  <span>Min: {data.searchVolume.min?.toLocaleString()}</span>
                  <span>Midpoint: ~{data.searchVolume.midpoint?.toLocaleString()}</span>
                  <span>Max: {typeof data.searchVolume.max === "number" ? data.searchVolume.max.toLocaleString() : data.searchVolume.max}</span>
                </div>
              </Card>

              {/* KD Breakdown */}
              <Card dark={dark} title="Difficulty Analysis">
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 56, height: 56, borderRadius: "50%", background: kdColor + "22", border: `3px solid ${kdColor}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: kdColor }}>
                    {data.keywordDifficulty.score}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: kdColor }}>{data.keywordDifficulty.label}</div>
                    <div style={{ fontSize: 12, color: txt2 }}>Based on top-10 SERP authority</div>
                  </div>
                </div>
                {data.keywordDifficulty.topDomains?.length > 0 && (
                  <div style={{ fontSize: 12, color: txt2 }}>
                    <div style={{ marginBottom: 4, fontWeight: 600 }}>Top ranking domains:</div>
                    {data.keywordDifficulty.topDomains.map((d, i) => (
                      <div key={i} style={{ padding: "2px 0" }}>• {d}</div>
                    ))}
                  </div>
                )}
              </Card>

              {/* SERP Features */}
              <Card dark={dark} title="SERP Features">
                {data.serp.features?.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {data.serp.features.map((f, i) => (
                      <span key={i} style={{ padding: "3px 10px", borderRadius: 20, background: "#443DCB22", color: "#443DCB", fontSize: 12 }}>{f}</span>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: txt2, fontSize: 13 }}>No special SERP features detected</div>
                )}
              </Card>

              {/* Autocomplete */}
              <Card dark={dark} title="Autocomplete Suggestions">
                {data.suggestions?.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {data.suggestions.slice(0, 12).map((s, i) => (
                      <span key={i} onClick={() => setKeyword(s)} style={{ padding: "4px 10px", borderRadius: 20, background: bg3, color: txt, fontSize: 12, cursor: "pointer", border: `1px solid ${bdr}` }}>{s}</span>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: txt2, fontSize: 13 }}>No suggestions found</div>
                )}
              </Card>
            </div>
          )}

          {tab === "serp" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.serp.results?.map((r, i) => (
                <div key={i} style={{ padding: "12px 16px", background: bg2, border: `1px solid ${bdr}`, borderRadius: 10 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#443DCB", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                      {i + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "#443DCB", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.title || r.url}
                      </div>
                      <div style={{ fontSize: 11, color: "#059669", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.url}</div>
                      {r.snippet && <div style={{ fontSize: 12, color: txt2, lineHeight: 1.5 }}>{r.snippet}</div>}
                    </div>
                    <div style={{ fontSize: 11, color: txt2, flexShrink: 0 }}>{r.domain}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "related" && (
            <div>
              {/* Related Searches */}
              {data.serp.relatedSearches?.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 14 }}>Related Searches</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {data.serp.relatedSearches.map((s, i) => (
                      <span key={i} onClick={() => setKeyword(s)} style={{ padding: "6px 14px", borderRadius: 20, background: bg3, border: `1px solid ${bdr}`, color: txt, fontSize: 13, cursor: "pointer" }}>{s}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Related Keywords Table */}
              {data.relatedKeywords?.length > 0 && (
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 14 }}>Related Keywords</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${bdr}` }}>
                        <th style={{ textAlign: "left", padding: "8px 10px", color: txt2, fontWeight: 600 }}>Keyword</th>
                        <th style={{ textAlign: "center", padding: "8px 10px", color: txt2, fontWeight: 600 }}>Volume</th>
                        <th style={{ textAlign: "center", padding: "8px 10px", color: txt2, fontWeight: 600 }}>KD Est.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.relatedKeywords.map((kw, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${bdr}22` }}>
                          <td style={{ padding: "8px 10px" }}>
                            <span onClick={() => setKeyword(kw.keyword)} style={{ color: "#443DCB", cursor: "pointer" }}>{kw.keyword}</span>
                          </td>
                          <td style={{ padding: "8px 10px", textAlign: "center", color: txt2 }}>{kw.volumeBucket}</td>
                          <td style={{ padding: "8px 10px", textAlign: "center" }}>
                            <span style={{ padding: "2px 8px", borderRadius: 4, background: "#44444422", color: txt, fontSize: 12 }}>{kw.kdEstimate}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === "paa" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.serp.paaQuestions?.length > 0 ? (
                data.serp.paaQuestions.map((q, i) => (
                  <div key={i} style={{ padding: "12px 16px", background: bg2, border: `1px solid ${bdr}`, borderRadius: 8, display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ color: "#9333EA", fontSize: 16 }}>❓</span>
                    <span onClick={() => setKeyword(q)} style={{ fontSize: 14, cursor: "pointer", color: txt }}>{q}</span>
                  </div>
                ))
              ) : (
                <div style={{ color: txt2, textAlign: "center", padding: 40 }}>No People Also Ask questions found</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MetricCard({ dark, label, value, sub, color }) {
  const bg2 = dark ? "#111" : "#ffffff";
  const bdr = dark ? "#222" : "#e0e0d8";
  const txt2 = dark ? "#666" : "#888";
  return (
    <div style={{ padding: "16px 18px", background: bg2, border: `1px solid ${bdr}`, borderRadius: 12 }}>
      <div style={{ fontSize: 11, color: txt2, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: txt2, marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function Card({ dark, title, children }) {
  const bg2 = dark ? "#111" : "#ffffff";
  const bdr = dark ? "#222" : "#e0e0d8";
  const txt = dark ? "#e8e8e8" : "#1a1a18";
  return (
    <div style={{ padding: 16, background: bg2, border: `1px solid ${bdr}`, borderRadius: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: txt, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

const BUCKETS = ["<10", "10-100", "100-1K", "1K-10K", "10K-100K", "100K-1M", "1M+"];
function VolumeBar({ bucket, color }) {
  const idx = BUCKETS.indexOf(bucket);
  const pct = idx < 0 ? 0 : Math.round(((idx + 1) / BUCKETS.length) * 100);
  return (
    <div>
      <div style={{ height: 8, borderRadius: 4, background: "#333", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4 }} />
      </div>
      <div style={{ textAlign: "center", marginTop: 6, fontWeight: 700, color, fontSize: 16 }}>{bucket || "—"}</div>
    </div>
  );
}
