# Audit de scalabilité du back-office

Question posée : que se passe-t-il avec 1 000 nuits de sauvegarde, 10 000, 30 000 ou 50 000 clients ?

## Le problème principal trouvé

Supabase renvoie **au plus 1 000 lignes par requête**. Plusieurs écrans chargeaient « tout » en une seule requête.
Au-delà de 1 000 lignes, la liste était **tronquée sans aucun message** et les totaux devenaient faux.

## Corrigé (octobre 2026)

| Écran ou donnée | Avant | Maintenant |
|---|---|---|
| Commandes, file d'attente | 1 seule requête, tronquée à 1 000 | Chargement par tranches de 1 000 jusqu'au bout |
| Vérifications d'identité et d'entreprise | Idem | Idem, par tranches |
| Clients (admin_clients) | Idem | Idem, par tranches |
| Annuaire des campagnes, recherche, messagerie | Limité à 2 000 clients | Tous les clients |
| Origine des inscriptions | Limité à 5 000 | Toutes |
| Tableau de bord : nombre de commandes par état | Comptait les 1 000 premières | Comptage exact par la base, sans rien télécharger |
| Tableau de bord : volumes, marge, volume par jour | Téléchargeait les commandes de la période, tronquées à 1 000 | Calculés par la base (`admin_order_totals`, `admin_order_daily`) : rien n'est téléchargé |
| Tableau de bord : entonnoir clients | Idem | Calculé par la base (`admin_customer_funnel`) |
| Tableau de bord : alertes de conformité | Tronquées à 1 000 | Par tranches, exactes |
| Index de la base | Manquants sur les colonnes filtrées | Ajoutés : commandes (état + date, date), profils (date, état d'identité), vérifications (client, état), reçus Interac et envois USDT (commande) |
| Registre de conformité par client | N'existait pas | Fonction `compliance_register_client`, PDF depuis la fiche client |
| Tous les tableaux (DataTable) | 50 lignes puis bouton | 50 lignes, la suite se charge seule en descendant |
| Explorateur de sauvegarde | 100 lignes puis bouton | Toutes les lignes au fil du défilement |
| Page Plateforme › Sauvegardes | Liste de toutes les nuits | La dernière sauvegarde, une frise des 30 dernières nuits et la règle de conservation |

L'affichage ne crée jamais des dizaines de milliers d'éléments à la fois : 50 lignes, puis 50 de plus au défilement.

Migrations appliquées : `20261013010000_compliance_register_client.sql` et
`20261013020000_scalability_indexes_kpi.sql`. Les fonctions sont réservées à l'équipe (`is_staff`).

## À prévoir quand la base grandira

Ordre de grandeur où chaque point devient utile :

1. **Vers 20 000 commandes ou clients** : pagination et recherche **côté base** (fonctions SQL
   `admin_orders_page`, `admin_clients_page` avec filtre, tri, recherche, `limit` et `offset`),
   au lieu de charger toute la liste dans le navigateur.
2. **Sauvegardes** :
   - les fichiers KYC sont téléchargés un par un (environ 30 000 fichiers pour 10 000 clients) :
     passer en téléchargement parallèle, ou en copie incrémentale vers Cloudflare R2, avant de dépasser
     la limite de 30 minutes du travail GitHub ;
   - une release GitHub accepte au plus 2 Go par fichier : au-delà, R2 devient le stockage principal.
3. **Campagnes** : le forfait Resend actuel envoie 100 courriels par jour. Une campagne à 10 000 clients
   demande un forfait supérieur et un envoi en file d'attente côté serveur.

Aucune de ces étapes n'est urgente avec la base actuelle ; elles sont listées pour être faites avant
d'atteindre ces volumes.
