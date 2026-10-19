-- Passation à une personne précise : les tâches et commandes lui sont remises directement (elle seule est prévenue).
alter table public.team_handoffs add column if not exists to_user uuid;
alter table public.team_handoffs add column if not exists to_name text;

create or replace function public.team_handoff_post(_body text, _orders uuid[], _tasks uuid[], _to uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare hid uuid; b text := left(btrim(coalesce(_body, '')), 2000); me uuid := auth.uid(); n_t int := 0; n_o int := 0; who uuid[]; to_nm text; what text;
begin
  perform public.team_require_staff();
  if b = '' and coalesce(array_length(_orders, 1), 0) = 0 and coalesce(array_length(_tasks, 1), 0) = 0 then
    raise exception 'Écrivez ce que vous laissez en cours.';
  end if;
  if _to is not null then
    if _to = me then raise exception 'Choisissez une autre personne que vous.'; end if;
    if not public.is_staff(_to) then raise exception 'Cette personne ne fait pas partie de l''équipe.'; end if;
    select coalesce(nullif(btrim(full_name), ''), email) into to_nm from public.profiles where id = _to;
  end if;
  if exists (select 1 from public.team_handoffs where author_id = me and created_at > now() - interval '2 minutes') then
    raise exception 'Votre passation vient d''être transmise.';
  end if;
  update public.team_tasks set assignee_id = _to, assignee_role = null, status = 'todo',
    handed_off_by_name = public.team_who(), handed_off_at = now(), updated_at = now()
  where id = any(coalesce(_tasks, '{}')) and assignee_id = me and status <> 'done' and not archived and removed_at is null;
  get diagnostics n_t = row_count;
  update public.orders set assigned_to = _to, assigned_at = case when _to is null then null else now() end
  where id = any(coalesce(_orders, '{}')) and assigned_to = me and status in ('created', 'awaiting_payment', 'payment_received', 'settling');
  get diagnostics n_o = row_count;
  insert into public.team_handoffs (author_id, author_name, body, order_ids, task_ids, to_user, to_name)
  values (me, public.team_who(), b, coalesce(_orders[1:50], '{}'), coalesce(_tasks[1:50], '{}'), _to, to_nm)
  returning id into hid;
  what := concat_ws(' et ', case when n_o > 0 then n_o || case when n_o > 1 then ' commandes' else ' commande' end end,
                            case when n_t > 0 then n_t || case when n_t > 1 then ' tâches' else ' tâche' end end);
  if _to is not null then
    perform public.team_push(array[_to], 'tasks', 'Passation de ' || split_part(public.team_who(), ' ', 1) || ' pour vous',
      case when what <> '' then what || ' vous ' || case when n_t + n_o > 1 then 'sont confiées' else 'est confiée' end else left(b, 140) end, '/admin?tab=me');
  elsif n_t + n_o > 0 then
    select array_agg(distinct user_id) into who from public.user_roles where user_id <> me;
    if who is not null then
      perform public.team_push(who, 'tasks', 'Passation de ' || split_part(public.team_who(), ' ', 1), what || ' à reprendre', '/admin?tab=me');
    end if;
  end if;
  return hid;
end;
$$;
revoke all on function public.team_handoff_post(text, uuid[], uuid[], uuid) from public, anon;
grant execute on function public.team_handoff_post(text, uuid[], uuid[], uuid) to authenticated;

-- L'ancienne forme (sans destinataire) reste valable : passation à toute l'équipe.
create or replace function public.team_handoff_post(_body text, _orders uuid[], _tasks uuid[])
returns uuid
language sql
security definer
set search_path to 'public'
as $$ select public.team_handoff_post(_body, _orders, _tasks, null::uuid); $$;
