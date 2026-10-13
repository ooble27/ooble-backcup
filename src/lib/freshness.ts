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

  // Retour sur l'app : on vérifie, et on recharge tout de suite si une version attend (rien n'est en cours de saisie).
  const onVisible = async () => {
    if (document.visibilityState !== "visible") return;
    await check();
    if (pending) reload();
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
