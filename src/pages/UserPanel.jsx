/**
 * UserPanel — Full Admin User Management
 * Phase 1: Signup feed, NEW badge, date filters, login activity
 * Phase 2: User detail drawer, plan/role editor, onboarding progress, API key status
 * Phase 3: Bulk actions, CSV export, usage stats
 */
import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";

const B   = "#443DCB";
const B2  = "#6B62E8";

// ── Small helper components ─────────────────────────

function Badge({ label, color, bg }) {
  return (
    <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, fontWeight:700, background:bg||`${color}18`, color }}>
      {label}
    </span>
  );
}

function ApiDot({ ok, label }) {
  return (
    <span title={`${label}: ${ok ? "Connected" : "Not set"}`} style={{
      display:"inline-flex", alignItems:"center", gap:4, fontSize:10,
      padding:"2px 7px", borderRadius:8,
      background: ok ? "#05966918" : "#6B728018",
      color: ok ? "#059669" : "#9CA3AF",
      fontWeight:600,
    }}>
      <span style={{ width:6, height:6, borderRadius:"50%", background: ok ? "#059669" : "#6B7280", display:"inline-block" }}/>
      {label}
    </span>
  );
}

function OnboardingBar({ pct, steps }) {
  const color = pct === 100 ? "#059669" : pct >= 60 ? "#D97706" : "#DC2626";
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
        <span style={{ fontSize:10, color:"#6B7280" }}>Onboarding</span>
        <span style={{ fontSize:10, fontWeight:700, color }}>{pct}%</span>
      </div>
      <div style={{ height:4, borderRadius:4, background:"#e5e7eb", overflow:"hidden" }}>
        <div style={{ width:`${pct}%`, height:"100%", background:color, borderRadius:4, transition:"width 0.4s" }}/>
      </div>
    </div>
  );
}

