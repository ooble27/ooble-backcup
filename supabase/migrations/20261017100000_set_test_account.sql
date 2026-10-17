-- Compte de test : changé par un admin depuis la fiche client. Les admins ne modifient pas
-- directement le profil d'un client (la règle d'accès ne le permet qu'au client lui-même) : on passe
-- par cette fonction, réservée aux admins, qui ne touche que ce réglage et ce compte.
create or replace function public.set_test_account(_uid uuid, _on boolean)
 returns boolean
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Réservé aux admins.' using errcode = '42501';
  end if;
  update public.profiles set test_account = _on where id = _uid;
  if not found then
    raise exception 'Client introuvable.' using errcode = '22023';
  end if;
  return _on;
end;
$function$;
revoke execute on function public.set_test_account(uuid, boolean) from public, anon;
grant execute on function public.set_test_account(uuid, boolean) to authenticated;
