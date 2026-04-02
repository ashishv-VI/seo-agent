/**
 * RankTrackerPanel — Geo-specific keyword rank tracker
 *
 * Features:
 * - Add 100+ keywords (bulk paste / one-by-one)
 * - Categories (Services, Blog, Location, Brand, etc.)
 * - Country + City location targeting per keyword group
 * - Live position check via SE Ranking API
 * - Position history (up ↑ / down ↓ / new)
 * - Filter by category / country / position range
 * - Target URL mapping per keyword
 */
import { useState, useEffect, useCallback } from "react";

const B = "#443DCB";

const COUNTRIES = [
  { code:"US", name:"United States" }, { code:"GB", name:"United Kingdom" },
  { code:"IN", name:"India" },         { code:"AE", name:"UAE" },
  { code:"AU", name:"Australia" },     { code:"CA", name:"Canada" },
  { code:"PK", name:"Pakistan" },      { code:"SG", name:"Singapore" },
  { code:"DE", name:"Germany" },       { code:"FR", name:"France" },
  { code:"SA", name:"Saudi Arabia" },  { code:"ZA", name:"South Africa" },
  { code:"NG", name:"Nigeria" },       { code:"BD", name:"Bangladesh" },
  { code:"NL", name:"Netherlands" },   { code:"PH", name:"Philippines" },
  { code:"MY", name:"Malaysia" },      { code:"NZ", name:"New Zealand" },
  { code:"IE", name:"Ireland" },       { code:"BR", name:"Brazil" },
];

const DEFAULT_CATEGORIES = ["Services", "Location", "Blog", "Brand", "Competitor", "Product", "Informational", "General"];

