-- Journal des sauvegardes nocturnes (workflow GitHub « Sauvegarde nocturne »).
-- Le workflow écrit une ligne par exécution avec la connexion Postgres ;
-- l'équipe la lit dans le back-office (onglet Plateforme).

create table if not exists public.backup_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'failed')),
  db_bytes bigint,
  files_count integer,
  files_bytes bigint,
  archive_bytes bigint,
  tables jsonb,
  restore_ok boolean,
  restore_detail text,
  location text,
  run_url text,
  error text
);

create index if not exists backup_runs_started_idx on public.backup_runs (started_at desc);

alter table public.backup_runs enable row level security;

create policy backup_runs_staff_read on public.backup_runs
  for select using (public.is_staff(auth.uid()));
