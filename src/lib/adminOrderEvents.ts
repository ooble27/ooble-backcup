/**
 * Back-office — journal d'audit réel d'une commande (order_events).
 * Résout l'auteur (UID) vers un nom lisible via la table profiles.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { oliName, isAutoActor } from "@/lib/oli";

type DbStatus = Database["public"]["Enums"]["order_status"];

export interface OrderEvent {
  id: number;
  status: DbStatus;
  actor: string;        // nom lisible (Oli quand la plateforme agit seule)
  note: string | null;
  createdAt: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Événements d'une commande, du plus ancien au plus récent, auteurs résolus. */
export async function fetchOrderEvents(orderId: string): Promise<OrderEvent[]> {
  const { data, error } = await supabase
    .from("order_events")
    .select("id, new_status, actor, note, created_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];

  // Résout les auteurs UUID → nom via profiles.
  const uids = [...new Set(data.map((e) => e.actor).filter((a) => UUID_RE.test(a)))];
  const names = new Map<string, string>();
  if (uids.length) {
    const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", uids);
    for (const p of profs ?? []) names.set(p.id, p.full_name?.trim() || "Membre");
  }

  return data.map((e) => ({
    id: e.id,
    status: e.new_status,
    actor: UUID_RE.test(e.actor) ? (names.get(e.actor) ?? "Membre") : e.actor === "staff" ? "Équipe" : e.actor === "client" ? "Client" : isAutoActor(e.actor) ? oliName() : e.actor,
    note: e.note,
    createdAt: e.created_at,
  }));
}
