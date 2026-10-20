// Fonction edge Ooble — agents IA (Claude / Anthropic).
//
// Une seule fonction héberge tous les agents pour simplifier le déploiement.
// Chaque agent = un handler avec un « system prompt » et une transformation
// entrée→sortie spécifique. Chaque appel est journalisé dans `ai_calls`
// (audit + coût). Auth : le staff appelle en tant qu’utilisateur connecté
// (JWT du browser), l’edge function vérifie is_staff() via un lookup sur
// la table user_roles.
//
// Agents implémentés (dans ce commit) :
//   - draft-mail        : rédige un mail à partir d’une intention staff
//   - summarize-client  : résume un dossier client 360° en 3-5 puces
//
// Agents à venir dans les prochains commits :
//   - kyc-analyze
//   - detect-anomalies
//   - classify-mail
//
// Secrets requis :
//   ANTHROPIC_API_KEY       clé Anthropic Messages API
//   SUPABASE_URL            (auto Supabase)
//   SUPABASE_SERVICE_ROLE_KEY (auto Supabase)

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ANTHROPIC_MODEL = "claude-opus-4-7";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function preview(text: string, len = 200): string {
  return text.length <= len ? text : `${text.slice(0, len)}…`;
}

// ────────────────────────────────────────────────────────────
// Appel à Claude Messages API (une seule primitive pour tous les agents).
// Renvoie le contenu texte + les compteurs de tokens.
// ────────────────────────────────────────────────────────────

interface ClaudeCallResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

async function callClaude(
  apiKey: string,
  system: string,
  userMessage: string,
  maxTokens = 1024,
): Promise<ClaudeCallResult> {
  return callClaudeMultiTurn(apiKey, system, [{ role: "user", content: userMessage }], maxTokens);
}

async function callClaudeMultiTurn(
  apiKey: string,
  system: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  maxTokens = 1024,
): Promise<ClaudeCallResult> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API ${res.status}: ${err.slice(0, 500)}`);
  }

  const data = await res.json();
  const text = (data.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("\n")
    .trim();
  return {
    text,
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  };
}

// ────────────────────────────────────────────────────────────
// Appel Claude avec tools (function calling)
// ────────────────────────────────────────────────────────────

interface ClaudeContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  // tool_result fields
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

interface ClaudeWithToolsResult {
  content: ClaudeContentBlock[];
  stopReason: string;
  inputTokens: number;
  outputTokens: number;
}

async function callClaudeWithTools(
  apiKey: string,
  system: string,
  messages: Array<{ role: string; content: string | ClaudeContentBlock[] }>,
  tools: unknown[],
  maxTokens = 2048,
  toolChoice?: { type: "auto" | "any" } | { type: "tool"; name: string },
): Promise<ClaudeWithToolsResult> {
  const body: Record<string, unknown> = {
    model: ANTHROPIC_MODEL,
    max_tokens: maxTokens,
    system,
    messages,
  };
  if (tools.length > 0) {
    body.tools = tools;
    if (toolChoice) body.tool_choice = toolChoice;
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API ${res.status}: ${err.slice(0, 500)}`);
  }

  const data = await res.json();
  return {
    content: data.content ?? [],
    stopReason: data.stop_reason ?? "end_turn",
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  };
}

// ────────────────────────────────────────────────────────────
// Handlers d'agents
// ────────────────────────────────────────────────────────────

/**
 * Agent 1 — Assistant rédaction mail.
 *
 * Entrée : intention en langage naturel + contexte client (nom, KYC, volume,
 * dernières commandes). Sortie : draft de mail complet en français,
 * markdown, ton Ooble, prêt à charger dans le composer.
 */
const SYSTEM_DRAFT_MAIL = `Tu es l'assistant de rédaction mail de Ooble, une plateforme canadienne d'échange USDC/CAD non-custodial réglementée par CANAFE.

Tu produis des mails en français québécois professionnel, jamais familier, jamais corporate creux. Ton : direct, précis, chaleureux mais sans effusion. On dit « vous », pas « tu ».

Tu as accès au contexte en temps réel de la plateforme (commandes, KYC, messagerie, trésorerie). Utilise ces informations pour rédiger des mails précis et personnalisés sans que le staff ait besoin de tout t'expliquer. Par exemple :
- Si le staff dit « dis-lui qu'on a reçu son paiement », cherche dans les commandes récentes pour trouver la commande du client et mentionne le bon montant et la bonne référence.
- Si le staff dit « relance pour le KYC », vérifie le statut KYC du client dans le contexte.
- Si le staff répond à un fil de discussion, lis les messages précédents pour comprendre la conversation.
- Tu connais les adresses de dépôt Ooble par réseau et les adresses wallet des clients (affichées dans les commandes). Ne demande JAMAIS au client une information que tu as déjà dans le contexte (adresse wallet, montant, référence, réseau).

Contraintes strictes :
- Structure : salutation « Bonjour {{prenom}}, », ne remplace PAS {{prenom}}, garde le placeholder, puis 2-4 paragraphes courts, puis une signature en 2 lignes (« Cordialement, » suivi de la marque au moment de l'insertion).
- Utilise du markdown simple : **gras** pour souligner un élément critique (référence, montant), * ou - pour les listes.
- Pour les appels à l'action, écris le lien seul sur sa ligne : \`[Reprendre la vérification](https://ooble.ca/app/verification)\`. Le composer le rendra en bouton.
- Quand tu TROUVES les vrais chiffres dans le contexte (montant, référence d'ordre, taux), utilise-les. Sinon, utilise des placeholders {{ref}}, {{montant}}, {{date}}.
- Vocabulaire Ooble : « USDC », « Interac e-Transfer », « CANAFE », « KYC », « ordre » (pas « transaction »), « réseau » (pas « blockchain » quand on parle à un client).
- Longueur : 80-180 mots. Un mail court est plus lu.
- Ne signe PAS le mail, la signature est ajoutée par le composer.
- N'utilise JAMAIS de tiret long (—) ni de tiret moyen (–) : remplace-les par une virgule, deux-points ou un point.

Ne produis QUE le corps du mail (sujet + corps), sans commentaire méta.

Format de sortie EXACT :
SUBJECT: <sujet du mail>

<corps du mail en markdown>`;

