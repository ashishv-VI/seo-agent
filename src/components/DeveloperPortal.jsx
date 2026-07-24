import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { makeTheme } from "../theme/theme";
import { Button, Input, Badge, EmptyState, Modal, Chip } from "./ui";

// Developer Portal (M10.6) — API keys, webhooks, usage, and a live endpoint
// explorer with copyable cURL/JS/Python examples. Reuses M10.1 primitives.
// Management calls go to /api/agents/dev/* (JWT). Example snippets target /api/v1.

const CODE_TEMPLATES = {
  curl: (base, path) => `curl -s "${base}/api/v1${path}" \\\n  -H "Authorization: Bearer sk_YOUR_KEY"`,
  javascript: (base, path) => `const r = await fetch("${base}/api/v1${path}", {\n  headers: { Authorization: "Bearer sk_YOUR_KEY" }\n});\nconst data = await r.json();`,
  python: (base, path) => `import requests\nr = requests.get("${base}/api/v1${path}",\n  headers={"Authorization": "Bearer sk_YOUR_KEY"})\nprint(r.json())`,
  node: (base, path) => `import fetch from "node-fetch";\nconst r = await fetch("${base}/api/v1${path}", {\n  headers: { Authorization: "Bearer sk_YOUR_KEY" }\n});\nconsole.log(await r.json());`,
};
const EXPLORER_ENDPOINTS = [
  "/clients", "/dashboard?clientId=CLIENT_ID", "/business-intelligence?clientId=CLIENT_ID",
  "/llm-visibility?clientId=CLIENT_ID", "/task-center?clientId=CLIENT_ID", "/rankings?clientId=CLIENT_ID",
];

