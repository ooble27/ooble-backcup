// Fonction edge Ooble — envoi automatique des USDT d'un achat.
//
// Deux déclencheurs :
//   • automatique — appel interne (clé service_role) de `interac-ingest` dès
//     qu'un virement Interac authentifié est rapproché d'un achat. Il n'est
//     honoré que si l'envoi automatique est activé (settlement_settings), que
//     le montant est sous le seuil par commande, que le client est vérifié
//     (ou membre de l'équipe, pour les tests) et qu'un avis Interac
//     authentifié et rapproché existe bien pour cet ordre ;
//   • équipe — clic « Envoyer les USDT » d'un admin ou opérateur connecté.
//
// Actions (POST JSON) :
//   { action: "send", order_id }  envoie les USDT d'un achat payé.
//   { action: "status" }          adresses et soldes du portefeuille chaud,
//                                 réglages (équipe uniquement).
//   { action: "health" }          diagnostic des réseaux, sans clé ni envoi.
//   { action: "drain" }           file d'attente : reprend chaque minute les
//                                 achats payés dont l'envoi automatique
//                                 n'a pas pu partir (réseau occupé, solde),
//                                 avec les mêmes contrôles que « send ».
//   { action: "reconcile" }       vérifie sur la blockchain les envois en
//                                 cours et termine les ordres confirmés. Sans
//                                 effet de bord risqué : appelé par une tâche
//                                 planifiée, sans authentification.
//   { action: "snapshot" }        relève le stock d'USDT et de gaz de chaque
//                                 réseau (Trésorerie) et prévient l'équipe d'un
//                                 stock bas. Lecture seule, toutes les 5 minutes,
//                                 sans authentification ; ignoré si le dernier
//                                 relevé a moins de 2 minutes.
//
// Garde-fous : un seul envoi actif par ordre (index unique en base), un seul
// envoi à la fois par réseau (verrou atomique en base), plafond
// sur 24 heures, solde vérifié avant l'envoi, hash enregistré AVANT la
// diffusion. Une issue incertaine passe l'envoi en « review » : personne ne
// le relance sans vérification humaine.
//
// Secrets : PAYOUT_TRON_KEY, PAYOUT_EVM_KEY, PAYOUT_SOL_KEY (clés privées du portefeuille
// chaud), TRONGRID_API_KEY et RPC_* (facultatifs, dont RPC_SOLANA).
// Déployée sans vérification JWT (--no-verify-jwt) : l'authentification est
// faite ici.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { caller } from "../_shared/guard.ts";
import {
  SUPPORTED, SafeError, balances, explorerUrl, fromAddress, hasKey, health, prepare, txState, validateAddress,
  type Net,
} from "./chains.ts";

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

const ref = (id: string) => `OOB-${id.slice(0, 8).toUpperCase()}`;
const NET_LABEL: Record<string, string> = {
  trc20: "Tron · TRC20", bep20: "BNB Chain · BEP20", polygon: "Polygon", avalanche: "Avalanche · C-Chain", erc20: "Ethereum · ERC20", spl: "Solana",
};
const EXPLORER_NAME: Record<string, string> = {
  trc20: "Tronscan", bep20: "BscScan", polygon: "PolygonScan", avalanche: "Snowtrace", erc20: "Etherscan", spl: "Solscan",
};
/** Lien vers la transaction pour le courriel (le hash seul, en repli). */
const txLinkHtml = (network: string, hash: string) => {
  const url = explorerUrl(network as Net, hash);
  return url
    ? `<a href="${url}" style="color:#111;text-decoration:underline;">Voir sur ${EXPLORER_NAME[network] ?? "l'explorateur"}</a>`
    : hash;
};
const nfUsdt = (n: number) => new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 }).format(n);

async function event(db: SupabaseClient, orderId: string, prev: string | null, next: string, note: string) {
  await db.from("order_events").insert({ order_id: orderId, previous_status: prev, new_status: next, actor: "system", note });
}

async function email(to: string | null | undefined, template: string, vars: Record<string, string>) {
  if (!to) return;
  try {
    await fetch(`${SB_URL}/functions/v1/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE}` },
      body: JSON.stringify({ to, template, vars }),
    });
  } catch (e) { console.error("usdt-payout: courriel", e); }
}

