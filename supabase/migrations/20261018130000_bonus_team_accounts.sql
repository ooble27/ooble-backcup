-- Avantages sur le taux et comptes de l'équipe.
--
-- Le contrôle des commandes (enforce_order_insert) n'applique jamais d'avantage à un compte de
-- l'équipe. Mais l'aperçu (preview_bonus → order_bonus) l'annonçait quand même : un administrateur
-- parrain voyait « Merci pour votre parrainage : taux amélioré » sans l'obtenir, et le message restait
-- puisque l'avantage n'était jamais utilisé. L'aperçu suit maintenant la même règle que la commande,
-- et « Mon compte » ne compte plus d'avantage en attente pour un membre de l'équipe.

create or replace function public.order_bonus(_uid uuid, _side text, _code text, _strict boolean)
 returns table(bps int, reason text, code_id uuid, problem text)
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  g record;
  pc record;
  c text := upper(nullif(trim(coalesce(_code, '')), ''));
  best int := 0;
  why text := null;
  cid uuid := null;
  err text := null;
  has_orders boolean;
begin
  if _uid is distinct from auth.uid() and not public.is_trusted_writer() then
    return query select 0, null::text, null::uuid, null::text;
    return;
  end if;
  -- Comptes de l'équipe : aucun avantage (comme dans enforce_order_insert).
  if public.is_staff(_uid) then
    return query select 0, null::text, null::uuid,
      case when c is not null then 'Les comptes de l''équipe n''ont pas d''avantage sur le taux.' end;
    return;
  end if;
  select * into g from public.growth_settings where id = 1;
  has_orders := exists (select 1 from public.orders o where o.user_id = _uid and o.status not in ('cancelled', 'expired'));

  if c is not null then
    select * into pc from public.promo_codes p where p.code = c;
    if not found or not pc.active or (pc.ends_at is not null and pc.ends_at < now()) then
      err := 'Ce code promo n''est pas valable.';
    elsif pc.side <> 'both' and pc.side <> _side then
      err := case when pc.side = 'buy' then 'Ce code promo est réservé aux achats.' else 'Ce code promo est réservé aux ventes.' end;
    elsif pc.first_order_only and has_orders then
      err := 'Ce code promo est réservé à une première commande.';
    elsif exists (select 1 from public.promo_redemptions r join public.orders o on o.id = r.order_id
                   where r.code_id = pc.id and r.user_id = _uid and o.status not in ('cancelled', 'expired')) then
      err := 'Vous avez déjà utilisé ce code promo.';
    elsif pc.max_uses is not null and (select count(*) from public.promo_redemptions r join public.orders o on o.id = r.order_id
                                        where r.code_id = pc.id and o.status not in ('cancelled', 'expired')) >= pc.max_uses then
      err := 'Ce code promo n''est plus disponible.';
    else
      best := pc.bonus_bps; why := 'promo'; cid := pc.id;
    end if;
    if err is not null and _strict then
      raise exception '%', err using errcode = '22023';
    end if;
  end if;

  if coalesce(g.referral_enabled, false) and coalesce(g.referral_bonus_bps, 0) > best then
    if not has_orders and exists (select 1 from public.referrals r where r.referred_id = _uid and r.referred_order_id is null) then
      best := g.referral_bonus_bps; why := 'referral_new'; cid := null;
    elsif exists (select 1 from public.referrals r where r.referrer_id = _uid and r.qualified_at is not null and r.sponsor_order_id is null) then
      best := g.referral_bonus_bps; why := 'referral_sponsor'; cid := null;
    end if;
  end if;

  return query select least(best, coalesce(g.max_bonus_bps, 150)), why, cid, err;
end;
$function$;

create or replace function public.my_referral()
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  uid uuid := auth.uid();
  c text;
  g record;
begin
  if uid is null then return null; end if;
  select * into g from public.growth_settings where id = 1;
  select code into c from public.referral_codes where user_id = uid;
  if c is null and coalesce(g.referral_enabled, false) then
    loop
      c := upper(substr(md5(random()::text || clock_timestamp()::text || uid::text), 1, 7));
      begin
        insert into public.referral_codes (user_id, code) values (uid, c);
        exit;
      exception when unique_violation then
        select code into c from public.referral_codes where user_id = uid;
        exit when c is not null;
      end;
    end loop;
  end if;
  return jsonb_build_object(
    'enabled', coalesce(g.referral_enabled, false),
    'bonus_bps', least(coalesce(g.referral_bonus_bps, 0), coalesce(g.max_bonus_bps, 150)),
    'code', c,
    'invited', (select count(*) from public.referrals r where r.referrer_id = uid),
    'qualified', (select count(*) from public.referrals r where r.referrer_id = uid and r.qualified_at is not null),
    -- Un membre de l'équipe n'a pas d'avantage à utiliser (ses filleuls ont toujours le leur).
    'available', case when public.is_staff(uid) then 0
                      else (select count(*) from public.referrals r where r.referrer_id = uid and r.qualified_at is not null and r.sponsor_order_id is null) end
  );
end;
$function$;
