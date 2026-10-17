/**
 * Marketing › Audiences : des groupes de clients enregistrés, décrits par quelques règles. La base
 * calcule qui en fait partie au moment de l'envoi (audience_match), donc une audience reste à jour.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { PROVINCES } from "@/lib/compliance";

export interface AudienceRules {
  verified?: "yes" | "no";
  account?: "individual" | "business";
  orders?: "none" | "some";
  inactive_days?: number;
  joined_days?: number;
  lang?: "fr" | "en";
  region?: string;
  source?: string;
  min_volume?: number;
}

export interface SavedAudience { id: string; name: string; rules: AudienceRules; createdAt: string; createdByName: string | null }

/** Les règles sans les clés vides (une clé absente = pas de filtre). */
export const cleanRules = (r: AudienceRules): AudienceRules =>
  Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined && v !== null && v !== "")) as AudienceRules;

const nf = new Intl.NumberFormat("fr-CA");

/** Une audience en une phrase : « Clients vérifiés, sans commande, inscrits depuis moins de 30 jours ». */
export function describeRules(r: AudienceRules): string {
  const parts: string[] = [];
  parts.push(r.account === "business" ? "Entreprises" : r.account === "individual" ? "Particuliers" : "Clients");
  if (r.verified === "yes") parts[0] += " vérifiés";
  if (r.verified === "no") parts[0] += " pas encore vérifiés";
  if (r.orders === "none") parts.push("sans commande");
  if (r.orders === "some") parts.push("qui ont déjà commandé");
  if (r.inactive_days) parts.push(`sans commande depuis ${r.inactive_days} jours`);
  if (r.min_volume) parts.push(`plus de ${nf.format(r.min_volume)} $ échangés`);
  if (r.joined_days) parts.push(`inscrits depuis moins de ${r.joined_days} jours`);
  if (r.region) parts.push(`province : ${PROVINCES.find((p) => p.code === r.region)?.name ?? r.region}`);
  if (r.lang) parts.push(r.lang === "fr" ? "en français" : "en anglais");
  if (r.source) parts.push(`venus de ${r.source}`);
  return parts.join(", ");
}

export async function listAudiences(): Promise<SavedAudience[]> {
  const { data, error } = await supabase.from("audiences").select("*").eq("archived", false).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((a) => ({ id: a.id, name: a.name, rules: (a.rules ?? {}) as AudienceRules, createdAt: a.created_at, createdByName: a.created_by_name }));
}

export async function saveAudience(a: { id?: string; name: string; rules: AudienceRules }, byName: string): Promise<string> {
  const rules = cleanRules(a.rules) as unknown as Json;
  if (a.id) {
    const { error } = await supabase.from("audiences").update({ name: a.name.trim(), rules, updated_at: new Date().toISOString() }).eq("id", a.id);
    if (error) throw new Error(error.message);
    return a.id;
  }
  const { data: auth } = await supabase.auth.getSession();
  const { data, error } = await supabase.from("audiences")
    .insert({ name: a.name.trim(), rules, created_by: auth.session?.user?.id ?? null, created_by_name: byName }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Non enregistrée.");
  return data.id;
}

/** Retirer une audience de la liste (elle reste en base pour l'historique des envois). */
export async function archiveAudience(id: string): Promise<void> {
  const { error } = await supabase.from("audiences").update({ archived: true }).eq("id", id);
  if (error) throw new Error(error.message);
}

export interface AudiencePreview { people: number; verified: number; push: number; sample: string[] }
export async function previewAudience(rules: AudienceRules): Promise<AudiencePreview> {
  const { data, error } = await supabase.rpc("audience_preview", { _rules: cleanRules(rules) as unknown as Json });
  if (error) throw new Error(error.message);
  const d = (data ?? {}) as Record<string, unknown>;
  return { people: Number(d.people ?? 0), verified: Number(d.verified ?? 0), push: Number(d.push ?? 0), sample: (d.sample as string[]) ?? [] };
}

/** Les membres (identifiants) d'une audience enregistrée, calculés maintenant. */
export async function audienceMembers(id: string): Promise<Set<string>> {
  const { data, error } = await supabase.rpc("audience_members", { _id: id });
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => r.user_id));
}
