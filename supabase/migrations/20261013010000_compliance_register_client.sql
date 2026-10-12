-- Registre d'un seul client (PDF « Registre du client » dans sa fiche) :
-- mêmes colonnes que compliance_register, filtrées sur le client. Réservé aux administrateurs.
create or replace function public.compliance_register_client(_user uuid, _kind text)
returns setof jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Réservé aux administrateurs.' using errcode = '42501';
  end if;

  if _kind = 'operations' then
    return query
    select jsonb_build_object(
      'date', o.created_at,
      'reference', 'OOB-' || upper(left(o.id::text, 8)),
      'type', case when o.side = 'buy' then 'Achat' else 'Vente' end,
      'statut', o.status,
      'client', coalesce(nullif(p.business_name, ''), p.full_name),
      'courriel', p.email,
      'type_compte', p.account_type,
      'identite', p.kyc_status,
      'montant_cad', o.cad_amount,
      'montant_usdt', o.usdt_amount,
      'taux', o.locked_rate,
      'frais_cad', o.fee_cad,
      'reseau', o.network,
      'adresse_portefeuille', o.wallet_address,
      'courriel_interac', o.interac_email,
      'expediteur_interac', (select r.sender_name from public.interac_receipts r where r.order_id = o.id and r.status = 'matched' order by r.received_at limit 1),
      'reference_interac', (select r.interac_ref from public.interac_receipts r where r.order_id = o.id and r.status = 'matched' order by r.received_at limit 1),
      'hash_transaction', (select u.tx_hash from public.usdt_payouts u where u.order_id = o.id and u.status in ('broadcast', 'confirmed') order by u.created_at desc limit 1),
      'paiement_recu_le', (select min(e.created_at) from public.order_events e where e.order_id = o.id and e.new_status = 'payment_received'),
      'termine_le', (select min(e.created_at) from public.order_events e where e.order_id = o.id and e.new_status = 'completed')
    )
      from public.orders o
      left join public.profiles p on p.id = o.user_id
     where o.user_id = _user
     order by o.created_at;

  elsif _kind = 'identites' then
    return query
    select jsonb_build_object(
      'date', k.created_at,
      'verifie_le', coalesce(k.reviewed_at, k.updated_at),
      'client', coalesce(nullif(p.business_name, ''), p.full_name),
      'courriel', p.email,
      'type_compte', p.account_type,
      'fournisseur', k.provider,
      'reference_fournisseur', k.external_reference,
      'type_document', k.doc_type,
      'statut', k.status,
      'note', k.review_note
    )
      from public.kyc_verifications k
      left join public.profiles p on p.id = k.user_id
     where k.user_id = _user
     order by k.created_at;

  elsif _kind = 'alertes' then
    return query
    select jsonb_build_object(
      'creee_le', a.created_at,
      'reference', a.ref,
      'type', a.type,
      'origine', a.source,
      'client', coalesce(nullif(p.business_name, ''), p.full_name),
      'courriel', p.email,
      'montant_cad', a.amount_cad,
      'motif', a.reason,
      'statut', a.status,
      'classement', a.classification,
      'notes', a.notes,
      'cloturee_le', a.closed_at
    )
      from public.compliance_alerts a
      left join public.profiles p on p.id = a.user_id
     where a.user_id = _user
     order by a.created_at;

  else
    raise exception 'Registre inconnu : %', _kind using errcode = '22023';
  end if;
end;
$function$;

revoke all on function public.compliance_register_client(uuid, text) from public, anon;
grant execute on function public.compliance_register_client(uuid, text) to authenticated;
