-- Comptes entreprise rattachés à un compte individuel vérifié.
--
-- Règle : une personne ouvre d'abord son compte individuel et fait vérifier son identité. Ensuite seulement,
-- depuis ce compte, elle crée un ou plusieurs comptes entreprise (chacun avec son propre courriel et son mot
-- de passe). Chaque compte entreprise est relié à cette personne, son responsable.
--
--   • profiles.business_owner_id : le compte individuel du responsable. Seuls le serveur (création du compte
--     entreprise par la fonction business-account) et un administrateur peuvent le fixer ou le changer.
--   • L'inscription publique ne crée plus que des comptes individuels : le type « entreprise » envoyé par le
--     navigateur est ignoré. Seul le serveur transforme un compte en compte entreprise.
--   • Une entreprise ne peut passer un ordre que si son dossier est approuvé ET si son responsable est relié et
--     a son identité approuvée.
--   • my_businesses() : les entreprises du responsable connecté ; my_business_owner() : le responsable du compte
--     entreprise connecté (prénom, nom, statut d'identité).
--   • admin_link_business_owner() : l'équipe relie un compte entreprise déjà créé à son responsable.
--
-- Idempotente. Appliquée en production le 2026-11-28.

alter table public.profiles
  add column if not exists business_owner_id uuid references public.profiles(id);

create index if not exists profiles_business_owner_idx on public.profiles (business_owner_id) where business_owner_id is not null;

comment on column public.profiles.business_owner_id is 'Compte individuel du responsable de ce compte entreprise (fixé par le serveur ou un administrateur).';

-- ---- Création de compte : toujours individuel -------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_limit numeric(12,2) := 9999.00;
  v_lang text := new.raw_user_meta_data->>'preferred_lang';
begin
  -- Le type de compte n'est plus lu dans les métadonnées envoyées par le navigateur : tout compte naît
  -- individuel. Un compte entreprise est créé par la fonction serveur business-account, qui le relie au
  -- compte individuel vérifié de son responsable.
  insert into public.profiles (
    id, full_name, email, sell_ref,
    interac_question, interac_answer,
    account_type, daily_limit_cad, preferred_lang
  ) values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.email,
    'OB-' || upper(substr(replace(new.id::text, '-', ''), 1, 8)),
    'Code Ooble ?',
    'OB' || upper(substr(replace(new.id::text, '-', ''), 1, 6)),
    'individual',
    v_limit,
    case when v_lang in ('fr', 'en') then v_lang end
  );
  return new;
end;
$function$;

revoke execute on function public.handle_new_user() from anon, authenticated;

-- ---- Profils : le lien au responsable est protégé ----------------------------------------------------
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if public.is_trusted_writer() then
    return new;
  end if;
  if not (public.has_role(auth.uid(), 'admin') or public.has_any_role(auth.uid(), array['kyc_reviewer','compliance']::public.app_role[])) then
    new.kyc_status := old.kyc_status;
    new.business_status := old.business_status;
    if old.kyc_status = 'approved' then
      new.full_name := old.full_name;
    end if;
  end if;
  if not public.has_role(auth.uid(), 'admin') then
    new.daily_limit_cad := old.daily_limit_cad;
    new.email := old.email;
    new.sell_ref := old.sell_ref;
    new.account_type := old.account_type;
    new.business_name := old.business_name;
    new.business_number := old.business_number;
    new.business_address := old.business_address;
    new.business_phone := old.business_phone;
    new.test_account := old.test_account;
    new.business_owner_id := old.business_owner_id;
  end if;
  new.id := old.id;
  new.created_at := old.created_at;
  return new;
end;
$function$;

-- ---- Ordres : entreprise vérifiée ET responsable relié et vérifié -----------------------------------
create or replace function public.enforce_order_insert()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  r record;
  s record;
  b record;
  ref_rate numeric;
  tolerance numeric;
  lim numeric;
  used numeric;
  label text;
  staff boolean;
  test boolean;
  biz record;
