import { useState } from "react";
import { Hand, Inbox } from "lucide-react";
import { CURRENT_OPERATOR, nfCad, nfUsdt, type AdminOrder } from "@/lib/adminOrders";
import { C } from "./adminTheme";
import { Button } from "./ui";
import { Avatar, DataTable, EmptyState, StatStrip, Tabs, TwoLine, type Column } from "./layout";
import { OrderChannel, OrderStatusPill, ageShort, typeLabel } from "./orderBits";

interface Props {
  orders: AdminOrder[];
  onOpen: (order: AdminOrder) => void;
  onPatch: (id: string, changes: Partial<AdminOrder>) => void;
}

type SubTab = "queue" | "mine" | "others";

/**
 * File d'attente : les commandes actives (en attente de paiement, payées,
 * en cours). On en prend une avant de la traiter : elle se verrouille pour le
 * reste de l'équipe.
 */
const OrdersQueue = ({ orders, onOpen, onPatch }: Props) => {
  const [tab, setTab] = useState<SubTab>("queue");

  const active = orders.filter((o) => o.status === "attente" || o.status === "recu" || o.status === "cours");
  const unassigned = active.filter((o) => !o.assignedTo);
  const mine = active.filter((o) => o.assignedTo === CURRENT_OPERATOR);
  const others = active.filter((o) => o.assignedTo && o.assignedTo !== CURRENT_OPERATOR);
  const paid = active.filter((o) => o.status === "recu");
  const oldestPaid = paid.reduce((m, o) => Math.max(m, o.createdMinsAgo), 0);

  const list = tab === "queue" ? unassigned : tab === "mine" ? mine : others;
  const empty = {
    queue: "Aucune commande à prendre pour le moment.",
    mine: "Vous n'avez aucune commande en charge. Prenez-en une dans la file.",
    others: "Aucune commande n'est traitée par un autre membre.",
  }[tab];

  const action = (o: AdminOrder) => (
    <span style={{ display: "inline-flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
      {tab === "queue" && <Button size="sm" variant="primary" icon={<Hand style={{ width: 14, height: 14 }} />} onClick={() => onPatch(o.id, { assignedTo: CURRENT_OPERATOR })}>Prendre</Button>}
      {tab === "mine" && <>
        <Button size="sm" variant="ghost" onClick={() => onPatch(o.id, { assignedTo: null })}>Libérer</Button>
        <Button size="sm" variant="primary" onClick={() => onOpen(o)}>Traiter</Button>
      </>}
      {tab === "others" && <Button size="sm" onClick={() => onOpen(o)}>Ouvrir</Button>}
    </span>
  );

  const columns: Column<AdminOrder>[] = [
    { key: "client", header: "Client", render: (o) => <TwoLine lead={<Avatar name={o.clientName} />} primary={o.clientName} secondary={o.ref} />, sort: (o) => o.clientName },
    { key: "type", header: "Opération", render: (o) => <TwoLine primary={typeLabel(o)} secondary={<OrderChannel order={o} />} />, hideBelow: 900 },
    { key: "status", header: "Statut", render: (o) => <OrderStatusPill status={o.status} />, sort: (o) => o.status },
    { key: "amount", header: "Montant", align: "right", sort: (o) => o.cad,
      render: (o) => <TwoLine primary={`${nfCad.format(o.cad)} $`} secondary={`${nfUsdt.format(o.usdt)} USDT`} /> },
    { key: "age", header: "Attente", align: "right", sort: (o) => o.createdMinsAgo, hideBelow: 760,
      render: (o) => <span style={{ color: o.status === "recu" && o.createdMinsAgo > 30 ? C.warnText : C.t2 }}>{ageShort(o.createdMinsAgo)}</span> },
    { key: "action", header: "", align: "right", render: action },
  ];

  return (
    <div>
      <StatStrip items={[
        { label: "À prendre", value: unassigned.length },
        { label: "Payées, à traiter", value: paid.length, tone: paid.length ? "warn" : undefined, hint: paid.length ? `la plus ancienne attend depuis ${ageShort(oldestPaid)}` : "aucune" },
        { label: "En charge par vous", value: mine.length },
        { label: "Volume actif", value: `${nfCad.format(active.reduce((s, o) => s + o.cad, 0))} $` },
      ]} />

      <Tabs style={{ marginTop: 28 }} value={tab} onChange={setTab} items={[
        { id: "queue", label: "À prendre", count: unassigned.length },
        { id: "mine", label: "Mes commandes", count: mine.length },
        { id: "others", label: "Par l'équipe", count: others.length },
      ]} />

      <DataTable
        rows={list}
        columns={columns}
        rowKey={(o) => o.id}
        onRowClick={onOpen}
        initialSort={{ key: "age", dir: "desc" }}
        empty={<EmptyState icon={Inbox} title="Rien ici" text={empty} />}
        mobile={(o) => (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <TwoLine primary={<>{o.clientName} <span style={{ color: C.t3 }}>· {typeLabel(o)}</span></>} secondary={<>{nfCad.format(o.cad)} $ · {ageShort(o.createdMinsAgo)}</>} />
              <div style={{ marginTop: 6 }}><OrderStatusPill status={o.status} /></div>
            </div>
            {action(o)}
          </div>
        )}
      />
    </div>
  );
};

export default OrdersQueue;
