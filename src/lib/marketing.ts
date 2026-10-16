/**
 * Marketing : centre de contrôle, campagnes enregistrées côté serveur et leurs statistiques.
 *
 * Une campagne = une ligne `campaigns` + un courriel préparé par destinataire (`campaign_sends`).
 * Les courriels partent par la fonction campaign-dispatch (chaque minute, ou tout de suite sur
 * « Envoyer »), qui applique les interrupteurs du centre de contrôle. Les ouvertures et les clics
 * arrivent par le webhook Resend (fonction mail-events).
 */
import { supabase } from "@/integrations/supabase/client";
import { logAdminAction } from "@/lib/audit";

export interface MarketingSettings {
  /** Les clients peuvent recevoir des campagnes (sinon : équipe seulement). */
  clientSends: boolean;
  /** Les campagnes programmées et les parcours partent seuls (sinon : elles attendent). */
  automaticSends: boolean;
  dailyLimit: number;
  dailyReserve: number;
  updatedAt: string | null;
  updatedByName: string | null;
}

export async function loadMarketingSettings(): Promise<MarketingSettings> {
  const { data, error } = await supabase.from("marketing_settings").select("*").eq("id", 1).maybeSingle();
  if (error) throw new Error(error.message);
  return {
    clientSends: !!data?.client_sends, automaticSends: !!data?.automatic_sends,
    dailyLimit: data?.daily_limit ?? 100, dailyReserve: data?.daily_reserve ?? 30,
    updatedAt: data?.updated_at ?? null, updatedByName: data?.updated_by_name ?? null,
  };
}

export async function saveMarketingSettings(patch: Partial<Omit<MarketingSettings, "updatedAt" | "updatedByName">>, byName: string): Promise<string | null> {
  const { data: auth } = await supabase.auth.getSession();
  const row: { updated_at: string; updated_by: string | null; updated_by_name: string; client_sends?: boolean; automatic_sends?: boolean; daily_limit?: number; daily_reserve?: number } = { updated_at: new Date().toISOString(), updated_by: auth.session?.user?.id ?? null, updated_by_name: byName };
  if (patch.clientSends !== undefined) row.client_sends = patch.clientSends;
  if (patch.automaticSends !== undefined) row.automatic_sends = patch.automaticSends;
  if (patch.dailyLimit !== undefined) row.daily_limit = patch.dailyLimit;
  if (patch.dailyReserve !== undefined) row.daily_reserve = patch.dailyReserve;
  const { error } = await supabase.from("marketing_settings").update(row).eq("id", 1);
  if (error) return error.message.includes("check") ? "Valeur refusée : hors des limites permises." : error.message;
  void logAdminAction({ action: "marketing.settings", entityKind: "marketing_settings", metadata: patch });
  return null;
}

export interface Overview {
  campaigns: number; sent: number; delivered: number; opened: number; clicked: number;
  orders: number; volume: number; today: number; scheduled: number;
}

export async function fetchOverview(since: Date): Promise<Overview> {
  const { data, error } = await supabase.rpc("marketing_overview", { _since: since.toISOString() });
  if (error) throw new Error(error.message);
  return data as unknown as Overview;
}

export type CampaignStatus = "scheduled" | "sending" | "sent" | "cancelled" | "paused";

export interface CampaignRow {
  id: string;
  name: string;
  templateId: string | null;
  valuesByLang: Record<string, Record<string, string>> | null;
  subject: string | null;
  audience: string | null;
  status: CampaignStatus;
  scheduledAt: string;
  createdAt: string;
  finishedAt: string | null;
  isTest: boolean;
  createdByName: string | null;
}

export async function listCampaigns(): Promise<CampaignRow[]> {
  const { data, error } = await supabase.from("campaigns").select("*").order("scheduled_at", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => ({
    id: c.id, name: c.name, templateId: c.template_id, valuesByLang: c.values_by_lang as CampaignRow["valuesByLang"],
    subject: c.subject, audience: c.audience, status: c.status as CampaignStatus, scheduledAt: c.scheduled_at,
    createdAt: c.created_at, finishedAt: c.finished_at, isTest: c.is_test, createdByName: c.created_by_name,
  }));
}

