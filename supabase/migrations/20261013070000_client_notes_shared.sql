-- Notes internes sur un client, partagées par toute l'équipe (elles n'étaient gardées que sur l'appareil).
-- Comme un registre : on ajoute, on ne modifie ni n'efface.
create table if not exists public.client_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  author_id uuid not null default auth.uid(),
  author_name text,
  created_at timestamptz not null default now()
);
create index if not exists client_notes_client_idx on public.client_notes (client_id, created_at desc);

alter table public.client_notes enable row level security;

create policy client_notes_staff_read on public.client_notes for select to authenticated
  using (public.is_staff(auth.uid()));
create policy client_notes_staff_add on public.client_notes for insert to authenticated
  with check (public.is_staff(auth.uid()) and author_id = auth.uid());
