import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initTheme } from "./lib/theme";
import { initLang } from "./lib/i18n";
import { captureSource } from "./lib/origin";
import { registerServiceWorker, dropOrphanPush } from "./lib/pushNotifications";
import { supabase } from "./integrations/supabase/client";
import { startFreshnessCheck } from "./lib/freshness";

initTheme();
captureSource();

// App installée sur iPhone / iPad : le contenu commence sous la barre d'état (voir --ios-top dans index.css).
{
  const nav = navigator as Navigator & { standalone?: boolean };
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
  const installed = nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  if (ios && installed) document.documentElement.classList.add("ooble-ios-pwa");
}
const { basename, redirect } = initLang();

if (redirect) {
  // Le visiteur a choisi l'anglais : version anglaise de la même page.
  window.location.replace(redirect);
} else {
  // Les pages publiques arrivent déjà rendues (pré-rendu SEO) ; React les
  // remplace par l'app, à l'identique.
  createRoot(document.getElementById("root")!).render(<App basename={basename} />);
}

// Toujours la dernière version publiée (voir lib/freshness.ts).
startFreshnessCheck();

// Service worker : notifications push (abonnement automatique une fois connecté).
registerServiceWorker();
// Personne de connecté sur cet appareil : pas de notifications de compte.
void supabase.auth.getSession().then(({ data }) => { if (!data.session) void dropOrphanPush(); });
