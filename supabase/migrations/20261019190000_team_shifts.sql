-- Planning de garde : pour chaque membre, ses heures par jour de la semaine (heure de Montréal). Une plage peut
-- passer minuit (ex. 22 h – 6 h). Les administrateurs le remplissent ; toute l'équipe le voit.
-- « De garde maintenant » = dans ses heures et pas absent. Les alertes « commande à prendre » vont d'abord aux
-- personnes de garde (opérateurs et admins) ; s'il n'y en a aucune, à tous les opérateurs et admins comme avant.
-- Une plage retirée est désactivée (rien n'est effacé).

create table if not exists public.team_shifts (
  user_id uuid not null,
  dow smallint not null check (dow between 1 and 7),
  starts time not null,
  ends time not null,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (user_id, dow)
);
alter table public.team_shifts enable row level security;
revoke all on public.team_shifts from public, anon, authenticated;
grant select on public.team_shifts to authenticated;
create policy team_shifts_read on public.team_shifts for select to authenticated using (public.is_staff(auth.uid()));
alter publication supabase_realtime add table public.team_shifts;

-- Écrire (ou retirer avec _starts nul) la plage d'un membre pour un jour. Administrateurs seulement.
create or replace function public.team_shift_set(_user uuid, _dow int, _starts time, _ends time)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.team_require_staff();
  if not public.has_any_role(auth.uid(), array['admin']::public.app_role[]) then raise exception 'Seul un administrateur peut changer le planning.'; end if;
  if _dow < 1 or _dow > 7 then raise exception 'Jour inconnu.'; end if;
  if not public.is_staff(_user) then raise exception 'Cette personne ne fait pas partie de l''équipe.'; end if;
  if _starts is null then
    update public.team_shifts set active = false, updated_at = now(), updated_by = auth.uid() where user_id = _user and dow = _dow;
    return;
  end if;
  if _ends is null or _ends = _starts then raise exception 'L''heure de fin doit être différente de l''heure de début.'; end if;
  insert into public.team_shifts (user_id, dow, starts, ends, active, updated_at, updated_by)
  values (_user, _dow, _starts, _ends, true, now(), auth.uid())
  on conflict (user_id, dow) do update set starts = excluded.starts, ends = excluded.ends, active = true, updated_at = now(), updated_by = auth.uid();
end;
$$;
revoke all on function public.team_shift_set(uuid, int, time, time) from public, anon;
grant execute on function public.team_shift_set(uuid, int, time, time) to authenticated;

-- Qui est de garde en ce moment.
create or replace function public.team_on_call()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  with now_local as (
    select (now() at time zone 'America/Toronto') as ts
  ), c as (
    select extract(isodow from ts)::int as d, ts::time as t, ts::date as day from now_local
  )
  select distinct s.user_id
  from public.team_shifts s, c
  where s.active
    and exists (select 1 from public.user_roles r where r.user_id = s.user_id)
    and (
      (s.dow = c.d and ((s.starts < s.ends and c.t >= s.starts and c.t < s.ends) or (s.starts > s.ends and c.t >= s.starts)))
      or (s.dow = case when c.d = 1 then 7 else c.d - 1 end and s.starts > s.ends and c.t < s.ends)
    )
    and not exists (
      select 1 from public.team_profiles p
      where p.user_id = s.user_id and p.status = 'away' and (p.status_until is null or p.status_until >= c.day)
    );
$$;
revoke all on function public.team_on_call() from public, anon;
grant execute on function public.team_on_call() to authenticated;

-- Commandes à prendre : d'abord les personnes de garde.
create or replace function public.team_push_orders()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  o record;
  who uuid[];
begin
  select array_agg(distinct r.user_id) into who from public.user_roles r
  where r.role::text in ('admin', 'operator') and r.user_id in (select public.team_on_call());
  if who is null then
    select array_agg(distinct user_id) into who from public.user_roles where role::text in ('admin', 'operator');
  end if;
  for o in
    select id, side, cad_amount from public.orders
    where status = 'payment_received' and assigned_to is null and not coalesce(hidden, false)
      and updated_at < now() - interval '2 minutes' and updated_at > now() - interval '1 day'
      and not exists (select 1 from public.team_push_orders_sent s where s.order_id = orders.id)
    order by updated_at limit 20
  loop
    insert into public.team_push_orders_sent (order_id) values (o.id) on conflict do nothing;
    if who is not null then
      perform public.team_push(who, 'orders', 'Commande à prendre',
        case when o.side = 'buy' then 'Achat' else 'Vente' end || ' de ' || replace(to_char(o.cad_amount, 'FM999999990.00'), '.', ',') || ' $ · OOB-' || upper(left(o.id::text, 8)),
        '/admin?tab=queue');
    end if;
  end loop;
end;
$$;
