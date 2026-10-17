/**
 * « Connecter mon portefeuille » (vente) : on lit l'adresse du portefeuille du client, sans saisie.
 *
 * Seulement les portefeuilles présents dans le navigateur : extensions sur ordinateur, ou navigateur
 * intégré de l'app du portefeuille sur téléphone. Sur un téléphone sans portefeuille dans le
 * navigateur, on propose d'ouvrir Ooble dans l'app du portefeuille (lien profond). Rien n'est signé
 * ni envoyé : la connexion donne uniquement l'adresse publique.
 */
import type { AddressFamily } from "@/lib/depositAddresses";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Eip1193 = { request: (a: { method: string; params?: unknown[] }) => Promise<any> };

export interface WalletChoice {
  id: string;
  name: string;
  icon?: string;
  /** Présent dans ce navigateur : on peut se connecter tout de suite. */
  connect?: () => Promise<string>;
  /** Sinon, sur téléphone : ouvre Ooble dans le navigateur de l'app du portefeuille. */
  openUrl?: string;
}

const w = () => window as any;
export const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const here = () => window.location.href;

// Portefeuilles EVM annoncés par le navigateur (EIP-6963 : un par extension, même s'il y en a plusieurs).
const announced = new Map<string, { info: { name: string; icon: string; rdns: string }; provider: Eip1193 }>();
if (typeof window !== "undefined") {
  window.addEventListener("eip6963:announceProvider", (e: Event) => {
    const d = (e as CustomEvent).detail;
    if (d?.info?.rdns && d?.provider) announced.set(d.info.rdns, d);
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

const evmConnect = (p: Eip1193) => async () => {
  const accounts: string[] = await p.request({ method: "eth_requestAccounts" });
  if (!accounts?.[0]) throw new Error("no account");
  return accounts[0];
};

function evm(): WalletChoice[] {
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  const list: WalletChoice[] = [...announced.values()].map((d) => ({ id: d.info.rdns, name: d.info.name, icon: d.info.icon, connect: evmConnect(d.provider) }));
  if (!list.length && w().ethereum) list.push({ id: "injected", name: w().ethereum.isTrust ? "Trust Wallet" : w().ethereum.isMetaMask ? "MetaMask" : "Portefeuille", connect: evmConnect(w().ethereum) });
  if (list.length || !isMobile()) return list;
  return [
    { id: "metamask", name: "MetaMask", openUrl: `https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}` },
    { id: "trust", name: "Trust Wallet", openUrl: `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(here())}` },
  ];
}

function solana(): WalletChoice[] {
  const list: WalletChoice[] = [];
  const phantom = w().phantom?.solana;
  if (phantom?.isPhantom) list.push({ id: "phantom", name: "Phantom", connect: async () => (await phantom.connect()).publicKey.toString() });
  const solflare = w().solflare;
  if (solflare?.isSolflare) list.push({ id: "solflare", name: "Solflare", connect: async () => { await solflare.connect(); return solflare.publicKey.toString(); } });
  if (!list.length && w().solana?.connect) list.push({ id: "injected", name: "Portefeuille Solana", connect: async () => (await w().solana.connect()).publicKey.toString() });
  if (list.length || !isMobile()) return list;
  const url = encodeURIComponent(here()), ref = encodeURIComponent(window.location.origin);
  return [
    { id: "phantom", name: "Phantom", openUrl: `https://phantom.app/ul/browse/${url}?ref=${ref}` },
    { id: "solflare", name: "Solflare", openUrl: `https://solflare.com/ul/v1/browse/${url}?ref=${ref}` },
  ];
}

function tron(): WalletChoice[] {
  const link = w().tronLink;
  if (link) {
    return [{
      id: "tronlink", name: "TronLink",
      connect: async () => {
        await link.request({ method: "tron_requestAccounts" });
        const a = link.tronWeb?.defaultAddress?.base58 || w().tronWeb?.defaultAddress?.base58;
        if (!a) throw new Error("no account");
        return a as string;
      },
    }];
  }
  if (!isMobile()) return [];
  const param = encodeURIComponent(JSON.stringify({ url: here(), action: "open", protocol: "tronlink", version: "1.0" }));
  return [{ id: "tronlink", name: "TronLink", openUrl: `tronlinkoutside://pull.activity?param=${param}` }];
}

export function walletChoices(family: AddressFamily): WalletChoice[] {
  return family === "evm" ? evm() : family === "solana" ? solana() : tron();
}

/** Les portefeuilles qu'on cite au client, par famille de réseaux. */
export const WALLET_NAMES: Record<AddressFamily, string> = {
  evm: "MetaMask, Trust Wallet…",
  solana: "Phantom, Solflare…",
  tron: "TronLink…",
};

export const PLATFORMS = ["Binance", "Coinbase", "Kraken", "KuCoin", "OKX", "Bybit"] as const;
