import { useEffect, useState } from "react";
import { useAppSettings } from "@/lib/settings";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Clock, Coins, HandCoins, ChevronRight } from "lucide-react";
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
    <section>
      <div className="flex items-baseline justify-between gap-4">
        <p className="ac-k">{t("dash.recent")}</p>
        {orders && orders.length > 0 && (
          <Link to="/app/activite" className="ac-link">{t("dash.viewAll")} <ChevronRight className="h-3.5 w-3.5" /></Link>
        )}
      </div>
      {orders && orders.length === 0 && (
        <div className="mt-4">
          <p className="text-[15px] font-medium text-foreground">{t("dash.noTx")}</p>
          <p className="mt-1 text-[13.5px] text-muted-foreground">{t("dash.noTxSub")}</p>
        </div>
      )}
      {orders && orders.length > 0 && (
        <div className="ac-lines mt-2">
          {orders.map((o) => (
            <ActivityRow
              key={o.id}
              o={o}
              onClick={() => navigate(`/app/activite/${o.id}`, { state: { order: o } })}
            />
          ))}
        </div>
      )}
    </section>
  );
};

/** Acheter ou vendre : une ligne à plat qui glisse au survol ; grisée quand les échanges sont fermés. */
const Trade = ({ to, icon: Icon, name, desc, open }: { to: string; icon: React.ElementType; name: string; desc: string; open: boolean }) => (
  <Link
    to={to}
    className={cn("ac-row", !open && "pointer-events-none opacity-40")}
    style={{ padding: "18px 0" }}
    aria-disabled={!open}
    tabIndex={open ? undefined : -1}
  >
    <Icon className="ac-ico" strokeWidth={1.7} style={{ width: 24, height: 24 }} />
    <span className="ac-txt">
      <span className="ac-n" style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.02em" }}>{name}</span>
      <span className="ac-d">{desc}</span>
    </span>
    <ChevronRight className="ac-go" strokeWidth={1.8} />
  </Link>
);

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
        <Link to="/app/entreprise" className="ac-todo" style={{ marginTop: 0, marginBottom: 40 }}>
          <span className="ac-todo-t flex items-center gap-2">{kybPending && <Clock className="h-4 w-4 text-muted-foreground" />}{kybPending ? t("kyb.stPending") : t("kyb.gateTitle")}</span>
          <span className="ac-todo-s">{kybPending ? t("kyb.gatePending") : t("kyb.gateSub")}</span>
          <span className="ac-todo-c">{kybPending ? t("kyb.gateView") : t("kyb.gateCta")} <ArrowRight className="h-4 w-4" strokeWidth={1.9} /></span>
        </Link>
      )}

      <div className="grid grid-cols-1 gap-x-16 gap-y-12 md:grid-cols-2">
        {/* Taux USDT / CAD — toujours en premier */}
        <section className="flex flex-col">
          <p className="ac-k">{t("dash.rate")}</p>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-display text-[44px] font-light leading-none tracking-tight tabular-nums">
              {nfRate.format(rate.buy)}
            </span>
            <span className="text-[16px] font-medium text-muted-foreground">CAD</span>
          </div>
          <RateChart data={history.points} className="hidden w-full text-foreground/55 md:mt-6 md:block md:min-h-[6rem] md:flex-1" />
        </section>

        {/* Acheter, vendre et blockchains — col droite sur desktop, juste après le taux sur mobile */}
        <div className="md:row-span-2">
          <div className="ac-lines">
            <Trade to="/app/acheter" icon={Coins} name={t("dash.buy")} desc={t("dash.buySub")} open={tradingEnabled || isStaff} />
            <Trade to="/app/vendre" icon={HandCoins} name={t("dash.sell")} desc={t("dash.sellSub")} open={tradingEnabled || isStaff} />
          </div>
          {!tradingEnabled && !isStaff && (
            <p className="mt-2 text-[12.5px] text-muted-foreground">{t("dash.tradingSuspended")}</p>
          )}

          {/* Le nombre suit les blockchains ouvertes dans Réglages › Réseaux. */}
          {openCount > 0 && (
            <div className="mt-10">
              <p className="ac-k">
                {openCount === 1 ? t("dash.networksOne") : t("dash.networks").replace("{n}", String(openCount))}
              </p>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
                {openNetworks(networks).map((n) => (
                  <span key={n.id} className="flex items-center gap-2.5">
                    <img src={`/coins/${n.id}.svg`} alt="" className="h-6 w-6 rounded-full" draggable={false} />
                    <span className="whitespace-nowrap text-[14px]">{n.name}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Activité récente — sous les blockchains sur mobile, sous le taux sur desktop */}
        <RecentActivity />
      </div>
    </AppShell>
  );
};

export default Dashboard;
