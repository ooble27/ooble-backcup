-- Comptabilité réelle : marge = écart entre le taux appliqué et le taux du marché au moment de la commande.
-- Taux du marché = milieu entre le prix d'achat et le prix de vente relevés (exchange_rates).
create index if not exists exchange_rates_fetched_idx on public.exchange_rates (fetched_at desc);

create or replace function public.admin_accounting_summary(_from timestamptz, _to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare res jsonb;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Accès réservé à l''équipe.' using errcode = '42501';
  end if;
  with o as (
    select o.id, o.side, o.network, o.cad_amount::numeric cad, o.usdt_amount::numeric usdt, coalesce(o.fee_cad, 0)::numeric fee, o.created_at, r.mid,
      case when r.mid is null then null
           when o.side = 'buy' then o.cad_amount - o.usdt_amount * r.mid
           else o.usdt_amount * r.mid - o.cad_amount end as margin
    from public.orders o
    left join lateral (
      select (x.buy_rate + x.sell_rate) / 2 as mid from public.exchange_rates x
      where x.fetched_at <= o.created_at order by x.fetched_at desc limit 1
    ) r on true
    where o.status = 'completed' and o.created_at >= _from and o.created_at < _to
  )
  select jsonb_build_object(
    'totals', (select jsonb_build_object(
        'n', count(*), 'n_buy', count(*) filter (where side = 'buy'), 'n_sell', count(*) filter (where side = 'sell'),
        'volume', coalesce(sum(cad), 0), 'vol_buy', coalesce(sum(cad) filter (where side = 'buy'), 0), 'vol_sell', coalesce(sum(cad) filter (where side = 'sell'), 0),
        'usdt', coalesce(sum(usdt), 0), 'margin', coalesce(sum(margin), 0), 'fees', coalesce(sum(fee), 0), 'unpriced', count(*) filter (where mid is null)) from o),
    'months', coalesce((select jsonb_agg(m order by m->>'month' desc) from (
        select jsonb_build_object('month', to_char(date_trunc('month', created_at at time zone 'America/Toronto'), 'YYYY-MM'),
          'n', count(*), 'n_buy', count(*) filter (where side = 'buy'), 'n_sell', count(*) filter (where side = 'sell'),
          'vol_buy', coalesce(sum(cad) filter (where side = 'buy'), 0), 'vol_sell', coalesce(sum(cad) filter (where side = 'sell'), 0),
          'usdt', coalesce(sum(usdt), 0), 'margin', coalesce(sum(margin), 0), 'fees', coalesce(sum(fee), 0)) m
        from o group by date_trunc('month', created_at at time zone 'America/Toronto')) q), '[]'::jsonb),
    'networks', coalesce((select jsonb_agg(n order by (n->>'volume')::numeric desc) from (
        select jsonb_build_object('network', network::text, 'n', count(*), 'usdt', coalesce(sum(usdt), 0), 'volume', coalesce(sum(cad), 0), 'margin', coalesce(sum(margin), 0)) n
        from o group by network) q), '[]'::jsonb)
  ) into res;
  return res;
end;
$$;

create or replace function public.admin_accounting_orders(_from timestamptz, _to timestamptz, _limit int default 20, _offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare res jsonb;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Accès réservé à l''équipe.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'total', (select count(*) from public.orders where status = 'completed' and created_at >= _from and created_at < _to),
    'rows', coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb))
  into res
  from (
    select jsonb_build_object('id', o.id, 'side', o.side, 'network', o.network::text, 'cad', o.cad_amount, 'usdt', o.usdt_amount,
      'rate', o.locked_rate, 'mid', r.mid, 'fee', coalesce(o.fee_cad, 0), 'created_at', o.created_at,
      'client', coalesce(nullif(p.business_name, ''), nullif(p.full_name, ''), p.email),
      'margin', case when r.mid is null then null when o.side = 'buy' then o.cad_amount - o.usdt_amount * r.mid else o.usdt_amount * r.mid - o.cad_amount end) x
    from public.orders o
    left join public.profiles p on p.id = o.user_id
    left join lateral (
      select (e.buy_rate + e.sell_rate) / 2 as mid from public.exchange_rates e
      where e.fetched_at <= o.created_at order by e.fetched_at desc limit 1
    ) r on true
    where o.status = 'completed' and o.created_at >= _from and o.created_at < _to
    order by o.created_at desc
    limit greatest(1, least(_limit, 5000)) offset greatest(0, _offset)
  ) q;
  return res;
end;
$$;

grant execute on function public.admin_accounting_summary(timestamptz, timestamptz) to authenticated;
grant execute on function public.admin_accounting_orders(timestamptz, timestamptz, int, int) to authenticated;
