-- Registre des opérations : les bons portefeuilles de chaque côté.
-- - Achat : le client reçoit sur son adresse ; Ooble envoie depuis son portefeuille d'envoi (hash de l'envoi).
-- - Vente : le client envoie depuis son adresse (lue sur la blockchain, sinon déclarée) vers l'adresse de
--   dépôt d'Ooble (hash du dépôt). Avant, la vente affichait l'adresse d'Ooble comme celle du client.
-- Plus la cryptomonnaie (USDC, USDT), et les alertes masquées sortent du registre.

do $$
declare
  f record; src text; before text;
  new_wallet constant text := $q$      'adresse_portefeuille', case when o.side = 'buy' then o.wallet_address
        else coalesce((select d.from_address from public.chain_deposits d where d.order_id = o.id and d.status = 'matched' order by d.block_time limit 1), o.sender_address) end,
      'adresse_ooble', case when o.side = 'buy'
        then (select u.from_address from public.usdt_payouts u where u.order_id = o.id and u.status in ('broadcast', 'confirmed') order by u.created_at desc limit 1)
        else o.wallet_address end,
$q$;
  new_hash constant text := $q$      'hash_transaction', case when o.side = 'buy'
        then (select u.tx_hash from public.usdt_payouts u where u.order_id = o.id and u.status in ('broadcast', 'confirmed') order by u.created_at desc limit 1)
        else coalesce((select d.tx_hash from public.chain_deposits d where d.order_id = o.id and d.status = 'matched' order by d.block_time limit 1), o.client_tx_hash) end,
$q$;
begin
  for f in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('compliance_register', 'compliance_register_client')
  loop
    src := pg_get_functiondef(f.oid);
    before := src;
    src := replace(src, E'      \'adresse_portefeuille\', o.wallet_address,\n', new_wallet);
    src := replace(src, E'      \'hash_transaction\', (select u.tx_hash from public.usdt_payouts u where u.order_id = o.id and u.status in (\'broadcast\', \'confirmed\') order by u.created_at desc limit 1),\n', new_hash);
    src := replace(src, E'      \'montant_usdt\', o.usdt_amount,\n', E'      \'montant_usdt\', o.usdt_amount,\n      \'actif\', upper(o.asset::text),\n');
    src := replace(src, E'     where a.created_at >= f and a.created_at < t\n', E'     where a.created_at >= f and a.created_at < t and not a.hidden\n');
    src := replace(src, E'     where a.user_id = _user\n', E'     where a.user_id = _user and not a.hidden\n');
    if position('adresse_ooble' in src) = 0 or position('not a.hidden' in src) = 0 then
      raise exception 'Registre % : texte attendu introuvable, rien n''est changé.', f.proname;
    end if;
    execute src;
  end loop;
end $$;
