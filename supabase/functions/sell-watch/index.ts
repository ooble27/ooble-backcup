// Fonction edge Ooble — surveillance des USDT reçus pour les ventes.
//
// Toutes les 2 minutes (pg_cron), lit les transferts d'USDT entrants sur les
// adresses de dépôt d'Ooble, les enregistre dans `chain_deposits`, puis
// appelle match_sell_deposits() qui les rapproche des ventes en attente. Pour
// chaque vente rapprochée, le client reçoit le courriel « usdt-received » :
// l'ordre attend ensuite le virement Interac de l'équipe (file de l'admin,
// informations déjà remplies).
//
// Lecture seule sur la blockchain, idempotente (index unique sur
// réseau + hash + position) : déployée sans vérification JWT, comme le
// « reconcile » de usdt-payout.
//
// Réseaux : Tron (API TronGrid) et EVM (eth_getLogs sur des nœuds publics,
// remplaçables par les secrets SCAN_RPC_*). Solana : non surveillé.
// Secrets facultatifs : TRONGRID_API_KEY, SCAN_RPC_BEP20, SCAN_RPC_POLYGON,
// SCAN_RPC_AVALANCHE, SCAN_RPC_ERC20.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SITE = Deno.env.get("SITE_URL") ?? "https://ooble.ca";

/** Une adresse remplacée dans Réglages reste surveillée ce temps-là (les ventes en cours y arrivent encore). */
const RETIRED_WATCH_MS = 7 * 86400_000;

/** Adresses de dépôt à surveiller (Back-office › Réglages › Adresses de dépôt) : l'active, et les récemment remplacées. */
async function depositAddresses(db: SupabaseClient): Promise<{ tron: string[]; evm: string[] }> {
  const { data } = await db.from("deposit_addresses").select("family, address, active, retired_at");
  const since = Date.now() - RETIRED_WATCH_MS;
  const watched = (data ?? []).filter((r: { active: boolean; retired_at: string | null }) => r.active || (r.retired_at && new Date(r.retired_at).getTime() > since));
  const of = (f: string) => watched.filter((r: { family: string }) => r.family === f).map((r: { address: string }) => r.address);
  return { tron: of("tron"), evm: of("evm") };
}

