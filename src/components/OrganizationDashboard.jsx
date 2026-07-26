import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { makeTheme } from "../theme/theme";
import { Button, Input, Badge, EmptyState } from "./ui";

// Organization Dashboard (M10.7) — teams + RBAC management. Reads /organization*
// (JWT + RBAC on the backend). Reuses M10.1 primitives. Agency-level page.

const ROLES = ["viewer", "editor", "admin"]; // owner is fixed, not assignable
const ROLE_TONE = { owner: "ai", admin: "info", editor: "success", viewer: "neutral" };
// Client-side mirror of the permission matrix (display only; backend enforces).
const PERMISSION_MATRIX = [
  { perm: "View clients & reports", roles: ["viewer", "editor", "admin", "owner"] },
  { perm: "Run pipeline & Copilot",  roles: ["editor", "admin", "owner"] },
  { perm: "Edit tasks & approvals",  roles: ["editor", "admin", "owner"] },
  { perm: "Branding & API keys",     roles: ["admin", "owner"] },
  { perm: "Manage members",          roles: ["admin", "owner"] },
  { perm: "Edit / delete org",       roles: ["owner"] },
];

export default function OrganizationDashboard({ dark }) {
  const { user, API } = useAuth();
  const t = makeTheme(dark);
  const [state, setState] = useState(null);        // { orgId, role, solo, organization }
  const [members, setMembers] = useState([]);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [orgName, setOrgName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("editor");
  const [inviteToken, setInviteToken] = useState("");
  const [joinToken, setJoinToken] = useState("");

  async function tok() { return user.getIdToken(); }
  async function load() {
    setLoading(true); setError("");
    try {
      const h = { Authorization: `Bearer ${await tok()}` };
      const s = await fetch(`${API}/api/agents/organization`, { headers: h }).then(r => r.json());
      setState(s);
      if (!s.solo) {
        const [m, a] = await Promise.all([
          fetch(`${API}/api/agents/organization/members`, { headers: h }).then(r => r.json()).catch(() => ({})),
          (s.role === "admin" || s.role === "owner")
            ? fetch(`${API}/api/agents/organization/audit`, { headers: h }).then(r => r.json()).catch(() => ({})) : Promise.resolve({}),
        ]);
        setMembers(m.members || []); setAudit(a.audit || []);
      }
    } catch (e) { setError(e.message); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function post(path, body) {
    const r = await fetch(`${API}/api/agents/organization${path}`, {
      method: body?._method || "POST",
      headers: { Authorization: `Bearer ${await tok()}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { ok: r.ok, json: await r.json() };
  }
  async function createOrg() { setError(""); const { ok, json } = await post("", { name: orgName }); ok ? (setMsg("Organization created."), load()) : setError(json.error); }
  async function invite() { setError(""); const { ok, json } = await post("/invite", { email: inviteEmail, role: inviteRole }); ok ? (setInviteToken(json.token), setMsg("Invite created — share the token."), setInviteEmail("")) : setError(json.error); }
  async function accept() { setError(""); const { ok, json } = await post("/accept", { token: joinToken }); ok ? (setMsg("Joined organization."), load()) : setError(json.error); }
  async function setRole(uid, role) { await fetch(`${API}/api/agents/organization/member/${uid}`, { method: "PATCH", headers: { Authorization: `Bearer ${await tok()}`, "Content-Type": "application/json" }, body: JSON.stringify({ role }) }); load(); }
  async function removeMember(uid) { await fetch(`${API}/api/agents/organization/member/${uid}`, { method: "DELETE", headers: { Authorization: `Bearer ${await tok()}` } }); load(); }

  const bg2 = t.color.surface, bg3 = t.color.surfaceAlt, bdr = t.color.border, txt = t.color.text, txt2 = t.color.muted;
  const card = { background: bg2, border: `1px solid ${bdr}`, borderRadius: t.radius.lg, padding: "18px 20px" };
  const label = { ...t.type.caption, color: txt2, marginBottom: 8, display: "block" };
  const canManage = state && (state.role === "admin" || state.role === "owner");

  if (loading) return <div style={{ ...card, textAlign: "center", color: txt2 }}><div style={{ fontSize: 22, marginBottom: 8 }}>🏢</div>Loading organization…</div>;

  return (
    <div style={{ padding: "0 0 24px", display: "grid", gap: 16 }}>
      <div>
        <h2 style={{ ...t.type.h2, color: txt, margin: 0 }}>Organization</h2>
        <div style={{ ...t.type.small, color: txt2, marginTop: 2 }}>Teams, roles, and permissions for your agency.</div>
      </div>
      {error && <div style={{ ...card, borderColor: "#DC2626", color: "#DC2626", fontSize: 13 }}>{error}</div>}
      {msg && <div style={{ ...card, borderColor: t.color.success, color: t.color.success, fontSize: 13 }}>{msg}</div>}

      {/* No org yet — create or join */}
      {state?.solo && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={card}>
            <span style={label}>Create an organization</span>
            <div style={{ ...t.type.small, color: txt2, marginBottom: 12 }}>You're currently a solo account. Create an org to invite teammates and share clients.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <Input t={t} value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="Agency name" style={{ flex: 1 }} />
              <Button t={t} onClick={createOrg}>Create</Button>
            </div>
          </div>
          <div style={card}>
            <span style={label}>Join with an invite</span>
            <div style={{ ...t.type.small, color: txt2, marginBottom: 12 }}>Paste an invite token from an organization admin.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <Input t={t} value={joinToken} onChange={e => setJoinToken(e.target.value)} placeholder="Invite token" style={{ flex: 1 }} />
              <Button t={t} variant="secondary" onClick={accept}>Join</Button>
            </div>
          </div>
        </div>
      )}

      {/* Org profile */}
      {!state?.solo && state?.organization && (
        <>
          <div style={{ ...card, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ width: 44, height: 44, borderRadius: t.radius.md, background: t.color.primary, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 18 }}>{(state.organization.name || "O")[0]}</div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: txt }}>{state.organization.name}</div>
              <div style={{ ...t.type.small, color: txt2 }}>{state.organization.memberCount} member(s) · you are <Badge t={t} tone={ROLE_TONE[state.role]}>{state.role}</Badge></div>
            </div>
          </div>

          {/* Members */}
          <div style={card}>
            <span style={label}>Members</span>
            {canManage && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
                <div style={{ flex: 1, minWidth: 180 }}><Input t={t} label="Invite by email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="teammate@agency.com" /></div>
                <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} aria-label="invite role" style={{ padding: "9px 10px", borderRadius: t.radius.md, border: `1px solid ${bdr}`, background: bg2, color: txt }}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <Button t={t} onClick={invite}>Invite</Button>
              </div>
            )}
            {inviteToken && <div style={{ ...card, background: bg3, fontSize: 12, marginBottom: 12, wordBreak: "break-all" }}>Invite token (share securely): <code style={{ fontFamily: t.font.mono }}>{inviteToken}</code></div>}
            <div style={{ display: "grid", gap: 6 }}>
              {members.map(m => (
                <div key={m.uid} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 0", borderTop: `1px solid ${bdr}` }}>
                  <span style={{ ...t.type.small, color: txt, fontFamily: t.font.mono }}>{m.uid.slice(0, 12)}…</span>
                  <Badge t={t} tone={ROLE_TONE[m.role]}>{m.role}</Badge>
                  {canManage && m.role !== "owner" && (
                    <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                      <select value={m.role} onChange={e => setRole(m.uid, e.target.value)} aria-label={`role for ${m.uid}`} style={{ fontSize: 12, padding: "5px 8px", borderRadius: t.radius.sm, border: `1px solid ${bdr}`, background: bg2, color: txt }}>
                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <Button t={t} size="sm" variant="ghost" style={{ border: `1px solid ${bdr}`, color: "#DC2626" }} onClick={() => removeMember(m.uid)}>Remove</Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Permission matrix */}
          <div style={card}>
            <span style={label}>Permission Matrix</span>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 520 }}>
                <thead><tr>
                  <th style={{ textAlign: "left", padding: "8px 10px", color: txt2, ...t.type.caption }}>Capability</th>
                  {["viewer", "editor", "admin", "owner"].map(r => <th key={r} style={{ padding: "8px 10px", color: txt2, ...t.type.caption }}>{r}</th>)}
                </tr></thead>
                <tbody>
                  {PERMISSION_MATRIX.map((row, i) => (
                    <tr key={i}>
                      <td style={{ padding: "8px 10px", color: txt, borderTop: `1px solid ${bdr}` }}>{row.perm}</td>
                      {["viewer", "editor", "admin", "owner"].map(r => (
                        <td key={r} style={{ textAlign: "center", padding: "8px 10px", borderTop: `1px solid ${bdr}`, color: row.roles.includes(r) ? t.color.success : txt2 }}>{row.roles.includes(r) ? "✓" : "·"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Audit timeline */}
          {canManage && (
            <div style={card}>
              <span style={label}>Audit Timeline</span>
              {audit.length === 0 ? <div style={{ fontSize: 13, color: txt2 }}>No activity yet.</div> : (
                <div style={{ display: "grid", gap: 6 }}>
                  {audit.map((a, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, fontSize: 12.5, color: txt }}>
                      <span style={{ color: txt2, fontFamily: t.font.mono }}>{new Date(a.at).toLocaleString?.() || ""}</span>
                      <span style={{ fontWeight: 600 }}>{a.action}</span>
                      <span style={{ color: txt2 }}>{a.target}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
