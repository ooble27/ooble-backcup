/**
 * Cryptomonnaies proposées : USDT (Tether) et USDC (Circle), deux dollars américains numériques.
 * Chacune s'ouvre ou se ferme dans Back-office › Réglages › Cryptomonnaies ; la base refuse une commande
 * sur un actif fermé, ou sur un réseau où il n'existe pas.
 */
import type { NetId } from "@/components/app/networks";
import type { AppSettings, AssetId } from "@/lib/settings";

export type { AssetId };

export interface AssetMeta { id: AssetId; symbol: string; name: string; issuer: string; logo: string }

export const ASSETS: AssetMeta[] = [
  { id: "usdc", symbol: "USDC", name: "USD Coin", issuer: "Circle", logo: "/coins/usdc.svg" },
  { id: "usdt", symbol: "USDT", name: "Tether USD", issuer: "Tether", logo: "/coins/usdt.svg" },
];
export const ASSET_BY_ID: Record<AssetId, AssetMeta> = Object.fromEntries(ASSETS.map((a) => [a.id, a])) as Record<AssetId, AssetMeta>;

/** Symbole affiché d'un actif (USDT par défaut pour les commandes d'avant les deux actifs). */
export const assetSymbol = (a: string | null | undefined) => ASSET_BY_ID[(a ?? "usdt") as AssetId]?.symbol ?? "USDT";

/** L'USDC émis par Circle n'existe pas sur Tron ni sur BNB Chain. */
const USDC_NETS: NetId[] = ["eth", "matic", "sol", "avax"];
export const assetOnNetwork = (asset: AssetId, net: NetId) => asset === "usdt" || USDC_NETS.includes(net);

/** Actifs ouverts (USDC d'abord) ; au moins un, pour que les écrans aient toujours de quoi s'afficher. */
export function openAssets(s: Pick<AppSettings, "assets">): AssetMeta[] {
  const open = ASSETS.filter((a) => s.assets[a.id]);
  return open.length ? open : [ASSET_BY_ID.usdt];
}

/** L'actif « par défaut » des textes généraux : le seul ouvert, sinon l'USDC s'il l'est. */
export const primaryAsset = (s: Pick<AppSettings, "assets">): AssetMeta => openAssets(s)[0];