type EvmNet = "bep20" | "polygon" | "avalanche" | "erc20";
const EVM: Record<EvmNet, { rpc: string; env: string; usdt: string; decimals: number; confirmations: number; chunk: number; startBack: number }> = {
  bep20:     { rpc: "https://bsc-rpc.publicnode.com",              env: "SCAN_RPC_BEP20",     usdt: "0x55d398326f99059fF775485246999027B3197955", decimals: 18, confirmations: 15, chunk: 1000, startBack: 2400 },
  polygon:   { rpc: "https://polygon-bor-rpc.publicnode.com",      env: "SCAN_RPC_POLYGON",   usdt: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6,  confirmations: 64, chunk: 1000, startBack: 3600 },
  avalanche: { rpc: "https://avalanche-c-chain-rpc.publicnode.com", env: "SCAN_RPC_AVALANCHE", usdt: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", decimals: 6,  confirmations: 5,  chunk: 1000, startBack: 3600 },
  erc20:     { rpc: "https://ethereum-rpc.publicnode.com",         env: "SCAN_RPC_ERC20",     usdt: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6,  confirmations: 12, chunk: 500,  startBack: 600 },
};
/** Nombre maximal de tranches lues par réseau et par passage (rattrapage progressif). */
const MAX_CHUNKS = 8;
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TRON_USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

const EXPLORER: Record<string, [string, string]> = {
  trc20: ["https://tronscan.org/#/transaction/", "Tronscan"],
  bep20: ["https://bscscan.com/tx/", "BscScan"],
  polygon: ["https://polygonscan.com/tx/", "PolygonScan"],
  avalanche: ["https://snowtrace.io/tx/", "Snowtrace"],
  erc20: ["https://etherscan.io/tx/", "Etherscan"],
};
const NET_LABEL: Record<string, string> = {
  trc20: "Tron · TRC20", bep20: "BNB Chain · BEP20", polygon: "Polygon", avalanche: "Avalanche · C-Chain", erc20: "Ethereum · ERC20",
};

interface Deposit {
  network: string;
  tx_hash: string;
  log_index: number;
  from_address: string | null;
  to_address: string;
  usdt_amount: number;
  block_time: string;
}

/** Montant entier (unités de base) → nombre, sans perte au-delà de 6 décimales. */
const units = (raw: bigint, decimals: number) => {
  const scale = 10n ** BigInt(Math.max(0, decimals - 6));
  return Number(raw / scale) / 1e6;
};

// ───────────────────────── Tron ─────────────────────────

async function scanTron(addresses: string[], cursorMs: number): Promise<{ deposits: Deposit[]; cursor: number }> {
  if (!addresses.length) return { deposits: [], cursor: cursorMs };
  const all = await Promise.all(addresses.map((a) => scanTronAddress(a, cursorMs)));
  return { deposits: all.flatMap((r) => r.deposits), cursor: Math.min(...all.map((r) => r.cursor)) };
}

async function scanTronAddress(address: string, cursorMs: number): Promise<{ deposits: Deposit[]; cursor: number }> {
  const key = Deno.env.get("TRONGRID_API_KEY");
  const url = `https://api.trongrid.io/v1/accounts/${address}/transactions/trc20?only_to=true&only_confirmed=true`
    + `&contract_address=${TRON_USDT}&min_timestamp=${cursorMs}&order_by=block_timestamp,asc&limit=200`;
  const r = await fetch(url, { headers: key ? { "TRON-PRO-API-KEY": key } : {} });
  if (!r.ok) throw new Error(`TronGrid ${r.status}`);
  const body = await r.json() as { data?: { transaction_id: string; from: string; to: string; value: string; block_timestamp: number; token_info?: { decimals?: number } }[] };
  let cursor = cursorMs;
  const deposits = (body.data ?? [])
    .filter((x) => x.to === address)
    .map((x) => {
      cursor = Math.max(cursor, x.block_timestamp + 1);
      return {
        network: "trc20", tx_hash: x.transaction_id, log_index: 0, from_address: x.from, to_address: x.to,
        usdt_amount: units(BigInt(x.value), x.token_info?.decimals ?? 6), block_time: new Date(x.block_timestamp).toISOString(),
      };
    });
  // Sans nouveau transfert, on avance quand même (marge de 10 minutes pour
  // les transactions pas encore confirmées) ; les doublons sont ignorés.
  return { deposits, cursor: Math.max(cursor, Date.now() - 10 * 60_000) };
}

// ───────────────────────── EVM ─────────────────────────

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  if (!r.ok) throw new Error(`${method} ${r.status}`);
  const b = await r.json() as { result?: T; error?: { message: string } };
  if (b.error) throw new Error(`${method} : ${b.error.message}`);
  return b.result as T;
}

async function scanEvm(net: EvmNet, addresses: string[], cursor: number | null): Promise<{ deposits: Deposit[]; cursor: number }> {
  const c = EVM[net];
  const url = Deno.env.get(c.env) || c.rpc;
  const head = Number(BigInt(await rpc<string>(url, "eth_blockNumber", []))) - c.confirmations;
  let from = cursor ?? head - c.startBack;
  const deposits: Deposit[] = [];
  const times = new Map<string, string>();
  if (!addresses.length) return { deposits, cursor: cursor ?? head };
  // Plusieurs adresses surveillées : le filtre accepte une liste (l'une ou l'autre).
  const topicTo = addresses.map((a) => "0x" + a.slice(2).toLowerCase().padStart(64, "0"));

  for (let k = 0; k < MAX_CHUNKS && from <= head; k++) {
    const to = Math.min(head, from + c.chunk - 1);
    const logs = await rpc<{ transactionHash: string; logIndex: string; blockNumber: string; topics: string[]; data: string }[]>(url, "eth_getLogs", [{
      fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16), address: c.usdt, topics: [TRANSFER, null, topicTo],
    }]);
    for (const l of logs) {
      if (!times.has(l.blockNumber)) {
        const b = await rpc<{ timestamp: string }>(url, "eth_getBlockByNumber", [l.blockNumber, false]);
        times.set(l.blockNumber, new Date(Number(BigInt(b.timestamp)) * 1000).toISOString());
      }
      deposits.push({
        network: net, tx_hash: l.transactionHash, log_index: Number(BigInt(l.logIndex)),
        from_address: "0x" + l.topics[1].slice(26),
        to_address: addresses.find((a) => a.slice(2).toLowerCase() === l.topics[2].slice(26).toLowerCase()) ?? "0x" + l.topics[2].slice(26),
        usdt_amount: units(BigInt(l.data), c.decimals), block_time: times.get(l.blockNumber)!,
      });
    }
    from = to + 1;
  }
  return { deposits, cursor: from };
}

