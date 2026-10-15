import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, KeyRound, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import Captcha, { captchaEnabled, type CaptchaHandle } from "@/components/Captcha";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import AuthShell from "@/components/auth/AuthShell";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Mode = "login" | "forgot";
type ForgotStep = "email" | "otp" | "newpw" | "done";

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

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

const Connexion = () => {
  const navigate = useNavigate();
  const { user, signIn, signInWithGoogle } = useAuth();
  const t = useT();
  const [mode, setMode] = useState<Mode>("login");

  useEffect(() => {
    if (user) navigate("/app", { replace: true });
  }, [user, navigate]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [forgotStep, setForgotStep] = useState<ForgotStep>("email");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);

  const isForgot = mode === "forgot";

  // Captcha : connexion, envoi du code de réinitialisation (et son renvoi).
  const [captcha, setCaptcha] = useState<string | null>(null);
  const captchaRef = useRef<CaptchaHandle>(null);
  const needsCaptcha = mode === "login" || forgotStep === "email" || forgotStep === "otp";
  const captchaBlocks = captchaEnabled() && !captcha && (mode === "login" || forgotStep === "email");

  const traduireErreur = (message: string): string => {
    const m = message.toLowerCase();
    if (m.includes("captcha")) return t("auth.errCaptcha");
    if (m.includes("invalid login")) return t("login.errInvalid");
    if (m.includes("email not confirmed")) return t("login.errNotConfirmed");
    if (m.includes("unable to validate email")) return t("login.errBadEmail");
    // Compte bloqué : suspendu par l'équipe. (Un compte fermé par le client change de courriel à la fermeture :
    // son ancien courriel donne « identifiants invalides », jamais ce cas.)
    if (m.includes("banned")) return t("login.errSuspended");
    return message;
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setNotice(null);
    setShowPassword(false);
    setForgotStep("email");
    setOtp("");
    setNewPassword("");
  };

  const sendOtpCode = async () => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reinitialiser`,
        ...(captcha ? { captchaToken: captcha } : {}),
      });
      captchaRef.current?.reset();
      if (err) {
        setError(traduireErreur(err.message));
        return;
      }
      setNotice(t("login.resetSent"));
      setForgotStep("otp");
    } finally {
      setBusy(false);
    }
  };

  const verifyOtpCode = async () => {
    setError(null);
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otp.trim(),
        type: "recovery",
      });
      if (err) {
        setError(t("login.badOtp"));
        return;
      }
      setForgotStep("newpw");
    } finally {
      setBusy(false);
    }
  };

  const saveNewPassword = async () => {
    if (newPassword.length < 8) {
      setError(t("reg.errPasswordShort"));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password: newPassword });
      if (err) {
        setError(err.message);
        return;
      }
      await supabase.auth.signInWithPassword({ email: email.trim(), password: newPassword }).catch(() => {});
      setForgotStep("done");
      setTimeout(() => navigate("/app", { replace: true }), 1400);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isForgot) {
      if (forgotStep === "email") return sendOtpCode();
      if (forgotStep === "otp") return verifyOtpCode();
      if (forgotStep === "newpw") return saveNewPassword();
      return;
    }
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await signIn(email, password, captcha);
      captchaRef.current?.reset();
      if (res.error) return setError(traduireErreur(res.error));
      navigate("/app", { replace: true });
    } finally {
      setBusy(false);
    }
  };

  const title = isForgot
    ? forgotStep === "done"
      ? t("reset.changed")
      : forgotStep === "newpw"
        ? t("reset.title")
        : t("login.forgotTitle")
    : t("login.title");

  const subtitle = isForgot
    ? forgotStep === "done"
      ? t("reset.redirecting")
      : forgotStep === "newpw"
        ? t("reset.sub")
        : forgotStep === "otp"
          ? t("login.resetSent")
          : t("login.forgotSub")
    : t("login.sub");

  return (
    <AuthShell variant="login">
      {isForgot && forgotStep !== "done" && (
        <button
          type="button"
          onClick={() => switchMode("login")}
          className="mb-6 inline-flex items-center gap-2 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {t("login.backToLogin")}
        </button>
      )}

      {forgotStep === "done" ? (
        <div className="text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-foreground text-background">
            <Check className="h-6 w-6" strokeWidth={2.2} />
          </span>
          <h1 className="mt-6 font-display text-[1.8rem] tracking-[-0.03em]">{title}</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{subtitle}</p>
        </div>
      ) : (
        <>
          <h1 className="font-display text-[2rem] leading-[1.05] tracking-[-0.04em] sm:text-[2.4rem]">
            {title}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{subtitle}</p>

          <form onSubmit={submit} className="mt-8">
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              {/* Login mode: email + password */}
              {!isForgot && (
                <>
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
                    autoComplete="current-password"
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
                </>
              )}

              {/* Forgot step 1: email */}
              {isForgot && forgotStep === "email" && (
                <Field
                  label={t("login.email")}
                  icon={Mail}
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  last
                />
              )}

              {/* Forgot step 2: OTP code */}
              {isForgot && forgotStep === "otp" && (
                <Field
                  label={t("login.otpLabel")}
                  icon={KeyRound}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{8}"
                  maxLength={8}
                  autoComplete="one-time-code"
                  placeholder={t("login.otpPlaceholder")}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  required
                  last
                />
              )}

              {/* Forgot step 3: new password */}
              {isForgot && forgotStep === "newpw" && (
                <Field
                  label={t("login.newPwLabel")}
                  icon={Lock}
                  type={showNewPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  last
                  trailing={
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((v) => !v)}
                      aria-label={showNewPassword ? t("misc.hidePw") : t("misc.showPw")}
                      className="shrink-0 text-muted-foreground/50 transition-colors hover:text-foreground"
                    >
                      {showNewPassword ? <EyeOff className="h-[18px] w-[18px]" strokeWidth={1.6} /> : <Eye className="h-[18px] w-[18px]" strokeWidth={1.6} />}
                    </button>
                  }
                />
              )}
            </div>

            {mode === "login" && (
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => switchMode("forgot")}
                  className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t("login.forgot")}
                </button>
              </div>
            )}

            {isForgot && forgotStep === "otp" && (
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => { setOtp(""); sendOtpCode(); }}
                  className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t("login.resendCode")}
                </button>
              </div>
            )}

            {needsCaptcha && <Captcha ref={captchaRef} onToken={setCaptcha} className="mt-4" />}

            {error && (
              <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
                {error}
              </p>
            )}
            {notice && forgotStep === "email" && (
              <p className="mt-3 rounded-md border border-primary/20 bg-primary/[0.04] px-4 py-3 text-[14px] leading-relaxed text-foreground">
                {notice}
              </p>
            )}

            <div className="mt-5 flex justify-end">
              <Button type="submit" variant="appSolid" shape="rounded" size="default" className="h-10 rounded-md px-5" disabled={busy || captchaBlocks}>
                {busy
                  ? t("misc.wait")
                  : isForgot
                    ? forgotStep === "otp"
                      ? t("login.verifyCode")
                      : forgotStep === "newpw"
                        ? t("login.savePw")
                        : t("login.sendLink")
                    : t("login.submit")}
                {!busy && <ArrowRight className="h-4 w-4" />}
              </Button>
            </div>
          </form>

          {!isForgot && (
            <>
              <div className="mt-6 flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">{t("login.or")}</span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <button
                type="button"
                onClick={() => signInWithGoogle()}
                className="mt-4 flex w-full items-center justify-center gap-3 rounded-lg border border-border bg-card px-5 py-3.5 text-sm font-medium transition-colors hover:bg-secondary/60 active:scale-[0.98]"
              >
                <GoogleIcon />
                {t("login.google")}
              </button>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                {t("login.newUser")}{" "}
                <Link
                  to="/inscription"
                  className="text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
                >
                  {t("login.createAccount")}
                </Link>
              </p>
            </>
          )}

          <p className="mt-8 text-center text-xs leading-relaxed text-muted-foreground">
            {t("login.ncNote")}{" "}
            <Link to="/" className="underline hover:text-foreground">
              {t("login.backHome")}
            </Link>
          </p>
        </>
      )}
    </AuthShell>
  );
};

export default Connexion;
