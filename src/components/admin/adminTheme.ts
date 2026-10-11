/**
 * Vocabulaire visuel du back-office Ooble — monochrome, clair ou sombre.
 *
 * Toutes les couleurs sont des références CSS var(--a-*) : les composants
 * les utilisent dans des inline styles, et les valeurs effectives changent
 * automatiquement selon le thème (classe `dark` sur <html>).
 *
 * AdminPortal injecte `ADMIN_THEME_CSS` dans le <head> au montage.
 */

// ── Palettes brutes ──────────────────────────────────────────

const DARK = {
  /** Fond sur lequel est posé l'écrin (barre latérale comprise). */
  ground:         "#111111",
  bg:             "#1a1a1a",
  l1:             "#212121",
  l2:             "#282828",
  l3:             "#303030",
  l4:             "#383838",
  bds:            "#2a2a2a",
  bd:             "#383838",
  bdh:            "#484848",
  accent:         "#ffffff",
  accentSoft:     "rgba(255,255,255,0.08)",
  accentBd:       "rgba(255,255,255,0.20)",
  accentHover:    "#e8e8e8",
  t1:             "#f0f0f0",
  t2:             "#888888",
  t3:             "#565656",
  inputBg:        "rgba(255,255,255,0.03)",
  rowHover:       "rgba(255,255,255,0.015)",
  btnPrimaryText: "#111111",
  heroGrad:       "linear-gradient(135deg, #1e1e1e 0%, #181818 60%, #1a1a1a 100%)",
  heroShadow:     "0 4px 32px rgba(0,0,0,0.45)",
  hover1:         "rgba(255,255,255,0.015)",
  hover2:         "rgba(255,255,255,0.03)",
  hover3:         "rgba(255,255,255,0.05)",
  hover4:         "rgba(255,255,255,0.08)",
  chipBd:         "rgba(255,255,255,0.12)",
  codeBg:         "rgba(255,255,255,0.06)",
  shadow:         "0 4px 20px rgba(0,0,0,0.4)",
  shadowSoft:     "0 2px 12px rgba(0,0,0,0.4)",
  shadowHeavy:    "0 12px 32px -8px rgba(0,0,0,0.55)",
  overlay:        "rgba(0,0,0,0.4)",
  scrimDeep:      "rgba(0,0,0,0.92)",
  successBg:      "rgba(74, 222, 128, 0.08)",
  successBd:      "rgba(74, 222, 128, 0.2)",
  successText:    "rgb(74, 222, 128)",
  dangerBg:       "rgba(239, 68, 68, 0.08)",
  dangerBd:       "rgba(239, 68, 68, 0.2)",
  dangerText:     "rgb(239, 68, 68)",
  dangerSoft:     "#f2c1c1",
  warnBg:         "rgba(220,170,60,0.08)",
  warnBd:         "rgba(220,170,60,0.25)",
  warnText:       "#dcc47a",
  bubbleShadow:   "0 4px 20px rgba(0,0,0,0.4)",
  panelShadow:    "0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)",
};

const LIGHT = {
  ground:         "#e9e9e5",
  bg:             "#f5f5f3",
  l1:             "#ffffff",
  l2:             "#f0f0ee",
  l3:             "#e8e8e5",
  l4:             "#ddddd9",
  bds:            "#e8e8e5",
  bd:             "#d4d4d0",
  bdh:            "#b8b8b4",
  accent:         "#111111",
  accentSoft:     "rgba(0,0,0,0.04)",
  accentBd:       "rgba(0,0,0,0.12)",
  accentHover:    "#333333",
  t1:             "#111111",
  t2:             "#666666",
  t3:             "#999999",
  inputBg:        "rgba(0,0,0,0.02)",
  rowHover:       "rgba(0,0,0,0.02)",
  btnPrimaryText: "#ffffff",
  heroGrad:       "linear-gradient(135deg, #fafafa 0%, #f5f5f3 60%, #f0f0ee 100%)",
  heroShadow:     "0 4px 24px rgba(0,0,0,0.06)",
  hover1:         "rgba(0,0,0,0.015)",
  hover2:         "rgba(0,0,0,0.03)",
  hover3:         "rgba(0,0,0,0.05)",
  hover4:         "rgba(0,0,0,0.07)",
  chipBd:         "rgba(0,0,0,0.10)",
  codeBg:         "rgba(0,0,0,0.05)",
  shadow:         "0 4px 20px rgba(0,0,0,0.08)",
  shadowSoft:     "0 2px 12px rgba(0,0,0,0.06)",
  shadowHeavy:    "0 12px 32px -12px rgba(20,20,20,0.14)",
  overlay:        "rgba(0,0,0,0.35)",
  scrimDeep:      "rgba(20,20,20,0.85)",
  successBg:      "rgba(22, 163, 74, 0.10)",
  successBd:      "rgba(22, 163, 74, 0.25)",
  successText:    "rgb(21, 128, 61)",
  dangerBg:       "rgba(220, 38, 38, 0.08)",
  dangerBd:       "rgba(220, 38, 38, 0.22)",
  dangerText:     "rgb(185, 28, 28)",
  dangerSoft:     "#b91c1c",
  warnBg:         "rgba(180,120,20,0.10)",
  warnBd:         "rgba(180,120,20,0.28)",
  warnText:       "#8a5a0a",
  bubbleShadow:   "0 6px 24px rgba(0,0,0,0.14)",
  panelShadow:    "0 8px 40px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)",
};

