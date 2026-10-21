-- Outils de l'équipe, deuxième série : une commande par sa référence, le rapprochement d'un avis Interac,
-- les opérations d'un client sur une période (brouillon de déclaration), la prévision du stock et la base
-- du simulateur de marge. Lecture seule, réservée à l'équipe ; aucune nouvelle table.

-- Une commande par sa référence OOB-XXXXXXXX : montants, client, cours du marché à la création.
-- La question et la réponse Interac du client ne sont données qu'aux administrateurs et aux opérateurs.
create or replace function public.tool_order_lookup(_ref text)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare
  h text := regexp_replace(lower(regexp_replace(coalesce(_ref, ''), '^\s*oob-', '', 'i')), '[^0-9a-f]', '', 'g');
  o record; m numeric;
begin
  if not public.is_staff(auth.uid()) then raise exception 'Réservé à l''équipe.' using errcode = '42501'; end if;
  if length(h) < 6 then return null; end if;
  select x.*, p.full_name, p.business_name, p.email, p.preferred_lang, p.interac_question, p.interac_answer into o
    from public.orders x left join public.profiles p on p.id = x.user_id
   where x.id::text like h || '%' and not x.hidden
   order by x.created_at desc limit 1;
  if not found then return null; end if;
  select r.market_rate into m from public.exchange_rates r
   where r.asset::text = o.asset::text and r.fetched_at <= o.created_at and r.market_rate is not null
   order by r.fetched_at desc limit 1;
  return jsonb_build_object(
    'id', o.id, 'side', o.side, 'status', o.status, 'asset', o.asset, 'network', o.network,
    'cad', o.cad_amount, 'crypto', o.usdt_amount, 'rate', o.locked_rate, 'fee', o.fee_cad, 'bonus_bps', o.bonus_bps,
    'created_at', o.created_at, 'updated_at', o.updated_at, 'interac_email', o.interac_email, 'is_test', o.is_test,
    'client', jsonb_build_object('id', o.user_id, 'name', coalesce(nullif(o.business_name, ''), o.full_name), 'email', o.email, 'lang', o.preferred_lang),
    'interac', case when public.has_any_role(auth.uid(), array['admin', 'operator']::public.app_role[])
      then jsonb_build_object('question', o.interac_question, 'answer', o.interac_answer) else null end,
    'market', m
  );
end;
$$;

-- Un avis Interac collé à la main : les achats des 14 derniers jours qui correspondent
-- (référence, montant exact, nom), du plus probable au moins probable.
create or replace function public.tool_interac_match(_amount numeric, _ref text, _name text)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare
  r text := regexp_replace(lower(coalesce(_ref, '')), '[^0-9a-f]', '', 'g');
  n text := lower(trim(coalesce(_name, '')));
begin
  if not public.has_any_role(auth.uid(), array['admin', 'operator', 'accounting']::public.app_role[]) then
    raise exception 'Réservé aux opérations et à la comptabilité.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.score desc, x.created_at desc) from (
    select o.id, o.cad_amount as cad, o.status, o.created_at, coalesce(nullif(p.business_name, ''), p.full_name) as name, p.email,
      (case when length(r) >= 6 and o.id::text like r || '%' then 4 else 0 end
       + case when _amount is not null and abs(o.cad_amount - _amount) < 0.01 then 2 else 0 end
       + case when length(n) >= 3 and (lower(coalesce(p.full_name, '')) like '%' || n || '%' or lower(coalesce(p.business_name, '')) like '%' || n || '%') then 1 else 0 end) as score
      from public.orders o left join public.profiles p on p.id = o.user_id
     where o.side = 'buy' and not o.hidden and o.created_at > now() - interval '14 days'
       and o.status in ('created', 'awaiting_payment', 'payment_received')
     order by 7 desc, o.created_at desc limit 8
  ) x where x.score > 0), '[]'::jsonb);
end;
$$;

