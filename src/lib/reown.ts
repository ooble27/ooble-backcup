/**
 * WalletConnect (Reown AppKit) pour « Connecter mon portefeuille » : sur téléphone, l'app du
 * portefeuille s'ouvre et le client revient sur Ooble ; sur ordinateur, un QR code à scanner.
 * Chargé seulement au premier toucher (le module est lourd). On ne lit que l'adresse publique.
 * Le Project ID n'est pas un secret : seuls les domaines autorisés chez Reown peuvent s'en servir.
 */
import type { AppKit } from "@reown/appkit";

const PROJECT_ID = "8f69e2582bb6f88b871623bb21683c26";

const isDark = () => document.documentElement.classList.contains("dark");

/**
 * La fenêtre de WalletConnect pose sur toute la page un voile fixé en haut de l'écran, qui reste dans
 * la page (invisible) une fois fermée. Sur iPhone, la barre d'état prend la couleur de ce voile : une
 * bande claire ou sombre apparaît en haut. On retire le voile et on sort la fenêtre de la page quand
 * elle est fermée.
 */
function fixOverlay() {
  if (document.getElementById("ooble-w3m")) return;
  const style = document.createElement("style");
  style.id = "ooble-w3m";
  style.textContent = `
    w3m-modal { background-color: transparent !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
    w3m-modal:not(.open) { display: none !important; }
  `;
  document.head.appendChild(style);
}

let kit: Promise<AppKit> | null = null;

function load(): Promise<AppKit> {
  fixOverlay();
  kit ??= (async () => {
    const [{ createAppKit }, nets, { EthersAdapter }, { SolanaAdapter }] = await Promise.all([
      import("@reown/appkit"),
      import("@reown/appkit/networks"),
      import("@reown/appkit-adapter-ethers"),
      import("@reown/appkit-adapter-solana"),
    ]);
    return createAppKit({
      projectId: PROJECT_ID,
      adapters: [new EthersAdapter(), new SolanaAdapter()],
      networks: [nets.bsc, nets.polygon, nets.avalanche, nets.mainnet, nets.solana],
      metadata: {
        name: "Ooble",
        description: "Achat et vente d'USDT au Canada",
        url: window.location.origin,
        icons: [`${window.location.origin}/icons/icon-192.png`],
      },
      themeMode: isDark() ? "dark" : "light",
      features: { analytics: false, email: false, socials: false, swaps: false, onramp: false, send: false, receive: false, history: false },
    });
  })().catch((e) => { kit = null; throw e; });
  return kit;
}

/** Ouvre WalletConnect et renvoie l'adresse du portefeuille connecté (EVM ou Solana). */
export async function connectViaWalletConnect(family: "evm" | "solana"): Promise<string> {
  const k = await load();
  const ns = family === "evm" ? "eip155" : "solana";
  const known = k.getAddress(ns);
  if (known) return known;
  // La fenêtre suit le thème choisi dans Ooble au moment où on l'ouvre.
  k.setThemeMode(isDark() ? "dark" : "light");
  return new Promise<string>((resolve, reject) => {
    let opened = false, done = false;
    let stopAccount = () => {}, stopState = () => {};
    const finish = (fn: () => void) => { if (done) return; done = true; stopAccount(); stopState(); fn(); };
    stopAccount = k.subscribeAccount((a) => {
      if (a.isConnected && a.address) finish(() => { void k.close(); resolve(a.address as string); });
    }, ns);
    // Fenêtre fermée sans connexion : on abandonne.
    stopState = k.subscribeState((s) => {
      if (s.open) opened = true;
      else if (opened) finish(() => reject(new Error("closed")));
    });
    k.open({ view: "Connect", namespace: ns }).catch((e) => finish(() => reject(e)));
  });
}

/** « Changer » : oublie le portefeuille connecté pour en choisir un autre. */
export async function forgetWalletConnect(): Promise<void> {
  if (!kit) return;
  try { await (await kit).disconnect(); } catch { /* déjà déconnecté */ }
}
