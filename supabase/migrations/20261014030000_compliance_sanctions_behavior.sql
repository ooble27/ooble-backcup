-- Conformité : filtrage des sanctions (listes officielles lues chaque jour) et comportements inhabituels.
--  * Canada : Liste consolidée des sanctions autonomes (LMES).
--  * ONU : Liste récapitulative du Conseil de sécurité (appliquée au Canada par la Loi sur les Nations Unies).
--  * Adresses de monnaie virtuelle sanctionnées : liste SDN de l'OFAC (seule liste publique d'adresses).
-- Rien ne s'efface : chaque version d'une liste est gardée, avec la date où elle a été vérifiée.
create extension if not exists unaccent with schema extensions;

create or replace function public.name_tokens(t text)
returns text[] language sql stable set search_path to 'public', 'extensions' as $$
  select coalesce(array(
    select distinct w from unnest(regexp_split_to_array(lower(extensions.unaccent(coalesce(t, ''))), '[^a-z]+')) w
    where length(w) >= 2 order by w), '{}')
$$;

create table if not exists public.compliance_sanction_lists (
  id bigserial primary key,
  source text not null check (source in ('canada', 'onu', 'ofac_wallets')),
  request_id bigint,
  status text not null default 'pending' check (status in ('pending', 'loaded', 'unchanged', 'error')),
  content_hash text,
  entries int,
  error text,
  fetched_at timestamptz not null default now(),
  loaded_at timestamptz
);

create table if not exists public.compliance_sanction_entries (
  id bigserial primary key,
  list_id bigint not null references public.compliance_sanction_lists(id),
  source text not null,
  kind text not null check (kind in ('person', 'entity', 'wallet')),
  name text,
  tokens text[] not null default '{}',
  wallet text,
  network text,
  ref text,
  country text,
  listed_on text
);
create index if not exists compliance_sanction_entries_tokens on public.compliance_sanction_entries using gin (tokens);
create index if not exists compliance_sanction_entries_wallet on public.compliance_sanction_entries (lower(wallet)) where wallet is not null;
create index if not exists compliance_sanction_entries_list on public.compliance_sanction_entries (list_id);

alter table public.compliance_sanction_lists enable row level security;
alter table public.compliance_sanction_entries enable row level security;
create policy sanction_lists_staff_read on public.compliance_sanction_lists for select
  using (public.has_any_role(auth.uid(), array['admin', 'compliance']::public.app_role[]));
create policy sanction_entries_staff_read on public.compliance_sanction_entries for select
  using (public.has_any_role(auth.uid(), array['admin', 'compliance']::public.app_role[]));

-- Version en vigueur de chaque liste (consultation).
create or replace view public.compliance_sanctions_current with (security_invoker = true) as
  select e.* from public.compliance_sanction_entries e
  where e.list_id in (select distinct on (source) id from public.compliance_sanction_lists where status = 'loaded' order by source, loaded_at desc);

-- 1. Demande les trois listes (réponses lues par compliance_sanctions_load).
create or replace function public.compliance_sanctions_fetch()
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  insert into public.compliance_sanction_lists (source, request_id) values
    ('canada', net.http_get('https://www.international.gc.ca/world-monde/assets/office_docs/international_relations-relations_internationales/sanctions/sema-lmes.xml', timeout_milliseconds := 60000)),
    ('onu', net.http_get('https://scsanctions.un.org/resources/xml/en/consolidated.xml', timeout_milliseconds := 60000)),
    ('ofac_wallets', net.http_get('https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML', timeout_milliseconds := 120000));
end;
$function$;

-- 2. Lit les réponses reçues ; une liste identique à la précédente est seulement marquée « vérifiée ».
create or replace function public.compliance_sanctions_load()
returns int language plpgsql security definer set search_path to 'public', 'extensions' as $function$
declare
  l record;
  resp record;
  h text;
  doc xml;
  n int;
  total int := 0;
