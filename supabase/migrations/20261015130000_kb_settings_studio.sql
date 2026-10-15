-- Base de connaissances : les Réglages (ce que l'équipe change sans code), le Studio des courriels,
-- la limite quotidienne d'un client, et la page technique « Configuration » remise à jour.

insert into public.kb_articles (slug, section, category, title, summary, body, position, audience) values
('reglages', 'kb', 'Équipe et outils', 'Les Réglages : ce que vous changez vous-même',
 'Ouverture, limites, délais, taux, réseaux, inscriptions, coordonnées, alertes : effet immédiat, appliqué par la base.',
$kb$Ouvrez **Réglages** (administrateurs). La liste est rangée par thème ; chaque ligne dit déjà l'état du réglage. La recherche en haut trouve un réglage par son nom. Dans une page, **Précédent** et **Suivant** passent au réglage voisin du même thème.

Chaque changement prend effet tout de suite, sans publication, et il est noté au journal d'audit. La base le fait respecter : même une app modifiée ne peut pas le contourner.

| Thème | Réglage | Ce qu'il fait |
| --- | --- | --- |
| Commandes | Ouverture | Ouvre ou ferme les achats et ventes, la vérification d'identité, le bureau OTC |
| Commandes | Limites | Minimum par commande et maximum sur 24 heures (9 999 $ au plus) |
| Commandes | Délais | Durée du taux garanti (5 à 60 min) ; délai avant qu'une vente non envoyée expire (6 à 168 h) |
| Prix | Taux et marge | Pourcentage ajouté au cours à l'achat, retiré à la vente ; le taux se recalcule aussitôt |
| Prix | Taux de secours | Fige le cours à la main quand la source ne répond plus ; revenir au cours automatique dès qu'elle répond |
| Réseaux et USDT | Réseaux | Ouvre ou ferme chaque réseau, séparément à l'achat et à la vente ; un réseau fermé refuse toute nouvelle commande |
| Réseaux et USDT | Adresses de dépôt | Où les clients envoient leurs USDT, par famille de réseaux ; changement confirmé par les 6 derniers caractères |
| Clients | Inscriptions | Ouvre ou ferme les nouveaux comptes, particuliers et entreprises séparément |
| Clients | Coordonnées | Adresses support, Interac et OTC affichées aux clients |
| Équipe | Alertes de l'équipe | Qui reçoit un courriel à chaque nouvelle commande et à chaque message du site (10 adresses au plus) |
| Plateforme | Santé, Envois de courriels, Sauvegardes, Tests, Démarrage | L'état des tâches automatiques, le forfait d'envoi, la sauvegarde de la nuit, un dossier de test, le lancement |

**Avant de fermer un réseau à la vente**, vérifiez qu'aucune vente n'attend des USDT dessus : les commandes en cours se terminent, mais aucune nouvelle ne s'ouvre.

**Avant de changer l'adresse Interac**, la nouvelle boîte doit déjà être en dépôt automatique et lue par Ooble ; sinon les paiements ne sont plus reconnus.

Le Studio des courriels a sa propre entrée, en haut des Réglages.$kb$, 240, 'staff'),

('studio-courriels', 'kb', 'Communication', 'Choisir le style et les textes des courriels automatiques',
 'Studio des courriels : trois styles (Sobre, Reçu, Phrase), textes modifiables, aperçu exact.',
$kb$Les dix courriels qu'Ooble envoie tout seul (bienvenue, ordres d'achat et de vente, paiement reçu, USDT reçus, transaction terminée, décisions de vérification) se règlent dans **Réglages → Studio des courriels** (administrateurs).

## Choisir le style

| Style | Allure |
| --- | --- |
| Sobre | Noir et blanc, un récapitulatif en lignes. Style par défaut |
| Reçu | Le montant en très grand, le détail en lignes fines, comme un reçu |
| Phrase | Une grande phrase aux mots clés en noir, comme le back-office |

1. Touchez un style pour l'ouvrir en grand.
2. Regardez-le sur plusieurs courriels (**Voir sur**) et à l'écran d'un téléphone (**Écran**). Les flèches passent au style suivant.
3. **Utiliser pour tous les courriels** l'applique à tous les envois suivants.

## Modifier un courriel

1. Dans **Les courriels**, ouvrez celui à changer.
2. Gardez le style commun ou donnez-lui le sien.
3. Changez l'objet, le titre, le message ou le bouton. **Glisser un mot** insère `{prénom}`, `{référence}`, `{montant CAD}`… à l'endroit du curseur ; ils sont remplacés par les vraies valeurs à l'envoi.
4. Vérifiez l'aperçu (client fictif), puis **Enregistrer**.

**Texte d'origine** remet un champ comme avant ; **Tout remettre comme à l'origine** remet le courriel entier.

## Ce qui ne change pas

- Le pied de page légal (Québec · Canada, liens Aide, Confidentialité, Conditions).
- Le moment où chaque courriel part.
- Un mot que le courriel ne connaît pas est signalé en jaune et part tel quel ; une variable vide ne s'affiche jamais « {{…}} » chez le client.
- Si les réglages du studio ne peuvent pas être lus, le courriel part avec son texte d'origine.$kb$, 195, 'staff'),

('limite-client', 'kb', 'Clients et vérifications', 'Limiter ou bloquer un client',
 'La limite quotidienne d''un client se change dans sa fiche : Bloquer, 1 000 $, 2 500 $, 5 000 $ ou Normale.',
$kb$Dans la fiche d'un client, **Limite quotidienne** (administrateurs et conformité) règle combien il peut échanger sur 24 heures glissantes.

| Choix | Effet |
| --- | --- |
| Bloquer | Plus aucune nouvelle commande ; le compte reste ouvert |
| 1 000 $, 2 500 $, 5 000 $ | Plafond réduit, par exemple pendant une vérification renforcée |
| Normale | Le maximum général des Réglages (Limites) |

La base applique la limite à chaque commande. Le changement est noté au journal d'audit ; notez la raison dans **Notes internes**.

Pour empêcher toute connexion, utilisez plutôt **Accès au compte → Suspendre** : le client voit alors « Ce compte est suspendu » à la connexion.$kb$, 105, 'staff');

update public.kb_articles set updated_at = now(), body =
$kb$Les réglages d'Ooble vivent presque tous en base, changés dans le back-office avec effet immédiat. Le code (`src/lib/config.ts`) ne garde que des valeurs de repli.

## En base

| Réglage | Table | Modifié dans |
| --- | --- | --- |
| Ouverture (achats et ventes, vérification, OTC), minimum et maximum sur 24 heures | `app_settings` | Réglages → Ouverture, Limites |
| Marges d'achat et de vente, cours figé à la main (`manual_market_rate`) | `app_settings` | Réglages → Taux et marge, Taux de secours |
| Réseaux ouverts, par sens (`networks`, jsonb) | `app_settings` | Réglages → Réseaux |
| Inscriptions particuliers et entreprises | `app_settings` | Réglages → Inscriptions |
| Taux garanti (5 à 60 min), expiration d'une vente non envoyée (6 à 168 h) | `app_settings` | Réglages → Délais |
| Adresses support, Interac, OTC | `app_settings` | Réglages → Coordonnées |
| Destinataires des alertes de l'équipe | `app_private_settings` (administrateurs seulement) | Réglages → Alertes de l'équipe |
| Adresses de dépôt des ventes | `deposit_addresses` (fonction `set_deposit_address`) | Réglages → Adresses de dépôt |
| Style et textes des courriels automatiques | `mail_designs` (administrateurs) | Réglages → Studio des courriels |
| Limite quotidienne d'un client | `profiles` (fonction `set_client_daily_limit`) | Fiche client |
| Envoi automatique et plafonds | `settlement_settings` | Règlement auto |
| Seuils de solde bas | `treasury_alert_config` | Base |
| Bannière, maintenance | `announcements`, `maintenance_windows` | Bannière et maintenance |
| Lancement | `platform_state` | Réglages → Démarrage |
| Programme de conformité | `compliance_checklist` | Conformité |

## Ce que la base fait respecter

| Règle | Mécanisme |
| --- | --- |
| Réseau fermé | `reject_retired_network` refuse la commande (NETWORK_CLOSED) |
| Inscriptions fermées | déclencheur `guard_signups_open` sur `auth.users` (SIGNUPS_CLOSED) |
| Durée du taux garanti | `enforce_order_insert` lit `rate_lock_minutes` |
| Expiration des ventes non envoyées | `match_sell_deposits` lit `sell_expiry_hours` |
| Virement d'une vente | toujours au courriel du compte (déclencheur `orders_note_wallets`) |

## Studio des courriels : note technique

Le moteur des courriels est `supabase/functions/_shared/mailStudio.ts`, partagé par la fonction `send-email` et l'aperçu du back-office. La colonne `mail_designs.style` date de la première version : le style Phrase y est enregistré sous la valeur `lettre` (traduction dans `styleToDb` / `styleFromDb`).

## Dans le code (src/lib/config.ts)

| Valeur | Rôle |
| --- | --- |
| `OOBLE_INTERAC_EMAIL`, `OOBLE_SUPPORT_EMAIL`, `OOBLE_OTC_EMAIL` | Repli si les Coordonnées ne sont pas lues |
| `STAFF_TEST_MIN_CAD` (2 $) | Minimum des commandes de test de l'équipe |

## Constantes métier

| Constante | Valeur | Où |
| --- | --- | --- |
| Rafraîchissement du taux | Toutes les 10 minutes, et aussitôt après un changement de marge | pg_cron, fonction `refresh-rate` |
| Recherche d'un achat par un avis Interac | 7 derniers jours | Fonction `interac-ingest` |
| Tolérance sur le montant Interac | Moins d'un cent | Fonction `interac-ingest` |
| Fraîcheur d'un avis transmis | 10 minutes | Fonction `interac-ingest` |
| Lecture des dépôts | Toutes les 2 minutes | pg_cron `sell-watch` |
| Analyse de conformité | Toutes les 10 minutes | pg_cron `compliance-scan` |
| Seuil DOIMV | 10 000 $ | Fonction `compliance_scan()` |
| Fractionnement | 3 opérations et 8 000 $ en 24 heures | Fonction `compliance_scan()` |
| Juste sous le seuil | 9 000 $ à 9 999,99 $ | Fonction `compliance_scan()` |$kb$
 where slug = 'tech-configuration';
