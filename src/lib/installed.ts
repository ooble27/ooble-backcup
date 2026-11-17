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
