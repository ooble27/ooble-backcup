-- Recharges de stock : la cryptomonnaie achetée chez le fournisseur (USDT par défaut).
-- Le bénéfice au coût moyen traite l'USDT et l'USDC comme un même stock de dollars américains numériques.
alter table public.supplier_purchases add column if not exists asset public.crypto_asset not null default 'usdt';
