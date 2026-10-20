-- Oli prépare les dossiers de vérification d'identité : il lit la pièce et la preuve d'adresse,
-- les compare à ce que le client a déclaré, et écrit son rapport. Il ne décide jamais :
-- l'équipe approuve ou refuse. La comparaison des visages viendra plus tard (étape 2).

-- Interrupteur (Réglages › Analyse d'Oli). Une seule ligne.
create table if not exists public.oli_settings (
  id int primary key default 1 check (id = 1),
  kyc_check boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);
insert into public.oli_settings (id) values (1) on conflict (id) do nothing;
alter table public.oli_settings enable row level security;
create policy "Équipe lit les réglages d'Oli" on public.oli_settings for select to authenticated
  using (public.is_staff(auth.uid()));
create policy "Admin modifie les réglages d'Oli" on public.oli_settings for update to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
grant select, update on public.oli_settings to authenticated;

-- Rapport d'Oli, un par dossier (refait si on relance l'analyse).
create table if not exists public.kyc_checks (
  kyc_id uuid primary key references public.kyc_verifications (id),
  status text not null default 'pending' check (status in ('pending', 'done', 'error')),
  verdict text check (verdict in ('clear', 'review')),
  -- [{ key, state: ok | look | unknown | manual, text }]
  checks jsonb not null default '[]'::jsonb,
  -- Ce qu'Oli a lu sur les documents (nom, date de naissance, numéro, expiration…).
  extracted jsonb,
  -- Empreinte de la pièce (pays, type, numéro) : repère une même pièce sur deux comptes.
  doc_fingerprint text,
  error text,
  model text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists kyc_checks_fingerprint_idx on public.kyc_checks (doc_fingerprint) where doc_fingerprint is not null;
alter table public.kyc_checks enable row level security;
-- Mêmes personnes que pour les dossiers : administrateurs, vérificateurs et conformité. Écrit par le serveur seul.
create policy "Équipe des vérifications lit les rapports d'Oli" on public.kyc_checks for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'kyc_reviewer') or public.has_role(auth.uid(), 'compliance'));
grant select on public.kyc_checks to authenticated;

-- À l'arrivée d'un dossier (ou de nouveaux documents), Oli est prévenu. Ne bloque jamais l'envoi du client.
create or replace function public.oli_kyc_check_queue()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.status <> 'pending' or new.document_paths is null then return new; end if;
  if tg_op = 'UPDATE' and new.document_paths is not distinct from old.document_paths then return new; end if;
  if not coalesce((select kyc_check from public.oli_settings where id = 1), false) then return new; end if;
  begin
    perform net.http_post(
      url := 'https://uukxacjjviiktmbikdwp.supabase.co/functions/v1/kyc-check',
      headers := public.cron_headers(),
      body := jsonb_build_object('kyc_id', new.id),
      timeout_milliseconds := 5000
    );
  exception when others then
    null; -- l'équipe pourra lancer l'analyse à la main depuis le dossier
  end;
  return new;
end;
$$;
create or replace trigger trg_oli_kyc_check after insert or update of document_paths on public.kyc_verifications
  for each row execute function public.oli_kyc_check_queue();
