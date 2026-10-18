import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { nfCad } from "@/lib/adminOrders";
import {
  ACCOUNT_TYPE_LABEL, SOURCE_LABEL, addAccount, listAccounts, loadAccountLedger, loadJournal, loadStatements, peekStatements, postEntry, voidJournalEntry,
  type AccountType, type AcctLedger, type JEntry, type LedgerAccount, type Statements, type StmtLine,
} from "@/lib/ledger";
import { useCan } from "@/lib/roles";
import { C, FONT } from "./adminTheme";
import { Button, Notice, SidePanel } from "./ui";
import { Section } from "./layout";
import { GR_CSS, Opts } from "./GrowthPanel";

/**
 * Partie double : le journal général (écritures produites par les commandes, recharges et dépenses,
 * plus les écritures manuelles), et les états financiers qui en découlent.
 */

const money = (n: number) => `${nfCad.format(n)} $`;
const amt = (n: number) => (n ? nfCad.format(n) : "");
const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("fr-CA", { day: "numeric", month: "short", year: "numeric" });
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
const dec = (v: string) => Number(v.replace(/\s/g, "").replace(",", ".")) || 0;
const decIn = (v: string) => v.replace(/[^\d.,]/g, "");

const CSS = `
.jv-entry { padding: 16px 0; border-bottom: 1px solid var(--a-bds); }
.jv-line { display: grid; grid-template-columns: minmax(0, 1fr) 110px 110px; gap: 12px; font-size: 13.5px; padding: 3px 0; font-variant-numeric: tabular-nums; }
.jv-line .cr { padding-left: 22px; }
.jv-num { text-align: right; }
.jv-acc { all: unset; cursor: pointer; color: var(--a-t2); }
.jv-acc:hover { color: var(--a-t1); text-decoration: underline; text-underline-offset: 3px; }
.jv-stmt { display: flex; gap: 16px; padding: 7px 0; font-size: 14px; font-variant-numeric: tabular-nums; }
.jv-stmt > :first-child { flex: 1; }
.jv-sel { width: 100%; box-sizing: border-box; border: none; border-bottom: 1px solid var(--a-bd); background: transparent; padding: 8px 0 9px; font: inherit; font-size: 14px; color: var(--a-t1); outline: none; color-scheme: light dark; }
.jv-sel:focus { border-bottom-color: var(--a-t1); }
`;

/* ─── Grand livre d'un compte (panneau) ─── */
function AccountLedgerPanel({ code, name, from, to, onClose }: { code: string; name: string; from: string; to: string; onClose: () => void }) {
  const [data, setData] = useState<AcctLedger | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { loadAccountLedger(code, from, to).then(setData).catch((e: Error) => setErr(e.message)); }, [code, from, to]);
  return (
    <SidePanel title={`${code} · ${name}`} subtitle="Grand livre de la période, avec le solde courant" onClose={onClose} width={640}>
      <style>{CSS}</style>
      {err && <Notice tone="err">{err}</Notice>}
      <div className="jv-stmt" style={{ color: C.t3 }}><span>Solde d'ouverture</span><span>{data ? money(data.opening) : "…"}</span></div>
      {(data?.lines ?? []).map((l, i) => (
        <div key={i} style={{ padding: "9px 0", borderTop: `1px solid ${C.bds}`, fontSize: 13.5 }}>
          <div style={{ display: "flex", gap: 10, color: C.t3, fontSize: 12.5 }}><span>{day(l.at)}</span><span>{l.piece}</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 90px 90px 100px", gap: 10, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
            <span style={{ color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.memo}</span>
            <span className="jv-num">{amt(l.debit)}</span><span className="jv-num">{amt(l.credit)}</span><span className="jv-num" style={{ color: C.t2 }}>{nfCad.format(l.balance)}</span>
          </div>
        </div>
      ))}
      {data && data.lines.length === 0 && <p style={{ margin: "14px 0", fontSize: 13, color: C.t3 }}>Aucun mouvement sur la période.</p>}
      <div className="jv-stmt" style={{ borderTop: `1px solid ${C.bd}`, marginTop: 6, paddingTop: 12, fontWeight: 600 }}><span>Solde de clôture</span><span>{data ? money(data.closing) : "…"}</span></div>
    </SidePanel>
  );
}