begin
  if public.is_trusted_writer()
     or public.has_role(auth.uid(), 'admin')
     or public.has_role(auth.uid(), 'operator') then
    return new;
  end if;

  staff := public.is_staff(auth.uid());
  test := coalesce((select p.test_account from public.profiles p where p.id = new.user_id), false);
  select a.trading_enabled, a.rate_lock_minutes, a.trade_min_cad, a.trade_daily_max_cad into s from public.app_settings a where a.id = 1;

  if not staff and not test and not coalesce(s.trading_enabled, false) then
    raise exception 'Les achats et les ventes ne sont pas encore ouverts.' using errcode = '42501';
  end if;

  select p.account_type, p.business_status, p.business_owner_id, o.kyc_status as owner_kyc
    into biz
    from public.profiles p
    left join public.profiles o on o.id = p.business_owner_id
   where p.id = new.user_id;

  if not staff and not test and biz.account_type = 'business' then
    if biz.business_status is distinct from 'approved' then
      raise exception 'Votre entreprise doit être vérifiée avant de passer un ordre.' using errcode = '42501';
    end if;
    if biz.business_owner_id is null then
      raise exception 'Ce compte entreprise doit être relié au compte vérifié de son responsable. Écrivez-nous à support@ooble.ca.' using errcode = '42501';
    end if;
    if biz.owner_kyc is distinct from 'approved' then
      raise exception 'L''identité du responsable de l''entreprise doit être vérifiée avant de passer un ordre.' using errcode = '42501';
    end if;
  end if;

  if not staff and not test and biz.account_type is distinct from 'business' and exists (
    select 1 from public.profiles p where p.id = new.user_id and p.kyc_status is distinct from 'approved'
  ) then
    raise exception 'Votre identité doit être vérifiée avant de passer un ordre.' using errcode = '42501';
  end if;

  new.status := 'created';
  new.fee_cad := 0;
  new.assigned_to := null;
  new.rate_locked_until := now() + make_interval(mins => coalesce(s.rate_lock_minutes, 15));
  new.created_at := now();
  new.updated_at := now();
  new.bonus_bps := 0;
  new.bonus_reason := null;

  select buy_rate, sell_rate, fetched_at into r
    from public.exchange_rates where asset = new.asset order by fetched_at desc limit 1;

  if found then
    ref_rate := case when new.side = 'buy' then r.buy_rate else r.sell_rate end;
    tolerance := case when r.fetched_at > now() - interval '1 hour' then 0.015 else 0.05 end;
    if new.locked_rate is null or ref_rate is null or ref_rate <= 0
       or abs(new.locked_rate - ref_rate) / ref_rate > tolerance then
      raise exception 'Le taux a changé. Actualisez la page puis réessayez.'
        using errcode = '22023';
    end if;
    if (new.side = 'buy' and new.locked_rate < ref_rate * 0.998)
       or (new.side = 'sell' and new.locked_rate > ref_rate * 1.002) then
      raise exception 'Le taux a changé. Actualisez la page puis réessayez.'
        using errcode = '22023';
    end if;
  end if;

  if new.locked_rate is null or new.locked_rate <= 0 then
    raise exception 'Taux invalide.' using errcode = '22023';
  end if;

  if not staff then
    select * into b from public.order_bonus(new.user_id, new.side::text, new.promo_code, true);
    new.promo_code := case when b.reason = 'promo' then upper(trim(new.promo_code)) else null end;
    if coalesce(b.bps, 0) > 0 then
      new.bonus_bps := b.bps;
      new.bonus_reason := b.reason;
      new.locked_rate := round(case when new.side = 'buy' then new.locked_rate * (1 - b.bps / 10000.0)
                                    else new.locked_rate * (1 + b.bps / 10000.0) end, 6);
    end if;
  else
    new.promo_code := null;
  end if;

  if new.side = 'buy' then
    new.usdt_amount := round(new.cad_amount / new.locked_rate, 6);
  else
    new.cad_amount := round(new.usdt_amount * new.locked_rate, 2);
  end if;

  if new.cad_amount is null or new.cad_amount <= 0 then
    raise exception 'Montant invalide.' using errcode = '22023';
  end if;

  if staff then
    return new;
  end if;

  label := case when new.side = 'buy' then 'achat' else 'vente' end;
  if test then
    if new.cad_amount < 2 then
      raise exception 'Le montant minimum d''un essai est de 2 $.' using errcode = '22023';
    end if;
    lim := 200;
  else
    if new.cad_amount < coalesce(s.trade_min_cad, 100) then
      raise exception 'Le montant minimum d''une % est de % $.', label, round(coalesce(s.trade_min_cad, 100)) using errcode = '22023';
    end if;
    if new.cad_amount > coalesce(s.trade_daily_max_cad, 9999) then
      raise exception 'Le montant maximum d''une % est de % $.', label, round(coalesce(s.trade_daily_max_cad, 9999)) using errcode = '22023';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('ooble-' || new.side || ':' || new.user_id::text));

  if not test then
    select least(coalesce(p.daily_limit_cad, s.trade_daily_max_cad, 9999), coalesce(s.trade_daily_max_cad, 9999)) into lim
      from public.profiles p where p.id = new.user_id;
  end if;
  select coalesce(sum(o.cad_amount), 0) into used
    from public.orders o
   where o.user_id = new.user_id
     and o.side = new.side
     and o.status not in ('cancelled', 'expired', 'refunded')
     and o.created_at > now() - interval '24 hours';

  if used + new.cad_amount > coalesce(lim, 9999) then
    raise exception 'Limite de % $ sur 24 heures : il vous reste % $.',
      round(coalesce(lim, 9999)), greatest(0, floor(coalesce(lim, 9999) - used))
      using errcode = '22023';
  end if;

  return new;
