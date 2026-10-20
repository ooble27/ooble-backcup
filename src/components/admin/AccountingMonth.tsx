import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2, Lock, LockOpen } from "lucide-react";
import { nfCad, nfUsdt } from "@/lib/adminOrders";
import { orderRef } from "@/lib/orders";
import { prefetchOrder } from "@/lib/orderDetailCache";
import { useCan } from "@/lib/roles";
import { put } from "@/lib/adminCache";
import {
  NET_NAME, RECON_LABEL, closeMonth, exportAccountingCsv, loadClosures, loadOrders, monthEnded, monthLabel, monthRange, peekClosures, peekOrders, reopenMonth,
  type AcctMonth, type AcctOrder, type Closure,
} from "@/lib/accounting";
import { C, FONT } from "./adminTheme";
import { Button, Notice, TextArea, Workspace, WsPane } from "./ui";
import { DataTable, Pill, TwoLine, type Column, type Tone } from "./layout";

/**
 * Un mois de comptabilité sur sa propre page.
 * À gauche, sur le fond : le résumé, le filtre « à vérifier » et la clôture du mois.
 * Dans l'écrin : le grand livre, 20 commandes par page, avec taux, marge et rapprochement.
 */

const PER = 20;
const money = (n: number) => `${nfCad.format(n)} $`;
const rateFmt = (n: number) => n.toLocaleString("fr-CA", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const dayFmt = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat("fr-CA", { hour: "2-digit", minute: "2-digit" });
const longFmt = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "long", year: "numeric" });
const RECON_TONE: Record<string, Tone> = { ok: "ok", gap: "warn", manual: "danger" };

const CSS = `
.am-f { all: unset; cursor: pointer; font-family: ${FONT}; font-size: 14px; color: var(--a-t3); padding: 4px 0; transition: color .15s; }
.am-f:hover, .am-f[aria-pressed="true"] { color: var(--a-t1); }
.am-f[aria-pressed="true"] { font-weight: 500; }
.am-f span { background-image: linear-gradient(currentColor, currentColor); background-repeat: no-repeat; background-position: 0 100%; background-size: 0 1.5px; padding-bottom: 3px; transition: background-size .35s cubic-bezier(.22,1,.36,1); }
.am-f[aria-pressed="true"] span, .am-f:hover span { background-size: 100% 1.5px; }
.am-f:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 3px; border-radius: 4px; }
`;

function useWide() {
  const [w, setW] = useState(() => (typeof window === "undefined" ? 1200 : window.innerWidth));
  useEffect(() => { const on = () => setW(window.innerWidth); window.addEventListener("resize", on); return () => window.removeEventListener("resize", on); }, []);
  return w >= 900;
}

/** Pourquoi une commande n'est pas rapprochée, en une phrase. */
function reconWhy(o: AcctOrder): string {
  const r = o.recon;
  if (r.state === "ok") return o.side === "buy" ? `Interac reçu ${money(r.in_cad ?? 0)} · ${nfUsdt.format(r.out_usdt ?? 0)} USDT envoyés` : `${nfUsdt.format(r.in_usdt ?? 0)} USDT reçus`;
  if (r.state === "manual") return o.side === "buy"
    ? `Terminée sans ${r.in_cad == null ? "virement Interac enregistré" : "envoi de cryptomonnaie confirmé"}`
    : "Terminée sans réception de cryptomonnaie enregistrée";
  return o.side === "buy"
    ? `Reçu ${money(r.in_cad ?? 0)} pour ${money(o.cad)} · envoyé ${nfUsdt.format(r.out_usdt ?? 0)} pour ${nfUsdt.format(o.usdt)} USDT`
    : `Reçu ${nfUsdt.format(r.in_usdt ?? 0)} pour ${nfUsdt.format(o.usdt)} USDT`;
}

