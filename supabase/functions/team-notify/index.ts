// Fonction edge Ooble — notifications sur le téléphone pour l'équipe (jamais pour les clients).
//
// Appelée par la base (public.team_push) : @mention, tâche confiée ou à échéance, commande à prendre.
// La base a déjà retenu les destinataires (membres de l'équipe, alerte gardée dans leur profil).
//
// Payload : { user_ids: string[], title, body, url }
// Secrets : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto), VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { caller } from "../_shared/guard.ts";
import { sendWebPush } from "../push-notify/webpush.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const vapid = { publicKey: Deno.env.get("VAPID_PUBLIC_KEY") ?? "", privateKey: Deno.env.get("VAPID_PRIVATE_KEY") ?? "", subject: Deno.env.get("VAPID_SUBJECT") ?? "mailto:support@ooble.ca" };
  if (!url || !key || !vapid.publicKey || !vapid.privateKey) return json({ error: "Configuration serveur incomplète." }, 500);
  const db = createClient(url, key);

  // La base (secret partagé) ou un appel interne seulement : un membre ne peut pas envoyer d'alerte lui-même.
  const who = await caller(req, db, key);
  if (!who || who.kind === "staff") return json({ error: "Accès refusé." }, 401);

  let body: { user_ids?: string[]; title?: string; body?: string; url?: string };
  try { body = await req.json(); } catch { return json({ error: "JSON invalide" }, 400); }
  const ids = (body.user_ids ?? []).filter((s) => typeof s === "string").slice(0, 50);
  if (!ids.length) return json({ ok: true, sent: 0 });

  // Destinataires de l'équipe uniquement, même si la liste reçue en contenait d'autres.
  const { data: staff } = await db.from("user_roles").select("user_id").in("user_id", ids);
  const team = [...new Set((staff ?? []).map((r) => r.user_id as string))];
  if (!team.length) return json({ ok: true, sent: 0 });

  const link = typeof body.url === "string" && body.url.startsWith("/admin") ? body.url : "/admin";
  const payload = JSON.stringify({ title: String(body.title ?? "Ooble").slice(0, 80), body: String(body.body ?? "").slice(0, 200), url: link });

  const { data: subs } = await db.from("push_subscriptions").select("endpoint, p256dh, auth").in("user_id", team);
  let sent = 0;
  const stale: string[] = [];
  for (const sub of subs ?? []) {
    try {
      const r = await sendWebPush(sub, payload, vapid);
      if (r.ok) sent++;
      else if (r.status === 404 || r.status === 410) stale.push(sub.endpoint);
      else console.error("team-notify: refus du service push", r.status, r.text);
    } catch (e) {
      console.error("team-notify: erreur envoi", e);
    }
  }
  // Appareils désabonnés : on ne leur écrit plus.
  if (stale.length) await db.from("push_subscriptions").delete().in("endpoint", stale);
  return json({ ok: true, sent, cleaned: stale.length });
});
