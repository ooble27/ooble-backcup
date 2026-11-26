import { NavLink, useLocation } from "react-router-dom";
import { House, Coins, HandCoins } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

/**
 * Menu du bas (variante D) : une barre blanche au trait noir, Accueil à gauche, Vendre à droite, et au milieu
 * Acheter en gros rond noir qui dépasse, comme un bouton qu'on presse. Affiché seulement sur ses trois pages
 * (Accueil, Acheter, Vendre) ; les autres pages ont « ← Retour » en haut.
 */

const CSS = `
.bn { position: relative; display: grid; grid-template-columns: 1fr 96px 1fr; align-items: center; width: 100%; max-width: 380px; height: 64px; border-radius: 26px; background: #fff; border: 3px solid #111; }
.bn-side { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; height: 100%; font-size: 11.5px; font-weight: 500; color: #666; text-decoration: none; -webkit-tap-highlight-color: transparent; transition: color .2s; }
.bn-side svg { transition: transform .2s; }
.bn-side.on { color: #111; font-weight: 600; }
.bn-side.on svg { transform: scale(1.12); }
.bn-mid { justify-self: center; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; width: 78px; height: 78px; margin-top: -46px; border-radius: 999px; background: #111; border: 3px solid #111; color: #fff; font-size: 11.5px; font-weight: 600; text-decoration: none; box-shadow: 0 4px 0 #111; -webkit-tap-highlight-color: transparent; transition: transform .15s, box-shadow .15s, background-color .25s; }
.bn-mid.on { background: #fff; color: #111; }
.bn-mid:active { transform: translateY(3px); box-shadow: 0 1px 0 #111; }
.bn a:focus-visible { outline: 2.5px solid #111; outline-offset: 3px; border-radius: 18px; }
@media (prefers-reduced-motion: reduce) { .bn *, .bn-mid { transition: none; } }
`;

const BottomNav = () => {
  const t = useT();
  const { pathname } = useLocation();
  const on = (to: string, end = false) => (end ? pathname.replace(/\/$/, "") === to : pathname.startsWith(to));

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <style>{CSS}</style>
      <nav className="bn" aria-label="Menu">
        <NavLink to="/app" end className={cn("bn-side", on("/app", true) && "on")} aria-current={on("/app", true) ? "page" : undefined}>
          <House size={21} strokeWidth={2.1} />{t("bnav.home")}
        </NavLink>
        <NavLink to="/app/acheter" className={cn("bn-mid", on("/app/acheter") && "on")} aria-current={on("/app/acheter") ? "page" : undefined}>
          <Coins size={25} strokeWidth={2.1} />{t("bnav.buy")}
        </NavLink>
        <NavLink to="/app/vendre" className={cn("bn-side", on("/app/vendre") && "on")} aria-current={on("/app/vendre") ? "page" : undefined}>
          <HandCoins size={21} strokeWidth={2.1} />{t("bnav.sell")}
        </NavLink>
      </nav>
    </div>
  );
};

export default BottomNav;
