import { useEffect, useState } from "react";
import { useAppSettings } from "@/lib/settings";
import { Link } from "react-router-dom";
import {
  BadgeCheck, Building2, Check, ChevronRight, Copy, Gauge, Globe, Handshake, LayoutGrid, Lock, LogOut, Mail,
  ShieldCheck, SunMoon, Trash2,
} from "lucide-react";
import BusinessMark from "@/components/app/BusinessMark";
import { useLang, useT } from "@/lib/i18n";
import { getTheme, onThemeChange, setTheme, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import type { KycDbStatus } from "@/lib/kyc";
import type { MyProfile } from "@/lib/profile";
import type { TKey } from "@/lib/translations";

/* Mon compte sur téléphone. Palette de l'application uniquement (noir,
   blanc, gris) : les couleurs de la marque restent aux pages publiques.
   En haut l'identité (monogramme, nom, statut) ; si la vérification est à
   faire, un bandeau d'action ; puis la carte Interac, façon carte de
   portefeuille (un toucher copie la réponse) ; deux tuiles chiffrées
   (limites, desk OTC) ; enfin les réglages groupés, chaque ligne avec une
   pastille de couleur. */

const STATUS_KEY: Record<KycDbStatus, TKey> = {
  not_started: "kyc.notStarted",
  pending: "kyc.pending",
  approved: "kyc.approved",
  rejected: "kyc.rejected",
};
const STATUS_TONE: Record<KycDbStatus, string> = {
  not_started: "bg-secondary text-muted-foreground",
  pending: "bg-secondary text-foreground",
  approved: "bg-foreground text-background",
  rejected: "bg-destructive/10 text-destructive",
};

const initialsOf = (n: string) =>
  n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

/** Pastille d'icône (repère visuel de chaque réglage). */
const Chip = ({ icon: Icon, strong }: { icon: React.ElementType; strong?: boolean }) => (
  <span
    className={cn(
      "flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]",
      strong ? "bg-foreground text-background" : "bg-secondary text-foreground/75",
    )}
  >
    <Icon className="h-[17px] w-[17px]" strokeWidth={1.9} />
  </span>
);

const Row = ({ to, chip, label, value, right }: { to?: string; chip: React.ReactNode; label: string; value?: React.ReactNode; right?: React.ReactNode }) => {
  const inner = (
    <>
      {chip}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] leading-tight">{label}</span>
        {value && <span className="mt-0.5 block truncate text-[12.5px] text-muted-foreground">{value}</span>}
      </span>
      {right ?? (to && <ChevronRight className="h-[18px] w-[18px] shrink-0 text-muted-foreground/70" />)}
    </>
  );
  const cls = "flex min-h-[60px] items-center gap-3.5 px-4 py-3";
  return to ? (
    <Link to={to} className={cn(cls, "transition-opacity active:opacity-60")}>{inner}</Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
};

const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mt-7">
    <p className="mb-2 px-1 text-[11.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{title}</p>
    <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card [&>*]:border-border">{children}</div>
  </section>
);

const Segment = <V extends string>({ value, options, onChange }: { value: V; options: { v: V; label: string }[]; onChange: (v: V) => void }) => (
  <div className="inline-flex shrink-0 rounded-[10px] bg-secondary p-[3px]">
    {options.map((o) => (
      <button
        key={o.v}
        type="button"
        onClick={() => onChange(o.v)}
        aria-pressed={value === o.v}
        className={cn(
          "rounded-[8px] px-3 py-1 text-[12.5px] font-medium transition-all",
          value === o.v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
        )}
      >
        {o.label}
      </button>
    ))}
  </div>
);

interface Props {
  profile: MyProfile | null;
  kyc: KycDbStatus | null;
  name: string;
  email: string;
  isStaff: boolean;
  otc: boolean;
  onLogout: () => void;
}

