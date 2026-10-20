-- Trésorerie par cryptomonnaie : stock, réservé, historique et seuil d'alerte par réseau ET par actif.
-- Les anciennes fonctions (USDT seul) restent en place pour les versions de l'app déjà ouvertes.

-- L'équipe lit les curseurs de lecture de la blockchain (Règlement auto, Santé), comme l'ancienne table.
create policy "Staff voit les curseurs de lecture" on public.chain_scan_cursors
  for select to authenticated using (public.is_staff(auth.uid()));
grant select on public.chain_scan_cursors to authenticated;

-- Seuils de stock bas, par réseau et par actif (l'USDT reprend les seuils déjà réglés).
create table if not exists public.treasury_asset_alerts (
  network public.usdt_network not null,
  asset public.crypto_asset not null,
  threshold numeric not null default 0 check (threshold >= 0),
  alert_enabled boolean not null default false,
  last_alert_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (network, asset)
);
alter table public.treasury_asset_alerts enable row level security;
insert into public.treasury_asset_alerts (network, asset, threshold, alert_enabled, last_alert_at)
select network, 'usdt', low_balance_threshold_usdt, alert_enabled, last_alert_at from public.treasury_alert_config
on conflict (network, asset) do nothing;

-- Une ligne par réseau et par actif qui y existe.
create or replace function public.treasury_overview_assets()
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare res jsonb;
begin
  if not public.has_any_role(auth.uid(), array['admin', 'accounting', 'operator']::public.app_role[]) then
    raise exception 'Accès réservé à l''équipe.' using errcode = '42501';
  end if;
  with pairs as (
    select n as network, a as asset
    from unnest(enum_range(null::public.usdt_network)) n, unnest(enum_range(null::public.crypto_asset)) a
    where public.asset_on_network(a, n)
  ),
  last as (
    select distinct on (network, asset) network, asset, address, usdt, gas, gas_symbol, min_gas, taken_at
    from public.treasury_stock_snapshots order by network, asset, taken_at desc
  ),
  reserved as (
    select network, asset, sum(usdt_amount) as amount, count(*) as n from public.orders
    where side = 'buy' and status in ('created', 'awaiting_payment', 'payment_received', 'settling')
      and not is_test and not hidden
    group by network, asset
  ),
  hist as (
    select network, asset, jsonb_agg(jsonb_build_object('day', day, 'usdt', amount) order by day) as points from (
      select distinct on (network, asset, date_trunc('day', taken_at at time zone 'America/Toronto'))
        network, asset, to_char(date_trunc('day', taken_at at time zone 'America/Toronto'), 'YYYY-MM-DD') as day, usdt as amount
      from public.treasury_stock_snapshots
      where taken_at >= now() - interval '30 days'
      order by network, asset, date_trunc('day', taken_at at time zone 'America/Toronto'), taken_at desc
    ) d group by network, asset
  )
  select jsonb_agg(jsonb_build_object(
    'network', p.network::text, 'asset', p.asset::text,
    'address', l.address, 'usdt', l.usdt, 'gas', l.gas, 'gas_symbol', l.gas_symbol, 'min_gas', l.min_gas, 'taken_at', l.taken_at,
    'reserved', coalesce(r.amount, 0), 'reserved_n', coalesce(r.n, 0),
    'available', case when l.usdt is null then null else l.usdt - coalesce(r.amount, 0) end,
    'threshold', coalesce(c.threshold, 0), 'alert_enabled', coalesce(c.alert_enabled, false), 'last_alert_at', c.last_alert_at,
    'history', coalesce(h.points, '[]'::jsonb)
  ) order by p.asset, p.network) into res
  from pairs p
  left join last l on l.network = p.network and l.asset = p.asset
  left join reserved r on r.network = p.network and r.asset = p.asset
  left join public.treasury_asset_alerts c on c.network = p.network and c.asset = p.asset
  left join hist h on h.network = p.network and h.asset = p.asset;
  return coalesce(res, '[]'::jsonb);
end;
$$;
revoke all on function public.treasury_overview_assets() from public, anon;
grant execute on function public.treasury_overview_assets() to authenticated;

-- Seuil d'un réseau pour un actif (l'USDT garde aussi l'ancienne table à jour).
create or replace function public.treasury_set_threshold(_network public.usdt_network, _asset public.crypto_asset, _threshold numeric, _enabled boolean)
returns void language plpgsql security definer set search_path to '' as $$
begin
  if not public.has_any_role(auth.uid(), array['admin', 'accounting']::public.app_role[]) then
    raise exception 'Accès réservé à l''équipe.' using errcode = '42501';
  end if;
  if _threshold is null or _threshold < 0 then raise exception 'Seuil invalide.'; end if;
  if not public.asset_on_network(_asset, _network) then raise exception 'Cette cryptomonnaie n''existe pas sur ce réseau.'; end if;
  insert into public.treasury_asset_alerts (network, asset, threshold, alert_enabled, updated_at)
  values (_network, _asset, _threshold, coalesce(_enabled, true), now())
  on conflict (network, asset) do update set threshold = excluded.threshold, alert_enabled = excluded.alert_enabled,
    last_alert_at = null, updated_at = now();
  if _asset = 'usdt' then
    insert into public.treasury_alert_config (network, low_balance_threshold_usdt, alert_enabled)
    values (_network, _threshold, coalesce(_enabled, true))
    on conflict (network) do update set low_balance_threshold_usdt = excluded.low_balance_threshold_usdt,
      alert_enabled = excluded.alert_enabled, last_alert_at = null;
  end if;
end;
$$;
revoke all on function public.treasury_set_threshold(public.usdt_network, public.crypto_asset, numeric, boolean) from public, anon;
grant execute on function public.treasury_set_threshold(public.usdt_network, public.crypto_asset, numeric, boolean) to authenticated;
