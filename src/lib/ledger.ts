import { supabase } from "@/integrations/supabase/client";
import { fetchCached, peek } from "@/lib/adminCache";

/**
 * Trésorerie et comptabilité de stock : le stock d'USDT relevé sur la blockchain (treasury_overview),
 * les recharges chez les fournisseurs, les dépenses et le bénéfice net au coût moyen pondéré
 * (accounting_pnl). Rien ne s'efface : une écriture se corrige en l'annulant, avec sa raison.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (fn: string, args: Record<string, unknown> = {}) => (supabase.rpc as any)(fn, args) as Promise<{ data: unknown; error: { message: string } | null }>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (name: string) => (supabase.from as any)(name);
const num = (v: unknown) => Number(v ?? 0);
const numOrNull = (v: unknown) => (v == null ? null : Number(v));

/* ─── Trésorerie ─── */
export interface StockRow {
  network: string; address: string | null; usdt: number | null; gas: number | null; gasSymbol: string | null; minGas: number | null; takenAt: string | null;
  reserved: number; reservedN: number; available: number | null; threshold: number; alertEnabled: boolean; lastAlertAt: string | null;
  history: { day: string; usdt: number }[];
}
const toStock = (r: Record<string, unknown>): StockRow => ({
  network: String(r.network), address: (r.address as string) ?? null, usdt: numOrNull(r.usdt), gas: numOrNull(r.gas), gasSymbol: (r.gas_symbol as string) ?? null,
  minGas: numOrNull(r.min_gas), takenAt: (r.taken_at as string) ?? null, reserved: num(r.reserved), reservedN: num(r.reserved_n), available: numOrNull(r.available),
  threshold: num(r.threshold), alertEnabled: !!r.alert_enabled, lastAlertAt: (r.last_alert_at as string) ?? null,
  history: ((r.history as { day: string; usdt: unknown }[]) ?? []).map((p) => ({ day: p.day, usdt: num(p.usdt) })),
});
export const peekTreasury = () => peek<StockRow[]>("treasury.overview")?.value ?? null;
export const loadTreasury = () => fetchCached("treasury.overview", async () => {
  const { data, error } = await rpc("treasury_overview");
  if (error) throw new Error(error.message);
  return ((data as Record<string, unknown>[]) ?? []).map(toStock);
}, { persist: true });
export async function setThreshold(network: string, threshold: number, enabled: boolean) {
  const { error } = await rpc("treasury_set_threshold", { _network: network, _threshold: threshold, _enabled: enabled });
  return error ? { error: error.message } : {};
}

/* ─── Bénéfice net ─── */
export interface PnlMonth { month: string; revenue: number; cogs: number; gross: number; expenses: number; net: number; n: number }
export interface Pnl {
  revenue: number; cogs: number; gross: number; expenses: number; net: number; expensesBy: Record<string, number>; uncovered: number;
  purchasesCad: number; sellsCad: number; stock: { usdt: number; cost: number; unit: number | null; market: number | null; mid: number | null }; months: PnlMonth[];
}
const toPnl = (d: Record<string, unknown>): Pnl => {
  const s = (d.stock ?? {}) as Record<string, unknown>;
  return {
    revenue: num(d.revenue), cogs: num(d.cogs), gross: num(d.gross), expenses: num(d.expenses), net: num(d.net), uncovered: num(d.uncovered),
    expensesBy: Object.fromEntries(Object.entries((d.expenses_by ?? {}) as Record<string, unknown>).map(([k, v]) => [k, num(v)])),
    purchasesCad: num(d.purchases_cad), sellsCad: num(d.sells_cad),
    stock: { usdt: num(s.usdt), cost: num(s.cost), unit: numOrNull(s.unit), market: numOrNull(s.market), mid: numOrNull(s.mid) },
    months: ((d.months as Record<string, unknown>[]) ?? []).map((m) => ({ month: String(m.month), revenue: num(m.revenue), cogs: num(m.cogs), gross: num(m.gross), expenses: num(m.expenses), net: num(m.net), n: num(m.n) })),
  };
};
const pKey = (from: string, to: string) => `acct.pnl.${from}.${to}`;
export const peekPnl = (from: string, to: string) => peek<Pnl>(pKey(from, to))?.value ?? null;
export const loadPnl = (from: string, to: string) => fetchCached(pKey(from, to), async () => {
  const { data, error } = await rpc("accounting_pnl", { _from: from, _to: to });
  if (error) throw new Error(error.message);
  return toPnl((data ?? {}) as Record<string, unknown>);
}, { persist: true });

