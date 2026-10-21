/**
 * Outils de l'équipe (Ressources › Outils) : les petits outils du quotidien, chacun avec sa scène animée.
 * Chacun ne voit que ceux de ses rôles ; chaque outil s'ouvre en volet, sans quitter la page.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeft, ArrowDownUp, ArrowRight, ArrowUpRight, Building2, CalendarDays, Check, Clock3, ExternalLink, Hash, Landmark, Loader2,
  Network, RefreshCw, Search, ShieldAlert, ShieldCheck, ShoppingCart, UserRound, Users,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { fetchLatestRate, type LatestRate } from "@/lib/adminTools";
import { getAppSettingsNow } from "@/lib/settings";
import { primaryAsset } from "@/lib/assets";
import { orderRef } from "@/lib/orders";
import { firstName, searchClients } from "@/lib/teamSpace";
import {
  FAMILY_NETS, NET_NAME, addressFamily, fetchBocRate, fetchDayChecks, fetchDayContext, hashFamily, fetchRateHistory, lookup24h, lookupAddress, lookupTx, signDayCheck, todayMontreal,
  type AddressReport, type DayCheck, type DayContext, type DayKind, type TxReport, type Window24h,
} from "@/lib/teamTools";
import { C, FONT } from "./adminTheme";
import { Button, Field, SidePanel, TextArea, TextInput } from "./ui";

type ToolId = "convert" | "address" | "tx" | "day" | "rule24" | "boc";
interface ToolDef { id: ToolId; group: string; name: string; desc: string; how: string; color: string; roles?: string[] }
const TOOLS: ToolDef[] = [
  { id: "convert", group: "Pour tout le monde", name: "Convertisseur", color: C.vzGreen,
    desc: "Dollars et cryptomonnaie, au taux du moment, à l'achat comme à la vente.",
    how: "Entrez un montant : le résultat suit le taux publié à la seconde près." },
  { id: "address", group: "Pour tout le monde", name: "Vérificateur d'adresse", color: C.sage,
    desc: "Réseau, adresse d'Ooble ou d'un client, liste de sanctions.",
    how: "Collez une adresse : l'outil dit à qui elle appartient et si elle est sur une liste de sanctions." },
  { id: "tx", group: "Pour tout le monde", name: "Explorateur de transaction", color: C.vzIndigo,
    desc: "Un hash : l'envoi ou le dépôt, sa commande, l'explorateur du réseau.",
    how: "Collez un hash : l'outil retrouve l'envoi ou le dépôt et la commande qui va avec." },
  { id: "day", group: "Opérations", name: "Checklist de la journée", color: C.sun,
    desc: "Ouverture et fermeture, signées, avec l'état de la file et du stock.",
    how: "Cochez chaque point, puis signez : l'équipe voit qui a ouvert et fermé la journée." },
  { id: "rule24", group: "Conformité", name: "Règle des 24 heures", color: C.vzCoral, roles: ["admin", "compliance"],
    desc: "Les opérations d'un client sur 24 heures glissantes, et le seuil de 10 000 $.",
    how: "Choisissez un client : l'outil additionne ses opérations des 24 dernières heures." },
  { id: "boc", group: "Comptabilité", name: "Taux de la Banque du Canada", color: C.coral,
    desc: "Le taux officiel USD/CAD d'un jour, comparé à notre cours.",
    how: "Choisissez une date : le taux officiel publié ce jour-là, ou le dernier avant." },
];
/** Logo de chaque réseau (public/coins). */
const NET_COIN: Record<string, string> = { bep20: "bnb", polygon: "matic", avalanche: "avax", spl: "sol", trc20: "trx", erc20: "eth" };
const Coin = ({ id, size = 18, net = false }: { id: string; size?: number; net?: boolean }) => {
  const c = net ? NET_COIN[id] : id;
  return c ? <img src={`/coins/${c}.svg`} alt="" width={size} height={size} draggable={false} style={{ borderRadius: "50%", flexShrink: 0, display: "block" }} /> : null;
};

