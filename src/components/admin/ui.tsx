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
/* Volet posé sur le fond qui défile : le texte s'efface en douceur aux bords au lieu d'être coupé net. */
.ws-flat { --ft: 0px; --fb: 0px; -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 var(--ft), #000 calc(100% - var(--fb)), transparent 100%); mask-image: linear-gradient(to bottom, transparent 0, #000 var(--ft), #000 calc(100% - var(--fb)), transparent 100%); }
.ws-flat[data-top="1"] { --ft: 36px; }
.ws-flat[data-bottom="1"] { --fb: 36px; }
/* Téléphone : l'espace de travail occupe tout l'écran, d'une seule couleur (celle de la barre d'état),
   sans écrin arrondi, sans ombre ni fondu sur les bords : rien ne se superpose, rien ne coupe le texte. */
@media (max-width: 767px) {
  .ws-root, .ws-head { background: var(--a-bg) !important; }
  .ws-body { padding: 0 !important; }
  /* Le contenu défile jusqu'en bas de l'écran (sous la barre d'accueil) : aucune bande ne le cache en bas. */
  .ws-card::after, .ws-flat::after, .ws-scroll::after { content: ""; display: block; flex-shrink: 0; height: env(safe-area-inset-bottom, 0px); }
  .ws-card { border-radius: 0 !important; box-shadow: none !important; }
  .ws-flat { -webkit-mask-image: none; mask-image: none; }
  .ui-side { background: var(--a-bg) !important; box-shadow: none !important; }

  /* Aucun voile sombre : iOS n'assombrit pas la zone de l'heure, le haut paraîtrait coupé en deux. */
  .a-veil { background: transparent !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }
}
/* Espaces de travail (toutes tailles) : rien ne pousse le volet sur le côté ; chaque bloc peut rétrécir, les textes longs vont à la ligne. */
.ws-root :is(div, section, label, form, article, aside, nav, ul, ol, li, p) { min-width: 0; }
.ws-root .cmp-ghost { min-width: 0; max-width: calc(100% + 20px); }
.ws-card, .ws-flat, .ws-scroll { overflow-x: hidden; }
/* Une icône posée dans un bloc centré se centre avec le texte (et non à gauche). */
.admin-scope :where([style*="text-align: center"]) > svg { display: inline-block; vertical-align: middle; }
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
.ui-btn-secondary:hover:not(:disabled) { border-color: var(--a-bdh) }
.ui-btn-ghost:hover:not(:disabled) { color: var(--a-t1) }
.ui-btn-primary:hover:not(:disabled) { background: var(--a-accentHover) }
.ui-row { transition: background .12s }
/* Aucun fond gris au survol : la ligne reste telle quelle (souhait de l'utilisateur). */
.ui-step:hover { color: var(--a-t1) }
.ui-sum { display: grid; grid-template-columns: minmax(110px, 180px) minmax(0, 1fr) auto; grid-template-areas: "l v a"; gap: 16px; align-items: baseline; padding: 14px 0; border-bottom: 1px solid var(--a-bds); }
.ui-sum-l { grid-area: l } .ui-sum-v { grid-area: v } .ui-sum-a { grid-area: a; justify-self: end }
/* Téléphone : le libellé au-dessus, la valeur sur toute la largeur. */
@media (max-width: 640px) { .ui-sum { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "l a" "v v"; gap: 4px 12px; align-items: center; padding: 12px 0; } }
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

/** Interrupteur (réglage oui/non), avec libellé et aide à droite. */
export function Switch({ checked, onChange, disabled, label, hint }: {
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: React.ReactNode; hint?: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1 }}>
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} className="ui-btn" onClick={() => onChange(!checked)}
        style={{
          position: "relative", flexShrink: 0, width: 36, height: 20, marginTop: 1, borderRadius: 99, border: "none", padding: 0,
          background: checked ? C.accent : C.l3, cursor: "inherit", transition: `background .18s ${UI_EASE}`,
        }}>
        <span style={{
          position: "absolute", top: 2, left: checked ? 18 : 2, width: 16, height: 16, borderRadius: 99,
          background: checked ? C.btnText : C.t2, transition: `left .18s ${UI_EASE}`,
        }} />
      </button>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13.5, color: C.t1, lineHeight: 1.45 }}>{label}</span>
        {hint && <span style={{ display: "block", marginTop: 3, fontSize: 12.5, color: C.t3, lineHeight: 1.5 }}>{hint}</span>}
      </span>
    </label>
  );
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
    <div className="ui-sum">
      <span className="ui-sum-l" style={{ fontSize: 12.5, color: C.t3 }}>{label}</span>
      <span className="ui-sum-v" style={{ fontSize: 14, color: C.t1, minWidth: 0, overflowWrap: "anywhere" }}>{children}</span>
      <span className="ui-sum-a">{action}</span>
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

