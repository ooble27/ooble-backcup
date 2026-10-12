-- Messagerie : la réception ne montre que les messages laissés sur le site.
--   origin = 'form'  → formulaire Contact ou OTC du site (seuls visibles en Réception)
--   origin = 'staff' → courriel écrit depuis le back-office (visible dans Envoyés)
--   origin = 'email' → ancien courriel entrant (support@ / otc@) : plus reçu ici,
--                      ces courriels arrivent dans la boîte habituelle de l'équipe.
-- Valeur par défaut 'form' : les anciennes versions des fonctions continuent de
-- remplir correctement la colonne pendant leur redéploiement.
--
-- Idempotente ; appliquée en production le 2026-10-12.

alter table public.mail_threads
  add column if not exists origin text not null default 'form';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'mail_threads_origin_check') then
    alter table public.mail_threads
      add constraint mail_threads_origin_check check (origin in ('form', 'staff', 'email'));
  end if;
end $$;

-- Fils ouverts par un envoi de l'équipe : premier message sortant.
update public.mail_threads t
   set origin = 'staff'
 where origin = 'form'
   and (select m.direction from public.mail_messages m where m.thread_id = t.id order by m.created_at limit 1) = 'outbound';

-- Fils ouverts par un courriel entrant (et non par le formulaire du site).
update public.mail_threads t
   set origin = 'email'
 where origin = 'form'
   and t.subject not like '%· formulaire de contact'
   and t.mailbox = 'support';

create index if not exists idx_mail_threads_origin on public.mail_threads(origin, last_message_at desc);