-- Les opérations payées d'un client sur une période, pour préparer une déclaration (conformité).
create or replace function public.tool_client_window(_user uuid, _days int)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.has_any_role(auth.uid(), array['admin', 'compliance']::public.app_role[]) then
    raise exception 'Réservé aux administrateurs et à la conformité.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'client', (select jsonb_build_object('name', coalesce(nullif(p.business_name, ''), p.full_name), 'email', p.email, 'phone', p.phone,
        'account_type', p.account_type, 'kyc_status', p.kyc_status, 'created_at', p.created_at,
        'birth_date', k.birth_date, 'occupation', k.occupation,
        'address', nullif(concat_ws(', ', k.address_line, k.city, k.province, k.postal_code), ''))
      from public.profiles p
      left join lateral (select * from public.kyc_verifications v where v.user_id = p.id order by v.created_at desc limit 1) k on true
      where p.id = _user),
    'orders', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'side', o.side, 'cad', o.cad_amount, 'crypto', o.usdt_amount, 'asset', o.asset,
        'network', o.network, 'status', o.status, 'at', o.created_at, 'wallet', o.wallet_address, 'sender', o.sender_address) order by o.created_at)
      from public.orders o where o.user_id = _user and not o.hidden and not o.is_test
       and o.created_at > now() - make_interval(days => greatest(1, least(coalesce(_days, 30), 365)))
       and o.status in ('payment_received', 'settling', 'completed', 'refunded')), '[]'::jsonb),
    'alerts', coalesce((select jsonb_agg(jsonb_build_object('type', a.type, 'reason', a.reason, 'status', a.status, 'at', a.created_at) order by a.created_at desc)
      from public.compliance_alerts a where a.user_id = _user and not a.hidden), '[]'::jsonb)
  );
end;
$$;

-- Prévision du stock : solde actuel par réseau, envois et dépôts des 7 derniers jours.
create or replace function public.tool_stock_forecast()
returns jsonb language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.has_any_role(auth.uid(), array['admin', 'operator', 'accounting']::public.app_role[]) then
    raise exception 'Réservé aux opérations et à la comptabilité.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('network', s.network, 'asset', s.asset, 'balance', s.usdt, 'gas', s.gas, 'gas_symbol', s.gas_symbol,
      'min_gas', s.min_gas, 'at', s.taken_at,
      'out7', coalesce((select sum(p.usdt_amount) from public.usdt_payouts p where p.network::text = s.network::text and p.asset::text = s.asset::text
        and p.status in ('confirmed', 'broadcast') and p.created_at > now() - interval '7 days'), 0),
      'in7', coalesce((select sum(d.usdt_amount) from public.chain_deposits d where d.network::text = s.network::text and d.asset::text = s.asset::text
        and d.status = 'matched' and d.block_time > now() - interval '7 days'), 0)))
    from (select distinct on (network, asset) network, asset, usdt, gas, gas_symbol, min_gas, taken_at
            from public.treasury_stock_snapshots order by network, asset, taken_at desc) s), '[]'::jsonb);
end;
$$;

-- Base du simulateur de marge : volume terminé des N derniers jours, par sens, et marges actuelles.
create or replace function public.tool_margin_base(_days int)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Réservé aux administrateurs.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'buy', (select jsonb_build_object('cad', coalesce(sum(cad_amount), 0), 'count', count(*)) from public.orders
             where side = 'buy' and status = 'completed' and not hidden and not is_test and created_at > now() - make_interval(days => greatest(1, least(coalesce(_days, 30), 365)))),
    'sell', (select jsonb_build_object('cad', coalesce(sum(cad_amount), 0), 'count', count(*)) from public.orders
             where side = 'sell' and status = 'completed' and not hidden and not is_test and created_at > now() - make_interval(days => greatest(1, least(coalesce(_days, 30), 365)))),
    'buy_margin_pct', (select buy_margin_pct from public.app_settings limit 1),
    'sell_margin_pct', (select sell_margin_pct from public.app_settings limit 1)
  );
end;
$$;

revoke all on function public.tool_order_lookup(text) from public, anon;
revoke all on function public.tool_interac_match(numeric, text, text) from public, anon;
revoke all on function public.tool_client_window(uuid, int) from public, anon;
revoke all on function public.tool_stock_forecast() from public, anon;
revoke all on function public.tool_margin_base(int) from public, anon;
grant execute on function public.tool_order_lookup(text) to authenticated;
grant execute on function public.tool_interac_match(numeric, text, text) to authenticated;
grant execute on function public.tool_client_window(uuid, int) to authenticated;
grant execute on function public.tool_stock_forecast() to authenticated;
grant execute on function public.tool_margin_base(int) to authenticated;
