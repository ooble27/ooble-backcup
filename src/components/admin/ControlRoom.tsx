import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2, Volume2, VolumeX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUsdtRate } from "@/hooks/useUsdtRate";
import { getAppSettingsNow } from "@/lib/settings";
import { nfCad, nfUsdt, type AdminOrder } from "@/lib/adminOrders";
import { NET_LOGO, NET_NAME } from "@/lib/accounting";
import { loadTreasury, peekTreasury, type StockRow } from "@/lib/ledger";
import { firstName, hourLabel, loadActivity, peekTeam, type ActivityItem } from "@/lib/teamSpace";
import { FONT } from "./adminTheme";
import { OliAvatar, TeamAvatar, useMembers, useTeamLive } from "./TeamViews";
import { oliName } from "@/lib/oli";
import { assetSymbol } from "@/lib/assets";
import { onCallNow, useShifts } from "./TeamPlanning";

/**
 * Salle de contrôle : ce qui se passe maintenant, d'un coup d'œil, sans rien toucher.
 * Pensée pour rester ouverte au bureau (grand écran, mode plein écran) : le taux comme sur un terminal
 * de marché, les commandes qui avancent d'étape en étape, le stock par réseau et l'équipe.
 * Aucun nom de client ni adresse à l'écran. Tout est lu : rien n'est modifié.
 */

const TZ = "America/Toronto";
const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });
const hourOf = (d: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(d)) % 24;
const createdAt = (o: AdminOrder, now: number) => now - o.createdMinsAgo * 60_000;
const SIDE: Record<string, string> = { buy: "Achat", sell: "Vente", transfer: "Envoi" };
const nfRate = new Intl.NumberFormat("fr-CA", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const nfInt = new Intl.NumberFormat("fr-CA");
const SOUND_KEY = "ooble.admin.control.sound";
// Les commandes notent le réseau par son logo (trx, matic…) ; la trésorerie par son code (trc20, polygon…).
const NAME_BY_SLUG: Record<string, string> = Object.fromEntries(Object.entries(NET_LOGO).map(([k, slug]) => [slug, NET_NAME[k] ?? k]));
/** Délai visé pour traiter une commande : l'anneau autour du réseau se remplit jusque-là. */
const TARGET_MIN = 30;

const mins = (ms: number) => Math.max(0, Math.round(ms / 60_000));
const dur = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`);
const hm = (iso: string | number) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

const CR_CSS = `
.cr { font-family: ${FONT}; color: var(--a-t1); --cr-buy: var(--a-sage); --cr-sell: var(--a-coral) }
.cr-eyebrow { margin: 0; font-size: 11px; font-weight: 500; letter-spacing: .14em; text-transform: uppercase; color: var(--a-t3) }

/* En-tête : l'heure de Montréal en grand, l'état de la connexion, le son et le plein écran. */
.cr-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; flex-wrap: wrap; margin-bottom: 22px }
.cr-clock { margin: 10px 0 0; font-size: 64px; font-weight: 400; letter-spacing: -0.05em; line-height: .9; font-variant-numeric: tabular-nums }
.cr-clock small { font-size: 26px; color: var(--a-t3); letter-spacing: -0.02em; margin-left: 6px }
.cr-date { margin: 10px 0 0; font-size: 14px; color: var(--a-t2) }
.cr-acts { display: flex; align-items: center; gap: 24px; flex-wrap: wrap }
.cr-state { display: inline-flex; align-items: center; gap: 9px; font-size: 13.5px; color: var(--a-t2) }
.cr-dot { position: relative; width: 8px; height: 8px; border-radius: 99px; background: var(--a-sage) }
.cr-dot::after { content: ""; position: absolute; inset: -5px; border-radius: 99px; border: 1.5px solid var(--a-sage); animation: cr-ping 2.2s cubic-bezier(0,0,.2,1) infinite }
.cr-dot[data-off="true"] { background: var(--a-t3) } .cr-dot[data-off="true"]::after { display: none }
@keyframes cr-ping { 0% { transform: scale(.4); opacity: .9 } 80%, 100% { transform: scale(1.6); opacity: 0 } }
.cr-link { border: none; background: none; padding: 0; cursor: pointer; font: inherit; font-size: 14px; color: var(--a-t2); display: inline-flex; align-items: center; gap: 7px }
.cr-link:hover { color: var(--a-t1) }
.cr-go { border: none; background: none; padding: 0; cursor: pointer; font: inherit; font-size: 14.5px; font-weight: 600; color: var(--a-t1); display: inline-flex; align-items: center; gap: 7px; text-decoration: underline; text-underline-offset: 5px; text-decoration-thickness: 1.5px }
.cr-link:focus-visible, .cr-go:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 4px; border-radius: 4px }

/* Grille de panneaux. */
/* Pas de cadres : des sections ouvertes, séparées par un trait fin et de l'espace. */
.cr-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); column-gap: 0; row-gap: 44px }
.cr-p { position: relative; padding: 24px 0 0; border-top: 1px solid var(--a-bd); min-width: 0;
  animation: cr-rise .7s cubic-bezier(.22,1,.36,1) both }
