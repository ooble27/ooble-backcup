import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutGrid, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";
import BottomNav from "./BottomNav";
import { useAuth } from "@/lib/auth";
import { warmAppData } from "@/lib/warm";
import { ensurePush } from "@/lib/pushNotifications";
import { recordOrigin, syncLang } from "@/lib/origin";
import { claimStoredReferral } from "@/lib/growth";
import { useNoZoom } from "@/lib/noZoom";
import { trackPushOpen } from "@/lib/appMessages";
import { FLAT_CSS } from "./flat";
import { pageColor, paintPage, useLightTheme } from "@/lib/installed";
import { PeekMascot, PLAY_CSS } from "@/components/launch/PlayLogin";

/**
 * Nouveau design : chaque page de l'app a sa couleur pleine (accueil jaune, acheter lavande, vendre corail…),
 * peinte aussi sur <html>, <body> et la barre d'état, pour qu'aucune bande d'une autre couleur n'apparaisse.
 * L'app est toujours en clair.
 */
function useAppScope(color: string) {
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("app-scope");
    return () => html.classList.remove("app-scope");
  }, []);
  useLightTheme();
  useEffect(() => paintPage(color), [color]);
}

interface AppShellProps {
  children: React.ReactNode;
  /** Contenu d'en-tête à gauche (salutation, titre…). */
  header?: React.ReactNode;
  /** Élargit la colonne sur tablette/desktop (tableau de bord uniquement). */
  wide?: boolean;
  /** Encore plus large sur grand écran (page Mon compte). */
  wider?: boolean;
  /** Centre verticalement le contenu (écrans courts de saisie). */
  center?: boolean;
  /** Sans la carte blanche : la page pose elle-même ses blocs sur la couleur (accueil). */
  bare?: boolean;
  /** Au-dessus de la carte, sur la couleur : retour, barre d'étapes et titre (parcours Acheter et Vendre). */
  lead?: React.ReactNode;
  className?: string;
}

/**
 * Coquille de l'app connectée. Sur desktop, la barre du haut occupe toujours
 * la même largeur (colonne max-w-[960px]) : l'avatar reste donc FIXE, au même
 * endroit sur toutes les pages. Le tableau de bord (`wide`) utilise toute cette
 * largeur ; les pages de saisie gardent une colonne un peu plus large que le
 * mobile (600px, alignée à gauche) pour respirer sans être trop grosses.
 */
const AppShell = ({ children, header, wide, wider, center, bare, lead, className }: AppShellProps) => {
  const { pathname } = useLocation();
  const color = pageColor();
  useAppScope(color);
  // Pas de zoom dans l'app, comme dans le back-office (ordinateur et téléphone).
  useNoZoom();
  const { user, isStaff } = useAuth();
  const [lang] = useLang();
  // Le menu du bas : seulement sur ses trois pages.
  const withNav = ["/app", "/app/acheter", "/app/vendre"].includes(pathname.replace(/\/$/, "") || "/");
  useEffect(() => { warmAppData(user?.id); }, [user?.id]);
  // Lieu et source de l'inscription, enregistrés une fois.
  useEffect(() => { void recordOrigin(user?.id); }, [user?.id]);
  useEffect(() => { void claimStoredReferral(user?.id); }, [user?.id]);
  // Langue du client (profil ↔ app) : c'est aussi la langue de ses courriels.
  useEffect(() => { void syncLang(user?.id, lang); }, [user?.id, lang]);
  // Notifications actives pour tout le monde, sans bouton à activer.
  useEffect(() => { if (user?.id) ensurePush(lang); }, [user?.id, lang]);
  // Ouverte depuis une notification de l'équipe : le toucher est compté.
  useEffect(() => { if (user?.id) trackPushOpen(); }, [user?.id]);
  return (
  <div className="app-surface app-type min-h-screen" style={{ background: color }}>
    <style>{PLAY_CSS}</style>
    <style>{FLAT_CSS}</style>
    {/* La barre du haut a la même largeur que le contenu : « ← Retour », la salutation et les boutons
        s'alignent sur la carte, sur ordinateur et tablette aussi. */}
    <div className={cn(
      "mx-auto flex min-h-screen max-w-[440px] flex-col px-4 pb-[calc(8rem+env(safe-area-inset-bottom))] pt-[max(1rem,var(--ios-top))] app-top",
      wide ? "md:max-w-[720px] lg:max-w-[960px]" : "md:max-w-[560px] lg:max-w-[640px]",
      wider && "md:max-w-[840px] lg:max-w-[1040px] xl:max-w-[1180px] md:px-8",
    )}>
      {/* Barre du haut — largeur constante, avatar toujours au même endroit */}
      <div className="flex items-start justify-between gap-4 px-1 pb-4 pt-2 lg:pb-6 lg:pt-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="min-w-0">{header}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Membres de l'équipe seulement (un rôle dans user_roles) : accès direct au back-office.
              Le back-office vérifie lui-même les rôles ; ce bouton n'est qu'un raccourci. */}
          {isStaff && (
            <Link to="/admin" aria-label="Back-office" title="Back-office" className="ap-ic">
              <LayoutGrid className="h-[18px] w-[18px]" strokeWidth={2} />
            </Link>
          )}
          <Link to="/app/compte" aria-label={lang === "en" ? "My account" : "Mon compte"} className="ap-ic">
            <User className="h-[18px] w-[18px]" strokeWidth={2} />
          </Link>
        </div>
      </div>

      <div
        className={cn(
          "animate-page flex-1",
          center && !lead && "flex flex-col justify-center pb-[18vh] lg:justify-start lg:pb-0",
          className,
        )}
      >
        {/* Les trois pages du menu : la mascotte dépasse de la carte, comme à la connexion. */}
        {lead && <div className="ap-lead">{lead}</div>}
        {withNav && !bare && <PeekMascot look={0} typing={false} hide={false} peek={false} />}
        {bare ? children : <div className="ap-card">{children}</div>}
      </div>
    </div>

    {withNav && <BottomNav />}
  </div>
  );
};

export default AppShell;
