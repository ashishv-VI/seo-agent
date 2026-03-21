import { useState } from "react";

export default function SiteAudit({ dark, googleKey, groqKey, geminiKey, model }) {
  const [url, setUrl]         = useState("");
  const [loading, setLoading] = useState(false);
  const [audit, setAudit]     = useState(null);
  const [aiInsights, setAiInsights] = useState("");
  const [aiLoading, setAiLoading]   = useState(false);
  const [error, setError]     = useState("");

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const txt3 = dark ? "#444"    : "#bbb";

  async function runAudit() {
    if (!url.trim()) return;
    if (!googleKey) { setError("Google API Key needed in Settings!"); return; }
    setLoading(true); setError(""); setAudit(null); setAiInsights("");
    const fullUrl = url.startsWith("http") ? url : `https://${url}`;
    try {
      const [mob, desk] = await Promise.all([
        fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(fullUrl)}&key=${googleKey}&strategy=mobile`).then(r=>r.json()),
        fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(fullUrl)}&key=${googleKey}&strategy=desktop`).then(r=>r.json()),
      ]);
      if (mob.error) { setError(mob.error.message); setLoading(false); return; }
      const score = (d,k) => Math.round((d.lighthouseResult?.categories?.[k]?.score||0)*100);
      const val   = (d,k) => d.lighthouseResult?.audits?.[k]?.displayValue || "N/A";
      const numVal= (d,k) => d.lighthouseResult?.audits?.[k]?.numericValue || 0;
      const opps  = mob.lighthouseResult?.audits;
      const issues = [];
      const checks = ["render-blocking-resources","unused-javascript","unused-css-rules","uses-optimized-images","uses-text-compression","uses-responsive-images","efficient-animated-content","uses-long-cache-ttl","dom-size"];
      checks.forEach(c => { if (opps?.[c] && (opps[c].score||1) < 0.9) issues.push({ id:c, title: opps[c].title, desc: opps[c].description?.split(".")[0], score: opps[c].score, savings: opps[c].displayValue }); });
      const overallScore = Math.round((score(mob,"performance") + score(mob,"seo") + score(mob,"accessibility") + score(mob,"best-practices")) / 4);
      setAudit({
        url: fullUrl,
        overall: overallScore,
        mobile: { perf: score(mob,"performance"), seo: score(mob,"seo"), acc: score(mob,"accessibility"), bp: score(mob,"best-practices") },
        desktop:{ perf: score(desk,"performance"), seo: score(desk,"seo"), acc: score(desk,"accessibility"), bp: score(desk,"best-practices") },
        cwv: { lcp: val(mob,"largest-contentful-paint"), tbt: val(mob,"total-blocking-time"), cls: val(mob,"cumulative-layout-shift"), fcp: val(mob,"first-contentful-paint"), ttfb: val(mob,"server-response-time"), lcpNum: numVal(mob,"largest-contentful-paint"), tbtNum: numVal(mob,"total-blocking-time"), clsNum: numVal(mob,"cumulative-layout-shift") },
        issues,
      });
    } catch(e) { setError("Error: "+e.message); }
    setLoading(false);
  }

  async function getAiInsights() {
    if (!audit) return;
    const key = model==="groq" ? groqKey : geminiKey;
    if (!key) return;
    setAiLoading(true);
    const prompt = `As an SEO expert, analyze these site audit scores for ${audit.url}:
Mobile Performance: ${audit.mobile.perf}/100, SEO: ${audit.mobile.seo}/100, Accessibility: ${audit.mobile.acc}/100
Desktop Performance: ${audit.desktop.perf}/100
Core Web Vitals: LCP=${audit.cwv.lcp}, TBT=${audit.cwv.tbt}, CLS=${audit.cwv.cls}
Issues found: ${audit.issues.map(i=>i.title).join(", ")}
Provide: 1) Overall assessment 2) Top 3 priority fixes with exact steps 3) Expected impact 4) 30-day improvement plan. Be specific and actionable.`;
    try {
      let text = "";
      if (model==="groq") {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method:"POST", headers:{ "Content-Type":"application/json", "Authorization":`Bearer ${key}` },
          body: JSON.stringify({ model:"llama-3.1-8b-instant", max_tokens:1500, messages:[{ role:"user", content:prompt }] })
        });
        const d = await res.json();
        text = d.choices?.[0]?.message?.content || "";
      } else {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
          method:"POST", headers:{ "Content-Type":"application/json" },
          body: JSON.stringify({ contents:[{ parts:[{ text:prompt }] }] })
        });
        const d = await res.json();
        text = d.candidates?.[0]?.content?.parts?.[0]?.text || "";
      }
      setAiInsights(text);
    } catch(e) { setAiInsights("Error: "+e.message); }
    setAiLoading(false);
  }

  const grade = s => s>=90?"✅":s>=50?"⚠️":"❌";
  const gradeColor = s => s>=90?"#059669":s>=50?"#D97706":"#DC2626";
  const ScoreCircle = ({ score, label }) => (
    <div style={{ textAlign:"center" }}>
      <div style={{ width:64, height:64, borderRadius:"50%", border:`4px solid ${gradeColor(score)}`, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 6px", background:`${gradeColor(score)}11` }}>
        <span style={{ fontSize:18, fontWeight:700, color:gradeColor(score) }}>{score}</span>
      </div>
      <div style={{ fontSize:11, color:txt2 }}>{label}</div>
    </div>
  );

  return (
    <div style={{ flex:1, overflowY:"auto", padding:24, background:bg }}>
      <div style={{ maxWidth:800, margin:"0 auto" }}>
        <div style={{ fontSize:18, fontWeight:700, color:txt, marginBottom:4 }}>🏥 Site Health Audit</div>
        <div style={{ fontSize:13, color:txt2, marginBottom:20 }}>Complete technical SEO audit with AI insights</div>

        {/* Input */}
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:"16px 20px", marginBottom:20 }}>
          <div style={{ fontSize:12, color:txt2, marginBottom:8 }}>Enter URL to audit:</div>
          <div style={{ display:"flex", gap:10 }}>
            <input value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>e.key==="Enter"&&runAudit()}
              placeholder="https://yourdomain.com" style={{ flex:1, padding:"10px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none" }} />
            <button onClick={runAudit} disabled={loading||!url.trim()}
              style={{ padding:"10px 20px", borderRadius:10, border:"none", background:loading||!url.trim()?"#333":"#7C3AED", color:loading||!url.trim()?txt3:"#fff", fontWeight:600, fontSize:13, cursor:loading||!url.trim()?"not-allowed":"pointer" }}>
              {loading?"Auditing...":"Run Audit"}
            </button>
          </div>
          {error && <div style={{ fontSize:12, color:"#DC2626", marginTop:8, padding:"8px 12px", background:"#DC262611", borderRadius:8 }}>{error}</div>}
        </div>

        {audit && (
          <>
            {/* Overall Score */}
            <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:16, textAlign:"center" }}>
              <div style={{ fontSize:12, color:txt2, marginBottom:8 }}>Overall Site Health Score</div>
              <div style={{ fontSize:48, fontWeight:800, color:gradeColor(audit.overall), marginBottom:4 }}>{audit.overall}</div>
              <div style={{ fontSize:13, color:txt2 }}>/100 · {audit.overall>=90?"Excellent":audit.overall>=70?"Good":audit.overall>=50?"Needs Work":"Poor"}</div>
            </div>

            {/* Mobile + Desktop Scores */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
              <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20 }}>
                <div style={{ fontSize:13, fontWeight:600, color:txt, marginBottom:16 }}>📱 Mobile</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                  <ScoreCircle score={audit.mobile.perf} label="Performance" />
                  <ScoreCircle score={audit.mobile.seo} label="SEO" />
                  <ScoreCircle score={audit.mobile.acc} label="Accessibility" />
                  <ScoreCircle score={audit.mobile.bp} label="Best Practices" />
                </div>
              </div>
              <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20 }}>
                <div style={{ fontSize:13, fontWeight:600, color:txt, marginBottom:16 }}>🖥️ Desktop</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                  <ScoreCircle score={audit.desktop.perf} label="Performance" />
                  <ScoreCircle score={audit.desktop.seo} label="SEO" />
                  <ScoreCircle score={audit.desktop.acc} label="Accessibility" />
                  <ScoreCircle score={audit.desktop.bp} label="Best Practices" />
                </div>
              </div>
            </div>

            {/* Core Web Vitals */}
            <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color:txt, marginBottom:14 }}>📊 Core Web Vitals</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
                {[
                  { label:"LCP", val:audit.cwv.lcp, good: audit.cwv.lcpNum<=2500, target:"<2.5s" },
                  { label:"TBT", val:audit.cwv.tbt, good: audit.cwv.tbtNum<=100,  target:"<100ms" },
                  { label:"CLS", val:audit.cwv.cls, good: audit.cwv.clsNum<=0.1,  target:"<0.1" },
                ].map(v => (
                  <div key={v.label} style={{ background:bg3, borderRadius:10, padding:"14px", textAlign:"center", border:`1px solid ${v.good?"#05966933":"#DC262633"}` }}>
                    <div style={{ fontSize:11, color:txt2, marginBottom:4 }}>{v.label}</div>
                    <div style={{ fontSize:18, fontWeight:700, color:v.good?"#059669":"#DC2626" }}>{v.val}</div>
                    <div style={{ fontSize:10, color:txt3, marginTop:2 }}>target: {v.target}</div>
                    <div style={{ fontSize:11, marginTop:4 }}>{v.good?"✅ Pass":"❌ Fail"}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Issues */}
            {audit.issues.length > 0 && (
              <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:16 }}>
                <div style={{ fontSize:13, fontWeight:600, color:txt, marginBottom:14 }}>🔧 Issues Found ({audit.issues.length})</div>
                {audit.issues.map((issue,i) => (
                  <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"10px 0", borderBottom:`1px solid ${bdr}33` }}>
                    <div style={{ width:8, height:8, borderRadius:"50%", background: issue.score===0?"#DC2626":issue.score<0.5?"#D97706":"#D97706", marginTop:5, flexShrink:0 }} />
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:500, color:txt }}>{issue.title}</div>
                      {issue.savings && <div style={{ fontSize:11, color:"#D97706", marginTop:2 }}>Potential savings: {issue.savings}</div>}
                    </div>
                    <div style={{ fontSize:11, padding:"2px 8px", borderRadius:6, background: issue.score===0?"#DC262611":"#D9770611", color: issue.score===0?"#DC2626":"#D97706" }}>
                      {issue.score===0?"Critical":"Warning"}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* AI Insights */}
            <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:16 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                <div style={{ fontSize:13, fontWeight:600, color:txt }}>🤖 AI Recommendations</div>
                {!aiInsights && (
                  <button onClick={getAiInsights} disabled={aiLoading}
                    style={{ padding:"6px 16px", borderRadius:8, border:"none", background:aiLoading?"#333":"#7C3AED", color:aiLoading?txt3:"#fff", fontSize:12, cursor:aiLoading?"not-allowed":"pointer" }}>
                    {aiLoading?"Analyzing...":"Get AI Insights"}
                  </button>
                )}
              </div>
              {aiInsights ? (
                <div style={{ fontSize:13, color:txt, lineHeight:1.75, whiteSpace:"pre-wrap" }}>{aiInsights}</div>
              ) : (
                <div style={{ fontSize:12, color:txt3, fontStyle:"italic" }}>Click "Get AI Insights" for personalized recommendations based on your audit results.</div>
              )}
            </div>
          </>
        )}

        {!audit && !loading && (
          <div style={{ textAlign:"center", padding:60, color:txt3 }}>
            <div style={{ fontSize:40, marginBottom:12 }}>🏥</div>
            <div style={{ fontSize:15, color:txt2 }}>Enter your site URL above to run a complete audit</div>
            <div style={{ fontSize:12, color:txt3, marginTop:8 }}>Analyzes Performance, SEO, Accessibility, Core Web Vitals</div>
          </div>
        )}
      </div>
    </div>
  );
}