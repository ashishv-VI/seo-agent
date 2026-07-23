// Unified theme (M10.1). One object the UI primitives + migrated panels consume.
// No CSS framework — pure JS tokens spread into inline styles (per project rule).
//
// Usage:  const t = makeTheme(dark);  <Card t={t}> ... </Card>
// Back-compat aliases (bg2/bg3/bdr/txt/txt2/B) mirror the existing panel props so
// migration is mechanical and visually identical.

import { brand, semantic, semanticBg, light, dark as darkColors } from "./colors";
import { spacing, sp } from "./spacing";
import { typography, fontFamily } from "./typography";
import { radius } from "./radius";
import { shadows } from "./shadows";
import { motion } from "./motion";

export function makeTheme(isDark = true) {
  const surface = isDark ? darkColors : light;
  const semBg = isDark ? semanticBg.dark : semanticBg.light;

  return {
    dark: isDark,

    // Structured tokens
    color: {
      ...brand,
      ...semantic,
      bg: surface.bg,
      surface: surface.surface,
      surfaceAlt: surface.surfaceAlt,
      border: surface.border,
      text: surface.text,
      muted: surface.muted,
      semanticBg: semBg,
    },
    spacing, sp,
    type: typography,
    font: fontFamily,
    radius,
    shadow: shadows(isDark),
    motion,

    // ── Back-compat aliases (match existing panel variable names) ──
    bg:   surface.bg,
    bg2:  surface.surface,
    bg3:  surface.surfaceAlt,
    bdr:  surface.border,
    txt:  surface.text,
    txt2: surface.muted,
    B:    brand.primary,
  };
}

// A default theme (dark) for modules that don't yet thread `dark` through.
export const theme = makeTheme(true);

export { brand, semantic, spacing, sp, typography, fontFamily, radius, shadows, motion };
export default makeTheme;
