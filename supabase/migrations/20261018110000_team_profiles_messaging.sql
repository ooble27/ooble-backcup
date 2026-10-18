-- Espace de l'équipe, deuxième version : profil de chaque membre (avatar choisi ou photo, fond de
-- l'avatar, couleur du nom, statut), messagerie solide (pages, modification, retrait, mentions)
-- et tâches qui n'encombrent pas (retrait, rangement automatique des tâches faites).
-- « Retirer » masque partout ; la ligne reste en base avec sa date (jamais effacée).

-- ─── Profil d'équipe ───
create table if not exists public.team_profiles (
  user_id uuid primary key references auth.users (id),
  avatar_seed text check (avatar_seed is null or char_length(avatar_seed) between 1 and 64),
  photo text check (photo is null or (photo like 'data:image/%' and char_length(photo) <= 150000)),
  avatar_bg text not null default 'light' check (avatar_bg in ('light', 'coral', 'orange', 'sun', 'sage', 'teal', 'indigo', 'blue', 'pink')),
  color text check (color is null or color in ('coral', 'orange', 'sun', 'sage', 'teal', 'indigo', 'blue', 'pink')),
  status text not null default 'available' check (status in ('available', 'busy', 'away')),
  status_until date,
  status_note text check (status_note is null or char_length(status_note) <= 80),
  updated_at timestamptz not null default now()
);
alter table public.team_profiles enable row level security;
create policy team_profiles_read on public.team_profiles for select to authenticated using (public.is_staff(auth.uid()));

create or replace function public.team_profile_save(_seed text, _photo text, _bg text, _color text, _status text, _until date, _note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.team_require_staff();
  insert into public.team_profiles (user_id, avatar_seed, photo, avatar_bg, color, status, status_until, status_note, updated_at)
  values (auth.uid(), nullif(btrim(coalesce(_seed, '')), ''), _photo, coalesce(_bg, 'light'), _color, coalesce(_status, 'available'),
    case when _status = 'away' then _until end, nullif(btrim(coalesce(_note, '')), ''), now())
  on conflict (user_id) do update set avatar_seed = excluded.avatar_seed, photo = excluded.photo, avatar_bg = excluded.avatar_bg, color = excluded.color,
    status = excluded.status, status_until = excluded.status_until, status_note = excluded.status_note, updated_at = now();
end;
$$;

-- Annuaire : chaque membre avec son profil. Sans couleur choisie, une couleur différente est
-- donnée à chacun dans l'ordre d'arrivée ; une absence dont la date est passée redevient « disponible ».
create or replace function public.team_directory()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare palette text[] := array['coral', 'indigo', 'sage', 'orange', 'blue', 'pink', 'teal', 'sun'];
begin
  perform public.team_require_staff();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', m.user_id, 'name', m.name, 'email', m.email, 'roles', m.roles,
      'seed', tp.avatar_seed, 'photo', tp.photo, 'bg', coalesce(tp.avatar_bg, 'light'),
      'color', coalesce(tp.color, palette[1 + ((m.rank - 1) % 8)]),
      'status', case when tp.status = 'away' and tp.status_until is not null and tp.status_until < (now() at time zone 'America/Toronto')::date then 'available' else coalesce(tp.status, 'available') end,
      'status_until', tp.status_until, 'status_note', tp.status_note) order by m.name)
    from (
      select r.user_id, r.roles, coalesce(nullif(btrim(p.full_name), ''), p.email, 'Membre') as name, p.email,
        row_number() over (order by r.since, r.user_id) as rank
      from (select user_id, jsonb_agg(role::text) as roles, min(coalesce(created_at, now())) as since from public.user_roles group by user_id) r
      left join public.profiles p on p.id = r.user_id
    ) m
    left join public.team_profiles tp on tp.user_id = m.user_id), '[]'::jsonb);
end;
$$;

-- ─── Notes : modification, retrait, mentions ───
alter table public.team_notes add column if not exists edited_at timestamptz;
alter table public.team_notes add column if not exists removed_at timestamptz;
alter table public.team_notes add column if not exists removed_by uuid references auth.users (id);
alter table public.team_notes add column if not exists mentions uuid[] not null default '{}';
alter table public.team_note_replies add column if not exists edited_at timestamptz;
alter table public.team_note_replies add column if not exists removed_at timestamptz;
create index if not exists team_notes_channel_idx on public.team_notes (audience, created_at desc) where removed_at is null;

