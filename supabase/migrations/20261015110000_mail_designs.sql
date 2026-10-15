-- Studio des courriels : style et textes des courriels automatiques, réglés depuis
-- Back-office › Réglages › Studio des courriels.
-- Une ligne « * » = style de tous les courriels ; une ligne par courriel pour un style
-- ou des textes propres. Un champ vide = le texte d'origine.
create table if not exists public.mail_designs (
  kind text primary key check (kind in ('*','welcome','order-buy','order-sell','payment-received','usdt-received',
    'order-completed','kyc-approved','kyc-rejected','kyb-approved','kyb-rejected')),
  style text check (style in ('sobre','recu','lettre','marque')),
  subject text check (char_length(subject) <= 160),
  heading text check (char_length(heading) <= 160),
  lead text check (char_length(lead) <= 1200),
  button text check (char_length(button) <= 40),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.mail_designs enable row level security;

create policy "Admin lit le studio des courriels" on public.mail_designs
  for select to authenticated using (has_role(auth.uid(), 'admin'::app_role));
create policy "Admin ajoute au studio des courriels" on public.mail_designs
  for insert to authenticated with check (has_role(auth.uid(), 'admin'::app_role));
create policy "Admin change le studio des courriels" on public.mail_designs
  for update to authenticated using (has_role(auth.uid(), 'admin'::app_role)) with check (has_role(auth.uid(), 'admin'::app_role));

insert into public.mail_designs (kind, style) values ('*', 'sobre') on conflict (kind) do nothing;
