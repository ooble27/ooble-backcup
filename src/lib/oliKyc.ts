/**
 * Rapport d'Oli sur un dossier de vérification d'identité (table kyc_checks, écrite par la fonction
 * kyc-check). Oli lit les documents et compare ; l'équipe décide toujours.
 */
import { supabase } from "@/integrations/supabase/client";

export type OliState = "ok" | "look" | "unknown" | "manual";
export interface OliCheck { key: string; state: OliState; text: string }
export interface OliReport {
  status: "pending" | "done" | "error";
  verdict: "clear" | "review" | null;
  checks: OliCheck[];
  error: string | null;
  finishedAt: string | null;
}

// kyc_checks et oli_settings ne sont pas encore dans les types générés.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const from = (t: string) => (supabase.from as any)(t);

export async function fetchOliReport(kycId: string): Promise<OliReport | null> {
  const { data } = await from("kyc_checks").select("status, verdict, checks, error, finished_at").eq("kyc_id", kycId).maybeSingle();
  if (!data) return null;
  return { status: data.status, verdict: data.verdict, checks: (data.checks ?? []) as OliCheck[], error: data.error, finishedAt: data.finished_at };
}

/** Demande à Oli de (re)lire le dossier. La réponse arrive dans kyc_checks. */
export async function runOliCheck(kycId: string): Promise<{ error?: string }> {
  const { data, error } = await supabase.functions.invoke("kyc-check", { body: { kyc_id: kycId } });
  if (error) return { error: error.message };
  return (data as { error?: string } | null)?.error ? { error: (data as { error: string }).error } : {};
}

export async function fetchOliSettings(): Promise<{ kycCheck: boolean }> {
  const { data } = await from("oli_settings").select("kyc_check").eq("id", 1).maybeSingle();
  return { kycCheck: data?.kyc_check ?? true };
}

export async function saveOliKycCheck(on: boolean): Promise<{ error?: string }> {
  const { data: s } = await supabase.auth.getSession();
  const { error } = await from("oli_settings").update({ kyc_check: on, updated_at: new Date().toISOString(), updated_by: s.session?.user?.id ?? null }).eq("id", 1);
  return error ? { error: error.message } : {};
}
