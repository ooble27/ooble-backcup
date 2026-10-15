// Fonction edge Ooble — envoi d'e-mails via Resend.
//
// Trois modes :
//
//   ─── Mode « custom » (staff écrit librement) ────────────────
//   POST JSON :
//     { "to": "…", "subject": "…", "html": "<p>…</p>",
//       "text": "(optionnel, sinon dérivé du HTML)",
//       "replyTo": "(optionnel)",
//       "cc": ["…"], "bcc": ["…"] }
//
//   Le corps `html` est encapsulé dans le layout Ooble (header + footer
//   monochromes) pour rester cohérent avec la marque.
//
//   ─── Mode « template » (transactionnel) ─────────────────────
//   POST JSON :
//     { "to": "…", "template": "welcome" | "order-buy" | …,
//       "vars": { … }, "subject": "(optionnel)" }
//
//   ─── Mode « staffNotify » (notification interne) ────────────
//   POST JSON :
//     { "staffNotify": "new-order",
//       "order": { ref, side, cadAmount, usdtAmount, network, address,
//                  clientEmail, clientName, adminUrl } }
//
//   Les destinataires sont lus côté serveur : Back-office › Réglages › Alertes de l'équipe
//   (app_private_settings, réservé aux administrateurs), sinon STAFF_NOTIFICATION_EMAIL —
//   jamais fournis par le client — pour qu'aucun appel navigateur ne
//   puisse rediriger la notification ailleurs.
//
// Secrets requis (Supabase → Edge Functions → Secrets) :
//   RESEND_API_KEY              clé API Resend
//   EMAIL_FROM                  ex. "Ooble <bonjour@ooble.ca>" (domaine vérifié)
//   STAFF_NOTIFICATION_EMAIL    destinataire des notifs internes si aucun n'est choisi dans les Réglages
//   EMAIL_ASSET_BASE            ex. "https://ooble.ca/email-assets"

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { TEMPLATES, SUBJECTS } from "./templates.ts";
import {
  wrapCustomBody, htmlToText,
  eyebrow, heading, lead, dataRows, primaryButton,
} from "./layout.ts";


/**
 * Envoi à Resend avec reprise : quand beaucoup de courriels partent en même
 * temps (rafale de commandes), Resend répond 429 au-delà de son débit ; on
 * réessaie alors après le délai indiqué (ou 1 s, 2 s, 4 s). La même clé
 * d'idempotence évite tout doublon si une réponse se perd en route.
 */
async function resendPost(apiKey: string, payload: unknown): Promise<Response> {
  const idem = crypto.randomUUID();
  let res: Response | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idem },
        body: JSON.stringify(payload),
      });
      if (res.status !== 429 && res.status < 500) return res;
    } catch (e) {
      if (attempt === 3) throw e;
    }
    if (attempt === 3) break;
    const after = Number(res?.headers.get("retry-after"));
    await new Promise((r) => setTimeout(r, after > 0 ? Math.min(after, 10) * 1000 : 1000 * 2 ** attempt));
  }
  return res!;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Qui reçoit les alertes internes (nouvelle commande, message de contact) : la liste choisie dans
 * Back-office › Réglages › Alertes de l'équipe ; à défaut, le secret STAFF_NOTIFICATION_EMAIL.
 */
async function staffRecipients(): Promise<string[]> {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (url && key) {
    const { data } = await createClient(url, key).from("app_private_settings").select("staff_alert_emails").eq("id", 1).maybeSingle();
    const list = ((data?.staff_alert_emails ?? []) as string[]).map((e) => e.trim()).filter((e) => /^\S+@\S+\.\S+$/.test(e));
    if (list.length) return list;
  }
  const secret = Deno.env.get("STAFF_NOTIFICATION_EMAIL")?.trim();
  return secret ? [secret] : [];
}

/** Échappe le HTML (données saisies côté client). */
function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Remplace {{clé}} par la valeur ; laisse les clés inconnues intactes. */
function render(str: string, data: Record<string, string>): string {
  return str.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in data ? data[k] : m));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

interface StaffOrderPayload {
  ref: string;
  side: "buy" | "sell";
  cadAmount: string;
  usdtAmount: string;
  network: string;
  address: string;
  clientEmail: string;
  clientName: string;
  adminUrl: string;
}

interface Payload {
  to?: string;
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  subject?: string;
  // Mode template
  template?: string;
  vars?: Record<string, string>;
  // Mode custom
  html?: string;
  text?: string;
  // Mode staffNotify
  staffNotify?: "new-order";
  order?: StaffOrderPayload;
  // Mode contact (page /contact, ouvert à tous)
  contact?: ContactPayload;
  // Mode campagne (staff) : `html` est un courriel complet, envoyé tel quel
  campaign?: { unsubscribeUrl?: string };
}

