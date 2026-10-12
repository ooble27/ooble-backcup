/**
 * Couche de données pour le tableau de bord KPI du back-office.
 *
 * Toutes les fonctions renvoient des données prêtes à l'affichage et effectuent
 * l'agrégation côté serveur autant que possible (filtrage par date, statut,
 * etc.) — jamais de gros dumps client-side.
 *
 * En cas d'erreur ou de table vide, on renvoie des valeurs neutres (0, [],
 * null) pour que l'UI puisse afficher des états vides sans planter.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type DbStatus = Database["public"]["Enums"]["order_status"];
type DbSide = Database["public"]["Enums"]["order_side"];
type DbKycStatus = Database["public"]["Enums"]["kyc_status"];

/** Marge appliquée sur le taux de marché (2 %). */
export const MARKUP = 0.02;

const DAY_MS = 24 * 60 * 60 * 1000;

const daysAgoIso = (days: number): string =>
  new Date(Date.now() - days * DAY_MS).toISOString();

/** Ordres à afficher comme « actifs » (comptent pour volume / marge). */
const ACTIVE_STATUSES: DbStatus[] = [
  "created",
  "awaiting_payment",
  "payment_received",
  "settling",
  "completed",
];

/** Ordres dont la marge est réellement encaissée. */
const REVENUE_STATUSES: DbStatus[] = ["completed"];

// ────────────────────────────────────────────────────────────
// Volume — CAD / USDT, buy / sell, période courante + précédente
// ────────────────────────────────────────────────────────────

export interface VolumeSlice {
  buyCad: number;
  buyUsdt: number;
  sellCad: number;
  sellUsdt: number;
  buyCount: number;
  sellCount: number;
}

export interface VolumeMetrics {
  period: VolumeSlice;
  previous: VolumeSlice;
  totalCad: number;
  totalUsdt: number;
  count: number;
  /** Variation en % du total CAD par rapport à la période précédente. null si base 0. */
  changePct: number | null;
}

const emptySlice = (): VolumeSlice => ({
  buyCad: 0, buyUsdt: 0, sellCad: 0, sellUsdt: 0, buyCount: 0, sellCount: 0,
});

type VolRow = { side: DbSide; cad_amount: number; usdt_amount: number };

function aggregate(rows: VolRow[]): VolumeSlice {
  const s = emptySlice();
  for (const r of rows) {
    const cad = Number(r.cad_amount) || 0;
    const usdt = Number(r.usdt_amount) || 0;
    if (r.side === "buy") { s.buyCad += cad; s.buyUsdt += usdt; s.buyCount++; }
    else { s.sellCad += cad; s.sellUsdt += usdt; s.sellCount++; }
  }
  return s;
}

/** Volume sur `periodDays` derniers jours + période précédente équivalente. */
export async function getVolumeMetrics({ periodDays }: { periodDays: number }): Promise<VolumeMetrics> {
  const now = new Date();
  const startCurrent = new Date(now.getTime() - periodDays * DAY_MS).toISOString();
  const startPrev = new Date(now.getTime() - 2 * periodDays * DAY_MS).toISOString();

  const { data, error } = await supabase
    .from("orders")
    .select("side, cad_amount, usdt_amount, created_at, status")
    .in("status", ACTIVE_STATUSES)
    .gte("created_at", startPrev);

  if (error || !data) {
    return {
      period: emptySlice(),
      previous: emptySlice(),
      totalCad: 0, totalUsdt: 0, count: 0, changePct: null,
    };
  }

  const cur: VolRow[] = [];
  const prev: VolRow[] = [];
  for (const r of data as (VolRow & { created_at: string })[]) {
    if (r.created_at >= startCurrent) cur.push(r);
    else prev.push(r);
  }

  const period = aggregate(cur);
  const previous = aggregate(prev);
  const totalCad = period.buyCad + period.sellCad;
  const totalUsdt = period.buyUsdt + period.sellUsdt;
  const totalPrevCad = previous.buyCad + previous.sellCad;
  const changePct = totalPrevCad > 0
    ? ((totalCad - totalPrevCad) / totalPrevCad) * 100
    : null;

  return {
    period,
    previous,
    totalCad,
    totalUsdt,
    count: cur.length,
    changePct,
  };
}

// ────────────────────────────────────────────────────────────
// Marge brute — 2 % du volume complété
// ────────────────────────────────────────────────────────────

export interface MarginMetrics {
  marginCad: number;
  previousMarginCad: number;
  changePct: number | null;
  completedCount: number;
}

export async function getMarginMetrics({ periodDays }: { periodDays: number }): Promise<MarginMetrics> {
  const now = new Date();
  const startCurrent = new Date(now.getTime() - periodDays * DAY_MS).toISOString();
  const startPrev = new Date(now.getTime() - 2 * periodDays * DAY_MS).toISOString();

  const { data, error } = await supabase
    .from("orders")
    .select("cad_amount, created_at")
    .in("status", REVENUE_STATUSES)
    .gte("created_at", startPrev);

  if (error || !data) {
    return { marginCad: 0, previousMarginCad: 0, changePct: null, completedCount: 0 };
  }

  let curVolume = 0;
  let prevVolume = 0;
  let curCount = 0;
  for (const r of data as { cad_amount: number; created_at: string }[]) {
    const v = Number(r.cad_amount) || 0;
    if (r.created_at >= startCurrent) { curVolume += v; curCount++; }
    else { prevVolume += v; }
  }

  const marginCad = curVolume * MARKUP;
  const previousMarginCad = prevVolume * MARKUP;
  const changePct = previousMarginCad > 0
    ? ((marginCad - previousMarginCad) / previousMarginCad) * 100
    : null;

  return { marginCad, previousMarginCad, changePct, completedCount: curCount };
}

