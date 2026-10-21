/**
 * Outils de l'équipe (Ressources › Outils) : les petits outils du quotidien, rangés par usage.
 * Chacun ne voit que ceux de ses rôles ; chaque outil s'ouvre en volet, sans quitter la page.
 */
import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, CalendarCheck, ChevronRight, Landmark, Loader2, ScanSearch, Scale, Wallet } from "lucide-react";
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
interface ToolDef { id: ToolId; icon: React.ComponentType<{ style?: React.CSSProperties }>; name: string; desc: string; roles?: string[] }
const GROUPS: { title: string; desc: string; tools: ToolDef[] }[] = [
  { title: "Pour tout le monde", desc: "Les vérifications rapides de chaque jour.", tools: [
    { id: "convert", icon: ArrowLeftRight, name: "Convertisseur", desc: "Dollars et cryptomonnaie, au taux du moment, à l'achat comme à la vente." },
    { id: "address", icon: Wallet, name: "Vérificateur d'adresse", desc: "Réseau, adresse d'Ooble ou d'un client, liste de sanctions." },
    { id: "tx", icon: ScanSearch, name: "Explorateur de transaction", desc: "Un hash : l'envoi ou le dépôt, sa commande, l'explorateur du réseau." },
  ] },
  { title: "Opérations", desc: "Ouvrir et fermer la journée proprement.", tools: [
    { id: "day", icon: CalendarCheck, name: "Checklist de la journée", desc: "Ouverture et fermeture, signées, avec l'état de la file et du stock." },
  ] },
  { title: "Conformité", desc: "Les seuils du CANAFE, client par client.", tools: [
    { id: "rule24", icon: Scale, name: "Règle des 24 heures", desc: "Les opérations d'un client sur 24 heures glissantes, et le seuil de 10 000 $.", roles: ["admin", "compliance"] },
  ] },
  { title: "Comptabilité", desc: "Les références officielles.", tools: [
    { id: "boc", icon: Landmark, name: "Taux de la Banque du Canada", desc: "Le taux officiel USD/CAD d'un jour, comparé à notre cours." },
  ] },
];

const CSS = `
.tl-group { margin-top: 34px; }
.tl-group:first-child { margin-top: 0; }
.tl-h { margin: 0; font-size: 17px; font-weight: 500; color: var(--a-t1); letter-spacing: -0.01em; }
.tl-sub { margin: 4px 0 8px; font-size: 13px; color: var(--a-t3); }
.tl-row { all: unset; box-sizing: border-box; width: 100%; display: flex; align-items: center; gap: 14px; padding: 14px 4px; border-bottom: 1px solid var(--a-bds); cursor: pointer; font-family: inherit; transition: transform .25s cubic-bezier(.22,1,.36,1); }
.tl-row:hover { transform: translateX(3px); }
.tl-row:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 2px; border-radius: 6px; }
.tl-k { font-size: 12.5px; color: var(--a-t3); margin: 0 0 6px; }
.tl-big { margin: 0; font-size: 30px; font-weight: 600; letter-spacing: -0.035em; color: var(--a-t1); font-variant-numeric: tabular-nums; }
.tl-line { display: flex; justify-content: space-between; gap: 14px; padding: 9px 0; border-bottom: 1px solid var(--a-bds); font-size: 14px; }
.tl-line > span:first-child { color: var(--a-t3); }
.tl-line > span:last-child { color: var(--a-t1); text-align: right; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.tl-link { all: unset; cursor: pointer; color: var(--a-t1); text-decoration: underline; text-underline-offset: 4px; text-decoration-color: color-mix(in srgb, currentColor 40%, transparent); }
.tl-link:hover { text-decoration-color: currentColor; }
.tl-opts { display: flex; gap: 16px; flex-wrap: wrap; font-size: 14px; }
.tl-opt { all: unset; cursor: pointer; color: var(--a-t3); padding: 2px 0; }
.tl-opt[aria-pressed="true"] { color: var(--a-t1); text-decoration: underline; text-underline-offset: 5px; }
.tl-check { display: flex; gap: 12px; align-items: flex-start; padding: 11px 0; border-bottom: 1px solid var(--a-bds); cursor: pointer; font-size: 14px; color: var(--a-t1); }
.tl-check input { margin-top: 3px; width: 16px; height: 16px; accent-color: var(--a-t1); flex-shrink: 0; }
.tl-hint { display: block; margin-top: 3px; font-size: 12.5px; color: var(--a-t3); }
.tl-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; overflow-wrap: anywhere; }
`;

