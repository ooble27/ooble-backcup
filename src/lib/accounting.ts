import { supabase } from "@/integrations/supabase/client";
import { fetchCached, peek } from "@/lib/adminCache";
import { orderRef } from "@/lib/orders";

/**
 * Comptabilité réelle, calculée par la base (admin_accounting_summary / admin_accounting_orders) :
 * la marge de chaque commande terminée est l'écart entre le taux appliqué au client et le taux du
 * marché au moment de la commande (milieu entre prix d'achat et de vente relevés).
 * Les frais de réseau payés à l'envoi des USDT ne sont pas encore enregistrés : ils n'y figurent pas.
 */

export interface AcctTotals { n: number; n_buy: number; n_sell: number; volume: number; vol_buy: number; vol_sell: number; usdt: number; margin: number; fees: number; unpriced: number }
export interface AcctMonth { month: string; n: number; n_buy: number; n_sell: number; vol_buy: number; vol_sell: number; usdt: number; margin: number; fees: number }
export interface AcctNetwork { network: string; n: number; usdt: number; volume: number; margin: number }
export interface AcctSummary { totals: AcctTotals; months: AcctMonth[]; networks: AcctNetwork[] }
export interface AcctOrder { id: string; side: "buy" | "sell"; network: string; cad: number; usdt: number; rate: number; mid: number | null; fee: number; margin: number | null; created_at: string; client: string | null }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (fn: string, args: Record<string, unknown>) => (supabase.rpc as any)(fn, args) as Promise<{ data: unknown; error: { message: string } | null }>;

export type Period = "month" | "last" | "quarter" | "year" | "all";
export const PERIODS: { id: Period; label: string }[] = [
  { id: "month", label: "Ce mois" }, { id: "last", label: "Mois dernier" }, { id: "quarter", label: "3 derniers mois" },
  { id: "year", label: "Cette année" }, { id: "all", label: "Depuis le début" },
];

export function periodRange(p: Period, now = new Date()): { from: string; to: string } {
  const y = now.getFullYear(), m = now.getMonth();
  const d = (yy: number, mm: number) => new Date(yy, mm, 1).toISOString();
  const end = d(y, m + 1);
  if (p === "month") return { from: d(y, m), to: end };
  if (p === "last") return { from: d(y, m - 1), to: d(y, m) };
  if (p === "quarter") return { from: d(y, m - 2), to: end };
  if (p === "year") return { from: d(y, 0), to: end };
  return { from: "2020-01-01T00:00:00Z", to: end };
}

/** Bornes d'un mois « AAAA-MM » (heure locale). */
export function monthRange(key: string): { from: string; to: string } {
  const [y, m] = key.split("-").map(Number);
  return { from: new Date(y, m - 1, 1).toISOString(), to: new Date(y, m, 1).toISOString() };
}

const num = (v: unknown) => Number(v ?? 0);
function normSummary(raw: unknown): AcctSummary {
  const r = (raw ?? {}) as { totals?: Record<string, unknown>; months?: Record<string, unknown>[]; networks?: Record<string, unknown>[] };
  const t = r.totals ?? {};
  return {
    totals: { n: num(t.n), n_buy: num(t.n_buy), n_sell: num(t.n_sell), volume: num(t.volume), vol_buy: num(t.vol_buy), vol_sell: num(t.vol_sell), usdt: num(t.usdt), margin: num(t.margin), fees: num(t.fees), unpriced: num(t.unpriced) },
    months: (r.months ?? []).map((m) => ({ month: String(m.month), n: num(m.n), n_buy: num(m.n_buy), n_sell: num(m.n_sell), vol_buy: num(m.vol_buy), vol_sell: num(m.vol_sell), usdt: num(m.usdt), margin: num(m.margin), fees: num(m.fees) })),
    networks: (r.networks ?? []).map((n) => ({ network: String(n.network), n: num(n.n), usdt: num(n.usdt), volume: num(n.volume), margin: num(n.margin) })),
  };
}