/** Volet arrondi posé sur le fond de l'espace de travail (même écrin que le back-office). */
export function WsPane({ children, style, className, flat }: { children: React.ReactNode; style?: React.CSSProperties; className?: string; flat?: boolean }) {
  // `flat` : posé directement sur le fond, sans écrin (comme la barre latérale à côté de l'écrin du back-office).
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!flat || !el) return;
    const sync = () => {
      el.dataset.top = el.scrollTop > 2 ? "1" : "0";
      el.dataset.bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 2 ? "1" : "0";
    };
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => { el.removeEventListener("scroll", sync); ro.disconnect(); };
  }, [flat]);
  return (
    <div ref={ref} className={[className, flat ? "ws-flat" : "ws-card"].filter(Boolean).join(" ")} style={{
      minWidth: 0, minHeight: 0, overflowY: "auto",
      ...(flat ? { background: "transparent" } : { borderRadius: 16, background: C.bg, boxShadow: `0 0 0 1px ${C.bds}, 0 1px 3px rgba(0,0,0,.06)` }),
      ...style,
    }}>
      {children}
    </div>
  );
}

/**
 * Tâche longue (composer une campagne, traiter un dossier…) en plein écran.
 * Comme le back-office : le titre, les étapes et les actions sont posés sur le fond ;
 * le travail est dans un ou plusieurs volets arrondis, séparés par de l'espace, jamais par des traits.
 * `panes` : les enfants fournissent eux-mêmes leurs volets (WsPane), sinon un seul volet les entoure.
 */
