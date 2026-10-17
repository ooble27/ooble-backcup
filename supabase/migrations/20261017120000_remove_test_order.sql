-- « Supprimer l'essai » : une commande d'un compte de test disparaît des listes (équipe et client).
-- Elle n'est pas effacée de la base (les commandes ne s'effacent pas) : elle est retirée et annulée,
-- et le parrainage qu'elle avait déclenché est remis à zéro, pour pouvoir refaire l'essai.

alter table public.orders add column if not exists hidden boolean not null default false;

-- Le client ne voit plus une commande retirée.
alter policy "Voir ses ordres" on public.orders using (auth.uid() = user_id and not hidden);

create or replace function public.remove_test_order(_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Réservé aux admins.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.orders where id = _id and is_test) then
    raise exception 'Seule une commande d''essai (compte de test) peut être retirée.' using errcode = '42501';
  end if;
  update public.referrals set referred_order_id = null, qualified_at = null where referred_order_id = _id;
  update public.referrals set sponsor_order_id = null where sponsor_order_id = _id;
  update public.orders set hidden = true,
         status = case when status in ('cancelled', 'expired') then status else 'cancelled' end
   where id = _id;
end;
$function$;
revoke execute on function public.remove_test_order(uuid) from public, anon;
grant execute on function public.remove_test_order(uuid) to authenticated;
