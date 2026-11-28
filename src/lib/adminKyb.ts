/**
 * Vérification des entreprises (KYB) — côté back-office.
 * Lecture : tout le staff. Décision : admin et kyc_reviewer (RLS).
 */
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetchAll";
import type { Database } from "@/integrations/supabase/types";
import type { BusinessOwner, KybDocKey } from "@/lib/kyb";
import { logAdminAction } from "@/lib/audit";
import { sendEmail } from "@/lib/email";

type DbStatus = Database["public"]["Enums"]["kyc_status"];
type Row = Database["public"]["Tables"]["business_verifications"]["Row"];
type RowWithProfile = Row & { profiles: { full_name: string | null; email: string | null; kyc_status: DbStatus } | null };

export interface KybRequest {
  id: string;
  userId: string;
  status: DbStatus;
  contactName: string;
  email: string;
  contactKyc: DbStatus;
  legalName: string;
  businessNumber: string | null;
  jurisdiction: string | null;
  address: string;
  phone: string | null;
  activity: string;
  website: string | null;
  owners: BusinessOwner[];
  documents: Partial<Record<KybDocKey, string>>;
  reviewNote: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
  assignedTo: string | null;
  assignedName: string | null;
  createdAt: string;
  /** Le responsable : le compte individuel relié (profiles.business_owner_id). null = compte non relié. */
  owner: { id: string; name: string; email: string; kyc: KybRequest["contactKyc"] } | null;
}

export async function fetchKyb(): Promise<KybRequest[]> {
  const data = await fetchAll((a, b) => supabase
    .from("business_verifications")
    .select("*, profiles(full_name, email, kyc_status)")
    .order("created_at", { ascending: false })
    .order("id")
    .range(a, b)).catch(() => null);
  if (!data) return [];
  const rows: KybRequest[] = (data as unknown as RowWithProfile[]).map((r) => ({
    id: r.id,
    userId: r.user_id,
    status: r.status,
    contactName: r.profiles?.full_name?.trim() || "Client",
    email: r.profiles?.email ?? "",
    contactKyc: r.profiles?.kyc_status ?? "not_started",
    legalName: r.legal_name,
    businessNumber: r.business_number,
    jurisdiction: r.jurisdiction,
    address: r.address,
    phone: r.phone,
    activity: r.activity,
    website: r.website,
    owners: (r.owners as unknown as BusinessOwner[]) ?? [],
    documents: (r.documents as Partial<Record<KybDocKey, string>>) ?? {},
    reviewNote: r.review_note,
    reviewedAt: r.reviewed_at,
    reviewedByName: r.reviewed_by_name,
    assignedTo: r.assigned_to,
    assignedName: r.assigned_name,
    createdAt: r.created_at,
    owner: null,
  }));

  // Le responsable de chaque compte entreprise : son compte individuel relié et son statut d'identité.
  const ids = [...new Set(rows.map((r) => r.userId))];
  if (ids.length) {
    const { data: links } = await supabase.from("profiles").select("id, business_owner_id" as never).in("id", ids);
    const ownerOf = new Map(((links as { id: string; business_owner_id: string | null }[] | null) ?? []).map((l) => [l.id, l.business_owner_id]));
    const ownerIds = [...new Set([...ownerOf.values()].filter((v): v is string => !!v))];
    const { data: owners } = ownerIds.length
      ? await supabase.from("profiles").select("id, full_name, email, kyc_status").in("id", ownerIds)
      : { data: [] };
    const byId = new Map(((owners as { id: string; full_name: string | null; email: string | null; kyc_status: KybRequest["contactKyc"] }[] | null) ?? []).map((o) => [o.id, o]));
    for (const r of rows) {
      const o = byId.get(ownerOf.get(r.userId) ?? "");
      r.owner = o ? { id: o.id, name: o.full_name?.trim() || o.email || "Client", email: o.email ?? "", kyc: o.kyc_status } : null;
      // L'identité qui compte est celle du responsable relié ; sans responsable, rien n'est vérifié.
      r.contactKyc = o ? o.kyc_status : "not_started";
      if (o) r.contactName = r.owner!.name;
    }
  }
  return rows;
}

/** Lien temporaire (5 min) vers un document du dossier. */
export async function getKybDocumentUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("kyc").createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}

/** Variables communes des courriels de décision (prénom, date, liens, motif). */
export function decisionEmailVars(fullName: string, reason: string | null, retryPath: string): Record<string, string> {
  const site = window.location.origin;
  return {
    firstName: fullName.trim().split(/\s+/)[0] || "",
    date: new Date().toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" }),
    appUrl: `${site}/app`,
    retryUrl: `${site}${retryPath}`,
    reason: reason ?? "",
  };
}

/** Approuve ou refuse un dossier, journalise la décision et prévient le client. */
export async function decideKyb(
  req: KybRequest,
  decision: "approved" | "rejected",
  note: string,
): Promise<{ error?: string }> {
  const { data: sess } = await supabase.auth.getSession();
  const reviewer = sess.session?.user?.id ?? null;
  const reviewNote = note.trim() || null;

  const { error } = await supabase
    .from("business_verifications")
    .update({ status: decision, review_note: reviewNote, reviewed_by: reviewer, reviewed_at: new Date().toISOString() })
    .eq("id", req.id);
  if (error) return { error: error.message };

  void logAdminAction({
    action: decision === "approved" ? "kyb.approve" : "kyb.reject",
    entityKind: "kyb",
    entityId: req.id,
    before: { status: req.status },
    after: { status: decision, review_note: reviewNote },
    metadata: { client_user_id: req.userId, legal_name: req.legalName },
  });

  if (req.email) {
    void sendEmail({
      to: req.email,
      template: decision === "approved" ? "kyb-approved" : "kyb-rejected",
      vars: { ...decisionEmailVars(req.contactName, reviewNote, "/app/entreprise"), businessName: req.legalName },
    });
  }
  return {};
}
