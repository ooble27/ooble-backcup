/**
 * Cryptomonnaies proposées : USDT (Tether) et USDC (Circle), deux dollars américains numériques.
 * Chacune s'ouvre ou se ferme dans Back-office › Réglages › Cryptomonnaies ; la base refuse une commande
 * sur un actif fermé, ou sur un réseau où il n'existe pas.
 */
import type { NetId } from "@/components/app/networks";
import { getAppSettingsNow, type AppSettings, type AssetId, type DbNet } from "@/lib/settings";

export type { AssetId };

export interface AssetMeta { id: AssetId; symbol: string; name: string; issuer: string; logo: string }

export const ASSETS: AssetMeta[] = [
  { id: "usdc", symbol: "USDC", name: "USD Coin", issuer: "Circle", logo: "/coins/usdc.svg" },
  { id: "usdt", symbol: "USDT", name: "Tether USD", issuer: "Tether", logo: "/coins/usdt.svg" },
];
export const ASSET_BY_ID: Record<AssetId, AssetMeta> = Object.fromEntries(ASSETS.map((a) => [a.id, a])) as Record<AssetId, AssetMeta>;

/** Symbole affiché d'un actif (USDT par défaut pour les commandes d'avant les deux actifs). */
export const assetSymbol = (a: string | null | undefined) => ASSET_BY_ID[(a ?? "usdt") as AssetId]?.symbol ?? "USDT";

/** L'USDC n'existe pas sur Tron (sur BNB Chain : version reliée, émise par un tiers). */
const USDC_NETS: NetId[] = ["eth", "matic", "sol", "avax", "bnb"];
export const assetOnNetwork = (asset: AssetId, net: NetId) => asset === "usdt" || USDC_NETS.includes(net);

/** Actifs ouverts (USDC d'abord) ; au moins un, pour que les écrans aient toujours de quoi s'afficher. */
export function openAssets(s: Pick<AppSettings, "assets">): AssetMeta[] {
  const open = ASSETS.filter((a) => s.assets[a.id]);
  return open.length ? open : [ASSET_BY_ID.usdt];
}

/** L'actif « par défaut » des textes généraux : le seul ouvert, sinon l'USDC s'il l'est. */
export const primaryAsset = (s: Pick<AppSettings, "assets">): AssetMeta => openAssets(s)[0];

/** Symboles des actifs ouverts, pour les textes : « USDC », ou « USDC et USDT » si les deux sont ouverts. */
export const openSymbols = (s: Pick<AppSettings, "assets">) => openAssets(s).map((a) => a.symbol).join(" et ");

const NET_OF_DB: Record<DbNet, NetId> = { trc20: "trx", bep20: "bnb", erc20: "eth", polygon: "matic", spl: "sol", avalanche: "avax" };

/**
 * Réseau affiché au back-office (soldes, règlement) : ouvert dans au moins un sens dans Réglages › Réseaux,
 * et portant au moins une cryptomonnaie ouverte. Un réseau fermé ou sans actif ouvert disparaît des écrans.
 */
export function networkLive(s: Pick<AppSettings, "assets" | "networks">, db: string): boolean {
  const net = NET_OF_DB[db as DbNet];
  if (!net) return false;
  const sw = s.networks[db as DbNet];
  return !!(sw?.buy || sw?.sell) && openAssets(s).some((a) => assetOnNetwork(a.id, net));
}

/** Symbole de l'actif principal, d'après les réglages déjà chargés (textes du back-office). */
export const coinNow = () => primaryAsset(getAppSettingsNow()).symbol;
/** Symbole d'une ligne : son actif s'il est connu, sinon l'actif principal. */
export const coinOf = (a: string | null | undefined) => (a ? assetSymbol(a) : coinNow());
