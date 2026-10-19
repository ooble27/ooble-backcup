-- Cycle de vie d'une tâche, appliqué par la base :
--  • À faire : la personne qui l'a créée (ou un admin) peut encore la modifier ou la retirer.
--  • Une tâche pour un poste ou pour toute l'équipe se « prend » : dès qu'un membre la prend, elle est à lui
--    et les autres ne peuvent plus la commencer ni la cocher.
--  • En cours : plus de modification du contenu ; seule la personne qui la fait (ou l'auteur, ou un admin)
--    change son état et coche ses étapes ; les commentaires restent ouverts.
--  • Fait : tout est figé (ni modification, ni étapes, ni commentaires). L'auteur ou un admin peut la rouvrir
--    ou l'archiver.
--  • Passation : mes tâches ouvertes repartent à l'équipe (« à reprendre »), mes commandes ouvertes sont libérées ;
--    quelqu'un d'autre les prend. Une même passation ne part pas deux fois.
-- Les tâches ne déclenchent plus de courriel : notifications sur le téléphone seulement.

alter table public.team_tasks add column if not exists handed_off_by_name text;
alter table public.team_tasks add column if not exists handed_off_at timestamptz;

-- Prendre une tâche d'un poste, de toute l'équipe ou reprise d'une passation.
create or replace function public.team_task_take(_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare t record;
begin
  perform public.team_require_staff();
  select * into t from public.team_tasks where id = _id and not archived and removed_at is null for update;
  if t is null then raise exception 'Tâche introuvable.'; end if;
  if t.status = 'done' then raise exception 'Cette tâche est déjà faite.'; end if;
  if t.assignee_id is not null then
    if t.assignee_id = auth.uid() then return; end if;
    raise exception 'Cette tâche a déjà été prise par %.', coalesce((select split_part(coalesce(nullif(btrim(full_name), ''), email), ' ', 1) from public.profiles where id = t.assignee_id), 'un membre');
  end if;
  if not public.team_task_concerns_me(null, t.assignee_role) and not public.has_any_role(auth.uid(), array['admin']::public.app_role[]) then
    raise exception 'Cette tâche est réservée à un autre poste.';
  end if;
  update public.team_tasks set assignee_id = auth.uid(), assignee_role = null, updated_at = now() where id = _id;
end;
$$;
revoke all on function public.team_task_take(uuid) from public, anon;
grant execute on function public.team_task_take(uuid) to authenticated;

-- Modifier : seulement tant qu'elle est « À faire ».
create or replace function public.team_task_save(_id uuid, _title text, _details text, _assignee uuid, _role text, _due date, _client uuid, _order uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
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
  if t.status <> 'todo' then raise exception 'Une tâche commencée ou faite ne se modifie plus.'; end if;
  update public.team_tasks set title = btrim(_title), details = nullif(btrim(coalesce(_details, '')), ''), assignee_id = _assignee, assignee_role = _role,
    due_on = _due, client_id = _client, order_id = _order, updated_at = now()
  where id = _id returning id into tid;
  return tid;
end;
$$;

create or replace function public.team_task_set_steps(_id uuid, _steps text[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare t record; next jsonb := '[]'::jsonb; s text; old jsonb;
begin
  perform public.team_require_staff();
  select * into t from public.team_tasks where id = _id and not archived and removed_at is null;
  if t is null then raise exception 'Tâche introuvable.'; end if;
  if not public.team_task_can_edit(t.created_by) then
    raise exception 'Seule la personne qui a créé la tâche, ou un administrateur, peut changer ses étapes.';
  end if;
  if t.status <> 'todo' then raise exception 'Une tâche commencée ou faite ne se modifie plus.'; end if;
  if coalesce(array_length(_steps, 1), 0) > 30 then raise exception 'Trente étapes au plus.'; end if;
  foreach s in array coalesce(_steps, '{}') loop
    s := left(btrim(s), 200);
    if s = '' then continue; end if;
    select e into old from jsonb_array_elements(t.steps) e where e->>'text' = s limit 1;
    next := next || jsonb_build_array(coalesce(old, jsonb_build_object('text', s, 'done', false)));
  end loop;
  update public.team_tasks set steps = next, updated_at = now() where id = _id;
end;
$$;

-- Changer l'état : commencer une tâche libre la prend ; rouvrir une tâche faite est réservé à l'auteur ou à un admin.
create or replace function public.team_task_status(_id uuid, _status text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare t record; boss boolean;
begin
  perform public.team_require_staff();
  if _status not in ('todo', 'doing', 'done') then raise exception 'État inconnu.'; end if;
  select * into t from public.team_tasks where id = _id and not archived and removed_at is null for update;
  if t is null then raise exception 'Tâche introuvable.'; end if;
  if t.status = _status then return; end if;
  boss := public.team_task_can_edit(t.created_by);
  if t.status = 'done' and not boss then
    raise exception 'Une tâche faite ne peut être rouverte que par la personne qui l''a créée, ou par un administrateur.';
  end if;
  if t.assignee_id is null then
    if not (boss or public.team_task_concerns_me(null, t.assignee_role)) then raise exception 'Cette tâche est réservée à un autre poste.'; end if;
    if _status <> 'todo' then t.assignee_id := auth.uid(); end if;
  elsif t.assignee_id <> auth.uid() and not boss then
    raise exception 'Cette tâche a été prise par quelqu''un d''autre.';
  end if;
  update public.team_tasks set status = _status, assignee_id = t.assignee_id,
    assignee_role = case when t.assignee_id is not null then null else assignee_role end, updated_at = now(),
    done_at = case when _status = 'done' then now() else null end,
    done_by_name = case when _status = 'done' then public.team_who() else null end
  where id = _id;
end;
$$;

-- Cocher une étape : pas sur une tâche faite ; cocher une tâche libre la prend et la met « En cours ».
create or replace function public.team_task_check(_id uuid, _index int, _done boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare t record; boss boolean;
begin
  perform public.team_require_staff();
  select * into t from public.team_tasks where id = _id and not archived and removed_at is null for update;
  if t is null then raise exception 'Tâche introuvable.'; end if;
  if t.status = 'done' then raise exception 'Cette tâche est faite : ses étapes ne changent plus.'; end if;
  boss := public.team_task_can_edit(t.created_by);
  if t.assignee_id is null then
    if not (boss or public.team_task_concerns_me(null, t.assignee_role)) then raise exception 'Cette tâche est réservée à un autre poste.'; end if;
    t.assignee_id := auth.uid();
  elsif t.assignee_id <> auth.uid() and not boss then
    raise exception 'Seule la personne qui fait la tâche peut cocher ses étapes.';
  end if;
  if _index < 0 or _index >= jsonb_array_length(t.steps) then raise exception 'Étape introuvable.'; end if;
  update public.team_tasks set updated_at = now(), assignee_id = t.assignee_id,
    assignee_role = case when t.assignee_id is not null then null else assignee_role end,
    status = case when status = 'todo' and _done then 'doing' else status end,
    steps = jsonb_set(steps, array[_index::text],
      (steps->_index) || case when _done
        then jsonb_build_object('done', true, 'by', public.team_who(), 'at', now())
        else jsonb_build_object('done', false, 'by', null, 'at', null) end)
  where id = _id;
end;
$$;

-- Commentaires : fermés une fois la tâche faite ou archivée.
create or replace function public.team_task_comment(_task uuid, _body text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare t record;
begin
  perform public.team_require_staff();
  select * into t from public.team_tasks where id = _task and removed_at is null;
  if t is null then raise exception 'Tâche introuvable.'; end if;
  if t.archived or t.status = 'done' then raise exception 'Cette tâche est faite : les commentaires sont fermés.'; end if;
  if btrim(coalesce(_body, '')) = '' then raise exception 'Le commentaire est vide.'; end if;
  insert into public.team_task_comments (task_id, body, author_id, author_name) values (_task, left(btrim(_body), 2000), auth.uid(), public.team_who());
  update public.team_tasks set updated_at = now() where id = _task;
end;
$$;

-- Retirer : seulement une tâche pas encore commencée (une tâche faite s'archive).
create or replace function public.team_task_remove(_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare t record;
begin
  perform public.team_require_staff();
  select * into t from public.team_tasks where id = _id and removed_at is null;
  if t is null then raise exception 'Tâche introuvable.'; end if;
  if not public.team_task_can_edit(t.created_by) then raise exception 'Seule la personne qui a créé la tâche, ou un administrateur, peut la retirer.'; end if;
  if t.status <> 'todo' then raise exception 'Une tâche commencée ou faite ne se retire plus : archivez-la une fois faite.'; end if;
  update public.team_tasks set removed_at = now(), removed_by = auth.uid(), updated_at = now() where id = _id;
end;
$$;

-- Archiver : seulement une tâche faite.
create or replace function public.team_task_archive(_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare t record;
begin
  perform public.team_require_staff();
  select * into t from public.team_tasks where id = _id and removed_at is null and not archived;
  if t is null then raise exception 'Tâche introuvable.'; end if;
  if not public.team_task_can_edit(t.created_by) then raise exception 'Seul l''auteur de la tâche ou un administrateur peut l''archiver.'; end if;
  if t.status <> 'done' then raise exception 'Seule une tâche faite s''archive.'; end if;
  update public.team_tasks set archived = true, updated_at = now() where id = _id;
end;
$$;

-- Commentaire : prévient la personne qui fait la tâche, son auteur, et chaque @Prénom mentionné.
create or replace function public.team_push_on_comment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare t record; who uuid[]; tagged uuid[];
begin
  select * into t from public.team_tasks where id = new.task_id;
  if t is null then return new; end if;
  select array_agg(distinct p.id) into tagged
  from public.profiles p
  where exists (select 1 from public.user_roles r where r.user_id = p.id)
    and coalesce(nullif(btrim(p.full_name), ''), '') <> ''
    and new.body ~* ('(^|\s)@' || regexp_replace(split_part(btrim(p.full_name), ' ', 1), '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '(\M|$)');
  select array_agg(distinct u) into who from unnest(array[t.assignee_id, t.created_by] || coalesce(tagged, '{}')) u
  where u is not null and u is distinct from new.author_id;
  if who is not null then
    perform public.team_push(who, case when tagged is not null then 'mentions' else 'tasks' end,
      split_part(coalesce(new.author_name, 'Un membre'), ' ', 1) || ' · ' || left(t.title, 60),
      left(regexp_replace(new.body, '\s+', ' ', 'g'), 140), '/admin?tab=tasks');
  end if;
  return new;
exception when others then
  return new;
end;
$$;
create or replace trigger team_push_comment after insert on public.team_task_comments for each row execute function public.team_push_on_comment();

-- Passation : une seule à la fois (pas de double envoi), et ce qui est rattaché repart à l'équipe.
create or replace function public.team_handoff_post(_body text, _orders uuid[], _tasks uuid[])
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare hid uuid; b text := left(btrim(coalesce(_body, '')), 2000); me uuid := auth.uid(); n_t int := 0; n_o int := 0; who uuid[];
begin
  perform public.team_require_staff();
  if b = '' and coalesce(array_length(_orders, 1), 0) = 0 and coalesce(array_length(_tasks, 1), 0) = 0 then
    raise exception 'Écrivez ce que vous laissez en cours.';
  end if;
  if exists (select 1 from public.team_handoffs where author_id = me and created_at > now() - interval '2 minutes') then
    raise exception 'Votre passation vient d''être transmise.';
  end if;
  -- Mes tâches ouvertes repartent à l'équipe, avec leurs étapes déjà cochées.
  update public.team_tasks set assignee_id = null, assignee_role = null, status = 'todo',
    handed_off_by_name = public.team_who(), handed_off_at = now(), updated_at = now()
  where id = any(coalesce(_tasks, '{}')) and assignee_id = me and status <> 'done' and not archived and removed_at is null;
  get diagnostics n_t = row_count;
  -- Mes commandes ouvertes sont libérées : quelqu'un d'autre les prend dans la file.
  update public.orders set assigned_to = null, assigned_at = null
  where id = any(coalesce(_orders, '{}')) and assigned_to = me and status in ('created', 'awaiting_payment', 'payment_received', 'settling');
  get diagnostics n_o = row_count;
  insert into public.team_handoffs (author_id, author_name, body, order_ids, task_ids)
  values (me, public.team_who(), b, coalesce(_orders[1:50], '{}'), coalesce(_tasks[1:50], '{}'))
  returning id into hid;
  if n_t + n_o > 0 then
    select array_agg(distinct user_id) into who from public.user_roles where user_id <> me;
    if who is not null then
      perform public.team_push(who, 'tasks', 'Passation de ' || split_part(public.team_who(), ' ', 1),
        concat_ws(' et ', case when n_o > 0 then n_o || case when n_o > 1 then ' commandes' else ' commande' end end,
                          case when n_t > 0 then n_t || case when n_t > 1 then ' tâches' else ' tâche' end end) || ' à reprendre',
        '/admin?tab=me');
    end if;
  end if;
  return hid;
end;
$$;
