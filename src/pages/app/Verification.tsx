import { useEffect, useRef, useState, useCallback } from "react";
import { useAppSettings } from "@/lib/settings";
import { useNavigate } from "react-router-dom";
import {
  ShieldCheck, Check, Clock, Camera, IdCard, Lock,
  User, Image, RotateCcw, CircleCheck,
  CreditCard, BookOpen, Fingerprint, AlertCircle, FileText, Home,
} from "lucide-react";
import AppShell from "@/components/app/AppShell";
import { Action, Actions, StepHeader } from "@/components/app/Flat";
import { getMyKyc, peekMyKyc, type KycDbStatus } from "@/lib/kyc";
import { useAuth } from "@/lib/auth";
import { submitKycDocuments, type DocType, type KycIdentityInfo } from "@/lib/kycUpload";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { TKey } from "@/lib/translations";

/* ─── Status display ─── */

const STATUS_META: Record<KycDbStatus, { icon: React.ElementType; titleKey: TKey; subKey: TKey }> = {
  not_started: { icon: ShieldCheck, titleKey: "kyc.notVerified", subKey: "kyc.notVerifiedSub" },
  pending:     { icon: Clock,       titleKey: "kyc.inReview",    subKey: "kyc.inReviewSub" },
  approved:    { icon: CircleCheck, titleKey: "kyc.verified",    subKey: "kyc.verifiedSub" },
  rejected:    { icon: AlertCircle, titleKey: "kyc.rejectedTitle", subKey: "kyc.rejectedSub" },
};

const CHECKLIST: { icon: React.ElementType; key: TKey }[] = [
  { icon: IdCard, key: "kyc.check1" },
  { icon: Camera, key: "kyc.check2" },
  { icon: Fingerprint, key: "kyc.check3" },
  { icon: Home, key: "kyc.check4" },
];

/* ─── Document types ─── */

const DOC_TYPES: { id: DocType; labelKey: TKey; descKey: TKey; icon: React.ElementType; needsBack: boolean }[] = [
  { id: "passport",        labelKey: "kyc.docPassport",   descKey: "kyc.docPassportDesc",   icon: BookOpen,   needsBack: false },
  { id: "drivers_license",  labelKey: "kyc.docLicense",    descKey: "kyc.docLicenseDesc",    icon: CreditCard, needsBack: true },
  { id: "national_id",      labelKey: "kyc.docNationalId", descKey: "kyc.docNationalIdDesc", icon: IdCard,     needsBack: true },
];

/* ─── Steps ─── */

type Step = "intro" | "info" | "doc_type" | "id_front" | "id_back" | "selfie" | "address_proof" | "review" | "submitting" | "done";

const STEP_ORDER_2: Step[] = ["info", "doc_type", "id_front", "selfie", "address_proof"];
const STEP_ORDER_3: Step[] = ["info", "doc_type", "id_front", "id_back", "selfie", "address_proof"];

const PROVINCES = ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"];
const POSTAL_RE = /^[A-Za-z]\d[A-Za-z] ?\d[A-Za-z]\d$/;
const EMPTY_INFO: KycIdentityInfo = { birthDate: "", addressLine: "", city: "", province: "QC", postalCode: "", occupation: "" };

/** Âge en années révolues à partir d'une date AAAA-MM-JJ. */
function ageOf(iso: string): number {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return -1;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--;
  return a;
}
const isPdfFile = (f: File | null) => !!f && (f.type === "application/pdf" || /\.pdf$/i.test(f.name));

/* ─── Capture zone ─── */

