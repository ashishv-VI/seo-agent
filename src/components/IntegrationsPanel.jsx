/**
 * IntegrationsPanel — Level 1 (Connect)
 *
 * WordPress connection UI embedded inside AgentPipeline.
 * Allows agency to connect a client's WordPress site via Application Password.
 * Shows connection status, site info, page/post count, and Yoast status.
 */
import { useState, useEffect } from "react";

const B = "#443DCB";

export default function IntegrationsPanel({ dark, clientId, getToken, API }) {
  const [wpStatus,      setWpStatus]      = useState(null);
  const [gscStatus,     setGscStatus]     = useState(null);   // null | { connected, email, sites[] }
  const [ga4Status,     setGa4Status]     = useState(null);   // null | { connected, email, propertyId, properties[] }
  const [ga4Connecting, setGa4Connecting] = useState(false);
  const [ga4Disconnecting, setGa4Disconnecting] = useState(false);
  const [loading,       setLoading]       = useState(true);
  const [testing,       setTesting]       = useState(false);
  const [connecting,    setConnecting]    = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [gscConnecting, setGscConnecting] = useState(false);
  const [gscDisconnecting, setGscDisconnecting] = useState(false);
  const [showForm,      setShowForm]      = useState(false);
  const [wpPages,       setWpPages]       = useState(null);
  const [loadingPages,  setLoadingPages]  = useState(false);
  const [error,         setError]         = useState("");
  const [success,       setSuccess]       = useState("");

  const [form, setForm] = useState({ url: "", username: "", appPassword: "" });

  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#2a2a2a" : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#777"    : "#888";

  useEffect(() => { loadStatus(); }, [clientId]);

  async function loadStatus() {
    setLoading(true);
    try {
      const token = await getToken();
      const [wpRes, gscRes, ga4Res] = await Promise.all([
        fetch(`${API}/api/integrations/${clientId}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/api/gsc/${clientId}/status`,   { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
        fetch(`${API}/api/ga4/${clientId}/status`,   { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
      ]);
      const wpData  = await wpRes.json();
      const gscData = gscRes ? await gscRes.json().catch(() => null) : null;
      const ga4Data = ga4Res ? await ga4Res.json().catch(() => null) : null;
      setWpStatus(wpData.wordpress || null);
      setGscStatus(gscData?.connected ? gscData : null);
      setGa4Status(ga4Data?.connected ? ga4Data : null);
    } catch { setWpStatus(null); }
    setLoading(false);
  }

  async function connectGSC() {
    setGscConnecting(true); setError(""); setSuccess("");
    try {
      const token = await getToken();
      const res   = await fetch(`${API}/api/gsc/auth-url/${clientId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not get auth URL");
      // Open OAuth in a new tab — user logs in with the CLIENT's Google account
      window.open(data.authUrl, "_blank", "noopener");
      setSuccess("Google OAuth window opened — sign in with the CLIENT's Google account that has Search Console access, then come back and refresh.");
    } catch (e) { setError(e.message); }
    setGscConnecting(false);
  }

  async function disconnectGSC() {
    if (!confirm("Disconnect Search Console? Client's access token will be removed.")) return;
    setGscDisconnecting(true);
    try {
      const token = await getToken();
      const res   = await fetch(`${API}/api/gsc/${clientId}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Disconnect failed");
      setGscStatus(null);
      setSuccess("Search Console disconnected");
    } catch (e) { setError(e.message); }
    setGscDisconnecting(false);
  }

  async function connectGA4() {
    setGa4Connecting(true); setError(""); setSuccess("");
    try {
      const token = await getToken();
      const res   = await fetch(`${API}/api/ga4/auth-url/${clientId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not get auth URL");
      window.open(data.authUrl, "_blank", "noopener");
      setSuccess("Google OAuth window opened — sign in with the CLIENT's Google account that has Analytics access, then come back and refresh.");
    } catch (e) { setError(e.message); }
    setGa4Connecting(false);
  }

  async function disconnectGA4() {
    if (!confirm("Disconnect Google Analytics 4? Client's access token will be removed.")) return;
    setGa4Disconnecting(true);
    try {
      const token = await getToken();
      const res   = await fetch(`${API}/api/ga4/${clientId}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Disconnect failed");
      setGa4Status(null);
      setSuccess("Google Analytics 4 disconnected");
    } catch (e) { setError(e.message); }
    setGa4Disconnecting(false);
  }

  async function connect(e) {
    e.preventDefault();
    setConnecting(true); setError(""); setSuccess("");
    try {
      const token = await getToken();
      const res   = await fetch(`${API}/api/integrations/${clientId}/wordpress/connect`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body:    JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Connection failed");
      setSuccess(`Connected to ${data.siteInfo?.siteName || form.url} — ${data.pageCount} pages, ${data.postCount} posts`);
      setShowForm(false);
      setForm({ url: "", username: "", appPassword: "" });
      await loadStatus();
    } catch (e) { setError(e.message); }
    setConnecting(false);
  }

  async function testConnection() {
    setTesting(true); setError(""); setSuccess("");
    try {
      const token = await getToken();
      const res   = await fetch(`${API}/api/integrations/${clientId}/wordpress/test`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Test failed");
      setSuccess("Connection is healthy");
      await loadStatus();
    } catch (e) { setError(e.message); }
    setTesting(false);
  }

  async function disconnect() {
    if (!confirm("Disconnect WordPress? Credentials will be removed.")) return;
    setDisconnecting(true);
    try {
      const token = await getToken();
      const res   = await fetch(`${API}/api/integrations/${clientId}/wordpress`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Disconnect failed");
      setWpStatus(null);
      setWpPages(null);
      setSuccess("WordPress disconnected");
    } catch (e) { setError(e.message); }
    setDisconnecting(false);
  }

  async function loadPages() {
    setLoadingPages(true); setError("");
    try {
      const token = await getToken();
      const res   = await fetch(`${API}/api/integrations/${clientId}/wordpress/pages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setWpPages(data.pages || []);
    } catch (e) { setError(e.message); }
    setLoadingPages(false);
  }

  if (loading) return (
    <div style={{ padding:24, textAlign:"center", color:txt2, fontSize:13 }}>Loading integrations…</div>
  );

  return (
    <div>
      {error   && <div style={{ padding:"10px 14px", borderRadius:8, background:"#DC262611", color:"#DC2626", fontSize:12, marginBottom:14 }}>{error}<button onClick={()=>setError("")} style={{ marginLeft:8, background:"none", border:"none", color:"#DC2626", cursor:"pointer" }}>×</button></div>}
      {success && <div style={{ padding:"10px 14px", borderRadius:8, background:"#05966911", color:"#059669", fontSize:12, marginBottom:14 }}>{success}<button onClick={()=>setSuccess("")} style={{ marginLeft:8, background:"none", border:"none", color:"#059669", cursor:"pointer" }}>×</button></div>}

      {/* ── WordPress Integration Card ── */}
      <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:14, overflow:"hidden", marginBottom:20 }}>

        {/* Header */}
        <div style={{ padding:"16px 20px", borderBottom:`1px solid ${bdr}`, display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:36, height:36, background:"#21759B", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>W</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:15, fontWeight:700, color:txt }}>WordPress</div>
            <div style={{ fontSize:12, color:txt2 }}>Direct site integration via REST API + Application Password</div>
          </div>
          {wpStatus?.connected
            ? <div style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 12px", borderRadius:20, background:"#05966915", border:"1px solid #05966940" }}>
                <div style={{ width:7, height:7, borderRadius:"50%", background:"#059669" }}/>
                <span style={{ fontSize:12, fontWeight:600, color:"#059669" }}>Connected</span>
              </div>
            : <div style={{ padding:"5px 12px", borderRadius:20, background:bg3, border:`1px solid ${bdr}`, fontSize:12, color:txt2 }}>Not connected</div>
          }
        </div>

        {/* Connected state */}
        {wpStatus?.connected ? (
          <div style={{ padding:"18px 20px" }}>
            {/* Site info grid */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:10, marginBottom:18 }}>
              {[
                { label:"Site", value: wpStatus.siteInfo?.name || "—" },
                { label:"WP Version", value: wpStatus.siteInfo?.wpVersion || "—" },
                { label:"Connected as", value: wpStatus.siteInfo?.userName || "—" },
                { label:"Pages", value: wpStatus.pageCount || "—" },
                { label:"Posts", value: wpStatus.postCount || "—" },
                { label:"Yoast SEO", value: wpStatus.hasYoast ? "✓ Active" : "✗ Not found" },
              ].map(item => (
                <div key={item.label} style={{ background:bg3, borderRadius:8, padding:"10px 12px" }}>
                  <div style={{ fontSize:10, color:txt2, marginBottom:2 }}>{item.label}</div>
                  <div style={{ fontSize:13, fontWeight:600, color: item.label === "Yoast SEO" ? (wpStatus.hasYoast ? "#059669" : txt2) : txt }}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* Yoast warning */}
            {!wpStatus.hasYoast && (
              <div style={{ padding:"10px 14px", borderRadius:8, background:"#D9770611", border:"1px solid #D9770633", fontSize:12, color:"#D97706", marginBottom:14 }}>
                <strong>Yoast SEO not detected</strong> — Install Yoast SEO plugin for meta description and SEO title auto-push to work.
              </div>
            )}

            {/* Credential info */}
            <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px", background:bg3, borderRadius:8, fontSize:12, color:txt2, marginBottom:16 }}>
              <span>🔐</span>
              <span>{wpStatus.url}</span>
              <span style={{ color:bdr }}>·</span>
              <span>Password: {wpStatus.appPasswordMasked}</span>
              {wpStatus.lastSynced && <><span style={{ color:bdr }}>·</span><span>Last synced: {new Date(wpStatus.lastSynced).toLocaleDateString()}</span></>}
            </div>

            {/* Action buttons */}
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              <button onClick={testConnection} disabled={testing}
                style={{ padding:"8px 16px", borderRadius:8, border:`1px solid ${B}`, background:"transparent", color:B, fontSize:12, cursor:"pointer", fontWeight:600 }}>
                {testing ? "Testing…" : "Test Connection"}
              </button>
              <button onClick={loadPages} disabled={loadingPages}
                style={{ padding:"8px 16px", borderRadius:8, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:12, cursor:"pointer" }}>
                {loadingPages ? "Loading…" : `View All Pages (${wpStatus.pageCount || 0})`}
              </button>
              <button onClick={() => setShowForm(true)}
                style={{ padding:"8px 16px", borderRadius:8, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:12, cursor:"pointer" }}>
                Update Credentials
              </button>
              <button onClick={disconnect} disabled={disconnecting}
                style={{ padding:"8px 16px", borderRadius:8, border:"1px solid #DC2626", background:"transparent", color:"#DC2626", fontSize:12, cursor:"pointer" }}>
                {disconnecting ? "Disconnecting…" : "Disconnect"}
              </button>
            </div>

            {/* Pages list */}
            {wpPages && (
              <div style={{ marginTop:16 }}>
                <div style={{ fontSize:13, fontWeight:700, color:txt, marginBottom:10 }}>
                  Pages ({wpPages.length})
                </div>
                <div style={{ maxHeight:300, overflowY:"auto", display:"flex", flexDirection:"column", gap:6 }}>
                  {wpPages.map(page => (
                    <div key={page.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", background:bg3, borderRadius:8 }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12, fontWeight:600, color:txt, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{page.title}</div>
                        <div style={{ fontSize:11, color:txt2 }}>{page.slug}</div>
                      </div>
                      <div style={{ display:"flex", gap:5, flexShrink:0 }}>
                        {page.seoTitle
                          ? <span style={{ fontSize:10, padding:"2px 6px", borderRadius:4, background:"#05966915", color:"#059669" }}>SEO Title ✓</span>
                          : <span style={{ fontSize:10, padding:"2px 6px", borderRadius:4, background:"#DC262615", color:"#DC2626" }}>No SEO Title</span>
                        }
                        {page.metaDescription
                          ? <span style={{ fontSize:10, padding:"2px 6px", borderRadius:4, background:"#05966915", color:"#059669" }}>Meta ✓</span>
                          : <span style={{ fontSize:10, padding:"2px 6px", borderRadius:4, background:"#D9770615", color:"#D97706" }}>No Meta</span>
                        }
                        {page.hasSchema && <span style={{ fontSize:10, padding:"2px 6px", borderRadius:4, background:"#2563EB15", color:"#2563EB" }}>Schema ✓</span>}
                      </div>
                      <a href={page.url} target="_blank" rel="noreferrer"
                        style={{ fontSize:11, color:B, textDecoration:"none" }}>↗</a>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ padding:"20px", textAlign:"center" }}>
            <div style={{ fontSize:32, marginBottom:10 }}>🔌</div>
            <div style={{ fontSize:14, fontWeight:600, color:txt, marginBottom:6 }}>Connect WordPress</div>
            <div style={{ fontSize:12, color:txt2, marginBottom:18, maxWidth:380, margin:"0 auto 18px" }}>
              Connect this client's WordPress site to enable AI auto-push fixes directly to live pages — title tags, meta descriptions, schema markup, and more.
            </div>
            <button onClick={() => setShowForm(true)}
              style={{ padding:"10px 24px", borderRadius:10, border:"none", background:B, color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer" }}>
              Connect WordPress
            </button>
          </div>
        )}

        {/* Connection Form */}
        {showForm && (
          <div style={{ padding:"18px 20px", borderTop:`1px solid ${bdr}`, background:bg3 }}>
            <div style={{ fontSize:14, fontWeight:700, color:txt, marginBottom:14 }}>WordPress Connection Details</div>

            <div style={{ padding:"12px 14px", borderRadius:8, background: dark?"#1a1a00":"#fffbeb", border:"1px solid #D9770633", fontSize:12, color:"#D97706", marginBottom:16 }}>
              <strong>How to get Application Password:</strong><br/>
              WP Admin → Users → Your Profile → scroll to <em>Application Passwords</em> → type "SEO Agent" → click Add New → copy the password shown.
            </div>

            <form onSubmit={connect}>
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                <div>
                  <label style={{ fontSize:11, color:txt2, display:"block", marginBottom:4 }}>WordPress Site URL</label>
                  <input
                    type="url"
                    placeholder="https://example.com"
                    value={form.url}
                    onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                    required
                    style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:bg2, color:txt, fontSize:13, outline:"none", boxSizing:"border-box" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize:11, color:txt2, display:"block", marginBottom:4 }}>WordPress Username</label>
                  <input
                    type="text"
                    placeholder="admin"
                    value={form.username}
                    onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                    required
                    style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:bg2, color:txt, fontSize:13, outline:"none", boxSizing:"border-box" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize:11, color:txt2, display:"block", marginBottom:4 }}>Application Password</label>
                  <input
                    type="password"
                    placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
                    value={form.appPassword}
                    onChange={e => setForm(f => ({ ...f, appPassword: e.target.value }))}
                    required
                    style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:bg2, color:txt, fontSize:13, outline:"none", boxSizing:"border-box", fontFamily:"monospace" }}
                  />
                  <div style={{ fontSize:11, color:txt2, marginTop:4 }}>Use Application Password, NOT your WordPress login password.</div>
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button type="submit" disabled={connecting}
                    style={{ flex:1, padding:"10px 0", borderRadius:8, border:"none", background:B, color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer" }}>
                    {connecting ? "Connecting…" : "Test & Connect"}
                  </button>
                  <button type="button" onClick={() => { setShowForm(false); setError(""); }}
                    style={{ padding:"10px 18px", borderRadius:8, border:`1px solid ${bdr}`, background:"transparent", color:txt2, fontSize:13, cursor:"pointer" }}>
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* ── Google Search Console Integration ── */}
      <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:14, overflow:"hidden", marginBottom:20 }}>
        {/* Header */}
        <div style={{ padding:"16px 20px", borderBottom:`1px solid ${bdr}`, display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:36, height:36, background:"#EA4335", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>G</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:15, fontWeight:700, color:txt }}>Google Search Console</div>
            <div style={{ fontSize:12, color:txt2 }}>Per-client OAuth — each client connects their own Google account. No site verification by agency needed.</div>
          </div>
          {gscStatus?.connected
            ? <div style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 12px", borderRadius:20, background:"#05966915", border:"1px solid #05966940" }}>
                <div style={{ width:7, height:7, borderRadius:"50%", background:"#059669" }}/>
                <span style={{ fontSize:12, fontWeight:600, color:"#059669" }}>Connected</span>
              </div>
            : <div style={{ padding:"5px 12px", borderRadius:20, background:bg3, border:`1px solid ${bdr}`, fontSize:12, color:txt2 }}>Not connected</div>
          }
        </div>

        <div style={{ padding:"18px 20px" }}>
          {gscStatus?.connected ? (
            <>
              {/* Connected state */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:10, marginBottom:16 }}>
                {[
                  { label:"Google Account", value: gscStatus.email || "—" },
                  { label:"Sites Accessible", value: gscStatus.sites?.length ?? "—" },
                  { label:"Connected", value: gscStatus.connectedAt ? new Date(gscStatus.connectedAt).toLocaleDateString() : "—" },
                ].map(i => (
                  <div key={i.label} style={{ padding:"10px 12px", borderRadius:8, background:bg3, border:`1px solid ${bdr}` }}>
                    <div style={{ fontSize:10, fontWeight:700, color:txt2, marginBottom:3 }}>{i.label.toUpperCase()}</div>
                    <div style={{ fontSize:13, fontWeight:600, color:txt, wordBreak:"break-all" }}>{i.value}</div>
                  </div>
                ))}
              </div>

              {/* Accessible sites list */}
              {gscStatus.sites?.length > 0 && (
                <div style={{ marginBottom:14 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:txt2, marginBottom:6 }}>ACCESSIBLE SITES IN SEARCH CONSOLE</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                    {gscStatus.sites.map(s => (
                      <div key={s.url} style={{ padding:"4px 10px", borderRadius:6, background:`${B}11`, border:`1px solid ${B}33`, fontSize:11, color:B }}>
                        {s.url}
                        <span style={{ color:txt2, marginLeft:6 }}>({s.permissionLevel})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display:"flex", gap:8 }}>
                <button onClick={connectGSC} disabled={gscConnecting}
                  style={{ padding:"7px 16px", borderRadius:8, border:`1px solid ${bdr}`, background:"transparent", color:txt2, fontSize:12, cursor:"pointer" }}>
                  🔄 Reconnect
                </button>
                <button onClick={disconnectGSC} disabled={gscDisconnecting}
                  style={{ padding:"7px 16px", borderRadius:8, border:"1px solid #DC262633", background:"#DC262611", color:"#DC2626", fontSize:12, cursor:"pointer" }}>
                  {gscDisconnecting ? "Disconnecting…" : "Disconnect"}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Not connected state */}
              <div style={{ padding:"14px 16px", borderRadius:10, background:"#443DCB11", border:"1px solid #443DCB33", marginBottom:16 }}>
                <div style={{ fontSize:12, fontWeight:700, color:"#6B62E8", marginBottom:6 }}>How per-client GSC connection works</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:8 }}>
                  {[
                    { n:"1", t:"Click Connect below", d:"Opens Google OAuth in a new tab" },
                    { n:"2", t:"Client's Google account", d:"Sign in with the Google account that has Search Console access for this client's site" },
                    { n:"3", t:"One-time only", d:"We store a refresh token — works permanently without re-auth" },
                    { n:"4", t:"No agency verification", d:"Agency never needs to add sites to their own Google account" },
                  ].map(s => (
                    <div key={s.n} style={{ padding:"8px 10px", borderRadius:8, background:bg2, border:`1px solid ${bdr}` }}>
                      <div style={{ fontSize:10, fontWeight:700, color:"#6B62E8", marginBottom:2 }}>STEP {s.n} · {s.t}</div>
                      <div style={{ fontSize:11, color:txt2 }}>{s.d}</div>
                    </div>
                  ))}
                </div>
              </div>

              <button onClick={connectGSC} disabled={gscConnecting}
                style={{ padding:"10px 24px", borderRadius:8, background: gscConnecting ? "#666" : "#EA4335", color:"#fff", fontWeight:700, fontSize:13, cursor: gscConnecting ? "not-allowed" : "pointer", border:"none" }}>
                {gscConnecting ? "Opening…" : "🔗 Connect Search Console"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Google Analytics 4 Integration ── */}
      <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:14, overflow:"hidden", marginBottom:20 }}>
        {/* Header */}
        <div style={{ padding:"16px 20px", borderBottom:`1px solid ${bdr}`, display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:36, height:36, background:"#F9AB00", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>📊</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:15, fontWeight:700, color:txt }}>Google Analytics 4</div>
            <div style={{ fontSize:12, color:txt2 }}>Per-client OAuth — live multi-page analytics, traffic sources, user journeys</div>
          </div>
          {ga4Status?.connected
            ? <div style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 12px", borderRadius:20, background:"#05966915", border:"1px solid #05966940" }}>
                <div style={{ width:7, height:7, borderRadius:"50%", background:"#059669" }}/>
                <span style={{ fontSize:12, fontWeight:600, color:"#059669" }}>Connected</span>
              </div>
            : <div style={{ padding:"5px 12px", borderRadius:20, background:bg3, border:`1px solid ${bdr}`, fontSize:12, color:txt2 }}>Not connected</div>
          }
        </div>

        <div style={{ padding:"18px 20px" }}>
          {ga4Status?.connected ? (
            <>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:10, marginBottom:16 }}>
                {[
                  { label:"Google Account", value: ga4Status.email || "—" },
                  { label:"Properties",     value: ga4Status.properties?.length ?? "—" },
                  { label:"Active Property", value: ga4Status.propertyId || "Not selected" },
                  { label:"Connected",      value: ga4Status.connectedAt ? new Date(ga4Status.connectedAt).toLocaleDateString() : "—" },
                ].map(i => (
                  <div key={i.label} style={{ padding:"10px 12px", borderRadius:8, background:bg3, border:`1px solid ${bdr}` }}>
                    <div style={{ fontSize:10, fontWeight:700, color:txt2, marginBottom:3 }}>{i.label.toUpperCase()}</div>
                    <div style={{ fontSize:13, fontWeight:600, color: i.label==="Active Property" && !ga4Status.propertyId ? "#D97706" : txt, wordBreak:"break-all" }}>{i.value}</div>
                  </div>
                ))}
              </div>

              {!ga4Status.propertyId && (
                <div style={{ padding:"10px 14px", borderRadius:8, background:"#D9770611", border:"1px solid #D9770633", fontSize:12, color:"#D97706", marginBottom:14 }}>
                  <strong>Select a GA4 property</strong> — go to the Analytics tab and choose which property to use for this client.
                </div>
              )}

              <div style={{ display:"flex", gap:8 }}>
                <button onClick={connectGA4} disabled={ga4Connecting}
                  style={{ padding:"7px 16px", borderRadius:8, border:`1px solid ${bdr}`, background:"transparent", color:txt2, fontSize:12, cursor:"pointer" }}>
                  🔄 Reconnect
                </button>
                <button onClick={disconnectGA4} disabled={ga4Disconnecting}
                  style={{ padding:"7px 16px", borderRadius:8, border:"1px solid #DC262633", background:"#DC262611", color:"#DC2626", fontSize:12, cursor:"pointer" }}>
                  {ga4Disconnecting ? "Disconnecting…" : "Disconnect"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ padding:"14px 16px", borderRadius:10, background:"#F9AB0011", border:"1px solid #F9AB0033", marginBottom:16 }}>
                <div style={{ fontSize:12, fontWeight:700, color:"#8B6914", marginBottom:6 }}>What you get with GA4 connected</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:8 }}>
                  {[
                    { icon:"📊", t:"Live multi-page analytics", d:"Sessions, users, and views across every page" },
                    { icon:"🔗", t:"Traffic source breakdown", d:"Organic, direct, referral, social — per channel" },
                    { icon:"🗺", t:"User journey tracking", d:"Where users enter, navigate, and exit" },
                    { icon:"🟢", t:"Real-time active users", d:"See who's on the site right now" },
                  ].map(f => (
                    <div key={f.t} style={{ padding:"8px 10px", borderRadius:8, background:bg2, border:`1px solid ${bdr}` }}>
                      <div style={{ fontSize:16, marginBottom:3 }}>{f.icon}</div>
                      <div style={{ fontSize:11, fontWeight:700, color:txt, marginBottom:2 }}>{f.t}</div>
                      <div style={{ fontSize:10, color:txt2 }}>{f.d}</div>
                    </div>
                  ))}
                </div>
              </div>

              <button onClick={connectGA4} disabled={ga4Connecting}
                style={{ padding:"10px 24px", borderRadius:8, background: ga4Connecting ? "#666" : "#F9AB00", color:"#1a1a00", fontWeight:700, fontSize:13, cursor: ga4Connecting ? "not-allowed" : "pointer", border:"none" }}>
                {ga4Connecting ? "Opening…" : "📊 Connect Google Analytics 4"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── How Auto-Push Works ── */}
      <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:14, padding:"18px 20px" }}>
        <div style={{ fontSize:14, fontWeight:700, color:txt, marginBottom:12 }}>How Auto-Push Works</div>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {[
            { step:"1", icon:"🤖", title:"AI analyzes your site", desc:"The pipeline runs and detects SEO issues (missing titles, bad meta, schema gaps)" },
            { step:"2", icon:"✏️", title:"AI generates the fix", desc:"A12 auto-generates the exact text — ready-to-use title tags, meta descriptions, JSON-LD schema" },
            { step:"3", icon:"✅", title:"You approve", desc:"Fixes appear in the Approvals tab. Review and click Approve for each one you're happy with" },
            { step:"4", icon:"🚀", title:"Auto-push to WordPress", desc:"Click 'Push to WordPress' and the fix goes live on your site instantly via REST API — no manual editing" },
          ].map(item => (
            <div key={item.step} style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
              <div style={{ width:28, height:28, borderRadius:"50%", background:`${B}20`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, flexShrink:0 }}>{item.icon}</div>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:txt }}>{item.title}</div>
                <div style={{ fontSize:12, color:txt2, lineHeight:1.5 }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
