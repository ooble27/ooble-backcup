import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Clock, EyeOff, FileLock2, LogIn, RotateCcw } from "lucide-react";
import AppShell from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { clearCache } from "@/lib/cache";
import { listMyOrders, peekMyOrders, type OrderRow } from "@/lib/orders";
import { useLang, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
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
    <AppShell
      backTo="/app/compte"
      header={
        <div>
          <h1 className="font-display text-[22px] font-semibold tracking-tight">{t("del.title")}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">{t("del.sub")}</p>
        </div>
      }
    >
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <p className="px-5 pb-1 pt-4 text-[11.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{t("del.what")}</p>
        <ul className="divide-y divide-border">
          {POINTS.map(({ icon: Icon, key }) => (
            <li key={key} className="flex gap-3.5 px-5 py-3.5">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-secondary text-foreground/75">
                <Icon className="h-[17px] w-[17px]" strokeWidth={1.9} />
              </span>
              <span className="text-[14px] leading-relaxed">{t(key)}</span>
            </li>
          ))}
        </ul>
      </section>

      {blocked ? (
        <div className="mt-4 flex gap-3 rounded-2xl border border-border bg-card p-4 text-[14px] leading-relaxed">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={1.8} />
          <span>{t(isStaff ? "del.staff" : "del.active")}</span>
        </div>
      ) : (
        <section className="mt-4">
          <label htmlFor="del-confirm" className="block text-[13.5px] text-muted-foreground">
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
            className="mt-2 w-full rounded-xl border border-border bg-secondary/40 px-4 py-3 font-mono text-[16px] tracking-[0.12em] outline-none placeholder:text-muted-foreground/40 focus:border-foreground/40"
          />
          {error && (
            <p role="alert" className="mt-3 flex gap-2 text-[13.5px] text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </p>
          )}
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={submit}
              disabled={!ok}
              className={cn(
                "inline-flex h-10 items-center rounded-xl px-5 text-[14px] font-semibold transition-opacity",
                "bg-destructive text-white disabled:opacity-35",
              )}
            >
              {busy ? t("del.busy") : t("del.cta")}
            </button>
          </div>
        </section>
      )}
    </AppShell>
  );
};

export default SupprimerCompte;
