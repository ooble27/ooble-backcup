-- Scalabilité (docs/AUDIT-SCALABILITE.md) : index pour les listes et filtres du back-office,
-- et calculs du tableau de bord faits par la base (sommes et comptes) au lieu de télécharger
-- les commandes de la période.

create index if not exists orders_status_created_idx on public.orders (status, created_at desc);
create index if not exists orders_created_idx on public.orders (created_at desc);
create index if not exists profiles_created_idx on public.profiles (created_at desc);
create index if not exists profiles_kyc_status_idx on public.profiles (kyc_status);
create index if not exists kyc_verifications_user_idx on public.kyc_verifications (user_id, created_at desc);
create index if not exists kyc_verifications_status_idx on public.kyc_verifications (status, created_at desc);
create index if not exists interac_receipts_order_idx on public.interac_receipts (order_id);
create index if not exists usdt_payouts_order_idx on public.usdt_payouts (order_id, created_at desc);

-- Totaux par sens (achat, vente) sur la période en cours [_split, maintenant] et la précédente [_since, _split).
create or replace function public.admin_order_totals(_since timestamptz, _split timestamptz, _statuses text[])
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Réservé à l''équipe.' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'current', x.cur, 'side', x.side, 'n', x.n, 'cad', x.cad, 'usdt', x.usdt)), '[]'::jsonb)
    from (
      select (o.created_at >= _split) as cur, o.side::text as side, count(*) as n,
             coalesce(sum(o.cad_amount), 0) as cad, coalesce(sum(o.usdt_amount), 0) as usdt
        from public.orders o
       where o.created_at >= _since and o.status::text = any(_statuses)
       group by 1, 2
    ) x
  );
end;
$function$;

-- Volume par jour (UTC) et par sens depuis _since.
create or replace function public.admin_order_daily(_since timestamptz, _statuses text[])
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Réservé à l''équipe.' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object('day', x.day, 'side', x.side, 'cad', x.cad)), '[]'::jsonb)
    from (
      select to_char(o.created_at at time zone 'UTC', 'YYYY-MM-DD') as day, o.side::text as side,
             coalesce(sum(o.cad_amount), 0) as cad
        from public.orders o
       where o.created_at >= _since and o.status::text = any(_statuses)
       group by 1, 2
    ) x
  );
end;
$function$;

-- Entonnoir clients : clients ayant commandé au moins une fois, au moins deux fois, actifs depuis _active_since.
create or replace function public.admin_customer_funnel(_active_since timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Réservé à l''équipe.' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'first_order', count(*) filter (where n >= 1),
      'repeat', count(*) filter (where n >= 2),
      'active', (select count(distinct o2.user_id) from public.orders o2 where o2.created_at >= _active_since)
    )
    from (select o.user_id, count(*) as n from public.orders o group by o.user_id) u
  );
end;
$function$;

revoke all on function public.admin_order_totals(timestamptz, timestamptz, text[]) from public, anon;
revoke all on function public.admin_order_daily(timestamptz, text[]) from public, anon;
revoke all on function public.admin_customer_funnel(timestamptz) from public, anon;
grant execute on function public.admin_order_totals(timestamptz, timestamptz, text[]) to authenticated;
grant execute on function public.admin_order_daily(timestamptz, text[]) to authenticated;
grant execute on function public.admin_customer_funnel(timestamptz) to authenticated;
