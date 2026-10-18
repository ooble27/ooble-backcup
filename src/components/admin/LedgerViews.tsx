import { useEffect, useRef, useState } from "react";
import { Paperclip, Plus } from "lucide-react";
import { nfCad, nfUsdt } from "@/lib/adminOrders";
import { NET_LOGO, NET_NAME, monthLabel } from "@/lib/accounting";
import {
  EXPENSE_CATS, FUNDING_LABEL, addExpense, addPurchase, catLabel, listExpenses, listPurchases, receiptUrl, stopRecurring, uploadReceipt, voidEntry,
  type Expense, type Funding, type Pnl, type Purchase,
} from "@/lib/ledger";
import { useCan } from "@/lib/roles";
import { C, FONT } from "./adminTheme";
import { Button, Notice, SidePanel } from "./ui";
import { DataTable, Section, type Column } from "./layout";
import { GR_CSS, Opts } from "./GrowthPanel";

/**
 * Comptabilité de stock : le bénéfice net (coût moyen pondéré), les recharges chez les fournisseurs
 * et les dépenses. Une écriture ne se modifie pas : on l'annule avec une raison, puis on la ressaisit.
 */

const money = (n: number) => `${nfCad.format(n)} $`;
const NETS = ["trc20", "bep20", "erc20", "polygon", "spl", "avalanche"];
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("fr-CA", { day: "numeric", month: "short", year: "numeric" });
const dec = (v: string) => Number(v.replace(/\s/g, "").replace(",", "."));
const decIn = (v: string) => v.replace(/[^\d.,]/g, "");

