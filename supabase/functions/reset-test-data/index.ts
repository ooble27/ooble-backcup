// Fonction edge Ooble : réinitialisation des commandes de test, et lancement.
//
// Avant le lancement, les commandes en base viennent des tests de l'équipe.
// Un administrateur peut les remettre à zéro depuis le back-office, autant de
// fois qu'il veut. Une fois la plateforme lancée (« Démarrer les activités »),
// la réinitialisation est refusée pour toujours.
//
// Effacé : les commandes et leur historique, les virements Interac reçus,
// les envois USDT, les dépôts USDT reçus. En option : la messagerie et les
// journaux (activité de l'équipe, assistant IA).
//
// JAMAIS touché : les comptes clients, les vérifications d'identité et
// d'entreprise et leurs documents, les destinataires enregistrés, le
// registre de conformité (et les commandes qu'il cite), les comptes de
// l'équipe, le règlement auto, la trésorerie.
//
// POST JSON, jeton d'un administrateur connecté (JWT vérifié par Supabase) :
//   { action: "preview" }
//   { action: "reset", confirm: "REINITIALISER", mail?: bool, logs?: bool }
//   { action: "launch", confirm: "DEMARRER" }  irréversible depuis l'app

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

/** Rattachées à une commande (colonne order_id), effacées avant les commandes. */
const ORDER_LINKED = ["interac_receipts", "usdt_payouts", "chain_deposits", "payment_confirmations", "blockchain_transactions", "promo_redemptions"];
/** Tables sans colonne id : leur clé est la commande. */
const KEY: Record<string, string> = { promo_redemptions: "order_id" };
const MAIL = ["mail_threads"]; // mail_messages suit (cascade)
const LOGS = ["ai_alerts", "ai_calls", "admin_audit_log"];

const LABEL: Record<string, string> = {
  orders: "Commandes (et leur historique)", interac_receipts: "Virements Interac reçus", usdt_payouts: "Envois de cryptomonnaie",
  chain_deposits: "Dépôts reçus (ventes)", promo_redemptions: "Codes promo utilisés", payment_confirmations: "Confirmations de paiement",
  blockchain_transactions: "Transactions blockchain", mail_threads: "Conversations de la messagerie",
  ai_alerts: "Alertes de l'assistant IA", ai_calls: "Questions à l'assistant IA", admin_audit_log: "Journal d'activité de l'équipe",
};

type Q = ReturnType<SupabaseClient["from"]>;

/** Commandes citées par le registre de conformité : gardées, avec tout ce qui s'y rattache. */
async function protectedOrders(db: SupabaseClient): Promise<string[]> {
  const ids = new Set<string>();
  for (const t of ["compliance_alerts", "compliance_flags"]) {
    const { data, error } = await db.from(t).select("order_id").not("order_id", "is", null);
    if (error) throw new Error(`${t} : ${error.message}`);
    for (const r of data ?? []) ids.add(r.order_id as string);
  }
  return [...ids];
}

/** Applique le filtre « tout sauf les commandes protégées ». */
function scope(q: ReturnType<Q["delete"]> | ReturnType<Q["select"]>, table: string, keep: string[]) {
  const col = table === "orders" ? "id" : "order_id";
  return keep.length ? q.not(col, "in", `(${keep.join(",")})`) : q.not(KEY[table] ?? "id", "is", null);
}

async function count(db: SupabaseClient, table: string, keep: string[] | null): Promise<number> {
  let q = db.from(table).select("*", { count: "exact", head: true });
  if (keep) q = scope(q, table, keep) as typeof q;
  const { count: n, error } = await q;
  if (error) throw new Error(`${table} : ${error.message}`);
  let total = n ?? 0;
  // Lignes sans commande (ex. virement reçu jamais rapproché) : effacées aussi.
  if (keep?.length && table !== "orders" && !KEY[table]) {
    const { count: m } = await db.from(table).select("*", { count: "exact", head: true }).is("order_id", null);
    total += m ?? 0;
  }
  return total;
}

async function wipe(db: SupabaseClient, table: string, keep: string[] | null) {
  const { error } = keep
    ? await scope(db.from(table).delete(), table, keep)
    : await db.from(table).delete().not(KEY[table] ?? "id", "is", null);
  if (error) throw new Error(`${LABEL[table] ?? table} : ${error.message}`);
  if (keep?.length && table !== "orders" && !KEY[table]) {
    const { error: e2 } = await db.from(table).delete().is("order_id", null);
    if (e2) throw new Error(`${LABEL[table] ?? table} : ${e2.message}`);
  }
}

