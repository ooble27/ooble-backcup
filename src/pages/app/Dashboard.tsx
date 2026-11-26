import { useEffect, useState } from "react";
import { useAppSettings } from "@/lib/settings";
import { Link, useNavigate } from "react-router-dom";
import { ArrowDown, ArrowRight, ArrowUp, Clock, ChevronRight } from "lucide-react";
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
import { PeekMascot } from "@/components/launch/PlayLogin";

/** Le taux d'achat (cours du marché + marge d'achat), à 4 décimales. */
const nfRate = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 4, minimumFractionDigits: 4 });

const RecentActivity = () => {
  const t = useT();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [orders, setOrders] = useState<OrderRow[] | null>(() => peekMyOrders(user?.id, 4));

  useEffect(() => {
    let active = true;
    listMyOrders(4).then((rows) => {
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
          {/* Téléphone : la dernière opération ; tablette : trois ; ordinateur : quatre. « Voir tout » mène à l'Activité. */}
          {orders.map((o, i) => (
            <div key={o.id} className={i === 0 ? undefined : i < 3 ? "hidden md:block" : "hidden lg:block"}>
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

/** Acheter ou vendre : un bouton rond dans la carte noire (plein ou au trait) ; grisé quand les échanges sont fermés. */
const Trade = ({ to, icon: Icon, name, open, solid }: { to: string; icon: React.ElementType; name: string; open: boolean; solid?: boolean }) => (
  <Link
    to={to}
    className={cn("dash-btn", solid && "solid", !open && "pointer-events-none opacity-40")}
    aria-disabled={!open}
    tabIndex={open ? undefined : -1}
  >
    <Icon className="h-[19px] w-[19px]" strokeWidth={2.4} />{name}
  </Link>
);

const DASH_CSS = `
.dash-card { position: relative; margin-top: 64px; padding: 22px 18px 18px; border-radius: 30px; background: #111; color: #fff; }
.dash-peek { position: absolute; right: 16px; top: -78px; width: 124px; height: 80px; }
.dash-peek .pl-mascot { margin: 0; width: 124px; height: 80px; }
.dash-peek .pl-mascot svg { width: 124px; height: 80px; }
.dash-k { margin: 0; font-size: 11.5px; font-weight: 500; letter-spacing: .14em; text-transform: uppercase; color: #a9a9a5; }
.dash-rate { margin-top: 8px; font-size: clamp(54px, 16vw, 72px); font-weight: 500; letter-spacing: -0.05em; line-height: 1; font-variant-numeric: tabular-nums; }
.dash-rate small { font-size: 20px; letter-spacing: 0; }
.dash-cap { margin: 8px 0 0; font-size: 14px; color: #a9a9a5; font-variant-numeric: tabular-nums; }
.dash-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 20px; }
.dash-btn { display: flex; align-items: center; justify-content: center; gap: 8px; height: 54px; border-radius: 999px; border: 2.5px solid #fff; color: #fff; font-size: 16px; font-weight: 500; text-decoration: none; -webkit-tap-highlight-color: transparent; transition: transform .15s; }
.dash-btn.solid { background: #fff; color: #111; }
.dash-btn:active { transform: scale(.97); }
@media (hover: hover) { .dash-btn:hover { transform: translateY(-1px); } }
.dash-btn:focus-visible { outline: 2.5px solid #fff; outline-offset: 3px; }
.dash-act { margin-top: 12px; padding: 14px 18px 8px; }
@media (min-width: 768px) {
  .dash-card { padding: 28px 26px 24px; border-radius: 34px; }
  .dash-rate { font-size: 96px; }
  .dash-btns { margin-top: 28px; }
  .dash-btn { height: 60px; font-size: 17px; }
  .dash-act, .dash-nets { padding: 18px 22px 12px; }
}
@media (min-width: 1024px) {
  .dash-grid { display: grid; grid-template-columns: minmax(0, 1.12fr) minmax(0, 1fr); gap: 0 40px; align-items: start; }
  .dash-rate { font-size: 104px; }
  .dash-side > .ap-card:first-child { margin-top: 64px; }
}
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
      wider
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

      {/* Ordinateur : deux colonnes (le taux et les tuiles à gauche, les blockchains et l'activité à droite).
          Téléphone et tablette : les blocs se suivent, en pleine largeur. */}
      <div className="dash-grid">
        <div>
        {/* Variante C : le taux dans une grande carte noire, Acheter et Vendre dedans, la mascotte qui dépasse en haut */}
        <section className="dash-card" aria-label={t("dash.rate").replace("USDT", coin.symbol)}>
          <span className="dash-peek"><PeekMascot look={0} typing={false} hide={false} peek={false} /></span>
          <p className="dash-k">{coin.symbol} → CAD</p>
          <div className="dash-rate">{nfRate.format(rate.buy)}<small> $</small></div>
          <p className="dash-cap">{t("dash.sellRate").replace("{r}", nfRate.format(rate.sell))}</p>
          <div className="dash-btns">
            <Trade to="/app/acheter" icon={ArrowDown} name={t("dash.buy")} solid open={tradingEnabled || isStaff || !!profile?.testAccount} />
            <Trade to="/app/vendre" icon={ArrowUp} name={t("dash.sell")} open={tradingEnabled || isStaff || !!profile?.testAccount} />
          </div>
        </section>
        {!tradingEnabled && !isStaff && !profile?.testAccount && (
          <p className="mt-3 text-[13px] text-[#111]">{t("dash.tradingSuspended")}</p>
        )}
        </div>

        <div className="dash-side">
        {/* Les blockchains ouvertes (Réglages › Réseaux), avec leurs vrais logos */}
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

        {/* La dernière opération, dans une carte blanche */}
        <div className="ap-card dash-act">
          <RecentActivity />
        </div>
        </div>
      </div>
    </AppShell>
  );
};

export default Dashboard;
