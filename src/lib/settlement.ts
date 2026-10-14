/**
 * Règlement automatique des achats (admin) : avis Interac lus sur
 * interac@ooble.ca, envois d'USDT depuis le portefeuille chaud et réglages.
 * Côté serveur : fonctions edge `mail-webhook` (avis) et `usdt-payout` (envois).
 */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";


export interface SettlementSettings {
  auto_payout: boolean;
  auto_payout_max_cad: number;
  daily_payout_max_usdt: number;
  require_email_auth: boolean;
  updated_at: string;
}

export interface WalletState {
  network: string;
  label: string;
  configured: boolean;
  address?: string | null;
  usdt?: number;
  gas?: number;
  gasSymbol?: string;
  minGas?: number;
  error?: string;
}

export interface InteracReceipt {
  id: string;
  received_at: string;
  sender_name: string | null;
  amount_cad: number | null;
  order_ref: string | null;
  order_id: string | null;
  interac_ref: string | null;
  status: "matched" | "unmatched" | "mismatch" | "duplicate" | "ignored";
  reason: string | null;
  authenticated: boolean;
  subject: string | null;
  body_text: string | null;
}

export interface UsdtPayout {
  id: string;
  order_id: string;
  network: string;
  to_address: string;
  usdt_amount: number;
  status: "sending" | "broadcast" | "confirmed" | "failed" | "review";
  tx_hash: string | null;
  error: string | null;
  trigger: "auto" | "staff";
  created_at: string;
}

export interface PayoutResult { ok: boolean; status?: string; hash?: string; url?: string; error?: string; review?: boolean }

const EXPLORER: Record<string, string> = {
  trc20: "https://tronscan.org/#/transaction/",
  bep20: "https://bscscan.com/tx/",
  polygon: "https://polygonscan.com/tx/",
  avalanche: "https://snowtrace.io/tx/",
  erc20: "https://etherscan.io/tx/",
};
export const txUrl = (network: string, hash: string) => (EXPLORER[network] ? EXPLORER[network] + hash : "");
export const EXPLORER_NAME: Record<string, string> = {
  trc20: "Tronscan", bep20: "BscScan", polygon: "PolygonScan", avalanche: "Snowtrace", erc20: "Etherscan",
};

/** Transaction d'envoi des USDT d'un achat (visible par le client via RLS). */
export async function fetchOutboundTx(orderId: string): Promise<{ network: string; tx_hash: string } | null> {
  const { data } = await supabase.from("blockchain_transactions").select("network, tx_hash")
    .eq("order_id", orderId).eq("direction", "outbound").order("created_at", { ascending: false }).limit(1);
  return (data?.[0] as { network: string; tx_hash: string } | undefined) ?? null;
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("usdt-payout", { body });
  if (error) return { ok: false, error: error.message } as T;
  return data as T;
}

export const sendPayout = (orderId: string) => invoke<PayoutResult>({ action: "send", order_id: orderId });
export const fetchWallets = () => invoke<{ ok: boolean; settings?: SettlementSettings; wallets?: WalletState[]; error?: string }>({ action: "status" });
export const reconcilePayouts = () => invoke<{ ok: boolean }>({ action: "reconcile" });

export async function updateSettings(patch: Partial<SettlementSettings>): Promise<{ error?: string }> {
  const { data: auth } = await supabase.auth.getSession();
  const { error } = await supabase.from("settlement_settings")
    .update({ ...patch, updated_at: new Date().toISOString(), updated_by: auth.session?.user?.id ?? null })
    .eq("id", 1);
  return error ? { error: error.message } : {};
}

export async function fetchReceipts(limit = 30): Promise<InteracReceipt[]> {
  const { data } = await supabase.from("interac_receipts").select("*").order("received_at", { ascending: false }).limit(limit);
  return (data ?? []) as InteracReceipt[];
}

export async function fetchPayouts(orderId?: string, limit = 30): Promise<UsdtPayout[]> {
  let q = supabase.from("usdt_payouts").select("*").order("created_at", { ascending: false }).limit(limit);
  if (orderId) q = q.eq("order_id", orderId);
  const { data } = await q;
  return (data ?? []) as UsdtPayout[];
}

// ─────────────── Ventes : USDT reçus sur les adresses de dépôt ───────────────

export interface ChainDeposit {
  id: string;
  network: string;
  tx_hash: string;
  from_address: string | null;
  usdt_amount: number;
  block_time: string;
  order_id: string | null;
  status: "new" | "matched" | "review" | "unmatched" | "ignored";
  reason: string | null;
}

/** Dépôts lus sur la blockchain (fonction edge `sell-watch`, toutes les 2 minutes). */
export async function fetchDeposits(opts: { orderId?: string; limit?: number } = {}): Promise<ChainDeposit[]> {
  let q = supabase.from("chain_deposits").select("id, network, tx_hash, from_address, usdt_amount, block_time, order_id, status, reason")
    .order("block_time", { ascending: false }).limit(opts.limit ?? 50);
  if (opts.orderId) q = q.eq("order_id", opts.orderId);
  const { data } = await q;
  return (data ?? []) as ChainDeposit[];
}

/** Dernière lecture réussie, par réseau. */
export async function fetchScanState(): Promise<{ network: string; updated_at: string }[]> {
  const { data } = await supabase.from("chain_scan_state").select("network, updated_at");
  return (data ?? []) as { network: string; updated_at: string }[];
}

/** Lance une lecture tout de suite (elle tourne aussi toutes les 2 minutes). */
export async function scanDeposits(): Promise<{ found?: number; matched?: number; error?: string }> {
  const { data, error } = await supabase.functions.invoke("sell-watch", { body: { action: "scan" } });
  if (error) return { error: error.message };
  return data as { found: number; matched: number };
}

export async function attachDeposit(depositId: string, orderId: string): Promise<{ error?: string }> {
  const { error } = await (supabase as unknown as { rpc: (f: string, a: Record<string, unknown>) => Promise<{ error: { message: string } | null }> })
    .rpc("attach_chain_deposit", { _deposit: depositId, _order: orderId });
  return error ? { error: error.message } : {};
}

export async function ignoreDeposit(depositId: string, reason: string): Promise<{ error?: string }> {
  const { error } = await (supabase as unknown as { rpc: (f: string, a: Record<string, unknown>) => Promise<{ error: { message: string } | null }> })
    .rpc("ignore_chain_deposit", { _deposit: depositId, _reason: reason });
  return error ? { error: error.message } : {};
}

/** Ventes en attente des USDT, pour rattacher un dépôt à la main. */
export async function fetchPendingSells(network: string): Promise<{ id: string; usdt_amount: number; created_at: string }[]> {
  const { data } = await supabase.from("orders").select("id, usdt_amount, created_at")
    .eq("side", "sell").eq("network", network as Database["public"]["Enums"]["usdt_network"]).in("status", ["created", "awaiting_payment"])
    .order("created_at", { ascending: false }).limit(20);
  return (data ?? []) as { id: string; usdt_amount: number; created_at: string }[];
}
