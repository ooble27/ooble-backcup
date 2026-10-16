-- Marketing, étape 2 : les parcours automatiques.
--
-- Un parcours envoie un courriel à une personne quand il se passe quelque chose dans son compte
-- (inscrite sans vérification, vérifiée sans achat, achat abandonné, inactive, premier achat terminé).
--
-- Garde-fous :
--   • chaque parcours est éteint par défaut (journeys.enabled) et seul l'administrateur l'allume ;
--   • rien ne part sans « Envois automatiques » (centre de contrôle) ;
--   • tant que « Envois aux clients » est coupé, seule l'équipe reçoit ;
--   • une personne ne reçoit jamais deux fois le même courriel pour le même événement (journey_runs),
--     jamais plus d'un courriel de parcours en 48 heures, et jamais si elle est désabonnée ;
--   • seuls les événements récents comptent : allumer un parcours n'écrit pas à tout l'historique.
--
-- Les courriels passent par la file des campagnes (une campagne permanente par parcours), donc par
-- campaign-dispatch, le forfait du jour et le suivi des ouvertures et des clics.

create table if not exists public.journeys (
  id text primary key,
  enabled boolean not null default false,
  style text not null default 'phrase' check (style in ('sobre', 'recu', 'phrase')),
  campaign_id uuid references public.campaigns(id),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  updated_by_name text
);
alter table public.journeys enable row level security;
create policy "Marketing lit les parcours" on public.journeys
  for select to authenticated using (has_any_role(auth.uid(), array['admin','marketing']::app_role[]));
create policy "Admin règle les parcours" on public.journeys
  for update to authenticated using (has_role(auth.uid(), 'admin'::app_role)) with check (has_role(auth.uid(), 'admin'::app_role));

create table if not exists public.journey_steps (
  kind text primary key,
  journey_id text not null references public.journeys(id),
  position int not null default 1,
  delay_hours int not null check (delay_hours between 1 and 4320)
);
alter table public.journey_steps enable row level security;
create policy "Marketing lit les étapes" on public.journey_steps
  for select to authenticated using (has_any_role(auth.uid(), array['admin','marketing']::app_role[]));
create policy "Admin règle les délais" on public.journey_steps
  for update to authenticated using (has_role(auth.uid(), 'admin'::app_role)) with check (has_role(auth.uid(), 'admin'::app_role));

create table if not exists public.journey_texts (
  kind text not null references public.journey_steps(kind),
  lang text not null check (lang in ('fr', 'en')),
  subject text check (char_length(subject) <= 200),
  heading text check (char_length(heading) <= 300),
  lead text check (char_length(lead) <= 2000),
  button text check (char_length(button) <= 60),
  updated_at timestamptz not null default now(),
  updated_by_name text,
  primary key (kind, lang)
);
alter table public.journey_texts enable row level security;
create policy "Marketing lit les textes des parcours" on public.journey_texts
  for select to authenticated using (has_any_role(auth.uid(), array['admin','marketing']::app_role[]));
create policy "Marketing écrit les textes des parcours" on public.journey_texts
  for insert to authenticated with check (has_any_role(auth.uid(), array['admin','marketing']::app_role[]));
create policy "Marketing modifie les textes des parcours" on public.journey_texts
  for update to authenticated using (has_any_role(auth.uid(), array['admin','marketing']::app_role[]))
  with check (has_any_role(auth.uid(), array['admin','marketing']::app_role[]));

create table if not exists public.journey_runs (
  id bigserial primary key,
  journey_id text not null references public.journeys(id),
  kind text not null references public.journey_steps(kind),
  user_id uuid not null,
  run_key text not null,
  send_id uuid references public.campaign_sends(id),
  created_at timestamptz not null default now(),
  unique (kind, user_id, run_key)
);
create index if not exists journey_runs_user_idx on public.journey_runs (user_id, created_at);
alter table public.journey_runs enable row level security;
create policy "Marketing lit les passages" on public.journey_runs
  for select to authenticated using (has_any_role(auth.uid(), array['admin','marketing']::app_role[]));

alter table public.campaigns add column if not exists journey_id text references public.journeys(id);

-- Les cinq parcours, éteints, chacun avec sa campagne permanente. Elle reste « paused » : la file
-- générale ne la prend jamais, campaign-dispatch la traite à part selon son parcours.
do $$
declare j record; cid uuid;
begin
  for j in select * from (values
    ('verify', 'Parcours · Relance vérification'),
    ('first-buy', 'Parcours · Premier achat'),
    ('abandoned', 'Parcours · Achat abandonné'),
    ('winback', 'Parcours · Réactivation'),
    ('thanks', 'Parcours · Merci')
  ) as v(id, name) loop
    if not exists (select 1 from public.journeys where id = j.id) then
      insert into public.campaigns (name, template_id, status, scheduled_at, started_at, audience, created_by_name)
        values (j.name, 'journey:' || j.id, 'paused', now(), now(), 'Parcours automatique', 'Ooble')
        returning id into cid;
      insert into public.journeys (id, campaign_id) values (j.id, cid);
      update public.campaigns set journey_id = j.id where id = cid;
    end if;
  end loop;
  insert into public.journey_steps (kind, journey_id, position, delay_hours) values
    ('j-verify-1', 'verify', 1, 48),
    ('j-verify-2', 'verify', 2, 168),
    ('j-first-buy', 'first-buy', 1, 72),
    ('j-abandoned', 'abandoned', 1, 1),
    ('j-winback', 'winback', 1, 1440),
    ('j-thanks', 'thanks', 1, 24)
  on conflict (kind) do nothing;
