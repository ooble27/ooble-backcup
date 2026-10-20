import type { AssetId, DbNet, NetworkSwitches } from "@/lib/settings";
import { assetOnNetwork } from "@/lib/assets";

/** Réseaux sur lesquels recevoir/envoyer des USDT ou USDC (voir lib/assets : l'USDC n'est pas partout). */
export type NetId = "trx" | "bnb" | "eth" | "matic" | "sol" | "avax";

export interface Network {
  id: NetId;
  name: string;
  tag: string;
  /** Retiré : plus proposé pour un nouvel ordre, gardé pour afficher les anciens. */
  retired?: true;
}

export const NETWORKS: Network[] = [
  { id: "trx", name: "Tron", tag: "TRC20" },
  { id: "bnb", name: "BNB Chain", tag: "BEP20" },
  { id: "eth", name: "Ethereum", tag: "ERC20", retired: true },
  { id: "matic", name: "Polygon", tag: "Polygon" },
  { id: "sol", name: "Solana", tag: "SOL" },
  { id: "avax", name: "Avalanche", tag: "C-Chain", retired: true },
];

/** Réseaux proposés par défaut, avant la lecture des réglages (pages publiques pré-rendues). */
export const ORDER_NETWORKS: Network[] = NETWORKS.filter((n) => !n.retired);

/** Identifiant du réseau en base. */
export const NET_DB: Record<NetId, DbNet> = { trx: "trc20", bnb: "bep20", eth: "erc20", matic: "polygon", sol: "spl", avax: "avalanche" };

/**
 * Réseaux ouverts, d'après Back-office › Réglages › Réseaux : pour un sens (achat, vente),
 * ou ouverts dans au moins un sens. La base refuse aussi une commande sur un réseau fermé.
 */
export function openNetworks(switches: NetworkSwitches, side?: "buy" | "sell", asset?: AssetId): Network[] {
  return NETWORKS.filter((n) => {
    // L'USDC n'existe pas sur tous les réseaux (pas sur Tron).
    if (asset && !assetOnNetwork(asset, n.id)) return false;
    const sw = switches[NET_DB[n.id]];
    return side ? !!sw?.[side] : !!(sw?.buy || sw?.sell);
  });
}