interface ContactPayload {
  name?: string;
  email?: string;
  subject?: string;
  message?: string;
  website?: string; // champ piège invisible : rempli seulement par les robots
  desk?: string;    // "otc" : demande du desk gros volumes → boîte otc@ooble.ca
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("EMAIL_FROM") ?? "Ooble <onboarding@resend.dev>";
  const assetBase = Deno.env.get("EMAIL_ASSET_BASE") ?? "https://ooble.ca/email-assets";
  if (!apiKey) return json({ error: "RESEND_API_KEY manquant." }, 500);

  let payload: Payload;
  try { payload = await req.json(); }
  catch { return json({ error: "JSON invalide." }, 400); }

  const {
    to: rawTo, cc, bcc, replyTo, subject, template, vars = {}, html, text,
    staffNotify, order,
  } = payload;

  // ─── Formulaire de contact du site (visiteurs non connectés) ─
  if (payload.contact) return handleContact(payload.contact, req, apiKey, from);

  // ─── Qui appelle ? ─────────────────────────────────────────
  // Sans ce contrôle, n'importe qui (la clé publique est dans le site)
  // pourrait envoyer des e-mails arbitraires depuis le domaine Ooble.
  //   • autres fonctions edge : clé service_role → tout est permis ;
  //   • staff (au moins un rôle dans user_roles) → tout est permis ;
  //   • client connecté → uniquement un modèle transactionnel envoyé à
  //     SA propre adresse, ou la notification interne de SA commande.
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  let callerIsStaff = token !== "" && token === serviceKey;
  if (!callerIsStaff) {
    if (!token || !supabaseUrl || !serviceKey) return json({ error: "Authentification requise." }, 401);
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: auth } = await admin.auth.getUser(token);
    const user = auth?.user;
    if (!user) return json({ error: "Session invalide ou expirée." }, 401);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    callerIsStaff = (roles ?? []).length > 0;
    if (!callerIsStaff) {
      const own = (user.email ?? "").trim().toLowerCase();
      const okTemplate = !!template && !html && !cc?.length && !bcc?.length && !replyTo
        && own !== "" && (rawTo ?? "").trim().toLowerCase() === own;
      const okStaffNotify = staffNotify === "new-order"
        && own !== "" && (order?.clientEmail ?? "").trim().toLowerCase() === own;
      if (!okTemplate && !okStaffNotify) return json({ error: "Envoi non autorisé." }, 403);
    }
  }

  let finalHtml: string;
  let finalText: string | undefined;
  let finalSubject: string;
  let to: string | string[] | undefined = rawTo;

  if (staffNotify === "new-order") {
    // ─── Mode staffNotify — destinataire déterminé côté serveur ─
    const staffTo = await staffRecipients();
    if (!staffTo.length) {
      return json({
        error: "Aucun destinataire : choisissez qui reçoit les alertes dans Back-office › Réglages › Alertes de l'équipe.",
      }, 500);
    }
    if (!order?.ref) return json({ error: "Champ 'order' requis (avec ref, side, montants…)." }, 400);
    to = staffTo;
    const safe = Object.fromEntries(
      Object.entries(order).map(([k, v]) => [k, escHtml(String(v ?? ""))]),
    ) as unknown as StaffOrderPayload;
    if (!callerIsStaff || !/^https:\/\//.test(order.adminUrl ?? "")) {
      safe.adminUrl = `${Deno.env.get("SITE_URL") ?? "https://ooble.ca"}/admin`;
    }
    const built = buildStaffNewOrder(safe, assetBase);
    finalHtml = built.html;
    finalText = built.text;
    finalSubject = built.subject;
  } else if (!rawTo) {
    return json({ error: "Champ 'to' requis." }, 400);
  } else if (template) {
    // ─── Mode template ────────────────────────────────────
    if (!(template in TEMPLATES)) {
      return json({ error: `Template inconnu : ${template}` }, 400);
    }
    const safeVars = Object.fromEntries(
      Object.entries(vars).map(([k, v]) => [k, k.endsWith("Html") ? String(v ?? "") : escHtml(String(v ?? "")).replace(/\r?\n/g, "<br>")]),
    );
    const data: Record<string, string> = {
      assetBase,
      year: String(new Date().getFullYear()),
      unsubscribeUrl: vars.unsubscribeUrl ?? "#",
      txLabel: "Transaction",
      ...safeVars,
    };
    finalHtml = render(TEMPLATES[template], data);
    finalSubject = render(subject ?? SUBJECTS[template] ?? "Ooble", data);
    finalText = text; // laissé optionnel pour les templates
  } else if (html && payload.campaign) {
    // ─── Mode campagne : courriel complet construit par le back-office ─
    if (!subject?.trim()) return json({ error: "Champ 'subject' requis en mode campagne." }, 400);
    finalHtml = html;
    finalSubject = subject.trim();
    finalText = text ?? htmlToText(html);
  } else if (html) {
    // ─── Mode custom (staff a écrit le contenu) ───────────
    if (!subject?.trim()) return json({ error: "Champ 'subject' requis en mode custom." }, 400);
    finalHtml = wrapCustomBody({ bodyHtml: html, assetBase });
    finalSubject = subject.trim();
    finalText = text ?? htmlToText(html);
  } else {
    return json({ error: "Fournir soit 'template', soit 'html'." }, 400);
  }

  const body: Record<string, unknown> = {
    from,
    to,
    subject: finalSubject,
    html: finalHtml,
  };
  if (finalText) body.text = finalText;
  if (cc?.length) body.cc = cc;
  if (bcc?.length) body.bcc = bcc;
  if (replyTo) body.reply_to = replyTo;
  const unsub = payload.campaign?.unsubscribeUrl ?? "";
  if (payload.campaign && /^https:\/\//.test(unsub)) {
    // Lien de désabonnement reconnu par Gmail et Apple Mail (bouton natif).
    body.headers = { "List-Unsubscribe": `<${unsub}>` };
  }

  const res = await resendPost(apiKey, body);

  const result = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok) {
    // Resend renvoie { message, name, statusCode } → on aplatit pour que le
    // front puisse afficher un message actionnable (« domain not verified »,
    // « invalid API key », etc.) plutôt qu'un opaque « non-2xx status code ».
    const r = result as { message?: string; name?: string };
    const detail = r.message || r.name || `HTTP ${res.status}`;
    return json({ error: `Resend : ${detail}` }, res.status);
  }
  return json({ ok: true, id: result.id });
});

