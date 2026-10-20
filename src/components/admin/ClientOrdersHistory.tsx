import { useEffect, useMemo, useState } from "react";
import { prefetchOrder } from "@/lib/orderDetailCache";
import { ChevronLeft, ChevronRight, ShoppingCart } from "lucide-react";
import { nfCad } from "@/lib/adminOrders";
import { orderRef } from "@/lib/orders";
import type { ClientOrder } from "@/lib/adminClient";
import { C, FONT } from "./adminTheme";
import { Button, Workspace, WsPane } from "./ui";
import { DataTable, EmptyState, Pill, SearchField, TwoLine, type Column, type Tone } from "./layout";
import { assetSymbol } from "@/lib/assets";

/**
 * Historique complet des commandes d'un client, sur sa propre page (la fiche n'en montre que 6).
 * Comme le reste du back-office : les filtres sont posés sur le fond, la liste vit dans l'écrin,
 * page par page (20 commandes), jamais une liste sans fin.
 */

const PER_PAGE = 20;
const nfUsdt = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 });
const dateFmt = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("fr-CA", { hour: "2-digit", minute: "2-digit" });

const STATUS: Record<string, [string, Tone]> = {
  created: ["Créée", "neutral"], awaiting_payment: ["En attente", "neutral"], payment_received: ["Payée · à traiter", "warn"],
  settling: ["En cours", "info"], completed: ["Terminée", "ok"], cancelled: ["Annulée", "danger"], expired: ["Expirée", "neutral"], refunded: ["Remboursée", "neutral"],
};

type Group = "all" | "completed" | "active" | "closed";
type Side = "all" | "buy" | "sell";
const GROUPS: { id: Group; label: string; test: (s: string) => boolean }[] = [
  { id: "all", label: "Toutes", test: () => true },
  { id: "completed", label: "Terminées", test: (s) => s === "completed" },
  { id: "active", label: "En cours", test: (s) => ["created", "awaiting_payment", "payment_received", "settling"].includes(s) },
  { id: "closed", label: "Annulées ou remboursées", test: (s) => ["cancelled", "expired", "refunded"].includes(s) },
];
const SIDES: { id: Side; label: string }[] = [{ id: "all", label: "Achats et ventes" }, { id: "buy", label: "Achats" }, { id: "sell", label: "Ventes" }];

const CSS = `
.coh-f { all: unset; box-sizing: border-box; display: flex; align-items: baseline; gap: 10px; width: 100%; padding: 7px 0; cursor: pointer; font-family: ${FONT}; font-size: 14px; color: var(--a-t2); transition: color .15s, transform .3s cubic-bezier(.22,1,.36,1); }
.coh-f:hover { color: var(--a-t1); }
@media (any-hover: hover) { .coh-f:hover { transform: translateX(4px); } }
.coh-f:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 2px; border-radius: 6px; }
.coh-f[aria-pressed="true"] { color: var(--a-t1); font-weight: 500; }
.coh-tx { background-image: linear-gradient(currentColor, currentColor); background-repeat: no-repeat; background-position: 0 100%; background-size: 0 1.5px; padding-bottom: 3px; transition: background-size .35s cubic-bezier(.22,1,.36,1); }
.coh-f[aria-pressed="true"] .coh-tx { background-size: 100% 1.5px; }
`;

function useWide() {
  const [w, setW] = useState(() => (typeof window === "undefined" ? 1200 : window.innerWidth));
  useEffect(() => { const on = () => setW(window.innerWidth); window.addEventListener("resize", on); return () => window.removeEventListener("resize", on); }, []);
  return w >= 900;
}

