import { NavLink, useLocation } from "react-router-dom";
import { House, Coins, HandCoins } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { TKey } from "@/lib/translations";

const items: { to: string; labelKey: TKey; icon: typeof House; end: boolean }[] = [
  { to: "/app", labelKey: "bnav.home", icon: House, end: true },
  { to: "/app/acheter", labelKey: "bnav.buy", icon: Coins, end: false },
  { to: "/app/vendre", labelKey: "bnav.sell", icon: HandCoins, end: false },
];

/**
 * Menu du bas (téléphone), à plat : posé au bas de l'écran, séparé de la page par un trait fin.
 * La page en cours est en clair avec son nom souligné ; les autres en gris.
 */
const BottomNav = () => {
  const t = useT();
  const location = useLocation();
  const activeIndex = items.findIndex(({ to, end }) =>
    end ? location.pathname === to : location.pathname.startsWith(to),
  );

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-[400px] items-stretch justify-around">
        {items.map(({ to, labelKey, icon: Icon, end }, i) => {
          const isActive = i === activeIndex;
          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 pb-2.5 pt-3 transition-colors active:opacity-60",
                isActive ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <Icon size={21} strokeWidth={isActive ? 2.1 : 1.7} className="shrink-0" />
              <span
                className={cn(
                  "text-[11.5px] font-medium tracking-[0.01em]",
                  isActive && "underline decoration-[1.5px] underline-offset-[5px]",
                )}
              >
                {t(labelKey)}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
