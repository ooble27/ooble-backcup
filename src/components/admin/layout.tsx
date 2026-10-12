/**
 * Mise en page des écrans du back-office : en-tête de page, onglets,
 * statistiques à plat, barre d'outils, tableau de données, pastilles d'état,
 * état vide. Aucune « carte » : des filets et de l'espace.
 */
import { useEffect, useMemo, useState } from "react";
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
  return (
    <div role="tablist" style={{ display: "flex", gap: 2, borderBottom: `1px solid ${C.bds}`, overflowX: "auto", scrollbarWidth: "none", ...style }}>
      {items.map((t) => {
        const on = t.id === value;
        return (
          <button key={t.id} role="tab" aria-selected={on} type="button" className="ly-tab" onClick={() => onChange(t.id)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 7, height: 40, padding: "0 12px", marginBottom: -1, flexShrink: 0,
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
          <div style={{ flex: 1, minWidth: 0 }}>
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

export function Pill({ tone = "neutral", children, dot }: { tone?: Tone; children: React.ReactNode; dot?: boolean }) {
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
      {dot && <span style={{ width: 6, height: 6, borderRadius: 99, background: "currentColor" }} />}
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
    <label style={{ position: "relative", flex: `0 1 ${width}px`, minWidth: 180 }}>
      <Search style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", width: 15, height: 15, color: C.t3, pointerEvents: "none" }} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="ui-input"
        style={{ width: "100%", height: 36, padding: "0 12px 0 34px", borderRadius: 9, border: `1px solid ${C.bds}`, background: "var(--a-inputBg)", color: C.t1, fontFamily: FONT, fontSize: 13.5, boxSizing: "border-box" }} />
    </label>
  );
}

/** Choix compact (filtres) : boutons-segments. */
export function FilterChips<T extends string>({ value, options, onChange }: {
  value: T; options: { id: T; label: React.ReactNode; count?: number }[]; onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button key={o.id} type="button" className="ui-btn" onClick={() => onChange(o.id)} aria-pressed={on}
            style={{
              height: 32, padding: "0 11px", borderRadius: 8, fontFamily: FONT, fontSize: 13, cursor: "pointer",
              border: `1px solid ${on ? C.bd : "transparent"}`, background: on ? C.l2 : "transparent", color: on ? C.t1 : C.t3,
              display: "inline-flex", alignItems: "center", gap: 6,
            }}>
            {o.label}
            {o.count !== undefined && <span style={{ fontSize: 12, color: C.t3, fontVariantNumeric: "tabular-nums" }}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ─── État vide ───────────────────────────────────────────── */

export function EmptyState({ icon: Icon, title, text, action }: {
  icon?: React.ElementType; title: string; text?: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <div style={{ padding: "56px 20px", textAlign: "center", color: C.t3 }}>
      {Icon && <Icon style={{ width: 28, height: 28, marginBottom: 12, color: C.t3 }} strokeWidth={1.4} />}
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
export function DataTable<T>({ rows, columns, rowKey, onRowClick, mobile, empty, pageSize = 50, initialSort, selectedKey }: {
  rows: T[]; columns: Column<T>[]; rowKey: (row: T) => string; onRowClick?: (row: T) => void;
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

  if (rows.length === 0) return <div style={{ borderTop: `1px solid ${C.bds}`, borderBottom: `1px solid ${C.bds}` }}>{empty ?? <EmptyState title="Rien à afficher" />}</div>;

  const more = sorted.length > shown && (
    <button type="button" className="ui-btn ui-btn-ghost" onClick={() => setShown((n) => n + pageSize)}
      style={{ marginTop: 12, height: 34, padding: "0 12px", borderRadius: 8, border: "none", background: "transparent", color: C.t2, fontFamily: FONT, fontSize: 13, cursor: "pointer" }}>
      Afficher {Math.min(pageSize, sorted.length - shown)} de plus · {sorted.length - shown} restantes
    </button>
  );

  if (mobile && width < 640) {
    return (
      <div>
        <div style={{ borderTop: `1px solid ${C.bds}` }}>
          {visible.map((r) => (
            <div key={rowKey(r)} role={onRowClick ? "button" : undefined} tabIndex={onRowClick ? 0 : undefined} className="ui-row"
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              onKeyDown={onRowClick ? (e) => { if (e.key === "Enter") onRowClick(r); } : undefined}
              style={{ padding: "12px 2px", borderBottom: `1px solid ${C.bds}`, cursor: onRowClick ? "pointer" : "default", background: selectedKey === rowKey(r) ? C.hover3 : undefined }}>
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
      <div style={{ overflowX: "auto", borderTop: `1px solid ${C.bds}` }}>
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
                  onKeyDown={onRowClick ? (e) => { if (e.key === "Enter") onRowClick(r); } : undefined}
                  style={{ cursor: onRowClick ? "pointer" : "default", background: selectedKey === k ? C.hover3 : undefined }}>
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
    <dl style={{ margin: 0, borderTop: `1px solid ${C.bds}` }}>
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
`;
