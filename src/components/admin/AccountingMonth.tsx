import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import { nfCad, nfUsdt } from "@/lib/adminOrders";
import { orderRef } from "@/lib/orders";
import { prefetchOrder } from "@/lib/orderDetailCache";
import { NET_NAME, exportAccountingCsv, loadOrders, monthLabel, monthRange, peekOrders, type AcctMonth, type AcctOrder } from "@/lib/accounting";
import { C, FONT } from "./adminTheme";
import { Button, Notice, Workspace, WsPane } from "./ui";
import { DataTable, TwoLine, type Column } from "./layout";

/**
 * Un mois de comptabilité sur sa propre page : le résumé posé sur le fond, les commandes dans
 * l'écrin, 20 par page, avec pour chacune le taux appliqué, le taux du marché et la marge.
 */

const PER = 20;
const money = (n: number) => `${nfCad.format(n)} $`;
const rateFmt = (n: number) => n.toLocaleString("fr-CA", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const dayFmt = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat("fr-CA", { hour: "2-digit", minute: "2-digit" });

function useWide() {
  const [w, setW] = useState(() => (typeof window === "undefined" ? 1200 : window.innerWidth));
  useEffect(() => { const on = () => setW(window.innerWidth); window.addEventListener("resize", on); return () => window.removeEventListener("resize", on); }, []);
  return w >= 900;
}

export default function AccountingMonth({ month, summary, onClose, onOpenOrder }: {
  month: string; summary: AcctMonth | null; onClose: () => void; onOpenOrder?: (id: string) => void;
}) {
  const wide = useWide();
  const { from, to } = monthRange(month);
  const [page, setPage] = useState(0);
  const [data, setData] = useState(() => peekOrders(from, to, 0));
  const [err, setErr] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let on = true;
    setData(peekOrders(from, to, page));
    loadOrders(from, to, page, PER).then((d) => { if (on) setData(d); }).catch((e: Error) => { if (on) setErr(e.message); });
    // La page suivante est préparée d'avance : « Suivantes » s'affiche sans attente.
    void loadOrders(from, to, page + 1, PER).catch(() => undefined);
    return () => { on = false; };
  }, [from, to, page]);

  const total = data?.total ?? summary?.n ?? 0;
  const pages = Math.max(1, Math.ceil(total / PER));
  const vol = summary ? summary.vol_buy + summary.vol_sell : 0;

  const cols: Column<AcctOrder>[] = [
    { key: "d", header: "Date", render: (o) => <TwoLine primary={dayFmt.format(new Date(o.created_at))} secondary={timeFmt.format(new Date(o.created_at))} /> },
    { key: "c", header: "Commande", render: (o) => <TwoLine primary={`${o.side === "buy" ? "Achat" : "Vente"} · ${o.client ?? "Client"}`} secondary={`${orderRef(o.id)} · ${NET_NAME[o.network] ?? o.network}`} /> },
    { key: "a", header: "Montant", align: "right", render: (o) => <TwoLine primary={money(o.cad)} secondary={`${nfUsdt.format(o.usdt)} USDT`} /> },
    { key: "r", header: "Taux appliqué · marché", align: "right", hideBelow: 760, render: (o) => <span style={{ color: C.t2 }}>{rateFmt(o.rate)} · {o.mid == null ? "–" : rateFmt(o.mid)}</span> },
    { key: "m", header: "Marge", align: "right", render: (o) => o.margin == null ? <span style={{ color: C.t3 }}>–</span> : <span style={{ color: o.margin >= 0 ? C.successText : C.dangerText }}>{money(o.margin)}</span> },
  ];

  const exportMonth = async () => {
    setExporting(true);
    try { await exportAccountingCsv(from, to, month); } catch (e) { setErr((e as Error).message); } finally { setExporting(false); }
  };

  const side = (
    <div style={{ display: "grid", gap: 22, fontFamily: FONT }}>
      <div>
        <p style={{ margin: 0, fontSize: 40, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1.05, color: C.sage }}>{money(summary?.margin ?? 0)}</p>
        <p style={{ margin: "8px 0 0", fontSize: 14, color: C.t2, lineHeight: 1.5 }}>
          de marge réelle sur <b style={{ color: C.t1, fontWeight: 600 }}>{money(vol)}</b> échangés
          {vol > 0 ? <>, soit {((summary!.margin / vol) * 100).toLocaleString("fr-CA", { maximumFractionDigits: 2 })} %.</> : "."}
        </p>
      </div>
      <dl style={{ margin: 0, display: "grid", gap: 14 }}>
        {[
          ["Commandes terminées", String(summary?.n ?? total)],
          ["Achats", `${money(summary?.vol_buy ?? 0)} · ${summary?.n_buy ?? 0}`],
          ["Ventes", `${money(summary?.vol_sell ?? 0)} · ${summary?.n_sell ?? 0}`],
          ["USDT échangés", nfUsdt.format(summary?.usdt ?? 0)],
          ["Frais facturés", money(summary?.fees ?? 0)],
        ].map(([k, v]) => (
          <div key={k}>
            <dt style={{ fontSize: 12.5, color: C.t3 }}>{k}</dt>
            <dd style={{ margin: "2px 0 0", fontSize: 15, color: C.t1, fontVariantNumeric: "tabular-nums" }}>{v}</dd>
          </div>
        ))}
      </dl>
      <Button onClick={exportMonth} disabled={exporting || !total}
        icon={exporting ? <Loader2 style={{ width: 15, height: 15, animation: "spin 1s linear infinite" }} /> : <Download style={{ width: 15, height: 15 }} />}>
        {exporting ? "Préparation…" : "Exporter ce mois"}
      </Button>
    </div>
  );

  const list = (
    <div style={{ padding: wide ? "18px 24px 22px" : "14px 16px 18px", display: "flex", flexDirection: "column", minHeight: "100%", boxSizing: "border-box" }}>
      {err && <div style={{ marginBottom: 12 }}><Notice tone="err">{err}</Notice></div>}
      <div style={{ flex: 1 }}>
        <DataTable rows={data?.rows ?? []} columns={cols} rowKey={(o) => o.id} pageSize={PER}
          onRowClick={onOpenOrder ? (o) => { onClose(); onOpenOrder(o.id); } : undefined}
          onRowIntent={(o) => prefetchOrder(o.id)}
          empty={<p style={{ margin: 0, padding: "28px 0", fontSize: 13, color: C.t3, textAlign: "center" }}>{data ? "Aucune commande terminée ce mois-ci." : "Chargement des commandes."}</p>}
          mobile={(o) => (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}><TwoLine primary={`${o.side === "buy" ? "Achat" : "Vente"} · ${money(o.cad)}`} secondary={`${orderRef(o.id)} · ${dayFmt.format(new Date(o.created_at))}`} /></div>
              <span style={{ fontSize: 13.5, color: (o.margin ?? 0) >= 0 ? C.successText : C.dangerText, fontVariantNumeric: "tabular-nums" }}>{o.margin == null ? "–" : money(o.margin)}</span>
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
    <Workspace title={monthLabel(month)} subtitle="Comptabilité · commandes terminées du mois" onClose={onClose} panes>
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
