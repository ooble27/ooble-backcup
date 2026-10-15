import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";
import ThemeToggle from "./ThemeToggle";
import BottomNav from "./BottomNav";
import { useAuth } from "@/lib/auth";
import { warmAppData } from "@/lib/warm";
import { ensurePush } from "@/lib/pushNotifications";
import { recordOrigin, recordLang } from "@/lib/origin";
import { useNoZoom } from "@/lib/noZoom";

/**
 * Marque <html> pendant que l'app est montée pour que la racine, le <body> et
 * la barre d'état (meta theme-color) prennent la teinte de la page de l'app.
 * Corrige la couture de couleur visible tout en haut. Suit la bascule de thème.
 */
function useAppScope() {
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("app-scope");

    const meta =
      (document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null) ??
      (() => {
        const m = document.createElement("meta");
        m.name = "theme-color";
        document.head.appendChild(m);
        return m;
      })();
    const previous = meta.getAttribute("content");
    const sync = () => meta.setAttribute("content", html.classList.contains("dark") ? "#171717" : "#f5f5f3");
    sync();

    // La bascule clair/sombre change la classe de <html> : on resynchronise.
    const obs = new MutationObserver(sync);
    obs.observe(html, { attributes: true, attributeFilter: ["class"] });

    return () => {
      html.classList.remove("app-scope");
      obs.disconnect();
      if (previous !== null) meta.setAttribute("content", previous);
    };
  }, []);
}

interface AppShellProps {
  children: React.ReactNode;
  /** Contenu d'en-tête à gauche (salutation, titre…). */
  header?: React.ReactNode;
  /** Affiche une flèche retour vers `backTo`. */
  backTo?: string;
  /** Élargit la colonne sur tablette/desktop (tableau de bord uniquement). */
  wide?: boolean;
  /** Encore plus large sur grand écran (page Mon compte). */
  wider?: boolean;
  /** Centre verticalement le contenu (écrans courts de saisie). */
  center?: boolean;
  className?: string;
}

/**
 * Coquille de l'app connectée. Sur desktop, la barre du haut occupe toujours
 * la même largeur (colonne max-w-[960px]) : l'avatar reste donc FIXE, au même
 * endroit sur toutes les pages. Le tableau de bord (`wide`) utilise toute cette
 * largeur ; les pages de saisie gardent une colonne un peu plus large que le
 * mobile (600px, alignée à gauche) pour respirer sans être trop grosses.
 */
const AppShell = ({ children, header, backTo, wide, wider, center, className }: AppShellProps) => {
  useAppScope();
  // Pas de zoom dans l'app, comme dans le back-office (ordinateur et téléphone).
  useNoZoom();
  const { user } = useAuth();
  const [lang] = useLang();
  useEffect(() => { warmAppData(user?.id); }, [user?.id]);
  // Lieu et source de l'inscription, enregistrés une fois.
  useEffect(() => { void recordOrigin(user?.id); }, [user?.id]);
  // Langue de l'app, pour recevoir les courriels d'information dans sa langue.
  useEffect(() => { void recordLang(user?.id, lang); }, [user?.id, lang]);
  // Notifications actives pour tout le monde, sans bouton à activer.
  useEffect(() => { if (user?.id) ensurePush(lang); }, [user?.id, lang]);
  return (
  <div className="app-surface app-type min-h-screen bg-background">
    <div className={cn("mx-auto flex min-h-screen max-w-[400px] flex-col px-5 pb-28 pt-[max(1.25rem,var(--ios-top))] app-top md:max-w-[720px] lg:max-w-[960px]", wider && "md:max-w-[840px] lg:max-w-[1040px] xl:max-w-[1180px] md:px-8")}>
      {/* Barre du haut — largeur constante, avatar toujours au même endroit */}
      <div className="flex items-start justify-between gap-4 pb-6 pt-2 lg:pb-10 lg:pt-4">
        <div className="flex min-w-0 items-start gap-3">
          {backTo && (
            <Link
              to={backTo}
              aria-label={lang === "en" ? "Back" : "Retour"}
              className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-foreground transition-all hover:bg-secondary active:scale-95"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
          )}
          <div className="min-w-0">{header}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <ThemeToggle />
          <Link
            to="/app/compte"
            aria-label={lang === "en" ? "My account" : "Mon compte"}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground/55 transition-all hover:text-foreground active:scale-95"
          >
            <User className="h-5 w-5" strokeWidth={1.8} />
          </Link>
        </div>
      </div>

      <div
        className={cn(
          "animate-page flex-1",
          !wide && "md:mx-auto md:w-full md:max-w-[500px] lg:max-w-[600px]",
          center && "flex flex-col justify-center pb-[26vh] lg:justify-start lg:pb-0",
          className,
        )}
      >
        {children}
      </div>
    </div>

    <BottomNav />
  </div>
  );
};

export default AppShell;
