import { useMemo, useState } from "react";
import { prefetchOrder } from "@/lib/orderDetailCache";
import { Download, Inbox } from "lucide-react";
import { STATUS_META, TYPE_META, nfCad, nfUsdt, type AdminOrder, type OrderStatus } from "@/lib/adminOrders";
import { C } from "./adminTheme";
import { Button } from "./ui";
import { Avatar, DataTable, EmptyState, SearchField, Tabs, Toolbar, TwoLine, type Column } from "./layout";
import { OrdersCalendar } from "./viz";
import { OrderChannel, OrderStatusPill, dateOf, typeLabel } from "./orderBits";
import { assetSymbol } from "@/lib/assets";

interface Props {
  orders: AdminOrder[];
  onOpen: (order: AdminOrder) => void;
}

type TypeTab = "all" | "buy" | "sell";
type StatusFilter = "all" | OrderStatus;

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "Tous les statuts" },
  { id: "recu", label: "À traiter" },
  { id: "cours", label: "En cours" },
  { id: "attente", label: "En attente" },
  { id: "termine", label: "Terminées" },
  { id: "annule", label: "Annulées" },
  { id: "rembourse", label: "Remboursées" },
];

const OrdersList = ({ orders, onOpen }: Props) => {
  const [type, setType] = useState<TypeTab>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [q, setQ] = useState("");

  const base = useMemo(() => (type === "all" ? orders : orders.filter((o) => o.type === type)), [orders, type]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return base
      .filter((o) => status === "all" || o.status === status)
      .filter((o) => !needle || `${o.ref} ${o.clientName} ${o.clientEmail} ${o.address ?? ""}`.toLowerCase().includes(needle));
  }, [base, q, status]);

  const exportCSV = () => {
    const head = ["Référence", "Client", "Courriel", "Type", "Montant CAD", "Montant crypto", "Crypto", "Statut"];
    const body = rows.map((o) => [o.ref, o.clientName, o.clientEmail, TYPE_META[o.type].label, o.cad.toFixed(2), o.usdt.toFixed(2), assetSymbol(o.asset), STATUS_META[o.status].label]);
    const csv = [head, ...body].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `commandes-ooble-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns: Column<AdminOrder>[] = [
    { key: "client", header: "Client", sort: (o) => o.clientName, render: (o) => <TwoLine lead={<Avatar name={o.clientName} />} primary={o.clientName} secondary={o.clientEmail} /> },
    { key: "ref", header: "Référence", sort: (o) => o.ref, hideBelow: 1100, render: (o) => <span style={{ color: C.t2 }}>{o.ref}</span> },
    { key: "type", header: "Opération", hideBelow: 900, render: (o) => <TwoLine primary={typeLabel(o)} secondary={<OrderChannel order={o} />} /> },
    { key: "status", header: "Statut", sort: (o) => o.status, render: (o) => <OrderStatusPill status={o.status} /> },
    { key: "amount", header: "Montant", align: "right", sort: (o) => o.cad, render: (o) => <TwoLine primary={`${nfCad.format(o.cad)} $`} secondary={`${nfUsdt.format(o.usdt)} ${assetSymbol(o.asset)}`} /> },
    { key: "date", header: "Date", align: "right", sort: (o) => -o.createdMinsAgo, hideBelow: 760, render: (o) => <span style={{ color: C.t2, whiteSpace: "nowrap" }}>{dateOf(o.createdMinsAgo)}</span> },
  ];

  return (
    <div>
      <OrdersCalendar orders={orders} />

      <Tabs style={{ marginTop: 28 }} value={type} onChange={setType} items={[
        { id: "all", label: "Toutes", count: orders.length },
        { id: "buy", label: "Achats", count: orders.filter((o) => o.type === "buy").length },
        { id: "sell", label: "Ventes", count: orders.filter((o) => o.type === "sell").length },
      ]} />

      <Toolbar right={<Button size="sm" variant="ghost" icon={<Download style={{ width: 14, height: 14 }} />} onClick={exportCSV}>Exporter</Button>}>
        <SearchField value={q} onChange={setQ} placeholder="Client, référence, courriel, adresse" />
        <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} aria-label="Statut" className="ui-input"
          style={{ height: 36, padding: "0 10px", borderRadius: 9, border: `1px solid ${C.bds}`, background: "var(--a-inputBg)", color: C.t1, fontSize: 13.5 }}>
          {STATUS_FILTERS.map((f) => <option key={f.id} value={f.id}>{f.label} ({f.id === "all" ? base.length : base.filter((o) => o.status === f.id).length})</option>)}
        </select>
      </Toolbar>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(o) => o.id}
        onRowClick={onOpen}
        onRowIntent={(o) => prefetchOrder(o.id, o.userId)}
        initialSort={{ key: "date", dir: "desc" }}
        empty={<EmptyState icon={Inbox} title="Aucune commande" text="Aucune commande ne correspond à ces filtres." />}
        mobile={(o) => (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Avatar name={o.clientName} size={34} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <TwoLine primary={o.clientName} secondary={`${typeLabel(o)} · ${dateOf(o.createdMinsAgo)}`} />
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13.5, fontVariantNumeric: "tabular-nums" }}>{nfCad.format(o.cad)} $</div>
              <div style={{ marginTop: 4 }}><OrderStatusPill status={o.status} /></div>
            </div>
          </div>
        )}
      />
    </div>
  );
};

export default OrdersList;
