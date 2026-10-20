-- Correctif : depuis que les marges et le taux de secours sont cachés aux clients (20261018170000),
-- la vérification d'une nouvelle commande, qui lisait tous les réglages (select *), échouait pour un client
-- (« permission denied for table app_settings »). Elle ne lit plus que les réglages publics dont elle a besoin.
-- Elle reste exécutée avec les droits de l'appelant : c'est ce qui distingue un client d'une écriture du serveur.
alter function public.enforce_order_insert() security invoker;

do $$
declare d text;
begin
  d := pg_get_functiondef('public.enforce_order_insert()'::regprocedure);
  if strpos(d, 'select * into s from public.app_settings where id = 1;') = 0 then
    raise exception 'Motif introuvable dans enforce_order_insert';
  end if;
  d := replace(d, 'select * into s from public.app_settings where id = 1;',
    'select a.trading_enabled, a.rate_lock_minutes, a.trade_min_cad, a.trade_daily_max_cad into s from public.app_settings a where a.id = 1;');
  execute d;
end $$;
