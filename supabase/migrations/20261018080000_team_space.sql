-- Espace de l'équipe : notes à l'équipe (à tous ou à un poste, épinglées, lues par qui, réponses),
-- tâches (confiées à une personne ou à un poste, échéance, lien vers un client ou une commande,
-- commentaires) et bloc-notes privé de chaque membre. Rien ne s'efface : une note ou une tâche
-- s'archive. Toute l'équipe voit les tâches ; une note visée à un poste n'est vue que par ce poste,
-- son auteur et les administrateurs.

create or replace function public.team_who()
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(btrim(full_name), ''), email, 'Membre') from public.profiles where id = auth.uid();
$$;

create or replace function public.team_require_staff()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff(auth.uid()) then raise exception 'Accès réservé à l''équipe.' using errcode = '42501'; end if;
end;
$$;

-- ─── Notes à l'équipe ───
create table if not exists public.team_notes (
  id uuid primary key default gen_random_uuid(),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  audience text not null default 'all' check (audience in ('all', 'admin', 'operator', 'compliance', 'accounting', 'kyc_reviewer', 'support', 'marketing')),
  pinned boolean not null default false,
  archived boolean not null default false,
  author_id uuid not null default auth.uid() references auth.users (id),
  author_name text,
  created_at timestamptz not null default now()
);
create index if not exists team_notes_created_idx on public.team_notes (created_at desc);

create table if not exists public.team_note_reads (
  note_id uuid not null references public.team_notes (id),
  user_id uuid not null references auth.users (id),
  read_at timestamptz not null default now(),
  primary key (note_id, user_id)
);

create table if not exists public.team_note_replies (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.team_notes (id),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  author_id uuid not null default auth.uid() references auth.users (id),
  author_name text,
  created_at timestamptz not null default now()
);
create index if not exists team_note_replies_note_idx on public.team_note_replies (note_id, created_at);

