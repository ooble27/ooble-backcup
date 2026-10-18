-- Listes de contrôle dans les tâches : des étapes à cocher (« 3 sur 5 ») et des modèles de listes.
-- Qui crée la tâche (ou un administrateur) écrit les étapes ; qui la reçoit les coche.

alter table public.team_tasks add column if not exists steps jsonb not null default '[]'::jsonb;

-- Écrit les étapes d'une tâche ; une étape gardée à l'identique garde sa coche.
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
revoke all on function public.team_task_set_steps(uuid, text[]) from public, anon;
grant execute on function public.team_task_set_steps(uuid, text[]) to authenticated;

-- Coche ou décoche une étape (même droit que pour changer l'état de la tâche).
create or replace function public.team_task_check(_id uuid, _index int, _done boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare t record;
begin
  perform public.team_require_staff();
  select * into t from public.team_tasks where id = _id and not archived and removed_at is null;
  if t is null then raise exception 'Tâche introuvable.'; end if;
  if not (public.team_task_can_edit(t.created_by) or public.team_task_concerns_me(t.assignee_id, t.assignee_role)) then
    raise exception 'Seules la personne qui reçoit la tâche et celle qui l''a créée peuvent cocher ses étapes.';
  end if;
  if _index < 0 or _index >= jsonb_array_length(t.steps) then raise exception 'Étape introuvable.'; end if;
  update public.team_tasks set updated_at = now(),
    steps = jsonb_set(steps, array[_index::text],
      (steps->_index) || case when _done
        then jsonb_build_object('done', true, 'by', public.team_who(), 'at', now())
        else jsonb_build_object('done', false, 'by', null, 'at', null) end)
  where id = _id;
end;
$$;
revoke all on function public.team_task_check(uuid, int, boolean) from public, anon;
grant execute on function public.team_task_check(uuid, int, boolean) to authenticated;

-- Modèles de listes enregistrés par l'équipe (en plus des modèles fournis dans l'app).
create table if not exists public.team_checklist_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  steps text[] not null default '{}',
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  removed_at timestamptz
);
alter table public.team_checklist_templates enable row level security;
revoke all on public.team_checklist_templates from public, anon, authenticated;
grant select on public.team_checklist_templates to authenticated;
create policy team_checklist_templates_read on public.team_checklist_templates
  for select to authenticated using (public.is_staff(auth.uid()) and removed_at is null);

create or replace function public.team_checklist_template_save(_name text, _steps text[])
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare tid uuid; clean text[];
begin
  perform public.team_require_staff();
  if btrim(coalesce(_name, '')) = '' then raise exception 'Donnez un nom au modèle.'; end if;
  select array_agg(left(btrim(x), 200)) into clean from unnest(_steps) x where btrim(x) <> '';
  if coalesce(array_length(clean, 1), 0) = 0 then raise exception 'Le modèle n''a aucune étape.'; end if;
  insert into public.team_checklist_templates (name, steps, created_by, created_by_name)
  values (left(btrim(_name), 80), clean[1:30], auth.uid(), public.team_who())
  returning id into tid;
  return tid;
end;
$$;
revoke all on function public.team_checklist_template_save(text, text[]) from public, anon;
grant execute on function public.team_checklist_template_save(text, text[]) to authenticated;

-- Retirer un modèle : il n'est plus proposé (rien n'est effacé).
create or replace function public.team_checklist_template_hide(_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare t record;
begin
  perform public.team_require_staff();
  select * into t from public.team_checklist_templates where id = _id and removed_at is null;
  if t is null then raise exception 'Modèle introuvable.'; end if;
  if not public.team_task_can_edit(t.created_by) then raise exception 'Seule la personne qui a créé le modèle, ou un administrateur, peut le retirer.'; end if;
  update public.team_checklist_templates set removed_at = now() where id = _id;
end;
$$;
revoke all on function public.team_checklist_template_hide(uuid) from public, anon;
grant execute on function public.team_checklist_template_hide(uuid) to authenticated;