const CSS = `
.tl-wrap { font-family: ${FONT}; max-width: 1040px; }
.tl-eyebrow { margin: 0; font-size: 11px; font-weight: 500; letter-spacing: .09em; text-transform: uppercase; color: var(--a-t3); }

/* Le marché en direct, en tête de page. */
.tl-hero { display: grid; grid-template-columns: minmax(0, 340px) minmax(0, 1fr); gap: 28px; align-items: end; padding: 6px 0 24px; border-bottom: 1px solid var(--a-bds); }
.tl-pair { display: flex; align-items: center; gap: 12px; }
.tl-pair .tl-coinwrap { position: relative; width: 44px; height: 44px; }
.tl-pair .tl-coinwrap::after { content: ""; position: absolute; inset: -6px; border-radius: 50%; border: 1px solid color-mix(in srgb, #2775CA 55%, transparent); animation: tl-halo 2.6s ease-out infinite; }
.tl-pair b { display: block; font-size: 15px; font-weight: 600; color: var(--a-t1); }
.tl-pair small { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; color: var(--a-t3); margin-top: 2px; }
.tl-rate { margin: 16px 0 0; font-size: 46px; font-weight: 600; letter-spacing: -0.045em; line-height: 1; color: var(--a-t1); font-variant-numeric: tabular-nums; }
.tl-rate span { font-size: 22px; color: var(--a-t3); font-weight: 500; margin-left: 6px; letter-spacing: -0.02em; }
.tl-trio { display: flex; gap: 18px; flex-wrap: wrap; margin-top: 12px; font-size: 12.5px; color: var(--a-t3); font-variant-numeric: tabular-nums; }
.tl-trio b { color: var(--a-t1); font-weight: 500; margin-left: 5px; }
.tl-chg { color: var(--a-t1); }
.tl-spark { width: 100%; height: 132px; display: block; overflow: visible; }
.tl-spark-path { stroke-dasharray: 2000; stroke-dashoffset: 2000; animation: tl-drawline 1.6s cubic-bezier(.22,1,.36,1) forwards; }
.tl-spark-area { opacity: 0; animation: tl-fadein 1s .6s ease forwards; }
.tl-spark-end { animation: tl-beat 1.8s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
.tl-spark-axis { font-size: 10.5px; fill: var(--a-t3); font-variant-numeric: tabular-nums; }
.tl-pulse { position: relative; width: 7px; height: 7px; border-radius: 50%; background: var(--a-vzGreen); flex-shrink: 0; display: inline-block; }
.tl-pulse::after { content: ""; position: absolute; inset: 0; border-radius: 50%; background: inherit; animation: tl-ping 2s cubic-bezier(0,0,.2,1) infinite; }
.tl-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-bottom: 1px solid var(--a-bds); margin-bottom: 30px; }
.tl-stats > div { padding: 14px 18px 14px 0; display: flex; gap: 12px; align-items: center; min-width: 0; }
.tl-stats > div + div { padding-left: 18px; border-left: 1px solid var(--a-bds); }
.tl-stats b { display: block; font-size: 14.5px; font-weight: 600; color: var(--a-t1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
.tl-stats small { display: block; font-size: 12px; color: var(--a-t3); margin-top: 1px; }
.tl-netrow { display: flex; }
.tl-netrow img { margin-left: -6px; box-shadow: 0 0 0 2px var(--a-bg); border-radius: 50%; }
.tl-netrow img:first-child { margin-left: 0; }

/* Les tuiles : une scène animée, puis le nom. */
.tl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); border-top: 1px solid var(--a-bds); border-left: 1px solid var(--a-bds); }
.tl-tile { all: unset; box-sizing: border-box; position: relative; display: flex; flex-direction: column; gap: 6px; padding: 0 22px 18px; min-height: 300px;
  border-right: 1px solid var(--a-bds); border-bottom: 1px solid var(--a-bds); cursor: pointer; font-family: inherit; overflow: hidden;
  animation: tl-up .6s cubic-bezier(.22,1,.36,1) both; animation-delay: calc(var(--i) * 70ms); }
.tl-tile::before { content: ""; position: absolute; left: 0; top: 0; height: 2px; width: 100%; background: var(--c); transform: scaleX(0); transform-origin: left; transition: transform .5s cubic-bezier(.22,1,.36,1); z-index: 1; }
.tl-tile:hover::before, .tl-tile:focus-visible::before { transform: scaleX(1); }
.tl-tile:focus-visible { outline: 2px solid var(--a-accent); outline-offset: -2px; }
.tl-tile .sc { transition: transform .6s cubic-bezier(.22,1,.36,1); }
.tl-tile:hover .sc { transform: scale(1.05); }
.tl-tile-name { font-size: 16.5px; font-weight: 500; color: var(--a-t1); letter-spacing: -0.01em; margin-top: 2px; }
.tl-tile-desc { font-size: 13px; line-height: 1.5; color: var(--a-t3); }
.tl-tile-foot { margin-top: auto; padding-top: 12px; display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--a-t2); font-variant-numeric: tabular-nums; min-width: 0; }
.tl-tile-foot > span { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tl-go { width: 16px; height: 16px; color: var(--a-t3); transition: transform .3s cubic-bezier(.22,1,.36,1), color .3s; flex-shrink: 0; }
.tl-tile:hover .tl-go { transform: translateX(4px); color: var(--a-t1); }
.tl-nets { display: inline-flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; }
.tl-nets > span { display: inline-flex; align-items: center; gap: 7px; }

/* Les scènes. */
.sc { position: relative; height: 150px; display: grid; place-items: center; margin: 0 -22px 8px; }
.sc-panel { margin: -4px 0 14px; height: 140px; }
.sc-conv { display: flex; align-items: center; justify-content: center; gap: 0; }
.sc-cad { width: 54px; height: 54px; border-radius: 50%; background: #D52B1E; color: #fff; display: grid; place-items: center; font-weight: 700; font-size: 20px; line-height: 1; position: relative; animation: tl-bob 3.2s ease-in-out infinite; }
.sc-cad small { position: absolute; bottom: -18px; font-size: 10.5px; letter-spacing: .08em; font-weight: 500; color: var(--a-t3); }
.sc-usdc { position: relative; animation: tl-bob 3.2s ease-in-out -1.6s infinite; }
.sc-usdc small { position: absolute; bottom: -18px; left: 0; right: 0; text-align: center; font-size: 10.5px; letter-spacing: .08em; font-weight: 500; color: var(--a-t3); }
.sc-flow { width: 120px; height: 40px; overflow: visible; }
.sc-flow .d { stroke-dasharray: 3 7; animation: tl-dash 0.9s linear infinite; }
.sc-flow .d2 { stroke-dasharray: 3 7; animation: tl-dash 0.9s linear infinite reverse; }
.sc-addr-row { position: relative; display: flex; gap: 14px; }
.sc-addr-row img { animation: tl-look 4.8s cubic-bezier(.65,0,.35,1) infinite; animation-delay: calc(var(--k) * 1.2s); }
.sc-lens { position: absolute; top: -8px; left: 0; width: 56px; height: 56px; border-radius: 50%; border: 3px solid var(--c); backdrop-filter: blur(.5px);
  box-shadow: 0 6px 20px rgba(0,0,0,.25), inset 0 0 0 1px rgba(255,255,255,.08); animation: tl-lens 4.8s cubic-bezier(.65,0,.35,1) infinite; pointer-events: none; }
.sc-lens::after { content: ""; position: absolute; width: 4px; height: 20px; background: var(--c); border-radius: 2px; right: -9px; bottom: -14px; transform: rotate(-45deg); }
.sc-tx-net { animation: tl-swap4 6s infinite; opacity: 0; }
.sc-dial line { animation: tl-sweep 2.4s linear infinite; animation-delay: calc(var(--k) * 0.1s); opacity: .18; }
.sc-flag { animation: tl-wave 2.6s ease-in-out infinite; transform-box: fill-box; transform-origin: left center; }
.sc-week { display: flex; gap: 6px; justify-content: center; margin-top: 10px; }
.sc-week span { width: 22px; text-align: center; font-size: 10.5px; color: var(--a-t3); padding-top: 6px; border-top: 2px solid var(--a-bds); }
.sc-week span.on { color: var(--a-t1); border-top-color: var(--c); }
.sc-sun { animation: tl-glow 2.6s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }

@media (prefers-reduced-motion: no-preference) {
  .tl-rise > * { animation: tl-up .5s cubic-bezier(.22,1,.36,1) both; }
  .tl-rise > *:nth-child(2) { animation-delay: 60ms; } .tl-rise > *:nth-child(3) { animation-delay: 120ms; }
  .tl-rise > *:nth-child(4) { animation-delay: 180ms; } .tl-rise > *:nth-child(5) { animation-delay: 240ms; }
  .tl-rise > *:nth-child(6) { animation-delay: 300ms; } .tl-rise > *:nth-child(n+7) { animation-delay: 360ms; }
}
@media (prefers-reduced-motion: reduce) { .tl-wrap *, .tl-wrap *::after, .sc *, .sc *::after { animation: none !important; } .tl-spark-path { stroke-dashoffset: 0; } .tl-spark-area { opacity: 1; } .sc-tx-net:first-of-type { opacity: 1; } }
@keyframes tl-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
@keyframes tl-ping { 75%, 100% { transform: scale(2.4); opacity: 0; } }
@keyframes tl-halo { 0% { transform: scale(.9); opacity: 1; } 100% { transform: scale(1.35); opacity: 0; } }
@keyframes tl-drawline { to { stroke-dashoffset: 0; } }
@keyframes tl-fadein { to { opacity: 1; } }
@keyframes tl-beat { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.5); } }
@keyframes tl-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
@keyframes tl-dash { to { stroke-dashoffset: -20; } }
@keyframes tl-look { 0%, 18% { transform: scale(1.22); } 25%, 100% { transform: scale(1); } }
@keyframes tl-lens { 0%, 18% { transform: translateX(-8px); } 25%, 43% { transform: translateX(46px); } 50%, 68% { transform: translateX(100px); } 75%, 93% { transform: translateX(154px); } 100% { transform: translateX(-8px); } }
@keyframes tl-swap4 { 0%, 22% { opacity: 1; } 25%, 100% { opacity: 0; } }
@keyframes tl-sweep { 0% { opacity: 1; } 60%, 100% { opacity: .18; } }
@keyframes tl-wave { 0%, 100% { transform: skewY(0); } 30% { transform: skewY(-7deg); } 70% { transform: skewY(5deg); } }
@keyframes tl-glow { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.12); } }
@keyframes tl-tick { from { stroke-dashoffset: 24; } to { stroke-dashoffset: 0; } }

/* Le contenu des outils. */
.tl-head { padding-bottom: 16px; margin-bottom: 20px; border-bottom: 1px solid var(--a-bds); }
.tl-head p { margin: 0; font-size: 13.5px; line-height: 1.55; color: var(--a-t2); }
.tl-k { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--a-t3); margin: 0 0 8px; }
.tl-big { margin: 0; display: flex; align-items: center; gap: 12px; font-size: 36px; font-weight: 600; letter-spacing: -0.04em; color: var(--a-t1); font-variant-numeric: tabular-nums; line-height: 1.1; overflow-wrap: anywhere; }
.tl-line { display: flex; align-items: center; gap: 12px; padding: 11px 0; border-bottom: 1px solid var(--a-bds); font-size: 14px; min-width: 0; }
.tl-line > svg { width: 16px; height: 16px; color: var(--a-t3); flex-shrink: 0; }
.tl-line > .l { color: var(--a-t3); min-width: 0; }
.tl-line > .v { margin-left: auto; color: var(--a-t1); text-align: right; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; min-width: 0; display: inline-flex; align-items: center; justify-content: flex-end; gap: 7px; }
.tl-verdict { display: flex; gap: 14px; align-items: flex-start; padding: 4px 0 16px; }
.tl-verdict > svg { width: 26px; height: 26px; flex-shrink: 0; margin-top: 1px; }
.tl-verdict b { display: block; font-size: 17px; font-weight: 600; color: var(--a-t1); letter-spacing: -0.01em; }
.tl-verdict span { display: block; margin-top: 3px; font-size: 13.5px; line-height: 1.5; color: var(--a-t2); }
.tl-link { all: unset; cursor: pointer; color: var(--a-t1); text-decoration: underline; text-underline-offset: 4px; text-decoration-color: color-mix(in srgb, currentColor 40%, transparent); }
.tl-link:hover { text-decoration-color: currentColor; }
.tl-ext { display: inline-flex; align-items: center; gap: 8px; font-size: 13.5px; color: var(--a-t1); text-decoration: none; padding: 6px 0; }
.tl-ext:hover { text-decoration: underline; text-underline-offset: 4px; }
.tl-ext svg { width: 13px; height: 13px; color: var(--a-t3); }
.tl-seg { display: flex; border-bottom: 1px solid var(--a-bds); }
.tl-seg button { all: unset; cursor: pointer; flex: 1; display: inline-flex; justify-content: center; align-items: center; gap: 7px; padding: 10px 6px; font-size: 13.5px; color: var(--a-t3);
  border-bottom: 2px solid transparent; margin-bottom: -1px; transition: color .2s, border-color .25s; }
.tl-seg button[aria-pressed="true"] { color: var(--a-t1); border-bottom-color: var(--c); }
.tl-seg svg { width: 15px; height: 15px; }
.tl-swap { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--a-t2); }
.tl-swap svg { width: 15px; height: 15px; transition: transform .4s cubic-bezier(.22,1,.36,1); }
.tl-swap:hover svg { transform: rotate(180deg); }
.tl-check { position: relative; display: flex; gap: 13px; align-items: flex-start; padding: 12px 0; border-bottom: 1px solid var(--a-bds); cursor: pointer; font-size: 14px; color: var(--a-t1); }
.tl-check input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.tl-box { width: 18px; height: 18px; border: 1.5px solid var(--a-t3); border-radius: 4px; flex-shrink: 0; margin-top: 1px; display: grid; place-items: center; transition: background .2s, border-color .2s; }
.tl-box svg { width: 13px; height: 13px; stroke: var(--a-l1); stroke-dasharray: 24; stroke-dashoffset: 24; }
.tl-check input:checked + .tl-box { background: var(--a-t1); border-color: var(--a-t1); }
.tl-check input:checked + .tl-box svg { animation: tl-tick .3s ease forwards; }
.tl-check input:focus-visible + .tl-box { outline: 2px solid var(--a-accent); outline-offset: 2px; }
.tl-check input:checked ~ .tl-txt { color: var(--a-t2); }
.tl-hint { display: block; margin-top: 3px; font-size: 12.5px; color: var(--a-t3); }
.tl-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; overflow-wrap: anywhere; }
.tl-gauge { position: relative; height: 6px; background: var(--a-bds); margin: 18px 0 8px; }
.tl-gauge > i { position: absolute; left: 0; top: 0; bottom: 0; background: var(--c); transition: width .9s cubic-bezier(.22,1,.36,1); }
.tl-gauge > em { position: absolute; top: -5px; bottom: -5px; width: 2px; background: var(--a-t1); }
.tl-scale { position: relative; height: 16px; font-size: 12px; color: var(--a-t3); font-variant-numeric: tabular-nums; }
.tl-scale > span { position: absolute; top: 0; white-space: nowrap; }
.tl-chips { display: flex; flex-wrap: wrap; gap: 4px 16px; }
.tl-chips button { all: unset; cursor: pointer; font-size: 13px; color: var(--a-t3); padding: 3px 0; border-bottom: 1px solid transparent; }
.tl-chips button:hover { color: var(--a-t1); }
.tl-chips button[aria-pressed="true"] { color: var(--a-t1); border-bottom-color: var(--c); }
.tl-ring { flex-shrink: 0; }
.tl-ring circle:last-child { transition: stroke-dashoffset .5s cubic-bezier(.22,1,.36,1); }
.tl-client { all: unset; box-sizing: border-box; width: 100%; display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--a-bds); cursor: pointer; }
.tl-client:hover .tl-go { transform: translateX(4px); color: var(--a-t1); }
@media (max-width: 760px) {
  .tl-hero { grid-template-columns: 1fr; gap: 10px; }
  .tl-rate { font-size: 40px; }
  .tl-stats { grid-template-columns: 1fr; }
  .tl-stats > div { padding: 12px 0; }
  .tl-stats > div + div { padding-left: 0; border-left: 0; border-top: 1px solid var(--a-bds); }
  .tl-grid { grid-template-columns: 1fr; }
  .tl-tile { min-height: 0; padding: 0 16px 18px; }
  .sc { height: 132px; margin: 0 -16px 6px; }
}
`;

