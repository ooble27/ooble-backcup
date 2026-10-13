import { supabase } from "@/integrations/supabase/client";
import { fetchCached, peek, prefetch, put } from "@/lib/adminCache";

/**
 * Notes internes sur un client, partagées par toute l'équipe (table client_notes).
 * Comme un registre : on ajoute, on ne modifie ni n'efface. Mémoire de session seulement.
 */
export interface ClientNote { id: string; body: string; author: string; createdAt: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (t: string) => any };
const key = (clientId: string) => `client.${clientId}.notes`;
const LOCAL = (clientId: string) => `ooble.admin.notes.${clientId}`;

async function fetchNotes(clientId: string): Promise<ClientNote[]> {
  await importLocalNotes(clientId);
  const { data, error } = await db.from("client_notes").select("id, body, author_name, created_at").eq("client_id", clientId).order("created_at", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; body: string; author_name: string | null; created_at: string }[])
    .map((n) => ({ id: n.id, body: n.body, author: n.author_name ?? "Équipe", createdAt: n.created_at }));
}

/** Notes écrites avant le partage (gardées sur cet appareil) : versées une fois dans la base, puis retirées de l'appareil. */
async function importLocalNotes(clientId: string) {
  let local: { body: string; author?: string; createdAt?: string }[] = [];
  try { local = JSON.parse(localStorage.getItem(LOCAL(clientId)) ?? "[]"); } catch { return; }
  if (!Array.isArray(local) || local.length === 0) return;
  const rows = local.filter((n) => n?.body?.trim()).map((n) => ({ client_id: clientId, body: n.body.trim().slice(0, 4000), author_name: n.author ?? null, created_at: n.createdAt ?? new Date().toISOString() }));
  const { error } = rows.length ? await db.from("client_notes").insert(rows) : { error: null };
  if (!error) { try { localStorage.removeItem(LOCAL(clientId)); } catch { /* stockage indisponible */ } }
}

export const peekNotes = (clientId: string) => peek<ClientNote[]>(key(clientId))?.value ?? null;
export const loadNotes = (clientId: string) => fetchCached(key(clientId), () => fetchNotes(clientId));
export const prefetchNotes = (clientId: string) => prefetch(key(clientId), () => fetchNotes(clientId), { maxAgeMs: 30_000 });

export async function addNote(clientId: string, body: string, authorName: string): Promise<{ error?: string; note?: ClientNote }> {
  const text = body.trim();
  if (!text) return { error: "La note est vide." };
  const { data, error } = await db.from("client_notes").insert({ client_id: clientId, body: text, author_name: authorName }).select("id, body, author_name, created_at").single();
  if (error) return { error: error.message };
  const note = { id: data.id, body: data.body, author: data.author_name ?? authorName, createdAt: data.created_at };
  put(key(clientId), [note, ...(peekNotes(clientId) ?? [])]);
  return { note };
}
