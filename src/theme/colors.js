// Color tokens (M10.1). Codifies the existing de-facto palette — no redesign.
// Brand + semantic colors are theme-independent; surface/text resolve per mode.

export const brand = {
  primary:   "#443DCB", // existing brand blue (B)
  primaryFg: "#ffffff",
  accent:    "#0e8fa8",
  ai:        "#6a5cf0", // violet, used for AI-visibility surfaces
};

export const semantic = {
  success: "#059669",
  warning: "#D97706",
  error:   "#DC2626",
  errorAlt:"#ea580c",
  info:    "#0891B2",
};

// Surface/text tokens per mode — mirrors the bg2/bg3/bdr/txt/txt2 convention
// used across every existing panel, so migrated screens look identical.
export const light = {
  bg:        "#f5f5f0",
  surface:   "#ffffff", // bg2
  surfaceAlt:"#f0f0ea", // bg3
  border:    "#e0e0d8", // bdr
  text:      "#1a1a18", // txt
  muted:     "#888888", // txt2
};

export const dark = {
  bg:        "#0a0a0a",
  surface:   "#111111", // bg2
  surfaceAlt:"#1a1a1a", // bg3
  border:    "#222222", // bdr
  text:      "#e8e8e8", // txt
  muted:     "#666666", // txt2
};

// Tinted backgrounds for semantic states (subtle fills behind badges/banners).
export const semanticBg = {
  light: { success:"#e0f2e9", warning:"#f8eed8", error:"#fbe4e7", info:"#e2f4f8", ai:"#f5f3ff" },
  dark:  { success:"#10281d", warning:"#2c2110", error:"#2e1418", info:"#0e2a31", ai:"#14121f" },
};
