import { useCallback, useEffect, useRef, useState } from "react";
import { peek } from "@/lib/adminCache";
import { loadDeposits, loadPayouts, loadReceipts, loadScanState, loadWallets } from "@/lib/adminData";
import { ArrowUpRight, Check, ChevronDown, Copy, Inbox, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  attachDeposit, fetchPendingSells,
  ignoreDeposit, reconcilePayouts, scanDeposits, txUrl, updateSettings,
  type ChainDeposit, type InteracReceipt, type SettlementSettings, type UsdtPayout, type WalletState,
} from "@/lib/settlement";
import { C } from "./adminTheme";
import { Button, Field, Notice, SidePanel, Switch, TextInput, fieldInput } from "./ui";
import { DataTable, EmptyState, KeyValues, Pill, Section, Tabs, Toolbar, TwoLine, type Column, type Tone } from "./layout";
import { SettlementHero } from "./heroes";
import { DEPOSIT_PILL, PAYOUT_PILL } from "./orderBits";

/*
 * Règlement des achats et des ventes : portefeuille d'envoi (soldes par
 * réseau), réglages de l'envoi automatique, avis Interac lus sur
 * interac@ooble.ca, envois d'USDT, et USDT reçus pour les ventes (lus sur la
 * blockchain toutes les 2 minutes). Un virement rapproché déclenche l'envoi
 * seul si les réglages le permettent ; sinon l'équipe clique « Envoyer les
 * USDT » dans la fiche. Une vente dont les USDT sont rapprochés passe à
 * « paiement reçu » : il reste à envoyer le virement Interac (fiche).
 */

const dateFmt = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const nf = (n: number, d = 2) => new Intl.NumberFormat("fr-CA", { maximumFractionDigits: d }).format(n);
const ref = (id: string | null) => (id ? `OOB-${id.slice(0, 8).toUpperCase()}` : "N/D");
const short = (a: string) => (a.length > 18 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a);
const mono: React.CSSProperties = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12.5 };

const RECEIPT: Record<InteracReceipt["status"], { label: string; tone: Tone }> = {
  matched: { label: "Rapproché", tone: "ok" },
  unmatched: { label: "Sans commande", tone: "warn" },
  mismatch: { label: "À vérifier", tone: "danger" },
  duplicate: { label: "Doublon", tone: "neutral" },
  ignored: { label: "Ignoré", tone: "neutral" },
};
const NET_NAME: Record<string, string> = { trc20: "Tron", bep20: "BNB Chain", polygon: "Polygon", avalanche: "Avalanche", erc20: "Ethereum", spl: "Solana" };
const netName = (n: string) => NET_NAME[n] ?? n.toUpperCase();
/** Logo du réseau (fichiers de /public/coins). */
const COIN: Record<string, string> = { trc20: "trx", trx: "trx", bep20: "bnb", bnb: "bnb", polygon: "matic", matic: "matic", erc20: "eth", eth: "eth", avalanche: "avax", avax: "avax", spl: "sol", sol: "sol", solana: "sol" };
function NetLogo({ network, size = 22 }: { network: string; size?: number }) {
  const coin = COIN[network.toLowerCase()];
  if (!coin) return <span aria-hidden style={{ width: size, height: size, borderRadius: 99, background: C.l3, flexShrink: 0, display: "inline-block" }} />;
  return <img src={`/coins/${coin}.svg`} alt="" width={size} height={size} style={{ borderRadius: 99, flexShrink: 0, display: "block" }} />;
}