async function draftMail(
  apiKey: string,
  input: { intention: string; client?: ClientContext | null; previousMails?: string; platformContext?: PlatformContext },
): Promise<{ subject: string; body: string; call: ClaudeCallResult }> {
  let system = SYSTEM_DRAFT_MAIL;
  if (input.platformContext) {
    system += "\n\n" + platformContextToText(input.platformContext);
  }

  const parts: string[] = [];
  parts.push(`Intention du staff : ${input.intention}`);
  if (input.client) {
    parts.push("\nContexte client :");
    parts.push(clientContextToText(input.client));
  }
  if (input.previousMails) {
    parts.push("\nDerniers échanges avec ce client (historique du fil) :");
    parts.push(input.previousMails);
  }
  parts.push("\nProduit maintenant le mail au format demandé.");

  const call = await callClaude(apiKey, system, parts.join("\n"), 800);

  // Parse "SUBJECT: ...\n\n<body>"
  const subjMatch = /^SUBJECT:\s*(.+?)\n/i.exec(call.text);
  const subject = subjMatch ? subjMatch[1].trim() : "Message de Ooble";
  const body = subjMatch ? call.text.slice(subjMatch[0].length).trim() : call.text;
  return { subject, body, call };
}

/**
 * Agent 2 — Résumé de dossier client 360°.
 *
 * Entrée : profil + ordres + notes. Sortie : 4-6 puces markdown ultra-denses
 * qui donnent le contexte utile en 20 secondes de lecture.
 */
const SYSTEM_SUMMARIZE_CLIENT = `Tu es l'assistant compliance de Ooble. Tu produis des résumés de dossier client destinés à un agent qui reprend le dossier ou prépare un contact.

Contraintes :
- Format : 4 à 6 puces markdown, chacune une phrase courte.
- Contenu : (1) profil sommaire (nom, type, ancienneté), (2) volume et fréquence, (3) statut KYC, (4) points d'attention (KYC en attente, ordres bloqués, notes staff notables), (5) dernière activité, (6) recommandation si un signal évident.
- Chiffres : arrondis lisibles (« 12 450 $ CAD » pas « 12 456,78 »).
- Ton : neutre professionnel, factuel. Pas de conjecture. Pas de « il semble que ».
- Français.
- Longueur totale : 80-150 mots max.

Ne produis QUE les puces. Aucune intro, aucune conclusion.`;

async function summarizeClient(
  apiKey: string,
  input: { client: ClientContext; orders: OrderSummary[]; notes?: string[] },
): Promise<{ summary: string; call: ClaudeCallResult }> {
  const parts: string[] = [];
  parts.push("Profil client :");
  parts.push(clientContextToText(input.client));
  parts.push(`\nHistorique des ordres (${input.orders.length}) :`);
  if (input.orders.length === 0) {
    parts.push("Aucun ordre.");
  } else {
    for (const o of input.orders.slice(0, 30)) {
      parts.push(`- ${o.side === "buy" ? "Achat" : "Vente"} ${o.usdt} USDC / ${o.cad} CAD · ${o.status} · ${o.createdAt.slice(0, 10)}`);
    }
    if (input.orders.length > 30) parts.push(`... et ${input.orders.length - 30} autres.`);
  }
  if (input.notes && input.notes.length > 0) {
    parts.push("\nNotes internes staff :");
    for (const n of input.notes.slice(0, 20)) parts.push(`- ${n}`);
  }
  parts.push("\nProduis le résumé maintenant.");

  const call = await callClaude(apiKey, SYSTEM_SUMMARIZE_CLIENT, parts.join("\n"), 500);
  return { summary: call.text, call };
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

interface ClientContext {
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

interface OrderSummary {
  side: "buy" | "sell";
  usdt: number;
  cad: number;
  status: string;
  createdAt: string;
}

function clientContextToText(c: ClientContext): string {
  const nfCad = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 });
  const nfOrders = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 });
  const kycFr: Record<string, string> = {
    approved: "Approuvé",
    pending: "En attente de vérification",
    rejected: "Refusé",
    not_started: "Non commencé",
  };
  const lines = [
    `- Nom : ${c.fullName}`,
    `- E-mail : ${c.email}`,
    `- Type : ${c.accountType === "business" ? `Entreprise${c.businessName ? ` (${c.businessName})` : ""}` : "Individuel"}`,
    `- KYC : ${kycFr[c.kycStatus] ?? c.kycStatus}`,
    `- Volume cumulé : ${nfCad.format(c.totalCad)} $ CAD`,
    `- Commandes : ${nfOrders.format(c.orderCount)}`,
    `- Client depuis : ${c.createdAt.slice(0, 10)}`,
  ];
  if (c.phone) lines.push(`- Téléphone : ${c.phone}`);
  return lines.join("\n");
}

/**
 * Vérifie que l'utilisateur appartient au staff. Requête directe sur
 * `user_roles` avec le service_role (RLS contournée) : suffit qu'une
 * ligne existe. Même définition que la fonction SQL `is_staff()` mais
 * sans passer par un RPC dont la sérialisation peut varier.
 */
async function isStaff(client: SupabaseClient, userId: string): Promise<boolean> {
  const { count, error } = await client
    .from("user_roles")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) return false;
  return (count ?? 0) > 0;
}

async function logCall(
  admin: SupabaseClient,
  args: {
    agent: string;
    staffId: string | null;
    inputPreview: string;
    call?: ClaudeCallResult;
    error?: string;
    startedAt: number;
  },
): Promise<void> {
  const durationMs = Date.now() - args.startedAt;
  await admin.from("ai_calls").insert({
    agent: args.agent,
    staff_id: args.staffId,
    input_preview: args.inputPreview,
    output_preview: args.call?.text ? preview(args.call.text) : null,
    model: ANTHROPIC_MODEL,
    input_tokens: args.call?.inputTokens ?? null,
    output_tokens: args.call?.outputTokens ?? null,
    duration_ms: durationMs,
    status: args.error ? "error" : "ok",
    error: args.error ?? null,
  });
}

// ────────────────────────────────────────────────────────────
// Router
// ────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────
// Agent 3 — Rédaction campagne marketing
// ────────────────────────────────────────────────────────────

