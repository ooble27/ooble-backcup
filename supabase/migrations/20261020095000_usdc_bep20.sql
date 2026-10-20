-- USDC sur BNB Chain (BEP20) : version reliée, émise par un tiers et adossée à l'USDC de Circle
-- (contrat 0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d, 18 décimales). Ouverte à la demande d'Ooble.
-- Tron reste exclu : l'USDC n'y est plus émis.
create or replace function public.asset_on_network(_asset public.crypto_asset, _network public.usdt_network)
returns boolean language sql immutable as $$
  select case when _asset = 'usdc' then _network in ('erc20', 'polygon', 'avalanche', 'spl', 'bep20') else true end
$$;
