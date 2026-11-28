import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Support dans l'app : tout passe par la fonction serveur « support-chat » (le client ne voit que ses discussions).
 * Règles : une seule discussion ouverte à la fois ; close par l'équipe, ou après 7 jours sans réponse du client ; une discussion fermée reste lisible mais on en ouvre une nouvelle pour réécrire.
 */

export type SupportTopic = "order" | "identity" | "interac" | "account" | "other";

export interface SupportThread {
  id: string; topic: string; open: boolean;
  lastFrom: "team" | "me" | null; lastWho: string | null; preview: string; lastAt: string; createdAt: string;
}
export interface SupportMsg { id: string; mine: boolean; who: string | null; text: string; at: string }
export interface SupportConversation { id: string; topic: string; open: boolean; createdAt: string; messages: SupportMsg[] }

type Res<T> = { data?: T; error?: string; code?: string; status?: number };

async function call<T>(body: Record<string, unknown>): Promise<Res<T>> {
  const { data, error } = await supabase.functions.invoke("support-chat", { body });
  if (error) {
    // Les erreurs prévues (discussion fermée, trop de messages…) arrivent avec leur texte.
    const ctx = (error as { context?: Response }).context;
    let parsed: { error?: string; code?: string } | null = null;
    try { parsed = ctx ? await ctx.clone().json() : null; } catch { /* réponse sans corps lisible */ }
    return { error: parsed?.error ?? "network", code: parsed?.code, status: ctx?.status };
  }
  const d = data as T & { error?: string; code?: string };
  if (d && typeof d === "object" && "error" in d && d.error) return { error: d.error, code: d.code };
  return { data: d };
}

export const fetchSupportThreads = () => call<{ threads: SupportThread[] }>({ action: "threads" });
export const fetchSupportConversation = (threadId: string) => call<SupportConversation>({ action: "list", threadId });
export const sendSupportMessage = (p: { threadId?: string; text: string; topic?: SupportTopic; orderRef?: string }) =>
  call<{ ok: true; threadId: string }>({ action: "send", ...p });

/* Ce que le client a déjà lu : la date du dernier message vu, par discussion (sur cet appareil). */
const SEEN_KEY = "ooble.support.seen";
function readSeen(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}") ?? {}; } catch { return {}; }
}
export function markSupportSeen(threadId: string, lastAt: string) {
  try {
    const s = readSeen();
    if (!s[threadId] || s[threadId] < lastAt) { s[threadId] = lastAt; localStorage.setItem(SEEN_KEY, JSON.stringify(s)); }
  } catch { /* stockage indisponible : le point reste affiché */ }
}
/** Nouvelle réponse de l'équipe pas encore lue. */
export const isSupportUnread = (t: SupportThread) => t.lastFrom === "team" && (readSeen()[t.id] ?? "") < t.lastAt;

/** Pour la tuile Support de Mon compte : y a-t-il une réponse non lue ? */
export function useSupportUnread(): boolean {
  const [unread, setUnread] = useState(false);
  useEffect(() => {
    let on = true;
    fetchSupportThreads().then((r) => { if (on) setUnread(!!r.data?.threads.some((t) => t.open && isSupportUnread(t))); });
    return () => { on = false; };
  }, []);
  return unread;
}
