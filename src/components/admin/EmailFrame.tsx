import { useEffect, useRef, useState } from "react";

/**
 * Courriel dans une iframe de largeur réelle (680 px « ordinateur », 390 px
 * « téléphone ») réduite pour tenir dans la colonne : les règles mobiles du
 * courriel ne se déclenchent qu'en vue téléphone, comme en vrai.
 */
export function ScaledFrame({ html, frameWidth, maxHeight, interactive = true, title, onHeight }: {
  html: string; frameWidth: number; maxHeight?: number; interactive?: boolean; title: string; onHeight?: (h: number, scale: number) => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(maxHeight ?? 1400);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = width > 0 ? Math.min(1, width / frameWidth) : 0;
  const measure = () => {
    const doc = frameRef.current?.contentDocument;
    if (doc?.documentElement) setHeight(doc.documentElement.scrollHeight);
  };
  useEffect(() => { if (scale) onHeight?.(height, scale); }, [height, scale, onHeight]);

  const shown = maxHeight ? Math.min(height, maxHeight) : height;
  return (
    <div ref={wrapRef} style={{ width: "100%", height: shown * scale, overflow: "hidden", position: "relative" }}>
      <iframe
        ref={frameRef}
        title={title}
        srcDoc={html}
        onLoad={measure}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        scrolling="no"
        tabIndex={interactive ? 0 : -1}
        style={{
          width: frameWidth, height, border: 0, display: "block",
          transform: `scale(${scale})`, transformOrigin: "top left",
          pointerEvents: interactive ? "auto" : "none",
          visibility: scale ? "visible" : "hidden",
        }}
      />
    </div>
  );
}
