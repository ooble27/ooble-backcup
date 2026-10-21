/**
 * Outils de l'équipe (Ressources › Outils) : les petits outils du quotidien, chacun avec sa scène animée.
 * Chacun ne voit que ceux de ses rôles ; chaque outil s'ouvre en volet, sans quitter la page.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeft, ArrowDownUp, ArrowRight, ArrowUpRight, Building2, CalendarDays, Check, Clock3, Coins, Copy, ExternalLink, Hash, Landmark, Loader2,
  Network, RefreshCw, Search, Send, ShieldAlert, ShieldCheck, ShoppingCart, UserRound, Users,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/lib/auth";
import { OLI_DEFAULTS, fetchOli, type OliSettings } from "@/lib/oli";
import { supabase } from "@/integrations/supabase/client";
import { fetchLatestRate, type LatestRate } from "@/lib/adminTools";
import { getAppSettingsNow } from "@/lib/settings";
import { primaryAsset } from "@/lib/assets";
import { orderRef } from "@/lib/orders";
import { firstName, searchClients } from "@/lib/teamSpace";
import {
  FAMILY_NETS, NET_NAME, addressFamily, fetchBocRate, fetchDayChecks, fetchDayContext, hashFamily, fetchRateHistory, lookup24h, lookupOrder, matchInterac, parseInterac, clientWindow, stockForecast, marginBase, readMrz, bnValid, lookupAddress, lookupTx, signDayCheck, todayMontreal,
  type AddressReport, type ClientWindow, type InteracHit, type MarginBase, type OrderInfo, type StockLine, type DayCheck, type DayContext, type DayKind, type TxReport, type Window24h,
} from "@/lib/teamTools";
import { C, FONT } from "./adminTheme";
import { Button, Field, SidePanel, TextArea, TextInput } from "./ui";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

type ToolId = "convert" | "address" | "tx" | "day" | "rule24" | "boc" | "interac" | "refund" | "payout" | "status" | "mrz" | "business" | "age" | "draft" | "calendar" | "links" | "margin" | "stock" | "sim";
interface ToolDef { id: ToolId; group: string; name: string; desc: string; how: string; color: string; roles?: string[]; foot?: string }
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
  { id: "interac", group: "Opérations", name: "Rapprochement Interac", color: C.coral, roles: ["operator", "accounting"], foot: "Montant, référence et nom",
    desc: "Un avis Interac collé : l'achat qui correspond, du plus probable au moins probable.",
    how: "Collez l'avis Interac : l'outil lit le montant, la référence et le nom, puis cherche l'achat." },
  { id: "refund", group: "Opérations", name: "Remboursement", color: C.vzGreen, roles: ["operator", "support"], foot: "Montant et message en français ou en anglais",
    desc: "Le montant exact à rembourser et le message au client, prêt à envoyer.",
    how: "Entrez la référence de la commande : le montant et le message au client sont prêts." },
  { id: "payout", group: "Opérations", name: "Versement d'une vente", color: C.sun, roles: ["operator"], foot: "Chaque champ se copie d'un clic",
    desc: "Le virement Interac d'une vente, déjà rempli : montant, courriel, question, message.",
    how: "Entrez la référence de la vente : tout le virement Interac est prêt à copier." },
  { id: "stock", group: "Opérations", name: "Prévision du stock", color: C.vzIndigo, roles: ["operator", "accounting"], foot: "Au rythme des 7 derniers jours",
    desc: "Le stock de chaque réseau, et le jour où il sera vide à ce rythme.",
    how: "Le stock de chaque réseau et le jour où il sera vide, au rythme de la dernière semaine." },
  { id: "mrz", group: "Vérification", name: "Lecteur de passeport", color: C.sage, roles: ["kyc_reviewer", "compliance"], foot: "Les 4 clés de contrôle",
    desc: "Les 2 lignes du bas d'un passeport : identité, dates et clés de contrôle.",
    how: "Collez les 2 lignes du bas du passeport : l'outil vérifie chaque clé de contrôle." },
  { id: "business", group: "Vérification", name: "Numéro d'entreprise", color: C.vzGreen, roles: ["kyc_reviewer", "compliance"], foot: "NEQ et numéro fédéral",
    desc: "Le format d'un NEQ ou d'un numéro fédéral, et le lien vers le registre officiel.",
    how: "Entrez le numéro : l'outil vérifie son format et ouvre le bon registre." },
  { id: "age", group: "Vérification", name: "Âge et expiration", color: C.sun, roles: ["kyc_reviewer", "compliance"], foot: "Selon les réglages d'Oli",
    desc: "L'âge du client, la validité de sa pièce et la date de son justificatif de domicile.",
    how: "Entrez les dates : l'outil applique les mêmes seuils qu'Oli." },
  { id: "draft", group: "Conformité", name: "Brouillon de déclaration", color: C.coral, roles: ["compliance"], foot: "Prêt à relire et compléter",
    desc: "La déclaration d'opération douteuse préremplie : client, opérations, chronologie.",
    how: "Choisissez un client et une période : le brouillon reprend son profil et ses opérations." },
  { id: "calendar", group: "Conformité", name: "Calendrier des obligations", color: C.vzIndigo, roles: ["compliance"], foot: "Échéances et délais",
    desc: "Les échéances du programme de conformité et les délais de déclaration.",
    how: "Les échéances ouvertes du programme, puis les délais de chaque déclaration au CANAFE." },
  { id: "status", group: "Support", name: "Suivi de commande pour le client", color: C.sage, roles: ["support", "operator"], foot: "En français ou en anglais",
    desc: "La situation d'une commande en une phrase simple, à copier dans la réponse.",
    how: "Entrez la référence : la phrase à envoyer au client est prête, dans sa langue." },
  { id: "links", group: "Marketing", name: "Lien suivi et code QR", color: C.sun, roles: ["marketing"], foot: "Lien et code QR à télécharger",
    desc: "Un lien vers ooble.ca avec sa source, et son code QR pour les affiches.",
    how: "Choisissez la page et la source : le lien suivi et son code QR sont prêts." },
  { id: "margin", group: "Comptabilité", name: "Marge réelle d'une commande", color: C.vzGreen, roles: ["accounting"], foot: "Au cours du marché du moment",
    desc: "Ce qu'une commande a rapporté, comparé au cours du marché à sa création.",
    how: "Entrez la référence : la marge brute de la commande, au cours du marché de ce moment-là." },
  { id: "sim", group: "Administrateur", name: "Simulateur de marge", color: C.coral, roles: ["admin"], foot: "Rien n'est modifié",
    desc: "L'effet d'une autre marge sur le revenu des derniers jours.",
    how: "Déplacez les curseurs : le revenu de la période, recalculé avec la nouvelle marge." },
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
.tl-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-bottom: 1px solid var(--a-bds); margin-bottom: 34px; }
.tl-stats > div { padding: 14px 18px 14px 0; display: flex; gap: 12px; align-items: center; min-width: 0; }
.tl-stats > div + div { padding-left: 18px; border-left: 1px solid var(--a-bds); }
.tl-stats b { display: block; font-size: 14.5px; font-weight: 600; color: var(--a-t1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
.tl-stats small { display: block; font-size: 12px; color: var(--a-t3); margin-top: 1px; }
.tl-netrow { display: flex; }
.tl-netrow img { margin-left: -6px; box-shadow: 0 0 0 2px var(--a-bg); border-radius: 50%; }
.tl-netrow img:first-child { margin-left: 0; }

/* Les sections par poste. */
.tl-group { margin-top: 34px; }
.tl-group:first-of-type { margin-top: 0; }
.tl-gh { margin: 0 0 12px; font-size: 18px; font-weight: 600; letter-spacing: -0.02em; color: var(--a-t1); }
.tl-ready { margin: 8px 0 0; padding: 14px 0 0; border-top: 1px solid var(--a-bds); white-space: pre-wrap; overflow-wrap: anywhere; font-family: inherit; font-size: 13.5px; line-height: 1.6; color: var(--a-t1); }
.tl-range { width: 100%; margin: 10px 0 6px; accent-color: var(--c); }
/* Les tuiles : une illustration, puis le nom. */
.tl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); border-top: 1px solid var(--a-bds); border-left: 1px solid var(--a-bds); }
.tl-tile { all: unset; box-sizing: border-box; position: relative; display: flex; flex-direction: column; gap: 6px; padding: 8px 22px 18px; min-height: 300px;
  border-right: 1px solid var(--a-bds); border-bottom: 1px solid var(--a-bds); cursor: pointer; font-family: inherit; overflow: hidden;
  animation: tl-up .6s cubic-bezier(.22,1,.36,1) both; animation-delay: calc(var(--i) * 70ms); }
