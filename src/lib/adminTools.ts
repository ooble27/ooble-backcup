/**
 * Outils du back-office qui passent par le serveur (fonction admin-tools) ou par une fonction SQL réservée :
 * quota de courriels, état et accès au compte d'un client, dossier de vérification de test, santé des tâches.
 */
import { supabase } from "@/integrations/supabase/client";
import { primaryAsset } from "@/lib/assets";
import { getAppSettingsNow } from "@/lib/settings";

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("admin-tools", { body });
  if (error) {
    const ctx = (error as unknown as { context?: Response }).context;
    const msg = ctx ? await ctx.json().then((j: { error?: string }) => j.error).catch(() => null) : null;
    throw new Error(msg ?? error.message);
  }
  if (data && typeof data === "object" && "error" in data) throw new Error(String((data as { error: unknown }).error));
  return data as T;
}

export interface EmailUsage { today: number; dayLimit: number; month: number; monthLimit: number; resetsAt: string; monthResetsAt: string }
// La liste des Réglages et la page Courriels le demandent au même moment : un seul appel à la fois,
// et le résultat sert une minute (Resend limite le nombre de lectures par seconde).
let usage: { at: number; p: Promise<EmailUsage> } | null = null;
export const fetchEmailUsage = () => {
  if (usage && Date.now() - usage.at < 60_000) return usage.p;
  const p = call<EmailUsage>({ action: "email_usage" });
  usage = { at: Date.now(), p };
  p.catch(() => { if (usage?.p === p) usage = null; });
  return p;
};

export interface AccountAccess { email: string | null; createdAt: string; emailConfirmedAt: string | null; lastSignInAt: string | null; suspended: boolean }
export const fetchAccountAccess = (userId: string) => call<AccountAccess>({ action: "account", userId });
export const confirmClientEmail = (userId: string) => call<AccountAccess>({ action: "confirm_email", userId });
export const setAccountSuspended = (userId: string, suspended: boolean) => call<AccountAccess>({ action: suspended ? "suspend" : "unsuspend", userId });

/** Envoie au client le courriel « réinitialiser mon mot de passe » (le même que « Mot de passe oublié »). */
export async function sendPasswordReset(email: string): Promise<{ error?: string }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reinitialiser` });
  return error ? { error: error.message } : {};
}

export const sendTestKyc = () => call<{ dossier: string; client: string }>({ action: "test_kyc" });

export interface JobHealth { jobname: string; schedule: string; active: boolean; lastStart: string | null; lastStatus: string | null; lastMessage: string | null; runs24h: number; failures24h: number }

export async function fetchPlatformHealth(): Promise<JobHealth[]> {
  const { data, error } = await supabase.rpc("admin_platform_health");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    jobname: r.jobname, schedule: r.schedule, active: r.active, lastStart: r.last_start, lastStatus: r.last_status,
    lastMessage: r.last_message, runs24h: r.runs_24h, failures24h: r.failures_24h,
  }));
}

export interface LatestRate { market: number | null; buy: number; sell: number; at: string }

/** Dernier taux publié (celui que voient les clients). */
/** Dernier taux publié de la cryptomonnaie principale ouverte (USDC si ouverte). */
export async function fetchLatestRate(): Promise<LatestRate | null> {
  const { data, error } = await supabase.from("exchange_rates").select("market_rate, buy_rate, sell_rate, fetched_at")
    .eq("asset", primaryAsset(getAppSettingsNow()).id).order("fetched_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { market: data.market_rate == null ? null : Number(data.market_rate), buy: Number(data.buy_rate), sell: Number(data.sell_rate), at: data.fetched_at } : null;
}

/** Recalcule le taux tout de suite (cours du marché + marges enregistrées) au lieu d'attendre le prochain passage. */
export async function refreshRateNow(): Promise<void> {
  const { error } = await supabase.functions.invoke("refresh-rate", { body: {} });
  if (error) throw new Error(error.message);
}
