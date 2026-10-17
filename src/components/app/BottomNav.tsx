import { useRef, useEffect, useState, useCallback } from "react";
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
 * Menu du bas : centré, sur une seule ligne, sans cadre. La page en cours montre son nom, et un
 * trait fin glisse sous elle d'une page à l'autre (à la place de l'ancienne pastille).
 */
const BottomNav = () => {
  const t = useT();
  const location = useLocation();
  const navRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [line, setLine] = useState({ left: 0, width: 0, ready: false });

  const activeIndex = items.findIndex(({ to, end }) =>
    end ? location.pathname === to : location.pathname.startsWith(to),
  );

  // Le trait se cale sous la page en cours, une fois sa largeur finale connue (le nom s'ouvre en 300 ms).
  const measure = useCallback(() => {
    const nav = navRef.current;
    const el = itemRefs.current[activeIndex];
    if (!nav || !el) { setLine((l) => ({ ...l, ready: false })); return; }
    const navRect = nav.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    setLine({ left: elRect.left - navRect.left + 14, width: Math.max(0, elRect.width - 28), ready: true });
  }, [activeIndex]);

  useEffect(() => {
    requestAnimationFrame(measure);
    const id = window.setTimeout(measure, 320);
    window.addEventListener("resize", measure);
    return () => { window.clearTimeout(id); window.removeEventListener("resize", measure); };
  }, [measure]);

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-5 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <nav
        ref={navRef}
        className="relative flex w-full max-w-[320px] items-center justify-around gap-1.5 rounded-[22px] bg-background/90 p-2 backdrop-blur-xl"
      >
        {line.ready && (
          <div
            aria-hidden="true"
            className="absolute bottom-2 h-[2px] rounded-full bg-foreground transition-[left,width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
            style={{ left: line.left, width: line.width }}
          />
        )}

        {items.map(({ to, labelKey, icon: Icon, end }, i) => {
          const isActive = i === activeIndex;
          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              ref={(el) => { itemRefs.current[i] = el; }}
              className={cn(
                "relative z-10 flex items-center justify-center py-[12px] transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
                isActive ? "gap-2 px-[18px] text-foreground" : "gap-0 px-[15px] text-muted-foreground",
              )}
            >
              <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} className="shrink-0 transition-colors duration-200" />
              <span
                className={cn(
                  "overflow-hidden whitespace-nowrap text-[13px] font-semibold tracking-[0.01em] transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
                  isActive ? "max-w-[80px] opacity-100" : "max-w-0 opacity-0",
                )}
              >
                {t(labelKey)}
              </span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
};

export default BottomNav;
