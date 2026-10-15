import { useEffect, useState } from "react";
import { getAllowance, peekAllowance, type TradeAllowance } from "@/lib/orders";
import { useAuth } from "@/lib/auth";
import { getAppSettingsNow } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { TKey } from "@/lib/translations";

/* ─── Limites sur 24 heures (même règle qu'en base) ───
   Affichées sur la page /app/limites, ouverte depuis Mon compte. */

const nfInt = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 });

const fmtNext = (d: Date) =>
  d.toLocaleString("fr-CA", {
    hour: "2-digit", minute: "2-digit",
    ...(d.toDateString() !== new Date().toDateString() ? { day: "numeric", month: "long" } : {}),
  });

/** Limites sur 24 heures : achats et ventes, comptés séparément. */
export default function LimitsCard({ className }: { className?: string }) {
  const t = useT();
  const { user } = useAuth();
  // Valeurs déjà connues (préchargement de l'app), sinon la limite pleine :
  // la carte s'affiche tout de suite à sa taille finale, sans saut, puis se
  // met à jour.
  const [lim, setLim] = useState<{ buy: TradeAllowance; sell: TradeAllowance }>(() => {
    const max = getAppSettingsNow().tradeDailyMaxCad;
    const full: TradeAllowance = { limit: max, used: 0, remaining: max, nextAt: null };
    return { buy: peekAllowance(user?.id, "buy") ?? full, sell: peekAllowance(user?.id, "sell") ?? full };
  });
  useEffect(() => {
    Promise.all([getAllowance("buy"), getAllowance("sell")]).then(([buy, sell]) => setLim({ buy, sell }));
  }, []);
  const rows: { key: "buy" | "sell"; label: TKey; next: TKey }[] = [
    { key: "buy", label: "acct.limitBuy", next: "acct.buyLimitNext" },
    { key: "sell", label: "acct.limitSell", next: "acct.sellLimitNext" },
  ];
  const notes = rows.filter((r) => lim[r.key].nextAt).map((r) => t(r.next).replace("{time}", fmtNext(lim[r.key].nextAt!)));
  return (
    <section className={cn("overflow-hidden rounded-2xl border border-border bg-card px-6 py-5", className)}>
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-[11.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{t("acct.limits")}</p>
        <p className="text-[13px] text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">{nfInt.format(lim.buy.limit)} $</span> {t("acct.buyLimitPer")}
        </p>
      </div>
      <div className="mt-4 flex flex-col gap-3.5">
        {rows.map(({ key, label }) => {
          const a = lim[key];
          const pct = a.limit > 0 ? Math.min(100, (a.used / a.limit) * 100) : 0;
          return (
            <div key={key}>
              <div className="flex items-baseline justify-between gap-4 text-[14.5px]">
                <span>{t(label)}</span>
                <span className="text-[13.5px] text-muted-foreground">
                  {t("acct.buyLimitLeft")} <span className="font-medium text-foreground tabular-nums">{nfInt.format(Math.floor(a.remaining))} $</span>
                  <span className="sr-only"> · {t("acct.buyLimitUsed")} {nfInt.format(a.used)} $</span>
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-foreground transition-[width]" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-[12.5px] leading-relaxed text-muted-foreground">
        {notes.length ? notes.join(" ") : t("acct.buyLimitReset")}
      </p>
    </section>
  );
}
