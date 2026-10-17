import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, Building2, ChevronRight, Copy, Gauge, Globe, Handshake, LayoutGrid, Lock, LogOut, Mail, ShieldCheck, SunMoon, Trash2,
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

/*
 * Mon compte, dans l'esprit des Réglages du back-office : rien n'est encadré, la typographie fait
 * la structure. Des groupes (titre, une phrase), des lignes à plat qui glissent au survol, les
 * choix en mots soulignés. Les couleurs de l'app seulement (texte et gris), dans les deux thèmes.
 */

const AC_CSS = `
.ac-name { margin: 0; font-size: clamp(26px, 3.4vw, 36px); line-height: 1.1; font-weight: 600; letter-spacing: -0.04em; color: hsl(var(--foreground)); overflow-wrap: anywhere; }
.ac-meta { margin: 6px 0 0; font-size: 14px; line-height: 1.55; color: hsl(var(--muted-foreground)); overflow-wrap: anywhere; }
.ac-todo { display: block; margin-top: 28px; max-width: 620px; color: inherit; text-decoration: none; transition: transform .35s cubic-bezier(.22,1,.36,1); }
.ac-todo-t { display: block; font-size: 19px; font-weight: 600; letter-spacing: -0.02em; color: hsl(var(--foreground)); }
.ac-todo-s { display: block; margin-top: 4px; font-size: 14px; line-height: 1.55; color: hsl(var(--muted-foreground)); }
.ac-todo-c { display: inline-flex; align-items: center; gap: 6px; margin-top: 10px; font-size: 14.5px; font-weight: 500; color: hsl(var(--foreground)); text-decoration: underline; text-underline-offset: 5px; text-decoration-thickness: 1.5px; }
.ac-grid { display: grid; gap: 44px 72px; margin-top: 44px; }
@media (min-width: 1024px) { .ac-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.ac-gt { margin: 0; font-size: 19px; font-weight: 600; letter-spacing: -0.03em; color: hsl(var(--foreground)); }
.ac-gs { margin: 4px 0 8px; font-size: 13.5px; line-height: 1.5; color: hsl(var(--muted-foreground)); max-width: 560px; }
.ac-row { display: flex; align-items: center; gap: 16px; width: 100%; padding: 13px 0; border: none; background: none; font: inherit; text-align: left; color: inherit; text-decoration: none; cursor: pointer; -webkit-tap-highlight-color: transparent; transition: transform .35s cubic-bezier(.22,1,.36,1); }
.ac-row.static { cursor: default; }
.ac-row:not(.static):active, .ac-todo:active { transform: translateX(6px); }
@media (hover: hover) {
  .ac-row:not(.static):hover, .ac-todo:hover { transform: translateX(6px); }
  .ac-row:not(.static):hover .ac-ico, .ac-row:not(.static):hover .ac-go { color: hsl(var(--foreground)); }
  .ac-row:not(.static):hover .ac-go { transform: translateX(3px); }
}
.ac-row:focus-visible, .ac-todo:focus-visible { outline: 2px solid hsl(var(--foreground)); outline-offset: 4px; border-radius: 6px; }
.ac-ico { width: 21px; height: 21px; flex-shrink: 0; color: hsl(var(--muted-foreground)); transition: color .2s; }
.ac-txt { flex: 1; min-width: 0; }
.ac-n { display: block; font-size: 15.5px; font-weight: 500; letter-spacing: -0.01em; color: hsl(var(--foreground)); }
.ac-d { display: block; margin-top: 2px; font-size: 13px; line-height: 1.5; color: hsl(var(--muted-foreground)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ac-v { flex-shrink: 0; max-width: 45%; text-align: right; font-size: 13.5px; color: hsl(var(--muted-foreground)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
.ac-go { width: 17px; height: 17px; flex-shrink: 0; color: hsl(var(--muted-foreground)); transition: transform .35s cubic-bezier(.22,1,.36,1), color .2s; }
.ac-opts { display: flex; flex-shrink: 0; gap: 16px; }
.ac-opts button { border: none; background: none; padding: 4px 0; font: inherit; font-size: 14px; color: hsl(var(--muted-foreground)); cursor: pointer; text-underline-offset: 6px; text-decoration-thickness: 1.5px; transition: color .15s; }
.ac-opts button[aria-pressed="true"] { color: hsl(var(--foreground)); text-decoration: underline; }
@media (hover: hover) { .ac-opts button:hover { color: hsl(var(--foreground)); } }
.ac-opts button:focus-visible { outline: 2px solid hsl(var(--foreground)); outline-offset: 3px; border-radius: 4px; }
@media (prefers-reduced-motion: reduce) { .ac-row, .ac-todo, .ac-go { transition: none; } }
`;

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
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">{t("acct.title")}</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">{t("acct.sub")}</p>
        </div>
      }
    >
      <style>{AC_CSS}</style>

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
          <Row to="/reinitialiser" icon={Lock} name={t("acct.password")} desc="••••••••" />
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
