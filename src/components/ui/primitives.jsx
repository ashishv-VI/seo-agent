// UI primitives (M10.1) — theme-driven, accessible, reusable. Every component
// takes a `t` theme object (from makeTheme). No CSS framework: styles are inline
// per project rule, but derived from tokens so they're consistent + themeable.
//
// Accessibility baked in once: real <button> elements, focus-visible outlines,
// ARIA on interactive/labelled components, semantic structure.

import { useEffect, useRef } from "react";

const focusRing = (t) => ({ outline: "none" });
// Shared onFocus/onBlur to show a visible focus ring without global CSS.
function focusHandlers(t) {
  return {
    onFocus: (e) => { e.currentTarget.style.boxShadow = `0 0 0 2px ${t.color.primary}`; },
    onBlur:  (e) => { e.currentTarget.style.boxShadow = ""; },
  };
}

// ── Button ──────────────────────────────────────────────────────────
export function Button({ t, variant = "primary", size = "md", disabled, loading, children, style, ...rest }) {
  const pad = size === "sm" ? "6px 11px" : size === "lg" ? "11px 20px" : "9px 16px";
  const fontSize = size === "sm" ? 12 : size === "lg" ? 15 : 13.5;
  const variants = {
    primary:  { background: t.color.primary, color: "#fff", border: "1px solid transparent" },
    secondary:{ background: t.color.surfaceAlt, color: t.color.text, border: `1px solid ${t.color.border}` },
    ghost:    { background: "transparent", color: t.color.text, border: "1px solid transparent" },
    danger:   { background: t.color.error, color: "#fff", border: "1px solid transparent" },
  };
  return (
    <button
      type={rest.type || "button"} disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...focusHandlers(t)}
      style={{
        ...variants[variant], padding: pad, fontSize, fontWeight: 700, borderRadius: t.radius.md,
        cursor: disabled || loading ? "not-allowed" : "pointer", opacity: disabled || loading ? .6 : 1,
        transition: t.motion.transitionFast, display: "inline-flex", alignItems: "center", gap: 6,
        fontFamily: t.font.sans, ...style,
      }}
      {...rest}
    >
      {loading && <Spinner t={t} size={14} inline />}
      {children}
    </button>
  );
}

// ── Card / Panel ────────────────────────────────────────────────────
export function Card({ t, accent, padding = "16px 18px", children, style, ...rest }) {
  return (
    <div style={{
      background: t.color.surface, border: `1px solid ${t.color.border}`, borderRadius: t.radius.lg,
      padding, boxShadow: t.shadow.md, ...(accent ? { borderLeft: `3px solid ${accent}` } : {}), ...style,
    }} {...rest}>{children}</div>
  );
}
export function Panel({ t, title, action, children, style }) {
  return (
    <Card t={t} style={style}>
      {(title || action) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 12 }}>
          {title && <div style={{ ...t.type.caption, color: t.color.muted }}>{title}</div>}
          {action}
        </div>
      )}
      {children}
    </Card>
  );
}

// ── Input / Select ──────────────────────────────────────────────────
export function Input({ t, label, id, style, ...rest }) {
  const inputId = id || (label ? `in-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);
  return (
    <div style={{ display: "grid", gap: 4 }}>
      {label && <label htmlFor={inputId} style={{ ...t.type.caption, color: t.color.muted }}>{label}</label>}
      <input id={inputId} aria-label={rest["aria-label"] || label} {...focusHandlers(t)}
        style={{ fontSize: 14, padding: "9px 12px", borderRadius: t.radius.md, border: `1px solid ${t.color.border}`,
          background: t.color.surface, color: t.color.text, fontFamily: t.font.sans, transition: t.motion.transitionFast, ...style }}
        {...rest} />
    </div>
  );
}
export function Select({ t, label, id, children, style, ...rest }) {
  const selId = id || (label ? `sel-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);
  return (
    <div style={{ display: "grid", gap: 4 }}>
      {label && <label htmlFor={selId} style={{ ...t.type.caption, color: t.color.muted }}>{label}</label>}
      <select id={selId} aria-label={rest["aria-label"] || label} {...focusHandlers(t)}
        style={{ fontSize: 13, padding: "8px 10px", borderRadius: t.radius.md, border: `1px solid ${t.color.border}`,
          background: t.color.surface, color: t.color.text, fontFamily: t.font.sans, ...style }}
        {...rest}>{children}</select>
    </div>
  );
}

// ── Badge / Chip ────────────────────────────────────────────────────
const toneColor = (t, tone) => ({
  success: t.color.success, warning: t.color.warning, error: t.color.error, info: t.color.info,
  neutral: t.color.muted, ai: t.color.ai, primary: t.color.primary,
}[tone] || t.color.muted);
const toneBg = (t, tone) => (t.color.semanticBg[tone] || t.color.surfaceAlt);

export function Badge({ t, tone = "neutral", children, style }) {
  return (
    <span style={{ ...t.type.caption, color: toneColor(t, tone), background: toneBg(t, tone),
      border: `1px solid ${toneColor(t, tone)}33`, borderRadius: t.radius.sm, padding: "4px 8px",
      display: "inline-flex", alignItems: "center", gap: 4, ...style }}>{children}</span>
  );
}
export function Chip({ t, active, onClick, children, style }) {
  const interactive = typeof onClick === "function";
  const El = interactive ? "button" : "span";
  return (
    <El type={interactive ? "button" : undefined} onClick={onClick}
      {...(interactive ? focusHandlers(t) : {})}
      style={{ fontSize: 12, fontWeight: 600, padding: "6px 11px", borderRadius: t.radius.sm,
        border: `1px solid ${active ? t.color.primary : t.color.border}`, background: active ? t.color.primary : t.color.surface,
        color: active ? "#fff" : t.color.text, cursor: interactive ? "pointer" : "default", fontFamily: t.font.sans, ...style }}>
      {children}
    </El>
  );
}

