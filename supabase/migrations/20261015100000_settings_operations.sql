-- Réglages : tout ce qu'un administrateur change sans écrire de code (Back-office › Réglages).
--   1. Réseaux ouverts ou fermés, séparément pour les achats et les ventes (la base refuse une commande sur un réseau fermé).
--   2. Inscriptions ouvertes ou fermées (particuliers, entreprises).
--   3. Limite quotidienne d'un client précis (fiche client), par l'administration ou la conformité.
--   4. Délais : taux garanti, expiration d'une vente jamais envoyée.
--   5. Taux de secours : un cours du marché figé à la main quand la source ne répond plus.
--   6. Coordonnées affichées aux clients (support, Interac, OTC).
--   7. Destinataires des alertes « nouvelle commande », dans une table réservée aux administrateurs.

alter table public.app_settings
  add column if not exists networks jsonb not null default '{"trc20":{"buy":true,"sell":true},"bep20":{"buy":true,"sell":true},"erc20":{"buy":false,"sell":false},"polygon":{"buy":true,"sell":true},"spl":{"buy":true,"sell":true},"avalanche":{"buy":false,"sell":false}}',
  add column if not exists signups_individual boolean not null default true,
  add column if not exists signups_business boolean not null default true,
  add column if not exists rate_lock_minutes int not null default 15,
  add column if not exists sell_expiry_hours int not null default 48,
  add column if not exists manual_market_rate numeric(12,6),
  add column if not exists support_email text not null default 'support@ooble.ca',
  add column if not exists interac_email text not null default 'interac@ooble.ca',
  add column if not exists otc_email text not null default 'otc@ooble.ca';

