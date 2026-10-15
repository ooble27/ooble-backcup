import { useEffect, useState } from "react";
import { LogOut, ShieldCheck, LayoutGrid, ChevronRight, Gauge, Building2, Globe, Mail, User, Lock, SunMoon, Handshake, Trash2 } from "lucide-react";
import { useOtcVisible } from "@/lib/otc";
import { Link } from "react-router-dom";
import AppShell from "@/components/app/AppShell";
import CopyRow from "@/components/app/CopyRow";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { getMyProfile, peekMyProfile, type MyProfile } from "@/lib/profile";
import { getMyKyc, peekMyKyc, type KycDbStatus } from "@/lib/kyc";
import { useLang, useT } from "@/lib/i18n";
import { getTheme, onThemeChange, setTheme, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import BusinessMark from "@/components/app/BusinessMark";
import MobileAccount from "@/components/app/account/MobileAccount";
import type { TKey } from "@/lib/translations";

const KYC_KEYS: Record<KycDbStatus, TKey> = {
  not_started: "kyc.notStarted",
  pending: "kyc.pending",
  approved: "kyc.approved",
  rejected: "kyc.rejected",
};

const KYC_TONE: Record<KycDbStatus, string> = {
  not_started: "bg-secondary text-muted-foreground",
  pending: "bg-secondary text-foreground",
  approved: "bg-primary/10 text-primary",
  rejected: "bg-destructive/10 text-destructive",
};

const Compte = () => {
  const { user, signOut, isStaff } = useAuth();
  const t = useT();
  const otc = useOtcVisible();
  // Données déjà chargées (préchargement de l'app) : affichées tout de suite,
  // puis relues en arrière-plan.
  const [profile, setProfile] = useState<MyProfile | null>(() => peekMyProfile(user?.id) ?? null);
  const [kyc, setKyc] = useState<KycDbStatus | null>(() => {
    const k = peekMyKyc(user?.id);
    return k === undefined ? null : k?.status ?? "not_started";
  });
  useEffect(() => {
    getMyProfile().then(setProfile);
    getMyKyc().then((k) => setKyc(k?.status ?? "not_started"));
  }, []);

  const logout = async () => {
    await signOut();
    // Vraie navigation : l'appareil repart de zéro (dernière version du site, aucune donnée du compte précédent).
    window.location.replace("/connexion");
  };

  return (
    <AppShell
      wide
      wider
      header={
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">{t("acct.title")}</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">{t("acct.sub")}</p>
        </div>
      }
    >
      {/* Tablette et ordinateur : deux colonnes (proposition A). */}
      <DesktopAccount profile={profile} kyc={kyc} name={user?.name ?? ""} email={user?.email ?? ""} isStaff={isStaff} onLogout={logout} />

      {/* Téléphone */}
      <MobileAccount profile={profile} kyc={kyc} name={user?.name ?? ""} email={user?.email ?? ""} isStaff={isStaff} otc={otc} onLogout={logout} />
    </AppShell>
  );
};

/* ─── Tablette / ordinateur : proposition A ───
   Colonne profil à gauche (identité, vérifications, actions) ; à droite,
   les cartes sur deux colonnes : entreprise, connexion et sécurité, limites
   | Interac, préférences. Les boutons du bas de la colonne profil
   s'alignent sur le bas de la dernière carte. Arrondi 16 px. */

const initialsOf = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <section className={cn("overflow-hidden rounded-2xl border border-border bg-card", className)}>{children}</section>
);
const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <p className="px-6 pb-3 pt-5 text-[11.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{children}</p>
);
/** Ligne libellé / valeur ; sur grand écran, en tuile (libellé au-dessus). */
const InfoRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex justify-between gap-6 border-t border-border px-6 py-3.5 text-[15px] xl:flex-col xl:justify-start xl:gap-1 xl:border-t-0 xl:py-4">
    <span className="shrink-0 text-muted-foreground xl:text-[13px]">{label}</span>
    <span className="min-w-0 text-right xl:text-left">{children}</span>
  </div>
);
const LinkRow = ({ to, icon: Icon, label, sub, right }: { to: string; icon: React.ElementType; label: string; sub?: string; right?: React.ReactNode }) => (
  <Link to={to} className="flex items-center gap-3.5 border-t border-border px-6 py-4 transition-colors hover:bg-secondary/40">
    <Icon className="h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={1.7} />
    <span className="min-w-0 flex-1">
      <span className="block text-[15px]">{label}</span>
      {sub && <span className="block truncate text-[13px] text-muted-foreground">{sub}</span>}
    </span>
    {right}
  </Link>
);

