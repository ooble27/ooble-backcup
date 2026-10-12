/**
 * Couche données pour les conversations e-mail (mail_threads + mail_messages).
 *
 * Toutes les requêtes passent par le client Supabase authentifié.
 * Les tables ont des politiques RLS staff-only — un client ne voit rien.
 */
import { supabase } from "@/integrations/supabase/client";

export interface MailThread {
  id: string;
  clientId: string | null;
  clientEmail: string;
  clientName: string | null;
  subject: string;
  lastMessageAt: string;
  messageCount: number;
  hasUnread: boolean;
  status: "open" | "archived";
  /** Boîte d'arrivée : support@ooble.ca ou otc@ooble.ca (desk gros volumes). */
  mailbox: MailboxId;
  createdAt: string;
  lastSnippet?: string;
}

export type MailboxId = "support" | "otc";

export interface MailMessage {
  id: string;
  threadId: string;
  direction: "inbound" | "outbound";
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  staffId: string | null;
  createdAt: string;
}

/** Réception : uniquement les messages laissés sur le site (formulaires Contact et OTC). */
export async function fetchThreads(limit = 50): Promise<MailThread[]> {
  const { data, error } = await supabase
    .from("mail_threads")
    .select("*")
    .eq("origin", "form")
    .order("last_message_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map(mapThread);
}

export async function fetchThread(id: string): Promise<MailThread | null> {
  const { data, error } = await supabase
    .from("mail_threads")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return mapThread(data);
}

export async function fetchMessages(threadId: string): Promise<MailMessage[]> {
  const { data, error } = await supabase
    .from("mail_messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map(mapMessage);
}

export async function markThreadRead(threadId: string): Promise<void> {
  await supabase
    .from("mail_threads")
    .update({ has_unread: false })
    .eq("id", threadId);
}

export async function archiveThread(threadId: string): Promise<void> {
  await supabase
    .from("mail_threads")
    .update({ status: "archived" })
    .eq("id", threadId);
}

export async function createThread(params: {
  clientId?: string | null;
  clientEmail: string;
  clientName?: string | null;
  subject: string;
}): Promise<string | null> {
  const { data, error } = await supabase
    .from("mail_threads")
    .insert({
      client_id: params.clientId ?? null,
      client_email: params.clientEmail,
      client_name: params.clientName ?? null,
      subject: params.subject,
      last_message_at: new Date().toISOString(),
      // Envoi de l'équipe : gardé pour l'historique (Envoyés), jamais en Réception.
      origin: "staff",
      has_unread: false,
    })
    .select("id")
    .single();
  if (error || !data) return null;
  return data.id;
}

export async function insertOutboundMessage(params: {
  threadId: string;
  fromEmail: string;
  fromName?: string;
  toEmail: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  staffId?: string;
  resendId?: string;
}): Promise<void> {
  await supabase.from("mail_messages").insert({
    thread_id: params.threadId,
    direction: "outbound",
    from_email: params.fromEmail,
    from_name: params.fromName ?? null,
    to_email: params.toEmail,
    subject: params.subject,
    body_text: params.bodyText,
    body_html: params.bodyHtml,
    staff_id: params.staffId ?? null,
    resend_id: params.resendId ?? null,
  });
}

export async function countUnread(): Promise<number> {
  const { count, error } = await supabase
    .from("mail_threads")
    .select("*", { count: "exact", head: true })
    .eq("has_unread", true)
    .eq("status", "open")
    .eq("origin", "form");
  if (error) return 0;
  return count ?? 0;
}

/** Reply-To : la réponse du client arrive dans la boîte courriel habituelle de l'équipe. */
export function threadReplyTo(mailbox: MailboxId = "support"): string {
  return `${mailbox}@ooble.ca`;
}

export interface SentRow { id: string; to: string; subject: string; sentAt: string; sentBy: string }

/** Envoyés : tous les courriels partis du back-office, quel que soit l'appareil. */
export async function fetchSentMessages(limit = 200): Promise<SentRow[]> {
  const { data, error } = await supabase
    .from("mail_messages")
    .select("id, to_email, subject, created_at, from_email")
    .eq("direction", "outbound")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as unknown as Record<string, string>[]).map((r) => ({ id: r.id, to: r.to_email, subject: r.subject ?? "(sans objet)", sentAt: r.created_at, sentBy: r.from_email }));
}

function mapThread(r: Record<string, unknown>): MailThread {
  return {
    id: r.id as string,
    clientId: (r.client_id as string) ?? null,
    clientEmail: r.client_email as string,
    clientName: (r.client_name as string) ?? null,
    subject: r.subject as string,
    lastMessageAt: r.last_message_at as string,
    messageCount: (r.message_count as number) ?? 0,
    hasUnread: (r.has_unread as boolean) ?? false,
    status: (r.status as "open" | "archived") ?? "open",
    mailbox: r.mailbox === "otc" ? "otc" : "support",
    createdAt: r.created_at as string,
  };
}

function mapMessage(r: Record<string, unknown>): MailMessage {
  return {
    id: r.id as string,
    threadId: r.thread_id as string,
    direction: r.direction as "inbound" | "outbound",
    fromEmail: r.from_email as string,
    fromName: (r.from_name as string) ?? null,
    toEmail: r.to_email as string,
    subject: (r.subject as string) ?? null,
    bodyText: (r.body_text as string) ?? null,
    bodyHtml: (r.body_html as string) ?? null,
    staffId: (r.staff_id as string) ?? null,
    createdAt: r.created_at as string,
  };
}
