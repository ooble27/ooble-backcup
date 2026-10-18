-- États financiers à partir du journal général : balance de vérification, état des résultats,
-- bilan (avec le résultat cumulé dans les capitaux propres) et grand livre d'un compte.
-- Solde « normal » : débiteur pour l'actif et les charges, créditeur pour le passif, les capitaux
-- propres et les revenus.

create or replace function public.accounting_statements(_from timestamptz, _to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare res jsonb;
begin
  if not public.has_any_role(auth.uid(), array['admin', 'accounting', 'compliance']::public.app_role[]) then
    raise exception 'Accès réservé à l''équipe.' using errcode = '42501';
  end if;
  with l as (select * from public.accounting_journal_lines(_to)),
  -- Cumul depuis le début (bilan, balance) et mouvement de la période (résultats).
  t as (
    select a.code, a.name, a.type,
      coalesce(sum(l.debit), 0) as d, coalesce(sum(l.credit), 0) as c,
      coalesce(sum(l.debit) filter (where l.at >= _from), 0) as pd, coalesce(sum(l.credit) filter (where l.at >= _from), 0) as pc
    from public.ledger_accounts a left join l on l.account = a.code
    group by a.code, a.name, a.type
  ),
  b as (
    select code, name, type, d, c, pd, pc,
      case when type in ('asset', 'expense') then d - c else c - d end as bal,
      case when type in ('asset', 'expense') then pd - pc else pc - pd end as mov
    from t
  ),
  -- Résultat cumulé jusqu'à _to (revenus − charges), porté au bilan.
  earn as (select coalesce(sum(case when type = 'revenue' then bal when type = 'expense' then -bal else 0 end), 0) as v from b)
  select jsonb_build_object(
    'trial', (select jsonb_agg(jsonb_build_object('code', code, 'name', name, 'type', type, 'debit', round(d, 2), 'credit', round(c, 2), 'balance', round(bal, 2)) order by code)
              from b where d <> 0 or c <> 0),
    'trial_debit', (select round(sum(d), 2) from b), 'trial_credit', (select round(sum(c), 2) from b),
    'income', jsonb_build_object(
      'revenue', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'amount', round(mov, 2)) order by code), '[]'::jsonb) from b where type = 'revenue' and mov <> 0),
      'expense', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'amount', round(mov, 2)) order by code), '[]'::jsonb) from b where type = 'expense' and mov <> 0),
      'total_revenue', (select round(coalesce(sum(mov), 0), 2) from b where type = 'revenue'),
      'total_expense', (select round(coalesce(sum(mov), 0), 2) from b where type = 'expense'),
      'net', (select round(coalesce(sum(case when type = 'revenue' then mov when type = 'expense' then -mov end), 0), 2) from b)
    ),
    'balance', jsonb_build_object(
      'assets', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'amount', round(bal, 2)) order by code), '[]'::jsonb) from b where type = 'asset' and bal <> 0),
      'liabilities', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'amount', round(bal, 2)) order by code), '[]'::jsonb) from b where type = 'liability' and bal <> 0),
      'equity', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'amount', round(bal, 2)) order by code), '[]'::jsonb) from b where type = 'equity' and bal <> 0),
      'earnings', (select round(v, 2) from earn),
      'total_assets', (select round(coalesce(sum(bal), 0), 2) from b where type = 'asset'),
      'total_liabilities', (select round(coalesce(sum(bal), 0), 2) from b where type = 'liability'),
      'total_equity', (select round(coalesce(sum(bal), 0) + (select v from earn), 2) from b where type = 'equity')
    ),
    'bank', (select round(bal, 2) from b where code = '1000')
  ) into res;
  return res;
end;
$$;
revoke execute on function public.accounting_statements(timestamptz, timestamptz) from public, anon;
grant execute on function public.accounting_statements(timestamptz, timestamptz) to authenticated;

-- Grand livre d'un compte : solde d'ouverture, puis chaque ligne de la période avec le solde courant.
create or replace function public.accounting_account_ledger(_account text, _from timestamptz, _to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare kind text; res jsonb;
begin
  if not public.has_any_role(auth.uid(), array['admin', 'accounting', 'compliance']::public.app_role[]) then
    raise exception 'Accès réservé à l''équipe.' using errcode = '42501';
  end if;
  select type into kind from public.ledger_accounts where code = _account;
  if kind is null then raise exception 'Compte inconnu.'; end if;
  with l as (select * from public.accounting_journal_lines(_to) x where x.account = _account),
  s as (select case when kind in ('asset', 'expense') then 1 else -1 end as sg),
  o as (select coalesce(sum((debit - credit) * (select sg from s)), 0) as v from l where at < _from),
  p as (
    select at, piece, source, source_id, memo, debit, credit,
      (select v from o) + sum((debit - credit) * (select sg from s)) over (order by at, piece rows unbounded preceding) as run
    from l where at >= _from
  )
  select jsonb_build_object('opening', round((select v from o), 2),
    'closing', round(coalesce((select run from p order by at desc, piece desc limit 1), (select v from o)), 2),
    'lines', coalesce((select jsonb_agg(jsonb_build_object('at', at, 'piece', piece, 'source', source, 'source_id', source_id, 'memo', memo,
      'debit', round(debit, 2), 'credit', round(credit, 2), 'balance', round(run, 2)) order by at, piece) from p), '[]'::jsonb)) into res;
  return res;
end;
$$;
revoke execute on function public.accounting_account_ledger(text, timestamptz, timestamptz) from public, anon;
grant execute on function public.accounting_account_ledger(text, timestamptz, timestamptz) to authenticated;
