-- Taux en direct : la fonction refresh-rate (cours USDT/CAD de Kraken, CoinGecko en repli)
-- passe toutes les 10 secondes ; elle n'ajoute une ligne que si le taux change (ou toutes
-- les 5 minutes au plus tard).
do $$ begin
  perform cron.alter_job((select jobid from cron.job where jobname = 'refresh-usdt-rate'), schedule := '10 seconds');
end $$;

-- Base de connaissances › Configuration : le nouveau rythme du taux.
update public.kb_articles set updated_at = now(), body = replace(body,
  $a$| Rafraîchissement du taux | Toutes les 10 minutes, et aussitôt après un changement de marge | pg_cron, fonction `refresh-rate` |$a$,
  $b$| Rafraîchissement du taux | Toutes les 10 secondes (cours USDT/CAD de Kraken, CoinGecko en repli) ; une ligne seulement si le taux change, ou toutes les 5 minutes ; aussitôt après un changement de marge | pg_cron `refresh-usdt-rate`, fonction `refresh-rate` |$b$)
where slug = 'tech-configuration';
