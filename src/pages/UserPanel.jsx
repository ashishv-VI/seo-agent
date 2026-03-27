import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

const B = "#443DCB";

export default function UserPanel({ dark }) {
  const { user, API } = useAuth();

  const [users,    setUsers]    = useState([]);
  const [stats,    setStats]    = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");
  const [filter,   setFilter]   = useState("all"); // all | active | blocked
  const [acting,   setActing]   = useState(null);  // uid being acted on
  const [toast,    setToast]    = useState(null);  // { msg, type }
  const [confirm,  setConfirm]  = useState(null);  // { uid, action, name }
  const [resetLink, setResetLink] = useState(null); // { email, link }
  const [notAdmin, setNotAdmin] = useState(false);

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";

  async function getToken() { return user?.getIdToken?.() || ""; }

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  async function load() {
    setLoading(true);
    try {
      const token = await getToken();
      const [usersRes, statsRes] = await Promise.all([
        fetch(`${API}/api/admin/users`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/api/admin/stats`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (usersRes.status === 403) { setNotAdmin(true); setLoading(false); return; }
      const usersData = await usersRes.json();
      const statsData = await statsRes.json();
      setUsers(usersData.users || []);
      setStats(statsData);
    } catch (e) {
      showToast("Failed to load users: " + e.message, "error");
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function sendReset(uid, name, email) {
    setActing(uid);
    try {
      const token = await getToken();
      const res   = await fetch(`${API}/api/admin/users/${uid}/reset-password`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error, "error"); }
      else { setResetLink({ email: data.email, link: data.resetLink }); }
    } catch (e) { showToast(e.message, "error"); }
    setActing(null);
  }

  async function blockUser(uid) {
    setActing(uid); setConfirm(null);
    try {
      const token = await getToken();
      const res   = await fetch(`${API}/api/admin/users/${uid}/block`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) showToast(data.error, "error");
      else { showToast("User blocked — they cannot log in now", "success"); await load(); }
    } catch (e) { showToast(e.message, "error"); }
    setActing(null);
  }

  async function unblockUser(uid) {
    setActing(uid);
    try {
      const token = await getToken();
      const res   = await fetch(`${API}/api/admin/users/${uid}/unblock`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) showToast(data.error, "error");
      else { showToast("User unblocked — they can log in again", "success"); await load(); }
    } catch (e) { showToast(e.message, "error"); }
    setActing(null);
  }

  async function deleteUser(uid) {
    setActing(uid); setConfirm(null);
    try {
      const token = await getToken();
      const res   = await fetch(`${API}/api/admin/users/${uid}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) showToast(data.error, "error");
      else { showToast("User permanently deleted", "success"); await load(); }
    } catch (e) { showToast(e.message, "error"); }
    setActing(null);
  }

  // ── Filters ───────────────────────────────────────
  const filtered = users.filter(u => {
    const matchSearch = !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || (filter === "blocked" ? u.disabled : !u.disabled);
    return matchSearch && matchFilter;
  });

  function fmtDate(d) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" });
  }

  function fmtRelative(d) {
    if (!d) return "Never";
    const diff = Date.now() - new Date(d).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 30)  return `${days}d ago`;
    return fmtDate(d);
  }

  // ── Not admin ─────────────────────────────────────
  if (notAdmin) return (
    <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", background:bg }}>
      <div style={{ textAlign:"center", padding:48 }}>
        <div style={{ fontSize:48, marginBottom:16 }}>🔒</div>
        <div style={{ fontSize:16, fontWeight:700, color:txt, marginBottom:8 }}>Admin Access Only</div>
        <div style={{ fontSize:13, color:txt2, maxWidth:340 }}>
          This panel is restricted to the system administrator.<br/>
          To enable admin access, set <code style={{ background:bg3, padding:"1px 6px", borderRadius:4, fontSize:12 }}>ADMIN_UID</code> to your Firebase UID in Render environment variables.
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ flex:1, overflowY:"auto", padding:24, background:bg }}>

      {/* ── Toast ───────────────────────────────── */}
      {toast && (
        <div style={{
          position:"fixed", top:20, right:24, zIndex:9999,
          padding:"12px 20px", borderRadius:10, fontSize:13, fontWeight:600,
          background: toast.type === "error" ? "#DC2626" : "#059669",
          color:"#fff", boxShadow:"0 4px 20px rgba(0,0,0,0.3)",
          animation:"slideIn 0.2s ease",
        }}>
          {toast.type === "error" ? "❌" : "✅"} {toast.msg}
        </div>
      )}

      {/* ── Reset Link Modal ──────────────────── */}
      {resetLink && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9998 }}>
          <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:16, padding:28, width:520, maxWidth:"92vw" }}>
            <div style={{ fontSize:15, fontWeight:700, color:txt, marginBottom:4 }}>🔑 Password Reset Link Generated</div>
            <div style={{ fontSize:12, color:txt2, marginBottom:16 }}>For: <strong style={{ color:B }}>{resetLink.email}</strong></div>
            <div style={{ fontSize:11, color:txt2, marginBottom:8 }}>Copy this link and send it to the user. It expires in 1 hour.</div>
            <div style={{ background:bg3, border:`1px solid ${bdr}`, borderRadius:8, padding:"10px 14px", fontSize:11, color:txt, wordBreak:"break-all", lineHeight:1.6, marginBottom:16 }}>
              {resetLink.link}
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button
                onClick={() => { navigator.clipboard?.writeText(resetLink.link); showToast("Link copied to clipboard!"); }}
                style={{ flex:1, padding:"10px", borderRadius:8, border:"none", background:B, color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer" }}>
                📋 Copy Link
              </button>
              <button
                onClick={() => setResetLink(null)}
                style={{ padding:"10px 20px", borderRadius:8, border:`1px solid ${bdr}`, background:"transparent", color:txt2, fontSize:13, cursor:"pointer" }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Dialog ───────────────────── */}
      {confirm && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9998 }}>
          <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:16, padding:28, width:400, maxWidth:"92vw" }}>
            <div style={{ fontSize:15, fontWeight:700, color:txt, marginBottom:8 }}>
              {confirm.action === "block" ? "🚫 Block User?" : "🗑️ Delete User?"}
            </div>
            <div style={{ fontSize:13, color:txt2, marginBottom:6 }}>
              {confirm.action === "block"
                ? `Block "${confirm.name}"? They will immediately be unable to log in.`
                : `Permanently delete "${confirm.name}"? This cannot be undone. All their data will be lost.`}
            </div>
            {confirm.action === "delete" && (
              <div style={{ padding:"8px 12px", background:"#DC262610", border:"1px solid #DC262640", borderRadius:8, fontSize:12, color:"#DC2626", marginBottom:16 }}>
                ⚠️ This deletes the user from Firebase Auth AND Firestore permanently.
              </div>
            )}
            <div style={{ display:"flex", gap:10, marginTop:16 }}>
              <button
                onClick={() => confirm.action === "block" ? blockUser(confirm.uid) : deleteUser(confirm.uid)}
                style={{ flex:1, padding:"10px", borderRadius:8, border:"none", background: confirm.action === "delete" ? "#DC2626" : "#D97706", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer" }}>
                {confirm.action === "block" ? "Yes, Block" : "Yes, Delete Permanently"}
              </button>
              <button
                onClick={() => setConfirm(null)}
                style={{ padding:"10px 20px", borderRadius:8, border:`1px solid ${bdr}`, background:"transparent", color:txt2, fontSize:13, cursor:"pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ──────────────────────────────── */}
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:18, fontWeight:800, color:txt, marginBottom:4 }}>👥 User Management</div>
        <div style={{ fontSize:12, color:txt2 }}>Manage all registered users — reset passwords, block access, remove accounts</div>
      </div>

      {/* ── Stats Cards ─────────────────────────── */}
      {stats && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:10, marginBottom:20 }}>
          {[
            { l:"Total Users",   v:stats.totalUsers,   c:B,         icon:"👥" },
            { l:"Active",        v:stats.activeUsers,  c:"#059669", icon:"✅" },
            { l:"Blocked",       v:stats.blockedUsers, c:"#DC2626", icon:"🚫" },
            { l:"Google Sign-In",v:stats.googleUsers,  c:"#4285F4", icon:"🔵" },
            { l:"Email Sign-In", v:stats.emailUsers,   c:"#D97706", icon:"📧" },
            { l:"Total Clients", v:stats.totalClients, c:"#0891B2", icon:"🏢" },
          ].map(s => (
            <div key={s.l} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:"14px 16px", borderTop:`3px solid ${s.c}` }}>
              <div style={{ fontSize:20, marginBottom:4 }}>{s.icon}</div>
              <div style={{ fontSize:22, fontWeight:800, color:s.c }}>{s.v}</div>
              <div style={{ fontSize:11, color:txt2, marginTop:2 }}>{s.l}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Search + Filter ─────────────────────── */}
      <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍  Search by name or email..."
          style={{ flex:1, minWidth:220, padding:"9px 14px", borderRadius:10, border:`1px solid ${bdr}`, background:bg2, color:txt, fontSize:13, outline:"none" }}
        />
        <div style={{ display:"flex", gap:6 }}>
          {["all","active","blocked"].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding:"8px 16px", borderRadius:20, border:`1px solid ${filter===f ? B : bdr}`,
              background: filter===f ? `${B}18` : "transparent",
              color: filter===f ? B : txt2, fontSize:12, fontWeight:filter===f?700:400, cursor:"pointer",
            }}>
              {f === "all" ? "All" : f === "active" ? "✅ Active" : "🚫 Blocked"}
            </button>
          ))}
        </div>
        <button onClick={load} style={{ padding:"8px 16px", borderRadius:10, border:`1px solid ${bdr}`, background:bg2, color:txt2, fontSize:12, cursor:"pointer" }}>
          🔄 Refresh
        </button>
      </div>

      {/* ── User List ───────────────────────────── */}
      {loading ? (
        <div style={{ textAlign:"center", padding:60, color:txt2 }}>Loading users...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign:"center", padding:60, color:txt2 }}>No users found</div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {filtered.map(u => {
            const isBlocked  = u.disabled;
            const isActing   = acting === u.uid;
            const isGoogle   = u.provider === "google.com";
            const initials   = u.name?.split(" ").map(w => w[0]).slice(0,2).join("").toUpperCase() || "?";

            return (
              <div key={u.uid} style={{
                background: bg2, border:`1px solid ${isBlocked ? "#DC262633" : bdr}`,
                borderLeft: `4px solid ${isBlocked ? "#DC2626" : "#059669"}`,
                borderRadius:12, padding:"16px 20px",
                opacity: isBlocked ? 0.85 : 1,
              }}>
                <div style={{ display:"flex", alignItems:"center", gap:14, flexWrap:"wrap" }}>

                  {/* Avatar */}
                  <div style={{
                    width:42, height:42, borderRadius:"50%", flexShrink:0,
                    background: isBlocked ? "#DC262622" : `linear-gradient(135deg,${B},#3730b8)`,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:15, fontWeight:800, color: isBlocked ? "#DC2626" : "#fff",
                    border: isBlocked ? "2px solid #DC262644" : "none",
                  }}>
                    {isBlocked ? "🚫" : initials}
                  </div>

                  {/* Info */}
                  <div style={{ flex:1, minWidth:180 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                      <span style={{ fontSize:14, fontWeight:700, color:txt }}>{u.name}</span>
                      {/* Status badge */}
                      <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, fontWeight:700,
                        background: isBlocked ? "#DC262618" : "#05966918",
                        color: isBlocked ? "#DC2626" : "#059669",
                      }}>
                        {isBlocked ? "🚫 Blocked" : "✅ Active"}
                      </span>
                      {/* Provider badge */}
                      <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:bg3, color:txt2 }}>
                        {isGoogle ? "🔵 Google" : "📧 Email"}
                      </span>
                      {/* Plan badge */}
                      <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10,
                        background: u.plan === "pro" ? "#D9770618" : `${B}12`,
                        color: u.plan === "pro" ? "#D97706" : B, fontWeight:700,
                      }}>
                        {u.plan === "pro" ? "⭐ Pro" : "Free"}
                      </span>
                    </div>
                    <div style={{ fontSize:12, color:txt2, marginTop:3 }}>{u.email}</div>
                    <div style={{ display:"flex", gap:14, marginTop:4, flexWrap:"wrap" }}>
                      <span style={{ fontSize:11, color:txt2 }}>Joined: {fmtDate(u.createdAt)}</span>
                      <span style={{ fontSize:11, color:txt2 }}>Last login: {fmtRelative(u.lastSignIn)}</span>
                      <span style={{ fontSize:11, color:txt2 }}>Clients: <strong style={{ color:B }}>{u.clientCount}</strong></span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                    {/* Reset Password — only for email users */}
                    {!isGoogle ? (
                      <button
                        onClick={() => sendReset(u.uid, u.name, u.email)}
                        disabled={isActing}
                        title="Generate password reset link and show it"
                        style={{ padding:"7px 13px", borderRadius:8, border:`1px solid ${B}44`, background:`${B}10`, color:B, fontSize:11, fontWeight:700, cursor:isActing?"not-allowed":"pointer", opacity:isActing?0.6:1 }}>
                        {isActing ? "⏳" : "🔑 Reset Password"}
                      </button>
                    ) : (
                      <span style={{ fontSize:11, color:txt2, padding:"7px 13px" }} title="Google users manage password via Google">🔵 Google Auth</span>
                    )}

                    {/* Block / Unblock */}
                    {isBlocked ? (
                      <button
                        onClick={() => unblockUser(u.uid)}
                        disabled={isActing}
                        title="Unblock — restore their login access"
                        style={{ padding:"7px 13px", borderRadius:8, border:"1px solid #05966444", background:"#05966412", color:"#059669", fontSize:11, fontWeight:700, cursor:isActing?"not-allowed":"pointer", opacity:isActing?0.6:1 }}>
                        {isActing ? "⏳" : "✅ Unblock"}
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirm({ uid:u.uid, action:"block", name:u.name })}
                        disabled={isActing}
                        title="Block — they cannot log in until unblocked"
                        style={{ padding:"7px 13px", borderRadius:8, border:"1px solid #D9770644", background:"#D9770610", color:"#D97706", fontSize:11, fontWeight:700, cursor:isActing?"not-allowed":"pointer", opacity:isActing?0.6:1 }}>
                        🚫 Block
                      </button>
                    )}

                    {/* Delete */}
                    <button
                      onClick={() => setConfirm({ uid:u.uid, action:"delete", name:u.name })}
                      disabled={isActing}
                      title="Permanently delete user and all data"
                      style={{ padding:"7px 13px", borderRadius:8, border:"1px solid #DC262644", background:"#DC262610", color:"#DC2626", fontSize:11, fontWeight:700, cursor:isActing?"not-allowed":"pointer", opacity:isActing?0.6:1 }}>
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer count */}
      {!loading && (
        <div style={{ textAlign:"center", padding:"20px 0 8px", fontSize:12, color:txt2 }}>
          Showing {filtered.length} of {users.length} users
        </div>
      )}
    </div>
  );
}
