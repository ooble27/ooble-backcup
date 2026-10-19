-- Retirer une tâche : pas encore commencée, faite, ou archivée (jamais en cours). Rien n'est effacé : elle
-- disparaît des listes de tout le monde mais reste en base pour l'historique.
create or replace function public.team_task_remove(_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare t record;
begin
  perform public.team_require_staff();
  select * into t from public.team_tasks where id = _id and removed_at is null;
  if t is null then raise exception 'Tâche introuvable.'; end if;
  if not public.team_task_can_edit(t.created_by) then raise exception 'Seule la personne qui a créé la tâche, ou un administrateur, peut la retirer.'; end if;
  if t.status = 'doing' and not t.archived then raise exception 'Une tâche en cours ne se retire pas : attendez qu''elle soit faite.'; end if;
  update public.team_tasks set removed_at = now(), removed_by = auth.uid(), updated_at = now() where id = _id;
end;
$$;