/**
 * Liens vers les commandes effacées qu'on garde ailleurs : le parrainage revient à « pas encore utilisé »
 * (on peut refaire l'essai) et les tâches de l'équipe restent, sans commande liée.
 */
async function unlink(db: SupabaseClient, keep: string[]) {
  const notKept = (q: ReturnType<Q["update"]>, col: string) =>
    keep.length ? q.not(col, "is", null).not(col, "in", `(${keep.join(",")})`) : q.not(col, "is", null);
  const steps: [string, Record<string, null>, string][] = [
    ["referrals", { referred_order_id: null, qualified_at: null }, "referred_order_id"],
    ["referrals", { sponsor_order_id: null }, "sponsor_order_id"],
    ["team_tasks", { order_id: null }, "order_id"],
  ];
  for (const [table, patch, col] of steps) {
    const { error } = await notKept(db.from(table).update(patch), col);
    if (error) throw new Error(`${table} : ${error.message}`);
  }
}

async function state(db: SupabaseClient) {
  const { data } = await db.from("platform_state").select("launched_at, last_reset_at").eq("id", true).maybeSingle();
  return { launchedAt: data?.launched_at ?? null, lastResetAt: data?.last_reset_at ?? null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST uniquement" }, 405);
  if (!SB_URL || !SERVICE) return json({ error: "Configuration serveur incomplète." }, 500);

  const db = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const { data: auth } = token ? await db.auth.getUser(token) : { data: { user: null } };
  const me = auth?.user;
  if (!me) return json({ error: "Authentification requise." }, 401);
  const { data: role } = await db.from("user_roles").select("role").eq("user_id", me.id).eq("role", "admin").maybeSingle();
  if (!role) return json({ error: "Réservé aux administrateurs." }, 403);

  let body: { action?: string; confirm?: string; mail?: boolean; logs?: boolean } = {};
  try { body = await req.json(); } catch { /* corps vide */ }
  const confirm = (body.confirm ?? "").trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  try {
    const st = await state(db);

    if (body.action === "preview") {
      const keep = await protectedOrders(db);
      const item = async (t: string, k: string[] | null) => ({ table: t, label: LABEL[t] ?? t, n: await count(db, t, k) });
      return json({
        ok: true, ...st,
        core: await Promise.all([...ORDER_LINKED, "orders"].map((t) => item(t, keep))),
        mail: await Promise.all(MAIL.map((t) => item(t, null))),
        logs: await Promise.all(LOGS.map((t) => item(t, null))),
        keptOrders: keep.length,
      });
    }

    if (body.action === "launch") {
      if (confirm !== "DEMARRER") return json({ error: "confirm" }, 400);
      if (st.launchedAt) return json({ ok: true, launchedAt: st.launchedAt });
      const at = new Date().toISOString();
      const { error } = await db.from("platform_state").update({ launched_at: at, launched_by: me.id }).eq("id", true);
      if (error) throw new Error(error.message);
      await db.from("admin_audit_log").insert({
        actor_user_id: me.id, actor_role: "admin", actor_email: me.email, action: "platform.launch", entity_kind: "platform", metadata: { at },
      });
      return json({ ok: true, launchedAt: at });
    }

    if (body.action === "reset") {
      if (st.launchedAt) return json({ error: "launched", message: "La plateforme est lancée : plus de réinitialisation possible." }, 409);
      if (confirm !== "REINITIALISER") return json({ error: "confirm" }, 400);

      const keep = await protectedOrders(db);
      const done: Record<string, number> = {};
      await unlink(db, keep);
      for (const t of [...ORDER_LINKED, "orders"]) { done[t] = await count(db, t, keep); if (done[t]) await wipe(db, t, keep); }
      for (const t of [...(body.mail ? MAIL : []), ...(body.logs ? LOGS : [])]) { done[t] = await count(db, t, null); if (done[t]) await wipe(db, t, null); }

      const at = new Date().toISOString();
      await db.from("platform_state").update({ last_reset_at: at, last_reset_by: me.id }).eq("id", true);
      await db.from("admin_audit_log").insert({
        actor_user_id: me.id, actor_role: "admin", actor_email: me.email, action: "platform.reset_test_orders", entity_kind: "platform",
        metadata: { at, tables: done, keptOrders: keep.length, mail: !!body.mail, logs: !!body.logs },
      });
      return json({ ok: true, tables: done, keptOrders: keep.length, lastResetAt: at });
    }

    return json({ error: "Action inconnue." }, 400);
  } catch (e) {
    console.error("reset-test-data", e);
    return json({ error: "server", message: (e as Error).message }, 500);
  }
});
