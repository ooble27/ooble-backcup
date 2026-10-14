-- Support : état de chaque conversation, membre qui s'en occupe, et depuis quand le client attend.
alter table public.mail_threads
  add column if not exists support_state text not null default 'todo' check (support_state in ('todo', 'waiting', 'resolved')),
  add column if not exists assigned_to uuid,
  add column if not exists assigned_name text,
  add column if not exists last_inbound_at timestamptz;

-- État des conversations existantes : d'après leur dernier message (archivée = résolue).
update public.mail_threads t set
  last_inbound_at = (select max(m.created_at) from public.mail_messages m where m.thread_id = t.id and m.direction = 'inbound'),
  support_state = case
    when t.status = 'archived' then 'resolved'
    when (select m.direction from public.mail_messages m where m.thread_id = t.id order by m.created_at desc limit 1) = 'outbound' then 'waiting'
    else 'todo' end;

create index if not exists mail_threads_support_idx on public.mail_threads (support_state, last_inbound_at);

-- Le client écrit : la conversation repasse « à répondre ». L'équipe répond : « en attente du client ».
create or replace function public.update_thread_on_message()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  update public.mail_threads
  set message_count = message_count + 1,
      last_message_at = NEW.created_at,
      has_unread = case when NEW.direction = 'inbound' then true else has_unread end,
      last_inbound_at = case when NEW.direction = 'inbound' then NEW.created_at else last_inbound_at end,
      support_state = case
        when NEW.direction = 'inbound' then 'todo'
        when support_state = 'todo' then 'waiting'
        else support_state end,
      status = case when NEW.direction = 'inbound' then 'open' else status end
  where id = NEW.thread_id;
  return NEW;
end;
$function$;

-- La réception se met à jour en direct.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mail_threads') then
    alter publication supabase_realtime add table public.mail_threads;
  end if;
end $$;