/** Termine l'ordre d'un envoi confirmé (idempotent). */
async function complete(db: SupabaseClient, payoutId: string) {
  const { data: p } = await db.from("usdt_payouts").select("*").eq("id", payoutId).maybeSingle();
  if (!p) return;
  await db.from("usdt_payouts").update({ status: "confirmed", updated_at: new Date().toISOString() }).eq("id", p.id);
  await db.from("blockchain_transactions").update({ confirmed: true, confirmations: 1, updated_at: new Date().toISOString() })
    .eq("tx_hash", p.tx_hash);
  const { data: o } = await db.from("orders").update({ status: "completed" })
    .eq("id", p.order_id).eq("status", "settling").select("id, user_id, usdt_amount, network").maybeSingle();
  if (!o) return; // déjà terminé
  await event(db, o.id, "settling", "completed", `USDT envoyés : ${p.tx_hash}`);
  const { data: prof } = await db.from("profiles").select("email").eq("id", o.user_id).maybeSingle();
  await email(prof?.email, "order-completed", {
    ref: ref(o.id),
    summaryLabel: "Vous avez reçu",
    summaryValue: `${nfUsdt(Number(o.usdt_amount))} USDT`,
    network: NET_LABEL[o.network] ?? o.network,
    txHash: p.tx_hash,
    txLinkHtml: txLinkHtml(o.network, p.tx_hash),
    orderUrl: `${SITE}/app/activite/${o.id}`,
  });
}

/** Envoi incertain ou échoué après diffusion : à vérifier par l'équipe. */
async function review(db: SupabaseClient, payoutId: string, msg: string) {
  await db.from("usdt_payouts").update({ status: "review", error: msg, updated_at: new Date().toISOString() }).eq("id", payoutId);
}

async function send(db: SupabaseClient, orderId: string, trigger: "auto" | "staff", by: string | null, wait = true) {
  const { data: settings } = await db.from("settlement_settings").select("*").eq("id", 1).single();
  const { data: o } = await db.from("orders")
    .select("id, user_id, side, status, network, wallet_address, usdt_amount, cad_amount, is_test").eq("id", orderId).maybeSingle();
  if (!o) return { ok: false, error: "Ordre introuvable." };
  // Essai d'un compte de test : jamais de vrai envoi (l'équipe le termine à blanc).
  if (o.is_test) return { ok: false, error: "Commande d'essai : aucun vrai envoi. Utilisez « Terminer l'essai »." };
  if (o.side !== "buy") return { ok: false, error: "Seuls les achats donnent lieu à un envoi d'USDT." };
  if (o.status !== "payment_received") return { ok: false, error: `L'ordre doit être « paiement reçu » (statut actuel : ${o.status}).` };
  const net = o.network as Net;
  if (!SUPPORTED.includes(net)) return { ok: false, error: `Envoi automatique indisponible sur ${NET_LABEL[net] ?? net} : à faire à la main.` };
  if (!hasKey(net)) return { ok: false, error: "Portefeuille chaud non configuré pour ce réseau." };
  const amount = Number(o.usdt_amount);

  if (trigger === "staff" && !by) return { ok: false, error: "L'envoi doit être déclenché par un membre de l'équipe." };
  if (trigger === "auto") {
    if (!settings?.auto_payout) return { ok: false, error: "Envoi automatique désactivé." };
    if (Number(o.cad_amount) > Number(settings.auto_payout_max_cad)) {
      return { ok: false, error: `Montant au-dessus du seuil automatique (${settings.auto_payout_max_cad} $) : envoi par l'équipe.` };
    }
    // Le paiement doit venir d'un avis Interac authentifié et rapproché.
    const { data: rcpt } = await db.from("interac_receipts").select("id")
      .eq("order_id", o.id).eq("status", "matched").eq("authenticated", true).limit(1);
    if (!rcpt?.length) return { ok: false, error: "Aucun avis Interac authentifié pour cet ordre : envoi par l'équipe." };
    // Client vérifié (identité ou entreprise), ou compte de l'équipe (tests).
    const [{ data: prof }, { data: roles }] = await Promise.all([
      db.from("profiles").select("kyc_status, account_type, business_status").eq("id", o.user_id).maybeSingle(),
      db.from("user_roles").select("role").eq("user_id", o.user_id),
    ]);
    const verified = prof?.account_type === "business" ? prof?.business_status === "approved" : prof?.kyc_status === "approved";
    if (!verified && !(roles ?? []).length) return { ok: false, error: "Client non vérifié : envoi par l'équipe." };
  }

  // Plafond du portefeuille chaud sur 24 heures.
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: recent } = await db.from("usdt_payouts").select("usdt_amount, network, status, created_at")
    .neq("status", "failed").gt("created_at", since);
  const used = (recent ?? []).reduce((s, r) => s + Number(r.usdt_amount), 0);
  if (used + amount > Number(settings?.daily_payout_max_usdt ?? 0)) {
    return { ok: false, error: `Plafond de ${settings?.daily_payout_max_usdt} USDT sur 24 h atteint (${nfUsdt(used)} déjà envoyés).` };
  }
  // Un envoi à la fois par réseau (le numéro de transaction suivant en
  // dépend) : verrou atomique en base, tenu jusqu'à la diffusion. Sous forte
  // charge, les autres ordres attendent leur tour (file `drain`).
  const holder = crypto.randomUUID();
  const { data: gotLock } = await db.rpc("claim_payout_lock", { _net: net, _holder: holder, _seconds: 90 });
  if (!gotLock) return { ok: false, busy: true, error: "Un autre envoi est en cours sur ce réseau. Réessayez dans une minute." };
  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    await db.rpc("release_payout_lock", { _net: net, _holder: holder });
  };
  try {
    return await sendLocked(db, o, net, amount, trigger, by, wait, settings, release);
  } finally {
    await release();
  }
}

