import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X, ZoomIn } from "lucide-react";
import { C, FONT } from "./adminTheme";
import PdfPages from "./PdfPages";

/**
 * Document d'un dossier (photo ou PDF) affiché dans la page : lien signé
 * chargé à la demande, image cliquable pour l'agrandir, PDF rendu par pdf.js.
 */
export default function DocFrame({ label, path, load, height = 420 }: {
  label: string; path: string | null | undefined; load: (path: string) => Promise<string | null>; height?: number;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [zoom, setZoom] = useState(false);
  const isPdf = /\.pdf($|\?)/i.test(path ?? "");

  useEffect(() => {
    let alive = true;
    setUrl(null); setBytes(null);
    if (!path) { setState("idle"); return; }
    setState("loading");
    load(path).then(async (u) => {
      if (!alive) return;
      if (!u) { setState("error"); return; }
      if (isPdf) {
        try {
          const b = new Uint8Array(await (await fetch(u)).arrayBuffer());
          if (alive) { setBytes(b); setState("ok"); }
        } catch { if (alive) setState("error"); }
      } else { setUrl(u); setState("ok"); }
    });
    return () => { alive = false; };
  }, [path, load, isPdf]);

  return (
    <figure style={{ margin: 0, minWidth: 0 }}>
      <figcaption style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 13, color: C.t2 }}>
        <span style={{ flex: 1 }}>{label}</span>
        {url && <button type="button" onClick={() => setZoom(true)} style={{ all: "unset", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, color: C.t3 }}><ZoomIn style={{ width: 13, height: 13 }} />Agrandir</button>}
      </figcaption>
      <div style={{ height, borderRadius: 10, background: "#101012", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
        {state === "idle" && <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Non fourni</span>}
        {state === "loading" && <Loader2 style={{ width: 20, height: 20, color: "rgba(255,255,255,0.6)", animation: "spin 1s linear infinite" }} />}
        {state === "error" && <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Document indisponible</span>}
        {state === "ok" && url && (
          <img src={url} alt={label} onClick={() => setZoom(true)} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", cursor: "zoom-in" }} />
        )}
        {state === "ok" && bytes && <div style={{ position: "absolute", inset: 0, padding: 12 }}><PdfPages data={bytes} /></div>}
      </div>
      {zoom && url && createPortal(
        <div onClick={() => setZoom(false)} style={{ position: "fixed", inset: 0, zIndex: 2147483600, background: "rgba(8,8,10,0.96)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out", fontFamily: FONT }}>
          <img src={url} alt={label} style={{ maxWidth: "94vw", maxHeight: "92vh", objectFit: "contain" }} />
          <button type="button" aria-label="Fermer" onClick={() => setZoom(false)} style={{ position: "absolute", top: 16, right: 16, width: 40, height: 40, borderRadius: 99, border: "none", background: "rgba(255,255,255,0.12)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
          <span style={{ position: "absolute", top: 26, left: 20, color: "rgba(255,255,255,0.8)", fontSize: 14 }}>{label}</span>
        </div>,
        document.body,
      )}
    </figure>
  );
}
