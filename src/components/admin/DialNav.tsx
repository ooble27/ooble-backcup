import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { ArrowLeft, Moon, Sun, X } from "lucide-react";
import { C, FONT } from "./adminTheme";
import { getTheme, onThemeChange, setTheme, type Theme } from "@/lib/theme";

/**
 * Navigation du back-office sur téléphone : un cadran.
 *
 * Un bouton rond au bas de l'écran, sous le pouce. Il s'ouvre en demi-cercle ; les pages sont posées
 * sur l'arc. On fait tourner le cadran du doigt (avec de l'élan, il se cale sur chaque page) : la page
 * arrivée sous le repère du haut s'affiche en grand au centre. Un toucher l'ouvre, et le cadran se
 * replie dans le bouton.
 */

export interface DialItem { id: string; label: string; desc?: string; icon: React.ElementType; badge?: number }

const STEP = 30; // écart entre deux pages sur l'arc, en degrés
const BASE = 92; // socle sous le demi-cercle : bouton du menu, thème, retour à l'app
const EASE = "cubic-bezier(.22,1,.36,1)";

const CSS = `
.dn-fab { position: fixed; left: 50%; bottom: calc(16px + env(safe-area-inset-bottom, 0px)); z-index: 90; width: 58px; height: 58px; margin-left: -29px;
  border-radius: 99px; border: none; padding: 0; cursor: pointer; display: flex; align-items: center; justify-content: center;
  background: var(--a-t1); color: var(--a-bg); box-shadow: 0 0 0 1px var(--a-bds); transition: transform .2s ${EASE}; -webkit-tap-highlight-color: transparent; }
.dn-fab:active { transform: scale(.92); }
.dn-fab:focus-visible, .dn-item:focus-visible, .dn-mini:focus-visible, .dn-open:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 3px; }
.dn-fab img { width: 30px; height: 30px; border-radius: 8px; transition: transform .3s ${EASE}, opacity .2s; }
.dn-fab[data-open="true"] img { transform: rotate(-90deg) scale(.4); opacity: 0; }
.dn-fab .dn-x { position: absolute; transform: rotate(90deg) scale(.4); opacity: 0; transition: transform .3s ${EASE}, opacity .2s; }
.dn-fab[data-open="true"] .dn-x { transform: none; opacity: 1; }
.dn-dial { position: fixed; left: 50%; bottom: 0; z-index: 89; overflow: hidden; touch-action: none; user-select: none; -webkit-user-select: none;
  background: var(--a-l1); box-shadow: 0 0 0 1px var(--a-bds); transform-origin: 50% 100%;
  animation: dn-in .42s ${EASE} both; }
.dn-dial[data-closing="true"] { animation: dn-out .26s cubic-bezier(.4,0,.6,1) both; }
@keyframes dn-in { from { transform: translateX(-50%) scale(.18); opacity: 0; } to { transform: translateX(-50%) scale(1); opacity: 1; } }
@keyframes dn-out { from { transform: translateX(-50%) scale(1); opacity: 1; } to { transform: translateX(-50%) scale(.18); opacity: 0; } }
.dn-item { position: absolute; width: 50px; height: 50px; border-radius: 99px; border: none; padding: 0; cursor: pointer;
  display: flex; align-items: center; justify-content: center; background: transparent; color: var(--a-t2); -webkit-tap-highlight-color: transparent; }
.dn-item[data-on="true"] { background: var(--a-t1); color: var(--a-bg); }
.dn-item[data-current="true"]:not([data-on="true"]) { box-shadow: inset 0 0 0 1.5px var(--a-bd); }
.dn-mini { position: absolute; width: 40px; height: 40px; border-radius: 99px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;
  background: var(--a-hover2); color: var(--a-t2); -webkit-tap-highlight-color: transparent; }
.dn-open { all: unset; cursor: pointer; display: flex; flex-direction: column; align-items: center; text-align: center; }
.dn-label { animation: dn-label .3s ${EASE} both; }
@keyframes dn-label { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .dn-dial, .dn-dial[data-closing="true"], .dn-label { animation-duration: 1ms; }
  .dn-item, .dn-ticks { transition: none !important; }
}
`;

