-- Croissance : codes promo, parrainage et liens suivis.
--
-- Un avantage = un meilleur taux sur UNE commande, en points de base (50 = 0,5 %). C'est la base qui
-- l'applique dans enforce_order_insert, jamais l'app. Un seul avantage par commande (le meilleur),
-- plafonné par growth_settings.max_bonus_bps (150 = 1,5 %) : Ooble garde toujours une marge.
--
-- Correction du taux : l'app envoie le taux qu'elle affiche. Il peut être moins avantageux que celui
-- du moment (tolérance habituelle), mais plus avantageux de 0,2 % au plus (le taux bouge toutes les
-- 10 secondes) : plus personne ne peut s'offrir un meilleur taux en modifiant l'app.

-- ─── Réglages ───
create table if not exists public.growth_settings (
  id int primary key default 1 check (id = 1),
  referral_enabled boolean not null default false,
  referral_bonus_bps int not null default 50 check (referral_bonus_bps between 0 and 150),
  max_bonus_bps int not null default 150 check (max_bonus_bps between 0 and 190),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.growth_settings (id) values (1) on conflict (id) do nothing;
alter table public.growth_settings enable row level security;
create policy "Réglages croissance lisibles" on public.growth_settings for select to authenticated using (true);
create policy "Réglages croissance : équipe marketing" on public.growth_settings for update to authenticated
  using (public.has_any_role(auth.uid(), array['admin','marketing']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','marketing']::public.app_role[]));

-- ─── Codes promo ───
create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{3,24}$'),
  bonus_bps int not null check (bonus_bps between 1 and 190),
  side text not null default 'both' check (side in ('buy', 'sell', 'both')),
  first_order_only boolean not null default false,
  max_uses int check (max_uses is null or max_uses > 0),
  ends_at timestamptz,
  active boolean not null default true,
  note text check (note is null or char_length(note) <= 200),
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.promo_codes enable row level security;
create policy "Codes promo : équipe marketing" on public.promo_codes for all to authenticated
  using (public.has_any_role(auth.uid(), array['admin','marketing']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','marketing']::public.app_role[]));

-- Une ligne par commande qui a utilisé un code (une commande annulée ou expirée ne compte plus).
create table if not exists public.promo_redemptions (
  order_id uuid primary key references public.orders (id),
  code_id uuid not null references public.promo_codes (id),
  user_id uuid not null,
  bonus_bps int not null,
  created_at timestamptz not null default now()
);
create index if not exists promo_redemptions_code_idx on public.promo_redemptions (code_id);
alter table public.promo_redemptions enable row level security;
create policy "Utilisations des codes : équipe marketing" on public.promo_redemptions for select to authenticated
  using (public.has_any_role(auth.uid(), array['admin','marketing']::public.app_role[]));

-- ─── Parrainage ───
create table if not exists public.referral_codes (
  user_id uuid primary key references public.profiles (id),
  code text not null unique,
  created_at timestamptz not null default now()
);
alter table public.referral_codes enable row level security;
create policy "Son code de parrainage" on public.referral_codes for select to authenticated using (auth.uid() = user_id);

-- referred_order_id : la 1re commande du filleul (avec l'avantage) ; qualified_at : quand elle est
-- terminée (le parrain gagne alors son avantage) ; sponsor_order_id : la commande du parrain qui l'a utilisé.
create table if not exists public.referrals (
  referred_id uuid primary key references public.profiles (id),
  referrer_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  referred_order_id uuid references public.orders (id),
  qualified_at timestamptz,
  sponsor_order_id uuid references public.orders (id),
  check (referred_id <> referrer_id)
);
create index if not exists referrals_referrer_idx on public.referrals (referrer_id);
alter table public.referrals enable row level security;
create policy "Ses parrainages" on public.referrals for select to authenticated
  using (auth.uid() = referrer_id or auth.uid() = referred_id
         or public.has_any_role(auth.uid(), array['admin','marketing']::public.app_role[]));

-- ─── Commandes ───
alter table public.orders
  add column if not exists promo_code text,
  add column if not exists bonus_bps int not null default 0,
  add column if not exists bonus_reason text check (bonus_reason in ('promo', 'referral_new', 'referral_sponsor'));

-- L'avantage d'un client pour une commande : le meilleur entre le code saisi et le parrainage.
-- _strict : un code invalide lève une erreur (commande) ; sinon il est simplement ignoré (aperçu).
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
  -- Appelée par le contrôle des commandes au nom du client : seulement pour soi-même.
  if _uid is distinct from auth.uid() and not public.is_trusted_writer() then
    return query select 0, null::text, null::uuid, null::text;
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
revoke execute on function public.order_bonus(uuid, text, text, boolean) from public, anon;
grant execute on function public.order_bonus(uuid, text, text, boolean) to authenticated;

-- Aperçu pour l'app : l'avantage qu'aurait la prochaine commande du client connecté.
create or replace function public.preview_bonus(_side text, _code text default null)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare b record;
begin
  if auth.uid() is null or _side not in ('buy', 'sell') then return null; end if;
  select * into b from public.order_bonus(auth.uid(), _side, _code, false);
  return jsonb_build_object('bps', b.bps, 'reason', b.reason, 'problem', b.problem);
end;
$function$;
revoke execute on function public.preview_bonus(text, text) from public, anon;
grant execute on function public.preview_bonus(text, text) to authenticated;

-- Contrôles d'une nouvelle commande (repris de la version précédente) + correction du taux + avantage.
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
begin
  if public.is_trusted_writer()
     or public.has_role(auth.uid(), 'admin')
     or public.has_role(auth.uid(), 'operator') then
    return new;
  end if;

  staff := public.is_staff(auth.uid());
  select * into s from public.app_settings where id = 1;

  if not staff and not coalesce(s.trading_enabled, false) then
    raise exception 'Les achats et les ventes ne sont pas encore ouverts.' using errcode = '42501';
  end if;

  if not staff and exists (
    select 1 from public.profiles p
     where p.id = new.user_id and p.account_type = 'business' and p.business_status <> 'approved'
  ) then
    raise exception 'Votre entreprise doit être vérifiée avant de passer un ordre.'
      using errcode = '42501';
  end if;

  if not staff and exists (
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
    -- Plus avantageux pour le client que le taux du moment : 0,2 % au plus.
    if (new.side = 'buy' and new.locked_rate < ref_rate * 0.998)
       or (new.side = 'sell' and new.locked_rate > ref_rate * 1.002) then
      raise exception 'Le taux a changé. Actualisez la page puis réessayez.'
        using errcode = '22023';
    end if;
  end if;

  if new.locked_rate is null or new.locked_rate <= 0 then
    raise exception 'Taux invalide.' using errcode = '22023';
  end if;

  -- Avantage (code promo ou parrainage) : un meilleur taux, appliqué ici seulement.
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
  if new.cad_amount < coalesce(s.trade_min_cad, 100) then
    raise exception 'Le montant minimum d''une % est de % $.', label, round(coalesce(s.trade_min_cad, 100)) using errcode = '22023';
  end if;
  if new.cad_amount > coalesce(s.trade_daily_max_cad, 9999) then
    raise exception 'Le montant maximum d''une % est de % $.', label, round(coalesce(s.trade_daily_max_cad, 9999)) using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('ooble-' || new.side || ':' || new.user_id::text));

  select least(coalesce(p.daily_limit_cad, s.trade_daily_max_cad, 9999), coalesce(s.trade_daily_max_cad, 9999)) into lim
    from public.profiles p where p.id = new.user_id;
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

-- Après la création : on note l'utilisation du code ou de l'avantage de parrainage.
create or replace function public.order_bonus_after_insert()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if new.bonus_reason = 'promo' then
    insert into public.promo_redemptions (order_id, code_id, user_id, bonus_bps)
    select new.id, p.id, new.user_id, new.bonus_bps from public.promo_codes p where p.code = new.promo_code
    on conflict (order_id) do nothing;
  elsif new.bonus_reason = 'referral_new' then
    update public.referrals set referred_order_id = new.id where referred_id = new.user_id and referred_order_id is null;
  elsif new.bonus_reason = 'referral_sponsor' then
    update public.referrals set sponsor_order_id = new.id
     where referred_id = (select r.referred_id from public.referrals r
                           where r.referrer_id = new.user_id and r.qualified_at is not null and r.sponsor_order_id is null
                           order by r.qualified_at limit 1);
  end if;
  return new;
end;
$function$;
revoke execute on function public.order_bonus_after_insert() from public, anon, authenticated;
create or replace trigger trg_order_bonus_after_insert
  after insert on public.orders
  for each row when (new.bonus_reason is not null)
  execute function public.order_bonus_after_insert();

-- Changement de statut : commande annulée ou expirée → l'avantage de parrainage redevient disponible ;
-- 1re commande du filleul terminée → le parrain gagne le sien.
create or replace function public.order_bonus_status()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if new.status in ('cancelled', 'expired') and old.status not in ('cancelled', 'expired') then
    update public.referrals set referred_order_id = null where referred_order_id = new.id and qualified_at is null;
    update public.referrals set sponsor_order_id = null where sponsor_order_id = new.id;
  elsif new.status = 'completed' and old.status <> 'completed' then
    update public.referrals set qualified_at = now() where referred_order_id = new.id and qualified_at is null;
  end if;
  return new;
end;
$function$;
revoke execute on function public.order_bonus_status() from public, anon, authenticated;
create or replace trigger trg_order_bonus_status
  after update of status on public.orders
  for each row when (old.status is distinct from new.status)
  execute function public.order_bonus_status();

-- ─── Parrainage côté client ───

-- Le code du client connecté (créé au premier appel) et ses chiffres.
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
    'available', (select count(*) from public.referrals r where r.referrer_id = uid and r.qualified_at is not null and r.sponsor_order_id is null)
  );
end;
$function$;
revoke execute on function public.my_referral() from public, anon;
grant execute on function public.my_referral() to authenticated;

-- Rattache le client connecté à son parrain (lien ?parrain=CODE) : compte de moins de 30 jours,
-- sans commande, pas déjà parrainé, pas soi-même.
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
  if (select created_at from public.profiles where id = uid) < now() - interval '30 days' then return 'too_old'; end if;
  insert into public.referrals (referred_id, referrer_id) values (uid, sponsor) on conflict (referred_id) do nothing;
  return 'ok';
end;
$function$;
revoke execute on function public.claim_referral(text) from public, anon;
grant execute on function public.claim_referral(text) to authenticated;

-- ─── Chiffres pour l'équipe ───

-- Codes promo : utilisations (hors commandes annulées ou expirées), commandes terminées et volume.
create or replace function public.promo_stats()
 returns table(code_id uuid, uses int, completed int, volume numeric)
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
begin
  if not public.has_any_role(auth.uid(), array['admin','marketing']::public.app_role[]) then
    raise exception 'Réservé à l''équipe marketing.' using errcode = '42501';
  end if;
  return query
  select r.code_id, count(*)::int,
         count(*) filter (where o.status = 'completed')::int,
         coalesce(sum(o.cad_amount) filter (where o.status = 'completed'), 0)
    from public.promo_redemptions r join public.orders o on o.id = r.order_id
   where o.status not in ('cancelled', 'expired')
   group by r.code_id;
end;
$function$;
revoke execute on function public.promo_stats() from public, anon;
grant execute on function public.promo_stats() to authenticated;

-- Parrainage : chaque parrain, ses filleuls, ceux qui ont commandé, et le volume des filleuls.
create or replace function public.referral_stats()
 returns table(referrer_id uuid, name text, invited int, ordered int, qualified int, volume numeric)
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
begin
  if not public.has_any_role(auth.uid(), array['admin','marketing']::public.app_role[]) then
    raise exception 'Réservé à l''équipe marketing.' using errcode = '42501';
  end if;
  return query
  select r.referrer_id, coalesce(nullif(trim(p.full_name), ''), p.email, '—')::text,
         count(*)::int,
         count(*) filter (where exists (select 1 from public.orders o where o.user_id = r.referred_id and o.status not in ('cancelled', 'expired')))::int,
         count(*) filter (where r.qualified_at is not null)::int,
         coalesce((select sum(o.cad_amount) from public.orders o
                    where o.user_id in (select r2.referred_id from public.referrals r2 where r2.referrer_id = r.referrer_id)
                      and o.status = 'completed'), 0)
    from public.referrals r join public.profiles p on p.id = r.referrer_id
   group by r.referrer_id, p.full_name, p.email
   order by count(*) desc;
end;
$function$;
revoke execute on function public.referral_stats() from public, anon;
grant execute on function public.referral_stats() to authenticated;

-- Liens suivis : par source et campagne (?src= / ?utm_source=, ?utm_campaign=), les inscrits, les
-- vérifiés, ceux qui ont commandé et le volume terminé.
create or replace function public.link_stats(_since timestamptz)
 returns table(source text, campaign text, signups int, verified int, buyers int, volume numeric)
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
begin
  if not public.has_any_role(auth.uid(), array['admin','marketing']::public.app_role[]) then
    raise exception 'Réservé à l''équipe marketing.' using errcode = '42501';
  end if;
  return query
  select coalesce(so.source, 'Direct')::text, so.campaign::text,
         count(*)::int,
         count(*) filter (where p.kyc_status = 'approved' or p.business_status = 'approved')::int,
         count(*) filter (where exists (select 1 from public.orders o where o.user_id = so.user_id and o.status = 'completed'))::int,
         coalesce(sum((select sum(o.cad_amount) from public.orders o where o.user_id = so.user_id and o.status = 'completed')), 0)
    from public.signup_origins so join public.profiles p on p.id = so.user_id
   where so.created_at >= _since
   group by 1, 2
   order by 3 desc;
end;
$function$;
revoke execute on function public.link_stats(timestamptz) from public, anon;
grant execute on function public.link_stats(timestamptz) to authenticated;
