import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Building2, Check, ChevronRight, Copy, Gauge, Gift, Globe, Handshake, HelpCircle, KeyRound, LayoutGrid, Link2, Lock, LogOut, Mail, Share2, Trash2, MessageCircle } from "lucide-react";
import { useOtcVisible } from "@/lib/otc";
import { useAppSettings } from "@/lib/settings";
import { useSupportUnread } from "@/lib/support";
import AppShell from "@/components/app/AppShell";
import { useAuth } from "@/lib/auth";
import { getMyProfile, peekMyProfile, type MyProfile } from "@/lib/profile";
import { getMyKyc, peekMyKyc, type KycDbStatus } from "@/lib/kyc";
import { useLang, useT } from "@/lib/i18n";
import type { TKey } from "@/lib/translations";
import { bpsText, myReferral, referralLink, type MyReferral } from "@/lib/growth";
import { PeekMascot } from "@/components/launch/PlayLogin";

/*
 * Mon compte (nouveau design, variante C) : la mascotte dépasse d'une carte de profil où l'identité à vérifier
 * est mise en avant, puis des tuiles de couleur (Sécurité, Interac, Limites, Parrainage…). Chaque tuile ouvre
 * sa vue (?v=…), dans une carte blanche, avec un retour vers Mon compte.
 */

type View = "securite" | "interac" | "parrainage" | "entreprise";

const ACC_CSS = `
.acc-profile { position: relative; z-index: 2; text-align: center; padding: 20px 18px 16px; }
.acc-id { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 14px; padding: 10px 10px 10px 14px; border: 2.5px solid #111; border-radius: 18px; background: #f3f3f0; text-align: left; color: #111; text-decoration: none; }
.acc-id + .acc-id { margin-top: 8px; }
.acc-id b { display: block; font-size: 14px; font-weight: 500; }
.acc-id span.s { font-size: 12.5px; color: #333; }
.acc-go { flex-shrink: 0; display: inline-flex; align-items: center; height: 38px; padding: 0 16px; border-radius: 999px; background: #111; color: #fff; font-size: 13px; font-weight: 500; white-space: nowrap; }
.acc-tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
.acc-span { grid-column: 1 / -1; }
.acc-tile { display: flex; flex-direction: column; justify-content: space-between; gap: 14px; min-height: 128px; padding: 14px; border: 3px solid #111; border-radius: 24px; color: #111; text-decoration: none; transition: transform .15s; }
.acc-tile:active { transform: scale(.97); }
@media (hover: hover) { .acc-tile:hover { transform: translateY(-2px); } }
.acc-tile-ic { width: 40px; height: 40px; border-radius: 999px; background: #111; color: #fff; display: flex; align-items: center; justify-content: center; }
.acc-tile.dk { color: #fff; }
.acc-tile.dk .acc-tile-ic { background: #fff; color: #111; }
.acc-tile b { display: block; font-size: 17px; font-weight: 500; letter-spacing: -0.01em; }
.acc-tile span.s { display: block; margin-top: 2px; font-size: 12px; line-height: 1.35; }
.acc-lang { margin-top: 12px; padding: 10px 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.acc-out { margin-top: 12px; display: flex; align-items: center; justify-content: space-between; width: 100%; height: 54px; padding: 0 22px; border: none; border-radius: 999px; background: #111; color: #fff; font: inherit; font-size: 15px; font-weight: 500; cursor: pointer; }
.acc-out:active { transform: scale(.98); }
.acc-desk { display: none; }
.acc-tiles .acc-tile { height: 100%; }
@media (min-width: 768px) {
  .acc-profile { padding: 26px 28px 20px; }
  .acc-tiles { gap: 14px; margin-top: 16px; }
  .acc-tile { min-height: 168px; padding: 18px; }
  .acc-tile b { font-size: 19px; }
}
@media (min-width: 1024px) {
  .acc-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 0 28px; align-items: start; }
  .acc-desk { display: block; }
  .acc-mob { display: none; }
  .acc-tiles { margin-top: 98px; }
  .acc-tile { min-height: 186px; }
}
`;

const Tile = ({ to, icon: Icon, title, sub, bg }: { to: string; icon: React.ElementType; title: string; sub?: string; bg: string }) => (
  <Link to={to} className={bg === "#111" ? "acc-tile dk" : "acc-tile"} style={{ background: bg }}>
    <span className="acc-tile-ic"><Icon className="h-[19px] w-[19px]" strokeWidth={2} /></span>
    <span><b>{title}</b>{sub && <span className="s">{sub}</span>}</span>
  </Link>
);


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

