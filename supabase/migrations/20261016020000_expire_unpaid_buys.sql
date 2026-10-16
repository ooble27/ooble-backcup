-- Achat non payé : annulé automatiquement après un délai réglable (30 minutes par défaut).
-- Réglages › Délais. Un virement qui arriverait après coup n'est pas rapproché (l'avis Interac
-- passe « À vérifier » : l'équipe rembourse ou rouvre la commande).

alter table public.app_settings add column if not exists buy_expiry_minutes int not null default 30;
do $$ begin
  alter table public.app_settings add constraint app_settings_buy_expiry check (buy_expiry_minutes between 10 and 240);
exception when duplicate_object then null; end $$;

create or replace function public.expire_unpaid_buys()
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  mins int;
  n int := 0;
  o record;
begin
  select coalesce(buy_expiry_minutes, 30) into mins from public.app_settings where id = 1;
  for o in
    select id, status from public.orders
     where side = 'buy'
       and status in ('created', 'awaiting_payment')
       and created_at < now() - make_interval(mins => coalesce(mins, 30))
     for update skip locked
  loop
    -- Revérifié au moment de l'écriture : un paiement rapproché entre-temps n'est jamais annulé.
    update public.orders set status = 'cancelled' where id = o.id and status in ('created', 'awaiting_payment');
    if not found then continue; end if;
    insert into public.order_events (order_id, previous_status, new_status, actor, note)
    values (o.id, o.status, 'cancelled', 'system',
            format('Annulée automatiquement : non payée dans les %s minutes.', coalesce(mins, 30)));
    n := n + 1;
  end loop;
  return n;
end;
$function$;

revoke execute on function public.expire_unpaid_buys() from public, anon, authenticated;

do $$ begin
  if not exists (select 1 from cron.job where jobname = 'expire-unpaid-buys') then
    perform cron.schedule('expire-unpaid-buys', '* * * * *', $c$ select public.expire_unpaid_buys(); $c$);
  end if;
end $$;
