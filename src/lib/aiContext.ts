import { supabase } from "@/integrations/supabase/client";
import { orderRef } from "@/lib/orders";
import type { PlatformContext } from "@/lib/ai";
import { OLI_NAME, isAutoActor } from "@/lib/oli";

const DB_STATUS_LABEL: Record<string, string> = {
  created: "Créée",
  awaiting_payment: "En attente",
  payment_received: "À traiter",
  settling: "En cours",
  completed: "Terminée",
  cancelled: "Annulée",
  expired: "Expirée",
  refunded: "Remboursée",
};

const KYC_STATUS_LABEL: Record<string, string> = {
  not_started: "Non commencé",
  pending: "En attente",
  approved: "Approuvé",
  rejected: "Refusé",
};

function snippet(text: string | null, len = 120): string {
  if (!text) return "";
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= len ? clean : `${clean.slice(0, len)}…`;
}


export async function fetchPlatformContext(): Promise<PlatformContext> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  const [
    ordersRes, kycCountRes, kycDetailsRes, mailCountRes, threadsRes, rateRes, flagsRes, treasuryRes,
    profilesRes, blockchainTxRes, paymentConfRes, orderEventsRes, announcementsRes, maintenanceRes, treasuryMovRes, auditLogRes,
    depositRes,
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("id, side, status, cad_amount, usdt_amount, created_at, network, wallet_address, profiles(full_name, email)")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("kyc_verifications")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("kyc_verifications")
      .select("id, status, result_payload, created_at, profiles(full_name, email)")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("mail_threads")
      .select("id", { count: "exact", head: true })
      .eq("has_unread", true),
    supabase
      .from("mail_threads")
      .select("id, client_name, client_email, subject, last_message_at, message_count, has_unread, status")
      .eq("status", "open")
      .order("last_message_at", { ascending: false })
      .limit(15),
    supabase
      .from("exchange_rates")
      .select("buy_rate, sell_rate")
      .eq("asset", "usdt")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("compliance_flags")
      .select("id, flag_type, order_id, user_id, resolved, details, created_at")
      .eq("resolved", false)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("treasury_balance_snapshots")
      .select("balance_usdt, treasury_addresses(network, label, active)")
      .order("recorded_at", { ascending: false })
      .limit(50),
    // --- New queries ---
    supabase
      .from("profiles")
      .select("full_name, email, account_type, kyc_status, phone, business_name, daily_limit_cad, created_at")
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("blockchain_transactions")
      .select("order_id, network, tx_hash, direction, usdt_amount, confirmations, confirmed, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("payment_confirmations")
      .select("order_id, amount_cad, method, reference, direction, confirmed_at")
      .order("confirmed_at", { ascending: false })
      .limit(20),
    supabase
      .from("order_events")
      .select("order_id, previous_status, new_status, actor, note, created_at")
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("announcements")
      .select("kind, title_fr, body_fr, created_at")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("maintenance_windows")
      .select("title_fr, body_fr, starts_at, ends_at, active")
      .order("starts_at", { ascending: false })
      .limit(5),
    supabase
      .from("treasury_movements")
      .select("amount_usdt, tx_hash, reason, notes, created_at, from_address:treasury_addresses!from_address_id(label, network), to_address:treasury_addresses!to_address_id(label, network)")
      .order("created_at", { ascending: false })
      .limit(15),
    supabase
      .from("admin_audit_log")
      .select("actor_email, action, entity_kind, entity_id, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("deposit_addresses").select("family, address").eq("active", true),
  ]);

  const byFamily = Object.fromEntries((depositRes.data ?? []).map((r) => [r.family, r.address])) as Record<string, string>;
  const oobleDepositAddresses: Record<string, string> = {};
  for (const [net, fam] of [["trx", "tron"], ["bnb", "evm"], ["eth", "evm"], ["matic", "evm"], ["avax", "evm"], ["sol", "solana"]] as const) {
    if (byFamily[fam]) oobleDepositAddresses[net] = byFamily[fam];
  }

  const orders = (ordersRes.data ?? []) as Array<{
    id: string;
    side: string;
    status: string;
    cad_amount: number;
    usdt_amount: number;
    created_at: string;
    network: string | null;
    wallet_address: string | null;
    profiles: { full_name: string | null; email: string | null } | null;
  }>;

  let pendingOrders = 0;
  let inProgressOrders = 0;
  let completedToday = 0;
  let cancelledToday = 0;
  let volumeCadToday = 0;
  const alerts: string[] = [];

  for (const o of orders) {
    const isToday = o.created_at >= todayIso;
    if (o.status === "awaiting_payment" || o.status === "created") pendingOrders++;
    if (o.status === "payment_received" || o.status === "settling") inProgressOrders++;
    if (o.status === "completed" && isToday) {
      completedToday++;
      volumeCadToday += Number(o.cad_amount);
    }
    if ((o.status === "cancelled" || o.status === "expired") && isToday) cancelledToday++;
  }

  if (pendingOrders > 5) alerts.push(`${pendingOrders} commandes en attente : possible engorgement.`);
  if (inProgressOrders > 3) alerts.push(`${inProgressOrders} commandes en traitement simultané.`);

  const pendingKyc = kycCountRes.count ?? 0;
  if (pendingKyc > 5) alerts.push(`${pendingKyc} KYC en attente de vérification.`);

  const unreadMessages = mailCountRes.count ?? 0;
  if (unreadMessages > 3) alerts.push(`${unreadMessages} messages non lus.`);

  const currentRate = rateRes.data?.buy_rate ? Number(rateRes.data.buy_rate) : null;
  const sellRate = rateRes.data?.sell_rate ? Number(rateRes.data.sell_rate) : null;

  const recentOrders = orders.slice(0, 20).map((o) => ({
    ref: orderRef(o.id),
    type: o.side,
    status: DB_STATUS_LABEL[o.status] ?? o.status,
    cadAmount: Number(o.cad_amount),
    usdtAmount: Number(o.usdt_amount),
    client: o.profiles?.full_name?.trim() || "Client",
    clientEmail: o.profiles?.email ?? "",
    network: o.network ?? "",
    walletAddress: o.wallet_address ?? "",
    createdAt: new Date(o.created_at).toLocaleString("fr-CA", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }),
  }));

  // --- KYC details ---
  const kycRows = (kycDetailsRes.data ?? []) as Array<{
    id: string;
    status: string;
    result_payload: { doc_type?: string } | null;
    created_at: string;
    profiles: { full_name: string | null; email: string | null } | null;
  }>;
  const pendingKycDetails = kycRows.map((k) => ({
    clientName: k.profiles?.full_name?.trim() || "Client",
    email: k.profiles?.email ?? "",
    docType: k.result_payload?.doc_type ?? "Pièce d'identité",
    status: KYC_STATUS_LABEL[k.status] ?? k.status,
    submittedAt: new Date(k.created_at).toLocaleString("fr-CA", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }),
  }));

  // --- Mail threads with last messages ---
  const threadRows = (threadsRes.data ?? []) as Array<{
    id: string;
    client_name: string | null;
    client_email: string;
    subject: string;
    last_message_at: string;
    message_count: number;
    has_unread: boolean;
    status: string;
  }>;

  const unreadThreadIds = threadRows.filter((t) => t.has_unread).slice(0, 8).map((t) => t.id);
  const messagesByThread: Record<string, Array<{
    direction: string;
    from_name: string | null;
    body_text: string | null;
    created_at: string;
  }>> = {};

  if (unreadThreadIds.length > 0) {
    const { data: msgs } = await supabase
      .from("mail_messages")
      .select("thread_id, direction, from_name, body_text, created_at")
      .in("thread_id", unreadThreadIds)
      .order("created_at", { ascending: false })
      .limit(40);
    for (const m of (msgs ?? []) as Array<{
      thread_id: string;
      direction: string;
      from_name: string | null;
      body_text: string | null;
      created_at: string;
    }>) {
      if (!messagesByThread[m.thread_id]) messagesByThread[m.thread_id] = [];
      if (messagesByThread[m.thread_id].length < 3) {
        messagesByThread[m.thread_id].push(m);
      }
    }
  }

  const recentThreads = threadRows.map((t) => ({
    clientName: t.client_name?.trim() || "Client",
    clientEmail: t.client_email,
    subject: t.subject,
    lastMessageAt: new Date(t.last_message_at).toLocaleString("fr-CA", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }),
    messageCount: t.message_count,
    hasUnread: t.has_unread,
    lastMessages: (messagesByThread[t.id] ?? []).map((m) => ({
      direction: m.direction as "inbound" | "outbound",
      fromName: m.from_name ?? "",
      bodyPreview: snippet(m.body_text),
      createdAt: new Date(m.created_at).toLocaleString("fr-CA", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }),
    })),
  }));

  // --- Compliance flags ---
  const flagRows = (flagsRes.data ?? []) as Array<{
    id: string;
    flag_type: string;
    order_id: string | null;
    user_id: string | null;
    resolved: boolean;
    details: unknown;
    created_at: string;
  }>;
  const complianceFlags = flagRows.map((f) => ({
    flagType: f.flag_type,
    orderId: f.order_id,
    details: typeof f.details === "object" && f.details ? JSON.stringify(f.details).slice(0, 100) : "",
    createdAt: new Date(f.created_at).toLocaleString("fr-CA", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }),
  }));

  const unresolvedFlags = flagRows.length;
  if (unresolvedFlags > 0) alerts.push(`${unresolvedFlags} alerte(s) de conformité non résolue(s).`);

  // --- Treasury balances per network ---
  const snapRows = (treasuryRes.data ?? []) as Array<{
    balance_usdt: number;
    treasury_addresses: { network: string; label: string; active: boolean } | null;
  }>;
  const networkBalances: Record<string, { total: number; count: number }> = {};
  const seenAddresses = new Set<string>();
  for (const s of snapRows) {
    const addr = s.treasury_addresses;
    if (!addr || !addr.active) continue;
    const key = `${addr.network}-${addr.label}`;
    if (seenAddresses.has(key)) continue;
    seenAddresses.add(key);
    if (!networkBalances[addr.network]) networkBalances[addr.network] = { total: 0, count: 0 };
    networkBalances[addr.network].total += Number(s.balance_usdt);
    networkBalances[addr.network].count++;
  }
  const treasuryBalances = Object.entries(networkBalances).map(([network, v]) => ({
    network,
    totalUsdt: Math.round(v.total * 100) / 100,
    addressCount: v.count,
  }));

  // --- Client profiles ---
  const profileRows = (profilesRes.data ?? []) as Array<{
    full_name: string | null;
    email: string | null;
    account_type: string | null;
    kyc_status: string | null;
    phone: string | null;
    business_name: string | null;
    daily_limit_cad: number | null;
    created_at: string;
  }>;
  const recentProfiles = profileRows.map((p) => ({
    fullName: p.full_name?.trim() || "Client",
    email: p.email ?? "",
    accountType: p.account_type ?? "personal",
    kycStatus: KYC_STATUS_LABEL[p.kyc_status ?? ""] ?? (p.kyc_status ?? "Inconnu"),
    phone: p.phone ?? "",
    businessName: p.business_name ?? "",
    dailyLimitCad: Number(p.daily_limit_cad ?? 0),
    createdAt: new Date(p.created_at).toLocaleString("fr-CA", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
  }));

  // --- Blockchain transactions ---
  const btxRows = (blockchainTxRes.data ?? []) as Array<{
    order_id: string;
    network: string | null;
    tx_hash: string;
    direction: string;
    usdt_amount: number;
    confirmations: number;
    confirmed: boolean;
    created_at: string;
  }>;
  const recentBlockchainTx = btxRows.map((tx) => ({
    orderRef: orderRef(tx.order_id),
    network: tx.network ?? "",
    txHash: tx.tx_hash,
    direction: tx.direction,
    usdtAmount: Number(tx.usdt_amount),
    confirmations: tx.confirmations,
    confirmed: tx.confirmed,
    createdAt: new Date(tx.created_at).toLocaleString("fr-CA", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }),
  }));

  // --- Payment confirmations ---
  const pcRows = (paymentConfRes.data ?? []) as Array<{
    order_id: string;
    amount_cad: number;
    method: string;
    reference: string;
    direction: string;
    confirmed_at: string;
  }>;
  const recentPaymentConfirmations = pcRows.map((pc) => ({
    orderRef: orderRef(pc.order_id),
    amountCad: Number(pc.amount_cad),
    method: pc.method ?? "",
    reference: pc.reference ?? "",
    direction: pc.direction ?? "",
    confirmedAt: new Date(pc.confirmed_at).toLocaleString("fr-CA", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }),
  }));

  // --- Order events ---
  const oeRows = (orderEventsRes.data ?? []) as Array<{
    order_id: string;
    previous_status: string | null;
    new_status: string;
    actor: string | null;
    note: string | null;
    created_at: string;
  }>;
  const recentOrderEvents = oeRows.map((ev) => ({
    orderRef: orderRef(ev.order_id),
    previousStatus: DB_STATUS_LABEL[ev.previous_status ?? ""] ?? (ev.previous_status ?? ""),
    newStatus: DB_STATUS_LABEL[ev.new_status] ?? ev.new_status,
    actor: isAutoActor(ev.actor) ? OLI_NAME : ev.actor ?? OLI_NAME,
    note: ev.note ?? "",
    createdAt: new Date(ev.created_at).toLocaleString("fr-CA", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }),
  }));

  // --- Active announcements ---
  const annRows = (announcementsRes.data ?? []) as Array<{
    kind: string;
    title_fr: string;
    body_fr: string;
    created_at: string;
  }>;
  const activeAnnouncements = annRows.map((a) => ({
    kind: a.kind,
    titleFr: a.title_fr,
    bodyFr: a.body_fr,
    createdAt: new Date(a.created_at).toLocaleString("fr-CA", {
      day: "numeric",
      month: "short",
    }),
  }));

  // --- Maintenance windows ---
  const mwRows = (maintenanceRes.data ?? []) as Array<{
    title_fr: string;
    body_fr: string;
    starts_at: string;
    ends_at: string;
    active: boolean;
  }>;
  const maintenanceWindows = mwRows.map((mw) => ({
    titleFr: mw.title_fr,
    bodyFr: mw.body_fr,
    startsAt: new Date(mw.starts_at).toLocaleString("fr-CA"),
    endsAt: new Date(mw.ends_at).toLocaleString("fr-CA"),
    active: mw.active,
  }));

  // --- Treasury movements ---
  const tmRows = (treasuryMovRes.data ?? []) as Array<{
    amount_usdt: number;
    tx_hash: string | null;
    reason: string | null;
    notes: string | null;
    created_at: string;
    from_address: { label: string; network: string } | null;
    to_address: { label: string; network: string } | null;
  }>;
  const recentTreasuryMovements = tmRows.map((tm) => ({
    fromLabel: tm.from_address ? `${tm.from_address.label} (${tm.from_address.network})` : "Externe",
    toLabel: tm.to_address ? `${tm.to_address.label} (${tm.to_address.network})` : "Externe",
    amountUsdt: Number(tm.amount_usdt),
    txHash: tm.tx_hash ?? "",
    reason: tm.reason ?? "",
    notes: tm.notes ?? "",
    createdAt: new Date(tm.created_at).toLocaleString("fr-CA", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }),
  }));

  // --- Admin audit log ---
  const alRows = (auditLogRes.data ?? []) as Array<{
    actor_email: string | null;
    action: string;
    entity_kind: string | null;
    entity_id: string | null;
    created_at: string;
  }>;
  const recentAuditLog = alRows.map((al) => ({
    actorEmail: al.actor_email ?? OLI_NAME,
    action: al.action,
    entityKind: al.entity_kind ?? "",
    entityId: al.entity_id ?? "",
    createdAt: new Date(al.created_at).toLocaleString("fr-CA", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }),
  }));

  return {
    pendingOrders,
    inProgressOrders,
    completedToday,
    cancelledToday,
    volumeCadToday,
    pendingKyc,
    unreadMessages,
    currentRate,
    sellRate,
    recentOrders,
    alerts,
    oobleDepositAddresses,
    pendingKycDetails,
    recentThreads,
    complianceFlags,
    treasuryBalances,
    recentProfiles,
    recentBlockchainTx,
    recentPaymentConfirmations,
    recentOrderEvents,
    activeAnnouncements,
    maintenanceWindows,
    recentTreasuryMovements,
    recentAuditLog,
  };
}