function CopyBtn({ value }: { value: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" aria-label="Copier l'adresse" title="Copier" className="ui-btn ui-btn-ghost"
      onClick={(e) => { e.stopPropagation(); void navigator.clipboard.writeText(value); setOk(true); setTimeout(() => setOk(false), 1200); }}
      style={{ width: 26, height: 26, borderRadius: 7, border: "none", background: "transparent", color: ok ? C.successText : C.t3, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {ok ? <Check style={{ width: 13, height: 13 }} /> : <Copy style={{ width: 13, height: 13 }} />}
    </button>
  );
}

function TxLink({ network, hash, label = "Voir la transaction" }: { network: string; hash: string | null; label?: string }) {
  const url = hash ? txUrl(network, hash) : "";
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
      style={{ display: "inline-flex", alignItems: "center", gap: 3, color: C.t1, fontSize: 13, textDecoration: "underline", textUnderlineOffset: 3, textDecorationColor: C.bd }}>
      {label} <ArrowUpRight style={{ width: 13, height: 13 }} />
    </a>
  );
}

/** Rattacher un dépôt à une vente en attente, ou l'écarter avec un motif. */
function DepositActions({ d, onDone }: { d: ChainDeposit; onDone: () => void }) {
  const [sells, setSells] = useState<{ id: string; usdt_amount: number; created_at: string }[] | null>(null);
  const [pick, setPick] = useState(d.order_id ?? "");
  const [why, setWhy] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { fetchPendingSells(d.network).then(setSells); }, [d.network]);
  const run = async (fn: () => Promise<{ error?: string }>) => {
    setMsg(null);
    const r = await fn();
    if (r.error) setMsg(r.error); else onDone();
  };
  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div style={{ display: "grid", gap: 10 }}>
        <Field label="Rattacher à une vente" hint="Ventes du même réseau qui attendent encore les USDT du client.">
          <select className="ui-input" style={fieldInput} value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">{sells === null ? "Chargement…" : sells.length ? "Choisir la vente…" : "Aucune vente en attente sur ce réseau"}</option>
            {(sells ?? []).map((o) => <option key={o.id} value={o.id}>{ref(o.id)} · {nf(Number(o.usdt_amount))} USDT · {dateFmt.format(new Date(o.created_at))}</option>)}
          </select>
        </Field>
        <div><Button variant="primary" size="sm" disabled={!pick} onClick={() => run(() => attachDeposit(d.id, pick))}>Rattacher</Button></div>
      </div>
      <div style={{ display: "grid", gap: 10, paddingTop: 20, borderTop: `1px solid ${C.bds}` }}>
        <Field label="Écarter ce dépôt" hint="Le motif reste dans le registre.">
          <TextInput placeholder="Test interne, remboursé…" value={why} onChange={(e) => setWhy(e.target.value)} />
        </Field>
        <div><Button size="sm" disabled={!why.trim()} onClick={() => run(() => ignoreDeposit(d.id, why))}>Écarter</Button></div>
      </div>
      {msg && <Notice tone="err">{msg}</Notice>}
    </div>
  );
}

/** Montants proposés (le montant actuel est ajouté s'il n'y figure pas). */
const MAX_ORDER_CHOICES = [250, 500, 1000, 1500, 2000, 3000, 5000, 7500, 10000];
const DAILY_CHOICES = [1000, 2500, 5000, 10000, 15000, 20000, 30000, 50000];

/**
 * Choix d'un montant dans une liste : une tuile avec le libellé et le montant en grand ;
 * le menu natif (sélecteur iOS, liste du navigateur) s'ouvre au toucher.
 */
function AmountPicker({ label, unit, value, choices, onChange, disabled }: {
  label: string; unit: string; value: number; choices: number[]; onChange: (v: number) => void; disabled?: boolean;
}) {
  const list = [...new Set([...choices, Number(value) || 0])].filter((n) => n > 0).sort((a, b) => a - b);
  return (
    <label className="st-pick" style={{
      position: "relative", display: "block", minWidth: 0, padding: "12px 40px 12px 14px", borderRadius: 14,
      background: C.l1, boxShadow: `inset 0 0 0 1px ${C.bds}`, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1,
    }}>
      <span style={{ display: "block", fontSize: 12.5, color: C.t3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      <span style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}>
        <span style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.02em", color: C.t1, fontVariantNumeric: "tabular-nums" }}>{nf(Number(value) || 0, 0)}</span>
        <span style={{ fontSize: 13, color: C.t2 }}>{unit}</span>
      </span>
      <ChevronDown aria-hidden style={{ position: "absolute", right: 14, top: "50%", width: 16, height: 16, marginTop: -8, color: C.t3 }} />
      <select aria-label={label} disabled={disabled} value={String(Number(value) || 0)} onChange={(e) => onChange(Number(e.target.value))}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "inherit", fontSize: 16 }}>
        {list.map((n) => <option key={n} value={n}>{nf(n, 0)} {unit}</option>)}
      </select>
    </label>
  );
}

type Tab = "wallet" | "receipts" | "payouts" | "deposits";

