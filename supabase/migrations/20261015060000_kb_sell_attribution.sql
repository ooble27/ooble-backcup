-- Base de connaissances › Règlement automatique : le rattachement des ventes, tel qu'il fonctionne maintenant.
update public.kb_articles set body = replace(body,
'Toutes les 2 minutes, Ooble lit les transferts d''USDT entrants sur ses adresses de dépôt (Tron, BNB Chain, Polygon), les enregistre et les rapproche des ventes en attente du même réseau et du même montant. Le client reçoit alors le courriel « USDT reçus » et la vente passe à « À traiter ».',
'Toutes les 2 minutes, Ooble lit les transferts d''USDT entrants sur ses adresses de dépôt (réseaux EVM et Tron), les enregistre et les rattache aux ventes en attente. Le client reçoit alors le courriel « USDT reçus » et la vente passe à « À traiter ».

Toutes les ventes arrivent à la même adresse : il faut donc savoir **qui** a envoyé. À la vente, le client indique d''où il envoie (son adresse, ou la plateforme utilisée), puis l''adresse de dépôt s''affiche : la vente existe donc avant l''envoi. Après l''envoi, il peut coller l''identifiant de la transaction (TxID). Un dépôt est rattaché automatiquement, du plus sûr au moins sûr :

1. **Identifiant de transaction** donné par le client : certain.
2. **Adresse connue** : l''envoi vient d''une adresse qui a déjà servi à ce seul client (envoi reçu ou achat payé).
3. **Montant et horaire** : c''est la seule vente de ce montant ouverte dans les 2 heures avant l''arrivée, et l''envoi vient de l''adresse déclarée (si le client en a déclaré une).

Jamais automatique, toujours « À vérifier » : une vente créée **après** l''arrivée des USDT (sinon n''importe qui pourrait réclamer un dépôt visible sur la blockchain), un envoi qui ne vient pas de l''adresse déclarée, une adresse connue d''un autre client, plusieurs ventes du même montant, ou une adresse d''envoi sanctionnée. La fiche de la commande montre toute la chaîne : adresse déclarée, identifiant donné, adresse d''envoi réelle et méthode de rattachement. La fiche du client liste ses portefeuilles connus.

Une vente jamais confirmée par le client (« J''ai envoyé mes USDT ») et sans dépôt expire après 48 heures. Tant qu''il n''a rien envoyé, le client peut aussi l''annuler.')
 where title = 'Règlement automatique';
