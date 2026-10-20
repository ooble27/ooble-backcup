// Fonction edge Ooble : réinitialisation des commandes de test, et lancement.
//
// Avant le lancement, les commandes en base viennent des tests de l'équipe.
// Un administrateur peut les remettre à zéro depuis le back-office, autant de
// fois qu'il veut. Une fois la plateforme lancée (« Démarrer les activités »),
// la réinitialisation est refusée pour toujours.
//
// Effacé : les commandes et leur historique, les virements Interac reçus,
// les envois de cryptomonnaie, les dépôts reçus, les codes promo utilisés.
// Détaché (gardé, sans lien vers la commande) : parrainages, tâches de l'équipe.
// En option : la messagerie et les journaux (activité de l'équipe, assistant IA).
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

/**
 * Ce qu'on fait de chaque table qui cite une commande (« table.colonne »). La liste des tables est lue
 * dans la base à chaque fois (order_references) : une table ajoutée plus tard sans règle ici bloque la
 * remise à zéro AVANT tout effacement, avec son nom, au lieu de la laisser à moitié faite.
 *   wipe    : la ligne n'a de sens qu'avec la commande, elle est effacée avec elle ;
 *   unlink  : la ligne est gardée, seul le lien vers la commande est retiré (et `also` remis à zéro) ;
 *   protect : la commande citée est gardée (registre de conformité).
 * Les liens que la base gère seule (la ligne suit ou se vide avec la commande) n'ont pas besoin de règle.
 */
type Rule = { do: "wipe" } | { do: "unlink"; also?: Record<string, null> } | { do: "protect" };
const RULES: Record<string, Rule> = {
  "interac_receipts.order_id": { do: "wipe" },
  "usdt_payouts.order_id": { do: "wipe" },
  "chain_deposits.order_id": { do: "wipe" },
  "payment_confirmations.order_id": { do: "wipe" },
  "blockchain_transactions.order_id": { do: "wipe" },
  "promo_redemptions.order_id": { do: "wipe" },
  "referrals.referred_order_id": { do: "unlink", also: { qualified_at: null } },
  "referrals.sponsor_order_id": { do: "unlink" },
  "team_tasks.order_id": { do: "unlink" },
  "compliance_alerts.order_id": { do: "protect" },
  "compliance_flags.order_id": { do: "protect" },
};
/** Tables sans colonne id : leur clé est la commande. */
const KEY: Record<string, string> = { promo_redemptions: "order_id" };
const MAIL = ["mail_threads"]; // mail_messages suit (cascade)
const LOGS = ["ai_alerts", "ai_calls", "admin_audit_log"];

const LABEL: Record<string, string> = {
  orders: "Commandes (et leur historique)", interac_receipts: "Virements Interac reçus", usdt_payouts: "Envois de cryptomonnaie",
  chain_deposits: "Dépôts reçus (ventes)", promo_redemptions: "Codes promo utilisés", payment_confirmations: "Confirmations de paiement",
  blockchain_transactions: "Transactions blockchain", mail_threads: "Conversations de la messagerie",
  ai_alerts: "Alertes de l'assistant IA", ai_calls: "Questions à l'assistant IA", admin_audit_log: "Journal d'activité de l'équipe",
  referrals: "Parrainages", team_tasks: "Tâches de l'équipe",
};

type Q = ReturnType<SupabaseClient["from"]>;
interface Plan { wipe: string[]; unlink: [string, string, Record<string, null>][]; protect: [string, string][]; unknown: string[] }

/** Lit dans la base les tables qui citent une commande et décide quoi faire de chacune. */
async function plan(db: SupabaseClient): Promise<Plan> {
  const { data, error } = await db.rpc("order_references");
  if (error) throw new Error(`Liens vers les commandes : ${error.message}`);
  const p: Plan = { wipe: [], unlink: [], protect: [], unknown: [] };
  for (const r of (data ?? []) as { tbl: string; col: string; on_delete: string }[]) {
    if (["c", "n", "d"].includes(r.on_delete)) continue; // la base s'en charge seule
    const table = r.tbl.replace(/^public\./, "");
    const rule = RULES[`${table}.${r.col}`];
    if (!rule) p.unknown.push(`${table}.${r.col}`);
    else if (rule.do === "wipe") { if (r.col !== "order_id") p.unknown.push(`${table}.${r.col}`); else if (!p.wipe.includes(table)) p.wipe.push(table); }
    else if (rule.do === "unlink") p.unlink.push([table, r.col, { [r.col]: null, ...(rule.also ?? {}) }]);
    else p.protect.push([table, r.col]);
  }
  return p;
}

/** Commandes citées par le registre de conformité : gardées, avec tout ce qui s'y rattache. */
async function protectedOrders(db: SupabaseClient, pl: Plan): Promise<string[]> {
  const ids = new Set<string>();
  for (const [t, col] of pl.protect) {
    const { data, error } = await db.from(t).select(col).not(col, "is", null);
    if (error) throw new Error(`${t} : ${error.message}`);
    for (const r of (data ?? []) as unknown as Record<string, string>[]) ids.add(r[col]);
  }
  return [...ids];
}

/** Filtre « liens vers une commande effacée » (toutes sauf les commandes gardées). */
function notKept<T extends { not: (c: string, op: string, v: unknown) => T }>(q: T, col: string, keep: string[]): T {
  const base = q.not(col, "is", null);
  return keep.length ? base.not(col, "in", `(${keep.join(",")})`) : base;
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

/** Lignes gardées qui perdront leur lien vers une commande effacée. */
async function countUnlink(db: SupabaseClient, pl: Plan, keep: string[]) {
  const out: Record<string, number> = {};
  for (const [t, col] of pl.unlink) {
    const { count: n, error } = await notKept(db.from(t).select("*", { count: "exact", head: true }), col, keep);
    if (error) throw new Error(`${t} : ${error.message}`);
    out[t] = (out[t] ?? 0) + (n ?? 0);
  }
  return Object.entries(out).map(([table, n]) => ({ table, label: LABEL[table] ?? table, n }));
}

/** Retire le lien vers les commandes effacées, sans effacer la ligne (parrainage, tâche…). */
async function unlink(db: SupabaseClient, pl: Plan, keep: string[]) {
  for (const [t, col, patch] of pl.unlink) {
    const { error } = await notKept(db.from(t).update(patch), col, keep);
    if (error) throw new Error(`${LABEL[t] ?? t} : ${error.message}`);
  }
}

const blockedMessage = (unknown: string[]) =>
  `Remise à zéro en pause : ${unknown.join(", ")} cite des commandes et n'a pas encore de règle. Rien n'a été effacé.`;

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
      const pl = await plan(db);
      const keep = await protectedOrders(db, pl);
      const item = async (t: string, k: string[] | null) => ({ table: t, label: LABEL[t] ?? t, n: await count(db, t, k) });
      return json({
        ok: true, ...st,
        blocked: pl.unknown.length ? blockedMessage(pl.unknown) : null,
        unlinked: await countUnlink(db, pl, keep),
        core: await Promise.all([...pl.wipe, "orders"].map((t) => item(t, keep))),
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

      const pl = await plan(db);
      if (pl.unknown.length) return json({ error: blockedMessage(pl.unknown) }, 409);
      const keep = await protectedOrders(db, pl);
      const done: Record<string, number> = {};
      await unlink(db, pl, keep);
      for (const t of [...pl.wipe, "orders"]) { done[t] = await count(db, t, keep); if (done[t]) await wipe(db, t, keep); }
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
