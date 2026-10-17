-- Une vente ne passe à « USDT reçus » (ou plus loin) que si des USDT réels lui sont rattachés.
--
-- Avant : un clic sur « Marquer les USDT reçus » suffisait, même sans aucun dépôt reçu ; le client
-- recevait alors le courriel « USDT reçus » et la fiche affichait le virement Interac à envoyer.
-- Maintenant, la base refuse ce passage tant qu'aucun dépôt n'est rattaché (status « matched »)
-- à la vente. La surveillance automatique (match_sell_deposits) et le rattachement à la main
-- (attach_chain_deposit) rattachent le dépôt avant de changer le statut : ils ne sont pas gênés.
--
-- Solana (« spl ») n'est pas surveillé automatiquement : il garde son fonctionnement actuel
-- en attendant une solution dédiée.

create or replace function public.guard_sell_received()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if new.side = 'sell'
     and new.network::text <> 'spl'
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

create or replace trigger trg_guard_sell_received
  before update of status on public.orders
  for each row execute function public.guard_sell_received();
