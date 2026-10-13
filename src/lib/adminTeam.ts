/**
 * Back-office — équipe réelle (table user_roles + profiles).
 * Un membre peut cumuler plusieurs rôles ; seul un administrateur les modifie (RLS).
 */
import { supabase } from "@/integrations/supabase/client";
import { logAdminAction } from "@/lib/audit";
import { sortRoles, type Role } from "@/lib/roles";

export interface LiveTeamMember {
  userId: string;
  name: string;
  email: string;
  roles: Role[];
}

/** Liste les membres de l'équipe et tous leurs rôles. */
export async function fetchTeam(): Promise<LiveTeamMember[]> {
  const { data: rows, error } = await supabase.from("user_roles").select("user_id, role");
  if (error || !rows || rows.length === 0) return [];

  const ids = [...new Set(rows.map((r) => r.user_id))];
  const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

  return ids.map((id) => {
    const p = byId.get(id);
    return {
      userId: id,
      name: p?.full_name?.trim() || "Membre",
      email: p?.email ?? "",
      roles: sortRoles(rows.filter((r) => r.user_id === id).map((r) => r.role)) as Role[],
    };
  });
}

async function currentUid() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

/** Donne exactement ces rôles au membre : ajoute ceux qui manquent, retire les autres. */
export async function setMemberRoles(userId: string, roles: Role[]): Promise<{ error?: string }> {
  if (roles.length === 0) return { error: "Choisissez au moins un rôle, ou retirez la personne de l'équipe." };
  const { data: before } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const previous = (before ?? []).map((r) => r.role as Role);
  if (userId === (await currentUid()) && previous.includes("admin") && !roles.includes("admin")) {
    return { error: "Vous ne pouvez pas retirer votre propre rôle Administrateur : demandez à un autre administrateur." };
  }

  const add = roles.filter((r) => !previous.includes(r));
  const remove = previous.filter((r) => !roles.includes(r));
  if (add.length) {
    const { error } = await supabase.from("user_roles").insert(add.map((role) => ({ user_id: userId, role })));
    if (error) return { error: error.message };
  }
  if (remove.length) {
    const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).in("role", remove);
    if (error) return { error: error.message };
  }

  void logAdminAction({
    action: "team.role_change",
    entityKind: "team_member",
    entityId: userId,
    before: { roles: previous },
    after: { roles },
    metadata: { added: add, removed: remove },
  });
  return {};
}

/** Retire la personne de l'équipe (son compte client reste intact). */
export async function removeMember(userId: string): Promise<{ error?: string }> {
  if (userId === (await currentUid())) return { error: "Vous ne pouvez pas vous retirer vous-même de l'équipe." };
  const { data: before } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const previous = (before ?? []).map((r) => r.role);

  const { error } = await supabase.from("user_roles").delete().eq("user_id", userId);
  if (error) return { error: error.message };

  void logAdminAction({ action: "team.remove", entityKind: "team_member", entityId: userId, before: { roles: previous }, after: null });
  return {};
}

/**
 * Ajoute un membre par courriel (compte Ooble existant) avec un ou plusieurs rôles.
 * S'il fait déjà partie de l'équipe, les rôles choisis s'ajoutent aux siens.
 */
export async function addMemberByEmail(email: string, roles: Role[]): Promise<{ error?: string; userId?: string }> {
  const clean = email.trim().toLowerCase();
  if (roles.length === 0) return { error: "Choisissez au moins un rôle." };
  const { data: prof, error: pErr } = await supabase.from("profiles").select("id").ilike("email", clean).maybeSingle();
  if (pErr) return { error: pErr.message };
  if (!prof) return { error: "Aucun compte Ooble avec ce courriel. La personne doit d'abord s'inscrire." };

  const { data: existing } = await supabase.from("user_roles").select("role").eq("user_id", prof.id);
  const merged = [...new Set([...(existing ?? []).map((r) => r.role as Role), ...roles])];
  const res = await setMemberRoles(prof.id, merged);
  if (!res.error) {
    void logAdminAction({ action: "team.invite", entityKind: "team_member", entityId: prof.id, after: { email: clean, roles }, metadata: { invited_email: clean } });
  }
  return { ...res, userId: prof.id };
}