.cr-p.s8, .cr-p.s7 { padding-right: 44px }
.cr-p.s4, .cr-p.s5 { padding-left: 44px }
.cr-p.s4::before, .cr-p.s5::before { content: ""; position: absolute; left: 0; top: 24px; bottom: 0; width: 1px; background: var(--a-bds) }
.cr-p:nth-child(2) { animation-delay: 60ms } .cr-p:nth-child(3) { animation-delay: 120ms } .cr-p:nth-child(4) { animation-delay: 170ms } .cr-p:nth-child(5) { animation-delay: 220ms }
@keyframes cr-rise { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
.cr-p-h { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 14px }
.cr-p-h span { font-size: 12.5px; color: var(--a-t3); font-variant-numeric: tabular-nums; text-align: right }
.s8 { grid-column: span 8 } .s4 { grid-column: span 4 } .s12 { grid-column: span 12 } .s7 { grid-column: span 7 } .s5 { grid-column: span 5 }

/* Chiffres qui défilent comme un compteur mécanique. */
.rl { display: inline-flex; line-height: 1; height: 1em; overflow: hidden; font-variant-numeric: tabular-nums; vertical-align: bottom }
.rl-d { display: inline-block; height: 1em; overflow: hidden }
.rl-c { display: flex; flex-direction: column; transition: transform 1.1s cubic-bezier(.22,1,.36,1) }
.rl-c > span, .rl-s { display: block; height: 1em; line-height: 1 }

/* Taux. */
.cr-rates { display: flex; gap: 44px; flex-wrap: wrap; align-items: flex-end }
.cr-rate p { margin: 0 }
.cr-rate .k { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--a-t2) }
.cr-rate .k i { width: 10px; height: 2px; border-radius: 2px; display: inline-block }
.cr-rate .v { margin-top: 10px; font-size: 54px; font-weight: 400; letter-spacing: -0.045em; display: flex; align-items: baseline }
.cr-rate .v small { font-size: 20px; color: var(--a-t3); margin-left: 6px; letter-spacing: -0.01em }
.cr-rate .d { margin-top: 8px; font-size: 12.5px; color: var(--a-t3); font-variant-numeric: tabular-nums }
.cr-chart { margin-top: 18px; position: relative }
.cr-chart svg { display: block; overflow: visible }
.cr-tip { position: absolute; top: -6px; transform: translateX(-50%); pointer-events: none; background: var(--a-l3); border: 1px solid var(--a-bd); border-radius: 12px; padding: 7px 11px; font-size: 12px; white-space: nowrap; font-variant-numeric: tabular-nums; box-shadow: var(--a-shadow) }
.cr-tip b { font-weight: 500 }
.cr-end { animation: cr-glow 2.4s ease-in-out infinite; transform-box: fill-box; transform-origin: center }
@keyframes cr-glow { 0%, 100% { opacity: .35; transform: scale(1) } 50% { opacity: 0; transform: scale(2.4) } }

/* Aujourd'hui. */
.cr-big { margin: 6px 0 0; font-size: 58px; font-weight: 400; letter-spacing: -0.05em; display: flex; align-items: baseline }
.cr-big small { font-size: 22px; color: var(--a-t3); margin-left: 6px; letter-spacing: -0.01em }
.cr-hours { margin-top: 18px }
.cr-now { animation: cr-breathe 2.4s ease-in-out infinite }
@keyframes cr-breathe { 0%, 100% { opacity: 1 } 50% { opacity: .45 } }
.cr-trio { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 18px; border-top: 1px solid var(--a-bds) }
.cr-trio > div { padding: 16px 0 0; min-width: 0 } .cr-trio > div + div { padding-left: 16px; border-left: 1px solid var(--a-bds) }
.cr-trio p { margin: 0 }
.cr-trio .v { margin-top: 8px; font-size: 30px; letter-spacing: -0.04em; white-space: nowrap }
.cr-trio .h { margin-top: 6px; font-size: 12px; color: var(--a-t3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis }

/* Pipeline : chaque commande avance de colonne en colonne. */
.cr-pipe { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 32px }
.cr-col { min-width: 0 }
.cr-col-h { display: flex; align-items: center; gap: 10px; padding: 0 0 6px; font-size: 13.5px; color: var(--a-t2); white-space: nowrap }
.cr-col-h b { font-weight: 500; color: var(--a-t1); font-size: 13px; min-width: 26px; height: 24px; padding: 0 8px; border-radius: 99px; background: var(--a-l3); display: inline-flex; align-items: center; justify-content: center; font-variant-numeric: tabular-nums }
.cr-col-h .bar { flex: 1; height: 1px; background: var(--a-bds) }
.cr-stack { display: flex; flex-direction: column }
.cr-card { padding: 16px 0 15px; border-bottom: 1px solid var(--a-bds); display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 8px 14px; align-items: center }
.cr-card[data-done="true"] { opacity: .72 }
.cr-card p { margin: 0 }
.cr-card .amt { font-size: 17px; font-weight: 500; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.cr-card .side { font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--a-t3) }
.cr-card .t { font-size: 12.5px; color: var(--a-t2); font-variant-numeric: tabular-nums; white-space: nowrap; align-self: start }
.cr-card .sub { grid-column: 2 / 4; display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--a-t3); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden }
.cr-ghost { padding: 18px 0; border-bottom: 1px solid var(--a-bds); font-size: 13px; color: var(--a-t3) }
.cr-more { margin: 0; font-size: 12.5px; color: var(--a-t3); padding: 12px 0 0 }
.cr-new { animation: cr-in 1s cubic-bezier(.22,1,.36,1) both }
@keyframes cr-in { 0% { opacity: 0; transform: translateY(-12px); background: var(--a-hover4) } 55% { opacity: 1; transform: none; background: var(--a-hover4) } 100% { background: transparent } }