const SettlementPanel = () => {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>("wallet");
  // Les dernières données connues s'affichent tout de suite ; la mise à jour arrive ensuite.
  const cachedW = peek<Awaited<ReturnType<typeof loadWallets>>>("st.wallets")?.value;
  const [wallets, setWallets] = useState<WalletState[] | null>(cachedW?.wallets ?? null);
  const [settings, setSettings] = useState<SettlementSettings | null>(cachedW?.settings ?? null);
  const [draft, setDraft] = useState<SettlementSettings | null>(cachedW?.settings ?? null);
  const [receipts, setReceipts] = useState<InteracReceipt[]>(peek<InteracReceipt[]>("st.receipts")?.value ?? []);
  const [payouts, setPayouts] = useState<UsdtPayout[]>(peek<UsdtPayout[]>("st.payouts")?.value ?? []);
  const [deposits, setDeposits] = useState<ChainDeposit[]>(peek<ChainDeposit[]>("st.deposits")?.value ?? []);
  const lastOf = (sc?: { updated_at: string }[]) => sc?.map((x) => x.updated_at).sort().pop() ?? null;
  const [lastScan, setLastScan] = useState<string | null>(lastOf(peek<{ updated_at: string }[]>("st.scan")?.value));
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [receipt, setReceipt] = useState<InteracReceipt | null>(null);
  const [deposit, setDeposit] = useState<ChainDeposit | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    // Chaque liste s'affiche dès qu'elle arrive ; les soldes (blockchains, plus lents) n'attendent personne.
    const lists = Promise.all([
      loadDeposits().then(setDeposits),
      loadReceipts().then(setReceipts),
      loadPayouts().then(setPayouts),
      loadScanState().then((sc) => setLastScan(lastOf(sc))),
    ]);
    const w = await loadWallets();
    if (!w.ok) setErr(w.error ?? "Portefeuille indisponible.");
    else { setErr(null); setWallets(w.wallets ?? []); setSettings(w.settings ?? null); setDraft((d) => (d && JSON.stringify(d) !== JSON.stringify(settingsRef.current) ? d : w.settings ?? null)); }
    await lists;
    setBusy(false);
  }, []);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    const res = await updateSettings({
      auto_payout: draft.auto_payout,
      auto_payout_max_cad: Number(draft.auto_payout_max_cad),
      daily_payout_max_usdt: Number(draft.daily_payout_max_usdt),
    });
    setSaving(false);
    if (res.error) setErr(res.error);
    else { setSaved(true); setTimeout(() => setSaved(false), 2000); void load(); }
  };

  const all = wallets ?? [];
  const lowGas = (w: WalletState) => w.configured && !w.error && (w.gas ?? 0) < (w.minGas ?? 0);
  const receiptsToCheck = receipts.filter((r) => r.status === "mismatch" || r.status === "unmatched").length;
  const payoutsToCheck = payouts.filter((p) => p.status === "review" || p.status === "failed").length;
  const depositsToCheck = deposits.filter((d) => d.status === "review" || d.status === "unmatched").length;
  const toReview = receiptsToCheck + payoutsToCheck + depositsToCheck;
  const scanNow = async () => {
    setScanMsg("Lecture des blockchains…");
    const r = await scanDeposits();
    setScanMsg(r.error ? `Lecture impossible : ${r.error}` : `${r.found ?? 0} nouveau(x) dépôt(s), ${r.matched ?? 0} vente(s) rapprochée(s).`);
    void load();
  };
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const refresh = (
    <Button size="sm" variant="ghost" disabled={busy} onClick={() => { void reconcilePayouts().then(load); }}
      icon={<RefreshCw style={{ width: 14, height: 14, animation: busy ? "spin 1s linear infinite" : undefined }} />}>
      {busy ? "Actualisation…" : "Actualiser"}
    </Button>
  );

  /* ─── Colonnes ─── */
  const walletCols: Column<WalletState>[] = [
    { key: "net", header: "Réseau", render: (w) => <TwoLine lead={<NetLogo network={w.network} size={26} />} primary={w.label} secondary={w.gasSymbol ? `Frais en ${w.gasSymbol}` : undefined} /> },
    { key: "addr", header: "Adresse d'envoi", hideBelow: 900, render: (w) => w.address
      ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.t2, ...mono }} title={w.address}>{short(w.address)}<CopyBtn value={w.address} /></span>
      : <span style={{ color: C.t3 }}>Non configurée</span> },
    { key: "usdt", header: "USDT", align: "right", sort: (w) => w.usdt ?? -1, render: (w) => (w.configured && !w.error ? nf(w.usdt ?? 0) : <span style={{ color: C.t3 }}>N/D</span>) },
    { key: "gas", header: "Frais", align: "right", render: (w) => (w.configured && !w.error
      ? <span style={{ color: lowGas(w) ? C.dangerText : C.t2 }}>{nf(w.gas ?? 0, 4)} {w.gasSymbol}</span>
      : <span style={{ color: C.t3 }}>N/D</span>) },
    { key: "state", header: "État", align: "right", render: (w) => !w.configured ? <Pill>Clé absente</Pill>
      : w.error ? <span title={w.error}><Pill tone="danger" dot>Erreur réseau</Pill></span>
        : lowGas(w) ? <span title={`Minimum ${w.minGas} ${w.gasSymbol}`}><Pill tone="warn" dot>Frais bas</Pill></span>
          : <Pill tone="ok" dot>Prêt</Pill> },
  ];

  const receiptCols: Column<InteracReceipt>[] = [
    { key: "who", header: "Expéditeur", sort: (r) => r.sender_name ?? "", render: (r) => <TwoLine primary={r.sender_name || "Expéditeur inconnu"} secondary={r.order_ref ?? "Sans référence"} /> },
    { key: "status", header: "État", render: (r) => <Pill tone={RECEIPT[r.status].tone}>{RECEIPT[r.status].label}</Pill> },
    { key: "reason", header: "Détail", hideBelow: 1100, render: (r) => <span style={{ color: C.t3, display: "block", maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.reason ?? ""}</span> },
    { key: "amt", header: "Montant", align: "right", sort: (r) => r.amount_cad ?? 0, render: (r) => (r.amount_cad != null ? `${nf(r.amount_cad)} $` : "N/D") },
    { key: "date", header: "Reçu", align: "right", sort: (r) => r.received_at, hideBelow: 760, render: (r) => <span style={{ color: C.t2, whiteSpace: "nowrap" }}>{dateFmt.format(new Date(r.received_at))}</span> },
  ];

  const payoutCols: Column<UsdtPayout>[] = [
    { key: "order", header: "Commande", sort: (p) => p.order_id, render: (p) => <TwoLine primary={ref(p.order_id)} secondary={p.trigger === "auto" ? "Envoi automatique" : "Envoyé par l'équipe"} /> },
    { key: "status", header: "État", render: (p) => <Pill tone={PAYOUT_PILL[p.status]?.tone}>{PAYOUT_PILL[p.status]?.label ?? p.status}</Pill> },
    { key: "to", header: "Destination", hideBelow: 1000, render: (p) => p.error
      ? <span style={{ color: C.dangerText, display: "block", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.error}>{p.error}</span>
      : <span style={{ color: C.t2, ...mono }} title={p.to_address}>{short(p.to_address)}</span> },
    { key: "amt", header: "Montant", align: "right", sort: (p) => Number(p.usdt_amount), render: (p) => <TwoLine primary={`${nf(Number(p.usdt_amount))} USDT`} secondary={<span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><NetLogo network={p.network} size={14} />{netName(p.network)}</span>} /> },
    { key: "tx", header: "", align: "right", hideBelow: 760, render: (p) => <TxLink network={p.network} hash={p.tx_hash} label="Transaction" /> },
    { key: "date", header: "Date", align: "right", sort: (p) => p.created_at, hideBelow: 760, render: (p) => <span style={{ color: C.t2, whiteSpace: "nowrap" }}>{dateFmt.format(new Date(p.created_at))}</span> },
  ];

  const depositCols: Column<ChainDeposit>[] = [
    { key: "amt", header: "Montant", sort: (d) => Number(d.usdt_amount), render: (d) => <TwoLine lead={<NetLogo network={d.network} size={26} />} primary={`${nf(Number(d.usdt_amount))} USDT`} secondary={netName(d.network)} /> },
    { key: "status", header: "État", render: (d) => <Pill tone={DEPOSIT_PILL[d.status]?.tone}>{DEPOSIT_PILL[d.status]?.label ?? d.status}</Pill> },
    { key: "order", header: "Vente", hideBelow: 900, render: (d) => (d.order_id ? ref(d.order_id) : <span style={{ color: C.t3 }}>Aucune</span>) },
    { key: "reason", header: "Détail", hideBelow: 1180, render: (d) => <span style={{ color: C.t3, display: "block", maxWidth: 340, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.reason ?? "En attente d'une vente du même montant"}</span> },
    { key: "date", header: "Reçu", align: "right", sort: (d) => d.block_time, render: (d) => <span style={{ color: C.t2, whiteSpace: "nowrap" }}>{dateFmt.format(new Date(d.block_time))}</span> },
  ];

  const mobileRow = (primary: React.ReactNode, secondary: React.ReactNode, right: React.ReactNode, pill: React.ReactNode) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}><TwoLine primary={primary} secondary={secondary} /></div>
      <div style={{ textAlign: "right", display: "grid", gap: 4, justifyItems: "end" }}>
        <span style={{ fontSize: 13.5, fontVariantNumeric: "tabular-nums" }}>{right}</span>{pill}
      </div>
    </div>
  );

  return (
    <div>
      {err && <div style={{ marginBottom: 16 }}><Notice tone="err">{err}</Notice></div>}

      <SettlementHero loading={wallets === null && !err} auto={!!settings?.auto_payout} maxCad={settings ? Number(settings.auto_payout_max_cad) : null} toReview={toReview}
        tanks={all.filter((w) => w.configured).map((w) => ({
          network: w.network, label: w.label, usdt: w.usdt ?? 0, gas: w.gas ?? 0, minGas: w.minGas ?? 0, gasSymbol: w.gasSymbol,
          ok: !w.error, logo: <NetLogo network={w.network} size={20} />,
        }))} />

      <Tabs value={tab} onChange={setTab} items={[
        { id: "wallet", label: "Portefeuille et réglages" },
        { id: "receipts", label: "Avis Interac", count: receipts.length, tone: receiptsToCheck ? "warn" : undefined },
        { id: "payouts", label: "Envois USDT", count: payouts.length, tone: payoutsToCheck ? "danger" : undefined },
        { id: "deposits", label: "Dépôts des ventes", count: deposits.length, tone: depositsToCheck ? "warn" : undefined },
      ]} />

      {tab === "wallet" && (
        <div className="st-grid">
          <div style={{ minWidth: 0 }}>
            <Toolbar right={refresh}>
              <span style={{ fontSize: 12.5, color: C.t3 }}>Soldes lus en direct sur chaque réseau.</span>
            </Toolbar>
            <DataTable
              rows={all}
              columns={walletCols}
              rowKey={(w) => w.network}
              empty={<EmptyState title={wallets === null ? "Chargement des soldes…" : "Aucun réseau"} />}
              mobile={(w) => mobileRow(<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><NetLogo network={w.network} size={20} />{w.label}</span>, w.address ? short(w.address) : "Non configurée",
                w.configured && !w.error ? `${nf(w.usdt ?? 0)} USDT` : "N/D",
                !w.configured ? <Pill>Clé absente</Pill> : w.error ? <Pill tone="danger">Erreur</Pill> : lowGas(w) ? <Pill tone="warn">Frais bas</Pill> : <Pill tone="ok">Prêt</Pill>)}
            />
            <p style={{ margin: "14px 0 0", fontSize: 12.5, lineHeight: 1.6, color: C.t3, maxWidth: 640 }}>
              Solana reste manuel pour l'instant. Approvisionnez chaque adresse en USDT et en jeton de frais (TRX, BNB ou POL)
              depuis votre réserve. Gardez-y seulement le nécessaire aux envois du moment.
            </p>
          </div>

          {draft && (
            <aside className="st-aside">
              <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 500 }}>Envoi automatique</h2>
              <p style={{ margin: "0 0 20px", fontSize: 12.5, color: C.t3, lineHeight: 1.55 }}>Pour les achats payés par Interac.</p>
              <div style={{ display: "grid", gap: 20 }}>
                <Switch
                  checked={draft.auto_payout}
                  disabled={!isAdmin}
                  onChange={(v) => setDraft({ ...draft, auto_payout: v })}
                  label="Envoyer les USDT sans clic de l'équipe"
                  hint="Dès qu'un virement Interac est reçu et rapproché d'un achat."
                />
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 10 }}>
                  <AmountPicker label="Par commande" unit="$ CA" choices={MAX_ORDER_CHOICES}
                    value={draft.auto_payout_max_cad} disabled={!isAdmin} onChange={(v) => setDraft({ ...draft, auto_payout_max_cad: v })} />
                  <AmountPicker label="Sur 24 heures" unit="USDT" choices={DAILY_CHOICES}
                    value={draft.daily_payout_max_usdt} disabled={!isAdmin} onChange={(v) => setDraft({ ...draft, daily_payout_max_usdt: v })} />
                </div>
                <p style={{ margin: "-8px 0 0", fontSize: 12, color: C.t3 }}>Au-delà du maximum par commande, l'équipe valide l'envoi. Le plafond sur 24 heures compte tous les envois.</p>
                <div>
                  <p style={{ margin: "0 0 8px", fontSize: 12.5, color: C.t2 }}>L'envoi part seul seulement si</p>
                  <div style={{ display: "grid", gap: 5 }}>
                    {["L'avis Interac est authentique (signature d'Interac)", "Référence, montant exact et nom du client concordent", "Le client est vérifié", "Le montant est sous le maximum par commande"].map((t) => (
                      <div key={t} style={{ display: "flex", gap: 8, fontSize: 12.5, lineHeight: 1.5, color: C.t3 }}>
                        <Check style={{ width: 13, height: 13, marginTop: 3, flexShrink: 0, color: C.t2 }} />{t}
                      </div>
                    ))}
                  </div>
                  <p style={{ margin: "10px 0 0", fontSize: 12.5, lineHeight: 1.55, color: C.t3 }}>
                    Sinon, l'achat reste « paiement reçu » et l'équipe clique « Envoyer les USDT » dans sa fiche ; la raison est notée dans l'historique.
                    Le plafond sur 24 h s'applique à tous les envois.
                  </p>
                </div>
                {isAdmin ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Button variant="primary" disabled={!dirty || saving} onClick={save}>{saving ? "Enregistrement…" : "Enregistrer"}</Button>
                    {dirty && !saving && <Button variant="ghost" onClick={() => setDraft(settings)}>Annuler</Button>}
                    {saved && <span style={{ fontSize: 12.5, color: C.successText }}>Enregistré</span>}
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: 12.5, color: C.t3 }}>Seul un administrateur peut modifier ces réglages.</p>
                )}
              </div>
            </aside>
          )}
        </div>
      )}

      {tab === "receipts" && (
        <>
          <Toolbar right={refresh}>
            <span style={{ fontSize: 12.5, color: C.t3 }}>Avis reçus sur interac@ooble.ca, rapprochés des achats par référence, montant et nom.</span>
          </Toolbar>
          <DataTable
            rows={receipts}
            columns={receiptCols}
            rowKey={(r) => r.id}
            onRowClick={setReceipt}
            selectedKey={receipt?.id}
            initialSort={{ key: "date", dir: "desc" }}
            empty={<EmptyState icon={Inbox} title="Aucun avis" text="Aucun avis reçu pour l'instant sur interac@ooble.ca." />}
            mobile={(r) => mobileRow(r.sender_name || "Expéditeur inconnu", `${r.order_ref ?? "Sans référence"} · ${dateFmt.format(new Date(r.received_at))}`,
              r.amount_cad != null ? `${nf(r.amount_cad)} $` : "N/D", <Pill tone={RECEIPT[r.status].tone}>{RECEIPT[r.status].label}</Pill>)}
          />
        </>
      )}

      {tab === "payouts" && (
        <>
          <Toolbar right={refresh}>
            <span style={{ fontSize: 12.5, color: C.t3 }}>Les 30 derniers envois d'USDT depuis le portefeuille.</span>
          </Toolbar>
          <DataTable
            rows={payouts}
            columns={payoutCols}
            rowKey={(p) => p.id}
            initialSort={{ key: "date", dir: "desc" }}
            empty={<EmptyState icon={Inbox} title="Aucun envoi" text="Aucun envoi d'USDT pour l'instant." />}
            mobile={(p) => mobileRow(<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><NetLogo network={p.network} size={20} />{ref(p.order_id)}</span>, <>{netName(p.network)} · {dateFmt.format(new Date(p.created_at))}{p.tx_hash && <> · <TxLink network={p.network} hash={p.tx_hash} label="Transaction" /></>}</>,
              `${nf(Number(p.usdt_amount))} USDT`, <Pill tone={PAYOUT_PILL[p.status]?.tone}>{PAYOUT_PILL[p.status]?.label ?? p.status}</Pill>)}
          />
        </>
      )}

      {tab === "deposits" && (
        <>
          <Toolbar right={<Button size="sm" variant="ghost" onClick={scanNow} icon={<RefreshCw style={{ width: 14, height: 14 }} />}>Lire maintenant</Button>}>
            <span style={{ fontSize: 12.5, color: C.t3 }}>
              {scanMsg ?? <>Lu toutes les 2 minutes sur Tron, BNB Chain et Polygon (Solana : à la main).{lastScan && <> Dernière lecture : {dateFmt.format(new Date(lastScan))}.</>}</>}
            </span>
          </Toolbar>
          <DataTable
            rows={deposits}
            columns={depositCols}
            rowKey={(d) => d.id}
            onRowClick={setDeposit}
            selectedKey={deposit?.id}
            initialSort={{ key: "date", dir: "desc" }}
            empty={<EmptyState icon={Inbox} title="Aucun dépôt" text="Aucun dépôt d'USDT lu pour l'instant." />}
            mobile={(d) => mobileRow(<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><NetLogo network={d.network} size={20} />{nf(Number(d.usdt_amount))} USDT</span>, `${netName(d.network)} · ${dateFmt.format(new Date(d.block_time))}`,
              d.order_id ? ref(d.order_id) : "", <Pill tone={DEPOSIT_PILL[d.status]?.tone}>{DEPOSIT_PILL[d.status]?.label ?? d.status}</Pill>)}
          />
        </>
      )}

      {receipt && (
        <SidePanel title={receipt.sender_name || "Expéditeur inconnu"} subtitle={`Avis Interac · ${dateFmt.format(new Date(receipt.received_at))}`} onClose={() => setReceipt(null)}>
          <div style={{ marginBottom: 16 }}><Pill tone={RECEIPT[receipt.status].tone}>{RECEIPT[receipt.status].label}</Pill></div>
          <KeyValues items={[
            ["Montant", receipt.amount_cad != null ? `${nf(receipt.amount_cad)} $` : "N/D"],
            ["Référence de commande", receipt.order_ref ?? "Aucune"],
            ["Référence Interac", receipt.interac_ref ?? "N/D"],
            ["Avis authentifié", receipt.authenticated ? "Oui (signature d'Interac)" : "Non"],
            ["Détail", receipt.reason ?? ""],
          ]} />
          {receipt.body_text && (
            <Section title="Texte de l'avis" style={{ marginTop: 24 }}>
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 12.5, lineHeight: 1.6, color: C.t2 }}>{receipt.body_text}</pre>
            </Section>
          )}
        </SidePanel>
      )}

      {deposit && (
        <SidePanel title={`${nf(Number(deposit.usdt_amount))} USDT`} subtitle={`${netName(deposit.network)} · ${dateFmt.format(new Date(deposit.block_time))}`} onClose={() => setDeposit(null)}>
          <div style={{ marginBottom: 16 }}><Pill tone={DEPOSIT_PILL[deposit.status]?.tone}>{DEPOSIT_PILL[deposit.status]?.label ?? deposit.status}</Pill></div>
          <KeyValues items={[
            ["Réseau", <span key="n" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><NetLogo network={deposit.network} size={18} />{netName(deposit.network)}</span>],
            ["Expéditeur", deposit.from_address ? <span style={mono}>{deposit.from_address}</span> : "N/D"],
            ["Vente", deposit.order_id ? ref(deposit.order_id) : "Aucune"],
            ["Détail", deposit.reason ?? "En attente d'une vente du même montant (le client clique « J'ai envoyé mes USDT » après l'envoi)."],
            ["Transaction", <TxLink key="tx" network={deposit.network} hash={deposit.tx_hash} />],
          ]} />
          {deposit.status !== "matched" && deposit.status !== "ignored" && (
            <div style={{ marginTop: 28 }}>
              <DepositActions d={deposit} onDone={() => { setDeposit(null); void load(); }} />
            </div>
          )}
        </SidePanel>
      )}

      <style>{`
        .st-grid { display: grid; gap: 28px; grid-template-columns: minmax(0, 1fr); }
        /* Réglages dans un volet arrondi à côté de la liste : pas de trait vertical. */
        .st-aside { padding: 20px; border-radius: 16px; background: var(--a-hover2); align-self: start; }
        .st-pick { transition: box-shadow .15s }
        .st-pick:hover, .st-pick:focus-within { box-shadow: inset 0 0 0 1px ${C.bd} !important }
        @media (min-width: 1180px) {
          .st-grid { grid-template-columns: minmax(0, 1fr) 360px; }
          .st-aside { padding: 22px 22px 24px; margin-top: 16px; }
        }
      `}</style>
    </div>
  );
};

export default SettlementPanel;
