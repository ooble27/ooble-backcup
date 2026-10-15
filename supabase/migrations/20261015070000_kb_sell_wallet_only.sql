-- Base de connaissances › Règlement automatique : le client donne seulement l'adresse de son portefeuille
-- (plus d'identifiant de transaction ni de choix « plateforme d'échange »).
update public.kb_articles set body = replace(replace(body,
'À la vente, le client indique d''où il envoie (son adresse, ou la plateforme utilisée), puis l''adresse de dépôt s''affiche : la vente existe donc avant l''envoi. Après l''envoi, il peut coller l''identifiant de la transaction (TxID). Un dépôt est rattaché automatiquement, du plus sûr au moins sûr :

1. **Identifiant de transaction** donné par le client : certain.
2. **Adresse connue**',
'À la vente, le client donne l''adresse de son portefeuille, puis l''adresse de dépôt s''affiche : la vente existe donc avant l''envoi. Un dépôt est rattaché automatiquement, du plus sûr au moins sûr :

1. **Adresse connue**'),
'3. **Montant et horaire** : c''est la seule vente de ce montant ouverte dans les 2 heures avant l''arrivée, et l''envoi vient de l''adresse déclarée (si le client en a déclaré une).

Jamais automatique',
'2. **Montant et horaire** : c''est la seule vente de ce montant ouverte dans les 2 heures avant l''arrivée, et l''envoi vient de l''adresse déclarée.

Jamais automatique')
 where title = 'Règlement automatique';
update public.kb_articles set body = replace(body,
'La fiche de la commande montre toute la chaîne : adresse déclarée, identifiant donné, adresse d''envoi réelle et méthode de rattachement.',
'La fiche de la commande montre toute la chaîne : portefeuille déclaré, adresse d''envoi réelle et méthode de rattachement. Un client qui envoie depuis une plateforme d''échange (Binance…) envoie depuis une adresse de la plateforme : sa vente part « À vérifier », on la rattache d''un clic après contrôle.')
 where title = 'Règlement automatique';