.tl-tile::before { content: ""; position: absolute; left: 0; top: 0; height: 2px; width: 100%; background: var(--c); transform: scaleX(0); transform-origin: left; transition: transform .5s cubic-bezier(.22,1,.36,1); z-index: 1; }
.tl-tile:hover::before, .tl-tile:focus-visible::before { transform: scaleX(1); }
.tl-tile:focus-visible { outline: 2px solid var(--a-accent); outline-offset: -2px; }
.tl-tile-name { font-size: 16.5px; font-weight: 500; color: var(--a-t1); letter-spacing: -0.01em; margin-top: 2px; }
.tl-tile-desc { font-size: 13px; line-height: 1.5; color: var(--a-t3); }
.tl-tile-foot { margin-top: auto; padding-top: 12px; display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--a-t2); font-variant-numeric: tabular-nums; min-width: 0; }
.tl-tile-foot > span { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tl-go { width: 16px; height: 16px; color: var(--a-t3); transition: transform .3s cubic-bezier(.22,1,.36,1), color .3s; flex-shrink: 0; }
.tl-tile:hover .tl-go { transform: translateX(4px); color: var(--a-t1); }
.tl-nets { display: inline-flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; }
.tl-nets > span { display: inline-flex; align-items: center; gap: 7px; }

/* L'illustration : immobile, elle s'avance un peu au survol. */
.tl-art { margin: 6px -10px 6px; aspect-ratio: 760 / 470; overflow: hidden; }
.tl-art img { display: block; width: 100%; height: auto; aspect-ratio: 760 / 580; margin-top: -4%; transition: transform .7s cubic-bezier(.22,1,.36,1); transform-origin: 50% 70%; }
.tl-tile:hover .tl-art img { transform: scale(1.045) translateY(-4px); }
.tl-art-panel { margin: -8px auto 10px; max-width: 360px; }
.tl-art-panel img { animation: tl-up .6s cubic-bezier(.22,1,.36,1) both; }
@media (prefers-reduced-motion: no-preference) {
  .tl-rise > * { animation: tl-up .5s cubic-bezier(.22,1,.36,1) both; }
  .tl-rise > *:nth-child(2) { animation-delay: 60ms; } .tl-rise > *:nth-child(3) { animation-delay: 120ms; }
  .tl-rise > *:nth-child(4) { animation-delay: 180ms; } .tl-rise > *:nth-child(5) { animation-delay: 240ms; }
  .tl-rise > *:nth-child(6) { animation-delay: 300ms; } .tl-rise > *:nth-child(n+7) { animation-delay: 360ms; }
}
@media (prefers-reduced-motion: reduce) { .tl-wrap *, .tl-wrap *::after, { animation: none !important; } .tl-spark-path { stroke-dashoffset: 0; } .tl-spark-area { opacity: 1; } }
@keyframes tl-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
@keyframes tl-ping { 75%, 100% { transform: scale(2.4); opacity: 0; } }
@keyframes tl-halo { 0% { transform: scale(.9); opacity: 1; } 100% { transform: scale(1.35); opacity: 0; } }
@keyframes tl-drawline { to { stroke-dashoffset: 0; } }
@keyframes tl-fadein { to { opacity: 1; } }
@keyframes tl-beat { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.5); } }
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

