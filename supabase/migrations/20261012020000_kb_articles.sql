-- Ressources du back-office : base de connaissances (équipe), manuel (équipe)
-- et documentation technique (administrateurs).
--
-- Le contenu vit en base, derrière RLS, et non dans le code du site : le code
-- JavaScript est public, ces pages ne le sont pas. Lecture : membres de
-- l'équipe (is_staff), les articles « admin » aux seuls administrateurs.
-- Écriture : administrateurs. Aucune suppression : un article retiré est
-- archivé (archived = true).
--
-- Idempotente ; appliquée en production le 2026-10-12.

create table if not exists public.kb_articles (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  section     text not null check (section in ('kb', 'manual', 'tech')),
  category    text not null default '',
  title       text not null,
  summary     text not null default '',
  body        text not null default '',
  position    integer not null default 0,
  audience    text not null default 'staff' check (audience in ('staff', 'admin')),
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id)
);

create index if not exists idx_kb_articles_section on public.kb_articles(section, position);

alter table public.kb_articles enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'kb_articles' and policyname = 'Equipe lit les ressources') then
    create policy "Equipe lit les ressources" on public.kb_articles for select to authenticated
      using (public.is_staff(auth.uid()) and (audience = 'staff' or public.has_role(auth.uid(), 'admin')));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'kb_articles' and policyname = 'Admin ajoute des ressources') then
    create policy "Admin ajoute des ressources" on public.kb_articles for insert to authenticated
      with check (public.has_role(auth.uid(), 'admin'));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'kb_articles' and policyname = 'Admin modifie les ressources') then
    create policy "Admin modifie les ressources" on public.kb_articles for update to authenticated
      using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
  end if;
end $$;