alter policy team_notes_read on public.team_notes using (removed_at is null and public.team_note_visible(audience, author_id));
alter policy team_note_replies_read on public.team_note_replies using (removed_at is null
  and exists (select 1 from public.team_notes n where n.id = note_id and n.removed_at is null and public.team_note_visible(n.audience, n.author_id)));

-- Envoi avec mentions : seules les personnes qui voient le canal peuvent être mentionnées.
create or replace function public.team_note_send(_body text, _audience text, _pinned boolean, _mentions uuid[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare nid uuid; valid uuid[];
begin
  nid := public.team_note_post(_body, _audience, _pinned);
  select coalesce(array_agg(distinct u), '{}') into valid from unnest(coalesce(_mentions, '{}')) u
  where public.is_staff(u) and (coalesce(_audience, 'all') = 'all' or public.has_any_role(u, array[_audience::public.app_role, 'admin'::public.app_role]));
  update public.team_notes set mentions = valid where id = nid;
  return nid;
end;
$$;

create or replace function public.team_note_edit(_id uuid, _body text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.team_require_staff();
  if btrim(coalesce(_body, '')) = '' then raise exception 'Le message est vide.'; end if;
  update public.team_notes set body = btrim(_body), edited_at = now()
  where id = _id and author_id = auth.uid() and removed_at is null and not archived;
  if not found then raise exception 'Seul l''auteur peut modifier son message.'; end if;
end;
$$;

create or replace function public.team_note_remove(_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.team_require_staff();
  update public.team_notes set removed_at = now(), removed_by = auth.uid(), pinned = false
  where id = _id and removed_at is null and (author_id = auth.uid() or public.has_any_role(auth.uid(), array['admin']::public.app_role[]));
  if not found then raise exception 'Seul l''auteur ou un administrateur peut retirer ce message.'; end if;
end;
$$;

create or replace function public.team_reply_edit(_id uuid, _body text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.team_require_staff();
  if btrim(coalesce(_body, '')) = '' then raise exception 'La réponse est vide.'; end if;
  update public.team_note_replies set body = btrim(_body), edited_at = now() where id = _id and author_id = auth.uid() and removed_at is null;
  if not found then raise exception 'Seul l''auteur peut modifier sa réponse.'; end if;
end;
$$;

create or replace function public.team_reply_remove(_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.team_require_staff();
  update public.team_note_replies set removed_at = now()
  where id = _id and removed_at is null and (author_id = auth.uid() or public.has_any_role(auth.uid(), array['admin']::public.app_role[]));
  if not found then raise exception 'Seul l''auteur ou un administrateur peut retirer cette réponse.'; end if;
end;
$$;

-- Les fonctions existantes ignorent désormais les messages retirés.
create or replace function public.team_note_set(_id uuid, _pinned boolean, _archived boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare n record; is_admin boolean := public.has_any_role(auth.uid(), array['admin']::public.app_role[]);
begin
  perform public.team_require_staff();
  select * into n from public.team_notes where id = _id and removed_at is null;
  if n is null then raise exception 'Note introuvable.'; end if;
  if _pinned is not null and _pinned is distinct from n.pinned and not is_admin then raise exception 'Seul un administrateur peut épingler une note.'; end if;
  if _archived is not null and _archived is distinct from n.archived and not (is_admin or n.author_id = auth.uid()) then
    raise exception 'Seul l''auteur ou un administrateur peut archiver cette note.';
  end if;
  update public.team_notes set pinned = coalesce(_pinned, pinned), archived = coalesce(_archived, archived) where id = _id;
end;
$$;

create or replace function public.team_note_reply(_note uuid, _body text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.team_require_staff();
  if not exists (select 1 from public.team_notes n where n.id = _note and not n.archived and n.removed_at is null and public.team_note_visible(n.audience, n.author_id)) then
    raise exception 'Note introuvable.';
  end if;
  insert into public.team_note_replies (note_id, body, author_id, author_name) values (_note, btrim(_body), auth.uid(), public.team_who());
end;
$$;

-- Non lus par canal, et mentions non lues.
create or replace function public.team_note_unread()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me uuid := auth.uid(); res jsonb;
begin
  perform public.team_require_staff();
  select jsonb_build_object(
    'channels', coalesce((select jsonb_object_agg(audience, n) from (
      select n.audience, count(*) as n from public.team_notes n
      where not n.archived and n.removed_at is null and n.author_id <> me and public.team_note_visible(n.audience, n.author_id)
        and not exists (select 1 from public.team_note_reads r where r.note_id = n.id and r.user_id = me)
      group by n.audience) x), '{}'::jsonb),
    'mentions', (select count(*) from public.team_notes n where not n.archived and n.removed_at is null and me = any (n.mentions)
      and not exists (select 1 from public.team_note_reads r where r.note_id = n.id and r.user_id = me)),
    'mention_channels', coalesce((select jsonb_object_agg(audience, n) from (
      select n.audience, count(*) as n from public.team_notes n where not n.archived and n.removed_at is null and me = any (n.mentions)
        and not exists (select 1 from public.team_note_reads r where r.note_id = n.id and r.user_id = me)
      group by n.audience) x), '{}'::jsonb)
  ) into res;
  return res;
end;
$$;

-- Qui a des notes à lire dans un canal (pour la liste « Dans ce canal »).
create or replace function public.team_channel_readers(_audience text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.team_require_staff();
  if _audience <> 'all' and not public.has_any_role(auth.uid(), array[_audience::public.app_role, 'admin'::public.app_role]) then
    raise exception 'Canal réservé à ce poste.';
  end if;
  return coalesce((
    select jsonb_object_agg(u.user_id, (
      select count(*) from public.team_notes n
      where n.audience = _audience and not n.archived and n.removed_at is null and n.author_id <> u.user_id
        and not exists (select 1 from public.team_note_reads r where r.note_id = n.id and r.user_id = u.user_id)))
    from (select distinct user_id from public.user_roles) u), '{}'::jsonb);
end;
$$;

-- ─── Tâches : retrait, rangement des tâches faites ───
alter table public.team_tasks add column if not exists removed_at timestamptz;
alter table public.team_tasks add column if not exists removed_by uuid references auth.users (id);
alter policy team_tasks_read on public.team_tasks using (removed_at is null and public.is_staff(auth.uid()));

create or replace function public.team_task_remove(_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.team_require_staff();
  update public.team_tasks set removed_at = now(), removed_by = auth.uid(), updated_at = now()
  where id = _id and removed_at is null and public.team_task_can_edit(created_by);
  if not found then raise exception 'Seule la personne qui a créé la tâche, ou un administrateur, peut la retirer.'; end if;
end;
$$;

-- Range (archive) les tâches faites : toutes pour un administrateur, sinon celles créées par
-- moi ou qui me concernent. Rangement automatique chaque nuit après 7 jours.
create or replace function public.team_tasks_tidy_mine()
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform public.team_require_staff();
  update public.team_tasks set archived = true, updated_at = now()
  where status = 'done' and not archived and removed_at is null
    and (public.has_any_role(auth.uid(), array['admin']::public.app_role[]) or created_by = auth.uid() or public.team_task_concerns_me(assignee_id, assignee_role));
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.team_tasks_tidy()
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.team_tasks set archived = true, updated_at = now()
  where status = 'done' and not archived and removed_at is null and done_at < now() - interval '7 days';
  get diagnostics n = row_count;
  return n;
end;
$$;
select cron.schedule('team-tasks-tidy', '17 4 * * *', $cron$ select public.team_tasks_tidy(); $cron$);

-- Les fonctions de tâches ignorent les tâches retirées.
create or replace function public.team_task_status(_id uuid, _status text)
returns void language plpgsql security definer set search_path = '' as $$
declare t record;
begin
  perform public.team_require_staff();
  if _status not in ('todo', 'doing', 'done') then raise exception 'État inconnu.'; end if;
  select * into t from public.team_tasks where id = _id and not archived and removed_at is null;
  if t is null then raise exception 'Tâche introuvable.'; end if;
  if not (public.team_task_can_edit(t.created_by) or public.team_task_concerns_me(t.assignee_id, t.assignee_role)) then
    raise exception 'Seules la personne qui reçoit la tâche et celle qui l''a créée peuvent changer son état.';
  end if;
  update public.team_tasks set status = _status, updated_at = now(),
    done_at = case when _status = 'done' then now() else null end,
    done_by_name = case when _status = 'done' then public.team_who() else null end
  where id = _id;
end;
$$;

create or replace function public.team_task_comment(_task uuid, _body text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.team_require_staff();
  if not exists (select 1 from public.team_tasks where id = _task and removed_at is null) then raise exception 'Tâche introuvable.'; end if;
  insert into public.team_task_comments (task_id, body, author_id, author_name) values (_task, btrim(_body), auth.uid(), public.team_who());
  update public.team_tasks set updated_at = now() where id = _task;
end;
$$;

create or replace function public.team_task_save(_id uuid, _title text, _details text, _assignee uuid, _role text,
  _due date, _client uuid, _order uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare tid uuid; t record;
begin
  perform public.team_require_staff();
  if _assignee is not null and not public.is_staff(_assignee) then raise exception 'Cette personne ne fait pas partie de l''équipe.'; end if;
  if _id is null then
    insert into public.team_tasks (title, details, assignee_id, assignee_role, due_on, client_id, order_id, created_by, created_by_name)
    values (btrim(_title), nullif(btrim(coalesce(_details, '')), ''), _assignee, _role, _due, _client, _order, auth.uid(), public.team_who())
    returning id into tid;
    return tid;
  end if;
  select * into t from public.team_tasks where id = _id and not archived and removed_at is null;
  if t is null then raise exception 'Tâche introuvable.'; end if;
  if not public.team_task_can_edit(t.created_by) then
    raise exception 'Seule la personne qui a créé la tâche, ou un administrateur, peut la modifier.';
  end if;
  update public.team_tasks set title = btrim(_title), details = nullif(btrim(coalesce(_details, '')), ''), assignee_id = _assignee, assignee_role = _role,
    due_on = _due, client_id = _client, order_id = _order, updated_at = now()
  where id = _id returning id into tid;
  return tid;
end;
$$;

-- Compteurs du menu (sans les messages ni les tâches retirés) ; les mentions comptent.
create or replace function public.team_counts()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me uuid := auth.uid(); res jsonb;
begin
  perform public.team_require_staff();
  select jsonb_build_object(
    'unread_notes', (select count(*) from public.team_notes n where not n.archived and n.removed_at is null and n.author_id <> me
      and public.team_note_visible(n.audience, n.author_id)
      and not exists (select 1 from public.team_note_reads r where r.note_id = n.id and r.user_id = me)),
    'mentions', (select count(*) from public.team_notes n where not n.archived and n.removed_at is null and me = any (n.mentions)
      and not exists (select 1 from public.team_note_reads r where r.note_id = n.id and r.user_id = me)),
    'my_tasks', (select count(*) from public.team_tasks t where not t.archived and t.removed_at is null and t.status <> 'done'
      and (t.assignee_id = me or (t.assignee_id is null and t.assignee_role is null) or (t.assignee_role is not null and public.has_any_role(me, array[t.assignee_role]::public.app_role[])))),
    'my_overdue', (select count(*) from public.team_tasks t where not t.archived and t.removed_at is null and t.status <> 'done' and t.due_on < (now() at time zone 'America/Toronto')::date
      and (t.assignee_id = me or (t.assignee_id is null and t.assignee_role is null) or (t.assignee_role is not null and public.has_any_role(me, array[t.assignee_role]::public.app_role[]))))
  ) into res;
  return res;
end;
$$;

do $$ begin
  begin alter publication supabase_realtime add table public.team_profiles; exception when others then null; end;
end $$;

revoke execute on function public.team_profile_save(text, text, text, text, text, date, text) from public, anon;
revoke execute on function public.team_note_send(text, text, boolean, uuid[]) from public, anon;
revoke execute on function public.team_note_edit(uuid, text) from public, anon;
revoke execute on function public.team_note_remove(uuid) from public, anon;
revoke execute on function public.team_reply_edit(uuid, text) from public, anon;
revoke execute on function public.team_reply_remove(uuid) from public, anon;
revoke execute on function public.team_note_unread() from public, anon;
revoke execute on function public.team_channel_readers(text) from public, anon;
revoke execute on function public.team_task_remove(uuid) from public, anon;
revoke execute on function public.team_tasks_tidy_mine() from public, anon;
revoke execute on function public.team_tasks_tidy() from public, anon, authenticated;
grant execute on function public.team_profile_save(text, text, text, text, text, date, text) to authenticated;
grant execute on function public.team_note_send(text, text, boolean, uuid[]) to authenticated;
grant execute on function public.team_note_edit(uuid, text) to authenticated;
grant execute on function public.team_note_remove(uuid) to authenticated;
grant execute on function public.team_reply_edit(uuid, text) to authenticated;
grant execute on function public.team_reply_remove(uuid) to authenticated;
grant execute on function public.team_note_unread() to authenticated;
grant execute on function public.team_channel_readers(text) to authenticated;
grant execute on function public.team_task_remove(uuid) to authenticated;
grant execute on function public.team_tasks_tidy_mine() to authenticated;