/** Raw bg values for html/body (CSS vars aren't available on ancestors). */
export const ADMIN_BG = { dark: DARK.bg, light: LIGHT.bg } as const;

// ── CSS to inject ────────────────────────────────────────────

function vars(palette: typeof DARK): string {
  return Object.entries(palette).map(([k, v]) => `--a-${k}:${v}`).join(";");
}

export const ADMIN_THEME_CSS = `
.admin-scope{${vars(DARK)}}
:root:not(.dark) .admin-scope{${vars(LIGHT)}}
`;

// ── Token references (CSS vars) ──────────────────────────────

/** Palette — all values are CSS var() references resolved at render time. */
export const C = {
  ground:        "var(--a-ground)",
  bg:            "var(--a-bg)",
  l1:            "var(--a-l1)",
  l2:            "var(--a-l2)",
  l3:            "var(--a-l3)",
  l4:            "var(--a-l4)",
  bds:           "var(--a-bds)",
  bd:            "var(--a-bd)",
  bdh:           "var(--a-bdh)",
  accent:        "var(--a-accent)",
  accentSoft:    "var(--a-accentSoft)",
  accentBd:      "var(--a-accentBd)",
  accentHover:   "var(--a-accentHover)",
  t1:            "var(--a-t1)",
  t2:            "var(--a-t2)",
  t3:            "var(--a-t3)",
  btnText:       "var(--a-btnPrimaryText)",
  hover1:        "var(--a-hover1)",
  hover2:        "var(--a-hover2)",
  hover3:        "var(--a-hover3)",
  hover4:        "var(--a-hover4)",
  chipBd:        "var(--a-chipBd)",
  codeBg:        "var(--a-codeBg)",
  shadow:        "var(--a-shadow)",
  shadowSoft:    "var(--a-shadowSoft)",
  shadowHeavy:   "var(--a-shadowHeavy)",
  overlay:       "var(--a-overlay)",
  scrimDeep:     "var(--a-scrimDeep)",
  successBg:     "var(--a-successBg)",
  successBd:     "var(--a-successBd)",
  successText:   "var(--a-successText)",
  dangerBg:      "var(--a-dangerBg)",
  dangerBd:      "var(--a-dangerBd)",
  dangerText:    "var(--a-dangerText)",
  dangerSoft:    "var(--a-dangerSoft)",
  warnBg:        "var(--a-warnBg)",
  warnBd:        "var(--a-warnBd)",
  warnText:      "var(--a-warnText)",
  bubbleShadow:  "var(--a-bubbleShadow)",
  panelShadow:   "var(--a-panelShadow)",
} as const;

// ── Typography ───────────────────────────────────────────────

export const FONT = "'Poppins', system-ui, sans-serif";
export const MONO = FONT;

export const numeric: React.CSSProperties = {
  fontFamily: FONT,
  fontVariantNumeric: "tabular-nums",
};

export function heroNumber(size = 40): React.CSSProperties {
  return {
    fontFamily: FONT,
    fontVariantNumeric: "tabular-nums",
    fontSize: size,
    fontWeight: 300,
    letterSpacing: "-0.02em",
    lineHeight: 1,
    color: C.t1,
    margin: 0,
  };
}

export const heroUnit: React.CSSProperties = {
  color: C.t3,
  fontSize: 15,
  fontWeight: 400,
  marginLeft: 8,
  letterSpacing: 0,
};

// ── Card styles ──────────────────────────────────────────────

export const card: React.CSSProperties = {
  background: C.l1,
  border: `1px solid ${C.bds}`,
  borderRadius: 14,
  overflow: "hidden",
};

export const heroCard: React.CSSProperties = {
  background: "var(--a-heroGrad)",
  border: `1px solid ${C.bds}`,
  borderRadius: 16,
  padding: "30px 28px 26px",
  boxShadow: "var(--a-heroShadow)",
};

