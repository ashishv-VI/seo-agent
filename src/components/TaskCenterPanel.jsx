import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { makeTheme } from "../theme/theme";
import { Button, EmptyState } from "./ui";

// Task Center panel (M9.4) — unified execution queue merging task_queue,
// approvals, and answer-optimization opportunities. Reads the backend merge
// endpoint; edits go through PATCH (overrides, never mutating sources). Matches
// existing panel conventions (useAuth {user,API}, dark+clientId, palette).

const PRIORITY_COLOR = { critical: "#DC2626", high: "#ea580c", medium: "#D97706", low: "#0891B2" };
const STATUS_LABEL = { pending: "To Do", in_progress: "In Progress", blocked: "Blocked", done: "Done", cancelled: "Cancelled" };
const STATUS_NEXT  = { pending: "in_progress", in_progress: "done", blocked: "in_progress", done: "pending", cancelled: "pending" };
const FILTERS = ["all", "critical", "quickWins", "blocked", "overdue", "completed"];
const FILTER_LABEL = { all: "All", critical: "Critical", quickWins: "Quick Wins", blocked: "Blocked", overdue: "Due Today", completed: "Completed" };

export default function TaskCenterPanel({ dark, clientId }) {
  const { user, API } = useAuth();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState("");
  const [filter,  setFilter]  = useState("all");
  const [search,  setSearch]  = useState("");
  const [cat,     setCat]     = useState("all");
  const [view,    setView]    = useState("board"); // board | table
  const [drawer,  setDrawer]  = useState(null);
  const [selected, setSelected] = useState(new Set());

  // M10.1 design-system theme — same surface/text values as before (aliased).
  const th = makeTheme(dark);
  const { bg2, bg3, bdr, txt, txt2, B } = th;

  async function load() {
    setLoading(true); setError("");
    try {
      const token = await user.getIdToken();
      const r = await fetch(`${API}/api/agents/${clientId}/task-center`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await r.json();
      if (r.ok) setData(json); else setError(json.error || "Failed to load");
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  async function rebuild() {
    setBusy(true); setError("");
    try {
      const token = await user.getIdToken();
      const r = await fetch(`${API}/api/agents/${clientId}/task-center/rebuild`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      const json = await r.json();
      if (r.ok) setData(json); else setError(json.error || "Rebuild failed");
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  async function patchTask(taskId, patch) {
    try {
      const token = await user.getIdToken();
      await fetch(`${API}/api/agents/${clientId}/task-center/${encodeURIComponent(taskId)}`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      await load();
    } catch (e) { setError(e.message); }
  }

  async function bulkStatus(status) {
    if (!selected.size) return;
    setBusy(true);
    for (const id of selected) { await patchTask(id, { status }); }
    setSelected(new Set());
    setBusy(false);
  }

  useEffect(() => { if (clientId) load(); }, [clientId]);

  const tasks   = data?.tasks || [];
  const summary = data?.summary || {};
  const buckets = data?.buckets || {};
  const categories = useMemo(() => ["all", ...Array.from(new Set(tasks.map(t => t.category).filter(Boolean)))], [tasks]);

  const filtered = useMemo(() => {
    let list = tasks;
    if (filter === "critical")   list = buckets.critical || [];
    else if (filter === "quickWins") list = buckets.quickWins || [];
    else if (filter === "blocked")   list = buckets.blocked || [];
    else if (filter === "overdue")   list = buckets.overdue || [];
    else if (filter === "completed") list = tasks.filter(t => t.status === "done");
    if (cat !== "all") list = list.filter(t => t.category === cat);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t => (t.title || "").toLowerCase().includes(q) || (t.description || "").toLowerCase().includes(q));
    }
    return list;
  }, [tasks, buckets, filter, cat, search]);

  const card  = { background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: "16px 18px" };
  const label = { fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: txt2 };

  if (loading) {
    return <div style={{ padding: "0 0 24px" }}><div style={{ ...card, textAlign: "center", color: txt2 }}>
      <div style={{ fontSize: 22, marginBottom: 8 }}>🗂️</div>Loading Task Center…</div></div>;
  }

  const hasData = tasks.length > 0;

  const TaskRow = (t) => (
    <div key={t.id} style={{ ...card, borderLeft: `3px solid ${PRIORITY_COLOR[t.priority]}`, padding: "12px 14px",
      display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}
      onClick={() => setDrawer(t)}>
      <input type="checkbox" checked={selected.has(t.id)} onClick={(e) => e.stopPropagation()}
        onChange={(e) => { const s = new Set(selected); e.target.checked ? s.add(t.id) : s.delete(t.id); setSelected(s); }}
        style={{ marginTop: 3 }} aria-label={`select ${t.title}`} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em",
            color: PRIORITY_COLOR[t.priority], background: bg3, borderRadius: 4, padding: "2px 6px" }}>{t.priority}</span>
          <span style={{ fontSize: 10.5, color: txt2 }}>{t.category}</span>
          {t.approvalRequired && <span style={{ fontSize: 10, color: "#D97706" }}>⏳ approval</span>}
          {t.expectedGain > 0 && <span style={{ marginLeft: "auto", fontSize: 10.5, color: "#059669", fontWeight: 700 }}>+{t.expectedGain}</span>}
        </div>
        <div style={{ fontSize: 13.5, fontWeight: 650, color: t.status === "done" ? txt2 : txt,
          textDecoration: t.status === "done" ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
        <div style={{ fontSize: 11, color: txt2, marginTop: 3 }}>
          {t.sourceAgent} · {t.impact} impact · {t.effort} effort{t.assignee ? ` · @${t.assignee}` : ""}{t.ageDays != null ? ` · ${t.ageDays}d` : ""}
        </div>
      </div>
      <button onClick={(e) => { e.stopPropagation(); patchTask(t.id, { status: STATUS_NEXT[t.status] }); }}
        style={{ fontSize: 11, fontWeight: 600, color: txt, background: bg3, border: `1px solid ${bdr}`,
          borderRadius: 6, padding: "4px 9px", cursor: "pointer", whiteSpace: "nowrap" }}>
        {STATUS_LABEL[t.status] || t.status} ↻
      </button>
    </div>
  );

  return (
    <div style={{ padding: "0 0 24px", display: "grid", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: txt, letterSpacing: "-.01em" }}>Task Center</h2>
          <div style={{ fontSize: 13, color: txt2, marginTop: 2 }}>Every recommendation across all agents, as one prioritized execution queue.</div>
        </div>
        <button onClick={rebuild} disabled={busy}
          style={{ background: B, color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px",
                   fontSize: 13, fontWeight: 700, cursor: busy ? "wait" : "pointer", opacity: busy ? .7 : 1 }}>
          {busy ? "Rebuilding…" : "↻ Rebuild"}
        </button>
      </div>

      {error && <div style={{ ...card, borderColor: "#DC2626", color: "#DC2626", fontSize: 13 }}>{error}</div>}

      {/* Executive summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
        {[
          { k: "Critical", v: summary.criticalTasks ?? 0, c: "#DC2626" },
          { k: "Open", v: summary.open ?? 0, c: txt },
          { k: "Quick Wins", v: summary.quickWins ?? 0, c: "#059669" },
          { k: "Due Today", v: summary.overdue ?? 0, c: "#D97706" },
          { k: "Done Today", v: summary.completedToday ?? 0, c: "#059669" },
          { k: "Completion", v: `${summary.completionRate ?? 0}%`, c: B },
        ].map(m => (
          <div key={m.k} style={card}>
            <div style={label}>{m.k}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: m.c, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{m.v}</div>
          </div>
        ))}
      </div>

      {!hasData ? (
        <EmptyState t={th} icon="✅" title="No tasks yet"
          description="Run the pipeline, approvals, or Answer Optimization to populate work. Then rebuild to see everything in one prioritized queue."
          action={<Button t={th} onClick={rebuild} loading={busy}>Build Task Center</Button>} />
      ) : (
        <>
          {/* Controls: filters + search + category + view + bulk */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {FILTERS.map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ fontSize: 12, fontWeight: 600, padding: "6px 11px", borderRadius: 7, cursor: "pointer",
                  border: `1px solid ${filter === f ? B : bdr}`, background: filter === f ? B : bg2, color: filter === f ? "#fff" : txt }}>
                {FILTER_LABEL[f]}
              </button>
            ))}
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks…"
              style={{ marginLeft: "auto", fontSize: 13, padding: "7px 11px", borderRadius: 7, border: `1px solid ${bdr}`,
                background: bg2, color: txt, minWidth: 160 }} aria-label="search tasks" />
            <select value={cat} onChange={e => setCat(e.target.value)}
              style={{ fontSize: 13, padding: "7px 10px", borderRadius: 7, border: `1px solid ${bdr}`, background: bg2, color: txt }}
              aria-label="filter by category">
              {categories.map(c => <option key={c} value={c}>{c === "all" ? "All categories" : c}</option>)}
            </select>
            <button onClick={() => setView(view === "board" ? "table" : "board")}
              style={{ fontSize: 12, fontWeight: 600, padding: "6px 11px", borderRadius: 7, cursor: "pointer",
                border: `1px solid ${bdr}`, background: bg2, color: txt }}>
              {view === "board" ? "☰ Table" : "▤ Board"}
            </button>
          </div>

          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div style={{ ...card, display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: txt }}>{selected.size} selected</span>
              {["in_progress", "done", "blocked"].map(s => (
                <button key={s} onClick={() => bulkStatus(s)} disabled={busy}
                  style={{ fontSize: 12, fontWeight: 600, padding: "5px 11px", borderRadius: 6, cursor: "pointer",
                    border: `1px solid ${bdr}`, background: bg3, color: txt }}>
                  Mark {STATUS_LABEL[s]}
                </button>
              ))}
              <button onClick={() => setSelected(new Set())} style={{ marginLeft: "auto", fontSize: 12, color: txt2, background: "none", border: "none", cursor: "pointer" }}>Clear</button>
            </div>
          )}

          {/* Board (priority-grouped) or Table */}
          {view === "board" ? (
            <div style={{ display: "grid", gap: 10 }}>
              {filtered.length === 0
                ? <div style={{ ...card, textAlign: "center", color: txt2, fontSize: 13 }}>No tasks match these filters.</div>
                : filtered.map(TaskRow)}
            </div>
          ) : (
            <div style={{ overflowX: "auto", ...card, padding: 0 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 640 }}>
                <thead>
                  <tr style={{ background: bg3 }}>
                    {["", "Task", "Category", "Priority", "Impact", "Effort", "Status", "Gain"].map(h =>
                      <th key={h} style={{ textAlign: "left", padding: "9px 12px", fontSize: 11, color: txt2, textTransform: "uppercase", letterSpacing: ".04em", borderBottom: `1px solid ${bdr}` }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(t => (
                    <tr key={t.id} style={{ cursor: "pointer" }} onClick={() => setDrawer(t)}>
                      <td style={{ padding: "9px 12px", borderBottom: `1px solid ${bdr}` }}>
                        <input type="checkbox" checked={selected.has(t.id)} onClick={e => e.stopPropagation()}
                          onChange={e => { const s = new Set(selected); e.target.checked ? s.add(t.id) : s.delete(t.id); setSelected(s); }} aria-label={`select ${t.title}`} />
                      </td>
                      <td style={{ padding: "9px 12px", borderBottom: `1px solid ${bdr}`, color: txt, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</td>
                      <td style={{ padding: "9px 12px", borderBottom: `1px solid ${bdr}`, color: txt2 }}>{t.category}</td>
                      <td style={{ padding: "9px 12px", borderBottom: `1px solid ${bdr}` }}><span style={{ color: PRIORITY_COLOR[t.priority], fontWeight: 700, fontSize: 11.5 }}>{t.priority}</span></td>
                      <td style={{ padding: "9px 12px", borderBottom: `1px solid ${bdr}`, color: txt2 }}>{t.impact}</td>
                      <td style={{ padding: "9px 12px", borderBottom: `1px solid ${bdr}`, color: txt2 }}>{t.effort}</td>
                      <td style={{ padding: "9px 12px", borderBottom: `1px solid ${bdr}`, color: txt2 }}>{STATUS_LABEL[t.status] || t.status}</td>
                      <td style={{ padding: "9px 12px", borderBottom: `1px solid ${bdr}`, color: "#059669", fontWeight: 700 }}>{t.expectedGain > 0 ? `+${t.expectedGain}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Task detail drawer */}
      {drawer && (
        <div onClick={() => setDrawer(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 200, display: "flex", justifyContent: "flex-end" }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: "min(440px, 92vw)", height: "100%", background: bg2, borderLeft: `1px solid ${bdr}`, padding: 24, overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em",
                color: PRIORITY_COLOR[drawer.priority], background: bg3, borderRadius: 5, padding: "3px 8px" }}>{drawer.priority} · {drawer.category}</span>
              <button onClick={() => setDrawer(null)} style={{ background: "none", border: "none", color: txt2, fontSize: 20, cursor: "pointer" }} aria-label="close">×</button>
            </div>
            <h3 style={{ margin: "12px 0 8px", fontSize: 17, color: txt, fontWeight: 700 }}>{drawer.title}</h3>
            <p style={{ fontSize: 13.5, color: txt2, lineHeight: 1.6, margin: 0 }}>{drawer.description || "No description."}</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, margin: "18px 0" }}>
              {[["Source", drawer.sourceAgent], ["Type", drawer.taskType], ["Impact", drawer.impact], ["Effort", drawer.effort],
                ["Confidence", `${Math.round((drawer.confidence ?? 0) * 100)}%`], ["Expected gain", drawer.expectedGain ? `+${drawer.expectedGain}` : "—"],
                ["Age", drawer.ageDays != null ? `${drawer.ageDays} days` : "—"], ["Assignee", drawer.assignee || "Unassigned"]].map(([k, v]) => (
                <div key={k}><div style={label}>{k}</div><div style={{ fontSize: 13.5, color: txt, marginTop: 3 }}>{v}</div></div>
              ))}
            </div>
            {drawer.relatedEntity && (
              <div style={{ ...card, background: bg3, fontSize: 12, color: txt2 }}>
                Linked to <b style={{ color: txt }}>{drawer.relatedEntity.kind}</b> · {drawer.relatedEntity.id}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
              {["in_progress", "done", "blocked", "pending"].map(s => (
                <button key={s} onClick={() => { patchTask(drawer.id, { status: s }); setDrawer(null); }}
                  style={{ fontSize: 12, fontWeight: 600, padding: "7px 12px", borderRadius: 7, cursor: "pointer",
                    border: `1px solid ${drawer.status === s ? B : bdr}`, background: drawer.status === s ? B : bg2, color: drawer.status === s ? "#fff" : txt }}>
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ fontSize: 11.5, color: txt2 }}>
        {data?.builtAt ? `Last rebuilt ${new Date(data.builtAt).toLocaleString()}` : "Live view"}
        {data?.source ? ` · ${data.source}` : ""} · sources: task queue, approvals, answer optimization
      </div>
    </div>
  );
}
