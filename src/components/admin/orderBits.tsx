/** Petits éléments partagés par les écrans de commandes (nouvelle génération). */
import { NETWORKS } from "@/components/app/networks";
import { STATUS_META, TYPE_META, type AdminOrder, type OrderStatus } from "@/lib/adminOrders";
import { C } from "./adminTheme";
import { Pill, type Tone } from "./layout";

const STATUS_TONE: Record<OrderStatus, Tone> = {
  attente: "neutral", recu: "warn", cours: "info", termine: "ok", annule: "danger", rembourse: "neutral",
};
const STATUS_LABEL: Partial<Record<OrderStatus, string>> = { recu: "Payée · à traiter" };

export function OrderStatusPill({ status }: { status: OrderStatus }) {
  return <Pill tone={STATUS_TONE[status]} dot>{STATUS_LABEL[status] ?? STATUS_META[status].label}</Pill>;
}

export function OrderChannel({ order }: { order: AdminOrder }) {
  if (order.type === "sell") return <span style={{ color: C.t2 }}>Interac</span>;
  const net = NETWORKS.find((n) => n.id === order.network);
  if (!net) return <span style={{ color: C.t3 }}>—</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color: C.t2, whiteSpace: "nowrap" }}>
      <img src={`/coins/${net.id}.svg`} alt="" width={16} height={16} style={{ borderRadius: 99 }} draggable={false} />
      {net.name}
    </span>
  );
}

export const typeLabel = (o: AdminOrder) => TYPE_META[o.type].label;

/** « 16 min », « 3 h », « 2 j ». */
export const ageShort = (mins: number) => {
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} j`;
};

export const dateOf = (mins: number) =>
  new Date(Date.now() - mins * 60000).toLocaleString("fr-CA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** États des envois d'USDT et des dépôts lus sur la blockchain. */
export const PAYOUT_PILL: Record<string, { label: string; tone: Tone }> = {
  sending: { label: "Envoi…", tone: "info" },
  broadcast: { label: "Diffusé", tone: "info" },
  confirmed: { label: "Confirmé", tone: "ok" },
  failed: { label: "Échoué", tone: "warn" },
  review: { label: "À vérifier", tone: "danger" },
};
export const DEPOSIT_PILL: Record<string, { label: string; tone: Tone }> = {
  new: { label: "En attente d'une vente", tone: "neutral" },
  matched: { label: "Rapproché", tone: "ok" },
  review: { label: "À vérifier", tone: "danger" },
  unmatched: { label: "Sans vente", tone: "warn" },
  ignored: { label: "Écarté", tone: "neutral" },
};