begin
  for l in select * from public.compliance_sanction_lists where status = 'pending' order by id loop
    select status_code, content, error_msg into resp from net._http_response where id = l.request_id;
    if not found then
      if l.fetched_at < now() - interval '1 hour' then
        update public.compliance_sanction_lists set status = 'error', error = 'Aucune réponse', loaded_at = now() where id = l.id;
      end if;
      continue;
    end if;
    if resp.status_code is distinct from 200 or resp.content is null then
      update public.compliance_sanction_lists set status = 'error', error = coalesce(resp.error_msg, 'HTTP ' || resp.status_code), loaded_at = now() where id = l.id;
      continue;
    end if;
    h := md5(resp.content);
    if h = (select content_hash from public.compliance_sanction_lists where source = l.source and status = 'loaded' order by loaded_at desc limit 1) then
      update public.compliance_sanction_lists set status = 'unchanged', content_hash = h, loaded_at = now() where id = l.id;
      continue;
    end if;

    begin
      if l.source = 'canada' then
        doc := xmlparse(document resp.content);
        insert into public.compliance_sanction_entries (list_id, source, kind, name, tokens, ref, country, listed_on)
        select l.id, 'canada', case when x.entity is not null and x.last is null and x.given is null then 'entity' else 'person' end,
               nm, public.name_tokens(nm), x.sched || ' · ' || x.item, x.country, x.listed
          from xmltable('/data-set/record' passing doc columns
                 last text path 'LastName-NomDeFamille', given text path 'GivenName-Prenom', entity text path 'EntityOrShip-EntiteOuNavire',
                 aliases text path 'Aliases-Alias', country text path 'Country-Pays', listed text path 'DateOfListing-DateDinscription',
                 sched text path 'Schedule-Annexe', item text path 'Item-NumeroDarticle') x,
               lateral (select coalesce(nullif(trim(concat_ws(' ', x.given, x.last)), ''), x.entity) as nm
                        union select trim(a) from unnest(string_to_array(x.aliases, ';')) a where length(trim(a)) > 2) names
         where nm is not null and cardinality(public.name_tokens(nm)) >= 1;
      elsif l.source = 'onu' then
        doc := xmlparse(document resp.content);
        insert into public.compliance_sanction_entries (list_id, source, kind, name, tokens, ref, listed_on)
        select l.id, 'onu', 'person', nm, public.name_tokens(nm), x.ref, x.listed
          from xmltable('/CONSOLIDATED_LIST/INDIVIDUALS/INDIVIDUAL' passing doc columns
                 n1 text path 'FIRST_NAME', n2 text path 'SECOND_NAME', n3 text path 'THIRD_NAME', n4 text path 'FOURTH_NAME',
                 ref text path 'REFERENCE_NUMBER', listed text path 'LISTED_ON') x,
               lateral (select trim(concat_ws(' ', x.n1, x.n2, x.n3, x.n4)) as nm) names
         where nm <> '';
        insert into public.compliance_sanction_entries (list_id, source, kind, name, tokens, ref)
        select l.id, 'onu', 'person', x.alias, public.name_tokens(x.alias), x.ref
          from xmltable('/CONSOLIDATED_LIST/INDIVIDUALS/INDIVIDUAL/INDIVIDUAL_ALIAS' passing doc columns
                 alias text path 'ALIAS_NAME', quality text path 'QUALITY', ref text path '../REFERENCE_NUMBER') x
         where coalesce(x.alias, '') <> '' and coalesce(x.quality, '') <> 'Low';
        insert into public.compliance_sanction_entries (list_id, source, kind, name, tokens, ref, listed_on)
        select l.id, 'onu', 'entity', x.nm, public.name_tokens(x.nm), x.ref, x.listed
          from xmltable('/CONSOLIDATED_LIST/ENTITIES/ENTITY' passing doc columns
                 nm text path 'FIRST_NAME', ref text path 'REFERENCE_NUMBER', listed text path 'LISTED_ON') x
         where coalesce(x.nm, '') <> '';
        insert into public.compliance_sanction_entries (list_id, source, kind, name, tokens, ref)
        select l.id, 'onu', 'entity', x.alias, public.name_tokens(x.alias), x.ref
          from xmltable('/CONSOLIDATED_LIST/ENTITIES/ENTITY/ENTITY_ALIAS' passing doc columns
                 alias text path 'ALIAS_NAME', ref text path '../REFERENCE_NUMBER') x
         where coalesce(x.alias, '') <> '';
      else
        insert into public.compliance_sanction_entries (list_id, source, kind, name, wallet, network, ref)
        select l.id, 'ofac_wallets', 'wallet', 'Adresse sanctionnée (OFAC SDN)', m[2], m[1], 'OFAC ' || m[1]
          from regexp_matches(resp.content, '<idType>Digital Currency Address - ([A-Z0-9]+)</idType>\s*<idNumber>([^<]+)</idNumber>', 'g') m;
      end if;
      get diagnostics n = row_count;
      update public.compliance_sanction_lists set status = 'loaded', content_hash = h, loaded_at = now(),
        entries = (select count(*) from public.compliance_sanction_entries where list_id = l.id) where id = l.id;
      total := total + 1;
    exception when others then
      update public.compliance_sanction_lists set status = 'error', error = sqlerrm, loaded_at = now() where id = l.id;
    end;
  end loop;
  return total;
end;
$function$;

