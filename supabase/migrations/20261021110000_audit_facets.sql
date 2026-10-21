-- Filtres du journal d'audit : toutes les actions et tous les objets jamais journalisés
-- (avant : seulement ceux des 2 000 dernières entrées). Mêmes lecteurs que le journal : les administrateurs.
create or replace function public.audit_facets()
returns jsonb language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Réservé aux administrateurs.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'actions', coalesce((select jsonb_agg(a order by a) from (select distinct action a from public.admin_audit_log where action is not null) x), '[]'::jsonb),
    'entityKinds', coalesce((select jsonb_agg(k order by k) from (select distinct entity_kind k from public.admin_audit_log where entity_kind is not null) y), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.audit_facets() from public, anon;
grant execute on function public.audit_facets() to authenticated;
