import { supabase } from "@/integrations/supabase/client";
import { fetchCached, peek, prefetch } from "@/lib/adminCache";
import { fetchOrderEvents } from "@/lib/adminOrderEvents";
import { fetchDeposits, fetchPayouts, fetchSellProof } from "@/lib/settlement";

/**
 * Fiche commande instantanée : envois USDT, historique, USDT reçus, preuve d'envoi du client et
 * question Interac sont chargés dès qu'on vise une commande (survol, toucher), gardés en mémoire pour
 * la session, affichés tout de suite à l'ouverture puis mis à jour en arrière-plan. Mémoire
 * seulement, rien dans le navigateur.
 */
const K = {
  payouts: (id: string) => `order.${id}.payouts`,
  events: (id: string) => `order.${id}.events`,
  deposits: (id: string) => `order.${id}.deposits`,
  proof: (id: string) => `order.${id}.proof`,
  qa: (userId: string) => `client.${userId}.interac`,
};
const fn = {
  payouts: (id: string) => () => fetchPayouts(id, 5),
  events: (id: string) => () => fetchOrderEvents(id),
  deposits: (id: string) => () => fetchDeposits({ orderId: id, limit: 5 }),
  proof: (id: string) => () => fetchSellProof(id),
  qa: (userId: string) => async () => {
    const { data } = await supabase.from("profiles").select("interac_question, interac_answer").eq("id", userId).maybeSingle();
    return { q: data?.interac_question ?? null, a: data?.interac_answer ?? null };
  },
};
type Part = keyof typeof K;
type Val<P extends Part> = Awaited<ReturnType<ReturnType<(typeof fn)[P]>>>;

export const peekOrderPart = <P extends Part>(part: P, id: string) => peek<Val<P>>(K[part](id))?.value ?? null;
export const loadOrderPart = <P extends Part>(part: P, id: string) => fetchCached(K[part](id), fn[part](id) as () => Promise<Val<P>>);

export function prefetchOrder(id: string | null | undefined, userId?: string | null) {
  if (!id) return;
  for (const part of ["payouts", "events", "deposits", "proof"] as const) prefetch(K[part](id), fn[part](id) as () => Promise<unknown>, { maxAgeMs: 15_000 });
  if (userId) prefetch(K.qa(userId), fn.qa(userId), { maxAgeMs: 60_000 });
}
