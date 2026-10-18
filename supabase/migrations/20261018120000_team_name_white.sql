-- Couleur du nom « Blanc (d'origine) » : la couleur du texte (blanc en mode sombre, noir en clair).
-- Pour un profil enregistré, elle est gardée comme « aucune couleur » (color vide) ; un membre sans
-- profil reçoit toujours une couleur différente des autres. Aucune donnée existante ne change
-- (tous les profils enregistrés ont déjà une couleur).

create or replace function public.team_profile_save(_seed text, _photo text, _bg text, _color text, _status text, _until date, _note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.team_require_staff();
  insert into public.team_profiles (user_id, avatar_seed, photo, avatar_bg, color, status, status_until, status_note, updated_at)
  values (auth.uid(), nullif(btrim(coalesce(_seed, '')), ''), _photo, coalesce(_bg, 'light'), nullif(_color, 'white'), coalesce(_status, 'available'),
    case when _status = 'away' then _until end, nullif(btrim(coalesce(_note, '')), ''), now())
  on conflict (user_id) do update set avatar_seed = excluded.avatar_seed, photo = excluded.photo, avatar_bg = excluded.avatar_bg, color = excluded.color,
    status = excluded.status, status_until = excluded.status_until, status_note = excluded.status_note, updated_at = now();
end;
$$;

create or replace function public.team_directory()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare palette text[] := array['coral', 'indigo', 'sage', 'orange', 'blue', 'pink', 'teal', 'sun'];
begin
  perform public.team_require_staff();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', m.user_id, 'name', m.name, 'email', m.email, 'roles', m.roles,
      'seed', tp.avatar_seed, 'photo', tp.photo, 'bg', coalesce(tp.avatar_bg, 'light'),
      'color', case when tp.user_id is null then palette[1 + ((m.rank - 1) % 8)] else coalesce(tp.color, 'white') end,
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
