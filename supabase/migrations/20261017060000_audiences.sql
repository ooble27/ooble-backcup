-- Audiences : des groupes de clients enregistrés, décrits par quelques règles simples, réutilisables
-- dans les campagnes de courriels, les notifications et les messages dans l'app.
--
-- Règles (rules, jsonb ; une clé absente = pas de filtre) :
--   verified      'yes' | 'no'            identité ou entreprise vérifiée
--   account       'individual' | 'business'
--   orders        'none' | 'some'         au moins une commande terminée
--   inactive_days n                       dernière commande terminée il y a plus de n jours
--   joined_days   n                       inscrit depuis moins de n jours
--   lang          'fr' | 'en'
--   region        'QC', 'ON'…             province d'inscription
--   source        texte                   d'où vient l'inscription (lien suivi, réseau…)
--   min_volume    n                       volume terminé d'au moins n $

create table if not exists public.audiences (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 60),
  rules jsonb not null default '{}'::jsonb,
  archived boolean not null default false,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.audiences enable row level security;
create policy "Audiences : équipe marketing" on public.audiences for all to authenticated
  using (public.has_any_role(auth.uid(), array['admin','marketing']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','marketing']::public.app_role[]));

-- Les comptes ouverts qui répondent aux règles.
create or replace function public.audience_match(_rules jsonb)
 returns table(user_id uuid)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select p.id
    from public.profiles p
    left join public.signup_origins so on so.user_id = p.id
    left join lateral (
      select count(*) as n, max(o.updated_at) as last_at, coalesce(sum(o.cad_amount), 0) as vol
        from public.orders o where o.user_id = p.id and o.status = 'completed'
    ) st on true
   where p.closed_at is null
     and (_rules->>'verified' is null
          or (_rules->>'verified' = 'yes') = (p.kyc_status::text = 'approved' or coalesce(p.business_status::text, '') = 'approved'))
     and (_rules->>'account' is null or coalesce(p.account_type::text, 'individual') = _rules->>'account')
     and (_rules->>'orders' is null or (_rules->>'orders' = 'none' and st.n = 0) or (_rules->>'orders' = 'some' and st.n > 0))
     and (_rules->>'inactive_days' is null
          or (st.last_at is not null and st.last_at < now() - make_interval(days => (_rules->>'inactive_days')::int)))
     and (_rules->>'joined_days' is null or p.created_at >= now() - make_interval(days => (_rules->>'joined_days')::int))
     and (_rules->>'lang' is null or coalesce(nullif(p.preferred_lang, ''), 'fr') = _rules->>'lang')
     and (_rules->>'region' is null or upper(coalesce(so.region, '')) = upper(_rules->>'region'))
     and (_rules->>'source' is null or so.source ilike _rules->>'source')
     and (_rules->>'min_volume' is null or st.vol >= (_rules->>'min_volume')::numeric);
$function$;
revoke execute on function public.audience_match(jsonb) from public, anon, authenticated;

-- Aperçu pendant qu'on règle une audience : combien de personnes, et quelques noms.
create or replace function public.audience_preview(_rules jsonb)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
begin
  if not public.has_any_role(auth.uid(), array['admin','marketing']::public.app_role[]) then
    raise exception 'Réservé à l''équipe marketing.' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'people', count(*),
      'verified', count(*) filter (where p.kyc_status::text = 'approved' or coalesce(p.business_status::text, '') = 'approved'),
      'push', count(*) filter (where exists (select 1 from public.push_subscriptions s where s.user_id = m.user_id)),
      'sample', coalesce((select jsonb_agg(x.nm) from (
                  select coalesce(nullif(trim(p2.full_name), ''), p2.email) as nm
                    from public.audience_match(_rules) m2 join public.profiles p2 on p2.id = m2.user_id
                   order by p2.created_at desc limit 6) x), '[]'::jsonb)
    )
    from public.audience_match(_rules) m join public.profiles p on p.id = m.user_id
  );
end;
$function$;
revoke execute on function public.audience_preview(jsonb) from public, anon;
grant execute on function public.audience_preview(jsonb) to authenticated;

-- Les membres d'une audience enregistrée (pour composer une campagne de courriels).
create or replace function public.audience_members(_id uuid)
 returns table(user_id uuid)
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
begin
  if not public.has_any_role(auth.uid(), array['admin','marketing']::public.app_role[]) then
    raise exception 'Réservé à l''équipe marketing.' using errcode = '42501';
  end if;
  return query select m.user_id from public.audiences a, public.audience_match(a.rules) m where a.id = _id;
end;
$function$;
revoke execute on function public.audience_members(uuid) from public, anon;
grant execute on function public.audience_members(uuid) to authenticated;

-- Notifications et messages dans l'app : une audience enregistrée s'écrit « aud:<id> ».
alter table public.push_campaigns add column if not exists audience_id uuid references public.audiences (id);
alter table public.app_messages add column if not exists audience_id uuid references public.audiences (id);

create or replace function public.notif_audience(_aud text)
 returns table(user_id uuid, lang text, staff boolean)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select p.id, coalesce(nullif(p.preferred_lang, ''), 'fr'),
         exists (select 1 from public.user_roles r where r.user_id = p.id)
    from public.profiles p
   where p.closed_at is null
     and case
       when _aud = 'all' then true
       when _aud = 'verified' then p.kyc_status::text = 'approved'
       when _aud = 'unverified' then p.kyc_status::text <> 'approved'
       when _aud = 'staff' then exists (select 1 from public.user_roles r where r.user_id = p.id)
       when _aud like 'aud:%' then p.id in (
         select m.user_id from public.audiences a, public.audience_match(a.rules) m
          where a.id::text = substr(_aud, 5))
       else false end;
$function$;

create or replace function public.my_app_message()
 returns table(id uuid, title text, body text, cta text, url text)
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  uid uuid := auth.uid();
  en boolean;
  open_to_clients boolean;
begin
  if uid is null then return; end if;
  select coalesce(p.preferred_lang, 'fr') = 'en' into en from public.profiles p where p.id = uid;
  select coalesce(m.client_sends, false) into open_to_clients from public.marketing_settings m where m.id = 1;
  return query
    select a.id,
           case when en and nullif(a.title_en, '') is not null then a.title_en else a.title_fr end,
           case when en and nullif(a.title_en, '') is not null then a.body_en else a.body_fr end,
           case when en and nullif(a.title_en, '') is not null then a.cta_en else a.cta_fr end,
           a.url
      from public.app_messages a
      join public.notif_audience(case when a.audience_id is not null then 'aud:' || a.audience_id::text else a.audience end) aud
        on aud.user_id = uid
     where a.active and a.starts_at <= now() and (a.ends_at is null or a.ends_at > now())
       and (coalesce(open_to_clients, false) or aud.staff)
       and not exists (select 1 from public.app_message_events e where e.message_id = a.id and e.user_id = uid and e.kind = 'dismiss')
     order by a.starts_at desc
     limit 1;
end;
$function$;
