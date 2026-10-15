import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetchAll";
import type { Database } from "@/integrations/supabase/types";

type KycStatus = Database["public"]["Enums"]["kyc_status"];

type AccountType = Database["public"]["Enums"]["account_type"];

export interface ClientProfile {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  kycStatus: KycStatus;
  dailyLimitCad: number;
  /** Langue de l'app et des courriels ; null tant qu'elle n'est pas connue. */
  preferredLang: "fr" | "en" | null;
  interacQuestion: string | null;
  interacAnswer: string | null;
  accountType: AccountType;
  businessName: string | null;
  businessNumber: string | null;
  businessAddress: string | null;
  businessPhone: string | null;
  businessStatus: Database["public"]["Enums"]["kyc_status"];
  createdAt: string;
  orderCount: number;
  totalCad: number;
}

export interface ClientOrder {
  id: string;
  side: "buy" | "sell";
  status: string;
  cadAmount: number;
  usdtAmount: number;
  createdAt: string;
}

const KYC_LABEL: Record<KycStatus, string> = {
  not_started: "Non commencée",
  pending: "En cours de vérification",
  approved: "Approuvée",
  rejected: "Refusée",
};

export { KYC_LABEL };

export async function fetchClientProfile(userId: string): Promise<ClientProfile | null> {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, kyc_status, daily_limit_cad, preferred_lang, interac_question, interac_answer, account_type, business_name, business_number, business_address, business_phone, business_status, created_at")
    .eq("id", userId)
    .maybeSingle();
  if (error || !profile) return null;

  const { count } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  const { data: totals } = await supabase
    .from("orders")
    .select("cad_amount")
    .eq("user_id", userId)
    .eq("status", "completed");

  const totalCad = (totals ?? []).reduce((s, o) => s + Number(o.cad_amount), 0);

  return {
    id: profile.id,
    fullName: profile.full_name?.trim() || "Client",
    email: profile.email ?? "",
    phone: profile.phone,
    kycStatus: profile.kyc_status,
    dailyLimitCad: profile.daily_limit_cad,
    preferredLang: profile.preferred_lang === "fr" || profile.preferred_lang === "en" ? profile.preferred_lang : null,
    interacQuestion: profile.interac_question,
    interacAnswer: profile.interac_answer,
    accountType: profile.account_type,
    businessName: profile.business_name,
    businessNumber: profile.business_number,
    businessAddress: profile.business_address,
    businessPhone: profile.business_phone,
    businessStatus: profile.business_status,
    createdAt: profile.created_at,
    orderCount: count ?? 0,
    totalCad,
  };
}

/** Version compacte d'un client pour l'annuaire (composer d'e-mail, etc.). */
export interface ClientDirectoryEntry {
  id: string;
  fullName: string;
  firstName: string;
  email: string;
  kycStatus: KycStatus;
  accountType: AccountType;
  /** Langue choisie dans l'app (null si jamais enregistrée). */
  lang?: "fr" | "en" | null;
  /** Province ou région d'inscription (code, ex. « QC »). */
  region?: string | null;
}

/** Déduit un prénom exploitable pour la personnalisation d'un mail. */
function pickFirstName(fullName: string | null | undefined, email: string | null | undefined): string {
  const raw = (fullName ?? "").trim();
  if (raw) return raw.split(/\s+/)[0];
  // Repli sur la partie locale de l'e-mail (« marie.dupont » → « Marie »).
  const local = (email ?? "").split("@")[0] ?? "";
  const first = local.split(/[.\-_]/)[0];
  if (!first) return "";
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/**
 * Annuaire des clients pour le composer d'e-mail : nécessite un compte staff
 * (la politique RLS `is_staff(auth.uid())` sur `profiles` doit être active).
 */
export async function fetchClientDirectory(limit = 200_000): Promise<ClientDirectoryEntry[]> {
  // Tous les clients par tranches (l'annuaire sert aux campagnes : « Tous » doit vraiment être tous).
  const [data, origins] = await Promise.all([
    fetchAll((a, b) => supabase
      .from("profiles")
      .select("id, full_name, email, kyc_status, account_type, preferred_lang" as "id, full_name, email, kyc_status, account_type")
      .not("email", "is", null)
      .order("full_name", { ascending: true })
      .order("id")
      .range(a, b), { max: limit }).catch(() => null),
    fetchAll((a, b) => supabase.from("signup_origins" as never).select("user_id, region").order("user_id" as never).range(a, b) as unknown as PromiseLike<{ data: { user_id: string; region: string | null }[] | null; error: { message: string } | null }>)
      .catch(() => [] as { user_id: string; region: string | null }[]),
  ]);
  if (!data) return [];
  const regionOf = new Map(origins.map((o) => [o.user_id, o.region]));
  return data
    .filter((p) => (p.email ?? "").length > 0)
    .map((p) => {
      const lang = (p as unknown as { preferred_lang?: string | null }).preferred_lang;
      return {
        id: p.id,
        fullName: (p.full_name ?? "").trim() || (p.email ?? "").split("@")[0] || "Client",
        firstName: pickFirstName(p.full_name, p.email),
        email: p.email as string,
        kycStatus: p.kyc_status,
        accountType: p.account_type,
        lang: lang === "fr" || lang === "en" ? lang : null,
        region: regionOf.get(p.id) ?? null,
      };
    });
}

export async function fetchClientOrders(userId: string): Promise<ClientOrder[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("id, side, status, cad_amount, usdt_amount, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map((o) => ({
    id: o.id,
    side: o.side,
    status: o.status,
    cadAmount: Number(o.cad_amount),
    usdtAmount: Number(o.usdt_amount),
    createdAt: o.created_at,
  }));
}
