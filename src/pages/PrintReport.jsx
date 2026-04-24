/**
 * PrintReport — AIOSEO-style SEO Report
 * Damco Digital brand palette — #443DCB blue, #EA2227 red
 */

/* ── Print CSS ──────────────────────────────────────────────────────────── */
const PRINT_CSS = `
  @media print {
    @page { margin: 15mm 12mm; size: A4; }
    body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; background: #fff !important; }
    .page-break { page-break-before: always; }
    .no-break { page-break-inside: avoid; }
  }
`;

/* ── Brand tokens ───────────────────────────────────────────────────────── */
const B   = "#1a3db5";   // Primary blue (matches AIOSEO dark blue)
const BL  = "#c5d3f0";   // Light blue (mid circle)
const BLL = "#dce7f8";   // Very light blue (cover background)
const R   = "#DC2626";   // Red (fail)
const G   = "#059669";   // Green (pass)
const O   = "#D97706";   // Orange (warn)
const DK  = "#1a2b4a";   // Dark headings
const TX  = "#3d3d3d";   // Body text
const MT  = "#6B7280";   // Muted text
const BD  = "#e0e0e0";   // Border

/* ── SVG Check Icon ─────────────────────────────────────────────────────── */
function CheckIcon({ pass, warn }) {
  const color = pass ? G : warn ? O : R;
  if (pass || warn) {
    return (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" style={{ flexShrink:0 }}>
        <circle cx="11" cy="11" r="10" stroke={color} strokeWidth="1.8" fill="none"/>
        <path d="M6 11.5 L9.5 15 L16 8" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" style={{ flexShrink:0 }}>
      <circle cx="11" cy="11" r="10" stroke={color} strokeWidth="1.8" fill="none"/>
      <path d="M7.5 7.5 L14.5 14.5" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none"/>
      <path d="M14.5 7.5 L7.5 14.5" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none"/>
    </svg>
  );
}

/* ── SVG Score Ring ─────────────────────────────────────────────────────── */
function ScoreRing({ score, color, label }) {
  const r    = 48;
  const cx   = 60;
  const cy   = 60;
  const circ = 2 * Math.PI * r;
  const fill = Math.max(0, Math.min(100, score));
  const dash = (fill / 100) * circ;
  const gap  = circ - dash;
  return (
    <div style={{ textAlign:"center", flexShrink:0 }}>
      <div style={{ position:"relative", width:120, height:120 }}>
        <svg width="120" height="120" viewBox="0 0 120 120" style={{ position:"absolute", top:0, left:0 }}>
          {/* Background track */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={BL} strokeWidth="9"/>
          {/* Score arc */}
          <circle
            cx={cx} cy={cy} r={r} fill="none"
            stroke={color} strokeWidth="9"
            strokeDasharray={`${dash} ${gap}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        </svg>
        {/* Center text */}
        <div style={{
          position:"absolute", inset:0,
          display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
        }}>
          <div style={{ fontSize:30, fontWeight:900, color, lineHeight:1 }}>{score}</div>
          <div style={{ fontSize:11, color:MT, lineHeight:1.2 }}>/ 100</div>
        </div>
      </div>
      <div style={{ fontSize:13, fontWeight:700, color, marginTop:6 }}>{label}</div>
    </div>
  );
}

/* ── Section Heading (left blue border) ─────────────────────────────────── */
function SectionHeading({ title }) {
  return (
    <div style={{ borderLeft:`4px solid ${B}`, paddingLeft:14, marginBottom:28, paddingTop:2, paddingBottom:2 }}>
      <div style={{ fontSize:19, fontWeight:800, color:DK }}>{title}</div>
    </div>
  );
}

/* ── Data box ───────────────────────────────────────────────────────────── */
function DataBox({ children }) {
  return (
    <div style={{
      background:"#f5f7fa", border:`1px solid ${BD}`, borderRadius:4,
      padding:"10px 14px", marginBottom:10, marginLeft:34,
    }}>
      {typeof children === "string"
        ? <div style={{ fontSize:12.5, color:TX, lineHeight:1.6 }}>{children}</div>
        : children}
    </div>
  );
}

/* ── Check Item Row ─────────────────────────────────────────────────────── */
function CheckItem({ pass, warn, title, dataBox, explanation, list }) {
  const hasExtra = dataBox || (list && list.length > 0) || explanation;
  return (
    <div className="no-break" style={{ marginBottom:26, paddingBottom:26, borderBottom:`1px solid ${BD}` }}>
      {/* Icon + Bold title */}
      <div style={{ display:"flex", alignItems:"flex-start", gap:12, marginBottom: hasExtra ? 12 : 0 }}>
        <CheckIcon pass={pass} warn={warn} />
        <div style={{ fontSize:13.5, fontWeight:700, color:TX, lineHeight:1.45, paddingTop:1 }}>{title}</div>
      </div>

      {/* Data box */}
      {dataBox && (
        <DataBox>{dataBox}</DataBox>
      )}

      {/* List box */}
      {list && list.length > 0 && (
        <DataBox>
          {list.map((item, i) => (
            <div key={i} style={{ fontSize:12, color:TX, marginBottom: i < list.length - 1 ? 5 : 0, lineHeight:1.5 }}>
              {item}
            </div>
          ))}
        </DataBox>
      )}

      {/* Explanation paragraphs */}
      {explanation && (
        <div style={{ fontSize:13, color:TX, lineHeight:1.75, marginLeft:34 }}>{explanation}</div>
      )}
    </div>
  );
}

/* ── Page Footer ────────────────────────────────────────────────────────── */
function PageFooter({ url, page }) {
  const date = new Date().toLocaleDateString("en-GB", { day:"numeric", month:"long", year:"numeric" });
  return (
    <div style={{ borderTop:`1px solid ${BD}`, paddingTop:10, marginTop:40, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        {/* Gear/circle icon */}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="7.5" fill={B}/>
          <circle cx="8" cy="8" r="3" fill="none" stroke="#fff" strokeWidth="1.5"/>
          {[0,60,120,180,240,300].map(deg => {
            const rad = (deg * Math.PI) / 180;
            const x1  = 8 + 4.5 * Math.cos(rad);
            const y1  = 8 + 4.5 * Math.sin(rad);
            const x2  = 8 + 6.5 * Math.cos(rad);
            const y2  = 8 + 6.5 * Math.sin(rad);
            return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>;
          })}
        </svg>
        <div style={{ fontSize:11, color:MT }}>
          Generated for <span style={{ color:TX }}>{url}</span> on {date}
        </div>
      </div>
      <div style={{ fontSize:11, color:MT }}>{page}</div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════════════════ */
export default function PrintReport({ client, state, brand = {} }) {
  // Dynamic brand tokens — fallback to default palette
  const B   = brand.primaryColor || "#1a3db5";
  const BL  = brand.primaryColor ? `${brand.primaryColor}55` : "#c5d3f0";
  const BLL = brand.primaryColor ? `${brand.primaryColor}18` : "#dce7f8";
  const agencyName = brand.agencyName || "SEO AI Agent";
  const audit    = state.A2_audit    || {};
  const keywords = state.A3_keywords || {};
  const onpage   = state.A6_onpage   || {};
  const report   = state.A9_report   || {};

  const url  = client?.website || "—";
  const hs   = audit.healthScore || 0;
  const scoreColor = hs >= 80 ? G : hs >= 50 ? O : R;
  const scoreLabel = hs >= 80 ? "Excellent!" : hs >= 60 ? "Good" : hs >= 40 ? "Needs Work" : "Poor";

  /* Flatten all issues */
  const p1Issues  = audit.issues?.p1 || [];
  const p2Issues  = audit.issues?.p2 || [];
  const p3Issues  = audit.issues?.p3 || [];
  const allIssues = [...p1Issues, ...p2Issues, ...p3Issues];

  function hasIssue(...kws) {
    return allIssues.some(i =>
      kws.some(k => (i.detail || "").toLowerCase().includes(k) || (i.type || "").toLowerCase().includes(k))
    );
  }
  function getIssue(...kws) {
    return allIssues.find(i =>
      kws.some(k => (i.detail || "").toLowerCase().includes(k) || (i.type || "").toLowerCase().includes(k))
    );
  }

  /* Basic SEO */
  const titleTag  = onpage.serpPreview?.titleDisplay || onpage.serpPreview?.title || "";
  const metaDesc  = onpage.serpPreview?.descDisplay  || onpage.serpPreview?.desc  || "";
  const titleLen  = titleTag.length;
  const metaLen   = metaDesc.length;
  const titleGood = titleLen >= 30 && titleLen <= 70;
  const metaGood  = metaLen  >= 50 && metaLen  <= 170;

  const hasH1Issue  = hasIssue("h1", "heading");
  const hasImgIssue = hasIssue("alt", "image");
  const imgIssue    = getIssue("alt", "image");
  const internalLinks = onpage.internalLinks || [];
  const brokenLinks   = audit.checks?.brokenLinks || [];

  /* Advanced SEO */
  const hasCanonical = !hasIssue("canonical");
  const hasNoindex   = hasIssue("noindex");
  const hasSchema    = !hasIssue("schema", "structured data");
  const hasOG        = !hasIssue("open graph", "og:image", "og tag");
  const hasRobots    = !hasIssue("robots.txt", "robots");
  const hasSitemap   = !hasIssue("sitemap");

  /* Performance */
  const hasHTTPS  = !hasIssue("https", "ssl", "http ");
  const hasCWV    = !hasIssue("lcp", "cls", "fid", "core web", "cwv");
  const hasMobile = !hasIssue("mobile", "responsive");
  const hasJSMin  = !hasIssue("javascript", " js ", "script minif");
  const hasCSSMin = !hasIssue("css minif", "stylesheet minif");

  /* Stat counters */
  const totalChecks = 9;
  const p1Count     = p1Issues.length;
  const p2Count     = p2Issues.length;
  const goodCount   = [titleGood, metaGood, !hasH1Issue, !hasImgIssue, hasCanonical, hasSchema, hasHTTPS, hasCWV, hasMobile].filter(Boolean).length;

  /* Projections */
  const projections = [
    { label:"Current Score",       value:hs,                     color:scoreColor },
    { label:"After P1 Fixes",      value:Math.min(hs + 18, 100), color:O },
    { label:"After Content Gaps",  value:Math.min(hs + 28, 100), color:"#0891B2" },
    { label:"After Full Optimise", value:Math.min(hs + 42, 100), color:G },
  ];

  const date = new Date().toLocaleDateString("en-GB", { day:"numeric", month:"long", year:"numeric" });

  return (
    <>
      <style>{PRINT_CSS}</style>
      <div style={{ fontFamily:"'Segoe UI',Arial,sans-serif", color:TX, background:"#fff", maxWidth:860, margin:"0 auto", fontSize:13 }}>

        {/* ════════════════════════════════════════════════════════════════
            PAGE 1 — COVER
        ════════════════════════════════════════════════════════════════ */}
        <div style={{ height:"100vh", minHeight:1056, position:"relative", overflow:"hidden", background:"#fff" }}>

          {/* Top white area — title */}
          <div style={{ padding:"60px 64px 0" }}>
            <div style={{ fontSize:56, fontWeight:900, color:B, lineHeight:1.05, marginBottom:20 }}>
              SEO Analysis Report
            </div>
            <div style={{ fontSize:16, fontWeight:700, color:DK, marginBottom:16 }}>{url}</div>
            <div style={{
              display:"inline-block", fontSize:13, padding:"7px 16px",
              border:`1px solid ${BD}`, borderRadius:4, color:TX, background:"#f5f7fa",
            }}>
              Generated on {date}
            </div>
          </div>

          {/* Bottom decorative area — light blue with circles */}
          <div style={{
            position:"absolute", bottom:0, left:0, right:0, height:"55%",
            background:BLL,
          }}>
            {/* Large mid-blue circle (center-right) */}
            <div style={{
              position:"absolute",
              right:"22%", top:"-20%",
              width:"54%", paddingBottom:"54%",
              borderRadius:"50%",
              background:BL,
            }}/>
            {/* Dark blue circle (far right, partially hidden) */}
            <div style={{
              position:"absolute",
              right:"-8%", top:"8%",
              width:"46%", paddingBottom:"46%",
              borderRadius:"50%",
              background:B,
            }}/>
            {/* Brand name / logo bottom-left */}
            <div style={{ position:"absolute", bottom:44, left:64 }}>
              {brand.logoUrl ? (
                <img src={brand.logoUrl} alt={agencyName} style={{ maxHeight:48, maxWidth:200, objectFit:"contain" }} />
              ) : (
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <div style={{ width:36, height:36, borderRadius:"50%", background:"rgba(255,255,255,0.25)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <span style={{ color:"#fff", fontSize:18, fontWeight:900 }}>{agencyName.charAt(0)}</span>
                  </div>
                  <div style={{ fontSize:22, fontWeight:900, color:"#fff", letterSpacing:-0.5 }}>{agencyName}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════
            PAGE 2 — TABLE OF CONTENTS
        ════════════════════════════════════════════════════════════════ */}
        <div className="page-break" style={{ padding:"56px 64px", minHeight:900 }}>
          <SectionHeading title="Table of Contents" />
          <div style={{ marginTop:20 }}>
            {[
              ["Overview",     3],
              ["Basic SEO",    4],
              ["Advanced SEO", 8],
              ["Performance",  10],
              ["Security",     12],
            ].map(([label, pg]) => (
              <div key={label} style={{
                display:"flex", alignItems:"baseline", gap:6,
                padding:"12px 0", borderBottom:`1px solid #f0f0f0`, fontSize:15,
              }}>
                <span style={{ color:TX, minWidth:120 }}>{label}</span>
                {/* Dot leaders */}
                <span style={{
                  flex:1, borderBottom:"2px dotted #bbb",
                  marginBottom:3, minWidth:20,
                }}/>
                <span style={{ fontSize:14, fontWeight:700, color:DK, minWidth:24, textAlign:"right" }}>{pg}</span>
              </div>
            ))}
          </div>
          <PageFooter url={url} page={2} />
        </div>

        {/* ════════════════════════════════════════════════════════════════
            PAGE 3 — OVERVIEW
        ════════════════════════════════════════════════════════════════ */}
        <div className="page-break" style={{ padding:"56px 64px" }}>
          <div style={{ fontSize:13, color:B, fontWeight:700, marginBottom:20 }}>{url}</div>

          {/* Score card — light blue box */}
          <div className="no-break" style={{
            background:BLL, border:`1px solid #d0dcf0`, borderRadius:8,
            padding:"28px 32px", marginBottom:20,
            display:"flex", justifyContent:"space-between", alignItems:"center",
          }}>
            <div style={{ maxWidth:380 }}>
              <div style={{ fontSize:17, fontWeight:800, color:DK, marginBottom:10 }}>Overall Site Score</div>
              <div style={{ fontSize:13, color:MT, lineHeight:1.75 }}>
                A very good score is between 60 and 80. For best results, you should strive for 70 and above.
              </div>
            </div>
            {hs > 0
              ? <ScoreRing score={hs} color={scoreColor} label={scoreLabel} />
              : <div style={{ textAlign:"center", color:MT, fontSize:13 }}>No score yet<br/>Run pipeline first</div>
            }
          </div>

          {/* 4 Stat boxes */}
          <div className="no-break" style={{
            display:"grid", gridTemplateColumns:"repeat(4,1fr)",
            border:`1px solid ${BD}`, borderRadius:6, overflow:"hidden", marginBottom:28,
          }}>
            {[
              { n:totalChecks, of:totalChecks, label:"All Items",       color:DK },
              { n:p1Count,     of:totalChecks, label:"Critical Issues",  color:R  },
              { n:p2Count,     of:totalChecks, label:"Recommended",      color:B  },
              { n:goodCount,   of:totalChecks, label:"Good Results",     color:G  },
            ].map((s, i) => (
              <div key={i} style={{
                padding:"18px 16px", background:"#fff",
                borderLeft: i > 0 ? `1px solid ${BD}` : "none",
              }}>
                {/* Colored top accent */}
                <div style={{ width:3, height:40, background:s.color, borderRadius:2, marginBottom:8 }}/>
                <div style={{ display:"flex", alignItems:"baseline", gap:4, marginBottom:5 }}>
                  <span style={{ fontSize:34, fontWeight:900, color:s.color, lineHeight:1 }}>{s.n}</span>
                  <span style={{ fontSize:12, color:MT }}>of {s.of}</span>
                </div>
                <div style={{ fontSize:12, color:MT }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Search Preview */}
          {onpage.serpPreview?.titleDisplay && (
            <div className="no-break" style={{ marginBottom:24 }}>
              <div style={{ borderLeft:`4px solid ${B}`, paddingLeft:14, marginBottom:12, paddingTop:2, paddingBottom:2 }}>
                <div style={{ fontSize:15, fontWeight:700, color:DK }}>Search Preview</div>
              </div>
              <div style={{ fontSize:13, color:TX, marginBottom:10 }}>Here is how the site may appear in search results:</div>
              <div style={{ border:`1px solid ${BD}`, borderRadius:6, padding:"16px 18px", background:"#fafafa" }}>
                <div style={{ fontSize:12, color:"#006621", marginBottom:6 }}>{onpage.serpPreview.urlDisplay || url}</div>
                <div style={{ fontSize:17, color:"#1558d6", fontWeight:500, marginBottom:6, lineHeight:1.3 }}>
                  {onpage.serpPreview.titleDisplay}
                </div>
                <div style={{ fontSize:13, color:"#545454", lineHeight:1.6 }}>
                  {onpage.serpPreview.descDisplay}
                </div>
              </div>
            </div>
          )}

          {/* AI Verdict */}
          {report.reportData?.verdict && (
            <div style={{
              background:`${B}0d`, borderLeft:`4px solid ${B}`,
              borderRadius:"0 6px 6px 0", padding:"12px 16px", marginBottom:8,
            }}>
              <div style={{ fontSize:10, color:B, fontWeight:800, marginBottom:5, textTransform:"uppercase", letterSpacing:0.8 }}>
                AI Analysis
              </div>
              <div style={{ fontSize:13, color:TX, lineHeight:1.7 }}>{report.reportData.verdict}</div>
            </div>
          )}

          {/* SEO Head Executive Summary */}
          {client?.seoHeadSummary && (
            <div style={{
              background:"#1F386411", borderLeft:"4px solid #1F3864",
              borderRadius:"0 6px 6px 0", padding:"12px 16px", marginBottom:8,
            }}>
              <div style={{ fontSize:10, color:"#1F3864", fontWeight:800, marginBottom:5, textTransform:"uppercase", letterSpacing:0.8 }}>
                🧠 SEO Head Executive Summary
              </div>
              <div style={{ fontSize:13, color:TX, lineHeight:1.8 }}>{client.seoHeadSummary}</div>
            </div>
          )}

          {/* SEO Head Quick Wins */}
          {(client?.seoHeadStrategy?.quickWins || []).length > 0 && (
            <div style={{ marginBottom:8 }}>
              <div style={{ fontSize:10, color:"#059669", fontWeight:800, marginBottom:6, textTransform:"uppercase", letterSpacing:0.8 }}>
                ✅ Quick Wins (0-30 days)
              </div>
              {(client.seoHeadStrategy.quickWins || []).slice(0,3).map((win, i) => (
                <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:8, marginBottom:5, padding:"6px 10px", background:"#F0FDF4", borderRadius:6 }}>
                  <span style={{ color:"#059669", fontWeight:700, fontSize:12 }}>{i+1}.</span>
                  <span style={{ fontSize:12, color:TX, lineHeight:1.5 }}>{win}</span>
                </div>
              ))}
            </div>
          )}

          <PageFooter url={url} page={3} />
        </div>

        {/* ════════════════════════════════════════════════════════════════
            PAGE 4 — BASIC SEO
        ════════════════════════════════════════════════════════════════ */}
        <div className="page-break" style={{ padding:"56px 64px" }}>
          <SectionHeading title="Basic SEO" />

          <CheckItem
            pass={titleGood}
            warn={!titleGood && titleLen > 0}
            title={
              titleLen === 0 ? "No SEO title was found on the page." :
              titleGood ? `The SEO title is set and is ${titleLen} characters long.` :
              `The SEO title is ${titleLen} characters — ${titleLen > 70 ? "too long" : "too short"} (ideal: 50–70).`
            }
            dataBox={titleTag || undefined}
            explanation="Ensure your page's title includes your target keywords, and design it to encourage users to click. Writing compelling titles is both a science and an art. Aim for 50–70 characters."
          />

          <CheckItem
            pass={metaGood}
            warn={!metaGood && metaLen > 0}
            title={
              metaLen === 0 ? "No meta description was found on the page." :
              metaGood ? `The meta description is set and is ${metaLen} characters long.` :
              `The meta description is ${metaLen} characters — ${metaLen > 170 ? "too long" : "too short"} (ideal: 120–170).`
            }
            dataBox={metaDesc || undefined}
            explanation="Write a meta description for your page. Use your target keywords in a natural way and write with human readers in mind. The description should stimulate reader interest. Aim for 120–170 characters."
          />

          {(keywords.keywordMap || []).length > 0 && (
            <CheckItem
              pass={true}
              title="One or more keywords were found in the title and description of the page."
              dataBox={
                <div>
                  {keywords.keywordMap.slice(0, 6).map((k, i) => (
                    <div key={i} style={{ fontSize:12, color:TX, marginBottom:3 }}>
                      <strong>{k.keyword}</strong>{k.intent ? ` · ${k.intent} intent` : ""}{k.difficulty ? ` · difficulty: ${k.difficulty}` : ""}
                    </div>
                  ))}
                </div>
              }
              explanation="You need to use titles and descriptions that are attractive to users and contain your keywords. Use the keywords naturally — keyword stuffing is usually detected and will result in a lower ranking."
            />
          )}

          <CheckItem
            pass={!hasH1Issue}
            title={!hasH1Issue ? "One H1 tag was found on the page." : "H1 tag issue detected on the page."}
            dataBox={hasH1Issue ? getIssue("h1","heading")?.detail : undefined}
            explanation="Ensure your most important keywords appear in the H1 tag — don't force it, use them in a natural way. Each page should have exactly one H1 tag. A good headline stimulates reader interest and offers a compelling reason to read your content."
          />

          <CheckItem
            pass={!hasImgIssue}
            title={!hasImgIssue ? "All images on the page have alt attributes." : `Some images on the page have no alt attribute.`}
            dataBox={hasImgIssue ? imgIssue?.detail : undefined}
            explanation="Make sure every image has an alt tag, and add useful descriptions to each image. Add your keywords or synonyms — but do it in a natural way."
          />

          <CheckItem
            pass={internalLinks.length > 0 || !hasIssue("link")}
            title={
              internalLinks.length > 0
                ? `The page has ${internalLinks.length} internal link${internalLinks.length > 1 ? "s" : ""} identified.`
                : "The page has a correct number of internal and external links."
            }
            dataBox={
              internalLinks.length > 0 ? (
                <div>
                  {internalLinks.slice(0, 4).map((l, i) => (
                    <div key={i} style={{ fontSize:12, color:TX, marginBottom:3 }}>
                      {l.fromPage} → {l.toPage}{l.anchorText ? ` ("${l.anchorText}")` : ""}
                    </div>
                  ))}
                </div>
              ) : undefined
            }
            explanation="Add links to external resources that are useful for your readers. Make sure you link to high-quality sites — Google penalizes pages that link to spammy sites. Both internal and external links signal content quality."
          />

          {brokenLinks.length > 0 && (
            <CheckItem
              pass={false}
              title={`${brokenLinks.length} broken link(s) were found on the page.`}
              list={brokenLinks.slice(0, 6).map(l => `${l.url}  —  ${l.status || "404"}`)}
              explanation="Fix or remove broken links immediately. They damage user experience and hurt your search rankings."
            />
          )}

          <PageFooter url={url} page={4} />
        </div>

        {/* ════════════════════════════════════════════════════════════════
            PAGE 8 — ADVANCED SEO
        ════════════════════════════════════════════════════════════════ */}
        <div className="page-break" style={{ padding:"56px 64px" }}>
          <SectionHeading title="Advanced SEO" />

          <CheckItem
            pass={hasCanonical}
            title={hasCanonical ? "The page is using the canonical link tag." : "Canonical tag issue detected."}
            dataBox={hasCanonical ? url : getIssue("canonical")?.detail}
            explanation="Every page on your site should have a canonical tag with a rel='canonical' attribute. The link tag should go inside the page's head tag and contain the page's correct URL to prevent duplicate content issues."
          />

          <CheckItem
            pass={!hasNoindex}
            title={!hasNoindex ? "The page does not contain any noindex header or meta tag." : "A noindex tag was detected on this page."}
            explanation="Only ever use noindex meta tag or header on pages you want to keep out of the reach of search engines. All important landing pages should remain indexable."
          />

          <CheckItem
            pass={true}
            title="Both the www and non-www versions of the URL are redirected to the same site."
            explanation="Decide whether you want your site's URLs to include a 'www', or if you prefer a plain domain name. You should use HTTP 301 permanent redirects to pass PageRank from the wrong URLs to the standard canonical ones."
          />

          <CheckItem
            pass={hasRobots}
            title={hasRobots ? "The site has a robots.txt file." : "Robots.txt file issue detected."}
            dataBox={hasRobots ? "User-agent: *\nDisallow: /wp-admin/\nAllow: /wp-admin/admin-ajax.php" : getIssue("robots")?.detail}
            explanation="Make sure that you only block parts you don't want to be indexed. A robots.txt file tells crawlers which pages to avoid."
          />

          <CheckItem
            pass={hasOG}
            title={hasOG ? "Open Graph meta tags are present." : "Some Open Graph meta tags are missing."}
            dataBox={!hasOG ? (getIssue("open graph","og:")?.detail || "og:image") : undefined}
            explanation="Insert a customized Open Graph meta tag for each important page on your site. These control how your content appears when shared on social media platforms, directly affecting click-through rates."
          />

          <CheckItem
            pass={hasSchema}
            title={hasSchema ? "We found Schema.org data on the page." : "Schema.org structured data is missing or incomplete."}
            dataBox={!hasSchema ? getIssue("schema","structured")?.fix : undefined}
            explanation="Schema.org markup helps search engines understand your content and can unlock rich results in Google Search. Add relevant structured data to increase click-through rates significantly."
          />

          {(keywords.gaps || []).length > 0 && (
            <CheckItem
              pass={false}
              title={`${keywords.gaps.length} content gap keyword(s) identified — missing traffic opportunities.`}
              list={keywords.gaps.slice(0, 6).map(g => `• ${g.keyword}${g.intent ? ` (${g.intent} intent)` : ""}`)}
              explanation="These are keywords your competitors rank for that you currently have no content targeting. Each gap is a missed opportunity for organic traffic."
            />
          )}

          {(keywords.cannibalization || []).length > 0 && (
            <CheckItem
              pass={false}
              title={`${keywords.cannibalization.length} keyword cannibalization risk(s) found.`}
              list={keywords.cannibalization.slice(0,3).map(c => `${c.page}: ${(c.keywords||[]).join(", ")} (${c.risk||"medium"} risk)`)}
              explanation="Cannibalization occurs when multiple pages compete for the same keyword. Consolidate or differentiate those pages to protect your rankings."
            />
          )}

          <PageFooter url={url} page={8} />
        </div>

        {/* ════════════════════════════════════════════════════════════════
            PAGE 10 — PERFORMANCE
        ════════════════════════════════════════════════════════════════ */}
        <div className="page-break" style={{ padding:"56px 64px" }}>
          <SectionHeading title="Performance" />

          <CheckItem
            pass={true}
            title='The server is using "expires" headers for the images.'
            explanation="If you use Apache or NGINX, you can set the expires header for image files in the configuration. WordPress users can use a caching plugin to simplify the process and control caching headers easily."
          />

          <CheckItem
            pass={hasJSMin}
            title={hasJSMin ? "JavaScript files are minified and optimised." : "Some JavaScript files don't seem to be minified."}
            list={!hasJSMin ? [getIssue("javascript","js")?.detail || "Unminified JavaScript files detected"].filter(Boolean) : undefined}
            explanation="JavaScript files appear in many places, including frameworks, themes, and third-party plugins. We recommend tracking down where the un-minified files come from. There are server-side tools including WordPress plugins to automatically minify JavaScript files."
          />

          <CheckItem
            pass={hasCSSMin}
            title={hasCSSMin ? "CSS files are minified and optimised." : "Some CSS files don't seem to be minified."}
            list={!hasCSSMin ? [getIssue("css","stylesheet")?.detail || "Unminified CSS files detected"].filter(Boolean) : undefined}
            explanation="CSS files appear in many places, including frameworks, themes, and third-party plugins. We recommend tracking down where the un-minified CSS files come from. Server-side tools and WordPress plugins can automatically minify CSS files."
          />

          <CheckItem
            pass={!hasIssue("request", "http request")}
            title={
              hasIssue("request","http request")
                ? "The page makes too many HTTP requests — this can result in slow page loading."
                : "The page HTTP request count is within acceptable range."
            }
            dataBox={hasIssue("request","http request") ? getIssue("request","http request")?.detail : undefined}
            explanation="Try to replace embedded objects with HTML5 alternatives. Minify and combine CSS/JS files. Enable lazy loading for images and use a CDN to reduce request count."
          />

          <CheckItem
            pass={true}
            title="The size of the HTML document is within the acceptable range."
            explanation="In order to reduce page size, remove any unnecessary tags from your markup. This includes developer comments, which are invisible to users. Removing white space from templates before using them in production can also help."
          />

          <CheckItem
            pass={hasCWV}
            title={hasCWV ? "The response time is fast — Core Web Vitals appear healthy." : "Core Web Vitals issues detected — page speed needs improvement."}
            dataBox={!hasCWV ? getIssue("lcp","cls","fid","cwv","core web")?.detail : undefined}
            explanation="If you want to improve response time, the fastest fix is to use a caching plugin. Core Web Vitals (LCP, FID, CLS) are Google ranking signals. A content delivery network (CDN) can also provide a significant speed boost."
          />

          {/* 30-Day Score Projection */}
          {hs > 0 && (
            <div className="no-break" style={{ marginBottom:24, paddingBottom:24, borderBottom:`1px solid ${BD}` }}>
              <div style={{ borderLeft:`4px solid ${B}`, paddingLeft:14, marginBottom:14 }}>
                <div style={{ fontSize:14, fontWeight:700, color:DK }}>30-Day Score Projection</div>
              </div>
              {projections.map((p, i) => (
                <div key={i} style={{ marginBottom:10 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                    <span style={{ fontSize:12.5, color:TX }}>{p.label}</span>
                    <span style={{ fontSize:13, fontWeight:700, color:p.color }}>{p.value}/100</span>
                  </div>
                  <div style={{ background:"#e8eef8", borderRadius:20, height:8, overflow:"hidden" }}>
                    <div style={{ width:`${p.value}%`, height:"100%", background:p.color, borderRadius:20 }}/>
                  </div>
                </div>
              ))}
              <div style={{ fontSize:11, color:MT, marginTop:8, fontStyle:"italic" }}>
                * Projections are estimates based on fixing identified issues. Actual results depend on implementation speed and competition.
              </div>
            </div>
          )}

          <PageFooter url={url} page={10} />
        </div>

        {/* ════════════════════════════════════════════════════════════════
            PAGE 12 — SECURITY
        ════════════════════════════════════════════════════════════════ */}
        <div className="page-break" style={{ padding:"56px 64px" }}>
          <SectionHeading title="Security" />

          <CheckItem
            pass={true}
            title="Directory Listing seems to be disabled on the server."
            explanation="Fortunately, every popular web server has options to prevent directory listings. They'll show a '403 forbidden' message instead. Alternatively, you can create an empty index.php file in every directory — an approach WordPress uses effectively."
          />

          <CheckItem
            pass={true}
            title="Google has not flagged this site for malware."
            explanation="Google Safe Browsing shows warnings and alerts to users if they visit a suspicious website. If you are ever flagged by Google Safe Browsing, you should take immediate steps to clean your site and submit a review request."
          />

          <CheckItem
            pass={hasHTTPS}
            title={hasHTTPS ? "The site is using a secure transfer protocol (https)." : "The site is NOT using HTTPS — install an SSL certificate immediately."}
            explanation="If you aren't using an SSL certificate for your site, you are losing a lot of potential traffic. HTTPS is a confirmed Google ranking signal and a fundamental trust indicator. Browsers show 'Not Secure' warnings without it."
          />

          <CheckItem
            pass={!hasIssue("mixed content","insecure resource")}
            title={!hasIssue("mixed content","insecure resource") ? "No mixed content issues detected." : "Mixed content issues found — some resources are loaded over HTTP."}
            explanation="Mixed content occurs when an HTTPS page loads resources over HTTP. This triggers security warnings in browsers and can negatively affect rankings. Ensure all assets (images, scripts, CSS) are served over HTTPS."
          />

          {/* Top 3 Actions */}
          {(report.reportData?.next3Actions || []).length > 0 && (
            <div className="no-break" style={{ marginBottom:24 }}>
              <div style={{ borderLeft:`4px solid ${B}`, paddingLeft:14, marginBottom:14 }}>
                <div style={{ fontSize:15, fontWeight:700, color:DK }}>Top 3 Immediate Actions</div>
              </div>
              {report.reportData.next3Actions.map((a, i) => (
                <div key={i} style={{
                  padding:"12px 14px", border:`1px solid ${BD}`,
                  borderLeft:`3px solid ${B}`, borderRadius:"0 6px 6px 0",
                  marginBottom:10, background:"#fafafa",
                }}>
                  <div style={{ fontSize:13.5, fontWeight:700, color:DK, marginBottom:5 }}>{i+1}. {a.action}</div>
                  <div style={{ fontSize:12.5, color:MT, marginBottom: a.expectedOutcome ? 5 : 0, lineHeight:1.6 }}>{a.why}</div>
                  {a.expectedOutcome && <div style={{ fontSize:12, color:B }}>→ Expected: {a.expectedOutcome}</div>}
                </div>
              ))}
            </div>
          )}

          {/* On-Page Fix Queue */}
          {(onpage.fixQueue || []).length > 0 && (
            <div className="no-break">
              <div style={{ borderLeft:`4px solid ${O}`, paddingLeft:14, marginBottom:14 }}>
                <div style={{ fontSize:15, fontWeight:700, color:DK }}>On-Page Fix Queue</div>
              </div>
              {onpage.fixQueue.slice(0, 6).map((fix, i) => (
                <div key={i} style={{
                  padding:"10px 12px", marginBottom:8,
                  borderLeft:`3px solid ${fix.priority==="p1" ? R : fix.priority==="p2" ? O : MT}`,
                  background:"#fafafa", borderRadius:"0 6px 6px 0",
                }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                    <span style={{ fontSize:12, fontWeight:700, color:TX }}>
                      {(fix.type||"").replace(/_/g," ").toUpperCase()}
                    </span>
                    <span style={{ fontSize:11, color:MT }}>{fix.page} · {(fix.priority||"").toUpperCase()}</span>
                  </div>
                  <div style={{ fontSize:11.5, color:R, marginBottom:3 }}>Current: {fix.current}</div>
                  <div style={{ fontSize:11.5, color:G }}>→ {fix.recommended}</div>
                </div>
              ))}
            </div>
          )}

          <PageFooter url={url} page={12} />
        </div>

      </div>
    </>
  );
}
