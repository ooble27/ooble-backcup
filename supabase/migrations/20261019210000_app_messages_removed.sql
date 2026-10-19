-- Messages dans l'app : « Retirer » les sort de la liste du back-office et de l'app (désactivés, gardés pour l'historique).
alter table public.app_messages add column if not exists removed_at timestamptz;