-- Une note est visible par son auteur, les administrateurs, et le poste visé (ou tous).
create or replace function public.team_note_visible(_audience text, _author uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff(auth.uid()) then return false; end if;
  if _audience = 'all' or _author = auth.uid() or public.has_any_role(auth.uid(), array['admin']::public.app_role[]) then return true; end if;
  return public.has_any_role(auth.uid(), array[_audience::public.app_role]);
end;
$$;

alter table public.team_notes enable row level security;
alter table public.team_note_reads enable row level security;
alter table public.team_note_replies enable row level security;
create policy team_notes_read on public.team_notes for select to authenticated using (public.team_note_visible(audience, author_id));
create policy team_note_reads_read on public.team_note_reads for select to authenticated
  using (exists (select 1 from public.team_notes n where n.id = note_id and public.team_note_visible(n.audience, n.author_id)));
create policy team_note_replies_read on public.team_note_replies for select to authenticated
  using (exists (select 1 from public.team_notes n where n.id = note_id and public.team_note_visible(n.audience, n.author_id)));

create or replace function public.team_note_post(_body text, _audience text, _pinned boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare nid uuid;
begin
  perform public.team_require_staff();
  if _pinned and not public.has_any_role(auth.uid(), array['admin']::public.app_role[]) then
    raise exception 'Seul un administrateur peut épingler une note.';
  end if;
  insert into public.team_notes (body, audience, pinned, author_id, author_name)
  values (btrim(_body), coalesce(_audience, 'all'), coalesce(_pinned, false), auth.uid(), public.team_who()) returning id into nid;
  insert into public.team_note_reads (note_id, user_id) values (nid, auth.uid());
  return nid;
end;
$$;

-- Épingler : administrateurs. Archiver : l'auteur ou un administrateur.
create or replace function public.team_note_set(_id uuid, _pinned boolean, _archived boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare n record; is_admin boolean := public.has_any_role(auth.uid(), array['admin']::public.app_role[]);
begin
  perform public.team_require_staff();
  select * into n from public.team_notes where id = _id;
  if n is null then raise exception 'Note introuvable.'; end if;
  if _pinned is not null and _pinned is distinct from n.pinned and not is_admin then raise exception 'Seul un administrateur peut épingler une note.'; end if;
  if _archived is not null and _archived is distinct from n.archived and not (is_admin or n.author_id = auth.uid()) then
    raise exception 'Seul l''auteur ou un administrateur peut archiver cette note.';
  end if;
  update public.team_notes set pinned = coalesce(_pinned, pinned), archived = coalesce(_archived, archived) where id = _id;
end;
$$;

create or replace function public.team_note_mark_read(_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.team_require_staff();
  insert into public.team_note_reads (note_id, user_id)
  select n.id, auth.uid() from public.team_notes n where n.id = any (_ids) and public.team_note_visible(n.audience, n.author_id)
  on conflict do nothing;
end;
$$;

create or replace function public.team_note_reply(_note uuid, _body text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.team_require_staff();
  if not exists (select 1 from public.team_notes n where n.id = _note and not n.archived and public.team_note_visible(n.audience, n.author_id)) then
    raise exception 'Note introuvable.';
  end if;
  insert into public.team_note_replies (note_id, body, author_id, author_name) values (_note, btrim(_body), auth.uid(), public.team_who());
end;
$$;

-- ─── Tâches ───
create table if not exists public.team_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  details text check (details is null or char_length(details) <= 4000),
  assignee_id uuid references auth.users (id),
  assignee_role text check (assignee_role is null or assignee_role in ('admin', 'operator', 'compliance', 'accounting', 'kyc_reviewer', 'support', 'marketing')),
  due_on date,
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  client_id uuid references public.profiles (id),
  order_id uuid references public.orders (id),
  archived boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  done_at timestamptz,
  done_by_name text,
  check (assignee_id is null or assignee_role is null)
);
create index if not exists team_tasks_open_idx on public.team_tasks (status, due_on) where not archived;
create index if not exists team_tasks_assignee_idx on public.team_tasks (assignee_id) where not archived;

create table if not exists public.team_task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.team_tasks (id),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  author_id uuid not null default auth.uid() references auth.users (id),
  author_name text,
  created_at timestamptz not null default now()
);
create index if not exists team_task_comments_task_idx on public.team_task_comments (task_id, created_at);

alter table public.team_tasks enable row level security;
alter table public.team_task_comments enable row level security;
create policy team_tasks_read on public.team_tasks for select to authenticated using (public.is_staff(auth.uid()));
create policy team_task_comments_read on public.team_task_comments for select to authenticated using (public.is_staff(auth.uid()));

-- Crée (_id nul) ou modifie une tâche ; en modification, tous les champs sont renvoyés.
-- Assignation : une personne, un poste, ou ni l'un ni l'autre pour « toute l'équipe ».
create or replace function public.team_task_save(_id uuid, _title text, _details text, _assignee uuid, _role text,
  _due date, _client uuid, _order uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare tid uuid;
begin
  perform public.team_require_staff();
  if _assignee is not null and not public.is_staff(_assignee) then raise exception 'Cette personne ne fait pas partie de l''équipe.'; end if;
  if _id is null then
    insert into public.team_tasks (title, details, assignee_id, assignee_role, due_on, client_id, order_id, created_by, created_by_name)
    values (btrim(_title), nullif(btrim(coalesce(_details, '')), ''), _assignee, _role, _due, _client, _order, auth.uid(), public.team_who())
    returning id into tid;
    return tid;
  end if;
  update public.team_tasks set title = btrim(_title), details = nullif(btrim(coalesce(_details, '')), ''), assignee_id = _assignee, assignee_role = _role,
    due_on = _due, client_id = _client, order_id = _order, updated_at = now()
  where id = _id and not archived returning id into tid;
  if tid is null then raise exception 'Tâche introuvable.'; end if;
  return tid;
end;
$$;

create or replace function public.team_task_status(_id uuid, _status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.team_require_staff();
  if _status not in ('todo', 'doing', 'done') then raise exception 'État inconnu.'; end if;
  update public.team_tasks set status = _status, updated_at = now(),
    done_at = case when _status = 'done' then now() else null end,
    done_by_name = case when _status = 'done' then public.team_who() else null end
  where id = _id and not archived;
  if not found then raise exception 'Tâche introuvable.'; end if;
end;
$$;

-- Archiver : l'auteur de la tâche ou un administrateur.
create or replace function public.team_task_archive(_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.team_require_staff();
  update public.team_tasks set archived = true, updated_at = now()
  where id = _id and (created_by = auth.uid() or public.has_any_role(auth.uid(), array['admin']::public.app_role[]));
  if not found then raise exception 'Seul l''auteur de la tâche ou un administrateur peut l''archiver.'; end if;
end;
$$;

create or replace function public.team_task_comment(_task uuid, _body text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.team_require_staff();
  if not exists (select 1 from public.team_tasks where id = _task) then raise exception 'Tâche introuvable.'; end if;
  insert into public.team_task_comments (task_id, body, author_id, author_name) values (_task, btrim(_body), auth.uid(), public.team_who());
  update public.team_tasks set updated_at = now() where id = _task;
end;
$$;

-- ─── Bloc-notes privé ───
create table if not exists public.team_private_notes (
  user_id uuid primary key default auth.uid() references auth.users (id),
  body text not null default '' check (char_length(body) <= 20000),
  updated_at timestamptz not null default now()
);
alter table public.team_private_notes enable row level security;
create policy team_private_notes_own_read on public.team_private_notes for select to authenticated using (user_id = auth.uid() and public.is_staff(auth.uid()));
create policy team_private_notes_own_add on public.team_private_notes for insert to authenticated with check (user_id = auth.uid() and public.is_staff(auth.uid()));
create policy team_private_notes_own_edit on public.team_private_notes for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_staff(auth.uid()));

-- ─── Compteurs du menu : notes non lues, tâches ouvertes pour moi (et en retard) ───
create or replace function public.team_counts()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me uuid := auth.uid(); res jsonb;
begin
  perform public.team_require_staff();
  select jsonb_build_object(
    'unread_notes', (select count(*) from public.team_notes n where not n.archived and n.author_id <> me
      and public.team_note_visible(n.audience, n.author_id)
      and not exists (select 1 from public.team_note_reads r where r.note_id = n.id and r.user_id = me)),
    'my_tasks', (select count(*) from public.team_tasks t where not t.archived and t.status <> 'done'
      and (t.assignee_id = me or (t.assignee_id is null and t.assignee_role is null) or (t.assignee_role is not null and public.has_any_role(me, array[t.assignee_role]::public.app_role[])))),
    'my_overdue', (select count(*) from public.team_tasks t where not t.archived and t.status <> 'done' and t.due_on < (now() at time zone 'America/Toronto')::date
      and (t.assignee_id = me or (t.assignee_id is null and t.assignee_role is null) or (t.assignee_role is not null and public.has_any_role(me, array[t.assignee_role]::public.app_role[]))))
  ) into res;
  return res;
end;
$$;

do $$ begin
  begin alter publication supabase_realtime add table public.team_notes; exception when others then null; end;
  begin alter publication supabase_realtime add table public.team_note_replies; exception when others then null; end;
  begin alter publication supabase_realtime add table public.team_tasks; exception when others then null; end;
  begin alter publication supabase_realtime add table public.team_task_comments; exception when others then null; end;
end $$;

revoke execute on function public.team_who() from public, anon;
revoke execute on function public.team_require_staff() from public, anon;
revoke execute on function public.team_note_visible(text, uuid) from public, anon;
revoke execute on function public.team_note_post(text, text, boolean) from public, anon;
revoke execute on function public.team_note_set(uuid, boolean, boolean) from public, anon;
revoke execute on function public.team_note_mark_read(uuid[]) from public, anon;
revoke execute on function public.team_note_reply(uuid, text) from public, anon;
revoke execute on function public.team_task_save(uuid, text, text, uuid, text, date, uuid, uuid) from public, anon;
revoke execute on function public.team_task_status(uuid, text) from public, anon;
revoke execute on function public.team_task_archive(uuid) from public, anon;
revoke execute on function public.team_task_comment(uuid, text) from public, anon;
revoke execute on function public.team_counts() from public, anon;
grant execute on function public.team_who() to authenticated;
grant execute on function public.team_require_staff() to authenticated;
grant execute on function public.team_note_visible(text, uuid) to authenticated;
grant execute on function public.team_note_post(text, text, boolean) to authenticated;
grant execute on function public.team_note_set(uuid, boolean, boolean) to authenticated;
grant execute on function public.team_note_mark_read(uuid[]) to authenticated;
grant execute on function public.team_note_reply(uuid, text) to authenticated;
grant execute on function public.team_task_save(uuid, text, text, uuid, text, date, uuid, uuid) to authenticated;
grant execute on function public.team_task_status(uuid, text) to authenticated;
grant execute on function public.team_task_archive(uuid) to authenticated;
grant execute on function public.team_task_comment(uuid, text) to authenticated;
grant execute on function public.team_counts() to authenticated;