type OrderRow = { id: string; user_id: string; network: string; wallet_address: string; usdt_amount: number; cad_amount: number };
type RecentRow = { usdt_amount: number; network: string; status: string; created_at: string };

async function sendLocked(
  db: SupabaseClient, o: OrderRow, net: Net, amount: number, trigger: "auto" | "staff", by: string | null,
  wait: boolean, settings: { daily_payout_max_usdt?: number } | null, release: () => Promise<void>,
) {
  // Relu sous verrou : plafond et envois en cours sont exacts même quand
  // plusieurs envois arrivent ensemble.
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: recentRows } = await db.from("usdt_payouts").select("usdt_amount, network, status, created_at")
    .neq("status", "failed").gt("created_at", since);
  const recent: RecentRow[] = recentRows ?? [];
  const used = recent.reduce((t, r) => t + Number(r.usdt_amount), 0);
  if (used + amount > Number(settings?.daily_payout_max_usdt ?? 0)) {
    return { ok: false, error: `Plafond de ${settings?.daily_payout_max_usdt} USDT sur 24 h atteint (${nfUsdt(used)} déjà envoyés).` };
  }
  let from: string;
  try {
    validateAddress(net, o.wallet_address);
    from = fromAddress(net);
    const b = await balances(net);
    // Les envois diffusés mais pas encore confirmés ne sont pas encore
    // déduits du solde lu sur la blockchain : on les retire nous-mêmes.
    const inFlight = recent.filter((r) => r.network === net && (r.status === "sending" || r.status === "broadcast"))
      .reduce((t, r) => t + Number(r.usdt_amount), 0);
    const free = b.usdt - inFlight;
    if (free < amount) return { ok: false, error: `Solde USDT insuffisant sur ${NET_LABEL[net]} : ${nfUsdt(free)} disponibles, ${nfUsdt(amount)} requis.` };
    if (b.gas < b.minGas) return { ok: false, error: `Pas assez de ${b.gasSymbol} pour les frais : ${b.gas} (minimum ${b.minGas}).` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  // Réservation : l'index unique refuse un second envoi actif pour l'ordre.
  const { data: p, error: insErr } = await db.from("usdt_payouts").insert({
    order_id: o.id, network: net, from_address: from, to_address: o.wallet_address,
    usdt_amount: amount, status: "sending", trigger, requested_by: by,
  }).select("id").single();
  if (insErr || !p) return { ok: false, error: "Un envoi existe déjà pour cet ordre." };

  const { data: moved } = await db.from("orders").update({ status: "settling" })
    .eq("id", o.id).eq("status", "payment_received").select("id").maybeSingle();
  if (!moved) {
    await db.from("usdt_payouts").update({ status: "failed", error: "Statut de l'ordre modifié entre-temps." }).eq("id", p.id);
    return { ok: false, error: "Le statut de l'ordre a changé entre-temps." };
  }
  await event(db, o.id, "payment_received", "settling",
    trigger === "auto" ? "Envoi automatique des USDT (virement Interac rapproché)" : "Envoi des USDT lancé par l'équipe");

  const undo = async (msg: string) => {
    await db.from("usdt_payouts").update({ status: "failed", error: msg, updated_at: new Date().toISOString() }).eq("id", p.id);
    await db.from("orders").update({ status: "payment_received" }).eq("id", o.id).eq("status", "settling");
    await event(db, o.id, "settling", "payment_received", `Envoi échoué, rien n'est parti : ${msg}`);
  };

  let tx;
  try {
    tx = await prepare(net, o.wallet_address, amount);
  } catch (e) {
    await undo((e as Error).message);
    return { ok: false, error: (e as Error).message };
  }
  await db.from("usdt_payouts").update({ tx_hash: tx.hash, updated_at: new Date().toISOString() }).eq("id", p.id);

  try {
    await tx.broadcast();
  } catch (e) {
    if (e instanceof SafeError) {
      await undo(e.message);
      return { ok: false, error: e.message };
    }
    await review(db, p.id, (e as Error).message);
    return { ok: false, review: true, error: `${(e as Error).message} À vérifier : ${explorerUrl(net, tx.hash)}` };
  }

  await db.from("usdt_payouts").update({ status: "broadcast", updated_at: new Date().toISOString() }).eq("id", p.id);
  // Diffusée : le réseau est libre pour l'envoi suivant.
  await release();
  await db.from("blockchain_transactions").insert({
    order_id: o.id, direction: "outbound", network: net, tx_hash: tx.hash, usdt_amount: amount, confirmations: 0, confirmed: false,
  });
  // File d'attente : on n'attend pas la confirmation, `reconcile` termine
  // l'ordre dès que la transaction est dans un bloc.
  if (!wait) return { ok: true, status: "broadcast", hash: tx.hash, url: explorerUrl(net, tx.hash) };

  // Attente de l'inclusion dans un bloc (quelques secondes en général).
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    try {
      const s = await txState(net, tx.hash);
      if (s === "success") { await complete(db, p.id); return { ok: true, status: "confirmed", hash: tx.hash, url: explorerUrl(net, tx.hash) }; }
      if (s === "reverted") { await review(db, p.id, "Transaction rejetée par le contrat."); return { ok: false, review: true, error: "Transaction rejetée sur la blockchain.", url: explorerUrl(net, tx.hash) }; }
    } catch { /* on réessaie */ }
  }
  return { ok: true, status: "broadcast", hash: tx.hash, url: explorerUrl(net, tx.hash) };
}

