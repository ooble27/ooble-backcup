/**
 * Outils de l'équipe (Ressources › Outils) : les petits outils du quotidien, chacun avec son dessin animé.
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
  FAMILY_NETS, NET_NAME, addressFamily, fetchBocRate, fetchDayChecks, fetchDayContext, hashFamily, lookup24h, lookupAddress, lookupTx, signDayCheck, todayMontreal,
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
/** Couleur de chaque réseau, pour les pastilles. */
const NET_COLOR: Record<string, string> = { bep20: "#F0B90B", polygon: "#8247E5", avalanche: "#E84142", spl: "#14F195", trc20: "#EB0029", erc20: "#627EEA" };

const CSS = `
.tl-wrap { font-family: ${FONT}; max-width: 980px; }
.tl-eyebrow { margin: 0; font-size: 11.5px; font-weight: 500; letter-spacing: .08em; text-transform: uppercase; color: var(--a-t3); }
.tl-live { display: flex; flex-wrap: wrap; margin: 4px 0 30px; border-top: 1px solid var(--a-bds); border-bottom: 1px solid var(--a-bds); }
.tl-live > div { flex: 1 1 200px; padding: 14px 18px 14px 0; display: flex; gap: 12px; align-items: center; min-width: 0; }
.tl-live > div + div { padding-left: 18px; border-left: 1px solid var(--a-bds); }
.tl-live b { display: block; font-size: 15px; font-weight: 600; color: var(--a-t1); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tl-live small { display: block; font-size: 12px; color: var(--a-t3); margin-top: 1px; }
.tl-pulse { position: relative; width: 8px; height: 8px; border-radius: 50%; background: var(--a-vzGreen); flex-shrink: 0; }
.tl-pulse::after { content: ""; position: absolute; inset: 0; border-radius: 50%; background: inherit; animation: tl-ping 2s cubic-bezier(0,0,.2,1) infinite; }
.tl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); border-top: 1px solid var(--a-bds); border-left: 1px solid var(--a-bds); }
.tl-tile { all: unset; box-sizing: border-box; position: relative; display: flex; flex-direction: column; gap: 6px; padding: 22px 22px 18px; min-height: 236px;
  border-right: 1px solid var(--a-bds); border-bottom: 1px solid var(--a-bds); cursor: pointer; font-family: inherit; overflow: hidden;
  animation: tl-up .55s cubic-bezier(.22,1,.36,1) both; animation-delay: calc(var(--i) * 60ms); }
.tl-tile::before { content: ""; position: absolute; left: 0; top: 0; height: 2px; width: 100%; background: var(--c); transform: scaleX(0); transform-origin: left; transition: transform .45s cubic-bezier(.22,1,.36,1); }
.tl-tile:hover::before, .tl-tile:focus-visible::before { transform: scaleX(1); }
.tl-tile:focus-visible { outline: 2px solid var(--a-accent); outline-offset: -2px; }
.tl-tile .tl-art { margin-bottom: 10px; }
.tl-tile-name { font-size: 16.5px; font-weight: 500; color: var(--a-t1); letter-spacing: -0.01em; }
.tl-tile-desc { font-size: 13px; line-height: 1.5; color: var(--a-t3); }
.tl-tile-foot { margin-top: auto; padding-top: 12px; display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--a-t2); font-variant-numeric: tabular-nums; min-width: 0; }
.tl-tile-foot > span { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tl-go { width: 16px; height: 16px; color: var(--a-t3); transition: transform .3s cubic-bezier(.22,1,.36,1), color .3s; flex-shrink: 0; }
.tl-tile:hover .tl-go { transform: translateX(4px); color: var(--a-t1); }
.tl-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.tl-nets { display: inline-flex; flex-wrap: wrap; gap: 4px 12px; align-items: center; }
.tl-nets > span { display: inline-flex; align-items: center; gap: 6px; }

/* Les dessins : immobiles au repos, animés au survol ou à l'ouverture d'un outil. */
.tl-art { display: block; overflow: visible; }
.tl-art .s { stroke: var(--a-t1); }
.tl-art .k { stroke: var(--c); }
.tl-art .f { fill: var(--c); }
.tl-art * { transform-box: view-box; }
@media (prefers-reduced-motion: no-preference) {
  .tl-tile:hover .tl-art .a1, .tl-art.play .a1 { animation: var(--a1); }
  .tl-tile:hover .tl-art .a2, .tl-art.play .a2 { animation: var(--a2); }
  .tl-tile:hover .tl-art .a3, .tl-art.play .a3 { animation: var(--a3); }
  .tl-tile:hover .tl-art .a4, .tl-art.play .a4 { animation: var(--a4); }
  .tl-rise > * { animation: tl-up .5s cubic-bezier(.22,1,.36,1) both; }
  .tl-rise > *:nth-child(2) { animation-delay: 60ms; } .tl-rise > *:nth-child(3) { animation-delay: 120ms; }
  .tl-rise > *:nth-child(4) { animation-delay: 180ms; } .tl-rise > *:nth-child(5) { animation-delay: 240ms; }
  .tl-rise > *:nth-child(6) { animation-delay: 300ms; } .tl-rise > *:nth-child(n+7) { animation-delay: 360ms; }
}
@media (prefers-reduced-motion: reduce) { .tl-tile, .tl-pulse::after { animation: none; } }
@keyframes tl-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes tl-ping { 75%, 100% { transform: scale(2.4); opacity: 0; } }
@keyframes tl-swapA { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(20px); } }
@keyframes tl-swapB { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(-20px); } }
@keyframes tl-fade { 0%, 100% { opacity: 1; } 50% { opacity: .2; } }
@keyframes tl-scan { 0%, 100% { transform: translate(0, 0); } 35% { transform: translate(-18px, -8px); } 70% { transform: translate(-6px, -14px); } }
@keyframes tl-hop { 0%, 100% { transform: translateY(0); } 40% { transform: translateY(-6px); } }
@keyframes tl-draw { from { stroke-dashoffset: 12; } to { stroke-dashoffset: 0; } }
@keyframes tl-rise { 0% { transform: translateY(8px); } 100% { transform: translateY(0); } }
@keyframes tl-turn { to { transform: rotate(360deg); } }
@keyframes tl-wave { 0%, 100% { transform: skewY(0); } 25% { transform: skewY(-8deg); } 75% { transform: skewY(6deg); } }
@keyframes tl-tick { from { stroke-dashoffset: 24; } to { stroke-dashoffset: 0; } }

/* Le contenu des outils. */
.tl-head { display: flex; gap: 16px; align-items: center; padding-bottom: 18px; margin-bottom: 20px; border-bottom: 1px solid var(--a-bds); }
.tl-head p { margin: 0; font-size: 13.5px; line-height: 1.55; color: var(--a-t2); }
.tl-k { font-size: 11.5px; letter-spacing: .07em; text-transform: uppercase; color: var(--a-t3); margin: 0 0 8px; }
.tl-big { margin: 0; font-size: 34px; font-weight: 600; letter-spacing: -0.04em; color: var(--a-t1); font-variant-numeric: tabular-nums; line-height: 1.1; overflow-wrap: anywhere; }
.tl-line { display: flex; align-items: center; gap: 12px; padding: 11px 0; border-bottom: 1px solid var(--a-bds); font-size: 14px; min-width: 0; }
.tl-line > svg { width: 16px; height: 16px; color: var(--a-t3); flex-shrink: 0; }
.tl-line > .l { color: var(--a-t3); min-width: 0; }
.tl-line > .v { margin-left: auto; color: var(--a-t1); text-align: right; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; min-width: 0; }
.tl-verdict { display: flex; gap: 14px; align-items: flex-start; padding: 4px 0 16px; }
.tl-verdict > svg { width: 26px; height: 26px; flex-shrink: 0; margin-top: 1px; }
.tl-verdict b { display: block; font-size: 17px; font-weight: 600; color: var(--a-t1); letter-spacing: -0.01em; }
.tl-verdict span { display: block; margin-top: 3px; font-size: 13.5px; line-height: 1.5; color: var(--a-t2); }
.tl-link { all: unset; cursor: pointer; color: var(--a-t1); text-decoration: underline; text-underline-offset: 4px; text-decoration-color: color-mix(in srgb, currentColor 40%, transparent); }
.tl-link:hover { text-decoration-color: currentColor; }
.tl-ext { display: inline-flex; align-items: center; gap: 6px; font-size: 13.5px; color: var(--a-t1); text-decoration: none; padding: 6px 0; }
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
@media (max-width: 600px) {
  .tl-live > div { flex-basis: 100%; padding: 12px 0; }
  .tl-live > div + div { padding-left: 0; border-left: 0; border-top: 1px solid var(--a-bds); }
  .tl-grid { grid-template-columns: 1fr; }
  .tl-tile { display: grid; grid-template-columns: 52px 1fr; column-gap: 14px; row-gap: 4px; min-height: 0; padding: 18px 16px; }
  .tl-tile .tl-art { grid-row: span 4; margin: 0; width: 52px; height: 52px; }
  .tl-tile-foot { padding-top: 6px; }
}
`;