insert into public.kb_articles (slug, section, category, title, summary, body, position, audience) values
  ($md$traiter-un-achat$md$, $md$kb$md$, $md$Commandes$md$, $md$Traiter un achat payé$md$, $md$Le client a payé par Interac : vérifier, envoyer les USDT, laisser la commande se terminer seule.$md$, $md$Un achat passe à **À traiter** dès que son virement Interac est lu et rapproché. Le plus souvent, les USDT partent seuls : vous n'avez rien à faire.

## Quand l'envoi est automatique

- Le montant est sous le plafond par commande réglé dans **Règlement auto**.
- Le portefeuille chaud du réseau a assez d'USDT et de frais de réseau.
- La commande affiche alors « Envoyé automatiquement » dans le bloc **Envoi des USDT**, puis se termine seule à la confirmation.

## Quand il faut agir

1. Ouvrez **File d'attente** et choisissez la commande.
2. Cliquez **Prendre en charge** : la commande est verrouillée pour le reste de l'équipe.
3. Comparez le montant reçu, le nom de l'expéditeur Interac et le nom du client.
4. Dans le bloc **Envoi des USDT**, lancez l'envoi. Le bloc indique « Envoi en cours… », puis « Transaction diffusée, confirmation en cours ».
5. La commande passe seule à **Terminée** quand la blockchain confirme, et le client reçoit son courriel.

> Ne relancez jamais un envoi qui affiche une erreur sans avoir vérifié la transaction sur l'explorateur du réseau. Voir la fiche « Un envoi d'USDT est à vérifier ».

## Réseau sans envoi automatique

Pour Solana, envoyez les USDT depuis le portefeuille de l'entreprise, puis cliquez **Marquer terminé (envoi à la main)**.$md$, 10, $md$staff$md$),
  ($md$verser-une-vente$md$, $md$kb$md$, $md$Commandes$md$, $md$Verser une vente$md$, $md$Les USDT du client sont arrivés : envoyer le virement Interac et terminer la commande.$md$, $md$Une vente passe à **À traiter** dès que les USDT du client arrivent sur l'adresse de dépôt. La lecture est automatique toutes les 2 minutes.

1. Ouvrez la vente depuis **File d'attente**, puis **Prendre en charge**.
2. Vérifiez le bloc **USDT du client** : statut « Rapproché », montant reçu, lien « Voir la transaction ».
3. Le bloc **Virement Interac à envoyer** donne tout à copier : destinataire, montant, question de sécurité, réponse et message (la référence de la commande).
4. Envoyez le virement depuis le compte bancaire d'Ooble.
5. Cliquez **Virement Interac envoyé** : la commande est terminée et le client reçoit son courriel de fin.

## Vente sur Solana

Solana n'est pas surveillé automatiquement. Vérifiez l'arrivée des USDT dans le portefeuille de dépôt, puis cliquez **Marquer les USDT reçus** avant de verser.

## Dépôt arrivé sans vente

Un dépôt qui ne correspond à aucune vente apparaît dans **Règlement auto → Dépôts des ventes** avec le statut « Sans commande ». Choisissez la vente dans **Rattacher à une vente**, ou **Écarter** le dépôt avec un motif.$md$, 20, $md$staff$md$),
  ($md$prendre-en-charge$md$, $md$kb$md$, $md$Commandes$md$, $md$Prendre en charge et libérer une commande$md$, $md$Un seul membre de l'équipe traite une commande à la fois.$md$, $md$**Prendre en charge** verrouille la commande à votre nom : les autres voient « Cette commande est traitée par… » et ne peuvent pas agir.

- Cliquez **Libérer** si vous devez laisser la commande à quelqu'un d'autre.
- Une commande terminée ou remboursée n'a plus besoin d'être libérée.
- Dans la **File d'attente**, le bouton **Prendre** fait la même chose sans ouvrir la commande.$md$, 30, $md$staff$md$),
  ($md$annuler-rembourser$md$, $md$kb$md$, $md$Commandes$md$, $md$Annuler, rouvrir ou rembourser une commande$md$, $md$Annuler tant que rien n'est payé ; rembourser dès que l'argent est arrivé.$md$, $md$| Situation | Action | Effet |
| --- | --- | --- |
| Le client n'a pas encore payé | **Annuler** | La commande passe à Annulée |
| Commande annulée par erreur | **Rouvrir** | Elle revient En attente |
| L'argent est arrivé mais la commande ne peut pas être réglée | **Rembourser** puis **Confirmer le remboursement** | Le client reçoit un courriel ; la commande passe à Remboursée |

- Dès qu'un envoi d'USDT est parti, la commande est figée : plus aucune action n'est possible.
- Une commande payée ne peut jamais être supprimée : elle fait partie du registre conservé 5 ans.
- Le remboursement lui-même (virement Interac ou renvoi des USDT) se fait depuis les comptes d'Ooble, avant de confirmer dans le back-office.$md$, 40, $md$staff$md$),
  ($md$envoi-a-verifier$md$, $md$kb$md$, $md$Commandes$md$, $md$Un envoi d'USDT est à vérifier$md$, $md$Une issue incertaine bloque l'envoi : on vérifie sur la blockchain avant toute autre action.$md$, $md$Quand le réseau ne répond pas clairement, l'envoi passe en vérification au lieu d'être relancé. C'est voulu : un deuxième envoi pourrait payer le client deux fois.

1. Ouvrez **Règlement auto → Envois USDT** et repérez l'envoi signalé.
2. Copiez le hash de la transaction et cherchez-le sur l'explorateur du réseau (Tronscan, BscScan, PolygonScan).
3. Si la transaction est confirmée : la commande se terminera seule à la prochaine vérification (toutes les 2 minutes).
4. Si aucune transaction n'existe : prévenez un administrateur, qui décidera de relancer l'envoi.

> Ne relancez jamais un envoi tant que vous n'avez pas la preuve qu'aucune transaction n'est partie.$md$, 50, $md$staff$md$),
  ($md$interac-sans-commande$md$, $md$kb$md$, $md$Commandes$md$, $md$Un virement Interac ne correspond à aucune commande$md$, $md$Retrouver le client, puis rattacher ou rembourser.$md$, $md$Les avis Interac sont lus automatiquement. Ceux qui ne trouvent pas leur commande apparaissent dans **Règlement auto → Avis Interac** avec le statut « Sans commande » ou « À vérifier ».

1. Ouvrez l'avis : montant, nom de l'expéditeur, message et texte complet de l'avis.
2. Cherchez le client avec la recherche (⌘K) : nom, courriel ou montant.
3. Si une commande existe avec un montant différent, contactez le client avant toute action.
4. Si aucune commande n'existe, remboursez le virement et écrivez au client pour lui expliquer comment passer commande.

Causes fréquentes : référence oubliée dans le message, montant arrondi, virement envoyé depuis le compte d'une autre personne. Un paiement d'un tiers est aussi un signal de conformité : voir « Traiter une alerte de conformité ».$md$, 60, $md$staff$md$),
  ($md$examiner-verification$md$, $md$kb$md$, $md$Clients et vérifications$md$, $md$Examiner une vérification d'identité$md$, $md$Quatre contrôles, puis approuver ou refuser avec un motif clair.$md$, $md$Ouvrez **Vérifications → À vérifier**, puis un dossier. Cochez chaque contrôle après l'avoir fait :

- [ ] Le visage du selfie correspond à la photo de la pièce.
- [ ] Le nom correspond à celui du compte.
- [ ] La pièce n'est pas expirée.
- [ ] Les photos sont nettes et complètes.

**Approuver** n'est proposé directement que si les quatre contrôles sont cochés ; sinon le bouton devient « Approuver quand même », à utiliser seulement avec une bonne raison.

Pour **Refuser**, choisissez un motif prêt à l'emploi ou écrivez le vôtre dans **Motif pour le client** : le client le reçoit par courriel. Écrivez ce qu'il doit faire, par exemple « Reprenez la photo de votre pièce en pleine lumière ».

Les boutons **Précédent** et **Suivant** passent d'un dossier à l'autre sans revenir à la liste.$md$, 70, $md$staff$md$),
  ($md$verifier-entreprise$md$, $md$kb$md$, $md$Clients et vérifications$md$, $md$Vérifier une entreprise$md$, $md$Contrôler les documents de l'entreprise et la personne qui la représente.$md$, $md$Dans **Vérifications**, choisissez **Entreprises**. Un dossier d'entreprise contient les documents d'immatriculation et l'identité de la personne qui ouvre le compte.

1. Vérifiez que le nom légal et le numéro d'entreprise correspondent aux documents.
2. Vérifiez que la personne qui ouvre le compte a le droit d'agir pour l'entreprise.
3. **Approuver**, ou **Refuser** avec une **Note au client** qui dit quoi corriger.

**Réinitialiser** remet le dossier à zéro quand le client doit tout reprendre.$md$, 80, $md$staff$md$),
  ($md$recherche-universelle$md$, $md$kb$md$, $md$Clients et vérifications$md$, $md$Retrouver un client ou une commande$md$, $md$La recherche universelle trouve une page, une commande ou un client en quelques lettres.$md$, $md$- Sur ordinateur : **⌘K** (Mac) ou **Ctrl K** (Windows), ou le champ **Rechercher** en haut.
- Sur téléphone : la loupe en haut à droite.

Tapez une référence (`OOB-…`), un nom, un courriel ou un montant. **Entrée** ouvre le premier résultat ; les flèches passent d'un résultat à l'autre.$md$, 90, $md$staff$md$),
  ($md$fermeture-de-compte$md$, $md$kb$md$, $md$Clients et vérifications$md$, $md$Un client veut fermer son compte$md$, $md$Le client ferme son compte lui-même ; son dossier reste conservé 5 ans.$md$, $md$Le client ferme son compte depuis l'app : **Compte → Supprimer mon compte**. Il ne peut plus se connecter ni passer commande.

- Ooble ne supprime jamais un dossier : profil, commandes, vérifications et documents sont conservés au moins 5 ans, comme l'exige le CANAFE.
- Si un client demande la fermeture par courriel, indiquez-lui ce chemin. S'il ne peut pas se connecter, transmettez la demande à un administrateur.
- Ne supprimez jamais vous-même un compte, une vérification, un document ou une adresse enregistrée.$md$, 100, $md$staff$md$),
  ($md$approvisionner-portefeuille$md$, $md$kb$md$, $md$Règlement$md$, $md$Approvisionner un portefeuille chaud$md$, $md$Ajouter des USDT et des frais de réseau pour que les envois automatiques continuent.$md$, $md$Ouvrez **Règlement auto → Portefeuille et réglages**. Chaque réseau montre son solde d'USDT et son solde de frais.

| Réseau | Frais payés en | Signal |
| --- | --- | --- |
| Tron | TRX | Solde de frais sous le minimum affiché |
| BNB Chain | BNB | idem |
| Polygon | POL | idem |

1. Copiez l'adresse du réseau avec **Copier l'adresse**.
2. Envoyez les USDT et les frais depuis le portefeuille de trésorerie de l'entreprise.
3. Vérifiez l'arrivée dans le panneau (bouton **Recharger** si besoin).

> Envoyez toujours sur le bon réseau : des USDT envoyés sur un autre réseau que celui de l'adresse sont perdus.

Tant qu'un portefeuille est à court, les achats attendent dans la file et sont repris automatiquement chaque minute.$md$, 110, $md$staff$md$),
  ($md$regler-envoi-auto$md$, $md$kb$md$, $md$Règlement$md$, $md$Régler l'envoi automatique$md$, $md$Activer, suspendre et plafonner les envois d'USDT sans clic de l'équipe.$md$, $md$Dans **Règlement auto → Portefeuille et réglages** (administrateurs) :

- **Envoyer les USDT sans clic de l'équipe** : interrupteur général de l'envoi automatique.
- **Par commande** : au-delà de ce montant en CAD, l'équipe envoie à la main.
- **Sur 24 heures** : total d'USDT que le portefeuille chaud peut envoyer en 24 heures.

Suspendez l'envoi automatique au moindre doute (comportement inattendu, alerte de sécurité) : les achats attendent alors dans la File d'attente.$md$, 120, $md$staff$md$),
  ($md$traiter-alerte$md$, $md$kb$md$, $md$Conformité$md$, $md$Traiter une alerte de conformité$md$, $md$Examiner, décider, et garder la trace de la décision.$md$, $md$Les alertes sont créées toutes les 10 minutes par l'analyse automatique, ou par l'équipe avec **Signaler un client**. **Analyser maintenant** relance l'analyse sans attendre.

1. Ouvrez **Conformité → Alertes** et cliquez **Prendre en charge**.
2. Lisez la fiche du client et l'historique de ses commandes.
3. Décidez :
    - **Classer sans suite**, avec une note qui explique pourquoi, puis **Confirmer le classement** ;
    - ou **Déclarer** : voir « Préparer et soumettre une déclaration ».

> Ne prévenez jamais le client qu'une alerte ou une déclaration le concerne. C'est interdit par la loi.$md$, 130, $md$staff$md$),
  ($md$declaration-canafe$md$, $md$kb$md$, $md$Conformité$md$, $md$Préparer et soumettre une déclaration$md$, $md$Préparer dans le back-office, soumettre sur le portail du CANAFE, enregistrer la référence.$md$, $md$| Déclaration | Délai |
| --- | --- |
| DOIMV (10 000 $ ou plus reçus en monnaie virtuelle, en une fois ou en 24 heures) | 5 jours ouvrables |
| DOT (opération douteuse) | Dès que possible |
| DBT (biens d'un groupe terroriste) | Immédiatement |

1. Depuis l'alerte, cliquez **Déclarer**, ou ouvrez l'onglet **Déclarations**.
2. Remplissez le formulaire : commande, montants, réseau, adresse du portefeuille, occupation, observations. **Enregistrer le brouillon** garde votre travail ; **Reprendre le brouillon** le rouvre.
3. Soumettez la déclaration sur le portail du CANAFE, puis cliquez **Marquer soumise au CANAFE**.
4. Saisissez la **Référence CANAFE** reçue et cliquez **Enregistrer la référence**.
5. À la réponse du CANAFE : **Acceptée par le CANAFE** ou **Rejetée** (corriger et soumettre de nouveau).$md$, 140, $md$staff$md$),
  ($md$exporter-registre$md$, $md$kb$md$, $md$Conformité$md$, $md$Exporter le registre$md$, $md$Le registre des opérations s'exporte en PDF ou en CSV, pour une période donnée.$md$, $md$Ouvrez **Conformité → Registre**. Pour chaque partie du registre (opérations, identités, avis Interac, envois d'USDT, déclarations), choisissez la période puis **PDF** (lisible, à imprimer) ou **CSV** (pour un tableur).

Le CANAFE peut demander ces documents à tout moment : ils sont conservés au moins 5 ans.$md$, 150, $md$staff$md$),
  ($md$repondre-message-site$md$, $md$kb$md$, $md$Communication$md$, $md$Répondre à un message du site$md$, $md$Les messages des pages Contact et OTC arrivent dans la Messagerie.$md$, $md$1. Ouvrez **Messagerie → Réception**. Un point indique un message non lu ; le filtre **OTC** montre les demandes du desk.
2. Ouvrez la conversation et cliquez **Répondre**.
3. Partez d'un modèle si besoin (**Modèles**), relisez, envoyez.

- Votre réponse part de bonjour@ooble.ca et s'ajoute à la conversation.
- Si le client répond, sa réponse arrive dans la boîte courriel habituelle de l'équipe (support@ooble.ca ou otc@ooble.ca), pas dans le back-office.
- **Archiver** range une conversation terminée.$md$, 160, $md$staff$md$),
  ($md$ecrire-a-un-client$md$, $md$kb$md$, $md$Communication$md$, $md$Écrire à un client$md$, $md$Un courriel personnel, depuis la Messagerie, dans la langue du client.$md$, $md$1. **Messagerie → Nouveau message**.
2. Choisissez un ou plusieurs clients, puis l'objet et le texte. Les variables comme le prénom sont remplacées pour chaque client.
3. Relisez l'aperçu et envoyez.

Le courriel apparaît dans **Envoyés**, visible de tous les appareils de l'équipe.

> Une limite de 100 courriels par jour s'applique à tout Ooble. Pour écrire à beaucoup de clients, utilisez **Campagnes**.$md$, 170, $md$staff$md$),
  ($md$envoyer-campagne$md$, $md$kb$md$, $md$Communication$md$, $md$Envoyer une campagne$md$, $md$Trois étapes : contenu, audience, envoi.$md$, $md$1. **Campagnes → Nouvelle campagne**, puis choisissez un modèle.
2. **Contenu** : objets en français et en anglais, préentête, textes. Chaque client reçoit la version de sa langue.
3. **Audience** : tous les clients, vérifiés, non vérifiés, en attente ou entreprises. Les désabonnés sont toujours exclus.
4. **Envoi** : envoyez d'abord un test à une seule adresse (**Adresse du test**), vérifiez sur téléphone et ordinateur, puis envoyez.

Chaque campagne porte un lien de désabonnement, exigé par la loi canadienne anti-pourriel.$md$, 180, $md$staff$md$),
  ($md$banniere-maintenance$md$, $md$kb$md$, $md$Communication$md$, $md$Afficher une bannière ou ouvrir une maintenance$md$, $md$Un message pour tous les clients, ou la suspension des commandes.$md$, $md$Dans **Bannière et maintenance** :

**Bannière** : titre et texte en français et en anglais. **Publier tout de suite** l'affiche sur le site ; **Les clients peuvent la fermer** leur permet de la masquer.

**Maintenance** : message en français et en anglais, **Début** et **Fin prévue**, puis **Activer cette maintenance**. Pendant la maintenance, plus aucune commande ne peut être passée.

L'en-tête de la page montre en permanence ce que les clients voient.$md$, 190, $md$staff$md$),
  ($md$ajouter-membre$md$, $md$kb$md$, $md$Équipe et outils$md$, $md$Ajouter un membre de l'équipe$md$, $md$Donner un rôle à un compte Ooble existant.$md$, $md$La personne crée d'abord un compte Ooble normal sur ooble.ca, avec son adresse professionnelle.

1. **Équipe → Ajouter un membre** (administrateurs).
2. Saisissez le **Courriel du compte** et choisissez le **Rôle**.
3. **Enregistrer**. Le menu du back-office de la personne montre aussitôt les pages de son rôle.

| Rôle | Pages |
| --- | --- |
| Administrateur | Tout |
| Opérateur | File d'attente, Commandes, Clients, Règlement auto, Messagerie |
| Vérification | Vérifications, Messagerie |
| Support | File d'attente, Commandes, Clients, Messagerie |
| Marketing | Messagerie, Campagnes, Bannière, Comptabilité |

Pour retirer un accès : **Retirer**, puis **Confirmer le retrait**. Le compte client de la personne reste intact.$md$, 200, $md$staff$md$),
  ($md$installer-back-office$md$, $md$kb$md$, $md$Équipe et outils$md$, $md$Installer le back-office sur iPhone ou iPad$md$, $md$Le back-office s'installe comme une app, sans App Store.$md$, $md$1. Ouvrez ooble.ca/admin dans Safari et connectez-vous.
2. Touchez **Partager**, puis **Sur l'écran d'accueil**.
3. Ouvrez Ooble depuis l'écran d'accueil : le back-office s'affiche en plein écran.

Sur ordinateur, Chrome et Edge proposent aussi **Installer** dans la barre d'adresse.$md$, 210, $md$staff$md$),
  ($md$verifier-sauvegarde$md$, $md$kb$md$, $md$Équipe et outils$md$, $md$Vérifier la sauvegarde de la nuit$md$, $md$Un coup d'œil chaque matin dans Plateforme.$md$, $md$Ouvrez **Plateforme**. L'en-tête indique l'heure de la dernière sauvegarde réussie et le nombre de nuits réussies.

- Coche verte : tout va bien.
- Point d'exclamation corail : la sauvegarde de la nuit a échoué. Prévenez un administrateur le jour même.

Chaque sauvegarde est restaurée automatiquement dans une base vide pour prouver qu'elle est utilisable.$md$, 220, $md$staff$md$),
  ($md$regles-securite$md$, $md$kb$md$, $md$Équipe et outils$md$, $md$Règles de sécurité de l'équipe$md$, $md$Six règles qui protègent les clients et l'argent d'Ooble.$md$, $md$1. La double authentification est activée sur chaque compte de travail.
2. On ne partage jamais un mot de passe, une clé ou un code, même avec un collègue, même par message privé.
3. Une clé privée de portefeuille ne passe jamais par un courriel, un clavardage, WhatsApp ou un document.
4. Ooble ne demande jamais à un client son mot de passe ni ses codes. Un « collègue » qui le demande est une tentative d'hameçonnage.
5. Les pièces d'identité ne quittent jamais le back-office : pas de capture d'écran, pas de téléchargement sur un appareil personnel ou dans un nuage.
6. Au moindre doute (lien étrange, demande urgente d'argent, connexion inconnue), on s'arrête et on prévient un administrateur.$md$, 230, $md$staff$md$),
  ($md$manuel-a-propos$md$, $md$manual$md$, $md$Manuel$md$, $md$À propos de ce manuel$md$, $md$Objet, diffusion, règle sur les secrets et mise à jour.$md$, $md$Ce manuel est la référence pour faire fonctionner Ooble : il dit où se trouve chaque pièce, à quoi elle sert et comment intervenir. Il s'adresse à la direction, à l'agent de conformité et à toute l'équipe. La documentation technique, réservée aux administrateurs, complète ce manuel pour la partie informatique.

**Diffusion.** Document interne et confidentiel, visible seulement dans le back-office.

**Règle absolue sur les secrets.** Ce manuel et la documentation nomment chaque mot de passe, clé et jeton, disent où il est rangé et comment le remplacer, mais n'en contiennent jamais la valeur. Un document se copie et se transfère : une clé écrite ici serait une clé exposée.

- Clés des fonctions serveur : **Supabase → Edge Functions → Secrets**.
- Clés des automatisations : **GitHub → Settings → Secrets and variables → Actions**.
- Mots de passe des comptes (Supabase, Vercel, GitHub, Resend, banque, domaine) : gestionnaire de mots de passe de la direction, double authentification activée.
- La phrase secrète des sauvegardes n'est connue que du fondateur et n'est écrite nulle part en ligne.

**Mise à jour.** Toute modification de la plateforme s'accompagne d'une mise à jour de ce manuel le jour même. Les administrateurs modifient les chapitres directement ici (bouton **Modifier**).$md$, 10, $md$staff$md$),
  ($md$manuel-ooble-en-bref$md$, $md$manual$md$, $md$Manuel$md$, $md$Ooble en bref$md$, $md$Ce que fait Ooble, son statut, ses produits et ses règles d'opération.$md$, $md$Ooble achète et vend de l'USDT contre des dollars canadiens, payés par virement Interac, pour des particuliers et des entreprises du Québec. Ooble Technologies est une entreprise de services monétaires **inscrite auprès du CANAFE** sous le numéro **N300001729**.

| Produit | Ce que fait le client | Ce que fait Ooble |
| --- | --- | --- |
| Achat | Paie en CAD par Interac, donne une adresse USDT | Envoie les USDT sur le réseau choisi |
| Vente | Envoie des USDT à l'adresse de dépôt d'Ooble | Verse les CAD par Interac |
| Desk OTC | Demande un devis pour un gros volume (page /otc) | Traite la demande à la main |
| Entreprises | Ouvre un compte d'entreprise (page /entreprises) | Vérifie l'entreprise, puis mêmes opérations |

## Règles d'opération

- 100 $ minimum par commande (2 $ pour les tests de l'équipe).
- 9 999 $ au total sur 24 heures glissantes, achats et ventes comptés séparément.
- Même taux quel que soit le montant : marché plus 2 %.
- Réseaux actifs : Tron (TRC20), BNB Chain (BEP20), Polygon, Solana. Ethereum et Avalanche sont retirés.

## Adresses courriel

| Adresse | Usage |
| --- | --- |
| bonjour@ooble.ca | Expéditeur des courriels aux clients |
| support@ooble.ca | Questions des clients, lues dans la boîte habituelle de l'équipe |
| otc@ooble.ca | Desk des gros volumes |
| interac@ooble.ca | Reçoit les virements Interac des clients, et rien d'autre |$md$, 20, $md$staff$md$),
  ($md$manuel-parcours-client$md$, $md$manual$md$, $md$Manuel$md$, $md$Parcours client$md$, $md$Inscription, vérification, achat, vente et états d'une commande.$md$, $md$## Inscription et vérification

1. Le client choisit un compte individuel ou d'entreprise et confirme son courriel. Les adresses jetables sont refusées.
2. Il vérifie son identité avec Sumsub depuis l'app ; le résultat revient automatiquement.
3. Une entreprise fournit en plus ses documents, examinés par l'équipe.
4. Aucune commande n'est acceptée sans identité vérifiée, sauf pour l'équipe.

## Achat

1. Le client choisit le montant, le réseau et son adresse ; le taux est fixé à la création.
2. Il envoie un virement Interac à interac@ooble.ca, du montant exact, avec la référence `OOB-XXXXXXXX`.
3. L'avis Interac est lu, sa signature vérifiée et rapproché de la commande : « paiement reçu ».
4. Sous le seuil, les USDT partent automatiquement ; sinon la commande attend dans la File d'attente.
5. À la confirmation sur la blockchain, la commande est terminée ; le client reçoit un courriel et une notification.

## Vente

1. Le client choisit le montant, enregistre sa question et sa réponse de sécurité Interac et reçoit l'adresse de dépôt.
2. Ses USDT sont repérés dans les 2 minutes et rapprochés de la vente.
3. Un opérateur envoie le virement Interac et termine la vente.

## États d'une commande

| Affiché à l'équipe | Sens |
| --- | --- |
| En attente | Le client n'a pas encore payé ou envoyé |
| À traiter | Le paiement est là, il reste à régler |
| Envoi en cours | Transaction partie, confirmation attendue |
| Terminée | Réglée et confirmée |
| Annulée | Abandonnée ou délai dépassé |
| Remboursée | Montant rendu au client |$md$, 30, $md$staff$md$),
  ($md$manuel-back-office$md$, $md$manual$md$, $md$Manuel$md$, $md$Le back-office$md$, $md$Les pages, les rôles et la routine quotidienne.$md$, $md$Le back-office est à l'adresse ooble.ca/admin et s'installe sur iPhone et iPad comme une app. Chaque membre ne voit que les pages de son rôle.

| Page | À quoi elle sert |
| --- | --- |
| Tableau de bord | Volume, inscriptions, état des commandes, attente moyenne |
| File d'attente | Commandes payées à régler |
| Commandes | Toutes les commandes, filtres, export, historique |
| Règlement auto | Portefeuilles chauds, avis Interac, envois d'USDT, dépôts des ventes |
| Clients | Annuaire, fiche client, origine des inscriptions |
| Vérifications | Identité des particuliers et des entreprises |
| Comptabilité | Volume et revenus par mois et par réseau, export |
| Conformité | Alertes, déclarations, registre, programme |
| Messagerie | Messages du site, envois de l'équipe, modèles |
| Campagnes | Courriels à tous les clients ou à un segment |
| Bannière et maintenance | Message sur le site, suspension des commandes |
| Équipe | Membres, rôles, journal d'audit |
| Plateforme | Lancement, sauvegardes, registre |
| Ressources | Base de connaissances, manuel, documentation technique |

## Routine quotidienne

- [ ] Régler chaque commande « À traiter » de la File d'attente.
- [ ] Verser les ventes en attente.
- [ ] Vérifier les soldes dans Règlement auto.
- [ ] Examiner les alertes de Conformité.
- [ ] Répondre aux messages non lus.
- [ ] Contrôler la sauvegarde de la nuit dans Plateforme.

Chaque action de l'équipe est horodatée dans le journal d'audit, qui ne peut être ni modifié ni effacé.$md$, 40, $md$staff$md$),
  ($md$manuel-reglement$md$, $md$manual$md$, $md$Manuel$md$, $md$Règlement automatique$md$, $md$Comment un achat est réglé sans intervention, et ses garde-fous.$md$, $md$Un achat payé par Interac est réglé sans intervention quand l'envoi automatique est actif et que le montant est sous le plafond par commande. Les réglages sont dans **Règlement auto**.

## Lecture des virements Interac

1. Interac écrit à interac@ooble.ca pour chaque virement reçu.
2. Un programme chez Cloudflare transmet l'avis tel quel, en garde une copie dans Gmail.
3. La signature d'Interac est vérifiée ; l'avis est rapproché de sa commande.
4. Un avis sans commande reste visible à l'équipe pour traitement à la main.

## Garde-fous

- Un seul envoi actif par commande et un seul envoi à la fois par réseau.
- Solde vérifié avant chaque envoi ; transaction enregistrée avant d'être diffusée.
- Une issue incertaine bloque l'envoi jusqu'à vérification humaine.
- Un envoi qui n'a pas pu partir est repris automatiquement chaque minute.
- Plafond par commande et plafond sur 24 heures.

Le portefeuille chaud ne garde que le fonds de roulement.$md$, 50, $md$staff$md$),
  ($md$manuel-courriels$md$, $md$manual$md$, $md$Manuel$md$, $md$Courriels et messagerie$md$, $md$Ce qui part, d'où, et où arrivent les réponses.$md$, $md$Tous les courriels partent de bonjour@ooble.ca par le service Resend, dans la langue de chaque client. L'offre actuelle permet **100 envois par jour** pour tout Ooble.

| Type | Exemples | Qui l'envoie |
| --- | --- | --- |
| Transactionnel | Commande créée, paiement reçu, USDT envoyés | Automatique |
| Message de l'équipe | Réponse à un client | Messagerie |
| Campagne | Nouveauté, annonce | Campagnes |

## Messagerie

- **Réception** : uniquement les messages laissés sur les pages Contact et OTC du site.
- **Envoyés** : tous les courriels écrits depuis le back-office, de tous les appareils.
- Les courriels écrits à support@ooble.ca ou otc@ooble.ca, et les réponses des clients, arrivent dans la boîte habituelle de l'équipe.

Les campagnes portent un lien de désabonnement (loi canadienne anti-pourriel). Un test part vers une seule adresse à la fois.$md$, 60, $md$staff$md$),
  ($md$manuel-conformite$md$, $md$manual$md$, $md$Manuel$md$, $md$Conformité CANAFE$md$, $md$Surveiller, déclarer, conserver et tenir le programme de conformité.$md$, $md$Ooble a quatre obligations : surveiller les opérations, déclarer au CANAFE, conserver les documents 5 ans et tenir un programme de conformité. Les règles ont été vérifiées sur fintrac-canafe.canada.ca le 8 octobre 2026.

| Déclaration | Quand | Délai |
| --- | --- | --- |
| DOIMV | 10 000 $ ou plus reçus en monnaie virtuelle, en une fois ou par une même personne en 24 heures (chez Ooble : la vente) | 5 jours ouvrables |
| DOT | Motifs raisonnables de soupçonner un blanchiment ou un financement du terrorisme | Dès que possible |
| DBT | Biens d'une personne ou d'un groupe terroriste inscrit | Immédiatement |

**Surveillance.** Toutes les 10 minutes, l'analyse automatique vérifie le seuil DOIMV, la règle des 24 heures, les montants juste sous le seuil, le fractionnement et les paiements de tiers. Une alerte est un signal à examiner, jamais une déclaration automatique.

**Conservation.** Opérations, identités, avis Interac, envois d'USDT et déclarations : au moins 5 ans. Une commande payée ne peut plus être supprimée.

**Programme.** 22 points en 7 thèmes : inscription CANAFE, agent de conformité, politiques et procédures, évaluation des risques, formation du personnel, examen indépendant (tous les deux ans), contrôles continus. Chaque point coché garde qui l'a coché, quand, et la preuve.

> Le client ne doit jamais apprendre qu'une alerte ou une déclaration le concerne.$md$, 70, $md$staff$md$),
  ($md$manuel-incidents$md$, $md$manual$md$, $md$Manuel$md$, $md$Procédures d'incident$md$, $md$Arrêter les pertes d'abord, comprendre ensuite.$md$, $md$Devant un incident, on suspend d'abord, on cherche la cause ensuite. Chaque incident est noté dans le journal des incidents (chapitre « Décisions et incidents »).

| Situation | Premiers gestes | Ensuite |
| --- | --- | --- |
| Il faut arrêter les commandes | Bannière et maintenance → activer une maintenance | Fermer la maintenance une fois réglé |
| Clé de portefeuille chaud exposée | Suspendre l'envoi automatique ; déplacer le solde vers un portefeuille neuf | Un administrateur remplace la clé |
| Autre clé ou mot de passe exposé | Révoquer chez le fournisseur, en créer un nouveau | Le poser à son emplacement, vérifier le service |
| Envoi d'USDT à vérifier | Ne pas relancer ; vérifier sur l'explorateur | Confirmer ou relancer selon la blockchain |
| Virement Interac sans commande | Retrouver le client | Rattacher ou rembourser |
| Portefeuille chaud à court | Les achats attendent, repris chaque minute | Approvisionner |
| Soupçon de fraude | Ne rien dire au client ; geler ses commandes | Agent de conformité : examen, puis DOT |
| Panne d'un fournisseur | Vérifier sa page d'état ; bannière d'information | Attendre le rétablissement |
| Quota de courriels atteint | Les courriels du jour attendent | Passer à l'offre supérieure si cela se répète |
| Perte de données | Activer une maintenance | Restaurer la dernière sauvegarde réussie |$md$, 80, $md$staff$md$),
  ($md$manuel-redaction$md$, $md$manual$md$, $md$Manuel$md$, $md$Règles de rédaction et glossaire$md$, $md$Les formulations obligatoires et les mots du métier.$md$, $md$## Règles de rédaction

- Toujours « inscrite auprès du CANAFE », jamais « approuvée » ni « autorisée ».
- Courriels automatiques : adresse réduite à « Québec · Canada ».
- Pied de page du site : le drapeau et « FINTRAC N300001729 », rien d'autre.
- Chaque texte du site existe en français et en anglais.

## Glossaire

| Terme | Sens |
| --- | --- |
| CANAFE (FINTRAC) | Centre d'analyse des opérations et déclarations financières du Canada |
| LRPCFAT | Loi sur le recyclage des produits de la criminalité et le financement des activités terroristes |
| DOIMV, DOT, DBT | Déclarations au CANAFE |
| KYC, KYB | Vérification d'identité d'un client, d'une entreprise |
| USDT | Jeton numérique adossé au dollar américain |
| TRC20, BEP20 | Normes de jetons sur Tron et sur BNB Chain |
| Portefeuille chaud | Portefeuille dont la clé est en ligne pour les envois automatiques |
| OTC | Desk des gros volumes, traités sur devis |$md$, 90, $md$staff$md$),
  ($md$manuel-decisions$md$, $md$manual$md$, $md$Manuel$md$, $md$Décisions et incidents$md$, $md$Les décisions en vigueur et le journal des incidents.$md$, $md$## Décisions en vigueur

| Date | Décision |
| --- | --- |
| 12 oct. 2026 | La Messagerie ne montre plus que les messages du site |
| 8 oct. 2026 | Conformité en base : alertes, déclarations, programme, registre |
| Oct. 2026 | Ethereum et Avalanche retirés |
| Oct. 2026 | 100 $ minimum, 9 999 $ sur 24 heures, taux unique |
| En attente | Captcha à l'inscription : non activé |
| En attente | Frais du réseau Tron : inchangés jusqu'à décision |
| En attente | Ouverture des vérifications et des commandes |

## Journal des incidents

| Date | Incident | Effet | Cause | Corrigé par |
| --- | --- | --- | --- | --- |
| — | Aucun incident enregistré | | | |$md$, 100, $md$staff$md$),
  ($md$tech-architecture$md$, $md$tech$md$, $md$Documentation technique$md$, $md$Architecture$md$, $md$Vercel sert les pages, Supabase garde les données et exécute tout ce qui touche à l'argent.$md$, $md$Ooble est une seule application web. Le navigateur ne parle qu'à Supabase, avec la clé publique ; seules les fonctions serveur détiennent les clés des fournisseurs et des portefeuilles.

| Couche | Contenu |
| --- | --- |
| Clients et équipe | ooble.ca (site), /app (clients), /admin (back-office), installables sur téléphone |
| Vercel | Hébergement, mise en ligne à chaque envoi sur `main` du dépôt `ooble27/Ooble-` |
| Supabase | Postgres (39 tables, RLS partout), Auth, Storage (pièces d'identité), 13 fonctions edge, pg_cron |
| Fournisseurs | Interac via Cloudflare, blockchains, Resend, Sumsub, CoinGecko, Anthropic |

- **Code** : React 18, TypeScript, Vite, Tailwind, React Router, Supabase JS.
- **Pages publiques** pré-rendues pour le référencement, en français et sous `/en` en anglais.
- **Fichiers** : stockage privé de Supabase, lisible par l'équipe autorisée seulement.$md$, 10, $md$admin$md$),
  ($md$tech-services$md$, $md$tech$md$, $md$Documentation technique$md$, $md$Services externes$md$, $md$Les fournisseurs, leur rôle et leur repère.$md$, $md$| Service | Rôle | Repère |
| --- | --- | --- |
| Supabase | Base, comptes, fichiers, fonctions, tâches planifiées | Projet `uukxacjjviiktmbikdwp` |
| Vercel | Hébergement du site, de l'app et du back-office | Déploie `ooble27/Ooble-` |
| GitHub | Code et automatisations | `ooble27/Ooble-` (production), `ooble27/ooble-backcup` (copie) |
| Resend | Courriels | Domaine ooble.ca, 100 envois par jour |
| Sumsub | Vérification d'identité et d'entreprise | `SUMSUB_LEVEL_NAME` |
| Cloudflare | DNS, Worker d'interac@ooble.ca, stockage R2 des sauvegardes | `cloudflare/interac-email-worker` |
| TronGrid | Réseau Tron | `TRONGRID_API_KEY` |
| Nœuds publics BNB, Polygon | Lecture et envoi | Remplaçables par `RPC_BEP20`, `RPC_POLYGON` |
| CoinGecko | Taux USDT/CAD | Fonction `refresh-rate` |
| Anthropic | Assistants IA du back-office | `ANTHROPIC_API_KEY` |
| Gmail | Copie des avis Interac, boîte de l'équipe | support@ et otc@ |

À compléter par la direction : registraire du domaine, banque et compte Interac d'entreprise, téléphonie.$md$, 20, $md$admin$md$),
  ($md$tech-secrets$md$, $md$tech$md$, $md$Documentation technique$md$, $md$Secrets et accès$md$, $md$Le nom et l'emplacement de chaque secret, jamais sa valeur.$md$, $md$Pour changer un secret : générer la nouvelle valeur chez le fournisseur, la poser à son emplacement, vérifier le service, puis révoquer l'ancienne.

## Fonctions serveur (Supabase → Edge Functions → Secrets)

| Secret | Sert à |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` | Accès à la base (fournis par Supabase) |
| `PAYOUT_TRON_KEY` | Clé privée du portefeuille chaud Tron |
| `PAYOUT_EVM_KEY` | Clé privée du portefeuille chaud BNB Chain et Polygon |
| `TRONGRID_API_KEY` | Accès au réseau Tron |
| `RPC_BEP20`, `RPC_POLYGON` | Nœuds privés (facultatifs) |
| `RESEND_API_KEY` | Envoi des courriels |
| `EMAIL_FROM`, `EMAIL_ASSET_BASE`, `COMPANY_*` | Expéditeur, images, coordonnées des courriels |
| `STAFF_NOTIFICATION_EMAIL` | Alerte à chaque message du site |
| `SITE_URL` | Adresse du site dans les liens |
| `SUMSUB_APP_TOKEN`, `SUMSUB_SECRET_KEY`, `SUMSUB_LEVEL_NAME` | Sessions de vérification |
| `SUMSUB_WEBHOOK_SECRET` | Authentifie les retours de Sumsub |
| `INTERAC_INGEST_SECRET` | Authentifie le Worker Cloudflare |
| `MAIL_WEBHOOK_SECRET` | Authentifie l'ancien canal des courriels entrants |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Notifications sur téléphone |
| `ANTHROPIC_API_KEY` | Assistants IA |

## Automatisations (GitHub → ooble27/Ooble- → Settings → Secrets and variables → Actions)

| Secret | Sert à |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | Déployer les fonctions, poser des secrets |
| `SUPABASE_DB_URL`, `SUPABASE_DB_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY` | Lire la base pour la sauvegarde |
| `BACKUP_PASSPHRASE` | Chiffrer les sauvegardes (connue du seul fondateur) |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Copie des sauvegardes chez Cloudflare R2 |
| `CLOUDFLARE_API_TOKEN` | Installer le Worker d'interac@ooble.ca |

## Site (Vercel → Settings → Environment Variables)

`VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`, publiques par conception : la sécurité repose sur les règles RLS.

## À surveiller

- La clé Google Text-to-Speech des voix des vidéos a été exposée : la remplacer dans Google Cloud et révoquer l'ancienne.
- Une clé de portefeuille exposée n'est jamais réutilisée : nouveau portefeuille, transfert du solde, puis nouvelle clé.$md$, 30, $md$admin$md$),
  ($md$tech-base-de-donnees$md$, $md$tech$md$, $md$Documentation technique$md$, $md$Base de données$md$, $md$39 tables, toutes protégées par RLS ; rôles, migrations et tâches planifiées.$md$, $md$| Domaine | Tables |
| --- | --- |
| Clients | `profiles`, `saved_recipients`, `signup_origins`, `account_closures`, `push_subscriptions`, `marketing_optout`, `blocked_email_domains` |
| Vérifications | `kyc_verifications`, `business_verifications` |
| Commandes | `orders`, `order_events`, `payment_confirmations`, `exchange_rates` |
| Règlement | `interac_receipts`, `usdt_payouts`, `payout_locks`, `settlement_settings`, `chain_deposits`, `chain_scan_state`, `blockchain_transactions` |
| Trésorerie | `treasury_addresses`, `treasury_movements`, `treasury_balance_snapshots`, `treasury_alert_config` |
| Conformité | `compliance_alerts`, `compliance_declarations`, `compliance_checklist`, `compliance_flags`, `admin_audit_log` |
| Communication | `mail_threads`, `mail_messages`, `announcements`, `maintenance_windows` |
| Plateforme | `user_roles`, `platform_state`, `backup_runs`, `ai_calls`, `ai_alerts`, `kb_articles` |

## Rôles

Un membre de l'équipe a une ou plusieurs lignes dans `user_roles` (`admin`, `operator`, `kyc_reviewer`, `support`, `marketing`). Les règles d'accès appellent `has_role(uid, role)` et `is_staff(uid)`.

## Migrations

Chaque changement de structure est un fichier daté dans `supabase/migrations/`, écrit pour pouvoir être rejoué sans erreur, appliqué en production puis conservé dans le dépôt.

## Tâches planifiées (pg_cron)

| Tâche | Fréquence | Effet |
| --- | --- | --- |
| `drain-usdt-payouts` | Chaque minute | Reprend les envois d'USDT en attente |
| `reconcile-usdt-payouts` | Toutes les 2 minutes | Confirme les envois sur la blockchain |
| `sell-watch` | Toutes les 2 minutes | Détecte les USDT reçus pour les ventes |
| `compliance-scan` | Toutes les 10 minutes | Crée les alertes de conformité |

## Données jamais effacées

Comptes, vérifications, pièces d'identité, adresses enregistrées, commandes et registres de conformité. Une fermeture de compte est une marque dans `account_closures`.$md$, 40, $md$admin$md$),
  ($md$tech-fonctions$md$, $md$tech$md$, $md$Documentation technique$md$, $md$Fonctions serveur$md$, $md$Les 13 fonctions edge, leur déclencheur et leur protection.$md$, $md$| Fonction | Ce qu'elle fait | Déclenchée par |
| --- | --- | --- |
| `usdt-payout` | Envoie les USDT, reprend la file, confirme sur la blockchain | interac-ingest, équipe, pg_cron |
| `interac-ingest` | Vérifie la signature DKIM d'un avis Interac et le rapproche | Worker Cloudflare |
| `sell-watch` | Repère les USDT reçus et les rapproche des ventes | pg_cron |
| `send-email` | Courriels transactionnels, équipe, campagnes, formulaires du site | App, back-office, site |
| `mail-webhook` | Ancien canal des courriels entrants ; garde sans afficher | Resend |
| `order-notify` | Notification quand une commande change d'état | Déclencheur en base |
| `push-notify` | Envoi des notifications Web Push | Back-office, base |
| `sumsub-token` | Ouvre une session de vérification | App client |
| `sumsub-webhook` | Enregistre le résultat d'une vérification | Sumsub |
| `refresh-rate` | Met à jour le taux USDT/CAD | Tâche planifiée |
| fermeture de compte | Ferme le compte sans effacer le dossier | App client |
| `reset-test-data` | Remise à zéro des données de test ; refusée depuis le lancement | Plateforme |
| `ai-assist` | Assistants IA, chaque appel journalisé dans `ai_calls` | Back-office |

## Déploiement

Onze fonctions sont redéployées automatiquement par le workflow « Déploiement fonctions edge Supabase » à chaque envoi sur `main` qui touche `supabase/functions/`. `sumsub-token` et `refresh-rate` se déploient à la main :

```
supabase functions deploy <nom> --project-ref uukxacjjviiktmbikdwp
```

Journaux : Supabase → Edge Functions → la fonction → Logs.$md$, 50, $md$admin$md$),
  ($md$tech-sauvegardes$md$, $md$tech$md$, $md$Documentation technique$md$, $md$Sauvegardes et restauration$md$, $md$Sauvegarde chiffrée chaque nuit, restaurée automatiquement pour prouver qu'elle marche.$md$, $md$Chaque nuit à 3 h 17 (heure de l'Est), le workflow « Sauvegarde nocturne » copie la base et tous les fichiers, les chiffre en AES-256, les publie dans les Releases privées de `ooble27/Ooble-`, puis les restaure dans une base vide. Guide complet : `docs/SAUVEGARDES.md`.

| Élément | Détail |
| --- | --- |
| Contenu | Schéma `public`, comptes, index des fichiers, tâches planifiées, pièces d'identité |
| Conservation | 30 dernières nuits, le 1er de chaque mois pendant 13 mois, le 1er janvier pendant 6 ans |
| Preuve | `backup_runs`, visible dans Plateforme ; courriel de GitHub en cas d'échec |
| Consultation | ooble.ca/admin/sauvegarde : ouvre une archive dans le navigateur |

## Restaurer

1. Télécharger l'archive `.tar.gz.gpg`, la déchiffrer avec la phrase secrète, contrôler `SHA256SUMS`.
2. Restaurer dans l'ordre : `db/auth-data.sql`, `db/public.dump`, index des fichiers, tâches planifiées.
3. Remettre les fichiers dans le stockage.
4. Redéployer les fonctions, reposer leurs secrets, mettre à jour l'adresse et la clé publique dans Vercel.

> Une archive déchiffrée contient des pièces d'identité : la déchiffrer dans un dossier non synchronisé (ni iCloud ni autre nuage) et l'effacer après la restauration.$md$, 60, $md$admin$md$),
  ($md$tech-deploiement$md$, $md$tech$md$, $md$Documentation technique$md$, $md$Déploiement et publication$md$, $md$Deux dépôts, Vercel, workflows et vérifications avant publication.$md$, $md$| Dépôt | Rôle |
| --- | --- |
| `ooble27/Ooble-` | Production : Vercel, fonctions, sauvegardes. Seul dépôt avec les secrets |
| `ooble27/ooble-backcup` | Copie de travail du même code ; ses workflows ne s'exécutent pas |

## Avant chaque publication

1. `npx tsc --noEmit` et `npx eslint` sur les fichiers modifiés.
2. `npx vite build` (rendu des pages publiques compris).
3. Test sur téléphone, tablette et ordinateur, thèmes clair et sombre.
4. Migration de base appliquée en production avant le code qui en dépend.
5. Même changement dans les deux dépôts ; vérifier que Vercel affiche « Ready ».

## Annuler une publication

Vercel → Deployments → version précédente → « Promote to Production ».

## Workflows

| Workflow | Quand | Effet |
| --- | --- | --- |
| Déploiement fonctions edge Supabase | Envoi sur `main` touchant `supabase/functions/` | Redéploie 11 fonctions |
| Sauvegarde nocturne | Chaque nuit, 3 h 17 | Sauvegarde, chiffre, teste la restauration |
| Installation du Worker Interac | À la main | Pose le secret partagé et déploie le Worker |$md$, 70, $md$admin$md$),
  ($md$tech-configuration$md$, $md$tech$md$, $md$Documentation technique$md$, $md$Interrupteurs de configuration$md$, $md$Les réglages du fichier src/lib/config.ts et leur effet.$md$, $md$| Réglage | Valeur | Effet |
| --- | --- | --- |
| `TRADING_ENABLED` | `false` | Bloque ou permet la création de toute commande |
| `VERIFICATION_ENABLED` | `false` | Bouton de vérification d'identité désactivé |
| `OTC_ENABLED` | `false` | Formulaire OTC de l'app réservé à l'équipe (la page /otc reste publique) |
| `TRADE_MIN_CAD` | 100 | Minimum par commande |
| `STAFF_TEST_MIN_CAD` | 2 | Minimum pour les tests de l'équipe |
| `TRADE_DAILY_MAX_CAD` | 9 999 | Maximum sur 24 heures glissantes |
| `OOBLE_INTERAC_EMAIL` | interac@ooble.ca | Destinataire des virements des clients |

Les limites sont aussi appliquées en base (migration `20261007030000_flat_rate_sell_limits.sql`, qui fait autorité). Changer une valeur demande une publication.

Les réglages du règlement automatique (envoi automatique, plafonds) sont en base, dans `settlement_settings`, et se modifient dans **Règlement auto**.$md$, 80, $md$admin$md$)
on conflict (slug) do nothing;

