// Fonction edge Ooble : outils du back-office qui demandent les droits du serveur.
//
// POST JSON, jeton d'un membre de l'équipe connecté. Chaque action vérifie le rôle :
//   { action: "email_usage" }                 admin : courriels envoyés aujourd'hui et ce mois-ci (Resend)
//   { action: "account", userId }             admin, support : état de connexion d'un client
//   { action: "confirm_email", userId }       admin, support : confirme l'adresse d'un client bloqué à l'inscription
//   { action: "suspend" | "unsuspend", userId } admin, conformité : bloque ou rouvre l'accès au compte
//   { action: "test_kyc" }                    admin : le client fictif Camille Tremblay envoie un nouveau dossier
//
// Chaque changement sur un compte est inscrit au journal d'audit.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { testDocuments } from "./testDocs.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND = Deno.env.get("RESEND_API_KEY") ?? "";

/** Forfait Resend : 100 courriels par jour, 3 000 par mois (cycle qui repart le 4 de chaque mois). */
const DAY_LIMIT = 100;
const MONTH_LIMIT = 3000;
const CYCLE_DAY = 4;

const ALLOWED: Record<string, string[]> = {
  email_usage: ["admin"],
  account: ["admin", "support"],
  confirm_email: ["admin", "support"],
  suspend: ["admin", "compliance"],
  unsuspend: ["admin", "compliance"],
  test_kyc: ["admin"],
};

const TEST_EMAIL = "camille.test@ooble.ca";
const TEST_PERSON = { first: "Camille", last: "Tremblay", birth: "1994-03-12", address: "100, rue de l'Exemple", city: "Québec", province: "QC", postal: "G1A 0A0", occupation: "Infirmière" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  const db = createClient(SB_URL, SERVICE);
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const { data: auth } = await db.auth.getUser(token);
  const caller = auth?.user;
  if (!caller) return json({ error: "Session invalide ou expirée." }, 401);

  let body: { action?: string; userId?: string };
  try { body = await req.json(); } catch { return json({ error: "Requête invalide." }, 400); }
  const action = body.action ?? "";
  const allowed = ALLOWED[action];
  if (!allowed) return json({ error: "Action inconnue." }, 400);

  const { data: roleRows } = await db.from("user_roles").select("role").eq("user_id", caller.id);
  const roles = (roleRows ?? []).map((r) => r.role as string);
  if (!roles.some((r) => allowed.includes(r))) return json({ error: "Cette action n'est pas ouverte à votre rôle." }, 403);

  const audit = (name: string, userId: string, metadata: Record<string, unknown> = {}) =>
    db.from("admin_audit_log").insert({
      actor_user_id: caller.id, actor_email: caller.email ?? null, actor_role: roles.join(","),
      action: name, entity_kind: "client", entity_id: userId, metadata,
    });

  try {
    if (action === "email_usage") return json(await emailUsage());
    if (action === "test_kyc") return json(await testKyc(db));

    const userId = body.userId ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(userId)) return json({ error: "Client introuvable." }, 400);
    const { data: got, error } = await db.auth.admin.getUserById(userId);
    if (error || !got?.user) return json({ error: "Compte introuvable." }, 404);
    const u = got.user;

    if (action === "confirm_email") {
      if (!u.email_confirmed_at) {
        const { error: e } = await db.auth.admin.updateUserById(userId, { email_confirm: true });
        if (e) return json({ error: e.message }, 500);
        await audit("account.confirm_email", userId, { email: u.email });
      }
    } else if (action === "suspend" || action === "unsuspend") {
      const { error: e } = await db.auth.admin.updateUserById(userId, { ban_duration: action === "suspend" ? "876000h" : "none" });
      if (e) return json({ error: e.message }, 500);
      await audit(action === "suspend" ? "account.suspend" : "account.unsuspend", userId, { email: u.email });
    }

    const { data: fresh } = await db.auth.admin.getUserById(userId);
    const f = fresh?.user ?? u;
    const banned = (f as { banned_until?: string | null }).banned_until ?? null;
    return json({
      email: f.email ?? null,
      createdAt: f.created_at,
      emailConfirmedAt: f.email_confirmed_at ?? null,
      lastSignInAt: f.last_sign_in_at ?? null,
      suspended: !!banned && new Date(banned).getTime() > Date.now(),
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

/** Courriels partis aujourd'hui (jour UTC, comme Resend) et depuis le début du cycle mensuel. */
async function emailUsage() {
  if (!RESEND) throw new Error("Clé Resend absente.");
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const cycle = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), CYCLE_DAY));
  if (cycle > now) cycle.setUTCMonth(cycle.getUTCMonth() - 1);
  let today = 0, month = 0, after: string | null = null;
  for (let page = 0; page < 40; page++) {
    const url = `https://api.resend.com/emails?limit=100${after ? `&after=${after}` : ""}`;
    // Resend accepte quelques lectures par seconde : petite pause entre les pages, et on patiente si on va trop vite.
    if (page > 0) await new Promise((ok) => setTimeout(ok, 300));
    let r = await fetch(url, { headers: { Authorization: `Bearer ${RESEND}` } });
    for (let wait = 1; r.status === 429 && wait <= 3; wait++) {
      await new Promise((ok) => setTimeout(ok, 1000 * wait));
      r = await fetch(url, { headers: { Authorization: `Bearer ${RESEND}` } });
    }
    if (!r.ok) throw new Error(`Resend : ${r.status}`);
    const d = await r.json() as { data?: { id: string; created_at: string }[]; has_more?: boolean };
    const rows = d.data ?? [];
    let older = false;
    for (const e of rows) {
      const at = new Date(e.created_at.replace(" ", "T"));
      if (at < cycle) { older = true; break; }
      month++;
      if (at >= dayStart) today++;
    }
    if (older || !d.has_more || rows.length === 0) break;
    after = rows[rows.length - 1].id;
  }
  const resetsAt = new Date(dayStart.getTime() + 86400000).toISOString();
  const nextCycle = new Date(cycle); nextCycle.setUTCMonth(nextCycle.getUTCMonth() + 1);
  return { today, dayLimit: DAY_LIMIT, month, monthLimit: MONTH_LIMIT, resetsAt, monthResetsAt: nextCycle.toISOString() };
}

