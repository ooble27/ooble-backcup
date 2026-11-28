// Support dans l'app : le client écrit à l'équipe depuis la page « Support ».
//
// Chaque discussion est un fil de la messagerie (Back-office › Réception), comme le formulaire de contact :
// l'équipe la voit « À répondre », répond depuis la Réception, et la marque « Réglée » quand c'est fini.
//
// Règles (comme les grandes plateformes) :
//   • Une seule discussion ouverte à la fois par client. En revenant, il retrouve toujours celle-là.
//   • C'est l'équipe qui clôt une discussion (avec un dernier message qui demande si tout est réglé), ou elle
//     se ferme d'elle-même 7 jours après la dernière réponse de l'équipe si le client n'a pas répondu.
//   • Une discussion fermée reste lisible dans l'historique, mais on n'y écrit plus : le client en ouvre une
//     nouvelle (avec un sujet, et la commande concernée s'il y en a une).
//   • Si le client répond au courriel de l'équipe, son message revient dans la même discussion (et la rouvre).
//
// Actions (POST, client connecté) :
//   { action: "threads" }                                  → ses discussions (ouverte d'abord, puis historique)
//   { action: "list", threadId }                           → les messages d'une de ses discussions
//   { action: "send", threadId?, text, topic?, orderRef?, key } → écrit (nouvelle discussion si aucune ouverte)
//
// Action réservée à l'équipe (membre connecté au back-office) :
//   { action: "reply", threadId, text, close? }  → répond (signé de son prénom), prévient le client par une
//                                                  notification de l'app et un courriel ; close : clôt ensuite.
//
// Le client ne lit et n'écrit que ses propres discussions : tout passe par cette fonction (clé serveur).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { wrapCustomBody } from "../send-email/layout.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

/** Sujet des discussions ouvertes depuis l'app (« Discussion dans l'app · Ma commande · OOB-… ») : c'est ainsi qu'on les reconnaît. */
const PREFIX = "Discussion dans l'app";
const BOX = "support@ooble.ca";
const MAX_LEN = 2000;
const AUTO_CLOSE_DAYS = 7;
const TOPICS: Record<string, string> = { order: "Ma commande", identity: "Mon identité", interac: "Virement Interac", account: "Mon compte", other: "Autre question" };

const URL_ = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
type Admin = ReturnType<typeof createClient>;
interface ThreadRow { id: string; subject: string; support_state: string | null; status: string | null; created_at: string; last_message_at: string }

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

const isClosed = (t: ThreadRow) => t.support_state === "resolved" || t.status === "archived";
/** « Ma commande · OOB-… » à partir du sujet enregistré. */
const topicOf = (t: ThreadRow) => t.subject.startsWith(PREFIX + " · ") ? t.subject.slice(PREFIX.length + 3) : "";

async function staffRecipients(admin: Admin): Promise<string[]> {
  const { data } = await admin.from("app_private_settings").select("staff_alert_emails").eq("id", 1).maybeSingle();
  const list = (((data as { staff_alert_emails?: string[] } | null)?.staff_alert_emails) ?? [])
    .map((e) => e.trim()).filter((e) => /^\S+@\S+\.\S+$/.test(e));
  if (list.length) return list;
  const secret = Deno.env.get("STAFF_NOTIFICATION_EMAIL")?.trim();
  return secret ? [secret] : [];
}

