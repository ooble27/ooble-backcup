-- Demandes d'approbation : un membre demande l'accord d'un administrateur avant une action sensible
-- (gros montant, remboursement, changement de marge…). L'admin approuve ou refuse d'un clic ; tout reste
-- dans l'historique et dans le journal d'audit. Rien n'est effacé.

create table if not exists public.team_approvals (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  title text not null,
  details text,
  amount_cad numeric,
  order_id uuid,
  client_id uuid,
  requested_by uuid not null,
  requested_by_name text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'refused', 'cancelled')),
  decided_by uuid,
  decided_by_name text,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);
create index if not exists team_approvals_recent on public.team_approvals (created_at desc);
alter table public.team_approvals enable row level security;
revoke all on public.team_approvals from public, anon, authenticated;
grant select on public.team_approvals to authenticated;
create policy team_approvals_read on public.team_approvals for select to authenticated using (public.is_staff(auth.uid()));
alter publication supabase_realtime add table public.team_approvals;

create or replace function public.team_approval_request(_kind text, _title text, _details text, _amount numeric, _order uuid, _client uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare aid uuid; who uuid[];
begin
  perform public.team_require_staff();
  if btrim(coalesce(_title, '')) = '' then raise exception 'Dites ce que vous voulez faire.'; end if;
  insert into public.team_approvals (kind, title, details, amount_cad, order_id, client_id, requested_by, requested_by_name)
  values (left(coalesce(nullif(btrim(_kind), ''), 'other'), 40), left(btrim(_title), 200), nullif(left(btrim(coalesce(_details, '')), 2000), ''), _amount, _order, _client, auth.uid(), public.team_who())
  returning id into aid;
  insert into public.admin_audit_log (actor_user_id, actor_email, actor_role, action, entity_kind, entity_id, metadata)
  select auth.uid(), (select email from auth.users where id = auth.uid()), 'team', 'approval.request', 'approval', aid, jsonb_build_object('title', _title, 'kind', _kind, 'amount', _amount);
  select array_agg(distinct user_id) into who from public.user_roles where role::text = 'admin' and user_id <> auth.uid();
  if who is not null then
    perform public.team_push(who, 'tasks', 'Approbation demandée par ' || split_part(public.team_who(), ' ', 1), left(btrim(_title), 140), '/admin?tab=me');
  end if;
  return aid;
end;
$$;
revoke all on function public.team_approval_request(text, text, text, numeric, uuid, uuid) from public, anon;
grant execute on function public.team_approval_request(text, text, text, numeric, uuid, uuid) to authenticated;

-- Décision d'un administrateur (jamais sur sa propre demande), ou retrait par la personne qui a demandé.
create or replace function public.team_approval_decide(_id uuid, _status text, _note text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare a record;
begin
  perform public.team_require_staff();
  select * into a from public.team_approvals where id = _id;
  if a is null then raise exception 'Demande introuvable.'; end if;
  if a.status <> 'pending' then raise exception 'Cette demande a déjà reçu une réponse.'; end if;
  if _status = 'cancelled' then
    if a.requested_by <> auth.uid() then raise exception 'Seule la personne qui a demandé peut retirer sa demande.'; end if;
  elsif _status in ('approved', 'refused') then
    if not public.has_any_role(auth.uid(), array['admin']::public.app_role[]) then raise exception 'Seul un administrateur peut répondre.'; end if;
    if a.requested_by = auth.uid() then raise exception 'Un autre administrateur doit répondre à votre propre demande.'; end if;
  else
    raise exception 'Réponse inconnue.';
  end if;
  update public.team_approvals set status = _status, decided_by = auth.uid(), decided_by_name = public.team_who(), decided_at = now(),
    decision_note = nullif(left(btrim(coalesce(_note, '')), 1000), '')
  where id = _id;
  insert into public.admin_audit_log (actor_user_id, actor_email, actor_role, action, entity_kind, entity_id, metadata)
  select auth.uid(), (select email from auth.users where id = auth.uid()), 'team', 'approval.' || _status, 'approval', _id, jsonb_build_object('title', a.title, 'note', _note);
  if _status in ('approved', 'refused') then
    perform public.team_push(array[a.requested_by], 'tasks',
      case when _status = 'approved' then 'Demande approuvée' else 'Demande refusée' end || ' par ' || split_part(public.team_who(), ' ', 1),
      left(a.title, 140), '/admin?tab=me');
  end if;
end;
$$;
revoke all on function public.team_approval_decide(uuid, text, text) from public, anon;
grant execute on function public.team_approval_decide(uuid, text, text) to authenticated;
