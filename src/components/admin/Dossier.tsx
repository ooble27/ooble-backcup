import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, FileText, Loader2, Maximize2, Minus, Plus, RotateCw, X } from "lucide-react";
import { C, FONT } from "./adminTheme";
import { FilterChips } from "./layout";
import PdfPages from "./PdfPages";

/**
 * Briques d'un dossier de vérification (identité, entreprise) :
 *  - DocViewer : les documents posés sur le fond, sans cadre, en grand ou deux à deux pour comparer,
 *    avec zoom (molette, pincement, double clic), déplacement et rotation ;
 *  - Facts : les informations en grille aérée, sans traits ;
 *  - Checklist : les points à contrôler, cochés d'un rond ;
 *  - Section : un titre de bloc discret.
 */

export interface DossierDoc { key: string; label: string; path: string | null | undefined }
/** Deux documents à regarder côte à côte (ex. le selfie et la photo de la pièce). */
export interface DossierCompare { a: string; b: string; label: string }
export const COMPARE = "compare";

const DOSSIER_CSS = `
.dz-stage { position: relative; flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; animation: dz-in .5s cubic-bezier(.22,1,.36,1) both; }
.dz-pair { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px; }
.dz-pair > .dz-stage:nth-child(2) { animation-delay: .07s; }
@media (max-width: 700px) { .dz-pair { grid-template-columns: minmax(0, 1fr); grid-auto-rows: minmax(260px, 1fr); gap: 16px; } }
@keyframes dz-in { from { opacity: 0; transform: translateY(6px) scale(.99); } to { opacity: 1; transform: none; } }
.dz-z { position: absolute; inset: 0; overflow: hidden; touch-action: pan-y; user-select: none; -webkit-user-select: none; display: flex; align-items: center; justify-content: center; }
/* Au repos, un doigt fait défiler la page ; zoomée, l'image suit le doigt. */
.dz-z[data-zoomed="true"] { touch-action: none; }
.dz-z img { display: block; object-fit: contain; border-radius: 14px; pointer-events: none; will-change: transform; }
.dz-bar { position: absolute; left: 50%; bottom: 14px; transform: translate(-50%, 6px); opacity: 0; display: flex; align-items: center; gap: 2px; padding: 4px; border-radius: 12px;
  background: color-mix(in srgb, var(--a-ground) 82%, transparent); -webkit-backdrop-filter: blur(16px) saturate(1.5); backdrop-filter: blur(16px) saturate(1.5);
  transition: opacity .25s, transform .35s cubic-bezier(.22,1,.36,1); }
/* Les outils se montrent quand on en a besoin : au survol, après un toucher, ou pendant le zoom. */
.dz-z:focus-within .dz-bar, .dz-z[data-bar="true"] .dz-bar, .dz-z[data-zoomed="true"] .dz-bar { opacity: 1; transform: translate(-50%, 0); }
@media (hover: hover) { .dz-z:hover .dz-bar { opacity: 1; transform: translate(-50%, 0); } }
.dz-bar { pointer-events: none; } .dz-z:hover .dz-bar, .dz-z[data-bar="true"] .dz-bar, .dz-z[data-zoomed="true"] .dz-bar, .dz-z:focus-within .dz-bar { pointer-events: auto; }
.dz-bar button { all: unset; box-sizing: border-box; height: 32px; min-width: 32px; padding: 0 8px; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  color: var(--a-t2); font-family: inherit; font-size: 12.5px; font-variant-numeric: tabular-nums; transition: color .15s, transform .25s cubic-bezier(.22,1,.36,1); }
.dz-bar button:hover:not(:disabled) { color: var(--a-t1); transform: translateY(-1px); }
.dz-bar button:disabled { opacity: .35; cursor: default; }
.dz-bar button:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 1px; }
.dz-check { all: unset; box-sizing: border-box; cursor: pointer; display: flex; gap: 12px; align-items: flex-start; padding: 9px 2px; font-size: 13.5px; line-height: 1.45; color: var(--a-t2); transition: color .15s; }
.dz-check:hover { color: var(--a-t1); }
.dz-check[data-on="true"] { color: var(--a-t1); }
.dz-check > span:first-child { width: 20px; height: 20px; border-radius: 99px; flex-shrink: 0; margin-top: 0; display: flex; align-items: center; justify-content: center;
  box-shadow: inset 0 0 0 1.5px var(--a-bd); transition: background .2s, box-shadow .2s, transform .25s cubic-bezier(.34,1.56,.64,1); }
.dz-check[data-on="true"] > span:first-child { background: var(--a-t1); color: var(--a-bg); box-shadow: none; transform: scale(1.05); }
.dz-check:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 2px; border-radius: 8px; }
@media (prefers-reduced-motion: reduce) { .dz-stage, .dz-bar, .dz-check > span:first-child { animation: none; transition: none; } }
`;

