-- Comptabilité en partie double : plan comptable, écritures manuelles (apports, prêts, corrections)
-- et journal général, dont les écritures des commandes, recharges et dépenses sont produites à la
-- demande à partir des données (toujours à jour, jamais en double). Une écriture manuelle doit être
-- équilibrée ; elle s'annule avec une raison, ne s'efface jamais, et un mois clôturé la refuse.

-- ─── Plan comptable ───
create table if not exists public.ledger_accounts (
  code text primary key check (code ~ '^[0-9]{4}$'),
  name text not null check (length(btrim(name)) between 1 and 80),
  type text not null check (type in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  system boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.ledger_accounts (code, name, type, system) values
  ('1000', 'Banque (CAD)', 'asset', true),
  ('1100', 'Stock d''USDT (au coût)', 'asset', true),
  ('1190', 'Stock à régulariser', 'asset', true),
  ('1200', 'Taxes à recouvrer (TPS/TVQ)', 'asset', true),
  ('2100', 'Prêts', 'liability', true),
  ('2200', 'Fournisseurs à payer', 'liability', true),
  ('3000', 'Capital et apports', 'equity', true),
  ('3100', 'Bénéfices non répartis', 'equity', true),
  ('4000', 'Ventes d''USDT', 'revenue', true),
  ('4900', 'Autres revenus', 'revenue', true),
  ('5000', 'Coût des USDT vendus', 'expense', true),
  ('6100', 'Gaz de réseau', 'expense', true),
  ('6200', 'Frais de fournisseurs', 'expense', true),
  ('6300', 'Frais bancaires et Interac', 'expense', true),
  ('6400', 'Logiciels et hébergement', 'expense', true),
  ('6500', 'Marketing', 'expense', true),
  ('6600', 'Honoraires professionnels', 'expense', true),
  ('6700', 'Salaires', 'expense', true),
  ('6800', 'Intérêts', 'expense', true),
  ('6900', 'Autres charges', 'expense', true)
on conflict (code) do nothing;
alter table public.ledger_accounts enable row level security;
create policy "Finance lit le plan comptable" on public.ledger_accounts for select to authenticated
  using (public.has_any_role(auth.uid(), array['admin', 'accounting', 'compliance']::public.app_role[]));
create policy "Finance ajoute des comptes" on public.ledger_accounts for insert to authenticated
  with check (public.has_any_role(auth.uid(), array['admin', 'accounting']::public.app_role[]) and not system);
create policy "Finance renomme les comptes" on public.ledger_accounts for update to authenticated
  using (public.has_any_role(auth.uid(), array['admin', 'accounting']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin', 'accounting']::public.app_role[]));

create or replace function public.ledger_accounts_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.code is distinct from old.code or new.type is distinct from old.type or new.system is distinct from old.system then
    raise exception 'Le numéro et le type d''un compte ne changent pas.';
  end if;
  return new;
end;
$$;
create trigger ledger_accounts_guard before update on public.ledger_accounts for each row execute function public.ledger_accounts_guard();

-- Compte de charge de chaque catégorie de dépense.
create or replace function public.expense_account(_category text)
returns text language sql immutable set search_path = '' as $$
  select case _category when 'gas' then '6100' when 'supplier' then '6200' when 'bank' then '6300' when 'software' then '6400'
    when 'marketing' then '6500' when 'professional' then '6600' when 'salary' then '6700' else '6900' end;
$$;

-- ─── Écritures manuelles ───
create sequence if not exists public.journal_entry_seq;
create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  piece text not null unique default ('OD-' || lpad(nextval('public.journal_entry_seq')::text, 5, '0')),
  entry_date date not null,
  memo text not null check (length(btrim(memo)) between 1 and 200),
  voided boolean not null default false,
  void_reason text,
  voided_at timestamptz,
  created_by uuid references auth.users (id),
  created_by_name text,
  created_at timestamptz not null default now()
);
create table if not exists public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries (id),
  account_code text not null references public.ledger_accounts (code),
  debit numeric(14, 2) not null default 0 check (debit >= 0),
  credit numeric(14, 2) not null default 0 check (credit >= 0),
  label text check (label is null or length(label) <= 200),
  check ((debit > 0) <> (credit > 0))
);
create index if not exists journal_lines_entry_idx on public.journal_lines (entry_id);
alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;
create policy "Finance lit les écritures" on public.journal_entries for select to authenticated
  using (public.has_any_role(auth.uid(), array['admin', 'accounting', 'compliance']::public.app_role[]));
create policy "Finance lit les lignes d'écriture" on public.journal_lines for select to authenticated
  using (public.has_any_role(auth.uid(), array['admin', 'accounting', 'compliance']::public.app_role[]));

-- Enregistre une écriture équilibrée (au moins deux lignes, débits = crédits).
create or replace function public.journal_post(_date date, _memo text, _lines jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare eid uuid; p text; who text; l jsonb; td numeric := 0; tc numeric := 0; n int := 0;
begin
  if not public.has_any_role(auth.uid(), array['admin', 'accounting']::public.app_role[]) then
    raise exception 'Accès réservé à la comptabilité.' using errcode = '42501';
  end if;
  if _date is null or btrim(coalesce(_memo, '')) = '' then raise exception 'Date et libellé obligatoires.'; end if;
  if public.accounting_month_closed(_date::timestamp at time zone 'America/Toronto') then
    raise exception 'Ce mois est clôturé : rouvrez-le avant d''ajouter une écriture.';
  end if;
  for l in select * from jsonb_array_elements(coalesce(_lines, '[]'::jsonb)) loop
    if not exists (select 1 from public.ledger_accounts a where a.code = l->>'account' and a.active) then
      raise exception 'Compte inconnu : %', l->>'account';
    end if;
    td := td + coalesce((l->>'debit')::numeric, 0);
    tc := tc + coalesce((l->>'credit')::numeric, 0);
    n := n + 1;
  end loop;
  if n < 2 then raise exception 'Une écriture a au moins deux lignes.'; end if;
  if round(td, 2) <> round(tc, 2) or td <= 0 then raise exception 'Écriture déséquilibrée : débits % ≠ crédits %.', round(td, 2), round(tc, 2); end if;
  select coalesce(nullif(full_name, ''), email) into who from public.profiles where id = auth.uid();
  insert into public.journal_entries (entry_date, memo, created_by, created_by_name) values (_date, btrim(_memo), auth.uid(), who) returning id, piece into eid, p;
  insert into public.journal_lines (entry_id, account_code, debit, credit, label)
  select eid, x->>'account', round(coalesce((x->>'debit')::numeric, 0), 2), round(coalesce((x->>'credit')::numeric, 0), 2), nullif(btrim(coalesce(x->>'label', '')), '')
  from jsonb_array_elements(_lines) x;
  return p;
end;
$$;
revoke execute on function public.journal_post(date, text, jsonb) from public, anon;
grant execute on function public.journal_post(date, text, jsonb) to authenticated;

create or replace function public.journal_void(_id uuid, _reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare e record;
begin
  if not public.has_any_role(auth.uid(), array['admin', 'accounting']::public.app_role[]) then
    raise exception 'Accès réservé à la comptabilité.' using errcode = '42501';
  end if;
  if btrim(coalesce(_reason, '')) = '' then raise exception 'Indiquez pourquoi l''écriture est annulée.'; end if;
  select * into e from public.journal_entries where id = _id;
  if e is null then raise exception 'Écriture introuvable.'; end if;
  if e.voided then raise exception 'Cette écriture est déjà annulée.'; end if;
  if public.accounting_month_closed(e.entry_date::timestamp at time zone 'America/Toronto') then
    raise exception 'Ce mois est clôturé : rouvrez-le avant d''annuler une écriture.';
  end if;
  update public.journal_entries set voided = true, void_reason = btrim(_reason), voided_at = now() where id = _id;
end;
$$;
revoke execute on function public.journal_void(uuid, text) from public, anon;
grant execute on function public.journal_void(uuid, text) to authenticated;

-- ─── Journal général : toutes les lignes jusqu'à _to ───
-- Commandes (achats et ventes terminés), recharges, dépenses et écritures manuelles. Le coût des
-- USDT vendus suit le coût moyen pondéré ; la part sans stock enregistré passe par 1190.
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
      account := '1000'; debit := 0; credit := round(ev.c, 2); return next;
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

-- Journal d'une période (pour l'écran et les exports) : les écritures, chacune avec ses lignes.
create or replace function public.accounting_journal(_from timestamptz, _to timestamptz, _limit int default 200, _offset int default 0)
returns jsonb language sql stable security definer set search_path = '' as $$
  with l as (select * from public.accounting_journal_lines(_to) where at >= _from),
  e as (
    select piece, min(at) as at, min(source) as source, (array_agg(source_id))[1] as source_id, (array_agg(memo))[1] as memo,
      jsonb_agg(jsonb_build_object('account', account, 'name', (select a.name from public.ledger_accounts a where a.code = l.account), 'debit', debit, 'credit', credit, 'label', memo)) as lines,
      sum(debit) as total
    from l group by piece, source_id
  )
  select jsonb_build_object(
    'total', (select count(*) from e),
    'debit', (select coalesce(sum(debit), 0) from l), 'credit', (select coalesce(sum(credit), 0) from l),
    'entries', coalesce((select jsonb_agg(to_jsonb(x) order by x.at desc, x.piece) from (select * from e order by at desc, piece limit _limit offset _offset) x), '[]'::jsonb));
$$;
revoke execute on function public.accounting_journal(timestamptz, timestamptz, int, int) from public, anon;
grant execute on function public.accounting_journal(timestamptz, timestamptz, int, int) to authenticated;