end $$;

-- Qui doit recevoir tel courriel de parcours, maintenant. Réservée au serveur.
create or replace function public.journey_candidates(_kind text, _limit int default 50)
 returns table (user_id uuid, email text, full_name text, lang text, run_key text)
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare
  d interval;
  w interval := interval '7 days';
begin
  select make_interval(hours => s.delay_hours) into d from public.journey_steps s where s.kind = _kind;
  if d is null then return; end if;
  return query
  with base as (
    select p.id, p.email, p.full_name, coalesce(nullif(p.preferred_lang, ''), 'fr') as lang, p.created_at, p.kyc_status::text as kyc
      from public.profiles p
     where p.email is not null and position('@' in p.email) > 1 and p.closed_at is null
       and not exists (select 1 from public.marketing_optout m where m.email = lower(p.email) and m.unsubscribed_at is not null)
       and not exists (select 1 from public.journey_runs r where r.user_id = p.id and r.created_at > now() - interval '48 hours')
  ),
  c as (
    -- Inscrite, vérification jamais commencée.
    select b.id, b.email, b.full_name, b.lang, 'once'::text as k from base b
     where _kind in ('j-verify-1', 'j-verify-2') and b.kyc = 'not_started'
       and b.created_at between now() - d - w and now() - d
    union all
    -- Vérifiée, aucune commande.
    select b.id, b.email, b.full_name, b.lang, 'once' from base b
     where _kind = 'j-first-buy' and b.kyc = 'approved'
       and exists (select 1 from public.kyc_verifications v where v.user_id = b.id and v.status::text = 'approved'
                    and v.reviewed_at between now() - d - w and now() - d)
       and not exists (select 1 from public.orders o where o.user_id = b.id)
    union all
    -- Achat annulé faute de paiement, rien depuis ; au plus un rappel par semaine.
    select b.id, b.email, b.full_name, b.lang, o.id::text from base b
      join public.orders o on o.user_id = b.id and o.side::text = 'buy' and o.status::text = 'cancelled'
     where _kind = 'j-abandoned'
       and exists (select 1 from public.order_events e where e.order_id = o.id and e.actor = 'system' and e.new_status::text = 'cancelled'
                    and e.created_at between now() - d - interval '2 days' and now() - d)
       and not exists (select 1 from public.orders o2 where o2.user_id = b.id and o2.created_at > o.created_at)
       and not exists (select 1 from public.journey_runs r where r.user_id = b.id and r.kind = 'j-abandoned' and r.created_at > now() - interval '7 days')
    union all
    -- Plus aucune commande depuis longtemps (la dernière était terminée).
    select b.id, b.email, b.full_name, b.lang, last.id::text from base b
      join lateral (select o.id, o.created_at, o.status::text as st from public.orders o where o.user_id = b.id order by o.created_at desc limit 1) last on true
     where _kind = 'j-winback' and last.st = 'completed'
       and last.created_at between now() - d - interval '15 days' and now() - d
    union all
    -- Premier achat ou première vente terminé.
    select b.id, b.email, b.full_name, b.lang, 'once' from base b
     where _kind = 'j-thanks'
       and (select count(*) from public.orders o where o.user_id = b.id and o.status::text = 'completed') = 1
       and exists (select 1 from public.orders o join public.order_events e on e.order_id = o.id
                    where o.user_id = b.id and o.status::text = 'completed' and e.new_status::text = 'completed'
                      and e.created_at between now() - d - w and now() - d)
  )
  select c.id, c.email, c.full_name, c.lang, c.k from c
   where not exists (select 1 from public.journey_runs r where r.kind = _kind and r.user_id = c.id and r.run_key = c.k)
   limit greatest(1, least(_limit, 100000));
end;
$function$;
revoke execute on function public.journey_candidates(text, int) from public, anon, authenticated;

-- Combien de personnes chaque courriel toucherait en ce moment (pour la page Parcours).
create or replace function public.journey_preview()
 returns table (kind text, people int)
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
    select s.kind, (select count(*)::int from public.journey_candidates(s.kind, 100000))
      from public.journey_steps s order by s.journey_id, s.position;
end;
$function$;
revoke execute on function public.journey_preview() from public, anon;
grant execute on function public.journey_preview() to authenticated;

-- Préparation des parcours toutes les 10 minutes (fonction journeys).
do $$ begin
  if not exists (select 1 from cron.job where jobname = 'journeys') then
    perform cron.schedule('journeys', '*/10 * * * *', $c$
      select net.http_post(
        url := 'https://uukxacjjviiktmbikdwp.supabase.co/functions/v1/journeys',
        headers := '{"Content-Type":"application/json"}'::jsonb
      );
    $c$);
  end if;
end $$;
