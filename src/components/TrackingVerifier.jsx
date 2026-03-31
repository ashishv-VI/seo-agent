/**
 * TrackingVerifier — Test GA4 / GTM installation across site pages
 *
 * Input any URL → checks for GA4 measurement ID, GTM container,
 * dataLayer push, and noscript tag. Shows pass/fail with details.
 * Also generates GTM install snippet for the client.
 */
import { useState } from "react";

const B = "#443DCB";

export default function TrackingVerifier({ dark, clientId, getToken, API, clientWebsite }) {
  const [urls,         setUrls]         = useState(clientWebsite ? [clientWebsite] : [""]);
  const [results,      setResults]      = useState([]);
  const [checking,     setChecking]     = useState(false);
  const [error,        setError]        = useState("");
  const [gtmId,        setGtmId]        = useState("");
  const [ga4MeasId,    setGa4MeasId]    = useState("");
  const [showSnippet,  setShowSnippet]  = useState(false);
  const [copied,       setCopied]       = useState("");

  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#2a2a2a" : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#777"    : "#888";

  function addUrl() {
    setUrls(u => [...u, ""]);
  }

  function updateUrl(i, val) {
    setUrls(u => u.map((v, idx) => idx === i ? val : v));
  }

  function removeUrl(i) {
    setUrls(u => u.filter((_, idx) => idx !== i));
  }

  async function runChecks() {
    const validUrls = urls.filter(u => u.trim());
    if (!validUrls.length) { setError("Enter at least one URL"); return; }

    setChecking(true); setError(""); setResults([]);

    const token   = await getToken();
    const pending = validUrls.map(url => ({ url, status: "checking", checks: [] }));
    setResults([...pending]);

    // Check each URL sequentially to avoid hammering the server
    for (let i = 0; i < validUrls.length; i++) {
      try {
        const res  = await fetch(`${API}/api/ga4/${clientId}/verify-tracking`, {
          method:  "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body:    JSON.stringify({ url: validUrls[i] }),
        });
        const data = await res.json();

        setResults(prev => prev.map((r, idx) =>
          idx === i ? { ...data, status: data.error ? "error" : "done" } : r
        ));
      } catch (e) {
        setResults(prev => prev.map((r, idx) =>
          idx === i ? { ...r, status: "error", error: e.message } : r
        ));
      }
    }

    setChecking(false);
  }

  function copyToClipboard(text, key) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(""), 2000);
    });
  }

  // ── GTM snippet generator ────────────────────────────────────────────────────
  const gtmHeadSnippet = gtmId ? `<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmId}');</script>
<!-- End Google Tag Manager -->` : "";

  const gtmBodySnippet = gtmId ? `<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${gtmId}"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->` : "";

  const ga4DirectSnippet = ga4MeasId ? `<!-- Google tag (gtag.js) - Google Analytics 4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${ga4MeasId}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${ga4MeasId}');
</script>` : "";

  return (
    <div style={{ padding: "0 0 24px" }}>
      {/* ── URL Checker ── */}
      <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 14, padding: "20px", marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: txt, marginBottom: 4 }}>Tracking Verifier</div>
        <div style={{ fontSize: 12, color: txt2, marginBottom: 16 }}>
          Enter URLs across your site — we'll check each page for GA4 and GTM installation.
        </div>

        {error && <div style={{ padding: "8px 12px", borderRadius: 8, background: "#DC262611", color: "#DC2626", fontSize: 12, marginBottom: 12 }}>{error}</div>}

        {/* URL inputs */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {urls.map((url, i) => (
            <div key={i} style={{ display: "flex", gap: 8 }}>
              <input
                type="url"
                placeholder={`https://example.com${i === 0 ? "" : i === 1 ? "/about" : "/contact"}`}
                value={url}
                onChange={e => updateUrl(i, e.target.value)}
                onKeyDown={e => e.key === "Enter" && i === urls.length - 1 && addUrl()}
                style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: `1px solid ${bdr}`, background: bg3, color: txt, fontSize: 13, outline: "none" }}
              />
              {urls.length > 1 && (
                <button onClick={() => removeUrl(i)}
                  style={{ padding: "9px 12px", borderRadius: 8, border: `1px solid ${bdr}`, background: "transparent", color: "#DC2626", fontSize: 12, cursor: "pointer" }}>
                  ×
                </button>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={addUrl}
            style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${bdr}`, background: bg3, color: txt2, fontSize: 12, cursor: "pointer" }}>
            + Add URL
          </button>
          <button onClick={runChecks} disabled={checking}
            style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: checking ? "#888" : B, color: "#fff", fontWeight: 700, fontSize: 13, cursor: checking ? "not-allowed" : "pointer" }}>
            {checking ? "Checking…" : `🔍 Check ${urls.filter(u=>u.trim()).length} URL${urls.filter(u=>u.trim()).length !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>

      {/* ── Results ── */}
      {results.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {results.map((result, i) => (
            <ResultCard key={i} result={result} dark={dark} bg2={bg2} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2} />
          ))}
        </div>
      )}

      {/* ── Snippet Generator ── */}
      <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${bdr}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: txt }}>Install Code Generator</div>
            <div style={{ fontSize: 12, color: txt2 }}>Generate the tracking snippets to add to your site's HTML</div>
          </div>
          <button onClick={() => setShowSnippet(s => !s)}
            style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${bdr}`, background: bg3, color: txt2, fontSize: 12, cursor: "pointer" }}>
            {showSnippet ? "Hide" : "Show Snippets"}
          </button>
        </div>

        {showSnippet && (
          <div style={{ padding: "20px" }}>
            {/* GTM snippet */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: txt, marginBottom: 8 }}>Google Tag Manager</div>
              <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                <input
                  type="text"
                  placeholder="GTM-XXXXXXX"
                  value={gtmId}
                  onChange={e => setGtmId(e.target.value.toUpperCase())}
                  style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `1px solid ${bdr}`, background: bg3, color: txt, fontSize: 13, outline: "none", fontFamily: "monospace" }}
                />
              </div>

              {gtmId && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <SnippetBlock
                    label="1. Paste inside <head> (as high as possible)"
                    code={gtmHeadSnippet}
                    copyKey="gtm-head"
                    copied={copied}
                    onCopy={copyToClipboard}
                    dark={dark} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2}
                  />
                  <SnippetBlock
                    label="2. Paste immediately after opening <body> tag"
                    code={gtmBodySnippet}
                    copyKey="gtm-body"
                    copied={copied}
                    onCopy={copyToClipboard}
                    dark={dark} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2}
                  />
                </div>
              )}
            </div>

            <div style={{ height: 1, background: bdr, marginBottom: 20 }} />

            {/* GA4 direct snippet */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: txt, marginBottom: 4 }}>Direct GA4 Snippet (without GTM)</div>
              <div style={{ fontSize: 11, color: txt2, marginBottom: 8 }}>Use only if you're NOT using GTM</div>
              <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                <input
                  type="text"
                  placeholder="G-XXXXXXXXXX"
                  value={ga4MeasId}
                  onChange={e => setGa4MeasId(e.target.value.toUpperCase())}
                  style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `1px solid ${bdr}`, background: bg3, color: txt, fontSize: 13, outline: "none", fontFamily: "monospace" }}
                />
              </div>

              {ga4MeasId && (
                <SnippetBlock
                  label="Paste inside <head>"
                  code={ga4DirectSnippet}
                  copyKey="ga4-direct"
                  copied={copied}
                  onCopy={copyToClipboard}
                  dark={dark} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2}
                />
              )}
            </div>

            {/* GTM setup guide */}
            <div style={{ marginTop: 20, padding: "14px 16px", borderRadius: 10, background: `${B}11`, border: `1px solid ${B}33` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#6B62E8", marginBottom: 8 }}>Recommended: Use GTM → GA4</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  { step: "1", text: "Install GTM on every page (head + body snippets above)" },
                  { step: "2", text: "In GTM: New Tag → Google Analytics: GA4 Configuration → enter your G-XXXXXXXX" },
                  { step: "3", text: "Add trigger: All Pages" },
                  { step: "4", text: "Publish the container — GA4 now tracks all page views automatically" },
                  { step: "5", text: "Use TrackingVerifier above to confirm it's installed on all key pages" },
                ].map(s => (
                  <div key={s.step} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <div style={{ width: 18, height: 18, borderRadius: "50%", background: `${B}22`, color: "#6B62E8", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{s.step}</div>
                    <div style={{ fontSize: 12, color: txt2 }}>{s.text}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Result card for one URL ───────────────────────────────────────────────────
function ResultCard({ result, dark, bg2, bg3, bdr, txt, txt2 }) {
  const isLoading = result.status === "checking";
  const isError   = result.status === "error";

  const overallColor = result.hasGA4 && result.hasGTM ? "#059669"
                     : result.hasGA4 || result.hasGTM  ? "#D97706"
                     : isError                          ? "#DC2626"
                     : "#888";

  return (
    <div style={{ background: bg2, border: `2px solid ${isLoading ? bdr : overallColor + "55"}`, borderRadius: 10, padding: "14px 16px", marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: isLoading ? 0 : 10 }}>
        <div style={{ fontSize: 16 }}>
          {isLoading ? "⏳" : isError ? "❌" : result.hasGA4 && result.hasGTM ? "✅" : result.hasGA4 || result.hasGTM ? "⚠️" : "❌"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: txt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{result.url}</div>
          {!isLoading && (
            <div style={{ fontSize: 11, color: overallColor, fontWeight: 600, marginTop: 2 }}>
              {isError ? result.error : result.summary}
            </div>
          )}
        </div>
      </div>

      {!isLoading && !isError && result.checks?.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 6 }}>
          {result.checks.map((check, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 10px", borderRadius: 7, background: check.found ? "#05966910" : bg3, border: `1px solid ${check.found ? "#05966940" : bdr}` }}>
              <div style={{ fontSize: 12, flexShrink: 0, marginTop: 1 }}>{check.found ? "✅" : "❌"}</div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: check.found ? "#059669" : txt2 }}>{check.name}</div>
                {check.detail && <div style={{ fontSize: 10, color: check.found ? "#059669" : txt2, fontFamily: "monospace" }}>{check.detail}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Code snippet block with copy button ──────────────────────────────────────
function SnippetBlock({ label, code, copyKey, copied, onCopy, dark, bg3, bdr, txt, txt2 }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontSize: 11, color: txt2 }}>{label}</div>
        <button onClick={() => onCopy(code, copyKey)}
          style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${bdr}`, background: copied === copyKey ? "#059669" : bg3, color: copied === copyKey ? "#fff" : txt2, fontSize: 11, cursor: "pointer" }}>
          {copied === copyKey ? "✓ Copied!" : "Copy"}
        </button>
      </div>
      <pre style={{ background: dark ? "#0a0a0a" : "#1e1e1e", color: "#e8e8e8", borderRadius: 8, padding: "12px 14px", fontSize: 11, lineHeight: 1.5, overflow: "auto", margin: 0, fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
        {code}
      </pre>
    </div>
  );
}
