-- Messagerie : une conversation supprimée disparaît de la Réception et des Envoyés (gardée hors de vue, avec qui l'a retirée).
alter table public.mail_threads
  add column if not exists removed_at timestamptz,
  add column if not exists removed_by uuid;
create index if not exists mail_threads_visible_idx on public.mail_threads (last_message_at desc) where removed_at is null;