const cad = (n: number) => `${n.toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
const num = (n: number, d = 2) => n.toLocaleString("fr-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
const rate4 = (n: number) => n.toLocaleString("fr-CA", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const dt = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const hm = (iso: string) => new Date(iso).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });
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

/* ─── Les dessins des outils ─── */
function ToolArt({ id, color, size = 64, play = false }: { id: ToolId; color: string; size?: number; play?: boolean }) {
  const common = { className: `tl-art${play ? " play" : ""}`, width: size, height: size, viewBox: "0 0 64 64", fill: "none", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  const v = (o: Record<string, string>) => ({ ...common, style: { "--c": color, ...o } as React.CSSProperties });
  switch (id) {
    case "convert": return (
      <svg {...v({ "--a1": "tl-swapA 1.1s cubic-bezier(.65,0,.35,1)", "--a2": "tl-swapB 1.1s cubic-bezier(.65,0,.35,1)", "--a3": "tl-fade 1.1s ease" })}>
        <g className="a3"><path className="s" d="M20 18c6-8 18-8 24 0" /><path className="s" d="M40 13l4 5-6 1" /><path className="s" d="M44 46c-6 8-18 8-24 0" /><path className="s" d="M24 51l-4-5 6-1" /></g>
        <g className="a1"><circle className="f" cx="21" cy="32" r="9" /></g>
        <g className="a2"><circle className="s" cx="43" cy="32" r="9" /><path className="s" d="M43 26v12M46 29.5c-.6-1-1.7-1.5-3-1.5-1.7 0-3 .9-3 2.2 0 2.8 6 1.4 6 4.3 0 1.3-1.3 2.3-3 2.3-1.4 0-2.6-.6-3.2-1.6" strokeWidth="1.6" /></g>
      </svg>
    );
    case "address": return (
      <svg {...v({ "--a1": "tl-scan 1.4s cubic-bezier(.65,0,.35,1)" })}>
        <rect className="s" x="6" y="16" width="40" height="30" rx="4" />
        <path className="s" d="M6 24h40" />
        <path className="s" d="M34 30h12v10H34a5 5 0 0 1 0-10z" />
        <circle className="f" cx="36" cy="35" r="2" />
        <g className="a1"><circle className="k" cx="46" cy="44" r="8" strokeWidth="3" /><path className="k" d="M52 50l6 6" strokeWidth="3" /></g>
      </svg>
    );
    case "tx": return (
      <svg {...v({ "--a1": "tl-hop .6s ease", "--a2": "tl-hop .6s ease .15s", "--a3": "tl-hop .6s ease .3s", "--a4": "tl-draw .6s ease" })}>
        <path className="k a4" d="M19 32h7M38 32h7" strokeWidth="3" strokeDasharray="3 3" />
        <g className="a1"><rect className="s" x="5" y="25" width="14" height="14" rx="2" /></g>
        <g className="a2"><rect className="f" x="25" y="23" width="14" height="18" rx="2" /><path d="M29 30h6M29 34h4" stroke="var(--a-l1)" strokeWidth="1.8" /></g>
        <g className="a3"><rect className="s" x="45" y="25" width="14" height="14" rx="2" /></g>
      </svg>
    );
    case "day": return (
      <svg {...v({ "--a1": "tl-rise 1s cubic-bezier(.22,1,.36,1)", "--a2": "tl-turn 6s linear" })}>
        <defs><clipPath id={`tl-sky-${size}`}><rect x="0" y="0" width="64" height="44" /></clipPath></defs>
        <g clipPath={`url(#tl-sky-${size})`}><g className="a1"><circle className="f" cx="32" cy="44" r="11" /></g></g>
        <g className="a2" style={{ transformOrigin: "32px 44px" }}>
          <path className="k" d="M32 26v-8M19 31l-5-5M45 31l5-5M14 40H7M50 40h7" />
        </g>
        <path className="s" d="M4 44h56M14 52h36" />
      </svg>
    );
    case "rule24": return (
      <svg {...v({ "--a1": "tl-turn 1.2s cubic-bezier(.65,0,.35,1)" })}>
        <circle className="s" cx="32" cy="32" r="22" />
        <path className="k" d="M32 10a22 22 0 0 1 22 22" strokeWidth="3.5" />
        <path className="s" d="M32 14v3M50 32h-3M32 50v-3M14 32h3" />
        <path className="s" d="M32 32h9" />
        <g className="a1" style={{ transformOrigin: "32px 32px" }}><path className="s" d="M32 32V19" strokeWidth="2.5" /></g>
        <circle className="f" cx="32" cy="32" r="2.5" />
      </svg>
    );
    case "boc": return (
      <svg {...v({ "--a1": "tl-wave 1.2s ease-in-out" })}>
        <path className="s" d="M32 18V5" />
        <g className="a1" style={{ transformOrigin: "32px 9px" }}><path className="f" d="M32 5h13l-3 4 3 4H32z" /></g>
        <path className="s" d="M8 28l24-10 24 10z" />
        <path className="s" d="M12 32h40M16 34v13M26 34v13M38 34v13M48 34v13M10 51h44M8 56h48" />
      </svg>
    );
  }
}

