-- Tables qui citent une commande (clé étrangère vers orders), lues par la remise à zéro au moment
-- où on la lance : une table ajoutée plus tard est vue tout de suite, sans liste à tenir à jour.
-- on_delete : a = refuse, r = refuse, c = suit la commande, n = vidé, d = valeur par défaut.
create or replace function public.order_references()
returns table (tbl text, col text, on_delete text)
language sql stable security definer set search_path to '' as $$
  select c.conrelid::regclass::text, a.attname::text, c.confdeltype::text
  from pg_catalog.pg_constraint c
  join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
  where c.contype = 'f' and c.confrelid = 'public.orders'::regclass
  order by 1, 2
$$;
revoke all on function public.order_references() from public, anon, authenticated;
grant execute on function public.order_references() to service_role;
