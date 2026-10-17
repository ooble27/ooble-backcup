-- Solana est maintenant surveillé comme les autres réseaux (sell-watch lit les dépôts USDT SPL) :
-- le verrou « pas de USDT reçus sans dépôt rattaché » s'applique aussi à Solana.

create or replace function public.guard_sell_received()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if new.side = 'sell'
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
