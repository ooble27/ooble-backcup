import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronLeft, ChevronRight, FileText, Loader2, Maximize2, X } from "lucide-react";
import { C, FONT } from "./adminTheme";
import PdfPages from "./PdfPages";

/**
 * Briques d'un dossier de vérification (identité, entreprise) :
 *  - DocViewer : le document en grand, sur une table lumineuse, et les autres en vignettes dessous ;
 *  - Facts : les informations en grille aérée, sans traits ;
 *  - Checklist : les points à contrôler, cochés d'un rond ;
 *  - Section : un titre de bloc discret.
 */

export interface DossierDoc { key: string; label: string; path: string | null | undefined }

const DOSSIER_CSS = `
.dz-stage { position: relative; flex: 1; min-height: 0; border-radius: 18px; background: var(--a-l2); overflow: hidden; display: flex; align-items: center; justify-content: center; }
.dz-stage img { max-width: calc(100% - 40px); max-height: calc(100% - 40px); object-fit: contain; border-radius: 6px; cursor: zoom-in; animation: dz-in .35s cubic-bezier(.22,1,.36,1); }
@keyframes dz-in { from { opacity: 0; transform: scale(.985); } to { opacity: 1; transform: none; } }
.dz-nav { position: absolute; top: 50%; margin-top: -20px; width: 40px; height: 40px; border-radius: 99px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;
  background: var(--a-l1); color: var(--a-t1); box-shadow: 0 0 0 1px var(--a-bds); transition: opacity .2s, transform .2s; }
.dz-nav:active { transform: scale(.94); }
.dz-nav[disabled] { opacity: 0; pointer-events: none; }
.dz-zoom { position: absolute; top: 12px; right: 12px; height: 34px; padding: 0 12px; border-radius: 99px; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
  background: var(--a-l1); color: var(--a-t2); box-shadow: 0 0 0 1px var(--a-bds); font-family: inherit; font-size: 12.5px; }
.dz-strip { display: flex; gap: 10px; overflow-x: auto; padding: 14px 2px 2px; }
.dz-thumb { all: unset; box-sizing: border-box; cursor: pointer; flex: 0 0 auto; width: 132px; display: grid; gap: 7px; }
.dz-thumb > span:first-child { height: 76px; border-radius: 12px; background: var(--a-l2); overflow: hidden; display: flex; align-items: center; justify-content: center; color: var(--a-t3);
  box-shadow: inset 0 0 0 1px var(--a-bds); transition: box-shadow .2s, transform .25s cubic-bezier(.22,1,.36,1); }
.dz-thumb:hover > span:first-child { transform: translateY(-2px); }
.dz-thumb[data-on="true"] > span:first-child { box-shadow: inset 0 0 0 2px var(--a-t1); }
.dz-thumb img { width: 100%; height: 100%; object-fit: cover; }
.dz-thumb:focus-visible > span:first-child { box-shadow: inset 0 0 0 2px var(--a-accent); }
.dz-check { all: unset; box-sizing: border-box; cursor: pointer; display: flex; gap: 12px; align-items: flex-start; padding: 9px 2px; font-size: 13.5px; line-height: 1.45; color: var(--a-t2); transition: color .15s; }
.dz-check:hover { color: var(--a-t1); }
.dz-check[data-on="true"] { color: var(--a-t1); }
.dz-check > span:first-child { width: 20px; height: 20px; border-radius: 99px; flex-shrink: 0; margin-top: 0; display: flex; align-items: center; justify-content: center;
  box-shadow: inset 0 0 0 1.5px var(--a-bd); transition: background .2s, box-shadow .2s, transform .25s cubic-bezier(.34,1.56,.64,1); }
.dz-check[data-on="true"] > span:first-child { background: var(--a-t1); color: var(--a-bg); box-shadow: none; transform: scale(1.05); }
.dz-check:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 2px; border-radius: 8px; }
@media (prefers-reduced-motion: reduce) { .dz-stage img, .dz-thumb > span:first-child, .dz-check > span:first-child { animation: none; transition: none; } }
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

function Pdf({ url }: { url: string }) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(url).then((r) => r.arrayBuffer()).then((b) => { if (alive) setBytes(new Uint8Array(b)); }).catch(() => {});
    return () => { alive = false; };
  }, [url]);
  if (!bytes) return <Loader2 style={{ width: 20, height: 20, color: C.t3, animation: "spin 1s linear infinite" }} />;
  return <div style={{ position: "absolute", inset: 0, padding: 16, overflowY: "auto" }}><PdfPages data={bytes} /></div>;
}

function Thumb({ doc, on, onClick, load }: { doc: DossierDoc; on: boolean; onClick: () => void; load: (p: string) => Promise<string | null> }) {
  const { url, state } = useDocUrl(isPdf(doc.path) ? null : doc.path, load);
  return (
    <button type="button" className="dz-thumb" data-on={on} onClick={onClick} aria-pressed={on} aria-label={doc.label}>
      <span>
        {url ? <img src={url} alt="" /> : state === "loading" ? <Loader2 style={{ width: 15, height: 15, animation: "spin 1s linear infinite" }} /> : <FileText style={{ width: 18, height: 18 }} strokeWidth={1.6} />}
      </span>
      <span style={{ fontSize: 12, lineHeight: 1.3, color: on ? C.t1 : doc.path ? C.t2 : C.t3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {doc.label}{!doc.path && " · non fourni"}
      </span>
    </button>
  );
}

export function DocViewer({ docs, load, empty }: { docs: DossierDoc[]; load: (p: string) => Promise<string | null>; empty?: React.ReactNode }) {
  const first = Math.max(0, docs.findIndex((d) => d.path));
  const [i, setI] = useState(first);
  const [zoom, setZoom] = useState(false);
  const sig = docs.map((d) => d.path ?? "").join("|");
  useEffect(() => { setI(Math.max(0, docs.findIndex((d) => d.path))); /* nouveau dossier */ }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const doc = docs[i];
  const { url, state } = useDocUrl(doc?.path, load);
  const pdf = isPdf(doc?.path);

  // Flèches du clavier pour passer d'un document à l'autre.
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (zoom || (e.target as HTMLElement)?.closest("input, textarea")) return;
      if (e.key === "ArrowRight") setI((v) => Math.min(docs.length - 1, v + 1));
      if (e.key === "ArrowLeft") setI((v) => Math.max(0, v - 1));
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [docs.length, zoom]);

  if (!docs.some((d) => d.path) && empty) return <>{empty}</>;

  return (
    <div ref={box} style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, fontFamily: FONT }}>
      <style>{DOSSIER_CSS}</style>
      <div className="dz-stage">
        {state === "idle" && <span style={{ fontSize: 13.5, color: C.t3 }}>{doc?.label} · non fourni</span>}
        {state === "loading" && <Loader2 style={{ width: 22, height: 22, color: C.t3, animation: "spin 1s linear infinite" }} />}
        {state === "error" && <span style={{ fontSize: 13.5, color: C.t3 }}>Document indisponible</span>}
        {state === "ok" && url && (pdf ? <Pdf url={url} /> : <img key={url} src={url} alt={doc.label} onClick={() => setZoom(true)} />)}
        {state === "ok" && url && !pdf && (
          <button type="button" className="dz-zoom" onClick={() => setZoom(true)}><Maximize2 style={{ width: 13, height: 13 }} />Agrandir</button>
        )}
        {docs.length > 1 && (
          <>
            <button type="button" className="dz-nav" style={{ left: 12 }} disabled={i === 0} aria-label="Document précédent" onClick={() => setI(i - 1)}><ChevronLeft style={{ width: 18, height: 18 }} /></button>
            <button type="button" className="dz-nav" style={{ right: 12 }} disabled={i === docs.length - 1} aria-label="Document suivant" onClick={() => setI(i + 1)}><ChevronRight style={{ width: 18, height: 18 }} /></button>
          </>
        )}
      </div>
      {docs.length > 1 && (
        <div className="dz-strip" role="group" aria-label="Documents du dossier">
          {docs.map((d, k) => <Thumb key={d.key} doc={d} on={k === i} onClick={() => setI(k)} load={load} />)}
        </div>
      )}
      {zoom && url && createPortal(
        <div onClick={() => setZoom(false)} style={{ position: "fixed", inset: 0, zIndex: 2147483600, background: "rgba(8,8,10,0.96)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out", fontFamily: FONT }}>
          <img src={url} alt={doc.label} style={{ maxWidth: "94vw", maxHeight: "90vh", objectFit: "contain" }} />
          <span style={{ position: "absolute", top: "calc(22px + env(safe-area-inset-top, 0px))", left: 20, color: "rgba(255,255,255,0.85)", fontSize: 14 }}>{doc.label}</span>
          <button type="button" aria-label="Fermer" onClick={() => setZoom(false)} style={{ position: "absolute", top: "calc(14px + env(safe-area-inset-top, 0px))", right: 16, width: 40, height: 40, borderRadius: 99, border: "none", background: "rgba(255,255,255,0.12)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
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

export function Checklist({ items, value, onChange }: { items: string[]; value: boolean[]; onChange: (v: boolean[]) => void }) {
  return (
    <div style={{ display: "grid" }}>
      <style>{DOSSIER_CSS}</style>
      {items.map((c, i) => (
        <button key={c} type="button" role="checkbox" aria-checked={value[i]} className="dz-check" data-on={value[i]}
          onClick={() => onChange(value.map((x, j) => (j === i ? !x : x)))}>
          <span>{value[i] && <Check style={{ width: 12, height: 12 }} strokeWidth={3} />}</span>
          <span>{c}</span>
        </button>
      ))}
    </div>
  );
}
