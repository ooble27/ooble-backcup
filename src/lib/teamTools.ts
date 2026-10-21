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

/* ─── Cours de la dernière heure, pour la courbe de la page Outils ─── */
export async function fetchRateHistory(asset: string, minutes = 60): Promise<{ at: number; market: number; buy: number }[]> {
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  const { data, error } = await supabase.from("exchange_rates").select("market_rate, buy_rate, fetched_at")
    .eq("asset", asset as "usdc").gte("fetched_at", since).order("fetched_at", { ascending: true }).limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ at: new Date(r.fetched_at).getTime(), market: Number(r.market_rate ?? r.buy_rate), buy: Number(r.buy_rate) })).sort((a, b) => a.at - b.at);
}

/* ─── Deuxième série : commande par référence, avis Interac, client sur une période, stock, marge ─── */
export interface OrderInfo {
  id: string; side: "buy" | "sell"; status: string; asset: string; network: string | null; cad: number; crypto: number; rate: number;
  fee: number | null; bonus_bps: number | null; created_at: string; updated_at: string; interac_email: string | null; is_test: boolean;
  client: { id: string; name: string | null; email: string | null; lang: string | null };
  interac: { question: string | null; answer: string | null } | null;
  market: number | null;
}
export async function lookupOrder(ref: string): Promise<OrderInfo | null> {
  const { data, error } = await db.rpc("tool_order_lookup", { _ref: ref.trim() });
  if (error) throw new Error(error.message);
  return (data ?? null) as OrderInfo | null;
}

export interface InteracHit { id: string; cad: number; status: string; created_at: string; name: string | null; email: string | null; score: number }
export async function matchInterac(amount: number | null, ref: string, name: string): Promise<InteracHit[]> {
  const { data, error } = await db.rpc("tool_interac_match", { _amount: amount, _ref: ref, _name: name });
  if (error) throw new Error(error.message);
  return (data ?? []) as InteracHit[];
}
/** Lit un avis Interac collé : montant, référence OOB-…, nom de l'expéditeur. */
export function parseInterac(text: string): { amount: number | null; ref: string; name: string } {
  const t = text.replace(/ /g, " ");
  const ref = (t.match(/OOB-?([0-9A-F]{6,8})/i)?.[1] ?? "").toLowerCase();
  const m = t.match(/(\d{1,3}(?:[ ,.]\d{3})*(?:[.,]\d{2}))\s*\$|\$\s*(\d{1,3}(?:[ ,]\d{3})*(?:\.\d{2}))/);
  let amount: number | null = null;
  if (m) {
    const raw = (m[1] ?? m[2]).replace(/\s/g, "");
    // « 1 234,56 $ » (français) ou « $1,234.56 » (anglais).
    const fr = /,\d{2}$/.test(raw);
    amount = Number(fr ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, ""));
    if (!Number.isFinite(amount)) amount = null;
  }
  const name = (t.match(/(?:de|from|par)\s*:?\s*([A-ZÀ-Ý][\p{L}'-]+(?:\s+[A-ZÀ-Ý][\p{L}'-]+){0,3})/u)?.[1]
    ?? t.match(/([A-ZÀ-Ý][\p{L}'-]+(?:\s+[A-ZÀ-Ý][\p{L}'-]+){1,3})\s+(?:vous a envoyé|sent you)/u)?.[1] ?? "").trim();
  return { amount, ref, name };
}

export interface ClientWindow {
  client: { name: string | null; email: string | null; phone: string | null; account_type: string; kyc_status: string; created_at: string;
    birth_date: string | null; occupation: string | null; address: string | null } | null;
  orders: { id: string; side: "buy" | "sell"; cad: number; crypto: number; asset: string; network: string | null; status: string; at: string; wallet: string | null; sender: string | null }[];
  alerts: { type: string; reason: string; status: string; at: string }[];
}
export async function clientWindow(userId: string, days: number): Promise<ClientWindow> {
  const { data, error } = await db.rpc("tool_client_window", { _user: userId, _days: days });
  if (error) throw new Error(error.message);
  return { client: data?.client ?? null, orders: data?.orders ?? [], alerts: data?.alerts ?? [] } as ClientWindow;
}

export interface StockLine { network: string; asset: string; balance: number; gas: number; gas_symbol: string; min_gas: number; at: string; out7: number; in7: number }
export async function stockForecast(): Promise<StockLine[]> {
  const { data, error } = await db.rpc("tool_stock_forecast");
  if (error) throw new Error(error.message);
  return (data ?? []) as StockLine[];
}