const cad = (n: number) => `${n.toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
const num = (n: number, d = 2) => n.toLocaleString("fr-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
const rate4 = (n: number) => n.toLocaleString("fr-CA", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const dt = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const hm = (iso: string | number) => new Date(iso).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });
const short = (s: string) => (s.length > 20 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s);
const STATUS: Record<string, string> = {
  created: "Créée", awaiting_payment: "En attente du paiement", payment_received: "Paiement reçu", settling: "En règlement", completed: "Terminée",
  cancelled: "Annulée", expired: "Expirée", refunded: "Remboursée", matched: "Rattaché", unmatched: "Sans commande", review: "À vérifier",
  confirmed: "Confirmé", broadcast: "Diffusé", sending: "En cours", failed: "Échoué", pending: "En attente",
};
const OPEN_NETS = ["bep20", "polygon", "avalanche", "spl"];
/** Réseaux d'une famille, sans Ethereum (fermé) ; Tron reste visible pour les anciennes commandes. */
const netsOf = (fam: keyof typeof FAMILY_NETS) => FAMILY_NETS[fam].filter((n) => n.id !== "erc20");

/** Un chiffre qui défile jusqu'à sa valeur. */
function useCount(target: number | null, ms = 650) {
  const [v, setV] = useState(target ?? 0);
  const cur = useRef(target ?? 0);
  useEffect(() => {
    if (target == null) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const from = cur.current;
    if (reduce || from === target) { cur.current = target; setV(target); return; }
    let raf = 0; const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - p, 3);
      cur.current = from + (target - from) * e; setV(cur.current);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/* ─── Les scènes animées de chaque outil ─── */
interface SceneData { rate: LatestRate | null; sym: string; asset: string; opened?: DayCheck; closed?: DayCheck }
function Scene({ id, color, d, panel = false }: { id: ToolId; color: string; d: SceneData; panel?: boolean }) {
  const cls = `sc${panel ? " sc-panel" : ""}`;
  const style = { "--c": color } as React.CSSProperties;
  switch (id) {
    case "convert": return (
      <div className={`${cls} sc-conv`} style={style} aria-hidden>
        <span className="sc-cad">$<small>CAD</small></span>
        <svg className="sc-flow" viewBox="0 0 120 40">
          <path className="d" d="M8 14H112" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          <path className="d2" d="M8 26H112" stroke="var(--a-t3)" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M106 9l6 5-6 5" stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M14 21l-6 5 6 5" stroke="var(--a-t3)" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="sc-usdc"><Coin id={d.asset} size={54} /><small>{d.sym}</small></span>
      </div>
    );
    case "address": return (
      <div className={cls} style={style} aria-hidden>
        <div className="sc-addr-row">
          {OPEN_NETS.map((n, k) => <span key={n} style={{ "--k": k } as React.CSSProperties}><Coin id={n} net size={40} /></span>)}
          <span className="sc-lens" />
        </div>
      </div>
    );
    case "tx": return (
      <div className={cls} style={style} aria-hidden>
        <svg width="260" height="96" viewBox="0 0 260 96" fill="none">
          <path d="M60 48H120M150 48H200" stroke="var(--a-bd)" strokeWidth="2" strokeDasharray="4 5" />
          <rect x="16" y="26" width="44" height="44" rx="12" stroke="var(--a-bd)" strokeWidth="1.5" />
          {OPEN_NETS.map((n, k) => (
            <image key={n} className="sc-tx-net" href={`/coins/${NET_COIN[n]}.svg`} x="24" y="34" width="28" height="28" style={{ animationDelay: `${k * 1.5}s` }} />
          ))}
          <rect x="120" y="22" width="30" height="52" rx="6" fill={color} />
          <path d="M127 38h16M127 46h12M127 54h16M127 62h8" stroke="var(--a-l1)" strokeWidth="2" strokeLinecap="round" />
          <circle cx="222" cy="48" r="22" stroke={color} strokeWidth="2" />
          <path d="M212 48l7 7 13-14" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          <image href={`/coins/${d.asset}.svg`} x="-10" y="-10" width="20" height="20">
            <animateMotion dur="2.6s" repeatCount="indefinite" path="M62 48H198" keyPoints="0;0.45;0.45;1" keyTimes="0;0.4;0.6;1" calcMode="linear" />
          </image>
        </svg>
      </div>
    );
    case "day": {
      // Le soleil suit l'heure réelle, de 6 h à 22 h.
      const now = new Date();
      const h = now.getHours() + now.getMinutes() / 60;
      const p = Math.min(1, Math.max(0, (h - 6) / 16));
      const a = Math.PI * (1 - p), R = 96, cx = 130, cy = 104;
      const sx = cx + R * Math.cos(a), sy = cy - R * Math.sin(a);
      const len = Math.PI * R;
      const mark = (iso?: string) => {
        if (!iso) return null;
        const t = new Date(iso); const q = Math.min(1, Math.max(0, (t.getHours() + t.getMinutes() / 60 - 6) / 16)); const b = Math.PI * (1 - q);
        return { x: cx + R * Math.cos(b), y: cy - R * Math.sin(b) };
      };
      const o = mark(d.opened?.at), c = mark(d.closed?.at);
      return (
        <div className={cls} style={style} aria-hidden>
          <svg width="260" height="128" viewBox="0 0 260 128" fill="none" style={{ overflow: "visible" }}>
            <path d={`M${cx - R} ${cy}A${R} ${R} 0 0 1 ${cx + R} ${cy}`} stroke="var(--a-bd)" strokeWidth="1.5" strokeDasharray="3 5" />
            <path d={`M${cx - R} ${cy}A${R} ${R} 0 0 1 ${cx + R} ${cy}`} stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - p)} />
            <path d={`M14 ${cy}H246`} stroke="var(--a-t3)" strokeWidth="1.5" />
            <text x={cx - R} y={cy + 18} textAnchor="middle" className="tl-spark-axis">6 h</text>
            <text x={cx + R} y={cy + 18} textAnchor="middle" className="tl-spark-axis">22 h</text>
            {o && <g><circle cx={o.x} cy={o.y} r="4" fill="var(--a-t1)" /><text x={o.x} y={o.y - 10} textAnchor="middle" className="tl-spark-axis">Ouverte</text></g>}
            {c && <g><circle cx={c.x} cy={c.y} r="4" fill="var(--a-t1)" /><text x={c.x} y={c.y - 10} textAnchor="middle" className="tl-spark-axis">Fermée</text></g>}
            <circle className="sc-sun" cx={sx} cy={sy} r="18" fill={color} opacity=".18" />
            <circle cx={sx} cy={sy} r="10" fill={color} />
            <text x={cx} y={cy - 22} textAnchor="middle" style={{ fontSize: 22, fontWeight: 600, fill: "var(--a-t1)", letterSpacing: "-0.03em" }}>{hm(now.getTime())}</text>
          </svg>
        </div>
      );
    }
    case "rule24": return (
      <div className={cls} style={style} aria-hidden>
        <svg className="sc-dial" width="128" height="128" viewBox="0 0 128 128" fill="none">
          {Array.from({ length: 24 }, (_, k) => {
            const a = (k / 24) * Math.PI * 2 - Math.PI / 2;
            return <line key={k} style={{ "--k": k } as React.CSSProperties} x1={64 + 46 * Math.cos(a)} y1={64 + 46 * Math.sin(a)} x2={64 + 58 * Math.cos(a)} y2={64 + 58 * Math.sin(a)} stroke={color} strokeWidth="5" strokeLinecap="round" />;
          })}
          <text x="64" y="64" textAnchor="middle" style={{ fontSize: 26, fontWeight: 600, fill: "var(--a-t1)", letterSpacing: "-0.04em" }}>24 h</text>
          <text x="64" y="82" textAnchor="middle" className="tl-spark-axis">10 000 $</text>
        </svg>
      </div>
    );
    case "boc": {
      const wd = new Date().getDay();
      return (
        <div className={cls} style={style} aria-hidden>
          <div>
            <svg width="120" height="92" viewBox="0 0 120 92" fill="none" style={{ display: "block", margin: "0 auto" }}>
              <path d="M60 30V6" stroke="var(--a-t1)" strokeWidth="2" strokeLinecap="round" />
              <g className="sc-flag">
                <rect x="60" y="6" width="30" height="16" fill="#D52B1E" />
                <rect x="67.5" y="6" width="15" height="16" fill="#fff" />
                <path d="M75 9l1.2 2.4 1.8-.6-.6 3 1.8-.6-.6 2.4-2.4.3v2.1h-1.2v-2.1l-2.4-.3-.6-2.4 1.8.6-.6-3 1.8.6z" fill="#D52B1E" />
              </g>
              <path d="M16 44L60 26l44 18z" stroke="var(--a-t1)" strokeWidth="2" strokeLinejoin="round" />
              <path d="M22 50h76M30 54v22M46 54v22M74 54v22M90 54v22M18 82h84M14 88h92" stroke="var(--a-t1)" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <div className="sc-week">{["L", "M", "M", "J", "V"].map((l, i) => <span key={i} className={wd === i + 1 ? "on" : ""}>{l}</span>)}</div>
          </div>
        </div>
      );
    }
  }
}

/* ─── La courbe du cours sur une heure ─── */
function Spark({ pts, color }: { pts: { at: number; market: number }[]; color: string }) {
  if (pts.length < 2) return <div className="tl-spark" />;
  const W = 600, H = 120, P = 6;
  const min = Math.min(...pts.map((p) => p.market)), max = Math.max(...pts.map((p) => p.market));
  const span = max - min || 1e-6, t0 = pts[0].at, t1 = pts[pts.length - 1].at;
  const xy = pts.map((p) => [P + ((p.at - t0) / (t1 - t0 || 1)) * (W - 2 * P), P + (1 - (p.market - min) / span) * (H - 2 * P - 14)] as const);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
  const [ex, ey] = xy[xy.length - 1];
  return (
    <svg className="tl-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <defs><linearGradient id="tl-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".28" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      {[0.25, 0.5, 0.75].map((f) => <path key={f} d={`M0 ${(H - 14) * f}H${W}`} stroke="var(--a-bds)" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
      <path className="tl-spark-area" d={`${line}L${ex} ${H - 14}L${xy[0][0]} ${H - 14}Z`} fill="url(#tl-area)" />
      <path className="tl-spark-path" d={line} stroke={color} strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <circle className="tl-spark-end" cx={ex} cy={ey} r="4" fill={color} vectorEffect="non-scaling-stroke" />
      <text x={P} y={H} className="tl-spark-axis">{hm(t0)}</text>
      <text x={W - P} y={H} textAnchor="end" className="tl-spark-axis">{hm(t1)}</text>
    </svg>
  );
}

export default function ToolsPanel({ onOpenOrder, onShowClient }: { onOpenOrder?: (id: string) => void; onShowClient?: (id: string) => void }) {
  const { roles } = useAuth();
  const [open, setOpen] = useState<ToolId | null>(null);
  const [rate, setRate] = useState<LatestRate | null>(null);
  const [hist, setHist] = useState<{ at: number; market: number; buy: number }[]>([]);
  const [checks, setChecks] = useState<DayCheck[] | null>(null);
  const [ctx, setCtx] = useState<DayContext | null>(null);
  const [, tick] = useState(0);
  const a = primaryAsset(getAppSettingsNow());
  const sym = a.symbol;
  const can = (t: ToolDef) => !t.roles || roles.includes("admin") || t.roles.some((r) => roles.includes(r as never));
  const tools = TOOLS.filter(can);
  const tool = TOOLS.find((t) => t.id === open);
  // Ouvrir une commande ou une fiche depuis un outil ferme d'abord le volet.
  const goOrder = onOpenOrder ? (id: string) => { setOpen(null); onOpenOrder(id); } : undefined;
  const goClient = onShowClient ? (id: string) => { setOpen(null); onShowClient(id); } : undefined;

  // Le marché en direct : taux et courbe de l'heure, rafraîchis toutes les 30 secondes.
  useEffect(() => {
    const r = () => {
      fetchLatestRate().then(setRate).catch(() => {});
      fetchRateHistory(a.id).then(setHist).catch(() => {});
      tick((n) => n + 1);
    };
    r();
    const t = window.setInterval(r, 30_000);
    return () => window.clearInterval(t);
  }, [a.id]);
  useEffect(() => {
    if (open) return;
    fetchDayChecks(1).then(setChecks).catch(() => {});
    fetchDayContext().then(setCtx).catch(() => {});
  }, [open]);
  const today = todayMontreal();
  const opened = checks?.find((c) => c.day === today && c.kind === "open");
  const closed = checks?.find((c) => c.day === today && c.kind === "close");
  const dayText = closed ? `Fermée par ${closed.byName} à ${hm(closed.at)}` : opened ? `Ouverte par ${opened.byName} à ${hm(opened.at)}` : "Ouverture à signer";
  const buyShown = useCount(rate?.buy ?? null, 900);
  const first = hist[0]?.market, last = hist[hist.length - 1]?.market;
  const chg = first && last ? (last / first - 1) * 100 : null;
  const scene: SceneData = { rate, sym, asset: a.id, opened, closed };

  const foot = (t: ToolDef): React.ReactNode => {
    switch (t.id) {
      case "convert": return rate ? <span>1 {sym} = {rate4(rate.buy)} $ à l'achat</span> : <span>Taux du moment</span>;
      case "address": return <span>BNB Chain, Polygon, Avalanche et Solana</span>;
      case "tx": return <span>Envois, dépôts et hash déclarés</span>;
      case "day": return <span>{checks ? dayText : "…"}</span>;
      case "rule24": return <span>Seuil : 10 000 $ sur 24 heures</span>;
      case "boc": return <span>Publié les jours ouvrables vers 16 h 30</span>;
    }
  };

  return (
    <div className="tl-wrap">
      <style>{CSS}</style>
      <section className="tl-hero">
        <div>
          <div className="tl-pair">
            <span className="tl-coinwrap"><Coin id={a.id} size={44} /></span>
            <span><b>{sym} / CAD</b><small><span className="tl-pulse" />En direct</small></span>
          </div>
          <p className="tl-rate">{rate ? rate4(buyShown) : "…"}<span>$</span></p>
          {rate && (
            <div className="tl-trio">
              <span>Achat<b>{rate4(rate.buy)}</b></span>
              <span>Vente<b>{rate4(rate.sell)}</b></span>
              {rate.market != null && <span>Marché<b>{rate4(rate.market)}</b></span>}
              {chg != null && <span>1 h<b className="tl-chg">{chg >= 0 ? "+" : ""}{num(chg, 3)} %</b></span>}
            </div>
          )}
        </div>
        <Spark pts={hist} color="#2775CA" />
      </section>
      <div className="tl-stats">
        <div>
          <span className="tl-netrow">{OPEN_NETS.map((n) => <Coin key={n} id={n} net size={22} />)}</span>
          <span style={{ minWidth: 0 }}><b>4 réseaux ouverts</b><small>BNB Chain, Polygon, Avalanche, Solana</small></span>
        </div>
        <div>
          <CalendarDays style={{ width: 20, height: 20, color: C.t3, flexShrink: 0 }} />
          <span style={{ minWidth: 0 }}><b>{checks ? dayText : "…"}</b><small>La journée d'aujourd'hui</small></span>
        </div>
        <div>
          <ShoppingCart style={{ width: 20, height: 20, color: C.t3, flexShrink: 0 }} />
          <span style={{ minWidth: 0 }}><b>{ctx ? `${ctx.queue} commande${ctx.queue > 1 ? "s" : ""} payée${ctx.queue > 1 ? "s" : ""}` : "…"}</b><small>En attente d'envoi</small></span>
        </div>
      </div>

      <div className="tl-grid">
        {tools.map((t, i) => (
          <button key={t.id} type="button" className="tl-tile" style={{ "--i": i, "--c": t.color } as React.CSSProperties} onClick={() => setOpen(t.id)}>
            <Scene id={t.id} color={t.color} d={scene} />
            <span className="tl-eyebrow">{t.group}</span>
            <span className="tl-tile-name">{t.name}</span>
            <span className="tl-tile-desc">{t.desc}</span>
            <span className="tl-tile-foot">{foot(t)}<ArrowRight className="tl-go" /></span>
          </button>
        ))}
      </div>

      {tool && (
        <SidePanel title={tool.name} subtitle={tool.group} onClose={() => setOpen(null)} width={560}>
          <style>{CSS}</style>
          <div style={{ "--c": tool.color } as React.CSSProperties}>
            <div className="tl-head"><Scene id={tool.id} color={tool.color} d={scene} panel /><p>{tool.how}</p></div>
            {tool.id === "convert" && <Converter />}
            {tool.id === "address" && <AddressTool onShowClient={goClient} />}
            {tool.id === "tx" && <TxTool onOpenOrder={goOrder} />}
            {tool.id === "day" && <DayChecklist color={tool.color} />}
            {tool.id === "rule24" && <Rule24 onOpenOrder={goOrder} onShowClient={goClient} />}
            {tool.id === "boc" && <BocTool />}
          </div>
        </SidePanel>
      )}
    </div>
  );
}

const Err = ({ text }: { text: string | null }) => (text ? <p style={{ margin: "14px 0 0", fontSize: 13.5, color: C.t1 }}>{text}</p> : null);
const Wait = () => <Loader2 style={{ width: 18, height: 18, color: C.t3, animation: "spin 1s linear infinite" }} />;
type Icon = import("lucide-react").LucideIcon;
const Line = ({ icon: I, label, children }: { icon?: Icon; label: React.ReactNode; children?: React.ReactNode }) => (
  <div className="tl-line">{I && <I aria-hidden />}<span className="l">{label}</span>{children != null && children !== "" && <span className="v">{children}</span>}</div>
);
const Nets = ({ ids }: { ids: string[] }) => (
  <span className="tl-nets">{ids.map((n) => <span key={n}><Coin id={n} net size={18} />{NET_NAME[n] ?? n}</span>)}</span>
);
const Explorers = ({ fam, base, value }: { fam: keyof typeof FAMILY_NETS; base: "tx" | "addr"; value: string }) => (
  <div>
    <p className="tl-k" style={{ marginTop: 22 }}>Voir sur l'explorateur</p>
    <div className="tl-nets" style={{ gap: "2px 20px" }}>
      {netsOf(fam).map((n) => (
        <a key={n.id} className="tl-ext" href={n[base] + value.trim()} target="_blank" rel="noreferrer">
          <Coin id={n.id} net size={18} />{n.name}<ExternalLink />
        </a>
      ))}
    </div>
  </div>
);

/* ─── Convertisseur ─── */
function Converter() {
  const sym = primaryAsset(getAppSettingsNow()).symbol;
  const [rate, setRate] = useState<LatestRate | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [unit, setUnit] = useState<"cad" | "crypto">("cad");
  const [amount, setAmount] = useState("");
  const load = () => {
    setErr(null);
    fetchLatestRate().then((r) => { setRate(r); setLoaded(true); if (!r) setErr("Aucun taux publié pour l'instant."); })
      .catch(() => { setLoaded(true); setErr("Taux indisponible pour l'instant."); });
  };
  useEffect(load, []);
  const v = Number(amount.replace(/\s/g, "").replace(",", "."));
  const r = rate ? (side === "buy" ? rate.buy : rate.sell) : 0;
  const out = !rate || !(v > 0) ? null : unit === "cad" ? v / r : v * r;
  const shown = useCount(out);
  const margin = rate?.market ? ((side === "buy" ? r / rate.market - 1 : 1 - r / rate.market) * 100) : null;
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="tl-seg">
        <button type="button" aria-pressed={side === "buy"} onClick={() => setSide("buy")}><ArrowDownLeft />Le client achète</button>
        <button type="button" aria-pressed={side === "sell"} onClick={() => setSide("sell")}><ArrowUpRight />Le client vend</button>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        <Field label={unit === "cad" ? "Montant en dollars" : `Montant en ${sym}`}>
          <TextInput inputMode="decimal" autoFocus placeholder={unit === "cad" ? "500" : "350"} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <button type="button" className="tl-swap" onClick={() => setUnit((u) => (u === "cad" ? "crypto" : "cad"))}>
          <ArrowDownUp />{unit === "cad" ? `Saisir plutôt en ${sym}` : "Saisir plutôt en dollars"}
        </button>
      </div>
      {!loaded && <Wait />}
      <Err text={err} />
      {rate && (
        <div>
          <p className="tl-k">{side === "buy" ? (unit === "cad" ? "Le client reçoit" : "Le client paie") : (unit === "cad" ? "Le client doit envoyer" : "Le client reçoit")}</p>
          <p className="tl-big">{unit === "cad" ? <Coin id={primaryAsset(getAppSettingsNow()).id} size={34} /> : <span style={{ width: 34, height: 34, borderRadius: "50%", background: "#D52B1E", color: "#fff", display: "grid", placeItems: "center", fontSize: 17, fontWeight: 700, flexShrink: 0 }}>$</span>}{out == null ? "—" : unit === "cad" ? `${num(shown, 2)} ${sym}` : cad(shown)}</p>
          <div style={{ marginTop: 16 }}>
            <Line icon={side === "buy" ? ArrowDownLeft : ArrowUpRight} label={`Taux ${side === "buy" ? "à l'achat" : "à la vente"}`}>1 {sym} = {rate4(r)} $</Line>
            {rate.market != null && <Line icon={Network} label="Cours du marché">1 {sym} = {rate4(rate.market)} $</Line>}
            {margin != null && <Line icon={Landmark} label="Marge d'Ooble">{num(margin, 2)} %</Line>}
            <Line icon={Clock3} label="Taux publié">{dt.format(new Date(rate.at))}</Line>
          </div>
          <button type="button" className="tl-swap" style={{ marginTop: 14 }} onClick={load}><RefreshCw />Actualiser le taux</button>
        </div>
      )}
    </div>
  );
}

/* ─── Vérificateur d'adresse ─── */
function AddressTool({ onShowClient }: { onShowClient?: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [rep, setRep] = useState<AddressReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fam = addressFamily(q);
  const run = async () => {
    if (!fam) return;
    setBusy(true); setErr(null); setRep(null);
    try { setRep(await lookupAddress(q)); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const verdict: { icon: Icon; title: string; text: string } | null = !rep ? null
    : rep.sanctioned.length ? { icon: ShieldAlert, title: "Adresse sanctionnée", text: `Sur la liste OFAC${rep.sanctioned[0].network ? ` (${rep.sanctioned[0].network})` : ""}. Ne rien envoyer, ne rien dire au client, prévenir la conformité.` }
    : rep.ooble_deposit ? { icon: Building2, title: "C'est une adresse d'Ooble", text: `Adresse de dépôt${rep.ooble_deposit.active ? ", en service" : ", remplacée depuis"}.` }
    : rep.ooble_payout ? { icon: Building2, title: "C'est une adresse d'Ooble", text: "Notre portefeuille d'envoi." }
    : rep.clients.length > 1 ? { icon: Users, title: `Liée à ${rep.clients.length} clients`, text: "Plusieurs clients partagent cette adresse : à regarder." }
    : rep.clients.length === 1 ? { icon: UserRound, title: "Adresse d'un client connu", text: "Aucune sanction trouvée." }
    : { icon: ShieldCheck, title: "Adresse inconnue chez Ooble", text: "Aucun client ne l'a utilisée et elle n'est sur aucune liste de sanctions." };
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <Field label="Adresse de portefeuille">
        <TextInput autoFocus spellCheck={false} autoCapitalize="none" placeholder="0x…, T…, ou une adresse Solana" value={q}
          onChange={(e) => { setQ(e.target.value); setRep(null); }} onKeyDown={(e) => { if (e.key === "Enter") void run(); }} />
      </Field>
      {q.trim() && !fam && <p style={{ margin: 0, fontSize: 14, color: C.t1 }}>Ce n'est pas une adresse valide sur nos réseaux (BNB Chain, Polygon, Avalanche, Solana, Tron).</p>}
      {fam && !rep && (
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <Button variant="primary" disabled={busy} icon={<Search style={{ width: 15, height: 15 }} />} onClick={() => void run()}>{busy ? "Vérification…" : "Vérifier"}</Button>
          <span style={{ fontSize: 12.5, color: C.t3 }}><Nets ids={netsOf(fam).map((n) => n.id)} /></span>
        </div>
      )}
      <Err text={err} />
      {rep && fam && verdict && (
        <div className="tl-rise">
          <div className="tl-verdict"><verdict.icon style={{ color: C.t1 }} /><div><b>{verdict.title}</b><span>{verdict.text}</span></div></div>
          <Line icon={Network} label="Réseaux"><Nets ids={netsOf(fam).map((n) => n.id)} /></Line>
          <Line icon={rep.sanctioned.length ? ShieldAlert : ShieldCheck} label="Liste de sanctions">{rep.sanctioned.length ? "Présente" : "Absente"}</Line>
          <Line icon={Building2} label="À Ooble">{rep.ooble_deposit ? `Adresse de dépôt${rep.ooble_deposit.active ? "" : " (remplacée)"}` : rep.ooble_payout ? "Portefeuille d'envoi" : "Non"}</Line>
          <Line icon={ShoppingCart} label="Commandes avec cette adresse">{rep.orders}</Line>
          <div>
            <p className="tl-k" style={{ marginTop: 22 }}>Clients liés</p>
            {rep.clients.length === 0 ? <p style={{ margin: 0, fontSize: 14, color: C.t3 }}>Aucun client connu avec cette adresse.</p> : rep.clients.map((c) => (
              <Line key={c.user_id} icon={UserRound} label={onShowClient ? <button type="button" className="tl-link" onClick={() => onShowClient(c.user_id)}>{c.name || c.email || "Client"}</button> : <span style={{ color: C.t1 }}>{c.name || c.email}</span>}>
                <span style={{ color: C.t2 }}>{[c.declared && `${c.declared} déclarée${c.declared > 1 ? "s" : ""}`, c.deposits && `${c.deposits} dépôt${c.deposits > 1 ? "s" : ""}`, c.payouts && `${c.payouts} envoi${c.payouts > 1 ? "s" : ""}`].filter(Boolean).join(" · ") || "connue"}</span>
              </Line>
            ))}
          </div>
          <Explorers fam={fam} base="addr" value={q} />
          <div><button type="button" className="tl-swap" style={{ marginTop: 18 }} onClick={() => { setQ(""); setRep(null); }}><Search />Vérifier une autre adresse</button></div>
        </div>
      )}
    </div>
  );
}

/* ─── Explorateur de transaction ─── */
function TxTool({ onOpenOrder }: { onOpenOrder?: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [rep, setRep] = useState<TxReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fam = hashFamily(q);
  const run = async () => {
    if (!fam) return;
    setBusy(true); setErr(null); setRep(null);
    try { setRep(await lookupTx(q)); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const hits = rep ? [
    ...rep.payouts.map((h) => ({ ...h, kind: "Envoi d'Ooble", icon: ArrowUpRight as Icon })),
    ...rep.deposits.map((h) => ({ ...h, kind: "Dépôt reçu", icon: ArrowDownLeft as Icon })),
    ...rep.declared.map((h) => ({ ...h, kind: "Déclaré par le client", icon: Hash as Icon })),
  ] : [];
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <Field label="Hash de la transaction">
        <TextInput autoFocus spellCheck={false} autoCapitalize="none" placeholder="0x…, ou un hash Solana ou Tron" value={q}
          onChange={(e) => { setQ(e.target.value); setRep(null); }} onKeyDown={(e) => { if (e.key === "Enter") void run(); }} />
      </Field>
      {q.trim() && !fam && <p style={{ margin: 0, fontSize: 14, color: C.t1 }}>Ce n'est pas un hash de transaction reconnu.</p>}
      {fam && !rep && <div><Button variant="primary" disabled={busy} icon={<Search style={{ width: 15, height: 15 }} />} onClick={() => void run()}>{busy ? "Recherche…" : "Chercher"}</Button></div>}
      <Err text={err} />
      {rep && fam && (
        <div className="tl-rise">
          {hits.length === 0 ? (
            <div className="tl-verdict"><Search style={{ color: C.t1 }} /><div><b>Aucune commande d'Ooble</b><span>Ce hash ne correspond à rien chez nous : il peut s'agir d'une transaction sans lien avec Ooble.</span></div></div>
          ) : hits.map((h, i) => (
            <div key={i} style={{ paddingBottom: 14 }}>
              <div className="tl-verdict" style={{ paddingTop: i ? 14 : 4 }}>
                <h.icon style={{ color: C.t1 }} />
                <div><b>{h.kind}</b><span>{h.order_id && onOpenOrder ? <button type="button" className="tl-link" onClick={() => onOpenOrder(h.order_id!)}>Commande {orderRef(h.order_id)}</button> : h.order_id ? `Commande ${orderRef(h.order_id)}` : "Sans commande"}</span></div>
              </div>
              <Line icon={Network} label="Réseau"><Nets ids={[h.network]} /></Line>
              <Line icon={Landmark} label="Montant"><Coin id={String(h.asset)} size={18} />{num(Number(h.amount), 2)} {String(h.asset).toUpperCase()}</Line>
              <Line icon={Check} label="État">{STATUS[h.status] ?? h.status}</Line>
              {(h.to || h.from) && <Line icon={h.to ? ArrowUpRight : ArrowDownLeft} label={h.to ? "Vers" : "Depuis"}><span className="tl-mono">{short(String(h.to || h.from))}</span></Line>}
              {h.at && <Line icon={Clock3} label="Le">{dt.format(new Date(h.at))}</Line>}
            </div>
          ))}
          <Explorers fam={fam} base="tx" value={q} />
          <div><button type="button" className="tl-swap" style={{ marginTop: 18 }} onClick={() => { setQ(""); setRep(null); }}><Search />Chercher un autre hash</button></div>
        </div>
      )}
    </div>
  );
}

/* ─── Checklist de la journée ─── */
const ITEMS: Record<DayKind, { text: string; hint?: (c: DayContext) => string }[]> = {
  open: [
    { text: "Lire la passation de la veille (Mon espace)" },
    { text: "Vérifier la file d'attente", hint: (c) => `${c.queue} commande${c.queue > 1 ? "s" : ""} payée${c.queue > 1 ? "s" : ""} en attente` },
    { text: "Regarder les avis Interac à voir", hint: (c) => `${c.interac_review} avis sans commande ou avec un écart` },
    { text: "Regarder les envois à vérifier", hint: (c) => `${c.payouts_review} envoi${c.payouts_review > 1 ? "s" : ""} à vérifier` },
    { text: "Vérifier le stock et le gaz de chaque réseau", hint: (c) => stockHint(c) },
    { text: "Lire les alertes de conformité ouvertes", hint: (c) => `${c.alerts_open} alerte${c.alerts_open > 1 ? "s" : ""} ouverte${c.alerts_open > 1 ? "s" : ""}` },
  ],
  close: [
    { text: "Plus aucune commande payée en attente, ou remise à un collègue", hint: (c) => `${c.queue} en attente` },
    { text: "Avis Interac de la journée traités", hint: (c) => `${c.interac_review} à voir` },
    { text: "Ventes reçues versées, ou remises dans la passation", hint: (c) => `${c.sells_waiting} vente${c.sells_waiting > 1 ? "s" : ""} en attente du client` },
    { text: "Stock suffisant pour la nuit", hint: (c) => stockHint(c) },
    { text: "Passation de fin de journée écrite (Mon espace)" },
  ],
};
function stockHint(c: DayContext) {
  const sym = primaryAsset(getAppSettingsNow()).id;
  const rows = c.stock.filter((s) => s.asset === sym && OPEN_NETS.includes(s.network));
  const low = rows.filter((s) => Number(s.gas) < Number(s.min_gas)).map((s) => NET_NAME[s.network]);
  return rows.map((s) => `${NET_NAME[s.network]} ${num(Number(s.balance), 2)}`).join(" · ") + (low.length ? ` · gaz bas : ${low.join(", ")}` : "");
}
function Ring({ value, total, color }: { value: number; total: number; color: string }) {
  const r = 20, len = 2 * Math.PI * r;
  return (
    <svg className="tl-ring" width="52" height="52" viewBox="0 0 52 52" aria-hidden>
      <circle cx="26" cy="26" r={r} fill="none" stroke="var(--a-bds)" strokeWidth="4" />
      <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={len}
        strokeDashoffset={len * (1 - (total ? value / total : 0))} transform="rotate(-90 26 26)" />
    </svg>
  );
}
function DayChecklist({ color }: { color: string }) {
  const { user } = useAuth();
  const [checks, setChecks] = useState<DayCheck[] | null>(null);
  const [ctx, setCtx] = useState<DayContext | null>(null);
  const [kind, setKind] = useState<DayKind>(() => (new Date().getHours() < 14 ? "open" : "close"));
  const [done, setDone] = useState<boolean[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = () => {
    fetchDayChecks().then(setChecks).catch((e) => setErr(e.message));
    fetchDayContext().then(setCtx).catch(() => {});
  };
  useEffect(load, []);
  useEffect(() => { setDone(ITEMS[kind].map(() => false)); setNote(""); setErr(null); }, [kind]);
  const today = todayMontreal();
  const signed = checks?.find((c) => c.day === today && c.kind === kind);
  const sign = async () => {
    setBusy(true); setErr(null);
    const r = await signDayCheck(kind, ITEMS[kind].map((it, i) => ({ text: it.text, done: !!done[i] })), note, firstName(user?.name || user?.email || "Membre"));
    setBusy(false);
    if (r.error) { setErr(r.error); load(); return; }
    load();
  };
  const days = useMemo(() => [...new Set((checks ?? []).map((c) => c.day))].sort().reverse(), [checks]);
  const dayFmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("fr-CA", { weekday: "short", day: "numeric", month: "short" });
  const n = done.filter(Boolean).length;
  const total = ITEMS[kind].length;
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div className="tl-seg">
        <button type="button" aria-pressed={kind === "open"} onClick={() => setKind("open")}>Ouverture</button>
        <button type="button" aria-pressed={kind === "close"} onClick={() => setKind("close")}>Fermeture</button>
      </div>
      {checks === null ? <Wait /> : signed ? (
        <div className="tl-rise">
          <div className="tl-verdict" style={{ alignItems: "center" }}>
            <Ring value={1} total={1} color={color} />
            <div><b>{kind === "open" ? "Journée ouverte" : "Journée fermée"}</b><span>Signée par {signed.byName} à {hm(signed.at)} · {signed.items.filter((i) => i.done).length} sur {signed.items.length} points faits</span></div>
          </div>
          {signed.items.map((it, i) => <Line key={i} icon={it.done ? Check : Clock3} label={<span style={{ color: it.done ? C.t1 : C.t3 }}>{it.text}</span>}>{it.done ? "" : "Non fait"}</Line>)}
          {signed.note && <p style={{ margin: "12px 0 0", fontSize: 14, color: C.t2, whiteSpace: "pre-wrap" }}>{signed.note}</p>}
        </div>
      ) : (
        <div>
          <div className="tl-verdict" style={{ alignItems: "center" }}>
            <Ring value={n} total={total} color={color} />
            <div><b>{n} sur {total}</b><span>{n === total ? "Tout est fait : vous pouvez signer." : kind === "open" ? "Les points pour bien commencer la journée." : "Les points pour bien finir la journée."}</span></div>
          </div>
          {ITEMS[kind].map((it, i) => (
            <label key={i} className="tl-check">
              <input type="checkbox" checked={!!done[i]} onChange={(e) => setDone((d) => d.map((x, j) => (j === i ? e.target.checked : x)))} />
              <span className="tl-box"><svg viewBox="0 0 16 16" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg></span>
              <span className="tl-txt">{it.text}{it.hint && ctx && <span className="tl-hint">{it.hint(ctx)}</span>}</span>
            </label>
          ))}
          <div style={{ marginTop: 16 }}>
            <Field label="Remarque (facultatif)"><TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ce qui reste à surveiller…" /></Field>
          </div>
          <div style={{ marginTop: 14 }}>
            <Button variant="primary" disabled={busy} onClick={() => void sign()}>{busy ? "Signature…" : kind === "open" ? "Signer l'ouverture" : "Signer la fermeture"}</Button>
          </div>
        </div>
      )}
      <Err text={err} />
      {days.length > 0 && (
        <div>
          <p className="tl-k" style={{ marginTop: 10 }}>7 derniers jours</p>
          {days.map((d) => {
            const o = checks!.find((c) => c.day === d && c.kind === "open");
            const c = checks!.find((x) => x.day === d && x.kind === "close");
            const part = (x?: DayCheck) => (x ? `${x.byName} ${hm(x.at)}` : "—");
            return <Line key={d} icon={CalendarDays} label={dayFmt(d)}>Ouverture : {part(o)} · Fermeture : {part(c)}</Line>;
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Règle des 24 heures ─── */
function Rule24({ onOpenOrder, onShowClient }: { onOpenOrder?: (id: string) => void; onShowClient?: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ id: string; name: string; email: string }[]>([]);
  const [who, setWho] = useState<{ id: string; name: string; email: string } | null>(null);
  const [w, setW] = useState<Window24h | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (who) return;
    const t = window.setTimeout(() => { searchClients(q).then(setFound).catch(() => setFound([])); }, 250);
    return () => window.clearTimeout(t);
  }, [q, who]);
  useEffect(() => {
    if (!who) return;
    setW(null); setErr(null);
    lookup24h(who.id).then(setW).catch((e) => setErr(e.message));
  }, [who]);
  const buy = (w?.orders ?? []).filter((o) => o.side === "buy").reduce((s, o) => s + Number(o.cad), 0);
  const sell = (w?.orders ?? []).filter((o) => o.side === "sell").reduce((s, o) => s + Number(o.cad), 0);
  const LIMIT = 10_000;
  const total = useCount(w ? buy + sell : null, 800);
  const max = Math.max(LIMIT * 1.25, buy + sell);
  const over = sell >= LIMIT || buy + sell >= LIMIT;
  return (
    <div style={{ display: "grid", gap: 18 }}>
      {!who ? (
        <>
          <Field label="Client"><TextInput autoFocus placeholder="Nom ou courriel" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
          <div className="tl-rise" key={found.map((c) => c.id).join()}>
            {found.map((c) => (
              <button key={c.id} type="button" className="tl-client" onClick={() => setWho(c)}>
                <UserRound style={{ width: 17, height: 17, color: C.t3, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 14.5, color: C.t1 }}>{c.name || c.email}</span><span style={{ display: "block", fontSize: 12.5, color: C.t3 }}>{c.email}</span></span>
                <ArrowRight className="tl-go" />
              </button>
            ))}
          </div>
          {q.trim().length >= 2 && found.length === 0 && <p style={{ margin: 0, fontSize: 14, color: C.t3 }}>Aucun client trouvé.</p>}
        </>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <UserRound style={{ width: 17, height: 17, color: C.t3 }} />
            <span style={{ fontSize: 15, color: C.t1 }}>{onShowClient ? <button type="button" className="tl-link" onClick={() => onShowClient(who.id)}>{who.name || who.email}</button> : (who.name || who.email)}</span>
            <button type="button" className="tl-swap" style={{ marginLeft: "auto" }} onClick={() => { setWho(null); setW(null); }}><RefreshCw />Changer de client</button>
          </div>
          <Err text={err} />
          {!w && !err && <Wait />}
          {w && (
            <div className="tl-rise">
              <div>
                <p className="tl-k">Depuis {dt.format(new Date(w.since))}</p>
                <p className="tl-big">{cad(total)}</p>
                <div className="tl-gauge" role="img" aria-label={`${cad(buy + sell)} sur un seuil de 10 000 $`}>
                  <i style={{ width: `${Math.min(100, ((buy + sell) / max) * 100)}%` }} />
                  <em style={{ left: `${(LIMIT / max) * 100}%` }} />
                </div>
                <div className="tl-scale"><span style={{ left: 0 }}>0 $</span><span style={{ left: `${(LIMIT / max) * 100}%`, transform: "translateX(-50%)" }}>10 000 $</span></div>
              </div>
              <div style={{ marginTop: 10 }}>
                <Line icon={ArrowDownLeft} label="Achats (le client paie en dollars)">{cad(buy)}</Line>
                <Line icon={ArrowUpRight} label="Ventes (Ooble reçoit de la cryptomonnaie)">{cad(sell)}</Line>
              </div>
              <div className="tl-verdict" style={{ paddingTop: 16 }}>
                {over ? <ShieldAlert style={{ color: C.t1 }} /> : <ShieldCheck style={{ color: C.t1 }} />}
                <div>
                  <b>{sell >= LIMIT ? "Seuil atteint sur les ventes" : over ? "Plus de 10 000 $ sur 24 heures" : "Sous le seuil"}</b>
                  <span>{sell >= LIMIT
                    ? "Une déclaration d'opération importante en monnaie virtuelle est à faire : voir avec la conformité."
                    : over ? "À examiner avec la conformité." : `Encore ${cad(LIMIT - (buy + sell))} avant le seuil de 10 000 $.`}</span>
                </div>
              </div>
              <div>
                <p className="tl-k" style={{ marginTop: 14 }}>Opérations comptées</p>
                {w.orders.length === 0 ? <p style={{ margin: 0, fontSize: 14, color: C.t3 }}>Aucune opération payée sur 24 heures.</p> : w.orders.map((o) => (
                  <Line key={o.id} icon={o.side === "buy" ? ArrowDownLeft : ArrowUpRight}
                    label={<span style={{ color: C.t1 }}>{onOpenOrder ? <button type="button" className="tl-link" onClick={() => onOpenOrder(o.id)}>{orderRef(o.id)}</button> : orderRef(o.id)} <span style={{ color: C.t3 }}>· {o.side === "buy" ? "Achat" : "Vente"} · {dt.format(new Date(o.at))}</span></span>}>
                    {cad(Number(o.cad))}
                  </Line>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─── Taux de la Banque du Canada ─── */
function BocTool() {
  const today = todayMontreal();
  const quick = useMemo<[string, string][]>(() => {
    const shift = (days: number) => new Date(Date.now() - days * 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
    const d = new Date(`${today}T12:00:00`); d.setDate(0);
    return [["Aujourd'hui", today], ["Hier", shift(1)], ["Il y a 7 jours", shift(7)], ["Fin du mois dernier", d.toLocaleDateString("en-CA")]];
  }, [today]);
  const [date, setDate] = useState(today);
  const [res, setRes] = useState<{ date: string; rate: number; asked: string } | null>(null);
  const [ours, setOurs] = useState<LatestRate | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (d: string) => {
    setDate(d); setBusy(true); setErr(null);
    try { setRes(await fetchBocRate(d)); } catch (e) { setRes(null); setErr((e as Error).message); }
    setBusy(false);
  };
  useEffect(() => { void run(today); fetchLatestRate().then(setOurs).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useCount(res?.rate ?? null, 700);
  const gap = res && ours?.market ? (ours.market / res.rate - 1) * 100 : null;
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div className="tl-chips">{quick.map(([l, d]) => <button key={l} type="button" aria-pressed={date === d} onClick={() => void run(d)}>{l}</button>)}</div>
      <Field label="Ou une date précise">
        <TextInput type="date" value={date} max={today} onChange={(e) => { if (e.target.value) void run(e.target.value); else setDate(""); }} />
      </Field>
      {busy && !res && <Wait />}
      <Err text={err} />
      {res && (
        <div style={{ opacity: busy ? 0.5 : 1, transition: "opacity .2s" }}>
          <p className="tl-k">Taux officiel</p>
          <p className="tl-big">1 USD = {rate4(shown)} $</p>
          <div style={{ marginTop: 16 }}>
            <Line icon={CalendarDays} label="Publié le">{new Date(`${res.date}T12:00:00`).toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</Line>
            {res.date !== res.asked && <Line icon={Clock3} label="Remarque">Pas de taux ce jour-là : dernier taux publié avant</Line>}
            {ours?.market != null && date === today && <Line icon={Network} label="Notre cours du marché (USDC)"><Coin id="usdc" size={18} />{rate4(ours.market)} $</Line>}
            {gap != null && date === today && <Line icon={ArrowDownUp} label="Écart">{gap >= 0 ? "+" : ""}{num(gap, 2)} %</Line>}
          </div>
          <p style={{ margin: "14px 0 0", fontSize: 12.5, color: C.t3 }}>Source : Banque du Canada. Taux publié les jours ouvrables vers 16 h 30 (heure de l'Est).</p>
        </div>
      )}
    </div>
  );
}
