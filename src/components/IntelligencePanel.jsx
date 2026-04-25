/**
 * IntelligencePanel — hosts all 10 AI intelligence modules
 * as tabs within the Control Room "Intelligence" section.
 */
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";

// ─────────────────────────────────────────────────────────────────────────────
// Shared fetch hook
// ─────────────────────────────────────────────────────────────────────────────
function useAgentData(clientId, endpoint, getToken) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const token = await getToken();
      const res   = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
      const json  = await res.json();
      if (!res.ok) { setError(json.error || "Failed"); setLoading(false); return; }
      setData(json);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [endpoint]);

  useEffect(() => { if (clientId) load(); }, [clientId]);
  return { data, loading, error, reload: load };
}

async function runAgent(endpoint, getToken, setRunning) {
  setRunning(true);
  try {
    const token = await getToken();
    await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  } catch { /* non-blocking */ }
  setRunning(false);
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared UI helpers
// ─────────────────────────────────────────────────────────────────────────────
function SeverityBadge({ severity, label }) {
  const color = severity === "high" || severity === "critical" ? "#DC2626"
    : severity === "medium" ? "#D97706" : "#059669";
  return (
    <span style={{ fontSize:9, fontWeight:800, padding:"2px 7px", borderRadius:5,
      background:`${color}18`, color }}>
      {(label || severity || "").toUpperCase()}
    </span>
  );
}

function ScoreRing({ score, size = 64, color }) {
  const c = color || (score >= 75 ? "#059669" : score >= 50 ? "#D97706" : "#DC2626");
  return (
    <div style={{ position:"relative", width:size, height:size, flexShrink:0 }}>
      <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={size/2-4} fill="none" stroke="#22222220" strokeWidth={6} />
        <circle cx={size/2} cy={size/2} r={size/2-4} fill="none" stroke={c} strokeWidth={6}
          strokeDasharray={`${2*Math.PI*(size/2-4)}`}
          strokeDashoffset={`${2*Math.PI*(size/2-4) * (1 - (score||0)/100)}`}
          strokeLinecap="round" />
      </svg>
      <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)",
        fontSize:size > 56 ? 14 : 11, fontWeight:800, color:c }}>
        {score ?? "—"}
      </div>
    </div>
  );
}

function EmptyState({ icon, title, sub, onRun, running, txt, txt2, bg2, bdr, B }) {
  return (
    <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:40, textAlign:"center" }}>
      <div style={{ fontSize:32, marginBottom:12 }}>{icon}</div>
      <div style={{ fontSize:14, fontWeight:800, color:txt, marginBottom:8 }}>{title}</div>
      <div style={{ fontSize:12, color:txt2, marginBottom:onRun ? 20 : 0 }}>{sub}</div>
      {onRun && (
        <button onClick={onRun} disabled={running} style={{
          padding:"10px 24px", borderRadius:8, border:"none", background:B, color:"#fff",
          fontSize:13, fontWeight:700, cursor:running?"not-allowed":"pointer", opacity:running?0.7:1,
        }}>
          {running ? "Scanning…" : "Run Scan Now"}
        </button>
      )}
    </div>
  );
}

