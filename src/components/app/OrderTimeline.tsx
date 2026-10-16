import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getLang, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { TKey } from "@/lib/translations";
import type { OrderRow } from "@/lib/orders";

/**
 * Suivi d'une commande, étape par étape. Les étapes franchies portent leur heure ; le trait se
 * remplit jusqu'à l'étape en cours, une étape après l'autre, à l'ouverture comme quand le
 * statut change sous les yeux du client (la page reçoit les changements en direct).
 */

/** Rang d'un statut dans le parcours : 0 créée, 1 payée / USDT reçus, 2 en règlement, 3 terminée. */
const RANK: Record<string, number> = { created: 0, awaiting_payment: 0, payment_received: 1, settling: 2, completed: 3 };
const ENDED: Record<string, TKey> = { cancelled: "tl.cancelled", expired: "tl.expired", refunded: "tl.refunded" };

const STEPS: Record<"buy" | "sell", TKey[]> = {
  buy: ["tl.created", "tl.buyPaid", "tl.buySending", "tl.buyDone"],
  sell: ["tl.created", "tl.sellReceived", "tl.sellSending", "tl.sellDone"],
};

const when = (iso: string) => {
  const d = new Date(iso);
  const loc = getLang() === "en" ? "en-CA" : "fr-CA";
  const today = d.toDateString() === new Date().toDateString();
  const time = new Intl.DateTimeFormat(loc, { hour: "2-digit", minute: "2-digit" }).format(d);
  return today ? time : `${new Intl.DateTimeFormat(loc, { day: "numeric", month: "short" }).format(d)}, ${time}`;
};

/** Heure de passage à chaque rang, d'après l'historique de la commande. */
function useStepTimes(o: OrderRow) {
  const [times, setTimes] = useState<Record<number, string>>({ 0: o.created_at });
  useEffect(() => {
    let on = true;
    void supabase.from("order_events").select("new_status, created_at").eq("order_id", o.id).order("created_at")
      .then(({ data }) => {
        if (!on || !data) return;
        const t: Record<number, string> = { 0: o.created_at };
        for (const e of data) {
          const r = RANK[e.new_status as string];
          if (r != null && r > 0 && !t[r]) t[r] = e.created_at;
        }
        setTimes(t);
      });
    return () => { on = false; };
  }, [o.id, o.created_at, o.status]);
  return times;
}

export default function OrderTimeline({ o }: { o: OrderRow }) {
  const t = useT();
  const steps = STEPS[o.side === "sell" ? "sell" : "buy"];
  const ended = ENDED[o.status];
  const times = useStepTimes(o);
  // Rang atteint : pour une commande arrêtée, la dernière étape franchie avant l'arrêt.
  const reached = ended ? Math.max(0, ...Object.keys(times).map(Number)) : (RANK[o.status] ?? 0);

  // Le trait avance d'une étape à la fois jusqu'au rang atteint (jusqu'à l'arrêt, s'il y en a un).
  const final = ended ? reached + 1 : reached;
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [shown, setShown] = useState(reduce ? final : -1);
  const target = useRef(final);
  target.current = final;
  useEffect(() => {
    if (reduce) { setShown(final); return; }
    if (shown === final) return;
    const id = window.setTimeout(() => setShown((s) => (s < target.current ? s + 1 : target.current)), shown < 0 ? 120 : 380);
    return () => window.clearTimeout(id);
  }, [shown, final, reduce]);

  const list = ended ? steps.slice(0, reached + 1) : steps;
  const rows: { key: TKey; i: number; end?: boolean }[] = list.map((k, i) => ({ key: k, i }));
  if (ended) rows.push({ key: ended, i: reached + 1, end: true });

  return (
    <ol className="mb-6 mt-1 px-1" aria-label={t("tl.title")}>
      {rows.map((r, n) => {
        const done = !r.end && shown >= r.i;
        const current = !ended && !r.end && r.i === reached + 1 && shown >= reached;
        const last = n === rows.length - 1;
        const time = r.end ? null : times[r.i];
        return (
          <li key={r.key} className="relative flex gap-4 pb-6 last:pb-0">
            {/* Le trait vers l'étape suivante : gris, puis rempli quand elle est franchie. */}
            {!last && (
              <span aria-hidden="true" className="absolute left-[9px] top-[22px] bottom-0 w-[2px] bg-border">
                <span
                  className="absolute inset-0 origin-top bg-foreground transition-transform duration-[380ms] ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none"
                  style={{ transform: `scaleY(${shown > r.i ? 1 : 0})` }}
                />
              </span>
            )}
            <span aria-hidden="true" className="relative z-[1] mt-[1px] flex h-5 w-5 shrink-0 items-center justify-center">
              {r.end ? (
                <X className={cn("h-[18px] w-[18px] text-destructive transition-all duration-500", shown >= r.i ? "scale-100 opacity-100" : "scale-50 opacity-0")} strokeWidth={2.4} />
              ) : (
                <Check
                  className={cn("h-[18px] w-[18px] transition-all duration-500 ease-[cubic-bezier(.34,1.56,.64,1)]", done ? "scale-100 opacity-100 text-foreground" : "scale-50 opacity-0")}
                  strokeWidth={2.6}
                />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn(
                "text-[14.5px] leading-5 transition-colors duration-500",
                r.end ? (shown >= r.i ? "font-medium text-destructive" : "text-muted-foreground") : done ? "font-medium text-foreground" : current ? "text-foreground/80" : "text-muted-foreground",
              )}>
                {t(r.key)}
                {current && <span className="ml-2 text-[12px] text-muted-foreground animate-pulse">{t("tl.inProgress")}</span>}
              </p>
              {time && done && <p className="mt-0.5 text-[12px] text-muted-foreground tabular-nums">{when(time)}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
