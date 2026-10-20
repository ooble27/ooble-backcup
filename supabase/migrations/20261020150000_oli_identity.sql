-- Réglages › Oli : son nom, son avatar, ses couleurs, et les seuils de son analyse des dossiers.
alter table public.oli_settings
  add column if not exists name text not null default 'Oli' check (char_length(btrim(name)) between 1 and 24),
  -- Un dessin de la galerie (/illustrations/oli/<id>.svg) ou « seed:… » pour un dessin illustré.
  add column if not exists avatar text not null default 'robot' check (avatar ~ '^(seed:[a-z0-9:-]{1,40}|[a-z-]{1,24})$'),
  add column if not exists avatar_bg text not null default 'sage' check (avatar_bg in ('light', 'coral', 'orange', 'sun', 'sage', 'teal', 'indigo', 'blue', 'pink')),
  add column if not exists name_color text not null default 'sage' check (name_color in ('white', 'coral', 'orange', 'sun', 'sage', 'teal', 'indigo', 'blue', 'pink')),
  add column if not exists expiry_warn_days int not null default 30 check (expiry_warn_days between 0 and 180),
  add column if not exists min_age int not null default 18 check (min_age between 18 and 25),
  add column if not exists address_max_days int not null default 92 check (address_max_days between 30 and 365);

