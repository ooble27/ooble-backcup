-- Modèles de l'équipe pour les notifications push et les messages dans l'app (Marketing ›
-- Notifications). Les modèles Ooble de base sont dans le code ; ceux-ci sont enregistrés par
-- l'équipe depuis le formulaire. Un modèle retiré est seulement archivé.

create table if not exists public.notif_templates (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('push', 'message')),
  name text not null check (char_length(name) between 1 and 60),
  title_fr text not null check (char_length(title_fr) between 1 and 80),
  body_fr text check (char_length(body_fr) <= 280),
  cta_fr text check (char_length(cta_fr) <= 30),
  title_en text check (char_length(title_en) <= 80),
  body_en text check (char_length(body_en) <= 280),
  cta_en text check (char_length(cta_en) <= 30),
  url text check (url ~ '^/[A-Za-z0-9/_?=&%.-]*$'),
  audience text not null default 'all' check (audience in ('all', 'verified', 'unverified', 'staff')),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid,
  created_by_name text
);
alter table public.notif_templates enable row level security;
create policy "Marketing lit les modèles" on public.notif_templates
  for select to authenticated using (has_any_role(auth.uid(), array['admin','marketing']::app_role[]));
create policy "Marketing crée les modèles" on public.notif_templates
  for insert to authenticated with check (has_any_role(auth.uid(), array['admin','marketing']::app_role[]));
create policy "Marketing archive les modèles" on public.notif_templates
  for update to authenticated using (has_any_role(auth.uid(), array['admin','marketing']::app_role[]))
  with check (has_any_role(auth.uid(), array['admin','marketing']::app_role[]));
