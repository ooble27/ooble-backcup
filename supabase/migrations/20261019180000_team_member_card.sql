-- Fiche d'un membre (visible par l'équipe) : depuis quand il est là, ses commandes en cours, ce qu'il a terminé
-- sur 30 jours, ses tâches. Rien sur les clients au-delà du prénom affiché dans la file.
create or replace function public.team_member_card(_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare since timestamptz := now() - interval '30 days';
begin
  perform public.team_require_staff();
  if not exists (select 1 from public.user_roles where user_id = _user) then return null; end if;
  return jsonb_build_object(
    'joined', (select min(created_at) from public.user_roles where user_id = _user),
    'orders_done', (select count(*) from public.orders where assigned_to = _user and status = 'completed' and not coalesce(hidden, false) and updated_at >= since),
    'tasks_done', (select count(*) from public.team_tasks where assignee_id = _user and status = 'done' and removed_at is null and done_at >= since),
    'orders_open', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'side', o.side, 'cad', o.cad_amount, 'status', o.status,
        'client', split_part(coalesce(nullif(btrim(p.full_name), ''), 'Client'), ' ', 1)) order by o.assigned_at)
      from public.orders o left join public.profiles p on p.id = o.user_id
      where o.assigned_to = _user and o.status in ('created', 'awaiting_payment', 'payment_received', 'settling') and not coalesce(o.hidden, false)), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.team_member_card(uuid) from public, anon;
grant execute on function public.team_member_card(uuid) to authenticated;
