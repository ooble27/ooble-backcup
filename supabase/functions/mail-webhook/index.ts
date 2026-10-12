// Fonction edge Ooble — webhook e-mails entrants (Resend Inbound).
//
// Depuis le 2026-10-12, la Réception du back-office ne montre que les messages
// laissés sur le site (formulaires Contact et OTC). Les courriels entrants sont
// lus dans la boîte habituelle de l'équipe ; ceux qui arrivent encore ici sont
// gardés avec origin = 'email' et n'apparaissent nulle part.
//
// Reçoit les e-mails envoyés à `support@ooble.ca` et à `otc@ooble.ca`
// (desk gros volumes) et les insère dans la table `mail_messages`,
// rattachés au bon thread. Le thread est identifié par le plus-addressing
// de l'adresse de destination :
//
//   support+t.{threadId}@ooble.ca  →  rattaché au thread existant
//   otc+t.{threadId}@ooble.ca      →  idem
//   support@ooble.ca (sans +t.)    →  nouveau thread, boîte « support »
//   otc@ooble.ca (sans +t.)        →  nouveau thread, boîte « otc »
//
// Le webhook Resend Inbound n'envoie souvent QUE les métadonnées de l'email
// (from, to, subject, id). Pour obtenir le contenu (text/html), on fait un
// GET https://api.resend.com/emails/received/:id avec la clé API.
//
// Cette fonction est déployée SANS vérification JWT (--no-verify-jwt)
// car Resend l'appelle directement sans authentification Supabase.
//
// Secrets requis :
//   SUPABASE_URL              (auto Supabase)
//   SUPABASE_SERVICE_ROLE_KEY (auto Supabase)
//   RESEND_API_KEY            requis pour récupérer le corps des mails
//   MAIL_WEBHOOK_SECRET       OBLIGATOIRE — secret de signature du webhook
//                             Resend (whsec_…). Sans lui : 503, Resend réessaie.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function extractEmail(raw: string): string {
  const match = /<([^>]+)>/.exec(raw);
  return (match ? match[1] : raw).trim().toLowerCase();
}

function extractName(raw: string): string {
  const match = /^"?([^"<]+)"?\s*</.exec(raw);
  return match ? match[1].trim() : "";
}

function cleanSubject(s: string): string {
  return s.replace(/^(Re|Fwd|Tr|Fw)\s*:\s*/gi, "").trim() || s;
}

// Récupère le contenu complet d'un email reçu via l'API Resend.
// Le webhook Resend Inbound n'envoie QUE les métadonnées, il faut appeler
// l'API pour obtenir text/html/attachments.
// Endpoint : https://api.resend.com/emails/receiving/:id
async function fetchResendEmail(id: string, apiKey: string): Promise<{
  text: string;
  html: string;
  subject: string;
  from: string;
  to: string[];
  headers: Record<string, string>;
} | null> {
  // On essaie plusieurs endpoints (l'API a évolué au fil du temps) et
  // on prend le premier qui répond 200.
  const urls = [
    `https://api.resend.com/emails/receiving/${id}`,
    `https://api.resend.com/emails/received/${id}`,
    `https://api.resend.com/received-emails/${id}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.warn(`fetchResendEmail: ${url} → HTTP ${res.status}`, errText.slice(0, 200));
        continue;
      }
      const email = await res.json();
      const d = (email.data ?? email) as Record<string, unknown>;
      console.log(`fetchResendEmail: succès sur ${url}, keys:`, Object.keys(d));
      return {
        text: (d.text as string) || "",
        html: (d.html as string) || "",
        subject: (d.subject as string) || "",
        from: (d.from as string) || "",
        to: Array.isArray(d.to) ? (d.to as string[]) : [],
        headers: toHeaderMap(d.headers),
      };
    } catch (e) {
      console.warn(`fetchResendEmail: ${url} → erreur`, e);
    }
  }
  console.error(`fetchResendEmail: aucun endpoint ne répond pour id=${id}`);
  return null;
}

/**
 * Vérifie la signature Svix d'un webhook Resend : HMAC-SHA256 de
 * « id.horodatage.corps » avec le secret (whsec_…, base64), horodatage de
 * moins de 5 minutes, comparaison à temps constant.
 */
async function svixValid(secret: string, headers: Headers, body: string): Promise<boolean> {
  const id = headers.get("svix-id") ?? headers.get("webhook-id") ?? "";
  const ts = headers.get("svix-timestamp") ?? headers.get("webhook-timestamp") ?? "";
  const sigs = headers.get("svix-signature") ?? headers.get("webhook-signature") ?? "";
  if (!id || !/^\d+$/.test(ts) || !sigs) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  let keyBytes: Uint8Array;
  try {
    keyBytes = Uint8Array.from(atob(secret.replace(/^whsec_/, "")), (c) => c.charCodeAt(0));
  } catch { return false; }
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`)));
  const expected = btoa(String.fromCharCode(...mac));
  return sigs.split(" ").some((part) => {
    const [ver, sig] = part.split(",");
    if (ver !== "v1" || !sig || sig.length !== expected.length) return false;
    let r = 0;
    for (let i = 0; i < sig.length; i++) r |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    return r === 0;
  });
}