async function reconcile(db: SupabaseClient) {
  const { data: rows } = await db.from("usdt_payouts").select("id, network, tx_hash, status, created_at")
    .in("status", ["broadcast", "sending"]).not("tx_hash", "is", null).limit(20);
  const out: Record<string, string> = {};
  for (const r of rows ?? []) {
    try {
      const s = await txState(r.network as Net, r.tx_hash);
      if (s === "success") { await complete(db, r.id); out[r.id] = "confirmed"; }
      else if (s === "reverted") { await review(db, r.id, "Transaction rejetée par le contrat."); out[r.id] = "review"; }
      else if (Date.now() - new Date(r.created_at).getTime() > 30 * 60 * 1000) {
        await review(db, r.id, "Toujours introuvable sur la blockchain après 30 minutes."); out[r.id] = "review";
      } else out[r.id] = "pending";
    } catch (e) { out[r.id] = `erreur : ${(e as Error).message}`; }
  }
  return { ok: true, checked: out };
}

/**
 * File d'attente des envois automatiques. Quand beaucoup de virements
 * arrivent en même temps, un seul envoi part à la fois par réseau : les
 * autres échouent proprement (« réseau occupé ») et restent « paiement
 * reçu ». Appelée chaque minute, cette action les reprend, du plus ancien au
 * plus récent, sans attendre les confirmations (`reconcile` s'en charge).
 * `send` refait tous les contrôles : rien ne part qui n'aurait pas pu partir
 * dès l'arrivée du virement. Après 3 tentatives échouées, l'ordre est laissé
 * à l'équipe.
 */
