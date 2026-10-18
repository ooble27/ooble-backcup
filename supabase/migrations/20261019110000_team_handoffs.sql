-- Passation de fin de journée : un court mot « ce que je laisse en cours », avec mes commandes ouvertes
-- et mes tâches en cours rattachées. Les autres le voient en haut de Mon espace et touchent « Bien reçu ».
-- Rien n'est effacé : chaque passation reste dans l'historique.

create table if not exists public.team_handoffs (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null,
  author_name text not null,
  body text not null default '',
  order_ids uuid[] not null default '{}',
  task_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists team_handoffs_recent on public.team_handoffs (created_at desc);
alter table public.team_handoffs enable row level security;
revoke all on public.team_handoffs from public, anon, authenticated;
grant select on public.team_handoffs to authenticated;
create policy team_handoffs_read on public.team_handoffs for select to authenticated using (public.is_staff(auth.uid()));

create table if not exists public.team_handoff_reads (
  handoff_id uuid not null references public.team_handoffs (id),
  user_id uuid not null,
  user_name text not null,
  read_at timestamptz not null default now(),
  primary key (handoff_id, user_id)
);
alter table public.team_handoff_reads enable row level security;
revoke all on public.team_handoff_reads from public, anon, authenticated;
grant select on public.team_handoff_reads to authenticated;
create policy team_handoff_reads_read on public.team_handoff_reads for select to authenticated using (public.is_staff(auth.uid()));

create or replace function public.team_handoff_post(_body text, _orders uuid[], _tasks uuid[])
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare hid uuid; b text := left(btrim(coalesce(_body, '')), 2000);
begin
  perform public.team_require_staff();
  if b = '' and coalesce(array_length(_orders, 1), 0) = 0 and coalesce(array_length(_tasks, 1), 0) = 0 then
    raise exception 'Écrivez ce que vous laissez en cours.';
  end if;
  insert into public.team_handoffs (author_id, author_name, body, order_ids, task_ids)
  values (auth.uid(), public.team_who(), b, coalesce(_orders[1:50], '{}'), coalesce(_tasks[1:50], '{}'))
  returning id into hid;
  return hid;
end;
$$;
revoke all on function public.team_handoff_post(text, uuid[], uuid[]) from public, anon;
grant execute on function public.team_handoff_post(text, uuid[], uuid[]) to authenticated;

create or replace function public.team_handoff_ack(_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.team_require_staff();
  if not exists (select 1 from public.team_handoffs where id = _id) then raise exception 'Passation introuvable.'; end if;
  insert into public.team_handoff_reads (handoff_id, user_id, user_name) values (_id, auth.uid(), public.team_who())
  on conflict (handoff_id, user_id) do nothing;
end;
$$;
revoke all on function public.team_handoff_ack(uuid) from public, anon;
grant execute on function public.team_handoff_ack(uuid) to authenticated;

-- Mise à jour en direct de Mon espace.
alter publication supabase_realtime add table public.team_handoffs;
alter publication supabase_realtime add table public.team_handoff_reads;
