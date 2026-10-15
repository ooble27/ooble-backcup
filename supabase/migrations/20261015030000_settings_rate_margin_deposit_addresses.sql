-- Réglages › Taux et marge : la marge d'Ooble au-dessus (achat) et en dessous (vente) du cours du marché.
alter table public.app_settings
  add column if not exists buy_margin_pct numeric not null default 2 check (buy_margin_pct >= 0 and buy_margin_pct <= 10),
  add column if not exists sell_margin_pct numeric not null default 2 check (sell_margin_pct >= 0 and sell_margin_pct <= 10);
-- Le cours du marché (CoinGecko) est gardé avec chaque taux publié : on voit ce que la marge rapporte.
alter table public.exchange_rates add column if not exists market_rate numeric;

-- Réglages › Adresses de dépôt : où les clients envoient leurs USDT quand ils vendent.
-- Une adresse active par famille de réseaux. Une adresse remplacée reste surveillée 7 jours
-- (les ventes en cours y arrivent encore) ; rien ne s'efface.
create table if not exists public.deposit_addresses (
  id bigserial primary key,
  family text not null check (family in ('evm', 'tron', 'solana')),
  address text not null,
  active boolean not null default true,
  added_at timestamptz not null default now(),
  added_by uuid,
  added_by_name text,
  retired_at timestamptz
);
create unique index if not exists deposit_addresses_one_active on public.deposit_addresses (family) where active;
alter table public.deposit_addresses enable row level security;
create policy deposit_addresses_read on public.deposit_addresses for select using (true);
grant select on public.deposit_addresses to anon, authenticated;

insert into public.deposit_addresses (family, address, active, added_by_name)
select * from (values
  ('evm', '0x0aC6f6202Ebff35D36A2Dca04C4f556FF95Fc093', true, 'Configuration initiale'),
  ('tron', 'TPf6rXmbeRzueBB7SM19vQ4wDz2fcrEtAs', true, 'Configuration initiale'),
  ('solana', 'BKLnZeaEccUbBSR2WjBQ1j9arjBy82m9fZXRoH3w3M2i', true, 'Configuration initiale')) v(f, a, act, n)
where not exists (select 1 from public.deposit_addresses);
-- Ancienne adresse Tron (Binance) : encore surveillée 7 jours, puis plus.
insert into public.deposit_addresses (family, address, active, added_by_name, retired_at)
select 'tron', 'TSPUk2W5bcGGNPpKzx1xTDc2NuxpRJRCBb', false, 'Configuration initiale', now()
where not exists (select 1 from public.deposit_addresses where address = 'TSPUk2W5bcGGNPpKzx1xTDc2NuxpRJRCBb');

-- Changer l'adresse d'une famille (administrateurs) : l'ancienne passe en « remplacée », la nouvelle devient active.
create or replace function public.set_deposit_address(_family text, _address text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  a text := trim(_address);
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Réservé aux administrateurs.' using errcode = '42501';
  end if;
  if (_family = 'evm' and a !~ '^0x[0-9a-fA-F]{40}$')
     or (_family = 'tron' and a !~ '^T[1-9A-HJ-NP-Za-km-z]{33}$')
     or (_family = 'solana' and a !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$')
     or _family not in ('evm', 'tron', 'solana') then
    raise exception 'Adresse invalide pour ce réseau.' using errcode = '22023';
  end if;
  if exists (select 1 from public.deposit_addresses where family = _family and active and address = a) then
    return;
  end if;
  update public.deposit_addresses set active = false, retired_at = now() where family = _family and active;
  insert into public.deposit_addresses (family, address, active, added_by, added_by_name)
  values (_family, a, true, auth.uid(), (select coalesce(nullif(trim(p.full_name), ''), p.email) from public.profiles p where p.id = auth.uid()));
end;
$function$;
revoke execute on function public.set_deposit_address(text, text) from anon, public;
grant execute on function public.set_deposit_address(text, text) to authenticated;
