// Shadow tokens (M10.1). Two-layer elevations, tuned per mode.
export function shadows(dark) {
  if (dark) {
    return {
      sm: "0 1px 2px rgba(0,0,0,.3)",
      md: "0 1px 2px rgba(0,0,0,.3), 0 6px 22px rgba(0,0,0,.35)",
      lg: "0 4px 12px rgba(0,0,0,.4), 0 12px 40px rgba(0,0,0,.5)",
      xl: "0 8px 24px rgba(0,0,0,.5), 0 24px 60px rgba(0,0,0,.6)",
    };
  }
  return {
    sm: "0 1px 2px rgba(20,24,31,.04)",
    md: "0 1px 2px rgba(20,24,31,.04), 0 4px 16px rgba(20,24,31,.05)",
    lg: "0 4px 12px rgba(20,24,31,.08), 0 12px 32px rgba(20,24,31,.1)",
    xl: "0 8px 24px rgba(20,24,31,.1), 0 24px 60px rgba(20,24,31,.14)",
  };
}
