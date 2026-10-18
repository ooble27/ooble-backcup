-- Trésorerie : le stock d'USDT par réseau, relevé toutes les 5 minutes sur la blockchain
-- (usdt-payout › snapshot), le montant réservé par les achats ouverts et une alerte de stock bas.
-- Lecture seule : le stock n'empêche jamais un client de commander.

create table if not exists public.treasury_stock_snapshots (
  id uuid primary key default gen_random_uuid(),
  network public.usdt_network not null,
  address text,
  usdt numeric(20, 6) not null,
  gas numeric(30, 9),
  gas_symbol text,
  min_gas numeric(30, 9),
  taken_at timestamptz not null default now()
);
create index if not exists treasury_stock_snapshots_net_idx on public.treasury_stock_snapshots (network, taken_at desc);
alter table public.treasury_stock_snapshots enable row level security;
create policy "Équipe finance lit le stock" on public.treasury_stock_snapshots for select
  using (public.has_any_role(auth.uid(), array['admin', 'accounting', 'operator']::public.app_role[]));

-- Dernière alerte envoyée, pour ne pas répéter l'alerte toutes les 5 minutes.
alter table public.treasury_alert_config add column if not exists last_alert_at timestamptz;

-- Vue d'ensemble : par réseau, le dernier relevé, le réservé, le disponible et le seuil ;
-- plus l'historique d'un relevé par jour sur 30 jours.
create or replace function public.treasury_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare res jsonb;
begin
  if not public.has_any_role(auth.uid(), array['admin', 'accounting', 'operator']::public.app_role[]) then
    raise exception 'Accès réservé à l''équipe.' using errcode = '42501';
  end if;
  with nets as (select unnest(enum_range(null::public.usdt_network)) as network),
  last as (
    select distinct on (network) network, address, usdt, gas, gas_symbol, min_gas, taken_at
    from public.treasury_stock_snapshots order by network, taken_at desc
  ),
  reserved as (
    select network, sum(usdt_amount) as usdt, count(*) as n from public.orders
    where side = 'buy' and status in ('created', 'awaiting_payment', 'payment_received', 'settling')
      and not is_test and not hidden
    group by network
  ),
  hist as (
    select network, jsonb_agg(jsonb_build_object('day', day, 'usdt', usdt) order by day) as points from (
      select distinct on (network, date_trunc('day', taken_at at time zone 'America/Toronto'))
        network, to_char(date_trunc('day', taken_at at time zone 'America/Toronto'), 'YYYY-MM-DD') as day, usdt
      from public.treasury_stock_snapshots
      where taken_at >= now() - interval '30 days'
      order by network, date_trunc('day', taken_at at time zone 'America/Toronto'), taken_at desc
    ) d group by network
  )
  select jsonb_agg(jsonb_build_object(
    'network', n.network::text,
    'address', l.address, 'usdt', l.usdt, 'gas', l.gas, 'gas_symbol', l.gas_symbol, 'min_gas', l.min_gas, 'taken_at', l.taken_at,
    'reserved', coalesce(r.usdt, 0), 'reserved_n', coalesce(r.n, 0),
    'available', case when l.usdt is null then null else l.usdt - coalesce(r.usdt, 0) end,
    'threshold', c.low_balance_threshold_usdt, 'alert_enabled', coalesce(c.alert_enabled, false), 'last_alert_at', c.last_alert_at,
    'history', coalesce(h.points, '[]'::jsonb)
  ) order by n.network) into res
  from nets n
  left join last l on l.network = n.network
  left join reserved r on r.network = n.network
  left join public.treasury_alert_config c on c.network = n.network
  left join hist h on h.network = n.network;
  return coalesce(res, '[]'::jsonb);
end;
$$;
revoke execute on function public.treasury_overview() from public, anon;
grant execute on function public.treasury_overview() to authenticated;

-- Seuil d'alerte d'un réseau (administrateurs et comptabilité).
create or replace function public.treasury_set_threshold(_network public.usdt_network, _threshold numeric, _enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_any_role(auth.uid(), array['admin', 'accounting']::public.app_role[]) then
    raise exception 'Accès réservé à l''équipe.' using errcode = '42501';
  end if;
  if _threshold is null or _threshold < 0 then raise exception 'Seuil invalide.'; end if;
  insert into public.treasury_alert_config (network, low_balance_threshold_usdt, alert_enabled)
  values (_network, _threshold, coalesce(_enabled, true))
  on conflict (network) do update set low_balance_threshold_usdt = excluded.low_balance_threshold_usdt,
    alert_enabled = excluded.alert_enabled, last_alert_at = null;
end;
$$;
revoke execute on function public.treasury_set_threshold(public.usdt_network, numeric, boolean) from public, anon;
grant execute on function public.treasury_set_threshold(public.usdt_network, numeric, boolean) to authenticated;

-- Relevé toutes les 5 minutes (la fonction ignore un relevé trop rapproché du précédent).
select cron.schedule('treasury-snapshot', '*/5 * * * *', $cron$
  select net.http_post(
    url := 'https://uukxacjjviiktmbikdwp.supabase.co/functions/v1/usdt-payout',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{"action":"snapshot"}'::jsonb
  );
$cron$);