/* Stock : un anneau par réseau. */
.cr-rings { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 20px 12px }
.cr-ring { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 12px; min-width: 0 }
.cr-ring p { margin: 0 }
.cr-ring .v { font-size: 19px; font-weight: 500; letter-spacing: -0.02em; display: flex; justify-content: center }
.cr-ring .n { margin-top: 4px; font-size: 12px; color: var(--a-t3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100% }

/* Équipe. */
.cr-team { display: grid; grid-template-columns: repeat(auto-fill, minmax(128px, 1fr)); gap: 20px 12px }
.cr-mem { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 12px; min-width: 0 }
.cr-mem p { margin: 0 }
.cr-mem .n { font-size: 15px }
.cr-mem .s { margin-top: 4px; font-size: 12px; line-height: 1.4; color: var(--a-t3); text-wrap: balance }
.cr-face { position: relative; display: inline-flex }
.cr-count { position: absolute; right: -4px; bottom: 0; min-width: 26px; height: 26px; padding: 0 7px; border-radius: 99px; background: var(--a-t1); color: var(--a-bg); font-size: 12.5px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; font-variant-numeric: tabular-nums; box-shadow: 0 0 0 3px var(--a-bg) }

/* Fil d'activité. */
.cr-ticker { margin-top: 16px; overflow: hidden; padding: 14px 0; -webkit-mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent); mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent) }
.cr-track { display: flex; gap: 52px; width: max-content; animation: cr-run var(--cr-speed, 80s) linear infinite }
.cr-ticker:hover .cr-track { animation-play-state: paused }
@keyframes cr-run { from { transform: translateX(0) } to { transform: translateX(-50%) } }
.cr-item { display: inline-flex; align-items: center; gap: 9px; font-size: 13.5px; color: var(--a-t2); white-space: nowrap }
.cr-item em { font-style: normal; color: var(--a-t3); font-size: 12.5px; font-variant-numeric: tabular-nums }

/* Plein écran : l'écran du bureau, sans barre latérale ni en-tête. */
.cr-tv { position: fixed; inset: 0; z-index: 80; background: var(--a-bg); overflow: auto; padding: calc(30px + env(safe-area-inset-top, 0px)) 40px 24px }
.cr-tv .cr-clock { font-size: 76px }

