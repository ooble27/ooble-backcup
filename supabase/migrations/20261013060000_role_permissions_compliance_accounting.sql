-- Permissions par rôle. On AJOUTE des règles (elles s'additionnent) ; rien d'existant n'est retiré.

create or replace function public.has_any_role(_user_id uuid, _roles public.app_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = any(_roles));
$$;
grant execute on function public.has_any_role(uuid, public.app_role[]) to authenticated;

-- Conformité : alertes, déclarations, programme, signalements.
create policy compliance_role_alerts on public.compliance_alerts for all to authenticated
  using (public.has_role(auth.uid(), 'compliance')) with check (public.has_role(auth.uid(), 'compliance'));
create policy compliance_role_checklist on public.compliance_checklist for all to authenticated
  using (public.has_role(auth.uid(), 'compliance')) with check (public.has_role(auth.uid(), 'compliance'));
create policy compliance_role_declarations on public.compliance_declarations for all to authenticated
  using (public.has_role(auth.uid(), 'compliance')) with check (public.has_role(auth.uid(), 'compliance'));
create policy compliance_role_flags on public.compliance_flags for all to authenticated
  using (public.has_role(auth.uid(), 'compliance')) with check (public.has_role(auth.uid(), 'compliance'));

-- Conformité : elle vérifie aussi les identités (particuliers et entreprises) et voit les pièces.
create policy compliance_role_kyc_read on public.kyc_verifications for select to authenticated
  using (public.has_role(auth.uid(), 'compliance'));
create policy compliance_role_kyc_review on public.kyc_verifications for update to authenticated
  using (public.has_role(auth.uid(), 'compliance'));
create policy compliance_role_kyb_review on public.business_verifications for update to authenticated
  using (public.has_role(auth.uid(), 'compliance')) with check (public.has_role(auth.uid(), 'compliance'));
create policy kyc_compliance_read_all on storage.objects for select to authenticated
  using (bucket_id = 'kyc' and public.has_role(auth.uid(), 'compliance'));

-- Fonctions réservées : registres et analyse (Admin + Conformité), comptabilité (Admin + Comptabilité + Conformité),
-- décision d'identité sur le profil (Admin + Vérification + Conformité).
do $$
declare
  f record;
  def text;
begin
  for f in
    select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('compliance_register', 'compliance_register_client', 'compliance_register_stats', 'compliance_scan',
      'admin_accounting_summary', 'admin_accounting_orders', 'protect_profile_fields')
  loop
    def := pg_get_functiondef(f.oid);
    if f.proname like 'compliance_%' then
      def := replace(def, 'public.has_role(auth.uid(), ''admin'')', 'public.has_any_role(auth.uid(), array[''admin'',''compliance'']::public.app_role[])');
    elsif f.proname like 'admin_accounting_%' then
      def := replace(def, 'public.is_staff(auth.uid())', 'public.has_any_role(auth.uid(), array[''admin'',''accounting'',''compliance'']::public.app_role[])');
    else
      def := replace(def, 'public.has_role(auth.uid(), ''kyc_reviewer'')', 'public.has_any_role(auth.uid(), array[''kyc_reviewer'',''compliance'']::public.app_role[])');
    end if;
    execute def;
  end loop;
end $$;