const SYSTEM_DRAFT_CAMPAIGN = `Tu es le rédacteur marketing de Ooble, une plateforme canadienne d'échange USDC/CAD non-custodial réglementée par CANAFE.

Tu produis du contenu d'e-mail marketing en français québécois professionnel. Ton : confiant, clair, engageant mais pas agressif. On vouvoie le client.

Contexte Ooble :
- Ooble permet d'acheter et vendre des USDC (stablecoin) en dollars canadiens via Interac e-Transfer.
- Plateforme non-custodial : les USDC sont envoyés directement au portefeuille du client.
- Réseaux supportés : Tron (TRC20), Ethereum (ERC20), Polygon, Solana, BNB Smart Chain (BEP20), Avalanche.
- KYC obligatoire (vérification d'identité) avant la première transaction.
- Vocabulaire : « USDC », « Interac e-Transfer », « ordre » (pas « transaction »), « réseau » (pas « blockchain » pour un client).

Contraintes :
- Le corps (body) est en markdown simple : **gras**, *italique*, listes (- ), liens [texte](url).
- Utilise {{prenom}} pour personnaliser avec le prénom du client. Ne remplace PAS ce placeholder.
- Ne mets PAS de salutation (pas de « Bonjour {{prenom}} ») car le design de l'email a son propre header.
- Le corps doit faire 60-150 mots. Court et percutant.
- N'invente pas de chiffres précis (taux, prix) sauf si le staff les a donnés.
- Le CTA (bouton) doit pointer vers une URL crédible d'Ooble (https://ooble.ca/app/acheter, https://ooble.ca/app, etc.).
- Ne signe PAS le mail.
- N'utilise JAMAIS de tiret long (—) ni de tiret moyen (–).

Format de sortie EXACT (JSON) :
{"subject":"...","preheader":"...","eyebrow":"...","headline":"...","body":"...","ctaLabel":"...","ctaUrl":"..."}

Règles pour chaque champ :
- subject : 40-60 caractères, accrocheur, pas de majuscules abusives
- preheader : 50-90 caractères, complète le sujet dans la boîte de réception
- eyebrow : 1-3 mots en majuscules (ex: NOUVEAU, OFFRE SPÉCIALE, MISE À JOUR)
- headline : 5-10 mots, le message clé, percutant
- body : contenu principal en markdown, 60-150 mots
- ctaLabel : 2-4 mots pour le bouton (ex: Acheter maintenant, En savoir plus)
- ctaUrl : URL Ooble pertinente

Ne produis QUE le JSON, sans commentaire, sans bloc code.`;

async function draftCampaign(
  apiKey: string,
  input: { intention: string; segment?: string; design?: string },
): Promise<{
  subject: string;
  preheader: string;
  eyebrow: string;
  headline: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  call: ClaudeCallResult;
}> {
  const parts: string[] = [];
  parts.push(`Intention de la campagne : ${input.intention}`);
  if (input.segment) parts.push(`Segment ciblé : ${input.segment}`);
  if (input.design) parts.push(`Design choisi : ${input.design}`);
  parts.push("\nProduit le JSON maintenant.");

  const call = await callClaude(apiKey, SYSTEM_DRAFT_CAMPAIGN, parts.join("\n"), 600);

  let parsed: Record<string, string>;
  try {
    const cleaned = call.text.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = {
      subject: "Nouvelle campagne Ooble",
      preheader: "",
      eyebrow: "NOUVEAU",
      headline: "Découvrez notre dernière nouveauté",
      body: call.text,
      ctaLabel: "En savoir plus",
      ctaUrl: "https://ooble.ca/app",
    };
  }

  return {
    subject: parsed.subject ?? "Nouvelle campagne Ooble",
    preheader: parsed.preheader ?? "",
    eyebrow: parsed.eyebrow ?? "NOUVEAU",
    headline: parsed.headline ?? "",
    body: parsed.body ?? "",
    ctaLabel: parsed.ctaLabel ?? "",
    ctaUrl: parsed.ctaUrl ?? "",
    call,
  };
}

// ────────────────────────────────────────────────────────────
// Outils IA (function calling) — actions concrètes
// ────────────────────────────────────────────────────────────

const AI_TOOLS = [
  {
    name: "send_email",
    description: "Envoie un email à un client Ooble. Utilise cet outil quand le staff demande d'envoyer un message, une relance ou une confirmation à un client. L'email sera présenté pour confirmation avant l'envoi effectif. Le corps doit être en français québécois professionnel, commencer par 'Bonjour [prénom],' et ne pas contenir de signature (elle est ajoutée automatiquement).",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Adresse e-mail du destinataire (cherche dans les données de la plateforme)" },
        subject: { type: "string", description: "Sujet de l'email, 40-70 caractères" },
        body: { type: "string", description: "Corps de l'email en markdown simple. Utilise **gras** pour les montants/références. Commence par 'Bonjour [prénom],'. Pas de signature." },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "update_order_status",
    description: "Change le statut d'une commande Ooble. Utilise cet outil quand le staff demande de marquer un paiement reçu, compléter, annuler, rembourser ou rouvrir une commande. L'action sera présentée pour confirmation.",
    input_schema: {
      type: "object",
      properties: {
        orderRef: { type: "string", description: "Référence de la commande (ex: OOB-A1B2C3D4), visible dans les données de la plateforme" },
        action: {
          type: "string",
          enum: ["recu", "termine", "annule", "rembourse", "rouvert"],
          description: "recu=paiement reçu, termine=complétée, annule=annulée, rembourse=remboursée, rouvert=rouvrir",
        },
        note: { type: "string", description: "Note optionnelle pour l'historique" },
      },
      required: ["orderRef", "action"],
    },
  },
  {
    name: "assign_order",
    description: "Prendre une commande en charge (l'assigner à l'opérateur courant, statut → En cours). Utilise quand le staff dit 'prends cette commande', 'je m'en occupe', 'assigne-moi'.",
    input_schema: {
      type: "object",
      properties: {
        orderRef: { type: "string", description: "Référence de la commande (ex: OOB-A1B2C3D4)" },
      },
      required: ["orderRef"],
    },
  },
  {
    name: "release_order",
    description: "Libérer une commande assignée et la remettre en file d'attente. Utilise quand le staff dit 'libère', 'remets en attente', 'je ne m'en occupe plus'.",
    input_schema: {
      type: "object",
      properties: {
        orderRef: { type: "string", description: "Référence de la commande (ex: OOB-A1B2C3D4)" },
      },
      required: ["orderRef"],
    },
  },
];

