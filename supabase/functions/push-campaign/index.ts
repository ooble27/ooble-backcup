// Fonction edge Ooble — envoie les notifications push préparées dans Marketing › Notifications.
//
// Appelée chaque minute (pg_cron) et tout de suite quand l'équipe clique « Envoyer ». Elle n'envoie
// que les notifications dues (push_campaigns, statut « scheduled ») et applique les interrupteurs
// du centre de contrôle (marketing_settings) :
//   • « Envois aux clients » coupé, ou notification de test : seuls les membres de l'équipe la
//     reçoivent ; les autres sont comptés « retenus ».
//   • « Envois automatiques » coupé : une notification programmée pour plus tard attend.
//
// Le lien de la notification porte ?pn=<id> : l'app compte le toucher à l'ouverture.
// Secrets : VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (+ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWebPush } from "../push-notify/webpush.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" } });

/** Une notification programmée à plus de 2 minutes de sa création est un envoi automatique. */
const AUTOMATIC_AFTER_MS = 2 * 60_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const vapid = { publicKey: Deno.env.get("VAPID_PUBLIC_KEY") ?? "", privateKey: Deno.env.get("VAPID_PRIVATE_KEY") ?? "", subject: Deno.env.get("VAPID_SUBJECT") ?? "mailto:support@ooble.ca" };
  if (!url || !key || !vapid.publicKey || !vapid.privateKey) return json({ error: "Configuration serveur incomplète." }, 500);
  const db = createClient(url, key);

  const { data: due } = await db.from("push_campaigns").select("*")
    .eq("status", "scheduled").lte("scheduled_at", new Date().toISOString()).order("scheduled_at").limit(3);
  if (!due?.length) return json({ ok: true, idle: true });

  const { data: s } = await db.from("marketing_settings").select("client_sends, automatic_sends").eq("id", 1).maybeSingle();
  const report: Record<string, unknown>[] = [];

  for (const c of due) {
    const automatic = new Date(c.scheduled_at).getTime() - new Date(c.created_at).getTime() > AUTOMATIC_AFTER_MS;
    if (automatic && !s?.automatic_sends) { report.push({ id: c.id, waiting: "envois automatiques coupés" }); continue; }
    // On réserve la notification : jamais deux envois en même temps.
    const { data: claimed } = await db.from("push_campaigns").update({ status: "sending" }).eq("id", c.id).eq("status", "scheduled").select("id").maybeSingle();
    if (!claimed) continue;

    // Audience enregistrée (Marketing › Audiences) : « aud:<id> », recalculée maintenant.
    const { data: people } = await db.rpc("notif_audience", { _aud: c.audience_id ? `aud:${c.audience_id}` : c.audience });
    const list = (people ?? []) as { user_id: string; lang: string; staff: boolean }[];
    const teamOnly = c.is_test || !s?.client_sends;
    const allowed = list.filter((p) => !teamOnly || p.staff);
    const blocked = list.length - allowed.length;

    const link = `${c.url}${c.url.includes("?") ? "&" : "?"}pn=${c.id}`;
    let devices = 0, sent = 0, failed = 0;
    for (let i = 0; i < allowed.length; i += 200) {
      const ids = allowed.slice(i, i + 200).map((p) => p.user_id);
      const { data: subs } = await db.from("push_subscriptions").select("endpoint, p256dh, auth, lang").in("user_id", ids);
      for (const sub of subs ?? []) {
        devices++;
        const en = sub.lang === "en" && c.title_en && c.body_en;
        const payload = JSON.stringify({ title: en ? c.title_en : c.title_fr, body: en ? c.body_en : c.body_fr, url: link });
        try {
          const r = await sendWebPush(sub, payload, vapid);
          if (r.ok) sent++; else failed++;
        } catch { failed++; }
      }
    }
    await db.from("push_campaigns").update({
      status: "sent", finished_at: new Date().toISOString(), people: allowed.length, devices, sent, failed, blocked,
    }).eq("id", c.id);
    report.push({ id: c.id, people: allowed.length, devices, sent, failed, blocked });
  }
  return json({ ok: true, report });
});