const MobileAccount = ({ profile, kyc, name, email, isStaff, otc, onLogout }: Props) => {
  const t = useT();
  const { verificationEnabled } = useAppSettings();
  const [lang, setLang] = useLang();
  const [theme, setThemeState] = useState<Theme>(getTheme);
  useEffect(() => onThemeChange(setThemeState), []);
  const [copied, setCopied] = useState(false);

  const business = profile?.accountType === "business";
  const bizStatus = profile?.businessStatus as KycDbStatus | undefined;
  const verified = business ? bizStatus === "approved" : kyc === "approved";

  // Bandeau d'action : seulement quand il y a vraiment quelque chose à faire
  // (vérification ouverte, ou dossier en cours ou refusé).
  const pendingStatus: KycDbStatus | null = business ? bizStatus ?? null : kyc;
  const showBanner = !!pendingStatus && pendingStatus !== "approved" && (verificationEnabled || pendingStatus !== "not_started");
  const banner = pendingStatus === "pending"
    ? { title: business ? t("kyb.stPending") : t("acct.verifyPendingTitle"), sub: business ? t("kyb.gatePending") : t("acct.verifyPendingSub"), cta: t("acct.verifyOpen") }
    : pendingStatus === "rejected"
      ? { title: t("acct.verifyRejectedTitle"), sub: t("acct.verifyRejectedSub"), cta: t("acct.verifyOpen") }
      : { title: business ? t("kyb.gateTitle") : t("acct.verifyTitle"), sub: business ? t("kyb.gateSub") : t("acct.verifySub"), cta: t("acct.verifyCta") };

  const copyAnswer = async () => {
    if (!profile?.interacAnswer) return;
    try {
      await navigator.clipboard.writeText(profile.interacAnswer);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* presse-papiers indisponible */ }
  };

  const pill = (st: KycDbStatus) => (
    <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold", STATUS_TONE[st])}>{t(STATUS_KEY[st])}</span>
  );

  return (
    <div className="md:hidden">
      {/* ─── Identité ─── */}
      <div className="flex items-center gap-4">
        {business ? (
          <BusinessMark name={profile?.businessName} size="lg" className="h-[68px] w-[68px] shrink-0 rounded-[22px] text-[22px]" />
        ) : (
          <span className="flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-[22px] bg-foreground font-display text-[24px] font-semibold tracking-tight text-background">
            {initialsOf(name || email)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[22px] font-semibold leading-tight tracking-tight">{business ? profile?.businessName || name : name}</p>
          <p className="mt-0.5 truncate text-[13.5px] text-muted-foreground">{email}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-secondary px-2.5 py-[3px] text-[11.5px] font-medium text-foreground/75">
              {business ? t("kyb.accountBusiness") : t("acct.personal")}
            </span>
            {verified && (
              <span className="inline-flex items-center gap-1 rounded-full bg-foreground px-2.5 py-[3px] text-[11.5px] font-medium text-background">
                <BadgeCheck className="h-3.5 w-3.5" strokeWidth={2.2} /> {t("acct.verified")}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ─── Action à faire ─── */}
      {showBanner && (
        <Link
          to={business ? "/app/entreprise" : "/app/verification"}
          className="relative mt-6 block overflow-hidden rounded-[22px] border border-border bg-card p-5 transition-transform active:scale-[0.99]"
        >
          <span aria-hidden className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-foreground/[0.05]" />
          <ShieldCheck className="relative h-6 w-6" strokeWidth={1.8} />
          <p className="relative mt-3 font-display text-[19px] font-semibold leading-snug tracking-tight">{banner.title}</p>
          <p className="relative mt-1 max-w-[290px] text-[13.5px] leading-relaxed text-muted-foreground">{banner.sub}</p>
          <span className="relative mt-4 inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-[13px] font-semibold text-background">
            {banner.cta} <ChevronRight className="h-4 w-4" strokeWidth={2.2} />
          </span>
        </Link>
      )}

      {/* ─── Carte Interac : un toucher copie la réponse ─── */}
      {profile?.interacQuestion && profile.interacAnswer && (
        <button
          type="button"
          onClick={copyAnswer}
          className="relative mt-6 block w-full overflow-hidden rounded-[22px] border border-white/[0.08] p-5 text-left text-white shadow-[0_18px_40px_-22px_rgba(0,0,0,0.7)] transition-transform active:scale-[0.99]"
          style={{ background: "linear-gradient(140deg, #2a2a2c 0%, #0b0b0c 100%)" }}
          aria-label={`${t("acct.answer")} ${profile.interacAnswer}. ${t("acct.tapCopy")}`}
        >
          <span aria-hidden className="absolute -right-12 -top-16 h-44 w-44 rounded-full bg-white/[0.06]" />
          <span aria-hidden className="absolute -bottom-20 right-10 h-40 w-40 rounded-full bg-white/[0.03]" />
          <span className="relative flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-75">Interac e-Transfer</span>
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] opacity-60">Ooble</span>
          </span>
          <span className="relative mt-5 block truncate text-[12px] opacity-70">{t("acct.interacEmail")} · {email}</span>
          <span className="relative mt-1 block text-[12px] opacity-70">{t("acct.question")} · {profile.interacQuestion}</span>
          <span className="relative mt-1 flex items-end justify-between gap-3">
            <span className="font-mono text-[30px] font-semibold leading-none tracking-[0.12em]">{profile.interacAnswer}</span>
            <span
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors",
                copied ? "bg-white text-[#0b0b0c]" : "bg-white/[0.12] text-white",
              )}
            >
              {copied ? <Check className="h-[18px] w-[18px]" strokeWidth={2.6} /> : <Copy className="h-[17px] w-[17px]" strokeWidth={1.9} />}
            </span>
          </span>
          <span className="relative mt-5 block border-t border-white/[0.12] pt-3 text-[12.5px] leading-snug text-white/70">
            {copied ? t("acct.copied") : t("acct.interacHint")}
          </span>
        </button>
      )}

      {/* ─── Limites et desk OTC : une seule carte compacte, en deux ─── */}
      <div className={cn("mt-3 grid divide-x divide-border overflow-hidden rounded-2xl border border-border bg-card", otc ? "grid-cols-2" : "grid-cols-1")}>
        <Link to="/app/limites" className="flex min-w-0 items-center gap-3 px-3.5 py-3 transition-opacity active:opacity-60">
          <Chip icon={Gauge} />
          <span className="min-w-0">
            <span className="block text-[11.5px] text-muted-foreground">{t("acct.limits")}</span>
            <span className="block truncate text-[15px] font-semibold tabular-nums tracking-tight">
              {t("acct.limitsAmount")} <span className="text-[11.5px] font-normal text-muted-foreground">/ 24 h</span>
            </span>
          </span>
        </Link>
        {otc && (
          <Link to="/app/otc" className="flex min-w-0 items-center gap-3 px-3.5 py-3 transition-opacity active:opacity-60">
            <Chip icon={Handshake} />
            <span className="min-w-0">
              <span className="block text-[11.5px] text-muted-foreground">{t("nav.otc")}</span>
              <span className="block truncate text-[15px] font-semibold tabular-nums tracking-tight">{t("acct.otcAmount")}</span>
            </span>
          </Link>
        )}
      </div>

      {/* ─── Entreprise ─── */}
      {business && profile?.businessName && (
        <Group title={t("acct.business")}>
          <Row chip={<Chip icon={Building2} />} label={profile.businessName} value={[profile.businessNumber, profile.businessAddress, profile.businessPhone].filter(Boolean).join(" · ") || undefined} />
        </Group>
      )}

      {/* ─── Vérifications ─── */}
      <Group title={t("acct.verifications")}>
        <Row to="/app/verification" chip={<Chip icon={ShieldCheck} />} label={t("acct.identity")} right={kyc ? <span className="flex items-center gap-1.5">{pill(kyc)}<ChevronRight className="h-[18px] w-[18px] text-muted-foreground/70" /></span> : undefined} />
        {business && bizStatus && (
          <Row to="/app/entreprise" chip={<Chip icon={Building2} />} label={t("acct.businessVerif")} right={<span className="flex items-center gap-1.5">{pill(bizStatus)}<ChevronRight className="h-[18px] w-[18px] text-muted-foreground/70" /></span>} />
        )}
      </Group>

      {/* ─── Connexion et sécurité ─── */}
      <Group title={t("acct.security")}>
        <Row to="/app/changer-email" chip={<Chip icon={Mail} />} label={t("acct.email")} value={email} />
        <Row to="/reinitialiser" chip={<Chip icon={Lock} />} label={t("acct.password")} value="••••••••" />
        {!isStaff && (
          <Row
            to="/app/supprimer-compte"
            chip={<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-destructive/10 text-destructive"><Trash2 className="h-[17px] w-[17px]" strokeWidth={1.9} /></span>}
            label={t("del.row")}
            value={t("del.rowSub")}
          />
        )}
      </Group>

      {/* ─── Préférences ─── */}
      <Group title={t("acct.preferences")}>
        <Row
          chip={<Chip icon={Globe} />}
          label={t("acct.language")}
          right={<Segment value={lang} options={[{ v: "fr", label: "FR" }, { v: "en", label: "EN" }]} onChange={setLang} />}
        />
        <Row
          chip={<Chip icon={SunMoon} />}
          label={t("acct.appearance")}
          right={
            <Segment
              value={theme}
              options={[{ v: "light", label: t("acct.light") }, { v: "dark", label: t("acct.dark") }]}
              onChange={(v) => { setTheme(v); setThemeState(v); }}
            />
          }
        />
        {isStaff && <Row to="/admin" chip={<Chip icon={LayoutGrid} strong />} label={t("acct.backoffice")} />}
      </Group>

      {/* ─── Déconnexion : discrète, à droite ─── */}
      <div className="mt-6 flex items-center justify-between gap-4">
        <p className="text-[11.5px] text-muted-foreground/70">{t("acct.nonCustodial")}</p>
        <button
          type="button"
          onClick={onLogout}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-[13px] font-medium text-foreground transition-colors active:bg-secondary/60"
        >
          <LogOut className="h-4 w-4" strokeWidth={1.9} /> {t("acct.logout")}
        </button>
      </div>
    </div>
  );
};

export default MobileAccount;
