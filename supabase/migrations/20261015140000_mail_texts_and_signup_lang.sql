-- Langue des clients et courriels en deux langues.
-- 1. Textes des courriels modifiés dans le Studio, par langue (fr, en). Vide = texte d'origine.
-- 2. La langue de la page d'inscription est enregistrée dans le profil dès la création du compte.

create table if not exists public.mail_texts (
  kind text not null check (kind in ('welcome','order-buy','order-sell','payment-received','usdt-received',
    'order-completed','kyc-approved','kyc-rejected','kyb-approved','kyb-rejected')),
  lang text not null check (lang in ('fr','en')),
  subject text check (char_length(subject) <= 160),
  heading text check (char_length(heading) <= 160),
  lead text check (char_length(lead) <= 1200),
  button text check (char_length(button) <= 40),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (kind, lang)
);
alter table public.mail_texts enable row level security;
create policy "Admin lit les textes des courriels" on public.mail_texts
  for select to authenticated using (has_role(auth.uid(), 'admin'::app_role));
create policy "Admin ajoute des textes de courriels" on public.mail_texts
  for insert to authenticated with check (has_role(auth.uid(), 'admin'::app_role));
create policy "Admin change les textes des courriels" on public.mail_texts
  for update to authenticated using (has_role(auth.uid(), 'admin'::app_role)) with check (has_role(auth.uid(), 'admin'::app_role));
comment on table public.mail_texts is 'Textes des courriels automatiques modifiés dans le Studio, par langue. Vide = texte d''origine.';

-- Les textes déjà modifiés (français) passent dans la nouvelle table ; mail_designs ne garde que le style.
insert into public.mail_texts (kind, lang, subject, heading, lead, button, updated_at, updated_by)
select kind, 'fr', subject, heading, lead, button, updated_at, updated_by from public.mail_designs
 where kind <> '*' and (subject is not null or heading is not null or lead is not null or button is not null)
on conflict do nothing;

create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_account_type public.account_type;
  v_limit numeric(12,2) := 9999.00;
  v_lang text := new.raw_user_meta_data->>'preferred_lang';
begin
  v_account_type := coalesce(
    (new.raw_user_meta_data->>'account_type')::public.account_type,
    'individual'
  );

  insert into public.profiles (
    id, full_name, email, sell_ref,
    interac_question, interac_answer,
    account_type, business_name, business_number, business_address, business_phone,
    daily_limit_cad, preferred_lang
  ) values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.email,
    'OB-' || upper(substr(replace(new.id::text, '-', ''), 1, 8)),
    'Code Ooble ?',
    'OB' || upper(substr(replace(new.id::text, '-', ''), 1, 6)),
    v_account_type,
    new.raw_user_meta_data->>'business_name',
    new.raw_user_meta_data->>'business_number',
    new.raw_user_meta_data->>'business_address',
    new.raw_user_meta_data->>'business_phone',
    v_limit,
    case when v_lang in ('fr', 'en') then v_lang end
  );
  return new;
end; $function$;
