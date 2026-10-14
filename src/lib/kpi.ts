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
import { fetchAll } from "@/lib/fetchAll";

// Fonctions de calcul de la base (sommes et comptes) : le tableau de bord ne télécharge plus les commandes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (fn: string, args: Record<string, unknown>) => (supabase.rpc as any)(fn, args) as Promise<{ data: unknown; error: { message: string } | null }>;
type Total = { current: boolean; side: "buy" | "sell"; n: number; cad: number; usdt: number };
async function orderTotals(since: string, split: string, statuses: readonly string[]): Promise<Total[] | null> {
  const { data, error } = await rpc("admin_order_totals", { _since: since, _split: split, _statuses: statuses });
  return error ? null : ((data ?? []) as Total[]);
}
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

/** Volume sur `periodDays` derniers jours + période précédente équivalente. */
export async function getVolumeMetrics({ periodDays }: { periodDays: number }): Promise<VolumeMetrics> {
  const now = new Date();
  const startCurrent = new Date(now.getTime() - periodDays * DAY_MS).toISOString();
  const startPrev = new Date(now.getTime() - 2 * periodDays * DAY_MS).toISOString();

  const totals = await orderTotals(startPrev, startCurrent, ACTIVE_STATUSES);
  if (!totals) {
    return {
      period: emptySlice(),
      previous: emptySlice(),
      totalCad: 0, totalUsdt: 0, count: 0, changePct: null,
    };
  }
  const slice = (current: boolean) => {
    const out = emptySlice();
    for (const t of totals.filter((x) => x.current === current)) {
      if (t.side === "buy") { out.buyCad += Number(t.cad); out.buyUsdt += Number(t.usdt); out.buyCount += Number(t.n); }
      else { out.sellCad += Number(t.cad); out.sellUsdt += Number(t.usdt); out.sellCount += Number(t.n); }
    }
    return out;
  };
  const cur = { length: totals.filter((x) => x.current).reduce((n, x) => n + Number(x.n), 0) };

  const period = slice(true);
  const previous = slice(false);
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

  const totals = await orderTotals(startPrev, startCurrent, REVENUE_STATUSES);
  if (!totals) {
    return { marginCad: 0, previousMarginCad: 0, changePct: null, completedCount: 0 };
  }
  const curVolume = totals.filter((t) => t.current).reduce((n, t) => n + Number(t.cad), 0);
  const prevVolume = totals.filter((t) => !t.current).reduce((n, t) => n + Number(t.cad), 0);
  const curCount = totals.filter((t) => t.current).reduce((n, t) => n + Number(t.n), 0);

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
  // Un comptage exact par état (sans charger les commandes) : juste à n'importe quel volume.
  const counts = zeroStatuses();
  await Promise.all((Object.keys(counts) as DbStatus[]).map(async (st) => {
    const { count } = await supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", st);
    counts[st] = count ?? 0;
  }));
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

  const [totalRes, verifiedRes, funnelRes] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("kyc_status", "approved" as DbKycStatus),
    rpc("admin_customer_funnel", { _active_since: start30 }),
  ]);

  const total = totalRes.count ?? 0;
  const verified = verifiedRes.count ?? 0;

  const f = (funnelRes.data ?? {}) as { first_order?: number; repeat?: number; active?: number };
  const firstOrder = Number(f.first_order ?? 0);
  const repeat = Number(f.repeat ?? 0);
  const active30d = Number(f.active ?? 0);

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
  const data = await fetchAll<{ type: string }>((a, b) => supabase
    .from("compliance_alerts")
    .select("type")
    .in("status", ["nouveau", "en_cours"])
    .order("id")
    .range(a, b)).catch(() => []);
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

  const { data, error } = await rpc("admin_order_daily", { _since: start, _statuses: ACTIVE_STATUSES });

  // Prépare les N buckets même si aucune donnée — évite les creux invisibles.
  const buckets: Map<string, DailyVolumePoint> = new Map();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY_MS);
    const key = isoDay(d);
    buckets.set(key, { date: key, buyCad: 0, sellCad: 0, totalCad: 0 });
  }

  if (!error && data) {
    for (const r of data as { side: DbSide; cad: number; day: string }[]) {
      const key = r.day;
      const b = buckets.get(key);
      if (!b) continue;
      const v = Number(r.cad) || 0;
      if (r.side === "buy") b.buyCad += v;
      else b.sellCad += v;
      b.totalCad += v;
    }
  }

  return Array.from(buckets.values());
}
