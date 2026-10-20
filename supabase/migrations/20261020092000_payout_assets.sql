-- Envois automatiques et transactions enregistrées : l'actif envoyé (USDT par défaut).
alter table public.usdt_payouts add column if not exists asset public.crypto_asset not null default 'usdt';
alter table public.blockchain_transactions add column if not exists asset public.crypto_asset not null default 'usdt';
