-- Commandes masquées (essais avant le lancement) : elles restent en base, mais sortent aussi
-- du registre des opérations, de ses PDF et de la page Conformité. Les alertes ne s'effacent
-- jamais (trg_compliance_alerts_no_delete) : celles d'une commande masquée sont masquées à leur tour.

alter table public.compliance_alerts add column if not exists hidden boolean not null default false;

update public.compliance_alerts a set hidden = true
  from public.orders o
 where o.hidden and (a.order_id = o.id or o.id = any (a.order_ids)) and not a.hidden;

-- Registre, statistiques et opérations : les commandes masquées n'y figurent plus, comme les commandes de test.
do $$
declare f record; src text;
begin
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('compliance_ops', 'compliance_register', 'compliance_register_client', 'compliance_register_stats')
  loop
    src := pg_get_functiondef(f.oid);
    src := replace(src, 'where not is_test and not is_test', 'where not is_test and not hidden');
    src := replace(src, 'where not is_test and status in', 'where not is_test and not hidden and status in');
    execute src;
  end loop;
end $$;

-- Masquer une commande masque aussi ses alertes.
create or replace function public.hide_order_alerts()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  update public.compliance_alerts set hidden = true
   where not hidden and (order_id = new.id or new.id = any (order_ids));
  return new;
end;
$$;
revoke all on function public.hide_order_alerts() from public, anon, authenticated;
create or replace trigger trg_hide_order_alerts after update of hidden on public.orders
  for each row when (new.hidden and not old.hidden) execute function public.hide_order_alerts();