/* ─── Journal ─── */
export function JournalView({ from, to, onChanged }: { from: string; to: string; onChanged: () => void }) {
  const can = useCan();
  const [data, setData] = useState<{ total: number; debit: number; credit: number; entries: JEntry[] } | null>(null);
  const [limit, setLimit] = useState(100);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<JEntry | null>(null);
  const [acc, setAcc] = useState<{ code: string; name: string } | null>(null);
  useEffect(() => { let on = true; loadJournal(from, to, limit).then((d) => on && setData(d)).catch((e: Error) => on && setErr(e.message)); return () => { on = false; }; }, [from, to, limit, tick]);
  const balanced = data && Math.abs(data.debit - data.credit) < 0.005;
  return (
    <div style={{ fontFamily: FONT }}>
      <style>{CSS + GR_CSS}</style>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
        <p style={{ margin: 0, flex: 1, fontSize: 15, color: C.t2 }}>
          {data ? <><b style={{ color: C.t1, fontWeight: 600 }}>{data.total} écriture{data.total > 1 ? "s" : ""}</b> · débits {money(data.debit)} {balanced ? "=" : "≠"} crédits {money(data.credit)}</> : "Chargement du journal…"}
        </p>
        {can("accounting.entries") && <Button size="sm" variant="primary" onClick={() => setAdding(true)} icon={<Plus style={{ width: 14, height: 14 }} />}>Nouvelle écriture</Button>}
      </div>
      {err && <div style={{ marginTop: 14 }}><Notice tone="err">{err}</Notice></div>}
      <Section title="Journal général" description="Chaque achat, vente, recharge et dépense produit son écriture équilibrée ; les apports, prêts et corrections se saisissent à la main.">
        {(data?.entries ?? []).map((e) => (
          <div key={e.piece} className="jv-entry">
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12.5, color: C.t3, minWidth: 92 }}>{day(e.at)}</span>
              <button type="button" onClick={() => e.source === "manual" && setOpen(e)} style={{ all: "unset", cursor: e.source === "manual" ? "pointer" : "default", fontSize: 13, color: C.t2, fontFamily: "ui-monospace, monospace" }}>{e.piece}</button>
              <span style={{ fontSize: 14, color: C.t1, flex: 1, minWidth: 0 }}>{e.memo}</span>
              <span style={{ fontSize: 12.5, color: C.t3 }}>{SOURCE_LABEL[e.source]}</span>
            </div>
            <div style={{ marginTop: 6, paddingLeft: 104 }} className="jv-lines">
              {e.lines.map((l, i) => (
                <div key={i} className="jv-line">
                  <span className={l.credit ? "cr" : ""}><button type="button" className="jv-acc" onClick={() => setAcc({ code: l.account, name: l.name ?? "" })}>{l.account} · {l.name}</button></span>
                  <span className="jv-num">{amt(l.debit)}</span><span className="jv-num">{amt(l.credit)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {data && data.entries.length === 0 && <p style={{ margin: 0, padding: "24px 0", fontSize: 13, color: C.t3, textAlign: "center" }}>Aucune écriture sur cette période.</p>}
        {data && data.total > data.entries.length && (
          <div style={{ marginTop: 16 }}><Button size="sm" onClick={() => setLimit((n) => n + 200)}>Voir plus ({data.total - data.entries.length} de plus)</Button></div>
        )}
      </Section>
      {adding && <EntryForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); setTick((n) => n + 1); onChanged(); }} />}
      {open && <ManualEntryPanel entry={open} onClose={() => setOpen(null)} onVoided={() => { setOpen(null); setTick((n) => n + 1); onChanged(); }} />}
      {acc && <AccountLedgerPanel code={acc.code} name={acc.name} from={from} to={to} onClose={() => setAcc(null)} />}
    </div>
  );
}

function ManualEntryPanel({ entry, onClose, onVoided }: { entry: JEntry; onClose: () => void; onVoided: () => void }) {
  const can = useCan();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <SidePanel title={`${entry.piece} · ${entry.memo}`} subtitle={day(entry.at)} onClose={onClose}>
      <style>{CSS + GR_CSS}</style>
      {entry.lines.map((l, i) => (
        <div key={i} className="jv-line"><span className={l.credit ? "cr" : ""}>{l.account} · {l.name}</span><span className="jv-num">{amt(l.debit)}</span><span className="jv-num">{amt(l.credit)}</span></div>
      ))}
      {can("accounting.entries") && (
        <div style={{ marginTop: 26 }}>
          <label style={{ display: "block" }}>
            <span style={{ fontSize: 12.5, color: C.t3 }}>Annuler l'écriture : pourquoi ? (gardé dans la piste d'audit)</span>
            <input className="gr-in" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. montant mal saisi" />
          </label>
          <div style={{ marginTop: 12 }}>
            <Button variant="danger" size="sm" disabled={busy || !reason.trim()} onClick={async () => {
              setBusy(true); const r = await voidJournalEntry(entry.sourceId, reason); setBusy(false);
              if (r.error) setErr(r.error); else onVoided();
            }}>Annuler l'écriture</Button>
          </div>
          {err && <div style={{ marginTop: 12 }}><Notice tone="err">{err}</Notice></div>}
        </div>
      )}
    </SidePanel>
  );
}

