/**
 * Briques d'interface du back-office (nouvelle génération).
 *
 * Principes : des surfaces plates séparées par des filets plutôt que des
 * cartes empilées ; les tâches longues s'ouvrent en espace de travail plein
 * écran (Workspace) découpé en étapes ; les détails dans un panneau latéral
 * (SidePanel) ; des formulaires courts, groupés par sujet (Group, Field).
 */
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import { C, FONT } from "./adminTheme";

export const UI_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

export const UI_CSS = `
@keyframes ui-in { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
@keyframes ui-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes ui-slide { from { opacity: 0; transform: translateX(28px) } to { opacity: 1; transform: none } }
@keyframes spin { to { transform: rotate(360deg) } }
.ui-in { animation: ui-in .32s ${UI_EASE} }
.ui-input { transition: border-color .15s, box-shadow .15s, background .15s }
.ui-input:hover { border-color: var(--a-bd) }
.ui-input:focus { border-color: var(--a-t3); box-shadow: 0 0 0 3px var(--a-hover3); outline: none }
.ui-btn { transition: background .15s, border-color .15s, color .15s, opacity .15s }
.ui-btn:focus-visible, .ui-step:focus-visible, .ui-row:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 2px }
.ui-btn-secondary:hover:not(:disabled) { background: var(--a-hover2); border-color: var(--a-bd) }
.ui-btn-ghost:hover:not(:disabled) { background: var(--a-hover2); color: var(--a-t1) }
.ui-btn-primary:hover:not(:disabled) { background: var(--a-accentHover) }
.ui-row { transition: background .12s }
.ui-row:hover { background: var(--a-hover1) }
.ui-step:hover { color: var(--a-t1) }
@media (prefers-reduced-motion: reduce) { .ui-in { animation: none } }
`;

/** Insère les styles une seule fois. */
export function UIStyles() {
  return <style>{UI_CSS}</style>;
}

/* ─── Boutons ─────────────────────────────────────────────── */

type ButtonProps = {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
  children?: React.ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "style">;

export function Button({ variant = "secondary", size = "md", icon, children, className = "", disabled, ...rest }: ButtonProps) {
  const h = size === "sm" ? 32 : size === "lg" ? 44 : 38;
  const look: React.CSSProperties =
    variant === "primary" ? { background: C.accent, color: C.btnText, border: "1px solid transparent" }
      : variant === "danger" ? { background: "transparent", color: C.dangerText, border: `1px solid ${C.dangerBd}` }
        : variant === "ghost" ? { background: "transparent", color: C.t2, border: "1px solid transparent" }
          : { background: C.l1, color: C.t1, border: `1px solid ${C.bds}` };
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled}
      className={`ui-btn ui-btn-${variant} ${className}`}
      style={{
        ...look, height: h, padding: children ? `0 ${size === "sm" ? 12 : 16}px` : 0, width: children ? undefined : h,
        borderRadius: 9, fontFamily: FONT, fontSize: size === "sm" ? 12.5 : 13.5, fontWeight: variant === "primary" ? 500 : 400,
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, whiteSpace: "nowrap", flexShrink: 0,
        cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.45 : 1,
      }}
    >
      {icon}
      {children}
    </button>
  );
}

/* ─── Formulaires ─────────────────────────────────────────── */

export const fieldInput: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", minHeight: 40, padding: "9px 12px", borderRadius: 9,
  background: "var(--a-inputBg)", border: `1px solid ${C.bds}`, color: C.t1, fontFamily: FONT, fontSize: 14, lineHeight: 1.5,
};

/** Libellé + champ + aide, sans cadre autour. */
export function Field({ label, hint, right, children }: { label: string; hint?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 6, minWidth: 0 }}>
      <span style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12.5, color: C.t2 }}>
        <span style={{ flex: 1 }}>{label}</span>
        {right}
      </span>
      {children}
      {hint && <span style={{ fontSize: 12, color: C.t3, lineHeight: 1.5 }}>{hint}</span>}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`ui-input ${props.className ?? ""}`} style={{ ...fieldInput, ...props.style }} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`ui-input ${props.className ?? ""}`} style={{ ...fieldInput, resize: "vertical", ...props.style }} />;
}

