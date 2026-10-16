-- Marketing, étape 3 : notifications push et messages dans l'app.
--
-- • push_campaigns : une notification envoyée aux téléphones abonnés d'un public (fonction
--   push-campaign, chaque minute). Mêmes garde-fous que les courriels : tant que « Envois aux
--   clients » est coupé, seule l'équipe reçoit ; une notification programmée attend les « Envois
--   automatiques ». Les touchers sont comptés quand l'app s'ouvre depuis la notification.
-- • app_messages : un message affiché en haut de l'accueil de l'app client, entre deux dates, pour
--   un public. Tant que « Envois aux clients » est coupé, seule l'équipe le voit.
--   app_message_events garde qui l'a vu, touché ou fermé (une fois chacun).

create table if not exists public.push_campaigns (
  id uuid primary key default gen_random_uuid(),
  title_fr text not null check (char_length(title_fr) between 1 and 80),
  body_fr text not null check (char_length(body_fr) between 1 and 240),
  title_en text check (char_length(title_en) <= 80),
  body_en text check (char_length(body_en) <= 240),
  url text not null default '/app' check (url ~ '^/[A-Za-z0-9/_?=&%.-]*$'),
  audience text not null check (audience in ('all', 'verified', 'unverified', 'staff')),
  status text not null default 'scheduled' check (status in ('scheduled', 'sending', 'sent', 'cancelled')),
  scheduled_at timestamptz not null default now(),
  is_test boolean not null default false,
  people int not null default 0,
  devices int not null default 0,
  sent int not null default 0,
  failed int not null default 0,
  blocked int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid,
  created_by_name text,
  finished_at timestamptz
);
alter table public.push_campaigns enable row level security;
create policy "Marketing lit les notifications" on public.push_campaigns
  for select to authenticated using (has_any_role(auth.uid(), array['admin','marketing']::app_role[]));
create policy "Marketing crée les notifications" on public.push_campaigns
  for insert to authenticated with check (has_any_role(auth.uid(), array['admin','marketing']::app_role[]) and status = 'scheduled');
create policy "Marketing annule une notification" on public.push_campaigns
  for update to authenticated using (has_any_role(auth.uid(), array['admin','marketing']::app_role[]) and status = 'scheduled')
  with check (has_any_role(auth.uid(), array['admin','marketing']::app_role[]) and status in ('scheduled', 'cancelled'));

create table if not exists public.push_clicks (
  campaign_id uuid not null references public.push_campaigns(id),
  user_id uuid not null,
  at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);
alter table public.push_clicks enable row level security;
create policy "Marketing lit les touchers" on public.push_clicks
  for select to authenticated using (has_any_role(auth.uid(), array['admin','marketing']::app_role[]));

create table if not exists public.app_messages (
  id uuid primary key default gen_random_uuid(),
  title_fr text not null check (char_length(title_fr) between 1 and 80),
  body_fr text check (char_length(body_fr) <= 280),
  cta_fr text check (char_length(cta_fr) <= 30),
  title_en text check (char_length(title_en) <= 80),
  body_en text check (char_length(body_en) <= 280),
  cta_en text check (char_length(cta_en) <= 30),
  url text check (url ~ '^/[A-Za-z0-9/_?=&%.-]*$'),
  audience text not null check (audience in ('all', 'verified', 'unverified', 'staff')),
  active boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  created_by_name text,
  check (ends_at is null or ends_at > starts_at)
);
alter table public.app_messages enable row level security;
create policy "Marketing lit les messages" on public.app_messages
  for select to authenticated using (has_any_role(auth.uid(), array['admin','marketing']::app_role[]));
create policy "Marketing crée les messages" on public.app_messages
  for insert to authenticated with check (has_any_role(auth.uid(), array['admin','marketing']::app_role[]));
create policy "Marketing modifie les messages" on public.app_messages
  for update to authenticated using (has_any_role(auth.uid(), array['admin','marketing']::app_role[]))
  with check (has_any_role(auth.uid(), array['admin','marketing']::app_role[]));

create table if not exists public.app_message_events (
  message_id uuid not null references public.app_messages(id),
  user_id uuid not null,
  kind text not null check (kind in ('seen', 'click', 'dismiss')),
  at timestamptz not null default now(),
  primary key (message_id, user_id, kind)
);
alter table public.app_message_events enable row level security;
create policy "Marketing lit les vues" on public.app_message_events
  for select to authenticated using (has_any_role(auth.uid(), array['admin','marketing']::app_role[]));