/** En-têtes (objet ou liste { name, value }) → objet, clés en minuscules. */
function toHeaderMap(h: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const add = (k: string, v: unknown) => {
    const key = k.toLowerCase();
    const val = Array.isArray(v) ? v.join(" ; ") : String(v ?? "");
    out[key] = out[key] ? `${out[key]} ; ${val}` : val;
  };
  if (Array.isArray(h)) h.forEach((x) => x && typeof x === "object" && add(String((x as { name?: string }).name ?? ""), (x as { value?: unknown }).value));
  else if (h && typeof h === "object") Object.entries(h as Record<string, unknown>).forEach(([k, v]) => add(k, v));
  return out;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "Config manquante" }, 500);

  // Signature Resend (Svix) obligatoire : sans elle, n'importe qui pouvait
  // écrire dans la messagerie support (injection constatée le 2026-10-08).
  // Sans secret configuré, on répond 503 : Resend réessaie plus tard, aucun
  // courriel n'est perdu le temps de poser MAIL_WEBHOOK_SECRET.
  const raw = await req.text();
  const signingSecret = Deno.env.get("MAIL_WEBHOOK_SECRET") ?? "";
  if (!signingSecret) return json({ error: "Webhook non configuré" }, 503);
  if (!(await svixValid(signingSecret, req.headers, raw))) return json({ error: "Signature invalide" }, 401);

  let payload: Record<string, unknown>;
  try { payload = JSON.parse(raw); }
  catch { return json({ error: "JSON invalide" }, 400); }

  console.log("mail-webhook: type =", payload.type);

  if (payload.type !== "email.received") {
    return json({ ok: true, skipped: `type=${payload.type}` });
  }

  const data = payload.data as Record<string, unknown> | undefined;
  if (!data) return json({ ok: true, skipped: "no_data" });

  const resendId = (data.email_id as string) ?? (data.id as string) ?? null;

  // ── Extraction des champs depuis le webhook ─────────────
  const fromField = data.from as unknown;
  let fromRaw = "";
  let fromNameFromObj = "";
  if (typeof fromField === "string") {
    fromRaw = fromField;
  } else if (Array.isArray(fromField) && fromField.length > 0) {
    const f = fromField[0] as { email?: string; name?: string };
    fromRaw = f?.email ?? "";
    fromNameFromObj = f?.name ?? "";
  } else if (fromField && typeof fromField === "object") {
    const f = fromField as { email?: string; name?: string };
    fromRaw = f?.email ?? "";
    fromNameFromObj = f?.name ?? "";
  }

  const toRaw = Array.isArray(data.to) ? data.to : [];
  const toAddresses: string[] = toRaw.map((x: unknown) => {
    if (typeof x === "string") return x;
    if (x && typeof x === "object") return (x as { email?: string }).email ?? "";
    return "";
  }).filter(Boolean);

  let subject = (data.subject as string) ?? "";
  let bodyText = (data.text as string) || "";
  let bodyHtml = (data.html as string) || "";

  // ── Fallback : le webhook n'a pas envoyé le corps, on va le
  //    chercher via l'API Resend (méthode recommandée par Resend
  //    pour les emails entrants).
  if (!bodyText && !bodyHtml && resendId && resendApiKey) {
    console.log("mail-webhook: body vide dans webhook, fetch API Resend pour", resendId);
    const full = await fetchResendEmail(resendId, resendApiKey);
    if (full) {
      bodyText = full.text || bodyText;
      bodyHtml = full.html || bodyHtml;
      subject = full.subject || subject;
      if (!fromRaw && full.from) fromRaw = full.from;
      if (toAddresses.length === 0 && full.to.length > 0) {
        toAddresses.push(...full.to);
      }
    }
  }

  const senderEmail = extractEmail(fromRaw);

  // Les avis Interac n'entrent jamais par ici : interac@ooble.ca passe par
  // un Email Worker Cloudflare et la fonction `interac-ingest` (requête
  // signée, DKIM vérifié). Ce webhook n'est pas authentifié : un « avis »
  // reçu ici serait traité comme un courriel ordinaire, sans effet sur un ordre.
  const senderName = extractName(fromRaw)
    || fromNameFromObj
    || ((data.from_name as string) ?? "");

  // Extraire l'ID du thread depuis le plus-addressing.
  let threadId: string | null = null;
  for (const addr of toAddresses) {
    const match = /^(?:support|otc)\+t\.([a-f0-9-]{36})@/i.exec(extractEmail(addr));
    if (match) { threadId = match[1]; break; }
  }
  // Boîte d'arrivée d'un nouveau fil : otc@ooble.ca → desk OTC.
  const mailbox = toAddresses.some((a) => /^otc(\+[^@]*)?@ooble\.ca$/i.test(extractEmail(a))) ? "otc" : "support";

  const admin = createClient(supabaseUrl, serviceKey);

  // ── Thread connu : insertion du message ─────────────────
  if (threadId) {
    const { data: thread } = await admin
      .from("mail_threads")
      .select("id")
      .eq("id", threadId)
      .maybeSingle();

    if (thread) {
      await admin.from("mail_messages").insert({
        thread_id: threadId,
        direction: "inbound",
        from_email: senderEmail,
        from_name: senderName || null,
        to_email: toAddresses[0] ?? "",
        subject,
        body_text: bodyText || null,
        body_html: bodyHtml || null,
        resend_id: resendId,
      });
      return json({ ok: true, threadId, action: "message_added" });
    }
  }

  // ── Nouveau thread ──────────────────────────────────────
  const { data: profile } = await admin
    .from("profiles")
    .select("id, full_name")
    .eq("email", senderEmail)
    .maybeSingle();

  const { data: newThread, error: threadErr } = await admin
    .from("mail_threads")
    .insert({
      client_id: profile?.id ?? null,
      client_email: senderEmail,
      client_name: senderName || profile?.full_name || null,
      subject: cleanSubject(subject),
      last_message_at: new Date().toISOString(),
      has_unread: true,
      mailbox,
      // Les courriels arrivent dans la boîte habituelle de l'équipe : gardés ici
      // pour mémoire seulement, jamais affichés en Réception (réservée au site).
      origin: "email",
    })
    .select("id")
    .single();

  if (threadErr || !newThread) {
    console.error("mail-webhook: erreur création thread", threadErr);
    return json({ error: "Échec création thread" }, 500);
  }

  await admin.from("mail_messages").insert({
    thread_id: newThread.id,
    direction: "inbound",
    from_email: senderEmail,
    from_name: senderName || null,
    to_email: toAddresses[0] ?? "",
    subject,
    body_text: bodyText || null,
    body_html: bodyHtml || null,
    resend_id: resendId,
  });

  return json({ ok: true, threadId: newThread.id, action: "thread_created" });
});
