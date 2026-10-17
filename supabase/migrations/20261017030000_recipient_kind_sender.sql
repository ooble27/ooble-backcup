-- Carnet : les adresses d'envoi des ventes (« sender ») sont séparées des adresses de réception des achats (« wallet »).
alter type public.recipient_kind add value if not exists 'sender';
