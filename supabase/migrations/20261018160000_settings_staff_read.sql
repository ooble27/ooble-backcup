-- Marges, cours figé et noms de l'équipe : lisibles par l'équipe seulement.
-- Étape 1 : deux lectures réservées à l'équipe (l'app les utilise). Étape 2 (migration suivante) :
-- les visiteurs et les clients ne lisent plus ces colonnes.

create or replace function public.app_settings_staff()
returns table (buy_margin_pct numeric, sell_margin_pct numeric, manual_market_rate numeric, updated_by_name text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select s.buy_margin_pct, s.sell_margin_pct, s.manual_market_rate, s.updated_by_name
  from public.app_settings s
  where s.id = 1 and exists (select 1 from public.user_roles r where r.user_id = auth.uid());
$$;
revoke all on function public.app_settings_staff() from public, anon;
grant execute on function public.app_settings_staff() to authenticated;

create or replace function public.deposit_address_book()
returns setof public.deposit_addresses
language sql
stable
security definer
set search_path to 'public'
as $$
  select d.* from public.deposit_addresses d
  where exists (select 1 from public.user_roles r where r.user_id = auth.uid())
  order by d.added_at desc;
$$;
revoke all on function public.deposit_address_book() from public, anon;
grant execute on function public.deposit_address_book() to authenticated;