// ────────────────────────────────────────────────────────────
// Statuts — comptage par état
// ────────────────────────────────────────────────────────────

export type OrderStatusCounts = Record<DbStatus, number>;

const zeroStatuses = (): OrderStatusCounts => ({
  created: 0,
  awaiting_payment: 0,
  payment_received: 0,
  settling: 0,
  completed: 0,
  cancelled: 0,
  expired: 0,
  refunded: 0,
});

export async function getOrderStatusCounts(): Promise<OrderStatusCounts> {
  const { data, error } = await supabase.from("orders").select("status");
  const counts = zeroStatuses();
  if (error || !data) return counts;
  for (const r of data as { status: DbStatus }[]) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  }
  return counts;
}

// ────────────────────────────────────────────────────────────
// Ordres nécessitant une action opérateur
// ────────────────────────────────────────────────────────────

/** Statuts qui appellent une action (traitement, versement, envoi). */
export const ACTION_STATUSES: DbStatus[] = ["payment_received", "settling"];

export async function getPendingActionsCount(): Promise<number> {
  const { count, error } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .in("status", ACTION_STATUSES);
  if (error || count == null) return 0;
  return count;
}

// ────────────────────────────────────────────────────────────
// Entonnoir clients
// ────────────────────────────────────────────────────────────

export interface CustomerFunnel {
  total: number;
  verified: number;
  firstOrder: number;
  repeat: number;
  active30d: number;
}

export async function getCustomerFunnel(): Promise<CustomerFunnel> {
  const start30 = daysAgoIso(30);

  const [totalRes, verifiedRes, ordersRes, activeRes] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("kyc_status", "approved" as DbKycStatus),
    supabase.from("orders").select("user_id"),
    supabase
      .from("orders")
      .select("user_id")
      .gte("created_at", start30),
  ]);

  const total = totalRes.count ?? 0;
  const verified = verifiedRes.count ?? 0;

  const ordersByUser = new Map<string, number>();
  for (const r of (ordersRes.data ?? []) as { user_id: string }[]) {
    ordersByUser.set(r.user_id, (ordersByUser.get(r.user_id) ?? 0) + 1);
  }
  let firstOrder = 0;
  let repeat = 0;
  for (const n of ordersByUser.values()) {
    if (n >= 1) firstOrder++;
    if (n >= 2) repeat++;
  }

  const active30d = new Set(
    ((activeRes.data ?? []) as { user_id: string }[]).map((r) => r.user_id),
  ).size;

  return { total, verified, firstOrder, repeat, active30d };
}

// ────────────────────────────────────────────────────────────
// Alertes conformité ouvertes (table compliance_alerts)
// ────────────────────────────────────────────────────────────

export interface ComplianceAlertsCount {
  open: number;
  critical: number;
}

export async function getComplianceAlertsCount(): Promise<ComplianceAlertsCount> {
  // Table récente, absente des types générés.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as unknown as { from: (t: string) => any };
  const { data } = await db
    .from("compliance_alerts")
    .select("type")
    .in("status", ["nouveau", "en_cours"]);
  const rows = (data ?? []) as { type: string }[];
  return {
    open: rows.length,
    critical: rows.filter((a) => a.type === "dot" || a.type === "sanctions").length,
  };
}

// ────────────────────────────────────────────────────────────
// Volume quotidien sur N jours (pour sparkline / graphe global)
// ────────────────────────────────────────────────────────────

export interface DailyVolumePoint {
  date: string;   // YYYY-MM-DD
  buyCad: number;
  sellCad: number;
  totalCad: number;
}

const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

export async function getDailyVolume({ days }: { days: number }): Promise<DailyVolumePoint[]> {
  const start = daysAgoIso(days);

  const { data, error } = await supabase
    .from("orders")
    .select("side, cad_amount, created_at, status")
    .in("status", ACTIVE_STATUSES)
    .gte("created_at", start);

  // Prépare les N buckets même si aucune donnée — évite les creux invisibles.
  const buckets: Map<string, DailyVolumePoint> = new Map();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY_MS);
    const key = isoDay(d);
    buckets.set(key, { date: key, buyCad: 0, sellCad: 0, totalCad: 0 });
  }

  if (!error && data) {
    for (const r of data as { side: DbSide; cad_amount: number; created_at: string }[]) {
      const key = r.created_at.slice(0, 10);
      const b = buckets.get(key);
      if (!b) continue;
      const v = Number(r.cad_amount) || 0;
      if (r.side === "buy") b.buyCad += v;
      else b.sellCad += v;
      b.totalCad += v;
    }
  }

  return Array.from(buckets.values());
}
