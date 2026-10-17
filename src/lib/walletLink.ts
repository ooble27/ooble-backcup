/**
 * « Connecter » (vente) : on lit l'adresse du portefeuille du client, sans saisie.
 *
 * EVM et Solana : WalletConnect (Reown), qui liste aussi les extensions installées sur ordinateur.
 * Tron : TronLink, présent dans le navigateur, ou sur téléphone un lien qui ouvre Ooble dans l'app
 * TronLink. Rien n'est signé ni envoyé : la connexion donne uniquement l'adresse publique.
 */
import type { AddressFamily } from "@/lib/depositAddresses";

export type Connector = { connect: () => Promise<string> } | { openUrl: string };

/* eslint-disable @typescript-eslint/no-explicit-any */
const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

function tronLink(): Connector | null {
  const link = (window as any).tronLink;
  if (link) {
    return {
      connect: async () => {
        await link.request({ method: "tron_requestAccounts" });
        const a = link.tronWeb?.defaultAddress?.base58 || (window as any).tronWeb?.defaultAddress?.base58;
        if (!a) throw new Error("no account");
        return a as string;
      },
    };
  }
  if (!isMobile()) return null;
  const param = encodeURIComponent(JSON.stringify({ url: window.location.href, action: "open", protocol: "tronlink", version: "1.0" }));
  return { openUrl: `tronlinkoutside://pull.activity?param=${param}` };
}

/** Comment connecter un portefeuille de cette famille de réseaux ; null : aucun moyen ici. */
export function connectorFor(family: AddressFamily): Connector | null {
  if (family === "tron") return tronLink();
  return { connect: async () => (await import("@/lib/reown")).connectViaWalletConnect(family) };
}
