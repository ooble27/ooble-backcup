-- Plan comptable et messages de la base en USDC (seule cryptomonnaie proposée).
-- Les montants, les écritures et les codes des comptes ne changent pas : seuls les noms affichés.
update public.ledger_accounts set name = case code
  when '1100' then 'Stock d''USDC (au coût)'
  when '4000' then 'Ventes d''USDC'
  when '5000' then 'Coût des USDC vendus' end
where code in ('1100', '4000', '5000') and name ~ 'USDT';

-- Textes des alertes, de l'historique des commandes et des messages d'erreur : « USDT » devient « USDC ».
-- Seuls les textes contiennent « USDT » en majuscules ; les noms de colonnes et de tables sont en minuscules.
do $$
declare f record;
begin
  for f in select p.oid from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
    and p.proname in ('compliance_scan', 'match_sell_deposits', 'guard_order_claim', 'cancel_unsent_sell',
                      'compliance_sanctions_screen', 'declare_sell_sent', 'guard_sell_received')
    and pg_get_functiondef(p.oid) ~ 'USDT'
  loop
    execute regexp_replace(pg_get_functiondef(f.oid), '\mUSDT\M', 'USDC', 'g');
  end loop;
end $$;