/** Groupe de champs : titre discret, filet au-dessus, pas de carte. */
export function Group({ title, description, right, children, first }: {
  title: string; description?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; first?: boolean;
}) {
  return (
    <section style={{ paddingTop: first ? 0 : 24, marginTop: first ? 0 : 24, borderTop: first ? "none" : `1px solid ${C.bds}` }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: description ? 4 : 14 }}>
        <h3 style={{ margin: 0, flex: 1, fontSize: 14, fontWeight: 500, color: C.t1, letterSpacing: "-0.005em" }}>{title}</h3>
        {right}
      </div>
      {description && <p style={{ margin: "0 0 14px", fontSize: 12.5, lineHeight: 1.55, color: C.t3 }}>{description}</p>}
      <div style={{ display: "grid", gap: 16 }}>{children}</div>
    </section>
  );
}

/** Rangée « libellé · valeur » pour les récapitulatifs. */
export function SummaryRow({ label, children, action }: { label: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(110px, 180px) minmax(0, 1fr) auto", gap: 16, alignItems: "baseline", padding: "14px 0", borderBottom: `1px solid ${C.bds}` }}>
      <span style={{ fontSize: 12.5, color: C.t3 }}>{label}</span>
      <span style={{ fontSize: 14, color: C.t1, minWidth: 0, overflowWrap: "anywhere" }}>{children}</span>
      {action ?? <span />}
    </div>
  );
}

/** Message d'état (succès, erreur, avertissement) sobre, sans icône décorative superflue. */
export function Notice({ tone = "info", children }: { tone?: "info" | "ok" | "warn" | "err"; children: React.ReactNode }) {
  const t = {
    info: { bg: C.hover2, fg: C.t2 },
    ok: { bg: C.successBg, fg: C.successText },
    warn: { bg: C.warnBg, fg: C.warnText },
    err: { bg: C.dangerBg, fg: C.dangerText },
  }[tone];
  return (
    <div role={tone === "err" ? "alert" : "status"} style={{ padding: "10px 12px", borderRadius: 9, background: t.bg, color: t.fg, fontSize: 13, lineHeight: 1.55 }}>
      {children}
    </div>
  );
}

/* ─── Espace de travail plein écran ───────────────────────── */

export interface WorkspaceStep { id: string; label: string; badge?: number | string; done?: boolean }

/**
 * Tâche longue (composer une campagne, traiter un dossier…) en plein écran :
 * barre du haut avec titre, étapes et actions ; le corps est libre.
 */
