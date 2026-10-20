import { supabase } from "@/integrations/supabase/client";
import { getAppSettings } from "@/lib/settings";
import type { Database } from "@/integrations/supabase/types";
import type { NetId } from "@/components/app/networks";
import { getLang } from "@/lib/i18n";
import { peekCache, putCache } from "@/lib/cache";
import type { AssetId } from "@/lib/settings";

type DbNetwork = Database["public"]["Enums"]["usdt_network"];
type DbSide = Database["public"]["Enums"]["order_side"];
type DbStatus = Database["public"]["Enums"]["order_status"];
export type OrderRow = Database["public"]["Tables"]["orders"]["Row"];

/** Correspondance réseau : identifiants front ↔ enum base. */
export const NET_TO_DB: Record<NetId, DbNetwork> = {
  trx: "trc20", bnb: "bep20", eth: "erc20", matic: "polygon", sol: "spl", avax: "avalanche",
};
export const DB_TO_NET: Record<DbNetwork, NetId> = {
  trc20: "trx", bep20: "bnb", erc20: "eth", polygon: "matic", spl: "sol", avalanche: "avax",
};

const ORDER_STATUS_I18N: Record<DbStatus, { fr: string; en: string }> = {
  created: { fr: "En attente de paiement", en: "Awaiting payment" },
  awaiting_payment: { fr: "En attente de paiement", en: "Awaiting payment" },
  payment_received: { fr: "Paiement reçu", en: "Payment received" },
  settling: { fr: "En traitement", en: "Processing" },
  completed: { fr: "Terminée", en: "Completed" },
  cancelled: { fr: "Annulée", en: "Cancelled" },
  expired: { fr: "Expirée", en: "Expired" },
  refunded: { fr: "Remboursée", en: "Refunded" },
};

export function orderStatusLabel(s: DbStatus): string {
  return ORDER_STATUS_I18N[s][getLang()];
}

/** Statut « en cours » (non finalisé) pour l'affichage. */
export const isOrderOpen = (s: DbStatus) => !["completed", "cancelled", "expired"].includes(s);

/** Référence courte lisible à partir de l'UUID. */
export const orderRef = (id: string) => `OOB-${id.slice(0, 8).toUpperCase()}`;

const round2 = (n: number) => Math.round(n * 100) / 100;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export interface CreateOrderInput {
  side: DbSide;
  cad: number;
  usdt: number;
  rate: number;
  network?: NetId;        // achat : réseau de réception
  address?: string;       // achat : adresse wallet du client
  interacEmail?: string;  // vente : e-mail Interac du client
  senderAddress?: string;  // vente : adresse d'où le client envoie ses USDT
  senderPlatform?: string; // vente : plateforme d'échange utilisée à la place
  promoCode?: string;      // code promo saisi (la base l'applique, ou refuse la commande)
  asset?: AssetId;         // cryptomonnaie : USDT (par défaut) ou USDC
}

export interface TradeAllowance {
  /** Limite du compte sur 24 heures (CAD). */
  limit: number;
  /** Déjà acheté (ou vendu) sur les 24 dernières heures (CAD). */
  used: number;
  /** Encore possible maintenant (CAD). */
  remaining: number;
  /** Quand un nouvel ordre redevient possible, si la limite est atteinte. */
  nextAt: Date | null;
}

/**
 * Ce que le client peut encore acheter (ou vendre) sur 24 heures glissantes
 * (ordres non annulés, expirés ni remboursés, du même sens). La base
 * applique la même règle.
 */
/** Dernière limite connue pour ce sens, sans appel réseau (undefined : pas encore lue). */
export const peekAllowance = (uid: string | null | undefined, side: "buy" | "sell") =>
  peekCache<TradeAllowance>(uid ? `allow:${side}:${uid}` : null);

export async function getAllowance(side: "buy" | "sell"): Promise<TradeAllowance> {
  const { tradeDailyMaxCad, tradeMinCad } = await getAppSettings();
  const { data: auth } = await supabase.auth.getSession();
  const uid = auth.session?.user?.id;
  const fallback = { limit: tradeDailyMaxCad, used: 0, remaining: tradeDailyMaxCad, nextAt: null };
  if (!uid) return fallback;
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [{ data: prof }, { data: rows }] = await Promise.all([
    supabase.from("profiles").select("daily_limit_cad").eq("id", uid).maybeSingle(),
    supabase
      .from("orders")
      .select("cad_amount, created_at")
      .eq("user_id", uid)
      .eq("side", side)
      .not("status", "in", "(cancelled,expired,refunded)")
      .gt("created_at", since)
      .order("created_at", { ascending: true }),
  ]);
  const limit = Math.min(Number(prof?.daily_limit_cad ?? tradeDailyMaxCad), tradeDailyMaxCad);
  const list = (rows ?? []).map((r) => ({ cad: Number(r.cad_amount), at: new Date(r.created_at) }));
  const used = list.reduce((s, r) => s + r.cad, 0);
  const remaining = Math.max(0, Math.floor((limit - used) * 100) / 100);
  // Limite atteinte : on attend que d'anciens ordres sortent de la fenêtre.
  let nextAt: Date | null = null;
  if (remaining < tradeMinCad) {
    let freed = remaining;
    for (const r of list) {
      freed += r.cad;
      if (freed >= tradeMinCad) { nextAt = new Date(r.at.getTime() + 24 * 3600 * 1000); break; }
    }
  }
  return putCache(`allow:${side}:${uid}`, { limit, used, remaining, nextAt });
}