/* ─── L'illustration de chaque outil, dans le style des illustrations d'Ooble ─── */
const Art = ({ id, panel = false }: { id: ToolId; panel?: boolean }) => (
  <div className={`tl-art${panel ? " tl-art-panel" : ""}`} aria-hidden>
    <img src={`/illustrations/admin/tools/${id}.svg`} alt="" draggable={false} />
  </div>
);

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
  const groups = [...new Set(tools.map((t) => t.group))].map((name) => ({ name, tools: tools.filter((t) => t.group === name) }));
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

  const foot = (t: ToolDef): React.ReactNode => {
    switch (t.id) {
      case "convert": return rate ? <span>1 {sym} = {rate4(rate.buy)} $ à l'achat</span> : <span>Taux du moment</span>;
      case "address": return <span>BNB Chain, Polygon, Avalanche et Solana</span>;
      case "tx": return <span>Envois, dépôts et hash déclarés</span>;
      case "day": return <span>{checks ? dayText : "…"}</span>;
      case "rule24": return <span>Seuil : 10 000 $ sur 24 heures</span>;
      case "boc": return <span>Publié les jours ouvrables vers 16 h 30</span>;
      default: return <span>{t.foot}</span>;
    }
  };

  return (
    <div className="tl-wrap">
      <style>{CSS}</style>
      <section className="tl-hero">
        <div>
          <div className="tl-pair">
            <span className="tl-coinwrap"><Coin id={a.id} size={44} /></span>
            <span><b>{sym} / CAD</b><small>Taux à l'achat</small></span>
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

      {groups.map((g) => (
        <section key={g.name} className="tl-group">
          <h2 className="tl-gh">{g.name}</h2>
          <div className="tl-grid">
            {g.tools.map((t, i) => (
              <button key={t.id} type="button" className="tl-tile" style={{ "--i": i, "--c": t.color } as React.CSSProperties} onClick={() => setOpen(t.id)}>
                <Art id={t.id} />
                <span className="tl-tile-name">{t.name}</span>
                <span className="tl-tile-desc">{t.desc}</span>
                <span className="tl-tile-foot">{foot(t)}<ArrowRight className="tl-go" /></span>
              </button>
            ))}
          </div>
        </section>
      ))}

      {tool && (
        <SidePanel title={tool.name} subtitle={tool.group} onClose={() => setOpen(null)} width={560}>
          <style>{CSS}</style>
          <div style={{ "--c": tool.color } as React.CSSProperties}>
            <div className="tl-head"><Art id={tool.id} panel /><p>{tool.how}</p></div>
            {tool.id === "convert" && <Converter />}
            {tool.id === "address" && <AddressTool onShowClient={goClient} />}
            {tool.id === "tx" && <TxTool onOpenOrder={goOrder} />}
            {tool.id === "day" && <DayChecklist color={tool.color} />}
            {tool.id === "rule24" && <Rule24 onOpenOrder={goOrder} onShowClient={goClient} />}
            {tool.id === "boc" && <BocTool />}
            {tool.id === "interac" && <InteracTool onOpenOrder={goOrder} />}
            {tool.id === "refund" && <RefundTool onOpenOrder={goOrder} />}
            {tool.id === "payout" && <PayoutTool onOpenOrder={goOrder} />}
            {tool.id === "status" && <StatusTool onOpenOrder={goOrder} />}
            {tool.id === "mrz" && <MrzTool />}
            {tool.id === "business" && <BusinessTool />}
            {tool.id === "age" && <AgeTool />}
            {tool.id === "draft" && <DraftTool onOpenOrder={goOrder} onShowClient={goClient} />}
            {tool.id === "calendar" && <CalendarTool />}
            {tool.id === "links" && <LinksTool />}
            {tool.id === "margin" && <MarginTool onOpenOrder={goOrder} />}
            {tool.id === "stock" && <StockTool />}
            {tool.id === "sim" && <SimTool />}
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

/* ═══ Deuxième série ═══ */

/** Copier un texte, avec « Copié » un instant. */
function CopyBtn({ text, label = "Copier" }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="tl-swap" onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setOk(true); window.setTimeout(() => setOk(false), 1600); }); }}>
      {ok ? <Check /> : <Copy />}{ok ? "Copié" : label}
    </button>
  );
}
/** Un texte prêt à copier, dans une zone de lecture. */
const Ready = ({ title, text }: { title: string; text: string }) => (
  <div>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 20 }}>
      <p className="tl-k" style={{ margin: 0 }}>{title}</p><CopyBtn text={text} />
    </div>
    <pre className="tl-ready">{text}</pre>
  </div>
);
const LangSwitch = ({ lang, set }: { lang: "fr" | "en"; set: (l: "fr" | "en") => void }) => (
  <div className="tl-chips">{(["fr", "en"] as const).map((l) => <button key={l} type="button" aria-pressed={lang === l} onClick={() => set(l)}>{l === "fr" ? "Français" : "English"}</button>)}</div>
);
const SIDE = { buy: "Achat", sell: "Vente" } as const;
const ref = (id: string) => orderRef(id);
const cadEn = (n: number) => `$${n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Champ « référence de commande », partagé par plusieurs outils. */
function OrderPick({ onFound, side }: { onFound: (o: OrderInfo | null) => void; side?: "buy" | "sell" }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    setBusy(true); setErr(null); onFound(null);
    try {
      const o = await lookupOrder(q);
      if (!o) setErr("Aucune commande avec cette référence.");
      else if (side && o.side !== side) setErr(side === "sell" ? "Cette commande est un achat, pas une vente." : "Cette commande est une vente, pas un achat.");
      else onFound(o);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Field label="Référence de la commande">
        <TextInput autoFocus spellCheck={false} autoCapitalize="characters" placeholder="OOB-6B83DAB2" value={q}
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void run(); }} />
      </Field>
      <div><Button variant="primary" disabled={busy || q.replace(/^\s*OOB-?/i, "").replace(/[^0-9a-f]/gi, "").length < 6} icon={<Search style={{ width: 15, height: 15 }} />} onClick={() => void run()}>{busy ? "Recherche…" : "Trouver"}</Button></div>
      <Err text={err} />
    </div>
  );
}
const OrderHead = ({ o, onOpenOrder }: { o: OrderInfo; onOpenOrder?: (id: string) => void }) => (
  <div className="tl-verdict" style={{ paddingTop: 14 }}>
    {o.side === "buy" ? <ArrowDownLeft style={{ color: C.t1 }} /> : <ArrowUpRight style={{ color: C.t1 }} />}
    <div>
      <b>{SIDE[o.side]} {onOpenOrder ? <button type="button" className="tl-link" onClick={() => onOpenOrder(o.id)}>{ref(o.id)}</button> : ref(o.id)}</b>
      <span>{o.client.name || o.client.email || "Client"} · {STATUS[o.status] ?? o.status} · {dt.format(new Date(o.created_at))}</span>
    </div>
  </div>
);

/* ─── Rapprochement Interac manuel ─── */
function InteracTool({ onOpenOrder }: { onOpenOrder?: (id: string) => void }) {
  const [text, setText] = useState("");
  const [amount, setAmount] = useState("");
  const [r, setR] = useState("");
  const [name, setName] = useState("");
  const [hits, setHits] = useState<InteracHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const read = (t: string) => {
    setText(t); setHits(null);
    const p = parseInterac(t);
    setAmount(p.amount != null ? String(p.amount).replace(".", ",") : ""); setR(p.ref ? `OOB-${p.ref.toUpperCase()}` : ""); setName(p.name);
  };
  const run = async () => {
    setBusy(true); setErr(null);
    const a = Number(amount.replace(/\s/g, "").replace(",", "."));
    try { setHits(await matchInterac(a > 0 ? a : null, r.replace(/^OOB-?/i, ""), name)); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Field label="Avis Interac (collez le courriel ou le texte)">
        <TextArea autoFocus rows={5} value={text} onChange={(e) => read(e.target.value)} placeholder="Jean Tremblay vous a envoyé 500,00 $ … Message : OOB-6B83DAB2" />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        <Field label="Montant"><TextInput inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500,00" /></Field>
        <Field label="Référence"><TextInput value={r} onChange={(e) => setR(e.target.value)} placeholder="OOB-…" /></Field>
        <Field label="Nom de l'expéditeur"><TextInput value={name} onChange={(e) => setName(e.target.value)} /></Field>
      </div>
      <div><Button variant="primary" disabled={busy || !(amount || r || name)} icon={<Search style={{ width: 15, height: 15 }} />} onClick={() => void run()}>{busy ? "Recherche…" : "Trouver la commande"}</Button></div>
      <Err text={err} />
      {hits && (
        <div className="tl-rise">
          {hits.length === 0 ? (
            <div className="tl-verdict"><Search style={{ color: C.t1 }} /><div><b>Aucun achat ne correspond</b><span>Aucun achat des 14 derniers jours avec ce montant, cette référence ou ce nom.</span></div></div>
          ) : hits.map((h, i) => (
            <Line key={h.id} icon={i === 0 && h.score >= 4 ? Check : ShoppingCart}
              label={<span style={{ color: C.t1 }}>{onOpenOrder ? <button type="button" className="tl-link" onClick={() => onOpenOrder(h.id)}>{ref(h.id)}</button> : ref(h.id)} <span style={{ color: C.t3 }}>· {h.name || h.email} · {STATUS[h.status] ?? h.status}</span>
                <span className="tl-hint">{[h.score >= 4 && "référence", h.score % 4 >= 2 && "montant", h.score % 2 === 1 && "nom"].filter(Boolean).join(", ")} identique{h.score >= 4 || h.score === 3 ? "s" : ""}</span></span>}>
              {cad(Number(h.cad))}
            </Line>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Remboursement ─── */
function RefundTool({ onOpenOrder }: { onOpenOrder?: (id: string) => void }) {
  const [o, setO] = useState<OrderInfo | null>(null);
  const [lang, setLang] = useState<"fr" | "en">("fr");
  const [amount, setAmount] = useState("");
  useEffect(() => { if (o) { setLang(o.client.lang === "en" ? "en" : "fr"); setAmount(String(o.cad).replace(".", ",")); } }, [o]);
  const a = Number(amount.replace(/\s/g, "").replace(",", ".")) || 0;
  const first = (o?.client.name || "").split(" ")[0];
  const msg = !o ? "" : lang === "fr"
    ? `Bonjour${first ? ` ${first}` : ""},\n\nNous vous remboursons ${cad(a)} pour la commande ${ref(o.id)}. Le virement Interac part aujourd'hui à l'adresse ${o.interac_email || o.client.email || ""}.\n\nSi vous ne le recevez pas d'ici 24 heures, répondez simplement à ce courriel.\n\nL'équipe Ooble`
    : `Hi${first ? ` ${first}` : ""},\n\nWe are refunding ${cadEn(a)} for order ${ref(o.id)}. The Interac transfer is sent today to ${o.interac_email || o.client.email || ""}.\n\nIf you don't receive it within 24 hours, just reply to this email.\n\nThe Ooble team`;
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <OrderPick onFound={setO} />
      {o && (
        <div className="tl-rise">
          <OrderHead o={o} onOpenOrder={onOpenOrder} />
          <Line icon={Landmark} label={o.side === "buy" ? "Payé par le client" : "Montant de la vente"}>{cad(Number(o.cad))}</Line>
          <Line icon={Coins} label="Cryptomonnaie"><Coin id={o.asset} size={18} />{num(Number(o.crypto), 2)} {o.asset.toUpperCase()}</Line>
          {o.status === "refunded" && <Line icon={Check} label="Déjà remboursée">Oui</Line>}
          <div style={{ marginTop: 16 }}><Field label="Montant à rembourser"><TextInput inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field></div>
          <div style={{ marginTop: 14 }}><LangSwitch lang={lang} set={setLang} /></div>
          <Ready title="Message au client" text={msg} />
        </div>
      )}
    </div>
  );
}