/** Alerte courriel à l'équipe (nouvelle discussion, ou client qui réécrit après une demi-heure de silence). */
async function alertTeam(admin: Admin, who: { name: string; email: string }, topic: string, text: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return;
  const to = await staffRecipients(admin);
  if (!to.length) return;
  const from = Deno.env.get("EMAIL_FROM") ?? "Ooble <onboarding@resend.dev>";
  const site = Deno.env.get("SITE_URL") ?? "https://ooble.ca";
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#141414">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#777">Support dans l'app${topic ? " · " + escHtml(topic) : ""}</p>
    <p style="margin:0"><b>${escHtml(who.name)}</b> · ${escHtml(who.email)}</p>
    <p style="margin:16px 0;padding:16px;border:1px solid #e5e5e5;border-radius:10px;white-space:pre-wrap">${escHtml(text)}</p>
    <p style="margin:0"><a href="${site}/admin" style="color:#141414">Répondre depuis la Réception</a></p></div>`;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject: `Support · ${topic || "Discussion"} · ${who.name}`, html, text: `${who.name} <${who.email}>\n${topic}\n\n${text}` }),
  }).catch((e) => console.warn("support-chat: alerte non envoyée", e));
}

const firstName = (full?: string | null) => (full ?? "").trim().split(/\s+/)[0] ?? "";

/** Prénom de chaque membre de l'équipe qui a répondu (jamais son adresse ni le nom de famille). */
async function staffNames(admin: Admin, ids: (string | null)[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  const out = new Map<string, string>();
  if (!uniq.length) return out;
  const { data } = await admin.from("profiles").select("id, full_name").in("id", uniq);
  for (const p of (data ?? []) as { id: string; full_name: string | null }[]) { const f = firstName(p.full_name); if (f) out.set(p.id, f); }
  return out;
}
/** Le nom affiché pour un message de l'équipe : le prénom du membre ; sinon un nom enregistré qui n'est pas une adresse. */
function teamName(names: Map<string, string>, staffId: string | null, fromName: string | null): string {
  if (staffId && names.get(staffId)) return names.get(staffId)!;
  const f = firstName(fromName);
  return f && !f.includes("@") && f.toLowerCase() !== "ooble" ? f : "Ooble";
}

/** Ferme d'elle-même une discussion où l'équipe a répondu en dernier il y a plus de 7 jours. */
async function autoClose(admin: Admin, t: ThreadRow): Promise<ThreadRow> {
  if (isClosed(t) || t.support_state !== "waiting") return t;
  if (Date.now() - new Date(t.last_message_at).getTime() < AUTO_CLOSE_DAYS * 86_400_000) return t;
  await admin.from("mail_threads").update({ support_state: "resolved" }).eq("id", t.id);
  return { ...t, support_state: "resolved" };
}

/** L'équipe répond à une discussion de l'app : message signé du prénom, notification de l'app, courriel au client. */
async function staffReply(admin: Admin, staffId: string, body: { threadId?: string; text?: string; close?: boolean }): Promise<Response> {
  // Membre de l'équipe seulement (même règle que is_staff : une ligne dans user_roles).
  const { count: roles } = await admin.from("user_roles").select("user_id", { count: "exact", head: true }).eq("user_id", staffId);
  if (!roles) return json({ error: "Réservé à l'équipe." }, 403);

  const text = (body.text ?? "").trim();
  if (!text && !body.close) return json({ error: "Écrivez votre réponse." }, 400);
  if (text.length > 5000) return json({ error: "Réponse trop longue (5 000 caractères maximum)." }, 400);

  const { data: t } = await admin.from("mail_threads")
    .select("id, subject, client_id, client_email, client_name, support_state, status, removed_at")
    .eq("id", body.threadId ?? "").maybeSingle();
  const th = t as (ThreadRow & { client_id: string | null; client_email: string; client_name: string | null; removed_at: string | null }) | null;
  if (!th || th.removed_at || !th.subject.startsWith(PREFIX)) return json({ error: "Discussion introuvable." }, 404);

  const { data: me } = await admin.from("profiles").select("full_name").eq("id", staffId).maybeSingle();
  const who = firstName((me as { full_name?: string } | null)?.full_name) || "Ooble";

  if (text) {
    const { error } = await admin.from("mail_messages").insert({
      thread_id: th.id,
      direction: "outbound",
      from_email: BOX,
      from_name: who,
      to_email: th.client_email,
      subject: th.subject,
      body_text: text,
      body_html: null,
      staff_id: staffId,
    });
    if (error) {
      console.error("support-chat: réponse non enregistrée", error);
      return json({ error: "Réponse non enregistrée. Réessayez." }, 500);
    }
  }
  // Clôture après le message (sinon le message la repasserait « répondue »).
  if (body.close) await admin.from("mail_threads").update({ support_state: "resolved", has_unread: false }).eq("id", th.id);

  if (text && th.client_id) {
    const { data: prof } = await admin.from("profiles").select("preferred_lang, full_name").eq("id", th.client_id).maybeSingle();
    const lang = (prof as { preferred_lang?: string } | null)?.preferred_lang === "en" ? "en" : "fr";
    const preview = text.length > 140 ? text.slice(0, 137) + "…" : text;
    const url = `/app/support/${th.id}`;
    // 1. Notification de l'app, sur chaque appareil du client (dans la langue de l'appareil).
    await fetch(`${URL_}/functions/v1/push-notify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: th.client_id, url,
        i18n: { fr: { title: `${who} vous a répondu`, body: preview }, en: { title: `${who} replied to you`, body: preview } },
      }),
    }).catch((e) => console.warn("support-chat: notification non envoyée", e));
    // 2. Courriel, au cas où l'app est fermée ou les notifications coupées.
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (apiKey) {
      const site = Deno.env.get("SITE_URL") ?? "https://ooble.ca";
      const hi = firstName((prof as { full_name?: string } | null)?.full_name ?? th.client_name);
      const L = lang === "en"
        ? { subj: `${who} from Ooble replied to you`, hi: hi ? `Hi ${escHtml(hi)},` : "Hi,", intro: `${escHtml(who)} from the Ooble team replied to your conversation:`, btn: "Open the conversation", end: "Reply in the app, the conversation stays in one place." }
        : { subj: `${who} d'Ooble vous a répondu`, hi: hi ? `Bonjour ${escHtml(hi)},` : "Bonjour,", intro: `${escHtml(who)}, de l'équipe Ooble, a répondu à votre discussion :`, btn: "Ouvrir la discussion", end: "Répondez dans l'app : toute la discussion reste au même endroit." };
      const bodyHtml = `<p>${L.hi}</p><p>${L.intro}</p><blockquote style="white-space:pre-wrap">${escHtml(text)}</blockquote><p><a class="btn" href="${site}${url}">${L.btn}</a></p><p style="color:#6f6f6b;font-size:13px">${L.end}</p>`;
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: Deno.env.get("EMAIL_FROM") ?? "Ooble <onboarding@resend.dev>",
          to: th.client_email, reply_to: BOX, subject: L.subj,
          html: wrapCustomBody({ bodyHtml, assetBase: site }),
          text: `${L.intro.replace(/&#39;/g, "'")}\n\n${text}\n\n${L.btn} : ${site}${url}`,
        }),
      }).catch((e) => console.warn("support-chat: courriel non envoyé", e));
    }
  }
  return json({ ok: true, who });
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

  let body: { action?: string; threadId?: string; text?: string; topic?: string; orderRef?: string; close?: boolean } = {};
  try { body = await req.json(); } catch { /* corps vide */ }

  if (body.action === "reply") return staffReply(admin, user.id, body);

  // Toutes ses discussions de l'app (celles retirées par l'équipe, comme un pourriel, ne sont plus montrées).
  const { data: rows } = await admin
    .from("mail_threads")
    .select("id, subject, support_state, status, created_at, last_message_at")
    .eq("client_id", user.id)
    .like("subject", PREFIX + "%")
    .is("removed_at", null)
    .order("last_message_at", { ascending: false })
    .limit(50);
  const threads: ThreadRow[] = [];
  for (const t of (rows ?? []) as ThreadRow[]) threads.push(await autoClose(admin, t));
  const own = (id?: string) => threads.find((t) => t.id === id);
  const openThread = threads.find((t) => !isClosed(t)) ?? null;

  if (body.action === "threads") {
    // Dernier message de chaque discussion, pour l'aperçu et le point « nouvelle réponse ».
    const ids = threads.map((t) => t.id);
    const last = new Map<string, { direction: string; body_text: string | null; created_at: string; from_name: string | null; staff_id?: string | null }>();
    if (ids.length) {
      const { data: msgs } = await admin.from("mail_messages")
        .select("thread_id, direction, body_text, created_at, from_name, staff_id")
        .in("thread_id", ids).order("created_at", { ascending: false }).limit(400);
      for (const m of msgs ?? []) if (!last.has(m.thread_id)) last.set(m.thread_id, m);
    }
    const names = await staffNames(admin, [...last.values()].map((m) => (m as { staff_id?: string | null }).staff_id ?? null));
    return json({
      threads: threads.map((t) => {
        const m = last.get(t.id);
        return {
          id: t.id,
          topic: topicOf(t),
          open: !isClosed(t),
          // « team » : l'équipe a répondu en dernier (le client a peut-être une réponse à lire).
          lastFrom: m ? (m.direction === "outbound" ? "team" : "me") : null,
          lastWho: m && m.direction === "outbound" ? teamName(names, m.staff_id ?? null, m.from_name) : null,
          preview: m ? cleanBody(m.body_text ?? "").slice(0, 140) : "",
          lastAt: m?.created_at ?? t.last_message_at,
          createdAt: t.created_at,
        };
      }),
    });
  }

  if (body.action === "list") {
    const t = own(body.threadId);
    if (!t) return json({ error: "Discussion introuvable." }, 404);
    const { data: msgs } = await admin
      .from("mail_messages")
      .select("id, direction, from_name, staff_id, body_text, created_at")
      .eq("thread_id", t.id)
      .order("created_at", { ascending: true })
      .limit(500);
    const names = await staffNames(admin, (msgs ?? []).map((m) => m.staff_id));
    const messages = (msgs ?? []).map((m) => ({
      id: m.id,
      mine: m.direction === "inbound",
      // L'équipe est montrée par son prénom seulement.
      who: m.direction === "outbound" ? teamName(names, m.staff_id, m.from_name) : null,
      text: m.direction === "inbound" ? (m.body_text ?? "").trim() : cleanBody(m.body_text ?? ""),
      at: m.created_at,
    })).filter((m) => m.text);
    return json({ id: t.id, topic: topicOf(t), open: !isClosed(t), createdAt: t.created_at, messages });
  }

  if (body.action === "send") {
    const text = (body.text ?? "").trim();
    if (!text) return json({ error: "Écrivez votre message." }, 400);
    if (text.length > MAX_LEN) return json({ error: `Message trop long (${MAX_LEN} caractères maximum).` }, 400);

    // Écrire dans une discussion fermée n'est pas possible : le client en ouvre une nouvelle.
    if (body.threadId) {
      const t = own(body.threadId);
      if (!t) return json({ error: "Discussion introuvable." }, 404);
      if (isClosed(t)) return json({ error: "Cette discussion est terminée. Ouvrez-en une nouvelle.", code: "closed" }, 409);
    }

    const { data: profile } = await admin.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    const name = ((profile as { full_name?: string } | null)?.full_name ?? "").trim() || user.email;
    const email = user.email.toLowerCase();
    let threadId = openThread?.id;
    let topic = openThread ? topicOf(openThread) : "";
    let alert = false;

    if (threadId) {
      // Envoi en double (double appui, réseau qui renvoie) : le même texte dans les 20 dernières secondes est ignoré.
      const { data: dup } = await admin.from("mail_messages").select("id")
        .eq("thread_id", threadId).eq("direction", "inbound").eq("body_text", text)
        .gte("created_at", new Date(Date.now() - 20_000).toISOString()).limit(1);
      if (dup && dup.length) return json({ ok: true, threadId, duplicate: true });
      // Pas plus de 15 messages en 10 minutes.
      const { count } = await admin.from("mail_messages").select("id", { count: "exact", head: true })
        .eq("thread_id", threadId).eq("direction", "inbound").gte("created_at", new Date(Date.now() - 600_000).toISOString());
      if ((count ?? 0) >= 15) return json({ error: "Beaucoup de messages d'un coup : patientez quelques minutes." }, 429);
      // Alerte à l'équipe seulement si le client n'avait rien écrit depuis une demi-heure.
      const { count: recent } = await admin.from("mail_messages").select("id", { count: "exact", head: true })
        .eq("thread_id", threadId).eq("direction", "inbound").gte("created_at", new Date(Date.now() - 1_800_000).toISOString());
      alert = (recent ?? 0) === 0;
    } else {
      // Pas plus de 5 nouvelles discussions par jour.
      const dayAgo = Date.now() - 86_400_000;
      if (threads.filter((t) => new Date(t.created_at).getTime() > dayAgo).length >= 5) {
        return json({ error: "Vous avez déjà ouvert plusieurs discussions aujourd'hui. Écrivez dans la dernière, ou à support@ooble.ca." }, 429);
      }
      const label = TOPICS[body.topic ?? ""] ?? TOPICS.other;
      const ref = /^OOB-[0-9A-F]{8}$/i.test(body.orderRef ?? "") ? body.orderRef!.toUpperCase() : "";
      topic = ref ? `${label} · ${ref}` : label;
      const { data: created, error } = await admin.from("mail_threads").insert({
        client_id: user.id,
        client_email: email,
        client_name: name,
        subject: `${PREFIX} · ${topic}`,
        last_message_at: new Date().toISOString(),
        has_unread: true,
        mailbox: "support",
        origin: "form", // visible dans la Réception, comme les messages du site
      }).select("id").single();
      if (error || !created) {
        console.error("support-chat: création de la discussion impossible", error);
        return json({ error: "Envoi impossible pour le moment. Écrivez-nous à support@ooble.ca." }, 500);
      }
      threadId = created.id as string;
      alert = true;
    }

    const { error: msgErr } = await admin.from("mail_messages").insert({
      thread_id: threadId,
      direction: "inbound",
      from_email: email,
      from_name: name,
      to_email: BOX,
      subject: `${PREFIX} · ${topic}`,
      body_text: text,
      body_html: null,
    });
    if (msgErr) {
      console.error("support-chat: message non enregistré", msgErr);
      return json({ error: "Envoi impossible pour le moment. Écrivez-nous à support@ooble.ca." }, 500);
    }
    if (alert) await alertTeam(admin, { name, email }, topic, text);
    return json({ ok: true, threadId });
  }

  return json({ error: "Action inconnue." }, 400);
});
