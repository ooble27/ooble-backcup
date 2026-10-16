// Fonction edge Ooble — événements des courriels envoyés (webhook Resend).
//
// Resend prévient à chaque étape d'un courriel : délivré, ouvert, cliqué, rebond, plainte.
// Pour les courriels de campagne (campaign_sends.resend_id), on note l'heure de chaque étape,
// le nombre d'ouvertures et de clics, et chaque clic avec son lien (campaign_events).
// Les autres courriels (commandes, vérifications) sont ignorés.
//
// Déployée sans vérification JWT : Resend appelle directement, et chaque appel est authentifié
// par sa signature Svix.
// Secret requis : RESEND_EVENTS_SECRET (whsec_…, donné par Resend à la création du webhook).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Signature Svix : HMAC-SHA256 de « id.horodatage.corps », horodatage de moins de 5 minutes. */
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

/** Type Resend → colonne d'horodatage. */
const STAMP: Record<string, string> = {
  "email.delivered": "delivered_at",
  "email.opened": "opened_at",
  "email.clicked": "clicked_at",
  "email.bounced": "bounced_at",
  "email.complained": "complained_at",
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);
  const secret = Deno.env.get("RESEND_EVENTS_SECRET") ?? "";
  if (!secret) return json({ error: "RESEND_EVENTS_SECRET manquant." }, 503);
  const raw = await req.text();
  if (!(await svixValid(secret, req.headers, raw))) return json({ error: "Signature invalide" }, 401);

  let ev: { type?: string; created_at?: string; data?: { email_id?: string; click?: { link?: string } } };
  try { ev = JSON.parse(raw); } catch { return json({ error: "JSON invalide" }, 400); }
  const type = ev.type ?? "";
  const emailId = ev.data?.email_id;
  if (!emailId || !STAMP[type]) return json({ ok: true, ignored: true });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: send } = await db.from("campaign_sends").select("id, opens, clicks, " + STAMP[type]).eq("resend_id", emailId).maybeSingle();
  if (!send) return json({ ok: true, ignored: true }); // courriel de commande ou de vérification

  const s = send as unknown as Record<string, unknown> & { id: string; opens: number; clicks: number };
  const at = ev.created_at ?? new Date().toISOString();
  const patch: Record<string, unknown> = {};
  if (!s[STAMP[type]]) patch[STAMP[type]] = at; // première fois seulement
  if (type === "email.opened") patch.opens = (s.opens ?? 0) + 1;
  if (type === "email.clicked") patch.clicks = (s.clicks ?? 0) + 1;
  if (Object.keys(patch).length) await db.from("campaign_sends").update(patch).eq("id", s.id);
  await db.from("campaign_events").insert({
    send_id: s.id, type: type.replace("email.", ""), url: type === "email.clicked" ? (ev.data?.click?.link ?? null) : null, at,
  });
  return json({ ok: true });
});