export default function ToolsPanel({ onOpenOrder, onShowClient }: { onOpenOrder?: (id: string) => void; onShowClient?: (id: string) => void }) {
  const { roles } = useAuth();
  const [open, setOpen] = useState<ToolId | null>(null);
  const [rate, setRate] = useState<LatestRate | null>(null);
  const [checks, setChecks] = useState<DayCheck[] | null>(null);
  const [ctx, setCtx] = useState<DayContext | null>(null);
  const sym = primaryAsset(getAppSettingsNow()).symbol;
  const can = (t: ToolDef) => !t.roles || roles.includes("admin") || t.roles.some((r) => roles.includes(r as never));
  const tools = TOOLS.filter(can);
  const tool = TOOLS.find((t) => t.id === open);
  // Ouvrir une commande ou une fiche depuis un outil ferme d'abord le volet.
  const goOrder = onOpenOrder ? (id: string) => { setOpen(null); onOpenOrder(id); } : undefined;
  const goClient = onShowClient ? (id: string) => { setOpen(null); onShowClient(id); } : undefined;

  // Le bandeau en direct : taux, journée, file.
  useEffect(() => {
    const r = () => fetchLatestRate().then(setRate).catch(() => {});
    r();
    const t = window.setInterval(r, 30_000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    if (open) return;
    fetchDayChecks(1).then(setChecks).catch(() => {});
    fetchDayContext().then(setCtx).catch(() => {});
  }, [open]);
  const today = todayMontreal();
  const opened = checks?.find((c) => c.day === today && c.kind === "open");
  const closed = checks?.find((c) => c.day === today && c.kind === "close");
  const dayText = closed ? `Fermée par ${closed.byName} à ${hm(closed.at)}` : opened ? `Ouverte par ${opened.byName} à ${hm(opened.at)}` : "Ouverture à signer";
  const buyShown = useCount(rate?.buy ?? null);

  const foot = (t: ToolDef): React.ReactNode => {
    switch (t.id) {
      case "convert": return rate ? <span>1 {sym} = {rate4(rate.buy)} $ à l'achat</span> : <span>Taux du moment</span>;
      case "address": return <span className="tl-nets">{OPEN_NETS.map((n) => <span key={n}><i className="tl-dot" style={{ background: NET_COLOR[n] }} />{NET_NAME[n]}</span>)}</span>;
      case "tx": return <span>Envois, dépôts et hash déclarés</span>;
      case "day": return <span>{checks ? dayText : "…"}</span>;
      case "rule24": return <span>Seuil : 10 000 $ sur 24 heures</span>;
      case "boc": return <span>Publié les jours ouvrables vers 16 h 30</span>;
    }
  };

  return (
    <div className="tl-wrap">
      <style>{CSS}</style>
      <div className="tl-live">
        <div>
          <span className="tl-pulse" aria-hidden />
          <span style={{ minWidth: 0 }}><b>{rate ? `${rate4(buyShown)} $` : "…"}</b><small>1 {sym} à l'achat, en direct</small></span>
        </div>
        <div>
          <CalendarDays style={{ width: 18, height: 18, color: C.t3, flexShrink: 0 }} />
          <span style={{ minWidth: 0 }}><b>{checks ? dayText : "…"}</b><small>La journée d'aujourd'hui</small></span>
        </div>
        <div>
          <ShoppingCart style={{ width: 18, height: 18, color: C.t3, flexShrink: 0 }} />
          <span style={{ minWidth: 0 }}><b>{ctx ? `${ctx.queue} commande${ctx.queue > 1 ? "s" : ""} payée${ctx.queue > 1 ? "s" : ""}` : "…"}</b><small>En attente d'envoi</small></span>
        </div>
      </div>

      <div className="tl-grid">
        {tools.map((t, i) => (
          <button key={t.id} type="button" className="tl-tile" style={{ "--i": i, "--c": t.color } as React.CSSProperties} onClick={() => setOpen(t.id)}>
            <ToolArt id={t.id} color={t.color} />
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
            <div className="tl-head"><ToolArt id={tool.id} color={tool.color} size={56} play /><p>{tool.how}</p></div>
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
  <span className="tl-nets">{ids.map((n) => <span key={n}><i className="tl-dot" style={{ background: NET_COLOR[n] ?? C.t3 }} />{NET_NAME[n] ?? n}</span>)}</span>
);
const Explorers = ({ fam, base, value }: { fam: keyof typeof FAMILY_NETS; base: "tx" | "addr"; value: string }) => (
  <div>
    <p className="tl-k" style={{ marginTop: 22 }}>Voir sur l'explorateur</p>
    <div className="tl-nets" style={{ gap: "2px 18px" }}>
      {netsOf(fam).map((n) => (
        <a key={n.id} className="tl-ext" href={n[base] + value.trim()} target="_blank" rel="noreferrer">
          <i className="tl-dot" style={{ background: NET_COLOR[n.id] }} />{n.name}<ExternalLink />
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
          <p className="tl-big">{out == null ? "—" : unit === "cad" ? `${num(shown, 2)} ${sym}` : cad(shown)}</p>
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
              <Line icon={Landmark} label="Montant">{num(Number(h.amount), 2)} {String(h.asset).toUpperCase()}</Line>
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
            {ours?.market != null && date === today && <Line icon={Network} label="Notre cours du marché (USDC)">{rate4(ours.market)} $</Line>}
            {gap != null && date === today && <Line icon={ArrowDownUp} label="Écart">{gap >= 0 ? "+" : ""}{num(gap, 2)} %</Line>}
          </div>
          <p style={{ margin: "14px 0 0", fontSize: 12.5, color: C.t3 }}>Source : Banque du Canada. Taux publié les jours ouvrables vers 16 h 30 (heure de l'Est).</p>
        </div>
      )}
    </div>
  );
}