interface PendingAction {
  toolUseId: string;
  tool: string;
  input: Record<string, unknown>;
  assistantContent: ClaudeContentBlock[];
}

interface ActionResult {
  success: boolean;
  message?: string;
  error?: string;
}

// ────────────────────────────────────────────────────────────
// Helpers ordres — résolution par ref + transitions
// ────────────────────────────────────────────────────────────

async function resolveOrderByRef(
  admin: SupabaseClient,
  ref: string,
): Promise<{ id: string; status: string; side: string; assigned_to: string | null; cad_amount: number; usdt_amount: number; user_id: string } | null> {
  const prefix = ref.replace(/^OOB-/i, "").toLowerCase();
  if (prefix.length < 4) return null;
  const { data } = await admin
    .from("orders")
    .select("id, status, side, assigned_to, cad_amount, usdt_amount, user_id")
    .ilike("id", `${prefix}%`)
    .limit(1)
    .maybeSingle();
  return data as { id: string; status: string; side: string; assigned_to: string | null; cad_amount: number; usdt_amount: number; user_id: string } | null;
}

const ACTION_TO_DB_STATUS: Record<string, string> = {
  recu: "payment_received",
  termine: "completed",
  annule: "cancelled",
  rembourse: "refunded",
  rouvert: "awaiting_payment",
};

const VALID_FROM: Record<string, string[]> = {
  recu: ["created", "awaiting_payment", "settling"],
  termine: ["payment_received", "settling"],
  annule: ["created", "awaiting_payment", "payment_received", "settling"],
  rembourse: ["payment_received", "settling", "completed"],
  rouvert: ["completed", "cancelled", "expired", "refunded"],
};

const ORDER_ACTION_LABELS: Record<string, string> = {
  recu: "Paiement reçu",
  termine: "Terminée",
  annule: "Annulée",
  rembourse: "Remboursée",
  rouvert: "Rouverte",
};

function orderRefDisplay(id: string): string {
  return `OOB-${id.slice(0, 8).toUpperCase()}`;
}

async function executeOrderStatusChange(
  admin: SupabaseClient,
  staffId: string,
  orderRef: string,
  action: string,
  note?: string,
): Promise<ActionResult> {
  const order = await resolveOrderByRef(admin, orderRef);
  if (!order) return { success: false, error: `Commande ${orderRef} introuvable.` };

  const validFrom = VALID_FROM[action];
  if (!validFrom || !validFrom.includes(order.status)) {
    return { success: false, error: `Impossible : statut actuel « ${order.status} » ne permet pas l'action « ${ORDER_ACTION_LABELS[action] ?? action} ».` };
  }

  const newStatus = ACTION_TO_DB_STATUS[action];
  const update: Record<string, unknown> = { status: newStatus };
  if (action === "rouvert") {
    update.assigned_to = null;
    update.assigned_at = null;
  }

  const { error } = await admin.from("orders").update(update).eq("id", order.id);
  if (error) return { success: false, error: `Erreur DB : ${error.message}` };

  await admin.from("order_events").insert({
    order_id: order.id,
    previous_status: order.status,
    new_status: newStatus,
    actor: staffId,
    note: note ?? `Via assistant IA, ${ORDER_ACTION_LABELS[action]}`,
  });

  const ref = orderRefDisplay(order.id);
  return { success: true, message: `Commande ${ref} → ${ORDER_ACTION_LABELS[action]}` };
}

async function executeAssignOrder(
  admin: SupabaseClient,
  staffId: string,
  orderRef: string,
): Promise<ActionResult> {
  const order = await resolveOrderByRef(admin, orderRef);
  if (!order) return { success: false, error: `Commande ${orderRef} introuvable.` };

  const assignable = ["created", "awaiting_payment", "payment_received"];
  if (!assignable.includes(order.status)) {
    return { success: false, error: `Impossible de prendre en charge : statut actuel « ${order.status} ».` };
  }

  const { error } = await admin.from("orders").update({
    status: "settling",
    assigned_to: staffId,
    assigned_at: new Date().toISOString(),
  }).eq("id", order.id);
  if (error) return { success: false, error: `Erreur DB : ${error.message}` };

  await admin.from("order_events").insert({
    order_id: order.id,
    previous_status: order.status,
    new_status: "settling",
    actor: staffId,
    note: "Prise en charge via assistant IA",
  });

  const ref = orderRefDisplay(order.id);
  return { success: true, message: `Commande ${ref} prise en charge` };
}

async function executeReleaseOrder(
  admin: SupabaseClient,
  staffId: string,
  orderRef: string,
): Promise<ActionResult> {
  const order = await resolveOrderByRef(admin, orderRef);
  if (!order) return { success: false, error: `Commande ${orderRef} introuvable.` };

  if (order.status !== "settling") {
    return { success: false, error: `La commande n'est pas en cours de traitement (statut : « ${order.status} »).` };
  }

  const { error } = await admin.from("orders").update({
    status: "awaiting_payment",
    assigned_to: null,
    assigned_at: null,
  }).eq("id", order.id);
  if (error) return { success: false, error: `Erreur DB : ${error.message}` };

  await admin.from("order_events").insert({
    order_id: order.id,
    previous_status: order.status,
    new_status: "awaiting_payment",
    actor: staffId,
    note: "Libérée via assistant IA",
  });

  const ref = orderRefDisplay(order.id);
  return { success: true, message: `Commande ${ref} libérée` };
}

// ────────────────────────────────────────────────────────────
// Agent 4 — Assistant contextuel temps réel (chat)
// ────────────────────────────────────────────────────────────