end;
$function$;

-- ---- Le responsable voit ses entreprises ; l'entreprise voit son responsable ----------------------
create or replace function public.my_businesses()
returns table (id uuid, business_name text, email text, business_status public.kyc_status, created_at timestamptz)
language sql
stable
security definer
set search_path to ''
as $function$
  select p.id, p.business_name, p.email, p.business_status, p.created_at
    from public.profiles p
   where p.business_owner_id = auth.uid() and p.account_type = 'business'
   order by p.created_at;
$function$;

create or replace function public.my_business_owner()
returns table (full_name text, kyc_status public.kyc_status)
language sql
stable
security definer
set search_path to ''
as $function$
  select o.full_name, o.kyc_status
    from public.profiles b
    join public.profiles o on o.id = b.business_owner_id
   where b.id = auth.uid() and b.account_type = 'business';
$function$;

revoke execute on function public.my_businesses() from anon, public;
revoke execute on function public.my_business_owner() from anon, public;
grant execute on function public.my_businesses() to authenticated;
grant execute on function public.my_business_owner() to authenticated;

-- ---- L'équipe relie un compte entreprise existant à son responsable -------------------------------
create or replace function public.admin_link_business_owner(_business_id uuid, _owner_email text)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_owner uuid;
begin
  if not (public.has_role(auth.uid(), 'admin') or public.has_any_role(auth.uid(), array['kyc_reviewer','compliance']::public.app_role[])) then
    raise exception 'Réservé à l''équipe conformité.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = _business_id and account_type = 'business') then
    raise exception 'Ce compte n''est pas un compte entreprise.' using errcode = '22023';
  end if;
  select id into v_owner from public.profiles
   where lower(email) = lower(trim(_owner_email)) and account_type = 'individual';
  if v_owner is null then
    raise exception 'Aucun compte individuel avec ce courriel.' using errcode = '22023';
  end if;
  update public.profiles set business_owner_id = v_owner where id = _business_id;
  return v_owner::text;
end;
$function$;

revoke execute on function public.admin_link_business_owner(uuid, text) from anon, public;
grant execute on function public.admin_link_business_owner(uuid, text) to authenticated;
