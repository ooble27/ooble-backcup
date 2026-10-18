import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { caller } from "../_shared/guard.ts";
// Edge function Ooble — notification PUSH quand le statut d'un ordre change
// (paiement reçu, terminé, annulé, expiré, remboursé), en français ou en
// anglais selon l'appareil. Pas d'e-mail ici (envoyés ailleurs).
//
// Appelée par le trigger Postgres `trg_order_status_notify` via pg_net.

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type Msg = { title: string; body: string };
type Ctx = { ref: string; usdt: string; cad: string };

/** Messages par sens et statut ; null : pas de notification (étape trop brève). */
function messages(side: string, status: string, c: Ctx, e: Ctx): { fr: Msg; en: Msg } | null {
  const buy = side === "buy";
  switch (status) {
    case "payment_received":
      return buy
        ? { fr: { title: "Paiement reçu", body: `Votre virement de ${c.cad} $ est arrivé. Vos ${c.usdt} USDT partent. (${c.ref})` },
            en: { title: "Payment received", body: `Your $${e.cad} transfer arrived. Your ${e.usdt} USDT are on their way. (${e.ref})` } }
        : { fr: { title: "USDT reçus", body: `Nous avons reçu vos ${c.usdt} USDT. Votre virement Interac de ${c.cad} $ est en préparation. (${c.ref})` },
            en: { title: "USDT received", body: `We received your ${e.usdt} USDT. Your $${e.cad} Interac transfer is being prepared. (${e.ref})` } };
    case "completed":
      return buy
        ? { fr: { title: "USDT envoyés", body: `${c.usdt} USDT sont dans votre wallet. (${c.ref})` },
            en: { title: "USDT sent", body: `${e.usdt} USDT are in your wallet. (${e.ref})` } }
        : { fr: { title: "Virement envoyé", body: `${c.cad} $ vous ont été envoyés par Interac. (${c.ref})` },
            en: { title: "Transfer sent", body: `$${e.cad} has been sent to you by Interac. (${e.ref})` } };
    case "cancelled":
      return { fr: { title: "Ordre annulé", body: `L'ordre ${c.ref} a été annulé.` }, en: { title: "Order cancelled", body: `Order ${e.ref} was cancelled.` } };
    case "expired":
      return { fr: { title: "Ordre expiré", body: `L'ordre ${c.ref} a expiré : aucun paiement reçu à temps.` }, en: { title: "Order expired", body: `Order ${e.ref} expired: no payment received in time.` } };
    case "refunded":
      return { fr: { title: "Ordre remboursé", body: `L'ordre ${c.ref} a été remboursé.` }, en: { title: "Order refunded", body: `Order ${e.ref} was refunded.` } };
    default:
      return null;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "Config manquante" }, 500);
  const who = await caller(req, createClient(supabaseUrl, serviceKey), serviceKey);
  if (!who || who.kind === "staff") return json({ error: "Accès refusé." }, 401);

  let payload: { type: string; table: string; record: Record<string, unknown>; old_record: Record<string, unknown> };
  try { payload = await req.json(); }
  catch { return json({ error: "JSON invalide" }, 400); }

  if (payload.type !== "UPDATE" || payload.table !== "orders") {
    return json({ ok: true, skipped: true });
  }

  const oldStatus = payload.old_record?.status as string;
  const newStatus = payload.record?.status as string;
  if (!oldStatus || !newStatus || oldStatus === newStatus) {
    return json({ ok: true, skipped: "same_status" });
  }

  // Le contenu reçu n'est pas une preuve : on relit l'ordre en base et on
  // n'envoie la notification que si son statut actuel correspond.
  const orderId = payload.record?.id as string;
  if (!orderId) return json({ ok: true, skipped: "no_id" });
  const db = createClient(supabaseUrl, serviceKey);
  const { data: row } = await db
    .from("orders")
    .select("id, user_id, side, cad_amount, usdt_amount, status, hidden")
    .eq("id", orderId)
    .maybeSingle();
  if (!row || row.status !== newStatus) return json({ ok: true, skipped: "mismatch" });
  // Essai retiré par l'équipe : rien à annoncer au client.
  if (row.hidden) return json({ ok: true, skipped: "hidden" });
  const userId = row.user_id as string;
  const ref = `OOB-${orderId.slice(0, 8).toUpperCase()}`;
  const nf = (n: number, loc: string) => Number(n).toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\u202f|\u00a0/g, " ");
  const usdt = row.usdt_amount as number, cad = row.cad_amount as number;
  const i18n = messages(row.side as string, newStatus,
    { ref, usdt: nf(usdt, "fr-CA"), cad: nf(cad, "fr-CA") },
    { ref, usdt: nf(usdt, "en-CA"), cad: nf(cad, "en-CA") });
  if (!i18n) return json({ ok: true, skipped: "silent_status" });

  // Envoyer la notification push via push-notify
  try {
    await fetch(`${supabaseUrl}/functions/v1/push-notify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ user_id: userId, i18n, url: `/app/activite/${orderId}` }),
    });
  } catch (e) {
    console.error("order-notify: push failed", e);
  }

  // NOTE : on n'envoie PAS d'e-mail ici. Les e-mails transactionnels
  // (order-buy, payment-received, order-completed…) sont déjà envoyés
  // par le frontend au bon moment. Envoyer un mail à chaque changement
  // de statut ferait des doublons.

  return json({ ok: true, ref, newStatus });
});
