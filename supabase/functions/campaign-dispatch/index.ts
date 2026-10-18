// Fonction edge Ooble — envoie les campagnes marketing préparées dans le back-office.
//
// Chaque courriel d'une campagne est préparé dans le back-office (campaign_sends, statut « queued »),
// puis envoyé ici, par Resend, quand la campagne est due. Appelée chaque minute (pg_cron) et tout
// de suite quand l'équipe clique « Envoyer ».
//
// Garde-fous (Back-office › Marketing › Centre de contrôle, table marketing_settings) :
//   • « Envois aux clients » coupé : seuls les membres de l'équipe reçoivent ; les autres courriels
//     passent « bloqué » et ne partent jamais.
//   • « Envois automatiques » coupé : une campagne programmée pour plus tard attend, sans rien envoyer.
//     (Un envoi lancé tout de suite par l'équipe n'est pas automatique : il part.)
//   • Forfait du jour : on n'envoie jamais plus que la limite quotidienne moins la réserve gardée pour
//     les courriels de commande ; le reste attend le lendemain.
//   • Désabonnés : jamais d'envoi (statut « ignoré »).
//   • Parcours (Marketing › Parcours) : leur campagne permanente n'envoie que si le parcours est
//     allumé et les envois automatiques aussi. Parcours éteint, ou courriel en attente depuis plus de
//     24 heures : il est « ignoré », pour ne jamais écrire à quelqu'un hors de propos.
//
// Secrets : RESEND_API_KEY, EMAIL_FROM (+ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY automatiques).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { caller } from "../_shared/guard.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" } });

