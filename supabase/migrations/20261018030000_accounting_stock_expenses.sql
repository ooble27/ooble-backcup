-- Comptabilité, étape 1 : recharges chez les fournisseurs (stock d'USDT), dépenses, stock au coût
-- moyen pondéré et bénéfice net. Rien ne s'efface : une écriture se corrige en l'annulant, avec
-- une raison. Un mois clôturé n'accepte plus d'écriture. Les essais (is_test) et les commandes
-- masquées ne comptent jamais.

-- ─── Recharges (achats d'USDT chez un fournisseur, ou stock d'ouverture) ───
create table if not exists public.supplier_purchases (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'purchase' check (kind in ('purchase', 'opening')),
  purchased_at timestamptz not null default now(),
  supplier text not null check (length(btrim(supplier)) between 1 and 120),
  network public.usdt_network not null,
  usdt numeric(20, 6) not null check (usdt > 0),
  cad numeric(14, 2) not null check (cad >= 0),
  fee_cad numeric(14, 2) not null default 0 check (fee_cad >= 0),
  tx_hash text check (tx_hash is null or length(tx_hash) <= 200),
  note text check (note is null or length(note) <= 1000),
  receipt_path text,
  voided boolean not null default false,
  void_reason text,
  voided_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id),
  created_by_name text,
  created_at timestamptz not null default now()
);
create index if not exists supplier_purchases_at_idx on public.supplier_purchases (purchased_at desc);

-- ─── Dépenses ───
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  spent_on date not null default (now() at time zone 'America/Toronto')::date,
  category text not null check (category in ('gas', 'supplier', 'bank', 'software', 'marketing', 'professional', 'salary', 'other')),
  label text not null check (length(btrim(label)) between 1 and 160),
  amount_cad numeric(14, 2) not null check (amount_cad > 0),
  tax_cad numeric(14, 2) not null default 0 check (tax_cad >= 0),
  recurring boolean not null default false,
  source_id uuid references public.expenses (id),
  receipt_path text,
  note text check (note is null or length(note) <= 1000),
  voided boolean not null default false,
  void_reason text,
  voided_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id),
  created_by_name text,
  created_at timestamptz not null default now()
);
create index if not exists expenses_on_idx on public.expenses (spent_on desc);
-- Une dépense récurrente ne se recopie qu'une fois par mois.
create unique index if not exists expenses_recurring_month_uidx on public.expenses (source_id, date_trunc('month', spent_on::timestamp)) where source_id is not null;

-- ─── Règles communes ───
create or replace function public.accounting_month_closed(_at timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select action = 'close' from public.accounting_closures
    where month = to_char(_at at time zone 'America/Toronto', 'YYYY-MM') order by at desc limit 1), false);
$$;

create or replace function public.accounting_entry_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare at_ts timestamptz; old_ts timestamptz; who text;
begin
  -- La date de l'écriture (chaque table a la sienne ; une seule branche est évaluée).
  if tg_table_name = 'expenses' then
    at_ts := new.spent_on::timestamp at time zone 'America/Toronto';
    if tg_op = 'UPDATE' then old_ts := old.spent_on::timestamp at time zone 'America/Toronto'; end if;
  else
    at_ts := new.purchased_at;
    if tg_op = 'UPDATE' then old_ts := old.purchased_at; end if;
  end if;
  if tg_op = 'INSERT' then
    if public.accounting_month_closed(at_ts) then raise exception 'Ce mois est clôturé : rouvrez-le avant d''ajouter une écriture.'; end if;
    select coalesce(nullif(full_name, ''), email) into who from public.profiles where id = auth.uid();
    new.created_by := auth.uid();
    new.created_by_name := who;
    new.voided := false; new.void_reason := null; new.voided_at := null;
    return new;
  end if;
  -- Modification : seule l'annulation (avec sa raison) ou l'ajout du justificatif sont permis.
  if public.accounting_month_closed(old_ts) then
    raise exception 'Ce mois est clôturé : rouvrez-le avant de modifier une écriture.';
  end if;
  if old.voided then raise exception 'Cette écriture est déjà annulée.'; end if;
  if new.voided and btrim(coalesce(new.void_reason, '')) = '' then raise exception 'Indiquez pourquoi l''écriture est annulée.'; end if;
  if (to_jsonb(new) - array['voided', 'void_reason', 'voided_at', 'receipt_path', 'recurring'])
     is distinct from (to_jsonb(old) - array['voided', 'void_reason', 'voided_at', 'receipt_path', 'recurring']) then
    raise exception 'Une écriture ne se modifie pas : annulez-la et saisissez-en une nouvelle.';
  end if;
  if new.voided then new.voided_at := now(); end if;
  return new;
