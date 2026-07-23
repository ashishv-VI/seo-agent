// Spacing scale (M10.1) — 4px base grid, matching the values already in use.
export const spacing = {
  0:  0,
  1:  4,
  2:  8,
  3:  12,
  4:  16,
  5:  20,
  6:  24,
  8:  32,
  10: 40,
  12: 48,
  16: 64,
};

// Convenience: sp(n) → px number for the n-th step (n in {0,1,2,3,4,5,6,8,10,12,16}).
export function sp(n) { return spacing[n] ?? n; }