alter table public.app_settings
  add constraint app_settings_rate_lock check (rate_lock_minutes between 5 and 60),
  add constraint app_settings_sell_expiry check (sell_expiry_hours between 6 and 168),
  add constraint app_settings_manual_rate check (manual_market_rate is null or (manual_market_rate > 0.5 and manual_market_rate < 5)),
  add constraint app_settings_emails check (
    support_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and interac_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and otc_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  add constraint app_settings_networks check (jsonb_typeof(networks) = 'object');

-- ─── Réglages internes (jamais lisibles par les clients) ───
create table if not exists public.app_private_settings (
  id int primary key default 1 check (id = 1),
  staff_alert_emails text[] not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);
insert into public.app_private_settings (id) values (1) on conflict (id) do nothing;
alter table public.app_private_settings enable row level security;
create policy "Admin lit les réglages internes" on public.app_private_settings for select using (public.has_role(auth.uid(), 'admin'));
create policy "Admin change les réglages internes" on public.app_private_settings for update
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
alter table public.app_private_settings
  add constraint app_private_settings_emails check (
    cardinality(staff_alert_emails) <= 10
    and array_to_string(staff_alert_emails, ',') !~ '[[:space:]]');

create or replace function public.app_private_settings_stamp()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
create or replace trigger app_private_settings_stamp before update on public.app_private_settings
  for each row execute function public.app_private_settings_stamp();

-- ─── 1. Réseaux : la base refuse une commande sur un réseau fermé ───
create or replace function public.reject_retired_network()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  is_open boolean;
begin
  if public.is_trusted_writer() then return new; end if;
  select coalesce((s.networks -> (new.network::text) ->> (new.side::text))::boolean, false) into is_open
    from public.app_settings s where s.id = 1;
  if not coalesce(is_open, false) then
    raise exception 'NETWORK_CLOSED: ce réseau n''est pas proposé pour le moment. Choisissez-en un autre.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- ─── 2. Inscriptions ───
create or replace function public.guard_signups_open()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  s record;
  kind text := coalesce(new.raw_user_meta_data ->> 'account_type', 'individual');
begin
  select signups_individual, signups_business into s from public.app_settings where id = 1;
  if kind = 'business' and not coalesce(s.signups_business, true) then
    raise exception 'SIGNUPS_CLOSED: les inscriptions des entreprises sont fermées pour le moment.' using errcode = '22023';
  end if;
  if kind <> 'business' and not coalesce(s.signups_individual, true) then
    raise exception 'SIGNUPS_CLOSED: les inscriptions sont fermées pour le moment.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_signups_open() from public, anon, authenticated;
create or replace trigger guard_signups_open before insert on auth.users
  for each row execute function public.guard_signups_open();

-- ─── 3. Limite quotidienne d'un client ───
create or replace function public.set_client_daily_limit(_uid uuid, _limit numeric)
returns numeric language plpgsql security definer set search_path = '' as $$
declare
  v numeric := coalesce(_limit, 9999);
begin
  if not public.has_any_role(auth.uid(), array['admin', 'compliance']::public.app_role[]) then
    raise exception 'Réservé à l''administration et à la conformité.' using errcode = '42501';
  end if;
  if v < 0 or v > 9999 then
    raise exception 'La limite doit être entre 0 et 9 999 $.' using errcode = '22023';
  end if;
  update public.profiles set daily_limit_cad = round(v, 2) where id = _uid;
  if not found then raise exception 'Client introuvable.' using errcode = '22023'; end if;
  return v;
end;
$$;
revoke execute on function public.set_client_daily_limit(uuid, numeric) from public, anon;
grant execute on function public.set_client_daily_limit(uuid, numeric) to authenticated;

-- ─── 4. Délai du taux garanti ───
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

-- ─── 4 bis. Expiration des ventes jamais envoyées : délai réglé ───
create or replace function public.match_sell_deposits()
returns table (order_id uuid, deposit_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  d record;
  t public.orders;
  n int;
  cand uuid;
  near_id uuid;
  near_amt numeric;
  prev public.order_status;
  owner uuid;
  skew constant interval := interval '2 minutes';
  method text;
  why text;
begin
  if not (coalesce(auth.role(), '') = 'service_role' or session_user <> 'authenticator'
          or public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'operator')) then
    raise exception 'Réservé à l''équipe.' using errcode = '42501';
  end if;

  for d in
    select * from public.chain_deposits c
     where c.status = 'new'
        or (c.status in ('review', 'unmatched') and c.handled_by is null and c.match_method is null
            and exists (select 1 from public.orders o where public.tx_key(o.client_tx_hash) = public.tx_key(c.tx_hash)
                          and o.status in ('created', 'awaiting_payment') and (c.order_id is distinct from o.id or c.reason not like 'Transaction%')))
     order by c.block_time
  loop
    method := null; cand := null; why := null;

    -- Adresse d'envoi sanctionnée : jamais de rattachement automatique.
    if public.wallet_sanctioned(d.from_address) then
      update public.chain_deposits set status = 'review',
             reason = 'L''adresse d''envoi ' || d.from_address || ' figure sur la liste des adresses sanctionnées. Ne rien verser ; voir Conformité.'
       where id = d.id;
      continue;
    end if;

    -- 1. Le client a donné l'identifiant de cette transaction.
    select o.* into t from public.orders o
     where o.side = 'sell' and o.network = d.network and o.status in ('created', 'awaiting_payment')
       and public.tx_key(o.client_tx_hash) = public.tx_key(d.tx_hash)
     limit 1;
    if t.id is not null then
      if t.created_at > d.block_time + skew then
        update public.chain_deposits set status = 'review', order_id = t.id,
               reason = 'Transaction envoyée avant la création de la vente OOB-' || upper(left(t.id::text, 8)) || ' : vérifiez que ce client en est bien l''auteur.'
         where id = d.id;
        continue;
      elsif abs(t.usdt_amount - d.usdt_amount) > 0.01 then
        update public.chain_deposits set status = 'review', order_id = t.id,
               reason = 'Transaction donnée par le client, mais montant reçu ' || public.fr_money(d.usdt_amount) || ' USDT au lieu de ' || public.fr_money(t.usdt_amount) || ' USDT.'
         where id = d.id;
        continue;
      end if;
      cand := t.id; method := 'tx_hash';
      why := 'Rattaché par l''identifiant de transaction donné par le client.';
    end if;

    -- Les dépôts déjà examinés ne sont revus que pour la règle 1.
    if cand is null and d.status <> 'new' then continue; end if;

    -- 2. Adresse d'envoi connue d'un seul client, qui a une vente de ce montant ouverte avant l'arrivée.
    if cand is null and d.from_address is not null then
      owner := public.wallet_owner(d.from_address);
      if owner is not null then
        select count(*), min(o.id::text)::uuid into n, cand
          from public.orders o
         where o.side = 'sell' and o.network = d.network and o.status in ('created', 'awaiting_payment')
           and o.user_id = owner
           and o.created_at between d.block_time - interval '48 hours' and d.block_time + skew
           and abs(o.usdt_amount - d.usdt_amount) <= 0.01
           and o.client_tx_hash is null
           and not exists (select 1 from public.chain_deposits x where x.order_id = o.id and x.status = 'matched');
        if n = 1 then
          method := 'known_wallet';
          why := 'Rattaché : envoyé depuis une adresse connue de ce client.';
        else
          cand := null;
        end if;
      end if;
    end if;

    -- 3. Montant et horaire : une seule vente de ce montant, ouverte dans les 2 h avant l'arrivée.
    if cand is null then
      select count(*), min(o.id::text)::uuid into n, cand
        from public.orders o
       where o.side = 'sell' and o.network = d.network and o.status in ('created', 'awaiting_payment')
         and o.created_at between d.block_time - interval '2 hours' and d.block_time + skew
         and abs(o.usdt_amount - d.usdt_amount) <= 0.01
         and o.client_tx_hash is null
         and not exists (select 1 from public.chain_deposits x where x.order_id = o.id and x.status = 'matched');
      if n > 1 then
        update public.chain_deposits set status = 'review',
               reason = 'Plusieurs ventes du même montant sur ce réseau : choisissez la bonne.' where id = d.id;
        continue;
      elsif n = 1 then
        select o.* into t from public.orders o where o.id = cand;
        owner := public.wallet_owner(d.from_address);
        if owner is not null and owner <> t.user_id then
          update public.chain_deposits set status = 'review', order_id = cand,
                 reason = 'Montant et horaire concordent avec OOB-' || upper(left(cand::text, 8)) || ', mais l''adresse d''envoi est connue d''un autre client.'
           where id = d.id;
          continue;
        elsif t.sender_address is not null and lower(t.sender_address) <> lower(coalesce(d.from_address, '')) then
          update public.chain_deposits set status = 'review', order_id = cand,
                 reason = 'Montant et horaire concordent avec OOB-' || upper(left(cand::text, 8)) || ', mais l''envoi ne vient pas de l''adresse déclarée par le client ('
                          || left(t.sender_address, 8) || '…' || right(t.sender_address, 6) || ').'
           where id = d.id;
          continue;
        end if;
        method := 'amount_time';
        why := 'Rattaché : seule vente de ce montant ouverte avant l''arrivée des USDT'
               || case when t.sender_address is not null then ', depuis l''adresse déclarée par le client.' else '.' end;
      else
        cand := null;
      end if;
    end if;

    if cand is not null then
      select o.status into prev from public.orders o where o.id = cand;
      update public.chain_deposits set status = 'matched', order_id = cand, match_method = method, reason = why where id = d.id;
      update public.orders set status = 'payment_received'
       where id = cand and status in ('created', 'awaiting_payment');
      insert into public.order_events (order_id, previous_status, new_status, actor, note)
      values (cand, prev, 'payment_received', 'system',
              'USDT reçus sur la blockchain : ' || public.fr_money(d.usdt_amount) || ' USDT (transaction ' || left(d.tx_hash, 12) || '…). ' || why);
      perform public.note_client_wallet((select o.user_id from public.orders o where o.id = cand), public.wallet_family(d.network), d.from_address, 'deposit', d.block_time);
      order_id := cand; deposit_id := d.id; return next;
      continue;
    end if;

    -- 4. Une vente de ce montant créée APRÈS l'arrivée : jamais automatique (faille fermée).
    select o.id into near_id
      from public.orders o
     where o.side = 'sell' and o.network = d.network and o.status in ('created', 'awaiting_payment')
       and o.created_at between d.block_time + skew and d.block_time + interval '12 hours'
       and abs(o.usdt_amount - d.usdt_amount) <= 0.01
       and not exists (select 1 from public.chain_deposits x where x.order_id = o.id and x.status = 'matched')
     order by o.created_at limit 1;
    if near_id is not null then
      update public.chain_deposits set status = 'review', order_id = near_id,
             reason = 'La vente OOB-' || upper(left(near_id::text, 8)) || ' a été créée après l''arrivée des USDT : vérifiez que ce client en est bien l''auteur (adresse d''envoi, identifiant de transaction).'
       where id = d.id;
      continue;
    end if;

    -- 5. Montant différent : la vente la plus proche ouverte avant l'arrivée (frais d'une plateforme, erreur de saisie…).
    select o.id, o.usdt_amount into near_id, near_amt
      from public.orders o
     where o.side = 'sell' and o.network = d.network and o.status in ('created', 'awaiting_payment')
       and o.created_at between d.block_time - interval '48 hours' and d.block_time + skew
       and abs(o.usdt_amount - d.usdt_amount) <= greatest(5, o.usdt_amount * 0.05)
       and not exists (select 1 from public.chain_deposits x where x.order_id = o.id and x.status = 'matched')
     order by abs(o.usdt_amount - d.usdt_amount) limit 1;
    if near_id is not null then
      update public.chain_deposits set status = 'review', order_id = near_id,
             reason = 'Montant reçu ' || public.fr_money(d.usdt_amount) || ' USDT au lieu de ' || public.fr_money(near_amt)
                      || ' USDT (vente OOB-' || upper(left(near_id::text, 8)) || ').' where id = d.id;
      continue;
    end if;

    if d.block_time < now() - interval '24 hours' then
      update public.chain_deposits set status = 'unmatched',
             reason = 'Aucune vente correspondante dans les 24 heures.' where id = d.id;
    end if;
  end loop;

  -- Ventes jamais confirmées par le client, sans dépôt : expirées après le délai réglé (Réglages › Délais),
  -- 48 h par défaut. La limite du jour est libérée.
  with gone as (
    update public.orders o set status = 'expired'
     where o.side = 'sell' and o.status = 'created' and o.client_sent_at is null
       and o.created_at < now() - make_interval(hours => (select coalesce(s.sell_expiry_hours, 48) from public.app_settings s where s.id = 1))
       and o.created_at > timestamptz '2026-10-15 00:00:00+00'
       and not exists (select 1 from public.chain_deposits x where x.order_id = o.id)
    returning o.id
  )
  insert into public.order_events (order_id, previous_status, new_status, actor, note)
  select gone.id, 'created', 'expired', 'system', 'Expirée : aucun envoi confirmé ni reçu dans le délai.' from gone;
end;
$$;
revoke execute on function public.match_sell_deposits() from public, anon;
grant execute on function public.match_sell_deposits() to authenticated;
