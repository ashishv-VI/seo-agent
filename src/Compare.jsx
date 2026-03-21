import { useState } from "react";

export default function Compare({ dark, googleKey }) {
  const [site1, setSite1] = useState("");
  const [site2, setSite2] = useState("");
  const [site3, setSite3] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData]       = useState(null);
  const [error, setError]     = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [history, setHistory] = useState([]);

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
    if (mob.error) throw new Error(mob.error.message);
    const score  = (d,k) => Math.round((d.lighthouseResult?.categories?.[k]?.score||0)*100);
    const val    = (d,k) => d.lighthouseResult?.audits?.[k]?.displayValue || "N/A";
    const numVal = (d,k) => d.lighthouseResult?.audits?.[k]?.numericValue || 0;
    const opps   = mob.lighthouseResult?.audits || {};
    const issues = [];
    ["render-blocking-resources","unused-javascript","unused-css-rules","uses-optimized-images","uses-text-compression","dom-size"].forEach(c => {
      if (opps[c] && (opps[c].score||1) < 0.9) issues.push(opps[c].title);
    });
    return {
      url: fullUrl,
      domain: fullUrl.replace(/^https?:\/\//,"").split("/")[0],
      mobile:  { perf:score(mob,"performance"), seo:score(mob,"seo"), acc:score(mob,"accessibility"), bp:score(mob,"best-practices") },
      desktop: { perf:score(desk,"performance"), seo:score(desk,"seo"), acc:score(desk,"accessibility"), bp:score(desk,"best-practices") },
      cwv: {
        lcp:val(mob,"largest-contentful-paint"), lcpNum:numVal(mob,"largest-contentful-paint"),
        tbt:val(mob,"total-blocking-time"),       tbtNum:numVal(mob,"total-blocking-time"),
        cls:val(mob,"cumulative-layout-shift"),   clsNum:numVal(mob,"cumulative-layout-shift"),
        fcp:val(mob,"first-contentful-paint"),    ttfb:val(mob,"server-response-time"),
      },
      issues,
      overall: Math.round((score(mob,"performance")+score(mob,"seo")+score(mob,"accessibility")+score(mob,"best-practices"))/4),
    };
  }

  async function compare() {
    if (!site1.trim() || !site2.trim()) return;
    if (!googleKey) { setError("Google API Key needed in Settings!"); return; }
    setLoading(true); setError(""); setData(null);
    try {
      const sites = [site1, site2, site3.trim() ? site3 : null].filter(Boolean);
      const results = await Promise.all(sites.map(s => fetchSite(s)));
      const newData = { sites: results, timestamp: new Date().toLocaleString() };
      setData(newData);
      setHistory(h => [{ sites: results.map(r=>r.domain), time: new Date().toLocaleTimeString() }, ...h.slice(0,4)]);
      setActiveTab("overview");
    } catch(e) { setError("Error: "+e.message); }
    setLoading(false);
  }

  function exportPDF() {
    if (!data) return;
    const siteColors = ["#7C3AED","#DC2626","#059669"];
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Site Comparison Report</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: 'Segoe UI', Arial, sans-serif; color:#1a1a18; padding:40px; }
h1 { color:#7C3AED; font-size:24px; margin-bottom:4px; }
.sub { color:#888; font-size:14px; margin-bottom:30px; }
.sites { display:grid; grid-template-columns:repeat(${data.sites.length},1fr); gap:16px; margin-bottom:30px; }
.site-card { border-radius:10px; padding:16px; text-align:center; }
.score { font-size:36px; font-weight:800; margin-bottom:4px; }
.domain { font-size:12px; margin-bottom:8px; }
table { width:100%; border-collapse:collapse; margin-bottom:24px; }
th { background:#f0f0ea; padding:10px 12px; text-align:left; font-size:12px; color:#666; text-transform:uppercase; }
td { padding:10px 12px; border-bottom:1px solid #e0e0d8; font-size:13px; }
.good { color:#059669; font-weight:700; } .warn { color:#D97706; font-weight:700; } .bad { color:#DC2626; font-weight:700; }
.footer { margin-top:30px; text-align:center; font-size:11px; color:#888; }
@media print { @page { margin:20px; } }
</style></head><body>
<h1>⚔️ Site Comparison Report</h1>
<p class="sub">Generated: ${data.timestamp}</p>
<div class="sites">
${data.sites.map((s,i) => `<div class="site-card" style="border:2px solid ${siteColors[i]}22;border-top:4px solid ${siteColors[i]}">
<div class="score" style="color:${siteColors[i]}">${s.overall}</div>
<div class="domain" style="color:${siteColors[i]}">${s.domain}</div>
<div style="font-size:11px;color:#888">Overall Score</div>
</div>`).join("")}
</div>
<h2 style="font-size:16px;margin-bottom:12px">📱 Mobile Scores</h2>
<table><thead><tr><th>Metric</th>${data.sites.map((s,i)=>`<th style="color:${siteColors[i]}">${s.domain}</th>`).join("")}</tr></thead>
<tbody>
${["Performance","SEO","Accessibility","Best Practices"].map((label,li) => {
  const keys2 = ["perf","seo","acc","bp"];
  const vals = data.sites.map(s => s.mobile[keys2[li]]);
  const max = Math.max(...vals);
  return `<tr><td>${label}</td>${vals.map(v=>`<td class="${v>=90?"good":v>=50?"warn":"bad"}">${v}/100${v===max?" ✅":""}</td>`).join("")}</tr>`;
}).join("")}
</tbody></table>
<h2 style="font-size:16px;margin-bottom:12px">📊 Core Web Vitals</h2>
<table><thead><tr><th>Metric</th>${data.sites.map((s,i)=>`<th style="color:${siteColors[i]}">${s.domain}</th>`).join("")}</tr></thead>
<tbody>
${[["LCP","lcp"],["TBT","tbt"],["CLS","cls"],["FCP","fcp"]].map(([label,key]) =>
  `<tr><td>${label}</td>${data.sites.map(s=>`<td>${s.cwv[key]}</td>`).join("")}</tr>`
).join("")}
</tbody></table>
<div class="footer">Generated by SEO Agent · ${new Date().toLocaleDateString()}</div>
</body></html>`;
    const win = window.open("","_blank","width=900,height=700");
    win.document.write(html); win.document.close();
    win.onload = () => setTimeout(() => win.print(), 500);
  }

  function exportCSV() {
    if (!data) return;
    const rows = [
      ["Metric", ...data.sites.map(s=>s.domain)],
      ["Overall Score", ...data.sites.map(s=>s.overall)],
      ["Mobile Performance", ...data.sites.map(s=>s.mobile.perf)],
      ["Mobile SEO", ...data.sites.map(s=>s.mobile.seo)],
      ["Mobile Accessibility", ...data.sites.map(s=>s.mobile.acc)],
      ["Mobile Best Practices", ...data.sites.map(s=>s.mobile.bp)],
      ["Desktop Performance", ...data.sites.map(s=>s.desktop.perf)],
      ["Desktop SEO", ...data.sites.map(s=>s.desktop.seo)],
      ["LCP", ...data.sites.map(s=>s.cwv.lcp)],
      ["TBT", ...data.sites.map(s=>s.cwv.tbt)],
      ["CLS", ...data.sites.map(s=>s.cwv.cls)],
      ["FCP", ...data.sites.map(s=>s.cwv.fcp)],
    ];
    const csv = rows.map(r=>r.map(v=>`"${v}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    a.download = "site-comparison.csv"; a.click();
  }

  const gradeColor = s => s>=90?"#059669":s>=50?"#D97706":"#DC2626";
  const SITE_COLORS = ["#7C3AED","#DC2626","#059669"];
  const tabStyle = (a) => ({ padding:"7px 16px", borderRadius:20, fontSize:12, cursor:"pointer", fontWeight:a?600:400, background:a?"#7C3AED22":"transparent", color:a?"#A78BFA":txt2, border:`1px solid ${a?"#7C3AED44":bdr}` });

  const ScoreBar = ({ value, color, max=100 }) => (
    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
      <div style={{ flex:1, height:8, borderRadius:4, background:bg3, overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${(value/max)*100}%`, background:color, borderRadius:4, transition:"width 0.8s" }} />
      </div>
      <span style={{ fontSize:13, fontWeight:700, color, minWidth:32, textAlign:"right" }}>{value}</span>
    </div>
  );

  const winner = (vals, higherBetter=true) => {
    const best = higherBetter ? Math.max(...vals) : Math.min(...vals);
    return vals.map(v => v === best);
  };

  return (
    <div style={{ flex:1, overflowY:"auto", padding:24, background:bg }}>
      <div style={{ maxWidth:920, margin:"0 auto" }}>
        <div style={{ fontSize:18, fontWeight:700, color:txt, marginBottom:4 }}>⚔️ Site Comparison</div>
        <div style={{ fontSize:13, color:txt2, marginBottom:20 }}>Compare up to 3 sites — performance, SEO, Core Web Vitals</div>

        {/* Input */}
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:20 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:12 }}>
            {[
              { val:site1, set:setSite1, label:"Site 1 (Your site)", ph:"https://yoursite.com", color:"#7C3AED" },
              { val:site2, set:setSite2, label:"Site 2 (Competitor)", ph:"https://competitor.com", color:"#DC2626" },
              { val:site3, set:setSite3, label:"Site 3 (Optional)", ph:"https://competitor2.com", color:"#059669" },
            ].map((s,i) => (
              <div key={i}>
                <div style={{ fontSize:11, color:s.color, marginBottom:6, fontWeight:600 }}>{s.label}</div>
                <input value={s.val} onChange={e=>s.set(e.target.value)} onKeyDown={e=>e.key==="Enter"&&compare()}
                  placeholder={s.ph}
                  style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:`1px solid ${i===0?"#7C3AED44":i===1?"#DC262633":bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", boxSizing:"border-box" }} />
              </div>
            ))}
          </div>
          <button onClick={compare} disabled={loading||!site1.trim()||!site2.trim()}
            style={{ width:"100%", padding:"11px", borderRadius:10, border:"none", background:loading||!site1.trim()||!site2.trim()?"#333":"#7C3AED", color:loading||!site1.trim()||!site2.trim()?txt3:"#fff", fontWeight:700, fontSize:14, cursor:loading||!site1.trim()||!site2.trim()?"not-allowed":"pointer" }}>
            {loading ? "⚔️ Comparing sites..." : "⚔️ Compare Now"}
          </button>
          {error && <div style={{ fontSize:12, color:"#DC2626", marginTop:8, padding:"8px 12px", background:"#DC262611", borderRadius:8 }}>{error}</div>}
        </div>

        {data && (
          <>
            {/* Winner Banner */}
            {(() => {
              const best = data.sites.reduce((a,b) => a.overall>b.overall?a:b);
              const isYours = best.domain === data.sites[0].domain;
              return (
                <div style={{ background:isYours?"#05966911":"#D9770611", border:`1px solid ${isYours?"#05966933":"#D9770633"}`, borderRadius:12, padding:"12px 20px", marginBottom:16, textAlign:"center" }}>
                  <span style={{ fontSize:14, fontWeight:700, color:isYours?"#059669":"#D97706" }}>
                    {isYours ? `🏆 Your site wins! ${best.domain} leads with ${best.overall}/100` : `⚠️ ${best.domain} leads with ${best.overall}/100 — improvements needed!`}
                  </span>
                </div>
              );
            })()}

            {/* Site Score Cards */}
            <div style={{ display:"grid", gridTemplateColumns:`repeat(${data.sites.length},1fr)`, gap:12, marginBottom:20 }}>
              {data.sites.map((s,i) => (
                <div key={i} style={{ background:bg2, border:`1px solid ${SITE_COLORS[i]}33`, borderRadius:12, padding:16, textAlign:"center", borderTop:`4px solid ${SITE_COLORS[i]}` }}>
                  <div style={{ fontSize:10, color:SITE_COLORS[i], fontWeight:700, letterSpacing:"0.08em", marginBottom:4 }}>{i===0?"YOUR SITE":i===1?"COMPETITOR":"COMPETITOR 2"}</div>
                  <div style={{ fontSize:11, color:txt2, marginBottom:8, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.domain}</div>
                  <div style={{ fontSize:36, fontWeight:800, color:gradeColor(s.overall), marginBottom:4 }}>{s.overall}</div>
                  <div style={{ fontSize:11, color:txt2 }}>Overall Score</div>
                  <div style={{ display:"flex", justifyContent:"center", gap:6, marginTop:10, flexWrap:"wrap" }}>
                    {s.overall>=90 ? <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:"#05966922", color:"#059669" }}>Excellent</span>
                    : s.overall>=70 ? <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:"#D9770622", color:"#D97706" }}>Good</span>
                    : <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:"#DC262622", color:"#DC2626" }}>Needs Work</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* Export Buttons */}
            <div style={{ display:"flex", gap:8, marginBottom:16, justifyContent:"flex-end" }}>
              <button onClick={exportCSV} style={{ padding:"6px 14px", borderRadius:8, border:"1px solid #059669aa", background:"#05966911", color:"#059669", fontSize:12, cursor:"pointer", fontWeight:600 }}>⬇️ CSV</button>
              <button onClick={exportPDF} style={{ padding:"6px 14px", borderRadius:8, border:"1px solid #7C3AED44", background:"#7C3AED", color:"#fff", fontSize:12, cursor:"pointer", fontWeight:600 }}>📥 PDF Report</button>
            </div>

            {/* Tabs */}
            <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
              {["overview","mobile","desktop","cwv","issues"].map(t => (
                <div key={t} style={tabStyle(activeTab===t)} onClick={()=>setActiveTab(t)}>
                  {t.charAt(0).toUpperCase()+t.slice(1)}
                </div>
              ))}
            </div>

            {/* Overview Tab */}
            {activeTab==="overview" && (
              <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20 }}>
                <div style={{ fontSize:13, fontWeight:600, color:txt, marginBottom:16 }}>Score Comparison</div>
                {[
                  { label:"Mobile Performance", vals: data.sites.map(s=>s.mobile.perf) },
                  { label:"Mobile SEO",          vals: data.sites.map(s=>s.mobile.seo) },
                  { label:"Mobile Accessibility",vals: data.sites.map(s=>s.mobile.acc) },
                  { label:"Mobile Best Practices",vals:data.sites.map(s=>s.mobile.bp) },
                  { label:"Desktop Performance", vals: data.sites.map(s=>s.desktop.perf) },
                  { label:"Desktop SEO",          vals: data.sites.map(s=>s.desktop.seo) },
                ].map((row, ri) => {
                  const wins = winner(row.vals);
                  return (
                    <div key={ri} style={{ marginBottom:14 }}>
                      <div style={{ fontSize:11, color:txt2, marginBottom:6 }}>{row.label}</div>
                      <div style={{ display:"grid", gridTemplateColumns:`repeat(${data.sites.length},1fr)`, gap:8 }}>
                        {row.vals.map((v,vi) => (
                          <div key={vi}>
                            <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:4 }}>
                              <span style={{ color:SITE_COLORS[vi], fontWeight:600 }}>{data.sites[vi].domain.slice(0,15)}</span>
                              {wins[vi] && <span style={{ color:"#059669", fontSize:10 }}>✅ Best</span>}
                            </div>
                            <ScoreBar value={v} color={wins[vi]?"#059669":SITE_COLORS[vi]} />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Mobile Tab */}
            {activeTab==="mobile" && (
              <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20 }}>
                <div style={{ fontSize:13, fontWeight:600, color:txt, marginBottom:16 }}>📱 Mobile Scores</div>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign:"left", padding:"8px 12px", fontSize:11, color:txt2, borderBottom:`1px solid ${bdr}`, background:bg3 }}>Metric</th>
                      {data.sites.map((s,i) => <th key={i} style={{ textAlign:"center", padding:"8px 12px", fontSize:11, color:SITE_COLORS[i], borderBottom:`1px solid ${bdr}`, background:bg3 }}>{s.domain.slice(0,18)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {[["Performance","perf"],["SEO","seo"],["Accessibility","acc"],["Best Practices","bp"]].map(([label,key]) => {
                      const vals = data.sites.map(s=>s.mobile[key]);
                      const wins = winner(vals);
                      return (
                        <tr key={label}>
                          <td style={{ padding:"12px", fontSize:12, color:txt, borderBottom:`1px solid ${bdr}33` }}>{label}</td>
                          {vals.map((v,vi) => (
                            <td key={vi} style={{ padding:"12px", textAlign:"center", borderBottom:`1px solid ${bdr}33` }}>
                              <span style={{ fontSize:14, fontWeight:700, color:wins[vi]?"#059669":gradeColor(v) }}>{v}/100</span>
                              {wins[vi] && <span style={{ marginLeft:4, fontSize:10 }}>✅</span>}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Desktop Tab */}
            {activeTab==="desktop" && (
              <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20 }}>
                <div style={{ fontSize:13, fontWeight:600, color:txt, marginBottom:16 }}>🖥️ Desktop Scores</div>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign:"left", padding:"8px 12px", fontSize:11, color:txt2, borderBottom:`1px solid ${bdr}`, background:bg3 }}>Metric</th>
                      {data.sites.map((s,i) => <th key={i} style={{ textAlign:"center", padding:"8px 12px", fontSize:11, color:SITE_COLORS[i], borderBottom:`1px solid ${bdr}`, background:bg3 }}>{s.domain.slice(0,18)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {[["Performance","perf"],["SEO","seo"],["Accessibility","acc"],["Best Practices","bp"]].map(([label,key]) => {
                      const vals = data.sites.map(s=>s.desktop[key]);
                      const wins = winner(vals);
                      return (
                        <tr key={label}>
                          <td style={{ padding:"12px", fontSize:12, color:txt, borderBottom:`1px solid ${bdr}33` }}>{label}</td>
                          {vals.map((v,vi) => (
                            <td key={vi} style={{ padding:"12px", textAlign:"center", borderBottom:`1px solid ${bdr}33` }}>
                              <span style={{ fontSize:14, fontWeight:700, color:wins[vi]?"#059669":gradeColor(v) }}>{v}/100</span>
                              {wins[vi] && <span style={{ marginLeft:4, fontSize:10 }}>✅</span>}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* CWV Tab */}
            {activeTab==="cwv" && (
              <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20 }}>
                <div style={{ fontSize:13, fontWeight:600, color:txt, marginBottom:16 }}>📊 Core Web Vitals</div>
                <div style={{ display:"grid", gridTemplateColumns:`repeat(${data.sites.length},1fr)`, gap:12, marginBottom:16 }}>
                  {data.sites.map((s,i) => (
                    <div key={i} style={{ background:bg3, borderRadius:10, padding:14 }}>
                      <div style={{ fontSize:11, fontWeight:600, color:SITE_COLORS[i], marginBottom:12 }}>{s.domain}</div>
                      {[
                        { label:"LCP", val:s.cwv.lcp, pass:s.cwv.lcpNum<=2500, target:"<2.5s" },
                        { label:"TBT", val:s.cwv.tbt, pass:s.cwv.tbtNum<=100,  target:"<100ms" },
                        { label:"CLS", val:s.cwv.cls, pass:s.cwv.clsNum<=0.1,  target:"<0.1" },
                        { label:"FCP", val:s.cwv.fcp, pass:true,               target:"" },
                        { label:"TTFB",val:s.cwv.ttfb,pass:true,               target:"" },
                      ].map(m => (
                        <div key={m.label} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:`1px solid ${bdr}33`, fontSize:12 }}>
                          <span style={{ color:txt2 }}>{m.label} {m.target && <span style={{ fontSize:10, color:txt3 }}>({m.target})</span>}</span>
                          <span style={{ fontWeight:600, color:m.pass?"#059669":"#DC2626" }}>{m.val} {m.pass?"✅":"❌"}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Issues Tab */}
            {activeTab==="issues" && (
              <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20 }}>
                <div style={{ fontSize:13, fontWeight:600, color:txt, marginBottom:16 }}>🔧 Issues Found</div>
                <div style={{ display:"grid", gridTemplateColumns:`repeat(${data.sites.length},1fr)`, gap:12 }}>
                  {data.sites.map((s,i) => (
                    <div key={i} style={{ background:bg3, borderRadius:10, padding:14 }}>
                      <div style={{ fontSize:11, fontWeight:600, color:SITE_COLORS[i], marginBottom:10 }}>{s.domain}</div>
                      {s.issues.length > 0 ? s.issues.map((issue, ii) => (
                        <div key={ii} style={{ display:"flex", gap:8, padding:"6px 0", borderBottom:`1px solid ${bdr}33`, fontSize:12 }}>
                          <span style={{ color:"#D97706", flexShrink:0 }}>⚠️</span>
                          <span style={{ color:txt2 }}>{issue}</span>
                        </div>
                      )) : (
                        <div style={{ fontSize:12, color:"#059669", padding:"8px 0" }}>✅ No major issues found!</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {!data && !loading && (
          <div style={{ textAlign:"center", padding:60, color:txt3 }}>
            <div style={{ fontSize:40, marginBottom:12 }}>⚔️</div>
            <div style={{ fontSize:15, color:txt2 }}>Enter 2-3 URLs above to compare them</div>
            <div style={{ fontSize:12, color:txt3, marginTop:8 }}>Performance · SEO · Accessibility · Core Web Vitals · Issues</div>
          </div>
        )}
      </div>
    </div>
  );
}