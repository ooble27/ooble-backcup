-- Annuaire de l'équipe, lisible par tout membre : nom, courriel et postes de chacun (pour confier
-- une tâche, voir qui a lu une note). Les rôles restent modifiables par les administrateurs seuls.
create or replace function public.team_directory()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.team_require_staff();
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', r.user_id, 'name', coalesce(nullif(btrim(p.full_name), ''), p.email, 'Membre'), 'email', p.email, 'roles', r.roles) order by p.full_name)
    from (select user_id, jsonb_agg(role::text) as roles from public.user_roles group by user_id) r
    left join public.profiles p on p.id = r.user_id), '[]'::jsonb);
end;
$$;
revoke execute on function public.team_directory() from public, anon;
grant execute on function public.team_directory() to authenticated;
