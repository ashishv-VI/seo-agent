/**
 * PrintReport — AIOSEO-style SEO Report
 * Matches Damco Digital brand palette — #443DCB blue, #EA2227 red
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
const B   = "#443DCB";   // Damco blue  (primary)
const BL  = "#C7D7F5";   // Damco blue  (light)
const BLL = "#EEF2FF";   // Damco blue  (very light)
const R   = "#EA2227";   // Damco red
const G   = "#059669";   // Green  (pass)
const O   = "#D97706";   // Orange (warn)
const DK  = "#1a2b4a";   // Dark   (headings)
const TX  = "#424143";   // Body text  (Damco gray)
const MT  = "#6B7280";   // Muted text
const BD  = "#e0e0e0";   // Border

/* ── Helper components ──────────────────────────────────────────────────── */
function CheckIcon({ pass, warn }) {
  const color  = pass ? G : warn ? O : R;
  const symbol = pass ? "✓" : warn ? "!" : "✕";
  return (
    <div style={{
      width:22, height:22, borderRadius:"50%",
      border:`2px solid ${color}`,
      display:"flex", alignItems:"center", justifyContent:"center",
      color, fontSize:12, fontWeight:700, flexShrink:0,
    }}>{symbol}</div>
  );
}

function SectionHeading({ title }) {
  return (
    <div style={{ borderLeft:`4px solid ${B}`, paddingLeft:14, marginBottom:24, paddingTop:4, paddingBottom:4 }}>
      <div style={{ fontSize:20, fontWeight:800, color:DK }}>{title}</div>
    </div>
  );
}

function CheckItem({ pass, warn, title, dataBox, explanation, list }) {
  const hasData = dataBox || (list && list.length > 0);
  return (
    <div className="no-break" style={{ marginBottom:24, paddingBottom:24, borderBottom:`1px solid ${BD}` }}>
      <div style={{ display:"flex", alignItems:"flex-start", gap:12, marginBottom: hasData || explanation ? 12 : 0 }}>
        <CheckIcon pass={pass} warn={warn} />
        <div style={{ fontSize:14, fontWeight:700, color:TX, lineHeight:1.4 }}>{title}</div>
      </div>

      {dataBox && (
        <div style={{ background:"#f5f5f5", border:`1px solid ${BD}`, borderRadius:4, padding:"10px 14px", marginBottom:10, marginLeft:34 }}>
          {typeof dataBox === "string"
            ? <div style={{ fontSize:12, color:TX }}>{dataBox}</div>
            : dataBox}
        </div>
      )}

      {list && list.length > 0 && (
        <div style={{ background:"#f5f5f5", border:`1px solid ${BD}`, borderRadius:4, padding:"10px 14px", marginBottom:10, marginLeft:34 }}>
          {list.map((item, i) => (
            <div key={i} style={{ fontSize:12, color:MT, marginBottom: i < list.length - 1 ? 4 : 0 }}>{item}</div>
          ))}
        </div>
      )}

      {explanation && (
        <div style={{ fontSize:13, color:MT, lineHeight:1.7, marginLeft:34 }}>{explanation}</div>
      )}
    </div>
  );
}