// ── Avatar ──────────────────────────────────────────────────────────
export function Avatar({ t, name = "?", size = 32, style }) {
  const initials = String(name).split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";
  return (
    <div aria-label={name} style={{ width: size, height: size, borderRadius: t.radius.pill, background: t.color.primary,
      color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * .4, fontWeight: 700, ...style }}>
      {initials}
    </div>
  );
}

// ── Layout: Stack / Grid / Container / Divider / Section ─────────────
export function Stack({ gap = 12, direction = "column", children, style }) {
  return <div style={{ display: "flex", flexDirection: direction, gap, ...style }}>{children}</div>;
}
export function Grid({ min = 240, gap = 14, children, style }) {
  return <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap, ...style }}>{children}</div>;
}
export function Container({ max = 1120, children, style }) {
  return <div style={{ maxWidth: max, margin: "0 auto", width: "100%", ...style }}>{children}</div>;
}
export function Divider({ t, style }) {
  return <hr style={{ border: "none", borderTop: `1px solid ${t.color.border}`, margin: "12px 0", ...style }} />;
}
export function Section({ t, title, children, style }) {
  return (
    <section style={{ display: "grid", gap: 12, ...style }}>
      {title && <h3 style={{ ...t.type.h3, color: t.color.text, margin: 0 }}>{title}</h3>}
      {children}
    </section>
  );
}

// ── Spinner / Skeleton / EmptyState ─────────────────────────────────
export function Spinner({ t, size = 20, inline }) {
  return (
    <span role="status" aria-label="Loading" style={{ display: inline ? "inline-block" : "block",
      width: size, height: size, border: `2px solid ${t.color.border}`, borderTopColor: t.color.primary,
      borderRadius: "50%", animation: "m10spin .7s linear infinite" }}>
      <style>{`@keyframes m10spin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){[role=status]{animation:none!important}}`}</style>
    </span>
  );
}
export function Skeleton({ t, width = "100%", height = 14, style }) {
  return <div aria-hidden="true" style={{ width, height, borderRadius: t.radius.sm, background: t.color.surfaceAlt,
    opacity: .7, ...style }} />;
}
export function EmptyState({ t, icon = "○", title, description, action }) {
  return (
    <Card t={t} style={{ textAlign: "center", padding: "36px 18px" }}>
      <div style={{ fontSize: 34, marginBottom: 10 }} aria-hidden="true">{icon}</div>
      {title && <div style={{ fontWeight: 700, color: t.color.text, marginBottom: 6 }}>{title}</div>}
      {description && <div style={{ ...t.type.small, color: t.color.muted, maxWidth: 460, margin: "0 auto 16px", lineHeight: 1.6 }}>{description}</div>}
      {action}
    </Card>
  );
}

// ── Tooltip (title-based, accessible fallback) ──────────────────────
export function Tooltip({ label, children }) {
  return <span title={label} aria-label={label}>{children}</span>;
}

// ── Tabs ────────────────────────────────────────────────────────────
export function Tabs({ t, tabs = [], active, onChange, style }) {
  return (
    <div role="tablist" style={{ display: "flex", gap: 4, flexWrap: "wrap", ...style }}>
      {tabs.map(tab => (
        <button key={tab.id} role="tab" aria-selected={active === tab.id} type="button"
          onClick={() => onChange?.(tab.id)} {...focusHandlers(t)}
          style={{ fontSize: 12.5, fontWeight: 600, padding: "7px 12px", borderRadius: t.radius.md, cursor: "pointer",
            border: `1px solid ${active === tab.id ? t.color.primary : t.color.border}`,
            background: active === tab.id ? t.color.primary : t.color.surface,
            color: active === tab.id ? "#fff" : t.color.text, fontFamily: t.font.sans }}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ── Modal / Drawer (focus-managed, ESC to close, backdrop click) ────
function useEscClose(onClose) {
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
}
export function Modal({ t, open, onClose, title, children, width = 480 }) {
  const ref = useRef(null);
  useEscClose(onClose);
  useEffect(() => { if (open && ref.current) ref.current.focus(); }, [open]);
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label={title || "Dialog"} onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div ref={ref} tabIndex={-1} onClick={e => e.stopPropagation()}
        style={{ width: `min(${width}px, 94vw)`, maxHeight: "88vh", overflowY: "auto", background: t.color.surface,
          border: `1px solid ${t.color.border}`, borderRadius: t.radius.lg, boxShadow: t.shadow.xl, padding: 22, outline: "none" }}>
        {title && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ ...t.type.h3, color: t.color.text, margin: 0 }}>{title}</h3>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: t.color.muted, fontSize: 20, cursor: "pointer" }}>×</button>
        </div>}
        {children}
      </div>
    </div>
  );
}
export function Drawer({ t, open, onClose, children, width = 440 }) {
  const ref = useRef(null);
  useEscClose(onClose);
  useEffect(() => { if (open && ref.current) ref.current.focus(); }, [open]);
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 200, display: "flex", justifyContent: "flex-end" }}>
      <div ref={ref} tabIndex={-1} onClick={e => e.stopPropagation()}
        style={{ width: `min(${width}px, 92vw)`, height: "100%", background: t.color.surface,
          borderLeft: `1px solid ${t.color.border}`, padding: 24, overflowY: "auto", outline: "none" }}>
        {children}
      </div>
    </div>
  );
}
