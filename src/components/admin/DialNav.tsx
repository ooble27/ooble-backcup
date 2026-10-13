import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Moon, Sun } from "lucide-react";
import { C, FONT } from "./adminTheme";
import { getTheme, onThemeChange, setTheme, type Theme } from "@/lib/theme";

/**
 * Navigation du back-office sur téléphone : un cadran qui sort du bord gauche.
 *
 * Au repos, seule une petite languette fléchée dépasse du bord gauche : la page reste libre.
 * Un toucher déploie un demi-cercle compact collé au bord ; les pages sont posées sur l'arc.
 * On fait tourner le cadran du doigt (avec de l'élan, il se cale sur chaque page) ; la page en face
 * est mise en avant. Toucher une icône ouvre sa page, et le cadran rentre dans la languette.
 */

export interface DialItem { id: string; label: string; desc?: string; icon: React.ElementType; badge?: number }

const STEP = 30; // écart entre deux pages sur l'arc, en degrés
const EASE = "cubic-bezier(.22,1,.36,1)";

const CSS = `
/* Languette fine, logée dans la marge de gauche : elle ne cache jamais le texte de la page. */
.dn-tab { position: fixed; left: 0; top: 50%; z-index: 90; width: 14px; height: 56px; margin-top: -28px; padding: 0; border: none; cursor: pointer;
  border-radius: 0 10px 10px 0; display: flex; align-items: center; justify-content: center;
  background: var(--a-l1); color: var(--a-t2); box-shadow: 0 0 0 1px var(--a-bds);
  transition: transform .3s ${EASE}, opacity .2s; -webkit-tap-highlight-color: transparent; }
.dn-tab::before { content: ""; position: absolute; top: -10px; bottom: -10px; left: 0; right: 0; }
.dn-tab[data-hidden="true"] { transform: translateX(-100%); opacity: 0; pointer-events: none; }
.dn-tab:active { transform: scale(.94); transform-origin: 0 50%; }
.dn-tab:focus-visible, .dn-item:focus-visible, .dn-mini:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 3px; }
.dn-dial { position: fixed; left: 0; top: 50%; z-index: 89; overflow: hidden; touch-action: none; user-select: none; -webkit-user-select: none;
  background: var(--a-l1); box-shadow: 0 0 0 1px var(--a-bds); transform-origin: 0 50%;
  animation: dn-in .4s ${EASE} both; }
.dn-dial[data-closing="true"] { animation: dn-out .24s cubic-bezier(.4,0,.6,1) both; }
@keyframes dn-in { from { transform: translateY(-50%) scale(.12); opacity: 0; } to { transform: translateY(-50%) scale(1); opacity: 1; } }
@keyframes dn-out { from { transform: translateY(-50%) scale(1); opacity: 1; } to { transform: translateY(-50%) scale(.12); opacity: 0; } }
.dn-item { position: absolute; width: 48px; height: 48px; border-radius: 99px; border: none; padding: 0; cursor: pointer;
  display: flex; align-items: center; justify-content: center; background: transparent; color: var(--a-t2); -webkit-tap-highlight-color: transparent; }
.dn-item[data-on="true"] { background: var(--a-t1); color: var(--a-bg); }
.dn-item[data-current="true"]:not([data-on="true"]) { box-shadow: inset 0 0 0 1.5px var(--a-bd); }
.dn-mini { position: absolute; width: 34px; height: 34px; border-radius: 99px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;
  background: var(--a-hover2); color: var(--a-t2); -webkit-tap-highlight-color: transparent; }
@media (prefers-reduced-motion: reduce) {
  .dn-dial, .dn-dial[data-closing="true"] { animation-duration: 1ms; }
  .dn-item, .dn-ticks, .dn-tab { transition: none !important; }
}
`;

