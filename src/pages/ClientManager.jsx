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
      <label style={{ fontSize:13, color:txt2, fontWeight:600, marginBottom:6, display:"block" }}>{label}</label>
      <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:8 }}>
        {options.map(o => (
          <button key={o} type="button" onClick={() => toggle(o)}
            style={{ padding:"5px 12px", borderRadius:16, fontSize:12, fontWeight:600, cursor:"pointer", border:`1px solid ${selected.includes(o) ? "#443DCB" : bdr}`, background: selected.includes(o) ? "#443DCB22" : "transparent", color: selected.includes(o) ? "#443DCB" : txt2, transition:"all 0.1s" }}>
            {o}
          </button>
        ))}
      </div>
      <div style={{ display:"flex", gap:6 }}>
        <input value={custom} onChange={e => setCustom(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } if (e.key === ",") { e.preventDefault(); addCustom(); } }}
          placeholder={placeholder} style={{ flex:1, padding:"8px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", fontFamily:"inherit" }} />
        <button type="button" onClick={addCustom}
          style={{ padding:"8px 14px", borderRadius:8, border:`1px solid #443DCB`, background:"transparent", color:"#443DCB", fontSize:13, cursor:"pointer", fontWeight:600 }}>+ Add</button>
      </div>
      {selected.length > 0 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:6 }}>
          {selected.map(v => (
            <span key={v} style={{ padding:"4px 10px", borderRadius:12, background:"#443DCB22", color:"#443DCB", fontSize:12, fontWeight:600, display:"flex", alignItems:"center", gap:4 }}>
              {v}
              <span onClick={() => toggle(v)} style={{ cursor:"pointer", opacity:0.7 }}>×</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── City input with country suggestions ─────────────────────────────────────
function CityInput({ label, value, onChange, dark, countryCities }) {
  const [input, setInput] = useState("");
  const [showDrop, setShowDrop] = useState(false);
  const bdr  = dark ? "#2a2a2a" : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#888"    : "#777";
  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";

  function add(city) {
    const v = city.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setInput("");
    setShowDrop(false);
  }

  const filtered = countryCities.filter(
    c => c.toLowerCase().includes(input.toLowerCase()) && !value.includes(c)
  );

  return (
    <div>
      <label style={{ fontSize:13, color:txt2, fontWeight:600, marginBottom:6, display:"block" }}>{label}</label>

      {/* Country city suggestion chips */}
      {countryCities.length > 0 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginBottom:8 }}>
          {countryCities.filter(c => !value.includes(c)).slice(0, 10).map(c => (
            <button key={c} type="button" onClick={() => add(c)}
              style={{ padding:"4px 10px", borderRadius:14, fontSize:11, cursor:"pointer", border:`1px solid ${bdr}`, background:"transparent", color:txt2, fontWeight:500 }}>
              + {c}
            </button>
          ))}
        </div>
      )}

      <div style={{ position:"relative", display:"flex", gap:6 }}>
        <input value={input} onChange={e => { setInput(e.target.value); setShowDrop(true); }}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (filtered[0]) add(filtered[0]); else if (input.trim()) add(input); } if (e.key === "Escape") setShowDrop(false); }}
          onFocus={() => setShowDrop(true)}
          onBlur={() => setTimeout(() => setShowDrop(false), 150)}
          placeholder="Search or type a city..."
          style={{ flex:1, padding:"8px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", fontFamily:"inherit" }} />
        <button type="button" onClick={() => { if (input.trim()) add(input); }}
          style={{ padding:"8px 14px", borderRadius:8, border:`1px solid #443DCB`, background:"transparent", color:"#443DCB", fontSize:13, cursor:"pointer", fontWeight:600 }}>+ Add</button>

        {showDrop && input && filtered.length > 0 && (
          <div style={{ position:"absolute", top:"100%", left:0, right:60, background:bg2, border:`1px solid ${bdr}`, borderRadius:8, zIndex:100, maxHeight:160, overflowY:"auto", boxShadow:"0 4px 12px rgba(0,0,0,0.15)" }}>
            {filtered.slice(0, 8).map(c => (
              <div key={c} onMouseDown={() => add(c)}
                style={{ padding:"8px 12px", cursor:"pointer", fontSize:13, color:txt, borderBottom:`1px solid ${bdr}` }}
                onMouseEnter={e => e.target.style.background = dark?"#1a1a1a":"#f5f5f0"}
                onMouseLeave={e => e.target.style.background = "transparent"}>
                {c}
              </div>
            ))}
          </div>
        )}
      </div>

      {value.length > 0 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:6 }}>
          {value.map(v => (
            <span key={v} style={{ padding:"4px 10px", borderRadius:12, background:"#0EA5E922", color:"#0EA5E9", fontSize:12, fontWeight:600, display:"flex", alignItems:"center", gap:4 }}>
              {v}
              <span onClick={() => onChange(value.filter(x => x !== v))} style={{ cursor:"pointer", opacity:0.7 }}>×</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Competitor chip input ────────────────────────────────────────────────────
function CompetitorInput({ label, value, onChange, dark }) {
  const [input, setInput] = useState("");
  const bdr  = dark ? "#2a2a2a" : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#888"    : "#777";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";

  function add() {
    const v = input.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (v && !value.includes(v)) onChange([...value, v]);
    setInput("");
  }

  return (
    <div>
      <label style={{ fontSize:13, color:txt2, fontWeight:600, marginBottom:6, display:"block" }}>{label}</label>
      <div style={{ display:"flex", gap:6 }}>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } if (e.key === ",") { e.preventDefault(); add(); } }}
          placeholder="competitor.com"
          style={{ flex:1, padding:"8px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", fontFamily:"inherit" }} />
        <button type="button" onClick={add}
          style={{ padding:"8px 14px", borderRadius:8, border:`1px solid #DC2626`, background:"transparent", color:"#DC2626", fontSize:13, cursor:"pointer", fontWeight:600 }}>+ Add</button>
      </div>
      {value.length > 0 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:8 }}>
          {value.map((v, i) => (
            <span key={v} style={{ padding:"5px 12px", borderRadius:10, background:"#DC262611", border:"1px solid #DC262633", color:"#DC2626", fontSize:12, fontWeight:600, display:"flex", alignItems:"center", gap:6 }}>
              <span style={{ opacity:0.5, fontSize:10 }}>#{i+1}</span>
              {v}
              <span onClick={() => onChange(value.filter(x => x !== v))} style={{ cursor:"pointer", opacity:0.6, fontSize:14, lineHeight:1 }}>×</span>
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

const CITIES_BY_COUNTRY = {
  "United Kingdom":  ["London", "Manchester", "Birmingham", "Leeds", "Glasgow", "Liverpool", "Edinburgh", "Bristol", "Cardiff", "Sheffield", "Leicester", "Nottingham", "Newcastle", "Coventry", "Bradford"],
  "United States":   ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix", "Philadelphia", "San Antonio", "San Diego", "Dallas", "San Jose", "Austin", "Seattle", "Denver", "Miami", "Boston", "Atlanta", "Las Vegas", "Portland"],
  "Australia":       ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide", "Gold Coast", "Canberra", "Hobart", "Darwin", "Newcastle", "Wollongong", "Geelong"],
  "Canada":          ["Toronto", "Montreal", "Vancouver", "Calgary", "Edmonton", "Ottawa", "Winnipeg", "Quebec City", "Hamilton", "Kitchener", "Halifax", "Victoria"],
  "India":           ["Mumbai", "Delhi", "Bangalore", "Hyderabad", "Chennai", "Kolkata", "Pune", "Ahmedabad", "Jaipur", "Surat", "Lucknow", "Kanpur", "Nagpur", "Indore", "Bhopal", "Chandigarh", "Kochi"],
  "Pakistan":        ["Karachi", "Lahore", "Islamabad", "Faisalabad", "Rawalpindi", "Gujranwala", "Peshawar", "Multan", "Hyderabad", "Quetta", "Sialkot"],
  "UAE":             ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Ras Al Khaimah", "Fujairah", "Umm Al Quwain", "Al Ain"],
  "South Africa":    ["Johannesburg", "Cape Town", "Durban", "Pretoria", "Port Elizabeth", "Bloemfontein", "East London", "Nelspruit", "Polokwane"],
  "Ireland":         ["Dublin", "Cork", "Limerick", "Galway", "Waterford", "Drogheda", "Dundalk", "Swords", "Bray", "Navan"],
  "New Zealand":     ["Auckland", "Wellington", "Christchurch", "Hamilton", "Tauranga", "Dunedin", "Palmerston North", "Napier", "Nelson"],
  "Germany":         ["Berlin", "Hamburg", "Munich", "Cologne", "Frankfurt", "Stuttgart", "Düsseldorf", "Leipzig", "Dortmund", "Essen", "Bremen", "Dresden"],
  "France":          ["Paris", "Lyon", "Marseille", "Toulouse", "Nice", "Nantes", "Strasbourg", "Montpellier", "Bordeaux", "Lille", "Rennes"],
  "Singapore":       ["Singapore City", "Jurong", "Woodlands", "Tampines", "Ang Mo Kio", "Toa Payoh", "Clementi", "Bedok"],
  "Malaysia":        ["Kuala Lumpur", "George Town", "Johor Bahru", "Ipoh", "Shah Alam", "Petaling Jaya", "Subang Jaya", "Kota Kinabalu", "Kuching", "Malacca"],
  "Philippines":     ["Manila", "Quezon City", "Davao", "Caloocan", "Cebu City", "Zamboanga", "Antipolo", "Pasig", "Taguig", "Makati", "Pasay"],
};

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
    targetLocations: [], competitors: [], primaryKeywords: "",
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
        conversionGoal:  form.conversionGoals.join(", "),
        targetAudience:  form.targetAudience.join(", "),
        primaryKeywords: form.primaryKeywords.split(",").map(s => s.trim()).filter(Boolean),
        // competitors is already an array
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

  const countryCities = CITIES_BY_COUNTRY[form.businessLocation] || [];

  const s = {
    wrap:  { flex:1, overflowY:"auto", padding:24, background:bg },
    card:  { background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:20, marginBottom:12, cursor:"pointer", transition:"border 0.15s" },
    badge: (color) => ({ fontSize:11, padding:"3px 9px", borderRadius:10, background:color+"22", color, fontWeight:600 }),
    inp:   { width:"100%", padding:"10px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:14, outline:"none", fontFamily:"inherit", boxSizing:"border-box" },
    sel:   { width:"100%", padding:"10px 12px", borderRadius:8, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:14, outline:"none", fontFamily:"inherit", boxSizing:"border-box", cursor:"pointer" },
    label: { fontSize:13, color:txt2, fontWeight:600, marginBottom:5, display:"block" },
    btn:   (c="#443DCB") => ({ padding:"10px 22px", borderRadius:8, border:"none", background:c, color:"#fff", fontWeight:600, fontSize:14, cursor:"pointer" }),
    grid:  { display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:18 },
    sec:   { fontSize:12, fontWeight:700, color:"#443DCB", textTransform:"uppercase", letterSpacing:1, marginBottom:12, marginTop:8, paddingBottom:6, borderBottom:`1px solid ${bdr}`, gridColumn:"span 2" },
  };

  if (selected) {
    return <AgentPipeline dark={dark} clientId={selected} onBack={() => { setSelected(null); loadClients(); }} />;
  }

  return (
    <div style={s.wrap}>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <div style={{ fontSize:20, fontWeight:700, color:txt }}>Client Manager</div>
          <div style={{ fontSize:13, color:txt2, marginTop:2 }}>
            {clients.length > 0 ? `${clients.length} client${clients.length === 1 ? "" : "s"}` : "No clients yet"} · Run AI Pipeline · Export Reports
          </div>
        </div>
        <button onClick={() => { setShowForm(true); setError(""); setForm(blankForm); }} style={s.btn()}>+ Add Client</button>
      </div>

      {error && <div style={{ padding:"10px 14px", borderRadius:8, background:"#DC262611", color:"#DC2626", fontSize:13, marginBottom:14 }}>{error}</div>}

      {/* Add Client Form */}
      {showForm && (
        <div style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:12, padding:24, marginBottom:20 }}>
          <div style={{ fontSize:16, fontWeight:700, color:txt, marginBottom:6 }}>New Client Brief — A1</div>
          <div style={{ fontSize:13, color:txt2, marginBottom:20 }}>Fill in the brief. Downstream agents use this as their source of truth.</div>

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
                <label style={s.label}>Business Country</label>
                <select style={s.sel} value={form.businessLocation}
                  onChange={e => setForm(f => ({...f, businessLocation: e.target.value, targetLocations: [] }))}>
                  <option value="">Select country</option>
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
                <textarea style={{...s.inp, height:70, resize:"vertical"}} value={form.businessDescription}
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

              {/* ── Section: Targeting ────────────────────────── */}
              <div style={s.sec}>Targeting</div>

              <div style={{ gridColumn:"span 2" }}>
                <CityInput
                  label={`Target Cities${form.businessLocation ? ` — ${form.businessLocation}` : ""} (cities / regions to rank in)`}
                  value={form.targetLocations}
                  onChange={v => setForm(f => ({...f, targetLocations: v}))}
                  dark={dark}
                  countryCities={countryCities}
                />
              </div>

              <div style={{ gridColumn:"span 2" }}>
                <label style={s.label}>Primary Keywords (comma separated)</label>
                <input style={s.inp} value={form.primaryKeywords}
                  onChange={e => setForm(f => ({...f, primaryKeywords: e.target.value}))}
                  placeholder="seo agency london, digital marketing uk, local seo services" />
              </div>

              <div style={{ gridColumn:"span 2" }}>
                <CompetitorInput
                  label="Competitors (add one by one)"
                  value={form.competitors}
                  onChange={v => setForm(f => ({...f, competitors: v}))}
                  dark={dark}
                />
              </div>

              {/* ── Section: Notes ────────────────────────────── */}
              <div style={s.sec}>Additional Notes</div>

              <div style={{ gridColumn:"span 2" }}>
                <textarea style={{...s.inp, height:70, resize:"vertical"}} value={form.notes}
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

      {/* Stats bar */}
      {clients.length > 0 && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:8, marginBottom:16 }}>
          {[
            { l:"Total Clients",    v: clients.length,                                                           c:"#443DCB" },
            { l:"Pipeline Complete",v: clients.filter(c => c.pipelineStatus === "complete").length,              c:"#059669" },
            { l:"Running Now",      v: clients.filter(c => c.pipelineStatus === "running").length,               c:"#D97706" },
            { l:"Avg SEO Score",    v: (() => { const s=clients.filter(c=>c.seoScore!=null); return s.length ? Math.round(s.reduce((a,c)=>a+c.seoScore,0)/s.length) : "—"; })(), c:"#443DCB" },
            { l:"Needs Attention",  v: clients.filter(c => c.seoScore != null && c.seoScore < 50).length,        c:"#DC2626" },
          ].map(s => (
            <div key={s.l} style={{ background:bg2, border:`1px solid ${bdr}`, borderRadius:10, padding:"10px 14px", borderTop:`2px solid ${s.c}` }}>
              <div style={{ fontSize:20, fontWeight:800, color:s.c }}>{s.v}</div>
              <div style={{ fontSize:11, color:txt2, marginTop:2 }}>{s.l}</div>
            </div>
          ))}
        </div>
      )}

      {/* Client List */}
      {loading ? (
        <div style={{ textAlign:"center", padding:40, color:txt3 }}>Loading clients...</div>
      ) : clients.length === 0 ? (
        <div style={{ textAlign:"center", padding:60, color:txt3 }}>
          <div style={{ fontSize:36, marginBottom:12 }}>🏢</div>
          <div style={{ fontSize:15, color:txt2 }}>No clients yet — add your first client above</div>
        </div>
      ) : (
        clients.map(client => (
          <div key={client.id} style={s.card} onClick={() => setSelected(client.id)}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div style={{ flex:1 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:2 }}>
                  <div style={{ fontSize:15, fontWeight:700, color:txt }}>{client.name}</div>
                  {client.location && <span style={{ fontSize:11, color:txt2, background:bg3, padding:"2px 8px", borderRadius:8 }}>{client.location}</span>}
                </div>
                <div style={{ fontSize:12, color:txt2, marginBottom:10 }}>{client.website}</div>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  {Object.entries(client.agents || {}).filter(([a]) => ["A2","A3","A9"].includes(a)).map(([agent, status]) => (
                    <span key={agent} style={s.badge(statusColor(status))}>
                      {agent}: {statusLabel(status)}
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ display:"flex", gap:12, alignItems:"center", flexShrink:0, marginLeft:12 }}>
                {/* SEO Score ring */}
                {client.seoScore != null && (
                  <div style={{ width:48, height:48, borderRadius:"50%", border:`3px solid ${client.seoScore>=75?"#059669":client.seoScore>=50?"#D97706":"#DC2626"}`, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:`${client.seoScore>=75?"#059669":client.seoScore>=50?"#D97706":"#DC2626"}10`, flexShrink:0 }}>
                    <div style={{ fontSize:13, fontWeight:800, color:client.seoScore>=75?"#059669":client.seoScore>=50?"#D97706":"#DC2626" }}>{client.seoScore}</div>
                  </div>
                )}
                {/* Pipeline status badge */}
                {client.pipelineStatus === "complete" && <span style={{ fontSize:11, color:"#059669", fontWeight:600 }}>✅ Complete</span>}
                {client.pipelineStatus === "running"  && <span style={{ fontSize:11, color:"#D97706", fontWeight:600 }}>⏳ Running</span>}
                {client.pipelineStatus === "failed"   && <span style={{ fontSize:11, color:"#DC2626", fontWeight:600 }}>❌ Failed</span>}
                <span style={{ fontSize:12, color:txt3 }}>View Pipeline →</span>
                <button onClick={(e) => deleteClient(client.id, e)}
                  style={{ padding:"5px 12px", borderRadius:6, border:"1px solid #DC262633", background:"transparent", color:"#DC2626", fontSize:12, cursor:"pointer" }}>
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