function CaptureZone({
  file,
  onFile,
  onClear,
  titleKey,
  descKey,
  guideType,
  t,
}: {
  file: File | null;
  onFile: (f: File) => void;
  onClear: () => void;
  titleKey: TKey;
  descKey: TKey;
  guideType: "card" | "selfie" | "document";
  t: (k: TKey) => string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    if (!file || isPdfFile(file)) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleFile = useCallback((f: File) => {
    if (f.type.startsWith("image/") || f.type.startsWith("video/") || (guideType === "document" && isPdfFile(f))) onFile(f);
  }, [onFile, guideType]);

  return (
    <div>
      <p className="ac-gt">{t(titleKey)}</p>
      <p className="ac-gs mb-4">{t(descKey)}</p>

      {/* Hidden inputs */}
      <input
        ref={inputRef}
        type="file"
        accept={guideType === "document" ? "image/*,application/pdf" : "image/*"}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture={guideType === "selfie" ? "user" : "environment"}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />

      {/* Aperçu, ou les deux façons d'ajouter la photo */}
      {file && isPdfFile(file) ? (
        <div className="flex items-center gap-3 py-3">
          <FileText className="h-6 w-6 shrink-0 text-muted-foreground" strokeWidth={1.6} />
          <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{file.name}</span>
          <button type="button" onClick={onClear} className="ac-act quiet"><RotateCcw className="h-4 w-4" /> {t("kyc.retake")}</button>
        </div>
      ) : preview ? (
        <div>
          <img src={preview} alt="" className="max-h-[300px] w-full rounded-xl object-contain" />
          <button type="button" onClick={onClear} className="ac-act quiet mt-3"><RotateCcw className="h-4 w-4" /> {t("kyc.retake")}</button>
        </div>
      ) : (
        <div
          className={cn("py-4 transition-opacity", drag && "opacity-60")}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault(); setDrag(false);
            const f = e.dataTransfer.files[0];
            if (f) handleFile(f);
          }}
        >
          {guideType === "document"
            ? <Home className="h-10 w-10 text-muted-foreground/50" strokeWidth={1.2} />
            : guideType === "card"
              ? <CreditCard className="h-10 w-10 text-muted-foreground/50" strokeWidth={1.2} />
              : <User className="h-10 w-10 text-muted-foreground/50" strokeWidth={1.2} />}
          <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-2">
            <button type="button" onClick={() => cameraRef.current?.click()} className="ac-act">
              <Camera className="h-[18px] w-[18px]" /> {t("kyc.takePhoto")}
            </button>
            <button type="button" onClick={() => inputRef.current?.click()} className="ac-act quiet">
              <Image className="h-4 w-4" /> {guideType === "document" ? t("kyc.chooseFile") : t("kyc.gallery")}
            </button>
          </div>
          <p className="mt-3 text-[12px] text-muted-foreground">{guideType === "document" ? "JPG, PNG, PDF" : "JPG, PNG"} &middot; max 10 MB</p>
        </div>
      )}
    </div>
  );
}

/* ─── Progress bar ─── */

function StepProgress({ steps, current }: { steps: Step[]; current: Step }) {
  const idx = steps.indexOf(current);
  return (
    <div className="flex items-center gap-1.5 px-1">
      {steps.map((s, i) => (
        <div
          key={s}
          className={cn(
            "h-[3px] flex-1 rounded-full transition-all duration-300",
            i <= idx ? "bg-foreground" : "bg-border",
          )}
        />
      ))}
    </div>
  );
}

/** Champ à plat (flat.ts). */
const FIELD = "ac-in";

/* ─── Main component ─── */