// Liens signés mis en mémoire le temps de la page (ils valent 5 minutes).
const urls = new Map<string, Promise<string | null>>();
function useDocUrl(path: string | null | undefined, load: (p: string) => Promise<string | null>) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ok" | "error">(path ? "loading" : "idle");
  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (!path) { setState("idle"); return; }
    setState("loading");
    if (!urls.has(path)) {
      const p = load(path);
      urls.set(path, p);
      window.setTimeout(() => urls.delete(path), 4 * 60_000);
    }
    urls.get(path)!.then((u) => { if (alive) { setUrl(u); setState(u ? "ok" : "error"); } });
    return () => { alive = false; };
  }, [path, load]);
  return { url, state };
}

const isPdf = (p?: string | null) => /\.pdf($|\?)/i.test(p ?? "");
const spinner = <Loader2 style={{ width: 20, height: 20, color: C.t3, animation: "spin 1s linear infinite" }} />;

function Pdf({ url }: { url: string }) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(url).then((r) => r.arrayBuffer()).then((b) => { if (alive) setBytes(new Uint8Array(b)); }).catch(() => {});
    return () => { alive = false; };
  }, [url]);
  if (!bytes) return spinner;
  return <div style={{ position: "absolute", inset: 0, padding: 16, overflowY: "auto" }}><PdfPages data={bytes} /></div>;
}

/* ─── Une image qu'on examine : zoom au point visé, déplacement, rotation ─── */
const MAX_ZOOM = 6;
const PAD = 48;
type Tf = { s: number; x: number; y: number; r: number };
const REST: Tf = { s: 1, x: 0, y: 0, r: 0 };

function ZoomImage({ src, alt, onExpand }: { src: string; alt: string; onExpand?: () => void }) {
  const box = useRef<HTMLDivElement | null>(null);
  const [t, setT] = useState<Tf>(REST);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [moving, setMoving] = useState(false);
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const last = useRef<{ x: number; y: number; d: number } | null>(null);
  // Un toucher bref (sans glisser) montre ou cache les outils.
  const [bar, setBar] = useState(false);
  const tap = useRef<{ x: number; y: number; t: number } | null>(null);

  useEffect(() => { setT(REST); }, [src]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Point (relatif au centre) qui reste immobile pendant le zoom.
  const zoomAt = useCallback((factor: number, px = 0, py = 0) => setT((p) => {
    const s = Math.min(MAX_ZOOM, Math.max(1, p.s * factor));
    if (s === 1) return { ...p, s: 1, x: 0, y: 0 };
    const k = s / p.s;
    return { ...p, s, x: px - k * (px - p.x), y: py - k * (py - p.y) };
  }), []);
  const local = (cx: number, cy: number) => {
    const b = box.current!.getBoundingClientRect();
    return [cx - b.left - b.width / 2, cy - b.top - b.height / 2] as const;
  };

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const [x, y] = local(e.clientX, e.clientY);
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025)), x, y);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [zoomAt]);

  const down = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest(".dz-bar")) return;
    box.current!.setPointerCapture(e.pointerId);
    tap.current = ptrs.current.size === 0 ? { x: e.clientX, y: e.clientY, t: e.timeStamp } : null;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    last.current = null;
    setMoving(true);
  };
  const move = (e: React.PointerEvent) => {
    if (!ptrs.current.has(e.pointerId)) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...ptrs.current.values()];
    const mx = pts.reduce((n, p) => n + p.x, 0) / pts.length;
    const my = pts.reduce((n, p) => n + p.y, 0) / pts.length;
    const d = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    const prev = last.current;
    last.current = { x: mx, y: my, d };
    if (!prev) return;
    if (d && prev.d) { const [x, y] = local(mx, my); zoomAt(d / prev.d, x, y); }
    setT((p) => (p.s > 1 ? { ...p, x: p.x + mx - prev.x, y: p.y + my - prev.y } : p));
  };
  const up = (e: React.PointerEvent) => {
    const t0 = tap.current;
    if (t0 && e.pointerType !== "mouse" && e.timeStamp - t0.t < 300 && Math.hypot(e.clientX - t0.x, e.clientY - t0.y) < 8) setBar((v) => !v);
    tap.current = null;
    ptrs.current.delete(e.pointerId);
    last.current = null;
    if (ptrs.current.size === 0) setMoving(false);
  };
  const dbl = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".dz-bar")) return;
    if (t.s > 1) { setT((p) => ({ ...p, s: 1, x: 0, y: 0 })); return; }
    const [x, y] = local(e.clientX, e.clientY);
    zoomAt(2.5, x, y);
  };

  // Une photo tournée d'un quart de tour garde toute la place disponible.
  const turned = t.r % 180 !== 0;
  const fitW = Math.max(0, (turned ? size.h : size.w) - PAD);
  const fitH = Math.max(0, (turned ? size.w : size.h) - PAD);
  const zoomed = t.s > 1;

  return (
    <div ref={box} className="dz-z" data-zoomed={zoomed} data-bar={bar} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onDoubleClick={dbl}
      style={{ cursor: zoomed ? (moving ? "grabbing" : "grab") : "zoom-in" }}>
      <img src={src} alt={alt} draggable={false}
        style={{ maxWidth: fitW, maxHeight: fitH, transform: `translate(${t.x}px, ${t.y}px) scale(${t.s}) rotate(${t.r}deg)`,
          transition: moving ? "none" : "transform .35s cubic-bezier(.22,1,.36,1)" }} />
      <div className="dz-bar" onDoubleClick={(e) => e.stopPropagation()}>
        <button type="button" aria-label="Dézoomer" disabled={!zoomed} onClick={() => zoomAt(1 / 1.5)}><Minus style={{ width: 15, height: 15 }} /></button>
        <button type="button" aria-label="Taille d'origine" onClick={() => setT((p) => ({ ...p, s: 1, x: 0, y: 0 }))} style={{ minWidth: 52 }}>{Math.round(t.s * 100)} %</button>
        <button type="button" aria-label="Zoomer" disabled={t.s >= MAX_ZOOM} onClick={() => zoomAt(1.5)}><Plus style={{ width: 15, height: 15 }} /></button>
        <button type="button" aria-label="Pivoter" onClick={() => setT((p) => ({ ...p, r: (p.r + 90) % 360, x: 0, y: 0 }))}><RotateCw style={{ width: 15, height: 15 }} /></button>
        {onExpand && <button type="button" aria-label="Plein écran" onClick={onExpand}><Maximize2 style={{ width: 14, height: 14 }} /></button>}
      </div>
    </div>
  );
}

