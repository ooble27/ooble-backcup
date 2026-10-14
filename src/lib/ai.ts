/**
 * Client des agents IA Ooble.
 *
 * Appelle la fonction edge `ai-assist` avec un JWT staff, qui route vers
 * l'agent demandé (draft-mail, summarize-client, ...). Chaque appel est
 * journalisé côté serveur dans `ai_calls` — cette lib est un fin
 * wrapper typé au-dessus de `supabase.functions.invoke`.
 *
 * Contrat de retour : `{ ok: true, ...payload }` ou `{ error }` — jamais
 * d'exception. L'UI décide comment afficher l'erreur (bandeau feedback
 * dans le composer, toast dans la fiche client, etc.).
 */
import { supabase } from "@/integrations/supabase/client";
import type { ClientProfile, ClientOrder } from "@/lib/adminClient";

/** Contexte client transmis à Claude — sans PII inutile. */
export interface AIClientContext {
  fullName: string;
  email: string;
  accountType: string;
  kycStatus: string;
  totalCad: number;
  orderCount: number;
  createdAt: string;
  businessName?: string | null;
  phone?: string | null;
}

/** Résumé d'ordre transmis à Claude. */
export interface AIOrderSummary {
  side: "buy" | "sell";
  usdt: number;
  cad: number;
  status: string;
  createdAt: string;
}

export function toAIClientContext(p: ClientProfile): AIClientContext {
  return {
    fullName: p.fullName,
    email: p.email,
    accountType: p.accountType,
    kycStatus: p.kycStatus,
    totalCad: p.totalCad,
    orderCount: p.orderCount,
    createdAt: p.createdAt,
    businessName: p.businessName,
    phone: p.phone,
  };
}

export function toAIOrderSummaries(orders: ClientOrder[]): AIOrderSummary[] {
  return orders.map((o) => ({
    side: o.side,
    usdt: o.usdtAmount,
    cad: o.cadAmount,
    status: o.status,
    createdAt: o.createdAt,
  }));
}

interface AICallError { error: string }

async function invoke<T>(body: Record<string, unknown>): Promise<T | AICallError> {
  const { data, error } = await supabase.functions.invoke("ai-assist", { body });
  if (error) {
    // Extraire le message réel du body de la réponse (le SDK Supabase le
    // cache dans error.context.body).
    try {
      const ctx = (error as unknown as { context?: Response }).context;
      if (ctx?.text) {
        const raw = await ctx.text();
        try {
          const parsed = JSON.parse(raw) as { error?: string };
          return { error: parsed.error ?? raw };
        } catch { return { error: raw }; }
      }
    } catch { /* ignore */ }
    return { error: error.message };
  }
  if (data?.error) return { error: data.error };
  return data as T;
}

// ────────────────────────────────────────────────────────────
// Agent 1 — Assistant rédaction mail
// ────────────────────────────────────────────────────────────

export interface DraftMailInput {
  intention: string;
  client?: AIClientContext | null;
  previousMails?: string;
  context?: PlatformContext;
}

export interface DraftMailResult {
  ok: true;
  subject: string;
  body: string;
  tokens: { in: number; out: number };
}

export async function draftMail(input: DraftMailInput): Promise<DraftMailResult | AICallError> {
  return invoke<DraftMailResult>({ agent: "draft-mail", ...input });
}

// ────────────────────────────────────────────────────────────
// Agent 2 — Résumé de dossier client
// ────────────────────────────────────────────────────────────

export interface SummarizeClientInput {
  client: AIClientContext;
  orders: AIOrderSummary[];
  notes?: string[];
}

export interface SummarizeClientResult {
  ok: true;
  summary: string;
  tokens: { in: number; out: number };
}

export async function summarizeClient(input: SummarizeClientInput): Promise<SummarizeClientResult | AICallError> {
  return invoke<SummarizeClientResult>({ agent: "summarize-client", ...input });
}

// ────────────────────────────────────────────────────────────
// Agent 3 — Rédaction campagne marketing
// ────────────────────────────────────────────────────────────

export interface DraftCampaignInput {
  intention: string;
  segment?: string;
  design?: string;
}

export interface DraftCampaignResult {
  ok: true;
  subject: string;
  preheader: string;
  eyebrow: string;
  headline: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  tokens: { in: number; out: number };
}

export async function draftCampaign(input: DraftCampaignInput): Promise<DraftCampaignResult | AICallError> {
  return invoke<DraftCampaignResult>({ agent: "draft-campaign", ...input });
}

