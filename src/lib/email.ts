/**
 * Envoi d'e-mails via la fonction edge `send-email` (Resend).
 *
 * Deux modes :
 *   - `template` : envoi transactionnel (welcome, order-buy, …), déclenché
 *     automatiquement par la plateforme sur événement (paiement reçu, etc.).
 *   - `custom` : le staff écrit le contenu depuis le back-office (sujet libre,
 *     corps HTML libre). Aucun template n'est imposé.
 *
 * Le retour est toujours `{ id?, error? }` — jamais d'exception.
 */
import { supabase } from "@/integrations/supabase/client";

/** Templates transactionnels disponibles (voir supabase/functions/send-email/templates.ts). */
export type EmailTemplate =
  | "welcome"
  | "order-buy"
  | "order-sell"
  | "payment-received"
  | "usdt-received"
  | "order-completed"
  | "kyc-approved"
  | "kyc-rejected"
  | "kyb-approved"
  | "kyb-rejected"
  | "newsletter";

export interface SendEmailInput {
  to: string;
  template: EmailTemplate;
  vars?: Record<string, string>;
  subject?: string;
}

interface SendResult { id?: string; error?: string }

async function invoke(input: unknown): Promise<SendResult> {
  const body = input as Record<string, unknown>;
  let { data, error } = await supabase.functions.invoke("send-email", { body });
  // Session refusée (jeton périmé) : on la rafraîchit, puis un seul nouvel essai.
  if (error && (error as unknown as { context?: Response }).context?.status === 401) {
    const { error: refreshErr } = await supabase.auth.refreshSession();
    if (!refreshErr) ({ data, error } = await supabase.functions.invoke("send-email", { body }));
  }
  // Le SDK Supabase renvoie « Edge Function returned a non-2xx status code »
  // et cache le vrai message dans `error.context.body`. On extrait le détail
  // pour que l'UI puisse afficher ce qui a vraiment échoué (clé Resend absente,
  // domaine non vérifié, adresse invalide, etc.).
  if (error) {
    let detail: string | undefined;
    try {
      const ctx = (error as unknown as { context?: Response }).context;
      if (ctx?.text) {
        const raw = await ctx.text();
        try {
          const parsed = JSON.parse(raw) as { error?: string; message?: string };
          detail = parsed.error ?? parsed.message ?? raw;
        } catch {
          detail = raw;
        }
      }
    } catch { /* ignore : on retombe sur error.message */ }
    return { error: detail || error.message };
  }
  if (data?.error) return { error: data.error };
  return { id: data?.id };
}

/**
 * Envoi par template (rétrocompatible avec le code existant).
 * Nécessite un domaine vérifié chez Resend + les secrets configurés.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendResult> {
  return invoke(input);
}

/**
 * Envoi libre depuis le back-office : le staff a écrit le sujet et le corps
 * HTML lui-même. L'edge function encapsule le corps dans le layout Ooble
 * (header/footer monochromes) pour rester cohérent avec la marque.
 */
export async function sendCustomEmail(input: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
}): Promise<SendResult> {
  return invoke(input);
}

/**
 * Notification interne : prévient le staff qu'un nouvel ordre vient d'être
 * créé. Le destinataire côté staff est déterminé côté serveur (variable
 * d'env STAFF_NOTIFICATION_EMAIL — jamais exposée au client) : le client
 * ne peut pas rediriger la notification ailleurs.
 *
 * Best-effort : si la config manque, l'edge function répond en douceur et
 * on ne remonte pas d'erreur à l'utilisateur — l'ordre lui-même est déjà
 * enregistré, la notif est un plus.
 */
export interface StaffNewOrderInput {
  ref: string;
  /** Cryptomonnaie de la commande (USDT par défaut) : le courriel la nomme. */
  asset?: string;
  side: "buy" | "sell";
  cadAmount: string;
  usdtAmount: string;
  network: string;
  address: string;
  clientEmail: string;
  clientName: string;
  adminUrl: string;
}

export async function notifyStaffOfNewOrder(order: StaffNewOrderInput): Promise<SendResult> {
  return invoke({ staffNotify: "new-order", order });
}

export async function sendRefundEmail(input: {
  to: string;
  clientName: string;
  ref: string;
  amount: string;
}): Promise<SendResult> {
  const subject = `Remboursement de votre commande ${input.ref} · Ooble`;
  const html = `
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:600;">Remboursement confirmé</h2>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Bonjour ${escHtml(input.clientName)},</p>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">
      Votre commande <strong>${escHtml(input.ref)}</strong> a été remboursée.
    </p>
    <div style="margin:20px 0;padding:16px 20px;background:#f5f5f5;border-radius:12px;">
      <p style="margin:0;font-size:13px;color:#666;text-transform:uppercase;letter-spacing:0.05em;">Montant remboursé</p>
      <p style="margin:4px 0 0;font-size:22px;font-weight:700;">${escHtml(input.amount)}</p>
    </div>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">
      Le remboursement a été effectué et le montant est disponible dans votre compte.
    </p>
    <p style="margin:24px 0 0;font-size:14px;color:#666;">
      Si vous avez des questions, n'hésitez pas à nous contacter.<br/>
      L'équipe Ooble
    </p>
  `;
  return sendCustomEmail({ to: input.to, subject, html });
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Courriel de campagne : `html` est déjà complet (modèle du back-office),
 * il part tel quel, avec l'en-tête de désabonnement. Réservé au staff.
 */
export async function sendCampaignEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  unsubscribeUrl: string;
}): Promise<SendResult> {
  const { unsubscribeUrl, ...rest } = input;
  return invoke({ ...rest, campaign: { unsubscribeUrl } });
}
