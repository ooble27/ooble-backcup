import { useEffect, useRef, useState } from "react";
import { useAppSettings } from "@/lib/settings";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowLeft, Check, ChevronRight, Clock, FileText, Lock, Plus, Upload, Users } from "lucide-react";
import AppShell from "@/components/app/AppShell";
import BusinessMark, { BuildingGlyph } from "@/components/app/BusinessMark";
import { Button } from "@/components/ui/button";
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
const STATUS_PILL: Record<KybStatus, { key: TKey; cls: string; icon?: React.ElementType }> = {
  not_started: { key: "kyb.pillTodo", cls: "bg-secondary text-muted-foreground" },
  pending: { key: "kyb.pillPending", cls: "bg-secondary text-foreground", icon: Clock },
  approved: { key: "kyb.pillApproved", cls: "bg-primary/10 text-primary", icon: Check },
  rejected: { key: "kyb.pillRejected", cls: "bg-destructive/10 text-destructive", icon: AlertCircle },
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
      className={cn("block px-4 py-3 transition-colors focus-within:bg-secondary/40", !last && "border-b border-border/60")}
    >
      <span className="block text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground/70">{label}</span>
      <div className="mt-1">{children}</div>
    </Tag>
  );
};
const bare = "w-full bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground/35";

const Segmented = <V extends string>({ value, options, onChange }: { value: V; options: { v: V; label: string }[]; onChange: (v: V) => void }) => (
  <div className="flex flex-wrap gap-1.5 pt-0.5">
    {options.map((o) => (
      <button
        key={o.v}
        type="button"
        onClick={() => onChange(o.v)}
        className={cn(
          "rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
          value === o.v ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground",
        )}
      >
        {o.label}
      </button>
    ))}
  </div>
);

const SectionTitle = ({ title, sub }: { title: string; sub?: string }) => (
  <div className="mb-4">
    <h2 className="font-display text-[20px] font-semibold tracking-tight">{title}</h2>
    {sub && <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{sub}</p>}
  </div>
);

