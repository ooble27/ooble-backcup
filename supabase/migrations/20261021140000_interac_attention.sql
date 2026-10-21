-- Virements Interac sans référence et ventes à verser : toute l'équipe est prévenue, et Mon espace
-- affiche ce qui attend (bloc « À traiter maintenant »). Aucune nouvelle table.

-- Un avis traité à la main ne réapparaît plus dans Mon espace ; une alerte n'est envoyée qu'une fois.
alter table public.interac_receipts add column if not exists handled_at timestamptz;
alter table public.interac_receipts add column if not exists handled_by_name text;
alter table public.interac_receipts add column if not exists handled_note text;
alter table public.interac_receipts add column if not exists team_alerted_at timestamptz;
-- Les avis déjà présents ne déclenchent pas d'alerte à la mise en route.
update public.interac_receipts set team_alerted_at = now() where team_alerted_at is null;

-- Ce qui attend l'équipe : ventes à verser, achats payés non envoyés, avis Interac sans commande.
create or replace function public.team_attention()
returns jsonb language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.is_staff(auth.uid()) then raise exception 'Réservé à l''équipe.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'sells', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'cad', o.cad_amount, 'status', o.status, 'at', o.updated_at,
        'name', coalesce(nullif(p.business_name, ''), p.full_name), 'assigned', o.assigned_to is not null) order by o.updated_at)
      from public.orders o left join public.profiles p on p.id = o.user_id
      where o.side = 'sell' and o.status in ('payment_received', 'settling') and not o.hidden), '[]'::jsonb),
    'buys', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'cad', o.cad_amount, 'status', o.status, 'at', o.updated_at,
        'name', coalesce(nullif(p.business_name, ''), p.full_name)) order by o.updated_at)
      from public.orders o left join public.profiles p on p.id = o.user_id
      where o.side = 'buy' and o.status = 'payment_received' and not o.hidden and o.updated_at < now() - interval '5 minutes'), '[]'::jsonb),
    'receipts', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'amount', r.amount_cad, 'sender', r.sender_name, 'reason', r.reason,
        'status', r.status, 'at', r.received_at, 'order_id', r.order_id,
        -- Commande probable : achat en attente du même montant, créé dans les 48 heures avant l'avis.
        'suggest', (select jsonb_build_object('id', o.id, 'name', coalesce(nullif(p.business_name, ''), p.full_name), 'cad', o.cad_amount, 'at', o.created_at)
          from public.orders o left join public.profiles p on p.id = o.user_id
          where r.order_id is null and o.side = 'buy' and not o.hidden and o.status in ('created', 'awaiting_payment')
            and r.amount_cad is not null and abs(o.cad_amount - r.amount_cad) < 0.01
            and o.created_at between r.received_at - interval '48 hours' and r.received_at
          order by o.created_at desc limit 1)) order by r.received_at desc)
      from public.interac_receipts r
      where r.status in ('unmatched', 'mismatch') and r.handled_at is null and r.received_at > now() - interval '14 days'
        and not exists (select 1 from public.orders o where o.id = r.order_id and o.status not in ('created', 'awaiting_payment'))), '[]'::jsonb)
  );
end;
$$;

-- « Traité » : l'avis quitte Mon espace (commande confirmée à la main, remboursé, sans rapport avec Ooble…).
create or replace function public.receipt_mark_handled(_id uuid, _note text)
returns void language plpgsql security definer set search_path to '' as $$
declare who text;
begin
  if not public.has_any_role(auth.uid(), array['admin', 'operator', 'accounting']::public.app_role[]) then
    raise exception 'Réservé aux opérations et à la comptabilité.' using errcode = '42501';
  end if;
  select coalesce(nullif(full_name, ''), email) into who from public.profiles where id = auth.uid();
  update public.interac_receipts set handled_at = now(), handled_by_name = split_part(coalesce(who, ''), ' ', 1),
    handled_note = nullif(left(btrim(coalesce(_note, '')), 300), '')
  where id = _id and handled_at is null;
  insert into public.admin_audit_log (actor_user_id, action, entity_kind, entity_id, metadata)
  values (auth.uid(), 'receipt_handled', 'interac_receipt', _id, jsonb_build_object('note', _note));
end;
$$;

-- Alerte à toute l'équipe pour chaque avis Interac sans commande (une seule fois par avis).
create or replace function public.team_push_receipts()
returns void language plpgsql security definer set search_path to 'public' as $$
declare r record; who uuid[];
begin
  select array_agg(distinct user_id) into who from public.user_roles;
  for r in
    select id, amount_cad, sender_name, status from public.interac_receipts
    where status in ('unmatched', 'mismatch') and team_alerted_at is null and received_at > now() - interval '1 day'
    order by received_at limit 20
  loop
    update public.interac_receipts set team_alerted_at = now() where id = r.id;
    if who is not null then
      perform public.team_push(who, 'orders', 'Virement Interac à vérifier',
        coalesce(replace(to_char(r.amount_cad, 'FM999999990.00'), '.', ',') || ' $', 'Montant inconnu')
          || coalesce(' de ' || r.sender_name, '') || case when r.status = 'unmatched' then ' · sans commande' else ' · à vérifier' end,
        '/admin?tab=me');
    end if;
  end loop;
end;
$$;
revoke all on function public.team_push_receipts() from public, anon, authenticated;

-- Commandes à prendre (ventes à verser comprises) : toute l'équipe est prévenue, plus seulement
-- les administrateurs et les opérateurs.
create or replace function public.team_push_orders()
returns void language plpgsql security definer set search_path to 'public' as $$
declare o record; who uuid[];
begin
  select array_agg(distinct user_id) into who from public.user_roles;
  for o in
    select id, side, cad_amount from public.orders
    where status = 'payment_received' and assigned_to is null and not coalesce(hidden, false)
      and updated_at < now() - interval '2 minutes' and updated_at > now() - interval '1 day'
      and not exists (select 1 from public.team_push_orders_sent s where s.order_id = orders.id)
    order by updated_at limit 20
  loop
    insert into public.team_push_orders_sent (order_id) values (o.id) on conflict do nothing;
    if who is not null then
      perform public.team_push(who, 'orders', case when o.side = 'sell' then 'Vente à verser' else 'Commande à prendre' end,
        case when o.side = 'buy' then 'Achat' else 'Vente' end || ' de ' || replace(to_char(o.cad_amount, 'FM999999990.00'), '.', ',') || ' $ · OOB-' || upper(left(o.id::text, 8)),
        '/admin?tab=me');
    end if;
  end loop;
end;
$$;
revoke all on function public.team_push_orders() from public, anon, authenticated;

revoke all on function public.team_attention() from public, anon;
revoke all on function public.receipt_mark_handled(uuid, text) from public, anon;
grant execute on function public.team_attention() to authenticated;
grant execute on function public.receipt_mark_handled(uuid, text) to authenticated;

select cron.schedule('team-push-receipts', '* * * * *', 'select public.team_push_receipts();');
