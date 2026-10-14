/**
 * Journal d'audit — helper côté client (Feature #31).
 *
 * Insère une ligne dans `admin_audit_log` à chaque action pertinente. Deux
 * règles absolues :
 *   1. On ne throw jamais — un échec d'audit ne doit pas casser l'action
 *      métier ; on log dans la console en fallback.
 *   2. La table est append-only : on n'expose donc que `logAdminAction`.
 *
 * Convention de nommage `action` (verbes courts, séparés par un point) :
 *   order.status_change | order.cancel | order.delete | order.assign | order.release
 *   kyc.approve         | kyc.reject
 *   team.role_change    | team.invite
 *   compliance.take_charge | compliance.classify | compliance.declaration_draft | compliance.declaration_submit
 */
import { supabase } from "@/integrations/supabase/client";

export type AuditEntityKind =
  | "order"
  | "client"
  | "compliance_case"
  | "compliance_declaration"
  | "kyc"
  | "team_member"
  | string;

export interface LogAdminActionInput {
  action: string;
  entityKind?: AuditEntityKind | null;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown> | null;
}

/** Version JSON-safe : on retire les valeurs undefined et on garantit un objet. */
function toJson(value: unknown): unknown {
  if (value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

/**
 * Journalise une action admin. Ne throw jamais.
 * L'appelant peut `await` pour la traçabilité, mais peut aussi laisser filer.
 */
export async function logAdminAction(input: LogAdminActionInput): Promise<void> {
  try {
    const { data: auth } = await supabase.auth.getSession();
    const session = auth.session;
    const actorId = session?.user?.id ?? null;
    const actorEmail = session?.user?.email ?? null;

    // Contexte technique : user agent (utile pour l'enquête d'incident).
    const meta: Record<string, unknown> = { ...(input.metadata ?? {}) };
    if (typeof navigator !== "undefined" && navigator.userAgent && meta.user_agent === undefined) {
      meta.user_agent = navigator.userAgent;
    }

    // Rôle « le plus élevé » à titre indicatif — la vérité reste dans user_roles.
    let actorRole: string | null = null;
    if (actorId) {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", actorId);
      const list = (roles ?? []).map((r) => r.role);
      const priority = ["admin", "operator", "kyc_reviewer", "support", "marketing"];
      for (const p of priority) if (list.includes(p as never)) { actorRole = p; break; }
    }

    // Sur la propriété `admin_audit_log` : type non encore régénéré dans types.ts,
    // on caste vers `any` pour éviter les erreurs de typage — les colonnes
    // correspondent 1:1 à la migration.
    const row = {
      actor_user_id: actorId,
      actor_role: actorRole,
      actor_email: actorEmail,
      action: input.action,
      entity_kind: input.entityKind ?? null,
      entity_id: input.entityId ?? null,
      before: toJson(input.before),
      after: toJson(input.after),
      metadata: Object.keys(meta).length > 0 ? toJson(meta) : null,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabase as any;
    const { error } = await client.from("admin_audit_log").insert(row);
    if (error) {
       
      console.warn("[audit] insert failed:", error.message, input.action);
    }
  } catch (err) {
     
    console.warn("[audit] unexpected error:", err);
  }
}

// ────────────────────────────────────────────────────────────
// Types d'affichage pour la vue admin (lecture)
// ────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  actorUserId: string | null;
  actorRole: string | null;
  actorEmail: string | null;
  action: string;
  entityKind: string | null;
  entityId: string | null;
  before: unknown;
  after: unknown;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface FetchAuditParams {
  from?: string;   // ISO datetime
  to?: string;     // ISO datetime
  actorEmail?: string;
  action?: string;
  entityKind?: string;
  limit?: number;
  offset?: number;
}

interface AuditRowFromDb {
  id: string;
  actor_user_id: string | null;
  actor_role: string | null;
  actor_email: string | null;
  action: string;
  entity_kind: string | null;
  entity_id: string | null;
  before: unknown;
  after: unknown;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

function normalize(row: AuditRowFromDb): AuditLogEntry {
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    actorRole: row.actor_role,
    actorEmail: row.actor_email,
    action: row.action,
    entityKind: row.entity_kind,
    entityId: row.entity_id,
    before: row.before,
    after: row.after,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

/** Récupère les lignes du journal (avec filtres) + le total pour la pagination. */
export async function fetchAuditLog(
  params: FetchAuditParams = {},
): Promise<{ rows: AuditLogEntry[]; total: number }> {
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  let q = client
    .from("admin_audit_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (params.from) q = q.gte("created_at", params.from);
  if (params.to) q = q.lte("created_at", params.to);
  if (params.actorEmail) q = q.ilike("actor_email", `%${params.actorEmail}%`);
  if (params.action) q = q.eq("action", params.action);
  if (params.entityKind) q = q.eq("entity_kind", params.entityKind);

  const { data, count, error } = await q;
  if (error) {
     
    console.warn("[audit] fetch failed:", error.message);
    return { rows: [], total: 0 };
  }
  const rows = ((data as AuditRowFromDb[]) ?? []).map(normalize);
  return { rows, total: count ?? rows.length };
}

/** Liste distincte des valeurs (actions, entités) pour peupler les filtres. */
export async function fetchAuditFacets(): Promise<{ actions: string[]; entityKinds: string[] }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  const { data, error } = await client
    .from("admin_audit_log")
    .select("action, entity_kind")
    .limit(2000);
  if (error || !data) return { actions: [], entityKinds: [] };
  const actions = new Set<string>();
  const kinds = new Set<string>();
  for (const r of data as { action: string; entity_kind: string | null }[]) {
    if (r.action) actions.add(r.action);
    if (r.entity_kind) kinds.add(r.entity_kind);
  }
  return {
    actions: [...actions].sort(),
    entityKinds: [...kinds].sort(),
  };
}

// ────────────────────────────────────────────────────────────
// Libellés lisibles pour l'IHM (FR / EN)
// ────────────────────────────────────────────────────────────

export const ACTION_LABELS: Record<string, { fr: string; en: string }> = {
  "order.status_change":            { fr: "Changement de statut",       en: "Status change" },
  "order.cancel":                   { fr: "Annulation de commande",     en: "Order cancelled" },
  "order.delete":                   { fr: "Suppression de commande",    en: "Order deleted" },
  "order.assign":                   { fr: "Prise en charge",            en: "Assigned" },
  "order.release":                  { fr: "Libération",                 en: "Released" },
  "kyc.approve":                    { fr: "KYC approuvé",               en: "KYC approved" },
  "kyc.reject":                     { fr: "KYC refusé",                 en: "KYC rejected" },
  "team.role_change":               { fr: "Changement de rôle",         en: "Role change" },
  "team.invite":                    { fr: "Invitation d'un membre",     en: "Member invited" },
  "compliance.take_charge":         { fr: "Alerte prise en charge",     en: "Alert taken" },
  "compliance.classify":            { fr: "Alerte classée",             en: "Alert closed" },
  "compliance.declaration_draft":   { fr: "Déclaration · brouillon",    en: "Declaration draft" },
  "compliance.declaration_submit":  { fr: "Déclaration soumise",        en: "Declaration submitted" },
  "compliance.declaration_status":  { fr: "Statut de déclaration",      en: "Declaration status" },
  "compliance.alert_create":        { fr: "Client signalé",             en: "Client flagged" },
  "compliance.program_toggle":      { fr: "Programme mis à jour",       en: "Program updated" },
  "compliance.register_export":     { fr: "Registre téléchargé",        en: "Register exported" },
  "compliance.client_register_export": { fr: "Registre d'un client téléchargé", en: "Client register exported" },
  "kyb.approve":                    { fr: "Entreprise approuvée",       en: "Business approved" },
  "kyb.reject":                     { fr: "Entreprise refusée",         en: "Business rejected" },
  "kyb.reset":                      { fr: "Vérification d'entreprise rouverte", en: "Business check reopened" },
  "team.remove":                    { fr: "Membre retiré",              en: "Member removed" },
  "platform.launch":                { fr: "Lancement des activités",    en: "Launch" },
  "docs.create":                    { fr: "Ressource ajoutée",          en: "Resource added" },
  "docs.update":                    { fr: "Ressource modifiée",         en: "Resource updated" },
  "docs.archive":                   { fr: "Ressource archivée",         en: "Resource archived" },
  "docs.pdf":                       { fr: "PDF des ressources téléchargé", en: "Resources PDF downloaded" },
  "platform.reset_test_orders":     { fr: "Commandes de test effacées", en: "Test orders cleared" },
};

export const ENTITY_LABELS: Record<string, { fr: string; en: string }> = {
  order:                  { fr: "Commande",       en: "Order" },
  client:                 { fr: "Client",         en: "Client" },
  compliance_case:        { fr: "Cas conformité", en: "Compliance case" },
  compliance_declaration: { fr: "Déclaration",    en: "Declaration" },
  kyc:                    { fr: "KYC",            en: "KYC" },
  team_member:            { fr: "Membre équipe",  en: "Team member" },
  compliance_program:     { fr: "Programme de conformité", en: "Compliance program" },
  compliance_register:    { fr: "Registre CANAFE", en: "FINTRAC register" },
  kyb:                    { fr: "Entreprise",     en: "Business" },
  platform:               { fr: "Plateforme",     en: "Platform" },
};