/** Choix à deux options en pastilles (langue, apparence). */
const Choice = <V extends string>({ value, options, onChange }: { value: V; options: { v: V; label: string }[]; onChange: (v: V) => void }) => (
  <div className="inline-flex shrink-0 rounded-full border border-border bg-background p-1">
    {options.map((o) => (
      <button
        key={o.v}
        type="button"
        onClick={() => onChange(o.v)}
        aria-pressed={value === o.v}
        className={cn(
          "rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors",
          value === o.v ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        {o.label}
      </button>
    ))}
  </div>
);

function DesktopAccount({
  profile, kyc, name, email, isStaff, onLogout,
}: {
  profile: MyProfile | null; kyc: KycDbStatus | null; name: string; email: string; isStaff: boolean; onLogout: () => void;
}) {
  const t = useT();
  const otc = useOtcVisible();
  const [lang, setLang] = useLang();
  const [theme, setThemeState] = useState<Theme>(getTheme);
  useEffect(() => onThemeChange(setThemeState), []);
  const business = profile?.accountType === "business";
  const pill = (st: KycDbStatus) => (
    <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", KYC_TONE[st])}>{t(KYC_KEYS[st])}</span>
  );
  const modify = <span className="shrink-0 text-[13.5px] font-medium text-foreground/80">{t("acct.modify")}</span>;

  return (
    <div className="hidden items-stretch gap-6 md:flex lg:gap-7">
      {/* Colonne profil */}
      <aside className="flex w-[300px] shrink-0 flex-col gap-4 lg:w-[330px]">
        <Card className="flex flex-col items-center px-6 py-8 text-center">
          <span className="flex h-[88px] w-[88px] items-center justify-center rounded-2xl bg-secondary font-display text-[28px] font-medium tracking-tight text-foreground/85">
            {initialsOf(name || email)}
          </span>
          <p className="mt-4 max-w-full truncate font-display text-[21px] font-semibold tracking-tight">{name}</p>
          <p className="mt-1 max-w-full truncate text-[14.5px] text-muted-foreground">{email}</p>
          <span className="mt-4 inline-flex max-w-full items-center gap-2 rounded-full bg-secondary py-1 pl-1 pr-3 text-[12.5px] font-semibold text-foreground/80">
            {business ? (
              <BusinessMark name={profile?.businessName} size="sm" className="h-[22px] w-[22px] rounded-full text-[9px]" />
            ) : (
              <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-foreground text-background"><User className="h-3 w-3" strokeWidth={2.4} /></span>
            )}
            <span className="truncate">{business ? t("kyb.accountBusiness") : t("acct.personal")}</span>
          </span>
        </Card>

        <Card>
          <Eyebrow>{t("acct.verifications")}</Eyebrow>
          {kyc && <LinkRow to="/app/verification" icon={ShieldCheck} label={t("acct.identity")} right={pill(kyc)} />}
          {business && profile && (
            <LinkRow to="/app/entreprise" icon={Building2} label={t("acct.business")} right={pill(profile.businessStatus)} />
          )}
        </Card>

        {/* Actions : en bas de la colonne, au niveau de la dernière carte à droite. */}
        <div className="mt-auto flex flex-wrap gap-2.5 pt-4">
          {isStaff && (
            <Button asChild variant="appOutline" shape="rounded" className="h-auto gap-2 px-[18px] py-[10px] text-sm">
              <Link to="/admin"><LayoutGrid className="h-4 w-4" /> {t("acct.backoffice")}</Link>
            </Button>
          )}
          <Button variant="appOutline" shape="rounded" className="h-auto gap-2 px-[18px] py-[10px] text-sm" onClick={onLogout}>
            <LogOut className="h-4 w-4" /> {t("acct.logout")}
          </Button>
        </div>
      </aside>

      {/* Réglages : une colonne ; à partir de xl, l'entreprise sur toute la
          largeur puis deux piles (sécurité, limites | Interac, préférences). */}
      <div className="flex min-w-0 flex-1 flex-col gap-5 xl:grid xl:grid-cols-2 xl:items-start">
        {business && profile && (
          <Card className="order-1 xl:order-none xl:col-span-2">
            <div className="flex items-center gap-3.5 px-6 pb-4 pt-5">
              <BusinessMark name={profile.businessName} size="md" className="h-11 w-11 rounded-xl text-[15px]" />
              <div className="min-w-0 flex-1">
                <p className="text-[16px] font-semibold leading-snug tracking-tight">{profile.businessName}</p>
                <p className="text-[13px] text-muted-foreground">{t(KYC_KEYS[profile.businessStatus])}</p>
              </div>
              <Link to="/app/entreprise" className="shrink-0 text-[13.5px] font-medium text-foreground/80 hover:text-foreground hover:underline">
                {t("acct.viewFile")}
              </Link>
            </div>
            <div className="xl:grid xl:grid-cols-3 xl:divide-x xl:divide-border xl:border-t xl:border-border">
            {profile.businessNumber && <InfoRow label="NEQ / BN"><span className="tabular-nums">{profile.businessNumber}</span></InfoRow>}
            {profile.businessAddress && <InfoRow label={t("regb.address")}>{profile.businessAddress}</InfoRow>}
            {profile.businessPhone && <InfoRow label={t("regb.phone")}><span className="tabular-nums">{profile.businessPhone}</span></InfoRow>}
            </div>
          </Card>
        )}

        <div className="contents xl:flex xl:flex-col xl:gap-5">
        <Card className="order-3 xl:order-none">
          <Eyebrow>{t("acct.security")}</Eyebrow>
          <LinkRow to="/app/changer-email" icon={Mail} label={t("acct.email")} sub={email} right={modify} />
          <LinkRow to="/reinitialiser" icon={Lock} label={t("acct.password")} right={modify} />
          {!isStaff && <LinkRow to="/app/supprimer-compte" icon={Trash2} label={t("del.row")} sub={t("del.rowSub")} right={<ChevronRight className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />} />}
        </Card>

        <Card className="order-4 xl:order-none">
          <Eyebrow>{t("acct.limits")}</Eyebrow>
          <LinkRow to="/app/limites" icon={Gauge} label={t("acct.limitsRow")} sub={t("acct.limitsSub")} right={<ChevronRight className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />} />
          {otc && <LinkRow to="/app/otc" icon={Handshake} label={t("nav.otc")} sub={t("dash.otcSub")} right={<ChevronRight className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />} />}
        </Card>
        </div>

        <div className="contents xl:flex xl:flex-col xl:gap-5">
        {profile?.interacQuestion && (
          <Card className="order-2 xl:order-none">
            <div className="px-6 pb-4 pt-5">
              <p className="text-[11.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{t("acct.interac")}</p>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">{t("acct.interacSub")}</p>
            </div>
            <div className="divide-y divide-border border-t border-border [&>div]:px-6">
              {email && <CopyRow label={t("acct.interacEmail")} value={email} />}
              <CopyRow label={t("acct.question")} value={profile.interacQuestion} />
              <CopyRow label={t("acct.answer")} value={profile.interacAnswer!} mono />
            </div>
          </Card>
        )}

        <Card className="order-5 xl:order-none">
          <Eyebrow>{t("acct.preferences")}</Eyebrow>
          <div className="flex items-center gap-3.5 border-t border-border px-6 py-3.5">
            <Globe className="h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={1.7} />
            <span className="flex-1 text-[15px]">{t("acct.language")}</span>
            <Choice value={lang} options={[{ v: "fr", label: "FR" }, { v: "en", label: "EN" }]} onChange={setLang} />
          </div>
          <div className="flex items-center gap-3.5 border-t border-border px-6 py-3.5">
            <SunMoon className="h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={1.7} />
            <span className="flex-1 text-[15px]">{t("acct.appearance")}</span>
            <Choice
              value={theme}
              options={[{ v: "light", label: t("acct.light") }, { v: "dark", label: t("acct.dark") }]}
              onChange={(v) => { setTheme(v); setThemeState(v); }}
            />
          </div>
        </Card>
        </div>
      </div>
    </div>
  );
}

export default Compte;
