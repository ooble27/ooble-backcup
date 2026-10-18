-- Fonctions automatiques : seuls les passages planifiés, les appels internes et l'équipe peuvent les lancer.
-- Les tâches planifiées et le déclencheur des commandes envoient un secret partagé (en-tête x-ooble-cron),
-- créé ici dans la base et lu par les fonctions avec la clé service. Personne d'autre ne peut le lire.

create table if not exists public.cron_secret (
  id int primary key default 1 check (id = 1),
  secret text not null,
  created_at timestamptz not null default now()
);
alter table public.cron_secret enable row level security;
revoke all on public.cron_secret from public, anon, authenticated;

insert into public.cron_secret (id, secret)
values (1, replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (id) do nothing;

create or replace function public.cron_headers()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object('Content-Type', 'application/json', 'x-ooble-cron', (select secret from public.cron_secret where id = 1));
$$;
revoke all on function public.cron_headers() from public, anon, authenticated;

-- Tâches planifiées : même appel qu'avant, avec l'en-tête en plus.
do $$
declare
  j record;
  fn text;
  body text;
  extra text;
begin
  for j in select jobid, jobname from cron.job where jobname in
    ('refresh-usdt-rate', 'reconcile-usdt-payouts', 'sell-watch', 'drain-usdt-payouts', 'campaign-dispatch', 'journeys', 'push-campaign', 'treasury-snapshot')
  loop
    fn := case j.jobname
      when 'refresh-usdt-rate' then 'refresh-rate'
      when 'reconcile-usdt-payouts' then 'usdt-payout'
      when 'drain-usdt-payouts' then 'usdt-payout'
      when 'treasury-snapshot' then 'usdt-payout'
      else j.jobname end;
    body := case j.jobname
      when 'reconcile-usdt-payouts' then '{"action":"reconcile"}'
      when 'drain-usdt-payouts' then '{"action":"drain"}'
      when 'treasury-snapshot' then '{"action":"snapshot"}'
      when 'sell-watch' then '{"action":"scan"}'
      else null end;
    extra := case when j.jobname = 'drain-usdt-payouts' then ', timeout_milliseconds := 120000' else '' end;
    perform cron.alter_job(j.jobid, command := format(
      'select net.http_post(url := %L, headers := public.cron_headers()%s%s);',
      'https://uukxacjjviiktmbikdwp.supabase.co/functions/v1/' || fn,
      case when body is null then '' else format(', body := %L::jsonb', body) end,
      extra));
  end loop;
end $$;

-- Changement de statut d'une commande : même appel, avec l'en-tête.
create or replace function public.notify_order_status_change()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  supabase_url text := 'https://uukxacjjviiktmbikdwp.supabase.co';
begin
  if old.status is distinct from new.status then
    perform net.http_post(
      url := supabase_url || '/functions/v1/order-notify',
      headers := public.cron_headers(),
      body := jsonb_build_object(
        'type', 'UPDATE',
        'table', 'orders',
        'record', to_jsonb(new),
        'old_record', to_jsonb(old)
      )
    );
  end if;
  return new;
end;
$function$;
