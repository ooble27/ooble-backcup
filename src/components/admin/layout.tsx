/**
 * Mise en page des écrans du back-office : en-tête de page, onglets,
 * statistiques à plat, barre d'outils, tableau de données, pastilles d'état,
 * état vide. Aucune « carte » : des filets et de l'espace.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { C, FONT } from "./adminTheme";

/* ─── En-tête de page ─────────────────────────────────────── */

export function PageHeader({ title, description, actions, children }: {
  title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <header style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 320px", minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: "clamp(28px, 2.6vw, 34px)", fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 1.1, color: C.t1, textWrap: "balance" }}>{title}</h1>
          {description && <p style={{ margin: "6px 0 0", fontSize: 13.5, lineHeight: 1.55, color: C.t3, maxWidth: 680 }}>{description}</p>}
        </div>
        {actions && <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{actions}</div>}
      </div>
      {children}
    </header>
  );
}

/* ─── Onglets soulignés ───────────────────────────────────── */

export interface TabItem<T extends string> { id: T; label: React.ReactNode; count?: number; tone?: "warn" | "danger" }

export function Tabs<T extends string>({ items, value, onChange, style }: {
  items: TabItem<T>[]; value: T; onChange: (id: T) => void; style?: React.CSSProperties;
}) {
  // Téléphone : les onglets défilent de côté ; l'onglet choisi reste visible, un fondu signale la suite.
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sync = () => {
      el.dataset.left = el.scrollLeft > 2 ? "1" : "0";
      el.dataset.right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2 ? "1" : "0";
    };
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", sync); ro.disconnect(); };
  }, []);
  useEffect(() => {
    const el = ref.current;
    const on = el?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (el && on && el.scrollWidth > el.clientWidth) {
      el.scrollTo({ left: Math.max(0, on.offsetLeft - (el.clientWidth - on.offsetWidth) / 2), behavior: "smooth" });
    }
  }, [value]);
  return (
    <div ref={ref} role="tablist" className="ly-tabs" style={{ display: "flex", gap: 2, borderBottom: `1px solid ${C.bds}`, overflowX: "auto", overflowY: "hidden", overscrollBehaviorX: "contain", touchAction: "pan-x", scrollbarWidth: "none", ...style }}>
      {items.map((t) => {
        const on = t.id === value;
        return (
          <button key={t.id} role="tab" aria-selected={on} type="button" className="ly-tab" onClick={() => onChange(t.id)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 7, height: 40, padding: "0 12px", flexShrink: 0, boxSizing: "border-box",
              border: "none", borderBottom: `2px solid ${on ? C.t1 : "transparent"}`, background: "transparent",
              color: on ? C.t1 : C.t3, fontFamily: FONT, fontSize: 13.5, cursor: "pointer", whiteSpace: "nowrap",
            }}>
            {t.label}
            {t.count !== undefined && (
              <span style={{
                fontSize: 11.5, minWidth: 20, height: 20, padding: "0 6px", borderRadius: 99, display: "inline-flex", alignItems: "center", justifyContent: "center",
                fontVariantNumeric: "tabular-nums",
                background: t.tone === "danger" && t.count ? C.dangerBg : t.tone === "warn" && t.count ? C.warnBg : C.hover3,
                color: t.tone === "danger" && t.count ? C.dangerText : t.tone === "warn" && t.count ? C.warnText : C.t2,
              }}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Statistiques à plat ─────────────────────────────────── */

export interface Stat { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "ok" | "warn" | "danger"; /** Couleur libre du chiffre (prioritaire sur tone). */ color?: string }

export function StatStrip({ items, style }: { items: Stat[]; style?: React.CSSProperties }) {
  return (
    <dl style={{
      // Chiffres posés sur la page : grands, en couleur, séparés par de l'espace (aucun cadre, aucun trait).
      margin: 0, display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(150px, 1fr))`, gap: "18px 28px", ...style,
    }}>
      {items.map((s) => (
        <div key={s.label} className="ly-stat" style={{ minWidth: 0 }}>
          <dt style={{ fontSize: 12.5, color: C.t3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.label}</dt>
          <dd style={{
            margin: "6px 0 0", fontSize: 28, fontWeight: 600, letterSpacing: "-0.035em", fontVariantNumeric: "tabular-nums", lineHeight: 1.1,
            color: s.color ? s.color : s.tone === "danger" ? C.dangerText : s.tone === "warn" ? C.warnText : s.tone === "ok" ? C.successText : C.t1,
          }}>{s.value}</dd>
          {s.hint && <dd style={{ margin: "4px 0 0", fontSize: 12, color: C.t3 }}>{s.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}

/* ─── Section de page ─────────────────────────────────────── */

export function Section({ title, description, actions, children, style }: {
  title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; style?: React.CSSProperties;
}) {
  return (
    <section style={{ marginTop: 36, ...style }}>
      {(title || actions) && (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 240px", minWidth: 0 }}>
            {title && <h2 style={{ margin: 0, fontSize: 15, fontWeight: 500, color: C.t1 }}>{title}</h2>}
            {description && <p style={{ margin: "3px 0 0", fontSize: 12.5, color: C.t3, lineHeight: 1.5 }}>{description}</p>}
          </div>
          {actions && <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/* ─── Pastilles d'état ────────────────────────────────────── */

export type Tone = "neutral" | "ok" | "warn" | "danger" | "info" | "strong";

// `dot` est accepté mais ignoré : aucune pastille devant les états (choix de design).
export function Pill({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode; dot?: boolean }) {
  const t = {
    neutral: { bg: C.hover3, fg: C.t2 },
    strong: { bg: C.t1, fg: C.bg },
    info: { bg: C.hover4, fg: C.t1 },
    ok: { bg: C.successBg, fg: C.successText },
    warn: { bg: C.warnBg, fg: C.warnText },
    danger: { bg: C.dangerBg, fg: C.dangerText },
  }[tone];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6, height: 22, padding: "0 8px", borderRadius: 6, whiteSpace: "nowrap",
      background: t.bg, color: t.fg, fontSize: 12, fontFamily: FONT, lineHeight: 1,
    }}>
      {children}
    </span>
  );
}

/* ─── Barre d'outils et recherche ─────────────────────────── */

export function Toolbar({ children, right, style }: { children?: React.ReactNode; right?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "16px 0 12px", ...style }}>
      {children}
      <div style={{ flex: 1 }} />
      {right}
    </div>
  );
}

export function SearchField({ value, onChange, placeholder = "Rechercher", width = 280 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; width?: number;
}) {
  return (
    <label className="ly-search" style={{ position: "relative", flex: `0 1 ${width}px`, minWidth: 180 }}>
      <Search style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", width: 15, height: 15, color: C.t3, pointerEvents: "none" }} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="ui-input"
        style={{ width: "100%", height: 36, padding: "0 12px 0 34px", borderRadius: 9, border: `1px solid ${C.bds}`, background: "var(--a-inputBg)", color: C.t1, fontFamily: FONT, fontSize: 13.5, boxSizing: "border-box" }} />
    </label>
  );
}

/** Choix compact (filtres) : boutons-segments. */
/** Filtres en texte : le choix actif est souligné (un trait qui se dessine), jamais une pastille. */
export function FilterChips<T extends string>({ value, options, onChange }: {
  value: T; options: { id: T; label: React.ReactNode; count?: number; /** Le nombre demande une action (corail). */ alert?: boolean }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="ly-chips" style={{ display: "inline-flex", gap: 18, flexWrap: "wrap" }}>
      {options.map((o) => (
        <button key={o.id} type="button" className="ly-f" onClick={() => onChange(o.id)} aria-pressed={o.id === value}>
          <span>{o.label}</span>
          {o.count !== undefined && <small style={{ color: o.alert && o.count ? C.coral : C.t3 }}>{o.count}</small>}
        </button>
      ))}
    </div>
  );
}

/* ─── État vide ───────────────────────────────────────────── */

export function EmptyState({ icon: Icon, title, text, action }: {
  icon?: React.ElementType; title: string; text?: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <div style={{ padding: "56px 20px", textAlign: "center", color: C.t3 }}>
      {Icon && <Icon style={{ display: "block", width: 28, height: 28, margin: "0 auto 12px", color: C.t3 }} strokeWidth={1.4} />}
      <p style={{ margin: 0, fontSize: 14, color: C.t1 }}>{title}</p>
      {text && <p style={{ margin: "6px auto 0", fontSize: 13, lineHeight: 1.55, maxWidth: 380 }}>{text}</p>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

/* ─── Tableau de données ──────────────────────────────────── */

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render: (row: T) => React.ReactNode;
  /** Valeur de tri (absente = colonne non triable). */
  sort?: (row: T) => number | string;
  align?: "left" | "right";
  width?: number | string;
  /** Masquée sous cette largeur de fenêtre (px). */
  hideBelow?: number;
}

function useWidth() {
  const [w, setW] = useState(() => (typeof window === "undefined" ? 1280 : window.innerWidth));
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return w;
}

/**
 * Tableau : en-tête collant, tri par colonne, ligne cliquable, pagination
 * légère. Sur téléphone, `mobile` rend chaque ligne en liste à deux niveaux.
 */
function AutoMore({ onReach }: { onReach: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const cb = useRef(onReach);
  cb.current = onReach;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) cb.current(); }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} aria-hidden style={{ height: 1 }} />;
}

export function DataTable<T>({ rows, columns, rowKey, onRowClick, onRowIntent, mobile, empty, pageSize = 50, initialSort, selectedKey }: {
  rows: T[]; columns: Column<T>[]; rowKey: (row: T) => string; onRowClick?: (row: T) => void;
  /** Le pointeur vise une ligne (survol, toucher, focus) : de quoi précharger ce qu'elle ouvre. */
  onRowIntent?: (row: T) => void;
  mobile?: (row: T) => React.ReactNode; empty?: React.ReactNode; pageSize?: number;
  initialSort?: { key: string; dir: "asc" | "desc" }; selectedKey?: string | null;
}) {
  const width = useWidth();
  const [sort, setSort] = useState(initialSort ?? null);
  const [shown, setShown] = useState(pageSize);
  useEffect(() => setShown(pageSize), [rows, pageSize]);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    const get = col.sort;
    return [...rows].sort((a, b) => {
      const x = get(a); const y = get(b);
      const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "fr");
      return sort.dir === "asc" ? r : -r;
    });
  }, [rows, columns, sort]);

  const cols = columns.filter((c) => !c.hideBelow || width >= c.hideBelow);
  const visible = sorted.slice(0, shown);

  if (rows.length === 0) return <div>{empty ?? <EmptyState title="Rien à afficher" />}</div>;

  const more = sorted.length > shown && (
    <>
    {/* Arrivé en bas, la suite se charge seule (50 lignes à la fois : fluide même avec des dizaines de milliers de lignes). */}
    <AutoMore key={shown} onReach={() => setShown((n) => n + pageSize)} />
    <button type="button" className="ui-btn ui-btn-ghost" onClick={() => setShown((n) => n + pageSize)}
      style={{ marginTop: 12, height: 34, padding: "0 12px", borderRadius: 8, border: "none", background: "transparent", color: C.t2, fontFamily: FONT, fontSize: 13, cursor: "pointer" }}>
      Afficher {Math.min(pageSize, sorted.length - shown)} de plus · {sorted.length - shown} restantes
    </button>
    </>
  );

  if (mobile && width < 640) {
    return (
      <div>
        <div>
          {visible.map((r) => (
            <div key={rowKey(r)} role={onRowClick ? "button" : undefined} tabIndex={onRowClick ? 0 : undefined} className="ui-row"
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              onPointerDown={onRowIntent ? () => onRowIntent(r) : undefined}
              onKeyDown={onRowClick ? (e) => { if (e.key === "Enter") onRowClick(r); } : undefined}
              style={{ padding: "12px 2px", borderBottom: `1px solid ${C.bds}`, cursor: onRowClick ? "pointer" : "default", background: selectedKey != null && selectedKey === rowKey(r) ? C.hover3 : undefined }}>
              {mobile(r)}
            </div>
          ))}
        </div>
        {more}
      </div>
    );
  }

  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontFamily: FONT, fontSize: 13.5 }}>
          <thead>
            <tr>
              {cols.map((c) => {
                const on = sort?.key === c.key;
                return (
                  <th key={c.key} scope="col" style={{
                    position: "sticky", top: 0, zIndex: 1, background: C.bg, textAlign: c.align ?? "left", fontWeight: 400, fontSize: 12.5,
                    color: on ? C.t1 : C.t3, padding: "10px 12px", borderBottom: `1px solid ${C.bds}`, whiteSpace: "nowrap", width: c.width,
                  }}>
                    {c.sort ? (
                      <button type="button" onClick={() => setSort(on && sort?.dir === "desc" ? { key: c.key, dir: "asc" } : { key: c.key, dir: "desc" })}
                        style={{ all: "unset", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {c.header}
                        {on && (sort?.dir === "desc" ? <ArrowDown style={{ width: 12, height: 12 }} /> : <ArrowUp style={{ width: 12, height: 12 }} />)}
                      </button>
                    ) : c.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const k = rowKey(r);
              return (
                <tr key={k} className="ui-row" tabIndex={onRowClick ? 0 : undefined}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  onMouseEnter={onRowIntent ? () => onRowIntent(r) : undefined}
                  onPointerDown={onRowIntent ? () => onRowIntent(r) : undefined}
                  onFocus={onRowIntent ? () => onRowIntent(r) : undefined}
                  onKeyDown={onRowClick ? (e) => { if (e.key === "Enter") onRowClick(r); } : undefined}
                  style={{ cursor: onRowClick ? "pointer" : "default", background: selectedKey != null && selectedKey === k ? C.hover3 : undefined }}>
                  {cols.map((c) => (
                    <td key={c.key} style={{ padding: "11px 12px", borderBottom: `1px solid ${C.bds}`, textAlign: c.align ?? "left", verticalAlign: "middle", color: C.t1, fontVariantNumeric: "tabular-nums", width: c.width }}>
                      {c.render(r)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {more}
    </div>
  );
}

/** Deux lignes (principal + secondaire) pour une cellule ou une ligne mobile. */
export function TwoLine({ primary, secondary, lead }: { primary: React.ReactNode; secondary?: React.ReactNode; lead?: React.ReactNode }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
      {lead}
      <span style={{ minWidth: 0, display: "block" }}>
        <span style={{ display: "block", fontSize: 13.5, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{primary}</span>
        {secondary && <span style={{ display: "block", fontSize: 12, color: C.t3, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{secondary}</span>}
      </span>
    </span>
  );
}

export function Avatar({ name, size = 30 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
  return (
    <span aria-hidden style={{
      width: size, height: size, borderRadius: 99, flexShrink: 0, background: C.l3, color: C.t2, fontSize: size * 0.38,
      display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: FONT,
    }}>{initials}</span>
  );
}

/** Liste « libellé : valeur » (fiches, panneaux latéraux). */
export function KeyValues({ items }: { items: [React.ReactNode, React.ReactNode][] }) {
  return (
    <dl style={{ margin: 0 }}>
      {items.map(([k, v], i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(110px, 38%) minmax(0, 1fr)", gap: 12, padding: "11px 0", borderBottom: `1px solid ${C.bds}`, alignItems: "baseline" }}>
          <dt style={{ fontSize: 12.5, color: C.t3 }}>{k}</dt>
          <dd style={{ margin: 0, fontSize: 13.5, color: C.t1, overflowWrap: "anywhere", fontVariantNumeric: "tabular-nums" }}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export const LAYOUT_CSS = `
.ly-tab { transition: color .15s, border-color .15s }
.ly-tab:hover { color: var(--a-t1) }
.ly-tab:focus-visible { outline: 2px solid var(--a-accent); outline-offset: -2px }
@media (max-width: 640px) { .ly-stat { padding-left: 0 !important; border-left: none !important } }
.ly-tabs::-webkit-scrollbar { display: none }
.ly-f { all: unset; box-sizing: border-box; cursor: pointer; display: inline-flex; align-items: baseline; gap: 6px; padding: 4px 0; font-family: inherit; font-size: 13.5px; color: var(--a-t3); white-space: nowrap; transition: color .15s; }
.ly-f small { font-size: 12px; font-variant-numeric: tabular-nums; }
.ly-f:hover, .ly-f[aria-pressed="true"] { color: var(--a-t1); }
.ly-f[aria-pressed="true"] { font-weight: 500; }
.ly-f > span { background-image: linear-gradient(currentColor, currentColor); background-repeat: no-repeat; background-position: 0 100%; background-size: 0 1.5px; padding-bottom: 4px; transition: background-size .35s cubic-bezier(.22,1,.36,1); }
.ly-f[aria-pressed="true"] > span, .ly-f:hover > span { background-size: 100% 1.5px; }
.ly-f:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 3px; border-radius: 4px; }
.ly-tabs { --fl: 0px; --fr: 0px; -webkit-mask-image: linear-gradient(to right, transparent 0, #000 var(--fl), #000 calc(100% - var(--fr)), transparent 100%); mask-image: linear-gradient(to right, transparent 0, #000 var(--fl), #000 calc(100% - var(--fr)), transparent 100%); }
.ly-tabs[data-left="1"] { --fl: 28px }
.ly-tabs[data-right="1"] { --fr: 40px }
/* Téléphone : recherche sur toute la largeur, menus de filtre côte à côte. */
@media (max-width: 640px) {
  .ly-search { flex: 1 1 100% !important; min-width: 0 !important; }
  /* Filtres : une seule ligne qui défile de côté, au lieu de plusieurs lignes empilées. */
  .ly-chips { flex-wrap: nowrap !important; overflow-x: auto; max-width: 100%; scrollbar-width: none; -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent); mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent); padding-right: 24px; }
  .ly-chips::-webkit-scrollbar { display: none; }
  .ly-chips > button { flex-shrink: 0; }
  .sh-page select { flex: 1 1 calc(50% - 6px); min-width: 0; max-width: 100%; }
}
`;