const cad = (n: number) => `${n.toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
const num = (n: number, d = 2) => n.toLocaleString("fr-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
const rate4 = (n: number) => n.toLocaleString("fr-CA", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const dt = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const short = (s: string) => (s.length > 20 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s);
const STATUS: Record<string, string> = {
  created: "Créée", awaiting_payment: "En attente du paiement", payment_received: "Paiement reçu", settling: "En règlement", completed: "Terminée",
  cancelled: "Annulée", expired: "Expirée", refunded: "Remboursée", matched: "Rattaché", unmatched: "Sans commande", review: "À vérifier",
  confirmed: "Confirmé", broadcast: "Diffusé", sending: "En cours", failed: "Échoué", pending: "En attente",
};

export default function ToolsPanel({ onOpenOrder, onShowClient }: { onOpenOrder?: (id: string) => void; onShowClient?: (id: string) => void }) {
  const { roles } = useAuth();
  const [open, setOpen] = useState<ToolId | null>(null);
  const can = (t: ToolDef) => !t.roles || roles.includes("admin") || t.roles.some((r) => roles.includes(r as never));
  const groups = GROUPS.map((g) => ({ ...g, tools: g.tools.filter(can) })).filter((g) => g.tools.length);
  const tool = GROUPS.flatMap((g) => g.tools).find((t) => t.id === open);
  // Ouvrir une commande ou une fiche depuis un outil ferme d'abord le volet.
  const goOrder = onOpenOrder ? (id: string) => { setOpen(null); onOpenOrder(id); } : undefined;
  const goClient = onShowClient ? (id: string) => { setOpen(null); onShowClient(id); } : undefined;

  return (
    <div style={{ fontFamily: FONT, maxWidth: 820 }}>
      <style>{CSS}</style>
      {groups.map((g) => (
        <section key={g.title} className="tl-group">
          <h2 className="tl-h">{g.title}</h2>
          <p className="tl-sub">{g.desc}</p>
          {g.tools.map((t) => (
            <button key={t.id} type="button" className="tl-row" onClick={() => setOpen(t.id)}>
              <t.icon style={{ width: 19, height: 19, color: C.t3, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 15, color: C.t1 }}>{t.name}</span>
                <span style={{ display: "block", marginTop: 2, fontSize: 13, color: C.t3 }}>{t.desc}</span>
              </span>
              <ChevronRight style={{ width: 16, height: 16, color: C.t3, flexShrink: 0 }} />
            </button>
          ))}
        </section>
      ))}

      {tool && (
        <SidePanel title={tool.name} subtitle={tool.desc} onClose={() => setOpen(null)} width={560}>
          <style>{CSS}</style>
          {tool.id === "convert" && <Converter />}
          {tool.id === "address" && <AddressTool onShowClient={goClient} />}
          {tool.id === "tx" && <TxTool onOpenOrder={goOrder} />}
          {tool.id === "day" && <DayChecklist />}
          {tool.id === "rule24" && <Rule24 onOpenOrder={goOrder} onShowClient={goClient} />}
          {tool.id === "boc" && <BocTool />}
        </SidePanel>
      )}
    </div>
  );
}

const Err = ({ text }: { text: string | null }) => (text ? <p style={{ margin: "14px 0 0", fontSize: 13.5, color: C.t1 }}>{text}</p> : null);
const Wait = () => <Loader2 style={{ width: 16, height: 16, color: C.t3, animation: "spin 1s linear infinite" }} />;

/* ─── Convertisseur ─── */
function Converter() {
  const sym = primaryAsset(getAppSettingsNow()).symbol;
  const [rate, setRate] = useState<LatestRate | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [unit, setUnit] = useState<"cad" | "crypto">("cad");
  const [amount, setAmount] = useState("");
  const load = () => { setErr(null); fetchLatestRate().then(setRate).catch(() => setErr("Taux indisponible pour l'instant.")); };
  useEffect(load, []);
  const v = Number(amount.replace(/\s/g, "").replace(",", "."));
  const r = rate ? (side === "buy" ? rate.buy : rate.sell) : 0;
  const out = !rate || !(v > 0) ? null : unit === "cad" ? v / r : v * r;
  const margin = rate?.market ? ((side === "buy" ? r / rate.market - 1 : 1 - r / rate.market) * 100) : null;
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="tl-opts">
        {([["buy", "Achat du client"], ["sell", "Vente du client"]] as const).map(([k, l]) => <button key={k} type="button" className="tl-opt" aria-pressed={side === k} onClick={() => setSide(k)}>{l}</button>)}
      </div>
      <div className="tl-opts">
        {([["cad", "J'ai un montant en dollars"], ["crypto", `J'ai un montant en ${sym}`]] as const).map(([k, l]) => <button key={k} type="button" className="tl-opt" aria-pressed={unit === k} onClick={() => setUnit(k)}>{l}</button>)}
      </div>
      <Field label={unit === "cad" ? "Montant en dollars" : `Montant en ${sym}`}>
        <TextInput inputMode="decimal" autoFocus placeholder={unit === "cad" ? "500" : "350"} value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      {!rate && !err && <Wait />}
      <Err text={err} />
      {rate && (
        <div>
          <p className="tl-k">{side === "buy" ? (unit === "cad" ? "Le client reçoit" : "Le client paie") : (unit === "cad" ? "Le client doit envoyer" : "Le client reçoit")}</p>
          <p className="tl-big">{out == null ? "—" : unit === "cad" ? `${num(out, 2)} ${sym}` : cad(out)}</p>
          <div style={{ marginTop: 14 }}>
            <div className="tl-line"><span>Taux {side === "buy" ? "à l'achat" : "à la vente"}</span><span>1 {sym} = {rate4(r)} $</span></div>
            {rate.market != null && <div className="tl-line"><span>Cours du marché</span><span>1 {sym} = {rate4(rate.market)} $</span></div>}
            {margin != null && <div className="tl-line"><span>Marge d'Ooble</span><span>{num(margin, 2)} %</span></div>}
            <div className="tl-line"><span>Taux publié</span><span>{dt.format(new Date(rate.at))}</span></div>
          </div>
          <button type="button" className="tl-link" style={{ marginTop: 14, fontSize: 13.5 }} onClick={load}>Actualiser le taux</button>
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
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <Field label="Adresse de portefeuille">
        <TextInput autoFocus spellCheck={false} autoCapitalize="none" placeholder="0x…, T…, ou une adresse Solana" value={q}
          onChange={(e) => { setQ(e.target.value); setRep(null); }} onKeyDown={(e) => { if (e.key === "Enter") void run(); }} />
      </Field>
      {q.trim() && !fam && <p style={{ margin: 0, fontSize: 14, color: C.t1 }}>Ce n'est pas une adresse valide sur nos réseaux (BNB Chain, Polygon, Avalanche, Solana, Tron).</p>}
      {fam && <Button variant="primary" disabled={busy} onClick={() => void run()}>{busy ? "Vérification…" : "Vérifier"}</Button>}
      <Err text={err} />
      {rep && fam && (
        <div>
          {rep.sanctioned.length > 0 && (
            <p style={{ margin: "0 0 14px", fontSize: 15, lineHeight: 1.5, color: C.t1, fontWeight: 600 }}>
              Adresse sanctionnée (liste OFAC{rep.sanctioned[0].network ? `, ${rep.sanctioned[0].network}` : ""}). Ne rien envoyer, ne rien dire au client, prévenir la conformité.
            </p>
          )}
          <div className="tl-line"><span>Réseaux</span><span>{FAMILY_NETS[fam].map((n) => n.name).join(", ")}</span></div>
          <div className="tl-line"><span>Liste de sanctions</span><span>{rep.sanctioned.length ? "Présente" : "Absente"}</span></div>
          <div className="tl-line"><span>À Ooble</span><span>{rep.ooble_deposit ? `Adresse de dépôt${rep.ooble_deposit.active ? "" : " (remplacée)"}` : rep.ooble_payout ? "Portefeuille d'envoi" : "Non"}</span></div>
          <div className="tl-line"><span>Commandes avec cette adresse</span><span>{rep.orders}</span></div>
          <p className="tl-k" style={{ marginTop: 18 }}>Clients liés</p>
          {rep.clients.length === 0 ? <p style={{ margin: 0, fontSize: 14, color: C.t3 }}>Aucun client connu avec cette adresse.</p> : rep.clients.map((c) => (
            <div key={c.user_id} className="tl-line">
              <span>{onShowClient ? <button type="button" className="tl-link" onClick={() => onShowClient(c.user_id)}>{c.name || c.email || "Client"}</button> : (c.name || c.email)}</span>
              <span style={{ color: C.t2 }}>{[c.declared && `${c.declared} déclarée${c.declared > 1 ? "s" : ""}`, c.deposits && `${c.deposits} dépôt${c.deposits > 1 ? "s" : ""}`, c.payouts && `${c.payouts} envoi${c.payouts > 1 ? "s" : ""}`].filter(Boolean).join(" · ") || "connue"}</span>
            </div>
          ))}
          {rep.clients.length > 1 && <p style={{ margin: "10px 0 0", fontSize: 13, color: C.t1 }}>Plusieurs clients partagent cette adresse : à regarder.</p>}
          <p className="tl-k" style={{ marginTop: 18 }}>Voir sur l'explorateur</p>
          <div className="tl-opts">{FAMILY_NETS[fam].map((n) => <a key={n.id} className="tl-link" href={n.addr + q.trim()} target="_blank" rel="noreferrer">{n.name}</a>)}</div>
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
  const hits = rep ? [...rep.payouts.map((h) => ({ ...h, kind: "Envoi d'Ooble" })), ...rep.deposits.map((h) => ({ ...h, kind: "Dépôt reçu" })), ...rep.declared.map((h) => ({ ...h, kind: "Déclaré par le client" }))] : [];
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <Field label="Hash de la transaction">
        <TextInput autoFocus spellCheck={false} autoCapitalize="none" placeholder="0x…, ou un hash Solana ou Tron" value={q}
          onChange={(e) => { setQ(e.target.value); setRep(null); }} onKeyDown={(e) => { if (e.key === "Enter") void run(); }} />
      </Field>
      {q.trim() && !fam && <p style={{ margin: 0, fontSize: 14, color: C.t1 }}>Ce n'est pas un hash de transaction reconnu.</p>}
      {fam && <Button variant="primary" disabled={busy} onClick={() => void run()}>{busy ? "Recherche…" : "Chercher"}</Button>}
      <Err text={err} />
      {rep && fam && (
        <div>
          {hits.length === 0 ? <p style={{ margin: 0, fontSize: 14, color: C.t3 }}>Aucune commande d'Ooble ne correspond à ce hash. Il peut s'agir d'une transaction sans lien avec nous.</p> : hits.map((h, i) => (
            <div key={i} style={{ padding: "4px 0 10px" }}>
              <div className="tl-line"><span>{h.kind}</span><span>{h.order_id && onOpenOrder ? <button type="button" className="tl-link" onClick={() => onOpenOrder(h.order_id!)}>Commande {orderRef(h.order_id)}</button> : h.order_id ? `Commande ${orderRef(h.order_id)}` : "Sans commande"}</span></div>
              <div className="tl-line"><span>Réseau</span><span>{NET_NAME[h.network] ?? h.network}</span></div>
              <div className="tl-line"><span>Montant</span><span>{num(Number(h.amount), 2)} {String(h.asset).toUpperCase()}</span></div>
              <div className="tl-line"><span>État</span><span>{STATUS[h.status] ?? h.status}</span></div>
              {(h.to || h.from) && <div className="tl-line"><span>{h.to ? "Vers" : "Depuis"}</span><span className="tl-mono">{short(String(h.to || h.from))}</span></div>}
              {h.at && <div className="tl-line"><span>Le</span><span>{dt.format(new Date(h.at))}</span></div>}
            </div>
          ))}
          <p className="tl-k" style={{ marginTop: 14 }}>Voir sur l'explorateur</p>
          <div className="tl-opts">{FAMILY_NETS[fam].map((n) => <a key={n.id} className="tl-link" href={n.tx + q.trim()} target="_blank" rel="noreferrer">{n.name}</a>)}</div>
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
  const rows = c.stock.filter((s) => s.asset === sym && ["bep20", "polygon", "spl", "avalanche"].includes(s.network));
  const low = rows.filter((s) => Number(s.gas) < Number(s.min_gas)).map((s) => NET_NAME[s.network]);
  return rows.map((s) => `${NET_NAME[s.network]} ${num(Number(s.balance), 2)}`).join(" · ") + (low.length ? ` · gaz bas : ${low.join(", ")}` : "");
}
function DayChecklist() {
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
  const timeFmt = (iso: string) => new Date(iso).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div className="tl-opts">
        {([["open", "Ouverture"], ["close", "Fermeture"]] as const).map(([k, l]) => <button key={k} type="button" className="tl-opt" aria-pressed={kind === k} onClick={() => setKind(k)}>{l}</button>)}
      </div>
      {checks === null ? <Wait /> : signed ? (
        <div>
          <p style={{ margin: 0, fontSize: 15, color: C.t1 }}>{kind === "open" ? "Ouverture" : "Fermeture"} signée par <b style={{ fontWeight: 600 }}>{signed.byName}</b> à {timeFmt(signed.at)}.</p>
          <div style={{ marginTop: 10 }}>
            {signed.items.map((it, i) => <div key={i} className="tl-line"><span>{it.text}</span><span>{it.done ? "Fait" : "Non fait"}</span></div>)}
          </div>
          {signed.note && <p style={{ margin: "12px 0 0", fontSize: 14, color: C.t2, whiteSpace: "pre-wrap" }}>{signed.note}</p>}
        </div>
      ) : (
        <div>
          {ITEMS[kind].map((it, i) => (
            <label key={i} className="tl-check">
              <input type="checkbox" checked={!!done[i]} onChange={(e) => setDone((d) => d.map((x, j) => (j === i ? e.target.checked : x)))} />
              <span>{it.text}{it.hint && ctx && <span className="tl-hint">{it.hint(ctx)}</span>}</span>
            </label>
          ))}
          <div style={{ marginTop: 16 }}>
            <Field label="Remarque (facultatif)"><TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ce qui reste à surveiller…" /></Field>
          </div>
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <Button variant="primary" disabled={busy} onClick={() => void sign()}>{busy ? "Signature…" : kind === "open" ? "Signer l'ouverture" : "Signer la fermeture"}</Button>
            <span style={{ fontSize: 13, color: C.t3 }}>{done.filter(Boolean).length} sur {ITEMS[kind].length} cochés</span>
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
            const part = (x?: DayCheck) => (x ? `${x.byName} à ${timeFmt(x.at)} (${x.items.filter((i) => i.done).length}/${x.items.length})` : "—");
            return <div key={d} className="tl-line"><span>{dayFmt(d)}</span><span>Ouverture : {part(o)} · Fermeture : {part(c)}</span></div>;
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
  return (
    <div style={{ display: "grid", gap: 18 }}>
      {!who ? (
        <>
          <Field label="Client"><TextInput autoFocus placeholder="Nom ou courriel" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
          {found.map((c) => (
            <button key={c.id} type="button" className="tl-row" onClick={() => setWho(c)}>
              <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 14.5, color: C.t1 }}>{c.name || c.email}</span><span style={{ display: "block", fontSize: 12.5, color: C.t3 }}>{c.email}</span></span>
              <ChevronRight style={{ width: 15, height: 15, color: C.t3 }} />
            </button>
          ))}
          {q.trim().length >= 2 && found.length === 0 && <p style={{ margin: 0, fontSize: 14, color: C.t3 }}>Aucun client trouvé.</p>}
        </>
      ) : (
        <>
          <p style={{ margin: 0, fontSize: 15, color: C.t1 }}>
            {onShowClient ? <button type="button" className="tl-link" onClick={() => onShowClient(who.id)}>{who.name || who.email}</button> : (who.name || who.email)}
            <button type="button" className="tl-link" style={{ marginLeft: 14, fontSize: 13, color: C.t3 }} onClick={() => { setWho(null); setW(null); }}>Changer de client</button>
          </p>
          <Err text={err} />
          {!w && !err && <Wait />}
          {w && (
            <div>
              <p className="tl-k">Depuis {dt.format(new Date(w.since))}</p>
              <p className="tl-big">{cad(buy + sell)}</p>
              <div style={{ marginTop: 12 }}>
                <div className="tl-line"><span>Achats (le client paie en dollars)</span><span>{cad(buy)}</span></div>
                <div className="tl-line"><span>Ventes (Ooble reçoit de la cryptomonnaie)</span><span>{cad(sell)}</span></div>
              </div>
              <p style={{ margin: "14px 0 0", fontSize: 14, lineHeight: 1.55, color: C.t1 }}>
                {sell >= LIMIT
                  ? <><b style={{ fontWeight: 600 }}>Seuil de 10 000 $ atteint sur les ventes.</b> Une déclaration d'opération importante en monnaie virtuelle est à faire : voir avec la conformité.</>
                  : buy + sell >= LIMIT
                    ? <>Plus de 10 000 $ échangés sur 24 heures. À examiner avec la conformité.</>
                    : <>Sous le seuil de 10 000 $ sur 24 heures.</>}
              </p>
              <p className="tl-k" style={{ marginTop: 18 }}>Opérations comptées</p>
              {w.orders.length === 0 ? <p style={{ margin: 0, fontSize: 14, color: C.t3 }}>Aucune opération payée sur 24 heures.</p> : w.orders.map((o) => (
                <div key={o.id} className="tl-line">
                  <span>{onOpenOrder ? <button type="button" className="tl-link" onClick={() => onOpenOrder(o.id)}>{orderRef(o.id)}</button> : orderRef(o.id)} · {o.side === "buy" ? "Achat" : "Vente"} · {dt.format(new Date(o.at))}</span>
                  <span>{cad(Number(o.cad))}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─── Taux de la Banque du Canada ─── */
function BocTool() {
  const [date, setDate] = useState(todayMontreal());
  const [res, setRes] = useState<{ date: string; rate: number; asked: string } | null>(null);
  const [ours, setOurs] = useState<LatestRate | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (d: string) => {
    setBusy(true); setErr(null); setRes(null);
    try { setRes(await fetchBocRate(d)); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  useEffect(() => { void run(todayMontreal()); fetchLatestRate().then(setOurs).catch(() => {}); }, []);
  const gap = res && ours?.market ? (ours.market / res.rate - 1) * 100 : null;
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <Field label="Date">
        <TextInput type="date" value={date} max={todayMontreal()} onChange={(e) => { setDate(e.target.value); if (e.target.value) void run(e.target.value); }} />
      </Field>
      {busy && <Wait />}
      <Err text={err} />
      {res && (
        <div>
          <p className="tl-k">Taux officiel</p>
          <p className="tl-big">1 USD = {rate4(res.rate)} $</p>
          <div style={{ marginTop: 12 }}>
            <div className="tl-line"><span>Publié le</span><span>{new Date(`${res.date}T12:00:00`).toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span></div>
            {res.date !== res.asked && <div className="tl-line"><span>Remarque</span><span>Pas de taux ce jour-là : dernier taux publié avant</span></div>}
            {ours?.market != null && date === todayMontreal() && <div className="tl-line"><span>Notre cours du marché (USDC)</span><span>{rate4(ours.market)} $</span></div>}
            {gap != null && date === todayMontreal() && <div className="tl-line"><span>Écart</span><span>{gap >= 0 ? "+" : ""}{num(gap, 2)} %</span></div>}
          </div>
          <p style={{ margin: "14px 0 0", fontSize: 12.5, color: C.t3 }}>Source : Banque du Canada. Taux publié les jours ouvrables vers 16 h 30 (heure de l'Est).</p>
        </div>
      )}
    </div>
  );
}
