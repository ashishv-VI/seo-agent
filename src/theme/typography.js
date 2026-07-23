// Typography tokens (M10.1). A single type scale + role styles as plain style
// objects, ready to spread into a component's inline style.

export const fontFamily = {
  sans: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  mono: 'ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace',
};

// Role styles — sizes/weights match the existing panels (no visual redesign).
export const typography = {
  display: { fontSize: 40, fontWeight: 800, letterSpacing: "-.02em", lineHeight: 1.05 },
  h1:      { fontSize: 30, fontWeight: 800, letterSpacing: "-.02em", lineHeight: 1.1 },
  h2:      { fontSize: 20, fontWeight: 800, letterSpacing: "-.01em", lineHeight: 1.2 },
  h3:      { fontSize: 16, fontWeight: 700, letterSpacing: "-.01em", lineHeight: 1.3 },
  body:    { fontSize: 14, fontWeight: 400, lineHeight: 1.6 },
  small:   { fontSize: 13, fontWeight: 400, lineHeight: 1.5 },
  caption: { fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", lineHeight: 1.3 },
};
