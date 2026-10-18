-- Rapprochement bancaire : import du relevé (CSV de la banque), chaque ligne est pointée sur une
-- opération des livres qui touche le compte 1000 (commande, recharge, dépense, écriture manuelle),
-- ou écartée avec une raison. L'écart compare le solde du relevé au solde du compte Banque.
-- Une ligne importée deux fois n'est gardée qu'une fois (empreinte unique).

create table if not exists public.bank_imports (
  id uuid primary key default gen_random_uuid(),
  file_name text check (file_name is null or length(file_name) <= 200),
  bank text not null default 'Desjardins' check (length(bank) <= 60),
  added int not null default 0,
  skipped int not null default 0,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);

create table if not exists public.bank_lines (
  id uuid primary key default gen_random_uuid(),
  import_id uuid references public.bank_imports (id),
  posted_on date not null,
  description text not null check (length(description) <= 300),
  amount numeric(14, 2) not null check (amount <> 0),
  balance numeric(14, 2),
  fingerprint text not null unique,
  status text not null default 'open' check (status in ('open', 'matched', 'ignored')),
  match_source text check (match_source is null or match_source in ('purchase', 'sell', 'buy', 'expense', 'manual')),
  match_id uuid,
  match_piece text,
  match_auto boolean not null default false,
  note text check (note is null or length(note) <= 300),
  matched_by uuid references auth.users (id),
  matched_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'matched') = (match_id is not null))
);
create index if not exists bank_lines_posted_idx on public.bank_lines (posted_on);
-- Une opération des livres n'est pointée qu'une fois.
create unique index if not exists bank_lines_match_uq on public.bank_lines (match_source, match_id) where status = 'matched';

alter table public.bank_imports enable row level security;
alter table public.bank_lines enable row level security;
create policy "Finance lit les imports bancaires" on public.bank_imports for select to authenticated
  using (public.has_any_role(auth.uid(), array['admin', 'accounting', 'compliance']::public.app_role[]));
create policy "Finance lit le relevé bancaire" on public.bank_lines for select to authenticated
  using (public.has_any_role(auth.uid(), array['admin', 'accounting', 'compliance']::public.app_role[]));

create or replace function public.bank_require_finance()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_any_role(auth.uid(), array['admin', 'accounting']::public.app_role[]) then
    raise exception 'Accès réservé à la comptabilité.' using errcode = '42501';
  end if;
end;
$$;

-- Opérations des livres qui passent par la banque (une par pièce), avec leur montant signé
-- (+ entrée, − sortie) et la ligne de relevé qui les pointe, s'il y en a une.
create or replace function public.bank_book_items(_to timestamptz)
returns table (at timestamptz, piece text, source text, source_id uuid, memo text, amount numeric, line_id uuid)
language sql stable security definer set search_path = '' as $$
  select min(l.at), l.piece, min(l.source), l.source_id, min(l.memo), sum(l.debit - l.credit),
    (select b.id from public.bank_lines b where b.status = 'matched' and b.match_source = min(l.source) and b.match_id = l.source_id)
  from public.accounting_journal_lines(_to) l
  where l.account = '1000'
  group by l.piece, l.source_id
  having sum(l.debit - l.credit) <> 0;
$$;
revoke execute on function public.bank_book_items(timestamptz) from public, anon;
grant execute on function public.bank_book_items(timestamptz) to authenticated;