const sKey = (from: string, to: string) => `acct.summary.${from}.${to}`;
/** Résumé d'une période : affiché tout de suite s'il est connu, puis rafraîchi. Sans données personnelles. */
export const peekSummary = (from: string, to: string) => peek<AcctSummary>(sKey(from, to))?.value ?? null;
export const loadSummary = (from: string, to: string) => fetchCached(sKey(from, to), async () => {
  const { data, error } = await rpc("admin_accounting_summary", { _from: from, _to: to });
  if (error) throw new Error(error.message);
  return normSummary(data);
}, { persist: true });

const oKey = (from: string, to: string, page: number) => `acct.orders.${from}.${to}.${page}`;
export const peekOrders = (from: string, to: string, page: number) => peek<{ total: number; rows: AcctOrder[] }>(oKey(from, to, page))?.value ?? null;
/** Une page de commandes (20). En mémoire seulement : contient des noms de clients. */
export const loadOrders = (from: string, to: string, page: number, size = 20) => fetchCached(oKey(from, to, page), async () => {
  const { data, error } = await rpc("admin_accounting_orders", { _from: from, _to: to, _limit: size, _offset: page * size });
  if (error) throw new Error(error.message);
  const d = (data ?? {}) as { total?: number; rows?: Record<string, unknown>[] };
  return {
    total: num(d.total),
    rows: (d.rows ?? []).map((o) => ({
      id: String(o.id), side: o.side as "buy" | "sell", network: String(o.network), cad: num(o.cad), usdt: num(o.usdt), rate: num(o.rate),
      mid: o.mid == null ? null : num(o.mid), fee: num(o.fee), margin: o.margin == null ? null : num(o.margin), created_at: String(o.created_at), client: (o.client as string | null) ?? null,
    })),
  };
});

/** Export pour le comptable : toutes les commandes terminées de la période, une ligne chacune. */
export async function exportAccountingCsv(from: string, to: string, name: string) {
  const all: AcctOrder[] = [];
  for (let page = 0; page < 100; page++) {
    const { data, error } = await rpc("admin_accounting_orders", { _from: from, _to: to, _limit: 2000, _offset: page * 2000 });
    if (error) throw new Error(error.message);
    const rows = ((data as { rows?: Record<string, unknown>[] })?.rows ?? []);
    all.push(...rows.map((o) => ({ id: String(o.id), side: o.side as "buy" | "sell", network: String(o.network), cad: num(o.cad), usdt: num(o.usdt), rate: num(o.rate), mid: o.mid == null ? null : num(o.mid), fee: num(o.fee), margin: o.margin == null ? null : num(o.margin), created_at: String(o.created_at), client: (o.client as string | null) ?? null })));
    if (rows.length < 2000) break;
  }
  const head = ["Date", "Référence", "Client", "Opération", "Réseau", "Montant CAD", "USDT", "Taux appliqué", "Taux du marché", "Marge CAD", "Frais facturés CAD"];
  const cell = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = all.map((o) => [
    new Date(o.created_at).toLocaleString("fr-CA"), orderRef(o.id), o.client ?? "", o.side === "buy" ? "Achat" : "Vente", NET_NAME[o.network] ?? o.network,
    o.cad.toFixed(2), o.usdt.toFixed(6), o.rate.toFixed(4), o.mid == null ? "" : o.mid.toFixed(4), o.margin == null ? "" : o.margin.toFixed(2), o.fee.toFixed(2),
  ].map((v) => cell(String(v))).join(";"));
  const url = URL.createObjectURL(new Blob(["﻿" + [head.join(";"), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `ooble-comptabilite-${name}.csv` });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return all.length;
}

export const NET_NAME: Record<string, string> = { trc20: "Tron", bep20: "BNB Chain", polygon: "Polygon", spl: "Solana", erc20: "Ethereum", avalanche: "Avalanche" };
export const NET_LOGO: Record<string, string> = { trc20: "trx", bep20: "bnb", polygon: "matic", spl: "sol", erc20: "eth", avalanche: "avax" };
export const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString("fr-CA", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
