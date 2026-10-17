-- Vue d'ensemble du marketing : chiffres jour par jour (calendrier des envois) et commandes par campagne.
-- Lecture seule, réservée à l'équipe marketing, comme marketing_overview.

-- Une ligne par jour (heure de Montréal) : courriels envoyés, ouverts, cliqués, et commandes passées
-- dans les 7 jours suivant un envoi (le jour de la commande).
create or replace function public.marketing_daily(_since timestamptz)
 returns table(day date, sent integer, opened integer, clicked integer, orders integer, volume numeric)
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
begin
  if not public.has_any_role(auth.uid(), array['admin','marketing']::public.app_role[]) then
    raise exception 'Réservé à l''équipe marketing.' using errcode = '42501';
  end if;
  return query
  with s as (
    select x.* from public.campaign_sends x join public.campaigns c on c.id = x.campaign_id
     where x.status = 'sent' and x.sent_at >= _since and not c.is_test
  ),
  o as (
    select distinct o.id, o.cad_amount, o.created_at from public.orders o
      join s on o.user_id = s.user_id
     where o.created_at between s.sent_at and s.sent_at + interval '7 days'
       and o.status not in ('cancelled', 'expired', 'refunded')
  ),
  d1 as (
    select (s.sent_at at time zone 'America/Toronto')::date as d,
           count(*)::int as sent,
           count(*) filter (where s.opened_at is not null)::int as opened,
           count(*) filter (where s.clicked_at is not null)::int as clicked
      from s group by 1
  ),
  d2 as (
    select (o.created_at at time zone 'America/Toronto')::date as d, count(*)::int as orders, coalesce(sum(o.cad_amount), 0) as volume
      from o group by 1
  )
  select coalesce(d1.d, d2.d), coalesce(d1.sent, 0), coalesce(d1.opened, 0), coalesce(d1.clicked, 0), coalesce(d2.orders, 0), coalesce(d2.volume, 0)
    from d1 full join d2 on d1.d = d2.d
   order by 1;
end;
$function$;
revoke execute on function public.marketing_daily(timestamptz) from public, anon;
grant execute on function public.marketing_daily(timestamptz) to authenticated;

-- Commandes rapportées par chaque campagne (dans les 7 jours suivant l'envoi au destinataire).
create or replace function public.campaign_orders()
 returns table(campaign_id uuid, orders integer, volume numeric)
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
begin
  if not public.has_any_role(auth.uid(), array['admin','marketing']::public.app_role[]) then
    raise exception 'Réservé à l''équipe marketing.' using errcode = '42501';
  end if;
  return query
  select t.campaign_id, count(*)::int, coalesce(sum(t.cad_amount), 0)
    from (
      select distinct x.campaign_id, o.id, o.cad_amount
        from public.campaign_sends x
        join public.orders o on o.user_id = x.user_id
         and o.created_at between x.sent_at and x.sent_at + interval '7 days'
         and o.status not in ('cancelled', 'expired', 'refunded')
       where x.status = 'sent'
    ) t
   group by t.campaign_id;
end;
$function$;
revoke execute on function public.campaign_orders() from public, anon;
grant execute on function public.campaign_orders() to authenticated;