export interface MarginBase { buy: { cad: number; count: number }; sell: { cad: number; count: number }; buy_margin_pct: number; sell_margin_pct: number }
export async function marginBase(days: number): Promise<MarginBase> {
  const { data, error } = await db.rpc("tool_margin_base", { _days: days });
  if (error) throw new Error(error.message);
  if (!data?.buy || !data?.sell) throw new Error("Données indisponibles pour l'instant.");
  return data as MarginBase;
}

/* ─── Zone lisible d'un passeport (MRZ, format TD3) ─── */
const MRZ_W = [7, 3, 1];
const mrzVal = (c: string) => (c === "<" ? 0 : /\d/.test(c) ? Number(c) : c.charCodeAt(0) - 55);
export const mrzCheck = (s: string) => String([...s].reduce((a, c, i) => a + mrzVal(c) * MRZ_W[i % 3], 0) % 10);
export interface MrzResult {
  ok: boolean; lines: [string, string]; surname: string; given: string; country: string; nationality: string; number: string; birth: string; expiry: string; sex: string;
  checks: { label: string; ok: boolean }[];
}
export function readMrz(text: string): MrzResult | null {
  const rows = text.toUpperCase().replace(/[ \t]/g, "").split(/\r?\n/).map((r) => r.replace(/[^A-Z0-9<]/g, "")).filter((r) => r.length >= 30);
  if (rows.length < 2) return null;
  const l1 = rows[0].padEnd(44, "<").slice(0, 44), l2 = rows[1].padEnd(44, "<").slice(0, 44);
  if (!l1.startsWith("P")) return null;
  const [sur, giv = ""] = l1.slice(5).split("<<");
  const date = (s: string, future: boolean) => {
    const y = Number(s.slice(0, 2)), cur = new Date().getFullYear() % 100;
    const full = future ? 2000 + y : (y > cur ? 1900 + y : 2000 + y);
    return `${full}-${s.slice(2, 4)}-${s.slice(4, 6)}`;
  };
  const checks = [
    { label: "Numéro du passeport", ok: mrzCheck(l2.slice(0, 9)) === l2[9] },
    { label: "Date de naissance", ok: mrzCheck(l2.slice(13, 19)) === l2[19] },
    { label: "Date d'expiration", ok: mrzCheck(l2.slice(21, 27)) === l2[27] },
    { label: "Ligne entière", ok: mrzCheck(l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43)) === l2[43] },
  ];
  return {
    ok: checks.every((c) => c.ok), lines: [l1, l2],
    surname: sur.replace(/</g, " ").trim(), given: giv.replace(/</g, " ").trim(), country: l1.slice(2, 5).replace(/</g, ""),
    nationality: l2.slice(10, 13).replace(/</g, ""), number: l2.slice(0, 9).replace(/</g, ""),
    birth: date(l2.slice(13, 19), false), expiry: date(l2.slice(21, 27), true), sex: l2[20] === "<" ? "Non précisé" : l2[20], checks,
  };
}

/* ─── Numéros d'entreprise ─── */
/** Numéro d'entreprise fédéral (ARC) : 9 chiffres, clé de Luhn. */
export function bnValid(n: string) {
  const d = n.replace(/\D/g, "").slice(0, 9);
  if (d.length !== 9) return false;
  const s = [...d].reverse().reduce((a, c, i) => { let v = Number(c); if (i % 2) { v *= 2; if (v > 9) v -= 9; } return a + v; }, 0);
  return s % 10 === 0;
}

/* ─── Ce qui attend l'équipe (bloc « À traiter maintenant » de Mon espace) ─── */
export interface Attention {
  sells: { id: string; cad: number; status: string; at: string; name: string | null; assigned: boolean }[];
  buys: { id: string; cad: number; status: string; at: string; name: string | null }[];
  receipts: { id: string; amount: number | null; sender: string | null; reason: string | null; status: string; at: string; order_id: string | null;
    suggest: { id: string; name: string | null; cad: number; at: string } | null }[];
}
export async function fetchAttention(): Promise<Attention> {
  const { data, error } = await db.rpc("team_attention");
  if (error) throw new Error(error.message);
  return { sells: data?.sells ?? [], buys: data?.buys ?? [], receipts: data?.receipts ?? [] };
}
export async function markReceiptHandled(id: string, note: string): Promise<{ error?: string }> {
  const { error } = await db.rpc("receipt_mark_handled", { _id: id, _note: note });
  return error ? { error: error.message } : {};
}
