import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, Building2, ChevronRight, Copy, Gauge, Gift, Globe, Handshake, LayoutGrid, Lock, LogOut, Mail, Share2, ShieldCheck, SunMoon, Trash2,
} from "lucide-react";
import { useOtcVisible } from "@/lib/otc";
import { useAppSettings } from "@/lib/settings";
import AppShell from "@/components/app/AppShell";
import { useAuth } from "@/lib/auth";
import { getMyProfile, peekMyProfile, type MyProfile } from "@/lib/profile";
import { getMyKyc, peekMyKyc, type KycDbStatus } from "@/lib/kyc";
import { useLang, useT } from "@/lib/i18n";
import { getTheme, onThemeChange, setTheme, type Theme } from "@/lib/theme";
import type { TKey } from "@/lib/translations";
import { bpsText, myReferral, referralLink, type MyReferral } from "@/lib/growth";

/*
 * Mon compte, dans l'esprit des Réglages du back-office : rien n'est encadré, la typographie fait
 * la structure. Des groupes (titre, une phrase), des lignes à plat qui glissent au survol, les
 * choix en mots soulignés. Styles communs : components/app/flat.ts.
 */


const STATUS_KEY: Record<KycDbStatus, TKey> = {
  not_started: "kyc.notStarted",
  pending: "kyc.pending",
  approved: "kyc.approved",
  rejected: "kyc.rejected",
};

const Group = ({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) => (
  <section>
    <h2 className="ac-gt">{title}</h2>
    {sub && <p className="ac-gs">{sub}</p>}
    <div>{children}</div>
  </section>
);

/** Une ligne : icône, nom, précision, valeur. Lien, bouton, ou simple texte. */
const Row = ({ icon: Icon, name, desc, value, to, onClick, right, label }: {
  icon: React.ElementType; name: string; desc?: string; value?: React.ReactNode; to?: string; onClick?: () => void; right?: React.ReactNode; label?: string;
}) => {
  const inner = (
    <>
      <Icon className="ac-ico" strokeWidth={1.7} />
      <span className="ac-txt">
        <span className="ac-n">{name}</span>
        {desc && <span className="ac-d">{desc}</span>}
      </span>
      {value !== undefined && <span className="ac-v">{value}</span>}
      {right ?? ((to || onClick) && <ChevronRight className="ac-go" strokeWidth={1.8} />)}
    </>
  );
  if (to) return <Link to={to} className="ac-row" aria-label={label}>{inner}</Link>;
  if (onClick) return <button type="button" className="ac-row" onClick={onClick} aria-label={label}>{inner}</button>;
  return <div className="ac-row static">{inner}</div>;
};

/** Choix en mots soulignés (langue, apparence). */
const Opts = <V extends string>({ value, options, onChange, label }: { value: V; options: { v: V; label: string }[]; onChange: (v: V) => void; label: string }) => (
  <div className="ac-opts" role="group" aria-label={label}>
    {options.map((o) => (
      <button key={o.v} type="button" aria-pressed={value === o.v} onClick={() => onChange(o.v)}>{o.label}</button>
    ))}
  </div>
);

/** Ligne Interac : un toucher copie la valeur. */
const CopyLine = ({ name, value, mono }: { name: string; value: string; mono?: boolean }) => {
  const [lang] = useLang();
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      window.setTimeout(() => setDone(false), 1500);
    } catch { /* presse-papiers indisponible */ }
  };
  return (
    <button type="button" className="ac-row" onClick={copy} aria-label={lang === "en" ? `Copy ${name}` : `Copier ${name}`}>
      <Copy className="ac-ico" strokeWidth={1.7} />
      <span className="ac-txt">
        <span className="ac-d" style={{ marginTop: 0 }}>{name}</span>
        <span className="ac-n" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined }}>{value}</span>
      </span>
      <span className="ac-v">{done ? (lang === "en" ? "Copied" : "Copié") : (lang === "en" ? "Copy" : "Copier")}</span>
    </button>
  );
};

