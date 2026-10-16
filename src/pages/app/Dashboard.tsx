import { useEffect, useState } from "react";
import { useAppSettings } from "@/lib/settings";
import { Link, useNavigate } from "react-router-dom";
import { Clock, Coins, HandCoins, Inbox, ChevronRight } from "lucide-react";
import AppShell from "@/components/app/AppShell";
import RateChart from "@/components/app/RateChart";
import { openNetworks } from "@/components/app/networks";
import { useUsdtRate } from "@/hooks/useUsdtRate";
import { useUsdtHistory } from "@/hooks/useUsdtHistory";
import { listMyOrders, peekMyOrders, type OrderRow } from "@/lib/orders";
import { ActivityRow } from "@/components/app/ActivityList";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { getMyProfile, peekMyProfile, type MyProfile } from "@/lib/profile";
import { businessBlocked } from "@/components/app/BusinessGate";
import BusinessMark from "@/components/app/BusinessMark";
import InAppMessage from "@/components/app/InAppMessage";

/** Le taux d'achat (cours du marché + marge d'achat), à 4 décimales. */
const nfRate = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 4, minimumFractionDigits: 4 });

const RecentActivity = () => {
  const t = useT();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [orders, setOrders] = useState<OrderRow[] | null>(() => peekMyOrders(user?.id, 3));

  useEffect(() => {
    let active = true;
    listMyOrders(3).then((rows) => {
      if (active) setOrders(rows);
    });
    return () => { active = false; };
  }, [user]);

  return (
    <div className="rounded-2xl border border-border bg-card px-5 py-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {t("dash.recent")}
        </p>
        {orders && orders.length > 0 && (
          <Link to="/app/activite" className="inline-flex items-center gap-0.5 text-[12px] font-medium text-foreground transition-opacity hover:opacity-70">
            {t("dash.viewAll")} <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      {orders === null ? (
        <div className="py-6 text-center text-[13px] text-muted-foreground">{t("dash.loading")}</div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center py-7 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
            <Inbox className="h-5 w-5" strokeWidth={1.6} />
          </span>
          <p className="mt-3 text-[14px] font-medium text-foreground">{t("dash.noTx")}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {t("dash.noTxSub")}
          </p>
        </div>
      ) : (
        <div className="mt-1 divide-y divide-border">
          {orders.map((o) => (
            <ActivityRow
              key={o.id}
              o={o}
              onClick={() => navigate(`/app/activite/${o.id}`, { state: { order: o } })}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const Dashboard = () => {
  const t = useT();
  // Relu toutes les 5 secondes : le serveur le recalcule toutes les 10 secondes.
  const rate = useUsdtRate({ live: true });
  const history = useUsdtHistory();

  const { user, isStaff } = useAuth();
  const { tradingEnabled, networks } = useAppSettings();
  const openCount = openNetworks(networks).length;
  const [profile, setProfile] = useState<MyProfile | null>(() => peekMyProfile(user?.id) ?? null);
  useEffect(() => { getMyProfile().then(setProfile); }, []);
  const kybPending = profile?.businessStatus === "pending";
  const firstName = user?.name?.trim().split(/\s+/)[0] ?? "";

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 5) return t("dash.gn");
    if (h < 12) return t("dash.gm");
    if (h < 18) return t("dash.ga");
    return t("dash.ge");
  })();

  return (
    <AppShell
      wide
      header={
        firstName ? (
          <div className="min-w-0">
            <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {greeting}
            </p>
            <h1 className="mt-0.5 truncate font-display text-[26px] font-semibold leading-tight tracking-tight">
              {firstName}
            </h1>
          </div>
        ) : (
          <h1 className="font-display text-[22px] font-semibold leading-tight tracking-tight">
            {greeting}
          </h1>
        )
      }
    >
      <InAppMessage />

      {!isStaff && businessBlocked(profile) && (
        <Link
          to="/app/entreprise"
          className="mb-4 flex items-center gap-4 rounded-2xl border border-border bg-card px-4 py-4 transition-colors hover:bg-secondary/40"
        >
          <BusinessMark name={profile?.businessName} size="md" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[14px] font-semibold">{kybPending && <Clock className="h-3.5 w-3.5 text-muted-foreground" />}{kybPending ? t("kyb.stPending") : t("kyb.gateTitle")}</p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">{kybPending ? t("kyb.gatePending") : t("kyb.gateSub")}</p>
          </div>
          <ChevronRight className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
        </Link>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Taux USDT / CAD — toujours en premier */}
        <section className="flex flex-col rounded-2xl border border-border bg-card p-5 md:row-span-1">
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {t("dash.rate")}
          </span>

          <div className="mt-4 flex items-baseline gap-2">
            <span className="font-display text-[34px] font-light leading-none tracking-tight tabular-nums">
              {nfRate.format(rate.buy)}
            </span>
            <span className="text-[15px] font-medium text-muted-foreground">CAD</span>
          </div>
          <RateChart data={history.points} className="hidden w-full text-foreground/55 md:mt-4 md:block md:min-h-[6rem] md:flex-1" />
        </section>

        {/* Actions + réseaux — col droite sur desktop, juste après taux sur mobile */}
        <div className="space-y-4 md:row-span-2">
          <div className="grid grid-cols-2 gap-3">
            <Link
              to="/app/acheter"
              className={cn(
                "flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4 transition-colors",
                (tradingEnabled || isStaff)
                  ? "hover:bg-secondary/50 active:bg-secondary"
                  : "pointer-events-none opacity-40",
              )}
              aria-disabled={!(tradingEnabled || isStaff)}
              tabIndex={(tradingEnabled || isStaff) ? undefined : -1}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-foreground/60">
                <Coins className="h-5 w-5" strokeWidth={1.6} />
              </span>
              <span className="text-[15px] font-medium">{t("dash.buy")}</span>
            </Link>
            <Link
              to="/app/vendre"
              className={cn(
                "flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4 transition-colors",
                (tradingEnabled || isStaff)
                  ? "hover:bg-secondary/50 active:bg-secondary"
                  : "pointer-events-none opacity-40",
              )}
              aria-disabled={!(tradingEnabled || isStaff)}
              tabIndex={(tradingEnabled || isStaff) ? undefined : -1}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-foreground/60">
                <HandCoins className="h-5 w-5" strokeWidth={1.6} />
              </span>
              <span className="text-[15px] font-medium">{t("dash.sell")}</span>
            </Link>
          </div>
          {!tradingEnabled && !isStaff && (
            <p className="text-center text-[12px] text-muted-foreground/70">
             {t("dash.tradingSuspended")}
            </p>
          )}

          {/* Le nombre suit les blockchains ouvertes dans Réglages › Réseaux. */}
          {openCount > 0 && <div>
            <p className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {openCount === 1 ? t("dash.networksOne") : t("dash.networks").replace("{n}", String(openCount))}
            </p>
            <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
              {openNetworks(networks).map((n) => (
                <div
                  key={n.id}
                  className="flex shrink-0 items-center gap-2.5 rounded-[10px] border border-border bg-card py-2 pl-2 pr-3.5"
                >
                  <img src={`/coins/${n.id}.svg`} alt="" className="h-7 w-7 rounded-full" draggable={false} />
                  <span className="whitespace-nowrap text-sm font-normal">{n.name}</span>
                </div>
              ))}
            </div>
          </div>}
        </div>

        {/* Activité récente — sous réseaux sur mobile, sous taux sur desktop */}
        <RecentActivity />
      </div>
    </AppShell>
  );
};

export default Dashboard;