async function drain(db: SupabaseClient) {
  const started = Date.now();
  const { data: settings } = await db.from("settlement_settings").select("auto_payout, auto_payout_max_cad").eq("id", 1).single();
  if (!settings?.auto_payout) return { ok: true, skipped: "Envoi automatique désactivé." };

  const { data: orders } = await db.from("orders").select("id, network, updated_at")
    .eq("side", "buy").eq("status", "payment_received").eq("is_test", false).lte("cad_amount", Number(settings.auto_payout_max_cad))
    .order("updated_at", { ascending: true }).limit(200);
  if (!orders?.length) return { ok: true, sent: {} };
  const ids = orders.map((o) => o.id);

  const [{ data: rcpts }, { data: payouts }] = await Promise.all([
    db.from("interac_receipts").select("order_id").in("order_id", ids).eq("status", "matched").eq("authenticated", true),
    db.from("usdt_payouts").select("order_id, status, updated_at").in("order_id", ids),
  ]);
  const paid = new Set((rcpts ?? []).map((r) => r.order_id));
  const tries = new Map<string, { failed: number; active: boolean; last: number }>();
  for (const p of payouts ?? []) {
    const t = tries.get(p.order_id) ?? { failed: 0, active: false, last: 0 };
    if (p.status === "failed") t.failed++; else t.active = true;
    t.last = Math.max(t.last, new Date(p.updated_at).getTime());
    tries.set(p.order_id, t);
  }
  const queue = orders.filter((o) => {
    const t = tries.get(o.id);
    return paid.has(o.id) && !t?.active && (t?.failed ?? 0) < 3 && Date.now() - (t?.last ?? 0) > 60_000;
  });

  // Un réseau occupé ou à court de solde ne bloque pas les autres.
  const out: Record<string, string> = {};
  const stopped = new Set<string>();
  for (const o of queue) {
    if (Date.now() - started > 100_000) break;
    if (stopped.has(o.network)) continue;
    const r = await send(db, o.id, "auto", null, false);
    out[ref(o.id)] = r.ok ? "envoyé" : r.error ?? "échec";
    if (!r.ok && ("busy" in r || /solde|frais|plafond/i.test(r.error ?? ""))) stopped.add(o.network);
  }
  return { ok: true, waiting: queue.length, sent: out };
}

/**
 * Trésorerie : un relevé du stock par réseau, puis l'alerte « stock bas » à l'équipe (au plus une
 * fois toutes les 6 heures par réseau tant que le stock reste bas). N'agit jamais sur les commandes.
 */
async function snapshot(db: SupabaseClient) {
  const since = new Date(Date.now() - 2 * 60_000).toISOString();
  const { data: recent } = await db.from("treasury_stock_snapshots").select("id").gte("taken_at", since).limit(1);
  if (recent?.length) return { ok: true, skipped: true };

  const rows = (await Promise.all(SUPPORTED.filter((n) => hasKey(n)).map(async (net) => {
    try {
      const b = await balances(net);
      return { network: net, address: b.address, usdt: b.usdt, gas: b.gas, gas_symbol: b.gasSymbol, min_gas: b.minGas };
    } catch { return null; }
  }))).filter((r): r is NonNullable<typeof r> => !!r);
  if (rows.length) await db.from("treasury_stock_snapshots").insert(rows);

  // Réservé : les achats ouverts de chaque réseau (hors essais).
  const { data: open } = await db.from("orders").select("network, usdt_amount")
    .eq("side", "buy").in("status", ["created", "awaiting_payment", "payment_received", "settling"]).eq("is_test", false).eq("hidden", false);
  const reserved: Record<string, number> = {};
  for (const o of open ?? []) reserved[o.network] = (reserved[o.network] ?? 0) + Number(o.usdt_amount);

  const { data: cfg } = await db.from("treasury_alert_config").select("network, low_balance_threshold_usdt, alert_enabled, last_alert_at");
  const now = Date.now(), low: { net: string; available: number; threshold: number; gasLow: boolean; gas: number; gasSymbol: string }[] = [];
  for (const r of rows) {
    const c = (cfg ?? []).find((x) => x.network === r.network);
    if (!c?.alert_enabled) continue;
    const available = r.usdt - (reserved[r.network] ?? 0);
    const gasLow = r.gas < r.min_gas * 2;
    const isLow = available < Number(c.low_balance_threshold_usdt) || gasLow;
    if (!isLow) {
      if (c.last_alert_at) await db.from("treasury_alert_config").update({ last_alert_at: null }).eq("network", r.network);
      continue;
    }
    if (c.last_alert_at && now - new Date(c.last_alert_at).getTime() < 6 * 3600_000) continue;
    low.push({ net: r.network, available, threshold: Number(c.low_balance_threshold_usdt), gasLow, gas: r.gas, gasSymbol: r.gas_symbol });
  }
  if (low.length) {
    const sent = await alertLowStock(db, low);
    if (sent) await db.from("treasury_alert_config").update({ last_alert_at: new Date().toISOString() }).in("network", low.map((l) => l.net));
  }
  return { ok: true, snapshots: rows.length, alerts: low.map((l) => l.net) };
}