/** Modèles d'écritures courantes : le formulaire se remplit, il reste le montant. */
const TEMPLATES: { v: string; label: string; memo: string; lines: { account: string; side: "d" | "c" }[] }[] = [
  { v: "capital", label: "Apport en capital", memo: "Apport en capital", lines: [{ account: "1000", side: "d" }, { account: "3000", side: "c" }] },
  { v: "loan", label: "Prêt reçu", memo: "Prêt reçu", lines: [{ account: "1000", side: "d" }, { account: "2100", side: "c" }] },
  { v: "repay", label: "Remboursement de prêt", memo: "Remboursement de prêt", lines: [{ account: "2100", side: "d" }, { account: "1000", side: "c" }] },
  { v: "interest", label: "Intérêts payés", memo: "Intérêts sur prêt", lines: [{ account: "6800", side: "d" }, { account: "1000", side: "c" }] },
  { v: "free", label: "Libre", memo: "", lines: [{ account: "1000", side: "d" }, { account: "1000", side: "c" }] },
];
type Row = { account: string; debit: string; credit: string };

function EntryForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [tpl, setTpl] = useState("capital");
  const [date, setDate] = useState(today());
  const [memo, setMemo] = useState("Apport en capital");
  const [amount, setAmount] = useState("");
  const [rows, setRows] = useState<Row[]>([{ account: "1000", debit: "", credit: "" }, { account: "1000", debit: "", credit: "" }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { listAccounts().then((a) => setAccounts(a.filter((x) => x.active))).catch(() => undefined); }, []);
  const t = TEMPLATES.find((x) => x.v === tpl)!;
  const free = tpl === "free";
  const final: { account: string; debit: number; credit: number }[] = free
    ? rows.map((r) => ({ account: r.account, debit: dec(r.debit), credit: dec(r.credit) })).filter((r) => r.debit > 0 || r.credit > 0)
    : t.lines.map((l) => ({ account: l.account, debit: l.side === "d" ? dec(amount) : 0, credit: l.side === "c" ? dec(amount) : 0 }));
  const td = final.reduce((s, r) => s + r.debit, 0), tc = final.reduce((s, r) => s + r.credit, 0);
  const ok = final.length >= 2 && td > 0 && Math.abs(td - tc) < 0.005 && memo.trim().length > 0 && !!date;
  const name = useMemo(() => new Map(accounts.map((a) => [a.code, a.name])), [accounts]);
  const save = async () => {
    setBusy(true); setErr(null);
    const r = await postEntry(date, memo, final);
    setBusy(false);
    if (r.error) setErr(r.error); else onSaved();
  };
  return (
    <SidePanel title="Nouvelle écriture" subtitle="Apports, prêts, intérêts, corrections : les autres écritures se font toutes seules" onClose={onClose} width={560}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="primary" onClick={save} disabled={busy || !ok}>{busy ? "Enregistrement…" : "Enregistrer"}</Button></>}>
      <style>{CSS + GR_CSS}</style>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 2, color: C.t2 }}>
        <Opts value={tpl} options={TEMPLATES.map((x) => ({ v: x.v, label: x.label }))} onChange={(v) => { setTpl(v); const n = TEMPLATES.find((x) => x.v === v)!; if (n.memo) setMemo(n.memo); }} />
      </p>
      <label style={{ display: "block", marginTop: 20 }}><span style={{ fontSize: 12.5, color: C.t3 }}>Date</span><input className="gr-in" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <label style={{ display: "block", marginTop: 20 }}><span style={{ fontSize: 12.5, color: C.t3 }}>Libellé</span><input className="gr-in" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Ex. Prêt de Jean, 12 mois à 6 %" /></label>
      {!free ? (
        <>
          <label style={{ display: "block", marginTop: 20 }}><span style={{ fontSize: 12.5, color: C.t3 }}>Montant en CAD</span><input className="gr-in" inputMode="decimal" value={amount} onChange={(e) => setAmount(decIn(e.target.value))} placeholder="0,00" /></label>
          <div style={{ marginTop: 18 }}>
            {final.map((r, i) => (
              <div key={i} className="jv-line"><span className={r.credit ? "cr" : ""}>{r.account} · {name.get(r.account)}</span><span className="jv-num">{amt(r.debit)}</span><span className="jv-num">{amt(r.credit)}</span></div>
            ))}
          </div>
        </>
      ) : (
        <div style={{ marginTop: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 90px 90px 24px", gap: 10, fontSize: 12.5, color: C.t3 }}><span>Compte</span><span className="jv-num">Débit</span><span className="jv-num">Crédit</span><span /></div>
          {rows.map((r, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 90px 90px 24px", gap: 10, alignItems: "end" }}>
              <select className="jv-sel" value={r.account} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, account: e.target.value } : x)))}>
                {accounts.map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
              </select>
              <input className="gr-in" inputMode="decimal" style={{ textAlign: "right" }} value={r.debit} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, debit: decIn(e.target.value), credit: "" } : x)))} />
              <input className="gr-in" inputMode="decimal" style={{ textAlign: "right" }} value={r.credit} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, credit: decIn(e.target.value), debit: "" } : x)))} />
              <button type="button" aria-label="Retirer la ligne" disabled={rows.length <= 2} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} style={{ all: "unset", cursor: rows.length > 2 ? "pointer" : "default", color: C.t3, paddingBottom: 9, opacity: rows.length > 2 ? 1 : 0.3 }}><X style={{ width: 14, height: 14 }} /></button>
            </div>
          ))}
          <button type="button" onClick={() => setRows((rs) => [...rs, { account: "1000", debit: "", credit: "" }])} style={{ all: "unset", cursor: "pointer", marginTop: 12, fontSize: 13.5, color: C.t2, textDecoration: "underline", textUnderlineOffset: 3 }}>Ajouter une ligne</button>
        </div>
      )}
      <p style={{ margin: "18px 0 0", fontSize: 13.5, color: td > 0 && Math.abs(td - tc) < 0.005 ? C.t2 : C.t3 }}>
        Débits {money(td)} · crédits {money(tc)} {td > 0 ? (Math.abs(td - tc) < 0.005 ? "· écriture équilibrée" : `· écart ${money(Math.abs(td - tc))}`) : ""}
      </p>
      {err && <div style={{ marginTop: 16 }}><Notice tone="err">{err}</Notice></div>}
    </SidePanel>
  );
}

