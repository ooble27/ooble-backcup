/**
 * Back-office — accès aux vraies commandes Supabase.
 *
 * Le back-office a été conçu autour du type `AdminOrder` (modèle démo). Plutôt
 * que de tout réécrire, on branche la base ici : on lit les vraies commandes,
 * on les convertit vers `AdminOrder`, et on répercute les changements de statut
 * dans la base. L'UID reste identique côté composants.
 */
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetchAll";
import type { Database } from "@/integrations/supabase/types";
import { DB_TO_NET, orderRef } from "@/lib/orders";
import { CURRENT_OPERATOR, nfCad, nfUsdt, type AdminOrder, type OrderStatus } from "@/lib/adminOrders";
import { sendEmail } from "@/lib/email";
import { NETWORKS } from "@/components/app/networks";
import { logAdminAction } from "@/lib/audit";
import { EXPLORER_NAME, fetchOutboundTx, txUrl } from "@/lib/settlement";
import { firstName, loadMembers, peekMembers } from "@/lib/teamSpace";

type DbStatus = Database["public"]["Enums"]["order_status"];
type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
type RowWithProfile = OrderRow & { profiles: { full_name: string | null; email: string | null } | null };

/** Statut base → statut d'affichage du back-office. */
const DB_TO_DEMO: Record<DbStatus, OrderStatus> = {
  created: "attente",
  awaiting_payment: "attente",
  payment_received: "recu",
  settling: "cours",
  completed: "termine",
  cancelled: "annule",
  expired: "annule",
  refunded: "rembourse",
};

/** Statut d'affichage → statut base (pour l'écriture). */
const DEMO_TO_DB: Record<OrderStatus, DbStatus> = {
  attente: "awaiting_payment",
  recu: "payment_received",
  cours: "settling",
  termine: "completed",
  annule: "cancelled",
  rembourse: "refunded",
};

const minsAgo = (iso: string) =>
  Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));

/** Convertit une ligne base (+ profil) vers le modèle du back-office. */
function toAdminOrder(row: RowWithProfile, currentUid: string | null, team: Map<string, string>): AdminOrder {
  // Prise en charge : « Vous », ou le prénom du membre qui s'en occupe.
  const assigned = row.assigned_to
    ? (row.assigned_to === currentUid ? CURRENT_OPERATOR : team.get(row.assigned_to) ?? "Un membre de l'équipe")
    : null;
  return {
    id: row.id,
    ref: orderRef(row.id),
    type: row.side, // 'buy' | 'sell'
    status: DB_TO_DEMO[row.status],
    userId: row.user_id,
    clientName: row.profiles?.full_name?.trim() || "Client",
    clientEmail: row.profiles?.email ?? row.interac_email ?? "",
    cad: Number(row.cad_amount),
    usdt: Number(row.usdt_amount),
    rate: Number(row.locked_rate),
    network: DB_TO_NET[row.network],
    address: row.wallet_address,
    interacEmail: row.interac_email ?? undefined,
    createdMinsAgo: minsAgo(row.created_at),
    updatedAt: row.updated_at,
    assignedTo: assigned,
    assignedId: row.assigned_to ?? null,
    isTest: !!row.is_test,
  };
}

/** Supprime définitivement une commande (RLS : admin uniquement). */
export async function deleteOrder(id: string): Promise<{ error?: string }> {
  // Snapshot avant suppression pour l'audit.
  const { data: before } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  // Commande d'essai (compte de test) : retirée des listes, jamais effacée de la base.
  if (before?.is_test) {
    const { error } = await supabase.rpc("remove_test_order", { _id: id });
    if (error) return { error: error.message };
    void logAdminAction({ action: "order.test_removed", entityKind: "order", entityId: id, before, after: null });
    return {};
  }
  const { error } = await supabase.from("orders").delete().eq("id", id);
  if (error) return { error: error.message };
  void logAdminAction({
    action: "order.delete",
    entityKind: "order",
    entityId: id,
    before,
    after: null,
  });
  return {};
}

/** Lit toutes les commandes (le staff les voit toutes via RLS). */
export async function fetchAdminOrders(): Promise<AdminOrder[]> {
  const { data: auth } = await supabase.auth.getSession();
  const uid = auth.session?.user?.id ?? null;

  // Par tranches de 1 000 : au-delà, Supabase tronquerait la liste sans prévenir.
  const data = await fetchAll((a, b) => supabase
    .from("orders")
    .select("*, profiles(full_name, email)")
    .eq("hidden", false)
    .order("created_at", { ascending: false })
    .order("id")
    .range(a, b)).catch(() => null);

  if (!data) return [];
  const known = peekMembers();
  const members = known.length ? known : await loadMembers().catch(() => []);
  const team = new Map(members.map((m) => [m.userId, firstName(m.name)]));
  const rows = (data as RowWithProfile[]).map((r) => toAdminOrder(r, uid, team));
  // Commandes que le système est en train d'envoyer tout seul (envoi USDT non échoué).
  const live = rows.filter((o) => o.status === "recu" || o.status === "cours").map((o) => o.id);
  if (live.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pays } = await (supabase as any).from("usdt_payouts").select("order_id").in("order_id", live).neq("status", "failed");
    const auto = new Set(((pays ?? []) as { order_id: string }[]).map((p) => p.order_id));
    rows.forEach((o) => { if (auto.has(o.id)) o.autoSending = true; });
  }
  return rows;
}

/**
 * Répercute un changement d'état en base : statut et/ou prise en charge.
 * Best-effort — journalise aussi l'événement (ignoré si la policy manque).
 */