end;
$$;

create trigger supplier_purchases_guard before insert or update on public.supplier_purchases for each row execute function public.accounting_entry_guard();
create trigger expenses_guard before insert or update on public.expenses for each row execute function public.accounting_entry_guard();

alter table public.supplier_purchases enable row level security;
alter table public.expenses enable row level security;
create policy "Finance lit les recharges" on public.supplier_purchases for select to authenticated
  using (public.has_any_role(auth.uid(), array['admin', 'accounting', 'compliance']::public.app_role[]));
create policy "Finance saisit les recharges" on public.supplier_purchases for insert to authenticated
  with check (public.has_any_role(auth.uid(), array['admin', 'accounting']::public.app_role[]));
create policy "Finance annule les recharges" on public.supplier_purchases for update to authenticated
  using (public.has_any_role(auth.uid(), array['admin', 'accounting']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin', 'accounting']::public.app_role[]));
create policy "Finance lit les dépenses" on public.expenses for select to authenticated
  using (public.has_any_role(auth.uid(), array['admin', 'accounting', 'compliance']::public.app_role[]));
create policy "Finance saisit les dépenses" on public.expenses for insert to authenticated
  with check (public.has_any_role(auth.uid(), array['admin', 'accounting']::public.app_role[]));
create policy "Finance annule les dépenses" on public.expenses for update to authenticated
  using (public.has_any_role(auth.uid(), array['admin', 'accounting']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin', 'accounting']::public.app_role[]));

-- ─── Justificatifs (factures, reçus) : stockage privé ───
insert into storage.buckets (id, name, public) values ('accounting', 'accounting', false) on conflict (id) do nothing;
create policy "Finance dépose les justificatifs" on storage.objects for insert to authenticated
  with check (bucket_id = 'accounting' and public.has_any_role(auth.uid(), array['admin', 'accounting']::public.app_role[]));
create policy "Finance lit les justificatifs" on storage.objects for select to authenticated
  using (bucket_id = 'accounting' and public.has_any_role(auth.uid(), array['admin', 'accounting', 'compliance']::public.app_role[]));

-- ─── Dépenses récurrentes : recopiées le 1er de chaque mois ───
create or replace function public.expenses_roll_recurring()
returns int language plpgsql security definer set search_path = '' as $$
declare n int := 0; first_day date := date_trunc('month', now() at time zone 'America/Toronto')::date;
begin
  insert into public.expenses (spent_on, category, label, amount_cad, tax_cad, recurring, source_id, note)
  select first_day, e.category, e.label, e.amount_cad, e.tax_cad, false, e.id, 'Dépense récurrente'
  from public.expenses e
  where e.recurring and not e.voided and e.source_id is null and e.spent_on < first_day
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.expenses_roll_recurring() from public, anon, authenticated;
select cron.schedule('expenses-recurring', '5 5 1 * *', $cron$ select public.expenses_roll_recurring(); $cron$);

-- ─── Coût moyen pondéré et bénéfice net ───
-- Entrées de stock : recharges (USDT reçus, coût = CAD payés + frais) et ventes des clients
-- (USDT reçus, coût = CAD versés au client). Sorties : achats des clients (USDT envoyés), au
-- coût moyen du moment. Un seul coût moyen pour tous les réseaux (l'USDT est le même partout).
-- Une sortie sans stock enregistré est évaluée au cours du marché et signalée (« non couverte »).
create or replace function public.accounting_pnl(_from timestamptz, _to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  ev record; qty numeric := 0; cost numeric := 0; unit numeric; cogs numeric; cov numeric; mkt numeric; mkey text;
  rev numeric := 0; tot_cogs numeric := 0; uncovered int := 0; buys_in numeric := 0; sells_in numeric := 0;
  months jsonb := '{}'::jsonb; m jsonb; exp_total numeric := 0; exp_by jsonb; exp_months jsonb; mid_now numeric;
begin
  if not public.has_any_role(auth.uid(), array['admin', 'accounting', 'compliance']::public.app_role[]) then
    raise exception 'Accès réservé à l''équipe.' using errcode = '42501';
  end if;
  for ev in
    select * from (
      select p.purchased_at as at, 'in'::text as dir, p.usdt as q, (p.cad + p.fee_cad) as c, 'purchase'::text as src, null::numeric as cad
      from public.supplier_purchases p where not p.voided and p.purchased_at < _to
      union all
      select o.created_at, 'in', o.usdt_amount, o.cad_amount, 'sell', o.cad_amount
      from public.orders o where o.side = 'sell' and o.status = 'completed' and not o.is_test and not o.hidden and o.created_at < _to
      union all
      select o.created_at, 'out', o.usdt_amount, null, 'buy', o.cad_amount
      from public.orders o where o.side = 'buy' and o.status = 'completed' and not o.is_test and not o.hidden and o.created_at < _to
    ) e order by at, dir
  loop
    mkey := to_char(ev.at at time zone 'America/Toronto', 'YYYY-MM');
    if ev.dir = 'in' then
      qty := qty + ev.q; cost := cost + ev.c;
      if ev.at >= _from then
        if ev.src = 'purchase' then buys_in := buys_in + ev.c; else sells_in := sells_in + ev.c; end if;
      end if;
    else
      -- La part couverte par le stock sort au coût moyen ; le reste (stock non enregistré) au cours du marché.
      cov := least(qty, ev.q);
      unit := case when qty > 0 then cost / qty else 0 end;
      cogs := cov * unit;
      cost := cost - cov * unit; qty := qty - cov;
      if ev.q > cov then
        select (x.buy_rate + x.sell_rate) / 2 into mkt from public.exchange_rates x where x.fetched_at <= ev.at order by x.fetched_at desc limit 1;
        cogs := cogs + (ev.q - cov) * coalesce(mkt, unit);
        if ev.at >= _from then uncovered := uncovered + 1; end if;
      end if;
      if ev.at >= _from then
        rev := rev + ev.cad; tot_cogs := tot_cogs + cogs;
        m := coalesce(months -> mkey, jsonb_build_object('revenue', 0, 'cogs', 0, 'n', 0));
        months := months || jsonb_build_object(mkey, jsonb_build_object(
          'revenue', (m->>'revenue')::numeric + ev.cad, 'cogs', (m->>'cogs')::numeric + cogs, 'n', (m->>'n')::int + 1));
      end if;
    end if;
  end loop;

  select coalesce(sum(amount_cad), 0) into exp_total from public.expenses
   where not voided and spent_on >= (_from at time zone 'America/Toronto')::date and spent_on < (_to at time zone 'America/Toronto')::date;
  select coalesce(jsonb_object_agg(category, total), '{}'::jsonb) into exp_by from (
    select category, sum(amount_cad) total from public.expenses
     where not voided and spent_on >= (_from at time zone 'America/Toronto')::date and spent_on < (_to at time zone 'America/Toronto')::date
     group by category) q;
  select coalesce(jsonb_object_agg(mon, total), '{}'::jsonb) into exp_months from (
    select to_char(spent_on, 'YYYY-MM') mon, sum(amount_cad) total from public.expenses
     where not voided and spent_on >= (_from at time zone 'America/Toronto')::date and spent_on < (_to at time zone 'America/Toronto')::date
     group by 1) q;
  select (buy_rate + sell_rate) / 2 into mid_now from public.exchange_rates order by fetched_at desc limit 1;
  -- Les mois qui n'ont que des dépenses apparaissent aussi.
  select months || coalesce(jsonb_object_agg(k2, jsonb_build_object('revenue', 0, 'cogs', 0, 'n', 0)), '{}'::jsonb) into months
    from jsonb_object_keys(exp_months) k2 where not months ? k2;

  return jsonb_build_object(
    'revenue', round(rev, 2), 'cogs', round(tot_cogs, 2), 'gross', round(rev - tot_cogs, 2),
    'expenses', round(exp_total, 2), 'net', round(rev - tot_cogs - exp_total, 2),
    'expenses_by', exp_by, 'uncovered', uncovered,
    'purchases_cad', round(buys_in, 2), 'sells_cad', round(sells_in, 2),
    'stock', jsonb_build_object('usdt', round(qty, 6), 'cost', round(cost, 2), 'unit', case when qty > 0 then round(cost / qty, 6) end,
      'market', case when mid_now is not null then round(qty * mid_now, 2) end, 'mid', mid_now),
    'months', coalesce((select jsonb_agg(jsonb_build_object('month', k,
        'revenue', round((months->k->>'revenue')::numeric, 2), 'cogs', round((months->k->>'cogs')::numeric, 2),
        'gross', round((months->k->>'revenue')::numeric - (months->k->>'cogs')::numeric, 2),
        'expenses', round(coalesce((exp_months->>k)::numeric, 0), 2),
        'net', round((months->k->>'revenue')::numeric - (months->k->>'cogs')::numeric - coalesce((exp_months->>k)::numeric, 0), 2),
        'n', (months->k->>'n')::int) order by k desc)
      from (select jsonb_object_keys(months) k) ks), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.accounting_pnl(timestamptz, timestamptz) from public, anon;
grant execute on function public.accounting_pnl(timestamptz, timestamptz) to authenticated;
