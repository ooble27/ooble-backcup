-- Compte de test : un admin l'active sur la fiche d'un client pour essayer l'app en vrai avant
-- l'ouverture. Pour ce compte seulement : achats et ventes ouverts, vérification d'identité non
-- exigée, de 2 $ à 200 $ par jour. Le taux, les avantages (parrainage, code promo) et les autres
-- règles restent ceux d'un vrai client. Seul un admin peut changer ce réglage.

alter table public.profiles add column if not exists test_account boolean not null default false;

-- Modification : seul un admin change test_account (repris de la version précédente, plus ce champ).
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
  end if;
  new.id := old.id;
  new.created_at := old.created_at;
  return new;
end;
$function$;

-- Création : un compte ne naît jamais « de test » (sauf par un admin).
create or replace function public.protect_profile_insert()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if not public.is_trusted_writer() and not public.has_role(auth.uid(), 'admin') then
    new.test_account := false;
  end if;
  return new;
end;
$function$;
create or replace trigger trg_protect_profile_insert
  before insert on public.profiles
  for each row execute function public.protect_profile_insert();

-- Contrôles d'une nouvelle commande (repris de la version précédente) : un compte de test passe
-- l'ouverture des commandes et la vérification d'identité, avec 2 $ minimum et 200 $ par jour.
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
begin
  if public.is_trusted_writer()
     or public.has_role(auth.uid(), 'admin')
     or public.has_role(auth.uid(), 'operator') then
    return new;
  end if;

  staff := public.is_staff(auth.uid());
  test := coalesce((select p.test_account from public.profiles p where p.id = new.user_id), false);
  select * into s from public.app_settings where id = 1;

  if not staff and not test and not coalesce(s.trading_enabled, false) then
    raise exception 'Les achats et les ventes ne sont pas encore ouverts.' using errcode = '42501';
  end if;

  if not staff and not test and exists (
    select 1 from public.profiles p
     where p.id = new.user_id and p.account_type = 'business' and p.business_status <> 'approved'
  ) then
    raise exception 'Votre entreprise doit être vérifiée avant de passer un ordre.'
      using errcode = '42501';
  end if;

  if not staff and not test and exists (
    select 1 from public.profiles p
     where p.id = new.user_id
       and p.account_type is distinct from 'business'
       and p.kyc_status is distinct from 'approved'
  ) then
    raise exception 'Votre identité doit être vérifiée avant de passer un ordre.'
      using errcode = '42501';
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
    from public.exchange_rates order by fetched_at desc limit 1;

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
