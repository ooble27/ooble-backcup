-- Rapprochement : pour chaque commande terminée, l'argent reçu et envoyé correspond-il ?
--   achat : virement Interac reçu (lu automatiquement, ou confirmé) = montant CAD ; USDT envoyés (confirmés) = montant USDT
--   vente : USDT reçus sur la blockchain = montant USDT (le virement Interac au client est confirmé par l'équipe)
--   ok = tout correspond ; gap = une preuve existe mais le montant diffère ; manual = terminée sans preuve.
create or replace function public.accounting_recon(_order_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with o as (select id, side, cad_amount, usdt_amount from public.orders where id = _order_id),
  p as (
    select
      coalesce((select sum(r.amount_cad) from public.interac_receipts r where r.order_id = _order_id and r.status = 'matched'),
               (select sum(c.amount_cad) from public.payment_confirmations c where c.order_id = _order_id and c.direction = 'inbound')) as in_cad,
      (select sum(u.usdt_amount) from public.usdt_payouts u where u.order_id = _order_id and u.status = 'confirmed') as out_usdt,
      (select max(u.tx_hash) from public.usdt_payouts u where u.order_id = _order_id and u.status = 'confirmed') as out_tx,
      (select sum(d.usdt_amount) from public.chain_deposits d where d.order_id = _order_id and d.status = 'matched') as in_usdt,
      (select max(d.tx_hash) from public.chain_deposits d where d.order_id = _order_id and d.status = 'matched') as in_tx
  )
  select jsonb_build_object('in_cad', p.in_cad, 'out_usdt', p.out_usdt, 'in_usdt', p.in_usdt, 'tx', coalesce(p.out_tx, p.in_tx),
    'state', case
      when o.side = 'buy' and (p.in_cad is null or p.out_usdt is null) then 'manual'
      when o.side = 'buy' and (abs(p.in_cad - o.cad_amount) > 0.01 or abs(p.out_usdt - o.usdt_amount) > 0.01) then 'gap'
      when o.side = 'sell' and p.in_usdt is null then 'manual'
      when o.side = 'sell' and abs(p.in_usdt - o.usdt_amount) > 0.01 then 'gap'
      else 'ok' end)
  from o, p;
$$;
revoke all on function public.accounting_recon(uuid) from public, anon;

-- Résumé : mêmes chiffres qu'avant, plus le nombre de commandes à vérifier (écart ou sans preuve).
create or replace function public.admin_accounting_summary(_from timestamptz, _to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare res jsonb;
begin
  if not public.has_any_role(auth.uid(), array['admin','accounting','compliance']::public.app_role[]) then
    raise exception 'Accès réservé à l''équipe.' using errcode = '42501';
  end if;
  with o as (
    select o.id, o.side, o.network, o.cad_amount::numeric cad, o.usdt_amount::numeric usdt, coalesce(o.fee_cad, 0)::numeric fee, o.created_at, r.mid,
      case when r.mid is null then null
           when o.side = 'buy' then o.cad_amount - o.usdt_amount * r.mid
           else o.usdt_amount * r.mid - o.cad_amount end as margin,
      (public.accounting_recon(o.id)->>'state') <> 'ok' as to_check
    from public.orders o
    left join lateral (
      select (x.buy_rate + x.sell_rate) / 2 as mid from public.exchange_rates x
      where x.fetched_at <= o.created_at order by x.fetched_at desc limit 1
    ) r on true
    where o.status = 'completed' and o.created_at >= _from and o.created_at < _to
  )
  select jsonb_build_object(
    'totals', (select jsonb_build_object(
        'n', count(*), 'n_buy', count(*) filter (where side = 'buy'), 'n_sell', count(*) filter (where side = 'sell'),
        'volume', coalesce(sum(cad), 0), 'vol_buy', coalesce(sum(cad) filter (where side = 'buy'), 0), 'vol_sell', coalesce(sum(cad) filter (where side = 'sell'), 0),
        'usdt', coalesce(sum(usdt), 0), 'margin', coalesce(sum(margin), 0), 'fees', coalesce(sum(fee), 0), 'unpriced', count(*) filter (where mid is null),
        'to_check', count(*) filter (where to_check)) from o),
    'months', coalesce((select jsonb_agg(m order by m->>'month' desc) from (
        select jsonb_build_object('month', to_char(date_trunc('month', created_at at time zone 'America/Toronto'), 'YYYY-MM'),
          'n', count(*), 'n_buy', count(*) filter (where side = 'buy'), 'n_sell', count(*) filter (where side = 'sell'),
          'vol_buy', coalesce(sum(cad) filter (where side = 'buy'), 0), 'vol_sell', coalesce(sum(cad) filter (where side = 'sell'), 0),
          'usdt', coalesce(sum(usdt), 0), 'margin', coalesce(sum(margin), 0), 'fees', coalesce(sum(fee), 0),
          'to_check', count(*) filter (where to_check)) m
        from o group by date_trunc('month', created_at at time zone 'America/Toronto')) q), '[]'::jsonb),
    'networks', coalesce((select jsonb_agg(n order by (n->>'volume')::numeric desc) from (
        select jsonb_build_object('network', network::text, 'n', count(*), 'usdt', coalesce(sum(usdt), 0), 'volume', coalesce(sum(cad), 0), 'margin', coalesce(sum(margin), 0)) n
        from o group by network) q), '[]'::jsonb)
  ) into res;
  return res;
end;
$$;

-- Grand livre d'une période : chaque commande terminée, sa marge et son rapprochement ; filtre « à vérifier ».
-- (Remplace admin_accounting_orders, qui n'est plus utilisée par le back-office.)
create or replace function public.admin_accounting_ledger(_from timestamptz, _to timestamptz, _limit int default 20, _offset int default 0, _only_check boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare res jsonb;
begin
  if not public.has_any_role(auth.uid(), array['admin','accounting','compliance']::public.app_role[]) then
    raise exception 'Accès réservé à l''équipe.' using errcode = '42501';
  end if;
  with base as (
    select o.*, public.accounting_recon(o.id) as rec
    from public.orders o
    where o.status = 'completed' and o.created_at >= _from and o.created_at < _to
  ), f as (
    select * from base where not _only_check or (rec->>'state') <> 'ok'
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'rows', coalesce((select jsonb_agg(x order by x->>'created_at' desc) from (
      select jsonb_build_object('id', f.id, 'side', f.side, 'network', f.network::text, 'cad', f.cad_amount, 'usdt', f.usdt_amount,
        'rate', f.locked_rate, 'mid', r.mid, 'fee', coalesce(f.fee_cad, 0), 'created_at', f.created_at,
        'client', coalesce(nullif(p.business_name, ''), nullif(p.full_name, ''), p.email),
        'margin', case when r.mid is null then null when f.side = 'buy' then f.cad_amount - f.usdt_amount * r.mid else f.usdt_amount * r.mid - f.cad_amount end,
        'recon', f.rec) x
      from f
      left join public.profiles p on p.id = f.user_id
      left join lateral (
        select (e.buy_rate + e.sell_rate) / 2 as mid from public.exchange_rates e
        where e.fetched_at <= f.created_at order by e.fetched_at desc limit 1
      ) r on true
      order by f.created_at desc
      limit greatest(1, least(_limit, 5000)) offset greatest(0, _offset)
    ) q), '[]'::jsonb)
  ) into res;
  return res;
end;
$$;
grant execute on function public.admin_accounting_ledger(timestamptz, timestamptz, int, int, boolean) to authenticated;

-- Clôture d'un mois : les totaux sont figés, avec l'auteur et la date. On ajoute, on n'efface pas :
-- une réouverture est une nouvelle ligne. L'état d'un mois est sa dernière ligne.
create table if not exists public.accounting_closures (
  id uuid primary key default gen_random_uuid(),
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  action text not null check (action in ('close', 'reopen')),
  totals jsonb,
  note text,
  by_id uuid not null,
  by_name text,
  at timestamptz not null default now()
);
create index if not exists accounting_closures_month_idx on public.accounting_closures (month, at desc);
alter table public.accounting_closures enable row level security;
create policy accounting_closures_read on public.accounting_closures for select to authenticated
  using (public.has_any_role(auth.uid(), array['admin','accounting','compliance']::public.app_role[]));

create or replace function public.accounting_close_month(_month text, _note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  m_start timestamptz; m_end timestamptz; summary jsonb; last_action text; who text;
begin
  if not public.has_any_role(auth.uid(), array['admin','accounting']::public.app_role[]) then
    raise exception 'Seuls l''administrateur et la comptabilité peuvent clôturer un mois.' using errcode = '42501';
  end if;
  if _month !~ '^\d{4}-\d{2}$' then raise exception 'Mois invalide.'; end if;
  m_start := (_month || '-01')::date::timestamp at time zone 'America/Toronto';
  m_end := ((_month || '-01')::date + interval '1 month')::timestamp at time zone 'America/Toronto';
  if m_end > now() then raise exception 'Un mois ne peut être clôturé qu''une fois terminé.'; end if;
  select action into last_action from public.accounting_closures where month = _month order by at desc limit 1;
  if last_action = 'close' then raise exception 'Ce mois est déjà clôturé.'; end if;
  summary := public.admin_accounting_summary(m_start, m_end);
  select coalesce(nullif(full_name, ''), email) into who from public.profiles where id = auth.uid();
  insert into public.accounting_closures (month, action, totals, note, by_id, by_name)
  values (_month, 'close', summary->'totals', nullif(btrim(coalesce(_note, '')), ''), auth.uid(), who);
  return summary->'totals';
end;
$$;

create or replace function public.accounting_reopen_month(_month text, _note text)
returns void language plpgsql security definer set search_path = '' as $$
declare last_action text; who text;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Seul un administrateur peut rouvrir un mois clôturé.' using errcode = '42501';
  end if;
  if btrim(coalesce(_note, '')) = '' then raise exception 'Indiquez pourquoi le mois est rouvert.'; end if;
  select action into last_action from public.accounting_closures where month = _month order by at desc limit 1;
  if last_action is distinct from 'close' then raise exception 'Ce mois n''est pas clôturé.'; end if;
  select coalesce(nullif(full_name, ''), email) into who from public.profiles where id = auth.uid();
  insert into public.accounting_closures (month, action, note, by_id, by_name) values (_month, 'reopen', btrim(_note), auth.uid(), who);
end;
$$;

grant execute on function public.accounting_close_month(text, text) to authenticated;
grant execute on function public.accounting_reopen_month(text, text) to authenticated;
