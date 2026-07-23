import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";

// SEO Copilot panel (M9.5) — central AI workspace. Chats over the backend
// copilot endpoints (context aggregation + reasoning happen server-side).
// No streaming infra exists server-side, so this uses request/response with a
// typing indicator. Matches existing panel conventions.

const SUGGESTED = [
  "What are my biggest SEO problems right now?",
  "How do I improve my visibility in AI answers?",
  "What should I work on this week?",
  "Why is my visibility score low?",
];

// Minimal, safe markdown → HTML-free rendering (bold, code, lists, line breaks).
function renderMarkdown(md) {
  if (!md) return [];
  const lines = String(md).split("\n");
  return lines.map((line, i) => {
    const bulleted = /^\s*[-*]\s+/.test(line);
    const clean = line.replace(/^\s*[-*]\s+/, "");
    const parts = clean.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((seg, j) => {
      if (/^\*\*[^*]+\*\*$/.test(seg)) return <strong key={j}>{seg.slice(2, -2)}</strong>;
      if (/^`[^`]+`$/.test(seg)) return <code key={j} style={{ fontFamily: "monospace", fontSize: ".9em", opacity: .85 }}>{seg.slice(1, -1)}</code>;
      return <span key={j}>{seg}</span>;
    });
    return <div key={i} style={{ paddingLeft: bulleted ? 16 : 0, position: "relative" }}>
      {bulleted && <span style={{ position: "absolute", left: 2 }}>•</span>}{parts.length ? parts : <br />}
    </div>;
  });
}

export default function SEOCopilotPanel({ dark, clientId }) {
  const { user, API } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]); // {role, content, meta}
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sessionSearch, setSessionSearch] = useState("");
  const scrollRef = useRef(null);

  const bg2  = dark ? "#111"    : "#ffffff";
  const bg3  = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr  = dark ? "#222"    : "#e0e0d8";
  const txt  = dark ? "#e8e8e8" : "#1a1a18";
  const txt2 = dark ? "#666"    : "#888";
  const B    = "#443DCB";

  async function loadSessions() {
    try {
      const token = await user.getIdToken();
      const r = await fetch(`${API}/api/agents/${clientId}/copilot/sessions`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await r.json();
      if (r.ok) setSessions(json.sessions || []);
    } catch { /* silent */ }
  }

  async function openSession(sid) {
    try {
      const token = await user.getIdToken();
      const r = await fetch(`${API}/api/agents/${clientId}/copilot/session/${sid}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await r.json();
      if (r.ok) { setSessionId(sid); setMessages(json.messages || []); }
    } catch { /* silent */ }
  }

  async function deleteSession(sid) {
    try {
      const token = await user.getIdToken();
      await fetch(`${API}/api/agents/${clientId}/copilot/session/${sid}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (sid === sessionId) { setSessionId(null); setMessages([]); }
      loadSessions();
    } catch { /* silent */ }
  }

  function newChat() { setSessionId(null); setMessages([]); setError(""); }

  async function send(text) {
    const q = (text ?? input).trim();
    if (!q || sending) return;
    setError(""); setInput("");
    const history = messages.map(m => ({ role: m.role, content: m.content }));
    setMessages(prev => [...prev, { role: "user", content: q }]);
    setSending(true);
    try {
      const token = await user.getIdToken();
      const r = await fetch(`${API}/api/agents/${clientId}/copilot/chat`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, sessionId, history }),
      });
      const json = await r.json();
      if (!r.ok) { setError(json.error || "Copilot failed"); setMessages(prev => prev.slice(0, -1)); }
      else {
        setSessionId(json.sessionId);
        setMessages(prev => [...prev, { role: "assistant", content: json.answer, meta: json }]);
        loadSessions();
      }
    } catch (e) { setError(e.message); setMessages(prev => prev.slice(0, -1)); }
    setSending(false);
  }

  function regenerate() {
    const lastUser = [...messages].reverse().find(m => m.role === "user");
    if (lastUser) { setMessages(prev => prev.filter((_, i) => i < prev.length - 1)); send(lastUser.content); }
  }

  useEffect(() => { if (clientId) { loadSessions(); newChat(); } }, [clientId]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, sending]);

  const card  = { background: bg2, border: `1px solid ${bdr}`, borderRadius: 12 };
  const label = { fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: txt2 };
  const filteredSessions = sessions.filter(s => !sessionSearch.trim() || (s.title || "").toLowerCase().includes(sessionSearch.toLowerCase()));
  const lastMeta = messages.length && messages[messages.length - 1].role === "assistant" ? messages[messages.length - 1].meta : null;

  return (
    <div style={{ padding: "0 0 24px", display: "grid", gridTemplateColumns: "220px 1fr", gap: 16, alignItems: "start" }}>
      {/* Sidebar: sessions */}
      <div style={{ ...card, padding: 12, display: "grid", gap: 10, alignSelf: "stretch" }}>
        <button onClick={newChat} style={{ background: B, color: "#fff", border: "none", borderRadius: 8, padding: "9px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>+ New chat</button>
        <input value={sessionSearch} onChange={e => setSessionSearch(e.target.value)} placeholder="Search chats…"
          style={{ fontSize: 12.5, padding: "6px 9px", borderRadius: 7, border: `1px solid ${bdr}`, background: bg3, color: txt }} aria-label="search chats" />
        <div style={{ display: "grid", gap: 4, maxHeight: 360, overflowY: "auto" }}>
          {filteredSessions.length === 0 && <div style={{ fontSize: 12, color: txt2, padding: "6px 4px" }}>No conversations yet.</div>}
          {filteredSessions.map(s => (
            <div key={s.sessionId} onClick={() => openSession(s.sessionId)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 8px", borderRadius: 7, cursor: "pointer",
                background: s.sessionId === sessionId ? bg3 : "transparent" }}>
              <span style={{ flex: 1, fontSize: 12.5, color: txt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
              <button onClick={(e) => { e.stopPropagation(); deleteSession(s.sessionId); }} title="Delete"
                style={{ background: "none", border: "none", color: txt2, cursor: "pointer", fontSize: 13 }} aria-label="delete chat">×</button>
            </div>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: txt, letterSpacing: "-.01em" }}>SEO Copilot</h2>
            <div style={{ fontSize: 13, color: txt2, marginTop: 2 }}>Ask anything about this client — it knows your audit, rankings, visibility, tasks, and reports.</div>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} style={{ ...card, padding: 16, minHeight: 320, maxHeight: 520, overflowY: "auto", display: "grid", gap: 14, alignContent: "start" }}>
          {messages.length === 0 && !sending && (
            <div style={{ textAlign: "center", padding: "28px 12px", color: txt2 }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>💬</div>
              <div style={{ fontWeight: 700, color: txt, marginBottom: 6 }}>Ask your SEO Copilot</div>
              <div style={{ fontSize: 13, maxWidth: 420, margin: "0 auto 16px", lineHeight: 1.6 }}>Grounded in everything the platform knows about this client. Try one of these:</div>
              <div style={{ display: "grid", gap: 8, maxWidth: 460, margin: "0 auto" }}>
                {SUGGESTED.map((s, i) => (
                  <button key={i} onClick={() => send(s)} style={{ textAlign: "left", fontSize: 13, color: txt, background: bg3, border: `1px solid ${bdr}`, borderRadius: 8, padding: "9px 12px", cursor: "pointer" }}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{ maxWidth: "82%", padding: "11px 14px", borderRadius: 12, fontSize: 13.5, lineHeight: 1.6,
                background: m.role === "user" ? B : bg3, color: m.role === "user" ? "#fff" : txt,
                border: m.role === "user" ? "none" : `1px solid ${bdr}` }}>
                <div>{m.role === "user" ? m.content : renderMarkdown(m.content)}</div>
                {m.role === "assistant" && m.meta && (
                  <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                    {(m.meta.citations || []).length > 0 && (
                      <div style={{ fontSize: 11, color: txt2 }}>Sources: {m.meta.citations.join(" · ")}
                        {typeof m.meta.confidence === "number" && <span> · confidence {Math.round(m.meta.confidence * 100)}%</span>}</div>
                    )}
                    {(m.meta.recommendedActions || []).length > 0 && (
                      <div style={{ display: "grid", gap: 4 }}>
                        <span style={label}>Recommended actions</span>
                        {m.meta.recommendedActions.map((a, j) => (
                          <div key={j} style={{ fontSize: 12.5, color: txt }}>
                            <span style={{ color: a.priority === "high" ? "#DC2626" : a.priority === "medium" ? "#D97706" : "#0891B2", fontWeight: 700, fontSize: 10.5, marginRight: 6 }}>{a.priority}</span>{a.action}
                          </div>
                        ))}
                      </div>
                    )}
                    {[["Related tasks", m.meta.relatedTasks], ["Related pages", m.meta.relatedPages], ["Related reports", m.meta.relatedReports]].map(([k, arr]) => (
                      (arr || []).length > 0 && <div key={k} style={{ fontSize: 11.5, color: txt2 }}><b style={{ color: txt }}>{k}:</b> {arr.join(", ")}</div>
                    ))}
                    <div style={{ display: "flex", gap: 10, marginTop: 2 }}>
                      <button onClick={() => navigator.clipboard?.writeText(m.content)} style={{ fontSize: 11, color: txt2, background: "none", border: "none", cursor: "pointer" }}>Copy</button>
                      {i === messages.length - 1 && <button onClick={regenerate} style={{ fontSize: 11, color: txt2, background: "none", border: "none", cursor: "pointer" }}>Regenerate</button>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {sending && (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div style={{ padding: "11px 14px", borderRadius: 12, background: bg3, border: `1px solid ${bdr}`, color: txt2, fontSize: 13 }}>
                Copilot is thinking<span style={{ animation: "none" }}>…</span>
              </div>
            </div>
          )}
        </div>

        {error && <div style={{ ...card, borderColor: "#DC2626", color: "#DC2626", fontSize: 13, padding: "10px 14px" }}>{error}</div>}

        {/* Follow-up suggestions */}
        {lastMeta && (lastMeta.followUpQuestions || []).length > 0 && !sending && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {lastMeta.followUpQuestions.map((q, i) => (
              <button key={i} onClick={() => send(q)} style={{ fontSize: 12, color: txt, background: bg2, border: `1px solid ${bdr}`, borderRadius: 99, padding: "6px 12px", cursor: "pointer" }}>{q}</button>
            ))}
          </div>
        )}

        {/* Composer */}
        <div style={{ display: "flex", gap: 8 }}>
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") send(); }}
            placeholder="Ask about this client's SEO…" disabled={sending}
            style={{ flex: 1, fontSize: 14, padding: "11px 14px", borderRadius: 10, border: `1px solid ${bdr}`, background: bg2, color: txt }} aria-label="ask the copilot" />
          <button onClick={() => send()} disabled={sending || !input.trim()}
            style={{ background: B, color: "#fff", border: "none", borderRadius: 10, padding: "0 20px", fontSize: 14, fontWeight: 700, cursor: sending ? "wait" : "pointer", opacity: (sending || !input.trim()) ? .6 : 1 }}>Send</button>
        </div>
      </div>
    </div>
  );
}
