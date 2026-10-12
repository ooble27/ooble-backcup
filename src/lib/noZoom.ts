import { useEffect } from "react";

/**
 * Pas de zoom dans le back-office (pincement, double tap, Ctrl/⌘ + molette ou +/−, zoom automatique
 * d'iOS sur les champs) : un zoom faisait déborder les pages, sur ordinateur comme sur téléphone.
 */
export function useNoZoom() {
  useEffect(() => {
    const vp = document.querySelector('meta[name="viewport"]');
    const prev = vp?.getAttribute("content") ?? null;
    vp?.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover");
    const html = document.documentElement;
    const prevTouch = html.style.touchAction;
    html.style.touchAction = "pan-x pan-y";
    const stop = (e: Event) => e.preventDefault();
    const wheel = (e: WheelEvent) => { if (e.ctrlKey || e.metaKey) e.preventDefault(); };
    const keys = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && ["+", "-", "=", "_", "0"].includes(e.key)) e.preventDefault(); };
    const pinch = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault(); };
    document.addEventListener("gesturestart", stop, { passive: false });
    document.addEventListener("gesturechange", stop, { passive: false });
    document.addEventListener("touchmove", pinch, { passive: false });
    window.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("keydown", keys);
    return () => {
      if (vp && prev !== null) vp.setAttribute("content", prev);
      html.style.touchAction = prevTouch;
      document.removeEventListener("gesturestart", stop);
      document.removeEventListener("gesturechange", stop);
      document.removeEventListener("touchmove", pinch);
      window.removeEventListener("wheel", wheel);
      window.removeEventListener("keydown", keys);
    };
  }, []);
}
