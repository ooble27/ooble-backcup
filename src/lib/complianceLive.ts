/**
 * Conformité CANAFE — accès aux vraies données (onglet Conformité, admin).
 *
 * Tables : compliance_alerts, compliance_declarations, compliance_checklist.
 * Les alertes automatiques sont créées côté base par compliance_scan()
 * (pg_cron, toutes les 10 min) ; l'équipe peut aussi en créer à la main.
 * Rien ne se supprime : un trigger bloque la suppression (conservation 5 ans).
 * Voir supabase/migrations/20261008040000_compliance.sql.
 */
import { supabase } from "@/integrations/supabase/client";
import { orderRef } from "@/lib/orders";
import type {
  AlertStatus, AlertType, ChecklistItem, ComplianceAlert, ComplianceDeclaration,
  DeclarationFormData, DeclarationStatus, DeclarationType,
} from "@/lib/compliance";

// Les lignes sont décrites par nos propres interfaces (plus précises que les types générés).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (t: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any };

const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : undefined);

async function uid(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

type Profile = { full_name: string | null; email: string | null; business_name: string | null } | null;
const nameOf = (p: Profile) => p?.business_name?.trim() || p?.full_name?.trim() || "Client";

// ─────────────── Alertes ───────────────

interface AlertRow {
  id: string; ref: string; type: AlertType; source: "auto" | "manuel";
  order_id: string | null; order_ids: string[] | null; user_id: string | null;
  amount_cad: number | string; reason: string; occurred_at: string; due_date: string | null;
  status: AlertStatus; assigned_to: string | null; assigned_name: string | null; notes: string | null; classification: string | null;
  closed_at: string | null; closed_by_name: string | null; created_at: string;
  profiles: Profile;
}

function toAlert(r: AlertRow, me: string | null): ComplianceAlert {
  return {
    id: r.id,
    ref: r.ref,
    type: r.type,
    source: r.source,
    orderId: r.order_id ?? undefined,
    orderRef: r.order_id ? orderRef(r.order_id) : undefined,
    orderIds: r.order_ids ?? (r.order_id ? [r.order_id] : []),
    orderRefs: (r.order_ids ?? []).map(orderRef),
    userId: r.user_id ?? undefined,
    clientName: nameOf(r.profiles),
    clientEmail: r.profiles?.email ?? "",
    amount: Number(r.amount_cad),
    reason: r.reason,
    occurredAt: r.occurred_at,
    createdAt: day(r.created_at)!,
    dueDate: r.due_date ?? undefined,
    status: r.status,
    assignedTo: r.assigned_to ? (r.assigned_name ?? "Un membre de l'équipe") : undefined,
    mine: !!r.assigned_to && r.assigned_to === me,
    notes: r.notes ?? undefined,
    classification: r.classification ?? undefined,
    closedAt: day(r.closed_at),
    closedBy: r.closed_by_name ?? undefined,
  };
}

export async function fetchAlerts(): Promise<ComplianceAlert[]> {
  const me = await uid();
  const { data, error } = await db.from("compliance_alerts")
    .select("*, profiles(full_name, email, business_name)")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data as AlertRow[]).map((r) => toAlert(r, me));
}

