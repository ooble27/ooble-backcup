import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Clock, EyeOff, FileLock2, LogIn, RotateCcw } from "lucide-react";
import AppShell from "@/components/app/AppShell";
import { Action, Actions, StepHeader } from "@/components/app/Flat";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { clearCache } from "@/lib/cache";
import { listMyOrders, peekMyOrders, type OrderRow } from "@/lib/orders";
import { useLang, useT } from "@/lib/i18n";
import type { TKey } from "@/lib/translations";

/* Suppression du compte par le client. Explique ce qui part et ce que la loi
   oblige à garder, refuse tant qu'un ordre est en cours, et demande de taper
   SUPPRIMER (DELETE en anglais). Le travail est fait côté serveur
   (fonction edge delete-account). */

const ACTIVE = ["created", "awaiting_payment", "payment_received", "settling"];

const POINTS: { icon: React.ElementType; key: TKey }[] = [
  { icon: LogIn, key: "del.p1" },
  { icon: EyeOff, key: "del.p2" },
  { icon: FileLock2, key: "del.p3" },
  { icon: RotateCcw, key: "del.p4" },
];

const SupprimerCompte = () => {
  const t = useT();
  const [lang] = useLang();
  const navigate = useNavigate();
  const { user, isStaff, signOut } = useAuth();
  const [orders, setOrders] = useState<OrderRow[] | null>(() => peekMyOrders(user?.id, 100));
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { listMyOrders(100).then(setOrders); }, []);

  const active = (orders ?? []).some((o) => ACTIVE.includes(o.status));
  const blocked = isStaff || active;
  const word = t("del.word");
  const ok = typed.trim().toUpperCase() === word && !blocked && !busy;

  const submit = async () => {
    if (!ok) return;
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.functions.invoke("delete-account", { body: { confirm: typed.trim(), lang } });
    if (err || !data?.ok) {
      const status = (err as { context?: Response } | null)?.context?.status;
      setError(t(status === 409 ? "del.active" : status === 403 ? "del.staff" : "del.error"));
      setBusy(false);
      return;
    }
    // D'abord quitter les pages protégées, puis fermer la session locale.
    clearCache();
    navigate("/au-revoir", { replace: true });
    void signOut().catch(() => {});
  };

  return (
    <AppShell header={<StepHeader title={t("del.title")} sub={t("del.sub")} onBack={() => navigate("/app/compte")} />}>
      <p className="ac-k">{t("del.what")}</p>
      <ul className="ac-lines mt-1">
        {POINTS.map(({ icon: Icon, key }) => (
          <li key={key} className="flex gap-3.5 py-3.5">
            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={1.7} />
            <span className="text-[14.5px] leading-relaxed">{t(key)}</span>
          </li>
        ))}
      </ul>

      {blocked ? (
        <p className="ac-note mt-8 flex gap-3" style={{ fontSize: 14.5 }}>
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={1.8} />
          <span>{t(isStaff ? "del.staff" : "del.active")}</span>
        </p>
      ) : (
        <section className="mt-10">
          <label htmlFor="del-confirm" className="block text-[14px] text-muted-foreground">
            {t("del.type")}
          </label>
          <input
            id="del-confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder={word}
            className="ac-in mono mt-2"
            style={{ letterSpacing: "0.12em" }}
          />
          {error && (
            <p role="alert" className="ac-note flex gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </p>
          )}
          <Actions><Action disabled={!ok} onClick={submit}>{t("del.cta")}</Action></Actions>
        </section>
      )}
    </AppShell>
  );
};

export default SupprimerCompte;