const SYSTEM_CONTEXT_CHAT = `Tu es l'assistant IA du back-office Ooble, une plateforme canadienne d'échange USDC/CAD non-custodial réglementée par CANAFE.

Tu assistes le staff en temps réel avec l'état actuel de la plateforme (commandes, KYC, messagerie, trésorerie, taux).

RÈGLE ABSOLUE, OUTILS :
Quand le staff te demande d'effectuer une action (envoyer un email, modifier une commande, prendre en charge un ordre, etc.), tu DOIS appeler l'outil correspondant dans ta réponse. Ne te contente JAMAIS de décrire l'action verbalement sans appeler l'outil, le texte seul ne déclenche rien. L'action sera présentée au staff pour confirmation avant exécution, tu n'as pas besoin de demander confirmation toi-même, appelle directement l'outil.

Quand tu appelles un outil :
- Écris 1 phrase courte expliquant ce que tu fais, puis appelle l'outil dans la même réponse.
- Utilise les données du contexte (email du client, montants, références, taux), ne demande pas au staff ce que tu peux trouver toi-même.
- Pour les emails : ton Ooble (professionnel, chaleureux mais pas corporate), vocabulaire Ooble. Commence par « Bonjour [prénom], ». Pas de signature.
- Pour les commandes : utilise la référence OOB-XXXXXXXX visible dans les commandes récentes. Ne demande pas la référence si tu la vois dans le contexte.

Style de réponse, RÈGLES STRICTES :
Tu parles comme un collègue compétent, en phrases naturelles et fluides. JAMAIS en listes.

INTERDIT absolument :
- Les tirets (-) ou puces (•, *, >) pour structurer tes réponses. Écris des phrases et des paragraphes.
- Les tirets longs (—) et moyens (–), même au milieu d'une phrase.
- Les titres (pas de #, ##, ###).
- Le gras sur des mots ordinaires. Réserve **gras** uniquement aux chiffres clés (montants, nombres).
- Les formules creuses : « Voici », « En résumé », « N'hésitez pas », « Bien sûr ! ».
- Les énumérations numérotées (1. 2. 3.).

OBLIGATOIRE :
- Écris en paragraphes courts de 2-3 phrases. Sépare tes idées par des sauts de ligne, pas par des tirets.
- Une question simple = 2-3 phrases. Une analyse = 2-3 paragraphes courts.
- Va droit au fait dès la première phrase. Pas d'introduction.
- Vocabulaire Ooble : « ordre » (pas « transaction »), « réseau » (pas « blockchain »), « USDC », « Interac e-Transfer ».
- Ne fabrique jamais de chiffres. Si une info manque, dis-le.

Tu reçois l'état de la plateforme en contexte avant chaque question.`;

