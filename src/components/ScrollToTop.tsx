import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Défilement entre les pages, comme dans les applications :
 * - nouvelle page (lien du menu, du pied de page…) : en haut. Un lien vers une ancre (« /#section »)
 *   descend jusqu'à elle ;
 * - retour arrière (bouton du navigateur, « retour » de l'app) : la page reprend exactement là où on
 *   l'avait laissée, même si son contenu arrive après coup (liste de commandes, activité…).
 * Le back-office (/admin) a sa propre mémoire (lib/pageMotion).
 */
const positions = new Map<string, number>();

const ScrollToTop = () => {
  const { pathname, hash, key } = useLocation();
  const type = useNavigationType();
  const current = useRef(key);
  const admin = pathname.startsWith("/admin");
  // Seul un changement de page (chemin ou ancre) remonte en haut, pas un filtre dans l'adresse.
  const lastPage = useRef<string | null>(null);

  // La position de chaque page est notée pendant qu'on la parcourt.
  useLayoutEffect(() => { current.current = key; }, [key]);
  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    const on = () => { positions.set(current.current, window.scrollY); };
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  useEffect(() => {
    if (type === "POP") {
      lastPage.current = `${pathname}${hash}`;
      if (admin) return;
      const y = positions.get(key);
      if (y == null) return;
      // On attend que la page soit assez longue ; un geste de l'utilisateur arrête le retour.
      let stop = false;
      const cancel = () => { stop = true; };
      for (const ev of ["wheel", "touchstart", "keydown"]) window.addEventListener(ev, cancel, { passive: true, once: true });
      const until = performance.now() + 1500;
      const step = () => {
        if (stop) return;
        window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior });
        if (Math.abs(window.scrollY - y) > 2 && performance.now() < until) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      return () => { stop = true; for (const ev of ["wheel", "touchstart", "keydown"]) window.removeEventListener(ev, cancel); };
    }
    const page = `${pathname}${hash}`;
    if (lastPage.current === page) return;
    lastPage.current = page;
    // Les jetons d'authentification passent aussi par le hash : on ne les
    // prend pas pour une ancre.
    const id = /^#[\w-]+$/.test(hash) ? hash.slice(1) : "";
    if (id) {
      // La page vient d'être montée : on attend qu'elle soit peinte.
      const t = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "instant" as ScrollBehavior }), 60);
      return () => window.clearTimeout(t);
    }
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname, hash, key, type, admin]);

  return null;
};

export default ScrollToTop;