export function DialNav({ items, current, onSelect }: { items: DialItem[]; current: string; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const fab = useRef<HTMLButtonElement | null>(null);

  const close = (then?: () => void) => {
    setClosing(true);
    window.setTimeout(() => { setOpen(false); setClosing(false); then?.(); fab.current?.focus({ preventScroll: true }); }, 240);
  };

  return (
    <>
      <style>{CSS}</style>
      <button ref={fab} type="button" className="dn-fab" data-open={open && !closing}
        aria-label={open ? "Fermer le menu" : "Ouvrir le menu"} aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}>
        <img src="/icons/icon-192.png" alt="" />
        <X className="dn-x" style={{ width: 22, height: 22 }} strokeWidth={2} />
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
  const [vw, setVw] = useState(() => window.innerWidth);
  useEffect(() => {
    const on = () => setVw(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const R = Math.min(vw / 2 - 4, 236); // rayon du cadran
  const r = R - 40; // rayon de l'arc des pages
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
      else if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); setRot((v) => Math.min(max, Math.round(v / STEP) * STEP + STEP)); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); setRot((v) => Math.max(0, Math.round(v / STEP) * STEP - STEP)); }
      else if (e.key === "Enter" && focused && !(e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement)) { e.preventDefault(); onPick(focused.id); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [max, focused, onClose, onPick]);

  // Angle du doigt autour du centre du cadran (0° = en haut, positif vers la droite).
  const angleOf = (x: number, y: number) => {
    const b = box.current!.getBoundingClientRect();
    const cx = b.left + b.width / 2;
    const cy = b.bottom;
    return (Math.atan2(x - cx, cy - y) * 180) / Math.PI;
  };
  const rubber = (v: number) => (v < 0 ? v / 3 : v > max ? max + (v - max) / 3 : v);

  const onDown = (e: React.PointerEvent) => {
    drag.current = { a0: angleOf(e.clientX, e.clientY), rot0: rot, moved: 0, last: rot, t: performance.now(), v: 0 };
    suppressClick.current = false;
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const a = angleOf(e.clientX, e.clientY);
    const delta = a - d.a0;
    d.moved = Math.max(d.moved, Math.abs(delta));
    if (d.moved < 3) return;
    if (!dragging) { setDragging(true); (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); }
    suppressClick.current = true;
    const next = rubber(d.rot0 - delta);
    const now = performance.now();
    const dt = Math.max(1, now - d.t);
    d.v = (next - d.last) / dt; // degrés par ms
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
  const trans = dragging ? "none" : `transform .45s ${EASE}, opacity .3s`;

  return (
    <div className="admin-scope" style={{ fontFamily: FONT }}>
      {/* Toucher à côté ferme le cadran (sans voile sombre). */}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 88 }} />
      <div ref={box} className="dn-dial" data-closing={closing} role="dialog" aria-label="Menu du back-office"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        style={{ width: 2 * R, height: `calc(${R + BASE}px + env(safe-area-inset-bottom, 0px))`, borderRadius: `${R}px ${R}px 0 0` }}>
        {/* Graduations (moitié haute seulement) : elles tournent avec le cadran. */}
        <div aria-hidden style={{ position: "absolute", left: 0, top: 0, width: 2 * R, height: R, overflow: "hidden" }}>
        <svg className="dn-ticks" width={2 * R} height={2 * R}
          style={{ position: "absolute", left: 0, top: 0, transform: `rotate(${-rot / 3}deg)`, transformOrigin: `${R}px ${R}px`, transition: dragging ? "none" : `transform .45s ${EASE}` }}>
          {ticks.map((deg) => {
            const long = deg % 30 === 0;
            const a = (deg * Math.PI) / 180;
            const r1 = R - 8, r2 = R - (long ? 16 : 12);
            return <line key={deg} x1={R + r1 * Math.sin(a)} y1={R - r1 * Math.cos(a)} x2={R + r2 * Math.sin(a)} y2={R - r2 * Math.cos(a)}
              stroke="var(--a-bd)" strokeWidth={long ? 1.4 : 1} strokeLinecap="round" />;
          })}
        </svg>
        </div>
        {/* Repère du haut : la page qui s'y trouve est celle qui s'ouvre. */}
        <span aria-hidden style={{ position: "absolute", left: R - 3, top: 4, width: 6, height: 6, borderRadius: 99, background: "var(--a-coral)" }} />

        {items.map((it, i) => {
          const phi = i * STEP - rot;
          const vis = Math.abs(phi) <= 96;
          const fade = Math.max(0, Math.min(1, 1 - (Math.abs(phi) - 66) / 30));
          const Icon = it.icon;
          return (
            <button key={it.id} type="button" className="dn-item" data-on={i === focus} data-current={it.id === current}
              aria-label={it.label} tabIndex={vis ? 0 : -1} onClick={() => pick(i)}
              style={{
                // Posée au centre puis tournée autour : en se calant, la page suit l'arc (et non une ligne droite).
                left: R - 25, top: R - 25,
                opacity: vis ? fade : 0, pointerEvents: vis && fade > 0.3 ? "auto" : "none",
                transform: `rotate(${phi}deg) translateY(${-r}px) rotate(${-phi}deg) scale(${i === focus ? 1.12 : 1})`,
                transition: dragging ? "background .2s, color .2s" : `${trans}, background .2s, color .2s`,
              }}>
              <Icon style={{ width: 21, height: 21 }} strokeWidth={i === focus ? 2 : 1.7} />
              {!!it.badge && (
                <span style={{ position: "absolute", top: -2, right: -4, minWidth: 18, height: 18, padding: "0 5px", borderRadius: 99, background: C.warnBg, color: C.warnText, fontSize: 11, display: "inline-flex", alignItems: "center", justifyContent: "center", fontVariantNumeric: "tabular-nums" }}>{it.badge}</span>
              )}
            </button>
          );
        })}

        {/* Centre : la page sous le repère, en grand ; un toucher l'ouvre. */}
        {focused && (
          <div style={{ position: "absolute", left: R - (r - 46), width: 2 * (r - 46), top: R - r + 46, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
            <button key={focused.id} type="button" className="dn-open dn-label" onClick={() => onPick(focused.id)} style={{ pointerEvents: "auto" }}>
              <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em", color: C.t1, lineHeight: 1.1 }}>{focused.label}</span>
              {focused.desc && (
                <span style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.4, color: C.t3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{focused.desc}</span>
              )}
              <span style={{ marginTop: 10, fontSize: 12, color: focused.id === current ? C.t3 : C.t1, display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 99, background: C.hover2 }}>
                {focused.id === current ? "Vous y êtes" : "Ouvrir"}
              </span>
            </button>
          </div>
        )}

        <ThemeMini style={{ left: 22, bottom: "calc(25px + env(safe-area-inset-bottom, 0px))" }} />
        <Link to="/app" className="dn-mini" aria-label="Retour à l'app" title="Retour à l'app"
          style={{ right: 22, bottom: "calc(25px + env(safe-area-inset-bottom, 0px))" }}>
          <ArrowLeft style={{ width: 18, height: 18 }} />
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
      {dark ? <Sun style={{ width: 18, height: 18 }} /> : <Moon style={{ width: 18, height: 18 }} />}
    </button>
  );
}
