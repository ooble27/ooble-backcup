/**
 * Toujours la dernière version du site.
 *
 * L'app est une page unique : une fois ouverte (surtout installée sur l'écran d'accueil d'un iPad
 * ou d'un iPhone), elle garde en mémoire le code chargé à l'ouverture, même après une publication,
 * même quand on change de compte. Ici, on compare régulièrement le numéro de la version chargée
 * à celui de /version.json ; s'il a changé, l'app se recharge d'elle-même, au bon moment :
 *  - dès qu'on revient sur l'app (onglet ou app remis au premier plan) ;
 *  - au prochain changement de page ;
 *  - ou après une minute sans saisie, jamais au milieu d'une frappe.
 */

const CHECK_EVERY = 3 * 60_000;
const IDLE_BEFORE_RELOAD = 60_000;
const LONG_AWAY = 5 * 60_000;

let pending = false;
let lastInput = Date.now();

async function latestId(): Promise<string | null> {
  try {
    const r = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return null;
    return ((await r.json()) as { id?: string }).id ?? null;
  } catch {
    return null; // hors ligne : on réessaiera
  }
}

// Garde-fou : une seule tentative par version (si un cache réseau servait encore l'ancienne page,
// on ne recharge pas en boucle).
const TRIED = "ooble.freshness.tried";
let target: string | null = null;
const reload = () => {
  try { if (target) sessionStorage.setItem(TRIED, target); } catch { /* stockage indisponible */ }
  window.location.reload();
};

async function check() {
  if (pending) return;
  const id = await latestId();
  if (!id || id === __BUILD_ID__) return;
  let tried: string | null = null;
  try { tried = sessionStorage.getItem(TRIED); } catch { /* stockage indisponible */ }
  if (tried === id) return;
  target = id;
  pending = true;
}

export function startFreshnessCheck() {
  if (import.meta.env.DEV || typeof window === "undefined") return;

  // Fichier de l'ancienne version introuvable après une publication (page gardée en mémoire) : on
  // recharge une fois sur la nouvelle version au lieu de laisser un écran vide.
  window.addEventListener("vite:preloadError", (e) => {
    const KEY = "ooble.freshness.preload";
    let done: string | null = null;
    try { done = sessionStorage.getItem(KEY); } catch { /* stockage indisponible */ }
    if (done === __BUILD_ID__) return;
    try { sessionStorage.setItem(KEY, __BUILD_ID__); } catch { /* stockage indisponible */ }
    e.preventDefault();
    window.location.reload();
  });

  // Retour sur l'app : on vérifie, et on recharge tout de suite si une version attend (rien n'est en cours de saisie).
  // Après une longue absence, le back-office reste masqué le temps de cette vérification : on ne revoit jamais
  // une ancienne version s'afficher une seconde avant le rechargement.
  let hiddenAt = 0;
  const onVisible = async () => {
    if (document.visibilityState !== "visible") { hiddenAt = Date.now(); return; }
    const veil = hiddenAt > 0 && Date.now() - hiddenAt > LONG_AWAY && location.pathname.startsWith("/admin");
    // Le voile ne reste jamais : si le rechargement n'aboutit pas (app installée sur iPhone qui l'ignore,
    // service worker qui recharge en même temps), l'écran réapparaît au bout de 3 secondes.
    if (veil) {
      document.documentElement.style.visibility = "hidden";
      window.setTimeout(() => { document.documentElement.style.visibility = ""; }, 3000);
    }
    // Le navigateur revérifie aussi le service worker : s'il a changé, il recharge les vieilles fenêtres du back-office.
    void navigator.serviceWorker?.getRegistration().then((r) => r?.update()).catch(() => undefined);
    await Promise.race([check(), new Promise((r) => window.setTimeout(r, 2500))]);
    if (pending) { reload(); return; }
    if (veil) document.documentElement.style.visibility = "";
  };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("pageshow", (e) => { if ((e as PageTransitionEvent).persisted) void onVisible(); });

  // Changement de page dans l'app : on fait une vraie navigation si une version attend.
  for (const fn of ["pushState", "replaceState"] as const) {
    const orig = history[fn].bind(history);
    history[fn] = ((state: unknown, title: string, url?: string | URL | null) => {
      if (pending && fn === "pushState" && url) { window.location.assign(String(url)); return; }
      orig(state, title, url);
    }) as History[typeof fn];
  }

  // Écran ouvert longtemps : on recharge après une minute sans saisie.
  for (const ev of ["pointerdown", "keydown", "input"]) window.addEventListener(ev, () => { lastInput = Date.now(); }, { passive: true, capture: true });
  window.setInterval(() => {
    if (document.visibilityState === "visible") void check();
  }, CHECK_EVERY);
  window.setInterval(() => {
    const a = document.activeElement;
    const typing = a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || (a instanceof HTMLElement && a.isContentEditable);
    if (pending && !typing && Date.now() - lastInput > IDLE_BEFORE_RELOAD) reload();
  }, 15_000);

  void check();
}

/** Date de la version en cours, lisible : « 13 oct. à 19 h 42 ». */
export const versionLabel = () => {
  const d = new Date(__BUILD_TIME__);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("fr-CA", { day: "numeric", month: "short" })} à ${d.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })}`;
};
