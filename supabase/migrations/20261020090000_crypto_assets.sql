-- Deux cryptomonnaies : USDT et USDC. Chaque commande, dépôt reçu, taux et relevé de stock
-- porte désormais son actif (USDT par défaut : rien ne change pour l'existant).
-- Les colonnes « usdt_amount » gardent leur nom : elles contiennent le montant de l'actif de la ligne.
--
-- Réglages › Cryptomonnaies : chaque actif s'ouvre ou se ferme (rien n'est supprimé).
-- L'USDC n'existe pas (émis par Circle) sur Tron ni sur BNB Chain : la base refuse ces paires.

do $$ begin
  create type public.crypto_asset as enum ('usdt', 'usdc');
exception when duplicate_object then null; end $$;

alter table public.orders add column if not exists asset public.crypto_asset not null default 'usdt';
alter table public.chain_deposits add column if not exists asset public.crypto_asset not null default 'usdt';
alter table public.exchange_rates add column if not exists asset public.crypto_asset not null default 'usdt';
alter table public.treasury_stock_snapshots add column if not exists asset public.crypto_asset not null default 'usdt';

create index if not exists exchange_rates_asset_fetched_idx on public.exchange_rates (asset, fetched_at desc);
create index if not exists orders_asset_idx on public.orders (asset);

-- Interrupteurs des actifs (lisibles par tous, comme les réseaux).
alter table public.app_settings add column if not exists assets jsonb not null default '{"usdt": true, "usdc": false}'::jsonb;
grant select (assets) on public.app_settings to anon, authenticated;

-- Curseurs de lecture de la blockchain, par réseau ET par actif (l'ancienne table reste celle de l'USDT).
create table if not exists public.chain_scan_cursors (
  network public.usdt_network not null,
  asset public.crypto_asset not null,
  cursor bigint not null,
  updated_at timestamptz not null default now(),
  primary key (network, asset)
);
alter table public.chain_scan_cursors enable row level security;
insert into public.chain_scan_cursors (network, asset, cursor, updated_at)
select network, 'usdt', cursor, updated_at from public.chain_scan_state
on conflict (network, asset) do nothing;

-- Réseaux sur lesquels un actif existe vraiment.
create or replace function public.asset_on_network(_asset public.crypto_asset, _network public.usdt_network)
returns boolean language sql immutable as $$
  select case when _asset = 'usdc' then _network in ('erc20', 'polygon', 'avalanche', 'spl') else true end
$$;

-- Une commande sur un actif fermé, ou sur un réseau où il n'existe pas, est refusée.
create or replace function public.reject_closed_asset()
returns trigger language plpgsql set search_path to 'public' as $$
declare is_open boolean;
begin
  if not public.asset_on_network(new.asset, new.network) then
    raise exception 'ASSET_NETWORK: % n''est pas disponible sur ce réseau. Choisissez-en un autre.', upper(new.asset::text)
      using errcode = 'P0001';
  end if;
  if public.is_trusted_writer() then return new; end if;
  select coalesce((s.assets ->> (new.asset::text))::boolean, false) into is_open from public.app_settings s where s.id = 1;
  if not coalesce(is_open, false) then
    raise exception 'ASSET_CLOSED: % n''est pas proposé pour le moment.', upper(new.asset::text) using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create or replace trigger orders_reject_closed_asset
  before insert on public.orders for each row execute function public.reject_closed_asset();

-- Mise à jour des fonctions existantes : chaque remplacement est vérifié (sinon la migration s'annule).
create or replace function pg_temp.patch(_fn regprocedure, _pairs text[]) returns void language plpgsql as $$
declare d text; i int;
begin
  d := pg_get_functiondef(_fn);
  for i in 1 .. array_length(_pairs, 1) by 2 loop
    if strpos(d, _pairs[i]) = 0 then
      raise exception 'Motif introuvable dans % : %', _fn, _pairs[i];
    end if;
    d := replace(d, _pairs[i], _pairs[i + 1]);
  end loop;
  execute d;
end;
$$;

-- Le taux de référence d'une commande est celui de son actif.
select pg_temp.patch('public.enforce_order_insert()', array[
  'from public.exchange_rates order by fetched_at desc limit 1',
  'from public.exchange_rates where asset = new.asset order by fetched_at desc limit 1'
]);

-- Rapprochement des ventes : même réseau ET même actif ; les messages nomment l'actif reçu.
select pg_temp.patch('public.match_sell_deposits()', array[
  'o.network = d.network', 'o.network = d.network and o.asset = d.asset',
  '''USDT reçus sur la blockchain : ''', 'upper(d.asset::text) || '' reçus sur la blockchain : ''',
  ''' USDT', ''' '' || upper(d.asset::text) || ''',
  'avant l''''arrivée des USDT''', 'avant l''''arrivée des fonds'''
]);

select pg_temp.patch('public.attach_chain_deposit(uuid, uuid)', array[
  'o.network <> d.network then raise exception ''Vente introuvable ou réseau différent.''',
  'o.network <> d.network or o.asset <> d.asset then raise exception ''Vente introuvable, ou réseau ou cryptomonnaie différents.''',
  '''USDT reçus (rattachés à la main) : '' || public.fr_money(d.usdt_amount) || '' USDT',
  'upper(d.asset::text) || '' reçus (rattachés à la main) : '' || public.fr_money(d.usdt_amount) || '' '' || upper(d.asset::text) || '''
]);

-- Trésorerie et comptabilité : elles restent sur l'USDT tant que leurs pages ne distinguent pas les actifs
-- (étape suivante de la migration) ; les lignes USDC ne s'y mélangent pas.
select pg_temp.patch('public.treasury_overview()', array[
  'from public.treasury_stock_snapshots order by network, taken_at desc',
  'from public.treasury_stock_snapshots where asset = ''usdt'' order by network, taken_at desc',
  'where side = ''buy'' and status in',
  'where side = ''buy'' and asset = ''usdt'' and status in',
  'where taken_at >= now() - interval ''30 days''',
  'where asset = ''usdt'' and taken_at >= now() - interval ''30 days'''
]);
select pg_temp.patch('public.admin_accounting_orders(timestamptz, timestamptz, integer, integer)', array[
  'where e.fetched_at <= o.created_at', 'where e.asset = o.asset and e.fetched_at <= o.created_at'
]);
select pg_temp.patch('public.admin_accounting_summary(timestamptz, timestamptz)', array[
  'where x.fetched_at <= o.created_at', 'where x.asset = o.asset and x.fetched_at <= o.created_at'
]);
select pg_temp.patch('public.admin_accounting_ledger(timestamptz, timestamptz, integer, integer, boolean)', array[
  'where e.fetched_at <= f.created_at', 'where e.asset = ''usdt'' and e.fetched_at <= f.created_at'
]);
select pg_temp.patch('public.accounting_pnl(timestamptz, timestamptz)', array[
  'from public.exchange_rates x where x.fetched_at <= ev.at', 'from public.exchange_rates x where x.asset = ''usdt'' and x.fetched_at <= ev.at'
]);
select pg_temp.patch('public.accounting_journal_lines(timestamptz)', array[
  'from public.exchange_rates x where x.fetched_at <= ev.t', 'from public.exchange_rates x where x.asset = ''usdt'' and x.fetched_at <= ev.t'
]);