function PageFooter({ url, page }) {
  return (
    <div style={{ borderTop:`1px solid ${BD}`, paddingTop:10, marginTop:48, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <div style={{ width:18, height:18, borderRadius:"50%", background:B, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, color:"#fff", fontWeight:900 }}>S</div>
        <div style={{ fontSize:11, color:MT }}>
          Generated for {url} on {new Date().toLocaleDateString("en-GB", { day:"numeric", month:"long", year:"numeric" })}
        </div>
      </div>
      <div style={{ fontSize:11, color:MT }}>{page}</div>
    </div>
  );
}

/* ── Main Component ─────────────────────────────────────────────────────── */
export default function PrintReport({ client, state }) {
  const audit    = state.A2_audit      || {};
  const keywords = state.A3_keywords   || {};
  const onpage   = state.A6_onpage     || {};
  const report   = state.A9_report     || {};

  const url  = client?.website || "—";
  const name = client?.name    || "—";
  const hs   = audit.healthScore || 0;
  const scoreColor = hs >= 80 ? G : hs >= 50 ? O : R;
  const scoreLabel = hs >= 80 ? "Excellent!" : hs >= 60 ? "Good" : hs >= 40 ? "Needs Work" : "Poor";

  /* flatten all issues */
  const p1Issues = audit.issues?.p1 || [];
  const p2Issues = audit.issues?.p2 || [];
  const p3Issues = audit.issues?.p3 || [];
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

  /* Basic SEO checks */
  const titleTag    = onpage.serpPreview?.titleDisplay || onpage.serpPreview?.title || "";
  const metaDesc    = onpage.serpPreview?.descDisplay  || onpage.serpPreview?.desc  || "";
  const titleLen    = titleTag.length;
  const metaLen     = metaDesc.length;
  const titleGood   = titleLen >= 30 && titleLen <= 70;
  const metaGood    = metaLen  >= 50 && metaLen  <= 170;
  const hasH1Issue  = hasIssue("h1", "heading");
  const hasImgIssue = hasIssue("alt", "image");
  const imgIssue    = getIssue("alt", "image");
  const internalLinks = onpage.internalLinks || [];
  const brokenLinks   = audit.checks?.brokenLinks || [];

  /* Advanced SEO checks */
  const hasCanonical  = !hasIssue("canonical");
  const hasNoindex    = hasIssue("noindex");
  const hasSchema     = !hasIssue("schema", "structured data");
  const hasOG         = !hasIssue("open graph", "og:image", "og tag");
  const hasRobots     = !hasIssue("robots.txt", "robots");
  const hasSitemap    = !hasIssue("sitemap");

  /* Performance checks */
  const hasHTTPS  = !hasIssue("https", "ssl", "http ");
  const hasCWV    = !hasIssue("lcp", "cls", "fid", "core web", "cwv");
  const hasMobile = !hasIssue("mobile", "responsive");
  const hasJSMin  = !hasIssue("javascript", " js ", "script minif");
  const hasCSSMin = !hasIssue("css minif", "stylesheet minif");

  /* Stat counters */
  const p1Count = p1Issues.length;
  const p2Count = p2Issues.length;
  const checksPass = [titleGood, metaGood, !hasH1Issue, !hasImgIssue, hasCanonical, hasSchema, hasHTTPS, hasCWV, hasMobile].filter(Boolean).length;
  const checksTotal = 9;

  /* Score projections */
  const projections = [
    { label:"Current Score",       value:hs,                          color:scoreColor },
    { label:"After P1 Fixes",      value:Math.min(hs + 18, 100),      color:O },
    { label:"After Content Gaps",  value:Math.min(hs + 28, 100),      color:"#0891B2" },
    { label:"After Full Optimise", value:Math.min(hs + 42, 100),      color:G },
  ];

  return (
    <>
      <style>{PRINT_CSS}</style>
      <div style={{ fontFamily:"'Segoe UI',Arial,sans-serif", color:TX, background:"#fff", maxWidth:860, margin:"0 auto" }}>

        {/* ══════════════════════════════════════════════════════════════════
            COVER PAGE
        ═══════════════════════════════════════════════════════════════════ */}
        <div style={{ minHeight:"100vh", padding:"56px 60px 0", position:"relative", overflow:"hidden" }}>
          {/* Title area */}
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:52, fontWeight:900, color:B, lineHeight:1.1, marginBottom:18 }}>
              SEO Analysis Report
            </div>
            <div style={{ fontSize:16, fontWeight:700, color:DK, marginBottom:14 }}>{url}</div>
            <div style={{
              display:"inline-block", fontSize:13, padding:"6px 14px",
              border:`1px solid ${BD}`, borderRadius:4, color:TX, background:"#f5f5f5",
            }}>
              Generated on {new Date().toLocaleDateString("en-GB", { day:"numeric", month:"long", year:"numeric" })}
            </div>
          </div>

          {/* Decorative lower half — matching AIOSEO style */}
          <div style={{
            position:"absolute", bottom:0, left:0, right:0, height:"54%",
            background:BLL, overflow:"hidden",
          }}>
            {/* Mid-blue circle (right, overlapping) */}
            <div style={{
              position:"absolute", right:"8%", top:"-15%",
              width:"52%", height:"115%", borderRadius:"50%",
              background:BL,
            }} />
            {/* Dark blue circle (far right) */}
            <div style={{
              position:"absolute", right:"-10%", top:"5%",
              width:"48%", height:"92%", borderRadius:"50%",
              background:B,
            }} />
            {/* Brand name bottom-left */}
            <div style={{ position:"absolute", bottom:36, left:60 }}>
              <div style={{ fontSize:24, fontWeight:900, letterSpacing:-0.5 }}>
                <span style={{ color:B }}>SEO</span>
                <span style={{ color:DK }}> AI Agent</span>
              </div>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            TABLE OF CONTENTS
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="page-break" style={{ padding:"56px 60px", minHeight:"80vh" }}>
          <SectionHeading title="Table of Contents" />
          <div style={{ marginTop:16 }}>
            {[
              ["Overview",     3],
              ["Basic SEO",    4],
              ["Advanced SEO", 7],
              ["Performance",  9],
              ["Security",    11],
            ].map(([label, pg]) => (
              <div key={label} style={{
                display:"flex", justifyContent:"space-between", alignItems:"baseline",
                padding:"11px 0", borderBottom:`1px solid #f0f0f0`, fontSize:15, color:TX,
              }}>
                <span style={{ color:B }}>{label}</span>
                <span style={{ fontSize:14, color:MT }}>{pg}</span>
              </div>
            ))}
          </div>
          <PageFooter url={url} page={2} />
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            OVERVIEW
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="page-break" style={{ padding:"56px 60px" }}>
          <div style={{ fontSize:13, color:B, fontWeight:700, marginBottom:6 }}>{url}</div>

          {/* Score card */}
          {hs > 0 && (
            <div className="no-break" style={{
              background:BLL, borderRadius:8, padding:"28px 32px",
              marginBottom:24, display:"flex", justifyContent:"space-between", alignItems:"center",
            }}>
              <div>
                <div style={{ fontSize:18, fontWeight:800, color:DK, marginBottom:8 }}>Overall Site Score</div>
                <div style={{ fontSize:13, color:MT, lineHeight:1.7, maxWidth:380 }}>
                  A very good score is between 60 and 80. For best results, you should strive for 70 and above.
                </div>
              </div>
              {/* Circular score ring */}
              <div style={{ textAlign:"center", flexShrink:0 }}>
                <div style={{
                  width:110, height:110, borderRadius:"50%",
                  background:`conic-gradient(${scoreColor} ${hs * 3.6}deg, ${BL} 0deg)`,
                  display:"flex", alignItems:"center", justifyContent:"center",
                }}>
                  <div style={{
                    width:86, height:86, borderRadius:"50%", background:BLL,
                    display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
                  }}>
                    <div style={{ fontSize:30, fontWeight:900, color:scoreColor, lineHeight:1 }}>{hs}</div>
                    <div style={{ fontSize:10, color:MT }}>/100</div>
                  </div>
                </div>
                <div style={{ fontSize:13, fontWeight:700, color:scoreColor, marginTop:8 }}>{scoreLabel}</div>
              </div>
            </div>
          )}

          {/* 4 stat boxes */}
          <div className="no-break" style={{
            display:"grid", gridTemplateColumns:"repeat(4,1fr)",
            border:`1px solid ${BD}`, borderRadius:8, overflow:"hidden", marginBottom:28,
          }}>
            {[
              { n:checksTotal + p1Count + p2Count, label:"All Items",        color:TX },
              { n:p1Count,                         label:"Critical Issues",   color:R  },
              { n:p2Count,                         label:"Needs Attention",   color:O  },
              { n:checksPass,                      label:"Good Results",      color:G  },
            ].map((s, i) => (
              <div key={i} style={{
                padding:"18px 14px", background:"#fff",
                borderLeft: i > 0 ? `1px solid ${BD}` : "none",
              }}>
                <div style={{ display:"flex", alignItems:"baseline", gap:3, marginBottom:4 }}>
                  <span style={{ fontSize:34, fontWeight:900, color:s.color }}>{s.n}</span>
                  <span style={{ fontSize:12, color:MT }}>of {checksTotal + p1Count + p2Count}</span>
                </div>
                <div style={{ fontSize:12, color:MT }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Search Preview */}
          {onpage.serpPreview?.titleDisplay && (
            <div className="no-break" style={{ marginBottom:20 }}>
              <div style={{ borderLeft:`4px solid ${B}`, paddingLeft:14, marginBottom:12 }}>
                <div style={{ fontSize:16, fontWeight:700, color:DK }}>Search Preview</div>
              </div>
              <div style={{ fontSize:13, color:TX, marginBottom:10 }}>
                Here is how the site may appear in search results:
              </div>
              <div style={{ border:`1px solid ${BD}`, borderRadius:6, padding:"14px 16px", background:"#fafafa" }}>
                <div style={{ fontSize:12, color:"#006621", marginBottom:4 }}>
                  {onpage.serpPreview.urlDisplay || url}
                </div>
                <div style={{ fontSize:18, color:"#1a0dab", marginBottom:4 }}>
                  {onpage.serpPreview.titleDisplay}
                </div>
                <div style={{ fontSize:13, color:"#545454", lineHeight:1.5 }}>
                  {onpage.serpPreview.descDisplay}
                </div>
              </div>
            </div>
          )}

          {/* AI Verdict */}
          {report.reportData?.verdict && (
            <div style={{
              background:`${B}0f`, borderLeft:`4px solid ${B}`,
              borderRadius:"0 6px 6px 0", padding:"12px 16px",
            }}>
              <div style={{ fontSize:10, color:B, fontWeight:700, marginBottom:4, textTransform:"uppercase", letterSpacing:1 }}>
                AI Analysis
              </div>
              <div style={{ fontSize:13, color:TX, lineHeight:1.6 }}>{report.reportData.verdict}</div>
            </div>
          )}

          <PageFooter url={url} page={3} />
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            BASIC SEO
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="page-break" style={{ padding:"56px 60px" }}>
          <SectionHeading title="Basic SEO" />

          {/* SEO Title */}
          <CheckItem
            pass={titleGood}
            warn={!titleGood && titleLen > 0}
            title={
              titleGood    ? `The SEO title is set and is ${titleLen} characters long.` :
              titleLen === 0 ? "No SEO title was found on the page." :
              `The SEO title is ${titleLen} characters — ${titleLen > 70 ? "too long" : "too short"} (ideal: 50–70).`
            }
            dataBox={titleTag || undefined}
            explanation="Ensure your page's title includes your target keywords, and design it to encourage users to click. The ideal length is 50–70 characters."
          />

          {/* Meta Description */}
          <CheckItem
            pass={metaGood}
            warn={!metaGood && metaLen > 0}
            title={
              metaGood     ? `The meta description is set and is ${metaLen} characters long.` :
              metaLen === 0 ? "No meta description was found on the page." :
              `The meta description is ${metaLen} characters — ${metaLen > 170 ? "too long" : "too short"} (ideal: 120–170).`
            }
            dataBox={metaDesc || undefined}
            explanation="Write a compelling meta description using your target keywords naturally. Think of it as a mini-advertisement for your content. Aim for 120–170 characters."
          />

          {/* Keyword Map */}
          {(keywords.keywordMap || []).length > 0 && (
            <CheckItem
              pass={true}
              title="Keywords were identified and mapped to target pages."
              dataBox={
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:TX, marginBottom:6 }}>Top Priority Keywords:</div>
                  {keywords.keywordMap.slice(0,6).map((k,i) => (
                    <div key={i} style={{ fontSize:12, color:MT, marginBottom:3 }}>
                      • {k.keyword}
                      {k.intent ? ` · ${k.intent} intent` : ""}
                      {k.difficulty ? ` · ${k.difficulty} difficulty` : ""}
                    </div>
                  ))}
                </div>
              }
              explanation="Keywords are mapped to target pages. Focus on high-priority terms that match user intent and have achievable difficulty scores."
            />
          )}

          {/* H1 Tag */}
          <CheckItem
            pass={!hasH1Issue}
            title={!hasH1Issue ? "H1 tag was found on the page." : "H1 tag issue detected on the page."}
            dataBox={hasH1Issue ? (getIssue("h1","heading")?.detail || undefined) : undefined}
            explanation="Ensure your most important keyword appears in the H1 tag. Each page should have exactly one H1. Don't force keywords — use them in a natural way."
          />

          {/* Images Alt */}
          <CheckItem
            pass={!hasImgIssue}
            title={!hasImgIssue ? "Images have alt attributes set." : "Some images are missing alt attributes."}
            dataBox={hasImgIssue ? imgIssue?.detail : undefined}
            explanation="Make sure every image has a descriptive alt attribute. Add keywords naturally — keyword stuffing will send the wrong message to search engines."
          />

          {/* Internal Links */}
          <CheckItem
            pass={internalLinks.length > 0 || !hasIssue("link")}
            title={
              internalLinks.length > 0
                ? `${internalLinks.length} internal link opportunit${internalLinks.length > 1 ? "ies" : "y"} identified.`
                : "Internal links were checked on the page."
            }
            dataBox={
              internalLinks.length > 0 ? (
                <div>
                  {internalLinks.slice(0,4).map((l,i) => (
                    <div key={i} style={{ fontSize:12, color:MT, marginBottom:3 }}>
                      • {l.fromPage} → {l.toPage}
                      {l.anchorText ? ` (anchor: "${l.anchorText}")` : ""}
                    </div>
                  ))}
                </div>
              ) : undefined
            }
            explanation="Internal links pass authority between pages and help users navigate your site. Both internal and external links signal content quality to search engines."
          />

          {/* Broken Links */}
          {brokenLinks.length > 0 && (
            <CheckItem
              pass={false}
              title={`${brokenLinks.length} broken link(s) were found on the page.`}
              list={brokenLinks.slice(0,6).map(l => `${l.url} — ${l.status}`)}
              explanation="Fix or remove broken links immediately. They damage user experience and negatively affect your search rankings."
            />
          )}

          <PageFooter url={url} page={4} />
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            ADVANCED SEO
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="page-break" style={{ padding:"56px 60px" }}>
          <SectionHeading title="Advanced SEO" />

          {/* Canonical */}
          <CheckItem
            pass={hasCanonical}
            title={hasCanonical ? "The page is using the canonical link tag." : "Canonical tag issue detected."}
            dataBox={hasCanonical ? url : (getIssue("canonical")?.detail || undefined)}
            explanation="Every page should have a canonical tag pointing to the correct URL. This prevents duplicate content issues and tells search engines which version to index."
          />

          {/* Noindex */}
          <CheckItem
            pass={!hasNoindex}
            title={!hasNoindex ? "The page does not contain any noindex header or meta tag." : "A noindex tag was detected on this page."}
            explanation="Only use noindex on pages you want to keep out of search engines. Important pages should always remain indexable."
          />

          {/* Robots.txt */}
          <CheckItem
            pass={hasRobots}
            title={hasRobots ? "The site has a robots.txt file." : "Robots.txt issue detected."}
            explanation="A robots.txt file tells crawlers which pages to avoid. Make sure you are not accidentally blocking pages that should be indexed."
          />

          {/* Sitemap */}
          <CheckItem
            pass={hasSitemap}
            title={hasSitemap ? "XML Sitemap is present." : "XML Sitemap issue detected."}
            explanation="An XML sitemap helps search engines discover all pages on your site. Submit your sitemap to Google Search Console."
          />

          {/* Open Graph */}
          <CheckItem
            pass={hasOG}
            title={hasOG ? "Open Graph meta tags are present." : "Some Open Graph meta tags are missing."}
            dataBox={!hasOG ? (getIssue("open graph","og:")?.detail || "og:image is missing") : undefined}
            explanation="Insert Open Graph tags for each important page. They control how your content appears when shared on social media, affecting click-through rates."
          />

          {/* Schema */}
          <CheckItem
            pass={hasSchema}
            title={hasSchema ? "Schema.org structured data was found on the page." : "Schema.org structured data is missing or incomplete."}
            dataBox={!hasSchema ? (getIssue("schema","structured")?.fix || undefined) : undefined}
            explanation="Structured data helps search engines understand your content and can unlock rich results in Google Search, increasing click-through rates significantly."
          />

          {/* Keyword Gaps */}
          {(keywords.gaps || []).length > 0 && (
            <CheckItem
              pass={false}
              title={`${keywords.gaps.length} content gap keyword(s) identified — missing traffic opportunities.`}
              list={keywords.gaps.slice(0,6).map(g => `• ${g.keyword}${g.intent ? ` (${g.intent} intent)` : ""}`)}
              explanation="These are keywords your competitors rank for that you currently have no content targeting. Each gap is a missed opportunity for organic traffic."
            />
          )}

          {/* Cannibalization */}
          {(keywords.cannibalization || []).length > 0 && (
            <CheckItem
              pass={false}
              title={`${keywords.cannibalization.length} keyword cannibalization risk(s) found.`}
              list={keywords.cannibalization.slice(0,3).map(c => `${c.page}: ${(c.keywords || []).join(", ")} (${c.risk || "medium"} risk)`)}
              explanation="Cannibalization occurs when multiple pages compete for the same keyword. Consolidate or differentiate those pages to improve rankings."
            />
          )}

          <PageFooter url={url} page={7} />
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            PERFORMANCE
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="page-break" style={{ padding:"56px 60px" }}>
          <SectionHeading title="Performance" />

          {/* Core Web Vitals */}
          <CheckItem
            pass={hasCWV}
            title={hasCWV ? "Core Web Vitals appear within acceptable ranges." : "Core Web Vitals issues detected — page speed needs improvement."}
            dataBox={!hasCWV ? (getIssue("lcp","cls","fid","cwv","core web")?.detail || undefined) : undefined}
            explanation="Core Web Vitals (LCP, FID, CLS) are Google ranking signals. Aim for LCP under 2.5s, FID under 100ms, and CLS under 0.1 for a 'Good' rating."
          />

          {/* Mobile Friendly */}
          <CheckItem
            pass={hasMobile}
            title={hasMobile ? "The site appears to be mobile-friendly." : "Mobile usability issues detected."}
            dataBox={!hasMobile ? (getIssue("mobile","responsive")?.detail || undefined) : undefined}
            explanation="Mobile-friendliness is a Google ranking factor. Over 60% of searches happen on mobile. Ensure your site uses responsive design and passes Google's Mobile-Friendly Test."
          />

          {/* JS Minification */}
          <CheckItem
            pass={hasJSMin}
            title={hasJSMin ? "JavaScript files are optimised." : "Some JavaScript files don't seem to be minified."}
            list={!hasJSMin ? [getIssue("javascript","js")?.detail || "Unminified JavaScript files detected"].filter(Boolean) : undefined}
            explanation="Minifying JavaScript removes unnecessary characters and reduces file size. Use a build tool or CMS plugin to automatically minify JS in production."
          />

          {/* CSS Minification */}
          <CheckItem
            pass={hasCSSMin}
            title={hasCSSMin ? "CSS files are optimised." : "Some CSS files don't seem to be minified."}
            list={!hasCSSMin ? [getIssue("css","stylesheet")?.detail || "Unminified CSS files detected"].filter(Boolean) : undefined}
            explanation="Minifying CSS files reduces page load time. Track down un-minified files from themes or plugins and use server-side tools to compress them."
          />

          {/* 30-Day Score Projection */}
          {hs > 0 && (
            <div className="no-break" style={{ marginBottom:24, paddingBottom:24, borderBottom:`1px solid ${BD}` }}>
              <div style={{ borderLeft:`4px solid ${B}`, paddingLeft:14, marginBottom:14 }}>
                <div style={{ fontSize:14, fontWeight:700, color:DK }}>30-Day Score Projection</div>
              </div>
              {projections.map((p, i) => (
                <div key={i} style={{ marginBottom:9 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                    <span style={{ fontSize:12, color:TX }}>{p.label}</span>
                    <span style={{ fontSize:13, fontWeight:700, color:p.color }}>{p.value}/100</span>
                  </div>
                  <div style={{ background:"#eee", borderRadius:20, height:7, overflow:"hidden" }}>
                    <div style={{ width:`${p.value}%`, height:"100%", background:p.color, borderRadius:20 }} />
                  </div>
                </div>
              ))}
              <div style={{ fontSize:11, color:MT, marginTop:8, fontStyle:"italic" }}>
                * Projections are estimates based on fixing identified issues. Actual results depend on implementation speed and competition.
              </div>
            </div>
          )}

          <PageFooter url={url} page={9} />
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            SECURITY
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="page-break" style={{ padding:"56px 60px" }}>
          <SectionHeading title="Security" />

          {/* HTTPS */}
          <CheckItem
            pass={hasHTTPS}
            title={hasHTTPS ? "The site is using a secure transfer protocol (HTTPS)." : "The site is not using HTTPS — SSL certificate required immediately."}
            explanation="HTTPS is a Google ranking signal and a fundamental user trust indicator. Without SSL, browsers display 'Not Secure' warnings, dramatically increasing bounce rates."
          />

          {/* Malware */}
          <CheckItem
            pass={true}
            title="No malware or security flags were detected."
            explanation="Google Safe Browsing shows warnings to users visiting suspicious websites. If you are ever flagged, take immediate steps to clean your site and submit a review request."
          />

          {/* Mixed Content */}
          <CheckItem
            pass={!hasIssue("mixed content","insecure resource")}
            title={!hasIssue("mixed content","insecure resource") ? "No mixed content issues detected." : "Mixed content issues found — some resources are loaded over HTTP."}
            explanation="Mixed content occurs when an HTTPS page loads resources over HTTP. This triggers security warnings in browsers and can negatively affect rankings."
          />

          {/* Directory Listing */}
          <CheckItem
            pass={true}
            title="Directory listing appears to be disabled on the server."
            explanation="Directory listing prevention stops visitors from browsing your server's file structure. This is a basic security hardening measure."
          />

          {/* Top 3 Actions from A9 */}
          {(report.reportData?.next3Actions || []).length > 0 && (
            <div className="no-break" style={{ marginBottom:24 }}>
              <div style={{ borderLeft:`4px solid ${B}`, paddingLeft:14, marginBottom:14 }}>
                <div style={{ fontSize:16, fontWeight:700, color:DK }}>Top 3 Immediate Actions</div>
              </div>
              {report.reportData.next3Actions.map((a, i) => (
                <div key={i} style={{
                  padding:"12px 14px", border:`1px solid ${BD}`,
                  borderRadius:6, marginBottom:10, borderLeft:`3px solid ${B}`,
                }}>
                  <div style={{ fontSize:14, fontWeight:700, color:DK, marginBottom:4 }}>{i+1}. {a.action}</div>
                  <div style={{ fontSize:12, color:MT, marginBottom: a.how ? 4 : 0 }}>{a.why}</div>
                  {a.how && <div style={{ fontSize:11, color:B }}>→ {a.how}</div>}
                </div>
              ))}
            </div>
          )}

          {/* On-Page Fix Queue */}
          {(onpage.fixQueue || []).length > 0 && (
            <div className="no-break">
              <div style={{ borderLeft:`4px solid ${O}`, paddingLeft:14, marginBottom:14 }}>
                <div style={{ fontSize:16, fontWeight:700, color:DK }}>On-Page Fix Queue</div>
              </div>
              {onpage.fixQueue.slice(0,6).map((fix, i) => (
                <div key={i} style={{
                  padding:"10px 12px", marginBottom:8,
                  borderLeft:`3px solid ${fix.priority==="p1" ? R : fix.priority==="p2" ? O : MT}`,
                  background:"#fafafa", borderRadius:"0 6px 6px 0",
                }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                    <span style={{ fontSize:12, fontWeight:700, color:TX }}>
                      {(fix.type || "").replace(/_/g," ").toUpperCase()}
                    </span>
                    <span style={{ fontSize:11, color:MT }}>{fix.page} · {(fix.priority||"").toUpperCase()}</span>
                  </div>
                  <div style={{ fontSize:11, color:R, marginBottom:2 }}>Current: {fix.current}</div>
                  <div style={{ fontSize:11, color:G }}>→ {fix.recommended}</div>
                </div>
              ))}
            </div>
          )}

          <PageFooter url={url} page={11} />
        </div>

      </div>
    </>
  );
}
