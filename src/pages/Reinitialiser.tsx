import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Check, Eye, EyeOff, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { T } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import AuthShell from "@/components/auth/AuthShell";
import { useT } from "@/lib/i18n";

const Reinitialiser = () => {
  const navigate = useNavigate();
  const { updatePassword, user } = useAuth();
  const t = useT();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    if (window.location.hash.includes("type=recovery")) {
      setReady(true);
    }
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError(t("reg.errPasswordShort"));
      return;
    }
    if (password !== confirm) {
      setError(t("reset.mismatch"));
      return;
    }
    setBusy(true);
    setError(null);
    const res = await updatePassword(password);
    if (res.error) {
      setBusy(false);
      setError(t("reset.expired"));
      return;
    }
    if (user?.email) {
      await supabase.auth.signInWithPassword({ email: user.email, password }).catch(() => {});
    }
    setBusy(false);
    setDone(true);
    setTimeout(() => navigate("/app", { replace: true }), 1400);
  };

  return (
    <AuthShell variant="reset">
      {done ? (
        <div className="text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-foreground text-background">
            <Check className="h-6 w-6" strokeWidth={2.2} />
          </span>
          <h1 className="mt-6 font-display text-[1.8rem] tracking-[-0.03em]"><T en="Password changed">Mot de passe modifié</T></h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            <T en="You'll be redirected to your dashboard…">Vous allez être redirigé vers votre espace…</T>
          </p>
        </div>
      ) : (
        <>
          <h1 className="font-display text-[2rem] leading-[1.05] tracking-[-0.03em] sm:text-[2.4rem]">
            <T en="New password">Nouveau mot de passe</T>
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            <T en="Choose a new password for your Ooble account.">Choisissez un nouveau mot de passe pour votre compte Ooble.</T>
          </p>

          {ready ? (
            <form onSubmit={submit} className="mt-7 space-y-3">
              <label className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3.5 transition-colors focus-within:border-foreground">
                <Lock className="h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={1.9} />
                <input
                  type={show ? "text" : "password"}
                  placeholder={t("reset.newPw")}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  required
                  className="w-full bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? t("misc.hidePw") : t("misc.showPw")}
                  className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {show ? <EyeOff className="h-5 w-5" strokeWidth={1.9} /> : <Eye className="h-5 w-5" strokeWidth={1.9} />}
                </button>
              </label>

              <label
                className={cn(
                  "flex items-center gap-3 rounded-2xl border bg-card px-4 py-3.5 transition-colors focus-within:border-foreground",
                  confirm && confirm !== password ? "border-destructive/60" : "border-border",
                )}
              >
                <Lock className="h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={1.9} />
                <input
                  type={show ? "text" : "password"}
                  placeholder={t("reset.confirmPw")}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); setError(null); }}
                  required
                  className="w-full bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
                />
                {confirm && confirm === password && <Check className="h-5 w-5 shrink-0 text-primary" strokeWidth={2} />}
              </label>
              {confirm && confirm !== password && (
                <p className="px-1 text-[13px] text-destructive">{t("reset.mismatch")}</p>
              )}

              {error && (
                <p className="text-[13.5px] font-medium leading-snug text-destructive">
                  {error}
                </p>
              )}

              <div className="flex justify-end pt-1">
                <Button type="submit" variant="appSolid" shape="rounded" size="default" className="h-10 rounded-md px-5" disabled={busy}>
                  {busy ? t("misc.wait") : <T en="Save">Enregistrer</T>}
                  {!busy && <ArrowRight className="h-4 w-4" />}
                </Button>
              </div>
            </form>
          ) : (
            <p className="mt-7 text-[13px] leading-relaxed text-muted-foreground">
              <T en="Open this page from the link sent to your email. If you're already here,">
                Ouvrez cette page depuis le lien reçu par courriel. Si vous y êtes déjà,
              </T>{" "}
              <Link to="/connexion" className="text-foreground underline underline-offset-2">
                <T en="request a new link">redemandez un lien</T>
              </Link>
              .
            </p>
          )}
        </>
      )}
    </AuthShell>
  );
};

export default Reinitialiser;
