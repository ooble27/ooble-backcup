import { useEffect } from "react";

/** L'app est-elle ouverte depuis l'écran d'accueil (app installée), et non dans un onglet du navigateur ? */
export function isInstalledApp(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  try {
    return nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  } catch {
    return false;
  }
}

const ONBOARDED = "ooble.onboarded";
/** Les écrans d'accueil ne s'affichent qu'une fois par appareil. */
export const hasOnboarded = () => {
  try {
    if (localStorage.getItem(ONBOARDED) === "1") return true;
    // Déjà connecté un jour sur cet appareil (session Supabase gardée) : pas besoin de présenter Ooble.
    return Object.keys(localStorage).some((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
  } catch { return true; }
};
export const markOnboarded = () => { try { localStorage.setItem(ONBOARDED, "1"); } catch { /* stockage indisponible */ } };

/**
 * Peint toute la page (html, body, barre d'état) d'une couleur tant que l'écran est affiché, puis rend
 * l'ancienne couleur. Sinon le fond de l'app (sombre ou clair) apparaît au-dessus de l'écran, sous la
 * barre d'état ou quand le clavier fait remonter la page sur iPhone.
 */
export function paintPage(color: string): () => void {
  const html = document.documentElement, body = document.body;
  const meta = document.querySelector('meta[name="theme-color"]');
  const prev = { html: html.style.backgroundColor, body: body.style.backgroundColor, meta: meta?.getAttribute("content") ?? null };
  html.style.backgroundColor = color;
  body.style.backgroundColor = color;
  meta?.setAttribute("content", color);
  return () => {
    html.style.backgroundColor = prev.html;
    body.style.backgroundColor = prev.body;
    if (meta && prev.meta) meta.setAttribute("content", prev.meta);
  };
}

/** Couleurs du nouveau design : le jaune pour l'entrée (lancement, connexion), le neutre pour l'app. */
export const PAGE_COLORS = {
  yellow: "#fdd94e",
  neutral: "#f5f5f3",
  lavender: "#dccaff",
  coral: "#ff6a3d",
  mint: "#bfe8c8",
  sky: "#bfe0ff",
} as const;

export function pageColor(): string {
  // Toutes les pages de l'app ont le même fond neutre (le jaune et les couleurs pleines restent à l'entrée).
  return PAGE_COLORS.neutral;
}

/** Le nouveau design est toujours clair : la classe « dark » est retirée tant que l'écran est affiché. */
export function useLightTheme() {
  useEffect(() => {
    const h = document.documentElement;
    const had = h.classList.contains("dark");
    h.classList.remove("dark");
    return () => { if (had) h.classList.add("dark"); };
  }, []);
}
