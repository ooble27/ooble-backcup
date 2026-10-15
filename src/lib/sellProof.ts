/**
 * Vente : l'adresse du portefeuille d'où le client envoie ses USDT, demandée avant l'adresse de dépôt.
 * Un dépôt qui ne vient pas de cette adresse part « à vérifier » au lieu d'être rattaché tout seul.
 * La base vérifie de nouveau le format.
 */
import { supabase } from "@/integrations/supabase/client";
import { ADDRESS_FORMAT, type AddressFamily } from "@/lib/depositAddresses";

export const isSenderAddress = (family: AddressFamily, a: string) => ADDRESS_FORMAT[family].test(a.trim());

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
