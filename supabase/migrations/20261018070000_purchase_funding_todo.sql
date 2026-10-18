-- Financement d'une recharge : la banque (par défaut), un prêt, un apport en capital ou un
-- fournisseur payé plus tard. Un stock prêté par un tiers ne sort pas de la banque : il est
-- inscrit en dette (2100) et n'apparaît pas dans le rapprochement bancaire.
alter table public.supplier_purchases add column if not exists funded_by text not null default 'bank'
  check (funded_by in ('bank', 'loan', 'capital', 'payable'));

create or replace function public.purchase_funding_account(_funded_by text)
returns text language sql immutable set search_path = '' as $$
  select case _funded_by when 'loan' then '2100' when 'capital' then '3000' when 'payable' then '2200' else '1000' end;
$$;

create or replace function public.accounting_journal_lines(_to timestamptz)
returns table (at timestamptz, piece text, source text, source_id uuid, memo text, account text, debit numeric, credit numeric)
language plpgsql stable security definer set search_path = '' as $$
declare ev record; qty numeric := 0; cost numeric := 0; unit numeric; cov numeric; mkt numeric; covered numeric; rest numeric; ln record;
begin
  if not public.has_any_role(auth.uid(), array['admin', 'accounting', 'compliance']::public.app_role[]) then
    raise exception 'Accès réservé à l''équipe.' using errcode = '42501';
  end if;
  for ev in
    select * from (
      select p.purchased_at as t, 'in'::text as dir, 'purchase'::text as src, p.id, p.usdt as q, (p.cad + p.fee_cad) as c, null::numeric as cad,
        'RCH-' || upper(left(p.id::text, 8)) as pc, (case when p.kind = 'opening' then 'Stock d''ouverture' else 'Recharge · ' || p.supplier end) || ' · ' || p.network::text as m
      from public.supplier_purchases p where not p.voided and p.purchased_at < _to
      union all
      select o.created_at, 'in', 'sell', o.id, o.usdt_amount, o.cad_amount, o.cad_amount, 'OOB-' || upper(left(o.id::text, 8)), 'Vente client · ' || o.network::text
      from public.orders o where o.side = 'sell' and o.status = 'completed' and not o.is_test and not o.hidden and o.created_at < _to
      union all
      select o.created_at, 'out', 'buy', o.id, o.usdt_amount, null, o.cad_amount, 'OOB-' || upper(left(o.id::text, 8)), 'Achat client · ' || o.network::text
      from public.orders o where o.side = 'buy' and o.status = 'completed' and not o.is_test and not o.hidden and o.created_at < _to
      union all
      select (e.spent_on::timestamp + interval '12 hours') at time zone 'America/Toronto', 'exp', 'expense', e.id, null, e.amount_cad, e.tax_cad,
        'DEP-' || upper(left(e.id::text, 8)), e.label
      from public.expenses e where not e.voided and (e.spent_on::timestamp + interval '12 hours') at time zone 'America/Toronto' < _to
      union all
      select (j.entry_date::timestamp + interval '12 hours') at time zone 'America/Toronto', 'man', 'manual', j.id, null, null, null, j.piece, j.memo
      from public.journal_entries j where not j.voided and (j.entry_date::timestamp + interval '12 hours') at time zone 'America/Toronto' < _to
    ) e order by t, dir
  loop
    at := ev.t; piece := ev.pc; source := ev.src; source_id := ev.id; memo := ev.m;
    if ev.src = 'purchase' then
      qty := qty + ev.q; cost := cost + ev.c;
      account := '1100'; debit := round(ev.c, 2); credit := 0; return next;
      account := public.purchase_funding_account((select x.funded_by from public.supplier_purchases x where x.id = ev.id));
      debit := 0; credit := round(ev.c, 2); return next;
    elsif ev.src = 'sell' then
      qty := qty + ev.q; cost := cost + ev.c;
      account := '1100'; debit := round(ev.c, 2); credit := 0; return next;
      account := '1000'; debit := 0; credit := round(ev.c, 2); return next;
    elsif ev.src = 'buy' then
      cov := least(qty, ev.q);
      unit := case when qty > 0 then cost / qty else 0 end;
      covered := round(cov * unit, 2);
      cost := cost - cov * unit; qty := qty - cov;
      rest := 0;
      if ev.q > cov then
        select (x.buy_rate + x.sell_rate) / 2 into mkt from public.exchange_rates x where x.fetched_at <= ev.t order by x.fetched_at desc limit 1;
        rest := round((ev.q - cov) * coalesce(mkt, unit), 2);
      end if;
      account := '1000'; debit := round(ev.cad, 2); credit := 0; return next;
      account := '4000'; debit := 0; credit := round(ev.cad, 2); return next;
      if covered + rest > 0 then
        account := '5000'; debit := covered + rest; credit := 0; return next;
        if covered > 0 then account := '1100'; debit := 0; credit := covered; return next; end if;
        if rest > 0 then account := '1190'; debit := 0; credit := rest; return next; end if;
      end if;
    elsif ev.src = 'expense' then
      account := public.expense_account((select x.category from public.expenses x where x.id = ev.id));
      debit := round(ev.c - coalesce(ev.cad, 0), 2); credit := 0; return next;
      if coalesce(ev.cad, 0) > 0 then account := '1200'; debit := round(ev.cad, 2); credit := 0; return next; end if;
      account := '1000'; debit := 0; credit := round(ev.c, 2); return next;
    else
      for ln in select l.account_code, l.debit as d, l.credit as c, l.label from public.journal_lines l where l.entry_id = ev.id order by l.debit desc, l.credit loop
        account := ln.account_code; debit := ln.d; credit := ln.c;
        memo := coalesce(ln.label, ev.m);
        return next;
      end loop;
    end if;
  end loop;