export async function persistOrderPatch(
  id: string,
  changes: Partial<Pick<AdminOrder, "status" | "assignedTo">>,
): Promise<{ error?: string }> {
  const { data: auth } = await supabase.auth.getSession();
  const uid = auth.session?.user?.id ?? null;

  // Snapshot avant modification pour l'audit.
  const { data: before } = await supabase
    .from("orders")
    .select("id, status, assigned_to, assigned_at")
    .eq("id", id)
    .maybeSingle();

  const update: Partial<OrderRow> = {};
  if (changes.status) update.status = DEMO_TO_DB[changes.status];
  if ("assignedTo" in changes) {
    if (changes.assignedTo === CURRENT_OPERATOR) {
      update.assigned_to = uid;
      update.assigned_at = new Date().toISOString();
    } else if (changes.assignedTo === null) {
      update.assigned_to = null;
      update.assigned_at = null;
    }
  }
  if (Object.keys(update).length === 0) return {};

  // Prendre une commande : seulement si personne ne l'a déjà prise (deux membres ne la prennent jamais en même temps).
  if (changes.assignedTo === CURRENT_OPERATOR && uid) {
    const { data: took, error: e1 } = await supabase.from("orders").update(update).eq("id", id)
      .or(`assigned_to.is.null,assigned_to.eq.${uid}`).select("id");
    if (e1) return { error: e1.message };
    if (!took?.length) return { error: "Cette commande vient d'être prise par quelqu'un d'autre." };
  } else {
    const { error } = await supabase.from("orders").update(update).eq("id", id);
    if (error) return { error: error.message };
  }

  // Journal d'audit (best-effort).
  if (changes.status) {
    await supabase.from("order_events").insert({
      order_id: id,
      new_status: DEMO_TO_DB[changes.status],
      actor: uid ?? "staff",
    });
  }

  // Audit immuable — une ligne par nature d'action pour faciliter la lecture.
  const after = { ...(before ?? { id }), ...update };
  if (changes.status) {
    const action =
      changes.status === "annule" ? "order.cancel" : "order.status_change";
    void logAdminAction({
      action,
      entityKind: "order",
      entityId: id,
      before,
      after,
      metadata: { new_status: DEMO_TO_DB[changes.status], previous_status: before?.status ?? null },
    });
  }
  if ("assignedTo" in changes) {
    void logAdminAction({
      action: changes.assignedTo === null ? "order.release" : "order.assign",
      entityKind: "order",
      entityId: id,
      before,
      after,
    });
  }

  // E-mails transactionnels (best-effort, fire-and-forget).
  if (changes.status === "recu" || changes.status === "termine") {
    void notifyClient(id, changes.status);
  }

  return {};
}

async function notifyClient(orderId: string, newStatus: "recu" | "termine") {
  const { data } = await supabase
    .from("orders")
    .select("*, profiles(full_name, email)")
    .eq("id", orderId)
    .single();
  if (!data) return;
  const row = data as RowWithProfile;
  const to = row.profiles?.email ?? row.interac_email;
  if (!to) return;

  const ref = orderRef(row.id);
  const net = NETWORKS.find((n) => n.id === DB_TO_NET[row.network]);
  const networkLabel = net ? `${net.name} · ${net.tag}` : "N/D";
  const orderUrl = `${window.location.origin}/app`;
  const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  /** Lien vers la transaction sur l'explorateur, ou le texte de repli. */
  const txLink = (hash: string | null | undefined, fallback: string) => {
    const url = hash ? txUrl(row.network, hash) : "";
    if (url) return `<a href="${url}" style="color:#111;text-decoration:underline;">Voir sur ${EXPLORER_NAME[row.network] ?? "l'explorateur"}</a>`;
    return esc(hash || fallback);
  };
  /** Hash des USDT reçus d'une vente : le dépôt rattaché, sinon celui déclaré par le client. */
  const sellHash = async () => {
    const { data: d } = await supabase.from("chain_deposits").select("tx_hash").eq("order_id", row.id).limit(1);
    return d?.[0]?.tx_hash ?? row.client_tx_hash ?? null;
  };

  if (newStatus === "recu" && row.side === "sell") {
    // Vente : USDT reçus (marqués à la main, ex. Solana), virement en préparation.
    void sendEmail({
      to,
      template: "usdt-received",
      vars: {
        ref,
        usdtAmount: nfUsdt.format(Number(row.usdt_amount)),
        cadAmount: nfCad.format(Number(row.cad_amount)),
        network: networkLabel,
        interacEmail: row.interac_email ?? to,
        txLinkHtml: txLink(await sellHash(), "Reçus"),
        orderUrl,
      },
    });
  } else if (newStatus === "recu") {
    const amount = row.side === "buy"
      ? `${nfCad.format(Number(row.cad_amount))} CAD`
      : `${nfUsdt.format(Number(row.usdt_amount))} USDT`;
    void sendEmail({
      to,
      template: "payment-received",
      vars: {
        ref,
        amount,
        usdtAmount: nfUsdt.format(Number(row.usdt_amount)),
        orderUrl,
      },
    });
  } else {
    // Achat : lien vers l'envoi des USDT. Vente : le virement Interac est parti, c'est terminé.
    const isBuy = row.side === "buy";
    const outHash = isBuy ? (await fetchOutboundTx(row.id))?.tx_hash ?? null : null;
    void sendEmail({
      to,
      template: "order-completed",
      vars: {
        ref,
        summaryLabel: "Vous avez reçu",
        summaryValue: isBuy
          ? `${nfUsdt.format(Number(row.usdt_amount))} USDT`
          : `${nfCad.format(Number(row.cad_amount))} CAD`,
        network: networkLabel,
        txLabel: isBuy ? "Transaction" : "Virement Interac",
        txHash: outHash ?? "",
        txLinkHtml: isBuy ? txLink(outHash, "Envoyée") : esc(`Envoyé à ${row.interac_email ?? to}`),
        orderUrl,
      },
    });
  }
}
