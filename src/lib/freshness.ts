/**
 * Toujours la dernière version du site.
 *
 * L'app est une page unique : une fois ouverte (surtout installée sur l'écran d'accueil d'un iPad
 * ou d'un iPhone), elle garde en mémoire le code chargé à l'ouverture, même après une publication,
 * même quand on change de compte. Ici, on compare régulièrement le numéro de la version chargée
 * à celui de /version.json ; s'il a changé, l'app se recharge d'elle-même, au bon moment :
 *  - dès qu'on revient sur l'app (onglet ou app remis au premier plan) ;
 *  - au prochain changement de page ;
 *  - ou après 20 secondes sans saisie, jamais au milieu d'une frappe (vérification toutes les 45 secondes).
 */

const CHECK_EVERY = 45_000;
const IDLE_BEFORE_RELOAD = 20_000;

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

// Garde-fou : trois tentatives au plus par version, espacées d'une minute. Juste après une publication,
// le réseau peut encore servir l'ancienne page quelques instants : on réessaie au lieu de rester bloqué,
// sans jamais recharger en boucle.
const TRIED = "ooble.freshness.tried";
const MAX_TRIES = 3, RETRY_AFTER = 60_000;
let target: string | null = null;
type Tried = { id: string; n: number; at: number };
const readTried = (): Tried | null => {
  try { const v = JSON.parse(sessionStorage.getItem(TRIED) || "null"); return v && typeof v.id === "string" ? v as Tried : null; } catch { return null; }
};
const reload = () => {
  const prev = readTried();
  try { if (target) sessionStorage.setItem(TRIED, JSON.stringify({ id: target, n: prev && prev.id === target ? prev.n + 1 : 1, at: Date.now() })); } catch { /* stockage indisponible */ }
  // Adresse légèrement différente : le navigateur redemande la page au lieu de reprendre sa copie en mémoire.
  const u = new URL(window.location.href); u.searchParams.set("v", target ?? String(Date.now()));
  window.location.replace(u.toString());
};

async function check() {
  if (pending) return;
  const id = await latestId();
  if (!id || id === __BUILD_ID__) return;
  const tried = readTried();
  if (tried && tried.id === id && (tried.n >= MAX_TRIES || Date.now() - tried.at < RETRY_AFTER)) return;
  target = id;
  pending = true;
}

export function startFreshnessCheck() {
  if (import.meta.env.DEV || typeof window === "undefined") return;

  // Après un rechargement forcé, on retire le petit paramètre « v » de l'adresse.
  try {
    const u = new URL(window.location.href);
    if (u.searchParams.has("v")) { u.searchParams.delete("v"); history.replaceState(history.state, "", u.pathname + u.search + u.hash); }
  } catch { /* adresse inhabituelle : on laisse tel quel */ }

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
  // L'écran n'est jamais masqué pendant ce temps : sur l'app installée d'un iPhone, un rechargement qui
  // n'aboutit pas laissait un écran noir. Au pire, l'ancienne version reste visible un instant.
  const onVisible = async () => {
    if (document.visibilityState !== "visible") return;
    // Le navigateur revérifie aussi le service worker : s'il a changé, il recharge les vieilles fenêtres du back-office.
    void navigator.serviceWorker?.getRegistration().then((r) => r?.update()).catch(() => undefined);
    await Promise.race([check(), new Promise((r) => window.setTimeout(r, 2500))]);
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

  // Écran ouvert longtemps : on recharge après 20 secondes sans saisie.
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