/** Courriel « stock bas » aux destinataires des alertes de l'équipe (Réglages), sinon STAFF_NOTIFICATION_EMAIL. */
async function alertLowStock(db: SupabaseClient, low: { net: string; available: number; threshold: number; gasLow: boolean; gas: number; gasSymbol: string }[]) {
  const apiKey = Deno.env.get("RESEND_API_KEY"), from = Deno.env.get("EMAIL_FROM");
  if (!apiKey || !from) return false;
  const { data } = await db.from("app_private_settings").select("staff_alert_emails").eq("id", 1).maybeSingle();
  let to = ((data?.staff_alert_emails ?? []) as string[]).map((e) => e.trim()).filter((e) => /^\S+@\S+\.\S+$/.test(e));
  if (!to.length) { const s = Deno.env.get("STAFF_NOTIFICATION_EMAIL")?.trim(); to = s ? [s] : []; }
  if (!to.length) return false;
  const lines = low.map((l) => `${NET_LABEL[l.net] ?? l.net} : ${nfUsdt(l.available)} USDT disponibles (seuil ${nfUsdt(l.threshold)})${l.gasLow ? ` · gaz bas : ${l.gas.toFixed(4)} ${l.gasSymbol}` : ""}`);
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#141414">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#777">Trésorerie</p>
    <p style="margin:0 0 16px;font-size:20px;font-weight:bold">Stock bas à recharger</p>
    ${lines.map((t) => `<p style="margin:0 0 6px">${t}</p>`).join("")}
    <p style="margin:16px 0 0"><a href="${SITE}/admin" style="color:#141414">Ouvrir la Trésorerie</a></p></div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject: `Trésorerie · stock bas (${low.map((l) => NET_LABEL[l.net] ?? l.net).join(", ")})`, html, text: lines.join("\n") }),
  }).catch(() => null);
  return !!res?.ok;
}

async function status(db: SupabaseClient) {
  const { data: settings } = await db.from("settlement_settings").select("*").eq("id", 1).single();
  const wallets = await Promise.all(SUPPORTED.map(async (net) => {
    if (!hasKey(net)) return { network: net, label: NET_LABEL[net], configured: false };
    try { return { network: net, label: NET_LABEL[net], configured: true, ...(await balances(net)) }; }
    catch (e) { return { network: net, label: NET_LABEL[net], configured: true, address: (() => { try { return fromAddress(net); } catch { return null; } })(), error: (e as Error).message }; }
  }));
  return { ok: true, settings, wallets };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST uniquement" }, 405);
  if (!SB_URL || !SERVICE) return json({ error: "Configuration serveur incomplète." }, 500);
  const db = createClient(SB_URL, SERVICE);

  let body: { action?: string; order_id?: string };
  try { body = await req.json(); } catch { body = {}; }
  const action = body.action ?? "send";

  // Passages automatiques et diagnostic : tâches planifiées, appels internes ou équipe.
  if (["reconcile", "drain", "health", "snapshot"].includes(action) && !(await caller(req, db, SERVICE))) {
    return json({ error: "Accès refusé." }, 401);
  }
  if (action === "reconcile") return json(await reconcile(db));
  if (action === "drain") return json(await drain(db));
  if (action === "health") return json({ ok: true, networks: await health() });
  if (action === "snapshot") return json(await snapshot(db));

  // Authentification : clé service (appel interne) ou membre de l'équipe.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  let trigger: "auto" | "staff" = "auto";
  let by: string | null = null;
  if (token !== SERVICE) {
    const { data: auth } = token ? await db.auth.getUser(token) : { data: { user: null } };
    const uid = auth?.user?.id;
    if (!uid) return json({ error: "Authentification requise." }, 401);
    const { data: roles } = await db.from("user_roles").select("role").eq("user_id", uid);
    if (!(roles ?? []).some((r) => r.role === "admin" || r.role === "operator")) return json({ error: "Réservé à l'équipe." }, 403);
    trigger = "staff";
    by = uid;
  }

  if (action === "status") return json(await status(db));
  if (action === "send") {
    if (!body.order_id) return json({ error: "order_id manquant." }, 400);
    const r = await send(db, body.order_id, trigger, by);
    // Envoi automatique non effectué : la raison reste dans l'historique de l'ordre.
    if (trigger === "auto" && !r.ok && !("review" in r && r.review)) {
      await event(db, body.order_id, "payment_received", "payment_received", `Envoi automatique non effectué : ${r.error}`);
    }
    return json(r);
  }
  return json({ error: "Action inconnue." }, 400);
});
