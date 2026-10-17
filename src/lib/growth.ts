/**
 * Croissance : avantages sur le taux (code promo, parrainage) et parrainage côté client, plus les
 * lectures et réglages de l'équipe marketing. L'avantage est toujours appliqué par la base
 * (enforce_order_insert) : l'app ne fait qu'afficher l'aperçu.
 */
import { supabase } from "@/integrations/supabase/client";

export type Side = "buy" | "sell";
export type BonusReason = "promo" | "referral_new" | "referral_sponsor";
export interface Bonus { bps: number; reason: BonusReason | null; problem: string | null }

/** L'avantage qu'aurait la prochaine commande (avec ou sans code promo). */
export async function previewBonus(side: Side, code?: string | null): Promise<Bonus> {
  const { data } = await supabase.rpc("preview_bonus", { _side: side, _code: code || null });
  const d = (data ?? {}) as Partial<Bonus>;
  return { bps: Number(d.bps ?? 0), reason: (d.reason ?? null) as BonusReason | null, problem: d.problem ?? null };
}

/** Taux après avantage : moins cher à l'achat, mieux payé à la vente. */
export const withBonus = (rate: number, side: Side, bps: number) => (bps > 0 ? rate * (side === "buy" ? 1 - bps / 10000 : 1 + bps / 10000) : rate);

/** « 0,5 % » */
export const bpsText = (bps: number, lang: "fr" | "en" = "fr") =>
  `${new Intl.NumberFormat(lang === "en" ? "en-CA" : "fr-CA", { maximumFractionDigits: 2 }).format(bps / 100)}${lang === "en" ? "%" : " %"}`;

// ─── Parrainage ───

export interface MyReferral { enabled: boolean; bonusBps: number; code: string | null; invited: number; qualified: number; available: number }

export async function myReferral(): Promise<MyReferral | null> {
  const { data, error } = await supabase.rpc("my_referral");
  if (error || !data) return null;
  const d = data as Record<string, unknown>;
  return {
    enabled: !!d.enabled, bonusBps: Number(d.bonus_bps ?? 0), code: (d.code as string) ?? null,
    invited: Number(d.invited ?? 0), qualified: Number(d.qualified ?? 0), available: Number(d.available ?? 0),
  };
}

export const referralLink = (code: string) => `${window.location.origin}/?parrain=${encodeURIComponent(code)}`;

const REF_KEY = "ooble.parrain";

/** Au démarrage, sur toutes les pages : retient le code du lien ?parrain=CODE (le premier vu). */
export function captureReferral() {
  try {
    const c = new URL(window.location.href).searchParams.get("parrain");
    if (c && /^[A-Za-z0-9]{4,12}$/.test(c) && !localStorage.getItem(REF_KEY)) localStorage.setItem(REF_KEY, c.toUpperCase());
  } catch { /* stockage indisponible */ }
}

/** Une fois connecté : rattache le compte à son parrain (la base vérifie les conditions). */
export async function claimStoredReferral(uid: string | null | undefined) {
  if (!uid) return;
  let code: string | null = null;
  try { code = localStorage.getItem(REF_KEY); } catch { return; }
  if (!code) return;
  const { data, error } = await supabase.rpc("claim_referral", { _code: code });
  // Réponse définitive (rattaché, ou impossible) : on oublie le code. Erreur réseau : on réessaiera.
  if (!error && data && data !== "auth") try { localStorage.removeItem(REF_KEY); } catch { /* ignore */ }
}

// ─── Équipe marketing ───

export interface GrowthSettings { referralEnabled: boolean; referralBonusBps: number; maxBonusBps: number }

export async function loadGrowthSettings(): Promise<GrowthSettings> {
  const { data, error } = await supabase.from("growth_settings").select("*").eq("id", 1).single();
  if (error) throw new Error(error.message);
  return { referralEnabled: data.referral_enabled, referralBonusBps: data.referral_bonus_bps, maxBonusBps: data.max_bonus_bps };
}

export async function saveGrowthSettings(s: Partial<GrowthSettings>, by: string | null): Promise<void> {
  const { error } = await supabase.from("growth_settings").update({
    ...(s.referralEnabled !== undefined ? { referral_enabled: s.referralEnabled } : {}),
    ...(s.referralBonusBps !== undefined ? { referral_bonus_bps: s.referralBonusBps } : {}),
    ...(s.maxBonusBps !== undefined ? { max_bonus_bps: s.maxBonusBps } : {}),
    updated_at: new Date().toISOString(), updated_by: by,
  }).eq("id", 1);
  if (error) throw new Error(error.message);
}

export interface PromoCode {
  id: string; code: string; bonusBps: number; side: "buy" | "sell" | "both"; firstOrderOnly: boolean;
  maxUses: number | null; endsAt: string | null; active: boolean; note: string | null; createdAt: string;
}

export async function listPromos(): Promise<PromoCode[]> {
  const { data, error } = await supabase.from("promo_codes").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => ({
    id: p.id, code: p.code, bonusBps: p.bonus_bps, side: p.side as PromoCode["side"], firstOrderOnly: p.first_order_only,
    maxUses: p.max_uses, endsAt: p.ends_at, active: p.active, note: p.note, createdAt: p.created_at,
  }));
}

export async function createPromo(p: Omit<PromoCode, "id" | "createdAt" | "active">, by: string | null): Promise<void> {
  const { error } = await supabase.from("promo_codes").insert({
    code: p.code.trim().toUpperCase(), bonus_bps: p.bonusBps, side: p.side, first_order_only: p.firstOrderOnly,
    max_uses: p.maxUses, ends_at: p.endsAt, note: p.note, created_by: by,
  });
  if (error) throw new Error(error.code === "23505" ? "Ce code existe déjà." : error.message);
}

export async function setPromoActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from("promo_codes").update({ active }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function promoStats(): Promise<Record<string, { uses: number; completed: number; volume: number }>> {
  const { data, error } = await supabase.rpc("promo_stats");
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((r) => [r.code_id, { uses: r.uses, completed: r.completed, volume: Number(r.volume) }]));
}

export interface SponsorRow { id: string; name: string; invited: number; ordered: number; qualified: number; volume: number }
export async function referralStats(): Promise<SponsorRow[]> {
  const { data, error } = await supabase.rpc("referral_stats");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ id: r.referrer_id, name: r.name, invited: r.invited, ordered: r.ordered, qualified: r.qualified, volume: Number(r.volume) }));
}

export interface LinkRow { source: string; campaign: string | null; signups: number; verified: number; buyers: number; volume: number }
export async function linkStats(since: Date): Promise<LinkRow[]> {
  const { data, error } = await supabase.rpc("link_stats", { _since: since.toISOString() });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ ...r, volume: Number(r.volume) }));
}