/* ─── Bénéfice net ─── */
export function ProfitStatement({ pnl }: { pnl: Pnl | null }) {
  const line = (label: string, value: number | null, opts: { strong?: boolean; minus?: boolean; color?: string; sub?: boolean } = {}) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 16, padding: opts.strong ? "12px 0 0" : "7px 0", borderTop: opts.strong ? `1px solid ${C.bd}` : undefined, marginTop: opts.strong ? 6 : 0 }}>
      <span style={{ flex: 1, fontSize: opts.sub ? 13 : 14, color: opts.sub ? C.t3 : opts.strong ? C.t1 : C.t2, paddingLeft: opts.sub ? 14 : 0 }}>{label}</span>
      <span style={{ fontSize: opts.strong ? 20 : opts.sub ? 13 : 14.5, fontWeight: opts.strong ? 600 : 400, color: opts.color ?? (opts.sub ? C.t3 : C.t1), fontVariantNumeric: "tabular-nums", letterSpacing: opts.strong ? "-0.02em" : undefined }}>
        {value == null ? "–" : `${opts.minus && value > 0 ? "− " : ""}${money(Math.abs(value))}`}
      </span>
    </div>
  );
  const cats = Object.entries(pnl?.expensesBy ?? {}).sort((a, b) => b[1] - a[1]);
  return (
    <div style={{ display: "grid", gap: 28, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", alignItems: "start" }}>
      <div style={{ maxWidth: 560 }}>
        {line("Ventes d'USDT aux clients", pnl?.revenue ?? null)}
        {line("Coût des USDT vendus (coût moyen)", pnl?.cogs ?? null, { minus: true })}
        {line("Bénéfice brut", pnl?.gross ?? null, { color: C.t1 })}
        {line("Dépenses", pnl?.expenses ?? null, { minus: true })}
        {cats.map(([k, v]) => <div key={k}>{line(catLabel(k), v, { minus: true, sub: true })}</div>)}
        {line("Bénéfice net", pnl?.net ?? null, { strong: true, color: (pnl?.net ?? 0) >= 0 ? C.sage : C.coral })}
      </div>
      <div style={{ maxWidth: 420 }}>
        <p style={{ margin: 0, fontSize: 12.5, color: C.t3 }}>Stock d'USDT en fin de période</p>
        <p style={{ margin: "4px 0 0", fontSize: 26, fontWeight: 600, letterSpacing: "-0.03em", color: C.t1, fontVariantNumeric: "tabular-nums" }}>{nfUsdt.format(pnl?.stock.usdt ?? 0)} USDT</p>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: C.t2, lineHeight: 1.6 }}>
          Coût moyen {pnl?.stock.unit != null ? `${pnl.stock.unit.toLocaleString("fr-CA", { maximumFractionDigits: 4 })} $` : "–"} · valeur {money(pnl?.stock.cost ?? 0)}
          {pnl?.stock.market != null && <><br />Au cours du marché : {money(pnl.stock.market)}</>}
        </p>
        <p style={{ margin: "14px 0 0", fontSize: 13, color: C.t3, lineHeight: 1.6 }}>
          Recharges : {money(pnl?.purchasesCad ?? 0)} · USDT rachetés aux clients : {money(pnl?.sellsCad ?? 0)}
        </p>
        {(pnl?.uncovered ?? 0) > 0 && (
          <p style={{ margin: "14px 0 0", fontSize: 13, color: C.t2, lineHeight: 1.6 }}>
            <span style={{ color: C.coral }}>{pnl!.uncovered} achat{pnl!.uncovered > 1 ? "s" : ""} client</span> sans stock enregistré : évalué{pnl!.uncovered > 1 ? "s" : ""} au cours du marché.
            Saisissez votre stock d'ouverture et vos recharges dans l'onglet Recharges.
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── Justificatif : dépôt et ouverture ─── */
function ReceiptPicker({ file, onFile }: { file: File | null; onFile: (f: File | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div style={{ marginTop: 22 }}>
      <span style={{ fontSize: 12.5, color: C.t3 }}>Justificatif (PDF ou image, facultatif)</span>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
        <input ref={ref} type="file" accept="application/pdf,image/*" style={{ display: "none" }} onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
        <Button size="sm" onClick={() => ref.current?.click()} icon={<Paperclip style={{ width: 14, height: 14 }} />}>{file ? "Changer" : "Joindre"}</Button>
        {file && <span style={{ fontSize: 13, color: C.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>}
      </div>
    </div>
  );
}
async function openReceipt(path: string) {
  try { window.open(await receiptUrl(path), "_blank", "noopener"); } catch { /* lien expiré ou supprimé */ }
}

const In = ({ label, value, onChange, placeholder, mode, type = "text" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; mode?: "decimal"; type?: string }) => (
  <label style={{ display: "block", marginTop: 20 }}>
    <span style={{ fontSize: 12.5, color: C.t3 }}>{label}</span>
    <input className="gr-in" type={type} inputMode={mode} value={value} placeholder={placeholder} onChange={(e) => onChange(mode === "decimal" ? decIn(e.target.value) : e.target.value)} />
  </label>
);

/* ─── Annuler une écriture ─── */
function VoidBox({ onVoid }: { onVoid: (reason: string) => Promise<string | null> }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!open) return <div style={{ marginTop: 26 }}><Button variant="danger" size="sm" onClick={() => setOpen(true)}>Annuler l'écriture</Button></div>;
  return (
    <div style={{ marginTop: 26 }}>
      <In label="Pourquoi annuler ? (gardé dans la piste d'audit)" value={reason} onChange={setReason} placeholder="Ex. montant mal saisi" />
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Garder</Button>
        <Button variant="danger" size="sm" disabled={busy || !reason.trim()} onClick={async () => { setBusy(true); setErr(await onVoid(reason)); setBusy(false); }}>Confirmer l'annulation</Button>
      </div>
      {err && <div style={{ marginTop: 12 }}><Notice tone="err">{err}</Notice></div>}
    </div>
  );
}

const netCell = (n: string) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
    {NET_LOGO[n] && <img src={`/coins/${NET_LOGO[n]}.svg`} alt="" width={16} height={16} style={{ borderRadius: 99 }} />}{NET_NAME[n] ?? n}
  </span>
);
const voidedStyle = (v: boolean): React.CSSProperties => (v ? { color: C.t3, textDecoration: "line-through" } : {});

/* ─── Recharges ─── */
export function PurchasesView({ from, to, onChanged }: { from: string; to: string; onChanged: () => void }) {
  const can = useCan();
  const [rows, setRows] = useState<Purchase[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<Purchase | null>(null);
  useEffect(() => { let on = true; listPurchases(from, to).then((r) => on && setRows(r)).catch((e: Error) => on && setErr(e.message)); return () => { on = false; }; }, [from, to, tick]);
  const changed = () => { setTick((n) => n + 1); onChanged(); };

  const live = (rows ?? []).filter((r) => !r.voided);
  const qty = live.reduce((s, r) => s + r.usdt, 0), cad = live.reduce((s, r) => s + r.cad + r.fee, 0);
  const cols: Column<Purchase>[] = [
    { key: "d", header: "Date", sort: (r) => r.at, render: (r) => <span style={voidedStyle(r.voided)}>{day(r.at)}</span> },
    { key: "s", header: "Fournisseur", render: (r) => <span style={{ color: r.voided ? C.t3 : C.t1 }}>{r.kind === "opening" ? "Stock d'ouverture" : r.supplier}{r.voided && " · annulée"}</span> },
    { key: "n", header: "Réseau", hideBelow: 700, render: (r) => netCell(r.network) },
    { key: "u", header: "USDT", align: "right", sort: (r) => r.usdt, render: (r) => <span style={voidedStyle(r.voided)}>{nfUsdt.format(r.usdt)}</span> },
    { key: "c", header: "Coût", align: "right", render: (r) => <span style={voidedStyle(r.voided)}>{money(r.cad + r.fee)}</span> },
    { key: "p", header: "Par USDT", align: "right", hideBelow: 820, render: (r) => <span style={{ color: C.t2 }}>{((r.cad + r.fee) / r.usdt).toLocaleString("fr-CA", { maximumFractionDigits: 4 })} $</span> },
    { key: "j", header: "", align: "right", hideBelow: 560, render: (r) => (r.receipt ? <Paperclip style={{ width: 14, height: 14, color: C.t3, verticalAlign: "middle" }} aria-label="Justificatif joint" /> : null) },
  ];
  return (
    <div style={{ fontFamily: FONT }}>
      <style>{GR_CSS}</style>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
        <p style={{ margin: 0, flex: 1, fontSize: 15, color: C.t2 }}>
          <b style={{ color: C.t1, fontWeight: 600 }}>{nfUsdt.format(qty)} USDT</b> rechargés pour {money(cad)}{qty > 0 ? `, soit ${(cad / qty).toLocaleString("fr-CA", { maximumFractionDigits: 4 })} $ par USDT` : ""}.
        </p>
        {can("accounting.entries") && <Button size="sm" variant="primary" onClick={() => setAdding(true)} icon={<Plus style={{ width: 14, height: 14 }} />}>Ajouter une recharge</Button>}
      </div>
      {err && <div style={{ marginTop: 14 }}><Notice tone="err">{err}</Notice></div>}
      <Section title="Recharges de la période" description="Achats d'USDT chez vos fournisseurs, et le stock d'ouverture. Ils entrent en stock à leur coût, frais compris.">
        <DataTable rows={rows ?? []} columns={cols} rowKey={(r) => r.id} onRowClick={(r) => setOpen(r)} initialSort={{ key: "d", dir: "desc" }}
          empty={<p style={{ margin: 0, padding: "24px 0", fontSize: 13, color: C.t3, textAlign: "center" }}>{rows === null ? "Chargement…" : "Aucune recharge sur cette période."}</p>}
          mobile={(r) => (
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: r.voided ? C.t3 : C.t1 }}>{r.kind === "opening" ? "Stock d'ouverture" : r.supplier}</div>
                <div style={{ fontSize: 12.5, color: C.t3, marginTop: 2 }}>{day(r.at)} · {NET_NAME[r.network] ?? r.network}{r.voided ? " · annulée" : ""}</div>
              </div>
              <span style={{ fontSize: 14, fontVariantNumeric: "tabular-nums", ...voidedStyle(r.voided) }}>{nfUsdt.format(r.usdt)} USDT</span>
            </div>
          )} />
      </Section>
      {adding && <PurchaseForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); changed(); }} />}
      {open && (
        <SidePanel title={open.kind === "opening" ? "Stock d'ouverture" : `Recharge · ${open.supplier}`} subtitle={`${day(open.at)}${open.by ? ` · saisie par ${open.by}` : ""}`} onClose={() => setOpen(null)}>
          {[["Réseau", NET_NAME[open.network] ?? open.network], ["USDT reçus", `${nfUsdt.format(open.usdt)} USDT`], ["Payé", money(open.cad)], ["Payé par", FUNDING_LABEL[open.funding]], ["Frais", money(open.fee)],
            ["Coût par USDT", `${((open.cad + open.fee) / open.usdt).toLocaleString("fr-CA", { maximumFractionDigits: 6 })} $`], ["Transaction", open.tx ?? "–"], ["Note", open.note ?? "–"]].map(([k, v]) => (
            <div key={k} style={{ display: "flex", gap: 16, padding: "9px 0", borderBottom: `1px solid ${C.bds}`, fontSize: 14 }}>
              <span style={{ width: 120, color: C.t3, flexShrink: 0 }}>{k}</span><span style={{ color: C.t1, wordBreak: "break-all" }}>{v}</span>
            </div>
          ))}
          {open.receipt && <div style={{ marginTop: 18 }}><Button size="sm" onClick={() => openReceipt(open.receipt!)} icon={<Paperclip style={{ width: 14, height: 14 }} />}>Ouvrir le justificatif</Button></div>}
          {open.voided
            ? <p style={{ margin: "22px 0 0", fontSize: 13.5, color: C.t2 }}>Écriture annulée : {open.voidReason}</p>
            : can("accounting.entries") && <VoidBox onVoid={async (reason) => { const r = await voidEntry("purchases", open.id, reason); if (r.error) return r.error; setOpen(null); changed(); return null; }} />}
        </SidePanel>
      )}
    </div>
  );
}

function PurchaseForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<"purchase" | "opening">("purchase");
  const [funding, setFunding] = useState<Funding>("bank");
  const [date, setDate] = useState(today());
  const [supplier, setSupplier] = useState("");
  const [net, setNet] = useState("trc20");
  const [usdt, setUsdt] = useState(""); const [cad, setCad] = useState(""); const [fee, setFee] = useState("");
  const [tx, setTx] = useState(""); const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const q = dec(usdt), c = dec(cad), f = fee ? dec(fee) : 0;
  const ok = q > 0 && c >= 0 && Number.isFinite(c) && f >= 0 && (kind === "opening" || supplier.trim().length > 0) && !!date;
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const receipt = file ? await uploadReceipt(file, "purchases") : null;
      const r = await addPurchase({ kind, funding, at: new Date(`${date}T12:00:00`).toISOString(), supplier: kind === "opening" ? "Stock d'ouverture" : supplier, network: net, usdt: q, cad: c, fee: f, tx, note, receipt });
      if (r.error) setErr(r.error); else onSaved();
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  return (
    <SidePanel title="Nouvelle recharge" subtitle="USDT achetés chez un fournisseur, ou stock de départ" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="primary" onClick={save} disabled={busy || !ok}>{busy ? "Enregistrement…" : "Enregistrer"}</Button></>}>
      <style>{GR_CSS}</style>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 2, color: C.t2 }}>
        <Opts value={kind} options={[{ v: "purchase", label: "Recharge" }, { v: "opening", label: "Stock d'ouverture" }]} onChange={(v) => { setKind(v); setFunding(v === "opening" ? "loan" : "bank"); }} />
      </p>
      <p style={{ margin: "16px 0 0", fontSize: 15, lineHeight: 2, color: C.t2 }}>
        Payé par <Opts value={funding} options={(Object.keys(FUNDING_LABEL) as Funding[]).map((f) => ({ v: f, label: FUNDING_LABEL[f] }))} onChange={setFunding} />
      </p>
      <p style={{ margin: "4px 0 0", fontSize: 13, lineHeight: 1.6, color: C.t3 }}>
        {funding === "bank" ? "L'argent est sorti de ton compte bancaire : la ligne apparaîtra dans le rapprochement."
          : funding === "loan" ? "Quelqu'un t'a prêté ces USDT (ou l'argent pour les acheter) : c'est une dette à rembourser, rien ne sort de ta banque."
            : funding === "capital" ? "Tu as mis ces USDT dans l'entreprise de ta poche : c'est ton apport, rien ne sort de la banque de l'entreprise."
              : "Le fournisseur t'a livré et tu le paieras plus tard : c'est une dette envers lui."}
      </p>
      <p style={{ margin: "16px 0 0", fontSize: 15, lineHeight: 2, color: C.t2 }}>
        Réseau <Opts value={net} options={NETS.map((n) => ({ v: n, label: NET_NAME[n] ?? n }))} onChange={setNet} />
      </p>
      <In label="Date" type="date" value={date} onChange={setDate} />
      {kind === "purchase" && <In label="Fournisseur" value={supplier} onChange={setSupplier} placeholder="Ex. nom du desk OTC" />}
      <In label="USDT reçus" value={usdt} onChange={setUsdt} mode="decimal" placeholder="0,00" />
      <In label={kind === "opening" ? "Coût total en CAD" : "CAD payés"} value={cad} onChange={setCad} mode="decimal" placeholder="0,00" />
      {kind === "purchase" && <In label="Frais en CAD (facultatif)" value={fee} onChange={setFee} mode="decimal" placeholder="0,00" />}
      {q > 0 && c > 0 && <p style={{ margin: "12px 0 0", fontSize: 13, color: C.t3 }}>Coût par USDT : {((c + f) / q).toLocaleString("fr-CA", { maximumFractionDigits: 6 })} $</p>}
      <In label="Hash de la transaction (facultatif)" value={tx} onChange={setTx} placeholder="Pour retrouver l'arrivée des USDT" />
      <In label="Note (facultatif)" value={note} onChange={setNote} />
      <ReceiptPicker file={file} onFile={setFile} />
      {err && <div style={{ marginTop: 16 }}><Notice tone="err">{err}</Notice></div>}
    </SidePanel>
  );
}

