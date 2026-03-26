/**
 * PrintReport — White-label PDF-ready SEO Report
 * Opens in new window → user clicks Print → Save as PDF
 */
export default function PrintReport({ client, state }) {
  const audit    = state.A2_audit    || {};
  const keywords = state.A3_keywords || {};
  const comp     = state.A4_competitor || {};
  const onpage   = state.A6_onpage   || {};
  const geo      = state.A8_geo      || {};
  const report   = state.A9_report   || {};

  const issueColor = { p1:"#DC2626", p2:"#D97706", p3:"#6B7280" };
  const scoreColor = s => s >= 80 ? "#059669" : s >= 50 ? "#D97706" : "#DC2626";

  return (
    <div style={{ fontFamily:"'Segoe UI',Arial,sans-serif", color:"#1a1a18", background:"#fff", maxWidth:900, margin:"0 auto", padding:"40px 48px" }}>

      {/* Cover */}
      <div style={{ borderBottom:"3px solid #7C3AED", paddingBottom:32, marginBottom:40 }}>
        <div style={{ fontSize:11, color:"#7C3AED", fontWeight:700, letterSpacing:2, textTransform:"uppercase", marginBottom:8 }}>SEO Audit Report</div>
        <div style={{ fontSize:32, fontWeight:800, color:"#1a1a18", marginBottom:4 }}>{client?.name}</div>
        <div style={{ fontSize:16, color:"#555", marginBottom:16 }}>{client?.website}</div>
        <div style={{ display:"flex", gap:32 }}>
          <div><div style={{ fontSize:11, color:"#888" }}>Generated</div><div style={{ fontSize:13, fontWeight:600 }}>{new Date().toLocaleDateString("en-IN", { day:"numeric", month:"long", year:"numeric" })}</div></div>
          <div><div style={{ fontSize:11, color:"#888" }}>Industry</div><div style={{ fontSize:13, fontWeight:600 }}>{client?.industry || "—"}</div></div>
          <div><div style={{ fontSize:11, color:"#888" }}>Location</div><div style={{ fontSize:13, fontWeight:600 }}>{(client?.targetLocations||[]).join(", ") || "—"}</div></div>
        </div>
      </div>

      {/* Executive Summary */}
      <Section title="Executive Summary">
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginBottom:20 }}>
          {[
            { l:"Health Score", v: audit.healthScore ? `${audit.healthScore}/100` : "—", c: scoreColor(audit.healthScore||0) },
            { l:"Critical Issues", v: audit.summary?.p1Count ?? "—", c:"#DC2626" },
            { l:"Keywords Mapped", v: keywords.totalKeywords ?? "—", c:"#7C3AED" },
            { l:"Pages Crawled", v: audit.summary?.pagesCrawled ?? 1, c:"#0891B2" },
          ].map(i => (
            <div key={i.l} style={{ border:`1px solid #e0e0e0`, borderRadius:8, padding:"14px 12px", textAlign:"center", borderTop:`3px solid ${i.c}` }}>
              <div style={{ fontSize:26, fontWeight:800, color:i.c }}>{i.v}</div>
              <div style={{ fontSize:10, color:"#888", marginTop:4 }}>{i.l}</div>
            </div>
          ))}
        </div>

        {/* Health bar */}
        {audit.healthScore && (
          <div style={{ marginBottom:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
              <span style={{ fontSize:12, color:"#555" }}>Site Health Score</span>
              <span style={{ fontSize:14, fontWeight:700, color:scoreColor(audit.healthScore) }}>{audit.healthScore}/100</span>
            </div>
            <div style={{ background:"#f0f0f0", borderRadius:20, height:10, overflow:"hidden" }}>
              <div style={{ width:`${audit.healthScore}%`, height:"100%", background:scoreColor(audit.healthScore), borderRadius:20 }} />
            </div>
          </div>
        )}

        {/* SERP Preview */}
        {onpage.serpPreview?.title && (
          <div style={{ border:"1px solid #e0e0e0", borderRadius:8, padding:"14px 16px", background:"#fafafa" }}>
            <div style={{ fontSize:10, color:"#888", marginBottom:6, textTransform:"uppercase", letterSpacing:1 }}>Google Search Preview</div>
            <div style={{ fontSize:12, color:"#006621" }}>{onpage.serpPreview.urlDisplay}</div>
            <div style={{ fontSize:18, color:"#1a0dab", margin:"4px 0" }}>{onpage.serpPreview.titleDisplay}</div>
            <div style={{ fontSize:13, color:"#545454", lineHeight:1.5 }}>{onpage.serpPreview.descDisplay}</div>
          </div>
        )}

        {/* AI Verdict */}
        {report.reportData?.verdict && (
          <div style={{ background:"#7C3AED11", borderLeft:"4px solid #7C3AED", borderRadius:"0 8px 8px 0", padding:"12px 16px", marginTop:16 }}>
            <div style={{ fontSize:10, color:"#7C3AED", fontWeight:700, marginBottom:4, textTransform:"uppercase" }}>AI SEO Verdict</div>
            <div style={{ fontSize:13, color:"#1a1a18", lineHeight:1.6 }}>{report.reportData.verdict}</div>
          </div>
        )}
      </Section>

      {/* Technical Issues */}
      <Section title="Technical Issues Found">
        {["p1","p2","p3"].map(tier => (
          (audit.issues?.[tier]||[]).length > 0 && (
            <div key={tier} style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:issueColor[tier], textTransform:"uppercase", marginBottom:8 }}>
                {tier === "p1" ? "🔴 Critical" : tier === "p2" ? "🟡 Important" : "⚪ Minor"} — {(audit.issues[tier]||[]).length} issue(s)
              </div>
              {(audit.issues[tier]||[]).map((issue,i) => (
                <div key={i} style={{ borderLeft:`3px solid ${issueColor[tier]}`, padding:"8px 12px", marginBottom:6, background:`${issueColor[tier]}08`, borderRadius:"0 6px 6px 0" }}>
                  <div style={{ fontSize:12, fontWeight:600 }}>{issue.detail}</div>
                  <div style={{ fontSize:11, color:"#059669", marginTop:2 }}>→ Fix: {issue.fix}</div>
                </div>
              ))}
            </div>
          )
        ))}

        {/* Multi-page summary */}
        {(audit.checks?.pageAudits||[]).length > 0 && (
          <div style={{ marginTop:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#0891B2", textTransform:"uppercase", marginBottom:8 }}>Inner Pages Audited</div>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
              <thead>
                <tr style={{ background:"#f5f5f5" }}>
                  {["URL","Title","H1","Meta","Issues"].map(h => <th key={h} style={{ padding:"6px 8px", textAlign:"left", borderBottom:"1px solid #e0e0e0", fontWeight:600 }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {audit.checks.pageAudits.map((pg,i) => (
                  <tr key={i} style={{ borderBottom:"1px solid #f0f0f0" }}>
                    <td style={{ padding:"6px 8px", color:"#0891B2", wordBreak:"break-all", maxWidth:200 }}>{pg.url.replace(/^https?:\/\/[^/]+/,"") || "/"}</td>
                    <td style={{ padding:"6px 8px", color: pg.title==="(missing)"?"#DC2626":"#1a1a18" }}>{pg.title?.slice(0,40)}{pg.title?.length>40?"...":""}</td>
                    <td style={{ padding:"6px 8px", textAlign:"center" }}>{pg.hasH1 ? "✅" : "❌"}</td>
                    <td style={{ padding:"6px 8px", textAlign:"center" }}>{pg.hasMeta ? "✅" : "❌"}</td>
                    <td style={{ padding:"6px 8px", textAlign:"center", color:pg.issues>0?"#DC2626":"#059669" }}>{pg.issues}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Broken Links */}
        {(audit.checks?.brokenLinks||[]).length > 0 && (
          <div style={{ marginTop:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#DC2626", textTransform:"uppercase", marginBottom:8 }}>Broken Links ({audit.checks.brokenLinks.length})</div>
            {audit.checks.brokenLinks.map((l,i) => (
              <div key={i} style={{ fontSize:10, padding:"4px 8px", background:"#DC262608", borderRadius:4, marginBottom:3, display:"flex", justifyContent:"space-between" }}>
                <span style={{ wordBreak:"break-all" }}>{l.url}</span>
                <span style={{ color:"#DC2626", fontWeight:700, marginLeft:8 }}>{l.status}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Keyword Strategy */}
      <Section title="Keyword Strategy">
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:16 }}>
          {[
            { l:"Total Keywords", v:keywords.totalKeywords||0, c:"#7C3AED" },
            { l:"Content Gaps", v:(keywords.gaps||[]).length, c:"#DC2626" },
            { l:"Cannibalization Risks", v:(keywords.cannibalization||[]).length, c:"#D97706" },
          ].map(i => (
            <div key={i.l} style={{ border:`1px solid #e0e0e0`, borderRadius:8, padding:"12px", textAlign:"center" }}>
              <div style={{ fontSize:22, fontWeight:700, color:i.c }}>{i.v}</div>
              <div style={{ fontSize:10, color:"#888" }}>{i.l}</div>
            </div>
          ))}
        </div>

        {/* Top keywords table */}
        {(keywords.keywordMap||[]).filter(k=>k.priority==="high").length > 0 && (
          <>
            <div style={{ fontSize:11, fontWeight:700, color:"#7C3AED", textTransform:"uppercase", marginBottom:8 }}>High Priority Keywords</div>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
              <thead>
                <tr style={{ background:"#f5f5f5" }}>
                  {["Keyword","Intent","Difficulty","Target Page"].map(h => <th key={h} style={{ padding:"6px 8px", textAlign:"left", borderBottom:"1px solid #e0e0e0", fontWeight:600 }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {keywords.keywordMap.filter(k=>k.priority==="high").slice(0,12).map((k,i) => (
                  <tr key={i} style={{ borderBottom:"1px solid #f0f0f0" }}>
                    <td style={{ padding:"6px 8px", fontWeight:500 }}>{k.keyword}</td>
                    <td style={{ padding:"6px 8px" }}><span style={{ fontSize:10, padding:"2px 6px", borderRadius:8, background:"#7C3AED22", color:"#7C3AED" }}>{k.intent}</span></td>
                    <td style={{ padding:"6px 8px" }}>{k.difficulty}</td>
                    <td style={{ padding:"6px 8px", color:"#0891B2" }}>{k.suggestedPage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* Cannibalization */}
        {(keywords.cannibalization||[]).length > 0 && (
          <div style={{ marginTop:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#D97706", textTransform:"uppercase", marginBottom:8 }}>⚠️ Keyword Cannibalization Risks</div>
            {keywords.cannibalization.map((c,i) => (
              <div key={i} style={{ borderLeft:"3px solid #D97706", padding:"8px 12px", marginBottom:8, background:"#D9770608", borderRadius:"0 6px 6px 0" }}>
                <div style={{ fontSize:12, fontWeight:600 }}>{c.page} — {c.keywordCount} keywords competing ({c.risk} risk)</div>
                <div style={{ fontSize:11, color:"#555", margin:"4px 0" }}>Keywords: {c.keywords.join(", ")}</div>
                <div style={{ fontSize:11, color:"#059669" }}>→ {c.fix}</div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* On-Page Fixes */}
      {(onpage.fixQueue||[]).length > 0 && (
        <Section title="On-Page Fix Queue">
          {onpage.fixQueue.map((fix,i) => (
            <div key={i} style={{ borderLeft:`3px solid ${issueColor[fix.priority]||"#6B7280"}`, padding:"8px 12px", marginBottom:8, background:`${issueColor[fix.priority]||"#6B7280"}08`, borderRadius:"0 6px 6px 0" }}>
              <div style={{ display:"flex", justifyContent:"space-between" }}>
                <span style={{ fontSize:12, fontWeight:600 }}>{fix.type?.replace(/_/g," ").toUpperCase()}</span>
                <span style={{ fontSize:10, color:"#888" }}>{fix.page} · {fix.priority?.toUpperCase()}</span>
              </div>
              <div style={{ fontSize:11, color:"#DC2626", marginTop:2 }}>Current: {fix.current}</div>
              <div style={{ fontSize:11, color:"#059669" }}>→ {fix.recommended}</div>
            </div>
          ))}
        </Section>
      )}

      {/* Internal Link Plan */}
      {(onpage.internalLinks||[]).length > 0 && (
        <Section title="Internal Link Opportunities">
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
            <thead>
              <tr style={{ background:"#f5f5f5" }}>
                {["From Page","To Page","Anchor Text","Why"].map(h => <th key={h} style={{ padding:"6px 8px", textAlign:"left", borderBottom:"1px solid #e0e0e0", fontWeight:600 }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {onpage.internalLinks.map((l,i) => (
                <tr key={i} style={{ borderBottom:"1px solid #f0f0f0" }}>
                  <td style={{ padding:"6px 8px", color:"#0891B2" }}>{l.fromPage}</td>
                  <td style={{ padding:"6px 8px", color:"#0891B2" }}>{l.toPage}</td>
                  <td style={{ padding:"6px 8px", fontWeight:500, color:"#7C3AED" }}>"{l.anchorText}"</td>
                  <td style={{ padding:"6px 8px", color:"#555", fontSize:10 }}>{l.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Competitor Intelligence */}
      {comp.analysis?.strategicSummary && (
        <Section title="Competitor Intelligence">
          <div style={{ background:"#f5f5f5", borderRadius:8, padding:12, marginBottom:12, fontSize:12, lineHeight:1.6 }}>{comp.analysis.strategicSummary}</div>
          {(comp.analysis?.quickWins||[]).slice(0,5).map((w,i) => (
            <div key={i} style={{ borderLeft:"3px solid #059669", padding:"8px 12px", marginBottom:6, background:"#05966908", borderRadius:"0 6px 6px 0" }}>
              <div style={{ fontSize:12, fontWeight:600 }}>{w.action}</div>
              <div style={{ fontSize:11, color:"#555" }}>Keyword: {w.keyword} → {w.expectedOutcome}</div>
            </div>
          ))}
        </Section>
      )}

      {/* Top 3 Priorities from A9 */}
      {(report.reportData?.next3Actions||[]).length > 0 && (
        <Section title="Top 3 SEO Priorities — Immediate Action">
          {report.reportData.next3Actions.map((a,i) => (
            <div key={i} style={{ border:"1px solid #e0e0e0", borderRadius:8, padding:"14px 16px", marginBottom:12 }}>
              <div style={{ fontSize:14, fontWeight:700, color:"#1a1a18", marginBottom:4 }}>{i+1}. {a.action}</div>
              <div style={{ fontSize:12, color:"#555", marginBottom:4 }}>{a.why}</div>
              {a.how && <div style={{ fontSize:11, color:"#0891B2" }}>How: {a.how}</div>}
            </div>
          ))}
        </Section>
      )}

      {/* Footer */}
      <div style={{ borderTop:"2px solid #e0e0e0", paddingTop:20, marginTop:40, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ fontSize:11, color:"#888" }}>Generated by SEO AI Agent · {new Date().toLocaleDateString()}</div>
        <div style={{ fontSize:11, color:"#888" }}>Confidential — {client?.name}</div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom:36 }}>
      <div style={{ fontSize:16, fontWeight:800, color:"#1a1a18", borderBottom:"2px solid #7C3AED", paddingBottom:8, marginBottom:16 }}>{title}</div>
      {children}
    </div>
  );
}
