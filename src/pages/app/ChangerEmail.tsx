import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, Mail } from "lucide-react";
import AppShell from "@/components/app/AppShell";
import { Action, Actions, StepHeader } from "@/components/app/Flat";
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

  const header = <StepHeader title={t("acct.emailChange")} sub={user?.email} onBack={() => navigate("/app/compte")} />;

  if (sent) {
    return (
      <AppShell header={header}>
        <Check className="h-7 w-7 text-foreground" strokeWidth={2} />
        <p className="ac-sub mt-4" style={{ fontSize: 15 }}>{t("acct.emailSent")}</p>
        <Actions><Action onClick={() => navigate("/app/compte")}>{t("misc.back")}</Action></Actions>
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
        <label htmlFor="new-email" className="ac-k flex items-center gap-2">
          <Mail className="h-3.5 w-3.5" strokeWidth={1.8} /> {t("acct.emailNew")}
        </label>
        <input
          id="new-email"
          type="email"
          required
          autoFocus
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          className="ac-in no-zoom mt-1"
          placeholder="nom@exemple.com"
        />

        {error && <p className="ac-note">{error}</p>}

        <div className="mt-10">
          <button type="submit" className="ac-act" disabled={saving || !newEmail.trim()}>
            {t("acct.emailSave")} <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2} />
          </button>
        </div>
      </form>
    </AppShell>
  );
};

export default ChangerEmail;
