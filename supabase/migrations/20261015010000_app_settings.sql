-- Réglages de la plateforme, modifiables dans le back-office (Réglages), sans publication.
-- Une seule ligne. Tout le monde peut la lire (l'app en a besoin avant la connexion) ;
-- seuls les administrateurs la modifient, et la base note qui l'a fait.
create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  trading_enabled boolean not null default false,
  verification_enabled boolean not null default false,
  otc_enabled boolean not null default false,
  trade_min_cad numeric not null default 100 check (trade_min_cad >= 1),
  -- Jamais au-dessus de 9 999 $ sur 24 heures : on reste sous le seuil de déclaration du CANAFE.
  trade_daily_max_cad numeric not null default 9999 check (trade_daily_max_cad <= 9999),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  updated_by_name text,
  constraint app_settings_limits check (trade_daily_max_cad >= trade_min_cad)
);
insert into public.app_settings (id) values (1) on conflict (id) do nothing;

alter table public.app_settings enable row level security;
create policy app_settings_read on public.app_settings for select using (true);
create policy app_settings_admin_update on public.app_settings for update
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
grant select on public.app_settings to anon, authenticated;
grant update on public.app_settings to authenticated;

create or replace function public.app_settings_stamp()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  new.id := 1;
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.updated_by_name := (select coalesce(nullif(trim(p.full_name), ''), p.email) from public.profiles p where p.id = auth.uid());
  return new;
end;
$function$;
revoke execute on function public.app_settings_stamp() from anon, authenticated, public;
create or replace trigger trg_app_settings_stamp before update on public.app_settings
  for each row execute function public.app_settings_stamp();

-- Commandes : la base applique les réglages (ouverture et limites). L'équipe reste libre, pour les tests.
create or replace function public.enforce_order_insert()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  r record;
  s record;
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

  -- Particulier : identité vérifiée obligatoire (règle CANAFE). Le contrôle
  -- de l'application ne suffit pas, un appel direct à l'API le contournerait.
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
  new.rate_locked_until := now() + interval '15 minutes';
  new.created_at := now();
  new.updated_at := now();

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
  end if;

  if new.locked_rate is null or new.locked_rate <= 0 then
    raise exception 'Taux invalide.' using errcode = '22023';
  end if;

  if new.side = 'buy' then
    new.usdt_amount := round(new.cad_amount / new.locked_rate, 6);
  else
    new.cad_amount := round(new.usdt_amount * new.locked_rate, 2);
  end if;

  if new.cad_amount is null or new.cad_amount <= 0 then
    raise exception 'Montant invalide.' using errcode = '22023';
  end if;

  -- Équipe : aucune limite de montant, pour les tests.
  if staff then
    return new;
  end if;

  -- Limites des réglages, sur le montant en CAD.
  label := case when new.side = 'buy' then 'achat' else 'vente' end;
  if new.cad_amount < coalesce(s.trade_min_cad, 100) then
    raise exception 'Le montant minimum d''une % est de % $.', label, round(coalesce(s.trade_min_cad, 100)) using errcode = '22023';
  end if;
  if new.cad_amount > coalesce(s.trade_daily_max_cad, 9999) then
    raise exception 'Le montant maximum d''une % est de % $.', label, round(coalesce(s.trade_daily_max_cad, 9999)) using errcode = '22023';
  end if;

  -- Un ordre à la fois par client et par sens, pour que le cumul soit exact.
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