function IssueCard({ issue, bg2, bdr, txt, txt2 }) {
  return (
    <div style={{ background:bg2, border:`1px solid ${bdr}`,
      borderLeft:`3px solid ${issue.severity==="high"?"#DC2626":issue.severity==="medium"?"#D97706":"#059669"}`,
      borderRadius:8, padding:"12px 14px", marginBottom:6 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
        <SeverityBadge severity={issue.severity} />
        {issue.category && <span style={{ fontSize:9, color:txt2 }}>{issue.category}</span>}
      </div>
      <div style={{ fontSize:12, fontWeight:600, color:txt }}>{issue.issue || issue.title || issue.keyword}</div>
      {(issue.fix || issue.action || issue.refreshAction) && (
        <div style={{ fontSize:11, color:"#059669", marginTop:4 }}>
          Fix: {issue.fix || issue.action || issue.refreshAction}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AI7 — Content Decay Detector
// ─────────────────────────────────────────────────────────────────────────────
function ContentDecayPanel({ clientId, dark, bg2, bg3, bdr, txt, txt2, B, API, getToken }) {
  const { data, loading, error } = useAgentData(clientId, `${API}/api/agents/${clientId}/AI7/results`, getToken);
  const [running, setRunning] = useState(false);

  if (loading) return <div style={{ padding:40, textAlign:"center", color:txt2, fontSize:13 }}>Analysing content decay…</div>;
  if (error) return <div style={{ padding:16, color:"#DC2626", background:"#DC262611", borderRadius:8, fontSize:13 }}>{error}</div>;
  if (!data || data.notRun) return (
    <EmptyState icon="📉" title="Content Decay Detector" txt={txt} txt2={txt2} bg2={bg2} bdr={bdr} B={B}
      sub="Finds pages losing traffic month-over-month and queues them for refresh."
      onRun={() => runAgent(`${API}/api/agents/${clientId}/AI7/scan`, getToken, setRunning)}
      running={running} />
  );

  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:10, marginBottom:20 }}>
        {[
          { label:"Pages Scanned",    value:data.totalPages,   color:B },
          { label:"Decaying Pages",   value:data.decayCount,   color:data.decayCount > 0 ? "#DC2626" : "#059669" },
          { label:"High Severity",    value:data.highDecay,    color:data.highDecay > 0 ? "#DC2626" : "#059669" },
          { label:"Refresh Queued",   value:data.refreshQueued || 0, color:"#059669" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background:bg2, border:`1px solid ${bdr}`, borderTop:`3px solid ${color}`, borderRadius:10, padding:"12px 14px" }}>
            <div style={{ fontSize:22, fontWeight:800, color }}>{value ?? "—"}</div>
            <div style={{ fontSize:11, color:txt2, marginTop:2 }}>{label}</div>
          </div>
        ))}
      </div>

      {data.overallPattern && (
        <div style={{ marginBottom:16, padding:"10px 14px", background:dark?"#ffffff08":"#f5f5f0", borderRadius:8, fontSize:12, color:txt }}>
          <span style={{ fontWeight:700, color:B }}>Pattern: </span>{data.overallPattern}
        </div>
      )}

      {data.decayingPages?.length > 0 ? (
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:0.8, marginBottom:10 }}>
            Decaying Pages
          </div>
          {data.decayingPages.slice(0, 15).map((p, i) => (
            <div key={i} style={{ background:bg2, border:`1px solid ${bdr}`,
              borderLeft:`3px solid ${p.severity==="high"?"#DC2626":p.severity==="medium"?"#D97706":"#059669"}`,
              borderRadius:8, padding:"12px 14px", marginBottom:6 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                    <SeverityBadge severity={p.severity} />
                    <span style={{ fontSize:10, color:"#DC2626", fontWeight:700 }}>-{p.clickDropPct}% clicks</span>
                  </div>
                  <div style={{ fontSize:12, fontWeight:600, color:txt, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {p.page?.replace(/^https?:\/\/[^/]+/, "") || "/"}
                  </div>
                  {p.likelyReason && <div style={{ fontSize:11, color:txt2, marginTop:3 }}>{p.likelyReason}</div>}
                  {p.refreshAction && <div style={{ fontSize:11, color:"#059669", marginTop:3 }}>Fix: {p.refreshAction}</div>}
                </div>
                <div style={{ textAlign:"right", flexShrink:0 }}>
                  <div style={{ fontSize:11, color:txt2 }}>{p.prevClicks}→{p.curClicks} clicks</div>
                  <div style={{ fontSize:10, color:txt2 }}>pos {p.prevPosition}→{p.curPosition}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding:24, textAlign:"center", color:"#059669", fontWeight:700, fontSize:13 }}>
          ✓ No significant content decay detected
        </div>
      )}
      {data.scannedAt && <div style={{ marginTop:12, fontSize:10, color:txt2, textAlign:"right" }}>Scanned: {new Date(data.scannedAt).toLocaleString()}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AI3 — SERP Volatility Monitor
// ─────────────────────────────────────────────────────────────────────────────
function SerpVolatilityPanel({ clientId, dark, bg2, bg3, bdr, txt, txt2, B, API, getToken }) {
  const { data, loading, error } = useAgentData(clientId, `${API}/api/agents/${clientId}/AI3/results`, getToken);
  const [running, setRunning] = useState(false);

  if (loading) return <div style={{ padding:40, textAlign:"center", color:txt2, fontSize:13 }}>Checking SERP volatility…</div>;
  if (error) return <div style={{ padding:16, color:"#DC2626", background:"#DC262611", borderRadius:8, fontSize:13 }}>{error}</div>;
  if (!data || data.notRun) return (
    <EmptyState icon="🌊" title="SERP Volatility Monitor" txt={txt} txt2={txt2} bg2={bg2} bdr={bdr} B={B}
      sub="Detects when Google is reshuffling rankings in your niche — core update early warning."
      onRun={() => runAgent(`${API}/api/agents/${clientId}/AI3/scan`, getToken, setRunning)}
      running={running} />
  );

  const stabColor = data.stability === "stable" ? "#059669" : data.stability === "moderate" ? "#D97706" : "#DC2626";
  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:20, marginBottom:20 }}>
        <ScoreRing score={data.volatilityScore} size={72} color={stabColor} />
        <div>
          <div style={{ fontSize:22, fontWeight:800, color:stabColor, textTransform:"uppercase" }}>
            {data.stability || "Unknown"}
          </div>
          <div style={{ fontSize:12, color:txt2 }}>{data.highVolatileCount} high-volatile keywords · {data.totalTracked} tracked</div>
          {data.activeUpdate && (
            <div style={{ fontSize:11, color:"#DC2626", fontWeight:700, marginTop:4 }}>
              ⚠ {data.activeUpdate.name} — active now
            </div>
          )}
        </div>
      </div>

      {data.interpretation && (
        <div style={{ marginBottom:16, padding:"10px 14px", background:"#0891B211", border:"1px solid #0891B233", borderRadius:8, fontSize:12, color:txt }}>
          {data.interpretation}
        </div>
      )}

      {data.recommendedActions?.length > 0 && (
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", marginBottom:8 }}>Recommended Actions</div>
          {data.recommendedActions.map((a, i) => (
            <div key={i} style={{ fontSize:12, color:txt, padding:"6px 10px", background:bg2, border:`1px solid ${bdr}`, borderRadius:6, marginBottom:4 }}>
              → {a}
            </div>
          ))}
        </div>
      )}

      {data.volatileKeywords?.length > 0 && (
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:0.8, marginBottom:8 }}>Most Volatile Keywords</div>
          {data.volatileKeywords.slice(0, 10).map((k, i) => (
            <div key={i} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:8, padding:"10px 12px", marginBottom:4, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:txt }}>{k.keyword}</div>
                <div style={{ fontSize:10, color:txt2 }}>avg pos {k.avgPosition} · swing ±{k.maxSwing}</div>
              </div>
              <SeverityBadge severity={k.severity} label={`SD ${k.volatility}`} />
            </div>
          ))}
        </div>
      )}
      {data.scannedAt && <div style={{ marginTop:12, fontSize:10, color:txt2, textAlign:"right" }}>Scanned: {new Date(data.scannedAt).toLocaleString()}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AI6 — Negative SEO Shield
// ─────────────────────────────────────────────────────────────────────────────
function NegativeSeoPanel({ clientId, dark, bg2, bg3, bdr, txt, txt2, B, API, getToken }) {
  const { data, loading, error } = useAgentData(clientId, `${API}/api/agents/${clientId}/AI6/results`, getToken);
  const [running, setRunning] = useState(false);
  const [copied, setCopied]   = useState(false);

  if (loading) return <div style={{ padding:40, textAlign:"center", color:txt2, fontSize:13 }}>Scanning for toxic links…</div>;
  if (error) return <div style={{ padding:16, color:"#DC2626", background:"#DC262611", borderRadius:8, fontSize:13 }}>{error}</div>;
  if (!data || data.notRun) return (
    <EmptyState icon="🛡️" title="Negative SEO Shield" txt={txt} txt2={txt2} bg2={bg2} bdr={bdr} B={B}
      sub="Detects toxic backlink spikes that could trigger a Google penalty."
      onRun={() => runAgent(`${API}/api/agents/${clientId}/AI6/scan`, getToken, setRunning)}
      running={running} />
  );

  const riskColor = data.riskLevel === "critical" || data.riskLevel === "high" ? "#DC2626"
    : data.riskLevel === "medium" ? "#D97706" : "#059669";

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:20, marginBottom:20 }}>
        <div style={{ fontSize:36 }}>{data.riskLevel === "low" ? "🛡️" : data.riskLevel === "medium" ? "⚠️" : "🚨"}</div>
        <div>
          <div style={{ fontSize:22, fontWeight:800, color:riskColor, textTransform:"uppercase" }}>{data.riskLevel} RISK</div>
          <div style={{ fontSize:12, color:txt2 }}>{data.suspiciousCount} suspicious links · {data.totalReferringDomains} total domains</div>
          {data.velocitySpike && <div style={{ fontSize:11, color:"#DC2626", fontWeight:700 }}>⚠ Velocity spike: +{data.domainVelocity} new domains since last scan</div>}
        </div>
      </div>

      {data.riskSummary && (
        <div style={{ marginBottom:16, padding:"10px 14px", background:`${riskColor}11`, border:`1px solid ${riskColor}33`, borderRadius:8, fontSize:12, color:txt }}>
          {data.riskSummary}
        </div>
      )}

      {data.disavowFile && (
        <div style={{ marginBottom:16 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase" }}>Disavow File Ready</div>
            <button onClick={() => { navigator.clipboard?.writeText(data.disavowFile); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              style={{ padding:"4px 12px", borderRadius:6, border:`1px solid ${B}`, background:"transparent", color:B, fontSize:11, fontWeight:700, cursor:"pointer" }}>
              {copied ? "✓ Copied" : "Copy Disavow"}
            </button>
          </div>
          <pre style={{ background:dark?"#0a0a0a":"#f5f5f0", border:`1px solid ${bdr}`, borderRadius:8, padding:12, fontSize:10, color:txt2, overflow:"auto", maxHeight:120 }}>
            {data.disavowFile}
          </pre>
          <div style={{ fontSize:10, color:txt2, marginTop:4 }}>Submit this file in Google Search Console → Disavow Links Tool</div>
        </div>
      )}

      {data.suspiciousLinks?.length > 0 && (
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", marginBottom:8 }}>Suspicious Links</div>
          {data.suspiciousLinks.slice(0, 10).map((l, i) => (
            <div key={i} style={{ background:bg2, border:`1px solid #DC262633`, borderLeft:"3px solid #DC2626", borderRadius:8, padding:"10px 12px", marginBottom:4 }}>
              <div style={{ fontSize:12, fontWeight:600, color:txt }}>{l.domain}</div>
              <div style={{ fontSize:10, color:txt2 }}>DA {l.da} · Spam score {l.spamScore} · Anchor: "{l.anchor}"</div>
            </div>
          ))}
        </div>
      )}
      {data.scannedAt && <div style={{ marginTop:12, fontSize:10, color:txt2, textAlign:"right" }}>Scanned: {new Date(data.scannedAt).toLocaleString()}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AI1 — Intent Drift Detector
// ─────────────────────────────────────────────────────────────────────────────
function IntentDriftPanel({ clientId, dark, bg2, bg3, bdr, txt, txt2, B, API, getToken }) {
  const { data, loading, error } = useAgentData(clientId, `${API}/api/agents/${clientId}/AI1/results`, getToken);
  const [running, setRunning] = useState(false);

  if (loading) return <div style={{ padding:40, textAlign:"center", color:txt2, fontSize:13 }}>Checking intent alignment…</div>;
  if (error) return <div style={{ padding:16, color:"#DC2626", background:"#DC262611", borderRadius:8, fontSize:13 }}>{error}</div>;
  if (!data || data.notRun) return (
    <EmptyState icon="🎯" title="Intent Drift Detector" txt={txt} txt2={txt2} bg2={bg2} bdr={bdr} B={B}
      sub="Detects pages where searcher intent doesn't match page content — a common post-update ranking killer."
      onRun={() => runAgent(`${API}/api/agents/${clientId}/AI1/scan`, getToken, setRunning)}
      running={running} />
  );

  const intentColor = { transactional:"#059669", informational:"#0891B2", commercial:"#D97706", navigational:"#888" };

  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:10, marginBottom:20 }}>
        {[
          { label:"Pages Scanned", value:data.pagesScanned, color:B },
          { label:"Drift Detected", value:data.driftCount, color:data.driftCount > 0 ? "#DC2626" : "#059669" },
          { label:"High Severity",  value:data.highDrift,   color:data.highDrift > 0 ? "#DC2626" : "#059669" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background:bg2, border:`1px solid ${bdr}`, borderTop:`3px solid ${color}`, borderRadius:10, padding:"12px 14px" }}>
            <div style={{ fontSize:22, fontWeight:800, color }}>{value ?? "—"}</div>
            <div style={{ fontSize:11, color:txt2, marginTop:2 }}>{label}</div>
          </div>
        ))}
      </div>

      {data.driftPages?.length > 0 ? (
        data.driftPages.map((p, i) => (
          <div key={i} style={{ background:bg2, border:`1px solid ${bdr}`, borderLeft:`3px solid #D97706`, borderRadius:8, padding:"12px 14px", marginBottom:8 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, marginBottom:6 }}>
              <div style={{ fontSize:12, fontWeight:700, color:txt, flex:1 }}>
                {p.page?.replace(/^https?:\/\/[^/]+/, "") || "/"}
              </div>
              <SeverityBadge severity={p.severity} />
            </div>
            <div style={{ display:"flex", gap:8, marginBottom:6 }}>
              <span style={{ fontSize:10, padding:"2px 7px", borderRadius:5, background:`${intentColor[p.queryIntent]||"#888"}18`, color:intentColor[p.queryIntent]||"#888", fontWeight:700 }}>
                Users want: {p.queryIntent}
              </span>
              <span style={{ fontSize:10, padding:"2px 7px", borderRadius:5, background:"#88888818", color:"#888", fontWeight:700 }}>
                Page is: {p.pageIntent}
              </span>
            </div>
            {p.rootCause && <div style={{ fontSize:11, color:txt2, marginBottom:4 }}>{p.rootCause}</div>}
            {p.fix && <div style={{ fontSize:11, color:"#059669", fontWeight:600 }}>Fix: {p.fix}</div>}
            {p.topQueries?.length > 0 && (
              <div style={{ fontSize:10, color:txt2, marginTop:4 }}>
                Top query: "{p.topQueries[0]?.keyword}" ({p.totalClicks} total clicks)
              </div>
            )}
          </div>
        ))
      ) : (
        <div style={{ padding:24, textAlign:"center", color:"#059669", fontWeight:700, fontSize:13 }}>
          ✓ No intent drift detected — all pages match searcher expectations
        </div>
      )}
      {data.scannedAt && <div style={{ marginTop:12, fontSize:10, color:txt2, textAlign:"right" }}>Scanned: {new Date(data.scannedAt).toLocaleString()}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AI2 — Topical Authority Map
// ─────────────────────────────────────────────────────────────────────────────
function TopicalAuthorityPanel({ clientId, dark, bg2, bg3, bdr, txt, txt2, B, API, getToken }) {
  const { data, loading, error } = useAgentData(clientId, `${API}/api/agents/${clientId}/AI2/results`, getToken);
  const [running, setRunning] = useState(false);

  if (loading) return <div style={{ padding:40, textAlign:"center", color:txt2, fontSize:13 }}>Mapping topical authority…</div>;
  if (error) return <div style={{ padding:16, color:"#DC2626", background:"#DC262611", borderRadius:8, fontSize:13 }}>{error}</div>;
  if (!data || data.notRun) return (
    <EmptyState icon="🗺️" title="Topical Authority Map" txt={txt} txt2={txt2} bg2={bg2} bdr={bdr} B={B}
      sub="Maps your topic coverage vs competitors. Gaps = ranking opportunities."
      onRun={() => runAgent(`${API}/api/agents/${clientId}/AI2/scan`, getToken, setRunning)}
      running={running} />
  );

  const coverageColor = (n) => n >= 3 ? "#059669" : n >= 1 ? "#D97706" : "#DC2626";
  const coverageLabel = (n) => n >= 3 ? "Strong" : n >= 2 ? "Moderate" : n >= 1 ? "Thin" : "Missing";

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:20, marginBottom:20 }}>
        <ScoreRing score={data.authorityScore} size={72} />
        <div>
          <div style={{ fontSize:22, fontWeight:800, color:txt }}>Authority Score</div>
          <div style={{ fontSize:12, color:txt2 }}>{data.gapCount} topic gaps · {data.totalClusters} clusters mapped</div>
          {data.summary && <div style={{ fontSize:11, color:txt2, marginTop:4, maxWidth:400 }}>{data.summary}</div>}
        </div>
      </div>

      {data.topGaps?.length > 0 && (
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", marginBottom:10 }}>Priority Gaps</div>
          {data.topGaps.slice(0, 5).map((gap, i) => (
            <div key={i} style={{ background:bg2, border:`1px solid #DC262633`, borderLeft:"3px solid #DC2626", borderRadius:8, padding:"12px 14px", marginBottom:6 }}>
              <div style={{ fontSize:12, fontWeight:700, color:txt, marginBottom:4 }}>{gap.topic}</div>
              <div style={{ fontSize:11, color:txt2, marginBottom:6 }}>{gap.why}</div>
              {gap.suggestedArticles?.length > 0 && (
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  {gap.suggestedArticles.map((a, j) => (
                    <span key={j} style={{ fontSize:10, padding:"2px 8px", borderRadius:5, background:B+"18", color:B, fontWeight:600 }}>{a}</span>
                  ))}
                </div>
              )}
              {gap.estimatedTrafficPotential && (
                <div style={{ fontSize:11, color:"#059669", marginTop:4 }}>Potential: {gap.estimatedTrafficPotential}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {data.topicClusters?.length > 0 && (
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", marginBottom:10 }}>Topic Coverage Map</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:8 }}>
            {data.topicClusters.map((c, i) => (
              <div key={i} style={{ background:bg2, border:`1px solid ${bdr}`, borderTop:`3px solid ${coverageColor(c.ourCoverage)}`, borderRadius:8, padding:"10px 12px" }}>
                <div style={{ fontSize:12, fontWeight:700, color:txt, marginBottom:4 }}>{c.topic}</div>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:10 }}>
                  <span style={{ color:coverageColor(c.ourCoverage), fontWeight:700 }}>Us: {coverageLabel(c.ourCoverage)}</span>
                  <span style={{ color:c.competitorCoverage >= 2 ? "#D97706" : txt2 }}>Comp: {coverageLabel(c.competitorCoverage)}</span>
                </div>
                {c.isGap && <div style={{ fontSize:9, color:"#DC2626", fontWeight:700, marginTop:4 }}>GAP — competitor covers this</div>}
              </div>
            ))}
          </div>
        </div>
      )}
      {data.scannedAt && <div style={{ marginTop:12, fontSize:10, color:txt2, textAlign:"right" }}>Scanned: {new Date(data.scannedAt).toLocaleString()}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AI5 — Seasonal Opportunity Engine
// ─────────────────────────────────────────────────────────────────────────────
function SeasonalOpportunityPanel({ clientId, dark, bg2, bg3, bdr, txt, txt2, B, API, getToken }) {
  const { data, loading, error } = useAgentData(clientId, `${API}/api/agents/${clientId}/AI5/results`, getToken);
  const [running, setRunning] = useState(false);

  if (loading) return <div style={{ padding:40, textAlign:"center", color:txt2, fontSize:13 }}>Predicting seasonal opportunities…</div>;
  if (error) return <div style={{ padding:16, color:"#DC2626", background:"#DC262611", borderRadius:8, fontSize:13 }}>{error}</div>;
  if (!data || data.notRun) return (
    <EmptyState icon="📅" title="Seasonal Opportunity Engine" txt={txt} txt2={txt2} bg2={bg2} bdr={bdr} B={B}
      sub="Predicts demand spikes 60 days ahead so content ranks BEFORE the wave crests."
      onRun={() => runAgent(`${API}/api/agents/${clientId}/AI5/scan`, getToken, setRunning)}
      running={running} />
  );

  const urgencyColor = { "publish now":"#DC2626", "2 weeks":"#D97706", "1 month":"#059669" };

  return (
    <div>
      {data.isApproachingPeak && (
        <div style={{ marginBottom:16, padding:"12px 16px", background:"#D9770611", border:"1px solid #D9770633", borderLeft:"3px solid #D97706", borderRadius:10 }}>
          <div style={{ fontSize:12, fontWeight:800, color:"#D97706" }}>SEASONAL PEAK APPROACHING</div>
          <div style={{ fontSize:12, color:txt, marginTop:4 }}>
            {data.upcomingPeaks.join(", ")} — publish content NOW to rank before peak demand.
          </div>
        </div>
      )}

      {data.seasonalInsight && (
        <div style={{ marginBottom:16, padding:"10px 14px", background:dark?"#ffffff08":"#f5f5f0", borderRadius:8, fontSize:12, color:txt }}>
          {data.seasonalInsight}
        </div>
      )}

      {data.topOpportunity && (
        <div style={{ marginBottom:16, padding:"12px 14px", background:"#05966918", border:"1px solid #05966933", borderRadius:10 }}>
          <div style={{ fontSize:10, fontWeight:700, color:"#059669", textTransform:"uppercase", marginBottom:4 }}>Top Opportunity This Cycle</div>
          <div style={{ fontSize:13, fontWeight:700, color:txt }}>{data.topOpportunity}</div>
        </div>
      )}

      {data.opportunities?.length > 0 && (
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", marginBottom:10 }}>
            Content Calendar — Next 60 Days
          </div>
          {data.opportunities.map((opp, i) => (
            <div key={i} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:8, padding:"12px 14px", marginBottom:8 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:txt, marginBottom:4 }}>{opp.contentTitle}</div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:6 }}>
                    <span style={{ fontSize:10, padding:"2px 7px", borderRadius:5, background:B+"18", color:B, fontWeight:700 }}>{opp.keyword}</span>
                    <span style={{ fontSize:10, padding:"2px 7px", borderRadius:5, background:"#88888818", color:txt2 }}>{opp.contentType}</span>
                    <span style={{ fontSize:10, padding:"2px 7px", borderRadius:5, background:"#05966918", color:"#059669", fontWeight:600 }}>Peak: {opp.peakMonth}</span>
                  </div>
                  {opp.whyNow && <div style={{ fontSize:11, color:txt2 }}>{opp.whyNow}</div>}
                </div>
                <div style={{ flexShrink:0, textAlign:"right" }}>
                  <div style={{ fontSize:10, fontWeight:700, color:urgencyColor[opp.urgency] || "#D97706", marginBottom:2 }}>
                    {opp.urgency?.toUpperCase()}
                  </div>
                  <div style={{ fontSize:9, color:txt2 }}>Publish by {opp.publishBy}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {data.scannedAt && <div style={{ marginTop:12, fontSize:10, color:txt2, textAlign:"right" }}>Scanned: {new Date(data.scannedAt).toLocaleString()}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AI4 — Lead Quality Score
// ─────────────────────────────────────────────────────────────────────────────
function LeadQualityPanel({ clientId, dark, bg2, bg3, bdr, txt, txt2, B, API, getToken }) {
  const { data, loading, error } = useAgentData(clientId, `${API}/api/agents/${clientId}/AI4/results`, getToken);
  const [running, setRunning] = useState(false);

  if (loading) return <div style={{ padding:40, textAlign:"center", color:txt2, fontSize:13 }}>Scoring lead quality…</div>;
  if (error) return <div style={{ padding:16, color:"#DC2626", background:"#DC262611", borderRadius:8, fontSize:13 }}>{error}</div>;
  if (!data || data.notRun) return (
    <EmptyState icon="💰" title="Lead Quality Score" txt={txt} txt2={txt2} bg2={bg2} bdr={bdr} B={B}
      sub="Scores each keyword by revenue potential — not just clicks. Finds zombie traffic."
      onRun={() => runAgent(`${API}/api/agents/${clientId}/AI4/scan`, getToken, setRunning)}
      running={running} />
  );

  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:10, marginBottom:20 }}>
        {[
          { label:"Conversions (90d)", value:data.totalConversions, color:"#059669" },
          { label:"Revenue Attributed", value:data.totalRevenueAttributed ? `£${data.totalRevenueAttributed.toLocaleString()}` : "£0", color:"#D97706" },
          { label:"Keywords Scored",    value:data.totalKeywordsScored, color:B },
          { label:"Zombie Traffic",     value:data.zombieCount, color:data.zombieCount > 0 ? "#DC2626" : "#059669" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background:bg2, border:`1px solid ${bdr}`, borderTop:`3px solid ${color}`, borderRadius:10, padding:"12px 14px" }}>
            <div style={{ fontSize:20, fontWeight:800, color }}>{value ?? "—"}</div>
            <div style={{ fontSize:11, color:txt2, marginTop:2 }}>{label}</div>
          </div>
        ))}
      </div>

      {data.insight && (
        <div style={{ marginBottom:16, padding:"10px 14px", background:"#05966911", border:"1px solid #05966933", borderRadius:8, fontSize:12, color:txt }}>
          {data.insight}
        </div>
      )}

      {data.revenueGrowthPlay && (
        <div style={{ marginBottom:16, padding:"10px 14px", background:B+"11", border:`1px solid ${B}33`, borderRadius:8 }}>
          <div style={{ fontSize:10, fontWeight:700, color:B, textTransform:"uppercase", marginBottom:4 }}>Revenue Growth Play</div>
          <div style={{ fontSize:12, color:txt }}>{data.revenueGrowthPlay}</div>
        </div>
      )}

      {data.topPerformers?.length > 0 && (
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", marginBottom:8 }}>Top Revenue Keywords</div>
          {data.topPerformers.slice(0, 8).map((k, i) => (
            <div key={i} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:8, padding:"10px 12px", marginBottom:4, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:txt }}>{k.keyword}</div>
                <div style={{ fontSize:10, color:txt2 }}>{k.clicks} clicks · pos {k.position} · {k.conversionRate}% CVR</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:12, fontWeight:700, color:"#D97706" }}>£{k.revenueAttributed}</div>
                <div style={{ fontSize:10, color:txt2 }}>score {k.qualityScore}/100</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {data.zombieKeywords?.length > 0 && (
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:"#DC2626", textTransform:"uppercase", marginBottom:8 }}>Zombie Traffic (clicks but no leads)</div>
          {data.zombieKeywords.slice(0, 5).map((k, i) => (
            <div key={i} style={{ background:bg2, border:"1px solid #DC262633", borderLeft:"3px solid #DC2626", borderRadius:8, padding:"10px 12px", marginBottom:4 }}>
              <div style={{ fontSize:12, fontWeight:600, color:txt }}>{k.keyword}</div>
              <div style={{ fontSize:10, color:txt2 }}>{k.clicks} clicks · {k.intent} intent · pos {k.position}</div>
            </div>
          ))}
          {data.zombieReason && <div style={{ fontSize:11, color:txt2, marginTop:8, padding:"8px 12px", background:dark?"#ffffff08":"#f5f5f0", borderRadius:6 }}>{data.zombieReason}</div>}
        </div>
      )}
      {data.scannedAt && <div style={{ marginTop:12, fontSize:10, color:txt2, textAlign:"right" }}>Scanned: {new Date(data.scannedAt).toLocaleString()}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AI8 — Voice Search Optimization
// ─────────────────────────────────────────────────────────────────────────────
function VoiceSearchPanel({ clientId, dark, bg2, bg3, bdr, txt, txt2, B, API, getToken }) {
  const { data, loading, error } = useAgentData(clientId, `${API}/api/agents/${clientId}/AI8/results`, getToken);
  const [running, setRunning] = useState(false);
  const [copied, setCopied]   = useState(null);

  if (loading) return <div style={{ padding:40, textAlign:"center", color:txt2, fontSize:13 }}>Analysing voice search…</div>;
  if (error) return <div style={{ padding:16, color:"#DC2626", background:"#DC262611", borderRadius:8, fontSize:13 }}>{error}</div>;
  if (!data || data.notRun) return (
    <EmptyState icon="🎙️" title="Voice Search Optimization" txt={txt} txt2={txt2} bg2={bg2} bdr={bdr} B={B}
      sub="Optimises for Google Voice, Siri, Alexa — 20% of all searches are voice queries."
      onRun={() => runAgent(`${API}/api/agents/${clientId}/AI8/scan`, getToken, setRunning)}
      running={running} />
  );

  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:10, marginBottom:20 }}>
        {[
          { label:"Voice Score",       value:data.voiceScore, color:data.voiceScore >= 60 ? "#059669" : data.voiceScore >= 40 ? "#D97706" : "#DC2626" },
          { label:"Question Keywords", value:data.questionKeywordCount, color:B },
          { label:"Snippet Opps",      value:data.snippetOpportunities?.length || 0, color:"#D97706" },
          { label:"FAQ Schema Pages",  value:data.faqSchemaPages, color:data.faqSchemaPages > 0 ? "#059669" : "#DC2626" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background:bg2, border:`1px solid ${bdr}`, borderTop:`3px solid ${color}`, borderRadius:10, padding:"12px 14px" }}>
            <div style={{ fontSize:22, fontWeight:800, color }}>{value ?? "—"}</div>
            <div style={{ fontSize:11, color:txt2, marginTop:2 }}>{label}</div>
          </div>
        ))}
      </div>

      {data.quickWins?.length > 0 && (
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", marginBottom:8 }}>Quick Wins</div>
          {data.quickWins.map((w, i) => (
            <div key={i} style={{ fontSize:12, color:txt, padding:"6px 10px", background:"#05966910", borderRadius:6, marginBottom:4 }}>→ {w}</div>
          ))}
        </div>
      )}

      {data.faqItems?.length > 0 && (
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", marginBottom:10 }}>Voice-Ready FAQ Content</div>
          {data.faqItems.slice(0, 5).map((item, i) => (
            <div key={i} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:8, padding:"12px 14px", marginBottom:8 }}>
              <div style={{ fontSize:12, fontWeight:700, color:B, marginBottom:6 }}>Q: {item.question}</div>
              <div style={{ fontSize:12, color:txt, marginBottom:6, lineHeight:1.5 }}>A: {item.voiceAnswer}</div>
              <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                {item.schemaReady && <span style={{ fontSize:9, padding:"2px 6px", background:"#05966918", color:"#059669", borderRadius:4, fontWeight:700 }}>SCHEMA READY</span>}
                <span style={{ fontSize:9, color:txt2 }}>Add to: {item.targetPage}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {data.snippetOpportunities?.length > 0 && (
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", marginBottom:8 }}>Featured Snippet Opportunities</div>
          {data.snippetOpportunities.slice(0, 5).map((s, i) => (
            <div key={i} style={{ background:bg2, border:`1px solid #D9770633`, borderLeft:"3px solid #D97706", borderRadius:8, padding:"10px 12px", marginBottom:4 }}>
              <div style={{ fontSize:12, fontWeight:600, color:txt }}>{s.keyword}</div>
              <div style={{ fontSize:10, color:txt2 }}>Currently pos {s.position} — in snippet range</div>
            </div>
          ))}
        </div>
      )}
      {data.scannedAt && <div style={{ marginTop:12, fontSize:10, color:txt2, textAlign:"right" }}>Scanned: {new Date(data.scannedAt).toLocaleString()}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AI9 — Zero-Click SERP Capture
// ─────────────────────────────────────────────────────────────────────────────
function ZeroClickPanel({ clientId, dark, bg2, bg3, bdr, txt, txt2, B, API, getToken }) {
  const { data, loading, error } = useAgentData(clientId, `${API}/api/agents/${clientId}/AI9/results`, getToken);
  const [running, setRunning] = useState(false);
  const [expandedSchema, setExpandedSchema] = useState(null);

  if (loading) return <div style={{ padding:40, textAlign:"center", color:txt2, fontSize:13 }}>Scanning SERP features…</div>;
  if (error) return <div style={{ padding:16, color:"#DC2626", background:"#DC262611", borderRadius:8, fontSize:13 }}>{error}</div>;
  if (!data || data.notRun) return (
    <EmptyState icon="🎯" title="Zero-Click SERP Capture" txt={txt} txt2={txt2} bg2={bg2} bdr={bdr} B={B}
      sub="Win featured snippets, PAA boxes, and knowledge panels. 65% of searches end with no click — own that space."
      onRun={() => runAgent(`${API}/api/agents/${clientId}/AI9/scan`, getToken, setRunning)}
      running={running} />
  );

  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:10, marginBottom:20 }}>
        {[
          { label:"Zero-Click Keywords",     value:data.zeroClickCount, color:"#D97706" },
          { label:"Missed Impressions/mo",   value:data.totalMissedImpressions?.toLocaleString(), color:"#DC2626" },
          { label:"Capture Opportunities",   value:data.captureItems?.length || 0, color:"#059669" },
          { label:"Missing Schemas",         value:data.missingSchemas?.length || 0, color:data.missingSchemas?.length > 0 ? "#DC2626" : "#059669" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background:bg2, border:`1px solid ${bdr}`, borderTop:`3px solid ${color}`, borderRadius:10, padding:"12px 14px" }}>
            <div style={{ fontSize:20, fontWeight:800, color }}>{value ?? "—"}</div>
            <div style={{ fontSize:11, color:txt2, marginTop:2 }}>{label}</div>
          </div>
        ))}
      </div>

      {data.quickWins?.length > 0 && (
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", marginBottom:8 }}>Quick Wins</div>
          {data.quickWins.map((w, i) => (
            <div key={i} style={{ fontSize:12, color:txt, padding:"6px 10px", background:"#05966910", borderRadius:6, marginBottom:4 }}>→ {w}</div>
          ))}
        </div>
      )}

      {data.captureItems?.length > 0 && (
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", marginBottom:10 }}>Capture Strategy</div>
          {data.captureItems.map((item, i) => (
            <div key={i} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:8, padding:"12px 14px", marginBottom:8 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, marginBottom:6 }}>
                <div style={{ fontSize:12, fontWeight:700, color:txt }}>{item.keyword}</div>
                <div style={{ display:"flex", gap:6 }}>
                  <span style={{ fontSize:9, padding:"2px 7px", borderRadius:5, background:B+"18", color:B, fontWeight:700 }}>{item.targetFeature?.replace(/_/g," ").toUpperCase()}</span>
                  <span style={{ fontSize:9, padding:"2px 7px", borderRadius:5, background:"#05966918", color:"#059669", fontWeight:700 }}>{item.effort} effort</span>
                </div>
              </div>
              <div style={{ fontSize:11, color:txt2, marginBottom:4 }}>{item.pageAction}</div>
              {item.estimatedCtrGain && <div style={{ fontSize:11, color:"#059669", fontWeight:600 }}>CTR gain: {item.estimatedCtrGain}</div>}
              {item.contentSnippet && (
                <div style={{ marginTop:8, padding:"8px 10px", background:dark?"#ffffff08":"#f5f5f0", borderRadius:6, fontSize:11, color:txt, fontStyle:"italic" }}>
                  "{item.contentSnippet}"
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {data.schemaTemplates?.length > 0 && (
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", marginBottom:8 }}>Schema Templates (copy-paste ready)</div>
          {data.schemaTemplates.map((s, i) => (
            <div key={i} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:8, marginBottom:8, overflow:"hidden" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 14px", cursor:"pointer" }}
                onClick={() => setExpandedSchema(expandedSchema === i ? null : i)}>
                <span style={{ fontSize:12, fontWeight:700, color:txt }}>{s.type} Schema</span>
                <span style={{ fontSize:11, color:B }}>{expandedSchema === i ? "▲ hide" : "▼ show"}</span>
              </div>
              {expandedSchema === i && (
                <pre style={{ margin:0, padding:"0 14px 14px", fontSize:10, color:txt2, overflow:"auto", maxHeight:200, background:dark?"#0a0a0a":"#f5f5f0" }}>
                  {s.jsonLd}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
      {data.scannedAt && <div style={{ marginTop:12, fontSize:10, color:txt2, textAlign:"right" }}>Scanned: {new Date(data.scannedAt).toLocaleString()}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AI10 — Agency Benchmark Intelligence
// ─────────────────────────────────────────────────────────────────────────────
function AgencyBenchmarkPanel({ clientId, dark, bg2, bg3, bdr, txt, txt2, B, API, getToken }) {
  const { data, loading, error } = useAgentData(clientId, `${API}/api/agents/${clientId}/AI10/results`, getToken);
  const [running, setRunning] = useState(false);

  if (loading) return <div style={{ padding:40, textAlign:"center", color:txt2, fontSize:13 }}>Benchmarking performance…</div>;
  if (error) return <div style={{ padding:16, color:"#DC2626", background:"#DC262611", borderRadius:8, fontSize:13 }}>{error}</div>;
  if (!data || data.notRun) return (
    <EmptyState icon="📊" title="Agency Benchmark Intelligence" txt={txt} txt2={txt2} bg2={bg2} bdr={bdr} B={B}
      sub="Compares this client vs others in your agency and vs industry averages."
      onRun={() => runAgent(`${API}/api/agents/${clientId}/AI10/scan`, getToken, setRunning)}
      running={running} />
  );

  const posColor = data.competitivePosition === "leader" || data.competitivePosition === "above_average" ? "#059669"
    : data.competitivePosition === "average" ? "#D97706" : "#DC2626";

  return (
    <div>
      {data.reportHeadline && (
        <div style={{ marginBottom:20, padding:"14px 18px", background:B+"11", border:`1px solid ${B}33`, borderRadius:12 }}>
          <div style={{ fontSize:16, fontWeight:800, color:B }}>{data.reportHeadline}</div>
          {data.keyInsight && <div style={{ fontSize:12, color:txt, marginTop:6 }}>{data.keyInsight}</div>}
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:10, marginBottom:20 }}>
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderTop:`3px solid ${posColor}`, borderRadius:10, padding:"12px 14px" }}>
          <div style={{ fontSize:20, fontWeight:800, color:posColor }}>{data.agencyPercentile}th</div>
          <div style={{ fontSize:11, color:txt2, marginTop:2 }}>Agency Percentile</div>
          <div style={{ fontSize:10, color:txt2 }}>rank {data.agencyRank}/{data.agencyTotal}</div>
        </div>
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderTop:`3px solid ${data.vsIndustry >= 0 ? "#059669" : "#DC2626"}`, borderRadius:10, padding:"12px 14px" }}>
          <div style={{ fontSize:20, fontWeight:800, color:data.vsIndustry >= 0 ? "#059669" : "#DC2626" }}>
            {data.vsIndustry >= 0 ? "+" : ""}{data.vsIndustry}
          </div>
          <div style={{ fontSize:11, color:txt2, marginTop:2 }}>vs Industry Avg</div>
          <div style={{ fontSize:10, color:txt2 }}>avg: {data.industryAverage}/100</div>
        </div>
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderTop:`3px solid ${B}`, borderRadius:10, padding:"12px 14px" }}>
          <div style={{ fontSize:20, fontWeight:800, color:B }}>{data.currentScore}</div>
          <div style={{ fontSize:11, color:txt2, marginTop:2 }}>Current Score</div>
          <div style={{ fontSize:10, color:txt2 }}>best: {data.personalBest}</div>
        </div>
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderTop:`3px solid #D97706`, borderRadius:10, padding:"12px 14px" }}>
          <div style={{ fontSize:20, fontWeight:800, color:"#D97706" }}>{data.gapToIndustryLeader}</div>
          <div style={{ fontSize:11, color:txt2, marginTop:2 }}>Points to Leader</div>
          <div style={{ fontSize:10, color:txt2 }}>leader: {data.industryLeaderScore}</div>
        </div>
      </div>

      {data.toReachLeader && (
        <div style={{ marginBottom:16, padding:"12px 14px", background:bg2, border:`1px solid ${bdr}`, borderRadius:10 }}>
          <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", marginBottom:6 }}>Path to Industry Leader ({data.monthsToLeader})</div>
          <div style={{ fontSize:12, color:txt }}>{data.toReachLeader}</div>
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        {data.strengths?.length > 0 && (
          <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"12px 14px" }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#059669", textTransform:"uppercase", marginBottom:8 }}>Strengths</div>
            {data.strengths.map((s, i) => <div key={i} style={{ fontSize:11, color:txt, marginBottom:4 }}>✓ {s}</div>)}
          </div>
        )}
        {data.gaps?.length > 0 && (
          <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"12px 14px" }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#DC2626", textTransform:"uppercase", marginBottom:8 }}>Gaps</div>
            {data.gaps.map((g, i) => <div key={i} style={{ fontSize:11, color:txt, marginBottom:4 }}>→ {g}</div>)}
          </div>
        )}
      </div>
      {data.scannedAt && <div style={{ marginTop:12, fontSize:10, color:txt2, textAlign:"right" }}>Scanned: {new Date(data.scannedAt).toLocaleString()}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Intelligence Panel — tab controller
// ─────────────────────────────────────────────────────────────────────────────
const INTEL_TABS = [
  { id:"decay",     label:"Content Decay",    icon:"📉" },
  { id:"volatility",label:"SERP Volatility",  icon:"🌊" },
  { id:"shield",    label:"Negative SEO",     icon:"🛡️" },
  { id:"intent",    label:"Intent Drift",     icon:"🎯" },
  { id:"topical",   label:"Topical Map",      icon:"🗺️" },
  { id:"seasonal",  label:"Seasonal",         icon:"📅" },
  { id:"leadqual",  label:"Lead Quality",     icon:"💰" },
  { id:"voice",     label:"Voice Search",     icon:"🎙️" },
  { id:"zeroclick", label:"Zero-Click",       icon:"🎯" },
  { id:"benchmark", label:"Benchmark",        icon:"📊" },
];

export default function IntelligencePanel({ dark, clientId, bg2, bg3, bdr, txt, txt2, B }) {
  const { user, API } = useAuth();
  const [tab, setTab] = useState("decay");
  async function getToken() { return user?.getIdToken?.() || ""; }

  const props = { clientId, dark, bg2, bg3, bdr, txt, txt2, B, API, getToken };

  return (
    <div>
      {/* Tab bar — scrollable on mobile */}
      <div style={{ display:"flex", gap:2, marginBottom:20, borderBottom:`1px solid ${bdr}`, overflowX:"auto", paddingBottom:0 }}>
        {INTEL_TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding:"7px 12px", borderRadius:"8px 8px 0 0", border:"none", cursor:"pointer",
              fontSize:11, fontWeight:600, whiteSpace:"nowrap", flexShrink:0,
              background:    tab === t.id ? bg2 : "transparent",
              color:         tab === t.id ? B : txt2,
              borderBottom:  tab === t.id ? `2px solid ${B}` : "2px solid transparent",
            }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === "decay"      && <ContentDecayPanel     {...props} />}
      {tab === "volatility" && <SerpVolatilityPanel   {...props} />}
      {tab === "shield"     && <NegativeSeoPanel      {...props} />}
      {tab === "intent"     && <IntentDriftPanel      {...props} />}
      {tab === "topical"    && <TopicalAuthorityPanel {...props} />}
      {tab === "seasonal"   && <SeasonalOpportunityPanel {...props} />}
      {tab === "leadqual"   && <LeadQualityPanel      {...props} />}
      {tab === "voice"      && <VoiceSearchPanel      {...props} />}
      {tab === "zeroclick"  && <ZeroClickPanel        {...props} />}
      {tab === "benchmark"  && <AgencyBenchmarkPanel  {...props} />}
    </div>
  );
}
