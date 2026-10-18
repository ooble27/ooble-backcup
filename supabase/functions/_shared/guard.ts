// Qui peut lancer une fonction automatique :
//  • les tâches planifiées et le déclencheur des commandes (en-tête x-ooble-cron, secret gardé en base) ;
//  • les autres fonctions (clé service) ;
//  • un membre de l'équipe connecté (rôles demandés, ou n'importe quel rôle si aucun n'est précisé).
// Tout autre appel est refusé.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

let cronSecret: string | null = null;

async function readCronSecret(db: SupabaseClient): Promise<string | null> {
  if (cronSecret) return cronSecret;
  const { data } = await db.from("cron_secret").select("secret").eq("id", 1).maybeSingle();
  cronSecret = (data?.secret as string | undefined) ?? null;
  return cronSecret;
}

export type Caller = { kind: "cron" | "service" } | { kind: "staff"; uid: string };

export async function caller(req: Request, db: SupabaseClient, serviceKey: string, roles?: string[]): Promise<Caller | null> {
  const cron = req.headers.get("x-ooble-cron");
  if (cron) {
    const secret = await readCronSecret(db);
    if (secret && cron === secret) return { kind: "cron" };
  }
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  if (serviceKey && token === serviceKey) return { kind: "service" };
  const { data: auth } = await db.auth.getUser(token);
  const uid = auth?.user?.id;
  if (!uid) return null;
  const { data: rows } = await db.from("user_roles").select("role").eq("user_id", uid);
  const mine = (rows ?? []).map((r) => r.role as string);
  const ok = roles?.length ? mine.some((r) => roles.includes(r)) : mine.length > 0;
  return ok ? { kind: "staff", uid } : null;
}

export const refused = (headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error: "Accès refusé." }), { status: 401, headers: { "Content-Type": "application/json", ...headers } });
