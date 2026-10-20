import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AlertTriangle, Info, ShieldAlert, X, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useLiveNotices, type Announcement, type AnnouncementKind, type MaintenanceWindow } from "@/lib/announcements";

/**
 * Bannière annonce + overlay maintenance montés une seule fois dans <App>.
 *
 * Règles :
 *   * la bannière apparaît en haut de toutes les routes SAUF `/admin/*` (les
 *     admins ne doivent pas être gênés pendant qu'ils l'éditent) ;
 *   * l'overlay maintenance bloque toutes les routes clients (site public
 *     comme app connectée) MAIS jamais `/admin/*` — le back-office reste
 *     accessible pour piloter la reprise ;
 *   * la connexion (et le mot de passe oublié) restent ouvertes : l'équipe doit
 *     pouvoir entrer pendant la maintenance. Un client qui se connecte retrouve
 *     l'écran de maintenance juste après ; un membre de l'équipe passe partout ;
 *   * la fermeture d'une bannière est mémorisée par utilisateur dans
 *     `localStorage` (clé qui inclut l'ID de l'annonce — une nouvelle annonce
 *     réapparaît même si l'ancienne avait été fermée) ;
 *   * une fenêtre de maintenance planifiée (starts_at/ends_at) ne bloque
 *     qu'entre ses bornes, même si `active` est déjà à `true`.
 */

// ─────────────────────── Bannière ───────────────────────

const KIND_STYLE: Record<AnnouncementKind, { wrap: string; icon: typeof Info; badge: string; label: { fr: string; en: string } }> = {
  info: {
    wrap: "border-border bg-card text-foreground",
    icon: Info,
    badge: "bg-secondary text-foreground",
    label: { fr: "Info", en: "Info" },
  },
  warning: {
    wrap: "border-amber-500/40 bg-amber-500/10 text-foreground",
    icon: AlertTriangle,
    badge: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
    label: { fr: "Avertissement", en: "Warning" },
  },
  critical: {
    wrap: "border-destructive/40 bg-destructive/10 text-foreground",
    icon: ShieldAlert,
    badge: "bg-destructive/15 text-destructive",
    label: { fr: "Critique", en: "Critical" },
  },
};

const DISMISS_KEY_PREFIX = "ooble.banner.dismissed:";

function Banner({ announcement }: { announcement: Announcement }) {
  const [lang] = useLang();
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!announcement.dismissible) return;
    try {
      const v = localStorage.getItem(DISMISS_KEY_PREFIX + announcement.id);
      if (v === "1") setHidden(true);
    } catch { /* incognito */ }
  }, [announcement.id, announcement.dismissible]);

  if (hidden) return null;

  const style = KIND_STYLE[announcement.kind] ?? KIND_STYLE.info;
  const Icon = style.icon;
  const title = lang === "en" ? announcement.title_en : announcement.title_fr;
  const body = lang === "en" ? announcement.body_en : announcement.body_fr;

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(DISMISS_KEY_PREFIX + announcement.id, "1");
    } catch { /* incognito */ }
  };

  return (
    // La bannière occupe elle-même le haut de l'écran (barre d'état comprise, fond uni) et passe
    // au-dessus de la bande de l'app installée : elle n'est jamais rognée, et la page ne double pas l'espace.
    <div className="sticky top-0 z-[75] w-full bg-background" style={{ paddingTop: "var(--ios-top)" }}>
      <NoticeMark />
      <div className={cn("border-b px-4 py-2.5 md:px-6", style.wrap)}>
        <div className="mx-auto flex max-w-[1200px] items-start gap-3">
          <span className={cn("mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full", style.badge)}>
            <Icon className="h-3.5 w-3.5" strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-[13px] font-semibold leading-tight">{title}</p>
            {body && <p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">{body}</p>}
          </div>
          {announcement.dismissible && (
            <button
              onClick={dismiss}
              aria-label={lang === "en" ? "Dismiss" : "Fermer"}
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background/40 hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────── Overlay maintenance ───────────────────────

/** Formatte une date/heure locale, langue au choix. */
function fmt(dt: string | null, lang: "fr" | "en"): string | null {
  if (!dt) return null;
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(lang === "en" ? "en-CA" : "fr-CA", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** La fenêtre est-elle en cours ? (respecte starts_at/ends_at si présents) */
function isWindowLive(m: MaintenanceWindow, now: Date): boolean {
  if (!m.active) return false;
  const start = m.starts_at ? new Date(m.starts_at).getTime() : null;
  const end = m.ends_at ? new Date(m.ends_at).getTime() : null;
  const t = now.getTime();
  if (start !== null && t < start) return false;
  if (end !== null && t > end) return false;
  return true;
}

function MaintenanceOverlay({ window: mw }: { window: MaintenanceWindow }) {
  const [lang] = useLang();
  const title = lang === "en" ? mw.title_en : mw.title_fr;
  const body = lang === "en" ? mw.body_en : mw.body_fr;
  const eta = fmt(mw.ends_at, lang);

  // Empêche le défilement dessous pendant que l'overlay est monté.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="maintenance-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background px-6"
    >
      <div className="w-full max-w-md text-center">
        <Wrench className="mx-auto h-6 w-6 text-muted-foreground" strokeWidth={1.7} />
        <h2
          id="maintenance-title"
          className="mt-5 font-display text-[28px] font-semibold tracking-tight"
        >
          {title}
        </h2>
        {body && (
          <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-muted-foreground">
            {body}
          </p>
        )}
        {eta && (
          <p className="mt-6 text-[13px] text-muted-foreground">
            {lang === "en" ? "Back online" : "Retour prévu"} <span className="text-foreground">{eta}</span>
          </p>
        )}
        <p className="mt-8 text-[12.5px] text-muted-foreground">
          {lang === "en"
            ? "Thanks for your patience. The Ooble team"
            : "Merci de votre patience. L'équipe Ooble"}
        </p>
        {/* Discret : l'équipe se connecte pour passer la maintenance. */}
        <Link to="/connexion" className="mt-10 inline-block text-[12px] text-muted-foreground/70 underline underline-offset-4 hover:text-foreground">
          {lang === "en" ? "Team access" : "Accès équipe"}
        </Link>
      </div>
    </div>
  );
}

// ─────────────────────── Montage global ───────────────────────

const GlobalNotice = () => {
  const { pathname } = useLocation();
  const { isStaff } = useAuth();
  const { announcement, maintenance } = useLiveNotices();

  // Recalcule chaque minute pour respecter les fenêtres planifiées.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const onAdmin = pathname.startsWith("/admin");
  // Se connecter reste possible pendant la maintenance (sinon l'équipe ne pourrait plus entrer).
  const onAuth = pathname === "/connexion" || pathname === "/reinitialiser";
  const maintenanceLive = maintenance ? isWindowLive(maintenance, now) : false;
  // Les membres du staff peuvent continuer à naviguer même en maintenance
  // (pour publier, communiquer, etc.).
  const showOverlay = maintenanceLive && !onAdmin && !onAuth && !isStaff;

  return (
    <>
      {!onAdmin && announcement && <Banner announcement={announcement} />}
      {showOverlay && maintenance && <MaintenanceOverlay window={maintenance} />}
    </>
  );
};

/** Tant que la bannière est affichée, la page n'ajoute pas sa propre marge de barre d'état. */
function NoticeMark() {
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("has-notice");
    return () => html.classList.remove("has-notice");
  }, []);
  return null;
}

export default GlobalNotice;