export function Workspace({ title, subtitle, onClose, steps, step, onStep, actions, children, closeLabel = "Fermer", panes = false }: {
  title: React.ReactNode; subtitle?: React.ReactNode; onClose: () => void;
  steps?: WorkspaceStep[]; step?: string; onStep?: (id: string) => void;
  actions?: React.ReactNode; children: React.ReactNode; closeLabel?: string; panes?: boolean;
}) {
  const restore = useRef<HTMLElement | null>(null);
  useEffect(() => {
    restore.current = document.activeElement as HTMLElement | null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; restore.current?.focus?.(); };
  }, []);

  const current = steps?.findIndex((s) => s.id === step) ?? -1;

  const stepButton = (s: WorkspaceStep, i: number, phone: boolean) => {
    const on = s.id === step;
    const done = s.done ?? i < current;
    return (
      <button key={s.id} type="button" className="ui-step" onClick={() => onStep?.(s.id)} aria-current={on ? "step" : undefined}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: phone ? 6 : 8, height: 36, padding: phone ? "0 8px 0 6px" : "0 14px 0 8px", borderRadius: 10, border: "none",
          flex: phone ? "1 1 0" : undefined, minWidth: 0, whiteSpace: "nowrap",
          background: on ? C.bg : "transparent", boxShadow: on ? `0 0 0 1px ${C.bds}, 0 1px 2px rgba(0,0,0,.06)` : "none",
          color: on ? C.t1 : C.t3, fontFamily: FONT, fontSize: phone ? 13 : 13.5, cursor: "pointer", transition: `background .2s ${UI_EASE}, color .2s`,
        }}>
        <span style={{
          width: 22, height: 22, borderRadius: 99, fontSize: 11.5, display: "inline-flex", alignItems: "center", justifyContent: "center",
          background: on ? C.accent : done ? C.hover3 : "transparent", color: on ? C.btnText : C.t2,
          boxShadow: on || done ? "none" : `inset 0 0 0 1px ${C.bd}`, fontVariantNumeric: "tabular-nums",
        }}>
          {done && !on ? <Check style={{ width: 12, height: 12 }} strokeWidth={2.6} /> : i + 1}
        </span>
        {s.label}
        {s.badge !== undefined && s.badge !== 0 && <span style={{ fontSize: 12, color: C.t3, fontVariantNumeric: "tabular-nums" }}>{s.badge}</span>}
      </button>
    );
  };

  return createPortal(
    <div className="admin-scope ws-root" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : "Espace de travail"}
      style={{ position: "fixed", inset: 0, zIndex: 2147482000, background: C.ground, color: C.t1, fontFamily: FONT, display: "flex", flexDirection: "column", animation: `ui-fade .2s ${UI_EASE}` }}>
      <UIStyles />
      <header className="ws-head" style={{ flexShrink: 0, paddingTop: "var(--a-top, env(safe-area-inset-top, 0px))", background: C.ground }}>
        <div style={{ height: 60, display: "flex", alignItems: "center", gap: 12, padding: "0 12px 0 10px" }}>
          <Button variant="ghost" aria-label={closeLabel} title={closeLabel} onClick={onClose} icon={<X style={{ width: 18, height: 18 }} />} />
          <div style={{ minWidth: 0, flex: "1 1 auto" }}>
            <div style={{ fontSize: 14.5, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12, color: C.t3, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subtitle}</div>}
          </div>
          {steps && (
            <nav aria-label="Étapes" className="hidden md:flex" style={{ alignItems: "center", gap: 4, flex: "0 0 auto" }}>
              {steps.map((s, i) => stepButton(s, i, false))}
            </nav>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 auto", justifyContent: "flex-end", minWidth: 0 }}>{actions}</div>
        </div>
        {steps && (
          <div className="md:hidden"><nav aria-label="Étapes" style={{ display: "flex", gap: 2, padding: "0 8px 8px" }}>
            {steps.map((s, i) => stepButton(s, i, true))}
          </nav></div>
        )}
      </header>
      <div className="ws-body" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "0 8px calc(8px + env(safe-area-inset-bottom, 0px))" }}>
        {panes ? children : <WsPane style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>{children}</WsPane>}
      </div>
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
    <div className="admin-scope" style={{ position: "fixed", inset: 0, zIndex: 2147482500, fontFamily: FONT, color: C.t1, pointerEvents: "none" }}>
      <UIStyles />
      {/* Le voile couvre tout l'écran, barre d'état comprise : pas de bande plus claire en haut. */}
      <div onClick={onClose} className="a-veil" style={{ position: "absolute", inset: 0, background: C.overlay, animation: "ui-fade .18s ease", pointerEvents: "auto" }} />
      <aside role="dialog" aria-modal="true" className="ui-side" style={{
        position: "absolute", top: 0, right: 0, bottom: 0, width: `min(${width}px, 100vw)`, background: C.l1, boxShadow: C.panelShadow,
        display: "flex", flexDirection: "column", animation: `ui-slide .28s ${UI_EASE}`, pointerEvents: "auto",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "calc(14px + var(--a-top, env(safe-area-inset-top, 0px))) 16px 14px 20px" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, color: C.t1 }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12.5, color: C.t3, marginTop: 2 }}>{subtitle}</div>}
          </div>
          <Button variant="ghost" aria-label="Fermer" onClick={onClose} icon={<X style={{ width: 17, height: 17 }} />} />
        </div>
        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "20px", minWidth: 0 }}>{children}</div>
        {footer && <div style={{ padding: "12px 16px calc(12px + env(safe-area-inset-bottom, 0px))", display: "flex", gap: 8, justifyContent: "flex-end" }}>{footer}</div>}
      </aside>
    </div>,
    document.body,
  );
}
