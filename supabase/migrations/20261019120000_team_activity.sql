-- Activité par personne : commandes terminées, délai moyen de traitement, tâches faites et ouvertes.
-- Réservé aux administrateurs, pour répartir le travail.
create or replace function public.team_activity(_days int default 30)
returns table (user_id uuid, orders_done bigint, avg_minutes numeric, tasks_done bigint, tasks_open bigint, tasks_late bigint)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare since timestamptz := now() - make_interval(days => greatest(1, least(_days, 365)));
  today date := (now() at time zone 'America/Toronto')::date;
begin
  if not public.has_any_role(auth.uid(), array['admin']::public.app_role[]) then
    raise exception 'Réservé aux administrateurs.' using errcode = '42501';
  end if;
  return query
  select m.user_id,
    (select count(*) from public.orders o where o.assigned_to = m.user_id and o.status = 'completed' and not coalesce(o.hidden, false) and o.updated_at >= since),
    (select round(avg(extract(epoch from (o.updated_at - o.assigned_at)) / 60)::numeric, 0) from public.orders o
      where o.assigned_to = m.user_id and o.status = 'completed' and not coalesce(o.hidden, false) and o.assigned_at is not null and o.updated_at >= since),
    (select count(*) from public.team_tasks t where t.assignee_id = m.user_id and t.status = 'done' and t.removed_at is null and t.done_at >= since),
    (select count(*) from public.team_tasks t where t.assignee_id = m.user_id and t.status <> 'done' and t.removed_at is null and not t.archived),
    (select count(*) from public.team_tasks t where t.assignee_id = m.user_id and t.status <> 'done' and t.removed_at is null and not t.archived and t.due_on < today)
  from (select distinct ur.user_id from public.user_roles ur) m;
end;
$$;
revoke all on function public.team_activity(int) from public, anon;
grant execute on function public.team_activity(int) to authenticated;