/** Crée un ordre pour l'utilisateur connecté. Renvoie l'id ou une erreur. */
export async function createOrder(input: CreateOrderInput): Promise<{ id: string } | { error: string }> {
  const { data: auth } = await supabase.auth.getSession();
  const uid = auth.session?.user?.id;
  if (!uid) return { error: getLang() === "en" ? "You must be logged in." : "Vous devez être connecté." };

  if (!(await getAppSettings()).tradingEnabled) {
    // Équipe et comptes de test (activés par un admin) passent ; la base refait le contrôle.
    const [{ data: roleRows }, { data: prof }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.from("profiles").select("test_account").eq("id", uid).maybeSingle(),
    ]);
    const isStaff = (roleRows ?? []).length > 0;
    if (!isStaff && !prof?.test_account) {
      return {
        error: getLang() === "en"
          ? "Trading is temporarily suspended. Account creation and verification remain available."
          : "Les transactions sont temporairement suspendues. La création de compte et la vérification restent disponibles.",
      };
    }
  }

  // Indicatif : la base fixe elle-même la fin du taux garanti (Réglages › Délais).
  const rateLockedUntil = new Date(Date.now() + (await getAppSettings()).rateLockMinutes * 60 * 1000).toISOString();
  // Achat : l'adresse du client. Vente : l'adresse de dépôt d'Ooble annoncée au client (gardée avec la commande).
  const walletAddress = input.address ?? "";

  const { data, error } = await supabase
    .from("orders")
    .insert({
      user_id: uid,
      side: input.side,
      cad_amount: round2(input.cad),
      usdt_amount: round6(input.usdt),
      locked_rate: round6(input.rate),
      network: input.network ? NET_TO_DB[input.network] : "trc20",
      asset: input.asset ?? "usdt",
      wallet_address: walletAddress,
      interac_email: input.side === "sell" ? (input.interacEmail ?? null) : null,
      sender_address: input.side === "sell" ? (input.senderAddress?.trim() || null) : null,
      sender_platform: input.side === "sell" ? (input.senderPlatform?.trim() || null) : null,
      promo_code: input.promoCode?.trim() || null,
      status: "created",
      rate_locked_until: rateLockedUntil,
    })
    .select("id")
    .single();

  if (error) {
    // Réseau fermé dans Réglages : message de la base, sans son code technique.
    const m = error.message.replace(/^(NETWORK_CLOSED|ASSET_CLOSED|ASSET_NETWORK):\s*/, "");
    return { error: m.charAt(0).toUpperCase() + m.slice(1) };
  }
  return { id: data.id };
}

/**
 * Ordres de l'utilisateur connecté.
 *
 * Sécurité : on filtre EXPLICITEMENT par `user_id` en plus des politiques RLS.
 * La table `orders` porte deux politiques SELECT (utilisateur = ses ordres,
 * staff = tous les ordres) qui s'additionnent. Sans ce filtre, un compte
 * marqué staff verrait ici l'historique de tous les clients — c'est
 * exactement le bug qu'on ferme. Le filtre côté client garantit qu'aucun
 * autre chemin ne peut ramener plus que « les ordres du user connecté ».
 */
/**
 * Derniers ordres chargés, partagés par l'accueil et la page Activité : ils
 * s'affichent tout de suite à chaque navigation, puis sont relus en
 * arrière-plan.
 */
let ordersCache: { uid: string; limit: number; rows: OrderRow[] } | null = null;

/** Ordres déjà chargés (les `limit` plus récents), sans appel réseau, ou null. */
export function peekMyOrders(uid: string | null | undefined, limit: number): OrderRow[] | null {
  if (!uid || ordersCache?.uid !== uid) return null;
  const complete = ordersCache.limit >= limit || ordersCache.rows.length < ordersCache.limit;
  return complete ? ordersCache.rows.slice(0, limit) : null;
}

export async function listMyOrders(limit = 20): Promise<OrderRow[]> {
  const { data: auth } = await supabase.auth.getSession();
  const uid = auth.session?.user?.id;
  if (!uid) { ordersCache = null; return []; }

  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return peekMyOrders(uid, limit) ?? [];
  const rows = data ?? [];
  // On garde la liste la plus longue (sauf si elle est périmée).
  if (!ordersCache || ordersCache.uid !== uid || limit >= ordersCache.limit) ordersCache = { uid, limit, rows };
  else ordersCache = { uid, limit: ordersCache.limit, rows: [...rows, ...ordersCache.rows.filter((r) => !rows.some((x) => x.id === r.id))].slice(0, ordersCache.limit) };
  return rows;
}
