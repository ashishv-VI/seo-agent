import { useState } from "react";

const API = import.meta.env.VITE_API_URL || "https://seo-agent-backend-8m1z.onrender.com";

export default function BacklinkAnalyzer({ dark, getToken }) {
  const [domain, setDomain]       = useState("");
  const [competitor, setComp]     = useState("");
  const [loading, setLoading]     = useState(false);
  const [results, setResults]     = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [error,   setError]       = useState("");

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const txt3 = dark ? "#444"    : "#bbb";

  async function analyze() {
    if (!domain.trim()) return;
    setLoading(true); setResults(null); setError("");
    try {
      const token = getToken ? await getToken() : null;
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const clean = domain.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");

      // Fetch summary, referring domains, and anchors in parallel
      const [sumRes, domsRes, ancRes, compRes] = await Promise.all([
        fetch(`${API}/api/backlinks/summary`,           { method:"POST", headers, body: JSON.stringify({ domain: clean }) }),
        fetch(`${API}/api/backlinks/referring-domains`, { method:"POST", headers, body: JSON.stringify({ domain: clean, limit: 10 }) }),
        fetch(`${API}/api/backlinks/anchors`,           { method:"POST", headers, body: JSON.stringify({ domain: clean, limit: 10 }) }),
        competitor.trim()
          ? fetch(`${API}/api/backlinks/summary`, { method:"POST", headers, body: JSON.stringify({ domain: competitor.trim().replace(/^https?:\/\//i,"").replace(/\/$/,"") }) })
          : Promise.resolve(null),
      ]);

      const sum  = await sumRes.json();
      const doms = domsRes.ok ? await domsRes.json() : { domains: [] };
      const anc  = ancRes.ok  ? await ancRes.json()  : { anchors: [] };
      const comp = compRes ? (compRes.ok ? await compRes.json() : null) : null;

      if (sum.error) { setError(sum.error); setLoading(false); return; }

      const s = sum.summary || sum;
      setResults({
        domain: clean,
        competitor: competitor.trim(),
        // Real data from DataForSEO
        domainRank:   s.domainRank   || 0,
        backlinks:    s.backlinks    || 0,
        refDomains:   s.referringDomains || 0,
        followLinks:  s.followLinks  || 0,
        nofollowLinks:s.nofollowLinks|| 0,
        dofollowPct:  s.backlinks ? Math.round((s.followLinks / s.backlinks) * 100) : 0,
        spamScore:    s.spamScore    || 0,
        // Referring domains table
        topDomains: doms.domains || [],
        // Anchor text
        anchors: anc.anchors || [],
        // Competitor
        comp: comp ? (comp.summary || comp) : null,
      });
      setActiveTab("overview");
    } catch (e) {
      setError(e.message || "Failed to fetch backlink data");
    }
    setLoading(false);
  }

  const rankColor  = r => r >= 60 ? "#059669" : r >= 30 ? "#D97706" : "#DC2626";
  const spamColor  = s => s <= 10 ? "#059669" : s <= 30 ? "#D97706" : "#DC2626";
  const fmtNum     = n => n >= 1000000 ? `${(n/1000000).toFixed(1)}M` : n >= 1000 ? `${(n/1000).toFixed(0)}K` : String(n||0);

  const tabStyle = (a, color = "#443DCB") => ({
    padding: "6px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer",
    fontWeight: a ? 600 : 400, background: a ? color + "22" : "transparent",
    color: a ? color : txt2, border: `1px solid ${a ? color + "44" : bdr}`, whiteSpace: "nowrap",
  });

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 24, background: bg }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: txt, marginBottom: 4 }}>🔗 Backlink Analyzer</div>
        <div style={{ fontSize: 13, color: txt2, marginBottom: 20 }}>
          Real data via DataForSEO · Domain Rank · Referring Domains · Anchor Text · Spam Score
        </div>

        {/* Input */}
        <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 12, color: txt2, marginBottom: 6, fontWeight: 600 }}>Your Domain <span style={{ color: "#DC2626" }}>*</span></div>
              <input value={domain} onChange={e => setDomain(e.target.value)}
                onKeyDown={e => e.key === "Enter" && analyze()}
                placeholder="yoursite.com"
                style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${bdr}`, background: bg3, color: txt, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: txt2, marginBottom: 6, fontWeight: 600 }}>Competitor Domain</div>
              <input value={competitor} onChange={e => setComp(e.target.value)}
                placeholder="competitor.com (optional)"
                style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${bdr}`, background: bg3, color: txt, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>
          <button onClick={analyze} disabled={loading || !domain.trim()}
            style={{ width: "100%", padding: "11px", borderRadius: 10, border: "none", background: loading || !domain.trim() ? "#888" : "#1E40AF", color: "#fff", fontWeight: 700, fontSize: 14, cursor: loading || !domain.trim() ? "not-allowed" : "pointer" }}>
            {loading ? "⏳ Fetching real backlink data…" : "🔗 Analyze Backlink Profile"}
          </button>
          {error && <div style={{ marginTop: 10, fontSize: 12, color: "#DC2626", background: "#DC262611", borderRadius: 8, padding: "8px 12px" }}>{error}</div>}
          <div style={{ fontSize: 11, color: txt3, marginTop: 8, textAlign: "center" }}>
            Powered by DataForSEO — requires a DataForSEO key in Settings
          </div>
        </div>

        {results && (
          <>
            {/* KPI Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 12, marginBottom: 16 }}>
              {[
                { label: "Domain Rank",       value: results.domainRank,              color: rankColor(results.domainRank) },
                { label: "Total Backlinks",   value: fmtNum(results.backlinks),        color: "#443DCB" },
                { label: "Referring Domains", value: fmtNum(results.refDomains),       color: "#0891B2" },
                { label: "Follow Links",      value: fmtNum(results.followLinks),      color: "#059669" },
                { label: "Spam Score",        value: `${results.spamScore}%`,          color: spamColor(results.spamScore) },
              ].map(s => (
                <div key={s.label} style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16, textAlign: "center", borderTop: `3px solid ${s.color}` }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value ?? "—"}</div>
                  <div style={{ fontSize: 11, color: txt2, marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* DoFollow bar */}
            <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 8 }}>
                <span style={{ color: "#059669", fontWeight: 600 }}>Follow {results.dofollowPct}%</span>
                <span style={{ color: txt2 }}>{fmtNum(results.backlinks)} total backlinks from {fmtNum(results.refDomains)} domains</span>
                <span style={{ color: "#D97706", fontWeight: 600 }}>NoFollow {100 - results.dofollowPct}%</span>
              </div>
              <div style={{ height: 10, borderRadius: 5, background: bg3, overflow: "hidden" }}>
                <div style={{ height: "100%", display: "flex" }}>
                  <div style={{ width: `${results.dofollowPct}%`, background: "#059669" }} />
                  <div style={{ flex: 1, background: "#D97706" }} />
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              {[
                { id: "overview", label: "📊 Overview" },
                { id: "domains",  label: "🔗 Ref. Domains" },
                { id: "anchors",  label: "⚓ Anchors" },
              ].map(t => (
                <div key={t.id} style={tabStyle(activeTab === t.id)} onClick={() => setActiveTab(t.id)}>{t.label}</div>
              ))}
            </div>

            {/* Overview */}
            {activeTab === "overview" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Spam warning */}
                {results.spamScore > 30 && (
                  <div style={{ background: "#DC262611", border: "1px solid #DC262633", borderRadius: 10, padding: "12px 16px" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#DC2626", marginBottom: 4 }}>⚠️ High Spam Score: {results.spamScore}%</div>
                    <div style={{ fontSize: 12, color: txt }}>Your backlink profile has a high spam score. Disavow toxic links via Google Search Console and focus on acquiring links from authoritative, relevant sites.</div>
                  </div>
                )}
                {/* Competitor comparison */}
                {results.comp && (
                  <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: txt, marginBottom: 12 }}>⚔️ vs {results.competitor}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      {[
                        { l: "Domain Rank",   you: results.domainRank, them: results.comp.domainRank },
                        { l: "Backlinks",     you: fmtNum(results.backlinks), them: fmtNum(results.comp.backlinks) },
                        { l: "Ref. Domains",  you: fmtNum(results.refDomains), them: fmtNum(results.comp.referringDomains) },
                        { l: "Spam Score",    you: `${results.spamScore}%`, them: `${results.comp.spamScore}%` },
                      ].map(row => (
                        <div key={row.l} style={{ background: bg3, borderRadius: 8, padding: "10px 14px" }}>
                          <div style={{ fontSize: 10, color: txt2, fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>{row.l}</div>
                          <div style={{ display: "flex", gap: 12 }}>
                            <div style={{ textAlign: "center" }}>
                              <div style={{ fontSize: 16, fontWeight: 800, color: "#443DCB" }}>{row.you ?? "—"}</div>
                              <div style={{ fontSize: 9, color: txt2 }}>You</div>
                            </div>
                            <div style={{ textAlign: "center" }}>
                              <div style={{ fontSize: 16, fontWeight: 800, color: "#DC2626" }}>{row.them ?? "—"}</div>
                              <div style={{ fontSize: 9, color: txt2 }}>Competitor</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: txt, marginBottom: 8 }}>📈 Link Building Next Steps</div>
                  {[
                    "Get links from relevant industry directories and associations",
                    "Create link-worthy content (original research, tools, guides)",
                    "Find broken links on competitor-linking pages and offer replacements",
                    "Reclaim unlinked brand mentions using Google Alerts",
                    "Guest post on sites that already link to your competitors",
                  ].map((step, i) => (
                    <div key={i} style={{ fontSize: 12, color: txt, padding: "5px 0", borderBottom: `1px solid ${bdr}`, display: "flex", gap: 8 }}>
                      <span style={{ color: "#443DCB", fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>{step}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Referring Domains */}
            {activeTab === "domains" && (
              <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "10px 16px", background: bg3, borderBottom: `1px solid ${bdr}`, fontSize: 12, fontWeight: 600, color: txt }}>
                  Top Referring Domains ({results.topDomains.length} shown)
                </div>
                {results.topDomains.length === 0 ? (
                  <div style={{ padding: 24, textAlign: "center", color: txt2, fontSize: 12 }}>No referring domain data — add DataForSEO key in Settings</div>
                ) : results.topDomains.map((d, i) => (
                  <div key={i} style={{ padding: "10px 16px", borderBottom: `1px solid ${bdr}22`, display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 11, color: txt2, width: 22 }}>{i + 1}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: txt }}>{d.domain}</div>
                      {d.country && <div style={{ fontSize: 10, color: txt2 }}>{d.country}</div>}
                    </div>
                    <span style={{ fontSize: 11, color: "#443DCB", fontWeight: 700 }}>Rank {d.domainRank ?? "—"}</span>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: d.dofollow ? "#05966922" : "#88888822", color: d.dofollow ? "#059669" : txt2 }}>{d.dofollow ? "follow" : "nofollow"}</span>
                    <span style={{ fontSize: 10, color: txt2 }}>{fmtNum(d.backlinksCount)} links</span>
                  </div>
                ))}
              </div>
            )}

            {/* Anchors */}
            {activeTab === "anchors" && (
              <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "10px 16px", background: bg3, borderBottom: `1px solid ${bdr}`, fontSize: 12, fontWeight: 600, color: txt }}>
                  Anchor Text Distribution ({results.anchors.length} anchors)
                </div>
                {results.anchors.length === 0 ? (
                  <div style={{ padding: 24, textAlign: "center", color: txt2, fontSize: 12 }}>No anchor data available</div>
                ) : results.anchors.map((a, i) => {
                  const maxBL = results.anchors[0]?.backlinksCount || 1;
                  const pct   = Math.round((a.backlinksCount / maxBL) * 100);
                  return (
                    <div key={i} style={{ padding: "10px 16px", borderBottom: `1px solid ${bdr}22` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                        <span style={{ fontSize: 12, color: txt, fontWeight: 500 }}>{a.anchor || "(empty)"}</span>
                        <span style={{ fontSize: 11, color: "#443DCB", fontWeight: 700 }}>{fmtNum(a.backlinksCount)} links</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 2, background: bg3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: "#443DCB", borderRadius: 2 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {!results && !loading && (
          <div style={{ textAlign: "center", padding: 60, color: txt3 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
            <div style={{ fontSize: 16, color: txt, fontWeight: 600, marginBottom: 8 }}>Real Backlink Analysis</div>
            <div style={{ fontSize: 13, color: txt2 }}>Live data from DataForSEO — Domain Rank, referring domains, anchor text, spam score</div>
          </div>
        )}
      </div>
    </div>
  );
}