/* ─── Versement d'une vente (virement Interac sortant) ─── */
function PayoutTool({ onOpenOrder }: { onOpenOrder?: (id: string) => void }) {
  const [o, setO] = useState<OrderInfo | null>(null);
  const to = o ? (o.interac_email || o.client.email || "") : "";
  const memo = o ? `Ooble ${ref(o.id)}` : "";
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <OrderPick onFound={setO} side="sell" />
      {o && (
        <div className="tl-rise">
          <OrderHead o={o} onOpenOrder={onOpenOrder} />
          {o.status !== "completed" && o.status !== "settling" && <p style={{ margin: "0 0 10px", fontSize: 13.5, color: C.t1 }}>Attention : le dépôt du client n'est pas encore confirmé ({STATUS[o.status] ?? o.status}).</p>}
          <Line icon={Landmark} label="Montant à envoyer"><span style={{ fontSize: 17, fontWeight: 600 }}>{cad(Number(o.cad))}</span><CopyBtn text={Number(o.cad).toFixed(2)} label="" /></Line>
          <Line icon={UserRound} label="Destinataire">{o.client.name || "Client"}</Line>
          <Line icon={Send} label="Courriel Interac">{to}<CopyBtn text={to} label="" /></Line>
          {o.interac ? (
            <>
              <Line icon={ShieldCheck} label="Question de sécurité">{o.interac.question || "Aucune (dépôt automatique)"}{o.interac.question && <CopyBtn text={o.interac.question} label="" />}</Line>
              {o.interac.answer && <Line icon={ShieldCheck} label="Réponse"><span className="tl-mono">{o.interac.answer}</span><CopyBtn text={o.interac.answer} label="" /></Line>}
            </>
          ) : <Line icon={ShieldCheck} label="Question de sécurité">Réservée aux opérateurs</Line>}
          <Line icon={Hash} label="Message du virement">{memo}<CopyBtn text={memo} label="" /></Line>
          <Line icon={Coins} label="Reçu du client"><Coin id={o.asset} size={18} />{num(Number(o.crypto), 2)} {o.asset.toUpperCase()}{o.network ? ` · ${NET_NAME[o.network] ?? o.network}` : ""}</Line>
        </div>
      )}
    </div>
  );
}

/* ─── Suivi de commande pour le client ─── */
function statusSentence(o: OrderInfo, lang: "fr" | "en") {
  const r = ref(o.id), amt = lang === "fr" ? cad(Number(o.cad)) : cadEn(Number(o.cad)), c = `${num(Number(o.crypto), 2)} ${o.asset.toUpperCase()}`;
  const net = o.network ? NET_NAME[o.network] ?? o.network : "";
  const fr: Record<string, string> = o.side === "buy" ? {
    created: `Votre commande ${r} est créée : nous attendons votre virement Interac de ${amt}.`,
    awaiting_payment: `Votre commande ${r} attend votre virement Interac de ${amt}. Dès qu'il arrive, nous envoyons vos ${c}.`,
    payment_received: `Nous avons bien reçu votre paiement de ${amt} pour la commande ${r}. L'envoi de vos ${c} est en préparation.`,
    settling: `Vos ${c} sont en route sur ${net} (commande ${r}). Ils arrivent en général en quelques minutes.`,
    completed: `Votre commande ${r} est terminée : ${c} ont été envoyés sur ${net}.`,
    cancelled: `La commande ${r} a été annulée. Aucun montant n'a été prélevé.`, expired: `La commande ${r} a expiré, faute de paiement à temps. Vous pouvez en créer une nouvelle.`,
    refunded: `La commande ${r} a été remboursée : ${amt} vous ont été renvoyés par Interac.`,
  } : {
    created: `Votre vente ${r} est créée : nous attendons l'envoi de vos ${c} sur ${net}.`,
    awaiting_payment: `Votre vente ${r} attend la réception de vos ${c} sur ${net}.`,
    payment_received: `Nous avons bien reçu vos ${c} (vente ${r}). Votre virement Interac de ${amt} est en préparation.`,
    settling: `Votre virement Interac de ${amt} est en cours pour la vente ${r}.`,
    completed: `Votre vente ${r} est terminée : ${amt} vous ont été envoyés par Interac.`,
    cancelled: `La vente ${r} a été annulée.`, expired: `La vente ${r} a expiré : aucun dépôt n'a été reçu à temps.`,
    refunded: `La vente ${r} a été annulée et vos ${c} vous ont été renvoyés.`,
  };
  const en: Record<string, string> = o.side === "buy" ? {
    created: `Your order ${r} is created: we're waiting for your Interac transfer of ${amt}.`,
    awaiting_payment: `Your order ${r} is waiting for your Interac transfer of ${amt}. As soon as it arrives, we send your ${c}.`,
    payment_received: `We received your payment of ${amt} for order ${r}. Your ${c} are being prepared.`,
    settling: `Your ${c} are on their way on ${net} (order ${r}). They usually arrive within minutes.`,
    completed: `Your order ${r} is complete: ${c} were sent on ${net}.`,
    cancelled: `Order ${r} was cancelled. Nothing was charged.`, expired: `Order ${r} expired because the payment didn't arrive in time. You can create a new one.`,
    refunded: `Order ${r} was refunded: ${amt} was sent back to you by Interac.`,
  } : {
    created: `Your sale ${r} is created: we're waiting for your ${c} on ${net}.`,
    awaiting_payment: `Your sale ${r} is waiting for your ${c} on ${net}.`,
    payment_received: `We received your ${c} (sale ${r}). Your Interac transfer of ${amt} is being prepared.`,
    settling: `Your Interac transfer of ${amt} is on its way for sale ${r}.`,
    completed: `Your sale ${r} is complete: ${amt} was sent to you by Interac.`,
    cancelled: `Sale ${r} was cancelled.`, expired: `Sale ${r} expired: no deposit was received in time.`,
    refunded: `Sale ${r} was cancelled and your ${c} were sent back to you.`,
  };
  return (lang === "fr" ? fr : en)[o.status] ?? (lang === "fr" ? `Commande ${r} : ${STATUS[o.status] ?? o.status}.` : `Order ${r}: ${o.status}.`);
}
function StatusTool({ onOpenOrder }: { onOpenOrder?: (id: string) => void }) {
  const [o, setO] = useState<OrderInfo | null>(null);
  const [lang, setLang] = useState<"fr" | "en">("fr");
  useEffect(() => { if (o) setLang(o.client.lang === "en" ? "en" : "fr"); }, [o]);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <OrderPick onFound={setO} />
      {o && (
        <div className="tl-rise">
          <OrderHead o={o} onOpenOrder={onOpenOrder} />
          <Line icon={Clock3} label="Dernière mise à jour">{dt.format(new Date(o.updated_at))}</Line>
          <div style={{ marginTop: 14 }}><LangSwitch lang={lang} set={setLang} /></div>
          <Ready title="À copier dans la réponse" text={statusSentence(o, lang)} />
        </div>
      )}
    </div>
  );
}

