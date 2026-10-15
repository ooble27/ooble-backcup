/**
 * Vente : l'adresse du portefeuille d'où le client envoie ses USDT, demandée avant l'adresse de dépôt.
 * Un dépôt qui ne vient pas de cette adresse part « à vérifier » au lieu d'être rattaché tout seul.
 * La base vérifie de nouveau le format.
 */
import { supabase } from "@/integrations/supabase/client";
import { ADDRESS_FORMAT, type AddressFamily } from "@/lib/depositAddresses";

export const isSenderAddress = (family: AddressFamily, a: string) => ADDRESS_FORMAT[family].test(a.trim());

export interface KnownWallet { address: string; uses: number; lastSeen: string }

/** Les adresses déjà utilisées par le client sur cette famille de réseaux, la plus récente d'abord. */
export async function fetchMyWallets(family: AddressFamily): Promise<KnownWallet[]> {
  const { data: auth } = await supabase.auth.getSession();
  const uid = auth.session?.user?.id;
  if (!uid) return [];
  const { data } = await supabase.from("client_wallets")
    .select("address, declared_count, deposit_count, last_seen")
    .eq("user_id", uid).eq("family", family)
    .gt("declared_count", 0)
    .order("last_seen", { ascending: false }).limit(3);
  return (data ?? []).map((r) => ({ address: r.address, uses: r.declared_count + r.deposit_count, lastSeen: r.last_seen }));
}

/** « J'ai envoyé mes USDT ». */
export async function declareSellSent(orderId: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc("declare_sell_sent", { _order: orderId });
  return error ? { error: error.message } : {};
}

/** Annule une vente pas encore envoyée (la limite du jour est libérée). */
export async function cancelUnsentSell(orderId: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc("cancel_unsent_sell", { _order: orderId });
  return error ? { error: error.message } : {};
}