// ────────────────────────────────────────────────────────────
// Formulaire de contact
//
// Le message arrive dans la messagerie (Admin → Messagerie) exactement
// comme un e-mail envoyé à support@ooble.ca — ou à otc@ooble.ca pour une
// demande du desk OTC (desk: "otc") : nouveau fil au nom du visiteur, à
// qui l'équipe répond depuis le back-office. Une alerte part
// aussi aux destinataires des alertes de l'équipe (Réglages), s'il y en a.
//
// Ouvert sans connexion, donc bridé : destinataire fixe, texte brut
// uniquement, longueurs limitées, champ piège, 3 messages par heure et
// par adresse, 5 par heure et par IP.
// ────────────────────────────────────────────────────────────

const contactHits = new Map<string, number[]>();

function tooMany(key: string, max: number): boolean {
  const now = Date.now(), recent = (contactHits.get(key) ?? []).filter((t) => now - t < 3_600_000);
  recent.push(now);
  contactHits.set(key, recent);
  return recent.length > max;
}

async function handleContact(c: ContactPayload, req: Request, apiKey: string, from: string): Promise<Response> {
  const name = (c.name ?? "").trim().slice(0, 100);
  const email = (c.email ?? "").trim().toLowerCase();
  const subject = (c.subject ?? "").trim().slice(0, 120) || "Autre";
  const message = (c.message ?? "").trim();
  const otc = c.desk === "otc";
  const box = otc ? "otc@ooble.ca" : "support@ooble.ca";
  const fail = `Envoi impossible pour le moment. Écrivez-nous à ${box}.`;

  // Robot : on fait comme si tout s'était bien passé.
  if ((c.website ?? "").trim()) return json({ ok: true });

  if (!name) return json({ error: "Indiquez votre nom." }, 400);
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(email) || email.length > 254) {
    return json({ error: "Adresse courriel invalide." }, 400);
  }
  if (message.length < 2) return json({ error: "Écrivez votre message." }, 400);
  if (message.length > 5000) return json({ error: "Message trop long (5 000 caractères maximum)." }, 400);

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "inconnue";
  if (tooMany(`ip:${ip}`, 5)) return json({ error: "Trop de messages envoyés. Réessayez dans une heure." }, 429);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return json({ error: "Configuration serveur incomplète." }, 500);
  const admin = createClient(supabaseUrl, serviceKey);

  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await admin
    .from("mail_threads")
    .select("id", { count: "exact", head: true })
    .eq("client_email", email)
    .gte("created_at", since);
  if ((count ?? 0) >= 3) return json({ error: "Trop de messages envoyés. Réessayez dans une heure." }, 429);

  const { data: profile } = await admin.from("profiles").select("id, full_name").eq("email", email).maybeSingle();
  const threadSubject = otc ? subject : `${subject} · formulaire de contact`;

  const { data: thread, error: threadErr } = await admin
    .from("mail_threads")
    .insert({
      client_id: profile?.id ?? null,
      client_email: email,
      client_name: name,
      subject: threadSubject,
      last_message_at: new Date().toISOString(),
      has_unread: true,
      mailbox: otc ? "otc" : "support",
      origin: "form", // seuls les messages du site apparaissent en Réception
    })
    .select("id")
    .single();
  if (threadErr || !thread) {
    console.error("contact: création du fil impossible", threadErr);
    return json({ error: fail }, 500);
  }
  const { error: msgErr } = await admin.from("mail_messages").insert({
    thread_id: thread.id,
    direction: "inbound",
    from_email: email,
    from_name: name,
    to_email: box,
    subject: threadSubject,
    body_text: message,
    body_html: null,
  });
  if (msgErr) {
    console.error("contact: enregistrement du message impossible", msgErr);
    return json({ error: fail }, 500);
  }

  // Alerte à l'équipe (facultative) : répondre à ce courriel écrit au visiteur.
  const staffTo = await staffRecipients();
  if (staffTo.length) {
    const site = Deno.env.get("SITE_URL") ?? "https://ooble.ca";
    const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#141414">
      <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#777">${otc ? "Desk OTC" : "Formulaire de contact"}</p>
      <p style="margin:0 0 16px;font-size:20px;font-weight:bold">${escHtml(subject)}</p>
      <p style="margin:0"><b>${escHtml(name)}</b> · ${escHtml(email)}${profile ? " · client Ooble" : ""}</p>
      <p style="margin:16px 0;padding:16px;border:1px solid #e5e5e5;border-radius:10px;white-space:pre-wrap">${escHtml(message)}</p>
      <p style="margin:0"><a href="${site}/admin" style="color:#141414">Répondre depuis la messagerie Ooble</a></p></div>`;
    const res = await resendPost(apiKey, {
      from,
      to: staffTo,
      reply_to: email,
      subject: `${otc ? "OTC" : "Contact"} · ${subject} · ${name}`,
      html,
      text: `${subject}\n${name} <${email}>\n\n${message}`,
    }).catch((e) => { console.warn("contact: alerte non envoyée", e); return null; });
    if (res && !res.ok) console.warn("contact: alerte non envoyée", res.status, await res.text().catch(() => ""));
  }

  return json({ ok: true, threadId: thread.id });
}

// ────────────────────────────────────────────────────────────
// Notification interne : nouvelle commande
//
// Rendu très scannable : sujet préfixé par le type d'ordre et la référence,
// eyebrow + heading qui disent immédiatement ce que c'est, tableau
// détaillé, bouton pour ouvrir la commande dans le back-office. Le mot
// « MANUEL » n'apparaît nulle part : la file d'attente est déjà branchée,
// ce mail est un rappel poussé (« au cas où »).
// ────────────────────────────────────────────────────────────

function buildStaffNewOrder(order: StaffOrderPayload, assetBase: string) {
  const isBuy = order.side === "buy";
  const sideLabel = isBuy ? "Ordre d'achat" : "Ordre de vente";
  const clientDisplay = order.clientName?.trim()
    ? `${order.clientName.trim()} · ${order.clientEmail}`
    : order.clientEmail;
  const headline = isBuy
    ? `Achat ${order.usdtAmount} USDT pour ${order.cadAmount} CAD`
    : `Vente ${order.usdtAmount} USDT pour ${order.cadAmount} CAD`;
  const addressLabel = isBuy ? "Adresse de réception client" : "Adresse de dépôt (Ooble)";

  const bodyHtml =
    eyebrow(`Nouvelle commande · ${sideLabel}`) +
    heading(headline) +
    lead(
      isBuy
        ? "Un client vient de placer un ordre d'achat. Vous devez confirmer la réception de l'Interac puis envoyer les USDT à l'adresse indiquée."
        : "Un client vient de placer un ordre de vente. Vous devez confirmer la réception des USDT sur l'adresse de dépôt puis envoyer l'Interac.",
    ) +
    dataRows([
      ["Client",     clientDisplay],
      ["Référence",  order.ref,            true],
      ["Montant CAD", `${order.cadAmount} CAD`],
      ["Montant USDT", `${order.usdtAmount} USDT`],
      ["Réseau",     order.network],
      [addressLabel, order.address,        true],
    ]) +
    primaryButton(order.adminUrl, "Ouvrir dans le back-office");

  return {
    html: wrapCustomBody({ bodyHtml, assetBase }),
    text: `${sideLabel} ${order.ref}\n\n${headline}\nClient : ${clientDisplay}\nRéseau : ${order.network}\n${addressLabel} : ${order.address}\n\nOuvrir : ${order.adminUrl}`,
    subject: `Nouvelle commande ${isBuy ? "d'achat" : "de vente"} ${order.ref}`,
  };
}