/* ─── Lecteur de passeport ─── */
function MrzTool() {
  const [t, setT] = useState("");
  const m = useMemo(() => readMrz(t), [t]);
  const today = todayMontreal();
  const age = m ? Math.floor((Date.now() - new Date(`${m.birth}T12:00:00`).getTime()) / (365.25 * 86_400_000)) : 0;
  const expired = m ? m.expiry < today : false;
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Field label="Les 2 lignes du bas du passeport">
        <TextArea autoFocus rows={3} spellCheck={false} value={t} onChange={(e) => setT(e.target.value)} className="tl-mono"
          placeholder={"P<CANMARTIN<<SARAH<<<<<<<<<<<<<<<<<<<<<<<<<\nAB1234567CAN9001014F3001012<<<<<<<<<<<<<<04"} />
      </Field>
      {t.trim() && !m && <p style={{ margin: 0, fontSize: 14, color: C.t1 }}>Collez les deux lignes complètes (44 caractères chacune, la première commence par P).</p>}
      {m && (
        <div className="tl-rise">
          <div className="tl-verdict">
            {m.ok && !expired ? <ShieldCheck style={{ color: C.t1 }} /> : <ShieldAlert style={{ color: C.t1 }} />}
            <div><b>{!m.ok ? "Chiffres de contrôle incorrects" : expired ? "Passeport expiré" : "Zone lisible valide"}</b>
              <span>{!m.ok ? "Une ou plusieurs clés ne correspondent pas : erreur de saisie ou document modifié." : expired ? `Expiré depuis le ${m.expiry}.` : "Toutes les clés de contrôle correspondent."}</span></div>
          </div>
          {m.checks.map((c) => <Line key={c.label} icon={c.ok ? Check : ShieldAlert} label={c.label}>{c.ok ? "Correct" : "Incorrect"}</Line>)}
          <Line icon={UserRound} label="Nom">{m.surname}</Line>
          <Line icon={UserRound} label="Prénoms">{m.given || "—"}</Line>
          <Line icon={Hash} label="Numéro">{m.number}</Line>
          <Line icon={Network} label="Pays émetteur · nationalité">{m.country} · {m.nationality}</Line>
          <Line icon={CalendarDays} label="Naissance">{m.birth} ({age} ans)</Line>
          <Line icon={Clock3} label="Expiration">{m.expiry}</Line>
          <Line icon={UserRound} label="Sexe">{m.sex}</Line>
        </div>
      )}
    </div>
  );
}

/* ─── Numéro d'entreprise ─── */
const REGISTRIES = [
  { name: "Registraire des entreprises du Québec (NEQ)", url: "https://www.registreentreprises.req.gouv.qc.ca/RQAnonymeGR/GR/GR03/GR03A2_19A_PIU_RechEntMod_PC/PageRechSimple.aspx" },
  { name: "Corporations Canada (fédéral)", url: "https://ised-isde.canada.ca/cc/lgcy/fdrlCrpSrch.html" },
  { name: "Registre des entreprises de l'Ontario", url: "https://www.appmybizaccount.gov.on.ca/onbis/master/entry.pub?applicationCode=onbis-master&businessService=registerItemSearch" },
  { name: "Registre des entreprises canadiennes (toutes provinces)", url: "https://ised-isde.canada.ca/cbr/srch/index-fra.html" },
];
function BusinessTool() {
  const [q, setQ] = useState("");
  const raw = q.toUpperCase().replace(/[\s-]/g, "");
  const digits = raw.replace(/\D/g, "");
  const kind = /^\d{10}$/.test(raw) ? "neq" : /^\d{9}([A-Z]{2}\d{4})?$/.test(raw) ? "bn" : null;
  const bnOk = kind === "bn" && bnValid(digits.slice(0, 9));
  const prog = kind === "bn" && raw.length === 15 ? raw.slice(9, 11) : null;
  const PROG: Record<string, string> = { RC: "Impôt des sociétés", RT: "TPS/TVH", RP: "Retenues sur la paie", RM: "Importations-exportations", RR: "Organisme de bienfaisance", RZ: "Déclarations de renseignements" };
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Field label="Numéro d'entreprise"><TextInput autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="NEQ (10 chiffres) ou NE fédéral (9 chiffres, ex. 123456789RC0001)" /></Field>
      {raw && (
        <div className="tl-rise">
          <div className="tl-verdict">
            {(kind === "neq" || bnOk) ? <ShieldCheck style={{ color: C.t1 }} /> : <ShieldAlert style={{ color: C.t1 }} />}
            <div>
              <b>{kind === "neq" ? "Format de NEQ valide" : kind === "bn" ? (bnOk ? "Numéro d'entreprise fédéral valide" : "Clé de contrôle incorrecte") : "Format non reconnu"}</b>
              <span>{kind === "neq" ? "Numéro d'entreprise du Québec : 10 chiffres. Vérifiez au registre que l'entreprise existe et que son nom correspond." : kind === "bn" ? (bnOk ? "Les 9 chiffres respectent la clé de l'Agence du revenu du Canada." : "Les 9 chiffres ne respectent pas la clé de contrôle : erreur de saisie ou numéro inventé.") : "Un NEQ a 10 chiffres ; un numéro fédéral a 9 chiffres, parfois suivis d'un programme (RC0001)."}</span>
            </div>
          </div>
          {prog && <Line icon={Hash} label="Programme">{prog} · {PROG[prog] ?? "Autre"}</Line>}
        </div>
      )}
      <div>
        <p className="tl-k" style={{ marginTop: 6 }}>Vérifier au registre officiel</p>
        {REGISTRIES.map((r) => <a key={r.url} className="tl-ext" style={{ display: "flex" }} href={r.url} target="_blank" rel="noreferrer"><Building2 style={{ width: 15, height: 15, color: C.t3 }} />{r.name}<ExternalLink /></a>)}
      </div>
    </div>
  );
}

