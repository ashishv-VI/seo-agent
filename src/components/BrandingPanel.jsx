import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { makeTheme } from "../theme/theme";
import { Button, Input, EmptyState } from "./ui";

// Branding panel (M10.5) — white-label agency branding. Reads/writes the
// client-scoped /branding endpoint (which resolves to the owning agency's brand
// — one source of truth). Live preview + reset. Reuses M10.1 primitives.

const DEFAULTS = {
  companyName: "SEO Agent", logo: "", favicon: "", primaryColor: "#443DCB",
  secondaryColor: "#3730b8", accentColor: "#0e8fa8", supportEmail: "", footer: "",
};

export default function BrandingPanel({ dark, clientId }) {
  const { user, API } = useAuth();
  const [brand, setBrand] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const t = makeTheme(dark);

  async function load() {
    setLoading(true); setError("");
    try {
      const token = await user.getIdToken();
      const r = await fetch(`${API}/api/agents/${clientId}/branding`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await r.json();
      if (r.ok) setBrand({ ...DEFAULTS, ...json.branding }); else setError(json.error || "Failed to load");
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  async function save() {
    setSaving(true); setError(""); setMsg("");
    try {
      const token = await user.getIdToken();
      const r = await fetch(`${API}/api/agents/${clientId}/branding`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ branding: brand }),
      });
      const json = await r.json();
      if (r.ok) { setBrand({ ...DEFAULTS, ...json.branding }); setMsg("Branding saved."); }
      else setError(json.error || "Save failed");
    } catch (e) { setError(e.message); }
    setSaving(false);
  }

  function resetDefaults() { setBrand(DEFAULTS); setMsg("Reset to defaults — click Save to apply."); }

  function onFile(field, file) {
    if (!file) return;
    if (file.size > 400000) { setError(`${field} image is too large (max ~400KB). Use a hosted URL instead.`); return; }
    const reader = new FileReader();
    reader.onload = () => setBrand(b => ({ ...b, [field]: reader.result }));
    reader.readAsDataURL(file);
  }

  useEffect(() => { if (clientId) load(); }, [clientId]);

  const bg2 = t.color.surface, bg3 = t.color.surfaceAlt, bdr = t.color.border, txt = t.color.text, txt2 = t.color.muted;
  const card = { background: bg2, border: `1px solid ${bdr}`, borderRadius: t.radius.lg, padding: "18px 20px" };
  const label = { ...t.type.caption, color: txt2, marginBottom: 6, display: "block" };

  if (loading) return <div style={{ ...card, textAlign: "center", color: txt2 }}><div style={{ fontSize: 22, marginBottom: 8 }}>🎨</div>Loading branding…</div>;
  if (!clientId) return <EmptyState t={t} icon="🎨" title="Select a client" description="Branding is agency-wide. Open it from within a client workspace to edit your agency's brand." />;

  const colorRow = (key, name) => (
    <div style={{ display: "grid", gap: 4 }}>
      <span style={label}>{name}</span>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(brand[key] || "") ? brand[key] : "#443DCB"}
          onChange={e => setBrand(b => ({ ...b, [key]: e.target.value }))}
          aria-label={name} style={{ width: 38, height: 34, borderRadius: t.radius.sm, border: `1px solid ${bdr}`, cursor: "pointer", padding: 2, background: bg2 }} />
        <input value={brand[key] || ""} onChange={e => setBrand(b => ({ ...b, [key]: e.target.value }))}
          aria-label={`${name} hex`} placeholder="#443DCB"
          style={{ flex: 1, fontSize: 13, padding: "8px 10px", borderRadius: t.radius.md, border: `1px solid ${bdr}`, background: bg2, color: txt, fontFamily: t.font.mono }} />
      </div>
    </div>
  );

  const fileRow = (key, name, hint) => (
    <div style={{ display: "grid", gap: 4 }}>
      <span style={label}>{name}</span>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        {brand[key] ? <img src={brand[key]} alt={`${name} preview`} style={{ height: 32, maxWidth: 120, objectFit: "contain", borderRadius: t.radius.sm, border: `1px solid ${bdr}`, background: bg3 }} />
          : <span style={{ fontSize: 12, color: txt2 }}>none</span>}
        <input type="file" accept="image/*" aria-label={`Upload ${name}`} onChange={e => onFile(key, e.target.files?.[0])}
          style={{ fontSize: 12, color: txt2 }} />
        {brand[key] && <button onClick={() => setBrand(b => ({ ...b, [key]: "" }))} style={{ fontSize: 11, color: txt2, background: "none", border: "none", cursor: "pointer" }}>clear</button>}
      </div>
      {hint && <span style={{ fontSize: 11, color: txt2 }}>{hint}</span>}
    </div>
  );

  return (
    <div style={{ padding: "0 0 24px", display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ ...t.type.h2, color: txt, margin: 0 }}>White-Label Branding</h2>
          <div style={{ ...t.type.small, color: txt2, marginTop: 2 }}>Your agency's brand — applied across login, reports, emails, and client portals.</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button t={t} variant="secondary" onClick={resetDefaults}>Reset defaults</Button>
          <Button t={t} onClick={save} loading={saving}>Save branding</Button>
        </div>
      </div>

      {error && <div style={{ ...card, borderColor: "#DC2626", color: "#DC2626", fontSize: 13 }}>{error}</div>}
      {msg && <div style={{ ...card, borderColor: t.color.success, color: t.color.success, fontSize: 13 }}>{msg}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16, alignItems: "start" }}>
        {/* Editor */}
        <div style={{ ...card, display: "grid", gap: 16 }}>
          <Input t={t} label="Company name" value={brand.companyName || ""} onChange={e => setBrand(b => ({ ...b, companyName: e.target.value }))} placeholder="Your Agency" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            {colorRow("primaryColor", "Primary")}
            {colorRow("secondaryColor", "Secondary")}
            {colorRow("accentColor", "Accent")}
          </div>
          {fileRow("logo", "Logo", "PNG/SVG, ≤400KB, or paste a hosted URL in Settings.")}
          {fileRow("favicon", "Favicon", "Square icon, ≤400KB.")}
          <Input t={t} label="Support email" value={brand.supportEmail || ""} onChange={e => setBrand(b => ({ ...b, supportEmail: e.target.value }))} placeholder="help@youragency.com" />
          <Input t={t} label="Footer text" value={brand.footer || ""} onChange={e => setBrand(b => ({ ...b, footer: e.target.value }))} placeholder="© Your Agency. All rights reserved." />
        </div>

        {/* Live preview */}
        <div style={{ ...card, position: "sticky", top: 8 }}>
          <span style={label}>Live Preview</span>
          <div style={{ borderRadius: t.radius.lg, overflow: "hidden", border: `1px solid ${bdr}` }}>
            {/* mock topbar */}
            <div style={{ background: brand.primaryColor || "#443DCB", color: "#fff", padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
              {brand.logo ? <img src={brand.logo} alt="" style={{ height: 22, maxWidth: 90, objectFit: "contain" }} />
                : <div style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(255,255,255,.25)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13 }}>{(brand.companyName || "S")[0]}</div>}
              <span style={{ fontWeight: 800, fontSize: 14 }}>{brand.companyName || "SEO Agent"}</span>
            </div>
            {/* mock report card */}
            <div style={{ background: bg2, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: txt, marginBottom: 6 }}>Monthly SEO Report</div>
              <div style={{ height: 6, background: bg3, borderRadius: 99, marginBottom: 6 }}><div style={{ width: "68%", height: "100%", borderRadius: 99, background: brand.accentColor || "#0e8fa8" }} /></div>
              <button style={{ background: brand.secondaryColor || "#3730b8", color: "#fff", border: "none", borderRadius: t.radius.md, padding: "6px 12px", fontSize: 12, fontWeight: 700 }}>View full report</button>
              <div style={{ fontSize: 10.5, color: txt2, marginTop: 10, borderTop: `1px solid ${bdr}`, paddingTop: 8 }}>
                {brand.footer || `© ${brand.companyName || "SEO Agent"}`}{brand.supportEmail ? ` · ${brand.supportEmail}` : ""}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
