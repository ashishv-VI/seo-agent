import { useState } from "react";

export default function SiteAudit({ dark, googleKey, groqKey, geminiKey, model }) {
  const [url, setUrl]         = useState("");
  const [loading, setLoading] = useState(false);
  const [audit, setAudit]     = useState(null);
  const [aiInsights, setAiInsights] = useState("");
  const [aiLoading, setAiLoading]   = useState(false);
  const [error, setError]     = useState("");
  const [activeTab, setActiveTab] = useState("audit");

  // Indexing checker state
  const [indexUrl, setIndexUrl]       = useState("");
  const [indexLoading, setIndexLoading] = useState(false);
  const [indexResult, setIndexResult]   = useState(null);
  const [indexError, setIndexError]     = useState("");
  const [bulkUrls, setBulkUrls]         = useState("");
  const [bulkResults, setBulkResults]   = useState([]);
  const [bulkLoading, setBulkLoading]   = useState(false);

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
      const score  = (d,k) => Math.round((d.lighthouseResult?.categories?.[k]?.score||0)*100);
      const val    = (d,k) => d.lighthouseResult?.audits?.[k]?.displayValue || "N/A";
      const numVal = (d,k) => d.lighthouseResult?.audits?.[k]?.numericValue || 0;
      const opps   = mob.lighthouseResult?.audits;
      const issues = [];
      const checks = ["render-blocking-resources","unused-javascript","unused-css-rules","uses-optimized-images","uses-text-compression","uses-responsive-images","efficient-animated-content","uses-long-cache-ttl","dom-size"];
      checks.forEach(c => { if (opps?.[c] && (opps[c].score||1) < 0.9) issues.push({ id:c, title: opps[c].title, desc: opps[c].description?.split(".")[0], score: opps[c].score, savings: opps[c].displayValue }); });
      const overallScore = Math.round((score(mob,"performance") + score(mob,"seo") + score(mob,"accessibility") + score(mob,"best-practices")) / 4);
      setAudit({
        url: fullUrl, overall: overallScore,
        mobile:  { perf: score(mob,"performance"),  seo: score(mob,"seo"),  acc: score(mob,"accessibility"),  bp: score(mob,"best-practices") },
        desktop: { perf: score(desk,"performance"), seo: score(desk,"seo"), acc: score(desk,"accessibility"), bp: score(desk,"best-practices") },
        cwv: { lcp: val(mob,"largest-contentful-paint"), tbt: val(mob,"total-blocking-time"), cls: val(mob,"cumulative-layout-shift"), fcp: val(mob,"first-contentful-paint"), ttfb: val(mob,"server-response-time"), lcpNum: numVal(mob,"largest-contentful-paint"), tbtNum: numVal(mob,"total-blocking-time"), clsNum: numVal(mob,"cumulative-layout-shift") },
        issues,
      });
    } catch(e) { setError("Error: "+e.message); }
    setLoading(false);
  }

  async function checkIndexing(checkUrl) {
    if (!checkUrl.trim()) return;
    if (!googleKey) { setIndexError("Google API Key needed in Settings!"); return; }
    setIndexLoading(true); setIndexError(""); setIndexResult(null);
    const fullUrl = checkUrl.startsWith("http") ? checkUrl : `https://${checkUrl}`;
    try {
      const res = await fetch(
        `https://www.googleapis.com/customsearch/v1?key=${googleKey}&cx=017576662512468239146:omuauf8t8ia&q=site:${encodeURIComponent(fullUrl)}&num=1`
      ).then(r=>r.json());

      // Also try pagespeed to get meta info
      const psRes = await fetch(
        `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(fullUrl)}&key=${googleKey}&strategy=mobile`
      ).then(r=>r.json());

      const isIndexable = !psRes.lighthouseResult?.audits?.["is-crawlable"]?.score === false;
      const robotsMeta  = psRes.lighthouseResult?.audits?.["is-crawlable"];
      const canonical   = psRes.lighthouseResult?.audits?.["canonical"];
      const hreflang    = psRes.lighthouseResult?.audits?.["hreflang"];

      const indexed = res.searchInformation?.totalResults > 0;
      const totalResults = res.searchInformation?.totalResults || "0";

      setIndexResult({
        url: fullUrl,
        indexed,
        totalResults,
        crawlable: robotsMeta?.score === 1,
        robotsMsg: robotsMeta?.score === 1 ? "Page is crawlable" : robotsMeta?.explanation || "Crawl issue detected",
        canonical: canonical?.displayValue || "Not specified",
        canonicalPass: canonical?.score === 1,
        hreflang: hreflang?.score === 1,
        title: psRes.lighthouseResult?.audits?.["document-title"]?.displayValue || "N/A",
        metaDesc: psRes.lighthouseResult?.audits?.["meta-description"]?.score === 1,
        items: res.items || [],
      });
    } catch(e) { setIndexError("Error: "+e.message); }
    setIndexLoading(false);
  }

  async function checkBulkIndexing() {
    const urls = bulkUrls.split("\n").map(u=>u.trim()).filter(Boolean);
    if (!urls.length) return;
    if (!googleKey) { setIndexError("Google API Key needed!"); return; }
    setBulkLoading(true); setBulkResults([]);
    for (const u of urls.slice(0,10)) {
      const fullUrl = u.startsWith("http") ? u : `https://${u}`;
      try {
        const psRes = await fetch(
          `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(fullUrl)}&key=${googleKey}&strategy=mobile`
        ).then(r=>r.json());
        const crawlable = psRes.lighthouseResult?.audits?.["is-crawlable"]?.score === 1;
        const seoScore  = Math.round((psRes.lighthouseResult?.categories?.seo?.score||0)*100);
        setBulkResults(r => [...r, { url: fullUrl, crawlable, seoScore, error: psRes.error?.message || null }]);
      } catch(e) {
        setBulkResults(r => [...r, { url: fullUrl, crawlable: false, seoScore: 0, error: e.message }]);
      }
    }
    setBulkLoading(false);
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

  const grade      = s => s>=90?"✅":s>=50?"⚠️":"❌";
  const gradeColor = s => s>=90?"#059669":s>=50?"#D97706":"#DC2626";

  const ScoreCircle = ({ score, label }) => (
    <div style={{ textAlign:"center" }}>
      <div style={{ width:64, height:64, borderRadius:"50%", border:`4px solid ${gradeColor(score)}`, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 6px", background:`${gradeColor(score)}11` }}>
        <span style={{ fontSize:18, fontWeight:700, color:gradeColor(score) }}>{score}</span>
      </div>
      <div style={{ fontSize:11, color:txt2 }}>{label}</div>
    </div>
  );

  const tabStyle = (a) => ({ padding:"8px 18px", borderRadius:20, fontSize:12, cursor:"pointer", fontWeight:a?600:400, background:a?"#7C3AED22":"transparent", color:a?"#A78BFA":txt2, border:`1px solid ${a?"#7C3AED44":bdr}` });

  return (
    <div style={{ flex:1, overflowY:"auto", padding:24, background:bg }}>
      <div style={{ maxWidth:800, margin:"0 auto" }}>
        <div style={{ fontSize:18, fontWeight:700, color:txt, marginBottom:4 }}>🏥 Site Audit + Indexing Checker</div>
        <div style={{ fontSize:13, color:txt2, marginBottom:20 }}>Technical SEO audit · Core Web Vitals · Google Indexing Status</div>

        {/* Tabs */}
        <div style={{ display:"flex", gap:8, marginBottom:20 }}>
          <div style={tabStyle(activeTab==="audit")}    onClick={()=>setActiveTab("audit")}>🏥 Site Audit</div>
          <div style={tabStyle(activeTab==="index")}    onClick={()=>setActiveTab("index")}>🔍 Index Checker</div>
          <div style={tabStyle(activeTab==="bulk")}     onClick={()=>setActiveTab("bulk")}>📋 Bulk Check</div>
        </div>

        {/* ── SITE AUDIT TAB ── */}
        {activeTab==="audit" && (
          <>
            <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:"16px 20px", marginBottom:20 }}>
              <div style={{ fontSize:12, color:txt2, marginBottom:8 }}>Enter URL to audit:</div>
              <div style={{ display:"flex", gap:10 }}>
                <input value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>e.key==="Enter"&&runAudit()}
                  placeholder="https://yourdomain.com"
                  style={{ flex:1, padding:"10px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none" }} />
                <button onClick={runAudit} disabled={loading||!url.trim()}
                  style={{ padding:"10px 20px", borderRadius:10, border:"none", background:loading||!url.trim()?"#333":"#7C3AED", color:loading||!url.trim()?txt3:"#fff", fontWeight:600, fontSize:13, cursor:loading||!url.trim()?"not-allowed":"pointer" }}>
                  {loading?"Auditing...":"Run Audit"}
                </button>
              </div>
              {error && <div style={{ fontSize:12, color:"#DC2626", marginTop:8, padding:"8px 12px", background:"#DC262611", borderRadius:8 }}>{error}</div>}
            </div>

            {audit && (
              <>
                <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:16, textAlign:"center" }}>
                  <div style={{ fontSize:12, color:txt2, marginBottom:8 }}>Overall Site Health Score</div>
                  <div style={{ fontSize:48, fontWeight:800, color:gradeColor(audit.overall), marginBottom:4 }}>{audit.overall}</div>
                  <div style={{ fontSize:13, color:txt2 }}>/100 · {audit.overall>=90?"Excellent":audit.overall>=70?"Good":audit.overall>=50?"Needs Work":"Poor"}</div>
                </div>

                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
                  {[["📱 Mobile",audit.mobile],["🖥️ Desktop",audit.desktop]].map(([label,scores]) => (
                    <div key={label} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:txt, marginBottom:16 }}>{label}</div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                        <ScoreCircle score={scores.perf} label="Performance" />
                        <ScoreCircle score={scores.seo}  label="SEO" />
                        <ScoreCircle score={scores.acc}  label="Accessibility" />
                        <ScoreCircle score={scores.bp}   label="Best Practices" />
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:16 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:txt, marginBottom:14 }}>📊 Core Web Vitals</div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
                    {[
                      { label:"LCP", val:audit.cwv.lcp, good: audit.cwv.lcpNum<=2500, target:"<2.5s" },
                      { label:"TBT", val:audit.cwv.tbt, good: audit.cwv.tbtNum<=100,  target:"<100ms" },
                      { label:"CLS", val:audit.cwv.cls, good: audit.cwv.clsNum<=0.1,  target:"<0.1" },
                    ].map(v => (
                      <div key={v.label} style={{ background:bg3, borderRadius:10, padding:14, textAlign:"center", border:`1px solid ${v.good?"#05966933":"#DC262633"}` }}>
                        <div style={{ fontSize:11, color:txt2, marginBottom:4 }}>{v.label}</div>
                        <div style={{ fontSize:18, fontWeight:700, color:v.good?"#059669":"#DC2626" }}>{v.val}</div>
                        <div style={{ fontSize:10, color:txt3, marginTop:2 }}>target: {v.target}</div>
                        <div style={{ fontSize:11, marginTop:4 }}>{v.good?"✅ Pass":"❌ Fail"}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {audit.issues.length > 0 && (
                  <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:16 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:txt, marginBottom:14 }}>🔧 Issues Found ({audit.issues.length})</div>
                    {audit.issues.map((issue,i) => (
                      <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"10px 0", borderBottom:`1px solid ${bdr}33` }}>
                        <div style={{ width:8, height:8, borderRadius:"50%", background: issue.score===0?"#DC2626":"#D97706", marginTop:5, flexShrink:0 }} />
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:13, fontWeight:500, color:txt }}>{issue.title}</div>
                          {issue.savings && <div style={{ fontSize:11, color:"#D97706", marginTop:2 }}>Savings: {issue.savings}</div>}
                        </div>
                        <div style={{ fontSize:11, padding:"2px 8px", borderRadius:6, background: issue.score===0?"#DC262611":"#D9770611", color: issue.score===0?"#DC2626":"#D97706" }}>
                          {issue.score===0?"Critical":"Warning"}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20 }}>
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
                    <div style={{ fontSize:12, color:txt3, fontStyle:"italic" }}>Click "Get AI Insights" for personalized recommendations.</div>
                  )}
                </div>
              </>
            )}

            {!audit && !loading && (
              <div style={{ textAlign:"center", padding:60, color:txt3 }}>
                <div style={{ fontSize:40, marginBottom:12 }}>🏥</div>
                <div style={{ fontSize:15, color:txt2 }}>Enter your site URL above to run a complete audit</div>
                <div style={{ fontSize:12, color:txt3, marginTop:8 }}>Performance · SEO · Accessibility · Core Web Vitals</div>
              </div>
            )}
          </>
        )}

        {/* ── INDEX CHECKER TAB ── */}
        {activeTab==="index" && (
          <>
            <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:"16px 20px", marginBottom:20 }}>
              <div style={{ fontSize:12, color:txt2, marginBottom:8 }}>Check if a URL is indexed by Google:</div>
              <div style={{ display:"flex", gap:10 }}>
                <input value={indexUrl} onChange={e=>setIndexUrl(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&checkIndexing(indexUrl)}
                  placeholder="https://yourdomain.com/page"
                  style={{ flex:1, padding:"10px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none" }} />
                <button onClick={()=>checkIndexing(indexUrl)} disabled={indexLoading||!indexUrl.trim()}
                  style={{ padding:"10px 20px", borderRadius:10, border:"none", background:indexLoading||!indexUrl.trim()?"#333":"#7C3AED", color:indexLoading||!indexUrl.trim()?txt3:"#fff", fontWeight:600, fontSize:13, cursor:indexLoading||!indexUrl.trim()?"not-allowed":"pointer" }}>
                  {indexLoading?"Checking...":"Check Index"}
                </button>
              </div>
              {indexError && <div style={{ fontSize:12, color:"#DC2626", marginTop:8, padding:"8px 12px", background:"#DC262611", borderRadius:8 }}>{indexError}</div>}
              <div style={{ fontSize:11, color:txt3, marginTop:8 }}>⚠️ Uses PageSpeed API to check crawlability + meta signals</div>
            </div>

            {indexResult && (
              <>
                {/* Main Status */}
                <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:24, marginBottom:16, textAlign:"center" }}>
                  <div style={{ fontSize:48, marginBottom:8 }}>{indexResult.crawlable?"✅":"❌"}</div>
                  <div style={{ fontSize:20, fontWeight:700, color:indexResult.crawlable?"#059669":"#DC2626", marginBottom:4 }}>
                    {indexResult.crawlable ? "Page is Crawlable" : "Crawling Blocked"}
                  </div>
                  <div style={{ fontSize:12, color:txt2 }}>{indexResult.url}</div>
                </div>

                {/* Checks Grid */}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:12, marginBottom:16 }}>
                  {[
                    { label:"Crawlable by Google", pass: indexResult.crawlable, detail: indexResult.robotsMsg },
                    { label:"Canonical Tag",        pass: indexResult.canonicalPass, detail: indexResult.canonical },
                    { label:"Meta Description",     pass: indexResult.metaDesc,      detail: indexResult.metaDesc?"Present":"Missing" },
                    { label:"Hreflang Tags",        pass: indexResult.hreflang,      detail: indexResult.hreflang?"Present":"Not used" },
                  ].map((c,i) => (
                    <div key={i} style={{ background:bg3, border:`1px solid ${c.pass?"#05966933":"#DC262633"}`, borderRadius:10, padding:"14px 16px" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                        <span style={{ fontSize:16 }}>{c.pass?"✅":"❌"}</span>
                        <span style={{ fontSize:13, fontWeight:600, color:txt }}>{c.label}</span>
                      </div>
                      <div style={{ fontSize:11, color:txt2, paddingLeft:24 }}>{c.detail}</div>
                    </div>
                  ))}
                </div>

                {/* Page Title */}
                <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:"14px 18px" }}>
                  <div style={{ fontSize:12, color:txt2, marginBottom:4 }}>Page Title</div>
                  <div style={{ fontSize:13, color:txt, fontWeight:500 }}>{indexResult.title}</div>
                </div>
              </>
            )}

            {!indexResult && !indexLoading && (
              <div style={{ textAlign:"center", padding:60, color:txt3 }}>
                <div style={{ fontSize:40, marginBottom:12 }}>🔍</div>
                <div style={{ fontSize:15, color:txt2 }}>Enter a URL to check its indexing status</div>
                <div style={{ fontSize:12, color:txt3, marginTop:8 }}>Checks crawlability · canonical · meta signals</div>
              </div>
            )}
          </>
        )}

        {/* ── BULK CHECK TAB ── */}
        {activeTab==="bulk" && (
          <>
            <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:"16px 20px", marginBottom:20 }}>
              <div style={{ fontSize:12, color:txt2, marginBottom:8 }}>Enter up to 10 URLs (one per line):</div>
              <textarea value={bulkUrls} onChange={e=>setBulkUrls(e.target.value)}
                placeholder={"https://yourdomain.com/page-1\nhttps://yourdomain.com/page-2\nhttps://yourdomain.com/page-3"}
                rows={6}
                style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", resize:"none", fontFamily:"inherit", marginBottom:10, boxSizing:"border-box" }} />
              <button onClick={checkBulkIndexing} disabled={bulkLoading||!bulkUrls.trim()}
                style={{ padding:"10px 24px", borderRadius:10, border:"none", background:bulkLoading||!bulkUrls.trim()?"#333":"#7C3AED", color:bulkLoading||!bulkUrls.trim()?txt3:"#fff", fontWeight:600, fontSize:13, cursor:bulkLoading||!bulkUrls.trim()?"not-allowed":"pointer" }}>
                {bulkLoading?`Checking ${bulkResults.length+1}...`:"▶ Check All URLs"}
              </button>
            </div>

            {bulkResults.length > 0 && (
              <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20 }}>
                <div style={{ fontSize:13, fontWeight:600, color:txt, marginBottom:14 }}>Results ({bulkResults.length} URLs)</div>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {bulkResults.map((r,i) => (
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", background:bg3, borderRadius:8, border:`1px solid ${r.error?"#DC262633":r.crawlable?"#05966933":"#D9770633"}` }}>
                      <span style={{ fontSize:18, flexShrink:0 }}>{r.error?"❌":r.crawlable?"✅":"⚠️"}</span>
                      <div style={{ flex:1, overflow:"hidden" }}>
                        <div style={{ fontSize:12, color:txt, fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.url}</div>
                        <div style={{ fontSize:11, color:txt2, marginTop:2 }}>{r.error||( r.crawlable?"Crawlable":"Not crawlable")}</div>
                      </div>
                      <div style={{ flexShrink:0, textAlign:"right" }}>
                        <div style={{ fontSize:12, fontWeight:600, color:r.seoScore>=80?"#059669":r.seoScore>=50?"#D97706":"#DC2626" }}>SEO {r.seoScore}</div>
                        <div style={{ fontSize:10, color:txt3 }}>/100</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {bulkResults.length===0 && !bulkLoading && (
              <div style={{ textAlign:"center", padding:60, color:txt3 }}>
                <div style={{ fontSize:40, marginBottom:12 }}>📋</div>
                <div style={{ fontSize:15, color:txt2 }}>Paste multiple URLs to check all at once</div>
                <div style={{ fontSize:12, color:txt3, marginTop:8 }}>Checks crawlability + SEO score for each URL</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}