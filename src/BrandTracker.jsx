import { useState } from "react";
import { callAIBackend } from "./utils/callAI";

const AI_PLATFORMS = [
  { id:"chatgpt",    name:"ChatGPT",    icon:"🤖", color:"#10A37F", desc:"OpenAI's AI assistant" },
  { id:"gemini",     name:"Gemini",     icon:"✨", color:"#4285F4", desc:"Google's AI assistant" },
  { id:"perplexity", name:"Perplexity", icon:"🔮", color:"#443DCB", desc:"AI search engine" },
  { id:"claude",     name:"Claude",     icon:"🧠", color:"#D97706", desc:"Anthropic's AI assistant" },
  { id:"copilot",    name:"Copilot",    icon:"💼", color:"#0078D4", desc:"Microsoft's AI assistant" },
];

const QUERY_TEMPLATES = [
  "What are the best {keyword} tools?",
  "Who are the top {keyword} companies?",
  "What is the best {keyword} software?",
  "Recommend {keyword} solutions",
  "What {keyword} platforms do experts use?",
  "Best {keyword} for small businesses",
  "Top rated {keyword} in 2026",
  "Which {keyword} tool should I use?",
];

export default function BrandTracker({ dark, keys, model, getToken }) {
  const [brand, setBrand]         = useState("");
  const [keyword, setKeyword]     = useState("");
  const [competitors, setCompetitors] = useState("");
  const [loading, setLoading]     = useState(false);
  const [results, setResults]     = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [history, setHistory]     = useState([]);

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const txt3 = dark ? "#444"    : "#bbb";

  async function callAI(prompt) {
    if (!getToken) return null;
    return callAIBackend(prompt, model, getToken);
  }

  async function runAnalysis() {
    if (!brand.trim() || !keyword.trim()) return;
    if (!keys.groq && !keys.gemini) return;
    setLoading(true); setResults(null);

    const compList = competitors.split(",").map(c => c.trim()).filter(Boolean);

    try {
      // Run all platform analyses in parallel
      const platformPromises = AI_PLATFORMS.map(async (platform) => {
        const queries = QUERY_TEMPLATES.slice(0, 4).map(q => q.replace("{keyword}", keyword));
        const prompt = `You are simulating how ${platform.name} AI would respond to queries about "${keyword}".

Brand to track: "${brand}"
Competitors: ${compList.length ? compList.join(", ") : "unknown"}

For each of these queries, simulate a realistic ${platform.name} response and analyze brand visibility:
${queries.map((q, i) => `${i+1}. "${q}"`).join("\n")}

Respond in this EXACT format:
VISIBILITY_SCORE: [0-100 number]
MENTIONED: [yes/no]
MENTION_COUNT: [number 0-10]
SENTIMENT: [positive/neutral/negative]
POSITION: [first/top3/top5/mentioned/not_mentioned]
STRENGTHS: [2-3 reasons why ${brand} would/wouldn't be mentioned]
RECOMMENDATION: [1 specific action to improve visibility on ${platform.name}]
SAMPLE_RESPONSE: [A realistic 2-sentence example of how ${platform.name} might mention or not mention ${brand}]`;

        const response = await callAI(prompt);
        if (!response) return { platform, score: 0, mentioned: false, sentiment: "neutral", position: "not_mentioned", strengths: "", recommendation: "", sample: "" };

        const get = (key) => {
          const match = response.match(new RegExp(`${key}:\\s*(.+)`));
          return match ? match[1].trim() : "";
        };

        return {
          platform,
          score: parseInt(get("VISIBILITY_SCORE")) || 0,
          mentioned: get("MENTIONED").toLowerCase() === "yes",
          mentionCount: parseInt(get("MENTION_COUNT")) || 0,
          sentiment: get("SENTIMENT") || "neutral",
          position: get("POSITION") || "not_mentioned",
          strengths: get("STRENGTHS"),
          recommendation: get("RECOMMENDATION"),
          sample: get("SAMPLE_RESPONSE"),
        };
      });

      // Overall strategy analysis
      const strategyPromise = callAI(`You are a GEO (Generative Engine Optimization) expert analyzing "${brand}" in the "${keyword}" space.

Competitors: ${compList.length ? compList.join(", ") : "major players in the space"}

Provide a comprehensive AI visibility analysis:

OVERALL_SCORE: [0-100]
SHARE_OF_VOICE: [0-100 percentage vs competitors]
TOP_QUERIES: [5 specific queries users ask AI about ${keyword} - comma separated]
CONTENT_GAPS: [3 content types missing that would boost AI citations]
AUTHORITY_SIGNALS: [3 authority signals needed for AI to cite ${brand}]
ACTION_PLAN: [5 specific actions to improve AI visibility, numbered]
COMPETITOR_ADVANTAGE: [Why competitors might rank higher in AI responses]`);

      const [platformResults, strategyText] = await Promise.all([
        Promise.all(platformPromises),
        strategyPromise
      ]);

      const getStrategy = (key) => {
        const match = strategyText?.match(new RegExp(`${key}:\\s*(.+)`));
        return match ? match[1].trim() : "";
      };

      const overallScore = Math.round(platformResults.reduce((a, r) => a + r.score, 0) / platformResults.length);
      const mentionedCount = platformResults.filter(r => r.mentioned).length;

      setResults({
        brand, keyword,
        overallScore,
        mentionedCount,
        platforms: platformResults,
        shareOfVoice: parseInt(getStrategy("SHARE_OF_VOICE")) || 0,
        topQueries: getStrategy("TOP_QUERIES").split(",").map(q => q.trim()).filter(Boolean),
        contentGaps: getStrategy("CONTENT_GAPS"),
        authoritySignals: getStrategy("AUTHORITY_SIGNALS"),
        actionPlan: getStrategy("ACTION_PLAN"),
        competitorAdvantage: getStrategy("COMPETITOR_ADVANTAGE"),
        timestamp: new Date().toLocaleString(),
      });

      setHistory(h => [{ brand, keyword, score: overallScore, time: new Date().toLocaleTimeString() }, ...h.slice(0,4)]);

    } catch(e) { console.error(e); }
    setLoading(false);
  }

  const scoreColor  = s => s >= 70 ? "#059669" : s >= 40 ? "#D97706" : "#DC2626";
  const scoreLabel  = s => s >= 70 ? "Strong" : s >= 40 ? "Moderate" : "Weak";
  const sentColor   = s => s === "positive" ? "#059669" : s === "negative" ? "#DC2626" : "#D97706";
  const posLabel    = p => ({ first:"#1 Mention", top3:"Top 3", top5:"Top 5", mentioned:"Mentioned", not_mentioned:"Not Mentioned" }[p] || p);
  const posColor    = p => ({ first:"#059669", top3:"#059669", top5:"#D97706", mentioned:"#D97706", not_mentioned:"#DC2626" }[p] || "#888");
  const tabStyle    = (a) => ({ padding:"7px 16px", borderRadius:20, fontSize:12, cursor:"pointer", fontWeight:a?600:400, background:a?"#443DCB22":"transparent", color:a?"#6B62E8":txt2, border:`1px solid ${a?"#443DCB44":bdr}` });

  return (
    <div style={{ flex:1, overflowY:"auto", padding:24, background:bg }}>
      <div style={{ maxWidth:860, margin:"0 auto" }}>
        <div style={{ fontSize:18, fontWeight:700, color:txt, marginBottom:4 }}>🔍 AI Brand Mention Tracker</div>
        <div style={{ fontSize:13, color:txt2, marginBottom:20 }}>Track your brand visibility across ChatGPT, Gemini, Perplexity, Claude & more</div>

        {/* Input Card */}
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:20 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
            <div>
              <div style={{ fontSize:12, color:txt2, marginBottom:6 }}>Brand Name <span style={{ color:"#DC2626" }}>*</span></div>
              <input value={brand} onChange={e=>setBrand(e.target.value)}
                placeholder="e.g. Damco Group"
                style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", boxSizing:"border-box" }} />
            </div>
            <div>
              <div style={{ fontSize:12, color:txt2, marginBottom:6 }}>Industry / Keyword <span style={{ color:"#DC2626" }}>*</span></div>
              <input value={keyword} onChange={e=>setKeyword(e.target.value)}
                placeholder="e.g. SEO tools, logistics software"
                style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", boxSizing:"border-box" }} />
            </div>
          </div>
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:12, color:txt2, marginBottom:6 }}>Competitors (comma separated)</div>
            <input value={competitors} onChange={e=>setCompetitors(e.target.value)}
              placeholder="e.g. Semrush, Ahrefs, Moz"
              style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", boxSizing:"border-box" }} />
          </div>
          <button onClick={runAnalysis} disabled={loading||!brand.trim()||!keyword.trim()}
            style={{ width:"100%", padding:"11px", borderRadius:10, border:"none", background:loading||!brand.trim()||!keyword.trim()?"#333":"#443DCB", color:loading||!brand.trim()||!keyword.trim()?txt3:"#fff", fontWeight:700, fontSize:14, cursor:loading||!brand.trim()||!keyword.trim()?"not-allowed":"pointer" }}>
            {loading ? "🔍 Analyzing across 5 AI platforms..." : "🚀 Analyze AI Brand Visibility"}
          </button>
          {loading && (
            <div style={{ display:"flex", gap:8, marginTop:12, flexWrap:"wrap" }}>
              {AI_PLATFORMS.map(p => (
                <div key={p.id} style={{ padding:"4px 10px", borderRadius:20, fontSize:11, background:p.color+"22", color:p.color, border:`1px solid ${p.color}44` }}>
                  {p.icon} {p.name}...
                </div>
              ))}
            </div>
          )}
        </div>

        {results && (
          <>
            {/* Overview Stats */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20 }}>
              {[
                { label:"AI Visibility Score", val:`${results.overallScore}/100`, color:scoreColor(results.overallScore), sub:scoreLabel(results.overallScore) },
                { label:"Platforms Mentioned", val:`${results.mentionedCount}/5`,  color:results.mentionedCount>=4?"#059669":results.mentionedCount>=2?"#D97706":"#DC2626", sub:"AI platforms" },
                { label:"Share of Voice",      val:`${results.shareOfVoice}%`,     color:scoreColor(results.shareOfVoice), sub:"vs competitors" },
                { label:"Brand",               val:results.brand,                  color:"#443DCB", sub:results.keyword },
              ].map(s => (
                <div key={s.label} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:16, textAlign:"center", borderTop:`3px solid ${s.color}` }}>
                  <div style={{ fontSize:20, fontWeight:700, color:s.color, marginBottom:4 }}>{s.val}</div>
                  <div style={{ fontSize:11, color:txt2, marginBottom:2 }}>{s.label}</div>
                  <div style={{ fontSize:10, color:txt3 }}>{s.sub}</div>
                </div>
              ))}
            </div>

            {/* Platform Cards */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10, marginBottom:20 }}>
              {results.platforms.map(r => (
                <div key={r.platform.id} style={{ background:bg2, border:`1px solid ${r.mentioned?r.platform.color+"44":bdr}`, borderRadius:10, padding:"12px 10px", textAlign:"center" }}>
                  <div style={{ fontSize:22, marginBottom:4 }}>{r.platform.icon}</div>
                  <div style={{ fontSize:11, fontWeight:600, color:txt, marginBottom:8 }}>{r.platform.name}</div>
                  <div style={{ fontSize:18, fontWeight:700, color:scoreColor(r.score), marginBottom:4 }}>{r.score}</div>
                  <div style={{ fontSize:10, padding:"2px 6px", borderRadius:4, background:posColor(r.position)+"22", color:posColor(r.position), marginBottom:6 }}>{posLabel(r.position)}</div>
                  <div style={{ fontSize:10, padding:"2px 6px", borderRadius:4, background:sentColor(r.sentiment)+"22", color:sentColor(r.sentiment) }}>{r.sentiment}</div>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
              {["overview","platforms","queries","strategy"].map(t => (
                <div key={t} style={tabStyle(activeTab===t)} onClick={()=>setActiveTab(t)}>
                  {t.charAt(0).toUpperCase()+t.slice(1)}
                </div>
              ))}
            </div>

            {/* Overview Tab */}
            {activeTab==="overview" && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:txt, marginBottom:14 }}>📊 Platform Visibility</div>
                  {results.platforms.map(r => (
                    <div key={r.platform.id} style={{ marginBottom:12 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:4 }}>
                        <span style={{ color:txt }}>{r.platform.icon} {r.platform.name}</span>
                        <span style={{ color:scoreColor(r.score), fontWeight:600 }}>{r.score}/100</span>
                      </div>
                      <div style={{ height:6, borderRadius:3, background:bg3, overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${r.score}%`, background:r.platform.color, borderRadius:3, transition:"width 0.8s" }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:txt, marginBottom:14 }}>🎯 Quick Action Plan</div>
                  {results.actionPlan.split(/\d+\.\s*/).filter(Boolean).slice(0,5).map((action, i) => (
                    <div key={i} style={{ display:"flex", gap:10, marginBottom:10, padding:"8px 10px", background:bg3, borderRadius:8 }}>
                      <div style={{ width:20, height:20, borderRadius:"50%", background:"#443DCB22", color:"#6B62E8", fontSize:11, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{i+1}</div>
                      <div style={{ fontSize:12, color:txt, lineHeight:1.5 }}>{action.trim()}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Platforms Tab */}
            {activeTab==="platforms" && (
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                {results.platforms.map(r => (
                  <div key={r.platform.id} style={{ background:bg2, border:`1px solid ${r.mentioned?r.platform.color+"33":bdr}`, borderRadius:12, padding:20 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
                      <div style={{ fontSize:28 }}>{r.platform.icon}</div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:14, fontWeight:700, color:txt }}>{r.platform.name}</div>
                        <div style={{ fontSize:11, color:txt2 }}>{r.platform.desc}</div>
                      </div>
                      <div style={{ textAlign:"right" }}>
                        <div style={{ fontSize:22, fontWeight:700, color:scoreColor(r.score) }}>{r.score}/100</div>
                        <div style={{ fontSize:11, padding:"2px 8px", borderRadius:6, background:posColor(r.position)+"22", color:posColor(r.position) }}>{posLabel(r.position)}</div>
                      </div>
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                      {r.sample && (
                        <div style={{ background:bg3, borderRadius:8, padding:12, gridColumn:"1/-1" }}>
                          <div style={{ fontSize:11, color:txt3, marginBottom:4 }}>💬 Sample AI Response:</div>
                          <div style={{ fontSize:12, color:txt, lineHeight:1.6, fontStyle:"italic" }}>"{r.sample}"</div>
                        </div>
                      )}
                      {r.recommendation && (
                        <div style={{ background:"#443DCB11", border:"1px solid #443DCB33", borderRadius:8, padding:12 }}>
                          <div style={{ fontSize:11, color:"#6B62E8", marginBottom:4 }}>💡 Recommendation:</div>
                          <div style={{ fontSize:12, color:txt, lineHeight:1.5 }}>{r.recommendation}</div>
                        </div>
                      )}
                      {r.strengths && (
                        <div style={{ background:bg3, borderRadius:8, padding:12 }}>
                          <div style={{ fontSize:11, color:txt3, marginBottom:4 }}>📈 Analysis:</div>
                          <div style={{ fontSize:12, color:txt, lineHeight:1.5 }}>{r.strengths}</div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Queries Tab */}
            {activeTab==="queries" && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:txt, marginBottom:14 }}>🔍 Top AI Queries to Target</div>
                  {results.topQueries.map((q, i) => (
                    <div key={i} style={{ display:"flex", gap:10, padding:"10px 12px", background:bg3, borderRadius:8, marginBottom:8, alignItems:"flex-start" }}>
                      <span style={{ fontSize:11, background:"#443DCB22", color:"#6B62E8", padding:"2px 6px", borderRadius:4, flexShrink:0, fontWeight:600 }}>Q{i+1}</span>
                      <span style={{ fontSize:12, color:txt, lineHeight:1.5 }}>{q}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:txt, marginBottom:12 }}>📝 Content Gaps</div>
                    <div style={{ fontSize:12, color:txt, lineHeight:1.7 }}>{results.contentGaps}</div>
                  </div>
                  <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:txt, marginBottom:12 }}>🏆 Authority Signals Needed</div>
                    <div style={{ fontSize:12, color:txt, lineHeight:1.7 }}>{results.authoritySignals}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Strategy Tab */}
            {activeTab==="strategy" && (
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:txt, marginBottom:14 }}>⚔️ Competitor Advantage Analysis</div>
                  <div style={{ fontSize:13, color:txt, lineHeight:1.8 }}>{results.competitorAdvantage}</div>
                </div>
                <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:txt, marginBottom:14 }}>🗺️ 30-Day GEO Action Plan</div>
                  {results.actionPlan.split(/\d+\.\s*/).filter(Boolean).map((action, i) => (
                    <div key={i} style={{ display:"flex", gap:12, marginBottom:12, padding:"12px 14px", background:bg3, borderRadius:8, alignItems:"flex-start" }}>
                      <div style={{ width:24, height:24, borderRadius:"50%", background:"#443DCB", color:"#fff", fontSize:12, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{i+1}</div>
                      <div style={{ fontSize:13, color:txt, lineHeight:1.6 }}>{action.trim()}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ fontSize:11, color:txt3, marginTop:16, textAlign:"center" }}>
              Analysis generated: {results.timestamp} · Powered by {model === "groq" ? "Groq" : "Gemini"} AI
            </div>
          </>
        )}

        {!results && !loading && (
          <div style={{ textAlign:"center", padding:60, color:txt3 }}>
            <div style={{ fontSize:48, marginBottom:16 }}>🔍</div>
            <div style={{ fontSize:16, color:txt, fontWeight:600, marginBottom:8 }}>Track Your Brand in AI Responses</div>
            <div style={{ fontSize:13, color:txt2, marginBottom:24 }}>See how ChatGPT, Gemini, Perplexity, Claude & Copilot mention your brand</div>
            <div style={{ display:"flex", gap:10, justifyContent:"center", flexWrap:"wrap" }}>
              {AI_PLATFORMS.map(p => (
                <div key={p.id} style={{ padding:"6px 14px", borderRadius:20, fontSize:12, background:p.color+"22", color:p.color, border:`1px solid ${p.color}44` }}>
                  {p.icon} {p.name}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* History */}
        {history.length > 0 && !loading && (
          <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:16, marginTop:16 }}>
            <div style={{ fontSize:12, color:txt2, marginBottom:10, fontWeight:600 }}>Recent Analyses</div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {history.map((h,i) => (
                <div key={i} style={{ padding:"6px 12px", borderRadius:8, background:bg3, border:`1px solid ${bdr}`, fontSize:11 }}>
                  <span style={{ color:txt, fontWeight:600 }}>{h.brand}</span>
                  <span style={{ color:txt2 }}> · {h.keyword} · </span>
                  <span style={{ color:scoreColor(h.score), fontWeight:600 }}>{h.score}/100</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}