import { useState } from "react";

export default function Compare({ dark, googleKey }) {
  const [site1, setSite1] = useState("");
  const [site2, setSite2] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData]   = useState(null);
  const [error, setError] = useState("");

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const txt3 = dark ? "#444"    : "#bbb";

  async function fetchSite(url) {
    const fullUrl = url.startsWith("http") ? url : `https://${url}`;
    const [mob, desk] = await Promise.all([
      fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(fullUrl)}&key=${googleKey}&strategy=mobile`).then(r=>r.json()),
      fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(fullUrl)}&key=${googleKey}&strategy=desktop`).then(r=>r.json()),
    ]);
    const score = (d,k) => Math.round((d.lighthouseResult?.categories?.[k]?.score||0)*100);
    const val   = (d,k) => d.lighthouseResult?.audits?.[k]?.displayValue || "N/A";
    return {
      url: fullUrl,
      mobile:  { perf:score(mob,"performance"), seo:score(mob,"seo"), acc:score(mob,"accessibility"), bp:score(mob,"best-practices") },
      desktop: { perf:score(desk,"performance"), seo:score(desk,"seo"), acc:score(desk,"accessibility"), bp:score(desk,"best-practices") },
      cwv: { lcp:val(mob,"largest-contentful-paint"), tbt:val(mob,"total-blocking-time"), cls:val(mob,"cumulative-layout-shift"), fcp:val(mob,"first-contentful-paint") },
      overall: Math.round((score(mob,"performance")+score(mob,"seo")+score(mob,"accessibility")+score(mob,"best-practices"))/4),
    };
  }

  async function compare() {
    if (!site1.trim() || !site2.trim()) return;
    if (!googleKey) { setError("Google API Key needed in Settings!"); return; }
    setLoading(true); setError(""); setData(null);
    try {
      const [d1, d2] = await Promise.all([fetchSite(site1), fetchSite(site2)]);
      setData({ s1:d1, s2:d2 });
    } catch(e) { setError("Error: "+e.message); }
    setLoading(false);
  }

  const winner = (v1, v2) => v1 > v2 ? "s1" : v2 > v1 ? "s2" : "tie";
  const gradeColor = s => s>=90?"#059669":s>=50?"#D97706":"#DC2626";

  const MetricRow = ({ label, v1, v2, higherBetter=true }) => {
    const w = higherBetter ? winner(v1,v2) : winner(v2,v1);
    return (
      <div style={{ display:"grid", gridTemplateColumns:"1fr auto 1fr", gap:8, padding:"10px 0", borderBottom:`1px solid ${bdr}33`, alignItems:"center" }}>
        <div style={{ textAlign:"right" }}>
          <span style={{ fontSize:14, fontWeight:700, color: w==="s1"?"#059669":gradeColor(v1) }}>{v1}</span>
          {w==="s1" && <span style={{ fontSize:10, color:"#059669", marginLeft:4 }}>✅</span>}
        </div>
        <div style={{ fontSize:11, color:txt2, textAlign:"center", minWidth:100 }}>{label}</div>
        <div style={{ textAlign:"left" }}>
          {w==="s2" && <span style={{ fontSize:10, color:"#059669", marginRight:4 }}>✅</span>}
          <span style={{ fontSize:14, fontWeight:700, color: w==="s2"?"#059669":gradeColor(v2) }}>{v2}</span>
        </div>
      </div>
    );
  };

  const CWVRow = ({ label, v1, v2 }) => (
    <div style={{ display:"grid", gridTemplateColumns:"1fr auto 1fr", gap:8, padding:"8px 0", borderBottom:`1px solid ${bdr}33`, alignItems:"center" }}>
      <div style={{ textAlign:"right", fontSize:13, color:txt }}>{v1}</div>
      <div style={{ fontSize:11, color:txt2, textAlign:"center", minWidth:100 }}>{label}</div>
      <div style={{ textAlign:"left", fontSize:13, color:txt }}>{v2}</div>
    </div>
  );

  return (
    <div style={{ flex:1, overflowY:"auto", padding:24, background:bg }}>
      <div style={{ maxWidth:900, margin:"0 auto" }}>
        <div style={{ fontSize:18, fontWeight:700, color:txt, marginBottom:4 }}>⚔️ Site Comparison</div>
        <div style={{ fontSize:13, color:txt2, marginBottom:20 }}>Compare two sites head-to-head — performance, SEO, accessibility</div>

        {/* Input */}
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:"16px 20px", marginBottom:20 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr auto 1fr", gap:12, alignItems:"end" }}>
            <div>
              <div style={{ fontSize:11, color:txt2, marginBottom:6 }}>Site 1 (Your site)</div>
              <input value={site1} onChange={e=>setSite1(e.target.value)} onKeyDown={e=>e.key==="Enter"&&compare()}
                placeholder="https://yoursite.com" style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", boxSizing:"border-box" }} />
            </div>
            <div style={{ textAlign:"center", fontSize:18, color:txt3, paddingBottom:4 }}>vs</div>
            <div>
              <div style={{ fontSize:11, color:txt2, marginBottom:6 }}>Site 2 (Competitor)</div>
              <input value={site2} onChange={e=>setSite2(e.target.value)} onKeyDown={e=>e.key==="Enter"&&compare()}
                placeholder="https://competitor.com" style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", boxSizing:"border-box" }} />
            </div>
          </div>
          <div style={{ marginTop:12, display:"flex", justifyContent:"center" }}>
            <button onClick={compare} disabled={loading||!site1.trim()||!site2.trim()}
              style={{ padding:"10px 32px", borderRadius:10, border:"none", background:loading||!site1.trim()||!site2.trim()?"#333":"#7C3AED", color:loading||!site1.trim()||!site2.trim()?txt3:"#fff", fontWeight:600, fontSize:13, cursor:loading||!site1.trim()||!site2.trim()?"not-allowed":"pointer" }}>
              {loading?"Comparing...":"⚔️ Compare Now"}
            </button>
          </div>
          {error && <div style={{ fontSize:12, color:"#DC2626", marginTop:8, padding:"8px 12px", background:"#DC262611", borderRadius:8, textAlign:"center" }}>{error}</div>}
        </div>

        {data && (
          <>
            {/* Winner Banner */}
            {data.s1.overall !== data.s2.overall && (
              <div style={{ background: data.s1.overall>data.s2.overall?"#05966911":"#DC262611", border:`1px solid ${data.s1.overall>data.s2.overall?"#05966933":"#DC262633"}`, borderRadius:12, padding:"12px 20px", marginBottom:16, textAlign:"center" }}>
                <span style={{ fontSize:14, fontWeight:700, color: data.s1.overall>data.s2.overall?"#059669":"#DC2626" }}>
                  {data.s1.overall>data.s2.overall ? `✅ Your site wins! (${data.s1.overall} vs ${data.s2.overall})` : `⚠️ Competitor leads (${data.s2.overall} vs ${data.s1.overall}) — improvements needed!`}
                </span>
              </div>
            )}

            {/* Site Headers */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr auto 1fr", gap:8, marginBottom:16 }}>
              <div style={{ background:bg2, border:`1px solid #7C3AED33`, borderRadius:10, padding:"12px 16px", textAlign:"center" }}>
                <div style={{ fontSize:10, color:txt2, marginBottom:4 }}>YOUR SITE</div>
                <div style={{ fontSize:11, color:"#A78BFA", fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{data.s1.url.replace(/^https?:\/\//,"")}</div>
                <div style={{ fontSize:22, fontWeight:800, color:gradeColor(data.s1.overall), marginTop:6 }}>{data.s1.overall}</div>
              </div>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, color:txt3 }}>⚔️</div>
              <div style={{ background:bg2, border:`1px solid #DC262633`, borderRadius:10, padding:"12px 16px", textAlign:"center" }}>
                <div style={{ fontSize:10, color:txt2, marginBottom:4 }}>COMPETITOR</div>
                <div style={{ fontSize:11, color:"#FCA5A5", fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{data.s2.url.replace(/^https?:\/\//,"")}</div>
                <div style={{ fontSize:22, fontWeight:800, color:gradeColor(data.s2.overall), marginTop:6 }}>{data.s2.overall}</div>
              </div>
            </div>

            {/* Mobile Comparison */}
            <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color:txt, marginBottom:14 }}>📱 Mobile Scores</div>
              <MetricRow label="Performance" v1={data.s1.mobile.perf} v2={data.s2.mobile.perf} />
              <MetricRow label="SEO" v1={data.s1.mobile.seo} v2={data.s2.mobile.seo} />
              <MetricRow label="Accessibility" v1={data.s1.mobile.acc} v2={data.s2.mobile.acc} />
              <MetricRow label="Best Practices" v1={data.s1.mobile.bp} v2={data.s2.mobile.bp} />
            </div>

            {/* Desktop Comparison */}
            <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color:txt, marginBottom:14 }}>🖥️ Desktop Scores</div>
              <MetricRow label="Performance" v1={data.s1.desktop.perf} v2={data.s2.desktop.perf} />
              <MetricRow label="SEO" v1={data.s1.desktop.seo} v2={data.s2.desktop.seo} />
              <MetricRow label="Accessibility" v1={data.s1.desktop.acc} v2={data.s2.desktop.acc} />
              <MetricRow label="Best Practices" v1={data.s1.desktop.bp} v2={data.s2.desktop.bp} />
            </div>

            {/* Core Web Vitals */}
            <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color:txt, marginBottom:14 }}>📊 Core Web Vitals</div>
              <CWVRow label="LCP (target <2.5s)" v1={data.s1.cwv.lcp} v2={data.s2.cwv.lcp} />
              <CWVRow label="TBT (target <100ms)" v1={data.s1.cwv.tbt} v2={data.s2.cwv.tbt} />
              <CWVRow label="CLS (target <0.1)" v1={data.s1.cwv.cls} v2={data.s2.cwv.cls} />
              <CWVRow label="FCP" v1={data.s1.cwv.fcp} v2={data.s2.cwv.fcp} />
            </div>

            {/* Summary */}
            <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20 }}>
              <div style={{ fontSize:13, fontWeight:600, color:txt, marginBottom:12 }}>📋 Summary</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                {[
                  { site: data.s1, label:"Your Site", color:"#7C3AED" },
                  { site: data.s2, label:"Competitor", color:"#DC2626" },
                ].map(({ site, label, color }) => {
                  const scores = [site.mobile.perf, site.mobile.seo, site.mobile.acc, site.mobile.bp];
                  const good = scores.filter(s=>s>=90).length;
                  const warn = scores.filter(s=>s>=50&&s<90).length;
                  const bad  = scores.filter(s=>s<50).length;
                  return (
                    <div key={label} style={{ background:bg3, borderRadius:10, padding:14 }}>
                      <div style={{ fontSize:12, fontWeight:600, color, marginBottom:10 }}>{label}</div>
                      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", fontSize:12 }}>
                          <span style={{ color:txt2 }}>Overall Score</span>
                          <span style={{ fontWeight:700, color:gradeColor(site.overall) }}>{site.overall}/100</span>
                        </div>
                        <div style={{ display:"flex", justifyContent:"space-between", fontSize:12 }}>
                          <span style={{ color:txt2 }}>Good (≥90)</span>
                          <span style={{ color:"#059669", fontWeight:600 }}>{good}/4</span>
                        </div>
                        <div style={{ display:"flex", justifyContent:"space-between", fontSize:12 }}>
                          <span style={{ color:txt2 }}>Needs Work</span>
                          <span style={{ color:"#D97706", fontWeight:600 }}>{warn}/4</span>
                        </div>
                        <div style={{ display:"flex", justifyContent:"space-between", fontSize:12 }}>
                          <span style={{ color:txt2 }}>Poor (&lt;50)</span>
                          <span style={{ color:"#DC2626", fontWeight:600 }}>{bad}/4</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {!data && !loading && (
          <div style={{ textAlign:"center", padding:60, color:txt3 }}>
            <div style={{ fontSize:40, marginBottom:12 }}>⚔️</div>
            <div style={{ fontSize:15, color:txt2 }}>Enter two URLs above to compare them</div>
            <div style={{ fontSize:12, color:txt3, marginTop:8 }}>Performance · SEO · Accessibility · Core Web Vitals</div>
          </div>
        )}
      </div>
    </div>
  );
}