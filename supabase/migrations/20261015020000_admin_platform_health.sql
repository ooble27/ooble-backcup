-- Réglages › Santé : le dernier passage de chaque tâche automatique, et ses échecs des dernières 24 heures.
create or replace function public.admin_platform_health()
returns table (jobname text, schedule text, active boolean, last_start timestamptz, last_end timestamptz, last_status text, last_message text, runs_24h int, failures_24h int)
language plpgsql security definer set search_path to '' as $function$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Réservé aux administrateurs.' using errcode = '42501';
  end if;
  return query
  select j.jobname::text, j.schedule::text, j.active,
         l.start_time, l.end_time, l.status::text, left(l.return_message, 300)::text,
         (select count(*)::int from cron.job_run_details d where d.jobid = j.jobid and d.start_time > now() - interval '24 hours'),
         (select count(*)::int from cron.job_run_details d where d.jobid = j.jobid and d.start_time > now() - interval '24 hours' and d.status = 'failed')
    from cron.job j
    left join lateral (select * from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 1) l on true
   order by j.jobname;
end;
$function$;
revoke execute on function public.admin_platform_health() from anon, public;
grant execute on function public.admin_platform_health() to authenticated;
