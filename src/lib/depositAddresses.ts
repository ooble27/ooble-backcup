/**
 * Adresses de dépôt d'Ooble : où les clients envoient leurs USDT quand ils vendent.
 *
 * Une adresse active par famille de réseaux (EVM : BNB Chain, Ethereum, Polygon, Avalanche · Tron · Solana),
 * changée dans Back-office › Réglages › Adresses de dépôt. La surveillance des ventes (sell-watch) lit la même
 * table, et garde un œil 7 jours sur une adresse remplacée. La dernière valeur connue est gardée sur l'appareil.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { NetId } from "@/components/app/networks";

export type AddressFamily = "evm" | "tron" | "solana";
export type DepositAddresses = Record<AddressFamily, string>;

export const FAMILY_LABEL: Record<AddressFamily, { name: string; networks: string }> = {
  evm: { name: "Réseaux EVM", networks: "BNB Chain (BEP20), Ethereum (ERC20), Polygon, Avalanche" },
  tron: { name: "Tron", networks: "TRC20" },
  solana: { name: "Solana", networks: "SPL" },
};

/** Format attendu de chaque famille (la base vérifie aussi). */
export const ADDRESS_FORMAT: Record<AddressFamily, RegExp> = {
  evm: /^0x[0-9a-fA-F]{40}$/,
  tron: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
  solana: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
};

export const familyOf = (net: NetId): AddressFamily => (net === "trx" ? "tron" : net === "sol" ? "solana" : "evm");

const KEY = "ooble.deposit";
let current: DepositAddresses | null = (() => {
  try { const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null; return raw ? JSON.parse(raw) as DepositAddresses : null; } catch { return null; }
})();

export async function fetchDepositAddresses(): Promise<DepositAddresses | null> {
  const { data } = await supabase.from("deposit_addresses").select("family, address").eq("active", true);
  if (!data?.length) return current;
  const next = Object.fromEntries(data.map((r) => [r.family, r.address])) as DepositAddresses;
  current = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* stockage indisponible */ }
  return next;
}

/** Dans un composant : les adresses actives (null tant qu'aucune n'est connue). */
export function useDepositAddresses(): DepositAddresses | null {
  const [a, setA] = useState(current);
  useEffect(() => { void fetchDepositAddresses().then(setA); }, []);
  return a;
}

export interface DepositAddressEntry { id: number; family: AddressFamily; address: string; active: boolean; addedAt: string; addedByName: string | null; retiredAt: string | null }

/** Historique complet (Réglages) : l'active et les anciennes de chaque famille. */
export async function fetchDepositAddressBook(): Promise<DepositAddressEntry[]> {
  const { data, error } = await supabase.from("deposit_addresses").select("*").order("added_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id, family: r.family as AddressFamily, address: r.address, active: r.active,
    addedAt: r.added_at, addedByName: r.added_by_name, retiredAt: r.retired_at,
  }));
}

/** Administrateurs : remplace l'adresse active d'une famille. */
export async function setDepositAddress(family: AddressFamily, address: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc("set_deposit_address", { _family: family, _address: address.trim() });
  return error ? { error: error.message } : {};
}
