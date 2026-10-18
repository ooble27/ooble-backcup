-- Étape 2 : les visiteurs et les clients ne lisent plus les marges, le cours figé ni les noms de
-- l'équipe. L'équipe les lit par app_settings_staff() et deposit_address_book().

revoke select on public.app_settings from anon, authenticated;
grant select (id, trading_enabled, verification_enabled, otc_enabled, trade_min_cad, trade_daily_max_cad, updated_at,
  networks, signups_individual, signups_business, rate_lock_minutes, sell_expiry_hours, buy_expiry_minutes,
  support_email, interac_email, otc_email) on public.app_settings to anon, authenticated;

revoke select on public.deposit_addresses from anon, authenticated;
grant select (id, family, address, active, added_at, retired_at) on public.deposit_addresses to anon, authenticated;