const ErrorLine = ({ msg }: { msg: string | null }) =>
  msg ? (
    <p role="alert" className="mt-3 flex items-start gap-2 text-[13px] text-destructive">
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
  const header = (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={back}
        aria-label={t("misc.back")}
        className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-secondary text-foreground transition-colors hover:bg-secondary/70 active:scale-95"
      >
        <ArrowLeft className="h-[18px] w-[18px]" />
      </button>
      <h1 className="font-display text-[22px] font-semibold tracking-tight">{t("kyb.headerTitle")}</h1>
    </div>
  );

  if (loading) {
    return (
      <AppShell header={header}>
        <div className="py-16 text-center text-[13px] text-muted-foreground">{t("kyc.loading")}</div>
      </AppShell>
    );
  }

  if (profile && profile.accountType !== "business") {
    return (
      <AppShell header={header}>
        <div className="rounded-2xl border border-border bg-card px-5 py-8 text-center">
          <p className="text-[14px] text-muted-foreground">{t("kyb.notBusiness")}</p>
          <Link to="/app/verification" className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground hover:underline">
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
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
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
                className="mt-2.5 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-[14.5px] text-foreground outline-none focus-visible:border-foreground/50"
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
        <div className="mt-5 flex justify-end">
          <Button variant="appSolid" shape="rounded" size="lg" className="px-7" onClick={save}>{t("kyb.save")}</Button>
        </div>
      </AppShell>
    );
  }

  /* ─── Section : les personnes ─── */
  if (view === "people") {
    const owned = sumOwned(owners);
    return (
      <AppShell header={header}>
        <SectionTitle title={t("kyb.secPeople")} sub={t("kyb.peopleSub")} />
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {owners.map((o, i) => {
            const incomplete = !!ownerError(o);
            return (
              <button
                key={i}
                type="button"
                onClick={() => { setEditIdx(i); setDraftOwner(o); go("person"); }}
                className="flex w-full items-center gap-3 border-b border-border/60 px-4 py-3.5 text-left transition-colors hover:bg-secondary/40"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-[13px] font-semibold text-foreground/75">
                  {initials(o.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-medium">{o.name || t("kyb.newPerson")}</span>
                  <span className={cn("block truncate text-[12.5px]", incomplete ? "text-destructive" : "text-muted-foreground")}>
                    {incomplete ? t("kyb.personIncomplete") : `${t(ROLE_FULL[o.role])}${o.role !== "director" ? ` · ${o.ownership} %` : ""}`}
                  </span>
                </span>
                <ChevronRight className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
              </button>
            );
          })}
          {owners.length < 20 && (
            <button
              type="button"
              onClick={() => { setEditIdx(-1); setDraftOwner({ ...emptyOwner(), role: owners.length ? "director" : "both", ownership: owners.length ? 0 : 100 }); go("person"); }}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-[14px] font-medium transition-colors hover:bg-secondary/40"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground">
                <Plus className="h-4 w-4" />
              </span>
              {t("kyb.addPerson")}
            </button>
          )}
        </div>
        <p className={cn("mt-3 px-1 text-[12.5px]", owned > 100 ? "text-destructive" : "text-muted-foreground")}>
          {t("kyb.ownedTotal")} {owned} %
        </p>
        <div className="mt-5 flex justify-end">
          <Button variant="appSolid" shape="rounded" size="lg" className="px-7" onClick={() => go("hub")}>{t("kyb.done")}</Button>
        </div>
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
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
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
        <div className="mt-5 flex items-center justify-between">
          {editIdx >= 0 ? (
            <button
              type="button"
              onClick={() => { setOwners((os) => os.filter((_, i) => i !== editIdx)); go("people"); }}
              className="text-[13px] font-medium text-muted-foreground transition-colors hover:text-destructive"
            >
              {t("kyb.deletePerson")}
            </button>
          ) : <span />}
          <Button variant="appSolid" shape="rounded" size="lg" className="px-7" onClick={save}>{t("kyb.save")}</Button>
        </div>
      </AppShell>
    );
  }

  /* ─── Section : les documents ─── */
  if (view === "docs") {
    return (
      <AppShell header={header}>
        <SectionTitle title={t("kyb.secDocs")} sub={t("kyb.docsSub")} />
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
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
        <div className="mt-4 flex items-start gap-2.5 px-1">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" strokeWidth={1.9} />
          <p className="text-[12px] leading-relaxed text-muted-foreground/80">{t("kyb.privacy")}</p>
        </div>
        <div className="mt-5 flex justify-end">
          <Button variant="appSolid" shape="rounded" size="lg" className="px-7" onClick={() => go("hub")}>{t("kyb.done")}</Button>
        </div>
      </AppShell>
    );
  }

  /* ─── Envoyé ─── */
  if (view === "done") {
    return (
      <AppShell header={header}>
        <div className="flex flex-col items-center pt-8 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Check className="h-7 w-7 text-primary" strokeWidth={2.2} />
          </span>
          <h2 className="mt-5 font-display text-[22px] font-semibold tracking-tight">{t("kyb.doneTitle")}</h2>
          <p className="mt-2 max-w-[320px] text-[14px] leading-relaxed text-muted-foreground">{t("kyb.doneSub")}</p>
          <Button variant="appSolid" shape="rounded" size="lg" className="mt-8 w-full" onClick={() => navigate("/app")}>
            {t("kyb.backHome")}
          </Button>
        </div>
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
      <div className="flex items-center gap-4 rounded-2xl border border-border bg-card px-4 py-4">
        <BusinessMark name={companyName} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[18px] font-semibold tracking-tight">{companyName || t("acct.business")}</p>
          <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">{t("kyb.accountBusiness")}</p>
          <span className={cn("mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-[11.5px] font-semibold", pill.cls)}>
            {pill.icon && <pill.icon className="h-3 w-3" strokeWidth={2.4} />} {t(pill.key)}
          </span>
        </div>
      </div>

      {/* Message selon le statut */}
      {status === "pending" && <Notice tone="neutral" text={t("kyb.stPendingSub")} />}
      {status === "approved" && <Notice tone="ok" text={t("kyb.stApprovedSub")} />}
      {status === "rejected" && (
        <Notice tone="error" title={t("kyb.reviewNote")} text={kyb?.reviewNote || t("kyb.stRejectedSub")} />
      )}
      {status === "not_started" && <p className="mt-4 px-1 text-[13.5px] leading-relaxed text-muted-foreground">{t("kyb.stNoneSub")}</p>}

      {/* Les trois sections */}
      <div className="mt-5 flex items-baseline justify-between px-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{t("kyb.fileTitle")}</p>
        {editable && <p className="text-[12px] tabular-nums text-muted-foreground">{doneCount} / 3</p>}
      </div>
      {editable && (
        <div className="mt-2 flex gap-1 px-1">
          {[0, 1, 2].map((i) => <span key={i} className={cn("h-[3px] flex-1 rounded-full transition-colors", i < doneCount ? "bg-foreground" : "bg-border")} />)}
        </div>
      )}
      <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-card">
        {sections.map((s, i) => {
          const Content = (
            <>
              <span
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors",
                  s.done ? "bg-foreground text-background" : "bg-secondary text-foreground/60",
                )}
              >
                {s.done ? <Check className="h-[18px] w-[18px]" strokeWidth={2.4} /> : s.icon ? <s.icon className="h-[18px] w-[18px]" strokeWidth={1.7} /> : <BuildingGlyph className="h-[18px] w-[18px]" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-medium">{s.title}</span>
                <span className="block truncate text-[12.5px] text-muted-foreground">{s.summary}</span>
              </span>
              {editable && <ChevronRight className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />}
            </>
          );
          const cls = cn("flex w-full items-center gap-3.5 px-4 py-3.5 text-left", i < sections.length - 1 && "border-b border-border/60");
          return editable ? (
            <button key={s.id} type="button" onClick={s.open} className={cn(cls, "transition-colors hover:bg-secondary/40")}>{Content}</button>
          ) : (
            <div key={s.id} className={cls}>{Content}</div>
          );
        })}
      </div>

      {/* Identité du responsable (requise, vérifiée à part) */}
      {kyc !== "approved" && (
        <Link to="/app/verification" className="mt-3 flex items-center gap-3.5 rounded-2xl border border-border bg-card px-4 py-3.5 transition-colors hover:bg-secondary/40">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-[13px] font-semibold text-foreground/75">
            {initials(profile?.fullName ?? user?.name ?? "")}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-medium">{t("kyb.repTitle")}</span>
            <span className="block text-[12.5px] leading-snug text-muted-foreground">{kyc === "pending" ? t("kyb.repPending") : t("kyb.repTodo")}</span>
          </span>
          <ChevronRight className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
        </Link>
      )}

      {/* Envoi */}
      {editable && (
        <div className="mt-6">
          <label
            className={cn(
              "flex items-start gap-3 rounded-2xl border px-4 py-3.5 transition-colors",
              doneCount === 3 ? "cursor-pointer border-border bg-card" : "border-border/60 opacity-50",
            )}
          >
            <input
              type="checkbox"
              disabled={doneCount < 3}
              className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-foreground"
              checked={attest}
              onChange={(e) => setAttest(e.target.checked)}
            />
            <span className="text-[12.5px] leading-relaxed text-muted-foreground">{t("kyb.attest")}</span>
          </label>
          <ErrorLine msg={error} />
          <Button
            variant="appSolid"
            shape="rounded"
            size="lg"
            className="mt-4 w-full gap-2"
            disabled={doneCount < 3 || sending}
            onClick={submit}
          >
            {sending ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-background/30 border-t-background" />
                {t("kyc.wait")}
              </span>
            ) : doneCount < 3 ? (
              t("kyb.completeToSend")
            ) : (
              t("kyb.submit")
            )}
          </Button>
        </div>
      )}

      {!kybOpen && (status === "not_started" || status === "rejected") && (
        <p className="mt-6 flex items-center justify-center gap-2 text-center text-[13px] text-muted-foreground">
          <Clock className="h-4 w-4" /> {t("kyb.notOpenYet")}
        </p>
      )}
    </AppShell>
  );
};

/* ─── Composants ─── */

function Notice({ tone, title, text }: { tone: "neutral" | "ok" | "error"; title?: string; text: string }) {
  return (
    <div
      className={cn(
        "mt-4 rounded-2xl px-4 py-3.5",
        tone === "error" ? "bg-destructive/10 text-destructive" : tone === "ok" ? "bg-primary/10 text-primary" : "bg-secondary text-foreground/80",
      )}
    >
      {title && <p className="text-[11px] font-semibold uppercase tracking-[0.08em]">{title}</p>}
      <p className={cn("whitespace-pre-wrap text-[13.5px] leading-relaxed", title && "mt-1")}>{text}</p>
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
      className={cn("flex items-start gap-3.5 px-4 py-4 transition-colors", !last && "border-b border-border/60", drag && "bg-secondary/60")}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
    >
      <span className={cn("mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", file ? "bg-foreground text-background" : "bg-secondary text-foreground/60")}>
        {file ? <Check className="h-[18px] w-[18px]" strokeWidth={2.4} /> : <FileText className="h-[18px] w-[18px]" strokeWidth={1.7} />}
      </span>
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
        className={cn(
          "mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
          file ? "text-muted-foreground hover:text-foreground" : "bg-secondary text-foreground hover:bg-secondary/70",
        )}
      >
        {!file && <Upload className="h-3.5 w-3.5" />}
        {file ? t("kyb.replace") : t("kyb.add")}
      </button>
    </div>
  );
}

export default Entreprise;
