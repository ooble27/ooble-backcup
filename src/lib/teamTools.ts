/**
 * Outils de l'équipe (Ressources › Outils). Les recherches passent par des fonctions de la base
 * réservées à l'équipe (tool_*) ; le taux officiel de la Banque du Canada, par la fonction admin-tools.
 */
import { supabase } from "@/integrations/supabase/client";

// Ces fonctions et la table team_day_checks ne sont pas encore dans les types générés.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/* ─── Reconnaître une adresse ou un hash d'après son format ─── */
export type Family = "evm" | "tron" | "solana";
export function addressFamily(a: string): Family | null {
  const s = a.trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(s)) return "evm";
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(s)) return "tron";
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s)) return "solana";
  return null;
}
export function hashFamily(h: string): Family | null {
  const s = h.trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(s)) return "evm";
  if (/^[0-9a-fA-F]{64}$/.test(s)) return "tron";
  if (/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(s)) return "solana";
  return null;
}
/** Réseaux de chaque famille, et leurs explorateurs publics. */
export const FAMILY_NETS: Record<Family, { id: string; name: string; tx: string; addr: string }[]> = {
  evm: [
    { id: "bep20", name: "BNB Chain", tx: "https://bscscan.com/tx/", addr: "https://bscscan.com/address/" },
    { id: "polygon", name: "Polygon", tx: "https://polygonscan.com/tx/", addr: "https://polygonscan.com/address/" },
    { id: "avalanche", name: "Avalanche", tx: "https://snowtrace.io/tx/", addr: "https://snowtrace.io/address/" },
    { id: "erc20", name: "Ethereum", tx: "https://etherscan.io/tx/", addr: "https://etherscan.io/address/" },
  ],
  tron: [{ id: "trc20", name: "Tron", tx: "https://tronscan.org/#/transaction/", addr: "https://tronscan.org/#/address/" }],
  solana: [{ id: "spl", name: "Solana", tx: "https://solscan.io/tx/", addr: "https://solscan.io/account/" }],
};
export const NET_NAME: Record<string, string> = { bep20: "BNB Chain", polygon: "Polygon", avalanche: "Avalanche", erc20: "Ethereum", trc20: "Tron", spl: "Solana" };

/* ─── Recherches ─── */
export interface AddressReport {
  ooble_deposit: { family: string; active: boolean } | null;
  ooble_payout: boolean;
  clients: { user_id: string; name: string | null; email: string | null; declared: number; deposits: number; payouts: number; last_seen: string }[];
  orders: number;
  sanctioned: { network: string | null; ref: string | null }[];
}
export async function lookupAddress(a: string): Promise<AddressReport> {
  const { data, error } = await db.rpc("tool_address_lookup", { _addr: a.trim() });
  if (error) throw new Error(error.message);
  return data as AddressReport;
}

export interface TxHit { order_id: string | null; network: string; asset: string; amount: number; status: string; at?: string; to?: string; from?: string }
export interface TxReport { payouts: TxHit[]; deposits: TxHit[]; declared: TxHit[] }
export async function lookupTx(h: string): Promise<TxReport> {
  const { data, error } = await db.rpc("tool_tx_lookup", { _hash: h.trim() });
  if (error) throw new Error(error.message);
  return data as TxReport;
}

export interface Window24h { since: string; orders: { id: string; side: "buy" | "sell"; cad: number; status: string; at: string }[] }
export async function lookup24h(userId: string): Promise<Window24h> {
  const { data, error } = await db.rpc("tool_24h", { _user: userId });
  if (error) throw new Error(error.message);
  return data as Window24h;
}

export interface DayContext {
  queue: number; sells_waiting: number; interac_review: number; payouts_review: number; alerts_open: number;
  stock: { network: string; asset: string; balance: number; gas: number; gas_symbol: string; min_gas: number }[];
}
export async function fetchDayContext(): Promise<DayContext> {
  const { data, error } = await db.rpc("tool_day_context");
  if (error) throw new Error(error.message);
  return data as DayContext;
}

/* ─── Checklist d'ouverture et de fermeture ─── */
export type DayKind = "open" | "close";
export interface DayCheck { kind: DayKind; day: string; items: { text: string; done: boolean }[]; note: string | null; byId: string; byName: string; at: string }
/** Aujourd'hui à Montréal, « AAAA-MM-JJ ». */
export const todayMontreal = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });

export async function fetchDayChecks(days = 7): Promise<DayCheck[]> {
  const since = new Date(Date.now() - days * 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  const { data, error } = await db.from("team_day_checks").select("kind, day, items, note, by_id, by_name, at").gte("day", since).order("at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    kind: r.kind as DayKind, day: String(r.day), items: (r.items ?? []) as DayCheck["items"], note: (r.note as string) ?? null,
    byId: String(r.by_id), byName: String(r.by_name), at: String(r.at),
  }));
}
export async function signDayCheck(kind: DayKind, items: DayCheck["items"], note: string, byName: string): Promise<{ error?: string }> {
  const { data: s } = await supabase.auth.getSession();
  const uid = s.session?.user?.id;
  if (!uid) return { error: "Session expirée : reconnectez-vous." };
  const { error } = await db.from("team_day_checks").insert({ kind, day: todayMontreal(), items, note: note.trim() || null, by_id: uid, by_name: byName });
  if (error) return { error: error.code === "23505" ? "Déjà signée aujourd'hui par un collègue." : error.message };
  return {};
}

/* ─── Taux officiel de la Banque du Canada ─── */
export async function fetchBocRate(date?: string): Promise<{ date: string; rate: number; asked: string }> {
  const { data, error } = await supabase.functions.invoke("admin-tools", { body: { action: "boc_rate", date } });
  if (error) throw new Error("La Banque du Canada ne répond pas pour l'instant. Réessayez dans un moment.");
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as { date: string; rate: number; asked: string };
}
