-- Notifications sur le téléphone pour l'équipe : @mention, tâche confiée ou à échéance, commande à prendre.
-- Chacun choisit ce qu'il reçoit dans son profil (tout est coché par défaut). Les envois passent par la
-- fonction team-notify, avec le même secret que les tâches planifiées. Rien ne part vers les clients.

create table if not exists public.team_push_prefs (
  user_id uuid primary key,
  mentions boolean not null default true,
  tasks boolean not null default true,
  orders boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.team_push_prefs enable row level security;
revoke all on public.team_push_prefs from public, anon, authenticated;

-- Commandes déjà annoncées à l'équipe (une seule alerte par commande).
create table if not exists public.team_push_orders_sent (
  order_id uuid primary key,
  sent_at timestamptz not null default now()
);
alter table public.team_push_orders_sent enable row level security;
revoke all on public.team_push_orders_sent from public, anon, authenticated;

-- Mes choix (cochés par défaut).
create or replace function public.team_push_prefs_get()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare p public.team_push_prefs;
begin
  perform public.team_require_staff();
  select * into p from public.team_push_prefs where user_id = auth.uid();
  return jsonb_build_object('mentions', coalesce(p.mentions, true), 'tasks', coalesce(p.tasks, true), 'orders', coalesce(p.orders, true));
end;
$$;
revoke all on function public.team_push_prefs_get() from public, anon;
grant execute on function public.team_push_prefs_get() to authenticated;

create or replace function public.team_push_prefs_save(_mentions boolean, _tasks boolean, _orders boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.team_require_staff();
  insert into public.team_push_prefs (user_id, mentions, tasks, orders, updated_at)
  values (auth.uid(), _mentions, _tasks, _orders, now())
  on conflict (user_id) do update set mentions = excluded.mentions, tasks = excluded.tasks, orders = excluded.orders, updated_at = now();
end;
$$;
revoke all on function public.team_push_prefs_save(boolean, boolean, boolean) from public, anon;
grant execute on function public.team_push_prefs_save(boolean, boolean, boolean) to authenticated;

-- Envoi : seulement aux membres de l'équipe qui ont gardé ce type d'alerte et un appareil abonné.
-- Ne bloque jamais l'action qui l'a déclenché.
create or replace function public.team_push(_users uuid[], _kind text, _title text, _body text, _url text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare ids uuid[];
begin
  select array_agg(distinct u) into ids
  from unnest(_users) u
  where u is not null
    and exists (select 1 from public.user_roles r where r.user_id = u)
    and exists (select 1 from public.push_subscriptions s where s.user_id = u)
    and coalesce((select case _kind when 'mentions' then p.mentions when 'tasks' then p.tasks when 'orders' then p.orders end
                  from public.team_push_prefs p where p.user_id = u), true);
  if ids is null then return; end if;
  perform net.http_post(
    url := 'https://uukxacjjviiktmbikdwp.supabase.co/functions/v1/team-notify',
    headers := public.cron_headers(),
    body := jsonb_build_object('user_ids', to_jsonb(ids), 'title', _title, 'body', _body, 'url', _url),
    timeout_milliseconds := 30000
  );
exception when others then
  null;
end;
$$;
revoke all on function public.team_push(uuid[], text, text, text, text) from public, anon, authenticated;

-- Membres d'un poste (ou toute l'équipe si aucun poste n'est indiqué).
create or replace function public.team_push_people(_assignee uuid, _role text)
returns uuid[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when _assignee is not null then array[_assignee]
    when _role is null then (select array_agg(distinct user_id) from public.user_roles)
    else (select array_agg(distinct user_id) from public.user_roles where role::text = _role)
  end;
$$;
revoke all on function public.team_push_people(uuid, text) from public, anon, authenticated;

-- @mention dans la messagerie.
create or replace function public.team_push_on_note()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare who uuid[];
begin
  if coalesce(array_length(new.mentions, 1), 0) = 0 then return new; end if;
  select array_agg(m) into who from unnest(new.mentions) m where m is distinct from new.author_id;
  if who is not null then
    perform public.team_push(who, 'mentions',
      split_part(trim(coalesce(new.author_name, 'Un membre')), ' ', 1) || ' vous a mentionné',
      left(regexp_replace(new.body, '\s+', ' ', 'g'), 140),
      '/admin?tab=notes');
  end if;
  return new;
exception when others then
  return new;
end;
$$;
create or replace trigger team_push_note after insert on public.team_notes for each row execute function public.team_push_on_note();

-- Tâche confiée (création, ou changement de personne ou de poste).
create or replace function public.team_push_on_task()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare who uuid[];
begin
  if new.removed_at is not null or new.archived or new.status = 'done' then return new; end if;
  if tg_op = 'UPDATE' and new.assignee_id is not distinct from old.assignee_id and new.assignee_role is not distinct from old.assignee_role then
    return new;
  end if;
  select array_agg(u) into who from unnest(public.team_push_people(new.assignee_id, new.assignee_role)) u
  where u is distinct from coalesce(auth.uid(), new.created_by);
  if who is not null then
    perform public.team_push(who, 'tasks',
      'Tâche confiée par ' || split_part(trim(coalesce(new.created_by_name, 'l''équipe')), ' ', 1),
      left(new.title, 120) || case when new.due_on is not null then ' · pour le ' || to_char(new.due_on, 'DD/MM') else '' end,
      '/admin?tab=tasks');
  end if;
  return new;
exception when others then
  return new;
end;
$$;
create or replace trigger team_push_task after insert or update of assignee_id, assignee_role on public.team_tasks for each row execute function public.team_push_on_task();

-- Chaque matin : les tâches à faire aujourd'hui ou en retard, un seul message par personne.
create or replace function public.team_push_due()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  today date := (now() at time zone 'America/Toronto')::date;
  r record;
begin
  for r in
    select u.user_id,
           count(*) as n,
           count(*) filter (where t.due_on < today) as late,
           min(t.title) as one
    from (select distinct user_id from public.user_roles) u
    join public.team_tasks t on t.removed_at is null and not t.archived and t.status <> 'done' and t.due_on <= today
      and (t.assignee_id = u.user_id
           or (t.assignee_id is null and t.assignee_role is null)
           or (t.assignee_id is null and exists (select 1 from public.user_roles x where x.user_id = u.user_id and x.role::text = t.assignee_role)))
    group by u.user_id
  loop
    perform public.team_push(array[r.user_id], 'tasks',
      case when r.n = 1 then 'Une tâche pour aujourd''hui' else r.n || ' tâches pour aujourd''hui' end,
      case when r.n = 1 then left(r.one, 120) || case when r.late > 0 then ' (en retard)' else '' end
           else case when r.late > 0 then 'Dont ' || r.late || ' en retard.' else 'À voir dans Tâches.' end end,
      '/admin?tab=tasks');
  end loop;
end;
$$;
revoke all on function public.team_push_due() from public, anon, authenticated;

-- Chaque minute : une commande payée attend depuis 2 minutes sans personne pour la prendre.
create or replace function public.team_push_orders()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  o record;
  who uuid[];
begin
  select array_agg(distinct user_id) into who from public.user_roles where role::text in ('admin', 'operator');
  for o in
    select id, side, cad_amount from public.orders
    where status = 'payment_received' and assigned_to is null and not coalesce(hidden, false)
      and updated_at < now() - interval '2 minutes' and updated_at > now() - interval '1 day'
      and not exists (select 1 from public.team_push_orders_sent s where s.order_id = orders.id)
    order by updated_at limit 20
  loop
    insert into public.team_push_orders_sent (order_id) values (o.id) on conflict do nothing;
    if who is not null then
      perform public.team_push(who, 'orders', 'Commande à prendre',
        case when o.side = 'buy' then 'Achat' else 'Vente' end || ' de ' || replace(to_char(o.cad_amount, 'FM999999990.00'), '.', ',') || ' $ · OOB-' || upper(left(o.id::text, 8)),
        '/admin?tab=queue');
    end if;
  end loop;
end;
$$;
revoke all on function public.team_push_orders() from public, anon, authenticated;

-- Les commandes déjà en attente aujourd'hui ne déclenchent pas d'alerte à la mise en route.
insert into public.team_push_orders_sent (order_id)
select id from public.orders where status = 'payment_received'
on conflict do nothing;

select cron.schedule('team-push-orders', '* * * * *', 'select public.team_push_orders();');
select cron.schedule('team-push-due', '47 12 * * *', 'select public.team_push_due();');
