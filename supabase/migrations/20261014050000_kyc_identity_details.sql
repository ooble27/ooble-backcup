-- Vérification d'identité : les informations que la DOIMV et la règle du voyage exigent,
-- recueillies à chaque envoi (avec la preuve d'adresse, rangée dans document_paths.address_proof).
alter table public.kyc_verifications
  add column if not exists birth_date date,
  add column if not exists address_line text,
  add column if not exists city text,
  add column if not exists province text,
  add column if not exists postal_code text,
  add column if not exists occupation text;