export default function DeveloperPortal({ dark }) {
  const { user, API } = useAuth();
  const t = makeTheme(dark);
  const [keys, setKeys] = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [meta, setMeta] = useState({ scopes: [], events: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newKey, setNewKey] = useState(null);     // { plaintext, key }
  const [keyForm, setKeyForm] = useState({ name: "", scopes: ["dashboard:read"] });
  const [hookForm, setHookForm] = useState({ url: "", events: [] });
  const [newHookSecret, setNewHookSecret] = useState(null);
  const [lang, setLang] = useState("curl");
  const [explorerPath, setExplorerPath] = useState("/clients");
  const [copied, setCopied] = useState("");

  async function token() { return user.getIdToken(); }
  async function load() {
    setLoading(true); setError("");
    try {
      const tk = await token();
      const h = { Authorization: `Bearer ${tk}` };
      const [k, w, m] = await Promise.all([
        fetch(`${API}/api/agents/dev/keys`, { headers: h }).then(r => r.json()),
        fetch(`${API}/api/agents/dev/webhooks`, { headers: h }).then(r => r.json()),
        fetch(`${API}/api/agents/dev/scopes`, { headers: h }).then(r => r.json()),
      ]);
      setKeys(k.keys || []); setWebhooks(w.webhooks || []); setMeta({ scopes: m.scopes || [], events: m.events || [] });
    } catch (e) { setError(e.message); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function createKey() {
    setError("");
    try {
      const r = await fetch(`${API}/api/agents/dev/keys`, { method: "POST",
        headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
        body: JSON.stringify(keyForm) });
      const j = await r.json();
      if (r.ok) { setNewKey(j); setKeyForm({ name: "", scopes: ["dashboard:read"] }); load(); }
      else setError(j.error || "Create failed");
    } catch (e) { setError(e.message); }
  }
  async function revokeKey(id) {
    await fetch(`${API}/api/agents/dev/keys/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${await token()}` } });
    load();
  }
  async function createHook() {
    setError("");
    try {
      const r = await fetch(`${API}/api/agents/dev/webhooks`, { method: "POST",
        headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
        body: JSON.stringify(hookForm) });
      const j = await r.json();
      if (r.ok) { setNewHookSecret(j.webhook?.secret); setHookForm({ url: "", events: [] }); load(); }
      else setError(j.error || "Create failed");
    } catch (e) { setError(e.message); }
  }
  async function deleteHook(id) {
    await fetch(`${API}/api/agents/dev/webhooks/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${await token()}` } });
    load();
  }
  function copy(text, id) { navigator.clipboard?.writeText(text); setCopied(id); setTimeout(() => setCopied(""), 1500); }
  function toggle(arr, v) { return arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]; }

  const bg2 = t.color.surface, bg3 = t.color.surfaceAlt, bdr = t.color.border, txt = t.color.text, txt2 = t.color.muted;
  const card = { background: bg2, border: `1px solid ${bdr}`, borderRadius: t.radius.lg, padding: "18px 20px" };
  const label = { ...t.type.caption, color: txt2, marginBottom: 8, display: "block" };
  const mono = { fontFamily: t.font.mono, fontSize: 12 };
  const base = API;

  if (loading) return <div style={{ ...card, textAlign: "center", color: txt2 }}><div style={{ fontSize: 22, marginBottom: 8 }}>🔌</div>Loading developer portal…</div>;

  return (
    <div style={{ padding: "0 0 24px", display: "grid", gap: 16 }}>
      <div>
        <h2 style={{ ...t.type.h2, color: txt, margin: 0 }}>Developer Portal</h2>
        <div style={{ ...t.type.small, color: txt2, marginTop: 2 }}>API keys, webhooks, and a live endpoint explorer for the public <code style={mono}>/api/v1</code> API.</div>
      </div>
      {error && <div style={{ ...card, borderColor: "#DC2626", color: "#DC2626", fontSize: 13 }}>{error}</div>}

      {/* API Keys */}
      <div style={card}>
        <span style={label}>API Keys</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14 }}>
          <div style={{ flex: 1, minWidth: 160 }}><Input t={t} label="Key name" value={keyForm.name} onChange={e => setKeyForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Zapier integration" /></div>
          <Button t={t} onClick={createKey}>Create key</Button>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {meta.scopes.map(s => (
            <Chip key={s} t={t} active={keyForm.scopes.includes(s)} onClick={() => setKeyForm(f => ({ ...f, scopes: toggle(f.scopes, s) }))}>{s}</Chip>
          ))}
        </div>
        {keys.length === 0 ? <div style={{ fontSize: 13, color: txt2 }}>No keys yet.</div> : (
          <div style={{ display: "grid", gap: 8 }}>
            {keys.map(k => (
              <div key={k.keyId} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 0", borderTop: `1px solid ${bdr}` }}>
                <span style={{ fontWeight: 600, color: txt, fontSize: 13 }}>{k.name}</span>
                <span style={{ ...mono, color: txt2 }}>{k.prefix}…</span>
                {k.revoked ? <Badge t={t} tone="error">revoked</Badge> : <Badge t={t} tone="success">active</Badge>}
                <span style={{ fontSize: 11, color: txt2 }}>{(k.scopes || []).join(", ")}</span>
                <span style={{ fontSize: 11, color: txt2, marginLeft: "auto" }}>{k.usageCount} calls</span>
                {!k.revoked && <Button t={t} size="sm" variant="ghost" style={{ border: `1px solid ${bdr}`, color: "#DC2626" }} onClick={() => revokeKey(k.keyId)}>Revoke</Button>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Webhooks */}
      <div style={card}>
        <span style={label}>Webhooks</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 10 }}>
          <div style={{ flex: 1, minWidth: 200 }}><Input t={t} label="Endpoint URL (https)" value={hookForm.url} onChange={e => setHookForm(f => ({ ...f, url: e.target.value }))} placeholder="https://hooks.example.com/seo" /></div>
          <Button t={t} onClick={createHook}>Add webhook</Button>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {meta.events.map(ev => (
            <Chip key={ev} t={t} active={hookForm.events.includes(ev)} onClick={() => setHookForm(f => ({ ...f, events: toggle(f.events, ev) }))}>{ev}</Chip>
          ))}
        </div>
        {webhooks.length === 0 ? <div style={{ fontSize: 13, color: txt2 }}>No webhooks yet.</div> : (
          <div style={{ display: "grid", gap: 8 }}>
            {webhooks.map(w => (
              <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 0", borderTop: `1px solid ${bdr}` }}>
                <span style={{ ...mono, color: txt, fontSize: 12 }}>{w.url}</span>
                <span style={{ fontSize: 11, color: txt2 }}>{(w.events || []).join(", ")}</span>
                {w.active ? <Badge t={t} tone="success">active</Badge> : <Badge t={t} tone="neutral">off</Badge>}
                <Button t={t} size="sm" variant="ghost" style={{ marginLeft: "auto", border: `1px solid ${bdr}`, color: "#DC2626" }} onClick={() => deleteHook(w.id)}>Delete</Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Endpoint explorer + code examples */}
      <div style={card}>
        <span style={label}>Endpoint Explorer &amp; Examples</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <select value={explorerPath} onChange={e => setExplorerPath(e.target.value)} aria-label="endpoint"
            style={{ ...mono, padding: "7px 10px", borderRadius: t.radius.md, border: `1px solid ${bdr}`, background: bg2, color: txt }}>
            {EXPLORER_ENDPOINTS.map(p => <option key={p} value={p}>GET /api/v1{p}</option>)}
          </select>
          <div style={{ display: "flex", gap: 4 }}>
            {["curl", "javascript", "python", "node"].map(l => (
              <Chip key={l} t={t} active={lang === l} onClick={() => setLang(l)}>{l}</Chip>
            ))}
          </div>
        </div>
        <div style={{ position: "relative" }}>
          <pre style={{ ...mono, background: bg3, border: `1px solid ${bdr}`, borderRadius: t.radius.md, padding: 14, overflowX: "auto", color: txt, margin: 0 }}>
            {CODE_TEMPLATES[lang](base, explorerPath)}
          </pre>
          <Button t={t} size="sm" variant="secondary" style={{ position: "absolute", top: 8, right: 8 }}
            onClick={() => copy(CODE_TEMPLATES[lang](base, explorerPath), "code")}>{copied === "code" ? "Copied ✓" : "Copy"}</Button>
        </div>
      </div>

      {/* One-time key reveal */}
      <Modal t={t} open={!!newKey} onClose={() => setNewKey(null)} title="Your new API key" width={520}>
        {newKey && (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ fontSize: 13, color: "#D97706" }}>{newKey.warning}</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <code style={{ ...mono, flex: 1, background: bg3, padding: "10px 12px", borderRadius: t.radius.md, wordBreak: "break-all", color: txt }}>{newKey.plaintext}</code>
              <Button t={t} onClick={() => copy(newKey.plaintext, "key")}>{copied === "key" ? "Copied ✓" : "Copy"}</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* One-time webhook secret reveal */}
      <Modal t={t} open={!!newHookSecret} onClose={() => setNewHookSecret(null)} title="Webhook signing secret" width={520}>
        {newHookSecret && (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ fontSize: 13, color: "#D97706" }}>Copy this signing secret now — verify deliveries with the X-SEO-Signature header (HMAC-SHA256).</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <code style={{ ...mono, flex: 1, background: bg3, padding: "10px 12px", borderRadius: t.radius.md, wordBreak: "break-all", color: txt }}>{newHookSecret}</code>
              <Button t={t} onClick={() => copy(newHookSecret, "secret")}>{copied === "secret" ? "Copied ✓" : "Copy"}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
