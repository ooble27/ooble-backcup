-- 1. Le back-office voit les commandes en direct (nouvelle commande, paiement reçu, envoi automatique).
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders') then
    alter publication supabase_realtime add table public.orders;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'usdt_payouts') then
    alter publication supabase_realtime add table public.usdt_payouts;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'interac_receipts') then
    alter publication supabase_realtime add table public.interac_receipts;
  end if;
end $$;

-- 2. Prise en charge : seulement une commande payée, qu'aucun envoi automatique ne traite,
--    et que personne n'a déjà prise. Les fonctions serveur (sans session) ne sont pas concernées.
create or replace function public.guard_order_claim()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.assigned_to is not null and new.assigned_to is distinct from old.assigned_to then
    if old.assigned_to is not null then
      raise exception 'Cette commande est déjà prise en charge par un autre membre de l''équipe.' using errcode = '42501';
    end if;
    if old.status <> 'payment_received' then
      raise exception 'Cette commande ne peut pas être prise : elle attend le paiement du client ou elle est déjà en cours d''envoi.' using errcode = '42501';
    end if;
    if exists (select 1 from public.usdt_payouts p where p.order_id = old.id and p.status <> 'failed') then
      raise exception 'Cette commande est traitée automatiquement : l''envoi des USDT est en cours.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace trigger trg_guard_order_claim
  before update of assigned_to on public.orders
  for each row execute function public.guard_order_claim();
