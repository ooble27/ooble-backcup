-- La plateforme, quand elle agit seule, s'appelle Oli dans le fil d'activité de l'équipe.
do $$
declare f record;
begin
  for f in select p.oid from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
    and p.proname = 'team_activity_feed' and pg_get_functiondef(p.oid) ~ 'Système'
  loop
    execute replace(pg_get_functiondef(f.oid), '''Système''', '''Oli''');
  end loop;
end $$;