const Compte = () => {
  const { user, signOut, isStaff } = useAuth();
  const t = useT();
  const otc = useOtcVisible();
  const { verificationEnabled } = useAppSettings();
  const [lang, setLang] = useLang();
  const [theme, setThemeState] = useState<Theme>(getTheme);
  useEffect(() => onThemeChange(setThemeState), []);
  // Données déjà chargées (préchargement de l'app) : affichées tout de suite, puis relues en arrière-plan.
  const [profile, setProfile] = useState<MyProfile | null>(() => peekMyProfile(user?.id) ?? null);
  const [kyc, setKyc] = useState<KycDbStatus | null>(() => {
    const k = peekMyKyc(user?.id);
    return k === undefined ? null : k?.status ?? "not_started";
  });
  const [ref, setRef] = useState<MyReferral | null>(null);
  useEffect(() => { myReferral().then(setRef); }, []);
  useEffect(() => {
    getMyProfile().then(setProfile);
    getMyKyc().then((k) => setKyc(k?.status ?? "not_started"));
  }, []);

  const logout = async () => {
    await signOut();
    // Vraie navigation : l'appareil repart de zéro (dernière version du site, aucune donnée du compte précédent).
    window.location.replace("/connexion");
  };

  const name = user?.name ?? "";
  const email = user?.email ?? "";
  const business = profile?.accountType === "business";
  const bizStatus = profile?.businessStatus as KycDbStatus | undefined;
  const verified = business ? bizStatus === "approved" : kyc === "approved";

  // Ce qu'il reste à faire : seulement quand la vérification est ouverte, ou un dossier en cours ou refusé.
  const pending: KycDbStatus | null = business ? bizStatus ?? null : kyc;
  const showTodo = !!pending && pending !== "approved" && (verificationEnabled || pending !== "not_started");
  const todo = pending === "pending"
    ? { title: business ? t("kyb.stPending") : t("acct.verifyPendingTitle"), sub: business ? t("kyb.gatePending") : t("acct.verifyPendingSub"), cta: t("acct.verifyOpen") }
    : pending === "rejected"
      ? { title: t("acct.verifyRejectedTitle"), sub: t("acct.verifyRejectedSub"), cta: t("acct.verifyOpen") }
      : { title: business ? t("kyb.gateTitle") : t("acct.verifyTitle"), sub: business ? t("kyb.gateSub") : t("acct.verifySub"), cta: t("acct.verifyCta") };

  return (
    <AppShell
      wide
      wider
      header={
        // Pas de menu du bas sur cette page : le retour vers l'accueil prend la place du titre.
        <Link to="/app" className="ac-back" style={{ margin: 0, fontSize: 15 }}>
          <ArrowLeft className="h-4 w-4" />{t("misc.back")}
        </Link>
      }
    >

      {/* Identité */}
      <p className="ac-name">{business ? profile?.businessName || name : name}</p>
      <p className="ac-meta">
        {email}
        {" · "}{business ? t("kyb.accountBusiness") : t("acct.personal")}
        {verified && <> · {t("acct.verified")}</>}
      </p>

      {showTodo && (
        <Link to={business ? "/app/entreprise" : "/app/verification"} className="ac-todo">
          <span className="ac-todo-t">{todo.title}</span>
          <span className="ac-todo-s">{todo.sub}</span>
          <span className="ac-todo-c">{todo.cta} <ArrowRight className="h-4 w-4" strokeWidth={1.9} /></span>
        </Link>
      )}

      <div className="ac-grid">
        <Group title={t("acct.verifications")} sub={t("acct.gVerifSub")}>
          <Row to="/app/verification" icon={ShieldCheck} name={t("acct.identity")} value={kyc ? t(STATUS_KEY[kyc]) : undefined} />
          {business && bizStatus && (
            <Row to="/app/entreprise" icon={Building2} name={t("acct.businessVerif")} value={t(STATUS_KEY[bizStatus])} />
          )}
        </Group>

        <Group title={t("acct.security")} sub={t("acct.gSecSub")}>
          <Row to="/app/changer-email" icon={Mail} name={t("acct.email")} desc={email} />
          <Row to="/app/mot-de-passe" icon={Lock} name={t("acct.password")} desc="••••••••" />
          {!isStaff && <Row to="/app/supprimer-compte" icon={Trash2} name={t("del.row")} desc={t("del.rowSub")} />}
        </Group>

        {profile?.interacQuestion && profile.interacAnswer && (
          <Group title={t("acct.interac")} sub={t("acct.interacSub")}>
            {email && <CopyLine name={t("acct.interacEmail")} value={email} />}
            <CopyLine name={t("acct.question")} value={profile.interacQuestion} />
            <CopyLine name={t("acct.answer")} value={profile.interacAnswer} mono />
          </Group>
        )}

        <Group title={t("acct.limits")} sub={t("acct.gLimitsSub")}>
          <Row to="/app/limites" icon={Gauge} name={t("acct.limitsRow")} desc={t("acct.limitsSub")} />
          {otc && <Row to="/app/otc" icon={Handshake} name={t("nav.otc")} desc={t("dash.otcSub")} />}
        </Group>

        {business && profile?.businessName && (
          <Group title={t("acct.business")} sub={t("acct.gBizSub")}>
            <Row to="/app/entreprise" icon={Building2} name={profile.businessName} desc={t("acct.viewFile")} />
            {profile.businessNumber && <Row icon={Building2} name="NEQ / BN" value={profile.businessNumber} />}
            {profile.businessAddress && <Row icon={Building2} name={t("regb.address")} desc={profile.businessAddress} />}
            {profile.businessPhone && <Row icon={Building2} name={t("regb.phone")} value={profile.businessPhone} />}
          </Group>
        )}

        {ref?.enabled && ref.code && (
          <Group title={t("acct.refTitle")} sub={t("acct.refSub").replace("{pct}", bpsText(ref.bonusBps, lang))}>
            <CopyLine name={t("acct.refLink")} value={referralLink(ref.code)} />
            {typeof navigator !== "undefined" && "share" in navigator && (
              <Row icon={Share2} name={t("acct.refShare")} onClick={() => {
                void navigator.share({ title: "Ooble", text: t("acct.refShareText"), url: referralLink(ref.code!) }).catch(() => {});
              }} />
            )}
            <Row icon={Gift} name={t("acct.refInvited")} value={String(ref.invited)}
              desc={ref.available > 0 ? t("acct.refAvailable").replace("{n}", String(ref.available)) : ref.invited > 0 ? t("acct.refQualified").replace("{n}", String(ref.qualified)) : undefined} />
          </Group>
        )}

        <Group title={t("acct.preferences")} sub={t("acct.gPrefSub")}>
          <Row icon={Globe} name={t("acct.language")}
            right={<Opts label={t("acct.language")} value={lang} options={[{ v: "fr", label: "Français" }, { v: "en", label: "English" }]} onChange={setLang} />} />
          <Row icon={SunMoon} name={t("acct.appearance")}
            right={<Opts label={t("acct.appearance")} value={theme} options={[{ v: "light", label: t("acct.light") }, { v: "dark", label: t("acct.dark") }]}
              onChange={(v) => { setTheme(v); setThemeState(v); }} />} />
        </Group>

        <Group title={t("acct.session")}>
          {isStaff && <Row to="/admin" icon={LayoutGrid} name={t("acct.backoffice")} />}
          <Row onClick={logout} icon={LogOut} name={t("acct.logout")} />
        </Group>
      </div>

    </AppShell>
  );
};

export default Compte;
