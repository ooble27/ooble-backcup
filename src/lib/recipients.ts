import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { NetId } from "@/components/app/networks";
import { DB_TO_NET, NET_TO_DB } from "@/lib/orders";
import { getLang } from "@/lib/i18n";
import { peekCache, putCache } from "@/lib/cache";

/** Carnet : adresses de réception (achat, `wallet`), adresses d'envoi (vente, `sender`) et courriels Interac. */
export type RecipientKind = Database["public"]["Enums"]["recipient_kind"];
const hasNetwork = (kind: RecipientKind) => kind === "wallet" || kind === "sender";

type Row = Database["public"]["Tables"]["saved_recipients"]["Row"];

export interface SavedRecipient {
  id: string;
  kind: RecipientKind;
  label: string;
  /** Adresse wallet, ou courriel Interac. */
  value: string;
  /** Renseigné uniquement pour les adresses wallet. */
  network: NetId | null;
  lastUsedAt: string | null;
}

const toRecipient = (r: Row): SavedRecipient => ({
  id: r.id,
  kind: r.kind,
  label: r.label,
  value: r.value,
  network: r.network ? DB_TO_NET[r.network] : null,
  lastUsedAt: r.last_used_at,
});

const SELECT = "id, kind, label, value, network, last_used_at" as const;

const cacheKey = (uid: string) => `recipients:${uid}`;

const only = (rows: SavedRecipient[], kind: RecipientKind, network?: NetId | null) =>
  rows.filter((r) => r.kind === kind && (!hasNetwork(kind) || !network || r.network === network));

/**
 * Carnet déjà chargé (cache), filtré comme listRecipients : la page
 * s'affiche tout de suite, sans attendre le serveur. undefined si jamais chargé.
 */
export function peekRecipients(
  uid: string | null | undefined,
  kind: RecipientKind,
  network?: NetId | null,
): SavedRecipient[] | undefined {
  const all = peekCache<SavedRecipient[]>(uid ? cacheKey(uid) : null);
  return all ? only(all, kind, network) : undefined;
}

/**
 * Destinataires enregistrés, les plus récemment utilisés d'abord.
 * `network` filtre les adresses wallet : une adresse TRC20 n'a rien à faire
 * dans la liste d'un ordre BEP20. Lit tout le carnet (il est petit) et le
 * garde en cache pour les prochains affichages.
 */
export async function listRecipients(
  kind: RecipientKind,
  network?: NetId | null,
): Promise<SavedRecipient[]> {
  const { data: auth } = await supabase.auth.getSession();
  const uid = auth.session?.user?.id;
  if (!uid) return [];

  const { data, error } = await supabase
    .from("saved_recipients")
    .select(SELECT)
    .eq("user_id", uid)
    .order("last_used_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error || !data) return peekRecipients(uid, kind, network) ?? [];
  const all = putCache(cacheKey(uid), (data as Row[]).map(toRecipient));
  return only(all, kind, network);
}

/** Cherche une entrée exacte du carnet, sans la créer. */
export async function findRecipient(
  kind: RecipientKind,
  value: string,
  network?: NetId | null,
): Promise<SavedRecipient | null> {
  const { data: auth } = await supabase.auth.getSession();
  const uid = auth.session?.user?.id;
  if (!uid) return null;

  let query = supabase
    .from("saved_recipients")
    .select(SELECT)
    .eq("user_id", uid)
    .eq("kind", kind)
    .eq("value", value.trim());

  if (hasNetwork(kind)) {
    if (!network) return null;
    query = query.eq("network", NET_TO_DB[network]);
  }

  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  return toRecipient(data as Row);
}

/**
 * Enregistre un destinataire. Si le client l'a déjà en carnet, on ne crée pas
 * de doublon : on remonte simplement l'entrée existante.
 */
export async function saveRecipient(input: {
  kind: RecipientKind;
  label: string;
  value: string;
  network?: NetId | null;
}): Promise<{ id: string } | { error: string }> {
  const { data: auth } = await supabase.auth.getSession();
  const uid = auth.session?.user?.id;
  if (!uid) return { error: getLang() === "en" ? "Session expired. Please log in again." : "Session expirée. Reconnectez-vous." };

  const value = input.value.trim();
  const label = input.label.trim();
  if (!value) return { error: getLang() === "en" ? "Missing value." : "Valeur manquante." };
  if (!label) return { error: getLang() === "en" ? "Give this recipient a name." : "Donnez un nom à ce destinataire." };

  const netId = hasNetwork(input.kind) ? (input.network ?? null) : null;
  if (hasNetwork(input.kind) && !netId) return { error: getLang() === "en" ? "Network missing." : "Réseau manquant." };

  const existing = await findRecipient(input.kind, value, netId);
  if (existing) {
    await touchRecipient(existing.id);
    return { id: existing.id };
  }

  const { data, error } = await supabase
    .from("saved_recipients")
    .insert({
      user_id: uid,
      kind: input.kind,
      label,
      value,
      network: netId ? NET_TO_DB[netId] : null,
      last_used_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) return { error: getLang() === "en" ? "Unable to save." : "Enregistrement impossible." };
  return { id: data.id };
}

/** Marque le destinataire comme utilisé, pour le remonter dans la liste. */
export async function touchRecipient(id: string): Promise<void> {
  await supabase
    .from("saved_recipients")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", id);
}

export async function renameRecipient(id: string, label: string): Promise<boolean> {
  const trimmed = label.trim();
  if (!trimmed) return false;
  const { error } = await supabase.from("saved_recipients").update({ label: trimmed }).eq("id", id);
  return !error;
}

export async function removeRecipient(id: string): Promise<boolean> {
  const { error } = await supabase.from("saved_recipients").delete().eq("id", id);
  return !error;
}
