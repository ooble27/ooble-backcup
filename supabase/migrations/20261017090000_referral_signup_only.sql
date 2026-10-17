-- Le parrainage se fait à l'inscription seulement : le code (lien d'invitation ou saisi en créant le
-- compte) est rattaché à la première ouverture de l'app, donc un compte de moins de 3 jours, sans
-- commande. Un compte existant ne peut plus être parrainé.
create or replace function public.claim_referral(_code text)
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  uid uuid := auth.uid();
  sponsor uuid;
begin
  if uid is null then return 'auth'; end if;
  if not coalesce((select referral_enabled from public.growth_settings where id = 1), false) then return 'off'; end if;
  select user_id into sponsor from public.referral_codes where code = upper(trim(coalesce(_code, '')));
  if sponsor is null then return 'unknown'; end if;
  if sponsor = uid then return 'self'; end if;
  if exists (select 1 from public.referrals where referred_id = uid) then return 'already'; end if;
  if exists (select 1 from public.orders where user_id = uid) then return 'has_orders'; end if;
  if (select created_at from public.profiles where id = uid) < now() - interval '3 days' then return 'too_old'; end if;
  insert into public.referrals (referred_id, referrer_id) values (uid, sponsor) on conflict (referred_id) do nothing;
  return 'ok';
end;
$function$;
