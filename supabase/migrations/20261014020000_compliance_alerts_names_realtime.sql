-- Conformité : le nom de qui suit l'alerte et de qui l'a fermée, signé par la base.
alter table public.compliance_alerts
  add column if not exists assigned_name text,
  add column if not exists closed_by_name text;

create or replace function public.compliance_alert_names()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.assigned_to is distinct from (case when tg_op = 'UPDATE' then old.assigned_to end) then
    new.assigned_name := (select coalesce(nullif(trim(p.full_name), ''), p.email) from public.profiles p where p.id = new.assigned_to);
  end if;
  if new.closed_by is distinct from (case when tg_op = 'UPDATE' then old.closed_by end) then
    new.closed_by_name := (select coalesce(nullif(trim(p.full_name), ''), p.email) from public.profiles p where p.id = new.closed_by);
  end if;
  return new;
end;
$function$;
revoke execute on function public.compliance_alert_names() from anon, authenticated, public;

create or replace trigger trg_compliance_alert_names before insert or update on public.compliance_alerts
  for each row execute function public.compliance_alert_names();

-- Noms des alertes déjà suivies ou fermées.
update public.compliance_alerts a set
  assigned_name = (select coalesce(nullif(trim(p.full_name), ''), p.email) from public.profiles p where p.id = a.assigned_to),
  closed_by_name = (select coalesce(nullif(trim(p.full_name), ''), p.email) from public.profiles p where p.id = a.closed_by)
where a.assigned_name is null and a.closed_by_name is null;

-- Les nouvelles alertes arrivent en direct.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'compliance_alerts') then
    alter publication supabase_realtime add table public.compliance_alerts;
  end if;
end $$;
