-- Vérification : qui examine un dossier en ce moment, et qui a pris la décision.
alter table public.kyc_verifications
  add column if not exists assigned_to uuid,
  add column if not exists assigned_name text,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_by_name text;
alter table public.business_verifications
  add column if not exists assigned_to uuid,
  add column if not exists assigned_name text,
  add column if not exists reviewed_by_name text;

-- La base signe la décision elle-même : seul un membre de l'équipe peut prendre un dossier,
-- et l'auteur d'une décision est toujours celui qui l'a prise (le client ne peut rien y écrire).
create or replace function public.kyc_review_stamp()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if not public.is_staff(auth.uid()) then
    if tg_op = 'INSERT' then
      new.assigned_to := null; new.assigned_name := null; new.reviewed_by := null; new.reviewed_by_name := null;
    else
      new.assigned_to := old.assigned_to; new.assigned_name := old.assigned_name;
      new.reviewed_by := old.reviewed_by; new.reviewed_by_name := old.reviewed_by_name;
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    new.reviewed_by := auth.uid();
    new.reviewed_by_name := (select coalesce(nullif(trim(p.full_name), ''), p.email) from public.profiles p where p.id = auth.uid());
    new.assigned_to := null; new.assigned_name := null;
  end if;
  return new;
end;
$function$;
revoke execute on function public.kyc_review_stamp() from anon, authenticated, public;

create or replace trigger trg_kyc_review_stamp before insert or update on public.kyc_verifications
  for each row execute function public.kyc_review_stamp();
create or replace trigger trg_kyb_review_stamp before insert or update on public.business_verifications
  for each row execute function public.kyc_review_stamp();

-- Les dossiers arrivent et se prennent en direct.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'kyc_verifications') then
    alter publication supabase_realtime add table public.kyc_verifications;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'business_verifications') then
    alter publication supabase_realtime add table public.business_verifications;
  end if;
end $$;
