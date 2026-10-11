import { useEffect, useRef, useState } from "react";

// PDF affiché page par page dans la visionneuse (fiable sur iPad, contrairement à un cadre).
// Version « legacy » de pdf.js : elle inclut les compléments JavaScript qui manquent à Safari.
export default function PdfPages({ data }: { data: Uint8Array }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;
    (async () => {
      try {
        const [pdfjs, worker] = await Promise.all([import("pdfjs-dist/legacy/build/pdf.mjs"), import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")]);
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const task = pdfjs.getDocument({ data: data.slice() });
        destroy = () => { task.destroy(); };
        const doc = await task.promise;
        const el = box.current;
        if (!el || cancelled) return;
        el.replaceChildren();
        const width = Math.min(el.clientWidth - 8, 900);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        for (let i = 1; i <= doc.numPages && !cancelled; i++) {
          const page = await doc.getPage(i);
          const viewport = page.getViewport({ scale: (width / page.getViewport({ scale: 1 }).width) * dpr });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          Object.assign(canvas.style, { width: `${width}px`, height: `${viewport.height / dpr}px`, background: "#fff", borderRadius: "4px", display: "block" });
          el.appendChild(canvas);
          await page.render({ canvas, viewport }).promise;
          if (i === 1) setState("ok");
        }
      } catch (e) {
        console.warn("Aperçu PDF impossible", e);
        if (!cancelled) setState("error");
      }
    })();
    return () => { cancelled = true; destroy?.(); };
  }, [data]);

  return (
    <div style={{ width: "100%", height: "100%", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
      {state === "loading" && <p style={{ textAlign: "center", marginTop: 40, fontSize: 13, color: "rgba(255,255,255,0.7)" }}>Ouverture du PDF…</p>}
      {state === "error" && <p style={{ textAlign: "center", marginTop: 40, fontSize: 13, color: "rgba(255,255,255,0.7)" }}>Aperçu impossible : utilisez « Télécharger ».</p>}
      <div ref={box} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, paddingBottom: 24 }} />
    </div>
  );
}