interface PlatformContext {
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
  oobleDepositAddresses?: Record<string, string>;
  pendingKycDetails?: Array<{
    clientName: string;
    email: string;
    docType: string;
    status: string;
    submittedAt: string;
  }>;
  recentThreads?: Array<{
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
  complianceFlags?: Array<{
    flagType: string;
    orderId: string | null;
    details: string;
    createdAt: string;
  }>;
  treasuryBalances?: Array<{
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

function platformContextToText(ctx: PlatformContext): string {
  const nf = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 });
  const lines = [
    "ÉTAT ACTUEL DE LA PLATEFORME :",
    `- Commandes en attente : ${ctx.pendingOrders}`,
    `- Commandes en cours de traitement : ${ctx.inProgressOrders}`,
    `- Complétées aujourd'hui : ${ctx.completedToday}`,
    `- Annulées aujourd'hui : ${ctx.cancelledToday}`,
    `- Volume CAD aujourd'hui : ${nf.format(ctx.volumeCadToday)} $`,
    `- KYC en attente de vérification : ${ctx.pendingKyc}`,
    `- Messages non lus : ${ctx.unreadMessages}`,
    `- Taux achat USDC/CAD : ${ctx.currentRate ? `1 USDC = ${nf.format(ctx.currentRate)} CAD` : "Non disponible"}`,
    `- Taux vente USDC/CAD : ${ctx.sellRate ? `1 USDC = ${nf.format(ctx.sellRate)} CAD` : "Non disponible"}`,
  ];

  if (ctx.recentOrders.length > 0) {
    lines.push(`\nDERNIÈRES COMMANDES (${ctx.recentOrders.length}) :`);
    for (const o of ctx.recentOrders.slice(0, 15)) {
      const net = o.network ? ` [${o.network}]` : "";
      const wallet = o.walletAddress && o.walletAddress !== "a generer" ? ` → ${o.walletAddress}` : "";
      lines.push(`- ${o.ref} · ${o.type === "buy" ? "Achat" : "Vente"} · ${nf.format(o.cadAmount)} CAD / ${nf.format(o.usdtAmount)} USDC · ${o.status} · ${o.client} (${o.clientEmail})${net}${wallet} · ${o.createdAt}`);
    }
  }

  if (ctx.pendingKycDetails && ctx.pendingKycDetails.length > 0) {
    lines.push(`\nSOUMISSIONS KYC RÉCENTES (${ctx.pendingKycDetails.length}) :`);
    for (const k of ctx.pendingKycDetails) {
      lines.push(`- ${k.clientName} (${k.email}) · ${k.docType} · Statut : ${k.status} · soumis le ${k.submittedAt}`);
    }
  }

  if (ctx.recentThreads && ctx.recentThreads.length > 0) {
    lines.push(`\nMESSAGERIE, CONVERSATIONS RÉCENTES (${ctx.recentThreads.length}) :`);
    for (const t of ctx.recentThreads) {
      const badge = t.hasUnread ? " 🔴 NON LU" : "";
      lines.push(`- ${t.clientName} (${t.clientEmail}) · « ${t.subject} » · ${t.messageCount} msg · ${t.lastMessageAt}${badge}`);
      if (t.lastMessages && t.lastMessages.length > 0) {
        for (const m of t.lastMessages) {
          const dir = m.direction === "inbound" ? "← Client" : "→ Staff";
          lines.push(`    ${dir} (${m.createdAt}): ${m.bodyPreview}`);
        }
      }
    }
  }

  if (ctx.treasuryBalances && ctx.treasuryBalances.length > 0) {
    const totalUsdt = ctx.treasuryBalances.reduce((s, b) => s + b.totalUsdt, 0);
    lines.push(`\nTRÉSORERIE USDC (total : ${nf.format(totalUsdt)} USDC) :`);
    for (const b of ctx.treasuryBalances) {
      lines.push(`- ${b.network.toUpperCase()} : ${nf.format(b.totalUsdt)} USDC (${b.addressCount} adresse${b.addressCount > 1 ? "s" : ""})`);
    }
  }

  if (ctx.complianceFlags && ctx.complianceFlags.length > 0) {
    lines.push(`\nALERTES CONFORMITÉ NON RÉSOLUES (${ctx.complianceFlags.length}) :`);
    const flagLabels: Record<string, string> = {
      large_transaction: "Grande opération (≥ 10 000 $ CAD)",
      suspicious_activity: "Activité suspecte",
      travel_rule: "Règle de voyage",
    };
    for (const f of ctx.complianceFlags) {
      const label = flagLabels[f.flagType] ?? f.flagType;
      const order = f.orderId ? ` · ordre ${f.orderId.slice(0, 8)}` : "";
      lines.push(`- ${label}${order} · ${f.createdAt}`);
    }
  }

  if (ctx.oobleDepositAddresses) {
    const networkLabels: Record<string, string> = {
      trx: "Tron (TRC20)",
      bnb: "BNB Smart Chain (BEP20)",
      eth: "Ethereum (ERC20)",
      matic: "Polygon",
      sol: "Solana",
      avax: "Avalanche",
    };
    lines.push("\nADRESSES DE DÉPÔT OOBLE (où les clients envoient leurs USDC pour les ordres de vente) :");
    for (const [net, addr] of Object.entries(ctx.oobleDepositAddresses)) {
      lines.push(`- ${networkLabels[net] ?? net} : ${addr}`);
    }
  }

  if (ctx.alerts.length > 0) {
    lines.push("\nALERTES OPÉRATIONNELLES :");
    for (const a of ctx.alerts) lines.push(`⚠ ${a}`);
  }

  if (ctx.recentProfiles && ctx.recentProfiles.length > 0) {
    lines.push(`\nCLIENTS INSCRITS (${ctx.recentProfiles.length} derniers) :`);
    for (const p of ctx.recentProfiles) {
      const biz = p.businessName ? ` · ${p.businessName}` : "";
      const phone = p.phone ? ` · ${p.phone}` : "";
      const limit = p.dailyLimitCad > 0 ? ` · limite ${nf.format(p.dailyLimitCad)} $/jour` : "";
      lines.push(`- ${p.fullName} (${p.email}) · ${p.accountType} · KYC: ${p.kycStatus}${biz}${phone}${limit} · inscrit le ${p.createdAt}`);
    }
  }

  if (ctx.recentBlockchainTx && ctx.recentBlockchainTx.length > 0) {
    lines.push(`\nTRANSACTIONS BLOCKCHAIN RÉCENTES (${ctx.recentBlockchainTx.length}) :`);
    for (const tx of ctx.recentBlockchainTx) {
      const status = tx.confirmed ? `✓ confirmée (${tx.confirmations})` : `en attente (${tx.confirmations} conf.)`;
      lines.push(`- ${tx.orderRef} · ${tx.direction} · ${nf.format(tx.usdtAmount)} USDC · ${tx.network} · ${status} · TX: ${tx.txHash.slice(0, 16)}… · ${tx.createdAt}`);
    }
  }

  if (ctx.recentPaymentConfirmations && ctx.recentPaymentConfirmations.length > 0) {
    lines.push(`\nCONFIRMATIONS DE PAIEMENT RÉCENTES (${ctx.recentPaymentConfirmations.length}) :`);
    for (const pc of ctx.recentPaymentConfirmations) {
      lines.push(`- ${pc.orderRef} · ${nf.format(pc.amountCad)} CAD · ${pc.method} · réf: ${pc.reference} · ${pc.direction} · ${pc.confirmedAt}`);
    }
  }

  if (ctx.recentOrderEvents && ctx.recentOrderEvents.length > 0) {
    lines.push(`\nHISTORIQUE D'ÉVÉNEMENTS COMMANDES (${ctx.recentOrderEvents.length} derniers) :`);
    for (const ev of ctx.recentOrderEvents) {
      const note = ev.note ? `, "${ev.note}"` : "";
      lines.push(`- ${ev.orderRef} · ${ev.previousStatus || "N/D"} → ${ev.newStatus} · par ${ev.actor}${note} · ${ev.createdAt}`);
    }
  }

  if (ctx.activeAnnouncements && ctx.activeAnnouncements.length > 0) {
    lines.push(`\nANNONCES ACTIVES (${ctx.activeAnnouncements.length}) :`);
    for (const a of ctx.activeAnnouncements) {
      lines.push(`- [${a.kind.toUpperCase()}] ${a.titleFr} · ${a.bodyFr} · ${a.createdAt}`);
    }
  }

  if (ctx.maintenanceWindows && ctx.maintenanceWindows.length > 0) {
    lines.push(`\nFENÊTRES DE MAINTENANCE :`);
    for (const mw of ctx.maintenanceWindows) {
      const status = mw.active ? "ACTIVE" : "planifiée";
      lines.push(`- ${mw.titleFr} · ${status} · du ${mw.startsAt} au ${mw.endsAt}, ${mw.bodyFr}`);
    }
  }

  if (ctx.recentTreasuryMovements && ctx.recentTreasuryMovements.length > 0) {
    lines.push(`\nMOUVEMENTS TRÉSORERIE RÉCENTS (${ctx.recentTreasuryMovements.length}) :`);
    for (const tm of ctx.recentTreasuryMovements) {
      const txInfo = tm.txHash ? ` · TX: ${tm.txHash.slice(0, 16)}…` : "";
      const notes = tm.notes ? `, ${tm.notes}` : "";
      lines.push(`- ${tm.fromLabel} → ${tm.toLabel} · ${nf.format(tm.amountUsdt)} USDC · ${tm.reason}${txInfo}${notes} · ${tm.createdAt}`);
    }
  }

  if (ctx.recentAuditLog && ctx.recentAuditLog.length > 0) {
    lines.push(`\nJOURNAL D'AUDIT ADMIN (${ctx.recentAuditLog.length} dernières actions) :`);
    for (const al of ctx.recentAuditLog) {
      const entity = al.entityKind ? ` · ${al.entityKind} ${al.entityId.slice(0, 8)}` : "";
      lines.push(`- ${al.actorEmail} · ${al.action}${entity} · ${al.createdAt}`);
    }
  }

  return lines.join("\n");
}

function detectActionIntent(messages: Array<{ role: string; content: string }>): boolean {
  const lastUserMsg = messages.filter((m) => m.role === "user").pop()?.content ?? "";
  const lm = lastUserMsg.toLowerCase();

  const wantsEmail =
    (/\benvoi[ers]?\b/.test(lm) && /\b(mail|email|courriel|message)\b/.test(lm)) ||
    (/\benvoi[ers]?\b/.test(lm) && /@/.test(lm)) ||
    (/\b(écri[st]|rédige)\w*\b/.test(lm) && /\b(mail|email|courriel)\b/.test(lm)) ||
    /\bdis[\s-]?(lui|leur|à)\b/.test(lm) ||
    (/\bmail\b/.test(lm) && /\b(pour|avec|dire|informer|prévenir|relancer|confirmer)\b/.test(lm));

  const wantsOrderAction =
    (/\b(annule|complète|termine|rembourse|rouvr)\w*\b/.test(lm) &&
      /\b(commande|ordre|OOB-)/i.test(lastUserMsg)) ||
    /\bprends?\s+(en\s+)?charge\b/.test(lm) ||
    /\bassign/i.test(lm) ||
    /\blibère\b/.test(lm) ||
    (/\bmarqu\w*\b/.test(lm) && /\b(reçu|payé|terminé|complété)\b/.test(lm));

  return wantsEmail || wantsOrderAction;
}

async function contextChat(
  apiKey: string,
  input: {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    context: PlatformContext;
  },
): Promise<{ reply: string; call: ClaudeCallResult; pendingAction?: PendingAction }> {
  const contextBlock = platformContextToText(input.context);
  const systemWithContext = `${SYSTEM_CONTEXT_CHAT}\n\n${contextBlock}`;

  const forceTools = detectActionIntent(input.messages);
  const result = await callClaudeWithTools(
    apiKey, systemWithContext, input.messages, AI_TOOLS, 2048,
    forceTools ? { type: "any" } : undefined,
  );

  const textParts = result.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n")
    .trim();

  const toolUse = result.content.find((b) => b.type === "tool_use");

  const call: ClaudeCallResult = {
    text: textParts,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };

  if (toolUse && toolUse.name && toolUse.id) {
    const TOOL_REPLY_FALLBACK: Record<string, string> = {
      send_email: "Je prépare l'email.",
      update_order_status: "Je modifie le statut de la commande.",
      assign_order: "Je prends la commande en charge.",
      release_order: "Je libère la commande.",
    };
    const reply = textParts || TOOL_REPLY_FALLBACK[toolUse.name] || "Action en cours.";
    return {
      reply,
      call,
      pendingAction: {
        toolUseId: toolUse.id,
        tool: toolUse.name,
        input: toolUse.input ?? {},
        assistantContent: result.content,
      },
    };
  }

  return { reply: textParts, call };
}

// ────────────────────────────────────────────────────────────
// Exécution d'actions confirmées + helpers email
// ────────────────────────────────────────────────────────────

function markdownToSimpleHtml(md: string): string {
  let html = md
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" style="color:#000;text-decoration:underline;">$1</a>');

  return html
    .split("\n\n")
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      const lines = trimmed.split("\n");
      const isList = lines.every((l) => /^\s*[-*]\s/.test(l) || l.trim() === "");
      if (isList) {
        const items = lines
          .filter((l) => l.trim())
          .map((l) => `<li style="margin:4px 0;font-size:15px;line-height:1.6;">${l.replace(/^\s*[-*]\s+/, "")}</li>`)
          .join("");
        return `<ul style="margin:8px 0;padding-left:20px;">${items}</ul>`;
      }
      return `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">${trimmed.replace(/\n/g, "<br/>")}</p>`;
    })
    .filter(Boolean)
    .join("");
}

