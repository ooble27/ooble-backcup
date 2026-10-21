-- Outils de l'équipe (Ressources › Outils) : checklist d'ouverture et de fermeture de la journée,
-- et recherches rapides faites par la base (adresse, transaction, règle des 24 heures, état de la journée).

-- Checklist de la journée : une ouverture et une fermeture par jour (heure de Montréal), signées.
create table if not exists public.team_day_checks (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('open', 'close')),
  day date not null,
  items jsonb not null default '[]'::jsonb,
  note text,
  by_id uuid not null references auth.users (id),
  by_name text not null,
  at timestamptz not null default now(),
  unique (kind, day)
);
alter table public.team_day_checks enable row level security;
create policy "Équipe lit les checklists" on public.team_day_checks for select to authenticated
  using (public.is_staff(auth.uid()));
create policy "Équipe signe une checklist" on public.team_day_checks for insert to authenticated
  with check (public.is_staff(auth.uid()) and by_id = auth.uid());
grant select, insert on public.team_day_checks to authenticated;
grant select, insert on public.team_day_checks to service_role;

-- Une adresse de portefeuille : est-ce la nôtre, à quel client est-elle liée, est-elle sanctionnée ?
create or replace function public.tool_address_lookup(_addr text)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare a text := lower(trim(coalesce(_addr, '')));
begin
  if not public.is_staff(auth.uid()) then raise exception 'Réservé à l''équipe.' using errcode = '42501'; end if;
  if a = '' then return '{}'::jsonb; end if;
  return jsonb_build_object(
    'ooble_deposit', (select jsonb_build_object('family', d.family, 'active', d.active) from public.deposit_addresses d where lower(d.address) = a order by d.active desc limit 1),
    'ooble_payout', exists (select 1 from public.usdt_payouts p where lower(p.from_address) = a),
    'clients', coalesce((select jsonb_agg(jsonb_build_object('user_id', w.user_id, 'name', coalesce(nullif(pr.business_name, ''), pr.full_name), 'email', pr.email,
        'declared', w.declared_count, 'deposits', w.deposit_count, 'payouts', w.payout_count, 'last_seen', w.last_seen) order by w.last_seen desc)
      from public.client_wallets w left join public.profiles pr on pr.id = w.user_id where w.address_key = a), '[]'::jsonb),
    'orders', (select count(*) from public.orders o where not o.hidden and (lower(o.wallet_address) = a or lower(o.sender_address) = a)),
    'sanctioned', coalesce((select jsonb_agg(jsonb_build_object('network', e.network, 'ref', e.ref)) from public.compliance_sanction_entries e
      where e.kind = 'wallet' and lower(e.wallet) = a), '[]'::jsonb)
  );
end;
$$;

-- Un hash de transaction : l'envoi d'Ooble ou le dépôt d'un client, et sa commande.
create or replace function public.tool_tx_lookup(_hash text)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare h text := lower(trim(coalesce(_hash, '')));
begin
  if not public.is_staff(auth.uid()) then raise exception 'Réservé à l''équipe.' using errcode = '42501'; end if;
  if h = '' then return '{}'::jsonb; end if;
  return jsonb_build_object(
    'payouts', coalesce((select jsonb_agg(jsonb_build_object('order_id', p.order_id, 'network', p.network, 'asset', p.asset, 'amount', p.usdt_amount,
        'status', p.status, 'to', p.to_address, 'at', p.created_at)) from public.usdt_payouts p where lower(p.tx_hash) = h), '[]'::jsonb),
    'deposits', coalesce((select jsonb_agg(jsonb_build_object('order_id', d.order_id, 'network', d.network, 'asset', d.asset, 'amount', d.usdt_amount,
        'status', d.status, 'from', d.from_address, 'at', d.block_time)) from public.chain_deposits d where lower(d.tx_hash) = h), '[]'::jsonb),
    'declared', coalesce((select jsonb_agg(jsonb_build_object('order_id', o.id, 'network', o.network, 'asset', o.asset, 'amount', o.usdt_amount, 'status', o.status))
      from public.orders o where lower(o.client_tx_hash) = h and not o.hidden), '[]'::jsonb)
  );
end;
$$;

-- Règle des 24 heures (CANAFE) : les opérations d'un client sur les 24 dernières heures, par sens.
create or replace function public.tool_24h(_user uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.has_any_role(auth.uid(), array['admin', 'compliance']::public.app_role[]) then
    raise exception 'Réservé aux administrateurs et à la conformité.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'since', now() - interval '24 hours',
    'orders', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'side', o.side, 'cad', o.cad_amount, 'status', o.status, 'at', o.created_at) order by o.created_at desc)
      from public.orders o where o.user_id = _user and not o.hidden and not o.is_test and o.created_at > now() - interval '24 hours'
       and o.status in ('payment_received', 'settling', 'completed', 'refunded')), '[]'::jsonb)
  );
end;
$$;

-- État de la journée, pour la checklist : file, avis Interac à voir, envois à vérifier, alertes, stock.
create or replace function public.tool_day_context()
returns jsonb language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.is_staff(auth.uid()) then raise exception 'Réservé à l''équipe.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'queue', (select count(*) from public.orders where status = 'payment_received' and not hidden),
    'sells_waiting', (select count(*) from public.orders where side = 'sell' and status in ('created', 'awaiting_payment') and not hidden),
    'interac_review', (select count(*) from public.interac_receipts where status in ('unmatched', 'mismatch')),
    'payouts_review', (select count(*) from public.usdt_payouts where status in ('review', 'failed')),
    'alerts_open', (select count(*) from public.compliance_alerts where status in ('nouveau', 'en_cours') and not hidden),
    'stock', coalesce((select jsonb_agg(jsonb_build_object('network', s.network, 'asset', s.asset, 'balance', s.usdt, 'gas', s.gas, 'gas_symbol', s.gas_symbol, 'min_gas', s.min_gas))
      from (select distinct on (network, asset) network, asset, usdt, gas, gas_symbol, min_gas from public.treasury_stock_snapshots order by network, asset, taken_at desc) s), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.tool_address_lookup(text) from public, anon;
revoke all on function public.tool_tx_lookup(text) from public, anon;
revoke all on function public.tool_24h(uuid) from public, anon;
revoke all on function public.tool_day_context() from public, anon;
grant execute on function public.tool_address_lookup(text) to authenticated;
grant execute on function public.tool_tx_lookup(text) to authenticated;
grant execute on function public.tool_24h(uuid) to authenticated;
grant execute on function public.tool_day_context() to authenticated;
