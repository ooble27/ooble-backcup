-- Marketing, étape 1 : centre de contrôle, campagnes et envois côté serveur, statistiques.
--
-- • marketing_settings : les interrupteurs de l'administrateur. Tant que « envois aux clients »
--   est coupé, aucune campagne ne part vers un client (seulement vers l'équipe) ; tant que
--   « envois automatiques » est coupé, aucune campagne programmée ne part toute seule.
-- • campaigns / campaign_sends : chaque campagne et chacun de ses courriels (préparés dans le
--   back-office, envoyés par la fonction campaign-dispatch). Remplace l'historique local du navigateur.
-- • campaign_events : délivré, ouvert, cliqué, rebond, plainte (webhook Resend → mail-events).

create table if not exists public.marketing_settings (
  id int primary key default 1 check (id = 1),
  client_sends boolean not null default false,
  automatic_sends boolean not null default false,
  daily_limit int not null default 100 check (daily_limit between 1 and 100000),
  daily_reserve int not null default 30 check (daily_reserve between 0 and 100000),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  updated_by_name text
);
insert into public.marketing_settings (id) values (1) on conflict (id) do nothing;
alter table public.marketing_settings enable row level security;
create policy "Marketing lit le centre de contrôle" on public.marketing_settings
  for select to authenticated using (has_any_role(auth.uid(), array['admin','marketing']::app_role[]));
create policy "Admin change le centre de contrôle" on public.marketing_settings
  for update to authenticated using (has_role(auth.uid(), 'admin'::app_role)) with check (has_role(auth.uid(), 'admin'::app_role));

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) <= 160),
  template_id text,
  values_by_lang jsonb,
  subject text,
  audience text,
  status text not null default 'scheduled' check (status in ('scheduled', 'sending', 'sent', 'cancelled', 'paused')),
  scheduled_at timestamptz not null default now(),
  is_test boolean not null default false,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  created_by_name text
);
create index if not exists campaigns_due_idx on public.campaigns (scheduled_at) where status in ('scheduled', 'sending');
alter table public.campaigns enable row level security;
create policy "Marketing lit les campagnes" on public.campaigns
  for select to authenticated using (has_any_role(auth.uid(), array['admin','marketing']::app_role[]));
create policy "Marketing crée les campagnes" on public.campaigns
  for insert to authenticated with check (has_any_role(auth.uid(), array['admin','marketing']::app_role[]) and status = 'scheduled');
create policy "Marketing annule ou reprend une campagne" on public.campaigns
  for update to authenticated using (has_any_role(auth.uid(), array['admin','marketing']::app_role[]))
  with check (has_any_role(auth.uid(), array['admin','marketing']::app_role[]) and status in ('scheduled', 'cancelled', 'paused'));

create table if not exists public.campaign_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id),
  email text not null,
  user_id uuid,
  lang text not null default 'fr' check (lang in ('fr', 'en')),
  subject text not null,
  html text not null,
  text_body text,
  unsubscribe_url text,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'blocked', 'skipped')),
  error text,
  resend_id text unique,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  opens int not null default 0,
  clicks int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists campaign_sends_campaign_idx on public.campaign_sends (campaign_id);
create index if not exists campaign_sends_queued_idx on public.campaign_sends (campaign_id) where status = 'queued';
create index if not exists campaign_sends_sent_idx on public.campaign_sends (sent_at);
alter table public.campaign_sends enable row level security;
create policy "Marketing lit les envois" on public.campaign_sends
  for select to authenticated using (has_any_role(auth.uid(), array['admin','marketing']::app_role[]));
create policy "Marketing prépare les envois" on public.campaign_sends
  for insert to authenticated with check (has_any_role(auth.uid(), array['admin','marketing']::app_role[]) and status = 'queued');

create table if not exists public.campaign_events (
  id bigserial primary key,
  send_id uuid not null references public.campaign_sends(id),
  type text not null,
  url text,
  at timestamptz not null default now()
);
create index if not exists campaign_events_send_idx on public.campaign_events (send_id);
alter table public.campaign_events enable row level security;
create policy "Marketing lit les événements" on public.campaign_events
  for select to authenticated using (has_any_role(auth.uid(), array['admin','marketing']::app_role[]));