/** Ligne à copier : un toucher copie la valeur (l'icône de copie, à droite, devient une coche). */
const CopyLine = ({ icon: Icon, name, value, shown, mono }: { icon: React.ElementType; name: string; value: string; shown?: string; mono?: boolean }) => {
  const [lang] = useLang();
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      window.setTimeout(() => setDone(false), 1500);
    } catch { /* presse-papiers indisponible */ }
  };
  const Mark = done ? Check : Copy;
  return (
    <button type="button" className="ac-row" onClick={copy} aria-label={lang === "en" ? `Copy ${name}` : `Copier ${name}`}>
      <Icon className="ac-ico" strokeWidth={1.7} />
      <span className="ac-txt">
        <span className="ac-d" style={{ marginTop: 0 }}>{name}</span>
        <span className="ac-n" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined }}>{shown ?? value}</span>
      </span>
      <Mark className="ac-go" strokeWidth={1.8} aria-hidden />
    </button>
  );
};

const Compte = () => {
  const { user, signOut, isStaff } = useAuth();
  const t = useT();
  const supportUnread = useSupportUnread();
  const otc = useOtcVisible();
  const { verificationEnabled } = useAppSettings();
  const [lang, setLang] = useLang();
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

  const [params] = useSearchParams();
  const view = (params.get("v") as View | null) ?? null;

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

  const back = (to: string, label: string) => (
    // Pas de menu du bas sur cette page : le retour prend la place du titre.
    <Link to={to} className="ac-back" style={{ margin: 0, fontSize: 15 }}>
      <ArrowLeft className="h-4 w-4" />{label}
    </Link>
  );

  const interacOk = !!(profile?.interacQuestion && profile.interacAnswer);
  const refOk = !!(ref?.enabled && ref.code);
  const bizOk = business && !!profile?.businessName;

  // Une tuile ouverte : sa vue dans une carte blanche, avec un retour vers Mon compte.
  if (view === "securite" || (view === "interac" && interacOk) || (view === "parrainage" && refOk) || (view === "entreprise" && bizOk)) {
    return (
      <AppShell header={back("/app/compte", t("acct.backToAccount"))}>
        {view === "securite" && (
          <Group title={t("acct.security")} sub={t("acct.gSecSub")}>
            <Row to="/app/changer-email" icon={Mail} name={t("acct.email")} desc={email} />
            <Row to="/app/mot-de-passe" icon={Lock} name={t("acct.password")} desc="••••••••" />
            {!isStaff && <Row to="/app/supprimer-compte" icon={Trash2} name={t("del.row")} desc={t("del.rowSub")} />}
          </Group>
        )}
        {view === "interac" && profile?.interacQuestion && profile.interacAnswer && (
          <Group title={t("acct.interac")} sub={t("acct.interacSub")}>
            {email && <CopyLine icon={Mail} name={t("acct.interacEmail")} value={email} />}
            <CopyLine icon={HelpCircle} name={t("acct.question")} value={profile.interacQuestion} />
            <CopyLine icon={KeyRound} name={t("acct.answer")} value={profile.interacAnswer} mono />
          </Group>
        )}
        {view === "parrainage" && ref?.enabled && ref.code && (
          <Group title={t("acct.refTitle")} sub={t("acct.refSub").replace("{pct}", bpsText(ref.bonusBps, lang))}>
            <CopyLine icon={Link2} name={t("acct.refLink")} value={referralLink(ref.code)} shown={referralLink(ref.code).replace(/^https?:\/\/(www\.)?/, "")} />
            {typeof navigator !== "undefined" && "share" in navigator && (
              <Row icon={Share2} name={t("acct.refShare")} onClick={() => {
                void navigator.share({ title: "Ooble", text: t("acct.refShareText"), url: referralLink(ref.code!) }).catch(() => {});
              }} />
            )}
            <Row icon={Gift} name={t("acct.refInvited")} value={String(ref.invited)}
              desc={ref.available > 0 ? t("acct.refAvailable").replace("{n}", String(ref.available)) : ref.invited > 0 ? t("acct.refQualified").replace("{n}", String(ref.qualified)) : undefined} />
          </Group>
        )}
        {view === "entreprise" && profile?.businessName && (
          <Group title={t("acct.business")} sub={t("acct.gBizSub")}>
            <Row to="/app/entreprise" icon={Building2} name={profile.businessName} desc={t("acct.viewFile")} />
            {profile.businessNumber && <Row icon={Building2} name="NEQ / BN" value={profile.businessNumber} />}
            {profile.businessAddress && <Row icon={Building2} name={t("regb.address")} desc={profile.businessAddress} />}
            {profile.businessPhone && <Row icon={Building2} name={t("regb.phone")} value={profile.businessPhone} />}
          </Group>
        )}
      </AppShell>
    );
  }

  // Les tuiles : toujours Sécurité, Support et Limites ; Interac, Parrainage, Entreprise, OTC et Back-office quand ils existent.
  const tiles: { to: string; icon: React.ElementType; title: string; sub?: string; bg: string }[] = [
    { to: "/app/compte?v=securite", icon: Lock, title: t("acct.tSecurity"), sub: t("acct.tSecuritySub"), bg: "#ffffff" },
    { to: "/app/support", icon: MessageCircle, title: t("support.title"), sub: supportUnread ? t("support.tileNew") : t("support.tileSub"), bg: "#ffffff" },
    ...(interacOk ? [{ to: "/app/compte?v=interac", icon: Mail, title: "Interac", sub: t("acct.tInteracSub"), bg: "#ffffff" }] : []),
    { to: "/app/limites", icon: Gauge, title: t("acct.limits"), sub: t("acct.limitsSub"), bg: "#ffffff" },
    ...(refOk ? [{ to: "/app/compte?v=parrainage", icon: Gift, title: t("acct.refTitle"), sub: t("acct.tRefSub"), bg: "#ffffff" }] : []),
    ...(bizOk ? [{ to: "/app/compte?v=entreprise", icon: Building2, title: t("acct.business"), sub: t("acct.tBizSub"), bg: "#ffffff" }] : []),
    ...(otc ? [{ to: "/app/otc", icon: Handshake, title: t("nav.otc"), sub: t("dash.otcSub"), bg: "#ffffff" }] : []),
    ...(isStaff ? [{ to: "/admin", icon: LayoutGrid, title: t("acct.backoffice"), sub: t("acct.tStaffSub"), bg: "#ffffff" }] : []),
  ];

  // Ce que montre la ligne d'identité : le statut, et le bouton (vérifier, ou ouvrir le dossier).
  const idLine = (to: string, title: string, status: KycDbStatus | null) => (
    <Link to={to} className="acc-id">
      <span><b>{title}</b><span className="s">{status ? t(STATUS_KEY[status]) : "…"}</span></span>
      <span className="acc-go">{status === "not_started" || !status ? t("acct.verifyCtaShort") : t("acct.verifyOpen")} »</span>
    </Link>
  );

  // La langue et la déconnexion : sous le profil sur ordinateur, tout en bas ailleurs.
  const prefs = (
    <>
      <div className="ap-card acc-lang">
        <span className="flex items-center gap-2 text-[14px] font-medium text-[#111]"><Globe className="h-[18px] w-[18px]" strokeWidth={1.9} />{t("acct.language")}</span>
        <Opts label={t("acct.language")} value={lang} options={[{ v: "fr", label: "Français" }, { v: "en", label: "English" }]} onChange={setLang} />
      </div>
      <button type="button" className="acc-out" onClick={logout}>
        <span className="flex items-center gap-2.5"><LogOut className="h-[18px] w-[18px]" strokeWidth={2} />{t("acct.logout")}</span>
        <span aria-hidden className="text-[20px]">»</span>
      </button>
    </>
  );

  return (
    <AppShell wide bare header={back("/app", t("misc.back"))}>
      <style>{ACC_CSS}</style>
      {/* Téléphone et tablette : les blocs se suivent. Ordinateur : le profil, la langue et la déconnexion
          à gauche, les tuiles à droite. */}
      <div className="acc-grid">
        <div className="acc-left">
          <PeekMascot look={0} typing={false} hide={false} peek={false} />
          <div className="ap-card acc-profile">
            <p className="ac-name" style={{ fontSize: 26 }}>{business ? profile?.businessName || name : name}</p>
            <p className="ac-meta" style={{ marginTop: 4 }}>
              {email}{" · "}{business ? t("kyb.accountBusiness") : t("acct.personal")}{verified && <> · {t("acct.verified")}</>}
            </p>
            {idLine("/app/verification", t("acct.identity"), kyc)}
            {business && bizStatus && idLine("/app/entreprise", t("acct.businessVerif"), bizStatus)}
            {showTodo && <p className="ac-help" style={{ textAlign: "left" }}>{todo.sub}</p>}
          </div>
          <div className="acc-desk">{prefs}</div>
        </div>

        <div className="acc-tiles">
          {tiles.map((x, i) => (
            <div key={x.to} className={tiles.length % 2 === 1 && i === tiles.length - 1 ? "acc-span" : undefined}>
              <Tile {...x} />
            </div>
          ))}
        </div>

        <div className="acc-mob">{prefs}</div>
      </div>
    </AppShell>
  );
};

export default Compte;
