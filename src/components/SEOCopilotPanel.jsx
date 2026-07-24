import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { makeTheme } from "../theme/theme";
import { Button, Modal } from "./ui";

// SEO Copilot panel (M9.5 chat + M10.4 actions) — central AI workspace + operator.
// Chats over the backend copilot endpoints AND executes actions that delegate to
// existing platform workflows (no duplicated logic). When an action returns a
// `redirect.call`, the panel auto-invokes that existing endpoint (e.g. the real
// recalculate / rebuild routes) — the Copilot is an orchestrator only.
// Priority styling for action suggestions.
const ACTION_PRIORITY_COLOR = { high: "#DC2626", medium: "#D97706", low: "#0891B2" };

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

  // ── M10.4 action state ──
  const [suggestions, setSuggestions] = useState([]);
  const [executing, setExecuting] = useState(null);   // actionId currently running
  const [confirm, setConfirm] = useState(null);        // { actionId, label, params, reason }
  const [actionHistory, setActionHistory] = useState([]); // recent executed actions

  // M10.1 design-system theme.
  const th = makeTheme(dark);
  const { bg2, bg3, bdr, txt, txt2, B } = th;

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

  // ── M10.4: load deterministic action suggestions from platform state ──
  async function loadSuggestions() {
    try {
      const token = await user.getIdToken();
      const r = await fetch(`${API}/api/agents/${clientId}/copilot/suggestions`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await r.json();
      if (r.ok) setSuggestions(json.suggestions || []);
    } catch { /* silent */ }
  }

  // Execute an action. Actions marked needsConfirm route through the dialog first.
  // If the backend result carries redirect.call, the panel auto-invokes that
  // EXISTING endpoint (orchestration only — no duplicated logic here).
  const CONFIRM_ACTIONS = new Set(["approve_item", "reject_item", "push_to_wordpress", "run_pipeline", "reset_pipeline"]);

  function requestAction(actionId, label, params = {}, reason = "") {
    if (CONFIRM_ACTIONS.has(actionId)) setConfirm({ actionId, label, params, reason });
    else runAction(actionId, label, params);
  }

  async function runAction(actionId, label, params = {}) {
    setExecuting(actionId); setError("");
    const startedAt = new Date().toISOString();
    try {
      const token = await user.getIdToken();
      const r = await fetch(`${API}/api/agents/${clientId}/copilot/action`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ actionId, params }),
      });
      const out = await r.json();
      let finalMsg = out.message || (out.success ? "Done." : (out.error || "Action failed."));

      // Auto-invoke the referenced existing endpoint (recalc / rebuild / etc.).
      if (out.success && out.redirect?.call) {
        const method = (out.redirect.method || "POST").toUpperCase();
        const r2 = await fetch(`${API}${out.redirect.call}`, {
          method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        });
        finalMsg += r2.ok ? " ✓ Completed." : " (follow-up call failed)";
      }

      setActionHistory(prev => [{ actionId, label: label || out.title, success: out.success !== false, message: finalMsg, at: startedAt }, ...prev].slice(0, 8));
      if (out.success === false) setError(finalMsg);
      // Refresh suggestions (state changed) and sessions if relevant.
      loadSuggestions();
    } catch (e) {
      setError(e.message);
      setActionHistory(prev => [{ actionId, label, success: false, message: e.message, at: startedAt }, ...prev].slice(0, 8));
    }
    setExecuting(null); setConfirm(null);
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

  useEffect(() => { if (clientId) { loadSessions(); loadSuggestions(); newChat(); } }, [clientId]);
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
            <div style={{ fontSize: 13, color: txt2, marginTop: 2 }}>Ask anything, or run actions — it knows your audit, rankings, visibility, tasks, and reports.</div>
          </div>
        </div>

        {/* ── M10.4 Actions rail ── */}
        <div style={{ ...card, padding: "14px 16px", display: "grid", gap: 12 }}>
          {/* Suggested actions (state-derived, deterministic) */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: txt2, marginBottom: 8 }}>Suggested Actions</div>
            {suggestions.length === 0 ? (
              <div style={{ fontSize: 12.5, color: txt2 }}>No pending suggestions — you're on top of things.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {suggestions.map((s, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: ACTION_PRIORITY_COLOR[s.priority] || txt2, flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 140, fontSize: 13, color: txt }}>{s.reason}</span>
                    <Button t={th} size="sm" variant="secondary" loading={executing === s.actionId}
                      onClick={() => requestAction(s.actionId, s.label, s.params || {}, s.reason)}>
                      {s.label}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick actions (always available) */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: txt2, marginBottom: 8 }}>Quick Actions</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { id: "run_pipeline",          label: "▶ Run Pipeline" },
                { id: "rebuild_task_center",   label: "🗂️ Rebuild Tasks" },
                { id: "recalc_llm_visibility", label: "🛰️ LLM Visibility" },
                { id: "recalc_answer_opt",     label: "🎯 Answer Opt" },
                { id: "open_business_intelligence", label: "📊 Business Intel" },
              ].map(q => (
                <Button key={q.id} t={th} size="sm" variant="ghost" loading={executing === q.id}
                  onClick={() => requestAction(q.id, q.label, {})}
                  style={{ border: `1px solid ${bdr}` }}>{q.label}</Button>
              ))}
            </div>
          </div>

          {/* Recent actions / execution history */}
          {actionHistory.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: txt2, marginBottom: 8 }}>Recent Actions</div>
              <div style={{ display: "grid", gap: 5 }}>
                {actionHistory.map((h, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                    <span aria-hidden="true" style={{ color: h.success ? "#059669" : "#DC2626" }}>{h.success ? "✓" : "✕"}</span>
                    <span style={{ flex: 1, color: txt }}>{h.message}</span>
                    <span style={{ color: txt2, fontSize: 11 }}>{new Date(h.at).toLocaleTimeString?.() || ""}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
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

      {/* ── M10.4 confirmation dialog for high-impact actions ── */}
      <Modal t={th} open={!!confirm} onClose={() => setConfirm(null)} title="Confirm action" width={420}>
        {confirm && (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ fontSize: 14, color: txt }}>
              Run <b>{confirm.label}</b>?
              {confirm.reason && <div style={{ fontSize: 13, color: txt2, marginTop: 6 }}>{confirm.reason}</div>}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button t={th} variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
              <Button t={th} loading={executing === confirm.actionId}
                onClick={() => runAction(confirm.actionId, confirm.label, confirm.params)}>Confirm &amp; Run</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