export default function RankTrackerPanel({ dark, clientId, getToken, API }) {
  const [keywords,     setKeywords]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [checking,     setChecking]     = useState(false);
  const [activeTab,    setActiveTab]    = useState("keywords");
  const [error,        setError]        = useState("");
  const [success,      setSuccess]      = useState("");

  // Filters
  const [filterCat,    setFilterCat]    = useState("all");
  const [filterCountry,setFilterCountry]= useState("all");
  const [filterPos,    setFilterPos]    = useState("all"); // all|top3|top10|top20|top50|unranked

  // Add keywords form
  const [showAdd,      setShowAdd]      = useState(false);
  const [bulkText,     setBulkText]     = useState("");
  const [newCategory,  setNewCategory]  = useState("General");
  const [customCat,    setCustomCat]    = useState("");
  const [newCountry,   setNewCountry]   = useState("US");
  const [newCity,      setNewCity]      = useState("");
  const [newTargetUrl, setNewTargetUrl] = useState("");
  const [adding,       setAdding]       = useState(false);

  // Edit
  const [editingId,    setEditingId]    = useState(null);
  const [editCategory, setEditCategory] = useState("");

  // API key status for rank checking
  const [activeEngine,  setActiveEngine]  = useState(null); // "dataforseo" | "serpapi" | "seranking" | null
  const [dfsBalance,    setDfsBalance]    = useState(null);
  const [showDfsSetup,  setShowDfsSetup]  = useState(false);
  const [dfsInput,      setDfsInput]      = useState("");
  const [dfsSaving,     setDfsSaving]     = useState(false);

  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#2a2a2a" : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#777"    : "#888";

  const tab = (a) => ({
    padding: "5px 14px", borderRadius: 16, fontSize: 12, cursor: "pointer",
    fontWeight: a ? 600 : 400,
    background: a ? `${B}22` : "transparent",
    color:      a ? "#6B62E8" : txt2,
    border:     `1px solid ${a ? `${B}44` : bdr}`,
  });

  // ── Load keywords ────────────────────────────────────────────────────────────
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const token = await getToken();
      const res   = await fetch(`${API}/api/rank-tracker/${clientId}/tracked-keywords`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data  = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load keywords");
      setKeywords(data.keywords || []);
    } catch (e) { setError(e.message); }
    if (!silent) setLoading(false);
  }, [clientId, getToken, API]);

  useEffect(() => { load(); loadDfsStatus(); }, [load]);

  async function loadDfsStatus() {
    try {
      const token = await getToken();
      const res   = await fetch(`${API}/api/keys/get`, { headers: { Authorization: `Bearer ${token}` } });
      const data  = await res.json();
      const keys  = data.keys || {};
      if (keys.dataforseo)          setActiveEngine("dataforseo");
      else if (keys.serpapi || keys.serp) setActiveEngine("serpapi");
      else if (keys.seranking)      setActiveEngine("seranking");
      else                          setActiveEngine(null);
    } catch { /* silent */ }
  }

  async function saveDfsKey() {
    if (!dfsInput.includes(":")) {
      setError("Enter your DataForSEO credentials as login:password (colon-separated)");
      return;
    }
    setDfsSaving(true); setError("");
    try {
      const token = await getToken();

      // Verify credentials first
      const verifyRes  = await fetch(`${API}/api/rank-tracker/${clientId}/verify-dataforseo`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ auth: dfsInput }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyData.valid) {
        setError(`Invalid DataForSEO credentials: ${verifyData.error || "Login failed"}`);
        setDfsSaving(false);
        return;
      }

      await fetch(`${API}/api/keys/save`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body:    JSON.stringify({ dataforseo: dfsInput }),
      });

      setActiveEngine("dataforseo");
      setDfsBalance(verifyData.balance);
      setShowDfsSetup(false);
      setDfsInput("");
      setSuccess(`DataForSEO connected! Balance: $${verifyData.balance?.toFixed(2) ?? "—"}`);
    } catch (e) { setError(e.message); }
    setDfsSaving(false);
  }

  // ── Add keywords ─────────────────────────────────────────────────────────────
  async function addKeywords() {
    const lines = bulkText.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    if (!lines.length) { setError("Enter at least one keyword"); return; }

    setAdding(true); setError("");
    try {
      const token    = await getToken();
      const category = customCat.trim() || newCategory;
      const country  = COUNTRIES.find(c => c.code === newCountry);

      const res = await fetch(`${API}/api/rank-tracker/${clientId}/tracked-keywords`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body:    JSON.stringify({
          keywords: lines,
          category,
          location: { country: newCountry, countryName: country?.name || newCountry, city: newCity.trim() },
          targetUrl: newTargetUrl.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add keywords");

      setSuccess(`Added ${data.added} keyword${data.added !== 1 ? "s" : ""}${data.skipped ? ` (${data.skipped} duplicates skipped)` : ""}`);
      setBulkText(""); setNewTargetUrl(""); setNewCity(""); setShowAdd(false);
      await load(true);
    } catch (e) { setError(e.message); }
    setAdding(false);
  }

  // ── Check positions ──────────────────────────────────────────────────────────
  async function checkPositions() {
    setChecking(true); setError(""); setSuccess("");
    try {
      const token = await getToken();
      const res   = await fetch(`${API}/api/rank-tracker/${clientId}/check-positions`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Check failed");
      setSuccess(`Checked ${data.checked} keywords across ${data.countries?.join(", ")} — positions updated`);
      await load(true);
    } catch (e) { setError(e.message); }
    setChecking(false);
  }

  // ── Delete keyword ───────────────────────────────────────────────────────────
  async function deleteKeyword(id) {
    try {
      const token = await getToken();
      await fetch(`${API}/api/rank-tracker/${clientId}/tracked-keywords/${id}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      setKeywords(k => k.filter(kw => kw.id !== id));
    } catch (e) { setError(e.message); }
  }

  // ── Update category ──────────────────────────────────────────────────────────
  async function saveCategory(id) {
    try {
      const token = await getToken();
      await fetch(`${API}/api/rank-tracker/${clientId}/tracked-keywords/${id}`, {
        method:  "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body:    JSON.stringify({ category: editCategory }),
      });
      setKeywords(k => k.map(kw => kw.id === id ? { ...kw, category: editCategory } : kw));
      setEditingId(null);
    } catch (e) { setError(e.message); }
  }

  // ── Filtered keywords ────────────────────────────────────────────────────────
  const filtered = keywords.filter(kw => {
    if (filterCat !== "all"     && kw.category          !== filterCat)     return false;
    if (filterCountry !== "all" && kw.location?.country !== filterCountry)  return false;
    if (filterPos === "top3"    && !(kw.currentPosition <= 3))  return false;
    if (filterPos === "top10"   && !(kw.currentPosition <= 10)) return false;
    if (filterPos === "top20"   && !(kw.currentPosition <= 20)) return false;
    if (filterPos === "top50"   && !(kw.currentPosition <= 50)) return false;
    if (filterPos === "unranked"&& kw.currentPosition !== null) return false;
    return true;
  });

  // ── Stats ────────────────────────────────────────────────────────────────────
  const ranked   = keywords.filter(k => k.currentPosition !== null).length;
  const top10    = keywords.filter(k => k.currentPosition !== null && k.currentPosition <= 10).length;
  const improved = keywords.filter(k => k.change !== null && k.change > 0).length;
  const declined = keywords.filter(k => k.change !== null && k.change < 0).length;

  const categories = [...new Set(keywords.map(k => k.category).filter(Boolean))];
  const countries  = [...new Set(keywords.map(k => k.location?.country).filter(Boolean))];

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: txt2 }}>Loading rank tracker…</div>;

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: txt }}>Rank Tracker</div>
          <div style={{ fontSize: 11, color: txt2 }}>{keywords.length} keywords tracked · {countries.join(", ") || "No locations set"}</div>
        </div>
        <button onClick={() => setShowAdd(s => !s)}
          style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: B, color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
          + Add Keywords
        </button>
        <button onClick={checkPositions} disabled={checking || !keywords.length}
          style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${bdr}`, background: checking ? "#888" : bg2, color: checking ? "#fff" : txt, fontSize: 12, cursor: checking || !keywords.length ? "not-allowed" : "pointer", fontWeight: 600 }}>
          {checking ? "⏳ Checking…" : "🔄 Check Rankings"}
        </button>
      </div>

      {error   && <div style={{ padding: "10px 14px", borderRadius: 8, background: "#DC262611", color: "#DC2626", fontSize: 12, marginBottom: 12 }}>{error}<button onClick={() => setError("")} style={{ marginLeft: 8, background: "none", border: "none", color: "#DC2626", cursor: "pointer" }}>×</button></div>}
      {success && <div style={{ padding: "10px 14px", borderRadius: 8, background: "#05966911", color: "#059669", fontSize: 12, marginBottom: 12 }}>{success}<button onClick={() => setSuccess("")} style={{ marginLeft: 8, background: "none", border: "none", color: "#059669", cursor: "pointer" }}>×</button></div>}

      {/* ── Rank Engine Status ── */}
      {!activeEngine && !showDfsSetup && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8, background: "#DC262611", border: "1px solid #DC262633", marginBottom: 12 }}>
          <span style={{ fontSize: 15 }}>⚠️</span>
          <div style={{ flex: 1, fontSize: 12, color: "#DC2626" }}>
            <strong>No rank checking API found.</strong> Add a SerpAPI or DataForSEO key to check live positions.
          </div>
          <button onClick={() => setShowDfsSetup(true)}
            style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: "#DC2626", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
            Add API Key
          </button>
        </div>
      )}

      {activeEngine === "seranking" && !showDfsSetup && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8, background: "#D9770611", border: "1px solid #D9770633", marginBottom: 12 }}>
          <span style={{ fontSize: 15 }}>⚠️</span>
          <div style={{ flex: 1, fontSize: 12, color: "#D97706" }}>
            Using <strong>SE Ranking</strong> (research DB only — may show null for small domains).
            Add a <strong>SerpAPI</strong> or <strong>DataForSEO</strong> key for live Google positions.
          </div>
          <button onClick={() => setShowDfsSetup(true)}
            style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: "#D97706", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
            Upgrade Engine
          </button>
        </div>
      )}

      {(activeEngine === "serpapi" || activeEngine === "dataforseo") && !showDfsSetup && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderRadius: 8, background: "#05966911", border: "1px solid #05966933", marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: "#059669" }}>✓</span>
          <div style={{ flex: 1, fontSize: 12, color: "#059669" }}>
            <strong>{activeEngine === "dataforseo" ? "DataForSEO" : "SerpAPI"} connected</strong> — live Google SERP position checking active
            {dfsBalance !== null && <span style={{ marginLeft: 6 }}>(Balance: ${dfsBalance?.toFixed(2)})</span>}
          </div>
          <button onClick={() => setShowDfsSetup(true)}
            style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid #05966944`, background: "transparent", color: "#059669", fontSize: 11, cursor: "pointer" }}>
            Update
          </button>
        </div>
      )}

      {showDfsSetup && (
        <div style={{ background: bg2, border: `1px solid ${B}44`, borderRadius: 12, padding: "16px 18px", marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: txt, marginBottom: 10 }}>Live Rank Checking Setup</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div style={{ padding: "12px 14px", borderRadius: 8, border: `1px solid ${bdr}`, background: bg3 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: txt, marginBottom: 4 }}>Option 1: SerpAPI <span style={{ color: "#059669", fontWeight: 400 }}>(100 free/month)</span></div>
              <div style={{ fontSize: 11, color: txt2, lineHeight: 1.6 }}>
                Sign up free at <strong style={{ color: txt }}>serpapi.com</strong><br />
                Dashboard → API Key → copy the key<br />
                Save it in <strong style={{ color: txt }}>Settings → SE Ranking / SerpAPI</strong>
              </div>
            </div>
            <div style={{ padding: "12px 14px", borderRadius: 8, border: `1px solid ${bdr}`, background: bg3 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: txt, marginBottom: 4 }}>Option 2: DataForSEO <span style={{ color: txt2, fontWeight: 400 }}>(~$0.001/keyword)</span></div>
              <div style={{ fontSize: 11, color: txt2, lineHeight: 1.6 }}>
                Sign up at <strong style={{ color: txt }}>dataforseo.com</strong><br />
                Dashboard → API Access → copy Login + Password<br />
                Enter below as <code style={{ background: bg2, padding: "1px 4px", borderRadius: 3 }}>login:password</code>
              </div>
            </div>
          </div>

          <div style={{ fontSize: 11, fontWeight: 600, color: txt2, marginBottom: 6 }}>DataForSEO credentials (login:password)</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="text"
              placeholder="yourlogin@email.com:your_api_password"
              value={dfsInput}
              onChange={e => setDfsInput(e.target.value)}
              style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `1px solid ${bdr}`, background: bg3, color: txt, fontSize: 12, outline: "none" }}
            />
            <button onClick={saveDfsKey} disabled={dfsSaving || !dfsInput.trim()}
              style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: dfsSaving ? "#888" : B, color: "#fff", fontWeight: 700, fontSize: 12, cursor: dfsSaving ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>
              {dfsSaving ? "Verifying…" : "Save & Verify"}
            </button>
            <button onClick={() => { setShowDfsSetup(false); setDfsInput(""); }}
              style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${bdr}`, background: "transparent", color: txt2, fontSize: 12, cursor: "pointer" }}>
              Cancel
            </button>
          </div>
          <div style={{ fontSize: 11, color: txt2, marginTop: 8 }}>
            For SerpAPI: go to Settings (gear icon) and add your SerpAPI key there — it will be auto-detected.
          </div>
        </div>
      )}

      {/* ── Add Keywords Panel ── */}
      {showAdd && (
        <div style={{ background: bg2, border: `1px solid ${B}44`, borderRadius: 12, padding: "18px 20px", marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: txt, marginBottom: 12 }}>Add Keywords</div>

          {/* Bulk textarea */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: txt2, display: "block", marginBottom: 4 }}>
              Keywords <span style={{ color: "#059669" }}>(one per line or comma-separated — 100+ supported)</span>
            </label>
            <textarea
              rows={6}
              placeholder={"seo services dubai\ndigital marketing agency\nweb design company\nbest seo company india\n..."}
              value={bulkText}
              onChange={e => setBulkText(e.target.value)}
              style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${bdr}`, background: bg3, color: txt, fontSize: 12, outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "monospace" }}
            />
            <div style={{ fontSize: 11, color: txt2, marginTop: 3 }}>
              {bulkText.split(/[\n,]+/).filter(s => s.trim()).length} keywords entered
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 12 }}>
            {/* Category */}
            <div>
              <label style={{ fontSize: 11, color: txt2, display: "block", marginBottom: 4 }}>Category</label>
              <select value={newCategory} onChange={e => setNewCategory(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${bdr}`, background: bg3, color: txt, fontSize: 12 }}>
                {DEFAULT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                <option value="custom">+ Custom category</option>
              </select>
              {newCategory === "custom" && (
                <input type="text" placeholder="Category name" value={customCat} onChange={e => setCustomCat(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${B}`, background: bg2, color: txt, fontSize: 12, marginTop: 6, outline: "none", boxSizing: "border-box" }} />
              )}
            </div>

            {/* Country */}
            <div>
              <label style={{ fontSize: 11, color: txt2, display: "block", marginBottom: 4 }}>Country <span style={{ color: B }}>🌍 Geo-specific</span></label>
              <select value={newCountry} onChange={e => setNewCountry(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${bdr}`, background: bg3, color: txt, fontSize: 12 }}>
                {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </div>

            {/* City */}
            <div>
              <label style={{ fontSize: 11, color: txt2, display: "block", marginBottom: 4 }}>City <span style={{ color: txt2 }}>(optional)</span></label>
              <input type="text" placeholder="e.g. Dubai, Mumbai, London"
                value={newCity} onChange={e => setNewCity(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${bdr}`, background: bg3, color: txt, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
            </div>

            {/* Target URL */}
            <div>
              <label style={{ fontSize: 11, color: txt2, display: "block", marginBottom: 4 }}>Target URL <span style={{ color: txt2 }}>(optional)</span></label>
              <input type="url" placeholder="https://example.com/services"
                value={newTargetUrl} onChange={e => setNewTargetUrl(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${bdr}`, background: bg3, color: txt, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={addKeywords} disabled={adding || !bulkText.trim()}
              style={{ padding: "9px 22px", borderRadius: 8, border: "none", background: adding || !bulkText.trim() ? "#888" : B, color: "#fff", fontWeight: 700, fontSize: 13, cursor: adding ? "not-allowed" : "pointer" }}>
              {adding ? "Adding…" : `Add ${bulkText.split(/[\n,]+/).filter(s=>s.trim()).length || 0} Keywords`}
            </button>
            <button onClick={() => { setShowAdd(false); setBulkText(""); setError(""); }}
              style={{ padding: "9px 16px", borderRadius: 8, border: `1px solid ${bdr}`, background: "transparent", color: txt2, fontSize: 12, cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Stats Bar ── */}
      {keywords.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 8, marginBottom: 16 }}>
          {[
            { label: "Total",     value: keywords.length,  color: B },
            { label: "Ranked",    value: ranked,            color: "#059669" },
            { label: "Top 10",    value: top10,             color: "#2563EB" },
            { label: "Improved ↑",value: improved,          color: "#059669" },
            { label: "Declined ↓",value: declined,          color: "#DC2626" },
            { label: "Unranked",  value: keywords.length - ranked, color: txt2 },
          ].map(s => (
            <div key={s.label} style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 10, color: txt2, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={tab(activeTab === "keywords")} onClick={() => setActiveTab("keywords")}>📋 All Keywords</div>
        <div style={tab(activeTab === "top10")}    onClick={() => setActiveTab("top10")}>🏆 Top 10</div>
        <div style={tab(activeTab === "movers")}   onClick={() => setActiveTab("movers")}>📈 Movers</div>
        <div style={tab(activeTab === "unranked")} onClick={() => setActiveTab("unranked")}>❌ Unranked</div>
        <div style={tab(activeTab === "trends")}   onClick={() => setActiveTab("trends")}>📊 Trends</div>
      </div>

      {/* ── Filters ── */}
      {keywords.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: txt2 }}>Filter:</span>

          <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
            style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${bdr}`, background: bg2, color: txt, fontSize: 11 }}>
            <option value="all">All categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select value={filterCountry} onChange={e => setFilterCountry(e.target.value)}
            style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${bdr}`, background: bg2, color: txt, fontSize: 11 }}>
            <option value="all">All countries</option>
            {countries.map(c => <option key={c} value={c}>{COUNTRIES.find(x=>x.code===c)?.name || c}</option>)}
          </select>

          <select value={filterPos} onChange={e => setFilterPos(e.target.value)}
            style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${bdr}`, background: bg2, color: txt, fontSize: 11 }}>
            <option value="all">All positions</option>
            <option value="top3">Top 3</option>
            <option value="top10">Top 10</option>
            <option value="top20">Top 20</option>
            <option value="top50">Top 50</option>
            <option value="unranked">Not ranking</option>
          </select>

          <span style={{ fontSize: 11, color: txt2 }}>{filtered.length} shown</span>
        </div>
      )}

      {/* ── Empty state ── */}
      {keywords.length === 0 && (
        <div style={{ background: bg2, border: `2px dashed ${bdr}`, borderRadius: 12, padding: "40px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📍</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: txt, marginBottom: 8 }}>No keywords tracked yet</div>
          <div style={{ fontSize: 12, color: txt2, marginBottom: 20 }}>Add keywords with location targeting to track their Google rankings</div>
          <button onClick={() => setShowAdd(true)}
            style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: B, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            + Add Your First Keywords
          </button>
        </div>
      )}

      {/* ── Trends Tab ── */}
      {activeTab === "trends" && (
        <TrendsView keywords={filtered} dark={dark} bg2={bg2} bdr={bdr} txt={txt} txt2={txt2} />
      )}

      {/* ── Keywords Table (all other tabs) ── */}
      {activeTab !== "trends" && filtered.length > 0 && (
        <KeywordsTable
          keywords={getTabKeywords(filtered, activeTab)}
          editingId={editingId} editCategory={editCategory}
          setEditingId={setEditingId} setEditCategory={setEditCategory}
          saveCategory={saveCategory} deleteKeyword={deleteKeyword}
          DEFAULT_CATEGORIES={DEFAULT_CATEGORIES}
          dark={dark} bg2={bg2} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2}
        />
      )}
    </div>
  );
}

