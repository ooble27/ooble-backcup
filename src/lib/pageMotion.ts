/**
 * Mouvement des pages du back-office.
 *
 * replayRise : quand on change de période, de filtre ou de vue sans changer de page (« Mois dernier »,
 * « À répondre »…), les blocs de la page remontent en douceur l'un après l'autre, comme à l'arrivée
 * sur la page. Le groupe de filtres cliqué ne bouge pas ; ses voisins, si. Rien ne bouge pour qui a
 * demandé moins d'animations au système.
 *
 * scrollAdminTop : remonte en haut de la page, quel que soit l'élément qui défile (la zone de contenu
 * sur ordinateur, la fenêtre sur téléphone).
 *
 * Mémoire du défilement, comme dans les applications : on entre dans une page → en haut ; on en
 * ressort (bouton retour, fil d'Ariane, retour du navigateur) → exactement là où on était.
 * - enterView(clé) / returnTo(clé) : pour les vues sans adresse propre (une commande, une fiche client…) ;
 * - installScrollMemory() : pour les pages qui ont leur adresse (?tab=, ?reglage=…) — la position est
 *   notée à chaque changement d'adresse et rendue au retour (restoreFor).
 */
const EASE = "cubic-bezier(.22,1,.36,1)";
const RISE: Keyframe[] = [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }];

const reduced = () => typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);

function rise(el: Element, i: number) {
  if (!(el instanceof HTMLElement) || el.tagName === "STYLE" || el.tagName === "SCRIPT") return;
  el.animate?.(RISE, { duration: 520, easing: EASE, delay: Math.min(i, 6) * 55, fill: "backwards" });
}

/** Rejoue l'entrée des blocs de la page autour de `from` (l'élément cliqué). */
export function replayRise(from?: Element | null) {
  if (reduced()) return;
  const page = from?.closest(".sh-page") ?? document.querySelector(".sh-page");
  if (!page) return;
  // Descend jusqu'au groupe cliqué : les blocs voisins à chaque niveau sont animés, le groupe lui-même reste en place.
  let level: Element | null = page.firstElementChild;
  let i = 0;
  while (level) {
    let next: Element | null = null;
    for (const child of Array.from(level.children)) {
      if (from && child.contains(from)) {
        if (!child.matches("[data-still]")) next = child;
      } else rise(child, i++);
    }
    level = next;
  }
}

const scroller = () => document.querySelector<HTMLElement>("[data-admin-scroll]");
const currentY = () => Math.max(scroller()?.scrollTop ?? 0, window.scrollY);
const pageKey = () => `${window.location.pathname}${window.location.search}`;
const saved = new Map<string, number>();
let restoring = 0;

export function scrollAdminTop() {
  restoring++;
  scroller()?.scrollTo({ top: 0 });
  window.scrollTo({ top: 0 });
}

/** Revient à `y`, en attendant que la page soit assez longue (données qui arrivent) ; s'arrête si on fait défiler soi-même. */
function scrollBack(y: number) {
  const run = ++restoring;
  const until = performance.now() + 1500;
  const step = () => {
    if (run !== restoring) return;
    scroller()?.scrollTo({ top: y });
    window.scrollTo({ top: y });
    if (Math.abs(currentY() - y) > 2 && performance.now() < until) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
// Un geste de l'utilisateur annule le retour en cours.
if (typeof window !== "undefined") {
  for (const ev of ["wheel", "touchstart", "keydown"]) window.addEventListener(ev, () => { restoring++; }, { passive: true, capture: true });
}

/** On entre dans une vue : sa page d'origine note sa position, la vue s'ouvre en haut. */
export function enterView(key: string) {
  saved.set(`view:${key}`, currentY());
  scrollAdminTop();
}
/** On ressort d'une vue : la page d'origine reprend là où on l'avait laissée. */
export function returnTo(key: string) {
  const y = saved.get(`view:${key}`);
  if (y == null) scrollAdminTop(); else scrollBack(y);
}
/** Retour vers une page qui a son adresse (après pushState vers la page parente). */
export function restoreFor(key = pageKey()) {
  const y = saved.get(key);
  if (y == null) scrollAdminTop(); else scrollBack(y);
}

let installed = false;
/** Note la position de chaque page avant de la quitter, et la rend au retour du navigateur. Une seule fois. */
export function installScrollMemory() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  for (const fn of ["pushState", "replaceState"] as const) {
    const orig = history[fn].bind(history);
    history[fn] = (data: unknown, unused: string, url?: string | URL | null) => {
      // Seul un vrai changement de page note la position (pas une mise à jour de la même adresse).
      if (fn === "pushState") saved.set(pageKey(), currentY());
      return orig(data, unused, url);
    };
  }
  window.addEventListener("popstate", () => {
    // Le navigateur revient en arrière : la page reprend sa position une fois affichée.
    const key = pageKey();
    if (saved.has(key)) restoreFor(key); else scrollAdminTop();
  });
}
