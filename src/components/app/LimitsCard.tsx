import { useEffect, useState } from "react";
import { getAllowance, peekAllowance, type TradeAllowance } from "@/lib/orders";
import { useAuth } from "@/lib/auth";
import { getAppSettingsNow } from "@/lib/settings";
import { useT } from "@/lib/i18n";
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
    <section className={className}>
      <p className="ac-help" style={{ marginTop: 0 }}>
        <span className="font-medium text-foreground tabular-nums">{nfInt.format(lim.buy.limit)} $</span> {t("acct.buyLimitPer")}
      </p>
      <div className="mt-6 flex flex-col gap-7">
        {rows.map(({ key, label }) => {
          const a = lim[key];
          const pct = a.limit > 0 ? Math.min(100, (a.used / a.limit) * 100) : 0;
          return (
            <div key={key}>
              <p className="ac-k">{t(label)}</p>
              <p className="mt-2 font-display text-[34px] font-semibold leading-none tracking-tight tabular-nums">
                {nfInt.format(Math.floor(a.remaining))} $ <span className="text-[14px] font-normal text-muted-foreground">{t("acct.buyLimitLeft").toLowerCase()}</span>
                <span className="sr-only"> · {t("acct.buyLimitUsed")} {nfInt.format(a.used)} $</span>
              </p>
              <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-border">
                <div className="h-full rounded-full bg-foreground transition-[width]" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="ac-help mt-6">
        {notes.length ? notes.join(" ") : t("acct.buyLimitReset")}
      </p>
    </section>
  );
}