-- Résultats d'une campagne : envois, délivrés, ouverts, cliqués, désabonnés, et ce que ça a rapporté
-- (commandes passées par les destinataires dans les 7 jours suivant l'envoi).
create or replace function public.campaign_results(_id uuid)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare
  r jsonb;
begin
  if not public.has_any_role(auth.uid(), array['admin','marketing']::public.app_role[]) then
    raise exception 'Réservé à l''équipe marketing.' using errcode = '42501';
  end if;
  with s as (select * from public.campaign_sends where campaign_id = _id),
  sent as (select * from s where status = 'sent'),
  orders as (
    select o.cad_amount from public.orders o
      join sent on o.user_id = sent.user_id
     where o.created_at between sent.sent_at and sent.sent_at + interval '7 days'
       and o.status not in ('cancelled', 'expired', 'refunded')
  ),
  links as (
    select e.url, count(*) n from public.campaign_events e join s on s.id = e.send_id
     where e.type = 'clicked' and e.url is not null group by e.url order by n desc limit 8
  )
  select jsonb_build_object(
    'total', (select count(*) from s),
    'queued', (select count(*) from s where status = 'queued'),
    'sent', (select count(*) from sent),
    'failed', (select count(*) from s where status = 'failed'),
    'blocked', (select count(*) from s where status = 'blocked'),
    'skipped', (select count(*) from s where status = 'skipped'),
    'delivered', (select count(*) from sent where delivered_at is not null),
    'opened', (select count(*) from sent where opened_at is not null),
    'clicked', (select count(*) from sent where clicked_at is not null),
    'bounced', (select count(*) from sent where bounced_at is not null),
    'unsubscribed', (select count(*) from sent join public.marketing_optout m on lower(m.email) = lower(sent.email)
                      where m.unsubscribed_at >= sent.sent_at),
    'orders', (select count(*) from orders),
    'volume', (select coalesce(sum(cad_amount), 0) from orders),
    'links', coalesce((select jsonb_agg(jsonb_build_object('url', url, 'n', n)) from links), '[]'::jsonb)
  ) into r;
  return r;
end;
$function$;

-- Vue d'ensemble : la période en chiffres, toutes campagnes confondues.
create or replace function public.marketing_overview(_since timestamptz)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare
  r jsonb;
begin
  if not public.has_any_role(auth.uid(), array['admin','marketing']::public.app_role[]) then
    raise exception 'Réservé à l''équipe marketing.' using errcode = '42501';
  end if;
  with sent as (
    select s.* from public.campaign_sends s join public.campaigns c on c.id = s.campaign_id
     where s.status = 'sent' and s.sent_at >= _since and not c.is_test
  ),
  orders as (
    select distinct o.id, o.cad_amount from public.orders o
      join sent on o.user_id = sent.user_id
     where o.created_at between sent.sent_at and sent.sent_at + interval '7 days'
       and o.status not in ('cancelled', 'expired', 'refunded')
  )
  select jsonb_build_object(
    'campaigns', (select count(distinct campaign_id) from sent),
    'sent', (select count(*) from sent),
    'delivered', (select count(*) from sent where delivered_at is not null),
    'opened', (select count(*) from sent where opened_at is not null),
    'clicked', (select count(*) from sent where clicked_at is not null),
    'orders', (select count(*) from orders),
    'volume', (select coalesce(sum(cad_amount), 0) from orders),
    'today', (select count(*) from public.campaign_sends where status = 'sent' and sent_at >= date_trunc('day', now())),
    'scheduled', (select count(*) from public.campaigns where status = 'scheduled' and scheduled_at > now())
  ) into r;
  return r;
end;
$function$;

revoke execute on function public.campaign_results(uuid) from public, anon;
revoke execute on function public.marketing_overview(timestamptz) from public, anon;
grant execute on function public.campaign_results(uuid) to authenticated;
grant execute on function public.marketing_overview(timestamptz) to authenticated;

-- Envoi des campagnes dues, chaque minute (fonction campaign-dispatch).
do $$ begin
  if not exists (select 1 from cron.job where jobname = 'campaign-dispatch') then
    perform cron.schedule('campaign-dispatch', '* * * * *', $c$
      select net.http_post(
        url := 'https://uukxacjjviiktmbikdwp.supabase.co/functions/v1/campaign-dispatch',
        headers := '{"Content-Type":"application/json"}'::jsonb
      );
    $c$);
  end if;
end $$;

-- Les chiffres de chaque campagne, pour la liste (une seule requête).
create or replace function public.campaign_summaries()
 returns table (campaign_id uuid, total int, queued int, sent int, delivered int, opened int, clicked int, blocked int, skipped int, failed int)
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
begin
  if not public.has_any_role(auth.uid(), array['admin','marketing']::public.app_role[]) then
    raise exception 'Réservé à l''équipe marketing.' using errcode = '42501';
  end if;
  return query
    select s.campaign_id,
      count(*)::int,
      count(*) filter (where s.status = 'queued')::int,
      count(*) filter (where s.status = 'sent')::int,
      count(*) filter (where s.delivered_at is not null)::int,
      count(*) filter (where s.opened_at is not null)::int,
      count(*) filter (where s.clicked_at is not null)::int,
      count(*) filter (where s.status = 'blocked')::int,
      count(*) filter (where s.status = 'skipped')::int,
      count(*) filter (where s.status = 'failed')::int
    from public.campaign_sends s group by s.campaign_id;
end;
$function$;
revoke execute on function public.campaign_summaries() from public, anon;
grant execute on function public.campaign_summaries() to authenticated;