/* ─── Âge et expiration ─── */
function AgeTool() {
  const [o, setO] = useState<OliSettings>(OLI_DEFAULTS);
  useEffect(() => { fetchOli().then(setO).catch(() => {}); }, []);
  const [birth, setBirth] = useState("");
  const [exp, setExp] = useState("");
  const [proof, setProof] = useState("");
  const today = todayMontreal();
  const days = (d: string) => Math.round((new Date(`${d}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / 86_400_000);
  const age = birth ? Math.floor(-days(birth) / 365.25) : null;
  const minAge = o.minAge ?? 18, maxProof = o.addressMaxDays ?? 92, warn = o.expiryWarnDays ?? 30;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <Field label="Date de naissance"><TextInput type="date" value={birth} max={today} onChange={(e) => setBirth(e.target.value)} /></Field>
        <Field label="Expiration de la pièce"><TextInput type="date" value={exp} onChange={(e) => setExp(e.target.value)} /></Field>
        <Field label="Date du justificatif de domicile"><TextInput type="date" value={proof} max={today} onChange={(e) => setProof(e.target.value)} /></Field>
      </div>
      <div className="tl-rise">
        {age != null && <Line icon={age >= minAge ? Check : ShieldAlert} label="Âge">{age} ans · {age >= minAge ? "majeur" : `moins de ${minAge} ans : refuser`}</Line>}
        {exp && <Line icon={days(exp) < 0 ? ShieldAlert : Check} label="Pièce d'identité">{days(exp) < 0 ? `expirée depuis ${-days(exp)} jours` : days(exp) <= warn ? `expire dans ${days(exp)} jours : à surveiller` : `valide encore ${days(exp)} jours`}</Line>}
        {proof && <Line icon={-days(proof) > maxProof ? ShieldAlert : Check} label="Justificatif de domicile">{-days(proof)} jours · {-days(proof) > maxProof ? `plus de ${maxProof} jours : en demander un récent` : "assez récent"}</Line>}
        {!birth && !exp && !proof && <p style={{ margin: 0, fontSize: 13.5, color: C.t3 }}>Les seuils suivent les réglages d'Oli : {minAge} ans minimum, justificatif de moins de {maxProof} jours, alerte {warn} jours avant l'expiration.</p>}
      </div>
    </div>
  );
}

/* ─── Brouillon de déclaration ─── */
function DraftTool({ onOpenOrder, onShowClient }: { onOpenOrder?: (id: string) => void; onShowClient?: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ id: string; name: string; email: string }[]>([]);
  const [who, setWho] = useState<{ id: string; name: string; email: string } | null>(null);
  const [days, setDays] = useState(30);
  const [w, setW] = useState<ClientWindow | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (who) return;
    const t = window.setTimeout(() => { searchClients(q).then(setFound).catch(() => setFound([])); }, 250);
    return () => window.clearTimeout(t);
  }, [q, who]);
  useEffect(() => { if (!who) return; setW(null); setErr(null); clientWindow(who.id, days).then(setW).catch((e) => setErr(e.message)); }, [who, days]);
  const buy = (w?.orders ?? []).filter((o) => o.side === "buy").reduce((s, o) => s + Number(o.cad), 0);
  const sell = (w?.orders ?? []).filter((o) => o.side === "sell").reduce((s, o) => s + Number(o.cad), 0);
  const big = (w?.orders ?? []).some((o) => Number(o.cad) >= 10_000);
  const text = !w || !who ? "" : [
    `BROUILLON — DÉCLARATION D'OPÉRATION DOUTEUSE (à relire et compléter avant envoi au CANAFE)`,
    ``,
    `1. Personne visée`,
    `Nom : ${w.client?.name ?? who.name}`,
    `Courriel : ${w.client?.email ?? who.email}${w.client?.phone ? ` · Téléphone : ${w.client.phone}` : ""}`,
    `Type de compte : ${w.client?.account_type === "business" ? "Entreprise" : "Particulier"} · Client depuis le ${w.client ? new Date(w.client.created_at).toLocaleDateString("fr-CA") : "—"}`,
    `Date de naissance : ${w.client?.birth_date ?? "—"} · Profession : ${w.client?.occupation ?? "—"}`,
    `Adresse : ${w.client?.address ?? "—"}`,
    `Identité vérifiée : ${w.client?.kyc_status === "approved" ? "oui" : "non"}`,
    ``,
    `2. Opérations sur ${days} jours (${w.orders.length})`,
    `Achats : ${cad(buy)} · Ventes : ${cad(sell)} · Total : ${cad(buy + sell)}`,
    ...w.orders.map((o) => `- ${new Date(o.at).toLocaleString("fr-CA", { dateStyle: "short", timeStyle: "short" })} · ${ref(o.id)} · ${SIDE[o.side]} · ${cad(Number(o.cad))} · ${num(Number(o.crypto), 2)} ${String(o.asset).toUpperCase()}${o.network ? ` · ${NET_NAME[o.network] ?? o.network}` : ""}${o.side === "buy" && o.wallet ? ` · vers ${o.wallet}` : ""}${o.side === "sell" && o.sender ? ` · depuis ${o.sender}` : ""}`),
    ``,
    `3. Alertes de conformité liées (${w.alerts.length})`,
    ...(w.alerts.length ? w.alerts.map((a) => `- ${new Date(a.at).toLocaleDateString("fr-CA")} · ${a.type} · ${a.reason}`) : ["- Aucune"]),
    ``,
    `4. Motifs raisonnables de soupçonner (à rédiger)`,
    `- Quels indicateurs ? Pourquoi ces opérations sont-elles inhabituelles pour ce client ?`,
    `- Quelles vérifications ont été faites, et leurs résultats ?`,
    ``,
    `5. Mesures prises`,
    `- `,
  ].join("\n");
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {!who ? (
        <>
          <Field label="Client"><TextInput autoFocus placeholder="Nom ou courriel" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
          <div>{found.map((c) => (
            <button key={c.id} type="button" className="tl-client" onClick={() => setWho(c)}>
              <UserRound style={{ width: 17, height: 17, color: C.t3, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 14.5, color: C.t1 }}>{c.name || c.email}</span><span style={{ display: "block", fontSize: 12.5, color: C.t3 }}>{c.email}</span></span>
              <ArrowRight className="tl-go" />
            </button>
          ))}</div>
          {q.trim().length >= 2 && found.length === 0 && <p style={{ margin: 0, fontSize: 14, color: C.t3 }}>Aucun client trouvé.</p>}
        </>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <UserRound style={{ width: 17, height: 17, color: C.t3 }} />
            <span style={{ fontSize: 15, color: C.t1 }}>{onShowClient ? <button type="button" className="tl-link" onClick={() => onShowClient(who.id)}>{who.name || who.email}</button> : (who.name || who.email)}</span>
            <button type="button" className="tl-swap" style={{ marginLeft: "auto" }} onClick={() => { setWho(null); setW(null); }}><RefreshCw />Changer de client</button>
          </div>
          <div className="tl-chips">{[7, 30, 90, 365].map((d) => <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}>{d === 365 ? "1 an" : `${d} jours`}</button>)}</div>
          <Err text={err} />
          {!w && !err && <Wait />}
          {w && (
            <div className="tl-rise">
              <Line icon={ArrowDownLeft} label="Achats">{cad(buy)}</Line>
              <Line icon={ArrowUpRight} label="Ventes">{cad(sell)}</Line>
              <Line icon={ShoppingCart} label="Opérations">{w.orders.length}</Line>
              <Line icon={ShieldAlert} label="Alertes liées">{w.alerts.length}</Line>
              {big && <p style={{ margin: "12px 0 0", fontSize: 13.5, color: C.t1 }}>Une opération atteint 10 000 $ : une déclaration d'opération importante est aussi à prévoir.</p>}
              {w.orders.length > 0 && onOpenOrder && <p className="tl-hint" style={{ marginTop: 10 }}>Dernière : <button type="button" className="tl-link" onClick={() => onOpenOrder(w.orders[w.orders.length - 1].id)}>{ref(w.orders[w.orders.length - 1].id)}</button></p>}
              <Ready title="Brouillon" text={text} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─── Calendrier des obligations ─── */
const RULES = [
  { icon: Clock3, name: "Opération importante en monnaie virtuelle (10 000 $ et plus)", when: "Dans les 5 jours ouvrables suivant l'opération" },
  { icon: Clock3, name: "Opération douteuse", when: "Dès que possible, après avoir établi les motifs raisonnables" },
  { icon: ShieldAlert, name: "Biens d'un groupe terroriste ou d'une personne sanctionnée", when: "Immédiatement, au CANAFE et à la GRC" },
  { icon: CalendarDays, name: "Évaluation des risques de l'entreprise", when: "À revoir au moins chaque année" },
  { icon: CalendarDays, name: "Formation de l'équipe en conformité", when: "Chaque année, et à l'arrivée de chaque membre" },
  { icon: CalendarDays, name: "Examen de l'efficacité du programme", when: "Tous les deux ans" },
  { icon: Building2, name: "Inscription auprès du CANAFE", when: "À renouveler tous les deux ans" },
];
function CalendarTool() {
  const [rows, setRows] = useState<{ label: string; due_date: string | null; done: boolean; frequency: string | null }[] | null>(null);
  useEffect(() => {
    db.from("compliance_checklist").select("label, due_date, done, frequency").order("due_date", { ascending: true, nullsFirst: false })
      .then(({ data }: { data: unknown[] | null }) => setRows((data ?? []) as never)).catch(() => setRows([]));
  }, []);
  const today = todayMontreal();
  const todo = (rows ?? []).filter((r) => !r.done && r.due_date);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <p className="tl-k">Échéances du programme de conformité</p>
      {rows === null ? <Wait /> : todo.length === 0 ? <p style={{ margin: 0, fontSize: 14, color: C.t3 }}>Aucune échéance ouverte dans le programme.</p> : todo.slice(0, 12).map((r, i) => {
        const late = r.due_date! < today;
        return <Line key={i} icon={late ? ShieldAlert : CalendarDays} label={<span style={{ color: C.t1 }}>{r.label}</span>}>{late ? "En retard · " : ""}{new Date(`${r.due_date}T12:00:00`).toLocaleDateString("fr-CA", { day: "numeric", month: "short", year: "numeric" })}</Line>;
      })}
      <p className="tl-k" style={{ marginTop: 18 }}>Délais de déclaration au CANAFE</p>
      {RULES.map((r) => <Line key={r.name} icon={r.icon} label={<span style={{ color: C.t1 }}>{r.name}<span className="tl-hint">{r.when}</span></span>} />)}
    </div>
  );
}

/* ─── Lien suivi et code QR ─── */
const SOURCES = ["Instagram", "Facebook", "TikTok", "LinkedIn", "WhatsApp", "Affiche", "Carte", "Partenaire"];
const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
function LinksTool() {
  const [page, setPage] = useState("/");
  const [src, setSrc] = useState("Instagram");
  const [other, setOther] = useState("");
  const [camp, setCamp] = useState("");
  const qrRef = useRef<HTMLDivElement>(null);
  const source = src === "Autre" ? slug(other) : slug(src);
  const p = new URLSearchParams();
  if (source) p.set("src", source);
  if (camp.trim()) p.set("utm_campaign", slug(camp));
  const url = `https://ooble.ca${page.startsWith("/") ? page : `/${page}`}${p.toString() ? `?${p}` : ""}`;
  const download = () => {
    const svg = qrRef.current?.querySelector("svg");
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `ooble-qr-${source || "lien"}${camp ? `-${slug(camp)}` : ""}.svg`; a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Field label="Page d'arrivée">
        <div className="tl-chips">{[["/", "Accueil"], ["/inscription", "Inscription"], ["/entreprises", "Entreprises"], ["/otc", "OTC"], ["/guide", "Guide"]].map(([v, l]) => <button key={v} type="button" aria-pressed={page === v} onClick={() => setPage(v)}>{l}</button>)}</div>
      </Field>
      <Field label="Ou un chemin précis"><TextInput value={page} onChange={(e) => setPage(e.target.value)} placeholder="/" /></Field>
      <Field label="Source">
        <div className="tl-chips">{[...SOURCES, "Autre"].map((s) => <button key={s} type="button" aria-pressed={src === s} onClick={() => setSrc(s)}>{s}</button>)}</div>
      </Field>
      {src === "Autre" && <Field label="Nom de la source"><TextInput value={other} onChange={(e) => setOther(e.target.value)} placeholder="ex. salon-montreal" /></Field>}
      <Field label="Campagne (facultatif)"><TextInput value={camp} onChange={(e) => setCamp(e.target.value)} placeholder="ex. Lancement automne" /></Field>
      <div className="tl-rise">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}><p className="tl-k" style={{ margin: 0 }}>Lien suivi</p><CopyBtn text={url} /></div>
        <p className="tl-mono" style={{ margin: "8px 0 0", fontSize: 13.5, color: C.t1 }}>{url}</p>
        <div ref={qrRef} style={{ marginTop: 18, display: "inline-block", padding: 14, background: "#fff" }}><QRCodeSVG value={url} size={176} level="M" /></div>
        <div style={{ marginTop: 10 }}><button type="button" className="tl-swap" onClick={download}><ArrowDownLeft />Télécharger le code QR</button></div>
        <p className="tl-hint" style={{ marginTop: 10 }}>Les inscriptions venues de ce lien apparaissent dans Marketing, par source et par campagne.</p>
      </div>
    </div>
  );
}

/* ─── Marge réelle d'une commande ─── */
function MarginTool({ onOpenOrder }: { onOpenOrder?: (id: string) => void }) {
  const [o, setO] = useState<OrderInfo | null>(null);
  const m = o?.market ?? null;
  const value = o && m ? Number(o.crypto) * m : null;
  const gain = o && value != null ? (o.side === "buy" ? Number(o.cad) - value : value - Number(o.cad)) : null;
  const pct = gain != null && value ? (gain / value) * 100 : null;
  const shown = useCount(gain, 700);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <OrderPick onFound={setO} />
      {o && (
        <div className="tl-rise">
          <OrderHead o={o} onOpenOrder={onOpenOrder} />
          {gain == null ? <p style={{ margin: 0, fontSize: 14, color: C.t3 }}>Pas de cours du marché enregistré au moment de cette commande.</p> : (
            <div><p className="tl-k">Marge brute</p><p className="tl-big">{cad(shown)}<span style={{ fontSize: 18, color: C.t3, fontWeight: 500 }}>{num(pct ?? 0, 2)} %</span></p></div>
          )}
          <div style={{ marginTop: 14 }}>
            <Line icon={Landmark} label={o.side === "buy" ? "Payé par le client" : "Versé au client"}>{cad(Number(o.cad))}</Line>
            <Line icon={Coins} label="Cryptomonnaie"><Coin id={o.asset} size={18} />{num(Number(o.crypto), 2)} {o.asset.toUpperCase()}</Line>
            <Line icon={ArrowDownUp} label="Taux appliqué">{rate4(Number(o.rate))} $</Line>
            {m != null && <Line icon={Network} label="Cours du marché à la création">{rate4(m)} $</Line>}
            {value != null && <Line icon={Landmark} label="Valeur au cours du marché">{cad(value)}</Line>}
            {Number(o.bonus_bps) > 0 && <Line icon={Users} label="Bonus de taux accordé">{num(Number(o.bonus_bps) / 100, 2)} %</Line>}
          </div>
          <p className="tl-hint" style={{ marginTop: 12 }}>Avant les frais de réseau et le coût réel du stock, qui sont dans Comptabilité.</p>
        </div>
      )}
    </div>
  );
}

/* ─── Prévision du stock ─── */
function StockTool() {
  const [rows, setRows] = useState<StockLine[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { stockForecast().then(setRows).catch((e) => setErr(e.message)); }, []);
  const asset = primaryAsset(getAppSettingsNow()).id;
  const list = (rows ?? []).filter((r) => r.asset === asset && OPEN_NETS.includes(r.network));
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <Err text={err} />
      {!rows && !err && <Wait />}
      {rows && list.length === 0 && <p style={{ margin: 0, fontSize: 14, color: C.t3 }}>Aucun relevé du stock pour l'instant.</p>}
      <div className="tl-rise">
        {list.map((r) => {
          const perDay = (Number(r.out7) - Number(r.in7)) / 7;
          const left = perDay > 0 ? Number(r.balance) / perDay : null;
          const when = left != null ? new Date(Date.now() + left * 86_400_000).toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" }) : null;
          const lowGas = Number(r.gas) < Number(r.min_gas);
          return (
            <div key={r.network} style={{ padding: "14px 0", borderBottom: `1px solid ${C.bds}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Coin id={r.network} net size={30} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ display: "block", fontSize: 15, fontWeight: 600, color: C.t1 }}>{NET_NAME[r.network]}</b>
                  <span style={{ fontSize: 12.5, color: C.t3 }}>Envoyé {num(Number(r.out7), 2)} · reçu {num(Number(r.in7), 2)} sur 7 jours</span>
                </span>
                <span style={{ textAlign: "right" }}>
                  <b style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 16, fontWeight: 600, color: C.t1, fontVariantNumeric: "tabular-nums" }}><Coin id={asset} size={16} />{num(Number(r.balance), 2)}</b>
                  <span style={{ display: "block", fontSize: 12.5, color: C.t2 }}>{left == null ? "Stable à ce rythme" : left < 1 ? "Vide d'ici demain" : `Vide vers ${when}`}</span>
                </span>
              </div>
              {lowGas && <p className="tl-hint" style={{ margin: "8px 0 0 42px", color: C.t1 }}>Frais de réseau bas : {num(Number(r.gas), 4)} {r.gas_symbol} (minimum {num(Number(r.min_gas), 4)}).</p>}
            </div>
          );
        })}
      </div>
      {list.length > 0 && <p className="tl-hint" style={{ marginTop: 10 }}>Calcul au rythme des 7 derniers jours : envois moins ventes reçues.</p>}
    </div>
  );
}

/* ─── Simulateur de marge ─── */
function SimTool() {
  const [days, setDays] = useState(30);
  const [b, setB] = useState<MarginBase | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [buyM, setBuyM] = useState<number | null>(null);
  const [sellM, setSellM] = useState<number | null>(null);
  useEffect(() => { setB(null); marginBase(days).then((x) => { setB(x); setBuyM((v) => v ?? Number(x.buy_margin_pct)); setSellM((v) => v ?? Number(x.sell_margin_pct)); }).catch((e) => setErr(e.message)); }, [days]);
  // Revenu de marge : achat = volume × m / (1 + m) ; vente = volume × m / (1 − m).
  const rev = (vb: number, vs: number, mb: number, ms: number) => vb * (mb / 100) / (1 + mb / 100) + vs * (ms / 100) / (1 - ms / 100);
  const now = b ? rev(Number(b.buy.cad), Number(b.sell.cad), Number(b.buy_margin_pct), Number(b.sell_margin_pct)) : 0;
  const next = b && buyM != null && sellM != null ? rev(Number(b.buy.cad), Number(b.sell.cad), buyM, sellM) : 0;
  const shown = useCount(b ? next : null, 500);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="tl-chips">{[7, 30, 90].map((d) => <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}>{d} derniers jours</button>)}</div>
      <Err text={err} />
      {!b && !err && <Wait />}
      {b && buyM != null && sellM != null && (
        <div className="tl-rise">
          <div>
            <p className="tl-k">Revenu de marge sur la période</p>
            <p className="tl-big">{cad(shown)}<span style={{ fontSize: 18, color: C.t3, fontWeight: 500 }}>{next >= now ? "+" : ""}{cad(next - now)}</span></p>
          </div>
          {([["Marge à l'achat", buyM, setBuyM, Number(b.buy_margin_pct), b.buy], ["Marge à la vente", sellM, setSellM, Number(b.sell_margin_pct), b.sell]] as const).map(([l, v, set, cur, vol]) => (
            <div key={l} style={{ marginTop: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: C.t1 }}><span>{l}</span><b style={{ fontWeight: 600 }}>{num(v, 2)} %</b></div>
              <input type="range" min={0} max={6} step={0.05} value={v} onChange={(e) => set(Number(e.target.value))} className="tl-range" aria-label={l} />
              <p className="tl-hint" style={{ margin: 0 }}>Actuelle : {num(cur, 2)} % · {vol.count} opération{vol.count > 1 ? "s" : ""}, {cad(Number(vol.cad))}</p>
            </div>
          ))}
          <p className="tl-hint" style={{ marginTop: 16 }}>Simulation à volume égal : une marge plus haute peut faire baisser le nombre de commandes. Rien n'est modifié ici ; la marge se règle dans Réglages.</p>
        </div>
      )}
    </div>
  );
}