-- Le public d'une notification ou d'un message. Réservée au serveur.
create or replace function public.notif_audience(_aud text)
 returns table (user_id uuid, lang text, staff boolean)
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select p.id, coalesce(nullif(p.preferred_lang, ''), 'fr'),
         exists (select 1 from public.user_roles r where r.user_id = p.id)
    from public.profiles p
   where p.closed_at is null
     and case _aud
       when 'all' then true
       when 'verified' then p.kyc_status::text = 'approved'
       when 'unverified' then p.kyc_status::text <> 'approved'
       when 'staff' then exists (select 1 from public.user_roles r where r.user_id = p.id)
       else false end;
$function$;
revoke execute on function public.notif_audience(text) from public, anon, authenticated;

-- Combien de personnes, et de téléphones abonnés, dans un public (pour le back-office).
create or replace function public.notif_audience_count(_aud text)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
begin
  if not public.has_any_role(auth.uid(), array['admin','marketing']::public.app_role[]) then
    raise exception 'Réservé à l''équipe marketing.' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'people', count(*),
      'reachable', count(*) filter (where exists (select 1 from public.push_subscriptions s where s.user_id = a.user_id)),
      'devices', coalesce(sum((select count(*) from public.push_subscriptions s where s.user_id = a.user_id)), 0),
      'staff', count(*) filter (where a.staff)
    ) from public.notif_audience(_aud) a
  );
end;
$function$;
revoke execute on function public.notif_audience_count(text) from public, anon;
grant execute on function public.notif_audience_count(text) to authenticated;

-- L'app s'ouvre depuis une notification : on compte le toucher (une fois par personne).
create or replace function public.push_clicked(_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if auth.uid() is null then return; end if;
  insert into public.push_clicks (campaign_id, user_id)
    select _id, auth.uid() where exists (select 1 from public.push_campaigns c where c.id = _id)
  on conflict do nothing;
end;
$function$;
revoke execute on function public.push_clicked(uuid) from public, anon;
grant execute on function public.push_clicked(uuid) to authenticated;

-- Le message à afficher à la personne connectée, dans sa langue (le plus récent, s'il y en a un).
create or replace function public.my_app_message()
 returns table (id uuid, title text, body text, cta text, url text)
 language plpgsql
 stable
 security definer
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
      join public.notif_audience(a.audience) aud on aud.user_id = uid
     where a.active and a.starts_at <= now() and (a.ends_at is null or a.ends_at > now())
       and (coalesce(open_to_clients, false) or aud.staff)
       and not exists (select 1 from public.app_message_events e where e.message_id = a.id and e.user_id = uid and e.kind = 'dismiss')
     order by a.starts_at desc
     limit 1;
end;
$function$;
revoke execute on function public.my_app_message() from public, anon;
grant execute on function public.my_app_message() to authenticated;

create or replace function public.app_message_event(_id uuid, _kind text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if auth.uid() is null or _kind not in ('seen', 'click', 'dismiss') then return; end if;
  insert into public.app_message_events (message_id, user_id, kind)
    select _id, auth.uid(), _kind where exists (select 1 from public.app_messages m where m.id = _id)
  on conflict do nothing;
end;
$function$;
revoke execute on function public.app_message_event(uuid, text) from public, anon;
grant execute on function public.app_message_event(uuid, text) to authenticated;

-- Chiffres des notifications et des messages, pour les listes du back-office.
create or replace function public.notif_stats()
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
begin
  if not public.has_any_role(auth.uid(), array['admin','marketing']::public.app_role[]) then
    raise exception 'Réservé à l''équipe marketing.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'push', coalesce((select jsonb_object_agg(campaign_id, n) from (select campaign_id, count(*) n from public.push_clicks group by 1) x), '{}'::jsonb),
    'messages', coalesce((select jsonb_object_agg(message_id, k) from (
      select message_id, jsonb_build_object(
        'seen', count(*) filter (where kind = 'seen'),
        'click', count(*) filter (where kind = 'click'),
        'dismiss', count(*) filter (where kind = 'dismiss')) k
        from public.app_message_events group by 1) y), '{}'::jsonb)
  );
end;
$function$;
revoke execute on function public.notif_stats() from public, anon;
grant execute on function public.notif_stats() to authenticated;

-- Envoi des notifications dues, chaque minute (fonction push-campaign).
do $$ begin
  if not exists (select 1 from cron.job where jobname = 'push-campaign') then
    perform cron.schedule('push-campaign', '* * * * *', $c$
      select net.http_post(
        url := 'https://uukxacjjviiktmbikdwp.supabase.co/functions/v1/push-campaign',
        headers := '{"Content-Type":"application/json"}'::jsonb
      );
    $c$);
  end if;
end $$;