-- Import : _lines = [{date, description, amount, balance}] ; les doublons sont ignorés.
create or replace function public.bank_import(_file text, _lines jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare iid uuid; l jsonb; n_add int := 0; n_skip int := 0; fp text; seen jsonb := '{}'::jsonb; k text; occ int;
begin
  perform public.bank_require_finance();
  if jsonb_typeof(_lines) <> 'array' or jsonb_array_length(_lines) = 0 then raise exception 'Le relevé est vide.'; end if;
  if jsonb_array_length(_lines) > 5000 then raise exception 'Relevé trop long : importez-le en plusieurs fois.'; end if;
  insert into public.bank_imports (file_name) values (left(_file, 200)) returning id into iid;
  for l in select * from jsonb_array_elements(_lines) loop
    if (l->>'date') is null or coalesce((l->>'amount')::numeric, 0) = 0 then n_skip := n_skip + 1; continue; end if;
    -- Deux opérations identiques le même jour restent distinctes grâce à leur rang dans le fichier.
    k := (l->>'date') || '|' || round((l->>'amount')::numeric, 2)::text || '|' || lower(btrim(coalesce(l->>'description', ''))) || '|' || coalesce(round((l->>'balance')::numeric, 2)::text, '');
    occ := coalesce((seen->>k)::int, 0) + 1;
    seen := seen || jsonb_build_object(k, occ);
    fp := md5(k || '|' || occ);
    insert into public.bank_lines (import_id, posted_on, description, amount, balance, fingerprint)
    values (iid, (l->>'date')::date, left(btrim(coalesce(l->>'description', '')), 300), round((l->>'amount')::numeric, 2),
      round((l->>'balance')::numeric, 2), fp)
    on conflict (fingerprint) do nothing;
    if found then n_add := n_add + 1; else n_skip := n_skip + 1; end if;
  end loop;
  update public.bank_imports set added = n_add, skipped = n_skip where id = iid;
  return jsonb_build_object('added', n_add, 'skipped', n_skip, 'matched', public.bank_auto_match());
end;
$$;

-- Pointage automatique : même montant au cent près, à 5 jours au plus ; le plus proche en date
-- gagne, et seulement s'il n'y a aucune autre opération ouverte du même montant aussi proche.
create or replace function public.bank_auto_match()
returns int language plpgsql security definer set search_path = '' as $$
declare b record; c record; n int := 0; tie int; used text[] := '{}';
begin
  perform public.bank_require_finance();
  for b in select * from public.bank_lines where status = 'open' order by posted_on, id loop
    select i.source, i.source_id, i.piece, abs((i.at at time zone 'America/Toronto')::date - b.posted_on) as gap into c
    from public.bank_book_items(now() + interval '1 day') i
    where i.line_id is null and i.amount = b.amount and not ((i.source || i.source_id::text) = any (used))
      and abs((i.at at time zone 'America/Toronto')::date - b.posted_on) <= 5
    order by abs((i.at at time zone 'America/Toronto')::date - b.posted_on), i.at limit 1;
    if c.piece is null then continue; end if;
    select count(*) into tie from public.bank_book_items(now() + interval '1 day') i
    where i.line_id is null and i.amount = b.amount and not ((i.source || i.source_id::text) = any (used))
      and abs((i.at at time zone 'America/Toronto')::date - b.posted_on) = c.gap;
    if tie > 1 then continue; end if;
    update public.bank_lines set status = 'matched', match_source = c.source, match_id = c.source_id, match_piece = c.piece,
      match_auto = true, matched_by = auth.uid(), matched_at = now() where id = b.id;
    used := used || (c.source || c.source_id::text);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Pointage manuel : la ligne et l'opération doivent avoir le même montant.
create or replace function public.bank_match(_line uuid, _source text, _id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare b record; i record;
begin
  perform public.bank_require_finance();
  select * into b from public.bank_lines where id = _line;
  if b is null then raise exception 'Ligne introuvable.'; end if;
  if b.status <> 'open' then raise exception 'Cette ligne est déjà traitée.'; end if;
  select * into i from public.bank_book_items(now() + interval '1 day') x where x.source = _source and x.source_id = _id;
  if i.piece is null then raise exception 'Opération introuvable dans les livres.'; end if;
  if i.line_id is not null then raise exception 'Cette opération est déjà pointée.'; end if;
  if i.amount <> b.amount then raise exception 'Montants différents : relevé % ≠ livres %.', b.amount, i.amount; end if;
  update public.bank_lines set status = 'matched', match_source = _source, match_id = _id, match_piece = i.piece,
    match_auto = false, matched_by = auth.uid(), matched_at = now() where id = _line;
end;
$$;

create or replace function public.bank_ignore(_line uuid, _note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.bank_require_finance();
  if btrim(coalesce(_note, '')) = '' then raise exception 'Indiquez pourquoi la ligne est écartée.'; end if;
  update public.bank_lines set status = 'ignored', note = left(btrim(_note), 300), matched_by = auth.uid(), matched_at = now()
  where id = _line and status = 'open';
  if not found then raise exception 'Cette ligne est déjà traitée.'; end if;
end;
$$;

-- Remet une ligne pointée ou écartée à traiter.
create or replace function public.bank_unmatch(_line uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.bank_require_finance();
  update public.bank_lines set status = 'open', match_source = null, match_id = null, match_piece = null, match_auto = false,
    note = null, matched_by = null, matched_at = null where id = _line;
end;
$$;

-- Crée une dépense à partir d'une ligne de sortie du relevé, puis la pointe.
create or replace function public.bank_line_to_expense(_line uuid, _category text, _label text, _tax numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare b record; eid uuid;
begin
  perform public.bank_require_finance();
  select * into b from public.bank_lines where id = _line;
  if b is null or b.status <> 'open' then raise exception 'Cette ligne est déjà traitée.'; end if;
  if b.amount >= 0 then raise exception 'Seule une sortie d''argent peut devenir une dépense.'; end if;
  if coalesce(_tax, 0) < 0 or coalesce(_tax, 0) >= -b.amount then raise exception 'Taxes invalides.'; end if;
  insert into public.expenses (spent_on, category, label, amount_cad, tax_cad, note)
  values (b.posted_on, _category, left(btrim(coalesce(nullif(_label, ''), b.description)), 160), -b.amount, round(coalesce(_tax, 0), 2), 'Créée depuis le relevé bancaire')
  returning id into eid;
  update public.bank_lines set status = 'matched', match_source = 'expense', match_id = eid,
    match_piece = 'DEP-' || upper(left(eid::text, 8)), match_auto = false, matched_by = auth.uid(), matched_at = now() where id = _line;
end;
$$;

-- Opérations ouvertes proches d'une ligne : même montant d'abord, puis par date.
create or replace function public.bank_candidates(_line uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare b record; res jsonb;
begin
  if not public.has_any_role(auth.uid(), array['admin', 'accounting', 'compliance']::public.app_role[]) then
    raise exception 'Accès réservé à l''équipe.' using errcode = '42501';
  end if;
  select * into b from public.bank_lines where id = _line;
  if b is null then raise exception 'Ligne introuvable.'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.same desc, x.gap, x.at), '[]'::jsonb) into res from (
    select i.at, i.piece, i.source, i.source_id, i.memo, round(i.amount, 2) as amount, i.amount = b.amount as same,
      abs((i.at at time zone 'America/Toronto')::date - b.posted_on) as gap
    from public.bank_book_items(now() + interval '1 day') i
    where i.line_id is null and sign(i.amount) = sign(b.amount)
      and abs((i.at at time zone 'America/Toronto')::date - b.posted_on) <= 31
    order by i.amount = b.amount desc, abs((i.at at time zone 'America/Toronto')::date - b.posted_on) limit 20) x;
  return res;
end;
$$;

-- Lignes du relevé d'une période et état du rapprochement à la date _to.
create or replace function public.bank_recon(_from date, _to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare res jsonb; stmt numeric; stmt_on date; last_line record;
begin
  if not public.has_any_role(auth.uid(), array['admin', 'accounting', 'compliance']::public.app_role[]) then
    raise exception 'Accès réservé à l''équipe.' using errcode = '42501';
  end if;
  -- Solde du relevé : la dernière ligne jusqu'à _to qui porte un solde.
  select posted_on, balance into last_line from public.bank_lines where posted_on <= _to and balance is not null
    order by posted_on desc, created_at desc, fingerprint limit 1;
  stmt := last_line.balance; stmt_on := last_line.posted_on;
  with i as (select * from public.bank_book_items(((_to + 1)::timestamp) at time zone 'America/Toronto'))
  select jsonb_build_object(
    'statement_balance', stmt, 'statement_on', stmt_on, 'books_balance', (select round(coalesce(sum(amount), 0), 2) from i),
    'gap', case when stmt is null then null else round(stmt - (select coalesce(sum(amount), 0) from i), 2) end,
    -- Opérations des livres pas encore passées en banque (virements en circulation).
    'outstanding', coalesce((select jsonb_agg(jsonb_build_object('at', at, 'piece', piece, 'source', source, 'source_id', source_id, 'memo', memo, 'amount', round(amount, 2)) order by at)
       from i where line_id is null and at >= (_from::timestamp at time zone 'America/Toronto')), '[]'::jsonb),
    'outstanding_total', (select round(coalesce(sum(amount), 0), 2) from i where line_id is null),
    'open_total', (select round(coalesce(sum(amount), 0), 2) from public.bank_lines where status = 'open' and posted_on <= _to),
    'ignored_total', (select round(coalesce(sum(amount), 0), 2) from public.bank_lines where status = 'ignored' and posted_on <= _to),
    'counts', (select jsonb_build_object('open', count(*) filter (where status = 'open'), 'matched', count(*) filter (where status = 'matched'),
       'ignored', count(*) filter (where status = 'ignored')) from public.bank_lines where posted_on between _from and _to),
    'lines', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'on', posted_on, 'description', description, 'amount', amount, 'balance', balance,
       'status', status, 'source', match_source, 'source_id', match_id, 'piece', match_piece, 'auto', match_auto, 'note', note) order by posted_on desc, created_at desc, fingerprint)
       from public.bank_lines where posted_on between _from and _to), '[]'::jsonb)
  ) into res;
  return res;
end;
$$;

revoke execute on function public.bank_require_finance() from public, anon;
grant execute on function public.bank_require_finance() to authenticated;
revoke execute on function public.bank_import(text, jsonb) from public, anon;
grant execute on function public.bank_import(text, jsonb) to authenticated;
revoke execute on function public.bank_auto_match() from public, anon;
grant execute on function public.bank_auto_match() to authenticated;
revoke execute on function public.bank_match(uuid, text, uuid) from public, anon;
grant execute on function public.bank_match(uuid, text, uuid) to authenticated;
revoke execute on function public.bank_ignore(uuid, text) from public, anon;
grant execute on function public.bank_ignore(uuid, text) to authenticated;
revoke execute on function public.bank_unmatch(uuid) from public, anon;
grant execute on function public.bank_unmatch(uuid) to authenticated;
revoke execute on function public.bank_line_to_expense(uuid, text, text, numeric) from public, anon;
grant execute on function public.bank_line_to_expense(uuid, text, text, numeric) to authenticated;
revoke execute on function public.bank_candidates(uuid) from public, anon;
grant execute on function public.bank_candidates(uuid) to authenticated;
revoke execute on function public.bank_recon(date, date) from public, anon;
grant execute on function public.bank_recon(date, date) to authenticated;