// ────────────────────────────────────────────────────────────
// Agent 4 — Assistant contextuel temps réel (chat)
// ────────────────────────────────────────────────────────────

export interface PlatformContext {
  pendingOrders: number;
  inProgressOrders: number;
  completedToday: number;
  cancelledToday: number;
  volumeCadToday: number;
  pendingKyc: number;
  unreadMessages: number;
  currentRate: number | null;
  sellRate: number | null;
  recentOrders: Array<{
    ref: string;
    type: string;
    status: string;
    cadAmount: number;
    usdtAmount: number;
    client: string;
    clientEmail: string;
    network: string;
    walletAddress: string;
    createdAt: string;
  }>;
  alerts: string[];
  oobleDepositAddresses: Record<string, string>;
  pendingKycDetails: Array<{
    clientName: string;
    email: string;
    docType: string;
    status: string;
    submittedAt: string;
  }>;
  recentThreads: Array<{
    clientName: string;
    clientEmail: string;
    subject: string;
    lastMessageAt: string;
    messageCount: number;
    hasUnread: boolean;
    lastMessages: Array<{
      direction: "inbound" | "outbound";
      fromName: string;
      bodyPreview: string;
      createdAt: string;
    }>;
  }>;
  complianceFlags: Array<{
    flagType: string;
    orderId: string | null;
    details: string;
    createdAt: string;
  }>;
  treasuryBalances: Array<{
    network: string;
    totalUsdt: number;
    addressCount: number;
  }>;
  recentProfiles?: Array<{
    fullName: string;
    email: string;
    accountType: string;
    kycStatus: string;
    phone: string;
    businessName: string;
    dailyLimitCad: number;
    createdAt: string;
  }>;
  recentBlockchainTx?: Array<{
    orderRef: string;
    network: string;
    txHash: string;
    direction: string;
    usdtAmount: number;
    confirmations: number;
    confirmed: boolean;
    createdAt: string;
  }>;
  recentPaymentConfirmations?: Array<{
    orderRef: string;
    amountCad: number;
    method: string;
    reference: string;
    direction: string;
    confirmedAt: string;
  }>;
  recentOrderEvents?: Array<{
    orderRef: string;
    previousStatus: string;
    newStatus: string;
    actor: string;
    note: string;
    createdAt: string;
  }>;
  activeAnnouncements?: Array<{
    kind: string;
    titleFr: string;
    bodyFr: string;
    createdAt: string;
  }>;
  maintenanceWindows?: Array<{
    titleFr: string;
    bodyFr: string;
    startsAt: string;
    endsAt: string;
    active: boolean;
  }>;
  recentTreasuryMovements?: Array<{
    fromLabel: string;
    toLabel: string;
    amountUsdt: number;
    txHash: string;
    reason: string;
    notes: string;
    createdAt: string;
  }>;
  recentAuditLog?: Array<{
    actorEmail: string;
    action: string;
    entityKind: string;
    entityId: string;
    createdAt: string;
  }>;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ContextChatInput {
  messages: ChatMessage[];
  context: PlatformContext;
}

export interface PendingAction {
  toolUseId: string;
  tool: string;
  input: Record<string, unknown>;
  assistantContent: unknown[];
}

export interface ContextChatResult {
  ok: true;
  reply: string;
  tokens: { in: number; out: number };
  pendingAction?: PendingAction;
}

export async function contextChat(input: ContextChatInput): Promise<ContextChatResult | AICallError> {
  return invoke<ContextChatResult>({ agent: "context-chat", ...input });
}

// ────────────────────────────────────────────────────────────
// Exécution / rejet d'actions IA
// ────────────────────────────────────────────────────────────

export interface ExecuteActionInput {
  action: PendingAction;
  messages: ChatMessage[];
  context: PlatformContext;
}

export interface ExecuteActionResult {
  ok: true;
  reply: string;
  actionResult: { success: boolean; message?: string; error?: string };
  tokens: { in: number; out: number };
}

export async function executeAction(input: ExecuteActionInput): Promise<ExecuteActionResult | AICallError> {
  return invoke<ExecuteActionResult>({ agent: "execute-action", ...input });
}

export async function rejectAction(input: {
  action: PendingAction;
}): Promise<{ ok: true; reply: string } | AICallError> {
  return invoke<{ ok: true; reply: string }>({ agent: "reject-action", ...input });
}

export function isAIError<T extends { ok?: true }>(res: T | AICallError): res is AICallError {
  return "error" in res;
}
