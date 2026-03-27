import { useState } from "react";

const COUNTRIES = [
  { code:"IN", name:"India",          flag:"🇮🇳", lang:"Hindi/English",  currency:"INR", tld:".in"  },
  { code:"US", name:"United States",  flag:"🇺🇸", lang:"English",        currency:"USD", tld:".com" },
  { code:"UK", name:"United Kingdom", flag:"🇬🇧", lang:"English",        currency:"GBP", tld:".co.uk"},
  { code:"CA", name:"Canada",         flag:"🇨🇦", lang:"English/French", currency:"CAD", tld:".ca"  },
  { code:"AU", name:"Australia",      flag:"🇦🇺", lang:"English",        currency:"AUD", tld:".com.au"},
  { code:"DE", name:"Germany",        flag:"🇩🇪", lang:"German",         currency:"EUR", tld:".de"  },
  { code:"FR", name:"France",         flag:"🇫🇷", lang:"French",         currency:"EUR", tld:".fr"  },
  { code:"AE", name:"UAE",            flag:"🇦🇪", lang:"Arabic/English", currency:"AED", tld:".ae"  },
  { code:"SA", name:"Saudi Arabia",   flag:"🇸🇦", lang:"Arabic",         currency:"SAR", tld:".sa"  },
  { code:"SG", name:"Singapore",      flag:"🇸🇬", lang:"English",        currency:"SGD", tld:".sg"  },
  { code:"JP", name:"Japan",          flag:"🇯🇵", lang:"Japanese",       currency:"JPY", tld:".jp"  },
  { code:"BR", name:"Brazil",         flag:"🇧🇷", lang:"Portuguese",     currency:"BRL", tld:".br"  },
  { code:"MX", name:"Mexico",         flag:"🇲🇽", lang:"Spanish",        currency:"MXN", tld:".mx"  },
  { code:"PK", name:"Pakistan",       flag:"🇵🇰", lang:"Urdu/English",   currency:"PKR", tld:".pk"  },
  { code:"BD", name:"Bangladesh",     flag:"🇧🇩", lang:"Bengali",        currency:"BDT", tld:".bd"  },
  { code:"ID", name:"Indonesia",      flag:"🇮🇩", lang:"Indonesian",     currency:"IDR", tld:".id"  },
  { code:"PH", name:"Philippines",    flag:"🇵🇭", lang:"Filipino/English",currency:"PHP",tld:".ph"  },
  { code:"NG", name:"Nigeria",        flag:"🇳🇬", lang:"English",        currency:"NGN", tld:".ng"  },
  { code:"ZA", name:"South Africa",   flag:"🇿🇦", lang:"English",        currency:"ZAR", tld:".za"  },
  { code:"NL", name:"Netherlands",    flag:"🇳🇱", lang:"Dutch",          currency:"EUR", tld:".nl"  },
];

const ANALYSIS_MODES = [
  { id:"keywords",   icon:"🔍", label:"Keyword Research",     desc:"Location-specific keywords + search volume" },
  { id:"competitor", icon:"🏆", label:"Competitor Analysis",  desc:"Who ranks in this country" },
  { id:"content",    icon:"✍️", label:"Content Strategy",     desc:"What content works in this market" },
  { id:"local",      icon:"📍", label:"Local SEO",            desc:"Local search optimization tips" },
  { id:"cultural",   icon:"🎭", label:"Cultural Insights",    desc:"Cultural context for content" },
];

