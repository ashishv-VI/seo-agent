import { useState } from "react";

const B    = "#443DCB";
const BG   = "#0a0a0a";
const BG2  = "#111";
const BG3  = "#1a1a1a";
const BDR  = "#222";
const TXT  = "#e8e8e8";
const TXT2 = "#888";

/**
 * A21 — Pre-Sales Audit Page
 * Public-facing: no login required.
 * Sales teams use this during demos to instantly audit a prospect's site.
 */
export default function PreSalesAudit({ API }) {
  const [url,     setUrl]     = useState("");
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState(null);
  const [error,   setError]   = useState("");

  async function runAudit(e) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const apiBase = API || (typeof window !== "undefined" ? window.__API_URL__ : "");
      const res  = await fetch(`${apiBase}/api/presales/audit?url=${encodeURIComponent(url.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Audit failed");
      setResult(data);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  const gradeColor = g => ({ "B+":"#059669", "C":"#D97706", "D":"#DC2626", "F":"#DC2626" }[g] || "#D97706");
  const sevColor   = s => ({ critical:"#DC2626", warning:"#D97706", info:"#6B7280" }[s] || "#6B7280");

  return (
    <div style={{ minHeight:"100vh", background:BG, color:TXT, fontFamily:"system-ui,sans-serif", padding:"0 0 60px" }}>

      {/* Hero */}
      <div style={{ background:`linear-gradient(135deg, ${B}22, #059669 11)`, borderBottom:`1px solid ${BDR}`, padding:"48px 24px 40px", textAlign:"center" }}>
        <div style={{ fontSize:13, fontWeight:700, color:B, textTransform:"uppercase", letterSpacing:2, marginBottom:12 }}>
          DAMCO DIGITAL — AI SEO PLATFORM
        </div>
        <h1 style={{ fontSize:32, fontWeight:900, color:TXT, margin:"0 0 10px", lineHeight:1.2 }}>
          Free 60-Second SEO Audit
        </h1>
        <p style={{ fontSize:15, color:TXT2, margin:"0 0 32px", maxWidth:480, marginLeft:"auto", marginRight:"auto" }}>
          Enter any website URL. Get instant SEO issues, score estimate, and quick wins — no login required.
        </p>

        <form onSubmit={runAudit} style={{ display:"flex", gap:10, maxWidth:560, margin:"0 auto", flexWrap:"wrap", justifyContent:"center" }}>
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://yourwebsite.com"
            style={{ flex:"1 1 280px", padding:"14px 18px", borderRadius:10, border:`1px solid ${BDR}`, background:BG2, color:TXT, fontSize:15, outline:"none", fontFamily:"inherit" }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{ padding:"14px 28px", borderRadius:10, border:"none", background:loading?"#333":B, color:"#fff", fontWeight:700, fontSize:15, cursor:loading?"not-allowed":"pointer", whiteSpace:"nowrap" }}>
            {loading ? "Auditing..." : "🚀 Run Audit"}
          </button>
        </form>

        {error && (
          <div style={{ marginTop:16, color:"#DC2626", fontSize:13 }}>{error}</div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign:"center", padding:60, color:TXT2 }}>
          <div style={{ fontSize:40, marginBottom:16 }}>🔍</div>
          <div style={{ fontSize:15, fontWeight:600, color:TXT, marginBottom:8 }}>Analysing {url}...</div>
          <div style={{ fontSize:13 }}>Checking SSL, robots.txt, sitemap, title tags, H1, meta, schema...</div>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div style={{ maxWidth:760, margin:"32px auto", padding:"0 20px" }}>

          {/* Score banner */}
          <div style={{ background:BG2, border:`1px solid ${BDR}`, borderRadius:16, padding:28, marginBottom:20, display:"flex", alignItems:"center", gap:24, flexWrap:"wrap" }}>
            <div style={{ textAlign:"center", flexShrink:0 }}>
              <div style={{ fontSize:56, fontWeight:900, color:gradeColor(result.grade), lineHeight:1 }}>{result.grade}</div>
              <div style={{ fontSize:11, color:TXT2, marginTop:4 }}>SEO Grade</div>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:18, fontWeight:700, color:TXT, marginBottom:6 }}>
                {result.url?.replace(/^https?:\/\//, "")}
              </div>
              <div style={{ fontSize:14, color:TXT2, marginBottom:12, lineHeight:1.5 }}>
                {result.hook}
              </div>
              <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
                {[
                  { l:"Est. Score",      v:`${result.estimatedScore}/100`, c: result.estimatedScore>=70?"#059669":result.estimatedScore>=50?"#D97706":"#DC2626" },
                  { l:"Total Issues",   v: result.totalIssues,    c:"#D97706" },
                  { l:"Critical",       v: result.criticalIssues, c:"#DC2626" },
                  { l:"Audit Time",     v:`${(result.auditTimeMs/1000).toFixed(1)}s`, c:B },
                ].map(s => (
                  <div key={s.l} style={{ background:BG3, borderRadius:8, padding:"8px 14px", textAlign:"center" }}>
                    <div style={{ fontSize:18, fontWeight:800, color:s.c }}>{s.v}</div>
                    <div style={{ fontSize:10, color:TXT2, marginTop:2 }}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top 3 issues — the hook */}
          {result.top3Issues?.length > 0 && (
            <div style={{ background:BG2, border:`1px solid ${BDR}`, borderRadius:14, padding:20, marginBottom:20 }}>
              <div style={{ fontSize:12, fontWeight:700, color:TXT2, textTransform:"uppercase", letterSpacing:1, marginBottom:14 }}>
                🚨 Top Issues Found
              </div>
              {result.top3Issues.map((issue, i) => (
                <div key={i} style={{ display:"flex", gap:12, padding:"12px 0", borderBottom: i < result.top3Issues.length-1 ? `1px solid ${BDR}` : "none" }}>
                  <div style={{ width:28, height:28, borderRadius:8, background:sevColor(issue.severity)+"20", color:sevColor(issue.severity), fontSize:13, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    {i+1}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                      <span style={{ fontSize:13, fontWeight:700, color:TXT }}>{issue.type?.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())}</span>
                      <span style={{ fontSize:10, padding:"2px 6px", borderRadius:5, background:sevColor(issue.severity)+"20", color:sevColor(issue.severity), fontWeight:700, textTransform:"uppercase" }}>
                        {issue.severity}
                      </span>
                    </div>
                    <div style={{ fontSize:12, color:TXT2, marginBottom:4 }}>{issue.detail}</div>
                    {issue.fix && <div style={{ fontSize:12, color:"#059669" }}>✅ Fix: {issue.fix}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* All issues accordion */}
          {result.allIssues?.length > 3 && (
            <AllIssues issues={result.allIssues} />
          )}

          {/* Quick checks grid */}
          <div style={{ background:BG2, border:`1px solid ${BDR}`, borderRadius:14, padding:20, marginBottom:20 }}>
            <div style={{ fontSize:12, fontWeight:700, color:TXT2, textTransform:"uppercase", letterSpacing:1, marginBottom:14 }}>
              ✅ Quick Checks
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:8 }}>
              {Object.entries({
                "HTTPS":          result.checks?.hasSSL,
                "Robots.txt":     result.checks?.hasRobots,
                "Sitemap.xml":    result.checks?.hasSitemap,
                "Title Tag":      !!result.checks?.title,
                "Meta Desc":      !!result.checks?.metaDesc,
                "H1 Tag":         result.checks?.h1Count > 0,
                "Mobile Ready":   result.checks?.mobileReady,
                "Schema Markup":  result.checks?.hasSchema,
                "Canonical Tag":  result.checks?.hasCanonical,
                "Fast Response":  result.checks?.responseTime < 800,
              }).map(([label, pass]) => (
                <div key={label} style={{ display:"flex", alignItems:"center", gap:8, background:BG3, borderRadius:8, padding:"8px 12px" }}>
                  <span style={{ fontSize:14 }}>{pass === undefined ? "⚪" : pass ? "✅" : "❌"}</span>
                  <span style={{ fontSize:12, color: pass === undefined ? TXT2 : pass ? "#059669" : "#DC2626", fontWeight:600 }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div style={{ background:`linear-gradient(135deg, ${B}22, #05966922)`, border:`1px solid ${B}44`, borderRadius:14, padding:24, textAlign:"center" }}>
            <div style={{ fontSize:16, fontWeight:700, color:TXT, marginBottom:8 }}>
              Want the full 50-page audit with AI fix plan?
            </div>
            <div style={{ fontSize:13, color:TXT2, marginBottom:16 }}>
              {result.cta}
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"center", flexWrap:"wrap" }}>
              <a href="/" style={{ padding:"12px 24px", borderRadius:10, background:B, color:"#fff", fontWeight:700, fontSize:14, textDecoration:"none" }}>
                Start Full Audit →
              </a>
              <button onClick={() => { setResult(null); setUrl(""); }}
                style={{ padding:"12px 24px", borderRadius:10, background:"transparent", border:`1px solid ${BDR}`, color:TXT2, fontSize:14, cursor:"pointer", fontWeight:600 }}>
                Audit Another Site
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AllIssues({ issues }) {
  const [open, setOpen] = useState(false);
  const extra = issues.slice(3);
  const sevColor = s => ({ critical:"#DC2626", warning:"#D97706", info:"#6B7280" }[s] || "#6B7280");
  return (
    <div style={{ background:BG2, border:`1px solid ${BDR}`, borderRadius:14, padding:20, marginBottom:20 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer", marginBottom: open?14:0 }} onClick={() => setOpen(o => !o)}>
        <div style={{ fontSize:12, fontWeight:700, color:TXT2, textTransform:"uppercase", letterSpacing:1 }}>
          All Issues ({issues.length})
        </div>
        <span style={{ fontSize:11, color:B }}>{open ? "▲ Hide" : "▼ Show all"}</span>
      </div>
      {open && extra.map((issue, i) => (
        <div key={i} style={{ display:"flex", gap:10, padding:"10px 0", borderBottom:`1px solid ${BDR}` }}>
          <span style={{ fontSize:10, padding:"2px 6px", borderRadius:5, background:sevColor(issue.severity)+"20", color:sevColor(issue.severity), fontWeight:700, textTransform:"uppercase", flexShrink:0, alignSelf:"flex-start", marginTop:2 }}>
            {issue.severity}
          </span>
          <div>
            <div style={{ fontSize:12, color:TXT, fontWeight:600, marginBottom:2 }}>{issue.type?.replace(/_/g," ")}</div>
            <div style={{ fontSize:11, color:TXT2 }}>{issue.detail}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
