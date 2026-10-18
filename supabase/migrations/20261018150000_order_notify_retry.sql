-- Notifications de commande : plus de temps pour répondre (30 s au lieu de 5 s) et nouvel essai
-- automatique, jusqu'à 3 fois, quand l'appel n'a pas abouti. La fonction relit la commande avant
-- d'envoyer : un nouvel essai n'annonce jamais un statut qui n'est plus le bon.

create table if not exists public.order_notify_queue (
  id bigserial primary key,
  order_id uuid not null,
  body jsonb not null,
  request_id bigint not null,
  tries int not null default 1,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists order_notify_queue_open on public.order_notify_queue (created_at) where not done;
alter table public.order_notify_queue enable row level security;
revoke all on public.order_notify_queue from public, anon, authenticated;

create or replace function public.notify_order_status_change()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  supabase_url text := 'https://uukxacjjviiktmbikdwp.supabase.co';
  payload jsonb;
  rid bigint;
begin
  if old.status is distinct from new.status then
    payload := jsonb_build_object(
      'type', 'UPDATE',
      'table', 'orders',
      'record', to_jsonb(new),
      'old_record', to_jsonb(old)
    );
    rid := net.http_post(
      url := supabase_url || '/functions/v1/order-notify',
      headers := public.cron_headers(),
      body := payload,
      timeout_milliseconds := 30000
    );
    -- Le suivi des essais ne doit jamais empêcher le changement de statut.
    begin
      insert into public.order_notify_queue (order_id, body, request_id) values (new.id, payload, rid);
    exception when others then
      null;
    end;
  end if;
  return new;
end;
$function$;

-- Chaque minute : les appels réussis sont classés, ceux qui ont échoué sont relancés.
create or replace function public.order_notify_retry()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  q record;
  r record;
  rid bigint;
begin
  for q in select * from public.order_notify_queue where not done order by created_at limit 50 loop
    select status_code, timed_out, error_msg into r from net._http_response where id = q.request_id;
    if not found then
      -- Pas encore de réponse : on attend, sauf si l'appel est trop ancien pour en recevoir une.
      if q.created_at < now() - interval '30 minutes' then
        update public.order_notify_queue set done = true where id = q.id;
      end if;
      continue;
    end if;
    if r.status_code between 200 and 299 then
      update public.order_notify_queue set done = true where id = q.id;
    elsif q.tries >= 3 or q.created_at < now() - interval '1 hour' then
      update public.order_notify_queue set done = true where id = q.id;
    else
      rid := net.http_post(
        url := 'https://uukxacjjviiktmbikdwp.supabase.co/functions/v1/order-notify',
        headers := public.cron_headers(),
        body := q.body,
        timeout_milliseconds := 30000
      );
      update public.order_notify_queue set request_id = rid, tries = q.tries + 1 where id = q.id;
    end if;
  end loop;
end;
$function$;
revoke all on function public.order_notify_retry() from public, anon, authenticated;

select cron.schedule('order-notify-retry', '* * * * *', 'select public.order_notify_retry();');
