-- Commandes d'un compte de test : des essais « à blanc ».
--  - is_test est posé à la création, d'après le compte (jamais par l'app) ;
--  - aucun vrai envoi d'USDT (usdt-payout refuse), l'équipe les termine avec « Terminer l'essai » ;
--  - une vente d'essai peut passer à « USDT reçus » sans dépôt réel ;
--  - elles restent hors de la comptabilité et des registres de conformité (aucun argent réel).

alter table public.orders add column if not exists is_test boolean not null default false;

create or replace function public.order_test_flag()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  new.is_test := coalesce((select p.test_account from public.profiles p where p.id = new.user_id), false);
  return new;
end;
$function$;
revoke execute on function public.order_test_flag() from public, anon, authenticated;
create or replace trigger trg_order_test_flag
  before insert on public.orders
  for each row execute function public.order_test_flag();

-- Commandes déjà passées par un compte de test : ce sont aussi des essais.
update public.orders set is_test = true
 where user_id in (select id from public.profiles where test_account) and not is_test;

-- Une fois créée, une commande garde son statut d'essai (ni l'app ni l'équipe ne le changent).
create or replace function public.order_test_keep()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  new.is_test := old.is_test;
  return new;
end;
$function$;
create or replace trigger trg_order_test_keep
  before update on public.orders
  for each row when (new.is_test is distinct from old.is_test)
  execute function public.order_test_keep();

-- Vente : pas de « USDT reçus » sans dépôt rattaché, sauf pour un essai.
create or replace function public.guard_sell_received()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if new.side = 'sell'
     and not new.is_test
     and new.status in ('payment_received', 'settling', 'completed')
     and old.status in ('created', 'awaiting_payment', 'expired', 'cancelled')
     and not exists (select 1 from public.chain_deposits d where d.order_id = new.id and d.status = 'matched')
  then
    raise exception 'Aucun USDT reçu n''est rattaché à cette vente : elle ne peut pas passer à « USDT reçus ». Elle y passe seule à l''arrivée des USDT, ou rattachez le dépôt depuis Règlement auto.'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;
revoke execute on function public.guard_sell_received() from public, anon, authenticated;

-- Comptabilité et registres : les essais n'y entrent pas.
do $$
declare
  f record;
  def text;
begin
  for f in
    select p.oid from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('admin_accounting_ledger', 'admin_accounting_orders', 'admin_accounting_summary',
                         'compliance_ops', 'compliance_register', 'compliance_register_client', 'compliance_register_stats')
  loop
    def := pg_get_functiondef(f.oid);
    if position('not is_test' in def) > 0 then continue; end if;
    def := replace(def, 'from public.orders o', 'from (select * from public.orders where not is_test) o');
    def := replace(def, 'from public.orders where ', 'from public.orders where not is_test and ');
    execute def;
  end loop;
end $$;
