import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Building2, Eye, EyeOff, FileText, Lock, Mail, MapPin, Phone, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import Captcha, { captchaEnabled, type CaptchaHandle } from "@/components/Captcha";
import { useAuth } from "@/lib/auth";
import AuthShell from "@/components/auth/AuthShell";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useAppSettings } from "@/lib/settings";

type Step = 1 | 2;

const Field = ({
  label,
  icon: Icon,
  trailing,
  last,
  ...props
}: {
  label: string;
  icon: React.ElementType;
  trailing?: React.ReactNode;
  last?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) => (
  <div
    className={cn(
      "px-4 py-3 transition-colors focus-within:bg-primary/[0.03]",
      !last && "border-b border-border/50",
    )}
  >
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" strokeWidth={1.6} />
      <span className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground/60">
        {label}
      </span>
    </div>
    <div className="mt-1 flex items-center gap-2">
      <input
        className="w-full bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/30"
        {...props}
      />
      {trailing}
    </div>
  </div>
);

const InscriptionEntreprise = () => {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const closed = !useAppSettings().signupsBusiness;
  const t = useT();
  const [step, setStep] = useState<Step>(1);

  const [businessName, setBusinessName] = useState("");
  const [businessNumber, setBusinessNumber] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const captchaRef = useRef<CaptchaHandle>(null);

  function traduireErreur(message: string): string {
    const m = message.toLowerCase();
if (message === "disposable_email") return t("reg.errDisposable");
    if (m.includes("signups_closed") || m.includes("database error saving new user")) return t("reg.closed");
    if (m.includes("captcha")) return t("auth.errCaptcha");
    if (m.includes("already registered") || m.includes("already been registered")) return t("reg.errAlreadyExists");
    if (m.includes("password should be at least")) return t("reg.errPasswordShort");
    if (m.includes("unable to validate email")) return t("reg.errBadEmail");
    return message;
  }

  const goStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName.trim()) {
      setError(t("regb.errBusinessRequired"));
      return;
    }
    setError(null);
    setStep(2);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await signUp(email, password, name, {
        accountType: "business",
        businessName: businessName.trim(),
        businessNumber: businessNumber.trim() || undefined,
        businessAddress: businessAddress.trim() || undefined,
        businessPhone: businessPhone.trim() || undefined,
        captchaToken: captcha,
      });
      captchaRef.current?.reset();
      if (res.error) return setError(traduireErreur(res.error));
      if (res.needsConfirmation) {
        setNotice(t("regi.notice"));
        return;
      }
      navigate("/app", { replace: true });
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    setError(null);
    setStep(1);
  };

  const stepLabels = [t("regb.step1"), t("regb.step2")];

  return (
    <AuthShell variant="business">
      {!notice && (
        <>
          {step === 1 ? (
            <Link
              to="/inscription"
              className="mb-6 inline-flex items-center gap-2 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> {t("regi.back")}
            </Link>
          ) : (
            <button
              type="button"
              onClick={back}
              className="mb-6 inline-flex items-center gap-2 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> {t("regb.backBusiness")}
            </button>
          )}

          <div className="mb-8 flex items-center">
            {stepLabels.map((lbl, i) => {
              const s = (i + 1) as Step;
              const active = s <= step;
              return (
                <div key={i} className="flex flex-1 items-center">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-full text-[12px] transition-colors",
                        active
                          ? "bg-foreground text-background"
                          : "border border-border text-muted-foreground",
                      )}
                    >
                      {s}
                    </span>
                    <span className={cn("text-[12px]", active ? "text-foreground" : "text-muted-foreground/60")}>
                      {lbl}
                    </span>
                  </div>
                  {i < stepLabels.length - 1 && (
                    <div className={cn("mx-3 h-px flex-1 transition-colors", step > s ? "bg-foreground" : "bg-border")} />
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {closed && !notice ? (
        // Inscriptions fermées (Back-office › Réglages › Inscriptions) : on le dit, sans formulaire.
        <div className="mt-8">
          <p className="text-[15px] leading-relaxed text-foreground">{t("reg.closed")}</p>
          <Link to="/connexion" className="mt-4 inline-flex items-center gap-2 text-[14px] text-muted-foreground hover:text-foreground hover:underline">
            {t("regi.goLogin")} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : notice ? (
        <>
          <h1 className="font-display text-[2rem] leading-[1.05] tracking-[-0.04em] sm:text-[2.4rem]">
            {t("regb.accountCreated")}
          </h1>
          <div className="mt-8 overflow-hidden rounded-2xl border border-primary/20 bg-primary/[0.04]">
            <div className="px-5 py-5 text-[14px] leading-relaxed text-foreground">
              {notice}
              <div className="mt-4">
                <Link
                  to="/connexion"
                  className="inline-flex items-center gap-2 text-[13px] text-primary hover:underline"
                >
                  {t("regi.goLogin")} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </>
      ) : step === 1 ? (
        <>
          <h1 className="font-display text-[2rem] leading-[1.05] tracking-[-0.04em] sm:text-[2.4rem]">
            {t("regb.title1")}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            {t("regb.sub1")}
          </p>

          <form onSubmit={goStep2} className="mt-8">
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <Field
                label={t("regb.businessName")}
                icon={Building2}
                type="text"
                autoComplete="organization"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                required
              />
              <Field
                label={t("regb.businessNumber")}
                icon={FileText}
                type="text"
                value={businessNumber}
                onChange={(e) => setBusinessNumber(e.target.value)}
                placeholder={t("regb.optional")}
              />
              <Field
                label={t("regb.address")}
                icon={MapPin}
                type="text"
                autoComplete="street-address"
                value={businessAddress}
                onChange={(e) => setBusinessAddress(e.target.value)}
                placeholder={t("regb.optional")}
              />
              <Field
                label={t("regb.phone")}
                icon={Phone}
                type="tel"
                autoComplete="tel"
                value={businessPhone}
                onChange={(e) => setBusinessPhone(e.target.value)}
                placeholder={t("regb.optional")}
                last
              />
            </div>

            {error && (
              <p className="mt-3 text-[13.5px] leading-snug text-destructive">
                {error}
              </p>
            )}

            <div className="mt-5 flex justify-end">
              <Button type="submit" variant="appSolid" shape="rounded" size="default" className="h-10 rounded-md px-5">
                {t("regb.continue")} <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </>
      ) : (
        <>
          <h1 className="font-display text-[2rem] leading-[1.05] tracking-[-0.04em] sm:text-[2.4rem]">
            {t("regb.title2")}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            {t("regb.sub2")} {businessName || t("regb.sub2fallback")}.
          </p>

          <form onSubmit={submit} className="mt-8">
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <Field
                label={t("regi.fullName")}
                icon={User}
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <Field
                label={t("login.email")}
                icon={Mail}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Field
                label={t("login.password")}
                icon={Lock}
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                last
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? t("misc.hidePw") : t("misc.showPw")}
                    className="shrink-0 text-muted-foreground/50 transition-colors hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-[18px] w-[18px]" strokeWidth={1.6} /> : <Eye className="h-[18px] w-[18px]" strokeWidth={1.6} />}
                  </button>
                }
              />
            </div>

            <p className="mt-3 rounded-xl border border-border/60 bg-secondary/50 px-4 py-3 text-[12px] leading-relaxed text-muted-foreground">
              {t("regb.docs")}
            </p>

            <Captcha ref={captchaRef} onToken={setCaptcha} className="mt-4" />

            {error && (
              <p className="mt-3 text-[13.5px] leading-snug text-destructive">
                {error}
              </p>
            )}

            <div className="mt-5 flex justify-end">
              <Button type="submit" variant="appSolid" shape="rounded" size="default" className="h-10 rounded-md px-5" disabled={busy || (captchaEnabled() && !captcha)}>
                {busy ? t("misc.wait") : captchaEnabled() && !captcha ? t("auth.captchaWait") : t("regi.createAccount")}
                {!busy && <ArrowRight className="h-4 w-4" />}
              </Button>
            </div>
          </form>
        </>
      )}

      <p className="mt-10 text-center text-xs leading-relaxed text-muted-foreground">
        {t("login.ncNote")}{" "}
        <Link to="/" className="underline hover:text-foreground">
          {t("login.backHome")}
        </Link>
      </p>
    </AuthShell>
  );
};

export default InscriptionEntreprise;
