import { useState } from "react";
import { callAIBackend } from "./utils/callAI";

export default function ReadabilityChecker({ dark, keys, model, getToken }) {
  const [content, setContent]     = useState("");
  const [keyword, setKeyword]     = useState("");
  const [loading, setLoading]     = useState(false);
  const [results, setResults]     = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState("");
  const [copied, setCopied]       = useState(null);

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const txt3 = dark ? "#444"    : "#bbb";

  // ── Local readability calculations ──
  function analyzeLocally(text) {
    const words     = text.trim().split(/\s+/).filter(Boolean);
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 3);
    const paragraphs= text.split(/\n\n+/).filter(p => p.trim().length > 0);

    const wordCount    = words.length;
    const sentCount    = sentences.length || 1;
    const paraCount    = paragraphs.length || 1;
    const charCount    = text.replace(/\s/g, "").length;
    const avgWordLen   = wordCount > 0 ? (charCount / wordCount).toFixed(1) : 0;
    const avgSentLen   = wordCount > 0 ? (wordCount / sentCount).toFixed(1) : 0;
    const avgParaLen   = wordCount > 0 ? (wordCount / paraCount).toFixed(1) : 0;
    const readingTime  = Math.ceil(wordCount / 200);

    // Flesch Reading Ease
    const syllables = words.reduce((sum, word) => sum + countSyllables(word), 0);
    const avgSyllables = syllables / (wordCount || 1);
    const flesch = Math.round(206.835 - 1.015 * (wordCount / sentCount) - 84.6 * avgSyllables);
    const fleschClamped = Math.max(0, Math.min(100, flesch));

    // Long sentences (>25 words)
    const longSentences = sentences.filter(s => s.trim().split(/\s+/).length > 25).length;
    const longSentPct   = Math.round((longSentences / sentCount) * 100);

    // Passive voice (simple check)
    const passivePatterns = /\b(is|are|was|were|be|been|being)\s+\w+ed\b/gi;
    const passiveMatches  = (text.match(passivePatterns) || []).length;
    const passivePct      = Math.round((passiveMatches / sentCount) * 100);

    // Transition words
    const transitions = ["however","therefore","furthermore","additionally","moreover","consequently","meanwhile","nevertheless","subsequently","accordingly","in addition","as a result","on the other hand","in contrast","for example","for instance","in conclusion","to summarize","first","second","third","finally","lastly"];
    const transCount = transitions.filter(t => text.toLowerCase().includes(t)).length;

    // Keyword density
    let kwDensity = 0;
    if (keyword.trim()) {
      const kwRegex = new RegExp(`\\b${keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, "gi");
      const kwMatches = (text.match(kwRegex) || []).length;
      kwDensity = wordCount > 0 ? ((kwMatches / wordCount) * 100).toFixed(2) : 0;
    }

    // Heading count
    const h1Count = (text.match(/^#\s/gm) || []).length;
    const h2Count = (text.match(/^##\s/gm) || []).length;
    const h3Count = (text.match(/^###\s/gm) || []).length;

    // Overall score
    let score = 0;
    if (fleschClamped >= 60) score += 25;
    else if (fleschClamped >= 40) score += 15;
    else score += 5;
    if (longSentPct <= 20) score += 20; else if (longSentPct <= 40) score += 10;
    if (passivePct <= 10) score += 15; else if (passivePct <= 25) score += 8;
    if (transCount >= 5) score += 15; else if (transCount >= 2) score += 8;
    if (avgSentLen <= 20) score += 15; else if (avgSentLen <= 25) score += 8;
    if (h2Count >= 2) score += 10;
    if (wordCount >= 300) score += 10;

    const gradeLevel = flesch >= 90 ? "5th Grade" : flesch >= 70 ? "7th Grade" : flesch >= 60 ? "8-9th Grade" : flesch >= 50 ? "10-12th Grade" : flesch >= 30 ? "College" : "Graduate";

    return {
      wordCount, sentCount, paraCount, charCount,
      avgWordLen, avgSentLen, avgParaLen, readingTime,
      flesch: fleschClamped, gradeLevel,
      longSentPct, passivePct, transCount,
      kwDensity, h1Count, h2Count, h3Count,
      score: Math.min(100, score),
    };
  }

  function countSyllables(word) {
    word = word.toLowerCase().replace(/[^a-z]/g, "");
    if (word.length <= 3) return 1;
    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
    word = word.replace(/^y/, "");
    const matches = word.match(/[aeiouy]{1,2}/g);
    return matches ? matches.length : 1;
  }

  function runAnalysis() {
    if (!content.trim()) return;
    setLoading(true);
    setTimeout(() => {
      const r = analyzeLocally(content);
      setResults(r);
      setLoading(false);
    }, 300);
  }

  async function getAISuggestions() {
    if (!content.trim()) return;
    if (!getToken) return;
    setAiLoading(true);

    const stats = results || analyzeLocally(content);
    const prompt = `You are an expert content readability specialist. Analyze this content and give specific improvement suggestions:

Content (first 1000 chars): "${content.slice(0, 1000)}"
Keyword: "${keyword || "not specified"}"

Current Stats:
- Flesch Score: ${stats.flesch}/100 (${stats.gradeLevel})
- Avg Sentence Length: ${stats.avgSentLen} words
- Long Sentences: ${stats.longSentPct}%
- Passive Voice: ${stats.passivePct}%
- Transition Words: ${stats.transCount}
- Readability Score: ${stats.score}/100

Provide:
1. TOP 3 ISSUES — exact problems with example sentences from the content
2. REWRITE EXAMPLES — rewrite 2 problematic sentences to be clearer
3. QUICK FIXES — 5 specific, actionable things to do right now
4. SENTENCE STRUCTURE TIPS — for this specific content
5. KEYWORD OPTIMIZATION — keyword density analysis and suggestions
6. GRADE LEVEL TARGET — what grade level this content should be and why

    Be very specific. Reference actual sentences from the content.`;

    try {
      const text = await callAIBackend(prompt, model, getToken) || "";
      setAiSuggestions(text);
    } catch(e) { console.error(e); }
    setAiLoading(false);
  }

  const scoreColor  = s => s >= 70 ? "#059669" : s >= 50 ? "#D97706" : "#DC2626";
  const scoreLabel  = s => s >= 70 ? "Good" : s >= 50 ? "Needs Work" : "Poor";
  const fleschLabel = s => s >= 70 ? "Easy to Read" : s >= 50 ? "Fairly Difficult" : "Difficult";
  const fleschColor = s => s >= 70 ? "#059669" : s >= 50 ? "#D97706" : "#DC2626";

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 24, background: bg }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: txt, marginBottom: 4 }}>📖 Content Readability Checker</div>
        <div style={{ fontSize: 13, color: txt2, marginBottom: 20 }}>
          Flesch score · Sentence analysis · Passive voice · Keyword density · AI suggestions
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

          {/* Left: Input */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 12, color: txt2, marginBottom: 6, fontWeight: 600 }}>Target Keyword (optional)</div>
              <input value={keyword} onChange={e => setKeyword(e.target.value)}
                placeholder="e.g. SEO tools"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${bdr}`, background: bg3, color: txt, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>

            <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16, flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: txt2, fontWeight: 600 }}>Paste Your Content <span style={{ color: "#DC2626" }}>*</span></div>
                <span style={{ fontSize: 11, color: txt3 }}>{content.split(/\s+/).filter(Boolean).length} words</span>
              </div>
              <textarea value={content} onChange={e => setContent(e.target.value)}
                placeholder="Paste your blog post, article, product description or any content here..."
                rows={14}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${bdr}`, background: bg3, color: txt, fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>

            <button onClick={runAnalysis} disabled={loading || !content.trim()}
              style={{ padding: "11px", borderRadius: 10, border: "none", background: loading || !content.trim() ? "#333" : "#443DCB", color: loading || !content.trim() ? txt3 : "#fff", fontWeight: 700, fontSize: 14, cursor: loading || !content.trim() ? "not-allowed" : "pointer" }}>
              {loading ? "📖 Analyzing..." : "📖 Check Readability"}
            </button>
          </div>

          {/* Right: Results */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {results ? (
              <>
                {/* Overall Score */}
                <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 20, textAlign: "center", borderTop: `4px solid ${scoreColor(results.score)}` }}>
                  <div style={{ fontSize: 48, fontWeight: 800, color: scoreColor(results.score), lineHeight: 1 }}>{results.score}</div>
                  <div style={{ fontSize: 13, color: txt2, marginTop: 4 }}>Readability Score</div>
                  <div style={{ fontSize: 12, color: scoreColor(results.score), fontWeight: 600, marginTop: 4 }}>{scoreLabel(results.score)}</div>
                  <div style={{ height: 8, borderRadius: 4, background: bg3, overflow: "hidden", marginTop: 12 }}>
                    <div style={{ height: "100%", width: `${results.score}%`, background: `linear-gradient(90deg, #DC2626, #D97706, #059669)`, borderRadius: 4 }} />
                  </div>
                </div>

                {/* Flesch Score */}
                <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: txt }}>📊 Flesch Reading Ease</div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: fleschColor(results.flesch) }}>{results.flesch}</div>
                      <div style={{ fontSize: 10, color: txt2 }}>{results.gradeLevel}</div>
                    </div>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: bg3, overflow: "hidden", marginBottom: 6 }}>
                    <div style={{ height: "100%", width: `${results.flesch}%`, background: fleschColor(results.flesch), borderRadius: 3 }} />
                  </div>
                  <div style={{ fontSize: 11, color: fleschColor(results.flesch), fontWeight: 500 }}>{fleschLabel(results.flesch)}</div>
                  <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 10, color: txt3 }}>
                    <span>90-100: Very Easy</span>
                    <span>70-90: Easy</span>
                    <span>60-70: Standard</span>
                    <span>0-60: Difficult</span>
                  </div>
                </div>

                {/* Key Metrics */}
                <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: txt, marginBottom: 12 }}>📈 Key Metrics</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {[
                      { label: "Word Count",     value: results.wordCount,                          color: "#443DCB" },
                      { label: "Reading Time",   value: `${results.readingTime} min`,               color: "#0891B2" },
                      { label: "Sentences",      value: results.sentCount,                          color: "#059669" },
                      { label: "Paragraphs",     value: results.paraCount,                          color: "#D97706" },
                      { label: "Avg Sentence",   value: `${results.avgSentLen} words`,              color: results.avgSentLen <= 20 ? "#059669" : "#D97706" },
                      { label: "Long Sentences", value: `${results.longSentPct}%`,                  color: results.longSentPct <= 20 ? "#059669" : "#DC2626" },
                      { label: "Passive Voice",  value: `${results.passivePct}%`,                   color: results.passivePct <= 10 ? "#059669" : "#D97706" },
                      { label: "Transitions",    value: results.transCount,                         color: results.transCount >= 5 ? "#059669" : "#D97706" },
                    ].map(m => (
                      <div key={m.label} style={{ background: bg3, borderRadius: 8, padding: "8px 10px" }}>
                        <div style={{ fontSize: 11, color: txt2, marginBottom: 2 }}>{m.label}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: m.color }}>{m.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Keyword + Headings */}
                <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: txt, marginBottom: 10 }}>🔑 SEO Signals</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {keyword && (
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${bdr}33` }}>
                        <span style={{ fontSize: 12, color: txt2 }}>Keyword Density</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: results.kwDensity >= 0.5 && results.kwDensity <= 2.5 ? "#059669" : "#D97706" }}>{results.kwDensity}%</span>
                      </div>
                    )}
                    {[
                      { label: "H1 Headings", value: results.h1Count, good: results.h1Count === 1 },
                      { label: "H2 Headings", value: results.h2Count, good: results.h2Count >= 2 },
                      { label: "H3 Headings", value: results.h3Count, good: true },
                    ].map(h => (
                      <div key={h.label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${bdr}33` }}>
                        <span style={{ fontSize: 12, color: txt2 }}>{h.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: h.good ? "#059669" : "#D97706" }}>{h.value} {h.good ? "✅" : "⚠️"}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Issues */}
                <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: txt, marginBottom: 10 }}>⚠️ Issues to Fix</div>
                  {[
                    { cond: results.flesch < 60,        msg: "Flesch score too low — simplify your sentences", icon: "❌" },
                    { cond: results.longSentPct > 25,   msg: `${results.longSentPct}% sentences are too long — break them up`, icon: "❌" },
                    { cond: results.passivePct > 20,    msg: `Too much passive voice (${results.passivePct}%) — use active voice`, icon: "⚠️" },
                    { cond: results.transCount < 3,     msg: "Add more transition words for better flow", icon: "⚠️" },
                    { cond: results.h2Count < 2,        msg: "Add more H2 headings to structure content", icon: "⚠️" },
                    { cond: keyword && results.kwDensity > 3, msg: `Keyword density ${results.kwDensity}% is too high — keyword stuffing risk`, icon: "❌" },
                    { cond: keyword && results.kwDensity < 0.5 && results.wordCount > 100, msg: `Keyword density ${results.kwDensity}% is too low — use keyword more naturally`, icon: "⚠️" },
                  ].filter(i => i.cond).map((issue, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, padding: "6px 0", borderBottom: `1px solid ${bdr}22`, fontSize: 12, color: txt2 }}>
                      <span>{issue.icon}</span><span>{issue.msg}</span>
                    </div>
                  ))}
                  {[
                    results.flesch >= 60, results.longSentPct <= 25,
                    results.passivePct <= 20, results.transCount >= 3, results.h2Count >= 2,
                  ].every(Boolean) && (
                    <div style={{ fontSize: 12, color: "#059669", fontWeight: 600 }}>✅ No major issues found!</div>
                  )}
                </div>

                {/* AI Suggestions Button */}
                <button onClick={getAISuggestions} disabled={aiLoading || (!keys?.groq && !keys?.gemini)}
                  style={{ padding: "11px", borderRadius: 10, border: "none", background: aiLoading ? "#333" : "#059669", color: "#fff", fontWeight: 700, fontSize: 13, cursor: aiLoading ? "not-allowed" : "pointer" }}>
                  {aiLoading ? "🤖 Getting AI suggestions..." : "🤖 Get AI Improvement Suggestions"}
                </button>

                {aiSuggestions && (
                  <div style={{ background: bg2, border: `1px solid #05966933`, borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ padding: "12px 16px", background: "#05966911", borderBottom: "1px solid #05966933", display: "flex", justifyContent: "space-between" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: txt }}>🤖 AI Suggestions</div>
                      <button onClick={() => { navigator.clipboard.writeText(aiSuggestions); setCopied("ai"); setTimeout(() => setCopied(null), 2000); }}
                        style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid #05966933", background: "transparent", color: copied === "ai" ? "#059669" : txt2, fontSize: 11, cursor: "pointer" }}>
                        {copied === "ai" ? "✅" : "📋 Copy"}
                      </button>
                    </div>
                    <div style={{ padding: 16 }}>
                      <div style={{ fontSize: 12, color: txt, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{aiSuggestions}</div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: 40, textAlign: "center" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📖</div>
                <div style={{ fontSize: 15, color: txt, fontWeight: 600, marginBottom: 8 }}>Paste content to analyze</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, textAlign: "left", marginTop: 20 }}>
                  {["Flesch Reading Ease score","Grade level analysis","Sentence length check","Passive voice detection","Transition words count","Keyword density","Heading structure","AI improvement tips"].map((f, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: txt2 }}>
                      <span style={{ color: "#059669" }}>✓</span>{f}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