export default function ClientOrdersHistory({ clientName, orders, onClose, onOpenOrder }: {
  clientName: string; orders: ClientOrder[]; onClose: () => void; onOpenOrder?: (id: string) => void;
}) {
  const wide = useWide();
  const [group, setGroup] = useState<Group>("all");
  const [side, setSide] = useState<Side>("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [orders]);
  const bySide = sorted.filter((o) => side === "all" || o.side === side);
  const needle = q.trim().toLowerCase();
  const list = bySide
    .filter((o) => GROUPS.find((g) => g.id === group)!.test(o.status))
    .filter((o) => !needle || orderRef(o.id).toLowerCase().includes(needle) || nfCad.format(o.cadAmount).includes(needle) || dateFmt.format(new Date(o.createdAt)).toLowerCase().includes(needle));
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const p = Math.min(page, pages - 1);
  const rows = list.slice(p * PER_PAGE, p * PER_PAGE + PER_PAGE);
  useEffect(() => setPage(0), [group, side, q]);

  const done = sorted.filter((o) => o.status === "completed");
  const volume = done.reduce((n, o) => n + o.cadAmount, 0);

  const columns: Column<ClientOrder>[] = [
    { key: "op", header: "Opération", render: (o) => <TwoLine primary={`${o.side === "buy" ? "Achat" : "Vente"} de ${nfUsdt.format(o.usdtAmount)} ${assetSymbol(o.asset)}`} secondary={orderRef(o.id)} /> },
    { key: "status", header: "Statut", render: (o) => { const s = STATUS[o.status] ?? [o.status, "neutral" as Tone]; return <Pill tone={s[1]}>{s[0]}</Pill>; } },
    { key: "amount", header: "Montant", align: "right", render: (o) => `${nfCad.format(o.cadAmount)} $` },
    { key: "date", header: "Date", align: "right", hideBelow: 700, render: (o) => <TwoLine primary={dateFmt.format(new Date(o.createdAt))} secondary={timeFmt.format(new Date(o.createdAt))} /> },
  ];

  const filters = (
    <div style={{ display: "grid", gap: 22 }}>
      <div>
        <p style={{ margin: 0, fontSize: 40, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1.05, color: C.t1 }}>
          {sorted.length} <span style={{ color: C.t3 }}>commande{sorted.length > 1 ? "s" : ""}</span>
        </p>
        <p style={{ margin: "8px 0 0", fontSize: 14, color: C.t2, lineHeight: 1.5 }}>
          <b style={{ color: C.sun, fontWeight: 600 }}>{nfCad.format(volume)} $</b> échangés en {done.length} commande{done.length > 1 ? "s" : ""} terminée{done.length > 1 ? "s" : ""}.
        </p>
      </div>
      <SearchField value={q} onChange={setQ} placeholder="Référence, montant, date" width={260} />
      <div>
        {GROUPS.map((g) => {
          const n = bySide.filter((o) => g.test(o.status)).length;
          return (
            <button key={g.id} type="button" className="coh-f" aria-pressed={group === g.id} onClick={() => setGroup(g.id)}>
              <span style={{ flex: 1 }}><span className="coh-tx">{g.label}</span></span>
              <span style={{ fontSize: 12.5, color: C.t3, fontVariantNumeric: "tabular-nums" }}>{n}</span>
            </button>
          );
        })}
      </div>
      <div>
        {SIDES.map((s) => (
          <button key={s.id} type="button" className="coh-f" aria-pressed={side === s.id} onClick={() => setSide(s.id)}>
            <span style={{ flex: 1 }}><span className="coh-tx">{s.label}</span></span>
          </button>
        ))}
      </div>
    </div>
  );

  const table = (
    <div style={{ padding: wide ? "18px 24px 22px" : "14px 16px 18px", display: "flex", flexDirection: "column", minHeight: "100%", boxSizing: "border-box" }}>
      <div style={{ flex: 1 }}>
        <DataTable rows={rows} columns={columns} rowKey={(o) => o.id} pageSize={PER_PAGE}
          onRowClick={onOpenOrder ? (o) => { onClose(); onOpenOrder(o.id); } : undefined}
          onRowIntent={(o) => prefetchOrder(o.id)}
          empty={<EmptyState icon={ShoppingCart} title="Aucune commande" text={orders.length ? "Aucune commande ne correspond à ces filtres." : "Ce client n'a encore rien acheté ni vendu."} />}
          mobile={(o) => { const s = STATUS[o.status] ?? [o.status, "neutral" as Tone]; return (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}><TwoLine primary={`${o.side === "buy" ? "Achat" : "Vente"} · ${nfCad.format(o.cadAmount)} $`} secondary={`${orderRef(o.id)} · ${dateFmt.format(new Date(o.createdAt))}`} /></div>
              <Pill tone={s[1]}>{s[0]}</Pill>
            </div>
          ); }} />
      </div>
      {list.length > PER_PAGE && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 18, fontFamily: FONT }}>
          <span style={{ flex: 1, fontSize: 13, color: C.t3, fontVariantNumeric: "tabular-nums" }}>
            {p * PER_PAGE + 1} à {Math.min(list.length, (p + 1) * PER_PAGE)} sur {list.length}
          </span>
          <Button size="sm" disabled={p === 0} onClick={() => setPage(p - 1)} icon={<ChevronLeft style={{ width: 14, height: 14 }} />}>Précédentes</Button>
          <Button size="sm" disabled={p >= pages - 1} onClick={() => setPage(p + 1)} icon={<ChevronRight style={{ width: 14, height: 14 }} />}>Suivantes</Button>
        </div>
      )}
    </div>
  );

  return (
    <Workspace title={`Commandes de ${clientName}`} subtitle="Historique complet, de la plus récente à la plus ancienne" onClose={onClose} panes>
      <style>{CSS}</style>
      {wide ? (
        <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "300px minmax(0, 1fr)", gap: 8 }}>
          <WsPane flat><div style={{ padding: "10px 18px 24px 14px" }}>{filters}</div></WsPane>
          <WsPane>{table}</WsPane>
        </div>
      ) : (
        <WsPane style={{ flex: 1 }}>
          <div style={{ padding: "16px 16px 0" }}>{filters}</div>
          {table}
        </WsPane>
      )}
    </Workspace>
  );
}
