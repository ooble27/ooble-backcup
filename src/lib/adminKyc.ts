import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetchAll";
import type { Database } from "@/integrations/supabase/types";
import type { KycRequest, KycStatus } from "@/lib/adminOrders";
import { logAdminAction } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { decisionEmailVars } from "@/lib/adminKyb";

type DbKycStatus = Database["public"]["Enums"]["kyc_status"];
type KycRow = Database["public"]["Tables"]["kyc_verifications"]["Row"];
type RowWithProfile = KycRow & { profiles: { full_name: string | null; email: string | null; created_at: string | null } | null };

const DB_TO_DEMO: Record<DbKycStatus, KycStatus> = {
  not_started: "attente",
  pending: "attente",
  approved: "verifie",
  rejected: "refuse",
};
const DEMO_TO_DB: Record<KycStatus, DbKycStatus> = {
  attente: "pending",
  verifie: "approved",
  refuse: "rejected",
};

const DOC_TYPE_LABELS: Record<string, string> = {
  passport: "Passeport",
  drivers_license: "Permis de conduire",
  national_id: "Carte d'identité",
};

const minsAgo = (iso: string) =>
  Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));

export async function fetchKyc(): Promise<KycRequest[]> {
  const data = await fetchAll((a, b) => supabase
    .from("kyc_verifications")
    .select("*, profiles(full_name, email, created_at)")
    .order("created_at", { ascending: false })
    .order("id")
    .range(a, b)).catch(() => null);
  if (!data) return [];
  return (data as RowWithProfile[]).map((r) => ({
    id: r.id,
    userId: r.user_id,
    clientName: r.profiles?.full_name?.trim() || "Client",
    email: r.profiles?.email ?? "",
    docType: r.doc_type ? (DOC_TYPE_LABELS[r.doc_type] ?? r.doc_type) : "Pièce d'identité",
    documentPaths: (r.document_paths as Record<string, string> | null) ?? null,
    submittedMinsAgo: minsAgo(r.created_at),
    status: DB_TO_DEMO[r.status],
    reviewNote: r.review_note,
    createdAt: r.created_at,
    assignedTo: r.assigned_to,
    assignedName: r.assigned_name,
    reviewedAt: r.reviewed_at,
    reviewedByName: r.reviewed_by_name,
    accountCreatedAt: r.profiles?.created_at ?? null,
  }));
}

/**
 * Prendre un dossier (personne ou entreprise) : les collègues voient qui l'examine.
 * Sans `force`, on ne prend pas un dossier déjà pris. `who = null` le libère, s'il est encore à nous.
 * La base libère d'elle-même le dossier quand la décision tombe.
 */
export async function claimReview(
  kind: "kyc" | "kyb",
  id: string,
  who: { id: string; name: string } | null,
  opts: { force?: boolean; me?: string } = {},
): Promise<{ error?: string; taken?: boolean }> {
  const table = kind === "kyc" ? "kyc_verifications" : "business_verifications";
  let q = supabase.from(table).update({ assigned_to: who?.id ?? null, assigned_name: who?.name ?? null }).eq("id", id);
  if (who && !opts.force) q = q.is("assigned_to", null);
  if (!who && opts.me) q = q.eq("assigned_to", opts.me);
  const { data, error } = await q.select("id");
  if (error) return { error: error.message };
  return { taken: !!who && (data?.length ?? 0) === 0 };
}

export async function getDocumentUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("kyc").createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}

/**
 * Décision sur une vérification d'identité. Un refus exige un motif : il est
 * enregistré, affiché au client sur sa page de vérification et envoyé par
 * courriel avec la décision (approbation comme refus).
 */
export async function setKycStatus(
  id: string,
  status: KycStatus,
  note?: string,
  client?: { email: string; name: string },
): Promise<{ error?: string }> {
  const { data: before } = await supabase
    .from("kyc_verifications")
    .select("id, user_id, status")
    .eq("id", id)
    .maybeSingle();

  const newDbStatus = DEMO_TO_DB[status];
  const reviewNote = status === "refuse" ? (note ?? "").trim() || null : null;
  const { error } = await supabase
    .from("kyc_verifications")
    .update({ status: newDbStatus, review_note: reviewNote, reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  if (client?.email && status !== "attente") {
    void sendEmail({
      to: client.email,
      template: status === "verifie" ? "kyc-approved" : "kyc-rejected",
      vars: decisionEmailVars(client.name, reviewNote, "/app/verification"),
    });
  }

  const action = status === "verifie" ? "kyc.approve" : status === "refuse" ? "kyc.reject" : null;
  if (action) {
    void logAdminAction({
      action,
      entityKind: "kyc",
      entityId: id,
      before,
      after: { ...(before ?? { id }), status: newDbStatus, review_note: reviewNote },
      metadata: { client_user_id: before?.user_id ?? null },
    });
  }
  return {};
}
