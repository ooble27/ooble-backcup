-- Base de connaissances : le guide de la conformité CANAFE, en clair (sert aussi de formation de l'équipe).
insert into public.kb_articles (slug, section, category, title, summary, body, position, audience)
values ('guide-conformite', 'kb', 'Conformité', 'Le guide de la conformité CANAFE',
'Ce que la loi demande à Ooble, ce qu''Ooble surveille tout seul, et quoi faire devant chaque alerte.',
$md$Ooble est une **entreprise de services monétaires** (ESM) inscrite auprès du CANAFE : elle échange des dollars canadiens contre de la monnaie virtuelle (USDT). La loi (LRPCFAT et son règlement) lui impose quatre familles d'obligations. Ce guide les explique simplement. En cas de doute, la référence reste le site du CANAFE et le responsable de la conformité.

## 1. Déclarer certaines opérations

| Déclaration | Quand | Délai |
| --- | --- | --- |
| **DOIMV** : opération importante en monnaie virtuelle | Ooble **reçoit** 10 000 $ CA ou plus en monnaie virtuelle, en une fois ou en plusieurs fois en 24 heures (même client ou même bénéficiaire). Chez Ooble : un client qui **vend** ses USDT. | 5 jours ouvrables après la réception |
| **DOT** : opération douteuse | Il existe des **motifs raisonnables de soupçonner** un lien avec du blanchiment ou du financement du terrorisme. Aucun montant minimum. Vaut aussi pour une opération tentée ou refusée. | Dès que possible |
| **DBT** : biens d'un groupe terroriste ou d'une personne inscrite | Ooble détient ou contrôle des biens d'une personne ou d'un groupe inscrit (terroriste ou sanctionné). | Immédiatement, et prévenir aussi la GRC et le SCRS |

Un achat (le client paie en Interac, Ooble envoie des USDT) ne donne pas lieu à une DOIMV : Ooble ne reçoit pas de monnaie virtuelle.

**Règle d'or : ne jamais prévenir un client qu'une DOT est envisagée ou faite.** C'est une infraction.

## 2. Comment se fait une déclaration

1. **Une fois pour toutes** : le responsable de la conformité inscrit Ooble au portail de déclaration du CANAFE (FWR, « FINTRAC Web Reporting »). L'inscription donne un numéro de déclarant à 7 chiffres et un compte administrateur, qui peut ensuite créer des comptes pour l'équipe. La marche à suivre est sur le site du CANAFE, page « Utiliser le système de déclaration en ligne ».
2. Dans Ooble, l'alerte → **Déclarer** : la déclaration est préparée avec ce qu'Ooble connaît déjà (client, montants, réseau, portefeuille).
3. Dans la déclaration, la partie **Pour le portail du CANAFE** liste chaque information dans l'ordre du portail, avec un bouton **Copier**. Ce qui manque apparaît en corail : complétez-le avant de soumettre.
4. Sur le portail : nouvelle déclaration, coller les champs, soumettre.
5. Le portail donne un **numéro de confirmation** : le saisir dans la déclaration Ooble, qui passe à « Soumise ».
6. Tout est gardé **5 ans**. Rien ne peut être supprimé.

Plus tard, une fois les accès obtenus, Ooble pourra envoyer les déclarations directement au CANAFE (interface de programmation du CANAFE).

## 3. Ce qu'Ooble surveille tout seul (toutes les 10 minutes)

| Contrôle | Alerte | Ce qu'elle signifie |
| --- | --- | --- |
| Vente de 10 000 $ ou plus | DOIMV | À déclarer dans les 5 jours ouvrables |
| Ventes du même client totalisant 10 000 $ en 24 h | DOIMV (24 h) | À déclarer en une seule DOIMV |
| Opération entre 9 000 et 9 999 $ | Soupçon | Évitement du seuil ? |
| 3 opérations ou plus en 24 h pour 8 000 $ ou plus | Soupçon | Fractionnement ? |
| Virement Interac d'un autre nom que le client | Soupçon | Paiement d'un tiers ? |
| Compte ouvert il y a moins de 7 jours, opération de 3 000 $ ou plus | Soupçon | Origine des fonds et but de l'opération à comprendre |
| Opération 5 fois plus grosse que la moyenne du client | Soupçon | Changement de situation ? |
| Nom du client sur une liste de sanctions (Canada, ONU) | Sanctions | Homonyme ou personne visée ? |
| Adresse de portefeuille sur la liste des adresses sanctionnées | Sanctions | Ne rien envoyer, déclarer |

Les listes de sanctions sont téléchargées **chaque jour** depuis les sources officielles : la Liste consolidée des sanctions autonomes du Canada, la liste du Conseil de sécurité de l'ONU, et les adresses de monnaie virtuelle sanctionnées publiées par l'OFAC. Chaque nouveau client est comparé dans les 10 minutes qui suivent son inscription. La date de la dernière lecture est affichée dans Conformité › À faire.

## 4. Quoi faire devant une alerte

Chaque alerte affiche sa propre marche à suivre (section « Que faire »). En résumé :

- **DOIMV** : vérifier le dossier du client (nom, date de naissance, adresse, profession, pièce), préparer la DOIMV, la soumettre avant l'échéance.
- **Soupçon** : regarder le client et ses commandes. S'il y a des motifs raisonnables de soupçonner : DOT dès que possible. Sinon : classer sans suite **en écrivant pourquoi**. Ce motif sera lu lors d'un examen.
- **Sanctions** : comparer avec la pièce d'identité (date de naissance, pays). En attendant : ne rien envoyer, ne rien dire. Si c'est la même personne : bloquer, DBT immédiate, GRC et SCRS. Si c'est un homonyme : classer en notant ce qui les distingue.

Une alerte se **prend en charge** : les collègues voient qui la suit. Les échéances sont regroupées dans **Conformité › À faire**, de la plus urgente à la plus lointaine.

## 5. Garder les registres (5 ans)

- Chaque opération : client, montants, taux, réseau, adresses, références Interac et blockchain.
- **Règle du voyage** : pour tout transfert de monnaie virtuelle de 1 000 $ ou plus, le nom, l'adresse et le numéro de compte ou de portefeuille de l'émetteur et du bénéficiaire.
- Les vérifications d'identité, les alertes et leurs classements, les déclarations.

Tout s'exporte dans **Conformité › Registre** (PDF ou CSV), par exemple pour un examen du CANAFE.

## 6. Connaître ses clients dans la durée

- **Identité** vérifiée avant toute opération.
- **Personne politiquement vulnérable** (PPV) : savoir si le client en est une ; si oui, origine des fonds, approbation de la direction et surveillance renforcée.
- **Sanctions** : comparaison automatique et continue (voir plus haut).
- **Relation d'affaires** : un client qui revient devient une relation d'affaires. Il faut connaître le but de ses opérations et revoir son dossier régulièrement, d'autant plus souvent que son risque est élevé.

## 7. Le programme de conformité

Le programme est suivi dans **Conformité › Programme** :

- un responsable de la conformité nommé, avec un mandat écrit ;
- des politiques et procédures écrites ;
- une évaluation des risques, mise à jour au moins chaque année ;
- la formation de l'équipe (ce guide en fait partie), avec un registre ;
- un **examen indépendant tous les 2 ans** ;
- le **renouvellement de l'inscription d'ESM tous les 2 ans**, et la déclaration au CANAFE de tout changement (adresse, dirigeants, activités) dans les 30 jours.

Les échéances du programme apparaissent dans **À faire** quatre mois avant la date.
$md$, 120, 'staff')
on conflict (slug) do nothing;