/* ─── Dépenses ─── */
export function ExpensesView({ from, to, onChanged }: { from: string; to: string; onChanged: () => void }) {
  const can = useCan();
  const [rows, setRows] = useState<Expense[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<Expense | null>(null);
  useEffect(() => { let on = true; listExpenses(from, to).then((r) => on && setRows(r)).catch((e: Error) => on && setErr(e.message)); return () => { on = false; }; }, [from, to, tick]);
  const changed = () => { setTick((n) => n + 1); onChanged(); };

  const live = (rows ?? []).filter((r) => !r.voided);
  const total = live.reduce((s, r) => s + r.amount, 0);
  const byCat = EXPENSE_CATS.map((c) => [c.label, live.filter((r) => r.category === c.v).reduce((s, r) => s + r.amount, 0)] as const).filter(([, v]) => v > 0);
  const cols: Column<Expense>[] = [
    { key: "d", header: "Date", sort: (r) => r.on, render: (r) => <span style={voidedStyle(r.voided)}>{day(r.on)}</span> },
    { key: "l", header: "Libellé", render: (r) => <span style={{ color: r.voided ? C.t3 : C.t1 }}>{r.label}{r.recurring ? <span style={{ color: C.t3 }}> · chaque mois</span> : null}{r.voided && " · annulée"}</span> },
    { key: "c", header: "Catégorie", hideBelow: 700, render: (r) => <span style={{ color: C.t2 }}>{catLabel(r.category)}</span> },
    { key: "a", header: "Montant", align: "right", sort: (r) => r.amount, render: (r) => <span style={voidedStyle(r.voided)}>{money(r.amount)}</span> },
    { key: "j", header: "", align: "right", hideBelow: 560, render: (r) => (r.receipt ? <Paperclip style={{ width: 14, height: 14, color: C.t3, verticalAlign: "middle" }} aria-label="Justificatif joint" /> : null) },
  ];
  return (
    <div style={{ fontFamily: FONT }}>
      <style>{GR_CSS}</style>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
        <p style={{ margin: 0, flex: 1, fontSize: 15, color: C.t2 }}>
          <b style={{ color: C.t1, fontWeight: 600 }}>{money(total)}</b> de dépenses{byCat.length ? ` : ${byCat.map(([k, v]) => `${k.toLowerCase()} ${money(v)}`).join(", ")}` : ""}.
        </p>
        {can("accounting.entries") && <Button size="sm" variant="primary" onClick={() => setAdding(true)} icon={<Plus style={{ width: 14, height: 14 }} />}>Ajouter une dépense</Button>}
      </div>
      {err && <div style={{ marginTop: 14 }}><Notice tone="err">{err}</Notice></div>}
      <Section title="Dépenses de la période" description="Gaz de réseau (TRX, BNB, SOL… achetés pour les envois), fournisseurs, banque, logiciels, marketing. Une dépense « chaque mois » se recopie le 1er du mois.">
        <DataTable rows={rows ?? []} columns={cols} rowKey={(r) => r.id} onRowClick={(r) => setOpen(r)} initialSort={{ key: "d", dir: "desc" }}
          empty={<p style={{ margin: 0, padding: "24px 0", fontSize: 13, color: C.t3, textAlign: "center" }}>{rows === null ? "Chargement…" : "Aucune dépense sur cette période."}</p>}
          mobile={(r) => (
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: r.voided ? C.t3 : C.t1 }}>{r.label}</div>
                <div style={{ fontSize: 12.5, color: C.t3, marginTop: 2 }}>{day(r.on)} · {catLabel(r.category)}{r.voided ? " · annulée" : ""}</div>
              </div>
              <span style={{ fontSize: 14, fontVariantNumeric: "tabular-nums", ...voidedStyle(r.voided) }}>{money(r.amount)}</span>
            </div>
          )} />
      </Section>
      {adding && <ExpenseForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); changed(); }} />}
      {open && (
        <SidePanel title={open.label} subtitle={`${day(open.on)} · ${catLabel(open.category)}${open.by ? ` · saisie par ${open.by}` : ""}`} onClose={() => setOpen(null)}>
          {[["Montant", money(open.amount)], ["Taxes payées", money(open.tax)], ["Récurrence", open.recurring ? "Chaque mois" : open.auto ? "Copie mensuelle automatique" : "Une fois"], ["Note", open.note ?? "–"]].map(([k, v]) => (
            <div key={k} style={{ display: "flex", gap: 16, padding: "9px 0", borderBottom: `1px solid ${C.bds}`, fontSize: 14 }}>
              <span style={{ width: 120, color: C.t3, flexShrink: 0 }}>{k}</span><span style={{ color: C.t1 }}>{v}</span>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 18 }}>
            {open.receipt && <Button size="sm" onClick={() => openReceipt(open.receipt!)} icon={<Paperclip style={{ width: 14, height: 14 }} />}>Ouvrir le justificatif</Button>}
            {open.recurring && !open.voided && can("accounting.entries") && (
              <Button size="sm" onClick={async () => { const r = await stopRecurring(open.id); if (!r.error) { setOpen(null); changed(); } }}>Arrêter la récurrence</Button>
            )}
          </div>
          {open.voided
            ? <p style={{ margin: "22px 0 0", fontSize: 13.5, color: C.t2 }}>Écriture annulée : {open.voidReason}</p>
            : can("accounting.entries") && <VoidBox onVoid={async (reason) => { const r = await voidEntry("expenses", open.id, reason); if (r.error) return r.error; setOpen(null); changed(); return null; }} />}
        </SidePanel>
      )}
    </div>
  );
}

function ExpenseForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(today());
  const [cat, setCat] = useState("software");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState(""); const [tax, setTax] = useState("");
  const [recurring, setRecurring] = useState("no");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const a = dec(amount), t = tax ? dec(tax) : 0;
  const ok = a > 0 && t >= 0 && label.trim().length > 0 && !!date;
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const receipt = file ? await uploadReceipt(file, "expenses") : null;
      const r = await addExpense({ on: date, category: cat, label, amount: a, tax: t, recurring: recurring === "yes", note, receipt });
      if (r.error) setErr(r.error); else onSaved();
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  return (
    <SidePanel title="Nouvelle dépense" subtitle={`Comptée dans ${monthLabel(date.slice(0, 7)).toLowerCase()}`} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="primary" onClick={save} disabled={busy || !ok}>{busy ? "Enregistrement…" : "Enregistrer"}</Button></>}>
      <style>{GR_CSS}</style>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 2, color: C.t2 }}>
        <Opts value={cat} options={EXPENSE_CATS} onChange={setCat} />
      </p>
      <In label="Libellé" value={label} onChange={setLabel} placeholder="Ex. Supabase, abonnement mensuel" />
      <In label="Date" type="date" value={date} onChange={setDate} />
      <In label="Montant en CAD (taxes comprises)" value={amount} onChange={setAmount} mode="decimal" placeholder="0,00" />
      <In label="Dont taxes payées (TPS, TVQ… facultatif)" value={tax} onChange={setTax} mode="decimal" placeholder="0,00" />
      <p style={{ margin: "20px 0 0", fontSize: 15, lineHeight: 2, color: C.t2 }}>
        <Opts value={recurring} options={[{ v: "no", label: "Une fois" }, { v: "yes", label: "Chaque mois" }]} onChange={setRecurring} />
      </p>
      <In label="Note (facultatif)" value={note} onChange={setNote} />
      <ReceiptPicker file={file} onFile={setFile} />
      {err && <div style={{ marginTop: 16 }}><Notice tone="err">{err}</Notice></div>}
    </SidePanel>
  );
}
