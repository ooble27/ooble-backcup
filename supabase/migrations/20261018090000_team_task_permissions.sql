-- Une tâche se modifie par celui qui l'a créée (ou un administrateur). Celui qui la reçoit
-- change seulement son état et la commente.
create or replace function public.team_task_can_edit(_created_by uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select _created_by = auth.uid() or public.has_any_role(auth.uid(), array['admin']::public.app_role[]);
$$;

create or replace function public.team_task_concerns_me(_assignee uuid, _role text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if _assignee = auth.uid() or (_assignee is null and _role is null) then return true; end if;
  if _role is null then return false; end if;
  return public.has_any_role(auth.uid(), array[_role::public.app_role]);
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
  select * into t from public.team_tasks where id = _id and not archived;
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

create or replace function public.team_task_status(_id uuid, _status text)
returns void language plpgsql security definer set search_path = '' as $$
declare t record;
begin
  perform public.team_require_staff();
  if _status not in ('todo', 'doing', 'done') then raise exception 'État inconnu.'; end if;
  select * into t from public.team_tasks where id = _id and not archived;
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

revoke execute on function public.team_task_can_edit(uuid) from public, anon;
revoke execute on function public.team_task_concerns_me(uuid, text) from public, anon;
grant execute on function public.team_task_can_edit(uuid) to authenticated;
grant execute on function public.team_task_concerns_me(uuid, text) to authenticated;