export function DialNav({ items, current, onSelect }: { items: DialItem[]; current: string; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const tab = useRef<HTMLButtonElement | null>(null);

  const close = (then?: () => void) => {
    setClosing(true);
    window.setTimeout(() => { setOpen(false); setClosing(false); then?.(); tab.current?.focus({ preventScroll: true }); }, 220);
  };

  return (
    <>
      <style>{CSS}</style>
      <button ref={tab} type="button" className="dn-tab" data-hidden={open} aria-label="Ouvrir le menu" aria-expanded={open} onClick={() => setOpen(true)}>
        <ChevronRight style={{ width: 12, height: 12, flexShrink: 0 }} strokeWidth={2.4} />
      </button>
      {open && createPortal(
        <Dial items={items} current={current} closing={closing} onClose={() => close()} onPick={(id) => close(() => onSelect(id))} />,
        document.body,
      )}
    </>
  );
}

function Dial({ items, current, closing, onClose, onPick }: {
  items: DialItem[]; current: string; closing: boolean; onClose: () => void; onPick: (id: string) => void;
}) {
  const [vh, setVh] = useState(() => window.innerHeight);
  useEffect(() => {
    const on = () => setVh(window.innerHeight);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const R = Math.max(150, Math.min(176, vh * 0.22)); // rayon : compact, environ 45 % de la largeur d'un téléphone
  const r = R - 36; // rayon de l'arc des pages
  const INSET = 32; // le cadran est en partie rentré dans le bord gauche : il prend moins de place
  const max = (items.length - 1) * STEP;

  const startIndex = Math.max(0, items.findIndex((i) => i.id === current));
  const [rot, setRot] = useState(startIndex * STEP);
  const [dragging, setDragging] = useState(false);
  const focus = Math.min(items.length - 1, Math.max(0, Math.round(rot / STEP)));
  const focused = items[focus];

  const box = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ a0: number; rot0: number; moved: number; last: number; t: number; v: number } | null>(null);
  const suppressClick = useRef(false);

  // Petit retour au passage de chaque page (Android ; iOS l'ignore).
  const lastFocus = useRef(focus);
  useEffect(() => {
    if (lastFocus.current !== focus) { lastFocus.current = focus; navigator.vibrate?.(6); }
  }, [focus]);

  // Clavier : flèches pour tourner, Entrée pour ouvrir, Échap pour fermer.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); setRot((v) => Math.min(max, Math.round(v / STEP) * STEP + STEP)); }
      else if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); setRot((v) => Math.max(0, Math.round(v / STEP) * STEP - STEP)); }
      else if (e.key === "Enter" && focused && !(e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement)) { e.preventDefault(); onPick(focused.id); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [max, focused, onClose, onPick]);

  // Angle du doigt autour du centre du cadran, posé sur le bord gauche (0° = vers la droite, positif vers le bas).
  const angleOf = (x: number, y: number) => {
    const b = box.current!.getBoundingClientRect();
    return (Math.atan2(y - (b.top + b.height / 2), x - b.left) * 180) / Math.PI;
  };
  const rubber = (v: number) => (v < 0 ? v / 3 : v > max ? max + (v - max) / 3 : v);

  const onDown = (e: React.PointerEvent) => {
    drag.current = { a0: angleOf(e.clientX, e.clientY), rot0: rot, moved: 0, last: rot, t: performance.now(), v: 0 };
    suppressClick.current = false;
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const delta = angleOf(e.clientX, e.clientY) - d.a0;
    d.moved = Math.max(d.moved, Math.abs(delta));
    if (d.moved < 3) return;
    if (!dragging) { setDragging(true); (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); }
    suppressClick.current = true;
    const next = rubber(d.rot0 - delta);
    const now = performance.now();
    d.v = (next - d.last) / Math.max(1, now - d.t); // degrés par ms
    d.last = next; d.t = now;
    setRot(next);
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved < 3) return;
    setDragging(false);
    // Élan : on prolonge le geste, puis on se cale sur la page la plus proche.
    const target = Math.round((rot + d.v * 160) / STEP) * STEP;
    setRot(Math.min(max, Math.max(0, target)));
  };

  const pick = (i: number) => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (i === focus) { onPick(items[i].id); return; }
    setRot(i * STEP);
    window.setTimeout(() => onPick(items[i].id), 260);
  };

  const ticks = useMemo(() => Array.from({ length: 72 }, (_, k) => k * 5), []);

  return (
    <div className="admin-scope" style={{ fontFamily: FONT }}>
      {/* Toucher à côté ferme le cadran (sans voile sombre). */}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 88 }} />
      <div ref={box} className="dn-dial" data-closing={closing} role="dialog" aria-label="Menu du back-office"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        style={{ left: -INSET, width: R, height: 2 * R, borderRadius: `0 ${R}px ${R}px 0` }}>
        {/* Graduations : elles tournent avec le cadran. */}
        <svg className="dn-ticks" aria-hidden width={2 * R} height={2 * R}
          style={{ position: "absolute", left: -R, top: 0, transform: `rotate(${-rot / 3}deg)`, transformOrigin: `${R}px ${R}px`, transition: dragging ? "none" : `transform .45s ${EASE}` }}>
          {ticks.map((deg) => {
            const long = deg % 30 === 0;
            const a = (deg * Math.PI) / 180;
            const r1 = R - 7, r2 = R - (long ? 14 : 11);
            return <line key={deg} x1={R + r1 * Math.cos(a)} y1={R + r1 * Math.sin(a)} x2={R + r2 * Math.cos(a)} y2={R + r2 * Math.sin(a)}
              stroke="var(--a-bd)" strokeWidth={long ? 1.4 : 1} strokeLinecap="round" />;
          })}
        </svg>

        {items.map((it, i) => {
          const phi = i * STEP - rot;
          const vis = Math.abs(phi) <= 80;
          const fade = Math.max(0, Math.min(1, 1 - (Math.abs(phi) - 52) / 26));
          const Icon = it.icon;
          return (
            <button key={it.id} type="button" className="dn-item" data-on={i === focus} data-current={it.id === current}
              aria-label={it.label} tabIndex={vis ? 0 : -1} onClick={() => pick(i)}
              style={{
                // Posée au centre puis tournée autour : en se calant, la page suit l'arc.
                left: -24, top: R - 24,
                opacity: vis ? fade : 0, pointerEvents: vis && fade > 0.3 ? "auto" : "none",
                transform: `rotate(${phi}deg) translateX(${r}px) rotate(${-phi}deg) scale(${i === focus ? 1.1 : 1})`,
                transition: dragging ? "background .2s, color .2s" : `transform .45s ${EASE}, opacity .3s, background .2s, color .2s`,
              }}>
              <Icon style={{ width: 20, height: 20 }} strokeWidth={i === focus ? 2 : 1.7} />
              {!!it.badge && (
                <span style={{ position: "absolute", top: -2, right: -4, minWidth: 18, height: 18, padding: "0 5px", borderRadius: 99, background: C.warnBg, color: C.warnText, fontSize: 11, display: "inline-flex", alignItems: "center", justifyContent: "center", fontVariantNumeric: "tabular-nums" }}>{it.badge}</span>
              )}
            </button>
          );
        })}

        {/* Au cœur du cadran : fermer, thème, retour à l'app. */}
        <ThemeMini style={{ left: INSET + 8, top: R - 62 }} />
        <button type="button" className="dn-mini" aria-label="Fermer le menu" onClick={onClose} style={{ left: INSET + 8, top: R - 17 }}>
          <ChevronLeft style={{ width: 17, height: 17 }} strokeWidth={2.2} />
        </button>
        <Link to="/app" className="dn-mini" aria-label="Retour à l'app" title="Retour à l'app" style={{ left: INSET + 8, top: R + 28 }}>
          <ArrowLeft style={{ width: 16, height: 16 }} />
        </Link>
      </div>

    </div>
  );
}

function ThemeMini({ style }: { style: React.CSSProperties }) {
  const [t, setT] = useState<Theme>(getTheme);
  useEffect(() => onThemeChange(setT), []);
  const dark = t === "dark";
  return (
    <button type="button" className="dn-mini" style={style} aria-label={dark ? "Passer en mode clair" : "Passer en mode sombre"}
      onClick={() => { const n: Theme = dark ? "light" : "dark"; setTheme(n); setT(n); }}>
      {dark ? <Sun style={{ width: 16, height: 16 }} /> : <Moon style={{ width: 16, height: 16 }} />}
    </button>
  );
}
