// Support dans l'app : le client écrit à l'équipe depuis la page « Support ».
//
// La discussion est un fil de la messagerie (Back-office › Réception), comme le formulaire de contact :
// l'équipe le voit « À répondre » et répond depuis la Réception, sans rien changer à ses habitudes.
// La réponse part aussi par courriel et s'affiche dans la page Support de l'app.
//
// Actions (POST, client connecté) :
//   { action: "list" }               → les messages de sa discussion
//   { action: "send", text: "..." }  → ajoute son message (et ouvre la discussion au besoin)
//
// Le client ne lit et n'écrit que sa propre discussion : tout passe par cette fonction (clé serveur),
// jamais directement par la base.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

/** Sujet des discussions ouvertes depuis l'app : c'est ainsi que la Réception les reconnaît. */
const SUBJECT = "Discussion dans l'app";
const BOX = "support@ooble.ca";
const MAX_LEN = 2000;

const URL_ = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function escHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/** Une réponse reçue par courriel garde souvent l'historique cité : on ne garde que le nouveau texte. */
function cleanBody(text: string): string {
  const lines = (text ?? "").replace(/\r/g, "").split("\n");
  const out: string[] = [];
  for (const l of lines) {
    if (/^\s*>/.test(l)) break;
    if (/^(Le |On ).{4,200}(a écrit|wrote)\s*:?\s*$/i.test(l.trim())) break;
    if (/^-{2,}\s*(Original|Message d'origine)/i.test(l.trim())) break;
    out.push(l);
  }
  return out.join("\n").trim() || (text ?? "").trim();
}

async function staffRecipients(admin: ReturnType<typeof createClient>): Promise<string[]> {
  const { data } = await admin.from("app_private_settings").select("staff_alert_emails").eq("id", 1).maybeSingle();
  const list = (((data as { staff_alert_emails?: string[] } | null)?.staff_alert_emails) ?? [])
    .map((e) => e.trim()).filter((e) => /^\S+@\S+\.\S+$/.test(e));
  if (list.length) return list;
  const secret = Deno.env.get("STAFF_NOTIFICATION_EMAIL")?.trim();
  return secret ? [secret] : [];
}

/** Alerte courriel à l'équipe, au plus une fois par demi-heure et par discussion. */
async function alertTeam(admin: ReturnType<typeof createClient>, who: { name: string; email: string }, text: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return;
  const to = await staffRecipients(admin);
  if (!to.length) return;
  const from = Deno.env.get("EMAIL_FROM") ?? "Ooble <onboarding@resend.dev>";
  const site = Deno.env.get("SITE_URL") ?? "https://ooble.ca";
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#141414">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#777">Support dans l'app</p>
    <p style="margin:0"><b>${escHtml(who.name)}</b> · ${escHtml(who.email)}</p>
    <p style="margin:16px 0;padding:16px;border:1px solid #e5e5e5;border-radius:10px;white-space:pre-wrap">${escHtml(text)}</p>
    <p style="margin:0"><a href="${site}/admin" style="color:#141414">Répondre depuis la Réception</a></p></div>`;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject: `Support · ${who.name}`, html, text: `${who.name} <${who.email}>\n\n${text}` }),
  }).catch((e) => console.warn("support-chat: alerte non envoyée", e));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  if (!URL_ || !SERVICE) return json({ error: "Configuration serveur incomplète." }, 500);

  const admin = createClient(URL_, SERVICE);
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const { data: auth } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  const user = auth?.user;
  if (!user?.email) return json({ error: "Connectez-vous pour écrire au support." }, 401);

  let body: { action?: string; text?: string } = {};
  try { body = await req.json(); } catch { /* corps vide */ }

  // La discussion en cours du client (une seule à la fois ; une discussion retirée par l'équipe n'est plus montrée).
  const { data: thread } = await admin
    .from("mail_threads")
    .select("id, support_state")
    .eq("client_id", user.id)
    .eq("subject", SUBJECT)
    .is("removed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (body.action === "list") {
    if (!thread) return json({ messages: [], state: null });
    const { data: rows } = await admin
      .from("mail_messages")
      .select("id, direction, from_name, body_text, created_at")
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: true })
      .limit(300);
    const messages = (rows ?? []).map((m) => ({
      id: m.id,
      mine: m.direction === "inbound",
      // L'équipe est montrée par son prénom seulement.
      who: m.direction === "outbound" ? ((m.from_name ?? "").trim().split(/\s+/)[0] || "Ooble") : null,
      text: m.direction === "inbound" ? (m.body_text ?? "").trim() : cleanBody(m.body_text ?? ""),
      at: m.created_at,
    })).filter((m) => m.text);
    return json({ messages, state: thread.support_state ?? null });
  }

  if (body.action === "send") {
    const text = (body.text ?? "").trim();
    if (!text) return json({ error: "Écrivez votre message." }, 400);
    if (text.length > MAX_LEN) return json({ error: `Message trop long (${MAX_LEN} caractères maximum).` }, 400);

    const { data: profile } = await admin.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    const name = ((profile as { full_name?: string } | null)?.full_name ?? "").trim() || user.email;
    const now = new Date().toISOString();

    let threadId = thread?.id as string | undefined;
    let alert = true;
    if (threadId) {
      // Pas plus de 15 messages en 10 minutes.
      const since = new Date(Date.now() - 600_000).toISOString();
      const { count } = await admin.from("mail_messages").select("id", { count: "exact", head: true })
        .eq("thread_id", threadId).eq("direction", "inbound").gte("created_at", since);
      if ((count ?? 0) >= 15) return json({ error: "Beaucoup de messages d'un coup : patientez quelques minutes." }, 429);
      // Alerte seulement si le client n'avait rien écrit depuis une demi-heure.
      const recent = new Date(Date.now() - 1_800_000).toISOString();
      const { count: last } = await admin.from("mail_messages").select("id", { count: "exact", head: true })
        .eq("thread_id", threadId).eq("direction", "inbound").gte("created_at", recent);
      alert = (last ?? 0) === 0;
    } else {
      const { data: created, error } = await admin.from("mail_threads").insert({
        client_id: user.id,
        client_email: user.email.toLowerCase(),
        client_name: name,
        subject: SUBJECT,
        last_message_at: now,
        has_unread: true,
        mailbox: "support",
        origin: "form", // visible dans la Réception, comme les messages du site
      }).select("id").single();
      if (error || !created) {
        console.error("support-chat: création de la discussion impossible", error);
        return json({ error: "Envoi impossible pour le moment. Écrivez-nous à support@ooble.ca." }, 500);
      }
      threadId = created.id as string;
    }

    const { error: msgErr } = await admin.from("mail_messages").insert({
      thread_id: threadId,
      direction: "inbound",
      from_email: user.email.toLowerCase(),
      from_name: name,
      to_email: BOX,
      subject: SUBJECT,
      body_text: text,
      body_html: null,
    });
    if (msgErr) {
      console.error("support-chat: message non enregistré", msgErr);
      return json({ error: "Envoi impossible pour le moment. Écrivez-nous à support@ooble.ca." }, 500);
    }
    if (alert) await alertTeam(admin, { name, email: user.email }, text);
    return json({ ok: true });
  }

  return json({ error: "Action inconnue." }, 400);
});
