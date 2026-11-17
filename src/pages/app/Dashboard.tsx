import { useEffect, useState } from "react";
import { useAppSettings } from "@/lib/settings";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Clock, Coins, HandCoins, ChevronRight } from "lucide-react";
import AppShell from "@/components/app/AppShell";
import { useUsdtRate } from "@/hooks/useUsdtRate";
import { listMyOrders, peekMyOrders, type OrderRow } from "@/lib/orders";
import { ActivityRow } from "@/components/app/ActivityList";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { getMyProfile, peekMyProfile, type MyProfile } from "@/lib/profile";
import { businessBlocked } from "@/components/app/BusinessGate";
import InAppMessage from "@/components/app/InAppMessage";
import { openAssets, primaryAsset } from "@/lib/assets";
import { openNetworks } from "@/components/app/networks";
import NetworkGlyph from "@/components/app/NetworkGlyph";
import { PAGE_COLORS } from "@/lib/installed";
import { Sparkle, WholeMascot } from "@/components/launch/PlayLogin";

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
          {/* Sur téléphone, seulement la dernière opération ; « Voir tout » mène à l'Activité. */}
          {orders.map((o, i) => (
            <div key={o.id} className={i > 0 ? "hidden sm:block" : undefined}>
              <ActivityRow
                o={o}
                onClick={() => navigate(`/app/activite/${o.id}`, { state: { order: o } })}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

/** Acheter ou vendre : une grande tuile carrée de couleur au trait noir ; grisée quand les échanges sont fermés. */
const Trade = ({ to, icon: Icon, name, desc, open, bg }: { to: string; icon: React.ElementType; name: string; desc: string; open: boolean; bg: string }) => (
  <Link
    to={to}
    className={cn("dash-tile", !open && "pointer-events-none opacity-40")}
    style={{ background: bg }}
    aria-disabled={!open}
    tabIndex={open ? undefined : -1}
  >
    <span className="dash-tile-ic"><Icon className="h-[22px] w-[22px]" strokeWidth={2} /></span>
    <span>
      <span className="block text-[21px] font-medium leading-tight tracking-[-0.02em] text-[#111]">{name}</span>
      <span className="mt-0.5 block text-[12.5px] leading-snug text-[#111]">{desc} »</span>
    </span>
  </Link>
);

const DASH_CSS = `
.dash-hero { position: relative; padding-top: 8px; }
.dash-pill { display: inline-flex; align-items: center; gap: 7px; height: 30px; padding: 0 4px 0 13px; border-radius: 999px; background: #111; color: #fff; font-size: 12.5px; font-weight: 500; }
.dash-pill i { font-style: normal; width: 22px; height: 22px; border-radius: 999px; background: #ff6a3d; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; }
.dash-rate { margin-top: 12px; font-size: clamp(56px, 17vw, 76px); font-weight: 500; letter-spacing: -0.05em; line-height: 1; color: #111; font-variant-numeric: tabular-nums; }
.dash-cap { margin: 8px 0 0; font-size: 14px; color: #111; }
.dash-mascot { position: absolute; right: 0; top: 34px; }
.dash-spark { position: absolute; right: 96px; top: 26px; }
@media (prefers-reduced-motion: no-preference) {
  .dash-mascot { animation: dash-float 3.4s ease-in-out infinite; }
  .dash-spark { animation: dash-tw 2.6s ease-in-out infinite; }
}
@keyframes dash-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
@keyframes dash-tw { 0%, 100% { transform: scale(.85) rotate(0); } 50% { transform: scale(1.1) rotate(20deg); } }
.dash-tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 26px; }
.dash-tile { display: flex; flex-direction: column; justify-content: space-between; min-height: 164px; padding: 16px; border: 3px solid #111; border-radius: 26px; color: #111; text-decoration: none; transition: transform .15s; }
.dash-tile:active { transform: scale(.97); }
@media (hover: hover) { .dash-tile:hover { transform: translateY(-2px); } }
.dash-tile-ic { width: 46px; height: 46px; border-radius: 999px; background: #111; color: #fff; display: flex; align-items: center; justify-content: center; }
.dash-act { margin-top: 12px; padding: 14px 18px 8px; }
.dash-nets { margin-top: 12px; padding: 14px 16px 16px; }
.dash-nets-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin-top: 12px; }
.dash-net { display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 500; color: #111; text-align: center; }
`;

const Dashboard = () => {
  const t = useT();
  // Relu toutes les 5 secondes : le serveur le recalcule toutes les 10 secondes.
  const settings = useAppSettings();
  const { tradingEnabled, networks } = settings;
  // Taux de la cryptomonnaie principale (la seule ouverte, sinon l'USDC).
  const coin = primaryAsset(settings);
  const rate = useUsdtRate({ live: true, asset: coin.id });
  // Blockchains où la cryptomonnaie principale est ouverte.
  const nets = openNetworks(networks, undefined, openAssets(settings).length === 1 ? coin.id : undefined);

  const { user, isStaff } = useAuth();
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
      bare
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
      <style>{DASH_CSS}</style>
      <InAppMessage />

      {!isStaff && businessBlocked(profile) && (
        <Link to="/app/entreprise" className="ac-todo" style={{ marginTop: 0, marginBottom: 24 }}>
          <span className="ac-todo-t flex items-center gap-2">{kybPending && <Clock className="h-4 w-4 text-muted-foreground" />}{kybPending ? t("kyb.stPending") : t("kyb.gateTitle")}</span>
          <span className="ac-todo-s">{kybPending ? t("kyb.gatePending") : t("kyb.gateSub")}</span>
          <span className="ac-todo-c">{kybPending ? t("kyb.gateView") : t("kyb.gateCta")} <ArrowRight className="h-4 w-4" strokeWidth={1.9} /></span>
        </Link>
      )}

      <div className="md:mx-auto md:max-w-[520px]">
        {/* Le taux en très grand, la mascotte qui flotte à côté */}
        <section className="dash-hero" aria-label={t("dash.rate").replace("USDT", coin.symbol)}>
          <span className="dash-pill">{coin.symbol} → CAD <i>$</i></span>
          <div className="dash-rate">{nfRate.format(rate.buy)}</div>
          <p className="dash-cap">{t("dash.rateCaption").replace("{coin}", coin.symbol)}</p>
          <WholeMascot size={100} className="dash-mascot" />
          <Sparkle size={18} className="dash-spark" />
        </section>

        {/* Acheter et vendre : deux grandes tuiles carrées */}
        <div className="dash-tiles">
          <Trade to="/app/acheter" icon={Coins} name={t("dash.buy")} desc={t("dash.buyShort")} bg={PAGE_COLORS.lavender} open={tradingEnabled || isStaff || !!profile?.testAccount} />
          <Trade to="/app/vendre" icon={HandCoins} name={t("dash.sell")} desc={t("dash.sellShort")} bg={PAGE_COLORS.coral} open={tradingEnabled || isStaff || !!profile?.testAccount} />
        </div>
        {!tradingEnabled && !isStaff && !profile?.testAccount && (
          <p className="mt-3 text-[13px] text-[#111]">{t("dash.tradingSuspended")}</p>
        )}

        {/* La dernière opération, dans une carte blanche */}
        <div className="ap-card dash-act">
          <RecentActivity />
        </div>

        {/* Les blockchains ouvertes (Réglages › Réseaux), dessinées au trait noir */}
        {nets.length > 0 && (
          <div className="ap-card dash-nets">
            <p className="ac-k">{nets.length === 1 ? t("dash.networksOne") : t("dash.networks").replace("{n}", String(nets.length))}</p>
            <div className="dash-nets-row" style={{ gridTemplateColumns: `repeat(${Math.min(4, nets.length)}, minmax(0, 1fr))` }}>
              {nets.map((n) => (
                <span key={n.id} className="dash-net"><NetworkGlyph id={n.id} size={50} />{n.name}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
};

export default Dashboard;