@media (max-width: 1280px) {
  .s8, .s4, .s7, .s5 { grid-column: span 12 }
  .cr-p.s8, .cr-p.s7 { padding-right: 0 } .cr-p.s4, .cr-p.s5 { padding-left: 0 }
  .cr-p.s4::before, .cr-p.s5::before { display: none }
  .cr-pipe { grid-template-columns: repeat(2, minmax(0, 1fr)) }
}
@media (max-width: 640px) {
  .cr-clock { font-size: 48px } .cr-clock small { font-size: 20px }
  .cr-p { padding-top: 20px }
  .cr-grid { row-gap: 36px }
  .cr-rates { gap: 24px }
  .cr-rate .v { font-size: 36px }
  .cr-big { font-size: 44px }
  .cr-trio .v { font-size: 22px }
  .cr-pipe { grid-template-columns: minmax(0, 1fr) }
  .cr-tv { padding: calc(18px + env(safe-area-inset-top, 0px)) 14px 18px }
}
@media (prefers-reduced-motion: reduce) {
  .cr-p, .cr-new, .cr-end, .cr-now, .cr-dot::after { animation: none }
  .rl-c { transition: none }
  .cr-track { animation: none; flex-wrap: wrap; width: auto }
}
`;

/** Un nombre dont chaque chiffre défile jusqu'à sa place (à l'arrivée sur la page, puis à chaque changement). */
function Roll({ text }: { text: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { const r = requestAnimationFrame(() => requestAnimationFrame(() => setReady(true))); return () => cancelAnimationFrame(r); }, []);
  const chars = [...text];
  return (
    <span className="rl" aria-label={text} role="img">
      {chars.map((ch, i) => {
        const key = chars.length - i; // depuis la droite : les unités gardent leur colonne quand le nombre grandit
        if (!/\d/.test(ch)) return <span key={`s${key}`} className="rl-s" aria-hidden>{/\s/.test(ch) ? " " : ch}</span>;
        return (
          <span key={`d${key}`} className="rl-d" aria-hidden>
            <span className="rl-c" style={{ transform: `translateY(${-(ready ? Number(ch) : 0)}em)` }}>
              {"0123456789".split("").map((d) => <span key={d}>{d}</span>)}
            </span>
          </span>
        );
      })}
    </span>
  );
}

type RatePt = { at: number; buy: number; sell: number; m: number };

/** Taux de la dernière heure (le serveur en relève un toutes les 10 secondes), complété en direct. */
function useRateHistory(rate: { buy: number; sell: number; base: number; live: boolean }) {
  const [pts, setPts] = useState<RatePt[]>([]);
  useEffect(() => {
    let on = true;
    const since = new Date(Date.now() - 60 * 60_000).toISOString();
    void supabase.from("exchange_rates").select("market_rate, buy_rate, sell_rate, fetched_at").eq("asset", "usdt").gte("fetched_at", since)
      .order("fetched_at", { ascending: false }).limit(400)
      .then(({ data }) => {
        if (!on || !data) return;
        setPts((data as { market_rate: number | null; buy_rate: number; sell_rate: number; fetched_at: string }[]).map((r) => {
          const buy = Number(r.buy_rate), sell = Number(r.sell_rate);
          return { at: new Date(r.fetched_at).getTime(), buy, sell, m: r.market_rate ? Number(r.market_rate) : (buy + sell) / 2 };
        }).reverse());
      });
    return () => { on = false; };
  }, []);
  useEffect(() => {
    if (!rate.live) return;
    setPts((p) => {
      const last = p[p.length - 1];
      if (last && last.buy === rate.buy && last.sell === rate.sell) return p;
      return [...p.filter((x) => x.at > Date.now() - 60 * 60_000), { at: Date.now(), buy: rate.buy, sell: rate.sell, m: rate.base }];
    });
  }, [rate.live, rate.buy, rate.sell, rate.base]);
  return pts;
}

/** Largeur réelle d'un bloc (le graphique se dessine à la bonne taille, sans déformation). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Terminal de taux : achat et vente sur la dernière heure, la marge entre les deux, le marché en pointillé. */
function RateChart({ pts }: { pts: RatePt[] }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const h = 190, padR = 62, padB = 22;
  const iw = Math.max(10, w - padR);
  const g = (() => {
    if (pts.length < 2 || !w) return null;
    const lo = Math.min(...pts.map((p) => p.sell)), hi = Math.max(...pts.map((p) => p.buy));
    const span = Math.max(1e-4, hi - lo), min = lo - span * 0.12, max = hi + span * 0.12;
    const t0 = pts[0].at, t1 = pts[pts.length - 1].at;
    const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * iw;
    const y = (v: number) => (h - padB) - ((v - min) / (max - min)) * (h - padB - 8);
    const line = (k: "buy" | "sell" | "m") => pts.map((p, i) => `${i ? "L" : "M"}${x(p.at).toFixed(1)} ${y(p[k]).toFixed(1)}`).join(" ");
    const band = `${line("buy")} ${pts.slice().reverse().map((p) => `L${x(p.at).toFixed(1)} ${y(p.sell).toFixed(1)}`).join(" ")} Z`;
    const ticks = [min + (max - min) * 0.12, (min + max) / 2, max - (max - min) * 0.12];
    return { x, y, line, band, ticks, last: pts[pts.length - 1], t0, t1 };
  })();
  const hp = g && hover != null ? pts[hover] : null;
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!g) return;
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
    let best = 0, bd = Infinity;
    pts.forEach((p, i) => { const d = Math.abs(g.x(p.at) - px); if (d < bd) { bd = d; best = i; } });
    setHover(best);
  };
  return (
    <div ref={ref} className="cr-chart" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
      {g ? (
        <>
          <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Taux d'achat et de vente sur la dernière heure">
            <defs>
              <linearGradient id="cr-band" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="var(--a-sage)" stopOpacity="0.09" />
                <stop offset="1" stopColor="var(--a-coral)" stopOpacity="0.05" />
              </linearGradient>
            </defs>
            {g.ticks.map((t) => (
              <g key={t}>
                <line x1={0} x2={iw} y1={g.y(t)} y2={g.y(t)} stroke="var(--a-bd)" strokeDasharray="2 5" />
                <text x={iw + 12} y={g.y(t) + 4} fontSize={11} fill="var(--a-t3)" style={{ fontVariantNumeric: "tabular-nums" }}>{nfRate.format(t)}</text>
              </g>
            ))}
            <path d={g.band} fill="url(#cr-band)" />
            <path d={g.line("m")} fill="none" stroke="var(--a-t3)" strokeWidth={1} strokeDasharray="3 4" />
            <path d={g.line("buy")} fill="none" stroke="var(--cr-buy)" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
            <path d={g.line("sell")} fill="none" stroke="var(--cr-sell)" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
            {(["buy", "sell"] as const).map((k) => (
              <g key={k}>
                <circle className="cr-end" cx={g.x(g.last.at)} cy={g.y(g.last[k])} r={4} fill={`var(--cr-${k})`} />
                <circle cx={g.x(g.last.at)} cy={g.y(g.last[k])} r={4} fill={`var(--cr-${k})`} stroke="var(--a-bg)" strokeWidth={2} />
              </g>
            ))}
            {[0, 0.5, 1].map((f) => (
              <text key={f} x={f * iw} y={h - 4} fontSize={11} fill="var(--a-t3)" textAnchor={f === 0 ? "start" : f === 1 ? "end" : "middle"}>
                {f === 1 ? "maintenant" : hm(g.t0 + (g.t1 - g.t0) * f)}
              </text>
            ))}
            {hp && (
              <g>
                <line x1={g.x(hp.at)} x2={g.x(hp.at)} y1={0} y2={h - padB} stroke="var(--a-t3)" strokeWidth={1} />
                <circle cx={g.x(hp.at)} cy={g.y(hp.buy)} r={3.5} fill="var(--cr-buy)" />
                <circle cx={g.x(hp.at)} cy={g.y(hp.sell)} r={3.5} fill="var(--cr-sell)" />
              </g>
            )}
          </svg>
          {hp && (
            <div className="cr-tip" style={{ left: Math.min(Math.max(g.x(hp.at), 80), iw - 70) }}>
              <span style={{ color: "var(--a-t3)" }}>{hm(hp.at)}</span>&nbsp;&nbsp;
              <b style={{ color: "var(--cr-buy)" }}>{nfRate.format(hp.buy)}</b>&nbsp;·&nbsp;<b style={{ color: "var(--cr-sell)" }}>{nfRate.format(hp.sell)}</b>
            </div>
          )}
        </>
      ) : <div style={{ height: h }} />}
    </div>
  );
}

/** Le rythme de la journée : le volume heure par heure, l'heure en cours qui respire. */
function Hours({ byHour, current }: { byHour: number[]; current: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [grown, setGrown] = useState(false);
  useEffect(() => { const t = window.setTimeout(() => setGrown(true), 250); return () => window.clearTimeout(t); }, []);
  const h = 84, gap = 3, bw = w ? (w - gap * 23) / 24 : 0, max = Math.max(1, ...byHour);
  return (
    <div ref={ref} className="cr-hours">
      {w > 0 && (
        <svg width={w} height={h + 18} viewBox={`0 0 ${w} ${h + 18}`} aria-hidden>
          {byHour.map((v, i) => {
            const past = i <= current;
            const bh = grown && past ? Math.max(3, (v / max) * h) : 3;
            return <rect key={i} className={i === current ? "cr-now" : undefined} x={i * (bw + gap)} y={h - bh} width={bw} height={bh} rx={Math.min(3, bw / 2)}
              fill={i === current ? "var(--a-t1)" : past && v ? "var(--a-t2)" : "var(--a-l4)"}
              style={{ transition: `height .9s cubic-bezier(.22,1,.36,1) ${i * 18}ms, y .9s cubic-bezier(.22,1,.36,1) ${i * 18}ms` }} />;
          })}
          {[0, 6, 12, 18].map((i) => <text key={i} x={i * (bw + gap)} y={h + 15} fontSize={10.5} fill="var(--a-t3)">{i} h</text>)}
        </svg>
      )}
    </div>
  );
}

/** Anneau de progression (attente d'une commande, stock d'un réseau, part des commandes d'un membre). */
function Ring({ size, ratio, stroke = 4, dim, children }: { size: number; ratio: number; stroke?: number; dim?: boolean; children?: React.ReactNode }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const [shown, setShown] = useState(0);
  useEffect(() => { const t = requestAnimationFrame(() => requestAnimationFrame(() => setShown(Math.max(0, Math.min(1, ratio))))); return () => cancelAnimationFrame(t); }, [ratio]);
  return (
    <span style={{ position: "relative", width: size, height: size, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--a-l3)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={dim ? "var(--a-t3)" : "var(--a-t1)"} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - shown)} style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(.22,1,.36,1)" }} />
      </svg>
      {children}
    </span>
  );
}

/** Petit carillon (deux notes douces), seulement si le son est activé. */
function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [[880, 0], [1320, 0.12]].forEach(([f, t]) => {
      const o = ctx.createOscillator(), gn = ctx.createGain();
      o.type = "sine"; o.frequency.value = f;
      gn.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      gn.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + t + 0.02);
      gn.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.5);
      o.connect(gn).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.55);
    });
    window.setTimeout(() => void ctx.close(), 1200);
  } catch { /* son indisponible */ }
}

type Stage = "wait" | "take" | "work" | "done";
const STAGES: { id: Stage; label: string; empty: string }[] = [
  { id: "wait", label: "Paiement attendu", empty: "Aucun paiement attendu" },
  { id: "take", label: "Payées, à prendre", empty: "Rien à prendre" },
  { id: "work", label: "En traitement", empty: "Personne en traitement" },
  { id: "done", label: "Terminées aujourd'hui", empty: "Pas encore de commande terminée" },
];
const stageOf = (o: AdminOrder): Stage | null =>
  o.status === "attente" ? "wait" : o.status === "recu" ? (o.assignedId || o.autoSending ? "work" : "take") : o.status === "cours" ? "work" : o.status === "termine" ? "done" : null;

export default function ControlRoom({ orders, canStock }: { orders: AdminOrder[]; canStock: boolean }) {
  const rate = useUsdtRate({ live: true });
  const hist = useRateHistory(rate);
  const members = useMembers();
  const { shifts } = useShifts();

  // L'heure avance chaque seconde (horloge) ; les délais se recalculent avec elle.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, []);

  // Connexion : un mot discret si elle tombe, puis « reconnecté ».
  const [online, setOnline] = useState(() => navigator.onLine);
  const [back, setBack] = useState(false);
  useEffect(() => {
    const up = () => { setOnline(true); setBack(true); window.setTimeout(() => setBack(false), 4000); };
    const down = () => setOnline(false);
    window.addEventListener("online", up); window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);

  // Stock par réseau, relu chaque minute.
  const [stock, setStock] = useState<StockRow[] | null>(() => (canStock ? peekTreasury()?.filter((x) => x.asset === (getAppSettingsNow().assets.usdc ? "usdc" : "usdt")) ?? null : null));
  useEffect(() => {
    if (!canStock) return;
    // Le stock de l'actif principal (USDC s'il est ouvert, sinon USDT).
    const load = () => { loadTreasury().then((r) => setStock(r.filter((x) => x.asset === (getAppSettingsNow().assets.usdc ? "usdc" : "usdt")))).catch(() => undefined); };
    load();
    const t = window.setInterval(load, 60_000);
    return () => window.clearInterval(t);
  }, [canStock]);

  // Fil d'activité de l'équipe, en bas de l'écran.
  const [feed, setFeed] = useState<ActivityItem[]>(() => peekTeam<ActivityItem[]>("activity") ?? []);
  const loadFeed = useCallback(() => { loadActivity().then(setFeed).catch(() => undefined); }, []);
  useTeamLive(loadFeed, ["team_tasks", "team_handoffs", "team_approvals"]);
  useEffect(() => { loadFeed(); }, [orders, loadFeed]);

  // Son et plein écran.
  const [sound, setSound] = useState(() => { try { return localStorage.getItem(SOUND_KEY) === "on"; } catch { return false; } });
  const toggleSound = () => setSound((v) => { try { localStorage.setItem(SOUND_KEY, v ? "off" : "on"); } catch { /* stockage indisponible */ } if (!v) chime(); return !v; });
  const [tv, setTv] = useState(() => new URLSearchParams(window.location.search).get("tv") === "1");
  const enterTv = () => {
    setTv(true);
    const url = new URL(window.location.href); url.searchParams.set("tv", "1"); window.history.replaceState(null, "", url);
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };
  const exitTv = useCallback(() => {
    setTv(false);
    const url = new URL(window.location.href); url.searchParams.delete("tv"); window.history.replaceState(null, "", url);
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!tv) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") exitTv(); };
    // Sortie du plein écran du navigateur (Échap, geste) : on quitte aussi la vue bureau.
    let wasFs = !!document.fullscreenElement;
    const fs = () => { if (document.fullscreenElement) wasFs = true; else if (wasFs) exitTv(); };
    window.addEventListener("keydown", key);
    document.addEventListener("fullscreenchange", fs);
    // L'écran du bureau ne s'endort pas tant que la salle de contrôle est en plein écran.
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    const grab = () => { if (document.visibilityState === "visible") void nav.wakeLock?.request("screen").then((l) => { lock = l; }).catch(() => undefined); };
    grab();
    document.addEventListener("visibilitychange", grab);
    return () => {
      window.removeEventListener("keydown", key);
      document.removeEventListener("fullscreenchange", fs);
      document.removeEventListener("visibilitychange", grab);
      void lock?.release().catch(() => undefined);
    };
  }, [tv, exitTv]);

  // Chiffres du jour (heure de Montréal).
  const today = dayKey(new Date(now));
  const yesterday = dayKey(new Date(now - 86_400_000));
  const stats = useMemo(() => {
    const t = Date.now();
    const of = (k: string) => orders.filter((o) => dayKey(new Date(createdAt(o, t))) === k && o.status !== "annule");
    const todays = of(today);
    const done = (list: AdminOrder[]) => list.filter((o) => o.status === "termine" && o.updatedAt).map((o) => mins(new Date(o.updatedAt!).getTime() - createdAt(o, t)));
    const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
    const byHour = Array.from({ length: 24 }, () => 0);
    todays.forEach((o) => { byHour[hourOf(new Date(createdAt(o, t)))] += o.cad; });
    return {
      volume: todays.reduce((a, o) => a + o.cad, 0), volY: of(yesterday).reduce((a, o) => a + o.cad, 0),
      count: todays.length, buys: todays.filter((o) => o.type === "buy").length, avg: avg(done(todays)), avgY: avg(done(of(yesterday))), byHour,
    };
  }, [orders, today, yesterday]);

  // Pipeline : chaque commande dans son étape (la plus ancienne en haut : c'est elle qui attend le plus).
  const columns = useMemo(() => {
    const m: Record<Stage, AdminOrder[]> = { wait: [], take: [], work: [], done: [] };
    for (const o of orders) {
      const s = stageOf(o);
      if (!s) continue;
      if (s === "done" && !(o.updatedAt && dayKey(new Date(o.updatedAt)) === today)) continue;
      m[s].push(o);
    }
    (["wait", "take", "work"] as Stage[]).forEach((s) => m[s].sort((a, b) => b.createdMinsAgo - a.createdMinsAgo));
    m.done.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    return m;
  }, [orders, today]);
  const inProgress = columns.wait.length + columns.take.length + columns.work.length;

  // Nouvelles commandes : une entrée remarquée (et le carillon si activé).
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!seen.current) { seen.current = new Set(orders.map((o) => o.id)); return; }
    const added = orders.filter((o) => !seen.current!.has(o.id)).map((o) => o.id);
    added.forEach((id) => seen.current!.add(id));
    if (added.length) { setFresh((s) => new Set([...s, ...added])); if (sound) chime(); }
  }, [orders, sound]);

  // Une commande qui change d'étape glisse jusqu'à sa nouvelle place (positions relatives au pipeline).
  const pipeRef = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, HTMLElement>());
  const rects = useRef(new Map<string, { x: number; y: number }>());
  useLayoutEffect(() => {
    const box = pipeRef.current?.getBoundingClientRect();
    if (!box) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    nodes.current.forEach((el, id) => {
      const r = el.getBoundingClientRect();
      const pos = { x: r.left - box.left, y: r.top - box.top };
      const prev = rects.current.get(id);
      if (prev && !reduce && (Math.abs(prev.x - pos.x) > 2 || Math.abs(prev.y - pos.y) > 2)) {
        el.animate([{ transform: `translate(${prev.x - pos.x}px, ${prev.y - pos.y}px)` }, { transform: "none" }], { duration: 750, easing: "cubic-bezier(.22,1,.36,1)" });
      }
      rects.current.set(id, pos);
    });
  });

  // Équipe : qui est là, qui est de garde, combien de commandes chacun a terminées aujourd'hui.
  const minute = Math.floor(now / 60_000);
  const onCall = useMemo(() => new Map(onCallNow(shifts ?? [], members).map(({ m, s }) => [m.userId, s])), [shifts, members, minute]); // eslint-disable-line react-hooks/exhaustive-deps
  const doneBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of columns.done) if (o.assignedId) m.set(o.assignedId, (m.get(o.assignedId) ?? 0) + 1);
    return m;
  }, [columns.done]);
  const doneTotal = Math.max(1, columns.done.length);
  const team = useMemo(() => members.slice().sort((a, b) => {
    const rank = (x: typeof a) => (onCall.has(x.userId) ? 0 : x.status === "away" ? 2 : 1);
    return rank(a) - rank(b) || (doneBy.get(b.userId) ?? 0) - (doneBy.get(a.userId) ?? 0);
  }), [members, onCall, doneBy]);

  const [hh, mm, ss] = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(now)).split(":");
  const dl = new Date(now).toLocaleDateString("fr-CA", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const dateLabel = dl.charAt(0).toUpperCase() + dl.slice(1);
  const maxStock = Math.max(1, ...(stock ?? []).map((s) => Math.max(s.available ?? s.usdt ?? 0, s.threshold * 2)));
  const curHour = hourOf(new Date(now));
  const spread = rate.base ? ((rate.buy - rate.sell) / rate.base) * 100 : 0;
  const first = hist[0];
  const delta = (k: "buy" | "sell") => (first ? rate[k] - first[k] : 0);
  const moved = (n: number) => (Math.abs(n) < 0.00005 ? "Stable sur l'heure" : `${n > 0 ? "+" : "−"}${nfRate.format(Math.abs(n))} sur l'heure`);

  const card = (o: AdminOrder, stage: Stage) => {
    const done = stage === "done";
    const age = mins(now - createdAt(o, now));
    const took = o.updatedAt ? mins(new Date(o.updatedAt).getTime() - createdAt(o, now)) : null;
    const m = o.assignedId ? members.find((x) => x.userId === o.assignedId) : undefined;
    const name = m?.name ?? o.assignedTo ?? "";
    return (
      <div key={o.id} ref={(el) => { if (el) nodes.current.set(o.id, el); else nodes.current.delete(o.id); }}
        className={`cr-card${fresh.has(o.id) ? " cr-new" : ""}`} data-done={done}>
        <Ring size={40} ratio={done ? 1 : age / TARGET_MIN} stroke={2.5} dim={done}>
          {o.network ? <img src={`/coins/${o.network}.svg`} alt={NAME_BY_SLUG[o.network] ?? o.network} width={24} height={24} style={{ borderRadius: 99 }} /> : null}
        </Ring>
        <div style={{ minWidth: 0 }}>
          <p className="side">{SIDE[o.type] ?? o.type}{o.network ? ` · ${NAME_BY_SLUG[o.network] ?? o.network}` : ""}{o.isTest ? " · essai" : ""}</p>
          <p className="amt" style={{ marginTop: 3 }}>{nfCad.format(o.cad)} $</p>
        </div>
        <span className="t">{done ? (took != null ? `en ${dur(took)}` : "") : dur(age)}</span>
        <div className="sub">
          <span>{o.ref}</span><span aria-hidden>·</span><span>{nfUsdt.format(o.usdt)} {assetSymbol(o.asset)}</span>
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, color: "var(--a-t2)" }}>
            {o.assignedId ? <><TeamAvatar id={o.assignedId} name={name} size={18} />{firstName(name)}</> : o.autoSending || done ? <><OliAvatar size={18} />{oliName()}</> : "À prendre"}
          </span>
        </div>
      </div>
    );
  };

  const ticker = feed.slice(0, 14);
  const body = (
    <div className="cr">
      <style>{CR_CSS}</style>

      <header className="cr-head">
        <div>
          <p className="cr-eyebrow">Salle de contrôle</p>
          <p className="cr-clock">{hh}:{mm}<small>{ss}</small></p>
          <p className="cr-date">{dateLabel} · heure de Montréal</p>
        </div>
        <div className="cr-acts">
          <span className="cr-state"><span className="cr-dot" data-off={!online} aria-hidden />{online ? (back ? "Reconnecté" : "En direct") : "Connexion perdue, nouvelle tentative…"}</span>
          <button type="button" className="cr-link" onClick={toggleSound} aria-pressed={sound}>
            {sound ? <Volume2 style={{ width: 16, height: 16 }} /> : <VolumeX style={{ width: 16, height: 16 }} />}{sound ? "Son activé" : "Son coupé"}
          </button>
          {tv
            ? <button type="button" className="cr-go" onClick={exitTv}>Quitter le plein écran <Minimize2 style={{ width: 15, height: 15 }} /></button>
            : <button type="button" className="cr-go" onClick={enterTv}>Plein écran <Maximize2 style={{ width: 15, height: 15 }} /></button>}
        </div>
      </header>

      <div className="cr-grid">
        <section className="cr-p s8" aria-label="Taux en direct">
          <div className="cr-p-h"><p className="cr-eyebrow">Taux USDT · CAD</p><span>Écart {spread.toFixed(2).replace(".", ",")} % · marché {nfRate.format(rate.base)} $</span></div>
          <div className="cr-rates">
            <div className="cr-rate">
              <p className="k"><i style={{ background: "var(--cr-buy)" }} />Le client achète à</p>
              <p className="v"><Roll text={nfRate.format(rate.buy)} /><small>$</small></p>
              <p className="d">{moved(delta("buy"))}</p>
            </div>
            <div className="cr-rate">
              <p className="k"><i style={{ background: "var(--cr-sell)" }} />Le client vend à</p>
              <p className="v"><Roll text={nfRate.format(rate.sell)} /><small>$</small></p>
              <p className="d">{moved(delta("sell"))}</p>
            </div>
          </div>
          <RateChart pts={hist} />
        </section>

        <section className="cr-p s4" aria-label="Aujourd'hui">
          <div className="cr-p-h"><p className="cr-eyebrow">Volume du jour</p><span>{stats.volY ? `hier ${nfInt.format(Math.round(stats.volY))} $` : ""}</span></div>
          <p className="cr-big"><Roll text={nfInt.format(Math.round(stats.volume))} /><small>$</small></p>
          <Hours byHour={stats.byHour} current={curHour} />
          <div className="cr-trio">
            <div><p className="cr-eyebrow">Commandes</p><p className="v"><Roll text={String(stats.count)} /></p><p className="h">{stats.buys} achats · {stats.count - stats.buys} ventes</p></div>
            <div><p className="cr-eyebrow">Délai moyen</p><p className="v">{stats.avg != null ? dur(stats.avg) : "–"}</p><p className="h">{stats.avgY != null ? `hier ${dur(stats.avgY)}` : "jusqu'à l'envoi"}</p></div>
            <div><p className="cr-eyebrow">En cours</p><p className="v"><Roll text={String(inProgress)} /></p><p className="h">{columns.take.length ? `${columns.take.length} à prendre` : "toutes prises"}</p></div>
          </div>
        </section>

        <section className="cr-p s12" aria-label="Commandes en direct">
          <div className="cr-p-h"><p className="cr-eyebrow">Commandes en direct</p><span>L'anneau se remplit jusqu'à {TARGET_MIN} min d'attente</span></div>
          <div ref={pipeRef} className="cr-pipe">
            {STAGES.map((st) => {
              const list = columns[st.id];
              const shown = list.slice(0, 4);
              return (
                <div key={st.id} className="cr-col">
                  <div className="cr-col-h">{st.label}<span className="bar" /><b>{list.length}</b></div>
                  <div className="cr-stack">
                    {shown.length ? shown.map((o) => card(o, st.id)) : <div className="cr-ghost">{st.empty}</div>}
                    {list.length > shown.length && <p className="cr-more">et {list.length - shown.length} de plus</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {canStock && (
          <section className="cr-p s7" aria-label="Stock par réseau">
            <div className="cr-p-h"><p className="cr-eyebrow">Stock disponible · USDT</p><span>{stock?.[0]?.takenAt ? `relevé à ${hm(stock[0].takenAt)}` : "lecture…"}</span></div>
            <div className="cr-rings">
              {(stock ?? []).map((s) => {
                const v = s.available ?? s.usdt ?? 0;
                const low = s.threshold > 0 && v < s.threshold;
                return (
                  <div key={s.network} className="cr-ring">
                    <Ring size={92} ratio={v / maxStock} stroke={5} dim={low}>
                      {NET_LOGO[s.network] && <img src={`/coins/${NET_LOGO[s.network]}.svg`} alt="" width={36} height={36} style={{ borderRadius: 99 }} />}
                    </Ring>
                    <div style={{ minWidth: 0, maxWidth: "100%" }}>
                      <p className="v"><Roll text={nfInt.format(Math.round(v))} /></p>
                      <p className="n">{NET_NAME[s.network] ?? s.network}{low ? " · bas" : s.reserved > 0 ? ` · ${nfInt.format(Math.round(s.reserved))} réservés` : ""}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className={`cr-p ${canStock ? "s5" : "s12"}`} aria-label="L'équipe">
          <div className="cr-p-h"><p className="cr-eyebrow">L'équipe</p><span>{members.filter((m) => m.status !== "away").length} en ligne · {columns.done.length} terminées</span></div>
          <div className="cr-team">
            {team.map((m) => {
              const s = onCall.get(m.userId);
              const n = doneBy.get(m.userId) ?? 0;
              return (
                <div key={m.userId} className="cr-mem" style={{ opacity: m.status === "away" ? 0.5 : 1 }}>
                  <span className="cr-face">
                    <Ring size={80} ratio={n / doneTotal} stroke={3}>
                      <TeamAvatar id={m.userId} name={m.name} size={62} presence />
                    </Ring>
                    <span className="cr-count" title="Commandes terminées aujourd'hui">{n}</span>
                  </span>
                  <div style={{ minWidth: 0, maxWidth: "100%" }}>
                    <p className="n">{firstName(m.name)}</p>
                    <p className="s">{s ? `De garde jusqu'à ${hourLabel(s.ends)}` : m.status === "away" ? "Absent" : m.status === "busy" ? "Occupé" : "Disponible"}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {ticker.length > 0 && (
        <div className="cr-ticker" aria-label="Activité de l'équipe">
          <div className="cr-track" style={{ ["--cr-speed" as string]: `${Math.max(40, ticker.length * 9)}s` }}>
            {[...ticker, ...ticker].map((f, i) => (
              <span key={`${f.at}-${i}`} className="cr-item" aria-hidden={i >= ticker.length}>
                {f.actorId ? <TeamAvatar id={f.actorId} name={f.actorName} size={20} /> : null}
                <span style={{ color: "var(--a-t1)" }}>{f.actorId ? firstName(f.actorName) : f.actorName}</span>{f.text}
                <em>{hm(f.at)}</em>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
  // Plein écran : posé directement sur la page (hors de la mise en page et de ses animations).
  return tv ? createPortal(<div className="cr-tv admin-scope">{body}</div>, document.body) : body;
}