export default function AccountingMonth({ month, summary, initialCheck = false, onClose, onOpenOrder, onChanged }: {
  month: string; summary: AcctMonth | null; initialCheck?: boolean; onClose: () => void; onOpenOrder?: (id: string) => void; onChanged?: () => void;
}) {
  const wide = useWide();
  const can = useCan();
  const { from, to } = monthRange(month);
  const [onlyCheck, setOnlyCheck] = useState(initialCheck);
  const [page, setPage] = useState(0);
  const [data, setData] = useState(() => peekOrders(from, to, 0, initialCheck));
  const [err, setErr] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [closures, setClosures] = useState<Map<string, Closure> | null>(() => peekClosures());
  const [closing, setClosing] = useState<"close" | "reopen" | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let on = true;
    setData(peekOrders(from, to, page, onlyCheck));
    loadOrders(from, to, page, PER, onlyCheck).then((d) => { if (on) setData(d); }).catch((e: Error) => { if (on) setErr(e.message); });
    void loadOrders(from, to, page + 1, PER, onlyCheck).catch(() => undefined);
    return () => { on = false; };
  }, [from, to, page, onlyCheck]);
  useEffect(() => { loadClosures().then(setClosures).catch(() => undefined); }, []);

  const total = data?.total ?? (onlyCheck ? summary?.to_check : summary?.n) ?? 0;
  const pages = Math.max(1, Math.ceil(total / PER));
  const vol = summary ? summary.vol_buy + summary.vol_sell : 0;
  const closure = closures?.get(month);
  const closed = closure?.action === "close";
  // Le mois a-t-il changé depuis sa clôture ? (remboursement, commande terminée en retard…)
  const drift = closed && closure?.totals && summary
    ? Number(closure.totals.n) !== summary.n || Math.abs(Number(closure.totals.volume) - vol) > 0.005 || Math.abs(Number(closure.totals.margin) - summary.margin) > 0.005
    : false;

  const cols: Column<AcctOrder>[] = [
    { key: "d", header: "Date", render: (o) => <TwoLine primary={dayFmt.format(new Date(o.created_at))} secondary={timeFmt.format(new Date(o.created_at))} /> },
    { key: "c", header: "Commande", render: (o) => <TwoLine primary={`${o.side === "buy" ? "Achat" : "Vente"} · ${o.client ?? "Client"}`} secondary={`${orderRef(o.id)} · ${NET_NAME[o.network] ?? o.network}`} /> },
    { key: "a", header: "Montant", align: "right", render: (o) => <TwoLine primary={money(o.cad)} secondary={`${nfUsdt.format(o.usdt)} USDT`} /> },
    { key: "r", header: "Taux appliqué · marché", align: "right", hideBelow: 1100, render: (o) => <span style={{ color: C.t2 }}>{rateFmt(o.rate)} · {o.mid == null ? "–" : rateFmt(o.mid)}</span> },
    { key: "m", header: "Marge", align: "right", render: (o) => o.margin == null ? <span style={{ color: C.t3 }}>–</span> : <span style={{ color: o.margin >= 0 ? C.successText : C.dangerText }}>{money(o.margin)}</span> },
    { key: "k", header: "Rapprochement", align: "right", hideBelow: 760, render: (o) => <span title={reconWhy(o)}><Pill tone={RECON_TONE[o.recon.state]}>{RECON_LABEL[o.recon.state]}</Pill></span> },
  ];

  const exportMonth = async () => {
    setExporting(true);
    try { await exportAccountingCsv(from, to, month); } catch (e) { setErr((e as Error).message); } finally { setExporting(false); }
  };

  const submitClosure = async () => {
    if (!closing) return;
    setBusy(true); setErr(null);
    const res = closing === "close" ? await closeMonth(month, note) : await reopenMonth(month, note);
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    setClosing(null); setNote("");
    put("acct.closures", null);
    const fresh = await loadClosures().catch(() => null);
    if (fresh) setClosures(fresh);
    onChanged?.();
  };

  const closureBlock = (
    <div style={{ display: "grid", gap: 10 }}>
      <p style={{ margin: 0, fontSize: 12.5, color: C.t3 }}>Clôture du mois</p>
      {closed ? (
        <>
          <p style={{ margin: 0, fontSize: 14, color: C.t1, display: "flex", alignItems: "center", gap: 8 }}>
            <Lock style={{ width: 15, height: 15, color: C.sage }} strokeWidth={2} /> Clôturé le {longFmt.format(new Date(closure!.at))}
          </p>
          <p style={{ margin: 0, fontSize: 12.5, color: C.t3, lineHeight: 1.5 }}>
            Par {closure!.by ?? "l'équipe"}. Totaux figés : {Number(closure!.totals?.n ?? 0)} commandes, {money(Number(closure!.totals?.volume ?? 0))}, marge {money(Number(closure!.totals?.margin ?? 0))}.
            {closure!.note ? ` « ${closure!.note} »` : ""}
          </p>
          {drift && <Notice tone="warn">Le mois a changé depuis sa clôture (remboursement, commande terminée en retard…) : les totaux actuels ne correspondent plus aux totaux figés.</Notice>}
          {can("accounting.reopen") && closing !== "reopen" && (
            <div><Button size="sm" variant="ghost" icon={<LockOpen style={{ width: 14, height: 14 }} />} onClick={() => { setClosing("reopen"); setNote(""); }}>Rouvrir le mois</Button></div>
          )}
        </>
      ) : monthEnded(month) ? (
        <>
          <p style={{ margin: 0, fontSize: 12.5, color: C.t2, lineHeight: 1.55 }}>
            {closure?.action === "reopen" ? `Rouvert le ${longFmt.format(new Date(closure.at))} par ${closure.by ?? "l'équipe"}. ` : ""}
            Clôturer fige les totaux du mois pour le comptable ; tout changement ultérieur sera signalé.
          </p>
          {can("accounting.close") && closing !== "close" && (
            <div><Button size="sm" icon={<Lock style={{ width: 14, height: 14 }} />} onClick={() => { setClosing("close"); setNote(""); }}>Clôturer le mois</Button></div>
          )}
        </>
      ) : (
        <p style={{ margin: 0, fontSize: 12.5, color: C.t3, lineHeight: 1.55 }}>Le mois est en cours : il pourra être clôturé à partir du 1er du mois suivant.</p>
      )}

      {closing && (
        <div style={{ display: "grid", gap: 10, marginTop: 4 }}>
          {closing === "close" && (summary?.to_check ?? 0) > 0 && (
            <Notice tone="warn">{summary!.to_check} commande{summary!.to_check > 1 ? "s" : ""} de ce mois {summary!.to_check > 1 ? "sont" : "est"} à vérifier. Vous pouvez clôturer quand même ; elles resteront signalées.</Notice>
          )}
          <TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} style={{ resize: "none" }}
            placeholder={closing === "close" ? "Note pour le comptable (facultatif)" : "Pourquoi rouvrir ce mois ? (obligatoire)"} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button size="sm" variant="primary" disabled={busy || (closing === "reopen" && !note.trim())} onClick={submitClosure}>
              {busy ? "Enregistrement…" : closing === "close" ? "Confirmer la clôture" : "Confirmer la réouverture"}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setClosing(null)}>Annuler</Button>
          </div>
        </div>
      )}
    </div>
  );

  const side = (
    <div style={{ display: "grid", gap: 24, fontFamily: FONT }}>
      <div>
        <p style={{ margin: 0, fontSize: 40, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1.05, color: C.sage }}>{money(summary?.margin ?? 0)}</p>
        <p style={{ margin: "8px 0 0", fontSize: 14, color: C.t2, lineHeight: 1.5 }}>
          de marge réelle sur <b style={{ color: C.t1, fontWeight: 600 }}>{money(vol)}</b> échangés
          {vol > 0 ? <>, soit {((summary!.margin / vol) * 100).toLocaleString("fr-CA", { maximumFractionDigits: 2 })} %.</> : "."}
        </p>
      </div>

      <nav aria-label="Filtre" style={{ display: "grid", gap: 2 }}>
        <button type="button" className="am-f" aria-pressed={!onlyCheck} onClick={() => { setOnlyCheck(false); setPage(0); }}>
          <span>Toutes les commandes</span> <small style={{ color: C.t3 }}>{summary?.n ?? ""}</small>
        </button>
        <button type="button" className="am-f" aria-pressed={onlyCheck} onClick={() => { setOnlyCheck(true); setPage(0); }}>
          <span>À vérifier</span> <small style={{ color: (summary?.to_check ?? 0) ? C.coral : C.t3 }}>{summary?.to_check ?? ""}</small>
        </button>
      </nav>

      <dl style={{ margin: 0, display: "grid", gap: 12 }}>
        {[
          ["Achats", `${money(summary?.vol_buy ?? 0)} · ${summary?.n_buy ?? 0}`],
          ["Ventes", `${money(summary?.vol_sell ?? 0)} · ${summary?.n_sell ?? 0}`],
          ["USDC et USDT échangés", nfUsdt.format(summary?.usdt ?? 0)],
          ["Frais facturés", money(summary?.fees ?? 0)],
        ].map(([k, v]) => (
          <div key={k}>
            <dt style={{ fontSize: 12.5, color: C.t3 }}>{k}</dt>
            <dd style={{ margin: "2px 0 0", fontSize: 15, color: C.t1, fontVariantNumeric: "tabular-nums" }}>{v}</dd>
          </div>
        ))}
      </dl>

      {closureBlock}

      <Button onClick={exportMonth} disabled={exporting || !summary?.n}
        icon={exporting ? <Loader2 style={{ width: 15, height: 15, animation: "spin 1s linear infinite" }} /> : <Download style={{ width: 15, height: 15 }} />}>
        {exporting ? "Préparation…" : "Exporter ce mois"}
      </Button>
    </div>
  );

  const list = (
    <div style={{ padding: wide ? "18px 24px 22px" : "14px 16px 18px", display: "flex", flexDirection: "column", minHeight: "100%", boxSizing: "border-box" }}>
      {err && <div style={{ marginBottom: 12 }}><Notice tone="err">{err}</Notice></div>}
      {onlyCheck && (data?.rows.length ?? 0) > 0 && (
        <p style={{ margin: "0 0 12px", fontSize: 12.5, lineHeight: 1.55, color: C.t3 }}>
          Sans preuve : la commande a été terminée sans virement ou envoi enregistré (souvent traitée à la main). Écart : l'argent reçu ou envoyé diffère du montant de la commande. Survolez l'état pour le détail.
        </p>
      )}
      <div style={{ flex: 1 }}>
        <DataTable rows={data?.rows ?? []} columns={cols} rowKey={(o) => o.id} pageSize={PER}
          onRowClick={onOpenOrder ? (o) => { onClose(); onOpenOrder(o.id); } : undefined}
          onRowIntent={(o) => prefetchOrder(o.id)}
          empty={<p style={{ margin: 0, padding: "28px 0", fontSize: 13, color: C.t3, textAlign: "center" }}>
            {!data ? "Chargement des commandes." : onlyCheck ? "Rien à vérifier : toutes les commandes du mois sont rapprochées." : "Aucune commande terminée ce mois-ci."}
          </p>}
          mobile={(o) => (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}><TwoLine primary={`${o.side === "buy" ? "Achat" : "Vente"} · ${money(o.cad)}`} secondary={`${orderRef(o.id)} · ${dayFmt.format(new Date(o.created_at))}`} /></div>
              <Pill tone={RECON_TONE[o.recon.state]}>{RECON_LABEL[o.recon.state]}</Pill>
            </div>
          )} />
      </div>
      {total > PER && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 18, fontFamily: FONT }}>
          <span style={{ flex: 1, fontSize: 13, color: C.t3, fontVariantNumeric: "tabular-nums" }}>{page * PER + 1} à {Math.min(total, (page + 1) * PER)} sur {total}</span>
          <Button size="sm" disabled={page === 0} onClick={() => setPage(page - 1)} icon={<ChevronLeft style={{ width: 14, height: 14 }} />}>Précédentes</Button>
          <Button size="sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} icon={<ChevronRight style={{ width: 14, height: 14 }} />}>Suivantes</Button>
        </div>
      )}
    </div>
  );

  return (
    <Workspace title={monthLabel(month)} subtitle={closed ? "Comptabilité · mois clôturé" : "Comptabilité · commandes terminées du mois"} onClose={onClose} panes>
      <style>{CSS}</style>
      {wide ? (
        <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "300px minmax(0, 1fr)", gap: 8 }}>
          <WsPane flat><div style={{ padding: "10px 18px 24px 14px" }}>{side}</div></WsPane>
          <WsPane>{list}</WsPane>
        </div>
      ) : (
        <WsPane style={{ flex: 1 }}>
          <div style={{ padding: "16px 16px 4px" }}>{side}</div>
          {list}
        </WsPane>
      )}
    </Workspace>
  );
}
