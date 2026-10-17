import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, Eye, EyeOff } from "lucide-react";
import AppShell from "@/components/app/AppShell";
import { Action, Actions, StepHeader } from "@/components/app/Flat";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";

/**
 * Changer son mot de passe depuis l'app (Mon compte › Mot de passe), dans le style de l'app.
 * La page publique /reinitialiser reste celle du lien « mot de passe oublié » reçu par courriel.
 */
const ChangerMotDePasse = () => {
  const navigate = useNavigate();
  const { updatePassword } = useAuth();
  const t = useT();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const back = () => navigate("/app/compte");
  const header = <StepHeader title={t("acct.password")} sub={t("acct.pwSub")} onBack={back} />;
  const mismatch = confirm.length > 0 && pw !== confirm;

  const save = async () => {
    if (pw.length < 8) { setError(t("reg.errPasswordShort")); return; }
    if (pw !== confirm) { setError(t("reset.mismatch")); return; }
    setBusy(true);
    setError(null);
    const res = await updatePassword(pw);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    setDone(true);
  };

  if (done) {
    return (
      <AppShell header={header}>
        <Check className="h-7 w-7 text-foreground" strokeWidth={2} />
        <p className="ac-sub mt-4" style={{ fontSize: 15 }}>{t("acct.pwDone")}</p>
        <Actions><Action onClick={back}>{t("misc.back")}</Action></Actions>
      </AppShell>
    );
  }

  return (
    <AppShell header={header}>
      <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="grid gap-8">
        <div>
          <label htmlFor="pw-new" className="ac-k">{t("reset.newPw")}</label>
          <div className="relative">
            <input
              id="pw-new"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              autoFocus
              value={pw}
              onChange={(e) => { setPw(e.target.value); setError(null); }}
              className="ac-in no-zoom mt-1 pr-10"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? t("misc.hidePw") : t("misc.showPw")}
              className="absolute bottom-3 right-0 p-1 text-muted-foreground transition-colors hover:text-foreground"
            >
              {show ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
            </button>
          </div>
          <p className="ac-help">{t("acct.pwRule")}</p>
        </div>
        <div>
          <label htmlFor="pw-confirm" className="ac-k">{t("reset.confirmPw")}</label>
          <input
            id="pw-confirm"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => { setConfirm(e.target.value); setError(null); }}
            className="ac-in no-zoom mt-1"
          />
          {mismatch && <p className="ac-note">{t("reset.mismatch")}</p>}
        </div>

        {error && <p className="ac-note" style={{ marginTop: -12 }}>{error}</p>}

        <div>
          <button type="submit" className="ac-act" disabled={busy || pw.length < 8 || pw !== confirm}>
            {t("acct.pwSave")} <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2} />
          </button>
        </div>
      </form>
    </AppShell>
  );
};

export default ChangerMotDePasse;
