-- Deux vrais rôles : Conformité (jusqu'ici donnait un accès Admin complet) et Comptabilité.
alter type public.app_role add value if not exists 'compliance';
alter type public.app_role add value if not exists 'accounting';
