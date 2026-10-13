import { useEffect, useState } from "react";
import { prefetchOrder } from "@/lib/orderDetailCache";
import { ArrowRight, Hand, Inbox, Loader2 } from "lucide-react";
import { CURRENT_OPERATOR, nfCad, nfUsdt, type AdminOrder } from "@/lib/adminOrders";
import { C } from "./adminTheme";
import { Button } from "./ui";
import { Avatar, DataTable, EmptyState, Tabs, TwoLine, type Column } from "./layout";
import { QueueWait } from "./viz";
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
  const [sellsOnly, setSellsOnly] = useState(false);

  const active = orders.filter((o) => o.status === "attente" || o.status === "recu" || o.status === "cours");
  const unassigned = active.filter((o) => !o.assignedTo);
  const mine = active.filter((o) => o.assignedTo === CURRENT_OPERATOR);
  const others = active.filter((o) => o.assignedTo && o.assignedTo !== CURRENT_OPERATOR);

  const base = tab === "queue" ? unassigned : tab === "mine" ? mine : others;
  const list = sellsOnly ? base.filter((o) => o.type === "sell") : base;
  // Les commandes actives sont peu nombreuses : leurs fiches sont préparées d'avance.
  useEffect(() => { active.slice(0, 15).forEach((o) => prefetchOrder(o.id, o.userId)); }, [active.map((o) => o.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  // On ne prend qu'une commande payée que le système n'est pas déjà en train d'envoyer.
  const claimable = (o: AdminOrder) => o.status === "recu" && !o.autoSending;
  const empty = {
    queue: "Aucune commande à prendre pour le moment.",
    mine: "Vous n'avez aucune commande en charge. Prenez-en une dans la file.",
    others: "Aucune commande n'est traitée par un autre membre.",
  }[tab];

  const action = (o: AdminOrder) => (
    <span style={{ display: "inline-flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
      {tab === "queue" && (claimable(o)
        ? <Button size="sm" variant="primary" icon={<Hand style={{ width: 14, height: 14 }} />} onClick={() => onPatch(o.id, { assignedTo: CURRENT_OPERATOR })}>Prendre</Button>
        : <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: C.t3, whiteSpace: "nowrap" }}>
            {o.autoSending || o.status === "cours" ? <><Loader2 style={{ width: 13, height: 13, animation: "spin 1.2s linear infinite" }} />Envoi automatique</> : "Attend le paiement"}
          </span>)}
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
      <QueueWait orders={active} onOpen={onOpen} mine={mine.length} unassigned={unassigned.length} />

      <MyDay orders={orders} active={active} claimable={claimable}
        onTake={(o) => { onPatch(o.id, { assignedTo: CURRENT_OPERATOR }); onOpen({ ...o, assignedTo: CURRENT_OPERATOR }); }}
        onSells={() => { setSellsOnly(true); setTab("queue"); }} />

      {sellsOnly && (
        <p style={{ margin: "22px 0 0", fontSize: 13, color: C.t2 }}>
          Ventes seulement · <button type="button" onClick={() => setSellsOnly(false)} style={{ all: "unset", cursor: "pointer", color: C.t1, textDecoration: "underline", textUnderlineOffset: 3 }}>tout afficher</button>
        </p>
      )}

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
        onRowIntent={(o) => prefetchOrder(o.id, o.userId)}
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

/**
 * « Ma journée » : ce qu'un opérateur doit savoir en arrivant, en trois repères.
 * À traiter maintenant (et prendre la plus ancienne d'un geste), les ventes à verser par Interac,
 * et ce qui est terminé aujourd'hui.
 */
const dayFmt = new Intl.DateTimeFormat("fr-CA", { weekday: "long", day: "numeric", month: "long" });

function MyDay({ orders, active, claimable, onTake, onSells }: {
  orders: AdminOrder[]; active: AdminOrder[]; claimable: (o: AdminOrder) => boolean;
  onTake: (o: AdminOrder) => void; onSells: () => void;
}) {
  const toTake = active.filter((o) => !o.assignedTo && claimable(o)).sort((a, b) => b.createdMinsAgo - a.createdMinsAgo);
  const oldest = toTake[0];
  const sells = active.filter((o) => o.type === "sell" && o.status === "recu" && (!o.assignedTo || o.assignedTo === CURRENT_OPERATOR));
  const sellsCad = sells.reduce((n, o) => n + o.cad, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const doneToday = orders.filter((o) => o.status === "termine" && o.updatedAt && new Date(o.updatedAt) >= today);
  const mineToday = doneToday.filter((o) => o.assignedTo === CURRENT_OPERATOR);

  const cell = (label: string, value: React.ReactNode, sub: React.ReactNode, action?: React.ReactNode) => (
    <div style={{ minWidth: 0 }}>
      <p style={{ margin: 0, fontSize: 12.5, color: C.t3 }}>{label}</p>
      <p style={{ margin: "4px 0 0", fontSize: 30, fontWeight: 600, letterSpacing: "-0.035em", fontVariantNumeric: "tabular-nums", lineHeight: 1.15 }}>{value}</p>
      <p style={{ margin: "2px 0 0", fontSize: 12.5, color: C.t3, lineHeight: 1.5 }}>{sub}</p>
      {action && <div style={{ marginTop: 10 }}>{action}</div>}
    </div>
  );

  return (
    <section aria-label="Ma journée" style={{ marginTop: 30 }}>
      <p style={{ margin: "0 0 14px", fontSize: 13, color: C.t2 }}>
        Ma journée <span style={{ color: C.t3 }}>· {dayFmt.format(new Date())}</span>
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 28 }}>
        {cell("À traiter maintenant",
          <span style={{ color: toTake.length ? C.coral : C.t1 }}>{toTake.length}</span>,
          oldest ? <>La plus ancienne attend depuis {ageShort(oldest.createdMinsAgo)}.</> : "Rien en attente : tout est pris en charge.",
          oldest && <Button size="sm" variant="primary" icon={<Hand style={{ width: 14, height: 14 }} />} onClick={() => onTake(oldest)}>Prendre la plus ancienne</Button>)}
        {cell("Ventes à verser par Interac",
          sells.length,
          sells.length ? <>{nfCad.format(sellsCad)} $ à envoyer aux clients.</> : "Aucun virement à envoyer.",
          sells.length > 0 && <Button size="sm" variant="ghost" icon={<ArrowRight style={{ width: 14, height: 14 }} />} onClick={onSells}>Voir les ventes</Button>)}
        {cell("Terminées aujourd'hui",
          <span style={{ color: doneToday.length ? C.sage : C.t1 }}>{doneToday.length}</span>,
          doneToday.length ? <>Dont {mineToday.length} par vous · {nfCad.format(doneToday.reduce((n, o) => n + o.cad, 0))} $ échangés.</> : "Aucune commande terminée pour l'instant.")}
      </div>
    </section>
  );
}

export default OrdersQueue;