/** Lance l'analyse tout de suite : règles CANAFE, comportements inhabituels, sanctions (elle tourne aussi toutes les 10 min). */
export async function runScan(): Promise<number> {
  const { data, error } = await db.rpc("compliance_scan_all");
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

export interface SanctionListStatus { source: "canada" | "onu" | "ofac_wallets"; entries: number; checkedAt: string; ok: boolean }

/** Dernière vérification de chaque liste de sanctions (téléchargées chaque jour). */
export async function fetchSanctionStatus(): Promise<SanctionListStatus[]> {
  const { data, error } = await db.from("compliance_sanction_lists")
    .select("source, status, entries, loaded_at, fetched_at")
    .order("id", { ascending: false })
    .limit(30);
  if (error) return [];
  const rows = data as { source: SanctionListStatus["source"]; status: string; entries: number | null; loaded_at: string | null; fetched_at: string }[];
  return (["canada", "onu", "ofac_wallets"] as const).flatMap((source) => {
    const latest = rows.find((r) => r.source === source && r.status !== "pending");
    const loaded = rows.find((r) => r.source === source && r.status === "loaded");
    if (!latest) return [];
    return [{ source, entries: loaded?.entries ?? 0, checkedAt: latest.loaded_at ?? latest.fetched_at, ok: latest.status !== "error" }];
  });
}

export async function takeAlert(id: string): Promise<void> {
  const { error } = await db.from("compliance_alerts")
    .update({ status: "en_cours", assigned_to: await uid() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function classifyAlert(id: string, reason: string, notes: string): Promise<void> {
  const { error } = await db.from("compliance_alerts")
    .update({ status: "classe", classification: reason, notes, closed_by: await uid(), closed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function markAlertDeclared(id: string): Promise<void> {
  const { error } = await db.from("compliance_alerts")
    .update({ status: "declare", closed_by: await uid(), closed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export interface ManualAlertInput {
  type: AlertType;
  userId: string | null;
  orderId: string | null;
  amount: number;
  reason: string;
}

export async function createManualAlert(input: ManualAlertInput): Promise<ComplianceAlert> {
  const me = await uid();
  const { data, error } = await db.from("compliance_alerts")
    .insert({
      type: input.type,
      source: "manuel",
      user_id: input.userId,
      order_id: input.orderId,
      order_ids: input.orderId ? [input.orderId] : [],
      amount_cad: input.amount,
      reason: input.reason,
      status: "en_cours",
      assigned_to: me,
      created_by: me,
    })
    .select("*, profiles(full_name, email, business_name)")
    .single();
  if (error) throw new Error(error.message);
  return toAlert(data as AlertRow, me);
}

/** Recherche d'un client par courriel (création d'alerte manuelle). */
export async function findClientByEmail(email: string): Promise<{ id: string; name: string; email: string } | null> {
  const { data } = await supabase.from("profiles")
    .select("id, full_name, email, business_name")
    .ilike("email", email.trim())
    .maybeSingle();
  if (!data) return null;
  return { id: data.id, name: nameOf(data), email: data.email ?? email };
}

// ─────────────── Déclarations ───────────────

interface DeclRow {
  id: string; ref: string; type: DeclarationType; alert_id: string | null; user_id: string | null;
  client_name: string; amount_cad: number | string; form_data: DeclarationFormData | Record<string, never>;
  status: DeclarationStatus; due_date: string | null; submitted_at: string | null; canafe_ref: string | null;
  created_at: string;
  compliance_alerts: { ref: string } | null;
}

function toDecl(r: DeclRow): ComplianceDeclaration {
  const fd = r.form_data && "type" in r.form_data ? (r.form_data as DeclarationFormData) : undefined;
  return {
    id: r.id,
    ref: r.ref,
    type: r.type,
    alertId: r.alert_id ?? undefined,
    alertRef: r.compliance_alerts?.ref,
    userId: r.user_id ?? undefined,
    clientName: r.client_name,
    amount: Number(r.amount_cad),
    createdAt: day(r.created_at)!,
    dueDate: r.due_date ?? undefined,
    submittedAt: day(r.submitted_at),
    status: r.status,
    canafRef: r.canafe_ref ?? undefined,
    formData: fd,
  };
}

const DECL_SELECT = "*, compliance_alerts(ref)";

export async function fetchDeclarations(): Promise<ComplianceDeclaration[]> {
  const { data, error } = await db.from("compliance_declarations")
    .select(DECL_SELECT)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data as DeclRow[]).map(toDecl);
}

export interface SaveDeclarationInput {
  id?: string;
  alertId?: string;
  userId?: string;
  form: DeclarationFormData;
  status: DeclarationStatus;
  dueDate?: string;
  canafeRef?: string;
}

export async function saveDeclaration(input: SaveDeclarationInput): Promise<ComplianceDeclaration> {
  const me = await uid();
  const row: Record<string, unknown> = {
    type: input.form.type,
    client_name: input.form.clientName,
    amount_cad: Number(String(input.form.amountCad).replace(/\s/g, "").replace(",", ".")) || 0,
    form_data: input.form,
    status: input.status,
    due_date: input.dueDate ?? null,
    canafe_ref: input.canafeRef?.trim() || null,
    updated_by: me,
  };
  if (input.status === "soumise") row.submitted_at = new Date().toISOString();

  const q = input.id
    ? db.from("compliance_declarations").update(row).eq("id", input.id)
    : db.from("compliance_declarations").insert({
        ...row, alert_id: input.alertId ?? null, user_id: input.userId ?? null, created_by: me,
      });
  const { data, error } = await q.select(DECL_SELECT).single();
  if (error) throw new Error(error.message);
  return toDecl(data as DeclRow);
}

export async function updateDeclarationStatus(
  id: string, status: DeclarationStatus, canafeRef?: string,
): Promise<ComplianceDeclaration> {
  const row: Record<string, unknown> = { status, updated_by: await uid() };
  if (canafeRef !== undefined) row.canafe_ref = canafeRef.trim() || null;
  if (status === "soumise") row.submitted_at = new Date().toISOString();
  const { data, error } = await db.from("compliance_declarations").update(row).eq("id", id).select(DECL_SELECT).single();
  if (error) throw new Error(error.message);
  return toDecl(data as DeclRow);
}

// ─────────────── Programme ───────────────

interface ChecklistRow {
  id: string; position: number; category: string; label: string; description: string;
  frequency: string | null; due_date: string | null; done: boolean; done_at: string | null;
  done_by: string | null; evidence: string | null;
}

export async function fetchChecklist(): Promise<ChecklistItem[]> {
  const { data, error } = await db.from("compliance_checklist").select("*").order("position");
  if (error) throw new Error(error.message);
  return (data as ChecklistRow[]).map((r) => ({
    id: r.id, category: r.category, label: r.label, description: r.description,
    done: r.done, dueDate: r.due_date ?? undefined, frequency: r.frequency ?? undefined,
    doneAt: day(r.done_at), evidence: r.evidence ?? undefined,
  }));
}

export async function setChecklistItem(id: string, changes: { done?: boolean; evidence?: string }): Promise<void> {
  const row: Record<string, unknown> = {};
  if (changes.done !== undefined) {
    row.done = changes.done;
    row.done_at = changes.done ? new Date().toISOString() : null;
    row.done_by = changes.done ? await uid() : null;
  }
  if (changes.evidence !== undefined) row.evidence = changes.evidence.trim() || null;
  const { error } = await db.from("compliance_checklist").update(row).eq("id", id);
  if (error) throw new Error(error.message);
}

// ─────────────── Registre ───────────────

export type RegisterKind = "operations" | "identites" | "interac" | "envois" | "declarations" | "alertes";

export interface RegisterStats {
  operations: number;
  operations_1000: number;
  identites: number;
  identites_ok: number;
  entreprises: number;
  interac: number;
  envois: number;
  declarations: number;
  alertes: number;
  journal: number;
  plus_ancien: string | null;
}

export async function fetchRegisterStats(): Promise<RegisterStats> {
  const { data, error } = await db.rpc("compliance_register_stats");
  if (error) throw new Error(error.message);
  return data as RegisterStats;
}

const csvCell = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Télécharge un registre : en PDF (lisible partout, téléphone compris, et
 * imprimable) ou en CSV (séparateur « ; » et BOM UTF-8 : s'ouvre directement
 * dans Excel en français). Renvoie le nombre de lignes.
 */
export async function downloadRegister(kind: RegisterKind, from?: string, to?: string, format: "pdf" | "detail" | "csv" = "pdf"): Promise<number> {
  const { data, error } = await db.rpc("compliance_register", {
    _kind: kind,
    _from: from ? new Date(`${from}T00:00:00`).toISOString() : null,
    _to: to ? new Date(`${to}T23:59:59.999`).toISOString() : null,
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Record<string, unknown>[];
  if (format !== "csv") {
    // Deux documents séparés : le registre (synthèse et index) et le détail des entrées (une fiche par entrée).
    const [{ downloadRegisterPdf }, { RECORD_RETENTION_YEARS }] = await Promise.all([import("@/lib/registerPdf"), import("@/lib/compliance")]);
    await downloadRegisterPdf({ kind, rows, from, to, retentionYears: RECORD_RETENTION_YEARS, part: format === "detail" ? "detail" : "index" });
    return rows.length;
  }
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const lines = [cols.join(";"), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(";"))];
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ooble-registre-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return rows.length;
}

/**
 * Registre d'un client : ses opérations, vérifications d'identité et alertes, chacune avec
 * l'index et le détail dans un même PDF (le volume d'un seul client reste raisonnable).
 */
export async function downloadClientRegister(userId: string, clientName: string): Promise<number> {
  const kinds: RegisterKind[] = ["operations", "identites", "alertes"];
  const results = await Promise.all(kinds.map(async (k) => {
    const { data, error } = await db.rpc("compliance_register_client", { _user: userId, _kind: k });
    if (error) throw new Error(error.message);
    return [k, (data ?? []) as Record<string, unknown>[]] as const;
  }));
  const [{ buildClientRegisterPdf, registerFileName }, { RECORD_RETENTION_YEARS }] = await Promise.all([import("@/lib/registerPdf"), import("@/lib/compliance")]);
  const label: Record<string, string> = { operations: "Opérations", identites: "Vérifications d'identité", alertes: "Alertes" };
  const bytes = await buildClientRegisterPdf(clientName, results.map(([k, rows]) => ({ kind: k, rows, heading: label[k] })), RECORD_RETENTION_YEARS);
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url; a.download = registerFileName("operations", "both", `client-${clientName}`).replace("registre-operations", "registre");
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return results.reduce((n, [, rows]) => n + rows.length, 0);
}
