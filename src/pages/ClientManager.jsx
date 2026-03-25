import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import AgentPipeline from "./AgentPipeline";

export default function ClientManager({ dark }) {
  const { user, API } = useAuth();
  const [clients,    setClients]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showForm,   setShowForm]   = useState(false);
  const [selected,   setSelected]   = useState(null);   // clientId for pipeline view
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState("");

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const txt3 = dark ? "#444"    : "#bbb";

  const blankForm = {
    businessName: "", websiteUrl: "", businessDescription: "",
    services: "", targetAudience: "", goals: "",
    competitors: "", targetLocations: "", primaryKeywords: "",
    conversionGoal: "", notes: "",
  };
  const [form, setForm] = useState(blankForm);

  async function getToken() {
    return user?.getIdToken?.() || "";
  }

  async function loadClients() {
    setLoading(true);
    try {
      const token = await getToken();
      const res   = await fetch(`${API}/api/clients`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setClients(data.clients || []);
    } catch (e) {
      setError("Failed to load clients");
    }
    setLoading(false);
  }

  useEffect(() => { loadClients(); }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      const token = await getToken();
      const body  = {
        ...form,
        services:         form.services.split(",").map(s => s.trim()).filter(Boolean),
        goals:            form.goals.split(",").map(s => s.trim()).filter(Boolean),
        competitors:      form.competitors.split(",").map(s => s.trim()).filter(Boolean),
        targetLocations:  form.targetLocations.split(",").map(s => s.trim()).filter(Boolean),
        primaryKeywords:  form.primaryKeywords.split(",").map(s => s.trim()).filter(Boolean),
      };
      const res = await fetch(`${API}/api/clients`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to create client"); setSaving(false); return; }
      setShowForm(false);
      setForm(blankForm);
      await loadClients();
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  }

  async function deleteClient(clientId, e) {
    e.stopPropagation();
    if (!confirm("Delete this client and all their data?")) return;
    const token = await getToken();
    await fetch(`${API}/api/clients/${clientId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    await loadClients();
  }

  const statusColor = s => ({
    complete:   "#059669", signed_off: "#059669", running: "#D97706",
    pending:    txt3,      failed:     "#DC2626",  incomplete: "#D97706",
  }[s] || txt3);

  const statusLabel = s => ({
    complete: "Complete", signed_off: "Signed Off", running: "Running",
    pending: "Pending", failed: "Failed", incomplete: "Incomplete",
  }[s] || s);

  const s = {
    wrap:   { flex:1, overflowY:"auto", padding:24, background:bg },
    card:   { background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:12, cursor:"pointer", transition:"border 0.15s" },
    badge:  (color) => ({ fontSize:10, padding:"2px 8px", borderRadius:10, background:color+"22", color, fontWeight:600 }),
    inp:    { width:"100%", padding:"9px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", fontFamily:"inherit", boxSizing:"border-box" },
    label:  { fontSize:11, color:txt2, fontWeight:600, marginBottom:4, display:"block" },
    btn:    (c="#7C3AED") => ({ padding:"9px 20px", borderRadius:8, border:"none", background:c, color:"#fff", fontWeight:600, fontSize:13, cursor:"pointer" }),
    grid:   { display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:14 },
  };

  // Show pipeline if client selected
  if (selected) {
    return <AgentPipeline dark={dark} clientId={selected} onBack={() => { setSelected(null); loadClients(); }} />;
  }

  return (
    <div style={s.wrap}>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:txt }}>🏢 Client Manager</div>
          <div style={{ fontSize:12, color:txt2, marginTop:2 }}>Manage clients · Run A1 brief · Trigger audits</div>
        </div>
        <button onClick={() => { setShowForm(true); setError(""); }} style={s.btn()}>+ Add Client</button>
      </div>

      {error && <div style={{ padding:"10px 14px", borderRadius:8, background:"#DC262611", color:"#DC2626", fontSize:12, marginBottom:14 }}>{error}</div>}

      {/* Add Client Form */}
      {showForm && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:24, marginBottom:20 }}>
          <div style={{ fontSize:15, fontWeight:700, color:txt, marginBottom:16 }}>New Client Brief — A1</div>
          <form onSubmit={handleSubmit}>
            <div style={s.grid}>
              <div>
                <label style={s.label}>Business Name *</label>
                <input style={s.inp} required value={form.businessName} onChange={e=>setForm(f=>({...f,businessName:e.target.value}))} placeholder="Acme Digital" />
              </div>
              <div>
                <label style={s.label}>Website URL *</label>
                <input style={s.inp} required value={form.websiteUrl} onChange={e=>setForm(f=>({...f,websiteUrl:e.target.value}))} placeholder="https://acme.com" />
              </div>
              <div style={{ gridColumn:"span 2" }}>
                <label style={s.label}>Business Description</label>
                <textarea style={{...s.inp, height:60, resize:"vertical"}} value={form.businessDescription} onChange={e=>setForm(f=>({...f,businessDescription:e.target.value}))} placeholder="What does this business do?" />
              </div>
              <div>
                <label style={s.label}>Services (comma separated)</label>
                <input style={s.inp} value={form.services} onChange={e=>setForm(f=>({...f,services:e.target.value}))} placeholder="SEO, PPC, Web Design" />
              </div>
              <div>
                <label style={s.label}>Target Audience *</label>
                <input style={s.inp} required value={form.targetAudience} onChange={e=>setForm(f=>({...f,targetAudience:e.target.value}))} placeholder="Small business owners in UK" />
              </div>
              <div>
                <label style={s.label}>Goals (comma separated) *</label>
                <input style={s.inp} required value={form.goals} onChange={e=>setForm(f=>({...f,goals:e.target.value}))} placeholder="Rank top 3, increase leads 50%" />
              </div>
              <div>
                <label style={s.label}>Conversion Goal</label>
                <input style={s.inp} value={form.conversionGoal} onChange={e=>setForm(f=>({...f,conversionGoal:e.target.value}))} placeholder="Form submission / Call / Purchase" />
              </div>
              <div>
                <label style={s.label}>Competitors (comma separated)</label>
                <input style={s.inp} value={form.competitors} onChange={e=>setForm(f=>({...f,competitors:e.target.value}))} placeholder="competitor1.com, competitor2.com" />
              </div>
              <div>
                <label style={s.label}>Target Locations (comma separated)</label>
                <input style={s.inp} value={form.targetLocations} onChange={e=>setForm(f=>({...f,targetLocations:e.target.value}))} placeholder="London, Manchester, UK" />
              </div>
              <div>
                <label style={s.label}>Primary Keywords (comma separated)</label>
                <input style={s.inp} value={form.primaryKeywords} onChange={e=>setForm(f=>({...f,primaryKeywords:e.target.value}))} placeholder="seo agency london, digital marketing" />
              </div>
              <div style={{ gridColumn:"span 2" }}>
                <label style={s.label}>Notes</label>
                <textarea style={{...s.inp, height:50, resize:"vertical"}} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Any additional context..." />
              </div>
            </div>
            <div style={{ display:"flex", gap:10, marginTop:16 }}>
              <button type="submit" disabled={saving} style={s.btn()}>{saving ? "Saving..." : "Save Brief (A1)"}</button>
              <button type="button" onClick={()=>setShowForm(false)} style={{ ...s.btn(bdr), color:txt }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Client List */}
      {loading ? (
        <div style={{ textAlign:"center", padding:40, color:txt3 }}>Loading clients...</div>
      ) : clients.length === 0 ? (
        <div style={{ textAlign:"center", padding:60, color:txt3 }}>
          <div style={{ fontSize:36, marginBottom:12 }}>🏢</div>
          <div style={{ fontSize:14, color:txt2 }}>No clients yet — add your first client above</div>
        </div>
      ) : (
        clients.map(client => (
          <div key={client.id} style={s.card} onClick={() => setSelected(client.id)}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:700, color:txt, marginBottom:4 }}>{client.name}</div>
                <div style={{ fontSize:11, color:txt2, marginBottom:10 }}>{client.website}</div>
                {/* Agent status badges */}
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  {Object.entries(client.agents || {}).map(([agent, status]) => (
                    <span key={agent} style={s.badge(statusColor(status))}>
                      {agent}: {statusLabel(status)}
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center", flexShrink:0, marginLeft:12 }}>
                <span style={{ fontSize:11, color:txt3 }}>View Pipeline →</span>
                <button onClick={(e) => deleteClient(client.id, e)}
                  style={{ padding:"4px 10px", borderRadius:6, border:`1px solid #DC262633`, background:"transparent", color:"#DC2626", fontSize:11, cursor:"pointer" }}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
