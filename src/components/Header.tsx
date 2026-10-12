import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import Logo from "./Logo";
import ThemeToggle from "./app/ThemeToggle";
import { LangPill } from "./app/LangToggle";

/**
 * En-tête public. `inverted` l'adapte à un panneau `bg-foreground` en restant
 * piloté par les jetons, donc la bascule clair / sombre continue de marcher.
 */
const Header = ({ inverted }: { inverted?: boolean }) => {
  const [open, setOpen] = useState(false);
  const { pathname, hash } = useLocation();
  const current = `${pathname}${hash}`;
  const t = useT();

  const links = [
    { to: "/", label: t("nav.home") },
    { to: "/entreprises", label: t("nav.business") },
    { to: "/otc", label: t("nav.otc") },
    { to: "/faq", label: t("nav.faq") },
    { to: "/contact", label: t("nav.contact") },
  ];

  /* Le panneau mobile occupe tout l'écran : on gèle le défilement dessous. */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <header className={cn("pt-safe pt-safe-page relative z-40 bg-transparent", inverted && "text-background")}>
      <div className="mx-auto flex h-[76px] max-w-[1200px] items-center justify-between gap-8 px-6 sm:px-10">
        <Logo inverted={inverted} />

        {/* Navigation groupée dans une pastille */}
        <nav
          className={cn(
            "hidden items-center gap-0.5 rounded-xl p-1 lg:flex",
            inverted ? "bg-background/10" : "bg-secondary",
          )}
        >
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={cn(
                "rounded-[9px] px-3.5 py-2 text-[13.5px] transition-colors",
                inverted
                  ? "text-background/60 hover:bg-background/15 hover:text-background"
                  : "text-muted-foreground hover:bg-card hover:text-foreground",
                current === link.to && (inverted ? "text-background" : "bg-card text-foreground"),
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <LangPill />
          <ThemeToggle />
          <Link
            to="/connexion"
            className={cn(
              "px-2 text-[13.5px] transition-colors",
              inverted
                ? "text-background/60 hover:text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("nav.login")}
          </Link>
          <Button
            asChild
            variant="appSolid"
            shape="rounded"
            size="sm"
            className={cn("h-9 rounded-[10px] text-[13.5px]", inverted && "bg-background text-foreground")}
          >
            <Link to="/inscription">{t("nav.signup")}</Link>
          </Button>
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <button
            className={cn(
              "flex h-9 w-9 items-center justify-center transition-colors active:scale-95",
              inverted ? "text-background" : "text-foreground",
            )}
            onClick={() => setOpen(true)}
            aria-label={t("nav.openMenu")}
          >
            <Menu className="h-5 w-5" strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {/* Panneau mobile plein écran */}
      {open && (
        <div className="fixed inset-0 z-50 bg-background text-foreground md:hidden">
          <div className="pt-safe flex h-full flex-col">
            <div className="flex h-[76px] shrink-0 items-center justify-between px-6">
              <Logo />
              <button
                onClick={close}
                aria-label={t("nav.closeMenu")}
                className="flex h-9 w-9 items-center justify-center text-foreground transition-colors active:scale-95"
              >
                <X className="h-5 w-5" strokeWidth={1.8} />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-6 pt-4">
              {links.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={close}
                  className="flex items-center justify-between gap-4 border-b py-5 font-display text-[1.7rem] tracking-[-0.035em] transition-opacity active:opacity-60"
                >
                  {link.label}
                  <ArrowUpRight className="h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={1.6} />
                </Link>
              ))}
            </nav>

            <div className="shrink-0 px-6 pb-10 pt-6">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[13px] font-medium text-muted-foreground">{t("acct.language")}</span>
                <LangPill />
              </div>
              <div className="flex gap-2.5">
                <Button asChild variant="secondary" shape="rounded" size="default" className="flex-1">
                  <Link to="/connexion" onClick={close}>{t("nav.login")}</Link>
                </Button>
                <Button asChild variant="appSolid" shape="rounded" size="default" className="flex-1">
                  <Link to="/inscription" onClick={close}>{t("nav.signup")}</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;
