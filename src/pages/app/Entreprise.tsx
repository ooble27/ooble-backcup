import { useEffect, useRef, useState } from "react";
import { useAppSettings } from "@/lib/settings";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, Check, ChevronRight, Clock, FileText, Lock, Plus, Upload, Users } from "lucide-react";
import AppShell from "@/components/app/AppShell";
import { BuildingGlyph } from "@/components/app/BusinessMark";
import { Action, Actions, StepHeader } from "@/components/app/Flat";
import { getMyProfile, peekMyProfile, type MyProfile } from "@/lib/profile";
import { getMyKyc, peekMyKyc, type KycDbStatus } from "@/lib/kyc";
import {
  getMyKyb, peekMyKyb, submitKyb, KYB_ACCEPT, KYB_DOCS, KYB_MAX_FILE,
  type BusinessInfo, type BusinessOwner, type KybDocKey, type KybStatus, type MyKyb, type OwnerRole,
} from "@/lib/kyb";
import { useAuth } from "@/lib/auth";
import { useLang, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { TKey } from "@/lib/translations";

/* La vérification est un dossier en trois sections que le client remplit dans
   l'ordre qu'il veut ; l'envoi se débloque quand les trois sont complètes. */
type View = "hub" | "company" | "people" | "person" | "docs" | "done";

/* Lieu d'immatriculation : Canada seulement. La valeur enregistrée est le nom
   français (lu par l'équipe conformité), l'affichage suit la langue. */
const QC = { fr: "Québec", en: "Quebec" };
const FED = { fr: "Fédéral (Corporations Canada)", en: "Federal (Corporations Canada)" };
const OTHER_PROVINCES = [
  { fr: "Ontario", en: "Ontario" },
  { fr: "Colombie-Britannique", en: "British Columbia" },
  { fr: "Alberta", en: "Alberta" },
  { fr: "Manitoba", en: "Manitoba" },
  { fr: "Saskatchewan", en: "Saskatchewan" },
  { fr: "Nouvelle-Écosse", en: "Nova Scotia" },
  { fr: "Nouveau-Brunswick", en: "New Brunswick" },
  { fr: "Île-du-Prince-Édouard", en: "Prince Edward Island" },
  { fr: "Terre-Neuve-et-Labrador", en: "Newfoundland and Labrador" },
  { fr: "Yukon", en: "Yukon" },
  { fr: "Territoires du Nord-Ouest", en: "Northwest Territories" },
  { fr: "Nunavut", en: "Nunavut" },
];
const ALL_PLACES = [QC, FED, ...OTHER_PROVINCES];
const ROLE_FULL: Record<OwnerRole, TKey> = { director: "kyb.roleDirector", owner: "kyb.roleOwner", both: "kyb.roleBoth" };
const ROLE_SHORT: Record<OwnerRole, TKey> = { director: "kyb.roleDirector", owner: "kyb.roleOwnerShort", both: "kyb.roleBothShort" };
const DOC_KEYS: Record<KybDocKey, { title: TKey; sub: TKey }> = {
  incorporation: { title: "kyb.docIncorp", sub: "kyb.docIncorpSub" },
  registry: { title: "kyb.docRegistry", sub: "kyb.docRegistrySub" },
  address_proof: { title: "kyb.docAddress", sub: "kyb.docAddressSub" },
};
const STATUS_PILL: Record<KybStatus, { key: TKey; icon?: React.ElementType }> = {
  not_started: { key: "kyb.pillTodo" },
  pending: { key: "kyb.pillPending", icon: Clock },
  approved: { key: "kyb.pillApproved", icon: Check },
  rejected: { key: "kyb.pillRejected", icon: AlertCircle },
};

const emptyOwner = (): BusinessOwner => ({ name: "", role: "both", ownership: 100, birthDate: "", country: "Canada" });
const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

/* ─── Briques d'interface ─── */

/** Ligne de saisie d'une carte groupée (même style que l'inscription). */
const Row = ({ label, children, last, group }: { label: string; children: React.ReactNode; last?: boolean; group?: boolean }) => {
  // Un groupe de boutons ne doit pas être dans un <label> : un toucher sur la
  // ligne activerait le premier bouton.
  const Tag = group ? "div" : "label";
  return (
    <Tag
      role={group ? "group" : undefined}
      aria-label={group ? label : undefined}
      className="block py-3.5"
      data-last={last ? "" : undefined}
    >
      <span className="ac-k block">{label}</span>
      <div className="mt-1">{children}</div>
    </Tag>
  );
};
const bare = "w-full bg-transparent text-[16px] text-foreground outline-none placeholder:text-muted-foreground/40";

/** Choix en mots soulignés. */
const Segmented = <V extends string>({ value, options, onChange }: { value: V; options: { v: V; label: string }[]; onChange: (v: V) => void }) => (
  <div className="ac-opts flex-wrap pt-1" style={{ gap: "6px 18px" }}>
    {options.map((o) => (
      <button key={o.v} type="button" aria-pressed={value === o.v} onClick={() => onChange(o.v)} style={{ fontSize: 15 }}>{o.label}</button>
    ))}
  </div>
);

const SectionTitle = ({ title, sub }: { title: string; sub?: string }) => (
  <div className="mb-6">
    <h2 className="ac-title">{title}</h2>
    {sub && <p className="ac-sub">{sub}</p>}
  </div>
);

const ErrorLine = ({ msg }: { msg: string | null }) =>
  msg ? (
    <p role="alert" className="ac-note flex items-start gap-2">
      <AlertCircle className="mt-[1px] h-4 w-4 shrink-0" /> {msg}
    </p>
  ) : null;

/* ─── Page ─── */

const Entreprise = () => {
  const navigate = useNavigate();
  const t = useT();
  const { user, isStaff } = useAuth();
  const { verificationEnabled } = useAppSettings();
  const [lang] = useLang();
  const placeLabel = (v: string) => ALL_PLACES.find((p) => p.fr === v || p.en === v)?.[lang] ?? v;
  // Avant l'ouverture, l'équipe peut parcourir la vérification d'entreprise pour la tester.
  const kybOpen = verificationEnabled || isStaff;

  // Données déjà chargées (préchargement de l'app) : la page s'affiche tout
  // de suite ; la lecture en arrière-plan ne met à jour que les statuts.
  const [cached] = useState(() => {
    const p = peekMyProfile(user?.id), k = peekMyKyb(user?.id), c = peekMyKyc(user?.id);
    return p !== undefined && k !== undefined && c !== undefined ? { p, k, c } : null;
  });
  const initForm = (p: MyProfile | null, k: MyKyb | null) => ({
    info: k ? k.info : {
      legalName: p?.businessName ?? "", businessNumber: p?.businessNumber ?? "", jurisdiction: "",
      address: p?.businessAddress ?? "", phone: p?.businessPhone ?? "", activity: "", website: "",
    },
    owners: k ? k.owners : p?.fullName ? [{ ...emptyOwner(), name: p.fullName }] : [],
  });
  const [loading, setLoading] = useState(!cached);
  const [profile, setProfile] = useState<MyProfile | null>(cached?.p ?? null);
  const [kyb, setKyb] = useState<MyKyb | null>(cached?.k ?? null);
  const [kyc, setKyc] = useState<KycDbStatus>(cached?.c?.status ?? "not_started");
  const [view, setView] = useState<View>("hub");

  const [info, setInfo] = useState<BusinessInfo>(() => initForm(cached?.p ?? null, cached?.k ?? null).info);
  const [owners, setOwners] = useState<BusinessOwner[]>(() => (cached ? initForm(cached.p, cached.k).owners : []));
  const [files, setFiles] = useState<Partial<Record<KybDocKey, File>>>({});
  const [attest, setAttest] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Brouillons des sous-écrans (validés seulement à « Enregistrer »).
  const [draftInfo, setDraftInfo] = useState<BusinessInfo>(info);
  const [draftOwner, setDraftOwner] = useState<BusinessOwner>(emptyOwner());
  const [editIdx, setEditIdx] = useState<number>(-1);
  const [otherOpen, setOtherOpen] = useState(false);

  useEffect(() => {
    Promise.all([getMyProfile(), getMyKyb(), getMyKyc()]).then(([p, k, c]) => {
      setProfile(p);
      setKyb(k);
      setKyc(c?.status ?? "not_started");
      // Formulaire déjà rempli depuis le cache : on ne l'écrase pas (saisie en cours).
      if (!cached || k?.status !== cached.k?.status) {
        const f = initForm(p, k);
        setInfo(f.info);
        setOwners(f.owners);
      }
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const status: KybStatus = kyb?.status ?? "not_started";
  const editable = kybOpen && (status === "not_started" || status === "rejected");
  const companyName = info.legalName || profile?.businessName || "";

  /* ─── Règles de complétude ─── */
  const infoError = (i: BusinessInfo): TKey | null => {
    if (!i.legalName.trim()) return "kyb.errLegalName";
    if (!i.jurisdiction) return "kyb.errJurisdiction";
    if (!i.address.trim()) return "kyb.errAddress";
    if (i.activity.trim().length < 3) return "kyb.errActivity";
    return null;
  };
  const ownerError = (o: BusinessOwner): TKey | null => {
    if (!o.name.trim() || !o.birthDate || !o.country.trim()) return "kyb.errPersonIncomplete";
    if (o.role !== "director" && (o.ownership < 25 || o.ownership > 100)) return "kyb.errOwnership";
    return null;
  };
  const sumOwned = (os: BusinessOwner[]) => os.reduce((s, o) => s + (o.role === "director" ? 0 : Number(o.ownership) || 0), 0);
  const companyDone = !infoError(info);
  const peopleDone = owners.length > 0 && owners.every((o) => !ownerError(o)) && sumOwned(owners) <= 100;
  const requiredDocs = KYB_DOCS.filter((d) => d.required);
  const docsDone = requiredDocs.every((d) => files[d.key]);
  const doneCount = [companyDone, peopleDone, docsDone].filter(Boolean).length;

  const go = (v: View) => { setError(null); setView(v); window.scrollTo({ top: 0 }); };

  const submit = async () => {
    if (!attest) { setError(t("kyb.errAttest")); return; }
    setSending(true);
    setError(null);
    const res = await submitKyb(info, owners, files);
    setSending(false);
    if (res.error) { setError(res.error); return; }
    setKyb(await getMyKyb());
    go("done");
  };

  /* ─── En-tête ─── */
  const back = view === "hub" || view === "done" ? () => navigate("/app/compte") : view === "person" ? () => go("people") : () => go("hub");
  const header = <StepHeader title={t("kyb.headerTitle")} onBack={back} />;

  if (loading) {
    return (
      <AppShell header={header}>
        {null}
      </AppShell>
    );
  }

  if (profile && profile.accountType !== "business") {
    return (
      <AppShell header={header}>
        <div>
          <p className="text-[15px] text-muted-foreground">{t("kyb.notBusiness")}</p>
          <Link to="/app/verification" className="ac-link mt-4">
            {t("kyb.goKyc")} <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </AppShell>
    );
  }

  /* ─── Section : l'entreprise ─── */
  if (view === "company") {
    const set = (k: keyof BusinessInfo) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setError(null); setDraftInfo((i) => ({ ...i, [k]: e.target.value })); };
    const save = () => {
      const err = infoError(draftInfo);
      if (err) { setError(t(err)); return; }
      setInfo(draftInfo);
      go("hub");
    };
    return (
      <AppShell header={header}>
        <SectionTitle title={t("kyb.secCompany")} sub={t("kyb.infoSub")} />
        <div className="ac-lines">
          <Row label={t("kyb.legalName")}>
            <input className={bare} value={draftInfo.legalName} onChange={set("legalName")} maxLength={200} autoComplete="organization" placeholder="Ooble Technologies inc." />
          </Row>
          <Row label={t("kyb.jurisdiction")} group>
            <Segmented
              value={draftInfo.jurisdiction === QC.fr || draftInfo.jurisdiction === FED.fr ? draftInfo.jurisdiction : otherOpen || draftInfo.jurisdiction ? "other" : ""}
              options={[
                { v: QC.fr, label: QC[lang] },
                { v: FED.fr, label: t("kyb.jurFed") },
                { v: "other", label: t("kyb.jurOther") },
              ]}
              onChange={(v) => {
                setError(null);
                if (v === "other") { setOtherOpen(true); setDraftInfo((i) => ({ ...i, jurisdiction: OTHER_PROVINCES.some((p) => p.fr === i.jurisdiction) ? i.jurisdiction : "" })); }
                else { setOtherOpen(false); setDraftInfo((i) => ({ ...i, jurisdiction: v })); }
              }}
            />
            {(otherOpen || OTHER_PROVINCES.some((p) => p.fr === draftInfo.jurisdiction)) && (
              <select
                aria-label={t("kyb.chooseProvince")}
                value={draftInfo.jurisdiction}
                onChange={(e) => { setError(null); setDraftInfo((i) => ({ ...i, jurisdiction: e.target.value })); }}
                className="ac-in mt-2.5"
              >
                <option value="" disabled>{t("kyb.chooseProvince")}</option>
                {OTHER_PROVINCES.map((p) => <option key={p.fr} value={p.fr}>{p[lang]}</option>)}
              </select>
            )}
          </Row>
          <Row label={t("kyb.number")}>
            <input className={cn(bare, "font-mono tracking-wide")} value={draftInfo.businessNumber} onChange={set("businessNumber")} maxLength={60} inputMode="numeric" placeholder={t("kyb.numberHint")} />
          </Row>
          <Row label={t("kyb.address")}>
            <input className={bare} value={draftInfo.address} onChange={set("address")} maxLength={300} autoComplete="street-address" />
          </Row>
          <Row label={t("kyb.phone")}>
            <input className={bare} type="tel" value={draftInfo.phone} onChange={set("phone")} maxLength={40} autoComplete="tel" placeholder={t("regb.optional")} />
          </Row>
          <Row label={t("kyb.website")}>
            <input className={bare} value={draftInfo.website} onChange={set("website")} maxLength={200} placeholder={t("regb.optional")} />
          </Row>
          <Row label={t("kyb.activity")} last>
            <textarea className={cn(bare, "resize-none leading-relaxed")} rows={3} value={draftInfo.activity} onChange={set("activity")} maxLength={500} placeholder={t("kyb.activityHint")} />
          </Row>
        </div>
        <ErrorLine msg={error} />
        <Actions><Action onClick={save}>{t("kyb.save")}</Action></Actions>
      </AppShell>
    );
  }

  /* ─── Section : les personnes ─── */
  if (view === "people") {
    const owned = sumOwned(owners);
    return (
      <AppShell header={header}>
        <SectionTitle title={t("kyb.secPeople")} sub={t("kyb.peopleSub")} />
        <div className="ac-lines">
          {owners.map((o, i) => {
            const incomplete = !!ownerError(o);
            return (
              <button
                key={i}
                type="button"
                onClick={() => { setEditIdx(i); setDraftOwner(o); go("person"); }}
                className="ac-row"
              >
                <span className="w-8 shrink-0 text-[14px] font-semibold text-muted-foreground">{initials(o.name)}</span>
                <span className="ac-txt">
                  <span className="ac-n">{o.name || t("kyb.newPerson")}</span>
                  <span className={cn("ac-d", incomplete && "font-medium text-foreground")}>
                    {incomplete ? t("kyb.personIncomplete") : `${t(ROLE_FULL[o.role])}${o.role !== "director" ? ` · ${o.ownership} %` : ""}`}
                  </span>
                </span>
                <ChevronRight className="ac-go" />
              </button>
            );
          })}
          {owners.length < 20 && (
            <button
              type="button"
              onClick={() => { setEditIdx(-1); setDraftOwner({ ...emptyOwner(), role: owners.length ? "director" : "both", ownership: owners.length ? 0 : 100 }); go("person"); }}
              className="ac-row"
            >
              <Plus className="ac-ico" strokeWidth={1.8} />
              <span className="ac-txt"><span className="ac-n">{t("kyb.addPerson")}</span></span>
            </button>
          )}
        </div>
        <p className={owned > 100 ? "ac-note" : "ac-help"}>
          {t("kyb.ownedTotal")} {owned} %
        </p>
        <Actions><Action onClick={() => go("hub")}>{t("kyb.done")}</Action></Actions>
      </AppShell>
    );
  }

  /* ─── Fiche d'une personne ─── */
  if (view === "person") {
    const o = draftOwner;
    const setO = (patch: Partial<BusinessOwner>) => { setError(null); setDraftOwner((d) => ({ ...d, ...patch })); };
    const save = () => {
      const err = ownerError(o);
      if (err) { setError(t(err)); return; }
      const next = editIdx >= 0 ? owners.map((x, i) => (i === editIdx ? o : x)) : [...owners, o];
      if (sumOwned(next) > 100) { setError(t("kyb.errOwnershipSum")); return; }
      setOwners(next);
      go("people");
    };
    return (
      <AppShell header={header}>
        <SectionTitle title={editIdx >= 0 ? o.name || t("kyb.newPerson") : t("kyb.newPerson")} />
        <div className="ac-lines">
          <Row label={t("kyb.personName")}>
            <input className={bare} value={o.name} onChange={(e) => setO({ name: e.target.value })} maxLength={120} autoComplete="off" />
          </Row>
          <Row label={t("kyb.role")} group>
            <Segmented<OwnerRole>
              value={o.role}
              options={(Object.keys(ROLE_SHORT) as OwnerRole[]).map((r) => ({ v: r, label: t(ROLE_SHORT[r]) }))}
              onChange={(role) => setO({ role, ownership: role === "director" ? 0 : Math.max(25, o.ownership || 25) })}
            />
          </Row>
          {o.role !== "director" && (
            <Row label={t("kyb.ownership")}>
              <div className="flex items-center gap-2">
                <input
                  className={cn(bare, "w-12 tabular-nums")}
                  type="number"
                  inputMode="numeric"
                  min={25}
                  max={100}
                  value={o.ownership}
                  onChange={(e) => setO({ ownership: Number(e.target.value) })}
                />
                <span className="text-[15px] text-muted-foreground">%</span>
              </div>
            </Row>
          )}
          <Row label={t("kyb.birthDate")}>
            <input className={bare} type="date" value={o.birthDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setO({ birthDate: e.target.value })} />
          </Row>
          <Row label={t("kyb.country")} last>
            <input className={bare} value={o.country} onChange={(e) => setO({ country: e.target.value })} maxLength={60} />
          </Row>
        </div>
        <ErrorLine msg={error} />
        <Actions>
          <Action onClick={save}>{t("kyb.save")}</Action>
          {editIdx >= 0 && (
            <Action quiet onClick={() => { setOwners((os) => os.filter((_, i) => i !== editIdx)); go("people"); }}>{t("kyb.deletePerson")}</Action>
          )}
        </Actions>
      </AppShell>
    );
  }

  /* ─── Section : les documents ─── */
  if (view === "docs") {
    return (
      <AppShell header={header}>
        <SectionTitle title={t("kyb.secDocs")} sub={t("kyb.docsSub")} />
        <div className="ac-lines">
          {KYB_DOCS.map((d, i) => (
            <DocRow
              key={d.key}
              title={t(DOC_KEYS[d.key].title)}
              sub={t(DOC_KEYS[d.key].sub)}
              optional={!d.required}
              file={files[d.key] ?? null}
              last={i === KYB_DOCS.length - 1}
              onFile={(f) => {
                if (f.size > KYB_MAX_FILE) { setError(t("kyb.errTooBig")); return; }
                setError(null);
                setFiles((fs) => ({ ...fs, [d.key]: f }));
              }}
              t={t}
            />
          ))}
        </div>
        <ErrorLine msg={error} />
        <p className="ac-help flex items-start gap-2.5">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.9} /> {t("kyb.privacy")}
        </p>
        <Actions><Action onClick={() => go("hub")}>{t("kyb.done")}</Action></Actions>
      </AppShell>
    );
  }

  /* ─── Envoyé ─── */
  if (view === "done") {
    return (
      <AppShell header={header}>
        <Check className="h-8 w-8 text-foreground" strokeWidth={2} />
        <h2 className="ac-title mt-4">{t("kyb.doneTitle")}</h2>
        <p className="ac-sub">{t("kyb.doneSub")}</p>
        <Actions><Action to="/app">{t("kyb.backHome")}</Action></Actions>
      </AppShell>
    );
  }

  /* ─── Dossier (accueil) ─── */
  const pill = STATUS_PILL[status];
  const docCount = requiredDocs.filter((d) => files[d.key]).length;
  const sections = [
    {
      id: "company" as View,
      icon: null,
      title: t("kyb.secCompany"),
      done: companyDone,
      summary: companyDone ? [info.legalName, placeLabel(info.jurisdiction)].filter(Boolean).join(" · ") : t("kyb.secCompanyTodo"),
      open: () => { setDraftInfo(info); go("company"); },
    },
    {
      id: "people" as View,
      icon: Users,
      title: t("kyb.secPeople"),
      done: peopleDone,
      summary: owners.length ? `${owners.length} ${t(owners.length > 1 ? "kyb.persons" : "kyb.personOne")}${peopleDone ? "" : ` · ${t("kyb.toComplete")}`}` : t("kyb.secPeopleTodo"),
      open: () => go("people"),
    },
    {
      id: "docs" as View,
      icon: FileText,
      title: t("kyb.secDocs"),
      done: docsDone,
      summary: docCount ? `${docCount} / ${requiredDocs.length} ${t("kyb.required")}` : t("kyb.secDocsTodo"),
      open: () => go("docs"),
    },
  ];

  return (
    <AppShell header={header}>
      {/* Identité de l'entreprise */}
      <p className="ac-name">{companyName || t("acct.business")}</p>
      <p className="ac-meta flex flex-wrap items-center gap-x-1.5">
        {t("kyb.accountBusiness")} ·
        <span className="inline-flex items-center gap-1 text-foreground">{pill.icon && <pill.icon className="h-3.5 w-3.5" strokeWidth={2.2} />} {t(pill.key)}</span>
      </p>

      {/* Message selon le statut */}
      {status === "pending" && <Notice tone="neutral" text={t("kyb.stPendingSub")} />}
      {status === "approved" && <Notice tone="ok" text={t("kyb.stApprovedSub")} />}
      {status === "rejected" && (
        <Notice tone="error" title={t("kyb.reviewNote")} text={kyb?.reviewNote || t("kyb.stRejectedSub")} />
      )}
      {status === "not_started" && <p className="ac-help mt-5">{t("kyb.stNoneSub")}</p>}

      {/* Les trois sections */}
      <div className="mt-10 flex items-baseline justify-between">
        <p className="ac-k">{t("kyb.fileTitle")}</p>
        {editable && <p className="text-[12.5px] tabular-nums text-muted-foreground">{doneCount} / 3</p>}
      </div>
      <div className="ac-lines mt-1">
        {sections.map((s) => {
          const Content = (
            <>
              {s.done
                ? <Check className="ac-ico" strokeWidth={2.2} style={{ color: "hsl(var(--foreground))" }} />
                : s.icon ? <s.icon className="ac-ico" strokeWidth={1.7} /> : <BuildingGlyph className="ac-ico" />}
              <span className="ac-txt">
                <span className="ac-n">{s.title}</span>
                <span className="ac-d">{s.summary}</span>
              </span>
              {editable && <ChevronRight className="ac-go" />}
            </>
          );
          return editable ? (
            <button key={s.id} type="button" onClick={s.open} className="ac-row">{Content}</button>
          ) : (
            <div key={s.id} className="ac-row static">{Content}</div>
          );
        })}
      </div>

      {/* Identité du responsable (requise, vérifiée à part) */}
      {kyc !== "approved" && (
        <Link to="/app/verification" className="ac-row mt-2" style={{ borderTop: "1px solid hsl(var(--border))" }}>
          <span className="w-[21px] shrink-0 text-[13px] font-semibold text-muted-foreground">{initials(profile?.fullName ?? user?.name ?? "")}</span>
          <span className="ac-txt">
            <span className="ac-n">{t("kyb.repTitle")}</span>
            <span className="ac-d" style={{ whiteSpace: "normal" }}>{kyc === "pending" ? t("kyb.repPending") : t("kyb.repTodo")}</span>
          </span>
          <ChevronRight className="ac-go" />
        </Link>
      )}

      {/* Envoi */}
      {editable && (
        <div className="mt-10">
          <label className={cn("flex items-start gap-3", doneCount === 3 ? "cursor-pointer" : "opacity-50")}>
            <input
              type="checkbox"
              disabled={doneCount < 3}
              className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-foreground"
              checked={attest}
              onChange={(e) => setAttest(e.target.checked)}
            />
            <span className="text-[13.5px] leading-relaxed text-muted-foreground">{t("kyb.attest")}</span>
          </label>
          <ErrorLine msg={error} />
          <Actions>
            <Action disabled={doneCount < 3 || sending} onClick={submit}>{doneCount < 3 ? t("kyb.completeToSend") : t("kyb.submit")}</Action>
          </Actions>
        </div>
      )}

      {!kybOpen && (status === "not_started" || status === "rejected") && (
        <p className="ac-help mt-8 flex items-center gap-2">
          <Clock className="h-4 w-4" /> {t("kyb.notOpenYet")}
        </p>
      )}
    </AppShell>
  );
};

/* ─── Composants ─── */

function Notice({ tone, title, text }: { tone: "neutral" | "ok" | "error"; title?: string; text: string }) {
  return (
    <div className="mt-6">
      {title && <p className="ac-k">{title}</p>}
      <p className={cn("whitespace-pre-wrap", tone === "error" ? "ac-note" : "ac-help")} style={title ? { marginTop: 6 } : undefined}>{text}</p>
    </div>
  );
}

function DocRow({
  title, sub, optional, file, last, onFile, t,
}: {
  title: string; sub: string; optional: boolean; file: File | null; last: boolean;
  onFile: (f: File) => void; t: (k: TKey) => string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  return (
    <div
      className={cn("flex items-start gap-3.5 py-4 transition-opacity", drag && "opacity-60")}
      data-last={last ? "" : undefined}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
    >
      {file
        ? <Check className="mt-0.5 h-5 w-5 shrink-0 text-foreground" strokeWidth={2.2} />
        : <FileText className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={1.7} />}
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-medium">
          {title}
          {optional && <span className="ml-1.5 text-[12px] font-normal text-muted-foreground">{t("regb.optional")}</span>}
        </p>
        <p className={cn("mt-0.5 text-[12.5px] leading-snug", file ? "truncate text-foreground/80" : "text-muted-foreground")}>
          {file ? file.name : sub}
        </p>
      </div>
      <input
        ref={ref}
        type="file"
        accept={KYB_ACCEPT}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className={file ? "ac-act quiet shrink-0" : "ac-link mt-0.5 shrink-0"}
      >
        {!file && <Upload className="h-3.5 w-3.5" />}
        {file ? t("kyb.replace") : t("kyb.add")}
      </button>
    </div>
  );
}

export default Entreprise;
