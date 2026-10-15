-- Ventes : savoir avec certitude quel client a envoyé quels USDT.
--
-- Avant : tous les clients envoient à la même adresse, et un dépôt était rattaché à une vente du
-- même montant créée jusqu'à 12 h APRÈS son arrivée. Quelqu'un qui voyait arriver des USDT non
-- rattachés pouvait donc créer une vente du même montant et se les faire attribuer.
--
-- Maintenant :
--   1. La vente est créée AVANT l'envoi (l'app montre l'adresse de dépôt une fois la vente créée).
--      Un dépôt n'est rattaché automatiquement qu'à une vente qui existait déjà à son arrivée ;
--      une vente créée après part « à vérifier ».
--   2. Le client indique d'où il envoie (son adresse, ou la plateforme utilisée), puis peut coller
--      l'identifiant de la transaction. Un dépôt dont la transaction a été donnée par le client se
--      rattache sans doute possible.
--   3. Portefeuilles connus : chaque adresse déclarée par un client, qui lui a envoyé des USDT ou
--      à laquelle Ooble a payé ses achats. Un dépôt venant d'une adresse prouvée d'un seul client
--      est attribué à ce client ; d'une adresse prouvée d'un AUTRE client, il part « à vérifier ».
--      Un envoi qui ne vient pas de l'adresse déclarée part aussi « à vérifier ».
--   4. Les adresses d'envoi sont comparées aux adresses sanctionnées, comme les adresses de réception.
--   5. Une vente jamais confirmée (« J'ai envoyé ») expire après 48 h, sans dépôt reçu.

-- ─── Colonnes ───
alter table public.orders
  add column if not exists sender_address text,
  add column if not exists sender_platform text,
  add column if not exists client_tx_hash text,
  add column if not exists client_sent_at timestamptz;

comment on column public.orders.sender_address is 'Vente : adresse d''où le client déclare envoyer ses USDT.';
comment on column public.orders.sender_platform is 'Vente : plateforme d''échange utilisée pour l''envoi (Binance…), si le client n''envoie pas depuis son propre portefeuille.';
comment on column public.orders.client_tx_hash is 'Vente : identifiant de transaction collé par le client.';
comment on column public.orders.client_sent_at is 'Vente : moment où le client a confirmé « J''ai envoyé mes USDT ».';

alter table public.chain_deposits
  add column if not exists match_method text check (match_method in ('tx_hash', 'known_wallet', 'amount_time', 'manual'));

-- ─── Outils ───
create or replace function public.wallet_family(_net public.usdt_network)
returns text language sql immutable set search_path = '' as $$
  select case _net when 'trc20' then 'tron' when 'spl' then 'solana' else 'evm' end;
$$;

-- Identifiant de transaction comparable : minuscules, sans « 0x » (Tron l'écrit sans).
create or replace function public.tx_key(_tx text)
returns text language sql immutable set search_path = '' as $$
  select nullif(regexp_replace(lower(trim(coalesce(_tx, ''))), '^0x', ''), '');
$$;

create or replace function public.wallet_format_ok(_family text, _address text)
returns boolean language sql immutable set search_path = '' as $$
  select case _family
    when 'evm' then _address ~ '^0x[0-9a-fA-F]{40}$'
    when 'tron' then _address ~ '^T[1-9A-HJ-NP-Za-km-z]{33}$'
    when 'solana' then _address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
    else false end;
$$;

create unique index if not exists orders_client_tx_unique on public.orders (public.tx_key(client_tx_hash)) where client_tx_hash is not null;
create index if not exists chain_deposits_tx_key_idx on public.chain_deposits (public.tx_key(tx_hash));

-- ─── Portefeuilles connus ───
create table if not exists public.client_wallets (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id),
  family text not null check (family in ('evm', 'tron', 'solana')),
  address text not null,
  address_key text generated always as (lower(address)) stored,
  declared_count int not null default 0,
  deposit_count int not null default 0,
  payout_count int not null default 0,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (user_id, address_key)
);
create index if not exists client_wallets_key_idx on public.client_wallets (address_key);
alter table public.client_wallets enable row level security;
create policy "Staff voit les portefeuilles clients" on public.client_wallets for select using (public.is_staff(auth.uid()));
create policy "Client voit ses portefeuilles" on public.client_wallets for select using (auth.uid() = user_id);

comment on table public.client_wallets is 'Portefeuilles connus de chaque client : déclarés à une vente, qui ont envoyé des USDT à Ooble, ou payés par Ooble (achats). Registre : jamais effacé.';

-- _kind : declared · deposit · payout
create or replace function public.note_client_wallet(_user uuid, _family text, _address text, _kind text, _at timestamptz default now())
returns void language plpgsql security definer set search_path = '' as $$
begin
  if _user is null or coalesce(trim(_address), '') = '' or not public.wallet_format_ok(_family, trim(_address)) then return; end if;
  insert into public.client_wallets (user_id, family, address, declared_count, deposit_count, payout_count, first_seen, last_seen)
  values (_user, _family, trim(_address),
          (_kind = 'declared')::int, (_kind = 'deposit')::int, (_kind = 'payout')::int, _at, _at)
  on conflict (user_id, address_key) do update set
    declared_count = public.client_wallets.declared_count + (_kind = 'declared')::int,
    deposit_count = public.client_wallets.deposit_count + (_kind = 'deposit')::int,
    payout_count = public.client_wallets.payout_count + (_kind = 'payout')::int,
    first_seen = least(public.client_wallets.first_seen, _at),
    last_seen = greatest(public.client_wallets.last_seen, _at);
end;
$$;
revoke execute on function public.note_client_wallet(uuid, text, text, text, timestamptz) from public, anon, authenticated;

-- Le client à qui appartient une adresse, s'il n'y en a qu'un (sinon null). Seules comptent les adresses
-- prouvées (elle a déjà envoyé des USDT pour ce client, ou Ooble y a payé ses achats) : une simple
-- déclaration ne suffit pas, n'importe qui pouvant déclarer l'adresse publique d'un autre.
create or replace function public.wallet_owner(_address text)
returns uuid language sql stable security definer set search_path = '' as $$
  select case when count(distinct user_id) = 1 then min(user_id::text)::uuid end
    from public.client_wallets
   where address_key = lower(trim(coalesce(_address, ''))) and (deposit_count > 0 or payout_count > 0);
$$;
revoke execute on function public.wallet_owner(text) from public, anon, authenticated;

create or replace function public.wallet_sanctioned(_address text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.compliance_sanction_entries e
     where e.kind = 'wallet' and lower(e.wallet) = lower(trim(coalesce(_address, '')))
       and e.list_id in (select distinct on (source) id from public.compliance_sanction_lists where status = 'loaded' order by source, loaded_at desc)
  );
$$;
revoke execute on function public.wallet_sanctioned(text) from public, anon, authenticated;

-- Vente : adresse d'envoi vérifiée et notée dès la création ; achat : adresse de réception notée.
create or replace function public.orders_note_wallets()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  fam text := public.wallet_family(new.network);
begin
  if tg_op = 'INSERT' and new.side = 'sell' then
    new.sender_address := nullif(trim(coalesce(new.sender_address, '')), '');
    new.sender_platform := nullif(left(trim(coalesce(new.sender_platform, '')), 60), '');
    new.client_tx_hash := null;
    new.client_sent_at := null;
    if new.sender_address is not null and new.network is not null and not public.wallet_format_ok(fam, new.sender_address) then
      raise exception 'L''adresse d''envoi n''a pas le bon format pour ce réseau.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
create or replace trigger orders_note_wallets before insert on public.orders
  for each row execute function public.orders_note_wallets();

create or replace function public.orders_note_wallets_after()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.network is null then return new; end if;
  if new.side = 'sell' and new.sender_address is not null then
    perform public.note_client_wallet(new.user_id, public.wallet_family(new.network), new.sender_address, 'declared', new.created_at);
  elsif new.side = 'buy' and new.wallet_address is not null then
    perform public.note_client_wallet(new.user_id, public.wallet_family(new.network), new.wallet_address, 'payout', new.created_at);
  end if;
  return new;
end;
$$;
create or replace trigger orders_note_wallets_after after insert on public.orders
  for each row execute function public.orders_note_wallets_after();

-- ─── Le client confirme son envoi (et donne, s'il l'a, l'identifiant de transaction) ───
create or replace function public.declare_sell_sent(_order uuid, _tx text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  t text := nullif(trim(coalesce(_tx, '')), '');
  fam text;
begin
  select * into o from public.orders where id = _order for update;
  if o.id is null or o.user_id is distinct from auth.uid() or o.side <> 'sell' then
    raise exception 'Vente introuvable.' using errcode = '42501';
  end if;
  if o.status not in ('created', 'awaiting_payment') then
    raise exception 'Cette vente est déjà traitée.' using errcode = '22023';
  end if;
  fam := public.wallet_family(o.network);
  if t is not null then
    if (fam = 'evm' and t !~ '^(0x)?[0-9a-fA-F]{64}$') or (fam = 'tron' and t !~ '^(0x)?[0-9a-fA-F]{64}$')
       or (fam = 'solana' and t !~ '^[1-9A-HJ-NP-Za-km-z]{80,90}$') then
      raise exception 'Cet identifiant de transaction n''a pas le bon format.' using errcode = '22023';
    end if;
    if fam = 'evm' then t := '0x' || regexp_replace(lower(t), '^0x', ''); elsif fam = 'tron' then t := regexp_replace(lower(t), '^0x', ''); end if;
    if o.client_tx_hash is not null and public.tx_key(o.client_tx_hash) <> public.tx_key(t) then
      raise exception 'Un autre identifiant est déjà enregistré pour cette vente. Écrivez-nous s''il faut le corriger.' using errcode = '22023';
    end if;
    if exists (select 1 from public.orders x where x.id <> o.id and public.tx_key(x.client_tx_hash) = public.tx_key(t))
       or exists (select 1 from public.chain_deposits d where public.tx_key(d.tx_hash) = public.tx_key(t) and d.status = 'matched' and d.order_id <> o.id) then
      raise exception 'Cette transaction est déjà associée à une autre vente.' using errcode = '22023';
    end if;
  end if;
  update public.orders set
    client_tx_hash = coalesce(t, client_tx_hash),
    client_sent_at = coalesce(client_sent_at, now()),
    status = case when status = 'created' then 'awaiting_payment'::public.order_status else status end
   where id = o.id;
  if t is not null and o.client_tx_hash is null then
    insert into public.order_events (order_id, previous_status, new_status, actor, note)
    values (o.id, o.status, case when o.status = 'created' then 'awaiting_payment'::public.order_status else o.status end, auth.uid()::text,
            'Le client a donné l''identifiant de transaction ' || left(t, 14) || '…');
  elsif o.client_sent_at is null then
    insert into public.order_events (order_id, previous_status, new_status, actor, note)
    values (o.id, o.status, 'awaiting_payment', auth.uid()::text, 'Le client indique avoir envoyé ses USDT.');
  end if;
end;
$$;
revoke execute on function public.declare_sell_sent(uuid, text) from public, anon;
grant execute on function public.declare_sell_sent(uuid, text) to authenticated;

-- ─── Rapprochement ───
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

  -- Ventes jamais confirmées par le client, sans dépôt : expirées après 48 h (la limite du jour est libérée).
  with gone as (
    update public.orders o set status = 'expired'
     where o.side = 'sell' and o.status = 'created' and o.client_sent_at is null
       and o.created_at < now() - interval '48 hours' and o.created_at > timestamptz '2026-10-15 00:00:00+00'
       and not exists (select 1 from public.chain_deposits x where x.order_id = o.id)
    returning o.id
  )
  insert into public.order_events (order_id, previous_status, new_status, actor, note)
  select gone.id, 'created', 'expired', 'system', 'Expirée : aucun envoi confirmé ni reçu en 48 heures.' from gone;
end;
$$;
revoke execute on function public.match_sell_deposits() from public, anon;
grant execute on function public.match_sell_deposits() to authenticated;

-- Rattachement à la main : méthode notée, portefeuille noté.
create or replace function public.attach_chain_deposit(_deposit uuid, _order uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.chain_deposits;
  o public.orders;
begin
  if not (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'operator')) then
    raise exception 'Réservé à l''équipe.' using errcode = '42501';
  end if;
  select * into d from public.chain_deposits where id = _deposit for update;
  if d.id is null or d.status = 'matched' then raise exception 'Dépôt introuvable ou déjà rattaché.'; end if;
  select * into o from public.orders where id = _order for update;
  if o.id is null or o.side <> 'sell' or o.network <> d.network then raise exception 'Vente introuvable ou réseau différent.'; end if;
  if o.status not in ('created', 'awaiting_payment', 'expired') then raise exception 'La vente est déjà « % ».', o.status; end if;
  if exists (select 1 from public.chain_deposits x where x.order_id = o.id and x.status = 'matched') then
    raise exception 'Cette vente a déjà un dépôt rattaché.';
  end if;
  update public.chain_deposits set status = 'matched', order_id = o.id, handled_by = auth.uid(), match_method = 'manual',
         reason = 'Rattaché à la main par l''équipe.' where id = d.id;
  update public.orders set status = 'payment_received' where id = o.id;
  insert into public.order_events (order_id, previous_status, new_status, actor, note)
  values (o.id, o.status, 'payment_received', auth.uid()::text,
          'USDT reçus (rattachés à la main) : ' || public.fr_money(d.usdt_amount) || ' USDT (transaction ' || left(d.tx_hash, 12) || '…)');
  perform public.note_client_wallet(o.user_id, public.wallet_family(d.network), d.from_address, 'deposit', d.block_time);
end;
$$;
revoke execute on function public.attach_chain_deposit(uuid, uuid) from public, anon;
grant execute on function public.attach_chain_deposit(uuid, uuid) to authenticated;

-- ─── Sanctions : les adresses d'envoi aussi ───
create or replace function public.compliance_sanctions_screen()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  created int := 0;
  n int;
begin
  -- Noms : tous les mots du nom du client figurent dans un nom de la liste, ou l'inverse (au moins deux mots).
  insert into public.compliance_alerts (type, dedupe_key, user_id, amount_cad, reason, occurred_at)
  with cur as materialized (
    select distinct on (source) id from public.compliance_sanction_lists where status = 'loaded' order by source, loaded_at desc
  ), c as materialized (
    select p.id, coalesce(nullif(trim(p.full_name), ''), p.business_name) as client,
           public.name_tokens(coalesce(nullif(trim(p.full_name), ''), p.business_name)) as t
      from public.profiles p
  ), m as (
    select c.id as user_id, c.client, e.source, e.ref, e.name as listed
      from c join public.compliance_sanction_entries e
        on e.list_id in (select id from cur) and e.kind <> 'wallet' and e.tokens @> c.t
     where cardinality(c.t) >= 2
    union
    select c.id, c.client, e.source, e.ref, e.name
      from c join public.compliance_sanction_entries e
        on e.list_id in (select id from cur) and e.kind <> 'wallet' and cardinality(e.tokens) >= 2 and e.tokens <@ c.t
     where cardinality(c.t) >= 2
  )
  select 'sanctions', 'sanction:' || m.user_id || ':' || md5(string_agg(distinct m.source || m.ref, ',' order by m.source || m.ref)),
         m.user_id, 0,
         'Le nom « ' || min(m.client) || ' » correspond à ' || count(distinct m.source || m.ref) || ' inscription'
           || case when count(distinct m.source || m.ref) > 1 then 's' else '' end || ' sur les listes de sanctions : '
           || string_agg(distinct '« ' || m.listed || ' » (' || case m.source when 'canada' then 'Canada' else 'ONU' end || ', ' || coalesce(m.ref, '?') || ')', ' ; ')
           || '. À vérifier avec la pièce d''identité (date de naissance, pays). S''il s''agit de la même personne : ne rien dire au client, bloquer ses opérations et déclarer (DBT) sans délai.',
         now()
    from m
   group by m.user_id
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count; created := created + n;

  -- Portefeuilles : adresse de réception d'un client, adresse payée par Ooble, adresse d'envoi déclarée ou constatée.
  insert into public.compliance_alerts (type, dedupe_key, order_id, order_ids, user_id, amount_cad, reason, occurred_at)
  with cur as materialized (
    select distinct on (source) id from public.compliance_sanction_lists where status = 'loaded' order by source, loaded_at desc
  ), w as (
    select o.id, o.user_id, o.cad_amount, o.created_at, trim(o.wallet_address) as addr, 'de réception' as role from public.orders o where o.wallet_address is not null and o.side = 'buy'
    union
    select o.id, o.user_id, o.cad_amount, o.created_at, trim(p.to_address), 'de réception' from public.usdt_payouts p join public.orders o on o.id = p.order_id where p.to_address is not null
    union
    select o.id, o.user_id, o.cad_amount, o.created_at, trim(o.sender_address), 'd''envoi' from public.orders o where o.sender_address is not null
    union
    select o.id, o.user_id, o.cad_amount, d.block_time, trim(d.from_address), 'd''envoi' from public.chain_deposits d join public.orders o on o.id = d.order_id where d.from_address is not null
  )
  select distinct on (w.id) 'sanctions', 'wallet:' || w.id, w.id, array[w.id], w.user_id, w.cad_amount,
         'L''adresse ' || w.role || ' ' || w.addr || ' de la commande OOB-' || upper(left(w.id::text, 8)) || ' figure sur la liste des adresses sanctionnées ('
           || e.network || ', OFAC). Ne rien envoyer ni verser, ne rien dire au client, et déclarer (DOT, et DBT si le client est lui-même visé).',
         w.created_at
    from w join public.compliance_sanction_entries e
      on e.list_id in (select id from cur) and e.kind = 'wallet' and lower(e.wallet) = lower(w.addr)
   order by w.id
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count; created := created + n;

  -- Dépôts reçus d'une adresse sanctionnée sans vente rattachée.
  insert into public.compliance_alerts (type, dedupe_key, amount_cad, reason, occurred_at)
  with cur as materialized (
    select distinct on (source) id from public.compliance_sanction_lists where status = 'loaded' order by source, loaded_at desc
  )
  select distinct on (d.id) 'sanctions', 'wallet-deposit:' || d.id, 0,
         'Des USDT (' || public.fr_money(d.usdt_amount) || ') sont arrivés depuis l''adresse sanctionnée ' || d.from_address
           || ' (transaction ' || left(d.tx_hash, 14) || '…), sans vente rattachée. Ne rien verser et déclarer (DOT).',
         d.block_time
    from public.chain_deposits d join public.compliance_sanction_entries e
      on e.list_id in (select id from cur) and e.kind = 'wallet' and lower(e.wallet) = lower(trim(d.from_address))
   where d.order_id is null and d.from_address is not null
   order by d.id
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count; created := created + n;
  return created;
end;
$function$;

-- ─── Reprise de l'existant ───
select public.note_client_wallet(o.user_id, public.wallet_family(o.network), o.wallet_address, 'payout', o.created_at)
  from public.orders o where o.side = 'buy' and o.wallet_address is not null and o.network is not null;
select public.note_client_wallet(o.user_id, public.wallet_family(d.network), d.from_address, 'deposit', d.block_time)
  from public.chain_deposits d join public.orders o on o.id = d.order_id where d.status = 'matched' and d.from_address is not null;
update public.chain_deposits set match_method = case when handled_by is not null then 'manual' else 'amount_time' end
 where status = 'matched' and match_method is null;
