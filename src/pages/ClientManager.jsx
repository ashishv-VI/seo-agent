import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import AgentPipeline from "./AgentPipeline";

// ── Tag selector (multi-select with presets + custom input) ─────────────────
function TagSelect({ label, options, selected, onChange, placeholder, dark }) {
  const [custom, setCustom] = useState("");
  const bdr  = dark ? "#2a2a2a" : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#888"    : "#777";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";

  function toggle(v) {
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  }
  function addCustom() {
    const v = custom.trim();
    if (v && !selected.includes(v)) onChange([...selected, v]);
    setCustom("");
  }

  return (
    <div>
      <label style={{ fontSize:11, color:txt2, fontWeight:600, marginBottom:6, display:"block" }}>{label}</label>
      <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:8 }}>
        {options.map(o => (
          <button key={o} type="button" onClick={() => toggle(o)}
            style={{ padding:"4px 10px", borderRadius:16, fontSize:11, fontWeight:600, cursor:"pointer", border:`1px solid ${selected.includes(o) ? "#7C3AED" : bdr}`, background: selected.includes(o) ? "#7C3AED22" : "transparent", color: selected.includes(o) ? "#7C3AED" : txt2, transition:"all 0.1s" }}>
            {o}
          </button>
        ))}
      </div>
      <div style={{ display:"flex", gap:6 }}>
        <input value={custom} onChange={e => setCustom(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } if (e.key === ",") { e.preventDefault(); addCustom(); } }}
          placeholder={placeholder} style={{ flex:1, padding:"7px 10px", borderRadius:8, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:12, outline:"none", fontFamily:"inherit" }} />
        <button type="button" onClick={addCustom}
          style={{ padding:"7px 12px", borderRadius:8, border:`1px solid #7C3AED`, background:"transparent", color:"#7C3AED", fontSize:12, cursor:"pointer", fontWeight:600 }}>+ Add</button>
      </div>
      {selected.length > 0 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:6 }}>
          {selected.map(v => (
            <span key={v} style={{ padding:"3px 8px", borderRadius:12, background:"#7C3AED22", color:"#7C3AED", fontSize:11, fontWeight:600, display:"flex", alignItems:"center", gap:4 }}>
              {v}
              <span onClick={() => toggle(v)} style={{ cursor:"pointer", opacity:0.7 }}>×</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Location tag input (type + press Enter/comma) ───────────────────────────
function LocationInput({ label, value, onChange, dark }) {
  const [input, setInput] = useState("");
  const bdr  = dark ? "#2a2a2a" : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#888"    : "#777";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";

  function add() {
    const v = input.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setInput("");
  }

  return (
    <div>
      <label style={{ fontSize:11, color:txt2, fontWeight:600, marginBottom:6, display:"block" }}>{label}</label>
      <div style={{ display:"flex", gap:6 }}>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } if (e.key === ",") { e.preventDefault(); add(); } }}
          placeholder="Type city / region then press Enter"
          style={{ flex:1, padding:"7px 10px", borderRadius:8, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:12, outline:"none", fontFamily:"inherit" }} />
        <button type="button" onClick={add}
          style={{ padding:"7px 12px", borderRadius:8, border:`1px solid #7C3AED`, background:"transparent", color:"#7C3AED", fontSize:12, cursor:"pointer", fontWeight:600 }}>+ Add</button>
      </div>
      {value.length > 0 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:6 }}>
          {value.map(v => (
            <span key={v} style={{ padding:"3px 8px", borderRadius:12, background:"#0EA5E922", color:"#0EA5E9", fontSize:11, fontWeight:600, display:"flex", alignItems:"center", gap:4 }}>
              {v}
              <span onClick={() => onChange(value.filter(x => x !== v))} style={{ cursor:"pointer", opacity:0.7 }}>×</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Preset options ──────────────────────────────────────────────────────────
const SERVICE_OPTIONS = [
  "SEO", "Local SEO", "Technical SEO", "Link Building",
  "PPC / Google Ads", "Social Media Ads", "Content Marketing",
  "Web Design", "E-commerce", "Analytics & Reporting", "CRO", "Email Marketing",
];

const GOAL_OPTIONS = [
  "Top 3 Rankings", "Increase Organic Traffic", "Generate Leads",
  "Brand Awareness", "Local Visibility", "E-commerce Sales",
  "Technical Performance", "Content Authority", "Reduce Bounce Rate",
];

const CONVERSION_OPTIONS = [
  "Lead Form Submission", "Phone Call", "Online Purchase", "Book Appointment",
  "Newsletter Signup", "Quote Request", "Foot Traffic / Visit", "Live Chat",
];

const AUDIENCE_OPTIONS = [
  "Local Consumers", "Small Businesses (B2B)", "Enterprise / Corporate",
  "E-commerce Shoppers", "Home Owners", "Parents / Families",
  "Young Professionals", "Students", "Healthcare Patients",
  "Property Investors", "Restaurant / Cafe Goers", "Trade / Contractors",
];

const COUNTRY_OPTIONS = [
  "United Kingdom", "United States", "Australia", "Canada", "India",
  "Pakistan", "UAE", "South Africa", "Ireland", "New Zealand",
  "Germany", "France", "Singapore", "Malaysia", "Philippines",
];

// ─────────────────────────────────────────────────────────────────────────────

export default function ClientManager({ dark }) {
  const { user, API } = useAuth();
  const [clients,  setClients]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");
  const [selected, setSelected] = useState(null);

  const bg   = dark ? "#0a0a0a" : "#f5f5f0";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const txt3 = dark ? "#444"    : "#bbb";

  const blankForm = {
    businessName: "", websiteUrl: "", businessDescription: "",
    businessLocation: "", services: [], goals: [],
    targetAudience: [], conversionGoals: [],
    targetLocations: [], competitors: "", primaryKeywords: "",
    notes: "",
  };
  const [form, setForm] = useState(blankForm);

  async function getToken() { return user?.getIdToken?.() || ""; }

  async function loadClients() {
    setLoading(true);
    try {
      const token = await getToken();
      const res   = await fetch(`${API}/api/clients`, { headers: { Authorization: `Bearer ${token}` } });
      const data  = await res.json();
      setClients(data.clients || []);
    } catch { setError("Failed to load clients"); }
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
        conversionGoal:  form.conversionGoals.join(", "),  // A1 expects a string
        targetAudience:  form.targetAudience.join(", "),   // A1 expects a string
        competitors:     form.competitors.split(",").map(s => s.trim()).filter(Boolean),
        primaryKeywords: form.primaryKeywords.split(",").map(s => s.trim()).filter(Boolean),
        // services, goals, targetLocations, conversionGoals are already arrays
      };
      const res  = await fetch(`${API}/api/clients`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to create client"); setSaving(false); return; }
      setShowForm(false);
      setForm(blankForm);
      await loadClients();
    } catch (e) { setError(e.message); }
    setSaving(false);
  }

  async function deleteClient(clientId, e) {
    e.stopPropagation();
    if (!confirm("Delete this client and all their data?")) return;
    const token = await getToken();
    await fetch(`${API}/api/clients/${clientId}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    await loadClients();
  }

  const statusColor = s => ({ complete:"#059669", signed_off:"#059669", running:"#D97706", pending:txt3, failed:"#DC2626", incomplete:"#D97706" }[s] || txt3);
  const statusLabel = s => ({ complete:"Complete", signed_off:"Signed Off", running:"Running", pending:"Pending", failed:"Failed", incomplete:"Incomplete" }[s] || s);

  const s = {
    wrap:  { flex:1, overflowY:"auto", padding:24, background:bg },
    card:  { background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:12, cursor:"pointer", transition:"border 0.15s" },
    badge: (color) => ({ fontSize:10, padding:"2px 8px", borderRadius:10, background:color+"22", color, fontWeight:600 }),
    inp:   { width:"100%", padding:"9px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", fontFamily:"inherit", boxSizing:"border-box" },
    sel:   { width:"100%", padding:"9px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", fontFamily:"inherit", boxSizing:"border-box", cursor:"pointer" },
    label: { fontSize:11, color:txt2, fontWeight:600, marginBottom:4, display:"block" },
    btn:   (c="#7C3AED") => ({ padding:"9px 20px", borderRadius:8, border:"none", background:c, color:"#fff", fontWeight:600, fontSize:13, cursor:"pointer" }),
    grid:  { display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:16 },
    sec:   { fontSize:11, fontWeight:700, color:"#7C3AED", textTransform:"uppercase", letterSpacing:1, marginBottom:12, marginTop:8, paddingBottom:6, borderBottom:`1px solid ${bdr}`, gridColumn:"span 2" },
  };

  if (selected) {
    return <AgentPipeline dark={dark} clientId={selected} onBack={() => { setSelected(null); loadClients(); }} />;
  }

  return (
    <div style={s.wrap}>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:txt }}>Client Manager</div>
          <div style={{ fontSize:12, color:txt2, marginTop:2 }}>Manage clients · Run A1 brief · Trigger pipeline</div>
        </div>
        <button onClick={() => { setShowForm(true); setError(""); setForm(blankForm); }} style={s.btn()}>+ Add Client</button>
      </div>

      {error && <div style={{ padding:"10px 14px", borderRadius:8, background:"#DC262611", color:"#DC2626", fontSize:12, marginBottom:14 }}>{error}</div>}

      {/* Add Client Form */}
      {showForm && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:24, marginBottom:20 }}>
          <div style={{ fontSize:15, fontWeight:700, color:txt, marginBottom:6 }}>New Client Brief — A1</div>
          <div style={{ fontSize:11, color:txt2, marginBottom:20 }}>Fill in the brief. Downstream agents use this as their source of truth.</div>

          <form onSubmit={handleSubmit}>
            <div style={s.grid}>

              {/* ── Section: Business ─────────────────────────── */}
              <div style={s.sec}>Business Info</div>

              <div>
                <label style={s.label}>Business Name *</label>
                <input style={s.inp} required value={form.businessName}
                  onChange={e => setForm(f => ({...f, businessName: e.target.value}))}
                  placeholder="Acme Digital Agency" />
              </div>
              <div>
                <label style={s.label}>Website URL *</label>
                <input style={s.inp} required value={form.websiteUrl}
                  onChange={e => setForm(f => ({...f, websiteUrl: e.target.value}))}
                  placeholder="https://acme.com" />
              </div>

              <div>
                <label style={s.label}>Business Location</label>
                <select style={s.sel} value={form.businessLocation}
                  onChange={e => setForm(f => ({...f, businessLocation: e.target.value}))}>
                  <option value="">Select country / region</option>
                  {COUNTRY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                  <option value="Other">Other</option>
                </select>
              </div>
              <div style={{ gridColumn:"span 2" }}>
                <TagSelect label="Target Audience * (who are this client's customers?)" options={AUDIENCE_OPTIONS}
                  selected={form.targetAudience} onChange={v => setForm(f => ({...f, targetAudience: v}))}
                  placeholder="Custom audience (e.g. Dog owners, Gym-goers...)" dark={dark} />
              </div>

              <div style={{ gridColumn:"span 2" }}>
                <label style={s.label}>Business Description</label>
                <textarea style={{...s.inp, height:60, resize:"vertical"}} value={form.businessDescription}
                  onChange={e => setForm(f => ({...f, businessDescription: e.target.value}))}
                  placeholder="What does this business do? Products, USP, market position..." />
              </div>

              {/* ── Section: Services & Goals ─────────────────── */}
              <div style={s.sec}>Services & Goals</div>

              <div style={{ gridColumn:"span 2" }}>
                <TagSelect label="Services Offered (select all that apply)" options={SERVICE_OPTIONS}
                  selected={form.services} onChange={v => setForm(f => ({...f, services: v}))}
                  placeholder="Custom service..." dark={dark} />
              </div>

              <div style={{ gridColumn:"span 2" }}>
                <TagSelect label="SEO Goals *" options={GOAL_OPTIONS}
                  selected={form.goals} onChange={v => setForm(f => ({...f, goals: v}))}
                  placeholder="Custom goal..." dark={dark} />
              </div>

              <div style={{ gridColumn:"span 2" }}>
                <TagSelect label="Conversion Goals (what counts as a win for this client?)" options={CONVERSION_OPTIONS}
                  selected={form.conversionGoals} onChange={v => setForm(f => ({...f, conversionGoals: v}))}
                  placeholder="Custom goal..." dark={dark} />
              </div>

              {/* ── Section: Target Locations ─────────────────── */}
              <div style={s.sec}>Targeting</div>

              <div style={{ gridColumn:"span 2" }}>
                <LocationInput label="Target Locations (cities / regions to rank in)"
                  value={form.targetLocations}
                  onChange={v => setForm(f => ({...f, targetLocations: v}))}
                  dark={dark} />
              </div>

              <div style={{ gridColumn:"span 2" }}>
                <label style={s.label}>Primary Keywords (comma separated)</label>
                <input style={s.inp} value={form.primaryKeywords}
                  onChange={e => setForm(f => ({...f, primaryKeywords: e.target.value}))}
                  placeholder="seo agency london, digital marketing uk, local seo services" />
              </div>

              <div style={{ gridColumn:"span 2" }}>
                <label style={s.label}>Competitors (comma separated URLs)</label>
                <input style={s.inp} value={form.competitors}
                  onChange={e => setForm(f => ({...f, competitors: e.target.value}))}
                  placeholder="competitor1.com, competitor2.com" />
              </div>

              {/* ── Section: Notes ────────────────────────────── */}
              <div style={s.sec}>Additional Notes</div>

              <div style={{ gridColumn:"span 2" }}>
                <textarea style={{...s.inp, height:60, resize:"vertical"}} value={form.notes}
                  onChange={e => setForm(f => ({...f, notes: e.target.value}))}
                  placeholder="Any extra context — budget, timeline, previous SEO work, specific challenges..." />
              </div>
            </div>

            <div style={{ display:"flex", gap:10, marginTop:20 }}>
              <button type="submit" disabled={saving} style={s.btn()}>{saving ? "Saving..." : "Save Brief (A1)"}</button>
              <button type="button" onClick={() => setShowForm(false)} style={{ ...s.btn(bg3), color:txt, border:`1px solid ${bdr}` }}>Cancel</button>
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
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:2 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:txt }}>{client.name}</div>
                  {client.location && <span style={{ fontSize:10, color:txt2, background:bg3, padding:"2px 7px", borderRadius:8 }}>{client.location}</span>}
                </div>
                <div style={{ fontSize:11, color:txt2, marginBottom:10 }}>{client.website}</div>
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
                  style={{ padding:"4px 10px", borderRadius:6, border:"1px solid #DC262633", background:"transparent", color:"#DC2626", fontSize:11, cursor:"pointer" }}>
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