// ───────────────────────── Passage complet ─────────────────────────

async function scan(db: SupabaseClient) {
  const { data: state } = await db.from("chain_scan_state").select("network, cursor");
  const cur = new Map((state ?? []).map((s: { network: string; cursor: number }) => [s.network, Number(s.cursor)]));
  const report: Record<string, string> = {};
  let found = 0;
  const addr = await depositAddresses(db);

  const jobs: [string, () => Promise<{ deposits: Deposit[]; cursor: number }>][] = [
    ["trc20", () => scanTron(addr.tron, cur.get("trc20") ?? Date.now() - 6 * 3600_000)],
    ...(Object.keys(EVM) as EvmNet[]).map((n) => [n, () => scanEvm(n, addr.evm, cur.get(n) ?? null)] as [string, () => Promise<{ deposits: Deposit[]; cursor: number }>]),
  ];

  await Promise.all(jobs.map(async ([net, run]) => {
    try {
      const { deposits, cursor } = await run();
      if (deposits.length) {
        const { error } = await db.from("chain_deposits").upsert(deposits, { onConflict: "network,tx_hash,log_index", ignoreDuplicates: true });
        if (error) throw new Error(error.message);
      }
      await db.from("chain_scan_state").upsert({ network: net, cursor, updated_at: new Date().toISOString() });
      found += deposits.length;
      report[net] = `${deposits.length} transfert(s)`;
    } catch (e) {
      report[net] = `erreur : ${(e as Error).message}`;
      console.error("sell-watch", net, e);
    }
  }));

  const { data: matched, error } = await db.rpc("match_sell_deposits");
  if (error) console.error("sell-watch: rapprochement", error);
  for (const m of (matched ?? []) as { order_id: string; deposit_id: string }[]) await notify(db, m.order_id, m.deposit_id);

  return { found, matched: (matched ?? []).length, report };
}

/** Courriel au client : USDT reçus, virement Interac en préparation. */
async function notify(db: SupabaseClient, orderId: string, depositId: string) {
  const [{ data: o }, { data: d }] = await Promise.all([
    db.from("orders").select("id, user_id, cad_amount, usdt_amount, network, interac_email").eq("id", orderId).maybeSingle(),
    db.from("chain_deposits").select("tx_hash, usdt_amount, network").eq("id", depositId).maybeSingle(),
  ]);
  if (!o || !d) return;
  const { data: p } = await db.from("profiles").select("email").eq("id", o.user_id).maybeSingle();
  const to = p?.email ?? o.interac_email;
  if (!to) return;
  const [base, name] = EXPLORER[d.network] ?? ["", ""];
  const fr = (n: number, dec = 2) => n.toLocaleString("fr-CA", { minimumFractionDigits: dec, maximumFractionDigits: dec }).replace(/ | /g, " ");
  await fetch(`${SB_URL}/functions/v1/send-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE}` },
    body: JSON.stringify({
      to,
      template: "usdt-received",
      vars: {
        ref: `OOB-${o.id.slice(0, 8).toUpperCase()}`,
        usdtAmount: fr(Number(d.usdt_amount)),
        cadAmount: fr(Number(o.cad_amount)),
        network: NET_LABEL[d.network] ?? d.network,
        interacEmail: o.interac_email ?? to,
        txLinkHtml: base ? `<a href="${base}${d.tx_hash}" style="color:#111;text-decoration:underline">Voir sur ${name}</a>` : d.tx_hash,
        orderUrl: `${SITE}/app/activite/${o.id}`,
      },
    }),
  }).catch((e) => console.error("sell-watch: courriel", e));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);
  let body: { action?: string } = {};
  try { body = await req.json(); } catch { /* corps vide */ }
  if (body.action !== "scan") return json({ error: "Action inconnue" }, 400);
  const db = createClient(SB_URL, SERVICE);
  return json(await scan(db));
});
