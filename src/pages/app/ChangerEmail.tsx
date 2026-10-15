import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Mail } from "lucide-react";
import AppShell from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";

const ChangerEmail = () => {
  const navigate = useNavigate();
  const { user, updateEmail } = useAuth();
  const t = useT();
  const [newEmail, setNewEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const header = (
    <div className="flex items-start gap-3">
      <button
        type="button"
        onClick={() => navigate("/app/compte")}
        aria-label={t("misc.back")}
        className="mt-0.5 flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-secondary text-foreground transition-colors hover:bg-secondary/70 active:scale-95"
      >
        <ArrowLeft className="h-[18px] w-[18px]" />
      </button>
      <div>
        <h1 className="font-display text-[22px] font-semibold tracking-tight">{t("acct.emailChange")}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">{user?.email}</p>
      </div>
    </div>
  );

  if (sent) {
    return (
      <AppShell header={header}>
        <div className="text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-foreground text-background">
            <Check className="h-6 w-6" strokeWidth={2.2} />
          </span>
          <p className="mt-6 text-[15px] leading-relaxed text-muted-foreground">
            {t("acct.emailSent")}
          </p>
          <div className="mt-6 flex justify-end">
            <Button
              variant="appSolid"
              shape="rounded"
              className="px-6"
              onClick={() => navigate("/app/compte")}
            >
              {t("misc.back")} <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell header={header}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!newEmail.trim() || newEmail.trim() === user?.email) return;
          setSaving(true);
          setError("");
          const res = await updateEmail(newEmail);
          setSaving(false);
          if (res.error) {
            setError(res.error);
          } else {
            setSent(true);
          }
        }}
      >
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="px-4 py-3 transition-colors focus-within:bg-secondary/50">
            <div className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" strokeWidth={1.6} />
              <span className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground/60">
                {t("acct.emailNew")}
              </span>
            </div>
            <div className="mt-1">
              <input
                type="email"
                required
                autoFocus
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="w-full bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/30 no-zoom"
                placeholder="nom@exemple.com"
              />
            </div>
          </div>
        </div>

        {error && (
          <p className="mt-3 text-[13.5px] leading-snug text-destructive">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end">
          <Button
            type="submit"
            variant="appSolid"
            shape="rounded"
            className="px-6"
            disabled={saving || !newEmail.trim()}
          >
            {saving ? t("acct.emailSaving") : t("acct.emailSave")}
            {!saving && <ArrowRight className="h-4 w-4" />}
          </Button>
        </div>
      </form>
    </AppShell>
  );
};

export default ChangerEmail;
