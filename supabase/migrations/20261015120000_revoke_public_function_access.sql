-- Sécurité : fermer l'accès direct (API /rpc) aux fonctions qui ne sont pas faites pour être appelées
-- par un visiteur non connecté, ni, pour les fonctions de déclencheur et internes, par un client.
-- Ces fonctions vérifiaient déjà le rôle à l'intérieur ; on retire en plus la porte d'entrée.
-- Restent ouvertes au public : has_role, has_any_role, is_staff (utilisées par les règles d'accès),
-- email_domain_allowed (inscription), marketing_unsubscribe (désabonnement), platform_launched (site).

-- Réservées à l'équipe connectée (le rôle est vérifié dans chaque fonction).
revoke execute on function public.accounting_close_month(text, text) from public, anon;
revoke execute on function public.accounting_reopen_month(text, text) from public, anon;
revoke execute on function public.admin_accounting_ledger(timestamptz, timestamptz, integer, integer, boolean) from public, anon;
revoke execute on function public.admin_accounting_orders(timestamptz, timestamptz, integer, integer) from public, anon;
revoke execute on function public.admin_accounting_summary(timestamptz, timestamptz) from public, anon;
revoke execute on function public.compliance_register(text, timestamptz, timestamptz) from public, anon;
revoke execute on function public.compliance_register_stats() from public, anon;
revoke execute on function public.compliance_scan() from public, anon;
grant execute on function public.accounting_close_month(text, text) to authenticated;
grant execute on function public.accounting_reopen_month(text, text) to authenticated;
grant execute on function public.admin_accounting_ledger(timestamptz, timestamptz, integer, integer, boolean) to authenticated;
grant execute on function public.admin_accounting_orders(timestamptz, timestamptz, integer, integer) to authenticated;
grant execute on function public.admin_accounting_summary(timestamptz, timestamptz) to authenticated;
grant execute on function public.compliance_register(text, timestamptz, timestamptz) to authenticated;
grant execute on function public.compliance_register_stats() to authenticated;
grant execute on function public.compliance_scan() to authenticated;

-- Fonctions de déclencheur et internes : personne ne les appelle directement.
revoke execute on function public.block_disposable_signup() from public, anon, authenticated;
revoke execute on function public.guard_order_claim() from public, anon, authenticated;
revoke execute on function public.orders_note_wallets() from public, anon, authenticated;
revoke execute on function public.orders_note_wallets_after() from public, anon, authenticated;
-- Rapprochement d'une commande : appelé seulement par les fonctions comptables (sinon, n'importe quel
-- client connecté qui connaîtrait l'identifiant d'une commande pourrait en lire les montants).
revoke execute on function public.accounting_recon(uuid) from public, anon, authenticated;