async function sendEmailViaEdge(
  supabaseUrl: string,
  serviceKey: string,
  to: string,
  subject: string,
  bodyMd: string,
): Promise<{ id?: string; error?: string }> {
  const html = markdownToSimpleHtml(bodyMd);
  const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ to, subject, html }),
  });
  const data = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok || (data as { error?: string }).error) {
    return { error: (data as { error?: string }).error ?? `HTTP ${res.status}` };
  }
  return { id: (data as { id?: string }).id };
}

async function executeAction(
  apiKey: string,
  supabaseUrl: string,
  serviceKey: string,
  admin: SupabaseClient,
  staffId: string,
  input: {
    action: PendingAction;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    context: PlatformContext;
  },
): Promise<{ reply: string; call: ClaudeCallResult; actionResult: ActionResult }> {
  let actionResult: ActionResult;

  if (input.action.tool === "send_email") {
    const params = input.action.input as { to: string; subject: string; body: string };
    const emailRes = await sendEmailViaEdge(supabaseUrl, serviceKey, params.to, params.subject, params.body);
    actionResult = emailRes.error
      ? { success: false, error: emailRes.error }
      : { success: true, message: `Email envoyé à ${params.to}` };
  } else if (input.action.tool === "update_order_status") {
    const params = input.action.input as { orderRef: string; action: string; note?: string };
    actionResult = await executeOrderStatusChange(admin, staffId, params.orderRef, params.action, params.note);
  } else if (input.action.tool === "assign_order") {
    const params = input.action.input as { orderRef: string };
    actionResult = await executeAssignOrder(admin, staffId, params.orderRef);
  } else if (input.action.tool === "release_order") {
    const params = input.action.input as { orderRef: string };
    actionResult = await executeReleaseOrder(admin, staffId, params.orderRef);
  } else {
    actionResult = { success: false, error: `Outil inconnu : ${input.action.tool}` };
  }

  const contextBlock = platformContextToText(input.context);
  const systemWithContext = `${SYSTEM_CONTEXT_CHAT}\n\n${contextBlock}`;

  const resumeMessages: Array<{ role: string; content: string | ClaudeContentBlock[] }> = [
    ...input.messages,
    { role: "assistant", content: input.action.assistantContent },
    {
      role: "user",
      content: [{
        type: "tool_result",
        tool_use_id: input.action.toolUseId,
        content: actionResult.success
          ? (actionResult.message ?? "Action effectuée.")
          : `Erreur : ${actionResult.error}`,
      }] as unknown as ClaudeContentBlock[],
    },
  ];

  const result = await callClaudeWithTools(apiKey, systemWithContext, resumeMessages, AI_TOOLS, 1024);

  const reply = result.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n")
    .trim();

  return {
    reply: reply || (actionResult.success ? "Action effectuée." : "L'action a échoué."),
    call: {
      text: reply,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    },
    actionResult,
  };
}