// ── Sparkline SVG ─────────────────────────────────────────────────────────────
function Sparkline({ history, width = 80, height = 28 }) {
  const pts = (history || []).filter(h => h.position !== null && h.position > 0).slice(-30);
  if (pts.length < 2) return <span style={{ fontSize: 10, color: "#888" }}>no data</span>;

  const positions = pts.map(p => p.position);
  const min = Math.min(...positions);
  const max = Math.max(...positions);
  const range = max - min || 1;

  const x  = i  => (i / (pts.length - 1)) * width;
  // Invert: lower position (better rank) = higher on chart
  const y  = pos => height - ((pos - min) / range) * (height - 4) - 2;

  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.position).toFixed(1)}`).join(" ");

  const latest = positions[positions.length - 1];
  const first  = positions[0];
  const color  = latest < first ? "#059669" : latest > first ? "#DC2626" : "#6B7280";

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible", display: "block" }}>
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(pts.length - 1).toFixed(1)} cy={y(latest).toFixed(1)} r="2.5" fill={color} />
    </svg>
  );
}

// ── Trends Grid ───────────────────────────────────────────────────────────────
function TrendsView({ keywords, dark, bg2, bdr, txt, txt2 }) {
  const withHistory = keywords.filter(kw => (kw.history || []).filter(h => h.position).length >= 2);

  if (!withHistory.length) {
    return (
      <div style={{ textAlign: "center", padding: "40px 20px", color: txt2, fontSize: 13 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
        <div style={{ fontWeight: 700, color: txt, marginBottom: 8 }}>No trend data yet</div>
        <div>Click <strong>Check Rankings</strong> at least twice to see position trends over time.</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 11, color: txt2, marginBottom: 12 }}>
        {withHistory.length} keyword{withHistory.length !== 1 ? "s" : ""} with history · last 30 data points shown · <span style={{ color: "#059669" }}>green = improving</span>, <span style={{ color: "#DC2626" }}>red = declining</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
        {withHistory.map(kw => {
          const pts     = (kw.history || []).filter(h => h.position).slice(-30);
          const latest  = kw.currentPosition;
          const oldest  = pts[0]?.position;
          const delta   = oldest && latest ? oldest - latest : null;
          const posColor = latest === null ? "#888" : latest <= 3 ? "#059669" : latest <= 10 ? "#2563EB" : latest <= 20 ? "#D97706" : "#DC2626";
          return (
            <div key={kw.id} style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: txt, marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={kw.keyword}>
                {kw.keyword}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <Sparkline history={kw.history} />
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: posColor, lineHeight: 1 }}>{latest ?? "—"}</div>
                  {delta !== null && delta !== 0 && (
                    <div style={{ fontSize: 10, fontWeight: 700, color: delta > 0 ? "#059669" : "#DC2626", marginTop: 2 }}>
                      {delta > 0 ? `↑ ${delta}` : `↓ ${Math.abs(delta)}`}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 9, color: txt2, marginTop: 6 }}>
                {kw.location?.countryName || kw.location?.country || ""} · {pts.length} checks
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getTabKeywords(keywords, tab) {
  if (tab === "top10")    return keywords.filter(k => k.currentPosition !== null && k.currentPosition <= 10);
  if (tab === "movers")   return keywords.filter(k => k.change !== null && k.change !== 0).sort((a,b) => Math.abs(b.change) - Math.abs(a.change));
  if (tab === "unranked") return keywords.filter(k => k.currentPosition === null);
  return keywords;
}

// ── Keywords table component ──────────────────────────────────────────────────
function KeywordsTable({ keywords, editingId, editCategory, setEditingId, setEditCategory, saveCategory, deleteKeyword, DEFAULT_CATEGORIES, dark, bg2, bg3, bdr, txt, txt2 }) {
  if (!keywords.length) return (
    <div style={{ textAlign: "center", color: txt2, fontSize: 12, padding: "30px 0" }}>No keywords match this filter</div>
  );

  return (
    <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: dark ? "#1a1a1a" : "#f5f5f0" }}>
              {["Keyword","Category","Location","Position","Change","Vol","KD","Ranking URL","Last Checked",""].map(h => (
                <th key={h} style={{ padding: "9px 10px", textAlign: h === "Position" || h === "Change" || h === "Vol" || h === "KD" ? "center" : "left", color: txt2, fontWeight: 600, whiteSpace: "nowrap", fontSize: 11 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {keywords.map((kw, i) => (
              <KeywordRow
                key={kw.id} kw={kw} i={i}
                editingId={editingId} editCategory={editCategory}
                setEditingId={setEditingId} setEditCategory={setEditCategory}
                saveCategory={saveCategory} deleteKeyword={deleteKeyword}
                DEFAULT_CATEGORIES={DEFAULT_CATEGORIES}
                dark={dark} bg3={bg3} bdr={bdr} txt={txt} txt2={txt2}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KeywordRow({ kw, i, editingId, editCategory, setEditingId, setEditCategory, saveCategory, deleteKeyword, DEFAULT_CATEGORIES, dark, bg3, bdr, txt, txt2 }) {
  const pos     = kw.currentPosition;
  const change  = kw.change;
  const posColor = pos === null ? txt2 : pos <= 3 ? "#059669" : pos <= 10 ? "#2563EB" : pos <= 20 ? "#D97706" : "#DC2626";

  return (
    <tr style={{ borderTop: `1px solid ${bdr}`, background: i % 2 === 0 ? "transparent" : bg3 }}>
      {/* Keyword */}
      <td style={{ padding: "9px 10px", maxWidth: 200 }}>
        <div style={{ fontWeight: 600, color: txt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{kw.keyword}</div>
        {kw.targetUrl && <div style={{ fontSize: 10, color: txt2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{kw.targetUrl}</div>}
      </td>

      {/* Category — editable */}
      <td style={{ padding: "9px 10px" }}>
        {editingId === kw.id ? (
          <div style={{ display: "flex", gap: 4 }}>
            <select value={editCategory} onChange={e => setEditCategory(e.target.value)}
              style={{ padding: "3px 6px", borderRadius: 5, border: `1px solid #443DCB`, background: dark?"#0a0a0a":"#fff", color: txt, fontSize: 11 }}>
              {DEFAULT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={() => saveCategory(kw.id)} style={{ padding: "3px 7px", borderRadius: 5, border: "none", background: "#059669", color: "#fff", fontSize: 10, cursor: "pointer" }}>✓</button>
            <button onClick={() => setEditingId(null)} style={{ padding: "3px 7px", borderRadius: 5, border: `1px solid ${bdr}`, background: "transparent", color: txt2, fontSize: 10, cursor: "pointer" }}>×</button>
          </div>
        ) : (
          <span onClick={() => { setEditingId(kw.id); setEditCategory(kw.category); }}
            style={{ padding: "2px 8px", borderRadius: 10, background: `${getCatColor(kw.category)}22`, color: getCatColor(kw.category), fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
            {kw.category || "General"}
          </span>
        )}
      </td>

      {/* Location */}
      <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>
        <div style={{ fontSize: 11, color: txt, fontWeight: 600 }}>🌍 {kw.location?.countryName || kw.location?.country || "—"}</div>
        {kw.location?.city && <div style={{ fontSize: 10, color: txt2 }}>{kw.location.city}</div>}
      </td>

      {/* Position */}
      <td style={{ padding: "9px 10px", textAlign: "center" }}>
        {pos === null ? (
          <span style={{ fontSize: 11, color: txt2 }}>—</span>
        ) : (
          <span style={{ fontSize: 14, fontWeight: 800, color: posColor }}>{pos}</span>
        )}
      </td>

      {/* Change */}
      <td style={{ padding: "9px 10px", textAlign: "center" }}>
        {change === null || change === 0 ? (
          <span style={{ fontSize: 11, color: txt2 }}>{change === 0 ? "→" : "—"}</span>
        ) : change > 0 ? (
          <span style={{ fontSize: 12, fontWeight: 700, color: "#059669" }}>↑ {change}</span>
        ) : (
          <span style={{ fontSize: 12, fontWeight: 700, color: "#DC2626" }}>↓ {Math.abs(change)}</span>
        )}
      </td>

      {/* Volume */}
      <td style={{ padding: "9px 10px", textAlign: "center", color: txt2, fontSize: 11 }}>
        {kw.volume ? fmtNum(kw.volume) : "—"}
      </td>

      {/* KD */}
      <td style={{ padding: "9px 10px", textAlign: "center" }}>
        {kw.difficulty ? (
          <span style={{ fontSize: 11, fontWeight: 600, color: kw.difficulty > 70 ? "#DC2626" : kw.difficulty > 40 ? "#D97706" : "#059669" }}>
            {kw.difficulty}
          </span>
        ) : <span style={{ color: txt2 }}>—</span>}
      </td>

      {/* Ranking URL */}
      <td style={{ padding: "9px 10px", maxWidth: 180 }}>
        {kw.rankingUrl ? (
          <a href={kw.rankingUrl} target="_blank" rel="noreferrer"
            style={{ fontSize: 10, color: "#443DCB", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
            {kw.rankingUrl.replace(/^https?:\/\//, "")}
          </a>
        ) : <span style={{ fontSize: 10, color: txt2 }}>—</span>}
      </td>

      {/* Last checked */}
      <td style={{ padding: "9px 10px", fontSize: 10, color: txt2, whiteSpace: "nowrap" }}>
        {kw.lastChecked ? new Date(kw.lastChecked).toLocaleDateString() : "Never"}
      </td>

      {/* Actions */}
      <td style={{ padding: "9px 10px" }}>
        <button onClick={() => deleteKeyword(kw.id)}
          style={{ padding: "3px 8px", borderRadius: 5, border: "1px solid #DC262633", background: "transparent", color: "#DC2626", fontSize: 11, cursor: "pointer" }}>
          ×
        </button>
      </td>
    </tr>
  );
}

function getCatColor(cat) {
  const map = { Services:"#059669", Location:"#2563EB", Blog:"#D97706", Brand:"#7C3AED", Competitor:"#DC2626", Product:"#0891B2", Informational:"#6B7280", General:"#443DCB" };
  return map[cat] || "#443DCB";
}

function fmtNum(n) {
  if (!n) return "0";
  if (n >= 1000000) return `${(n/1000000).toFixed(1)}M`;
  if (n >= 1000)    return `${(n/1000).toFixed(0)}K`;
  return String(n);
}
