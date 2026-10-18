import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Upload } from "lucide-react";
import { nfCad } from "@/lib/adminOrders";
import {
  applyMapping, autoMatch, bankCandidates, guessMapping, ignoreLine, importStatement, lineToExpense, loadRecon, matchLine, parseCsv, readStatementFile,
  saveMapping, savedMapping, unmatchLine, type BankLine, type BookItem, type Mapping, type Recon,
} from "@/lib/bankRecon";
import { EXPENSE_CATS, SOURCE_LABEL } from "@/lib/ledger";
import { useCan } from "@/lib/roles";
import { C, FONT } from "./adminTheme";
import { Button, Notice, SidePanel } from "./ui";
import { Section } from "./layout";
import { GR_CSS, Opts } from "./GrowthPanel";

/**
 * Rapprochement bancaire : le relevé de la banque, ligne par ligne, face aux opérations des livres
 * qui passent par le compte 1000. Chaque ligne est pointée (automatiquement ou à la main), devient
 * une dépense, ou est écartée avec une raison. L'écart restant doit être nul.
 */

const money = (n: number) => `${nfCad.format(n)} $`;
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${nfCad.format(Math.abs(n))} $`;
const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("fr-CA", { day: "numeric", month: "short", year: "numeric" });
const ymd = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
const dec = (v: string) => Number(v.replace(/\s/g, "").replace(",", ".")) || 0;

const CSS = `
.br-row { all: unset; box-sizing: border-box; cursor: pointer; display: grid; grid-template-columns: 96px minmax(0, 1fr) 120px; gap: 14px; width: 100%; padding: 11px 0; border-bottom: 1px solid var(--a-bds); font-size: 14px; font-variant-numeric: tabular-nums; }
.br-row:hover .br-desc { color: var(--a-t1); }
.br-row:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 2px; }
.br-num { text-align: right; }
.br-sum { display: flex; gap: 16px; padding: 7px 0; font-size: 14px; font-variant-numeric: tabular-nums; }
.br-sum > :first-child { flex: 1; color: var(--a-t2); }
.br-go { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-weight: 600; color: var(--a-t1); text-decoration: underline; text-underline-offset: 4px; }
.br-go:disabled { cursor: default; opacity: .45; }
.br-go:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 3px; }
.br-sel { width: 100%; box-sizing: border-box; border: none; border-bottom: 1px solid var(--a-bd); background: transparent; padding: 8px 0 9px; font: inherit; font-size: 14px; color: var(--a-t1); outline: none; color-scheme: light dark; }
@media (max-width: 560px) { .br-row { grid-template-columns: 74px minmax(0, 1fr) 96px; gap: 10px; font-size: 13.5px; } }
`;

type Filter = "open" | "matched" | "ignored" | "all";

export function BankReconView({ from, to, onChanged }: { from: string; to: string; onChanged: () => void }) {
  const can = useCan();
  const fromD = ymd(new Date(from)), toD = ymd(new Date(new Date(to).getTime() - 1));
  const [data, setData] = useState<Recon | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [filter, setFilter] = useState<Filter>("open");
  const [open, setOpen] = useState<BankLine | null>(null);
  const [file, setFile] = useState<{ name: string; rows: string[][] } | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { let on = true; loadRecon(fromD, toD).then((d) => { if (on) { setData(d); setErr(null); } }).catch((e: Error) => on && setErr(e.message)); return () => { on = false; }; }, [fromD, toD, tick]);
  const refresh = () => { setTick((n) => n + 1); onChanged(); };

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setErr(null); setMsg(null);
    try {
      const rows = parseCsv(await readStatementFile(f));
      if (rows.length === 0) throw new Error("Ce fichier ne contient aucune ligne.");
      setFile({ name: f.name, rows });
    } catch (e) { setErr((e as Error).message); }
    if (input.current) input.current.value = "";
  };

  const lines = (data?.lines ?? []).filter((l) => filter === "all" || l.status === filter);
  const reconciled = data && data.statementBalance != null ? data.statementBalance + data.outstandingTotal - data.openTotal - data.ignoredTotal : null;
  const unexplained = reconciled != null && data ? Math.round((reconciled - data.booksBalance) * 100) / 100 : null;

  return (
    <div style={{ fontFamily: FONT }}>
      <style>{CSS + GR_CSS}</style>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
        <p style={{ margin: 0, flex: 1, fontSize: 15, color: C.t2, minWidth: 240 }}>
          {!data ? "Chargement du relevé…"
            : data.statementBalance == null ? "Aucun relevé importé pour l'instant. Exportez le relevé de votre compte en CSV depuis AccèsD, puis importez-le ici."
              : <><b style={{ color: C.t1, fontWeight: 600 }}>{data.counts.open} ligne{data.counts.open > 1 ? "s" : ""} à traiter</b> sur la période · {data.counts.matched} pointée{data.counts.matched > 1 ? "s" : ""} · {data.counts.ignored} écartée{data.counts.ignored > 1 ? "s" : ""}</>}
        </p>
        {can("accounting.entries") && <>
          <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => pick(e.target.files?.[0])} />
          {(data?.counts.open ?? 0) > 0 && (
            <Button size="sm" disabled={busy} onClick={async () => {
              setBusy(true); const r = await autoMatch(); setBusy(false);
              if ("error" in r) setErr(r.error ?? null); else { setMsg(r.matched ? `${r.matched} ligne${r.matched > 1 ? "s" : ""} pointée${r.matched > 1 ? "s" : ""} automatiquement.` : "Aucune correspondance sûre de plus : pointez le reste à la main."); refresh(); }
            }}>Pointer automatiquement</Button>
          )}
          <Button size="sm" variant="primary" onClick={() => input.current?.click()} icon={<Upload style={{ width: 14, height: 14 }} />}>Importer un relevé (CSV)</Button>
        </>}
      </div>
      {err && <div style={{ marginTop: 14 }}><Notice tone="err">{err}</Notice></div>}
      {msg && <p style={{ margin: "14px 0 0", fontSize: 13.5, color: C.t2 }}>{msg}</p>}

      {data && data.statementBalance != null && (
        <Section title="État du rapprochement" description={`Au ${day(data.statementOn!)}, dernière ligne du relevé qui porte un solde.`}>
          <div style={{ maxWidth: 620 }}>
            <div className="br-sum"><span>Solde du relevé</span><span>{money(data.statementBalance)}</span></div>
            <div className="br-sum"><span>Opérations des livres pas encore au relevé</span><span>{signed(data.outstandingTotal)}</span></div>
            <div className="br-sum"><span>Lignes du relevé à traiter</span><span>{signed(-data.openTotal)}</span></div>
            {data.ignoredTotal !== 0 && <div className="br-sum"><span>Lignes écartées</span><span>{signed(-data.ignoredTotal)}</span></div>}
            <div className="br-sum" style={{ borderTop: `1px solid ${C.bds}`, marginTop: 4, paddingTop: 10 }}><span style={{ color: C.t1 }}>Solde rapproché</span><span>{money(reconciled!)}</span></div>
            <div className="br-sum"><span>Solde du compte 1000 · Banque dans les livres</span><span>{money(data.booksBalance)}</span></div>
            <div className="br-sum" style={{ borderTop: `1px solid ${C.bd}`, marginTop: 4, paddingTop: 12, fontWeight: 600, fontSize: 16 }}>
              <span style={{ color: C.t1 }}>{unexplained === 0 ? "Écart non expliqué : aucun" : "Écart non expliqué"}</span>
              <span style={{ color: C.t1 }}>{money(unexplained ?? 0)}</span>
            </div>
            {unexplained !== 0 && <p style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.6, color: C.t3 }}>Un écart vient souvent d'un relevé incomplet (importez les mois précédents) ou d'une opération saisie avec un mauvais montant.</p>}
          </div>
        </Section>
      )}

      {data && data.lines.length > 0 && (
        <Section title="Relevé" description="Touchez une ligne pour la pointer sur une opération, en faire une dépense ou l'écarter.">
          <p style={{ margin: "0 0 6px", fontSize: 15, lineHeight: 2, color: C.t2 }}>
            <Opts value={filter} onChange={setFilter} options={[
              { v: "open", label: `À traiter (${data.counts.open})` }, { v: "matched", label: `Pointées (${data.counts.matched})` },
              { v: "ignored", label: `Écartées (${data.counts.ignored})` }, { v: "all", label: "Tout" },
            ]} />
          </p>
          {lines.map((l) => (
            <button key={l.id} type="button" className="br-row" onClick={() => setOpen(l)}>
              <span style={{ color: C.t3, fontSize: 12.5, paddingTop: 1 }}>{day(l.on)}</span>
              <span style={{ minWidth: 0 }}>
                <span className="br-desc" style={{ display: "block", color: C.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.description || "Sans libellé"}</span>
                <span style={{ display: "block", fontSize: 12.5, color: C.t3, marginTop: 2 }}>
                  {l.status === "matched" ? `${l.piece}${l.source ? ` · ${SOURCE_LABEL[l.source]}` : ""}${l.auto ? " · pointée automatiquement" : ""}`
                    : l.status === "ignored" ? `Écartée · ${l.note}` : "À traiter"}
                </span>
              </span>
              <span className="br-num" style={{ color: l.amount > 0 ? C.t1 : C.t2 }}>{signed(l.amount)}</span>
            </button>
          ))}
          {lines.length === 0 && <p style={{ margin: 0, padding: "20px 0", fontSize: 13, color: C.t3 }}>{filter === "open" ? "Tout est traité sur cette période." : "Aucune ligne."}</p>}
        </Section>
      )}

      {data && data.outstanding.length > 0 && (
        <Section title="Dans les livres, pas encore au relevé" description="Opérations de la période qui touchent la banque sans ligne de relevé pointée : virements pas encore passés, ou relevé pas encore importé.">
          {data.outstanding.map((o) => (
            <div key={o.piece + o.sourceId} className="br-row" style={{ cursor: "default" }}>
              <span style={{ color: C.t3, fontSize: 12.5, paddingTop: 1 }}>{day(o.at)}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", color: C.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.memo}</span>
                <span style={{ display: "block", fontSize: 12.5, color: C.t3, marginTop: 2 }}>{o.piece} · {SOURCE_LABEL[o.source]}</span>
              </span>
              <span className="br-num">{signed(o.amount)}</span>
            </div>
          ))}
        </Section>
      )}

      {file && <ImportPanel file={file} onClose={() => setFile(null)} onDone={(m) => { setFile(null); setMsg(m); refresh(); }} />}
      {open && <LinePanel line={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); refresh(); }} />}
    </div>
  );
}

/* ─── Import : correspondance des colonnes et aperçu ─── */
function ImportPanel({ file, onClose, onDone }: { file: { name: string; rows: string[][] }; onClose: () => void; onDone: (msg: string) => void }) {
  const cols = Math.max(...file.rows.slice(0, 20).map((r) => r.length));
  const [m, setM] = useState<Mapping>(() => {
    const g = guessMapping(file.rows);
    return g.bank === "Desjardins" ? g : savedMapping(cols) ?? g;
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { lines, rejected } = useMemo(() => applyMapping(file.rows, m), [file.rows, m]);
  const accounts = useMemo(() => (m.account != null ? [...new Set(file.rows.map((r) => r[m.account!]).filter(Boolean))] : []), [file.rows, m.account]);
  const range = lines.length ? `du ${day(lines.reduce((a, l) => (l.date < a ? l.date : a), lines[0].date))} au ${day(lines.reduce((a, l) => (l.date > a ? l.date : a), lines[0].date))}` : "";
  const sample = file.rows[m.skipHeader ? 1 : 0] ?? [];
  const colOpts = Array.from({ length: cols }, (_, i) => ({ v: i, label: `Colonne ${i + 1}${sample[i] ? ` · ${sample[i].slice(0, 24)}` : ""}` }));
  const sel = (label: string, key: keyof Mapping, optional = false) => (
    <label style={{ display: "block" }}>
      <span style={{ fontSize: 12.5, color: C.t3 }}>{label}</span>
      <select className="br-sel" value={m[key] == null ? "" : String(m[key])} onChange={(e) => setM({ ...m, [key]: e.target.value === "" ? null : Number(e.target.value) })}>
        {optional && <option value="">Aucune</option>}
        {colOpts.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
      </select>
    </label>
  );
  const go = async () => {
    setBusy(true); setErr(null);
    if (m.bank !== "Desjardins") saveMapping(cols, m);
    const r = await importStatement(file.name, lines);
    setBusy(false);
    if ("error" in r) { setErr(r.error ?? null); return; }
    onDone(`${r.added} ligne${r.added > 1 ? "s" : ""} ajoutée${r.added > 1 ? "s" : ""}${r.skipped ? `, ${r.skipped} déjà importée${r.skipped > 1 ? "s" : ""}` : ""}, ${r.matched} pointée${r.matched > 1 ? "s" : ""} automatiquement.`);
  };
  return (
    <SidePanel title="Importer un relevé" subtitle={file.name} onClose={onClose} width={620}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button>
        <button type="button" className="br-go" disabled={busy || lines.length === 0} onClick={go}>{busy ? "Import…" : `Importer ${lines.length} ligne${lines.length > 1 ? "s" : ""}`} <ArrowRight style={{ width: 15, height: 15 }} /></button></>}>
      <style>{CSS + GR_CSS}</style>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: C.t2 }}>
        {m.bank === "Desjardins" ? "Relevé Desjardins reconnu : les colonnes sont réglées d'office." : "Indiquez quelle colonne contient quoi ; ce réglage est retenu pour les prochains relevés du même format."}
        {" "}Une ligne déjà importée n'est jamais ajoutée deux fois.
      </p>
      {accounts.length > 1 && (
        <div style={{ marginTop: 18 }}>
          <span style={{ fontSize: 12.5, color: C.t3 }}>Compte du relevé à rapprocher</span>
          <p style={{ margin: "4px 0 0", fontSize: 15, lineHeight: 2, color: C.t2 }}>
            <Opts value={m.accountValue ?? ""} onChange={(v) => setM({ ...m, accountValue: v })} options={accounts.map((a) => ({ v: a, label: a === "EOP" ? "EOP · compte d'opérations" : a }))} />
          </p>
        </div>
      )}
      {m.bank !== "Desjardins" && (
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginTop: 18 }}>
          {sel("Date", "date")}{sel("Description", "description")}
          {sel("Montant signé (si une seule colonne)", "amount", true)}{sel("Solde", "balance", true)}
          {sel("Retrait", "withdrawal", true)}{sel("Dépôt", "deposit", true)}
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5, color: C.t2 }}>
            <input type="checkbox" checked={m.skipHeader} onChange={(e) => setM({ ...m, skipHeader: e.target.checked })} /> La 1re ligne est un en-tête
          </label>
        </div>
      )}
      <p style={{ margin: "22px 0 6px", fontSize: 13.5, color: C.t2 }}>
        <b style={{ color: C.t1, fontWeight: 600 }}>{lines.length} ligne{lines.length > 1 ? "s" : ""}</b> {range}{rejected ? ` · ${rejected} ligne${rejected > 1 ? "s" : ""} sans date ou sans montant ignorée${rejected > 1 ? "s" : ""}` : ""}
      </p>
      {lines.slice(0, 10).map((l, i) => (
        <div key={i} className="br-row" style={{ cursor: "default" }}>
          <span style={{ color: C.t3, fontSize: 12.5 }}>{day(l.date)}</span>
          <span style={{ color: C.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.description}</span>
          <span className="br-num">{signed(l.amount)}</span>
        </div>
      ))}
      {err && <div style={{ marginTop: 16 }}><Notice tone="err">{err}</Notice></div>}
    </SidePanel>
  );
}

/* ─── Une ligne du relevé ─── */
function LinePanel({ line, onClose, onDone }: { line: BankLine; onClose: () => void; onDone: () => void }) {
  const can = useCan()("accounting.entries");
  const [cands, setCands] = useState<BookItem[] | null>(null);
  const [mode, setMode] = useState<"match" | "expense" | "ignore">("match");
  const [cat, setCat] = useState("bank");
  const [label, setLabel] = useState(line.description);
  const [tax, setTax] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (line.status === "open") bankCandidates(line.id).then(setCands).catch((e: Error) => setErr(e.message)); }, [line]);
  const run = async (p: Promise<{ error?: string }>) => { setBusy(true); setErr(null); const r = await p; setBusy(false); if (r.error) setErr(r.error); else onDone(); };
  const same = (cands ?? []).filter((c) => c.same), near = (cands ?? []).filter((c) => !c.same);

  return (
    <SidePanel title={signed(line.amount)} subtitle={`${day(line.on)} · ${line.description || "Sans libellé"}`} onClose={onClose} width={560}>
      <style>{CSS + GR_CSS}</style>
      {line.balance != null && <p style={{ margin: 0, fontSize: 13, color: C.t3 }}>Solde après l'opération : {money(line.balance)}</p>}

      {line.status !== "open" && (
        <div style={{ marginTop: 18 }}>
          <p style={{ margin: 0, fontSize: 14.5, color: C.t1 }}>
            {line.status === "matched" ? <>Pointée sur <b style={{ fontWeight: 600 }}>{line.piece}</b>{line.source ? ` · ${SOURCE_LABEL[line.source]}` : ""}{line.auto ? ", automatiquement" : ""}.</> : <>Écartée : {line.note}</>}
          </p>
          {can && <div style={{ marginTop: 16 }}><button type="button" className="br-go" disabled={busy} onClick={() => run(unmatchLine(line.id))}>Remettre à traiter <ArrowRight style={{ width: 15, height: 15 }} /></button></div>}
        </div>
      )}

      {line.status === "open" && can && (
        <>
          <p style={{ margin: "16px 0 0", fontSize: 15, lineHeight: 2, color: C.t2 }}>
            <Opts value={mode} onChange={setMode} options={[
              { v: "match", label: "Pointer sur une opération" },
              ...(line.amount < 0 ? [{ v: "expense" as const, label: "En faire une dépense" }] : []),
              { v: "ignore", label: "Écarter" },
            ]} />
          </p>

          {mode === "match" && (
            <div style={{ marginTop: 10 }}>
              {!cands && <p style={{ fontSize: 13, color: C.t3 }}>Recherche des opérations proches…</p>}
              {cands && cands.length === 0 && <p style={{ margin: "10px 0 0", fontSize: 13.5, lineHeight: 1.6, color: C.t3 }}>Aucune opération ouverte dans les livres à 31 jours près. S'il s'agit d'un apport, d'un prêt ou d'un remboursement, saisissez l'écriture dans le Journal, puis revenez la pointer.</p>}
              {[["Même montant", same], ["Montant différent, à titre indicatif", near]].map(([title, list]) => (list as BookItem[]).length > 0 && (
                <div key={title as string} style={{ marginTop: 12 }}>
                  <p style={{ margin: "0 0 2px", fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", color: C.t3 }}>{title as string}</p>
                  {(list as BookItem[]).map((c) => (
                    <div key={c.piece + c.sourceId} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 12, alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.bds}` }}>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 14, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.memo}</span>
                        <span style={{ display: "block", fontSize: 12.5, color: C.t3, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{day(c.at)} · {c.piece} · {signed(c.amount)}{c.gap ? ` · ${c.gap} j d'écart` : ""}</span>
                      </span>
                      {c.same ? <button type="button" className="br-go" disabled={busy} onClick={() => run(matchLine(line.id, c.source, c.sourceId))}>Pointer <ArrowRight style={{ width: 15, height: 15 }} /></button>
                        : <span style={{ fontSize: 12.5, color: C.t3 }}>montant différent</span>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {mode === "expense" && (
            <div style={{ marginTop: 10 }}>
              <span style={{ fontSize: 12.5, color: C.t3 }}>Catégorie</span>
              <p style={{ margin: "2px 0 0", fontSize: 15, lineHeight: 2, color: C.t2 }}><Opts value={cat} onChange={setCat} options={EXPENSE_CATS} /></p>
              <label style={{ display: "block", marginTop: 16 }}><span style={{ fontSize: 12.5, color: C.t3 }}>Libellé</span><input className="gr-in" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={160} /></label>
              <label style={{ display: "block", marginTop: 16 }}><span style={{ fontSize: 12.5, color: C.t3 }}>Dont taxes récupérables (TPS/TVQ), facultatif</span><input className="gr-in" inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="0,00" /></label>
              <p style={{ margin: "14px 0 0", fontSize: 13, color: C.t3 }}>Dépense de {money(-line.amount)} datée du {day(line.on)}, aussitôt pointée.</p>
              <div style={{ marginTop: 16 }}><button type="button" className="br-go" disabled={busy || !label.trim()} onClick={() => run(lineToExpense(line.id, cat, label, dec(tax)))}>Créer la dépense <ArrowRight style={{ width: 15, height: 15 }} /></button></div>
            </div>
          )}

          {mode === "ignore" && (
            <div style={{ marginTop: 10 }}>
              <label style={{ display: "block" }}><span style={{ fontSize: 12.5, color: C.t3 }}>Pourquoi ? (gardé dans la piste d'audit)</span><input className="gr-in" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. virement entre mes propres comptes" maxLength={300} /></label>
              <p style={{ margin: "12px 0 0", fontSize: 13, lineHeight: 1.6, color: C.t3 }}>Une ligne écartée reste dans l'écart expliqué ; réservez-le à ce qui n'appartient pas à l'entreprise.</p>
              <div style={{ marginTop: 16 }}><button type="button" className="br-go" disabled={busy || !note.trim()} onClick={() => run(ignoreLine(line.id, note))}>Écarter la ligne <ArrowRight style={{ width: 15, height: 15 }} /></button></div>
            </div>
          )}
        </>
      )}
      {err && <div style={{ marginTop: 16 }}><Notice tone="err">{err}</Notice></div>}
    </SidePanel>
  );
}