/** Au plus tant de courriels par passage (un passage par minute). */
const PER_RUN = 60;
/** Une campagne programmée à plus de 2 minutes de sa création est un envoi automatique. */
const AUTOMATIC_AFTER_MS = 2 * 60_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const apiKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const from = Deno.env.get("EMAIL_FROM") ?? "Ooble <onboarding@resend.dev>";
  if (!url || !key || !apiKey) return json({ error: "Configuration serveur incomplète." }, 500);
  const db = createClient(url, key);
  if (!(await caller(req, db, key))) return json({ error: "Accès refusé." }, 401);

  const { data: s } = await db.from("marketing_settings").select("*").eq("id", 1).maybeSingle();
  const settings = { clientSends: !!s?.client_sends, automatic: !!s?.automatic_sends, limit: Number(s?.daily_limit ?? 100), reserve: Number(s?.daily_reserve ?? 30) };

  // Campagnes dues, puis les parcours qui ont des courriels en attente.
  const { data: dueRows } = await db.from("campaigns").select("id, status, scheduled_at, created_at, is_test, journey_id")
    .is("journey_id", null).in("status", ["scheduled", "sending"]).lte("scheduled_at", new Date().toISOString()).order("scheduled_at").limit(5);
  const due: { id: string; status: string; scheduled_at: string; created_at: string; is_test: boolean; journey_id: string | null }[] = [...(dueRows ?? [])];
  const { data: journeys } = await db.from("journeys").select("id, enabled, campaign_id");
  for (const j of journeys ?? []) {
    if (!j.campaign_id) continue;
    const stale = new Date(Date.now() - 24 * 3600_000).toISOString();
    // Parcours éteint, ou courriel trop ancien : il ne part plus.
    if (!j.enabled) {
      await db.from("campaign_sends").update({ status: "skipped", error: "Parcours éteint." }).eq("campaign_id", j.campaign_id).eq("status", "queued");
      continue;
    }
    await db.from("campaign_sends").update({ status: "skipped", error: "En attente depuis plus de 24 heures : plus d'actualité." })
      .eq("campaign_id", j.campaign_id).eq("status", "queued").lt("created_at", stale);
    const { count } = await db.from("campaign_sends").select("id", { count: "exact", head: true }).eq("campaign_id", j.campaign_id).eq("status", "queued");
    if (count) due.push({ id: j.campaign_id, status: "paused", scheduled_at: "", created_at: "", is_test: false, journey_id: j.id });
  }
  if (!due.length) return json({ ok: true, idle: true });

  // Forfait du jour : limite moins la réserve des commandes, moins ce qui est déjà parti aujourd'hui.
  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
  const { count: today } = await db.from("campaign_sends").select("id", { count: "exact", head: true })
    .eq("status", "sent").gte("sent_at", dayStart.toISOString());
  let budget = Math.max(0, Math.min(PER_RUN, settings.limit - settings.reserve - (today ?? 0)));

  // Adresses de l'équipe (les seules autorisées quand les envois aux clients sont coupés).
  const { data: staffRows } = await db.from("user_roles").select("user_id");
  const staffIds = [...new Set((staffRows ?? []).map((r) => r.user_id as string))];
  const staffEmails = new Set<string>();
  if (staffIds.length) {
    const { data: p } = await db.from("profiles").select("email").in("id", staffIds);
    for (const r of p ?? []) if (r.email) staffEmails.add(String(r.email).toLowerCase());
  }

  const report: Record<string, unknown>[] = [];
  for (const c of due) {
    const automatic = !!c.journey_id || new Date(c.scheduled_at).getTime() - new Date(c.created_at).getTime() > AUTOMATIC_AFTER_MS;
    if (automatic && !settings.automatic) { report.push({ id: c.id, waiting: "envois automatiques coupés" }); continue; }
    if (c.status === "scheduled") {
      await db.from("campaigns").update({ status: "sending", started_at: new Date().toISOString() }).eq("id", c.id).eq("status", "scheduled");
    }

    const { data: queue } = await db.from("campaign_sends")
      .select("id, email, subject, html, text_body, unsubscribe_url").eq("campaign_id", c.id).eq("status", "queued").limit(Math.max(budget, 1) + 40);
    let sent = 0, blocked = 0, skipped = 0, failed = 0;

    // Désabonnés parmi ce lot.
    const emails = (queue ?? []).map((q) => q.email.toLowerCase());
    const { data: outs } = emails.length
      ? await db.from("marketing_optout").select("email").in("email", emails).not("unsubscribed_at", "is", null)
      : { data: [] as { email: string }[] };
    const optedOut = new Set((outs ?? []).map((o) => String(o.email).toLowerCase()));

    for (const q of queue ?? []) {
      const to = q.email.toLowerCase();
      const isStaff = staffEmails.has(to);
      if (!isStaff && (c.is_test || !settings.clientSends)) {
        await db.from("campaign_sends").update({ status: "blocked", error: c.is_test ? "Campagne de test : équipe seulement." : "Envois aux clients coupés (Marketing › Centre de contrôle)." }).eq("id", q.id).eq("status", "queued");
        blocked++; continue;
      }
      if (optedOut.has(to)) {
        await db.from("campaign_sends").update({ status: "skipped", error: "Désabonné." }).eq("id", q.id).eq("status", "queued");
        skipped++; continue;
      }
      if (budget <= 0) break; // forfait du jour atteint : la suite part au prochain passage (ou demain)

      // On réserve la ligne avant d'envoyer : jamais deux envois du même courriel.
      const { data: claimed } = await db.from("campaign_sends").update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", q.id).eq("status", "queued").select("id").maybeSingle();
      if (!claimed) continue;
      const payload: Record<string, unknown> = {
        from, to: q.email, subject: q.subject, html: q.html,
        ...(q.text_body ? { text: q.text_body } : {}),
        tags: [{ name: "campaign", value: c.id }, { name: "send", value: q.id }],
        ...(q.unsubscribe_url && /^https:\/\//.test(q.unsubscribe_url) ? { headers: { "List-Unsubscribe": `<${q.unsubscribe_url}>` } } : {}),
      };
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": q.id },
          body: JSON.stringify(payload),
        });
        const out = await res.json().catch(() => ({}));
        if (res.ok && out?.id) {
          await db.from("campaign_sends").update({ resend_id: out.id }).eq("id", q.id);
          sent++; budget--;
        } else {
          await db.from("campaign_sends").update({ status: "failed", sent_at: null, error: String(out?.message ?? `HTTP ${res.status}`).slice(0, 300) }).eq("id", q.id);
          failed++;
          if (res.status === 429) break; // Resend sature : on reprendra au prochain passage
        }
      } catch (e) {
        await db.from("campaign_sends").update({ status: "failed", sent_at: null, error: String(e).slice(0, 300) }).eq("id", q.id);
        failed++;
      }
      await new Promise((r) => setTimeout(r, 550)); // Resend : 2 envois par seconde au plus
    }

    // Terminée quand plus rien n'attend (un parcours, lui, ne se termine jamais).
    const { count: left } = await db.from("campaign_sends").select("id", { count: "exact", head: true }).eq("campaign_id", c.id).eq("status", "queued");
    if (!left && !c.journey_id) await db.from("campaigns").update({ status: "sent", finished_at: new Date().toISOString() }).eq("id", c.id).in("status", ["sending", "scheduled"]);
    report.push({ id: c.id, sent, blocked, skipped, failed, left: left ?? 0 });
    if (budget <= 0) break;
  }
  return json({ ok: true, budget, report });
});
