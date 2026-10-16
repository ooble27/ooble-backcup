/**
 * Marketing › Notifications : notifications push et messages dans l'app, côté back-office.
 * L'envoi des notifications se fait sur le serveur (push-campaign), avec les interrupteurs du
 * centre de contrôle ; un message dans l'app n'est montré qu'à l'équipe tant que les envois aux
 * clients sont coupés.
 */
import { supabase } from "@/integrations/supabase/client";
import { logAdminAction } from "@/lib/audit";

export type Audience = "all" | "verified" | "unverified" | "staff";
export const AUDIENCES: { id: Audience; label: string }[] = [
  { id: "all", label: "Tout le monde" }, { id: "verified", label: "Vérifiés" }, { id: "unverified", label: "Pas encore vérifiés" }, { id: "staff", label: "L'équipe" },
];
export const audienceLabel = (a: string) => AUDIENCES.find((x) => x.id === a)?.label ?? a;

/** Pages de l'app où une notification ou un message peut mener. */
export const APP_LINKS = [
  { id: "/app", label: "Accueil" }, { id: "/app/acheter", label: "Acheter" }, { id: "/app/vendre", label: "Vendre" },
  { id: "/app/verification", label: "Vérification" }, { id: "/app/activite", label: "Activité" },
] as const;
export const linkLabel = (u: string | null) => APP_LINKS.find((x) => x.id === u)?.label ?? u ?? "";

export interface AudienceCount { people: number; reachable: number; devices: number; staff: number }
export async function countAudience(a: Audience): Promise<AudienceCount> {
  const { data, error } = await supabase.rpc("notif_audience_count", { _aud: a });
  if (error) throw new Error(error.message);
  return data as unknown as AudienceCount;
}

export interface PushRow {
  id: string; titleFr: string; bodyFr: string; titleEn: string | null; bodyEn: string | null; url: string; audience: string;
  status: "scheduled" | "sending" | "sent" | "cancelled"; scheduledAt: string; createdAt: string; isTest: boolean;
  people: number; devices: number; sent: number; failed: number; blocked: number; createdByName: string | null;
}
export interface MessageRow {
  id: string; titleFr: string; bodyFr: string | null; ctaFr: string | null; titleEn: string | null; bodyEn: string | null; ctaEn: string | null;
  url: string | null; audience: string; active: boolean; startsAt: string; endsAt: string | null; createdByName: string | null;
}
export interface NotifStats { push: Record<string, number>; messages: Record<string, { seen: number; click: number; dismiss: number }> }

export async function loadNotifications(): Promise<{ push: PushRow[]; messages: MessageRow[]; stats: NotifStats }> {
  const [p, m, st] = await Promise.all([
    supabase.from("push_campaigns").select("*").order("scheduled_at", { ascending: false }).limit(100),
    supabase.from("app_messages").select("*").order("starts_at", { ascending: false }).limit(100),
    supabase.rpc("notif_stats"),
  ]);
  const error = p.error ?? m.error ?? st.error;
  if (error) throw new Error(error.message);
  return {
    push: (p.data ?? []).map((r) => ({
      id: r.id, titleFr: r.title_fr, bodyFr: r.body_fr, titleEn: r.title_en, bodyEn: r.body_en, url: r.url, audience: r.audience,
      status: r.status as PushRow["status"], scheduledAt: r.scheduled_at, createdAt: r.created_at, isTest: r.is_test,
      people: r.people, devices: r.devices, sent: r.sent, failed: r.failed, blocked: r.blocked, createdByName: r.created_by_name,
    })),
    messages: (m.data ?? []).map((r) => ({
      id: r.id, titleFr: r.title_fr, bodyFr: r.body_fr, ctaFr: r.cta_fr, titleEn: r.title_en, bodyEn: r.body_en, ctaEn: r.cta_en,
      url: r.url, audience: r.audience, active: r.active, startsAt: r.starts_at, endsAt: r.ends_at, createdByName: r.created_by_name,
    })),
    stats: (st.data as unknown as NotifStats) ?? { push: {}, messages: {} },
  };
}

const clean = (s: string) => s.trim() || null;

export async function createPush(input: {
  titleFr: string; bodyFr: string; titleEn: string; bodyEn: string; url: string; audience: Audience; scheduledAt: Date | null; byName: string;
}): Promise<string | null> {
  const { data: auth } = await supabase.auth.getSession();
  const { data, error } = await supabase.from("push_campaigns").insert({
    title_fr: input.titleFr.trim(), body_fr: input.bodyFr.trim(), title_en: clean(input.titleEn), body_en: clean(input.bodyEn),
    url: input.url, audience: input.audience, scheduled_at: (input.scheduledAt ?? new Date()).toISOString(),
    is_test: input.audience === "staff", created_by: auth.session?.user?.id ?? null, created_by_name: input.byName,
  }).select("id").single();
  if (error || !data) return error?.message.includes("check") ? "Un texte est trop long ou le lien n'est pas valide." : (error?.message ?? "Non enregistrée.");
  void logAdminAction({ action: "marketing.push", entityKind: "push_campaigns", entityId: data.id, metadata: { audience: input.audience, title: input.titleFr } });
  if (!input.scheduledAt) void supabase.functions.invoke("push-campaign", { body: {} }).catch(() => {});
  return null;
}

export async function cancelPush(id: string): Promise<string | null> {
  const { error } = await supabase.from("push_campaigns").update({ status: "cancelled" }).eq("id", id);
  if (error) return error.message;
  void logAdminAction({ action: "marketing.push_cancel", entityKind: "push_campaigns", entityId: id });
  return null;
}

export async function createMessage(input: {
  titleFr: string; bodyFr: string; ctaFr: string; titleEn: string; bodyEn: string; ctaEn: string; url: string | null;
  audience: Audience; endsAt: Date | null; byName: string;
}): Promise<string | null> {
  const { data: auth } = await supabase.auth.getSession();
  const { data, error } = await supabase.from("app_messages").insert({
    title_fr: input.titleFr.trim(), body_fr: clean(input.bodyFr), cta_fr: clean(input.ctaFr),
    title_en: clean(input.titleEn), body_en: clean(input.bodyEn), cta_en: clean(input.ctaEn),
    url: input.url, audience: input.audience, ends_at: input.endsAt?.toISOString() ?? null,
    created_by: auth.session?.user?.id ?? null, created_by_name: input.byName,
  }).select("id").single();
  if (error || !data) return error?.message.includes("check") ? "Un texte est trop long, ou la date de fin est passée." : (error?.message ?? "Non enregistré.");
  void logAdminAction({ action: "marketing.app_message", entityKind: "app_messages", entityId: data.id, metadata: { audience: input.audience, title: input.titleFr } });
  return null;
}

export async function setMessageActive(id: string, active: boolean): Promise<string | null> {
  const { error } = await supabase.from("app_messages").update({ active }).eq("id", id);
  if (error) return error.message;
  void logAdminAction({ action: active ? "marketing.app_message_on" : "marketing.app_message_off", entityKind: "app_messages", entityId: id });
  return null;
}
