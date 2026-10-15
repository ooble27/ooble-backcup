/**
 * Vente : prouver que les USDT reçus viennent bien du client.
 *  - l'adresse d'où il envoie (ou la plateforme utilisée), donnée avant de voir l'adresse de dépôt ;
 *  - l'identifiant de la transaction (TxID), collé après l'envoi : Ooble le retrouve sur la blockchain
 *    et rattache le dépôt sans doute possible.
 * La base vérifie tout de nouveau (format, transaction déjà utilisée, vente au client).
 */
import { supabase } from "@/integrations/supabase/client";
import { ADDRESS_FORMAT, type AddressFamily } from "@/lib/depositAddresses";

export const isSenderAddress = (family: AddressFamily, a: string) => ADDRESS_FORMAT[family].test(a.trim());

/**
 * Trouve l'identifiant de transaction dans ce que le client colle : l'identifiant seul,
 * ou un lien d'explorateur (BscScan, Tronscan, Etherscan, Solscan…) qui le contient.
 */
export function extractTxHash(family: AddressFamily, text: string): string | null {
  const s = text.trim();
  if (!s) return null;
  if (family === "solana") return s.match(/[1-9A-HJ-NP-Za-km-z]{80,90}/)?.[0] ?? null;
  const hex = s.match(/(?:0x)?[0-9a-fA-F]{64}/)?.[0];
  if (!hex) return null;
  const bare = hex.replace(/^0x/i, "").toLowerCase();
  return family === "evm" ? `0x${bare}` : bare;
}

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

/** « J'ai envoyé mes USDT », avec l'identifiant de transaction si le client l'a. */
export async function declareSellSent(orderId: string, txHash: string | null): Promise<{ error?: string }> {
  const { error } = await supabase.rpc("declare_sell_sent", { _order: orderId, ...(txHash ? { _tx: txHash } : {}) });
  return error ? { error: error.message } : {};
}

/** Annule une vente pas encore envoyée (la limite du jour est libérée). */
export async function cancelUnsentSell(orderId: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc("cancel_unsent_sell", { _order: orderId });
  return error ? { error: error.message } : {};
}
