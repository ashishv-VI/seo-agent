// Motion tokens (M10.1). Durations + easings for consistent, restrained motion.
// Components should respect prefers-reduced-motion where they animate.
export const motion = {
  fast:   "120ms",
  medium: "200ms",
  slow:   "320ms",
  ease:   "cubic-bezier(.4, 0, .2, 1)",
  // Prebuilt transition strings.
  transitionFast:   "all 120ms cubic-bezier(.4,0,.2,1)",
  transitionMedium: "all 200ms cubic-bezier(.4,0,.2,1)",
};