interface Payload {
  agent: "draft-mail" | "summarize-client" | "draft-campaign" | "context-chat" | "execute-action" | "reject-action";
  // draft-mail / draft-campaign
  intention?: string;
  client?: ClientContext | null;
  previousMails?: string;
  // draft-campaign
  segment?: string;
  design?: string;
  // summarize-client
  orders?: OrderSummary[];
  notes?: string[];
  // context-chat + draft-mail (platform awareness)
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
  context?: PlatformContext;
  // execute-action / reject-action
  action?: PendingAction;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!anthropicKey) return json({ error: "ANTHROPIC_API_KEY manquant." }, 500);
  if (!supabaseUrl || !serviceKey) return json({ error: "Configuration Supabase manquante." }, 500);

  // Auth : lire le JWT du client pour identifier le staff.
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Authentification requise." }, 401);

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData.user) return json({ error: "Session invalide." }, 401);
  const userId = userData.user.id;

  if (!(await isStaff(admin, userId))) {
    return json({
      error: `Accès réservé au staff. Aucun rôle trouvé pour ${userData.user.email ?? userId}. Ajouter une ligne dans user_roles.`,
    }, 403);
  }

  let payload: Payload;
  try { payload = await req.json(); }
  catch { return json({ error: "JSON invalide." }, 400); }

  const startedAt = Date.now();
  try {
    if (payload.agent === "draft-mail") {
      const intention = payload.intention?.trim();
      if (!intention) return json({ error: "Champ 'intention' requis." }, 400);
      const inputPreview = preview(intention);
      const { subject, body, call } = await draftMail(anthropicKey, {
        intention,
        client: payload.client ?? null,
        previousMails: payload.previousMails,
        platformContext: payload.context,
      });
      await logCall(admin, { agent: "draft-mail", staffId: userId, inputPreview, call, startedAt });
      return json({ ok: true, subject, body, tokens: { in: call.inputTokens, out: call.outputTokens } });
    }

    if (payload.agent === "draft-campaign") {
      const intention = payload.intention?.trim();
      if (!intention) return json({ error: "Champ 'intention' requis." }, 400);
      const inputPreview = preview(intention);
      const result = await draftCampaign(anthropicKey, {
        intention,
        segment: payload.segment,
        design: payload.design,
      });
      await logCall(admin, { agent: "draft-campaign", staffId: userId, inputPreview, call: result.call, startedAt });
      return json({
        ok: true,
        subject: result.subject,
        preheader: result.preheader,
        eyebrow: result.eyebrow,
        headline: result.headline,
        body: result.body,
        ctaLabel: result.ctaLabel,
        ctaUrl: result.ctaUrl,
        tokens: { in: result.call.inputTokens, out: result.call.outputTokens },
      });
    }

    if (payload.agent === "summarize-client") {
      if (!payload.client) return json({ error: "Champ 'client' requis." }, 400);
      const inputPreview = preview(`Résumé de ${payload.client.fullName ?? payload.client.email}`);
      const { summary, call } = await summarizeClient(anthropicKey, {
        client: payload.client,
        orders: payload.orders ?? [],
        notes: payload.notes,
      });
      await logCall(admin, { agent: "summarize-client", staffId: userId, inputPreview, call, startedAt });
      return json({ ok: true, summary, tokens: { in: call.inputTokens, out: call.outputTokens } });
    }

    if (payload.agent === "context-chat") {
      if (!payload.messages || payload.messages.length === 0) return json({ error: "Champ 'messages' requis." }, 400);
      if (!payload.context) return json({ error: "Champ 'context' requis." }, 400);
      const lastMsg = payload.messages[payload.messages.length - 1];
      const inputPreview = preview(lastMsg?.content ?? "");
      const { reply, call, pendingAction } = await contextChat(anthropicKey, {
        messages: payload.messages,
        context: payload.context,
      });
      await logCall(admin, { agent: "context-chat", staffId: userId, inputPreview, call, startedAt });
      const response: Record<string, unknown> = {
        ok: true,
        reply,
        tokens: { in: call.inputTokens, out: call.outputTokens },
      };
      if (pendingAction) response.pendingAction = pendingAction;
      return json(response);
    }

    if (payload.agent === "execute-action") {
      if (!payload.action) return json({ error: "Champ 'action' requis." }, 400);
      if (!payload.messages || payload.messages.length === 0) return json({ error: "Champ 'messages' requis." }, 400);
      if (!payload.context) return json({ error: "Champ 'context' requis." }, 400);
      const inputPreview = preview(`Exécution : ${payload.action.tool} → ${JSON.stringify(payload.action.input).slice(0, 150)}`);
      const result = await executeAction(anthropicKey, supabaseUrl, serviceKey, admin, userId, {
        action: payload.action,
        messages: payload.messages,
        context: payload.context,
      });
      await logCall(admin, { agent: "execute-action", staffId: userId, inputPreview, call: result.call, startedAt });
      return json({
        ok: true,
        reply: result.reply,
        actionResult: result.actionResult,
        tokens: { in: result.call.inputTokens, out: result.call.outputTokens },
      });
    }

    if (payload.agent === "reject-action") {
      return json({ ok: true, reply: "D'accord, l'action a été annulée." });
    }

    return json({ error: `Agent inconnu : ${payload.agent}` }, 400);
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    await logCall(admin, {
      agent: payload.agent ?? "unknown",
      staffId: userId,
      inputPreview: preview(JSON.stringify(payload).slice(0, 200)),
      error: errMsg,
      startedAt,
    });
    return json({ error: errMsg }, 500);
  }
});
