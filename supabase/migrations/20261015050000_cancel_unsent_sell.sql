-- Ventes : le client peut annuler une vente qu'il n'a pas encore envoyée.
-- La vente est maintenant créée avant l'envoi (l'adresse de dépôt s'affiche ensuite) : si le client
-- change d'avis, il l'annule et sa limite du jour est libérée. Impossible une fois l'envoi confirmé
-- ou des USDT reçus.

create or replace function public.cancel_unsent_sell(_order uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = _order for update;
  if o.id is null or o.user_id is distinct from auth.uid() or o.side <> 'sell' then
    raise exception 'Vente introuvable.' using errcode = '42501';
  end if;
  if o.status <> 'created' or o.client_sent_at is not null
     or exists (select 1 from public.chain_deposits d where d.order_id = o.id) then
    raise exception 'Cette vente ne peut plus être annulée : écrivez-nous.' using errcode = '22023';
  end if;
  update public.orders set status = 'cancelled' where id = o.id;
  insert into public.order_events (order_id, previous_status, new_status, actor, note)
  values (o.id, 'created', 'cancelled', auth.uid()::text, 'Annulée par le client avant l''envoi des USDT.');
end;
$$;
revoke execute on function public.cancel_unsent_sell(uuid) from public, anon;
grant execute on function public.cancel_unsent_sell(uuid) to authenticated;
