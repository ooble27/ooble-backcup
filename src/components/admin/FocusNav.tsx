import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { C, FONT } from "./adminTheme";
import { getTheme, onThemeChange, setTheme, type Theme } from "@/lib/theme";

/**
 * Barre latérale du back-office (ordinateur et tablette), façon « Ooble Focus » :
 * les pages en grands mots empilés, la page ouverte en pleine couleur, les autres effacées ;
 * à droite de chaque mot, une indication en caractères machine (compteur en direct ou repère).
 * Les groupes sont nommés en petites capitales machine, comme les en-têtes des cartes.
 */

export interface FocusItem { id: string; label: string; meta?: string; hot?: boolean }
export interface FocusGroup { label: string | null; items: FocusItem[]; menu?: { label: string; meta?: string } }

const MONO = `ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace`;

const CSS = `
.fn { --fn-size: 25px; }
@media (max-width: 1179px) { .fn { --fn-size: 20px; } }
.fn-row { all: unset; box-sizing: border-box; width: 100%; cursor: pointer; display: flex; align-items: baseline; gap: 10px; padding: 9px 4px 8px;
  border-bottom: 1px solid var(--a-bds); -webkit-tap-highlight-color: transparent; }
.fn-word { flex: 1; min-width: 0; font-size: var(--fn-size); font-weight: 600; letter-spacing: -0.05em; line-height: 1.02; color: var(--fn-dim);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; transition: color .2s, transform .35s cubic-bezier(.22,1,.36,1); }
.fn-meta { flex-shrink: 0; font-family: ${MONO}; font-size: 10.5px; letter-spacing: .02em; color: var(--a-t3); white-space: nowrap; transition: color .2s; }
.fn-row:hover .fn-word { color: var(--a-t2); transform: translateX(4px); }
.fn-row[data-on="true"] .fn-word { color: var(--a-t1); }
.fn-row[data-on="true"] .fn-meta { color: var(--a-t2); }
.fn-row:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 2px; border-radius: 6px; }
.fn-row[data-sub="true"] .fn-word { font-size: calc(var(--fn-size) * .72); letter-spacing: -0.035em; }
.fn-group { margin: 22px 4px 2px; font-family: ${MONO}; font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: var(--a-t3); }
.fn-sub { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .3s cubic-bezier(.22,1,.36,1); }
.fn-sub[data-open="true"] { grid-template-rows: 1fr; }
.fn-sub > div { overflow: hidden; padding-left: 14px; }
.fn-seg { display: inline-flex; padding: 3px; border-radius: 11px; background: var(--a-hover2); box-shadow: 0 0 0 1px var(--a-bds); }
.fn-seg button { all: unset; cursor: pointer; padding: 6px 13px; border-radius: 8px; font-size: 12.5px; color: var(--a-t3); transition: background .15s, color .15s; }
.fn-seg button[data-on="true"] { background: var(--a-l1); color: var(--a-t1); box-shadow: 0 0 0 1px var(--a-bds); }
.fn-seg button:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 1px; }
/* Mots effacés : gris doux en clair, gris profond en sombre (comme le modèle). */
.admin-scope .fn { --fn-dim: #b9b9b4; }
.dark .admin-scope .fn, .admin-scope.dark .fn { --fn-dim: #4d4d4f; }
@media (prefers-reduced-motion: reduce) { .fn-word, .fn-sub { transition: none; } }
`;

export function FocusNav({ groups, current, onSelect, email, role }: {
  groups: FocusGroup[]; current: string; onSelect: (id: string) => void; email?: string; role: string;
}) {
  const inMenu = groups.some((g) => g.menu && g.items.some((i) => i.id === current));
  const [open, setOpen] = useState(inMenu);
  useEffect(() => { if (inMenu) setOpen(true); }, [inMenu]);

  const row = (it: FocusItem, sub = false) => (
    <button key={it.id} type="button" className="fn-row" data-on={it.id === current} data-sub={sub} title={it.label}
      aria-current={it.id === current ? "page" : undefined} onClick={() => onSelect(it.id)}>
      <span className="fn-word">{it.label}</span>
      {it.meta && <span className="fn-meta" style={it.hot ? { color: "var(--a-coral)" } : undefined}>{it.meta}</span>}
    </button>
  );

  return (
    <nav aria-label="Navigation du back-office" className="fn" style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: FONT }}>
      <style>{CSS}</style>
      <div style={{ height: 66, display: "flex", alignItems: "center", gap: 11, padding: "0 18px 0 20px", flexShrink: 0 }}>
        <img src="/icons/icon-192.png" alt="" width={32} height={32} style={{ borderRadius: 9, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 17, fontWeight: 500, letterSpacing: "-0.02em", color: C.t1 }}>Ooble</span>
        <Link to="/app" className="sh-icon" title="Retour à l'app" aria-label="Retour à l'app"
          style={{ width: 32, height: 32, borderRadius: 99, display: "inline-flex", alignItems: "center", justifyContent: "center", color: C.t3 }}>
          <ArrowLeft style={{ width: 16, height: 16 }} />
        </Link>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 18px 16px 20px" }}>
        {groups.map((g, gi) => (
          <div key={g.label ?? `g${gi}`}>
            {g.label && !g.menu && <p className="fn-group">{g.label}</p>}
            {!g.menu ? g.items.map((it) => row(it)) : (
              <>
                {gi > 0 && <div style={{ height: 18 }} />}
                <button type="button" className="fn-row" data-on={inMenu && !open} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
                  <span className="fn-word">{g.menu.label}</span>
                  <span className="fn-meta" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {g.menu.meta}
                    <ChevronDown style={{ width: 13, height: 13, transform: open ? "rotate(180deg)" : "none", transition: "transform .3s" }} />
                  </span>
                </button>
                <div className="fn-sub" data-open={open}><div>{g.items.map((it) => row(it, true))}</div></div>
              </>
            )}
          </div>
        ))}
      </div>

      <div style={{ padding: "12px 18px calc(16px + env(safe-area-inset-bottom, 0px)) 20px", display: "grid", gap: 12, flexShrink: 0 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 12.5, color: C.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</p>
          <p style={{ margin: "2px 0 0", fontFamily: MONO, fontSize: 10.5, letterSpacing: ".02em", color: C.t3 }}>{role.toLowerCase()}</p>
        </div>
        <ThemeSeg />
      </div>
    </nav>
  );
}

function ThemeSeg() {
  const [t, setT] = useState<Theme>(getTheme);
  useEffect(() => onThemeChange(setT), []);
  const pick = (n: Theme) => { if (n !== t) { setTheme(n); setT(n); } };
  return (
    <div className="fn-seg" role="group" aria-label="Thème" style={{ justifySelf: "start" }}>
      <button type="button" data-on={t === "dark"} onClick={() => pick("dark")}>Sombre</button>
      <button type="button" data-on={t === "light"} onClick={() => pick("light")}>Clair</button>
    </div>
  );
}