const Verification = () => {
  const navigate = useNavigate();
  const t = useT();
  const { user, isStaff } = useAuth();
  const { verificationEnabled } = useAppSettings();
  // Statut déjà chargé (préchargement de l'app) : affiché tout de suite.
  const [cachedKyc] = useState(() => peekMyKyc(user?.id));
  const [status, setStatus] = useState<KycDbStatus | null>(cachedKyc === undefined ? null : cachedKyc?.status ?? "not_started");
  const [reviewNote, setReviewNote] = useState<string | null>(cachedKyc?.reviewNote ?? null);
  const [step, setStep] = useState<Step>("intro");
  const [docType, setDocType] = useState<DocType | null>(null);
  const [idFront, setIdFront] = useState<File | null>(null);
  const [idBack, setIdBack] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [addressProof, setAddressProof] = useState<File | null>(null);
  const [info, setInfo] = useState<KycIdentityInfo>(EMPTY_INFO);
  const setField = (k: keyof KycIdentityInfo) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setInfo((v) => ({ ...v, [k]: e.target.value }));
  const age = info.birthDate ? ageOf(info.birthDate) : null;
  const postalOk = POSTAL_RE.test(info.postalCode.trim());
  const infoOk = age !== null && age >= 18 && age < 120 && !!info.addressLine.trim() && !!info.city.trim() && !!info.province && postalOk && !!info.occupation.trim();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(cachedKyc === undefined);

  const needsBack = DOC_TYPES.find((d) => d.id === docType)?.needsBack ?? false;
  const stepOrder = needsBack ? STEP_ORDER_3 : STEP_ORDER_2;

  useEffect(() => {
    getMyKyc().then((k) => {
      setStatus(k?.status ?? "not_started");
      setReviewNote(k?.reviewNote ?? null);
      setLoading(false);
    });
  }, []);

  const goNext = () => {
    const idx = stepOrder.indexOf(step);
    if (idx >= 0 && idx < stepOrder.length - 1) {
      setStep(stepOrder[idx + 1]);
    } else if (idx === stepOrder.length - 1) {
      setStep("review");
    }
  };

  const goBack = () => {
    if (step === "review") { setStep("address_proof"); return; }
    const idx = stepOrder.indexOf(step);
    if (idx > 0) setStep(stepOrder[idx - 1]);
    else if (step === "info") setStep("intro");
    else navigate("/app/compte");
  };

  const submit = async () => {
    if (!docType || !idFront || !selfie || !addressProof || !infoOk) return;
    setStep("submitting");
    setError(null);
    const res = await submitKycDocuments(docType, {
      idFront,
      idBack: needsBack ? idBack ?? undefined : undefined,
      selfie,
      addressProof,
    }, info);
    if (res.error) {
      setError(res.error);
      setStep("review");
      return;
    }
    setStep("done");
    setStatus("pending");
  };

  const canNext = (): boolean => {
    if (step === "doc_type") return !!docType;
    if (step === "id_front") return !!idFront;
    if (step === "id_back") return !!idBack;
    if (step === "selfie") return !!selfie;
    if (step === "info") return infoOk;
    if (step === "address_proof") return !!addressProof;
    return false;
  };

  /* ─── Header ─── */

  const header = <StepHeader title={t("kyc.title")} sub={t("kyc.sub")} onBack={goBack} />;

  /* ─── Loading ─── */

  if (loading) {
    return (
      <AppShell header={header}>
        {null}
      </AppShell>
    );
  }

  /* ─── Done ─── */

  if (step === "done") {
    return (
      <AppShell header={header}>
        <Check className="h-8 w-8 text-foreground" strokeWidth={2} />
        <h2 className="ac-title mt-4">{t("kyc.doneTitle")}</h2>
        <p className="ac-sub">{t("kyc.doneSub")}</p>
        <Actions><Action onClick={() => navigate("/app/compte")}>{t("kyc.backToAccount")}</Action></Actions>
      </AppShell>
    );
  }

  /* ─── Intro ─── */

  if (step === "intro") {
    const m = STATUS_META[status ?? "not_started"];
    // L'équipe peut renvoyer ses documents à volonté, pour essayer le parcours de bout en bout.
    const verified = status === "approved" && !isStaff;
    const inReview = status === "pending";

    return (
      <AppShell header={header}>
        {/* Statut */}
        <m.icon className="h-8 w-8 text-foreground" strokeWidth={1.6} />
        <h2 className="ac-title mt-4">{t(m.titleKey)}</h2>
        <p className="ac-sub">{t(m.subKey)}</p>

        {status === "rejected" && reviewNote && (
          <div className="mt-6">
            <p className="ac-k">{t("kyc.reviewNote")}</p>
            <p className="ac-note whitespace-pre-wrap" style={{ marginTop: 6 }}>{reviewNote}</p>
          </div>
        )}

        {!verified && (
          <>
            {/* Avant de commencer */}
            <p className="ac-k mt-10 mb-4">{t("kyc.before")}</p>
            <ul className="space-y-4">
              {CHECKLIST.map((c) => (
                <li key={c.key} className="flex items-start gap-3.5">
                  <c.icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={1.7} />
                  <span className="text-[14px] leading-relaxed text-foreground">{t(c.key)}</span>
                </li>
              ))}
            </ul>

            {/* Comment ça se passe : une suite d'étapes, numérotées */}
            <p className="ac-k mt-10 mb-4">{t("kyc.howItWorks")}</p>
            <div className="space-y-3.5">
              {[
                { num: "1", key: "kyc.step1Desc" as TKey },
                { num: "2", key: "kyc.step2Desc" as TKey },
                { num: "3", key: "kyc.step3Desc" as TKey },
                { num: "4", key: "kyc.step4Desc" as TKey },
              ].map((s) => (
                <div key={s.num} className="flex items-start gap-3">
                  <span className="w-5 shrink-0 text-[15px] font-semibold tabular-nums text-foreground">{s.num}</span>
                  <span className="text-[14px] leading-relaxed text-muted-foreground">{t(s.key)}</span>
                </div>
              ))}
            </div>

            {/* Privacy note */}
            <div className="mt-6 flex items-start gap-2.5">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" strokeWidth={1.9} />
              <p className="text-[12px] leading-relaxed text-muted-foreground/60">{t("kyc.privacy")}</p>
            </div>

            {/* CTA */}
            {isStaff && <p className="ac-help mt-6">Compte de l'équipe : vous pouvez envoyer de nouveaux documents autant de fois que vous voulez, pour tester.</p>}
            <Actions>
              <Action disabled={!verificationEnabled && !isStaff} onClick={() => setStep("info")}>
                {isStaff && status !== "not_started" ? "Nouvel envoi" : inReview ? t("kyc.resume") : t("kyc.start")}
              </Action>
            </Actions>
          </>
        )}
      </AppShell>
    );
  }

  /* ─── Wizard steps ─── */

  return (
    <AppShell header={header}>
      {/* Progress */}
      {step !== "review" && step !== "submitting" && (
        <div className="mb-5">
          <StepProgress steps={stepOrder} current={step} />
        </div>
      )}

      {/* ── Vos informations ── */}
      {step === "info" && (
        <>
          <p className="ac-gt">{t("kyc.infoTitle")}</p>
          <p className="ac-gs mb-6">{t("kyc.infoSub")}</p>
          <div className="grid gap-6">
            <label className="grid gap-1">
              <span className="ac-k">{t("kyc.birthDate")}</span>
              {/* iOS donne au champ date une largeur propre : on le force à la largeur des autres champs. */}
              <input type="date" value={info.birthDate} onChange={setField("birthDate")} max={new Date().toISOString().slice(0, 10)}
                className={cn(FIELD, "block min-w-0 max-w-full appearance-none text-left [&::-webkit-date-and-time-value]:text-left", !info.birthDate && "text-muted-foreground")} />
              {age !== null && age >= 0 && age < 18 && <span className="ac-note" style={{ marginTop: 6 }}>{t("kyc.adultOnly")}</span>}
            </label>
            <label className="grid gap-1">
              <span className="ac-k">{t("kyc.addressLine")}</span>
              <input value={info.addressLine} onChange={setField("addressLine")} placeholder={t("kyc.addressLinePh")} autoComplete="street-address" className={FIELD} />
            </label>
            <div className="grid grid-cols-2 gap-6">
              <label className="grid gap-1">
                <span className="ac-k">{t("kyc.city")}</span>
                <input value={info.city} onChange={setField("city")} autoComplete="address-level2" className={FIELD} />
              </label>
              <label className="grid gap-1">
                <span className="ac-k">{t("kyc.province")}</span>
                <select value={info.province} onChange={setField("province")} autoComplete="address-level1" className={FIELD}>
                  {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
            </div>
            <label className="grid gap-1">
              <span className="ac-k">{t("kyc.postalCode")}</span>
              <input value={info.postalCode} onChange={setField("postalCode")} placeholder="H2X 1Y4" autoComplete="postal-code" autoCapitalize="characters" maxLength={7} className={cn(FIELD, "uppercase")} />
              {info.postalCode.trim().length >= 6 && !postalOk && <span className="ac-note" style={{ marginTop: 6 }}>{t("kyc.postalInvalid")}</span>}
            </label>
            <label className="grid gap-1">
              <span className="ac-k">{t("kyc.occupation")}</span>
              <input value={info.occupation} onChange={setField("occupation")} placeholder={t("kyc.occupationPh")} autoComplete="organization-title" className={FIELD} />
            </label>
          </div>
          <Actions><Action disabled={!canNext()} onClick={goNext}>{t("kyc.next")}</Action></Actions>
        </>
      )}

      {/* ── Document type ── */}
      {step === "doc_type" && (
        <>
          <p className="ac-gt">{t("kyc.chooseDoc")}</p>
          <p className="ac-gs mb-4">{t("kyc.chooseDocSub")}</p>

          <div className="ac-lines" role="radiogroup">
            {DOC_TYPES.map((d) => {
              const selected = docType === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={cn("ac-row pick", selected && "on")}
                  onClick={() => { setDocType(d.id); setIdFront(null); setIdBack(null); }}
                >
                  <d.icon className="ac-ico" strokeWidth={1.7} />
                  <span className="ac-txt">
                    <span className="ac-n">{t(d.labelKey)}</span>
                    <span className="ac-d">{t(d.descKey)}</span>
                  </span>
                  <Check className={cn("h-[18px] w-[18px] shrink-0 transition-opacity", selected ? "opacity-100" : "opacity-0")} strokeWidth={2.2} />
                </button>
              );
            })}
          </div>

          <Actions><Action disabled={!canNext()} onClick={goNext}>{t("kyc.next")}</Action></Actions>
        </>
      )}

      {/* ── ID Front ── */}
      {step === "id_front" && (
        <>
          <CaptureZone
            file={idFront}
            onFile={setIdFront}
            onClear={() => setIdFront(null)}
            titleKey="kyc.photoFront"
            descKey="kyc.photoFrontSub"
            guideType="card"
            t={t}
          />
          <Actions><Action disabled={!canNext()} onClick={goNext}>{t("kyc.next")}</Action></Actions>
        </>
      )}

      {/* ── ID Back ── */}
      {step === "id_back" && (
        <>
          <CaptureZone
            file={idBack}
            onFile={setIdBack}
            onClear={() => setIdBack(null)}
            titleKey="kyc.photoBack"
            descKey="kyc.photoBackSub"
            guideType="card"
            t={t}
          />
          <Actions><Action disabled={!canNext()} onClick={goNext}>{t("kyc.next")}</Action></Actions>
        </>
      )}

      {/* ── Selfie ── */}
      {step === "selfie" && (
        <>
          <CaptureZone
            file={selfie}
            onFile={setSelfie}
            onClear={() => setSelfie(null)}
            titleKey="kyc.selfie"
            descKey="kyc.selfieSub"
            guideType="selfie"
            t={t}
          />

          <div className="mt-4 flex items-start gap-2.5">
            <Fingerprint className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.9} />
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">{t("kyc.selfieTip")}</p>
          </div>

          <Actions><Action disabled={!canNext()} onClick={goNext}>{t("kyc.next")}</Action></Actions>
        </>
      )}

      {/* ── Preuve d'adresse ── */}
      {step === "address_proof" && (
        <>
          <CaptureZone
            file={addressProof}
            onFile={setAddressProof}
            onClear={() => setAddressProof(null)}
            titleKey="kyc.proofTitle"
            descKey="kyc.proofSub"
            guideType="document"
            t={t}
          />
          <p className="mt-4 text-[12.5px] leading-relaxed text-muted-foreground">{t("kyc.proofTip")}</p>
          <Actions><Action disabled={!canNext()} onClick={goNext}>{t("kyc.next")}</Action></Actions>
        </>
      )}

      {/* ── Review ── */}
      {(step === "review" || step === "submitting") && (
        <>
          <p className="ac-gt">{t("kyc.reviewTitle")}</p>
          <p className="ac-gs mb-4">{t("kyc.reviewSub")}</p>

          <div className="ac-lines mb-8">
            <div className="ac-kv"><span>{t("kyc.docTypeLabel")}</span><span>{docType && t(DOC_TYPES.find((d) => d.id === docType)!.labelKey)}</span></div>
            <div className="ac-kv"><span>{t("kyc.infoTitle")}</span><span>{info.birthDate} · {info.occupation}<br />{info.addressLine}, {info.city} ({info.province}) {info.postalCode.toUpperCase()}</span></div>
          </div>

          {/* Photos */}
          <div className={cn("grid gap-3", needsBack ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3")}>
            <ReviewThumb file={idFront} label={t("kyc.front")} />
            {needsBack && <ReviewThumb file={idBack} label={t("kyc.back")} />}
            <ReviewThumb file={selfie} label={t("kyc.selfieLabel")} />
            <ReviewThumb file={addressProof} label={t("kyc.proofLabel")} />
          </div>

          {error && (
            <p className="ac-note flex items-start gap-2.5"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</p>
          )}

          <div className="mt-4 flex items-start gap-2.5">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.9} />
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">{t("kyc.reviewPrivacy")}</p>
          </div>

          <Actions>
            <Action disabled={step === "submitting"} onClick={submit}>{t("kyc.submit")}</Action>
            <Action quiet disabled={step === "submitting"} onClick={() => setStep("address_proof")}>{t("kyc.editPhotos")}</Action>
          </Actions>
        </>
      )}
    </AppShell>
  );
};

/* ─── Review thumbnail ─── */

function ReviewThumb({ file, label }: { file: File | null; label: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file || isPdfFile(file)) return;
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  return (
    <div>
      {url ? (
        <img src={url} alt={label} className="aspect-[4/3] w-full rounded-xl object-cover" />
      ) : (
        <div className="flex aspect-[4/3] items-center justify-center">
          {isPdfFile(file) ? <FileText className="h-6 w-6 text-muted-foreground/70" /> : <Image className="h-6 w-6 text-muted-foreground/50" />}
        </div>
      )}
      <p className="mt-1.5 text-[12.5px] text-muted-foreground">{label}</p>
    </div>
  );
}

export default Verification;
