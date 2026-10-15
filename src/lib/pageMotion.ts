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

export function scrollAdminTop() {
  document.querySelector<HTMLElement>("[data-admin-scroll]")?.scrollTo({ top: 0 });
  window.scrollTo({ top: 0 });
}