export const sH: React.CSSProperties = {
  color: C.t3,
  fontSize: 11,
  fontWeight: 400,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  margin: 0,
  fontFamily: FONT,
};

export const cardHeader: React.CSSProperties = {
  padding: "14px 20px",
  borderBottom: `1px solid ${C.bds}`,
};

export function rowStyle(isLast: boolean): React.CSSProperties {
  return {
    padding: "11px 20px",
    borderBottom: isLast ? "none" : `1px solid ${C.bds}`,
  };
}

// ── Buttons ──────────────────────────────────────────────────

export const btnPrimary: React.CSSProperties = {
  height: 36,
  paddingLeft: 18,
  paddingRight: 18,
  background: C.accent,
  border: "none",
  borderRadius: 9,
  color: C.btnText,
  fontSize: 12,
  fontWeight: 400,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontFamily: FONT,
  whiteSpace: "nowrap",
  transition: "background 0.15s",
};

export const btnGhost: React.CSSProperties = {
  height: 36,
  paddingLeft: 16,
  paddingRight: 16,
  background: "transparent",
  border: `1px solid ${C.bd}`,
  borderRadius: 9,
  color: C.t2,
  fontSize: 12,
  fontWeight: 400,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontFamily: FONT,
  whiteSpace: "nowrap",
  transition: "all 0.15s",
};

export const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--a-inputBg)",
  border: `1px solid ${C.bd}`,
  borderRadius: 9,
  padding: "9px 12px",
  color: C.t1,
  fontSize: 13,
  fontFamily: FONT,
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.15s",
};

export function ghostHoverIn(el: HTMLElement) {
  el.style.borderColor = C.accentBd;
  el.style.color = C.accent;
}
export function ghostHoverOut(el: HTMLElement) {
  el.style.borderColor = C.bd;
  el.style.color = C.t2;
}

export function primaryHoverIn(el: HTMLElement) { el.style.background = C.accentHover; }
export function primaryHoverOut(el: HTMLElement) { el.style.background = C.accent; }

// ── List rows ────────────────────────────────────────────────

export function listRowStyle(isLast: boolean): React.CSSProperties {
  return {
    padding: "14px 18px",
    borderBottom: isLast ? "none" : `1px solid ${C.bds}`,
    display: "flex",
    alignItems: "center",
    gap: 12,
    transition: "background 0.12s",
  };
}

export function listRowHoverIn(el: HTMLElement) { el.style.background = "var(--a-rowHover)"; }
export function listRowHoverOut(el: HTMLElement) { el.style.background = "transparent"; }

export const avatarCircle: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: "50%",
  border: `1.5px solid ${C.bds}`,
  background: C.l2,
  color: C.t2,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  fontFamily: FONT,
  fontSize: 12,
  fontWeight: 400,
};

export const iconButton: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 7,
  background: "transparent",
  border: `1px solid ${C.bds}`,
  color: C.t3,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  transition: "all 0.12s",
};

export function iconButtonHoverIn(el: HTMLElement) {
  el.style.borderColor = C.accentBd;
  el.style.color = C.accent;
}
export function iconButtonHoverOut(el: HTMLElement) {
  el.style.borderColor = C.bds;
  el.style.color = C.t3;
}

export function pillSmall(on: boolean): React.CSSProperties {
  return {
    height: 26,
    paddingLeft: 10,
    paddingRight: 10,
    borderRadius: 7,
    border: `1px solid ${on ? C.accentBd : C.bds}`,
    background: on ? C.accentSoft : "transparent",
    color: on ? C.accent : C.t3,
    fontSize: 11,
    fontWeight: on ? 500 : 400,
    fontFamily: FONT,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    transition: "all 0.12s",
    whiteSpace: "nowrap",
  };
}

export const chipAction: React.CSSProperties = {
  height: 26,
  paddingLeft: 10,
  paddingRight: 10,
  background: C.accentSoft,
  border: `1px solid ${C.accentBd}`,
  borderRadius: 7,
  color: C.accent,
  fontSize: 11,
  fontWeight: 400,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  fontFamily: FONT,
  transition: "opacity 0.15s",
};

export const cardHeaderRow: React.CSSProperties = {
  padding: "14px 18px",
  borderBottom: `1px solid ${C.bds}`,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

export const cardTitle: React.CSSProperties = {
  color: C.t1,
  fontSize: 13,
  fontWeight: 400,
  margin: 0,
  fontFamily: FONT,
};

export const cardSubtitle: React.CSSProperties = {
  color: C.t3,
  fontSize: 10,
  margin: "3px 0 0",
  fontFamily: FONT,
};