/* ─── États financiers ─── */
type StmtView = "income" | "balance" | "trial" | "chart";

export function StatementsView({ from, to, toLabel }: { from: string; to: string; toLabel: string }) {
  const [view, setView] = useState<StmtView>("income");
  const [data, setData] = useState<Statements | null>(() => peekStatements(from, to));
  const [err, setErr] = useState<string | null>(null);
  const [acc, setAcc] = useState<{ code: string; name: string } | null>(null);
  useEffect(() => {
    let on = true;
    setData(peekStatements(from, to));
    loadStatements(from, to).then((d) => on && setData(d)).catch((e: Error) => on && setErr(e.message));
    return () => { on = false; };
  }, [from, to]);
  const row = (l: StmtLine, opts: { minus?: boolean } = {}) => (
    <div key={l.code} className="jv-stmt">
      <span><button type="button" className="jv-acc" onClick={() => setAcc({ code: l.code, name: l.name })}>{l.code} · {l.name}</button></span>
      <span>{opts.minus ? "− " : ""}{money(l.amount)}</span>
    </div>
  );
  const total = (label: string, v: number, strong = false, color?: string) => (
    <div className="jv-stmt" style={{ borderTop: `1px solid ${strong ? C.bd : C.bds}`, marginTop: 4, paddingTop: 10, fontWeight: strong ? 600 : 500, fontSize: strong ? 16 : 14, color: color ?? C.t1 }}>
      <span>{label}</span><span>{money(v)}</span>
    </div>
  );
  const head = (t: string) => <p style={{ margin: "22px 0 4px", fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", color: C.t3 }}>{t}</p>;
  const balanceOk = data && Math.abs(data.balance.totalAssets - (data.balance.totalLiabilities + data.balance.totalEquity)) < 0.01;
  return (
    <div style={{ fontFamily: FONT }}>
      <style>{CSS + GR_CSS}</style>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 2, color: C.t2 }}>
        <Opts value={view} options={[{ v: "income", label: "État des résultats" }, { v: "balance", label: "Bilan" }, { v: "trial", label: "Balance de vérification" }, { v: "chart", label: "Plan comptable" }]} onChange={setView} />
      </p>
      {err && <div style={{ marginTop: 14 }}><Notice tone="err">{err}</Notice></div>}

      {view === "income" && data && (
        <div style={{ maxWidth: 640 }}>
          {head("Revenus")}{data.income.revenue.map((l) => row(l))}{total("Total des revenus", data.income.totalRevenue)}
          {head("Charges")}{data.income.expense.map((l) => row(l, { minus: true }))}{total("Total des charges", data.income.totalExpense)}
          {total("Résultat net de la période", data.income.net, true, data.income.net >= 0 ? C.sage : C.coral)}
        </div>
      )}

      {view === "balance" && data && (
        <div style={{ display: "grid", gap: 36, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", alignItems: "start" }}>
          <div>
            <p style={{ margin: "18px 0 0", fontSize: 13, color: C.t3 }}>Au {toLabel}</p>
            {head("Actif")}{data.balance.assets.map((l) => row(l))}{total("Total de l'actif", data.balance.totalAssets, true)}
          </div>
          <div>
            <p style={{ margin: "18px 0 0", fontSize: 13, color: balanceOk ? C.t3 : C.coral }}>{balanceOk ? "Actif = passif + capitaux propres" : "Le bilan n'est pas équilibré"}</p>
            {head("Passif")}{data.balance.liabilities.map((l) => row(l))}{total("Total du passif", data.balance.totalLiabilities)}
            {head("Capitaux propres")}{data.balance.equity.map((l) => row(l))}
            <div className="jv-stmt"><span style={{ color: C.t2 }}>Résultat cumulé</span><span>{money(data.balance.earnings)}</span></div>
            {total("Total des capitaux propres", data.balance.totalEquity)}
            {total("Total du passif et des capitaux propres", data.balance.totalLiabilities + data.balance.totalEquity, true)}
          </div>
        </div>
      )}

      {view === "trial" && data && (
        <div style={{ maxWidth: 820, marginTop: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 120px 120px 120px", gap: 12, fontSize: 12.5, color: C.t3, padding: "6px 0", borderBottom: `1px solid ${C.bd}` }}>
            <span>Compte</span><span className="jv-num">Débits</span><span className="jv-num">Crédits</span><span className="jv-num">Solde</span>
          </div>
          {data.trial.map((t) => (
            <div key={t.code} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 120px 120px 120px", gap: 12, fontSize: 13.5, padding: "7px 0", borderBottom: `1px solid ${C.bds}`, fontVariantNumeric: "tabular-nums" }}>
              <span><button type="button" className="jv-acc" onClick={() => setAcc({ code: t.code, name: t.name })}>{t.code} · {t.name}</button></span>
              <span className="jv-num">{amt(t.debit)}</span><span className="jv-num">{amt(t.credit)}</span><span className="jv-num" style={{ color: C.t1 }}>{nfCad.format(t.balance)}</span>
            </div>
          ))}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 120px 120px 120px", gap: 12, fontSize: 14, fontWeight: 600, padding: "10px 0", fontVariantNumeric: "tabular-nums" }}>
            <span style={{ color: Math.abs(data.trialDebit - data.trialCredit) < 0.01 ? C.t1 : C.coral }}>{Math.abs(data.trialDebit - data.trialCredit) < 0.01 ? "Total · débits = crédits" : "Total · débits ≠ crédits"}</span>
            <span className="jv-num">{nfCad.format(data.trialDebit)}</span><span className="jv-num">{nfCad.format(data.trialCredit)}</span><span />
          </div>
        </div>
      )}

      {view === "chart" && <ChartOfAccounts />}
      {!data && view !== "chart" && <p style={{ margin: "24px 0", fontSize: 13, color: C.t3 }}>Calcul des états…</p>}
      {acc && <AccountLedgerPanel code={acc.code} name={acc.name} from={from} to={to} onClose={() => setAcc(null)} />}
    </div>
  );
}

function ChartOfAccounts() {
  const can = useCan();
  const [accounts, setAccounts] = useState<LedgerAccount[] | null>(null);
  const [tick, setTick] = useState(0);
  const [code, setCode] = useState(""); const [name, setName] = useState(""); const [type, setType] = useState<AccountType>("expense");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { listAccounts().then(setAccounts).catch((e: Error) => setErr(e.message)); }, [tick]);
  const add = async () => {
    const r = await addAccount({ code, name, type });
    if (r.error) setErr(r.error); else { setCode(""); setName(""); setErr(null); setTick((n) => n + 1); }
  };
  return (
    <div style={{ marginTop: 10, maxWidth: 720 }}>
      {(["asset", "liability", "equity", "revenue", "expense"] as AccountType[]).map((k) => (
        <div key={k}>
          <p style={{ margin: "22px 0 4px", fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", color: C.t3 }}>{ACCOUNT_TYPE_LABEL[k]}</p>
          {(accounts ?? []).filter((a) => a.type === k).map((a) => (
            <div key={a.code} className="jv-stmt" style={{ borderBottom: `1px solid ${C.bds}` }}><span style={{ color: C.t1 }}>{a.code} · {a.name}</span><span style={{ color: C.t3, fontSize: 12.5 }}>{a.system ? "standard" : "ajouté"}</span></div>
          ))}
        </div>
      ))}
      {can("accounting.entries") && (
        <div style={{ marginTop: 28 }}>
          <p style={{ margin: 0, fontSize: 14, color: C.t1 }}>Ajouter un compte</p>
          <p style={{ margin: "8px 0 0", fontSize: 15, lineHeight: 2, color: C.t2 }}>
            <Opts value={type} options={(Object.keys(ACCOUNT_TYPE_LABEL) as AccountType[]).map((k) => ({ v: k, label: ACCOUNT_TYPE_LABEL[k] }))} onChange={setType} />
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "120px minmax(0,1fr) auto", gap: 16, alignItems: "end", marginTop: 6 }}>
            <label><span style={{ fontSize: 12.5, color: C.t3 }}>Numéro (4 chiffres)</span><input className="gr-in" inputMode="numeric" maxLength={4} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="6450" /></label>
            <label><span style={{ fontSize: 12.5, color: C.t3 }}>Nom</span><input className="gr-in" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Assurances" /></label>
            <Button size="sm" onClick={add} disabled={code.length !== 4 || !name.trim()}>Ajouter</Button>
          </div>
        </div>
      )}
      {err && <div style={{ marginTop: 14 }}><Notice tone="err">{err}</Notice></div>}
    </div>
  );
}