export default function LocationKeywords({ dark, keys, model }) {
  const [keyword, setKeyword]         = useState("");
  const [selectedCountries, setSelectedCountries] = useState(["IN","US","UK"]);
  const [mode, setMode]               = useState("keywords");
  const [loading, setLoading]         = useState(false);
  const [results, setResults]         = useState({});
  const [activeCountry, setActiveCountry] = useState(null);
  const [bulkMode, setBulkMode]       = useState(false);
  const [bulkKeywords, setBulkKeywords] = useState("");
  const [bulkResults, setBulkResults] = useState([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [copied, setCopied]           = useState(null);

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const txt3 = dark ? "#444"    : "#bbb";

  function toggleCountry(code) {
    setSelectedCountries(c =>
      c.includes(code) ? c.filter(x=>x!==code) : [...c, code]
    );
  }

  async function callAI(prompt) {
    const key = model === "groq" ? keys?.groq : keys?.gemini;
    if (!key) return null;
    if (model === "groq") {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method:"POST",
        headers:{ "Content-Type":"application/json", "Authorization":`Bearer ${key}` },
        body: JSON.stringify({ model:"llama-3.1-8b-instant", max_tokens:2500, messages:[{ role:"user", content:prompt }] })
      });
      const d = await res.json();
      return d.choices?.[0]?.message?.content || null;
    } else {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${keys?.gemini}`, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ contents:[{ parts:[{ text:prompt }] }] })
      });
      const d = await res.json();
      return d.candidates?.[0]?.content?.parts?.[0]?.text || null;
    }
  }

  function buildPrompt(kw, country, m) {
    const prompts = {
      keywords: `You are an expert international SEO specialist. Research location-specific keywords for:

Keyword: "${kw}"
Country: ${country.name} (${country.flag})
Language: ${country.lang}
Currency: ${country.currency}
Domain: ${country.tld}

Provide comprehensive keyword research:

1. PRIMARY KEYWORDS (10 keywords)
Format each as: [keyword] | Volume: [est. monthly] | Difficulty: [0-100] | CPC: [${country.currency}] | Intent: [type]

2. LONG-TAIL KEYWORDS (10 keywords)
Format each as: [keyword] | Volume: [est. monthly] | Difficulty: [0-100]

3. LOCAL SEARCH TERMS (5 keywords)
Keywords people in ${country.name} specifically use (local slang, local terms)

4. SEASONAL KEYWORDS (5 keywords)
Time-sensitive opportunities in ${country.name}

5. QUESTION-BASED KEYWORDS (10 PAA questions)
What people ask about "${kw}" in ${country.name}

6. COMPETITOR KEYWORDS
Top 5 keywords competitors rank for in ${country.name}

7. KEYWORD GAPS
5 opportunities that are low competition in ${country.name}

8. SEARCH BEHAVIOR INSIGHTS
How people in ${country.name} search for "${kw}" differently

Be specific to ${country.name} market. Use local context.`,

      competitor: `You are an expert competitive SEO analyst for ${country.name} market.

Keyword: "${kw}"
Country: ${country.name} (${country.flag})

Analyze competition in ${country.name}:

1. LIKELY TOP COMPETITORS (5 websites)
Who probably ranks #1-5 for "${kw}" in ${country.name}

2. COMPETITOR STRENGTHS
What makes them hard to beat in ${country.name}

3. COMPETITOR WEAKNESSES
What gaps they have in ${country.name} market

4. MARKET ENTRY STRATEGY
How to compete in ${country.name} for "${kw}"

5. QUICK WIN OPPORTUNITIES
Low-hanging fruit in ${country.name} SERP

6. BACKLINK OPPORTUNITIES
Where to get links in ${country.name}

7. LOCAL AUTHORITY SIGNALS
What builds trust in ${country.name}

8. ESTIMATED TIME TO RANK
Realistic timeline for page 1 in ${country.name}`,

      content: `You are an expert content strategist for ${country.name} market.

Keyword: "${kw}"
Country: ${country.name} (${country.flag})
Language: ${country.lang}

Create content strategy for ${country.name}:

1. TOP CONTENT FORMATS
What content formats work best in ${country.name} for "${kw}"

2. CONTENT CALENDAR (4 weeks)
Week-by-week content plan for ${country.name} audience

3. LOCALIZATION REQUIREMENTS
What to change from generic content for ${country.name}

4. CULTURAL CONSIDERATIONS
What to include/avoid for ${country.name} audience

5. LOCAL EXAMPLES & REFERENCES
How to make content relatable to ${country.name} readers

6. CONTENT LENGTH & STYLE
What format works best in ${country.name} SERP

7. SOCIAL MEDIA STRATEGY
Which platforms dominate in ${country.name} for this topic

8. INFLUENCER & MEDIA LANDSCAPE
Key voices in ${country.name} for "${kw}" niche

9. PUBLISHING SCHEDULE
Best times to publish for ${country.name} audience

10. MONETIZATION OPPORTUNITIES
How to monetize "${kw}" content in ${country.name}`,

      local: `You are an expert Local SEO specialist for ${country.name}.

Keyword: "${kw}"
Country: ${country.name} (${country.flag})
Domain: ${country.tld}

Local SEO strategy for ${country.name}:

1. GOOGLE MY BUSINESS OPTIMIZATION
Specific tips for ${country.name} market

2. LOCAL CITATIONS
Top directories to list in ${country.name}

3. LOCAL KEYWORDS
City/region-specific variations for "${kw}" in ${country.name}

4. NAP REQUIREMENTS
Address format and phone format for ${country.name}

5. LOCAL LINK BUILDING
Where to get local links in ${country.name}

6. REVIEW PLATFORMS
Top review sites for "${kw}" in ${country.name}

7. LOCAL SCHEMA MARKUP
Schema requirements for ${country.name} market

8. MAPS OPTIMIZATION
Google Maps ranking tips for ${country.name}

9. LOCAL CONTENT IDEAS
Community-specific content for ${country.name}

10. REGULATORY CONSIDERATIONS
Any legal/compliance notes for "${kw}" in ${country.name}`,

      cultural: `You are an expert in cultural marketing for ${country.name}.

Keyword: "${kw}"
Country: ${country.name} (${country.flag})
Language: ${country.lang}

Cultural insights for "${kw}" in ${country.name}:

1. CULTURAL CONTEXT
How "${kw}" is perceived in ${country.name} culture

2. LOCAL TERMINOLOGY
What terms locals use instead of "${kw}"

3. TRUST SIGNALS
What builds credibility in ${country.name} market

4. BUYING BEHAVIOR
How ${country.name} consumers make decisions about "${kw}"

5. PAIN POINTS
Specific problems "${kw}" solves in ${country.name}

6. TABOOS & SENSITIVITIES
What to absolutely avoid in ${country.name} content

7. SEASONAL & CULTURAL EVENTS
Key dates/events relevant to "${kw}" in ${country.name}

8. LANGUAGE NUANCES
Important translation/localization notes

9. VISUAL PREFERENCES
Design and imagery that resonates in ${country.name}

10. SUCCESS STORIES
How to position "${kw}" for ${country.name} audience`,
    };
    return prompts[m] || prompts.keywords;
  }

  async function runAnalysis() {
    if (!keyword.trim() || selectedCountries.length === 0) return;
    setLoading(true); setResults({});

    const countriesToAnalyze = COUNTRIES.filter(c => selectedCountries.includes(c.code));

    // Run all countries in parallel
    const promises = countriesToAnalyze.map(async country => {
      const prompt = buildPrompt(keyword, country, mode);
      const result = await callAI(prompt);
      return { code: country.code, result };
    });

    const responses = await Promise.all(promises);
    const newResults = {};
    responses.forEach(({ code, result }) => {
      if (result) newResults[code] = result;
    });

    setResults(newResults);
    setActiveCountry(selectedCountries[0]);
    setLoading(false);
  }

  async function runBulkAnalysis() {
    const kws = bulkKeywords.split("\n").map(k=>k.trim()).filter(Boolean);
    if (!kws.length || selectedCountries.length === 0) return;
    setBulkLoading(true); setBulkResults([]);

    const country = COUNTRIES.find(c=>c.code===selectedCountries[0]);
    if (!country) return;

    for (const kw of kws.slice(0,10)) {
      const prompt = `Analyze keyword "${kw}" for ${country.name} market. Provide:
VOLUME: [monthly search estimate]
DIFFICULTY: [0-100]
CPC: [${country.currency} estimate]
INTENT: [informational/transactional/commercial/navigational]
LOCAL_TERM: [how locals search this]
OPPORTUNITY: [Low/Medium/High]
TOP_TIP: [one specific actionable tip for ${country.name}]`;
      const result = await callAI(prompt);
      if (result) {
        const get = (k) => { const m = result.match(new RegExp(`${k}:\\s*(.+)`)); return m?m[1].trim():"N/A"; };
        setBulkResults(r => [...r, {
          keyword: kw,
          country: country.name,
          flag: country.flag,
          volume:     get("VOLUME"),
          difficulty: get("DIFFICULTY"),
          cpc:        get("CPC"),
          intent:     get("INTENT"),
          localTerm:  get("LOCAL_TERM"),
          opportunity:get("OPPORTUNITY"),
          tip:        get("TOP_TIP"),
        }]);
      }
    }
    setBulkLoading(false);
  }

  function exportCSV() {
    if (!bulkResults.length) return;
    const rows = ["Keyword,Country,Volume,Difficulty,CPC,Intent,Local Term,Opportunity,Top Tip"];
    bulkResults.forEach(r => rows.push(`"${r.keyword}","${r.country}","${r.volume}","${r.difficulty}","${r.cpc}","${r.intent}","${r.localTerm}","${r.opportunity}","${r.tip}"`));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rows.join("\n")],{type:"text/csv"}));
    a.download = "location-keywords.csv"; a.click();
  }

  function copyResult(text, id) {
    navigator.clipboard.writeText(text);
    setCopied(id); setTimeout(()=>setCopied(null),2000);
  }

  function exportAllPDF() {
    if (!Object.keys(results).length) return;
    const sections = Object.entries(results).map(([code, result]) => {
      const country = COUNTRIES.find(c=>c.code===code);
      return `<h2>${country?.flag} ${country?.name}</h2><pre>${result.replace(/</g,"&lt;")}</pre><hr>`;
    }).join("\n");
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Location Keywords — ${keyword}</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;color:#333;}h1{color:#443DCB;}h2{color:#0891B2;margin-top:30px;}pre{white-space:pre-wrap;font-size:12px;line-height:1.7;}hr{border:none;border-top:1px solid #eee;margin:20px 0;}</style>
</head><body><h1>🌍 Location Keyword Research: "${keyword}"</h1><p>Analysis Type: ${mode} · Generated: ${new Date().toLocaleDateString()}</p>${sections}</body></html>`;
    const win = window.open("","_blank","width=900,height=700");
    win.document.write(html); win.document.close();
    win.onload = () => setTimeout(()=>win.print(),500);
  }

  const oppColor = o => o==="High"?"#059669":o==="Medium"?"#D97706":"#888";
  const tabStyle = (a, color="#443DCB") => ({ padding:"6px 14px", borderRadius:20, fontSize:12, cursor:"pointer", fontWeight:a?600:400, background:a?color+"22":"transparent", color:a?color:txt2, border:`1px solid ${a?color+"44":bdr}`, whiteSpace:"nowrap" });

  return (
    <div style={{ flex:1, overflowY:"auto", padding:24, background:bg }}>
      <div style={{ maxWidth:1000, margin:"0 auto" }}>
        <div style={{ fontSize:18, fontWeight:700, color:txt, marginBottom:4 }}>🌍 Location & Country Keyword Research</div>
        <div style={{ fontSize:13, color:txt2, marginBottom:20 }}>AI-powered keyword research for any country — local terms, volume, CPC, cultural insights</div>

        {/* Mode Toggle */}
        <div style={{ display:"flex", gap:8, marginBottom:20 }}>
          <div style={tabStyle(!bulkMode)} onClick={()=>setBulkMode(false)}>🔍 Single Keyword</div>
          <div style={tabStyle(bulkMode,"#059669")} onClick={()=>setBulkMode(true)}>📋 Bulk Keywords</div>
        </div>

        {!bulkMode ? (
          <>
            {/* Input */}
            <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:20 }}>
              <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" }}>
                <input value={keyword} onChange={e=>setKeyword(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&runAnalysis()}
                  placeholder="Enter keyword, niche or topic..."
                  style={{ flex:1, minWidth:200, padding:"10px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none" }} />
                <button onClick={runAnalysis} disabled={loading||!keyword.trim()||selectedCountries.length===0}
                  style={{ padding:"10px 24px", borderRadius:10, border:"none", background:loading||!keyword.trim()?"#333":"#443DCB", color:loading||!keyword.trim()?txt3:"#fff", fontWeight:700, fontSize:13, cursor:loading||!keyword.trim()?"not-allowed":"pointer" }}>
                  {loading ? "Analyzing..." : "🌍 Analyze"}
                </button>
              </div>

              {/* Analysis Mode */}
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, color:txt2, marginBottom:8, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.06em" }}>Analysis Type</div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  {ANALYSIS_MODES.map(m => (
                    <div key={m.id} onClick={()=>setMode(m.id)}
                      style={{ padding:"7px 12px", borderRadius:8, border:`1px solid ${mode===m.id?"#443DCB44":bdr}`, background:mode===m.id?"#443DCB11":bg3, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ fontSize:14 }}>{m.icon}</span>
                      <div>
                        <div style={{ fontSize:11, fontWeight:mode===m.id?600:400, color:mode===m.id?"#6B62E8":txt }}>{m.label}</div>
                        <div style={{ fontSize:9, color:txt2 }}>{m.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Country Selection */}
              <div>
                <div style={{ fontSize:11, color:txt2, marginBottom:8, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                  Select Countries ({selectedCountries.length} selected)
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:6 }}>
                  {COUNTRIES.map(c => {
                    const selected = selectedCountries.includes(c.code);
                    return (
                      <div key={c.code} onClick={()=>toggleCountry(c.code)}
                        style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", borderRadius:8, border:`1px solid ${selected?"#443DCB44":bdr}`, background:selected?"#443DCB11":bg3, cursor:"pointer", transition:"all 0.15s" }}>
                        <span style={{ fontSize:18 }}>{c.flag}</span>
                        <div>
                          <div style={{ fontSize:11, fontWeight:selected?600:400, color:selected?"#6B62E8":txt }}>{c.name}</div>
                          <div style={{ fontSize:9, color:txt2 }}>{c.lang}</div>
                        </div>
                        {selected && <span style={{ marginLeft:"auto", fontSize:12, color:"#443DCB" }}>✓</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Loading */}
            {loading && (
              <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:16, textAlign:"center" }}>
                <div style={{ fontSize:24, marginBottom:8 }}>🌍</div>
                <div style={{ fontSize:13, color:txt, marginBottom:12 }}>Analyzing {selectedCountries.length} countries for "{keyword}"...</div>
                <div style={{ display:"flex", gap:8, justifyContent:"center", flexWrap:"wrap" }}>
                  {selectedCountries.map(code => {
                    const country = COUNTRIES.find(c=>c.code===code);
                    const done = results[code];
                    return (
                      <div key={code} style={{ padding:"4px 12px", borderRadius:20, fontSize:11, background:done?"#05966922":"#443DCB22", color:done?"#059669":"#6B62E8", border:`1px solid ${done?"#05966944":"#443DCB44"}` }}>
                        {country?.flag} {country?.name} {done?"✅":"⏳"}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Results */}
            {Object.keys(results).length > 0 && !loading && (
              <>
                {/* Country Tab Switcher */}
                <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
                  {selectedCountries.filter(code=>results[code]).map(code => {
                    const country = COUNTRIES.find(c=>c.code===code);
                    return (
                      <div key={code} style={tabStyle(activeCountry===code)} onClick={()=>setActiveCountry(code)}>
                        {country?.flag} {country?.name}
                      </div>
                    );
                  })}
                  <button onClick={exportAllPDF} style={{ marginLeft:"auto", padding:"6px 14px", borderRadius:8, border:"none", background:"#443DCB", color:"#fff", fontSize:11, cursor:"pointer", fontWeight:600 }}>
                    📥 Export All PDF
                  </button>
                </div>

                {/* Active Country Result */}
                {activeCountry && results[activeCountry] && (
                  <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, overflow:"hidden" }}>
                    {/* Header */}
                    <div style={{ padding:"14px 18px", background:bg3, borderBottom:`1px solid ${bdr}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <span style={{ fontSize:24 }}>{COUNTRIES.find(c=>c.code===activeCountry)?.flag}</span>
                        <div>
                          <div style={{ fontSize:14, fontWeight:700, color:txt }}>{COUNTRIES.find(c=>c.code===activeCountry)?.name}</div>
                          <div style={{ fontSize:11, color:txt2 }}>
                            {COUNTRIES.find(c=>c.code===activeCountry)?.lang} · {COUNTRIES.find(c=>c.code===activeCountry)?.tld} · {ANALYSIS_MODES.find(m=>m.id===mode)?.label}
                          </div>
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:8 }}>
                        <button onClick={()=>copyResult(results[activeCountry], activeCountry)}
                          style={{ padding:"5px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:"transparent", color:copied===activeCountry?"#059669":txt2, fontSize:11, cursor:"pointer" }}>
                          {copied===activeCountry?"✅ Copied":"📋 Copy"}
                        </button>
                        <button onClick={()=>{ const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([results[activeCountry]],{type:"text/plain"})); a.download=`${keyword}-${activeCountry}-keywords.txt`; a.click(); }}
                          style={{ padding:"5px 12px", borderRadius:8, border:"1px solid #059669aa", background:"#05966911", color:"#059669", fontSize:11, cursor:"pointer" }}>
                          ⬇️ TXT
                        </button>
                      </div>
                    </div>
                    <div style={{ padding:"16px 20px" }}>
                      <div style={{ fontSize:13, color:txt, lineHeight:1.9, whiteSpace:"pre-wrap" }}>{results[activeCountry]}</div>
                    </div>
                  </div>
                )}
              </>
            )}

            {Object.keys(results).length === 0 && !loading && (
              <div style={{ textAlign:"center", padding:60, color:txt3 }}>
                <div style={{ fontSize:40, marginBottom:12 }}>🌍</div>
                <div style={{ fontSize:15, color:txt2, marginBottom:8 }}>Enter a keyword and select countries</div>
                <div style={{ fontSize:12, color:txt3 }}>AI will research keywords specifically for each selected market</div>
              </div>
            )}
          </>
        ) : (
          /* ── BULK MODE ── */
          <>
            <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:16 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                <div>
                  <div style={{ fontSize:12, color:txt2, marginBottom:6 }}>Keywords (one per line, max 10)</div>
                  <textarea value={bulkKeywords} onChange={e=>setBulkKeywords(e.target.value)}
                    placeholder={"seo tools\ndigital marketing\nkeyword research\ncontent strategy"}
                    rows={8}
                    style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", resize:"none", fontFamily:"inherit", boxSizing:"border-box" }} />
                </div>
                <div>
                  <div style={{ fontSize:12, color:txt2, marginBottom:8 }}>Select Target Country</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:4, maxHeight:200, overflowY:"auto" }}>
                    {COUNTRIES.map(c => {
                      const selected = selectedCountries[0]===c.code;
                      return (
                        <div key={c.code} onClick={()=>setSelectedCountries([c.code])}
                          style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 10px", borderRadius:8, border:`1px solid ${selected?"#443DCB44":bdr}`, background:selected?"#443DCB11":bg3, cursor:"pointer" }}>
                          <span style={{ fontSize:16 }}>{c.flag}</span>
                          <span style={{ fontSize:12, color:selected?"#6B62E8":txt, fontWeight:selected?600:400 }}>{c.name}</span>
                          {selected && <span style={{ marginLeft:"auto", color:"#443DCB", fontSize:12 }}>✓</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <button onClick={runBulkAnalysis} disabled={bulkLoading||!bulkKeywords.trim()||selectedCountries.length===0}
                style={{ width:"100%", marginTop:14, padding:"11px", borderRadius:10, border:"none", background:bulkLoading||!bulkKeywords.trim()?"#333":"#443DCB", color:bulkLoading||!bulkKeywords.trim()?txt3:"#fff", fontWeight:700, fontSize:14, cursor:bulkLoading||!bulkKeywords.trim()?"not-allowed":"pointer" }}>
                {bulkLoading ? `Analyzing ${bulkResults.length+1}...` : "▶ Bulk Analyze"}
              </button>
            </div>

            {bulkResults.length > 0 && (
              <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, overflow:"hidden" }}>
                <div style={{ padding:"12px 16px", borderBottom:`1px solid ${bdr}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div style={{ fontSize:13, fontWeight:600, color:txt }}>Results ({bulkResults.length} keywords)</div>
                  <button onClick={exportCSV} style={{ padding:"5px 14px", borderRadius:8, border:"1px solid #059669aa", background:"#05966911", color:"#059669", fontSize:11, cursor:"pointer", fontWeight:600 }}>⬇️ Export CSV</button>
                </div>
                <div style={{ overflowX:"auto" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse" }}>
                    <thead>
                      <tr style={{ background:bg3 }}>
                        {["Keyword","Country","Volume","Difficulty","CPC","Intent","Local Term","Opportunity"].map(h => (
                          <th key={h} style={{ textAlign:"left", padding:"10px 12px", fontSize:11, color:txt2, fontWeight:600, borderBottom:`1px solid ${bdr}`, whiteSpace:"nowrap", textTransform:"uppercase", letterSpacing:"0.04em" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {bulkResults.map((r,i) => (
                        <tr key={i} style={{ borderBottom:`1px solid ${bdr}22` }}>
                          <td style={{ padding:"10px 12px", fontSize:12, color:txt, fontWeight:500 }}>{r.keyword}</td>
                          <td style={{ padding:"10px 12px", fontSize:12 }}><span>{r.flag} {r.country}</span></td>
                          <td style={{ padding:"10px 12px", fontSize:12, color:"#443DCB", fontWeight:600 }}>{r.volume}</td>
                          <td style={{ padding:"10px 12px", fontSize:12 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                              <div style={{ width:40, height:4, borderRadius:2, background:bg3, overflow:"hidden" }}>
                                <div style={{ height:"100%", width:`${Math.min(parseInt(r.difficulty)||0,100)}%`, background:parseInt(r.difficulty)<=40?"#059669":"#DC2626", borderRadius:2 }} />
                              </div>
                              <span style={{ fontSize:11, color:parseInt(r.difficulty)<=40?"#059669":"#DC2626" }}>{r.difficulty}</span>
                            </div>
                          </td>
                          <td style={{ padding:"10px 12px", fontSize:12, color:"#059669", fontWeight:600 }}>{r.cpc}</td>
                          <td style={{ padding:"10px 12px", fontSize:11 }}>
                            <span style={{ padding:"2px 8px", borderRadius:10, background:"#0891B222", color:"#0891B2", textTransform:"capitalize" }}>{r.intent}</span>
                          </td>
                          <td style={{ padding:"10px 12px", fontSize:11, color:txt2 }}>{r.localTerm}</td>
                          <td style={{ padding:"10px 12px", fontSize:11 }}>
                            <span style={{ padding:"2px 8px", borderRadius:10, background:oppColor(r.opportunity)+"22", color:oppColor(r.opportunity), fontWeight:600 }}>{r.opportunity}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {bulkResults.length===0 && !bulkLoading && (
              <div style={{ textAlign:"center", padding:60, color:txt3 }}>
                <div style={{ fontSize:40, marginBottom:12 }}>📋</div>
                <div style={{ fontSize:14, color:txt2 }}>Paste keywords above and select a country</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}