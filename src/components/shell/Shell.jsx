// Enterprise workspace shell (M10.2) — reusable, theme-driven (M10.1 tokens),
// accessible navigation primitives. Pure presentation: they take a theme `t`,
// the nav config, and callbacks. No business logic, no data fetching.

import { useState, useMemo } from "react";
import { NAV_SECTIONS, NAV_INDEX } from "./navConfig";

// ── Sidebar ─────────────────────────────────────────────────────────
export function Sidebar({ t, sections = NAV_SECTIONS, activeId, onSelect, collapsed, onToggle, recent = [], favorites = [] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    if (!query.trim()) return null;
    const q = query.toLowerCase();
    return NAV_INDEX.filter(it => it.label.toLowerCase().includes(q));
  }, [query]);

  const width = collapsed ? 60 : 244;
  const itemStyle = (active) => ({
    display: "flex", alignItems: "center", gap: 10, padding: collapsed ? "9px 0" : "8px 10px",
    justifyContent: collapsed ? "center" : "flex-start",
    borderRadius: t.radius.md, cursor: "pointer", marginBottom: 2, fontSize: 13,
    color: active ? "#fff" : t.color.text, background: active ? t.color.primary : "transparent",
    fontWeight: active ? 700 : 500, transition: t.motion.transitionFast, border: "none", width: "100%", textAlign: "left",
  });

  const focusable = {
    onFocus: (e) => { e.currentTarget.style.boxShadow = `0 0 0 2px ${t.color.primary}`; },
    onBlur:  (e) => { e.currentTarget.style.boxShadow = ""; },
  };

  return (
    <nav aria-label="Primary" style={{
      width, minWidth: width, background: t.color.surface, borderRight: `1px solid ${t.color.border}`,
      display: "flex", flexDirection: "column", transition: t.motion.transitionMedium, overflow: "hidden", flexShrink: 0,
    }}>
      {/* Brand + collapse */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 12px", borderBottom: `1px solid ${t.color.border}` }}>
        <div style={{ width: 30, height: 30, borderRadius: t.radius.md, background: t.color.primary, color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, flexShrink: 0 }}>S</div>
        {!collapsed && <div style={{ flex: 1, fontWeight: 800, fontSize: 14, color: t.color.text, letterSpacing: "-.01em" }}>SEO Agent</div>}
        <button onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} {...focusable}
          style={{ background: "none", border: "none", color: t.color.muted, cursor: "pointer", fontSize: 15, padding: 4, borderRadius: t.radius.sm }}>
          {collapsed ? "»" : "«"}
        </button>
      </div>

      {/* Search */}
      {!collapsed && (
        <div style={{ padding: "10px 12px 4px" }}>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search…" aria-label="Search navigation"
            {...focusable}
            style={{ width: "100%", fontSize: 12.5, padding: "7px 10px", borderRadius: t.radius.md,
              border: `1px solid ${t.color.border}`, background: t.color.surfaceAlt, color: t.color.text }} />
        </div>
      )}

      {/* Nav body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 8px 16px" }}>
        {filtered ? (
          <div>
            {!collapsed && <div style={{ ...t.type.caption, color: t.color.muted, padding: "10px 6px 5px" }}>Results</div>}
            {filtered.length === 0 && !collapsed && <div style={{ fontSize: 12, color: t.color.muted, padding: "4px 6px" }}>No matches.</div>}
            {filtered.map(it => (
              <button key={it.id} onClick={() => onSelect?.(it)} style={itemStyle(activeId === it.id)} {...focusable} title={it.label}>
                <span aria-hidden="true">{it.icon}</span>{!collapsed && <span>{it.label}</span>}
              </button>
            ))}
          </div>
        ) : (
          <>
            {!collapsed && favorites.length > 0 && (
              <>
                <div style={{ ...t.type.caption, color: t.color.muted, padding: "10px 6px 5px" }}>Favorites</div>
                {favorites.map(it => (
                  <button key={it.id} onClick={() => onSelect?.(it)} style={itemStyle(activeId === it.id)} {...focusable} title={it.label}>
                    <span aria-hidden="true">⭐</span><span>{it.label}</span>
                  </button>
                ))}
              </>
            )}
            {sections.map(sec => (
              <div key={sec.id}>
                {!collapsed && <div style={{ ...t.type.caption, color: t.color.muted, padding: "12px 6px 5px" }}>{sec.label}</div>}
                {collapsed && <div style={{ height: 1, background: t.color.border, margin: "8px 6px" }} aria-hidden="true" />}
                {sec.items.map(it => (
                  <button key={it.id} onClick={() => onSelect?.(it)} style={itemStyle(activeId === it.id)} {...focusable} title={it.label}>
                    <span aria-hidden="true">{it.icon}</span>{!collapsed && <span>{it.label}</span>}
                  </button>
                ))}
              </div>
            ))}
            {!collapsed && recent.length > 0 && (
              <>
                <div style={{ ...t.type.caption, color: t.color.muted, padding: "12px 6px 5px" }}>Recent</div>
                {recent.map(it => (
                  <button key={it.id} onClick={() => onSelect?.(it)} style={itemStyle(false)} {...focusable} title={it.label}>
                    <span aria-hidden="true">🕘</span><span>{it.label}</span>
                  </button>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </nav>
  );
}

// ── Breadcrumbs ─────────────────────────────────────────────────────
export function Breadcrumbs({ t, trail = [] }) {
  if (!trail.length) return null;
  return (
    <nav aria-label="Breadcrumb" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: t.color.muted }}>
      {trail.map((c, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {i > 0 && <span aria-hidden="true" style={{ opacity: .5 }}>/</span>}
          {c.onClick ? (
            <button onClick={c.onClick} style={{ background: "none", border: "none", color: i === trail.length - 1 ? t.color.text : t.color.muted,
              fontWeight: i === trail.length - 1 ? 700 : 500, cursor: "pointer", padding: 0, fontSize: 12.5 }}>{c.label}</button>
          ) : (
            <span style={{ color: i === trail.length - 1 ? t.color.text : t.color.muted, fontWeight: i === trail.length - 1 ? 700 : 500 }}>{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

// ── TopBar ──────────────────────────────────────────────────────────
export function TopBar({ t, breadcrumbs, onSearch, notifications = 0, user, onProfile, onLogout, right }) {
  const focusable = {
    onFocus: (e) => { e.currentTarget.style.boxShadow = `0 0 0 2px ${t.color.primary}`; },
    onBlur:  (e) => { e.currentTarget.style.boxShadow = ""; },
  };
  return (
    <header style={{ display: "flex", alignItems: "center", gap: 16, padding: "10px 20px", borderBottom: `1px solid ${t.color.border}`,
      background: t.color.surface, flexWrap: "wrap" }}>
      <Breadcrumbs t={t} trail={breadcrumbs} />
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
        {onSearch && (
          <button onClick={onSearch} aria-label="Quick search (command palette)" {...focusable}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: t.color.muted, background: t.color.surfaceAlt,
              border: `1px solid ${t.color.border}`, borderRadius: t.radius.md, padding: "6px 10px", cursor: "pointer" }}>
            🔍 <span>Search</span> <kbd style={{ fontSize: 10, opacity: .7 }}>⌘K</kbd>
          </button>
        )}
        {right}
        <button aria-label={`Notifications${notifications ? `, ${notifications} unread` : ""}`} {...focusable}
          style={{ position: "relative", background: "none", border: "none", cursor: "pointer", fontSize: 17, color: t.color.text }}>
          🔔
          {notifications > 0 && <span style={{ position: "absolute", top: -4, right: -6, background: t.color.error, color: "#fff",
            fontSize: 9, fontWeight: 700, borderRadius: t.radius.pill, padding: "1px 5px" }}>{notifications}</span>}
        </button>
        <button onClick={onProfile} aria-label="Profile menu" {...focusable}
          style={{ width: 30, height: 30, borderRadius: t.radius.pill, background: t.color.primary, color: "#fff", border: "none",
            fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
          {(user?.displayName || user?.email || "U")[0]?.toUpperCase()}
        </button>
      </div>
    </header>
  );
}

// ── WorkspaceHeader (page title + actions) ──────────────────────────
export function WorkspaceHeader({ t, title, subtitle, actions }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
      <div>
        <h1 style={{ ...t.type.h1, color: t.color.text, margin: 0 }}>{title}</h1>
        {subtitle && <div style={{ ...t.type.small, color: t.color.muted, marginTop: 4 }}>{subtitle}</div>}
      </div>
      {actions && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div>}
    </div>
  );
}

// ── AppShell (composition) ──────────────────────────────────────────
export function AppShell({ t, sidebar, topbar, children }) {
  return (
    <div style={{ display: "flex", height: "100vh", background: t.color.bg, color: t.color.text, fontFamily: t.font.sans }}>
      {sidebar}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
        {topbar}
        <main style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>{children}</main>
      </div>
    </div>
  );
}
