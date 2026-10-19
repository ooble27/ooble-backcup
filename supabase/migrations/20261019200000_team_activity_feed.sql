-- Activité de l'équipe : un fil de ce que fait chacun (commandes prises et terminées, tâches créées et faites,
-- passations, demandes d'approbation), le plus récent d'abord. Lecture seule, pour toute l'équipe.
create or replace function public.team_activity_feed(_before timestamptz default null, _limit int default 60)
returns table (at timestamptz, actor_id uuid, actor_name text, kind text, text text, ref_kind text, ref_id uuid)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
#variable_conflict use_column
declare lim int := greatest(1, least(coalesce(_limit, 60), 200)); b timestamptz := coalesce(_before, now() + interval '1 minute');
  since timestamptz := coalesce(_before, now()) - interval '30 days';
begin
  perform public.team_require_staff();
  return query
  select * from (
    -- Commandes prises en charge (encore ouvertes ou finies)
    select o.assigned_at, o.assigned_to, coalesce(nullif(btrim(p.full_name), ''), 'Un membre'), 'order_take',
      'a pris ' || case when o.side = 'buy' then 'l''achat' else 'la vente' end || ' OOB-' || upper(left(o.id::text, 8)), 'order', o.id
    from public.orders o left join public.profiles p on p.id = o.assigned_to
    where o.assigned_to is not null and o.assigned_at is not null and o.assigned_at < b and o.assigned_at >= since and not coalesce(o.hidden, false)
    union all
    -- Commandes terminées (par un membre ou par le système)
    select o.updated_at, o.assigned_to, coalesce(nullif(btrim(p.full_name), ''), 'Système'), 'order_done',
      'a terminé ' || case when o.side = 'buy' then 'l''achat' else 'la vente' end || ' OOB-' || upper(left(o.id::text, 8)) || ' · ' || replace(to_char(o.cad_amount, 'FM999999990.00'), '.', ',') || ' $', 'order', o.id
    from public.orders o left join public.profiles p on p.id = o.assigned_to
    where o.status = 'completed' and o.updated_at < b and o.updated_at >= since and not coalesce(o.hidden, false)
    union all
    -- Tâches créées
    select t.created_at, t.created_by, t.created_by_name, 'task_new', 'a créé la tâche « ' || left(t.title, 80) || ' »', 'task', t.id
    from public.team_tasks t where t.removed_at is null and t.created_at < b and t.created_at >= since
    union all
    -- Tâches faites
    select t.done_at, t.assignee_id, coalesce(t.done_by_name, 'Un membre'), 'task_done', 'a terminé la tâche « ' || left(t.title, 80) || ' »', 'task', t.id
    from public.team_tasks t where t.removed_at is null and t.status = 'done' and t.done_at is not null and t.done_at < b and t.done_at >= since
    union all
    -- Passations
    select h.created_at, h.author_id, h.author_name, 'handoff',
      'a transmis sa passation' || case when h.to_name is not null then ' à ' || split_part(h.to_name, ' ', 1) else ' à l''équipe' end
        || case when cardinality(h.order_ids) + cardinality(h.task_ids) > 0 then ' (' || (cardinality(h.order_ids) + cardinality(h.task_ids)) || ' à reprendre)' else '' end, 'handoff', h.id
    from public.team_handoffs h where h.created_at < b and h.created_at >= since
    union all
    -- Demandes d'approbation et décisions
    select a.created_at, a.requested_by, a.requested_by_name, 'approval_ask', 'a demandé une approbation : « ' || left(a.title, 80) || ' »', 'approval', a.id
    from public.team_approvals a where a.created_at < b and a.created_at >= since
    union all
    select a.decided_at, a.decided_by, coalesce(a.decided_by_name, 'Un membre'), 'approval_' || a.status,
      case a.status when 'approved' then 'a approuvé' when 'refused' then 'a refusé' else 'a retiré' end || ' « ' || left(a.title, 80) || ' »', 'approval', a.id
    from public.team_approvals a where a.decided_at is not null and a.decided_at < b and a.decided_at >= since
  ) f(at, actor_id, actor_name, kind, text, ref_kind, ref_id)
  order by at desc
  limit lim;
end;
$$;
revoke all on function public.team_activity_feed(timestamptz, int) from public, anon;
grant execute on function public.team_activity_feed(timestamptz, int) to authenticated;