export function Workspace({ title, subtitle, onClose, steps, step, onStep, actions, children, closeLabel = "Fermer" }: {
  title: React.ReactNode; subtitle?: React.ReactNode; onClose: () => void;
  steps?: WorkspaceStep[]; step?: string; onStep?: (id: string) => void;
  actions?: React.ReactNode; children: React.ReactNode; closeLabel?: string;
}) {
  const restore = useRef<HTMLElement | null>(null);
  useEffect(() => {
    restore.current = document.activeElement as HTMLElement | null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; restore.current?.focus?.(); };
  }, []);

  const current = steps?.findIndex((s) => s.id === step) ?? -1;

  return createPortal(
    <div className="admin-scope" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : "Espace de travail"}
      style={{ position: "fixed", inset: 0, zIndex: 2147482000, background: C.bg, color: C.t1, fontFamily: FONT, display: "flex", flexDirection: "column", animation: `ui-fade .2s ${UI_EASE}` }}>
      <UIStyles />
      <header style={{ flexShrink: 0, borderBottom: `1px solid ${C.bds}`, paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div style={{ height: 60, display: "flex", alignItems: "center", gap: 12, padding: "0 14px" }}>
          <Button variant="ghost" aria-label={closeLabel} title={closeLabel} onClick={onClose} icon={<X style={{ width: 18, height: 18 }} />} />
          <div style={{ minWidth: 0, flex: "1 1 auto" }}>
            <div style={{ fontSize: 14.5, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12, color: C.t3, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subtitle}</div>}
          </div>
          {steps && (
            <nav aria-label="Étapes" className="hidden md:flex" style={{ alignItems: "center", gap: 4, flex: "0 0 auto" }}>
              {steps.map((s, i) => {
                const on = s.id === step;
                const done = s.done ?? i < current;
                return (
                  <button key={s.id} type="button" className="ui-step" onClick={() => onStep?.(s.id)} aria-current={on ? "step" : undefined}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 8, height: 36, padding: "0 12px", borderRadius: 9, border: "none",
                      background: on ? C.l2 : "transparent", color: on ? C.t1 : C.t3, fontFamily: FONT, fontSize: 13, cursor: "pointer",
                    }}>
                    <span style={{
                      width: 20, height: 20, borderRadius: 99, fontSize: 11, display: "inline-flex", alignItems: "center", justifyContent: "center",
                      background: on ? C.accent : done ? C.hover3 : "transparent", color: on ? C.btnText : C.t2,
                      border: on || done ? "none" : `1px solid ${C.bd}`, fontVariantNumeric: "tabular-nums",
                    }}>
                      {done && !on ? <Check style={{ width: 11, height: 11 }} strokeWidth={2.6} /> : i + 1}
                    </span>
                    {s.label}
                    {s.badge !== undefined && s.badge !== 0 && <span style={{ fontSize: 12, color: C.t3, fontVariantNumeric: "tabular-nums" }}>{s.badge}</span>}
                  </button>
                );
              })}
            </nav>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 auto", justifyContent: "flex-end", minWidth: 0 }}>{actions}</div>
        </div>
        {steps && (
          <div className="md:hidden"><div style={{ display: "flex", gap: 4, padding: "0 12px 10px", overflowX: "auto" }}>
            {steps.map((s, i) => {
              const on = s.id === step;
              return (
                <button key={s.id} type="button" className="ui-step" onClick={() => onStep?.(s.id)} aria-current={on ? "step" : undefined}
                  style={{ flex: "1 0 auto", height: 34, borderRadius: 9, border: "none", background: on ? C.l2 : "transparent", color: on ? C.t1 : C.t3, fontFamily: FONT, fontSize: 13 }}>
                  {i + 1}. {s.label}{s.badge ? ` · ${s.badge}` : ""}
                </button>
              );
            })}
          </div></div>
        )}
      </header>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>{children}</div>
    </div>,
    document.body,
  );
}

/* ─── Panneau latéral ─────────────────────────────────────── */

export function SidePanel({ title, subtitle, onClose, width = 480, footer, children }: {
  title: React.ReactNode; subtitle?: React.ReactNode; onClose: () => void; width?: number; footer?: React.ReactNode; children: React.ReactNode;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return createPortal(
    <div className="admin-scope" style={{ position: "fixed", inset: 0, zIndex: 2147482500, fontFamily: FONT, color: C.t1 }}>
      <UIStyles />
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: C.overlay, animation: "ui-fade .18s ease" }} />
      <aside role="dialog" aria-modal="true" style={{
        position: "absolute", top: 0, right: 0, bottom: 0, width: `min(${width}px, 100vw)`, background: C.l1, boxShadow: C.panelShadow,
        display: "flex", flexDirection: "column", animation: `ui-slide .28s ${UI_EASE}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "calc(14px + env(safe-area-inset-top, 0px)) 16px 14px 20px", borderBottom: `1px solid ${C.bds}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, color: C.t1 }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12.5, color: C.t3, marginTop: 2 }}>{subtitle}</div>}
          </div>
          <Button variant="ghost" aria-label="Fermer" onClick={onClose} icon={<X style={{ width: 17, height: 17 }} />} />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>{children}</div>
        {footer && <div style={{ padding: "12px 16px calc(12px + env(safe-area-inset-bottom, 0px))", borderTop: `1px solid ${C.bds}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>{footer}</div>}
      </aside>
    </div>,
    document.body,
  );
}
