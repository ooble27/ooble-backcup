import { fetchCached, peek, prefetch } from "@/lib/adminCache";
import { fetchClientOrders, fetchClientProfile, type ClientOrder, type ClientProfile } from "@/lib/adminClient";
import { fetchOrigin, type SignupOrigin } from "@/lib/origin";
import { prefetchNotes } from "@/lib/clientNotes";

/**
 * Fiche client instantanée : la fiche est chargée dès qu'on vise un client (survol, toucher, ouverture
 * d'une commande), puis gardée en mémoire pour la session. À l'ouverture, elle s'affiche tout de suite
 * et se met à jour en arrière-plan. Mémoire seulement : rien de personnel dans le stockage du navigateur.
 */
export interface ClientBundle { profile: ClientProfile | null; orders: ClientOrder[]; origin: SignupOrigin | null }

const key = (userId: string) => `client.${userId}`;
const load = (userId: string) => Promise.all([fetchClientProfile(userId), fetchClientOrders(userId), fetchOrigin(userId)])
  .then(([profile, orders, origin]) => ({ profile, orders, origin }) as ClientBundle);

export const peekClient = (userId: string) => peek<ClientBundle>(key(userId))?.value;
export const loadClient = (userId: string) => fetchCached(key(userId), () => load(userId), { keep: (v) => !!v.profile });
export const prefetchClient = (userId: string | null | undefined) => {
  if (!userId) return;
  prefetch(key(userId), () => load(userId), { keep: (v) => !!v.profile, maxAgeMs: 30_000 });
  prefetchNotes(userId);
};