/** Le client fictif envoie un nouveau dossier complet (le compte est créé au premier essai). */
async function testKyc(db: ReturnType<typeof createClient>) {
  const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let uid = list?.users.find((u) => u.email === TEST_EMAIL)?.id;
  if (!uid) {
    const { data, error } = await db.auth.admin.createUser({
      email: TEST_EMAIL, password: crypto.randomUUID() + "Aa1!", email_confirm: true,
      user_metadata: { full_name: `${TEST_PERSON.first} ${TEST_PERSON.last}` },
    });
    if (error) throw new Error(error.message);
    uid = data.user.id;
  }
  await db.from("profiles").update({ full_name: `${TEST_PERSON.first} ${TEST_PERSON.last}` }).eq("id", uid);
  const stamp = Date.now();
  const paths: Record<string, string> = {};
  for (const [key, svg] of Object.entries(testDocuments(TEST_PERSON))) {
    const path = `${uid}/${key}_test_${stamp}.svg`;
    const { error } = await db.storage.from("kyc").upload(path, new Blob([svg], { type: "image/svg+xml" }), { contentType: "image/svg+xml", upsert: false });
    if (error) throw new Error(error.message);
    paths[key] = path;
  }
  const { data: row, error } = await db.from("kyc_verifications").insert({
    user_id: uid, provider: "native", status: "pending", doc_type: "national_id", document_paths: paths,
    birth_date: TEST_PERSON.birth, address_line: TEST_PERSON.address, city: TEST_PERSON.city,
    province: TEST_PERSON.province, postal_code: TEST_PERSON.postal, occupation: TEST_PERSON.occupation,
  }).select("id").single();
  if (error) throw new Error(error.message);
  return { dossier: row.id, client: `${TEST_PERSON.first} ${TEST_PERSON.last}` };
}
