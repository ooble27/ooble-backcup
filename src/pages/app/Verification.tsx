import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, ShieldCheck, Check, Clock, Camera, IdCard, Lock,
  ChevronRight, User, Image, RotateCcw, CircleCheck,
  CreditCard, BookOpen, Fingerprint, AlertCircle, FileText, Home,
} from "lucide-react";
import AppShell from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { getMyKyc, peekMyKyc, type KycDbStatus } from "@/lib/kyc";
import { useAuth } from "@/lib/auth";
import { submitKycDocuments, type DocType, type KycIdentityInfo } from "@/lib/kycUpload";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { VERIFICATION_ENABLED } from "@/lib/config";
import type { TKey } from "@/lib/translations";

/* ─── Status display ─── */

const STATUS_META: Record<KycDbStatus, { icon: React.ElementType; titleKey: TKey; subKey: TKey; tone: string; bg: string }> = {
  not_started: { icon: ShieldCheck, titleKey: "kyc.notVerified", subKey: "kyc.notVerifiedSub", tone: "text-muted-foreground", bg: "bg-secondary" },
  pending:     { icon: Clock,       titleKey: "kyc.inReview",    subKey: "kyc.inReviewSub",    tone: "text-foreground",       bg: "bg-secondary" },
  approved:    { icon: CircleCheck, titleKey: "kyc.verified",    subKey: "kyc.verifiedSub",    tone: "text-primary",          bg: "bg-primary/10" },
  rejected:    { icon: AlertCircle, titleKey: "kyc.rejectedTitle", subKey: "kyc.rejectedSub",  tone: "text-destructive",      bg: "bg-destructive/10" },
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
      <p className="text-[15px] font-semibold tracking-tight">{t(titleKey)}</p>
      <p className="mt-1 mb-4 text-[12.5px] leading-relaxed text-muted-foreground">{t(descKey)}</p>

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

      {/* Preview or Capture area */}
      {file && isPdfFile(file) ? (
        <div className="relative flex items-center gap-3 rounded-2xl border border-border px-4 py-4">
          <FileText className="h-6 w-6 shrink-0 text-muted-foreground" strokeWidth={1.6} />
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{file.name}</span>
          <button type="button" onClick={onClear} className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background transition-transform active:scale-90">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : preview ? (
        <div className="relative">
          <div className="overflow-hidden rounded-2xl border border-border">
            <img src={preview} alt="" className="w-full object-contain max-h-[280px] bg-secondary/30" />
          </div>
          <button
            type="button"
            onClick={onClear}
            className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background shadow-sm transition-transform active:scale-90"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div
          className={cn(
            "relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed py-10 transition-colors",
            drag ? "border-primary bg-primary/5" : "border-border bg-secondary/20",
          )}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault(); setDrag(false);
            const f = e.dataTransfer.files[0];
            if (f) handleFile(f);
          }}
        >
          {/* Guide overlay */}
          {guideType === "document" ? (
            <div className="mb-4 flex h-[100px] w-[80px] items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/30">
              <Home className="h-7 w-7 text-muted-foreground/30" strokeWidth={1.2} />
            </div>
          ) : guideType === "card" ? (
            <div className="mb-4 flex h-[100px] w-[160px] items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/30">
              <CreditCard className="h-8 w-8 text-muted-foreground/30" strokeWidth={1.2} />
            </div>
          ) : (
            <div className="mb-4 flex h-[100px] w-[100px] items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/30">
              <User className="h-8 w-8 text-muted-foreground/30" strokeWidth={1.2} />
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="flex items-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-[13px] font-semibold text-background transition-all active:scale-95 btn-depth"
            >
              <Camera className="h-4 w-4" /> {t("kyc.takePhoto")}
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-[13px] font-semibold text-foreground transition-all hover:bg-secondary active:scale-95"
            >
              <Image className="h-4 w-4" /> {guideType === "document" ? t("kyc.chooseFile") : t("kyc.gallery")}
            </button>
          </div>

          <p className="mt-3 text-[11px] text-muted-foreground/60">{guideType === "document" ? "JPG, PNG, PDF" : "JPG, PNG"} &middot; max 10 MB</p>
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

const FIELD = "h-12 w-full rounded-xl border border-border bg-card px-4 text-[15px] text-foreground outline-none transition-colors focus:border-foreground";

/* ─── Main component ─── */

const Verification = () => {
  const navigate = useNavigate();
  const t = useT();
  const { user, isStaff } = useAuth();
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

  const header = (
    <div className="flex items-start gap-3">
      <button
        type="button"
        onClick={goBack}
        aria-label={t("misc.back")}
        className="mt-0.5 flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-secondary text-foreground transition-colors hover:bg-secondary/70 active:scale-95"
      >
        <ArrowLeft className="h-[18px] w-[18px]" />
      </button>
      <div>
        <h1 className="font-display text-[22px] font-semibold tracking-tight">{t("kyc.title")}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">{t("kyc.sub")}</p>
      </div>
    </div>
  );

  /* ─── Loading ─── */

  if (loading) {
    return (
      <AppShell header={header}>
        <div className="rounded-2xl border border-border bg-card py-12 text-center text-[13px] text-muted-foreground">{t("kyc.loading")}</div>
      </AppShell>
    );
  }

  /* ─── Done ─── */

  if (step === "done") {
    return (
      <AppShell header={header}>
        <div className="flex flex-col items-center text-center pt-6 pb-2">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Check className="h-7 w-7 text-primary" strokeWidth={2} />
          </span>
          <h2 className="mt-5 font-display text-[22px] font-semibold tracking-tight">{t("kyc.doneTitle")}</h2>
          <p className="mt-2 max-w-[320px] text-[14px] leading-relaxed text-muted-foreground">{t("kyc.doneSub")}</p>
          <div className="mt-6 w-full">
            <Button variant="appSolid" shape="rounded" size="lg" className="w-full gap-2" onClick={() => navigate("/app/compte")}>
              {t("kyc.backToAccount")}
            </Button>
          </div>
        </div>
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
        {/* Status */}
        <div className="flex flex-col items-center text-center pt-2 pb-2">
          <span className={cn("flex h-16 w-16 items-center justify-center rounded-2xl", m.bg, m.tone)}>
            <m.icon className="h-7 w-7" strokeWidth={1.6} />
          </span>
          <h2 className="mt-4 font-display text-[22px] font-semibold tracking-tight">{t(m.titleKey)}</h2>
          <p className="mt-1.5 max-w-[340px] text-[14px] leading-relaxed text-muted-foreground">{t(m.subKey)}</p>
        </div>

        {status === "rejected" && reviewNote && (
          <div className="mt-4 rounded-2xl bg-destructive/10 px-4 py-3.5 text-destructive">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em]">{t("kyc.reviewNote")}</p>
            <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed">{reviewNote}</p>
          </div>
        )}

        {!verified && (
          <>
            {/* Separator */}
            <div className="my-5 h-px bg-border" />

            {/* Before you begin */}
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {t("kyc.before")}
            </p>
            <ul className="space-y-4">
              {CHECKLIST.map((c) => (
                <li key={c.key} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground/70">
                    <c.icon className="h-4 w-4" strokeWidth={1.8} />
                  </span>
                  <span className="text-[13.5px] leading-relaxed text-muted-foreground">{t(c.key)}</span>
                </li>
              ))}
            </ul>

            {/* Separator */}
            <div className="my-5 h-px bg-border" />

            {/* How it works */}
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {t("kyc.howItWorks")}
            </p>
            <div className="space-y-3.5">
              {[
                { num: "1", key: "kyc.step1Desc" as TKey },
                { num: "2", key: "kyc.step2Desc" as TKey },
                { num: "3", key: "kyc.step3Desc" as TKey },
                { num: "4", key: "kyc.step4Desc" as TKey },
              ].map((s) => (
                <div key={s.num} className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-bold text-background">
                    {s.num}
                  </span>
                  <span className="text-[13px] leading-relaxed text-muted-foreground">{t(s.key)}</span>
                </div>
              ))}
            </div>

            {/* Privacy note */}
            <div className="mt-6 flex items-start gap-2.5">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" strokeWidth={1.9} />
              <p className="text-[12px] leading-relaxed text-muted-foreground/60">{t("kyc.privacy")}</p>
            </div>

            {/* CTA */}
            <div className="mt-6 flex items-center justify-end gap-4">
              {isStaff && <p className="mr-auto text-[12px] leading-relaxed text-muted-foreground">Compte de l'équipe : vous pouvez envoyer de nouveaux documents autant de fois que vous voulez, pour tester.</p>}
              <Button variant="appSolid" shape="rounded" className="shrink-0 gap-2 px-5 text-[13px]" disabled={!VERIFICATION_ENABLED && !isStaff} onClick={() => setStep("info")}>
                {isStaff && status !== "not_started" ? "Nouvel envoi" : inReview ? t("kyc.resume") : t("kyc.start")}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
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
          <p className="mb-1 text-[15px] font-semibold tracking-tight">{t("kyc.infoTitle")}</p>
          <p className="mb-5 text-[12.5px] leading-relaxed text-muted-foreground">{t("kyc.infoSub")}</p>
          <div className="grid gap-4">
            <label className="grid gap-1.5">
              <span className="text-[12.5px] font-semibold text-muted-foreground">{t("kyc.birthDate")}</span>
              <input type="date" value={info.birthDate} onChange={setField("birthDate")} max={new Date().toISOString().slice(0, 10)} className={FIELD} />
              {age !== null && age >= 0 && age < 18 && <span className="text-[12px] text-destructive">{t("kyc.adultOnly")}</span>}
            </label>
            <label className="grid gap-1.5">
              <span className="text-[12.5px] font-semibold text-muted-foreground">{t("kyc.addressLine")}</span>
              <input value={info.addressLine} onChange={setField("addressLine")} placeholder={t("kyc.addressLinePh")} autoComplete="street-address" className={FIELD} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1.5">
                <span className="text-[12.5px] font-semibold text-muted-foreground">{t("kyc.city")}</span>
                <input value={info.city} onChange={setField("city")} autoComplete="address-level2" className={FIELD} />
              </label>
              <label className="grid gap-1.5">
                <span className="text-[12.5px] font-semibold text-muted-foreground">{t("kyc.province")}</span>
                <select value={info.province} onChange={setField("province")} autoComplete="address-level1" className={FIELD}>
                  {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
            </div>
            <label className="grid gap-1.5">
              <span className="text-[12.5px] font-semibold text-muted-foreground">{t("kyc.postalCode")}</span>
              <input value={info.postalCode} onChange={setField("postalCode")} placeholder="H2X 1Y4" autoComplete="postal-code" autoCapitalize="characters" maxLength={7} className={cn(FIELD, "uppercase")} />
              {info.postalCode.trim().length >= 6 && !postalOk && <span className="text-[12px] text-destructive">{t("kyc.postalInvalid")}</span>}
            </label>
            <label className="grid gap-1.5">
              <span className="text-[12.5px] font-semibold text-muted-foreground">{t("kyc.occupation")}</span>
              <input value={info.occupation} onChange={setField("occupation")} placeholder={t("kyc.occupationPh")} autoComplete="organization-title" className={FIELD} />
            </label>
          </div>
          <div className="mt-5 flex justify-end">
            <Button variant="appSolid" shape="rounded" size="lg" className="gap-2 px-6" disabled={!canNext()} onClick={goNext}>
              {t("kyc.next")} <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}

      {/* ── Document type ── */}
      {step === "doc_type" && (
        <>
          <p className="mb-1 text-[15px] font-semibold tracking-tight">{t("kyc.chooseDoc")}</p>
          <p className="mb-4 text-[12.5px] text-muted-foreground">{t("kyc.chooseDocSub")}</p>

          <div className="space-y-2.5">
            {DOC_TYPES.map((d) => {
              const selected = docType === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-3.5 rounded-xl border px-4 py-4 min-h-[76px] text-left transition-all active:scale-[0.98]",
                    selected
                      ? "border-foreground bg-foreground/[0.03]"
                      : "border-border hover:bg-secondary/40",
                  )}
                  onClick={() => { setDocType(d.id); setIdFront(null); setIdBack(null); }}
                >
                  <span className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors",
                    selected ? "bg-foreground text-background" : "bg-secondary text-foreground/60",
                  )}>
                    <d.icon className="h-[18px] w-[18px]" strokeWidth={1.7} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold">{t(d.labelKey)}</p>
                    <p className="mt-0.5 text-[12px] text-muted-foreground line-clamp-1">{t(d.descKey)}</p>
                  </div>
                  <span className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                    selected ? "border-foreground bg-foreground" : "border-border",
                  )}>
                    {selected && <Check className="h-3 w-3 text-background" strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-5 flex justify-end">
            <Button variant="appSolid" shape="rounded" size="lg" className="gap-2 px-6" disabled={!canNext()} onClick={goNext}>
              {t("kyc.next")} <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
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
          <div className="mt-5 flex justify-end">
            <Button variant="appSolid" shape="rounded" size="lg" className="gap-2 px-6" disabled={!canNext()} onClick={goNext}>
              {t("kyc.next")} <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
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
          <div className="mt-5 flex justify-end">
            <Button variant="appSolid" shape="rounded" size="lg" className="gap-2 px-6" disabled={!canNext()} onClick={goNext}>
              {t("kyc.next")} <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
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

          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-border bg-secondary/30 px-4 py-3">
            <Fingerprint className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.9} />
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">{t("kyc.selfieTip")}</p>
          </div>

          <div className="mt-5 flex justify-end">
            <Button variant="appSolid" shape="rounded" size="lg" className="gap-2 px-6" disabled={!canNext()} onClick={goNext}>
              {t("kyc.next")} <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
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
          <div className="mt-5 flex justify-end">
            <Button variant="appSolid" shape="rounded" size="lg" className="gap-2 px-6" disabled={!canNext()} onClick={goNext}>
              {t("kyc.next")} <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}

      {/* ── Review ── */}
      {(step === "review" || step === "submitting") && (
        <>
          <p className="text-[15px] font-semibold tracking-tight">{t("kyc.reviewTitle")}</p>
          <p className="mt-1 mb-4 text-[12.5px] text-muted-foreground">{t("kyc.reviewSub")}</p>

          {/* Document type */}
          <div className="flex items-center gap-3 rounded-xl border border-border px-4 py-3.5 mb-3">
            <IdCard className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.7} />
            <span className="flex-1 text-[13px] text-muted-foreground">{t("kyc.docTypeLabel")}</span>
            <span className="text-[13px] font-semibold">
              {docType && t(DOC_TYPES.find((d) => d.id === docType)!.labelKey)}
            </span>
          </div>

          <div className="mb-3 rounded-xl border border-border px-4 py-3.5 text-[13px] leading-relaxed">
            <p className="font-semibold">{t("kyc.infoTitle")}</p>
            <p className="mt-1 text-muted-foreground">
              {info.birthDate} · {info.occupation}<br />
              {info.addressLine}, {info.city} ({info.province}) {info.postalCode.toUpperCase()}
            </p>
          </div>

          {/* Photos */}
          <div className={cn("grid gap-3", needsBack ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3")}>
            <ReviewThumb file={idFront} label={t("kyc.front")} />
            {needsBack && <ReviewThumb file={idBack} label={t("kyc.back")} />}
            <ReviewThumb file={selfie} label={t("kyc.selfieLabel")} />
            <ReviewThumb file={addressProof} label={t("kyc.proofLabel")} />
          </div>

          {error && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <p className="text-[13px] text-destructive">{error}</p>
            </div>
          )}

          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-border bg-secondary/30 px-4 py-3">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.9} />
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">{t("kyc.reviewPrivacy")}</p>
          </div>

          <div className="mt-5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep("address_proof")}
              className="text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("kyc.editPhotos")}
            </button>
            <Button
              variant="appSolid"
              shape="rounded"
              size="lg"
              className="gap-2 px-6"
              disabled={step === "submitting"}
              onClick={submit}
            >
              {step === "submitting" ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-background/30 border-t-background" />
                  {t("kyc.wait")}
                </span>
              ) : (
                <>{t("kyc.submit")} <ShieldCheck className="h-4 w-4" /></>
              )}
            </Button>
          </div>
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
    <div className="overflow-hidden rounded-xl border border-border">
      {url ? (
        <img src={url} alt={label} className="aspect-[4/3] w-full object-cover bg-secondary/30" />
      ) : (
        <div className="flex aspect-[4/3] items-center justify-center bg-secondary/30">
          {isPdfFile(file) ? <FileText className="h-5 w-5 text-muted-foreground/60" /> : <Image className="h-5 w-5 text-muted-foreground/40" />}
        </div>
      )}
      <p className="border-t border-border bg-secondary/30 px-2.5 py-1.5 text-center text-[11px] font-semibold text-muted-foreground">{label}</p>
    </div>
  );
}

export default Verification;