/** Un document sur la table : image à examiner, PDF à faire défiler, ou ce qui manque. */
function Frame({ doc, load, onExpand }: { doc: DossierDoc; load: (p: string) => Promise<string | null>; onExpand: (url: string) => void }) {
  const { url, state } = useDocUrl(doc.path, load);
  return (
    <div className="dz-stage">
      {state === "idle" && <span style={{ display: "grid", justifyItems: "center", gap: 8, fontSize: 13.5, color: C.t3 }}><FileText style={{ width: 22, height: 22 }} strokeWidth={1.5} />{doc.label} · non fourni</span>}
      {state === "loading" && spinner}
      {state === "error" && <span style={{ fontSize: 13.5, color: C.t3 }}>Document indisponible</span>}
      {state === "ok" && url && (isPdf(doc.path) ? <Pdf url={url} /> : <ZoomImage src={url} alt={doc.label} onExpand={() => onExpand(url)} />)}
    </div>
  );
}

export function DocViewer({ docs, load, empty, compare, view, onView }: {
  docs: DossierDoc[]; load: (p: string) => Promise<string | null>; empty?: React.ReactNode;
  compare?: DossierCompare;
  /** Vue affichée (clé d'un document ou COMPARE) : le parent peut la piloter. */
  view?: string; onView?: (v: string) => void;
}) {
  const has = (k: string) => !!docs.find((d) => d.key === k)?.path;
  const canCompare = !!compare && has(compare.a) && has(compare.b);
  const firstView = canCompare ? COMPARE : docs.find((d) => d.path)?.key ?? docs[0]?.key ?? "";
  const [inner, setInner] = useState(firstView);
  const sig = docs.map((d) => d.path ?? "").join("|");
  useEffect(() => { setInner(firstView); /* nouveau dossier */ }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const keysSig = docs.map((d) => d.key).join("|");
  const views = useMemo(() => [...(canCompare ? [COMPARE] : []), ...keysSig.split("|").filter(Boolean)], [canCompare, keysSig]);
  const cur = view && views.includes(view) ? view : views.includes(inner) ? inner : firstView;
  const go = useCallback((v: string) => { setInner(v); onView?.(v); }, [onView]);
  const [full, setFull] = useState<{ url: string; label: string } | null>(null);

  // Flèches pour passer d'une vue à l'autre, chiffres pour y aller directement.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (full || e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement)?.closest("input, textarea, [contenteditable]")) return;
      const i = views.indexOf(cur);
      if (e.key === "ArrowRight" && i < views.length - 1) go(views[i + 1]);
      if (e.key === "ArrowLeft" && i > 0) go(views[i - 1]);
      const n = Number(e.key);
      if (n >= 1 && n <= views.length) go(views[n - 1]);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [views, cur, go, full]);
  useEffect(() => {
    if (!full) return;
    const on = (e: KeyboardEvent) => { if (e.key === "Escape") setFull(null); };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [full]);

  if (!docs.some((d) => d.path) && empty) return <>{empty}</>;
  const byKey = (k: string) => docs.find((d) => d.key === k)!;
  const expand = (d: DossierDoc) => (url: string) => setFull({ url, label: d.label });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, height: "100%", minHeight: 0, fontFamily: FONT }}>
      <style>{DOSSIER_CSS}</style>
      {views.length > 1 && (
        <div style={{ padding: "2px 6px 0" }}>
          <FilterChips value={cur} onChange={go} options={views.map((v) => ({
            id: v,
            label: v === COMPARE ? compare!.label : <span style={{ opacity: byKey(v).path ? 1 : 0.5 }}>{byKey(v).label}</span>,
          }))} />
        </div>
      )}
      {cur === COMPARE ? (
        <div className="dz-pair" key={COMPARE}>
          {[compare!.a, compare!.b].map((k) => <Frame key={k} doc={byKey(k)} load={load} onExpand={expand(byKey(k))} />)}
        </div>
      ) : cur ? (
        <Frame key={cur} doc={byKey(cur)} load={load} onExpand={expand(byKey(cur))} />
      ) : null}
      {full && createPortal(
        <div role="dialog" aria-label={full.label} style={{ position: "fixed", inset: 0, zIndex: 2147483600, background: "rgba(8,8,10,0.96)", fontFamily: FONT, animation: "dz-in .3s ease both" }}>
          <style>{DOSSIER_CSS}</style>
          <ZoomImage src={full.url} alt={full.label} />
          <span style={{ position: "absolute", top: "calc(22px + env(safe-area-inset-top, 0px))", left: 20, color: "rgba(255,255,255,0.85)", fontSize: 14 }}>{full.label}</span>
          <button type="button" aria-label="Fermer" onClick={() => setFull(null)} style={{ position: "absolute", top: "calc(14px + env(safe-area-inset-top, 0px))", right: 16, width: 40, height: 40, borderRadius: 99, border: "none", background: "rgba(255,255,255,0.12)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}

/** Informations en grille aérée : libellé discret au-dessus, valeur en dessous ; aucun trait. */
export function Facts({ items, cols = 2 }: { items: [string, React.ReactNode][]; cols?: number }) {
  return (
    <dl style={{ margin: 0, display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: "18px 20px" }}>
      {items.map(([k, v]) => (
        <div key={k} style={{ minWidth: 0 }}>
          <dt style={{ fontSize: 12, color: C.t3 }}>{k}</dt>
          <dd style={{ margin: "4px 0 0", fontSize: 14, lineHeight: 1.4, color: C.t1, overflowWrap: "anywhere", fontVariantNumeric: "tabular-nums" }}>{v || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Section({ title, hint, children, first }: { title: string; hint?: React.ReactNode; children: React.ReactNode; first?: boolean }) {
  return (
    <section style={{ marginTop: first ? 0 : 30 }}>
      <h3 style={{ margin: 0, fontSize: 11, fontWeight: 500, letterSpacing: ".1em", textTransform: "uppercase", color: C.t3 }}>{title}</h3>
      {hint && <p style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.5, color: C.t3 }}>{hint}</p>}
      <div style={{ marginTop: 12 }}>{children}</div>
    </section>
  );
}

export function Checklist({ items, value, onChange, focus }: {
  items: string[]; value: boolean[]; onChange: (v: boolean[]) => void;
  /** Points concernés par le document affiché : les autres s'effacent un peu. */
  focus?: boolean[];
}) {
  return (
    <div style={{ display: "grid" }}>
      <style>{DOSSIER_CSS}</style>
      {items.map((c, i) => (
        <button key={c} type="button" role="checkbox" aria-checked={value[i]} className="dz-check" data-on={value[i]} style={{ opacity: focus && !focus[i] && !value[i] ? 0.45 : 1, transition: "opacity .3s, color .15s" }}
          onClick={() => onChange(value.map((x, j) => (j === i ? !x : x)))}>
          <span>{value[i] && <Check style={{ width: 12, height: 12 }} strokeWidth={3} />}</span>
          <span>{c}</span>
        </button>
      ))}
    </div>
  );
}