/* ─── Recharges et dépenses ─── */
export const EXPENSE_CATS: { v: string; label: string }[] = [
  { v: "gas", label: "Gaz de réseau" }, { v: "supplier", label: "Fournisseur" }, { v: "bank", label: "Banque et Interac" },
  { v: "software", label: "Logiciels" }, { v: "marketing", label: "Marketing" }, { v: "professional", label: "Honoraires" },
  { v: "salary", label: "Salaires" }, { v: "other", label: "Autre" },
];
export const catLabel = (v: string) => EXPENSE_CATS.find((c) => c.v === v)?.label ?? v;

export interface Purchase {
  id: string; kind: "purchase" | "opening"; at: string; supplier: string; network: string; usdt: number; cad: number; fee: number;
  tx: string | null; note: string | null; receipt: string | null; voided: boolean; voidReason: string | null; by: string | null;
}
export interface Expense {
  id: string; on: string; category: string; label: string; amount: number; tax: number; recurring: boolean; auto: boolean;
  receipt: string | null; note: string | null; voided: boolean; voidReason: string | null; by: string | null;
}
const toPurchase = (r: Record<string, unknown>): Purchase => ({
  id: String(r.id), kind: r.kind as Purchase["kind"], at: String(r.purchased_at), supplier: String(r.supplier), network: String(r.network),
  usdt: num(r.usdt), cad: num(r.cad), fee: num(r.fee_cad), tx: (r.tx_hash as string) ?? null, note: (r.note as string) ?? null,
  receipt: (r.receipt_path as string) ?? null, voided: !!r.voided, voidReason: (r.void_reason as string) ?? null, by: (r.created_by_name as string) ?? null,
});
const toExpense = (r: Record<string, unknown>): Expense => ({
  id: String(r.id), on: String(r.spent_on), category: String(r.category), label: String(r.label), amount: num(r.amount_cad), tax: num(r.tax_cad),
  recurring: !!r.recurring, auto: !!r.source_id, receipt: (r.receipt_path as string) ?? null, note: (r.note as string) ?? null,
  voided: !!r.voided, voidReason: (r.void_reason as string) ?? null, by: (r.created_by_name as string) ?? null,
});

export async function listPurchases(from: string, to: string): Promise<Purchase[]> {
  const { data, error } = await table("supplier_purchases").select("*").gte("purchased_at", from).lt("purchased_at", to).order("purchased_at", { ascending: false }).limit(2000);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(toPurchase);
}
export async function listExpenses(from: string, to: string): Promise<Expense[]> {
  const d = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  const { data, error } = await table("expenses").select("*").gte("spent_on", d(from)).lt("spent_on", d(to)).order("spent_on", { ascending: false }).limit(2000);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(toExpense);
}

/** Dépose un justificatif (PDF ou image, 10 Mo au plus) dans le stockage privé ; renvoie son chemin. */
export async function uploadReceipt(file: File, kind: "purchases" | "expenses"): Promise<string> {
  if (file.size > 10 * 1024 * 1024) throw new Error("Justificatif trop lourd (10 Mo au plus).");
  if (!/^(image\/|application\/pdf)/.test(file.type)) throw new Error("Justificatif : PDF ou image seulement.");
  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
  const path = `${kind}/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("accounting").upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}
/** Lien temporaire (5 minutes) pour ouvrir un justificatif. */
export async function receiptUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("accounting").createSignedUrl(path, 300);
  if (error || !data) throw new Error(error?.message ?? "Justificatif introuvable.");
  return data.signedUrl;
}

export async function addPurchase(p: { kind: "purchase" | "opening"; at: string; supplier: string; network: string; usdt: number; cad: number; fee: number; tx?: string; note?: string; receipt?: string | null }) {
  const { error } = await table("supplier_purchases").insert({
    kind: p.kind, purchased_at: p.at, supplier: p.supplier.trim(), network: p.network, usdt: p.usdt, cad: p.cad, fee_cad: p.fee,
    tx_hash: p.tx?.trim() || null, note: p.note?.trim() || null, receipt_path: p.receipt ?? null,
  });
  return error ? { error: error.message } : {};
}
export async function addExpense(e: { on: string; category: string; label: string; amount: number; tax: number; recurring: boolean; note?: string; receipt?: string | null }) {
  const { error } = await table("expenses").insert({
    spent_on: e.on, category: e.category, label: e.label.trim(), amount_cad: e.amount, tax_cad: e.tax, recurring: e.recurring,
    note: e.note?.trim() || null, receipt_path: e.receipt ?? null,
  });
  return error ? { error: error.message } : {};
}
export async function voidEntry(kind: "purchases" | "expenses", id: string, reason: string) {
  const { error } = await table(kind === "purchases" ? "supplier_purchases" : "expenses").update({ voided: true, void_reason: reason.trim() }).eq("id", id);
  return error ? { error: error.message } : {};
}
export async function stopRecurring(id: string) {
  const { error } = await table("expenses").update({ recurring: false }).eq("id", id);
  return error ? { error: error.message } : {};
}