export interface CampaignSummary { total: number; queued: number; sent: number; delivered: number; opened: number; clicked: number; blocked: number; skipped: number; failed: number }

/** Chiffres de toutes les campagnes, par identifiant. */
export async function fetchSummaries(): Promise<Record<string, CampaignSummary>> {
  const { data, error } = await supabase.rpc("campaign_summaries");
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map(({ campaign_id, ...rest }) => [campaign_id, rest]));
}

export interface CampaignResults {
  total: number; queued: number; sent: number; failed: number; blocked: number; skipped: number;
  delivered: number; opened: number; clicked: number; bounced: number; unsubscribed: number;
  orders: number; volume: number; links: { url: string; n: number }[];
}

export async function fetchCampaignResults(id: string): Promise<CampaignResults> {
  const { data, error } = await supabase.rpc("campaign_results", { _id: id });
  if (error) throw new Error(error.message);
  return data as unknown as CampaignResults;
}

/** Un courriel prêt à partir (rendu dans le back-office, envoyé par le serveur). */
export interface PreparedSend {
  email: string; userId?: string | null; lang: "fr" | "en";
  subject: string; html: string; text?: string; unsubscribeUrl?: string;
}

/**
 * Enregistre une campagne et ses courriels. Envoi immédiat : la fonction d'envoi est appelée tout
 * de suite. Programmée : elle partira à l'heure dite, si les envois automatiques sont allumés.
 */
export async function queueCampaign(input: {
  name: string; templateId: string; valuesByLang: Record<string, Record<string, string>>; subject: string; audience: string;
  scheduledAt: Date | null; isTest?: boolean; byName: string; sends: PreparedSend[];
}): Promise<{ id?: string; error?: string }> {
  const { data: auth } = await supabase.auth.getSession();
  const { data: c, error } = await supabase.from("campaigns").insert({
    name: input.name.slice(0, 160), template_id: input.templateId, values_by_lang: input.valuesByLang,
    subject: input.subject, audience: input.audience, status: "scheduled",
    scheduled_at: (input.scheduledAt ?? new Date()).toISOString(), is_test: !!input.isTest,
    created_by: auth.session?.user?.id ?? null, created_by_name: input.byName,
  }).select("id").single();
  if (error || !c) return { error: error?.message ?? "Campagne non enregistrée." };

  for (let i = 0; i < input.sends.length; i += 100) {
    const chunk = input.sends.slice(i, i + 100).map((s) => ({
      campaign_id: c.id, email: s.email, user_id: s.userId ?? null, lang: s.lang, subject: s.subject,
      html: s.html, text_body: s.text ?? null, unsubscribe_url: s.unsubscribeUrl ?? null, status: "queued",
    }));
    const { error: e } = await supabase.from("campaign_sends").insert(chunk);
    if (e) {
      await supabase.from("campaigns").update({ status: "cancelled" }).eq("id", c.id);
      return { error: `Préparation interrompue : ${e.message}` };
    }
  }
  void logAdminAction({ action: "marketing.campaign", entityKind: "campaigns", entityId: c.id, metadata: { name: input.name, recipients: input.sends.length, scheduledAt: input.scheduledAt?.toISOString() ?? "maintenant" } });
  if (!input.scheduledAt) void dispatchNow();
  return { id: c.id };
}

/** Demande au serveur d'envoyer tout de suite ce qui est dû. */
export async function dispatchNow() {
  await supabase.functions.invoke("campaign-dispatch", { body: {} }).catch(() => { /* le passage de la minute prendra le relais */ });
}

export async function setCampaignStatus(id: string, status: "cancelled" | "scheduled"): Promise<string | null> {
  const { error } = await supabase.from("campaigns").update({ status }).eq("id", id);
  if (error) return error.message;
  void logAdminAction({ action: status === "cancelled" ? "marketing.campaign_cancel" : "marketing.campaign_resume", entityKind: "campaigns", entityId: id });
  return null;
}