// ── User Detail Drawer ──────────────────────────────
function UserDrawer({ uid, API, getToken, dark, onClose, onSaved, showToast }) {
  const [detail,  setDetail]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState("overview"); // overview | clients | activity | edit
  const [saving,  setSaving]  = useState(false);
  const [form,    setForm]    = useState({ plan:"free", role:"user", notes:"" });

  const bg   = dark ? "#111"    : "#ffffff";
  const bg2  = dark ? "#1a1a1a" : "#f5f5f0";
  const bg3  = dark ? "#222"    : "#ebebeb";
  const bdr  = dark ? "#2a2a2a" : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const token = await getToken();
        const res   = await fetch(`${API}/api/admin/users/${uid}/detail`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setDetail(data);
        setForm({ plan: data.plan || "free", role: data.role || "user", notes: data.notes || "" });
      } catch(e) { showToast("Failed to load user detail", "error"); }
      setLoading(false);
    })();
  }, [uid]);

  async function save() {
    setSaving(true);
    try {
      const token = await getToken();
      const res   = await fetch(`${API}/api/admin/users/${uid}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error, "error"); }
      else { showToast("User updated successfully"); onSaved(); setDetail(d => ({ ...d, ...form })); }
    } catch(e) { showToast(e.message, "error"); }
    setSaving(false);
  }

  function fmtDate(d) {
    if (!d) return "—";
    return new Date(d).toLocaleString("en-GB", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
  }

  const TABS = [
    { id:"overview",  label:"Overview"  },
    { id:"clients",   label:`Clients (${detail?.clientCount || 0})` },
    { id:"activity",  label:"Login Activity" },
    { id:"edit",      label:"Edit" },
  ];

  return (
    <div style={{ position:"fixed", inset:0, zIndex:9990, display:"flex" }}>
      {/* Backdrop */}
      <div style={{ flex:1, background:"rgba(0,0,0,0.5)" }} onClick={onClose}/>
      {/* Drawer */}
      <div style={{
        width: Math.min(560, window.innerWidth - 20),
        background:bg, borderLeft:`1px solid ${bdr}`,
        overflowY:"auto", display:"flex", flexDirection:"column",
        boxShadow:"-8px 0 40px rgba(0,0,0,0.3)",
      }}>
        {/* Header */}
        <div style={{ padding:"20px 24px", borderBottom:`1px solid ${bdr}`, display:"flex", alignItems:"center", gap:14 }}>
          <div style={{
            width:48, height:48, borderRadius:"50%", flexShrink:0,
            background:`linear-gradient(135deg,${B},#3730b8)`,
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:18, fontWeight:800, color:"#fff",
          }}>
            {detail?.name?.charAt(0)?.toUpperCase() || "?"}
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:15, fontWeight:700, color:txt }}>{detail?.name || "Loading..."}</div>
            <div style={{ fontSize:12, color:txt2 }}>{detail?.email}</div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:`1px solid ${bdr}`, color:txt2, cursor:"pointer", borderRadius:8, padding:"6px 12px", fontSize:13 }}>✕ Close</button>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", gap:0, borderBottom:`1px solid ${bdr}` }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex:1, padding:"10px 4px", background:"none", border:"none", borderBottom:`2px solid ${tab===t.id ? B : "transparent"}`,
              color: tab===t.id ? B : txt2, fontSize:11, fontWeight:tab===t.id?700:400, cursor:"pointer",
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding:40, textAlign:"center", color:txt2 }}>Loading...</div>
        ) : (
          <div style={{ padding:"20px 24px", flex:1 }}>

            {/* ── OVERVIEW TAB ── */}
            {tab === "overview" && detail && (
              <div>
                {/* Badges row */}
                <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:16 }}>
                  <Badge label={detail.disabled ? "🚫 Blocked" : "✅ Active"} color={detail.disabled?"#DC2626":"#059669"}/>
                  <Badge label={detail.plan === "pro" ? "⭐ Pro" : detail.plan === "agency" ? "🏢 Agency" : "Free"} color={detail.plan==="pro"?"#D97706":B}/>
                  <Badge label={detail.provider === "google.com" ? "🔵 Google" : "📧 Email"} color="#6B7280"/>
                  {detail.isNew && <Badge label="🆕 NEW" color="#059669"/>}
                </div>

                {/* Key stats */}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:16 }}>
                  {[
                    { l:"Clients",   v: detail.clientCount,   c:B },
                    { l:"Pipelines", v: detail.pipelineCount, c:"#059669" },
                    { l:"Logins",    v: detail.loginCount,    c:"#0891B2" },
                  ].map(s => (
                    <div key={s.l} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"12px 14px", textAlign:"center" }}>
                      <div style={{ fontSize:22, fontWeight:800, color:s.c }}>{s.v}</div>
                      <div style={{ fontSize:10, color:txt2 }}>{s.l}</div>
                    </div>
                  ))}
                </div>

                {/* Dates */}
                <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"12px 14px", marginBottom:14 }}>
                  <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:12 }}>
                      <span style={{ color:txt2 }}>Joined</span>
                      <span style={{ color:txt, fontWeight:600 }}>{fmtDate(detail.createdAt)}</span>
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:12 }}>
                      <span style={{ color:txt2 }}>Last login</span>
                      <span style={{ color:txt, fontWeight:600 }}>{fmtDate(detail.lastSignIn)}</span>
                    </div>
                  </div>
                </div>

                {/* API Key Status */}
                <div style={{ marginBottom:14 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:0.5, marginBottom:8 }}>API Keys Connected</div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    <ApiDot ok={detail.apiKeys?.groq}       label="Groq AI"/>
                    <ApiDot ok={detail.apiKeys?.gemini}     label="Gemini"/>
                    <ApiDot ok={detail.apiKeys?.google}     label="Google"/>
                    <ApiDot ok={detail.apiKeys?.openrouter} label="OpenRouter"/>
                    <ApiDot ok={detail.apiKeys?.serpapi}    label="SerpAPI"/>
                    <ApiDot ok={detail.apiKeys?.seranking}  label="SE Ranking"/>
                    <ApiDot ok={detail.apiKeys?.semrush}    label="Semrush"/>
                    <ApiDot ok={detail.apiKeys?.dataforseo} label="DataForSEO"/>
                  </div>
                </div>

                {/* Onboarding */}
                <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"12px 14px", marginBottom:14 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:txt2, textTransform:"uppercase", letterSpacing:0.5, marginBottom:10 }}>Onboarding Progress</div>
                  <OnboardingBar pct={detail.onboardingPct} />
                  <div style={{ marginTop:10, display:"flex", flexDirection:"column", gap:5 }}>
                    {Object.entries(detail.onboarding || {}).map(([step, done]) => (
                      <div key={step} style={{ display:"flex", alignItems:"center", gap:8, fontSize:12 }}>
                        <span style={{ color: done ? "#059669" : "#9CA3AF" }}>{done ? "✓" : "○"}</span>
                        <span style={{ color: done ? txt : txt2 }}>
                          {{ createdAccount:"Created account", addedApiKey:"Added API key", addedClient:"Added first client", ranPipeline:"Ran first pipeline", viewedReport:"Viewed report" }[step] || step}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Notes preview */}
                {detail.notes && (
                  <div style={{ background:`${B}0d`, border:`1px solid ${B}22`, borderRadius:10, padding:"12px 14px" }}>
                    <div style={{ fontSize:11, fontWeight:700, color:B, marginBottom:4 }}>Admin Notes</div>
                    <div style={{ fontSize:12, color:txt, lineHeight:1.6 }}>{detail.notes}</div>
                  </div>
                )}
              </div>
            )}

            {/* ── CLIENTS TAB ── */}
            {tab === "clients" && (
              <div>
                {detail?.clients?.length === 0 ? (
                  <div style={{ textAlign:"center", padding:40, color:txt2 }}>No clients yet</div>
                ) : detail?.clients?.map(c => {
                  const sc = c.pipelineStatus;
                  const scColor = sc === "complete" ? "#059669" : sc === "running" ? "#D97706" : "#6B7280";
                  return (
                    <div key={c.id} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"12px 14px", marginBottom:8 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                        <div>
                          <div style={{ fontSize:13, fontWeight:700, color:txt }}>{c.name}</div>
                          <div style={{ fontSize:11, color:txt2 }}>{c.website}</div>
                        </div>
                        <div style={{ textAlign:"right" }}>
                          <Badge label={sc} color={scColor}/>
                          {c.seoScore != null && (
                            <div style={{ fontSize:13, fontWeight:800, color:B, marginTop:4 }}>{c.seoScore}/100</div>
                          )}
                        </div>
                      </div>
                      {c.lastRun && (
                        <div style={{ fontSize:10, color:txt2, marginTop:6 }}>Last run: {fmtDate(c.lastRun)}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── ACTIVITY TAB ── */}
            {tab === "activity" && (
              <div>
                <div style={{ fontSize:11, color:txt2, marginBottom:12 }}>Last {detail?.loginActivity?.length || 0} login events recorded</div>
                {(detail?.loginActivity || []).length === 0 ? (
                  <div style={{ textAlign:"center", padding:40, color:txt2 }}>
                    <div style={{ fontSize:32, marginBottom:8 }}>📭</div>
                    <div>No login activity recorded yet</div>
                    <div style={{ fontSize:11, color:txt2, marginTop:4 }}>Login events are recorded from the next sign-in</div>
                  </div>
                ) : (detail?.loginActivity || []).map((ev, i) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderBottom:`1px solid ${bdr}` }}>
                    <div style={{
                      width:32, height:32, borderRadius:"50%", flexShrink:0,
                      background: ev.provider === "google" ? "#4285F418" : `${B}18`,
                      display:"flex", alignItems:"center", justifyContent:"center", fontSize:14,
                    }}>
                      {ev.provider === "google" ? "🔵" : ev.method === "register" ? "🆕" : "🔑"}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12, color:txt, fontWeight:600 }}>
                        {ev.method === "register" ? "Account Created" : "Signed In"} via {ev.provider === "google" ? "Google" : "Email"}
                      </div>
                      <div style={{ fontSize:10, color:txt2 }}>{fmtDate(ev.timestamp)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── EDIT TAB ── */}
            {tab === "edit" && (
              <div>
                <div style={{ marginBottom:16 }}>
                  <label style={{ fontSize:12, fontWeight:700, color:txt2, display:"block", marginBottom:6 }}>Plan</label>
                  <select
                    value={form.plan}
                    onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}
                    style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:bg2, color:txt, fontSize:13, outline:"none" }}
                  >
                    <option value="free">Free</option>
                    <option value="pro">⭐ Pro</option>
                    <option value="agency">🏢 Agency</option>
                  </select>
                </div>

                <div style={{ marginBottom:16 }}>
                  <label style={{ fontSize:12, fontWeight:700, color:txt2, display:"block", marginBottom:6 }}>Role</label>
                  <select
                    value={form.role}
                    onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                    style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:bg2, color:txt, fontSize:13, outline:"none" }}
                  >
                    <option value="user">User</option>
                    <option value="agency">Agency</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div style={{ marginBottom:20 }}>
                  <label style={{ fontSize:12, fontWeight:700, color:txt2, display:"block", marginBottom:6 }}>Admin Notes (internal only)</label>
                  <textarea
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Add notes about this user — onboarding status, support history, etc."
                    rows={5}
                    style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:bg2, color:txt, fontSize:13, outline:"none", resize:"vertical", boxSizing:"border-box" }}
                  />
                </div>

                <button
                  onClick={save}
                  disabled={saving}
                  style={{ width:"100%", padding:"11px", borderRadius:8, border:"none", background:B, color:"#fff", fontSize:13, fontWeight:700, cursor:saving?"not-allowed":"pointer", opacity:saving?0.7:1 }}
                >
                  {saving ? "Saving..." : "💾 Save Changes"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════
export default function UserPanel({ dark }) {
  const { user, API } = useAuth();

  const [users,      setUsers]      = useState([]);
  const [stats,      setStats]      = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState("");
  const [statusFilter, setStatusFilter] = useState("all");    // all | active | blocked
  const [dateFilter,   setDateFilter]   = useState("all");    // all | today | week | month
  const [sortBy,       setSortBy]       = useState("newest"); // newest | lastlogin | clients
  const [acting,     setActing]     = useState(null);
  const [toast,      setToast]      = useState(null);
  const [confirm,    setConfirm]    = useState(null);
  const [resetLink,  setResetLink]  = useState(null);
  const [notAdmin,   setNotAdmin]   = useState(false);
  const [apiError,   setApiError]   = useState("");
  const [selected,   setSelected]   = useState(new Set());    // bulk select
  const [bulkAction, setBulkAction] = useState("block");
  const [bulkPlan,   setBulkPlan]   = useState("pro");
  const [drawerUid,  setDrawerUid]  = useState(null);        // user detail drawer

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const txt3 = dark ? "#333"    : "#ccc";

  async function getToken() { return user?.getIdToken?.() || ""; }

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  async function load(silent = false) {
    if (!silent) setLoading(true);
    setApiError("");
    try {
      const token = await getToken();
      const [usersRes, statsRes] = await Promise.all([
        fetch(`${API}/api/admin/users`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/api/admin/stats`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (usersRes.status === 403) { setNotAdmin(true); setLoading(false); return; }

      const [usersData, statsData] = await Promise.all([
        usersRes.json(),
        statsRes.json(),
      ]);

      // Any non-200 from users endpoint — show the actual server error
      if (!usersRes.ok) {
        setApiError(usersData.error || `Server error ${usersRes.status}`);
        if (!silent) setLoading(false);
        return;
      }

      setUsers(usersData.users || []);
      setStats(statsData.error ? null : statsData);
    } catch (e) {
      setApiError("Network error: " + e.message);
    }
    if (!silent) setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // ── Filtering & sorting ──────────────────────────
  const now = Date.now();
  const filtered = users.filter(u => {
    const matchSearch = !search ||
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" ||
      (statusFilter === "blocked" ? u.disabled : !u.disabled);
    const createdMs = u.createdAt ? new Date(u.createdAt).getTime() : 0;
    const matchDate =
      dateFilter === "all"   ? true :
      dateFilter === "today" ? (now - createdMs) < 86400000 :
      dateFilter === "week"  ? (now - createdMs) < 7 * 86400000 :
      dateFilter === "month" ? (now - createdMs) < 30 * 86400000 : true;
    return matchSearch && matchStatus && matchDate;
  }).sort((a, b) => {
    if (sortBy === "newest")    return new Date(b.createdAt) - new Date(a.createdAt);
    if (sortBy === "lastlogin") return new Date(b.lastSignIn || 0) - new Date(a.lastSignIn || 0);
    if (sortBy === "clients")   return b.clientCount - a.clientCount;
    return 0;
  });

  // New users in last 7 days for the feed
  const newSignups = users
    .filter(u => u.isNew)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 8);

  // ── Actions ──────────────────────────────────────
  async function sendReset(uid) {
    setActing(uid);
    try {
      const token = await getToken();
      const res   = await fetch(`${API}/api/admin/users/${uid}/reset-password`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) showToast(data.error, "error");
      else setResetLink({ email: data.email, link: data.resetLink });
    } catch (e) { showToast(e.message, "error"); }
    setActing(null);
  }

  async function blockUser(uid) {
    setActing(uid); setConfirm(null);
    try {
      const token = await getToken();
      const res   = await fetch(`${API}/api/admin/users/${uid}/block`, { method:"POST", headers:{ Authorization:`Bearer ${token}` } });
      const data  = await res.json();
      if (!res.ok) showToast(data.error, "error");
      else { showToast("User blocked"); await load(true); }
    } catch (e) { showToast(e.message, "error"); }
    setActing(null);
  }

  async function unblockUser(uid) {
    setActing(uid);
    try {
      const token = await getToken();
      const res   = await fetch(`${API}/api/admin/users/${uid}/unblock`, { method:"POST", headers:{ Authorization:`Bearer ${token}` } });
      const data  = await res.json();
      if (!res.ok) showToast(data.error, "error");
      else { showToast("User unblocked"); await load(true); }
    } catch (e) { showToast(e.message, "error"); }
    setActing(null);
  }

  async function deleteUser(uid) {
    setActing(uid); setConfirm(null);
    try {
      const token = await getToken();
      const res   = await fetch(`${API}/api/admin/users/${uid}`, { method:"DELETE", headers:{ Authorization:`Bearer ${token}` } });
      const data  = await res.json();
      if (!res.ok) showToast(data.error, "error");
      else { showToast("User deleted permanently", "error"); await load(true); }
    } catch (e) { showToast(e.message, "error"); }
    setActing(null);
  }

  async function doBulk() {
    if (selected.size === 0) return;
    const uids = [...selected];
    try {
      const token = await getToken();
      const res   = await fetch(`${API}/api/admin/users/bulk`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ uids, action: bulkAction, plan: bulkPlan }),
      });
      const data = await res.json();
      if (!res.ok) showToast(data.error, "error");
      else { showToast(`${data.success} user(s) ${bulkAction}ed`); setSelected(new Set()); await load(true); }
    } catch (e) { showToast(e.message, "error"); }
  }

  async function exportCSV() {
    try {
      const token = await getToken();
      const res   = await fetch(`${API}/api/admin/users/export`, { headers: { Authorization: `Bearer ${token}` } });
      const blob  = await res.blob();
      const url   = URL.createObjectURL(blob);
      const a     = document.createElement("a");
      a.href = url; a.download = `users-${new Date().toISOString().split("T")[0]}.csv`;
      a.click(); URL.revokeObjectURL(url);
      showToast("CSV exported");
    } catch (e) { showToast("Export failed: " + e.message, "error"); }
  }

  function toggleSelect(uid) {
    setSelected(s => {
      const n = new Set(s);
      n.has(uid) ? n.delete(uid) : n.add(uid);
      return n;
    });
  }

  function selectAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(u => u.uid)));
  }

  function fmtDate(d) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" });
  }

  function fmtRelative(d) {
    if (!d) return "Never";
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    const hrs  = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1)  return "Just now";
    if (mins < 60) return `${mins}m ago`;
    if (hrs  < 24) return `${hrs}h ago`;
    if (days === 1) return "Yesterday";
    if (days < 30)  return `${days}d ago`;
    return fmtDate(d);
  }

  // ── Not admin ────────────────────────────────────
  if (notAdmin) return (
    <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", background:bg }}>
      <div style={{ textAlign:"center", padding:48 }}>
        <div style={{ fontSize:48, marginBottom:16 }}>🔒</div>
        <div style={{ fontSize:16, fontWeight:700, color:txt, marginBottom:8 }}>Admin Access Only</div>
        <div style={{ fontSize:13, color:txt2, maxWidth:340 }}>
          Set <code style={{ background:bg3, padding:"1px 6px", borderRadius:4, fontSize:12 }}>ADMIN_UID</code> to your Firebase UID in Render → Environment Variables.
        </div>
      </div>
    </div>
  );

  // ── API / config error ────────────────────────────
  if (apiError) return (
    <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", background:bg }}>
      <div style={{ textAlign:"center", padding:48, maxWidth:480 }}>
        <div style={{ fontSize:48, marginBottom:16 }}>⚠️</div>
        <div style={{ fontSize:16, fontWeight:700, color:"#DC2626", marginBottom:10 }}>Admin API Error</div>
        <div style={{ fontSize:13, color:txt, background:bg2, border:"1px solid #DC262633", borderRadius:10, padding:"14px 18px", marginBottom:18, textAlign:"left", lineHeight:1.7 }}>
          {apiError}
        </div>
        {apiError.includes("ADMIN_UID") && (
          <div style={{ fontSize:13, color:txt2, background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"14px 18px", textAlign:"left", lineHeight:1.8 }}>
            <strong style={{ color:txt }}>Fix:</strong><br/>
            1. Go to <strong>Render → your backend service → Environment</strong><br/>
            2. Add variable: <code style={{ background:bg3, padding:"2px 6px", borderRadius:4, fontSize:12 }}>ADMIN_UID</code><br/>
            3. Value = your Firebase UID (find it in Firebase Console → Authentication → your email row)<br/>
            4. Redeploy the service
          </div>
        )}
        <button onClick={() => load()} style={{ marginTop:16, padding:"10px 24px", borderRadius:8, border:"none", background:B, color:"#fff", fontWeight:700, cursor:"pointer" }}>
          🔄 Retry
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ flex:1, overflowY:"auto", padding:24, background:bg }}>

      {/* ── Toast ─────────────────────────────────── */}
      {toast && (
        <div style={{
          position:"fixed", top:20, right:24, zIndex:10000,
          padding:"12px 20px", borderRadius:10, fontSize:13, fontWeight:600,
          background: toast.type === "error" ? "#DC2626" : "#059669",
          color:"#fff", boxShadow:"0 4px 20px rgba(0,0,0,0.3)",
        }}>
          {toast.type === "error" ? "❌" : "✅"} {toast.msg}
        </div>
      )}

      {/* ── User Detail Drawer ─────────────────────── */}
      {drawerUid && (
        <UserDrawer
          uid={drawerUid} API={API} getToken={getToken} dark={dark}
          onClose={() => setDrawerUid(null)}
          onSaved={() => load(true)}
          showToast={showToast}
        />
      )}

      {/* ── Reset Link Modal ─────────────────────── */}
      {resetLink && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9998 }}>
          <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:16, padding:28, width:520, maxWidth:"92vw" }}>
            <div style={{ fontSize:15, fontWeight:700, color:txt, marginBottom:4 }}>🔑 Password Reset Link</div>
            <div style={{ fontSize:12, color:txt2, marginBottom:12 }}>For: <strong style={{ color:B }}>{resetLink.email}</strong> · Expires in 1 hour</div>
            <div style={{ background:bg3, border:`1px solid ${bdr}`, borderRadius:8, padding:"10px 14px", fontSize:11, color:txt, wordBreak:"break-all", lineHeight:1.6, marginBottom:16 }}>
              {resetLink.link}
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => { navigator.clipboard?.writeText(resetLink.link); showToast("Link copied!"); }}
                style={{ flex:1, padding:"10px", borderRadius:8, border:"none", background:B, color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer" }}>
                📋 Copy Link
              </button>
              <button onClick={() => setResetLink(null)}
                style={{ padding:"10px 20px", borderRadius:8, border:`1px solid ${bdr}`, background:"transparent", color:txt2, fontSize:13, cursor:"pointer" }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Dialog ─────────────────────────── */}
      {confirm && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9998 }}>
          <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:16, padding:28, width:400, maxWidth:"92vw" }}>
            <div style={{ fontSize:15, fontWeight:700, color:txt, marginBottom:8 }}>
              {confirm.action === "block" ? "🚫 Block User?" : "🗑️ Delete User?"}
            </div>
            <div style={{ fontSize:13, color:txt2, marginBottom:12 }}>
              {confirm.action === "block"
                ? `Block "${confirm.name}"? They cannot log in until unblocked.`
                : `Permanently delete "${confirm.name}"? This cannot be undone.`}
            </div>
            {confirm.action === "delete" && (
              <div style={{ padding:"8px 12px", background:"#DC262610", border:"1px solid #DC262440", borderRadius:8, fontSize:12, color:"#DC2626", marginBottom:16 }}>
                ⚠️ Deletes from Firebase Auth AND Firestore permanently.
              </div>
            )}
            <div style={{ display:"flex", gap:10, marginTop:16 }}>
              <button onClick={() => confirm.action === "block" ? blockUser(confirm.uid) : deleteUser(confirm.uid)}
                style={{ flex:1, padding:"10px", borderRadius:8, border:"none", background:confirm.action==="delete"?"#DC2626":"#D97706", color:"#fff", fontWeight:700, cursor:"pointer" }}>
                {confirm.action === "block" ? "Yes, Block" : "Yes, Delete"}
              </button>
              <button onClick={() => setConfirm(null)}
                style={{ padding:"10px 20px", borderRadius:8, border:`1px solid ${bdr}`, background:"transparent", color:txt2, cursor:"pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ─────────────────────────────────── */}
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20, flexWrap:"wrap" }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:18, fontWeight:800, color:txt }}>👥 User Management</div>
          <div style={{ fontSize:12, color:txt2 }}>Full admin control — signups, activity, plans, bulk actions</div>
        </div>
        <button onClick={exportCSV} style={{ padding:"8px 16px", borderRadius:8, border:`1px solid ${bdr}`, background:bg2, color:txt2, fontSize:12, fontWeight:600, cursor:"pointer" }}>
          ⬇️ Export CSV
        </button>
        <button onClick={() => load()} style={{ padding:"8px 16px", borderRadius:8, border:`1px solid ${bdr}`, background:bg2, color:txt2, fontSize:12, cursor:"pointer" }}>
          🔄 Refresh
        </button>
      </div>

      {/* ── Stats Grid ─────────────────────────────── */}
      {stats && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))", gap:8, marginBottom:20 }}>
          {[
            { l:"Total Users",    v:stats.totalUsers,    c:B,         icon:"👥" },
            { l:"Active",         v:stats.activeUsers,   c:"#059669", icon:"✅" },
            { l:"Blocked",        v:stats.blockedUsers,  c:"#DC2626", icon:"🚫" },
            { l:"New This Week",  v:stats.newWeek,       c:"#D97706", icon:"🆕" },
            { l:"Logins Today",   v:stats.loginsToday,   c:"#0891B2", icon:"🔑" },
            { l:"Pipelines Run",  v:stats.pipelinesRun,  c:"#443DCB", icon:"⚡" },
            { l:"Total Clients",  v:stats.totalClients,  c:"#059669", icon:"🏢" },
            { l:"Google Sign-In", v:stats.googleUsers,   c:"#4285F4", icon:"🔵" },
          ].map(s => (
            <div key={s.l} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:"12px 14px", borderTop:`3px solid ${s.c}` }}>
              <div style={{ fontSize:16, marginBottom:2 }}>{s.icon}</div>
              <div style={{ fontSize:20, fontWeight:800, color:s.c }}>{s.v ?? "—"}</div>
              <div style={{ fontSize:10, color:txt2, marginTop:1, lineHeight:1.3 }}>{s.l}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── NEW SIGNUP FEED ─────────────────────────── */}
      {newSignups.length > 0 && (
        <div style={{ background:bg2, border:`1px solid #05966933`, borderRadius:12, padding:"14px 18px", marginBottom:20, borderLeft:"4px solid #059669" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
            <div style={{ fontSize:13, fontWeight:700, color:"#059669" }}>🆕 New Signups — Last 7 Days</div>
            <span style={{ fontSize:11, padding:"2px 8px", borderRadius:8, background:"#05966918", color:"#059669", fontWeight:700 }}>{newSignups.length}</span>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {newSignups.map(u => (
              <div key={u.uid} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px", background:bg3, borderRadius:8, cursor:"pointer" }}
                onClick={() => setDrawerUid(u.uid)}>
                <div style={{ width:32, height:32, borderRadius:"50%", background:`linear-gradient(135deg,${B},#3730b8)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:800, color:"#fff", flexShrink:0 }}>
                  {u.name?.charAt(0)?.toUpperCase() || "?"}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:txt }}>{u.name}</div>
                  <div style={{ fontSize:11, color:txt2 }}>{u.email}</div>
                </div>
                <div style={{ textAlign:"right", flexShrink:0 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:"#059669" }}>{fmtRelative(u.createdAt)}</div>
                  <div style={{ fontSize:10, color:txt2 }}>{u.provider === "google.com" ? "🔵 Google" : "📧 Email"}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Bulk Action Bar ─────────────────────────── */}
      {selected.size > 0 && (
        <div style={{ background:`${B}12`, border:`1px solid ${B}33`, borderRadius:10, padding:"10px 16px", marginBottom:14, display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
          <span style={{ fontSize:12, fontWeight:700, color:B }}>{selected.size} selected</span>
          <select value={bulkAction} onChange={e => setBulkAction(e.target.value)}
            style={{ padding:"6px 10px", borderRadius:8, border:`1px solid ${bdr}`, background:bg2, color:txt, fontSize:12, outline:"none" }}>
            <option value="block">Block</option>
            <option value="unblock">Unblock</option>
            <option value="delete">Delete</option>
            <option value="plan">Change Plan</option>
          </select>
          {bulkAction === "plan" && (
            <select value={bulkPlan} onChange={e => setBulkPlan(e.target.value)}
              style={{ padding:"6px 10px", borderRadius:8, border:`1px solid ${bdr}`, background:bg2, color:txt, fontSize:12, outline:"none" }}>
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="agency">Agency</option>
            </select>
          )}
          <button onClick={doBulk}
            style={{ padding:"6px 14px", borderRadius:8, border:"none", background:bulkAction==="delete"?"#DC2626":B, color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer" }}>
            Apply to {selected.size} users
          </button>
          <button onClick={() => setSelected(new Set())}
            style={{ padding:"6px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:"transparent", color:txt2, fontSize:12, cursor:"pointer" }}>
            Clear
          </button>
        </div>
      )}

      {/* ── Search + Filters ─────────────────────────── */}
      <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍  Search by name or email..."
          style={{ flex:1, minWidth:200, padding:"9px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg2, color:txt, fontSize:13, outline:"none" }}
        />
        {/* Status filter */}
        <div style={{ display:"flex", gap:4 }}>
          {["all","active","blocked"].map(f => (
            <button key={f} onClick={() => setStatusFilter(f)} style={{
              padding:"8px 12px", borderRadius:8, border:`1px solid ${statusFilter===f ? B : bdr}`,
              background: statusFilter===f ? `${B}18` : "transparent",
              color: statusFilter===f ? B : txt2, fontSize:11, fontWeight:statusFilter===f?700:400, cursor:"pointer",
            }}>
              {f === "all" ? "All" : f === "active" ? "✅ Active" : "🚫 Blocked"}
            </button>
          ))}
        </div>
        {/* Date filter */}
        <div style={{ display:"flex", gap:4 }}>
          {[["all","All time"],["today","Today"],["week","This week"],["month","This month"]].map(([f,l]) => (
            <button key={f} onClick={() => setDateFilter(f)} style={{
              padding:"8px 12px", borderRadius:8, border:`1px solid ${dateFilter===f ? "#059669" : bdr}`,
              background: dateFilter===f ? "#05966918" : "transparent",
              color: dateFilter===f ? "#059669" : txt2, fontSize:11, fontWeight:dateFilter===f?700:400, cursor:"pointer",
            }}>
              {l}
            </button>
          ))}
        </div>
        {/* Sort */}
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          style={{ padding:"8px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:bg2, color:txt, fontSize:12, outline:"none" }}>
          <option value="newest">↓ Newest joined</option>
          <option value="lastlogin">↓ Last login</option>
          <option value="clients">↓ Most clients</option>
        </select>
      </div>

      {/* ── User List ─────────────────────────────────── */}
      {loading ? (
        <div style={{ textAlign:"center", padding:60, color:txt2 }}>Loading users...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign:"center", padding:60, color:txt2 }}>No users match the current filters</div>
      ) : (
        <>
          {/* Select all row */}
          <div style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 14px", background:bg3, borderRadius:"10px 10px 0 0", borderBottom:`1px solid ${bdr}`, border:`1px solid ${bdr}` }}>
            <input type="checkbox"
              checked={selected.size === filtered.length && filtered.length > 0}
              onChange={selectAll}
              style={{ width:14, height:14, cursor:"pointer", accentColor:B }}
            />
            <span style={{ fontSize:11, color:txt2 }}>
              {filtered.length} user{filtered.length !== 1 ? "s" : ""} shown
              {selected.size > 0 && ` · ${selected.size} selected`}
            </span>
          </div>

          <div style={{ border:`1px solid ${bdr}`, borderTop:"none", borderRadius:"0 0 10px 10px", overflow:"hidden" }}>
            {filtered.map((u, idx) => {
              const isBlocked = u.disabled;
              const isActing  = acting === u.uid;
              const isGoogle  = u.provider === "google.com";
              const isSel     = selected.has(u.uid);
              const initials  = u.name?.split(" ").map(w => w[0]).slice(0,2).join("").toUpperCase() || "?";

              return (
                <div key={u.uid} style={{
                  background: isSel ? `${B}0a` : (idx % 2 === 0 ? bg2 : bg3),
                  borderBottom: idx < filtered.length - 1 ? `1px solid ${bdr}` : "none",
                  padding:"14px 18px",
                  borderLeft: `4px solid ${isBlocked ? "#DC2626" : u.isNew ? "#059669" : "transparent"}`,
                  opacity: isBlocked ? 0.88 : 1,
                }}>
                  <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                    {/* Checkbox */}
                    <input type="checkbox" checked={isSel} onChange={() => toggleSelect(u.uid)}
                      style={{ width:14, height:14, cursor:"pointer", accentColor:B, flexShrink:0 }}
                    />

                    {/* Avatar */}
                    <div
                      onClick={() => setDrawerUid(u.uid)}
                      title="Click to view full profile"
                      style={{
                        width:42, height:42, borderRadius:"50%", flexShrink:0,
                        background: isBlocked ? "#DC262622" : `linear-gradient(135deg,${B},#3730b8)`,
                        display:"flex", alignItems:"center", justifyContent:"center",
                        fontSize:15, fontWeight:800, color: isBlocked ? "#DC2626" : "#fff",
                        cursor:"pointer", border: isBlocked ? "2px solid #DC262644" : u.isNew ? "2px solid #059669" : "none",
                      }}>
                      {isBlocked ? "🚫" : initials}
                    </div>

                    {/* Info */}
                    <div style={{ flex:1, minWidth:160, cursor:"pointer" }} onClick={() => setDrawerUid(u.uid)}>
                      <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                        <span style={{ fontSize:13, fontWeight:700, color:txt }}>{u.name}</span>
                        {u.isNew && <Badge label="🆕 NEW" color="#059669"/>}
                        <Badge label={isBlocked ? "🚫 Blocked" : "✅ Active"} color={isBlocked?"#DC2626":"#059669"}/>
                        <Badge label={isGoogle ? "🔵 Google" : "📧 Email"} color="#6B7280"/>
                        <Badge label={u.plan === "pro" ? "⭐ Pro" : u.plan === "agency" ? "🏢 Agency" : "Free"} color={u.plan==="pro"?"#D97706":B}/>
                      </div>
                      <div style={{ fontSize:11, color:txt2, marginTop:2 }}>{u.email}</div>
                      <div style={{ display:"flex", gap:12, marginTop:4, flexWrap:"wrap" }}>
                        <span style={{ fontSize:11, color:txt2 }}>Joined: <strong style={{ color:u.isNew?"#059669":txt2 }}>{fmtRelative(u.createdAt)}</strong></span>
                        <span style={{ fontSize:11, color:txt2 }}>Last login: <strong style={{ color:txt }}>{fmtRelative(u.lastSignIn)}</strong></span>
                        <span style={{ fontSize:11, color:txt2 }}>Clients: <strong style={{ color:B }}>{u.clientCount}</strong></span>
                        <span style={{ fontSize:11, color:txt2 }}>Pipelines: <strong style={{ color:"#059669" }}>{u.pipelineCount}</strong></span>
                      </div>
                      {/* API key dots */}
                      <div style={{ display:"flex", gap:4, marginTop:6, flexWrap:"wrap" }}>
                        <ApiDot ok={u.hasGroq}      label="Groq"/>
                        <ApiDot ok={u.hasSerpApi}   label="SerpAPI"/>
                        <ApiDot ok={u.hasSeRanking} label="SE Ranking"/>
                        <ApiDot ok={u.hasGoogle}    label="Google"/>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center", flexShrink:0 }}>
                      <button onClick={() => setDrawerUid(u.uid)}
                        style={{ padding:"6px 11px", borderRadius:8, border:`1px solid ${B}44`, background:`${B}10`, color:B, fontSize:11, fontWeight:700, cursor:"pointer" }}>
                        👤 View
                      </button>
                      {!isGoogle && (
                        <button onClick={() => sendReset(u.uid)} disabled={isActing}
                          style={{ padding:"6px 11px", borderRadius:8, border:`1px solid ${B}44`, background:`${B}10`, color:B, fontSize:11, fontWeight:700, cursor:isActing?"not-allowed":"pointer", opacity:isActing?0.6:1 }}>
                          {isActing ? "⏳" : "🔑 Reset"}
                        </button>
                      )}
                      {isBlocked ? (
                        <button onClick={() => unblockUser(u.uid)} disabled={isActing}
                          style={{ padding:"6px 11px", borderRadius:8, border:"1px solid #05966444", background:"#05966412", color:"#059669", fontSize:11, fontWeight:700, cursor:isActing?"not-allowed":"pointer", opacity:isActing?0.6:1 }}>
                          ✅ Unblock
                        </button>
                      ) : (
                        <button onClick={() => setConfirm({ uid:u.uid, action:"block", name:u.name })} disabled={isActing}
                          style={{ padding:"6px 11px", borderRadius:8, border:"1px solid #D9770644", background:"#D9770610", color:"#D97706", fontSize:11, fontWeight:700, cursor:isActing?"not-allowed":"pointer", opacity:isActing?0.6:1 }}>
                          🚫 Block
                        </button>
                      )}
                      <button onClick={() => setConfirm({ uid:u.uid, action:"delete", name:u.name })} disabled={isActing}
                        style={{ padding:"6px 11px", borderRadius:8, border:"1px solid #DC262644", background:"#DC262610", color:"#DC2626", fontSize:11, fontWeight:700, cursor:isActing?"not-allowed":"pointer", opacity:isActing?0.6:1 }}>
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
