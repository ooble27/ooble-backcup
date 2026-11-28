-- Comptes entreprise : ouverture à part, rattachement au dossier.
--
-- Règle (précisée le 2026-11-28) : un compte entreprise s'ouvre à part, comme un compte individuel (son propre
-- courriel et son mot de passe, ou Google). Il n'apparaît pas dans le compte individuel. Le seul lien : quand
-- l'entreprise remet son dossier, la personne qui la représente doit déjà avoir un compte individuel chez Ooble.
-- L'entreprise indique le courriel de ce compte ; il est relié au compte entreprise (profiles.business_owner_id).
--
--   • handle_new_user : l'inscription publique peut de nouveau créer un compte entreprise (comme avant le
--     2026-11-28).
--   • link_my_business_owner() : le compte entreprise relie le compte individuel de son représentant, tant que
--     son dossier n'est pas en vérification ou approuvé.
--   • Inchangé : un ordre d'entreprise exige un dossier approuvé et un représentant relié dont l'identité est
--     approuvée ; l'équipe peut relier ou corriger avec admin_link_business_owner().
--
-- Idempotente. Appliquée en production le 2026-11-28.

create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_account_type public.account_type;
  v_limit numeric(12,2) := 9999.00;
  v_lang text := new.raw_user_meta_data->>'preferred_lang';
begin
  v_account_type := coalesce(
    (new.raw_user_meta_data->>'account_type')::public.account_type,
    'individual'
  );

  insert into public.profiles (
    id, full_name, email, sell_ref,
    interac_question, interac_answer,
    account_type, business_name, business_number, business_address, business_phone,
    daily_limit_cad, preferred_lang
  ) values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.email,
    'OB-' || upper(substr(replace(new.id::text, '-', ''), 1, 8)),
    'Code Ooble ?',
    'OB' || upper(substr(replace(new.id::text, '-', ''), 1, 6)),
    v_account_type,
    new.raw_user_meta_data->>'business_name',
    new.raw_user_meta_data->>'business_number',
    new.raw_user_meta_data->>'business_address',
    new.raw_user_meta_data->>'business_phone',
    v_limit,
    case when v_lang in ('fr', 'en') then v_lang end
  );
  return new;
end; $function$;

revoke execute on function public.handle_new_user() from anon, authenticated;

-- Le compte entreprise connecté relie le compte individuel de son représentant (par son courriel).
-- Renvoie seulement le statut d'identité de ce compte (aucun nom), ou une erreur si aucun compte individuel.
create or replace function public.link_my_business_owner(_owner_email text)
returns public.kyc_status
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_me record;
  v_owner record;
begin
  select p.id, p.account_type, p.business_status, p.email into v_me from public.profiles p where p.id = auth.uid();
  if v_me.id is null or v_me.account_type is distinct from 'business' then
    raise exception 'Réservé aux comptes entreprise.' using errcode = '42501';
  end if;
  if v_me.business_status in ('pending', 'approved') then
    raise exception 'Le dossier est déjà envoyé : écrivez-nous pour changer de représentant.' using errcode = '42501';
  end if;
  select p.id, p.kyc_status into v_owner from public.profiles p
   where lower(p.email) = lower(trim(_owner_email)) and p.account_type = 'individual' and p.closed_at is null
   limit 1;
  if v_owner.id is null then
    raise exception 'Aucun compte individuel Ooble avec ce courriel. La personne doit d''abord ouvrir son compte individuel.' using errcode = '22023';
  end if;
  update public.profiles set business_owner_id = v_owner.id where id = v_me.id;
  return v_owner.kyc_status;
end;
$function$;

revoke execute on function public.link_my_business_owner(text) from anon, public;
grant execute on function public.link_my_business_owner(text) to authenticated;

-- Le compte entreprise ne voit que le prénom de son représentant (un courriel saisi ne révèle pas un nom complet).
create or replace function public.my_business_owner()
returns table (full_name text, kyc_status public.kyc_status)
language sql
stable
security definer
set search_path to ''
as $function$
  select nullif(split_part(trim(coalesce(o.full_name, '')), ' ', 1), ''), o.kyc_status
    from public.profiles b
    join public.profiles o on o.id = b.business_owner_id
   where b.id = auth.uid() and b.account_type = 'business';
$function$;