-- 3. Compare chaque client et chaque adresse de portefeuille aux listes en vigueur.
create or replace function public.compliance_sanctions_screen()
returns int language plpgsql security definer set search_path to 'public' as $function$
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

  -- Portefeuilles : adresse de réception d'un client ou adresse payée par Ooble.
  insert into public.compliance_alerts (type, dedupe_key, order_id, order_ids, user_id, amount_cad, reason, occurred_at)
  with cur as materialized (
    select distinct on (source) id from public.compliance_sanction_lists where status = 'loaded' order by source, loaded_at desc
  ), w as (
    select o.id, o.user_id, o.cad_amount, o.created_at, trim(o.wallet_address) as addr from public.orders o where o.wallet_address is not null
    union
    select o.id, o.user_id, o.cad_amount, o.created_at, trim(p.to_address) from public.usdt_payouts p join public.orders o on o.id = p.order_id where p.to_address is not null
  )
  select distinct on (w.id) 'sanctions', 'wallet:' || w.id, w.id, array[w.id], w.user_id, w.cad_amount,
         'L''adresse ' || w.addr || ' de la commande OOB-' || upper(left(w.id::text, 8)) || ' figure sur la liste des adresses sanctionnées ('
           || e.network || ', OFAC). Ne rien envoyer à cette adresse, ne rien dire au client, et déclarer (DOT, et DBT si le client est lui-même visé).',
         w.created_at
    from w join public.compliance_sanction_entries e
      on e.list_id in (select id from cur) and e.kind = 'wallet' and lower(e.wallet) = lower(w.addr)
   order by w.id
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count; created := created + n;
  return created;
end;
$function$;

revoke execute on function public.compliance_sanctions_fetch() from anon, authenticated, public;
revoke execute on function public.compliance_sanctions_load() from anon, authenticated, public;
revoke execute on function public.compliance_sanctions_screen() from anon, authenticated, public;

-- Surveillance continue : comportements inhabituels à examiner (opération douteuse possible).
create or replace function public.compliance_scan_behavior()
returns int language plpgsql security definer set search_path to '' as $function$
declare
  created int := 0;
  n int;
begin
  -- Compte tout neuf, gros montant : origine des fonds et but de l'opération à comprendre.
  insert into public.compliance_alerts (type, dedupe_key, order_id, order_ids, user_id, amount_cad, reason, occurred_at)
  select 'dot', 'nouveau_compte:' || x.id, x.id, array[x.id], x.user_id, x.cad,
         'Compte ouvert ' || greatest(0, (x.received_at::date - p.created_at::date)) || ' j avant '
           || case when x.side = 'sell' then 'une vente' else 'un achat' end || ' de ' || public.fr_money(x.cad)
           || ' $ CA. À examiner : origine des fonds, but de l''opération, cohérence avec le profil du client.',
         x.received_at
    from public.compliance_ops() x
    join public.profiles p on p.id = x.user_id
   where x.cad >= 3000 and x.received_at < p.created_at + interval '7 days'
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count; created := created + n;

  -- Hausse brusque : au moins 5 fois la moyenne des opérations des 6 derniers mois (3 opérations ou plus).
  insert into public.compliance_alerts (type, dedupe_key, order_id, order_ids, user_id, amount_cad, reason, occurred_at)
  select 'dot', 'hausse:' || x.id, x.id, array[x.id], x.user_id, x.cad,
         'Opération de ' || public.fr_money(x.cad) || ' $ CA, ' || round(x.cad / h.avg_cad) || ' fois la moyenne habituelle de ce client ('
           || public.fr_money(h.avg_cad) || ' $ sur ' || h.n || ' opérations en 6 mois). À examiner : changement de situation ou d''usage du compte ?',
         x.received_at
    from public.compliance_ops() x
    join lateral (
      select count(*) as n, avg(y.cad) as avg_cad from public.compliance_ops() y
       where y.user_id = x.user_id and y.received_at < x.received_at and y.received_at >= x.received_at - interval '180 days'
    ) h on h.n >= 3 and h.avg_cad > 0
   where x.cad >= 3000 and x.cad >= 5 * h.avg_cad
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count; created := created + n;
  return created;
end;
$function$;
revoke execute on function public.compliance_scan_behavior() from anon, authenticated, public;

-- « Analyser maintenant » et la tâche planifiée lancent tout : règles CANAFE, comportements, sanctions.
create or replace function public.compliance_scan_all()
returns int language plpgsql security definer set search_path to '' as $function$
declare
  n int := 0;
begin
  if not (public.has_any_role(auth.uid(), array['admin','compliance']::public.app_role[])
          or coalesce(auth.role(), '') = 'service_role'
          or session_user <> 'authenticator') then
    raise exception 'Réservé à la conformité.' using errcode = '42501';
  end if;
  n := n + public.compliance_scan();
  n := n + public.compliance_scan_behavior();
  perform public.compliance_sanctions_load();
  n := n + public.compliance_sanctions_screen();
  return n;
end;
$function$;
revoke execute on function public.compliance_scan_all() from anon, public;
grant execute on function public.compliance_scan_all() to authenticated;

-- Listes téléchargées chaque jour ; tout le reste tourne toutes les 10 minutes.
select cron.schedule('sanctions-fetch', '7 6 * * *', 'select public.compliance_sanctions_fetch();');
select cron.schedule('compliance-scan', '*/10 * * * *', 'select public.compliance_scan_all();');