end;
$$;
revoke execute on function public.accounting_journal_lines(timestamptz) from public, anon;
grant execute on function public.accounting_journal_lines(timestamptz) to authenticated;


-- « À faire » de la comptabilité : ce qu'il reste à faire, en clair.
create or replace function public.accounting_todo()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare last_on date; last_import timestamptz; n_open int; r jsonb; unexplained numeric; prev text; prev_closed boolean;
  n_receipts int; first_order timestamptz; n_purchases int;
begin
  if not public.has_any_role(auth.uid(), array['admin', 'accounting', 'compliance']::public.app_role[]) then
    raise exception 'Accès réservé à l''équipe.' using errcode = '42501';
  end if;
  select max(posted_on) into last_on from public.bank_lines;
  select max(created_at) into last_import from public.bank_imports where added > 0;
  select count(*) into n_open from public.bank_lines where status = 'open';
  if last_on is not null then
    r := public.bank_recon(last_on, last_on);
    if (r->>'statement_balance') is not null then
      unexplained := round((r->>'statement_balance')::numeric + (r->>'outstanding_total')::numeric - (r->>'open_total')::numeric
        - (r->>'ignored_total')::numeric - (r->>'books_balance')::numeric, 2);
    end if;
  end if;
  prev := to_char((date_trunc('month', now() at time zone 'America/Toronto') - interval '1 month'), 'YYYY-MM');
  prev_closed := public.accounting_month_closed(((prev || '-15')::date)::timestamp at time zone 'America/Toronto');
  select count(*) into n_receipts from public.expenses where not voided and receipt_path is null and source_id is null
    and spent_on >= (now() at time zone 'America/Toronto')::date - 90;
  select min(created_at) into first_order from public.orders where status = 'completed' and not is_test and not hidden;
  select count(*) into n_purchases from public.supplier_purchases where not voided;
  return jsonb_build_object(
    'last_statement_on', last_on, 'last_import_at', last_import, 'open_lines', n_open, 'unexplained', unexplained,
    'prev_month', prev, 'prev_month_closed', prev_closed,
    'prev_month_has_orders', exists (select 1 from public.orders where status = 'completed' and not is_test and not hidden
      and to_char(created_at at time zone 'America/Toronto', 'YYYY-MM') = prev),
    'expenses_without_receipt', n_receipts, 'has_orders', first_order is not null, 'purchases', n_purchases);
end;
$$;
revoke execute on function public.accounting_todo() from public, anon;
grant execute on function public.accounting_todo() to authenticated;
